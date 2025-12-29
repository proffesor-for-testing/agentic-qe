/**
 * N8nTestHarness
 *
 * Provides active testing capabilities for n8n workflows:
 * - Fault injection into workflows
 * - Concurrent execution coordination
 * - Service mocking via workflow modification
 * - Execution comparison and diff
 * - Time-travel simulation
 */

import { N8nAPIClient } from './N8nAPIClient';
import {
  N8nWorkflow,
  N8nNode,
  N8nExecution,
  N8nAPIConfig,
} from './types';
import { seededRandom } from '../../utils/SeededRandom';

// ============================================================================
// Types
// ============================================================================

export interface FaultInjectionConfig {
  targetNode: string;
  faultType: 'error' | 'timeout' | 'empty-response' | 'malformed-response' | 'rate-limit' | 'network-error';
  probability?: number; // 0-1, default 1.0
  delay?: number; // ms for timeout/delay simulation
  errorMessage?: string;
  errorCode?: number;
  responseOverride?: unknown;
}

export interface MockConfig {
  targetNode: string;
  mockResponse: unknown;
  statusCode?: number;
  headers?: Record<string, string>;
  delay?: number;
}

export interface ConcurrentExecutionConfig {
  concurrency: number;
  staggerMs?: number; // Delay between starting each execution
  inputVariations?: Record<string, unknown>[]; // Different inputs for each execution
  timeout?: number;
}

export interface ConcurrentExecutionResult {
  executions: ExecutionOutcome[];
  allIdentical: boolean;
  differences: ExecutionDifference[];
  timing: {
    totalMs: number;
    avgMs: number;
    minMs: number;
    maxMs: number;
  };
}

export interface ExecutionOutcome {
  executionId: string;
  index: number;
  status: 'success' | 'error' | 'timeout';
  duration: number;
  output: Record<string, unknown>;
  error?: string;
  nodeOutputs: Record<string, unknown>;
}

export interface ExecutionDifference {
  executionA: number;
  executionB: number;
  nodeName: string;
  fieldPath: string;
  valueA: unknown;
  valueB: unknown;
  differenceType: 'value-changed' | 'key-missing' | 'key-extra' | 'type-changed';
}

export interface TimeSimulationConfig {
  freezeTime?: Date;
  timeOffset?: number; // ms to add to current time
  mockDateNodes?: boolean; // Replace DateTime nodes with fixed values
}

export interface TestWorkflowResult {
  originalWorkflowId: string;
  testWorkflowId: string;
  execution: N8nExecution | null;
  cleanedUp: boolean;
  error?: string;
}

// ============================================================================
// Fault Injection Code Templates
// ============================================================================

const FAULT_CODE_TEMPLATES = {
  error: (config: FaultInjectionConfig) => `
// Fault Injection: Error
const probability = ${config.probability ?? 1.0};
const seededValue = ${seededRandom.random()};
if (seededValue < probability) {
  throw new Error('${config.errorMessage || 'Injected fault: Simulated error'}');
}
return $input.all();
`,

  timeout: (config: FaultInjectionConfig) => `
// Fault Injection: Timeout/Delay
const delay = ${config.delay || 30000};
await new Promise(resolve => setTimeout(resolve, delay));
return $input.all();
`,

  'empty-response': (_config: FaultInjectionConfig) => `
// Fault Injection: Empty Response
return [];
`,

  'malformed-response': (_config: FaultInjectionConfig) => `
// Fault Injection: Malformed Response
return [{ json: { _malformed: true, data: undefined, error: null } }];
`,

  'rate-limit': (config: FaultInjectionConfig) => `
// Fault Injection: Rate Limit
const probability = ${config.probability ?? 1.0};
const seededValue = ${seededRandom.random()};
if (seededValue < probability) {
  const error = new Error('${config.errorMessage || 'Rate limit exceeded'}');
  error.statusCode = 429;
  throw error;
}
return $input.all();
`,

  'network-error': (config: FaultInjectionConfig) => `
// Fault Injection: Network Error
const probability = ${config.probability ?? 1.0};
const seededValue = ${seededRandom.random()};
if (seededValue < probability) {
  const error = new Error('${config.errorMessage || 'Network error: Connection refused'}');
  error.code = 'ECONNREFUSED';
  throw error;
}
return $input.all();
`,
};

