/**
 * Quality Assessment - RL Integration (Ruvector)
 * Extracted from coordinator.ts for CQ-004 (file size reduction)
 *
 * Contains: Actor-Critic RL, SONA pattern learning, Flash Attention initialization and methods
 */

import { toErrorMessage } from '../../shared/error-utils.js';
import type { DomainName } from '../../shared/types/index.js';
import type {
  RLState,
  RLAction,
  RLExperience,
} from '../../integrations/rl-suite/interfaces';
import { ActorCriticAlgorithm } from '../../integrations/rl-suite/algorithms/actor-critic';
import { PersistentSONAEngine, createPersistentSONAEngine } from '../../integrations/ruvector/sona-persistence.js';
import {
  QEFlashAttention,
  createQEFlashAttention,
} from '../../integrations/ruvector/wrappers';
import type {
  GateEvaluationRequest,
  GateResult,
  QualityAnalysisRequest,
  QualityReport,
  QualityMetrics,
} from './interfaces';
import type { DreamCycleCompletedPayload } from '../../shared/events/domain-events';

/**
 * RL-trained thresholds result
 */
export interface RLThresholdResult {
  thresholds: QualityGateThresholds;
  confidence: number;
  reasoning: string;
}

/**
 * Quality gate thresholds (for RL tuning)
 */
export interface QualityGateThresholds {
  coverage?: { min: number };
  testsPassing?: { min: number };
  criticalBugs?: { max: number };
  codeSmells?: { max: number };
  securityVulnerabilities?: { max: number };
  technicalDebt?: { max: number };
  duplications?: { max: number };
}

/**
 * Initialize Actor-Critic RL for quality gate threshold tuning
 */
export async function initializeActorCritic(): Promise<ActorCriticAlgorithm> {
  try {
    const actorCritic = new ActorCriticAlgorithm({
      stateSize: 10,
      actionSize: 4,
      actorHiddenLayers: [64, 64],
      criticHiddenLayers: [64, 64],
      actorLR: 0.0001,
      criticLR: 0.001,
      entropyCoeff: 0.01,
    });
    return actorCritic;
  } catch (error) {
    throw new Error(`Failed to initialize Actor-Critic RL: ${toErrorMessage(error)}`);
  }
}

/**
 * Initialize PersistentSONAEngine for quality pattern learning
 */
export async function initializeQESONA(): Promise<PersistentSONAEngine | undefined> {
  try {
    const qesona = await createPersistentSONAEngine({
      domain: 'quality-assessment',
      loadOnInit: true,
      autoSaveInterval: 60000,
      hiddenDim: 256,
      embeddingDim: 384,
      microLoraRank: 1,
      baseLoraRank: 8,
      minConfidence: 0.5,
      maxPatterns: 5000,
    });
    console.log('[quality-assessment] PersistentSONAEngine initialized successfully');
    return qesona;
  } catch (error) {
    console.error('[quality-assessment] Failed to initialize PersistentSONAEngine:', error);
    console.warn('[quality-assessment] Continuing without SONA pattern persistence');
    return undefined;
  }
}

/**
 * Initialize QEFlashAttention for similarity computations
 */
export async function initializeFlashAttention(): Promise<QEFlashAttention> {
  try {
    return await createQEFlashAttention('pattern-adaptation', {
      dim: 384,
      strategy: 'flash',
      blockSize: 32,
    });
  } catch (error) {
    throw new Error(`Failed to initialize QEFlashAttention: ${toErrorMessage(error)}`);
  }
}

/**
 * Use Actor-Critic RL to predict optimal quality gate thresholds
 */
