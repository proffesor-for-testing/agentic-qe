/**
 * Voting system type definitions for Phase 2 GOAP implementation
 * Supports parallel agent voting with timeout handling and consensus
 */

export interface VotingAgent {
  id: string;
  type: AgentType;
  expertise: string[];
  weight: number;
  maxConcurrency?: number;
}

export type AgentType =
  | 'test-generator'
  | 'coverage-analyzer'
  | 'quality-gate'
  | 'performance-tester'
  | 'security-scanner'
  | 'flaky-detector'
  | 'mutation-tester'
  | 'visual-tester'
  | 'api-tester'
  | 'requirements-validator'
  | 'data-generator'
  | 'regression-analyzer';

export interface VotingTask {
  id: string;
  type: string;
  description: string;
  context: Record<string, unknown>;
  priority: 'low' | 'medium' | 'high' | 'critical';
  deadline?: Date;
  requiredExpertise?: string[];
}

export interface Vote {
  agentId: string;
  taskId: string;
  score: number; // 0-1 scale
  confidence: number; // 0-1 scale
  reasoning: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface VotingResult {
  taskId: string;
  consensusReached: boolean;
  finalScore: number;
  votes: Vote[];
  aggregationMethod: ConsensusMethod;
  executionTime: number;
  participationRate: number;
  metadata: {
    totalAgents: number;
    votingAgents: number;
    timedOut: number;
    failed: number;
    averageConfidence: number;
  };
}

export type ConsensusMethod =
  | 'majority'
  | 'weighted-average'
  | 'unanimous'
  | 'quorum'
  | 'byzantine-fault-tolerant';

export interface VotingPanelConfig {
  minPanelSize: number;
  maxPanelSize: number;
  requiredExpertise?: string[];
  consensusMethod: ConsensusMethod;
  quorumThreshold?: number; // 0-1 scale
  timeoutMs: number;
  maxRetries: number;
  retryDelayMs: number;
  parallelExecution: boolean;
}

export interface PanelAssemblyResult {
  panel: VotingAgent[];
  assemblyTime: number;
  selectionCriteria: string[];
  coverage: {
    expertise: string[];
    types: AgentType[];
    totalWeight: number;
  };
}

export interface OrchestrationLog {
  taskId: string;
  timestamp: Date;
  event: OrchestrationEvent;
  details: Record<string, unknown>;
  agentId?: string;
}

export type OrchestrationEvent =
  | 'panel-assembled'
  | 'voting-started'
  | 'vote-received'
  | 'vote-timeout'
  | 'vote-retry'
  | 'vote-failed'
  | 'consensus-reached'
  | 'consensus-failed'
  | 'result-aggregated'
  | 'orchestration-complete';

export interface OrchestrationMetrics {
  totalTasks: number;
  successfulVotes: number;
  failedVotes: number;
  timeoutVotes: number;
  averageExecutionTime: number;
  consensusRate: number;
  participationRate: number;
  retryRate: number;
}

export interface VotingOrchestrator {
  assemblePanel(config: VotingPanelConfig): Promise<PanelAssemblyResult>;
  distributeTask(task: VotingTask, panel: VotingAgent[]): Promise<void>;
  collectVotes(taskId: string, timeoutMs: number): Promise<Vote[]>;
  aggregateResults(votes: Vote[], method: ConsensusMethod): VotingResult;
  handleTimeout(agentId: string, taskId: string): Promise<void>;
  handleFailure(agentId: string, taskId: string, error: Error): Promise<void>;
  retry(agentId: string, taskId: string, attempt: number): Promise<Vote | null>;
  getMetrics(): OrchestrationMetrics;
  getLogs(taskId?: string): OrchestrationLog[];
}

export interface AgentPool {
  available: VotingAgent[];
  busy: Map<string, VotingTask>;
  failed: Set<string>;
  getAvailable(expertise?: string[]): VotingAgent[];
  reserve(agentId: string, task: VotingTask): void;
  release(agentId: string): void;
  markFailed(agentId: string): void;
  restore(agentId: string): void;
}

export interface VotingStrategy {
  selectAgents(
    pool: AgentPool,
    task: VotingTask,
    config: VotingPanelConfig
  ): VotingAgent[];

  calculateWeight(agent: VotingAgent, task: VotingTask): number;

  shouldRetry(
    agent: VotingAgent,
    task: VotingTask,
    attempt: number,
    error?: Error
  ): boolean;

  adjustTimeout(
    baseTimeout: number,
    attempt: number,
    agentLoad: number
  ): number;
}

export interface ConsensusAlgorithm {
  method: ConsensusMethod;

  calculate(votes: Vote[], config: VotingPanelConfig): {
    consensusReached: boolean;
    finalScore: number;
    confidence: number;
  };

  validateQuorum(votes: Vote[], totalAgents: number, threshold: number): boolean;

  detectOutliers(votes: Vote[]): Vote[];

  handleTies(votes: Vote[]): Vote[];
}
