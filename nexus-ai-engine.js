/**
 * NEXUS AI — Core AI Engine
 * Handles: LLM orchestration, tool calling, streaming, context management
 * Zero external dependencies — pure Node.js 22
 */

import { EventEmitter } from 'events';
import { createHash, randomUUID } from 'crypto';

// ══════════════════════════════════════════════════
// TOOL REGISTRY — Every capability NEXUS can invoke
// ══════════════════════════════════════════════════
const TOOL_REGISTRY = {
  web_search: {
    description: 'Search the web for real-time information',
    parameters: { query: 'string', max_results: 'number?' },
    category: 'research',
    timeout_ms: 5000,
    cost_units: 2,
  },
  run_code: {
    description: 'Execute code in a sandboxed environment',
    parameters: { code: 'string', language: 'string', timeout: 'number?' },
    category: 'computation',
    timeout_ms: 30000,
    cost_units: 5,
  },
  send_email: {
    description: 'Send an email via connected account',
    parameters: { to: 'string', subject: 'string', body: 'string' },
    category: 'communication',
    timeout_ms: 3000,
    cost_units: 1,
  },
  create_automation: {
    description: 'Create a new automation workflow',
    parameters: { name: 'string', trigger: 'object', actions: 'array' },
    category: 'automation',
    timeout_ms: 2000,
    cost_units: 3,
  },
  memory_store: {
    description: 'Store information in long-term user memory',
    parameters: { key: 'string', value: 'any', ttl: 'number?' },
    category: 'memory',
    timeout_ms: 500,
    cost_units: 0,
  },
  memory_retrieve: {
    description: 'Retrieve information from user memory',
    parameters: { key: 'string?', query: 'string?' },
    category: 'memory',
    timeout_ms: 500,
    cost_units: 0,
  },
  calendar_check: {
    description: 'Check calendar availability and events',
    parameters: { date_range: 'object', timezone: 'string?' },
    category: 'integrations',
    timeout_ms: 3000,
    cost_units: 1,
  },
  file_analyze: {
    description: 'Analyze uploaded files (PDF, image, doc)',
    parameters: { file_id: 'string', analysis_type: 'string' },
    category: 'analysis',
    timeout_ms: 15000,
    cost_units: 4,
  },
};

// ══════════════════════════════════════════════════
// CONTEXT WINDOW MANAGER
// Handles token budgeting and context compression
// ══════════════════════════════════════════════════
export class ContextManager {
  constructor(maxTokens = 200000) {
    this.maxTokens = maxTokens;
    this.messages = [];
    this.systemPrompt = '';
    this.tokenCount = 0;
    this.compressionThreshold = 0.85; // compress at 85% capacity
  }

  estimateTokens(text) {
    // ~4 chars per token (conservative estimate)
    return Math.ceil(text.length / 3.5);
  }

  setSystemPrompt(prompt) {
    this.systemPrompt = prompt;
    this.tokenCount = this.estimateTokens(prompt);
  }

  addMessage(role, content, metadata = {}) {
    const tokens = this.estimateTokens(
      typeof content === 'string' ? content : JSON.stringify(content)
    );
    
    // Auto-compress if approaching limit
    if (this.tokenCount + tokens > this.maxTokens * this.compressionThreshold) {
      this._compress();
    }

    const message = {
      id: randomUUID(),
      role,
      content,
      tokens,
      timestamp: Date.now(),
      metadata,
    };

    this.messages.push(message);
    this.tokenCount += tokens;
    return message;
  }

  _compress() {
    // Keep system prompt + last 20 messages + important memories
    const keep = 20;
    if (this.messages.length <= keep) return;

    // Summarize older messages
    const toCompress = this.messages.slice(0, -keep);
    const summary = this._summarizeMessages(toCompress);
    
    // Replace with compressed summary
    this.messages = [
      { role: 'system', content: `[Conversation summary]: ${summary}`, tokens: this.estimateTokens(summary), id: randomUUID(), timestamp: Date.now(), metadata: { compressed: true } },
      ...this.messages.slice(-keep)
    ];

    // Recalculate token count
    this.tokenCount = this.estimateTokens(this.systemPrompt) + 
      this.messages.reduce((sum, m) => sum + m.tokens, 0);
  }

  _summarizeMessages(messages) {
    const topics = new Set();
    const decisions = [];
    
    messages.forEach(m => {
      if (typeof m.content === 'string') {
        // Extract key topics (simplified)
        const words = m.content.split(' ').filter(w => w.length > 6);
        words.slice(0, 3).forEach(w => topics.add(w));
        
        if (m.content.includes('will') || m.content.includes('decided')) {
          decisions.push(m.content.slice(0, 100));
        }
      }
    });

    return `Discussed: ${[...topics].slice(0, 10).join(', ')}. ${decisions.length} decisions made.`;
  }

