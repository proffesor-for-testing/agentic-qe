/**
 * #872: on Windows the hook shim fell back to spawnSync('aqe.cmd', args) with no
 * shell. Since the CVE-2024-27980 fix Node returns EINVAL for that, so every
 * AQE hook silently did nothing. The shim must now resolve the global AQE
 * bundle and run it via process.execPath — never a .cmd, never a shell — and
 * leave the POSIX path unchanged.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, symlinkSync, lstatSync, readdirSync,
} from 'node:fs';
import { join, resolve, win32 } from 'node:path';
import { tmpdir } from 'node:os';

const REPO_ROOT = resolve(__dirname, '../../..');
const SHIM = resolve(REPO_ROOT, '.claude/hooks/aqe-hook.cjs');
const BRAIN = resolve(REPO_ROOT, '.claude/helpers/brain-checkpoint.cjs');
const { resolveAqeInvocation, parseCmdShimTarget } = createRequire(import.meta.url)(SHIM);

const NODE = 'C:\\Program Files\\nodejs\\node.exe';
const NPM_PREFIX = 'C:\\Users\\Dev User\\AppData\\Roaming\\npm';
const GLOBAL_BUNDLE = `${NPM_PREFIX}\\node_modules\\agentic-qe\\dist\\cli\\bundle.js`;
/** What npm's cmd-shim writes for the `aqe` bin (abridged). */
const NPM_CMD_SHIM = [
  '@ECHO off', 'GOTO start', ':find_dp0', 'SET dp0=%~dp0', 'EXIT /b', ':start', 'SETLOCAL',
  'CALL :find_dp0', 'IF EXIST "%dp0%\\node.exe" ( SET "_prog=%dp0%\\node.exe" ) ELSE ( SET "_prog=node" )',
  'endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\node_modules\\agentic-qe\\dist\\cli\\bundle.js" %*',
].join('\r\n');

/** A virtual Windows filesystem: path -> contents. */
function winFs(files: Record<string, string>) {
  const lower = new Map(Object.entries(files).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    exists: (p: string) => lower.has(p.toLowerCase()),
    readFile: (p: string) => lower.get(p.toLowerCase()) ?? '',
  };
}

function resolveWin(env: Record<string, string>, files: Record<string, string>, extra: object = {}) {
  return resolveAqeInvocation({
    platform: 'win32', path: win32, execPath: NODE, project: 'C:\\work\\my app',
    env, npmPrefix: () => null, prefixCacheFile: null, ...winFs(files), ...extra,
  });
}

