import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs-extra';
import * as path from 'path';
import { AnalyzeOptions } from '../../types';

export class AnalyzeCommand {
  static async execute(target: string, options: AnalyzeOptions): Promise<void> {
    console.log(chalk.blue.bold('\n📊 Analyzing Test Results and Quality Metrics\n'));

    try {
      const spinner = ora('Initializing analysis...').start();

      // Validate inputs
      await this.validateInputs(target, options);

      spinner.text = 'Loading test data...';

      // Load test execution data
      const testData = await this.loadTestData();

      spinner.text = 'Performing analysis...';

      // Perform specific analysis based on target
      let analysisResults;
      switch (target) {
        case 'coverage':
          analysisResults = await this.analyzeCoverage(testData, options);
          break;
        case 'quality':
          analysisResults = await this.analyzeQuality(testData, options);
          break;
        case 'trends':
          analysisResults = await this.analyzeTrends(testData, options);
          break;
        case 'gaps':
          analysisResults = await this.analyzeGaps(testData, options);
          break;
        default:
          analysisResults = await this.analyzeAll(testData, options);
      }

      spinner.text = 'Generating recommendations...';

      // Generate recommendations
      const recommendations = await this.generateRecommendations(analysisResults, options);

      spinner.text = 'Creating reports...';

      // Generate reports
      await this.generateReports(analysisResults, recommendations, options);

      spinner.succeed(chalk.green('Analysis completed successfully!'));

      // Display analysis summary
      this.displayAnalysisSummary(analysisResults, recommendations, options);

      // Store analysis results in coordination
      await this.storeAnalysisResults(analysisResults, recommendations);

    } catch (error: any) {
      console.error(chalk.red('❌ Analysis failed:'), error.message);
      if (options.verbose) {
        console.error(chalk.gray(error.stack));
      }
      process.exit(1);
    }
  }

  private static async validateInputs(target: string, options: AnalyzeOptions): Promise<void> {
    const validTargets = ['coverage', 'quality', 'trends', 'gaps'];
    if (!validTargets.includes(target)) {
      throw new Error(`Invalid target '${target}'. Must be one of: ${validTargets.join(', ')}`);
    }

    const validFormats = ['json', 'html', 'csv'];
    if (!validFormats.includes(options.format)) {
      throw new Error(`Invalid format '${options.format}'. Must be one of: ${validFormats.join(', ')}`);
    }

    const threshold = parseInt(options.threshold);
    if (threshold < 0 || threshold > 100) {
      throw new Error('Threshold must be between 0 and 100');
    }

    // Check if reports directory exists
    if (!await fs.pathExists('.agentic-qe/reports')) {
      throw new Error('No test execution reports found. Run tests first: agentic-qe run tests');
    }
  }

  private static async loadTestData(): Promise<any> {
    const reportsDir = '.agentic-qe/reports';
    const reportFiles = await fs.readdir(reportsDir);

    const executionFiles = reportFiles
      .filter(file => file.startsWith('execution-') && file.endsWith('.json'))
      .sort()
      .reverse(); // Most recent first

    if (executionFiles.length === 0) {
      throw new Error('No test execution reports found');
    }

    const testData: any = {
      latest: null,
      history: [],
      coverage: [],
      quality: []
    };

    // Load latest execution
    const latestFile = path.join(reportsDir, executionFiles[0]);
    testData.latest = await fs.readJson(latestFile);

    // Load historical data (up to 30 most recent)
    for (const file of executionFiles.slice(0, 30)) {
      const filePath = path.join(reportsDir, file);
      const data: any = await fs.readJson(filePath);
      testData.history.push(data);
    }

    // Load coverage data if available
    const coverageFiles = reportFiles.filter(file => file.startsWith('coverage-'));
    for (const file of coverageFiles.slice(0, 10)) {
      const filePath = path.join(reportsDir, file);
      if (await fs.pathExists(filePath)) {
        const coverage: any = await fs.readJson(filePath);
        testData.coverage.push(coverage);
      }
    }

    return testData;
  }

