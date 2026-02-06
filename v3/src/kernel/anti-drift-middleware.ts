/**
 * Agentic QE v3 - Semantic Anti-Drift Middleware (ADR-060)
 *
 * AISP 5.1 Anti-Drift Protocol: for-all s in Sigma: Mean(s) === Mean_0(s).
 * Attaches a semantic fingerprint (embedding vector) to each domain event at
 * emission time, verifies cosine similarity at each receiving boundary.
 * Falls back to deterministic hash-based pseudo-embeddings when the transformer
 * model is unavailable (test/lightweight environments).
 */

import type { DomainEvent, SemanticFingerprint, Result } from '../shared/types/index.js';
import { ok, err } from '../shared/types/index.js';
import { cosineSimilarity } from '../shared/utils/vector-math.js';

/** Generic middleware contract for the EventBus pipeline. */
export interface EventMiddleware {
  readonly name: string;
  readonly priority: number;
  /** Called before an event is published. May augment the event. */
  onEmit?(event: DomainEvent): Promise<DomainEvent>;
  /** Called on receive. Returning null drops the event. */
  onReceive?(event: DomainEvent): Promise<DomainEvent | null>;
}

/** Configuration for the anti-drift middleware. */
export interface AntiDriftConfig {
  /** Per-category cosine-distance thresholds (1 - similarity). */
  readonly thresholds: Record<string, number>;
  /** Identifier of the agent that owns this middleware instance. */
  readonly agentId: string;
  /** Maximum drift-check results to retain. */
  readonly maxHistorySize: number;
  /** Embedding vector dimensionality for the hash-based fallback. */
  readonly fallbackDimension: number;
  /** Optional callback invoked when drift is detected. */
  readonly onDriftDetected?: (event: DomainEvent) => Promise<void>;
}

/** Outcome of a single drift check performed by `onReceive`. */
export interface DriftCheckResult {
  readonly drifted: boolean;
  readonly cosineSimilarity: number;
  readonly threshold: number;
  readonly eventType: string;
  readonly hopCount: number;
  readonly checkedAt: number;
}

/** Aggregated statistics about middleware activity. */
export interface AntiDriftStats {
  readonly totalChecked: number;
  readonly driftCount: number;
  readonly averageSimilarity: number;
}

/** Default cosine-distance thresholds per event category. */
const DEFAULT_THRESHOLDS: Record<string, number> = {
  'quality-gate': 0.05,    // tight
  'coverage': 0.10,        // moderate
  'test-generation': 0.15, // relaxed
  'learning': 0.20,        // most relaxed
  'default': 0.12,
};

const DEFAULT_CONFIG: AntiDriftConfig = {
  thresholds: DEFAULT_THRESHOLDS,
  agentId: 'unknown',
  maxHistorySize: 200,
  fallbackDimension: 64,
};

/**
 * Deterministic pseudo-embedding via FNV-1a-inspired hash spread.
 * Not semantically meaningful but sufficient for detecting payload mutations.
 * @param text - Input text to embed.
 * @param dim  - Desired vector dimensionality.
 * @returns A normalised float vector of length `dim`.
 */
function hashBasedEmbedding(text: string, dim: number): number[] {
  const vec = new Float64Array(dim);
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= c;
    h2 = Math.imul(h2, 0x811c9dc5);
    const idx = (h1 >>> 0) % dim;
    vec[idx] += ((h2 >>> 0) / 0xffffffff) * 2 - 1;
  }
  let norm = 0;
  for (let i = 0; i < dim; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm);
  const result: number[] = new Array(dim);
  for (let i = 0; i < dim; i++) result[i] = norm === 0 ? 0 : vec[i] / norm;
  return result;
}

// Transformer availability probe (lazy, cached)
let _transformerProbed = false;
let _transformerAvailable = false;
let _computeRealEmbedding: ((text: string) => Promise<number[]>) | null = null;

/** Lazily probe whether the transformer pipeline is usable. */
async function probeTransformer(): Promise<boolean> {
  if (_transformerProbed) return _transformerAvailable;
  _transformerProbed = true;
  try {
    const mod = await import('../learning/real-embeddings.js');
    if (typeof mod.isTransformerAvailable === 'function' && mod.isTransformerAvailable()) {
      _computeRealEmbedding = mod.computeRealEmbedding;
      _transformerAvailable = true;
    } else {
      try {
        await mod.computeRealEmbedding('probe');
        _computeRealEmbedding = mod.computeRealEmbedding;
        _transformerAvailable = true;
      } catch {
        _transformerAvailable = false;
      }
    }
  } catch {
    _transformerAvailable = false;
  }
  return _transformerAvailable;
}

/**
 * Middleware enforcing semantic stability of domain events across agent-hop
 * boundaries. `onEmit` computes an embedding and attaches a SemanticFingerprint;
 * `onReceive` re-embeds and checks cosine distance, dropping drifted events.
 */
export class SemanticAntiDriftMiddleware implements EventMiddleware {
  readonly name = 'semantic-anti-drift';
  readonly priority = 10;
  private readonly config: AntiDriftConfig;
  private readonly history: DriftCheckResult[] = [];
  private totalChecked = 0;
  private driftCount = 0;
  private similaritySum = 0;

