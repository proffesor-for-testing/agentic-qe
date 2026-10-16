/**
 * #1070: with the transformer available, computeRealEmbedding returns a zero
 * vector for text it treats as non-semantic (JSON with a "metrics" key, raw
 * arrays, mostly numeric strings). The cosine check read that as total drift
 * and dropped the event, so every quality_assess TaskCompleted vanished and its
 * Queen task held a concurrency slot forever.
 *
 * The transformer module is mocked with the same non-semantic rule so the test
 * does not depend on a downloaded model.
 */
import { describe, expect, it, vi } from 'vitest';

const DIM = 8;

vi.mock('../../../src/learning/real-embeddings.js', () => ({
  isTransformerAvailable: () => true,
  computeRealEmbedding: async (text: string) => {
    const trimmed = text.trim();
    if (trimmed.startsWith('{') && /["']metrics["']/.test(trimmed)) return new Array(DIM).fill(0);
    const v = new Array(DIM).fill(0);
    for (let i = 0; i < trimmed.length; i++) v[trimmed.charCodeAt(i) % DIM] += 1;
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
    return v.map(x => x / norm);
  },
}));

import { SemanticAntiDriftMiddleware } from '../../../src/kernel/anti-drift-middleware.js';
import type { DomainEvent } from '../../../src/shared/types/index.js';

function event(type: string, payload: unknown): DomainEvent {
  return { id: `evt-${type}`, type, timestamp: new Date(), source: 'quality-assessment', payload } as DomainEvent;
}

describe('anti-drift middleware with non-semantic payloads (#1070)', () => {
  it('delivers a TaskCompleted whose payload has a "metrics" key', async () => {
    const mw = new SemanticAntiDriftMiddleware({ agentId: 'qe-kernel' });
    const emitted = await mw.onEmit(event('TaskCompleted', {
      taskId: 'task-1',
      result: { metrics: { coverage: 80, complexity: 3 }, passed: true },
    }));

    const received = await mw.onReceive(emitted);

    expect(received).not.toBeNull();
    expect(received?.payload).toEqual(emitted.payload);
    expect(mw.getStats().driftCount).toBe(0);
  });

  it('delivers a QueenTaskSubmitted whose task payload lists requested metrics', async () => {
    const mw = new SemanticAntiDriftMiddleware({ agentId: 'qe-kernel' });
    const emitted = await mw.onEmit(event('QueenTaskSubmitted', {
      taskId: 'task-2',
      task: { type: 'assess-quality', payload: { metrics: ['coverage', 'complexity'] } },
    }));

    expect(await mw.onReceive(emitted)).not.toBeNull();
  });

  it('still drops a non-semantic payload that was mutated in transit', async () => {
    const mw = new SemanticAntiDriftMiddleware({ agentId: 'qe-kernel' });
    const emitted = await mw.onEmit(event('TaskCompleted', {
      taskId: 'task-3',
      result: { metrics: { coverage: 80 } },
    }));
    const tampered = {
      ...emitted,
      payload: { metrics: { unrelated: 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz' }, other: [9, 9, 9, 9, 9, 9, 9] },
    } as DomainEvent;

    expect(await mw.onReceive(tampered)).toBeNull();
  });
});
