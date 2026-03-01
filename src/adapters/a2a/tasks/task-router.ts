/**
 * A2A Task Router
 *
 * Routes incoming tasks to appropriate agents based on their capabilities,
 * skills, and current load. Integrates with the discovery service for
 * agent capability matching.
 *
 * @module adapters/a2a/tasks/task-router
 * @see https://a2a-protocol.org/latest/specification/
 */

import { EventEmitter } from 'events';
import type { A2AMessage, MessagePart, TaskStatus } from '../jsonrpc/methods.js';
import { isTextPart, extractTextFromParts } from '../jsonrpc/methods.js';
import type { DiscoveryService, AgentSearchCriteria } from '../discovery/discovery-service.js';
import type { QEAgentCard, AgentSkill, AgentCapabilities } from '../agent-cards/schema.js';
import type { A2ATask, TaskMetadata } from './task-store.js';

// ============================================================================
// Routing Types
// ============================================================================

/**
 * Routing decision result
 */
export interface RoutingDecision {
  /** Selected agent ID */
  readonly agentId: string;
  /** Agent card */
  readonly agentCard: QEAgentCard;
  /** Matched skill (if any) */
  readonly matchedSkill?: AgentSkill;
  /** Routing score (0-1) */
  readonly score: number;
  /** Reason for selection */
  readonly reason: string;
  /** Alternative agents considered */
  readonly alternatives: AlternativeAgent[];
}

/**
 * Alternative agent considered during routing
 */
export interface AlternativeAgent {
  /** Agent ID */
  readonly agentId: string;
  /** Score */
  readonly score: number;
  /** Reason not selected */
  readonly reason: string;
}

/**
 * Routing request with context
 */
export interface RoutingRequest {
  /** The message to route */
  readonly message: A2AMessage;
  /** Preferred agent ID (optional) */
  readonly preferredAgentId?: string;
  /** Required capabilities */
  readonly requiredCapabilities?: (keyof AgentCapabilities)[];
  /** Required skill */
  readonly requiredSkill?: string;
  /** Required tags */
  readonly requiredTags?: string[];
  /** Required domain */
  readonly requiredDomain?: string;
  /** Context ID for multi-turn routing */
  readonly contextId?: string;
  /** Priority level */
  readonly priority?: 'low' | 'normal' | 'high' | 'urgent';
  /** Whether to exclude overloaded agents */
  readonly excludeOverloaded?: boolean;
}

/**
 * Agent load information for load balancing
 */
export interface AgentLoad {
  /** Agent ID */
  readonly agentId: string;
  /** Number of active tasks */
  readonly activeTasks: number;
  /** Maximum concurrent tasks */
  readonly maxTasks: number;
  /** Current load percentage (0-100) */
  readonly loadPercentage: number;
  /** Average response time in ms */
  readonly avgResponseTime: number;
  /** Last updated timestamp */
  readonly lastUpdated: Date;
}

// ============================================================================
// Router Configuration
// ============================================================================

/**
 * Score weights for routing factors (all required for type safety)
 */
export interface ScoreWeights {
  readonly skillMatch: number;
  readonly tagMatch: number;
  readonly loadBalance: number;
  readonly capability: number;
  readonly domain: number;
}

/**
 * Default score weights - single source of truth
 */
export const DEFAULT_SCORE_WEIGHTS: ScoreWeights = {
  skillMatch: 0.4,
  tagMatch: 0.15,
  loadBalance: 0.2,
  capability: 0.15,
  domain: 0.1,
} as const;

/**
 * Task router configuration
 */
export interface TaskRouterConfig {
  /** Discovery service for agent lookup */
  readonly discoveryService: DiscoveryService;
  /** Default maximum tasks per agent */
  readonly defaultMaxTasksPerAgent?: number;
  /** Load percentage threshold for considering agent overloaded */
  readonly overloadThreshold?: number;
  /** Whether to enable skill-based routing */
  readonly enableSkillRouting?: boolean;
  /** Whether to enable load balancing */
  readonly enableLoadBalancing?: boolean;
  /** Minimum score threshold for agent selection */
  readonly minScoreThreshold?: number;
  /** Score weights for routing factors (partial allowed, merged with defaults) */
  readonly scoreWeights?: Partial<ScoreWeights>;
}

/**
 * Default router configuration
 */
export const DEFAULT_ROUTER_CONFIG: Required<Omit<TaskRouterConfig, 'discoveryService' | 'scoreWeights'>> & { scoreWeights: ScoreWeights } = {
  defaultMaxTasksPerAgent: 10,
  overloadThreshold: 80,
  enableSkillRouting: true,
  enableLoadBalancing: true,
  minScoreThreshold: 0.1,
  scoreWeights: DEFAULT_SCORE_WEIGHTS,
};

