/**
 * MemoryStoreAdapter - Bridges MemoryStore interface to SwarmMemoryManager
 *
 * Issue #65: Updated to match synchronous API.
 * Note: This adapter provides basic compatibility. For full functionality,
 * use SwarmMemoryManager directly.
 *
 * BREAKING CHANGE: Methods now return sync values instead of Promises.
 * The underlying MemoryStore operations are fire-and-forget for non-blocking calls.
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

// In-memory cache for sync operations
interface CacheEntry {
  value: any;
  expiresAt?: number;
}

/**
 * Adapter that wraps MemoryStore to provide ISwarmMemoryManager interface
 * Issue #65: Now provides synchronous API with internal caching
 */
export class MemoryStoreAdapter implements ISwarmMemoryManager {
  private initialized = false;
  private cache: Map<string, CacheEntry> = new Map();

  constructor(private memoryStore: MemoryStore) {
    this.validateCompatibility();
  }

  private validateCompatibility(): void {
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

  async initialize(): Promise<void> {
    this.initialized = true;
  }

  async store(key: string, value: any, options: StoreOptions = {}): Promise<void> {
    const partition = options.partition || 'default';
    const namespacedKey = partition !== 'default' ? `${partition}:${key}` : key;

    // Cache locally for sync access
    this.cache.set(namespacedKey, {
      value,
      expiresAt: options.ttl ? Date.now() + options.ttl * 1000 : undefined
    });

    // Fire-and-forget to underlying store
    this.memoryStore.store(namespacedKey, value, options.ttl).catch(() => {});
  }

  async retrieve(key: string, options: RetrieveOptions = {}): Promise<any> {
    const partition = options.partition || 'default';
    const namespacedKey = partition !== 'default' ? `${partition}:${key}` : key;

    // Check cache first
    const cached = this.cache.get(namespacedKey);
    if (cached) {
      if (!cached.expiresAt || cached.expiresAt > Date.now()) {
        return cached.value;
      }
      this.cache.delete(namespacedKey);
    }

    // Fallback to underlying store
    return await this.memoryStore.retrieve(namespacedKey);
  }

  query(_pattern: string, _options: RetrieveOptions = {}): MemoryEntry[] {
    return [];
  }

  delete(key: string, partition: string = 'default', _options: DeleteOptions = {}): void {
    const namespacedKey = partition !== 'default' ? `${partition}:${key}` : key;
    this.cache.delete(namespacedKey);
    this.memoryStore.delete(namespacedKey).catch(() => {});
  }

  clear(partition: string = 'default'): void {
    // Clear cache entries for partition
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${partition}:`) || partition === 'default') {
        this.cache.delete(key);
      }
    }
    this.memoryStore.clear(partition).catch(() => {});
  }

  postHint(hint: { key: string; value: any; ttl?: number }): void {
    const key = `hint:${hint.key}`;
    this.cache.set(key, { value: hint.value, expiresAt: hint.ttl ? Date.now() + hint.ttl * 1000 : undefined });
    this.memoryStore.store(key, hint.value, hint.ttl).catch(() => {});
  }

  readHints(_pattern: string): Hint[] {
    return [];
  }

  cleanExpired(): number {
    let cleaned = 0;
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt && entry.expiresAt < now) {
        this.cache.delete(key);
        cleaned++;
      }
    }
    return cleaned;
  }

  close(): void {
    this.cache.clear();
  }

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
  } {
    return {
      totalEntries: this.cache.size,
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

  // Event operations
  storeEvent(event: Event): string {
    const id = event.id || `event-${Date.now()}`;
    this.cache.set(`events:${id}`, { value: event, expiresAt: event.ttl ? Date.now() + event.ttl * 1000 : undefined });
    return id;
  }

  queryEvents(_type: string): Event[] {
    return [];
  }

  getEventsBySource(_source: string): Event[] {
    return [];
  }

  // Workflow operations
  storeWorkflowState(workflow: WorkflowState): void {
    this.cache.set(`workflow:${workflow.id}`, { value: workflow });
  }

  getWorkflowState(id: string): WorkflowState {
    const entry = this.cache.get(`workflow:${id}`);
    if (!entry) {
      throw new Error(`Workflow state not found: ${id}`);
    }
    return entry.value as WorkflowState;
  }

  updateWorkflowState(id: string, updates: Partial<WorkflowState>): void {
    const current = this.getWorkflowState(id);
    this.storeWorkflowState({ ...current, ...updates });
  }

  queryWorkflowsByStatus(_status: string): WorkflowState[] {
    return [];
  }

  // Pattern operations
  storePattern(pattern: Pattern): string {
    const id = pattern.id || `pattern-${Date.now()}`;
    this.cache.set(`patterns:${id}`, { value: pattern, expiresAt: pattern.ttl ? Date.now() + pattern.ttl * 1000 : undefined });
    return id;
  }

  getPattern(patternName: string): Pattern {
    const entry = this.cache.get(`patterns:${patternName}`);
    if (!entry) {
      throw new Error(`Pattern not found: ${patternName}`);
    }
    return entry.value as Pattern;
  }

  incrementPatternUsage(patternName: string): void {
    try {
      const pattern = this.getPattern(patternName);
      pattern.usageCount++;
      this.storePattern(pattern);
    } catch {
      // Pattern doesn't exist, ignore
    }
  }

  queryPatternsByConfidence(_threshold: number): Pattern[] {
    return [];
  }

  // Consensus operations
  createConsensusProposal(proposal: ConsensusProposal): void {
    this.cache.set(`consensus:${proposal.id}`, { value: proposal, expiresAt: proposal.ttl ? Date.now() + proposal.ttl * 1000 : undefined });
  }

  getConsensusProposal(id: string): ConsensusProposal {
    const entry = this.cache.get(`consensus:${id}`);
    if (!entry) {
      throw new Error(`Consensus proposal not found: ${id}`);
    }
    return entry.value as ConsensusProposal;
  }

  voteOnConsensus(proposalId: string, agentId: string): boolean {
    const proposal = this.getConsensusProposal(proposalId);
    if (!proposal.votes.includes(agentId)) {
      proposal.votes.push(agentId);
    }
    const approved = proposal.votes.length >= proposal.quorum;
    if (approved) {
      proposal.status = 'approved';
    }
    this.createConsensusProposal(proposal);
    return approved;
  }

  queryConsensusProposals(_status: string): ConsensusProposal[] {
    return [];
  }

  // Performance metrics
  storePerformanceMetric(metric: PerformanceMetric): string {
    const id = metric.id || `metric-${Date.now()}`;
    this.cache.set(`metrics:${id}`, { value: metric });
    return id;
  }

  queryPerformanceMetrics(_metricName: string): PerformanceMetric[] {
    return [];
  }

  getMetricsByAgent(_agentId: string): PerformanceMetric[] {
    return [];
  }

  getAverageMetric(_metricName: string): number {
    return 0;
  }

  // Artifact operations
  createArtifact(artifact: Artifact): void {
    this.cache.set(`artifact:${artifact.id}`, { value: artifact });
  }

  getArtifact(id: string): Artifact {
    const entry = this.cache.get(`artifact:${id}`);
    if (!entry) {
      throw new Error(`Artifact not found: ${id}`);
    }
    return entry.value as Artifact;
  }

  queryArtifactsByKind(_kind: string): Artifact[] {
    return [];
  }

  queryArtifactsByTag(_tag: string): Artifact[] {
    return [];
  }

  // Session operations
  createSession(session: Session): void {
    this.cache.set(`session:${session.id}`, { value: session });
  }

  getSession(id: string): Session {
    const entry = this.cache.get(`session:${id}`);
    if (!entry) {
      throw new Error(`Session not found: ${id}`);
    }
    return entry.value as Session;
  }

  addSessionCheckpoint(sessionId: string, checkpoint: Checkpoint): void {
    const session = this.getSession(sessionId);
    session.checkpoints.push(checkpoint);
    this.createSession(session);
  }

  getLatestCheckpoint(sessionId: string): Checkpoint | undefined {
    const session = this.getSession(sessionId);
    return session.checkpoints.length > 0
      ? session.checkpoints[session.checkpoints.length - 1]
      : undefined;
  }

  markSessionResumed(sessionId: string): void {
    const session = this.getSession(sessionId);
    session.lastResumed = Date.now();
    this.createSession(session);
  }

  // Agent registry
  registerAgent(agent: AgentRegistration): void {
    this.cache.set(`agent:${agent.id}`, { value: agent });
  }

  getAgent(id: string): AgentRegistration {
    const entry = this.cache.get(`agent:${id}`);
    if (!entry) {
      throw new Error(`Agent not found: ${id}`);
    }
    return entry.value as AgentRegistration;
  }

  updateAgentStatus(agentId: string, status: 'active' | 'idle' | 'terminated'): void {
    const agent = this.getAgent(agentId);
    agent.status = status;
    agent.updatedAt = Date.now();
    this.registerAgent(agent);
  }

  queryAgentsByStatus(_status: string): AgentRegistration[] {
    return [];
  }

  updateAgentPerformance(agentId: string, performance: any): void {
    const agent = this.getAgent(agentId);
    agent.performance = performance;
    agent.updatedAt = Date.now();
    this.registerAgent(agent);
  }

  // GOAP operations
  storeGOAPGoal(goal: GOAPGoal): void {
    this.cache.set(`goap_goal:${goal.id}`, { value: goal });
  }

  getGOAPGoal(id: string): GOAPGoal {
    const entry = this.cache.get(`goap_goal:${id}`);
    if (!entry) {
      throw new Error(`GOAP goal not found: ${id}`);
    }
    return entry.value as GOAPGoal;
  }

  storeGOAPAction(action: GOAPAction): void {
    this.cache.set(`goap_action:${action.id}`, { value: action });
  }

  getGOAPAction(id: string): GOAPAction {
    const entry = this.cache.get(`goap_action:${id}`);
    if (!entry) {
      throw new Error(`GOAP action not found: ${id}`);
    }
    return entry.value as GOAPAction;
  }

  storeGOAPPlan(plan: GOAPPlan): void {
    this.cache.set(`goap_plan:${plan.id}`, { value: plan });
  }

  getGOAPPlan(id: string): GOAPPlan {
    const entry = this.cache.get(`goap_plan:${id}`);
    if (!entry) {
      throw new Error(`GOAP plan not found: ${id}`);
    }
    return entry.value as GOAPPlan;
  }

  // OODA operations
  storeOODACycle(cycle: OODACycle): void {
    this.cache.set(`ooda_cycle:${cycle.id}`, { value: cycle });
  }

  getOODACycle(id: string): OODACycle {
    const entry = this.cache.get(`ooda_cycle:${id}`);
    if (!entry) {
      throw new Error(`OODA cycle not found: ${id}`);
    }
    return entry.value as OODACycle;
  }

  updateOODAPhase(cycleId: string, phase: OODACycle['phase'], data: any): void {
    const cycle = this.getOODACycle(cycleId);
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

    this.storeOODACycle(cycle);
  }

  completeOODACycle(cycleId: string, result: any): void {
    const cycle = this.getOODACycle(cycleId);
    cycle.completed = true;
    cycle.result = result;
    this.storeOODACycle(cycle);
  }

  queryOODACyclesByPhase(_phase: string): OODACycle[] {
    return [];
  }

  // ACL operations
  storeACL(acl: any): void {
    this.cache.set(`acl:${acl.resourceId}`, { value: acl });
  }

  getACL(resourceId: string): any | null {
    const entry = this.cache.get(`acl:${resourceId}`);
    return entry?.value || null;
  }

  updateACL(resourceId: string, updates: any): void {
    const existing = this.getACL(resourceId);
    if (!existing) {
      throw new Error(`ACL not found for resource: ${resourceId}`);
    }
    this.storeACL({ ...existing, ...updates });
  }

  grantPermission(resourceId: string, agentId: string, permissions: any[]): void {
    const acl = this.getACL(resourceId);
    if (!acl) {
      throw new Error(`ACL not found for resource: ${resourceId}`);
    }
    acl.grantedPermissions = acl.grantedPermissions || {};
    acl.grantedPermissions[agentId] = permissions;
    this.storeACL(acl);
  }

  revokePermission(resourceId: string, agentId: string, _permissions: any[]): void {
    const acl = this.getACL(resourceId);
    if (!acl) {
      throw new Error(`ACL not found for resource: ${resourceId}`);
    }
    if (acl.grantedPermissions && acl.grantedPermissions[agentId]) {
      delete acl.grantedPermissions[agentId];
    }
    this.storeACL(acl);
  }

  blockAgent(resourceId: string, agentId: string): void {
    const acl = this.getACL(resourceId);
    if (!acl) {
      throw new Error(`ACL not found for resource: ${resourceId}`);
    }
    acl.blockedAgents = acl.blockedAgents || [];
    if (!acl.blockedAgents.includes(agentId)) {
      acl.blockedAgents.push(agentId);
    }
    this.storeACL(acl);
  }

  unblockAgent(resourceId: string, agentId: string): void {
    const acl = this.getACL(resourceId);
    if (!acl) {
      throw new Error(`ACL not found for resource: ${resourceId}`);
    }
    if (acl.blockedAgents) {
      acl.blockedAgents = acl.blockedAgents.filter((id: string) => id !== agentId);
    }
    this.storeACL(acl);
  }

  getAccessControl(): any {
    return null;
  }

  // Learning operations (no-op for basic adapter)
  storeLearningExperience(_experience: {
    agentId: string;
    taskId?: string;
    taskType: string;
    state: string;
    action: string;
    reward: number;
    nextState: string;
    episodeId?: string;
  }): void {
    // No-op: use SwarmMemoryManager directly for learning features
  }

  upsertQValue(
    _agentId: string,
    _stateKey: string,
    _actionKey: string,
    _qValue: number
  ): void {
    // No-op
  }

  getAllQValues(_agentId: string): Array<{
    state_key: string;
    action_key: string;
    q_value: number;
    update_count: number;
  }> {
    return [];
  }

  getQValue(_agentId: string, _stateKey: string, _actionKey: string): number | null {
    return null;
  }

  storeLearningSnapshot(_snapshot: {
    agentId: string;
    snapshotType: 'performance' | 'q_table' | 'pattern';
    metrics: any;
    improvementRate?: number;
    totalExperiences?: number;
    explorationRate?: number;
  }): void {
    // No-op
  }

  getLearningHistory(_agentId: string, _limit?: number): Array<{
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
  }> {
    return [];
  }
}
