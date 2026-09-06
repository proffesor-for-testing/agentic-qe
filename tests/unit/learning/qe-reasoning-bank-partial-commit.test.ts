import { afterEach, describe, expect, it, vi } from 'vitest';

const witnessMocks = vi.hoisted(() => ({
  append: vi.fn(),
  getWitnessChain: vi.fn(),
}));

vi.mock('../../../src/audit/witness-chain.js', () => ({
  getWitnessChain: witnessMocks.getWitnessChain,
}));

import { QEReasoningBank } from '../../../src/learning/qe-reasoning-bank.js';
import { PatternMutationError } from '../../../src/learning/pattern-mutation-error.js';
import type { QEPattern } from '../../../src/learning/qe-patterns.js';
import { resetRuVectorFeatureFlags, setRuVectorFeatureFlags } from '../../../src/integrations/ruvector/feature-flags.js';

describe('QEReasoningBank committed-pending pattern side effects', () => {
  afterEach(() => {
    resetRuVectorFeatureFlags();
    vi.clearAllMocks();
  });

  it('runs witness and dual-writer side effects while preserving the partial result', async () => {
    setRuVectorFeatureFlags({ useRVFPatternStore: false });
    witnessMocks.getWitnessChain.mockResolvedValue({ append: witnessMocks.append });

    const embedding = [0.1, 0.2, 0.3];
    const committedPattern = {
      id: 'committed-pattern',
      patternType: 'test-template',
      qeDomain: 'test-generation',
      domain: 'test-generation',
      name: 'Committed Pattern',
      description: 'Committed before its derived index failed',
      confidence: 0.8,
      embedding,
    } as QEPattern;
    const partial = new PatternMutationError(
      committedPattern.id,
      'COMMITTED_PENDING_INDEX',
      new Error('derived index unavailable'),
    );
    const create = vi.fn(async () => ({ success: false as const, error: partial }));
    const get = vi.fn(async () => committedPattern);
    const writePattern = vi.fn();
    const bank = new QEReasoningBank({} as never);
    Object.assign(bank as unknown as Record<string, unknown>, {
      initialized: true,
      patternStore: { create, get },
    });
    bank.setRvfDualWriter({ writePattern } as never);

    const result = await bank.storePattern({
      patternType: 'test-template',
      name: committedPattern.name,
      description: committedPattern.description,
      template: { type: 'code', content: 'test()', variables: [] },
      embedding,
    });

    expect(result).toEqual({ success: false, error: partial });
    expect(get).toHaveBeenCalledWith(committedPattern.id);
    expect(writePattern).toHaveBeenCalledWith(committedPattern.id, embedding);
    await vi.waitFor(() => {
      expect(witnessMocks.append).toHaveBeenCalledWith(
        'PATTERN_CREATE',
        {
          patternId: committedPattern.id,
          domain: committedPattern.qeDomain,
          confidence: committedPattern.confidence,
          name: committedPattern.name,
        },
        'reasoning-bank',
      );
    });
  });
});
