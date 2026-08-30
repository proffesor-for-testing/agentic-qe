/**
 * @ruvector/adversarial-verify — calibration (plan 05 / A2 step 5).
 *
 * Measure the verifier against a LABELED set (findings tagged real/false) to get
 * the operating point: false-kill (a REAL finding wrongly refuted — the costly
 * error) and false-keep (a FALSE finding that survives). Works with any `Judge`
 * — a deterministic stub (characterize the k-of-n aggregation) or a real LLM
 * (empirical false-kill on a labeled corpus).
 */
import type { AdversarialVerifyOptions, Finding, FindingSeverity, FindingOutcome } from './types.js';
import { adversarialVerify } from './verify.js';

export interface LabeledFinding {
  finding: Finding;
  /** Ground truth: is this a genuine, actionable problem? */
  isReal: boolean;
  failureType?: string;
  domain?: string;
  expectedSeverity?: FindingSeverity;
  source?: 'human' | 'oracle' | 'controlled-intervention';
}

export interface ConfidenceInterval { low: number; high: number; level: 0.95 }
export type QualificationDisposition = 'automate' | 'human-review' | 'abstain';

export interface QualificationSlice {
  key: string;
  support: number;
  precision: number;
  recall: number;
  falseKillRate: number;
  falseKeepRate: number;
  uncertainRate: number;
  intervals: {
    precision: ConfidenceInterval;
    recall: ConfidenceInterval;
    falseKillRate: ConfidenceInterval;
    falseKeepRate: ConfidenceInterval;
  };
  disposition: QualificationDisposition;
}

export interface QualificationOptions {
  minSupport?: number;
  minRecall?: number;
  minPrecision?: number;
  maxFalseKillRate?: number;
  maxFalseKeepRate?: number;
  criticalSeverities?: FindingSeverity[];
}

export interface JudgeQualification {
  status: 'qualified' | 'restricted' | 'unqualified';
  automatedSlices: string[];
  humanReviewSlices: string[];
  abstainSlices: string[];
  reasons: string[];
}

export interface CalibrationReport {
  total: number;
  realCount: number;
  falseCount: number;
  /** REAL findings wrongly refuted (the costly error). */
  falseKill: number;
  falseKillRate: number; // over realCount
  /** FALSE findings wrongly upheld (survived verification). */
  falseKeep: number;
  falseKeepRate: number; // over falseCount
  correctConfirm: number; // real & upheld
  correctKill: number; // false & refuted
  uncertain: number; // no votes cast
  slices: QualificationSlice[];
  qualification: JudgeQualification;
}

const DEFAULT_QUALIFICATION: Required<QualificationOptions> = {
  minSupport: 10,
  minRecall: 0.8,
  minPrecision: 0.8,
  maxFalseKillRate: 0.1,
  maxFalseKeepRate: 0.1,
  criticalSeverities: ['critical', 'high'],
};

function wilson(successes: number, total: number): ConfidenceInterval {
  if (total === 0) return { low: 0, high: 1, level: 0.95 };
  const z = 1.959963984540054;
  const p = successes / total;
  const z2 = z * z;
  const denominator = 1 + z2 / total;
  const centre = (p + z2 / (2 * total)) / denominator;
  const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total) / denominator;
  return { low: Math.max(0, centre - margin), high: Math.min(1, centre + margin), level: 0.95 };
}

function buildSlice(
  key: string,
  entries: Array<{ label: LabeledFinding; verdict: FindingOutcome }>,
  policy: Required<QualificationOptions>,
): QualificationSlice {
  const real = entries.filter(entry => entry.label.isReal);
  const falseEntries = entries.filter(entry => !entry.label.isReal);
  const upheldReal = real.filter(entry => entry.verdict === 'upheld').length;
  const upheldFalse = falseEntries.filter(entry => entry.verdict === 'upheld').length;
  const falseKill = real.filter(entry => entry.verdict === 'refuted').length;
  const falseKeep = upheldFalse;
  const uncertain = entries.filter(entry => entry.verdict === 'uncertain').length;
  const upheld = upheldReal + upheldFalse;
  const precision = upheld ? upheldReal / upheld : 0;
  const recall = real.length ? upheldReal / real.length : 0;
  const falseKillRate = real.length ? falseKill / real.length : 0;
  const falseKeepRate = falseEntries.length ? falseKeep / falseEntries.length : 0;
  const intervals = {
    precision: wilson(upheldReal, upheld),
    recall: wilson(upheldReal, real.length),
    falseKillRate: wilson(falseKill, real.length),
    falseKeepRate: wilson(falseKeep, falseEntries.length),
  };
  let disposition: QualificationDisposition = 'automate';
  if (entries.length < policy.minSupport || real.length === 0) disposition = 'abstain';
  else if (
    intervals.recall.low < policy.minRecall
    || intervals.precision.low < policy.minPrecision
    || intervals.falseKillRate.high > policy.maxFalseKillRate
    || intervals.falseKeepRate.high > policy.maxFalseKeepRate
  ) {
    disposition = 'human-review';
  }
  return {
    key, support: entries.length, precision, recall, falseKillRate, falseKeepRate,
    uncertainRate: entries.length ? uncertain / entries.length : 0,
    intervals,
    disposition,
  };
}