  constructor(config?: Partial<AntiDriftConfig>) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      thresholds: { ...DEFAULT_THRESHOLDS, ...config?.thresholds },
    };
  }

  /**
   * Compute the semantic embedding of the event payload and attach a
   * {@link SemanticFingerprint} before publication.
   * @param event - The domain event about to be published.
   * @returns The event augmented with a `semanticFingerprint` field.
   */
  async onEmit(event: DomainEvent): Promise<DomainEvent> {
    const payloadText = JSON.stringify(event.payload);
    const embedding = await this.embed(payloadText);
    const category = this.resolveCategory(event.type);
    const threshold = this.config.thresholds[category] ?? this.config.thresholds['default'];
    const fingerprint: SemanticFingerprint = {
      embedding,
      driftThreshold: threshold,
      sourceAgentId: this.config.agentId,
      hopCount: 0,
      emittedAt: Date.now(),
    };
    return { ...event, semanticFingerprint: fingerprint } as DomainEvent;
  }

  /**
   * Re-embed the payload and compare with the original fingerprint.
   * If drift exceeds threshold the event is dropped (returns null) and a
   * SemanticDriftDetectedEvent is emitted. Events without a fingerprint
   * pass through unchanged.
   * @param event - The incoming domain event.
   * @returns The event with incremented hopCount, or null if drifted.
   */
  async onReceive(event: DomainEvent): Promise<DomainEvent | null> {
    const fp = event.semanticFingerprint;
    if (!fp) return event;

    const payloadText = JSON.stringify(event.payload);
    const currentEmbedding = await this.embed(payloadText);
    const similarity = cosineSimilarity(currentEmbedding, fp.embedding as number[]);
    const distance = 1 - similarity;
    const drifted = distance > fp.driftThreshold;

    this.totalChecked++;
    this.similaritySum += similarity;

    const checkResult: DriftCheckResult = {
      drifted,
      cosineSimilarity: similarity,
      threshold: fp.driftThreshold,
      eventType: event.type,
      hopCount: fp.hopCount + 1,
      checkedAt: Date.now(),
    };
    this.history.push(checkResult);
    if (this.history.length > this.config.maxHistorySize) this.history.shift();

    if (drifted) {
      this.driftCount++;
      await this.emitDriftEvent(event, checkResult);
      return null;
    }

    const updatedFingerprint: SemanticFingerprint = { ...fp, hopCount: fp.hopCount + 1 };
    return { ...event, semanticFingerprint: updatedFingerprint } as DomainEvent;
  }

  /** Returns recent drift check results (bounded by maxHistorySize). */
  getDriftHistory(): readonly DriftCheckResult[] {
    return this.history;
  }

  /** Aggregated statistics about drift checks performed so far. */
  getStats(): AntiDriftStats {
    return {
      totalChecked: this.totalChecked,
      driftCount: this.driftCount,
      averageSimilarity: this.totalChecked > 0 ? this.similaritySum / this.totalChecked : 0,
    };
  }

  /**
   * Validate the middleware configuration.
   * @returns ok(void) if valid, err(Error) otherwise.
   */
  validateConfig(): Result<void, Error> {
    for (const [key, value] of Object.entries(this.config.thresholds)) {
      if (typeof value !== 'number' || value < 0 || value > 1) {
        return err(new Error(`Invalid threshold for "${key}": must be between 0 and 1, got ${value}`));
      }
    }
    if (this.config.maxHistorySize <= 0) return err(new Error('maxHistorySize must be positive'));
    if (this.config.fallbackDimension <= 0) return err(new Error('fallbackDimension must be positive'));
    return ok(undefined);
  }

  /** Compute embedding, preferring transformer pipeline with hash fallback. */
  private async embed(text: string): Promise<number[]> {
    const hasTransformer = await probeTransformer();
    if (hasTransformer && _computeRealEmbedding) return _computeRealEmbedding(text);
    return hashBasedEmbedding(text, this.config.fallbackDimension);
  }

  /** Map event type to threshold category via substring matching. */
  private resolveCategory(eventType: string): string {
    const lower = eventType.toLowerCase();
    for (const category of Object.keys(this.config.thresholds)) {
      if (category !== 'default' && lower.includes(category)) return category;
    }
    return 'default';
  }

  /** Fire a SemanticDriftDetectedEvent via the configured callback. */
  private async emitDriftEvent(originalEvent: DomainEvent, check: DriftCheckResult): Promise<void> {
    if (!this.config.onDriftDetected) return;
    const driftEvent: DomainEvent = {
      id: `drift-${originalEvent.id}-${Date.now()}`,
      type: 'SemanticDriftDetected',
      timestamp: new Date(),
      source: originalEvent.source,
      correlationId: originalEvent.correlationId,
      payload: {
        originalEventId: originalEvent.id,
        originalEventType: originalEvent.type,
        cosineSimilarity: check.cosineSimilarity,
        threshold: check.threshold,
        hopCount: check.hopCount,
        agentId: this.config.agentId,
      },
    };
    try {
      await this.config.onDriftDetected(driftEvent);
    } catch {
      // Swallow callback errors to avoid disrupting the pipeline.
    }
  }
}