  private static async analyzeCoverage(testData: any, options: AnalyzeOptions): Promise<any> {
    const analysis = {
      type: 'coverage',
      timestamp: new Date().toISOString(),
      current: {
        overall: testData.latest?.coverage?.overall || 0,
        details: testData.latest?.coverage?.details || {}
      },
      trends: {
        direction: 'stable',
        change: 0,
        period: options.period
      },
      gaps: [],
      recommendations: []
    };

    // Calculate coverage trends
    if (testData.history.length > 1) {
      const recentCoverage = testData.history.slice(0, 5).map((h: any) => h.coverage?.overall || 0);
      const avgRecent = recentCoverage.reduce((sum: number, c: number) => sum + c, 0) / recentCoverage.length;
      const olderCoverage = testData.history.slice(5, 10).map((h: any) => h.coverage?.overall || 0);
      const avgOlder = olderCoverage.length > 0
        ? olderCoverage.reduce((sum: number, c: number) => sum + c, 0) / olderCoverage.length
        : avgRecent;

      analysis.trends.change = avgRecent - avgOlder;
      analysis.trends.direction = analysis.trends.change > 1 ? 'improving' :
                                  analysis.trends.change < -1 ? 'declining' : 'stable';
    }

    // Identify coverage gaps if requested
    if (options.gaps) {
      (analysis as any).gaps = await this.identifyCoverageGaps(testData);
    }

    // Add threshold-based alerts
    const threshold = parseInt(options.threshold);
    if (analysis.current.overall < threshold) {
      (analysis.recommendations as any[]).push({
        type: 'coverage_below_threshold',
        priority: 'high',
        message: `Coverage ${analysis.current.overall.toFixed(1)}% is below threshold ${threshold}%`,
        actions: ['Generate additional tests', 'Review uncovered code paths']
      });
    }

    return analysis;
  }

  private static async analyzeQuality(testData: any, options: AnalyzeOptions): Promise<any> {
    const analysis = {
      type: 'quality',
      timestamp: new Date().toISOString(),
      metrics: {
        testReliability: 0,
        passRate: 0,
        flakyTests: 0,
        testMaintainability: 0,
        qualityScore: 0
      },
      trends: {
        direction: 'stable',
        period: options.period,
        changes: {}
      },
      issues: [],
      recommendations: []
    };

    // Calculate quality metrics from latest data
    const latest = testData.latest;
    if (latest?.summary) {
      analysis.metrics.passRate = latest.summary.total > 0
        ? (latest.summary.passed / latest.summary.total) * 100
        : 0;

      // Analyze test reliability over time
      const reliabilityData = testData.history.slice(0, 10).map((h: any) => ({
        total: h.summary?.total || 0,
        passed: h.summary?.passed || 0,
        failed: h.summary?.failed || 0
      }));

      analysis.metrics.testReliability = this.calculateTestReliability(reliabilityData);
      analysis.metrics.flakyTests = this.identifyFlakyTests(reliabilityData);
    }

    // Calculate composite quality score
    analysis.metrics.qualityScore = this.calculateQualityScore(analysis.metrics);

    // Identify quality issues
    (analysis as any).issues = await this.identifyQualityIssues(testData, analysis.metrics) as any[];

    return analysis;
  }

  private static async analyzeTrends(testData: any, options: AnalyzeOptions): Promise<any> {
    const analysis = {
      type: 'trends',
      timestamp: new Date().toISOString(),
      period: options.period,
      trends: {
        coverage: [] as any[],
        passRate: [] as any[],
        testCount: [] as any[],
        executionTime: [] as any[]
      },
      insights: [] as any[],
      predictions: [] as any[]
    };

    // Analyze trends over time
    const historicalData = testData.history.slice(0, 20); // Last 20 executions

    for (const data of historicalData) {
      const timestamp = data.timestamp;

      analysis.trends.coverage.push({
        timestamp,
        value: data.coverage?.overall || 0
      });

      analysis.trends.passRate.push({
        timestamp,
        value: data.summary?.total > 0 ? (data.summary.passed / data.summary.total) * 100 : 0
      });

      analysis.trends.testCount.push({
        timestamp,
        value: data.summary?.total || 0
      });

      analysis.trends.executionTime.push({
        timestamp,
        value: data.summary?.duration || 0
      });
    }

    // Generate insights
    analysis.insights = this.generateTrendInsights(analysis.trends) as any[];

    // Simple predictions based on trends
    analysis.predictions = this.generatePredictions(analysis.trends) as any[];

    return analysis;
  }

