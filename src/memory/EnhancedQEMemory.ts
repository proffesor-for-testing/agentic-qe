import { EventEmitter } from 'events';
import { QEMemory } from './QEMemory';
import { QEAgent, QEContext, TestResult, AgentMetrics } from '../types';

/**
 * Session state interface for tracking QE agent runs
 */
export interface QESessionState {
  sessionId: string;
  startTime: Date;
  endTime?: Date;
  activeAgents: Set<string>;
  completedTasks: Map<string, any>;
  sharedContext: Map<string, any>;
  workflow: WorkflowState;
  metadata: Record<string, any>;
}

/**
 * Workflow state for complex test scenarios
 */
export interface WorkflowState {
  id: string;
  name: string;
  phase: 'planning' | 'execution' | 'analysis' | 'reporting' | 'completed';
  steps: WorkflowStep[];
  currentStepIndex: number;
  dependencies: Map<string, string[]>;
  results: Map<string, any>;
  startTime: Date;
  estimatedDuration?: number;
}

/**
 * Individual workflow step
 */
export interface WorkflowStep {
  id: string;
  name: string;
  agentType: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  dependencies: string[];
  input?: any;
  output?: any;
  startTime?: Date;
  endTime?: Date;
  duration?: number;
  retryCount: number;
  maxRetries: number;
}

/**
 * Enhanced metrics with temporal data
 */
export interface TemporalMetrics {
  timestamp: Date;
  agentId: string;
  sessionId: string;
  metrics: AgentMetrics;
  systemResources: {
    cpuUsage: number;
    memoryUsage: number;
    ioStats: {
      readBytes: number;
      writeBytes: number;
    };
  };
  performance: {
    taskCompletionTime: number;
    throughput: number;
    errorRate: number;
  };
}

/**
 * Knowledge sharing interface for cross-agent communication
 */
export interface KnowledgeShare {
  id: string;
  sourceAgent: string;
  targetAgents: string[];
  knowledgeType: 'finding' | 'pattern' | 'insight' | 'recommendation' | 'warning';
  content: any;
  confidence: number;
  timestamp: Date;
  tags: string[];
  sessionId: string;
}

/**
 * Enhanced QE Memory System extending base QEMemory
 * Provides session state management, workflow tracking, metrics collection,
 * and cross-agent knowledge sharing capabilities
 */
export class EnhancedQEMemory extends EventEmitter {
  private baseMemory: QEMemory;
  private sessions: Map<string, QESessionState>;
  private workflows: Map<string, WorkflowState>;
  private metricsHistory: TemporalMetrics[];
  private knowledgeBase: KnowledgeShare[];
  private readonly maxMetricsHistory: number;
  private readonly maxKnowledgeBase: number;
  private readonly maxSessions: number;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(
    baseMemory?: QEMemory,
    options: {
      maxMetricsHistory?: number;
      maxKnowledgeBase?: number;
      maxSessions?: number;
      cleanupIntervalMs?: number;
    } = {}
  ) {
    super();

    this.baseMemory = baseMemory || new QEMemory();
    this.sessions = new Map();
    this.workflows = new Map();
    this.metricsHistory = [];
    this.knowledgeBase = [];

    this.maxMetricsHistory = options.maxMetricsHistory || 10000;
    this.maxKnowledgeBase = options.maxKnowledgeBase || 5000;
    this.maxSessions = options.maxSessions || 100;

    // Start cleanup interval
    if (options.cleanupIntervalMs) {
      this.startCleanupInterval(options.cleanupIntervalMs);
    }
  }

  /**
   * Session State Management
   */

  /**
   * Create a new QE session
   */
  createSession(sessionId: string, metadata: Record<string, any> = {}): QESessionState {
    const session: QESessionState = {
      sessionId,
      startTime: new Date(),
      activeAgents: new Set(),
      completedTasks: new Map(),
      sharedContext: new Map(),
      workflow: {
        id: `workflow-${sessionId}`,
        name: 'Default Workflow',
        phase: 'planning',
        steps: [],
        currentStepIndex: 0,
        dependencies: new Map(),
        results: new Map(),
        startTime: new Date()
      },
      metadata
    };

    this.sessions.set(sessionId, session);

    // Cleanup old sessions if needed
    if (this.sessions.size > this.maxSessions) {
      this.cleanupOldSessions();
    }

    this.emit('sessionCreated', session);
    return session;
  }

