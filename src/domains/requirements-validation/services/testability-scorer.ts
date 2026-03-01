/**
 * Agentic QE v3 - Testability Scorer Service
 * Evaluates how testable requirements are
 */

import { Result, ok, err } from '../../../shared/types/index.js';
import { MemoryBackend } from '../../../kernel/interfaces.js';
import { toError } from '../../../shared/error-utils.js';
import {
  ITestabilityScoringService,
  Requirement,
  TestabilityScore,
  TestabilityFactor,
} from '../interfaces.js';

/**
 * Configuration for the testability scorer
 */
export interface TestabilityScorerConfig {
  defaultThreshold: number;
  weights: FactorWeights;
  enableAIScoring: boolean;
}

/**
 * Factor weights for testability calculation
 */
export interface FactorWeights {
  specificity: number;
  measurability: number;
  atomicity: number;
  feasibility: number;
  traceability: number;
  independency: number;
}

const DEFAULT_WEIGHTS: FactorWeights = {
  specificity: 0.20,
  measurability: 0.25,
  atomicity: 0.15,
  feasibility: 0.15,
  traceability: 0.10,
  independency: 0.15,
};

const DEFAULT_CONFIG: TestabilityScorerConfig = {
  defaultThreshold: 60,
  weights: DEFAULT_WEIGHTS,
  enableAIScoring: false,
};

/**
 * Testability Scorer Service Implementation
 * Evaluates requirements using SMART-like criteria adapted for testability
 */
export class TestabilityScorerService implements ITestabilityScoringService {
  private readonly config: TestabilityScorerConfig;

