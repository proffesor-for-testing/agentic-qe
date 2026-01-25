/**
 * N8nWorkflowExecutorAgent
 *
 * Executes and validates n8n workflows programmatically with:
 * - Test data injection
 * - Output assertions
 * - Data flow validation
 * - Performance measurement
 * - Error handling validation
 */

import { N8nBaseAgent, N8nAgentConfig } from './N8nBaseAgent';
import {
  N8nWorkflow,
  N8nExecution,
  N8nWorkflowExecutorConfig,
  ValidationResult,
} from './types';
import { QETask, AgentCapability } from '../../types';

export interface WorkflowExecutionResult {
  workflowId: string;
  executionId: string;
  status: 'success' | 'failed' | 'error';
  duration: number;
  nodesExecuted: number;
  totalNodes: number;
  dataFlowValid: boolean;
  assertions: AssertionResult[];
  metrics: ExecutionMetrics;
  errors: ExecutionError[];
}

export interface AssertionResult {
  name: string;
  expected: unknown;
  actual: unknown;
  passed: boolean;
  node?: string;
}

export interface ExecutionMetrics {
  totalDuration: number;
  nodeMetrics: NodeMetric[];
  bottleneck: string | null;
  throughput?: number;
}

export interface NodeMetric {
  node: string;
  duration: number;
  percentage: number;
  status: string;
}

export interface ExecutionError {
  node: string;
  message: string;
  type: string;
  recoverable: boolean;
}

export interface ExecutionTask extends QETask {
  type: 'workflow-execution';
  target: string; // workflowId
  input?: Record<string, unknown>;
  assertions?: Array<{
    name: string;
    node?: string;
    field: string;
    expected: unknown;
    operator?: 'equals' | 'contains' | 'matches' | 'greaterThan' | 'lessThan';
  }>;
  options?: {
    timeout?: number;
    validateDataFlow?: boolean;
    validateStructure?: boolean;
    iterations?: number;
  };
}

export class N8nWorkflowExecutorAgent extends N8nBaseAgent {
  private readonly executorConfig: N8nWorkflowExecutorConfig;

  constructor(config: N8nAgentConfig & Partial<N8nWorkflowExecutorConfig>) {
    const capabilities: AgentCapability[] = [
      {
        name: 'workflow-execution',
        version: '1.0.0',
        description: 'Execute n8n workflows with test data injection',
        parameters: { timeout: config.timeout ?? 30000 },
      },
      {
        name: 'output-assertion',
        version: '1.0.0',
        description: 'Assert expected outputs from workflow execution',
        parameters: {},
      },
      {
        name: 'data-flow-validation',
        version: '1.0.0',
        description: 'Validate data flows correctly between nodes',
        parameters: {},
      },
      {
        name: 'performance-measurement',
        version: '1.0.0',
        description: 'Measure and analyze execution performance',
        parameters: {},
      },
    ];

    super({
      ...config,
      type: 'n8n-workflow-executor' as any,
      capabilities: [...capabilities, ...(config.capabilities || [])],
    });

    this.executorConfig = {
      n8nConfig: config.n8nConfig,
      timeout: config.timeout ?? 30000,
      retries: config.retries ?? 3,
      validateBeforeExecution: config.validateBeforeExecution ?? true,
    };
  }

  protected async performTask(task: QETask): Promise<WorkflowExecutionResult> {
    const execTask = task as ExecutionTask;

    if (execTask.type !== 'workflow-execution') {
      throw new Error(`Unsupported task type: ${execTask.type}`);
    }

    return this.executeAndValidate(execTask);
  }

