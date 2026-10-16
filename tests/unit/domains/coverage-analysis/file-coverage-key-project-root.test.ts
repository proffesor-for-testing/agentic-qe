import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileCoverageKey, fileCoverageLookupKeys } from '../../../../src/domains/coverage-analysis/collected-metrics';

const created: string[] = [];
const savedRoot = process.env.AQE_PROJECT_ROOT;
afterEach(() => {
  vi.restoreAllMocks();
  if (savedRoot === undefined) delete process.env.AQE_PROJECT_ROOT;
  else process.env.AQE_PROJECT_ROOT = savedRoot;
  for (const path of created.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe('per-file coverage keys resolve against the project root, not the cwd (#1047)', () => {
  it('honours AQE_PROJECT_ROOT for a relative path', () => {
    process.env.AQE_PROJECT_ROOT = join(homedir(), 'some-project');
    expect(fileCoverageKey('src/a.ts')).toBe(join(homedir(), 'some-project', 'src', 'a.ts'));
    expect(fileCoverageLookupKeys('src/a.ts')[0]).toBe(`coverage:file:${join(homedir(), 'some-project', 'src', 'a.ts')}`);
  });

  it('resolves to the repository root when the process runs in a subdirectory', () => {
    delete process.env.AQE_PROJECT_ROOT;
    const repo = realpathSync(mkdtempSync(join(homedir(), '.aqe-coverage-key-')));
    created.push(repo);
    mkdirSync(join(repo, '.git'));
    mkdirSync(join(repo, 'packages', 'app'), { recursive: true });
    vi.spyOn(process, 'cwd').mockReturnValue(join(repo, 'packages', 'app'));
    expect(fileCoverageKey('src/a.ts')).toBe(join(repo, 'src', 'a.ts'));
  });

  it('keeps explicit roots and absolute paths unchanged', () => {
    expect(fileCoverageKey('src/a.ts', '/p')).toBe(join('/p', 'src', 'a.ts'));
    expect(fileCoverageKey('/abs/src/a.ts', '/p')).toBe(join('/abs', 'src', 'a.ts'));
  });
});
