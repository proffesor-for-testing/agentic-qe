import { createHash } from 'node:crypto';
import type { RankedCandidate, RetrievalReceipt } from './types.js';

export interface CreateRetrievalReceiptInput {
  revision: string;
  queryId: string;
  queryRepresentationVersion: string;
  embeddingSpaceId: string;
  rankerVersion: string;
  candidates: RankedCandidate[];
  appliedPatternIds?: string[];
  outcomeRef?: string | null;
  outcomeImproved?: boolean | null;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

export function createRetrievalReceipt(input: CreateRetrievalReceiptInput): RetrievalReceipt {
  if (!input.revision || !input.queryId || !input.queryRepresentationVersion || !input.embeddingSpaceId || !input.rankerVersion) {
    throw new Error('retrieval receipt provenance fields must be non-empty');
  }
  const candidateIds = new Set(input.candidates.map(candidate => candidate.patternId));
  if (candidateIds.size !== input.candidates.length || input.candidates.some(candidate => !candidate.patternId || !Number.isFinite(candidate.score))) {
    throw new Error('retrieval receipt candidates must have an id and finite score');
  }
  if ((input.appliedPatternIds ?? []).some(id => !candidateIds.has(id))) {
    throw new Error('retrieval receipt applied patterns must be present in candidates');
  }
  const payload = {
    schemaVersion: 'aqe-retrieval-receipt/v1' as const,
    revision: input.revision,
    queryId: input.queryId,
    queryRepresentationVersion: input.queryRepresentationVersion,
    embeddingSpaceId: input.embeddingSpaceId,
    rankerVersion: input.rankerVersion,
    candidates: input.candidates.map(candidate => ({ ...candidate })),
    appliedPatternIds: [...(input.appliedPatternIds ?? [])],
    outcomeRef: input.outcomeRef ?? null,
    outcomeImproved: input.outcomeImproved ?? null,
  };
  const receiptId = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  return deepFreeze({ ...payload, receiptId });
}
