/**
 * N8nReplayabilityTesterAgent
 *
 * Determinism and replayability testing for n8n workflows:
 * - Fixed timestamps and stable IDs
 * - Consistent pagination handling
 * - Controlled randomness detection
 * - Execution replay from fixtures
 * - Snapshot comparison testing
 * - Idempotent execution verification
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
  MockConfig,
  TimeSimulationConfig,
  TestWorkflowResult,
} from './N8nTestHarness';
import { seededRandom } from '../../utils/SeededRandom';

// ============================================================================
// Types
// ============================================================================

export interface ReplayabilityTestTask extends QETask {
  type: 'replayability-test';
  target: string; // workflowId
  options?: {
    recordMode?: boolean; // Record execution for later replay
    replayExecutionId?: string; // Replay from specific execution
    compareSnapshots?: boolean; // Compare output snapshots
    checkDeterminism?: boolean; // Run multiple times and compare
    iterations?: number; // Number of iterations for determinism check
    fixtures?: ExecutionFixture[]; // Pre-recorded fixtures to replay
    // NEW: Active fixture injection and mocking
    injectFixtures?: boolean; // Inject fixtures into workflow before execution
    mockExternalServices?: boolean; // Replace HTTP nodes with mocks
    freezeTime?: Date; // Fixed timestamp for deterministic time operations
    mockConfigs?: NodeMockConfig[]; // Specific mocks for nodes
  };
}

/**
 * Configuration for mocking specific nodes
 */
export interface NodeMockConfig {
  nodeName: string;
  mockResponse: unknown;
  statusCode?: number;
  headers?: Record<string, string>;
  delay?: number; // Simulate latency
}

export interface ExecutionFixture {
  id: string;
  name: string;
  inputData: Record<string, unknown>;
  expectedOutput: Record<string, unknown>;
  nodeSnapshots: Record<string, NodeSnapshot>;
  metadata: {
    recordedAt: string;
    workflowVersion?: string;
    environment?: string;
  };
}

export interface NodeSnapshot {
  nodeName: string;
  inputData: unknown;
  outputData: unknown;
  executionTime: number;
  status: 'success' | 'error';
}

export interface ReplayabilityTestResult {
  workflowId: string;
  workflowName: string;
  testDate: string;
  passed: boolean;
  score: number;
  determinismScore: number;
  replayabilityScore: number;
  issues: ReplayabilityIssue[];
  nonDeterministicNodes: NonDeterministicNode[];
  recommendations: string[];
  fixtures?: ExecutionFixture[];
  comparisonResults?: SnapshotComparison[];
  // NEW: Mocked execution results
  mockedExecutionResult?: MockedExecutionResult;
}

/**
 * Result of executing workflow with mocked nodes
 */
export interface MockedExecutionResult {
  executed: boolean;
  mockedNodes: string[];
  frozenTime?: string;
  deterministic: boolean;
  outputMatchesExpected: boolean;
  executionTime: number;
  mockedCalls: MockedCallInfo[];
  summary: string;
}

/**
 * Information about a mocked call during execution
 */
export interface MockedCallInfo {
  nodeName: string;
  originalType: string;
  mockResponseUsed: boolean;
  executionTime: number;
}

export interface ReplayabilityIssue {
  type: 'non-deterministic' | 'unstable-id' | 'timestamp-dependent' | 'random-value' | 'external-state' | 'pagination-drift';
  severity: 'critical' | 'high' | 'medium' | 'low';
  node: string;
  field?: string;
  message: string;
  suggestion: string;
}

export interface NonDeterministicNode {
  nodeName: string;
  nodeType: string;
  reason: string;
  variance: number; // 0-1, how much output varies
  examples: Array<{ run: number; value: unknown }>;
}

export interface SnapshotComparison {
  nodeName: string;
  matched: boolean;
  expectedOutput: unknown;
  actualOutput: unknown;
  differences: FieldDifference[];
}

export interface FieldDifference {
  path: string;
  expected: unknown;
  actual: unknown;
  type: 'missing' | 'extra' | 'changed' | 'type-mismatch';
}

// ============================================================================
// Non-Determinism Patterns
// ============================================================================

const NON_DETERMINISTIC_PATTERNS = {
  // Timestamp-related patterns
  timestamps: [
    /Date\.now\(\)/,
    /new Date\(\)/,
    /\$now/,
    /\$today/,
    /timestamp/i,
    /createdAt/i,
    /updatedAt/i,
    /\{\{\s*\$now\s*\}\}/,
  ],

  // Random value patterns
  randomness: [
    /Math\.random\(\)/,
    /uuid/i,
    /guid/i,
    /nanoid/i,
    /\$randomInt/,
    /\$randomString/,
  ],

  // Unstable ID patterns
  unstableIds: [
    /execution\.id/,
    /\$execution\.id/,
    /runId/i,
    /sessionId/i,
    /requestId/i,
  ],

  // External state patterns
  externalState: [
    /process\.env/,
    /\$env\./,
    /\$vars\./,
  ],
};

