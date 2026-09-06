/**
 * Agentic QE v3 - Structured Verdict Contracts (ADR-103)
 *
 * Typed, versioned verdict envelopes for agent-to-agent and MCP-boundary
 * handoffs: RiskDecision (quality gates), FindingVerdict (review findings
 * with adversarial refutations), CoverageGap (risk-weighted gap reports).
 *
 * Validators are dependency-free and are the source of truth; the exported
 * JSON Schemas (published to schemas/*.schema.json by
 * scripts/generate-verdict-schemas.mjs) mirror them for external tooling
 * (ajv, workflow agent() schema option). Envelopes are versioned and
 * additive-only within a major version: consumers must tolerate unknown
 * fields, so schemas keep `additionalProperties: true`.
 */
import type { JudgeMeasurementReceipt } from '../verification/adversarial-verify/types.js';

export const VERDICT_CONTRACT_VERSION = '1.0' as const;

// ============================================================================
// Types
// ============================================================================

export type RiskDecisionOutcome = 'approve' | 'block' | 'escalate';

export interface RiskDecision {
  /** Envelope discriminator + version */
  contract: 'risk-decision@1';
  decision: RiskDecisionOutcome;
  riskFactors: string[];
  /** 0..1 */
  confidence: number;
  rationale: string;
}

export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type FindingOutcome = 'upheld' | 'refuted' | 'uncertain';

export interface FindingVerdict {
  contract: 'finding-verdict@1';
  id: string;
  title: string;
  file?: string;
  severity: FindingSeverity;
  /** 0..1 */
  confidence: number;
  evidence: string[];
  verdict: FindingOutcome;
  /** One entry per refuter that voted to refute (empty when none) */
  refutations: string[];
  /** Sanitized receipts for cast votes whose adapters supplied measurement evidence. */
  measurementReceipts?: JudgeMeasurementReceipt[];
}

