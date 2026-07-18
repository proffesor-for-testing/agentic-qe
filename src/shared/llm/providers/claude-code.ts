/**
 * Agentic QE v3 — Claude Code (subscription) Provider (ADR-123, issue #557)
 *
 * Runs QE analysis on the user's Claude Pro/Max subscription by shelling out
 * to the Claude Code CLI (`claude -p --output-format json`) instead of calling
 * `api.anthropic.com` with a paid API key. The CLI authenticates with the
 * user's existing OAuth login and draws from the subscription's shared usage
 * allowance, so the worst case is "hit the plan rate limit and pause" rather
 * than a surprise per-token bill.
 *
 * LOAD-BEARING: the child process env has ANTHROPIC_API_KEY / CLAUDE_API_KEY /
 * ANTHROPIC_AUTH_TOKEN stripped. If any is present, the CLI silently reverts
 * to API-key billing and this provider would be a lie. `parity` test coverage
 * asserts the strip.
 */

import { spawn } from 'node:child_process';
import {
  LLMProvider,
  LLMProviderType,
  BillingMode,
  ClaudeCodeConfig,
  Message,
  GenerateOptions,
  EmbedOptions,
  CompleteOptions,
  LLMResponse,
  EmbeddingResponse,
  CompletionResponse,
  HealthCheckResult,
  TokenUsage,
  createLLMError,
} from '../interfaces';
import { TokenMetricsCollector } from '../../../learning/token-tracker.js';

export type { ClaudeCodeConfig };

/** Env vars whose presence flips the CLI from subscription to API billing. */
export const API_BILLING_ENV_VARS = [
  'ANTHROPIC_API_KEY',
  'CLAUDE_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
] as const;

export const DEFAULT_CLAUDE_CODE_CONFIG: ClaudeCodeConfig = {
  model: 'sonnet',
  maxTokens: 4096,
  temperature: 0.7,
  timeoutMs: 120000,
  maxRetries: 1,
  binaryPath: 'claude',
  maxConcurrency: 2,
  disallowedTools: ['Bash', 'Edit', 'Write', 'NotebookEdit', 'WebFetch', 'WebSearch', 'Task'],
};

/** Shape of `claude -p --output-format json` result (v2.x). */
interface ClaudeCodeResult {
  type: string;
  subtype?: string;
  is_error?: boolean;
  api_error_status?: string | null;
  result?: string;
  stop_reason?: string | null;
  session_id?: string;
  total_cost_usd?: number;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
  modelUsage?: Record<string, unknown>;
}

export class ClaudeCodeProvider implements LLMProvider {
  readonly type: LLMProviderType = 'claude-code';
  readonly name: string = 'Claude Code (subscription)';
  readonly billingMode: BillingMode = 'subscription';

  private config: ClaudeCodeConfig;
  private requestId = 0;
  private availabilityCache?: { at: number; available: boolean };
  private active = 0;
  private readonly queue: Array<() => void> = [];

  constructor(config: Partial<ClaudeCodeConfig> = {}) {
    this.config = { ...DEFAULT_CLAUDE_CODE_CONFIG, ...config };
    const envConc = Number.parseInt(process.env.AQE_CLAUDE_CODE_CONCURRENCY ?? '', 10);
    if (Number.isFinite(envConc) && envConc > 0) {
      this.config.maxConcurrency = envConc;
    }
  }

  async isAvailable(): Promise<boolean> {
    // Cache for 60s — spawning `claude --version` per call is wasteful.
    const now = Date.now();
    if (this.availabilityCache && now - this.availabilityCache.at < 60_000) {
      return this.availabilityCache.available;
    }
    let available = false;
    try {
      const { code } = await this.runProcess(['--version'], undefined, 5000);
      available = code === 0;
    } catch {
      available = false;
    }
    this.availabilityCache = { at: now, available };
    return available;
  }

