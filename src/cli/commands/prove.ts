/**
 * Agentic QE v3 - Proof-of-Quality (PoQ) Command
 *
 * Generates a quality attestation with a SHA-256 hash.
 *
 * #1453: every attestation flag is true only when its evidence was measured.
 * The flags are read from the same candidate-bound evidence receipts the
 * measured gate (`aqe quality --gate`) uses, and `qualityGatePassed` is that
 * gate's own verdict for this checkout. Missing, stale, mismatched or legacy
 * evidence makes a flag false, and `evidence` says why (`unmeasured`).
 *
 * Usage: aqe prove [--format json|markdown] [--output file]
 */

import { Command } from 'commander';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import type { CLIContext } from '../handlers/interfaces.js';
import type { MemoryBackend } from '../../kernel/interfaces.js';
import { readConfinedText } from '../../shared/io/confined-read.js';
import type { QualityGateResult } from '../utils/ci-output.js';
import {
  inspectQualityEvidence,
  loadQualityEvidenceSet,
  recordOutputInCandidate,
  resolveQualityEvidenceCandidate,
  type QualityEvidenceCandidate,
  type QualityEvidenceProblemCode,
  type QualityMetricName,
} from '../../domains/quality-assessment/quality-evidence.js';
import {
  describeUnavailableQualityEvidence,
  evaluateMeasuredQualityEvidence,
  getMeasuredQualityExitCode,
} from './quality.js';

/** Attestation format version. 2.0.0 (#1453): flags are bound to measured evidence. */
export const ATTESTATION_VERSION = '2.0.0';

/** Why a flag has no measured evidence: an evidence problem code, or no evidence store at all. */
export type AttestationUnmeasuredCode = QualityEvidenceProblemCode | 'evidence-store-unavailable';

/** The evidence behind one "was it done" flag (testsExecuted, coverageChecked, securityScanned). */
export interface AttestationEvidenceEntry {
  /** The canonical evidence metric the flag is read from. */
  metric: QualityMetricName;
  /** `measured`: a valid receipt bound to this checkout exists. Otherwise `unmeasured`. */
  status: 'measured' | 'unmeasured';
  /** The measured value (testsPassing %, line coverage %, vulnerability count). */
  value?: number;
  receiptId?: string;
  source?: string;
  measuredAt?: string;
  runId?: string;
  /** Why the flag is unmeasured. */
  code?: AttestationUnmeasuredCode;
  reason?: string;
}

/** The measured gate's verdict for this checkout, as `aqe quality --gate` reaches it. */
export interface AttestationGateEvidence {
  /** `unmeasured`: insufficient evidence, the gate was not evaluated (its exit code 3). */
  status: 'passed' | 'failed' | 'unmeasured';
  /** The exit code `aqe quality --gate` returns for the same evidence. */
  exitCode: 0 | 1 | 2 | 3;
  /** Metrics without usable evidence, when unmeasured. */
  unmeasured?: string[];
  /** Measured checks that failed their threshold, when failed. */
  failedChecks?: string[];
  reason?: string;
}

/** The candidate (checkout) the evidence was read for. */
export interface AttestationCandidate {
  status: 'resolved' | 'unavailable';
  id: string;
  project?: string;
  head?: string;
  dirty?: boolean;
  fingerprint?: string;
  reason?: string;
}

export interface AttestationEvidence {
  candidate: AttestationCandidate;
  testsExecuted: AttestationEvidenceEntry;
  coverageChecked: AttestationEvidenceEntry;
  securityScanned: AttestationEvidenceEntry;
  qualityGate: AttestationGateEvidence;
}

export interface QualityAttestation {
  version: string;
  timestamp: string;
  projectRoot: string;
  /** Each flag is true only when its evidence was measured for this checkout (#1453). */
  attestation: {
    testsExecuted: boolean;
    coverageChecked: boolean;
    securityScanned: boolean;
    qualityGatePassed: boolean;
  };
  /** Why each flag has the value it has: receipts used, or why it is unmeasured. */
  evidence: AttestationEvidence;
  /** Informational readings of on-disk reports; they never set an attestation flag. */
  metrics: {
    testCount: number;
    passRate: number;
    coveragePercent: number;
    /** Vulnerabilities of a recorded security scan; null when no scan was recorded (#1453). */
    vulnerabilities: number | null;
    qualityScore: number;
    patternsUsed: number;
  };
  hash: string;
  generatedBy: string;
}