  private static async analyzeGaps(testData: any, options: AnalyzeOptions): Promise<any> {
    const analysis = {
      type: 'gaps',
      timestamp: new Date().toISOString(),
      coverageGaps: [] as any[],
      testingGaps: [] as any[],
      qualityGaps: [] as any[],
      recommendations: [] as any[]
    };

    // Identify coverage gaps
    analysis.coverageGaps = await this.identifyCoverageGaps(testData);

    // Identify testing gaps
    analysis.testingGaps = await this.identifyTestingGaps();

    // Identify quality gaps
    analysis.qualityGaps = await this.identifyQualityGaps(testData);

    return analysis;
  }

  private static async analyzeAll(testData: any, options: AnalyzeOptions): Promise<any> {
    const coverage = await this.analyzeCoverage(testData, options);
    const quality = await this.analyzeQuality(testData, options);
    const trends = await this.analyzeTrends(testData, options);
    const gaps = await this.analyzeGaps(testData, options);

    return {
      type: 'comprehensive',
      timestamp: new Date().toISOString(),
      coverage,
      quality,
      trends,
      gaps,
      summary: {
        overallScore: this.calculateOverallScore([coverage, quality, trends, gaps]),
        criticalIssues: this.identifyCriticalIssues([coverage, quality, trends, gaps]) as any[],
        topRecommendations: this.prioritizeRecommendations([coverage, quality, trends, gaps])
      }
    };
  }

  private static async identifyCoverageGaps(testData: any): Promise<any[]> {
    const gaps: any[] = [];

    // Check for missing test types
    const testTypes = ['unit', 'integration', 'e2e', 'performance', 'security'];
    const testDirs = await Promise.all(
      testTypes.map(async type => ({
        type,
        exists: await fs.pathExists(`tests/${type}`)
      }))
    );

    for (const { type, exists } of testDirs) {
      if (!exists) {
        gaps.push({
          type: 'missing_test_type',
          category: type,
          severity: type === 'unit' ? 'high' : 'medium',
          description: `No ${type} tests found`,
          suggestion: `Create ${type} test directory and generate tests`
        });
      }
    }

    // Check coverage by file (if coverage details available)
    const coverageDetails = testData.latest?.coverage?.details || {};
    Object.entries(coverageDetails).forEach(([file, coverage]: [string, any]) => {
      if (coverage < 80) {
        gaps.push({
          type: 'low_file_coverage',
          file,
          coverage,
          severity: coverage < 50 ? 'high' : 'medium',
          description: `Low coverage in ${file}: ${coverage}%`,
          suggestion: 'Add more comprehensive tests for this file'
        });
      }
    });

    return gaps;
  }

  private static async identifyTestingGaps(): Promise<any[]> {
    const gaps = [];

    // Check for test configuration files
    const configFiles = [
      { file: 'jest.config.js', type: 'Jest configuration' },
      { file: '.agentic-qe/config/jest.config.json', type: 'QE Jest configuration' },
      { file: 'cypress.json', type: 'Cypress configuration' },
      { file: 'playwright.config.js', type: 'Playwright configuration' }
    ];

    for (const { file, type } of configFiles) {
      if (!await fs.pathExists(file)) {
        gaps.push({
          type: 'missing_config',
          file,
          severity: 'low',
          description: `Missing ${type}`,
          suggestion: `Consider adding ${file} for better test configuration`
        });
      }
    }

    return gaps;
  }