  async healthCheck(): Promise<HealthCheckResult> {
    const start = Date.now();
    const available = await this.isAvailable();
    const latencyMs = Date.now() - start;
    if (!available) {
      return {
        healthy: false,
        latencyMs,
        error:
          `Claude Code CLI ("${this.config.binaryPath}") not found or not runnable. ` +
          `Install Claude Code and log in with your Pro/Max account.`,
      };
    }
    return {
      healthy: true,
      latencyMs,
      models: this.getSupportedModels(),
      details: { binaryPath: this.config.binaryPath, billing: 'subscription' },
    };
  }

  async generate(
    input: string | Message[],
    options?: GenerateOptions
  ): Promise<LLMResponse> {
    const model = this.toCliModel(options?.model ?? this.config.model);
    const requestId = `claude-code-${++this.requestId}-${Date.now()}`;
    const { prompt, systemPrompt } = this.flatten(input, options?.systemPrompt);

    const args = ['-p', '--output-format', 'json', '--model', model];
    if (systemPrompt) {
      args.push('--append-system-prompt', systemPrompt);
    }
    const disallowed = this.config.disallowedTools ?? [];
    if (disallowed.length > 0) {
      args.push('--disallowedTools', ...disallowed);
    }

    const start = Date.now();
    const timeoutMs = options?.timeoutMs ?? this.config.timeoutMs ?? 120000;

    const { code, stdout, stderr } = await this.withConcurrency(() =>
      this.runProcess(args, prompt, timeoutMs)
    );
    const latencyMs = Date.now() - start;

    if (code !== 0 && !stdout.trim()) {
      throw this.classifyError(stderr || `claude exited with code ${code}`, model);
    }

    let data: ClaudeCodeResult;
    try {
      data = JSON.parse(stdout) as ClaudeCodeResult;
    } catch {
      throw createLLMError(
        `Could not parse claude -p JSON output: ${stdout.slice(0, 200)}`,
        'PROVIDER_UNAVAILABLE',
        { provider: 'claude-code', model, retryable: true }
      );
    }

    if (data.is_error) {
      throw this.classifyError(data.result ?? data.api_error_status ?? 'claude error', model);
    }

    const u = data.usage ?? {};
    const usage: TokenUsage = {
      promptTokens: u.input_tokens ?? 0,
      completionTokens: u.output_tokens ?? 0,
      totalTokens: (u.input_tokens ?? 0) + (u.output_tokens ?? 0),
      cacheCreationTokens: u.cache_creation_input_tokens ?? 0,
      cacheReadTokens: u.cache_read_input_tokens ?? 0,
    };

    // The concrete model that actually served the request (modelUsage key).
    const resolvedModel =
      (data.modelUsage && Object.keys(data.modelUsage)[0]) || model;

    TokenMetricsCollector.recordTokenUsage(
      requestId,
      'claude-code-provider',
      'llm',
      'generate',
      {
        inputTokens: usage.promptTokens,
        outputTokens: usage.completionTokens,
        totalTokens: usage.totalTokens,
        // Subscription: no marginal API charge. total_cost_usd is the
        // API-equivalent figure, recorded for visibility only, not billed.
        estimatedCostUsd: 0,
      }
    );

    return {
      content: data.result ?? '',
      model: resolvedModel,
      provider: 'claude-code',
      usage,
      // Subscription billing: marginal monetary cost is $0. The figure is
      // authoritative (we know the subscription doesn't bill per token), so
      // it's a provider receipt, not a local estimate.
      cost: { inputCost: 0, outputCost: 0, totalCost: 0, currency: 'USD', source: 'provider-receipt' },
      latencyMs,
      finishReason: this.mapFinishReason(data.stop_reason),
      cached: false,
      requestId,
    };
  }

  async embed(_text: string, _options?: EmbedOptions): Promise<EmbeddingResponse> {
    throw createLLMError(
      'Claude Code provider does not support embeddings. Use openai, ollama, or cognitum.',
      'MODEL_NOT_FOUND',
      { provider: 'claude-code', retryable: false }
    );
  }

  async complete(prompt: string, options?: CompleteOptions): Promise<CompletionResponse> {
    const response = await this.generate(prompt, {
      model: options?.model,
      temperature: options?.temperature ?? 0.2,
      maxTokens: options?.maxTokens ?? 256,
    });
    return {
      completion: response.content,
      model: response.model,
      provider: 'claude-code',
      usage: response.usage,
      latencyMs: response.latencyMs,
      cached: response.cached,
    };
  }