  /**
   * Execute workflow and validate results
   */
  async executeAndValidate(task: ExecutionTask): Promise<WorkflowExecutionResult> {
    const workflowId = task.target;
    const startTime = Date.now();

    // Get workflow
    const workflow = await this.getWorkflow(workflowId);

    // Optionally validate structure first
    if (task.options?.validateStructure) {
      const validation = this.validateWorkflowStructure(workflow);
      if (!validation.valid) {
        return this.createErrorResult(workflowId, 'Structure validation failed', startTime);
      }
    }

    // Execute workflow
    let execution: N8nExecution;
    try {
      execution = await this.executeWorkflow(workflowId, task.input, {
        waitForCompletion: true,
        timeout: task.options?.timeout ?? this.executorConfig.timeout,
      });
    } catch (error) {
      return this.createErrorResult(
        workflowId,
        error instanceof Error ? error.message : 'Execution failed',
        startTime
      );
    }

    // Calculate metrics
    const metrics = this.calculateExecutionMetrics(execution);

    // Validate data flow
    let dataFlowValid = true;
    if (task.options?.validateDataFlow) {
      dataFlowValid = this.validateDataFlow(workflow, execution);
    }

    // Run assertions
    const assertions = task.assertions
      ? this.runAssertions(execution, task.assertions)
      : [];

    // Extract errors
    const errors = this.extractErrors(execution);

    // Determine overall status
    const allAssertionsPassed = assertions.every(a => a.passed);
    const executionSucceeded = execution.status === 'success';
    const status = executionSucceeded && allAssertionsPassed && dataFlowValid
      ? 'success'
      : 'failed';

    const result: WorkflowExecutionResult = {
      workflowId,
      executionId: execution.id,
      status,
      duration: Date.now() - startTime,
      nodesExecuted: Object.keys(execution.data?.resultData?.runData || {}).length,
      totalNodes: workflow.nodes.length,
      dataFlowValid,
      assertions,
      metrics: {
        totalDuration: metrics.totalDuration,
        nodeMetrics: metrics.nodeMetrics,
        bottleneck: metrics.bottleneck,
      },
      errors,
    };

    // Store result
    await this.storeTestResult(`execution:${execution.id}`, result);

    // Emit completion event
    this.emitEvent('workflow.execution.validated', {
      workflowId,
      executionId: execution.id,
      status,
      duration: result.duration,
    });

    return result;
  }

  /**
   * Execute workflow multiple times for reliability testing
   */
  async executeMultiple(
    workflowId: string,
    iterations: number,
    input?: Record<string, unknown>
  ): Promise<{
    results: WorkflowExecutionResult[];
    summary: {
      total: number;
      passed: number;
      failed: number;
      avgDuration: number;
      successRate: number;
    };
  }> {
    const results: WorkflowExecutionResult[] = [];

    for (let i = 0; i < iterations; i++) {
      const result = await this.executeAndValidate({
        type: 'workflow-execution',
        target: workflowId,
        input,
        id: `multi-exec-${i}`,
        priority: 5, // medium priority (1-10 scale)
        payload: { workflowId, input },
        status: 'pending',
      });
      results.push(result);
    }

    const passed = results.filter(r => r.status === 'success').length;
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

    return {
      results,
      summary: {
        total: iterations,
        passed,
        failed: iterations - passed,
        avgDuration: totalDuration / iterations,
        successRate: (passed / iterations) * 100,
      },
    };
  }

  /**
   * Test error handling by injecting invalid data
   */
  async testErrorHandling(
    workflowId: string,
    invalidInput: Record<string, unknown>,
    expectedErrorNode?: string
  ): Promise<{
    errorHandled: boolean;
    errorNode: string | null;
    errorMessage: string | null;
    recoveryBehavior: string;
  }> {
    try {
      const execution = await this.executeWorkflow(workflowId, invalidInput, {
        waitForCompletion: true,
        timeout: this.executorConfig.timeout,
      });

      const error = execution.data?.resultData?.error;

      return {
        errorHandled: execution.status === 'failed' && !!error,
        errorNode: error?.node || null,
        errorMessage: error?.message || null,
        recoveryBehavior: expectedErrorNode && error?.node === expectedErrorNode
          ? 'expected_failure'
          : error
            ? 'unexpected_failure'
            : 'no_error',
      };
    } catch (error) {
      return {
        errorHandled: false,
        errorNode: null,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        recoveryBehavior: 'execution_error',
      };
    }
  }

