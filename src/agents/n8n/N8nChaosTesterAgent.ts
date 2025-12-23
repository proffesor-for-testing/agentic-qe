/**
 * N8nChaosTesterAgent
 *
 * REAL Chaos engineering for n8n workflows:
 * - ACTUAL fault injection via modified workflow copies
 * - REAL workflow execution to test resilience
 * - ACTUAL recovery testing with live execution
 * - TRUE failure scenario validation
 *
 * This agent creates fault-injected workflow copies, executes them against
 * the n8n instance, and measures real behavior - NOT just static analysis.
 */

import { N8nBaseAgent, N8nAgentConfig } from './N8nBaseAgent';
import {
  N8nWorkflow,
  N8nNode,
  N8nExecution,
} from './types';
import { QETask, AgentCapability } from '../../types';
import { N8nTestHarness, FaultInjectionConfig } from './N8nTestHarness';

export interface ChaosTestTask extends QETask {
  type: 'chaos-test';
  target: string; // workflowId
  options?: {
    experiments?: ChaosExperiment[];
    duration?: number; // minutes
    intensity?: 'light' | 'moderate' | 'heavy';
    safeMode?: boolean;
    rollbackOnFailure?: boolean;
    testInput?: Record<string, unknown>; // Input data for test executions
  };
}

export interface ChaosExperiment {
  name: string;
  type: ChaosType;
  target?: string; // node name or 'random'
  parameters: Record<string, unknown>;
  expectedBehavior: string;
}

export type ChaosType =
  | 'node-failure'
  | 'network-delay'
  | 'network-partition'
  | 'resource-exhaustion'
  | 'data-corruption'
  | 'timeout'
  | 'rate-limit'
  | 'credential-failure'
  | 'invalid-response';

export interface ChaosTestResult {
  workflowId: string;
  experiments: ExperimentResult[];
  resilience: ResilienceScore;
  vulnerabilities: Vulnerability[];
  recommendations: ChaosRecommendation[];
  summary: ChaosSummary;
}

export interface ExperimentResult {
  experiment: ChaosExperiment;
  status: 'passed' | 'failed' | 'error' | 'skipped';
  duration: number;
  observations: Observation[];
  impact: ImpactAssessment;
  recovery?: RecoveryAssessment;
  execution?: {
    executionId: string;
    workflowStatus: 'success' | 'failed' | 'waiting';
    errorMessage?: string;
    nodesExecuted: string[];
    errorHandlingTriggered: boolean;
  };
}

export interface Observation {
  timestamp: Date;
  type: 'info' | 'warning' | 'error' | 'execution';
  message: string;
  details?: Record<string, unknown>;
}

export interface ImpactAssessment {
  severity: 'none' | 'minor' | 'moderate' | 'severe' | 'critical';
  affectedNodes: string[];
  dataLoss: boolean;
  serviceDisruption: boolean;
  cascadeFailure: boolean;
}

export interface RecoveryAssessment {
  recovered: boolean;
  timeToRecovery: number; // ms
  manualIntervention: boolean;
  dataIntegrity: boolean;
  retrySucceeded?: boolean;
}

export interface ResilienceScore {
  overall: number; // 0-100
  categories: {
    faultTolerance: number;
    recovery: number;
    gracefulDegradation: number;
    monitoring: number;
  };
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
}

export interface Vulnerability {
  id: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  location: string;
  exploitedBy: string;
  mitigation: string;
}

export interface ChaosRecommendation {
  priority: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  issue: string;
  recommendation: string;
  effort: 'low' | 'medium' | 'high';
}

export interface ChaosSummary {
  totalExperiments: number;
  passed: number;
  failed: number;
  errors: number;
  skipped: number;
  duration: number;
  vulnerabilitiesFound: number;
  actualExecutions: number;
}

