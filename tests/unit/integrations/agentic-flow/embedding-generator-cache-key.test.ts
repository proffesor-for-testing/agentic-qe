/**
 * Issue #914: the ONNX embedding cache key joined model, hyperbolic flag and
 * text with ':', so different (model, hyperbolic, text) tuples could share a key
 * and return each other's cached vectors.
 */
import { describe, expect, it, vi } from 'vitest';
import { EmbeddingGenerator } from '../../../../src/integrations/agentic-flow/onnx-embeddings/embedding-generator';
import type { EmbeddingModel } from '../../../../src/integrations/agentic-flow/onnx-embeddings/types';

const runtime = vi.hoisted(() => ({ calls: [] as string[] }));

// Deterministic stand-in for the transformer pipeline: no model download in a unit test.
vi.mock('../../../../src/learning/real-embeddings.js', () => ({
  computeRealEmbedding: async (text: string) => {
    runtime.calls.push(text);
    const codes = [...text].map(char => char.charCodeAt(0));
    return [codes.length, codes.reduce((sum, code) => sum + code, 0), 3, 4];
  },
}));

const model = (value: string) => value as EmbeddingModel;

describe('EmbeddingGenerator cache key (#914)', () => {
  it('keeps ":" in the text from colliding with a different model and hyperbolic flag', async () => {
    const generator = new EmbeddingGenerator({ model: model('m'), hyperbolic: false });
    const euclidean = await generator.generate('x:true:y');

    // Old key for both calls: "m:false:x:true:y".
    generator.updateConfig({ model: model('m:false:x'), hyperbolic: true });
    const hyperbolic = await generator.generate('y');

    expect(euclidean).toMatchObject({ model: 'm', isHyperbolic: false });
    expect(hyperbolic).toMatchObject({ model: 'm:false:x', isHyperbolic: true });
    expect(hyperbolic.vector).not.toEqual(euclidean.vector);
  });

  it('keeps ":" in the model name from colliding with the text', async () => {
    const generator = new EmbeddingGenerator({ model: model('a'), hyperbolic: false });
    const first = await generator.generate('x:false:y');
    // Old key for both calls: "a:false:x:false:y".
    generator.updateConfig({ model: model('a:false:x') });
    const second = await generator.generate('y');
    expect(second.model).toBe('a:false:x');
    expect(second).not.toBe(first);
  });

  it('does not serve a vector computed under a different normalize or curvature setting', async () => {
    const generator = new EmbeddingGenerator({ normalize: true, hyperbolic: true, curvature: -1 });
    const normalized = await generator.generate('same text');
    generator.updateConfig({ normalize: false });
    const raw = await generator.generate('same text');
    generator.updateConfig({ curvature: -4 });
    const curved = await generator.generate('same text');

    expect(raw.vector).not.toEqual(normalized.vector);
    expect(curved.vector).not.toEqual(raw.vector);
  });

  it('still serves a cache hit for the same configuration and text', async () => {
    const generator = new EmbeddingGenerator({ model: model('m') });
    runtime.calls.length = 0;
    const first = await generator.generate('a:b:c');
    const second = await generator.generate('a:b:c');
    expect(second).toBe(first);
    expect(runtime.calls).toEqual(['a:b:c']);
    expect(generator.getStats().cacheHits).toBe(1);
  });
});
