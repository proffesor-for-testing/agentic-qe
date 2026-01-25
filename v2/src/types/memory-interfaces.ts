/**
 * Memory interfaces for type-safe memory store implementations
 *
 * Issue #65: Updated to reflect synchronous better-sqlite3 API.
 * All methods except initialize() and store/retrieve (which have auto-init) are now synchronous.
 *
 * These interfaces define the contract for memory stores used across the system.
 * They enable adapter patterns and dependency injection for better testability.
 */

import {
  StoreOptions,
  RetrieveOptions,
  DeleteOptions,
  MemoryEntry,
  Hint,
  Event,
  WorkflowState,
  Pattern,
  ConsensusProposal,
  PerformanceMetric,
  Artifact,
  Session,
  Checkpoint,
  AgentRegistration,
  GOAPGoal,
  GOAPAction,
  GOAPPlan,
  OODACycle,
  OODAResult,
  AgentPerformanceData,
  LearningMetrics,
  OODAPhaseData
} from '../core/memory/SwarmMemoryManager';

// Re-export types from SwarmMemoryManager for convenience
export type { AgentPerformanceData, LearningMetrics, OODAPhaseData, OODAResult };

/** Access Control List entry for memory resources */
export interface ACLEntry {
  resourceId: string;
  ownerId: string;
  accessLevel: 'read' | 'write' | 'admin';
  grantedPermissions?: Record<string, string[]>;
  blockedAgents?: string[];
  createdAt?: number;
  updatedAt?: number;
}

/**
 * Base memory operations interface
 * Minimal interface required for verification hooks
 *
 * NOTE: initialize(), store(), and retrieve() remain async for auto-initialization.
 * All other operations are synchronous (better-sqlite3 is intentionally sync).
 */
export interface IMemoryStore {
  initialize(): Promise<void>;
  store(key: string, value: unknown, options?: StoreOptions): Promise<void>;
  retrieve(key: string, options?: RetrieveOptions): Promise<unknown>;
  query(pattern: string, options?: RetrieveOptions): MemoryEntry[];
  delete(key: string, partition?: string, options?: DeleteOptions): void;
  clear(partition?: string): void;
  postHint(hint: { key: string; value: unknown; ttl?: number }): void;
  readHints(pattern: string): Hint[];
  cleanExpired(): number;
  close(): void;
}

/**
 * Extended memory operations interface
 * Includes specialized table operations
 *
 * Issue #65: All methods are now synchronous except initialize() and store/retrieve.
 */
export interface ISwarmMemoryManager extends IMemoryStore {
  stats(): {
    totalEntries: number;
    totalHints: number;
    totalEvents: number;
    totalWorkflows: number;
    totalPatterns: number;
    totalConsensus: number;
    totalMetrics: number;
    totalArtifacts: number;
    totalSessions: number;
    totalAgents: number;
    totalGOAPGoals: number;
    totalGOAPActions: number;
    totalGOAPPlans: number;
    totalOODACycles: number;
    partitions: string[];
    accessLevels: Record<string, number>;
  };

  // Event operations
  storeEvent(event: Event): string;
  queryEvents(type: string): Event[];
  getEventsBySource(source: string): Event[];

  // Workflow operations
  storeWorkflowState(workflow: WorkflowState): void;
  getWorkflowState(id: string): WorkflowState;
  updateWorkflowState(id: string, updates: Partial<WorkflowState>): void;
  queryWorkflowsByStatus(status: string): WorkflowState[];

  // Pattern operations
  storePattern(pattern: Pattern): string;
  getPattern(patternName: string): Pattern;
  incrementPatternUsage(patternName: string): void;
  queryPatternsByConfidence(threshold: number): Pattern[];

  // Consensus operations
  createConsensusProposal(proposal: ConsensusProposal): void;
  getConsensusProposal(id: string): ConsensusProposal;
  voteOnConsensus(proposalId: string, agentId: string): boolean;
  queryConsensusProposals(status: string): ConsensusProposal[];

  // Performance metrics
  storePerformanceMetric(metric: PerformanceMetric): string;
  queryPerformanceMetrics(metricName: string): PerformanceMetric[];
  getMetricsByAgent(agentId: string): PerformanceMetric[];
  getAverageMetric(metricName: string): number;

