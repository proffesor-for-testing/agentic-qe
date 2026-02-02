/**
 * Skill Validation Learner
 * ADR-056: Integrates skill validation with ReasoningBank
 *
 * This module bridges skill validation outcomes with the ReasoningBank learning system,
 * enabling:
 * - Pattern storage from successful validations
 * - Cross-model behavior tracking
 * - Skill confidence scoring based on validation history
 * - Integration with QualityFeedbackLoop for continuous improvement
 *
 * Memory Namespace Structure:
 * ```
 * aqe/skill-validation/
 * ├── skill-confidence-{skill}/   - Confidence scores per skill
 * ├── cross-model-{skill}/        - Cross-model behavior tracking
 * ├── patterns/                   - Validation patterns
 * │   ├── {skill-name}-validation-*  - Per-skill validation patterns
 * │   └── by-model/               - Patterns organized by model
 * └── trends/                     - Historical validation trends
 * ```
 *
 * @module learning/skill-validation-learner
 * @see .claude/skills/.validation/skill-validation-mcp-integration.md
 */

import type { RealQEReasoningBank } from './real-qe-reasoning-bank.js';
import type { QualityFeedbackLoop, RoutingOutcomeInput } from '../feedback/feedback-loop.js';
import type { QEPattern, QEPatternType } from './qe-patterns.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Trust tier levels for skill validation
 * Higher tiers indicate more rigorous validation
 */
export type SkillTrustTier = 1 | 2 | 3;

/**
 * Validation level representing the depth of validation performed
 */
export type ValidationLevel = 'schema' | 'validator' | 'eval';

/**
 * Result of a single test case within skill validation
 */
export interface TestCaseResult {
  /** Unique identifier for the test case */
  testId: string;

  /** Whether the test passed */
  passed: boolean;

  /** Expected patterns/keywords that should be present */
  expectedPatterns: string[];

  /** Actual patterns/keywords found in the output */
  actualPatterns: string[];

  /** Quality score for the reasoning in the output (0-1) */
  reasoningQuality: number;

  /** Execution time in milliseconds */
  executionTimeMs?: number;

  /** Test category (e.g., 'injection', 'auth', 'negative') */
  category?: string;

  /** Test priority */
  priority?: 'critical' | 'high' | 'medium' | 'low';

  /** Error message if test failed */
  error?: string;
}

/**
 * Complete outcome of a skill validation run
 */
export interface SkillValidationOutcome {
  /** Name of the skill being validated */
  skillName: string;

  /** Trust tier of the validation (1-3) */
  trustTier: SkillTrustTier;

  /** Level of validation performed */
  validationLevel: ValidationLevel;

  /** Model used for validation */
  model: string;

  /** Overall pass/fail result */
  passed: boolean;

  /** Aggregate score (0-1) */
  score: number;

  /** Individual test case results */
  testCaseResults: TestCaseResult[];

  /** When the validation occurred */
  timestamp: Date;

  /** Validation run ID for traceability */
  runId?: string;

  /** Additional metadata */
  metadata?: {
    version?: string;
    environment?: string;
    duration?: number;
    [key: string]: unknown;
  };
}

/**
 * Confidence tracking for a skill based on validation history
 */
export interface SkillConfidence {
  /** Name of the skill */
  skillName: string;

  /** Average score across all validation outcomes */
  avgScore: number;

  /** Recent validation outcomes (last 100) */
  outcomes: Array<{
    score: number;
    timestamp: Date;
    model: string;
    validationLevel?: ValidationLevel;
    passed?: boolean;
  }>;

  /** When confidence was last updated */
  lastUpdated: Date;

  /** Trend direction based on recent outcomes */
  trend?: 'improving' | 'stable' | 'declining';

  /** Confidence by validation level */
  byLevel?: {
    schema?: number;
    validator?: number;
    eval?: number;
  };
}

/**
 * Cross-model behavior analysis for a skill
 */
export interface CrossModelAnalysis {
  /** Model-specific data */
  models: Record<string, {
    scores: number[];
    passRate: number;
    avgReasoningQuality: number;
    sampleCount: number;
  }>;

  /** Variance across models (0 = identical behavior, 1 = maximum variance) */
  variance: number;

  /** Whether significant cross-model differences were detected */
  hasAnomalies: boolean;

  /** Specific anomalies detected */
  anomalies?: Array<{
    model: string;
    type: 'high_variance' | 'low_performance' | 'inconsistent';
    description: string;
  }>;

