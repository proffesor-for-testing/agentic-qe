/**
 * Agentic QE v3 - Ollama API Client
 * Client for Ollama embeddings API with retry logic
 */

import { toError } from '../error-utils.js';
import {
  OllamaEmbeddingRequest,
  OllamaEmbeddingResponse,
  OllamaHealthResponse,
  EMBEDDING_CONFIG,
} from './types';
import { resolveOllamaBaseUrl } from '../llm/ollama-url.js';

/**
 * Client for Ollama API
 */
export class OllamaClient {
  private baseUrl: string;
  private maxRetries: number;
  private retryDelayMs: number;
  private timeoutMs: number;

  constructor(
    baseUrl: string = resolveOllamaBaseUrl(EMBEDDING_CONFIG.DEFAULT_OLLAMA_URL),
    maxRetries: number = EMBEDDING_CONFIG.MAX_RETRIES,
    retryDelayMs: number = EMBEDDING_CONFIG.RETRY_DELAY_MS,
    timeoutMs: number = EMBEDDING_CONFIG.TIMEOUT_MS
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.maxRetries = maxRetries;
    this.retryDelayMs = retryDelayMs;
    this.timeoutMs = timeoutMs;
  }

  /**
   * Check if Ollama is running and the configured embedding model is available
   */
  async healthCheck(): Promise<boolean> {
    try {
      return await this.fetchWithTimeout(
        `${this.baseUrl}/api/tags`,
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        },
        5000, // Shorter timeout for health check
        async (response) => {
          if (!response.ok) return false;
          const data = await response.json() as OllamaHealthResponse;

          // Check if configured embedding model is available
          // Match the configured model exactly, allowing its existing tag suffix.
          if (data.models) {
            return data.models.some(
              (model) =>
                model.name === EMBEDDING_CONFIG.MODEL ||
                model.name?.startsWith(`${EMBEDDING_CONFIG.MODEL}:`) ||
                model.model === EMBEDDING_CONFIG.MODEL ||
                model.model?.startsWith(`${EMBEDDING_CONFIG.MODEL}:`)
            );
          }
          return false;
        }
      );
    } catch {
      return false;
    }
  }

  /**
   * Generate embedding for a single text prompt
   */
  async generateEmbedding(prompt: string): Promise<number[]> {
    const request: OllamaEmbeddingRequest = {
      model: EMBEDDING_CONFIG.MODEL,
      prompt,
    };

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const data = await this.fetchWithTimeout(
          `${this.baseUrl}/api/embeddings`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request),
          },
          this.timeoutMs,
          async (response) => {
            if (!response.ok) {
              const errorText = await response.text();
              throw new Error(`Ollama API error (${response.status}): ${errorText}`);
            }
            return await response.json() as OllamaEmbeddingResponse;
          }
        );

        // Validate embedding dimensions
        if (data.embedding.length !== EMBEDDING_CONFIG.DIMENSIONS) {
          throw new Error(
            `Invalid embedding dimensions: expected ${EMBEDDING_CONFIG.DIMENSIONS}, got ${data.embedding.length}`
          );
        }

        return data.embedding;
      } catch (error) {
        lastError = toError(error);

        // Don't retry on validation errors
        if (lastError.message.includes('Invalid embedding dimensions')) {
          throw lastError;
        }

        // Wait before retrying (exponential backoff)
        if (attempt < this.maxRetries - 1) {
          const delay = this.retryDelayMs * Math.pow(2, attempt);
          await this.sleep(delay);
        }
      }
    }

    throw new Error(
      `Failed to generate embedding after ${this.maxRetries} attempts: ${lastError?.message}`
    );
  }

  /**
   * Keep the request timeout active through required body consumption.
   */
  private async fetchWithTimeout<T>(
    url: string,
    options: RequestInit,
    timeoutMs: number,
    consume: (response: Response) => Promise<T>
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      return await consume(response);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get Ollama server info
   */
  async getServerInfo(): Promise<OllamaHealthResponse | null> {
    try {
      return await this.fetchWithTimeout(
        `${this.baseUrl}/api/tags`,
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        },
        5000,
        async (response) => response.ok
          ? await response.json() as OllamaHealthResponse
          : null
      );
    } catch {
      return null;
    }
  }

  /**
   * Verify model is available and throw if not
   */
  async ensureModelAvailable(): Promise<void> {
    const isHealthy = await this.healthCheck();

    if (!isHealthy) {
      throw new Error(
        `Ollama model '${EMBEDDING_CONFIG.MODEL}' is not available. ` +
          `Please run: ollama pull ${EMBEDDING_CONFIG.MODEL}`
      );
    }
  }
}
