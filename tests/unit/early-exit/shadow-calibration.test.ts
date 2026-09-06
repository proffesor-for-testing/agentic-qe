import { describe, expect, it } from 'vitest';
import { EarlyExitController } from '../../../src/early-exit/early-exit-controller.js';
import { SpeculativeExecutor } from '../../../src/early-exit/speculative-executor.js';
import type { LayerResult, TestLayer } from '../../../src/early-exit/types.js';

const layers: TestLayer[] = [
  { index: 0, type: 'unit', name: 'unit', testFiles: [] },
  { index: 1, type: 'integration', name: 'concurrency', testFiles: [] },
  { index: 2, type: 'e2e', name: 'security', testFiles: [] },
  { index: 3, type: 'performance', name: 'performance', testFiles: [] },
];

function result(layer: TestLayer, failing = false): LayerResult {
  return {
    layerIndex: layer.index,
    layerType: layer.type,
    passRate: failing ? 0 : 1,
    coverage: 1,
    flakyRatio: 0,
    totalTests: 10,
    passedTests: failing ? 9 : 10,
    failedTests: failing ? 1 : 0,
    skippedTests: 0,
    duration: 10,
  };
}

const candidateConfig = {
  mode: 'shadow' as const,
  exitLayer: 0,
  adaptiveExitLayer: false,
  minLambdaForExit: 0,
  minLambdaStability: 0,
  maxBoundaryConcentration: 1,
  minConfidence: 0,
  verificationLayers: 0,
};

const context = {
  revision: 'abc123', environment: 'node-22-linux',
  featureSchemaVersion: 'lambda/v1', heuristicVersion: 'coherence/v1',
};

describe('early-exit shadow calibration', () => {
  it.each([
    ['concurrency', 1],
    ['security', 2],
    ['performance', 3],
  ])('keeps a deep %s failure authoritative', async (_risk, failureLayer) => {
    const controller = new EarlyExitController(candidateConfig, layers.length);
    const executed: number[] = [];
    const run = await controller.runWithEarlyExit(layers, async layer => {
      executed.push(layer.index);
      return result(layer, layer.index === failureLayer);
    }, context);

    expect(executed).toEqual([0, 1, 2, 3]);
    expect(run.exitedEarly).toBe(false);
    expect(run.skippedLayers).toBe(0);
    expect(run.computeSavings).toBe(0);
    expect(run.shadowCalibration).toMatchObject({
      evidenceClass: 'EXECUTED',
      candidateExitLayer: 0,
      fullRunVerdict: 'fail',
      actualSavings: 0,
      context,
      firstMissedFailure: { layerIndex: failureLayer, failedTests: 1 },
    });
    expect(run.shadowCalibration?.receiptId).toMatch(/^[a-f0-9]{64}$/);
    expect(run.shadowCalibration?.candidateSignal.lambda).toBe(100);
    expect(run.shadowCalibration?.thresholds).toMatchObject({ minLambdaForExit: 0, minConfidence: 0 });
    expect(run.shadowCalibration?.predictedLayers.every(item => item.evidenceClass === 'PREDICTED')).toBe(true);
    expect(Object.isFrozen(run.shadowCalibration)).toBe(true);
    expect(Object.isFrozen(run.shadowCalibration?.predictedLayers)).toBe(true);
    expect(run.speculations.every(item => item.evidenceClass === 'PREDICTED')).toBe(true);
  });

  it('fails open to inconclusive calibration evidence when target provenance is absent', async () => {
    const controller = new EarlyExitController(candidateConfig, layers.length);
    const run = await controller.runWithEarlyExit(layers, async layer => result(layer));
    expect(run.layers).toHaveLength(4);
    expect(run.shadowCalibration?.evidenceClass).toBe('INCONCLUSIVE');
    expect(run.shadowCalibration?.context).toBeUndefined();
  });

  it('retains explicit enforced mode for a qualified caller', async () => {
    const controller = new EarlyExitController({ ...candidateConfig, mode: 'enforced' }, layers.length);
    let executions = 0;
    const run = await controller.runWithEarlyExit(layers, async layer => {
      executions++;
      return result(layer);
    });
    expect(run.exitedEarly).toBe(true);
    expect(executions).toBe(1);
    expect(run.shadowCalibration).toBeUndefined();
  });

  it('labels a verification exception inconclusive rather than executed', async () => {
    const speculator = new SpeculativeExecutor({ verificationLayers: 1 });
    const predictions = await speculator.speculate({
      canExit: true, confidence: 1, exitLayer: 0, reason: 'confident_exit', enableSpeculation: true,
      explanation: 'test', timestamp: new Date(), lambdaStability: 1, lambdaValue: 100,
    }, [layers[1]!]);
    const verified = await speculator.verify(predictions.predictions, [layers[1]!], async () => {
      throw new Error('oracle unavailable');
    });
    expect(verified[0]).toMatchObject({ verified: false, evidenceClass: 'INCONCLUSIVE' });
    expect(verified[0]?.actual).toBeUndefined();
  });

  it('updates false-pass metrics from full-run counterfactuals', async () => {
    const controller = new EarlyExitController(candidateConfig, layers.length);
    await controller.runWithEarlyExit(layers, async layer => result(layer, layer.index === 2), context);
    expect(controller.getMetrics()).toMatchObject({
      shadowCandidateCount: 1,
      falsePositiveRate: 1,
      falseNegativeRate: 0,
    });
  });
});
