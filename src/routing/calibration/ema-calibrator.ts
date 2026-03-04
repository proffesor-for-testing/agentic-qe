/**
 * EMA-based Reviewer Calibration
 * Inspired by loki-mode reviewer calibration
 *
 * Tracks per-agent accuracy using Exponential Moving Average (alpha=0.1),
 * derives dynamic voting weights for multi-agent consensus.
 * Agents with consistent accuracy get higher influence.
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Calibration record for a single agent
 */
export interface CalibrationRecord {
  agentId: string;
  /** EMA of success rate (0-1) */
  emaAccuracy: number;
  /** EMA of quality score (0-1) */
  emaQuality: number;
  /** Derived voting weight (0.2-2.0) */
  calibratedWeight: number;
  /** Total outcomes recorded */
  totalOutcomes: number;
  /** Last update timestamp */
  lastUpdated: Date;
}

/**
 * Configuration for the EMA calibrator
 */
export interface EMAConfig {
  /** Smoothing factor for EMA (default: 0.1) */
  alpha: number;
  /** Minimum outcomes before applying calibrated weight (default: 10) */
  minOutcomes: number;
  /** Minimum allowed weight (default: 0.2) */
  weightFloor: number;
  /** Maximum allowed weight (default: 2.0) */
  weightCeiling: number;
}

export const DEFAULT_EMA_CONFIG: EMAConfig = {
  alpha: 0.1,
  minOutcomes: 10,
  weightFloor: 0.2,
  weightCeiling: 2.0,
};

// ============================================================================
// EMA Calibrator
// ============================================================================

/**
 * Calibrates per-agent voting weights using Exponential Moving Average.
 *
 * Agents that consistently produce successful, high-quality outcomes
 * receive higher voting weights in multi-agent consensus decisions.
 * New agents (below minOutcomes) receive a neutral weight of 1.0.
 */
export class EMACalibrator {
  private records: Map<string, CalibrationRecord> = new Map();
  private readonly config: EMAConfig;

  constructor(config?: Partial<EMAConfig>) {
    this.config = { ...DEFAULT_EMA_CONFIG, ...config };
  }

  /**
   * Record an outcome for an agent and update its EMA calibration.
   *
   * @param agentId - The agent identifier
   * @param success - Whether the task succeeded
   * @param qualityScore - Quality score (0-1)
   * @returns Updated calibration record
   */
  recordOutcome(agentId: string, success: boolean, qualityScore: number): CalibrationRecord {
    const { alpha, minOutcomes, weightFloor, weightCeiling } = this.config;
    const existing = this.records.get(agentId);

    const successValue = success ? 1 : 0;
    const clampedQuality = Math.max(0, Math.min(1, qualityScore));

    let emaAccuracy: number;
    let emaQuality: number;

    if (existing) {
      emaAccuracy = alpha * successValue + (1 - alpha) * existing.emaAccuracy;
      emaQuality = alpha * clampedQuality + (1 - alpha) * existing.emaQuality;
    } else {
      // First outcome: initialize directly
      emaAccuracy = successValue;
      emaQuality = clampedQuality;
    }

    const totalOutcomes = (existing?.totalOutcomes ?? 0) + 1;

    // Only apply calibrated weight after sufficient outcomes
    let calibratedWeight: number;
    if (totalOutcomes >= minOutcomes) {
      calibratedWeight = Math.max(weightFloor, Math.min(weightCeiling, emaAccuracy * 2));
    } else {
      calibratedWeight = 1.0;
    }

    const record: CalibrationRecord = {
      agentId,
      emaAccuracy,
      emaQuality,
      calibratedWeight,
      totalOutcomes,
      lastUpdated: new Date(),
    };

    this.records.set(agentId, record);
    return record;
  }

  /**
   * Get the calibration record for an agent.
   *
   * @param agentId - The agent identifier
   * @returns Calibration record or null if not found
   */
  getCalibration(agentId: string): CalibrationRecord | null {
    return this.records.get(agentId) ?? null;
  }

  /**
   * Get the calibrated weight for an agent.
   * Returns 1.0 (neutral) for unknown agents or those below minOutcomes.
   *
   * @param agentId - The agent identifier
   * @returns Calibrated voting weight (0.2-2.0, or 1.0 if uncalibrated)
   */
  getCalibratedWeight(agentId: string): number {
    const record = this.records.get(agentId);
    if (!record || record.totalOutcomes < this.config.minOutcomes) {
      return 1.0;
    }
    return record.calibratedWeight;
  }

  /**
   * Get all calibration records.
   */
  getAllCalibrations(): CalibrationRecord[] {
    return Array.from(this.records.values());
  }

  /**
   * Reset calibration data.
   *
   * @param agentId - If provided, reset only this agent. Otherwise reset all.
   */
  reset(agentId?: string): void {
    if (agentId !== undefined) {
      this.records.delete(agentId);
    } else {
      this.records.clear();
    }
  }

  /**
   * Serialize all records for persistence.
   */
  serialize(): Record<string, CalibrationRecord> {
    const result: Record<string, CalibrationRecord> = {};
    for (const [key, record] of this.records) {
      result[key] = { ...record };
    }
    return result;
  }

  /**
   * Load previously serialized records.
   */
  deserialize(data: Record<string, CalibrationRecord>): void {
    this.records.clear();
    for (const [key, record] of Object.entries(data)) {
      this.records.set(key, {
        ...record,
        lastUpdated: new Date(record.lastUpdated),
      });
    }
  }
}
