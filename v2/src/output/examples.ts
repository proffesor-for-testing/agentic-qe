/**
 * AI Output Examples
 *
 * Example usage of the AI output formatting system.
 * These examples demonstrate how to use the output formatter in various scenarios.
 *
 * @module output/examples
 * @version 1.0.0
 */

import {
  outputTestResults,
  outputCoverageReport,
  outputAgentStatus,
  outputQualityMetrics,
  createStreamingOutput,
  TestResultsData,
  CoverageReportData,
  AgentStatusData,
  QualityMetricsData
} from './index';

// ==================== Example 1: Test Results ====================

/**
 * Example: Output test results
 */
export function exampleTestResults(): void {
  const testResults: TestResultsData = {
    summary: {
      total: 150,
      passed: 145,
      failed: 3,
      skipped: 2,
      flaky: 1,
      duration: 12543,
      passRate: 96.67,
      failureRate: 2.0,
      flakyRate: 0.67
    },
    suites: [
      {
        name: 'UserService',
        file: 'src/services/UserService.test.ts',
        status: 'passed',
        total: 25,
        passed: 25,
        failed: 0,
        skipped: 0,
        duration: 1234
      },
      {
        name: 'ApiController',
        file: 'src/controllers/ApiController.test.ts',
        status: 'failed',
        total: 30,
        passed: 28,
        failed: 2,
        skipped: 0,
        duration: 2345
      }
    ],
    failures: [
      {
        testName: 'should handle concurrent requests',
        suiteName: 'ApiController',
        file: 'src/controllers/ApiController.test.ts',
        line: 45,
        error: {
          message: 'Timeout: Expected response within 5000ms',
          stack: 'Error: Timeout...\n    at ApiController.test.ts:45:10',
          type: 'TimeoutError'
        },
        duration: 5002,
        retries: 0,
        lastRun: '2025-12-12T10:30:00.000Z'
      },
      {
        testName: 'should rollback on error',
        suiteName: 'DatabaseService',
        file: 'src/services/DatabaseService.test.ts',
        line: 67,
        error: {
          message: 'Expected database to rollback transaction',
          stack: 'Error: Expected database...\n    at DatabaseService.test.ts:67:10',
          type: 'AssertionError'
        },
        duration: 234,
        retries: 0,
        lastRun: '2025-12-12T10:30:05.000Z'
      },
      {
        testName: 'should invalidate stale entries',
        suiteName: 'CacheService',
        file: 'src/services/CacheService.test.ts',
        line: 89,
        error: {
          message: 'Cache entry still present after TTL expired',
          stack: 'Error: Cache entry...\n    at CacheService.test.ts:89:10',
          type: 'AssertionError'
        },
        duration: 1005,
        retries: 0,
        lastRun: '2025-12-12T10:30:10.000Z'
      }
    ],
    flaky: [
      {
        testName: 'should retry on network failure',
        suiteName: 'NetworkService',
        file: 'src/services/NetworkService.test.ts',
        line: 67,
        flakinessScore: 0.42,
        failureRate: 0.15,
        totalRuns: 100,
        recentFailures: 3,
        pattern: 'intermittent_timeout'
      }
    ],
    coverage: {
      overall: 87.5,
      lines: {
        total: 1000,
        covered: 875,
        uncovered: 125,
        percentage: 87.5
      },
      branches: {
        total: 200,
        covered: 170,
        uncovered: 30,
        percentage: 85.0
      },
      functions: {
        total: 150,
        covered: 135,
        uncovered: 15,
        percentage: 90.0
      },
      statements: {
        total: 950,
        covered: 830,
        uncovered: 120,
        percentage: 87.37
      }
    }
  };

  // Output with auto-detection
  outputTestResults(testResults);

  // Output with explicit options
  outputTestResults(testResults, {
    agentVersion: '2.3.5',
    framework: 'jest',
    environment: 'development',
    startTime: Date.now() - 12543
  });
}

// ==================== Example 2: Coverage Report ====================

/**
 * Example: Output coverage report
 */
