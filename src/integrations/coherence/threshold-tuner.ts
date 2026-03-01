/**
 * Agentic QE v3 - Threshold Auto-Tuner for Coherence Gates
 *
 * ADR-052 Action A4.2: Threshold Auto-Tuning
 *
 * This module provides adaptive threshold management for coherence gates.
 * It tracks false positive/negative rates over time and uses exponential
 * moving average (EMA) to adjust thresholds per domain.
 *
 * **Key Features:**
 * 1. Domain-specific thresholds (test-generation, security, coverage, etc.)
 * 2. EMA-based threshold adjustment for smooth adaptation
 * 3. False positive/negative tracking with configurable windows
 * 4. Memory persistence for calibrated thresholds
 * 5. Manual override capability via configuration
 * 6. EventBus integration for threshold_calibrated events
 *
 * **Default Thresholds (per ADR-052):**
 * - reflex: 0.1 (E < 0.1 = immediate execution)
 * - retrieval: 0.4 (0.1-0.4 = fetch additional context)
 * - heavy: 0.7 (0.4-0.7 = deep analysis)
 * - human: 1.0 (E > 0.7 = Queen escalation)
 *
 * @example Basic Usage
 * ```typescript
 * const tuner = new ThresholdTuner({
 *   memoryStore: myMemoryStore,
 *   eventBus: myEventBus,
 * });
 *
 * // Get threshold for a domain/lane combination
 * const threshold = tuner.getThreshold('test-generation', 'reflex');
 *
 * // Record outcome to improve thresholds
 * tuner.recordOutcome('test-generation', true, 0.05);
 *
 * // Trigger calibration
 * await tuner.calibrate();
 * ```
 *
 * @module integrations/coherence/threshold-tuner
 */

import type { ComputeLane, ComputeLaneConfig } from './types';
import { DEFAULT_LANE_CONFIG } from './types';
import type { DomainName, EventHandler, DomainEvent } from '../../shared/types';

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for the threshold tuner
 */
export interface ThresholdTunerConfig {
  /** EMA alpha parameter (0-1). Higher = more responsive to recent data. Default: 0.1 */
  emaAlpha: number;

  /** Minimum samples before calibration adjusts thresholds. Default: 10 */
  minSamplesForCalibration: number;

  /** Maximum history size per domain. Default: 1000 */
  maxHistorySize: number;

  /** Target false positive rate. Default: 0.05 (5%) */
  targetFalsePositiveRate: number;

  /** Target false negative rate. Default: 0.02 (2%) */
  targetFalseNegativeRate: number;

  /** Maximum adjustment per calibration cycle. Default: 0.05 */
  maxAdjustmentPerCycle: number;

  /** Whether to auto-calibrate on recordOutcome. Default: false */
  autoCalibrate: boolean;

  /** Auto-calibration interval (samples between calibrations). Default: 100 */
  autoCalibrateInterval: number;

  /** Manual threshold overrides per domain. Takes precedence over auto-tuning. */
  manualOverrides?: Partial<Record<DomainName, Partial<ComputeLaneConfig>>>;

  /** Default thresholds when no calibration data exists */
  defaultThresholds: ComputeLaneConfig;
}

/**
 * Default configuration for threshold tuner
 */
export const DEFAULT_TUNER_CONFIG: ThresholdTunerConfig = {
  emaAlpha: 0.1,
  minSamplesForCalibration: 10,
  maxHistorySize: 1000,
  targetFalsePositiveRate: 0.05,
  targetFalseNegativeRate: 0.02,
  maxAdjustmentPerCycle: 0.05,
  autoCalibrate: false,
  autoCalibrateInterval: 100,
  defaultThresholds: { ...DEFAULT_LANE_CONFIG },
};

/**
 * A single outcome record for threshold tuning
 */
export interface OutcomeRecord {
  /** Timestamp of the outcome */
  timestamp: Date;

