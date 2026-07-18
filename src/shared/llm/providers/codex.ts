/**
 * Agentic QE v3 — Codex CLI (subscription) Provider (ADR-123 / ADR-124 M3.5)
 *
 * Runs QE analysis on the user's ChatGPT subscription by shelling out to the
 * Codex CLI (`codex exec`) instead of calling the OpenAI API with a paid key.
 * The CLI authenticates with the user's existing ChatGPT login (~/.codex/auth.json)
 * and draws from the subscription allowance, so the worst case is "hit the plan
 * limit and pause" rather than a per-token bill. Mirrors the claude-code provider.
 *
 * WHY: gives AQE a cross-vendor (GPT-family) engine — used as a provider fallback
 * and, crucially, as an independent prosecutor/juror in qe-court (ADR-124), where
 * a non-Claude, non-Cognitum brain is the strongest form of writer≠juror.
 *
 * LOAD-BEARING: the child process env has OPENAI_API_KEY / CODEX_API_KEY stripped.
 * If present, the CLI could revert to API-key billing and this provider would be
 * a lie. `parity` test coverage asserts the strip.
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  LLMProvider,
  LLMProviderType,
  BillingMode,
  CodexConfig,
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

export type { CodexConfig };

/** Env vars whose presence could flip the CLI from subscription to API billing. */
export const API_BILLING_ENV_VARS = ['OPENAI_API_KEY', 'CODEX_API_KEY'] as const;

/** Sentinel meaning "let Codex use its own configured default model". */
export const CODEX_DEFAULT_MODEL = 'default';

export const DEFAULT_CODEX_CONFIG: CodexConfig = {
  model: CODEX_DEFAULT_MODEL,
  maxTokens: 4096,
  temperature: 0.7,
  timeoutMs: 180000,
  maxRetries: 1,
  binaryPath: 'codex',
  maxConcurrency: 2,
};

export class CodexProvider implements LLMProvider {
  readonly type: LLMProviderType = 'codex';
  readonly name: string = 'Codex CLI (subscription)';
  readonly billingMode: BillingMode = 'subscription';

  private config: CodexConfig;
  private requestId = 0;
  private availabilityCache?: { at: number; available: boolean };
  private active = 0;
  private readonly queue: Array<() => void> = [];

  constructor(config: Partial<CodexConfig> = {}) {
    this.config = { ...DEFAULT_CODEX_CONFIG, ...config };
    const envConc = Number.parseInt(process.env.AQE_CODEX_CONCURRENCY ?? '', 10);
    if (Number.isFinite(envConc) && envConc > 0) {
      this.config.maxConcurrency = envConc;
    }
  }

