/**
 * Ollama API Client for Nomic Embeddings
 *
 * Handles communication with Ollama subprocess including:
 * - Health checks
 * - Retry logic with exponential backoff
 * - Error handling
 * - Request/response management
 */

import {
  OllamaEmbeddingRequest,
  OllamaEmbeddingResponse,
  OllamaHealthResponse,
  EMBEDDING_CONFIG
} from './types';

export class OllamaClient {
  private baseUrl: string;
  private maxRetries: number;
  private retryDelayMs: number;
  private timeoutMs: number;

  constructor(
    baseUrl: string = EMBEDDING_CONFIG.DEFAULT_OLLAMA_URL,
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
   * Check if Ollama is running and nomic-embed-text model is available
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.fetchWithTimeout(
        `${this.baseUrl}/api/tags`,
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        },
        5000 // Shorter timeout for health check
      );

      if (!response.ok) {
        return false;
      }

      const data: OllamaHealthResponse = await response.json();

      // Check if nomic-embed-text model is available
      if (data.models) {
        return data.models.some(
          model => model.name === EMBEDDING_CONFIG.MODEL ||
                   model.model === EMBEDDING_CONFIG.MODEL
        );
      }

      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Generate embedding for a single text prompt
   */
  async generateEmbedding(prompt: string): Promise<number[]> {
    const request: OllamaEmbeddingRequest = {
      model: EMBEDDING_CONFIG.MODEL,
      prompt
    };

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const response = await this.fetchWithTimeout(
          `${this.baseUrl}/api/embeddings`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request)
          },
          this.timeoutMs
        );

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(
            `Ollama API error (${response.status}): ${errorText}`
          );
        }

        const data: OllamaEmbeddingResponse = await response.json();

        // Validate embedding dimensions
        if (data.embedding.length !== EMBEDDING_CONFIG.DIMENSIONS) {
          throw new Error(
            `Invalid embedding dimensions: expected ${EMBEDDING_CONFIG.DIMENSIONS}, got ${data.embedding.length}`
          );
        }

        return data.embedding;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

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
   * Fetch with timeout support
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
        signal: controller.signal
      });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get Ollama server info
   */
  async getServerInfo(): Promise<OllamaHealthResponse | null> {
    try {
      const response = await this.fetchWithTimeout(
        `${this.baseUrl}/api/tags`,
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        },
        5000
      );

      if (!response.ok) {
        return null;
      }

      return await response.json();
    } catch {
      return null;
    }
  }

  /**
   * Verify model is available and download if needed
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
