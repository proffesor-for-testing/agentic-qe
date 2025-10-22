/**
 * ImprovementLoop Configuration - Phase 2 (Milestone 2.2)
 *
 * Configuration for the continuous improvement loop system.
 * This file defines default settings and opt-in features for safety.
 */

export interface ImprovementLoopConfig {
  /**
   * Enable the improvement loop
   * @default true
   */
  enabled: boolean;

  /**
   * Interval for running improvement cycles (in milliseconds)
   * @default 3600000 (1 hour)
   */
  cycleIntervalMs: number;

  /**
   * Enable auto-apply for best strategies (OPT-IN for safety)
   * Only strategies with confidence >0.9 and success rate >0.8 will be applied
   * @default false
   */
  autoApplyEnabled: boolean;

  /**
   * Minimum confidence threshold for auto-apply
   * @default 0.9
   */
  autoApplyMinConfidence: number;

  /**
   * Minimum success rate threshold for auto-apply
   * @default 0.8
   */
  autoApplyMinSuccessRate: number;

  /**
   * Maximum number of strategies to auto-apply per cycle
   * @default 3
   */
  autoApplyMaxStrategies: number;

  /**
   * Failure pattern analysis configuration
   */
  failurePatterns: {
    /**
     * Minimum frequency to trigger analysis
     * @default 5
     */
    minFrequency: number;

    /**
     * Minimum confidence to trigger analysis
     * @default 0.7
     */
    minConfidence: number;

    /**
     * Enable automatic mitigation suggestions
     * @default true
     */
    suggestMitigations: boolean;
  };

  /**
   * A/B testing configuration
   */
  abTesting: {
    /**
     * Enable A/B testing framework
     * @default true
     */
    enabled: boolean;

    /**
     * Default sample size for A/B tests
     * @default 100
     */
    defaultSampleSize: number;

    /**
     * Maximum concurrent A/B tests
     * @default 5
     */
    maxConcurrentTests: number;

    /**
     * Success rate weight in winner determination (0.0 - 1.0)
     * @default 0.7
     */
    successRateWeight: number;

    /**
     * Execution time weight in winner determination (0.0 - 1.0)
     * @default 0.3
     */
    executionTimeWeight: number;
  };

  /**
   * Background worker configuration
   */
  worker: {
    /**
     * Enable background worker
     * @default true
     */
    enabled: boolean;

    /**
     * Maximum retry attempts for failed cycles
     * @default 3
     */
    maxRetries: number;

    /**
     * Delay between retries (in milliseconds)
     * @default 60000 (1 minute)
     */
    retryDelayMs: number;
  };

  /**
   * Performance tracking integration
   */
  performance: {
    /**
     * Enable performance-based decisions
     * @default true
     */
    enabled: boolean;

    /**
     * Target improvement rate (percentage)
     * @default 20
     */
    targetImprovementRate: number;

    /**
     * Time period for improvement target (in days)
     * @default 30
     */
    targetPeriodDays: number;
  };

  /**
   * Learning engine integration
   */
  learning: {
    /**
     * Enable learning-based optimizations
     * @default true
     */
    enabled: boolean;

    /**
     * Minimum pattern usage count to consider for optimization
     * @default 10
     */
    minPatternUsage: number;

    /**
     * Minimum pattern confidence for recommendations
     * @default 0.8
     */
    minPatternConfidence: number;
  };
}

/**
 * Default configuration (conservative for safety)
 */
export const DEFAULT_IMPROVEMENT_CONFIG: ImprovementLoopConfig = {
  enabled: true,
  cycleIntervalMs: 3600000, // 1 hour

  // Auto-apply DISABLED by default for safety
  autoApplyEnabled: false,
  autoApplyMinConfidence: 0.9,
  autoApplyMinSuccessRate: 0.8,
  autoApplyMaxStrategies: 3,

  failurePatterns: {
    minFrequency: 5,
    minConfidence: 0.7,
    suggestMitigations: true
  },

  abTesting: {
    enabled: true,
    defaultSampleSize: 100,
    maxConcurrentTests: 5,
    successRateWeight: 0.7,
    executionTimeWeight: 0.3
  },

  worker: {
    enabled: true,
    maxRetries: 3,
    retryDelayMs: 60000 // 1 minute
  },

  performance: {
    enabled: true,
    targetImprovementRate: 20, // 20%
    targetPeriodDays: 30
  },

  learning: {
    enabled: true,
    minPatternUsage: 10,
    minPatternConfidence: 0.8
  }
};

/**
 * Aggressive configuration (for mature systems with high confidence)
 * ⚠️ WARNING: Use only after thorough testing and validation
 */
export const AGGRESSIVE_IMPROVEMENT_CONFIG: ImprovementLoopConfig = {
  ...DEFAULT_IMPROVEMENT_CONFIG,
  cycleIntervalMs: 1800000, // 30 minutes

  // Auto-apply ENABLED with high thresholds
  autoApplyEnabled: true,
  autoApplyMinConfidence: 0.95,
  autoApplyMinSuccessRate: 0.9,
  autoApplyMaxStrategies: 5,

  failurePatterns: {
    minFrequency: 3,
    minConfidence: 0.6,
    suggestMitigations: true
  },

  abTesting: {
    enabled: true,
    defaultSampleSize: 50, // faster tests
    maxConcurrentTests: 10,
    successRateWeight: 0.7,
    executionTimeWeight: 0.3
  }
};

/**
 * Development/testing configuration (frequent cycles, low thresholds)
 */
export const DEV_IMPROVEMENT_CONFIG: ImprovementLoopConfig = {
  ...DEFAULT_IMPROVEMENT_CONFIG,
  cycleIntervalMs: 300000, // 5 minutes
  autoApplyEnabled: false, // still disabled for safety

  abTesting: {
    enabled: true,
    defaultSampleSize: 10, // small for testing
    maxConcurrentTests: 3,
    successRateWeight: 0.7,
    executionTimeWeight: 0.3
  },

  worker: {
    enabled: true,
    maxRetries: 2,
    retryDelayMs: 10000 // 10 seconds
  }
};

/**
 * Load configuration from environment or use default
 */
export function loadImprovementConfig(): ImprovementLoopConfig {
  const env = process.env.NODE_ENV || 'production';

  switch (env) {
    case 'development':
    case 'test':
      return DEV_IMPROVEMENT_CONFIG;
    case 'production':
    default:
      return DEFAULT_IMPROVEMENT_CONFIG;
  }
}

/**
 * Validate configuration
 */
export function validateImprovementConfig(config: ImprovementLoopConfig): string[] {
  const errors: string[] = [];

  if (config.cycleIntervalMs < 60000) {
    errors.push('cycleIntervalMs must be at least 60000 (1 minute)');
  }

  if (config.autoApplyMinConfidence < 0 || config.autoApplyMinConfidence > 1) {
    errors.push('autoApplyMinConfidence must be between 0 and 1');
  }

  if (config.autoApplyMinSuccessRate < 0 || config.autoApplyMinSuccessRate > 1) {
    errors.push('autoApplyMinSuccessRate must be between 0 and 1');
  }

  if (config.autoApplyMaxStrategies < 1) {
    errors.push('autoApplyMaxStrategies must be at least 1');
  }

  if (config.abTesting.defaultSampleSize < 1) {
    errors.push('abTesting.defaultSampleSize must be at least 1');
  }

  if (config.worker.maxRetries < 1) {
    errors.push('worker.maxRetries must be at least 1');
  }

  if (config.performance.targetImprovementRate <= 0) {
    errors.push('performance.targetImprovementRate must be greater than 0');
  }

  return errors;
}
