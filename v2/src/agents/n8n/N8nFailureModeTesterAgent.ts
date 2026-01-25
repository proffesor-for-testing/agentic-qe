/**
 * N8nFailureModeTesterAgent
 *
 * Error handling and retry semantics testing for n8n workflows:
 * - Retry/backoff behavior validation
 * - Partial failure handling in loops
 * - Error branch testing
 * - "Continue on fail" behavior
 * - Dead-letter patterns
 * - Timeout handling
 * - Error propagation analysis
 */

import { N8nBaseAgent, N8nAgentConfig } from './N8nBaseAgent';
import {
  N8nWorkflow,
  N8nNode,
  N8nExecution,
} from './types';
import { QETask, AgentCapability } from '../../types';
import {
  N8nTestHarness,
  FaultInjectionConfig,
  TestWorkflowResult,
} from './N8nTestHarness';

// ============================================================================
// Types
// ============================================================================

export interface FailureModeTestTask extends QETask {
  type: 'failure-mode-test';
  target: string; // workflowId
  options?: {
    testRetryBehavior?: boolean;
    testErrorBranches?: boolean;
    testContinueOnFail?: boolean;
    testTimeouts?: boolean;
    testPartialFailures?: boolean;
    injectFaults?: FaultInjection[];
    dryRun?: boolean; // Analyze without executing
  };
}

export interface FaultInjection {
  targetNode: string;
  faultType: 'error' | 'timeout' | 'empty-response' | 'malformed-response' | 'rate-limit';
  probability?: number; // 0-1, default 1.0
  delay?: number; // ms for timeout simulation
  errorMessage?: string;
}

export interface FailureModeTestResult {
  workflowId: string;
  workflowName: string;
  testDate: string;
  passed: boolean;
  score: number;
  errorHandlingScore: number;
  resilienceScore: number;
  findings: FailureModeFinding[];
  retryAnalysis: RetryAnalysis;
  errorBranchAnalysis: ErrorBranchAnalysis;
  continueOnFailAnalysis: ContinueOnFailAnalysis;
  recommendations: string[];
  // New: Active testing results
  faultInjectionResults?: FaultInjectionResult[];
  dlqAnalysis?: DLQAnalysis;
}

/**
 * Result of active fault injection testing
 */
export interface FaultInjectionResult {
  fault: FaultInjection;
  executed: boolean;
  errorHandled: boolean;
  retryAttempts: number;
  finalStatus: 'recovered' | 'failed-gracefully' | 'crashed' | 'timeout';
  executionTime: number;
  errorPropagation: string[]; // Nodes that received the error
  dataIntegrity: 'preserved' | 'partial-loss' | 'corrupted';
  details: string;
}

/**
 * Dead Letter Queue analysis
 */
export interface DLQAnalysis {
  hasDLQPattern: boolean;
  dlqNodes: string[];
  unhandledFailurePaths: string[];
  poisonMessageHandling: 'present' | 'partial' | 'missing';
  recommendations: string[];
}

export interface FailureModeFinding {
  type: 'missing-error-handler' | 'retry-misconfiguration' | 'silent-failure' | 'cascade-failure' | 'timeout-risk' | 'dlq-missing' | 'partial-failure-risk';
  severity: 'critical' | 'high' | 'medium' | 'low';
  node: string;
  message: string;
  details: string;
  suggestion: string;
}

export interface RetryAnalysis {
  nodesWithRetry: string[];
  nodesWithoutRetry: string[];
  retryConfigurations: Array<{
    node: string;
    maxRetries: number;
    backoffType: string;
    waitBetween: number;
    issues: string[];
  }>;
  overallScore: number;
}

export interface ErrorBranchAnalysis {
  nodesWithErrorBranch: string[];
  nodesWithoutErrorBranch: string[];
  errorBranchCoverage: number;
  orphanedErrorBranches: string[];
  errorHandlers: Array<{
    triggerNode: string;
    handlerNode: string;
    handlesAllErrors: boolean;
  }>;
}

export interface ContinueOnFailAnalysis {
  nodesWithContinueOnFail: string[];
  silentFailureRisks: string[];
  dataIntegrityRisks: Array<{
    node: string;
    risk: string;
    affectedDownstream: string[];
  }>;
}

// ============================================================================
// Error Handling Patterns
// ============================================================================

const ERROR_PRONE_NODE_TYPES = [
  'n8n-nodes-base.httpRequest',
  'n8n-nodes-base.webhook',
  'n8n-nodes-base.executeCommand',
  'n8n-nodes-base.function',
  'n8n-nodes-base.code',
  'n8n-nodes-base.postgres',
  'n8n-nodes-base.mysql',
  'n8n-nodes-base.mongodb',
  'n8n-nodes-base.redis',
  'n8n-nodes-base.ftp',
  'n8n-nodes-base.ssh',
  'n8n-nodes-base.awsLambda',
];

const LOOP_NODE_TYPES = [
  'n8n-nodes-base.splitInBatches',
  'n8n-nodes-base.loop',
];