export async function tuneThresholdsWithRL(
  actorCritic: ActorCriticAlgorithm,
  metrics: QualityMetrics
): Promise<RLThresholdResult | null> {
  try {
    const state: RLState = {
      id: `quality-state-${Date.now()}`,
      features: [
        metrics.coverage / 100,
        metrics.testsPassing / 100,
        metrics.criticalBugs / 10,
        metrics.codeSmells / 50,
        metrics.securityVulnerabilities / 10,
        metrics.technicalDebt / 20,
        metrics.duplications / 20,
      ],
    };

    const prediction = await actorCritic.predict(state);

    const baseThresholds: QualityGateThresholds = {
      coverage: { min: 80 },
      testsPassing: { min: 95 },
      criticalBugs: { max: 0 },
      codeSmells: { max: 20 },
      securityVulnerabilities: { max: 0 },
      technicalDebt: { max: 5 },
      duplications: { max: 5 },
    };

    const tunedThresholds = applyActionToThresholds(baseThresholds, prediction.action);

    return {
      thresholds: tunedThresholds,
      confidence: prediction.confidence,
      reasoning: prediction.reasoning ?? '',
    };
  } catch (error) {
    console.error('RL threshold tuning failed:', error);
    return null;
  }
}

/**
 * Apply RL action to threshold adjustments
 */
export function applyActionToThresholds(
  thresholds: QualityGateThresholds,
  action: RLAction
): QualityGateThresholds {
  const adjusted = { ...thresholds };

  if (action.type === 'adjust-threshold' && typeof action.value === 'number') {
    const delta = action.value * 5;

    if (adjusted.coverage?.min !== undefined) {
      adjusted.coverage.min = Math.max(50, Math.min(100, adjusted.coverage.min + delta));
    }

    if (adjusted.codeSmells?.max !== undefined) {
      adjusted.codeSmells.max = Math.max(0, Math.min(100, adjusted.codeSmells.max - delta));
    }
  }

  return adjusted;
}

/**
 * Train Actor-Critic with quality gate evaluation results
 */
export async function trainActorCritic(
  actorCritic: ActorCriticAlgorithm,
  request: GateEvaluationRequest,
  result: GateResult
): Promise<void> {
  try {
    const state: RLState = {
      id: `quality-state-${Date.now()}`,
      features: [
        request.metrics.coverage / 100,
        request.metrics.testsPassing / 100,
        request.metrics.criticalBugs / 10,
        request.metrics.codeSmells / 50,
        request.metrics.securityVulnerabilities / 10,
        request.metrics.technicalDebt / 20,
        request.metrics.duplications / 20,
      ],
    };

    const action: RLAction = {
      type: 'evaluate-gate',
      value: result.overallScore,
    };

    const nextState: RLState = { ...state };

    let reward = 0;
    if (result.passed) {
      reward += result.overallScore / 100;
      if (result.overallScore >= 90) reward += 0.5;
      if (result.overallScore >= 95) reward += 0.5;
    } else {
      reward -= 0.5;
      const criticalFailures = result.checks.filter(
        c => !c.passed && c.severity === 'critical'
      ).length;
      reward -= criticalFailures * 0.2;
    }

    const experience: RLExperience = {
      state,
      action,
      nextState,
      reward: Math.max(-1, Math.min(1, reward)),
      done: true,
    };

    await actorCritic.train(experience);
  } catch (error) {
    console.error('Actor-Critic training failed:', error);
  }
}

/**
 * Store quality gate pattern in SONA for learning
 */
export async function storeQualityPattern(
  qesona: PersistentSONAEngine,
  request: GateEvaluationRequest,
  result: GateResult,
  domainName: DomainName
): Promise<void> {
  try {
    const state: RLState = {
      id: `quality-state-${Date.now()}`,
      features: [
        request.metrics.coverage,
        request.metrics.testsPassing,
        request.metrics.criticalBugs,
        request.metrics.codeSmells,
        request.metrics.securityVulnerabilities,
        request.metrics.technicalDebt,
        request.metrics.duplications,
      ],
    };

    const action: RLAction = {
      type: 'quality-gate-evaluation',
      value: result.passed ? 1 : 0,
    };

    qesona.createPattern(
      state,
      action,
      {
        reward: result.passed ? result.overallScore / 100 : -0.5,
        success: result.passed,
        quality: result.overallScore / 100,
      },
      'quality-assessment',
      domainName,
      {
        gateName: request.gateName,
        overallScore: result.overallScore,
        failedChecks: result.failedChecks,
      }
    );
  } catch (error) {
    console.error('Failed to store quality pattern in SONA:', error);
  }
}

