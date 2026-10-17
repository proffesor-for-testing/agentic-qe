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
import { LoggerFactory } from '../logging/index.js';

const logger = LoggerFactory.create('anti-drift-middleware');

// ============================================================================
// ADR-062: Loop Detection Types & Implementation
// ============================================================================

/** Signature of a single tool call for loop detection. */
export interface ToolCallSignature {
  readonly hash: string;           // FNV-1a hash of tool name + args
  readonly toolName: string;
  readonly argsFingerprint: string; // truncated hash of serialized args
  readonly timestamp: number;
}

/** Configuration for the loop detection system. */
export interface LoopDetectionConfig {
  readonly maxIdenticalCalls: number;    // default: 3 (3-strike rule)
  readonly windowMs: number;             // default: 30000 (30 seconds)
  readonly steeringMessage: string;      // injected after 3 identical calls
  readonly enableFleetLearning: boolean; // store patterns in HNSW
}

/** Result of a loop detection check. */
export interface LoopDetectionResult {
  readonly isLoop: boolean;
  readonly callCount: number;
  readonly signature: ToolCallSignature;
  readonly action: 'allow' | 'warn' | 'steer';
  readonly steeringMessage?: string;
}

/** Metrics from the loop detection tracker. */
export interface LoopDetectionMetrics {
  readonly totalCallsTracked: number;
  readonly loopsDetected: number;
}

/** Default loop detection configuration. */
const DEFAULT_LOOP_DETECTION_CONFIG: LoopDetectionConfig = {
  maxIdenticalCalls: 3,
  windowMs: 30000,
  steeringMessage: 'Loop detected: the same tool call has been repeated multiple times. Consider an alternative approach or different parameters.',
  enableFleetLearning: false,
};

/**
 * FNV-1a hash implementation for tool call signature hashing.
 * Produces a deterministic 32-bit hash as a hex string.
 *
 * @param input - The string to hash
 * @returns Hex string representation of the FNV-1a hash
 */
function fnv1aHash(input: string): string {
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193); // FNV prime
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * ToolCallSignatureTracker - ADR-062 Loop Detection
 *
 * Maintains a sliding window of recent tool calls per agent and detects
 * repetitive loops using a 3-strike rule:
 * - Strike 1: allow (logged internally)
 * - Strike 2: warn
 * - Strike 3+: steer (inject steering message)
 *
 * Feature flag: `process.env.AQE_LOOP_DETECTION_ENABLED !== 'false'`
 */
export class ToolCallSignatureTracker {
  private readonly config: LoopDetectionConfig;
  private readonly callHistory: Map<string, ToolCallSignature[]> = new Map();
  private totalCallsTracked = 0;
  private loopsDetected = 0;

  constructor(config?: Partial<LoopDetectionConfig>) {
    this.config = { ...DEFAULT_LOOP_DETECTION_CONFIG, ...config };
  }

  /**
   * Track a tool call and check for loops.
   *
   * @param agentId - The agent making the call
   * @param toolName - Name of the tool being called
   * @param args - Arguments to the tool call
   * @returns Loop detection result with action recommendation
   */
  trackCall(agentId: string, toolName: string, args: unknown): LoopDetectionResult {
    // Feature flag check
    if (process.env.AQE_LOOP_DETECTION_ENABLED === 'false') {
      const signature = this.createSignature(toolName, args);
      return {
        isLoop: false,
        callCount: 1,
        signature,
        action: 'allow',
      };
    }

    const signature = this.createSignature(toolName, args);
    this.totalCallsTracked++;

    // Get or create history for this agent
    if (!this.callHistory.has(agentId)) {
      this.callHistory.set(agentId, []);
    }
    const history = this.callHistory.get(agentId)!;

    // Add current call to history
    history.push(signature);

    // Prune calls outside the sliding window
    const cutoff = Date.now() - this.config.windowMs;
    const pruneIndex = history.findIndex(s => s.timestamp >= cutoff);
    if (pruneIndex > 0) {
      history.splice(0, pruneIndex);
    } else if (pruneIndex === -1) {
      // All entries are expired
      history.length = 0;
      history.push(signature);
    }

    // Count identical calls within the window
    const identicalCount = history.filter(s => s.hash === signature.hash).length;

    // Determine action based on strike count
    if (identicalCount >= this.config.maxIdenticalCalls) {
      this.loopsDetected++;
      return {
        isLoop: true,
        callCount: identicalCount,
        signature,
        action: 'steer',
        steeringMessage: this.config.steeringMessage,
      };
    }

    if (identicalCount === this.config.maxIdenticalCalls - 1) {
      return {
        isLoop: false,
        callCount: identicalCount,
        signature,
        action: 'warn',
      };
    }

    return {
      isLoop: false,
      callCount: identicalCount,
      signature,
      action: 'allow',
    };
  }

