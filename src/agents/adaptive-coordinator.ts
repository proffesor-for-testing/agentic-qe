import { BaseAgent } from './base-agent';
import { AgentId, AgentConfig, TaskDefinition, TaskResult, AgentDecision, ILogger, IEventBus, IMemorySystem } from '../core/types';

interface TopologyMetrics {
  latency: number;
  throughput: number;
  reliability: number;
  adaptability: number;
}

interface TopologyStrategy {
  name: 'mesh' | 'hierarchical' | 'ring' | 'star';
  score: number;
  conditions: string[];
}

interface AdaptationContext {
  currentTopology: string;
  agentCount: number;
  taskComplexity: number;
  networkLoad: number;
  errorRate: number;
  metrics: TopologyMetrics;
}

export class AdaptiveCoordinatorAgent extends BaseAgent {
  private topologyStrategies: Map<string, TopologyStrategy> = new Map();
  private adaptationThreshold: number = 0.7;
  private learningRate: number = 0.1;
  private adaptationHistory: Array<{ timestamp: number; from: string; to: string; reason: string }> = [];

  constructor(id: AgentId, config: AgentConfig, logger: ILogger, eventBus: IEventBus, memory: IMemorySystem) {
    super(id, config, logger, eventBus, memory);
    this.initializeStrategies();
  }

  private initializeStrategies(): void {
    this.topologyStrategies.set('mesh', {
      name: 'mesh',
      score: 0.8,
      conditions: ['high_reliability', 'peer_to_peer', 'fault_tolerance']
    });
    
    this.topologyStrategies.set('hierarchical', {
      name: 'hierarchical',
      score: 0.7,
      conditions: ['complex_coordination', 'clear_leadership', 'structured_tasks']
    });
    
    this.topologyStrategies.set('ring', {
      name: 'ring',
      score: 0.6,
      conditions: ['sequential_processing', 'ordered_tasks', 'token_passing']
    });
    
    this.topologyStrategies.set('star', {
      name: 'star',
      score: 0.5,
      conditions: ['centralized_control', 'simple_coordination', 'broadcast_tasks']
    });
  }

  protected async perceive(context: any): Promise<AdaptationContext> {
    this.logger.debug('Adaptive coordinator perceiving environment', { agentId: this.id });
    
    // Gather metrics from swarm state
    const swarmState = await this.memory.retrieve('swarm_state');
    const performanceMetrics = await this.memory.retrieve('performance_metrics');
    
    const adaptationContext: AdaptationContext = {
      currentTopology: swarmState?.topology || 'mesh',
      agentCount: swarmState?.agentCount || 1,
      taskComplexity: context.taskComplexity || 0.5,
      networkLoad: performanceMetrics?.networkLoad || 0.5,
      errorRate: performanceMetrics?.errorRate || 0.0,
      metrics: {
        latency: performanceMetrics?.latency || 100,
        throughput: performanceMetrics?.throughput || 0.8,
        reliability: performanceMetrics?.reliability || 0.9,
        adaptability: performanceMetrics?.adaptability || 0.7
      }
    };

    this.eventBus.emit('coordination_perception', {
      agentId: this.id,
      context: adaptationContext
    });

    return adaptationContext;
  }

