/**
 * Agentic QE v3 - QE-Specific Reward Signals
 *
 * Domain-specific reward functions for RL algorithms in QE.
 * Per ADR-040, implements reward signals for all 9 algorithms.
 */

import type {
  RewardSignal,
  RewardContext,
  RewardCalculation,
  DomainName,
} from './interfaces';

// ============================================================================
// Test Execution Rewards (for Decision Transformer, DQN, PPO)
// ============================================================================

/**
 * Reward signals for test execution tasks
 */
export const TEST_EXECUTION_REWARDS: RewardSignal[] = [
  {
    name: 'success',
    weight: 0.5,
    calculate: (ctx) => {
      return ctx.result.success ? 0.5 : -0.4;
    },
    description: 'Reward successful test execution',
  },
  {
    name: 'speed',
    weight: 0.2,
    calculate: (ctx) => {
      // Faster execution = higher reward (normalized to 60s max)
      const speedScore = Math.max(0, 1 - ctx.result.durationMs / 60000);
      return speedScore * 0.2;
    },
    description: 'Reward fast execution',
  },
  {
    name: 'quality',
    weight: 0.2,
    calculate: (ctx) => {
      return ctx.result.quality * 0.2;
    },
    description: 'Reward high-quality results',
  },
  {
    name: 'early-failure-detection',
    weight: 0.1,
    calculate: (ctx) => {
      // Bonus for catching defects early
      if (!ctx.result.success && ctx.result.durationMs < 5000) {
        return 0.1;
      }
      return 0;
    },
    description: 'Reward early failure detection',
  },
];

// ============================================================================
// Coverage Optimization Rewards (for Q-Learning)
// ============================================================================

/**
 * Reward signals for coverage optimization tasks
 */
export const COVERAGE_REWARDS: RewardSignal[] = [
  {
    name: 'coverage-gain',
    weight: 0.5,
    calculate: (ctx) => {
      const coverage = ctx.result.coverage || 0;
      return coverage * 0.5;
    },
    description: 'Reward coverage improvement',
  },
  {
    name: 'critical-path-coverage',
    weight: 0.3,
    calculate: (ctx) => {
      // Bonus for covering business-critical code
      const isCritical = ctx.metadata?.criticalPath === true;
      if (isCritical && (ctx.result.coverage || 0) > 0.1) {
        return 0.3;
      }
      return 0;
    },
    description: 'Reward critical path coverage',
  },
  {
    name: 'efficiency',
    weight: 0.2,
    calculate: (ctx) => {
      const efficiency = ctx.result.efficiency || 0;
      return efficiency * 0.2;
    },
    description: 'Reward efficient test generation',
  },
];

// ============================================================================
// Defect Prediction Rewards (for SARSA)
// ============================================================================

/**
 * Reward signals for defect prediction tasks
 */
export const DEFECT_PREDICTION_REWARDS: RewardSignal[] = [
  {
    name: 'prediction-accuracy',
    weight: 0.6,
    calculate: (ctx) => {
      if (ctx.result.success) {
        return 0.6;
      }
      return -0.3;
    },
    description: 'Reward accurate defect predictions',
  },
  {
    name: 'early-prediction',
    weight: 0.2,
    calculate: (ctx) => {
      // Bonus for predicting defects before they occur
      if (ctx.metadata?.predictedEarly === true && ctx.result.success) {
        return 0.2;
      }
      return 0;
    },
    description: 'Reward early defect prediction',
  },
  {
    name: 'false-negative-penalty',
    weight: 0.2,
    calculate: (ctx) => {
      // Penalty for missing real defects
      if (ctx.metadata?.wasDefect === true && !ctx.result.success) {
        return -0.2;
      }
      return 0;
    },
    description: 'Penalty for missing real defects',
  },
];

// ============================================================================
// Quality Gate Rewards (for Actor-Critic)
// ============================================================================

/**
 * Reward signals for quality gate decisions
 */
export const QUALITY_GATE_REWARDS: RewardSignal[] = [
  {
    name: 'decision-accuracy',
    weight: 0.5,
    calculate: (ctx) => {
      if (ctx.result.success) {
        return 0.5;
      }
      return -0.4;
    },
    description: 'Reward accurate gate decisions',
  },
  {
    name: 'confidence',
    weight: 0.3,
    calculate: (ctx) => {
      return ctx.result.quality * 0.3;
    },
    description: 'Reward high-confidence decisions',
  },
  {
    name: 'decision-speed',
    weight: 0.2,
    calculate: (ctx) => {
      const speedScore = Math.max(0, 1 - ctx.result.durationMs / 30000);
      return speedScore * 0.2;
    },
    description: 'Reward quick decisions',
  },
];

// ============================================================================
// Resource Allocation Rewards (for Policy Gradient, A2C, DDPG)
// ============================================================================

/**
 * Reward signals for resource allocation tasks
 */
