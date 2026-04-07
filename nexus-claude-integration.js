/**
 * NEXUS AI — Anthropic Claude Integration Layer
 * Handles: streaming, tool use, multi-turn, vision,
 *          prompt caching, model routing, cost tracking
 * Zero external deps — pure Node.js fetch + EventSource
 */

import { createHash, randomUUID } from 'crypto';
import { EventEmitter } from 'events';

// ══════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════
const ANTHROPIC_API_BASE = 'https://api.anthropic.com';
const ANTHROPIC_VERSION  = '2023-06-01';
const BETA_FEATURES      = ['computer-use-2024-10-22', 'prompt-caching-2024-07-31'];

// Model catalogue with cost per million tokens
const MODELS = {
  'claude-opus-4-6': {
    input: 15.00, output: 75.00, cacheWrite: 3.75, cacheRead: 1.50,
    contextWindow: 200000, maxOutput: 32000,
    tier: 'flagship', bestFor: ['complex reasoning', 'long documents', 'code'],
  },
  'claude-sonnet-4-6': {
    input: 3.00, output: 15.00, cacheWrite: 0.75, cacheRead: 0.30,
    contextWindow: 200000, maxOutput: 16000,
    tier: 'balanced', bestFor: ['chat', 'analysis', 'automation'],
  },
  'claude-haiku-4-5-20251001': {
    input: 0.25, output: 1.25, cacheWrite: 0.03, cacheRead: 0.03,
    contextWindow: 200000, maxOutput: 8000,
    tier: 'fast', bestFor: ['classification', 'extraction', 'routing'],
  },
};

// Default model per NEXUS mode
const MODE_MODELS = {
  assistant:  'claude-sonnet-4-6',
  agent:      'claude-opus-4-6',
  hub:        'claude-sonnet-4-6',
  os:         'claude-sonnet-4-6',
  classifier: 'claude-haiku-4-5-20251001',
  vision:     'claude-sonnet-4-6',
  code:       'claude-opus-4-6',
};

// ══════════════════════════════════════════════════
// NEXUS TOOL DEFINITIONS (Anthropic format)
// ══════════════════════════════════════════════════
const NEXUS_TOOLS = [
  {
    name: 'web_search',
    description: 'Search the web for real-time information, news, and current data.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        max_results: { type: 'integer', description: 'Max results to return', default: 5 },
        recency: { type: 'string', enum: ['day', 'week', 'month', 'any'], description: 'Result recency filter' },
      },
      required: ['query'],
    },
  },
  {
    name: 'run_code',
    description: 'Execute code in a secure sandboxed environment. Returns stdout, stderr, and exit code.',
    input_schema: {
      type: 'object',
      properties: {
        code:     { type: 'string', description: 'Code to execute' },
        language: { type: 'string', enum: ['python', 'javascript', 'typescript', 'bash', 'sql'], description: 'Programming language' },
        timeout:  { type: 'integer', description: 'Timeout in seconds (max 30)', default: 10 },
        packages: { type: 'array', items: { type: 'string' }, description: 'Packages to install before execution' },
      },
      required: ['code', 'language'],
    },
  },
  {
    name: 'memory_recall',
    description: 'Search and retrieve relevant information from the user\'s persistent memory.',
    input_schema: {
      type: 'object',
      properties: {
        query:       { type: 'string', description: 'What to search for in memory' },
        limit:       { type: 'integer', description: 'Max memories to return', default: 5 },
        time_filter: { type: 'string', enum: ['today', 'week', 'month', 'all'], description: 'Time range filter' },
      },
      required: ['query'],
    },
  },
  {
    name: 'memory_save',
    description: 'Save important information to the user\'s persistent memory for future reference.',
    input_schema: {
      type: 'object',
      properties: {
        content:   { type: 'string', description: 'Information to save' },
        category:  { type: 'string', enum: ['preference', 'fact', 'task', 'decision', 'contact', 'general'], description: 'Memory category' },
        tags:      { type: 'array', items: { type: 'string' }, description: 'Tags for easier retrieval' },
        important: { type: 'boolean', description: 'Flag as high importance', default: false },
      },
      required: ['content', 'category'],
    },
  },
  {
    name: 'create_automation',
    description: 'Create a new automation workflow that triggers on events and executes actions.',
    input_schema: {
      type: 'object',
      properties: {
        name:        { type: 'string', description: 'Automation name' },
        description: { type: 'string', description: 'What this automation does' },
        trigger: {
          type: 'object',
          properties: {
            type:     { type: 'string', enum: ['schedule', 'webhook', 'event', 'manual'] },
            schedule: { type: 'string', description: 'Cron expression (e.g. "0 9 * * MON")' },
            event:    { type: 'string', description: 'Event name to trigger on' },
          },
          required: ['type'],
        },
        actions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type:   { type: 'string', enum: ['send_email', 'send_slack', 'http_request', 'run_code', 'ai_task'] },
              config: { type: 'object', description: 'Action-specific configuration' },
            },
          },
          description: 'Ordered list of actions to execute',
        },
      },
      required: ['name', 'trigger', 'actions'],
    },
  },
  {
    name: 'connect_integration',
    description: 'Connect to an external service or retrieve data from a connected integration.',
    input_schema: {
      type: 'object',
      properties: {
        service: { type: 'string', enum: ['gmail', 'slack', 'notion', 'stripe', 'github', 'twitter', 'calendar', 'drive'], description: 'Integration to use' },
        action:  { type: 'string', description: 'What to do with the integration (e.g. "send message", "create document", "get events")' },
        params:  { type: 'object', description: 'Action-specific parameters' },
      },
      required: ['service', 'action'],
    },
  },
  {
    name: 'analyze_file',
    description: 'Analyze an uploaded file — extract content, summarize, or answer questions about it.',
    input_schema: {
      type: 'object',
      properties: {
        file_id:  { type: 'string', description: 'File ID from upload' },
        analysis: { type: 'string', enum: ['summarize', 'extract_data', 'answer_questions', 'translate', 'classify'], description: 'Analysis type' },
        question: { type: 'string', description: 'Specific question about the file (if analysis=answer_questions)' },
      },
      required: ['file_id', 'analysis'],
    },
  },
];