  private static async identifyQualityGaps(testData: any): Promise<any[]> {
    const gaps: any[] = [];
    const latest = testData.latest;

    if (!latest) return gaps;

    // Check for quality issues
    if (latest.summary?.failed > 0) {
      gaps.push({
        type: 'failing_tests',
        count: latest.summary.failed,
        severity: 'high',
        description: `${latest.summary.failed} tests are failing`,
        suggestion: 'Fix failing tests to improve quality'
      });
    }

    if (latest.errors?.length > 0) {
      gaps.push({
        type: 'test_errors',
        count: latest.errors.length,
        severity: 'medium',
        description: `${latest.errors.length} test execution errors`,
        suggestion: 'Review and fix test execution errors'
      });
    }

    return gaps;
  }

  private static calculateTestReliability(reliabilityData: any[]): number {
    if (reliabilityData.length === 0) return 0;

    const consistentResults = reliabilityData.filter((data, index) => {
      if (index === 0) return true;
      const prev = reliabilityData[index - 1];
      const passRateDiff = Math.abs(
        (data.passed / data.total) - (prev.passed / prev.total)
      );
      return passRateDiff < 0.1; // Less than 10% variation
    });

    return (consistentResults.length / reliabilityData.length) * 100;
  }

  private static identifyFlakyTests(reliabilityData: any[]): number {
    // Simple heuristic: if pass rate varies significantly, there might be flaky tests
    const passRates = reliabilityData.map(d => d.total > 0 ? d.passed / d.total : 0);
    const variance = this.calculateVariance(passRates);
    return variance > 0.05 ? Math.floor(variance * 100) : 0;
  }

  private static calculateVariance(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
    return squaredDiffs.reduce((sum, diff) => sum + diff, 0) / values.length;
  }

  private static calculateQualityScore(metrics: any): number {
    const weights = {
      passRate: 0.4,
      testReliability: 0.3,
      coverage: 0.2,
      flakyTests: 0.1
    };

    const score =
      metrics.passRate * weights.passRate +
      metrics.testReliability * weights.testReliability +
      (metrics.coverage || 0) * weights.coverage +
      (100 - metrics.flakyTests) * weights.flakyTests;

    return Math.max(0, Math.min(100, score));
  }

  private static async identifyQualityIssues(testData: any, metrics: any): Promise<any[]> {
    const issues = [];

    if (metrics.passRate < 90) {
      issues.push({
        type: 'low_pass_rate',
        severity: metrics.passRate < 80 ? 'high' : 'medium',
        value: metrics.passRate,
        description: `Test pass rate is ${metrics.passRate.toFixed(1)}%`,
        impact: 'Quality confidence reduced'
      });
    }

    if (metrics.testReliability < 95) {
      issues.push({
        type: 'unreliable_tests',
        severity: 'medium',
        value: metrics.testReliability,
        description: `Test reliability is ${metrics.testReliability.toFixed(1)}%`,
        impact: 'Inconsistent test results'
      });
    }

    if (metrics.flakyTests > 5) {
      issues.push({
        type: 'flaky_tests',
        severity: 'high',
        value: metrics.flakyTests,
        description: `${metrics.flakyTests} potentially flaky tests detected`,
        impact: 'Reduced confidence in test results'
      });
    }

    return issues;
  }

  private static generateTrendInsights(trends: any): any[] {
    const insights = [];

    // Coverage trend
    const coverageTrend = this.calculateTrend(trends.coverage);
    if (coverageTrend.direction !== 'stable') {
      insights.push({
        type: 'coverage_trend',
        direction: coverageTrend.direction,
        change: coverageTrend.change,
        description: `Coverage is ${coverageTrend.direction} by ${Math.abs(coverageTrend.change).toFixed(1)}%`
      });
    }

    // Pass rate trend
    const passRateTrend = this.calculateTrend(trends.passRate);
    if (passRateTrend.direction !== 'stable') {
      insights.push({
        type: 'pass_rate_trend',
        direction: passRateTrend.direction,
        change: passRateTrend.change,
        description: `Pass rate is ${passRateTrend.direction} by ${Math.abs(passRateTrend.change).toFixed(1)}%`
      });
    }

    // Execution time trend
    const timeTrend = this.calculateTrend(trends.executionTime);
    if (timeTrend.direction !== 'stable' && Math.abs(timeTrend.change) > 1000) {
      insights.push({
        type: 'execution_time_trend',
        direction: timeTrend.direction === 'improving' ? 'decreasing' : 'increasing',
        change: timeTrend.change,
        description: `Test execution time is ${timeTrend.direction === 'improving' ? 'decreasing' : 'increasing'}`
      });
    }

    return insights;
  }