// Node types known to be non-deterministic
const NON_DETERMINISTIC_NODE_TYPES = [
  'n8n-nodes-base.httpRequest', // External API calls
  'n8n-nodes-base.executeCommand', // Shell commands
  'n8n-nodes-base.function', // Custom code
  'n8n-nodes-base.code', // Custom code
  'n8n-nodes-base.crypto', // Random generation
];

// ============================================================================
// Agent Implementation
// ============================================================================

export class N8nReplayabilityTesterAgent extends N8nBaseAgent {
  private fixtureStore: Map<string, ExecutionFixture[]> = new Map();

  constructor(config: N8nAgentConfig) {
    const capabilities: AgentCapability[] = [
      {
        name: 'determinism-testing',
        version: '1.0.0',
        description: 'Test workflow determinism across multiple runs',
        parameters: {},
      },
      {
        name: 'execution-replay',
        version: '1.0.0',
        description: 'Replay workflows from recorded fixtures',
        parameters: {},
      },
      {
        name: 'snapshot-comparison',
        version: '1.0.0',
        description: 'Compare execution snapshots for consistency',
        parameters: {},
      },
      {
        name: 'fixture-recording',
        version: '1.0.0',
        description: 'Record execution fixtures for replay testing',
        parameters: {},
      },
      {
        name: 'fixture-injection',
        version: '1.0.0',
        description: 'Inject fixtures into workflow for deterministic execution',
        parameters: {},
      },
      {
        name: 'service-mocking',
        version: '1.0.0',
        description: 'Mock external service calls with recorded responses',
        parameters: {},
      },
      {
        name: 'time-freezing',
        version: '1.0.0',
        description: 'Freeze time for deterministic timestamp operations',
        parameters: {},
      },
    ];

    super({
      ...config,
      type: 'n8n-replayability-tester' as any,
      capabilities: [...capabilities, ...(config.capabilities || [])],
    });
  }

  protected async performTask(task: QETask): Promise<ReplayabilityTestResult> {
    const replayTask = task as ReplayabilityTestTask;

    if (replayTask.type !== 'replayability-test') {
      throw new Error(`Unsupported task type: ${replayTask.type}`);
    }

    return this.testReplayability(replayTask.target, replayTask.options);
  }

  /**
   * Test workflow replayability
   */
  async testReplayability(
    workflowId: string,
    options?: ReplayabilityTestTask['options'],
    providedWorkflow?: N8nWorkflow
  ): Promise<ReplayabilityTestResult> {
    const workflow = providedWorkflow || await this.getWorkflow(workflowId);
    const issues: ReplayabilityIssue[] = [];
    const nonDeterministicNodes: NonDeterministicNode[] = [];
    const recommendations: string[] = [];
    let comparisonResults: SnapshotComparison[] | undefined;
    let recordedFixtures: ExecutionFixture[] | undefined;

    // 1. Static analysis for non-deterministic patterns
    const staticIssues = this.analyzeStaticNonDeterminism(workflow);
    issues.push(...staticIssues);

    // 2. Check node types for known non-determinism
    const nodeTypeIssues = this.checkNodeTypes(workflow);
    issues.push(...nodeTypeIssues);

    // 3. Run determinism check if requested
    if (options?.checkDeterminism) {
      const iterations = options.iterations || 3;
      const determinismResult = await this.checkDeterminism(workflow, iterations);
      nonDeterministicNodes.push(...determinismResult.nonDeterministicNodes);
      issues.push(...determinismResult.issues);
    }

    // 4. Replay from fixture if provided
    if (options?.replayExecutionId || options?.fixtures) {
      const fixtures = options.fixtures || await this.loadFixtures(workflowId, options.replayExecutionId);
      comparisonResults = await this.replayAndCompare(workflow, fixtures);

      const replayIssues = this.analyzeReplayResults(comparisonResults);
      issues.push(...replayIssues);
    }

    // 5. Record fixture if in record mode
    if (options?.recordMode) {
      recordedFixtures = await this.recordFixture(workflow);
      this.storeFixtures(workflowId, recordedFixtures);
    }

    // NEW 6. Execute with mocking if requested
    let mockedExecutionResult: MockedExecutionResult | undefined;
    if (options?.injectFixtures || options?.mockExternalServices || options?.mockConfigs) {
      mockedExecutionResult = await this.executeWithMocking(
        workflowId,
        workflow,
        options.fixtures || [],
        options.mockConfigs || [],
        options.mockExternalServices || false,
        options.freezeTime
      );

      // Add issues from mocked execution
      if (!mockedExecutionResult.deterministic) {
        issues.push({
          type: 'non-deterministic',
          severity: 'high',
          node: 'workflow',
          message: 'Workflow produced non-deterministic output even with mocking',
          suggestion: 'Review mocking configuration - some non-determinism may be internal',
        });
      }
    }

    // Generate recommendations
    recommendations.push(...this.generateRecommendations(issues, nonDeterministicNodes));

    // Calculate scores
    const determinismScore = this.calculateDeterminismScore(nonDeterministicNodes, workflow.nodes.length);
    const replayabilityScore = this.calculateReplayabilityScore(issues);
    const score = Math.round((determinismScore + replayabilityScore) / 2);

    const result: ReplayabilityTestResult = {
      workflowId: workflow.id || workflowId,
      workflowName: workflow.name,
      testDate: new Date().toISOString(),
      passed: issues.filter(i => i.severity === 'critical' || i.severity === 'high').length === 0,
      score,
      determinismScore,
      replayabilityScore,
      issues,
      nonDeterministicNodes,
      recommendations,
      fixtures: recordedFixtures,
      comparisonResults,
      mockedExecutionResult,
    };

    // Store result
    await this.storeTestResult(`replayability-test:${workflowId}`, result);

    // Emit event
    this.emitEvent('replayability.test.completed', {
      workflowId,
      passed: result.passed,
      determinismScore,
      replayabilityScore,
      issueCount: issues.length,
    });

    return result;
  }

