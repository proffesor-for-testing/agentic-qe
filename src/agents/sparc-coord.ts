/**
 * SPARC Coordinator Agent
 *
 * Orchestrates the SPARC (Specification, Pseudocode, Architecture, Refinement, Completion)
 * methodology for systematic software development with Test-Driven Development
 */

import { BaseAgent } from './base-agent';
import {
  AgentId,
  AgentConfig,
  AgentDecision,
  TaskDefinition,
  TaskResult,
  ExplainableReasoning,
  ReasoningFactor,
  Evidence,
  ILogger,
  IEventBus,
  IMemorySystem
} from '../core/types';

interface SPARCPhase {
  name: 'specification' | 'pseudocode' | 'architecture' | 'refinement' | 'completion';
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  agentId?: string;
  startTime?: number;
  endTime?: number;
  artifacts: string[];
  dependencies: string[];
  quality_score?: number;
}

interface SPARCWorkflow {
  id: string;
  project: string;
  feature: string;
  phases: SPARCPhase[];
  currentPhase: number;
  overallProgress: number;
  quality_metrics: {
    specification_clarity: number;
    pseudocode_completeness: number;
    architecture_soundness: number;
    test_coverage: number;
    code_quality: number;
  };
  started: number;
  completed?: number;
}

interface SPARCContext {
  project: string;
  feature: string;
  requirements: string[];
  constraints: string[];
  existing_code?: string;
  test_requirements?: string[];
  architecture_patterns?: string[];
  quality_gates: Record<string, number>;
}

export class SPARCCoordinatorAgent extends BaseAgent {
  private workflows: Map<string, SPARCWorkflow> = new Map();
  private phaseAgents: Map<string, string> = new Map(); // phase -> agentId mapping
  private qualityThresholds = {
    specification: 0.8,
    pseudocode: 0.75,
    architecture: 0.85,
    test_coverage: 0.9,
    code_quality: 0.8
  };

  constructor(
    id: AgentId,
    config: AgentConfig,
    logger: ILogger,
    eventBus: IEventBus,
    memory: IMemorySystem
  ) {
    super(id, config, logger, eventBus, memory);
    this.initializePhaseAgents();
  }

  private initializePhaseAgents(): void {
    // Register available phase agents
    this.phaseAgents.set('specification', 'specification-agent');
    this.phaseAgents.set('pseudocode', 'pseudocode-agent');
    this.phaseAgents.set('architecture', 'architecture-agent');
    this.phaseAgents.set('refinement', 'refinement-agent');
  }

  protected async perceive(context: any): Promise<SPARCContext> {
    this.logger.debug('SPARC coordinator perceiving project context', { agentId: this.id });

    // Analyze project requirements and current state
    const existingWorkflows = await this.memory.retrieve('sparc_workflows') || {};
    const projectState = await this.memory.retrieve(`project_state:${context.project}`) || {};

    const sparcContext: SPARCContext = {
      project: context.project || 'unknown',
      feature: context.feature || 'untitled',
      requirements: context.requirements || [],
      constraints: context.constraints || [],
      existing_code: projectState.codebase,
      test_requirements: context.test_requirements || [],
      architecture_patterns: context.architecture_patterns || [],
      quality_gates: {
        ...this.qualityThresholds,
        ...context.quality_gates
      }
    };

    // Store context for phase agents
    await this.memory.store(`sparc_context:${sparcContext.project}:${sparcContext.feature}`, sparcContext, {
      type: 'state',
      tags: ['sparc', 'coordination', 'project-context'],
      partition: 'sparc'
    });

    return sparcContext;
  }

