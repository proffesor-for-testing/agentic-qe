/**
 * Issue #1043 — the defect-predictor worker reports only real predictions.
 *
 * It used to return four invented file predictions (workflow-orchestrator.ts
 * 78 %, security-scanner.ts 65 %, …) and three invented hotspots in every
 * project, stored as `defect:predictions` / `defect:hotspots`. It now relays
 * the latest prediction the defect-intelligence domain actually made
 * (`defect-intelligence:predictor:prediction:<id>` in the
 * `defect-intelligence` namespace), keeping only files that exist in the
 * project. Hotspots have no measured source and are reported unmeasured.
 * Nothing predicted → nothing written, an "unmeasured" info finding. A
 * `defect:predictions` without the measured stamp (<= 3.15.6) is ignored.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DefectPredictorWorker } from '../../../../src/workers/workers/defect-predictor';
import { namespacedStore, contextFor, type NamespacedStore } from './measured-worker-store';

const NS = 'defect-intelligence';
const INVENTED = /workflow-orchestrator|security-scanner\.ts|memory-backend\.ts|http-client\.ts|test-generator\.ts|src\/mcp\/server\.ts/;

/** A prediction recorded the way DefectPredictorService.storePrediction does. */
async function recordPrediction(store: NamespacedStore, id: string, timestamp: string, predictions: Array<{
  file: string; probability: number; riskLevel: string; factors?: Array<{ name: string; contribution: number }>;
}>) {
  await store.memory.set(`defect-intelligence:predictor:prediction:${id}`, {
    id,
    timestamp,
    predictions: predictions.map((p) => ({
      factors: [{ name: 'codeComplexity', contribution: 0.3 }],
      recommendations: ['Review'],
      ...p,
    })),
  }, { namespace: NS });
}

const riskFindings = (findings: Array<{ type: string }>) => findings.filter((f) => /defect-risk$|hotspot|silo/.test(f.type));
const recent = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString();