// ============================================================================
// Test Harness Implementation
// ============================================================================

export class N8nTestHarness {
  private client: N8nAPIClient;
  private createdWorkflows: string[] = [];

  constructor(config: N8nAPIConfig) {
    this.client = new N8nAPIClient(config);
  }

  /**
   * Create a test copy of a workflow with fault injection
   */
  async createFaultInjectedWorkflow(
    workflowId: string,
    faults: FaultInjectionConfig[]
  ): Promise<{ workflow: N8nWorkflow; cleanup: () => Promise<void> }> {
    // Get original workflow
    const original = await this.client.getWorkflow(workflowId);

    // Clone and modify
    const testWorkflow = this.cloneWorkflow(original, `[TEST] ${original.name}`);

    // Inject faults
    for (const fault of faults) {
      this.injectFault(testWorkflow, fault);
    }

    // Create the test workflow
    const created = await this.client.createWorkflow(testWorkflow);
    this.createdWorkflows.push(created.id);

    return {
      workflow: created,
      cleanup: async () => {
        await this.client.deleteWorkflow(created.id);
        this.createdWorkflows = this.createdWorkflows.filter(id => id !== created.id);
      },
    };
  }

  /**
   * Create a test workflow with mocked responses
   */
  async createMockedWorkflow(
    workflowId: string,
    mocks: MockConfig[]
  ): Promise<{ workflow: N8nWorkflow; cleanup: () => Promise<void> }> {
    const original = await this.client.getWorkflow(workflowId);
    const testWorkflow = this.cloneWorkflow(original, `[MOCK] ${original.name}`);

    for (const mock of mocks) {
      this.injectMock(testWorkflow, mock);
    }

    const created = await this.client.createWorkflow(testWorkflow);
    this.createdWorkflows.push(created.id);

    return {
      workflow: created,
      cleanup: async () => {
        await this.client.deleteWorkflow(created.id);
        this.createdWorkflows = this.createdWorkflows.filter(id => id !== created.id);
      },
    };
  }

  /**
   * Execute workflow with fault injection (without creating a copy)
   * Uses a temporary workflow that's cleaned up after execution
   */
  async executeWithFaults(
    workflowId: string,
    faults: FaultInjectionConfig[],
    inputData?: Record<string, unknown>
  ): Promise<TestWorkflowResult> {
    const { workflow, cleanup } = await this.createFaultInjectedWorkflow(workflowId, faults);

    try {
      // Activate the workflow
      await this.client.activateWorkflow(workflow.id);

      // Execute
      const execution = await this.client.executeWorkflow(workflow.id, inputData || {});

      // Wait for completion
      const completed = await this.waitForExecution(execution.id, 60000);

      return {
        originalWorkflowId: workflowId,
        testWorkflowId: workflow.id,
        execution: completed,
        cleanedUp: false,
      };
    } catch (error) {
      return {
        originalWorkflowId: workflowId,
        testWorkflowId: workflow.id,
        execution: null,
        cleanedUp: false,
        error: (error as Error).message,
      };
    } finally {
      await cleanup();
    }
  }