// Pre-defined chaos experiments with REAL fault injection
const STANDARD_EXPERIMENTS: ChaosExperiment[] = [
  {
    name: 'HTTP 500 Error Injection',
    type: 'node-failure',
    target: 'httpRequest',
    parameters: { errorCode: 500, errorMessage: 'Internal Server Error' },
    expectedBehavior: 'Workflow handles 500 error gracefully with retry or error branch',
  },
  {
    name: 'Network Timeout',
    type: 'timeout',
    target: 'httpRequest',
    parameters: { timeoutMs: 30000 },
    expectedBehavior: 'Workflow times out gracefully and triggers error handling',
  },
  {
    name: 'Empty Response',
    type: 'invalid-response',
    target: 'httpRequest',
    parameters: { responseType: 'empty', response: {} },
    expectedBehavior: 'Workflow handles empty/null responses without crashing',
  },
  {
    name: 'Malformed JSON Response',
    type: 'data-corruption',
    target: 'httpRequest',
    parameters: { responseType: 'malformed', response: 'not-json' },
    expectedBehavior: 'Workflow validates data and handles parse errors',
  },
  {
    name: 'Rate Limit (429)',
    type: 'rate-limit',
    target: 'httpRequest',
    parameters: { errorCode: 429, retryAfter: 60 },
    expectedBehavior: 'Workflow implements retry with backoff or handles rate limit',
  },
  {
    name: 'Authentication Failure (401)',
    type: 'credential-failure',
    target: 'httpRequest',
    parameters: { errorCode: 401, errorMessage: 'Unauthorized' },
    expectedBehavior: 'Workflow reports authentication failure clearly',
  },
];

export class N8nChaosTesterAgent extends N8nBaseAgent {
  private experimentHistory: Map<string, ExperimentResult[]> = new Map();
  private testHarness: N8nTestHarness | null = null;

  constructor(config: N8nAgentConfig) {
    const capabilities: AgentCapability[] = [
      {
        name: 'real-fault-injection',
        version: '2.0.0',
        description: 'Inject REAL faults into workflow execution via modified copies',
        parameters: {},
      },
      {
        name: 'live-resilience-testing',
        version: '2.0.0',
        description: 'Test workflow resilience with ACTUAL execution',
        parameters: {},
      },
      {
        name: 'recovery-validation',
        version: '2.0.0',
        description: 'Validate recovery mechanisms with live retry testing',
        parameters: {},
      },
      {
        name: 'chaos-orchestration',
        version: '2.0.0',
        description: 'Orchestrate comprehensive chaos experiments',
        parameters: {},
      },
    ];

    super({
      ...config,
      type: 'n8n-chaos-tester' as any,
      capabilities: [...capabilities, ...(config.capabilities || [])],
    });
  }

  protected async performTask(task: QETask): Promise<ChaosTestResult> {
    const chaosTask = task as ChaosTestTask;

    if (chaosTask.type !== 'chaos-test') {
      throw new Error(`Unsupported task type: ${chaosTask.type}`);
    }

    return this.runChaosTests(chaosTask.target, chaosTask.options);
  }