  protected async decide(observation: AdaptationContext): Promise<AgentDecision> {
    this.logger.debug('Adaptive coordinator making decision', { 
      agentId: this.id, 
      currentTopology: observation.currentTopology 
    });

    // Evaluate current topology performance
    const currentPerformance = this.evaluateTopologyPerformance(observation);
    
    // Find optimal topology based on current conditions
    const optimalTopology = this.findOptimalTopology(observation);
    
    let decision: AgentDecision;
    
    if (optimalTopology.name !== observation.currentTopology && 
        optimalTopology.score > currentPerformance + this.adaptationThreshold) {
      
      decision = {
        id: `decision-${Date.now()}`,
        agentId: this.id.id,
        timestamp: new Date(),
        action: 'adapt_topology',
        confidence: optimalTopology.score,
        reasoning: {
          factors: [{
            name: 'performance_gap',
            weight: 0.8,
            impact: 'high',
            explanation: `Performance improvement: ${optimalTopology.score.toFixed(2)} vs ${currentPerformance.toFixed(2)}`
          }],
          heuristics: ['topology_optimization', 'performance_analysis'],
          evidence: [{
            type: 'analytical',
            source: 'performance_metrics',
            confidence: 0.85,
            description: 'Performance metrics analysis showing topology improvement opportunity'
          }]
        },
        alternatives: [],
        risks: [],
        recommendations: [`Migrate from ${observation.currentTopology} to ${optimalTopology.name}`]
      };
    } else {
      decision = {
        id: `decision-${Date.now()}`,
        agentId: this.id.id,
        timestamp: new Date(),
        action: 'maintain_topology',
        confidence: currentPerformance,
        reasoning: {
          factors: [{
            name: 'current_performance',
            weight: 0.9,
            impact: 'positive',
            explanation: 'Current topology performance is satisfactory'
          }],
          heuristics: ['performance_monitoring', 'stability'],
          evidence: [{
            type: 'empirical',
            source: 'performance_history',
            confidence: 0.9,
            description: 'Current topology meets performance requirements'
          }]
        },
        alternatives: [],
        risks: [],
        recommendations: ['Continue monitoring performance']
      };
    }

    this.eventBus.emit('coordination_decision', {
      agentId: this.id,
      decision,
      observation
    });

    return decision;
  }

  protected async act(decision: AgentDecision): Promise<any> {
    this.logger.info('Adaptive coordinator executing action', { 
      agentId: this.id, 
      action: decision.action 
    });

    let result: any;

    switch (decision.action) {
      case 'adapt_topology':
        result = await this.adaptTopology({ action: decision.action });
        this.recordAdaptation({ action: decision.action });
        break;
        
      case 'maintain_topology':
        result = await this.optimizeCurrentTopology({ action: decision.action });
        break;
        
      default:
        this.logger.warn('Unknown action requested', { action: decision.action });
        result = { success: false, error: 'Unknown action' };
    }

    this.eventBus.emit('coordination_action', {
      agentId: this.id,
      action: decision.action,
      result
    });

    return result;
  }

  protected async learn(feedback: any): Promise<void> {
    this.logger.debug('Adaptive coordinator learning from feedback', { agentId: this.id });

    if (feedback.adaptationSuccess !== undefined) {
      const adaptation = feedback.adaptation;
      const success = feedback.adaptationSuccess;
      
      // Update strategy scores based on adaptation success
      const strategy = this.topologyStrategies.get(adaptation.toTopology);
      if (strategy) {
        const adjustment = success ? this.learningRate : -this.learningRate;
        strategy.score = Math.max(0.1, Math.min(1.0, strategy.score + adjustment));
        this.topologyStrategies.set(adaptation.toTopology, strategy);
      }
      
      // Adjust adaptation threshold based on outcomes
      if (success) {
        this.adaptationThreshold = Math.max(0.1, this.adaptationThreshold - 0.05);
      } else {
        this.adaptationThreshold = Math.min(0.9, this.adaptationThreshold + 0.05);
      }
    }

    // Store learning outcomes in memory
    await this.memory.store('adaptive_coordinator_learning', {
      timestamp: Date.now(),
      strategies: Object.fromEntries(this.topologyStrategies),
      adaptationThreshold: this.adaptationThreshold,
      feedback
    });

    this.eventBus.emit('coordination_learning', {
      agentId: this.id,
      feedback,
      updatedStrategies: Object.fromEntries(this.topologyStrategies)
    });
  }

  async executeTask(task: TaskDefinition): Promise<TaskResult> {
    this.logger.info('Adaptive coordinator executing task', { 
      agentId: this.id, 
      taskId: task.id 
    });

    const startTime = Date.now();
    
    try {
      // Perceive current swarm state
      const observation = await this.perceive(task.context);
      
      // Decide on adaptation strategy
      const decision = await this.decide(observation);
      
      // Execute the adaptation or optimization
      const actionResult = await this.act(decision);
      
      const endTime = Date.now();
      
      const result: TaskResult = {
        success: actionResult.success !== false,
        data: {
          action: decision.action,
          adaptation: { action: decision.action },
          performance: actionResult.performance || {},
          recommendations: actionResult.recommendations || []
        }
      };

      this.logger.info('Adaptive coordination task completed', { 
        taskId: task.id, 
        success: result.success 
      });

      return result;
    } catch (error) {
      this.logger.error('Adaptive coordination task failed', {
        taskId: task.id,
        error: (error as Error).message
      });

      return {
        success: false,
        error: (error as Error).message
      };
    }
  }

