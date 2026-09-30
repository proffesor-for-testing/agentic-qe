import { beforeEach, describe, expect, it, vi } from 'vitest';
const seam = vi.hoisted(() => ({
  resolve: vi.fn(), execute: vi.fn(), runtime: { browser: { start: vi.fn() } },
}));
vi.mock('node:module', () => ({ createRequire: () => Object.assign(() => seam.runtime, { resolve: seam.resolve }) }));
vi.mock('node:child_process', () => ({ execFileSync: seam.execute }));
vi.mock('vibium', () => seam.runtime);
import { isVibiumReady, loadVibium } from '../../../src/integrations/vibium/runtime.js';

describe('Optional modern Vibium runtime contract', () => {
  beforeEach(() => {
    seam.resolve.mockReset().mockReturnValue('/project/node_modules/vibium/dist/index.js');
    seam.execute.mockReset().mockReturnValue('');
    seam.runtime.browser.start = vi.fn();
  });
  it('accepts the modern API without launching or installing', async () => {
    expect((await loadVibium()).browser.start).toBe(seam.runtime.browser.start);
    expect(seam.execute).not.toHaveBeenCalled();
    expect(seam.runtime.browser.start).not.toHaveBeenCalled();
  });
  it('rejects an old launch-only API with explicit recovery guidance', async () => {
    seam.runtime.browser.start = undefined as never;
    await expect(loadVibium()).rejects.toThrow('aqe init --browser-engine');
    expect(seam.execute).not.toHaveBeenCalled();
  });
  it('checks the exact library payload, not a different PATH CLI', () => {
    expect(isVibiumReady()).toBe(true);
    expect(seam.execute).toHaveBeenCalledWith(process.execPath,
      ['/project/node_modules/vibium/bin/cli.js', 'is-installed'], { timeout: 5000, stdio: 'ignore' });
  });
  it('reports a missing payload without starting an installation', () => {
    seam.execute.mockImplementation(() => { throw new Error('payload missing'); });
    expect(isVibiumReady()).toBe(false);
    expect(seam.execute.mock.calls).toHaveLength(1);
    expect(seam.execute.mock.calls[0][1]).toEqual(expect.arrayContaining(['is-installed']));
  });
  it('finds project-local opt-in installation for a global AQE executable', () => {
    seam.resolve.mockImplementationOnce(() => { throw new Error('not alongside AQE'); });
    expect(isVibiumReady()).toBe(true);
    expect(seam.resolve).toHaveBeenCalledTimes(2);
    expect(seam.execute).toHaveBeenCalledTimes(1);
  });
  it('resolves explicit global setup with npm root and probes that payload', () => {
    seam.resolve.mockImplementationOnce(() => { throw new Error('missing'); })
      .mockImplementationOnce(() => { throw new Error('missing'); })
      .mockReturnValue('/global/node_modules/vibium/dist/index.js');
    seam.execute.mockReturnValueOnce('/global/node_modules\n');
    expect(isVibiumReady()).toBe(true);
    expect(seam.resolve).toHaveBeenLastCalledWith('/global/node_modules/vibium');
    expect(seam.execute.mock.calls[1][1]).toEqual(['/global/node_modules/vibium/bin/cli.js', 'is-installed']);
  });
  it('reports unavailable when no opt-in installation exists', () => {
    seam.resolve.mockImplementation(() => { throw new Error('missing'); });
    seam.execute.mockReturnValue('/global/node_modules');
    expect(isVibiumReady()).toBe(false);
    expect(seam.execute.mock.calls.every(call => call[1].join(' ') === 'root -g')).toBe(true);
  });
});
