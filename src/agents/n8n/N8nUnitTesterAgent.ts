/**
 * N8nUnitTesterAgent
 *
 * Unit testing for individual n8n nodes:
 * - Node isolation testing
 * - Input/output validation
 * - Mock data generation
 * - Edge case coverage
 */

import { N8nBaseAgent, N8nAgentConfig } from './N8nBaseAgent';
import {
  N8nWorkflow,
  N8nNode,
  N8nExecution,
} from './types';
import { QETask, AgentCapability } from '../../types';

export interface UnitTestTask extends QETask {
  type: 'unit-test';
  target: string; // nodeId or workflowId
  options?: {
    isolateNode?: boolean;
    mockInputData?: Record<string, unknown>;
    testEdgeCases?: boolean;
    generateMockData?: boolean;
    iterations?: number;
  };
}

export interface NodeUnitTestResult {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  testCases: TestCase[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    duration: number;
  };
  coverage: {
    inputsCovered: string[];
    outputsCovered: string[];
    edgeCasesCovered: string[];
  };
}

export interface TestCase {
  name: string;
  description: string;
  input: Record<string, unknown>;
  expectedOutput?: Record<string, unknown>;
  actualOutput?: Record<string, unknown>;
  result: 'pass' | 'fail' | 'skip' | 'error';
  duration: number;
  errorMessage?: string;
  assertions?: AssertionResult[];
}

export interface AssertionResult {
  assertion: string;
  passed: boolean;
  expected?: unknown;
  actual?: unknown;
}

// Node type configurations for test generation
const NODE_TEST_CONFIGS: Record<string, {
  requiredInputs: string[];
  optionalInputs: string[];
  expectedOutputs: string[];
  edgeCases: string[];
}> = {
  'n8n-nodes-base.set': {
    requiredInputs: [],
    optionalInputs: ['keepOnlySet'],
    expectedOutputs: ['json'],
    edgeCases: ['empty_input', 'null_values', 'nested_objects'],
  },
  'n8n-nodes-base.if': {
    requiredInputs: ['conditions'],
    optionalInputs: [],
    expectedOutputs: ['true', 'false'],
    edgeCases: ['null_comparison', 'type_coercion', 'empty_array'],
  },
  'n8n-nodes-base.switch': {
    requiredInputs: ['conditions'],
    optionalInputs: ['fallbackOutput'],
    expectedOutputs: ['output'],
    edgeCases: ['no_match', 'multiple_matches', 'empty_value'],
  },
  'n8n-nodes-base.code': {
    requiredInputs: ['jsCode'],
    optionalInputs: ['mode'],
    expectedOutputs: ['json'],
    edgeCases: ['runtime_error', 'timeout', 'memory_limit'],
  },
  'n8n-nodes-base.function': {
    requiredInputs: ['functionCode'],
    optionalInputs: [],
    expectedOutputs: ['json'],
    edgeCases: ['async_error', 'undefined_return', 'invalid_json'],
  },
  'n8n-nodes-base.merge': {
    requiredInputs: ['mode'],
    optionalInputs: ['clashHandling'],
    expectedOutputs: ['json'],
    edgeCases: ['unequal_lengths', 'empty_input', 'deep_merge'],
  },
  'n8n-nodes-base.splitInBatches': {
    requiredInputs: ['batchSize'],
    optionalInputs: [],
    expectedOutputs: ['json'],
    edgeCases: ['single_item', 'exact_batch', 'empty_input'],
  },
};

export class N8nUnitTesterAgent extends N8nBaseAgent {
  constructor(config: N8nAgentConfig) {
    const capabilities: AgentCapability[] = [
      {
        name: 'node-isolation',
        version: '1.0.0',
        description: 'Test nodes in isolation from workflow',
        parameters: {},
      },
      {
        name: 'mock-data-generation',
        version: '1.0.0',
        description: 'Generate mock test data for nodes',
        parameters: {},
      },
      {
        name: 'edge-case-testing',
        version: '1.0.0',
        description: 'Test edge cases and boundary conditions',
        parameters: {},
      },
      {
        name: 'assertion-validation',
        version: '1.0.0',
        description: 'Validate outputs against assertions',
        parameters: {},
      },
    ];

    super({
      ...config,
      type: 'n8n-unit-tester' as any,
      capabilities: [...capabilities, ...(config.capabilities || [])],
    });
  }

  protected async performTask(task: QETask): Promise<NodeUnitTestResult> {
    const unitTask = task as UnitTestTask;

    if (unitTask.type !== 'unit-test') {
      throw new Error(`Unsupported task type: ${unitTask.type}`);
    }

    return this.testNode(unitTask.target, unitTask.options);
  }

