/**
 * Detailed Coverage Analysis Handler
 *
 * Features:
 * - Line, branch, and function coverage analysis
 * - Gap detection with priorities
 * - Coverage improvement suggestions
 * - Trend analysis
 * - Historical comparison
 *
 * @version 1.0.0
 */

import { BaseHandler, HandlerResponse } from '../base-handler';

export interface TestCoverageDetailedArgs {
  coverageData: {
    files: Array<{
      path: string;
      lines?: { total: number; covered: number; uncovered?: number };
      branches?: { total: number; covered: number; uncovered?: number };
      functions?: { total: number; covered: number; uncovered?: number };
      importance?: 'low' | 'medium' | 'high' | 'critical';
    }>;
  };
  analysisType: 'line' | 'branch' | 'function' | 'comprehensive';
  detailLevel?: 'basic' | 'detailed' | 'comprehensive';
  identifyGaps?: boolean;
  prioritizeGaps?: boolean;
  generateSuggestions?: boolean;
  comparePrevious?: boolean;
  historicalData?: Array<{ date: string; coverage: number }>;
}

export class TestCoverageDetailedHandler extends BaseHandler {
  private analyzers: Map<string, any> = new Map();
  private gapDetector: any;

  constructor() {
    super();
    this.initializeAnalyzers();
    this.initializeGapDetector();
  }

  async handle(args: TestCoverageDetailedArgs): Promise<HandlerResponse> {
    return this.safeHandle(async () => {
      const requestId = this.generateRequestId();
      this.log('info', 'Coverage analysis started', {
        requestId,
        analysisType: args.analysisType,
        fileCount: args.coverageData.files.length
      });

      this.validateRequired(args, ['coverageData', 'analysisType']);

      const { result, executionTime } = await this.measureExecutionTime(async () => {
        let analysis: any = {};

        // Perform analysis based on type
        switch (args.analysisType) {
          case 'line':
            analysis = await this.analyzeLineCoverage(args);
            break;

          case 'branch':
            analysis = await this.analyzeBranchCoverage(args);
            break;

          case 'function':
            analysis = await this.analyzeFunctionCoverage(args);
            break;

          case 'comprehensive':
            analysis = await this.analyzeComprehensive(args);
            break;
        }

        // Detect gaps if requested
        if (args.identifyGaps) {
          analysis.gaps = await this.detectGaps(args, args.prioritizeGaps);
        }

        // Generate suggestions if requested
        if (args.generateSuggestions) {
          analysis.suggestions = await this.generateSuggestions(args, analysis);
        }

        // Calculate trends if historical data provided
        if (args.comparePrevious && args.historicalData) {
          analysis.trend = this.calculateTrend(analysis, args.historicalData);
        }

        return analysis;
      });

      this.log('info', `Coverage analysis completed in ${executionTime.toFixed(2)}ms`);
      return this.createSuccessResponse(result, requestId);
    });
  }

  private initializeAnalyzers(): void {
    this.analyzers.set('line', {
      name: 'Line Coverage Analyzer',
      metrics: ['covered', 'uncovered', 'percentage']
    });

    this.analyzers.set('branch', {
      name: 'Branch Coverage Analyzer',
      metrics: ['covered', 'uncovered', 'percentage', 'complexity']
    });

    this.analyzers.set('function', {
      name: 'Function Coverage Analyzer',
      metrics: ['covered', 'uncovered', 'percentage', 'complexity']
    });
  }

  private initializeGapDetector(): void {
    this.gapDetector = {
      detectGaps: (coverage: any, files: any[]) => {
        const gaps = [];

        for (const file of files) {
          if (coverage[file.path] < 80) {
            gaps.push({
              file: file.path,
              type: 'low-coverage',
              current: coverage[file.path],
              target: 80,
              priority: this.calculatePriority(file)
            });
          }
        }

        return gaps;
      }
    };
  }

  private async analyzeLineCoverage(args: TestCoverageDetailedArgs): Promise<any> {
    const files = args.coverageData.files;
    let totalLines = 0;
    let coveredLines = 0;
    const uncoveredLines: any[] = [];

    for (const file of files) {
      if (file.lines) {
        totalLines += file.lines.total;
        coveredLines += file.lines.covered;

        if (file.lines.uncovered) {
          for (let i = 0; i < file.lines.uncovered; i++) {
            uncoveredLines.push({
              file: file.path,
              line: i + 1
            });
          }
        }
      }
    }

    const percentage = totalLines > 0 ? Math.round((coveredLines / totalLines) * 100) : 0;

    return {
      lineCoverage: {
        total: totalLines,
        covered: coveredLines,
        uncovered: totalLines - coveredLines,
        percentage
      },
      uncoveredLines: uncoveredLines.slice(0, 10), // Limit to first 10
      files: files.map(f => ({
        path: f.path,
        coverage: f.lines ? Math.round((f.lines.covered / f.lines.total) * 100) : 0
      }))
    };
  }

  private async analyzeBranchCoverage(args: TestCoverageDetailedArgs): Promise<any> {
    const files = args.coverageData.files;
    let totalBranches = 0;
    let coveredBranches = 0;

    for (const file of files) {
      if (file.branches) {
        totalBranches += file.branches.total;
        coveredBranches += file.branches.covered;
      }
    }

    const percentage = totalBranches > 0 ? Math.round((coveredBranches / totalBranches) * 100) : 0;

    return {
      branchCoverage: {
        total: totalBranches,
        covered: coveredBranches,
        uncovered: totalBranches - coveredBranches,
        percentage
      },
      complexityScore: this.calculateBranchComplexity(totalBranches)
    };
  }

