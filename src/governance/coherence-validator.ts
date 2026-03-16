/**
 * Coherence Validator - Governance Pipeline for Test Artifact Validation
 *
 * Provides a validation pipeline that uses CoherenceGate to validate
 * AI-generated test artifacts. Operates in two modes:
 *
 * - **Advisory mode** (default): Logs coherence violations but does not block.
 *   The artifact is always approved with a warning attached.
 *
 * - **Blocking mode**: Rejects artifacts that exceed the coherence threshold.
 *   Must be explicitly enabled via configuration.
 *
 * @module governance/coherence-validator
 * @see ADR-083-coherence-gated-agent-actions.md
 */

import { LoggerFactory } from '../logging/index.js';
import {
  CoherenceGate,
  createCoherenceGate,
  DEFAULT_COHERENCE_THRESHOLD,
  type TestArtifact,
  type ValidationResult,
  type CoherenceDecision,
} from '../integrations/ruvector/coherence-gate.js';
import { getRuVectorFeatureFlags } from '../integrations/ruvector/feature-flags.js';

const logger = LoggerFactory.create('coherence-validator');

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for the coherence validation pipeline.
 */
export interface CoherenceValidatorConfig {
  /** Whether to block on coherence violations (default: false = advisory) */
  blocking: boolean;
  /** Coherence energy threshold (default: 0.4) */
  threshold: number;
  /** Whether to emit warnings to the log in advisory mode (default: true) */
  logWarnings: boolean;
}

/**
 * Result from the validation pipeline.
 */
export interface ValidationPipelineResult {
  /** Whether the artifact is approved (always true in advisory mode) */
  approved: boolean;
  /** The mode used for this validation */
  mode: 'advisory' | 'blocking';
  /** The underlying coherence validation result */
  validation: ValidationResult;
  /** Warnings generated (populated in advisory mode when energy exceeds threshold) */
  warnings: string[];
  /** Whether the coherence gate feature flag was enabled */
  featureFlagEnabled: boolean;
}

/** Default configuration: advisory mode */
export const DEFAULT_COHERENCE_VALIDATOR_CONFIG: CoherenceValidatorConfig = {
  blocking: false,
  threshold: DEFAULT_COHERENCE_THRESHOLD,
  logWarnings: true,
};

// ============================================================================
// Coherence Validator
// ============================================================================

/**
 * Validation pipeline that uses CoherenceGate for test artifact validation.
 *
 * Wraps the CoherenceGate with configurable advisory/blocking behavior
 * and integrates with the governance logging infrastructure.
 *
 * @example
 * ```typescript
 * const validator = new CoherenceValidator(); // advisory mode by default
 * const result = validator.validateTestArtifact({
 *   assertions: ['expect(x).toBe(1)'],
 *   observedBehavior: ['x was 1'],
 *   coverage: 0.9,
 *   domain: 'test-generation',
 *   confidence: 0.95,
 * });
 * if (result.warnings.length > 0) {
 *   console.warn('Coherence warnings:', result.warnings);
 * }
 * ```
 */
export class CoherenceValidator {
  private readonly config: CoherenceValidatorConfig;
  private readonly gate: CoherenceGate;
  private validationCount: number = 0;
  private warningCount: number = 0;
  private blockCount: number = 0;

  constructor(config: Partial<CoherenceValidatorConfig> = {}) {
    this.config = { ...DEFAULT_COHERENCE_VALIDATOR_CONFIG, ...config };
    this.gate = createCoherenceGate(this.config.threshold);
  }

  /**
   * Validate a test artifact through the coherence pipeline.
   *
   * In advisory mode (default), always approves but attaches warnings
   * when coherence energy exceeds the threshold.
   *
   * In blocking mode, rejects artifacts that exceed the threshold.
   *
   * @param artifact - The test artifact to validate
   * @returns Pipeline result with approval status and warnings
   */
  validateTestArtifact(artifact: TestArtifact): ValidationPipelineResult {
    const flags = getRuVectorFeatureFlags();
    const featureFlagEnabled = flags.useCoherenceGate;

    // If feature flag is disabled, pass through
    if (!featureFlagEnabled) {
      return this.createPassthroughResult(artifact);
    }

    this.validationCount++;

    const validation = this.gate.validate(artifact, this.config.threshold);
    const warnings: string[] = [];
    const mode = this.config.blocking ? 'blocking' : 'advisory';

    if (!validation.passed) {
      const warning = `Coherence validation warning for domain '${artifact.domain}': ${validation.reason}`;
      warnings.push(warning);

      if (this.config.logWarnings) {
        logger.warn(warning, {
          energy: validation.energy,
          threshold: validation.threshold,
          domain: artifact.domain,
          mode,
        });
      }

      if (this.config.blocking) {
        this.blockCount++;
        logger.info('Artifact blocked by coherence gate', {
          energy: validation.energy,
          domain: artifact.domain,
        });

        return {
          approved: false,
          mode: 'blocking',
          validation,
          warnings,
          featureFlagEnabled,
        };
      }

      // Advisory mode: approve but warn
      this.warningCount++;
    }

    return {
      approved: true,
      mode,
      validation,
      warnings,
      featureFlagEnabled,
    };
  }

  /**
   * Get the decision log from the underlying coherence gate.
   */
  getDecisionLog(): CoherenceDecision[] {
    return this.gate.getDecisionLog();
  }

  /**
   * Get validation statistics.
   */
  getStats(): {
    validationCount: number;
    warningCount: number;
    blockCount: number;
    mode: 'advisory' | 'blocking';
    threshold: number;
  } {
    return {
      validationCount: this.validationCount,
      warningCount: this.warningCount,
      blockCount: this.blockCount,
      mode: this.config.blocking ? 'blocking' : 'advisory',
      threshold: this.config.threshold,
    };
  }

  /**
   * Get the underlying coherence gate (for advanced usage or testing).
   */
  getGate(): CoherenceGate {
    return this.gate;
  }

  /**
   * Create a passthrough result when the feature flag is disabled.
   */
  private createPassthroughResult(artifact: TestArtifact): ValidationPipelineResult {
    // Construct a minimal validation result for passthrough
    const validation: ValidationResult = {
      passed: true,
      energy: 0,
      threshold: this.config.threshold,
      witness: {
        id: 'passthrough',
        timestamp: Date.now(),
        artifactHash: 'disabled',
        energy: 0,
        threshold: this.config.threshold,
        passed: true,
        previousHash: '0'.repeat(64),
        recordHash: '0'.repeat(64),
      },
    };

    return {
      approved: true,
      mode: this.config.blocking ? 'blocking' : 'advisory',
      validation,
      warnings: [],
      featureFlagEnabled: false,
    };
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a coherence validator with the given configuration.
 */
export function createCoherenceValidator(
  config?: Partial<CoherenceValidatorConfig>,
): CoherenceValidator {
  return new CoherenceValidator(config);
}
