/**
 * Quality assessment task handlers.
 *
 * Extracted from task-executor.ts registerHandlers().
 * Covers: assess-quality
 */

import { ok, err } from '../../shared/types';
import { CallerInputError, toError } from '../../shared/error-utils.js';
import type { TaskHandlerContext } from './handler-types';
import { discoverSourceFiles } from './handler-utils';
import {
  INSUFFICIENT_EVIDENCE,
  describeMissingMetrics,
  evaluateQualityEvidence,
  loadQualityEvidence,
} from '../../domains/quality-assessment/quality-evidence.js';
import {
  assessEvidenceSufficiency,
  describeMeasuredFailure,
  findMeasuredFailures,
  isMeasuredMetricValue,
  resolveCoverageOverride,
  validateRequestedMetrics,
} from '../../domains/quality-assessment/evidence-sufficiency.js';

const DEFAULT_STATIC_METRICS = ['coverage', 'complexity', 'maintainability', 'testability'];
const UNMEASURED = -1;
const STATIC_ONLY_NOTE = 'Static analysis only; no quality gate was evaluated. '
  + 'Call quality_assess with runGate: true (or `aqe quality --gate`) for a pass/fail gate on measured evidence.';

/** #996: report the -1 sentinel instead of a fabricated number for unmeasured values. */
function sentinel(value: number | undefined): number {
  return isMeasuredMetricValue(value) ? value : UNMEASURED;
}

/**
 * #1011: why each unmeasured metric has no value — the analyzer's reason
 * (unreadable or unparseable file, failed detection, no stored coverage).
 */
function unmeasuredReasons(
  unmeasured: readonly string[],
  reported: ReadonlyArray<{ metric: string; reason: string }> | undefined,
): Record<string, string> {
  const byMetric = new Map((reported ?? []).map((u) => [u.metric, u.reason]));
  return Object.fromEntries(unmeasured.map((metric) => [
    metric,
    byMetric.get(metric) ?? (metric === 'security'
      ? 'static analysis never measures security'
      : 'the static analyzer produced no measured value'),
  ]));
}

/** #996 (N3): reject a malformed `metrics` list instead of spreading a string into characters. */
function requestedMetricsFrom(metrics: unknown): string[] {
  if (metrics === undefined) return DEFAULT_STATIC_METRICS;
  try {
    return validateRequestedMetrics(metrics);
  } catch (error) {
    throw new CallerInputError(toError(error).message);
  }
}

/**
 * #996: the user-configured gate coverage threshold (`quality_gate.thresholds.coverage`
 * in .aqe-ci.yml), found the same way `aqe ci` finds its config. Undefined when
 * there is no readable config.
 */
async function configuredCoverageThreshold(startDir: string): Promise<number | undefined> {
  try {
    const { findCIConfigFile, parseCIConfigFile } = await import('../../cli/utils/ci-config.js');
    const configPath = findCIConfigFile(startDir);
    if (!configPath) return undefined;
    const parsed = parseCIConfigFile(configPath);
    return parsed.success ? parsed.config?.qualityGate.thresholds.coverage : undefined;
  } catch {
    return undefined;
  }
}

/**
 * #996: coverage limit for measured failures — the request's threshold, else
 * the configured gate threshold, else the canonical default (undefined).
 */
async function coverageOverrideFor(
  payload: { threshold?: unknown; thresholdSource?: unknown },
): Promise<number | undefined> {
  const requested = payload.thresholdSource === 'default' ? undefined : payload.threshold;
  if (requested !== undefined && (typeof requested !== 'number' || !Number.isFinite(requested)
    || requested < 0 || requested > 100)) {
    throw new CallerInputError('threshold must be a finite number between 0 and 100.');
  }
  return resolveCoverageOverride(
    requested as number | undefined,
    requested === undefined ? await configuredCoverageThreshold(process.cwd()) : undefined,
  );
}

export function registerQualityHandlers(ctx: TaskHandlerContext): void {
  // Register quality assessment handler - REAL IMPLEMENTATION
  ctx.registerHandler('assess-quality', async (task) => {
    const payload = task.payload as {
      runGate: boolean;
      threshold: number;
      /** 'default' when the MCP caller did not supply `threshold`. */
      thresholdSource?: 'request' | 'default';
      metrics?: unknown;
      sourceFiles?: string[];
      target?: string;
    };

    try {
      // An explicit gate evaluates the same measured, timestamped evidence as
      // `aqe quality --gate`. Static source scores cannot substitute for it.
      // Missing/stale/malformed evidence throws InsufficientQualityEvidenceError,
      // whose details (status, unmeasured) travel with the failure.
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

      const requestedMetrics = requestedMetricsFrom(payload.metrics);
      const coverageOverride = await coverageOverrideFor(payload);
      const analyzer = ctx.getQualityAnalyzer();
      const threshold = payload.threshold || 80;

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
        return ok({
          // #1011: nothing was analysed, so there is no score (-1), not a score of 0.
          qualityScore: UNMEASURED,
          passed: false,
          threshold,
          metrics: {
            coverage: UNMEASURED,
            complexity: UNMEASURED,
            maintainability: UNMEASURED,
            testability: UNMEASURED,
          },
          recommendations: [
            ...describeMissingMetrics(requestedMetrics),
            'No source files found for quality assessment',
          ],
          warning: 'No source files found',
          evidenceStatus: INSUFFICIENT_EVIDENCE,
          unmeasured: requestedMetrics,
          unmeasuredReasons: Object.fromEntries(requestedMetrics.map((m) => [m, 'no source files found to analyse'])),
          measuredFailures: [],
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
      // fields carry the -1 sentinel for the rest.
      const metrics: Record<string, number> = {};
      for (const metric of report.metrics) {
        metrics[metric.name] = metric.value;
      }

      // #996: never pass on missing data. A static score computed without a
      // requested metric (e.g. coverage = -1) is not evidence of quality, and
      // a measured metric that fails its own limit blocks regardless (N2).
      const sufficiency = assessEvidenceSufficiency(requestedMetrics, metrics);
      const measuredFailures = findMeasuredFailures(sufficiency.measured, metrics, { coverage: coverageOverride });
      const insufficient = sufficiency.evidenceStatus !== 'measured';
      const passed = !insufficient && measuredFailures.length === 0 && report.score.overall >= threshold;
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
          // #1011: every requested metric appears, -1 when unmeasured.
          ...Object.fromEntries(requestedMetrics.map((name) => [name, sentinel(metrics[name])])),
          ...metrics,
        },
        unmeasuredReasons: unmeasuredReasons(sufficiency.unmeasured, report.unmeasured),
        recommendations: [
          ...measuredFailures.map(describeMeasuredFailure),
          ...describeMissingMetrics(sufficiency.unmeasured),
          ...recommendations,
        ],
        evidenceStatus: sufficiency.evidenceStatus,
        unmeasured: sufficiency.unmeasured,
        measuredFailures,
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
