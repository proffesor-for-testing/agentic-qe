import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { registerCodeIntelligenceHandlers } from '../../../../src/coordination/handlers/code-intelligence-handlers';
import type { TaskHandlerContext, InstanceTaskHandler } from '../../../../src/coordination/handlers/handler-types';
import type { QueenTask } from '../../../../src/coordination/queen-types';
import { DefectPredictorWorker } from '../../../../src/workers/workers/defect-predictor';
import { contextFor, namespacedStore } from '../../workers/workers/measured-worker-store';

const failures = vi.hoisted(() => ({ all: false, suffix: '' }));
// #1161: source reads go through the confined reader; route it to the fs mock.
vi.mock('../../../../src/shared/io/confined-read.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../src/shared/io/confined-read.js')>();
  const fsp = await import('fs/promises');
  return {
    ...actual,
    readConfinedFile: async (p: string) => Buffer.from(await fsp.readFile(p) as string | Buffer),
    readConfinedText: async (p: string) => String(await fsp.readFile(p, 'utf-8')),
  };
});
vi.mock('fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs/promises')>();
  return {
    ...actual,
    readFile: vi.fn(async (...args: Parameters<typeof actual.readFile>) => {
      if (failures.all || (failures.suffix && String(args[0]).endsWith(failures.suffix))) throw new Error('read failed');
      return actual.readFile(...args);
    }),
  };
});

const NS = 'defect-intelligence';
const PATTERN = 'defect-intelligence:predictor:prediction:*';

