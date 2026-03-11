/**
 * Agentic QE v3 - Devil's Advocate Agent
 * ADR-064, Phase 2C: Core agent class that orchestrates challenge reviews
 *
 * The Devil's Advocate reviews outputs from other agents and challenges them
 * using pluggable strategies. It does not create tests or fix code -- it finds
 * what was missed, questions assumptions, and argues why gaps matter.
 *
 * @module agents/devils-advocate
 */

import type {
  ChallengeTarget,
  ChallengeTargetType,
  ChallengeResult,
  Challenge,
  ChallengeSeverity,
  ChallengeStrategy,
  ChallengeStrategyType,
  CleanJustification,
  DevilsAdvocateConfig,
  DevilsAdvocateStats,
  ReviewOutcome,
} from './types.js';
import {
  DEFAULT_DEVILS_ADVOCATE_CONFIG,
  MINIMUM_FINDING_WEIGHTS,
  SEVERITY_ORDER,
  SEVERITY_WEIGHTS,
} from './types.js';
import { createAllStrategies, getApplicableStrategies } from './strategies.js';

// ============================================================================
// DevilsAdvocate Agent
// ============================================================================

/**
 * The Devil's Advocate agent reviews other agents' outputs and produces
 * structured challenges identifying gaps, weaknesses, and questionable results.
 *
 * @example
 * ```typescript
 * const da = new DevilsAdvocate();
 *
 * const result = da.review({
 *   type: 'test-generation',
 *   agentId: 'test-gen-001',
 *   domain: 'test-generation',
 *   output: { testCount: 5, tests: [...] },
 *   timestamp: Date.now(),
 * });
 *
 * console.log(result.summary);
 * for (const challenge of result.challenges) {
 *   console.log(`[${challenge.severity}] ${challenge.title}`);
 * }
 * ```
 */
export class DevilsAdvocate {
  private readonly config: DevilsAdvocateConfig;
  private readonly strategies: ChallengeStrategy[];
  private reviewCount = 0;
  private totalChallengeCount = 0;
  private scoreAccumulator = 0;
  private readonly severityCounts: Record<ChallengeSeverity, number>;
  private readonly categoryCounts: Record<string, number>;