  private static calculateTrend(dataPoints: any[]): any {
    if (dataPoints.length < 3) {
      return { direction: 'stable', change: 0 };
    }

    const values = dataPoints.map(point => point.value);
    const recentAvg = values.slice(0, Math.floor(values.length / 2)).reduce((sum, val) => sum + val, 0) / Math.floor(values.length / 2);
    const olderAvg = values.slice(Math.floor(values.length / 2)).reduce((sum, val) => sum + val, 0) / (values.length - Math.floor(values.length / 2));

    const change = recentAvg - olderAvg;
    const direction = Math.abs(change) < 1 ? 'stable' : change > 0 ? 'improving' : 'declining';

    return { direction, change };
  }

  private static generatePredictions(trends: any): any[] {
    const predictions = [];

    // Simple linear prediction for coverage
    const coverageTrend = this.calculateTrend(trends.coverage);
    if (coverageTrend.direction !== 'stable') {
      const predicted = trends.coverage[0]?.value + (coverageTrend.change * 2);
      predictions.push({
        type: 'coverage',
        timeframe: '2 cycles',
        predicted: Math.max(0, Math.min(100, predicted)),
        confidence: 'medium',
        description: `Coverage predicted to be ${predicted.toFixed(1)}% in 2 execution cycles`
      });
    }

    return predictions;
  }

  private static calculateOverallScore(analyses: any[]): number {
    const scores = analyses
      .filter(a => a.metrics?.qualityScore)
      .map(a => a.metrics.qualityScore);

    return scores.length > 0
      ? scores.reduce((sum, score) => sum + score, 0) / scores.length
      : 0;
  }

  private static identifyCriticalIssues(analyses: any[]): any[] {
    const criticalIssues: any[] = [];

    analyses.forEach(analysis => {
      if (analysis.issues) {
        const critical = analysis.issues.filter((issue: any) => issue.severity === 'high');
        criticalIssues.push(...critical);
      }
      if (analysis.gaps) {
        const critical = analysis.gaps.filter((gap: any) => gap.severity === 'high');
        criticalIssues.push(...critical);
      }
    });

    return criticalIssues;
  }

  private static prioritizeRecommendations(analyses: any[]): any[] {
    const allRecommendations: any[] = [];

    analyses.forEach(analysis => {
      if (analysis.recommendations) {
        allRecommendations.push(...analysis.recommendations);
      }
    });

    // Sort by priority
    return allRecommendations
      .sort((a, b) => {
        const priorityOrder = { 'high': 3, 'medium': 2, 'low': 1 };
        return (priorityOrder[b.priority as keyof typeof priorityOrder] || 0) - (priorityOrder[a.priority as keyof typeof priorityOrder] || 0);
      })
      .slice(0, 5); // Top 5 recommendations
  }

