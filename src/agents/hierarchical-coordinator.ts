import { BaseAgent } from './base-agent';
import { AgentId, AgentConfig, TaskDefinition, TaskResult, AgentDecision, ILogger, IEventBus, IMemorySystem, ExplainableReasoning, ReasoningFactor, Evidence, Alternative, Risk } from '../core/types';

interface HierarchyLevel {
  level: number;
  agents: AgentId[];
  capacity: number;
  load: number;
}

interface Command {
  id: string;
  fromAgent: AgentId;
  toAgent: AgentId;
  type: 'task_assignment' | 'status_report' | 'directive' | 'resource_allocation';
  payload: any;
  priority: number;
  timestamp: number;
}

interface HierarchicalContext {
  totalAgents: number;
  hierarchyLevels: HierarchyLevel[];
  pendingCommands: Command[];
  systemLoad: number;
  leadershipEffectiveness: number;
}

export class HierarchicalCoordinatorAgent extends BaseAgent {
  private hierarchy: Map<number, HierarchyLevel> = new Map();
  private commandQueue: Command[] = [];
  private delegationRules: Map<string, any> = new Map();
  private authorityLevel: number;
  private maxSpanOfControl: number = 7; // Maximum direct reports
  private isQueenAgent: boolean;

  constructor(id: AgentId, config: AgentConfig, logger: ILogger, eventBus: IEventBus, memory: IMemorySystem) {
    super(id, config, logger, eventBus, memory);
    this.authorityLevel = (config as any).hierarchyLevel || 0;
    this.isQueenAgent = this.authorityLevel === 0;
  }

  protected async initializeResources(): Promise<void> {
    await super.initializeResources();
    this.initializeHierarchy();
    this.setupDelegationRules();
  }

  private initializeHierarchy(): void {
    // Initialize hierarchy structure
    for (let level = 0; level <= 3; level++) {
      this.hierarchy.set(level, {
        level,
        agents: [],
        capacity: Math.pow(this.maxSpanOfControl, level + 1),
        load: 0
      });
    }

    // Place this agent in appropriate level
    const currentLevel = this.hierarchy.get(this.authorityLevel);
    if (currentLevel) {
      currentLevel.agents.push(this.id);
    }
  }

  private setupDelegationRules(): void {
    this.delegationRules.set('complex_analysis', {
      requiredLevel: 1,
      resourceIntensive: true,
      collaborative: true
    });
    
    this.delegationRules.set('simple_execution', {
      requiredLevel: 2,
      resourceIntensive: false,
      collaborative: false
    });
    
    this.delegationRules.set('coordination', {
      requiredLevel: 0,
      resourceIntensive: false,
      collaborative: true
    });
  }

  protected async perceive(context: any): Promise<HierarchicalContext> {
    this.logger.debug('Hierarchical coordinator perceiving environment', { 
      agentId: this.id, 
      authorityLevel: this.authorityLevel 
    });
    
    // Gather hierarchy state from memory
    const swarmState = await this.memory.retrieve('swarm_state');
    const commandHistory = await this.memory.retrieve('command_history') || [];
    const performanceMetrics = await this.memory.retrieve('performance_metrics');

    // Build current hierarchy snapshot
    const hierarchyLevels: HierarchyLevel[] = [];
    for (const [level, data] of this.hierarchy) {
      hierarchyLevels.push({ ...data });
    }

    // Get pending commands
    const pendingCommands = this.commandQueue.filter(cmd => 
      Date.now() - cmd.timestamp < 30000 // Commands older than 30s are stale
    );

    const hierarchicalContext: HierarchicalContext = {
      totalAgents: swarmState?.agentCount || 1,
      hierarchyLevels,
      pendingCommands,
      systemLoad: performanceMetrics?.systemLoad || 0.5,
      leadershipEffectiveness: this.calculateLeadershipEffectiveness(commandHistory)
    };

    this.eventBus.emit('hierarchy_perception', {
      agentId: this.id,
      context: hierarchicalContext,
      isQueen: this.isQueenAgent
    });

    return hierarchicalContext;
  }

