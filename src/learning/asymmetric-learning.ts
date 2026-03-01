/**
 * Asymmetric Learning Engine - ADR-061
 *
 * Hebbian-inspired asymmetric confidence updates:
 *   success(A, B) => affinity += successRate
 *   failure(A, B) => affinity -= failureRate
 *
 * Default 10:1 penalty ratio -- a single failure requires 10 consecutive
 * successes to recover. Patterns below viability threshold are quarantined.
 * Infrastructure failures (timeouts, ECONNREFUSED, etc.) do NOT penalize.
 */

/** Configuration for the asymmetric learning engine. */
export interface AsymmetricLearningConfig {
  /** Confidence increment on success (default: 0.1) */
  successRate: number;
  /** Confidence decrement on failure (default: 1.0 -- 10x success) */
  failureRate: number;
  /** Confidence below which a pattern is quarantined (default: 0.3) */
  viabilityThreshold: number;
  /** Consecutive successes needed for rehabilitation (default: 10) */
  rehabilitationThreshold: number;
  /** Maximum quarantine duration in ms (default: 7 days) */
  maxQuarantineDurationMs: number;
  /** Per-domain overrides for asymmetric rates */
  domainOverrides?: Partial<Record<string, {
    successRate: number;
    failureRate: number;
    viabilityThreshold: number;
  }>>;
}

/** Context for classifying a failure as pattern vs infrastructure. */
export interface FailureContext {
  /** Explicit category if already known */
  failureCategory?: 'pattern' | 'infrastructure' | 'unknown';
  /** Raw error message for heuristic classification */
  errorMessage?: string;
  /** Duration of the operation in milliseconds */
  durationMs?: number;
  /** Whether the infrastructure was healthy at the time */
  infrastructureHealthy?: boolean;
}

/** Decision returned by quarantine evaluation. */
export interface QuarantineDecision {
  shouldQuarantine: boolean;
  confidence: number;
  viabilityThreshold: number;
  domain?: string;
}

/** Result of a rehabilitation check. */
export interface RehabilitationResult {
  canRehabilitate: boolean;
  consecutiveSuccesses: number;
  requiredSuccesses: number;
  domain?: string;
}

/** Error substrings that indicate infrastructure failures */
const INFRA_ERROR_SIGNALS = ['ECONNREFUSED', 'ETIMEOUT', 'ENOMEM', 'ENOSPC'] as const;

/** Duration threshold (ms) above which we classify as infrastructure timeout */
const TIMEOUT_THRESHOLD_MS = 30_000;

/**
 * Default configuration with domain-specific overrides.
 *
 * Base ratio: 10:1 (failureRate / successRate).
 * security-compliance: 20:1 (stricter -- security bugs are costly).
 * test-generation: ~7:1 (more lenient -- test patterns iterate fast).
 * quality-assessment: 10:1 with a higher viability floor.
 */
export const DEFAULT_ASYMMETRIC_CONFIG: AsymmetricLearningConfig = {
  successRate: 0.1,
  failureRate: 1.0,
  viabilityThreshold: 0.3,
  rehabilitationThreshold: 10,
  maxQuarantineDurationMs: 7 * 24 * 60 * 60 * 1000,
  domainOverrides: {
    'security-compliance': { successRate: 0.05, failureRate: 1.0, viabilityThreshold: 0.5 },
    'test-generation': { successRate: 0.15, failureRate: 1.0, viabilityThreshold: 0.2 },
    'quality-assessment': { successRate: 0.1, failureRate: 1.0, viabilityThreshold: 0.4 },
  },
};

/**
 * Asymmetric Learning Engine
 *
 * Applies Hebbian-style asymmetric updates to pattern confidence scores.
 * A single failure penalizes confidence far more than a single success
 * rewards it, ensuring unreliable patterns are quickly quarantined while
 * reliable patterns must prove themselves over many uses.
 */
export class AsymmetricLearningEngine {
  private readonly config: AsymmetricLearningConfig;

  constructor(config: Partial<AsymmetricLearningConfig> = {}) {
    this.config = {
      ...DEFAULT_ASYMMETRIC_CONFIG,
      ...config,
      domainOverrides: {
        ...DEFAULT_ASYMMETRIC_CONFIG.domainOverrides,
        ...config.domainOverrides,
      },
    };
  }

