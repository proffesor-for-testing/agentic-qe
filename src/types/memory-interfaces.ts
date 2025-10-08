/**
 * Memory interfaces for type-safe memory store implementations
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
  OODACycle
} from '../core/memory/SwarmMemoryManager';

/**
 * Base memory operations interface
 * Minimal interface required for verification hooks
 */
export interface IMemoryStore {
  initialize(): Promise<void>;
  store(key: string, value: any, options?: StoreOptions): Promise<void>;
  retrieve(key: string, options?: RetrieveOptions): Promise<any>;
  query(pattern: string, options?: RetrieveOptions): Promise<MemoryEntry[]>;
  delete(key: string, partition?: string, options?: DeleteOptions): Promise<void>;
  clear(partition?: string): Promise<void>;
  postHint(hint: { key: string; value: any; ttl?: number }): Promise<void>;
  readHints(pattern: string): Promise<Hint[]>;
  cleanExpired(): Promise<number>;
  close(): Promise<void>;
}

/**
 * Extended memory operations interface
 * Includes specialized table operations
 */
export interface ISwarmMemoryManager extends IMemoryStore {
  stats(): Promise<{
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
  }>;

  // Event operations
  storeEvent(event: Event): Promise<string>;
  queryEvents(type: string): Promise<Event[]>;
  getEventsBySource(source: string): Promise<Event[]>;

  // Workflow operations
  storeWorkflowState(workflow: WorkflowState): Promise<void>;
  getWorkflowState(id: string): Promise<WorkflowState>;
  updateWorkflowState(id: string, updates: Partial<WorkflowState>): Promise<void>;
  queryWorkflowsByStatus(status: string): Promise<WorkflowState[]>;

  // Pattern operations
  storePattern(pattern: Pattern): Promise<string>;
  getPattern(patternName: string): Promise<Pattern>;
  incrementPatternUsage(patternName: string): Promise<void>;
  queryPatternsByConfidence(threshold: number): Promise<Pattern[]>;

  // Consensus operations
  createConsensusProposal(proposal: ConsensusProposal): Promise<void>;
  getConsensusProposal(id: string): Promise<ConsensusProposal>;
  voteOnConsensus(proposalId: string, agentId: string): Promise<boolean>;
  queryConsensusProposals(status: string): Promise<ConsensusProposal[]>;

  // Performance metrics
  storePerformanceMetric(metric: PerformanceMetric): Promise<string>;
  queryPerformanceMetrics(metricName: string): Promise<PerformanceMetric[]>;
  getMetricsByAgent(agentId: string): Promise<PerformanceMetric[]>;
  getAverageMetric(metricName: string): Promise<number>;

  // Artifact operations
  createArtifact(artifact: Artifact): Promise<void>;
  getArtifact(id: string): Promise<Artifact>;
  queryArtifactsByKind(kind: string): Promise<Artifact[]>;
  queryArtifactsByTag(tag: string): Promise<Artifact[]>;

  // Session operations
  createSession(session: Session): Promise<void>;
  getSession(id: string): Promise<Session>;
  addSessionCheckpoint(sessionId: string, checkpoint: Checkpoint): Promise<void>;
  getLatestCheckpoint(sessionId: string): Promise<Checkpoint | undefined>;
  markSessionResumed(sessionId: string): Promise<void>;

  // Agent registry
  registerAgent(agent: AgentRegistration): Promise<void>;
  getAgent(id: string): Promise<AgentRegistration>;
  updateAgentStatus(agentId: string, status: 'active' | 'idle' | 'terminated'): Promise<void>;
  queryAgentsByStatus(status: string): Promise<AgentRegistration[]>;
  updateAgentPerformance(agentId: string, performance: any): Promise<void>;

  // GOAP operations
  storeGOAPGoal(goal: GOAPGoal): Promise<void>;
  getGOAPGoal(id: string): Promise<GOAPGoal>;
  storeGOAPAction(action: GOAPAction): Promise<void>;
  getGOAPAction(id: string): Promise<GOAPAction>;
  storeGOAPPlan(plan: GOAPPlan): Promise<void>;
  getGOAPPlan(id: string): Promise<GOAPPlan>;

  // OODA operations
  storeOODACycle(cycle: OODACycle): Promise<void>;
  getOODACycle(id: string): Promise<OODACycle>;
  updateOODAPhase(cycleId: string, phase: OODACycle['phase'], data: any): Promise<void>;
  completeOODACycle(cycleId: string, result: any): Promise<void>;
  queryOODACyclesByPhase(phase: string): Promise<OODACycle[]>;

  // ACL operations
  storeACL(acl: any): Promise<void>;
  getACL(resourceId: string): Promise<any | null>;
  updateACL(resourceId: string, updates: any): Promise<void>;
  grantPermission(resourceId: string, agentId: string, permissions: any[]): Promise<void>;
  revokePermission(resourceId: string, agentId: string, permissions: any[]): Promise<void>;
  blockAgent(resourceId: string, agentId: string): Promise<void>;
  unblockAgent(resourceId: string, agentId: string): Promise<void>;
  getAccessControl(): any;
}
