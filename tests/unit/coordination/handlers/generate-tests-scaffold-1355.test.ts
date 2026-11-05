/**
 * #1355: the generate-tests handler (behind test_generate_enhanced) applies the
 * same test-quality-gate verdict as `aqe test generate`. A test.skip scaffold
 * is not a generated test: it is returned under `scaffolds`, the count is 0,
 * and `warning` says nothing was testable.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

import { createTaskExecutor, type DomainTaskExecutor } from '../../../../src/coordination/task-executor';
import type { QueenTask } from '../../../../src/coordination/queen-coordinator';
import '../../../../src/domains/test-generation';

function createKernel(llmRouter?: unknown) {
  const store = new Map<string, unknown>();
  const memory = {
    initialize: vi.fn(async () => {}), dispose: vi.fn(async () => {}),
    store: vi.fn(async (k: string, v: unknown) => { store.set(k, v); }),
    set: vi.fn(async (k: string, v: unknown) => { store.set(k, v); }),
    retrieve: vi.fn(async (k: string) => store.get(k) ?? null),
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    delete: vi.fn(async (k: string) => { store.delete(k); }),
    list: vi.fn(async () => [...store.keys()]),
    search: vi.fn(async () => []), vectorSearch: vi.fn(async () => []), query: vi.fn(async () => []),
  };
  return {
    llmRouter, memory,
    eventBus: {
      publish: vi.fn(async () => {}),
      subscribe: vi.fn(() => ({ unsubscribe: () => {}, active: true })),
      subscribeToChannel: vi.fn(() => ({ unsubscribe: () => {}, active: true })),
      getHistory: vi.fn(async () => []), dispose: vi.fn(async () => {}),
    },
    agentCoordinator: { spawn: vi.fn(), list: vi.fn(async () => []), dispose: vi.fn(async () => {}) },
    initialize: vi.fn(async () => {}), dispose: vi.fn(async () => {}),
  };
}

const task = (payload: Record<string, unknown>): QueenTask => ({
  id: `task_${uuidv4()}`, type: 'generate-tests', priority: 'p1', targetDomains: [],
  payload: { language: 'typescript', framework: 'vitest', testType: 'unit', coverageGoal: 80, ...payload },
  timeout: 30000, createdAt: new Date(),
}) as QueenTask;

type GenData = {
  testsGenerated: number;
  tests: Array<{ testCode?: string }>;
  scaffolds?: Array<{ scaffold: boolean; testCode?: string; rejectedBecause: string; sourceFile?: string }>;
  warning?: string;
  coverageEstimate: number | null;
};

const MATH = `export function add(a: number, b: number): number {
  return a + b;
}
export function isPositive(n: number): boolean {
  if (n > 0) return true;
  return false;
}
`;
const TYPES_ONLY = `export interface Point { x: number; y: number }
export type Id = string;
`;

describe('#1355 generate-tests reports scaffolding as nothing testable', () => {
  let tmpDir: string;
  let executor: DomainTaskExecutor;
  const run = async (payload: Record<string, unknown>, router?: unknown) => {
    executor = createTaskExecutor(createKernel(router) as never, { saveResults: false, resultsDir: tmpDir });
    const result = await executor.execute(task(payload));
    expect(result.success).toBe(true);
    return result.data as GenData;
  };

  beforeEach(async () => {
    tmpDir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'aqe-1355-')));
    vi.stubEnv('AQE_PROJECT_ROOT', tmpDir);
    vi.stubEnv('AQE_LLM_ROUTER_DISABLED', '1');
    await fs.writeFile(path.join(tmpDir, 'math.ts'), MATH);
    await fs.writeFile(path.join(tmpDir, 'types-only.ts'), TYPES_ONLY);
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    const { resetSharedLLMRouter } = await import('../../../../src/mcp/tools/base');
    resetSharedLLMRouter();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it.each(['types-only.ts', 'math.ts'])('reports 0 tests for the test.skip scaffold of %s', async (file) => {
    const filePath = path.join(tmpDir, file);
    const data = await run({ filePath });

    expect(data.testsGenerated).toBe(0);
    expect(data.tests).toEqual([]);
    expect(data.coverageEstimate).toBeNull();
    expect(data.scaffolds).toHaveLength(1);
    expect(data.scaffolds![0]).toMatchObject({ scaffold: true, sourceFile: filePath });
    expect(data.scaffolds![0].testCode).toContain('test.skip(');
    expect(data.scaffolds![0].rejectedBecause).toMatch(/no executable assertions/i);
    expect(data.warning).toMatch(new RegExp(`^Nothing testable in ${filePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: `));
  });

  it('names sourceCode, not the temp file, when the scaffold came from sourceCode', async () => {
    const data = await run({ sourceCode: TYPES_ONLY });

    expect(data.testsGenerated).toBe(0);
    expect(data.warning).toMatch(/^Nothing testable in the supplied sourceCode: /);
    expect(data.scaffolds![0].sourceFile).toBeUndefined();
  });

  it('counts a test that passes the quality gate', async () => {
    const data = await run({
      filePath: path.join(tmpDir, 'math.ts'),
      behaviorExamples: [{ functionName: 'add', args: [2, 3], expected: 5 }],
    });

    expect(data.testsGenerated).toBe(1);
    expect(data.tests[0].testCode).toMatch(/expect\(/);
    expect(data.scaffolds).toBeUndefined();
    expect(data.warning).toBeUndefined();
  });
});
