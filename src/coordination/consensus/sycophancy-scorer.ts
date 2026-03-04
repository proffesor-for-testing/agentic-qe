/**
 * Sycophancy Scorer - Detects rubber-stamping in multi-agent consensus
 * Inspired by loki-mode anti-sycophancy detection
 *
 * Uses 4 weighted signals to detect when agents agree too uniformly:
 * 1. Verdict Unanimity (30%) - all votes same verdict
 * 2. Reasoning Similarity (30%) - Jaccard on tokenized justifications
 * 3. Confidence Uniformity (20%) - std dev of confidence scores
 * 4. Issue Count Consistency (20%) - variation in reported suggestion counts
 *
 * @see docs/plans/loki-mode-integration.md
 */

import type { ModelVote } from './interfaces.js';

// ============================================================================
// Types
// ============================================================================

/**
 * A single signal contributing to sycophancy detection
 */
export interface SycophancySignal {
  /** Name of the signal */
  readonly name: string;
  /** Weight of this signal in the composite score (0-1) */
  readonly weight: number;
  /** Raw score for this signal (0-1, higher = more sycophantic) */
  readonly score: number;
}

/**
 * Classification of sycophancy severity
 */
export type SycophancyLevel = 'independent' | 'mild' | 'moderate' | 'severe';

/**
 * Result of sycophancy evaluation
 */
