/**
 * WorkspaceAgentCoordinator - Attention-Based Agent Coordination
 *
 * Integrates GlobalWorkspaceAdapter with QE agent coordination for
 * attention-based agent management following Global Workspace Theory.
 *
 * Key Features:
 * - Attention bottleneck for agent coordination (Miller's Law: 7+/-2 items)
 * - Broadcasting important items to all registered agents
 * - Competition for workspace access based on relevance/salience
 * - Conscious vs unconscious processing management
 *
 * @see Baars, B.J. (1988) A Cognitive Theory of Consciousness
 * @module nervous-system/integration/WorkspaceAgent
 */

import { EventEmitter } from 'events';
import {
  GlobalWorkspaceAdapter,
  GlobalWorkspaceConfig,
  AgentRepresentation,
  AttentionResult,
  WorkspaceOccupancy,
  SynchronizationMetrics,
} from '../adapters/GlobalWorkspaceAdapter.js';
import { BaseAgent } from '../../agents/BaseAgent.js';
import { QEAgentType } from '../../types/index.js';

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Item that an agent broadcasts to the global workspace
 */
export interface AgentWorkspaceItem {
  /** Unique identifier for this item */
  id: string;

  /** ID of the agent that created this item */
  agentId: string;

  /** Type of the agent (e.g., 'test-generator', 'coverage-analyzer') */
  agentType: string;

  /** Content payload (task data, results, requests) */
  content: unknown;

  /** Priority level (0.0-1.0, higher = more important) */
  priority: number;

  /** Relevance score for attention competition (0.0-1.0) */
  relevance: number;

  /** Unix timestamp when item was created */
  timestamp: number;

  /** Optional metadata for filtering and routing */
  metadata?: {
    /** Target agent types that should receive this */
    targetTypes?: QEAgentType[];
    /** Task ID if related to a specific task */
    taskId?: string;
    /** Category for filtering */
    category?: 'task' | 'result' | 'request' | 'notification' | 'coordination';
    /** Time-to-live in milliseconds */
    ttl?: number;
    /** Custom attributes */
    [key: string]: unknown;
  };
}

/**
 * Task coordination request for multi-agent collaboration
 */
export interface TaskCoordinationRequest {
  /** Task identifier */
  taskId: string;

  /** Task type/category */
  type: string;

  /** Task payload */
  payload: unknown;

  /** Required agent types */
  requiredAgents: QEAgentType[];

  /** Optional agent IDs */
  involvedAgentIds?: string[];

  /** Priority for attention allocation */
  priority: number;

  /** Timeout in milliseconds */
  timeout?: number;

  /** Coordination strategy */
  strategy?: 'parallel' | 'sequential' | 'consensus';
}

/**
 * Result of task coordination
 */
export interface TaskCoordinationResult {
  /** Task identifier */
  taskId: string;

  /** Whether coordination succeeded */
  success: boolean;

  /** Agent IDs that participated */
  participatingAgents: string[];

  /** Results from each agent */
  agentResults: Map<string, unknown>;

  /** Total duration in milliseconds */
  duration: number;

  /** Any errors that occurred */
  errors?: Array<{ agentId: string; error: string }>;
}

/**
 * Agent registration info stored in coordinator
 */
interface RegisteredAgentInfo {
  /** The agent instance */
  agent: BaseAgent;

  /** Agent's current salience in workspace */
  currentSalience: number;

  /** Whether agent currently has attention */
  hasAttention: boolean;

  /** Last broadcast timestamp */
  lastBroadcast: number;

  /** Subscription filters for incoming items */
  subscriptions: {
    categories?: string[];
    taskIds?: string[];
    sourceTypes?: QEAgentType[];
  };
}

/**
 * Events emitted by WorkspaceAgentCoordinator
 */
export interface WorkspaceAgentEvents {
  /** Emitted when an agent is registered */
  'agent:registered': { agentId: string; agentType: string };

  /** Emitted when an agent is unregistered */
  'agent:unregistered': { agentId: string };

  /** Emitted when an item wins attention */
  'attention:granted': { agentId: string; item: AgentWorkspaceItem };

