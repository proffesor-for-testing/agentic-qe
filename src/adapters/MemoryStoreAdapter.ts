/**
 * MemoryStoreAdapter - Bridges MemoryStore interface to SwarmMemoryManager
 *
 * This adapter provides type-safe compatibility between the MemoryStore interface
 * used by BaseAgent and the SwarmMemoryManager expected by VerificationHookManager.
 *
 * Key Features:
 * - Runtime validation of MemoryStore compatibility
 * - Type-safe method delegation
 * - Clear error messages for incompatible implementations
 * - Full SwarmMemoryManager interface implementation
 */

import { MemoryStore } from '../types';
import { ISwarmMemoryManager } from '../types/memory-interfaces';
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
 * Adapter that wraps MemoryStore to provide ISwarmMemoryManager interface
 */
export class MemoryStoreAdapter implements ISwarmMemoryManager {
  private initialized = false;

  constructor(private memoryStore: MemoryStore) {
    this.validateCompatibility();
  }

  /**
   * Validates that MemoryStore has all required methods
   * Throws clear error if incompatible
   */
  private validateCompatibility(): void {
    // Check if memoryStore is null or undefined
    if (!this.memoryStore || typeof this.memoryStore !== 'object') {
      throw new Error(
        'MemoryStoreAdapter requires a valid MemoryStore instance. ' +
        `Received: ${this.memoryStore === null ? 'null' : typeof this.memoryStore}. ` +
        'Please ensure the MemoryStore is properly initialized before creating the adapter.'
      );
    }

    const requiredMethods = ['store', 'retrieve', 'set', 'get', 'delete', 'clear'];
    const missingMethods: string[] = [];

    for (const method of requiredMethods) {
      if (typeof (this.memoryStore as any)[method] !== 'function') {
        missingMethods.push(method);
      }
    }

    if (missingMethods.length > 0) {
      throw new Error(
        `MemoryStore is missing required methods: ${missingMethods.join(', ')}. ` +
        `Cannot create VerificationHookManager with incompatible MemoryStore.`
      );
    }
  }

  /**
   * Initialize adapter (no-op, delegates to underlying MemoryStore)
   */
  async initialize(): Promise<void> {
    this.initialized = true;
  }

  /**
   * Store value with options
   * Maps to MemoryStore.store() with TTL and partition support
   */
  async store(key: string, value: any, options: StoreOptions = {}): Promise<void> {
    const partition = options.partition || 'default';
    const namespacedKey = partition !== 'default' ? `${partition}:${key}` : key;
    await this.memoryStore.store(namespacedKey, value, options.ttl);
  }

  /**
   * Retrieve value with options
   * Maps to MemoryStore.retrieve() with partition support
   */
  async retrieve(key: string, options: RetrieveOptions = {}): Promise<any> {
    const partition = options.partition || 'default';
    const namespacedKey = partition !== 'default' ? `${partition}:${key}` : key;
    return await this.memoryStore.retrieve(namespacedKey);
  }

  /**
   * Query entries matching pattern
   * Note: MemoryStore doesn't have native pattern matching,
   * so this returns empty array as safe fallback
   */
  async query(_pattern: string, _options: RetrieveOptions = {}): Promise<MemoryEntry[]> {
    // MemoryStore doesn't support pattern queries
    // Return empty array as safe fallback
    return [];
  }

  /**
   * Delete entry
   * Maps to MemoryStore.delete() with partition support
   */
  async delete(key: string, partition: string = 'default', _options: DeleteOptions = {}): Promise<void> {
    const namespacedKey = partition !== 'default' ? `${partition}:${key}` : key;
    await this.memoryStore.delete(namespacedKey);
  }

  /**
   * Clear partition
   * Maps to MemoryStore.clear() with namespace support
   */
  async clear(partition: string = 'default'): Promise<void> {
    await this.memoryStore.clear(partition);
  }

  /**
   * Post hint to blackboard
   * Stores as regular entry with hint: prefix
   */
  async postHint(hint: { key: string; value: any; ttl?: number }): Promise<void> {
    await this.memoryStore.store(`hint:${hint.key}`, hint.value, hint.ttl);
  }

  /**
   * Read hints matching pattern
   * Returns empty array as MemoryStore doesn't support pattern matching
   */
  async readHints(_pattern: string): Promise<Hint[]> {
    // MemoryStore doesn't support pattern queries
    return [];
  }

  /**
   * Clean expired entries
   * No-op for basic MemoryStore (relies on TTL)
   */
  async cleanExpired(): Promise<number> {
    return 0;
  }

