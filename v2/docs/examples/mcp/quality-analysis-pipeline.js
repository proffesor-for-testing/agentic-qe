/**
 * Quality Analysis Pipeline Example
 *
 * Demonstrates a complete quality analysis workflow using AQE MCP tools:
 * 1. Execute tests
 * 2. Analyze coverage
 * 3. Validate quality metrics
 * 4. Generate comprehensive report
 */

const fs = require('fs');
const path = require('path');

/**
 * Step 1: Execute Tests
 */
async function executeTests() {
  console.log('🧪 Executing test suites...');

  const result = await mcp__agentic_qe__test_execute({
    spec: {
      testSuites: [
        'tests/unit',
        'tests/integration',
        'tests/e2e'
      ],
      environments: ['development', 'staging'],
      parallelExecution: true,
      retryCount: 3,
      timeoutSeconds: 300,
      reportFormat: 'json'
    }
  });

  console.log(`✅ Test execution complete!`);
  console.log(`   Total: ${result.results.total}`);
  console.log(`   Passed: ${result.results.passed} (${(result.results.passed / result.results.total * 100).toFixed(1)}%)`);
  console.log(`   Failed: ${result.results.failed}`);
  console.log(`   Skipped: ${result.results.skipped}`);
  console.log(`   Duration: ${(result.results.duration / 1000).toFixed(2)}s`);

  return result;
}

/**
 * Step 2: Analyze Coverage
 */
async function analyzeCoverage() {
  console.log('\n📊 Analyzing test coverage...');

  // Get source files
  const sourceFiles = [
    'src/auth/*.ts',
    'src/api/*.ts',
    'src/services/*.ts',
    'src/utils/*.ts'
  ];

  const coverageAnalysis = await mcp__agentic_qe__coverage_analyze_sublinear({
    sourceFiles,
    coverageThreshold: 0.85,
    useJohnsonLindenstrauss: true,
    includeUncoveredLines: true
  });

  console.log(`✅ Coverage analysis complete!`);
  console.log(`   Overall coverage: ${coverageAnalysis.coverage.overall}%`);
  console.log(`   Line coverage: ${coverageAnalysis.coverage.line}%`);
  console.log(`   Branch coverage: ${coverageAnalysis.coverage.branch}%`);
  console.log(`   Function coverage: ${coverageAnalysis.coverage.function}%`);

  // Detect gaps
  const gaps = await mcp__agentic_qe__coverage_gaps_detect({
    coverageData: coverageAnalysis.coverage,
    prioritization: 'criticality'
  });

  console.log(`\n🔍 Coverage gaps detected: ${gaps.totalGaps}`);
  if (gaps.prioritizedGaps.length > 0) {
    console.log('   Top priority gaps:');
    gaps.prioritizedGaps.slice(0, 3).forEach(gap => {
      console.log(`   - ${gap.file}: ${gap.uncoveredLines.length} lines (${gap.priority})`);
    });
  }

  return { coverageAnalysis, gaps };
}

/**
 * Step 3: Comprehensive Quality Analysis
 */
async function analyzeQuality(testResults) {
  console.log('\n🎯 Analyzing quality metrics...');

  const analysis = await mcp__agentic_qe__quality_analyze({
    params: {
      scope: 'all',
      metrics: [
        'coverage',
        'test-quality',
        'code-complexity',
        'duplication',
        'maintainability',
        'security-score',
        'performance-score'
      ],
      thresholds: {
        coverage: 85,
        'test-quality': 80,
        'code-complexity': 10,
        duplication: 5,
        maintainability: 70,
        'security-score': 90,
        'performance-score': 85
      },
      generateRecommendations: true,
      historicalComparison: true
    },
    dataSource: {
      testResults: JSON.stringify(testResults),
      codeMetrics: './reports/code-metrics.json'
    }
  });

  console.log(`✅ Quality analysis complete!`);
  console.log(`   Overall score: ${analysis.analysis.overallScore}/100`);
  console.log(`   Passed thresholds: ${analysis.analysis.passedThresholds.length}`);
  console.log(`   Failed thresholds: ${analysis.analysis.failedThresholds.length}`);

  if (analysis.analysis.failedThresholds.length > 0) {
    console.log('\n⚠️  Failed quality thresholds:');
    analysis.analysis.failedThresholds.forEach(threshold => {
      const actual = analysis.metrics[threshold];
      const expected = analysis.params.thresholds[threshold];
      console.log(`   - ${threshold}: ${actual} (expected: ${expected})`);
    });
  }

  if (analysis.recommendations && analysis.recommendations.length > 0) {
    console.log('\n💡 Recommendations:');
    analysis.recommendations.forEach(rec => {
      console.log(`   - ${rec}`);
    });
  }

  if (analysis.historicalComparison) {
    console.log(`\n📈 Historical comparison:`);
    console.log(`   Trend: ${analysis.historicalComparison.trend}`);
    console.log(`   Change: ${analysis.historicalComparison.changePercent > 0 ? '+' : ''}${analysis.historicalComparison.changePercent}%`);
  }

  return analysis;
}

/**
 * Step 4: Validate Against Quality Gate
 */
