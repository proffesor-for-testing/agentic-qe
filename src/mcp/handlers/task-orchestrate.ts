/**
 * Task Orchestration Handler
 *
 * Handles complex task orchestration across multiple agents.
 * Coordinates workflows and manages task dependencies.
 *
 * @version 1.0.0
 * @author Agentic QE Team
 */

import { BaseHandler, HandlerResponse } from './base-handler.js';
import { AgentRegistry } from '../services/AgentRegistry.js';
import { HookExecutor } from '../services/HookExecutor.js';
import { SecureRandom } from '../../utils/SecureRandom.js';

export interface TaskOrchestrateArgs {
  task: {
    type: 'comprehensive-testing' | 'quality-gate' | 'defect-prevention' | 'performance-validation';
    priority: 'low' | 'medium' | 'high' | 'critical';
    strategy: 'parallel' | 'sequential' | 'adaptive';
    maxAgents?: number;
    timeoutMinutes?: number;
  };
  context?: {
    project?: string;
    branch?: string;
    environment?: string;
    requirements?: string[];
  };
  fleetId?: string;
}

export interface TaskOrchestration {
  id: string;
  type: string;
  priority: string;
  strategy: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  workflow: WorkflowStep[];
  assignments: AgentTaskAssignment[];
  progress: TaskProgress;
  results: OrchestrationResults;
  timeline: TaskEvent[];
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface WorkflowStep {
  id: string;
  name: string;
  type: string;
  dependencies: string[];
  estimatedDuration: number;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  assignedAgent?: string;
  results?: any;
}

export interface AgentTaskAssignment {
  agentId: string;
  agentType: string;
  tasks: string[];
  status: 'assigned' | 'running' | 'completed' | 'failed';
  startedAt?: string;
  completedAt?: string;
}

export interface TaskProgress {
  overall: number;
  byStep: Record<string, number>;
  completedSteps: number;
  totalSteps: number;
  estimatedCompletion: string;
}

export interface OrchestrationResults {
  summary: {
    success: boolean;
    completedSteps: number;
    failedSteps: number;
    totalDuration: number;
  };
  stepResults: StepResult[];
  artifacts: OrchestrationArtifact[];
  metrics: OrchestrationMetrics;
}

export interface StepResult {
  stepId: string;
  stepName: string;
  status: 'completed' | 'failed' | 'skipped';
  duration: number;
  output: any;
  errors?: string[];
}

export interface OrchestrationArtifact {
  type: string;
  name: string;
  path: string;
  size: number;
  stepId: string;
}

export interface OrchestrationMetrics {
  parallelismEfficiency: number;
  resourceUtilization: number;
  coordinationOverhead: number;
  agentUtilization: Record<string, number>;
}

export interface TaskEvent {
  timestamp: string;
  type: 'created' | 'started' | 'step-completed' | 'step-failed' | 'completed' | 'failed';
  description: string;
  stepId?: string;
  agentId?: string;
}

export class TaskOrchestrateHandler extends BaseHandler {
  private activeOrchestrations: Map<string, TaskOrchestration> = new Map();
  private workflowTemplates: Map<string, WorkflowStep[]> = new Map();
  private registry: AgentRegistry;
  private hookExecutor: HookExecutor;

  constructor(registry: AgentRegistry, hookExecutor: HookExecutor) {
    super();
    this.registry = registry;
    this.hookExecutor = hookExecutor;
    this.initializeWorkflowTemplates();
  }

  async handle(args: TaskOrchestrateArgs): Promise<HandlerResponse> {
    const requestId = this.generateRequestId();
    this.log('info', 'Starting task orchestration', { requestId, task: args.task });

    try {
      // Execute pre-task hook
      await this.hookExecutor.executePreTask({
        description: `Orchestrate ${args.task.type} with ${args.task.strategy} strategy`,
        agentType: 'task-orchestrator'
      });

      // Validate required parameters
      this.validateRequired(args, ['task']);
      this.validateTaskSpec(args.task);

      const { result: orchestration, executionTime } = await this.measureExecutionTime(
        () => this.orchestrateTask(args)
      );

      // Execute post-task hook
      await this.hookExecutor.executePostTask({
        taskId: orchestration.id,
        results: {
          orchestrationId: orchestration.id,
          type: orchestration.type,
          status: orchestration.status,
          stepsCount: orchestration.workflow.length,
          agentsAssigned: orchestration.assignments.length
        }
      });

      this.log('info', `Task orchestration created in ${executionTime.toFixed(2)}ms`, {
        orchestrationId: orchestration.id,
        type: orchestration.type,
        stepsCount: orchestration.workflow.length
      });

      return this.createSuccessResponse(orchestration, requestId);
    } catch (error) {
      this.log('error', 'Task orchestration failed', {
        error: error instanceof Error ? error.message : String(error)
      });
      return this.createErrorResponse(
        error instanceof Error ? error.message : 'Task orchestration failed',
        requestId
      );
    }
  }

