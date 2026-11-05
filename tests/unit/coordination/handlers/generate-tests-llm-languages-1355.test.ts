/**
 * #1355 review: the generate-tests handler must not drop valid tests the full
 * test quality gate cannot judge (pytest, Go, JUnit assertions; TS path-alias
 * and directory-index imports). Only scaffolding, or JS/TS the parser finds
 * unexecutable, is held back. llmEnhanced and the note describe all generated
 * output, kept or not. Duplicate sourceFiles yield one test per file.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { registerTestExecutionHandlers } from '../../../../src/coordination/handlers/test-execution-handlers';
import type { InstanceTaskHandler, TaskHandlerContext } from '../../../../src/coordination/handlers/handler-types';
import type { QueenTask } from '../../../../src/coordination/queen-coordinator';
import { TestGeneratorService } from '../../../../src/domains/test-generation/services/test-generator';

type GenData = {
  testsGenerated: number;
  tests: Array<{ name: string; testCode?: string; qualityGateResult?: { passed: boolean } }>;
  scaffolds?: Array<{ testCode?: string; rejectedBecause: string }>;
  warning?: string;
  llmEnhanced: boolean;
  note?: string;
};

const memory = {
  get: vi.fn(async () => null), set: vi.fn(async () => undefined), delete: vi.fn(async () => true),
  search: vi.fn(async () => []), vectorSearch: vi.fn(async () => []), has: vi.fn(async () => false),
};

async function generate(payload: Record<string, unknown>, llmReply?: string): Promise<GenData> {
  const llmRouter = llmReply === undefined ? undefined : { chat: vi.fn(async () => ({ content: llmReply })) };
  const handlers = new Map<string, InstanceTaskHandler>();
  registerTestExecutionHandlers({
    registerHandler: (type, handler) => { handlers.set(type, handler); },
    memory,
    getTestGenerator: async () => new TestGeneratorService(
      { memory: memory as never, ...(llmRouter ? { llmRouter: llmRouter as never } : {}) },
      { enableLLMEnhancement: !!llmRouter, enableEdgeCaseInjection: false },
    ),
    config: { defaultLanguage: 'typescript', defaultFramework: 'vitest' },
  } as unknown as TaskHandlerContext);
  const result = await handlers.get('generate-tests')!({
    id: 'task-1355', type: 'generate-tests', priority: 'p1', targetDomains: [], createdAt: new Date(),
    payload: { testType: 'unit', coverageGoal: 80, ...payload },
  } as unknown as QueenTask);
  expect(result.success).toBe(true);
  return (result as { value: GenData }).value;
}

const LLM_TESTS = {
  python: ['calc.py', 'pytest', 'def add(a, b):\n    return a + b\n',
    'from calc import add\n\ndef test_add():\n    assert add(2, 3) == 5\n'],
  go: ['calc.go', 'go-test', 'package calc\n\nfunc Add(a int, b int) int { return a + b }\n',
    'package calc\n\nimport "testing"\n\nfunc TestAdd(t *testing.T) {\n\tif got := Add(2, 3); got != 5 {\n\t\tt.Errorf("Add(2,3) = %d; want 5", got)\n\t}\n}\n'],
  java: ['Calc.java', 'junit5', 'package com.example;\npublic class Calc { public static int add(int a, int b) { return a + b; } }\n',
    'package com.example;\nimport org.junit.jupiter.api.Test;\nimport static org.junit.jupiter.api.Assertions.assertEquals;\nclass CalcTest {\n  @Test void add() { assertEquals(5, Calc.add(2, 3)); }\n}\n'],
  'ts path alias': ['math.ts', 'vitest', 'export function add(a: number, b: number) { return a + b; }\n',
    "import { describe, it, expect } from 'vitest';\nimport { add } from '@/math/index';\ndescribe('add', () => { it('adds', () => { expect(add(2, 3)).toBe(5); }); });\n"],
  'python mock assert_called_once_with': ['calc.py', 'pytest', 'def add(a, b):\n    return a + b\n',
    'from unittest.mock import Mock\nfrom calc import add\n\ndef test_add_logs():\n    log = Mock()\n    log(add(2, 3))\n    log.assert_called_once_with(5)\n'],
  "node:test t.assert": ['math.ts', 'node-test', 'export function add(a: number, b: number) { return a + b; }\n',
    "import { test } from 'node:test';\nimport { add } from './math';\ntest('adds', (t) => { t.assert.strictEqual(add(2, 3), 5); });\n"],
  'ts directory index': [path.join('utils', 'index.ts'), 'vitest', 'export function add(a: number, b: number) { return a + b; }\n',
    "import { describe, it, expect } from 'vitest';\nimport { add } from '../src/utils';\ndescribe('add', () => { it('adds', () => { expect(add(2, 3)).toBe(5); }); });\n"],
} as const;

describe('#1355 generate-tests keeps valid tests the gate cannot judge', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'aqe-1355-llm-')));
    vi.stubEnv('AQE_PROJECT_ROOT', tmpDir);
    await fs.mkdir(path.join(tmpDir, 'utils'));
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it.each(Object.entries(LLM_TESTS))('returns the %s LLM test as a generated test', async (_lang, [file, framework, source, reply]) => {
    const filePath = path.join(tmpDir, file);
    await fs.writeFile(filePath, source);

    const data = await generate({ filePath, framework }, reply);

    expect(data.testsGenerated).toBe(1);
    expect(data.tests[0].testCode).toContain(reply.trim().split('\n').pop());
    expect(data.scaffolds).toBeUndefined();
    expect(data.warning).toBeUndefined();
    expect(data.llmEnhanced).toBe(true);
    expect(data.note).toBeUndefined();
  });

  it('reports an unexecutable LLM test as a scaffold, still as LLM output', async () => {
    const filePath = path.join(tmpDir, 'math.ts');
    await fs.writeFile(filePath, 'export function add(a: number, b: number) { return a + b; }\n');
    const reply = "import { describe, it } from 'vitest';\nimport { add } from './math';\ndescribe('add', () => { it('adds', () => { add(2, 3); }); });\n";

    const data = await generate({ filePath, framework: 'vitest' }, reply);

    expect(data.testsGenerated).toBe(0);
    expect(data.scaffolds![0].rejectedBecause).toMatch(/no executable assertions/i);
    expect(data.warning).toMatch(/^Nothing testable in /);
    expect(data.llmEnhanced).toBe(true);
    expect(data.note).toBeUndefined();
  });

  it.each([
    ['a tautology', 'math.ts', 'vitest', "import { it, expect } from 'vitest';\nit('works', () => { expect(true).toBe(true); });\n", /tautology/],
    ['an empty body', 'math.ts', 'vitest', "import { it, expect } from 'vitest';\nimport { add } from './math';\nit('works', () => {});\nexpect(add).toBeDefined();\n", /empty/],
    ['all-skipped JS', 'math.ts', 'vitest', "import { it, expect } from 'vitest';\nimport { add } from './math';\nit.skip('adds', () => { expect(add(2, 3)).toBe(5); });\n", /Every test is skipped/],
    ['a Python pass-only test', 'calc.py', 'pytest', 'from calc import add\n\ndef test_add():\n    pass\n', /No Python assertion/],
    ['a commented-out Python assert', 'calc.py', 'pytest', 'from calc import add\n\ndef test_add():\n    # TODO: assert add(2, 3) == 5\n    pass\n', /No Python assertion/],
    ['Python assert True', 'calc.py', 'pytest', 'from calc import add\n\ndef test_add():\n    assert True\n', /tautology/],
    ['Java assertTrue(true)', 'Calc.java', 'junit5', 'class CalcTest {\n  @Test void add() { assertTrue(true); }\n}\n', /tautology/],
  ])('holds back an LLM test with %s as a scaffold', async (_label, file, framework, reply, why) => {
    const filePath = path.join(tmpDir, file);
    await fs.writeFile(filePath, file.endsWith('.py') ? 'def add(a, b):\n    return a + b\n' : 'export function add(a: number, b: number) { return a + b; }\n');

    const data = await generate({ filePath, framework }, reply);

    expect(data.testsGenerated).toBe(0);
    expect(data.tests).toEqual([]);
    expect(data.scaffolds![0].rejectedBecause).toMatch(why);
    expect(data.warning).toMatch(/^Nothing testable in /);
    expect(data.llmEnhanced).toBe(true);
    expect(data.note).toBeUndefined();
  });

  it('generates one test per file for duplicate sourceFiles', async () => {
    const filePath = path.join(tmpDir, 'math.ts');
    await fs.writeFile(filePath, 'export function add(a: number, b: number) { return a + b; }\n');
    const reply = "import { describe, it, expect } from 'vitest';\nimport { add } from './math';\ndescribe('add', () => { it('adds', () => { expect(add(2, 3)).toBe(5); }); });\n";

    const data = await generate({
      sourceFiles: [filePath, filePath, `${tmpDir}/utils/../math.ts`, `${tmpDir}/./math.ts`],
      framework: 'vitest',
    }, reply);

    expect(data.testsGenerated).toBe(1);
    expect(data.tests).toHaveLength(1);
  });
});
