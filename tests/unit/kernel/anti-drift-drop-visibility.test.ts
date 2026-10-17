/**
 * #1077: the anti-drift middleware dropped events without a trace, including
 * task lifecycle events (the cause of the #1070 Queen slot leak).
 *
 * - Every drift detection logs a rate-limited warning (stderr) with the event
 *   type, source, similarity and threshold, and no payload contents.
 * - Control-plane events (Queen*, Task*, Agent*, Workflow*, Step*, Protocol*,
 *   Action*) are delivered despite drift; data events are still dropped.
 * - A payload unchanged since emit is not embedded a second time.
 *
 * The transformer module is mocked so the test does not need the model.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const DIM = 16;
const embedCalls: string[] = [];

vi.mock('../../../src/learning/real-embeddings.js', () => ({
  isTransformerAvailable: () => true,
  computeRealEmbedding: async (text: string) => {
    embedCalls.push(text);
    const v = new Array(DIM).fill(0);
    for (let i = 0; i < text.length; i++) v[text.charCodeAt(i) % DIM] += 1;
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
    return v.map(x => x / norm);
  },
}));

import { SemanticAntiDriftMiddleware, isControlPlaneEvent } from '../../../src/kernel/anti-drift-middleware.js';
import { InMemoryEventBus } from '../../../src/kernel/event-bus.js';
import type { DomainEvent } from '../../../src/shared/types/index.js';

const SECRET = 'payload-secret-value-do-not-log';

function event(type: string, payload: Record<string, unknown>, source = 'quality-assessment'): DomainEvent {
  return { id: `evt-${type}-${Math.random()}`, type, timestamp: new Date(), source, payload } as DomainEvent;
}

/** Emit, then swap the payload for unrelated content, as a tampered hop would. */
async function emitAndTamper(mw: SemanticAntiDriftMiddleware, e: DomainEvent): Promise<DomainEvent> {
  const emitted = await mw.onEmit(e);
  return { ...emitted, payload: { unrelated: 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz', n: [9, 9, 9, 9, 9, 9] } } as DomainEvent;
}

function driftWarnings(spy: ReturnType<typeof vi.spyOn>): string[] {
  return spy.mock.calls.map(c => String(c[0])).filter(line => line.includes('[anti-drift-middleware]'));
}

describe('anti-drift drop visibility (#1077)', () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    embedCalls.length = 0;
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('isControlPlaneEvent', () => {
    it.each([
      'QueenTaskSubmitted', 'QueenTaskCompleted', 'QueenTaskQueued', 'QueenInitialized', 'QueenAgentSpawned',
      'TaskCompleted', 'TaskFailed', 'TaskCancelled', 'TaskAssigned', 'AgentStatusChanged', 'AgentFailed',
      'workflow.WorkflowCompleted', 'workflow.StepFailed', 'workflow.StepAwaitingApproval',
      'coordination.ProtocolFailed', 'coordination.ActionCompleted',
    ])('treats %s as control-plane', type => {
      expect(isControlPlaneEvent(type)).toBe(true);
    });

    it.each([
      'quality-assessment.QualityGateEvaluated', 'coverage.updated', 'test.event', 'learning.PatternLearned',
      'Taskforce', 'Queenly', 'test-execution.TestRunCompleted', 'SemanticDriftDetected',
    ])('treats %s as a data event', type => {
      expect(isControlPlaneEvent(type)).toBe(false);
    });
  });

  it('logs a warning with type, source, similarity and threshold when it drops a data event', async () => {
    const mw = new SemanticAntiDriftMiddleware({ agentId: 'qe-kernel' });
    const tampered = await emitAndTamper(mw, event('quality-assessment.QualityGateEvaluated', { note: SECRET }));

    expect(await mw.onReceive(tampered)).toBeNull();

    const lines = driftWarnings(warn);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('event dropped');
    expect(lines[0]).toContain('quality-assessment.QualityGateEvaluated');
    expect(lines[0]).toContain('"source":"quality-assessment"');
    expect(lines[0]).toMatch(/"cosineSimilarity":-?\d/);
    expect(lines[0]).toMatch(/"threshold":0\.\d+/);
    expect(lines[0]).not.toContain(SECRET);
    expect(lines[0]).not.toContain('zzzzzzzz');
  });

  it.each(['TaskCompleted', 'TaskFailed', 'TaskCancelled', 'QueenTaskSubmitted', 'QueenTaskCompleted',
    'workflow.StepCompleted', 'coordination.ProtocolFailed'])(
    'delivers a drifted %s, still counts and reports the drift', async type => {
      const onDriftDetected = vi.fn().mockResolvedValue(undefined);
      const mw = new SemanticAntiDriftMiddleware({ agentId: 'qe-kernel', onDriftDetected });
      const tampered = await emitAndTamper(mw, event(type, { taskId: 'task-1', note: SECRET }));

      const received = await mw.onReceive(tampered);

      expect(received).not.toBeNull();
      expect(received!.payload).toEqual(tampered.payload);
      expect(received!.semanticFingerprint!.hopCount).toBe(1);
      expect(mw.getStats().driftCount).toBe(1);
      expect(onDriftDetected).toHaveBeenCalledTimes(1);
      const lines = driftWarnings(warn);
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain('delivered anyway');
      expect(lines[0]).toContain(type);
      expect(lines[0]).not.toContain(SECRET);
    },
  );

  it('rate-limits warnings per event type and source, then reports the suppressed count', async () => {
    let now = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const mw = new SemanticAntiDriftMiddleware({ agentId: 'qe-kernel' });

    for (let i = 0; i < 50; i++) {
      expect(await mw.onReceive(await emitAndTamper(mw, event('coverage.updated', { i })))).toBeNull();
    }
    expect(driftWarnings(warn)).toHaveLength(1);

    // A different event type is reported on its own.
    await mw.onReceive(await emitAndTamper(mw, event('test.event', { i: 0 })));
    expect(driftWarnings(warn)).toHaveLength(2);

    now += 61_000;
    await mw.onReceive(await emitAndTamper(mw, event('coverage.updated', { i: 51 })));
    const lines = driftWarnings(warn);
    expect(lines).toHaveLength(3);
    expect(lines[2]).toContain('"suppressedSinceLastWarning":49');
    expect(mw.getStats().driftCount).toBe(52);
  });

  it('does not warn for events that do not drift', async () => {
    const mw = new SemanticAntiDriftMiddleware({ agentId: 'qe-kernel' });
    for (const type of ['TaskCompleted', 'coverage.updated']) {
      expect(await mw.onReceive(await mw.onEmit(event(type, { taskId: 't', ok: true })))).not.toBeNull();
    }
    expect(driftWarnings(warn)).toHaveLength(0);
  });

  it('embeds an unchanged payload once per publish, and re-embeds a changed one', async () => {
    const mw = new SemanticAntiDriftMiddleware({ agentId: 'qe-kernel' });
    const emitted = await mw.onEmit(event('coverage.updated', { lines: 42 }));
    expect(embedCalls).toHaveLength(1);

    expect(await mw.onReceive(emitted)).not.toBeNull();
    expect(embedCalls).toHaveLength(1);
    expect(mw.getStats()).toMatchObject({ totalChecked: 1, driftCount: 0, averageSimilarity: 1 });

    // Same fingerprint, different payload: must be re-embedded and compared.
    await mw.onReceive({ ...emitted, payload: { lines: 43 } } as DomainEvent);
    expect(embedCalls).toHaveLength(2);
  });

  describe('on the in-process event bus', () => {
    function busWithMiddleware(): InMemoryEventBus {
      const bus = new InMemoryEventBus();
      bus.registerMiddleware(new SemanticAntiDriftMiddleware({ agentId: 'qe-kernel' }));
      return bus;
    }

    /** Publish, then mutate the shared payload while the emit-side embedding is awaited. */
    async function publishWithInFlightMutation(bus: InMemoryEventBus, type: string): Promise<void> {
      const payload: Record<string, unknown> = { taskId: 'task-9', result: { note: SECRET } };
      const published = bus.publish(event(type, payload));
      payload.result = { unrelated: 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz', n: [9, 9, 9, 9, 9, 9] };
      await published;
    }

    it('delivers a TaskCompleted whose payload drifted in flight, and logs it', async () => {
      const bus = busWithMiddleware();
      const handler = vi.fn();
      bus.subscribe('TaskCompleted', handler);

      await publishWithInFlightMutation(bus, 'TaskCompleted');

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0].payload.taskId).toBe('task-9');
      expect(driftWarnings(warn).join('\n')).toContain('delivered anyway');
    });

    it('drops a data event whose payload drifted in flight, and logs it', async () => {
      const bus = busWithMiddleware();
      const handler = vi.fn();
      bus.subscribe('quality-assessment.ReportReady', handler);

      await publishWithInFlightMutation(bus, 'quality-assessment.ReportReady');

      expect(handler).not.toHaveBeenCalled();
      const lines = driftWarnings(warn);
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain('event dropped');
      expect(lines[0]).not.toContain(SECRET);
    });
  });
});
