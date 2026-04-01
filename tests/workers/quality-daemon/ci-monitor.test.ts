/**
 * Tests for the QE Quality Daemon CI Monitor (IMP-10).
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { PriorityQueue } from '../../../src/workers/quality-daemon/priority-queue';
import { CIMonitor } from '../../../src/workers/quality-daemon/ci-monitor';

// Mock child_process.execFile
const mockExecFile = vi.fn();
vi.mock('child_process', () => ({
  execFile: (...args: unknown[]) => mockExecFile(...args),
}));

// Promisify mock behavior
function setupExecMock(data: unknown[]): void {
  mockExecFile.mockImplementation((_cmd: string, _args: string[], _opts: unknown, cb?: Function) => {
    if (cb) {
      cb(null, { stdout: JSON.stringify(data), stderr: '' });
    }
  });
}

describe('CIMonitor', () => {
  let queue: PriorityQueue;
  let monitor: CIMonitor;

  beforeEach(() => {
    queue = new PriorityQueue();
    monitor = new CIMonitor(queue, { flakyThreshold: 3 });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns healthy report when no runs exist', async () => {
    setupExecMock([]);
    const report = await monitor.check();
    expect(report.healthScore).toBe(100);
    expect(report.failingWorkflows).toBe(0);
    expect(report.flakyWorkflows).toHaveLength(0);
  });

  it('detects failing workflows', async () => {
    setupExecMock([
      { name: 'CI', status: 'completed', conclusion: 'failure', headBranch: 'main', number: 1, databaseId: 100, createdAt: '2026-04-01' },
      { name: 'CI', status: 'completed', conclusion: 'success', headBranch: 'main', number: 2, databaseId: 101, createdAt: '2026-03-31' },
    ]);

    const report = await monitor.check();
    expect(report.failingWorkflows).toBe(1);
    const ci = report.workflows.find((w) => w.name === 'CI');
    expect(ci).toBeDefined();
    expect(ci!.lastConclusion).toBe('failure');
    expect(ci!.failedRuns).toBe(1);
  });

  it('identifies flaky workflows with consecutive failures above threshold', async () => {
    setupExecMock([
      { name: 'Tests', status: 'completed', conclusion: 'failure', headBranch: 'main', number: 3, databaseId: 103, createdAt: '2026-04-01' },
      { name: 'Tests', status: 'completed', conclusion: 'failure', headBranch: 'main', number: 2, databaseId: 102, createdAt: '2026-03-31' },
      { name: 'Tests', status: 'completed', conclusion: 'failure', headBranch: 'main', number: 1, databaseId: 101, createdAt: '2026-03-30' },
    ]);

    const report = await monitor.check();
    expect(report.flakyWorkflows).toContain('Tests');
  });

  it('enqueues "now" alert for persistent CI failures', async () => {
    setupExecMock([
      { name: 'Deploy', status: 'completed', conclusion: 'failure', headBranch: 'main', number: 3, databaseId: 203, createdAt: '2026-04-01' },
      { name: 'Deploy', status: 'completed', conclusion: 'failure', headBranch: 'main', number: 2, databaseId: 202, createdAt: '2026-03-31' },
      { name: 'Deploy', status: 'completed', conclusion: 'failure', headBranch: 'main', number: 1, databaseId: 201, createdAt: '2026-03-30' },
    ]);

    await monitor.check();
    expect(queue.size).toBeGreaterThan(0);
    const item = queue.dequeue()!;
    expect(item.priority).toBe('now');
    expect(item.source).toBe('ci-monitor');
  });

  it('calculates health score from success rates', async () => {
    setupExecMock([
      { name: 'CI', status: 'completed', conclusion: 'success', headBranch: 'main', number: 2, databaseId: 102, createdAt: '2026-04-01' },
      { name: 'CI', status: 'completed', conclusion: 'failure', headBranch: 'main', number: 1, databaseId: 101, createdAt: '2026-03-31' },
    ]);

    const report = await monitor.check();
    expect(report.healthScore).toBe(50); // 1/2 success
  });

  it('handles gh CLI being unavailable gracefully', async () => {
    mockExecFile.mockImplementation((_cmd: string, _args: string[], _opts: unknown, cb?: Function) => {
      if (cb) {
        cb(new Error('gh: command not found'), { stdout: '', stderr: '' });
      }
    });

    const report = await monitor.check();
    expect(report.healthScore).toBe(100);
    expect(report.workflows).toHaveLength(0);
  });
});