// ============================================================================
// Priority Queue Item
// ============================================================================

/**
 * Priority queue item for task routing
 */
export interface QueuedTask {
  /** Task ID */
  readonly taskId: string;
  /** Message */
  readonly message: A2AMessage;
  /** Routing request */
  readonly request: RoutingRequest;
  /** Queued timestamp */
  readonly queuedAt: Date;
  /** Priority value (higher = more urgent) */
  readonly priorityValue: number;
}

// ============================================================================
// Task Router Implementation
// ============================================================================

/**
 * A2A Task Router
 *
 * Routes tasks to capable agents using skill matching, load balancing,
 * and priority queuing.
 */
export class TaskRouter extends EventEmitter {
  private readonly config: Required<TaskRouterConfig>;
  private readonly agentLoads: Map<string, AgentLoad> = new Map();
  private readonly contextAgentMapping: Map<string, string> = new Map();
  private readonly taskQueue: QueuedTask[] = [];
  private readonly skillKeywordMap: Map<string, Set<string>> = new Map();

  constructor(config: TaskRouterConfig) {
    super();
    this.config = {
      ...DEFAULT_ROUTER_CONFIG,
      ...config,
    } as Required<TaskRouterConfig>;

    // Build skill keyword map for text-based matching
    this.buildSkillKeywordMap();
  }

  // ============================================================================
  // Routing Operations
  // ============================================================================

  /**
   * Route a message to an appropriate agent
   */
  async route(request: RoutingRequest): Promise<RoutingDecision> {
    const { message, preferredAgentId, contextId } = request;

    // Check for existing context-agent mapping (for multi-turn conversations)
    if (contextId) {
      const existingAgentId = this.contextAgentMapping.get(contextId);
      if (existingAgentId) {
        const agent = await this.config.discoveryService.getAgentCard(existingAgentId);
        if (agent && !this.isAgentOverloaded(existingAgentId, request.excludeOverloaded)) {
          return {
            agentId: existingAgentId,
            agentCard: agent,
            score: 1.0,
            reason: 'Routed to existing context agent',
            alternatives: [],
          };
        }
      }
    }

    // Check preferred agent
    if (preferredAgentId) {
      const agent = await this.config.discoveryService.getAgentCard(preferredAgentId);
      if (agent && this.meetsRequirements(agent, request)) {
        if (!this.isAgentOverloaded(preferredAgentId, request.excludeOverloaded)) {
          // Map context to agent if provided
          if (contextId) {
            this.contextAgentMapping.set(contextId, preferredAgentId);
          }
          return {
            agentId: preferredAgentId,
            agentCard: agent,
            score: 1.0,
            reason: 'Routed to preferred agent',
            alternatives: [],
          };
        }
      }
    }

    // Search for matching agents
    const searchCriteria = this.buildSearchCriteria(request);
    const searchResult = await this.config.discoveryService.search(searchCriteria);

    if (searchResult.agents.length === 0) {
      throw new Error('No agents available to handle this request');
    }

    // Score and rank agents
    const scoredAgents = await this.scoreAgents(searchResult.agents, request);

    if (scoredAgents.length === 0) {
      throw new Error('No suitable agents found for this request');
    }

    // Select best agent
    const selectedAgent = scoredAgents[0];
    const alternatives = scoredAgents.slice(1, 4).map((a) => ({
      agentId: a.agentId,
      score: a.score,
      reason: a.reason,
    }));

    // Map context to agent if provided
    if (contextId) {
      this.contextAgentMapping.set(contextId, selectedAgent.agentId);
    }

    // Emit routing event
    this.emit('taskRouted', {
      agentId: selectedAgent.agentId,
      score: selectedAgent.score,
      reason: selectedAgent.reason,
      timestamp: new Date(),
    });

    return {
      agentId: selectedAgent.agentId,
      agentCard: selectedAgent.agentCard,
      matchedSkill: selectedAgent.matchedSkill,
      score: selectedAgent.score,
      reason: selectedAgent.reason,
      alternatives,
    };
  }

  /**
   * Route and assign task to agent, returning the agent ID
   */
  async routeTask(
    task: A2ATask,
    request: Omit<RoutingRequest, 'message'>
  ): Promise<RoutingDecision> {
    const fullRequest: RoutingRequest = {
      ...request,
      message: task.message,
      contextId: request.contextId ?? task.contextId,
    };

    const decision = await this.route(fullRequest);

    // Update load tracking
    this.incrementAgentLoad(decision.agentId);

    return decision;
  }