  private initializeWorkflowTemplates(): void {
    // Comprehensive Testing Workflow
    this.workflowTemplates.set('comprehensive-testing', [
      {
        id: 'analyze-code',
        name: 'Analyze Codebase',
        type: 'analysis',
        dependencies: [],
        estimatedDuration: 300, // 5 minutes
        status: 'pending'
      },
      {
        id: 'generate-unit-tests',
        name: 'Generate Unit Tests',
        type: 'test-generation',
        dependencies: ['analyze-code'],
        estimatedDuration: 600, // 10 minutes
        status: 'pending'
      },
      {
        id: 'generate-integration-tests',
        name: 'Generate Integration Tests',
        type: 'test-generation',
        dependencies: ['analyze-code'],
        estimatedDuration: 900, // 15 minutes
        status: 'pending'
      },
      {
        id: 'execute-unit-tests',
        name: 'Execute Unit Tests',
        type: 'test-execution',
        dependencies: ['generate-unit-tests'],
        estimatedDuration: 180, // 3 minutes
        status: 'pending'
      },
      {
        id: 'execute-integration-tests',
        name: 'Execute Integration Tests',
        type: 'test-execution',
        dependencies: ['generate-integration-tests'],
        estimatedDuration: 600, // 10 minutes
        status: 'pending'
      },
      {
        id: 'analyze-coverage',
        name: 'Analyze Test Coverage',
        type: 'coverage-analysis',
        dependencies: ['execute-unit-tests', 'execute-integration-tests'],
        estimatedDuration: 120, // 2 minutes
        status: 'pending'
      },
      {
        id: 'generate-report',
        name: 'Generate Comprehensive Report',
        type: 'reporting',
        dependencies: ['analyze-coverage'],
        estimatedDuration: 180, // 3 minutes
        status: 'pending'
      }
    ]);

    // Quality Gate Workflow
    this.workflowTemplates.set('quality-gate', [
      {
        id: 'collect-metrics',
        name: 'Collect Quality Metrics',
        type: 'metrics-collection',
        dependencies: [],
        estimatedDuration: 120,
        status: 'pending'
      },
      {
        id: 'evaluate-thresholds',
        name: 'Evaluate Quality Thresholds',
        type: 'threshold-evaluation',
        dependencies: ['collect-metrics'],
        estimatedDuration: 60,
        status: 'pending'
      },
      {
        id: 'security-scan',
        name: 'Security Vulnerability Scan',
        type: 'security-analysis',
        dependencies: [],
        estimatedDuration: 300,
        status: 'pending'
      },
      {
        id: 'performance-check',
        name: 'Performance Validation',
        type: 'performance-testing',
        dependencies: [],
        estimatedDuration: 600,
        status: 'pending'
      },
      {
        id: 'gate-decision',
        name: 'Make Quality Gate Decision',
        type: 'decision-making',
        dependencies: ['evaluate-thresholds', 'security-scan', 'performance-check'],
        estimatedDuration: 30,
        status: 'pending'
      }
    ]);

    // Defect Prevention Workflow
    this.workflowTemplates.set('defect-prevention', [
      {
        id: 'analyze-changes',
        name: 'Analyze Code Changes',
        type: 'change-analysis',
        dependencies: [],
        estimatedDuration: 180,
        status: 'pending'
      },
      {
        id: 'predict-defects',
        name: 'Predict Potential Defects',
        type: 'defect-prediction',
        dependencies: ['analyze-changes'],
        estimatedDuration: 300,
        status: 'pending'
      },
      {
        id: 'generate-preventive-tests',
        name: 'Generate Preventive Tests',
        type: 'test-generation',
        dependencies: ['predict-defects'],
        estimatedDuration: 420,
        status: 'pending'
      },
      {
        id: 'code-review-recommendations',
        name: 'Generate Code Review Recommendations',
        type: 'review-guidance',
        dependencies: ['predict-defects'],
        estimatedDuration: 120,
        status: 'pending'
      },
      {
        id: 'execute-preventive-tests',
        name: 'Execute Preventive Tests',
        type: 'test-execution',
        dependencies: ['generate-preventive-tests'],
        estimatedDuration: 240,
        status: 'pending'
      }
    ]);

    // Performance Validation Workflow
    this.workflowTemplates.set('performance-validation', [
      {
        id: 'baseline-measurement',
        name: 'Measure Performance Baseline',
        type: 'performance-testing',
        dependencies: [],
        estimatedDuration: 300,
        status: 'pending'
      },
      {
        id: 'load-testing',
        name: 'Execute Load Tests',
        type: 'performance-testing',
        dependencies: ['baseline-measurement'],
        estimatedDuration: 900,
        status: 'pending'
      },
      {
        id: 'stress-testing',
        name: 'Execute Stress Tests',
        type: 'performance-testing',
        dependencies: ['baseline-measurement'],
        estimatedDuration: 600,
        status: 'pending'
      },
      {
        id: 'analyze-bottlenecks',
        name: 'Analyze Performance Bottlenecks',
        type: 'performance-analysis',
        dependencies: ['load-testing', 'stress-testing'],
        estimatedDuration: 240,
        status: 'pending'
      },
      {
        id: 'generate-optimization-recommendations',
        name: 'Generate Optimization Recommendations',
        type: 'recommendation-generation',
        dependencies: ['analyze-bottlenecks'],
        estimatedDuration: 180,
        status: 'pending'
      }
    ]);
  }

