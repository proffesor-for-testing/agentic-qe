import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import Database from 'better-sqlite3';
import { MAX_PREDICTION_TARGET_LENGTH, predictionTargetForFiles, prunePredictionHistory } from '../../../../src/domains/defect-intelligence/prediction-history.js';
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
  function handler(target = path.join(root, 'src')) {
    let run: InstanceTaskHandler;
    registerCodeIntelligenceHandlers({ memory, registerHandler(type: string, h: InstanceTaskHandler) {
      if (type === 'predict-defects') run = h;
    } } as unknown as TaskHandlerContext);
    return () => run!({ payload: { target, minConfidence: 0.7 } } as unknown as QueenTask);
  }
  function record(id: string, timestamp: string, file: string, probability = 0.5, target?: string) {
    return { id, timestamp, ...(target === undefined ? {} : { target }),
      predictions: [{ file, probability, riskLevel: probability ? 'medium' : 'info', factors: [], recommendations: [] }] };
  }
  const storedKeys = async () => (await memory.search(PATTERN, 1000, { namespace: NS })).sort();
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
  it('#1137: deletes runs older than 7 days but leaves rows it cannot parse to their TTL', async () => {
    const file = path.join(root, 'src', 'sample.ts');
    await fs.writeFile(file, 'export const clean = 1;');
    const now = Date.now();
    const at = (offset: number) => new Date(now + offset).toISOString();
    const rows: Record<string, unknown> = {
      valid: record('valid', at(0), file),
      // Clock skew: another host sharing the database stamped this 5 minutes ahead.
      skewed: record('skewed', at(5 * 60_000), file),
      // A newer AQE install sharing .agentic-qe knows a riskLevel this version does not.
      newerSchema: { ...record('newerSchema', at(-1000), file), predictions: [{ file, probability: 0.9, riskLevel: 'severe', factors: [], recommendations: [] }] },
      malformed: { id: 'malformed', timestamp: at(0), predictions: [null] },
      noTimestamp: { id: 'noTimestamp', predictions: [] },
      badTimestamp: { id: 'badTimestamp', timestamp: 'yesterday-ish', predictions: [] },
      null: null,
      expired: record('expired', at(-8 * 86_400_000), file),
      expiredNewerSchema: { id: 'expiredNewerSchema', timestamp: at(-8 * 86_400_000), predictions: [{ riskLevel: 'severe' }] },
    };
    for (const [id, value] of Object.entries(rows)) await memory.set(`${PREFIX}${id}`, value, { namespace: NS });
    await memory.set(`${PREFIX}foreign`, { private: 'preserve' }, { namespace: 'other' });

    await prunePredictionHistory(memory);

    expect(await storedKeys()).toEqual(['badTimestamp', 'malformed', 'newerSchema', 'noTimestamp', 'null', 'skewed', 'valid']
      .map(id => `${PREFIX}${id}`));
    expect(await memory.get(`${PREFIX}foreign`, { namespace: 'other' })).toEqual({ private: 'preserve' });
  });
  it('#1137: unparseable rows do not count toward the cap and are never chosen for eviction', async () => {
    const file = path.join(root, 'src', 'sample.ts');
    await fs.writeFile(file, 'export const clean = 1;');
    const now = Date.now();
    for (let i = 0; i < 40; i++) await memory.set(`${PREFIX}${i}`, record(String(i), new Date(now - 1000 + i).toISOString(), file), { namespace: NS });
    await memory.set(`${PREFIX}skewed`, record('skewed', new Date(now + 5 * 60_000).toISOString(), file), { namespace: NS });
    await prunePredictionHistory(memory);
    const kept = await storedKeys();
    expect(kept).toContain(`${PREFIX}skewed`);
    expect(kept.filter(k => k !== `${PREFIX}skewed`)).toHaveLength(32);
    expect(kept).not.toContain(`${PREFIX}7`);
    expect(kept).toContain(`${PREFIX}8`);
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
  it('#1137: a retention failure after the run is stored reports success with retention failed (MCP handler)', async () => {
    const file = path.join(root, 'src', 'sample.ts');
    await fs.writeFile(file, 'export const clean = 1;');
    const now = Date.now();
    for (let i = 0; i < 40; i++) await memory.set(`${PREFIX}${i}`, record(String(i), new Date(now - 1000 + i).toISOString(), file), { namespace: NS });
    vi.spyOn(memory, 'delete').mockRejectedValueOnce(new Error('retention storage failed'));
    const result = await handler()();
    expect(result.success).toBe(true);
    expect(result.success && result.value).toMatchObject({ filesAnalyzed: 1, retention: 'failed', retentionError: 'retention storage failed' });
    await new DefectPredictorWorker().execute(contextFor(memory as never));
    const measured = await memory.get<{ predictions: { probability: number }[] }>('defect:predictions');
    expect(measured?.predictions.every(p => p.probability === 0)).toBe(true);
  });
  it('#1137: a successful prune adds no retention note', async () => {
    await fs.writeFile(path.join(root, 'src', 'sample.ts'), 'export const clean = 1;');
    const result = await handler()();
    expect(result.success && result.value).not.toHaveProperty('retention');
  });
  it('#1137: a retention failure in the domain producer (CLI path) still returns the stored predictions', async () => {
    const file = path.join(root, 'src', 'sample.ts');
    await fs.writeFile(file, 'export const clean = 1;');
    const service = new DefectPredictorService(memory, { enableLLMPrediction: false });
    vi.spyOn(memory, 'search').mockRejectedValueOnce(new Error('retention storage failed'));
    const result = await service.predictDefects({ files: [file] });
    expect(result.success).toBe(true);
    expect(result.success && result.value).toMatchObject({ retention: 'failed', predictions: [expect.objectContaining({ file })] });
    expect(await storedKeys()).toHaveLength(1);
    const ok = await service.predictDefects({ files: [file] });
    expect(ok.success && ok.value).not.toHaveProperty('retention');
  });
  it('#1137: keeps the latest run of every target; one busy target cannot evict another', async () => {
    const now = Date.now();
    await memory.set(`${PREFIX}a`, record('a', new Date(now - 60_000).toISOString(), 'src/a/x.ts', 0.5, '/p/src/a'), { namespace: NS });
    for (let i = 0; i < 40; i++) {
      await memory.set(`${PREFIX}b${i}`, record(`b${i}`, new Date(now - 1000 + i).toISOString(), 'src/b/y.ts', 0.5, '/p/src/b'), { namespace: NS });
    }
    await prunePredictionHistory(memory);
    const kept = await storedKeys();
    expect(kept).toHaveLength(32);
    expect(kept).toContain(`${PREFIX}a`);
    expect(kept).toContain(`${PREFIX}b39`);
    expect(kept).not.toContain(`${PREFIX}b8`);
  });
  it('#1137: stays bounded overall when there are more targets than the cap', async () => {
    const now = Date.now();
    for (let i = 0; i < 40; i++) {
      await memory.set(`${PREFIX}t${i}`, record(`t${i}`, new Date(now - 1000 + i).toISOString(), `src/${i}.ts`, 0.5, `/p/src/${i}`), { namespace: NS });
    }
    await prunePredictionHistory(memory);
    const kept = await storedKeys();
    expect(kept).toHaveLength(32);
    expect(kept).toContain(`${PREFIX}t39`);
    expect(kept).not.toContain(`${PREFIX}t7`);
  });
  it('#1137: the worker reports src/a after src/b was predicted, through the public producer and SQLite', async () => {
    for (const dir of ['a', 'b']) {
      await fs.mkdir(path.join(root, 'src', dir));
      await fs.writeFile(path.join(root, 'src', dir, `${dir}.ts`), 'export function run() {\n' + '                        if (true) {} // TODO FIXME HACK XXX\n'.repeat(550) + '}');
    }
    vi.useFakeTimers({ toFake: ['Date'] });
    const start = Date.now();
    vi.setSystemTime(start);
    expect((await handler(path.join(root, 'src', 'a'))()).success).toBe(true);
    for (let i = 1; i <= 40; i++) {
      vi.setSystemTime(start + i);
      expect((await handler(path.join(root, 'src', 'b'))()).success).toBe(true);
    }
    const worker = await new DefectPredictorWorker().execute(contextFor(memory as never));
    const measured = await memory.get<{ predictions: { file: string }[]; runs: { target: string }[] }>('defect:predictions');
    expect(measured?.predictions.map(p => path.relative(root, p.file)).sort()).toEqual([path.join('src', 'a', 'a.ts'), path.join('src', 'b', 'b.ts')]);
    expect(measured?.runs.map(r => path.relative(root, r.target))).toEqual([path.join('src', 'b'), path.join('src', 'a')]);
    expect(worker.metrics.itemsAnalyzed).toBe(2);
    expect(worker.findings.filter(f => /defect-risk$/.test(f.type)).map(f => path.basename(f.resource!)).sort()).toEqual(['a.ts', 'b.ts']);
  }, 30000);
  it('#1137: a file-list target ignores order and duplicates, and a long list is stored by digest', () => {
    expect(predictionTargetForFiles(['b.ts', 'a.ts', 'b.ts'])).toBe(predictionTargetForFiles(['a.ts', 'b.ts']));
    expect(predictionTargetForFiles(['a.ts'])).not.toBe(predictionTargetForFiles(['a.ts', 'b.ts']));
    const many = Array.from({ length: 500 }, (_, i) => `src/module-${i}/file.ts`);
    const target = predictionTargetForFiles(many);
    expect(target).toMatch(/^files-sha256:[0-9a-f]{64}$/);
    expect(target.length).toBeLessThanOrEqual(MAX_PREDICTION_TARGET_LENGTH);
    expect(predictionTargetForFiles([...many].reverse())).toBe(target);
  });
  it('#1137: refuses a target longer than PATH_MAX before resolving or storing it', async () => {
    const result = await handler('src/' + 'a/'.repeat(30_000))();
    expect(result.success).toBe(false);
    expect(!result.success && result.error.message).toMatch(/'target' is 60004 characters; the limit is 4096/);
    expect(!result.success && result.error.message.length).toBeLessThan(200);
    expect(await storedKeys()).toEqual([]);
  });

});