  /** Whether the decision was correct */
  wasCorrect: boolean;

  /** Energy value at decision time */
  energy: number;

  /** The compute lane that was selected */
  lane: ComputeLane;

  /** Whether this was a false positive (escalated when shouldn't have) */
  falsePositive: boolean;

  /** Whether this was a false negative (didn't escalate when should have) */
  falseNegative: boolean;
}

/**
 * Statistics for a domain's threshold performance
 */
export interface DomainStats {
  /** Total outcomes recorded */
  totalOutcomes: number;

  /** Number of correct decisions */
  correctDecisions: number;

  /** Number of false positives */
  falsePositives: number;

  /** Number of false negatives */
  falseNegatives: number;

  /** Current accuracy rate */
  accuracy: number;

  /** Current false positive rate */
  falsePositiveRate: number;

  /** Current false negative rate */
  falseNegativeRate: number;

  /** Current thresholds for this domain */
  thresholds: ComputeLaneConfig;

  /** Whether manual override is active */
  hasManualOverride: boolean;

  /** Last calibration timestamp */
  lastCalibrationAt?: Date;

  /** Number of calibrations performed */
  calibrationCount: number;
}

/**
 * Aggregate statistics across all domains
 */
export interface ThresholdStats {
  /** Stats per domain */
  domains: Record<string, DomainStats>;

  /** Global stats */
  global: {
    totalOutcomes: number;
    correctDecisions: number;
    falsePositives: number;
    falseNegatives: number;
    accuracy: number;
    falsePositiveRate: number;
    falseNegativeRate: number;
    domainsCalibrated: number;
    lastCalibrationAt?: Date;
  };

  /** Configuration snapshot */
  config: {
    emaAlpha: number;
    targetFalsePositiveRate: number;
    targetFalseNegativeRate: number;
    minSamplesForCalibration: number;
    autoCalibrate: boolean;
  };
}

/**
 * Payload for threshold_calibrated event
 */
export interface ThresholdCalibratedPayload {
  /** Domain that was calibrated */
  domain: string;

  /** Previous thresholds */
  previousThresholds: ComputeLaneConfig;

  /** New thresholds after calibration */
  newThresholds: ComputeLaneConfig;

  /** Statistics at calibration time */
  stats: DomainStats;

  /** Reason for calibration */
  reason: 'auto' | 'manual' | 'scheduled';
}

/**
 * Memory store interface for persisting thresholds
 */
export interface IThresholdMemoryStore {
  /** Store a value */
  store(key: string, value: unknown, namespace?: string): Promise<void>;

  /** Retrieve a value */
  retrieve(key: string, namespace?: string): Promise<unknown | null>;
}

/**
 * Event bus interface for publishing threshold events
 */
export interface IThresholdEventBus {
  /** Publish an event */
  publish<T>(event: DomainEvent<T>): Promise<void>;

  /** Subscribe to events */
  subscribe<T>(eventType: string, handler: EventHandler<T>): { unsubscribe: () => void };
}

/**
 * Interface for the ThresholdTuner
 */
export interface IThresholdTuner {
  /**
   * Get the threshold for a specific domain and compute lane
   *
   * @param domain - The domain name (e.g., 'test-generation', 'security')
   * @param lane - The compute lane
   * @returns The threshold value
   */
  getThreshold(domain: string, lane: ComputeLane): number;

  /**
   * Get all thresholds for a domain
   *
   * @param domain - The domain name
   * @returns The lane configuration for the domain
   */
  getThresholds(domain: string): ComputeLaneConfig;

  /**
   * Record an outcome for threshold tuning
   *
   * @param domain - The domain name
   * @param wasCorrect - Whether the decision was correct
   * @param energy - The energy value at decision time
   * @param lane - Optional lane that was selected
   */
  recordOutcome(domain: string, wasCorrect: boolean, energy: number, lane?: ComputeLane): void;