  private validateTaskSpec(task: any): void {
    const validTypes = ['comprehensive-testing', 'quality-gate', 'defect-prevention', 'performance-validation'];
    if (!validTypes.includes(task.type)) {
      throw new Error(`Invalid task type: ${task.type}. Must be one of: ${validTypes.join(', ')}`);
    }

    const validPriorities = ['low', 'medium', 'high', 'critical'];
    if (!validPriorities.includes(task.priority)) {
      throw new Error(`Invalid priority: ${task.priority}. Must be one of: ${validPriorities.join(', ')}`);
    }

    const validStrategies = ['parallel', 'sequential', 'adaptive'];
    if (!validStrategies.includes(task.strategy)) {
      throw new Error(`Invalid strategy: ${task.strategy}. Must be one of: ${validStrategies.join(', ')}`);
    }
  }

  private async orchestrateTask(args: TaskOrchestrateArgs): Promise<TaskOrchestration> {
    const orchestrationId = `orchestration-${Date.now()}-${SecureRandom.generateId(6)}`;

    // Get workflow template
    const workflowTemplate = this.workflowTemplates.get(args.task.type);
    if (!workflowTemplate) {
      throw new Error(`No workflow template found for task type: ${args.task.type}`);
    }

    // Create workflow steps
    const workflow = this.createWorkflowSteps(workflowTemplate, args);

    // Create orchestration
    const orchestration: TaskOrchestration = {
      id: orchestrationId,
      type: args.task.type,
      priority: args.task.priority,
      strategy: args.task.strategy,
      status: 'pending',
      workflow,
      assignments: [],
      progress: this.createInitialProgress(workflow),
      results: this.createEmptyResults(),
      timeline: [{
        timestamp: new Date().toISOString(),
        type: 'created',
        description: `Task orchestration created: ${args.task.type}`
      }],
      createdAt: new Date().toISOString()
    };

    // Store orchestration
    this.activeOrchestrations.set(orchestrationId, orchestration);

    // Start orchestration
    await this.startOrchestration(orchestration, args);

    return orchestration;
  }

  private createWorkflowSteps(template: WorkflowStep[], args: TaskOrchestrateArgs): WorkflowStep[] {
    return template.map(step => ({
      ...step,
      id: `${step.id}-${Date.now()}`,
      status: 'pending'
    }));
  }

