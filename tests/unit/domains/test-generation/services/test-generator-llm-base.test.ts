/**
 * #795 blocker 1: without behaviorExamples, the AI-enhanced path must hand the
 * LLM the framework template (with the real import line) plus the source path,
 * not the zero-assertion scaffold. The fixture path must stay LLM-free.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TestGeneratorService } from '../../../../../src/domains/test-generation/services/test-generator';
import type { MemoryBackend } from '../../../../../src/kernel/interfaces';

const SOURCE = [
  'export function add(a, b) { return a + b; }',
  'export function isEven(n) { return n % 2 === 0; }',
  'export function greet(name) { return `Hello, ${name}!`; }',
].join('\n');

const directories: string[] = [];
afterEach(() => {
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function fixture(): { sourceFile: string; importPath: string } {
  const dir = mkdtempSync(join(tmpdir(), 'aqe-795-llm-'));
  directories.push(dir);
  const sourceFile = join(dir, 'math.js');
  writeFileSync(sourceFile, SOURCE);
  return { sourceFile, importPath: sourceFile.replace(/\.js$/, '') };
}

function memory(): MemoryBackend {
  return {
    get: vi.fn(async () => null), set: vi.fn(async () => undefined), delete: vi.fn(async () => true),
    search: vi.fn(async () => []), vectorSearch: vi.fn(async () => []), has: vi.fn(async () => false),
  } as unknown as MemoryBackend;
}

/** Stub router that records every user prompt and returns `reply` (or throws). */
function stubRouter(reply: string | Error) {
  const prompts: string[] = [];
  const chat = vi.fn(async (request: { messages: Array<{ role: string; content: string }> }) => {
    prompts.push(request.messages.filter(m => m.role === 'user').map(m => m.content).join('\n'));
    if (reply instanceof Error) throw reply;
    return { content: reply };
  });
  return { router: { chat }, prompts, chat };
}

function service(router: unknown) {
  // No generatorFactory injected: exercise the real default generator path.
  return new TestGeneratorService(
    { memory: memory(), llmRouter: router as never },
    { enableLLMEnhancement: true, enableEdgeCaseInjection: false },
  );
}

describe('#795 AI-enhanced generation without behaviorExamples', () => {
  it('sends the template import line and the source path to the LLM', async () => {
    const { sourceFile, importPath } = fixture();
    const llmCode = [
      "import { describe, it, expect } from 'vitest';",
      `import { add } from '${importPath}';`,
      "describe('add', () => { it('adds', () => { expect(add(1, 2)).toBe(3); }); });",
    ].join('\n');
    const { router, prompts } = stubRouter(llmCode);

    const result = await service(router).generateTests({
      sourceFiles: [sourceFile], testType: 'unit', framework: 'vitest', language: 'javascript',
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain(`import { add, isEven, greet } from '${importPath}'`);
    expect(prompts[0]).toContain(`Source file: ${sourceFile}`);
    expect(prompts[0]).not.toContain('test.skip(');
    const test = result.value.tests[0];
    expect(test.llmEnhanced).toBe(true);
    expect(test.testCode).toBe(llmCode);
    // LLM output is not deterministic scaffolding; don't label it as such.
    expect(test.generationMode).toBeUndefined();
    expect(test.generationLimits).toBeUndefined();
  });

  it.each([
    ['returns nothing', ''],
    ['throws', new Error('provider down')],
  ])('falls back to the zero-assertion scaffold when the LLM %s', async (_label, reply) => {
    const { sourceFile } = fixture();
    const { router, chat } = stubRouter(reply);

    const result = await service(router).generateTests({
      sourceFiles: [sourceFile], testType: 'unit', framework: 'vitest', language: 'javascript',
    });

    expect(chat).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
    if (!result.success) return;
    const test = result.value.tests[0];
    expect(test.llmEnhanced).toBe(false);
    expect(test).toMatchObject({ generationMode: 'scaffolding', assertions: 0 });
    expect(test.testCode).toContain('test.skip(');
    // No template assertions with guessed expected values survive the fallback.
    expect(test.testCode).not.toMatch(/\bexpect\(/);
  });

  it('keeps the fixture path LLM-free and unchanged when behaviorExamples are given', async () => {
    const { sourceFile } = fixture();
    const { router, chat } = stubRouter('should never be used');

    const result = await service(router).generateTests({
      sourceFiles: [sourceFile], testType: 'unit', framework: 'vitest', language: 'javascript',
      behaviorExamples: [{ functionName: 'add', args: [2, 3], expected: 5 }],
    });

    expect(chat).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    if (!result.success) return;
    const test = result.value.tests[0];
    expect(test.llmEnhanced).toBe(false);
    expect(test).toMatchObject({ generationMode: 'behavior-examples', assertions: 1 });
    expect(test.testCode).toContain(`import * as subject from ${JSON.stringify(sourceFile)};`);
    expect(test.testCode).toContain('expect(await subject["add"](JSON.parse("2"), JSON.parse("3"))).toStrictEqual(JSON.parse("5"));');
  });
});