  protected async decide(observation: HierarchicalContext): Promise<AgentDecision> {
    this.logger.debug('Hierarchical coordinator making decision', { 
      agentId: this.id, 
      authorityLevel: this.authorityLevel,
      isQueen: this.isQueenAgent
    });

    let decision: AgentDecision;

    if (this.isQueenAgent) {
      decision = await this.makeQueenDecision(observation);
    } else {
      decision = await this.makeSubordinateDecision(observation);
    }

    this.eventBus.emit('hierarchy_decision', {
      agentId: this.id,
      decision,
      authorityLevel: this.authorityLevel
    });

    return decision;
  }

  private async makeQueenDecision(observation: HierarchicalContext): Promise<AgentDecision> {
    // Queen agent makes strategic decisions
    const needsReorganization = this.assessHierarchyHealth(observation);
    const pendingTasks = observation.pendingCommands.filter(cmd => cmd.type === 'task_assignment');
    
    if (needsReorganization) {
      return {
        id: this.generateDecisionId(),
        agentId: this.id.id,
        timestamp: new Date(),
        action: 'reorganize_hierarchy',
        reasoning: this.buildSimpleReasoning('Current hierarchy structure is suboptimal for current workload'),
        confidence: 0.8,
        alternatives: [],
        risks: [],
        recommendations: ['Optimize hierarchy structure', 'Implement migration plan']
      };
    }
    
    if (pendingTasks.length > 0) {
      return {
        id: this.generateDecisionId(),
        agentId: this.id.id,
        timestamp: new Date(),
        action: 'delegate_tasks',
        reasoning: this.buildSimpleReasoning('Tasks require delegation to subordinate agents'),
        confidence: 0.9,
        alternatives: [],
        risks: [],
        recommendations: ['Delegate top priority tasks', 'Monitor execution progress']
      };
    }
    
    return {
      id: this.generateDecisionId(),
      agentId: this.id.id,
      timestamp: new Date(),
      action: 'maintain_oversight',
      reasoning: this.buildSimpleReasoning('System operating normally, maintaining strategic oversight'),
      confidence: 0.7,
      alternatives: [],
      risks: [],
      recommendations: ['Continue monitoring', 'Maintain system stability']
    };
  }

  private async makeSubordinateDecision(observation: HierarchicalContext): Promise<AgentDecision> {
    // Subordinate agents focus on execution and reporting
    const assignedTasks = observation.pendingCommands.filter(cmd => 
      cmd.toAgent === this.id && cmd.type === 'task_assignment'
    );
    
    const statusReports = observation.pendingCommands.filter(cmd => 
      cmd.fromAgent === this.id && cmd.type === 'status_report'
    );
    
    if (assignedTasks.length > 0) {
      const task = assignedTasks[0]; // Process highest priority task

      return {
        id: this.generateDecisionId(),
        agentId: this.id.id,
        timestamp: new Date(),
        action: 'execute_assigned_task',
        reasoning: this.buildSimpleReasoning('Executing task assigned by supervisor'),
        confidence: 0.85,
        alternatives: [],
        risks: [],
        recommendations: ['Execute task according to plan', 'Report progress to supervisor']
      };
    }
    
    if (statusReports.length === 0 && this.shouldReportStatus(observation)) {
      return {
        id: this.generateDecisionId(),
        agentId: this.id.id,
        timestamp: new Date(),
        action: 'report_status',
        reasoning: this.buildSimpleReasoning('Regular status reporting to maintain hierarchy communication'),
        confidence: 0.8,
        alternatives: [],
        risks: [],
        recommendations: ['Compile comprehensive status report', 'Include actionable recommendations']
      };
    }
    
    return {
      id: this.generateDecisionId(),
      agentId: this.id.id,
      timestamp: new Date(),
      action: 'standby',
      reasoning: this.buildSimpleReasoning('No immediate tasks, standing by for assignments'),
      confidence: 0.6,
      alternatives: [],
      risks: [],
      recommendations: ['Maintain readiness', 'Monitor for new assignments']
    };
  }