  /**
   * Execute workflow multiple times concurrently
   */
  async executeConcurrently(
    workflowId: string,
    config: ConcurrentExecutionConfig
  ): Promise<ConcurrentExecutionResult> {
    const startTime = Date.now();
    const executions: Promise<ExecutionOutcome>[] = [];

    for (let i = 0; i < config.concurrency; i++) {
      const input = config.inputVariations?.[i] || {};

      // Stagger if configured
      if (config.staggerMs && i > 0) {
        await this.delay(config.staggerMs);
      }

      executions.push(this.executeAndCapture(workflowId, input, i, config.timeout || 60000));
    }

    const results = await Promise.all(executions);
    const totalMs = Date.now() - startTime;

    // Calculate differences
    const differences = this.findExecutionDifferences(results);

    // Calculate timing stats
    const durations = results.map(r => r.duration);

    return {
      executions: results,
      allIdentical: differences.length === 0,
      differences,
      timing: {
        totalMs,
        avgMs: durations.reduce((a, b) => a + b, 0) / durations.length,
        minMs: Math.min(...durations),
        maxMs: Math.max(...durations),
      },
    };
  }

  /**
   * Execute workflow with time simulation
   */
  async executeWithTimeSimulation(
    workflowId: string,
    timeConfig: TimeSimulationConfig,
    inputData?: Record<string, unknown>
  ): Promise<TestWorkflowResult> {
    const original = await this.client.getWorkflow(workflowId);
    const testWorkflow = this.cloneWorkflow(original, `[TIME-SIM] ${original.name}`);

    // Inject time overrides
    if (timeConfig.mockDateNodes) {
      this.injectTimeOverrides(testWorkflow, timeConfig);
    }

    // Add time context to input
    const timeInput = {
      ...inputData,
      __testHarness: {
        simulatedTime: timeConfig.freezeTime?.toISOString() ||
          new Date(Date.now() + (timeConfig.timeOffset || 0)).toISOString(),
      },
    };

    const created = await this.client.createWorkflow(testWorkflow);
    this.createdWorkflows.push(created.id);

    try {
      await this.client.activateWorkflow(created.id);
      const execution = await this.client.executeWorkflow(created.id, timeInput);
      const completed = await this.waitForExecution(execution.id, 60000);

      return {
        originalWorkflowId: workflowId,
        testWorkflowId: created.id,
        execution: completed,
        cleanedUp: false,
      };
    } finally {
      await this.client.deleteWorkflow(created.id);
      this.createdWorkflows = this.createdWorkflows.filter(id => id !== created.id);
    }
  }

  /**
   * Compare two execution results
   */
  compareExecutions(
    executionA: N8nExecution,
    executionB: N8nExecution,
    options?: { ignoreTimestamps?: boolean; ignoreIds?: boolean }
  ): ExecutionDifference[] {
    const differences: ExecutionDifference[] = [];
    const runDataA = executionA.data?.resultData?.runData || {};
    const runDataB = executionB.data?.resultData?.runData || {};

    const allNodes = new Set([...Object.keys(runDataA), ...Object.keys(runDataB)]);

    for (const nodeName of allNodes) {
      const outputA = this.extractNodeOutput(runDataA[nodeName]);
      const outputB = this.extractNodeOutput(runDataB[nodeName]);

      const nodeDiffs = this.deepCompare(outputA, outputB, '', options);
      for (const diff of nodeDiffs) {
        differences.push({
          executionA: 0,
          executionB: 1,
          nodeName,
          ...diff,
        });
      }
    }

    return differences;
  }