// ══════════════════════════════════════════════════
// SYSTEM PROMPTS — Per mode, optimized
// ══════════════════════════════════════════════════
const SYSTEM_PROMPTS = {
  assistant: `You are NEXUS AI, the world's most advanced unified AI platform. You combine the capabilities of an AI assistant, autonomous agent, automation hub, and personal operating system.

Core principles:
- Be genuinely helpful, proactive, and honest
- Use tools when they add real value — don't use them performatively
- Remember user context and personalize every response
- When uncertain, ask — don't guess
- Format responses clearly: use markdown, code blocks, lists where appropriate
- Be concise but complete. Never truncate important information.

You have access to: web search, code execution, persistent memory, automation creation, and 50+ integrations. Use them intelligently to deliver maximum value.`,

  agent: `You are NEXUS AI in Agent Mode — an autonomous AI agent that breaks down complex tasks and executes them step-by-step using available tools.

Agent mode principles:
- Decompose tasks into clear, executable steps
- Use tools efficiently — batch related operations
- Explain your reasoning at each step
- Handle errors gracefully and try alternative approaches
- Always confirm irreversible actions before executing
- Report progress clearly and summarize results

Think step-by-step. Be systematic. Deliver results.`,

  hub: `You are NEXUS AI in Hub Mode — the central integration layer connecting all the user's tools and services.

Hub mode principles:
- Understand the user's connected services and data
- Suggest and execute cross-service workflows
- Identify opportunities for automation
- Keep data in sync across platforms
- Respect data privacy and access permissions

Your goal: make all tools work together seamlessly.`,

  os: `You are NEXUS AI in OS Mode — managing the user's complete digital life as a personal operating system.

OS mode principles:
- Proactively manage tasks, calendar, and communications
- Anticipate needs based on patterns and context
- Prioritize and organize information intelligently
- Automate repetitive tasks without being asked
- Surface relevant information at the right time
- Protect user privacy and security at all times

You are the intelligent layer between the user and their digital world.`,

  classifier: `Classify the user's intent into one of these categories:
- simple_question: Factual question answerable without tools
- research: Needs web search or information gathering  
- code_task: Writing, reviewing, or debugging code
- automation: Creating workflows or automating tasks
- memory_task: Saving or recalling information
- integration_task: Working with external services
- analysis: Analyzing documents, data, or information
- creative: Writing, ideation, or creative tasks
- multi_step: Complex task requiring multiple tools

Respond ONLY with JSON: {"category": "<category>", "confidence": 0.0-1.0, "tools_needed": ["tool1", ...]}`,
};

// ══════════════════════════════════════════════════
// COST TRACKER
// ══════════════════════════════════════════════════
class CostTracker {
  constructor() {
    this.sessions = new Map();
    this.global = { totalCost: 0, totalTokens: 0, calls: 0 };
  }

  record(sessionId, model, usage) {
    const m = MODELS[model] || MODELS['claude-sonnet-4-6'];
    const cost =
      (usage.input_tokens / 1_000_000) * m.input +
      (usage.output_tokens / 1_000_000) * m.output +
      ((usage.cache_creation_input_tokens || 0) / 1_000_000) * m.cacheWrite +
      ((usage.cache_read_input_tokens || 0) / 1_000_000) * m.cacheRead;