  /**
   * Close connection
   * No-op for basic MemoryStore
   */
  async close(): Promise<void> {
    // No-op
  }

  /**
   * Get memory statistics
   * Returns basic stats structure
   */
  async stats(): Promise<{
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
  }> {
    return {
      totalEntries: 0,
      totalHints: 0,
      totalEvents: 0,
      totalWorkflows: 0,
      totalPatterns: 0,
      totalConsensus: 0,
      totalMetrics: 0,
      totalArtifacts: 0,
      totalSessions: 0,
      totalAgents: 0,
      totalGOAPGoals: 0,
      totalGOAPActions: 0,
      totalGOAPPlans: 0,
      totalOODACycles: 0,
      partitions: ['default'],
      accessLevels: {}
    };
  }

  // ============================================================================
  // Table-specific methods (delegated with basic implementation)
  // ============================================================================

  async storeEvent(event: Event): Promise<string> {
    const id = event.id || `event-${Date.now()}`;
    await this.store(`events:${id}`, event, { partition: 'events', ttl: event.ttl });
    return id;
  }

  async queryEvents(_type: string): Promise<Event[]> {
    return [];
  }

  async getEventsBySource(_source: string): Promise<Event[]> {
    return [];
  }

  async storeWorkflowState(workflow: WorkflowState): Promise<void> {
    await this.store(`workflow:${workflow.id}`, workflow, { partition: 'workflow_state' });
  }

  async getWorkflowState(id: string): Promise<WorkflowState> {
    const data = await this.retrieve(`workflow:${id}`, { partition: 'workflow_state' });
    if (!data) {
      throw new Error(`Workflow state not found: ${id}`);
    }
    return data as WorkflowState;
  }

  async updateWorkflowState(id: string, updates: Partial<WorkflowState>): Promise<void> {
    const current = await this.getWorkflowState(id);
    await this.storeWorkflowState({ ...current, ...updates });
  }

  async queryWorkflowsByStatus(_status: string): Promise<WorkflowState[]> {
    return [];
  }

  async storePattern(pattern: Pattern): Promise<string> {
    const id = pattern.id || `pattern-${Date.now()}`;
    await this.store(`patterns:${id}`, pattern, { partition: 'patterns', ttl: pattern.ttl });
    return id;
  }

  async getPattern(patternName: string): Promise<Pattern> {
    const data = await this.retrieve(`patterns:${patternName}`, { partition: 'patterns' });
    if (!data) {
      throw new Error(`Pattern not found: ${patternName}`);
    }
    return data as Pattern;
  }

  async incrementPatternUsage(patternName: string): Promise<void> {
    try {
      const pattern = await this.getPattern(patternName);
      pattern.usageCount++;
      await this.storePattern(pattern);
    } catch {
      // Pattern doesn't exist, ignore
    }
  }

  async queryPatternsByConfidence(_threshold: number): Promise<Pattern[]> {
    return [];
  }

  async createConsensusProposal(proposal: ConsensusProposal): Promise<void> {
    await this.store(`consensus:${proposal.id}`, proposal, { partition: 'consensus', ttl: proposal.ttl });
  }

  async getConsensusProposal(id: string): Promise<ConsensusProposal> {
    const data = await this.retrieve(`consensus:${id}`, { partition: 'consensus' });
    if (!data) {
      throw new Error(`Consensus proposal not found: ${id}`);
    }
    return data as ConsensusProposal;
  }

  async voteOnConsensus(proposalId: string, agentId: string): Promise<boolean> {
    const proposal = await this.getConsensusProposal(proposalId);
    if (!proposal.votes.includes(agentId)) {
      proposal.votes.push(agentId);
    }
    const approved = proposal.votes.length >= proposal.quorum;
    if (approved) {
      proposal.status = 'approved';
    }
    await this.createConsensusProposal(proposal);
    return approved;
  }

  async queryConsensusProposals(_status: string): Promise<ConsensusProposal[]> {
    return [];
  }

  async storePerformanceMetric(metric: PerformanceMetric): Promise<string> {
    const id = metric.id || `metric-${Date.now()}`;
    await this.store(`metrics:${id}`, metric, { partition: 'performance_metrics' });
    return id;
  }

  async queryPerformanceMetrics(_metricName: string): Promise<PerformanceMetric[]> {
    return [];
  }

  async getMetricsByAgent(_agentId: string): Promise<PerformanceMetric[]> {
    return [];
  }

  async getAverageMetric(_metricName: string): Promise<number> {
    return 0;
  }