// ============================================================================
// Agent Implementation
// ============================================================================

export class N8nFailureModeTesterAgent extends N8nBaseAgent {
  constructor(config: N8nAgentConfig) {
    const capabilities: AgentCapability[] = [
      {
        name: 'retry-analysis',
        version: '1.0.0',
        description: 'Analyze retry configurations and backoff behavior',
        parameters: {},
      },
      {
        name: 'error-branch-testing',
        version: '1.0.0',
        description: 'Test error branch handling',
        parameters: {},
      },
      {
        name: 'continue-on-fail-analysis',
        version: '1.0.0',
        description: 'Analyze continue-on-fail behavior and risks',
        parameters: {},
      },
      {
        name: 'fault-injection',
        version: '1.0.0',
        description: 'Inject faults to test error handling',
        parameters: {},
      },
    ];

    super({
      ...config,
      type: 'n8n-failure-mode-tester' as any,
      capabilities: [...capabilities, ...(config.capabilities || [])],
    });
  }

  protected async performTask(task: QETask): Promise<FailureModeTestResult> {
    const failureTask = task as FailureModeTestTask;

    if (failureTask.type !== 'failure-mode-test') {
      throw new Error(`Unsupported task type: ${failureTask.type}`);
    }

    return this.testFailureModes(failureTask.target, failureTask.options);
  }

  /**
   * Test failure modes in workflow
   */
  async testFailureModes(
    workflowId: string,
    options?: FailureModeTestTask['options'],
    providedWorkflow?: N8nWorkflow
  ): Promise<FailureModeTestResult> {
    const workflow = providedWorkflow || await this.getWorkflow(workflowId);
    const findings: FailureModeFinding[] = [];
    const recommendations: string[] = [];

    // 1. Analyze retry configurations
    const retryAnalysis = this.analyzeRetryConfigurations(workflow);
    findings.push(...this.retryConfigToFindings(retryAnalysis));

    // 2. Analyze error branches
    const errorBranchAnalysis = this.analyzeErrorBranches(workflow);
    findings.push(...this.errorBranchToFindings(errorBranchAnalysis, workflow));

    // 3. Analyze continue-on-fail settings
    const continueOnFailAnalysis = this.analyzeContinueOnFail(workflow);
    findings.push(...this.continueOnFailToFindings(continueOnFailAnalysis));

    // 4. Check for partial failure risks in loops
    if (options?.testPartialFailures !== false) {
      findings.push(...this.checkPartialFailureRisks(workflow));
    }

    // 5. Check for timeout risks
    if (options?.testTimeouts !== false) {
      findings.push(...this.checkTimeoutRisks(workflow));
    }

    // 6. Check for dead-letter patterns
    findings.push(...this.checkDeadLetterPatterns(workflow));

    // 7. Analyze DLQ patterns (enhanced)
    const dlqAnalysis = this.analyzeDLQPatterns(workflow);

    // 8. Execute fault injection tests if requested and not dry run
    let faultInjectionResults: FaultInjectionResult[] | undefined;
    if (options?.injectFaults && !options.dryRun) {
      faultInjectionResults = await this.executeFaultInjectionTests(
        workflowId,
        options.injectFaults,
        workflow
      );

      // Add findings from fault injection results
      for (const faultResult of faultInjectionResults) {
        if (!faultResult.errorHandled && faultResult.executed) {
          findings.push({
            type: 'missing-error-handler',
            severity: 'high',
            node: faultResult.fault.targetNode,
            message: `Fault injection test failed: ${faultResult.fault.faultType} was not handled`,
            details: faultResult.details,
            suggestion: 'Add error handling (retry, error branch, or continue-on-fail) for this node',
          });
        }
        if (faultResult.dataIntegrity === 'corrupted') {
          findings.push({
            type: 'cascade-failure',
            severity: 'critical',
            node: faultResult.fault.targetNode,
            message: `Data corruption detected after ${faultResult.fault.faultType} fault`,
            details: `Error propagated to: ${faultResult.errorPropagation.join(' -> ')}`,
            suggestion: 'Add data validation and rollback mechanisms',
          });
        }
      }
    }

    // Generate recommendations
    recommendations.push(...this.generateRecommendations(findings, retryAnalysis, errorBranchAnalysis, continueOnFailAnalysis));
    recommendations.push(...dlqAnalysis.recommendations);

    // Calculate scores
    const errorHandlingScore = this.calculateErrorHandlingScore(errorBranchAnalysis, retryAnalysis);
    const resilienceScore = this.calculateResilienceScore(findings);
    const score = Math.round((errorHandlingScore + resilienceScore) / 2);

    const result: FailureModeTestResult = {
      workflowId: workflow.id || workflowId,
      workflowName: workflow.name,
      testDate: new Date().toISOString(),
      passed: findings.filter(f => f.severity === 'critical' || f.severity === 'high').length === 0,
      score,
      errorHandlingScore,
      resilienceScore,
      findings,
      retryAnalysis,
      errorBranchAnalysis,
      continueOnFailAnalysis,
      recommendations,
      faultInjectionResults,
      dlqAnalysis,
    };

    // Store result
    await this.storeTestResult(`failure-mode-test:${workflowId}`, result);

    // Emit event
    this.emitEvent('failure-mode.test.completed', {
      workflowId,
      passed: result.passed,
      errorHandlingScore,
      resilienceScore,
      findingCount: findings.length,
    });

    return result;
  }