    const entry = this.sessions.get(sessionId) || { cost: 0, tokens: 0, calls: 0 };
    entry.cost   += cost;
    entry.tokens += usage.input_tokens + usage.output_tokens;
    entry.calls  += 1;
    this.sessions.set(sessionId, entry);

    this.global.totalCost   += cost;
    this.global.totalTokens += usage.input_tokens + usage.output_tokens;
    this.global.calls       += 1;

    return { cost, sessionTotal: entry.cost };
  }

  getSession(sessionId) {
    return this.sessions.get(sessionId) || { cost: 0, tokens: 0, calls: 0 };
  }

  getGlobal() {
    return {
      ...this.global,
      avgCostPerCall: this.global.calls > 0
        ? (this.global.totalCost / this.global.calls).toFixed(6)
        : '0',
    };
  }
}

// ══════════════════════════════════════════════════
// PROMPT CACHE MANAGER
// ══════════════════════════════════════════════════
class PromptCacheManager {
  constructor() {
    this.cacheMap = new Map();
    this.stats = { hits: 0, misses: 0, savings: 0 };
  }

  // Mark content blocks for caching
  markForCache(content, minLength = 1024) {
    if (typeof content === 'string' && content.length >= minLength) {
      return [{ type: 'text', text: content, cache_control: { type: 'ephemeral' } }];
    }
    if (Array.isArray(content)) {
      return content.map((block, i) => {
        // Cache the last large block
        if (i === content.length - 1 &&
            block.type === 'text' &&
            block.text.length >= minLength) {
          return { ...block, cache_control: { type: 'ephemeral' } };
        }
        return block;
      });
    }
    return content;
  }

  recordUsage(usage) {
    if (usage.cache_read_input_tokens > 0) {
      this.stats.hits++;
      // Calculate savings: cache_read costs 90% less than regular input
      const savings = usage.cache_read_input_tokens * 0.9;
      this.stats.savings += savings;
    } else {
      this.stats.misses++;
    }
  }

  getStats() {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      hitRate: total > 0 ? ((this.stats.hits / total) * 100).toFixed(1) + '%' : '0%',
      estimatedTokenSavings: Math.round(this.stats.savings),
    };
  }
}

// ══════════════════════════════════════════════════
// INTELLIGENT MODEL ROUTER
// ══════════════════════════════════════════════════
class ModelRouter {
  constructor() {
    this.routingStats = new Map();
  }

  async route(messages, mode, options = {}) {
    const lastMessage = messages[messages.length - 1];
    const content = typeof lastMessage?.content === 'string'
      ? lastMessage.content
      : JSON.stringify(lastMessage?.content || '');

    // Hard overrides — checked first, no further logic
    if (options.forcedModel) return options.forcedModel;
    if (options.budget === 'minimal') return 'claude-haiku-4-5-20251001';
    if (options.budget === 'maximum') return 'claude-opus-4-6';

    // Classifier mode always uses haiku — no upgrade
    if (mode === 'classifier') {
      this.routingStats.set('classifier:claude-haiku-4-5-20251001',
        (this.routingStats.get('classifier:claude-haiku-4-5-20251001') || 0) + 1);
      return 'claude-haiku-4-5-20251001';
    }

    // Mode-based default
    let model = MODE_MODELS[mode] || 'claude-sonnet-4-6';

    // Content-based upgrade/downgrade (skipped for agent — already at opus)
    if (mode !== 'agent') {
      const isComplex = this._isComplex(content, messages);
      const isSimple  = this._isSimple(content);

      if (isComplex && model !== 'claude-opus-4-6') {
        model = 'claude-opus-4-6';
      } else if (isSimple) {
        model = 'claude-haiku-4-5-20251001';
      }
    }

    // Track routing decision
    const key = `${mode}:${model}`;
    this.routingStats.set(key, (this.routingStats.get(key) || 0) + 1);

    return model;
  }

  _isComplex(content, messages) {
    const complexIndicators = [
      'analyze', 'compare', 'evaluate', 'synthesize', 'research',
      'architecture', 'strategy', 'complex', 'comprehensive',
      content.length > 2000,
      messages.length > 20,
    ];
    return complexIndicators.filter(Boolean).length >= 2;
  }

  _isSimple(content) {
    const simpleIndicators = [
      content.length < 100,
      /^(what is|who is|when is|where is|how much|define)/i.test(content),
      /^(yes|no|ok|thanks|got it)/i.test(content),
    ];
    return simpleIndicators.filter(Boolean).length >= 2;
  }

  getStats() {
    return Object.fromEntries(this.routingStats);
  }
}

