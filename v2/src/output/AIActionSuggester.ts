/**
 * AI Action Suggester
 *
 * Generates intelligent action suggestions based on test results, coverage gaps,
 * flaky tests, and quality metrics. Provides specific, actionable guidance with
 * automation support and confidence scores.
 *
 * @module output/AIActionSuggester
 * @version 1.0.0
 */

import {
  ActionSuggestion,
  ActionPriority,
  ActionAutomation,
  ActionImpact,
  TestResultsData,
  TestFailure,
  FlakyTest,
  CoverageReportData,
  CoverageGap,
  QualityMetricsData,
  ActionTypes
} from './OutputFormatter';

/**
 * AI Action Suggester
 * Generates actionable suggestions for various QE scenarios
 */
export class AIActionSuggester {
  /**
   * Generate action suggestions for test results
   */
  generateTestResultActions(data: TestResultsData): ActionSuggestion[] {
    const actions: ActionSuggestion[] = [];

    // 1. Handle test failures
    if (data.failures && data.failures.length > 0) {
      actions.push(this.createFixFailuresAction(data.failures));
    }

    // 2. Handle flaky tests
    if (data.flaky && data.flaky.length > 0) {
      actions.push(this.createStabilizeFlakyAction(data.flaky));
    }

    // 3. Handle skipped tests
    if (data.summary.skipped > 0) {
      actions.push(this.createReviewSkippedTestsAction(data.summary.skipped));
    }

    // 4. Handle coverage gaps (if coverage data available)
    if (data.coverage && data.coverage.overall < 80) {
      actions.push(this.createIncreaseCoverageAction(data.coverage));
    }

    // 5. Success case - acknowledge good results
    if (data.failures.length === 0 && data.summary.passRate === 100) {
      actions.push(this.createSuccessAcknowledgmentAction(data.summary));
    }

    return this.sortActionsByPriority(actions);
  }

  /**
   * Generate action suggestions for coverage reports
   */
  generateCoverageReportActions(data: CoverageReportData): ActionSuggestion[] {
    const actions: ActionSuggestion[] = [];

    // 1. Handle critical coverage gaps
    const criticalGaps = data.gaps.filter(gap => gap.priority === 'critical');
    if (criticalGaps.length > 0) {
      actions.push(this.createCriticalGapsAction(criticalGaps));
    }

    // 2. Handle high-priority gaps
    const highGaps = data.gaps.filter(gap => gap.priority === 'high');
    if (highGaps.length > 0) {
      actions.push(this.createHighPriorityGapsAction(highGaps));
    }

    // 3. Review coverage trend
    if (data.trend) {
      actions.push(this.createCoverageTrendAction(data.trend));
    }

    // 4. Handle overall low coverage
    if (data.summary.overall < 80) {
      actions.push(this.createOverallCoverageAction(data.summary));
    }

    return this.sortActionsByPriority(actions);
  }

  /**
   * Generate action suggestions for quality metrics
   */
  generateQualityMetricsActions(data: QualityMetricsData): ActionSuggestion[] {
    const actions: ActionSuggestion[] = [];

    // 1. Handle failed quality gates
    const failedGates = data.qualityGates.gates.filter(gate => gate.status === 'failed');
    if (failedGates.length > 0) {
      actions.push(this.createQualityGateFailuresAction(failedGates));
    }

    // 2. Handle code smells
    if (data.codeSmells.total > 0) {
      actions.push(this.createCodeSmellsAction(data.codeSmells));
    }

    // 3. Handle technical debt
    if (data.technicalDebt.total > 40) {
      actions.push(this.createTechnicalDebtAction(data.technicalDebt));
    }

    // 4. Handle complexity issues
    const complexityGate = data.qualityGates.gates.find(gate => gate.name === 'max_complexity');
    if (complexityGate && complexityGate.status === 'failed') {
      actions.push(this.createComplexityAction(complexityGate));
    }

    return this.sortActionsByPriority(actions);
  }

  // ==================== Private Action Creators ====================