  /**
   * Analyze workflow for static non-determinism patterns
   */
  private analyzeStaticNonDeterminism(workflow: N8nWorkflow): ReplayabilityIssue[] {
    const issues: ReplayabilityIssue[] = [];

    for (const node of workflow.nodes) {
      const nodeJson = JSON.stringify(node.parameters);

      // Check timestamp patterns
      for (const pattern of NON_DETERMINISTIC_PATTERNS.timestamps) {
        if (pattern.test(nodeJson)) {
          issues.push({
            type: 'timestamp-dependent',
            severity: 'medium',
            node: node.name,
            message: `Node uses timestamp-dependent expression`,
            suggestion: 'Use fixed timestamps for testing or pass timestamp as input parameter',
          });
          break;
        }
      }

      // Check randomness patterns
      for (const pattern of NON_DETERMINISTIC_PATTERNS.randomness) {
        if (pattern.test(nodeJson)) {
          issues.push({
            type: 'random-value',
            severity: 'high',
            node: node.name,
            message: `Node uses random value generation`,
            suggestion: 'Seed random generators or use deterministic IDs for testing',
          });
          break;
        }
      }

      // Check unstable ID patterns
      for (const pattern of NON_DETERMINISTIC_PATTERNS.unstableIds) {
        if (pattern.test(nodeJson)) {
          issues.push({
            type: 'unstable-id',
            severity: 'low',
            node: node.name,
            message: `Node uses execution-specific IDs`,
            suggestion: 'Avoid using execution IDs in business logic',
          });
          break;
        }
      }

      // Check external state patterns
      for (const pattern of NON_DETERMINISTIC_PATTERNS.externalState) {
        if (pattern.test(nodeJson)) {
          issues.push({
            type: 'external-state',
            severity: 'medium',
            node: node.name,
            message: `Node depends on external state (environment variables)`,
            suggestion: 'Use consistent environment or mock external state for testing',
          });
          break;
        }
      }
    }

    return issues;
  }

  /**
   * Check node types for known non-determinism
   */
  private checkNodeTypes(workflow: N8nWorkflow): ReplayabilityIssue[] {
    const issues: ReplayabilityIssue[] = [];

    for (const node of workflow.nodes) {
      if (NON_DETERMINISTIC_NODE_TYPES.some(t => node.type.includes(t))) {
        issues.push({
          type: 'external-state',
          severity: 'medium',
          node: node.name,
          message: `Node type "${node.type}" may produce non-deterministic results`,
          suggestion: 'Mock external calls or use recorded responses for testing',
        });
      }
    }

    return issues;
  }