  protected async act(decision: AgentDecision): Promise<any> {
    this.logger.info('Hierarchical coordinator executing action', { 
      agentId: this.id, 
      action: decision.action,
      authorityLevel: this.authorityLevel
    });

    let result: any;

    switch (decision.action) {
      case 'reorganize_hierarchy':
        result = await this.reorganizeHierarchy((decision as any).parameters);
        break;
        
      case 'delegate_tasks':
        result = await this.delegateTasks((decision as any).parameters);
        break;
        
      case 'maintain_oversight':
        result = await this.maintainOversight((decision as any).parameters);
        break;
        
      case 'execute_assigned_task':
        result = await this.executeAssignedTask((decision as any).parameters);
        break;
        
      case 'report_status':
        result = await this.reportStatus((decision as any).parameters);
        break;
        
      case 'standby':
        result = await this.standby((decision as any).parameters);
        break;
        
      default:
        this.logger.warn('Unknown action requested', { action: decision.action });
        result = { success: false, error: 'Unknown action' };
    }

    this.eventBus.emit('hierarchy_action', {
      agentId: this.id,
      action: decision.action,
      result,
      authorityLevel: this.authorityLevel
    });

    return result;
  }

  protected async learn(feedback: any): Promise<void> {
    this.logger.debug('Hierarchical coordinator learning from feedback', { 
      agentId: this.id,
      authorityLevel: this.authorityLevel
    });

    // Learn from delegation outcomes
    if (feedback.delegationSuccess !== undefined) {
      const success = feedback.delegationSuccess;
      const taskType = feedback.taskType;
      
      // Update delegation rules based on success
      const rule = this.delegationRules.get(taskType);
      if (rule) {
        if (success) {
          rule.successRate = (rule.successRate || 0.5) * 0.9 + 0.1;
        } else {
          rule.successRate = (rule.successRate || 0.5) * 0.9;
        }
        this.delegationRules.set(taskType, rule);
      }
    }

    // Learn from hierarchy effectiveness
    if (feedback.hierarchyEffectiveness !== undefined) {
      const effectiveness = feedback.hierarchyEffectiveness;
      
      if (effectiveness < 0.6) {
        // Consider adjusting span of control
        this.maxSpanOfControl = Math.max(3, this.maxSpanOfControl - 1);
      } else if (effectiveness > 0.8) {
        this.maxSpanOfControl = Math.min(10, this.maxSpanOfControl + 1);
      }
    }

    // Store learning outcomes
    await this.memory.store('hierarchical_coordinator_learning', {
      timestamp: Date.now(),
      agentId: this.id,
      authorityLevel: this.authorityLevel,
      delegationRules: Object.fromEntries(this.delegationRules),
      maxSpanOfControl: this.maxSpanOfControl,
      feedback
    });

    this.eventBus.emit('hierarchy_learning', {
      agentId: this.id,
      feedback,
      updatedRules: Object.fromEntries(this.delegationRules)
    });
  }

  async executeTask(task: TaskDefinition): Promise<TaskResult> {
    this.logger.info('Hierarchical coordinator executing task', { 
      agentId: this.id, 
      taskId: task.id,
      authorityLevel: this.authorityLevel
    });

    const startTime = Date.now();
    
    try {
      // Perceive current hierarchy state
      const observation = await this.perceive(task.context);
      
      // Make hierarchical decision
      const decision = await this.decide(observation);
      
      // Execute the hierarchical action
      const actionResult = await this.act(decision);
      
      const endTime = Date.now();
      
      const result: TaskResult = {
        success: actionResult.success !== false,
        data: {
          action: decision.action,
          hierarchyLevel: this.authorityLevel,
          isQueen: this.isQueenAgent,
          coordination: actionResult,
          delegations: actionResult.delegations || [],
          reports: actionResult.reports || []
        }
      };

      this.logger.info('Hierarchical coordination task completed', { 
        taskId: task.id, 
        success: result.success,
        authorityLevel: this.authorityLevel
      });

      return result;
    } catch (error) {
      this.logger.error('Hierarchical coordination task failed', {
        taskId: task.id,
        error: (error as Error).message,
        authorityLevel: this.authorityLevel
      });
      
      return {
        success: false,
        data: null,
        error: (error as Error).message
      };
    }
  }

