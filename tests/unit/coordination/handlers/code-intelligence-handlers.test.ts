/**
 * Regression tests for the `index-code` task handler (MCP path).
 *
 * #511 MCP parity: the handler computes node/edge counts via the real
 * KnowledgeGraphService but must expose them to the MCP result mapper under the
 * field names it reads — `symbolsExtracted` / `relationsFound`. Previously the
 * handler only emitted `nodesCreated`/`edgesCreated`, so `code_index` always
 * reported 0 symbols / 0 relations regardless of what was indexed.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import fs from 'fs/promises';
import { ok } from '../../../../src/shared/types';
import { registerCodeIntelligenceHandlers } from '../../../../src/coordination/handlers/code-intelligence-handlers';
import type { TaskHandlerContext, InstanceTaskHandler } from '../../../../src/coordination/handlers/handler-types';
import type { QueenTask } from '../../../../src/coordination/queen-types';

describe('index-code handler (#511 MCP parity)', () => {
  let tmpDir: string;

  beforeEach(async () => {
    // discoverSourceFiles reads the real FS; keep the fixture under the repo.
    tmpDir = await fs.mkdtemp(path.join(__dirname, 'tmp-idx-'));
    await fs.writeFile(path.join(tmpDir, 'app.ts'), 'export const x = 1;\n');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should map KG node/edge counts to symbolsExtracted/relationsFound', async () => {
    // Arrange: capture the registered handler and stub the KG with known counts
    let handler: InstanceTaskHandler | undefined;
    const stubKnowledgeGraph = {
      index: vi.fn().mockResolvedValue(
        ok({ filesIndexed: 1, nodesCreated: 7, edgesCreated: 3, duration: 0, errors: [] })
      ),
    };
    const ctx = {
      registerHandler: (type: string, h: InstanceTaskHandler) => {
        if (type === 'index-code') handler = h;
      },
      getKnowledgeGraph: () => stubKnowledgeGraph,
    } as unknown as TaskHandlerContext;

    registerCodeIntelligenceHandlers(ctx);
    expect(handler).toBeDefined();

    // Act
    const result = await handler!({
      payload: { target: tmpDir, incremental: false },
    } as unknown as QueenTask);

    // Assert: the MCP-facing fields carry the real counts (was 0 before the fix)
    expect(result.success).toBe(true);
    const data = (result as { value: Record<string, unknown> }).value;
    expect(data.symbolsExtracted).toBe(7);
    expect(data.relationsFound).toBe(3);
  });
});

describe('index-code handler collects project metrics (#999 MCP-CLI parity)', () => {
  let tmpDir: string;
  const metrics = {
    loc: { total: 3, byLanguage: { TypeScript: 3 }, source: 'node-native', excludedDirs: [] },
    tests: { total: 1, byType: { unit: 1, integration: 0, e2e: 0 }, source: 'vitest' },
    toolsUsed: ['node-native', 'vitest'],
  };

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(__dirname, 'tmp-idx999-'));
    await fs.writeFile(path.join(tmpDir, 'package.json'), '{"name":"p"}\n');
    await fs.mkdir(path.join(tmpDir, 'src'));
    await fs.writeFile(path.join(tmpDir, 'src', 'app.ts'), 'export const x = 1;\n');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  function setup(coordinator: unknown) {
    let handler: InstanceTaskHandler | undefined;
    const ctx = {
      registerHandler: (type: string, h: InstanceTaskHandler) => {
        if (type === 'index-code') handler = h;
      },
      getKnowledgeGraph: () => ({
        index: vi.fn().mockResolvedValue(ok({ filesIndexed: 1, nodesCreated: 2, edgesCreated: 1, duration: 0, errors: [] })),
      }),
      getCodeIntelligenceCoordinator: vi.fn(async () => coordinator),
    } as unknown as TaskHandlerContext;
    registerCodeIntelligenceHandlers(ctx);
    return handler!;
  }

  it('runs the coordinator metric step rooted at the target, like the CLI', async () => {
    const collectProjectMetrics = vi.fn().mockResolvedValue(ok(metrics));
    const handler = setup({ collectProjectMetrics });

    const result = await handler({ payload: { target: path.join(tmpDir, 'src'), incremental: false } } as unknown as QueenTask);

    expect(result.success).toBe(true);
    // target src/ has no marker → nearest marker up (#997 resolver), never a filesystem root
    expect(collectProjectMetrics).toHaveBeenCalledWith(tmpDir);
    const data = (result as { value: Record<string, unknown> }).value;
    expect(data.projectMetrics).toEqual({
      root: tmpDir,
      loc: 3,
      locByLanguage: { TypeScript: 3 },
      tests: 1,
      toolsUsed: ['node-native', 'vitest'],
    });
  });

  it('a relative target resolves against the working directory', async () => {
    const collectProjectMetrics = vi.fn().mockResolvedValue(ok(metrics));
    const handler = setup({ collectProjectMetrics });
    const cwd = process.cwd();
    try {
      process.chdir(tmpDir);
      await handler({ payload: { target: '.', incremental: false } } as unknown as QueenTask);
    } finally {
      process.chdir(cwd);
    }
    expect(collectProjectMetrics).toHaveBeenCalledWith(await fs.realpath(tmpDir));
  });

  it('indexing still succeeds when metric collection fails or the domain is unavailable', async () => {
    const failing = setup({ collectProjectMetrics: vi.fn().mockRejectedValue(new Error('cloc crashed')) });
    const r1 = await failing({ payload: { target: tmpDir, incremental: false } } as unknown as QueenTask);
    expect(r1.success).toBe(true);
    expect((r1 as { value: Record<string, unknown> }).value.projectMetrics).toBeUndefined();

    const noDomain = setup(undefined);
    const r2 = await noDomain({ payload: { target: tmpDir, incremental: false } } as unknown as QueenTask);
    expect(r2.success).toBe(true);
    expect((r2 as { value: Record<string, unknown> }).value.filesIndexed).toBe(1);
  });
});
