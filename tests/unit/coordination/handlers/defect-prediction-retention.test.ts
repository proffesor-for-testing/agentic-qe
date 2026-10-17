import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import Database from 'better-sqlite3';
import { prunePredictionHistory } from '../../../../src/domains/defect-intelligence/prediction-history.js';
import { DefectPredictorService } from '../../../../src/domains/defect-intelligence/services/defect-predictor.js';
import { HybridMemoryBackend } from '../../../../src/kernel/hybrid-backend.js';
import { resetUnifiedMemory } from '../../../../src/kernel/unified-memory.js';
import { registerCodeIntelligenceHandlers } from '../../../../src/coordination/handlers/code-intelligence-handlers.js';
import type { TaskHandlerContext, InstanceTaskHandler } from '../../../../src/coordination/handlers/handler-types.js';
import type { QueenTask } from '../../../../src/coordination/queen-types.js';
import { DefectPredictorWorker } from '../../../../src/workers/workers/defect-predictor.js';
import { contextFor } from '../../workers/workers/measured-worker-store.js';

const NS = 'defect-intelligence';
const PREFIX = 'defect-intelligence:predictor:prediction:';
const PATTERN = `${PREFIX}*`;

describe('bounded defect prediction history over actual SQLite', () => {
  let root: string;
  let previousRoot: string | undefined;
  let memory: HybridMemoryBackend;
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'aqe-prediction-retention-'));
    previousRoot = process.env.AQE_PROJECT_ROOT;
    process.env.AQE_PROJECT_ROOT = root;
    resetUnifiedMemory();
    await fs.mkdir(path.join(root, 'src'));
    memory = new HybridMemoryBackend({ sqlite: { path: path.join(root, 'memory.db') } });
    await memory.initialize();
  });
  afterEach(async () => {
    vi.useRealTimers();
    await memory?.dispose();
    resetUnifiedMemory();
    if (previousRoot === undefined) delete process.env.AQE_PROJECT_ROOT;
    else process.env.AQE_PROJECT_ROOT = previousRoot;
    await fs.rm(root, { recursive: true, force: true });
  });
  function handler() {
    let run: InstanceTaskHandler;
    registerCodeIntelligenceHandlers({ memory, registerHandler(type: string, h: InstanceTaskHandler) {
      if (type === 'predict-defects') run = h;
    } } as unknown as TaskHandlerContext);
    return () => run!({ payload: { target: path.join(root, 'src'), minConfidence: 0.7 } } as unknown as QueenTask);
  }
  function record(id: string, timestamp: string, file: string, probability = 0.5) {
    return { id, timestamp, predictions: [{ file, probability, riskLevel: probability ? 'medium' : 'info', factors: [], recommendations: [] }] };
  }
  it('bounds more than 1000 public producer calls and measures the later clean rewrite from the same database', async () => {
    const file = path.join(root, 'src', 'sample.ts');
    await fs.writeFile(file, 'export function run() {\n' + '                        if (true) {} // TODO FIXME HACK XXX\n'.repeat(550) + '}');
    const run = handler();
    vi.useFakeTimers({ toFake: ['Date'] });
    const start = Date.now();
    for (let i = 0; i < 1100; i++) {
      vi.setSystemTime(start + i);
      expect((await run()).success).toBe(true);
    }
    await fs.writeFile(file, 'export const clean = 1;\n');
    vi.setSystemTime(start + 1101);
    expect((await run()).success).toBe(true);
    const db = new Database(path.join(root, 'memory.db'), { readonly: true });
    try {
      const count = db.prepare('SELECT count(*) AS n FROM kv_store WHERE namespace = ? AND key LIKE ?').get(NS, `${PREFIX}%`) as { n: number };
      expect(count.n).toBeLessThanOrEqual(32);
    } finally { db.close(); }
    await new DefectPredictorWorker().execute(contextFor(memory as never));
    const measured = await memory.get<{ predictions: { probability: number }[] }>('defect:predictions');
    expect(measured?.predictions.every(p => p.probability === 0)).toBe(true);
  }, 30000);
  it('finds the latest legacy row beyond the old SQL search cap without copying data into a Map', async () => {
    const file = path.join(root, 'src', 'sample.ts');
    await fs.writeFile(file, 'export const clean = 1;\n');
    const now = Date.now();
    for (let i = 0; i < 1100; i++) await memory.set(`${PREFIX}${i}`, record(String(i), new Date(now - 2000 + i).toISOString(), file), { namespace: NS });
    await memory.set(`${PREFIX}latest`, record('latest', new Date(now).toISOString(), file, 0), { namespace: NS });
    await new DefectPredictorWorker().execute(contextFor(memory as never));
    expect(await memory.get('defect:predictions')).toMatchObject({ predictionId: 'latest', predictions: [{ probability: 0 }] });
  });
  it('bounds the actual domain producer without invoking a model', async () => {
    const file = path.join(root, 'src', 'sample.ts');
    await fs.writeFile(file, 'export const clean = 1;');
    const service = new DefectPredictorService(memory, { enableLLMPrediction: false });
    const writer = service as unknown as { storePrediction(predictions: unknown[]): Promise<void> };
    for (let i = 0; i < 40; i++) await writer.storePrediction(record('unused', new Date().toISOString(), file).predictions);
    expect(await memory.search(PATTERN, 1000, { namespace: NS })).toHaveLength(32);
  });
  it('preserves newest timestamp ambiguity and recovers after a uniquely later run', async () => {
    const file = path.join(root, 'src', 'sample.ts');
    await fs.writeFile(file, 'export const clean = 1;');
    const run = handler();
    vi.useFakeTimers({ toFake: ['Date'] });
    const now = Date.now();
    for (let i = 0; i < 40; i++) expect((await run()).success).toBe(true);
    const worker = await new DefectPredictorWorker().execute(contextFor(memory as never));
    expect(worker.findings.some(f => f.title === 'Defect Prediction Unmeasured')).toBe(true);
    vi.setSystemTime(now + 1);
    expect((await run()).success).toBe(true);
    await new DefectPredictorWorker().execute(contextFor(memory as never));
    expect(await memory.get('defect:predictions')).toMatchObject({ measured: true, predictions: [{ probability: 0 }] });
  });
  it('prunes unusable owned rows while preserving unrelated namespaces', async () => {
    const file = path.join(root, 'src', 'sample.ts');
    await fs.writeFile(file, 'export const clean = 1;');
    const now = Date.now();
    await memory.set(`${PREFIX}valid`, record('valid', new Date(now).toISOString(), file), { namespace: NS });
    for (const [id, value] of Object.entries({ null: null, future: record('future', new Date(now + 120000).toISOString(), file), malformed: { id: 'malformed', timestamp: new Date(now).toISOString(), predictions: [null] } })) {
      await memory.set(`${PREFIX}${id}`, value, { namespace: NS });
    }
    await memory.set(`${PREFIX}foreign`, { private: 'preserve' }, { namespace: 'other' });
    await prunePredictionHistory(memory);
    expect(await memory.search(PATTERN, 1000, { namespace: NS })).toEqual([`${PREFIX}valid`]);
    expect(await memory.get(`${PREFIX}foreign`, { namespace: 'other' })).toEqual({ private: 'preserve' });
  });
  it('never removes a concurrent newer UUID key outside the observed snapshot', async () => {
    const file = path.join(root, 'src', 'sample.ts');
    await fs.writeFile(file, 'export const clean = 1;');
    const now = Date.now();
    for (let i = 0; i < 40; i++) await memory.set(`${PREFIX}${i}`, record(String(i), new Date(now - 1000 + i).toISOString(), file), { namespace: NS });
    const search = memory.search.bind(memory);
    vi.spyOn(memory, 'search').mockImplementationOnce(async (...args) => {
      const snapshot = await search(...args);
      await memory.set(`${PREFIX}concurrent`, record('concurrent', new Date(now).toISOString(), file, 0), { namespace: NS });
      return snapshot;
    });
    await prunePredictionHistory(memory);
    expect(await memory.get(`${PREFIX}concurrent`, { namespace: NS })).toBeDefined();
    await new DefectPredictorWorker().execute(contextFor(memory as never));
    expect(await memory.get('defect:predictions')).toMatchObject({ predictionId: 'concurrent' });
  });
  it('reports a producer failure if retention storage fails, while the worker still sees newer rows', async () => {
    const file = path.join(root, 'src', 'sample.ts');
    await fs.writeFile(file, 'export const clean = 1;');
    const now = Date.now();
    for (let i = 0; i < 40; i++) await memory.set(`${PREFIX}${i}`, record(String(i), new Date(now - 1000 + i).toISOString(), file), { namespace: NS });
    vi.spyOn(memory, 'delete').mockRejectedValueOnce(new Error('retention storage failed'));
    expect((await handler()()).success).toBe(false);
    await new DefectPredictorWorker().execute(contextFor(memory as never));
    const measured = await memory.get<{ predictions: { probability: number }[] }>('defect:predictions');
    expect(measured?.predictions.every(p => p.probability === 0)).toBe(true);
  });

});
