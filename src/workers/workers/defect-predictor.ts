/**
 * Agentic QE v3 - Defect Predictor Worker
 * ADR-014: Background Workers for QE Monitoring
 *
 * Surfaces the defect-intelligence domain's latest predictions:
 * - High-risk files and their contributing factors
 * - Targeted review / refactoring / coverage recommendations
 *
 * #1043: every prediction comes from a run of the defect-intelligence
 * predictor (`defect-intelligence:predictor:prediction:<id>` in the
 * `defect-intelligence` namespace, written by DefectPredictorService), and
 * only files that exist in the project are kept. Code hotspots have no
 * measured source and are reported unmeasured. Nothing predicted → nothing
 * stored, an "unmeasured" info finding. A `defect:predictions` record without
 * the measured stamp (the invented one written by <= 3.15.6) is ignored and
 * replaced by the next measured run.
 */

import * as fs from 'fs';
import * as path from 'path';
import { BaseWorker } from '../base-worker';
import {
  WorkerConfig,
  WorkerContext,
  WorkerResult,
  WorkerFinding,
  WorkerRecommendation,
} from '../interfaces';
import { findProjectRoot } from '../../kernel/project-root.js';

const CONFIG: WorkerConfig = {
  id: 'defect-predictor',
  name: 'Defect Predictor',
  description: 'Uses ML patterns to predict potential defects and identify high-risk code areas',
  intervalMs: 15 * 60 * 1000, // 15 minutes
  priority: 'high',
  targetDomains: ['defect-intelligence'],
  enabled: true,
  timeoutMs: 180000,
  retryCount: 2,
  retryDelayMs: 15000,
};

const DEFECT_NAMESPACE = 'defect-intelligence';
const PREDICTION_KEY_PATTERN = 'defect-intelligence:predictor:prediction:*';
const PREDICTIONS_KEY = 'defect:predictions';
const SCHEMA_VERSION = 1;
/** The predictor keeps its records for 7 days; nothing older is current. */
const MAX_PREDICTION_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_PREDICTION_RECORDS = 1000;

type RiskLevel = 'critical' | 'high' | 'medium' | 'low' | 'info';
const RISK_LEVELS: readonly RiskLevel[] = ['critical', 'high', 'medium', 'low', 'info'];

/** One file prediction as the defect-intelligence predictor recorded it. */
interface DomainFilePrediction {
  file: string;
  probability: number;
  riskLevel: RiskLevel;
  factors: { name: string; contribution: number }[];
  recommendations: string[];
}

/** The `defect:predictions` record: one real prediction run (#1043). */
interface MeasuredDefectPredictions {
  measured: true;
  schemaVersion: typeof SCHEMA_VERSION;
  source: 'defect-intelligence';
  predictionId: string;
  predictedAt: string;
  evaluatedAt: string;
  predictions: DomainFilePrediction[];
  /** Predicted files that no longer exist in the project, left out. */
  missingFilesSkipped: number;
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function parseFilePrediction(raw: unknown): DomainFilePrediction | null {
  if (!isRecord(raw)) return null;
  const { file, probability, riskLevel } = raw;
  if (typeof file !== 'string' || file.length === 0) return null;
  if (typeof probability !== 'number' || !Number.isFinite(probability) || probability < 0 || probability > 1) return null;
  if (!RISK_LEVELS.includes(riskLevel as RiskLevel)) return null;
  const factors = Array.isArray(raw.factors)
    ? raw.factors.filter((f): f is { name: string; contribution: number } =>
      isRecord(f) && typeof f.name === 'string' && typeof f.contribution === 'number' && Number.isFinite(f.contribution))
    : [];
  const recommendations = Array.isArray(raw.recommendations)
    ? raw.recommendations.filter((r): r is string => typeof r === 'string')
    : [];
  return { file, probability, riskLevel: riskLevel as RiskLevel, factors, recommendations };
}

/** A recorded prediction run, or `null` when the record is not a usable one. */
function parsePredictionRecord(raw: unknown, now: number):
  { id: string; timestamp: string; predictions: DomainFilePrediction[] } | null {
  if (!isRecord(raw) || typeof raw.id !== 'string' || typeof raw.timestamp !== 'string') return null;
  const t = Date.parse(raw.timestamp);
  if (!Number.isFinite(t) || t > now + 60_000 || now - t > MAX_PREDICTION_AGE_MS) return null;
  if (!Array.isArray(raw.predictions) || raw.predictions.length === 0) return null;
  const predictions = raw.predictions.map(parseFilePrediction);
  if (predictions.some((p) => p === null)) return null;
  return { id: raw.id, timestamp: raw.timestamp, predictions: predictions as DomainFilePrediction[] };
}

export class DefectPredictorWorker extends BaseWorker {
  constructor() {
    super(CONFIG);
  }

