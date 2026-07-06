/**
 * A18 — daemon liveness check for `aqe health`.
 *
 * Before this fix, `aqe health` had no way to tell the user the detached
 * background-worker daemon (`.agentic-qe/workers/daemon.pid`, started via
 * `npx ruflo daemon start`) was down — it reported the same in-process
 * Queen/domain health regardless, so a stopped daemon looked identical to
 * "everything's fine" while learning/consolidation snapshots silently
 * stopped advancing.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { checkDaemonLiveness } from '../../../../src/cli/handlers/status-handler';
import { clearProjectRootCache } from '../../../../src/kernel/project-root';

describe('checkDaemonLiveness', () => {
  let tmpRoot: string;
  let workersDir: string;
  const originalEnv = process.env.AQE_PROJECT_ROOT;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'daemon-liveness-'));
    workersDir = join(tmpRoot, '.agentic-qe', 'workers');
    mkdirSync(workersDir, { recursive: true });
    process.env.AQE_PROJECT_ROOT = tmpRoot;
    clearProjectRootCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalEnv === undefined) delete process.env.AQE_PROJECT_ROOT;
    else process.env.AQE_PROJECT_ROOT = originalEnv;
    clearProjectRootCache();
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('reports not configured when daemon.pid does not exist', () => {
    const status = checkDaemonLiveness();
    expect(status).toEqual({ configured: false, running: false });
  });

  it('reports running when the PID in daemon.pid is alive', () => {
    writeFileSync(join(workersDir, 'daemon.pid'), String(process.pid));

    const status = checkDaemonLiveness();

    // process.pid (this test runner) is always alive, so this exercises the
    // real process.kill(pid, 0) check, not a mock.
    expect(status).toEqual({ configured: true, running: true, pid: process.pid });
  });

  it('reports not running when the PID in daemon.pid is stale (process gone)', () => {
    const stalePid = 999999;
    writeFileSync(join(workersDir, 'daemon.pid'), String(stalePid));
    vi.spyOn(process, 'kill').mockImplementation(() => {
      throw new Error('ESRCH: no such process');
    });

    const status = checkDaemonLiveness();

    expect(status).toEqual({ configured: true, running: false, pid: stalePid });
  });

  it('treats a non-numeric daemon.pid as configured-but-not-running rather than throwing', () => {
    writeFileSync(join(workersDir, 'daemon.pid'), 'not-a-pid');

    const status = checkDaemonLiveness();

    expect(status).toEqual({ configured: true, running: false });
  });
});
