/** #780: JSON-RPC -> task_orchestrate -> service -> enhanced adapter -> SQLite/HNSW.
 * Only the external embedding provider and task execution sink are controlled.
 * Orthogonal fixture vectors make similarity assertions exact and offline.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PassThrough } from 'node:stream';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('../../../src/learning/real-embeddings.js', async importOriginal => {
  const original = await importOriginal<typeof import('../../../src/learning/real-embeddings.js')>();
  return {
    ...original,
    computeRealEmbedding: vi.fn(async (text: string) => {
      const vector = Array(384).fill(0);
      vector[text.includes('lexicalonly') ? 1 : text.includes('sentinel') ? 0 : 2] = 1;
      return vector;
    }),
    getEmbeddingDimension: () => 384,
    getActiveEmbeddingSpaceIdentity: () => ({ spaceId: 'mcp-fixture-space' }),
    getEmbeddingStats: () => ({ dimension: 384, cacheSize: 0, initialized: true }),
  };
});

import { createMCPProtocolServer, type MCPProtocolServer } from '../../../src/mcp/protocol-server.js';
import { StdioTransport, type JSONRPCResponse } from '../../../src/mcp/transport/stdio.js';
import { ReasoningBankService } from '../../../src/mcp/services/reasoning-bank-service.js';
import { getFleetState } from '../../../src/mcp/handlers/core-handlers.js';
import { SQLitePatternStore } from '../../../src/learning/sqlite-persistence.js';
import { getUnifiedMemory, resetUnifiedMemory } from '../../../src/kernel/unified-memory.js';

describe('task_orchestrate measured pattern evidence over JSON-RPC', () => {
  let root: string;
  let server: MCPProtocolServer;
  let transport: StdioTransport;
  let service: ReasoningBankService;
  const input = new PassThrough();
  const output = new PassThrough();
  let nextId = 0;
  let pending = '';
  const responses = new Map<number, (response: JSONRPCResponse) => void>();
  let vectorId: string;
  let lexicalId: string;

  async function callTool(name: string, args: Record<string, unknown>) {
    const id = ++nextId;
    const response = new Promise<JSONRPCResponse>(resolve => responses.set(id, resolve));
    input.write(JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } }) + '\n');
    const message = await response;
    expect(message.error).toBeUndefined();
    const result = message.result as { content: Array<{ text: string }>; isError?: boolean };
    expect(result.isError).not.toBe(true);
    return JSON.parse(result.content[0].text);
  }

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'aqe-mcp-pattern-evidence-'));
    vi.stubEnv('AQE_PROJECT_ROOT', root);
    vi.stubEnv('AQE_MEMORY_BACKEND', 'memory');
    vi.stubEnv('AQE_LOOP_DETECTION_ENABLED', 'false');
    vi.stubEnv('AQE_SESSION_CACHE', 'off');
    vi.stubEnv('AQE_LLM_ROUTER_DISABLED', 'true');
    resetUnifiedMemory();
    server = createMCPProtocolServer();
    transport = new StdioTransport({ inputStream: input, outputStream: output });
    transport.onRequest(request => server['handleRequest'](request));
    output.on('data', chunk => {
      pending += chunk.toString();
      let end: number;
      while ((end = pending.indexOf('\n')) >= 0) {
        const response = JSON.parse(pending.slice(0, end)) as JSONRPCResponse;
        pending = pending.slice(end + 1);
        responses.get(Number(response.id))?.(response);
        responses.delete(Number(response.id));
      }
    });
    transport.start();
    expect((await callTool('fleet_init', { memoryBackend: 'memory', maxAgents: 2 })).success).toBe(true);
    service = await ReasoningBankService.getInstance({ enableTrajectories: false, enableExperienceReplay: false });
    const adapter = service['enhancedAdapter'];
    const store = async (name: string) => {
      const result = await adapter.storePattern({
        patternType: 'test-template', name, description: name,
        template: { type: 'code', content: 'expect(actual).toEqual(expected)', variables: [] },
        context: { tags: ['test-generation'] },
      });
      expect(result.success).toBe(true);
      if (!result.success) throw result.error;
      return result.value;
    };
    const vector = await store('regression sentinel');
    vectorId = vector.id;
    lexicalId = 'alien-space-lexical-fixture';
    // Simulate a persisted pattern from another embedding provider: it is
    // searchable by text but never enters this active provider's vector index.
    const persisted = new SQLitePatternStore();
    await persisted.initialize();
    persisted.storePattern({ ...vector, id: lexicalId,
      name: 'lexicalonly regression sentinel', description: 'lexicalonly regression sentinel',
    }, Array.from({ length: 384 }, (_, i) => i === 1 ? 1 : 0), 'alien-fixture-space');
    persisted.close();
    // Quality and tier are deliberately strong for lexical, weak for vector:
    // neither quality nor tier may be substituted for measured similarity.
    const db = getUnifiedMemory().getDatabase();
    db.prepare("UPDATE qe_patterns SET tier='long-term', confidence=0.99, quality_score=0.99 WHERE id=?").run(lexicalId);
    db.prepare('UPDATE qe_patterns SET quality_score=0.17 WHERE id=?').run(vectorId);
  }, 60000);

  afterAll(async () => {
    transport?.stop();
    await service?.dispose();
    ReasoningBankService.reset();
    await server?.stop();
    resetUnifiedMemory();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    input.destroy();
    output.destroy();
    if (root) rmSync(root, { recursive: true, force: true });
  });

  function assertEvidence(payload: Record<string, unknown>) {
    const hints = payload.patternHints as Array<Record<string, unknown>>;
    expect(hints).toEqual(expect.arrayContaining([
      expect.objectContaining({ patternId: vectorId, similarity: 1, matchType: 'vector' }),
      expect.objectContaining({ patternId: lexicalId, similarity: 0, matchType: 'lexical', canReuse: false }),
    ]));
    expect(hints.find(hint => hint.patternId === lexicalId)?.score).toBeGreaterThan(0);
  }

  it('does not let lexical relevance satisfy a vector-only safety threshold', async () => {
    const result = await service['enhancedAdapter'].searchPatterns('regression sentinel', { minSimilarity: 0.85 });
    expect(result.success).toBe(true);
    if (!result.success) throw result.error;
    expect(result.value.map(match => match.pattern.id)).toContain(vectorId);
    expect(result.value.map(match => match.pattern.id)).not.toContain(lexicalId);
  });

  it('forwards compatible vector evidence and lexical-only hints to the task queue without upgrading reuse', async () => {
    const queen = getFleetState().queen!;
    const submit = vi.spyOn(queen, 'submitTask').mockResolvedValue({ success: true, value: 'fixture-task' });
    const result = await callTool('task_orchestrate', { task: 'regression sentinel', context: { project: 'test-generation' } });
    expect(result.success).toBe(true);
    expect(submit).toHaveBeenCalledOnce();
    assertEvidence(submit.mock.calls[0][0].payload);
    submit.mockRestore();
  }, 30000);

  it('preserves the same evidence on the workflow branch', async () => {
    const workflow = getFleetState().workflowOrchestrator!;
    expect(workflow).toBeDefined();
    const execute = vi.spyOn(workflow, 'executeWorkflow').mockResolvedValue({ success: true, value: 'fixture-workflow' });
    const result = await callTool('task_orchestrate', { task: 'ideation regression sentinel', context: { project: 'test-generation' } });
    expect(result.success).toBe(true);
    expect(execute).toHaveBeenCalledOnce();
    assertEvidence(execute.mock.calls[0][1]);
    execute.mockRestore();
  }, 30000);
});