  /**
   * Analyze retry configurations
   */
  private analyzeRetryConfigurations(workflow: N8nWorkflow): RetryAnalysis {
    const nodesWithRetry: string[] = [];
    const nodesWithoutRetry: string[] = [];
    const retryConfigurations: RetryAnalysis['retryConfigurations'] = [];

    for (const node of workflow.nodes) {
      const isErrorProne = ERROR_PRONE_NODE_TYPES.some(t => node.type.includes(t));
      const settings = node.parameters as Record<string, unknown>;

      // Check for retry settings
      const hasRetry = settings.options && typeof settings.options === 'object' &&
        ('retry' in (settings.options as object) || 'retryOnFail' in (settings.options as object));

      if (hasRetry) {
        nodesWithRetry.push(node.name);

        const retryOptions = (settings.options || {}) as Record<string, unknown>;
        const retrySubOptions = (retryOptions.retry || {}) as Record<string, unknown>;
        const issues: string[] = [];

        // Analyze retry configuration
        const maxRetries = ((retryOptions.maxTries ?? retrySubOptions.maxTries) || 3) as number;
        const waitBetween = ((retryOptions.waitBetweenTries ?? retrySubOptions.waitBetweenTries) || 1000) as number;

        if (maxRetries > 10) {
          issues.push('Excessive retry count may cause long execution times');
        }
        if (maxRetries < 2 && isErrorProne) {
          issues.push('Low retry count for error-prone node type');
        }
        if (waitBetween < 500) {
          issues.push('Short wait between retries may trigger rate limits');
        }

        retryConfigurations.push({
          node: node.name,
          maxRetries,
          backoffType: 'fixed', // n8n uses fixed by default
          waitBetween,
          issues,
        });
      } else if (isErrorProne) {
        nodesWithoutRetry.push(node.name);
      }
    }

    const errorProneNodes = workflow.nodes.filter(n =>
      ERROR_PRONE_NODE_TYPES.some(t => n.type.includes(t))
    ).length;

    const overallScore = errorProneNodes > 0
      ? Math.round((nodesWithRetry.length / errorProneNodes) * 100)
      : 100;

    return {
      nodesWithRetry,
      nodesWithoutRetry,
      retryConfigurations,
      overallScore,
    };
  }

  /**
   * Analyze error branches
   */
  private analyzeErrorBranches(workflow: N8nWorkflow): ErrorBranchAnalysis {
    const nodesWithErrorBranch: string[] = [];
    const nodesWithoutErrorBranch: string[] = [];
    const errorHandlers: ErrorBranchAnalysis['errorHandlers'] = [];
    const orphanedErrorBranches: string[] = [];

    for (const node of workflow.nodes) {
      const isErrorProne = ERROR_PRONE_NODE_TYPES.some(t => node.type.includes(t));

      // Check if node has error output connection
      const connections = workflow.connections[node.name];
      const hasErrorBranch = connections?.main && connections.main.length > 1;

      if (hasErrorBranch) {
        nodesWithErrorBranch.push(node.name);

        // Check if error branch leads somewhere
        const errorOutputConnections = connections.main[1];
        if (!errorOutputConnections || errorOutputConnections.length === 0) {
          orphanedErrorBranches.push(node.name);
        } else {
          for (const conn of errorOutputConnections) {
            errorHandlers.push({
              triggerNode: node.name,
              handlerNode: conn.node,
              handlesAllErrors: true, // Would need runtime analysis to determine
            });
          }
        }
      } else if (isErrorProne) {
        nodesWithoutErrorBranch.push(node.name);
      }
    }

    const errorProneNodes = workflow.nodes.filter(n =>
      ERROR_PRONE_NODE_TYPES.some(t => n.type.includes(t))
    ).length;

    const errorBranchCoverage = errorProneNodes > 0
      ? Math.round((nodesWithErrorBranch.length / errorProneNodes) * 100)
      : 100;

    return {
      nodesWithErrorBranch,
      nodesWithoutErrorBranch,
      errorBranchCoverage,
      orphanedErrorBranches,
      errorHandlers,
    };
  }

