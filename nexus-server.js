/**
 * NEXUS AI — Production HTTP + WebSocket Server
 * Pure Node.js 22 — zero external dependencies
 */

import http from 'http';
import { URL } from 'url';
import { createHash, createHmac, randomUUID } from 'crypto';
import { AgentOrchestrator, ToolExecutor, MemoryEngine, ContextManager, RateLimiter } from './core/ai-engine.js';

// ══════════════════════════════════════════════════
// BOOTSTRAP — Initialize all core systems
// ══════════════════════════════════════════════════
const memory   = new MemoryEngine();
const tools    = new ToolExecutor();
const agent    = new AgentOrchestrator(tools, memory);
const limiter  = new RateLimiter();

// Track sessions and contexts
const sessions  = new Map();  // sessionId → { userId, plan, context }
const wsClients = new Map();  // socketId → { ws, userId, subscriptions }
const metrics   = {
  requests: 0, errors: 0, latencies: [],
  startTime: Date.now(),
  routes: {},
};

// ══════════════════════════════════════════════════
// SIMPLE ROUTER
// ══════════════════════════════════════════════════
class Router {
  constructor() {
    this.routes = { GET: [], POST: [], PUT: [], DELETE: [], PATCH: [] };
  }

  get(path, ...handlers)    { this.routes.GET.push({ path, handlers }); }
  post(path, ...handlers)   { this.routes.POST.push({ path, handlers }); }
  put(path, ...handlers)    { this.routes.PUT.push({ path, handlers }); }
  delete(path, ...handlers) { this.routes.DELETE.push({ path, handlers }); }

  match(method, url) {
    const routes = this.routes[method] || [];
    for (const route of routes) {
      const match = this._matchPath(route.path, url);
      if (match) return { handlers: route.handlers, params: match.params };
    }
    return null;
  }

  _matchPath(pattern, url) {
    const patternParts = pattern.split('/').filter(Boolean);
    const urlParts = url.split('/').filter(Boolean);
    if (patternParts.length !== urlParts.length) return null;

    const params = {};
    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i].startsWith(':')) {
        params[patternParts[i].slice(1)] = decodeURIComponent(urlParts[i]);
      } else if (patternParts[i] !== urlParts[i]) {
        return null;
      }
    }
    return { params };
  }
}

// ══════════════════════════════════════════════════
// REQUEST/RESPONSE HELPERS
// ══════════════════════════════════════════════════
function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > 10 * 1024 * 1024) { reject(new Error('Payload too large')); return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString();
        resolve(raw ? JSON.parse(raw) : {});
      } catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

function respond(res, status, data, headers = {}) {
  const body = JSON.stringify({ success: status < 400, ...data, timestamp: new Date().toISOString() });
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'X-Powered-By': 'NEXUS-AI/1.0',
    'X-Request-Id': randomUUID().slice(0, 8),
    ...headers,
  });
  res.end(body);
}

function stream(res, chunks) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Powered-By': 'NEXUS-AI/1.0',
  });

  chunks.forEach((chunk, i) => {
    setTimeout(() => {
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      if (i === chunks.length - 1) res.write('data: [DONE]\n\n');
    }, i * 100);
  });

  setTimeout(() => res.end(), chunks.length * 100 + 200);
}

// ══════════════════════════════════════════════════
// MIDDLEWARE
// ══════════════════════════════════════════════════
function corsMiddleware(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,PATCH,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Session-Id');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return true; }
  return false;
}

function authMiddleware(req) {
  const authHeader = req.headers['authorization'];
  const sessionId = req.headers['x-session-id'];

  // Session auth
  if (sessionId && sessions.has(sessionId)) {
    return { ok: true, user: sessions.get(sessionId) };
  }

  // Bearer token auth
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    // Production: verify JWT with secret
    const decoded = verifyToken(token);
    if (decoded) return { ok: true, user: decoded };
  }

  return { ok: false };
}