  /**
   * Check determinism by running workflow multiple times
   */
  private async checkDeterminism(
    workflow: N8nWorkflow,
    iterations: number
  ): Promise<{ nonDeterministicNodes: NonDeterministicNode[]; issues: ReplayabilityIssue[] }> {
    const nonDeterministicNodes: NonDeterministicNode[] = [];
    const issues: ReplayabilityIssue[] = [];

    // Collect execution results
    const executionResults: Map<string, unknown[]> = new Map();

    try {
      for (let i = 0; i < iterations; i++) {
        const execution = await this.executeWorkflow(workflow.id, {}, {
          waitForCompletion: true,
          timeout: 30000,
        });

        const runData = execution.data?.resultData?.runData;
        if (runData) {
          for (const [nodeName, nodeRuns] of Object.entries(runData)) {
            const output = nodeRuns[0]?.data?.main?.[0]?.[0]?.json;

            if (!executionResults.has(nodeName)) {
              executionResults.set(nodeName, []);
            }
            executionResults.get(nodeName)!.push(output);
          }
        }
      }

      // Analyze variance
      for (const [nodeName, outputs] of executionResults.entries()) {
        const variance = this.calculateOutputVariance(outputs);

        if (variance > 0) {
          const node = workflow.nodes.find(n => n.name === nodeName);
          nonDeterministicNodes.push({
            nodeName,
            nodeType: node?.type || 'unknown',
            reason: 'Output varies between runs',
            variance,
            examples: outputs.slice(0, 3).map((value, i) => ({ run: i + 1, value })),
          });

          if (variance > 0.5) {
            issues.push({
              type: 'non-deterministic',
              severity: 'high',
              node: nodeName,
              message: `Node output varies significantly between runs (${Math.round(variance * 100)}% variance)`,
              suggestion: 'Review node configuration and mock external dependencies',
            });
          }
        }
      }
    } catch (error) {
      issues.push({
        type: 'non-deterministic',
        severity: 'medium',
        node: 'workflow',
        message: `Could not complete determinism check: ${(error as Error).message}`,
        suggestion: 'Ensure workflow can be executed multiple times',
      });
    }

    return { nonDeterministicNodes, issues };
  }

  /**
   * Calculate output variance between runs
   */
  private calculateOutputVariance(outputs: unknown[]): number {
    if (outputs.length < 2) return 0;

    let differences = 0;
    const firstOutput = JSON.stringify(outputs[0]);

    for (let i = 1; i < outputs.length; i++) {
      if (JSON.stringify(outputs[i]) !== firstOutput) {
        differences++;
      }
    }

    return differences / (outputs.length - 1);
  }

  /**
   * Replay workflow and compare with fixtures
   */
  private async replayAndCompare(
    workflow: N8nWorkflow,
    fixtures: ExecutionFixture[]
  ): Promise<SnapshotComparison[]> {
    const comparisons: SnapshotComparison[] = [];

    for (const fixture of fixtures) {
      try {
        const execution = await this.executeWorkflow(workflow.id, fixture.inputData, {
          waitForCompletion: true,
          timeout: 60000,
        });

        const runData = execution.data?.resultData?.runData;
        if (runData) {
          for (const [nodeName, expectedSnapshot] of Object.entries(fixture.nodeSnapshots)) {
            const actualOutput = runData[nodeName]?.[0]?.data?.main?.[0]?.[0]?.json;

            const differences = this.compareValues(
              expectedSnapshot.outputData,
              actualOutput,
              ''
            );

            comparisons.push({
              nodeName,
              matched: differences.length === 0,
              expectedOutput: expectedSnapshot.outputData,
              actualOutput,
              differences,
            });
          }
        }
      } catch (error) {
        // Add comparison failure
        for (const nodeName of Object.keys(fixture.nodeSnapshots)) {
          comparisons.push({
            nodeName,
            matched: false,
            expectedOutput: fixture.nodeSnapshots[nodeName].outputData,
            actualOutput: null,
            differences: [{
              path: '',
              expected: 'execution',
              actual: 'error',
              type: 'changed',
            }],
          });
        }
      }
    }

    return comparisons;
  }