// ══════════════════════════════════════════════════
// MAIN CLAUDE CLIENT
// ══════════════════════════════════════════════════
export class ClaudeClient extends EventEmitter {
  constructor(apiKey, options = {}) {
    super();
    this.apiKey       = apiKey || process.env.ANTHROPIC_API_KEY;
    this.baseUrl      = options.baseUrl || ANTHROPIC_API_BASE;
    this.router       = new ModelRouter();
    this.costTracker  = new CostTracker();
    this.cacheManager = new PromptCacheManager();
    this.retryConfig  = { maxRetries: 3, baseDelay: 1000, maxDelay: 30000 };
    this.requestLog   = [];

    if (!this.apiKey) throw new Error('ANTHROPIC_API_KEY is required');
  }

  // ── Core message method ───────────────────────────
  async message(params, options = {}) {
    const {
      messages,
      system,
      mode = 'assistant',
      tools = NEXUS_TOOLS,
      maxTokens,
      temperature = 1,
      sessionId = randomUUID(),
      stream = false,
      userId,
    } = params;

    // Route to optimal model
    const model = await this.router.route(messages, mode, options);
    const modelConfig = MODELS[model];

    // Build system with cache
    const systemContent = this.cacheManager.markForCache(
      system || SYSTEM_PROMPTS[mode] || SYSTEM_PROMPTS.assistant
    );

    // Build request
    const request = {
      model,
      max_tokens: maxTokens || modelConfig.maxOutput,
      temperature,
      system: Array.isArray(systemContent) ? systemContent : [{ type: 'text', text: systemContent }],
      messages: this._prepareMessages(messages),
      tools: tools.length > 0 ? tools : undefined,
      tool_choice: tools.length > 0 ? { type: 'auto' } : undefined,
      stream,
    };

    this.emit('request:start', { model, mode, sessionId, userId });

    if (stream) {
      return this._streamRequest(request, sessionId, options);
    }

    return this._executeWithRetry(request, sessionId, options);
  }

  // ── Streaming ─────────────────────────────────────
  async *stream(params, options = {}) {
    const response = await this.message({ ...params, stream: true }, options);
    yield* this._parseStream(response, params.sessionId || randomUUID());
  }

  async _streamRequest(request, sessionId, options) {
    const response = await this._fetchWithRetry({
      ...request,
      stream: true,
    }, sessionId);
    return response;
  }

