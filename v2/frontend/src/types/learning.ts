/**
 * Learning Dashboard Types
 * Types for fleet-wide learning visualization
 */

/**
 * Learning algorithm types
 */
export type LearningAlgorithm = 'q-learning' | 'sarsa' | 'a2c' | 'ppo' | 'maml';

/**
 * Agent learning status
 */
export type AgentLearningStatus = 'idle' | 'training' | 'converged' | 'error';

/**
 * Per-agent learning metrics
 */
export interface AgentLearningMetrics {
  agentId: string;
  agentType: string;
  algorithm: LearningAlgorithm;
  status: AgentLearningStatus;
  metrics: {
    patternsLearned: number;
    totalExperiences: number;
    averageReward: number;
    convergenceRate: number; // 0.0 - 1.0
    explorationRate: number; // epsilon
    learningRate: number; // alpha
    qValueRange: { min: number; max: number; avg: number };
    lastUpdateTime: string;
  };
  performance: {
    successRate: number;
    averageExecutionTime: number;
    taskCount: number;
    improvementRate: number; // percentage from baseline
  };
}

/**
 * Fleet-wide learning overview
 */
export interface FleetLearningOverview {
  totalAgents: number;
  activeAgents: number;
  totalPatternsLearned: number;
  averageConvergence: number;
  totalExperiences: number;
  transferSuccessRate: number; // pattern sharing success
  lastUpdated: string;
}

/**
 * Pattern sharing event
 */
export interface PatternTransfer {
  id: string;
  fromAgent: string;
  toAgent: string;
  patternId: string;
  patternType: string;
  timestamp: string;
  success: boolean;
  confidence: number;
  improvementDelta: number; // performance change after transfer
}

/**
 * Learning curve data point
 */
export interface LearningCurvePoint {
  timestamp: string;
  episode: number;
  averageReward: number;
  cumulativeReward: number;
  explorationRate: number;
  loss?: number;
}

/**
 * Algorithm performance comparison
 */
export interface AlgorithmPerformance {
  algorithm: LearningAlgorithm;
  metrics: {
    convergenceSpeed: number; // episodes to convergence
    finalPerformance: number; // final average reward
    stability: number; // reward variance
    sampleEfficiency: number; // performance per sample
    totalAgents: number;
  };
  trends: {
    improving: number; // count of agents improving
    stable: number;
    degrading: number;
  };
}

/**
 * Q-value convergence data
 */
export interface QValueConvergence {
  stateAction: string;
  history: {
    timestamp: string;
    value: number;
    delta: number; // change from previous
  }[];
  converged: boolean;
  convergenceThreshold: number;
}

/**
 * Pattern sharing network node
 */
export interface PatternNetworkNode {
  id: string;
  agentId: string;
  agentType: string;
  patternsShared: number;
  patternsReceived: number;
  shareSuccessRate: number;
}

/**
 * Pattern sharing network edge
 */
export interface PatternNetworkEdge {
  id: string;
  source: string;
  target: string;
  transferCount: number;
  successRate: number;
  lastTransfer: string;
}

/**
 * Complete dashboard data
 */
export interface LearningDashboardData {
  overview: FleetLearningOverview;
  agents: AgentLearningMetrics[];
  recentTransfers: PatternTransfer[];
  algorithmComparison: AlgorithmPerformance[];
  convergenceData: {
    agentId: string;
    curves: LearningCurvePoint[];
  }[];
  patternNetwork: {
    nodes: PatternNetworkNode[];
    edges: PatternNetworkEdge[];
  };
}

/**
 * Dashboard filter options
 */
export interface DashboardFilters {
  algorithms?: LearningAlgorithm[];
  statuses?: AgentLearningStatus[];
  agentTypes?: string[];
  timeRange?: {
    start: string;
    end: string;
  };
}

/**
 * WebSocket update message for learning
 */
export interface LearningUpdateMessage {
  type: 'learning-update' | 'pattern-transfer' | 'convergence-achieved';
  data: AgentLearningMetrics | PatternTransfer | QValueConvergence;
  timestamp: string;
}
