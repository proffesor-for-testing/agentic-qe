#!/usr/bin/env node

/**
 * QE Post-Test Hook
 * Handles test result analysis, reporting, and cleanup
 */

const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class QEPostTestHook {
  constructor() {
    this.context = {
      testResults: null,
      coverage: null,
      metrics: null,
      reports: [],
      alerts: [],
      recommendations: []
    };
  }

  async execute(args = {}) {
    try {
      console.log('📊 QE Post-Test Hook: Starting test analysis...');

      // Parse hook arguments
      this.parseArguments(args);

      // Collect test results
      await this.collectTestResults();

      // Analyze test coverage
      await this.analyzeCoverage();

      // Generate performance metrics
      await this.generateMetrics();

      // Create test reports
      await this.generateReports();

      // Analyze quality trends
      await this.analyzeQualityTrends();

      // Cleanup test environment
      await this.cleanupTestEnvironment();

      // Coordinate with other agents
      await this.coordinateWithAgents();

      // Send notifications
      await this.sendNotifications();

      console.log('✅ QE Post-Test Hook: Test analysis completed successfully');

      return {
        success: true,
        context: this.context,
        summary: this.generateSummary(),
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('❌ QE Post-Test Hook failed:', error.message);
      return {
        success: false,
        error: error.message,
        context: this.context,
        timestamp: new Date().toISOString()
      };
    }
  }

  parseArguments(args) {
    this.sessionId = args.sessionId || global.testMetrics?.sessionId || `qe-${Date.now()}`;
    this.testType = args.testType || global.testMetrics?.testType || 'unit';
    this.testSuite = args.testSuite || global.testMetrics?.testSuite || 'default';
    this.testResults = args.testResults || null;
    this.config = { ...args.config };
  }

  async collectTestResults() {
    console.log('🔍 Collecting test results...');

    try {
      // Collect results from various test frameworks
      const results = await Promise.allSettled([
        this.collectJestResults(),
        this.collectMochaResults(),
        this.collectCypressResults(),
        this.collectPlaywrightResults()
      ]);

      // Merge results from different frameworks
      this.context.testResults = this.mergeTestResults(results);

      // Get global test metrics if available
      if (global.testMetrics) {
        this.context.testResults.globalMetrics = { ...global.testMetrics };
        this.context.testResults.globalMetrics.endTime = Date.now();
        this.context.testResults.globalMetrics.duration =
          this.context.testResults.globalMetrics.endTime - this.context.testResults.globalMetrics.startTime;
      }

    } catch (error) {
      console.warn('⚠️ Could not collect test results:', error.message);
      this.context.testResults = this.createEmptyResults();
    }
  }

  async collectJestResults() {
    try {
      const jestReportPath = 'tests/reports/jest-results.json';
      const jestReport = await fs.readFile(jestReportPath, 'utf8');
      return {
        framework: 'jest',
        results: JSON.parse(jestReport)
      };
    } catch (error) {
      return null;
    }
  }

  async collectMochaResults() {
    try {
      const mochaReportPath = 'tests/reports/mocha-results.json';
      const mochaReport = await fs.readFile(mochaReportPath, 'utf8');
      return {
        framework: 'mocha',
        results: JSON.parse(mochaReport)
      };
    } catch (error) {
      return null;
    }
  }

  async collectCypressResults() {
    try {
      const cypressReportPath = 'cypress/reports/cypress-results.json';
      const cypressReport = await fs.readFile(cypressReportPath, 'utf8');
      return {
        framework: 'cypress',
        results: JSON.parse(cypressReport)
      };
    } catch (error) {
      return null;
    }
  }

  async collectPlaywrightResults() {
    try {
      const playwrightReportPath = 'test-results/results.json';
      const playwrightReport = await fs.readFile(playwrightReportPath, 'utf8');
      return {
        framework: 'playwright',
        results: JSON.parse(playwrightReport)
      };
    } catch (error) {
      return null;
    }
  }

  mergeTestResults(results) {
    const validResults = results
      .filter(result => result.status === 'fulfilled' && result.value)
      .map(result => result.value);

    if (validResults.length === 0) {
      return this.createEmptyResults();
    }

    const merged = {
      frameworks: validResults.map(r => r.framework),
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        duration: 0
      },
      details: validResults,
      timestamp: new Date().toISOString()
    };

    // Aggregate metrics across frameworks
    validResults.forEach(result => {
      if (result.results?.numTotalTests) {
        merged.summary.total += result.results.numTotalTests;
        merged.summary.passed += result.results.numPassedTests || 0;
        merged.summary.failed += result.results.numFailedTests || 0;
        merged.summary.skipped += result.results.numPendingTests || 0;
      }

      if (result.results?.testResults) {
        result.results.testResults.forEach(testResult => {
          merged.summary.duration += testResult.perfStats?.end - testResult.perfStats?.start || 0;
        });
      }
    });

    return merged;
  }

  createEmptyResults() {
    return {
      frameworks: [],
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        duration: 0
      },
      details: [],
      timestamp: new Date().toISOString()
    };
  }

  async analyzeCoverage() {
    console.log('📈 Analyzing test coverage...');

    try {
      // Collect coverage from different sources
      const coverageData = await Promise.allSettled([
        this.collectIstanbulCoverage(),
        this.collectNycCoverage(),
        this.collectV8Coverage()
      ]);

      const validCoverage = coverageData
        .filter(result => result.status === 'fulfilled' && result.value)
        .map(result => result.value);

      if (validCoverage.length > 0) {
        this.context.coverage = this.mergeCoverageData(validCoverage);
        this.analyzeCoverageThresholds();
      }

    } catch (error) {
      console.warn('⚠️ Could not analyze coverage:', error.message);
    }
  }

  async collectIstanbulCoverage() {
    try {
      const coveragePath = 'coverage/coverage-final.json';
      const coverage = await fs.readFile(coveragePath, 'utf8');
      return {
        tool: 'istanbul',
        data: JSON.parse(coverage)
      };
    } catch (error) {
      return null;
    }
  }

  async collectNycCoverage() {
    try {
      const coveragePath = '.nyc_output/coverage.json';
      const coverage = await fs.readFile(coveragePath, 'utf8');
      return {
        tool: 'nyc',
        data: JSON.parse(coverage)
      };
    } catch (error) {
      return null;
    }
  }

  async collectV8Coverage() {
    try {
      const coveragePath = 'coverage/tmp/coverage.json';
      const coverage = await fs.readFile(coveragePath, 'utf8');
      return {
        tool: 'v8',
        data: JSON.parse(coverage)
      };
    } catch (error) {
      return null;
    }
  }

  mergeCoverageData(coverageArray) {
    // Take the first valid coverage data (could be enhanced to merge multiple)
    const primary = coverageArray[0];

    const summary = this.calculateCoverageSummary(primary.data);

    return {
      tool: primary.tool,
      summary,
      details: primary.data,
      timestamp: new Date().toISOString()
    };
  }

  calculateCoverageSummary(coverageData) {
    let totalStatements = 0;
    let coveredStatements = 0;
    let totalBranches = 0;
    let coveredBranches = 0;
    let totalFunctions = 0;
    let coveredFunctions = 0;
    let totalLines = 0;
    let coveredLines = 0;

    Object.values(coverageData).forEach(file => {
      if (file.s) {
        totalStatements += Object.keys(file.s).length;
        coveredStatements += Object.values(file.s).filter(count => count > 0).length;
      }

      if (file.b) {
        Object.values(file.b).forEach(branch => {
          totalBranches += branch.length;
          coveredBranches += branch.filter(count => count > 0).length;
        });
      }

      if (file.f) {
        totalFunctions += Object.keys(file.f).length;
        coveredFunctions += Object.values(file.f).filter(count => count > 0).length;
      }

      if (file.l) {
        totalLines += Object.keys(file.l).length;
        coveredLines += Object.values(file.l).filter(count => count > 0).length;
      }
    });

    return {
      statements: {
        total: totalStatements,
        covered: coveredStatements,
        percentage: totalStatements > 0 ? (coveredStatements / totalStatements) * 100 : 0
      },
      branches: {
        total: totalBranches,
        covered: coveredBranches,
        percentage: totalBranches > 0 ? (coveredBranches / totalBranches) * 100 : 0
      },
      functions: {
        total: totalFunctions,
        covered: coveredFunctions,
        percentage: totalFunctions > 0 ? (coveredFunctions / totalFunctions) * 100 : 0
      },
      lines: {
        total: totalLines,
        covered: coveredLines,
        percentage: totalLines > 0 ? (coveredLines / totalLines) * 100 : 0
      }
    };
  }

  analyzeCoverageThresholds() {
    const thresholds = {
      statements: 80,
      branches: 75,
      functions: 80,
      lines: 80,
      ...this.config.coverage?.thresholds
    };

    const coverage = this.context.coverage.summary;
    const failures = [];

    Object.keys(thresholds).forEach(metric => {
      if (coverage[metric] && coverage[metric].percentage < thresholds[metric]) {
        failures.push({
          metric,
          actual: coverage[metric].percentage.toFixed(2),
          expected: thresholds[metric],
          gap: (thresholds[metric] - coverage[metric].percentage).toFixed(2)
        });
      }
    });

    if (failures.length > 0) {
      this.context.alerts.push({
        type: 'coverage-threshold',
        level: 'warning',
        message: 'Coverage thresholds not met',
        details: failures
      });
    }
  }

  async generateMetrics() {
    console.log('📊 Generating performance metrics...');

    try {
      const results = this.context.testResults;
      const coverage = this.context.coverage;

      this.context.metrics = {
        execution: {
          totalTests: results.summary.total,
          passRate: results.summary.total > 0 ? (results.summary.passed / results.summary.total) * 100 : 0,
          failRate: results.summary.total > 0 ? (results.summary.failed / results.summary.total) * 100 : 0,
          duration: results.summary.duration,
          averageTestTime: results.summary.total > 0 ? results.summary.duration / results.summary.total : 0
        },
        quality: {
          coverageScore: coverage ? this.calculateOverallCoverage(coverage.summary) : 0,
          testStability: this.calculateTestStability(),
          codeQuality: await this.calculateCodeQuality()
        },
        trends: {
          performanceTrend: await this.calculatePerformanceTrend(),
          coverageTrend: await this.calculateCoverageTrend(),
          reliabilityTrend: await this.calculateReliabilityTrend()
        },
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.warn('⚠️ Could not generate metrics:', error.message);
    }
  }

  calculateOverallCoverage(coverageSummary) {
    const metrics = ['statements', 'branches', 'functions', 'lines'];
    const total = metrics.reduce((sum, metric) => sum + coverageSummary[metric].percentage, 0);
    return total / metrics.length;
  }

  calculateTestStability() {
    const results = this.context.testResults;
    if (results.summary.total === 0) return 100;

    // Test stability based on pass rate
    return (results.summary.passed / results.summary.total) * 100;
  }

  async calculateCodeQuality() {
    try {
      // Run ESLint or other quality tools
      const { stdout } = await execAsync('npx eslint . --format json').catch(() => ({ stdout: '[]' }));
      const lintResults = JSON.parse(stdout);

      const totalIssues = lintResults.reduce((sum, file) => sum + file.messages.length, 0);
      const errorCount = lintResults.reduce((sum, file) =>
        sum + file.messages.filter(msg => msg.severity === 2).length, 0);

      return {
        totalIssues,
        errorCount,
        qualityScore: Math.max(0, 100 - (totalIssues * 2) - (errorCount * 5))
      };

    } catch (error) {
      return {
        totalIssues: 0,
        errorCount: 0,
        qualityScore: 100
      };
    }
  }

  async calculatePerformanceTrend() {
    try {
      // Load historical performance data
      const historyPath = 'tests/reports/performance-history.json';
      const history = JSON.parse(await fs.readFile(historyPath, 'utf8').catch(() => '[]'));

      const currentDuration = this.context.testResults.summary.duration;

      if (history.length === 0) {
        return { trend: 'baseline', change: 0 };
      }

      const lastDuration = history[history.length - 1].duration;
      const change = ((currentDuration - lastDuration) / lastDuration) * 100;

      return {
        trend: change > 10 ? 'degrading' : change < -10 ? 'improving' : 'stable',
        change: change.toFixed(2)
      };

    } catch (error) {
      return { trend: 'unknown', change: 0 };
    }
  }

  async calculateCoverageTrend() {
    try {
      // Load historical coverage data
      const historyPath = 'tests/reports/coverage-history.json';
      const history = JSON.parse(await fs.readFile(historyPath, 'utf8').catch(() => '[]'));

      const currentCoverage = this.context.coverage ?
        this.calculateOverallCoverage(this.context.coverage.summary) : 0;

      if (history.length === 0) {
        return { trend: 'baseline', change: 0 };
      }

      const lastCoverage = history[history.length - 1].coverage;
      const change = currentCoverage - lastCoverage;

      return {
        trend: change > 2 ? 'improving' : change < -2 ? 'degrading' : 'stable',
        change: change.toFixed(2)
      };

    } catch (error) {
      return { trend: 'unknown', change: 0 };
    }
  }

  async calculateReliabilityTrend() {
    try {
      // Load historical test results
      const historyPath = 'tests/reports/reliability-history.json';
      const history = JSON.parse(await fs.readFile(historyPath, 'utf8').catch(() => '[]'));

      const currentReliability = this.calculateTestStability();

      if (history.length === 0) {
        return { trend: 'baseline', change: 0 };
      }

      const lastReliability = history[history.length - 1].reliability;
      const change = currentReliability - lastReliability;

      return {
        trend: change > 5 ? 'improving' : change < -5 ? 'degrading' : 'stable',
        change: change.toFixed(2)
      };

    } catch (error) {
      return { trend: 'unknown', change: 0 };
    }
  }

  async generateReports() {
    console.log('📋 Generating test reports...');

    try {
      // Generate different report formats
      await Promise.allSettled([
        this.generateJSONReport(),
        this.generateHTMLReport(),
        this.generateMarkdownReport(),
        this.generateTrendReport()
      ]);

    } catch (error) {
      console.warn('⚠️ Could not generate reports:', error.message);
    }
  }

  async generateJSONReport() {
    try {
      const reportPath = 'tests/reports/qe-test-report.json';
      const report = {
        sessionId: this.sessionId,
        testType: this.testType,
        testSuite: this.testSuite,
        timestamp: new Date().toISOString(),
        results: this.context.testResults,
        coverage: this.context.coverage,
        metrics: this.context.metrics,
        alerts: this.context.alerts,
        recommendations: this.context.recommendations
      };

      await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
      this.context.reports.push({ format: 'json', path: reportPath });

    } catch (error) {
      console.warn('⚠️ Could not generate JSON report:', error.message);
    }
  }

  async generateHTMLReport() {
    try {
      const reportPath = 'tests/reports/qe-test-report.html';
      const html = this.createHTMLReport();

      await fs.writeFile(reportPath, html);
      this.context.reports.push({ format: 'html', path: reportPath });

    } catch (error) {
      console.warn('⚠️ Could not generate HTML report:', error.message);
    }
  }

  createHTMLReport() {
    const results = this.context.testResults;
    const coverage = this.context.coverage;
    const metrics = this.context.metrics;

    return `
<!DOCTYPE html>
<html>
<head>
    <title>QE Test Report - ${this.sessionId}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background: #f5f5f5; padding: 20px; border-radius: 5px; }
        .metric { display: inline-block; margin: 10px; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }
        .pass { color: green; }
        .fail { color: red; }
        .warn { color: orange; }
        .progress { width: 100%; background: #f0f0f0; border-radius: 5px; }
        .progress-bar { height: 20px; background: #4CAF50; border-radius: 5px; text-align: center; line-height: 20px; color: white; }
    </style>
</head>
<body>
    <div class="header">
        <h1>QE Test Report</h1>
        <p><strong>Session:</strong> ${this.sessionId}</p>
        <p><strong>Test Type:</strong> ${this.testType}</p>
        <p><strong>Test Suite:</strong> ${this.testSuite}</p>
        <p><strong>Timestamp:</strong> ${new Date().toLocaleString()}</p>
    </div>

    <h2>Test Results</h2>
    <div class="metric">
        <h3>Total Tests</h3>
        <div style="font-size: 24px;">${results.summary.total}</div>
    </div>
    <div class="metric">
        <h3>Passed</h3>
        <div style="font-size: 24px;" class="pass">${results.summary.passed}</div>
    </div>
    <div class="metric">
        <h3>Failed</h3>
        <div style="font-size: 24px;" class="fail">${results.summary.failed}</div>
    </div>
    <div class="metric">
        <h3>Pass Rate</h3>
        <div style="font-size: 24px;">${metrics?.execution.passRate.toFixed(1)}%</div>
    </div>

    ${coverage ? `
    <h2>Coverage</h2>
    <div class="metric">
        <h3>Statements</h3>
        <div class="progress">
            <div class="progress-bar" style="width: ${coverage.summary.statements.percentage}%">
                ${coverage.summary.statements.percentage.toFixed(1)}%
            </div>
        </div>
    </div>
    <div class="metric">
        <h3>Branches</h3>
        <div class="progress">
            <div class="progress-bar" style="width: ${coverage.summary.branches.percentage}%">
                ${coverage.summary.branches.percentage.toFixed(1)}%
            </div>
        </div>
    </div>
    <div class="metric">
        <h3>Functions</h3>
        <div class="progress">
            <div class="progress-bar" style="width: ${coverage.summary.functions.percentage}%">
                ${coverage.summary.functions.percentage.toFixed(1)}%
            </div>
        </div>
    </div>
    <div class="metric">
        <h3>Lines</h3>
        <div class="progress">
            <div class="progress-bar" style="width: ${coverage.summary.lines.percentage}%">
                ${coverage.summary.lines.percentage.toFixed(1)}%
            </div>
        </div>
    </div>
    ` : ''}

    ${this.context.alerts.length > 0 ? `
    <h2>Alerts</h2>
    ${this.context.alerts.map(alert => `
        <div class="metric ${alert.level === 'error' ? 'fail' : 'warn'}">
            <h4>${alert.type}</h4>
            <p>${alert.message}</p>
        </div>
    `).join('')}
    ` : ''}
</body>
</html>`;
  }

  async generateMarkdownReport() {
    try {
      const reportPath = 'tests/reports/qe-test-report.md';
      const markdown = this.createMarkdownReport();

      await fs.writeFile(reportPath, markdown);
      this.context.reports.push({ format: 'markdown', path: reportPath });

    } catch (error) {
      console.warn('⚠️ Could not generate Markdown report:', error.message);
    }
  }

  createMarkdownReport() {
    const results = this.context.testResults;
    const coverage = this.context.coverage;
    const metrics = this.context.metrics;

    return `# QE Test Report

**Session:** ${this.sessionId}
**Test Type:** ${this.testType}
**Test Suite:** ${this.testSuite}
**Timestamp:** ${new Date().toISOString()}

## Test Results Summary

| Metric | Value |
|--------|-------|
| Total Tests | ${results.summary.total} |
| Passed | ${results.summary.passed} |
| Failed | ${results.summary.failed} |
| Skipped | ${results.summary.skipped} |
| Pass Rate | ${metrics?.execution.passRate.toFixed(1)}% |
| Duration | ${(results.summary.duration / 1000).toFixed(2)}s |

${coverage ? `
## Coverage Summary

| Metric | Coverage |
|--------|----------|
| Statements | ${coverage.summary.statements.percentage.toFixed(1)}% (${coverage.summary.statements.covered}/${coverage.summary.statements.total}) |
| Branches | ${coverage.summary.branches.percentage.toFixed(1)}% (${coverage.summary.branches.covered}/${coverage.summary.branches.total}) |
| Functions | ${coverage.summary.functions.percentage.toFixed(1)}% (${coverage.summary.functions.covered}/${coverage.summary.functions.total}) |
| Lines | ${coverage.summary.lines.percentage.toFixed(1)}% (${coverage.summary.lines.covered}/${coverage.summary.lines.total}) |
` : ''}

${this.context.alerts.length > 0 ? `
## Alerts

${this.context.alerts.map(alert => `
### ${alert.type} (${alert.level})
${alert.message}

${alert.details ? JSON.stringify(alert.details, null, 2) : ''}
`).join('')}
` : ''}

${this.context.recommendations.length > 0 ? `
## Recommendations

${this.context.recommendations.map(rec => `- ${rec.message}`).join('\n')}
` : ''}
`;
  }

  async generateTrendReport() {
    try {
      // Update historical data
      await this.updateHistoricalData();

      const trendPath = 'tests/reports/qe-trends.json';
      const trendData = {
        sessionId: this.sessionId,
        timestamp: new Date().toISOString(),
        trends: this.context.metrics?.trends || {},
        snapshot: {
          passRate: this.context.metrics?.execution.passRate || 0,
          coverage: this.context.coverage ? this.calculateOverallCoverage(this.context.coverage.summary) : 0,
          duration: this.context.testResults.summary.duration,
          reliability: this.calculateTestStability()
        }
      };

      await fs.writeFile(trendPath, JSON.stringify(trendData, null, 2));
      this.context.reports.push({ format: 'trends', path: trendPath });

    } catch (error) {
      console.warn('⚠️ Could not generate trend report:', error.message);
    }
  }

  async updateHistoricalData() {
    try {
      const files = [
        'tests/reports/performance-history.json',
        'tests/reports/coverage-history.json',
        'tests/reports/reliability-history.json'
      ];

      const currentData = {
        timestamp: new Date().toISOString(),
        sessionId: this.sessionId,
        duration: this.context.testResults.summary.duration,
        coverage: this.context.coverage ? this.calculateOverallCoverage(this.context.coverage.summary) : 0,
        reliability: this.calculateTestStability()
      };

      for (const file of files) {
        const history = JSON.parse(await fs.readFile(file, 'utf8').catch(() => '[]'));

        // Keep only last 100 entries
        if (history.length >= 100) {
          history.shift();
        }

        history.push(currentData);
        await fs.writeFile(file, JSON.stringify(history, null, 2));
      }

    } catch (error) {
      console.warn('⚠️ Could not update historical data:', error.message);
    }
  }

  async analyzeQualityTrends() {
    console.log('📈 Analyzing quality trends...');

    try {
      const metrics = this.context.metrics;

      // Generate recommendations based on metrics and trends
      if (metrics?.execution.passRate < 95) {
        this.context.recommendations.push({
          type: 'test-reliability',
          priority: 'high',
          message: 'Test pass rate is below 95%. Consider improving test stability and fixing flaky tests.'
        });
      }

      if (metrics?.quality.coverageScore < 80) {
        this.context.recommendations.push({
          type: 'test-coverage',
          priority: 'medium',
          message: 'Test coverage is below 80%. Add more unit tests to improve coverage.'
        });
      }

      if (metrics?.trends.performanceTrend?.trend === 'degrading') {
        this.context.recommendations.push({
          type: 'test-performance',
          priority: 'medium',
          message: 'Test execution time is increasing. Consider optimizing test setup and teardown.'
        });
      }

      if (this.context.testResults.summary.failed > 0) {
        this.context.alerts.push({
          type: 'test-failures',
          level: 'error',
          message: `${this.context.testResults.summary.failed} test(s) failed`,
          details: {
            failedTests: this.context.testResults.summary.failed,
            totalTests: this.context.testResults.summary.total
          }
        });
      }

    } catch (error) {
      console.warn('⚠️ Could not analyze quality trends:', error.message);
    }
  }

  async cleanupTestEnvironment() {
    console.log('🧹 Cleaning up test environment...');

    try {
      // Stop test databases and services
      await this.stopTestServices();

      // Clean up temporary files
      await this.cleanupTempFiles();

      // Reset test state
      await this.resetTestState();

    } catch (error) {
      console.warn('⚠️ Could not cleanup test environment:', error.message);
    }
  }

  async stopTestServices() {
    try {
      // Stop test database containers
      await execAsync('docker stop test-db').catch(() => {});
      await execAsync('docker rm test-db').catch(() => {});

      // Stop mock services
      // Implementation would depend on specific mock framework

    } catch (error) {
      console.warn('⚠️ Could not stop test services:', error.message);
    }
  }

  async cleanupTempFiles() {
    try {
      // Clean up temporary test files
      const tempDirs = [
        'tests/tmp',
        '.nyc_output',
        'coverage/tmp'
      ];

      for (const dir of tempDirs) {
        await execAsync(`rm -rf ${dir}`).catch(() => {});
      }

    } catch (error) {
      console.warn('⚠️ Could not cleanup temp files:', error.message);
    }
  }

  async resetTestState() {
    // Clear global test state
    if (global.testMetrics) {
      delete global.testMetrics;
    }
    if (global.testFixtures) {
      delete global.testFixtures;
    }
    if (global.mockData) {
      delete global.mockData;
    }
  }

  async coordinateWithAgents() {
    console.log('🤝 Coordinating with other QE agents...');

    try {
      // Notify agents about test completion
      await this.notifyAgents('test-session-end', {
        sessionId: this.sessionId,
        results: this.context.testResults.summary,
        success: this.context.testResults.summary.failed === 0
      });

      // Update shared memory with results
      await this.updateSharedMemory();

    } catch (error) {
      console.warn('⚠️ Could not coordinate with agents:', error.message);
    }
  }

  async notifyAgents(event, data) {
    try {
      await execAsync(`npx claude-flow@alpha hooks notify --event "${event}" --data '${JSON.stringify(data)}'`);
    } catch (error) {
      console.warn('⚠️ Could not notify agents:', error.message);
    }
  }

  async updateSharedMemory() {
    try {
      const memoryData = {
        sessionId: this.sessionId,
        testResults: this.context.testResults,
        coverage: this.context.coverage,
        metrics: this.context.metrics,
        reports: this.context.reports,
        timestamp: new Date().toISOString()
      };

      await execAsync(`npx claude-flow@alpha hooks memory-store --key "qe/results/${this.sessionId}" --value '${JSON.stringify(memoryData)}'`);
    } catch (error) {
      console.warn('⚠️ Could not update shared memory:', error.message);
    }
  }

  async sendNotifications() {
    console.log('📧 Sending notifications...');

    try {
      // Send notifications based on results
      if (this.context.testResults.summary.failed > 0) {
        await this.sendFailureNotification();
      }

      if (this.context.alerts.some(alert => alert.level === 'error')) {
        await this.sendAlertNotification();
      }

      // Send summary notification
      await this.sendSummaryNotification();

    } catch (error) {
      console.warn('⚠️ Could not send notifications:', error.message);
    }
  }

  async sendFailureNotification() {
    const notification = {
      type: 'test-failure',
      subject: `Test Failures Detected - ${this.sessionId}`,
      message: `${this.context.testResults.summary.failed} test(s) failed in ${this.testType} test suite`,
      details: this.context.testResults.summary
    };

    console.log('🚨 Test Failure Notification:', notification.message);
  }

  async sendAlertNotification() {
    const errorAlerts = this.context.alerts.filter(alert => alert.level === 'error');

    const notification = {
      type: 'test-alert',
      subject: `Test Alerts - ${this.sessionId}`,
      message: `${errorAlerts.length} error alert(s) detected`,
      details: errorAlerts
    };

    console.log('⚠️ Test Alert Notification:', notification.message);
  }

  async sendSummaryNotification() {
    const summary = this.generateSummary();

    const notification = {
      type: 'test-summary',
      subject: `Test Summary - ${this.sessionId}`,
      message: summary.message,
      details: summary.details
    };

    console.log('📊 Test Summary Notification:', notification.message);
  }

  generateSummary() {
    const results = this.context.testResults;
    const coverage = this.context.coverage;
    const metrics = this.context.metrics;

    const success = results.summary.failed === 0;
    const passRate = metrics?.execution.passRate || 0;
    const coverageScore = coverage ? this.calculateOverallCoverage(coverage.summary) : 0;

    return {
      success,
      message: success
        ? `✅ All tests passed! ${results.summary.passed}/${results.summary.total} tests (${passRate.toFixed(1)}% pass rate)`
        : `❌ ${results.summary.failed} test(s) failed out of ${results.summary.total} (${passRate.toFixed(1)}% pass rate)`,
      details: {
        passRate: passRate.toFixed(1),
        coverage: coverageScore.toFixed(1),
        duration: (results.summary.duration / 1000).toFixed(2),
        alerts: this.context.alerts.length,
        recommendations: this.context.recommendations.length
      }
    };
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const hookArgs = {};

  // Parse command line arguments
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.replace('--', '');
    const value = args[i + 1];
    if (key && value) {
      try {
        hookArgs[key] = JSON.parse(value);
      } catch {
        hookArgs[key] = value;
      }
    }
  }

  const hook = new QEPostTestHook();
  hook.execute(hookArgs)
    .then(result => {
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('❌ Hook execution failed:', error);
      process.exit(1);
    });
}

module.exports = QEPostTestHook;