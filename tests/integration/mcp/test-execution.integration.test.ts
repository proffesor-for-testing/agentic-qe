/**
 * Test Execution MCP Integration Tests
 * Tests test_generate, test_execute, test_execute_stream, test_optimize, and coverage analysis tools
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { MCPTestHarness } from './test-harness.js';
import { TOOL_NAMES } from '@mcp/tools.js';

describe('Test Execution MCP Integration', () => {
  let harness: MCPTestHarness;

  beforeAll(async () => {
    harness = new MCPTestHarness();
    await harness.initialize();
  });

  afterAll(async () => {
    await harness.cleanup();
  });

  beforeEach(async () => {
    await harness.clearMemory();
  });

  describe('Test Generation', () => {
    it('should generate unit tests with Jest framework', async () => {
      const result = await harness.callTool(TOOL_NAMES.TEST_GENERATE, {
        spec: {
          type: 'unit',
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

      harness.assertSuccess(result);
      const data = harness.parseToolResponse(result);

      harness.assertContainsFields(data, ['generatedTests', 'framework', 'estimatedCoverage']);
      expect(data.framework).toBe('jest');
      expect(Array.isArray(data.generatedTests)).toBe(true);
    });

    it('should generate integration tests', async () => {
      const result = await harness.callTool(TOOL_NAMES.TEST_GENERATE, {
        spec: {
          type: 'integration',
          sourceCode: {
            repositoryUrl: 'https://github.com/example/api.git',
            branch: 'develop',
            language: 'typescript',
            testPatterns: ['**/*.integration.test.ts']
          },
          coverageTarget: 75,
          frameworks: ['jest', 'supertest'],
          synthesizeData: true
        }
      });

      harness.assertSuccess(result);
      const data = harness.parseToolResponse(result);
      expect(data.type).toBe('integration');
    });

    it('should generate e2e tests', async () => {
      const result = await harness.callTool(TOOL_NAMES.TEST_GENERATE, {
        spec: {
          type: 'e2e',
          sourceCode: {
            repositoryUrl: 'https://github.com/example/webapp.git',
            branch: 'main',
            language: 'typescript',
            testPatterns: ['**/*.e2e.test.ts']
          },
          coverageTarget: 70,
          frameworks: ['playwright'],
          synthesizeData: false
        }
      });

      harness.assertSuccess(result);
      const data = harness.parseToolResponse(result);
      expect(data.type).toBe('e2e');
    });

    it('should generate property-based tests', async () => {
      const result = await harness.callTool(TOOL_NAMES.TEST_GENERATE, {
        spec: {
          type: 'property-based',
          sourceCode: {
            repositoryUrl: 'https://github.com/example/utils.git',
            branch: 'main',
            language: 'typescript',
            testPatterns: ['**/*.spec.ts']
          },
          coverageTarget: 85,
          frameworks: ['fast-check'],
          synthesizeData: true
        }
      });

      harness.assertSuccess(result);
      const data = harness.parseToolResponse(result);
      expect(data.type).toBe('property-based');
    });

    it('should generate mutation tests', async () => {
      const result = await harness.callTool(TOOL_NAMES.TEST_GENERATE, {
        spec: {
          type: 'mutation',
          sourceCode: {
            repositoryUrl: 'https://github.com/example/core.git',
            branch: 'main',
            language: 'typescript',
            testPatterns: ['**/*.test.ts']
          },
          coverageTarget: 90,
          frameworks: ['stryker'],
          synthesizeData: false
        }
      });

      harness.assertSuccess(result);
      const data = harness.parseToolResponse(result);
      expect(data.type).toBe('mutation');
    });
  });

  describe('Test Execution', () => {
    it('should execute tests with parallel execution enabled', async () => {
      const result = await harness.callTool(TOOL_NAMES.TEST_EXECUTE, {
        spec: {
          testSuites: ['unit', 'integration'],
          environments: ['development'],
          parallelExecution: true,
          retryCount: 3,
          timeoutSeconds: 300,
          reportFormat: 'json'
        }
      });

      harness.assertSuccess(result);
      const data = harness.parseToolResponse(result);

      harness.assertContainsFields(data, ['executionId', 'status', 'results']);
      expect(data.parallelExecution).toBe(true);
    });

    it('should execute tests sequentially', async () => {
      const result = await harness.callTool(TOOL_NAMES.TEST_EXECUTE, {
        spec: {
          testSuites: ['e2e'],
          environments: ['staging'],
          parallelExecution: false,
          retryCount: 2,
          timeoutSeconds: 600,
          reportFormat: 'junit'
        }
      });

      harness.assertSuccess(result);
      const data = harness.parseToolResponse(result);
      expect(data.reportFormat).toBe('junit');
    });

    it('should support different report formats', async () => {
      const formats = ['junit', 'tap', 'json', 'html'] as const;

      for (const format of formats) {
        const result = await harness.callTool(TOOL_NAMES.TEST_EXECUTE, {
          spec: {
            testSuites: ['unit'],
            parallelExecution: true,
            retryCount: 1,
            timeoutSeconds: 120,
            reportFormat: format
          }
        });

        harness.assertSuccess(result);
        const data = harness.parseToolResponse(result);
        expect(data.reportFormat).toBe(format);
      }
    });

    it('should handle test execution with retries', async () => {
      const result = await harness.callTool(TOOL_NAMES.TEST_EXECUTE, {
        spec: {
          testSuites: ['flaky-tests'],
          parallelExecution: true,
          retryCount: 5,
          timeoutSeconds: 300,
          reportFormat: 'json'
        }
      });

      harness.assertSuccess(result);
      const data = harness.parseToolResponse(result);
      expect(data.retryCount).toBeLessThanOrEqual(5);
    });
  });

  describe('Test Execution with Streaming', () => {
    it('should stream test execution progress in real-time', async () => {
      const result = await harness.callTool(TOOL_NAMES.TEST_EXECUTE_STREAM, {
        spec: {
          testSuites: ['unit', 'integration'],
          parallelExecution: true,
          retryCount: 3,
          timeoutSeconds: 300,
          reportFormat: 'json'
        },
        enableRealtimeUpdates: true
      });

      harness.assertSuccess(result);
      const data = harness.parseToolResponse(result);

      // Streaming should provide progress updates
      expect(data).toBeDefined();
    });

    it('should work without streaming (backward compatibility)', async () => {
      const result = await harness.callTool(TOOL_NAMES.TEST_EXECUTE_STREAM, {
        spec: {
          testSuites: ['unit'],
          parallelExecution: false,
          retryCount: 1,
          timeoutSeconds: 120,
          reportFormat: 'json'
        },
        enableRealtimeUpdates: false
      });

      harness.assertSuccess(result);
    });
  });

  describe('Test Optimization with Sublinear Algorithms', () => {
    it('should optimize tests using Johnson-Lindenstrauss algorithm', async () => {
      const result = await harness.callTool(TOOL_NAMES.OPTIMIZE_TESTS, {
        testSuite: {
          size: 1000,
          characteristics: ['redundant', 'overlapping-coverage'],
          historical_performance: {
            averageExecutionTime: 300000, // 5 minutes
            flakyTests: 15
          }
        },
        optimization: {
          algorithm: 'sublinear',
          targetMetric: 'execution-time',
          constraints: {
            minCoverage: 80,
            maxExecutionTime: 180000, // 3 minutes
            maxCost: 100
          }
        }
      });

      harness.assertSuccess(result);
      const data = harness.parseToolResponse(result);

      harness.assertContainsFields(data, ['optimizedTestSuite', 'reduction', 'expectedImprovement']);
      expect(data.algorithm).toBe('sublinear');
    });

    it('should optimize for coverage target', async () => {
      const result = await harness.callTool(TOOL_NAMES.OPTIMIZE_TESTS, {
        testSuite: {
          size: 500,
          characteristics: ['high-coverage'],
          historical_performance: {}
        },
        optimization: {
          algorithm: 'johnson-lindenstrauss',
          targetMetric: 'coverage',
          constraints: {
            minCoverage: 90
          }
        }
      });

      harness.assertSuccess(result);
      const data = harness.parseToolResponse(result);
      expect(data.targetMetric).toBe('coverage');
    });

    it('should optimize for cost reduction', async () => {
      const result = await harness.callTool(TOOL_NAMES.OPTIMIZE_TESTS, {
        testSuite: {
          size: 750,
          characteristics: ['expensive'],
          historical_performance: {
            averageCostPerRun: 50
          }
        },
        optimization: {
          algorithm: 'temporal-advantage',
          targetMetric: 'cost',
          constraints: {
            maxCost: 25,
            minCoverage: 75
          }
        }
      });

      harness.assertSuccess(result);
      const data = harness.parseToolResponse(result);
      expect(data.targetMetric).toBe('cost');
    });

    it('should optimize for reliability', async () => {
      const result = await harness.callTool(TOOL_NAMES.OPTIMIZE_TESTS, {
        testSuite: {
          size: 300,
          characteristics: ['flaky'],
          historical_performance: {
            flakyTests: 45,
            successRate: 85
          }
        },
        optimization: {
          algorithm: 'sublinear',
          targetMetric: 'reliability',
          constraints: {
            minCoverage: 80
          }
        }
      });

      harness.assertSuccess(result);
      const data = harness.parseToolResponse(result);
      expect(data.targetMetric).toBe('reliability');
    });
  });

  describe('Coverage Analysis', () => {
    it('should analyze coverage with sublinear algorithms', async () => {
      const sourceFiles = [
        'src/auth/login.ts',
        'src/auth/session.ts',
        'src/api/users.ts',
        'src/api/posts.ts',
        'src/utils/validation.ts'
      ];

      const result = await harness.callTool(TOOL_NAMES.COVERAGE_ANALYZE_SUBLINEAR, {
        sourceFiles,
        useJohnsonLindenstrauss: true,
        targetDimension: 10,
        coverageThreshold: 0.8,
        includeUncoveredLines: true
      });

      harness.assertSuccess(result);
      const data = harness.parseToolResponse(result);

      harness.assertContainsFields(data, ['overallCoverage', 'fileCoverage', 'gaps']);
      expect(data.algorithm).toBe('johnson-lindenstrauss');
    });

    it('should detect coverage gaps with prioritization', async () => {
      const result = await harness.callTool(TOOL_NAMES.COVERAGE_GAPS_DETECT, {
        coverageData: {
          files: [
            {
              path: 'src/critical.ts',
              coverage: {
                line: 65,
                branch: 55,
                statement: 68
              },
              importance: 'critical'
            },
            {
              path: 'src/utils.ts',
              coverage: {
                line: 85,
                branch: 78,
                statement: 87
              },
              importance: 'medium'
            }
          ]
        },
        prioritization: 'criticality'
      });

      harness.assertSuccess(result);
      const data = harness.parseToolResponse(result);

      expect(data.gaps).toBeDefined();
      expect(Array.isArray(data.gaps)).toBe(true);
      expect(data.gaps.length).toBeGreaterThan(0);
    });
  });

  describe('End-to-End Testing Workflow', () => {
    it('should execute complete testing workflow: generate -> execute -> analyze', async () => {
      // 1. Generate tests
      const generateResult = await harness.callTool(TOOL_NAMES.TEST_GENERATE, {
        spec: {
          type: 'unit',
          sourceCode: {
            repositoryUrl: 'https://github.com/example/app.git',
            branch: 'main',
            language: 'typescript',
            testPatterns: ['**/*.test.ts']
          },
          coverageTarget: 80,
          frameworks: ['jest'],
          synthesizeData: true
        }
      });

      harness.assertSuccess(generateResult);
      const generateData = harness.parseToolResponse(generateResult);

      // 2. Execute tests
      const executeResult = await harness.callTool(TOOL_NAMES.TEST_EXECUTE, {
        spec: {
          testSuites: ['generated-tests'],
          parallelExecution: true,
          retryCount: 3,
          timeoutSeconds: 300,
          reportFormat: 'json'
        }
      });

      harness.assertSuccess(executeResult);

      // 3. Analyze coverage
      const coverageResult = await harness.callTool(TOOL_NAMES.COVERAGE_GAPS_DETECT, {
        coverageData: {
          files: [
            {
              path: 'src/app.ts',
              coverage: {
                line: 75,
                branch: 68,
                statement: 77
              },
              importance: 'high'
            }
          ]
        },
        prioritization: 'complexity'
      });

      harness.assertSuccess(coverageResult);

      // All steps should complete successfully
      expect(generateData.generatedTests).toBeDefined();
      expect(harness.parseToolResponse(executeResult).results).toBeDefined();
      expect(harness.parseToolResponse(coverageResult).gaps).toBeDefined();
    });
  });

  describe('Performance Benchmarking', () => {
    it('should run performance benchmarks', async () => {
      const result = await harness.callTool(TOOL_NAMES.PERFORMANCE_BENCHMARK_RUN, {
        benchmarkSuite: 'api-performance',
        iterations: 100,
        warmupIterations: 10
      });

      harness.assertSuccess(result);
      const data = harness.parseToolResponse(result);

      harness.assertContainsFields(data, ['benchmarkId', 'results', 'statistics']);
    });
  });

  describe('Real-time Performance Monitoring', () => {
    it('should monitor performance in real-time', async () => {
      const result = await harness.callTool(TOOL_NAMES.PERFORMANCE_MONITOR_REALTIME, {
        target: 'application-under-test',
        duration: 60,
        interval: 5
      });

      harness.assertSuccess(result);
      const data = harness.parseToolResponse(result);

      expect(data.monitoringId).toBeDefined();
      expect(data.metrics).toBeDefined();
    });
  });

  describe('Security Scanning', () => {
    it('should perform comprehensive security scan', async () => {
      const result = await harness.callTool(TOOL_NAMES.SECURITY_SCAN_COMPREHENSIVE, {
        target: 'https://github.com/example/app.git',
        scanType: 'comprehensive',
        depth: 'standard'
      });

      harness.assertSuccess(result);
      const data = harness.parseToolResponse(result);

      harness.assertContainsFields(data, ['scanId', 'vulnerabilities', 'severity']);
    });

    it('should perform SAST scanning', async () => {
      const result = await harness.callTool(TOOL_NAMES.SECURITY_SCAN_COMPREHENSIVE, {
        target: '/path/to/source',
        scanType: 'sast',
        depth: 'deep'
      });

      harness.assertSuccess(result);
      const data = harness.parseToolResponse(result);
      expect(data.scanType).toBe('sast');
    });

    it('should perform DAST scanning', async () => {
      const result = await harness.callTool(TOOL_NAMES.SECURITY_SCAN_COMPREHENSIVE, {
        target: 'https://app.example.com',
        scanType: 'dast',
        depth: 'standard'
      });

      harness.assertSuccess(result);
      const data = harness.parseToolResponse(result);
      expect(data.scanType).toBe('dast');
    });
  });
});