  async createArtifact(artifact: Artifact): Promise<void> {
    await this.store(`artifact:${artifact.id}`, artifact, { partition: 'artifacts' });
  }

  async getArtifact(id: string): Promise<Artifact> {
    const data = await this.retrieve(`artifact:${id}`, { partition: 'artifacts' });
    if (!data) {
      throw new Error(`Artifact not found: ${id}`);
    }
    return data as Artifact;
  }

  async queryArtifactsByKind(_kind: string): Promise<Artifact[]> {
    return [];
  }

  async queryArtifactsByTag(_tag: string): Promise<Artifact[]> {
    return [];
  }

  async createSession(session: Session): Promise<void> {
    await this.store(`session:${session.id}`, session, { partition: 'sessions' });
  }

  async getSession(id: string): Promise<Session> {
    const data = await this.retrieve(`session:${id}`, { partition: 'sessions' });
    if (!data) {
      throw new Error(`Session not found: ${id}`);
    }
    return data as Session;
  }

  async addSessionCheckpoint(sessionId: string, checkpoint: Checkpoint): Promise<void> {
    const session = await this.getSession(sessionId);
    session.checkpoints.push(checkpoint);
    await this.createSession(session);
  }

  async getLatestCheckpoint(sessionId: string): Promise<Checkpoint | undefined> {
    const session = await this.getSession(sessionId);
    return session.checkpoints.length > 0
      ? session.checkpoints[session.checkpoints.length - 1]
      : undefined;
  }

  async markSessionResumed(sessionId: string): Promise<void> {
    const session = await this.getSession(sessionId);
    session.lastResumed = Date.now();
    await this.createSession(session);
  }

  async registerAgent(agent: AgentRegistration): Promise<void> {
    await this.store(`agent:${agent.id}`, agent, { partition: 'agent_registry' });
  }

  async getAgent(id: string): Promise<AgentRegistration> {
    const data = await this.retrieve(`agent:${id}`, { partition: 'agent_registry' });
    if (!data) {
      throw new Error(`Agent not found: ${id}`);
    }
    return data as AgentRegistration;
  }

  async updateAgentStatus(agentId: string, status: 'active' | 'idle' | 'terminated'): Promise<void> {
    const agent = await this.getAgent(agentId);
    agent.status = status;
    agent.updatedAt = Date.now();
    await this.registerAgent(agent);
  }

  async queryAgentsByStatus(_status: string): Promise<AgentRegistration[]> {
    return [];
  }

  async updateAgentPerformance(agentId: string, performance: any): Promise<void> {
    const agent = await this.getAgent(agentId);
    agent.performance = performance;
    agent.updatedAt = Date.now();
    await this.registerAgent(agent);
  }

  async storeGOAPGoal(goal: GOAPGoal): Promise<void> {
    await this.store(`goap_goal:${goal.id}`, goal, { partition: 'goap_goals' });
  }

  async getGOAPGoal(id: string): Promise<GOAPGoal> {
    const data = await this.retrieve(`goap_goal:${id}`, { partition: 'goap_goals' });
    if (!data) {
      throw new Error(`GOAP goal not found: ${id}`);
    }
    return data as GOAPGoal;
  }

  async storeGOAPAction(action: GOAPAction): Promise<void> {
    await this.store(`goap_action:${action.id}`, action, { partition: 'goap_actions' });
  }

  async getGOAPAction(id: string): Promise<GOAPAction> {
    const data = await this.retrieve(`goap_action:${id}`, { partition: 'goap_actions' });
    if (!data) {
      throw new Error(`GOAP action not found: ${id}`);
    }
    return data as GOAPAction;
  }

  async storeGOAPPlan(plan: GOAPPlan): Promise<void> {
    await this.store(`goap_plan:${plan.id}`, plan, { partition: 'goap_plans' });
  }

  async getGOAPPlan(id: string): Promise<GOAPPlan> {
    const data = await this.retrieve(`goap_plan:${id}`, { partition: 'goap_plans' });
    if (!data) {
      throw new Error(`GOAP plan not found: ${id}`);
    }
    return data as GOAPPlan;
  }

  async storeOODACycle(cycle: OODACycle): Promise<void> {
    await this.store(`ooda_cycle:${cycle.id}`, cycle, { partition: 'ooda_cycles' });
  }

  async getOODACycle(id: string): Promise<OODACycle> {
    const data = await this.retrieve(`ooda_cycle:${id}`, { partition: 'ooda_cycles' });
    if (!data) {
      throw new Error(`OODA cycle not found: ${id}`);
    }
    return data as OODACycle;
  }