  /**
   * Clean up all test workflows created by this harness
   */
  async cleanup(): Promise<void> {
    for (const workflowId of this.createdWorkflows) {
      try {
        await this.client.deleteWorkflow(workflowId);
      } catch {
        // Ignore cleanup errors
      }
    }
    this.createdWorkflows = [];
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private cloneWorkflow(original: N8nWorkflow, newName: string): Omit<N8nWorkflow, 'id' | 'createdAt' | 'updatedAt'> {
    return {
      name: newName,
      nodes: JSON.parse(JSON.stringify(original.nodes)),
      connections: JSON.parse(JSON.stringify(original.connections)),
      settings: { ...original.settings },
      active: false,
    };
  }

  private injectFault(workflow: Omit<N8nWorkflow, 'id' | 'createdAt' | 'updatedAt'>, fault: FaultInjectionConfig): void {
    const targetNode = workflow.nodes.find(n => n.name === fault.targetNode);
    if (!targetNode) {
      throw new Error(`Target node "${fault.targetNode}" not found in workflow`);
    }

    // Create fault injection node
    const faultNodeId = `fault_${targetNode.id}`;
    const faultNode: N8nNode = {
      id: faultNodeId,
      name: `[FAULT] ${fault.targetNode}`,
      type: 'n8n-nodes-base.code',
      position: [targetNode.position[0] + 50, targetNode.position[1] + 50],
      parameters: {
        mode: 'runOnceForAllItems',
        jsCode: FAULT_CODE_TEMPLATES[fault.faultType](fault),
      },
    };

    // Insert fault node after target
    workflow.nodes.push(faultNode);

    // Rewire connections: target -> fault -> original-targets
    const targetConnections = workflow.connections[targetNode.name];
    if (targetConnections?.main) {
      // Point target to fault node
      workflow.connections[targetNode.name] = {
        main: [[{ node: faultNode.name, type: 'main', index: 0 }]],
      };

      // Point fault node to original targets
      workflow.connections[faultNode.name] = targetConnections;
    }
  }

  private injectMock(workflow: Omit<N8nWorkflow, 'id' | 'createdAt' | 'updatedAt'>, mock: MockConfig): void {
    const targetNode = workflow.nodes.find(n => n.name === mock.targetNode);
    if (!targetNode) {
      throw new Error(`Target node "${mock.targetNode}" not found in workflow`);
    }

    // Replace node with mock
    const mockCode = `
// Mock Response for ${mock.targetNode}
${mock.delay ? `await new Promise(resolve => setTimeout(resolve, ${mock.delay}));` : ''}
return [{ json: ${JSON.stringify(mock.mockResponse)} }];
`;

    targetNode.type = 'n8n-nodes-base.code';
    targetNode.parameters = {
      mode: 'runOnceForAllItems',
      jsCode: mockCode,
    };
  }

  private injectTimeOverrides(workflow: Omit<N8nWorkflow, 'id' | 'createdAt' | 'updatedAt'>, config: TimeSimulationConfig): void {
    const targetTime = config.freezeTime || new Date(Date.now() + (config.timeOffset || 0));

    for (const node of workflow.nodes) {
      if (node.type.includes('dateTime') || node.type.includes('DateTime')) {
        // Replace DateTime node with fixed value
        node.type = 'n8n-nodes-base.code';
        node.parameters = {
          mode: 'runOnceForAllItems',
          jsCode: `return [{ json: { datetime: "${targetTime.toISOString()}" } }];`,
        };
      }
    }
  }

  private async executeAndCapture(
    workflowId: string,
    input: Record<string, unknown>,
    index: number,
    timeout: number
  ): Promise<ExecutionOutcome> {
    const startTime = Date.now();

    try {
      const execution = await this.client.executeWorkflow(workflowId, input);
      const completed = await this.waitForExecution(execution.id, timeout);

      const nodeOutputs: Record<string, unknown> = {};
      const runData = completed.data?.resultData?.runData || {};
      for (const [nodeName, runs] of Object.entries(runData)) {
        nodeOutputs[nodeName] = this.extractNodeOutput(runs);
      }

      return {
        executionId: execution.id,
        index,
        status: completed.finished ? 'success' : 'error',
        duration: Date.now() - startTime,
        output: nodeOutputs,
        nodeOutputs,
        error: completed.data?.resultData?.error?.message,
      };
    } catch (error) {
      return {
        executionId: '',
        index,
        status: 'error',
        duration: Date.now() - startTime,
        output: {},
        nodeOutputs: {},
        error: (error as Error).message,
      };
    }
  }

  private async waitForExecution(executionId: string, timeout: number): Promise<N8nExecution> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const execution = await this.client.getExecution(executionId);
      if (execution.finished) {
        return execution;
      }
      await this.delay(500);
    }

