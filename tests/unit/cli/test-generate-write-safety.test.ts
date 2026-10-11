/**
 * #936 follow-up: with the 10-file cap gone, `aqe test generate` must never
 * (1) write outside the project, e.g. when the project directory name
 * contains ".ts", or (2) silently replace an existing (hand-written) test.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createTestGeneratorService } from '../../../src/domains/test-generation/services/test-generator';
import { createTestCommand } from '../../../src/cli/commands/test.js';
import { isInsideRoot, writeGeneratedTestFile } from '../../../src/cli/utils/generated-test-writer.js';
import type { CLIContext } from '../../../src/cli/handlers/interfaces.js';

const HAND_WRITTEN = '// HAND-WRITTEN TEST - must not be overwritten\n';

let parent: string;
let log: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  parent = mkdtempSync(join(tmpdir(), 'aqe-936-safety-'));
  log = vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  log.mockRestore();
  vi.unstubAllEnvs();
  rmSync(parent, { recursive: true, force: true });
});

const output = () => log.mock.calls.flat().join('\n');
const exit = vi.fn() as unknown as (code: number) => Promise<never>;
const run = (context: CLIContext, args: string[]) =>
  createTestCommand(context, exit, vi.fn(async () => true)).parseAsync(args, { from: 'user' });

/** Domain stub returning fixed generated tests (gate already passed). */
function stubContext(tests: Array<{ sourceFile: string; testFile: string; testCode: string }>): CLIContext {
  const value = {
    tests: tests.map(t => ({ ...t, name: t.testFile, assertions: 1, qualityGateResult: { passed: true, score: 100 } })),
    coverageEstimate: null,
    patternsUsed: [],
  };
  const generateTests = vi.fn(async () => ({ success: true, value }));
  return { kernel: { getDomainAPIAsync: vi.fn(async () => ({ generateTests })) } } as unknown as CLIContext;
}

describe('project directory whose name contains ".ts"', () => {
  it('the real generator targets the source directory and the CLI writes inside the project', async () => {
    const project = join(parent, 'my.ts-app');
    mkdirSync(join(project, 'src'), { recursive: true });
    const source = join(project, 'src', 'math.ts');
    const examples = join(project, 'examples.json');
    writeFileSync(source, 'export function add(a: number, b: number): number {\n  return a + b;\n}\n');
    writeFileSync(examples, JSON.stringify([{ functionName: 'add', args: [2, 3], expected: 5 }]));
    vi.stubEnv('AQE_PROJECT_ROOT', project);
    const memory = { set: vi.fn(), search: vi.fn(async () => []), vectorSearch: vi.fn(async () => []), get: vi.fn() };
    const generator = createTestGeneratorService(memory as never);
    const context = { kernel: { getDomainAPIAsync: vi.fn(async () => generator), memory } } as unknown as CLIContext;

    await run(context, ['generate', source, '--behavior-examples', examples, '--framework', 'vitest']);

    expect(existsSync(join(project, 'src', 'math.test.ts'))).toBe(true);
    expect(existsSync(join(parent, 'my-app'))).toBe(false);
    expect(readdirSync(parent)).toEqual(['my.ts-app']);
    expect(output()).toContain('Wrote 1 of 1 generated test files.');
  });

  it('a test path that resolves outside the project root is skipped with a clear message', async () => {
    const project = join(parent, 'app');
    mkdirSync(project);
    writeFileSync(join(project, 'a.js'), 'export const a = 1;');
    vi.stubEnv('AQE_PROJECT_ROOT', project);
    const outside = join(parent, 'elsewhere', 'a.test.js');
    const context = stubContext([{ sourceFile: join(project, 'a.js'), testFile: outside, testCode: '// x\n' }]);

    await run(context, ['generate', join(project, 'a.js')]);

    expect(existsSync(dirname(outside))).toBe(false);
    expect(output()).toContain(`${outside} is outside the project root ${project}, skipped (not written)`);
    expect(output()).toContain('Wrote 0 of 1 generated test files (1 skipped).');
  });
});

describe('existing test files', () => {
  it('skips a hand-written test without --force and overwrites it with --force', async () => {
    const project = join(parent, 'app');
    mkdirSync(join(project, 'src'), { recursive: true });
    vi.stubEnv('AQE_PROJECT_ROOT', project);
    const existing = join(project, 'src', 'a.test.js');
    const fresh = join(project, 'src', 'b.test.js');
    writeFileSync(join(project, 'src', 'a.js'), 'export const a = 1;');
    writeFileSync(existing, HAND_WRITTEN);
    const context = stubContext([
      { sourceFile: join(project, 'src', 'a.js'), testFile: existing, testCode: '// generated a\n' },
      { sourceFile: join(project, 'src', 'b.js'), testFile: fresh, testCode: '// generated b\n' },
    ]);

    await run(context, ['generate', join(project, 'src')]);

    expect(readFileSync(existing, 'utf8')).toBe(HAND_WRITTEN);
    expect(readFileSync(fresh, 'utf8')).toBe('// generated b\n');
    expect(output()).toContain(`${existing} exists, skipped (use --force to overwrite)`);
    expect(output()).toContain('Wrote 1 of 2 generated test files (1 skipped).');

    log.mockClear();
    await run(context, ['generate', join(project, 'src'), '--force']);

    expect(readFileSync(existing, 'utf8')).toBe('// generated a\n');
    expect(output()).toContain('Wrote 2 of 2 generated test files.');
  });
});

describe('writeGeneratedTestFile', () => {
  it('treats the root itself, parents and ../ escapes as outside', () => {
    expect(isInsideRoot('/p/app/src/a.test.ts', '/p/app')).toBe(true);
    expect(isInsideRoot('/p/app', '/p/app')).toBe(false);
    expect(isInsideRoot('/p/app/../my-app/a.test.ts', '/p/app')).toBe(false);
    expect(isInsideRoot('/p/app-other/a.test.ts', '/p/app')).toBe(false);
  });

  it('never creates directories for a path outside the root', () => {
    const result = writeGeneratedTestFile(join(parent, 'out', 'x.test.js'), '//', { projectRoot: join(parent, 'app') });
    expect(result.status).toBe('outside-project');
    expect(existsSync(join(parent, 'out'))).toBe(false);
  });
});
