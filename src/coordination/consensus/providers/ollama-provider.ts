/**
 * Agentic QE v3 - Ollama Model Provider
 * Local/on-prem model support for multi-model consensus verification
 *
 * Ollama provides access to local LLMs (Qwen3, gpt-oss, Llama 4, Gemma, etc.)
 * for privacy-sensitive verification or air-gapped environments.
 *
 * @see https://ollama.ai
 * @see docs/plans/AQE_V3_IMPROVEMENTS_PLAN.md - Phase 2: Multi-Model Verification
 */

import {
  ModelCompletionOptions,
  ModelHealthResult,
} from '../interfaces';
import { BaseModelProvider } from '../model-provider';
import { CONSENSUS_CONSTANTS, OLLAMA_CONSTANTS } from '../../constants.js';
import { toErrorMessage, toError } from '../../../shared/error-utils.js';
import { resolveOllamaBaseUrl } from '../../../shared/llm/ollama-url.js';

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Popular models available through Ollama
 * These are models that can be pulled and run locally. Tag availability
 * varies by Ollama library version — `ollama pull` to confirm.
 */
export type OllamaModel =
  // Qwen3 models (ADR-111: qwen3-coder:30b is the local QE default; never qwen3:8b)
  | 'qwen3-coder:30b'
  | 'qwen3:30b-a3b'
  // OpenAI open-weight models
  | 'gpt-oss:20b'
  | 'gpt-oss:120b'
  // Llama 4 models
  | 'llama4:scout'
  // Gemma models
  | 'gemma4'
  // Allow any model string for flexibility
  | string;

/**
 * Configuration for Ollama provider
 */
export interface OllamaProviderConfig {
  /** Ollama server URL (default: http://localhost:11434) */
  baseUrl?: string;

  /** Default model to use */
  defaultModel?: OllamaModel;

  /** Default timeout for requests (ms) */
  defaultTimeout?: number;

  /** Maximum retries on failure */
  maxRetries?: number;

  /** Retry delay in ms */
  retryDelayMs?: number;

  /** Enable request/response logging */
  enableLogging?: boolean;

  /** Custom options to pass to Ollama */
  options?: {
    /** Number of tokens to keep from prompt */
    num_ctx?: number;
    /** Temperature for sampling */
    temperature?: number;
    /** Top-p sampling */
    top_p?: number;
    /** Top-k sampling */
    top_k?: number;
    /** Number of GPU layers */
    num_gpu?: number;
  };
}

/**
 * Message format for Ollama Chat API
 */
interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Request format for Ollama Chat API
 */
interface OllamaChatRequest {
  model: string;
  messages: OllamaMessage[];
  stream?: boolean;
  options?: {
    num_ctx?: number;
    temperature?: number;
    top_p?: number;
    top_k?: number;
    num_predict?: number;
  };
}

/**
 * Response format from Ollama Chat API
 */
interface OllamaChatResponse {
  model: string;
  created_at: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

/**
 * Response format from Ollama Tags API (list models)
 */
interface OllamaTagsResponse {
  models: Array<{
    name: string;
    model: string;
    modified_at: string;
    size: number;
    digest: string;
    details: {
      parent_model: string;
      format: string;
      family: string;
      families: string[];
      parameter_size: string;
      quantization_level: string;
    };
  }>;
}

// ============================================================================
// Model Information
// ============================================================================

/**
 * Recommended models for security analysis
 */
export function getRecommendedOllamaModels(): OllamaModel[] {
  return [
    'qwen3-coder:30b',  // Best for code analysis (ADR-111 default)
    'gpt-oss:120b',     // Best reasoning
    'qwen3:30b-a3b',    // Strong general-purpose MoE
    'llama4:scout',     // Different model family for consensus diversity
  ];
}

/**
 * Lightweight models for faster response
 */
export function getLightweightOllamaModels(): OllamaModel[] {
  return [
    'gpt-oss:20b',
    'qwen3:30b-a3b',    // MoE: ~3B active params, fast despite its size
    'gemma4',
  ];
}

/**
 * Code-focused models
 */
export function getCodeOllamaModels(): OllamaModel[] {
  return [
    'qwen3-coder:30b',
    'gpt-oss:120b',
    'gpt-oss:20b',
  ];
}

// ============================================================================
// Ollama Provider Implementation
// ============================================================================

const DEFAULT_CONFIG: {
  baseUrl: string;
  defaultModel: OllamaModel;
  defaultTimeout: number;
  maxRetries: number;
  retryDelayMs: number;
  enableLogging: boolean;
} = {
  baseUrl: resolveOllamaBaseUrl(OLLAMA_CONSTANTS.DEFAULT_BASE_URL),
  defaultModel: 'qwen3-coder:30b' as OllamaModel,
  defaultTimeout: CONSENSUS_CONSTANTS.OLLAMA_TIMEOUT_MS, // 5 minutes (local models can be slow)
  maxRetries: 2,
  retryDelayMs: CONSENSUS_CONSTANTS.OLLAMA_RETRY_DELAY_MS,
  enableLogging: false,
};

/**
 * Ollama Model Provider
 *
 * Provides access to local LLMs for multi-model consensus verification.
 * Ideal for privacy-sensitive environments or air-gapped systems.
 *
 * @example
 * ```typescript
 * const provider = new OllamaModelProvider({
 *   baseUrl: 'http://localhost:11434',
 *   defaultModel: 'qwen3-coder:30b',
 * });
 *
 * const result = await provider.complete('Analyze this code for vulnerabilities...');
 * ```
 */
export class OllamaModelProvider extends BaseModelProvider {
  readonly id: string;
  readonly name: string;
  readonly type = 'ollama' as const;

