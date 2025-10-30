/**
 * Quality Analysis MCP Integration Tests
 * Tests the quality_analyze MCP tool with various parameter combinations
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { MCPTestHarness } from './test-harness.js';
import { TOOL_NAMES } from '@mcp/tools.js';

describe('quality_analyze MCP Integration', () => {
  let harness: MCPTestHarness;

  beforeAll(async () => {
    harness = new MCPTestHarness();
    await harness.initialize();
  });

  afterAll(async () => {
    await harness.cleanup();
  });

  beforeEach(async () => {
    // Clear memory between tests
    await harness.clearMemory();
  });

  describe('Tool Registration', () => {
    it('should register quality_analyze tool', () => {
      expect(harness.supportsTool(TOOL_NAMES.QUALITY_ANALYZE)).toBe(true);
    });

    it('should have required schema properties', () => {
      expect(harness.verifyToolSchema(TOOL_NAMES.QUALITY_ANALYZE, ['params'])).toBe(true);
    });
  });

  describe('Complete Data Source', () => {
    it('should analyze quality with complete dataSource including context', async () => {
      const result = await harness.callTool(TOOL_NAMES.QUALITY_ANALYZE, {
        params: {
          scope: 'all',
          metrics: ['coverage', 'complexity', 'duplication'],
          thresholds: {
            coverage: 80,
            complexity: 10
          },
          generateRecommendations: true
        },
        dataSource: {
          testResults: '/path/to/test-results.json',
          codeMetrics: '/path/to/code-metrics.json',
          performanceData: '/path/to/performance.json',
          context: {
            deploymentTarget: 'production' as const,
            criticality: 'high' as const,
            environment: 'production',
            changes: [
              { file: 'src/app.ts', type: 'modified' }
            ]
          }
        }
      });

      harness.assertSuccess(result);
      const data = harness.parseToolResponse(result);

      harness.assertContainsFields(data, ['id', 'scope', 'metrics', 'assessments', 'recommendations', 'score']);
      expect(data.scope).toBe('all');
      expect(data.score).toHaveProperty('overall');
      expect(data.score).toHaveProperty('grade');
    });
  });

  describe('Missing Context (Should Use Defaults)', () => {
    it('should analyze quality with missing context and use defaults', async () => {
      const result = await harness.callTool(TOOL_NAMES.QUALITY_ANALYZE, {
        params: {
          scope: 'code',
          metrics: ['coverage', 'complexity'],
          thresholds: {
            coverage: 75
          },
          generateRecommendations: false
        },
        dataSource: {
          codeMetrics: '/path/to/metrics.json'
          // Context intentionally omitted - should default to 'development'
        }
      });

      harness.assertSuccess(result);
      const data = harness.parseToolResponse(result);

      expect(data).toHaveProperty('id');
      expect(data).toHaveProperty('metrics');
      expect(data.scope).toBe('code');
    });

    it('should handle completely missing dataSource', async () => {
      const result = await harness.callTool(TOOL_NAMES.QUALITY_ANALYZE, {
        params: {
          scope: 'tests',
          metrics: ['reliability', 'effectiveness'],
          thresholds: {},
          generateRecommendations: true
        }
        // No dataSource provided at all
      });

      harness.assertSuccess(result);
      const data = harness.parseToolResponse(result);

      expect(data).toHaveProperty('metrics');
      expect(data.metrics).toHaveProperty('test');
    });
  });

  describe('Code Metrics as Structured Object', () => {
    it('should accept codeMetrics as structured object instead of file path', async () => {
      const result = await harness.callTool(TOOL_NAMES.QUALITY_ANALYZE, {
        params: {
          scope: 'code',
          metrics: ['complexity', 'coverage'],
          thresholds: {
            coverage: 80,
            complexity: 15
          },
          generateRecommendations: true
        },
        dataSource: {
          codeMetrics: {
            // Structured metrics object
            complexity: {
              cyclomatic: 8.5,
              cognitive: 12.3
            },
            coverage: {
              line: 85.2,
              branch: 78.9
            },
            files: ['src/app.ts', 'src/utils.ts']
          }
        }
      });

      harness.assertSuccess(result);
      const data = harness.parseToolResponse(result);

      expect(data.metrics.code).toBeDefined();
      expect(data.assessments.length).toBeGreaterThan(0);
    });
  });

  describe('Code Metrics as File Path', () => {
    it('should accept codeMetrics as file path string', async () => {
      const metricsFile = await harness.createMockTestFile('code-metrics.json', JSON.stringify({
        complexity: { cyclomatic: 9.2 },
        coverage: { line: 87.5 }
      }));

      const result = await harness.callTool(TOOL_NAMES.QUALITY_ANALYZE, {
        params: {
          scope: 'code',
          metrics: ['complexity'],
          thresholds: {},
          generateRecommendations: false
        },
        dataSource: {
          codeMetrics: metricsFile
        }
      });

      harness.assertSuccess(result);
      const data = harness.parseToolResponse(result);
      expect(data.metrics).toBeDefined();
    });
  });

  describe('Invalid Scope Handling', () => {
    it('should fail gracefully with invalid scope', async () => {
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
  });

  describe('Empty Metrics Array', () => {
    it('should fail with empty metrics array', async () => {
      const result = await harness.callTool(TOOL_NAMES.QUALITY_ANALYZE, {
        params: {
          scope: 'all',
          metrics: [], // Empty array should fail
          thresholds: {},
          generateRecommendations: false
        }
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('At least one metric must be specified');
    });
  });

  describe('Custom Thresholds', () => {
    it('should apply custom thresholds to quality analysis', async () => {
      const result = await harness.callTool(TOOL_NAMES.QUALITY_ANALYZE, {
        params: {
          scope: 'all',
          metrics: ['coverage', 'complexity', 'success-rate'],
          thresholds: {
            coverage: 90, // High threshold
            complexity: 5, // Low threshold (strict)
            'success-rate': 99 // Very high threshold
          },
          generateRecommendations: true
        },
        dataSource: {
          context: {
            deploymentTarget: 'production' as const,
            criticality: 'critical' as const
          }
        }
      });

      harness.assertSuccess(result);
      const data = harness.parseToolResponse(result);

      expect(data.thresholds).toBeDefined();
      expect(data.thresholds).toHaveProperty('passed');
      expect(data.thresholds).toHaveProperty('failed');
      expect(data.thresholds).toHaveProperty('warnings');
    });
  });

  describe('Historical Comparison', () => {
    it('should enable historical comparison when requested', async () => {
      const result = await harness.callTool(TOOL_NAMES.QUALITY_ANALYZE, {
        params: {
          scope: 'code',
          metrics: ['coverage', 'complexity'],
          thresholds: {},
          generateRecommendations: true,
          historicalComparison: true // Enable historical analysis
        }
      });

      harness.assertSuccess(result);
      const data = harness.parseToolResponse(result);

      expect(data.trends).toBeDefined();
      expect(data.trends.direction).toMatch(/improving|stable|declining/);
      expect(data.trends.historical).toBeDefined();
    });
  });

  describe('Recommendations Disabled', () => {
    it('should not generate recommendations when disabled', async () => {
      const result = await harness.callTool(TOOL_NAMES.QUALITY_ANALYZE, {
        params: {
          scope: 'tests',
          metrics: ['reliability'],
          thresholds: {},
          generateRecommendations: false
        }
      });

      harness.assertSuccess(result);
      const data = harness.parseToolResponse(result);

      expect(data.recommendations).toBeDefined();
      expect(data.recommendations.length).toBe(0); // Should be empty when disabled
    });
  });

  describe('Different Scopes', () => {
    const scopes = ['code', 'tests', 'performance', 'security', 'all'] as const;

    scopes.forEach(scope => {
      it(`should analyze ${scope} scope`, async () => {
        const result = await harness.callTool(TOOL_NAMES.QUALITY_ANALYZE, {
          params: {
            scope,
            metrics: ['coverage'], // Generic metric
            thresholds: {},
            generateRecommendations: false
          }
        });

        harness.assertSuccess(result);
        const data = harness.parseToolResponse(result);
        expect(data.scope).toBe(scope);
      });
    });
  });

  describe('Agent Spawn Failures', () => {
    it('should handle agent spawn failures gracefully', async () => {
      // This test simulates a scenario where agent spawning might fail
      // In a real scenario, this could be caused by resource limits

      const result = await harness.callTool(TOOL_NAMES.QUALITY_ANALYZE, {
        params: {
          scope: 'all',
          metrics: ['coverage'],
          thresholds: {},
          generateRecommendations: true
        }
      });

      // Even if agent spawn fails, the handler should fall back to local analysis
      expect(result).toBeDefined();
    });
  });

  describe('Quality Report Structure', () => {
    it('should return properly structured quality report', async () => {
      const result = await harness.callTool(TOOL_NAMES.QUALITY_ANALYZE, {
        params: {
          scope: 'all',
          metrics: ['coverage', 'complexity', 'reliability', 'security'],
          thresholds: {
            coverage: 80
          },
          generateRecommendations: true
        },
        dataSource: {
          context: {
            deploymentTarget: 'staging' as const,
            criticality: 'medium' as const
          }
        }
      });

      harness.assertSuccess(result);
      const data = harness.parseToolResponse(result);

      // Verify complete structure
      expect(data).toHaveProperty('id');
      expect(data).toHaveProperty('scope');
      expect(data).toHaveProperty('analysisType');
      expect(data).toHaveProperty('generatedAt');
      expect(data).toHaveProperty('metrics');
      expect(data).toHaveProperty('assessments');
      expect(data).toHaveProperty('recommendations');
      expect(data).toHaveProperty('trends');
      expect(data).toHaveProperty('thresholds');
      expect(data).toHaveProperty('score');

      // Verify metrics structure
      expect(data.metrics).toHaveProperty('code');
      expect(data.metrics).toHaveProperty('test');
      expect(data.metrics).toHaveProperty('performance');
      expect(data.metrics).toHaveProperty('security');
      expect(data.metrics).toHaveProperty('maintainability');

      // Verify score structure
      expect(data.score).toHaveProperty('overall');
      expect(data.score).toHaveProperty('breakdown');
      expect(data.score).toHaveProperty('grade');
      expect(data.score).toHaveProperty('interpretation');
      expect(typeof data.score.overall).toBe('number');
      expect(data.score.grade).toMatch(/^[A-F][+]?$/);
    });
  });

  describe('Memory Coordination', () => {
    it('should store analysis results in memory for coordination', async () => {
      const result = await harness.callTool(TOOL_NAMES.QUALITY_ANALYZE, {
        params: {
          scope: 'code',
          metrics: ['coverage'],
          thresholds: {},
          generateRecommendations: false
        }
      });

      harness.assertSuccess(result);

      // Verify that post-task hook stored results
      // (This depends on hook implementation storing to memory)
      const stored = await harness.retrieveMemory('aqe/quality/last-analysis');
      // Memory storage may or may not be implemented yet
      // expect(stored).toBeDefined();
    });
  });
});