/**
 * Generate SHA-256 hash of attestation data (excluding the hash field itself).
 */
export function hashAttestation(data: Omit<QualityAttestation, 'hash'>): string {
  const serialized = JSON.stringify(data, null, 0);
  return crypto.createHash('sha256').update(serialized).digest('hex');
}

const FLAG_METRICS = {
  testsExecuted: 'testsPassing',
  coverageChecked: 'coverage',
  securityScanned: 'securityVulnerabilities',
} as const satisfies Record<string, QualityMetricName>;

type EvidenceFlag = keyof typeof FLAG_METRICS;

function summarizeCandidate(candidate: QualityEvidenceCandidate): AttestationCandidate {
  return candidate.status === 'resolved'
    ? {
      status: 'resolved', id: candidate.id, project: candidate.project,
      head: candidate.head, dirty: candidate.dirty, fingerprint: candidate.fingerprint,
    }
    : { status: 'unavailable', id: candidate.id, project: candidate.project, reason: candidate.reason };
}

/**
 * The evidence of an attestation made without an evidence store: every flag
 * is unmeasured. Never a pass.
 */
export function unavailableAttestationEvidence(reason: string): AttestationEvidence {
  const entry = (metric: QualityMetricName): AttestationEvidenceEntry => ({
    metric, status: 'unmeasured', code: 'evidence-store-unavailable', reason,
  });
  return {
    candidate: { status: 'unavailable', id: 'unavailable', reason },
    testsExecuted: entry(FLAG_METRICS.testsExecuted),
    coverageChecked: entry(FLAG_METRICS.coverageChecked),
    securityScanned: entry(FLAG_METRICS.securityScanned),
    qualityGate: { status: 'unmeasured', exitCode: 3, reason },
  };
}

/**
 * #1453: read the attestation evidence of ONE candidate from the evidence
 * store — the receipts `aqe quality --gate` reads, and the verdict it reaches
 * for the same checkout. The candidate is resolved once and used for both.
 */
export async function collectAttestationEvidence(
  memory: Pick<MemoryBackend, 'get'>,
  options: { candidate?: QualityEvidenceCandidate; now?: number } = {},
): Promise<AttestationEvidence> {
  const candidate = options.candidate ?? resolveQualityEvidenceCandidate();
  const readOptions = { candidate, ...(options.now !== undefined ? { now: options.now } : {}) };
  const inspection = await inspectQualityEvidence(memory, readOptions);

  const entry = (flag: EvidenceFlag): AttestationEvidenceEntry => {
    const metric = FLAG_METRICS[flag];
    const receipt = inspection.receipts[metric];
    if (receipt && inspection.values[metric] !== undefined) {
      return {
        metric, status: 'measured', value: inspection.values[metric],
        receiptId: receipt.receiptId, source: receipt.source, measuredAt: receipt.measuredAt,
        ...(receipt.runId ? { runId: receipt.runId } : {}),
      };
    }
    const problem = inspection.problems.find((p) => p.metric === metric);
    return {
      metric, status: 'unmeasured', code: problem?.code ?? 'missing',
      reason: problem?.reason ?? `No measured quality evidence found for ${metric}.`,
    };
  };

  // The same evaluation `aqe quality --gate` performs (src/cli/commands/quality.ts).
  let gate: QualityGateResult;
  try {
    gate = evaluateMeasuredQualityEvidence(await loadQualityEvidenceSet(memory, readOptions));
  } catch (error) {
    gate = await describeUnavailableQualityEvidence(memory as MemoryBackend, error);
  }
  const exitCode = getMeasuredQualityExitCode(gate);
  const qualityGate: AttestationGateEvidence = gate.evidenceStatus === 'insufficient-evidence'
    ? { status: 'unmeasured', exitCode, unmeasured: gate.unmeasured ?? [], reason: gate.error }
    : gate.passed
      ? { status: 'passed', exitCode }
      : {
        status: 'failed', exitCode,
        failedChecks: gate.checks.filter((check) => !check.passed).map((check) => check.name),
      };

  return {
    candidate: summarizeCandidate(inspection.candidate),
    testsExecuted: entry('testsExecuted'),
    coverageChecked: entry('coverageChecked'),
    securityScanned: entry('securityScanned'),
    qualityGate,
  };
}