  /**
   * Calibrate thresholds based on collected data
   * Publishes threshold_calibrated events for any changes
   */
  calibrate(): Promise<void>;

  /**
   * Get statistics for all domains
   */
  getStats(): ThresholdStats;

  /**
   * Reset statistics and thresholds for a specific domain or all domains
   *
   * @param domain - Optional domain to reset. If omitted, resets all.
   */
  reset(domain?: string): void;

  /**
   * Set a manual override for a domain's thresholds
   *
   * @param domain - The domain name
   * @param thresholds - The threshold overrides
   */
  setManualOverride(domain: string, thresholds: Partial<ComputeLaneConfig>): void;

  /**
   * Clear manual override for a domain
   *
   * @param domain - The domain name
   */
  clearManualOverride(domain: string): void;

  /**
   * Persist current thresholds to memory
   */
  persist(): Promise<void>;

  /**
   * Load persisted thresholds from memory
   */
  load(): Promise<void>;
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * Internal state for a domain
 */
interface DomainState {
  /** Outcome history for this domain */
  history: OutcomeRecord[];

  /** Current calibrated thresholds */
  thresholds: ComputeLaneConfig;

  /** EMA of false positive rate */
  emaFalsePositive: number;

  /** EMA of false negative rate */
  emaFalseNegative: number;

  /** Calibration count */
  calibrationCount: number;

  /** Last calibration timestamp */
  lastCalibrationAt?: Date;

  /** Sample count since last auto-calibration */
  samplesSinceCalibration: number;
}

/**
 * Threshold Auto-Tuner Implementation
 *
 * Provides adaptive threshold management for coherence gates with:
 * - Domain-specific calibration
 * - EMA-based smooth adjustment
 * - False positive/negative tracking
 * - Memory persistence
 * - EventBus integration
 *
 * @example
 * ```typescript
 * const tuner = new ThresholdTuner({
 *   memoryStore: myMemoryStore,
 *   eventBus: myEventBus,
 *   config: {
 *     emaAlpha: 0.15,
 *     targetFalsePositiveRate: 0.03,
 *   }
 * });
 *
 * // Load persisted thresholds
 * await tuner.load();
 *
 * // Use in coherence checking
 * const threshold = tuner.getThreshold('security', 'heavy');
 *
 * // Record outcomes
 * tuner.recordOutcome('security', true, 0.55);
 *
 * // Periodic calibration
 * await tuner.calibrate();
 *
 * // Persist for next session
 * await tuner.persist();
 * ```
 */
export class ThresholdTuner implements IThresholdTuner {
  private readonly config: ThresholdTunerConfig;
  private readonly memoryStore?: IThresholdMemoryStore;
  private readonly eventBus?: IThresholdEventBus;

  private readonly domains: Map<string, DomainState> = new Map();
  private readonly manualOverrides: Map<string, Partial<ComputeLaneConfig>> = new Map();

  private static readonly MEMORY_NAMESPACE = 'coherence-thresholds';
  private static readonly MEMORY_KEY_PREFIX = 'threshold-tuner';

  /**
   * Create a new ThresholdTuner
   *
   * @param options - Configuration options
   */
  constructor(options: {
    memoryStore?: IThresholdMemoryStore;
    eventBus?: IThresholdEventBus;
    config?: Partial<ThresholdTunerConfig>;
  } = {}) {
    this.config = {
      ...DEFAULT_TUNER_CONFIG,
      ...options.config,
      defaultThresholds: {
        ...DEFAULT_TUNER_CONFIG.defaultThresholds,
        ...options.config?.defaultThresholds,
      },
    };

    this.memoryStore = options.memoryStore;
    this.eventBus = options.eventBus;

    // Initialize manual overrides from config
    if (this.config.manualOverrides) {
      for (const [domain, thresholds] of Object.entries(this.config.manualOverrides)) {
        if (thresholds) {
          this.manualOverrides.set(domain, thresholds);
        }
      }
    }
  }