  /**
   * Create fix failures action
   */
  private createFixFailuresAction(failures: TestFailure[]): ActionSuggestion {
    const affectedTests = failures.map(f => `${f.suiteName}: ${f.testName}`);
    const timeoutFailures = failures.filter(f => f.error.type.includes('Timeout'));
    const hasTimeoutIssues = timeoutFailures.length > 0;

    const steps: string[] = [
      `Review failure logs and error details for ${failures.length} failed test${failures.length > 1 ? 's' : ''}`,
      `Run failed tests in isolation to reproduce: npm test -- --testNamePattern='${failures[0].testName}'`
    ];

    if (hasTimeoutIssues) {
      steps.push('Check for timing issues and race conditions in async tests');
      steps.push('Consider increasing timeout for network-dependent tests: jest.setTimeout(10000)');
    }

    steps.push('Review test setup and teardown for resource leaks or conflicts');
    steps.push('Check for environment-specific issues (database, APIs, file system)');

    return {
      action: ActionTypes.FIX_TEST_FAILURES,
      priority: 'critical' as ActionPriority,
      reason: `${failures.length} test failure${failures.length > 1 ? 's' : ''} detected${hasTimeoutIssues ? ' (including timeout issues)' : ''}`,
      affectedTests,
      steps,
      automation: {
        command: 'aqe fix failures --interactive',
        canAutoFix: false,
        confidence: hasTimeoutIssues ? 0.55 : 0.65,
        estimatedTime: failures.length * 5
      },
      relatedDocs: [
        'https://jestjs.io/docs/troubleshooting',
        '/workspaces/agentic-qe-cf/docs/guides/debugging-test-failures.md'
      ]
    };
  }

  /**
   * Create stabilize flaky tests action
   */
  private createStabilizeFlakyAction(flaky: FlakyTest[]): ActionSuggestion {
    const affectedTests = flaky.map(f => `${f.suiteName}: ${f.testName}`);
    const highInstability = flaky.filter(f => f.flakinessScore > 0.4);

    const steps: string[] = [
      `Analyze flaky test patterns for ${flaky.length} test${flaky.length > 1 ? 's' : ''}`,
      `Review recent failure history: aqe analyze flaky --test-id=${flaky[0].testName}`
    ];

    if (highInstability.length > 0) {
      steps.push(`Prioritize ${highInstability.length} test${highInstability.length > 1 ? 's' : ''} with high instability score (>40%)`);
    }

    steps.push('Add deterministic mocking for external dependencies (network, time, random)');
    steps.push('Ensure proper test isolation and cleanup between runs');
    steps.push('Consider using jest-retry for legitimate retry scenarios');
    steps.push('Add wait conditions instead of fixed delays (waitFor, waitForElement)');

    return {
      action: ActionTypes.STABILIZE_FLAKY_TESTS,
      priority: highInstability.length > 0 ? 'high' : 'medium',
      reason: `${flaky.length} flaky test${flaky.length > 1 ? 's' : ''} detected (avg instability: ${this.calculateAverageFlakinessScore(flaky).toFixed(2)}%)`,
      affectedTests,
      steps,
      automation: {
        command: `aqe stabilize flaky --test-id=${flaky[0].testName}`,
        canAutoFix: true,
        confidence: 0.78,
        estimatedTime: flaky.length * 3
      },
      relatedDocs: [
        'https://jestjs.io/docs/jest-platform#jest-retry',
        '/workspaces/agentic-qe-cf/docs/guides/handling-flaky-tests.md'
      ]
    };
  }

  /**
   * Create review skipped tests action
   */
  private createReviewSkippedTestsAction(skippedCount: number): ActionSuggestion {
    return {
      action: 'review_skipped_tests',
      priority: 'medium' as ActionPriority,
      reason: `${skippedCount} test${skippedCount > 1 ? 's' : ''} skipped - may hide regressions`,
      steps: [
        'Review skipped tests: grep -r "it.skip\\|test.skip\\|describe.skip" tests/',
        'Determine if tests are temporarily disabled or permanently irrelevant',
        'Re-enable or remove skipped tests to maintain test suite health',
        'Add comments explaining why tests are skipped if temporary'
      ],
      automation: {
        command: 'aqe analyze skipped',
        canAutoFix: false,
        confidence: 0.50,
        estimatedTime: 10
      }
    };
  }

  /**
   * Create increase coverage action (from test results)
   */
  private createIncreaseCoverageAction(coverage: any): ActionSuggestion {
    const gap = 80 - coverage.overall;

    return {
      action: ActionTypes.INCREASE_COVERAGE,
      priority: coverage.overall < 60 ? 'critical' : 'high',
      reason: `Overall coverage is ${coverage.overall.toFixed(2)}% (target: 80%)`,
      steps: [
        'Identify uncovered files and critical paths',
        'Generate tests for low-coverage areas: aqe generate tests --coverage-target=80',
        'Focus on business-critical code paths first',
        'Add edge case and error handling tests',
        'Review coverage reports: aqe analyze coverage --detailed'
      ],
      automation: {
        command: 'aqe generate tests --coverage-target=80 --focus=uncovered',
        canAutoFix: true,
        confidence: 0.85,
        estimatedTime: Math.ceil(gap * 2),
        estimatedTests: Math.ceil(gap * 3)
      },
      impact: {
        currentValue: coverage.overall,
        targetValue: 80.0,
        estimatedImprovement: gap,
        businessValue: coverage.overall < 60 ? 'critical' : 'high'
      }
    };
  }

