/**
 * Quality assessment task handlers.
 *
 * Extracted from task-executor.ts registerHandlers().
 * Covers: assess-quality
 */

import * as nodePath from 'node:path';
import { existsSync, promises as fsp } from 'node:fs';
import { ok, err } from '../../shared/types';
import { CallerInputError, toError } from '../../shared/error-utils.js';
import type { TaskHandlerContext } from './handler-types';
import { discoverSourceFiles } from './handler-utils';
import { findProjectRoot } from '../../kernel/project-root.js';
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

/** Cap on excluded files echoed back in the result (the count is always exact). */
const MAX_EXCLUDED_LISTED = 50;

/** True when `candidate` is `root` or lies beneath it. */
function isWithin(root: string, candidate: string): boolean {
  const relative = nodePath.relative(root, candidate);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${nodePath.sep}`) && !nodePath.isAbsolute(relative));
}

/**
 * #1021 (B2): resolve a caller path against the project root and require it to
 * stay inside — lexically, and by realpath when it exists (so a symlink cannot
 * lead outside). A path that does not exist is returned as resolved; the
 * analyzer reports it as unreadable.
 */
async function resolveContained(input: string, root: string, label: string): Promise<string> {
  const resolved = nodePath.resolve(root, input);
  if (input.includes('\0') || !isWithin(root, resolved)) {
    throw new CallerInputError(`${label} ${JSON.stringify(input)} is outside the project root (${root}).`);
  }
  let real: string;
  try {
    real = await fsp.realpath(resolved);
  } catch {
    return resolved;
  }
  const rootReal = await fsp.realpath(root).catch(() => root);
  if (!isWithin(rootReal, real)) {
    throw new CallerInputError(`${label} ${JSON.stringify(input)} resolves outside the project root (${root}).`);
  }
  return resolved;
}

/**
 * #1021 (B2): the files to analyse and which of them the caller named. Explicit
 * sourceFiles win over target; with neither, src/ (else the root) is analysed.
 */
async function resolveAnalysisScope(
  payload: { sourceFiles?: unknown; target?: unknown },
): Promise<{ sourceFiles: string[]; explicitFiles: string[]; scope: string }> {
  // #1021 round 2b: the AQE project root (AQE_PROJECT_ROOT, else detected),
  // not the process cwd — an MCP server may run from another directory.
  const root = findProjectRoot();
  if (Array.isArray(payload.sourceFiles) && payload.sourceFiles.length > 0) {
    const files: string[] = [];
    for (const file of payload.sourceFiles) {
      if (typeof file !== 'string' || file.trim() === '') {
        throw new CallerInputError('sourceFiles must be a non-empty array of file paths.');
      }
      files.push(await resolveContained(file, root, 'sourceFile'));
    }
    return { sourceFiles: files, explicitFiles: files, scope: 'sourceFiles' };
  }
  if (typeof payload.target === 'string' && payload.target.trim() !== '') {
    const target = await resolveContained(payload.target, root, 'target');
    const stat = await fsp.stat(target).catch(() => null);
    if (!stat) throw new CallerInputError(`target ${JSON.stringify(payload.target)} does not exist.`);
    if (stat.isFile()) return { sourceFiles: [target], explicitFiles: [target], scope: target };
    return { sourceFiles: await discoverSourceFiles(target, { includeTests: false, completeScope: true }), explicitFiles: [], scope: target };
  }
  // Default to src/ — scanning the entire project root is too slow
  // (node_modules, dist, .git, etc. make it hang on large projects)
  const srcDir = nodePath.join(root, 'src');
  const targetDir = existsSync(srcDir) ? srcDir : root;
  return { sourceFiles: await discoverSourceFiles(targetDir, { includeTests: false, completeScope: true }), explicitFiles: [], scope: targetDir };
}

/** #1021: one line per partially measured metric, naming the gap. */
function describePartialMetrics(
  partial: ReadonlyArray<{ metric: string; analysedFiles: number; totalFiles: number; coverageOfScope: number;
    failed: ReadonlyArray<{ reason: string }> }> | undefined,
): string[] {
  return (partial ?? []).map((p) => `Partial evidence: ${p.metric} measured over ${p.analysedFiles} of ${p.totalFiles} `
    // coverageOfScope is already rounded down to 3 decimals; round only float noise here.
    + `file(s) (${Math.round(p.coverageOfScope * 1000) / 10}%); not analysed: `
    + p.failed.slice(0, 3).map((f) => f.reason).join('; ')
    + (p.failed.length > 3 ? `; and ${p.failed.length - 3} more` : '') + '.');
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

      // #1021 (B2): analyse what the caller scoped, contained in the project root.
      const { sourceFiles, explicitFiles, scope } = await resolveAnalysisScope(payload);

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
        explicitFiles,
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
      // A score that leaves out unmeasured metrics is not the overall score:
      // -1 with the reason, as the gate's overallScore since #1223. The score
      // over the measured metrics stays available, labelled as a subset.
      const subsetScore = report.subsetScore ?? report.score.overall;

      return ok({
        qualityScore: insufficient ? UNMEASURED : report.score.overall,
        ...(insufficient ? {
          qualityScoreReason: `not computed: ${sufficiency.unmeasured.join(', ')} unmeasured`,
          ...(subsetScore >= 0 ? { subsetScore } : {}),
        } : {}),
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
        // #1021 round 2b: a score over a subset of the requested metrics (or over
        // part of the files) names what it is based on — it is not a verdict.
        ...(insufficient || (report.partial?.length ?? 0) > 0
          ? { scoreBasis: report.metrics.map((m) => m.name) }
          : {}),
        recommendations: [
          ...measuredFailures.map(describeMeasuredFailure),
          ...describeMissingMetrics(sufficiency.unmeasured),
          ...describePartialMetrics(report.partial),
          ...recommendations,
        ],
        ...(report.partial && report.partial.length > 0 ? { partialMetrics: report.partial } : {}),
        ...(report.excluded && report.excluded.length > 0
          ? { excludedFiles: report.excluded.slice(0, MAX_EXCLUDED_LISTED), excludedCount: report.excluded.length }
          : {}),
        scope,
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
