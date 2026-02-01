/**
 * Agentic QE v3 - Gemini Model Provider
 * MM-005: Google Gemini implementation for multi-model consensus verification
 *
 * Provides security finding verification using Google's Gemini models.
 * Supports Gemini Pro and Gemini Pro Vision with configurable parameters.
 *
 * @see docs/plans/AQE_V3_IMPROVEMENTS_PLAN.md - Phase 2: Multi-Model Verification
 */

import {
  ModelProvider,
  ModelCompletionOptions,
  ModelHealthResult,
} from '../interfaces';
import {
  BaseModelProvider,
  buildVerificationPrompt,
} from '../model-provider';

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Gemini-specific model versions
 */
export type GeminiModel =
  | 'gemini-1.5-pro-latest'
  | 'gemini-1.5-pro'
  | 'gemini-1.5-flash-latest'
  | 'gemini-1.5-flash'
  | 'gemini-pro';

/**
 * Configuration for Gemini provider
 */
export interface GeminiProviderConfig {
  /** Google API key */
  apiKey?: string;

  /** Default model to use */
  defaultModel?: GeminiModel;

  /** Base URL for Gemini API */
  baseUrl?: string;

  /** Default timeout for requests (ms) */
  defaultTimeout?: number;

  /** Maximum retries on failure */
  maxRetries?: number;

  /** Retry delay in ms */
  retryDelayMs?: number;

  /** Enable request/response logging */
  enableLogging?: boolean;
}

/**
 * Content part for Gemini API
 */
interface GeminiContentPart {
  text: string;
}

/**
 * Content for Gemini API
 */
interface GeminiContent {
  parts: GeminiContentPart[];
  role?: 'user' | 'model';
}

/**
 * Request format for Gemini generateContent API
 */
interface GeminiGenerateContentRequest {
  contents: GeminiContent[];
  generationConfig?: {
    temperature?: number;
    maxOutputTokens?: number;
    topP?: number;
    topK?: number;
  };
  safetySettings?: Array<{
    category: string;
    threshold: string;
  }>;
}

/**
 * Response format from Gemini generateContent API
 */
interface GeminiGenerateContentResponse {
  candidates: Array<{
    content: GeminiContent;
    finishReason: string;
    index: number;
    safetyRatings?: Array<{
      category: string;
      probability: string;
    }>;
  }>;
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}

/**
 * Error response from Gemini API
 */
interface GeminiErrorResponse {
  error: {
    code: number;
    message: string;
    status: string;
  };
}

// ============================================================================
// Gemini Model Provider Implementation
// ============================================================================

/**
 * Gemini model provider for consensus verification
 *
 * Uses Google's Gemini models to verify security findings through
 * the generateContent API. Provides robust error handling, retries,
 * and configurable timeouts.
 *
 * @example
 * ```typescript
 * const provider = new GeminiModelProvider({
 *   apiKey: process.env.GOOGLE_API_KEY,
 *   defaultModel: 'gemini-1.5-pro-latest',
 * });
 *
 * const response = await provider.complete(prompt);
 * ```
 */
export class GeminiModelProvider extends BaseModelProvider {
  readonly id = 'gemini';
  readonly name = 'Google Gemini';
  readonly type: ModelProvider['type'] = 'gemini';

  // Cost per million tokens (as of 2024)
  // Gemini Pro: $0.50 input, $1.50 output per 1M tokens (up to 128k context)
  // Gemini 1.5 Pro: $3.50 input, $10.50 output per 1M tokens
  // Gemini 1.5 Flash: $0.35 input, $1.05 output per 1M tokens
  protected costPerToken = {
    input: 3.5 / 1_000_000,  // Will be overridden per model
    output: 10.5 / 1_000_000,
  };

  protected supportedModels: string[] = [
    'gemini-1.5-pro-latest',
    'gemini-1.5-pro',
    'gemini-1.5-flash-latest',
    'gemini-1.5-flash',
    'gemini-pro',
  ];