  // ============================================================================
  // Load Balancing
  // ============================================================================

  /**
   * Update agent load information
   */
  updateAgentLoad(agentId: string, activeTasks: number, avgResponseTime?: number): void {
    const existing = this.agentLoads.get(agentId);
    const maxTasks = existing?.maxTasks ?? this.config.defaultMaxTasksPerAgent;

    const load: AgentLoad = {
      agentId,
      activeTasks,
      maxTasks,
      loadPercentage: (activeTasks / maxTasks) * 100,
      avgResponseTime: avgResponseTime ?? existing?.avgResponseTime ?? 0,
      lastUpdated: new Date(),
    };

    this.agentLoads.set(agentId, load);
    this.emit('loadUpdated', load);
  }

  /**
   * Set maximum tasks for an agent
   */
  setAgentMaxTasks(agentId: string, maxTasks: number): void {
    const existing = this.agentLoads.get(agentId);
    if (existing) {
      this.agentLoads.set(agentId, {
        ...existing,
        maxTasks,
        loadPercentage: (existing.activeTasks / maxTasks) * 100,
        lastUpdated: new Date(),
      });
    } else {
      this.agentLoads.set(agentId, {
        agentId,
        activeTasks: 0,
        maxTasks,
        loadPercentage: 0,
        avgResponseTime: 0,
        lastUpdated: new Date(),
      });
    }
  }

  /**
   * Increment agent load (when task is assigned)
   */
  incrementAgentLoad(agentId: string): void {
    const existing = this.agentLoads.get(agentId);
    const activeTasks = (existing?.activeTasks ?? 0) + 1;
    this.updateAgentLoad(agentId, activeTasks, existing?.avgResponseTime);
  }

  /**
   * Decrement agent load (when task completes)
   */
  decrementAgentLoad(agentId: string): void {
    const existing = this.agentLoads.get(agentId);
    const activeTasks = Math.max(0, (existing?.activeTasks ?? 1) - 1);
    this.updateAgentLoad(agentId, activeTasks, existing?.avgResponseTime);
  }

  /**
   * Get current load for an agent
   */
  getAgentLoad(agentId: string): AgentLoad | null {
    return this.agentLoads.get(agentId) ?? null;
  }

  /**
   * Get all agent loads
   */
  getAllAgentLoads(): AgentLoad[] {
    return [...this.agentLoads.values()];
  }

  /**
   * Check if an agent is overloaded
   */
  isAgentOverloaded(agentId: string, checkEnabled: boolean = true): boolean {
    if (!checkEnabled || !this.config.enableLoadBalancing) {
      return false;
    }

    const load = this.agentLoads.get(agentId);
    if (!load) {
      return false;
    }

    return load.loadPercentage >= this.config.overloadThreshold;
  }

  // ============================================================================
  // Priority Queue
  // ============================================================================

  /**
   * Add a task to the priority queue
   */
  enqueue(taskId: string, message: A2AMessage, request: RoutingRequest): void {
    const priorityValue = this.getPriorityValue(request.priority);

    const queuedTask: QueuedTask = {
      taskId,
      message,
      request,
      queuedAt: new Date(),
      priorityValue,
    };

    // Insert in priority order (higher priority first)
    let inserted = false;
    for (let i = 0; i < this.taskQueue.length; i++) {
      if (priorityValue > this.taskQueue[i].priorityValue) {
        this.taskQueue.splice(i, 0, queuedTask);
        inserted = true;
        break;
      }
    }

    if (!inserted) {
      this.taskQueue.push(queuedTask);
    }

    this.emit('taskQueued', { taskId, priority: request.priority, queuePosition: this.taskQueue.indexOf(queuedTask) });
  }

  /**
   * Dequeue the next task
   */
  dequeue(): QueuedTask | null {
    const task = this.taskQueue.shift() ?? null;
    if (task) {
      this.emit('taskDequeued', { taskId: task.taskId });
    }
    return task;
  }

  /**
   * Get queue length
   */
  get queueLength(): number {
    return this.taskQueue.length;
  }

  /**
   * Get queued tasks
   */
  getQueuedTasks(): readonly QueuedTask[] {
    return [...this.taskQueue];
  }