  protected async doExecute(context: WorkerContext): Promise<WorkerResult> {
    const startTime = Date.now();
    context.logger.info('Starting defect prediction analysis');

    const findings: WorkerFinding[] = [];
    const recommendations: WorkerRecommendation[] = [];

    const latest = await this.readLatestPrediction(context);

    if (!latest) {
      findings.push({
        type: 'defect-prediction-unmeasured',
        severity: 'info',
        domain: 'defect-intelligence',
        title: 'Defect Prediction Unmeasured',
        description: 'No defect prediction for files in this project has been recorded in the last 7 days, so no ' +
          'risk is reported and nothing was stored. Run defect_predict on the files to assess.',
      });
      context.logger.info('Defect prediction complete', { measured: false });
      return this.createResult(
        Date.now() - startTime,
        {
          itemsAnalyzed: 0,
          issuesFound: 0,
          healthScore: 100,
          trend: 'stable',
          domainMetrics: {
            filesAnalyzed: 0,
            highRiskFiles: 0,
            hotspots: 'unmeasured',
            avgDefectProbability: 'unmeasured',
          },
        },
        findings,
        recommendations
      );
    }

    const { predictions } = latest;
    this.analyzeHighRiskPredictions(predictions, findings, recommendations);

    await context.memory.set(PREDICTIONS_KEY, latest);
    await context.memory.set('defect:lastAnalysis', latest.evaluatedAt);

    const healthScore = this.calculateHealthScore(predictions);
    const highRisk = predictions.filter(p => p.riskLevel === 'high' || p.riskLevel === 'critical').length;
    context.logger.info('Defect prediction complete', {
      measured: true,
      healthScore,
      predictionId: latest.predictionId,
      predictionsCount: predictions.length,
    });

    return this.createResult(
      Date.now() - startTime,
      {
        itemsAnalyzed: predictions.length,
        issuesFound: predictions.filter(p => p.probability > 0.5).length,
        healthScore,
        trend: 'stable',
        domainMetrics: {
          filesAnalyzed: predictions.length,
          highRiskFiles: highRisk,
          missingFilesSkipped: latest.missingFilesSkipped,
          hotspots: 'unmeasured',
          avgDefectProbability: (predictions.reduce((sum, p) => sum + p.probability, 0) / predictions.length).toFixed(2),
        },
      },
      findings,
      recommendations
    );
  }

