/**
 * D9 routing-feedback sink tests — maps executor outcomes onto
 * RoutingFeedbackCollector.recordOutcome (stubbed; no DB).
 */
import { describe, it, expect, vi } from 'vitest';
import {
  createRoutingFeedbackSink,
  type FreeTierOutcomeEvent,
  type RoutingFeedbackLike,
} from '../../../src/routing/free-tier/feedback-sink.js';

const ev = (over: Partial<FreeTierOutcomeEvent> = {}): FreeTierOutcomeEvent => ({
  agentId: 'test-gen:repoA',
  startTier: 'local',
  tierUsed: 'local',
  passed: true,
  escalated: false,
  repaired: false,
  durationMs: 1200,
  attempts: 1,
  ...over,
});

function stubCollector() {
  const recordOutcome = vi.fn().mockReturnValue({ id: 'o1' });
  const collector: RoutingFeedbackLike = { recordOutcome };
  return { collector, recordOutcome };
}

describe('createRoutingFeedbackSink', () => {
  it('should record a successful cheap-tier outcome against the used tier', () => {
    const { collector, recordOutcome } = stubCollector();
    const sink = createRoutingFeedbackSink(collector, { taskKind: 'test-generation' });

    sink(ev());

    expect(recordOutcome).toHaveBeenCalledOnce();
    const [task, decision, usedAgent, outcome] = recordOutcome.mock.calls[0];
    expect(usedAgent).toBe('local');
    expect(outcome).toMatchObject({ success: true, qualityScore: 1.0 });
    expect(decision.recommended).toBe('local');
    expect(task.description).toContain('test-generation');
  });

  it('should give full quality only to a clean (non-repaired, non-escalated) win', () => {
    const { collector, recordOutcome } = stubCollector();
    const sink = createRoutingFeedbackSink(collector);

    sink(ev({ repaired: true }));
    sink(ev({ escalated: true, tierUsed: 'haiku' }));

    expect(recordOutcome.mock.calls[0][3].qualityScore).toBe(0.8); // repaired
    expect(recordOutcome.mock.calls[1][3].qualityScore).toBe(0.6); // escalated
  });

  it('should record a failure with zero quality', () => {
    const { collector, recordOutcome } = stubCollector();
    const sink = createRoutingFeedbackSink(collector);

    sink(ev({ passed: false, tierUsed: 'opus' }));

    expect(recordOutcome.mock.calls[0][3]).toMatchObject({ success: false, qualityScore: 0 });
  });

  it('should swallow collector errors so a sink failure never breaks the QE task', () => {
    const collector: RoutingFeedbackLike = {
      recordOutcome: vi.fn(() => {
        throw new Error('db down');
      }),
    };
    const sink = createRoutingFeedbackSink(collector);

    expect(() => sink(ev())).not.toThrow();
  });
});