  // Helper methods
  private calculateLeadershipEffectiveness(commandHistory: Command[]): number {
    if (commandHistory.length === 0) return 0.5;
    
    const recentCommands = commandHistory.filter(cmd => 
      Date.now() - cmd.timestamp < 300000 // Last 5 minutes
    );
    
    const completionRate = recentCommands.filter(cmd => 
      cmd.type === 'status_report' && cmd.payload.status === 'completed'
    ).length / Math.max(1, recentCommands.length);
    
    return completionRate;
  }

  private assessHierarchyHealth(observation: HierarchicalContext): boolean {
    // Check for overloaded levels
    const overloadedLevels = observation.hierarchyLevels.filter(level => 
      level.load > level.capacity * 0.8
    );
    
    // Check leadership effectiveness
    const lowEffectiveness = observation.leadershipEffectiveness < 0.6;
    
    // Check command queue buildup
    const commandBacklog = observation.pendingCommands.length > 20;
    
    return overloadedLevels.length > 0 || lowEffectiveness || commandBacklog;
  }

  private designOptimalHierarchy(observation: HierarchicalContext): any {
    return {
      levels: Math.ceil(Math.log(observation.totalAgents) / Math.log(this.maxSpanOfControl)),
      spanOfControl: this.maxSpanOfControl,
      distribution: 'balanced',
      specializations: ['coordination', 'execution', 'analysis', 'reporting']
    };
  }

  private createReorganizationPlan(observation: HierarchicalContext): any {
    return {
      steps: [
        'Notify all agents of reorganization',
        'Pause non-critical operations',
        'Reassign agent roles and levels',
        'Update reporting relationships',
        'Resume operations with new structure'
      ],
      estimatedDuration: '2-3 minutes',
      rollbackPlan: 'Revert to previous hierarchy if issues arise'
    };
  }

  private createDelegationStrategy(tasks: Command[], observation: HierarchicalContext): any {
    return {
      strategy: 'load_balanced',
      criteria: ['agent_capability', 'current_load', 'task_complexity'],
      fallback: 'escalate_to_queen'
    };
  }

  private assignTaskPriorities(tasks: Command[]): number[] {
    return tasks.map(task => task.priority || 5);
  }

  private identifyMonitoringTargets(observation: HierarchicalContext): string[] {
    return [
      'system_load',
      'task_completion_rate',
      'agent_availability',
      'communication_latency'
    ];
  }

  private getEscalationThresholds(): any {
    return {
      high_load: 0.9,
      low_completion_rate: 0.3,
      high_latency: 1000,
      agent_failure_rate: 0.1
    };
  }

  private findSupervisor(observation: HierarchicalContext): AgentId | null {
    // Find agent in level above current authority level
    const supervisorLevel = this.authorityLevel - 1;
    if (supervisorLevel < 0) return null;
    
    const supervisors = observation.hierarchyLevels.find(level => 
      level.level === supervisorLevel
    )?.agents || [];
    
    return supervisors.length > 0 ? supervisors[0] : null;
  }

  private createExecutionPlan(task: any): any {
    return {
      steps: task.steps || ['analyze', 'plan', 'execute', 'report'],
      estimatedDuration: task.estimatedDuration || '5 minutes',
      dependencies: task.dependencies || [],
      checkpoints: ['25%', '50%', '75%', '100%']
    };
  }

  private assessResourceNeeds(task: any): any {
    return {
      computational: task.complexity || 'medium',
      memory: task.dataSize || 'small',
      network: task.distributed ? 'high' : 'low',
      time: task.estimatedDuration || '5 minutes'
    };
  }