export const RESOURCE_ALLOCATION_REWARDS: RewardSignal[] = [
  {
    name: 'task-completion',
    weight: 0.5,
    calculate: (ctx) => {
      return ctx.result.success ? 0.5 : -0.3;
    },
    description: 'Reward successful task completion',
  },
  {
    name: 'resource-efficiency',
    weight: 0.3,
    calculate: (ctx) => {
      // Reward using minimal resources while maintaining success
      const efficiency = ctx.result.efficiency || 0;
      return efficiency * 0.3;
    },
    description: 'Reward efficient resource usage',
  },
  {
    name: 'load-balance',
    weight: 0.2,
    calculate: (ctx) => {
      // Reward balanced load across agents
      const loadBalance = (ctx.metadata?.loadBalance as number) || 0;
      return loadBalance * 0.2;
    },
    description: 'Reward balanced agent load',
  },
];

// ============================================================================
// Composite Reward Calculator
// ============================================================================

/**
 * Calculate composite reward from multiple signals
 */
export function calculateReward(
  rewardSignals: RewardSignal[],
  context: RewardContext
): RewardCalculation {
  const components: Record<string, number> = {};
  let totalReward = 0;
  const reasoning: string[] = [];

  for (const signal of rewardSignals) {
    const value = signal.calculate(context);
    components[signal.name] = value;
    totalReward += value;

    if (value !== 0) {
      const sign = value > 0 ? '+' : '';
      reasoning.push(`${signal.name}: ${sign}${value.toFixed(3)} (${signal.description})`);
    }
  }

  return {
    totalReward: Math.max(-1, Math.min(1, totalReward)),
    components,
    reasoning: reasoning.join('; ') || 'No reward signals triggered',
    timestamp: new Date(),
  };
}

// ============================================================================
// Domain-Specific Reward Mappings
// ============================================================================

/**
 * Get reward signals for a specific domain
 */
export function getRewardSignalsForDomain(domain: DomainName): RewardSignal[] {
  switch (domain) {
    case 'test-execution':
      return TEST_EXECUTION_REWARDS;

    case 'coverage-analysis':
      return COVERAGE_REWARDS;

    case 'defect-intelligence':
      return DEFECT_PREDICTION_REWARDS;

    case 'quality-assessment':
      return QUALITY_GATE_REWARDS;

    case 'coordination':
      return RESOURCE_ALLOCATION_REWARDS;

    default:
      return TEST_EXECUTION_REWARDS;
  }
}

// ============================================================================
// Default Reward Contexts
// ============================================================================

/**
 * Create a reward context from test execution result
 */
export function createTestExecutionRewardContext(
  action: unknown,
  result: { success: boolean; durationMs: number; quality: number },
  state: unknown
): RewardContext {
  return {
    action: action as never,
    result,
    state: state as never,
    metadata: undefined,
  };
}

/**
 * Create a reward context from coverage result
 */
export function createCoverageRewardContext(
  action: unknown,
  result: { coverage: number; efficiency: number },
  state: unknown,
  metadata?: { criticalPath?: boolean }
): RewardContext {
  return {
    action: action as never,
    result: {
      success: (result.coverage || 0) > 0,
      durationMs: 0,
      quality: result.coverage || 0,
      coverage: result.coverage,
      efficiency: result.efficiency,
    },
    state: state as never,
    metadata,
  };
}

/**
 * Create a reward context from defect prediction result
 */
export function createDefectPredictionRewardContext(
  action: unknown,
  result: { success: boolean; quality: number },
  state: unknown,
  metadata?: { predictedEarly?: boolean; wasDefect?: boolean }
): RewardContext {
  return {
    action: action as never,
    result: {
      success: result.success,
      durationMs: 0,
      quality: result.quality,
    },
    state: state as never,
    metadata,
  };
}

/**
 * Create a reward context from resource allocation result
 */
export function createResourceAllocationRewardContext(
  action: unknown,
  result: { success: boolean; durationMs: number; efficiency: number },
  state: unknown,
  metadata?: { loadBalance?: number }
): RewardContext {
  return {
    action: action as never,
    result: {
      success: result.success,
      durationMs: result.durationMs,
      quality: result.efficiency,
      efficiency: result.efficiency,
    },
    state: state as never,
    metadata,
  };
}

// ============================================================================
// Reward Normalization Utilities
// ============================================================================

/**
 * Normalize reward to [-1, 1] range
 */
export function normalizeReward(reward: number): number {
  return Math.max(-1, Math.min(1, reward));
}

/**
 * Clip reward to prevent extreme values
 */
export function clipReward(reward: number, min = -1, max = 1): number {
  return Math.max(min, Math.min(max, reward));
}

/**
 * Apply reward scaling for training stability
 */
export function scaleReward(reward: number, scale = 1.0): number {
  return reward * scale;
}
