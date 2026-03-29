/**
 * CUSUM Drift Detector (R2, Phase 5)
 *
 * Two-sided Cumulative Sum (CUSUM) detector for monitoring coherence
 * gate energy drift. Each gate type maintains independent state.
 *
 * Algorithm:
 *   S+(n) = max(0, S+(n-1) + (x_n - mu - slack))
 *   S-(n) = max(0, S-(n-1) + (-x_n + mu - slack))
 *   Drift detected when S+ > threshold OR S- > threshold
 *
 * mu is the running mean of the first N samples (warmup period).
 *
 * @module integrations/ruvector/cusum-detector
 * @see ADR-087-ruvector-advanced-capabilities.md
 */

/** Configuration for the CUSUM detector */
export interface CusumConfig {
  /** Detection threshold (default: 5.0) */
  threshold: number;
  /** Allowable slack/drift (default: 0.5) */
  slack: number;
  /** Reset cumulative sum after alarm (default: true) */
  resetOnAlarm: boolean;
  /** Number of samples for warmup period to estimate mu (default: 20) */
  warmupSamples: number;
}

/** Result of a CUSUM update */
export interface CusumResult {
  /** Whether drift was detected */
  driftDetected: boolean;
  /** Current cumulative sum (max of positive and negative) */
  cumulativeSum: number;
  /** Direction of detected drift */
  direction: 'positive' | 'negative' | 'none';
  /** Number of samples since last reset */
  samplesSinceReset: number;
}

/** Gate types that can be independently monitored */
export type GateType = 'retrieve' | 'write' | 'learn' | 'act';

/** Internal state for one gate's CUSUM tracker */
interface GateState {
  sPlus: number;
  sMinus: number;
  samplesSinceReset: number;
  /** Running sum for mean estimation during warmup */
  warmupSum: number;
  /** Number of warmup samples collected */
  warmupCount: number;
  /** Estimated mean (null during warmup) */
  mu: number | null;
}

const DEFAULT_CONFIG: CusumConfig = {
  threshold: 5.0,
  slack: 0.5,
  resetOnAlarm: true,
  warmupSamples: 20,
};

/**
 * Two-sided CUSUM detector for drift monitoring.
 *
 * Tracks both positive and negative cumulative sums per gate type.
 * During the warmup period, samples are collected to estimate the
 * running mean (mu). After warmup, deviations from mu are accumulated
 * and compared against the threshold.
 */
export class CusumDetector {
  private readonly config: CusumConfig;
  private readonly states: Map<GateType, GateState> = new Map();

  constructor(config: Partial<CusumConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Update the CUSUM state for a gate type with a new sample value.
   *
   * During warmup, collects samples to estimate mu.
   * After warmup, applies the two-sided CUSUM algorithm.
   */
  update(gateType: GateType, value: number): CusumResult {
    const state = this.getOrCreateState(gateType);
    state.samplesSinceReset++;

    // Warmup phase: collect samples to estimate mu
    if (state.mu === null) {
      state.warmupSum += value;
      state.warmupCount++;

      if (state.warmupCount >= this.config.warmupSamples) {
        state.mu = state.warmupSum / state.warmupCount;
      }

      return {
        driftDetected: false,
        cumulativeSum: 0,
        direction: 'none',
        samplesSinceReset: state.samplesSinceReset,
      };
    }

    // Two-sided CUSUM update
    state.sPlus = Math.max(0, state.sPlus + (value - state.mu - this.config.slack));
    state.sMinus = Math.max(0, state.sMinus + (-value + state.mu - this.config.slack));

    const cumulativeSum = Math.max(state.sPlus, state.sMinus);
    let driftDetected = false;
    let direction: CusumResult['direction'] = 'none';

    if (state.sPlus > this.config.threshold) {
      driftDetected = true;
      direction = 'positive';
    } else if (state.sMinus > this.config.threshold) {
      driftDetected = true;
      direction = 'negative';
    }

    const result: CusumResult = {
      driftDetected,
      cumulativeSum,
      direction,
      samplesSinceReset: state.samplesSinceReset,
    };

    if (driftDetected && this.config.resetOnAlarm) {
      state.sPlus = 0;
      state.sMinus = 0;
      state.samplesSinceReset = 0;
    }

    return result;
  }

  /**
   * Reset the CUSUM state for a specific gate type, or all gates.
   */
  reset(gateType?: GateType): void {
    if (gateType) {
      this.states.delete(gateType);
    } else {
      this.states.clear();
    }
  }

  /**
   * Get the current CUSUM state for a gate type without updating.
   */
  getState(gateType: GateType): CusumResult {
    const state = this.states.get(gateType);
    if (!state) {
      return {
        driftDetected: false,
        cumulativeSum: 0,
        direction: 'none',
        samplesSinceReset: 0,
      };
    }

    const cumulativeSum = Math.max(state.sPlus, state.sMinus);
    let direction: CusumResult['direction'] = 'none';

    if (state.sPlus > this.config.threshold) {
      direction = 'positive';
    } else if (state.sMinus > this.config.threshold) {
      direction = 'negative';
    }

    return {
      driftDetected: state.sPlus > this.config.threshold || state.sMinus > this.config.threshold,
      cumulativeSum,
      direction,
      samplesSinceReset: state.samplesSinceReset,
    };
  }

  private getOrCreateState(gateType: GateType): GateState {
    let state = this.states.get(gateType);
    if (!state) {
      state = {
        sPlus: 0,
        sMinus: 0,
        samplesSinceReset: 0,
        warmupSum: 0,
        warmupCount: 0,
        mu: null,
      };
      this.states.set(gateType, state);
    }
    return state;
  }
}
