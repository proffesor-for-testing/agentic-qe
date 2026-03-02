/**
 * Load Testing MCP Tool
 *
 * Exposes the agent load testing framework (AgentLoadTester, MetricsCollector,
 * BottleneckAnalyzer) as an MCP tool.
 */

import {
  MCPToolBase,
  MCPToolConfig,
  MCPToolContext,
  MCPToolSchema,
} from '../base.js';
import { ToolResult } from '../../types.js';
import { toErrorMessage } from '../../../shared/error-utils.js';

// ============================================================================
// Types
// ============================================================================

export interface LoadTestParams {
  targetAgents?: number;
  profile?: 'light' | 'medium' | 'heavy';
  durationMs?: number;
  mockMode?: boolean;
  [key: string]: unknown;
}

export interface LoadTestResult {
  testId: string;
  profile: string;
  targetAgents: number;
  duration: number;
  mockMode: boolean;
  passed: boolean;
  bottleneckCount: number;
  report: {
    overallSeverity: string;
    hasCritical: boolean;
    checksPerformed: number;
    bottlenecksDetected: number;
  };
  summary: string;
}

// ============================================================================
// Tool Implementation
// ============================================================================

export class LoadTestTool extends MCPToolBase<LoadTestParams, LoadTestResult> {
  readonly config: MCPToolConfig = {
    name: 'qe/tests/load',
    description:
      'Run agent load tests to validate fleet scalability. Supports light, medium, and heavy ' +
      'workload profiles. Uses mock agents by default (safe); set mockMode=false to test with ' +
      'real fleet agents (requires fleet_init). Reports bottlenecks and pass/fail criteria.',
    domain: 'test-execution',
    schema: this.buildSchema(),
    timeout: 300000,
  };

  private buildSchema(): MCPToolSchema {
    return {
      type: 'object',
      properties: {
        targetAgents: {
          type: 'number',
          description: 'Target number of concurrent agents to simulate',
          default: 10,
          minimum: 1,
          maximum: 200,
        },
        profile: {
          type: 'string',
          description: 'Workload profile: light, medium, or heavy',
          enum: ['light', 'medium', 'heavy'],
          default: 'medium',
        },
        durationMs: {
          type: 'number',
          description: 'Test duration in milliseconds',
          default: 30000,
          minimum: 5000,
          maximum: 300000,
        },
        mockMode: {
          type: 'boolean',
          description: 'Use mock agents (true, default) or real fleet agents (false, requires fleet_init)',
          default: true,
        },
      },
    };
  }

  async execute(
    params: LoadTestParams,
    context: MCPToolContext
  ): Promise<ToolResult<LoadTestResult>> {
    try {
      const { createAgentLoadTester } = await import('../../../testing/load/index.js');

      const profile = params.profile || 'medium';
      const targetAgents = params.targetAgents || 10;
      const durationMs = params.durationMs || 30000;
      const mockMode = params.mockMode !== false; // default true

      const tester = createAgentLoadTester({
        maxAgents: targetAgents,
        workloadProfile: profile,
        mockMode,
      });

      const result = await tester.runTest(targetAgents, durationMs);

      const bottlenecks = result.bottlenecks;
      return {
        success: true,
        data: {
          testId: context.requestId,
          profile,
          targetAgents,
          duration: result.duration,
          mockMode,
          passed: result.success,
          bottleneckCount: bottlenecks?.bottlenecks?.length ?? 0,
          report: {
            overallSeverity: bottlenecks?.overallSeverity ?? 'none',
            hasCritical: bottlenecks?.hasCritical ?? false,
            checksPerformed: bottlenecks?.summary?.totalChecks ?? 0,
            bottlenecksDetected: bottlenecks?.summary?.detected ?? 0,
          },
          summary: `Load test (${profile}, ${mockMode ? 'mock' : 'real'}): ${targetAgents} agents, ${durationMs}ms` +
            ` — ${result.success ? 'PASSED' : 'FAILED'}` +
            (bottlenecks?.hasCritical ? ' [CRITICAL BOTTLENECKS]' : ''),
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