  getConfig(): ClaudeCodeConfig {
    return { ...this.config };
  }

  getSupportedModels(): string[] {
    return ['opus', 'sonnet', 'haiku'];
  }

  getCostPerToken(): { input: number; output: number } {
    // Subscription — no per-token monetary cost.
    return { input: 0, output: 0 };
  }

  async dispose(): Promise<void> {
    // No persistent resources.
  }

  // -- internals -------------------------------------------------------------

  /** Map an AQE canonical/model id to a CLI alias the `claude` binary accepts. */
  private toCliModel(model: string): string {
    const m = model.toLowerCase();
    if (m.includes('opus')) return 'opus';
    if (m.includes('haiku')) return 'haiku';
    if (m.includes('sonnet')) return 'sonnet';
    return model;
  }

  private flatten(
    input: string | Message[],
    systemPromptOpt?: string
  ): { prompt: string; systemPrompt?: string } {
    if (typeof input === 'string') {
      return { prompt: input, systemPrompt: systemPromptOpt };
    }
    const systemParts = input.filter((m) => m.role === 'system').map((m) => m.content);
    if (systemPromptOpt) systemParts.unshift(systemPromptOpt);
    const convo = input
      .filter((m) => m.role !== 'system')
      .map((m) => `${m.role === 'assistant' ? 'Assistant' : 'User'}: ${m.content}`)
      .join('\n\n');
    return {
      prompt: convo,
      systemPrompt: systemParts.length > 0 ? systemParts.join('\n\n') : undefined,
    };
  }

  private mapFinishReason(reason?: string | null): LLMResponse['finishReason'] {
    switch (reason) {
      case 'max_tokens':
        return 'length';
      case 'end_turn':
      case 'stop_sequence':
      default:
        return 'stop';
    }
  }

  private classifyError(message: string, model: string) {
    const lower = message.toLowerCase();
    if (
      lower.includes('rate limit') ||
      lower.includes('usage limit') ||
      lower.includes('429') ||
      lower.includes('quota')
    ) {
      // The *desired* failure mode: plan limit reached → pause and retry later.
      return createLLMError(message, 'RATE_LIMITED', {
        provider: 'claude-code',
        model,
        retryable: true,
        retryAfterMs: 60_000,
      });
    }
    return createLLMError(message, 'PROVIDER_UNAVAILABLE', {
      provider: 'claude-code',
      model,
      retryable: true,
    });
  }

  /**
   * Build the child env with API-billing keys stripped (LOAD-BEARING).
   * Exported logic tested by parity/env-strip tests.
   */
  static childEnv(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...base };
    for (const key of API_BILLING_ENV_VARS) {
      delete env[key];
    }
    return env;
  }

  private runProcess(
    args: string[],
    stdin: string | undefined,
    timeoutMs: number
  ): Promise<{ code: number; stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.config.binaryPath ?? 'claude', args, {
        env: ClaudeCodeProvider.childEnv(),
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      let settled = false;

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill('SIGKILL');
        reject(
          createLLMError('claude -p timed out', 'TIMEOUT', {
            provider: 'claude-code',
            retryable: true,
          })
        );
      }, timeoutMs);

      child.stdout.on('data', (d) => (stdout += d.toString()));
      child.stderr.on('data', (d) => (stderr += d.toString()));

      child.on('error', (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(
          createLLMError(`Failed to spawn claude: ${err.message}`, 'PROVIDER_UNAVAILABLE', {
            provider: 'claude-code',
            retryable: false,
            cause: err,
          })
        );
      });

      child.on('close', (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ code: code ?? 0, stdout, stderr });
      });

      if (stdin !== undefined) {
        child.stdin.write(stdin);
      }
      child.stdin.end();
    });
  }

  /** Simple semaphore so we don't spawn unbounded `claude` subprocesses. */
  private async withConcurrency<T>(fn: () => Promise<T>): Promise<T> {
    const limit = this.config.maxConcurrency ?? 2;
    if (this.active >= limit) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      const next = this.queue.shift();
      if (next) next();
    }
  }
}