  private async startOrchestration(orchestration: TaskOrchestration, args: TaskOrchestrateArgs): Promise<void> {
    orchestration.status = 'running';
    orchestration.startedAt = new Date().toISOString();

    this.addTimelineEvent(orchestration, 'started', 'Task orchestration started');

    // Assign agents based on strategy
    orchestration.assignments = await this.assignAgents(orchestration, args);

    // Execute workflow based on strategy
    if (args.task.strategy === 'parallel') {
      await this.executeParallelWorkflow(orchestration);
    } else if (args.task.strategy === 'sequential') {
      await this.executeSequentialWorkflow(orchestration);
    } else {
      await this.executeAdaptiveWorkflow(orchestration);
    }
  }

  private async assignAgents(orchestration: TaskOrchestration, args: TaskOrchestrateArgs): Promise<AgentTaskAssignment[]> {
    const assignments: AgentTaskAssignment[] = [];

    // Group steps by type for agent assignment
    const stepsByType = this.groupStepsByType(orchestration.workflow);

    for (const [stepType, steps] of stepsByType.entries()) {
      const agentType = this.getAgentTypeForStepType(stepType);

      // Spawn agent via registry
      const { id: agentId } = await this.registry.spawnAgent(
        agentType,
        {} // Agent config - using defaults
      );

      assignments.push({
        agentId,
        agentType,
        tasks: steps.map(s => s.id),
        status: 'assigned'
      });

      // Assign step to agent
      for (const step of steps) {
        step.assignedAgent = agentId;
      }
    }

    return assignments;
  }

  private groupStepsByType(workflow: WorkflowStep[]): Map<string, WorkflowStep[]> {
    const groups = new Map<string, WorkflowStep[]>();

    for (const step of workflow) {
      if (!groups.has(step.type)) {
        groups.set(step.type, []);
      }
      groups.get(step.type)!.push(step);
    }

    return groups;
  }

  private getAgentTypeForStepType(stepType: string): string {
    const agentMapping: Record<string, string> = {
      'analysis': 'code-analyzer',
      'test-generation': 'test-generator',
      'test-execution': 'test-executor',
      'coverage-analysis': 'coverage-analyzer',
      'performance-testing': 'performance-tester',
      'security-analysis': 'security-scanner',
      'defect-prediction': 'defect-predictor',
      'metrics-collection': 'metrics-collector',
      'threshold-evaluation': 'quality-gate',
      'decision-making': 'quality-gate',
      'reporting': 'report-generator'
    };

    return agentMapping[stepType] || 'generic-agent';
  }

  private async executeParallelWorkflow(orchestration: TaskOrchestration): Promise<void> {
    this.log('info', 'Executing parallel workflow', { orchestrationId: orchestration.id });

    // Execute all steps that have no dependencies first
    const readySteps = orchestration.workflow.filter(step => step.dependencies.length === 0);

    await Promise.all(readySteps.map(step => this.executeStep(orchestration, step)));

    // Continue with dependent steps
    await this.executeDependentSteps(orchestration);
  }

  private async executeSequentialWorkflow(orchestration: TaskOrchestration): Promise<void> {
    this.log('info', 'Executing sequential workflow', { orchestrationId: orchestration.id });

    const sortedSteps = this.topologicalSort(orchestration.workflow);

    for (const step of sortedSteps) {
      await this.executeStep(orchestration, step);
    }
  }

  private async executeAdaptiveWorkflow(orchestration: TaskOrchestration): Promise<void> {
    this.log('info', 'Executing adaptive workflow', { orchestrationId: orchestration.id });

    // Adaptive strategy: start with parallel execution of independent steps,
    // then switch to sequential for dependent steps
    await this.executeParallelWorkflow(orchestration);
  }

  private async executeDependentSteps(orchestration: TaskOrchestration): Promise<void> {
    const completedSteps = new Set(
      orchestration.workflow.filter(s => s.status === 'completed').map(s => s.id)
    );

    const readySteps = orchestration.workflow.filter(step =>
      step.status === 'pending' &&
      step.dependencies.every(dep => completedSteps.has(dep))
    );

    if (readySteps.length > 0) {
      await Promise.all(readySteps.map(step => this.executeStep(orchestration, step)));
      await this.executeDependentSteps(orchestration); // Recursively execute remaining steps
    }
  }