  private static async generateRecommendations(analysis: any, options: AnalyzeOptions): Promise<any[]> {
    const recommendations = [];

    // Coverage-specific recommendations
    if (analysis.type === 'coverage' || analysis.coverage) {
      const coverageData = analysis.coverage || analysis.current;

      if (coverageData.overall < 80) {
        recommendations.push({
          type: 'improve_coverage',
          priority: 'high',
          title: 'Improve Test Coverage',
          description: `Current coverage (${coverageData.overall.toFixed(1)}%) is below recommended 80%`,
          actions: [
            'Run: agentic-qe generate tests --coverage-target 85',
            'Focus on uncovered code paths',
            'Add integration tests for complex flows'
          ],
          estimatedImpact: 'High'
        });
      }
    }

    // Quality-specific recommendations
    if (analysis.type === 'quality' || analysis.quality) {
      const qualityData = analysis.quality || analysis;

      if (qualityData.metrics?.flakyTests > 0) {
        recommendations.push({
          type: 'fix_flaky_tests',
          priority: 'medium',
          title: 'Address Flaky Tests',
          description: `${qualityData.metrics.flakyTests} potentially flaky tests detected`,
          actions: [
            'Review test execution logs',
            'Add proper test isolation',
            'Check for timing dependencies'
          ],
          estimatedImpact: 'Medium'
        });
      }
    }

    // Gap-specific recommendations
    if (analysis.gaps) {
      analysis.gaps.forEach((gap: any) => {
        if (gap.severity === 'high') {
          recommendations.push({
            type: 'address_gap',
            priority: 'high',
            title: `Address ${gap.type}`,
            description: gap.description,
            actions: [gap.suggestion],
            estimatedImpact: 'High'
          });
        }
      });
    }

    return recommendations;
  }

  private static async generateReports(analysis: any, recommendations: any[], options: AnalyzeOptions): Promise<void> {
    const reportsDir = '.agentic-qe/reports';
    await fs.ensureDir(reportsDir);

    const timestamp = new Date().toISOString().replace(/:/g, '-');
    const reportData = {
      analysis,
      recommendations,
      metadata: {
        generated: new Date().toISOString(),
        format: options.format,
        options
      }
    };

    // Generate JSON report
    if (options.format === 'json' || options.format === 'all') {
      const jsonFile = `${reportsDir}/analysis-${analysis.type}-${timestamp}.json`;
      await fs.writeJson(jsonFile, reportData, { spaces: 2 });
    }

    // Generate HTML report
    if (options.format === 'html' || options.format === 'all') {
      const htmlContent = this.generateHtmlReport(reportData);
      const htmlFile = `${reportsDir}/analysis-${analysis.type}-${timestamp}.html`;
      await fs.writeFile(htmlFile, htmlContent);
    }

    // Generate CSV for trends
    if (options.format === 'csv' && analysis.trends) {
      const csvContent = this.generateCsvReport(analysis.trends);
      const csvFile = `${reportsDir}/trends-${timestamp}.csv`;
      await fs.writeFile(csvFile, csvContent);
    }
  }

  private static generateHtmlReport(reportData: any): string {
    const { analysis, recommendations } = reportData;

    return `<!DOCTYPE html>
<html>
<head>
    <title>Agentic QE Analysis Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background: #f0f8ff; padding: 20px; border-radius: 5px; }
        .section { margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }
        .metric { display: inline-block; margin: 10px; padding: 10px; background: #f9f9f9; border-radius: 3px; }
        .high { color: #d9534f; }
        .medium { color: #f0ad4e; }
        .low { color: #5bc0de; }
        .recommendation { margin: 10px 0; padding: 10px; background: #dff0d8; border-radius: 3px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Agentic QE Analysis Report</h1>
        <p>Generated: ${reportData.metadata.generated}</p>
        <p>Type: ${analysis.type}</p>
    </div>

    ${analysis.current ? `
    <div class="section">
        <h2>Current Metrics</h2>
        <div class="metric">Coverage: ${analysis.current.overall.toFixed(1)}%</div>
        ${analysis.metrics ? `
        <div class="metric">Pass Rate: ${analysis.metrics.passRate.toFixed(1)}%</div>
        <div class="metric">Quality Score: ${analysis.metrics.qualityScore.toFixed(1)}</div>
        ` : ''}
    </div>
    ` : ''}

    ${recommendations.length > 0 ? `
    <div class="section">
        <h2>Recommendations</h2>
        ${recommendations.map((rec: any) => `
        <div class="recommendation">
            <h3 class="${rec.priority}">${rec.title}</h3>
            <p>${rec.description}</p>
            <ul>
                ${rec.actions.map((action: string) => `<li>${action}</li>`).join('')}
            </ul>
        </div>
        `).join('')}
    </div>
    ` : ''}

    <div class="section">
        <h2>Raw Data</h2>
        <pre>${JSON.stringify(analysis, null, 2)}</pre>
    </div>
</body>
</html>`;
  }

