/**
 * Regression: QEReasoningBank.initialize() must not recurse via storePattern().
 *
 * Bug (fresh-install MCP hang): pattern seeding inside initialize()
 * (loadPretrainedPatterns → storePattern) ensure-inits via
 * `if (!this.initialized) await this.initialize()`. With `this.initialized`
 * set only AFTER seeding, that re-entered initialize() without bound — a CPU
 * spin that hung every MCP domain tool the first time patterns were seeded.
 *
 * The fix sets `this.initialized = true` BEFORE seeding, so storePattern()
 * short-circuits. This test pins that ordering invariant.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  setRuVectorFeatureFlags,
  resetRuVectorFeatureFlags,
} from '../../../src/integrations/ruvector/feature-flags.js';
import { createQEReasoningBank } from '../../../src/learning/qe-reasoning-bank';
import { createMockMemory } from '../../mocks';

describe('QEReasoningBank.initialize() re-entrancy guard', () => {
  beforeEach(() => setRuVectorFeatureFlags({ useRVFPatternStore: false }));
  afterEach(() => resetRuVectorFeatureFlags());

  it('marks initialized=true before seeding patterns so storePattern() cannot recurse', async () => {
    const memory = createMockMemory();
    // Skip cross-domain seeding (not under test) to keep this focused + fast.
    await memory.set('reasoning-bank:cross-domain-seeded', true);

    const bank = createQEReasoningBank(memory);

    // Spy the private seeding step: capture the init flag at call time and skip
    // the real (embedding-heavy) work. With the bug, the flag is still false
    // here and the production storePattern() path recurses forever.
    let initializedDuringSeed: boolean | undefined;
    (bank as unknown as { loadPretrainedPatterns: () => Promise<void> }).loadPretrainedPatterns =
      async () => {
        initializedDuringSeed = (bank as unknown as { initialized: boolean }).initialized;
      };

    await bank.initialize();

    expect(initializedDuringSeed).toBe(true);
  });
});