export function exampleCoverageReport(): void {
  const coverageReport: CoverageReportData = {
    summary: {
      overall: 87.5,
      lines: {
        total: 1000,
        covered: 875,
        uncovered: 125,
        percentage: 87.5
      },
      branches: {
        total: 200,
        covered: 170,
        uncovered: 30,
        percentage: 85.0
      },
      functions: {
        total: 150,
        covered: 135,
        uncovered: 15,
        percentage: 90.0
      },
      statements: {
        total: 950,
        covered: 830,
        uncovered: 120,
        percentage: 87.37
      }
    },
    trend: {
      direction: 'improving',
      change: 2.5,
      previousCoverage: 85.0,
      currentCoverage: 87.5
    },
    gaps: [
      {
        file: 'src/services/PaymentService.ts',
        type: 'critical_path',
        priority: 'critical',
        coverage: {
          lines: 45.5,
          branches: 30.0,
          functions: 50.0
        },
        uncoveredLines: [23, 24, 25, 45, 46, 67, 68, 89, 90],
        uncoveredBranches: [
          { line: 23, branch: 'else', condition: 'payment.amount > 1000' },
          { line: 45, branch: 'catch', condition: 'error handling' }
        ],
        impact: 'high',
        reason: 'Payment processing is business-critical with financial impact'
      },
      {
        file: 'src/services/AuthService.ts',
        type: 'error_handling',
        priority: 'high',
        coverage: {
          lines: 65.0,
          branches: 50.0,
          functions: 70.0
        },
        uncoveredLines: [12, 13, 45, 46],
        uncoveredBranches: [
          { line: 12, branch: 'catch', condition: 'error handling' }
        ],
        impact: 'high',
        reason: 'Authentication error handling not tested'
      }
    ],
    files: [
      {
        path: 'src/services/UserService.ts',
        lines: {
          total: 100,
          covered: 95,
          uncovered: 5,
          percentage: 95.0
        },
        branches: {
          total: 20,
          covered: 18,
          uncovered: 2,
          percentage: 90.0
        },
        functions: {
          total: 15,
          covered: 15,
          uncovered: 0,
          percentage: 100.0
        },
        uncoveredLines: [23, 45, 67, 89, 90],
        uncoveredBranches: [
          { line: 23, branch: 'else' },
          { line: 45, branch: 'catch' }
        ]
      }
    ]
  };

  outputCoverageReport(coverageReport);
}

// ==================== Example 3: Agent Status ====================

/**
 * Example: Output agent status
 */
export function exampleAgentStatus(): void {
  const agentStatus: AgentStatusData = {
    agent: {
      id: 'qe-test-generator',
      name: 'Test Generator Agent',
      version: '2.3.5',
      status: 'active',
      health: 'healthy',
      capabilities: [
        'unit_test_generation',
        'integration_test_generation',
        'tdd_london_style',
        'tdd_chicago_style',
        'mock_generation'
      ],
      stats: {
        totalExecutions: 1523,
        successRate: 97.5,
        averageDuration: 2345,
        testsGenerated: 12456,
        lastExecution: '2025-12-12T09:15:00.000Z'
      },
      learning: {
        patternsLearned: 234,
        confidenceScore: 0.89,
        trainingIterations: 1523,
        lastTraining: '2025-12-12T08:00:00.000Z'
      }
    },
    dependencies: {
      required: [
        {
          service: 'agentdb',
          status: 'healthy',
          version: '1.2.3',
          latency: 5
        },
        {
          service: 'vectordb',
          status: 'healthy',
          version: '0.5.0',
          latency: 12
        }
      ],
      optional: [
        {
          service: 'llm_provider',
          status: 'healthy',
          provider: 'anthropic',
          model: 'claude-opus-4.5'
        }
      ]
    },
    configuration: {
      maxConcurrency: 4,
      timeout: 30000,
      retryAttempts: 3,
      learningEnabled: true,
      memoryPersistence: true
    }
  };

  outputAgentStatus(agentStatus);
}

// ==================== Example 4: Quality Metrics ====================

/**
 * Example: Output quality metrics
 */