export function qualifyJudge(
  slices: QualificationSlice[],
  criticalSliceKeys: string[] = [],
): JudgeQualification {
  const automatedSlices = slices.filter(s => s.disposition === 'automate').map(s => s.key);
  const humanReviewSlices = slices.filter(s => s.disposition === 'human-review').map(s => s.key);
  const abstainSlices = slices.filter(s => s.disposition === 'abstain').map(s => s.key);
  const presentKeys = new Set(slices.map(s => s.key));
  const missingCriticalKeys = criticalSliceKeys.filter(key => !presentKeys.has(key));
  const criticalFailures = slices.filter(
    s => criticalSliceKeys.includes(s.key) && s.disposition !== 'automate',
  );
  const status = criticalFailures.length > 0 || missingCriticalKeys.length > 0
    ? 'unqualified'
    : humanReviewSlices.length > 0 || abstainSlices.length > 0
      ? 'restricted'
      : 'qualified';
  return {
    status, automatedSlices, humanReviewSlices, abstainSlices,
    reasons: [
      ...criticalFailures.map(s => `Critical slice ${s.key} is ${s.disposition}`),
      ...missingCriticalKeys.map(key => `Critical slice ${key} is missing`),
    ],
  };
}

/** Run the verifier over a labeled set and report the confusion vs ground truth. */
export async function calibrate(
  labeled: LabeledFinding[],
  opts: AdversarialVerifyOptions,
  qualificationOptions: QualificationOptions = {},
): Promise<CalibrationReport> {
  const verdicts = await adversarialVerify(labeled.map((l) => l.finding), opts);
  const policy = { ...DEFAULT_QUALIFICATION, ...qualificationOptions };
  const r: CalibrationReport = {
    total: labeled.length, realCount: 0, falseCount: 0,
    falseKill: 0, falseKillRate: 0, falseKeep: 0, falseKeepRate: 0,
    correctConfirm: 0, correctKill: 0, uncertain: 0, slices: [],
    qualification: {
      status: 'restricted', automatedSlices: [], humanReviewSlices: [],
      abstainSlices: [], reasons: [],
    },
  };
  labeled.forEach((l, i) => {
    const v = verdicts[i].verdict;
    if (v === 'uncertain') r.uncertain++;
    if (l.isReal) {
      r.realCount++;
      if (v === 'refuted') r.falseKill++;
      else if (v === 'upheld') r.correctConfirm++;
    } else {
      r.falseCount++;
      if (v === 'upheld') r.falseKeep++;
      else if (v === 'refuted') r.correctKill++;
    }
  });
  r.falseKillRate = r.realCount ? r.falseKill / r.realCount : 0;
  r.falseKeepRate = r.falseCount ? r.falseKeep / r.falseCount : 0;
  const entries = labeled.map((label, index) => ({ label, verdict: verdicts[index].verdict }));
  const groups = new Map<string, typeof entries>();
  const add = (key: string, entry: typeof entries[number]) => {
    const group = groups.get(key) ?? [];
    group.push(entry);
    groups.set(key, group);
  };
  entries.forEach(entry => {
    add('overall', entry);
    if (entry.label.failureType) add(`failureType:${entry.label.failureType}`, entry);
    if (entry.label.domain) add(`domain:${entry.label.domain}`, entry);
    const severity = entry.label.expectedSeverity ?? entry.label.finding.severity;
    add(`severity:${severity}`, entry);
  });
  const criticalKeys = policy.criticalSeverities.map(severity => `severity:${severity}`);
  for (const key of criticalKeys) {
    if (!groups.has(key)) groups.set(key, []);
  }
  r.slices = [...groups.entries()].map(([key, group]) => buildSlice(key, group, policy));
  r.qualification = qualifyJudge(r.slices, criticalKeys);
  return r;
}