  /** When analysis was last updated */
  lastUpdated: Date;
}

/**
 * Learned pattern from skill validation
 */
export interface ValidationPattern {
  /** Pattern ID */
  id: string;

  /** Associated skill */
  skillName: string;

  /** Pattern category */
  category: string;

  /** Keywords/patterns that indicate success */
  successIndicators: string[];

  /** Keywords/patterns that indicate failure */
  failureIndicators: string[];

  /** Models where this pattern was observed */
  models: string[];

  /** Confidence in this pattern */
  confidence: number;

  /** Number of times observed */
  observationCount: number;
}

// ============================================================================
// Skill Validation Learner
// ============================================================================

/**
 * Skill Validation Learner
 *
 * Integrates skill validation outcomes with the ReasoningBank learning system.
 * Records validation outcomes, tracks confidence scores, and enables cross-model
 * behavior analysis.
 *
 * @example
 * ```typescript
 * const learner = createSkillValidationLearner(reasoningBank);
 *
 * // Record a validation outcome
 * await learner.recordValidationOutcome({
 *   skillName: 'security-testing',
 *   trustTier: 3,
 *   validationLevel: 'eval',
 *   model: 'claude-3.5-sonnet',
 *   passed: true,
 *   score: 0.92,
 *   testCaseResults: [...],
 *   timestamp: new Date(),
 * });
 *
 * // Get skill confidence
 * const confidence = await learner.getSkillConfidence('security-testing');
 * console.log(`Confidence: ${confidence?.avgScore}`);
 *
 * // Get cross-model analysis
 * const analysis = await learner.getCrossModelAnalysis('security-testing');
 * console.log(`Variance: ${analysis?.variance}`);
 * ```
 */
export class SkillValidationLearner {
  private readonly memoryNamespace = 'skill-validation';
  private feedbackLoop: QualityFeedbackLoop | null = null;

  constructor(
    private readonly reasoningBank: RealQEReasoningBank
  ) {}

  /**
   * Connect to QualityFeedbackLoop for integrated learning
   */
  connectFeedbackLoop(feedbackLoop: QualityFeedbackLoop): void {
    this.feedbackLoop = feedbackLoop;
  }

  /**
   * Record a validation outcome and update patterns
   *
   * This is the main entry point for recording skill validation results.
   * It will:
   * 1. Store a pattern in ReasoningBank
   * 2. Update skill confidence score
   * 3. Track cross-model behavior (for eval level)
   * 4. Optionally record to QualityFeedbackLoop
   */
  async recordValidationOutcome(outcome: SkillValidationOutcome): Promise<void> {
    // Store pattern for skill validation
    await this.reasoningBank.storeQEPattern({
      patternType: 'test-template' as QEPatternType,
      name: `${outcome.skillName}-validation-${outcome.validationLevel}`,
      description: `Validation outcome for ${outcome.skillName} at level ${outcome.validationLevel}`,
      context: {
        tags: ['skill-validation', outcome.skillName, outcome.model, outcome.validationLevel],
        testType: 'integration',
      },
      template: {
        type: 'config',
        content: JSON.stringify({
          outcome: {
            skillName: outcome.skillName,
            trustTier: outcome.trustTier,
            validationLevel: outcome.validationLevel,
            model: outcome.model,
            passed: outcome.passed,
            score: outcome.score,
            testCaseCount: outcome.testCaseResults.length,
            passedTests: outcome.testCaseResults.filter(t => t.passed).length,
            avgReasoningQuality: this.calculateAvgReasoningQuality(outcome.testCaseResults),
            timestamp: outcome.timestamp.toISOString(),
            runId: outcome.runId,
            metadata: outcome.metadata,
          },
        }),
        variables: [],
      },
    });

    // Update skill confidence score
    await this.updateSkillConfidence(outcome);

    // Track cross-model behavior if eval level
    if (outcome.validationLevel === 'eval') {
      await this.trackCrossModelBehavior(outcome);
    }

    // Record to feedback loop if connected
    if (this.feedbackLoop && outcome.runId) {
      await this.recordToFeedbackLoop(outcome);
    }
  }