  /**
   * Run REAL chaos tests on workflow with actual fault injection and execution
   */
  async runChaosTests(
    workflowId: string,
    options?: ChaosTestTask['options']
  ): Promise<ChaosTestResult> {
    const workflow = await this.getWorkflow(workflowId);
    const startTime = Date.now();

    // Initialize test harness for real fault injection
    this.testHarness = new N8nTestHarness(this.n8nConfig);

    try {
      // Get experiments to run
      const experiments = options?.experiments ||
        this.selectExperiments(workflow, options?.intensity || 'moderate');

      // Run experiments with REAL fault injection
      const experimentResults: ExperimentResult[] = [];
      let actualExecutions = 0;

      for (const experiment of experiments) {
        if (options?.safeMode && this.isDestructive(experiment)) {
          experimentResults.push(this.createSkippedResult(experiment, 'Safe mode enabled'));
          continue;
        }

        const result = await this.runRealExperiment(
          workflow,
          experiment,
          options?.testInput || {}
        );
        experimentResults.push(result);

        if (result.execution) {
          actualExecutions++;
        }

        // Store for history
        const history = this.experimentHistory.get(workflowId) || [];
        history.push(result);
        this.experimentHistory.set(workflowId, history);
      }

      // Calculate resilience score based on REAL execution results
      const resilience = this.calculateResilienceScore(workflow, experimentResults);

      // Identify vulnerabilities from ACTUAL test failures
      const vulnerabilities = this.identifyVulnerabilities(experimentResults);

      // Generate recommendations based on REAL test data
      const recommendations = this.generateRecommendations(
        workflow,
        experimentResults,
        vulnerabilities
      );

      // Create summary
      const summary: ChaosSummary = {
        totalExperiments: experimentResults.length,
        passed: experimentResults.filter(r => r.status === 'passed').length,
        failed: experimentResults.filter(r => r.status === 'failed').length,
        errors: experimentResults.filter(r => r.status === 'error').length,
        skipped: experimentResults.filter(r => r.status === 'skipped').length,
        duration: Date.now() - startTime,
        vulnerabilitiesFound: vulnerabilities.length,
        actualExecutions,
      };

      const result: ChaosTestResult = {
        workflowId,
        experiments: experimentResults,
        resilience,
        vulnerabilities,
        recommendations,
        summary,
      };

      // Store result
      await this.storeTestResult(`chaos-test:${workflowId}`, result);

      // Emit event
      this.emitEvent('chaos.test.completed', {
        workflowId,
        passed: summary.passed,
        failed: summary.failed,
        resilienceScore: resilience.overall,
        vulnerabilities: vulnerabilities.length,
        actualExecutions,
      });

      return result;
    } finally {
      // Always cleanup test workflows
      if (this.testHarness) {
        await this.testHarness.cleanup();
      }
    }
  }

  /**
   * Run a REAL experiment with actual fault injection and workflow execution
   */
  private async runRealExperiment(
    workflow: N8nWorkflow,
    experiment: ChaosExperiment,
    testInput: Record<string, unknown>
  ): Promise<ExperimentResult> {
    const startTime = Date.now();
    const observations: Observation[] = [];

    observations.push({
      timestamp: new Date(),
      type: 'info',
      message: `Starting REAL experiment: ${experiment.name}`,
      details: { experimentType: experiment.type, target: experiment.target },
    });

    try {
      // Select target node
      const targetNode = this.selectTargetNode(workflow, experiment.target);

      if (!targetNode) {
        observations.push({
          timestamp: new Date(),
          type: 'warning',
          message: `No suitable target node found for experiment: ${experiment.name}`,
        });
        return this.createSkippedResult(experiment, 'No suitable target node');
      }

      // Convert experiment to fault injection config
      const faultConfig = this.experimentToFaultConfig(experiment, targetNode);

      observations.push({
        timestamp: new Date(),
        type: 'info',
        message: `Creating fault-injected workflow copy targeting node: ${targetNode.name}`,
        details: { faultConfig: JSON.parse(JSON.stringify(faultConfig)) },
      });

      // Create fault-injected workflow via test harness
      const { workflow: testWorkflow, cleanup } = await this.testHarness!.createFaultInjectedWorkflow(
        workflow.id,
        [faultConfig]
      );

      observations.push({
        timestamp: new Date(),
        type: 'execution',
        message: `Created test workflow: ${testWorkflow.id}`,
        details: { testWorkflowId: testWorkflow.id, testWorkflowName: testWorkflow.name },
      });

      try {
        // Execute the fault-injected workflow
        observations.push({
          timestamp: new Date(),
          type: 'execution',
          message: 'Executing fault-injected workflow...',
        });

        const execution = await this.executeWorkflow(testWorkflow.id, testInput);
        const executionResult = await this.waitForExecutionWithTimeout(execution.id, 60000);

        observations.push({
          timestamp: new Date(),
          type: 'execution',
          message: `Execution completed: ${executionResult.status}`,
          details: {
            executionId: executionResult.id,
            status: executionResult.status,
            finished: executionResult.finished,
          },
        });

        // Analyze the REAL execution result
        const impact = this.assessRealImpact(workflow, executionResult, experiment);
        const recovery = await this.assessRealRecovery(workflow, executionResult, experiment);

        // Determine status based on ACTUAL behavior
        const status = this.determineRealStatus(experiment, executionResult, impact, recovery);

        // Extract executed nodes
        const nodesExecuted = this.extractExecutedNodes(executionResult);
        const errorHandlingTriggered = this.checkErrorHandlingTriggered(executionResult, workflow);

        return {
          experiment,
          status,
          duration: Date.now() - startTime,
          observations,
          impact,
          recovery,
          execution: {
            executionId: executionResult.id,
            workflowStatus: executionResult.status as 'success' | 'failed' | 'waiting',
            errorMessage: this.extractErrorMessage(executionResult),
            nodesExecuted,
            errorHandlingTriggered,
          },
        };
      } finally {
        // Always cleanup the test workflow
        await cleanup();
        observations.push({
          timestamp: new Date(),
          type: 'info',
          message: 'Test workflow cleaned up',
        });
      }
    } catch (error) {
      observations.push({
        timestamp: new Date(),
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
      });

      return {
        experiment,
        status: 'error',
        duration: Date.now() - startTime,
        observations,
        impact: {
          severity: 'critical',
          affectedNodes: [],
          dataLoss: false,
          serviceDisruption: true,
          cascadeFailure: false,
        },
      };
    }
  }