  // Required by BaseModelProvider
  protected costPerToken = { input: 0, output: 0 }; // Local models are free
  protected supportedModels: string[] = [];

  private config: typeof DEFAULT_CONFIG & { options?: OllamaProviderConfig['options'] };
  private installedModels: string[] = [];

  constructor(config: OllamaProviderConfig = {}) {
    super();

    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };

    this.id = `ollama-${(this.config.defaultModel ?? 'default').replace(/[^a-z0-9]/gi, '-')}`;
    this.name = `Ollama (${this.config.defaultModel ?? 'default'})`;
  }

  /**
   * Get list of installed models (call listModels first)
   */
  getInstalledModels(): string[] {
    return [...this.installedModels];
  }

  /**
   * List models available on the Ollama server
   */
  async listModels(): Promise<string[]> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), CONSENSUS_CONSTANTS.OLLAMA_CONNECTION_TEST_TIMEOUT_MS);

      const response = await fetch(`${this.config.baseUrl}/api/tags`, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Failed to list models: ${response.status}`);
      }

      const data = await response.json() as OllamaTagsResponse;
      this.installedModels = data.models.map(m => m.name);
      this.supportedModels = this.installedModels;

      return this.installedModels;
    } catch (error) {
      if (this.config.enableLogging) {
        console.error('[Ollama] Failed to list models:', error);
      }
      return [];
    }
  }

  /**
   * Complete a prompt using Ollama
   */
  async complete(
    prompt: string,
    options?: ModelCompletionOptions
  ): Promise<string> {
    if (this.disposed) {
      throw new Error('Provider has been disposed');
    }

    const model = (options?.model as OllamaModel) || this.config.defaultModel;
    const maxTokens = options?.maxTokens || 4096;
    const temperature = options?.temperature ?? 0.7;
    const timeout = options?.timeout || this.config.defaultTimeout;
    const systemPrompt = options?.systemPrompt || this.getDefaultSystemPrompt();

    const request: OllamaChatRequest = {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      stream: false,
      options: {
        num_ctx: this.config.options?.num_ctx || 4096,
        temperature: temperature,
        top_p: this.config.options?.top_p,
        top_k: this.config.options?.top_k,
        num_predict: maxTokens,
      },
    };

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const response = await this.makeRequest(request, timeout);

        if (this.config.enableLogging) {
          console.log(`[Ollama] Model: ${model}, Tokens: ${response.eval_count || 'unknown'}`);
        }

        return response.message.content;
      } catch (error) {
        lastError = toError(error);

        // Don't retry on non-retryable errors
        if (this.isNonRetryableError(lastError)) {
          throw lastError;
        }

        // Wait before retry
        if (attempt < this.config.maxRetries) {
          const delay = this.config.retryDelayMs * Math.pow(2, attempt);
          if (this.config.enableLogging) {
            console.log(`[Ollama] Retry ${attempt + 1}/${this.config.maxRetries} after ${delay}ms`);
          }
          await this.sleep(delay);
        }
      }
    }

    throw lastError || new Error('All retries failed');
  }

  /**
   * Perform provider health check
   */
  protected async performHealthCheck(): Promise<ModelHealthResult> {
    try {
      const startTime = Date.now();

      // Check if Ollama is running by listing models
      const models = await this.listModels();
      const latency = Date.now() - startTime;

      if (models.length === 0) {
        return {
          healthy: false,
          error: 'Ollama is running but no models are installed',
          availableModels: [],
          latencyMs: latency,
        };
      }

      // Check if default model is available
      const defaultModelAvailable = models.some(m =>
        m === this.config.defaultModel || m.startsWith(this.config.defaultModel)
      );

      return {
        healthy: true,
        latencyMs: latency,
        availableModels: models,
        ...(defaultModelAvailable ? {} : {
          error: `Default model '${this.config.defaultModel}' not installed. Available: ${models.slice(0, 5).join(', ')}`,
        }),
      };
    } catch (error) {
      const message = toErrorMessage(error);

      // Provide helpful error messages
      let detailedError = message;
      if (message.includes('ECONNREFUSED') || message.includes('fetch failed')) {
        detailedError = `Cannot connect to Ollama at ${this.config.baseUrl}. Is Ollama running? Start with: ollama serve`;
      }

      return {
        healthy: false,
        error: detailedError,
        availableModels: [],
      };
    }
  }

  /**
   * Get cost per token (local models are free)
   */
  override getCostPerToken(): { input: number; output: number } {
    return { input: 0, output: 0 };
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Make a request to Ollama API
   */
  private async makeRequest(
    request: OllamaChatRequest,
    timeout: number
  ): Promise<OllamaChatResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(`${this.config.baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Ollama API error: ${response.status} - ${errorBody}`);
      }

      return (await response.json()) as OllamaChatResponse;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Check if an error is non-retryable
   */
  private isNonRetryableError(error: Error): boolean {
    const message = error.message.toLowerCase();
    return (
      message.includes('model not found') ||
      message.includes('model does not exist') ||
      message.includes('invalid model')
    );
  }

  /**
   * Sleep for a given duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get default system prompt for security verification
   */
  private getDefaultSystemPrompt(): string {
    return `You are a security expert analyzing code for vulnerabilities.
Your task is to verify security findings with high accuracy.
Be thorough but avoid false positives.
Always explain your reasoning clearly.
Format your response with: verdict (confirmed/rejected/uncertain), confidence (0-100), and reasoning.`;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a new Ollama provider
 *
 * @param config - Provider configuration
 * @returns OllamaModelProvider instance
 *
 * @example
 * ```typescript
 * // Default (localhost:11434, qwen3-coder:30b)
 * const provider = createOllamaProvider();
 *
 * // Custom model
 * const provider = createOllamaProvider({
 *   defaultModel: 'gpt-oss:20b',
 * });
 *
 * // Remote Ollama server
 * const provider = createOllamaProvider({
 *   baseUrl: 'http://gpu-server:11434',
 *   defaultModel: 'gpt-oss:120b',
 * });
 * ```
 */
export function createOllamaProvider(
  config?: OllamaProviderConfig
): OllamaModelProvider {
  return new OllamaModelProvider(config);
}

/**
 * Create multiple providers for different Ollama models
 *
 * @param models - List of models to create providers for
 * @param baseConfig - Base configuration for all providers
 * @returns Array of OllamaModelProvider instances
 */
export function createMultiOllamaProviders(
  models: OllamaModel[] = getRecommendedOllamaModels(),
  baseConfig?: Omit<OllamaProviderConfig, 'defaultModel'>
): OllamaModelProvider[] {
  return models.map(
    (model) =>
      new OllamaModelProvider({
        ...baseConfig,
        defaultModel: model,
      })
  );
}

/**
 * Check if Ollama is available and running
 *
 * @param baseUrl - Ollama server URL
 * @returns True if Ollama is running and accessible
 */
export async function isOllamaAvailable(
  baseUrl: string = resolveOllamaBaseUrl(OLLAMA_CONSTANTS.DEFAULT_BASE_URL)
): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${baseUrl}/api/tags`, {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    return false;
  }
}
