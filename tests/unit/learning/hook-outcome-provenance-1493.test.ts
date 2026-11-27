/**
 * #1493: promotion and the QEAgentCompletion handler never treat an
 * unobserved hook result as a success.
 */

import { describe, it, expect, vi } from 'vitest';
import { shouldPromotePattern, type QEPattern } from '../../../src/learning/qe-patterns.js';
import {
  isLegacyHookDerivedPattern,
  LEGACY_HOOK_TASK_SOURCE,
  OBSERVED_HOOK_TASK_SOURCE,
} from '../../../src/learning/hook-outcome-provenance.js';
import { createQEHookHandlers, QE_HOOK_EVENTS } from '../../../src/learning/qe-hooks.js';
import type { QEReasoningBank } from '../../../src/learning/qe-reasoning-bank.js';
import { ok } from '../../../src/shared/types/index.js';

const promotable = (tags: string[]): QEPattern => ({
  tier: 'short-term', successfulUses: 10, usageCount: 10, successRate: 1, confidence: 0.9,
  context: { tags },
} as unknown as QEPattern);

describe('promotion of hook-derived patterns (#1493)', () => {
  it('blocks a pattern consolidated from legacy post-task hook rows', () => {
    const check = shouldPromotePattern(promotable([LEGACY_HOOK_TASK_SOURCE]));

    expect(check.meetsUsageCriteria).toBe(false);
    expect(check.blockReason).toBe('insufficient_usage');
  });

  it.each([[[OBSERVED_HOOK_TASK_SOURCE]], [['cli-hook-post-edit']], [[]]])(
    'still promotes a pattern tagged %j', (tags) => {
      expect(shouldPromotePattern(promotable(tags)).meetsUsageCriteria).toBe(true);
    });

  it('recognises legacy provenance only from context tags', () => {
    expect(isLegacyHookDerivedPattern({ context: { tags: [LEGACY_HOOK_TASK_SOURCE, 'x'] } })).toBe(true);
    expect(isLegacyHookDerivedPattern({ context: { tags: [OBSERVED_HOOK_TASK_SOURCE] } })).toBe(false);
    expect(isLegacyHookDerivedPattern({ context: null })).toBe(false);
    expect(isLegacyHookDerivedPattern({})).toBe(false);
  });
});

describe('QEAgentCompletion handler (#1493)', () => {
  const bank = () => ({
    getPattern: vi.fn().mockResolvedValue({ id: 'p1' }),
    storePattern: vi.fn(),
    recordOutcome: vi.fn().mockResolvedValue(ok(undefined)),
  }) as unknown as QEReasoningBank & { recordOutcome: ReturnType<typeof vi.fn> };

  it.each([[undefined], [null], ['true']])('records no outcome for success=%j', async (success) => {
    const rb = bank();
    const handlers = createQEHookHandlers(rb);

    await handlers[QE_HOOK_EVENTS.QEAgentCompletion]({
      eventId: 'e1', timestamp: new Date(), data: { agentType: 'coder', success, patternId: 'p1' },
    });

    expect(rb.recordOutcome).not.toHaveBeenCalled();
  });

  it.each([[true], [false]])('records an observed boolean success=%j', async (success) => {
    const rb = bank();
    const handlers = createQEHookHandlers(rb);

    await handlers[QE_HOOK_EVENTS.QEAgentCompletion]({
      eventId: 'e2', timestamp: new Date(), data: { agentType: 'coder', success, patternId: 'p1' },
    });

    expect(rb.recordOutcome).toHaveBeenCalledWith(expect.objectContaining({ patternId: 'p1', success }));
  });
});
