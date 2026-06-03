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