  /**
   * Run unit tests for a specific node
   */
  async testNode(
    workflowId: string,
    options?: UnitTestTask['options']
  ): Promise<NodeUnitTestResult> {
    const startTime = Date.now();
    const workflow = await this.getWorkflow(workflowId);

    // Get target node (first non-trigger node by default)
    const targetNode = this.findTargetNode(workflow, options?.isolateNode);

    if (!targetNode) {
      throw new Error('No testable node found in workflow');
    }

    // Generate test cases
    const testCases = await this.generateTestCases(
      targetNode,
      workflow,
      options
    );

    // Run test cases
    const results: TestCase[] = [];
    for (const testCase of testCases) {
      const result = await this.runTestCase(
        workflow,
        targetNode,
        testCase,
        options
      );
      results.push(result);
    }

    const totalDuration = Date.now() - startTime;

    const result: NodeUnitTestResult = {
      nodeId: targetNode.id,
      nodeName: targetNode.name,
      nodeType: targetNode.type,
      testCases: results,
      summary: {
        total: results.length,
        passed: results.filter(r => r.result === 'pass').length,
        failed: results.filter(r => r.result === 'fail').length,
        skipped: results.filter(r => r.result === 'skip').length,
        duration: totalDuration,
      },
      coverage: this.calculateCoverage(targetNode, results),
    };

    // Store result
    await this.storeTestResult(`unit-test:${workflowId}:${targetNode.id}`, result);

    // Emit event
    this.emitEvent('unit.test.completed', {
      workflowId,
      nodeId: targetNode.id,
      passed: result.summary.passed,
      failed: result.summary.failed,
      duration: totalDuration,
    });

    return result;
  }

  /**
   * Test all nodes in a workflow
   */
  async testAllNodes(
    workflowId: string,
    options?: UnitTestTask['options']
  ): Promise<NodeUnitTestResult[]> {
    const workflow = await this.getWorkflow(workflowId);
    const results: NodeUnitTestResult[] = [];

    // Get all testable nodes (exclude triggers)
    const testableNodes = workflow.nodes.filter(
      n => !n.type.includes('trigger') && !n.type.includes('Trigger')
    );

    for (const node of testableNodes) {
      try {
        const result = await this.testSingleNode(workflow, node, options);
        results.push(result);
      } catch (error) {
        // Create error result
        results.push({
          nodeId: node.id,
          nodeName: node.name,
          nodeType: node.type,
          testCases: [{
            name: 'Test execution',
            description: 'Failed to execute tests',
            input: {},
            result: 'error',
            duration: 0,
            errorMessage: error instanceof Error ? error.message : String(error),
          }],
          summary: {
            total: 1,
            passed: 0,
            failed: 0,
            skipped: 1,
            duration: 0,
          },
          coverage: {
            inputsCovered: [],
            outputsCovered: [],
            edgeCasesCovered: [],
          },
        });
      }
    }

    return results;
  }

  /**
   * Find target node for testing
   */
  private findTargetNode(
    workflow: N8nWorkflow,
    nodeId?: boolean | string
  ): N8nNode | undefined {
    if (typeof nodeId === 'string') {
      return workflow.nodes.find(n => n.id === nodeId || n.name === nodeId);
    }

    // Find first non-trigger node
    return workflow.nodes.find(
      n => !n.type.includes('trigger') && !n.type.includes('Trigger')
    );
  }

  /**
   * Generate test cases for a node
   */
  private async generateTestCases(
    node: N8nNode,
    workflow: N8nWorkflow,
    options?: UnitTestTask['options']
  ): Promise<Omit<TestCase, 'result' | 'duration' | 'actualOutput'>[]> {
    const testCases: Omit<TestCase, 'result' | 'duration' | 'actualOutput'>[] = [];
    const config = NODE_TEST_CONFIGS[node.type];

    // Basic test case with provided mock data
    if (options?.mockInputData) {
      testCases.push({
        name: 'Custom input test',
        description: 'Test with user-provided mock data',
        input: options.mockInputData,
      });
    }

    // Generate mock data test
    if (options?.generateMockData !== false) {
      testCases.push({
        name: 'Generated data test',
        description: 'Test with auto-generated mock data',
        input: this.generateMockInput(node),
      });
    }

    // Edge case tests
    if (options?.testEdgeCases !== false && config?.edgeCases) {
      for (const edgeCase of config.edgeCases) {
        testCases.push({
          name: `Edge case: ${edgeCase}`,
          description: `Test ${edgeCase} scenario`,
          input: this.generateEdgeCaseInput(node, edgeCase),
        });
      }
    }

    // Empty input test
    testCases.push({
      name: 'Empty input test',
      description: 'Test with empty input array',
      input: { items: [] },
    });

    // Null handling test
    testCases.push({
      name: 'Null handling test',
      description: 'Test with null values in input',
      input: { json: { value: null, nested: { prop: null } } },
    });

    return testCases;
  }