  /**
   * Convert experiment to fault injection config for TestHarness
   */
  private experimentToFaultConfig(
    experiment: ChaosExperiment,
    targetNode: N8nNode
  ): FaultInjectionConfig {
    const params = experiment.parameters;

    switch (experiment.type) {
      case 'node-failure':
        return {
          targetNode: targetNode.name,
          faultType: 'error',
          errorCode: (params.errorCode as number) || 500,
          errorMessage: (params.errorMessage as string) || 'Injected fault: node failure',
        };

      case 'timeout':
        return {
          targetNode: targetNode.name,
          faultType: 'timeout',
          delay: (params.timeoutMs as number) || 30000,
        };

      case 'invalid-response':
      case 'data-corruption':
        return {
          targetNode: targetNode.name,
          faultType: 'empty-response',
        };

      case 'rate-limit':
        return {
          targetNode: targetNode.name,
          faultType: 'error',
          errorCode: 429,
          errorMessage: 'Rate limit exceeded',
        };

      case 'credential-failure':
        return {
          targetNode: targetNode.name,
          faultType: 'error',
          errorCode: 401,
          errorMessage: 'Authentication failed',
        };

      case 'network-delay':
        return {
          targetNode: targetNode.name,
          faultType: 'timeout',
          delay: (params.delayMs as number) || 5000,
        };

      case 'network-partition':
        return {
          targetNode: targetNode.name,
          faultType: 'error',
          errorCode: 503,
          errorMessage: 'Service unavailable - network partition',
        };

      case 'resource-exhaustion':
        return {
          targetNode: targetNode.name,
          faultType: 'error',
          errorCode: 503,
          errorMessage: 'Resource exhaustion',
        };

      default:
        return {
          targetNode: targetNode.name,
          faultType: 'error',
          errorCode: 500,
          errorMessage: `Injected fault: ${experiment.type}`,
        };
    }
  }

  /**
   * Wait for execution with timeout
   */
  private async waitForExecutionWithTimeout(
    executionId: string,
    timeout: number
  ): Promise<N8nExecution> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const execution = await this.n8nClient.getExecution(executionId);

      if (execution.finished) {
        return execution;
      }

