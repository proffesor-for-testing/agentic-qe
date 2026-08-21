/**
 * Agentic QE v3 — Generic external CLI provider (ADR-127 / issue #628)
 *
 * A provider built from a *declaration* rather than from code. It generalizes
 * the shape AQE has already shipped twice — `providers/codex.ts` and
 * `providers/claude-code.ts` — into something a downstream integrator can
 * obtain by writing JSON:
 *
 *   spawn a host CLI → feed it a prompt on stdin → read the completion from
 *   stdout → attribute the usage honestly.
 *
 * WHY DECLARATIVE: the requester (agentic-kit) drives AQE as spawned
 * subprocesses — the `aqe` CLI bundle and the MCP server bundle are separate
 * esbuild artifacts — so an in-process `registerProvider()` call cannot reach
 * them. A declaration in `.agentic-qe/llm-config.json` reaches both, and does
 * so without AQE ever importing third-party code. See ADR-127 for why the
 * dynamic-`import()` plugin design was rejected.
 *
 * LOAD-BEARING: `stripEnv` removes named variables from the child environment.
 * A host that bills against a subscription must be able to guarantee an API
 * key is not silently present to flip it back to metered billing — the same
 * discipline `codex.ts` enforces for OPENAI_API_KEY / CODEX_API_KEY.
 */