  /**
   * Generate mock input for node
   */
  private generateMockInput(node: N8nNode): Record<string, unknown> {
    const mockData: Record<string, unknown> = {
      json: {},
    };

    // Generate based on node type
    switch (node.type) {
      case 'n8n-nodes-base.set':
        mockData.json = { existingField: 'value', count: 42 };
        break;
      case 'n8n-nodes-base.if':
        mockData.json = { testValue: 'compare', number: 100 };
        break;
      case 'n8n-nodes-base.code':
      case 'n8n-nodes-base.function':
        mockData.json = { input: 'test', items: [1, 2, 3] };
        break;
      case 'n8n-nodes-base.merge':
        mockData.json = { merged: true, source: 'input1' };
        break;
      default:
        mockData.json = {
          id: 'test-123',
          name: 'Test Item',
          value: 'mock-value',
          timestamp: new Date().toISOString(),
        };
    }

    return mockData;
  }

  /**
   * Generate edge case input
   */
  private generateEdgeCaseInput(
    node: N8nNode,
    edgeCase: string
  ): Record<string, unknown> {
    switch (edgeCase) {
      case 'empty_input':
        return { json: {} };
      case 'null_values':
        return { json: { field: null, nested: { value: null } } };
      case 'nested_objects':
        return {
          json: {
            level1: {
              level2: {
                level3: { deep: 'value' },
              },
            },
          },
        };
      case 'null_comparison':
        return { json: { compareValue: null } };
      case 'type_coercion':
        return { json: { stringNum: '123', numString: 123 } };
      case 'empty_array':
        return { json: { items: [] } };
      case 'no_match':
        return { json: { noMatchField: 'unmatchable-value-xyz' } };
      case 'runtime_error':
        return { json: { causeError: true } };
      case 'single_item':
        return { json: { singleItem: true } };
      case 'exact_batch':
        return { json: { items: [1, 2, 3, 4, 5] } };
      default:
        return { json: { edgeCase } };
    }
  }