  /**
   * Get session state
   */
  getSession(sessionId: string): QESessionState | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Update session state
   */
  updateSession(sessionId: string, updates: Partial<QESessionState>): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    Object.assign(session, updates);
    this.emit('sessionUpdated', session);
  }

  /**
   * End a session
   */
  endSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    session.endTime = new Date();
    session.workflow.phase = 'completed';
    this.emit('sessionEnded', session);
  }

  /**
   * Register agent activity in session
   */
  registerAgentActivity(sessionId: string, agentId: string, activity: string, data?: any): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    session.activeAgents.add(agentId);
    session.completedTasks.set(`${agentId}-${Date.now()}`, {
      agentId,
      activity,
      data,
      timestamp: new Date()
    });

    this.emit('agentActivity', { sessionId, agentId, activity, data });
  }

  /**
   * Workflow Tracking
   */

  /**
   * Create a new workflow
   */
  createWorkflow(
    workflowId: string,
    name: string,
    steps: Omit<WorkflowStep, 'status' | 'retryCount'>[]
  ): WorkflowState {
    const workflow: WorkflowState = {
      id: workflowId,
      name,
      phase: 'planning',
      steps: steps.map(step => ({
        ...step,
        status: 'pending' as const,
        retryCount: 0,
        maxRetries: step.maxRetries || 3
      })),
      currentStepIndex: 0,
      dependencies: new Map(),
      results: new Map(),
      startTime: new Date()
    };

    this.workflows.set(workflowId, workflow);
    this.emit('workflowCreated', workflow);
    return workflow;
  }

  /**
   * Get workflow state
   */
  getWorkflow(workflowId: string): WorkflowState | undefined {
    return this.workflows.get(workflowId);
  }

  /**
   * Update workflow step
   */
  updateWorkflowStep(
    workflowId: string,
    stepId: string,
    updates: Partial<WorkflowStep>
  ): void {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    const step = workflow.steps.find(s => s.id === stepId);
    if (!step) {
      throw new Error(`Step not found: ${stepId}`);
    }

    Object.assign(step, updates);

    if (updates.status === 'completed') {
      step.endTime = new Date();
      if (step.startTime) {
        step.duration = step.endTime.getTime() - step.startTime.getTime();
      }
    }

    this.emit('workflowStepUpdated', { workflow, step });
  }

  /**
   * Advance workflow to next step
   */
  advanceWorkflow(workflowId: string): boolean {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    if (workflow.currentStepIndex < workflow.steps.length - 1) {
      workflow.currentStepIndex++;
      this.emit('workflowAdvanced', workflow);
      return true;
    }

    workflow.phase = 'completed';
    this.emit('workflowCompleted', workflow);
    return false;
  }

  /**
   * Metrics Collection
   */

  /**
   * Record temporal metrics
   */
  recordMetrics(metrics: Omit<TemporalMetrics, 'timestamp'>): void {
    const temporalMetrics: TemporalMetrics = {
      ...metrics,
      timestamp: new Date()
    };

    this.metricsHistory.push(temporalMetrics);

    // Cleanup old metrics if needed
    if (this.metricsHistory.length > this.maxMetricsHistory) {
      this.metricsHistory = this.metricsHistory.slice(-this.maxMetricsHistory);
    }

    this.emit('metricsRecorded', temporalMetrics);
  }

  /**
   * Get metrics for a specific agent
   */
  getAgentMetrics(agentId: string, timeRange?: { start: Date; end: Date }): TemporalMetrics[] {
    let metrics = this.metricsHistory.filter(m => m.agentId === agentId);

    if (timeRange) {
      metrics = metrics.filter(m =>
        m.timestamp >= timeRange.start && m.timestamp <= timeRange.end
      );
    }

    return metrics;
  }

  /**
   * Get aggregated metrics for a session
   */
  getSessionMetrics(sessionId: string): {
    totalTasks: number;
    averageCompletionTime: number;
    errorRate: number;
    throughput: number;
    resourceUsage: {
      avgCpu: number;
      avgMemory: number;
      totalIO: number;
    };
  } {
    const sessionMetrics = this.metricsHistory.filter(m => m.sessionId === sessionId);

    if (sessionMetrics.length === 0) {
      return {
        totalTasks: 0,
        averageCompletionTime: 0,
        errorRate: 0,
        throughput: 0,
        resourceUsage: { avgCpu: 0, avgMemory: 0, totalIO: 0 }
      };
    }

    const totalTasks = sessionMetrics.length;
    const avgCompletionTime = sessionMetrics.reduce((sum, m) => sum + m.performance.taskCompletionTime, 0) / totalTasks;
    const errorRate = sessionMetrics.reduce((sum, m) => sum + m.performance.errorRate, 0) / totalTasks;
    const throughput = sessionMetrics.reduce((sum, m) => sum + m.performance.throughput, 0) / totalTasks;

    const avgCpu = sessionMetrics.reduce((sum, m) => sum + m.systemResources.cpuUsage, 0) / totalTasks;
    const avgMemory = sessionMetrics.reduce((sum, m) => sum + m.systemResources.memoryUsage, 0) / totalTasks;
    const totalIO = sessionMetrics.reduce((sum, m) =>
      sum + m.systemResources.ioStats.readBytes + m.systemResources.ioStats.writeBytes, 0
    );

    return {
      totalTasks,
      averageCompletionTime: avgCompletionTime,
      errorRate,
      throughput,
      resourceUsage: {
        avgCpu,
        avgMemory,
        totalIO
      }
    };
  }

  /**
   * Cross-Agent Knowledge Sharing
   */

  /**
   * Share knowledge between agents
   */
  shareKnowledge(knowledge: Omit<KnowledgeShare, 'id' | 'timestamp'>): string {
    const knowledgeItem: KnowledgeShare = {
      ...knowledge,
      id: `knowledge-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date()
    };

    this.knowledgeBase.push(knowledgeItem);

    // Cleanup old knowledge if needed
    if (this.knowledgeBase.length > this.maxKnowledgeBase) {
      this.knowledgeBase = this.knowledgeBase.slice(-this.maxKnowledgeBase);
    }

    this.emit('knowledgeShared', knowledgeItem);
    return knowledgeItem.id;
  }

  /**
   * Get knowledge for specific agents
   */
  getKnowledgeForAgent(agentId: string, knowledgeTypes?: string[]): KnowledgeShare[] {
    let knowledge = this.knowledgeBase.filter(k =>
      k.targetAgents.includes(agentId) || k.targetAgents.includes('*')
    );

    if (knowledgeTypes) {
      knowledge = knowledge.filter(k => knowledgeTypes.includes(k.knowledgeType));
    }

    return knowledge.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Search knowledge base
   */
  searchKnowledge(
    query: string,
    filters?: {
      sessionId?: string;
      knowledgeType?: string;
      tags?: string[];
      minConfidence?: number;
    }
  ): KnowledgeShare[] {
    let results = this.knowledgeBase;

    // Apply filters
    if (filters) {
      if (filters.sessionId) {
        results = results.filter(k => k.sessionId === filters.sessionId);
      }
      if (filters.knowledgeType) {
        results = results.filter(k => k.knowledgeType === filters.knowledgeType);
      }
      if (filters.tags) {
        results = results.filter(k =>
          filters.tags!.some(tag => k.tags.includes(tag))
        );
      }
      if (filters.minConfidence) {
        results = results.filter(k => k.confidence >= filters.minConfidence!);
      }
    }

    // Simple text search in content
    if (query) {
      const queryLower = query.toLowerCase();
      results = results.filter(k =>
        JSON.stringify(k.content).toLowerCase().includes(queryLower) ||
        k.tags.some(tag => tag.toLowerCase().includes(queryLower))
      );
    }

    return results.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Utility Methods
   */

  /**
   * Get all active sessions
   */
  getActiveSessions(): QESessionState[] {
    return Array.from(this.sessions.values()).filter(s => !s.endTime);
  }

  /**
   * Get system-wide statistics
   */
  getSystemStats(): {
    activeSessions: number;
    totalWorkflows: number;
    metricsCount: number;
    knowledgeItems: number;
    memoryUsage: {
      sessions: number;
      workflows: number;
      metrics: number;
      knowledge: number;
    };
  } {
    return {
      activeSessions: this.getActiveSessions().length,
      totalWorkflows: this.workflows.size,
      metricsCount: this.metricsHistory.length,
      knowledgeItems: this.knowledgeBase.length,
      memoryUsage: {
        sessions: this.sessions.size,
        workflows: this.workflows.size,
        metrics: this.metricsHistory.length,
        knowledge: this.knowledgeBase.length
      }
    };
  }

  /**
   * Cleanup old sessions
   */
  private cleanupOldSessions(): void {
    const sessions = Array.from(this.sessions.entries());
    const sortedSessions = sessions.sort((a, b) =>
      a[1].startTime.getTime() - b[1].startTime.getTime()
    );

    const toRemove = sortedSessions.slice(0, sessions.length - this.maxSessions + 10);
    toRemove.forEach(([sessionId]) => {
      this.sessions.delete(sessionId);
    });

    this.emit('sessionsCleanedUp', toRemove.length);
  }

  /**
   * Start automatic cleanup interval
   */
  private startCleanupInterval(intervalMs: number): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldSessions();
    }, intervalMs);
  }

  /**
   * Stop automatic cleanup
   */
  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Export session data for persistence
   */
  exportSessionData(sessionId: string): any {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const sessionMetrics = this.getSessionMetrics(sessionId);
    const sessionKnowledge = this.knowledgeBase.filter(k => k.sessionId === sessionId);

    return {
      session: {
        ...session,
        activeAgents: Array.from(session.activeAgents),
        completedTasks: Object.fromEntries(session.completedTasks),
        sharedContext: Object.fromEntries(session.sharedContext)
      },
      metrics: sessionMetrics,
      knowledge: sessionKnowledge,
      exportTimestamp: new Date()
    };
  }

  /**
   * Import session data from persistence
   */
  importSessionData(data: any): void {
    if (data.session) {
      const session = {
        ...data.session,
        activeAgents: new Set(data.session.activeAgents),
        completedTasks: new Map(Object.entries(data.session.completedTasks)),
        sharedContext: new Map(Object.entries(data.session.sharedContext))
      };
      this.sessions.set(session.sessionId, session);
    }

    if (data.knowledge && Array.isArray(data.knowledge)) {
      this.knowledgeBase.push(...data.knowledge);
    }

    this.emit('sessionDataImported', data);
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.stopCleanup();
    this.sessions.clear();
    this.workflows.clear();
    this.metricsHistory.length = 0;
    this.knowledgeBase.length = 0;
    this.removeAllListeners();
  }
}

export default EnhancedQEMemory;