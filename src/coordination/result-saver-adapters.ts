/**
 * #1125 review: task_orchestrate and `aqe fleet run` now submit the domains'
 * concrete handler types (sast-scan, analyze-quality) for the abstract types
 * scan-security and assess-quality. These adapters map those handler results
 * onto the report shapes ResultSaver already writes, so they are saved by the
 * security and quality savers rather than as generic JSON. Nothing missing
 * from a result is filled in: absent values stay absent.
 */
import type { TaskType } from './queen-types.js';

type Finding = { title?: string; category?: string; severity?: string; location?: { file?: string; line?: number }; description?: string };

const asRecord = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' ? value as Record<string, unknown> : {};

/** sast-scan's SASTResult -> the scan-security report shape. */
function securityReport(result: unknown): Record<string, unknown> {
  const data = asRecord(result);
  const summary = asRecord(data.summary);
  const findings = Array.isArray(data.vulnerabilities) ? data.vulnerabilities as Finding[] : [];
  const count = (severity: string) => typeof summary[severity] === 'number' ? summary[severity] as number : 0;
  return {
    vulnerabilities: findings.length,
    critical: count('critical'),
    high: count('high'),
    medium: count('medium'),
    low: count('low'),
    topVulnerabilities: findings.slice(0, 10).map(f => ({
      type: f.title ?? f.category ?? 'finding',
      severity: f.severity ?? 'unknown',
      file: f.location?.file ?? '',
      line: f.location?.line ?? 0,
    })),
    findings: findings.map(f => ({
      title: f.title, type: f.category, severity: f.severity ?? 'unknown', location: f.location?.file
        ? { file: f.location.file, line: f.location.line } : undefined, description: f.description,
    })),
    recommendations: [],
    evidence: data.evidence,
    coverage: data.coverage,
    analysisDepth: 'sast-patterns',
  };
}

/** analyze-quality's analysis -> the assess-quality report shape. No gate runs. */
function qualityReport(result: unknown): Record<string, unknown> {
  const data = asRecord(result);
  const score = asRecord(data.score);
  const metrics = Array.isArray(data.metrics) ? data.metrics as Array<{ name?: string; value?: number }> : [];
  const unmeasured = Array.isArray(data.unmeasured)
    ? (data.unmeasured as Array<{ metric?: string }>).map(u => u.metric).filter((m): m is string => !!m)
    : [];
  return {
    ...(typeof score.overall === 'number' ? { qualityScore: score.overall } : {}),
    passed: false,
    gateEvaluated: false,
    metrics: Object.fromEntries(metrics.filter(m => m.name && typeof m.value === 'number').map(m => [m.name, m.value])),
    recommendations: Array.isArray(data.recommendations) ? data.recommendations : [],
    unmeasured,
    evidenceStatus: unmeasured.length > 0 ? 'insufficient-evidence' : 'measured',
    scoreBasis: metrics.map(m => m.name).filter((m): m is string => !!m),
  };
}

/** The saver type and report for a task result; other types pass through. */
export function resultForSaver(taskType: string, result: unknown): { saveType: TaskType; report: unknown } {
  switch (taskType) {
    case 'sast-scan': return { saveType: 'scan-security', report: securityReport(result) };
    case 'analyze-quality': return { saveType: 'assess-quality', report: qualityReport(result) };
    default: return { saveType: taskType as TaskType, report: result };
  }
}