  /**
   * Get threshold for a specific domain and lane
   */
  getThreshold(domain: string, lane: ComputeLane): number {
    // Check manual override first
    const override = this.manualOverrides.get(domain);
    if (override) {
      const overrideValue = this.getLaneThresholdFromConfig(override, lane);
      if (overrideValue !== undefined) {
        return overrideValue;
      }
    }

    // Get domain state or use defaults
    const state = this.domains.get(domain);
    if (state) {
      return this.getLaneThresholdFromConfig(state.thresholds, lane) ?? this.getDefaultThreshold(lane);
    }

    return this.getDefaultThreshold(lane);
  }

  /**
   * Get all thresholds for a domain
   */
  getThresholds(domain: string): ComputeLaneConfig {
    // Build thresholds with manual overrides taking precedence
    const state = this.domains.get(domain);
    const override = this.manualOverrides.get(domain);

    const baseThresholds = state?.thresholds ?? { ...this.config.defaultThresholds };

    if (override) {
      return {
        reflexThreshold: override.reflexThreshold ?? baseThresholds.reflexThreshold,
        retrievalThreshold: override.retrievalThreshold ?? baseThresholds.retrievalThreshold,
        heavyThreshold: override.heavyThreshold ?? baseThresholds.heavyThreshold,
      };
    }

    return baseThresholds;
  }

  /**
   * Record an outcome for threshold tuning
   */
  recordOutcome(domain: string, wasCorrect: boolean, energy: number, lane?: ComputeLane): void {
    const state = this.getOrCreateDomainState(domain);

    // Determine the lane based on energy if not provided
    const actualLane = lane ?? this.determineLane(energy, state.thresholds);

    // Determine false positive/negative based on energy and correctness
    // False positive: escalated to higher lane but decision was wrong (energy was low, should have been reflex)
    // False negative: didn't escalate enough but decision was wrong (energy was high, should have been heavy/human)
    const expectedLane = this.determineLane(energy, state.thresholds);
    const falsePositive = !wasCorrect && this.isHigherLane(actualLane, expectedLane);
    const falseNegative = !wasCorrect && this.isLowerLane(actualLane, expectedLane);

    const record: OutcomeRecord = {
      timestamp: new Date(),
      wasCorrect,
      energy,
      lane: actualLane,
      falsePositive,
      falseNegative,
    };

    // Add to history
    state.history.push(record);

    // Trim history if needed
    if (state.history.length > this.config.maxHistorySize) {
      state.history.shift();
    }

    // Update EMA
    if (state.history.length > 0) {
      const recentFP = falsePositive ? 1 : 0;
      const recentFN = falseNegative ? 1 : 0;

      state.emaFalsePositive = this.config.emaAlpha * recentFP +
        (1 - this.config.emaAlpha) * state.emaFalsePositive;
      state.emaFalseNegative = this.config.emaAlpha * recentFN +
        (1 - this.config.emaAlpha) * state.emaFalseNegative;
    }

    state.samplesSinceCalibration++;

    // Auto-calibrate if enabled
    if (
      this.config.autoCalibrate &&
      state.samplesSinceCalibration >= this.config.autoCalibrateInterval
    ) {
      // Fire and forget calibration
      this.calibrateDomain(domain, 'auto').catch((error) => {
        // Non-critical: auto-calibration errors don't affect normal operation
        console.debug('[ThresholdTuner] Auto-calibration error:', error instanceof Error ? error.message : error);
      });
    }
  }

  /**
   * Calibrate thresholds for all domains
   */
  async calibrate(): Promise<void> {
    const domains = Array.from(this.domains.keys());
    for (const domain of domains) {
      await this.calibrateDomain(domain, 'scheduled');
    }
  }

