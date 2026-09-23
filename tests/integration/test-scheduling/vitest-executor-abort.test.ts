import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { VitestPhaseExecutor } from '../../../src/test-scheduling/executors/vitest-executor.js';
import { createPhaseScheduler } from '../../../src/test-scheduling/phase-scheduler.js';
import type { TestPhase } from '../../../src/test-scheduling/interfaces.js';

const roots: string[] = [];
const pids: number[] = [];

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'aqe-vitest-abort-'));
  roots.push(root);
  // The parent exits on TERM; its test worker deliberately ignores TERM.
  // Both remain in the same process group unless the executor changes it.
  writeFileSync(path.join(root, 'vitest'), `
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const child = spawn(process.execPath, ['-e',
  "const fs = require('node:fs'); process.on('SIGTERM', () => {}); setInterval(() => fs.appendFileSync('heartbeat', 'x'), 20);"
], { cwd: process.cwd(), stdio: 'ignore' });
fs.appendFileSync('pids.jsonl', JSON.stringify({ parent: process.pid, child: child.pid }) + '\\n');
setInterval(() => {}, 1000);
`);
  const executor = new VitestPhaseExecutor({ cwd: root, vitestPath: process.execPath, terminationGraceMs: 100 });
  const phase: TestPhase = {
    id: 'abort-fixture', name: 'Abort fixture', testTypes: ['unit'], testPatterns: ['fixture'],
    thresholds: { minPassRate: 1, maxFlakyRatio: 0, minCoverage: 0 },
    parallelism: 0, timeoutMs: 5000, failFast: false,
  };
  const heartbeat = path.join(root, 'heartbeat');
  const spawned = async () => {
    await vi.waitFor(() => {
      const file = path.join(root, 'pids.jsonl');
      expect(existsSync(file)).toBe(true);
      expect(existsSync(heartbeat)).toBe(true);
    }, { timeout: 3000 });
    const entries = readFileSync(path.join(root, 'pids.jsonl'), 'utf8').trim().split('\n');
    const ids = JSON.parse(entries.at(-1)!) as { parent: number; child: number };
    pids.push(ids.parent, ids.child);
  };
  return { root, executor, phase, heartbeat, spawned };
}

async function assertHeartbeatStopped(file: string) {
  const before = readFileSync(file, 'utf8').length;
  await new Promise(resolve => setTimeout(resolve, 150));
  expect(readFileSync(file, 'utf8').length).toBe(before);
}

afterEach(() => {
  for (const root of roots) {
    const file = path.join(root, 'pids.jsonl');
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').trim().split('\n')) {
      if (!line) continue;
      const ids = JSON.parse(line) as { parent: number; child: number };
      pids.push(ids.parent, ids.child);
    }
  }
  for (const pid of pids.splice(0)) {
    try { process.kill(pid, 'SIGKILL'); } catch { /* already stopped */ }
  }
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe.skipIf(process.platform === 'win32')('Vitest executor cancellation quiescence', () => {
  it('still accepts a normally completed test process', async () => {
    const { root, executor, phase } = fixture();
    writeFileSync(path.join(root, 'vitest'), `console.log(JSON.stringify({
      numTotalTestSuites: 1, numPassedTestSuites: 1, numFailedTestSuites: 0,
      numTotalTests: 1, numPassedTests: 1, numFailedTests: 0, numPendingTests: 0,
      success: true, startTime: Date.now(), testResults: []
    }));`);
    expect((await executor.execute(phase)).success).toBe(true);
  });

  it('waits for a TERM-resistant worker before abort reports completion', async () => {
    const { executor, phase, heartbeat, spawned } = fixture();
    const running = executor.execute(phase);
    await spawned();
    await executor.abort();
    await assertHeartbeatStopped(heartbeat);
    expect((await running).success).toBe(false);
  });

  it('stops the worker before a timed-out phase returns', async () => {
    const { executor, phase, heartbeat, spawned } = fixture();
    phase.timeoutMs = 750;
    const running = executor.execute(phase);
    await spawned();
    expect((await running).success).toBe(false);
    await assertHeartbeatStopped(heartbeat);
  });

  it('reports termination failure without leaving the phase promise pending', async () => {
    const { executor, phase, spawned } = fixture();
    const running = executor.execute(phase);
    await spawned();
    const realKill = process.kill.bind(process);
    vi.spyOn(process, 'kill').mockImplementation((pid, signal) => {
      if (pid < 0) throw Object.assign(new Error('permission denied'), { code: 'EPERM' });
      return realKill(pid, signal);
    });

    await expect(executor.abort()).rejects.toThrow('permission denied');
    const settled = await Promise.race([
      running,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('phase did not settle')), 300)),
    ]);
    expect(settled.success).toBe(false);
    expect(settled.error).toContain('permission denied');
    const next = await Promise.race([
      executor.execute(phase),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('executor admitted new work')), 300)),
    ]);
    expect(next.success).toBe(false);
    expect(next.error).toContain('active process');
  });

  it('does not launch a replacement test run after scheduler cancellation', async () => {
    const { root, executor, phase, heartbeat, spawned } = fixture();
    const scheduler = createPhaseScheduler(executor, {
      phases: [phase], retryFailedPhases: true, maxRetries: 3,
    });
    const running = scheduler.run();
    await spawned();
    await scheduler.abort();
    await expect(running).rejects.toThrow('Phase aborted');
    await assertHeartbeatStopped(heartbeat);
    expect(readFileSync(path.join(root, 'pids.jsonl'), 'utf8').trim().split('\n')).toHaveLength(1);
  });
});