export function exampleQualityMetrics(): void {
  const qualityMetrics: QualityMetricsData = {
    overallScore: 78.5,
    grade: 'B',
    dimensions: {
      testCoverage: {
        score: 87.5,
        weight: 0.25,
        status: 'good'
      },
      codeQuality: {
        score: 75.0,
        weight: 0.25,
        status: 'fair'
      },
      security: {
        score: 92.0,
        weight: 0.2,
        status: 'excellent'
      },
      performance: {
        score: 68.0,
        weight: 0.15,
        status: 'needs_improvement'
      },
      maintainability: {
        score: 72.0,
        weight: 0.15,
        status: 'fair'
      }
    },
    qualityGates: {
      passed: 7,
      failed: 2,
      total: 9,
      gates: [
        {
          name: 'minimum_coverage',
          status: 'passed',
          actualValue: 87.5,
          threshold: 80.0,
          operator: 'gte'
        },
        {
          name: 'max_complexity',
          status: 'failed',
          actualValue: 25,
          threshold: 15,
          operator: 'lte',
          message: 'Cyclomatic complexity exceeds threshold in 3 files'
        },
        {
          name: 'no_critical_vulnerabilities',
          status: 'passed',
          actualValue: 0,
          threshold: 0,
          operator: 'eq'
        }
      ]
    },
    codeSmells: {
      total: 23,
      byType: {
        duplicate_code: 8,
        long_method: 7,
        large_class: 4,
        long_parameter_list: 4
      },
      criticalSmells: [
        {
          type: 'long_method',
          file: 'src/services/OrderProcessor.ts',
          line: 45,
          severity: 'major',
          message: 'Method processOrder has 150 lines (threshold: 50)'
        }
      ]
    },
    technicalDebt: {
      total: 45,
      unit: 'hours',
      byCategory: {
        code_smells: 20,
        complexity: 15,
        duplications: 10
      }
    }
  };

  outputQualityMetrics(qualityMetrics);
}

// ==================== Example 5: Streaming Output ====================

/**
 * Example: Streaming test execution
 */
export async function exampleStreamingOutput(): Promise<void> {
  const executionId = 'exec_test_20251212_103000';
  const stream = createStreamingOutput(executionId, 'test_results');

  // Start stream
  stream.emitStart({
    totalTests: 150,
    estimatedDuration: 12000
  });

  // Simulate test execution with progress updates
  for (let i = 1; i <= 6; i++) {
    await sleep(2000);

    stream.emitProgress({
      completed: i * 25,
      total: 150,
      passed: i * 24,
      failed: i === 6 ? 3 : 0,
      elapsed: i * 2000
    });
  }

  // Complete stream with full results
  stream.emitComplete({
    summary: {
      total: 150,
      passed: 145,
      failed: 3,
      skipped: 2,
      duration: 12000,
      passRate: 96.67,
      failureRate: 2.0
    }
  });
}

// ==================== Example 6: Environment Detection ====================

/**
 * Example: Detect environment and adjust output
 */
export function exampleEnvironmentDetection(): void {
  const { isAIMode, isHumanMode, EnvironmentDetector } = require('./CLIOutputHelper');

  console.log('Environment Detection:');
  console.log(`  AI Mode: ${isAIMode()}`);
  console.log(`  Human Mode: ${isHumanMode()}`);
  console.log(`  Claude Code: ${EnvironmentDetector.isClaudeCode()}`);
  console.log(`  Cursor AI: ${EnvironmentDetector.isCursorAI()}`);
  console.log(`  CI/CD: ${EnvironmentDetector.isCI()}`);
  console.log(`  CI Provider: ${EnvironmentDetector.detectCIProvider() || 'none'}`);

  const ciInfo = EnvironmentDetector.getCIInfo();
  if (ciInfo) {
    console.log(`  Build: ${ciInfo.provider} #${ciInfo.buildNumber}`);
    if (ciInfo.buildUrl) {
      console.log(`  URL: ${ciInfo.buildUrl}`);
    }
  }
}

// ==================== Utility ====================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ==================== Run Examples ====================

/**
 * Run all examples
 */
export function runAllExamples(): void {
  console.log('\n=== Example 1: Test Results ===');
  exampleTestResults();

  console.log('\n=== Example 2: Coverage Report ===');
  exampleCoverageReport();

  console.log('\n=== Example 3: Agent Status ===');
  exampleAgentStatus();

  console.log('\n=== Example 4: Quality Metrics ===');
  exampleQualityMetrics();

  console.log('\n=== Example 5: Streaming Output ===');
  exampleStreamingOutput().catch(console.error);

  console.log('\n=== Example 6: Environment Detection ===');
  exampleEnvironmentDetection();
}

// Run examples if executed directly
if (require.main === module) {
  runAllExamples();
}
