import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { TestExecutorService } from '../../../../src/domains/test-execution/services/test-executor.js';

const fixtures: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const fixture of fixtures.splice(0)) rmSync(fixture, { recursive: true, force: true });
});

describe('#1030 sequential coverage', () => {
  it('withholds a combined coverage figure when separate runs only expose percentages', async () => {
    const writes = new Map<string, unknown>();
    const executor = new TestExecutorService({ memory: {
      set: vi.fn(async (key: string, value: unknown) => { writes.set(key, value); }),
      get: vi.fn(async () => undefined),
    } as never }, { enableLLMAnalysis: false });
    const internals = executor as unknown as {
      executeTestFile(file: string): Promise<Record<string, unknown>>;
    };
    internals.executeTestFile = vi.fn(async file => ({
      total: 1, passed: 1, failed: 0, skipped: 0, failedTests: [],
      coverage: { line: 50, branch: null, function: 50, statement: 50 },
      fileCoverages: [{ path: file, line: 50, branch: null, function: 50, statement: 50 }],
    }));

    const result = await executor.execute({ testFiles: ['a.test.ts', 'b.test.ts'], framework: 'vitest' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.passed).toBe(2);
      expect(result.value.coverage).toBeUndefined();
      expect(result.value.fileCoverages).toBeUndefined();
    }
    expect(writes.has('coverage:latest')).toBe(false);
  });

  it('unions coverage from separate test files instead of averaging and duplicating source files', async () => {
    const fixture = realpathSync(mkdtempSync(join(tmpdir(), 'aqe-sequential-coverage-')));
    fixtures.push(fixture);
    symlinkSync(resolve('node_modules'), join(fixture, 'node_modules'), 'dir');
    writeFileSync(join(fixture, 'source.mjs'),
      'export function first() { return 1; }\nexport function second() { return 2; }\n');
    const first = join(fixture, 'first.test.mjs');
    const second = join(fixture, 'second.test.mjs');
    writeFileSync(first, "import { first } from './source.mjs';\nit('first', () => expect(first()).toBe(1));\n");
    writeFileSync(second, "import { second } from './source.mjs';\nit('second', () => expect(second()).toBe(2));\n");
    const config = join(fixture, 'vitest.config.mjs');
    writeFileSync(config, `export default { test: { globals: true, include: ['*.test.mjs'],
      coverage: { enabled: true, provider: 'v8', reporter: ['json'], include: ['source.mjs'] } } };`);
    vi.spyOn(process, 'cwd').mockReturnValue(fixture);

    const executor = new TestExecutorService({ memory: { set: vi.fn(), get: vi.fn() } as never }, { enableLLMAnalysis: false });
    const runner = resolve('node_modules/vitest/vitest.mjs');
    const internals = executor as unknown as {
      buildTestCommand(files: string[], framework: string): { command: string; args: string[] };
    };
    const original = internals.buildTestCommand.bind(internals);
    internals.buildTestCommand = (files, framework) => {
      const command = original(files, framework);
      return { ...command, command: process.execPath,
        args: [runner, ...command.args.slice(1), '--config', config, '--root', fixture] };
    };

    const result = await executor.execute({ testFiles: [first, second], framework: 'vitest', timeout: 15000 });
    expect(result.success, result.success ? undefined : result.error.message).toBe(true);
    if (result.success) {
      expect(result.value.total).toBe(2);
      expect(result.value.passed).toBe(2);
      expect(result.value.coverage?.function).toBe(100);
      expect(result.value.fileCoverages).toEqual([
        expect.objectContaining({ path: join(fixture, 'source.mjs'), function: 100 }),
      ]);
    }
  }, 60000);
});