  constructor(
    private readonly memory: MemoryBackend,
    config: Partial<TestabilityScorerConfig> = {}
  ) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      weights: { ...DEFAULT_WEIGHTS, ...config.weights },
    };
  }

  /**
   * Score a single requirement's testability
   */
  async scoreRequirement(requirement: Requirement): Promise<Result<TestabilityScore>> {
    try {
      const factors: TestabilityFactor[] = [];

      // Calculate each factor
      factors.push(this.scoreSpecificity(requirement));
      factors.push(this.scoreMeasurability(requirement));
      factors.push(this.scoreAtomicity(requirement));
      factors.push(this.scoreFeasibility(requirement));
      factors.push(this.scoreTraceability(requirement));
      factors.push(this.scoreIndependency(requirement));

      // Calculate weighted average
      const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);
      const weightedSum = factors.reduce((sum, f) => sum + f.score * f.weight, 0);
      const overallScore = Math.round(weightedSum / totalWeight);

      // Determine category
      const category = this.categorizeScore(overallScore);

      const score: TestabilityScore = {
        value: overallScore,
        category,
        factors,
      };

      // Store score for learning and trends
      await this.storeScore(requirement.id, score);

      return ok(score);
    } catch (error) {
      return err(toError(error));
    }
  }

  /**
   * Score multiple requirements
   */
  async scoreRequirements(
    requirements: Requirement[]
  ): Promise<Result<Map<string, TestabilityScore>>> {
    try {
      const scores = new Map<string, TestabilityScore>();

      for (const requirement of requirements) {
        const result = await this.scoreRequirement(requirement);
        if (result.success) {
          scores.set(requirement.id, result.value);
        }
      }

      return ok(scores);
    } catch (error) {
      return err(toError(error));
    }
  }

  /**
   * Get improvement suggestions based on score
   */
  async suggestImprovements(
    requirement: Requirement,
    score: TestabilityScore
  ): Promise<Result<string[]>> {
    try {
      const suggestions: string[] = [];

      // Sort factors by score (lowest first)
      const sortedFactors = [...score.factors].sort((a, b) => a.score - b.score);

      // Generate suggestions for low-scoring factors
      for (const factor of sortedFactors) {
        if (factor.score < 70) {
          const factorSuggestions = this.getSuggestionsForFactor(
            factor,
            requirement
          );
          suggestions.push(...factorSuggestions);
        }

        // Add issues as suggestions
        for (const issue of factor.issues) {
          suggestions.push(`Fix: ${issue}`);
        }
      }

      // Add general suggestions based on overall score
      if (score.value < 50) {
        suggestions.push(
          'Consider rewriting the requirement with clearer, more specific language'
        );
        suggestions.push(
          'Add measurable acceptance criteria using Given-When-Then format'
        );
      } else if (score.value < 70) {
        suggestions.push(
          'Add quantifiable metrics where possible (response times, limits, thresholds)'
        );
      }

      // Deduplicate suggestions
      const uniqueSuggestions = [...new Set(suggestions)];

      return ok(uniqueSuggestions.slice(0, 10)); // Limit to top 10
    } catch (error) {
      return err(toError(error));
    }
  }

  /**
   * Check if score meets threshold
   */
  meetsThreshold(score: TestabilityScore, threshold: number): boolean {
    return score.value >= threshold;
  }

  // ============================================================================
  // Factor Scoring Methods
  // ============================================================================

  /**
   * Score specificity - how specific and unambiguous is the requirement
   */
  private scoreSpecificity(requirement: Requirement): TestabilityFactor {
    let score = 100;
    const issues: string[] = [];

    const text = `${requirement.title} ${requirement.description} ${requirement.acceptanceCriteria.join(' ')}`;
    const lowerText = text.toLowerCase();

    // Check for ambiguous terms
    const ambiguousTerms = [
      'fast', 'quickly', 'efficient', 'user-friendly', 'intuitive',
      'simple', 'easy', 'flexible', 'robust', 'appropriate',
      'reasonable', 'adequate', 'good', 'better', 'best',
      'several', 'many', 'few', 'some', 'most', 'etc',
    ];

    for (const term of ambiguousTerms) {
      if (lowerText.includes(term)) {
        score -= 8;
        issues.push(`Contains ambiguous term: "${term}"`);
      }
    }

    // Check for specific numbers/metrics
    const hasNumbers = /\d+/.test(text);
    if (!hasNumbers) {
      score -= 15;
      issues.push('No specific numbers or metrics provided');
    }

    // Check for clear actors/subjects
    const hasActor = /\b(user|admin|system|customer|developer)\b/i.test(text);
    if (!hasActor) {
      score -= 10;
      issues.push('No clear actor/subject specified');
    }

    // Check description length
    if (requirement.description.length < 50) {
      score -= 10;
      issues.push('Description is too brief for specificity');
    }

    return {
      name: 'Specificity',
      score: Math.max(0, score),
      weight: this.config.weights.specificity,
      issues,
    };
  }

  /**
   * Score measurability - can the requirement be objectively verified
   */
  private scoreMeasurability(requirement: Requirement): TestabilityFactor {
    let score = 100;
    const issues: string[] = [];

    const text = `${requirement.description} ${requirement.acceptanceCriteria.join(' ')}`;
    const lowerText = text.toLowerCase();

    // Check for measurable criteria
    const measurablePatterns = [
      /\d+\s*(ms|seconds?|minutes?|hours?)/i,          // Time metrics
      /\d+\s*%/,                                        // Percentages
      /\d+\s*(users?|requests?|transactions?)/i,       // Volume metrics
      /\d+\s*(mb|gb|kb)/i,                             // Size metrics
      /(less than|more than|at least|maximum|minimum)\s*\d+/i,
      /\b(must|shall|should)\b.*\b(be|have|support)\b/i,
    ];

    const hasMeasurables = measurablePatterns.some((p) => p.test(text));
    if (!hasMeasurables) {
      score -= 25;
      issues.push('No measurable criteria found');
    }

    // Check acceptance criteria for verifiable conditions
    if (requirement.acceptanceCriteria.length === 0) {
      score -= 30;
      issues.push('No acceptance criteria defined');
    } else {
      const verifiableCriteria = requirement.acceptanceCriteria.filter((ac) => {
        const acLower = ac.toLowerCase();
        return (
          /\bthen\b/i.test(ac) ||
          /\b(verify|confirm|check|ensure|assert)\b/i.test(acLower) ||
          /\b(should|must|shall)\b/i.test(acLower)
        );
      });

      if (verifiableCriteria.length < requirement.acceptanceCriteria.length * 0.5) {
        score -= 15;
        issues.push('Less than half of acceptance criteria are clearly verifiable');
      }
    }

    // Check for subjective terms
    const subjectiveTerms = ['looks good', 'feels right', 'works well', 'properly'];
    for (const term of subjectiveTerms) {
      if (lowerText.includes(term)) {
        score -= 10;
        issues.push(`Contains subjective term: "${term}"`);
      }
    }

    return {
      name: 'Measurability',
      score: Math.max(0, score),
      weight: this.config.weights.measurability,
      issues,
    };
  }

  /**
   * Score atomicity - is the requirement focused and not compound
   */
  private scoreAtomicity(requirement: Requirement): TestabilityFactor {
    let score = 100;
    const issues: string[] = [];

    const text = requirement.description;
    const lowerText = text.toLowerCase();

    // Check for compound statements
    const compoundPatterns = [
      /\band\b.*\band\b/i,           // Multiple "and"s
      /\bor\b/i,                      // Contains "or"
      /\bas well as\b/i,
      /\bin addition\b/i,
      /\balso\b/i,
      /\bfurthermore\b/i,
    ];

    for (const pattern of compoundPatterns) {
      if (pattern.test(lowerText)) {
        score -= 12;
        issues.push('Contains compound statements that may need splitting');
        break;
      }
    }

    // Check acceptance criteria count (too many might indicate non-atomic)
    if (requirement.acceptanceCriteria.length > 7) {
      score -= 15;
      issues.push('Too many acceptance criteria - consider splitting requirement');
    }

    // Check for multiple distinct features in description
    const featureIndicators = ['feature', 'capability', 'function', 'ability'];
    let featureCount = 0;
    for (const indicator of featureIndicators) {
      const matches = lowerText.match(new RegExp(indicator, 'g'));
      if (matches) {
        featureCount += matches.length;
      }
    }

    if (featureCount > 2) {
      score -= 15;
      issues.push('Multiple features/capabilities mentioned - may not be atomic');
    }

    // Check description length (too long might not be atomic)
    if (requirement.description.length > 500) {
      score -= 10;
      issues.push('Description length suggests requirement may not be atomic');
    }

    return {
      name: 'Atomicity',
      score: Math.max(0, score),
      weight: this.config.weights.atomicity,
      issues,
    };
  }

  /**
   * Score feasibility - can the requirement be reasonably tested
   */
  private scoreFeasibility(requirement: Requirement): TestabilityFactor {
    let score = 100;
    const issues: string[] = [];

    const text = `${requirement.description} ${requirement.acceptanceCriteria.join(' ')}`;
    const lowerText = text.toLowerCase();

    // Check for unrealistic requirements
    const unrealisticPatterns = [
      /100%\s*(availability|uptime|coverage)/i,
      /zero\s*(defects?|bugs?|errors?)/i,
      /never\s+(fail|crash|error)/i,
      /always\s+work/i,
      /infinite/i,
      /unlimited/i,
    ];

    for (const pattern of unrealisticPatterns) {
      if (pattern.test(lowerText)) {
        score -= 20;
        issues.push('Contains unrealistic or impossible to verify conditions');
        break;
      }
    }

    // Check for external dependencies that complicate testing
    const externalDependencies = [
      'third-party', 'external service', 'external api',
      'hardware', 'physical', 'manual',
    ];

    for (const dep of externalDependencies) {
      if (lowerText.includes(dep)) {
        score -= 10;
        issues.push(`Testing complicated by external dependency: ${dep}`);
      }
    }

    // Check for time-sensitive testing challenges
    if (/real-time|real time/i.test(lowerText)) {
      score -= 5;
      issues.push('Real-time requirements require specialized testing');
    }

    // Check for security/compliance complexity
    if (/compliance|regulation|legal|gdpr|hipaa/i.test(lowerText)) {
      score -= 5;
      issues.push('Compliance testing may require specialized expertise');
    }

    return {
      name: 'Feasibility',
      score: Math.max(0, score),
      weight: this.config.weights.feasibility,
      issues,
    };
  }

  /**
   * Score traceability - can tests be traced back to this requirement
   */
  private scoreTraceability(requirement: Requirement): TestabilityFactor {
    let score = 100;
    const issues: string[] = [];

    // Check for requirement ID
    if (!requirement.id || requirement.id.trim() === '') {
      score -= 30;
      issues.push('Requirement lacks a unique identifier');
    }

    // Check for clear title
    if (requirement.title.length < 10) {
      score -= 15;
      issues.push('Title is too short for effective traceability');
    }

    // Check for type classification
    if (!requirement.type) {
      score -= 15;
      issues.push('Requirement type not specified');
    }

    // Check for priority
    if (!requirement.priority) {
      score -= 10;
      issues.push('Requirement priority not specified');
    }

    // Check for acceptance criteria that can be linked to tests
    const criteriaWithIds = requirement.acceptanceCriteria.filter((ac) =>
      /\[AC[-\d]+\]|#\d+|AC\d+/i.test(ac)
    );

    if (criteriaWithIds.length === 0 && requirement.acceptanceCriteria.length > 0) {
      score -= 10;
      issues.push('Acceptance criteria lack identifiers for test traceability');
    }

    return {
      name: 'Traceability',
      score: Math.max(0, score),
      weight: this.config.weights.traceability,
      issues,
    };
  }

  /**
   * Score independency - can this be tested independently
   */
  private scoreIndependency(requirement: Requirement): TestabilityFactor {
    let score = 100;
    const issues: string[] = [];

    const text = `${requirement.description} ${requirement.acceptanceCriteria.join(' ')}`;
    const lowerText = text.toLowerCase();

    // Check for explicit dependencies
    const dependencyPatterns = [
      /depends on/i,
      /requires\s+(that|the)/i,
      /after\s+(the|completing)/i,
      /following\s+completion/i,
      /prerequisite/i,
      /blocked by/i,
    ];

    for (const pattern of dependencyPatterns) {
      if (pattern.test(lowerText)) {
        score -= 15;
        issues.push('Has explicit dependencies that complicate isolated testing');
        break;
      }
    }

    // Check for references to other requirements
    const refPatterns = [
      /REQ[-_]?\d+/gi,
      /requirement\s+\d+/gi,
      /see\s+(also|requirement)/i,
      /as described in/i,
    ];

    for (const pattern of refPatterns) {
      if (pattern.test(text)) {
        score -= 10;
        issues.push('References other requirements');
        break;
      }
    }

    // Check for shared state indicators
    const sharedStateTerms = [
      'global state', 'shared', 'common data', 'same session',
      'across all', 'system-wide',
    ];

    for (const term of sharedStateTerms) {
      if (lowerText.includes(term)) {
        score -= 10;
        issues.push(`Involves shared state: "${term}"`);
        break;
      }
    }

    return {
      name: 'Independency',
      score: Math.max(0, score),
      weight: this.config.weights.independency,
      issues,
    };
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private categorizeScore(score: number): TestabilityScore['category'] {
    if (score >= 80) return 'excellent';
    if (score >= 60) return 'good';
    if (score >= 40) return 'fair';
    return 'poor';
  }

  private getSuggestionsForFactor(
    factor: TestabilityFactor,
    _requirement: Requirement
  ): string[] {
    const suggestions: string[] = [];

    switch (factor.name) {
      case 'Specificity':
        suggestions.push('Replace ambiguous terms with specific, measurable values');
        suggestions.push('Define clear actors (user, system, admin) for each action');
        suggestions.push('Add concrete examples or scenarios');
        break;

      case 'Measurability':
        suggestions.push('Add quantifiable acceptance criteria (time limits, percentages)');
        suggestions.push('Use Given-When-Then format for each acceptance criterion');
        suggestions.push('Define success/failure conditions explicitly');
        break;

      case 'Atomicity':
        suggestions.push('Split compound requirements into separate, focused items');
        suggestions.push('Each requirement should describe one testable behavior');
        suggestions.push('Remove "and" chains by creating separate requirements');
        break;

      case 'Feasibility':
        suggestions.push('Replace absolute terms (100%, never, always) with realistic thresholds');
        suggestions.push('Document test environment requirements for external dependencies');
        suggestions.push('Consider mock/stub strategies for third-party integrations');
        break;

      case 'Traceability':
        suggestions.push('Ensure requirement has a unique, persistent identifier');
        suggestions.push('Add identifiers to each acceptance criterion (e.g., AC-1, AC-2)');
        suggestions.push('Link to related design documents or user stories');
        break;

      case 'Independency':
        suggestions.push('Document dependencies explicitly for test planning');
        suggestions.push('Consider if the requirement can be broken down to reduce dependencies');
        suggestions.push('Design tests that can run in isolation with proper setup/teardown');
        break;
    }

    return suggestions;
  }

  private async storeScore(
    requirementId: string,
    score: TestabilityScore
  ): Promise<void> {
    await this.memory.set(
      `requirements-validation:testability:${requirementId}`,
      {
        requirementId,
        score,
        scoredAt: new Date().toISOString(),
      },
      { namespace: 'requirements-validation', ttl: 86400 * 30 } // 30 days
    );

    // Also store for trend analysis
    const trendKey = `requirements-validation:testability-trend:${requirementId}`;
    const existingTrend = await this.memory.get<{ scores: Array<{ score: number; date: string }> }>(trendKey);

    const trend = existingTrend || { scores: [] };
    trend.scores.push({
      score: score.value,
      date: new Date().toISOString(),
    });

    // Keep last 10 scores
    if (trend.scores.length > 10) {
      trend.scores = trend.scores.slice(-10);
    }

    await this.memory.set(trendKey, trend, {
      namespace: 'requirements-validation',
      persist: true,
    });
  }
}