  // Artifact operations
  createArtifact(artifact: Artifact): void;
  getArtifact(id: string): Artifact;
  queryArtifactsByKind(kind: string): Artifact[];
  queryArtifactsByTag(tag: string): Artifact[];

  // Session operations
  createSession(session: Session): void;
  getSession(id: string): Session;
  addSessionCheckpoint(sessionId: string, checkpoint: Checkpoint): void;
  getLatestCheckpoint(sessionId: string): Checkpoint | undefined;
  markSessionResumed(sessionId: string): void;

  // Agent registry
  registerAgent(agent: AgentRegistration): void;
  getAgent(id: string): AgentRegistration;
  updateAgentStatus(agentId: string, status: 'active' | 'idle' | 'terminated'): void;
  queryAgentsByStatus(status: string): AgentRegistration[];
  updateAgentPerformance(agentId: string, performance: AgentPerformanceData): void;

  // GOAP operations
  storeGOAPGoal(goal: GOAPGoal): void;
  getGOAPGoal(id: string): GOAPGoal;
  storeGOAPAction(action: GOAPAction): void;
  getGOAPAction(id: string): GOAPAction;
  storeGOAPPlan(plan: GOAPPlan): void;
  getGOAPPlan(id: string): GOAPPlan;

  // OODA operations
  storeOODACycle(cycle: OODACycle): void;
  getOODACycle(id: string): OODACycle;
  updateOODAPhase(cycleId: string, phase: OODACycle['phase'], data: OODAPhaseData): void;
  completeOODACycle(cycleId: string, result: OODAResult): void;
  queryOODACyclesByPhase(phase: string): OODACycle[];

  // ACL operations
  storeACL(acl: ACLEntry): void;
  getACL(resourceId: string): ACLEntry | null;
  updateACL(resourceId: string, updates: Partial<ACLEntry>): void;
  grantPermission(resourceId: string, agentId: string, permissions: string[]): void;
  revokePermission(resourceId: string, agentId: string, permissions: string[]): void;
  blockAgent(resourceId: string, agentId: string): void;
  unblockAgent(resourceId: string, agentId: string): void;
  getAccessControl(): ACLEntry | null;

  // Learning operations (Q-learning and experience storage)
  /**
   * Store a learning experience for Q-learning
   * @param experience The learning experience containing state, action, reward, and next state
   */
  storeLearningExperience(experience: {
    agentId: string;
    taskId?: string;
    taskType: string;
    state: string;
    action: string;
    reward: number;
    nextState: string;
    episodeId?: string;
  }): void;

  /**
   * Upsert a Q-value for a state-action pair
   * @param agentId The agent ID
   * @param stateKey The state key
   * @param actionKey The action key
   * @param qValue The Q-value
   */
  upsertQValue(
    agentId: string,
    stateKey: string,
    actionKey: string,
    qValue: number
  ): void;

  /**
   * Get all Q-values for an agent
   * @param agentId The agent ID
   * @returns Array of Q-values with state/action keys
   */
  getAllQValues(agentId: string): Array<{
    state_key: string;
    action_key: string;
    q_value: number;
    update_count: number;
  }>;

  /**
   * Get Q-value for a specific state-action pair
   * @param agentId The agent ID
   * @param stateKey The state key
   * @param actionKey The action key
   * @returns The Q-value or null if not found
   */
  getQValue(agentId: string, stateKey: string, actionKey: string): number | null;

  /**
   * Store a learning performance snapshot
   * @param snapshot The learning snapshot containing metrics and performance data
   */
  storeLearningSnapshot(snapshot: {
    agentId: string;
    snapshotType: 'performance' | 'q_table' | 'pattern';
    metrics: LearningMetrics;
    improvementRate?: number;
    totalExperiences?: number;
    explorationRate?: number;
  }): void;

  /**
   * Get learning history for an agent
   * @param agentId The agent ID
   * @param limit Maximum number of records to return
   * @returns Array of learning history records
   */
  getLearningHistory(agentId: string, limit?: number): Array<{
    id: number;
    agent_id: string;
    pattern_id?: string;
    state_representation: string;
    action: string;
    reward: number;
    next_state_representation?: string;
    q_value?: number;
    episode?: number;
    timestamp: string;
  }>;
}