async function validateQualityGate(testResults, qualityAnalysis) {
  console.log('\n🚦 Validating quality gate...');

  const gateResult = await mcp__agentic_qe__quality_gate_execute({
    projectId: 'example-project',
    buildId: `build-${Date.now()}`,
    environment: 'staging',
    metrics: {
      coverage: {
        line: qualityAnalysis.metrics.coverage,
        branch: 80,
        function: 85
      },
      testResults: {
        total: testResults.results.total,
        passed: testResults.results.passed,
        failed: testResults.results.failed
      },
      security: {
        critical: 0,
        high: 0,
        medium: 2,
        low: 5
      },
      performance: {
        responseTime: 150,
        throughput: 1000,
        errorRate: 0.01
      },
      codeQuality: {
        complexity: qualityAnalysis.metrics['code-complexity'],
        duplication: qualityAnalysis.metrics.duplication,
        maintainability: qualityAnalysis.metrics.maintainability
      }
    }
  });

  if (gateResult.passed) {
    console.log('✅ Quality gate PASSED');
    console.log(`   Score: ${gateResult.score}/100`);
    console.log(`   All ${gateResult.checksRun} checks passed`);
  } else {
    console.log('❌ Quality gate FAILED');
    console.log(`   Score: ${gateResult.score}/100`);
    console.log(`   Violations: ${gateResult.violations.length}`);

    if (gateResult.violations.length > 0) {
      console.log('\n   Failed checks:');
      gateResult.violations.forEach(violation => {
        console.log(`   - ${violation.rule}: ${violation.message}`);
        console.log(`     Severity: ${violation.severity}`);
      });
    }
  }

  return gateResult;
}

/**
 * Step 5: Generate Comprehensive Report
 */
async function generateReport(testResults, coverageAnalysis, qualityAnalysis, gateResult) {
  console.log('\n📄 Generating comprehensive report...');

  // Generate HTML report
  const htmlReport = await mcp__agentic_qe__test_report_comprehensive({
    results: testResults.results,
    format: 'html',
    includeCharts: true,
    includeTrends: true,
    includeSummary: true,
    includeDetails: true
  });

  // Save HTML report
  const htmlPath = path.join(process.cwd(), 'quality-report.html');
  fs.writeFileSync(htmlPath, htmlReport.report);
  console.log(`✅ HTML report saved: ${htmlPath}`);

  // Generate JSON report for CI/CD
  const jsonReport = await mcp__agentic_qe__test_report_comprehensive({
    results: testResults.results,
    format: 'json',
    structured: true
  });

  const jsonPath = path.join(process.cwd(), 'quality-report.json');
  fs.writeFileSync(jsonPath, jsonReport.report);
  console.log(`✅ JSON report saved: ${jsonPath}`);

  // Generate summary
  const summary = {
    timestamp: new Date().toISOString(),
    qualityGate: {
      passed: gateResult.passed,
      score: gateResult.score
    },
    tests: {
      total: testResults.results.total,
      passed: testResults.results.passed,
      failed: testResults.results.failed,
      successRate: (testResults.results.passed / testResults.results.total * 100).toFixed(2)
    },
    coverage: {
      overall: coverageAnalysis.coverage.overall,
      line: coverageAnalysis.coverage.line,
      branch: coverageAnalysis.coverage.branch
    },
    quality: {
      overallScore: qualityAnalysis.analysis.overallScore,
      passedThresholds: qualityAnalysis.analysis.passedThresholds.length,
      failedThresholds: qualityAnalysis.analysis.failedThresholds.length
    },
    recommendations: qualityAnalysis.recommendations || []
  };

  const summaryPath = path.join(process.cwd(), 'quality-summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  console.log(`✅ Summary saved: ${summaryPath}`);

  return { htmlPath, jsonPath, summaryPath, summary };
}

/**
 * Main Pipeline Execution
 */
async function main() {
  try {
    console.log('═══════════════════════════════════════════════════════');
    console.log('     AQE MCP Tools - Quality Analysis Pipeline         ');
    console.log('═══════════════════════════════════════════════════════\n');

    const startTime = Date.now();

    // Step 1: Execute tests
    const testResults = await executeTests();

    // Step 2: Analyze coverage
    const { coverageAnalysis, gaps } = await analyzeCoverage();

    // Step 3: Quality analysis
    const qualityAnalysis = await analyzeQuality(testResults);

    // Step 4: Validate quality gate
    const gateResult = await validateQualityGate(testResults, qualityAnalysis);

    // Step 5: Generate reports
    const reports = await generateReport(testResults, coverageAnalysis, qualityAnalysis, gateResult);

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('✅ Quality analysis pipeline completed!');
    console.log(`   Duration: ${duration}s`);
    console.log(`   Quality Gate: ${gateResult.passed ? 'PASSED ✅' : 'FAILED ❌'}`);
    console.log(`   Overall Score: ${qualityAnalysis.analysis.overallScore}/100`);
    console.log('═══════════════════════════════════════════════════════\n');

    console.log('📊 Reports generated:');
    console.log(`   HTML: ${reports.htmlPath}`);
    console.log(`   JSON: ${reports.jsonPath}`);
    console.log(`   Summary: ${reports.summaryPath}`);

    return {
      success: gateResult.passed,
      testResults,
      coverageAnalysis,
      qualityAnalysis,
      gateResult,
      reports
    };
  } catch (error) {
    console.error('\n❌ Pipeline error:');
    console.error(`   Message: ${error.message}`);

    if (error.suggestion) {
      console.error(`   Suggestion: ${error.suggestion}`);
    }

    if (error.context) {
      console.error(`   Context:`, error.context);
    }

    throw error;
  }
}

/**
 * Run if executed directly
 */
if (require.main === module) {
  main()
    .then(result => {
      console.log('\n✅ Pipeline completed!');
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('\n❌ Pipeline failed:', error);
      process.exit(1);
    });
}

module.exports = { main };
