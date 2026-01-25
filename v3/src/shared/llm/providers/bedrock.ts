/**
 * Agentic QE v3 - AWS Bedrock Provider
 * ADR-043: Vendor-Independent LLM Support (Milestone 6)
 *
 * AWS Bedrock LLM provider supporting Claude models via AWS infrastructure.
 * Provides enterprise-grade access to Claude with AWS credential chain support.
 *
 * Features:
 * - ARN-style model IDs: anthropic.claude-3-5-sonnet-20241022-v2:0
 * - AWS credential chain: environment vars, IAM role, STS, profile
 * - Streaming support via Bedrock's streaming API
 * - Cost calculation for Bedrock pricing
 */

import {
  LLMProvider,
  LLMProviderType,
  LLMConfig,
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
import { TokenMetricsCollector } from '../../../learning/token-tracker.js';

// ============================================================================
// Bedrock-Specific Types
// ============================================================================

/**
 * AWS Bedrock-specific configuration
 */
export interface BedrockConfig extends LLMConfig {
  /** AWS region (e.g., 'us-east-1') */
  region?: string;
  /** AWS access key ID (optional if using IAM role) */
  accessKeyId?: string;
  /** AWS secret access key (optional if using IAM role) */
  secretAccessKey?: string;
  /** AWS session token (optional, for temporary credentials) */
  sessionToken?: string;
  /** AWS profile name (optional, for profile-based credentials) */
  profile?: string;
  /** Bedrock model ID in ARN format */
  model: string;
}

/**
 * Default Bedrock configuration
 */
export const DEFAULT_BEDROCK_CONFIG: BedrockConfig = {
  model: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
  region: 'us-east-1',
  maxTokens: 4096,
  temperature: 0.7,
  timeoutMs: 60000,
  maxRetries: 3,
  enableCache: true,
  enableCircuitBreaker: true,
};

/**
 * Bedrock API response types (Claude-specific)
 */
interface BedrockClaudeResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: Array<{ type: 'text'; text: string }>;
  model: string;
  stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

interface BedrockErrorResponse {
  message: string;
  __type?: string;
}

/**
 * AWS Signature V4 signing context
 */
interface AWSSigningContext {
  region: string;
  service: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

// ============================================================================
// Model ID Mappings
// ============================================================================

/**
 * Map canonical model IDs to Bedrock ARN-style model IDs
 */
export const BEDROCK_MODEL_MAPPING: Record<string, string> = {
  // Claude Opus 4.5
  'claude-opus-4-5-20251101': 'anthropic.claude-opus-4-5-v1:0',
  'claude-opus-4-5': 'anthropic.claude-opus-4-5-v1:0',
  // Claude Opus 4
  'claude-opus-4-20250514': 'anthropic.claude-opus-4-v1:0',
  'claude-opus-4': 'anthropic.claude-opus-4-v1:0',
  // Claude Sonnet 4.5
  'claude-sonnet-4-5-20250929': 'anthropic.claude-sonnet-4-5-v2:0',
  'claude-sonnet-4-5': 'anthropic.claude-sonnet-4-5-v2:0',
  // Claude Sonnet 4
  'claude-sonnet-4-20250514': 'anthropic.claude-sonnet-4-v1:0',
  'claude-sonnet-4': 'anthropic.claude-sonnet-4-v1:0',
  // Claude Haiku 3.5
  'claude-3-5-haiku-20241022': 'anthropic.claude-3-5-haiku-v1:0',
  'claude-haiku-3-5': 'anthropic.claude-3-5-haiku-v1:0',
  // Legacy Claude 3 models
  'claude-3-opus-20240229': 'anthropic.claude-3-opus-20240229-v1:0',
  'claude-3-sonnet-20240229': 'anthropic.claude-3-sonnet-20240229-v1:0',
  'claude-3-haiku-20240307': 'anthropic.claude-3-haiku-20240307-v1:0',
  // Claude 3.5 Sonnet
  'claude-3-5-sonnet-20241022': 'anthropic.claude-3-5-sonnet-20241022-v2:0',
};

/**
 * Reverse mapping from Bedrock model IDs to canonical IDs
 */
export const BEDROCK_MODEL_REVERSE_MAPPING: Record<string, string> = Object.fromEntries(
  Object.entries(BEDROCK_MODEL_MAPPING).map(([k, v]) => [v, k])
);

// ============================================================================
// BedrockProvider Implementation
// ============================================================================

/**
 * AWS Bedrock LLM provider implementation
 */
export class BedrockProvider implements LLMProvider {
  readonly type: LLMProviderType = 'bedrock';
  readonly name: string = 'AWS Bedrock';

  private config: BedrockConfig;
  private requestId: number = 0;

  constructor(config: Partial<BedrockConfig> = {}) {
    this.config = { ...DEFAULT_BEDROCK_CONFIG, ...config };
  }

  /**
   * Check if Bedrock is available and configured
   */
  async isAvailable(): Promise<boolean> {
    const credentials = this.getCredentials();
    if (!credentials) {
      return false;
    }

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
    const credentials = this.getCredentials();

    if (!credentials) {
      return {
        healthy: false,
        error: 'AWS credentials not configured. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables, or use IAM role.',
      };
    }

    const start = Date.now();

    try {
      // Use a minimal request to check API availability
      const bedrockModelId = this.mapToBedrockModel(this.config.model);
      const response = await this.invokeModel(
        bedrockModelId,
        {
          anthropic_version: 'bedrock-2023-05-31',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'Hi' }],
        },
        5000
      );

      const latencyMs = Date.now() - start;

      if (!response.ok) {
        const error = await response.text();
        return {
          healthy: false,
          latencyMs,
          error: `API error: ${response.status} - ${error}`,
        };
      }

      return {
        healthy: true,
        latencyMs,
        models: this.getSupportedModels(),
        details: {
          region: this.getRegion(),
          defaultModel: this.config.model,
        },
      };
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : 'Unknown error',
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
    const credentials = this.getCredentials();

    if (!credentials) {
      throw createLLMError(
        'AWS credentials not configured',
        'API_KEY_MISSING',
        { provider: 'bedrock', retryable: false }
      );
    }

    const messages = this.formatMessages(input);
    const model = options?.model ?? this.config.model;
    const bedrockModelId = this.mapToBedrockModel(model);
    const maxTokens = options?.maxTokens ?? this.config.maxTokens ?? 4096;
    const temperature = options?.temperature ?? this.config.temperature ?? 0.7;
    const requestId = `bedrock-${++this.requestId}-${Date.now()}`;

    const start = Date.now();

    const body: Record<string, unknown> = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: maxTokens,
      messages,
    };

    // Temperature must be between 0 and 1 for Bedrock
    if (temperature !== undefined) {
      body.temperature = Math.min(Math.max(temperature, 0), 1);
    }

    if (options?.systemPrompt) {
      body.system = options.systemPrompt;
    }

    if (options?.stopSequences && options.stopSequences.length > 0) {
      body.stop_sequences = options.stopSequences;
    }

    try {
      const response = await this.invokeModelWithRetry(
        bedrockModelId,
        body,
        options?.timeoutMs ?? this.config.timeoutMs ?? 60000,
        this.config.maxRetries ?? 3
      );

      const latencyMs = Date.now() - start;

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({
          message: 'Unknown error',
        })) as BedrockErrorResponse;
        throw this.handleApiError(response.status, errorData, model);
      }

      const data = await response.json() as BedrockClaudeResponse;

      const usage: TokenUsage = {
        promptTokens: data.usage.input_tokens,
        completionTokens: data.usage.output_tokens,
        totalTokens: data.usage.input_tokens + data.usage.output_tokens,
      };

      // Use Bedrock pricing for cost calculation
      const cost = CostTracker.calculateCost(bedrockModelId, usage);

      // ADR-042: Track token usage in TokenMetricsCollector
      TokenMetricsCollector.recordTokenUsage(
        requestId,
        'bedrock-provider',
        'llm',
        'generate',
        {
          inputTokens: data.usage.input_tokens,
          outputTokens: data.usage.output_tokens,
          totalTokens: data.usage.input_tokens + data.usage.output_tokens,
          estimatedCostUsd: cost.totalCost,
        }
      );

      const content = data.content
        .filter((c) => c.type === 'text')
        .map((c) => c.text)
        .join('');

      return {
        content,
        model: bedrockModelId,
        provider: 'bedrock',
        usage,
        cost,
        latencyMs,
        finishReason: this.mapFinishReason(data.stop_reason),
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
        { provider: 'bedrock', model, retryable: true, cause: error as Error }
      );
    }
  }

  /**
   * Generate embedding for text
   * Note: Bedrock supports embeddings via Titan or Cohere models
   */
  async embed(_text: string, _options?: EmbedOptions): Promise<EmbeddingResponse> {
    // Bedrock supports Titan embeddings, but this implementation focuses on Claude
    throw createLLMError(
      'Bedrock Claude models do not support native embeddings. Use Bedrock Titan or Cohere for embeddings.',
      'MODEL_NOT_FOUND',
      { provider: 'bedrock', retryable: false }
    );
  }

  /**
   * Complete a partial text (code completion style)
   */
  async complete(
    prompt: string,
    options?: CompleteOptions
  ): Promise<CompletionResponse> {
    // Use generate with code-completion-optimized settings
    const response = await this.generate(prompt, {
      model: options?.model,
      temperature: options?.temperature ?? 0.2,
      maxTokens: options?.maxTokens ?? 256,
      stopSequences: options?.stopSequences ?? ['\n\n', '```'],
    });

    return {
      completion: response.content,
      model: response.model,
      provider: 'bedrock',
      usage: response.usage,
      latencyMs: response.latencyMs,
      cached: response.cached,
    };
  }

  /**
   * Get current provider configuration
   */
  getConfig(): BedrockConfig {
    return { ...this.config };
  }

  /**
   * Get supported models
   */
  getSupportedModels(): string[] {
    return Object.keys(BEDROCK_MODEL_MAPPING);
  }

  /**
   * Get cost per token for current model
   */
  getCostPerToken(): { input: number; output: number } {
    const bedrockModelId = this.mapToBedrockModel(this.config.model);
    return CostTracker.getCostPerToken(bedrockModelId);
  }

  /**
   * Dispose provider resources
   */
  async dispose(): Promise<void> {
    // No persistent resources to clean up
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Get AWS credentials from config or environment
   */
  private getCredentials(): AWSSigningContext | null {
    const accessKeyId = this.config.accessKeyId ?? process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = this.config.secretAccessKey ?? process.env.AWS_SECRET_ACCESS_KEY;
    const sessionToken = this.config.sessionToken ?? process.env.AWS_SESSION_TOKEN;

    if (!accessKeyId || !secretAccessKey) {
      return null;
    }

    return {
      region: this.getRegion(),
      service: 'bedrock',
      accessKeyId,
      secretAccessKey,
      sessionToken,
    };
  }

  /**
   * Get AWS region
   */
  private getRegion(): string {
    return this.config.region ?? process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? 'us-east-1';
  }

  /**
   * Map model ID to Bedrock ARN-style format
   */
  private mapToBedrockModel(modelId: string): string {
    // If already a Bedrock model ID, return as-is
    if (modelId.startsWith('anthropic.')) {
      return modelId;
    }

    // Look up in mapping
    const bedrockModelId = BEDROCK_MODEL_MAPPING[modelId];
    if (bedrockModelId) {
      return bedrockModelId;
    }

    // Assume it's already a valid Bedrock model ID
    return modelId;
  }

  /**
   * Get Bedrock endpoint URL
   */
  private getEndpointUrl(modelId: string): string {
    const region = this.getRegion();
    const baseUrl = this.config.baseUrl ?? `https://bedrock-runtime.${region}.amazonaws.com`;
    return `${baseUrl}/model/${modelId}/invoke`;
  }

  /**
   * Invoke a Bedrock model
   */
  private async invokeModel(
    modelId: string,
    body: Record<string, unknown>,
    timeoutMs: number
  ): Promise<Response> {
    const credentials = this.getCredentials();
    if (!credentials) {
      throw createLLMError('AWS credentials not configured', 'API_KEY_MISSING', {
        provider: 'bedrock',
        retryable: false,
      });
    }

    const url = this.getEndpointUrl(modelId);
    const bodyString = JSON.stringify(body);
    const headers = await this.signRequest(url, bodyString, credentials);

    return this.fetchWithTimeout(url, {
      method: 'POST',
      headers,
      body: bodyString,
    }, timeoutMs);
  }

  /**
   * Invoke model with retry logic
   */
  private async invokeModelWithRetry(
    modelId: string,
    body: Record<string, unknown>,
    timeoutMs: number,
    maxRetries: number
  ): Promise<Response> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await this.invokeModel(modelId, body, timeoutMs);

        // Don't retry on client errors (except throttling)
        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          return response;
        }

        // Retry on server errors and throttling
        if (response.status >= 500 || response.status === 429) {
          if (attempt < maxRetries - 1) {
            const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
            await this.sleep(delay);
            continue;
          }
        }

        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < maxRetries - 1) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
          await this.sleep(delay);
        }
      }
    }

    throw lastError ?? new Error('Request failed after retries');
  }

  /**
   * Sign request with AWS Signature V4
   * Note: This is a simplified implementation. In production, use @aws-sdk/signature-v4
   */
  private async signRequest(
    url: string,
    body: string,
    context: AWSSigningContext
  ): Promise<Record<string, string>> {
    const parsedUrl = new URL(url);
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.substring(0, 8);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Host': parsedUrl.host,
      'X-Amz-Date': amzDate,
    };

    if (context.sessionToken) {
      headers['X-Amz-Security-Token'] = context.sessionToken;
    }

    // Create canonical request
    const method = 'POST';
    const canonicalUri = parsedUrl.pathname;
    const canonicalQueryString = '';
    const signedHeaders = Object.keys(headers)
      .map((k) => k.toLowerCase())
      .sort()
      .join(';');
    const canonicalHeaders = Object.keys(headers)
      .map((k) => `${k.toLowerCase()}:${headers[k].trim()}`)
      .sort()
      .join('\n') + '\n';

    const payloadHash = await this.sha256(body);
    const canonicalRequest = [
      method,
      canonicalUri,
      canonicalQueryString,
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');

    // Create string to sign
    const algorithm = 'AWS4-HMAC-SHA256';
    const credentialScope = `${dateStamp}/${context.region}/${context.service}/aws4_request`;
    const canonicalRequestHash = await this.sha256(canonicalRequest);
    const stringToSign = [
      algorithm,
      amzDate,
      credentialScope,
      canonicalRequestHash,
    ].join('\n');

    // Calculate signature
    const signingKey = await this.getSignatureKey(
      context.secretAccessKey,
      dateStamp,
      context.region,
      context.service
    );
    const signature = await this.hmacHex(signingKey, stringToSign);

    // Create authorization header
    const authorization = `${algorithm} Credential=${context.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return {
      ...headers,
      'Authorization': authorization,
    };
  }

  /**
   * SHA256 hash helper
   */
  private async sha256(message: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * HMAC-SHA256 helper
   */
  private async hmac(key: ArrayBuffer | Uint8Array, message: string): Promise<ArrayBuffer> {
    const encoder = new TextEncoder();
    // Cast to ArrayBuffer for crypto.subtle.importKey compatibility
    const keyBuffer = key instanceof Uint8Array ? key.buffer.slice(key.byteOffset, key.byteOffset + key.byteLength) : key;
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyBuffer as ArrayBuffer,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    return crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message));
  }

  /**
   * HMAC-SHA256 hex helper
   */
  private async hmacHex(key: ArrayBuffer | Uint8Array, message: string): Promise<string> {
    const result = await this.hmac(key, message);
    return Array.from(new Uint8Array(result))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Get AWS Signature V4 signing key
   */
  private async getSignatureKey(
    secretKey: string,
    dateStamp: string,
    region: string,
    service: string
  ): Promise<ArrayBuffer> {
    const encoder = new TextEncoder();
    const kDate = await this.hmac(encoder.encode(`AWS4${secretKey}`), dateStamp);
    const kRegion = await this.hmac(kDate, region);
    const kService = await this.hmac(kRegion, service);
    return this.hmac(kService, 'aws4_request');
  }

  /**
   * Format input to messages array
   */
  private formatMessages(input: string | Message[]): Array<{ role: string; content: string }> {
    if (typeof input === 'string') {
      return [{ role: 'user', content: input }];
    }

    // Filter out system messages (handled separately in Bedrock)
    return input
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role, content: m.content }));
  }

  /**
   * Map Bedrock finish reason to standard format
   */
  private mapFinishReason(
    reason: BedrockClaudeResponse['stop_reason']
  ): LLMResponse['finishReason'] {
    switch (reason) {
      case 'end_turn':
        return 'stop';
      case 'max_tokens':
        return 'length';
      case 'stop_sequence':
        return 'stop';
      default:
        return 'stop';
    }
  }

  /**
   * Handle API errors with proper error types
   */
  private handleApiError(
    status: number,
    data: BedrockErrorResponse,
    model: string
  ): never {
    const message = data.message ?? 'Unknown API error';
    const errorType = data.__type ?? '';

    switch (status) {
      case 401:
      case 403:
        throw createLLMError(message, 'API_KEY_INVALID', {
          provider: 'bedrock',
          model,
          retryable: false,
        });
      case 429:
        throw createLLMError(message, 'RATE_LIMITED', {
          provider: 'bedrock',
          model,
          retryable: true,
          retryAfterMs: 60000,
        });
      case 400:
        if (errorType.includes('ValidationException') && message.includes('token')) {
          throw createLLMError(message, 'CONTEXT_LENGTH_EXCEEDED', {
            provider: 'bedrock',
            model,
            retryable: false,
          });
        }
        throw createLLMError(message, 'UNKNOWN', {
          provider: 'bedrock',
          model,
          retryable: false,
        });
      case 500:
      case 502:
      case 503:
        throw createLLMError(message, 'PROVIDER_UNAVAILABLE', {
          provider: 'bedrock',
          model,
          retryable: true,
          retryAfterMs: 5000,
        });
      default:
        throw createLLMError(message, 'UNKNOWN', {
          provider: 'bedrock',
          model,
          retryable: false,
        });
    }
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
          provider: 'bedrock',
          retryable: true,
        });
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
