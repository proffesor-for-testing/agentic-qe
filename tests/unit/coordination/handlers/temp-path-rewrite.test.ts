/**
 * Regression test for bug #1: test_generate_enhanced temp-path leak.
 *
 * When the user calls test_generate_enhanced with `sourceCode` (no `filePath`),
 * the handler writes the source to `/tmp/aqe-temp-<uuid>.ts` for analysis.
 * The generator then emits tests that import from that path. Without
 * post-processing, the generated tests reference a temp file that we
 * unlink immediately after generation — they cannot be run as-emitted.
 *
 * Fix: rewriteTempPathsInGeneratedTest replaces the temp path with either
 * (a) the user-supplied `filePath`, or (b) a clear `'./module-under-test'`
 * placeholder plus a TODO comment.
 */

import { describe, it, expect, vi } from 'vitest';
import { registerTestExecutionHandlers, rewriteTempPathsInGeneratedTest } from '../../../../src/coordination/handlers/test-execution-handlers';
import type { InstanceTaskHandler, TaskHandlerContext } from '../../../../src/coordination/handlers/handler-types';
import type { QueenTask } from '../../../../src/coordination/queen-coordinator';
import { TestGeneratorService } from '../../../../src/domains/test-generation/services/test-generator';

describe('generate-tests handler with inline sourceCode and an LLM (#795 follow-up)', () => {
  it('never shows the LLM the temp path, so it cannot leak into the emitted test', async () => {
    // Stub LLM that echoes whatever source path the prompt names, in the
    // basename form the full-path rewrite cannot catch.
    const prompts: string[] = [];
    const chat = vi.fn(async (request: { messages: Array<{ role: string; content: string }> }) => {
      const prompt = request.messages.filter(m => m.role === 'user').map(m => m.content).join('\n');
      prompts.push(prompt);
      const named = /Source file: (\S+)/.exec(prompt)?.[1]?.split('/').pop() ?? 'calculator';
      return { content: [
        "import { describe, it, expect } from 'vitest';",
        "import { add } from './module-under-test';",
        `describe(${JSON.stringify(named)}, () => { it('adds', () => { expect(add(1, 2)).toBe(3); }); });`,
      ].join('\n') };
    });
    const memory = {
      get: vi.fn(async () => null), set: vi.fn(async () => undefined), delete: vi.fn(async () => true),
      search: vi.fn(async () => []), vectorSearch: vi.fn(async () => []), has: vi.fn(async () => false),
    };
    const handlers = new Map<string, InstanceTaskHandler>();
    registerTestExecutionHandlers({
      registerHandler: (type, handler) => { handlers.set(type, handler); },
      memory,
      getTestGenerator: async () => new TestGeneratorService(
        { memory: memory as never, llmRouter: { chat } as never },
        { enableLLMEnhancement: true, enableEdgeCaseInjection: false },
      ),
      config: { defaultLanguage: 'typescript', defaultFramework: 'vitest' },
    } as unknown as TaskHandlerContext);

    const result = await handlers.get('generate-tests')!({
      id: 'task-795-leak', type: 'generate-tests', priority: 'p1', targetDomains: [], createdAt: new Date(),
      payload: { sourceCode: 'export function add(a: number, b: number) { return a + b; }', language: 'typescript', framework: 'vitest', testType: 'unit', coverageGoal: 80 },
    } as unknown as QueenTask);

    expect(chat).toHaveBeenCalledTimes(1);
    expect(prompts[0]).not.toContain('aqe-temp-');
    expect(result.success).toBe(true);
    if (!result.success) return;
    const tests = (result.value as { tests: Array<{ testCode: string }>; llmEnhanced: boolean });
    expect(tests.llmEnhanced).toBe(true);
    expect(tests.tests[0].testCode).not.toContain('aqe-temp-');
  });
});

