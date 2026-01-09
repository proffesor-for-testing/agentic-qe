/**
 * Agentic QE v3 - Ollama Provider
 * ADR-011: LLM Provider System for Quality Engineering
 *
 * Local LLM provider using Ollama for fast iteration and zero-cost development.
 * Supports Llama, Mistral, CodeLlama, and other local models.
 */

import {
  LLMProvider,
  LLMProviderType,
  OllamaConfig,
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
import { CostTracker } from '../cost-tracker';

/**
 * Default Ollama configuration
 */
export const DEFAULT_OLLAMA_CONFIG: OllamaConfig = {
  model: 'llama3.1',
  baseUrl: 'http://localhost:11434',
  maxTokens: 4096,
  temperature: 0.7,
  timeoutMs: 120000, // Longer timeout for local models
  maxRetries: 2,
  contextLength: 4096,
  keepAlive: '5m',
  enableCache: true,
  enableCircuitBreaker: true,
};

/**
 * Ollama API response types
 */
interface OllamaGenerateResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

interface OllamaChatResponse {
  model: string;
  created_at: string;
  message: {
    role: 'assistant';
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

interface OllamaEmbeddingResponse {
  embedding: number[];
}

interface OllamaTagsResponse {
  models?: Array<{
    name: string;
    model: string;
    modified_at: string;
    size: number;
    digest: string;
    details?: {
      parent_model?: string;
      format?: string;
      family?: string;
      families?: string[];
      parameter_size?: string;
      quantization_level?: string;
    };
  }>;
}

/**
 * Ollama LLM provider implementation
 */
export class OllamaProvider implements LLMProvider {
  readonly type: LLMProviderType = 'ollama';
  readonly name: string = 'Ollama (Local)';

  private config: OllamaConfig;
  private requestId: number = 0;
  private availableModels: string[] = [];

  constructor(config: Partial<OllamaConfig> = {}) {
    this.config = { ...DEFAULT_OLLAMA_CONFIG, ...config };
  }

  /**
   * Check if Ollama is available and running
   */
  async isAvailable(): Promise<boolean> {
    try {
      const result = await this.healthCheck();
      return result.healthy;
    } catch {
      return false;
    }
  }

  /**
   * Health check with latency measurement
   */
  async healthCheck(): Promise<HealthCheckResult> {
    const start = Date.now();

    try {
      const response = await this.fetchWithTimeout(
        `${this.getBaseUrl()}/api/tags`,
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        },
        5000
      );

      const latencyMs = Date.now() - start;

      if (!response.ok) {
        return {
          healthy: false,
          latencyMs,
          error: `Ollama server returned ${response.status}`,
        };
      }

      const data: OllamaTagsResponse = await response.json();

      // Extract available model names
      this.availableModels =
        data.models?.map((m) => m.name.split(':')[0]) ?? [];

      // Check if the configured model is available
      const hasConfiguredModel = this.availableModels.some(
        (m) =>
          m === this.config.model ||
          m.startsWith(this.config.model) ||
          this.config.model.startsWith(m)
      );

      if (!hasConfiguredModel && this.availableModels.length > 0) {
        return {
          healthy: true,
          latencyMs,
          models: this.availableModels,
          details: {
            warning: `Configured model '${this.config.model}' not found. Available: ${this.availableModels.join(', ')}`,
            defaultModel: this.config.model,
          },
        };
      }

      return {
        healthy: true,
        latencyMs,
        models: this.availableModels,
        details: {
          defaultModel: this.config.model,
          modelCount: this.availableModels.length,
        },
      };
    } catch (error) {
      return {
        healthy: false,
        error: `Ollama not running. Start with: ollama serve. Error: ${error instanceof Error ? error.message : 'Unknown'}`,
      };
    }
  }

  /**
   * Generate text from a prompt or messages
   */
  async generate(
    input: string | Message[],
    options?: GenerateOptions
  ): Promise<LLMResponse> {
    const model = options?.model ?? this.config.model;
    const maxTokens = options?.maxTokens ?? this.config.maxTokens ?? 4096;
    const temperature = options?.temperature ?? this.config.temperature ?? 0.7;
    const requestId = `ollama-${++this.requestId}-${Date.now()}`;

    const start = Date.now();

    // Use chat API for message arrays, generate API for simple prompts
    const useChatApi = Array.isArray(input);

    try {
      let response: Response;
      let content: string;
      let promptTokens: number;
      let completionTokens: number;

      if (useChatApi) {
        const messages = this.formatMessages(input, options?.systemPrompt);

        response = await this.fetchWithTimeout(
          `${this.getBaseUrl()}/api/chat`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model,
              messages,
              stream: false,
              options: {
                temperature,
                num_predict: maxTokens,
                stop: options?.stopSequences,
              },
            }),
          },
          options?.timeoutMs ?? this.config.timeoutMs ?? 120000
        );

        if (!response.ok) {
          throw await this.handleApiError(response, model);
        }

        const data: OllamaChatResponse = await response.json();
        content = data.message.content;
        promptTokens = data.prompt_eval_count ?? this.estimateTokens(JSON.stringify(messages));
        completionTokens = data.eval_count ?? this.estimateTokens(content);
      } else {
        const prompt = options?.systemPrompt
          ? `${options.systemPrompt}\n\n${input}`
          : input;

        response = await this.fetchWithTimeout(
          `${this.getBaseUrl()}/api/generate`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model,
              prompt,
              stream: false,
              options: {
                temperature,
                num_predict: maxTokens,
                stop: options?.stopSequences,
              },
            }),
          },
          options?.timeoutMs ?? this.config.timeoutMs ?? 120000
        );

        if (!response.ok) {
          throw await this.handleApiError(response, model);
        }

        const data: OllamaGenerateResponse = await response.json();
        content = data.response;
        promptTokens = data.prompt_eval_count ?? this.estimateTokens(prompt);
        completionTokens = data.eval_count ?? this.estimateTokens(content);
      }

      const latencyMs = Date.now() - start;

      const usage: TokenUsage = {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      };

      // Ollama is local/free, but we track for consistency
      const cost = CostTracker.calculateCost(model, usage);

      return {
        content,
        model,
        provider: 'ollama',
        usage,
        cost,
        latencyMs,
        finishReason: 'stop',
        cached: false,
        requestId,
      };
    } catch (error) {
      if (error instanceof Error && 'code' in error) {
        throw error; // Re-throw LLM errors
      }
      throw createLLMError(
        error instanceof Error ? error.message : 'Request failed',
        'NETWORK_ERROR',
        { provider: 'ollama', model, retryable: true, cause: error as Error }
      );
    }
  }

  /**
   * Generate embedding for text
   */
  async embed(text: string, options?: EmbedOptions): Promise<EmbeddingResponse> {
    const model = options?.model ?? 'nomic-embed-text';
    const start = Date.now();

    try {
      const response = await this.fetchWithTimeout(
        `${this.getBaseUrl()}/api/embeddings`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            prompt: text,
          }),
        },
        options?.timeoutMs ?? 30000
      );

      const latencyMs = Date.now() - start;

      if (!response.ok) {
        throw await this.handleApiError(response, model);
      }

      const data: OllamaEmbeddingResponse = await response.json();

      return {
        embedding: data.embedding,
        model,
        provider: 'ollama',
        tokenCount: this.estimateTokens(text),
        latencyMs,
        cached: false,
      };
    } catch (error) {
      if (error instanceof Error && 'code' in error) {
        throw error;
      }
      throw createLLMError(
        error instanceof Error ? error.message : 'Embedding request failed',
        'NETWORK_ERROR',
        { provider: 'ollama', model, retryable: true, cause: error as Error }
      );
    }
  }

  /**
   * Complete a partial text (code completion style)
   */
  async complete(
    prompt: string,
    options?: CompleteOptions
  ): Promise<CompletionResponse> {
    // Use generate with code-completion-optimized settings
    // Prefer codellama for code completion if available
    const model = options?.model ?? this.selectCodeModel();

    const response = await this.generate(prompt, {
      model,
      temperature: options?.temperature ?? 0.1, // Very low temperature for completion
      maxTokens: options?.maxTokens ?? 256, // Shorter for completion
      stopSequences: options?.stopSequences ?? ['\n\n', '```', '// ', '# '],
    });

    return {
      completion: response.content,
      model: response.model,
      provider: 'ollama',
      usage: response.usage,
      latencyMs: response.latencyMs,
      cached: response.cached,
    };
  }

  /**
   * Get current provider configuration
   */
  getConfig(): OllamaConfig {
    return { ...this.config };
  }

  /**
   * Get supported models (returns cached list from last health check)
   */
  getSupportedModels(): string[] {
    // Return known models plus any detected from health check
    const knownModels = [
      'llama3',
      'llama3.1',
      'llama3.2',
      'codellama',
      'mistral',
      'mixtral',
      'phi3',
      'qwen2',
      'gemma',
      'nomic-embed-text',
    ];

    const uniqueModels = new Set([...knownModels, ...this.availableModels]);
    return Array.from(uniqueModels);
  }

  /**
   * Get cost per token for current model (always 0 for local)
   */
  getCostPerToken(): { input: number; output: number } {
    return { input: 0, output: 0 };
  }

  /**
   * Dispose provider resources
   */
  async dispose(): Promise<void> {
    // No persistent resources to clean up
  }

  /**
   * Pull a model from Ollama registry
   */
  async pullModel(modelName: string): Promise<void> {
    try {
      const response = await this.fetchWithTimeout(
        `${this.getBaseUrl()}/api/pull`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: modelName, stream: false }),
        },
        600000 // 10 minute timeout for model pulls
      );

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to pull model: ${error}`);
      }
    } catch (error) {
      throw createLLMError(
        `Failed to pull model ${modelName}: ${error instanceof Error ? error.message : 'Unknown'}`,
        'MODEL_NOT_FOUND',
        { provider: 'ollama', model: modelName, retryable: true }
      );
    }
  }

  /**
   * Get base URL
   */
  private getBaseUrl(): string {
    return (this.config.baseUrl ?? 'http://localhost:11434').replace(/\/$/, '');
  }

  /**
   * Format input to messages array for chat API
   */
  private formatMessages(
    input: Message[],
    systemPrompt?: string
  ): Array<{ role: string; content: string }> {
    const messages: Array<{ role: string; content: string }> = [];

    // Include system prompt if provided
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }

    for (const m of input) {
      messages.push({ role: m.role, content: m.content });
    }

    return messages;
  }

  /**
   * Select the best available code model
   */
  private selectCodeModel(): string {
    const codeModels = ['codellama', 'llama3.1', 'llama3', 'mistral'];

    for (const model of codeModels) {
      if (
        this.availableModels.some(
          (m) => m === model || m.startsWith(model)
        )
      ) {
        return model;
      }
    }

    return this.config.model;
  }

  /**
   * Estimate token count (rough approximation)
   */
  private estimateTokens(text: string): number {
    // Rough estimate: ~4 characters per token for English text
    return Math.ceil(text.length / 4);
  }

  /**
   * Handle API errors
   */
  private async handleApiError(response: Response, model: string): Promise<never> {
    const errorText = await response.text().catch(() => 'Unknown error');

    if (response.status === 404) {
      throw createLLMError(
        `Model '${model}' not found. Pull it with: ollama pull ${model}`,
        'MODEL_NOT_FOUND',
        { provider: 'ollama', model, retryable: false }
      );
    }

    if (response.status === 500) {
      throw createLLMError(
        `Ollama server error: ${errorText}`,
        'PROVIDER_UNAVAILABLE',
        { provider: 'ollama', model, retryable: true, retryAfterMs: 1000 }
      );
    }

    throw createLLMError(
      `Ollama API error (${response.status}): ${errorText}`,
      'UNKNOWN',
      { provider: 'ollama', model, retryable: false }
    );
  }

  /**
   * Fetch with timeout
   */
  private async fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeoutMs: number
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      return response;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw createLLMError('Request timed out', 'TIMEOUT', {
          provider: 'ollama',
          retryable: true,
        });
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
