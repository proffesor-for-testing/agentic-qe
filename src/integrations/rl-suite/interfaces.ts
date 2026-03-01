/**
 * Agentic QE v3 - RL Suite Interfaces
 *
 * Reinforcement Learning algorithms for Quality Engineering.
 * Per ADR-040, implements 9 RL algorithms for QE-specific applications.
 */

import type { DomainName, Priority, AgentType } from '../../shared/types';

// Re-export DomainName for convenience
export type { DomainName } from '../../shared/types';

// ============================================================================
// RL Algorithm Types
// ============================================================================

/**
 * All supported RL algorithms
 */
export type RLAlgorithmType =
  | 'decision-transformer'
  | 'q-learning'
  | 'sarsa'
  | 'actor-critic'
  | 'policy-gradient'
  | 'dqn'
  | 'ppo'
  | 'a2c'
  | 'ddpg';

/**
 * RL algorithm categories
 */
export type RLAlgorithmCategory =
  | 'value-based'      // Q-Learning, DQN, SARSA
  | 'policy-based'     // Policy Gradient, Actor-Critic
  | 'actor-critic'     // A2C, PPO
  | 'offline-rl'       // Decision Transformer
  | 'deterministic-policy'; // DDPG

/**
 * QE domain application for RL algorithms
 */
export interface QEDomainApplication {
  algorithm: RLAlgorithmType;
  domain: DomainName;
  application: string;
  description: string;
}

// ============================================================================
// Core RL Interfaces
// ============================================================================

/**
 * Generic state representation for RL
 */
export interface RLState {
  id: string;
  features: number[];
  metadata?: Record<string, unknown>;
  timestamp?: Date;
}

/**
 * Generic action representation for RL
 */
export interface RLAction {
  type: string;
  value: number | string | object;
  metadata?: Record<string, unknown>;
}

/**
 * Experience tuple for RL training
 */
export interface RLExperience {
  state: RLState;
  action: RLAction;
  reward: number;
  nextState: RLState;
  done: boolean;
  timestamp?: Date;
}

/**
 * RL training configuration
 */
export interface RLTrainingConfig {
  learningRate: number;
  discountFactor: number;
  episodes?: number;
  maxSteps?: number;
  batchSize?: number;
  replayBufferSize?: number;
  targetUpdateFrequency?: number;
  explorationRate?: number;
  explorationDecay?: number;
  minExplorationRate?: number;
}

/**
 * RL prediction result
 */
export interface RLPrediction {
  action: RLAction;
  confidence: number;
  value?: number;
  policy?: number[];
  reasoning?: string;
}

/**
 * RL training statistics
 */
export interface RLTrainingStats {
  episode: number;
  totalReward: number;
  averageReward: number;
  loss?: number;
  explorationRate?: number;
  trainingTimeMs: number;
  timestamp: Date;
}

// ============================================================================
// Base RL Algorithm Interface
// ============================================================================

/**
 * Base interface for all RL algorithms
 */
export interface RLAlgorithm {
  /** Algorithm type identifier */
  readonly type: RLAlgorithmType;

  /** Algorithm category */
  readonly category: RLAlgorithmCategory;

  /**
   * Select action for given state
   */
  predict(state: RLState): Promise<RLPrediction>;

  /**
   * Train algorithm with experience
   */
  train(experience: RLExperience): Promise<RLTrainingStats>;

  /**
   * Batch train with multiple experiences
   */
  trainBatch(experiences: RLExperience[]): Promise<RLTrainingStats>;

  /**
   * Update algorithm parameters
   */
  update(params: Partial<RLTrainingConfig>): Promise<void>;

  /**
   * Get current training statistics
   */
  getStats(): RLTrainingStats;

  /**
   * Reset algorithm state
   */
  reset(): Promise<void>;

  /**
   * Export trained model
   */
  exportModel(): Promise<Record<string, unknown>>;

  /**
   * Import trained model
   */
  importModel(model: Record<string, unknown>): Promise<void>;

  /**
   * Get algorithm info
   */
  getInfo(): RLAlgorithmInfo;
}

/**
 * RL algorithm metadata
 */
export interface RLAlgorithmInfo {
  type: RLAlgorithmType;
  category: RLAlgorithmCategory;
  version: string;
  description: string;
  capabilities: string[];
  hyperparameters: Record<string, number | string>;
  stats: RLTrainingStats;
}

// ============================================================================
// QE-Specific State and Action Types
// ============================================================================

/**
 * Test execution state for RL
 */
export interface TestExecutionState extends RLState {
  testId: string;
  testType: 'unit' | 'integration' | 'e2e' | 'performance' | 'security';
  priority: Priority;
  complexity: number;
  domain: DomainName;
  dependencies: string[];
  estimatedDuration: number;
  coverage: number;
  failureHistory: number[];
}

