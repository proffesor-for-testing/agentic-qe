import { afterAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const cli = resolve(__dirname, '..', '..', '..', 'dist', 'cli', 'bundle.js');

describe('aqe init explicit project root (#1031 S1)', () => {
  const base = mkdtempSync(join(tmpdir(), 'aqe-init-explicit-root-'));
  const project = join(base, 'project');
  const home = join(base, 'home');

  afterAll(() => rmSync(base, { recursive: true, force: true }));

  it('writes project assets to AQE_PROJECT_ROOT rather than a shared cwd', () => {
    mkdirSync(project);
    mkdirSync(home);
    writeFileSync(join(project, 'package.json'), '{"name":"target-project","version":"1.0.0"}\n');
    const result = spawnSync(process.execPath, [
      cli, 'init', '--auto', '--minimal', '--memory', 'memory', '--skip-code-index',
      '--skip-patterns', '--no-mcp', '--no-governance', '--skip-claude-flow',
    ], {
      cwd: base,
      env: {
        ...process.env,
        HOME: home,
        USERPROFILE: home,
        CODEX_HOME: join(home, 'codex'),
        CLAUDE_CONFIG_DIR: join(home, 'claude'),
        XDG_CACHE_HOME: join(home, 'cache'),
        XDG_CONFIG_HOME: join(home, 'config'),
        XDG_DATA_HOME: join(home, 'data'),
        XDG_STATE_HOME: join(home, 'state'),
        AQE_PROJECT_ROOT: project,
        AQE_SESSION_CACHE: 'off',
        RUFLO_DAEMON_AUTOSTART: '0',
        CI: '1',
        NO_COLOR: '1',
        PATH: `${dirname(process.execPath)}:${process.env.PATH ?? ''}`,
      },
      encoding: 'utf8',
      timeout: 120_000,
    });

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(existsSync(join(project, '.claude'))).toBe(true);
    expect(existsSync(join(project, 'CLAUDE.md'))).toBe(true);
    expect(existsSync(join(base, '.claude'))).toBe(false);
    expect(existsSync(join(base, 'CLAUDE.md'))).toBe(false);
    expect(existsSync(join(base, '.agentic-qe'))).toBe(false);
  });
});