  /**
   * Analyze continue-on-fail settings
   */
  private analyzeContinueOnFail(workflow: N8nWorkflow): ContinueOnFailAnalysis {
    const nodesWithContinueOnFail: string[] = [];
    const silentFailureRisks: string[] = [];
    const dataIntegrityRisks: ContinueOnFailAnalysis['dataIntegrityRisks'] = [];

    for (const node of workflow.nodes) {
      const settings = node.parameters as Record<string, unknown>;
      const hasContinueOnFail = settings.continueOnFail === true ||
        (settings.options && (settings.options as Record<string, unknown>).continueOnFail === true);

      if (hasContinueOnFail) {
        nodesWithContinueOnFail.push(node.name);

        // Check if there's error handling after this node
        const connections = workflow.connections[node.name];
        const hasErrorHandling = connections?.main && connections.main.length > 1;

        if (!hasErrorHandling) {
          silentFailureRisks.push(node.name);
        }

        // Find downstream nodes that might receive bad data
        const downstream = this.getDownstreamNodes(workflow, node.name);
        if (downstream.length > 0) {
          dataIntegrityRisks.push({
            node: node.name,
            risk: 'Continue on fail may pass incomplete/bad data downstream',
            affectedDownstream: downstream.map(n => n.name),
          });
        }
      }
    }

    return {
      nodesWithContinueOnFail,
      silentFailureRisks,
      dataIntegrityRisks,
    };
  }

  /**
   * Check for partial failure risks in loops
   */
  private checkPartialFailureRisks(workflow: N8nWorkflow): FailureModeFinding[] {
    const findings: FailureModeFinding[] = [];

    // Find loop nodes
    const loopNodes = workflow.nodes.filter(n =>
      LOOP_NODE_TYPES.some(t => n.type.includes(t))
    );

    for (const loopNode of loopNodes) {
      // Check if nodes inside loop have error handling
      const downstream = this.getDownstreamNodes(workflow, loopNode.name);
      const errorProneInLoop = downstream.filter(n =>
        ERROR_PRONE_NODE_TYPES.some(t => n.type.includes(t))
      );

      for (const errorProneNode of errorProneInLoop) {
        const connections = workflow.connections[errorProneNode.name];
        const hasErrorBranch = connections?.main && connections.main.length > 1;

        if (!hasErrorBranch) {
          findings.push({
            type: 'partial-failure-risk',
            severity: 'high',
            node: errorProneNode.name,
            message: `Error-prone node in loop without error handling`,
            details: `Node "${errorProneNode.name}" is inside loop "${loopNode.name}" but has no error branch. A single item failure could stop the entire loop.`,
            suggestion: 'Add error handling or use "continue on fail" with error logging',
          });
        }
      }
    }

    return findings;
  }

  /**
   * Check for timeout risks
   */
  private checkTimeoutRisks(workflow: N8nWorkflow): FailureModeFinding[] {
    const findings: FailureModeFinding[] = [];

    for (const node of workflow.nodes) {
      // Check HTTP nodes for timeout settings
      if (node.type.includes('httpRequest')) {
        const settings = node.parameters as Record<string, unknown>;
        const options = settings.options as Record<string, unknown> | undefined;
        const timeout = options?.timeout as number | undefined;

        if (!timeout) {
          findings.push({
            type: 'timeout-risk',
            severity: 'medium',
            node: node.name,
            message: 'HTTP request without explicit timeout',
            details: 'Missing timeout may cause workflow to hang indefinitely',
            suggestion: 'Set explicit timeout in node options',
          });
        } else if (timeout > 300000) { // 5 minutes
          findings.push({
            type: 'timeout-risk',
            severity: 'low',
            node: node.name,
            message: 'HTTP request with very long timeout',
            details: `Timeout set to ${timeout / 1000}s which may cause long hangs`,
            suggestion: 'Consider shorter timeout with retry logic',
          });
        }
      }

      // Check execute command nodes
      if (node.type.includes('executeCommand')) {
        findings.push({
          type: 'timeout-risk',
          severity: 'medium',
          node: node.name,
          message: 'Execute command without timeout control',
          details: 'Shell commands can hang indefinitely',
          suggestion: 'Add timeout to command or use n8n timeout settings',
        });
      }
    }

    return findings;
  }

  /**
   * Check for dead-letter patterns
   */
  private checkDeadLetterPatterns(workflow: N8nWorkflow): FailureModeFinding[] {
    const findings: FailureModeFinding[] = [];

    // Check if workflow has any error notification/logging at the end
    const hasErrorWorkflow = workflow.settings?.errorWorkflow;
    const hasErrorNotification = workflow.nodes.some(n =>
      n.type.includes('email') || n.type.includes('slack') || n.type.includes('telegram')
    );

    // Check for nodes that send to DLQ or error queue
    const hasDLQPattern = workflow.nodes.some(n => {
      const params = JSON.stringify(n.parameters).toLowerCase();
      return params.includes('dlq') || params.includes('dead') || params.includes('error-queue');
    });

    if (!hasErrorWorkflow && !hasErrorNotification && !hasDLQPattern) {
      findings.push({
        type: 'dlq-missing',
        severity: 'medium',
        node: 'workflow',
        message: 'No dead-letter or error notification pattern detected',
        details: 'Failed executions may go unnoticed without error notifications',
        suggestion: 'Add error workflow in workflow settings or add notification node for failures',
      });
    }

    return findings;
  }

