import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMemoryBackend } from '../../../src/kernel/memory-factory';
import type { MemoryBackend } from '../../../src/kernel/interfaces';
import { resetUnifiedMemory } from '../../../src/kernel/unified-memory';
import { TransferSpecialistService } from '../../../src/domains/learning-optimization/services/transfer-specialist';
import { LearningOptimizeTool } from '../../../src/mcp/tools/learning-optimization/optimize';
import type { Knowledge } from '../../../src/domains/learning-optimization/interfaces';

const NS = { namespace: 'learning-optimization' };
const agent = { value: 'synthetic-knowledge-reader', domain: 'test-generation' as const, type: 'specialist' as const };

describe.each(['sqlite', 'memory'] as const)('knowledge retrieval across the %s namespace boundary', (backendType) => {
  let dir: string;
  let memory: MemoryBackend;
  let service: TransferSpecialistService;

  beforeEach(async () => {
    resetUnifiedMemory();
    dir = mkdtempSync(join(tmpdir(), 'aqe-knowledge-reader-'));
    ({ backend: memory } = await createMemoryBackend(
      { type: backendType, sqlite: { path: join(dir, 'memory.db'), walMode: true } }, true,
    ));
    service = new TransferSpecialistService(memory);
  });

  afterEach(async () => {
    await memory.dispose();
    resetUnifiedMemory();
    rmSync(dir, { recursive: true, force: true });
  });

  async function create(domain: Knowledge['domain'] = 'test-generation'): Promise<Knowledge> {
    const result = await service.createKnowledge('fact', domain, { synthetic: true }, agent);
    if (!result.success) throw result.error;
    return result.value;
  }

  it('reads a created item by ID and rehydrates its dates without a default-namespace decoy', async () => {
    const item = await create();
    await memory.set(`learning:knowledge:shared:${item.id}`, { ...item, relevanceScore: 0 });
    const result = await service.getKnowledgeById(item.id);
    expect(result?.relevanceScore).toBe(1);
    expect(result?.createdAt).toBeInstanceOf(Date);
    expect(result?.createdAt.getTime()).toBe(item.createdAt.getTime());
  });

  it('queries canonical knowledge rather than string-valued domain indexes', async () => {
    const expected = await create();
    await create('test-execution');
    expect(await memory.get(`learning:knowledge:domain:test-generation:${expected.id}`, NS)).toBe(expected.id);
    const result = await service.queryKnowledge({ domain: 'test-generation', tags: [], limit: 10 });
    expect(result.success).toBe(true);
    if (result.success) expect(result.value.map(item => item.id)).toEqual([expected.id]);
  });

  it('finds shared knowledge that has no secondary index', async () => {
    const item = { ...(await create('test-execution')), id: 'synthetic-shared-only' };
    expect((await service.shareKnowledge(item, [])).success).toBe(true);
    expect(await memory.get(`learning:knowledge:domain:test-execution:${item.id}`, NS)).toBeUndefined();
    const result = await service.queryKnowledge({ domain: 'test-execution' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.value.map(value => value.id)).toContain(item.id);
  });

  it('filters and ranks canonical records before applying the requested result limit', async () => {
    const low = await create();
    await memory.set(`learning:knowledge:shared:${low.id}`, { ...low, relevanceScore: 0.2 }, NS);
    const high = await create();
    const result = await service.queryKnowledge({ domain: 'test-generation', minRelevance: 0.5, limit: 1 });
    expect(result.success).toBe(true);
    if (result.success) expect(result.value.map(item => item.id)).toEqual([high.id]);
  });

  it('transfers actual source knowledge through the MCP tool', async () => {
    await create();
    const result = await new LearningOptimizeTool().invoke({
      action: 'transfer', domain: 'test-generation', targetDomain: 'test-execution',
    }, { memory });
    expect(result.success).toBe(true);
    expect(result.data?.transferResult).toMatchObject({
      sourcePatterns: 1, transferredPatterns: 1, targetDomainUpdated: true,
    });
    const target = await service.queryKnowledge({ domain: 'test-execution' });
    expect(target.success && target.value.length).toBe(1);
  });

  it('can synthesize knowledge created by this same service', async () => {
    const first = await create();
    const second = await create();
    const result = await service.synthesizeKnowledge([first.id, second.id]);
    expect(result.success).toBe(true);
    if (result.success) expect(await service.getKnowledgeById(result.value.id)).not.toBeNull();
  });
});