  /**
   * Get statistics for all domains
   */
  getStats(): ThresholdStats {
    const domainStats: Record<string, DomainStats> = {};

    let globalTotal = 0;
    let globalCorrect = 0;
    let globalFP = 0;
    let globalFN = 0;
    let lastCalibrationAt: Date | undefined;

    const domainEntries = Array.from(this.domains.entries());
    for (const [domain, state] of domainEntries) {
      const stats = this.computeDomainStats(domain, state);
      domainStats[domain] = stats;

      globalTotal += stats.totalOutcomes;
      globalCorrect += stats.correctDecisions;
      globalFP += stats.falsePositives;
      globalFN += stats.falseNegatives;

      if (stats.lastCalibrationAt) {
        if (!lastCalibrationAt || stats.lastCalibrationAt > lastCalibrationAt) {
          lastCalibrationAt = stats.lastCalibrationAt;
        }
      }
    }

    return {
      domains: domainStats,
      global: {
        totalOutcomes: globalTotal,
        correctDecisions: globalCorrect,
        falsePositives: globalFP,
        falseNegatives: globalFN,
        accuracy: globalTotal > 0 ? globalCorrect / globalTotal : 1,
        falsePositiveRate: globalTotal > 0 ? globalFP / globalTotal : 0,
        falseNegativeRate: globalTotal > 0 ? globalFN / globalTotal : 0,
        domainsCalibrated: this.domains.size,
        lastCalibrationAt,
      },
      config: {
        emaAlpha: this.config.emaAlpha,
        targetFalsePositiveRate: this.config.targetFalsePositiveRate,
        targetFalseNegativeRate: this.config.targetFalseNegativeRate,
        minSamplesForCalibration: this.config.minSamplesForCalibration,
        autoCalibrate: this.config.autoCalibrate,
      },
    };
  }

  /**
   * Reset statistics and thresholds
   */
  reset(domain?: string): void {
    if (domain) {
      this.domains.delete(domain);
      this.manualOverrides.delete(domain);
    } else {
      this.domains.clear();
      this.manualOverrides.clear();
    }
  }

  /**
   * Set a manual override for a domain
   */
  setManualOverride(domain: string, thresholds: Partial<ComputeLaneConfig>): void {
    this.manualOverrides.set(domain, thresholds);
  }

  /**
   * Clear manual override for a domain
   */
  clearManualOverride(domain: string): void {
    this.manualOverrides.delete(domain);
  }

  /**
   * Persist thresholds to memory
   */
  async persist(): Promise<void> {
    if (!this.memoryStore) return;

    const data: Record<string, { thresholds: ComputeLaneConfig; calibrationCount: number }> = {};

    const domainEntries = Array.from(this.domains.entries());
    for (let i = 0; i < domainEntries.length; i++) {
      const [domain, state] = domainEntries[i];
      data[domain] = {
        thresholds: state.thresholds,
        calibrationCount: state.calibrationCount,
      };
    }

    await this.memoryStore.store(
      `${ThresholdTuner.MEMORY_KEY_PREFIX}-domains`,
      data,
      ThresholdTuner.MEMORY_NAMESPACE
    );

    // Persist manual overrides separately
    const overrides = Object.fromEntries(this.manualOverrides);
    await this.memoryStore.store(
      `${ThresholdTuner.MEMORY_KEY_PREFIX}-overrides`,
      overrides,
      ThresholdTuner.MEMORY_NAMESPACE
    );
  }