export interface CoverageGap {
  contract: 'coverage-gap@1';
  file: string;
  /** 1-based inclusive line range; omit for whole-file gaps */
  rangeStart?: number;
  rangeEnd?: number;
  /** 0..1 risk weighting */
  riskScore: number;
  suggestedTests: string[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// ============================================================================
// Validators (dependency-free, boundary-grade)
// ============================================================================

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

function inUnitRange(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
}

const RECEIPT_KEYS = new Set([
  'contract', 'provider', 'requestedModel', 'resolvedModel', 'endpointClass', 'snapshotIdentity',
  'semantics', 'fingerprint', 'requestHash', 'promptHash', 'configHash', 'parserSchemaHash',
  'outputHash', 'parsedVoteHash', 'temperature', 'topP', 'seed', 'deterministic', 'cacheStatus',
  'retryCount', 'timestamp', 'windowId', 'latencyMs', 'requestId',
]);
const RECEIPT_IDENTIFIER = /^(?:UNKNOWN|[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,255})$/;
const RECEIPT_HASH = /^(?:UNKNOWN|sha256:[a-f\d]{64})$/;
const RECEIPT_TIMESTAMP = /^(?:UNKNOWN|\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z)$/;

function validateMeasurementReceipt(value: unknown, path: string): string[] {
  if (!isRecord(value)) return [`${path} must be an object`];
  const errors: string[] = [];
  for (const key of Object.keys(value)) {
    if (!RECEIPT_KEYS.has(key)) errors.push(`${path}.${key} is not allowed`);
  }
  if (value.contract !== 'judge-measurement@1') errors.push(`${path}.contract must be "judge-measurement@1"`);
  for (const key of ['provider', 'requestedModel', 'resolvedModel', 'fingerprint', 'windowId', 'requestId'] as const) {
    if (typeof value[key] !== 'string' || !RECEIPT_IDENTIFIER.test(value[key] as string)) {
      errors.push(`${path}.${key} must be a sanitized identifier`);
    }
  }
  for (const key of ['requestHash', 'promptHash', 'configHash', 'parserSchemaHash', 'outputHash', 'parsedVoteHash'] as const) {
    if (typeof value[key] !== 'string' || !RECEIPT_HASH.test(value[key] as string)) {
      errors.push(`${path}.${key} must be UNKNOWN or a SHA-256 digest`);
    }
  }
  if (!['shared', 'dedicated', 'local', 'UNKNOWN'].includes(value.endpointClass as string)) {
    errors.push(`${path}.endpointClass is invalid`);
  }
  if (!['L0_UNKNOWN', 'L1_NAMED', 'L2_CONTENT_BOUND'].includes(value.snapshotIdentity as string)) {
    errors.push(`${path}.snapshotIdentity is invalid`);
  }
  if (!['verified', 'provider-asserted', 'UNKNOWN'].includes(value.semantics as string)) {
    errors.push(`${path}.semantics is invalid`);
  }
  if (!['hit', 'miss', 'bypass', 'UNKNOWN'].includes(value.cacheStatus as string)) {
    errors.push(`${path}.cacheStatus is invalid`);
  }
  if (value.temperature !== null && (typeof value.temperature !== 'number'
    || !Number.isFinite(value.temperature) || value.temperature < 0)) {
    errors.push(`${path}.temperature must be a non-negative finite number or null`);
  }
  if (value.topP !== null && (typeof value.topP !== 'number'
    || !Number.isFinite(value.topP) || value.topP < 0 || value.topP > 1)) {
    errors.push(`${path}.topP must be a finite number in [0,1] or null`);
  }
  if (value.seed !== null && (typeof value.seed !== 'number' || !Number.isSafeInteger(value.seed))) {
    errors.push(`${path}.seed must be a safe integer or null`);
  }
  if (value.deterministic !== null && typeof value.deterministic !== 'boolean') {
    errors.push(`${path}.deterministic must be a boolean or null`);
  }
  if (!Number.isInteger(value.retryCount) || (value.retryCount as number) < 0) {
    errors.push(`${path}.retryCount must be a non-negative integer`);
  }
  if (typeof value.timestamp !== 'string' || !RECEIPT_TIMESTAMP.test(value.timestamp)) {
    errors.push(`${path}.timestamp must be UNKNOWN or an ISO-8601 UTC timestamp`);
  }
  if (value.latencyMs !== null && (typeof value.latencyMs !== 'number'
    || !Number.isFinite(value.latencyMs) || value.latencyMs < 0)) {
    errors.push(`${path}.latencyMs must be a non-negative finite number or null`);
  }
  return errors;
}

export function validateRiskDecision(value: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ['not an object'] };
  if (value.contract !== 'risk-decision@1') errors.push(`contract must be "risk-decision@1"`);
  if (!['approve', 'block', 'escalate'].includes(value.decision as string)) {
    errors.push('decision must be approve|block|escalate');
  }
  if (!isStringArray(value.riskFactors)) errors.push('riskFactors must be string[]');
  if (!inUnitRange(value.confidence)) errors.push('confidence must be a number in [0,1]');
  if (typeof value.rationale !== 'string' || value.rationale.length === 0) {
    errors.push('rationale must be a non-empty string');
  }
  return { valid: errors.length === 0, errors };
}

export function validateFindingVerdict(value: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ['not an object'] };
  if (value.contract !== 'finding-verdict@1') errors.push(`contract must be "finding-verdict@1"`);
  if (typeof value.id !== 'string' || value.id.length === 0) errors.push('id must be a non-empty string');
  if (typeof value.title !== 'string' || value.title.length === 0) errors.push('title must be a non-empty string');
  if (value.file !== undefined && typeof value.file !== 'string') errors.push('file must be a string when present');
  if (!['critical', 'high', 'medium', 'low', 'info'].includes(value.severity as string)) {
    errors.push('severity must be critical|high|medium|low|info');
  }
  if (!inUnitRange(value.confidence)) errors.push('confidence must be a number in [0,1]');
  if (!isStringArray(value.evidence)) errors.push('evidence must be string[]');
  if (!['upheld', 'refuted', 'uncertain'].includes(value.verdict as string)) {
    errors.push('verdict must be upheld|refuted|uncertain');
  }
  if (!isStringArray(value.refutations)) errors.push('refutations must be string[]');
  if (value.measurementReceipts !== undefined) {
    if (!Array.isArray(value.measurementReceipts)) {
      errors.push('measurementReceipts must be an array when present');
    } else {
      value.measurementReceipts.forEach((receipt, index) => {
        errors.push(...validateMeasurementReceipt(receipt, `measurementReceipts[${index}]`));
      });
    }
  }
  return { valid: errors.length === 0, errors };
}