  private readonly config: Required<GeminiProviderConfig>;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  /**
   * Create a new Gemini provider
   *
   * @param config - Provider configuration
   * @throws {Error} If API key is not provided
   */
  constructor(config: GeminiProviderConfig = {}) {
    super();

    // Get API key from config or environment
    const apiKey = config.apiKey || process.env.GOOGLE_API_KEY || '';
    if (!apiKey) {
      throw new Error(
        'Google API key is required. Provide via config.apiKey or GOOGLE_API_KEY environment variable.'
      );
    }

    this.apiKey = apiKey;
    this.baseUrl = config.baseUrl || 'https://generativelanguage.googleapis.com';

    this.config = {
      apiKey,
      defaultModel: config.defaultModel || 'gemini-1.5-pro-latest',
      baseUrl: this.baseUrl,
      defaultTimeout: config.defaultTimeout || 30000,
      maxRetries: config.maxRetries ?? 3,
      retryDelayMs: config.retryDelayMs || 1000,
      enableLogging: config.enableLogging || false,
    };

    // Update cost based on default model
    this.updateCostForModel(this.config.defaultModel);
  }

  /**
   * Complete a prompt using Gemini
   *
   * @param prompt - The prompt to complete
   * @param options - Optional completion options
   * @returns Promise resolving to completion text
   */
  async complete(prompt: string, options?: ModelCompletionOptions): Promise<string> {
    if (this.disposed) {
      throw new Error('Provider has been disposed');
    }

    const model = (options?.model as GeminiModel) || this.config.defaultModel;
    const maxTokens = options?.maxTokens || 4096;
    const temperature = options?.temperature ?? 0.7;
    const timeout = options?.timeout || this.config.defaultTimeout;
    const systemPrompt = options?.systemPrompt || this.getDefaultSystemPrompt();

    // Gemini doesn't have a separate system role, so we prepend system prompt to user prompt
    const combinedPrompt = `${systemPrompt}\n\n${prompt}`;

    const request: GeminiGenerateContentRequest = {
      contents: [
        {
          parts: [
            {
              text: combinedPrompt,
            },
          ],
        },
      ],
      generationConfig: {
        temperature,
        maxOutputTokens: maxTokens,
      },
      // Set safety settings to allow security analysis content
      safetySettings: [
        {
          category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
          threshold: 'BLOCK_NONE',
        },
        {
          category: 'HARM_CATEGORY_HARASSMENT',
          threshold: 'BLOCK_NONE',
        },
        {
          category: 'HARM_CATEGORY_HATE_SPEECH',
          threshold: 'BLOCK_NONE',
        },
        {
          category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
          threshold: 'BLOCK_NONE',
        },
      ],
    };

    if (this.config.enableLogging) {
      console.log(`[Gemini] Sending request to ${model}`);
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const response = await this.makeRequest(model, request, timeout);

        if (this.config.enableLogging) {
          const usage = response.usageMetadata;
          if (usage) {
            console.log(`[Gemini] Received response (${usage.promptTokenCount} in, ${usage.candidatesTokenCount} out)`);
          }
        }

        // Extract text from first candidate
        if (!response.candidates || response.candidates.length === 0) {
          throw new Error('Gemini returned no candidates');
        }

        const candidate = response.candidates[0];

        if (candidate.finishReason === 'SAFETY') {
          throw new Error('Gemini blocked response due to safety settings');
        }

        const text = candidate.content.parts
          .map(part => part.text)
          .join('\n');

        return text;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on certain errors
        if (this.isNonRetryableError(error)) {
          throw lastError;
        }

        // Retry with exponential backoff
        if (attempt < this.config.maxRetries) {
          const delay = this.config.retryDelayMs * Math.pow(2, attempt);
          if (this.config.enableLogging) {
            console.log(`[Gemini] Retry ${attempt + 1}/${this.config.maxRetries} after ${delay}ms`);
          }
          await this.sleep(delay);
        }
      }
    }