  private evaluateTopologyPerformance(context: AdaptationContext): number {
    const weights = {
      latency: 0.3,
      throughput: 0.3,
      reliability: 0.2,
      adaptability: 0.2
    };
    
    // Normalize metrics to 0-1 scale
    const normalizedLatency = Math.max(0, 1 - (context.metrics.latency / 1000));
    const normalizedThroughput = context.metrics.throughput;
    const normalizedReliability = context.metrics.reliability;
    const normalizedAdaptability = context.metrics.adaptability;
    
    return weights.latency * normalizedLatency +
           weights.throughput * normalizedThroughput +
           weights.reliability * normalizedReliability +
           weights.adaptability * normalizedAdaptability;
  }

  private findOptimalTopology(context: AdaptationContext): TopologyStrategy {
    let bestStrategy = this.topologyStrategies.get('mesh')!;
    let bestScore = 0;
    
    for (const [_, strategy] of this.topologyStrategies) {
      const contextualScore = this.calculateContextualScore(strategy, context);
      if (contextualScore > bestScore) {
        bestScore = contextualScore;
        bestStrategy = { ...strategy, score: contextualScore };
      }
    }
    
    return bestStrategy;
  }

  private calculateContextualScore(strategy: TopologyStrategy, context: AdaptationContext): number {
    let score = strategy.score;
    
    // Adjust score based on context
    if (context.agentCount > 10 && strategy.name === 'mesh') {
      score += 0.2; // Mesh scales well with many agents
    }
    
    if (context.taskComplexity > 0.8 && strategy.name === 'hierarchical') {
      score += 0.15; // Hierarchical good for complex coordination
    }
    
    if (context.errorRate > 0.1 && strategy.name === 'mesh') {
      score += 0.1; // Mesh provides fault tolerance
    }
    
    if (context.networkLoad > 0.8 && strategy.name === 'star') {
      score -= 0.2; // Star creates bottlenecks under high load
    }
    
    return Math.max(0.1, Math.min(1.0, score));
  }

  private createMigrationPlan(fromTopology: string, toTopology: string): any {
    return {
      steps: [
        'Notify all agents of topology change',
        'Gracefully drain current connections',
        'Reconfigure agent connections',
        'Establish new topology structure',
        'Verify connectivity and performance'
      ],
      estimatedDuration: '30-60 seconds',
      rollbackPlan: `Revert to ${fromTopology} if migration fails`
    };
  }

  private suggestOptimizations(context: AdaptationContext): string[] {
    const optimizations: string[] = [];
    
    if (context.metrics.latency > 500) {
      optimizations.push('Reduce message routing hops');
    }
    
    if (context.metrics.throughput < 0.7) {
      optimizations.push('Implement connection pooling');
    }
    
    if (context.errorRate > 0.05) {
      optimizations.push('Add redundant communication paths');
    }
    
    return optimizations;
  }

  private async adaptTopology(parameters: any): Promise<any> {
    // Simulate topology adaptation
    await this.memory.store('topology_migration', {
      fromTopology: parameters.fromTopology,
      toTopology: parameters.toTopology,
      migrationPlan: parameters.migrationPlan,
      timestamp: Date.now()
    });
    
    return {
      success: true,
      newTopology: parameters.toTopology,
      migrationTime: '45 seconds',
      performance: {
        latencyImprovement: '15%',
        throughputImprovement: '22%'
      }
    };
  }

  private async optimizeCurrentTopology(parameters: any): Promise<any> {
    return {
      success: true,
      topology: parameters.topology,
      optimizations: parameters.optimizations,
      performance: {
        improvement: '8%'
      }
    };
  }

  private recordAdaptation(parameters: any): void {
    this.adaptationHistory.push({
      timestamp: Date.now(),
      from: parameters.fromTopology,
      to: parameters.toTopology,
      reason: parameters.reason
    });
    
    // Keep only last 50 adaptations
    if (this.adaptationHistory.length > 50) {
      this.adaptationHistory = this.adaptationHistory.slice(-50);
    }
  }
}
