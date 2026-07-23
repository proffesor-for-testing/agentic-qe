/**
 * Regression tests for issue #567 — `test_generate_enhanced` never invoked LLM
 * enhancement because the DI factory behind the task-executor path was
 * registered as `(memory) => createTestGeneratorService(memory)`, dropping
 * `llmRouter` on the floor. `isLLMEnhancementAvailable()` was therefore
 * permanently false and the ADR-051 branch unreachable, no matter how the user
 * configured their provider.
 *
 * These tests drive the *actual* task-executor path the flat MCP tool uses
 * (`generate-tests` handler -> ctx.getTestGenerator() -> DomainServiceRegistry),
 * with a fake router standing in for a configured provider. They fail against
 * the pre-fix wiring.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

import { createTaskExecutor, type DomainTaskExecutor } from '../../../../src/coordination/task-executor';
import type { QueenTask } from '../../../../src/coordination/queen-coordinator';
import { DomainServiceRegistry, ServiceKeys } from '../../../../src/shared/domain-service-registry';

// Side-effect import: triggers the domain's DomainServiceRegistry.register().
import '../../../../src/domains/test-generation';

// ---------------------------------------------------------------------------
// Minimal fakes
// ---------------------------------------------------------------------------

function createMemory() {
  const store = new Map<string, unknown>();
  return {
    initialize: vi.fn(async () => {}),
    dispose: vi.fn(async () => {}),
    store: vi.fn(async (k: string, v: unknown) => { store.set(k, v); }),
    set: vi.fn(async (k: string, v: unknown) => { store.set(k, v); }),
    retrieve: vi.fn(async (k: string) => store.get(k) ?? null),
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    delete: vi.fn(async (k: string) => { store.delete(k); }),
    list: vi.fn(async () => [...store.keys()]),
    search: vi.fn(async () => []),
    vectorSearch: vi.fn(async () => []),
    query: vi.fn(async () => []),
  };
}

/**
 * Stands in for a configured provider. Returns a source-aware test body so we
 * can assert the emitted code came from the LLM branch and not the template.
 */
function createFakeRouter() {
  const chat = vi.fn(async () => ({
    content:
      "import { describe, it, expect } from 'vitest';\n" +
      "import { add, divide } from './calculator';\n\n" +
      "describe('calculator', () => {\n" +
      "  it('adds two numbers', () => { expect(add(1, 2)).toBe(3); });\n" +
      "  it('throws on division by zero', () => {\n" +
      "    expect(() => divide(1, 0)).toThrow('division by zero');\n" +
      "  });\n" +
      "});\n",
    model: 'fake-model',
    provider: 'fake',
    usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
  }));
  return { chat };
}

function createKernel(llmRouter?: unknown) {
  const memory = createMemory();
  return {
    llmRouter,
    memory,
    eventBus: {
      publish: vi.fn(async () => {}),
      subscribe: vi.fn(() => ({ unsubscribe: () => {}, active: true })),
      subscribeToChannel: vi.fn(() => ({ unsubscribe: () => {}, active: true })),
      getHistory: vi.fn(async () => []),
      dispose: vi.fn(async () => {}),
    },
    agentCoordinator: {
      spawn: vi.fn(), list: vi.fn(async () => []), dispose: vi.fn(async () => {}),
    },
    initialize: vi.fn(async () => {}),
    dispose: vi.fn(async () => {}),
  };
}

function task(payload: Record<string, unknown>): QueenTask {
  return {
    id: `task_${uuidv4()}`,
    type: 'generate-tests',
    priority: 'p1',
    targetDomains: [],
    payload,
    timeout: 30000,
    createdAt: new Date(),
  } as QueenTask;
}

// The exact fixture from the issue report.
const CALCULATOR_SOURCE = `export function add(a: number, b: number): number { return a + b; }
export function divide(a: number, b: number): number {
  if (b === 0) throw new Error('division by zero');
  return a / b;
}
`;

