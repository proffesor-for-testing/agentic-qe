/**
 * #936 follow-up: the generated test path strips only the source file's
 * trailing extension. A first-match replace turned
 * /x/my.ts-app/src/math.ts into /x/my-app/src/math.ts.test.ts, outside the
 * project. The same path is reported by the MCP test_generate_enhanced tool.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTestGeneratorService } from '../../../../src/domains/test-generation/services/test-generator';

let parent: string;
beforeEach(() => { parent = mkdtempSync(join(tmpdir(), 'aqe-936-path-')); });
afterEach(() => { rmSync(parent, { recursive: true, force: true }); });

const memory = { set: vi.fn(), search: vi.fn(async () => []), vectorSearch: vi.fn(async () => []), get: vi.fn() };

describe.each([
  ['my.ts-app', 'math.ts', 'vitest', [{ functionName: 'add', args: [2, 3], expected: 5 }], 'export function add(a: number, b: number): number {\n  return a + b;\n}\n', 'math.test.ts'],
  ['lib.js.tools', 'util.js', 'node-test', [{ functionName: 'double', args: [4], expected: 8 }], 'export function double(n) {\n  return n * 2;\n}\n', 'util.test.js'],
])('project directory %s', (dirName, file, framework, examples, code, expectedTest) => {
  it(`puts the test for ${file} next to it as ${expectedTest}`, async () => {
    const src = join(parent, dirName, 'src');
    mkdirSync(src, { recursive: true });
    writeFileSync(join(src, file), code);
    const generator = createTestGeneratorService(memory as never);

    const result = await generator.generateTests({
      sourceFiles: [join(src, file)], testType: 'unit', framework: framework as 'vitest', behaviorExamples: examples,
    });

    expect(result.success, JSON.stringify(result)).toBe(true);
    if (!result.success) return;
    expect(result.value.tests[0].testFile).toBe(join(src, expectedTest));
  });
});
