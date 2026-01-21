/**
 * Agentic QE v3 - E2E Test Execution MCP Tool
 *
 * qe/tests/e2e/execute - Execute E2E test cases and suites using Vibium browser automation
 *
 * This tool wraps the E2E test runner service and exposes it via MCP.
 * Supports step-by-step execution, retry logic, and comprehensive result aggregation.
 */

import { MCPToolBase, MCPToolConfig, MCPToolContext, MCPToolSchema } from '../base';
import { ToolResult } from '../../types';
import type {
  E2ETestCase,
  E2ETestSuite,
  E2ETestResult,
  E2ETestSuiteResult,
} from '../../../domains/test-execution';

// ============================================================================
// Types
// ============================================================================

export interface E2EExecuteParams {
  /** Test case to execute (mutually exclusive with testSuite) */
  testCase?: E2ETestCase;
  /** Test suite to execute (mutually exclusive with testCase) */
  testSuite?: E2ETestSuite;
  /** Execution strategy for suites */
  strategy?: 'sequential' | 'parallel';
  /** Maximum parallel workers for suite execution */
  maxWorkers?: number;
  /** Runner configuration overrides */
  config?: {
    defaultStepTimeout?: number;
    defaultRetries?: number;
    screenshotOnFailure?: boolean;
    stopOnFirstFailure?: boolean;
    verbose?: boolean;
  };
  [key: string]: unknown;
}

export interface E2EExecuteResult {
  /** Test case result (if single test case) */
  testResult?: E2ETestResult;
  /** Test suite result (if test suite) */
  suiteResult?: E2ETestSuiteResult;
  /** Execution metadata */
  metadata: {
    executionType: 'testCase' | 'testSuite';
    totalDuration: number;
    success: boolean;
  };
}

// ============================================================================
// Tool Implementation
// ============================================================================

export class E2EExecuteTool extends MCPToolBase<E2EExecuteParams, E2EExecuteResult> {
  readonly config: MCPToolConfig = {
    name: 'qe/tests/e2e/execute',
    description: 'Execute E2E test cases or suites using Vibium browser automation with retry logic and comprehensive result aggregation',
    domain: 'test-execution',
    schema: E2E_EXECUTE_SCHEMA,
    streaming: true,
    timeout: 600000, // 10 minutes for E2E tests
  };

  async execute(
    params: E2EExecuteParams,
    context: MCPToolContext
  ): Promise<ToolResult<E2EExecuteResult>> {
    const { testCase, testSuite, strategy = 'sequential', config: runnerConfig } = params;

    // Validate input
    if (!testCase && !testSuite) {
      return {
        success: false,
        error: 'Either testCase or testSuite must be provided',
      };
    }

    if (testCase && testSuite) {
      return {
        success: false,
        error: 'Only one of testCase or testSuite can be provided',
      };
    }

    const startTime = Date.now();

    try {
      // Get E2E runner from domain
      const { createE2ETestRunnerService } = await import('../../../domains/test-execution');
      const { createVibiumClient } = await import('../../../integrations/vibium');

      // Create Vibium client
      const vibiumClient = await createVibiumClient({
        enabled: true,
      });

      // Create E2E runner
      const runner = createE2ETestRunnerService(vibiumClient, runnerConfig);

      // Execute test case or suite
      if (testCase) {
        this.emitStream(context, {
          status: 'running',
          message: `Executing E2E test case: ${testCase.name}`,
        });

        const result = await runner.runTestCase(testCase);
        const duration = Date.now() - startTime;

        this.emitStream(context, {
          status: 'complete',
          message: `Test case ${result.success ? 'passed' : 'failed'}`,
          progress: 100,
        });

        return {
          success: result.success,
          data: {
            testResult: result,
            metadata: {
              executionType: 'testCase',
              totalDuration: duration,
              success: result.success,
            },
          },
        };
      } else if (testSuite) {
        this.emitStream(context, {
          status: 'running',
          message: `Executing E2E test suite: ${testSuite.name} (${testSuite.testCases.length} tests, ${strategy} mode)`,
        });

        const result = await runner.runTestSuite(testSuite, strategy);
        const duration = Date.now() - startTime;

        this.emitStream(context, {
          status: 'complete',
          message: `Test suite ${result.success ? 'passed' : 'failed'}: ${result.summary.passed}/${result.summary.total} tests passed`,
          progress: 100,
        });

        return {
          success: result.success,
          data: {
            suiteResult: result,
            metadata: {
              executionType: 'testSuite',
              totalDuration: duration,
              success: result.success,
            },
          },
        };
      }

      return {
        success: false,
        error: 'No valid execution target',
      };
    } catch (error) {
      return {
        success: false,
        error: `E2E test execution failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}

// ============================================================================
// Schema Definition
// ============================================================================

const E2E_EXECUTE_SCHEMA: MCPToolSchema = {
  type: 'object',
  properties: {
    testCase: {
      type: 'object',
      description: 'E2E test case to execute (mutually exclusive with testSuite)',
      properties: {
        id: { type: 'string', description: 'Test case ID' },
        name: { type: 'string', description: 'Test case name' },
        description: { type: 'string', description: 'Test case description' },
        baseUrl: { type: 'string', description: 'Base URL for the test' },
        steps: { type: 'array', description: 'Test steps to execute' },
        viewport: {
          type: 'object',
          description: 'Browser viewport configuration',
          properties: {
            width: { type: 'number', description: 'Viewport width in pixels' },
            height: { type: 'number', description: 'Viewport height in pixels' },
          },
        },
      },
      required: ['id', 'name', 'baseUrl', 'steps'],
    },
    testSuite: {
      type: 'object',
      description: 'E2E test suite to execute (mutually exclusive with testCase)',
      properties: {
        id: { type: 'string', description: 'Test suite ID' },
        name: { type: 'string', description: 'Test suite name' },
        description: { type: 'string', description: 'Test suite description' },
        testCases: { type: 'array', description: 'Test cases in the suite' },
        parallel: { type: 'boolean', description: 'Run tests in parallel' },
        maxWorkers: { type: 'number', description: 'Maximum parallel workers' },
      },
      required: ['id', 'name', 'testCases'],
    },
    strategy: {
      type: 'string',
      description: 'Execution strategy for test suites',
      enum: ['sequential', 'parallel'],
      default: 'sequential',
    },
    maxWorkers: {
      type: 'number',
      description: 'Maximum parallel workers (overrides suite config)',
      minimum: 1,
      maximum: 8,
    },
    config: {
      type: 'object',
      description: 'E2E runner configuration overrides',
      properties: {
        defaultStepTimeout: {
          type: 'number',
          description: 'Default step timeout in milliseconds',
          minimum: 1000,
          default: 30000,
        },
        defaultRetries: {
          type: 'number',
          description: 'Default retry count for steps',
          minimum: 0,
          maximum: 5,
          default: 2,
        },
        screenshotOnFailure: {
          type: 'boolean',
          description: 'Capture screenshot on failure',
          default: true,
        },
        stopOnFirstFailure: {
          type: 'boolean',
          description: 'Stop execution on first failure',
          default: false,
        },
        verbose: {
          type: 'boolean',
          description: 'Enable verbose logging',
          default: false,
        },
      },
    },
  },
};