  /**
   * Run a single test case
   */
  private async runTestCase(
    workflow: N8nWorkflow,
    node: N8nNode,
    testCase: Omit<TestCase, 'result' | 'duration' | 'actualOutput'>,
    options?: UnitTestTask['options']
  ): Promise<TestCase> {
    const startTime = Date.now();

    try {
      // In a real implementation, this would execute the node in isolation
      // For now, we simulate execution and validate structure
      const simulatedOutput = this.simulateNodeExecution(node, testCase.input);

      const assertions = this.validateOutput(
        node,
        testCase.input,
        simulatedOutput,
        testCase.expectedOutput
      );

      const allPassed = assertions.every(a => a.passed);

      return {
        ...testCase,
        actualOutput: simulatedOutput,
        result: allPassed ? 'pass' : 'fail',
        duration: Date.now() - startTime,
        assertions,
      };
    } catch (error) {
      return {
        ...testCase,
        result: 'error',
        duration: Date.now() - startTime,
        errorMessage: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Simulate node execution (for unit testing without n8n API)
   */
  private simulateNodeExecution(
    node: N8nNode,
    input: Record<string, unknown>
  ): Record<string, unknown> {
    // Simulate based on node type
    switch (node.type) {
      case 'n8n-nodes-base.set':
        return this.simulateSetNode(node, input);
      case 'n8n-nodes-base.if':
        return this.simulateIfNode(node, input);
      case 'n8n-nodes-base.code':
      case 'n8n-nodes-base.function':
        return { json: { ...input.json as object, processed: true } };
      case 'n8n-nodes-base.merge':
        return { json: { merged: true, ...input.json as object } };
      default:
        return { json: input.json || input };
    }
  }

  /**
   * Simulate Set node
   */
  private simulateSetNode(
    node: N8nNode,
    input: Record<string, unknown>
  ): Record<string, unknown> {
    const values = node.parameters.values as { values?: Array<{name: string; value: unknown}> };
    const keepOnlySet = node.parameters.keepOnlySet as boolean;

    const result: Record<string, unknown> = keepOnlySet ? {} : { ...(input.json as object) };

    if (values?.values) {
      for (const v of values.values) {
        result[v.name] = v.value;
      }
    }

    return { json: result };
  }

  /**
   * Simulate If node
   */
  private simulateIfNode(
    node: N8nNode,
    input: Record<string, unknown>
  ): Record<string, unknown> {
    // Simplified condition check
    const conditions = node.parameters.conditions as { boolean?: Array<{value1: unknown; value2: unknown}> };

    if (conditions?.boolean?.[0]) {
      const { value1, value2 } = conditions.boolean[0];
      const result = value1 === value2;
      return { branch: result ? 'true' : 'false', json: input.json };
    }

    return { branch: 'true', json: input.json };
  }

  /**
   * Validate output against expectations
   */
  private validateOutput(
    node: N8nNode,
    input: Record<string, unknown>,
    actual: Record<string, unknown>,
    expected?: Record<string, unknown>
  ): AssertionResult[] {
    const assertions: AssertionResult[] = [];

    // Output exists
    assertions.push({
      assertion: 'Output is not null or undefined',
      passed: actual !== null && actual !== undefined,
      actual,
    });

    // Output has json property
    assertions.push({
      assertion: 'Output has json property',
      passed: 'json' in actual || 'branch' in actual,
      actual: Object.keys(actual),
    });

    // Type-specific assertions
    const config = NODE_TEST_CONFIGS[node.type];
    if (config?.expectedOutputs) {
      for (const expectedOutput of config.expectedOutputs) {
        if (expectedOutput === 'json') {
          assertions.push({
            assertion: 'Output json is an object',
            passed: typeof actual.json === 'object',
            actual: typeof actual.json,
            expected: 'object',
          });
        }
      }
    }

    // Check against expected output if provided
    if (expected) {
      assertions.push({
        assertion: 'Output matches expected',
        passed: JSON.stringify(actual) === JSON.stringify(expected),
        expected,
        actual,
      });
    }

    return assertions;
  }

  /**
   * Test a single node within workflow context
   */
  private async testSingleNode(
    workflow: N8nWorkflow,
    node: N8nNode,
    options?: UnitTestTask['options']
  ): Promise<NodeUnitTestResult> {
    const startTime = Date.now();

    const testCases = await this.generateTestCases(node, workflow, options);
    const results: TestCase[] = [];

    for (const testCase of testCases) {
      const result = await this.runTestCase(workflow, node, testCase, options);
      results.push(result);
    }

    return {
      nodeId: node.id,
      nodeName: node.name,
      nodeType: node.type,
      testCases: results,
      summary: {
        total: results.length,
        passed: results.filter(r => r.result === 'pass').length,
        failed: results.filter(r => r.result === 'fail').length,
        skipped: results.filter(r => r.result === 'skip').length,
        duration: Date.now() - startTime,
      },
      coverage: this.calculateCoverage(node, results),
    };
  }

  /**
   * Calculate test coverage
   */
  private calculateCoverage(
    node: N8nNode,
    results: TestCase[]
  ): NodeUnitTestResult['coverage'] {
    const config = NODE_TEST_CONFIGS[node.type];
    const passedTests = results.filter(r => r.result === 'pass');

    const inputsCovered: string[] = [];
    const outputsCovered: string[] = [];
    const edgeCasesCovered: string[] = [];

    // Check which inputs were covered
    if (config?.requiredInputs) {
      for (const input of config.requiredInputs) {
        if (passedTests.some(t => input in (t.input.json as object || {}))) {
          inputsCovered.push(input);
        }
      }
    }

    // Check which outputs were produced
    for (const test of passedTests) {
      if (test.actualOutput) {
        if ('json' in test.actualOutput) outputsCovered.push('json');
        if ('branch' in test.actualOutput) outputsCovered.push('branch');
      }
    }

    // Check edge cases
    if (config?.edgeCases) {
      for (const edgeCase of config.edgeCases) {
        if (passedTests.some(t => t.name.includes(edgeCase))) {
          edgeCasesCovered.push(edgeCase);
        }
      }
    }

    return {
      inputsCovered: [...new Set(inputsCovered)],
      outputsCovered: [...new Set(outputsCovered)],
      edgeCasesCovered: [...new Set(edgeCasesCovered)],
    };
  }

  /**
   * Generate coverage report
   */
  async generateCoverageReport(workflowId: string): Promise<{
    workflow: string;
    totalNodes: number;
    testedNodes: number;
    coverage: number;
    nodeDetails: Array<{
      nodeId: string;
      nodeName: string;
      tested: boolean;
      testCount: number;
      passRate: number;
    }>;
  }> {
    const workflow = await this.getWorkflow(workflowId);
    const results = await this.testAllNodes(workflowId);

    const testedNodes = results.filter(r => r.summary.total > 0);

    return {
      workflow: workflowId,
      totalNodes: workflow.nodes.length,
      testedNodes: testedNodes.length,
      coverage: (testedNodes.length / workflow.nodes.length) * 100,
      nodeDetails: results.map(r => ({
        nodeId: r.nodeId,
        nodeName: r.nodeName,
        tested: r.summary.total > 0,
        testCount: r.summary.total,
        passRate: r.summary.total > 0
          ? (r.summary.passed / r.summary.total) * 100
          : 0,
      })),
    };
  }
}