  /**
   * Execute fault injection tests
   */
  private async executeFaultInjection(
    workflow: N8nWorkflow,
    faults: FaultInjection[]
  ): Promise<FailureModeFinding[]> {
    const findings: FailureModeFinding[] = [];

    // Note: Actual fault injection would require modifying workflow or using n8n's testing features
    // This is a placeholder for the concept
    for (const fault of faults) {
      const targetNode = workflow.nodes.find(n => n.name === fault.targetNode);
      if (!targetNode) {
        findings.push({
          type: 'missing-error-handler',
          severity: 'low',
          node: fault.targetNode,
          message: `Fault injection target "${fault.targetNode}" not found`,
          details: 'Cannot inject fault to non-existent node',
          suggestion: 'Check node name spelling',
        });
        continue;
      }

      // Check if node has error handling for the injected fault type
      const connections = workflow.connections[fault.targetNode];
      const hasErrorBranch = connections?.main && connections.main.length > 1;

      if (!hasErrorBranch) {
        findings.push({
          type: 'missing-error-handler',
          severity: 'high',
          node: fault.targetNode,
          message: `No error handler for ${fault.faultType} fault`,
          details: `If ${fault.faultType} occurs, the workflow will fail without graceful handling`,
          suggestion: 'Add error branch to handle this failure mode',
        });
      }
    }

    return findings;
  }

  /**
   * Convert retry analysis to findings
   */
  private retryConfigToFindings(analysis: RetryAnalysis): FailureModeFinding[] {
    const findings: FailureModeFinding[] = [];

    for (const node of analysis.nodesWithoutRetry) {
      findings.push({
        type: 'retry-misconfiguration',
        severity: 'medium',
        node,
        message: 'Error-prone node without retry configuration',
        details: 'Transient failures will cause immediate workflow failure',
        suggestion: 'Add retry settings in node options',
      });
    }

    for (const config of analysis.retryConfigurations) {
      for (const issue of config.issues) {
        findings.push({
          type: 'retry-misconfiguration',
          severity: 'low',
          node: config.node,
          message: issue,
          details: `Current retry config: ${config.maxRetries} retries, ${config.waitBetween}ms wait`,
          suggestion: 'Adjust retry settings based on expected failure modes',
        });
      }
    }

    return findings;
  }

  /**
   * Convert error branch analysis to findings
   */
  private errorBranchToFindings(analysis: ErrorBranchAnalysis, workflow: N8nWorkflow): FailureModeFinding[] {
    const findings: FailureModeFinding[] = [];

    for (const node of analysis.nodesWithoutErrorBranch) {
      findings.push({
        type: 'missing-error-handler',
        severity: 'medium',
        node,
        message: 'Error-prone node without error branch',
        details: 'Errors will propagate to workflow level without graceful handling',
        suggestion: 'Add error branch to handle failures gracefully',
      });
    }

    for (const orphan of analysis.orphanedErrorBranches) {
      findings.push({
        type: 'missing-error-handler',
        severity: 'low',
        node: orphan,
        message: 'Error branch exists but is not connected',
        details: 'Error output has no target node',
        suggestion: 'Connect error branch to an error handler node',
      });
    }

    return findings;
  }

  /**
   * Convert continue-on-fail analysis to findings
   */
  private continueOnFailToFindings(analysis: ContinueOnFailAnalysis): FailureModeFinding[] {
    const findings: FailureModeFinding[] = [];

    for (const node of analysis.silentFailureRisks) {
      findings.push({
        type: 'silent-failure',
        severity: 'high',
        node,
        message: 'Continue on fail without error tracking',
        details: 'Failures will be silently ignored without logging or notification',
        suggestion: 'Add error logging/notification when using continue on fail',
      });
    }

    for (const risk of analysis.dataIntegrityRisks) {
      findings.push({
        type: 'cascade-failure',
        severity: 'medium',
        node: risk.node,
        message: risk.risk,
        details: `May affect: ${risk.affectedDownstream.join(', ')}`,
        suggestion: 'Add data validation after nodes with continue on fail',
      });
    }

    return findings;
  }

  /**
   * Calculate error handling score
   */
  private calculateErrorHandlingScore(
    errorBranchAnalysis: ErrorBranchAnalysis,
    retryAnalysis: RetryAnalysis
  ): number {
    const errorBranchScore = errorBranchAnalysis.errorBranchCoverage;
    const retryScore = retryAnalysis.overallScore;
    return Math.round((errorBranchScore + retryScore) / 2);
  }