  /**
   * Compute the new confidence after a success or failure outcome.
   * success => confidence += successRate; failure => confidence -= failureRate.
   * Result clamped to [0, 1].
   *
   * @param currentConfidence - Current confidence value in [0, 1]
   * @param outcome - Whether the pattern succeeded or failed
   * @param domain - Optional domain for domain-specific rates
   * @returns Updated confidence clamped to [0, 1]
   */
  computeConfidenceUpdate(
    currentConfidence: number,
    outcome: 'success' | 'failure',
    domain?: string,
  ): number {
    const { successRate, failureRate } = this.getConfigForDomain(domain);
    const delta = outcome === 'success' ? successRate : -failureRate;
    return clamp(currentConfidence + delta, 0, 1);
  }

  /**
   * Determine whether a pattern should be quarantined based on its
   * confidence and the applicable viability threshold.
   *
   * @param confidence - Current pattern confidence in [0, 1]
   * @param domain - Optional domain for domain-specific threshold
   */
  shouldQuarantine(confidence: number, domain?: string): QuarantineDecision {
    const { viabilityThreshold } = this.getConfigForDomain(domain);
    return {
      shouldQuarantine: confidence < viabilityThreshold,
      confidence,
      viabilityThreshold,
      domain,
    };
  }

  /**
   * Classify a failure as pattern or infrastructure.
   * Infrastructure failures do NOT penalize patterns.
   *
   * Heuristics (in priority order):
   * 1. infrastructureHealthy === false -> infrastructure
   * 2. durationMs > 30 000 -> infrastructure (timeout)
   * 3. errorMessage contains ECONNREFUSED/ETIMEOUT/ENOMEM/ENOSPC -> infrastructure
   * 4. Explicit failureCategory -> use it
   * 5. Default -> pattern (blame the pattern)
   *
   * @param context - Failure context with optional diagnostics
   */
  classifyFailure(context: FailureContext): 'pattern' | 'infrastructure' {
    if (context.infrastructureHealthy === false) {
      return 'infrastructure';
    }
    if (context.durationMs !== undefined && context.durationMs > TIMEOUT_THRESHOLD_MS) {
      return 'infrastructure';
    }
    if (context.errorMessage) {
      const upper = context.errorMessage.toUpperCase();
      for (const signal of INFRA_ERROR_SIGNALS) {
        if (upper.includes(signal)) return 'infrastructure';
      }
    }
    if (context.failureCategory === 'infrastructure') return 'infrastructure';
    if (context.failureCategory === 'pattern') return 'pattern';
    return 'pattern';
  }

  /**
   * Check whether a quarantined pattern has earned enough consecutive
   * successes to be rehabilitated.
   *
   * @param consecutiveSuccesses - Number of consecutive successes achieved
   * @param domain - Optional domain (uses global threshold)
   */
  checkRehabilitation(consecutiveSuccesses: number, domain?: string): RehabilitationResult {
    const required = this.config.rehabilitationThreshold;
    return {
      canRehabilitate: consecutiveSuccesses >= required,
      consecutiveSuccesses,
      requiredSuccesses: required,
      domain,
    };
  }

  /**
   * Return the effective config for a domain, falling back to base config.
   * @param domain - Optional domain key
   */
  getConfigForDomain(domain?: string): {
    successRate: number;
    failureRate: number;
    viabilityThreshold: number;
  } {
    if (domain && this.config.domainOverrides?.[domain]) {
      return this.config.domainOverrides[domain] as {
        successRate: number;
        failureRate: number;
        viabilityThreshold: number;
      };
    }
    return {
      successRate: this.config.successRate,
      failureRate: this.config.failureRate,
      viabilityThreshold: this.config.viabilityThreshold,
    };
  }

  /**
   * Compute the asymmetry ratio (failureRate / successRate) for a domain.
   * @param domain - Optional domain key
   * @returns The ratio (e.g. 10.0 for default 1.0/0.1)
   */
  getAsymmetryRatio(domain?: string): number {
    const { successRate, failureRate } = this.getConfigForDomain(domain);
    if (successRate === 0) return Infinity;
    return failureRate / successRate;
  }
}

/** Clamp a number to [min, max]. */
function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}