  /**
   * Compare two values and find differences
   */
  private compareValues(expected: unknown, actual: unknown, path: string): FieldDifference[] {
    const differences: FieldDifference[] = [];

    // Null/undefined handling
    if (expected === null || expected === undefined) {
      if (actual !== expected) {
        differences.push({ path, expected, actual, type: 'changed' });
      }
      return differences;
    }

    if (actual === null || actual === undefined) {
      differences.push({ path, expected, actual, type: 'missing' });
      return differences;
    }

    // Type check
    if (typeof expected !== typeof actual) {
      differences.push({ path, expected, actual, type: 'type-mismatch' });
      return differences;
    }

    // Array comparison
    if (Array.isArray(expected)) {
      if (!Array.isArray(actual)) {
        differences.push({ path, expected, actual, type: 'type-mismatch' });
        return differences;
      }

      const maxLen = Math.max(expected.length, actual.length);
      for (let i = 0; i < maxLen; i++) {
        const itemPath = `${path}[${i}]`;
        if (i >= expected.length) {
          differences.push({ path: itemPath, expected: undefined, actual: actual[i], type: 'extra' });
        } else if (i >= actual.length) {
          differences.push({ path: itemPath, expected: expected[i], actual: undefined, type: 'missing' });
        } else {
          differences.push(...this.compareValues(expected[i], actual[i], itemPath));
        }
      }
      return differences;
    }

    // Object comparison
    if (typeof expected === 'object') {
      const expectedObj = expected as Record<string, unknown>;
      const actualObj = actual as Record<string, unknown>;
      const allKeys = new Set([...Object.keys(expectedObj), ...Object.keys(actualObj)]);

      for (const key of allKeys) {
        const keyPath = path ? `${path}.${key}` : key;
        if (!(key in expectedObj)) {
          differences.push({ path: keyPath, expected: undefined, actual: actualObj[key], type: 'extra' });
        } else if (!(key in actualObj)) {
          differences.push({ path: keyPath, expected: expectedObj[key], actual: undefined, type: 'missing' });
        } else {
          differences.push(...this.compareValues(expectedObj[key], actualObj[key], keyPath));
        }
      }
      return differences;
    }

    // Primitive comparison
    if (expected !== actual) {
      differences.push({ path, expected, actual, type: 'changed' });
    }

    return differences;
  }

  /**
   * Record execution as fixture
   */
  private async recordFixture(workflow: N8nWorkflow): Promise<ExecutionFixture[]> {
    const fixtures: ExecutionFixture[] = [];

    try {
      const execution = await this.executeWorkflow(workflow.id, {}, {
        waitForCompletion: true,
        timeout: 60000,
      });

      const nodeSnapshots: Record<string, NodeSnapshot> = {};
      const runData = execution.data?.resultData?.runData;

      if (runData) {
        for (const [nodeName, nodeRuns] of Object.entries(runData)) {
          const run = nodeRuns[0];
          if (run) {
            nodeSnapshots[nodeName] = {
              nodeName,
              inputData: run.source?.[0] ? runData[run.source[0].previousNode]?.[0]?.data?.main?.[0]?.[0]?.json : null,
              outputData: run.data?.main?.[0]?.[0]?.json,
              executionTime: run.executionTime,
              status: run.executionStatus,
            };
          }
        }
      }

      fixtures.push({
        id: `fixture-${Date.now()}`,
        name: `${workflow.name} - Auto-recorded`,
        inputData: {},
        expectedOutput: nodeSnapshots[Object.keys(nodeSnapshots).pop() || '']?.outputData as Record<string, unknown> || {},
        nodeSnapshots,
        metadata: {
          recordedAt: new Date().toISOString(),
          workflowVersion: workflow.versionId,
        },
      });
    } catch (error) {
      this.logger.warn('Failed to record fixture:', error);
    }

    return fixtures;
  }

  /**
   * Store fixtures for later use
   */
  private storeFixtures(workflowId: string, fixtures: ExecutionFixture[]): void {
    const existing = this.fixtureStore.get(workflowId) || [];
    this.fixtureStore.set(workflowId, [...existing, ...fixtures]);
  }

  /**
   * Load fixtures from store or execution history
   */
  private async loadFixtures(workflowId: string, executionId?: string): Promise<ExecutionFixture[]> {
    if (this.fixtureStore.has(workflowId)) {
      const fixtures = this.fixtureStore.get(workflowId)!;
      if (executionId) {
        return fixtures.filter(f => f.id === executionId);
      }
      return fixtures;
    }
    return [];
  }

  /**
   * Analyze replay results for issues
   */
  private analyzeReplayResults(comparisons: SnapshotComparison[]): ReplayabilityIssue[] {
    const issues: ReplayabilityIssue[] = [];

    for (const comparison of comparisons) {
      if (!comparison.matched) {
        const severity = comparison.differences.length > 5 ? 'high' : 'medium';
        issues.push({
          type: 'non-deterministic',
          severity,
          node: comparison.nodeName,
          message: `Node output differs from recorded fixture (${comparison.differences.length} differences)`,
          suggestion: 'Review what changed - may indicate drift or non-determinism',
        });
      }
    }

    return issues;
  }

  /**
   * Calculate determinism score
   */
  private calculateDeterminismScore(nonDeterministicNodes: NonDeterministicNode[], totalNodes: number): number {
    if (totalNodes === 0) return 100;
    const deterministicNodes = totalNodes - nonDeterministicNodes.length;
    return Math.round((deterministicNodes / totalNodes) * 100);
  }