  /**
   * #1043: the most recent prediction run the defect-intelligence predictor
   * recorded, restricted to files that exist in the project. `null` when there
   * is none or none of its files exist.
   */
  private async readLatestPrediction(context: WorkerContext): Promise<MeasuredDefectPredictions | null> {
    const keys = await context.memory.search(PREDICTION_KEY_PATTERN, MAX_PREDICTION_RECORDS, { namespace: DEFECT_NAMESPACE });
    const now = Date.now();
    let latest: ReturnType<typeof parsePredictionRecord> = null;
    for (const key of keys) {
      const parsed = parsePredictionRecord(await context.memory.get<unknown>(key, { namespace: DEFECT_NAMESPACE }), now);
      if (parsed && (!latest || Date.parse(parsed.timestamp) > Date.parse(latest.timestamp))) latest = parsed;
    }
    if (!latest) return null;

    const root = findProjectRoot();
    const existing = latest.predictions.filter((p) => {
      try {
        return fs.statSync(path.resolve(root, p.file)).isFile();
      } catch {
        return false;
      }
    });
    if (existing.length === 0) {
      context.logger.info('Latest defect prediction names no file that exists in the project', { predictionId: latest.id });
      return null;
    }
    return {
      measured: true,
      schemaVersion: SCHEMA_VERSION,
      source: 'defect-intelligence',
      predictionId: latest.id,
      predictedAt: latest.timestamp,
      evaluatedAt: new Date().toISOString(),
      predictions: existing,
      missingFilesSkipped: latest.predictions.length - existing.length,
    };
  }

  private analyzeHighRiskPredictions(
    predictions: DomainFilePrediction[],
    findings: WorkerFinding[],
    recommendations: WorkerRecommendation[]
  ): void {
    const critical = predictions.filter(p => p.riskLevel === 'critical');
    const high = predictions.filter(p => p.riskLevel === 'high');

    for (const prediction of [...critical, ...high]) {
      const name = prediction.file.split(/[\\/]/).pop();
      findings.push({
        type: `${prediction.riskLevel}-defect-risk`,
        severity: prediction.riskLevel as 'critical' | 'high',
        domain: 'defect-intelligence',
        title: `${prediction.riskLevel === 'critical' ? 'Critical' : 'High'} Defect Risk: ${name}`,
        description: `${(prediction.probability * 100).toFixed(0)}% predicted defect probability (defect-intelligence predictor)`,
        resource: prediction.file,
        context: {
          probability: prediction.probability,
          factors: prediction.factors,
          recommendations: prediction.recommendations,
        },
      });
    }

    if (critical.length === 0 && high.length === 0) return;

    recommendations.push({
      priority: 'p0',
      domain: 'defect-intelligence',
      action: 'Prioritize Code Review for High-Risk Files',
      description: `${critical.length + high.length} files have elevated predicted defect risk. Schedule focused code reviews.`,
      estimatedImpact: 'high',
      effort: 'medium',
      autoFixable: false,
    });

    const risky = [...critical, ...high];
    const complexity = risky.filter(p => p.factors.some(f => f.name === 'codeComplexity' && f.contribution > 0.1));
    if (complexity.length > 0) {
      recommendations.push({
        priority: 'p1',
        domain: 'defect-intelligence',
        action: 'Reduce Code Complexity',
        description: `${complexity.length} high-risk files have code complexity as a major risk factor. Consider refactoring.`,
        estimatedImpact: 'high',
        effort: 'high',
        autoFixable: false,
      });
    }

    const coverage = risky.filter(p => p.factors.some(f => f.name === 'testCoverage' && f.contribution > 0.1));
    if (coverage.length > 0) {
      recommendations.push({
        priority: 'p1',
        domain: 'defect-intelligence',
        action: 'Improve Test Coverage for Risky Files',
        description: `${coverage.length} high-risk files have low test coverage as a major risk factor. Add targeted tests.`,
        estimatedImpact: 'high',
        effort: 'medium',
        autoFixable: true,
      });
    }
  }

  private calculateHealthScore(predictions: DomainFilePrediction[]): number {
    if (predictions.length === 0) return 100;
    const avgProbability = predictions.reduce((sum, p) => sum + p.probability, 0) / predictions.length;
    const highRisk = predictions.filter(p => p.riskLevel === 'critical' || p.riskLevel === 'high').length;
    const score = (1 - avgProbability) * 80 - (highRisk / predictions.length) * 20 + 20;
    return Math.max(0, Math.min(100, Math.round(score)));
  }
}
