import type {
  CacheStatus,
  EndpointClass,
  JudgeMeasurementReceipt,
  ReceiptSemantics,
  SnapshotIdentityLevel,
} from './types.js';

const ENDPOINT_CLASSES = new Set<EndpointClass>(['shared', 'dedicated', 'local', 'UNKNOWN']);
const SNAPSHOT_LEVELS = new Set<SnapshotIdentityLevel>(['L0_UNKNOWN', 'L1_NAMED', 'L2_CONTENT_BOUND']);
const SEMANTICS = new Set<ReceiptSemantics>(['verified', 'provider-asserted', 'UNKNOWN']);
const CACHE_STATUSES = new Set<CacheStatus>(['hit', 'miss', 'bypass', 'UNKNOWN']);
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,255}$/;
const SENSITIVE_IDENTIFIER = /^(?:(?:sk|rk|gh[pousr]|github_pat|xox[baprs]|npm|glpat|pat)[-_]|(?:akia|asia|aiza))/i;
const JWT = /^[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}$/;
const OPAQUE_TOKEN = /^[A-Za-z0-9_-]{32,}$/;
const RECEIPT_HASH_FIELDS = [
  'requestHash', 'promptHash', 'configHash', 'parserSchemaHash', 'outputHash', 'parsedVoteHash',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function looksLikeOpaqueCredential(value: string): boolean {
  if (SENSITIVE_IDENTIFIER.test(value) || JWT.test(value)) return true;
  return OPAQUE_TOKEN.test(value) && /[A-Za-z]/.test(value) && /\d/.test(value);
}

function identifier(candidate: unknown): string {
  return typeof candidate === 'string'
    && SAFE_IDENTIFIER.test(candidate)
    && !looksLikeOpaqueCredential(candidate)
    ? candidate
    : 'UNKNOWN';
}

function timestamp(candidate: unknown): string {
  return typeof candidate === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(candidate)
    && Number.isFinite(Date.parse(candidate))
    ? candidate
    : 'UNKNOWN';
}

function hash(candidate: unknown): string {
  return typeof candidate === 'string' && /^(?:sha256:)?[a-f\d]{64}$/i.test(candidate)
    ? `sha256:${candidate.replace(/^sha256:/i, '').toLowerCase()}`
    : 'UNKNOWN';
}

function enumOr<T extends string>(candidate: unknown, allowed: Set<T>, fallback: T): T {
  return typeof candidate === 'string' && allowed.has(candidate as T) ? candidate as T : fallback;
}

function finiteNonNegativeOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function unitOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
}

function unknownReceipt(): JudgeMeasurementReceipt {
  return {
    contract: 'judge-measurement@1',
    provider: 'UNKNOWN', requestedModel: 'UNKNOWN', resolvedModel: 'UNKNOWN',
    endpointClass: 'UNKNOWN', snapshotIdentity: 'L0_UNKNOWN', semantics: 'UNKNOWN',
    fingerprint: 'UNKNOWN', requestHash: 'UNKNOWN', promptHash: 'UNKNOWN', configHash: 'UNKNOWN',
    parserSchemaHash: 'UNKNOWN', outputHash: 'UNKNOWN', parsedVoteHash: 'UNKNOWN',
    temperature: null, topP: null, seed: null, deterministic: null, cacheStatus: 'UNKNOWN',
    retryCount: 0, timestamp: 'UNKNOWN', windowId: 'UNKNOWN', latencyMs: null, requestId: 'UNKNOWN',
  };
}

/** Convert adapter-supplied receipt evidence into the content-free public contract. */
export function sanitizeJudgeMeasurementReceipt(value: unknown): JudgeMeasurementReceipt {
  if (!isRecord(value)) return unknownReceipt();
  try {
    const sanitized: JudgeMeasurementReceipt = {
      contract: 'judge-measurement@1',
      provider: identifier(value.provider),
      requestedModel: identifier(value.requestedModel),
      resolvedModel: identifier(value.resolvedModel),
      endpointClass: enumOr(value.endpointClass, ENDPOINT_CLASSES, 'UNKNOWN'),
      snapshotIdentity: enumOr(value.snapshotIdentity, SNAPSHOT_LEVELS, 'L0_UNKNOWN'),
      semantics: enumOr(value.semantics, SEMANTICS, 'UNKNOWN'),
      fingerprint: identifier(value.fingerprint),
      requestHash: hash(value.requestHash),
      promptHash: hash(value.promptHash),
      configHash: hash(value.configHash),
      parserSchemaHash: hash(value.parserSchemaHash),
      outputHash: hash(value.outputHash),
      parsedVoteHash: hash(value.parsedVoteHash),
      temperature: finiteNonNegativeOrNull(value.temperature),
      topP: unitOrNull(value.topP),
      seed: typeof value.seed === 'number' && Number.isSafeInteger(value.seed) ? value.seed : null,
      deterministic: typeof value.deterministic === 'boolean' ? value.deterministic : null,
      cacheStatus: enumOr(value.cacheStatus, CACHE_STATUSES, 'UNKNOWN'),
      retryCount: typeof value.retryCount === 'number' && Number.isInteger(value.retryCount) && value.retryCount >= 0
        ? value.retryCount
        : 0,
      timestamp: timestamp(value.timestamp),
      windowId: identifier(value.windowId),
      latencyMs: finiteNonNegativeOrNull(value.latencyMs),
      requestId: identifier(value.requestId),
    };

    const contentBound = sanitized.fingerprint !== 'UNKNOWN'
      && RECEIPT_HASH_FIELDS.every((field) => sanitized[field] !== 'UNKNOWN');
    const namedSnapshot = sanitized.resolvedModel !== 'UNKNOWN';
    if ((sanitized.snapshotIdentity === 'L2_CONTENT_BOUND' && !contentBound)
      || (sanitized.snapshotIdentity === 'L1_NAMED' && !namedSnapshot)) {
      sanitized.snapshotIdentity = 'L0_UNKNOWN';
    }
    if (sanitized.snapshotIdentity === 'L0_UNKNOWN' || sanitized.fingerprint === 'UNKNOWN') {
      sanitized.semantics = 'UNKNOWN';
    }
    return sanitized;
  } catch {
    return unknownReceipt();
  }
}