/**
 * Weighted heuristic score of the informational metrics. Security counts only
 * when a scan was recorded (#1453): no scan earns no credit.
 */
function computeQualityScore(metrics: QualityAttestation['metrics']): number {
  const security = metrics.vulnerabilities === null
    ? 0
    : Math.max(0, 100 - metrics.vulnerabilities * 10);
  return Math.round(metrics.passRate * 0.4 + metrics.coveragePercent * 0.3 + security * 0.3);
}

/**
 * Collect informational quality metrics from project artifacts on disk. The
 * vulnerability count comes only from a recorded security scan in `evidence`.
 */
export async function collectMetrics(
  projectRoot: string,
  evidence?: AttestationEvidence,
): Promise<QualityAttestation['metrics']> {
  const scan = evidence?.securityScanned;
  const metrics: QualityAttestation['metrics'] = {
    testCount: 0,
    passRate: 0,
    coveragePercent: 0,
    vulnerabilities: scan?.status === 'measured' && scan.value !== undefined ? scan.value : null,
    qualityScore: 0,
    patternsUsed: 0,
  };

  // Check for junit.xml (test results)
  try {
    const junitPath = path.join(projectRoot, 'junit.xml');
    if (fs.existsSync(junitPath)) {
      const content = fs.readFileSync(junitPath, 'utf-8');
      const testsMatch = content.match(/tests="(\d+)"/);
      const failsMatch = content.match(/failures="(\d+)"/);
      if (testsMatch) {
        metrics.testCount = parseInt(testsMatch[1], 10);
        const failures = failsMatch ? parseInt(failsMatch[1], 10) : 0;
        metrics.passRate = metrics.testCount > 0
          ? ((metrics.testCount - failures) / metrics.testCount) * 100
          : 0;
      }
    }
  } catch { /* non-critical */ }

  // Check for coverage summary
  try {
    // #1337: confined read, so a FIFO cannot hang the command and a report
    // symlinked out of the project is not read. Missing or refused: skipped.
    const coveragePath = path.join(projectRoot, 'coverage', 'coverage-summary.json');
    const coverage = JSON.parse(await readConfinedText(coveragePath, { projectRoot, outsideRoot: 'allow' }));
    metrics.coveragePercent = coverage?.total?.lines?.pct ?? 0;
  } catch { /* non-critical: missing, refused, or unparseable */ }

  // Check for memory.db patterns
  try {
    const dbPath = path.join(projectRoot, '.agentic-qe', 'memory.db');
    if (fs.existsSync(dbPath)) {
      metrics.patternsUsed = 1;
    }
  } catch { /* non-critical */ }

  metrics.qualityScore = computeQualityScore(metrics);
  return metrics;
}

/**
 * Build a full attestation. Flags come only from `evidence`; without it no
 * evidence store was read and every flag is false (unmeasured).
 */
export function buildAttestation(
  projectRoot: string,
  metrics: QualityAttestation['metrics'],
  evidence: AttestationEvidence = unavailableAttestationEvidence('No evidence store was read.'),
): QualityAttestation {
  const data: Omit<QualityAttestation, 'hash'> = {
    version: ATTESTATION_VERSION,
    timestamp: new Date().toISOString(),
    projectRoot,
    attestation: {
      testsExecuted: evidence.testsExecuted.status === 'measured',
      coverageChecked: evidence.coverageChecked.status === 'measured',
      securityScanned: evidence.securityScanned.status === 'measured',
      qualityGatePassed: evidence.qualityGate.status === 'passed',
    },
    evidence,
    metrics,
    generatedBy: 'agentic-qe prove',
  };

  const hash = hashAttestation(data);
  return { ...data, hash };
}

function flagCell(value: boolean, entry: AttestationEvidenceEntry): string {
  if (value) return 'PASS';
  return entry.status === 'unmeasured' ? `UNMEASURED (${entry.code ?? 'missing'})` : 'FAIL';
}

