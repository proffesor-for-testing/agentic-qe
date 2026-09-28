import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const cli = resolve(process.cwd(), 'dist', 'cli', 'bundle.js');

describe('Codex init through a globally linked aqe bin', () => {
  it.skipIf(process.platform === 'win32')('installs packaged hooks and skills from a symlinked entry point', () => {
    if (!existsSync(cli)) throw new Error('Build the CLI bundle before this integration test');
    const scratch = mkdtempSync(join(tmpdir(), 'aqe-codex-bin-'));
    try {
      const bin = join(scratch, 'bin');
      const home = join(scratch, 'home');
      const project = join(scratch, 'project');
      mkdirSync(bin);
      mkdirSync(home);
      mkdirSync(project);
      const aqe = join(bin, 'aqe');
      symlinkSync(cli, aqe);
      writeFileSync(join(project, 'package.json'), '{"name":"repro","version":"1.0.0"}');
      const git = spawnSync('git', ['init', '-q'], { cwd: project, encoding: 'utf8' });
      expect(git.status).toBe(0);

      const result = spawnSync(process.execPath,
        [aqe, 'init', '--auto', '--minimal', '--with-codex', '--codex-guidance', 'compact', '--json'],
        { cwd: project, env: { ...process.env, HOME: home, AQE_PROJECT_ROOT: '' }, encoding: 'utf8', timeout: 30_000 });
      expect(result.status, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout).summary.codexComponents).toMatchObject({
        hooks: { status: 'installed' },
        skills: { status: 'installed' },
      });
      expect(existsSync(join(project, '.codex', 'hooks.json'))).toBe(true);
      expect(existsSync(join(project, '.codex', 'hooks', 'aqe-runtime.cjs'))).toBe(true);
      expect(existsSync(join(project, '.agents', 'skills', 'aqe-plan-quality', 'SKILL.md'))).toBe(true);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  }, 40_000);
});
