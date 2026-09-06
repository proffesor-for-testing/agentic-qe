/**
 * @ruvector/adversarial-verify — the orchestrator.
 *
 * For each finding, run N BLIND refuters in parallel (each gets only the bare
 * claim + evidence + a distinct lens), then deterministically synthesize the
 * finding-verdict@1. The LLM is injected (`Judge`) — no host dependency.
 */
import type {
  AdversarialVerifyOptions,
  CacheStatus,
  EndpointClass,
  Finding,
  FindingVerdict,
  JudgeMeasurementReceipt,
  ReceiptSemantics,
  RefuterVote,
  SnapshotIdentityLevel,
} from './types.js';
import { DEFAULT_LENSES, refuterPrompt } from './prompts.js';
import { majorityKill, synthesizeVerdict } from './synthesize.js';

const ENDPOINT_CLASSES = new Set<EndpointClass>(['shared', 'dedicated', 'local', 'UNKNOWN']);
const SNAPSHOT_LEVELS = new Set<SnapshotIdentityLevel>(['L0_UNKNOWN', 'L1_NAMED', 'L2_CONTENT_BOUND']);
const SEMANTICS = new Set<ReceiptSemantics>(['verified', 'provider-asserted', 'UNKNOWN']);
const CACHE_STATUSES = new Set<CacheStatus>(['hit', 'miss', 'bypass', 'UNKNOWN']);

function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function sanitizeReceipt(value: JudgeMeasurementReceipt): JudgeMeasurementReceipt {
  const text = (candidate: unknown): string => typeof candidate === 'string' && candidate.length > 0
    ? candidate
    : 'UNKNOWN';
  const hash = (candidate: unknown): string => typeof candidate === 'string'
    && /^(?:sha256:)?[a-f\d]{64}$/i.test(candidate)
    ? candidate.toLowerCase()
    : 'UNKNOWN';
  const enumOr = <T extends string>(candidate: unknown, allowed: Set<T>, fallback: T): T =>
    typeof candidate === 'string' && allowed.has(candidate as T) ? candidate as T : fallback;
  return {
    contract: 'judge-measurement@1',
    provider: text(value.provider),
    requestedModel: text(value.requestedModel),
    resolvedModel: text(value.resolvedModel),
    endpointClass: enumOr(value.endpointClass, ENDPOINT_CLASSES, 'UNKNOWN'),
    snapshotIdentity: enumOr(value.snapshotIdentity, SNAPSHOT_LEVELS, 'L0_UNKNOWN'),
    semantics: enumOr(value.semantics, SEMANTICS, 'UNKNOWN'),
    fingerprint: text(value.fingerprint),
    requestHash: hash(value.requestHash),
    promptHash: hash(value.promptHash),
    configHash: hash(value.configHash),
    parserSchemaHash: hash(value.parserSchemaHash),
    outputHash: hash(value.outputHash),
    parsedVoteHash: hash(value.parsedVoteHash),
    temperature: finiteOrNull(value.temperature),
    topP: finiteOrNull(value.topP),
    seed: finiteOrNull(value.seed),
    deterministic: typeof value.deterministic === 'boolean' ? value.deterministic : null,
    cacheStatus: enumOr(value.cacheStatus, CACHE_STATUSES, 'UNKNOWN'),
    retryCount: typeof value.retryCount === 'number' && Number.isInteger(value.retryCount) && value.retryCount >= 0
      ? value.retryCount
      : 0,
    timestamp: text(value.timestamp),
    windowId: text(value.windowId),
    latencyMs: finiteOrNull(value.latencyMs),
    requestId: text(value.requestId),
  };
}

/** Call one refuter; a thrown/`null` result is a failed vote (excluded). */
async function castVote(judge: AdversarialVerifyOptions['judge'], finding: Finding, lens: string): Promise<RefuterVote | null> {
  try {
    const v = await judge(refuterPrompt(finding, lens));
    return v && typeof v.refuted === 'boolean' ? {
      refuted: v.refuted,
      reasoning: String(v.reasoning ?? ''),
      ...(v.measurementReceipt ? { measurementReceipt: sanitizeReceipt(v.measurementReceipt) } : {}),
    } : null;
  } catch {
    return null;
  }
}

/**
 * Adversarially verify findings: N blind refuters per finding → majority-kill →
 * finding-verdict@1 envelopes (one per finding, in input order).
 */
export async function adversarialVerify(
  findings: Finding[],
  opts: AdversarialVerifyOptions,
): Promise<FindingVerdict[]> {
  const lenses = opts.lenses ?? DEFAULT_LENSES;
  const refuters = Math.max(1, Math.min(opts.refuters ?? 3, lenses.length));
  const threshold = opts.killThreshold ?? majorityKill;

  return Promise.all(
    findings.map(async (finding) => {
      const votes = (
        await Promise.all(lenses.slice(0, refuters).map((lens) => castVote(opts.judge, finding, lens)))
      ).filter((v): v is RefuterVote => v != null);
      return synthesizeVerdict(finding, votes, threshold);
    }),
  );
}

/** Convenience: split verdicts into confirmed (upheld) / killed (refuted) / uncertain. */
export function partitionVerdicts(verdicts: FindingVerdict[]): {
  confirmed: FindingVerdict[];
  killed: FindingVerdict[];
  uncertain: FindingVerdict[];
} {
  return {
    confirmed: verdicts.filter((v) => v.verdict === 'upheld'),
    killed: verdicts.filter((v) => v.verdict === 'refuted'),
    uncertain: verdicts.filter((v) => v.verdict === 'uncertain'),
  };
}
