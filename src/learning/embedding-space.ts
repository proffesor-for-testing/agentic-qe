/**
 * Executable embedding-space provenance (#633).
 *
 * Model names and dimensions are declarations, not proof that two vectors are
 * comparable.  An embedding space is therefore identified by canonical runtime
 * configuration plus a fingerprint of a fixed canary vector.
 */

import { createHash } from 'node:crypto';
import { cosineSimilarity } from '../shared/utils/vector-math.js';

export const EMBEDDING_SPACE_CANARY = 'aqe embedding-space compatibility canary v1';
export const EMBEDDING_ROUND_TRIP_MIN_COSINE = 0.999;

export interface EmbeddingSpaceIdentity {
  provider: string;
  model: string;
  dimensions: number;
  pooling?: string;
  normalized: boolean;
  preprocessingVersion?: string;
  implementation?: string;
  runtimeFingerprint: string;
  spaceId: string;
}

export type EmbeddingSpaceStatus = 'healthy' | 'vector_space_mismatch' | 'unverified';

export interface EmbeddingSpaceDiagnostics {
  status: EmbeddingSpaceStatus;
  activeSpaceId: string | null;
  storedSpaceIds: string[];
  verifiedVectors: number;
  mismatchedVectors: number;
  unverifiedVectors: number;
}

export class EmbeddingSpaceError extends Error {
  constructor(
    readonly code: 'VECTOR_SPACE_MISMATCH' | 'VECTOR_SPACE_UNVERIFIED',
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = 'EmbeddingSpaceError';
  }
}

function canonicalIdentity(identity: Omit<EmbeddingSpaceIdentity, 'spaceId'>): string {
  return JSON.stringify({
    provider: identity.provider,
    model: identity.model,
    dimensions: identity.dimensions,
    pooling: identity.pooling ?? null,
    normalized: identity.normalized,
    preprocessingVersion: identity.preprocessingVersion ?? null,
    implementation: identity.implementation ?? null,
    runtimeFingerprint: identity.runtimeFingerprint,
  });
}

/** Fingerprint a normalized canary vector after stable int16 quantization. */
export function fingerprintEmbeddingRuntime(vector: readonly number[]): string {
  const bytes = Buffer.alloc(vector.length * 2);
  for (let i = 0; i < vector.length; i++) {
    const quantized = Math.max(-32768, Math.min(32767, Math.round(vector[i] * 32767)));
    bytes.writeInt16LE(quantized, i * 2);
  }
  return createHash('sha256').update(bytes).digest('hex').slice(0, 16);
}

export function deriveEmbeddingSpaceIdentity(
  identity: Omit<EmbeddingSpaceIdentity, 'spaceId'>,
): EmbeddingSpaceIdentity {
  if (!identity.runtimeFingerprint) {
    throw new Error('Embedding space identity requires executable runtime evidence');
  }
  const spaceId = createHash('sha256')
    .update('aqe:embedding-space:v1\0')
    .update(canonicalIdentity(identity))
    .digest('hex');
  return { ...identity, spaceId };
}

/** Execute the same-text write/read canary before semantic ranking is trusted. */
export async function verifyEmbeddingRoundTrip(
  writeEmbed: (text: string) => Promise<number[]>,
  queryEmbed: (text: string) => Promise<number[]>,
  minimumCosine = EMBEDDING_ROUND_TRIP_MIN_COSINE,
): Promise<number> {
  const [written, queried] = await Promise.all([
    writeEmbed(EMBEDDING_SPACE_CANARY),
    queryEmbed(EMBEDDING_SPACE_CANARY),
  ]);
  if (written.length !== queried.length) {
    throw new EmbeddingSpaceError(
      'VECTOR_SPACE_MISMATCH',
      `round-trip dimensions differ (${written.length} != ${queried.length})`,
    );
  }
  const similarity = cosineSimilarity(written, queried);
  if (!Number.isFinite(similarity) || similarity < minimumCosine) {
    throw new EmbeddingSpaceError(
      'VECTOR_SPACE_MISMATCH',
      `write/read canary cosine ${similarity.toFixed(6)} is below ${minimumCosine}`,
    );
  }
  return similarity;
}

export function inspectEmbeddingSpaceRows(
  rows: ReadonlyArray<{ spaceId: string | null }>,
  activeSpaceId: string | null,
): EmbeddingSpaceDiagnostics {
  const storedSpaceIds = [...new Set(rows.flatMap((row) => row.spaceId ? [row.spaceId] : []))].sort();
  const unverifiedVectors = rows.filter((row) => !row.spaceId).length;
  const verifiedVectors = activeSpaceId
    ? rows.filter((row) => row.spaceId === activeSpaceId).length
    : 0;
  const mismatchedVectors = activeSpaceId
    ? rows.filter((row) => row.spaceId !== null && row.spaceId !== activeSpaceId).length
    : rows.length - unverifiedVectors;
  const status: EmbeddingSpaceStatus = unverifiedVectors > 0 || !activeSpaceId
    ? 'unverified'
    : mismatchedVectors > 0 || storedSpaceIds.length > 1
      ? 'vector_space_mismatch'
      : 'healthy';
  return {
    status,
    activeSpaceId,
    storedSpaceIds,
    verifiedVectors,
    mismatchedVectors,
    unverifiedVectors,
  };
}