  private async executeStep(orchestration: TaskOrchestration, step: WorkflowStep): Promise<void> {
    step.status = 'running';
    const assignment = orchestration.assignments.find(a => a.tasks.includes(step.id));

    if (assignment && assignment.status === 'assigned') {
      assignment.status = 'running';
      assignment.startedAt = new Date().toISOString();
    }

    this.addTimelineEvent(orchestration, 'step-completed', `Started step: ${step.name}`, step.id, assignment?.agentId);

    try {
      // Simulate step execution
      await new Promise(resolve => setTimeout(resolve, Math.min(step.estimatedDuration, 2000))); // Cap simulation time

      // Simulate step results
      step.results = this.generateStepResults(step);
      step.status = 'completed';

      if (assignment) {
        assignment.status = 'completed';
        assignment.completedAt = new Date().toISOString();
      }

      this.addTimelineEvent(orchestration, 'step-completed', `Completed step: ${step.name}`, step.id, assignment?.agentId);

      // Update progress
      this.updateProgress(orchestration);

    } catch (error) {
      step.status = 'failed';

      if (assignment) {
        assignment.status = 'failed';
      }

      this.addTimelineEvent(orchestration, 'step-failed', `Failed step: ${step.name}`, step.id, assignment?.agentId);
      throw error;
    }
  }

  private generateStepResults(step: WorkflowStep): any {
    const resultTemplates: Record<string, any> = {
      'analysis': {
        complexity: SecureRandom.randomFloat() * 20 + 5,
        linesOfCode: Math.floor(SecureRandom.randomFloat() * 10000 + 1000),
        functions: Math.floor(SecureRandom.randomFloat() * 100 + 10)
      },
      'test-generation': {
        testsGenerated: Math.floor(SecureRandom.randomFloat() * 50 + 10),
        coverageTarget: SecureRandom.randomFloat() * 20 + 75,
        testTypes: ['unit', 'integration']
      },
      'test-execution': {
        testsRun: Math.floor(SecureRandom.randomFloat() * 100 + 20),
        passed: Math.floor(SecureRandom.randomFloat() * 90 + 85),
        failed: Math.floor(SecureRandom.randomFloat() * 5),
        duration: SecureRandom.randomFloat() * 300 + 60
      },
      'performance-testing': {
        averageResponseTime: SecureRandom.randomFloat() * 200 + 50,
        throughput: SecureRandom.randomFloat() * 1000 + 500,
        errors: Math.floor(SecureRandom.randomFloat() * 3)
      }
    };

    return resultTemplates[step.type] || { status: 'completed', timestamp: new Date().toISOString() };
  }

