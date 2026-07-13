/**
 * Agentic QE v3 — Cognitum Provider (ADR-123)
 *
 * api.cognitum.one is an OpenAI-compatible (and Anthropic-compatible) LLM
 * gateway with two properties that matter for issue #557:
 *   1. Every response carries an `x_cognitum` receipt with an authoritative
 *      per-request `price_usd` — so cost is a provider receipt, not a local
 *      price-table estimate.
 *   2. It enforces a server-side hard spend cap (`/v1/usage` → `hardCapUsd`),
 *      so the worst case is "provider pauses at the cap", not a surprise bill.
 *
 * Models are tiers (`cognitum-auto|low|mid|high`); the gateway resolves each
 * to a concrete model and reports it back in the receipt (`resolved_model`).
 */

import {
  LLMProvider,
  LLMProviderType,
  BillingMode,
  CognitumConfig,
  Message,
  GenerateOptions,
  EmbedOptions,
  CompleteOptions,
  LLMResponse,
  EmbeddingResponse,
  CompletionResponse,
  HealthCheckResult,
  TokenUsage,
  CostInfo,
  createLLMError,
} from '../interfaces';
import { TokenMetricsCollector } from '../../../learning/token-tracker.js';
import { toError } from '../../error-utils.js';
import { backoffDelay } from '../retry.js';

export type { CognitumConfig };

export const DEFAULT_COGNITUM_CONFIG: CognitumConfig = {
  model: 'cognitum-auto',
  maxTokens: 4096,
  temperature: 0.7,
  timeoutMs: 60000,
  maxRetries: 3,
  enableCache: true,
  enableCircuitBreaker: true,
};

/** The `x_cognitum` routing receipt carried on every response. */
interface CognitumReceipt {
  request_id?: string;
  resolved_tier?: string;
  resolved_model?: string;
  escalated?: boolean;
  cap_degraded?: boolean;
  routing_reason?: string;
  price_usd?: number;
  cache?: string;
}

interface CognitumCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: { role: 'assistant'; content: string };
    finish_reason: 'stop' | 'length' | 'content_filter' | null;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    cache_read_tokens?: number;
  };
  x_cognitum?: CognitumReceipt;
}

interface CognitumEmbeddingResponse {
  object: string;
  data: Array<{ object: string; index: number; embedding: number[] }>;
  model: string;
  usage: { prompt_tokens: number; total_tokens: number };
  x_cognitum?: CognitumReceipt;
}

/** Server-side budget snapshot from GET /v1/usage. */
export interface CognitumBudget {
  servingBudgetUsd: number;
  hardCapUsd: number;
  committedUsd: number;
  headroomUsd: number;
  status: string;
  headroomExhausted: boolean;
}

export class CognitumProvider implements LLMProvider {
  readonly type: LLMProviderType = 'cognitum';
  readonly name: string = 'Cognitum';
  readonly billingMode: BillingMode = 'metered-capped';

  private config: CognitumConfig;
  private requestId = 0;

  constructor(config: Partial<CognitumConfig> = {}) {
    this.config = { ...DEFAULT_COGNITUM_CONFIG, ...config };
  }

  async isAvailable(): Promise<boolean> {
    if (!this.getApiKey()) return false;
    try {
      return (await this.healthCheck()).healthy;
    } catch {
      return false;
    }
  }