  private static generateCsvReport(trends: any): string {
    let csv = 'Timestamp,Coverage,PassRate,TestCount,ExecutionTime\n';

    const maxLength = Math.max(
      trends.coverage?.length || 0,
      trends.passRate?.length || 0,
      trends.testCount?.length || 0,
      trends.executionTime?.length || 0
    );

    for (let i = 0; i < maxLength; i++) {
      const timestamp = trends.coverage?.[i]?.timestamp || '';
      const coverage = trends.coverage?.[i]?.value || '';
      const passRate = trends.passRate?.[i]?.value || '';
      const testCount = trends.testCount?.[i]?.value || '';
      const executionTime = trends.executionTime?.[i]?.value || '';

      csv += `${timestamp},${coverage},${passRate},${testCount},${executionTime}\n`;
    }

    return csv;
  }

  private static displayAnalysisSummary(analysis: any, recommendations: any[], options: AnalyzeOptions): void {
    console.log(chalk.yellow('\n📊 Analysis Summary:'));
    console.log(chalk.gray(`  Type: ${analysis.type}`));
    console.log(chalk.gray(`  Timestamp: ${analysis.timestamp}`));

    // Display key metrics based on analysis type
    if (analysis.current) {
      console.log(chalk.gray(`  Coverage: ${analysis.current.overall.toFixed(1)}%`));
    }

    if (analysis.metrics) {
      console.log(chalk.gray(`  Pass Rate: ${analysis.metrics.passRate.toFixed(1)}%`));
      console.log(chalk.gray(`  Quality Score: ${analysis.metrics.qualityScore.toFixed(1)}`));
    }

    if (analysis.trends?.direction) {
      console.log(chalk.gray(`  Trend: ${analysis.trends.direction}`));
    }

    // Display critical issues
    const criticalIssues = analysis.issues?.filter((issue: any) => issue.severity === 'high') || [];
    if (criticalIssues.length > 0) {
      console.log(chalk.red('\n🚨 Critical Issues:'));
      criticalIssues.forEach((issue: any) => {
        console.log(chalk.red(`  • ${issue.description}`));
      });
    }

    // Display top recommendations
    if (recommendations.length > 0) {
      console.log(chalk.yellow('\n💡 Top Recommendations:'));
      recommendations.slice(0, 3).forEach((rec, index) => {
        console.log(chalk.gray(`  ${index + 1}. ${rec.title}`));
        console.log(chalk.gray(`     ${rec.description}`));
      });
    }

    console.log(chalk.yellow('\n📁 Reports Generated:'));
    console.log(chalk.gray(`  Format: ${options.format}`));
    console.log(chalk.gray(`  Location: .agentic-qe/reports/`));

    console.log(chalk.yellow('\n💡 Next Steps:'));
    if (recommendations.length > 0) {
      console.log(chalk.gray('  1. Review and implement top recommendations'));
      console.log(chalk.gray('  2. Re-run analysis after improvements'));
    }
    console.log(chalk.gray('  3. Monitor trends over time for continuous improvement'));
  }

  private static async storeAnalysisResults(analysis: any, recommendations: any[]): Promise<void> {
    const summary = {
      type: analysis.type,
      timestamp: analysis.timestamp,
      metrics: analysis.metrics || analysis.current,
      issues: (analysis.issues || []).length,
      recommendations: recommendations.length,
      status: 'completed'
    };

    // Store in coordination memory
    const coordinationScript = `
npx claude-flow@alpha memory store --key "agentic-qe/analysis/latest" --value '${JSON.stringify(summary)}'
npx claude-flow@alpha hooks notify --message "Analysis completed: ${analysis.type} analysis with ${recommendations.length} recommendations"
`;

    await fs.writeFile('.agentic-qe/scripts/store-analysis-results.sh', coordinationScript);
    await fs.chmod('.agentic-qe/scripts/store-analysis-results.sh', '755');
  }
}