export function validateCoverageGap(value: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ['not an object'] };
  if (value.contract !== 'coverage-gap@1') errors.push(`contract must be "coverage-gap@1"`);
  if (typeof value.file !== 'string' || value.file.length === 0) errors.push('file must be a non-empty string');
  for (const k of ['rangeStart', 'rangeEnd'] as const) {
    const v = value[k];
    if (v !== undefined && (!Number.isInteger(v) || (v as number) < 1)) {
      errors.push(`${k} must be a positive integer when present`);
    }
  }
  if (
    Number.isInteger(value.rangeStart) &&
    Number.isInteger(value.rangeEnd) &&
    (value.rangeEnd as number) < (value.rangeStart as number)
  ) {
    errors.push('rangeEnd must be >= rangeStart');
  }
  if (!inUnitRange(value.riskScore)) errors.push('riskScore must be a number in [0,1]');
  if (!isStringArray(value.suggestedTests)) errors.push('suggestedTests must be string[]');
  return { valid: errors.length === 0, errors };
}

// ============================================================================
// Builders — derive contract envelopes at MCP boundaries
// ============================================================================

/**
 * Derive a RiskDecision from a quality-gate outcome (quality_assess boundary).
 * Indeterminate gates (passed undefined) escalate rather than guess.
 */
export function buildRiskDecisionFromQualityGate(input: {
  passed?: boolean;
  qualityScore?: number;
  recommendations?: string[];
}): RiskDecision {
  const { passed, qualityScore, recommendations = [] } = input;
  const decision: RiskDecisionOutcome =
    passed === true ? 'approve' : passed === false ? 'block' : 'escalate';
  return {
    contract: 'risk-decision@1',
    decision,
    riskFactors: recommendations.slice(0, 10),
    confidence: decision === 'escalate' ? 0.5 : 0.9,
    rationale:
      decision === 'escalate'
        ? 'Quality gate outcome indeterminate — manual review required'
        : `Quality gate ${passed ? 'passed' : 'failed'}${
            typeof qualityScore === 'number' ? ` with score ${qualityScore}` : ''
          }`,
  };
}

// ============================================================================
// JSON Schemas (draft-07) — mirrors of the validators above, published to
// schemas/*.schema.json for ajv / workflow agent({schema}) consumers
// ============================================================================

const unit = { type: 'number', minimum: 0, maximum: 1 } as const;
const stringArray = { type: 'array', items: { type: 'string' } } as const;
const receiptIdentifier = {
  type: 'string', pattern: '^(?:UNKNOWN|[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,255})$',
} as const;
const receiptHash = { type: 'string', pattern: '^(?:UNKNOWN|sha256:[a-f0-9]{64})$' } as const;

export const RISK_DECISION_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'https://agentic-qe.dev/schemas/risk-decision.schema.json',
  title: 'RiskDecision',
  type: 'object',
  required: ['contract', 'decision', 'riskFactors', 'confidence', 'rationale'],
  additionalProperties: true,
  properties: {
    contract: { const: 'risk-decision@1' },
    decision: { enum: ['approve', 'block', 'escalate'] },
    riskFactors: stringArray,
    confidence: unit,
    rationale: { type: 'string', minLength: 1 },
  },
} as const;