/**
 * Test execution action for RL
 */
export interface TestExecutionAction extends RLAction {
  type: 'assign-agent' | 'prioritize' | 'skip' | 'parallelize';
  agentType?: AgentType;
  domain?: DomainName;
  priority?: Priority;
  parallelization?: number;
}

/**
 * Coverage analysis state for RL
 */
export interface CoverageAnalysisState extends RLState {
  filePath: string;
  currentCoverage: number;
  targetCoverage: number;
  complexity: number;
  changeFrequency: number;
  businessCriticality: number;
  uncoveredLines: number[];
  branchPoints: number;
}

/**
 * Coverage optimization action for RL
 */
export interface CoverageOptimizationAction extends RLAction {
  type: 'generate-unit' | 'generate-integration' | 'prioritize' | 'skip';
  testType?: 'unit' | 'integration' | 'e2e';
  targetFunction?: string;
  targetBranch?: number;
}

/**
 * Quality gate state for RL
 */
export interface QualityGateState extends RLState {
  metricName: string;
  currentValue: number;
  threshold: number;
  trend: 'improving' | 'stable' | 'degrading';
  variance: number;
  sampleSize: number;
  confidence: number;
}

/**
 * Quality gate action for RL
 */
export interface QualityGateAction extends RLAction {
  type: 'adjust-threshold' | 'approve' | 'reject' | 'request-review';
  newThreshold?: number;
  justification?: string;
}

/**
 * Resource allocation state for RL
 */
export interface ResourceAllocationState extends RLState {
  domain: DomainName;
  pendingTasks: number;
  availableAgents: number;
  currentLoad: number;
  avgTaskDuration: number;
  priorityDistribution: Record<string, number>;
  slaDeadlines: number;
}

/**
 * Resource allocation action for RL
 */
export interface ResourceAllocationAction extends RLAction {
  type: 'allocate' | 'reallocate' | 'scale-up' | 'scale-down';
  agentType?: AgentType;
  domain?: DomainName;
  count?: number;
}

// ============================================================================
// Reward Signals
// ============================================================================

/**
 * Reward signal configuration for QE
 */
export interface RewardSignal {
  name: string;
  weight: number;
  calculate: (context: RewardContext) => number;
  description: string;
}

/**
 * Context for reward calculation
 */
export interface RewardContext {
  action: RLAction;
  result: {
    success: boolean;
    durationMs: number;
    quality: number;
    errors?: number;
    coverage?: number;
    efficiency?: number;
  };
  state: RLState;
  metadata?: Record<string, unknown>;
}

/**
 * Composite reward calculation
 */
export interface RewardCalculation {
  totalReward: number;
  components: Record<string, number>;
  reasoning: string;
  timestamp: Date;
}

// ============================================================================
// RL Suite Configuration
// ============================================================================

/**
 * Algorithm-to-domain mapping
 */
export interface AlgorithmDomainMapping {
  algorithm: RLAlgorithmType;
  domains: DomainName[];
  primaryDomain: DomainName;
  application: string;
  stateType: string;
  actionType: string;
}

/**
 * RL Suite configuration
 */
export interface RLSuiteConfig {
  enabled: boolean;
  algorithms: RLAlgorithmType[];
  rewardSignals: RewardSignal[];
  domainMappings: AlgorithmDomainMapping[];
  trainingConfig: Partial<RLTrainingConfig>;
  modelPersistenceEnabled: boolean;
  modelPath?: string;
  autoTrainingEnabled: boolean;
  trainingInterval?: number;
  fallbackEnabled: boolean;
}

// ============================================================================
// QE Reward Signal Presets
// ============================================================================

/**
 * Test execution reward signals
 */
export const TEST_EXECUTION_REWARDS: RewardSignal[] = [
  {
    name: 'success',
    weight: 0.5,
    calculate: (ctx) => ctx.result.success ? 0.5 : -0.3,
    description: 'Reward successful test execution'
  },
  {
    name: 'speed',
    weight: 0.2,
    calculate: (ctx) => {
      const speedScore = Math.max(0, 1 - ctx.result.durationMs / 60000);
      return speedScore * 0.2;
    },
    description: 'Reward fast execution'
  },
  {
    name: 'quality',
    weight: 0.3,
    calculate: (ctx) => ctx.result.quality * 0.3,
    description: 'Reward high-quality results'
  }
];

/**
 * Coverage optimization reward signals
 */