    throw new Error(`Execution ${executionId} timed out after ${timeout}ms`);
  }

  private extractNodeOutput(runs: unknown): unknown {
    if (!runs || !Array.isArray(runs) || runs.length === 0) {
      return null;
    }
    const run = runs[0] as { data?: { main?: Array<Array<{ json: unknown }>> } };
    return run?.data?.main?.[0]?.[0]?.json || null;
  }

  private findExecutionDifferences(executions: ExecutionOutcome[]): ExecutionDifference[] {
    const differences: ExecutionDifference[] = [];

    if (executions.length < 2) return differences;

    const baseline = executions[0];

    for (let i = 1; i < executions.length; i++) {
      const current = executions[i];

      for (const nodeName of Object.keys(baseline.nodeOutputs)) {
        const baseOutput = baseline.nodeOutputs[nodeName];
        const currOutput = current.nodeOutputs[nodeName];

        const nodeDiffs = this.deepCompare(baseOutput, currOutput, '');
        for (const diff of nodeDiffs) {
          differences.push({
            executionA: 0,
            executionB: i,
            nodeName,
            ...diff,
          });
        }
      }
    }

    return differences;
  }

  private deepCompare(
    a: unknown,
    b: unknown,
    path: string,
    options?: { ignoreTimestamps?: boolean; ignoreIds?: boolean }
  ): Array<{ fieldPath: string; valueA: unknown; valueB: unknown; differenceType: ExecutionDifference['differenceType'] }> {
    const differences: Array<{ fieldPath: string; valueA: unknown; valueB: unknown; differenceType: ExecutionDifference['differenceType'] }> = [];

    // Check for timestamp/ID fields to ignore
    if (options?.ignoreTimestamps && this.isTimestampField(path)) return differences;
    if (options?.ignoreIds && this.isIdField(path)) return differences;

    if (a === b) return differences;

    if (typeof a !== typeof b) {
      differences.push({ fieldPath: path, valueA: a, valueB: b, differenceType: 'type-changed' });
      return differences;
    }

    if (a === null || b === null || typeof a !== 'object') {
      differences.push({ fieldPath: path, valueA: a, valueB: b, differenceType: 'value-changed' });
      return differences;
    }

    if (Array.isArray(a) && Array.isArray(b)) {
      const maxLen = Math.max(a.length, b.length);
      for (let i = 0; i < maxLen; i++) {
        differences.push(...this.deepCompare(a[i], b[i], `${path}[${i}]`, options));
      }
      return differences;
    }

    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const allKeys = new Set([...Object.keys(aObj), ...Object.keys(bObj)]);

    for (const key of allKeys) {
      const newPath = path ? `${path}.${key}` : key;
      if (!(key in aObj)) {
        differences.push({ fieldPath: newPath, valueA: undefined, valueB: bObj[key], differenceType: 'key-extra' });
      } else if (!(key in bObj)) {
        differences.push({ fieldPath: newPath, valueA: aObj[key], valueB: undefined, differenceType: 'key-missing' });
      } else {
        differences.push(...this.deepCompare(aObj[key], bObj[key], newPath, options));
      }
    }

    return differences;
  }

  private isTimestampField(path: string): boolean {
    const timestampPatterns = ['timestamp', 'createdAt', 'updatedAt', 'date', 'time', 'datetime'];
    return timestampPatterns.some(p => path.toLowerCase().includes(p));
  }

  private isIdField(path: string): boolean {
    const idPatterns = ['id', 'uuid', 'guid', 'executionId'];
    const parts = path.split('.');
    const lastPart = parts[parts.length - 1].toLowerCase();
    return idPatterns.some(p => lastPart === p || lastPart.endsWith('id'));
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export factory function
export function createTestHarness(config: N8nAPIConfig): N8nTestHarness {
  return new N8nTestHarness(config);
}