  /**
   * Update skill confidence based on validation history
   */
  private async updateSkillConfidence(outcome: SkillValidationOutcome): Promise<void> {
    const key = `skill-confidence-${outcome.skillName}`;

    // Try to get existing confidence data via pattern search
    const existingPatterns = await this.reasoningBank.searchQEPatterns(key, { limit: 1 });
    let history: SkillConfidence;

    if (existingPatterns.success && existingPatterns.value.length > 0) {
      try {
        const pattern = existingPatterns.value[0].pattern;
        const templateContent = pattern.template?.content;
        if (templateContent) {
          const parsed = JSON.parse(templateContent);
          // Validate that it has the expected structure
          if (parsed && typeof parsed === 'object' && Array.isArray(parsed.outcomes)) {
            history = parsed;
          } else {
            history = this.createEmptyConfidence(outcome.skillName);
          }
        } else {
          history = this.createEmptyConfidence(outcome.skillName);
        }
      } catch {
        history = this.createEmptyConfidence(outcome.skillName);
      }
    } else {
      history = this.createEmptyConfidence(outcome.skillName);
    }

    // Add new outcome
    history.outcomes.push({
      score: outcome.score,
      timestamp: outcome.timestamp,
      model: outcome.model,
      validationLevel: outcome.validationLevel,
      passed: outcome.passed,
    });

    // Keep last 100 outcomes
    if (history.outcomes.length > 100) {
      history.outcomes = history.outcomes.slice(-100);
    }

    // Calculate rolling average
    history.avgScore = history.outcomes.reduce((sum, o) => sum + o.score, 0) / history.outcomes.length;
    history.lastUpdated = new Date();

    // Calculate trend from last 10 outcomes
    history.trend = this.calculateTrend(history.outcomes);

    // Calculate confidence by level
    history.byLevel = this.calculateConfidenceByLevel(history.outcomes);

    // Store updated confidence as a pattern
    await this.reasoningBank.storeQEPattern({
      patternType: 'test-template' as QEPatternType,
      name: key,
      description: `Skill confidence tracking for ${outcome.skillName}`,
      context: {
        tags: ['skill-confidence', outcome.skillName],
      },
      template: {
        type: 'config',
        content: JSON.stringify(history),
        variables: [],
      },
    });
  }

  /**
   * Track cross-model behavior differences
   */
  private async trackCrossModelBehavior(outcome: SkillValidationOutcome): Promise<void> {
    const key = `cross-model-${outcome.skillName}`;

    // Try to get existing cross-model data
    const existingPatterns = await this.reasoningBank.searchQEPatterns(key, { limit: 1 });
    let crossModel: CrossModelAnalysis;

    if (existingPatterns.success && existingPatterns.value.length > 0) {
      try {
        const pattern = existingPatterns.value[0].pattern;
        const templateContent = pattern.template?.content;
        if (templateContent) {
          const parsed = JSON.parse(templateContent);
          // Validate that it has the expected structure
          if (parsed && typeof parsed === 'object' && typeof parsed.models === 'object') {
            crossModel = parsed;
          } else {
            crossModel = this.createEmptyCrossModelAnalysis();
          }
        } else {
          crossModel = this.createEmptyCrossModelAnalysis();
        }
      } catch {
        crossModel = this.createEmptyCrossModelAnalysis();
      }
    } else {
      crossModel = this.createEmptyCrossModelAnalysis();
    }

    // Ensure models object exists (defensive)
    if (!crossModel.models) {
      crossModel.models = {};
    }

    // Initialize model data if needed
    if (!crossModel.models[outcome.model]) {
      crossModel.models[outcome.model] = {
        scores: [],
        passRate: 0,
        avgReasoningQuality: 0,
        sampleCount: 0,
      };
    }

    const modelData = crossModel.models[outcome.model];
    modelData.scores.push(outcome.score);
    modelData.sampleCount++;

    // Keep last 50 scores per model
    if (modelData.scores.length > 50) {
      modelData.scores = modelData.scores.slice(-50);
    }

    // Calculate pass rate per model
    const avgReasoningQuality = this.calculateAvgReasoningQuality(outcome.testCaseResults);
    modelData.passRate = modelData.scores.filter(s => s >= 0.9).length / modelData.scores.length;
    modelData.avgReasoningQuality = (modelData.avgReasoningQuality * (modelData.sampleCount - 1) + avgReasoningQuality) / modelData.sampleCount;

    // Detect anomalies (model behavior significantly different)
    const allPassRates = Object.values(crossModel.models).map(m => m.passRate);
    if (allPassRates.length > 1) {
      const avgPassRate = allPassRates.reduce((a, b) => a + b, 0) / allPassRates.length;
      const variance = allPassRates.reduce((sum, r) => sum + Math.pow(r - avgPassRate, 2), 0) / allPassRates.length;

      crossModel.variance = variance;
      crossModel.hasAnomalies = variance > 0.04; // >20% std dev

      // Identify specific anomalies
      crossModel.anomalies = [];
      for (const [model, data] of Object.entries(crossModel.models)) {
        if (Math.abs(data.passRate - avgPassRate) > 0.2) {
          crossModel.anomalies.push({
            model,
            type: data.passRate < avgPassRate ? 'low_performance' : 'high_variance',
            description: `Model ${model} has ${((data.passRate - avgPassRate) * 100).toFixed(1)}% difference from average`,
          });
        }
      }
    }

    crossModel.lastUpdated = new Date();

    // Store updated cross-model analysis
    await this.reasoningBank.storeQEPattern({
      patternType: 'test-template' as QEPatternType,
      name: key,
      description: `Cross-model behavior tracking for ${outcome.skillName}`,
      context: {
        tags: ['cross-model', outcome.skillName],
      },
      template: {
        type: 'config',
        content: JSON.stringify(crossModel),
        variables: [],
      },
    });
  }