  /**
   * Remove a task from the queue
   */
  removeFromQueue(taskId: string): boolean {
    const index = this.taskQueue.findIndex((t) => t.taskId === taskId);
    if (index >= 0) {
      this.taskQueue.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Get priority value from priority level
   */
  private getPriorityValue(priority?: 'low' | 'normal' | 'high' | 'urgent'): number {
    switch (priority) {
      case 'urgent':
        return 4;
      case 'high':
        return 3;
      case 'normal':
        return 2;
      case 'low':
        return 1;
      default:
        return 2;
    }
  }

  // ============================================================================
  // Context Management
  // ============================================================================

  /**
   * Get the agent assigned to a context
   */
  getContextAgent(contextId: string): string | null {
    return this.contextAgentMapping.get(contextId) ?? null;
  }

  /**
   * Set the agent for a context
   */
  setContextAgent(contextId: string, agentId: string): void {
    this.contextAgentMapping.set(contextId, agentId);
  }

  /**
   * Remove context-agent mapping
   */
  clearContextAgent(contextId: string): boolean {
    return this.contextAgentMapping.delete(contextId);
  }

  /**
   * Get all context mappings
   */
  getAllContextMappings(): Map<string, string> {
    return new Map(this.contextAgentMapping);
  }

  // ============================================================================
  // Skill Matching
  // ============================================================================

  /**
   * Build skill keyword map for text-based matching
   */
  private async buildSkillKeywordMap(): Promise<void> {
    // Pre-populate with common QE skill keywords
    const skillKeywords: Record<string, string[]> = {
      'test-generation': ['test', 'tests', 'testing', 'generate', 'create tests', 'unit test', 'integration test'],
      'coverage-analysis': ['coverage', 'code coverage', 'test coverage', 'gaps', 'uncovered'],
      'security-scan': ['security', 'vulnerability', 'vulnerabilities', 'owasp', 'cve', 'scan', 'audit'],
      'accessibility-audit': ['accessibility', 'a11y', 'wcag', 'screen reader', 'aria'],
      'performance-test': ['performance', 'load test', 'stress test', 'benchmark', 'latency'],
      'quality-assessment': ['quality', 'quality gate', 'metrics', 'code quality', 'technical debt'],
      'defect-prediction': ['defect', 'bug', 'regression', 'predict', 'risk'],
      'tdd-cycle': ['tdd', 'red green refactor', 'test driven', 'test first'],
    };

    for (const [skillId, keywords] of Object.entries(skillKeywords)) {
      this.skillKeywordMap.set(skillId, new Set(keywords.map((k) => k.toLowerCase())));
    }
  }

  /**
   * Match message text to skills
   */
  private matchTextToSkills(text: string): string[] {
    const lowerText = text.toLowerCase();
    const matchedSkills: string[] = [];

    for (const [skillId, keywords] of this.skillKeywordMap) {
      for (const keyword of keywords) {
        if (lowerText.includes(keyword)) {
          matchedSkills.push(skillId);
          break;
        }
      }
    }

    return matchedSkills;
  }

  // ============================================================================
  // Agent Scoring
  // ============================================================================

  /**
   * Build search criteria from routing request
   */
  private buildSearchCriteria(request: RoutingRequest): AgentSearchCriteria {
    // Build criteria object with all properties at once to satisfy readonly constraint
    return {
      streaming: request.requiredCapabilities?.includes('streaming') ? true : undefined,
      skill: request.requiredSkill,
      tag: request.requiredTags?.length ? request.requiredTags[0] : undefined,
      domain: request.requiredDomain,
    };
  }

  /**
   * Check if an agent meets requirements
   */
  private meetsRequirements(agent: QEAgentCard, request: RoutingRequest): boolean {
    // Check capabilities
    if (request.requiredCapabilities) {
      for (const cap of request.requiredCapabilities) {
        if (!agent.capabilities[cap]) {
          return false;
        }
      }
    }

    // Check skill
    if (request.requiredSkill) {
      if (!agent.skills.some((s) => s.id === request.requiredSkill)) {
        return false;
      }
    }

    // Check domain
    if (request.requiredDomain) {
      if (agent.qeMetadata?.domain !== request.requiredDomain) {
        return false;
      }
    }

    return true;
  }

  /**
   * Score and rank agents for a request
   */
  private async scoreAgents(
    agents: QEAgentCard[],
    request: RoutingRequest
  ): Promise<Array<{ agentId: string; agentCard: QEAgentCard; matchedSkill?: AgentSkill; score: number; reason: string }>> {
    // Merge user weights with defaults (single source of truth)
    const weights: ScoreWeights = {
      ...DEFAULT_SCORE_WEIGHTS,
      ...this.config.scoreWeights,
    };
    const { skillMatch, tagMatch, loadBalance, capability, domain } = weights;
    const scored: Array<{ agentId: string; agentCard: QEAgentCard; matchedSkill?: AgentSkill; score: number; reason: string }> = [];

    // Extract text from message for skill matching
    const messageText = extractTextFromParts(request.message.parts);
    const inferredSkills = this.config.enableSkillRouting ? this.matchTextToSkills(messageText) : [];

    for (const agent of agents) {
      let score = 0;
      const reasons: string[] = [];

      // Skill match score
      let matchedSkill: AgentSkill | undefined;
      if (request.requiredSkill) {
        const skill = agent.skills.find((s) => s.id === request.requiredSkill);
        if (skill) {
          score += skillMatch;
          matchedSkill = skill;
          reasons.push(`Exact skill match: ${skill.name}`);
        }
      } else if (inferredSkills.length > 0) {
        for (const skillId of inferredSkills) {
          const skill = agent.skills.find((s) => s.id === skillId);
          if (skill) {
            score += skillMatch * 0.8; // Slightly lower for inferred
            matchedSkill = skill;
            reasons.push(`Inferred skill match: ${skill.name}`);
            break;
          }
        }
      }

      // Tag match score
      if (request.requiredTags?.length) {
        const agentTags = new Set(
          agent.skills.flatMap((s) => s.tags ?? []).map((t) => t.toLowerCase())
        );
        const matchedTags = request.requiredTags.filter((t) =>
          agentTags.has(t.toLowerCase())
        );
        if (matchedTags.length > 0) {
          score += tagMatch * (matchedTags.length / request.requiredTags.length);
          reasons.push(`Tag match: ${matchedTags.join(', ')}`);
        }
      }

      // Capability score
      if (request.requiredCapabilities?.length) {
        const matchedCaps = request.requiredCapabilities.filter(
          (cap) => agent.capabilities[cap]
        );
        score += capability * (matchedCaps.length / request.requiredCapabilities.length);
        if (matchedCaps.length > 0) {
          reasons.push(`Capabilities: ${matchedCaps.join(', ')}`);
        }
      } else {
        // Base capability score for streaming support
        if (agent.capabilities.streaming) {
          score += capability * 0.5;
        }
      }

      // Domain score
      if (request.requiredDomain) {
        if (agent.qeMetadata?.domain === request.requiredDomain) {
          score += domain;
          reasons.push(`Domain match: ${request.requiredDomain}`);
        }
      }

      // Load balance score
      if (this.config.enableLoadBalancing) {
        const load = this.agentLoads.get(agent.name);
        if (load) {
          // Higher score for less loaded agents
          const loadFactor = 1 - load.loadPercentage / 100;
          score += loadBalance * loadFactor;
          if (loadFactor > 0.5) {
            reasons.push(`Low load: ${load.loadPercentage.toFixed(0)}%`);
          }
        } else {
          // Unknown load = full availability score
          score += loadBalance;
          reasons.push('No load data (assumed available)');
        }
      }

      // Skip if overloaded
      if (this.isAgentOverloaded(agent.name, request.excludeOverloaded)) {
        continue;
      }

      // Skip if below threshold
      if (score < this.config.minScoreThreshold) {
        continue;
      }

      scored.push({
        agentId: agent.name,
        agentCard: agent,
        matchedSkill,
        score,
        reason: reasons.join('; ') || 'Default selection',
      });
    }

    // Sort by score (descending)
    scored.sort((a, b) => b.score - a.score);

    return scored;
  }

  // ============================================================================
  // Statistics
  // ============================================================================

  /**
   * Get router statistics
   */
  getStats(): {
    trackedAgents: number;
    averageLoad: number;
    overloadedAgents: number;
    queueLength: number;
    contextMappings: number;
  } {
    const loads = [...this.agentLoads.values()];
    const totalLoad = loads.reduce((sum, l) => sum + l.loadPercentage, 0);
    const overloaded = loads.filter((l) => l.loadPercentage >= this.config.overloadThreshold).length;

    return {
      trackedAgents: this.agentLoads.size,
      averageLoad: loads.length > 0 ? totalLoad / loads.length : 0,
      overloadedAgents: overloaded,
      queueLength: this.taskQueue.length,
      contextMappings: this.contextAgentMapping.size,
    };
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  /**
   * Clear all state
   */
  clear(): void {
    this.agentLoads.clear();
    this.contextAgentMapping.clear();
    this.taskQueue.length = 0;
  }

  /**
   * Destroy the router
   */
  destroy(): void {
    this.clear();
    this.removeAllListeners();
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new TaskRouter instance
 */
export function createTaskRouter(config: TaskRouterConfig): TaskRouter {
  return new TaskRouter(config);
}