  /**
   * Validate data flow between nodes
   */
  private validateDataFlow(workflow: N8nWorkflow, execution: N8nExecution): boolean {
    const runData = execution.data?.resultData?.runData;
    if (!runData) return false;

    // Check each connection has data flowing through
    for (const [sourceName, connections] of Object.entries(workflow.connections)) {
      const sourceData = runData[sourceName];
      if (!sourceData?.[0]?.data?.main) continue;

      for (const output of connections.main) {
        for (const conn of output) {
          const targetData = runData[conn.node];

          // Target should have received data from source
          if (!targetData?.[0]?.source?.some(s => s.previousNode === sourceName)) {
            // Data flow broken
            return false;
          }
        }
      }
    }

    return true;
  }

  /**
   * Run assertions against execution results
   */
  private runAssertions(
    execution: N8nExecution,
    assertions: ExecutionTask['assertions']
  ): AssertionResult[] {
    if (!assertions) return [];

    const runData = execution.data?.resultData?.runData;
    const results: AssertionResult[] = [];

    for (const assertion of assertions) {
      let actual: unknown;
      let passed = false;

      if (assertion.node && runData?.[assertion.node]) {
        // Get value from specific node output
        const nodeData = runData[assertion.node][0]?.data?.main?.[0]?.[0]?.json;
        actual = this.getValueByPath(nodeData, assertion.field);
      } else {
        // Get from last node output
        const lastNode = execution.data?.resultData?.lastNodeExecuted;
        if (lastNode && runData?.[lastNode]) {
          const nodeData = runData[lastNode][0]?.data?.main?.[0]?.[0]?.json;
          actual = this.getValueByPath(nodeData, assertion.field);
        }
      }

      // Evaluate assertion
      switch (assertion.operator || 'equals') {
        case 'equals':
          passed = actual === assertion.expected;
          break;
        case 'contains':
          passed = String(actual).includes(String(assertion.expected));
          break;
        case 'matches':
          passed = new RegExp(String(assertion.expected)).test(String(actual));
          break;
        case 'greaterThan':
          passed = Number(actual) > Number(assertion.expected);
          break;
        case 'lessThan':
          passed = Number(actual) < Number(assertion.expected);
          break;
      }

      results.push({
        name: assertion.name,
        expected: assertion.expected,
        actual,
        passed,
        node: assertion.node,
      });
    }

    return results;
  }

  /**
   * Extract errors from execution
   */
  private extractErrors(execution: N8nExecution): ExecutionError[] {
    const errors: ExecutionError[] = [];
    const runData = execution.data?.resultData?.runData;

    // Check for workflow-level error
    const workflowError = execution.data?.resultData?.error;
    if (workflowError) {
      errors.push({
        node: workflowError.node || 'unknown',
        message: workflowError.message,
        type: 'workflow_error',
        recoverable: false,
      });
    }

    // Check for node-level errors
    if (runData) {
      for (const [nodeName, nodeRuns] of Object.entries(runData)) {
        for (const run of nodeRuns) {
          if (run.executionStatus === 'error' && run.error) {
            errors.push({
              node: nodeName,
              message: run.error.message,
              type: 'node_error',
              recoverable: true, // Could be retried
            });
          }
        }
      }
    }

    return errors;
  }

  /**
   * Create error result when execution fails
   */
  private createErrorResult(
    workflowId: string,
    errorMessage: string,
    startTime: number
  ): WorkflowExecutionResult {
    return {
      workflowId,
      executionId: '',
      status: 'error',
      duration: Date.now() - startTime,
      nodesExecuted: 0,
      totalNodes: 0,
      dataFlowValid: false,
      assertions: [],
      metrics: {
        totalDuration: 0,
        nodeMetrics: [],
        bottleneck: null,
      },
      errors: [{
        node: 'workflow',
        message: errorMessage,
        type: 'execution_error',
        recoverable: false,
      }],
    };
  }

  /**
   * Get value from object by dot-notation path
   */
  private getValueByPath(obj: unknown, path: string): unknown {
    if (!obj || typeof obj !== 'object') return undefined;

    const parts = path.split('.');
    let current: unknown = obj;

    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }
}
