/**
 * #1168: what `aqe fleet run` prints when stdout is not a TTY (CI, pipes).
 *
 * cli-progress's MultiBar.create() drops the bar payload without a TTY, and
 * its built-in `{eta}` token overrides any payload value of that name.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FleetProgressManager } from '../../../src/cli/utils/progress';

describe('FleetProgressManager output without a TTY (#1168)', () => {
  let written: string;
  let logged: string[];
  const originalIsTTY = process.stderr.isTTY;

  beforeEach(() => {
    written = '';
    logged = [];
    Object.defineProperty(process.stderr, 'isTTY', { value: false, configurable: true });
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
      written += String(chunk);
      return true;
    });
    vi.spyOn(console, 'log').mockImplementation((line?: unknown) => { logged.push(String(line ?? '')); });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(process.stderr, 'isTTY', { value: originalIsTTY, configurable: true });
  });

  function runFleet(stopOptions?: { verdictFailed?: boolean }): void {
    const manager = new FleetProgressManager({ title: 'Scan Progress', showEta: true });
    manager.start(2);
    for (const id of ['a', 'b']) {
      manager.addAgent({ id, name: `scan-worker-${id}`, status: 'pending', progress: 0 });
      manager.updateAgent(id, 0, { status: 'running' });
      manager.completeAgent(id, true);
    }
    manager.stop(stopOptions);
  }

  it('fills every placeholder in the final render', () => {
    runFleet();
    expect(written).toContain('Fleet Progress');
    expect(written).toContain('scan-worker-a');
    expect(written).not.toMatch(/\{\w+\}/);
  });

  it('says the agents completed successfully when the verdict passed', () => {
    runFleet({ verdictFailed: false });
    expect(logged).toContainEqual(expect.stringContaining('All 2/2 agents completed successfully'));
  });

  it('drops "successfully" when the verdict failed', () => {
    runFleet({ verdictFailed: true });
    const line = logged.find(l => l.includes('All 2/2 agents completed'));
    expect(line).toBeDefined();
    expect(line).not.toContain('successfully');
  });
});