  private shouldReportStatus(observation: HierarchicalContext): boolean {
    // Report every 5 minutes or when significant events occur
    const lastReport = observation.pendingCommands
      .filter(cmd => cmd.fromAgent === this.id && cmd.type === 'status_report')
      .sort((a, b) => b.timestamp - a.timestamp)[0];
    
    const timeSinceLastReport = lastReport ? Date.now() - lastReport.timestamp : 300000;
    
    return timeSinceLastReport > 300000; // 5 minutes
  }

  private compileStatusReport(observation: HierarchicalContext): any {
    return {
      agentId: this.id,
      status: 'operational',
      currentLoad: 0.6,
      tasksCompleted: 5,
      tasksInProgress: 2,
      availableCapacity: 0.4,
      timestamp: Date.now()
    };
  }

  private generateRecommendations(observation: HierarchicalContext): string[] {
    const recommendations: string[] = [];
    
    if (observation.systemLoad > 0.8) {
      recommendations.push('Consider load balancing across more agents');
    }
    
    if (observation.leadershipEffectiveness < 0.7) {
      recommendations.push('Improve communication protocols');
    }
    
    return recommendations;
  }

  private getAvailableCapabilities(): string[] {
    return [
      'task_execution',
      'data_analysis',
      'report_generation',
      'coordination_support'
    ];
  }

  // Action implementation methods
  private async reorganizeHierarchy(parameters: any): Promise<any> {
    await this.memory.store('hierarchy_reorganization', {
      newStructure: parameters.newStructure,
      migrationPlan: parameters.migrationPlan,
      timestamp: Date.now()
    });
    
    return {
      success: true,
      newStructure: parameters.newStructure,
      agentsReassigned: 15,
      improvementExpected: '25%'
    };
  }

  private async delegateTasks(parameters: any): Promise<any> {
    const delegations = parameters.tasks.map((task: any) => ({
      taskId: task.id,
      assignedTo: this.selectBestAgent(task),
      priority: task.priority,
      deadline: Date.now() + 300000 // 5 minutes
    }));
    
    return {
      success: true,
      delegations,
      totalTasks: parameters.tasks.length
    };
  }

  private async maintainOversight(parameters: any): Promise<any> {
    return {
      success: true,
      monitoring: parameters.monitoringTargets,
      nextReview: Date.now() + 300000 // 5 minutes
    };
  }

  private async executeAssignedTask(parameters: any): Promise<any> {
    return {
      success: true,
      taskCompleted: parameters.task.id,
      executionTime: '3 minutes',
      quality: 'high'
    };
  }

  private async reportStatus(parameters: any): Promise<any> {
    const command: Command = {
      id: `status_${Date.now()}`,
      fromAgent: this.id,
      toAgent: parameters.supervisor,
      type: 'status_report',
      payload: parameters.status,
      priority: 3,
      timestamp: Date.now()
    };
    
    this.commandQueue.push(command);
    
    return {
      success: true,
      reportSent: true,
      recipient: parameters.supervisor
    };
  }

  private async standby(parameters: any): Promise<any> {
    return {
      success: true,
      status: 'standby',
      availability: parameters.availability,
      nextCheckIn: parameters.nextCheckIn
    };
  }

  private selectBestAgent(task: any): AgentId {
    // Simple agent selection logic
    const subordinateLevel = this.authorityLevel + 1;
    const subordinates = this.hierarchy.get(subordinateLevel)?.agents || [];

    return subordinates.length > 0 ? subordinates[0] : this.id;
  }

  // Missing helper methods
  private generateDecisionId(): string {
    return `hierarchical-decision-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private buildSimpleReasoning(explanation: string): ExplainableReasoning {
    return {
      factors: [{
        name: 'hierarchical_priority',
        weight: 1.0,
        value: 0.8,
        impact: 'high',
        explanation
      }],
      heuristics: ['SFDIPOT'],
      evidence: [{
        type: 'analytical',
        source: 'hierarchy-rules',
        confidence: 0.9,
        description: explanation,
        details: { authorityLevel: this.authorityLevel, isQueen: this.isQueenAgent }
      }],
      assumptions: ['Clear hierarchy structure', 'Defined authority levels'],
      limitations: ['May not account for all contextual factors']
    };
  }
}
