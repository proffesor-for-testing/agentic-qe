/**
 * Adidas TC01 Report Generator
 * Thin wrapper around the generic lifecycle report generator.
 * Also provides generateDebugDump() for structured Markdown debug output.
 */
import { generateLifecycleReport } from '../../integrations/orchestration/report-generator';
import type { RunResult } from '../../integrations/orchestration/action-types';
import type { HealingOutcome } from './healing-telemetry';
import type { RecurringFailure } from './run-history';
import { STERLING_FIELD_MAP } from './run-history';
import * as fs from 'fs';
import * as path from 'path';

export { generateLifecycleReport } from '../../integrations/orchestration/report-generator';
export type { ReportOptions } from '../../integrations/orchestration/report-generator';

/**
 * Generate a TC01-specific HTML report.
 * Convenience wrapper that sets title and filename prefix for Adidas O2C.
 */
export async function generateTC01Report(
  result: RunResult,
  orderId: string,
  outputDir?: string,
): Promise<string> {
  return generateLifecycleReport(result, orderId, {
    title: 'Adidas O2C Lifecycle Report',
    filenamePrefix: 'o2c',
    outputDir,
  });
}

// ============================================================================
// Debug Dump — Structured Markdown for post-mortem analysis
// ============================================================================

interface DebugDumpConfig {
  enterpriseCode: string;
  host: string;
  layers: string;
}

/**
 * Generate a structured Markdown debug dump for a TC01 run.
 *
 * Sections:
 *   1. Run Summary — order, stages pass/fail/skip, duration, timestamp
 *   2. Per-stage table — id, status, duration, action error, failed check count
 *   3. Failed checks — flat list: stage, check name, expected, actual
 *   4. Self-healing outcomes — stage, decision, pattern, duration
 *   5. Recurring failures (only if 2+ runs) — check name, fail rate, Sterling field
 *
 * No root-cause classification heuristics. Just structured data.
 */
export async function generateDebugDump(
  result: RunResult,
  orderId: string,
  config: DebugDumpConfig,
  healingOutcomes: HealingOutcome[],
  recurringFailures: RecurringFailure[],
  outputDir?: string,
): Promise<string> {
  const lines: string[] = [];
  const ts = new Date().toISOString();

  // Section 1: Run Summary
  lines.push(`# Debug Dump — ${orderId}`);
  lines.push('');
  lines.push(`| Field | Value |`);
  lines.push(`|-------|-------|`);
  lines.push(`| Order | ${orderId} |`);
  lines.push(`| Timestamp | ${ts} |`);
  lines.push(`| Enterprise | ${config.enterpriseCode} |`);
  lines.push(`| Host | ${config.host} |`);
  lines.push(`| Layers | ${config.layers} |`);
  lines.push(`| Result | ${result.overallSuccess ? 'PASS' : 'FAIL'} |`);
  lines.push(`| Stages | ${result.passed} pass / ${result.failed} fail / ${result.skipped} skip |`);
  lines.push(`| Total Checks | ${result.totalChecks} |`);
  lines.push(`| Duration | ${(result.totalDurationMs / 1000).toFixed(1)}s |`);
  lines.push('');

  // Section 2: Per-stage table
  lines.push('## Stages');
  lines.push('');
  lines.push('| Stage | Status | Duration | Action Error | Failed Checks |');
  lines.push('|-------|--------|----------|-------------|---------------|');
  for (const stage of result.stages) {
    const status = stage.overallSuccess ? 'PASS' : 'FAIL';
    const dur = `${(stage.durationMs / 1000).toFixed(1)}s`;
    const actionErr = (stage.action.error ?? '').slice(0, 60) || '-';
    const failedCount = stage.verification.failed;
    lines.push(`| ${stage.stageId} | ${status} | ${dur} | ${actionErr} | ${failedCount} |`);
  }
  lines.push('');

  // Section 3: Failed checks
  const failedChecks: Array<{ stageId: string; checkName: string; expected: string; actual: string }> = [];
  for (const stage of result.stages) {
    for (const step of stage.verification.steps) {
      for (const check of step.result.checks) {
        if (!check.passed) {
          failedChecks.push({
            stageId: stage.stageId,
            checkName: check.name,
            expected: String(check.expected ?? '-').slice(0, 40),
            actual: String(check.actual ?? '-').slice(0, 40),
          });
        }
      }
    }
  }

  if (failedChecks.length > 0) {
    lines.push('## Failed Checks');
    lines.push('');
    lines.push('| Stage | Check | Expected | Actual | Sterling Field |');
    lines.push('|-------|-------|----------|--------|----------------|');
    for (const fc of failedChecks) {
      const field = STERLING_FIELD_MAP[fc.checkName] ?? '-';
      lines.push(`| ${fc.stageId} | ${fc.checkName} | ${fc.expected} | ${fc.actual} | ${field} |`);
    }
    lines.push('');
  }

  // Section 4: Self-healing outcomes
  if (healingOutcomes.length > 0) {
    lines.push('## Self-Healing Outcomes');
    lines.push('');
    lines.push('| Stage | Decision | Pattern | Duration | Success |');
    lines.push('|-------|----------|---------|----------|---------|');
    for (const ho of healingOutcomes) {
      const dur = ho.durationMs ? `${ho.durationMs}ms` : '-';
      lines.push(`| ${ho.stageId} | ${ho.decision} | ${ho.patternMatched ?? ho.playbookName ?? '-'} | ${dur} | ${ho.success ? 'yes' : 'no'} |`);
    }
    lines.push('');
  }

  // Section 5: Recurring failures (cross-run)
  if (recurringFailures.length > 0) {
    lines.push('## Recurring Failures (Cross-Run)');
    lines.push('');
    lines.push('| Check | Fail Rate | Failed In | Total Runs | Sterling Field |');
    lines.push('|-------|-----------|-----------|------------|----------------|');
    for (const rf of recurringFailures) {
      const rate = `${(rf.failRate * 100).toFixed(0)}%`;
      const field = rf.sterlingField ?? '(unmapped)';
      lines.push(`| ${rf.checkName} | ${rate} | ${rf.failedInRuns} | ${rf.totalRuns} | ${field} |`);
    }
    lines.push('');
  }

  // Write to file
  const dir = outputDir ?? path.join(process.cwd(), 'tests', 'reports');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const filename = `debug-${orderId}-${Date.now()}.md`;
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');

  return filePath;
}
