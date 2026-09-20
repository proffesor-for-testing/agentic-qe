/** Guidance retrieval must not manufacture successful execution evidence. */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Database } from 'better-sqlite3';
import type { EnhancedReasoningBankAdapter } from '../../src/integrations/agentic-flow/reasoning-bank/index.js';

describe('Experience guidance outcome integrity', () => {
  let server: Server;
  let projectRoot: string;
  let endpoint: string;
  let adapter: EnhancedReasoningBankAdapter;
  let db: Database;
  let adapterModule: typeof import('../../src/integrations/agentic-flow/reasoning-bank/index.js');
  let memoryModule: typeof import('../../src/kernel/unified-memory.js');
  let embeddingsModule: typeof import('../../src/learning/real-embeddings.js');
  let hnswModule: typeof import('../../src/kernel/hnsw-adapter.js');
  let consolidationModule: typeof import('../../src/learning/experience-consolidation.js');
  const task = 'Generate boundary checks for a numeric range';
  const domain = 'test-generation' as const;

  beforeAll(async () => {
    projectRoot = mkdtempSync(join(tmpdir(), 'aqe-guidance-outcomes-'));
    vi.stubEnv('AQE_PROJECT_ROOT', projectRoot);
    vi.stubEnv('AQE_MEMORY_BACKEND', 'memory');
    vi.stubEnv('AQE_EMBEDDER_TOKEN', '');

    // The only external service is a deterministic loopback embedder. A single
    // experience per domain makes retrieval independent of semantic quality.
    server = createServer(async (request, response) => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const body = JSON.parse(Buffer.concat(chunks).toString()) as { input: string | string[] };
      const inputs = Array.isArray(body.input) ? body.input : [body.input];
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({
        data: inputs.map((_, index) => ({ index, embedding: [1, ...Array(383).fill(0)] })),
      }));
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    endpoint = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    vi.stubEnv('AQE_EMBEDDER_ENDPOINT', endpoint);

    // Set isolation before production imports establish singleton defaults.
    adapterModule = await import('../../src/integrations/agentic-flow/reasoning-bank/index.js');
    memoryModule = await import('../../src/kernel/unified-memory.js');
    embeddingsModule = await import('../../src/learning/real-embeddings.js');
    hnswModule = await import('../../src/kernel/hnsw-adapter.js');
    consolidationModule = await import('../../src/learning/experience-consolidation.js');
  });

  beforeEach(async () => {
    adapter = new adapterModule.EnhancedReasoningBankAdapter({
      enablePatternEvolution: false,
      autoConsolidate: false,
      base: { sqlite: { useUnified: true }, embeddings: { endpoint } },
      experienceReplay: { autoPrune: false, embedding: { endpoint } },
      trajectoryTracker: { autoEndTimeoutMs: 1000 },
    });
    await adapter.initialize();
    const memory = memoryModule.getUnifiedMemory();
    expect(memory.getDbPath()).toBe(':memory:');
    db = memory.getDatabase()!;
  });

  afterEach(async () => {
    await adapter?.dispose();
    embeddingsModule?.resetInitialization();
    memoryModule?.resetUnifiedMemory();
    hnswModule?.HnswAdapter.closeAll();
  });

  afterAll(async () => {
    server?.closeAllConnections();
    if (server) await new Promise<void>(resolve => server.close(() => resolve()));
    vi.unstubAllEnvs();
    if (projectRoot) rmSync(projectRoot, { recursive: true, force: true });
  });

  async function seedExperience(): Promise<string> {
    const trajectory = await adapter.startTaskTrajectory(task, { domain });
    await adapter.recordTaskStep(trajectory, 'Check both range boundaries', { outcome: 'success' }, { quality: 0.6 });
    await adapter.endTaskTrajectory(trajectory, true);
    return (db.prepare('SELECT id FROM captured_experiences WHERE domain = ?').get(domain) as { id: string }).id;
  }

  function applications() {
    return db.prepare('SELECT experience_id, success, tokens_saved FROM experience_applications ORDER BY rowid').all();
  }

  it('returns guidance repeatedly without recording applications or successful reuse', async () => {
    const id = await seedExperience();
    for (let i = 0; i < 4; i++) {
      const guidance = await adapter.getExperienceGuidance(task, domain);
      expect(guidance?.sourceExperiences).toEqual([expect.objectContaining({ id })]);
    }
    expect(applications()).toEqual([]);
    expect(db.prepare('SELECT application_count FROM captured_experiences WHERE id = ?').get(id)).toEqual({ application_count: 0 });
    expect((await adapter.getStats()).adapter.experiencesApplied).toBe(0);
  });

  it('includes routing guidance without recording a completed experience', async () => {
    const id = await seedExperience();
    const routed = await adapter.routeTaskWithExperience({ task, domain });
    expect(routed.success).toBe(true);
    if (!routed.success) throw routed.error;
    expect(routed.value.experienceGuidance?.sourceExperiences).toEqual([expect.objectContaining({ id })]);
    expect(routed.value.guidance.some(line => line.startsWith('Strategy:'))).toBe(true);
    expect(applications()).toEqual([]);
    expect((await adapter.getStats()).adapter).toMatchObject({ tasksRouted: 1, experiencesApplied: 0, tokensSavedEstimate: 0 });
  });

  it('does not turn failed execution after retrieval into positive reinforcement', async () => {
    const id = await seedExperience();
    await adapter.getExperienceGuidance(task, domain);
    const trajectory = await adapter.startTaskTrajectory(task, { domain });
    await adapter.recordTaskStep(trajectory, 'Run checks', { outcome: 'failure', error: 'Assertion failed' }, { quality: 0 });
    expect((await adapter.endTaskTrajectory(trajectory, false)).outcome).toBe('failure');
    await adapter.recordExperienceApplication(id, task, false);
    expect(applications()).toEqual([{ experience_id: id, success: 0, tokens_saved: 0 }]);
    const consolidator = new consolidationModule.ExperienceConsolidator();
    await consolidator.initialize(db);
    await consolidator.consolidateDomain(domain);
    const quality = (db.prepare('SELECT quality FROM captured_experiences WHERE id = ?').get(id) as { quality: number }).quality;
    expect(quality).toBeCloseTo(0.26);
    expect((await adapter.getExperienceGuidance(task, domain))?.confidence).toBeCloseTo(0.26);
  });

  it('persists explicit success and failure with matching adapter and replay counts', async () => {
    const id = await seedExperience();
    await adapter.recordExperienceApplication(id, 'Successful execution', true, 30);
    await adapter.recordExperienceApplication(id, 'Failed execution', false, 5);
    expect(applications()).toEqual([
      { experience_id: id, success: 1, tokens_saved: 30 },
      { experience_id: id, success: 0, tokens_saved: 5 },
    ]);
    const stats = await adapter.getStats();
    expect(stats.adapter).toMatchObject({ experiencesApplied: 2, tokensSavedEstimate: 35 });
    expect(stats.experienceReplay).toMatchObject({ experiencesApplied: 2, totalTokensSaved: 35 });
  });

  it('keeps predicted savings from subsequent guidance separate from recorded savings', async () => {
    const id = await seedExperience();
    await adapter.recordExperienceApplication(id, task, true, 42);
    expect((await adapter.getExperienceGuidance(task, domain))?.estimatedTokenSavings).toBe(42);
    const routed = await adapter.routeTaskWithExperience({ task, domain });
    expect(routed.success).toBe(true);
    expect(applications()).toHaveLength(1);
    expect((await adapter.getStats()).adapter).toMatchObject({ experiencesApplied: 1, tokensSavedEstimate: 42 });
  });

  it.each([{ success: true, quality: 0.66 }, { success: false, quality: 0.26 }])(
    'reinforces explicitly recorded success=$success through consolidation',
    async ({ success, quality }) => {
      const id = await seedExperience();
      await adapter.recordExperienceApplication(id, task, success);
      const consolidator = new consolidationModule.ExperienceConsolidator();
      await consolidator.initialize(db);
      await consolidator.consolidateDomain(domain);
      expect((await adapter.getExperienceGuidance(task, domain))?.confidence).toBeCloseTo(quality);
      expect(applications()).toHaveLength(1);
    },
  );

  it('leaves application evidence and counters unchanged when no guidance exists', async () => {
    expect(await adapter.getExperienceGuidance(task, domain)).toBeNull();
    expect(applications()).toEqual([]);
    expect((await adapter.getStats()).adapter).toMatchObject({ experiencesApplied: 0, tokensSavedEstimate: 0 });
  });

  it('does not count an outcome whose SQLite persistence fails', async () => {
    // The schema's real foreign key rejects an unknown source experience.
    await expect(adapter.recordExperienceApplication('missing-experience', task, true, 99)).rejects.toThrow();
    expect(applications()).toEqual([]);
    expect((await adapter.getStats()).adapter).toMatchObject({ experiencesApplied: 0, tokensSavedEstimate: 0 });
  });
});