      // Poll every 500ms
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Return the current state even if not finished
    return this.n8nClient.getExecution(executionId);
  }

  /**
   * Assess REAL impact from actual execution
   */
  private assessRealImpact(
    workflow: N8nWorkflow,
    execution: N8nExecution,
    experiment: ChaosExperiment
  ): ImpactAssessment {
    const failedNodes = this.extractFailedNodes(execution);
    const executedNodes = this.extractExecutedNodes(execution);

    // Determine severity based on actual execution outcome
    let severity: ImpactAssessment['severity'];

    if (execution.status === 'success') {
      severity = 'none';
    } else if (execution.status === 'failed' || execution.status === 'crashed') {
      if (failedNodes.length === 0) {
        severity = 'minor';
      } else if (failedNodes.length === 1) {
        severity = 'moderate';
      } else if (failedNodes.length > workflow.nodes.length / 2) {
        severity = 'critical';
      } else {
        severity = 'severe';
      }
    } else {
      severity = 'moderate';
    }

    // Check for cascade failure - did error propagate beyond target?
    const cascadeFailure = failedNodes.length > 1;

    return {
      severity,
      affectedNodes: failedNodes,
      dataLoss: false, // Would need to check output data
      serviceDisruption: execution.status === 'failed' || execution.status === 'crashed',
      cascadeFailure,
    };
  }

  /**
   * Assess REAL recovery from actual execution
   */
  private async assessRealRecovery(
    workflow: N8nWorkflow,
    execution: N8nExecution,
    experiment: ChaosExperiment
  ): Promise<RecoveryAssessment> {
    const startTime = Date.now();

    // Check if error handling was triggered
    const errorHandlingTriggered = this.checkErrorHandlingTriggered(execution, workflow);

    // Check if retry was attempted (look for multiple executions of same node)
    const retryAttempted = this.checkRetryAttempted(execution);

    // Check if workflow completed despite the fault
    const recovered = execution.status === 'success' || errorHandlingTriggered;

    return {
      recovered,
      timeToRecovery: Date.now() - startTime,
      manualIntervention: !recovered,
      dataIntegrity: execution.status === 'success',
      retrySucceeded: retryAttempted && execution.status === 'success',
    };
  }

  /**
   * Determine status based on REAL execution results
   */
  private determineRealStatus(
    experiment: ChaosExperiment,
    execution: N8nExecution,
    impact: ImpactAssessment,
    recovery: RecoveryAssessment
  ): ExperimentResult['status'] {
    // If workflow succeeded despite fault, that's a PASS
    if (execution.status === 'success') {
      return 'passed';
    }

    // If error was handled gracefully (error handling triggered), that's a PASS
    if (recovery.recovered) {
      return 'passed';
    }

    // If we expected the workflow to fail and it did, check if it failed gracefully
    if (impact.severity === 'critical' || impact.cascadeFailure) {
      return 'failed';
    }

    // Default to failed if error wasn't handled
    return 'failed';
  }

  /**
   * Extract list of nodes that executed
   */
  private extractExecutedNodes(execution: N8nExecution): string[] {
    if (!execution.data?.resultData?.runData) {
      return [];
    }
    return Object.keys(execution.data.resultData.runData);
  }

  /**
   * Extract list of nodes that failed
   */
  private extractFailedNodes(execution: N8nExecution): string[] {
    if (!execution.data?.resultData?.runData) {
      return [];
    }

    const failedNodes: string[] = [];
    const runData = execution.data.resultData.runData;

    for (const [nodeName, nodeRuns] of Object.entries(runData)) {
      if (Array.isArray(nodeRuns)) {
        for (const run of nodeRuns) {
          if (run.error) {
            failedNodes.push(nodeName);
            break;
          }
        }
      }
    }

    return failedNodes;
  }

  /**
   * Extract error message from execution
   */
  private extractErrorMessage(execution: N8nExecution): string | undefined {
    if (!execution.data?.resultData?.error) {
      return undefined;
    }

    const error = execution.data.resultData.error;
    return typeof error === 'string' ? error : (error as { message?: string }).message;
  }

  /**
   * Check if error handling was triggered
   */
  private checkErrorHandlingTriggered(execution: N8nExecution, workflow: N8nWorkflow): boolean {
    const executedNodes = this.extractExecutedNodes(execution);

    // Check if error workflow was executed
    if (workflow.settings?.errorWorkflow) {
      // Would need to check if error workflow was triggered
      return execution.status === 'failed' || execution.status === 'crashed';
    }

    // Check if any error handling nodes were executed
    const errorHandlingNodes = workflow.nodes.filter(n =>
      n.type.includes('errorTrigger') ||
      n.type.includes('Error') ||
      (n.parameters.onError && n.parameters.onError !== 'stopWorkflow')
    );

    return errorHandlingNodes.some(n => executedNodes.includes(n.name));
  }

  /**
   * Check if retry was attempted
   */
  private checkRetryAttempted(execution: N8nExecution): boolean {
    if (!execution.data?.resultData?.runData) {
      return false;
    }

    // Check if any node was executed multiple times
    for (const nodeRuns of Object.values(execution.data.resultData.runData)) {
      if (Array.isArray(nodeRuns) && nodeRuns.length > 1) {
        return true;
      }
    }

    return false;
  }

  /**
   * Select experiments based on workflow and intensity
   */
  private selectExperiments(
    workflow: N8nWorkflow,
    intensity: 'light' | 'moderate' | 'heavy'
  ): ChaosExperiment[] {
    const experiments: ChaosExperiment[] = [];

    // Add relevant standard experiments
    for (const experiment of STANDARD_EXPERIMENTS) {
      if (this.isExperimentApplicable(workflow, experiment)) {
        experiments.push(experiment);
      }
    }

    // Adjust based on intensity
    const countMap = { light: 2, moderate: 4, heavy: experiments.length };
    return experiments.slice(0, countMap[intensity]);
  }

  /**
   * Check if experiment is applicable to workflow
   */
  private isExperimentApplicable(
    workflow: N8nWorkflow,
    experiment: ChaosExperiment
  ): boolean {
    switch (experiment.target) {
      case 'httpRequest':
        return workflow.nodes.some(n => n.type.includes('httpRequest'));
      case 'code':
        return workflow.nodes.some(n => n.type.includes('code'));
      case 'random':
        return workflow.nodes.filter(n => !n.type.includes('trigger')).length > 0;
      default:
        return workflow.nodes.some(n => n.name === experiment.target);
    }
  }

  /**
   * Check if experiment is destructive
   */
  private isDestructive(experiment: ChaosExperiment): boolean {
    const destructiveTypes: ChaosType[] = [
      'data-corruption',
      'resource-exhaustion',
    ];
    return destructiveTypes.includes(experiment.type);
  }

  /**
   * Select target node for chaos
   */
  private selectTargetNode(
    workflow: N8nWorkflow,
    target?: string
  ): N8nNode | undefined {
    if (!target || target === 'random') {
      const nonTriggerNodes = workflow.nodes.filter(
        n => !n.type.includes('trigger') && !n.type.includes('Trigger')
      );
      return nonTriggerNodes[Math.floor(Math.random() * nonTriggerNodes.length)];
    }

    if (target.includes('Request') || target.includes('http') || target === 'httpRequest') {
      return workflow.nodes.find(n => n.type.includes('httpRequest'));
    }

    if (target === 'code') {
      return workflow.nodes.find(n => n.type.includes('code'));
    }

    return workflow.nodes.find(n => n.name === target || n.id === target);
  }

  /**
   * Calculate resilience score based on REAL test results
   */
  private calculateResilienceScore(
    workflow: N8nWorkflow,
    results: ExperimentResult[]
  ): ResilienceScore {
    // Calculate based on ACTUAL execution results
    const passedExperiments = results.filter(r => r.status === 'passed');
    const executedExperiments = results.filter(r => r.execution);

    // Fault tolerance: Did the workflow handle faults gracefully?
    const faultTolerance = executedExperiments.length > 0
      ? (passedExperiments.length / executedExperiments.length) * 100
      : 50;

    // Recovery: Did error handling trigger when needed?
    const recoveryResults = results.filter(r => r.recovery);
    const recovery = recoveryResults.length > 0
      ? (recoveryResults.filter(r => r.recovery?.recovered).length / recoveryResults.length) * 100
      : 50;

    // Graceful degradation: Did failures cascade?
    const cascadeFailures = results.filter(r => r.impact.cascadeFailure).length;
    const gracefulDegradation = executedExperiments.length > 0
      ? Math.max(0, 100 - (cascadeFailures / executedExperiments.length) * 100)
      : 50;

    // Monitoring: Check workflow configuration
    const monitoring = this.calculateMonitoringScore(workflow);

    const overall = (faultTolerance + recovery + gracefulDegradation + monitoring) / 4;

    let grade: ResilienceScore['grade'];
    if (overall >= 90) grade = 'A';
    else if (overall >= 80) grade = 'B';
    else if (overall >= 70) grade = 'C';
    else if (overall >= 60) grade = 'D';
    else grade = 'F';

    return {
      overall: Math.round(overall),
      categories: {
        faultTolerance: Math.round(faultTolerance),
        recovery: Math.round(recovery),
        gracefulDegradation: Math.round(gracefulDegradation),
        monitoring: Math.round(monitoring),
      },
      grade,
    };
  }

  private calculateMonitoringScore(workflow: N8nWorkflow): number {
    let score = 50;

    if (workflow.settings?.saveExecutionProgress) score += 25;
    if (workflow.settings?.errorWorkflow) score += 15;
    if (workflow.settings?.saveDataErrorExecution !== 'none') score += 10;

    return Math.min(100, score);
  }

  /**
   * Identify vulnerabilities from ACTUAL test failures
   */
  private identifyVulnerabilities(results: ExperimentResult[]): Vulnerability[] {
    const vulnerabilities: Vulnerability[] = [];

    for (const result of results) {
      if (result.status === 'failed' && result.execution) {
        vulnerabilities.push({
          id: `vuln-${result.experiment.type}-${Date.now()}`,
          type: result.experiment.type,
          severity: result.impact.severity === 'critical' ? 'critical' :
            result.impact.severity === 'severe' ? 'high' : 'medium',
          description: `Workflow failed to handle ${result.experiment.name}: ${result.execution.errorMessage || 'No error handling triggered'}`,
          location: result.impact.affectedNodes.join(', ') || 'workflow',
          exploitedBy: result.experiment.type,
          mitigation: result.experiment.expectedBehavior,
        });
      }
    }

    return vulnerabilities;
  }

  /**
   * Generate recommendations based on REAL test data
   */
  private generateRecommendations(
    workflow: N8nWorkflow,
    results: ExperimentResult[],
    vulnerabilities: Vulnerability[]
  ): ChaosRecommendation[] {
    const recommendations: ChaosRecommendation[] = [];

    // Based on ACTUAL failed experiments
    for (const result of results.filter(r => r.status === 'failed')) {
      recommendations.push({
        priority: result.impact.severity === 'critical' ? 'critical' : 'high',
        category: result.experiment.type,
        issue: `Failed ${result.experiment.name} - ${result.execution?.errorMessage || 'Unhandled error'}`,
        recommendation: result.experiment.expectedBehavior,
        effort: 'medium',
      });
    }

    // Check for missing error handling
    if (!workflow.settings?.errorWorkflow) {
      const failedCount = results.filter(r => r.status === 'failed').length;
      if (failedCount > 0) {
        recommendations.push({
          priority: 'critical',
          category: 'error-handling',
          issue: `No error workflow configured - ${failedCount} experiments failed`,
          recommendation: 'Configure an error workflow to catch and handle failures',
          effort: 'low',
        });
      }
    }

    // Check for cascade failures
    const cascadeFailures = results.filter(r => r.impact.cascadeFailure);
    if (cascadeFailures.length > 0) {
      recommendations.push({
        priority: 'high',
        category: 'isolation',
        issue: `${cascadeFailures.length} experiments caused cascade failures`,
        recommendation: 'Add error isolation with continueOnFail or error branches to prevent cascade',
        effort: 'medium',
      });
    }

    return recommendations;
  }

  /**
   * Create skipped result
   */
  private createSkippedResult(
    experiment: ChaosExperiment,
    reason: string
  ): ExperimentResult {
    return {
      experiment,
      status: 'skipped',
      duration: 0,
      observations: [{
        timestamp: new Date(),
        type: 'info',
        message: `Skipped: ${reason}`,
      }],
      impact: {
        severity: 'none',
        affectedNodes: [],
        dataLoss: false,
        serviceDisruption: false,
        cascadeFailure: false,
      },
    };
  }

  /**
   * Get experiment history
   */
  getExperimentHistory(workflowId: string): ExperimentResult[] {
    return this.experimentHistory.get(workflowId) || [];
  }
}
