/**
 * Quality assessment task handlers.
 *
 * Extracted from task-executor.ts registerHandlers().
 * Covers: assess-quality
 */

import { ok, err } from '../../shared/types';
import { toError } from '../../shared/error-utils.js';
import type { TaskHandlerContext } from './handler-types';
import { discoverSourceFiles } from './handler-utils';

export function registerQualityHandlers(ctx: TaskHandlerContext): void {
  // Register quality assessment handler - REAL IMPLEMENTATION
  ctx.registerHandler('assess-quality', async (task) => {
    const payload = task.payload as {
      runGate: boolean;
      threshold: number;
      metrics: string[];
      sourceFiles?: string[];
      target?: string;
    };

    try {
      const analyzer = ctx.getQualityAnalyzer();
      const threshold = payload.threshold || 80;

      // Determine source files to analyze
      let sourceFiles: string[] = [];
      if (payload.sourceFiles && payload.sourceFiles.length > 0) {
        sourceFiles = payload.sourceFiles;
      } else if (payload.target) {
        sourceFiles = await discoverSourceFiles(payload.target, { includeTests: false });
      } else {
        sourceFiles = await discoverSourceFiles(process.cwd(), { includeTests: false });
      }

      if (sourceFiles.length === 0) {
        return ok({
          qualityScore: 0,
          passed: false,
          threshold,
          metrics: {
            coverage: 0,
            complexity: 0,
            maintainability: 0,
            testability: 0,
          },
          recommendations: ['No source files found for quality assessment'],
          warning: 'No source files found',
        });
      }

      // Use the real QualityAnalyzerService
      const result = await analyzer.analyzeQuality({
        sourceFiles,
        includeMetrics: payload.metrics || ['coverage', 'complexity', 'maintainability', 'testability'],
      });

      if (!result.success) {
        return result;
      }

      const report = result.value;
      const passed = report.score.overall >= threshold;

      // Convert metrics to the expected format
      const metrics: Record<string, number> = {};
      for (const metric of report.metrics) {
        metrics[metric.name] = metric.value;
      }

      return ok({
        qualityScore: report.score.overall,
        passed,
        threshold,
        metrics: {
          coverage: report.score.coverage,
          complexity: report.score.complexity,
          maintainability: report.score.maintainability,
          security: report.score.security,
          ...metrics,
        },
        recommendations: report.recommendations.map(r => `[${r.type}] ${r.title}: ${r.description}`),
        trends: report.trends.map(t => ({
          metric: t.metric,
          direction: t.direction,
          dataPoints: t.dataPoints.length,
        })),
        filesAnalyzed: sourceFiles.length,
      });
    } catch (error) {
      return err(toError(error));
    }
  });
}