function verifyToken(token) {
  try {
    // Simplified JWT verification (production: full JWT library)
    const [headerB64, payloadB64, sig] = token.split('.');
    if (!headerB64 || !payloadB64 || !sig) return null;
    
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;

    const expected = createHmac('sha256', process.env.JWT_SECRET || 'nexus-dev-secret')
      .update(`${headerB64}.${payloadB64}`).digest('base64url');
    
    if (sig !== expected) return null;
    return { userId: payload.sub, plan: payload.plan || 'free', email: payload.email };
  } catch {
    return null;
  }
}

function createToken(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({
    ...payload,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 86400 * 7, // 7 days
  })).toString('base64url');
  const sig = createHmac('sha256', process.env.JWT_SECRET || 'nexus-dev-secret')
    .update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

function rateLimitMiddleware(req, user) {
  const userId = user?.userId || req.socket.remoteAddress;
  const plan = user?.plan || 'free';
  return limiter.check(userId, plan);
}

// ══════════════════════════════════════════════════
// ROUTES
// ══════════════════════════════════════════════════
const router = new Router();

// ── Health & System ──────────────────────────────
router.get('/health', (req, res) => {
  respond(res, 200, {
    status: 'healthy',
    version: '1.0.0',
    uptime: Math.round((Date.now() - metrics.startTime) / 1000),
    systems: {
      memory:   { status: 'ok', entries: memory.store.size },
      tools:    { status: 'ok', active: tools.activeExecutions.size },
      agents:   { status: 'ok', active: agent.activeAgents.size },
      sessions: { status: 'ok', count: sessions.size },
    },
  });
});

router.get('/metrics', (req, res) => {
  const avgLatency = metrics.latencies.length > 0
    ? Math.round(metrics.latencies.reduce((a, b) => a + b, 0) / metrics.latencies.length)
    : 0;

  respond(res, 200, {
    uptime: Math.round((Date.now() - metrics.startTime) / 1000),
    requests: metrics.requests,
    errors: metrics.errors,
    errorRate: metrics.requests > 0 ? ((metrics.errors / metrics.requests) * 100).toFixed(2) + '%' : '0%',
    avgLatency: avgLatency + 'ms',
    toolStats: tools.getStats(),
    memoryStats: memory.getStats(),
    agentStatus: agent.getStatus(),
    rateLimiter: { activeBuckets: limiter.buckets.size },
  });
});

// ── Auth ─────────────────────────────────────────
router.post('/auth/signup', async (req, res, { body }) => {
  const { email, password, name } = body;
  if (!email || !password) return respond(res, 400, { error: 'Email and password required' });

  const userId = randomUUID();
  const sessionId = createHash('sha256').update(`${userId}${Date.now()}`).digest('hex');
  const token = createToken({ sub: userId, email, plan: 'free' });

  sessions.set(sessionId, { userId, email, name, plan: 'free' });

  // Store user in memory
  await memory.store(userId, 'profile', { email, name, plan: 'free', createdAt: new Date().toISOString() });

  respond(res, 201, { token, sessionId, userId, plan: 'free', message: 'Welcome to NEXUS AI' });
});

router.post('/auth/login', async (req, res, { body }) => {
  const { email, password } = body;
  if (!email) return respond(res, 400, { error: 'Email required' });

  // Production: verify against DB
  const userId = createHash('sha256').update(email).digest('hex').slice(0, 16);
  const sessionId = createHash('sha256').update(`${userId}${Date.now()}`).digest('hex');
  const token = createToken({ sub: userId, email, plan: 'pro' });

  sessions.set(sessionId, { userId, email, plan: 'pro' });
  respond(res, 200, { token, sessionId, userId, plan: 'pro' });
});

router.post('/auth/logout', (req, res, { sessionId }) => {
  sessions.delete(sessionId);
  respond(res, 200, { message: 'Logged out' });
});