  getMessages() {
    return this.messages;
  }

  getStats() {
    return {
      messageCount: this.messages.length,
      tokenCount: this.tokenCount,
      utilizationPercent: Math.round((this.tokenCount / this.maxTokens) * 100),
      remainingTokens: this.maxTokens - this.tokenCount,
    };
  }

  reset() {
    this.messages = [];
    this.tokenCount = this.estimateTokens(this.systemPrompt);
  }
}

// ══════════════════════════════════════════════════
// TOOL EXECUTOR — Sandboxed tool execution engine
// ══════════════════════════════════════════════════
export class ToolExecutor extends EventEmitter {
  constructor() {
    super();
    this.executionLog = [];
    this.activeExecutions = new Map();
  }

  async execute(toolName, params, userId) {
    const tool = TOOL_REGISTRY[toolName];
    if (!tool) throw new Error(`Unknown tool: ${toolName}`);

    const executionId = randomUUID();
    const startTime = Date.now();

    this.emit('tool:start', { executionId, toolName, params, userId });

    // Validate parameters — return structured error, not throw
    const validationError = this._validateParams(tool.parameters, params);
    if (validationError) {
      const errEntry = {
        executionId, toolName, userId,
        error: `Invalid params for ${toolName}: ${validationError}`,
        success: false, duration: 0,
        timestamp: new Date().toISOString(),
      };
      this.executionLog.push(errEntry);
      this.activeExecutions.delete(executionId);
      return { success: false, error: errEntry.error, executionId, duration: 0 };
    }

    // Track active execution
    this.activeExecutions.set(executionId, { toolName, startTime, userId });

    try {
      // Execute with timeout
      const result = await Promise.race([
        this._executeImpl(toolName, params),
        this._timeout(tool.timeout_ms, toolName),
      ]);

      const duration = Date.now() - startTime;
      
      const logEntry = {
        executionId,
        toolName,
        params: this._sanitizeParams(params),
        result: result.summary || 'success',
        duration,
        cost: tool.cost_units,
        userId,
        timestamp: new Date().toISOString(),
        success: true,
      };

      this.executionLog.push(logEntry);
      this.emit('tool:complete', logEntry);

      return { success: true, data: result, executionId, duration };

    } catch (error) {
      const duration = Date.now() - startTime;
      const logEntry = {
        executionId, toolName, userId, duration,
        error: error.message, success: false,
        timestamp: new Date().toISOString(),
      };
      
      this.executionLog.push(logEntry);
      this.emit('tool:error', logEntry);
      
      return { success: false, error: error.message, executionId, duration };
    } finally {
      this.activeExecutions.delete(executionId);
    }
  }

  async _executeImpl(toolName, params) {
    // Simulated tool implementations (production: real API calls)
    const impls = {
      web_search: async (p) => ({
        results: [
          { title: `Search result for: ${p.query}`, url: 'https://example.com', snippet: 'Relevant content...' },
          { title: `More about: ${p.query}`, url: 'https://example2.com', snippet: 'Additional info...' },
        ],
        summary: `Found ${p.max_results || 5} results for "${p.query}"`,
      }),

      run_code: async (p) => {
        // Sandboxed execution simulation
        const hash = createHash('sha256').update(p.code).digest('hex').slice(0, 8);
        return {
          output: `[Sandbox ${hash}] Code executed successfully`,
          exitCode: 0,
          executionTime: Math.random() * 2000,
          language: p.language,
          summary: `${p.language} code executed in sandbox`,
        };
      },

      send_email: async (p) => ({
        messageId: `msg_${randomUUID().slice(0, 8)}`,
        status: 'sent',
        to: p.to,
        summary: `Email sent to ${p.to}`,
      }),

      create_automation: async (p) => ({
        automationId: `auto_${randomUUID().slice(0, 8)}`,
        name: p.name,
        status: 'active',
        nextRun: new Date(Date.now() + 3600000).toISOString(),
        summary: `Automation "${p.name}" created and activated`,
      }),

      memory_store: async (p) => ({
        stored: true, key: p.key,
        expiresAt: p.ttl ? new Date(Date.now() + p.ttl * 1000).toISOString() : null,
        summary: `Stored memory: ${p.key}`,
      }),

      memory_retrieve: async (p) => ({
        found: true, key: p.key,
        value: `[Memory content for: ${p.key || p.query}]`,
        relevanceScore: 0.92,
        summary: `Retrieved memory for "${p.key || p.query}"`,
      }),

      calendar_check: async (p) => ({
        available: ['09:00', '14:00', '16:30'],
        busy: [{ time: '10:00-11:00', title: 'Team sync' }],
        summary: 'Calendar checked, 3 free slots found',
      }),

      file_analyze: async (p) => ({
        fileId: p.file_id,
        analysisType: p.analysis_type,
        findings: ['Key insight 1', 'Key insight 2'],
        confidence: 0.94,
        summary: `File analyzed: ${p.analysis_type} complete`,
      }),
    };

    const impl = impls[toolName];
    if (!impl) throw new Error(`No implementation for: ${toolName}`);
    return impl(params);
  }