  /**
   * Get metrics about loop detection activity.
   */
  getMetrics(): LoopDetectionMetrics {
    return {
      totalCallsTracked: this.totalCallsTracked,
      loopsDetected: this.loopsDetected,
    };
  }

  /**
   * Clear all tracking state.
   */
  clear(): void {
    this.callHistory.clear();
    this.totalCallsTracked = 0;
    this.loopsDetected = 0;
  }

  /**
   * Create a ToolCallSignature from tool name and arguments.
   */
  private createSignature(toolName: string, args: unknown): ToolCallSignature {
    const serializedArgs = JSON.stringify(args ?? '');
    const argsFingerprint = fnv1aHash(serializedArgs);
    const combinedInput = `${toolName}:${serializedArgs}`;
    const hash = fnv1aHash(combinedInput);

    return {
      hash,
      toolName,
      argsFingerprint,
      timestamp: Date.now(),
    };
  }
}

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
 * Control-plane (task/agent/workflow lifecycle) events, matched on the last
 * dot-separated segment of the event type:
 * - every `Queen*` event (QueenCoordinator prefixes all of its events),
 * - `Task*`, `Agent*`, `Workflow*`, `Step*`, `Protocol*` and `Action*` events
 *   (TaskCompleted, TaskFailed, workflow.StepCompleted, coordination.ProtocolFailed, ...).
 * The Queen, the workflow orchestrator and the protocol executor count slots
 * and advance state machines on these events, so losing one leaks a slot or
 * hangs a run (#1070, #1077).
 */
const CONTROL_PLANE_EVENT_RE = /^(?:Queen[A-Z]|(?:Task|Agent|Workflow|Step|Protocol|Action)[A-Z])/;

/** True when the event type is a lifecycle / control-plane event that must never be dropped. */
export function isControlPlaneEvent(eventType: string): boolean {
  const name = eventType.slice(eventType.lastIndexOf('.') + 1);
  return CONTROL_PLANE_EVENT_RE.test(name);
}

/** One warning per event type and source per window; later drops in the window are counted. */
const DRIFT_WARN_WINDOW_MS = 60_000;
/** Bound on distinct (type, source) keys tracked for warning rate limiting. */
const DRIFT_WARN_MAX_KEYS = 256;

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
      } catch (e) {
        logger.debug('Transformer probe embedding failed', { error: e instanceof Error ? e.message : String(e) });
        _transformerAvailable = false;
      }
    }
  } catch (e) {
    logger.debug('Transformer module import failed', { error: e instanceof Error ? e.message : String(e) });
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
  /** Rate limit for drift warnings, keyed by event type and source. */
  private readonly driftWarnings = new Map<string, { lastAt: number; suppressed: number }>();
  /** Payload text each fingerprint was computed from (same-process events only). */
  private readonly emittedPayloadText = new WeakMap<SemanticFingerprint, string>();
  private embeddingWarningAt = -Infinity;
  private suppressedEmbeddingWarnings = 0;

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
    const embedding = await this.embedForEvent(payloadText, event, 'emit');
    if (embedding === null) return event;
    const category = this.resolveCategory(event.type);
    const threshold = this.config.thresholds[category] ?? this.config.thresholds['default'];
    const fingerprint: SemanticFingerprint = {
      embedding,
      driftThreshold: threshold,
      sourceAgentId: this.config.agentId,
      hopCount: 0,
      emittedAt: Date.now(),
    };
    this.emittedPayloadText.set(fingerprint, payloadText);
    return { ...event, semanticFingerprint: fingerprint } as DomainEvent;
  }

  /**
   * Re-embed the payload and compare with the original fingerprint.
   * If drift exceeds threshold a warning is logged, a SemanticDriftDetectedEvent
   * is emitted, and a data event is dropped (returns null). Control-plane
   * events (see {@link isControlPlaneEvent}) are delivered anyway: dropping a
   * lifecycle event leaks Queen slots (#1070, #1077). Events without a
   * fingerprint pass through unchanged.
   * @param event - The incoming domain event.
   * @returns The event with incremented hopCount, or null if a drifted data event.
   */
  async onReceive(event: DomainEvent): Promise<DomainEvent | null> {
    const fp = event.semanticFingerprint;
    if (!fp) return event;

    const payloadText = JSON.stringify(event.payload);
    // A payload whose text is byte-identical to the text this instance
    // fingerprinted at emit time has similarity 1 by construction; skip the
    // second model inference (#1077).
    let similarity = 1;
    if (this.emittedPayloadText.get(fp) !== payloadText) {
      const currentEmbedding = await this.embedForEvent(payloadText, event, 'receive');
      if (currentEmbedding === null) return event;
      similarity = cosineSimilarity(currentEmbedding, fp.embedding as number[]);
    }
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
      const deliver = isControlPlaneEvent(event.type);
      this.warnDrift(event, checkResult, deliver);
      await this.emitDriftEvent(event, checkResult);
      if (!deliver) return null;
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

  /**
   * Compute embedding, preferring transformer pipeline with hash fallback.
   * The transformer returns a zero vector for text it treats as non-semantic
   * (JSON with a "metrics" key, raw arrays, mostly numeric strings). A zero
   * vector has no direction, so the cosine check read it as total drift and
   * silently dropped the event, e.g. every quality_assess TaskCompleted (#1070).
   * Such text gets a hash embedding of the same length instead, which still
   * detects a mutated payload.
   */
  private async embed(text: string): Promise<number[]> {
    const hasTransformer = await probeTransformer();
    if (hasTransformer && _computeRealEmbedding) {
      const embedding = await _computeRealEmbedding(text);
      if (embedding.some(v => v !== 0)) return embedding;
      return hashBasedEmbedding(text, embedding.length || this.config.fallbackDimension);
    }
    return hashBasedEmbedding(text, this.config.fallbackDimension);
  }

  /**
   * Fingerprinting is advisory infrastructure, not an event-delivery dependency.
   * A transformer can fail after its cached availability probe succeeded. Do not
   * switch vector spaces mid-event: an old semantic vector and a new hash vector
   * cannot be compared. Deliver this event without claiming a completed check;
   * later events still try the transformer normally.
   */
  private async embedForEvent(
    text: string, event: DomainEvent, stage: 'emit' | 'receive',
  ): Promise<number[] | null> {
    try {
      return await this.embed(text);
    } catch {
      const now = Date.now();
      if (now - this.embeddingWarningAt < 60_000) {
        this.suppressedEmbeddingWarnings++;
      } else {
        logger.warn('Anti-drift embedding unavailable; event delivered without verification', {
          eventType: event.type, source: event.source, stage,
          suppressedSinceLastWarning: this.suppressedEmbeddingWarnings,
        });
        this.embeddingWarningAt = now;
        this.suppressedEmbeddingWarnings = 0;
      }
      // Never log the payload or provider's error text (it may contain input or
      // credentials), and never count an unavailable check as successful/drifted.
      return null;
    }
  }

  /** Map event type to threshold category via substring matching. */
  private resolveCategory(eventType: string): string {
    const lower = eventType.toLowerCase();
    for (const category of Object.keys(this.config.thresholds)) {
      if (category !== 'default' && lower.includes(category)) return category;
    }
    return 'default';
  }

  /**
   * Log a drift detection to stderr (via the structured logger). Never logs
   * payload contents. Rate limited per event type and source so a flood of
   * drifted events produces one line per window plus a suppressed count.
   */
  private warnDrift(event: DomainEvent, check: DriftCheckResult, delivered: boolean): void {
    const key = `${event.type}|${String(event.source)}`;
    const now = Date.now();
    const entry = this.driftWarnings.get(key);
    if (entry && now - entry.lastAt < DRIFT_WARN_WINDOW_MS) {
      entry.suppressed++;
      return;
    }
    if (!entry && this.driftWarnings.size >= DRIFT_WARN_MAX_KEYS) this.driftWarnings.clear();
    const suppressed = entry?.suppressed ?? 0;
    this.driftWarnings.set(key, { lastAt: now, suppressed: 0 });
    logger.warn(
      delivered
        ? 'Semantic drift detected on a control-plane event; delivered anyway'
        : 'Semantic drift detected; event dropped',
      {
        eventType: event.type,
        source: event.source,
        cosineSimilarity: Number(check.cosineSimilarity.toFixed(4)),
        cosineDistance: Number((1 - check.cosineSimilarity).toFixed(4)),
        threshold: check.threshold,
        hopCount: check.hopCount,
        ...(suppressed > 0 ? { suppressedSinceLastWarning: suppressed } : {}),
      },
    );
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
    } catch (e) {
      // Swallow callback errors to avoid disrupting the pipeline.
      logger.debug('onDriftDetected callback failed', { error: e instanceof Error ? e.message : String(e) });
    }
  }
}