  async isAvailable(): Promise<boolean> {
    const now = Date.now();
    if (this.availabilityCache && now - this.availabilityCache.at < 60_000) {
      return this.availabilityCache.available;
    }
    let available = false;
    try {
      const { code } = await this.runProcess(['--version'], undefined, undefined, 5000);
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
          `Codex CLI ("${this.config.binaryPath}") not found or not runnable. ` +
          `Install Codex and log in with your ChatGPT account (\`codex login\`).`,
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
    const model = options?.model ?? this.config.model ?? CODEX_DEFAULT_MODEL;
    const requestId = `codex-${++this.requestId}-${Date.now()}`;
    const { prompt } = this.flatten(input, options?.systemPrompt);

    // `codex exec` is agentic; keep it read-only and non-interactive. We capture
    // just the final assistant message via -o <file> to avoid parsing the noisy
    // JSONL event stream.
    const tmp = mkdtempSync(join(tmpdir(), 'aqe-codex-'));
    const outFile = join(tmp, 'last-message.txt');
    const args = [
      'exec',
      '--skip-git-repo-check',
      '--sandbox', 'read-only',
      '-o', outFile,
    ];
    if (model && model !== CODEX_DEFAULT_MODEL) {
      args.push('-m', model);
    }

    const start = Date.now();
    const timeoutMs = options?.timeoutMs ?? this.config.timeoutMs ?? 180000;

    try {
      const { code, stderr } = await this.withConcurrency(() =>
        this.runProcess(args, prompt, undefined, timeoutMs)
      );
      const latencyMs = Date.now() - start;

      let content = '';
      try {
        content = readFileSync(outFile, 'utf8').trim();
      } catch {
        content = '';
      }

      if (code !== 0 && !content) {
        throw this.classifyError(stderr || `codex exited with code ${code}`, model);
      }

      // Subscription: no per-token receipt. Estimate usage from text length for
      // visibility only (≈4 chars/token); marginal monetary cost is $0.
      const promptTokens = Math.ceil(prompt.length / 4);
      const completionTokens = Math.ceil(content.length / 4);
      const usage: TokenUsage = {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
      };

      TokenMetricsCollector.recordTokenUsage(
        requestId,
        'codex-provider',
        'llm',
        'generate',
        {
          inputTokens: usage.promptTokens,
          outputTokens: usage.completionTokens,
          totalTokens: usage.totalTokens,
          estimatedCostUsd: 0,
        }
      );

      return {
        content,
        model: model === CODEX_DEFAULT_MODEL ? 'codex-default' : model,
        provider: 'codex',
        usage,
        // Subscription billing: marginal cost is $0 and we know it authoritatively.
        cost: { inputCost: 0, outputCost: 0, totalCost: 0, currency: 'USD', source: 'provider-receipt' },
        latencyMs,
        finishReason: 'stop',
        cached: false,
        requestId,
      };
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }

  async embed(_text: string, _options?: EmbedOptions): Promise<EmbeddingResponse> {
    throw createLLMError(
      'Codex provider does not support embeddings. Use openai, ollama, or cognitum.',
      'MODEL_NOT_FOUND',
      { provider: 'codex', retryable: false }
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
      provider: 'codex',
      usage: response.usage,
      latencyMs: response.latencyMs,
      cached: response.cached,
    };
  }

  getConfig(): CodexConfig {
    return { ...this.config };
  }

  getSupportedModels(): string[] {
    // Codex resolves the concrete model from its profile/login; these are the
    // common ids accepted via -m. `default` = whatever the CLI is configured to.
    return [CODEX_DEFAULT_MODEL, 'gpt-5-codex', 'o3', 'o4-mini'];
  }

  getCostPerToken(): { input: number; output: number } {
    return { input: 0, output: 0 };
  }

  async dispose(): Promise<void> {
    // No persistent resources.
  }

  // -- internals -------------------------------------------------------------

  private flatten(
    input: string | Message[],
    systemPromptOpt?: string
  ): { prompt: string } {
    if (typeof input === 'string') {
      return { prompt: systemPromptOpt ? `${systemPromptOpt}\n\n${input}` : input };
    }
    const systemParts = input.filter((m) => m.role === 'system').map((m) => m.content);
    if (systemPromptOpt) systemParts.unshift(systemPromptOpt);
    const convo = input
      .filter((m) => m.role !== 'system')
      .map((m) => `${m.role === 'assistant' ? 'Assistant' : 'User'}: ${m.content}`)
      .join('\n\n');
    const preamble = systemParts.length > 0 ? `${systemParts.join('\n\n')}\n\n` : '';
    return { prompt: `${preamble}${convo}` };
  }

  private classifyError(message: string, model: string) {
    const lower = message.toLowerCase();
    if (
      lower.includes('rate limit') ||
      lower.includes('usage limit') ||
      lower.includes('429') ||
      lower.includes('quota')
    ) {
      return createLLMError(message, 'RATE_LIMITED', {
        provider: 'codex',
        model,
        retryable: true,
        retryAfterMs: 60_000,
      });
    }
    return createLLMError(message, 'PROVIDER_UNAVAILABLE', {
      provider: 'codex',
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
    _unused: undefined,
    timeoutMs: number
  ): Promise<{ code: number; stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.config.binaryPath ?? 'codex', args, {
        env: CodexProvider.childEnv(),
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
          createLLMError('codex exec timed out', 'TIMEOUT', {
            provider: 'codex',
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
          createLLMError(`Failed to spawn codex: ${err.message}`, 'PROVIDER_UNAVAILABLE', {
            provider: 'codex',
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

      // EPIPE guard: if codex exits before reading stdin (e.g. not logged in),
      // the write/end can emit 'error' on the stdin stream. Without a listener
      // Node throws an uncaught exception that crashes the calling process. The
      // 'close'/'error' handlers above already capture the real outcome.
      child.stdin.on('error', () => { /* swallow EPIPE — outcome handled via close/error */ });
      try {
        if (stdin !== undefined) {
          child.stdin.write(stdin);
        }
        child.stdin.end();
      } catch {
        /* stream already torn down — the process handlers report the failure */
      }
    });
  }

  /** Simple semaphore so we don't spawn unbounded `codex` subprocesses. */
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