  private topologicalSort(steps: WorkflowStep[]): WorkflowStep[] {
    const sorted: WorkflowStep[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (step: WorkflowStep) => {
      if (visiting.has(step.id)) {
        throw new Error('Circular dependency detected in workflow');
      }
      if (visited.has(step.id)) {
        return;
      }

      visiting.add(step.id);

      for (const depId of step.dependencies) {
        const depStep = steps.find(s => s.id === depId);
        if (depStep) {
          visit(depStep);
        }
      }

      visiting.delete(step.id);
      visited.add(step.id);
      sorted.push(step);
    };

    for (const step of steps) {
      visit(step);
    }

    return sorted;
  }

  private createInitialProgress(workflow: WorkflowStep[]): TaskProgress {
    return {
      overall: 0,
      byStep: workflow.reduce((acc, step) => {
        acc[step.id] = 0;
        return acc;
      }, {} as Record<string, number>),
      completedSteps: 0,
      totalSteps: workflow.length,
      estimatedCompletion: this.calculateEstimatedCompletion(workflow)
    };
  }

  private updateProgress(orchestration: TaskOrchestration): void {
    const completedSteps = orchestration.workflow.filter(s => s.status === 'completed').length;
    const totalSteps = orchestration.workflow.length;

    orchestration.progress.completedSteps = completedSteps;
    orchestration.progress.overall = (completedSteps / totalSteps) * 100;

    // Update individual step progress
    for (const step of orchestration.workflow) {
      orchestration.progress.byStep[step.id] = step.status === 'completed' ? 100 :
                                                step.status === 'running' ? 50 : 0;
    }

    // Check if orchestration is complete
    if (completedSteps === totalSteps) {
      this.completeOrchestration(orchestration);
    }
  }

  private completeOrchestration(orchestration: TaskOrchestration): void {
    orchestration.status = 'completed';
    orchestration.completedAt = new Date().toISOString();

    // Generate final results
    orchestration.results = this.generateFinalResults(orchestration);

    this.addTimelineEvent(orchestration, 'completed', 'Task orchestration completed');
    this.log('info', 'Orchestration completed', { orchestrationId: orchestration.id });
  }

  private generateFinalResults(orchestration: TaskOrchestration): OrchestrationResults {
    const completedSteps = orchestration.workflow.filter(s => s.status === 'completed').length;
    const failedSteps = orchestration.workflow.filter(s => s.status === 'failed').length;
    const totalDuration = orchestration.completedAt && orchestration.startedAt ?
      new Date(orchestration.completedAt).getTime() - new Date(orchestration.startedAt).getTime() : 0;

    return {
      summary: {
        success: failedSteps === 0,
        completedSteps,
        failedSteps,
        totalDuration
      },
      stepResults: orchestration.workflow.map(step => ({
        stepId: step.id,
        stepName: step.name,
        status: step.status as any,
        duration: step.estimatedDuration,
        output: step.results
      })),
      artifacts: this.generateArtifacts(orchestration),
      metrics: this.calculateOrchestrationMetrics(orchestration)
    };
  }

  private generateArtifacts(orchestration: TaskOrchestration): OrchestrationArtifact[] {
    const artifacts: OrchestrationArtifact[] = [];

    for (const step of orchestration.workflow) {
      if (step.status === 'completed') {
        artifacts.push({
          type: step.type,
          name: `${step.name.replace(/\s+/g, '-').toLowerCase()}-output.json`,
          path: `/artifacts/${orchestration.id}/${step.id}/output.json`,
          size: Math.floor(SecureRandom.randomFloat() * 100000 + 10000),
          stepId: step.id
        });
      }
    }

    return artifacts;
  }

  private calculateOrchestrationMetrics(orchestration: TaskOrchestration): OrchestrationMetrics {
    const agentUtilization: Record<string, number> = {};

    for (const assignment of orchestration.assignments) {
      agentUtilization[assignment.agentId] = SecureRandom.randomFloat() * 30 + 70; // 70-100%
    }

    return {
      parallelismEfficiency: orchestration.strategy === 'parallel' ? SecureRandom.randomFloat() * 0.2 + 0.8 : 1.0,
      resourceUtilization: SecureRandom.randomFloat() * 20 + 70, // 70-90%
      coordinationOverhead: SecureRandom.randomFloat() * 10 + 5, // 5-15%
      agentUtilization
    };
  }

  private calculateEstimatedCompletion(workflow: WorkflowStep[]): string {
    const totalDuration = workflow.reduce((sum, step) => sum + step.estimatedDuration, 0);
    const completionTime = new Date(Date.now() + totalDuration * 1000);
    return completionTime.toISOString();
  }

  private createEmptyResults(): OrchestrationResults {
    return {
      summary: {
        success: false,
        completedSteps: 0,
        failedSteps: 0,
        totalDuration: 0
      },
      stepResults: [],
      artifacts: [],
      metrics: {
        parallelismEfficiency: 0,
        resourceUtilization: 0,
        coordinationOverhead: 0,
        agentUtilization: {}
      }
    };
  }

  private addTimelineEvent(
    orchestration: TaskOrchestration,
    type: TaskEvent['type'],
    description: string,
    stepId?: string,
    agentId?: string
  ): void {
    orchestration.timeline.push({
      timestamp: new Date().toISOString(),
      type,
      description,
      stepId,
      agentId
    });
  }

  /**
   * Get orchestration by ID
   */
  getOrchestration(orchestrationId: string): TaskOrchestration | undefined {
    return this.activeOrchestrations.get(orchestrationId);
  }

  /**
   * List all orchestrations
   */
  listOrchestrations(): TaskOrchestration[] {
    return Array.from(this.activeOrchestrations.values());
  }

  /**
   * Cancel an orchestration
   */
  async cancelOrchestration(orchestrationId: string): Promise<boolean> {
    const orchestration = this.activeOrchestrations.get(orchestrationId);
    if (!orchestration || orchestration.status === 'completed' || orchestration.status === 'failed') {
      return false;
    }

    orchestration.status = 'cancelled';
    orchestration.completedAt = new Date().toISOString();

    this.addTimelineEvent(orchestration, 'failed', 'Orchestration cancelled by user');
    this.log('info', 'Orchestration cancelled', { orchestrationId });

    return true;
  }
}