describe('aqe-hook.cjs Windows resolution (#872)', () => {
  it('should_runGlobalBundleViaNode_when_aqeCmdShimIsOnPath', () => {
    const inv = resolveWin(
      { Path: `C:\\Windows\\system32;"${NPM_PREFIX}"` },
      { [`${NPM_PREFIX}\\aqe.cmd`]: NPM_CMD_SHIM, [GLOBAL_BUNDLE]: '' },
    );
    expect(inv.cmd).toBe(NODE);
    expect(inv.args).toEqual([GLOBAL_BUNDLE]);
  });

  it('should_followPnpmStyleDp0Target_when_bundleIsNotBesideTheShim', () => {
    const pnpmHome = 'C:\\Users\\dev\\AppData\\Local\\pnpm';
    const target = `${pnpmHome}\\global\\5\\node_modules\\agentic-qe\\dist\\cli\\bundle.js`;
    const shim = `@SETLOCAL\r\n"%~dp0\\global\\5\\node_modules\\agentic-qe\\dist\\cli\\bundle.js" %*`;
    const inv = resolveWin({ PATH: pnpmHome }, { [`${pnpmHome}\\aqe.cmd`]: shim, [target]: '' });
    expect(inv).toMatchObject({ cmd: NODE, args: [target] });
  });

  it('should_useAppDataNpmPrefix_when_pathHasNoShim', () => {
    const inv = resolveWin({ APPDATA: 'C:\\Users\\Dev User\\AppData\\Roaming' }, { [GLOBAL_BUNDLE]: '' });
    expect(inv).toMatchObject({ cmd: NODE, args: [GLOBAL_BUNDLE] });
  });

  it('should_askBundledNpmForThePrefix_when_noKnownLayoutMatches', () => {
    const custom = 'D:\\tools\\npm-global';
    const bundle = `${custom}\\node_modules\\agentic-qe\\dist\\cli\\bundle.js`;
    const inv = resolveWin({}, { [bundle]: '' }, { npmPrefix: () => custom });
    expect(inv).toMatchObject({ cmd: NODE, args: [bundle] });
  });

  it('should_resolveThroughAqeHookBin_when_itNamesACmdShim', () => {
    const inv = resolveWin(
      { AQE_HOOK_BIN: `${NPM_PREFIX}\\aqe.cmd` },
      { [`${NPM_PREFIX}\\aqe.cmd`]: NPM_CMD_SHIM, [GLOBAL_BUNDLE]: '' },
    );
    expect(inv).toMatchObject({ cmd: NODE, args: [GLOBAL_BUNDLE] });
  });

  it('should_spawnAqeHookBinDirectly_when_itIsARealExecutable', () => {
    expect(resolveWin({ AQE_HOOK_BIN: 'C:\\bin\\aqe.exe' }, {})).toMatchObject({ cmd: 'C:\\bin\\aqe.exe', args: [] });
  });

  it('should_preferTheProjectBundle_over_anyGlobalInstall', () => {
    const local = 'C:\\work\\my app\\node_modules\\agentic-qe\\dist\\cli\\bundle.js';
    const inv = resolveWin({ PATH: NPM_PREFIX }, { [local]: '', [`${NPM_PREFIX}\\aqe.cmd`]: NPM_CMD_SHIM, [GLOBAL_BUNDLE]: '' });
    expect(inv).toMatchObject({ cmd: NODE, args: [local], source: 'project-bundle' });
  });

  it('should_returnNoCommandWithGuidance_and_neverACmd_when_nothingResolves', () => {
    const inv = resolveWin({ PATH: NPM_PREFIX }, { [`${NPM_PREFIX}\\aqe.cmd`]: NPM_CMD_SHIM });
    expect(inv.cmd).toBeNull();
    expect(inv.reason).toMatch(/CVE-2024-27980/);
    expect(inv.reason).toMatch(/AQE_HOOK_BUNDLE/);
  });

  it('should_keepThePosixPathUnchanged', () => {
    const base = { platform: 'linux', env: {}, project: '/nope', exists: () => false };
    expect(resolveAqeInvocation(base)).toEqual({ cmd: 'aqe', args: [], source: 'bin' });
    expect(resolveAqeInvocation({ ...base, env: { AQE_HOOK_BIN: '/opt/aqe' } }).cmd).toBe('/opt/aqe');
  });

  it('parseCmdShimTarget returns null for a shim with no JS target', () => {
    expect(parseCmdShimTarget('C:\\x\\aqe.cmd', '@echo off\r\nfoo.exe %*', win32)).toBeNull();
  });

  it('should_followOneCmdHop_when_yarnV1GlobalShimDelegatesToAnotherCmd', () => {
    const yarnBin = 'C:\\Users\\dev\\AppData\\Local\\Yarn\\bin';
    const inner = 'C:\\Users\\dev\\AppData\\Local\\Yarn\\Data\\global\\node_modules\\.bin\\aqe.cmd';
    const bundle = 'C:\\Users\\dev\\AppData\\Local\\Yarn\\Data\\global\\node_modules\\agentic-qe\\dist\\cli\\bundle.js';
    const inv = resolveWin({ PATH: yarnBin }, {
      [`${yarnBin}\\aqe.cmd`]: '@"%~dp0\\..\\Data\\global\\node_modules\\.bin\\aqe.cmd"   %*',
      [inner]: NPM_CMD_SHIM.replace('node_modules\\agentic-qe', '..\\agentic-qe'),
      [bundle]: '',
    });
    expect(inv).toMatchObject({ cmd: NODE, args: [bundle] });
  });

  it('should_notLoopForever_when_cmdShimsDelegateToEachOther', () => {
    const a = 'C:\\a\\aqe.cmd';
    const inv = resolveWin({ PATH: 'C:\\a' }, { [a]: '@"%~dp0\\..\\b\\aqe.cmd" %*', 'C:\\b\\aqe.cmd': '@"%~dp0\\..\\a\\aqe.cmd" %*' });
    expect(inv.cmd).toBeNull();
  });

  it('should_failWithVoltaAndAqeHookBundleGuidance_when_shimIsVolta', () => {
    const volta = 'C:\\Users\\dev\\AppData\\Local\\Volta\\bin';
    const inv = resolveWin({ PATH: volta }, { [`${volta}\\aqe.cmd`]: '@echo off\r\nvolta run %~n0 %*' });
    expect(inv.cmd).toBeNull();
    expect(inv.reason).toMatch(/Volta/);
    expect(inv.reason).toMatch(/AQE_HOOK_BUNDLE/);
  });

  it('should_resolveBehindAqeHookBinPs1_and_neverSpawnIt', () => {
    const ps1 = `${NPM_PREFIX}\\aqe.ps1`;
    expect(resolveWin({ AQE_HOOK_BIN: ps1 }, { [ps1]: '& node "$basedir/x.js" $args', [GLOBAL_BUNDLE]: '' }))
      .toMatchObject({ cmd: NODE, args: [GLOBAL_BUNDLE] });
    const none = resolveWin({ AQE_HOOK_BIN: ps1 }, { [ps1]: '' });
    expect(none.cmd).toBeNull();
    expect(none.reason).toContain(`AQE_HOOK_BIN=${ps1} is a .cmd/.bat/.ps1 script`);
  });
});

