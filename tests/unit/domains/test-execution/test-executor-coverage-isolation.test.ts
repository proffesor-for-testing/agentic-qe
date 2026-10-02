import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { TestExecutorService } from '../../../../src/domains/test-execution/services/test-executor.js';

const fixtures: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const path of fixtures.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe('test-run coverage provenance', () => {
  it('does not attach an earlier run\'s disk coverage to a real passing Vitest run', async () => {
    const runner = resolve('node_modules/vitest/vitest.mjs');
    const fixture = realpathSync(mkdtempSync(join(tmpdir(), 'aqe-coverage-isolation-')));
    fixtures.push(fixture);
    const file = join(fixture, 'sample.test.mjs');
    writeFileSync(file, "it('checks the current run', () => expect(2 + 2).toBe(4));\n");
    const config = join(fixture, 'vitest.config.mjs');
    writeFileSync(config, 'export default { test: { globals: true, include: ["*.test.mjs"] } };\n');
    const oldCoverage = JSON.stringify({ total: {
      lines: { pct: 100 }, branches: { pct: 100 }, functions: { pct: 100 }, statements: { pct: 100 },
    } });
    mkdirSync(join(fixture, 'coverage'));
    const oldPath = join(fixture, 'coverage', 'coverage-summary.json');
    writeFileSync(oldPath, oldCoverage);
    vi.spyOn(process, 'cwd').mockReturnValue(fixture);

    const executor = new TestExecutorService({ memory: { set: vi.fn() } as never }, { enableLLMAnalysis: false });
    const internals = executor as unknown as {
      buildTestCommand(files: string[], framework: string): { command: string; args: string[] };
    };
    const original = internals.buildTestCommand.bind(internals);
    // Use the installed real Vitest directly, avoiding npx downloads. Keep
    // the service's native report options and its actual parsing/persistence.
    internals.buildTestCommand = (files, framework) => {
      const command = original(files, framework);
      return { ...command, command: process.execPath,
        args: [runner, ...command.args.slice(1), '--config', config, '--root', fixture] };
    };
    const result = await executor.execute({ testFiles: [file], framework: 'vitest', timeout: 10000 });
    expect(result.success, result.success ? undefined : result.error.message).toBe(true);
    if (result.success) {
      expect(result.value.total).toBe(1);
      expect(result.value.passed).toBe(1);
      expect(result.value.coverage).toBeUndefined();
      expect(result.value.fileCoverages).toBeUndefined();
    }
    expect(readFileSync(oldPath, 'utf8')).toBe(oldCoverage);
  });
  it('keeps concurrent native runs isolated and retains current collected coverage', async () => {
    const runner = resolve('node_modules/vitest/vitest.mjs');
    const modules = resolve('node_modules');
    const fixture = realpathSync(mkdtempSync(join(tmpdir(), 'aqe-coverage-concurrent-')));
    fixtures.push(fixture);
    symlinkSync(modules, join(fixture, 'node_modules'), 'dir');
    writeFileSync(join(fixture, 'sample.mjs'),
      "export function covered() { return 4; }\nexport function uncovered() { return 9; }\n");
    const file = join(fixture, 'sample.test.mjs');
    writeFileSync(file, "import { covered } from './sample.mjs';\nit('checks this run', () => expect(covered()).toBe(4));\n");
    const config = join(fixture, 'vitest.config.mjs');
    writeFileSync(config, `export default { test: { globals: true, include: ['*.test.mjs'],
      coverage: { provider: 'v8', reporter: ['json-summary'], include: ['sample.mjs'] } } };`);
    const oldCoverage = JSON.stringify({ total: {
      lines: { pct: 100 }, branches: { pct: 100 }, functions: { pct: 100 }, statements: { pct: 100 },
    } });
    mkdirSync(join(fixture, 'coverage'));
    const oldPath = join(fixture, 'coverage', 'coverage-summary.json');
    writeFileSync(oldPath, oldCoverage);
    vi.spyOn(process, 'cwd').mockReturnValue(fixture);
    const collectedConfig = join(fixture, 'vitest.coverage.config.mjs');
    writeFileSync(collectedConfig, `export default { test: { globals: true, include: ['*.test.mjs'],
      coverage: { enabled: true, provider: 'v8', reporter: ['json-summary'], include: ['sample.mjs'] } } };`);
    const directories: string[] = [];
    const run = async (collect: boolean) => {
      const executor = new TestExecutorService({ memory: { set: vi.fn() } as never }, { enableLLMAnalysis: false });
      const internals = executor as unknown as {
        buildTestCommand(files: string[], framework: string): { command: string; args: string[]; coverageDirectory: string };
      };
      const original = internals.buildTestCommand.bind(internals);
      internals.buildTestCommand = (files, framework) => {
        const command = original(files, framework);
        directories.push(command.coverageDirectory);
        return { ...command, command: process.execPath,
          args: [runner, ...command.args.slice(1), '--config', collect ? collectedConfig : config, '--root', fixture] };
      };
      return executor.execute({ testFiles: [file], framework: 'vitest', timeout: 10000 });
    };
    const [collected, uncollected] = await Promise.all([run(true), run(false)]);
    expect(collected.success, collected.success ? undefined : collected.error.message).toBe(true);
    expect(uncollected.success, uncollected.success ? undefined : uncollected.error.message).toBe(true);
    if (collected.success && uncollected.success) {
      expect(collected.value.passed).toBe(1);
      expect(collected.value.coverage?.function).toBe(50);
      expect(collected.value.fileCoverages).toEqual([expect.objectContaining({ path: join(fixture, 'sample.mjs'), function: 50 })]);
      expect(uncollected.value.passed).toBe(1);
      expect(uncollected.value.coverage).toBeUndefined();
    }
    expect(new Set(directories).size).toBe(2);
    expect(directories.every(path => !existsSync(path))).toBe(true);
    expect(readFileSync(oldPath, 'utf8')).toBe(oldCoverage);
  });

  it('reads the completed invocation summary when coverage is not embedded in JSON', () => {
    const current = realpathSync(mkdtempSync(join(tmpdir(), 'aqe-current-summary-')));
    fixtures.push(current);
    writeFileSync(join(current, 'coverage-summary.json'), JSON.stringify({ total: {
      lines: { pct: 33 }, branches: { pct: 25 }, functions: { pct: 50 }, statements: { pct: 33 },
    } }));
    const executor = new TestExecutorService({ memory: {} as never });
    const internals = executor as unknown as {
      readCoverageFromDisk(directory: string): { summary: { line: number; function: number } } | undefined;
    };
    expect(internals.readCoverageFromDisk(current)?.summary).toEqual({
      line: 33, branch: 25, function: 50, statement: 33,
    });
  });

});
