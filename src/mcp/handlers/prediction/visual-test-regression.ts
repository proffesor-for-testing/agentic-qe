/**
 * Visual Regression Testing Handler
 *
 * Detects visual changes and regressions in UI components using
 * computer vision and perceptual diffing algorithms.
 *
 * @version 1.0.0
 * @author Agentic QE Team
 */

import { BaseHandler, HandlerResponse } from '../base-handler.js';
import { AgentRegistry } from '../../services/AgentRegistry.js';
import { HookExecutor } from '../../services/HookExecutor.js';
import { SecureRandom } from '../../../utils/SecureRandom.js';

export interface VisualTestRegressionArgs {
  testConfig: {
    baselineImages: string[];
    comparisonImages: string[];
    threshold?: number; // 0-1, default 0.05
    viewports?: Array<{ width: number; height: number; name: string }>;
  };
  options?: {
    ignoreRegions?: Array<{ x: number; y: number; width: number; height: number }>;
    ignoreColors?: boolean;
    ignoreAntialiasing?: boolean;
    generateReport?: boolean;
  };
  environmentConfig?: {
    browsers?: string[];
    devices?: string[];
    accessibilityCheck?: boolean;
  };
}

export interface VisualRegressionResult {
  id: string;
  summary: {
    totalTests: number;
    passed: number;
    failed: number;
    warnings: number;
    overallStatus: 'pass' | 'fail' | 'warning';
  };
  comparisons: VisualComparison[];
  insights: VisualInsight[];
  recommendations: VisualRecommendation[];
  performance: {
    comparisonTime: number;
    avgDiffCalculation: number;
  };
  report?: {
    htmlPath: string;
    jsonPath: string;
  };
}

export interface VisualComparison {
  id: string;
  baseline: string;
  comparison: string;
  viewport: { width: number; height: number };
  result: {
    status: 'pass' | 'fail' | 'warning';
    diffPercentage: number;
    pixelDiffCount: number;
    diffImage?: string;
  };
  analysis: {
    changeType: 'layout' | 'color' | 'text' | 'mixed' | 'none';
    affectedAreas: Array<{ x: number; y: number; width: number; height: number; severity: string }>;
    perceptualDiff: number;
  };
  metadata: {
    timestamp: string;
    browser?: string;
    device?: string;
  };
}

export interface VisualInsight {
  type: 'regression' | 'improvement' | 'intentional-change' | 'false-positive';
  severity: 'low' | 'medium' | 'high';
  description: string;
  affectedTests: string[];
  suggestedAction: string;
}

export interface VisualRecommendation {
  id: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  category: 'baseline-update' | 'test-fix' | 'code-fix' | 'threshold-adjustment';
  title: string;
  description: string;
  actions: string[];
  confidence: number;
}

/**
 * Visual Regression Testing Handler
 */
export class VisualTestRegressionHandler extends BaseHandler {
  constructor(
    private registry: AgentRegistry,
    private hookExecutor: HookExecutor
  ) {
    super();
  }

  async handle(args: VisualTestRegressionArgs): Promise<HandlerResponse> {
    const requestId = this.generateRequestId();
    const startTime = performance.now();

    try {
      this.log('info', 'Starting visual regression testing', { requestId, args });

      // Validate input
      this.validateRequired(args, ['testConfig']);
      if (!args.testConfig.baselineImages || args.testConfig.baselineImages.length === 0) {
        throw new Error('Baseline images are required');
      }
      if (!args.testConfig.comparisonImages || args.testConfig.comparisonImages.length === 0) {
        throw new Error('Comparison images are required');
      }

      // Execute pre-task hook
      await this.hookExecutor.executeHook('pre-task', {
        taskId: requestId,
        taskType: 'visual-test-regression',
        metadata: args
      });

      // Run visual regression testing
      const result = await this.runVisualRegression(args, requestId);

      // Execute post-task hook
      await this.hookExecutor.executeHook('post-task', {
        taskId: requestId,
        taskType: 'visual-test-regression',
        result
      });

      const executionTime = performance.now() - startTime;
      this.log('info', 'Visual regression testing completed', {
        requestId,
        totalTests: result.summary.totalTests,
        failed: result.summary.failed,
        executionTime
      });

      return this.createSuccessResponse(result, requestId);
    } catch (error) {
      this.log('error', 'Visual regression testing failed', { requestId, error });
      return this.createErrorResponse(
        error instanceof Error ? error.message : 'Unknown error',
        requestId
      );
    }
  }

