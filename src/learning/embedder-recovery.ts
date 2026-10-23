/**
 * Embedder recovery after a failure (#1187, #1204)
 *
 * A consumer of the embedder (a pattern bank, ExperienceReplay) runs without
 * vectors while its embedder is down: patterns are stored text-only and
 * searched by text. This class tracks that state and retries the embedder
 * after a bounded interval, so a short outage does not last until restart.
 *
 * The retry runs in the background. The call that finds a retry due still
 * gets "unavailable" and carries on without vectors, so a slow or unreachable
 * embedder host never stalls it. The consumer becomes available again only
 * after the retry's probe has succeeded: it never reports vectors it does not
 * have. ADR-097 still holds: nothing here produces a substitute vector.
 */

import {
  computeRealEmbedding,
  recheckEmbedder,
  type EmbeddingConfig,
} from './real-embeddings.js';
import { EMBEDDING_SPACE_CANARY } from './embedding-space.js';

export const DEFAULT_EMBEDDER_RETRY_INTERVAL_MS = 60_000;

export interface EmbedderRecoveryOptions {
  /** Wait this long after a failure before trying the embedder again. */
  retryIntervalMs?: number;
  /**
   * Resolve once the embedder works and the consumer is ready to use
   * vectors again; throw otherwise. Defaults to probeEmbedder().
   */
  probe?: () => Promise<void>;
  /** Called after a retry succeeded. */
  onRecovered?: () => void;
  /** Called after a retry failed. */
  onRetryFailed?: (error: unknown) => void;
}

/**
 * Probe the embedder after a failure: re-initialize it, or try the endpoint
 * through its open circuit breaker (recheckEmbedder), then embed the canary,
 * bypassing the cache — a cached vector proves nothing about the embedder now.
 */
export async function probeEmbedder(config: Partial<EmbeddingConfig> = {}): Promise<void> {
  await recheckEmbedder(config);
  await computeRealEmbedding(EMBEDDING_SPACE_CANARY, { ...config, enableCache: false });
}

export class EmbedderRecovery {
  private reason: string | null = null;
  private failedAt = 0;
  /** Counts failures, so a retry does not clear one recorded while it ran. */
  private failureCount = 0;
  private retry: Promise<void> | null = null;
  private readonly retryIntervalMs: number;
  private readonly probe: () => Promise<void>;

  constructor(private readonly options: EmbedderRecoveryOptions = {}) {
    this.retryIntervalMs = options.retryIntervalMs ?? DEFAULT_EMBEDDER_RETRY_INTERVAL_MS;
    this.probe = options.probe ?? (() => probeEmbedder());
  }

  /** Why the embedder is unavailable, or null while it works. */
  get unavailableReason(): string | null {
    return this.reason;
  }

  /**
   * True when the embedder can be used now. When it cannot and a retry is
   * due, starts one in the background and still returns false.
   */
  isAvailable(): boolean {
    if (this.reason === null) return true;
    this.startRetryIfDue();
    return false;
  }

  /**
   * Record an embedder failure. Returns true when the embedder was available
   * until now, so the caller can warn once per outage rather than per call.
   */
  markUnavailable(reason: string): boolean {
    const wasAvailable = this.reason === null;
    this.reason = reason;
    this.failedAt = Date.now();
    this.failureCount++;
    return wasAvailable;
  }

  /** Resolves once an in-flight retry has finished (tests, shutdown). */
  async whenRetrySettled(): Promise<void> {
    await this.retry;
  }

  private startRetryIfDue(): void {
    if (this.retry) return;
    if (Date.now() - this.failedAt < this.retryIntervalMs) return;
    this.retry = this.runRetry().finally(() => {
      this.retry = null;
    });
  }

  private async runRetry(): Promise<void> {
    const failuresBefore = this.failureCount;
    try {
      await this.probe();
      if (this.failureCount !== failuresBefore) return;
      this.reason = null;
      this.options.onRecovered?.();
    } catch (error) {
      this.failedAt = Date.now();
      this.options.onRetryFailed?.(error);
    }
  }
}