  protected async decide(observation: SPARCContext): Promise<AgentDecision> {
    this.logger.debug('SPARC coordinator making workflow decision', {
      agentId: this.id,
      project: observation.project,
      feature: observation.feature
    });

    const workflowId = `${observation.project}:${observation.feature}`;
    let workflow = this.workflows.get(workflowId);

    if (!workflow) {
      // Initialize new SPARC workflow
      workflow = this.createNewWorkflow(workflowId, observation);
      this.workflows.set(workflowId, workflow);
    }

    const currentPhase = workflow.phases[workflow.currentPhase];

    let decision: AgentDecision;

    if (currentPhase.status === 'pending') {
      // Start the current phase
      decision = {
        id: this.generateSparcId(),
        agentId: this.id.id,
        timestamp: new Date(),
        action: 'start_phase',
        confidence: 0.9,
        alternatives: [],
        risks: [],
        recommendations: [`Start ${currentPhase.name} phase`],
        reasoning: this.buildSparcReasoning([
          { name: 'workflow_state', value: 'phase_ready', weight: 0.4, impact: 'positive', explanation: 'Workflow ready for next phase' },
          { name: 'requirements_clarity', value: observation.requirements.length > 0 ? 'clear' : 'unclear', weight: 0.3, impact: 'positive', explanation: 'Requirements clarity assessment' },
          { name: 'agent_availability', value: 'available', weight: 0.3, impact: 'positive', explanation: 'Phase agent is available' }
        ], ['SFDIPOT'], [
          { type: 'analytical', source: 'sparc_methodology', confidence: 0.95, description: 'SPARC phase progression' }
        ])
      };
    } else if (currentPhase.status === 'completed') {
      // Move to next phase or complete workflow
      const nextPhaseIndex = workflow.currentPhase + 1;

      if (nextPhaseIndex < workflow.phases.length) {
        decision = {
          id: this.generateSparcId(),
          agentId: this.id.id,
          timestamp: new Date(),
          action: 'advance_phase',
          confidence: currentPhase.quality_score || 0.8,
          alternatives: [],
          risks: [],
          recommendations: [`Advance from ${currentPhase.name} to ${workflow.phases[nextPhaseIndex].name}`],
          reasoning: this.buildSparcReasoning([
            { name: 'phase_completion', value: 'successful', weight: 0.5, impact: 'positive', explanation: 'Phase completed successfully' },
            { name: 'quality_score', value: currentPhase.quality_score || 0.8, weight: 0.3, impact: 'positive', explanation: 'Quality score meets threshold' },
            { name: 'dependencies_met', value: 'satisfied', weight: 0.2, impact: 'positive', explanation: 'All dependencies satisfied' }
          ], ['CRUSSPIC'], [
            { type: 'empirical', source: currentPhase.name, confidence: currentPhase.quality_score || 0.8, description: 'Phase completion evidence' }
          ])
        };
      } else {
        decision = {
          id: this.generateSparcId(),
          agentId: this.id.id,
          timestamp: new Date(),
          action: 'complete_workflow',
          confidence: this.calculateOverallQuality(workflow),
          alternatives: [],
          risks: [],
          recommendations: ['Workflow completed successfully', 'Proceed to deployment validation'],
          reasoning: this.buildSparcReasoning([
            { name: 'all_phases_complete', value: 'true', weight: 0.4, impact: 'positive', explanation: 'All SPARC phases completed' },
            { name: 'overall_quality', value: this.calculateOverallQuality(workflow), weight: 0.4, impact: 'positive', explanation: 'Overall quality meets standards' },
            { name: 'artifacts_complete', value: 'true', weight: 0.2, impact: 'positive', explanation: 'All artifacts generated' }
          ], ['FEW_HICCUPPS'], [
            { type: 'empirical', source: 'sparc_coordinator', confidence: 0.9, description: 'All SPARC phases completed successfully' }
          ])
        };
      }
    } else {
      // Monitor current phase progress
      decision = {
        id: this.generateSparcId(),
        agentId: this.id.id,
        timestamp: new Date(),
        action: 'monitor_phase',
        confidence: 0.7,
        alternatives: [],
        risks: [],
        recommendations: [`Monitor ${currentPhase.name} phase progress`],
        reasoning: this.buildSparcReasoning([
          { name: 'phase_in_progress', value: 'monitoring', weight: 0.6, impact: 'neutral', explanation: 'Phase currently in progress' },
          { name: 'time_elapsed', value: currentPhase.startTime ? Date.now() - currentPhase.startTime : 0, weight: 0.4, impact: 'neutral', explanation: 'Time elapsed tracking' }
        ], ['RCRCRC'], [
          { type: 'empirical', source: 'phase_agent', confidence: 0.7, description: 'Ongoing phase execution' }
        ])
      };
    }

    return decision;
  }

  protected async act(decision: AgentDecision): Promise<any> {
    this.logger.info('SPARC coordinator executing action', {
      agentId: this.id,
      action: decision.action
    });

    let result: any;

    switch (decision.action) {
      case 'start_phase':
        result = await this.startPhase(decision);
        break;

      case 'advance_phase':
        result = await this.advancePhase(decision);
        break;

      case 'complete_workflow':
        result = await this.completeWorkflow(decision);
        break;

      case 'monitor_phase':
        result = await this.monitorPhase(decision);
        break;

      default:
        this.logger.warn('Unknown SPARC action requested', { action: decision.action });
        result = { success: false, error: 'Unknown action' };
    }

    // Store action result
    await this.memory.store(`sparc_action:${decision.id}`, {
      decision,
      result,
      timestamp: Date.now()
    }, {
      type: 'decision' as const,
      tags: ['sparc', 'coordination', decision.action],
      partition: 'sparc'
    });

    return result;
  }

