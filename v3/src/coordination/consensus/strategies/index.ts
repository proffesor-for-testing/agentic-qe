/**
 * Agentic QE v3 - Consensus Strategies
 * Exports all consensus strategy implementations
 *
 * @see docs/plans/AQE_V3_IMPROVEMENTS_PLAN.md - Phase 2: Multi-Model Verification
 */

import {
  MajorityStrategy as MajorityStrategyClass,
  createMajorityStrategy as createMajorityStrategyFn,
  type MajorityStrategyConfig,
  type ConsensusStrategyResult,
} from './majority-strategy';

import {
  WeightedStrategy as WeightedStrategyClass,
  createWeightedStrategy as createWeightedStrategyFn,
  type WeightedStrategyConfig,
} from './weighted-strategy';

import {
  UnanimousStrategy as UnanimousStrategyClass,
  createUnanimousStrategy as createUnanimousStrategyFn,
  type UnanimousStrategyConfig,
} from './unanimous-strategy';

// Re-export classes and functions
export {
  MajorityStrategyClass as MajorityStrategy,
  createMajorityStrategyFn as createMajorityStrategy,
  type MajorityStrategyConfig,
  type ConsensusStrategyResult,
};

export {
  WeightedStrategyClass as WeightedStrategy,
  createWeightedStrategyFn as createWeightedStrategy,
  type WeightedStrategyConfig,
};

export {
  UnanimousStrategyClass as UnanimousStrategy,
  createUnanimousStrategyFn as createUnanimousStrategy,
  type UnanimousStrategyConfig,
};

/**
 * Strategy type enum for configuration
 */
export type ConsensusStrategyType = 'majority' | 'weighted' | 'unanimous';

/**
 * Union type of all strategy configurations
 */
export type AnyStrategyConfig =
  | MajorityStrategyConfig
  | WeightedStrategyConfig
  | UnanimousStrategyConfig;

/**
 * Strategy factory configuration
 */
export interface StrategyFactoryConfig {
  type: ConsensusStrategyType;
  config?: AnyStrategyConfig;
}

/**
 * Create a consensus strategy based on type
 *
 * @param type - Strategy type
 * @param config - Optional strategy configuration
 * @returns Strategy instance
 *
 * @example
 * ```typescript
 * const strategy = createStrategy('weighted', { agreementThreshold: 0.7 });
 * const result = strategy.apply(votes);
 * ```
 */
export function createStrategy(
  type: ConsensusStrategyType,
  config?: AnyStrategyConfig
): MajorityStrategyClass | WeightedStrategyClass | UnanimousStrategyClass {
  switch (type) {
    case 'majority':
      return createMajorityStrategyFn(config as MajorityStrategyConfig);
    case 'weighted':
      return createWeightedStrategyFn(config as WeightedStrategyConfig);
    case 'unanimous':
      return createUnanimousStrategyFn(config as UnanimousStrategyConfig);
    default:
      throw new Error(`Unknown consensus strategy type: ${type}`);
  }
}