describe('aqe-hook.cjs npm-prefix lookup cache (#872 review)', () => {
  let tmp: string;
  afterEach(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }); });

  it('should_spawnNpmPrefixAtMostOncePerTtl_when_nothingResolves', () => {
    tmp = mkdtempSync(join(tmpdir(), 'aqe-872-cache-'));
    const prefixCacheFile = join(tmp, '.agentic-qe', 'hook-npm-prefix.json');
    let lookups = 0;
    const npmPrefix = () => { lookups++; return null; };
    const run = (now: number, execPath = NODE) => resolveAqeInvocation({
      platform: 'win32', path: win32, execPath, project: 'C:\\p', env: {},
      exists: () => false, readFile: () => '', npmPrefix, prefixCacheFile, now,
    });

    const t0 = 1_000_000;
    expect(run(t0).cmd).toBeNull();
    run(t0 + 1_000);
    run(t0 + 4 * 60 * 1000);
    expect(lookups).toBe(1);                       // negative result cached
    expect(JSON.parse(readFileSync(prefixCacheFile, 'utf-8'))).toEqual({ execPath: NODE, prefix: null, at: t0 });

    run(t0 + 5 * 60 * 1000);                       // TTL expired
    expect(lookups).toBe(2);
    run(t0 + 5 * 60 * 1000 + 1, 'D:\\other\\node.exe'); // different node binary
    expect(lookups).toBe(3);
  });

  function unresolved(prefixCacheFile: string, npmPrefix: () => string | null) {
    return resolveAqeInvocation({
      platform: 'win32', path: win32, execPath: NODE, project: 'C:\\p', env: {},
      exists: () => false, readFile: () => '', npmPrefix, prefixCacheFile, now: 1_000_000,
    });
  }

  it('should_neverWriteThroughASymlinkedCacheFile_and_leaveTheVictimUnchanged', () => {
    tmp = mkdtempSync(join(tmpdir(), 'aqe-872-symlink-'));
    mkdirSync(join(tmp, '.agentic-qe'));
    const victim = join(tmp, 'victim.txt');
    // Victim holds a VALID, fresh cache record: following the link would trust it.
    const victimBytes = JSON.stringify({ execPath: NODE, prefix: 'C:\\evil', at: 1_000_000 });
    writeFileSync(victim, victimBytes);
    const cacheFile = join(tmp, '.agentic-qe', 'hook-npm-prefix.json');
    symlinkSync(victim, cacheFile);
    let lookups = 0;

    const inv = unresolved(cacheFile, () => { lookups++; return null; });

    expect(inv.cmd).toBeNull();
    expect(lookups).toBe(1);                                  // the link was not trusted
    expect(readFileSync(victim, 'utf-8')).toBe(victimBytes);  // victim bytes unchanged
    expect(lstatSync(cacheFile).isSymbolicLink()).toBe(false); // link replaced by a regular file
    expect(JSON.parse(readFileSync(cacheFile, 'utf-8'))).toEqual({ execPath: NODE, prefix: null, at: 1_000_000 });
    expect(readdirSync(join(tmp, '.agentic-qe'))).toEqual(['hook-npm-prefix.json']); // no temp left behind
  });

  it('should_ignoreAnOversizedCacheFile', () => {
    tmp = mkdtempSync(join(tmpdir(), 'aqe-872-big-'));
    const cacheFile = join(tmp, 'hook-npm-prefix.json');
    writeFileSync(cacheFile, JSON.stringify({ execPath: NODE, prefix: null, at: 1_000_000, pad: 'x'.repeat(8192) }));
    let lookups = 0;

    unresolved(cacheFile, () => { lookups++; return null; });

    expect(lookups).toBe(1);
  });
});

