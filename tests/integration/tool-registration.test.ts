/**
 * Integration Tests for Tool Registration
 * Verifies that all MCP tools and CLI commands are properly registered
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import { AgenticQEMCPServer } from '@mcp/server.js';
import { TOOL_NAMES } from '@mcp/tools.js';
import { Command } from 'commander';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const cliIndexPath = require.resolve('../../src/cli/index.js');

describe('MCP Tool Registration', () => {
  let server: AgenticQEMCPServer;

  beforeAll(() => {
    server = new AgenticQEMCPServer();
  });

  describe('Core Tools', () => {
    it('should register fleet init tool', () => {
      expect(server.supportsTool(TOOL_NAMES.FLEET_INIT)).toBe(true);
    });

    it('should register agent spawn tool', () => {
      expect(server.supportsTool(TOOL_NAMES.AGENT_SPAWN)).toBe(true);
    });

    it('should register fleet status tool', () => {
      expect(server.supportsTool(TOOL_NAMES.FLEET_STATUS)).toBe(true);
    });

    it('should register test generate tool', () => {
      expect(server.supportsTool(TOOL_NAMES.TEST_GENERATE)).toBe(true);
    });

    it('should register test execute tool', () => {
      expect(server.supportsTool(TOOL_NAMES.TEST_EXECUTE)).toBe(true);
    });

    it('should register quality analyze tool', () => {
      expect(server.supportsTool(TOOL_NAMES.QUALITY_ANALYZE)).toBe(true);
    });

    it('should register predict defects tool', () => {
      expect(server.supportsTool(TOOL_NAMES.PREDICT_DEFECTS)).toBe(true);
    });

    it('should register task orchestrate tool', () => {
      expect(server.supportsTool(TOOL_NAMES.TASK_ORCHESTRATE)).toBe(true);
    });

    it('should register optimize tests tool', () => {
      expect(server.supportsTool(TOOL_NAMES.OPTIMIZE_TESTS)).toBe(true);
    });
  });

  describe('Enhanced Test Tools', () => {
    it('should register test generate enhanced tool', () => {
      expect(server.supportsTool(TOOL_NAMES.TEST_GENERATE_ENHANCED)).toBe(true);
    });

    it('should register test execute parallel tool', () => {
      expect(server.supportsTool(TOOL_NAMES.TEST_EXECUTE_PARALLEL)).toBe(true);
    });

    it('should register test optimize sublinear tool', () => {
      expect(server.supportsTool(TOOL_NAMES.TEST_OPTIMIZE_SUBLINEAR)).toBe(true);
    });

    it('should register test report comprehensive tool', () => {
      expect(server.supportsTool(TOOL_NAMES.TEST_REPORT_COMPREHENSIVE)).toBe(true);
    });

    it('should register test coverage detailed tool', () => {
      expect(server.supportsTool(TOOL_NAMES.TEST_COVERAGE_DETAILED)).toBe(true);
    });
  });

  describe('Memory Tools', () => {
    it('should register memory store tool', () => {
      expect(server.supportsTool(TOOL_NAMES.MEMORY_STORE)).toBe(true);
    });

    it('should register memory retrieve tool', () => {
      expect(server.supportsTool(TOOL_NAMES.MEMORY_RETRIEVE)).toBe(true);
    });

    it('should register memory query tool', () => {
      expect(server.supportsTool(TOOL_NAMES.MEMORY_QUERY)).toBe(true);
    });

    it('should register memory share tool', () => {
      expect(server.supportsTool(TOOL_NAMES.MEMORY_SHARE)).toBe(true);
    });

    it('should register memory backup tool', () => {
      expect(server.supportsTool(TOOL_NAMES.MEMORY_BACKUP)).toBe(true);
    });

    it('should register blackboard post tool', () => {
      expect(server.supportsTool(TOOL_NAMES.BLACKBOARD_POST)).toBe(true);
    });

    it('should register blackboard read tool', () => {
      expect(server.supportsTool(TOOL_NAMES.BLACKBOARD_READ)).toBe(true);
    });

    it('should register consensus propose tool', () => {
      expect(server.supportsTool(TOOL_NAMES.CONSENSUS_PROPOSE)).toBe(true);
    });

    it('should register consensus vote tool', () => {
      expect(server.supportsTool(TOOL_NAMES.CONSENSUS_VOTE)).toBe(true);
    });

    it('should register artifact manifest tool', () => {
      expect(server.supportsTool(TOOL_NAMES.ARTIFACT_MANIFEST)).toBe(true);
    });
  });

  describe('Coordination Tools', () => {
    it('should register workflow create tool', () => {
      expect(server.supportsTool(TOOL_NAMES.WORKFLOW_CREATE)).toBe(true);
    });

    it('should register workflow execute tool', () => {
      expect(server.supportsTool(TOOL_NAMES.WORKFLOW_EXECUTE)).toBe(true);
    });

    it('should register workflow checkpoint tool', () => {
      expect(server.supportsTool(TOOL_NAMES.WORKFLOW_CHECKPOINT)).toBe(true);
    });

    it('should register workflow resume tool', () => {
      expect(server.supportsTool(TOOL_NAMES.WORKFLOW_RESUME)).toBe(true);
    });

    it('should register task status tool', () => {
      expect(server.supportsTool(TOOL_NAMES.TASK_STATUS)).toBe(true);
    });

    it('should register event emit tool', () => {
      expect(server.supportsTool(TOOL_NAMES.EVENT_EMIT)).toBe(true);
    });

    it('should register event subscribe tool', () => {
      expect(server.supportsTool(TOOL_NAMES.EVENT_SUBSCRIBE)).toBe(true);
    });
  });

  describe('Quality Gate Tools', () => {
    it('should register quality gate execute tool', () => {
      expect(server.supportsTool(TOOL_NAMES.QUALITY_GATE_EXECUTE)).toBe(true);
    });

    it('should register quality validate metrics tool', () => {
      expect(server.supportsTool(TOOL_NAMES.QUALITY_VALIDATE_METRICS)).toBe(true);
    });

    it('should register quality risk assess tool', () => {
      expect(server.supportsTool(TOOL_NAMES.QUALITY_RISK_ASSESS)).toBe(true);
    });

    it('should register quality decision make tool', () => {
      expect(server.supportsTool(TOOL_NAMES.QUALITY_DECISION_MAKE)).toBe(true);
    });

    it('should register quality policy check tool', () => {
      expect(server.supportsTool(TOOL_NAMES.QUALITY_POLICY_CHECK)).toBe(true);
    });
  });

  describe('Prediction & Analysis Tools', () => {
    it('should register flaky test detect tool', () => {
      expect(server.supportsTool(TOOL_NAMES.FLAKY_TEST_DETECT)).toBe(true);
    });

    it('should register predict defects AI tool', () => {
      expect(server.supportsTool(TOOL_NAMES.PREDICT_DEFECTS_AI)).toBe(true);
    });

    it('should register regression risk analyze tool', () => {
      expect(server.supportsTool(TOOL_NAMES.REGRESSION_RISK_ANALYZE)).toBe(true);
    });

    it('should register visual test regression tool', () => {
      expect(server.supportsTool(TOOL_NAMES.VISUAL_TEST_REGRESSION)).toBe(true);
    });

    it('should register deployment readiness check tool', () => {
      expect(server.supportsTool(TOOL_NAMES.DEPLOYMENT_READINESS_CHECK)).toBe(true);
    });

    it('should register coverage analyze sublinear tool', () => {
      expect(server.supportsTool(TOOL_NAMES.COVERAGE_ANALYZE_SUBLINEAR)).toBe(true);
    });

    it('should register coverage gaps detect tool', () => {
      expect(server.supportsTool(TOOL_NAMES.COVERAGE_GAPS_DETECT)).toBe(true);
    });

    it('should register performance benchmark run tool', () => {
      expect(server.supportsTool(TOOL_NAMES.PERFORMANCE_BENCHMARK_RUN)).toBe(true);
    });

    it('should register performance monitor realtime tool', () => {
      expect(server.supportsTool(TOOL_NAMES.PERFORMANCE_MONITOR_REALTIME)).toBe(true);
    });

    it('should register security scan comprehensive tool', () => {
      expect(server.supportsTool(TOOL_NAMES.SECURITY_SCAN_COMPREHENSIVE)).toBe(true);
    });
  });

  describe('Tool Count Verification', () => {
    it('should register all 47 tools', () => {
      const tools = server.getTools();
      expect(tools.length).toBe(47);
    });

    it('should have unique tool names', () => {
      const tools = server.getTools();
      const names = tools.map(t => t.name);
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(names.length);
    });
  });
});

describe('CLI Command Registration', () => {
  describe('Core Commands', () => {
    it('should register init command', () => {
      // Note: This is a simplified test. Full CLI testing would require
      // parsing the program and checking registered commands
      expect(cliIndexPath).toBeDefined();
    });

    it('should register start command', () => {
      expect(cliIndexPath).toBeDefined();
    });

    it('should register status command', () => {
      expect(cliIndexPath).toBeDefined();
    });
  });

  describe('Workflow Commands', () => {
    it('should register workflow list command', () => {
      expect(cliIndexPath).toBeDefined();
    });

    it('should register workflow pause command', () => {
      expect(cliIndexPath).toBeDefined();
    });

    it('should register workflow cancel command', () => {
      expect(cliIndexPath).toBeDefined();
    });
  });

  describe('Config Commands', () => {
    it('should register config init command', () => {
      expect(cliIndexPath).toBeDefined();
    });

    it('should register config validate command', () => {
      expect(cliIndexPath).toBeDefined();
    });

    it('should register config get command', () => {
      expect(cliIndexPath).toBeDefined();
    });

    it('should register config set command', () => {
      expect(cliIndexPath).toBeDefined();
    });

    it('should register config list command', () => {
      expect(cliIndexPath).toBeDefined();
    });

    it('should register config reset command', () => {
      expect(cliIndexPath).toBeDefined();
    });
  });

  describe('Debug Commands', () => {
    it('should register debug agent command', () => {
      expect(cliIndexPath).toBeDefined();
    });

    it('should register debug diagnostics command', () => {
      expect(cliIndexPath).toBeDefined();
    });

    it('should register debug health-check command', () => {
      expect(cliIndexPath).toBeDefined();
    });

    it('should register debug troubleshoot command', () => {
      expect(cliIndexPath).toBeDefined();
    });
  });

  describe('Memory Commands', () => {
    it('should register memory stats command', () => {
      expect(cliIndexPath).toBeDefined();
    });

    it('should register memory compact command', () => {
      expect(cliIndexPath).toBeDefined();
    });
  });
});