  /**
   * Calculate replayability score
   */
  private calculateReplayabilityScore(issues: ReplayabilityIssue[]): number {
    const criticalCount = issues.filter(i => i.severity === 'critical').length;
    const highCount = issues.filter(i => i.severity === 'high').length;
    const mediumCount = issues.filter(i => i.severity === 'medium').length;

    return Math.max(0, 100 - (criticalCount * 25) - (highCount * 15) - (mediumCount * 5));
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(
    issues: ReplayabilityIssue[],
    nonDeterministicNodes: NonDeterministicNode[]
  ): string[] {
    const recommendations: string[] = [];

    if (nonDeterministicNodes.length > 0) {
      recommendations.push(
        `${nonDeterministicNodes.length} nodes produce varying outputs - consider mocking external dependencies`
      );
    }

    const timestampIssues = issues.filter(i => i.type === 'timestamp-dependent');
    if (timestampIssues.length > 0) {
      recommendations.push(
        'Use fixed timestamps (e.g., $input.timestamp) instead of $now for reproducible tests'
      );
    }

    const randomIssues = issues.filter(i => i.type === 'random-value');
    if (randomIssues.length > 0) {
      recommendations.push(
        'Seed random generators or use deterministic ID generation for testing'
      );
    }

    const externalStateIssues = issues.filter(i => i.type === 'external-state');
    if (externalStateIssues.length > 0) {
      recommendations.push(
        'Create a test environment with consistent external state for replay testing'
      );
    }

    return recommendations;
  }

  /**
   * Quick replayability check
   */
  async quickCheck(workflowId: string): Promise<{
    replayable: boolean;
    determinismScore: number;
    topIssue: string | null;
  }> {
    const result = await this.testReplayability(workflowId, {
      checkDeterminism: false, // Skip actual execution for quick check
    });

    return {
      replayable: result.passed,
      determinismScore: result.determinismScore,
      topIssue: result.issues[0]?.message || null,
    };
  }

  // ============================================================================
  // Active Fixture Injection & Service Mocking
  // ============================================================================

  /**
   * Execute workflow with mocked nodes and time freezing
   */
  async executeWithMocking(
    workflowId: string,
    workflow: N8nWorkflow,
    fixtures: ExecutionFixture[],
    mockConfigs: NodeMockConfig[],
    mockAllExternal: boolean,
    freezeTime?: Date
  ): Promise<MockedExecutionResult> {
    const startTime = Date.now();
    const harness = new N8nTestHarness(this.n8nConfig);
    const mockedNodes: string[] = [];
    const mockedCalls: MockedCallInfo[] = [];

    try {
      // Build mock configurations
      const mocks = this.buildMockConfigurations(
        workflow,
        fixtures,
        mockConfigs,
        mockAllExternal
      );

      mockedNodes.push(...mocks.map(m => m.targetNode));

      // Create mocked workflow
      const { workflow: mockedWorkflow, cleanup } = await harness.createMockedWorkflow(
        workflowId,
        mocks
      );

      try {
        // Execute with optional time simulation
        let execution: TestWorkflowResult;
        if (freezeTime) {
          const timeConfig: TimeSimulationConfig = {
            freezeTime,
            mockDateNodes: true,
          };
          execution = await harness.executeWithTimeSimulation(
            mockedWorkflow.id,
            timeConfig,
            {}
          );
        } else {
          // Activate and execute
          await this.n8nClient.activateWorkflow(mockedWorkflow.id);
          const exec = await this.n8nClient.executeWorkflow(mockedWorkflow.id, {});
          execution = {
            originalWorkflowId: workflowId,
            testWorkflowId: mockedWorkflow.id,
            execution: exec,
            cleanedUp: false,
          };
        }

        // Analyze results
        const deterministic = await this.checkMockedDeterminism(
          harness,
          mockedWorkflow.id,
          mocks,
          freezeTime
        );

        // Check if output matches expected (from fixtures)
        const outputMatchesExpected = this.checkOutputMatchesExpected(
          execution.execution,
          fixtures
        );

        // Record mocked call info
        for (const mock of mocks) {
          mockedCalls.push({
            nodeName: mock.targetNode,
            originalType: this.getOriginalNodeType(workflow, mock.targetNode),
            mockResponseUsed: true,
            executionTime: 0, // Would need detailed execution timing
          });
        }

        const summary = this.generateMockedExecutionSummary(
          mockedNodes.length,
          deterministic,
          outputMatchesExpected,
          freezeTime,
          Date.now() - startTime
        );

        // Emit event
        this.emitEvent('replayability.mocked-execution.completed', {
          workflowId,
          mockedNodes: mockedNodes.length,
          deterministic,
          outputMatchesExpected,
        });

        return {
          executed: true,
          mockedNodes,
          frozenTime: freezeTime?.toISOString(),
          deterministic,
          outputMatchesExpected,
          executionTime: Date.now() - startTime,
          mockedCalls,
          summary,
        };
      } finally {
        await cleanup();
      }
    } catch (error) {
      return {
        executed: false,
        mockedNodes,
        deterministic: false,
        outputMatchesExpected: false,
        executionTime: Date.now() - startTime,
        mockedCalls,
        summary: `Mocked execution failed: ${(error as Error).message}`,
      };
    } finally {
      await harness.cleanup();
    }
  }

  /**
   * Build mock configurations from fixtures and explicit configs
   */
  private buildMockConfigurations(
    workflow: N8nWorkflow,
    fixtures: ExecutionFixture[],
    explicitMocks: NodeMockConfig[],
    mockAllExternal: boolean
  ): MockConfig[] {
    const mocks: MockConfig[] = [];

    // Add explicit mocks
    for (const mock of explicitMocks) {
      mocks.push({
        targetNode: mock.nodeName,
        mockResponse: mock.mockResponse,
        statusCode: mock.statusCode,
        headers: mock.headers,
        delay: mock.delay,
      });
    }

    // Add mocks from fixtures
    for (const fixture of fixtures) {
      for (const [nodeName, snapshot] of Object.entries(fixture.nodeSnapshots)) {
        // Don't double-mock
        if (mocks.some(m => m.targetNode === nodeName)) continue;

        mocks.push({
          targetNode: nodeName,
          mockResponse: snapshot.outputData,
        });
      }
    }

    // Auto-mock all external nodes if requested
    if (mockAllExternal) {
      for (const node of workflow.nodes) {
        // Skip if already mocked
        if (mocks.some(m => m.targetNode === node.name)) continue;

        // Mock HTTP requests and other external nodes
        if (NON_DETERMINISTIC_NODE_TYPES.some(t => node.type.includes(t))) {
          // Look for fixture data first
          const fixtureData = this.findFixtureDataForNode(fixtures, node.name);

          mocks.push({
            targetNode: node.name,
            mockResponse: fixtureData || this.generateDefaultMock(node),
          });
        }
      }
    }

    return mocks;
  }

  /**
   * Find fixture data for a specific node
   */
  private findFixtureDataForNode(fixtures: ExecutionFixture[], nodeName: string): unknown | null {
    for (const fixture of fixtures) {
      const snapshot = fixture.nodeSnapshots[nodeName];
      if (snapshot) {
        return snapshot.outputData;
      }
    }
    return null;
  }

  /**
   * Generate a default mock response for a node
   */
  private generateDefaultMock(node: N8nNode): unknown {
    const nodeType = node.type.toLowerCase();

    if (nodeType.includes('httprequest')) {
      return {
        __mocked: true,
        status: 200,
        data: {},
        message: 'Mocked HTTP response',
      };
    }

    if (nodeType.includes('executecommand')) {
      return {
        __mocked: true,
        stdout: '',
        stderr: '',
        exitCode: 0,
      };
    }

    return {
      __mocked: true,
      data: null,
    };
  }

  /**
   * Get original node type before mocking
   */
  private getOriginalNodeType(workflow: N8nWorkflow, nodeName: string): string {
    const node = workflow.nodes.find(n => n.name === nodeName);
    return node?.type || 'unknown';
  }

  /**
   * Check if mocked execution is deterministic by running twice
   */
  private async checkMockedDeterminism(
    harness: N8nTestHarness,
    workflowId: string,
    mocks: MockConfig[],
    freezeTime?: Date
  ): Promise<boolean> {
    try {
      // Execute twice with same mocks
      const config = {
        concurrency: 2,
        staggerMs: 100,
        timeout: 30000,
      };

      const result = await harness.executeConcurrently(workflowId, config);

      // Check if outputs are identical
      return result.allIdentical;
    } catch {
      // If we can't verify, assume not deterministic
      return false;
    }
  }

  /**
   * Check if execution output matches fixture expectations
   */
  private checkOutputMatchesExpected(
    execution: N8nExecution | null,
    fixtures: ExecutionFixture[]
  ): boolean {
    if (!execution || fixtures.length === 0) {
      return true; // No comparison to make
    }

    const runData = execution.data?.resultData?.runData;
    if (!runData) return false;

    for (const fixture of fixtures) {
      // Get final output
      const nodeNames = Object.keys(runData);
      const lastNode = nodeNames[nodeNames.length - 1];
      const actualOutput = runData[lastNode]?.[0]?.data?.main?.[0]?.[0]?.json;

      // Compare with expected
      const differences = this.compareValues(
        fixture.expectedOutput,
        actualOutput,
        ''
      );

      // Allow for some differences (timestamps, IDs that may change)
      const significantDifferences = differences.filter(d =>
        !this.isAllowedDifference(d.path)
      );

      if (significantDifferences.length > 0) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check if a difference is allowed (timestamps, IDs, etc)
   */
  private isAllowedDifference(path: string): boolean {
    const allowedPatterns = [
      /timestamp/i,
      /createdAt/i,
      /updatedAt/i,
      /id$/i,
      /executionId/i,
      /requestId/i,
      /sessionId/i,
    ];

    return allowedPatterns.some(pattern => pattern.test(path));
  }

  /**
   * Generate summary of mocked execution
   */
  private generateMockedExecutionSummary(
    mockedCount: number,
    deterministic: boolean,
    outputMatches: boolean,
    freezeTime?: Date,
    executionTime?: number
  ): string {
    const parts: string[] = [];

    parts.push(`Executed with ${mockedCount} mocked node(s)`);

    if (freezeTime) {
      parts.push(`Time frozen to ${freezeTime.toISOString()}`);
    }

    if (deterministic) {
      parts.push('✓ Execution is deterministic');
    } else {
      parts.push('⚠️ Execution shows non-deterministic behavior');
    }

    if (outputMatches) {
      parts.push('✓ Output matches expected fixtures');
    } else {
      parts.push('⚠️ Output differs from expected fixtures');
    }

    if (executionTime) {
      parts.push(`Completed in ${executionTime}ms`);
    }

    return parts.join('. ');
  }

  /**
   * Record and store fixtures with mocking support
   */
  async recordFixtureWithMocking(
    workflowId: string,
    inputData: Record<string, unknown> = {}
  ): Promise<ExecutionFixture> {
    const workflow = await this.getWorkflow(workflowId);

    const execution = await this.executeWorkflow(workflowId, inputData, {
      waitForCompletion: true,
      timeout: 60000,
    });

    const nodeSnapshots: Record<string, NodeSnapshot> = {};
    const runData = execution.data?.resultData?.runData;

    if (runData) {
      for (const [nodeName, nodeRuns] of Object.entries(runData)) {
        const run = nodeRuns[0];
        if (run) {
          nodeSnapshots[nodeName] = {
            nodeName,
            inputData: run.source?.[0] ? runData[run.source[0].previousNode]?.[0]?.data?.main?.[0]?.[0]?.json : null,
            outputData: run.data?.main?.[0]?.[0]?.json,
            executionTime: run.executionTime,
            status: run.executionStatus,
          };
        }
      }
    }

    const fixture: ExecutionFixture = {
      id: `fixture-${Date.now()}-${seededRandom.randomUUID().substring(0, 9)}`,
      name: `${workflow.name} - ${new Date().toISOString()}`,
      inputData,
      expectedOutput: nodeSnapshots[Object.keys(nodeSnapshots).pop() || '']?.outputData as Record<string, unknown> || {},
      nodeSnapshots,
      metadata: {
        recordedAt: new Date().toISOString(),
        workflowVersion: workflow.versionId,
        environment: process.env.NODE_ENV || 'development',
      },
    };

    // Store fixture
    this.storeFixtures(workflowId, [fixture]);

    // Also persist to memory store
    await this.storeTestResult(`fixture:${workflowId}:${fixture.id}`, fixture);

    return fixture;
  }

  /**
   * Load fixtures from persistent storage
   */
  async loadPersistedFixtures(workflowId: string): Promise<ExecutionFixture[]> {
    const fixtures: ExecutionFixture[] = [];

    // Load from in-memory store
    const inMemory = this.fixtureStore.get(workflowId) || [];
    fixtures.push(...inMemory);

    // Would also load from persistent storage here
    // const persisted = await this.retrieveTestResult(`fixtures:${workflowId}`);

    return fixtures;
  }

  /**
   * Execute replay test with fixtures from storage
   */
  async executeReplayTest(
    workflowId: string,
    fixtureId?: string
  ): Promise<ReplayabilityTestResult> {
    const fixtures = await this.loadPersistedFixtures(workflowId);
    const targetFixtures = fixtureId
      ? fixtures.filter(f => f.id === fixtureId)
      : fixtures;

    return this.testReplayability(workflowId, {
      fixtures: targetFixtures,
      injectFixtures: true,
      mockExternalServices: true,
      checkDeterminism: true,
      iterations: 2,
    });
  }
}