  _timeout(ms, toolName) {
    return new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Tool timeout: ${toolName} exceeded ${ms}ms`)), ms)
    );
  }

  _validateParams(schema, params) {
    for (const [key, type] of Object.entries(schema)) {
      const required = !type.endsWith('?');
      const actualType = type.replace('?', '');
      
      if (required && !(key in params)) {
        return `Missing required parameter: ${key}`;
      }
      if (key in params && actualType !== 'any') {
        const actual = Array.isArray(params[key]) ? 'array' : typeof params[key];
        if (actual !== actualType && actual !== 'undefined') {
          return `${key} should be ${actualType}, got ${actual}`;
        }
      }
    }
    return null;
  }

  _sanitizeParams(params) {
    const sanitized = { ...params };
    ['password', 'token', 'secret', 'key', 'auth'].forEach(sensitive => {
      if (sensitive in sanitized) sanitized[sensitive] = '[REDACTED]';
    });
    return sanitized;
  }

  getStats() {
    const total = this.executionLog.length;
    const successful = this.executionLog.filter(e => e.success).length;
    const avgDuration = total > 0
      ? Math.round(this.executionLog.reduce((sum, e) => sum + e.duration, 0) / total)
      : 0;

    const byTool = {};
    this.executionLog.forEach(e => {
      byTool[e.toolName] = (byTool[e.toolName] || 0) + 1;
    });

    return {
      total, successful, failed: total - successful,
      successRate: total > 0 ? Math.round((successful / total) * 100) : 0,
      avgDuration,
      activeNow: this.activeExecutions.size,
      byTool,
    };
  }
}

// ══════════════════════════════════════════════════
// AGENT ORCHESTRATOR — Multi-step reasoning engine
// ══════════════════════════════════════════════════
export class AgentOrchestrator extends EventEmitter {
  constructor(toolExecutor, memoryEngine) {
    super();
    this.tools = toolExecutor;
    this.memory = memoryEngine;
    this.maxSteps = 10;
    this.activeAgents = new Map();
  }

  async run(task, userId, options = {}) {
    const agentId = randomUUID();
    const startTime = Date.now();
    const steps = [];
    let stepCount = 0;

    this.activeAgents.set(agentId, { task, userId, startTime, status: 'running' });
    this.emit('agent:start', { agentId, task, userId });

    try {
      // Phase 1: Task decomposition
      const plan = this._decompose(task);
      this.emit('agent:plan', { agentId, plan });

      // Phase 2: Execute plan steps
      for (const step of plan.steps) {
        if (stepCount >= this.maxSteps) {
          this.emit('agent:max-steps', { agentId, stepCount });
          break;
        }

        stepCount++;
        this.emit('agent:step', { agentId, stepCount, step });

        // Execute tool if needed
        if (step.tool) {
          const result = await this.tools.execute(step.tool, step.params, userId);
          step.result = result;
          steps.push({ ...step, stepNumber: stepCount });

          // Check if we should continue
          if (!result.success && step.critical) {
            throw new Error(`Critical step failed: ${step.tool} — ${result.error}`);
          }

          // Emit streaming update
          this.emit('agent:stream', {
            agentId,
            type: 'tool_result',
            tool: step.tool,
            result: result.data,
            stepCount,
          });
        } else {
          steps.push({ ...step, stepNumber: stepCount });
        }

        // Small delay to prevent overwhelming (production: real throttling)
        await new Promise(r => setTimeout(r, 50));
      }

      // Phase 3: Synthesize results
      const synthesis = this._synthesize(task, steps);
      const duration = Date.now() - startTime;

      const outcome = {
        agentId, task, userId,
        plan: plan.summary,
        steps, synthesis,
        stepCount, duration,
        success: true,
        timestamp: new Date().toISOString(),
      };

      this.activeAgents.get(agentId).status = 'complete';
      this.emit('agent:complete', outcome);

      // Store result in memory
      await this.memory.store(userId, `agent_run_${agentId}`, {
        task, synthesis, duration, stepCount
      }, { ttl: 86400 });

      return outcome;

    } catch (error) {
      const duration = Date.now() - startTime;
      this.activeAgents.get(agentId).status = 'failed';
      
      const errorOutcome = {
        agentId, task, userId, steps,
        error: error.message, duration,
        success: false, stepCount,
      };

      this.emit('agent:error', errorOutcome);
      return errorOutcome;
    }
  }

  _decompose(task) {
    // Intelligent task decomposition (production: LLM-powered)
    const taskLower = task.toLowerCase();
    const steps = [];

    // Pattern matching for common task types
    if (taskLower.includes('research') || taskLower.includes('find') || taskLower.includes('search')) {
      steps.push({ id: 1, action: 'Search web', tool: 'web_search', params: { query: task, max_results: 5 }, critical: false });
    }
    if (taskLower.includes('email') || taskLower.includes('send') || taskLower.includes('message')) {
      steps.push({ id: 2, action: 'Send communication', tool: 'send_email', params: { to: 'user@example.com', subject: task.slice(0, 50), body: 'Auto-generated' }, critical: true });
    }
    if (taskLower.includes('automate') || taskLower.includes('workflow') || taskLower.includes('schedule')) {
      steps.push({ id: 3, action: 'Create automation', tool: 'create_automation', params: { name: task.slice(0, 40), trigger: { type: 'schedule' }, actions: [] }, critical: false });
    }
    if (taskLower.includes('remember') || taskLower.includes('save') || taskLower.includes('store')) {
      steps.push({ id: 4, action: 'Store in memory', tool: 'memory_store', params: { key: `task_${Date.now()}`, value: task }, critical: false });
    }
    if (taskLower.includes('calendar') || taskLower.includes('schedule') || taskLower.includes('meeting')) {
      steps.push({ id: 5, action: 'Check calendar', tool: 'calendar_check', params: { date_range: { start: new Date().toISOString(), end: new Date(Date.now() + 604800000).toISOString() } }, critical: false });
    }

    // Always retrieve relevant memories
    steps.unshift({ id: 0, action: 'Retrieve context', tool: 'memory_retrieve', params: { query: task }, critical: false });

    return {
      summary: `${steps.length}-step plan for: "${task.slice(0, 60)}"`,
      steps,
      estimatedDuration: steps.length * 500,
    };
  }

  _synthesize(task, steps) {
    const successful = steps.filter(s => s.result?.success !== false);
    const toolsUsed = [...new Set(steps.filter(s => s.tool).map(s => s.tool))];

    return {
      summary: `Completed "${task.slice(0, 80)}" using ${toolsUsed.join(', ')}`,
      toolsUsed,
      stepsCompleted: successful.length,
      totalSteps: steps.length,
      keyFindings: steps
        .filter(s => s.result?.data?.summary)
        .map(s => s.result.data.summary),
    };
  }

  getStatus() {
    return {
      active: this.activeAgents.size,
      agents: [...this.activeAgents.entries()].map(([id, data]) => ({
        id, ...data, duration: Date.now() - data.startTime
      })),
    };
  }
}

// ══════════════════════════════════════════════════
// MEMORY ENGINE — Persistent user context
// ══════════════════════════════════════════════════
export class MemoryEngine {
  constructor() {
    this._storage = new Map(); // production: Redis/Postgres
    this.index = new Map(); // semantic search index
    this.stats = { reads: 0, writes: 0, hits: 0, misses: 0 };
  }

  async store(userId, key, value, options = {}) {
    const fullKey = `${userId}:${key}`;
    const entry = {
      key, value, userId,
      createdAt: Date.now(),
      expiresAt: options.ttl ? Date.now() + (options.ttl * 1000) : null,
      accessCount: 0,
      tags: options.tags || [],
      embedding: this._embed(JSON.stringify(value)),
    };

    this._storage.set(fullKey, entry);
    this._indexEntry(userId, key, entry);
    this.stats.writes++;
    return entry;
  }

  async retrieve(userId, key) {
    const fullKey = `${userId}:${key}`;
    const entry = this._storage.get(fullKey);

    if (!entry) { this.stats.misses++; return null; }
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this._storage.delete(fullKey);
      this.stats.misses++;
      return null;
    }

    entry.accessCount++;
    entry.lastAccessed = Date.now();
    this.stats.reads++;
    this.stats.hits++;
    return entry;
  }

  async search(userId, query, limit = 5) {
    const queryEmbedding = this._embed(query);
    const userEntries = [...this._storage.entries()]
      .filter(([k]) => k.startsWith(`${userId}:`))
      .map(([, v]) => v);

    // Cosine similarity ranking
    const ranked = userEntries
      .map(entry => ({
        ...entry,
        score: this._cosineSimilarity(queryEmbedding, entry.embedding),
      }))
      .filter(e => e.score > 0.1)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    this.stats.reads += ranked.length;
    return ranked;
  }

  async getUserSummary(userId) {
    const entries = [...this._storage.entries()]
      .filter(([k]) => k.startsWith(`${userId}:`))
      .map(([, v]) => v);

    return {
      userId,
      totalMemories: entries.length,
      recentAccess: entries
        .sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))
        .slice(0, 5)
        .map(e => ({ key: e.key, accessCount: e.accessCount })),
      tags: [...new Set(entries.flatMap(e => e.tags))],
    };
  }

  // Simple term-frequency embedding (production: sentence-transformers)
  _embed(text) {
    const normalized = text.toLowerCase().replace(/_/g, ' ').replace(/-/g, ' ');
    const words = normalized.split(/\W+/).filter(w => w.length > 2);
    const freq = {};
    words.forEach(w => { freq[w] = (freq[w] || 0) + 1; });
    const vector = new Array(64).fill(0);
    Object.entries(freq).forEach(([word, count]) => {
      const bucket = parseInt(createHash('md5').update(word).digest('hex').slice(0, 2), 16) % 64;
      vector[bucket] += count;
    });
    return vector;
  }

  _cosineSimilarity(a, b) {
    const dot = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const magA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    if (magA === 0 || magB === 0) return 0;
    return dot / (magA * magB);
  }

  _indexEntry(userId, key, entry) {
    if (!this.index.has(userId)) this.index.set(userId, []);
    this.index.get(userId).push({ key, tags: entry.tags, createdAt: entry.createdAt });
  }

  getStats() {
    const hitRate = this.stats.reads > 0
      ? Math.round((this.stats.hits / this.stats.reads) * 100)
      : 0;
    return { ...this.stats, hitRate, totalEntries: this._storage.size };
  }
}

// ══════════════════════════════════════════════════
// RATE LIMITER — Token bucket algorithm
// ══════════════════════════════════════════════════
export class RateLimiter {
  constructor() {
    this.buckets = new Map();
    this.config = {
      free:    { rpm: 10,  tpm: 50000,  rpd: 100 },
      pro:     { rpm: 60,  tpm: 500000, rpd: 2000 },
      power:   { rpm: 200, tpm: 2000000, rpd: 10000 },
      enterprise: { rpm: 1000, tpm: 10000000, rpd: 100000 },
    };
  }

  check(userId, plan = 'free') {
    const now = Date.now();
    const bucket = this._getBucket(userId, plan, now);
    
    // Refill tokens based on elapsed time
    const elapsed = now - bucket.lastRefill;
    const config = this.config[plan];
    const refillRate = config.tpm / 60000; // tokens per ms
    bucket.tokens = Math.min(config.tpm, bucket.tokens + elapsed * refillRate);
    bucket.lastRefill = now;

    // Check minute window
    bucket.requests = bucket.requests.filter(t => now - t < 60000);
    if (bucket.requests.length >= config.rpm) {
      return {
        allowed: false,
        reason: 'rate_limit_rpm',
        retryAfter: Math.ceil((60000 - (now - bucket.requests[0])) / 1000),
        limit: config.rpm,
        remaining: 0,
      };
    }

    // Check daily window
    bucket.dailyRequests = bucket.dailyRequests.filter(t => now - t < 86400000);
    if (bucket.dailyRequests.length >= config.rpd) {
      return {
        allowed: false,
        reason: 'rate_limit_rpd',
        retryAfter: 3600,
        limit: config.rpd,
        remaining: 0,
      };
    }

    bucket.requests.push(now);
    bucket.dailyRequests.push(now);

    return {
      allowed: true,
      remaining: config.rpm - bucket.requests.length,
      resetAt: Math.ceil((bucket.requests[0] + 60000) / 1000),
    };
  }

  consume(userId, tokens) {
    const bucket = this.buckets.get(userId);
    if (!bucket || bucket.tokens < tokens) return false;
    bucket.tokens -= tokens;
    return true;
  }

  _getBucket(userId, plan, now) {
    if (!this.buckets.has(userId)) {
      const config = this.config[plan];
      this.buckets.set(userId, {
        plan, tokens: config.tpm,
        requests: [], dailyRequests: [],
        lastRefill: now,
      });
    }
    return this.buckets.get(userId);
  }
}

export { TOOL_REGISTRY };
