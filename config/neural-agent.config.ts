/**
 * Neural Agent Configuration
 *
 * Centralized configuration for neural capabilities across QE agents.
 * Enable/disable neural features per agent type with custom settings.
 */

import { NeuralConfig } from '../src/agents/mixins/NeuralCapableMixin';
import { QEAgentType } from '../src/types';

export interface AgentNeuralConfig {
  [agentType: string]: Partial<NeuralConfig> & {
    priority?: number; // Higher priority agents get better models
  };
}

/**
 * Default neural configuration for all agents
 */
export const DEFAULT_AGENT_NEURAL_CONFIG: Partial<NeuralConfig> = {
  enabled: false, // Opt-in by default
  model: 'default',
  confidence: 0.70,
  cacheEnabled: true,
  cacheTTL: 5 * 60 * 1000, // 5 minutes
  maxCacheSize: 1000,
  fallbackEnabled: true
};

/**
 * Agent-specific neural configurations
 * Enables neural features for high-value agents
 */
export const AGENT_NEURAL_CONFIGS: AgentNeuralConfig = {
  // P1 Agents - Enable neural with high confidence
  [QEAgentType.TEST_GENERATOR]: {
    enabled: false, // Opt-in via flag
    model: 'default',
    confidence: 0.75,
    cacheEnabled: true,
    cacheTTL: 10 * 60 * 1000, // 10 minutes (test patterns change slowly)
    maxCacheSize: 2000,
    priority: 100
  },

  [QEAgentType.COVERAGE_ANALYZER]: {
    enabled: false,
    model: 'default',
    confidence: 0.80, // Higher confidence for coverage gaps
    cacheEnabled: true,
    cacheTTL: 5 * 60 * 1000,
    maxCacheSize: 1500,
    priority: 90
  },

  [QEAgentType.FLAKY_TEST_HUNTER]: {
    enabled: false,
    model: 'default',
    confidence: 0.70, // More sensitive for flaky detection
    cacheEnabled: true,
    cacheTTL: 3 * 60 * 1000, // 3 minutes (flakiness changes frequently)
    maxCacheSize: 1000,
    priority: 95
  },

  [QEAgentType.REGRESSION_RISK_ANALYZER]: {
    enabled: false,
    model: 'default',
    confidence: 0.82, // High confidence for risk scoring
    cacheEnabled: true,
    cacheTTL: 5 * 60 * 1000,
    maxCacheSize: 1200,
    priority: 85
  },

  // P2 Agents - Lower priority, conservative settings
  [QEAgentType.TEST_EXECUTOR]: {
    enabled: false,
    confidence: 0.75,
    cacheEnabled: true,
    priority: 50
  },

  [QEAgentType.QUALITY_ANALYZER]: {
    enabled: false,
    confidence: 0.78,
    cacheEnabled: true,
    priority: 60
  }
};

/**
 * Get neural configuration for a specific agent type
 */
export function getNeuralConfigForAgent(agentType: QEAgentType | string): Partial<NeuralConfig> {
  const agentConfig = AGENT_NEURAL_CONFIGS[agentType];

  if (!agentConfig) {
    return { ...DEFAULT_AGENT_NEURAL_CONFIG };
  }

  return {
    ...DEFAULT_AGENT_NEURAL_CONFIG,
    ...agentConfig
  };
}

/**
 * Enable neural features globally (opt-in activation)
 */
export function enableAllNeuralFeatures(): AgentNeuralConfig {
  const enabled: AgentNeuralConfig = {};

  for (const [agentType, config] of Object.entries(AGENT_NEURAL_CONFIGS)) {
    enabled[agentType] = {
      ...config,
      enabled: true
    };
  }

  return enabled;
}

/**
 * Neural feature flags for granular control
 */
export interface NeuralFeatureFlags {
  testGeneration: boolean;      // Neural-powered test suggestions
  coverageGapPrediction: boolean; // Predict coverage gaps
  flakinessDetection: boolean;   // Enhanced flaky test detection
  riskScoring: boolean;          // Neural risk scoring
  patternMatching: boolean;      // Pattern-based optimizations
  adaptiveLearning: boolean;     // Continuous improvement
}

export const DEFAULT_NEURAL_FEATURE_FLAGS: NeuralFeatureFlags = {
  testGeneration: false,
  coverageGapPrediction: false,
  flakinessDetection: false,
  riskScoring: false,
  patternMatching: false,
  adaptiveLearning: false
};

/**
 * Environment-based configuration
 */
export function getNeuralConfigForEnvironment(env: string = process.env.NODE_ENV || 'development'): {
  agentConfigs: AgentNeuralConfig;
  featureFlags: NeuralFeatureFlags;
} {
  switch (env) {
    case 'production':
      // Conservative in production - opt-in only
      return {
        agentConfigs: AGENT_NEURAL_CONFIGS,
        featureFlags: DEFAULT_NEURAL_FEATURE_FLAGS
      };

    case 'staging':
      // Enable for high-priority agents in staging
      return {
        agentConfigs: {
          ...AGENT_NEURAL_CONFIGS,
          [QEAgentType.TEST_GENERATOR]: {
            ...AGENT_NEURAL_CONFIGS[QEAgentType.TEST_GENERATOR],
            enabled: true
          },
          [QEAgentType.FLAKY_TEST_HUNTER]: {
            ...AGENT_NEURAL_CONFIGS[QEAgentType.FLAKY_TEST_HUNTER],
            enabled: true
          }
        },
        featureFlags: {
          ...DEFAULT_NEURAL_FEATURE_FLAGS,
          testGeneration: true,
          flakinessDetection: true
        }
      };

    case 'development':
    case 'test':
    default:
      // Enable all features in development/test
      return {
        agentConfigs: enableAllNeuralFeatures(),
        featureFlags: {
          testGeneration: true,
          coverageGapPrediction: true,
          flakinessDetection: true,
          riskScoring: true,
          patternMatching: true,
          adaptiveLearning: true
        }
      };
  }
}
