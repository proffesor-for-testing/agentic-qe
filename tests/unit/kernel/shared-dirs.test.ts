/**
 * Platform rules for shared-directory detection and scratch roots (#1006,
 * review of #1026 N1/N5). Windows and macOS are simulated with an injected
 * PlatformContext, so these run on any host.
 */
import { describe, expect, it } from 'vitest';
import * as path from 'path';
import {
  isHardStopDir, normalizeForCompare, samePath, scratchRootPath, userScratchBase,
  type PlatformContext,
} from '../../../src/kernel/shared-dirs';

const SHORT_TEMP = 'C:\\Users\\RUNNER~1\\AppData\\Local\\Temp';
const LONG_TEMP = 'C:\\Users\\runneradmin\\AppData\\Local\\Temp';

function win32(overrides: Partial<PlatformContext> = {}): PlatformContext {
  return {
    platform: 'win32',
    tmpdir: SHORT_TEMP,
    homedir: 'C:\\Users\\runneradmin',
    env: { LOCALAPPDATA: 'C:\\Users\\runneradmin\\AppData\\Local' },
    // Simulates fs.realpathSync.native expanding the 8.3 short name.
    realpath: p => p.replace(/RUNNER~1/i, 'runneradmin'),
    ...overrides,
  };
}

describe('Windows temp-dir matching (N5)', () => {
  it('matches the temp dir case-insensitively', () => {
    expect(isHardStopDir('c:\\users\\RUNNERADMIN\\appdata\\local\\temp', win32())).toBe(true);
  });

  it('matches the long name against an 8.3 short-name TMP', () => {
    expect(isHardStopDir(LONG_TEMP, win32())).toBe(true);
  });

  it('ignores a trailing separator', () => {
    expect(isHardStopDir(`${LONG_TEMP}\\`, win32())).toBe(true);
  });

  it('treats a drive root as a hard stop but not a project below the temp dir', () => {
    expect(isHardStopDir('D:\\', win32())).toBe(true);
    expect(isHardStopDir(path.win32.join(LONG_TEMP, 'my-project'), win32())).toBe(false);
  });

  it('compares paths with Windows semantics', () => {
    expect(samePath('C:\\Work\\Repo', 'c:\\work\\repo\\', win32())).toBe(true);
    expect(normalizeForCompare('C:\\Work\\Repo\\', win32())).toBe('c:\\work\\repo');
  });

  it('puts scratch roots under %LOCALAPPDATA%', () => {
    expect(userScratchBase(win32())).toBe('C:\\Users\\runneradmin\\AppData\\Local\\agentic-qe\\scratch');
    expect(scratchRootPath(SHORT_TEMP, win32())).toBe(scratchRootPath(LONG_TEMP.toUpperCase(), win32()));
  });
});

describe('POSIX cache locations', () => {
  const posix = (platform: NodeJS.Platform, env: NodeJS.ProcessEnv = {}): PlatformContext => ({
    platform, tmpdir: '/tmp', homedir: '/home/u', env, realpath: p => p,
  });

  it('uses ~/Library/Caches on macOS', () => {
    expect(userScratchBase(posix('darwin'))).toBe('/home/u/Library/Caches/agentic-qe/scratch');
  });

  it('uses an absolute XDG_CACHE_HOME, else ~/.cache, on Linux', () => {
    expect(userScratchBase(posix('linux', { XDG_CACHE_HOME: '/xdg' }))).toBe('/xdg/agentic-qe/scratch');
    expect(userScratchBase(posix('linux', { XDG_CACHE_HOME: 'relative' }))).toBe('/home/u/.cache/agentic-qe/scratch');
  });

  it('treats the fixed system list and the temp dir as hard stops', () => {
    expect(isHardStopDir('/home', posix('linux'))).toBe(true);
    expect(isHardStopDir('/tmp/', posix('linux'))).toBe(true);
    expect(isHardStopDir('/tmp/project', posix('linux'))).toBe(false);
  });
});