  /**
   * Create success acknowledgment action
   */
  private createSuccessAcknowledgmentAction(summary: any): ActionSuggestion {
    return {
      action: ActionTypes.AGENT_READY,
      priority: 'info' as ActionPriority,
      reason: `All ${summary.total} tests passed successfully`,
      steps: [
        'Maintain current testing practices',
        'Continue test-driven development',
        'Monitor coverage trends over time',
        'Consider adding more edge case tests'
      ],
      automation: {
        command: 'aqe analyze trends --period=30days',
        canAutoFix: false,
        confidence: 1.0
      }
    };
  }

  /**
   * Create critical coverage gaps action
   */
  private createCriticalGapsAction(gaps: CoverageGap[]): ActionSuggestion {
    const targetFiles = gaps.map(g => g.file);

    return {
      action: ActionTypes.INCREASE_COVERAGE,
      priority: 'critical' as ActionPriority,
      reason: `${gaps.length} critical coverage gap${gaps.length > 1 ? 's' : ''} detected in business-critical code`,
      targetFiles,
      steps: [
        'Review critical gaps in business-critical files',
        `Focus on: ${gaps[0].file}`,
        `Generate tests: aqe generate tests --file=${gaps[0].file} --coverage-target=80`,
        'Prioritize error handling and edge cases',
        'Add integration tests for critical paths'
      ],
      automation: {
        command: `aqe generate tests --file=${gaps[0].file} --coverage-target=80 --priority=critical`,
        canAutoFix: true,
        confidence: 0.92,
        estimatedTime: gaps.length * 5,
        estimatedTests: gaps.reduce((sum, g) => sum + g.uncoveredLines.length, 0)
      },
      impact: {
        currentValue: gaps[0].coverage.lines,
        targetValue: 80.0,
        estimatedImprovement: 80.0 - gaps[0].coverage.lines,
        businessValue: 'critical'
      },
      relatedDocs: [
        '/workspaces/agentic-qe-cf/docs/guides/coverage-best-practices.md'
      ]
    };
  }

  /**
   * Create high-priority gaps action
   */
  private createHighPriorityGapsAction(gaps: CoverageGap[]): ActionSuggestion {
    const targetFiles = gaps.map(g => g.file);

    return {
      action: ActionTypes.INCREASE_COVERAGE,
      priority: 'high' as ActionPriority,
      reason: `${gaps.length} high-priority coverage gap${gaps.length > 1 ? 's' : ''} detected`,
      targetFiles,
      steps: [
        'Review high-priority gaps in important files',
        'Generate tests for uncovered branches and error paths',
        'Add tests for complex conditional logic',
        'Focus on frequently changed code areas'
      ],
      automation: {
        command: `aqe generate tests --priority=high --coverage-target=80`,
        canAutoFix: true,
        confidence: 0.88,
        estimatedTime: gaps.length * 4,
        estimatedTests: gaps.reduce((sum, g) => sum + g.uncoveredLines.length, 0)
      }
    };
  }

  /**
   * Create coverage trend action
   */
  private createCoverageTrendAction(trend: any): ActionSuggestion {
    const isImproving = trend.direction === 'improving';
    const isDegrading = trend.direction === 'degrading';

    return {
      action: ActionTypes.REVIEW_COVERAGE_TREND,
      priority: isDegrading ? 'medium' : 'low',
      reason: `Coverage ${trend.direction} by ${Math.abs(trend.change).toFixed(2)}% (${trend.previousCoverage.toFixed(2)}% → ${trend.currentCoverage.toFixed(2)}%)`,
      steps: isImproving
        ? [
            'Continue current testing practices',
            'Maintain momentum on test coverage',
            'Set up coverage ratcheting in CI/CD',
            'Monitor coverage on each commit'
          ]
        : [
            'Investigate causes of coverage degradation',
            'Review recent code changes without tests',
            'Add tests for new features before merging',
            'Enable pre-commit coverage checks'
          ],
      automation: {
        command: 'aqe coverage trends --days=30',
        canAutoFix: false,
        confidence: 1.0
      }
    };
  }

  /**
   * Create overall coverage action
   */
  private createOverallCoverageAction(summary: any): ActionSuggestion {
    const gap = 80 - summary.overall;

    return {
      action: ActionTypes.INCREASE_COVERAGE,
      priority: summary.overall < 60 ? 'critical' : 'high',
      reason: `Overall coverage is ${summary.overall.toFixed(2)}% (target: 80%)`,
      steps: [
        'Analyze coverage gaps: aqe analyze coverage --detailed',
        'Generate tests for uncovered areas',
        'Focus on high-impact, low-coverage files first',
        'Set up coverage gates in CI/CD'
      ],
      automation: {
        command: 'aqe generate tests --coverage-target=80 --focus=critical',
        canAutoFix: true,
        confidence: 0.87,
        estimatedTime: Math.ceil(gap * 3),
        estimatedTests: Math.ceil(gap * 5)
      },
      impact: {
        currentValue: summary.overall,
        targetValue: 80.0,
        estimatedImprovement: gap,
        businessValue: summary.overall < 60 ? 'critical' : 'high'
      }
    };
  }

