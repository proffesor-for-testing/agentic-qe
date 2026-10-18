/**
 * Agentic QE v3 - `aqe fleet run` result summary (#1125 review)
 *
 * A completed task is not a passed check. The summary shows what each
 * operation's handler returned and turns it into a verdict:
 *   - scan    fails on a critical or high finding, or when the scan evidence
 *             says not every requested file was analyzed;
 *   - test    fails when no test was generated or a generated test failed
 *             the test quality gate;
 *   - analyze fails when coverage over the collected metrics is below the
 *             threshold (an uncollected metric is not counted as 0%).
 * A result without the expected shape fails rather than passing unread.
 */

import chalk from 'chalk';
import { FLEET_COVERAGE_THRESHOLD, type FleetOperation } from './fleet-operation.js';
import { thresholdVerdict } from '../../coordination/handlers/coverage-target.js';

export interface FleetResultSummary {
  lines: string[];
  passed: boolean;
  /** Why the verdict failed; empty when it passed. */
  reasons: string[];
}

interface Finding {
  severity?: string;
  title?: string;
  location?: { file?: string; line?: number };
}

const SEVERITIES = ['critical', 'high', 'medium', 'low', 'informational'] as const;
const MAX_LISTED_FINDINGS = 10;

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' ? value as Record<string, unknown> : undefined;

const pct = (value: unknown): string => typeof value === 'number' ? `${value}%` : 'n/a';

function summarizeScan(result: Record<string, unknown>): FleetResultSummary {
  const summary = asRecord(result.summary);
  const findings = Array.isArray(result.vulnerabilities) ? result.vulnerabilities as Finding[] : undefined;
  if (!summary || !findings) return unreadable('scan');

  const count = (severity: string) => Number(summary[severity] ?? 0);
  const coverage = asRecord(result.coverage);
  const evidence = asRecord(result.evidence);
  const completeness = typeof evidence?.completeness === 'string' ? evidence.completeness : 'unknown';
  const lines = [
    `Findings: ${SEVERITIES.map(s => `${s} ${count(s)}`).join(', ')}`,
    `Files scanned: ${coverage?.filesScanned ?? 'n/a'} (evidence: ${completeness})`,
    ...findings.slice(0, MAX_LISTED_FINDINGS).map(f =>
      `  [${f.severity ?? '?'}] ${f.title ?? 'untitled'} @ ${f.location?.file ?? '?'}:${f.location?.line ?? '?'}`),
  ];
  if (findings.length > MAX_LISTED_FINDINGS) lines.push(`  … ${findings.length - MAX_LISTED_FINDINGS} more`);

  const reasons: string[] = [];
  if (count('critical') + count('high') > 0) reasons.push(`${count('critical')} critical and ${count('high')} high findings`);
  if (completeness !== 'complete') reasons.push(`scan evidence is ${completeness}: not every requested file was analyzed`);
  return { lines, passed: reasons.length === 0, reasons };
}

function summarizeTests(result: Record<string, unknown>): FleetResultSummary {
  if (!Array.isArray(result.tests)) return unreadable('test');
  const tests = result.tests as Array<Record<string, unknown>>;
  const assertions = tests.reduce((sum, t) => sum + (typeof t.assertions === 'number' ? t.assertions : 0), 0);
  const modes = [...new Set(tests.map(t => t.generationMode).filter((m): m is string => typeof m === 'string'))];
  const gateFailed = tests.filter(t => asRecord(t.qualityGateResult)?.passed === false);
  const lines = [
    `Tests generated: ${tests.length}, assertions: ${assertions}` +
      (modes.length > 0 ? `, generation mode: ${modes.join(', ')}` : ''),
    `Quality gate: ${gateFailed.length === 0 ? 'passed' : `failed for ${gateFailed.length} of ${tests.length} tests`}`,
    ...gateFailed.slice(0, MAX_LISTED_FINDINGS).map(t => `  ${t.testFile ?? t.name ?? t.id}`),
  ];

  const reasons: string[] = [];
  if (tests.length === 0) reasons.push('no tests were generated');
  if (gateFailed.length > 0) reasons.push(`${gateFailed.length} generated tests failed the test quality gate`);
  return { lines, passed: reasons.length === 0, reasons };
}

function summarizeCoverage(result: Record<string, unknown>): FleetResultSummary {
  const summary = asRecord(result.summary);
  if (!summary || typeof summary.line !== 'number') return unreadable('analyze');
  const collected = asRecord(result.collected);
  const isCollected = (name: 'branch' | 'function' | 'statement') => collected?.[name] !== false;
  // An uncollected metric is 0 by construction (#1027 B2): show it as n/a and
  // leave it out of the verdict, as `aqe coverage` does (#995).
  const metric = (name: 'branch' | 'function' | 'statement') =>
    isCollected(name) ? pct(summary[name]) : 'n/a (not collected)';
  const num = (name: string) => typeof summary[name] === 'number' ? summary[name] as number : 0;
  const verdict = thresholdVerdict(
    { line: num('line'), branch: num('branch'), function: num('function'), statement: num('statement') },
    FLEET_COVERAGE_THRESHOLD,
    { branch: isCollected('branch'), function: isCollected('function'), statement: isCollected('statement') },
  );
  const lines = [
    `Coverage: line ${pct(summary.line)}, branch ${metric('branch')}, function ${metric('function')}, ` +
      `statement ${metric('statement')} over ${summary.files ?? 'n/a'} files`,
    `Overall over collected metrics: ${verdict.overall.toFixed(1)}% (threshold ${FLEET_COVERAGE_THRESHOLD}%)`,
  ];
  const reasons = verdict.meetsThreshold ? [] : [`coverage is below the ${FLEET_COVERAGE_THRESHOLD}% threshold`];
  return { lines, passed: reasons.length === 0, reasons };
}

function unreadable(operation: FleetOperation): FleetResultSummary {
  const reason = `the ${operation} result has no readable summary`;
  return { lines: [`Result: ${reason}`], passed: false, reasons: [reason] };
}

/** Summarize one completed task's result for its fleet operation. */
export function summarizeFleetResult(operation: FleetOperation, result: unknown): FleetResultSummary {
  const record = asRecord(result);
  if (!record) return unreadable(operation);
  switch (operation) {
    case 'scan': return summarizeScan(record);
    case 'test': return summarizeTests(record);
    case 'analyze': return summarizeCoverage(record);
  }
}

/**
 * Print each distinct worker result once and the verdict over all workers.
 * Returns whether the operation passed.
 */
export function reportFleetVerdict(
  operation: FleetOperation,
  workers: ReadonlyArray<{ success: boolean; result: unknown }>,
  log: (line: string) => void = line => console.log(line),
): boolean {
  const summaries = workers.filter(w => w.success).map(w => summarizeFleetResult(operation, w.result));
  const shown = new Set<string>();
  for (const summary of summaries) {
    const text = summary.lines.join('\n');
    if (shown.has(text)) continue;
    shown.add(text);
    log('');
    for (const line of summary.lines) log(`   ${line}`);
  }

  const incomplete = workers.filter(w => !w.success).length;
  const reasons = [...new Set(summaries.flatMap(s => s.reasons))];
  if (incomplete > 0) reasons.unshift(`${incomplete} of ${workers.length} workers did not complete`);
  log('');
  log(reasons.length === 0
    ? chalk.green('   Verdict: PASSED')
    : chalk.red(`   Verdict: FAILED (${reasons.join('; ')})`));
  return reasons.length === 0;
}