describe('#1050 public defect prediction records its analysis for the worker', () => {
  let root: string;
  let priorRoot: string | undefined;
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'aqe-defect-record-'));
    priorRoot = process.env.AQE_PROJECT_ROOT;
    process.env.AQE_PROJECT_ROOT = root;
    await fs.mkdir(path.join(root, 'src'));
    // All five indicators: large file, branches, nesting, debt and a long function.
    await fs.writeFile(path.join(root, 'src', 'risky.ts'),
      'export function risky(x: number) {\n' +
      '                        if (x) x++; // TODO FIXME HACK XXX\n'.repeat(550) + '}\n');
    await fs.writeFile(path.join(root, 'src', 'calm.ts'), 'export const calm = 1;\n');
  });
  afterEach(async () => {
    vi.useRealTimers();
    failures.all = false;
    failures.suffix = "";
    if (priorRoot === undefined) delete process.env.AQE_PROJECT_ROOT;
    else process.env.AQE_PROJECT_ROOT = priorRoot;
    await fs.rm(root, { recursive: true, force: true });
  });

  function setup() {
    const store = namespacedStore();
    let handler: InstanceTaskHandler;
    registerCodeIntelligenceHandlers({
      memory: store.memory,
      registerHandler(type: string, h: InstanceTaskHandler) {
        if (type === 'predict-defects') handler = h;
      },
    } as unknown as TaskHandlerContext);
    return { store, run: (target = path.join(root, 'src')) => handler!({
      payload: { target, minConfidence: 0.7 },
    } as unknown as QueenTask) };
  }

  it('records all analyzed files and the worker surfaces the actual subdirectory files with heuristic provenance', async () => {
    const { store, run } = setup();
    const result = await run();
    expect(result.success).toBe(true);
    const keys = await store.memory.search(PATTERN, 100, { namespace: NS });
    expect(keys).toHaveLength(1);
    const record = await store.memory.get(keys[0], { namespace: NS }) as any;
    expect(record).toMatchObject({ predictionMethod: 'static-code-indicators', estimated: true });
    expect(record.predictions.map((p: any) => p.file).sort()).toEqual([
      path.join(root, 'src', 'calm.ts'), path.join(root, 'src', 'risky.ts'),
    ]);
    const worker = await new DefectPredictorWorker().execute(contextFor(store.memory));
    expect(worker.metrics.itemsAnalyzed).toBe(2);
    expect(worker.findings).toContainEqual(expect.objectContaining({
      resource: path.join(root, 'src', 'risky.ts'),
      description: expect.stringContaining('static-code-indicators'),
    }));
    expect(store.read('defect:predictions')).toMatchObject({ estimated: true, predictionMethod: 'static-code-indicators' });
  });

  it('records a clean reanalysis even when no file crosses the display threshold', async () => {
    const { store, run } = setup();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-16T21:41:00Z'));
    await run();
    vi.setSystemTime(new Date('2026-10-16T21:41:00.001Z'));
    await fs.writeFile(path.join(root, 'src', 'risky.ts'), 'export const calm = 1;\n');
    const result = await run();
    expect(result.success && (result.value as any).predictedDefects).toEqual([]);
    const worker = await new DefectPredictorWorker().execute(contextFor(store.memory));
    expect(worker.metrics.itemsAnalyzed).toBe(2);
    expect(worker.findings.some(f => /-defect-risk$/.test(f.type))).toBe(false);
    expect((store.read('defect:predictions') as any).predictions.every((p: any) => p.probability === 0)).toBe(true);
  });

  it('does not create a prediction for an empty target', async () => {
    const { store, run } = setup();
    await fs.mkdir(path.join(root, 'empty'));
    expect((await run(path.join(root, 'empty'))).success).toBe(true);
    expect(await store.memory.search(PATTERN, 100, { namespace: NS })).toEqual([]);
  });

  it.each([false, true])('treats same-timestamp conflicting runs as ambiguous regardless of search order (reverse=%s)', async (reverse) => {
    const { store, run } = setup();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-16T21:41:00Z'));
    await run();
    await new DefectPredictorWorker().execute(contextFor(store.memory));
    expect((store.read('defect:predictions') as any).stale).not.toBe(true);
    await fs.writeFile(path.join(root, 'src', 'risky.ts'), 'export const calm = 1;\n');
    await run();
    if (reverse) {
      const search = store.memory.search.getMockImplementation()!;
      store.memory.search.mockImplementation(async (...args) => (await search(...args)).reverse());
    }
    const ambiguous = await new DefectPredictorWorker().execute(contextFor(store.memory));
    expect(ambiguous.metrics.itemsAnalyzed).toBe(0);
    expect(ambiguous.findings).toContainEqual(expect.objectContaining({
      type: 'defect-prediction-unmeasured', description: expect.stringContaining('same timestamp'),
    }));
    expect((store.read('defect:predictions') as any).stale).toBe(true);
    vi.setSystemTime(new Date('2026-10-16T21:41:00.001Z'));
    await run();
    const recovered = await new DefectPredictorWorker().execute(contextFor(store.memory));
    expect(recovered.metrics.itemsAnalyzed).toBe(2);
    expect(recovered.findings.some(f => /-defect-risk$/.test(f.type))).toBe(false);
    expect((store.read('defect:predictions') as any).stale).not.toBe(true);
  });

  it.each(['calm.ts', 'risky.ts'])('reports partial scans when %s cannot be read', async (unreadable) => {
    const { store, run } = setup();
    failures.suffix = unreadable;
    const result = await run();
    expect(result.success && result.value).toMatchObject({ filesAnalyzed: 1, filesSkipped: 1, scanStatus: 'partial' });
    if (unreadable === 'risky.ts') {
      expect(JSON.stringify(result)).not.toContain('code looks healthy');
      expect(JSON.stringify(result)).toContain('remain unassessed');
    }
    const worker = await new DefectPredictorWorker().execute(contextFor(store.memory));
    expect(worker.metrics.domainMetrics).toMatchObject({ filesAnalyzed: 1, filesSkipped: 1, scanStatus: 'partial' });
    expect(worker.findings).toContainEqual(expect.objectContaining({ type: 'defect-prediction-partial' }));
  });

  it('fails when no discovered file can be read and records no successful analysis', async () => {
    const { store, run } = setup();
    failures.all = true;
    const result = await run();
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.message).toContain('could not read any');
    expect(await store.memory.search(PATTERN, 100, { namespace: NS })).toEqual([]);
  });

  it('reports persistence failures rather than claiming a completed recorded prediction', async () => {
    const { store, run } = setup();
    store.memory.set.mockRejectedValue(new Error('prediction store unavailable'));
    const result = await run();
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.message).toContain('prediction store unavailable');
  });
});
