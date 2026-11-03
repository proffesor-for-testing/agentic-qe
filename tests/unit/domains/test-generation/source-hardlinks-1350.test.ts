/**
 * #1350: a source file named by an MCP or task caller for test generation
 * (`test_generate_enhanced` / task `generate-tests`, `sourceFiles` or
 * `filePath`) refuses a hardlink, because no path check can tell where a
 * hardlink's other names are. The CLI, which reads the operator's own tree,
 * keeps reading hardlinked files. Real hardlinks in a temporary project.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { registerTestExecutionHandlers } from '../../../../src/coordination/handlers/test-execution-handlers';
import { createTestGeneratorService } from '../../../../src/domains/test-generation/services/test-generator';
import { PatternMatcherService } from '../../../../src/domains/test-generation/services/pattern-matcher';
import { TestGenerationPlugin } from '../../../../src/domains/test-generation/plugin';
import type { MemoryBackend } from '../../../../src/kernel/interfaces';
import { MockAgentCoordinator, MockEventBus, MockMemoryBackend } from '../plugin-test-utils';

const SECRET_SOURCE = [
  "export const OUTSIDE_SECRET_1350 = 'top-secret';",
  'export function leakOutside1350(a: number): number { return a + 1; }',
  '',
].join('\n');

const memory = (): MemoryBackend => ({
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue(undefined),
  delete: vi.fn().mockResolvedValue(true),
  search: vi.fn().mockResolvedValue([]),
  vectorSearch: vi.fn().mockResolvedValue([]),
  storeVector: vi.fn().mockResolvedValue(undefined),
  clear: vi.fn().mockResolvedValue(undefined),
  keys: vi.fn().mockResolvedValue([]),
  has: vi.fn().mockResolvedValue(false),
  size: vi.fn().mockResolvedValue(0),
}) as unknown as MemoryBackend;

describe('test generation refuses hardlinked caller-named source files (#1350)', () => {
  let base: string;
  let root: string;
  let hard: string;
  let plain: string;

  beforeEach(() => {
    base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-1350-gen-')));
    root = path.join(base, 'proj');
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.mkdirSync(path.join(base, 'outside'));
    fs.writeFileSync(path.join(base, 'outside', 'secret.ts'), SECRET_SOURCE);
    hard = path.join(root, 'src', 'hard.ts');
    fs.linkSync(path.join(base, 'outside', 'secret.ts'), hard);
    plain = path.join(root, 'src', 'plain.ts');
    fs.writeFileSync(plain, 'export function addInside(a: number, b: number): number { return a + b; }\n');
    vi.stubEnv('AQE_PROJECT_ROOT', root);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(base, { recursive: true, force: true });
  });

  const generateTestsHandler = () => {
    const handlers = new Map<string, (task: unknown) => Promise<{ success: boolean; value?: unknown; error?: Error }>>();
    registerTestExecutionHandlers({
      registerHandler: (type: string, fn: never) => { handlers.set(type, fn); },
      getTestGenerator: async () => createTestGeneratorService(memory()),
    } as never);
    return (payload: Record<string, unknown>) =>
      handlers.get('generate-tests')!({ payload: { language: 'typescript', framework: 'vitest', testType: 'unit', ...payload } });
  };

  it('generate-tests refuses a hardlinked filePath and sourceFiles entry, and still reads a plain one', async () => {
    const run = generateTestsHandler();

    for (const payload of [{ filePath: hard }, { sourceFiles: [plain, hard] }]) {
      const refused = await run(payload);
      expect(refused.success).toBe(false);
      expect(refused.error?.message).toContain('hardlinked');
      expect(JSON.stringify(refused)).not.toMatch(/OUTSIDE_SECRET_1350|leakOutside1350/);
    }

    const read = await run({ filePath: plain });
    expect(read.success, read.error?.message).toBe(true);
    expect(JSON.stringify(read.value)).toContain('plain');
  });

  it('the generator reads a hardlinked file unless the request refuses hardlinks (CLI keeps reading)', async () => {
    const service = createTestGeneratorService(memory());
    const request = { sourceFiles: [hard], testType: 'unit' as const, framework: 'vitest' as const };

    const refused = await service.generateTests({ ...request, sourceHardlinks: 'refuse' });
    expect(refused.success).toBe(false);
    if (!refused.success) expect(refused.error.message).toContain('hardlinked');

    // `aqe test generate` passes no sourceHardlinks: the operator's own file is read.
    const read = await service.generateTests(request);
    expect(read.success).toBe(true);
    if (read.success) expect(read.value.tests).toHaveLength(1);
  });

  it('the domain plugin generate-tests task asks the coordinator to refuse hardlinks', async () => {
    const plugin = new TestGenerationPlugin(new MockEventBus(), new MockMemoryBackend(), new MockAgentCoordinator());
    const generateTests = vi.fn(async () => ({ success: true, value: { tests: [], coverageEstimate: null, patternsUsed: [] } }));
    (plugin as unknown as { coordinator: unknown }).coordinator = { generateTests };
    const handler = (plugin as unknown as { getTaskHandlers(): Map<string, (p: unknown) => Promise<unknown>> })
      .getTaskHandlers().get('generate-tests')!;

    await handler({ sourceFiles: [plain], testType: 'unit', framework: 'vitest' });

    expect(generateTests).toHaveBeenCalledWith(expect.objectContaining({ sourceHardlinks: 'refuse' }));
  });

  it('PatternMatcherService.matchTestablePatterns refuses a hardlinked file and still reads a plain one', async () => {
    const matcher = new PatternMatcherService(memory(), { embedder: { embed: async () => [] } as never });

    const refused = await matcher.matchTestablePatterns(hard);
    expect(refused.success).toBe(false);
    if (!refused.success) expect(refused.error.message).toContain('hardlinked');

    const read = await matcher.matchTestablePatterns(plain);
    expect(read.success).toBe(true);
  });
});