export const FINDING_VERDICT_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'https://agentic-qe.dev/schemas/finding-verdict.schema.json',
  title: 'FindingVerdict',
  type: 'object',
  required: ['contract', 'id', 'title', 'severity', 'confidence', 'evidence', 'verdict', 'refutations'],
  additionalProperties: true,
  properties: {
    contract: { const: 'finding-verdict@1' },
    id: { type: 'string', minLength: 1 },
    title: { type: 'string', minLength: 1 },
    file: { type: 'string' },
    severity: { enum: ['critical', 'high', 'medium', 'low', 'info'] },
    confidence: unit,
    evidence: stringArray,
    verdict: { enum: ['upheld', 'refuted', 'uncertain'] },
    refutations: stringArray,
    measurementReceipts: {
      type: 'array',
      items: {
        type: 'object',
        required: [
          'contract', 'provider', 'requestedModel', 'resolvedModel', 'endpointClass',
          'snapshotIdentity', 'semantics', 'fingerprint', 'requestHash', 'promptHash',
          'configHash', 'parserSchemaHash', 'outputHash', 'parsedVoteHash', 'temperature',
          'topP', 'seed', 'deterministic', 'cacheStatus', 'retryCount', 'timestamp',
          'windowId', 'latencyMs', 'requestId',
        ],
        additionalProperties: false,
        properties: {
          contract: { const: 'judge-measurement@1' },
          provider: receiptIdentifier,
          requestedModel: receiptIdentifier,
          resolvedModel: receiptIdentifier,
          endpointClass: { enum: ['shared', 'dedicated', 'local', 'UNKNOWN'] },
          snapshotIdentity: { enum: ['L0_UNKNOWN', 'L1_NAMED', 'L2_CONTENT_BOUND'] },
          semantics: { enum: ['verified', 'provider-asserted', 'UNKNOWN'] },
          fingerprint: receiptIdentifier,
          requestHash: receiptHash,
          promptHash: receiptHash,
          configHash: receiptHash,
          parserSchemaHash: receiptHash,
          outputHash: receiptHash,
          parsedVoteHash: receiptHash,
          temperature: { type: ['number', 'null'], minimum: 0 },
          topP: { type: ['number', 'null'], minimum: 0, maximum: 1 },
          seed: {
            type: ['integer', 'null'],
            minimum: Number.MIN_SAFE_INTEGER,
            maximum: Number.MAX_SAFE_INTEGER,
          },
          deterministic: { type: ['boolean', 'null'] },
          cacheStatus: { enum: ['hit', 'miss', 'bypass', 'UNKNOWN'] },
          retryCount: { type: 'integer', minimum: 0 },
          timestamp: {
            type: 'string',
            pattern: '^(?:UNKNOWN|\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,9})?Z)$',
          },
          windowId: receiptIdentifier,
          latencyMs: { type: ['number', 'null'], minimum: 0 },
          requestId: receiptIdentifier,
        },
      },
    },
  },
} as const;

export const COVERAGE_GAP_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'https://agentic-qe.dev/schemas/coverage-gap.schema.json',
  title: 'CoverageGap',
  type: 'object',
  required: ['contract', 'file', 'riskScore', 'suggestedTests'],
  additionalProperties: true,
  properties: {
    contract: { const: 'coverage-gap@1' },
    file: { type: 'string', minLength: 1 },
    rangeStart: { type: 'integer', minimum: 1 },
    rangeEnd: { type: 'integer', minimum: 1 },
    riskScore: unit,
    suggestedTests: stringArray,
  },
} as const;

export const VERDICT_SCHEMAS = {
  'risk-decision': RISK_DECISION_SCHEMA,
  'finding-verdict': FINDING_VERDICT_SCHEMA,
  'coverage-gap': COVERAGE_GAP_SCHEMA,
} as const;