  /**
   * Create a new Devil's Advocate agent.
   *
   * @param config - Optional partial configuration (merged with defaults)
   */
  constructor(config?: Partial<DevilsAdvocateConfig>) {
    this.config = {
      ...DEFAULT_DEVILS_ADVOCATE_CONFIG,
      ...config,
      enabledStrategies: config?.enabledStrategies ?? DEFAULT_DEVILS_ADVOCATE_CONFIG.enabledStrategies,
    };

    this.strategies = createAllStrategies();

    this.severityCounts = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      informational: 0,
    };
    this.categoryCounts = {};
  }

  /**
   * Review an agent's output and produce challenges.
   *
   * The review process:
   * 1. Gets all applicable strategies for the target type
   * 2. Filters to enabled strategies
   * 3. Runs each strategy against the target
   * 4. Collects all challenges
   * 5. Filters by minConfidence and minSeverity
   * 6. Sorts by severity (critical first)
   * 7. Limits to maxChallengesPerReview
   * 8. Computes overall score
   * 9. Generates summary
   *
   * @param target - The output to challenge
   * @returns A ChallengeResult with all findings
   */
  review(target: ChallengeTarget): ChallengeResult {
    const startTime = Date.now();

    // 1-2: Get applicable + enabled strategies
    const applicable = this.getStrategiesFor(target.type);

    // 3: Run each strategy and collect challenges
    const allChallenges: Challenge[] = [];
    for (const strategy of applicable) {
      try {
        const found = strategy.challenge(target);
        allChallenges.push(...found);
      } catch {
        // Strategy failure should not abort the entire review.
        // Silently skip the failing strategy.
      }
    }

    // 4-5: Filter by confidence and severity
    const minSeverityIndex = SEVERITY_ORDER.indexOf(this.config.minSeverity);
    let filtered = allChallenges.filter(c => {
      if (c.confidence < this.config.minConfidence) return false;
      const severityIndex = SEVERITY_ORDER.indexOf(c.severity);
      return severityIndex <= minSeverityIndex;
    });

    // 5a: Calculate weighted finding score
    let weightedScore = this.calculateWeightedScore(filtered);

    // 5b: If below minimum, run second pass with all strategies and lower confidence
    if (weightedScore < this.config.minimumFindings) {
      const secondPassChallenges = this.runSecondPass(target);

      // Merge new challenges, deduplicating by title
      const existingTitles = new Set(filtered.map(c => c.title));
      for (const challenge of secondPassChallenges) {
        if (!existingTitles.has(challenge.title)) {
          filtered.push(challenge);
          existingTitles.add(challenge.title);
        }
      }

      // Recalculate weighted score
      weightedScore = this.calculateWeightedScore(filtered);
    }

    // 5c: Determine if minimum was met and build clean justification if needed
    const minimumMet = weightedScore >= this.config.minimumFindings;
    let cleanJustification: CleanJustification | undefined;

    if (!minimumMet) {
      cleanJustification = {
        isClean: true,
        filesExamined: [],
        patternsChecked: [],
        toolsRun: applicable.map(s => s.type),
        reasoning: 'Review completed under minimum threshold after first and second pass analysis.',
      };
    }

    // 6: Sort by severity (critical first), then by confidence descending
    const sorted = filtered.sort((a, b) => {
      const sevDiff = SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity);
      if (sevDiff !== 0) return sevDiff;
      return b.confidence - a.confidence;
    });

    // 7: Limit to max challenges
    const limited = sorted.slice(0, this.config.maxChallengesPerReview);

    // 8: Compute overall score (factor in minimum met status)
    let overallScore = this.computeScore(limited);
    if (!minimumMet && !cleanJustification) {
      // Reduce score when minimum not met and no justification provided
      overallScore = Math.max(0, overallScore * 0.8);
    }

    // 9: Generate summary
    const summary = this.generateSummary(target, limited, overallScore);

    const reviewDuration = Date.now() - startTime;

    // Update internal statistics
    this.updateStats(limited, overallScore);

    return {
      targetType: target.type,
      targetAgentId: target.agentId,
      challenges: limited,
      overallScore,
      summary,
      timestamp: Date.now(),
      reviewDuration,
      cleanJustification,
      weightedFindingScore: weightedScore,
      minimumMet,
    };
  }

  /**
   * Get applicable and enabled strategies for a target type.
   *
   * @param targetType - The type of output to find strategies for
   * @returns Array of strategies that can review this target type
   */
  getStrategiesFor(targetType: ChallengeTargetType): ChallengeStrategy[] {
    const applicable = getApplicableStrategies(this.strategies, targetType);
    const enabledSet = new Set<ChallengeStrategyType>(this.config.enabledStrategies);
    return applicable.filter(s => enabledSet.has(s.type));
  }

  /**
   * Get accumulated review statistics.
   *
   * @returns Current statistics snapshot
   */
  getStats(): DevilsAdvocateStats {
    return {
      totalReviews: this.reviewCount,
      totalChallenges: this.totalChallengeCount,
      challengesBySeverity: { ...this.severityCounts },
      challengesByCategory: { ...this.categoryCounts },
      averageChallengesPerReview:
        this.reviewCount > 0 ? this.totalChallengeCount / this.reviewCount : 0,
      averageScore:
        this.reviewCount > 0 ? this.scoreAccumulator / this.reviewCount : 1,
    };
  }

  /**
   * Reset all accumulated statistics.
   */
  resetStats(): void {
    this.reviewCount = 0;
    this.totalChallengeCount = 0;
    this.scoreAccumulator = 0;
    for (const key of SEVERITY_ORDER) {
      this.severityCounts[key] = 0;
    }
    for (const key of Object.keys(this.categoryCounts)) {
      delete this.categoryCounts[key];
    }
  }

  /**
   * Record the outcome of a review for learning feedback.
   * Captures which challenges were accepted or dismissed.
   *
   * @param result - The challenge result from a review
   * @param accepted - Array of booleans indicating acceptance per challenge
   * @returns A ReviewOutcome for storage in the learning system
   */
  recordOutcome(result: ChallengeResult, accepted: boolean[]): ReviewOutcome {
    return {
      targetType: result.targetType,
      targetAgentId: result.targetAgentId,
      challengeCount: result.challenges.length,
      acceptedCount: accepted.filter(Boolean).length,
      dismissedCount: accepted.filter(a => !a).length,
      severityBreakdown: result.challenges.reduce((acc, c) => {
        acc[c.severity] = (acc[c.severity] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      minimumMet: result.minimumMet ?? true,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Calculate the weighted finding score based on severity weights.
   *
   * @param challenges - The challenges to score
   * @returns The weighted score sum
   */
  private calculateWeightedScore(challenges: readonly Challenge[]): number {
    if (this.config.minimumFindingsMode === 'count') {
      return challenges.length;
    }
    let score = 0;
    for (const challenge of challenges) {
      score += MINIMUM_FINDING_WEIGHTS[challenge.severity] ?? 0.25;
    }
    return score;
  }

  /**
   * Run a second pass with all strategies and halved minConfidence
   * to surface additional findings when the first pass falls below minimum.
   *
   * @param target - The challenge target to re-analyze
   * @returns Additional challenges found in the second pass
   */
  private runSecondPass(target: ChallengeTarget): Challenge[] {
    const allStrategies = getApplicableStrategies(this.strategies, target.type);
    const halvedConfidence = this.config.minConfidence / 2;
    const minSeverityIndex = SEVERITY_ORDER.indexOf(this.config.minSeverity);
    const secondPassChallenges: Challenge[] = [];

    for (const strategy of allStrategies) {
      try {
        const found = strategy.challenge(target);
        for (const c of found) {
          if (c.confidence < halvedConfidence) continue;
          const severityIndex = SEVERITY_ORDER.indexOf(c.severity);
          if (severityIndex <= minSeverityIndex) {
            secondPassChallenges.push(c);
          }
        }
      } catch {
        // Strategy failure should not abort the second pass.
      }
    }

    return secondPassChallenges;
  }

  /**
   * Compute the overall score based on challenges found.
   * Score is 1.0 minus the weighted impact of all challenges.
   * A score of 1.0 means no challenges were found.
   * A score of 0.0 means maximum challenge impact.
   */
  private computeScore(challenges: readonly Challenge[]): number {
    if (challenges.length === 0) return 1.0;

    let totalImpact = 0;
    for (const challenge of challenges) {
      const weight = SEVERITY_WEIGHTS[challenge.severity] ?? 0.01;
      totalImpact += weight * challenge.confidence;
    }

    // Clamp to [0, 1]
    return Math.max(0, Math.min(1, 1 - totalImpact));
  }

  /**
   * Generate a human-readable summary of the review.
   */
  private generateSummary(
    target: ChallengeTarget,
    challenges: readonly Challenge[],
    score: number,
  ): string {
    if (challenges.length === 0) {
      return (
        `Review of ${target.type} output from agent "${target.agentId}" ` +
        `found no significant challenges. Score: ${score.toFixed(2)}.`
      );
    }

    const bySeverity = this.countBySeverity(challenges);
    const severityParts: string[] = [];
    for (const sev of SEVERITY_ORDER) {
      const count = bySeverity[sev];
      if (count > 0) {
        severityParts.push(`${count} ${sev}`);
      }
    }

    return (
      `Review of ${target.type} output from agent "${target.agentId}" ` +
      `raised ${challenges.length} challenge(s): ${severityParts.join(', ')}. ` +
      `Overall score: ${score.toFixed(2)}.`
    );
  }

  /**
   * Count challenges grouped by severity.
   */
  private countBySeverity(
    challenges: readonly Challenge[],
  ): Record<ChallengeSeverity, number> {
    const counts: Record<ChallengeSeverity, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      informational: 0,
    };
    for (const c of challenges) {
      counts[c.severity]++;
    }
    return counts;
  }

  /**
   * Update internal statistics after a review.
   */
  private updateStats(challenges: readonly Challenge[], score: number): void {
    this.reviewCount++;
    this.totalChallengeCount += challenges.length;
    this.scoreAccumulator += score;

    for (const c of challenges) {
      this.severityCounts[c.severity]++;
      this.categoryCounts[c.category] = (this.categoryCounts[c.category] ?? 0) + 1;
    }
  }
}