  async *_parseStream(response, sessionId) {
    const reader = response.body;
    let buffer = '';
    let inputTokens = 0, outputTokens = 0;
    let currentToolUse = null;
    let currentToolInput = '';

    for await (const chunk of reader) {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6);
        if (data === '[DONE]') return;

        try {
          const event = JSON.parse(data);

          switch (event.type) {
            case 'message_start':
              inputTokens = event.message.usage?.input_tokens || 0;
              yield { type: 'start', model: event.message.model, sessionId };
              break;

            case 'content_block_start':
              if (event.content_block.type === 'tool_use') {
                currentToolUse = {
                  id: event.content_block.id,
                  name: event.content_block.name,
                };
                currentToolInput = '';
                yield { type: 'tool_start', tool: currentToolUse.name, id: currentToolUse.id };
              }
              break;

            case 'content_block_delta':
              if (event.delta.type === 'text_delta') {
                yield { type: 'text', delta: event.delta.text };
              } else if (event.delta.type === 'input_json_delta') {
                currentToolInput += event.delta.partial_json;
              }
              break;

            case 'content_block_stop':
              if (currentToolUse) {
                try {
                  const toolInput = JSON.parse(currentToolInput || '{}');
                  yield {
                    type: 'tool_call',
                    tool: currentToolUse.name,
                    id: currentToolUse.id,
                    input: toolInput,
                  };
                } catch { /* malformed JSON — ignore */ }
                currentToolUse = null;
                currentToolInput = '';
              }
              break;

            case 'message_delta':
              outputTokens = event.usage?.output_tokens || 0;
              break;

            case 'message_stop': {
              const usage = { input_tokens: inputTokens, output_tokens: outputTokens };
              const { cost } = this.costTracker.record(sessionId, request?.model || 'claude-sonnet-4-6', usage);
              this.cacheManager.recordUsage(usage);
              yield { type: 'done', usage, cost: cost.toFixed(6), sessionId };
              break;
            }
          }
        } catch { /* skip malformed events */ }
      }
    }
  }

  // ── Agentic loop — auto tool execution ──────────────
  async agent(params, toolExecutor, options = {}) {
    const { messages, mode = 'agent', sessionId = randomUUID(), userId, maxTurns = 10 } = params;
    const conversation = [...messages];
    const executionLog = [];
    let turn = 0;

    this.emit('agent:start', { sessionId, userId, task: messages[messages.length - 1]?.content });

    while (turn < maxTurns) {
      turn++;

      const response = await this.message({
        messages: conversation,
        mode,
        sessionId,
        userId,
        tools: NEXUS_TOOLS,
        stream: false,
      }, options);

      // Add assistant response to conversation
      conversation.push({ role: 'assistant', content: response.content });

      // Check stop reason
      if (response.stop_reason === 'end_turn') {
        this.emit('agent:complete', { sessionId, turns: turn, log: executionLog });
        return {
          success: true,
          response,
          conversation,
          turns: turn,
          executionLog,
          cost: this.costTracker.getSession(sessionId),
        };
      }

      if (response.stop_reason !== 'tool_use') break;

      // Execute all tool calls in parallel
      const toolUses = response.content.filter(b => b.type === 'tool_use');
      this.emit('agent:tools', { sessionId, tools: toolUses.map(t => t.name), turn });

      const toolResults = await Promise.all(
        toolUses.map(async (toolUse) => {
          const startTime = Date.now();
          let result;

          try {
            if (toolExecutor) {
              result = await toolExecutor.execute(toolUse.name, toolUse.input, userId);
            } else {
              result = await this._simulateTool(toolUse.name, toolUse.input);
            }
          } catch (err) {
            result = { success: false, error: err.message };
          }

          const logEntry = {
            tool: toolUse.name,
            input: toolUse.input,
            result,
            duration: Date.now() - startTime,
            turn,
          };
          executionLog.push(logEntry);
          this.emit('agent:tool_result', logEntry);

          return {
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: result.success !== false
              ? JSON.stringify(result.data || result)
              : JSON.stringify({ error: result.error }),
            is_error: result.success === false,
          };
        })
      );

      // Add tool results to conversation
      conversation.push({ role: 'user', content: toolResults });
    }

    return {
      success: false,
      error: `Max turns (${maxTurns}) reached`,
      conversation,
      turns: turn,
      executionLog,
    };
  }

  // ── Vision — analyze images ───────────────────────
  async vision(imageData, question, options = {}) {
    const { mediaType = 'image/jpeg', sessionId = randomUUID() } = options;

    const messages = [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: mediaType,
            data: imageData,
          },
        },
        { type: 'text', text: question },
      ],
    }];

    return this.message({
      messages,
      mode: 'vision',
      sessionId,
      tools: [],    // No tools in vision mode
    });
  }

  // ── Batch classification (cost-efficient) ─────────
  async classify(texts, options = {}) {
    const results = await Promise.all(
      texts.map(async (text) => {
        const response = await this.message({
          messages: [{ role: 'user', content: text }],
          mode: 'classifier',
          tools: [],
          maxTokens: 100,
        }, { budget: 'minimal', ...options });

        try {
          const textContent = response.content.find(b => b.type === 'text')?.text || '{}';
          return JSON.parse(textContent);
        } catch {
          return { category: 'unknown', confidence: 0, tools_needed: [] };
        }
      })
    );
    return results;
  }

  // ── Embeddings via prompt (since no embedding API yet)
  async embed(text) {
    // Production: use a dedicated embedding service
    // For now: return hash-based pseudo-embedding
    const hash = createHash('sha256').update(text).digest('hex');
    const vector = [];
    for (let i = 0; i < 64; i++) {
      vector.push(parseInt(hash.slice(i % 60, (i % 60) + 4), 16) / 65535);
    }
    return vector;
  }

  // ── Core HTTP layer ───────────────────────────────
  async _executeWithRetry(request, sessionId, options) {
    const response = await this._fetchWithRetry(request, sessionId);
    const data = await response.json();

    if (!response.ok) {
      throw this._buildError(response.status, data);
    }

    // Track costs
    if (data.usage) {
      const { cost } = this.costTracker.record(sessionId, request.model, data.usage);
      this.cacheManager.recordUsage(data.usage);
      data._cost = cost;
      data._sessionCost = this.costTracker.getSession(sessionId).cost;
    }

    this.emit('request:complete', {
      model: request.model,
      sessionId,
      usage: data.usage,
      stopReason: data.stop_reason,
    });

    return data;
  }

  async _fetchWithRetry(request, sessionId, attempt = 0) {
    try {
      const response = await fetch(`${this.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
          'anthropic-beta': BETA_FEATURES.join(','),
          'x-nexus-session': sessionId,
        },
        body: JSON.stringify(request),
      });

      // Handle rate limits with exponential backoff
      if (response.status === 429 && attempt < this.retryConfig.maxRetries) {
        const retryAfter = parseInt(response.headers.get('retry-after') || '60', 10);
        const delay = Math.min(retryAfter * 1000, this.retryConfig.maxDelay);
        this.emit('rate_limit', { attempt, delay, sessionId });
        await new Promise(r => setTimeout(r, delay));
        return this._fetchWithRetry(request, sessionId, attempt + 1);
      }

      // Handle overloaded with backoff
      if (response.status === 529 && attempt < this.retryConfig.maxRetries) {
        const delay = Math.min(
          this.retryConfig.baseDelay * Math.pow(2, attempt),
          this.retryConfig.maxDelay
        );
        this.emit('overloaded', { attempt, delay });
        await new Promise(r => setTimeout(r, delay));
        return this._fetchWithRetry(request, sessionId, attempt + 1);
      }

      // Log request
      this.requestLog.push({
        id: randomUUID().slice(0, 8),
        model: request.model,
        status: response.status,
        sessionId,
        timestamp: new Date().toISOString(),
      });
      if (this.requestLog.length > 1000) this.requestLog.shift();

      return response;

    } catch (err) {
      if (attempt < this.retryConfig.maxRetries && err.code === 'ECONNRESET') {
        await new Promise(r => setTimeout(r, this.retryConfig.baseDelay * (attempt + 1)));
        return this._fetchWithRetry(request, sessionId, attempt + 1);
      }
      throw err;
    }
  }

  _prepareMessages(messages) {
    return messages.map(msg => {
      if (typeof msg.content === 'string' && msg.role === 'system') {
        return null; // System handled separately
      }
      // Apply cache marking to long user messages
      if (msg.role === 'user' && typeof msg.content === 'string' && msg.content.length > 2000) {
        return {
          ...msg,
          content: this.cacheManager.markForCache(msg.content),
        };
      }
      return msg;
    }).filter(Boolean);
  }

  _buildError(status, data) {
    const messages = {
      400: 'Invalid request — check parameters',
      401: 'Invalid API key',
      403: 'Access forbidden',
      404: 'Resource not found',
      422: 'Unprocessable request',
      429: 'Rate limit exceeded',
      500: 'Anthropic API internal error',
      529: 'Anthropic API overloaded',
    };
    const err = new Error(data.error?.message || messages[status] || `HTTP ${status}`);
    err.status = status;
    err.type = data.error?.type;
    return err;
  }

  async _simulateTool(name, input) {
    // Used when no toolExecutor provided — for testing
    return {
      success: true,
      data: { result: `[Simulated ${name} result for input: ${JSON.stringify(input).slice(0, 100)}]` }
    };
  }

  // ── Public stats ──────────────────────────────────
  getStats() {
    return {
      costs:    this.costTracker.getGlobal(),
      cache:    this.cacheManager.getStats(),
      routing:  this.router.getStats(),
      requests: this.requestLog.length,
      models:   Object.fromEntries(
        Object.entries(MODELS).map(([name, cfg]) => [name, { tier: cfg.tier, contextWindow: cfg.contextWindow }])
      ),
    };
  }
}

// ══════════════════════════════════════════════════
// NEXUS AI COMPLETE INTEGRATION — wires everything
// ══════════════════════════════════════════════════
export class NexusAI {
  constructor(config = {}) {
    this.claude  = new ClaudeClient(config.apiKey);
    this.sessions = new Map();

    // Forward events
    this.claude.on('agent:start',       e => this._onEvent('agent:start', e));
    this.claude.on('agent:complete',    e => this._onEvent('agent:complete', e));
    this.claude.on('agent:tool_result', e => this._onEvent('agent:tool_result', e));
    this.claude.on('rate_limit',        e => console.warn('[NexusAI] Rate limit hit:', e));
  }

  // Simple chat
  async chat(userMessage, options = {}) {
    const {
      sessionId = randomUUID(),
      mode = 'assistant',
      userId = 'anonymous',
      history = [],
      systemOverride,
    } = options;

    const messages = [
      ...history,
      { role: 'user', content: userMessage },
    ];

    const response = await this.claude.message({
      messages,
      mode,
      sessionId,
      userId,
      system: systemOverride,
    });

    const assistantText = response.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');

    return {
      text: assistantText,
      model: response.model,
      usage: response.usage,
      cost: response._cost,
      sessionId,
    };
  }

  // Streaming chat
  async *chatStream(userMessage, options = {}) {
    const { sessionId = randomUUID(), mode = 'assistant', userId, history = [] } = options;

    const messages = [...history, { role: 'user', content: userMessage }];

    yield* this.claude.stream({
      messages, mode, sessionId, userId,
    });
  }

  // Run autonomous agent task
  async runTask(task, toolExecutor, options = {}) {
    const { sessionId = randomUUID(), userId = 'anonymous', maxTurns = 10 } = options;

    return this.claude.agent({
      messages: [{ role: 'user', content: task }],
      mode: 'agent',
      sessionId,
      userId,
      maxTurns,
    }, toolExecutor, options);
  }

  // Analyze image
  async analyzeImage(base64Image, question, options = {}) {
    return this.claude.vision(base64Image, question, options);
  }

  // Classify intent (cheap, fast)
  async classifyIntent(message) {
    const [result] = await this.claude.classify([message]);
    return result;
  }

  _onEvent(name, data) {
    // Could emit to WebSocket clients, log to monitoring, etc.
    if (process.env.DEBUG_NEXUS) {
      console.debug(`[NexusAI] ${name}:`, JSON.stringify(data).slice(0, 200));
    }
  }

  getStats() {
    return this.claude.getStats();
  }
}

// ══════════════════════════════════════════════════
// INTEGRATION TESTS — validate the client design
// ══════════════════════════════════════════════════
export async function runIntegrationTests() {
  const colors = {
    green: '\x1b[32m', red: '\x1b[31m', cyan: '\x1b[36m',
    bold: '\x1b[1m', reset: '\x1b[0m', dim: '\x1b[2m',
  };
  const c = (col, txt) => `${colors[col]}${txt}${colors.reset}`;

  console.log(c('bold', c('cyan', '\n╔════════════════════════════════════════╗')));
  console.log(c('bold', c('cyan', '║  NEXUS AI — Claude Integration Tests   ║')));
  console.log(c('bold', c('cyan', '╚════════════════════════════════════════╝\n')));

  const results = { passed: 0, failed: 0 };

  async function test(name, fn) {
    try {
      await fn();
      results.passed++;
      console.log(`  ${c('green', '✓')} ${c('dim', name)}`);
    } catch (e) {
      results.failed++;
      console.log(`  ${c('red', '✗')} ${name}`);
      console.log(`    ${c('red', '→ ' + e.message)}`);
    }
  }

  // Test 1: Client initializes correctly
  await test('Client initializes with API key', () => {
    const client = new ClaudeClient('test-key-12345');
    if (!client.apiKey) throw new Error('API key not set');
    if (!client.router) throw new Error('Router not initialized');
    if (!client.costTracker) throw new Error('Cost tracker not initialized');
  });

  // Test 2: Throws without API key
  await test('Client throws without API key', () => {
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      new ClaudeClient();
      throw new Error('Should have thrown');
    } catch (e) {
      if (!e.message.includes('required')) throw new Error('Wrong error: ' + e.message);
    } finally {
      if (saved) process.env.ANTHROPIC_API_KEY = saved;
    }
  });

  // Test 3: Model routing — agent → opus
  await test('Router selects opus for agent mode', async () => {
    const router = new ModelRouter();
    const model = await router.route([{ role: 'user', content: 'complex task' }], 'agent');
    if (model !== 'claude-opus-4-6') throw new Error(`Expected opus, got ${model}`);
  });

  // Test 4: Router selects haiku for classifier
  await test('Router selects haiku for classifier mode', async () => {
    const router = new ModelRouter();
    const model = await router.route([{ role: 'user', content: 'what is' }], 'classifier');
    if (model !== 'claude-haiku-4-5-20251001') throw new Error(`Expected haiku, got ${model}`);
  });

  // Test 5: Router upgrades to opus for complex content
  await test('Router upgrades to opus for complex long content', async () => {
    const router = new ModelRouter();
    const longContent = 'Please analyze and synthesize '.repeat(100); // long + complex keywords
    const model = await router.route([{ role: 'user', content: longContent }], 'assistant');
    if (model !== 'claude-opus-4-6') throw new Error(`Expected opus upgrade, got ${model}`);
  });

  // Test 6: Budget override
  await test('Router respects budget=minimal override', async () => {
    const router = new ModelRouter();
    const model = await router.route(
      [{ role: 'user', content: 'complex analysis and synthesis of everything' }],
      'agent',
      { budget: 'minimal' }
    );
    if (model !== 'claude-haiku-4-5-20251001') throw new Error(`Expected haiku, got ${model}`);
  });

  // Test 7: Cost tracking
  await test('Cost tracker calculates correctly', () => {
    const tracker = new CostTracker();
    const { cost } = tracker.record('session1', 'claude-sonnet-4-6', {
      input_tokens: 1000,
      output_tokens: 500,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    });
    // 1000 input tokens @ $3/M = $0.003, 500 output @ $15/M = $0.0075
    const expected = 0.003 + 0.0075;
    if (Math.abs(cost - expected) > 0.0001) throw new Error(`Cost ${cost} ≠ ${expected}`);
  });

  // Test 8: Prompt cache marking
  await test('Cache manager marks long text for caching', () => {
    const cacheManager = new PromptCacheManager();
    const longText = 'A'.repeat(2000);
    const marked = cacheManager.markForCache(longText, 1024);
    if (!Array.isArray(marked)) throw new Error('Should return array');
    if (!marked[0].cache_control) throw new Error('Missing cache_control');
    if (marked[0].cache_control.type !== 'ephemeral') throw new Error('Wrong cache type');
  });

  // Test 9: Cache manager skips short text
  await test('Cache manager skips short text', () => {
    const cacheManager = new PromptCacheManager();
    const shortText = 'Hello';
    const marked = cacheManager.markForCache(shortText, 1024);
    if (Array.isArray(marked)) throw new Error('Should not wrap short text in array');
  });

  // Test 10: Tool definitions are valid
  await test('All tool definitions have required fields', () => {
    NEXUS_TOOLS.forEach(tool => {
      if (!tool.name) throw new Error(`Tool missing name`);
      if (!tool.description) throw new Error(`${tool.name}: missing description`);
      if (!tool.input_schema) throw new Error(`${tool.name}: missing input_schema`);
      if (!tool.input_schema.properties) throw new Error(`${tool.name}: missing properties`);
    });
  });

  // Test 11: System prompts exist for all modes
  await test('System prompts defined for all modes', () => {
    const requiredModes = ['assistant', 'agent', 'hub', 'os', 'classifier'];
    requiredModes.forEach(mode => {
      if (!SYSTEM_PROMPTS[mode]) throw new Error(`Missing system prompt for mode: ${mode}`);
      if (SYSTEM_PROMPTS[mode].length < 100) throw new Error(`System prompt too short for: ${mode}`);
    });
  });

  // Test 12: NexusAI wrapper initializes
  await test('NexusAI wrapper initializes with config', () => {
    const nexus = new NexusAI({ apiKey: 'test-key-nexus' });
    if (!nexus.claude) throw new Error('Claude client not initialized');
    if (typeof nexus.chat !== 'function') throw new Error('chat method missing');
    if (typeof nexus.runTask !== 'function') throw new Error('runTask method missing');
    if (typeof nexus.analyzeImage !== 'function') throw new Error('analyzeImage method missing');
  });

  // Test 13: Cost tracker session isolation
  await test('Cost tracker isolates sessions', () => {
    const tracker = new CostTracker();
    tracker.record('sA', 'claude-sonnet-4-6', { input_tokens: 1000, output_tokens: 500, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 });
    tracker.record('sB', 'claude-sonnet-4-6', { input_tokens: 2000, output_tokens: 1000, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 });
    const sessionA = tracker.getSession('sA');
    const sessionB = tracker.getSession('sB');
    if (sessionB.cost <= sessionA.cost) throw new Error('Session B should cost more than A');
  });

  // Test 14: Model catalogue completeness
  await test('All models have required pricing fields', () => {
    Object.entries(MODELS).forEach(([name, cfg]) => {
      ['input', 'output', 'cacheWrite', 'cacheRead', 'contextWindow', 'maxOutput', 'tier'].forEach(field => {
        if (!(field in cfg)) throw new Error(`Model ${name} missing field: ${field}`);
      });
    });
  });

  // Test 15: NEXUS_TOOLS has all required categories
  await test('Tool registry covers all required categories', () => {
    const toolNames = NEXUS_TOOLS.map(t => t.name);
    const required = ['web_search', 'run_code', 'memory_recall', 'memory_save', 'create_automation'];
    required.forEach(req => {
      if (!toolNames.includes(req)) throw new Error(`Missing required tool: ${req}`);
    });
  });

  // Summary
  const total = results.passed + results.failed;
  const pct = total > 0 ? Math.round((results.passed / total) * 100) : 0;
  const summaryColor = pct === 100 ? 'green' : pct >= 90 ? 'yellow' : 'red';

  console.log('\n' + '─'.repeat(42));
  console.log(c(summaryColor, c('bold', pct === 100 ? '\n  ✓ ALL INTEGRATION TESTS PASSED' : `\n  ${results.failed} TESTS FAILED`)));
  console.log(`\n  Passed: ${c('green', results.passed.toString())} / ${total}`);
  console.log(`  Rate:   ${c(summaryColor, pct + '%')}\n`);

  return results;
}

// Run if executed directly
const isMain = process.argv[1]?.endsWith('claude-integration.js');
if (isMain) {
  runIntegrationTests().then(r => process.exit(r.failed > 0 ? 1 : 0));
}

export { MODELS, NEXUS_TOOLS, SYSTEM_PROMPTS, MODE_MODELS };