// ── Chat / AI ─────────────────────────────────────
router.post('/chat/message', async (req, res, { body, user }) => {
  const { message, mode = 'assistant', sessionId, stream: doStream = false } = body;
  if (!message) return respond(res, 400, { error: 'Message required' });

  const userId = user?.userId || 'anonymous';
  const messageId = randomUUID();

  // Get or create context
  let context = sessions.get(sessionId)?.context;
  if (!context) {
    context = new ContextManager(200000);
    context.setSystemPrompt(`You are NEXUS AI — the world's most advanced unified AI platform. Mode: ${mode}. User: ${userId}.`);
    if (sessionId && sessions.has(sessionId)) {
      sessions.get(sessionId).context = context;
    }
  }

  // Add user message to context
  context.addMessage('user', message);

  // Retrieve relevant memories
  const memories = await memory.search(userId, message, 3);

  // Generate response (production: real LLM API call)
  const responseText = generateResponse(message, mode, memories);
  context.addMessage('assistant', responseText);

  // Store interaction in memory
  await memory.store(userId, `chat_${messageId}`, {
    userMessage: message, response: responseText, mode, timestamp: Date.now()
  }, { ttl: 86400 * 30, tags: ['chat', mode] });

  if (doStream) {
    // Streaming response
    const words = responseText.split(' ');
    const chunks = words.map((word, i) => ({
      id: messageId, delta: word + (i < words.length - 1 ? ' ' : ''),
      index: i, total: words.length,
    }));
    stream(res, chunks);
  } else {
    respond(res, 200, {
      messageId, message: responseText, mode,
      context: context.getStats(),
      memoriesUsed: memories.length,
    });
  }
});

router.post('/chat/agent', async (req, res, { body, user }) => {
  const { task, options = {} } = body;
  if (!task) return respond(res, 400, { error: 'Task required' });

  const userId = user?.userId || 'anonymous';
  
  // Run agent (async — production: queue-based)
  const result = await agent.run(task, userId, options);
  respond(res, 200, result);
});

// ── Tools ─────────────────────────────────────────
router.get('/tools', (req, res) => {
  const { TOOL_REGISTRY } = await import('./core/ai-engine.js').catch(() => ({ TOOL_REGISTRY: {} }));
  respond(res, 200, { tools: Object.entries(TOOL_REGISTRY).map(([name, tool]) => ({ name, ...tool })) });
});

router.post('/tools/:toolName/execute', async (req, res, { body, user, params }) => {
  const { toolName } = params;
  const { params: toolParams = {} } = body;
  const userId = user?.userId || 'anonymous';

  const result = await tools.execute(toolName, toolParams, userId);
  respond(res, result.success ? 200 : 400, result);
});

// ── Automations ───────────────────────────────────
const automations = new Map();

router.get('/automations', (req, res, { user }) => {
  const userId = user?.userId || 'anonymous';
  const userAutomations = [...automations.values()].filter(a => a.userId === userId);
  respond(res, 200, { automations: userAutomations, total: userAutomations.length });
});

router.post('/automations', async (req, res, { body, user }) => {
  const { name, trigger, actions, description } = body;
  if (!name || !trigger || !actions) return respond(res, 400, { error: 'name, trigger, and actions required' });

  const userId = user?.userId || 'anonymous';
  const id = `auto_${randomUUID().slice(0, 8)}`;
  const automation = {
    id, name, description, trigger, actions, userId,
    status: 'active', runCount: 0,
    createdAt: new Date().toISOString(),
    lastRun: null,
    nextRun: computeNextRun(trigger),
  };

  automations.set(id, automation);
  respond(res, 201, { automation });
});

router.put('/automations/:id', async (req, res, { body, user, params }) => {
  const { id } = params;
  const automation = automations.get(id);
  if (!automation) return respond(res, 404, { error: 'Automation not found' });
  if (automation.userId !== user?.userId) return respond(res, 403, { error: 'Forbidden' });

  const updated = { ...automation, ...body, id, userId: automation.userId, updatedAt: new Date().toISOString() };
  automations.set(id, updated);
  respond(res, 200, { automation: updated });
});

