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
import {
  evaluateQualityEvidence,
  loadQualityEvidence,
} from '../../domains/quality-assessment/quality-evidence.js';
import {
  assessEvidenceSufficiency,
  isMeasuredMetricValue,
} from '../../domains/quality-assessment/evidence-sufficiency.js';

const DEFAULT_STATIC_METRICS = ['coverage', 'complexity', 'maintainability', 'testability'];
const UNMEASURED = -1;
const STATIC_ONLY_NOTE = 'Static analysis only; no quality gate was evaluated. '
  + 'Call quality_assess with runGate: true (or `aqe quality --gate`) for a pass/fail gate on measured evidence.';

/** #996: report the -1 sentinel instead of a fabricated number for unmeasured values. */
function sentinel(value: number | undefined): number {
  return isMeasuredMetricValue(value) ? value : UNMEASURED;
}

function insufficientEvidenceRecommendation(unmeasured: string[]): string {
  return `Insufficient evidence: ${unmeasured.join(', ')} not measured, so this assessment cannot pass. `
    + 'Collect the missing measurements (e.g. run tests with coverage) and assess again.';
}

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
      // An explicit gate evaluates the same measured, timestamped evidence as
      // `aqe quality --gate`. Static source scores cannot substitute for it.
      if (payload.runGate === true) {
        const measured = await loadQualityEvidence(ctx.memory);
        return ok({
          ...evaluateQualityEvidence(measured),
          metrics: measured,
          evidenceStatus: 'measured',
          unmeasured: [],
          gateEvaluated: true,
        });
      }

      const analyzer = ctx.getQualityAnalyzer();
      const threshold = payload.threshold || 80;
      const requestedMetrics = payload.metrics && payload.metrics.length > 0
        ? payload.metrics
        : DEFAULT_STATIC_METRICS;

      // Determine source files to analyze
      let sourceFiles: string[] = [];
      if (payload.sourceFiles && payload.sourceFiles.length > 0) {
        sourceFiles = payload.sourceFiles;
      } else if (payload.target) {
        sourceFiles = await discoverSourceFiles(payload.target, { includeTests: false });
      } else {
        // Default to src/ — scanning the entire project root is too slow
        // (node_modules, dist, .git, etc. make it hang on large projects)
        const path = await import('path');
        const fs = await import('fs');
        const srcDir = path.join(process.cwd(), 'src');
        const targetDir = fs.existsSync(srcDir) ? srcDir : process.cwd();
        sourceFiles = await discoverSourceFiles(targetDir, { includeTests: false });
      }

      if (sourceFiles.length === 0) {
        // Nothing was analyzed: every requested metric is unmeasured (#996).
        const unmeasured = [...new Set(requestedMetrics)];
        return ok({
          qualityScore: 0,
          passed: false,
          threshold,
          metrics: {
            coverage: UNMEASURED,
            complexity: UNMEASURED,
            maintainability: UNMEASURED,
            testability: UNMEASURED,
          },
          recommendations: [
            insufficientEvidenceRecommendation(unmeasured),
            'No source files found for quality assessment',
          ],
          warning: 'No source files found',
          evidenceStatus: 'insufficient-evidence',
          unmeasured,
          gateEvaluated: false,
          confidence: 0,
          note: STATIC_ONLY_NOTE,
        });
      }

      // Use the real QualityAnalyzerService
      const result = await analyzer.analyzeQuality({
        sourceFiles,
        includeMetrics: requestedMetrics,
      });

      if (!result.success) {
        return result;
      }

      const report = result.value;

      // Only metrics the analyzer actually computed count as measured; score
      // fields carry the -1 sentinel (or a placeholder) for the rest.
      const metrics: Record<string, number> = {};
      for (const metric of report.metrics) {
        metrics[metric.name] = metric.value;
      }

      // #996: never pass on missing data. A static score computed without a
      // requested metric (e.g. coverage = -1) is not evidence of quality.
      const sufficiency = assessEvidenceSufficiency(requestedMetrics, metrics);
      const insufficient = sufficiency.evidenceStatus !== 'measured';
      const passed = !insufficient && report.score.overall >= threshold;
      const recommendations = report.recommendations.map(r => `[${r.type}] ${r.title}: ${r.description}`);

      return ok({
        qualityScore: report.score.overall,
        passed,
        threshold,
        metrics: {
          coverage: sentinel(metrics.coverage),
          complexity: sentinel(metrics.complexity),
          maintainability: sentinel(metrics.maintainability),
          // The analyzer has no security measurement; never report a placeholder.
          security: sentinel(metrics.security),
          ...metrics,
        },
        recommendations: insufficient
          ? [insufficientEvidenceRecommendation(sufficiency.unmeasured), ...recommendations]
          : recommendations,
        evidenceStatus: sufficiency.evidenceStatus,
        unmeasured: sufficiency.unmeasured,
        gateEvaluated: false,
        confidence: sufficiency.confidence,
        note: STATIC_ONLY_NOTE,
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