    throw new Error(
      `Gemini completion failed after ${this.config.maxRetries + 1} attempts: ${lastError?.message}`
    );
  }

  /**
   * Make HTTP request to Gemini API
   */
  private async makeRequest(
    model: string,
    request: GeminiGenerateContentRequest,
    timeout: number
  ): Promise<GeminiGenerateContentResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      // Gemini API endpoint format: /v1beta/models/{model}:generateContent?key={apiKey}
      const url = `${this.baseUrl}/v1beta/models/${model}:generateContent?key=${this.apiKey}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorData = (await response.json()) as GeminiErrorResponse;
        throw new Error(
          `Gemini API error (${response.status}): ${errorData.error.message}`
        );
      }

      return (await response.json()) as GeminiGenerateContentResponse;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Perform health check
   */
  protected async performHealthCheck(): Promise<ModelHealthResult> {
    const startTime = Date.now();

    try {
      // Make a minimal request to check API availability
      const testPrompt = 'Hello';
      await this.complete(testPrompt, {
        maxTokens: 10,
        timeout: 5000,
      });

      return {
        healthy: true,
        latencyMs: Date.now() - startTime,
        availableModels: this.supportedModels,
      };
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : String(error),
        availableModels: this.supportedModels,
      };
    }
  }

  /**
   * Get default system prompt for security analysis
   */
  private getDefaultSystemPrompt(): string {
    return `You are a security expert specializing in code security analysis and vulnerability assessment.

Your role is to carefully analyze security findings and determine their validity. You should:

1. Examine the evidence objectively
2. Consider both true positives and false positives
3. Assess the severity accurately
4. Provide clear, actionable reasoning
5. Suggest concrete remediation steps when appropriate

Focus on accuracy over speed. It's better to mark something as "INCONCLUSIVE" if you're unsure than to give an incorrect assessment.`;
  }

  /**
   * Check if an error should not be retried
   */
  private isNonRetryableError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    const message = error.message.toLowerCase();

    // Don't retry authentication errors
    if (message.includes('invalid api key') || message.includes('unauthorized')) {
      return true;
    }

    // Don't retry invalid request errors
    if (message.includes('invalid argument') || message.includes('invalid request')) {
      return true;
    }

    // Don't retry quota errors
    if (message.includes('quota exceeded') || message.includes('resource exhausted')) {
      return true;
    }

    // Don't retry safety blocking
    if (message.includes('safety settings')) {
      return true;
    }

    return false;
  }

  /**
   * Update cost based on model selection
   */
  private updateCostForModel(model: string): void {
    if (model.includes('flash')) {
      // Gemini 1.5 Flash: $0.35 input, $1.05 output per 1M tokens
      this.costPerToken = {
        input: 0.35 / 1_000_000,
        output: 1.05 / 1_000_000,
      };
    } else if (model.includes('1.5')) {
      // Gemini 1.5 Pro: $3.50 input, $10.50 output per 1M tokens
      this.costPerToken = {
        input: 3.5 / 1_000_000,
        output: 10.5 / 1_000_000,
      };
    } else {
      // Gemini Pro: $0.50 input, $1.50 output per 1M tokens
      this.costPerToken = {
        input: 0.5 / 1_000_000,
        output: 1.5 / 1_000_000,
      };
    }
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get cost per token for current model
   */
  override getCostPerToken(): { input: number; output: number } {
    return { ...this.costPerToken };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a Gemini model provider
 *
 * @param config - Optional provider configuration
 * @returns Configured Gemini provider
 *
 * @example
 * ```typescript
 * const provider = createGeminiProvider({
 *   apiKey: process.env.GOOGLE_API_KEY,
 *   defaultModel: 'gemini-1.5-pro-latest',
 * });
 * ```
 */
export function createGeminiProvider(config?: GeminiProviderConfig): GeminiModelProvider {
  return new GeminiModelProvider(config);
}