  protected async learn(feedback: any): Promise<void> {
    this.logger.debug('SPARC coordinator learning from feedback', { agentId: this.id });

    if (feedback.workflow_completion) {
      const workflow = feedback.workflow as SPARCWorkflow;

      // Update quality thresholds based on outcomes
      if (workflow.quality_metrics.specification_clarity < 0.8) {
        this.qualityThresholds.specification = Math.min(0.9, this.qualityThresholds.specification + 0.05);
      }

      if (workflow.quality_metrics.test_coverage < 0.9) {
        this.qualityThresholds.test_coverage = Math.min(0.95, this.qualityThresholds.test_coverage + 0.02);
      }
    }

    if (feedback.phase_feedback) {
      const phaseName = feedback.phase_feedback.phase;
      const success = feedback.phase_feedback.success;
      const quality = feedback.phase_feedback.quality;

      // Adjust expectations for specific phases
      if (!success || quality < 0.7) {
        this.qualityThresholds[phaseName as keyof typeof this.qualityThresholds] =
          Math.min(0.95, this.qualityThresholds[phaseName as keyof typeof this.qualityThresholds] + 0.05);
      }
    }

    // Store learning outcomes
    await this.memory.store('sparc_coordinator_learning', {
      timestamp: Date.now(),
      qualityThresholds: this.qualityThresholds,
      feedback
    }, {
      type: 'experience' as const,
      tags: ['sparc', 'coordination', 'adaptation'],
      partition: 'sparc'
    });
  }

  private createNewWorkflow(workflowId: string, context: SPARCContext): SPARCWorkflow {
    return {
      id: workflowId,
      project: context.project,
      feature: context.feature,
      phases: [
        {
          name: 'specification',
          status: 'pending',
          artifacts: [],
          dependencies: []
        },
        {
          name: 'pseudocode',
          status: 'pending',
          artifacts: [],
          dependencies: ['specification']
        },
        {
          name: 'architecture',
          status: 'pending',
          artifacts: [],
          dependencies: ['specification', 'pseudocode']
        },
        {
          name: 'refinement',
          status: 'pending',
          artifacts: [],
          dependencies: ['specification', 'pseudocode', 'architecture']
        },
        {
          name: 'completion',
          status: 'pending',
          artifacts: [],
          dependencies: ['specification', 'pseudocode', 'architecture', 'refinement']
        }
      ],
      currentPhase: 0,
      overallProgress: 0,
      quality_metrics: {
        specification_clarity: 0,
        pseudocode_completeness: 0,
        architecture_soundness: 0,
        test_coverage: 0,
        code_quality: 0
      },
      started: Date.now()
    };
  }

  private getPhaseRequirements(phaseName: string, context: SPARCContext): any {
    const baseRequirements = {
      project: context.project,
      feature: context.feature,
      constraints: context.constraints
    };

    switch (phaseName) {
      case 'specification':
        return {
          ...baseRequirements,
          requirements: context.requirements,
          quality_gate: this.qualityThresholds.specification
        };

      case 'pseudocode':
        return {
          ...baseRequirements,
          specification_artifacts: [], // Will be populated from previous phase
          quality_gate: this.qualityThresholds.pseudocode
        };

      case 'architecture':
        return {
          ...baseRequirements,
          patterns: context.architecture_patterns,
          existing_code: context.existing_code,
          quality_gate: this.qualityThresholds.architecture
        };

      case 'refinement':
        return {
          ...baseRequirements,
          test_requirements: context.test_requirements,
          quality_gates: context.quality_gates
        };

      default:
        return baseRequirements;
    }
  }

  private getPhaseCheckpoints(phaseName: string): string[] {
    switch (phaseName) {
      case 'specification':
        return ['requirements_analyzed', 'acceptance_criteria_defined', 'constraints_identified'];
      case 'pseudocode':
        return ['algorithm_outlined', 'data_structures_defined', 'control_flow_mapped'];
      case 'architecture':
        return ['components_identified', 'interfaces_defined', 'patterns_selected'];
      case 'refinement':
        return ['tests_written', 'code_implemented', 'refactoring_completed'];
      default:
        return ['progress_checkpoint'];
    }
  }

