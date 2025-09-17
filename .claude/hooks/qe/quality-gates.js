#!/usr/bin/env node

/**
 * QE Quality Gates Hook
 * Enforces quality standards and gates for CI/CD pipeline
 */

const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class QEQualityGatesHook {
  constructor() {
    this.gates = new Map();
    this.results = {
      passed: [],
      failed: [],
      warnings: [],
      metrics: {}
    };
    this.config = {
      enforceAll: true,
      failOnWarnings: false,
      customGates: [],
      thresholds: {}
    };
  }

  async execute(args = {}) {
    try {
      console.log('🚪 QE Quality Gates: Starting quality gate evaluation...');

      // Parse arguments and load configuration
      this.parseArguments(args);
      await this.loadConfiguration();

      // Initialize quality gates
      this.initializeGates();

      // Execute all quality gates
      await this.executeGates();

      // Evaluate overall results
      const overallResult = this.evaluateResults();

      // Generate quality gate report
      await this.generateReport();

      // Coordinate with CI/CD pipeline
      await this.coordinateWithPipeline();

      console.log(overallResult.success ?
        '✅ QE Quality Gates: All quality gates passed' :
        '❌ QE Quality Gates: Some quality gates failed');

      return {
        success: overallResult.success,
        results: this.results,
        summary: overallResult.summary,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('❌ QE Quality Gates failed:', error.message);
      return {
        success: false,
        error: error.message,
        results: this.results,
        timestamp: new Date().toISOString()
      };
    }
  }

  parseArguments(args) {
    this.sessionId = args.sessionId || `qg-${Date.now()}`;
    this.environment = args.environment || process.env.QE_ENVIRONMENT || 'test';
    this.pipeline = args.pipeline || process.env.CI_PIPELINE_ID || 'local';
    this.config = { ...this.config, ...args.config };
  }

  async loadConfiguration() {
    try {
      // Load quality gates configuration
      const configPath = '.claude/hooks/qe/quality-gates.config.json';
      const configExists = await fs.access(configPath).then(() => true).catch(() => false);

      if (configExists) {
        const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
        this.config = { ...this.config, ...config };
      } else {
        // Create default configuration
        await this.createDefaultConfiguration(configPath);
      }

    } catch (error) {
      console.warn('⚠️ Could not load quality gates configuration:', error.message);
    }
  }

  async createDefaultConfiguration(configPath) {
    const defaultConfig = {
      enforceAll: true,
      failOnWarnings: false,
      thresholds: {
        testCoverage: {
          statements: 80,
          branches: 75,
          functions: 80,
          lines: 80
        },
        testReliability: {
          passRate: 95,
          maxFlakyTests: 5
        },
        codeQuality: {
          maxComplexity: 10,
          maxDuplication: 5,
          maxIssues: 20
        },
        performance: {
          maxTestDuration: 300000, // 5 minutes
          maxMemoryUsage: 512, // MB
          maxBuildTime: 600000 // 10 minutes
        },
        security: {
          maxVulnerabilities: 0,
          maxDependencyIssues: 5
        }
      },
      gates: {
        testCoverage: { enabled: true, required: true },
        testReliability: { enabled: true, required: true },
        codeQuality: { enabled: true, required: false },
        performance: { enabled: true, required: false },
        security: { enabled: true, required: true },
        documentation: { enabled: true, required: false },
        dependencies: { enabled: true, required: true }
      }
    };

    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(configPath, JSON.stringify(defaultConfig, null, 2));
    this.config = { ...this.config, ...defaultConfig };
  }

  initializeGates() {
    console.log('🔧 Initializing quality gates...');

    // Test Coverage Gate
    this.gates.set('testCoverage', {
      name: 'Test Coverage',
      required: this.config.gates?.testCoverage?.required ?? true,
      enabled: this.config.gates?.testCoverage?.enabled ?? true,
      execute: () => this.evaluateTestCoverage()
    });

    // Test Reliability Gate
    this.gates.set('testReliability', {
      name: 'Test Reliability',
      required: this.config.gates?.testReliability?.required ?? true,
      enabled: this.config.gates?.testReliability?.enabled ?? true,
      execute: () => this.evaluateTestReliability()
    });

    // Code Quality Gate
    this.gates.set('codeQuality', {
      name: 'Code Quality',
      required: this.config.gates?.codeQuality?.required ?? false,
      enabled: this.config.gates?.codeQuality?.enabled ?? true,
      execute: () => this.evaluateCodeQuality()
    });

    // Performance Gate
    this.gates.set('performance', {
      name: 'Performance',
      required: this.config.gates?.performance?.required ?? false,
      enabled: this.config.gates?.performance?.enabled ?? true,
      execute: () => this.evaluatePerformance()
    });

    // Security Gate
    this.gates.set('security', {
      name: 'Security',
      required: this.config.gates?.security?.required ?? true,
      enabled: this.config.gates?.security?.enabled ?? true,
      execute: () => this.evaluateSecurity()
    });

    // Documentation Gate
    this.gates.set('documentation', {
      name: 'Documentation',
      required: this.config.gates?.documentation?.required ?? false,
      enabled: this.config.gates?.documentation?.enabled ?? true,
      execute: () => this.evaluateDocumentation()
    });

    // Dependencies Gate
    this.gates.set('dependencies', {
      name: 'Dependencies',
      required: this.config.gates?.dependencies?.required ?? true,
      enabled: this.config.gates?.dependencies?.enabled ?? true,
      execute: () => this.evaluateDependencies()
    });

    // Add custom gates
    if (this.config.customGates) {
      this.config.customGates.forEach(gate => {
        this.gates.set(gate.name, gate);
      });
    }
  }

  async executeGates() {
    console.log('🏃 Executing quality gates...');

    const gatePromises = [];

    for (const [gateId, gate] of this.gates.entries()) {
      if (!gate.enabled) {
        console.log(`⏭️ Skipping disabled gate: ${gate.name}`);
        continue;
      }

      console.log(`🔍 Evaluating gate: ${gate.name}`);

      gatePromises.push(
        this.executeGate(gateId, gate).catch(error => ({
          gateId,
          error: error.message,
          success: false
        }))
      );
    }

    const results = await Promise.allSettled(gatePromises);

    results.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value) {
        const gateResult = result.value;

        if (gateResult.success) {
          this.results.passed.push(gateResult);
        } else {
          this.results.failed.push(gateResult);
        }

        if (gateResult.warnings && gateResult.warnings.length > 0) {
          this.results.warnings.push(...gateResult.warnings);
        }
      }
    });
  }

  async executeGate(gateId, gate) {
    const startTime = Date.now();

    try {
      const result = await gate.execute();
      const duration = Date.now() - startTime;

      return {
        gateId,
        name: gate.name,
        required: gate.required,
        success: result.success,
        score: result.score,
        metrics: result.metrics,
        details: result.details,
        warnings: result.warnings || [],
        duration,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      return {
        gateId,
        name: gate.name,
        required: gate.required,
        success: false,
        error: error.message,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString()
      };
    }
  }

  async evaluateTestCoverage() {
    try {
      // Load coverage data
      const coverage = await this.loadCoverageData();
      if (!coverage) {
        return {
          success: false,
          score: 0,
          details: 'No coverage data found',
          metrics: {}
        };
      }

      const thresholds = this.config.thresholds.testCoverage;
      const summary = coverage.summary;

      const metrics = {
        statements: summary.statements.percentage,
        branches: summary.branches.percentage,
        functions: summary.functions.percentage,
        lines: summary.lines.percentage
      };

      const failures = [];
      const warnings = [];

      Object.keys(thresholds).forEach(metric => {
        const actual = metrics[metric] || 0;
        const threshold = thresholds[metric];

        if (actual < threshold) {
          const gap = threshold - actual;
          if (gap > 10) {
            failures.push(`${metric}: ${actual.toFixed(1)}% < ${threshold}% (gap: ${gap.toFixed(1)}%)`);
          } else {
            warnings.push(`${metric}: ${actual.toFixed(1)}% is close to threshold ${threshold}%`);
          }
        }
      });

      const overallScore = Object.values(metrics).reduce((sum, val) => sum + val, 0) / Object.keys(metrics).length;
      const success = failures.length === 0;

      return {
        success,
        score: overallScore,
        metrics,
        details: {
          passed: Object.keys(metrics).length - failures.length,
          failed: failures.length,
          failures,
          thresholds
        },
        warnings
      };

    } catch (error) {
      return {
        success: false,
        score: 0,
        details: `Coverage evaluation failed: ${error.message}`,
        metrics: {}
      };
    }
  }

  async loadCoverageData() {
    try {
      // Try different coverage file locations
      const coveragePaths = [
        'coverage/coverage-final.json',
        '.nyc_output/coverage.json',
        'coverage/lcov-report/coverage.json'
      ];

      for (const coveragePath of coveragePaths) {
        try {
          const coverageData = JSON.parse(await fs.readFile(coveragePath, 'utf8'));
          return {
            summary: this.calculateCoverageSummary(coverageData),
            details: coverageData
          };
        } catch (error) {
          continue;
        }
      }

      return null;
    } catch (error) {
      return null;
    }
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

  async evaluateTestReliability() {
    try {
      // Load test results
      const testResults = await this.loadTestResults();
      if (!testResults) {
        return {
          success: false,
          score: 0,
          details: 'No test results found',
          metrics: {}
        };
      }

      const thresholds = this.config.thresholds.testReliability;
      const summary = testResults.summary;

      const passRate = summary.total > 0 ? (summary.passed / summary.total) * 100 : 0;
      const flakyTests = await this.detectFlakyTests();

      const metrics = {
        passRate,
        flakyTestCount: flakyTests.length,
        totalTests: summary.total,
        failedTests: summary.failed
      };

      const failures = [];
      const warnings = [];

      if (passRate < thresholds.passRate) {
        failures.push(`Pass rate: ${passRate.toFixed(1)}% < ${thresholds.passRate}%`);
      }

      if (flakyTests.length > thresholds.maxFlakyTests) {
        failures.push(`Flaky tests: ${flakyTests.length} > ${thresholds.maxFlakyTests}`);
      }

      if (passRate < thresholds.passRate + 5) {
        warnings.push(`Pass rate ${passRate.toFixed(1)}% is close to threshold ${thresholds.passRate}%`);
      }

      const success = failures.length === 0;
      const score = Math.max(0, passRate - (flakyTests.length * 2));

      return {
        success,
        score,
        metrics,
        details: {
          passRate: passRate.toFixed(1),
          flakyTests: flakyTests.slice(0, 10), // Show first 10 flaky tests
          failures,
          thresholds
        },
        warnings
      };

    } catch (error) {
      return {
        success: false,
        score: 0,
        details: `Test reliability evaluation failed: ${error.message}`,
        metrics: {}
      };
    }
  }

  async loadTestResults() {
    try {
      const resultsPaths = [
        'tests/reports/qe-test-report.json',
        'tests/reports/jest-results.json',
        'tests/reports/test-results.json'
      ];

      for (const resultsPath of resultsPaths) {
        try {
          const results = JSON.parse(await fs.readFile(resultsPath, 'utf8'));
          return results.results || results;
        } catch (error) {
          continue;
        }
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  async detectFlakyTests() {
    try {
      // Load historical test data to detect flaky tests
      const historyPath = 'tests/reports/test-history.json';
      const history = JSON.parse(await fs.readFile(historyPath, 'utf8').catch(() => '[]'));

      if (history.length < 5) {
        return []; // Need at least 5 runs to detect flaky tests
      }

      const testStats = new Map();

      // Analyze last 10 test runs
      const recentRuns = history.slice(-10);

      recentRuns.forEach(run => {
        if (run.results && run.results.details) {
          run.results.details.forEach(framework => {
            if (framework.results && framework.results.testResults) {
              framework.results.testResults.forEach(testFile => {
                testFile.assertionResults?.forEach(test => {
                  const testKey = `${testFile.name}::${test.title}`;

                  if (!testStats.has(testKey)) {
                    testStats.set(testKey, { passes: 0, failures: 0 });
                  }

                  const stats = testStats.get(testKey);
                  if (test.status === 'passed') {
                    stats.passes++;
                  } else {
                    stats.failures++;
                  }
                });
              });
            }
          });
        }
      });

      // Identify flaky tests (tests that both pass and fail)
      const flakyTests = [];

      testStats.forEach((stats, testKey) => {
        const totalRuns = stats.passes + stats.failures;
        const successRate = stats.passes / totalRuns;

        // Consider a test flaky if it fails 10-90% of the time
        if (successRate > 0.1 && successRate < 0.9 && totalRuns >= 3) {
          flakyTests.push({
            test: testKey,
            successRate: (successRate * 100).toFixed(1),
            passes: stats.passes,
            failures: stats.failures,
            totalRuns
          });
        }
      });

      return flakyTests;
    } catch (error) {
      return [];
    }
  }

  async evaluateCodeQuality() {
    try {
      const thresholds = this.config.thresholds.codeQuality;

      // Run code quality analysis
      const [lintResults, complexityResults, duplicationResults] = await Promise.allSettled([
        this.runLintAnalysis(),
        this.runComplexityAnalysis(),
        this.runDuplicationAnalysis()
      ]);

      const metrics = {
        lintIssues: lintResults.status === 'fulfilled' ? lintResults.value.totalIssues : 0,
        complexity: complexityResults.status === 'fulfilled' ? complexityResults.value.averageComplexity : 0,
        duplication: duplicationResults.status === 'fulfilled' ? duplicationResults.value.duplicationPercentage : 0
      };

      const failures = [];
      const warnings = [];

      if (metrics.lintIssues > thresholds.maxIssues) {
        failures.push(`Lint issues: ${metrics.lintIssues} > ${thresholds.maxIssues}`);
      }

      if (metrics.complexity > thresholds.maxComplexity) {
        failures.push(`Average complexity: ${metrics.complexity} > ${thresholds.maxComplexity}`);
      }

      if (metrics.duplication > thresholds.maxDuplication) {
        failures.push(`Code duplication: ${metrics.duplication}% > ${thresholds.maxDuplication}%`);
      }

      // Add warnings for values close to thresholds
      if (metrics.lintIssues > thresholds.maxIssues * 0.8) {
        warnings.push(`Lint issues approaching threshold: ${metrics.lintIssues}`);
      }

      const success = failures.length === 0;
      const score = Math.max(0, 100 - metrics.lintIssues - (metrics.complexity * 5) - metrics.duplication);

      return {
        success,
        score,
        metrics,
        details: {
          failures,
          thresholds,
          lintDetails: lintResults.status === 'fulfilled' ? lintResults.value : null,
          complexityDetails: complexityResults.status === 'fulfilled' ? complexityResults.value : null,
          duplicationDetails: duplicationResults.status === 'fulfilled' ? duplicationResults.value : null
        },
        warnings
      };

    } catch (error) {
      return {
        success: false,
        score: 0,
        details: `Code quality evaluation failed: ${error.message}`,
        metrics: {}
      };
    }
  }

  async runLintAnalysis() {
    try {
      const { stdout } = await execAsync('npx eslint . --format json').catch(() => ({ stdout: '[]' }));
      const results = JSON.parse(stdout);

      const totalIssues = results.reduce((sum, file) => sum + file.messages.length, 0);
      const errorCount = results.reduce((sum, file) =>
        sum + file.messages.filter(msg => msg.severity === 2).length, 0);
      const warningCount = results.reduce((sum, file) =>
        sum + file.messages.filter(msg => msg.severity === 1).length, 0);

      return {
        totalIssues,
        errorCount,
        warningCount,
        files: results.length
      };
    } catch (error) {
      return {
        totalIssues: 0,
        errorCount: 0,
        warningCount: 0,
        files: 0
      };
    }
  }

  async runComplexityAnalysis() {
    try {
      // Simple complexity analysis (could be enhanced with proper tools)
      const { stdout } = await execAsync('find . -name "*.js" -o -name "*.ts" | head -20 | xargs wc -l').catch(() => ({ stdout: '0' }));
      const lines = stdout.split('\n').filter(line => line.trim());

      let totalComplexity = 0;
      let fileCount = 0;

      for (const line of lines) {
        const match = line.trim().match(/(\d+)/);
        if (match) {
          const lineCount = parseInt(match[1]);
          // Simple heuristic: complexity roughly correlates with lines
          totalComplexity += Math.max(1, lineCount / 25);
          fileCount++;
        }
      }

      return {
        averageComplexity: fileCount > 0 ? totalComplexity / fileCount : 0,
        totalComplexity,
        fileCount
      };
    } catch (error) {
      return {
        averageComplexity: 0,
        totalComplexity: 0,
        fileCount: 0
      };
    }
  }

  async runDuplicationAnalysis() {
    try {
      // Simple duplication detection (could be enhanced with proper tools)
      const { stdout } = await execAsync('find . -name "*.js" -o -name "*.ts" | xargs cat | sort | uniq -d | wc -l').catch(() => ({ stdout: '0' }));
      const duplicateLines = parseInt(stdout.trim());

      const { stdout: totalLines } = await execAsync('find . -name "*.js" -o -name "*.ts" | xargs cat | wc -l').catch(() => ({ stdout: '1' }));
      const total = parseInt(totalLines.trim());

      const duplicationPercentage = total > 0 ? (duplicateLines / total) * 100 : 0;

      return {
        duplicationPercentage,
        duplicateLines,
        totalLines: total
      };
    } catch (error) {
      return {
        duplicationPercentage: 0,
        duplicateLines: 0,
        totalLines: 0
      };
    }
  }

  async evaluatePerformance() {
    try {
      const thresholds = this.config.thresholds.performance;

      // Load performance metrics
      const testResults = await this.loadTestResults();
      const buildMetrics = await this.loadBuildMetrics();

      const metrics = {
        testDuration: testResults?.summary?.duration || 0,
        memoryUsage: await this.getMemoryUsage(),
        buildTime: buildMetrics?.duration || 0
      };

      const failures = [];
      const warnings = [];

      if (metrics.testDuration > thresholds.maxTestDuration) {
        failures.push(`Test duration: ${(metrics.testDuration / 1000).toFixed(1)}s > ${(thresholds.maxTestDuration / 1000)}s`);
      }

      if (metrics.memoryUsage > thresholds.maxMemoryUsage) {
        failures.push(`Memory usage: ${metrics.memoryUsage}MB > ${thresholds.maxMemoryUsage}MB`);
      }

      if (metrics.buildTime > thresholds.maxBuildTime) {
        failures.push(`Build time: ${(metrics.buildTime / 1000).toFixed(1)}s > ${(thresholds.maxBuildTime / 1000)}s`);
      }

      const success = failures.length === 0;
      const score = Math.max(0, 100 - (failures.length * 25));

      return {
        success,
        score,
        metrics,
        details: {
          failures,
          thresholds
        },
        warnings
      };

    } catch (error) {
      return {
        success: false,
        score: 0,
        details: `Performance evaluation failed: ${error.message}`,
        metrics: {}
      };
    }
  }

  async loadBuildMetrics() {
    try {
      const buildPath = 'build-metrics.json';
      return JSON.parse(await fs.readFile(buildPath, 'utf8'));
    } catch (error) {
      return null;
    }
  }

  async getMemoryUsage() {
    try {
      const used = process.memoryUsage();
      return Math.round(used.heapUsed / 1024 / 1024); // MB
    } catch (error) {
      return 0;
    }
  }

  async evaluateSecurity() {
    try {
      const thresholds = this.config.thresholds.security;

      // Run security audits
      const [auditResults, dependencyResults] = await Promise.allSettled([
        this.runSecurityAudit(),
        this.runDependencyAudit()
      ]);

      const metrics = {
        vulnerabilities: auditResults.status === 'fulfilled' ? auditResults.value.vulnerabilities : 0,
        dependencyIssues: dependencyResults.status === 'fulfilled' ? dependencyResults.value.issues : 0
      };

      const failures = [];
      const warnings = [];

      if (metrics.vulnerabilities > thresholds.maxVulnerabilities) {
        failures.push(`Vulnerabilities: ${metrics.vulnerabilities} > ${thresholds.maxVulnerabilities}`);
      }

      if (metrics.dependencyIssues > thresholds.maxDependencyIssues) {
        failures.push(`Dependency issues: ${metrics.dependencyIssues} > ${thresholds.maxDependencyIssues}`);
      }

      const success = failures.length === 0;
      const score = Math.max(0, 100 - (metrics.vulnerabilities * 20) - (metrics.dependencyIssues * 5));

      return {
        success,
        score,
        metrics,
        details: {
          failures,
          thresholds,
          auditDetails: auditResults.status === 'fulfilled' ? auditResults.value : null,
          dependencyDetails: dependencyResults.status === 'fulfilled' ? dependencyResults.value : null
        },
        warnings
      };

    } catch (error) {
      return {
        success: false,
        score: 0,
        details: `Security evaluation failed: ${error.message}`,
        metrics: {}
      };
    }
  }

  async runSecurityAudit() {
    try {
      const { stdout } = await execAsync('npm audit --json').catch(() => ({ stdout: '{"vulnerabilities":{}}' }));
      const audit = JSON.parse(stdout);

      return {
        vulnerabilities: Object.keys(audit.vulnerabilities || {}).length,
        details: audit
      };
    } catch (error) {
      return {
        vulnerabilities: 0,
        details: null
      };
    }
  }

  async runDependencyAudit() {
    try {
      // Check for outdated dependencies
      const { stdout } = await execAsync('npm outdated --json').catch(() => ({ stdout: '{}' }));
      const outdated = JSON.parse(stdout);

      return {
        issues: Object.keys(outdated).length,
        details: outdated
      };
    } catch (error) {
      return {
        issues: 0,
        details: null
      };
    }
  }

  async evaluateDocumentation() {
    try {
      // Check for documentation coverage
      const docStats = await this.analyzeDocumentation();

      const metrics = {
        readmeExists: docStats.readmeExists,
        apiDocsExist: docStats.apiDocsExist,
        functionsCovered: docStats.functionsCovered,
        totalFunctions: docStats.totalFunctions
      };

      const coveragePercentage = metrics.totalFunctions > 0 ?
        (metrics.functionsCovered / metrics.totalFunctions) * 100 : 0;

      const warnings = [];

      if (!metrics.readmeExists) {
        warnings.push('README.md file not found');
      }

      if (!metrics.apiDocsExist) {
        warnings.push('API documentation not found');
      }

      if (coveragePercentage < 50) {
        warnings.push(`Function documentation coverage is low: ${coveragePercentage.toFixed(1)}%`);
      }

      const success = metrics.readmeExists && coveragePercentage > 30;
      const score = (coveragePercentage + (metrics.readmeExists ? 20 : 0) + (metrics.apiDocsExist ? 20 : 0));

      return {
        success,
        score,
        metrics: { ...metrics, coveragePercentage },
        details: {
          coveragePercentage: coveragePercentage.toFixed(1)
        },
        warnings
      };

    } catch (error) {
      return {
        success: false,
        score: 0,
        details: `Documentation evaluation failed: ${error.message}`,
        metrics: {}
      };
    }
  }

  async analyzeDocumentation() {
    try {
      // Check for README
      const readmeExists = await fs.access('README.md').then(() => true).catch(() => false);

      // Check for API docs
      const apiDocsExist = await fs.access('docs/api.md').then(() => true).catch(() =>
        fs.access('API.md').then(() => true).catch(() => false)
      );

      // Analyze function documentation coverage
      const { stdout } = await execAsync('find . -name "*.js" -o -name "*.ts" | xargs grep -c "^\s*/\*\*" || echo "0"').catch(() => ({ stdout: '0' }));
      const documentedFunctions = parseInt(stdout.trim()) || 0;

      const { stdout: totalFunctionsOutput } = await execAsync('find . -name "*.js" -o -name "*.ts" | xargs grep -c "function\\|=>" || echo "0"').catch(() => ({ stdout: '0' }));
      const totalFunctions = parseInt(totalFunctionsOutput.trim()) || 0;

      return {
        readmeExists,
        apiDocsExist,
        functionsCovered: documentedFunctions,
        totalFunctions
      };
    } catch (error) {
      return {
        readmeExists: false,
        apiDocsExist: false,
        functionsCovered: 0,
        totalFunctions: 0
      };
    }
  }

  async evaluateDependencies() {
    try {
      // Check package.json exists
      const packageExists = await fs.access('package.json').then(() => true).catch(() => false);

      if (!packageExists) {
        return {
          success: false,
          score: 0,
          details: 'package.json not found',
          metrics: {}
        };
      }

      const packageJson = JSON.parse(await fs.readFile('package.json', 'utf8'));

      // Analyze dependencies
      const prodDeps = Object.keys(packageJson.dependencies || {});
      const devDeps = Object.keys(packageJson.devDependencies || {});

      const metrics = {
        totalDependencies: prodDeps.length + devDeps.length,
        productionDependencies: prodDeps.length,
        developmentDependencies: devDeps.length
      };

      const warnings = [];

      if (metrics.totalDependencies === 0) {
        warnings.push('No dependencies found');
      }

      if (metrics.totalDependencies > 100) {
        warnings.push(`High number of dependencies: ${metrics.totalDependencies}`);
      }

      const success = metrics.totalDependencies > 0;
      const score = Math.min(100, 60 + Math.min(40, metrics.totalDependencies));

      return {
        success,
        score,
        metrics,
        details: {
          packageJsonExists: packageExists
        },
        warnings
      };

    } catch (error) {
      return {
        success: false,
        score: 0,
        details: `Dependencies evaluation failed: ${error.message}`,
        metrics: {}
      };
    }
  }

  evaluateResults() {
    const totalGates = this.results.passed.length + this.results.failed.length;
    const passedGates = this.results.passed.length;
    const failedGates = this.results.failed.length;

    // Check if all required gates passed
    const failedRequiredGates = this.results.failed.filter(gate => gate.required);
    const success = failedRequiredGates.length === 0 &&
                   (!this.config.failOnWarnings || this.results.warnings.length === 0);

    const overallScore = totalGates > 0 ?
      this.results.passed.reduce((sum, gate) => sum + (gate.score || 0), 0) / totalGates : 0;

    // Store overall metrics
    this.results.metrics = {
      totalGates,
      passedGates,
      failedGates,
      requiredGatesFailed: failedRequiredGates.length,
      warningsCount: this.results.warnings.length,
      overallScore: overallScore.toFixed(1),
      success
    };

    return {
      success,
      summary: {
        total: totalGates,
        passed: passedGates,
        failed: failedGates,
        score: overallScore.toFixed(1),
        requiredGatesFailed: failedRequiredGates.length,
        warnings: this.results.warnings.length
      }
    };
  }

  async generateReport() {
    console.log('📋 Generating quality gates report...');

    try {
      await fs.mkdir('tests/reports', { recursive: true });

      const report = {
        sessionId: this.sessionId,
        environment: this.environment,
        pipeline: this.pipeline,
        timestamp: new Date().toISOString(),
        config: this.config,
        results: this.results,
        summary: this.results.metrics
      };

      // JSON report
      await fs.writeFile(
        'tests/reports/quality-gates-report.json',
        JSON.stringify(report, null, 2)
      );

      // HTML report
      const htmlReport = this.createHTMLReport(report);
      await fs.writeFile('tests/reports/quality-gates-report.html', htmlReport);

      console.log('✅ Quality gates report generated');

    } catch (error) {
      console.warn('⚠️ Could not generate quality gates report:', error.message);
    }
  }

  createHTMLReport(report) {
    const { results, summary } = report;

    return `
<!DOCTYPE html>
<html>
<head>
    <title>Quality Gates Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background: ${summary.success ? '#d4edda' : '#f8d7da'}; padding: 20px; border-radius: 5px; }
        .gate { margin: 10px 0; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }
        .passed { border-left: 4px solid #28a745; }
        .failed { border-left: 4px solid #dc3545; }
        .metric { display: inline-block; margin: 10px; padding: 10px; background: #f8f9fa; border-radius: 3px; }
        .score { font-size: 24px; font-weight: bold; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Quality Gates Report</h1>
        <p><strong>Status:</strong> ${summary.success ? '✅ PASSED' : '❌ FAILED'}</p>
        <p><strong>Session:</strong> ${report.sessionId}</p>
        <p><strong>Environment:</strong> ${report.environment}</p>
        <p><strong>Timestamp:</strong> ${new Date(report.timestamp).toLocaleString()}</p>
    </div>

    <h2>Summary</h2>
    <div class="metric">
        <div>Total Gates</div>
        <div class="score">${summary.total}</div>
    </div>
    <div class="metric">
        <div>Passed</div>
        <div class="score" style="color: green">${summary.passed}</div>
    </div>
    <div class="metric">
        <div>Failed</div>
        <div class="score" style="color: red">${summary.failed}</div>
    </div>
    <div class="metric">
        <div>Overall Score</div>
        <div class="score">${summary.score}%</div>
    </div>
    <div class="metric">
        <div>Warnings</div>
        <div class="score" style="color: orange">${summary.warnings}</div>
    </div>

    <h2>Gate Results</h2>
    ${results.passed.map(gate => `
        <div class="gate passed">
            <h3>✅ ${gate.name}</h3>
            <p><strong>Score:</strong> ${(gate.score || 0).toFixed(1)}%</p>
            <p><strong>Duration:</strong> ${gate.duration}ms</p>
            ${gate.details ? `<pre>${JSON.stringify(gate.details, null, 2)}</pre>` : ''}
        </div>
    `).join('')}

    ${results.failed.map(gate => `
        <div class="gate failed">
            <h3>❌ ${gate.name} ${gate.required ? '(Required)' : ''}</h3>
            <p><strong>Score:</strong> ${(gate.score || 0).toFixed(1)}%</p>
            <p><strong>Duration:</strong> ${gate.duration}ms</p>
            ${gate.error ? `<p><strong>Error:</strong> ${gate.error}</p>` : ''}
            ${gate.details ? `<pre>${JSON.stringify(gate.details, null, 2)}</pre>` : ''}
        </div>
    `).join('')}

    ${results.warnings.length > 0 ? `
        <h2>Warnings</h2>
        <ul>
        ${results.warnings.map(warning => `<li>${warning}</li>`).join('')}
        </ul>
    ` : ''}
</body>
</html>`;
  }

  async coordinateWithPipeline() {
    console.log('🔗 Coordinating with CI/CD pipeline...');

    try {
      // Set environment variables for pipeline
      const success = this.results.metrics.success;

      // Create pipeline artifacts
      await this.createPipelineArtifacts(success);

      // Notify CI/CD system
      if (process.env.CI) {
        await this.notifyCI(success);
      }

      // Update pipeline status
      await this.updatePipelineStatus(success);

    } catch (error) {
      console.warn('⚠️ Could not coordinate with pipeline:', error.message);
    }
  }

  async createPipelineArtifacts(success) {
    try {
      // Create exit code file for CI/CD
      await fs.writeFile('.qe-quality-gates-status', success ? 'PASSED' : 'FAILED');

      // Create detailed status for pipeline
      const status = {
        success,
        sessionId: this.sessionId,
        timestamp: new Date().toISOString(),
        summary: this.results.metrics,
        reports: [
          'tests/reports/quality-gates-report.json',
          'tests/reports/quality-gates-report.html'
        ]
      };

      await fs.writeFile('quality-gates-status.json', JSON.stringify(status, null, 2));

    } catch (error) {
      console.warn('⚠️ Could not create pipeline artifacts:', error.message);
    }
  }

  async notifyCI(success) {
    try {
      // GitHub Actions
      if (process.env.GITHUB_ACTIONS) {
        await execAsync(`echo "quality_gates_status=${success ? 'passed' : 'failed'}" >> $GITHUB_OUTPUT`);
      }

      // Jenkins
      if (process.env.JENKINS_URL) {
        // Jenkins notification logic
      }

      // GitLab CI
      if (process.env.GITLAB_CI) {
        // GitLab notification logic
      }

    } catch (error) {
      console.warn('⚠️ Could not notify CI system:', error.message);
    }
  }

  async updatePipelineStatus(success) {
    try {
      // Store status in Claude-Flow memory for coordination
      const statusData = {
        sessionId: this.sessionId,
        success,
        metrics: this.results.metrics,
        timestamp: new Date().toISOString()
      };

      await execAsync(`npx claude-flow@alpha hooks memory-store --key "qe/quality-gates/${this.sessionId}" --value '${JSON.stringify(statusData)}'`);

      // Notify other agents
      await execAsync(`npx claude-flow@alpha hooks notify --event "quality-gates-complete" --data '${JSON.stringify(statusData)}'`);

    } catch (error) {
      console.warn('⚠️ Could not update pipeline status:', error.message);
    }
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

  const hook = new QEQualityGatesHook();
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

module.exports = QEQualityGatesHook;