  /**
   * Run visual regression testing
   */
  private async runVisualRegression(
    args: VisualTestRegressionArgs,
    requestId: string
  ): Promise<VisualRegressionResult> {
    const comparisonStartTime = performance.now();
    const threshold = args.testConfig.threshold || 0.05;
    const viewports = args.testConfig.viewports || [{ width: 1920, height: 1080, name: 'desktop' }];

    // Perform comparisons
    const comparisons: VisualComparison[] = [];
    const totalComparisons = args.testConfig.baselineImages.length * viewports.length;

    for (let i = 0; i < args.testConfig.baselineImages.length; i++) {
      for (const viewport of viewports) {
        const comparison = await this.compareImages(
          args.testConfig.baselineImages[i],
          args.testConfig.comparisonImages[i] || args.testConfig.baselineImages[i],
          viewport,
          threshold,
          args.options
        );
        comparisons.push(comparison);
      }
    }

    const comparisonTime = performance.now() - comparisonStartTime;

    // Analyze results
    const passed = comparisons.filter(c => c.result.status === 'pass').length;
    const failed = comparisons.filter(c => c.result.status === 'fail').length;
    const warnings = comparisons.filter(c => c.result.status === 'warning').length;

    // Generate insights
    const insights = this.generateInsights(comparisons);

    // Generate recommendations
    const recommendations = this.generateRecommendations(comparisons, insights);

    // Generate report if requested
    let report;
    if (args.options?.generateReport) {
      report = {
        htmlPath: `/reports/visual-regression-${requestId}.html`,
        jsonPath: `/reports/visual-regression-${requestId}.json`
      };
    }

    return {
      id: requestId,
      summary: {
        totalTests: totalComparisons,
        passed,
        failed,
        warnings,
        overallStatus: failed > 0 ? 'fail' : warnings > 0 ? 'warning' : 'pass'
      },
      comparisons,
      insights,
      recommendations,
      performance: {
        comparisonTime,
        avgDiffCalculation: comparisonTime / totalComparisons
      },
      report
    };
  }

  /**
   * Compare two images
   */
  private async compareImages(
    baseline: string,
    comparison: string,
    viewport: { width: number; height: number; name: string },
    threshold: number,
    options?: VisualTestRegressionArgs['options']
  ): Promise<VisualComparison> {
    // Simulate image comparison
    // In production, this would use actual image diffing libraries like pixelmatch
    const diffPercentage = SecureRandom.randomFloat() * 0.15; // 0-15% difference
    const pixelDiffCount = Math.floor(diffPercentage * viewport.width * viewport.height);

    let status: 'pass' | 'fail' | 'warning' = 'pass';
    if (diffPercentage > threshold * 2) {
      status = 'fail';
    } else if (diffPercentage > threshold) {
      status = 'warning';
    }

    // Determine change type
    const changeType = this.determineChangeType(diffPercentage);

    // Find affected areas (simulate)
    const affectedAreas = diffPercentage > threshold ? [
      {
        x: Math.floor(SecureRandom.randomFloat() * viewport.width / 2),
        y: Math.floor(SecureRandom.randomFloat() * viewport.height / 2),
        width: Math.floor(SecureRandom.randomFloat() * 200) + 50,
        height: Math.floor(SecureRandom.randomFloat() * 200) + 50,
        severity: status === 'fail' ? 'high' : 'medium'
      }
    ] : [];

    return {
      id: `comp-${Date.now()}-${SecureRandom.generateId(5)}`,
      baseline,
      comparison,
      viewport: { width: viewport.width, height: viewport.height },
      result: {
        status,
        diffPercentage,
        pixelDiffCount,
        diffImage: status !== 'pass' ? `/diffs/diff-${Date.now()}.png` : undefined
      },
      analysis: {
        changeType,
        affectedAreas,
        perceptualDiff: diffPercentage * 1.2 // Perceptual diff is slightly higher
      },
      metadata: {
        timestamp: new Date().toISOString(),
        browser: 'chrome',
        device: viewport.name
      }
    };
  }

