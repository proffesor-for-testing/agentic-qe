/**
 * Issue #914 follow-through: other `x[key] = (x[key] || 0) + n` buckets whose
 * keys come from data. A key such as `constructor`, `toString` or `__proto__`
 * must count as a number like any other key.
 */
import { describe, expect, it } from 'vitest';
import { createGCounter, createGCounterFromState, getNodeCountFromState } from '../../../src/memory/crdt/g-counter';
import { TrajectoryAdapter, type BrowserTrajectory } from '../../../src/adapters/trajectory-adapter';
import { WasmVectorStore } from '../../../src/integrations/browser/qe-dashboard/wasm-vector-store';
import { GapDetectorService } from '../../../src/domains/coverage-analysis/services/gap-detector';
import { LearningCoordinatorService } from '../../../src/domains/learning-optimization/services/learning-coordinator';
import { ClaimVerifierService } from '../../../src/agents/claim-verifier/claim-verifier-service';
import { InfraActionExecutor, NoOpCommandRunner } from '../../../src/strange-loop/infra-healing/infra-action-executor';
import type { MemoryBackend } from '../../../src/kernel/interfaces';

const NAMES = ['constructor', 'toString', 'valueOf', '__proto__'];
const memory = {} as MemoryBackend;

describe('G-Counter node ids (#914)', () => {
  it.each(NAMES)('increments and sums a node named %s', (nodeId) => {
    const counter = createGCounter(nodeId);
    counter.increment(2);
    counter.increment(3);
    expect(counter.getLocalCount()).toBe(5);
    expect(counter.get()).toBe(5);
    expect(getNodeCountFromState(counter.getState(), nodeId)).toBe(5);
  });

  it.each(NAMES)('merges an incoming node named %s', (nodeId) => {
    const remote = createGCounter(nodeId);
    remote.increment(4);
    const local = createGCounter('local');
    local.increment(1);
    local.merge(remote);
    expect(local.get()).toBe(5);
    expect(createGCounterFromState('other', local.getState()).get()).toBe(5);
  });

  it('treats a prototype-named node absent from a state as zero', () => {
    const state = createGCounter('a').getState();
    for (const name of NAMES) expect(getNodeCountFromState(state, name)).toBe(0);
  });
});

describe('TrajectoryAdapter action summary (#914)', () => {
  it('counts actions named after Object.prototype members', () => {
    const step = (action: string) => ({ action, result: 'success', timestamp: 1 });
    const trajectory: BrowserTrajectory = {
      trajectoryId: 't-1',
      steps: [step('constructor'), step('toString'), step('constructor'), step('__proto__')],
      outcome: 'success',
      context: {},
    };
    const description = new TrajectoryAdapter().toQEPattern(trajectory).description;
    expect(description).toContain('constructor(2)');
    expect(description).toContain('toString(1)');
    expect(description).toContain('__proto__(1)');
    expect(description).not.toContain('native code');
  });
});

describe('WasmVectorStore namespace sizes (#914)', () => {
  it.each(NAMES)('counts vectors in a namespace named %s', (namespace) => {
    const store = new WasmVectorStore();
    store.add('a', new Float32Array([1, 0]), {}, namespace);
    store.add('b', new Float32Array([0, 1]), {}, namespace);
    const sizes = store.getStats().namespaceSizes;
    expect(Object.hasOwn(sizes, namespace)).toBe(true);
    expect(sizes[namespace]).toBe(2);
  });
});

describe('GapDetector effort breakdown (#914)', () => {
  it('sums effort for files whose path is a prototype member name', () => {
    const detector = new GapDetectorService(memory) as unknown as {
      calculateEffortBreakdown(gaps: Array<{ file: string; lines: number[] }>): Record<string, number>;
    };
    const lines = Array.from({ length: 15 }, (_, i) => i + 1);
    const breakdown = detector.calculateEffortBreakdown([
      { file: 'constructor', lines }, { file: 'constructor', lines }, { file: '__proto__', lines },
    ]);
    expect(breakdown.constructor).toBe(2);
    expect(Object.hasOwn(breakdown, '__proto__')).toBe(true);
    expect(Object.values(breakdown)).toEqual([2, 1]);
  });
});

describe('LearningCoordinator centroid metrics (#914)', () => {
  it('averages metrics named after Object.prototype members', () => {
    const coordinator = new LearningCoordinatorService({ memory }) as unknown as {
      calculateCentroid(experiences: Array<{ state: { metrics: Record<string, number> } }>): {
        metrics: Record<string, number>;
      };
    };
    // JSON.parse creates an own "__proto__" key, as persisted experiences would.
    const metrics = (value: number) => JSON.parse(`{"constructor": ${value}, "toString": ${value}, "__proto__": ${value}}`);
    const centroid = coordinator.calculateCentroid([{ state: { metrics: metrics(2) } }, { state: { metrics: metrics(4) } }]);
    expect(centroid.metrics.constructor).toBe(3);
    expect(centroid.metrics.toString).toBe(3);
    expect(Object.hasOwn(centroid.metrics, '__proto__')).toBe(true);
    expect(Object.values(centroid.metrics)).toEqual([3, 3, 3]);
  });
});

describe('ClaimVerifier per-agent stats (#978)', () => {
  it.each(NAMES)('counts claims from an agent whose id is %s', (agentId) => {
    const service = new ClaimVerifierService({ rootDir: '/tmp' });
    const result = { verified: true, confidence: 0.9 };
    const history = (service as unknown as { history: unknown[] }).history;
    history.push(
      { claimId: `${agentId}-1`, claimType: 'coverage-claim', method: 'code-trace', result, timestamp: new Date() },
      { claimId: `${agentId}-2`, claimType: 'coverage-claim', method: 'code-trace', result, timestamp: new Date() },
    );
    const stats = service.getStats().bySourceAgent;
    expect(Object.hasOwn(stats, agentId)).toBe(true);
    expect(stats[agentId].claimsSubmitted).toBe(2);
    expect(stats[agentId].claimsVerified).toBe(2);
  });
});

describe('InfraActionExecutor per-service stats (#978)', () => {
  it.each(NAMES)('counts outcomes for a service named %s', (service) => {
    const executor = new InfraActionExecutor(new NoOpCommandRunner(), {} as never, {} as never);
    const update = (executor as unknown as { updateServiceStats(name: string, field: string): void });
    update.updateServiceStats(service, 'failures');
    update.updateServiceStats(service, 'failures');
    update.updateServiceStats(service, 'recoveries');
    const byService = executor.getStats().byService;
    expect(Object.hasOwn(byService, service)).toBe(true);
    expect(byService[service]).toEqual({ failures: 2, recoveries: 1, successes: 0 });
  });
});