  /**
   * Calculate resilience score
   */
  private calculateResilienceScore(findings: FailureModeFinding[]): number {
    const criticalCount = findings.filter(f => f.severity === 'critical').length;
    const highCount = findings.filter(f => f.severity === 'high').length;
    const mediumCount = findings.filter(f => f.severity === 'medium').length;

    return Math.max(0, 100 - (criticalCount * 25) - (highCount * 15) - (mediumCount * 5));
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(
    findings: FailureModeFinding[],
    retryAnalysis: RetryAnalysis,
    errorBranchAnalysis: ErrorBranchAnalysis,
    continueOnFailAnalysis: ContinueOnFailAnalysis
  ): string[] {
    const recommendations: string[] = [];

    if (retryAnalysis.nodesWithoutRetry.length > 0) {
      recommendations.push(
        `Add retry configuration to ${retryAnalysis.nodesWithoutRetry.length} error-prone nodes`
      );
    }

    if (errorBranchAnalysis.errorBranchCoverage < 50) {
      recommendations.push(
        'Error branch coverage is low - add error handling to critical nodes'
      );
    }

    if (continueOnFailAnalysis.silentFailureRisks.length > 0) {
      recommendations.push(
        'Add error logging when using "continue on fail" to avoid silent failures'
      );
    }

    const dlqFindings = findings.filter(f => f.type === 'dlq-missing');
    if (dlqFindings.length > 0) {
      recommendations.push(
        'Consider adding error workflow or notification for failed executions'
      );
    }

    return recommendations;
  }

  // ============================================================================
  // Active Fault Injection Testing
  // ============================================================================

  /**
   * Execute fault injection tests against a live workflow
   * This actually runs the workflow with injected faults to verify error handling
   */
  async executeFaultInjectionTests(
    workflowId: string,
    faults?: FaultInjection[],
    providedWorkflow?: N8nWorkflow
  ): Promise<FaultInjectionResult[]> {
    const results: FaultInjectionResult[] = [];
    const workflow = providedWorkflow || await this.getWorkflow(workflowId);

    // If no faults specified, auto-generate faults for error-prone nodes
    const faultsToTest = faults || this.generateDefaultFaults(workflow);

    if (faultsToTest.length === 0) {
      return results;
    }

    // Create test harness
    const harness = new N8nTestHarness(this.n8nConfig);

    try {
      for (const fault of faultsToTest) {
        const result = await this.executeSingleFaultTest(harness, workflowId, fault, workflow);
        results.push(result);
      }
    } finally {
      await harness.cleanup();
    }

    return results;
  }

  /**
   * Generate default faults for error-prone nodes
   */
  private generateDefaultFaults(workflow: N8nWorkflow): FaultInjection[] {
    const faults: FaultInjection[] = [];

    for (const node of workflow.nodes) {
      const isErrorProne = ERROR_PRONE_NODE_TYPES.some(t => node.type.includes(t));
      if (!isErrorProne) continue;

      // Add error fault
      faults.push({
        targetNode: node.name,
        faultType: 'error',
        errorMessage: `Simulated error in ${node.name}`,
      });

      // Add timeout fault for HTTP nodes
      if (node.type.includes('httpRequest')) {
        faults.push({
          targetNode: node.name,
          faultType: 'timeout',
          delay: 5000,
        });
      }

      // Add empty response fault
      faults.push({
        targetNode: node.name,
        faultType: 'empty-response',
      });
    }

    return faults;
  }

  /**
   * Execute a single fault injection test
   */
  private async executeSingleFaultTest(
    harness: N8nTestHarness,
    workflowId: string,
    fault: FaultInjection,
    workflow: N8nWorkflow
  ): Promise<FaultInjectionResult> {
    const startTime = Date.now();

    // Convert to harness format
    const faultConfig: FaultInjectionConfig = {
      targetNode: fault.targetNode,
      faultType: fault.faultType === 'rate-limit' ? 'rate-limit' : fault.faultType,
      probability: fault.probability,
      delay: fault.delay,
      errorMessage: fault.errorMessage,
    };

    try {
      const testResult = await harness.executeWithFaults(workflowId, [faultConfig]);

      // Analyze the result
      return this.analyzeFaultTestResult(fault, testResult, workflow, Date.now() - startTime);
    } catch (error) {
      return {
        fault,
        executed: false,
        errorHandled: false,
        retryAttempts: 0,
        finalStatus: 'crashed',
        executionTime: Date.now() - startTime,
        errorPropagation: [],
        dataIntegrity: 'corrupted',
        details: `Failed to execute fault test: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Analyze the result of a fault injection test
   */
  private analyzeFaultTestResult(
    fault: FaultInjection,
    testResult: TestWorkflowResult,
    workflow: N8nWorkflow,
    executionTime: number
  ): FaultInjectionResult {
    const execution = testResult.execution;

    if (!execution) {
      return {
        fault,
        executed: true,
        errorHandled: false,
        retryAttempts: 0,
        finalStatus: testResult.error?.includes('timeout') ? 'timeout' : 'crashed',
        executionTime,
        errorPropagation: [],
        dataIntegrity: 'corrupted',
        details: testResult.error || 'Execution failed with no result',
      };
    }

    // Analyze execution data
    const runData = execution.data?.resultData?.runData || {};
    const errorNodes = this.findErrorNodes(runData);
    const retryAttempts = this.countRetryAttempts(runData, fault.targetNode);

    // Check if error was handled
    const hasErrorBranch = this.checkErrorBranchUsed(workflow, fault.targetNode, runData);
    const hasContinueOnFail = this.checkContinueOnFailUsed(workflow, fault.targetNode, runData);
    const errorHandled = hasErrorBranch || hasContinueOnFail || retryAttempts > 0;

    // Determine final status
    let finalStatus: FaultInjectionResult['finalStatus'] = 'crashed';
    if (execution.finished && !execution.data?.resultData?.error) {
      finalStatus = errorHandled ? 'recovered' : 'failed-gracefully';
    } else if (errorHandled) {
      finalStatus = 'failed-gracefully';
    }

    // Check data integrity
    const dataIntegrity = this.assessDataIntegrity(workflow, runData, fault.targetNode);

    // Track error propagation
    const errorPropagation = this.traceErrorPropagation(workflow, fault.targetNode, runData);

    return {
      fault,
      executed: true,
      errorHandled,
      retryAttempts,
      finalStatus,
      executionTime,
      errorPropagation,
      dataIntegrity,
      details: this.generateFaultTestDetails(fault, errorHandled, retryAttempts, finalStatus),
    };
  }

  /**
   * Find nodes that had errors in execution
   */
  private findErrorNodes(runData: Record<string, unknown>): string[] {
    const errorNodes: string[] = [];
    for (const [nodeName, runs] of Object.entries(runData)) {
      const nodeRuns = runs as Array<{ error?: unknown }>;
      if (nodeRuns.some(run => run.error)) {
        errorNodes.push(nodeName);
      }
    }
    return errorNodes;
  }

  /**
   * Count retry attempts for a node
   */
  private countRetryAttempts(runData: Record<string, unknown>, nodeName: string): number {
    const nodeRuns = runData[nodeName] as Array<unknown> | undefined;
    if (!nodeRuns) return 0;
    // Multiple runs of the same node indicate retries
    return Math.max(0, nodeRuns.length - 1);
  }

  /**
   * Check if error branch was used
   */
  private checkErrorBranchUsed(
    workflow: N8nWorkflow,
    faultNode: string,
    runData: Record<string, unknown>
  ): boolean {
    const connections = workflow.connections[faultNode];
    if (!connections?.main || connections.main.length < 2) return false;

    // Check if error output (index 1) was executed
    const errorOutputConnections = connections.main[1];
    if (!errorOutputConnections) return false;

    return errorOutputConnections.some(conn => {
      const connectedNodeRuns = runData[conn.node];
      return connectedNodeRuns && (connectedNodeRuns as Array<unknown>).length > 0;
    });
  }

  /**
   * Check if continue-on-fail was used
   */
  private checkContinueOnFailUsed(
    workflow: N8nWorkflow,
    faultNode: string,
    runData: Record<string, unknown>
  ): boolean {
    const node = workflow.nodes.find(n => n.name === faultNode);
    if (!node) return false;

    const params = node.parameters as Record<string, unknown>;
    const hasContinueOnFail = params.continueOnFail === true ||
      (params.options && (params.options as Record<string, unknown>).continueOnFail === true);

    if (!hasContinueOnFail) return false;

    // Check if downstream nodes executed despite error
    const connections = workflow.connections[faultNode];
    if (!connections?.main?.[0]) return false;

    return connections.main[0].some(conn => {
      const connectedNodeRuns = runData[conn.node];
      return connectedNodeRuns && (connectedNodeRuns as Array<unknown>).length > 0;
    });
  }

  /**
   * Assess data integrity after fault
   */
  private assessDataIntegrity(
    workflow: N8nWorkflow,
    runData: Record<string, unknown>,
    faultNode: string
  ): FaultInjectionResult['dataIntegrity'] {
    // Get downstream nodes
    const downstream = this.getDownstreamNodes(workflow, faultNode);

    // Check if any downstream nodes ran
    const downstreamRan = downstream.filter(node => {
      const runs = runData[node.name];
      return runs && (runs as Array<unknown>).length > 0;
    });

    if (downstreamRan.length === 0) {
      // Error stopped propagation - data preserved (nothing bad happened downstream)
      return 'preserved';
    }

    // Check if downstream received valid data
    let hasValidData = true;
    let hasCorruptedData = false;

    for (const node of downstreamRan) {
      const runs = runData[node.name] as Array<{ data?: { main?: Array<Array<{ json: unknown }>> }, error?: unknown }>;
      for (const run of runs) {
        if (run.error) {
          hasCorruptedData = true;
        }
        const outputData = run.data?.main?.[0]?.[0]?.json;
        if (outputData === undefined || outputData === null) {
          hasValidData = false;
        }
      }
    }

    if (hasCorruptedData) return 'corrupted';
    if (!hasValidData) return 'partial-loss';
    return 'preserved';
  }

  /**
   * Trace how error propagated through workflow
   */
  private traceErrorPropagation(
    workflow: N8nWorkflow,
    faultNode: string,
    runData: Record<string, unknown>
  ): string[] {
    const propagation: string[] = [faultNode];
    const visited = new Set<string>([faultNode]);

    const queue = [faultNode];
    while (queue.length > 0) {
      const current = queue.shift()!;
      const connections = workflow.connections[current];

      if (!connections?.main) continue;

      for (const outputs of connections.main) {
        if (!outputs) continue;
        for (const conn of outputs) {
          if (visited.has(conn.node)) continue;
          visited.add(conn.node);

          // Check if this node was affected by the error
          const runs = runData[conn.node] as Array<{ error?: unknown }> | undefined;
          if (runs?.some(r => r.error)) {
            propagation.push(conn.node);
            queue.push(conn.node);
          }
        }
      }
    }

    return propagation;
  }

  /**
   * Generate human-readable details for fault test
   */
  private generateFaultTestDetails(
    fault: FaultInjection,
    errorHandled: boolean,
    retryAttempts: number,
    finalStatus: FaultInjectionResult['finalStatus']
  ): string {
    const parts: string[] = [];

    parts.push(`Injected ${fault.faultType} fault into "${fault.targetNode}".`);

    if (retryAttempts > 0) {
      parts.push(`Node retried ${retryAttempts} time(s).`);
    }

    if (errorHandled) {
      parts.push('Error was handled by workflow.');
    } else {
      parts.push('Error was NOT handled - no error branch or retry configured.');
    }

    parts.push(`Final status: ${finalStatus}.`);

    return parts.join(' ');
  }

  /**
   * Analyze Dead Letter Queue patterns
   */
  analyzeDLQPatterns(workflow: N8nWorkflow): DLQAnalysis {
    const dlqNodes: string[] = [];
    const unhandledFailurePaths: string[] = [];
    const recommendations: string[] = [];

    // Look for DLQ-like patterns
    for (const node of workflow.nodes) {
      const nameLower = node.name.toLowerCase();
      const typeLower = node.type.toLowerCase();

      // Common DLQ indicators
      if (
        nameLower.includes('dlq') ||
        nameLower.includes('dead') ||
        nameLower.includes('failed') ||
        nameLower.includes('error-queue') ||
        nameLower.includes('retry-queue')
      ) {
        dlqNodes.push(node.name);
      }

      // Check for error notification patterns
      if (
        (typeLower.includes('slack') || typeLower.includes('email') || typeLower.includes('telegram')) &&
        (nameLower.includes('error') || nameLower.includes('alert') || nameLower.includes('notify'))
      ) {
        dlqNodes.push(node.name);
      }
    }

    // Find error-prone nodes without error handling leading to DLQ
    for (const node of workflow.nodes) {
      const isErrorProne = ERROR_PRONE_NODE_TYPES.some(t => node.type.includes(t));
      if (!isErrorProne) continue;

      const connections = workflow.connections[node.name];
      const hasErrorBranch = connections?.main && connections.main.length > 1;

      if (!hasErrorBranch) {
        unhandledFailurePaths.push(node.name);
      } else {
        // Check if error branch leads to DLQ
        const errorOutputs = connections?.main?.[1] || [];
        const leadsToDLQ = errorOutputs.some(conn =>
          dlqNodes.includes(conn.node) ||
          this.eventuallyLeadsTo(workflow, conn.node, dlqNodes)
        );

        if (!leadsToDLQ) {
          unhandledFailurePaths.push(node.name);
        }
      }
    }

    // Determine poison message handling
    let poisonMessageHandling: DLQAnalysis['poisonMessageHandling'] = 'missing';
    if (dlqNodes.length > 0) {
      poisonMessageHandling = unhandledFailurePaths.length === 0 ? 'present' : 'partial';
    }

    // Generate recommendations
    if (dlqNodes.length === 0) {
      recommendations.push('Add a dead-letter queue pattern for failed message handling');
      recommendations.push('Consider adding error notification (Slack, Email) for critical failures');
    }

    if (unhandledFailurePaths.length > 0) {
      recommendations.push(
        `Add error branches for: ${unhandledFailurePaths.slice(0, 3).join(', ')}${unhandledFailurePaths.length > 3 ? '...' : ''}`
      );
    }

    return {
      hasDLQPattern: dlqNodes.length > 0,
      dlqNodes,
      unhandledFailurePaths,
      poisonMessageHandling,
      recommendations,
    };
  }

  /**
   * Check if a node eventually leads to any of the target nodes
   */
  private eventuallyLeadsTo(
    workflow: N8nWorkflow,
    startNode: string,
    targetNodes: string[]
  ): boolean {
    const visited = new Set<string>();
    const queue = [startNode];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);

      if (targetNodes.includes(current)) {
        return true;
      }

      const connections = workflow.connections[current];
      if (!connections?.main) continue;

      for (const outputs of connections.main) {
        if (!outputs) continue;
        for (const conn of outputs) {
          queue.push(conn.node);
        }
      }
    }

    return false;
  }

  /**
   * Quick failure mode check
   */
  async quickCheck(workflowId: string): Promise<{
    resilient: boolean;
    errorHandlingScore: number;
    criticalIssues: number;
    topIssue: string | null;
  }> {
    const result = await this.testFailureModes(workflowId, { dryRun: true });

    return {
      resilient: result.passed,
      errorHandlingScore: result.errorHandlingScore,
      criticalIssues: result.findings.filter(f => f.severity === 'critical').length,
      topIssue: result.findings[0]?.message || null,
    };
  }
}
