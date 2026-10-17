/**
 * #1096: the built CLI exits non-zero when nothing was indexed, rejects a
 * malformed path list, and never indexes a symlink out of the project.
 * Real temp project with a real symlink to a file outside it.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const cli = resolve('dist/cli/bundle.js');

describe('built CLI code indexing confinement (#1096)', () => {
  let base: string;
  let root: string;

  beforeAll(() => {
    base = realpathSync(mkdtempSync(join(tmpdir(), 'aqe-1096-cli-')));
    root = join(base, 'proj');
    mkdirSync(join(root, '.git'), { recursive: true });
    mkdirSync(join(root, '.home'));
    mkdirSync(join(root, 'src'));
    mkdirSync(join(base, 'outside'));
    writeFileSync(join(root, 'src', 'ok.ts'), 'export function add(a: number, b: number) { return a + b; }\n');
    writeFileSync(join(base, 'outside', 'secret.ts'), "export const SECRET_TOKEN_1096 = 'outside-the-project';\n");
    symlinkSync(join('..', '..', 'outside', 'secret.ts'), join(root, 'src', 'leak.ts'));
  });

  afterAll(() => {
    if (base) rmSync(base, { recursive: true, force: true });
  });

  function aqe(...args: string[]) {
    const result = spawnSync(process.execPath, [cli, ...args], {
      cwd: root, encoding: 'utf8', timeout: 60000,
      env: { PATH: process.env.PATH, TMPDIR: process.env.TMPDIR, HOME: join(root, '.home'),
        AQE_PROJECT_ROOT: root, AQE_MEMORY_BACKEND: 'memory', AQE_LLM_ROUTER_DISABLED: 'true',
        AQE_WORKERS_ENABLED: 'false', AQE_SESSION_CACHE: 'off', NO_COLOR: '1' },
    });
    return { status: result.status, output: result.stdout + result.stderr };
  }

  const submitIndex = (payload: unknown) =>
    aqe('task', 'submit', 'index', '--domain', 'code-intelligence', '--payload', JSON.stringify(payload),
      '--wait', '--timeout', '20000', '--no-progress');

  it('task submit index exits 1 when every path was blocked', () => {
    const result = submitIndex({ paths: ['src/leak.ts'] });

    expect(result.status, result.output).toBe(1);
    expect(result.output).toContain('Nothing was indexed: 0 of 1 requested path(s) indexed - src/leak.ts (outside-project-root)');
    expect(result.output).not.toContain('Task completed successfully');
  }, 70000);

  it('task submit index rejects a non-array paths value', () => {
    const result = submitIndex({ paths: 'src/ok.ts' });

    expect(result.status, result.output).toBe(1);
    expect(result.output).toContain("Invalid index payload: 'paths' must be an array of file paths, got string");
  }, 70000);

  it('task submit index still succeeds for an in-project file', () => {
    const result = submitIndex({ paths: ['src/ok.ts'] });

    expect(result.status, result.output).toBe(0);
    expect(result.output).toContain('Task completed successfully');
  }, 70000);

  it('code index exits 1 for a symlink out of the project', () => {
    const result = aqe('code', 'index', 'src/leak.ts', '--format', 'json');

    expect(result.status, result.output).toBe(1);
    expect(result.output).toContain('Nothing was indexed');
    expect(result.output).not.toContain('"filesIndexed": 1');
  }, 70000);
});
