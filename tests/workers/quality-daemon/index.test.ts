/**
 * Tests for the QE Quality Daemon Orchestrator (IMP-10).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { QualityDaemon } from '../../../src/workers/quality-daemon';
import type { WorkerMemory } from '../../../src/workers/interfaces';

// Mock child_process for git/gh commands
vi.mock('child_process', () => ({
  execFile: vi.fn((_cmd: string, _args: string[], _opts: unknown, cb?: Function) => {
    if (cb) cb(null, { stdout: '[]', stderr: '' });
  }),
}));

// Mock fs.watch for git watcher
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    watch: vi.fn(() => ({ close: vi.fn(), on: vi.fn() })),
    existsSync: vi.fn(() => true),
    readFileSync: vi.fn(() => 'abc123\n'),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readdirSync: vi.fn(() => []),
    unlinkSync: vi.fn(),
  };
});

function createMockMemory(): WorkerMemory {
  const store = new Map<string, unknown>();
  return {
    async get<T>(key: string): Promise<T | undefined> {
      return store.get(key) as T | undefined;
    },
    async set<T>(key: string, value: T): Promise<void> {
      store.set(key, value);
    },
    async search(pattern: string): Promise<string[]> {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      return Array.from(store.keys()).filter((k) => regex.test(k));
    },
  };
}

describe('QualityDaemon', () => {
  let daemon: QualityDaemon;
  let memory: WorkerMemory;

  beforeEach(() => {
    vi.useFakeTimers();
    daemon = new QualityDaemon({
      tickIntervalMs: 100,
      ciPollIntervalMs: 500,
      coverageCheckIntervalMs: 300,
    });
    memory = createMockMemory();
  });

  afterEach(async () => {
    await daemon.stop();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  it('starts and reports running', async () => {
    expect(daemon.running).toBe(false);
    await daemon.start(memory);
    expect(daemon.running).toBe(true);
  });

  it('stops cleanly', async () => {
    await daemon.start(memory);
    await daemon.stop();
    expect(daemon.running).toBe(false);
  });

  it('double start is a no-op', async () => {
    await daemon.start(memory);
    await daemon.start(memory);
    expect(daemon.running).toBe(true);
  });

  it('stop when not running is a no-op', async () => {
    await daemon.stop();
    expect(daemon.running).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Status
  // -------------------------------------------------------------------------

  it('reports initial status', () => {
    const status = daemon.getStatus();
    expect(status.running).toBe(false);
    expect(status.tickCount).toBe(0);
    expect(status.uptimeSeconds).toBe(0);
    expect(status.queueDepth).toEqual({ now: 0, next: 0, later: 0 });
  });

  it('reports uptime after start', async () => {
    await daemon.start(memory);
    vi.advanceTimersByTime(5000);
    const status = daemon.getStatus();
    expect(status.uptimeSeconds).toBeGreaterThanOrEqual(4);
  });

  it('tracks tick count', async () => {
    await daemon.start(memory);
    vi.advanceTimersByTime(350);
    const status = daemon.getStatus();
    expect(status.tickCount).toBeGreaterThanOrEqual(1);
  });

  // -------------------------------------------------------------------------
  // Queue processing — verified with spies
  // -------------------------------------------------------------------------

  it('tick actually dequeues and handles gate_failure items', async () => {
    await daemon.start(memory);

    const dequeueSpy = vi.spyOn(daemon.queue, 'dequeue');

    daemon.queue.enqueue({
      id: 'gate-1',
      priority: 'now',
      payload: {
        type: 'gate_failure',
        gateName: 'coverage',
        score: 45,
        threshold: 70,
      },
      createdAt: Date.now(),
      source: 'test',
    });

    vi.advanceTimersByTime(200);

    expect(dequeueSpy).toHaveBeenCalled();
    expect(daemon.queue.isEmpty).toBe(true);
    // gate_failure triggers notification — verify sentCount incremented
    expect(daemon.notificationService.sentCount).toBeGreaterThanOrEqual(1);
  });

  it('tick dequeues and handles ci_failure items', async () => {
    await daemon.start(memory);

    daemon.queue.enqueue({
      id: 'ci-1',
      priority: 'now',
      payload: {
        type: 'ci_failure',
        workflowName: 'Tests',
        runId: 123,
        conclusion: 'failure',
      },
      createdAt: Date.now(),
      source: 'test',
    });

    vi.advanceTimersByTime(200);

    expect(daemon.queue.isEmpty).toBe(true);
    expect(daemon.notificationService.sentCount).toBeGreaterThanOrEqual(1);
  });

  it('tick processes coverage_delta items by checking pending suggestions', async () => {
    await daemon.start(memory);

    const getPendingSpy = vi.spyOn(daemon.testSuggester, 'getPending');

    daemon.queue.enqueue({
      id: 'cd-1',
      priority: 'next',
      payload: {
        type: 'coverage_delta',
        previousSnapshot: 'snap-1',
        currentSnapshot: 'snap-2',
      },
      createdAt: Date.now(),
      source: 'test',
    });

    vi.advanceTimersByTime(200);

    expect(daemon.queue.isEmpty).toBe(true);
    // coverage_delta handler checks pending suggestions (not re-analyze)
    expect(getPendingSpy).toHaveBeenCalled();
  });

  it('tick processes nightly items', async () => {
    await daemon.start(memory);

    const executeSpy = vi.spyOn(daemon.nightlyConsolidation, 'execute');

    daemon.queue.enqueue({
      id: 'nightly-1',
      priority: 'later',
      payload: {
        type: 'nightly',
        tasks: ['consolidate_patterns'],
      },
      createdAt: Date.now(),
      source: 'test',
    });

    vi.advanceTimersByTime(200);

    expect(daemon.queue.isEmpty).toBe(true);
    expect(executeSpy).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Persists state on stop
  // -------------------------------------------------------------------------

  it('persists state to memory on stop', async () => {
    await daemon.start(memory);
    vi.advanceTimersByTime(200);
    await daemon.stop();

    const state = await memory.get<{ stoppedAt: number }>('quality-daemon:state');
    expect(state).toBeDefined();
    expect(state!.stoppedAt).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // Subsystem initialization
  // -------------------------------------------------------------------------

  it('initializes all subsystems', () => {
    expect(daemon.queue).toBeDefined();
    expect(daemon.notificationService).toBeDefined();
    expect(daemon.gitWatcher).toBeDefined();
    expect(daemon.ciMonitor).toBeDefined();
    expect(daemon.coverageDelta).toBeDefined();
    expect(daemon.testSuggester).toBeDefined();
    expect(daemon.nightlyConsolidation).toBeDefined();
  });
});
