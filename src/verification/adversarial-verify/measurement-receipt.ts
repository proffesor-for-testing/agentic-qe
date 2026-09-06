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
export type ReceiptIdentifierField =
  | 'provider'
  | 'requestedModel'
  | 'resolvedModel'
  | 'fingerprint'
  | 'windowId'
  | 'requestId';

export const RECEIPT_IDENTIFIER_PATTERN = '^(?:UNKNOWN|[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,255})$';
export const RECEIPT_SENSITIVE_IDENTIFIER_PATTERN =
  '^(?:(?:[sS][kK]|[rR][kK]|[gG][hH][pPoOuUsSrR]|[gG][iI][tT][hH][uU][bB]_[pP][aA][tT]|[xX][oO][xX][bBaApPrRsS]|[nN][pP][mM]|[gG][lL][pP][aA][tT]|[pP][aA][tT])[-_]|(?:[aA][kK][iI][aA]|[aA][sS][iI][aA]|[aA][iI][zZ][aA]))';
export const RECEIPT_JWT_PATTERN =
  '^(?:eyJ[A-Za-z0-9_-]*|e30|ew[A-Za-z0-9_-]*)\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+$';
export const RECEIPT_OPAQUE_DESCRIPTOR_PATTERN = '^[A-Za-z0-9]{32,}$';
export const RECEIPT_OPAQUE_CORRELATION_PATTERN =
  '^(?:[A-Za-z0-9+/]{32,}={0,2}|[A-Za-z0-9_-]{48,})$';

const SAFE_IDENTIFIER = new RegExp(RECEIPT_IDENTIFIER_PATTERN);
const SENSITIVE_IDENTIFIER = new RegExp(RECEIPT_SENSITIVE_IDENTIFIER_PATTERN);
const JWT = new RegExp(RECEIPT_JWT_PATTERN);
const OPAQUE_DESCRIPTOR = new RegExp(RECEIPT_OPAQUE_DESCRIPTOR_PATTERN);
const OPAQUE_CORRELATION = new RegExp(RECEIPT_OPAQUE_CORRELATION_PATTERN);
const RECEIPT_HASH_FIELDS = [
  'requestHash', 'promptHash', 'configHash', 'parserSchemaHash', 'outputHash', 'parsedVoteHash',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function looksLikeOpaqueCredential(value: string, field: ReceiptIdentifierField): boolean {
  if (SENSITIVE_IDENTIFIER.test(value) || JWT.test(value)) return true;
  if (field === 'provider' || field === 'requestedModel' || field === 'resolvedModel') {
    return OPAQUE_DESCRIPTOR.test(value);
  }
  return OPAQUE_CORRELATION.test(value);
}

export function isSanitizedReceiptIdentifier(
  candidate: unknown,
  field: ReceiptIdentifierField,
): candidate is string {
  return typeof candidate === 'string'
    && SAFE_IDENTIFIER.test(candidate)
    && !looksLikeOpaqueCredential(candidate, field);
}

function identifier(candidate: unknown, field: ReceiptIdentifierField): string {
  return typeof candidate === 'string'
    && isSanitizedReceiptIdentifier(candidate, field)
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
      provider: identifier(value.provider, 'provider'),
      requestedModel: identifier(value.requestedModel, 'requestedModel'),
      resolvedModel: identifier(value.resolvedModel, 'resolvedModel'),
      endpointClass: enumOr(value.endpointClass, ENDPOINT_CLASSES, 'UNKNOWN'),
      snapshotIdentity: enumOr(value.snapshotIdentity, SNAPSHOT_LEVELS, 'L0_UNKNOWN'),
      semantics: enumOr(value.semantics, SEMANTICS, 'UNKNOWN'),
      fingerprint: identifier(value.fingerprint, 'fingerprint'),
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
      retryCount: typeof value.retryCount === 'number' && Number.isSafeInteger(value.retryCount) && value.retryCount >= 0
        ? value.retryCount
        : 0,
      timestamp: timestamp(value.timestamp),
      windowId: identifier(value.windowId, 'windowId'),
      latencyMs: finiteNonNegativeOrNull(value.latencyMs),
      requestId: identifier(value.requestId, 'requestId'),
    };

    const contentBound = sanitized.fingerprint !== 'UNKNOWN'
      && RECEIPT_HASH_FIELDS.every((field) => sanitized[field] !== 'UNKNOWN');
    const namedSnapshot = sanitized.resolvedModel !== 'UNKNOWN';
    if ((sanitized.snapshotIdentity === 'L2_CONTENT_BOUND' && !contentBound)
      || (sanitized.snapshotIdentity === 'L1_NAMED' && !namedSnapshot)) {
      sanitized.snapshotIdentity = 'L0_UNKNOWN';
    }
    if (sanitized.snapshotIdentity === 'L0_UNKNOWN'
      || sanitized.fingerprint === 'UNKNOWN'
      || (sanitized.semantics === 'verified'
        && (sanitized.snapshotIdentity !== 'L2_CONTENT_BOUND' || !contentBound))) {
      sanitized.semantics = 'UNKNOWN';
    }
    return sanitized;
  } catch {
    return unknownReceipt();
  }
}
