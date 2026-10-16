/**
 * Review of #1026 (N2/N3): writers that defaulted to a cwd-relative
 * `.agentic-qe` still created `<tmp>/.agentic-qe` when the MCP server or CLI
 * ran from a shared dir, and wrote outside the project when run from a
 * subdirectory. They now resolve the store through findProjectRoot().
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { clearProjectRootCache, getProjectStorePath } from '../../../src/kernel/project-root';
import { ResultSaver } from '../../../src/coordination/result-saver';
import { DailyLogger } from '../../../src/learning/daily-log';
import { NotificationService } from '../../../src/workers/quality-daemon/notification-service';
import { PluginCache } from '../../../src/plugins/cache';
import { GitHubPluginSource } from '../../../src/plugins/sources/github';
import { NpmPluginSource } from '../../../src/plugins/sources/npm';
import { explicitRootError, initProjectRoot, sharedDirInitError, sharedRootInitError } from '../../../src/cli/handlers/init-guard';

describe('store writers resolve the project store, not the cwd', () => {
  let base: string;
  let project: string;
  let elsewhere: string;
  let savedCwd: string;

  beforeEach(() => {
    base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-writers-')));
    project = path.join(base, 'project');
    elsewhere = path.join(base, 'elsewhere');
    fs.mkdirSync(path.join(project, '.git'), { recursive: true });
    fs.mkdirSync(elsewhere, { recursive: true });
    savedCwd = process.cwd();
    process.chdir(elsewhere);
    vi.stubEnv('AQE_PROJECT_ROOT', project);
    vi.stubEnv('AQE_MEMORY_BACKEND', '');
    clearProjectRootCache();
  });

  afterEach(() => {
    process.chdir(savedCwd);
    vi.unstubAllEnvs();
    clearProjectRootCache();
    fs.rmSync(base, { recursive: true, force: true });
  });

  const store = (...s: string[]) => path.join(project, '.agentic-qe', ...s);

  it('getProjectStorePath joins the resolved root', () => {
    expect(getProjectStorePath('results')).toBe(store('results'));
  });

  it('ResultSaver saves under the project store by default', async () => {
    const saved = await new ResultSaver().save('t1', 'predict-defects', { run: 1 });
    expect(saved.files[0].path.startsWith(store('results') + path.sep)).toBe(true);
    expect(fs.existsSync(path.join(elsewhere, '.agentic-qe'))).toBe(false);
  });

  it.each([
    ['DailyLogger', () => (new DailyLogger() as unknown as { config: { logDir: string } }).config.logDir, ['logs']],
    ['NotificationService', () => (new NotificationService() as unknown as { notificationsDir: string }).notificationsDir, ['notifications']],
    ['PluginCache', () => (new PluginCache() as unknown as { cacheDir: string }).cacheDir, ['plugins']],
    ['GitHubPluginSource', () => (new GitHubPluginSource() as unknown as { cacheDir: string }).cacheDir, ['plugins-cache']],
    ['NpmPluginSource', () => (new NpmPluginSource() as unknown as { cacheDir: string }).cacheDir, ['plugins-cache', 'npm']],
  ])('%s defaults to the project store', (_name, dirOf, segments) => {
    expect(dirOf()).toBe(store(...segments));
  });
});

describe('aqe init in a shared directory (N3)', () => {
  it('refuses the OS temp dir and system dirs without AQE_PROJECT_ROOT', () => {
    expect(sharedDirInitError(os.tmpdir(), {})).toMatch(/shared temp\/system directory/);
    if (process.platform !== 'win32') expect(sharedDirInitError('/', {})).not.toBeNull();
  });

  it('allows a normal project dir, or any dir when AQE_PROJECT_ROOT is set', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-init-ok-'));
    try {
      expect(sharedDirInitError(dir, {})).toBeNull();
      expect(sharedDirInitError(os.tmpdir(), { AQE_PROJECT_ROOT: dir })).toBeNull();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('uses the explicit root as the init destination, even when cwd is shared', () => {
    const project = path.join(os.tmpdir(), 'aqe-explicit-project');
    expect(initProjectRoot(os.tmpdir(), { AQE_PROJECT_ROOT: project })).toBe(project);
    expect(sharedDirInitError(os.tmpdir(), { AQE_PROJECT_ROOT: project })).toBeNull();
  });

  it.skipIf(process.platform === 'win32')('allows an explicit sticky 1777 root that is a git repo, refuses one without .git', () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-sticky-'));
    try {
      fs.chmodSync(repo, 0o1777);
      // No .git: a shared scratch dir, still refused.
      expect(sharedDirInitError('/elsewhere', { AQE_PROJECT_ROOT: repo })).toMatch(/shared temp\/system directory/);
      fs.mkdirSync(path.join(repo, '.git'));
      // Same dir as a repo root: findProjectRoot adopts it, so the escape hatch must work.
      expect(sharedDirInitError('/elsewhere', { AQE_PROJECT_ROOT: repo })).toBeNull();
      expect(sharedRootInitError(repo, true)).toBeNull();
      // Without the explicit root the stricter rule still applies.
      expect(sharedRootInitError(repo, false)).toMatch(/shared temp\/system directory/);
      // Hard-stop dirs are refused even when explicit.
      expect(sharedRootInitError(os.tmpdir(), true)).toMatch(/shared temp\/system directory/);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  it('reports a nonexistent or non-directory explicit root as an error instead of creating it', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-explicit-missing-'));
    try {
      const missing = path.join(base, 'nope');
      expect(explicitRootError(base, { AQE_PROJECT_ROOT: missing })).toMatch(/not an existing directory/);
      expect(fs.existsSync(missing)).toBe(false);
      const file = path.join(base, 'file');
      fs.writeFileSync(file, '');
      expect(explicitRootError(base, { AQE_PROJECT_ROOT: file })).toMatch(/not an existing directory/);
      expect(explicitRootError(base, { AQE_PROJECT_ROOT: base })).toBeNull();
      expect(explicitRootError(base, { AQE_PROJECT_ROOT: 'nope' })).toMatch(/not an existing directory/);
      expect(explicitRootError(base, {})).toBeNull();
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  });

  it('refuses an explicit root that is itself a shared directory', () => {
    expect(sharedDirInitError('/some-project', { AQE_PROJECT_ROOT: os.tmpdir() }))
      .toMatch(/shared temp\/system directory/);
  });
});