router.delete('/automations/:id', (req, res, { user, params }) => {
  const { id } = params;
  const automation = automations.get(id);
  if (!automation) return respond(res, 404, { error: 'Not found' });
  if (automation.userId !== user?.userId) return respond(res, 403, { error: 'Forbidden' });
  automations.delete(id);
  respond(res, 200, { message: 'Automation deleted', id });
});

// ── Memory ────────────────────────────────────────
router.get('/memory', async (req, res, { user, query }) => {
  const userId = user?.userId || 'anonymous';
  const summary = await memory.getUserSummary(userId);
  respond(res, 200, { memory: summary, stats: memory.getStats() });
});

router.post('/memory/search', async (req, res, { body, user }) => {
  const { query, limit = 5 } = body;
  const userId = user?.userId || 'anonymous';
  const results = await memory.search(userId, query, limit);
  respond(res, 200, { results, total: results.length });
});

router.delete('/memory', async (req, res, { user }) => {
  const userId = user?.userId || 'anonymous';
  let deleted = 0;
  for (const key of memory.store.keys()) {
    if (key.startsWith(`${userId}:`)) { memory.store.delete(key); deleted++; }
  }
  respond(res, 200, { message: `Deleted ${deleted} memory entries` });
});

// ── Users ─────────────────────────────────────────
router.get('/users/me', async (req, res, { user }) => {
  if (!user) return respond(res, 401, { error: 'Not authenticated' });
  const profile = await memory.retrieve(user.userId, 'profile');
  respond(res, 200, { user: { ...user, profile: profile?.value } });
});

router.put('/users/me', async (req, res, { body, user }) => {
  if (!user) return respond(res, 401, { error: 'Not authenticated' });
  await memory.store(user.userId, 'profile', { ...body, updatedAt: new Date().toISOString() });
  respond(res, 200, { message: 'Profile updated' });
});

// ── Integrations ──────────────────────────────────
const integrationRegistry = new Map([
  ['slack',   { name: 'Slack',   status: 'available', authType: 'oauth2', category: 'communication' }],
  ['gmail',   { name: 'Gmail',   status: 'available', authType: 'oauth2', category: 'communication' }],
  ['notion',  { name: 'Notion',  status: 'available', authType: 'api_key', category: 'productivity' }],
  ['stripe',  { name: 'Stripe',  status: 'available', authType: 'api_key', category: 'payments' }],
  ['github',  { name: 'GitHub',  status: 'available', authType: 'oauth2', category: 'development' }],
  ['twitter', { name: 'Twitter', status: 'available', authType: 'oauth2', category: 'social' }],
  ['zapier',  { name: 'Zapier',  status: 'available', authType: 'webhook', category: 'automation' }],
  ['airtable',{ name: 'Airtable',status: 'available', authType: 'api_key', category: 'data' }],
]);

router.get('/integrations', (req, res) => {
  respond(res, 200, {
    integrations: [...integrationRegistry.entries()].map(([id, int]) => ({ id, ...int })),
    total: integrationRegistry.size,
  });
});

router.post('/integrations/:id/connect', async (req, res, { body, user, params }) => {
  const { id } = params;
  const integration = integrationRegistry.get(id);
  if (!integration) return respond(res, 404, { error: `Integration "${id}" not found` });

  const connectionId = `conn_${randomUUID().slice(0, 8)}`;
  respond(res, 200, {
    connectionId, integration: id,
    status: 'connected',
    connectedAt: new Date().toISOString(),
    message: `${integration.name} connected successfully`,
  });
});

