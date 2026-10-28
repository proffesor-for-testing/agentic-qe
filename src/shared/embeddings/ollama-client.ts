/**
 * Agentic QE v3 - Ollama API Client
 * Client for Ollama embeddings API with retry logic
 */

import { toError } from '../error-utils.js';
import {
  OllamaEmbeddingRequest,
  OllamaEmbeddingResponse,
  OllamaHealthResponse,
  OllamaModelStatus,
  EMBEDDING_CONFIG,
} from './types';
import { resolveOllamaBaseUrl } from '../llm/ollama-url.js';

/** Tags of Ollama's `all-minilm` that are all-MiniLM-L6-v2 (33m / l12-v2 is the L12 model). */
const ALL_MINILM_L6_TAG = /^(latest|22m(-.*)?|l6-v2(-.*)?)?$/i;

/** Splits `namespace/name:tag` into the name part and the tag ('' when untagged). */
function splitTag(listed: string): { base: string; tag: string } {
  const colon = listed.lastIndexOf(':');
  return colon > listed.lastIndexOf('/')
    ? { base: listed.slice(0, colon), tag: listed.slice(colon + 1) }
    : { base: listed, tag: '' };
}

/**
 * #1229: whether an installed Ollama model is EMBEDDING_CONFIG.MODEL. Accepts
 * the exact name with any namespace and tag (`Xenova/all-MiniLM-L6-v2:latest`)
 * and Ollama's library name `all-minilm` with an L6 tag (`all-minilm:22m`).
 * Other models are rejected, even 384-dimensional ones such as
 * `all-minilm:33m` (all-MiniLM-L12-v2): their vectors are in another
 * embedding space (ADR-097).
 */
export function isConfiguredOllamaModel(listed: string): boolean {
  const { base, tag } = splitTag(listed);
  const name = base.slice(base.lastIndexOf('/') + 1).toLowerCase();
  if (name === EMBEDDING_CONFIG.MODEL.toLowerCase()) return true;
  return base.toLowerCase() === 'all-minilm' && ALL_MINILM_L6_TAG.test(tag);
}

/**
 * Client for Ollama API
 */
export class OllamaClient {
  private baseUrl: string;
  private maxRetries: number;
  private retryDelayMs: number;
  private timeoutMs: number;
  /** #1229: the Ollama model named by the user (AQE_OLLAMA_EMBEDDING_MODEL), if any. */
  private readonly requestedModel?: string;
  /** The installed Ollama model found by the last successful check. */
  private installedModel: string | null = null;

  constructor(
    baseUrl: string = resolveOllamaBaseUrl(EMBEDDING_CONFIG.DEFAULT_OLLAMA_URL),
    maxRetries: number = EMBEDDING_CONFIG.MAX_RETRIES,
    retryDelayMs: number = EMBEDDING_CONFIG.RETRY_DELAY_MS,
    timeoutMs: number = EMBEDDING_CONFIG.TIMEOUT_MS,
    ollamaModel: string | undefined = process.env[EMBEDDING_CONFIG.OLLAMA_MODEL_ENV]
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.maxRetries = maxRetries;
    this.retryDelayMs = retryDelayMs;
    this.timeoutMs = timeoutMs;
    this.requestedModel = ollamaModel?.trim() || undefined;
  }

  /** The Ollama server this client talks to. */
  getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * Identifies the embedding space of this client's vectors. A model named by
   * AQE_OLLAMA_EMBEDDING_MODEL that is not EMBEDDING_CONFIG.MODEL gets its own
   * id, so its vectors are never compared with stored MiniLM vectors (ADR-097).
   */
  getModelId(): string {
    return !this.requestedModel || isConfiguredOllamaModel(this.requestedModel)
      ? EMBEDDING_CONFIG.MODEL
      : `ollama:${this.requestedModel}`;
  }

  /**
   * Check if Ollama is running and the configured embedding model is available
   */
  async healthCheck(): Promise<boolean> {
    return (await this.checkModel()).status === 'available';
  }

  /**
   * #1229: find the installed Ollama model to embed with, or say why there is
   * none (Ollama unreachable, or reachable without the model).
   */
  async checkModel(): Promise<OllamaModelStatus> {
    const wanted = this.requestedModel ?? EMBEDDING_CONFIG.MODEL;
    let data: OllamaHealthResponse | { httpStatus: number };
    try {
      data = await this.fetchWithTimeout(
        `${this.baseUrl}/api/tags`,
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        },
        5000, // Shorter timeout for health check
        async (response) => response.ok
          ? await response.json() as OllamaHealthResponse
          : { httpStatus: response.status }
      );
    } catch {
      return { status: 'unreachable', reason: `Ollama at ${this.baseUrl} is not reachable` };
    }
    if (data && 'httpStatus' in data) {
      return {
        status: 'unreachable',
        reason: `Ollama at ${this.baseUrl} answered HTTP ${data.httpStatus} when listing models`,
      };
    }

    const requested = this.requestedModel;
    const matches = requested
      ? (listed: string) => listed === requested || (!splitTag(requested).tag && listed === `${requested}:latest`)
      : isConfiguredOllamaModel;
    for (const model of data?.models ?? []) {
      const found = [model.name, model.model].find((listed) => !!listed && matches(listed));
      if (found) {
        this.installedModel = found;
        return { status: 'available', model: found };
      }
    }
    return {
      status: 'missing',
      reason:
        `model '${wanted}' not installed in Ollama at ${this.baseUrl}; ` +
        `install it with: ollama pull ${requested ?? EMBEDDING_CONFIG.OLLAMA_PULL_NAME}`,
    };
  }

  /**
   * Generate embedding for a single text prompt
   */
  async generateEmbedding(prompt: string): Promise<number[]> {
    const request: OllamaEmbeddingRequest = {
      model: this.installedModel ?? this.requestedModel ?? EMBEDDING_CONFIG.MODEL,
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
    const check = await this.checkModel();

    if (check.status !== 'available') {
      throw new Error(
        `Ollama model '${this.requestedModel ?? EMBEDDING_CONFIG.MODEL}' is not available: ${check.reason}`
      );
    }
  }
}