describe('rewriteTempPathsInGeneratedTest (bug #1)', () => {
  const tempPath = '/tmp/aqe-temp-abc-123.ts';

  it('returns input unchanged when no temp path was used', () => {
    const code = `import { foo } from '/real/path';\ntest('x', () => {});`;
    const out = rewriteTempPathsInGeneratedTest(code, '/real/path.ts', undefined, undefined);
    expect(out.testCode).toBe(code);
    expect(out.sourceFile).toBe('/real/path.ts');
  });

  it('replaces temp path with originalFilePath when supplied (strips .ts for TS import convention)', () => {
    const code = `import { foo } from '${tempPath}';\ntest('x', () => {});`;
    const original = '/workspaces/proj/src/foo.ts';
    const out = rewriteTempPathsInGeneratedTest(code, tempPath, tempPath, original);
    // TS imports omit `.ts`, so replacement also omits it
    expect(out.testCode).toContain('/workspaces/proj/src/foo');
    expect(out.testCode).not.toContain('/tmp/aqe-temp');
    // sourceFile metadata keeps the full original path (with extension)
    expect(out.sourceFile).toBe(original);
  });

  it('replaces temp path with placeholder + TODO when no original supplied', () => {
    const code = `import { foo } from '${tempPath}';\ntest('x', () => {});`;
    const out = rewriteTempPathsInGeneratedTest(code, tempPath, tempPath, undefined);
    expect(out.testCode).toContain('./module-under-test');
    expect(out.testCode).not.toContain('/tmp/aqe-temp');
    expect(out.testCode).toContain('TODO');
    // sourceFile stays as the temp path when no original is known — caller can detect
    expect(out.sourceFile).toBe(tempPath);
  });

  it('handles temp paths with mutated extensions (e.g. .test.ts)', () => {
    // Generator may emit paths like `/tmp/aqe-temp-abc-123.test.ts` derived from
    // the temp source; the rewrite must still match.
    const mutated = '/tmp/aqe-temp-abc-123.test.ts';
    const code = `import { foo } from '${mutated}';\ntest('x', () => {});`;
    const out = rewriteTempPathsInGeneratedTest(code, undefined, tempPath, '/src/foo.ts');
    expect(out.testCode).not.toContain('/tmp/aqe-temp');
    expect(out.testCode).toContain('/src/foo');
  });

  it('handles extension-less import form (TS convention)', () => {
    // TypeScript imports typically omit the `.ts` extension, so the generator
    // emits `from '/tmp/aqe-temp-abc-123'` with no suffix. This is the form
    // that originally leaked through to users.
    const stripped = '/tmp/aqe-temp-abc-123';
    const code = `import { foo } from '${stripped}';\ntest('x', () => {});`;
    const out = rewriteTempPathsInGeneratedTest(code, undefined, tempPath, '/src/foo.ts');
    expect(out.testCode).not.toContain('/tmp/aqe-temp');
    // Original `.ts` extension should be stripped to match TS import convention
    expect(out.testCode).toContain('/src/foo');
    expect(out.testCode).not.toContain('/src/foo.ts');
  });

  it('handles extension-less form with placeholder', () => {
    const stripped = '/tmp/aqe-temp-abc-123';
    const code = `import { foo } from '${stripped}';`;
    const out = rewriteTempPathsInGeneratedTest(code, undefined, tempPath, undefined);
    expect(out.testCode).not.toContain('/tmp/aqe-temp');
    expect(out.testCode).toContain('./module-under-test');
  });

  it('does not add TODO comment when originalFilePath is provided', () => {
    const code = `import { foo } from '${tempPath}';`;
    const out = rewriteTempPathsInGeneratedTest(code, tempPath, tempPath, '/real/x.ts');
    expect(out.testCode).not.toContain('TODO');
  });

  it('preserves other paths in the test code', () => {
    const code = [
      `import { foo } from '${tempPath}';`,
      `import { bar } from 'node:fs';`,
      `import { baz } from '@/utils/baz';`,
    ].join('\n');
    const out = rewriteTempPathsInGeneratedTest(code, tempPath, tempPath, '/src/foo.ts');
    expect(out.testCode).toContain("from 'node:fs'");
    expect(out.testCode).toContain("from '@/utils/baz'");
    // .ts extension is stripped to match TS import convention
    expect(out.testCode).toContain('/src/foo');
    expect(out.testCode).not.toContain('/tmp/aqe-temp');
  });
});