  /**
   * Create quality gate failures action
   */
  private createQualityGateFailuresAction(failedGates: any[]): ActionSuggestion {
    return {
      action: 'fix_quality_gates',
      priority: 'high' as ActionPriority,
      reason: `${failedGates.length} quality gate${failedGates.length > 1 ? 's' : ''} failed`,
      steps: [
        'Review failed quality gates and thresholds',
        `Priority gates: ${failedGates.map(g => g.name).join(', ')}`,
        'Address highest-impact failures first',
        'Adjust thresholds if needed (with team approval)'
      ],
      automation: {
        command: 'aqe quality gates --fix',
        canAutoFix: false,
        confidence: 0.60,
        estimatedTime: failedGates.length * 15
      }
    };
  }

  /**
   * Create code smells action
   */
  private createCodeSmellsAction(codeSmells: any): ActionSuggestion {
    const priorityTypes = Object.entries(codeSmells.byType)
      .sort(([, a]: any, [, b]: any) => b - a)
      .slice(0, 3)
      .map(([type]) => type);

    return {
      action: ActionTypes.FIX_CODE_SMELLS,
      priority: codeSmells.total > 50 ? 'high' : 'medium',
      reason: `${codeSmells.total} code smell${codeSmells.total > 1 ? 's' : ''} detected`,
      steps: [
        `Focus on top issues: ${priorityTypes.join(', ')}`,
        'Review duplicate code and extract common utilities',
        'Refactor long methods into smaller, focused functions',
        'Split large classes into cohesive components',
        'Run code quality analysis: aqe analyze quality --detailed'
      ],
      automation: {
        command: 'aqe analyze smells --fix-duplicates --interactive',
        canAutoFix: true,
        confidence: 0.75,
        estimatedTime: Math.ceil(codeSmells.total / 2)
      },
      relatedDocs: [
        'https://refactoring.guru/refactoring/smells',
        '/workspaces/agentic-qe-cf/docs/guides/code-quality-best-practices.md'
      ]
    };
  }

  /**
   * Create technical debt action
   */
  private createTechnicalDebtAction(technicalDebt: any): ActionSuggestion {
    return {
      action: 'reduce_technical_debt',
      priority: technicalDebt.total > 100 ? 'high' : 'medium',
      reason: `${technicalDebt.total} ${technicalDebt.unit} of technical debt accumulated`,
      steps: [
        'Prioritize debt by business impact and effort',
        'Allocate time in each sprint for debt reduction',
        'Focus on high-ROI improvements first',
        'Track debt trends over time'
      ],
      automation: {
        command: 'aqe analyze debt --prioritize',
        canAutoFix: false,
        confidence: 0.65,
        estimatedTime: Math.ceil(technicalDebt.total / 2)
      }
    };
  }

  /**
   * Create complexity action
   */
  private createComplexityAction(gate: any): ActionSuggestion {
    return {
      action: ActionTypes.REDUCE_COMPLEXITY,
      priority: 'high' as ActionPriority,
      reason: `Cyclomatic complexity exceeds threshold (${gate.actualValue} > ${gate.threshold})`,
      steps: [
        'Identify complex methods and functions',
        'Extract nested logic into separate functions',
        'Apply Single Responsibility Principle',
        'Consider Strategy pattern for complex conditionals',
        'Use early returns to reduce nesting'
      ],
      automation: {
        command: 'aqe analyze complexity --refactor-suggestions',
        canAutoFix: false,
        confidence: 0.55,
        estimatedTime: 60
      },
      relatedDocs: [
        'https://refactoring.guru/refactoring/techniques',
        '/workspaces/agentic-qe-cf/docs/guides/reducing-complexity.md'
      ]
    };
  }

  // ==================== Utility Methods ====================

  /**
   * Sort actions by priority
   */
  private sortActionsByPriority(actions: ActionSuggestion[]): ActionSuggestion[] {
    const priorityOrder: Record<ActionPriority, number> = {
      critical: 1,
      high: 2,
      medium: 3,
      low: 4,
      info: 5
    };

    return actions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
  }

  /**
   * Calculate average flakiness score
   */
  private calculateAverageFlakinessScore(flaky: FlakyTest[]): number {
    if (flaky.length === 0) return 0;
    const sum = flaky.reduce((acc, test) => acc + test.flakinessScore * 100, 0);
    return sum / flaky.length;
  }

  /**
   * Round to 2 decimal places
   */
  private round(value: number): number {
    return Math.round(value * 100) / 100;
  }
}

/**
 * Default singleton instance
 */
export const actionSuggester = new AIActionSuggester();