describe('aqe-hook.cjs argv hardening (#970 re-review)', () => {
  it('should_skipRelativePathEntries_soNoBundleCanBeParsedAsANodeFlag', () => {
    const planted = '--require=.\\aqe.cmd';
    const inv = resolveWin({ PATH: `--require=.;.;relative\\dir` }, {
      [planted]: NPM_CMD_SHIM, '--require=.\\node_modules\\agentic-qe\\dist\\cli\\bundle.js': '',
      '.\\aqe.cmd': NPM_CMD_SHIM, 'node_modules\\agentic-qe\\dist\\cli\\bundle.js': '',
    });
    expect(inv.cmd).toBeNull();
  });

  it('should_passAnAbsoluteBundlePath_when_aqeHookBundleIsRelative', () => {
    const inv = resolveAqeInvocation({
      platform: 'linux', env: { AQE_HOOK_BUNDLE: '--require=./x.js' }, project: '/nope',
      exists: (f: string) => f === '--require=./x.js',
    });
    expect(inv.args).toEqual([resolve('--require=./x.js')]);
    expect(inv.args[0].startsWith('/')).toBe(true);
  });

  it.each(['C:\\npm\\aqe.cmd.', 'C:\\npm\\aqe.CMD ', 'C:\\npm\\aqe.bat. .', 'C:\\npm\\aqe.ps1.'])(
    'should_neverSpawnAqeHookBinDirectly_when_scriptExtensionHasTrailingDotsOrSpaces %s',
    (bin) => {
      const inv = resolveWin({ AQE_HOOK_BIN: bin }, {});
      expect(inv.cmd).toBeNull();
      expect(inv.reason).toContain('is a .cmd/.bat/.ps1 script');
    },
  );
});

/**
 * End-to-end on this (Linux) host: run the REAL shim with process.platform
 * forced to win32 and child_process patched to reject .cmd/.bat without a shell
 * exactly like Node does on Windows, against a fake npm global layout on disk.
 */