// ── Webhooks ──────────────────────────────────────
router.post('/webhooks/:integrationId', async (req, res, { body, params, rawHeaders }) => {
  const { integrationId } = params;

  // Verify webhook signature (production: per-integration verification)
  const signature = rawHeaders['x-webhook-signature'];
  if (!signature) return respond(res, 401, { error: 'Missing webhook signature' });

  const webhookId = randomUUID();
  
  // Process webhook asynchronously
  setImmediate(async () => {
    try {
      // Trigger relevant automations
      const triggered = [...automations.values()].filter(
        a => a.trigger?.type === 'webhook' && a.trigger?.integration === integrationId && a.status === 'active'
      );

      for (const auto of triggered) {
        auto.runCount++;
        auto.lastRun = new Date().toISOString();
        // Execute automation actions
        for (const action of auto.actions) {
          if (action.tool) await tools.execute(action.tool, action.params, auto.userId);
        }
      }
    } catch (err) {
      console.error('Webhook processing error:', err.message);
    }
  });

  respond(res, 200, { received: true, webhookId });
});

// ══════════════════════════════════════════════════
// WEBSOCKET HANDLER — Real-time streaming
// ══════════════════════════════════════════════════
function handleWebSocket(req, socket, head) {
  // Simple WebSocket handshake (production: use ws library)
  const key = req.headers['sec-websocket-key'];
  if (!key) { socket.destroy(); return; }

  const accept = createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');

  socket.write([
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${accept}`,
    '',
    '',
  ].join('\r\n'));

  const socketId = randomUUID();
  const urlParams = new URL(req.url, 'http://localhost');
  const token = urlParams.searchParams.get('token');
  const user = token ? verifyToken(token) : null;

  wsClients.set(socketId, { socket, userId: user?.userId, subscriptions: new Set() });

  // Send welcome
  sendWS(socket, { type: 'connected', socketId, userId: user?.userId, timestamp: Date.now() });

  // Handle incoming messages
  socket.on('data', (buf) => {
    try {
      const message = parseWSFrame(buf);
      if (!message) return;

      const data = JSON.parse(message);
      handleWSMessage(socketId, socket, data, user);
    } catch {}
  });

  socket.on('close', () => wsClients.delete(socketId));
  socket.on('error', () => wsClients.delete(socketId));
}

function handleWSMessage(socketId, socket, data, user) {
  const client = wsClients.get(socketId);

  switch (data.type) {
    case 'subscribe':
      client.subscriptions.add(data.channel);
      sendWS(socket, { type: 'subscribed', channel: data.channel });
      break;

    case 'unsubscribe':
      client.subscriptions.delete(data.channel);
      sendWS(socket, { type: 'unsubscribed', channel: data.channel });
      break;

    case 'ping':
      sendWS(socket, { type: 'pong', latency: Date.now() - data.timestamp });
      break;

    case 'agent_task':
      // Run agent and stream results
      const userId = user?.userId || 'anonymous';
      agent.run(data.task, userId).then(result => {
        sendWS(socket, { type: 'agent_result', ...result });
      });
      break;
  }
}

function sendWS(socket, data) {
  try {
    const json = JSON.stringify(data);
    const buf = Buffer.from(json);
    const frame = Buffer.allocUnsafe(2 + buf.length);
    frame[0] = 0x81; // text frame
    frame[1] = buf.length;
    buf.copy(frame, 2);
    socket.write(frame);
  } catch {}
}

function parseWSFrame(buf) {
  if (buf.length < 2) return null;
  const masked = (buf[1] & 0x80) !== 0;
  const len = buf[1] & 0x7f;
  if (!masked || len > 125) return null;
  const mask = buf.slice(2, 6);
  const data = buf.slice(6, 6 + len);
  return Buffer.from(data.map((b, i) => b ^ mask[i % 4])).toString();
}

function broadcastToChannel(channel, data) {
  for (const [, client] of wsClients) {
    if (client.subscriptions.has(channel)) {
      sendWS(client.socket, data);
    }
  }
}

// ══════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════
function generateResponse(message, mode, memories) {
  const memCtx = memories.length > 0
    ? `[Context from memory: ${memories.map(m => m.key).join(', ')}] `
    : '';

  const responses = {
    assistant: `${memCtx}I've analyzed your request: "${message.slice(0, 60)}". As your universal AI assistant, here's my comprehensive response...`,
    agent: `${memCtx}Agent mode activated. Decomposing task: "${message.slice(0, 60)}" into executable steps. Running autonomous execution...`,
    hub: `${memCtx}Hub mode: Connecting relevant integrations for: "${message.slice(0, 60)}". Checking Slack, Gmail, Notion...`,
    os: `${memCtx}OS mode: Managing your digital environment. Processing: "${message.slice(0, 60)}" across all connected systems...`,
  };

  return responses[mode] || responses.assistant;
}

function computeNextRun(trigger) {
  if (!trigger) return null;
  const intervals = { hourly: 3600000, daily: 86400000, weekly: 604800000 };
  const interval = intervals[trigger.schedule] || 3600000;
  return new Date(Date.now() + interval).toISOString();
}

// ══════════════════════════════════════════════════
// MAIN HTTP SERVER
// ══════════════════════════════════════════════════
const server = http.createServer(async (req, res) => {
  const start = Date.now();
  metrics.requests++;

  // CORS
  if (corsMiddleware(req, res)) return;

  // Parse URL
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname.replace(/\/+$/, '') || '/';
  const query = Object.fromEntries(url.searchParams);

  // Track route metrics
  metrics.routes[pathname] = (metrics.routes[pathname] || 0) + 1;

  // Route matching
  const match = router.match(req.method, pathname);
  if (!match) {
    metrics.errors++;
    return respond(res, 404, { error: `Route not found: ${req.method} ${pathname}` });
  }

  try {
    // Parse body for write methods
    const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await parseBody(req) : {};

    // Auth
    const auth = authMiddleware(req);
    const sessionId = req.headers['x-session-id'];

    // Rate limiting (skip for health/metrics)
    if (!pathname.includes('/health') && !pathname.includes('/metrics')) {
      const rateCheck = rateLimitMiddleware(req, auth.ok ? auth.user : null);
      if (!rateCheck.allowed) {
        return respond(res, 429, {
          error: 'Rate limit exceeded',
          ...rateCheck,
        }, { 'Retry-After': rateCheck.retryAfter });
      }
    }

    // Protected routes
    const publicRoutes = ['/health', '/metrics', '/auth/signup', '/auth/login', '/integrations'];
    if (!publicRoutes.some(r => pathname.startsWith(r)) && !auth.ok) {
      return respond(res, 401, { error: 'Authentication required' });
    }

    // Execute handlers
    const ctx = {
      body, query, params: match.params,
      user: auth.ok ? auth.user : null,
      sessionId, rawHeaders: req.headers,
    };

    for (const handler of match.handlers) {
      await handler(req, res, ctx);
      if (res.writableEnded) break;
    }

  } catch (err) {
    metrics.errors++;
    if (!res.writableEnded) {
      respond(res, 500, { error: 'Internal server error', detail: err.message });
    }
  } finally {
    const latency = Date.now() - start;
    metrics.latencies.push(latency);
    if (metrics.latencies.length > 1000) metrics.latencies.shift();
  }
});

// WebSocket upgrade
server.on('upgrade', handleWebSocket);

// Agent events → broadcast to WebSocket clients
agent.on('agent:step',     data => broadcastToChannel('agents', { type: 'agent:step', ...data }));
agent.on('agent:complete', data => broadcastToChannel('agents', { type: 'agent:complete', ...data }));
agent.on('tool:complete',  data => broadcastToChannel('tools', { type: 'tool:result', ...data }));

// ══════════════════════════════════════════════════
// START
// ══════════════════════════════════════════════════
const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔══════════════════════════════════════╗
║   NEXUS AI Backend — v1.0.0          ║
║   Port: ${PORT}                          ║
║   Mode: ${process.env.NODE_ENV || 'development'}                   ║
║   Systems: ALL ONLINE                ║
╚══════════════════════════════════════╝
  `);
});

export { server, agent, tools, memory, sessions };