function gateCell(gate: AttestationGateEvidence): string {
  if (gate.status === 'passed') return 'PASSED';
  if (gate.status === 'failed') return `FAILED (${(gate.failedChecks ?? []).join(', ')})`;
  return 'NOT EVALUATED (insufficient evidence)';
}

/**
 * Format attestation as Markdown.
 */
export function formatMarkdown(att: QualityAttestation): string {
  const ev = att.evidence;
  return [
    '# Proof of Quality',
    '',
    `**Generated:** ${att.timestamp}`,
    `**Project:** ${att.projectRoot}`,
    `**Candidate:** ${ev.candidate.status === 'resolved' ? `${ev.candidate.head}${ev.candidate.dirty ? ' (dirty)' : ''}` : 'unavailable'}`,
    `**Hash:** \`${att.hash}\``,
    '',
    '## Attestation',
    '',
    '| Check | Status |',
    '|-------|--------|',
    `| Tests Executed | ${flagCell(att.attestation.testsExecuted, ev.testsExecuted)} |`,
    `| Coverage Checked | ${flagCell(att.attestation.coverageChecked, ev.coverageChecked)} |`,
    `| Security Scanned | ${flagCell(att.attestation.securityScanned, ev.securityScanned)} |`,
    `| Quality Gate | ${gateCell(ev.qualityGate)} |`,
    '',
    '## Metrics',
    '',
    '| Metric | Value |',
    '|--------|-------|',
    `| Tests | ${att.metrics.testCount} |`,
    `| Pass Rate | ${att.metrics.passRate.toFixed(1)}% |`,
    `| Coverage | ${att.metrics.coveragePercent.toFixed(1)}% |`,
    `| Vulnerabilities | ${att.metrics.vulnerabilities ?? 'unmeasured (no recorded scan)'} |`,
    `| Quality Score | ${att.metrics.qualityScore}/100 |`,
    '',
    '---',
    `*${att.generatedBy}*`,
  ].join('\n');
}

/**
 * Main prove handler (exported for direct use and testing).
 */
export async function handleProve(options: {
  format?: 'json' | 'markdown';
  output?: string;
  projectRoot?: string;
  /** The evidence store; without it every flag is unmeasured. */
  memory?: Pick<MemoryBackend, 'get'>;
  /** The candidate to attest; resolved from the project checkout when omitted. */
  candidate?: QualityEvidenceCandidate;
}): Promise<QualityAttestation> {
  const projectRoot = options.projectRoot ?? process.cwd();
  const evidence = options.memory
    ? await collectAttestationEvidence(options.memory, {
      candidate: options.candidate ?? resolveQualityEvidenceCandidate(options.projectRoot),
    })
    : unavailableAttestationEvidence('No evidence store was available to read measured evidence from.');
  const metrics = await collectMetrics(projectRoot, evidence);
  const attestation = buildAttestation(projectRoot, metrics, evidence);

  const content = options.format === 'markdown'
    ? formatMarkdown(attestation)
    : JSON.stringify(attestation, null, 2);

  if (options.output) {
    fs.writeFileSync(options.output, content);
    // #1474: an attestation written into the checkout is AQE's own output and
    // does not change the candidate it attests.
    recordOutputInCandidate(path.resolve(options.output));
    console.log(`Quality attestation written to ${options.output}`);
  } else {
    console.log(content);
  }

  return attestation;
}

/**
 * Create the Commander command following the project convention.
 */
export function createProveCommand(
  context: CLIContext,
  cleanupAndExit: (code: number) => Promise<never>,
  ensureInitialized: () => Promise<boolean>,
): Command {
  return new Command('prove')
    .description('Generate a Proof-of-Quality attestation from measured evidence')
    .option('-F, --format <format>', 'Output format (json|markdown)', 'json')
    .option('-o, --output <path>', 'Write attestation to file')
    .action(async (options) => {
      // The evidence store `aqe quality --gate` reads (#1453).
      if (!await ensureInitialized()) return;
      try {
        await handleProve({
          format: options.format as 'json' | 'markdown',
          output: options.output,
          memory: context.kernel!.memory,
        });
        await cleanupAndExit(0);
      } catch (error) {
        console.error('Failed to generate proof-of-quality:', error);
        await cleanupAndExit(1);
      }
    });
}
