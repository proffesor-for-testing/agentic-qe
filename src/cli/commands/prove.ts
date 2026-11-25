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
import { findProjectRoot } from '../../kernel/project-root.js';
import { readConfinedText } from '../../shared/io/confined-read.js';
import type { QualityGateResult } from '../utils/ci-output.js';
import {
  InsufficientQualityEvidenceError,
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

/** Report files on disk, read for information only (#1453). */
export interface AttestationUnboundFiles {
  /** `junit.xml` at the project root. */
  junit: { testCount: number; passRate: number } | null;
  /** `coverage/coverage-summary.json` (line coverage %). */
  coverageSummary: { linesPct: number } | null;
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
  /**
   * #1453: values of the same candidate-bound receipts the flags are read
   * from; null when unmeasured. They never contradict `attestation`.
   */
  metrics: {
    /** Always null: evidence receipts carry the pass rate, not test counts (see `unboundFiles`). */
    testCount: number | null;
    /** testsPassing receipt (% of tests passed). */
    passRate: number | null;
    /** coverage receipt (line coverage %). */
    coveragePercent: number | null;
    /** securityVulnerabilities receipt (count of a recorded scan). */
    vulnerabilities: number | null;
    /** Weighted heuristic of the three values above; null unless all three are measured. */
    qualityScore: number | null;
    patternsUsed: number;
  };
  /**
   * Report files found on disk. They are not bound to the checkout (they may
   * be stale or from another run), never set a flag and never feed a metric.
   */
  unboundFiles: AttestationUnboundFiles;
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
    // Describe the problems of THIS candidate (the inspection above), never re-resolve it.
    const insufficient = error instanceof InsufficientQualityEvidenceError
      ? error
      : inspection.problems.length > 0
        ? new InsufficientQualityEvidenceError(inspection.problems, inspection.candidate)
        : undefined;
    if (!insufficient) throw error;
    gate = await describeUnavailableQualityEvidence(memory as MemoryBackend, insufficient);
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

function measuredValue(entry: AttestationEvidenceEntry): number | null {
  return entry.status === 'measured' && entry.value !== undefined ? entry.value : null;
}

/**
 * Weighted heuristic score of the measured values; null unless the pass rate,
 * coverage and vulnerability count are all measured (#1453: no partial credit).
 */
function computeQualityScore(m: Pick<QualityAttestation['metrics'], 'passRate' | 'coveragePercent' | 'vulnerabilities'>): number | null {
  if (m.passRate === null || m.coveragePercent === null || m.vulnerabilities === null) return null;
  const security = Math.max(0, 100 - m.vulnerabilities * 10);
  return Math.round(m.passRate * 0.4 + m.coveragePercent * 0.3 + security * 0.3);
}

/**
 * #1453: the attestation metrics, taken from the same candidate-bound
 * receipts as the flags. Without evidence every value is unmeasured (null).
 */
export async function collectMetrics(
  projectRoot: string,
  evidence: AttestationEvidence = unavailableAttestationEvidence('No evidence store was read.'),
): Promise<QualityAttestation['metrics']> {
  const measured = {
    passRate: measuredValue(evidence.testsExecuted),
    coveragePercent: measuredValue(evidence.coverageChecked),
    vulnerabilities: measuredValue(evidence.securityScanned),
  };
  let patternsUsed = 0;
  try {
    if (fs.existsSync(path.join(projectRoot, '.agentic-qe', 'memory.db'))) patternsUsed = 1;
  } catch { /* non-critical */ }
  return { testCount: null, ...measured, qualityScore: computeQualityScore(measured), patternsUsed };
}

/**
 * Read the report files a project may hold on disk, for information only:
 * they are not bound to the checkout (#1453).
 */
export async function collectUnboundFiles(projectRoot: string): Promise<AttestationUnboundFiles> {
  const files: AttestationUnboundFiles = { junit: null, coverageSummary: null };

  try {
    const junitPath = path.join(projectRoot, 'junit.xml');
    if (fs.existsSync(junitPath)) {
      const content = fs.readFileSync(junitPath, 'utf-8');
      const testsMatch = content.match(/tests="(\d+)"/);
      const failsMatch = content.match(/failures="(\d+)"/);
      if (testsMatch) {
        const testCount = parseInt(testsMatch[1], 10);
        const failures = failsMatch ? parseInt(failsMatch[1], 10) : 0;
        files.junit = { testCount, passRate: testCount > 0 ? ((testCount - failures) / testCount) * 100 : 0 };
      }
    }
  } catch { /* non-critical */ }

  try {
    // #1337: confined read, so a FIFO cannot hang the command and a report
    // symlinked out of the project is not read. Missing or refused: skipped.
    const coveragePath = path.join(projectRoot, 'coverage', 'coverage-summary.json');
    const coverage = JSON.parse(await readConfinedText(coveragePath, { projectRoot, outsideRoot: 'allow' }));
    const pct = coverage?.total?.lines?.pct;
    if (typeof pct === 'number' && Number.isFinite(pct)) files.coverageSummary = { linesPct: pct };
  } catch { /* non-critical: missing, refused, or unparseable */ }

  return files;
}

/**
 * Build a full attestation. Flags come only from `evidence`; without it no
 * evidence store was read and every flag is false (unmeasured).
 */
export function buildAttestation(
  projectRoot: string,
  metrics: QualityAttestation['metrics'],
  evidence: AttestationEvidence = unavailableAttestationEvidence('No evidence store was read.'),
  unboundFiles: AttestationUnboundFiles = { junit: null, coverageSummary: null },
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
    unboundFiles,
    generatedBy: 'agentic-qe prove',
  };

  const hash = hashAttestation(data);
  return { ...data, hash };
}

/** An evidence flag says whether a check was measured, not whether it passed: that is the gate's row. */
function flagCell(entry: AttestationEvidenceEntry): string {
  return entry.status === 'measured'
    ? `MEASURED (${entry.metric} = ${entry.value})`
    : `UNMEASURED (${entry.code ?? 'missing'}: ${entry.reason ?? 'no measured evidence'})`;
}

function valueCell(value: number | null, unit = ''): string {
  return value === null ? 'unmeasured' : `${Number.isInteger(value) ? value : value.toFixed(1)}${unit}`;
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
    `| Tests Executed | ${flagCell(ev.testsExecuted)} |`,
    `| Coverage Checked | ${flagCell(ev.coverageChecked)} |`,
    `| Security Scanned | ${flagCell(ev.securityScanned)} |`,
    `| Quality Gate | ${gateCell(ev.qualityGate)} |`,
    '',
    '## Metrics',
    '',
    '| Metric | Value |',
    '|--------|-------|',
    `| Pass Rate | ${valueCell(att.metrics.passRate, '%')} |`,
    `| Coverage | ${valueCell(att.metrics.coveragePercent, '%')} |`,
    `| Vulnerabilities | ${valueCell(att.metrics.vulnerabilities)} |`,
    `| Quality Score | ${att.metrics.qualityScore === null ? 'unmeasured' : `${att.metrics.qualityScore}/100`} |`,
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
  const attestation = buildAttestation(projectRoot, metrics, evidence, await collectUnboundFiles(projectRoot));

  const content = options.format === 'markdown'
    ? formatMarkdown(attestation)
    : JSON.stringify(attestation, null, 2);

  if (options.output) {
    fs.writeFileSync(options.output, content);
    // #1474: an attestation written into the checkout is AQE's own output and
    // does not change the candidate it attests.
    recordOutputInCandidate(path.resolve(options.output), options.projectRoot);
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
    .option('-o, --output <path>',
      'Write attestation to file (keeps the attested candidate stable; a shell redirect into the checkout does not)')
    .action(async (options) => {
      // #1453: an attestation only reads evidence; it never creates a store.
      // The store file, not the directory: CLI startup creates an empty
      // `.agentic-qe` directory before any command runs.
      if (!fs.existsSync(path.join(findProjectRoot(), '.agentic-qe', 'memory.db'))) {
        console.error('AQE is not initialized in this project, so there is no measured evidence to attest. '
          + 'Run `aqe init` first.');
        await cleanupAndExit(1);
        return;
      }
      // The evidence store `aqe quality --gate` reads.
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
