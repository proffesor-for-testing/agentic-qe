import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  EmbeddingSpaceError,
  deriveEmbeddingSpaceIdentity,
  embeddingSpaceManifestPath,
  fingerprintEmbeddingRuntime,
  inspectEmbeddingSpaceRows,
  verifyOrCreateEmbeddingSpaceManifest,
  verifyEmbeddingRoundTrip,
} from '../../../src/learning/embedding-space.js';

function identity(runtimeFingerprint: string) {
  return deriveEmbeddingSpaceIdentity({
    provider: 'test-provider',
    model: 'same-advertised-model',
    dimensions: 384,
    pooling: 'mean',
    normalized: true,
    implementation: 'test-runtime',
    runtimeFingerprint,
  });
}

function basis(index: number): number[] {
  return Array.from({ length: 384 }, (_, i) => i === index ? 1 : 0);
}

describe('embedding-space contract', () => {
  it('includes executable canary evidence in spaceId', () => {
    const a = identity(fingerprintEmbeddingRuntime(basis(0)));
    const b = identity(fingerprintEmbeddingRuntime(basis(1)));

    expect(a.model).toBe(b.model);
    expect(a.dimensions).toBe(b.dimensions);
    expect(a.spaceId).not.toBe(b.spaceId);
    expect(a.spaceId).toHaveLength(64);
  });

  it('accepts a compatible write/read round trip', async () => {
    const embed = async () => basis(0);
    await expect(verifyEmbeddingRoundTrip(embed, embed)).resolves.toBeCloseTo(1, 10);
  });

  it('rejects different same-dimensional embedding spaces', async () => {
    const writeEmbed = async () => basis(0);
    const queryEmbed = async () => basis(1);

    await expect(verifyEmbeddingRoundTrip(writeEmbed, queryEmbed)).rejects.toMatchObject({
      code: 'VECTOR_SPACE_MISMATCH',
    } satisfies Partial<EmbeddingSpaceError>);
  });

  it('classifies legacy and mismatched vectors explicitly', () => {
    expect(inspectEmbeddingSpaceRows([{ spaceId: null }], 'active')).toMatchObject({
      status: 'unverified',
      unverifiedVectors: 1,
    });
    expect(inspectEmbeddingSpaceRows([{ spaceId: 'other' }], 'active')).toMatchObject({
      status: 'vector_space_mismatch',
      mismatchedVectors: 1,
    });
  });

  it('persists and verifies an ANN embedding-space binding', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aqe-space-manifest-'));
    const indexPath = join(dir, 'patterns.rvf');
    try {
      verifyOrCreateEmbeddingSpaceManifest(indexPath, 'space-a', 0);
      expect(JSON.parse(readFileSync(embeddingSpaceManifestPath(indexPath), 'utf8'))).toEqual({
        version: 1,
        spaceId: 'space-a',
      });
      expect(() => verifyOrCreateEmbeddingSpaceManifest(indexPath, 'space-a', 5)).not.toThrow();
      expect(() => verifyOrCreateEmbeddingSpaceManifest(indexPath, 'space-b', 5)).toThrow('VECTOR_SPACE_MISMATCH');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses to adopt a populated legacy ANN index', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aqe-space-manifest-'));
    const indexPath = join(dir, 'patterns.rvf');
    try {
      writeFileSync(indexPath, 'legacy-index');
      expect(() => verifyOrCreateEmbeddingSpaceManifest(indexPath, 'space-a', 1)).toThrow('VECTOR_SPACE_UNVERIFIED');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