export const COVERAGE_REWARDS: RewardSignal[] = [
  {
    name: 'coverage-gain',
    weight: 0.6,
    calculate: (ctx) => {
      const gain = (ctx.result.coverage || 0) * 0.6;
      return gain;
    },
    description: 'Reward coverage improvement'
  },
  {
    name: 'efficiency',
    weight: 0.4,
    calculate: (ctx) => {
      const efficiencyScore = (ctx.result.efficiency || 0) * 0.4;
      return efficiencyScore;
    },
    description: 'Reward efficient test generation'
  }
];

/**
 * Quality gate reward signals
 */
export const QUALITY_GATE_REWARDS: RewardSignal[] = [
  {
    name: 'accuracy',
    weight: 0.5,
    calculate: (ctx) => ctx.result.success ? 0.5 : -0.4,
    description: 'Reward accurate gate decisions'
  },
  {
    name: 'confidence',
    weight: 0.3,
    calculate: (ctx) => ctx.result.quality * 0.3,
    description: 'Reward high-confidence decisions'
  },
  {
    name: 'efficiency',
    weight: 0.2,
    calculate: (ctx) => {
      const efficiencyScore = Math.max(0, 1 - ctx.result.durationMs / 30000);
      return efficiencyScore * 0.2;
    },
    description: 'Reward quick decisions'
  }
];

// ============================================================================
// Algorithm Domain Mappings (per ADR-040)
// ============================================================================

export const ALGORITHM_DOMAIN_MAPPINGS: AlgorithmDomainMapping[] = [
  {
    algorithm: 'decision-transformer',
    domains: ['test-execution'],
    primaryDomain: 'test-execution',
    application: 'Test case prioritization',
    stateType: 'TestExecutionState',
    actionType: 'TestExecutionAction'
  },
  {
    algorithm: 'q-learning',
    domains: ['coverage-analysis'],
    primaryDomain: 'coverage-analysis',
    application: 'Coverage path optimization',
    stateType: 'CoverageAnalysisState',
    actionType: 'CoverageOptimizationAction'
  },
  {
    algorithm: 'sarsa',
    domains: ['defect-intelligence'],
    primaryDomain: 'defect-intelligence',
    application: 'Defect prediction sequencing',
    stateType: 'DefectPredictionState',
    actionType: 'DefectPredictionAction'
  },
  {
    algorithm: 'actor-critic',
    domains: ['quality-assessment'],
    primaryDomain: 'quality-assessment',
    application: 'Quality gate threshold tuning',
    stateType: 'QualityGateState',
    actionType: 'QualityGateAction'
  },
  {
    algorithm: 'policy-gradient',
    domains: ['coordination'],
    primaryDomain: 'coordination',
    application: 'Resource allocation',
    stateType: 'ResourceAllocationState',
    actionType: 'ResourceAllocationAction'
  },
  {
    algorithm: 'dqn',
    domains: ['test-execution'],
    primaryDomain: 'test-execution',
    application: 'Parallel execution scheduling',
    stateType: 'TestExecutionState',
    actionType: 'TestExecutionAction'
  },
  {
    algorithm: 'ppo',
    domains: ['test-execution'],
    primaryDomain: 'test-execution',
    application: 'Adaptive retry strategies',
    stateType: 'TestExecutionState',
    actionType: 'TestExecutionAction'
  },
  {
    algorithm: 'a2c',
    domains: ['coordination'],
    primaryDomain: 'coordination',
    application: 'Fleet coordination',
    stateType: 'ResourceAllocationState',
    actionType: 'ResourceAllocationAction'
  },
  {
    algorithm: 'ddpg',
    domains: ['coordination'],
    primaryDomain: 'coordination',
    application: 'Continuous resource control',
    stateType: 'ResourceAllocationState',
    actionType: 'ResourceAllocationAction'
  }
];

// ============================================================================
// Error Types
// ============================================================================

export class RLAlgorithmError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly algorithm?: RLAlgorithmType,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'RLAlgorithmError';
  }
}

export class RLTrainingError extends RLAlgorithmError {
  constructor(message: string, algorithm?: RLAlgorithmType, cause?: Error) {
    super(message, 'RL_TRAINING_ERROR', algorithm, cause);
    this.name = 'RLTrainingError';
  }
}

export class RLPredictionError extends RLAlgorithmError {
  constructor(message: string, algorithm?: RLAlgorithmType, cause?: Error) {
    super(message, 'RL_PREDICTION_ERROR', algorithm, cause);
    this.name = 'RLPredictionError';
  }
}

export class RLConfigError extends RLAlgorithmError {
  constructor(message: string, algorithm?: RLAlgorithmType) {
    super(message, 'RL_CONFIG_ERROR', algorithm);
    this.name = 'RLConfigError';
  }
}