  /**
   * Load persisted thresholds from memory
   */
  async load(): Promise<void> {
    if (!this.memoryStore) return;

    // Load domain thresholds
    const data = await this.memoryStore.retrieve(
      `${ThresholdTuner.MEMORY_KEY_PREFIX}-domains`,
      ThresholdTuner.MEMORY_NAMESPACE
    ) as Record<string, { thresholds: ComputeLaneConfig; calibrationCount: number }> | null;

    if (data) {
      const entries = Object.entries(data);
      for (let i = 0; i < entries.length; i++) {
        const [domain, saved] = entries[i];
        const state = this.getOrCreateDomainState(domain);
        state.thresholds = saved.thresholds;
        state.calibrationCount = saved.calibrationCount;
      }
    }

    // Load manual overrides
    const overrides = await this.memoryStore.retrieve(
      `${ThresholdTuner.MEMORY_KEY_PREFIX}-overrides`,
      ThresholdTuner.MEMORY_NAMESPACE
    ) as Record<string, Partial<ComputeLaneConfig>> | null;

    if (overrides) {
      const overrideEntries = Object.entries(overrides);
      for (let i = 0; i < overrideEntries.length; i++) {
        const [domain, override] = overrideEntries[i];
        this.manualOverrides.set(domain, override);
      }
    }
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Get or create domain state
   */
  private getOrCreateDomainState(domain: string): DomainState {
    let state = this.domains.get(domain);
    if (!state) {
      state = {
        history: [],
        thresholds: { ...this.config.defaultThresholds },
        emaFalsePositive: 0,
        emaFalseNegative: 0,
        calibrationCount: 0,
        samplesSinceCalibration: 0,
      };
      this.domains.set(domain, state);
    }
    return state;
  }

  /**
   * Calibrate a specific domain
   */
  private async calibrateDomain(
    domain: string,
    reason: 'auto' | 'manual' | 'scheduled'
  ): Promise<void> {
    const state = this.domains.get(domain);
    if (!state) return;

    // Skip if not enough samples
    if (state.history.length < this.config.minSamplesForCalibration) {
      return;
    }

    // Skip if manual override is active
    if (this.manualOverrides.has(domain)) {
      return;
    }

    const previousThresholds = { ...state.thresholds };
    let changed = false;

    // Calculate current rates from recent history
    const recentWindow = Math.min(100, state.history.length);
    const recentHistory = state.history.slice(-recentWindow);

    const fpCount = recentHistory.filter(r => r.falsePositive).length;
    const fnCount = recentHistory.filter(r => r.falseNegative).length;
    const fpRate = fpCount / recentWindow;
    const fnRate = fnCount / recentWindow;

    // Adjust thresholds based on error rates
    // If FP rate is too high, we're escalating too aggressively -> increase thresholds
    // If FN rate is too high, we're not escalating enough -> decrease thresholds
    const maxAdj = this.config.maxAdjustmentPerCycle;

    if (fpRate > this.config.targetFalsePositiveRate) {
      // Too many false positives - increase thresholds to be less aggressive
      const adjustment = Math.min(maxAdj, (fpRate - this.config.targetFalsePositiveRate) * 0.5);
      state.thresholds.reflexThreshold = Math.min(0.3, state.thresholds.reflexThreshold + adjustment);
      state.thresholds.retrievalThreshold = Math.min(0.6, state.thresholds.retrievalThreshold + adjustment);
      state.thresholds.heavyThreshold = Math.min(0.9, state.thresholds.heavyThreshold + adjustment);
      changed = true;
    }

    if (fnRate > this.config.targetFalseNegativeRate) {
      // Too many false negatives - decrease thresholds to escalate more
      const adjustment = Math.min(maxAdj, (fnRate - this.config.targetFalseNegativeRate) * 0.5);
      state.thresholds.reflexThreshold = Math.max(0.05, state.thresholds.reflexThreshold - adjustment);
      state.thresholds.retrievalThreshold = Math.max(0.2, state.thresholds.retrievalThreshold - adjustment);
      state.thresholds.heavyThreshold = Math.max(0.5, state.thresholds.heavyThreshold - adjustment);
      changed = true;
    }

    // Update state
    state.calibrationCount++;
    state.lastCalibrationAt = new Date();
    state.samplesSinceCalibration = 0;

    // Emit event if thresholds changed
    if (changed && this.eventBus) {
      const stats = this.computeDomainStats(domain, state);
      const payload: ThresholdCalibratedPayload = {
        domain,
        previousThresholds,
        newThresholds: state.thresholds,
        stats,
        reason,
      };

      await this.eventBus.publish({
        id: `threshold-calibrated-${Date.now()}`,
        type: 'coherence.threshold_calibrated',
        timestamp: new Date(),
        source: 'quality-assessment' as DomainName,
        payload,
      });
    }
  }

  /**
   * Compute statistics for a domain
   */
  private computeDomainStats(domain: string, state: DomainState): DomainStats {
    const total = state.history.length;
    const correct = state.history.filter(r => r.wasCorrect).length;
    const fp = state.history.filter(r => r.falsePositive).length;
    const fn = state.history.filter(r => r.falseNegative).length;

    return {
      totalOutcomes: total,
      correctDecisions: correct,
      falsePositives: fp,
      falseNegatives: fn,
      accuracy: total > 0 ? correct / total : 1,
      falsePositiveRate: total > 0 ? fp / total : 0,
      falseNegativeRate: total > 0 ? fn / total : 0,
      thresholds: this.getThresholds(domain),
      hasManualOverride: this.manualOverrides.has(domain),
      lastCalibrationAt: state.lastCalibrationAt,
      calibrationCount: state.calibrationCount,
    };
  }

  /**
   * Determine compute lane from energy and thresholds
   */
  private determineLane(energy: number, thresholds: ComputeLaneConfig): ComputeLane {
    if (energy < thresholds.reflexThreshold) return 'reflex';
    if (energy < thresholds.retrievalThreshold) return 'retrieval';
    if (energy < thresholds.heavyThreshold) return 'heavy';
    return 'human';
  }

  /**
   * Check if lane1 is higher (more escalated) than lane2
   */
  private isHigherLane(lane1: ComputeLane, lane2: ComputeLane): boolean {
    const order: Record<ComputeLane, number> = {
      reflex: 0,
      retrieval: 1,
      heavy: 2,
      human: 3,
    };
    return order[lane1] > order[lane2];
  }

  /**
   * Check if lane1 is lower (less escalated) than lane2
   */
  private isLowerLane(lane1: ComputeLane, lane2: ComputeLane): boolean {
    const order: Record<ComputeLane, number> = {
      reflex: 0,
      retrieval: 1,
      heavy: 2,
      human: 3,
    };
    return order[lane1] < order[lane2];
  }

  /**
   * Get threshold value from config for a lane
   */
  private getLaneThresholdFromConfig(
    config: Partial<ComputeLaneConfig>,
    lane: ComputeLane
  ): number | undefined {
    switch (lane) {
      case 'reflex':
        return config.reflexThreshold;
      case 'retrieval':
        return config.retrievalThreshold;
      case 'heavy':
        return config.heavyThreshold;
      case 'human':
        return 1.0; // Human threshold is always 1.0 (anything above heavy)
    }
  }

  /**
   * Get default threshold for a lane
   */
  private getDefaultThreshold(lane: ComputeLane): number {
    switch (lane) {
      case 'reflex':
        return this.config.defaultThresholds.reflexThreshold;
      case 'retrieval':
        return this.config.defaultThresholds.retrievalThreshold;
      case 'heavy':
        return this.config.defaultThresholds.heavyThreshold;
      case 'human':
        return 1.0;
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new ThresholdTuner instance
 *
 * @param options - Configuration options
 * @returns A new ThresholdTuner instance
 *
 * @example
 * ```typescript
 * const tuner = createThresholdTuner({
 *   memoryStore: myMemoryStore,
 *   eventBus: myEventBus,
 *   config: { emaAlpha: 0.15 }
 * });
 *
 * await tuner.load(); // Load persisted thresholds
 * const threshold = tuner.getThreshold('security', 'heavy');
 * ```
 */
export function createThresholdTuner(options?: {
  memoryStore?: IThresholdMemoryStore;
  eventBus?: IThresholdEventBus;
  config?: Partial<ThresholdTunerConfig>;
}): ThresholdTuner {
  return new ThresholdTuner(options);
}