  private calculateOverallQuality(workflow: SPARCWorkflow): number {
    const metrics = workflow.quality_metrics;
    const weights = {
      specification_clarity: 0.2,
      pseudocode_completeness: 0.15,
      architecture_soundness: 0.25,
      test_coverage: 0.25,
      code_quality: 0.15
    };

    return weights.specification_clarity * metrics.specification_clarity +
           weights.pseudocode_completeness * metrics.pseudocode_completeness +
           weights.architecture_soundness * metrics.architecture_soundness +
           weights.test_coverage * metrics.test_coverage +
           weights.code_quality * metrics.code_quality;
  }

  private async startPhase(decision: AgentDecision): Promise<any> {
    // Extract workflow ID and parameters from decision context
    const workflowId = 'current_workflow'; // This would come from decision context
    const workflow = this.workflows.get(workflowId);

    if (!workflow) {
      return { success: false, error: 'Workflow not found' };
    }

    const phase = workflow.phases[workflow.currentPhase];
    phase.status = 'in_progress';
    phase.startTime = Date.now();
    phase.agentId = this.phaseAgents.get(phase.name);

    // Delegate to specialized phase agent
    this.eventBus.emit('sparc:phase:start', {
      workflowId,
      phase: phase.name,
      agentId: phase.agentId,
      requirements: this.getPhaseRequirements(phase.name, {} as SPARCContext),
      context: {}
    });

    return {
      success: true,
      phase: phase.name,
      agentId: phase.agentId,
      status: 'started'
    };
  }

  private async advancePhase(decision: AgentDecision): Promise<any> {
    const workflowId = 'current_workflow';
    const workflow = this.workflows.get(workflowId);

    if (!workflow) {
      return { success: false, error: 'Workflow not found' };
    }

    // Complete current phase
    const currentPhase = workflow.phases[workflow.currentPhase];
    currentPhase.status = 'completed';
    currentPhase.endTime = Date.now();

    // Advance to next phase
    workflow.currentPhase++;
    workflow.overallProgress = (workflow.currentPhase / workflow.phases.length) * 100;

    return {
      success: true,
      fromPhase: currentPhase.name,
      toPhase: workflow.phases[workflow.currentPhase]?.name,
      progress: workflow.overallProgress
    };
  }

  private async completeWorkflow(decision: AgentDecision): Promise<any> {
    const workflowId = 'current_workflow';
    const workflow = this.workflows.get(workflowId);

    if (!workflow) {
      return { success: false, error: 'Workflow not found' };
    }

    workflow.completed = Date.now();
    workflow.overallProgress = 100;

    // Store completed workflow
    await this.memory.store(`sparc_workflow_completed:${workflowId}`, workflow, {
      type: 'artifact' as const,
      tags: ['sparc', 'completed', workflow.project],
      partition: 'sparc'
    });

    this.eventBus.emit('sparc:workflow:completed', {
      workflowId,
      workflow,
      artifacts: workflow.phases.flatMap(p => p.artifacts),
      quality: this.calculateOverallQuality(workflow)
    });

    return {
      success: true,
      workflowId,
      totalPhases: workflow.phases.length,
      overallQuality: this.calculateOverallQuality(workflow),
      duration: workflow.completed - workflow.started,
      artifacts: workflow.phases.flatMap(p => p.artifacts)
    };
  }

  private async monitorPhase(decision: AgentDecision): Promise<any> {
    const workflowId = 'current_workflow';
    const workflow = this.workflows.get(workflowId);

    if (!workflow) {
      return { success: false, error: 'Workflow not found' };
    }

    const phase = workflow.phases[workflow.currentPhase];
    const elapsed = phase.startTime ? Date.now() - phase.startTime : 0;

    // Check for progress updates from phase agent
    const progressData = await this.memory.retrieve(`sparc_phase_progress:${workflowId}:${phase.name}`);

    return {
      success: true,
      phase: phase.name,
      status: phase.status,
      elapsed,
      progress: progressData?.progress || 0,
      checkpoints: progressData?.checkpoints || []
    };
  }

  private generateSparcId(): string {
    return `sparc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private buildSparcReasoning(
    factors: ReasoningFactor[],
    heuristics: string[],
    evidence: Evidence[]
  ): ExplainableReasoning {
    return {
      factors,
      heuristics,
      evidence,
      assumptions: ['SPARC methodology provides systematic development approach'],
      limitations: ['Requires clear initial requirements', 'Phase quality depends on agent capabilities']
    };
  }
}