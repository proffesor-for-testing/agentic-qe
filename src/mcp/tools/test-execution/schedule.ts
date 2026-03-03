/**
 * Test Scheduling MCP Tool
 *
 * Exposes the test-scheduling pipeline (phase scheduler, git-aware selector,
 * flaky tracker) as an MCP tool.
 */

import {
  MCPToolBase,
  MCPToolConfig,
  MCPToolContext,
  MCPToolSchema,
  getMemoryBackend,
} from '../base.js';
import { ToolResult } from '../../types.js';
import { toErrorMessage } from '../../../shared/error-utils.js';

// ============================================================================
// Types
// ============================================================================

export interface TestScheduleParams {
  cwd?: string;
  gitRef?: string;
  useGitAware?: boolean;
  trackFlaky?: boolean;
  [key: string]: unknown;
}

export interface TestScheduleResult {
  pipelineId: string;
  phases: Array<{
    phaseId: string;
    phaseName: string;
    totalTests: number;
    passed: number;
    failed: number;
    passRate: number;
    durationMs: number;
  }>;
  gitAware: {
    enabled: boolean;
    selectedTests: number;
    gitRef?: string;
  };
  flakyTracking: {
    enabled: boolean;
  };
  totalDuration: number;
  ranAllTests: boolean;
  summary: string;
}

// ============================================================================
// Tool Implementation
// ============================================================================

export class TestScheduleTool extends MCPToolBase<TestScheduleParams, TestScheduleResult> {
  readonly config: MCPToolConfig = {
    name: 'qe/tests/schedule',
    description:
      'Schedule and execute tests using phase-based pipeline with git-aware selection and flaky tracking. ' +
      'Runs tests in phases (unit, integration, e2e), selects affected tests from git changes, and tracks flaky tests.',
    domain: 'test-execution',
    schema: this.buildSchema(),
  };

  private buildSchema(): MCPToolSchema {
    return {
      type: 'object',
      properties: {
        cwd: {
          type: 'string',
          description: 'Working directory for test execution (defaults to project root)',
        },
        gitRef: {
          type: 'string',
          description: 'Git ref to compare for affected test selection (e.g., "main", "HEAD~3")',
        },
        useGitAware: {
          type: 'boolean',
          description: 'Enable git-aware test selection to only run affected tests',
          default: true,
        },
        trackFlaky: {
          type: 'boolean',
          description: 'Enable flaky test tracking and quarantine',
          default: true,
        },
      },
    };
  }

  async execute(
    params: TestScheduleParams,
    context: MCPToolContext
  ): Promise<ToolResult<TestScheduleResult>> {
    try {
      const { runTestPipeline } = await import('../../../test-scheduling/index.js');
      const memory = await getMemoryBackend(context);

      const result = await runTestPipeline({
        cwd: params.cwd || process.cwd(),
        memory,
        baseRef: params.gitRef,
        flakyHistoryPath: params.trackFlaky !== false
          ? '.agentic-qe/flaky-history.json'
          : undefined,
        runAllTests: params.useGitAware === false,
      });

      const totalTests = result.phaseResults.reduce((sum, pr) => sum + pr.totalTests, 0);
      const totalPassed = result.phaseResults.reduce((sum, pr) => sum + pr.passed, 0);
      const totalFailed = result.phaseResults.reduce((sum, pr) => sum + pr.failed, 0);

      return {
        success: true,
        data: {
          pipelineId: context.requestId,
          phases: result.phaseResults.map(pr => ({
            phaseId: pr.phaseId,
            phaseName: pr.phaseName,
            totalTests: pr.totalTests,
            passed: pr.passed,
            failed: pr.failed,
            passRate: pr.passRate,
            durationMs: pr.durationMs,
          })),
          gitAware: {
            enabled: !result.ranAllTests,
            selectedTests: result.selectedTests.length,
            gitRef: params.gitRef,
          },
          flakyTracking: {
            enabled: params.trackFlaky !== false,
          },
          totalDuration: result.totalDurationMs,
          ranAllTests: result.ranAllTests,
          summary: `Executed ${result.phaseResults.length} phases, ${totalTests} tests (${totalPassed} passed, ${totalFailed} failed) in ${result.totalDurationMs}ms`,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: toErrorMessage(error),
      };
    }
  }
}