  async healthCheck(): Promise<HealthCheckResult> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      return {
        healthy: false,
        error: 'API key not configured. Set COGNITUM_API_KEY environment variable.',
      };
    }
    const start = Date.now();
    try {
      const response = await this.fetchWithTimeout(
        `${this.getBaseUrl()}/v1/models`,
        { method: 'GET', headers: this.getHeaders() },
        5000
      );
      const latencyMs = Date.now() - start;
      if (!response.ok) {
        return { healthy: false, latencyMs, error: `API error: ${response.status}` };
      }
      return {
        healthy: true,
        latencyMs,
        models: this.getSupportedModels(),
        details: { billing: 'metered-capped', baseUrl: this.getBaseUrl() },
      };
    } catch (error) {
      return { healthy: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async generate(input: string | Message[], options?: GenerateOptions): Promise<LLMResponse> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw createLLMError('Cognitum API key not configured', 'API_KEY_MISSING', {
        provider: 'cognitum',
        retryable: false,
      });
    }

    const messages = this.formatMessages(input, options?.systemPrompt);
    const model = options?.model ?? this.config.model;
    const maxTokens = options?.maxTokens ?? this.config.maxTokens ?? 4096;
    const temperature = options?.temperature ?? this.config.temperature ?? 0.7;
    const requestId = `cognitum-${++this.requestId}-${Date.now()}`;
    const start = Date.now();

    const body: Record<string, unknown> = { model, max_tokens: maxTokens, temperature, messages };
    if (options?.stopSequences?.length) body.stop = options.stopSequences;

    try {
      const response = await this.fetchWithRetry(
        `${this.getBaseUrl()}/v1/chat/completions`,
        { method: 'POST', headers: this.getHeaders(), body: JSON.stringify(body) },
        options?.timeoutMs ?? this.config.timeoutMs ?? 60000,
        this.config.maxRetries ?? 3
      );
      const latencyMs = Date.now() - start;

      if (!response.ok) {
        throw await this.toApiError(response, model);
      }

      const data = (await response.json()) as CognitumCompletionResponse;
      const receipt = data.x_cognitum;

      const usage: TokenUsage = {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
        cacheReadTokens: data.usage.cache_read_tokens ?? 0,
      };

      const cost = this.receiptCost(receipt);

      TokenMetricsCollector.recordTokenUsage(requestId, 'cognitum-provider', 'llm', 'generate', {
        inputTokens: usage.promptTokens,
        outputTokens: usage.completionTokens,
        totalTokens: usage.totalTokens,
        estimatedCostUsd: cost.totalCost,
      });

      return {
        content: data.choices[0]?.message?.content ?? '',
        // Prefer the concrete resolved model from the receipt over the tier name.
        model: receipt?.resolved_model ?? data.model,
        provider: 'cognitum',
        usage,
        cost,
        latencyMs,
        finishReason: this.mapFinishReason(data.choices[0]?.finish_reason),
        cached: receipt?.cache === 'hit',
        requestId,
      };
    } catch (error) {
      if (error instanceof Error && 'code' in error) throw error;
      throw createLLMError(
        error instanceof Error ? error.message : 'Request failed',
        'NETWORK_ERROR',
        { provider: 'cognitum', model, retryable: true, cause: error as Error }
      );
    }
  }

  async embed(text: string, options?: EmbedOptions): Promise<EmbeddingResponse> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw createLLMError('Cognitum API key not configured', 'API_KEY_MISSING', {
        provider: 'cognitum',
        retryable: false,
      });
    }
    const model = options?.model ?? 'cognitum-embed';
    const start = Date.now();
    try {
      const response = await this.fetchWithTimeout(
        `${this.getBaseUrl()}/v1/embeddings`,
        {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify({ model, input: text }),
        },
        options?.timeoutMs ?? this.config.timeoutMs ?? 30000
      );
      const latencyMs = Date.now() - start;
      if (!response.ok) {
        throw await this.toApiError(response, model);
      }
      const data = (await response.json()) as CognitumEmbeddingResponse;
      return {
        embedding: data.data[0].embedding,
        model: data.x_cognitum?.resolved_model ?? data.model,
        provider: 'cognitum',
        tokenCount: data.usage.total_tokens,
        latencyMs,
        cached: false,
      };
    } catch (error) {
      if (error instanceof Error && 'code' in error) throw error;
      throw createLLMError(
        error instanceof Error ? error.message : 'Embedding request failed',
        'NETWORK_ERROR',
        { provider: 'cognitum', model, retryable: true, cause: error as Error }
      );
    }
  }

  async complete(prompt: string, options?: CompleteOptions): Promise<CompletionResponse> {
    const response = await this.generate(prompt, {
      model: options?.model,
      temperature: options?.temperature ?? 0.2,
      maxTokens: options?.maxTokens ?? 256,
      stopSequences: options?.stopSequences,
    });
    return {
      completion: response.content,
      model: response.model,
      provider: 'cognitum',
      usage: response.usage,
      latencyMs: response.latencyMs,
      cached: response.cached,
    };
  }

  getConfig(): CognitumConfig {
    return { ...this.config };
  }

  getSupportedModels(): string[] {
    return ['cognitum-auto', 'cognitum-low', 'cognitum-mid', 'cognitum-high'];
  }

  getCostPerToken(): { input: number; output: number } {
    // Cost is per-request from the receipt, not a fixed per-token table.
    return { input: 0, output: 0 };
  }

  async dispose(): Promise<void> {
    // No persistent resources.
  }

  /**
   * ADR-123: read the provider's server-side budget so `aqe health` and the
   * billing notice can show real remaining headroom. Returns undefined on any
   * failure (best-effort — never throws).
   */
  async getRemoteBudget(): Promise<CognitumBudget | undefined> {
    try {
      const response = await this.fetchWithTimeout(
        `${this.getBaseUrl()}/v1/usage`,
        { method: 'GET', headers: this.getHeaders() },
        5000
      );
      if (!response.ok) return undefined;
      const data = (await response.json()) as { budget?: Partial<CognitumBudget> };
      const b = data.budget;
      if (!b) return undefined;
      return {
        servingBudgetUsd: b.servingBudgetUsd ?? 0,
        hardCapUsd: b.hardCapUsd ?? 0,
        committedUsd: b.committedUsd ?? 0,
        headroomUsd: b.headroomUsd ?? 0,
        status: b.status ?? 'unknown',
        headroomExhausted: b.headroomExhausted ?? false,
      };
    } catch {
      return undefined;
    }
  }

  // -- internals -------------------------------------------------------------

  /** Build a CostInfo from the authoritative receipt price. */
  private receiptCost(receipt?: CognitumReceipt): CostInfo {
    const total = receipt?.price_usd ?? 0;
    return {
      inputCost: 0,
      outputCost: 0,
      totalCost: total,
      currency: 'USD',
      source: receipt?.price_usd !== undefined ? 'provider-receipt' : 'local-estimate',
    };
  }

  private getApiKey(): string | undefined {
    return this.config.apiKey ?? process.env.COGNITUM_API_KEY;
  }

  private getBaseUrl(): string {
    return (this.config.baseUrl ?? process.env.COGNITUM_BASE_URL ?? 'https://api.cognitum.one').replace(
      /\/$/,
      ''
    );
  }

  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'X-API-Key': this.getApiKey()!,
    };
  }

  private formatMessages(
    input: string | Message[],
    systemPrompt?: string
  ): Array<{ role: string; content: string }> {
    const messages: Array<{ role: string; content: string }> = [];
    if (typeof input === 'string') {
      if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
      messages.push({ role: 'user', content: input });
    } else {
      const hasSystem = input.some((m) => m.role === 'system');
      if (systemPrompt && !hasSystem) messages.push({ role: 'system', content: systemPrompt });
      for (const m of input) messages.push({ role: m.role, content: m.content });
    }
    return messages;
  }

  private mapFinishReason(
    reason: CognitumCompletionResponse['choices'][0]['finish_reason']
  ): LLMResponse['finishReason'] {
    switch (reason) {
      case 'length':
        return 'length';
      case 'content_filter':
        return 'content_filter';
      case 'stop':
      default:
        return 'stop';
    }
  }

  private async toApiError(response: Response, model: string) {
    const text = await response.text().catch(() => '');
    let message = text;
    try {
      const parsed = JSON.parse(text) as { error?: string; code?: string };
      message = parsed.error ?? text;
    } catch {
      // non-JSON body
    }
    switch (response.status) {
      case 401:
      case 403:
        return createLLMError(message || 'Unauthorized', 'API_KEY_INVALID', {
          provider: 'cognitum',
          model,
          retryable: false,
        });
      case 402:
        // Payment required / budget cap reached — the metered-capped pause.
        return createLLMError(message || 'Budget cap reached', 'COST_LIMIT_EXCEEDED', {
          provider: 'cognitum',
          model,
          retryable: false,
        });
      case 429:
        return createLLMError(message || 'Rate limited', 'RATE_LIMITED', {
          provider: 'cognitum',
          model,
          retryable: true,
          retryAfterMs: 60000,
        });
      case 500:
      case 502:
      case 503:
        return createLLMError(message || 'Provider unavailable', 'PROVIDER_UNAVAILABLE', {
          provider: 'cognitum',
          model,
          retryable: true,
          retryAfterMs: 5000,
        });
      default:
        return createLLMError(message || `HTTP ${response.status}`, 'UNKNOWN', {
          provider: 'cognitum',
          model,
          retryable: false,
        });
    }
  }

  private async fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeoutMs: number
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw createLLMError('Request timed out', 'TIMEOUT', {
          provider: 'cognitum',
          retryable: true,
        });
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async fetchWithRetry(
    url: string,
    options: RequestInit,
    timeoutMs: number,
    maxRetries: number
  ): Promise<Response> {
    let lastError: Error | undefined;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await this.fetchWithTimeout(url, options, timeoutMs);
        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          return response;
        }
        if (response.status >= 500 || response.status === 429) {
          if (attempt < maxRetries - 1) {
            await this.sleep(backoffDelay(attempt));
            continue;
          }
        }
        return response;
      } catch (error) {
        lastError = toError(error);
        if (attempt < maxRetries - 1) await this.sleep(backoffDelay(attempt));
      }
    }
    throw lastError ?? new Error('Request failed after retries');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