import { spawn } from 'node:child_process';
import { accessSync, constants as fsConstants, statSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import {
  type BillingMode,
  type CompleteOptions,
  type CompletionResponse,
  type EmbedOptions,
  type EmbeddingResponse,
  type GenerateOptions,
  type HealthCheckResult,
  type LLMConfig,
  type LLMProvider,
  type LLMResponse,
  type Message,
  type TokenUsage,
  createLLMError,
} from '../interfaces';

// ============================================================================
// Declaration
// ============================================================================

/**
 * A declared external CLI provider. This is the on-disk contract — see ADR-127
 * §Schema. Everything except `kind` and `command` is optional.
 */
export interface ExternalCliProviderConfig {
  /** Discriminator. Only `'cli'` exists today; `'http'` is a follow-up. */
  readonly kind: 'cli';
  /** argv. Not shell-interpreted — `command[0]` is the binary. */
  readonly command: readonly string[];
  /** How this host bills. Unverified assertion; defaults to `metered-api`. */
  readonly billingMode?: BillingMode;
  /** Models this host accepts. Defaults to `['default']`. */
  readonly models?: readonly string[];
  /** Model used when the caller does not name one. Defaults to `models[0]`. */
  readonly defaultModel?: string;
  /** Flag used to pass the model, e.g. `--model`. Omitted = never passed. */
  readonly modelFlag?: string;
  /** Hard timeout per invocation. Defaults to 180000. */
  readonly timeoutMs?: number;
  /** Max concurrent subprocesses. Defaults to 2. */
  readonly maxConcurrency?: number;
  /** Env vars removed from the child process before spawning. */
  readonly stripEnv?: readonly string[];
  /** Human-facing name for CLI output. Defaults to the type string. */
  readonly displayName?: string;
}

export const DEFAULT_EXTERNAL_CLI_TIMEOUT_MS = 180_000;
export const DEFAULT_EXTERNAL_CLI_CONCURRENCY = 2;
export const EXTERNAL_CLI_DEFAULT_MODEL = 'default';

/**
 * Validate a declaration. Returns an error message, or `undefined` when the
 * declaration is usable.
 *
 * Deliberately does NOT check that the binary exists — that is a runtime
 * availability question answered by `isAvailable()`. A declaration for a host
 * that is not installed yet is valid-but-unavailable, not malformed, so a
 * config file stays portable across machines.
 */
export function validateExternalCliConfig(
  type: string,
  config: unknown
): string | undefined {
  if (!config || typeof config !== 'object') {
    return `externalProviders["${type}"] must be an object`;
  }
  const c = config as Partial<ExternalCliProviderConfig> & Record<string, unknown>;

  if (c.kind !== 'cli') {
    return `externalProviders["${type}"].kind must be "cli" (got ${JSON.stringify(c.kind)})`;
  }
  if (!Array.isArray(c.command) || c.command.length === 0) {
    return `externalProviders["${type}"].command must be a non-empty string array`;
  }
  if (!c.command.every((part) => typeof part === 'string' && part.length > 0)) {
    return `externalProviders["${type}"].command must contain only non-empty strings`;
  }
  if (
    c.billingMode !== undefined &&
    !['subscription', 'metered-api', 'metered-capped', 'local'].includes(c.billingMode)
  ) {
    return `externalProviders["${type}"].billingMode "${String(c.billingMode)}" is not a valid billing mode`;
  }
  if (c.models !== undefined && (!Array.isArray(c.models) || c.models.some((m) => typeof m !== 'string'))) {
    return `externalProviders["${type}"].models must be a string array`;
  }
  if (c.timeoutMs !== undefined && (typeof c.timeoutMs !== 'number' || c.timeoutMs <= 0)) {
    return `externalProviders["${type}"].timeoutMs must be a positive number`;
  }
  if (
    c.maxConcurrency !== undefined &&
    (typeof c.maxConcurrency !== 'number' || c.maxConcurrency < 1)
  ) {
    return `externalProviders["${type}"].maxConcurrency must be >= 1`;
  }
  if (
    c.stripEnv !== undefined &&
    (!Array.isArray(c.stripEnv) || c.stripEnv.some((k) => typeof k !== 'string'))
  ) {
    return `externalProviders["${type}"].stripEnv must be a string array`;
  }
  if ('apiKey' in c) {
    // Matches saveRouterConfigFile's never-persist-keys discipline. Reported
    // as an error so the key is noticed and removed rather than silently kept
    // in a file that gets committed.
    return `externalProviders["${type}"] must not contain an apiKey — keys belong in the environment, not in llm-config.json`;
  }
  return undefined;
}

// ============================================================================
// Provider
// ============================================================================

export class ExternalCliProvider implements LLMProvider {
  readonly type: string;
  readonly name: string;
  readonly billingMode: BillingMode;

  private readonly config: ExternalCliProviderConfig;
  private requestCounter = 0;
  private availabilityCache?: { at: number; available: boolean };
  private active = 0;
  private readonly queue: Array<() => void> = [];

  constructor(type: string, config: ExternalCliProviderConfig) {
    const problem = validateExternalCliConfig(type, config);
    if (problem) {
      throw createLLMError(problem, 'INVALID_REGISTRATION', { retryable: false });
    }
    this.type = type;
    this.config = config;
    this.name = config.displayName ?? type;
    // Undeclared => metered-api: assume it costs money and requires a cap.
    this.billingMode = config.billingMode ?? 'metered-api';
  }

  /**
   * Is the host's binary present and executable?
   *
   * Deliberately does NOT run it. AQE cannot know what invoking an arbitrary
   * host costs — a declared host has no `--version` contract it agreed to, and
   * spawning it with an empty prompt could burn a real request against the
   * user's plan just to answer "are you installed?". Resolving the binary on
   * PATH answers the question for free.
   */
  async isAvailable(): Promise<boolean> {
    const now = Date.now();
    if (this.availabilityCache && now - this.availabilityCache.at < 60_000) {
      return this.availabilityCache.available;
    }
    const available = resolvesOnPath(this.config.command[0]);
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
          `External provider "${this.type}" could not run "${this.config.command[0]}". ` +
          `Check that the host is installed and on PATH.`,
      };
    }
    return {
      healthy: true,
      latencyMs,
      models: this.getSupportedModels(),
      details: {
        command: this.config.command[0],
        billing: this.billingMode,
        external: true,
      },
    };
  }

  async generate(
    input: string | Message[],
    options?: GenerateOptions
  ): Promise<LLMResponse> {
    const model = options?.model ?? this.defaultModel();
    const requestId = `${this.type}-${++this.requestCounter}-${Date.now()}`;
    const prompt = flattenPrompt(input, options?.systemPrompt);
    const timeoutMs = options?.timeoutMs ?? this.config.timeoutMs ?? DEFAULT_EXTERNAL_CLI_TIMEOUT_MS;

    const extraArgs: string[] = [];
    if (this.config.modelFlag && model && model !== EXTERNAL_CLI_DEFAULT_MODEL) {
      extraArgs.push(this.config.modelFlag, model);
    }

    const start = Date.now();
    const { code, stdout, stderr } = await this.withConcurrency(() =>
      this.spawnHost(extraArgs, prompt, timeoutMs)
    );
    const latencyMs = Date.now() - start;
    const content = stdout.trim();

    if (code !== 0 && !content) {
      throw this.classifyError(stderr || `${this.type} exited with code ${code}`, model);
    }

    // No per-token receipt from a generic CLI. Estimate for visibility only
    // (~4 chars/token) and mark the cost `local-estimate` so ADR-126's
    // provenance rule holds: an estimate is never reported as a measurement.
    const promptTokens = Math.ceil(prompt.length / 4);
    const completionTokens = Math.ceil(content.length / 4);
    const usage: TokenUsage = {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
    };

    return {
      content,
      model,
      provider: this.type,
      usage,
      cost: {
        inputCost: 0,
        outputCost: 0,
        totalCost: 0,
        currency: 'USD',
        // Even for a subscription host this is an estimate, not a receipt:
        // AQE did not observe the billing event and cannot verify the mode
        // the declaration claimed.
        source: 'local-estimate',
      },
      latencyMs,
      finishReason: 'stop',
      cached: false,
      requestId,
    };
  }

  /**
   * ADR-127: a generic CLI contract cannot promise an embeddings endpoint.
   * Throws `EMBEDDING_UNSUPPORTED` — a distinct, non-retryable signal so the
   * caller falls back to a provider that has one, and never receives a
   * fabricated vector.
   */
  async embed(_text: string, _options?: EmbedOptions): Promise<EmbeddingResponse> {
    throw createLLMError(
      `External provider "${this.type}" does not support embeddings. ` +
      `Use a provider with an embeddings endpoint (openai, ollama, cognitum).`,
      'EMBEDDING_UNSUPPORTED',
      { provider: this.type, retryable: false }
    );
  }

  async complete(prompt: string, options?: CompleteOptions): Promise<CompletionResponse> {
    const response = await this.generate(prompt, {
      model: options?.model,
      temperature: options?.temperature,
      maxTokens: options?.maxTokens,
    });
    return {
      completion: response.content,
      model: response.model,
      provider: this.type,
      usage: response.usage,
      latencyMs: response.latencyMs,
      cached: response.cached,
    };
  }

  getConfig(): LLMConfig {
    return { ...this.config } as unknown as LLMConfig;
  }

  getSupportedModels(): string[] {
    return [...(this.config.models ?? [EXTERNAL_CLI_DEFAULT_MODEL])];
  }

  /**
   * Unknown. A declared host does not tell AQE its per-token price, and
   * inventing one would feed fabricated numbers into cost reporting.
   */
  getCostPerToken(): { input: number; output: number } {
    return { input: 0, output: 0 };
  }

  async dispose(): Promise<void> {
    // No persistent resources — each request is its own subprocess.
  }

  // -- internals -------------------------------------------------------------

  private defaultModel(): string {
    return this.config.defaultModel ?? this.config.models?.[0] ?? EXTERNAL_CLI_DEFAULT_MODEL;
  }

  /**
   * Child env with the declared keys removed (LOAD-BEARING — see file header).
   * Static so tests can assert the strip without spawning anything.
   */
  static childEnv(
    stripEnv: readonly string[] = [],
    base: NodeJS.ProcessEnv = process.env
  ): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...base };
    for (const key of stripEnv) {
      delete env[key];
    }
    return env;
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
        provider: this.type,
        model,
        retryable: true,
        retryAfterMs: 60_000,
      });
    }
    return createLLMError(message, 'PROVIDER_UNAVAILABLE', {
      provider: this.type,
      model,
      retryable: true,
    });
  }

  private spawnHost(
    extraArgs: string[],
    stdin: string,
    timeoutMs: number
  ): Promise<{ code: number; stdout: string; stderr: string }> {
    const [binary, ...baseArgs] = this.config.command;
    const args = [...baseArgs, ...extraArgs];

    return new Promise((resolve, reject) => {
      const child = spawn(binary, args, {
        env: ExternalCliProvider.childEnv(this.config.stripEnv),
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
          createLLMError(`${this.type} timed out after ${timeoutMs}ms`, 'TIMEOUT', {
            provider: this.type,
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
          createLLMError(
            `Failed to spawn "${binary}" for provider "${this.type}": ${err.message}`,
            'PROVIDER_UNAVAILABLE',
            { provider: this.type, retryable: false, cause: err }
          )
        );
      });

      child.on('close', (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ code: code ?? 0, stdout, stderr });
      });

      // EPIPE guard: a host that exits before reading stdin (e.g. not logged
      // in) makes the write emit 'error' on the stdin stream. Without a
      // listener Node throws an uncaught exception that kills the calling
      // process. The close/error handlers above carry the real outcome.
      child.stdin.on('error', () => {
        /* swallow EPIPE — outcome reported via close/error */
      });
      try {
        child.stdin.write(stdin);
        child.stdin.end();
      } catch {
        /* stream already torn down — process handlers report the failure */
      }
    });
  }

  /** Semaphore so we never spawn unbounded host subprocesses. */
  private async withConcurrency<T>(fn: () => Promise<T>): Promise<T> {
    const limit = this.config.maxConcurrency ?? DEFAULT_EXTERNAL_CLI_CONCURRENCY;
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

// ============================================================================
// Helpers
// ============================================================================

/**
 * Does this binary resolve to something executable, without running it?
 * An absolute or explicitly-relative path is checked directly; a bare name is
 * looked up across PATH the way the shell would.
 */
export function resolvesOnPath(
  binary: string,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const isExecutable = (candidate: string): boolean => {
    try {
      accessSync(candidate, fsConstants.X_OK);
      return statSync(candidate).isFile();
    } catch {
      return false;
    }
  };

  if (binary.includes('/') || binary.includes('\\')) {
    return isExecutable(binary);
  }

  const entries = (env.PATH ?? '').split(delimiter).filter(Boolean);
  // PATHEXT matters on Windows, where `my-host` is really `my-host.cmd`.
  const extensions = process.platform === 'win32'
    ? ['', ...(env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)]
    : [''];

  return entries.some((dir) =>
    extensions.some((ext) => isExecutable(join(dir, binary + ext)))
  );
}

/**
 * Flatten messages into a single prompt. A generic CLI has no role protocol,
 * so system content is hoisted into a preamble — the same strategy
 * `codex.ts` uses and the reason `message-formatter` falls back to
 * `'first-message'` for unknown providers.
 */
export function flattenPrompt(input: string | Message[], systemPrompt?: string): string {
  if (typeof input === 'string') {
    return systemPrompt ? `${systemPrompt}\n\n${input}` : input;
  }
  const systemParts = input.filter((m) => m.role === 'system').map((m) => m.content);
  if (systemPrompt) systemParts.unshift(systemPrompt);
  const convo = input
    .filter((m) => m.role !== 'system')
    .map((m) => `${m.role === 'assistant' ? 'Assistant' : 'User'}: ${m.content}`)
    .join('\n\n');
  const preamble = systemParts.length > 0 ? `${systemParts.join('\n\n')}\n\n` : '';
  return `${preamble}${convo}`;
}