describe('aqe-hook.cjs under simulated win32 (end-to-end)', () => {
  let tmp: string;
  afterEach(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }); });

  function setup() {
    tmp = mkdtempSync(join(tmpdir(), 'aqe-872-'));
    const preload = join(tmp, 'win32-preload.cjs');
    writeFileSync(preload, `
      Object.defineProperty(process, 'platform', { value: 'win32' });
      const cp = require('child_process');
      const fs = require('fs');
      const wrap = (real, sync) => function (cmd, args, opts) {
        fs.appendFileSync(process.env.ARGV_LOG, JSON.stringify({ cmd, args, shell: !!(opts && opts.shell) }) + '\\n');
        if (/\\.(cmd|bat)$/i.test(cmd) && !(opts && opts.shell)) {
          const e = Object.assign(new Error('spawnSync ' + cmd + ' EINVAL'), { code: 'EINVAL' });
          if (sync === 'return') return { error: e, status: null, signal: null, stdout: '', stderr: '' };
          throw e;
        }
        return real.apply(this, arguments);
      };
      cp.spawnSync = wrap(cp.spawnSync, 'return');
      cp.execFileSync = wrap(cp.execFileSync, 'throw');
    `);
    const npmDir = join(tmp, 'npm');
    const pkgCli = join(npmDir, 'node_modules', 'agentic-qe', 'dist', 'cli');
    mkdirSync(pkgCli, { recursive: true });
    writeFileSync(join(npmDir, 'aqe.cmd'), NPM_CMD_SHIM);
    writeFileSync(join(pkgCli, 'bundle.js'),
      `if (process.argv[2] === 'brain') console.log('Patterns: 7');
       else console.log(JSON.stringify({ argv: process.argv.slice(2) }));`);
    const project = join(tmp, 'project');
    mkdirSync(project);
    return { preload, npmDir, project, argvLog: join(tmp, 'argv.log'), bundle: join(pkgCli, 'bundle.js') };
  }

  it('should_passHostileArgumentsVerbatim_without_shell_or_cmd', () => {
    const { preload, npmDir, project, argvLog, bundle } = setup();
    const hostile = 'git commit -m "fix & ship" ^& del /q C:\\ %PATH% %%cd%% ^^ 100% done';
    const args = ['pre-command', '--command', hostile, '--description', 'a b  c', '--json'];

    const stdout = execFileSync(process.execPath, ['-r', preload, SHIM, ...args], {
      env: { PATH: npmDir, CLAUDE_PROJECT_DIR: project, ARGV_LOG: argvLog },
      encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'],
    });

    expect(JSON.parse(stdout)).toEqual({ argv: ['hooks', ...args] });
    const spawned = readFileSync(argvLog, 'utf-8').trim().split('\n').map((l) => JSON.parse(l));
    expect(spawned).toEqual([{ cmd: process.execPath, args: [bundle, 'hooks', ...args], shell: false }]);
    expect(existsSync(join(project, '.agentic-qe', 'hooks-health.log'))).toBe(false);
  });

  it('brain-checkpoint export runs the global bundle via node on win32', () => {
    const { preload, npmDir, project, argvLog, bundle } = setup();
    mkdirSync(join(project, '.claude', 'helpers'), { recursive: true });
    mkdirSync(join(project, '.claude', 'hooks'), { recursive: true });
    mkdirSync(join(project, '.agentic-qe'));
    writeFileSync(join(project, '.claude', 'helpers', 'brain-checkpoint.cjs'), readFileSync(BRAIN));
    writeFileSync(join(project, '.claude', 'hooks', 'aqe-hook.cjs'), readFileSync(SHIM));
    writeFileSync(join(project, '.agentic-qe', 'memory.db'), ''); // placeholder in a tmp dir only

    const stdout = execFileSync(process.execPath,
      ['-r', preload, join(project, '.claude', 'helpers', 'brain-checkpoint.cjs'), 'export', '--json'], {
        env: { PATH: npmDir, ARGV_LOG: argvLog }, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'],
      });

    expect(JSON.parse(stdout)).toEqual({ exported: true, patterns: 7 });
    const [spawned] = readFileSync(argvLog, 'utf-8').trim().split('\n').map((l) => JSON.parse(l));
    expect(spawned.cmd).toBe(process.execPath);
    expect(spawned.args[0]).toBe(bundle);
    expect(spawned.shell).toBe(false);
  });

  it('brain-checkpoint does NOT require a pre-#872 hook (its main would spawn + exit) and reports why', () => {
    const { preload, npmDir, project, argvLog } = setup();
    mkdirSync(join(project, '.claude', 'helpers'), { recursive: true });
    mkdirSync(join(project, '.claude', 'hooks'), { recursive: true });
    mkdirSync(join(project, '.agentic-qe'));
    writeFileSync(join(project, '.claude', 'helpers', 'brain-checkpoint.cjs'), readFileSync(BRAIN));
    // Shape of the pre-#872 shim: top-level spawn + process.exit(0), no exports.
    writeFileSync(join(project, '.claude', 'hooks', 'aqe-hook.cjs'), `
      const { spawnSync } = require('node:child_process');
      spawnSync(process.platform === 'win32' ? 'aqe.cmd' : 'aqe', ['hooks', ...process.argv.slice(2)]);
      process.exit(0);
    `);
    writeFileSync(join(project, '.agentic-qe', 'memory.db'), ''); // placeholder in a tmp dir only

    const stdout = execFileSync(process.execPath,
      ['-r', preload, join(project, '.claude', 'helpers', 'brain-checkpoint.cjs'), 'export', '--json'], {
        env: { PATH: npmDir, ARGV_LOG: argvLog }, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'],
      });

    const result = JSON.parse(stdout);
    expect(result.exported).toBe(false);
    expect(result.reason).toMatch(/predates #872; re-run `aqe init`/);
    expect(existsSync(argvLog)).toBe(false); // nothing was spawned at all
  });
});