  /**
   * Record outcome to QualityFeedbackLoop for integrated learning
   */
  private async recordToFeedbackLoop(outcome: SkillValidationOutcome): Promise<void> {
    if (!this.feedbackLoop) return;

    const routingInput: RoutingOutcomeInput = {
      taskId: outcome.runId!,
      taskDescription: `Skill validation: ${outcome.skillName} (${outcome.validationLevel})`,
      recommendedAgent: 'skill-validator',
      usedAgent: 'skill-validator',
      followedRecommendation: true,
      success: outcome.passed,
      qualityScore: outcome.score,
      durationMs: outcome.metadata?.duration as number || 0,
      timestamp: outcome.timestamp,
    };

    await this.feedbackLoop.recordRoutingOutcome(routingInput);
  }

  /**
   * Get skill confidence score
   */
  async getSkillConfidence(skillName: string): Promise<SkillConfidence | null> {
    const key = `skill-confidence-${skillName}`;
    const patterns = await this.reasoningBank.searchQEPatterns(key, { limit: 1 });

    if (patterns.success && patterns.value.length > 0) {
      try {
        const templateContent = patterns.value[0].pattern.template?.content;
        if (templateContent) {
          return JSON.parse(templateContent);
        }
      } catch {
        // Pattern exists but content is invalid
      }
    }

    return null;
  }

  /**
   * Get cross-model analysis for a skill
   */
  async getCrossModelAnalysis(skillName: string): Promise<CrossModelAnalysis | null> {
    const key = `cross-model-${skillName}`;
    const patterns = await this.reasoningBank.searchQEPatterns(key, { limit: 1 });

    if (patterns.success && patterns.value.length > 0) {
      try {
        const templateContent = patterns.value[0].pattern.template?.content;
        if (templateContent) {
          return JSON.parse(templateContent);
        }
      } catch {
        // Pattern exists but content is invalid
      }
    }

    return null;
  }

  /**
   * Query validation patterns for a skill
   */
  async queryValidationPatterns(skillName: string, limit = 10): Promise<QEPattern[]> {
    const patterns = await this.reasoningBank.searchQEPatterns(
      `${skillName} validation`,
      { limit }
    );

    if (patterns.success) {
      return patterns.value
        .filter(p => p.pattern.context?.tags?.includes('skill-validation'))
        .map(p => p.pattern);
    }

    return [];
  }

  /**
   * Get validation trends for a skill over time
   */
  async getValidationTrends(skillName: string): Promise<{
    overall: 'improving' | 'stable' | 'declining';
    byModel: Record<string, 'improving' | 'stable' | 'declining'>;
    recentPassRate: number;
  } | null> {
    const confidence = await this.getSkillConfidence(skillName);
    const crossModel = await this.getCrossModelAnalysis(skillName);

    if (!confidence) return null;

    // Calculate by-model trends
    const byModel: Record<string, 'improving' | 'stable' | 'declining'> = {};
    if (crossModel) {
      for (const model of Object.keys(crossModel.models)) {
        const modelOutcomes = confidence.outcomes
          .filter(o => o.model === model)
          .map(o => ({ score: o.score }));
        byModel[model] = this.calculateTrend(modelOutcomes);
      }
    }

    // Calculate recent pass rate (last 20 outcomes)
    const recent = confidence.outcomes.slice(-20);
    const recentPassRate = recent.filter(o => o.passed).length / recent.length;

    return {
      overall: confidence.trend || 'stable',
      byModel,
      recentPassRate,
    };
  }

