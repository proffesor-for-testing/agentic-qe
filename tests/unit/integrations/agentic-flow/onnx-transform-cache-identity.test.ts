import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmbeddingGenerator } from '../../../../src/integrations/agentic-flow/onnx-embeddings/embedding-generator';

// The owned normalized-vector fixture replaces only inference; configuration,
// cache lookup, transforms, batching and public metadata execute real code.
const inference = vi.hoisted(() => vi.fn(async () => [0.6, 0.8]));
vi.mock('../../../../src/learning/real-embeddings.js', () => ({ computeRealEmbedding: inference }));
beforeEach(() => inference.mockClear());

describe('ONNX cache transform identity', () => {
  it('recomputes the requested transform after a supported curvature update', async () => {
    const generator = new EmbeddingGenerator({ hyperbolic: true, curvature: -1 });
    const old = await generator.generate('same input');
    generator.updateConfig({ curvature: -4 });
    const actual = await generator.generate('same input');
    const reference = await new EmbeddingGenerator({ hyperbolic: true, curvature: -4 }).generate('same input');
    expect(reference.vector).not.toEqual(old.vector);
    expect(actual).toEqual(reference);
  });

  it('honors batch curvature overrides and restores the default cache namespace', async () => {
    const generator = new EmbeddingGenerator({ hyperbolic: true, curvature: -1 });
    const original = await generator.generate('same input');
    const reference = await new EmbeddingGenerator({ hyperbolic: true, curvature: -4 }).generate('same input');
    const batch = await generator.generateBatch({ texts: ['same input', 'same input'], config: { curvature: -4 } });
    expect(batch.embeddings).toEqual([reference, reference]);
    expect(await generator.generate('same input')).toEqual(original);
  });

  it('preserves ordinary hits and Euclidean/hyperbolic separation', async () => {
    const generator = new EmbeddingGenerator();
    const first = await generator.generate('same input');
    expect(await generator.generate('same input')).toEqual(first);
    expect(inference).toHaveBeenCalledTimes(1);
    generator.updateConfig({ hyperbolic: true });
    const transformed = await generator.generate('same input');
    expect(transformed.isHyperbolic).toBe(true);
    expect(transformed.vector).not.toEqual(first.vector);
    expect(inference).toHaveBeenCalledTimes(2);
  });
});