/**
 * Store quality analysis pattern in SONA
 */
export async function storeQualityAnalysisPattern(
  qesona: PersistentSONAEngine,
  request: QualityAnalysisRequest,
  report: QualityReport,
  domainName: DomainName
): Promise<void> {
  try {
    const state: RLState = {
      id: `quality-analysis-${Date.now()}`,
      features: [
        report.score.overall,
        report.score.coverage,
        report.score.complexity,
        report.score.maintainability,
        report.metrics.length,
        request.sourceFiles.length,
      ],
    };

    const action: RLAction = {
      type: 'quality-analysis',
      value: report.score.overall,
    };

    qesona.createPattern(
      state,
      action,
      {
        reward: report.score.overall / 100,
        success: report.score.overall >= 70,
        quality: report.score.overall / 100,
      },
      'quality-assessment',
      domainName,
      {
        sourceFileCount: request.sourceFiles.length,
        recommendationCount: report.recommendations.length,
      }
    );
  } catch (error) {
    console.error('Failed to store quality analysis pattern in SONA:', error);
  }
}

/**
 * Enhance quality report with similarity-based pattern matching using Flash Attention
 */
export async function enhanceWithSimilarityPatterns(
  report: QualityReport,
  flashAttention: QEFlashAttention,
  qesona: PersistentSONAEngine,
  domainName: DomainName
): Promise<QualityReport | null> {
  try {
    const state: RLState = {
      id: `similarity-search-${Date.now()}`,
      features: [
        report.score.overall,
        report.score.coverage,
        report.score.complexity,
        report.score.maintainability,
      ],
    };

    const adaptation = await qesona.adaptPattern(
      state,
      'quality-assessment',
      domainName
    );

    if (!adaptation.success || !adaptation.pattern) {
      return null;
    }

    const additionalRecommendations: typeof report.recommendations = [];

    if (adaptation.pattern.metadata) {
      const meta = adaptation.pattern.metadata as {
        similarIssues?: string[];
        commonFixes?: string[];
      };

      if (meta.similarIssues && meta.similarIssues.length > 0) {
        additionalRecommendations.push({
          type: 'improvement',
          title: 'Similar Quality Patterns Found',
          description: `Found ${adaptation.similarity.toFixed(0)}% similar historical patterns: ${meta.similarIssues.slice(0, 3).join(', ')}`,
          impact: 'medium',
          effort: 'low',
        });
      }
    }

    return {
      ...report,
      recommendations: [...report.recommendations, ...additionalRecommendations],
    };
  } catch (error) {
    console.error('Failed to enhance with similarity patterns:', error);
    return null;
  }
}

/**
 * Create embedding from quality metrics for similarity search
 */
export function createMetricsEmbedding(report: QualityReport): Float32Array {
  const features = [
    report.score.overall / 100,
    report.score.coverage / 100,
    report.score.complexity / 100,
    report.score.maintainability / 100,
    report.score.security / 100,
    ...report.metrics.map(m => m.value / 100),
  ];

  while (features.length < 384) {
    features.push(0);
  }

  return new Float32Array(features.slice(0, 384));
}

/**
 * Encode a dream insight as feature vector for SONA pattern creation.
 */
export function encodeInsightAsFeatures(
  insight: DreamCycleCompletedPayload['insights'][0]
): number[] {
  const features: number[] = [];

  const typeMap: Record<string, number> = {
    pattern_merge: 0.2,
    novel_association: 0.4,
    optimization: 0.6,
    gap_detection: 0.8,
  };
  features.push(typeMap[insight.type] || 0.5);

  features.push(insight.confidenceScore);
  features.push(insight.noveltyScore);
  features.push(insight.actionable ? 1.0 : 0.0);
  features.push(Math.min(1, insight.sourceConcepts.length / 10));

  while (features.length < 384) {
    features.push(0);
  }

  return features.slice(0, 384);
}