export interface SycophancyResult {
  /** Classification level */
  readonly level: SycophancyLevel;
  /** Composite score (0-1, higher = more sycophantic) */
  readonly compositeScore: number;
  /** Individual signal breakdowns */
  readonly signals: readonly SycophancySignal[];
  /** Human-readable recommendation */
  readonly recommendation: string;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Calculate Jaccard similarity between two strings based on word tokens
 */
function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const setB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

/**
 * Calculate standard deviation of a number array
 */
function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const squaredDiffs = values.map(v => (v - mean) ** 2);
  const variance = squaredDiffs.reduce((sum, v) => sum + v, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Classify composite score into a sycophancy level
 */
function classifyLevel(score: number): SycophancyLevel {
  if (score >= 0.7) return 'severe';
  if (score >= 0.5) return 'moderate';
  if (score >= 0.3) return 'mild';
  return 'independent';
}

/**
 * Generate a recommendation string based on the sycophancy level
 */
function generateRecommendation(level: SycophancyLevel): string {
  switch (level) {
    case 'independent':
      return 'Votes appear independent. No action needed.';
    case 'mild':
      return 'Slight agreement bias detected. Consider monitoring for patterns.';
    case 'moderate':
      return 'Moderate rubber-stamping detected. Consider adding diverse model providers or requesting re-evaluation with varied prompts.';
    case 'severe':
      return 'Severe rubber-stamping detected. Recommend human review and adding independent model providers with different architectures.';
  }
}

// ============================================================================
// Signal Calculators
// ============================================================================

/**
 * Signal 1: Verdict Unanimity (weight: 0.30)
 * Score is 1.0 if all votes agree, 0.0 if evenly split.
 */
function calculateVerdictUnanimity(votes: ModelVote[]): number {
  if (votes.length < 2) return 0;
  const agreesCount = votes.filter(v => v.agrees).length;
  const ratio = agreesCount / votes.length;
  // Distance from 0.5 (perfect split), normalized to 0-1
  // ratio=1.0 or 0.0 -> score=1.0, ratio=0.5 -> score=0.0
  return Math.abs(ratio - 0.5) * 2;
}

/**
 * Signal 2: Reasoning Similarity (weight: 0.30)
 * Average pairwise Jaccard similarity across all vote reasoning strings.
 */
function calculateReasoningSimilarity(votes: ModelVote[]): number {
  if (votes.length < 2) return 0;

  const reasonings = votes.map(v => v.reasoning).filter(r => r.length > 0);
  if (reasonings.length < 2) return 0;

  let totalSimilarity = 0;
  let pairCount = 0;

  for (let i = 0; i < reasonings.length; i++) {
    for (let j = i + 1; j < reasonings.length; j++) {
      totalSimilarity += jaccardSimilarity(reasonings[i], reasonings[j]);
      pairCount++;
    }
  }

  return pairCount === 0 ? 0 : totalSimilarity / pairCount;
}

/**
 * Signal 3: Confidence Uniformity (weight: 0.20)
 * Low standard deviation in confidence scores indicates potential groupthink.
 * Score is inverted: low std dev -> high score.
 */
function calculateConfidenceUniformity(votes: ModelVote[]): number {
  if (votes.length < 2) return 0;

  const confidences = votes.map(v => v.confidence);
  const stdDev = standardDeviation(confidences);

  // Max possible std dev for values in [0,1] is 0.5 (half at 0, half at 1)
  // Normalize: 0 std dev -> 1.0 score, 0.5 std dev -> 0.0 score
  return Math.max(0, 1 - stdDev * 2);
}

/**
 * Signal 4: Issue Count Consistency (weight: 0.20)
 * Low variation in the number of suggestions reported by each model.
 * Score is inverted: low variation -> high score.
 */
function calculateIssueCountConsistency(votes: ModelVote[]): number {
  if (votes.length < 2) return 0;

  const counts = votes.map(v => (v.suggestions?.length ?? 0));

  // If all counts are 0, this is mildly suspicious but not conclusive
  if (counts.every(c => c === 0)) return 0.5;

  const stdDev = standardDeviation(counts);
  const mean = counts.reduce((sum, c) => sum + c, 0) / counts.length;

  // Normalize using coefficient of variation, capped at 1
  if (mean === 0) return 0.5;
  const cv = stdDev / mean;
  // cv=0 -> score=1.0, cv>=1 -> score=0.0
  return Math.max(0, 1 - cv);
}

// ============================================================================
// SycophancyScorer Class
// ============================================================================

/**
 * Evaluates multi-agent consensus votes for signs of sycophantic agreement
 * (rubber-stamping). Uses 4 weighted signals to produce a composite score
 * and classification.
 */
export class SycophancyScorer {
  private readonly signalWeights: ReadonlyArray<{ name: string; weight: number; calculator: (votes: ModelVote[]) => number }>;

  constructor() {
    this.signalWeights = [
      { name: 'verdict-unanimity', weight: 0.30, calculator: calculateVerdictUnanimity },
      { name: 'reasoning-similarity', weight: 0.30, calculator: calculateReasoningSimilarity },
      { name: 'confidence-uniformity', weight: 0.20, calculator: calculateConfidenceUniformity },
      { name: 'issue-count-consistency', weight: 0.20, calculator: calculateIssueCountConsistency },
    ];
  }

  /**
   * Evaluate a set of model votes for sycophancy signals
   *
   * @param votes - Array of model votes to evaluate
   * @returns SycophancyResult with level, composite score, signals, and recommendation
   */
  evaluate(votes: ModelVote[]): SycophancyResult {
    // Edge case: 0 or 1 votes cannot exhibit sycophancy
    if (votes.length < 2) {
      return {
        level: 'independent',
        compositeScore: 0,
        signals: this.signalWeights.map(sw => ({
          name: sw.name,
          weight: sw.weight,
          score: 0,
        })),
        recommendation: 'Insufficient votes for sycophancy detection.',
      };
    }

    // Calculate each signal
    const signals: SycophancySignal[] = this.signalWeights.map(sw => ({
      name: sw.name,
      weight: sw.weight,
      score: sw.calculator(votes),
    }));

    // Compute weighted composite score
    const compositeScore = signals.reduce(
      (sum, signal) => sum + signal.weight * signal.score,
      0
    );

    const level = classifyLevel(compositeScore);
    const recommendation = generateRecommendation(level);

    return {
      level,
      compositeScore,
      signals,
      recommendation,
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new SycophancyScorer instance
 */
export function createSycophancyScorer(): SycophancyScorer {
  return new SycophancyScorer();
}