describe('#1043 — defect-predictor worker relays real domain predictions only', () => {
  let root: string;
  const savedRoot = process.env.AQE_PROJECT_ROOT;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-1043-defect-'));
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'risky.ts'), 'export const a = 1;\n');
    fs.writeFileSync(path.join(root, 'src', 'calm.ts'), 'export const b = 2;\n');
    process.env.AQE_PROJECT_ROOT = root;
  });

  afterEach(() => {
    if (savedRoot === undefined) delete process.env.AQE_PROJECT_ROOT;
    else process.env.AQE_PROJECT_ROOT = savedRoot;
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('nothing predicted: writes nothing, no risk findings, reports unmeasured', async () => {
    const store = namespacedStore();
    const result = await new DefectPredictorWorker().execute(contextFor(store.memory));

    expect(result.success).toBe(true);
    expect(store.memory.set).not.toHaveBeenCalled();
    expect(riskFindings(result.findings)).toEqual([]);
    expect(result.findings).toContainEqual(expect.objectContaining({ type: 'defect-prediction-unmeasured', severity: 'info' }));
    expect(result.metrics.itemsAnalyzed).toBe(0);
    expect(result.metrics.domainMetrics).toMatchObject({
      filesAnalyzed: 0,
      avgDefectProbability: 'unmeasured',
      hotspots: 'unmeasured',
    });
    expect(JSON.stringify(result)).not.toMatch(INVENTED);
    expect(JSON.stringify(result)).not.toMatch(/NaN/);
  });

  it('a recorded domain prediction on real files: stamped record and findings for exactly those files', async () => {
    const store = namespacedStore();
    await recordPrediction(store, 'p-1', recent(5), [
      { file: 'src/risky.ts', probability: 0.8, riskLevel: 'high' },
      { file: path.join(root, 'src', 'calm.ts'), probability: 0.14, riskLevel: 'info', factors: [] },
    ]);

    const result = await new DefectPredictorWorker().execute(contextFor(store.memory));

    expect(riskFindings(result.findings)).toEqual([
      expect.objectContaining({ type: 'high-defect-risk', severity: 'high', resource: 'src/risky.ts' }),
    ]);
    const stored = store.read('defect:predictions') as Record<string, any>;
    expect(stored).toMatchObject({ measured: true, schemaVersion: 1, predictionId: 'p-1' });
    expect(stored.predictions.map((p: { file: string }) => p.file)).toEqual(['src/risky.ts', path.join(root, 'src', 'calm.ts')]);
    expect(store.memory.set).not.toHaveBeenCalledWith('defect:hotspots', expect.anything());
    expect(result.metrics.domainMetrics).toMatchObject({
      filesAnalyzed: 2, highRiskFiles: 1, avgDefectProbability: '0.47', hotspots: 'unmeasured',
    });
    expect(JSON.stringify(result)).not.toMatch(INVENTED);
  });

  it('drops predictions for files that do not exist in the project', async () => {
    const store = namespacedStore();
    await recordPrediction(store, 'p-2', recent(5), [
      { file: 'src/coordination/workflow-orchestrator.ts', probability: 0.78, riskLevel: 'high' },
      { file: 'src/risky.ts', probability: 0.4, riskLevel: 'medium' },
    ]);

    const result = await new DefectPredictorWorker().execute(contextFor(store.memory));

    expect(riskFindings(result.findings)).toEqual([]);
    expect((store.read('defect:predictions') as { predictions: unknown[] }).predictions).toHaveLength(1);
    expect(result.metrics.domainMetrics).toMatchObject({ filesAnalyzed: 1, missingFilesSkipped: 1 });
    expect(JSON.stringify(result)).not.toMatch(INVENTED);
  });

  it('uses the most recent prediction and ignores stale or malformed records', async () => {
    const store = namespacedStore();
    await recordPrediction(store, 'p-old', recent(600), [{ file: 'src/risky.ts', probability: 0.95, riskLevel: 'critical' }]);
    await recordPrediction(store, 'p-new', recent(1), [{ file: 'src/calm.ts', probability: 0.2, riskLevel: 'low' }]);
    await recordPrediction(store, 'p-stale', new Date(Date.now() - 8 * 86_400_000).toISOString(),
      [{ file: 'src/risky.ts', probability: 0.99, riskLevel: 'critical' }]);
    await store.memory.set('defect-intelligence:predictor:prediction:junk', { predictions: 'x' }, { namespace: NS });

    const result = await new DefectPredictorWorker().execute(contextFor(store.memory));

    expect(riskFindings(result.findings)).toEqual([]);
    expect(store.read('defect:predictions')).toMatchObject({ predictionId: 'p-new' });
  });

  it('a prediction whose files are all missing is not a measurement', async () => {
    const store = namespacedStore();
    await recordPrediction(store, 'p-3', recent(1), [{ file: 'src/ghost.ts', probability: 0.9, riskLevel: 'critical' }]);
    store.memory.set.mockClear();

    const result = await new DefectPredictorWorker().execute(contextFor(store.memory));

    expect(store.memory.set).not.toHaveBeenCalled();
    expect(riskFindings(result.findings)).toEqual([]);
    expect(result.findings).toContainEqual(expect.objectContaining({ type: 'defect-prediction-unmeasured' }));
  });

  it('round 2b: drops predictions for paths outside the project root, including symlinks escaping it', async () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-1043-outside-'));
    try {
      fs.writeFileSync(path.join(outside, 'secret.ts'), 'export const s = 1;\n');
      fs.symlinkSync(path.join(outside, 'secret.ts'), path.join(root, 'src', 'escape.ts'));
      fs.symlinkSync(path.join(root, 'src', 'calm.ts'), path.join(root, 'src', 'inside-link.ts'));
      const store = namespacedStore();
      await recordPrediction(store, 'p-out', recent(1), [
        { file: '/etc/hosts', probability: 0.97, riskLevel: 'critical' },
        { file: path.join(outside, 'secret.ts'), probability: 0.9, riskLevel: 'critical' },
        { file: '../' + path.basename(outside) + '/secret.ts', probability: 0.9, riskLevel: 'critical' },
        { file: 'src/escape.ts', probability: 0.9, riskLevel: 'critical' },
        { file: 'src/inside-link.ts', probability: 0.2, riskLevel: 'low' },
        { file: 'src/risky.ts', probability: 0.8, riskLevel: 'high' },
      ]);

      const result = await new DefectPredictorWorker().execute(contextFor(store.memory));

      expect(riskFindings(result.findings)).toEqual([
        expect.objectContaining({ type: 'high-defect-risk', resource: 'src/risky.ts' }),
      ]);
      expect(JSON.stringify(result)).not.toMatch(/etc\/hosts|secret\.ts|escape\.ts/);
      const stored = store.read('defect:predictions') as { predictions: Array<{ file: string }> };
      expect(stored.predictions.map((p) => p.file)).toEqual(['src/inside-link.ts', 'src/risky.ts']);
      expect(result.metrics.domainMetrics).toMatchObject({ filesAnalyzed: 2, outsideProjectSkipped: 4 });
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it('round 2b: a prediction naming only /etc/hosts is unmeasured', async () => {
    const store = namespacedStore();
    await recordPrediction(store, 'p-etc', recent(1), [{ file: '/etc/hosts', probability: 0.97, riskLevel: 'critical' }]);

    const result = await new DefectPredictorWorker().execute(contextFor(store.memory));

    expect(store.memory.set).not.toHaveBeenCalledWith('defect:predictions', expect.anything());
    expect(riskFindings(result.findings)).toEqual([]);
    expect(result.findings).toContainEqual(expect.objectContaining({ type: 'defect-prediction-unmeasured' }));
  });

  it('round 2b: when the newest prediction is unusable, an older measured record is marked stale, not left current', async () => {
    const store = namespacedStore();
    await recordPrediction(store, 'p-good', recent(30), [{ file: 'src/risky.ts', probability: 0.8, riskLevel: 'high' }]);
    await new DefectPredictorWorker().execute(contextFor(store.memory));
    expect(store.read('defect:predictions')).toMatchObject({ measured: true, predictionId: 'p-good' });

    await recordPrediction(store, 'p-bad', recent(1), [{ file: '/etc/hosts', probability: 0.97, riskLevel: 'critical' }]);
    const result = await new DefectPredictorWorker().execute(contextFor(store.memory));

    expect(riskFindings(result.findings)).toEqual([]);
    expect(result.findings).toContainEqual(expect.objectContaining({ type: 'defect-prediction-unmeasured' }));
    expect(store.read('defect:predictions')).toMatchObject({
      measured: true, predictionId: 'p-good', stale: true, supersededBy: 'p-bad',
    });
    // Re-ticks do not rewrite an already-stale record.
    store.memory.set.mockClear();
    await new DefectPredictorWorker().execute(contextFor(store.memory));
    expect(store.memory.set).not.toHaveBeenCalled();
  });

  it('a legacy unstamped defect:predictions is ignored (left in place) and replaced', async () => {
    const store = namespacedStore();
    const legacy = [{ file: 'src/coordination/workflow-orchestrator.ts', probability: 0.78, riskLevel: 'high', factors: [] }];
    await store.memory.set('defect:predictions', legacy);
    store.memory.set.mockClear();

    const unmeasured = await new DefectPredictorWorker().execute(contextFor(store.memory));
    expect(store.memory.set).not.toHaveBeenCalled();
    expect(store.read('defect:predictions')).toEqual(legacy);
    expect(JSON.stringify(unmeasured)).not.toMatch(INVENTED);

    await recordPrediction(store, 'p-4', recent(1), [{ file: 'src/risky.ts', probability: 0.3, riskLevel: 'low' }]);
    await new DefectPredictorWorker().execute(contextFor(store.memory));
    expect(store.read('defect:predictions')).toMatchObject({ measured: true, predictionId: 'p-4' });
  });
});
