/**
 * MCP Parameter Validation Integration Tests
 * Tests parameter validation, type checking, and error handling across all MCP tools
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { MCPTestHarness } from './test-harness';
import { TOOL_NAMES } from '@mcp/tools';

// SKIP: These integration tests need redesign - AgenticQEMCPServer doesn't expose handleToolCall
// The MCP server uses SDK request handlers internally, not a direct method call API
// TODO: Redesign tests to use proper MCP client-server communication
describe.skip('MCP Parameter Validation', () => {
  let harness: MCPTestHarness;

  beforeAll(async () => {
    harness = new MCPTestHarness();
    await harness.initialize();
  });

  afterAll(async () => {
    await harness.cleanup();
  });

  describe('Fleet Init Validation', () => {
    it('should reject missing topology', async () => {
      const result = await harness.callTool(TOOL_NAMES.FLEET_INIT, {
        config: {
          // topology missing
          maxAgents: 10,
          testingFocus: ['unit'],
          environments: ['development'],
          frameworks: ['jest']
        }
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject invalid topology enum value', async () => {
      const result = await harness.callTool(TOOL_NAMES.FLEET_INIT, {
        config: {
          topology: 'invalid-topology',
          maxAgents: 10,
          testingFocus: ['unit'],
          environments: ['development'],
          frameworks: ['jest']
        }
      });

      expect(result.success).toBe(false);
    });

    it('should reject maxAgents below minimum', async () => {
      const result = await harness.callTool(TOOL_NAMES.FLEET_INIT, {
        config: {
          topology: 'mesh',
          maxAgents: 2, // Below minimum of 5
          testingFocus: ['unit'],
          environments: ['development'],
          frameworks: ['jest']
        }
      });

      expect(result.success).toBe(false);
    });

    it('should reject maxAgents above maximum', async () => {
      const result = await harness.callTool(TOOL_NAMES.FLEET_INIT, {
        config: {
          topology: 'mesh',
          maxAgents: 100, // Above maximum of 50
          testingFocus: ['unit'],
          environments: ['development'],
          frameworks: ['jest']
        }
      });

      expect(result.success).toBe(false);
    });

    it('should reject maxAgents as non-number', async () => {
      const result = await harness.callTool(TOOL_NAMES.FLEET_INIT, {
        config: {
          topology: 'mesh',
          maxAgents: '10' as any, // String instead of number
          testingFocus: ['unit'],
          environments: ['development'],
          frameworks: ['jest']
        }
      });

      expect(result.success).toBe(false);
    });
  });

  describe('Agent Spawn Validation', () => {
    it('should reject missing agent type', async () => {
      const result = await harness.callTool(TOOL_NAMES.AGENT_SPAWN, {
        spec: {
          // type missing
          capabilities: ['testing']
        }
      });

      expect(result.success).toBe(false);
    });

    it('should reject invalid agent type enum', async () => {
      const result = await harness.callTool(TOOL_NAMES.AGENT_SPAWN, {
        spec: {
          type: 'invalid-agent-type',
          capabilities: ['testing']
        }
      });

      expect(result.success).toBe(false);
    });

    it('should accept optional parameters', async () => {
      const result = await harness.callTool(TOOL_NAMES.AGENT_SPAWN, {
        spec: {
          type: 'test-generator',
          capabilities: ['test-generation']
          // name and resources are optional
        }
      });

      harness.assertSuccess(result);
    });

    it('should validate resource types when provided', async () => {
      const result = await harness.callTool(TOOL_NAMES.AGENT_SPAWN, {
        spec: {
          type: 'test-generator',
          capabilities: ['testing'],
          resources: {
            memory: '2048' as any, // String instead of number
            cpu: 4,
            storage: 10240
          }
        }
      });

      expect(result.success).toBe(false);
    });
  });

  describe('Quality Analysis Validation', () => {
    it('should reject invalid scope enum', async () => {
      const result = await harness.callTool(TOOL_NAMES.QUALITY_ANALYZE, {
        params: {
          scope: 'invalid-scope',
          metrics: ['coverage'],
          thresholds: {},
          generateRecommendations: false
        }
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid scope');
    });

    it('should reject empty metrics array', async () => {
      const result = await harness.callTool(TOOL_NAMES.QUALITY_ANALYZE, {
        params: {
          scope: 'all',
          metrics: [], // Empty array
          thresholds: {},
          generateRecommendations: false
        }
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('At least one metric must be specified');
    });

    it('should accept missing optional dataSource', async () => {
      const result = await harness.callTool(TOOL_NAMES.QUALITY_ANALYZE, {
        params: {
          scope: 'code',
          metrics: ['coverage'],
          thresholds: {},
          generateRecommendations: false
        }
        // dataSource is optional
      });

      harness.assertSuccess(result);
    });

    it('should validate generateRecommendations is boolean', async () => {
      const result = await harness.callTool(TOOL_NAMES.QUALITY_ANALYZE, {
        params: {
          scope: 'code',
          metrics: ['coverage'],
          thresholds: {},
          generateRecommendations: 'true' as any // String instead of boolean
        }
      });

      expect(result.success).toBe(false);
    });
  });

  describe('Test Generation Validation', () => {
    it('should reject invalid test type enum', async () => {
      const result = await harness.callTool(TOOL_NAMES.TEST_GENERATE, {
        spec: {
          type: 'invalid-test-type',
          sourceCode: {
            repositoryUrl: 'https://github.com/example/repo.git',
            branch: 'main',
            language: 'typescript',
            testPatterns: ['**/*.test.ts']
          },
          coverageTarget: 80,
          frameworks: ['jest'],
          synthesizeData: true
        }
      });

      expect(result.success).toBe(false);
    });

    it('should reject coverageTarget outside valid range', async () => {
      const result = await harness.callTool(TOOL_NAMES.TEST_GENERATE, {
        spec: {
          type: 'unit',
          sourceCode: {
            repositoryUrl: 'https://github.com/example/repo.git',
            branch: 'main',
            language: 'typescript',
            testPatterns: ['**/*.test.ts']
          },
          coverageTarget: 150, // Above 100%
          frameworks: ['jest'],
          synthesizeData: true
        }
      });

      expect(result.success).toBe(false);
    });

    it('should reject missing required sourceCode fields', async () => {
      const result = await harness.callTool(TOOL_NAMES.TEST_GENERATE, {
        spec: {
          type: 'unit',
          sourceCode: {
            // repositoryUrl missing
            branch: 'main',
            language: 'typescript',
            testPatterns: ['**/*.test.ts']
          },
          coverageTarget: 80,
          frameworks: ['jest'],
          synthesizeData: true
        }
      });

      expect(result.success).toBe(false);
    });
  });

  describe('Test Execution Validation', () => {
    it('should reject empty testSuites array', async () => {
      const result = await harness.callTool(TOOL_NAMES.TEST_EXECUTE, {
        spec: {
          testSuites: [], // Empty array
          parallelExecution: true,
          retryCount: 3,
          timeoutSeconds: 300,
          reportFormat: 'json'
        }
      });

      expect(result.success).toBe(false);
    });

    it('should reject invalid reportFormat enum', async () => {
      const result = await harness.callTool(TOOL_NAMES.TEST_EXECUTE, {
        spec: {
          testSuites: ['unit'],
          parallelExecution: true,
          retryCount: 3,
          timeoutSeconds: 300,
          reportFormat: 'invalid-format'
        }
      });

      expect(result.success).toBe(false);
    });

    it('should reject negative retryCount', async () => {
      const result = await harness.callTool(TOOL_NAMES.TEST_EXECUTE, {
        spec: {
          testSuites: ['unit'],
          parallelExecution: true,
          retryCount: -1, // Negative value
          timeoutSeconds: 300,
          reportFormat: 'json'
        }
      });

      expect(result.success).toBe(false);
    });

    it('should reject retryCount above maximum', async () => {
      const result = await harness.callTool(TOOL_NAMES.TEST_EXECUTE, {
        spec: {
          testSuites: ['unit'],
          parallelExecution: true,
          retryCount: 10, // Above maximum of 5
          timeoutSeconds: 300,
          reportFormat: 'json'
        }
      });

      expect(result.success).toBe(false);
    });

    it('should reject timeoutSeconds below minimum', async () => {
      const result = await harness.callTool(TOOL_NAMES.TEST_EXECUTE, {
        spec: {
          testSuites: ['unit'],
          parallelExecution: true,
          retryCount: 3,
          timeoutSeconds: 5, // Below minimum of 10
          reportFormat: 'json'
        }
      });

      expect(result.success).toBe(false);
    });
  });

  describe('Task Orchestration Validation', () => {
    it('should reject missing task description', async () => {
      const result = await harness.callTool(TOOL_NAMES.TASK_ORCHESTRATE, {
        // task missing
        priority: 'high',
        strategy: 'parallel'
      });

      expect(result.success).toBe(false);
    });

    it('should reject invalid priority enum', async () => {
      const result = await harness.callTool(TOOL_NAMES.TASK_ORCHESTRATE, {
        task: 'Test task',
        priority: 'invalid-priority',
        strategy: 'parallel'
      });

      expect(result.success).toBe(false);
    });

    it('should reject invalid strategy enum', async () => {
      const result = await harness.callTool(TOOL_NAMES.TASK_ORCHESTRATE, {
        task: 'Test task',
        priority: 'medium',
        strategy: 'invalid-strategy'
      });

      expect(result.success).toBe(false);
    });

    it('should reject maxAgents outside valid range', async () => {
      const result = await harness.callTool(TOOL_NAMES.TASK_ORCHESTRATE, {
        task: 'Test task',
        priority: 'medium',
        strategy: 'parallel',
        maxAgents: 15 // Above maximum of 10
      });

      expect(result.success).toBe(false);
    });
  });

  describe('Regression Risk Analysis Validation', () => {
    it('should reject when neither changeSet nor changes is provided', async () => {
      const result = await harness.callTool(TOOL_NAMES.REGRESSION_RISK_ANALYZE, {
        // Neither changeSet nor changes provided
        threshold: 0.1
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Either changeSet or changes must be provided');
    });

    it('should reject threshold outside valid range', async () => {
      const result = await harness.callTool(TOOL_NAMES.REGRESSION_RISK_ANALYZE, {
        changes: [
          {
            file: 'src/test.ts',
            type: 'modified'
          }
        ],
        threshold: 1.5 // Above 1.0
      });

      expect(result.success).toBe(false);
    });
  });

  describe('Test Optimization Validation', () => {
    it('should reject invalid algorithm enum', async () => {
      const result = await harness.callTool(TOOL_NAMES.OPTIMIZE_TESTS, {
        testSuite: {
          size: 100,
          characteristics: ['redundant'],
          historical_performance: {}
        },
        optimization: {
          algorithm: 'invalid-algorithm',
          targetMetric: 'execution-time',
          constraints: {}
        }
      });

      expect(result.success).toBe(false);
    });

    it('should reject invalid targetMetric enum', async () => {
      const result = await harness.callTool(TOOL_NAMES.OPTIMIZE_TESTS, {
        testSuite: {
          size: 100,
          characteristics: ['redundant'],
          historical_performance: {}
        },
        optimization: {
          algorithm: 'sublinear',
          targetMetric: 'invalid-metric',
          constraints: {}
        }
      });

      expect(result.success).toBe(false);
    });

    it('should accept valid optimization parameters', async () => {
      const result = await harness.callTool(TOOL_NAMES.OPTIMIZE_TESTS, {
        testSuite: {
          size: 100,
          characteristics: ['redundant'],
          historical_performance: {}
        },
        optimization: {
          algorithm: 'sublinear',
          targetMetric: 'execution-time',
          constraints: {
            minCoverage: 80,
            maxExecutionTime: 180000
          }
        }
      });

      harness.assertSuccess(result);
    });
  });

  describe('Coverage Analysis Validation', () => {
    it('should reject missing sourceFiles', async () => {
      const result = await harness.callTool(TOOL_NAMES.COVERAGE_ANALYZE_SUBLINEAR, {
        // sourceFiles missing
        useJohnsonLindenstrauss: true,
        coverageThreshold: 0.8
      });

      expect(result.success).toBe(false);
    });

    it('should reject empty sourceFiles array', async () => {
      const result = await harness.callTool(TOOL_NAMES.COVERAGE_ANALYZE_SUBLINEAR, {
        sourceFiles: [], // Empty array
        useJohnsonLindenstrauss: true,
        coverageThreshold: 0.8
      });

      expect(result.success).toBe(false);
    });

    it('should reject coverageThreshold outside valid range', async () => {
      const result = await harness.callTool(TOOL_NAMES.COVERAGE_ANALYZE_SUBLINEAR, {
        sourceFiles: ['src/app.ts'],
        useJohnsonLindenstrauss: true,
        coverageThreshold: 1.5 // Above 1.0
      });

      expect(result.success).toBe(false);
    });
  });

  describe('Boundary Conditions', () => {
    it('should handle minimum valid values', async () => {
      const result = await harness.callTool(TOOL_NAMES.FLEET_INIT, {
        config: {
          topology: 'mesh',
          maxAgents: 5, // Minimum allowed
          testingFocus: ['unit'],
          environments: ['development'],
          frameworks: ['jest']
        }
      });

      harness.assertSuccess(result);
    });

    it('should handle maximum valid values', async () => {
      const result = await harness.callTool(TOOL_NAMES.FLEET_INIT, {
        config: {
          topology: 'mesh',
          maxAgents: 50, // Maximum allowed
          testingFocus: ['unit'],
          environments: ['development'],
          frameworks: ['jest']
        }
      });

      harness.assertSuccess(result);
    });

    it('should handle zero values where appropriate', async () => {
      const result = await harness.callTool(TOOL_NAMES.TEST_EXECUTE, {
        spec: {
          testSuites: ['unit'],
          parallelExecution: true,
          retryCount: 0, // Zero retries is valid
          timeoutSeconds: 120,
          reportFormat: 'json'
        }
      });

      harness.assertSuccess(result);
    });
  });

  describe('Type Mismatches', () => {
    it('should reject string when number expected', async () => {
      const result = await harness.callTool(TOOL_NAMES.FLEET_INIT, {
        config: {
          topology: 'mesh',
          maxAgents: '10' as any, // String instead of number
          testingFocus: ['unit'],
          environments: ['development'],
          frameworks: ['jest']
        }
      });

      expect(result.success).toBe(false);
    });

    it('should reject number when string expected', async () => {
      const result = await harness.callTool(TOOL_NAMES.FLEET_INIT, {
        config: {
          topology: 10 as any, // Number instead of string
          maxAgents: 10,
          testingFocus: ['unit'],
          environments: ['development'],
          frameworks: ['jest']
        }
      });

      expect(result.success).toBe(false);
    });

    it('should reject boolean when string expected', async () => {
      const result = await harness.callTool(TOOL_NAMES.TASK_ORCHESTRATE, {
        task: true as any, // Boolean instead of string
        priority: 'medium',
        strategy: 'parallel'
      });

      expect(result.success).toBe(false);
    });
  });

  describe('Optional Parameter Handling', () => {
    it('should work without optional parameters', async () => {
      const result = await harness.callTool(TOOL_NAMES.AGENT_SPAWN, {
        spec: {
          type: 'test-generator',
          capabilities: ['testing']
          // name and resources are optional and omitted
        }
      });

      harness.assertSuccess(result);
    });

    it('should work with all optional parameters provided', async () => {
      const result = await harness.callTool(TOOL_NAMES.AGENT_SPAWN, {
        spec: {
          type: 'test-generator',
          name: 'custom-generator',
          capabilities: ['testing'],
          resources: {
            memory: 2048,
            cpu: 4,
            storage: 10240
          }
        }
      });

      harness.assertSuccess(result);
    });
  });
});