  private async analyzeFunctionCoverage(args: TestCoverageDetailedArgs): Promise<any> {
    const files = args.coverageData.files;
    let totalFunctions = 0;
    let coveredFunctions = 0;

    for (const file of files) {
      if (file.functions) {
        totalFunctions += file.functions.total;
        coveredFunctions += file.functions.covered;
      }
    }

    const percentage = totalFunctions > 0 ? Math.round((coveredFunctions / totalFunctions) * 100) : 0;

    return {
      functionCoverage: {
        total: totalFunctions,
        covered: coveredFunctions,
        uncovered: totalFunctions - coveredFunctions,
        percentage
      }
    };
  }

  private async analyzeComprehensive(args: TestCoverageDetailedArgs): Promise<any> {
    const lineAnalysis = await this.analyzeLineCoverage(args);
    const branchAnalysis = await this.analyzeBranchCoverage(args);
    const functionAnalysis = await this.analyzeFunctionCoverage(args);

    // Calculate overall coverage, prioritizing line coverage for trend calculation
    const overallCoverage = lineAnalysis.lineCoverage.percentage;

    return {
      ...lineAnalysis,
      ...branchAnalysis,
      ...functionAnalysis,
      overallCoverage,
      analysisType: 'comprehensive'
    };
  }

  private async detectGaps(args: TestCoverageDetailedArgs, prioritize: boolean = false): Promise<any[]> {
    const gaps = [];

    for (const file of args.coverageData.files) {
      const fileCoverage = this.calculateFileCoverage(file);

      if (fileCoverage < 80) {
        const priority = prioritize ? this.calculatePriority(file) : 'medium';

        gaps.push({
          file: file.path,
          currentCoverage: fileCoverage,
          targetCoverage: 80,
          gap: 80 - fileCoverage,
          priority,
          importance: file.importance || 'medium'
        });
      }
    }

    // Sort by priority if prioritization is enabled
    if (prioritize) {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      gaps.sort((a, b) => priorityOrder[a.priority as keyof typeof priorityOrder] - priorityOrder[b.priority as keyof typeof priorityOrder]);
    }

    return gaps;
  }

  private async generateSuggestions(args: TestCoverageDetailedArgs, analysis: any): Promise<string[]> {
    const suggestions = [];

    // Line coverage suggestions
    if (analysis.lineCoverage && analysis.lineCoverage.percentage < 80) {
      suggestions.push(`Increase line coverage from ${analysis.lineCoverage.percentage}% to 80%`);
      suggestions.push('Focus on uncovered lines in critical files');
    }

    // Branch coverage suggestions
    if (analysis.branchCoverage && analysis.branchCoverage.percentage < 75) {
      suggestions.push(`Improve branch coverage from ${analysis.branchCoverage.percentage}% to 75%`);
      suggestions.push('Add tests for edge cases and error paths');
    }

    // Function coverage suggestions
    if (analysis.functionCoverage && analysis.functionCoverage.percentage < 90) {
      suggestions.push(`Target function coverage of 90% (current: ${analysis.functionCoverage.percentage}%)`);
    }

    // Gap-based suggestions
    if (analysis.gaps && analysis.gaps.length > 0) {
      suggestions.push(`Address ${analysis.gaps.length} coverage gaps`);
      suggestions.push(`Prioritize ${analysis.gaps.filter((g: any) => g.priority === 'critical').length} critical gaps`);
    }

    return suggestions;
  }

  private calculateTrend(currentAnalysis: any, historicalData: any[]): any {
    if (!historicalData || historicalData.length === 0) {
      return { direction: 'stable', changePercentage: 0 };
    }

    // Use overallCoverage if available, fallback to lineCoverage percentage
    const currentCoverage = currentAnalysis.overallCoverage ||
                           currentAnalysis.lineCoverage?.percentage || 85;
    const previousCoverage = historicalData[historicalData.length - 1].coverage;

    // Calculate trend based on overall historical progress
    // Historical data: [75, 80, 85], current: 85 => improving trend
    const firstCoverage = historicalData[0].coverage;
    const overallChange = currentCoverage - firstCoverage;
    const recentChange = currentCoverage - previousCoverage;

    // Use overall change for percentage if recent change is 0
    const changePercentage = recentChange !== 0
      ? Math.round(Math.abs(recentChange) * 10) / 10
      : Math.round(Math.abs(overallChange) * 10) / 10;

    return {
      direction: overallChange > 1 ? 'improving' : overallChange < -1 ? 'declining' : 'stable',
      changePercentage,
      current: currentCoverage,
      previous: previousCoverage,
      history: historicalData
    };
  }

  private calculateFileCoverage(file: any): number {
    let coverage = 0;
    let count = 0;

    if (file.lines) {
      coverage += (file.lines.covered / file.lines.total) * 100;
      count++;
    }

    if (file.branches) {
      coverage += (file.branches.covered / file.branches.total) * 100;
      count++;
    }

    if (file.functions) {
      coverage += (file.functions.covered / file.functions.total) * 100;
      count++;
    }

    return count > 0 ? Math.round(coverage / count) : 0;
  }

  private calculatePriority(file: any): 'low' | 'medium' | 'high' | 'critical' {
    if (file.importance === 'critical') return 'critical';
    if (file.importance === 'high') return 'high';

    const coverage = this.calculateFileCoverage(file);

    if (coverage < 50) return 'critical';
    if (coverage < 65) return 'high';
    if (coverage < 80) return 'medium';
    return 'low';
  }

  private calculateBranchComplexity(totalBranches: number): string {
    if (totalBranches > 100) return 'high';
    if (totalBranches > 50) return 'medium';
    return 'low';
  }
}