  /**
   * Extract learned patterns from validation outcomes
   *
   * Analyzes validation outcomes to identify successful/failure indicators
   * that can be used to improve future validations.
   */
  async extractLearnedPatterns(skillName: string): Promise<ValidationPattern[]> {
    const patterns = await this.queryValidationPatterns(skillName, 50);
    const learnedPatterns: ValidationPattern[] = [];

    // Group by category
    const byCategory = new Map<string, QEPattern[]>();

    for (const pattern of patterns) {
      try {
        const content = JSON.parse(pattern.template?.content || '{}');
        const category = content.outcome?.metadata?.category || 'general';
        if (!byCategory.has(category)) {
          byCategory.set(category, []);
        }
        byCategory.get(category)!.push(pattern);
      } catch {
        // Skip invalid patterns
      }
    }

    // Extract patterns from each category
    for (const [category, categoryPatterns] of Array.from(byCategory.entries())) {
      const successIndicators = new Set<string>();
      const failureIndicators = new Set<string>();
      const models = new Set<string>();
      let totalScore = 0;

      for (const pattern of categoryPatterns) {
        try {
          const content = JSON.parse(pattern.template?.content || '{}');
          const outcome = content.outcome;
          if (!outcome) continue;

          models.add(outcome.model);
          totalScore += outcome.score;

          // Extract indicators from tags
          const tags = pattern.context?.tags || [];
          if (outcome.passed) {
            tags.filter((t: string) => !['skill-validation', skillName].includes(t))
              .forEach((t: string) => successIndicators.add(t));
          } else {
            tags.filter((t: string) => !['skill-validation', skillName].includes(t))
              .forEach((t: string) => failureIndicators.add(t));
          }
        } catch {
          // Skip invalid patterns
        }
      }

      if (categoryPatterns.length > 0) {
        learnedPatterns.push({
          id: `${skillName}-${category}`,
          skillName,
          category,
          successIndicators: Array.from(successIndicators),
          failureIndicators: Array.from(failureIndicators),
          models: Array.from(models),
          confidence: totalScore / categoryPatterns.length,
          observationCount: categoryPatterns.length,
        });
      }
    }

    return learnedPatterns;
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private createEmptyConfidence(skillName: string): SkillConfidence {
    return {
      skillName,
      avgScore: 0,
      outcomes: [],
      lastUpdated: new Date(),
    };
  }

  private createEmptyCrossModelAnalysis(): CrossModelAnalysis {
    return {
      models: {},
      variance: 0,
      hasAnomalies: false,
      lastUpdated: new Date(),
    };
  }

  private calculateAvgReasoningQuality(results: TestCaseResult[]): number {
    if (results.length === 0) return 0;
    return results.reduce((sum, r) => sum + r.reasoningQuality, 0) / results.length;
  }

  private calculateTrend(outcomes: Array<{ score: number }>): 'improving' | 'stable' | 'declining' {
    if (outcomes.length < 5) return 'stable';

    const recent = outcomes.slice(-10);
    const older = outcomes.slice(-20, -10);

    if (older.length === 0) return 'stable';

    const recentAvg = recent.reduce((sum, o) => sum + o.score, 0) / recent.length;
    const olderAvg = older.reduce((sum, o) => sum + o.score, 0) / older.length;

    const diff = recentAvg - olderAvg;

    if (diff > 0.05) return 'improving';
    if (diff < -0.05) return 'declining';
    return 'stable';
  }

  private calculateConfidenceByLevel(outcomes: Array<{ score: number; validationLevel?: ValidationLevel }>): {
    schema?: number;
    validator?: number;
    eval?: number;
  } {
    const byLevel: Record<ValidationLevel, number[]> = {
      schema: [],
      validator: [],
      eval: [],
    };

    for (const outcome of outcomes) {
      if (outcome.validationLevel) {
        byLevel[outcome.validationLevel].push(outcome.score);
      }
    }

    const result: { schema?: number; validator?: number; eval?: number } = {};

    for (const [level, scores] of Object.entries(byLevel)) {
      if (scores.length > 0) {
        result[level as ValidationLevel] = scores.reduce((a, b) => a + b, 0) / scores.length;
      }
    }

    return result;
  }
}

/**
 * Create a SkillValidationLearner instance
 */
export function createSkillValidationLearner(
  reasoningBank: RealQEReasoningBank
): SkillValidationLearner {
  return new SkillValidationLearner(reasoningBank);
}
