/**
 * Reservoir Replay Buffer with Coherence Gating (R10, Phase 5 Milestone 3)
 *
 * A standalone reservoir sampling buffer that uses coherence-gated admission
 * to prioritize high-quality experiences for replay. Integrates with the
 * CUSUM drift detector (R2) for drift-aware admission control.
 *
 * Algorithm:
 *   - Reservoir sampling inspired by Algorithm R (Vitter 1985), with
 *     coherence-weighted admission bias — high-coherence entries get a
 *     higher effective chance of replacing existing entries. This is NOT
 *     pure Algorithm R (which is unbiased); the tier weighting and
 *     low-coherence-preferring eviction are intentional design choices.
 *   - Coherence tiers (high/medium/low) with weighted sampling
 *   - CUSUM-based drift detection tightens admission during quality degradation
 *
 * @module integrations/ruvector/reservoir-replay
 * @see ADR-087-ruvector-advanced-capabilities.md
 */

import { CusumDetector, type CusumResult, type GateType } from './cusum-detector.js';

// ============================================================================
// Types
// ============================================================================

/** Coherence tier classification */
export type CoherenceTier = 'high' | 'medium' | 'low';

/** An experience entry in the reservoir */
export interface ReservoirEntry<T = unknown> {
  /** Unique entry ID */
  id: string;
  /** The stored data */
  data: T;
  /** Coherence score at admission time (0-1) */
  coherenceScore: number;
  /** Classified coherence tier */
  tier: CoherenceTier;
  /** Timestamp of admission */
  admittedAt: number;
  /** Number of times this entry has been sampled for replay */
  replayCount: number;
}

/** Configuration for the reservoir */
export interface ReservoirConfig {
  /** Maximum buffer capacity (default: 10000) */
  capacity: number;
  /** Minimum coherence score for admission (default: 0.3) */
  minCoherenceThreshold: number;
  /** Coherence threshold for 'high' tier (default: 0.8) */
  highTierThreshold: number;
  /** Coherence threshold for 'medium' tier (default: 0.5) */
  mediumTierThreshold: number;
  /** Sampling weight multiplier for high-coherence entries (default: 3.0) */
  highTierWeight: number;
  /** Sampling weight multiplier for medium-coherence entries (default: 1.5) */
  mediumTierWeight: number;
  /** Sampling weight multiplier for low-coherence entries (default: 1.0) */
  lowTierWeight: number;
  /** CUSUM config for drift-aware gating */
  cusumConfig?: { threshold?: number; slack?: number };
}

/** Statistics about the reservoir buffer */
export interface ReservoirStats {
  /** Current number of entries */
  size: number;
  /** Maximum capacity */
  capacity: number;
  /** Total entries admitted */
  totalAdmitted: number;
  /** Total entries rejected (below threshold) */
  totalRejected: number;
  /** Total entries evicted (reservoir overflow) */
  totalEvicted: number;
  /** Breakdown by coherence tier */
  tierCounts: Record<CoherenceTier, number>;
  /** Total samples drawn */
  totalSampled: number;
}

// ============================================================================
// Defaults
// ============================================================================

const DEFAULT_CONFIG: ReservoirConfig = {
  capacity: 10_000,
  minCoherenceThreshold: 0.3,
  highTierThreshold: 0.8,
  mediumTierThreshold: 0.5,
  highTierWeight: 3.0,
  mediumTierWeight: 1.5,
  lowTierWeight: 1.0,
};

// ============================================================================
// ReservoirReplayBuffer Implementation
// ============================================================================

/**
 * A fixed-capacity replay buffer with coherence-gated admission and
 * tier-weighted sampling. Uses Algorithm R for reservoir sampling
 * and integrates CUSUM drift detection for adaptive admission control.
 *
 * Usage:
 * ```typescript
 * const buffer = new ReservoirReplayBuffer({ capacity: 1000 });
 * buffer.admit('exp-1', myData, 0.85); // high coherence
 * buffer.admit('exp-2', myData, 0.10); // rejected (below threshold)
 * const batch = buffer.sample(32);     // weighted toward high-coherence
 * ```
 */
export class ReservoirReplayBuffer<T = unknown> {
  private readonly config: ReservoirConfig;
  private readonly cusumDetector: CusumDetector;
  private readonly buffer: Array<ReservoirEntry<T>>;

  /** Total number of items that have been offered for admission (including rejected) */
  private totalSeen: number = 0;
  /** Total items actually admitted into the buffer */
  private totalAdmitted: number = 0;
  /** Total items rejected at the coherence gate */
  private totalRejected: number = 0;
  /** Total items evicted by reservoir replacement */
  private totalEvicted: number = 0;
  /** Total individual samples drawn */
  private totalSampled: number = 0;