  /** Emitted when an agent loses attention */
  'attention:lost': { agentId: string };

  /** Emitted when a broadcast is accepted */
  'broadcast:accepted': { item: AgentWorkspaceItem };

  /** Emitted when a broadcast is rejected (workspace full, low salience) */
  'broadcast:rejected': { item: AgentWorkspaceItem; reason: string };

  /** Emitted during task coordination */
  'coordination:started': { taskId: string; agents: string[] };

  /** Emitted when task coordination completes */
  'coordination:completed': { result: TaskCoordinationResult };

  /** Emitted when competition runs */
  'competition:complete': { winners: AttentionResult[] };
}

/**
 * Configuration for WorkspaceAgentCoordinator
 */
export interface WorkspaceAgentCoordinatorConfig {
  /** Global workspace configuration */
  workspaceConfig?: GlobalWorkspaceConfig;

  /** Auto-run competition on broadcast (default: true) */
  autoCompete?: boolean;

  /** Competition interval in ms for periodic competition (default: 0, disabled) */
  competitionInterval?: number;

  /** Default TTL for workspace items in ms (default: 30000) */
  defaultTtl?: number;

  /** Enable debug logging (default: false) */
  debug?: boolean;
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * WorkspaceAgentCoordinator
 *
 * Coordinates QE agents through a global workspace based on Global Workspace Theory.
 * Implements attention bottleneck (Miller's Law: 7+/-2 items) to prevent information
 * overload while ensuring high-priority items receive processing.
 *
 * @example
 * ```typescript
 * // Create coordinator
 * const coordinator = await WorkspaceAgentCoordinator.create();
 *
 * // Register agents
 * await coordinator.registerAgent(testGeneratorAgent);
 * await coordinator.registerAgent(coverageAnalyzerAgent);
 *
 * // Agent broadcasts to workspace
 * const accepted = await coordinator.agentBroadcast('test-gen-1', {
 *   id: 'item-1',
 *   agentId: 'test-gen-1',
 *   agentType: 'test-generator',
 *   content: { tests: [...] },
 *   priority: 0.8,
 *   relevance: 0.9,
 *   timestamp: Date.now()
 * });
 *
 * // Check if agent has attention
 * if (await coordinator.hasAttention('test-gen-1')) {
 *   // Agent can proceed with full processing
 * }
 *
 * // Coordinate task across multiple agents
 * const result = await coordinator.coordinateTask({
 *   taskId: 'task-1',
 *   type: 'comprehensive-testing',
 *   payload: { sourceFile: 'app.ts' },
 *   requiredAgents: [QEAgentType.TEST_GENERATOR, QEAgentType.COVERAGE_ANALYZER],
 *   priority: 0.9
 * });
 * ```
 */
export class WorkspaceAgentCoordinator extends EventEmitter {
  private workspace!: GlobalWorkspaceAdapter;
  private registeredAgents: Map<string, RegisteredAgentInfo>;
  private itemToAgentMap: Map<string, string>; // item ID -> agent ID
  private config: Required<WorkspaceAgentCoordinatorConfig>;
  private competitionTimer?: NodeJS.Timeout;
  private initialized: boolean = false;

  /**
   * Private constructor - use create() factory method
   */
  private constructor(config: WorkspaceAgentCoordinatorConfig = {}) {
    super();
    this.registeredAgents = new Map();
    this.itemToAgentMap = new Map();
    this.config = {
      workspaceConfig: config.workspaceConfig ?? {},
      autoCompete: config.autoCompete ?? true,
      competitionInterval: config.competitionInterval ?? 0,
      defaultTtl: config.defaultTtl ?? 30000,
      debug: config.debug ?? false,
    };
  }

  /**
   * Factory method to create an initialized WorkspaceAgentCoordinator
   *
   * @param config - Configuration options
   * @returns Initialized coordinator instance
   */
  static async create(
    config: WorkspaceAgentCoordinatorConfig = {}
  ): Promise<WorkspaceAgentCoordinator> {
    const coordinator = new WorkspaceAgentCoordinator(config);
    await coordinator.initialize();
    return coordinator;
  }

  /**
   * Initialize the coordinator and underlying workspace
   */
  private async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Create global workspace adapter
    this.workspace = await GlobalWorkspaceAdapter.create(this.config.workspaceConfig);

    // Start periodic competition if configured
    if (this.config.competitionInterval > 0) {
      this.competitionTimer = setInterval(() => {
        this.runCompetition();
      }, this.config.competitionInterval);
    }

    this.initialized = true;
    this.log('WorkspaceAgentCoordinator initialized');
  }

  /**
   * Register an agent for workspace participation
   *
   * @param agent - The BaseAgent instance to register
   * @param subscriptions - Optional subscription filters
   */
  async registerAgent(
    agent: BaseAgent,
    subscriptions?: RegisteredAgentInfo['subscriptions']
  ): Promise<void> {
    const agentId = agent.getAgentId();

    if (this.registeredAgents.has(agentId.id)) {
      this.log(`Agent ${agentId.id} already registered, updating registration`);
    }

    const info: RegisteredAgentInfo = {
      agent,
      currentSalience: 0,
      hasAttention: false,
      lastBroadcast: 0,
      subscriptions: subscriptions ?? {},
    };

    this.registeredAgents.set(agentId.id, info);

    this.emit('agent:registered', {
      agentId: agentId.id,
      agentType: agentId.type,
    });

    this.log(`Agent registered: ${agentId.id} (${agentId.type})`);
  }

  /**
   * Unregister an agent from workspace participation
   *
   * @param agentId - ID of agent to unregister
   */
  async unregisterAgent(agentId: string): Promise<void> {
    if (!this.registeredAgents.has(agentId)) {
      return;
    }

    this.registeredAgents.delete(agentId);

    // Clear any workspace items from this agent
    for (const [itemId, ownerAgentId] of this.itemToAgentMap.entries()) {
      if (ownerAgentId === agentId) {
        this.itemToAgentMap.delete(itemId);
      }
    }

    this.emit('agent:unregistered', { agentId });
    this.log(`Agent unregistered: ${agentId}`);
  }

  /**
   * Agent broadcasts an item to the global workspace
   *
   * The item competes for one of the limited attention slots (7+/-2).
   * High-priority/relevance items are more likely to win attention.
   *
   * @param agentId - ID of the broadcasting agent
   * @param item - The workspace item to broadcast
   * @returns True if item was accepted into workspace
   */
  async agentBroadcast(agentId: string, item: AgentWorkspaceItem): Promise<boolean> {
    const agentInfo = this.registeredAgents.get(agentId);

    if (!agentInfo) {
      this.log(`Broadcast rejected: agent ${agentId} not registered`);
      this.emit('broadcast:rejected', { item, reason: 'Agent not registered' });
      return false;
    }

    // Create agent representation for workspace
    // Convert content to embedding vector (simplified: use priority and relevance)
    const contentVector = this.createContentVector(item);

    // Calculate salience from priority and relevance
    const salience = this.calculateSalience(item);

    const representation: AgentRepresentation = {
      agentId: agentId,
      content: contentVector,
      salience,
      timestamp: item.timestamp,
    };

    // Broadcast to workspace
    const accepted = this.workspace.broadcast(representation);

    if (accepted) {
      // Track item-to-agent mapping
      this.itemToAgentMap.set(item.id, agentId);

      // Update agent info
      agentInfo.currentSalience = salience;
      agentInfo.lastBroadcast = item.timestamp;

      this.emit('broadcast:accepted', { item });
      this.log(`Broadcast accepted: ${item.id} from ${agentId} (salience: ${salience.toFixed(3)})`);

      // Notify relevant agents about the broadcast
      await this.notifyRelevantAgents(item);

      // Auto-compete if enabled
      if (this.config.autoCompete) {
        await this.runCompetition();
      }
    } else {
      this.emit('broadcast:rejected', { item, reason: 'Workspace full or low salience' });
      this.log(`Broadcast rejected: ${item.id} from ${agentId} (salience: ${salience.toFixed(3)})`);
    }

    return accepted;
  }

  /**
   * Get items relevant to a specific agent type
   *
   * Filters workspace items based on agent type subscriptions and metadata.
   *
   * @param agentType - The agent type to filter for
   * @returns Array of relevant workspace items
   */
  async getRelevantItems(agentType: string): Promise<AgentWorkspaceItem[]> {
    // Get all current attention winners
    const occupancy = this.workspace.getOccupancy();
    const winners = this.workspace.retrieveTopK(occupancy.current);

    const relevantItems: AgentWorkspaceItem[] = [];

    for (const winner of winners) {
      const itemAgentId = winner.agentId;
      const agentInfo = this.registeredAgents.get(itemAgentId);

      if (!agentInfo) {
        continue;
      }

      // Reconstruct workspace item from winner
      // In a full implementation, we would store items separately
      const item: AgentWorkspaceItem = {
        id: `${itemAgentId}-${winner.rank}`,
        agentId: itemAgentId,
        agentType: agentInfo.agent.getAgentId().type,
        content: winner.content,
        priority: winner.salience,
        relevance: winner.salience,
        timestamp: Date.now(), // Would be stored with item
      };

      // Check if item is relevant to requesting agent type
      if (this.isItemRelevantToType(item, agentType as QEAgentType)) {
        relevantItems.push(item);
      }
    }

    return relevantItems;
  }

  /**
   * Coordinate a task across multiple agents using the workspace
   *
   * Allocates attention to involved agents and manages their collaboration.
   *
   * @param task - Task coordination request
   * @returns Coordination result with agent outcomes
   */
  async coordinateTask(task: TaskCoordinationRequest): Promise<TaskCoordinationResult> {
    const startTime = Date.now();
    const participatingAgents: string[] = [];
    const agentResults = new Map<string, unknown>();
    const errors: Array<{ agentId: string; error: string }> = [];

    // Find agents that match required types
    const matchingAgents: Array<{ id: string; info: RegisteredAgentInfo }> = [];

    for (const [agentId, info] of this.registeredAgents.entries()) {
      const agentType = info.agent.getAgentId().type;
      if (task.requiredAgents.includes(agentType as QEAgentType)) {
        matchingAgents.push({ id: agentId, info });
      }
    }

    // Also include specific agent IDs if provided
    if (task.involvedAgentIds) {
      for (const agentId of task.involvedAgentIds) {
        if (this.registeredAgents.has(agentId) && !matchingAgents.find(a => a.id === agentId)) {
          matchingAgents.push({
            id: agentId,
            info: this.registeredAgents.get(agentId)!,
          });
        }
      }
    }

    if (matchingAgents.length === 0) {
      return {
        taskId: task.taskId,
        success: false,
        participatingAgents: [],
        agentResults,
        duration: Date.now() - startTime,
        errors: [{ agentId: 'coordinator', error: 'No matching agents found' }],
      };
    }

    this.emit('coordination:started', {
      taskId: task.taskId,
      agents: matchingAgents.map(a => a.id),
    });

    // Broadcast task to workspace with high priority
    for (const { id: agentId, info } of matchingAgents) {
      const taskItem: AgentWorkspaceItem = {
        id: `${task.taskId}-${agentId}`,
        agentId,
        agentType: info.agent.getAgentId().type,
        content: {
          taskId: task.taskId,
          type: task.type,
          payload: task.payload,
          coordination: true,
        },
        priority: task.priority,
        relevance: task.priority,
        timestamp: Date.now(),
        metadata: {
          taskId: task.taskId,
          category: 'coordination',
          targetTypes: task.requiredAgents,
        },
      };

      const accepted = await this.agentBroadcast(agentId, taskItem);

      if (accepted) {
        participatingAgents.push(agentId);
      } else {
        errors.push({ agentId, error: 'Failed to broadcast task item' });
      }
    }

    // Run competition to allocate attention
    await this.runCompetition();

    // Execute based on strategy
    switch (task.strategy) {
      case 'sequential':
        await this.executeSequential(participatingAgents, task, agentResults, errors);
        break;
      case 'consensus':
        await this.executeConsensus(participatingAgents, task, agentResults, errors);
        break;
      case 'parallel':
      default:
        await this.executeParallel(participatingAgents, task, agentResults, errors);
        break;
    }

    const result: TaskCoordinationResult = {
      taskId: task.taskId,
      success: errors.length === 0,
      participatingAgents,
      agentResults,
      duration: Date.now() - startTime,
      errors: errors.length > 0 ? errors : undefined,
    };

    this.emit('coordination:completed', { result });

    return result;
  }

  /**
   * Check if an agent currently has attention
   *
   * Agents should check this before performing expensive operations.
   * If they don't have attention, they should defer to higher-priority agents.
   *
   * @param agentId - Agent ID to check
   * @returns True if agent has attention slot
   */
  async hasAttention(agentId: string): Promise<boolean> {
    const agentInfo = this.registeredAgents.get(agentId);

    if (!agentInfo) {
      return false;
    }

    const hasWorkspaceAttention = this.workspace.hasAttention(agentId);

    // Update cached state
    const previousState = agentInfo.hasAttention;
    agentInfo.hasAttention = hasWorkspaceAttention;

    // Emit events on state change
    if (hasWorkspaceAttention && !previousState) {
      this.emit('attention:granted', {
        agentId,
        item: {
          id: `${agentId}-attention`,
          agentId,
          agentType: agentInfo.agent.getAgentId().type,
          content: null,
          priority: agentInfo.currentSalience,
          relevance: agentInfo.currentSalience,
          timestamp: Date.now(),
        },
      });
    } else if (!hasWorkspaceAttention && previousState) {
      this.emit('attention:lost', { agentId });
    }

    return hasWorkspaceAttention;
  }

  /**
   * Run competition for attention slots
   *
   * Triggers salience decay and reorders attention hierarchy.
   */
  async runCompetition(): Promise<AttentionResult[]> {
    this.workspace.compete();

    const occupancy = this.workspace.getOccupancy();
    const winners = this.workspace.retrieveTopK(occupancy.current);

    // Update agent attention states
    for (const [agentId, info] of this.registeredAgents.entries()) {
      const isWinner = winners.some(w => w.agentId === agentId);
      const previousState = info.hasAttention;

      if (isWinner) {
        const winnerInfo = winners.find(w => w.agentId === agentId);
        info.currentSalience = winnerInfo?.salience ?? 0;
        info.hasAttention = true;

        if (!previousState) {
          this.emit('attention:granted', {
            agentId,
            item: {
              id: `${agentId}-competition`,
              agentId,
              agentType: info.agent.getAgentId().type,
              content: null,
              priority: info.currentSalience,
              relevance: info.currentSalience,
              timestamp: Date.now(),
            },
          });
        }
      } else {
        info.hasAttention = false;
        if (previousState) {
          this.emit('attention:lost', { agentId });
        }
      }
    }

    this.emit('competition:complete', { winners });
    this.log(`Competition complete: ${winners.length} attention slots filled`);

    return winners;
  }

  /**
   * Get current workspace occupancy
   */
  getOccupancy(): WorkspaceOccupancy {
    return this.workspace.getOccupancy();
  }

  /**
   * Get synchronization metrics
   */
  getSynchronization(): SynchronizationMetrics {
    return this.workspace.getSynchronization();
  }

  /**
   * Get attention winners (agents with attention)
   *
   * @param k - Number of top agents to return (default: all)
   */
  getAttentionWinners(k?: number): AttentionResult[] {
    const occupancy = this.workspace.getOccupancy();
    return this.workspace.retrieveTopK(k ?? occupancy.current);
  }

  /**
   * Get registered agent count
   */
  getAgentCount(): number {
    return this.registeredAgents.size;
  }

  /**
   * Get agent info for debugging
   */
  getAgentInfo(agentId: string): {
    agentType: string;
    currentSalience: number;
    hasAttention: boolean;
    lastBroadcast: number;
  } | null {
    const info = this.registeredAgents.get(agentId);
    if (!info) {
      return null;
    }

    return {
      agentType: info.agent.getAgentId().type,
      currentSalience: info.currentSalience,
      hasAttention: info.hasAttention,
      lastBroadcast: info.lastBroadcast,
    };
  }

  /**
   * Clear workspace and reset all agent states
   */
  clear(): void {
    this.workspace.clear();
    this.itemToAgentMap.clear();

    for (const info of this.registeredAgents.values()) {
      info.currentSalience = 0;
      info.hasAttention = false;
    }

    this.log('Workspace cleared');
  }

  /**
   * Dispose of coordinator resources
   */
  dispose(): void {
    if (this.competitionTimer) {
      clearInterval(this.competitionTimer);
      this.competitionTimer = undefined;
    }

    this.workspace.dispose();
    this.registeredAgents.clear();
    this.itemToAgentMap.clear();
    this.removeAllListeners();
    this.initialized = false;

    this.log('WorkspaceAgentCoordinator disposed');
  }

  /**
   * Get coordinator statistics
   */
  getStats(): {
    initialized: boolean;
    registeredAgents: number;
    workspaceOccupancy: WorkspaceOccupancy;
    synchronization: SynchronizationMetrics;
    agentStates: Array<{
      agentId: string;
      agentType: string;
      hasAttention: boolean;
      salience: number;
    }>;
  } {
    const agentStates = Array.from(this.registeredAgents.entries()).map(([id, info]) => ({
      agentId: id,
      agentType: info.agent.getAgentId().type,
      hasAttention: info.hasAttention,
      salience: info.currentSalience,
    }));

    return {
      initialized: this.initialized,
      registeredAgents: this.registeredAgents.size,
      workspaceOccupancy: this.workspace.getOccupancy(),
      synchronization: this.workspace.getSynchronization(),
      agentStates,
    };
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Create a content vector from workspace item
   */
  private createContentVector(item: AgentWorkspaceItem): Float32Array {
    // Create a simple feature vector from item properties
    // In a production system, this would use embeddings
    const features = [
      item.priority,
      item.relevance,
      // Normalize timestamp to 0-1 range (last 24 hours)
      Math.min(1, (Date.now() - item.timestamp) / (24 * 60 * 60 * 1000)),
      // Category encoding
      this.encodeCategoryFeature(item.metadata?.category),
      // Agent type hash (simplified)
      this.hashString(item.agentType) % 1000 / 1000,
    ];

    return new Float32Array(features);
  }

  /**
   * Calculate salience from item properties
   */
  private calculateSalience(item: AgentWorkspaceItem): number {
    // Combine priority and relevance with weights
    const baseSalience = item.priority * 0.6 + item.relevance * 0.4;

    // Apply time decay (items lose salience over time)
    const age = Date.now() - item.timestamp;
    const ttl = item.metadata?.ttl ?? this.config.defaultTtl;
    const timeDecay = Math.max(0, 1 - age / ttl);

    // Final salience
    return Math.max(0, Math.min(1, baseSalience * timeDecay));
  }

  /**
   * Encode category to numeric feature
   */
  private encodeCategoryFeature(category?: string): number {
    const categoryMap: Record<string, number> = {
      task: 0.9,
      result: 0.8,
      request: 0.7,
      notification: 0.5,
      coordination: 1.0,
    };
    return categoryMap[category ?? 'notification'] ?? 0.5;
  }

  /**
   * Simple string hash for feature encoding
   */
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  /**
   * Check if item is relevant to a specific agent type
   */
  private isItemRelevantToType(item: AgentWorkspaceItem, targetType: QEAgentType): boolean {
    // If item specifies target types, check if target is included
    if (item.metadata?.targetTypes && item.metadata.targetTypes.length > 0) {
      return item.metadata.targetTypes.includes(targetType);
    }

    // If no target types specified, item is relevant to all
    return true;
  }

  /**
   * Notify agents that have subscriptions matching the broadcast item
   */
  private async notifyRelevantAgents(item: AgentWorkspaceItem): Promise<void> {
    for (const [agentId, info] of this.registeredAgents.entries()) {
      // Skip the broadcasting agent
      if (agentId === item.agentId) {
        continue;
      }

      // Check subscriptions
      const subscriptions = info.subscriptions;
      let matches = true;

      // Check category filter
      if (subscriptions.categories && subscriptions.categories.length > 0) {
        if (!item.metadata?.category || !subscriptions.categories.includes(item.metadata.category)) {
          matches = false;
        }
      }

      // Check task ID filter
      if (matches && subscriptions.taskIds && subscriptions.taskIds.length > 0) {
        if (!item.metadata?.taskId || !subscriptions.taskIds.includes(item.metadata.taskId)) {
          matches = false;
        }
      }

      // Check source type filter
      if (matches && subscriptions.sourceTypes && subscriptions.sourceTypes.length > 0) {
        if (!subscriptions.sourceTypes.includes(item.agentType as QEAgentType)) {
          matches = false;
        }
      }

      if (matches) {
        // Emit notification to agent (they can listen on their event bus)
        info.agent.emit('workspace:item', item);
      }
    }
  }

  /**
   * Execute task coordination in parallel
   */
  private async executeParallel(
    agents: string[],
    _task: TaskCoordinationRequest,
    results: Map<string, unknown>,
    errors: Array<{ agentId: string; error: string }>
  ): Promise<void> {
    const promises = agents.map(async (agentId) => {
      try {
        const hasAtt = await this.hasAttention(agentId);
        results.set(agentId, { hasAttention: hasAtt, processed: true });
      } catch (error) {
        errors.push({ agentId, error: (error as Error).message });
      }
    });

    await Promise.all(promises);
  }

  /**
   * Execute task coordination sequentially
   */
  private async executeSequential(
    agents: string[],
    _task: TaskCoordinationRequest,
    results: Map<string, unknown>,
    errors: Array<{ agentId: string; error: string }>
  ): Promise<void> {
    for (const agentId of agents) {
      try {
        const hasAtt = await this.hasAttention(agentId);
        results.set(agentId, { hasAttention: hasAtt, processed: true });
      } catch (error) {
        errors.push({ agentId, error: (error as Error).message });
      }
    }
  }

  /**
   * Execute task coordination with consensus
   */
  private async executeConsensus(
    agents: string[],
    _task: TaskCoordinationRequest,
    results: Map<string, unknown>,
    errors: Array<{ agentId: string; error: string }>
  ): Promise<void> {
    // Run all agents in parallel
    await this.executeParallel(agents, _task, results, errors);

    // Calculate consensus (simplified: majority with attention wins)
    let withAttention = 0;
    for (const result of results.values()) {
      if ((result as { hasAttention: boolean }).hasAttention) {
        withAttention++;
      }
    }

    const consensusReached = withAttention >= Math.ceil(agents.length / 2);
    results.set('__consensus__', {
      reached: consensusReached,
      agentsWithAttention: withAttention,
      totalAgents: agents.length,
    });
  }

  /**
   * Debug logging
   */
  private log(message: string): void {
    if (this.config.debug) {
      console.log(`[WorkspaceAgentCoordinator] ${message}`);
    }
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create a default WorkspaceAgentCoordinator with standard settings
 */
export async function createWorkspaceCoordinator(): Promise<WorkspaceAgentCoordinator> {
  return WorkspaceAgentCoordinator.create({
    workspaceConfig: { capacity: 7 }, // Miller's Law
    autoCompete: true,
    defaultTtl: 30000,
  });
}

/**
 * Create a focused WorkspaceAgentCoordinator (4 attention slots)
 */
export async function createFocusedCoordinator(): Promise<WorkspaceAgentCoordinator> {
  return WorkspaceAgentCoordinator.create({
    workspaceConfig: {
      capacity: 4,
      threshold: 0.2,
      decayRate: 0.08,
    },
    autoCompete: true,
    defaultTtl: 15000,
  });
}

/**
 * Create an expanded WorkspaceAgentCoordinator (9 attention slots)
 */
export async function createExpandedCoordinator(): Promise<WorkspaceAgentCoordinator> {
  return WorkspaceAgentCoordinator.create({
    workspaceConfig: {
      capacity: 9,
      threshold: 0.05,
      decayRate: 0.03,
    },
    autoCompete: true,
    defaultTtl: 60000,
  });
}
