import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { symlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createTestGeneratorService } from '../../../../src/domains/test-generation/services/test-generator';
import { generateBehaviorExamples } from '../../../../src/domains/test-generation/services/behavior-examples';
import type { MemoryBackend } from '../../../../src/kernel/interfaces';

const directories: string[] = [];
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'aqe-787-'));
  directories.push(dir);
  return dir;
}
function service() {
  return createTestGeneratorService({ search: vi.fn(async () => []), vectorSearch: vi.fn(async () => []), store: vi.fn(), set: vi.fn(), retrieve: vi.fn(), get: vi.fn() } as unknown as MemoryBackend);
}
afterEach(() => { for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true }); });
const examples = [{ functionName: 'add', args: [2, 3], expected: 5 }, { functionName: 'add', args: [-2, 0], expected: -2 }];

describe('#787 deterministic behavior specifications', () => {
  it('runs emitted assertions and kills independently seeded arithmetic defects', async () => {
    const dir = fixture();
    const source = join(dir, 'calculator.mjs');
    writeFileSync(source, 'export function add(a,b) { return a+b; }');
    const result = await service().generateTests({ sourceFiles: [relative(process.cwd(), source)], testType: 'unit', framework: 'node-test', behaviorExamples: examples });
    if (!result.success) throw result.error;
    expect(result.success).toBe(true);
    const generated = result.value.tests[0];
    expect(generated.generationMode).toBe('behavior-examples');
    expect(generated.assertions).toBe(2);
    expect(result.value.coverageEstimate).toBe(0);
    const testFile = join(dir, 'calculator.test.mjs');
    writeFileSync(testFile, generated.testCode);
    expect(spawnSync(process.execPath, ['--test', testFile]).status).toBe(0);
    for (const defect of ['a-b', 'a+b+1', '5']) {
      writeFileSync(source, `export function add(a,b) { return ${defect}; }`);
      const run = spawnSync(process.execPath, ['--test', testFile], { encoding: 'utf8' });
      expect(run.status, run.stdout + run.stderr).not.toBe(0);
      expect(run.stdout).toContain('ERR_ASSERTION');
    }
  }, 60000);

  it('executes generated TS async arrow tests in Vitest without deriving the oracle from the body', async () => {
    const dir = fixture();
    symlinkSync(resolve('node_modules'), join(dir, 'node_modules'), 'dir');
    writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
    writeFileSync(join(dir, 'vitest.config.mjs'), 'export default { test: { include: ["*.test.ts"] } };');
    const source = join(dir, 'source.ts');
    writeFileSync(source, 'export const add = async (a: number,b: number): Promise<number> => a-b;');
    const result = await service().generateTests({ sourceFiles: [source], testType: 'unit', framework: 'vitest', behaviorExamples: examples });
    if (!result.success) throw result.error;
    const testFile = join(dir, 'source.test.ts');
    writeFileSync(testFile, result.value.tests[0].testCode);
    const run = () => spawnSync(process.execPath, [resolve('node_modules/vitest/vitest.mjs'), 'run', '--root', dir, '--config', join(dir, 'vitest.config.mjs')], { cwd: dir, encoding: 'utf8', timeout: 60000 });
    const mutant = run();
    expect(mutant.status, mutant.stdout + mutant.stderr).not.toBe(0);
    expect(mutant.stdout + mutant.stderr).toContain('AssertionError');
    writeFileSync(source, 'export const add = async (a: number,b: number): Promise<number> => a+b;');
    const correct = run();
    expect(correct.status, correct.stdout + correct.stderr).toBe(0);
  }, 180000);

  it('reproduces the issue input honestly without a specification (no fabricated constructor or oracle)', async () => {
    const source = join(fixture(), 'source.js');
    writeFileSync(source, 'export function add(a,b) { return a+b; }');
    const result = await service().generateTests({ sourceFiles: [source], testType: 'unit', framework: 'vitest' });
    if (!result.success) throw result.error;
    expect(result.success).toBe(true);
    expect(result.value.tests[0]).toMatchObject({ generationMode: 'scaffolding', assertions: 0 });
    expect(result.value.tests[0].testCode).toContain('test.skip');
    expect(result.value.tests[0].testCode).not.toMatch(/new moduleUnderTest|Object.keys|basic operations/);
  });

  it.each([
    ['export function* add(a,b) { yield a+b; }', examples],
    ['export function add(this: unknown,a,b) {}', examples],
    ['export function add(a,b) { invalid syntax }', examples],
    ['export function add(a,b) {}', [{ functionName: 'add', args: Array(2), expected: 1 }]],
    ['export default function add(a,b) {}', examples],
    ['export function add(...a) {}', examples],
    ['export function add(a=1,b=2) {}', examples],
    ['export function add({a},b) {}', examples],
    ['function add(a,b) {}', examples],
    ['export function add(a,b) {}', [{ functionName: 'add', args: [2], expected: 2 }]],
    ['export function add(a,b) {}', [{ functionName: 'add', args: [2,3] }]],
    ['export function add(a,b) {}', [{ functionName: 'add', args: [2,3], expected: NaN }]],
  ])('rejects unsupported or incomplete specifications %#', (source, fixtures) => {
    expect(() => generateBehaviorExamples(source, 'source.ts', './source.ts', 'vitest', fixtures as typeof examples, 'unit')).toThrow();
  });

  it.each([
    { framework: 'mocha', testType: 'unit' },
    { framework: 'vitest', testType: 'integration' },
    { framework: 'vitest', testType: 'e2e' },
  ] as const)('rejects examples outside supported framework/test type: %o', async ({ framework, testType }) => {
    const source = join(fixture(), 'source.js');
    writeFileSync(source, 'export function add(a,b) { return a+b; }');
    const result = await service().generateTests({ sourceFiles: [source], framework, testType, behaviorExamples: examples });
    expect(result.success).toBe(false);
  });

  it('rejects a shared examples array for multiple files instead of silently generating partial coverage', async () => {
    const result = await service().generateTests({ sourceFiles: ['a.js', 'b.js'], framework: 'vitest', testType: 'unit', behaviorExamples: examples });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.message).toContain('exactly one source file');
  });

  it('serializes fixture text safely and preserves JSON object semantics', () => {
    const value = JSON.parse('{"__proto__":{"safe":true},"text":"\\\"; throw new Error(\\\"injection\\\"); //"}');
    const generated = generateBehaviorExamples('export function echo(a) { return a; }', 'source.js', './source.js', 'node-test', [{ functionName: 'echo', args: [value], expected: value }], 'unit');
    const dir = fixture();
    writeFileSync(join(dir, 'source.js'), 'export function echo(a) { return a; }');
    writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
    const file = join(dir, 'test.mjs');
    writeFileSync(file, generated.code);
    expect(spawnSync(process.execPath, ['--test', file]).status).toBe(0);
  });
});