  constructor(config?: Partial<ReservoirConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    // For gating purposes, we do NOT reset on alarm so that drift
    // stays active until the detector is explicitly reset. This keeps
    // the admission threshold tightened as long as drift persists.
    this.cusumDetector = new CusumDetector({
      threshold: this.config.cusumConfig?.threshold ?? 5.0,
      slack: this.config.cusumConfig?.slack ?? 0.5,
      resetOnAlarm: false,
      warmupSamples: 20,
    });
    this.buffer = [];
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Attempt to admit an experience to the reservoir.
   *
   * Uses coherence-gated admission:
   * 1. Reject if coherence < minCoherenceThreshold (adjusted by CUSUM drift)
   * 2. If buffer has capacity, admit directly
   * 3. If buffer is full, use Algorithm R reservoir sampling to decide eviction
   * 4. High-coherence entries get a boost to their effective admission probability
   *
   * @param id - Unique entry identifier
   * @param data - The data payload to store
   * @param coherenceScore - Coherence score in [0, 1]
   * @returns true if admitted, false if rejected
   */
  admit(id: string, data: T, coherenceScore: number): boolean {
    this.totalSeen++;

    // Determine effective threshold: tighten during detected drift
    const effectiveThreshold = this.getEffectiveThreshold();

    // Gate 1: reject below coherence threshold
    if (coherenceScore < effectiveThreshold) {
      this.totalRejected++;
      return false;
    }

    const tier = this.classifyTier(coherenceScore);
    const entry: ReservoirEntry<T> = {
      id,
      data,
      coherenceScore,
      tier,
      admittedAt: Date.now(),
      replayCount: 0,
    };

    // Phase: buffer has capacity - admit directly
    if (this.buffer.length < this.config.capacity) {
      this.buffer.push(entry);
      this.totalAdmitted++;
      return true;
    }

    // Phase: buffer is full - Algorithm R reservoir sampling
    // Generate j in [0, totalAdmitted) - if j < capacity, replace buffer[j]
    const j = Math.floor(Math.random() * this.totalAdmitted);

    // Apply coherence-weighted boost: high-coherence entries get more chances
    const tierWeight = this.getTierWeight(tier);
    const effectiveJ = Math.floor(j / tierWeight);

    if (effectiveJ < this.config.capacity) {
      // When evicting, prefer evicting low-coherence entries
      const evictionIndex = this.selectEvictionTarget(effectiveJ);
      this.buffer[evictionIndex] = entry;
      this.totalEvicted++;
      this.totalAdmitted++;
      return true;
    }

    // Not admitted by reservoir sampling
    this.totalRejected++;
    return false;
  }

  /**
   * Sample a batch from the reservoir with coherence-weighted probability.
   * High-coherence entries are more likely to be sampled according to their
   * tier weights.
   *
   * @param batchSize - Number of entries to sample
   * @param minCoherence - Optional minimum coherence filter
   * @returns Sampled entries (may be fewer than batchSize if buffer is small)
   */
  sample(batchSize: number, minCoherence?: number): ReservoirEntry<T>[] {
    if (this.buffer.length === 0) {
      return [];
    }

    // Filter by minCoherence if specified
    const candidates = minCoherence !== undefined
      ? this.buffer.filter(e => e.coherenceScore >= minCoherence)
      : this.buffer;

    if (candidates.length === 0) {
      return [];
    }

    // If requesting more than available, return all (shuffled)
    if (batchSize >= candidates.length) {
      const result = [...candidates];
      for (const entry of result) {
        entry.replayCount++;
      }
      this.totalSampled += result.length;
      return result;
    }

    // Weighted sampling without replacement
    const weights = candidates.map(e => this.getTierWeight(e.tier));

    const sampled: ReservoirEntry<T>[] = [];
    const usedIndices = new Set<number>();

    while (sampled.length < batchSize && usedIndices.size < candidates.length) {
      // Compute remaining weight (excluding already-selected items)
      let remainingWeight = 0;
      for (let i = 0; i < candidates.length; i++) {
        if (!usedIndices.has(i)) remainingWeight += weights[i];
      }
      if (remainingWeight <= 0) break;

      // Weighted random selection over remaining items
      let r = Math.random() * remainingWeight;
      let selectedIdx = -1;

      for (let i = 0; i < candidates.length; i++) {
        if (usedIndices.has(i)) continue;
        r -= weights[i];
        if (r <= 0) {
          selectedIdx = i;
          break;
        }
      }

      // Fallback: pick first unused (rounding edge case)
      if (selectedIdx === -1) {
        for (let i = 0; i < candidates.length; i++) {
          if (!usedIndices.has(i)) {
            selectedIdx = i;
            break;
          }
        }
      }

      if (selectedIdx >= 0) {
        usedIndices.add(selectedIdx);
        candidates[selectedIdx].replayCount++;
        sampled.push(candidates[selectedIdx]);
      }
    }

    this.totalSampled += sampled.length;
    return sampled;
  }

  /** Get current buffer size */
  size(): number {
    return this.buffer.length;
  }

  /** Get buffer statistics */
  getStats(): ReservoirStats {
    const tierCounts: Record<CoherenceTier, number> = {
      high: 0,
      medium: 0,
      low: 0,
    };

    for (const entry of this.buffer) {
      tierCounts[entry.tier]++;
    }

    return {
      size: this.buffer.length,
      capacity: this.config.capacity,
      totalAdmitted: this.totalAdmitted,
      totalRejected: this.totalRejected,
      totalEvicted: this.totalEvicted,
      tierCounts,
      totalSampled: this.totalSampled,
    };
  }

  /** Get all entries in a specific coherence tier */
  getByTier(tier: CoherenceTier): ReservoirEntry<T>[] {
    return this.buffer.filter(e => e.tier === tier);
  }

  /** Clear the buffer and reset all statistics */
  clear(): void {
    this.buffer.length = 0;
    this.totalSeen = 0;
    this.totalAdmitted = 0;
    this.totalRejected = 0;
    this.totalEvicted = 0;
    this.totalSampled = 0;
    this.cusumDetector.reset();
  }

  /** Get the CUSUM detector state for a gate type */
  getCusumState(gateType: GateType): CusumResult {
    return this.cusumDetector.getState(gateType);
  }

  /**
   * Feed a coherence observation to the CUSUM detector.
   * When drift is detected, the admission threshold is temporarily tightened.
   */
  observeCoherence(gateType: GateType, value: number): CusumResult {
    return this.cusumDetector.update(gateType, value);
  }

  // --------------------------------------------------------------------------
  // Private Helpers
  // --------------------------------------------------------------------------

  /**
   * Classify a coherence score into a tier.
   */
  private classifyTier(coherenceScore: number): CoherenceTier {
    if (coherenceScore >= this.config.highTierThreshold) {
      return 'high';
    }
    if (coherenceScore >= this.config.mediumTierThreshold) {
      return 'medium';
    }
    return 'low';
  }

  /**
   * Get the sampling/admission weight for a tier.
   */
  private getTierWeight(tier: CoherenceTier): number {
    switch (tier) {
      case 'high':
        return this.config.highTierWeight;
      case 'medium':
        return this.config.mediumTierWeight;
      case 'low':
        return this.config.lowTierWeight;
    }
  }

  /**
   * Get the effective admission threshold, tightened during drift.
   *
   * When CUSUM detects drift on any gate, we raise the minimum coherence
   * threshold by 50% (capped at 0.9) to reject more marginal entries.
   */
  private getEffectiveThreshold(): number {
    const gateTypes: GateType[] = ['retrieve', 'write', 'learn', 'act'];
    let driftActive = false;

    for (const gate of gateTypes) {
      const state = this.cusumDetector.getState(gate);
      if (state.driftDetected) {
        driftActive = true;
        break;
      }
    }

    if (driftActive) {
      return Math.min(this.config.minCoherenceThreshold * 1.5, 0.9);
    }

    return this.config.minCoherenceThreshold;
  }

  /**
   * Select an eviction target, preferring low-coherence entries.
   *
   * Given a candidate index from reservoir sampling, look for a nearby
   * low-coherence entry to evict instead (within a small window).
   */
  private selectEvictionTarget(candidateIndex: number): number {
    const windowSize = Math.min(10, this.buffer.length);
    const start = Math.max(0, candidateIndex - Math.floor(windowSize / 2));
    const end = Math.min(this.buffer.length, start + windowSize);

    let worstIndex = candidateIndex;
    let worstScore = this.buffer[candidateIndex].coherenceScore;

    for (let i = start; i < end; i++) {
      if (this.buffer[i].coherenceScore < worstScore) {
        worstScore = this.buffer[i].coherenceScore;
        worstIndex = i;
      }
    }

    return worstIndex;
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a ReservoirReplayBuffer instance with optional configuration.
 */
export function createReservoirReplayBuffer<T = unknown>(
  config?: Partial<ReservoirConfig>
): ReservoirReplayBuffer<T> {
  return new ReservoirReplayBuffer<T>(config);
}
