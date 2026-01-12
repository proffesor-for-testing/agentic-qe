/**
 * Agentic QE v3 - RL Suite Main Export
 *
 * Complete RL Suite for Quality Engineering with 9 algorithms.
 * Per ADR-040, provides reinforcement learning for QE decision-making.
 */

import type { DomainName } from '../../shared/types';
import type { RLAlgorithmType } from './interfaces';
import type { QERLSuite } from './orchestrator';

// ============================================================================
// Main Exports
// ============================================================================

export { QERLSuite, createQERLSuite } from './orchestrator';
export type { RLSuiteStats } from './orchestrator';

// ============================================================================
// Base Classes
// ============================================================================

export { BaseRLAlgorithm } from './base-algorithm';

// ============================================================================
// Algorithms
// ============================================================================

export {
  QLearningAlgorithm,
  DecisionTransformerAlgorithm,
  SARSAAlgorithm,
  ActorCriticAlgorithm,
  PolicyGradientAlgorithm,
  DQNAlgorithm,
  PPOAlgorithm,
  A2CAlgorithm,
  DDPGAlgorithm,
} from './algorithms';

// ============================================================================
// Interfaces
// ============================================================================

export type {
  // Core types
  RLAlgorithmType,
  RLAlgorithmCategory,
  QEDomainApplication,
  RLState,
  RLAction,
  RLExperience,
  RLPrediction,
  RLTrainingStats,
  RLTrainingConfig,
  RLAlgorithmInfo,

  // QE-specific types
  TestExecutionState,
  TestExecutionAction,
  CoverageAnalysisState,
  CoverageOptimizationAction,
  QualityGateState,
  QualityGateAction,
  ResourceAllocationState,
  ResourceAllocationAction,

  // Reward types
  RewardSignal,
  RewardContext,
  RewardCalculation,

  // Configuration types
  AlgorithmDomainMapping,
  RLSuiteConfig,

  // Constants
  ALGORITHM_DOMAIN_MAPPINGS,

  // Error types
  RLAlgorithmError,
  RLTrainingError,
  RLPredictionError,
  RLConfigError,
} from './interfaces';

// ============================================================================
// SONA (Self-Optimizing Neural Architecture)
// ============================================================================

export {
  SONA,
  SONAIndex,
  SONAOptimizer,
  SONAPatternCache,
  createSONA,
  createDomainSONA,
} from './sona';

export type {
  SONAPattern,
  SONAPatternType,
  SONAAdaptationResult,
  SONAStats,
  SONAConfig,
} from './sona';

// ============================================================================
// Reward Signals
// ============================================================================

export {
  TEST_EXECUTION_REWARDS,
  COVERAGE_REWARDS,
  DEFECT_PREDICTION_REWARDS,
  QUALITY_GATE_REWARDS,
  RESOURCE_ALLOCATION_REWARDS,
  calculateReward,
  getRewardSignalsForDomain,
  createTestExecutionRewardContext,
  createCoverageRewardContext,
  createDefectPredictionRewardContext,
  createResourceAllocationRewardContext,
  normalizeReward,
  clipReward,
  scaleReward,
} from './reward-signals';

// ============================================================================
// Constants
// ============================================================================

import { ALGORITHM_DOMAIN_MAPPINGS } from './interfaces';

/**
 * Algorithm-to-domain mappings per ADR-040
 */
export const QE_ALGORITHM_MAPPINGS = ALGORITHM_DOMAIN_MAPPINGS;

/**
 * All supported RL algorithms
 */
export const QE_RL_ALGORITHMS: RLAlgorithmType[] = [
  'decision-transformer',
  'q-learning',
  'sarsa',
  'actor-critic',
  'policy-gradient',
  'dqn',
  'ppo',
  'a2c',
  'ddpg',
] as const;

/**
 * QE domains supported by RL algorithms
 */
export const QE_RL_DOMAINS: DomainName[] = [
  'test-execution',
  'coverage-analysis',
  'defect-intelligence',
  'quality-assessment',
  'coordination',
] as const;

// ============================================================================
// Quick Start Factory
// ============================================================================

/**
 * Create a pre-configured RL suite for a specific domain
 */
export function createDomainRLSuite(domain: DomainName): QERLSuite {
  const { QERLSuite } = require('./orchestrator');

  // Get algorithms for this domain
  const mappings = ALGORITHM_DOMAIN_MAPPINGS.filter((m) => m.domains.includes(domain));
  const algorithms = mappings.map((m) => m.algorithm);

  return new QERLSuite({
    enabled: true,
    algorithms,
    domainMappings: mappings,
    trainingConfig: {
      learningRate: 0.001,
      discountFactor: 0.99,
      explorationRate: 0.3,
    },
  });
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if a type is a valid RL algorithm type
 */
export function isRLAlgorithmType(value: string): value is RLAlgorithmType {
  return QE_RL_ALGORITHMS.includes(value as RLAlgorithmType);
}

/**
 * Check if a domain is supported by RL algorithms
 */
export function isRLSupportedDomain(value: string): value is DomainName {
  return QE_RL_DOMAINS.includes(value as DomainName);
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Get recommended algorithm for a domain
 */
export function getRecommendedAlgorithm(domain: DomainName): RLAlgorithmType | undefined {
  const mapping = ALGORITHM_DOMAIN_MAPPINGS.find((m) => m.primaryDomain === domain);
  return mapping?.algorithm;
}

/**
 * Get all algorithms for a domain
 */
export function getAlgorithmsForDomain(domain: DomainName): RLAlgorithmType[] {
  return ALGORITHM_DOMAIN_MAPPINGS
    .filter((m) => m.domains.includes(domain))
    .map((m) => m.algorithm);
}

/**
 * Get domain for an algorithm
 */
export function getDomainForAlgorithm(algorithm: RLAlgorithmType): DomainName | undefined {
  const mapping = ALGORITHM_DOMAIN_MAPPINGS.find((m) => m.algorithm === algorithm);
  return mapping?.primaryDomain;
}