describe('#567 — LLM router reaches the task-executor test-generation path', () => {
  let tmpDir: string;
  let sourceFile: string;
  let executor: DomainTaskExecutor | undefined;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aqe-567-'));
    sourceFile = path.join(tmpDir, 'calculator.ts');
    await fs.writeFile(sourceFile, CALCULATOR_SOURCE, 'utf-8');
  });

  afterEach(async () => {
    executor = undefined;
    vi.unstubAllEnvs();
    const { resetSharedLLMRouter } = await import('../../../../src/mcp/tools/base');
    resetSharedLLMRouter();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('DI factory contract', () => {
    it('accepts and applies an llmRouter as its second argument', async () => {
      const factory = DomainServiceRegistry.resolve<
        (m: unknown, r?: unknown) => { generateTests: (req: unknown) => Promise<unknown> }
      >(ServiceKeys.createTestGeneratorService);

      // The pre-fix registration was `(memory) => ...` — arity 1. The router
      // must be a real parameter, not silently discarded.
      expect(factory.length).toBeGreaterThanOrEqual(2);

      const router = createFakeRouter();
      const service = factory(createMemory(), router) as {
        generateTests: (req: unknown) => Promise<{ success: boolean; value: { tests: Array<{ llmEnhanced?: boolean }> } }>;
      };

      const result = await service.generateTests({
        sourceFiles: [sourceFile],
        testType: 'unit',
        framework: 'vitest',
        coverageTarget: 80,
        patterns: [],
      });

      expect(result.success).toBe(true);
      expect(router.chat).toHaveBeenCalled();
      expect(result.value.tests[0].llmEnhanced).toBe(true);
    });

    it('still builds a working service when no router is supplied', async () => {
      const factory = DomainServiceRegistry.resolve<
        (m: unknown, r?: unknown) => unknown
      >(ServiceKeys.createTestGeneratorService);

      const service = factory(createMemory()) as {
        generateTests: (req: unknown) => Promise<{ success: boolean; value: { tests: Array<{ llmEnhanced?: boolean }> } }>;
      };

      const result = await service.generateTests({
        sourceFiles: [sourceFile],
        testType: 'unit',
        framework: 'vitest',
        coverageTarget: 80,
        patterns: [],
      });

      expect(result.success).toBe(true);
      expect(result.value.tests[0].llmEnhanced).toBe(false);
    });
  });

  describe('generate-tests handler (the path test_generate_enhanced executes)', () => {
    it('routes generation through the LLM when the kernel has a router', async () => {
      const router = createFakeRouter();
      executor = createTaskExecutor(createKernel(router) as never, {
        saveResults: false,
        resultsDir: tmpDir,
        defaultLanguage: 'typescript',
        defaultFramework: 'vitest',
      });

      const result = await executor.execute(
        task({ filePath: sourceFile, language: 'typescript', framework: 'vitest', testType: 'unit', coverageGoal: 80 })
      );

      expect(result.success).toBe(true);
      // The whole point of the issue: the router must actually be called.
      expect(router.chat).toHaveBeenCalled();

      const data = result.data as { llmEnhanced?: boolean; tests: Array<{ testCode: string }> };
      expect(data.llmEnhanced).toBe(true);
      // And the emitted code must reflect the real signatures, not the generic
      // "should be defined / should handle basic operations" scaffold.
      expect(data.tests[0].testCode).toContain('divide');
    });

    it('reports generationMode + a diagnosable note when no router is available', async () => {
      // Force the "no router" condition deterministically. Without this the
      // result depends on ambient state — a provider key in the developer's
      // env, or another test having installed the shared MCP router singleton.
      vi.stubEnv('AQE_LLM_ROUTER_DISABLED', '1');
      const { resetSharedLLMRouter } = await import('../../../../src/mcp/tools/base');
      resetSharedLLMRouter();

      executor = createTaskExecutor(createKernel(undefined) as never, {
        saveResults: false,
        resultsDir: tmpDir,
        defaultLanguage: 'typescript',
        defaultFramework: 'vitest',
      });

      const result = await executor.execute(
        task({ filePath: sourceFile, language: 'typescript', framework: 'vitest', testType: 'unit', coverageGoal: 80 })
      );

      expect(result.success).toBe(true);
      const data = result.data as { llmEnhanced?: boolean; generationMode?: string; note?: string };
      // Degrading is fine. Degrading *silently* is the bug.
      expect(data.llmEnhanced).toBe(false);
      expect(data.generationMode).toBe('deterministic-template');
      expect(data.note).toMatch(/llm-config\.json|provider/i);
    });

    it('honors aiEnhancement:false by never calling the router', async () => {
      const router = createFakeRouter();
      executor = createTaskExecutor(createKernel(router) as never, {
        saveResults: false,
        resultsDir: tmpDir,
        defaultLanguage: 'typescript',
        defaultFramework: 'vitest',
      });

      const result = await executor.execute(
        task({
          filePath: sourceFile, language: 'typescript', framework: 'vitest',
          testType: 'unit', coverageGoal: 80, aiEnhancement: false,
        })
      );

      expect(result.success).toBe(true);
      expect(router.chat).not.toHaveBeenCalled();
      const data = result.data as { llmEnhanced?: boolean; note?: string };
      expect(data.llmEnhanced).toBe(false);
      expect(data.note).toMatch(/disabled by the caller/i);
    });
  });
});

describe('#567 — llmEnhanced must reflect what the LLM actually produced', () => {
  let tmp: string;
  let sourceFile2: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'aqe-567b-'));
    sourceFile2 = path.join(tmp, 'calculator.ts');
    await fs.writeFile(sourceFile2, CALCULATOR_SOURCE, 'utf-8');
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  async function generateWith(router: unknown) {
    const executor = createTaskExecutor(createKernel(router) as never, {
      saveResults: false, resultsDir: tmp,
      defaultLanguage: 'typescript', defaultFramework: 'vitest',
    });
    const result = await executor.execute(
      task({ filePath: sourceFile2, language: 'typescript', framework: 'vitest', testType: 'unit', coverageGoal: 80 })
    );
    expect(result.success).toBe(true);
    return result.data as { llmEnhanced?: boolean; generationMode?: string; note?: string };
  }

  it('reports llmEnhanced:false when the provider throws', async () => {
    // Court charge (CONFIRMED): a configured-but-broken provider (401, timeout,
    // wrong model) fell back to the template while still reporting
    // llmEnhanced:true — the same silent-scaffolding failure as #567 itself,
    // one layer deeper.
    const router = { chat: vi.fn(async () => { throw new Error('401 Unauthorized'); }) };
    const data = await generateWith(router);

    expect(router.chat).toHaveBeenCalled();
    expect(data.llmEnhanced).toBe(false);
    expect(data.generationMode).toBe('deterministic-template');
  });

  it('reports llmEnhanced:false when the provider returns empty content', async () => {
    const router = { chat: vi.fn(async () => ({ content: '', model: 'm', provider: 'p' })) };
    const data = await generateWith(router);

    expect(router.chat).toHaveBeenCalled();
    expect(data.llmEnhanced).toBe(false);
  });
});
