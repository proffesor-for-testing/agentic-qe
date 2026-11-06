/**
 * #1370: without an LLM, every framework template guesses inputs and expected
 * values (`add(None, None)`, `want: 0` for `Add(66, 62)`, mocha's typeof
 * check on `add(29, 20)`). They are labelled scaffolding, so neither
 * test_generate_enhanced nor `aqe test generate` counts them, the coordinator
 * announces none as a generated test, and they import the module under test
 * by a valid path. #1369: generation metadata counts only tests that can fail.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTestGeneratorService, TestGeneratorService } from '../../../../src/domains/test-generation/services/test-generator';
import { templateImportPath } from '../../../../src/domains/test-generation/services/template-import-path';
import { isUnexecutableScaffold, partitionByQualityGate, describeGateRejection } from '../../../../src/domains/test-generation/gates/index';
import { registerTestExecutionHandlers } from '../../../../src/coordination/handlers/test-execution-handlers';
import type { InstanceTaskHandler, TaskHandlerContext } from '../../../../src/coordination/handlers/handler-types';
import type { QueenTask } from '../../../../src/coordination/queen-coordinator';
import { TestGenerationCoordinator } from '../../../../src/domains/test-generation/coordinator';
import { createCoordinatorTestContext, resetTestContext, flushPromises } from '../coordinator-test-utils';
import { TestGenerationEvents } from '../../../../src/shared/events/domain-events';
import { BlindReviewOrchestrator } from '../../../../src/domains/test-generation/blind-review/blind-review-orchestrator';

let root: string;
beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'aqe-1370-')));
  vi.stubEnv('AQE_PROJECT_ROOT', root);
});
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

const memory = () => ({ set: vi.fn(), search: vi.fn(async () => []), vectorSearch: vi.fn(async () => []), get: vi.fn() });

const SOURCES: Array<[string, string, string]> = [
  ['pytest', 'src/calc.py', 'def add(a, b):\n    return a + b\n'],
  ['go-test', 'pkg/calc.go', 'package calc\n\nfunc Add(a int, b int) int { return a + b }\n'],
  ['junit5', 'src/Calc.java', 'package com.example;\npublic class Calc { public static int add(int a, int b) { return a + b; } }\n'],
  ['kotlin-junit', 'src/Calc.kt', 'package com.example\nfun add(a: Int, b: Int): Int = a + b\n'],
  ['xunit', 'src/Calc.cs', 'namespace Example { public class Calc { public static int Add(int a, int b) { return a + b; } } }\n'],
  ['rust-test', 'src/calc.rs', 'pub fn add(a: i32, b: i32) -> i32 { a + b }\n'],
  ['swift-testing', 'src/Calc.swift', 'public func add(_ a: Int, _ b: Int) -> Int { return a + b }\n'],
  ['flutter-test', 'src/calc.dart', 'int add(int a, int b) => a + b;\n'],
  // JS/TS frameworks without the deterministic scaffold also fill a template.
  ['mocha', 'src/math.ts', 'export function add(a: number, b: number): number { return a + b; }\n'],
  ['jest-rn', 'src/math.ts', 'export function add(a: number, b: number): number { return a + b; }\n'],
];

async function generate(framework: string, file: string, code: string, mem = memory(), llmReply?: string) {
  const full = join(root, file);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, code);
  const generator = llmReply === undefined
    ? createTestGeneratorService(mem as never)
    : new TestGeneratorService({ memory: mem as never, llmRouter: { chat: vi.fn(async () => ({ content: llmReply })) } as never },
      { enableLLMEnhancement: true, enableEdgeCaseInjection: false });
  const result = await generator.generateTests({ sourceFiles: [full], testType: 'unit', framework: framework as 'vitest' });
  expect(result.success, JSON.stringify(result)).toBe(true);
  return { test: (result as { value: { tests: Array<Record<string, unknown> & { testCode: string; sourceFile: string }> } }).value.tests[0], mem };
}

describe('#1370 framework templates are scaffolding', () => {
  it.each(SOURCES)('labels the %s template scaffolding and holds it back', async (framework, file, code) => {
    const { test } = await generate(framework, file, code);

    expect(test.generationMode).toBe('scaffolding');
    expect((test.generationLimits as string[]).join(' ')).toMatch(/placeholders, not derived from the source/);
    expect(test.llmEnhanced).toBe(false);
    expect(isUnexecutableScaffold(test, test.sourceFile)).toBe(true);
    expect(partitionByQualityGate([test]).passed).toEqual([]);
  });

  it('keeps LLM output for a non-JS file as a test', async () => {
    const { test } = await generate('pytest', 'src/calc.py', 'def add(a, b):\n    return a + b\n', memory(),
      'from src.calc import add\n\ndef test_add():\n    assert add(2, 3) == 5\n');

    expect(test.llmEnhanced).toBe(true);
    expect(test.generationMode).toBeUndefined();
    expect(isUnexecutableScaffold(test, test.sourceFile)).toBe(false);
  });

  it('labels a vitest integration template scaffolding', async () => {
    const full = join(root, 'src/math.ts');
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(full, 'export function add(a: number, b: number): number { return a + b; }\n');
    const result = await createTestGeneratorService(memory() as never)
      .generateTests({ sourceFiles: [full], testType: 'integration', framework: 'vitest' });
    const test = (result as { value: { tests: Array<{ generationMode?: string; sourceFile: string; testCode: string }> } }).value.tests[0];

    expect(test.generationMode).toBe('scaffolding');
    expect(isUnexecutableScaffold(test, test.sourceFile)).toBe(true);
  });

  it('labels coverage-gap templates scaffolding', async () => {
    const full = join(root, 'src/math.ts');
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(full, 'export function add(a: number, b: number): number { return a + b; }\n');
    const result = await createTestGeneratorService(memory() as never).generateForCoverageGap(full, [1, 2, 5], 'jest');
    const tests = (result as { value: Array<{ generationMode?: string; sourceFile: string; testCode: string }> }).value;

    expect(tests.length).toBeGreaterThan(0);
    for (const t of tests) {
      expect(t.generationMode).toBe('scaffolding');
      expect(isUnexecutableScaffold(t, t.sourceFile)).toBe(true);
    }
  });

  it('writes the declared JVM package, or none, never a class or file name', async () => {
    const kt = await generate('kotlin-junit', 'src/calc.kt', 'package com.ex\n\nfun add(a: Int, b: Int): Int = a + b\n');
    expect(kt.test.testCode).toMatch(/^package com\.ex$/m);
    expect(kt.test.testCode).not.toMatch(/^package com\.ex\.calc/m);

    const java = await generate('junit5', 'nopkg/Calc.java', 'public class Calc { public static int add(int a, int b) { return a + b; } }\n');
    expect(java.test.testCode).not.toMatch(/^\s*package /m);
  });

  it('puts the scaffolding note first when the gate also has findings', () => {
    const pytest = { qualityGateResult: { passed: false, issues: [{ description: 'Test does not import from source file "calc".' }] },
      generationMode: 'scaffolding', generationLimits: ['Template scaffolding: placeholders.'] };

    expect(describeGateRejection(pytest)).toBe('Template scaffolding: placeholders.; Test does not import from source file "calc".');
  });

  it('gives the CLI the scaffolding reason when the gate passed a template', () => {
    const dart = { qualityGateResult: { passed: true, issues: [] }, generationMode: 'scaffolding',
      generationLimits: ['Template scaffolding: inputs and expected values are placeholders, not derived from the source.'] };

    expect(partitionByQualityGate([dart]).rejected).toEqual([dart]);
    expect(describeGateRejection(dart)).toMatch(/^Template scaffolding: /);
  });

  it('imports the module under test by a valid path', async () => {
    const py = await generate('pytest', 'src/calc.py', 'def add(a, b):\n    return a + b\n');
    expect(py.test.testCode).not.toContain('calc.py import');
    expect(py.test.testCode).toMatch(/from \S*calc import add/);

    const go = await generate('go-test', 'pkg/calc.go', 'package calc\n\nfunc Add(a int, b int) int { return a + b }\n');
    expect(go.test.testCode).not.toMatch(/"[^"]*calc\.go"/);

    const java = await generate('junit5', 'src/Calc.java', 'package com.example;\npublic class Calc { public static int add(int a, int b) { return a + b; } }\n');
    expect(java.test.testCode).toMatch(/^package com\.example;/m);

    const cs = await generate('xunit', 'src/Calc.cs', 'namespace Example { public class Calc { public static int Add(int a, int b) { return a + b; } } }\n');
    expect(cs.test.testCode).toMatch(/^using Example;/m);
    expect(cs.test.testCode).not.toContain('using src/');
  });
});

describe('#1370 templateImportPath', () => {
  it.each([
    ['src/calc.py', '', 'src.calc'],
    ['./app/services/user_service.py', '', 'app.services.user_service'],
    ['src/Calc.java', 'package com.example;\nclass Calc {}', 'com.example'],
    ['src/Calc.kt', 'package com.example\nfun x() = 1', 'com.example'],
    ['src/calc.kt', 'package com.ex\nfun add(a: Int, b: Int) = a + b', 'com.ex'],
    ['nopkg/Calc.java', 'public class Calc {}', ''],
    ['../outside/calc.py', '', 'calc'],
    ['src/my-mod.py', '', 'my_mod'],
    ['src/2fast.py', '', '_2fast'],
    ['src/Calc.cs', 'namespace My.App;\nclass Calc {}', 'My.App'],
    ['src/Calc.cs', 'class Calc {}', ''],
    ['src/math.ts', '', 'src/math'],
    ['src/calc.rs', '', 'src/calc.rs'],
  ])('maps %s (case %#)', (file, content, expected) => {
    expect(templateImportPath(file, content)).toBe(expected);
  });

  it('takes Python paths relative to the project root, not the working directory', () => {
    expect(process.cwd()).not.toBe(root);
    expect(templateImportPath(join(root, 'app', 'services', 'user_service.py'))).toBe('app.services.user_service');
  });

  it('builds a Go package path from the nearest go.mod', () => {
    mkdirSync(join(root, 'pkg', 'calc'), { recursive: true });
    writeFileSync(join(root, 'go.mod'), 'module github.com/acme/app\n\ngo 1.22\n');
    expect(templateImportPath(join(root, 'pkg', 'calc', 'calc.go'))).toBe('github.com/acme/app/pkg/calc');
    expect(templateImportPath(join(root, 'main.go'))).toBe('github.com/acme/app');
  });

  it('imports nothing for Go when no go.mod gives the module path', () => {
    expect(templateImportPath(join(root, 'pkg', 'calc.go'))).toBe('');
  });
});

describe('#1369 generation metadata counts only real tests', () => {
  const stored = (mem: ReturnType<typeof memory>) =>
    mem.set.mock.calls.find(([key]) => String(key).startsWith('test-generation:metadata:'))?.[1] as Record<string, unknown>;

  it('records a template scaffold as a scaffold, not a test', async () => {
    const { test, mem } = await generate('pytest', 'src/calc.py', 'def add(a, b):\n    return a + b\n');

    expect(stored(mem)).toMatchObject({ testCount: 0, testIds: [], scaffoldCount: 1, scaffoldIds: [test.id] });
  });

  it('records the TS test.skip scaffold as a scaffold', async () => {
    const { mem } = await generate('vitest', 'src/math.ts', 'export function add(a: number, b: number) { return a + b; }\n');

    expect(stored(mem)).toMatchObject({ testCount: 0, scaffoldCount: 1 });
  });

  it('counts a real test', async () => {
    const { test, mem } = await generate('pytest', 'src/calc.py', 'def add(a, b):\n    return a + b\n', memory(),
      'from src.calc import add\n\ndef test_add():\n    assert add(2, 3) == 5\n');

    expect(stored(mem)).toMatchObject({ testCount: 1, testIds: [test.id], scaffoldCount: 0 });
  });
});

describe('#1370 test_generate_enhanced handler returns templates as scaffolds', () => {
  async function handle(payload: Record<string, unknown>) {
    const mem = memory();
    const handlers = new Map<string, InstanceTaskHandler>();
    registerTestExecutionHandlers({
      registerHandler: (type, handler) => { handlers.set(type, handler); },
      memory: mem,
      getTestGenerator: async () => new TestGeneratorService({ memory: mem as never }, { enableLLMEnhancement: false, enableEdgeCaseInjection: false }),
      config: { defaultLanguage: 'typescript', defaultFramework: 'vitest' },
    } as unknown as TaskHandlerContext);
    const result = await handlers.get('generate-tests')!({
      id: 'task-1370', type: 'generate-tests', priority: 'p1', targetDomains: [], createdAt: new Date(),
      payload: { testType: 'unit', coverageGoal: 80, ...payload },
    } as unknown as QueenTask);
    expect(result.success).toBe(true);
    return (result as { value: { testsGenerated: number; tests: unknown[]; warning?: string;
      scaffolds?: Array<{ scaffold: true; rejectedBecause: string; testCode: string }> } }).value;
  }

  it.each([
    ['pytest', 'python', 'src/calc.py', 'def add(a, b):\n    return a + b\n'],
    ['go-test', 'go', 'pkg/calc.go', 'package calc\n\nfunc Add(a int, b int) int { return a + b }\n'],
    ['junit5', 'java', 'src/Calc.java', 'package com.example;\npublic class Calc { public static int add(int a, int b) { return a + b; } }\n'],
    ['xunit', 'csharp', 'src/Calc.cs', 'namespace Example { public class Calc { public static int Add(int a, int b) { return a + b; } } }\n'],
    ['mocha', 'typescript', 'src/math.ts', 'export function add(a: number, b: number): number { return a + b; }\n'],
  ])('counts no %s template as a test (inline sourceCode)', async (framework, language, filePath, sourceCode) => {
    const data = await handle({ sourceCode, filePath, framework, language });

    expect(data.testsGenerated).toBe(0);
    expect(data.tests).toEqual([]);
    expect(data.scaffolds).toHaveLength(1);
    expect(data.scaffolds![0]).toMatchObject({ scaffold: true });
    expect(data.scaffolds![0].rejectedBecause).toMatch(/Template scaffolding|no executable|tautolog|skipped/i);
    expect(data.warning).toMatch(/^Nothing testable in /);
  });

  it('imports inline Python source by its module path', async () => {
    const data = await handle({ sourceCode: 'def add(a, b):\n    return a + b\n', filePath: 'src/calc.py', framework: 'pytest', language: 'python' });

    expect(data.scaffolds![0].testCode).toContain('from src.calc import add');
    expect(data.scaffolds![0].testCode).not.toContain('calc.py import');
  });
});

describe('#1370 the coordinator announces no scaffold as a generated test', () => {
  let ctx: ReturnType<typeof createCoordinatorTestContext>;
  let coordinator: TestGenerationCoordinator;
  beforeEach(async () => {
    ctx = createCoordinatorTestContext();
    coordinator = new TestGenerationCoordinator(ctx.eventBus, ctx.memory, ctx.agentCoordinator, {
      enablePatternLearning: false, publishEvents: true, enableQESONA: false, enableFlashAttention: false,
      enableDecisionTransformer: false, enableCoherenceGate: false, enableMinCutAwareness: false, enableConsensus: false,
    });
    await coordinator.initialize();
  });
  afterEach(async () => {
    await coordinator.dispose();
    resetTestContext(ctx);
  });

  it('publishes no TestGenerated event and a zero-count suite for a pytest template', async () => {
    const full = join(root, 'src/calc.py');
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(full, 'def add(a, b):\n    return a + b\n');
    const result = await coordinator.generateTests({ sourceFiles: [full], testType: 'unit', framework: 'pytest' as 'vitest' });

    expect(result.success).toBe(true);
    expect(ctx.eventBus.getEventsByType(TestGenerationEvents.TestGenerated)).toEqual([]);
    const suites = ctx.eventBus.getEventsByType(TestGenerationEvents.TestSuiteCreated);
    expect(suites).toHaveLength(1);
    expect((suites[0].payload as { testCount: number }).testCount).toBe(0);
  });

  it('publishes no TestGenerated event for coverage-gap templates', async () => {
    const full = join(root, 'src/math.ts');
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(full, 'export function add(a: number, b: number): number { return a + b; }\n');
    await ctx.eventBus.simulateEvent('coverage-analysis.CoverageGapDetected', 'coverage-analysis' as never,
      { file: full, uncoveredLines: [1, 2], measured: true });
    await flushPromises();

    expect(ctx.eventBus.getEventsByType(TestGenerationEvents.TestGenerated)).toEqual([]);
  });
});

describe('#1370 blind review counts no scaffold as a test', () => {
  const scaffold = { id: 's', name: 'calc tests', sourceFile: 'src/calc.py', testFile: 'tests/test_calc.py', type: 'unit' as const,
    assertions: 1, testCode: 'def test_add():\n    assert add(None, None) is not None\n',
    generationMode: 'scaffolding' as const, generationLimits: ['Template scaffolding: placeholders.'] };
  const real = { ...scaffold, id: 'r', generationMode: undefined, generationLimits: undefined,
    testCode: 'def test_add():\n    assert add(2, 3) == 5\n' };
  const service = (tests: unknown[]) => ({
    generateTests: vi.fn(async () => ({ success: true, value: { tests, coverageEstimate: null, patternsUsed: [] } })),
  }) as never;

  it('fails when every reviewer produced only scaffolds', async () => {
    const result = await new BlindReviewOrchestrator(service([scaffold]))
      .generateWithBlindReview({ sourceFiles: ['src/calc.py'], testType: 'unit', framework: 'pytest' as 'vitest' }, { reviewerCount: 2 });

    expect(result.success).toBe(false);
  });

  it('merges only real tests', async () => {
    const result = await new BlindReviewOrchestrator(service([scaffold, real]))
      .generateWithBlindReview({ sourceFiles: ['src/calc.py'], testType: 'unit', framework: 'pytest' as 'vitest' }, { reviewerCount: 1 });

    expect(result.success).toBe(true);
    expect((result as { value: { mergedTests: Array<{ id: string }> } }).value.mergedTests.map(t => t.id)).toEqual(['r']);
  });
});