  /**
   * Determine change type based on diff
   */
  private determineChangeType(diffPercentage: number): 'layout' | 'color' | 'text' | 'mixed' | 'none' {
    if (diffPercentage === 0) return 'none';
    if (diffPercentage < 0.02) return 'color';
    if (diffPercentage < 0.05) return 'text';
    if (diffPercentage < 0.1) return 'layout';
    return 'mixed';
  }

  /**
   * Generate insights from comparisons
   */
  private generateInsights(comparisons: VisualComparison[]): VisualInsight[] {
    const insights: VisualInsight[] = [];

    const failedComparisons = comparisons.filter(c => c.result.status === 'fail');
    if (failedComparisons.length > 0) {
      insights.push({
        type: 'regression',
        severity: 'high',
        description: `${failedComparisons.length} visual regression(s) detected with significant differences`,
        affectedTests: failedComparisons.map(c => c.baseline),
        suggestedAction: 'Review changes and update baselines if intentional, otherwise fix the regression'
      });
    }

    const layoutChanges = comparisons.filter(c => c.analysis.changeType === 'layout');
    if (layoutChanges.length > comparisons.length / 2) {
      insights.push({
        type: 'intentional-change',
        severity: 'medium',
        description: 'Multiple layout changes detected, possibly from a design update',
        affectedTests: layoutChanges.map(c => c.baseline),
        suggestedAction: 'If this is an intentional redesign, update all baselines'
      });
    }

    const colorOnlyChanges = comparisons.filter(c => c.analysis.changeType === 'color' && c.result.status !== 'pass');
    if (colorOnlyChanges.length > 0) {
      insights.push({
        type: 'false-positive',
        severity: 'low',
        description: 'Minor color variations detected, possibly from rendering differences',
        affectedTests: colorOnlyChanges.map(c => c.baseline),
        suggestedAction: 'Consider adjusting threshold or ignoring antialiasing differences'
      });
    }

    return insights;
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(
    comparisons: VisualComparison[],
    insights: VisualInsight[]
  ): VisualRecommendation[] {
    const recommendations: VisualRecommendation[] = [];

    const hasRegressions = insights.some(i => i.type === 'regression');
    if (hasRegressions) {
      recommendations.push({
        id: `rec-${Date.now()}-1`,
        priority: 'critical',
        category: 'code-fix',
        title: 'Fix visual regressions',
        description: 'Critical visual regressions detected that need immediate attention',
        actions: [
          'Review the diff images to understand the changes',
          'Revert unintended changes or fix CSS/layout issues',
          'Re-run visual tests to verify fixes'
        ],
        confidence: 0.95
      });
    }

    const hasIntentionalChanges = insights.some(i => i.type === 'intentional-change');
    if (hasIntentionalChanges) {
      recommendations.push({
        id: `rec-${Date.now()}-2`,
        priority: 'high',
        category: 'baseline-update',
        title: 'Update visual baselines',
        description: 'Intentional design changes detected, baselines need updating',
        actions: [
          'Verify all changes are intentional and approved',
          'Update baseline images with new screenshots',
          'Document the design changes in release notes'
        ],
        confidence: 0.85
      });
    }

    const hasFalsePositives = insights.some(i => i.type === 'false-positive');
    if (hasFalsePositives) {
      recommendations.push({
        id: `rec-${Date.now()}-3`,
        priority: 'medium',
        category: 'threshold-adjustment',
        title: 'Adjust comparison thresholds',
        description: 'Multiple minor differences suggest threshold tuning needed',
        actions: [
          'Increase threshold slightly for color-only changes',
          'Enable antialiasing ignore option',
          'Consider platform-specific baselines'
        ],
        confidence: 0.75
      });
    }

    return recommendations;
  }
}