  async updateOODAPhase(cycleId: string, phase: OODACycle['phase'], data: any): Promise<void> {
    const cycle = await this.getOODACycle(cycleId);
    cycle.phase = phase;

    switch (phase) {
      case 'observe':
        cycle.observations = data;
        break;
      case 'orient':
        cycle.orientation = data;
        break;
      case 'decide':
        cycle.decision = data;
        break;
      case 'act':
        cycle.action = data;
        break;
    }

    await this.storeOODACycle(cycle);
  }

  async completeOODACycle(cycleId: string, result: any): Promise<void> {
    const cycle = await this.getOODACycle(cycleId);
    cycle.completed = true;
    cycle.result = result;
    await this.storeOODACycle(cycle);
  }

  async queryOODACyclesByPhase(_phase: string): Promise<OODACycle[]> {
    return [];
  }

  // ACL methods (basic implementation)
  async storeACL(acl: any): Promise<void> {
    await this.store(`acl:${acl.resourceId}`, acl, { partition: 'acl' });
  }

  async getACL(resourceId: string): Promise<any | null> {
    return await this.retrieve(`acl:${resourceId}`, { partition: 'acl' });
  }

  async updateACL(resourceId: string, updates: any): Promise<void> {
    const existing = await this.getACL(resourceId);
    if (!existing) {
      throw new Error(`ACL not found for resource: ${resourceId}`);
    }
    await this.storeACL({ ...existing, ...updates });
  }

  async grantPermission(resourceId: string, agentId: string, permissions: any[]): Promise<void> {
    const acl = await this.getACL(resourceId);
    if (!acl) {
      throw new Error(`ACL not found for resource: ${resourceId}`);
    }
    acl.grantedPermissions = acl.grantedPermissions || {};
    acl.grantedPermissions[agentId] = permissions;
    await this.storeACL(acl);
  }

  async revokePermission(resourceId: string, agentId: string, _permissions: any[]): Promise<void> {
    const acl = await this.getACL(resourceId);
    if (!acl) {
      throw new Error(`ACL not found for resource: ${resourceId}`);
    }
    if (acl.grantedPermissions && acl.grantedPermissions[agentId]) {
      delete acl.grantedPermissions[agentId];
    }
    await this.storeACL(acl);
  }

  async blockAgent(resourceId: string, agentId: string): Promise<void> {
    const acl = await this.getACL(resourceId);
    if (!acl) {
      throw new Error(`ACL not found for resource: ${resourceId}`);
    }
    acl.blockedAgents = acl.blockedAgents || [];
    if (!acl.blockedAgents.includes(agentId)) {
      acl.blockedAgents.push(agentId);
    }
    await this.storeACL(acl);
  }

  async unblockAgent(resourceId: string, agentId: string): Promise<void> {
    const acl = await this.getACL(resourceId);
    if (!acl) {
      throw new Error(`ACL not found for resource: ${resourceId}`);
    }
    if (acl.blockedAgents) {
      acl.blockedAgents = acl.blockedAgents.filter((id: string) => id !== agentId);
    }
    await this.storeACL(acl);
  }

  getAccessControl(): any {
    return null; // Not implemented in basic adapter
  }

  // ============================================================================
  // Learning Operations (no-op implementations for basic MemoryStore adapter)
  // ============================================================================

  async storeLearningExperience(_experience: {
    agentId: string;
    taskId?: string;
    taskType: string;
    state: string;
    action: string;
    reward: number;
    nextState: string;
    episodeId?: string;
  }): Promise<void> {
    // No-op: basic MemoryStore doesn't support learning operations
    // Use SwarmMemoryManager directly for learning features
  }

  async upsertQValue(
    _agentId: string,
    _stateKey: string,
    _actionKey: string,
    _qValue: number
  ): Promise<void> {
    // No-op: basic MemoryStore doesn't support learning operations
  }

  async getAllQValues(_agentId: string): Promise<Array<{
    state_key: string;
    action_key: string;
    q_value: number;
    update_count: number;
  }>> {
    return [];
  }

  async getQValue(_agentId: string, _stateKey: string, _actionKey: string): Promise<number | null> {
    return null;
  }

  async storeLearningSnapshot(_snapshot: {
    agentId: string;
    snapshotType: 'performance' | 'q_table' | 'pattern';
    metrics: any;
    improvementRate?: number;
    totalExperiences?: number;
    explorationRate?: number;
  }): Promise<void> {
    // No-op: basic MemoryStore doesn't support learning operations
  }

  async getLearningHistory(_agentId: string, _limit?: number): Promise<Array<{
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
  }>> {
    return [];
  }
}
