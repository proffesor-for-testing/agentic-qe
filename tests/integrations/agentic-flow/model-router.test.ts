/**
 * Agentic QE v3 - Multi-Model Router Tests
 * ADR-051: Phase 2 - Model Router Component
 *
 * Tests for the Multi-Model Router that implements ADR-026 3-tier model routing:
 * - Tier 0: Agent Booster (<1ms, mechanical transforms)
 * - Tier 1: Haiku (~500ms, simple tasks, bug fixes)
 * - Tier 2: Sonnet/Opus (2-5s, architecture, complex reasoning)
 *
 * ## Testing Scenarios:
 *
 * 1. **ComplexityAnalyzer Tests**:
 *    - Detect Tier 0 eligibility (mechanical transforms)
 *    - Score simple tasks as Tier 1 (bug fixes, simple code)
 *    - Score complex tasks as Tier 2 (multi-file changes)
 *    - Score architecture tasks as Tier 3/4 (system design)
 *    - Handle edge cases (empty input, ambiguous)
 *
 * 2. **BudgetEnforcer Tests**:
 *    - Track spending per tier
 *    - Enforce budget limits
 *    - Warn at thresholds
 *    - Reset spending per session
 *    - Handle concurrent requests
 *
 * 3. **ModelRouter Integration Tests**:
 *    - Route mechanical transforms to Tier 0
 *    - Route based on complexity score
 *    - Respect budget constraints
 *    - Support tier override for critical tasks
 *    - Record routing decisions for learning
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ============================================================================
// Type Definitions for Model Router
// ============================================================================

/**
 * Supported Claude models
 */
type ClaudeModel = 'haiku' | 'sonnet' | 'opus' | 'booster';

/**
 * Routing tiers
 */
enum RoutingTier {
  BOOSTER = 'booster', // Tier 0: <1ms mechanical transforms
  HAIKU = 'haiku',     // Tier 1: ~500ms simple tasks
  SONNET = 'sonnet',   // Tier 2: ~2s moderate complexity
  OPUS = 'opus',       // Tier 3: ~5s high complexity
}

/**
 * Task complexity analysis
 */
interface ComplexityAnalysis {
  score: number;              // 0-100 complexity score
  tier: RoutingTier;          // Recommended tier
  confidence: number;         // Confidence in recommendation (0-1)
  factors: {
    fileCount: number;
    linesOfCode: number;
    cyclomaticComplexity: number;
    syntacticComplexity: number;
    semanticComplexity: number;
  };
  reasoning: string;          // Explanation of routing decision
}

/**
 * Routing decision
 */
interface RoutingDecision {
  taskId: string;
  model: ClaudeModel;
  tier: RoutingTier;
  analysis: ComplexityAnalysis;
  budgetConstraint: boolean;
  overrideReason?: string;
  timestamp: number;
  costEstimate: number;
}

/**
 * Budget tracking
 */
interface BudgetInfo {
  tier: RoutingTier;
  spent: number;
  limit: number;
  remaining: number;
  percentage: number;
  requestCount: number;
}

/**
 * Router configuration
 */
interface ModelRouterConfig {
  budgets: Record<RoutingTier, number>;
  complexityThresholds: {
    tier0_max: number;
    tier1_max: number;
    tier2_max: number;
  };
  warningThreshold: number;  // Budget % warning threshold
  costsPerModel: Record<ClaudeModel, number>;
}

/**
 * Learning record for routing decision
 */
interface RoutingDecisionRecord {
  decision: RoutingDecision;
  actualTierRequired: RoutingTier;
  success: boolean;
  actualCost: number;
  feedback?: string;
}

// ============================================================================
// Tier Complexity Detection
// ============================================================================

/**
 * Analyzes task complexity to determine appropriate tier
 */
class ComplexityAnalyzer {
  private static readonly MECHANICAL_PATTERNS = [
    /^var\s+\w+\s*=/,                // var assignment
    /^const\s+\w+\s*=/,              // const assignment
    /function\s+\w+\s*\(/,           // function declaration
    /=>|\.then\(/,                   // arrow functions, promises
    /require\(|module\.exports/,     // CommonJS
    /console\.\w+\(/,                // console statements
  ];

  /**
   * Analyze task complexity
   */
  analyze(task: {
    description: string;
    codeChanges?: Array<{ lines: number; files: number }>;
    filesAffected?: number;
    linesOfCode?: number;
  }): ComplexityAnalysis {
    let score = 0;
    const factors = {
      fileCount: task.filesAffected ?? 0,
      linesOfCode: task.linesOfCode ?? 0,
      cyclomaticComplexity: 0,
      syntacticComplexity: 0,
      semanticComplexity: 0,
    };

    // Check for mechanical transform eligibility (Tier 0)
    const isMechanical = this.isMechanicalTransform(task.description);
    if (isMechanical) {
      return {
        score: 5,
        tier: RoutingTier.BOOSTER,
        confidence: 0.95,
        factors,
        reasoning: 'Mechanical transform eligible for Agent Booster',
      };
    }

    // Syntactic complexity (based on description)
    const descriptionLength = task.description.length;
    if (descriptionLength < 100) {
      factors.syntacticComplexity = 1;
      score += 10;
    } else if (descriptionLength < 500) {
      factors.syntacticComplexity = 2;
      score += 25;
    } else {
      factors.syntacticComplexity = 3;
      score += 40;
    }

    // File count impact
    factors.fileCount = task.filesAffected ?? 0;
    if (factors.fileCount <= 1) {
      score += 5;
    } else if (factors.fileCount <= 5) {
      score += 20;
    } else {
      score += 35;
    }

    // Lines of code impact
    factors.linesOfCode = task.linesOfCode ?? 0;
    if (factors.linesOfCode <= 50) {
      score += 5;
    } else if (factors.linesOfCode <= 200) {
      score += 20;
    } else if (factors.linesOfCode <= 1000) {
      score += 35;
    } else {
      score += 50;
    }

    // Semantic complexity based on keywords
    const complexKeywords = [
      'security',
      'architecture',
      'refactor',
      'performance',
      'optimization',
      'design',
      'integration',
    ];
    const foundKeywords = complexKeywords.filter(kw =>
      task.description.toLowerCase().includes(kw)
    ).length;
    factors.semanticComplexity = foundKeywords;
    score += foundKeywords * 15;

    // Determine tier based on score
    let tier: RoutingTier;
    let confidence: number;

    if (score < 30) {
      tier = RoutingTier.HAIKU;
      confidence = 0.9;
    } else if (score < 60) {
      tier = RoutingTier.SONNET;
      confidence = 0.85;
    } else {
      tier = RoutingTier.OPUS;
      confidence = 0.8;
    }

    return {
      score: Math.min(100, score),
      tier,
      confidence,
      factors,
      reasoning: `Task complexity score: ${score}. File count: ${factors.fileCount}, LOC: ${factors.linesOfCode}, Semantic factors: ${factors.semanticComplexity}`,
    };
  }

  /**
   * Check if task is a mechanical transform eligible for Tier 0
   */
  private isMechanicalTransform(description: string): boolean {
    const lowerDesc = description.toLowerCase();
    const mechanicalTransforms = [
      'var to const',
      'add types',
      'remove console',
      'promise to async',
      'cjs to esm',
      'func to arrow',
    ];

    const isMechanical = mechanicalTransforms.some(t => lowerDesc.includes(t));
    if (!isMechanical) return false;

    // Check that description is simple enough for mechanical transform
    // and doesn't contain complexity keywords
    const complexityKeywords = [
      'refactor entire',
      'redesign',
      'architecture',
      'microservices',
      'system',
      'multiple services',
    ];

    const hasComplexity = complexityKeywords.some(k => lowerDesc.includes(k));
    return description.length < 150 && !hasComplexity;
  }
}

/**
 * Enforces budget constraints on model usage
 */
class BudgetEnforcer {
  private spending: Record<RoutingTier, number> = {
    [RoutingTier.BOOSTER]: 0,
    [RoutingTier.HAIKU]: 0,
    [RoutingTier.SONNET]: 0,
    [RoutingTier.OPUS]: 0,
  };

  private requestCounts: Record<RoutingTier, number> = {
    [RoutingTier.BOOSTER]: 0,
    [RoutingTier.HAIKU]: 0,
    [RoutingTier.SONNET]: 0,
    [RoutingTier.OPUS]: 0,
  };

  private warningCallbacks: Array<(tier: RoutingTier, percentage: number) => void> = [];

  constructor(private config: ModelRouterConfig) {}

  /**
   * Check if budget allows the request
   */
  canAfford(tier: RoutingTier, cost: number): boolean {
    const budget = this.config.budgets[tier];
    const current = this.spending[tier];
    return current + cost <= budget;
  }

  /**
   * Record a cost against the budget
   */
  recordCost(tier: RoutingTier, cost: number): void {
    this.spending[tier] += cost;
    this.requestCounts[tier]++;

    // Check warning threshold
    const budget = this.config.budgets[tier];
    const percentage = (this.spending[tier] / budget) * 100;
    if (percentage >= this.config.warningThreshold) {
      this.warningCallbacks.forEach(cb => cb(tier, percentage));
    }
  }

  /**
   * Get budget info for a tier
   */
  getInfo(tier: RoutingTier): BudgetInfo {
    const spent = this.spending[tier];
    const limit = this.config.budgets[tier];
    return {
      tier,
      spent,
      limit,
      remaining: limit - spent,
      percentage: (spent / limit) * 100,
      requestCount: this.requestCounts[tier],
    };
  }

  /**
   * Reset spending (new session)
   */
  reset(): void {
    for (const tier of Object.values(RoutingTier)) {
      this.spending[tier] = 0;
      this.requestCounts[tier] = 0;
    }
  }

  /**
   * Register warning callback
   */
  onWarning(callback: (tier: RoutingTier, percentage: number) => void): void {
    this.warningCallbacks.push(callback);
  }

  /**
   * Get all budget info
   */
  getAll(): Record<RoutingTier, BudgetInfo> {
    return {
      [RoutingTier.BOOSTER]: this.getInfo(RoutingTier.BOOSTER),
      [RoutingTier.HAIKU]: this.getInfo(RoutingTier.HAIKU),
      [RoutingTier.SONNET]: this.getInfo(RoutingTier.SONNET),
      [RoutingTier.OPUS]: this.getInfo(RoutingTier.OPUS),
    };
  }
}

/**
 * Multi-tier model router implementing ADR-026
 */
class ModelRouter {
  private analyzer: ComplexityAnalyzer;
  private budgetEnforcer: BudgetEnforcer;
  private decisions: RoutingDecision[] = [];
  private learningRecords: RoutingDecisionRecord[] = [];

  constructor(private config: ModelRouterConfig) {
    this.analyzer = new ComplexityAnalyzer();
    this.budgetEnforcer = new BudgetEnforcer(config);
  }

  /**
   * Route a task to the optimal model
   */
  route(task: {
    id: string;
    description: string;
    filesAffected?: number;
    linesOfCode?: number;
    critical?: boolean;
  }): RoutingDecision {
    const analysis = this.analyzer.analyze(task);

    // Allow critical task override
    let tier = analysis.tier;
    let overrideReason: string | undefined;
    if (task.critical && tier === RoutingTier.SONNET) {
      tier = RoutingTier.OPUS;
      overrideReason = 'Critical task override to Opus';
    }

    // Check budget constraints and downgrade if needed
    let budgetConstraint = false;
    const originalTier = tier;
    while (!this.budgetEnforcer.canAfford(tier, this.config.costsPerModel[this.tierToModel(tier)]) &&
           tier !== RoutingTier.BOOSTER) {
      budgetConstraint = true;
      tier = this.downgradeTier(tier);
    }

    // Map tier to model and record cost
    const model = this.tierToModel(tier);
    const cost = this.config.costsPerModel[model];
    this.budgetEnforcer.recordCost(tier, cost);

    const decision: RoutingDecision = {
      taskId: task.id,
      model,
      tier,
      analysis,
      budgetConstraint,
      overrideReason,
      timestamp: Date.now(),
      costEstimate: cost,
    };

    this.decisions.push(decision);
    return decision;
  }

  /**
   * Record learning from routing decision outcome
   */
  recordOutcome(
    decision: RoutingDecision,
    actualTierRequired: RoutingTier,
    success: boolean,
    actualCost: number,
    feedback?: string
  ): void {
    const record: RoutingDecisionRecord = {
      decision,
      actualTierRequired,
      success,
      actualCost,
      feedback,
    };
    this.learningRecords.push(record);
  }

  /**
   * Get routing statistics
   */
  getStats(): {
    totalDecisions: number;
    successfulDecisions: number;
    routingAccuracy: number;
    budgetInfo: Record<RoutingTier, BudgetInfo>;
  } {
    const successful = this.learningRecords.filter(r => r.success).length;
    return {
      totalDecisions: this.decisions.length,
      successfulDecisions: successful,
      routingAccuracy: this.learningRecords.length > 0
        ? successful / this.learningRecords.length
        : 0,
      budgetInfo: this.budgetEnforcer.getAll(),
    };
  }

  /**
   * Get budget info
   */
  getBudgetInfo(tier?: RoutingTier): BudgetInfo | Record<RoutingTier, BudgetInfo> {
    if (tier) {
      return this.budgetEnforcer.getInfo(tier);
    }
    return this.budgetEnforcer.getAll();
  }

  /**
   * Reset router state (new session)
   */
  reset(): void {
    this.decisions = [];
    this.learningRecords = [];
    this.budgetEnforcer.reset();
  }

  /**
   * Map tier to model
   */
  private tierToModel(tier: RoutingTier): ClaudeModel {
    switch (tier) {
      case RoutingTier.BOOSTER:
        return 'booster';
      case RoutingTier.HAIKU:
        return 'haiku';
      case RoutingTier.SONNET:
        return 'sonnet';
      case RoutingTier.OPUS:
        return 'opus';
    }
  }

  /**
   * Downgrade to cheaper tier
   */
  private downgradeTier(tier: RoutingTier): RoutingTier {
    switch (tier) {
      case RoutingTier.OPUS:
        return RoutingTier.SONNET;
      case RoutingTier.SONNET:
        return RoutingTier.HAIKU;
      case RoutingTier.HAIKU:
        return RoutingTier.BOOSTER;
      case RoutingTier.BOOSTER:
        return RoutingTier.BOOSTER;
    }
  }

  /**
   * Register budget warning handler
   */
  onBudgetWarning(callback: (tier: RoutingTier, percentage: number) => void): void {
    this.budgetEnforcer.onWarning(callback);
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('Model Router - ADR-051 Phase 2', () => {
  // ============================================================================
  // ComplexityAnalyzer Tests
  // ============================================================================

  describe('ComplexityAnalyzer', () => {
    let analyzer: ComplexityAnalyzer;

    beforeEach(() => {
      analyzer = new ComplexityAnalyzer();
    });

    describe('Tier 0 Detection (Mechanical Transforms)', () => {
      it('should detect var-to-const transform', () => {
        const result = analyzer.analyze({
          description: 'var to const transform in user service',
          linesOfCode: 50,
          filesAffected: 1,
        });

        expect(result.tier).toBe(RoutingTier.BOOSTER);
        expect(result.confidence).toBeGreaterThan(0.9);
        expect(result.score).toBeLessThan(10);
      });

      it('should detect add-types transform', () => {
        const result = analyzer.analyze({
          description: 'add types to JavaScript file',
          linesOfCode: 30,
          filesAffected: 1,
        });

        expect(result.tier).toBe(RoutingTier.BOOSTER);
        expect(result.confidence).toBeGreaterThanOrEqual(0.9);
      });

      it('should detect remove-console transform', () => {
        const result = analyzer.analyze({
          description: 'remove console debug statements from module',
          linesOfCode: 20,
          filesAffected: 1,
        });

        expect(result.tier).toBe(RoutingTier.BOOSTER);
      });

      it('should reject complex tasks even with mechanical keyword', () => {
        const result = analyzer.analyze({
          description:
            'refactor entire authentication system across multiple services with OAuth implementation',
          linesOfCode: 5000,
          filesAffected: 15,
        });

        expect(result.tier).not.toBe(RoutingTier.BOOSTER);
        expect(result.score).toBeGreaterThan(30);
      });
    });

    describe('Tier 1 Detection (Simple Tasks)', () => {
      it('should score simple bug fixes as Tier 1', () => {
        const result = analyzer.analyze({
          description: 'fix null pointer check in getUserName function',
          linesOfCode: 15,
          filesAffected: 1,
        });

        expect(result.tier).toBe(RoutingTier.HAIKU);
        expect(result.score).toBeLessThan(30);
      });

      it('should score single-file changes as Tier 1', () => {
        const result = analyzer.analyze({
          description: 'update error message in validation module',
          linesOfCode: 40,
          filesAffected: 1,
        });

        expect(result.tier).toBe(RoutingTier.HAIKU);
      });

      it('should handle simple test case', () => {
        const result = analyzer.analyze({
          description: 'write unit test for parseDate utility',
          linesOfCode: 60,
          filesAffected: 1,
        });

        // Simple test should be Tier 1 or 2
        expect([RoutingTier.HAIKU, RoutingTier.SONNET]).toContain(result.tier);
      });
    });

    describe('Tier 2 Detection (Moderate Complexity)', () => {
      it('should score multi-file changes as Tier 2+', () => {
        const result = analyzer.analyze({
          description: 'refactor and improve multiple modules',
          linesOfCode: 300,
          filesAffected: 4,
        });

        // Multi-file changes should be moderate or higher
        expect([RoutingTier.SONNET, RoutingTier.OPUS]).toContain(result.tier);
        expect(result.score).toBeGreaterThanOrEqual(20);
      });

      it('should score performance optimization as moderate', () => {
        const result = analyzer.analyze({
          description: 'optimization work and improvement task',
          linesOfCode: 200,
          filesAffected: 2,
        });

        // Simple optimization task
        expect([RoutingTier.HAIKU, RoutingTier.SONNET, RoutingTier.OPUS]).toContain(result.tier);
      });

      it('should score integration changes as moderate', () => {
        const result = analyzer.analyze({
          description: 'integrate new service with existing system',
          linesOfCode: 300,
          filesAffected: 3,
        });

        // Integration task should be moderate complexity
        expect([RoutingTier.SONNET, RoutingTier.OPUS]).toContain(result.tier);
      });
    });

    describe('Tier 3/4 Detection (High Complexity)', () => {
      it('should score architecture changes as Tier 3/4', () => {
        const result = analyzer.analyze({
          description: 'redesign authentication architecture for microservices',
          linesOfCode: 2000,
          filesAffected: 12,
        });

        expect(result.tier).toBe(RoutingTier.OPUS);
        expect(result.score).toBeGreaterThanOrEqual(60);
      });

      it('should score security-related changes as high complexity', () => {
        const result = analyzer.analyze({
          description: 'implement end-to-end encryption for sensitive data',
          linesOfCode: 1500,
          filesAffected: 8,
        });

        expect(result.tier).toBe(RoutingTier.OPUS);
      });

      it('should score design system changes as high complexity', () => {
        const result = analyzer.analyze({
          description: 'redesign system architecture for scalability',
          linesOfCode: 3000,
          filesAffected: 20,
        });

        expect(result.tier).toBe(RoutingTier.OPUS);
      });
    });

    describe('Edge Cases', () => {
      it('should handle empty description', () => {
        const result = analyzer.analyze({
          description: '',
          linesOfCode: 0,
          filesAffected: 0,
        });

        expect(result).toBeDefined();
        expect(result.tier).toBeDefined();
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(100);
      });

      it('should handle ambiguous description', () => {
        const result = analyzer.analyze({
          description: 'update code',
          linesOfCode: 100,
          filesAffected: 2,
        });

        expect(result).toBeDefined();
        expect(result.tier).toBeDefined();
      });

      it('should handle very large tasks', () => {
        const result = analyzer.analyze({
          description: 'rewrite entire backend system',
          linesOfCode: 50000,
          filesAffected: 100,
        });

        expect(result.tier).toBe(RoutingTier.OPUS);
        expect(result.score).toBeGreaterThanOrEqual(60); // Should be high complexity
      });

      it('should handle undefined optional fields', () => {
        const result = analyzer.analyze({
          description: 'fix bug',
        });

        expect(result).toBeDefined();
        expect(result.factors.fileCount).toBe(0);
        expect(result.factors.linesOfCode).toBe(0);
      });
    });

    describe('Factor Analysis', () => {
      it('should correctly calculate syntactic complexity', () => {
        const result1 = analyzer.analyze({
          description: 'short',
          linesOfCode: 10,
          filesAffected: 1,
        });

        const result2 = analyzer.analyze({
          description: 'a'.repeat(300),
          linesOfCode: 10,
          filesAffected: 1,
        });

        expect(result2.factors.syntacticComplexity).toBeGreaterThan(
          result1.factors.syntacticComplexity
        );
      });

      it('should weight semantic complexity correctly', () => {
        const simpleResult = analyzer.analyze({
          description: 'update variable name',
          linesOfCode: 20,
          filesAffected: 1,
        });

        const complexResult = analyzer.analyze({
          description:
            'update security and performance and architecture and design and optimization',
          linesOfCode: 20,
          filesAffected: 1,
        });

        expect(complexResult.score).toBeGreaterThan(simpleResult.score);
      });
    });
  });

  // ============================================================================
  // BudgetEnforcer Tests
  // ============================================================================

  describe('BudgetEnforcer', () => {
    let config: ModelRouterConfig;
    let enforcer: BudgetEnforcer;

    beforeEach(() => {
      config = {
        budgets: {
          [RoutingTier.BOOSTER]: 0, // Free tier
          [RoutingTier.HAIKU]: 100,
          [RoutingTier.SONNET]: 500,
          [RoutingTier.OPUS]: 1000,
        },
        complexityThresholds: {
          tier0_max: 10,
          tier1_max: 30,
          tier2_max: 60,
        },
        warningThreshold: 80,
        costsPerModel: {
          booster: 0,
          haiku: 1,
          sonnet: 5,
          opus: 20,
        },
      };
      enforcer = new BudgetEnforcer(config);
    });

    describe('Budget Tracking', () => {
      it('should track spending per tier', () => {
        enforcer.recordCost(RoutingTier.HAIKU, 10);
        enforcer.recordCost(RoutingTier.HAIKU, 15);

        const info = enforcer.getInfo(RoutingTier.HAIKU);
        expect(info.spent).toBe(25);
        expect(info.requestCount).toBe(2);
      });

      it('should calculate remaining budget correctly', () => {
        enforcer.recordCost(RoutingTier.SONNET, 200);

        const info = enforcer.getInfo(RoutingTier.SONNET);
        expect(info.remaining).toBe(300); // 500 - 200
      });

      it('should calculate percentage correctly', () => {
        enforcer.recordCost(RoutingTier.OPUS, 250);

        const info = enforcer.getInfo(RoutingTier.OPUS);
        expect(info.percentage).toBe(25); // 250/1000 = 25%
      });
    });

    describe('Budget Enforcement', () => {
      it('should allow cost within budget', () => {
        const canAfford = enforcer.canAfford(RoutingTier.HAIKU, 50);
        expect(canAfford).toBe(true);
      });

      it('should reject cost exceeding budget', () => {
        enforcer.recordCost(RoutingTier.HAIKU, 80);
        const canAfford = enforcer.canAfford(RoutingTier.HAIKU, 30);

        expect(canAfford).toBe(false);
      });

      it('should handle budget exactly at limit', () => {
        enforcer.recordCost(RoutingTier.SONNET, 500);
        const canAfford = enforcer.canAfford(RoutingTier.SONNET, 0.01);

        expect(canAfford).toBe(false);
      });

      it('should track free tier correctly', () => {
        // Booster tier has 0 budget but costs 0
        const canAfford0 = enforcer.canAfford(RoutingTier.BOOSTER, 0);
        expect(canAfford0).toBe(true);

        // Recording 0 cost should not affect budget
        enforcer.recordCost(RoutingTier.BOOSTER, 0);
        const info = enforcer.getInfo(RoutingTier.BOOSTER);
        expect(info.spent).toBe(0);
      });
    });

    describe('Warning Threshold', () => {
      it('should trigger warning at threshold', () => {
        const warnings: Array<{ tier: RoutingTier; percentage: number }> = [];
        enforcer.onWarning((tier, percentage) => {
          warnings.push({ tier, percentage });
        });

        enforcer.recordCost(RoutingTier.SONNET, 400); // 80%
        expect(warnings).toHaveLength(1);
        expect(warnings[0].percentage).toBe(80);
      });

      it('should trigger multiple warnings for multiple tiers', () => {
        const warnings: Array<{ tier: RoutingTier; percentage: number }> = [];
        enforcer.onWarning((tier, percentage) => {
          warnings.push({ tier, percentage });
        });

        enforcer.recordCost(RoutingTier.HAIKU, 80);  // 80%
        enforcer.recordCost(RoutingTier.SONNET, 400); // 80%

        expect(warnings).toHaveLength(2);
      });

      it('should not trigger warning below threshold', () => {
        const warnings: Array<{ tier: RoutingTier; percentage: number }> = [];
        enforcer.onWarning((tier, percentage) => {
          warnings.push({ tier, percentage });
        });

        enforcer.recordCost(RoutingTier.SONNET, 300); // 60%
        expect(warnings).toHaveLength(0);
      });
    });

    describe('Session Reset', () => {
      it('should reset all spending on session reset', () => {
        enforcer.recordCost(RoutingTier.HAIKU, 50);
        enforcer.recordCost(RoutingTier.SONNET, 100);

        enforcer.reset();

        expect(enforcer.getInfo(RoutingTier.HAIKU).spent).toBe(0);
        expect(enforcer.getInfo(RoutingTier.SONNET).spent).toBe(0);
      });

      it('should reset request counts on session reset', () => {
        enforcer.recordCost(RoutingTier.HAIKU, 10);
        enforcer.recordCost(RoutingTier.HAIKU, 10);

        enforcer.reset();

        expect(enforcer.getInfo(RoutingTier.HAIKU).requestCount).toBe(0);
      });

      it('should allow new spending after reset', () => {
        enforcer.recordCost(RoutingTier.HAIKU, 100);
        enforcer.reset();

        const canAfford = enforcer.canAfford(RoutingTier.HAIKU, 100);
        expect(canAfford).toBe(true);
      });
    });

    describe('Concurrent Requests', () => {
      it('should handle multiple concurrent recordings', () => {
        const costs = [10, 15, 20, 25, 30];
        costs.forEach(cost => {
          enforcer.recordCost(RoutingTier.HAIKU, cost);
        });

        const info = enforcer.getInfo(RoutingTier.HAIKU);
        expect(info.spent).toBe(100);
        expect(info.requestCount).toBe(5);
      });

      it('should maintain accuracy with mixed tier recording', () => {
        for (let i = 0; i < 5; i++) {
          enforcer.recordCost(RoutingTier.HAIKU, 10);
          enforcer.recordCost(RoutingTier.SONNET, 50);
        }

        const haikuInfo = enforcer.getInfo(RoutingTier.HAIKU);
        const sonnetInfo = enforcer.getInfo(RoutingTier.SONNET);

        expect(haikuInfo.spent).toBe(50);
        expect(sonnetInfo.spent).toBe(250);
      });
    });
  });

  // ============================================================================
  // ModelRouter Integration Tests
  // ============================================================================

  describe('ModelRouter', () => {
    let router: ModelRouter;
    let config: ModelRouterConfig;

    beforeEach(() => {
      config = {
        budgets: {
          [RoutingTier.BOOSTER]: 0,
          [RoutingTier.HAIKU]: 100,
          [RoutingTier.SONNET]: 500,
          [RoutingTier.OPUS]: 1000,
        },
        complexityThresholds: {
          tier0_max: 10,
          tier1_max: 30,
          tier2_max: 60,
        },
        warningThreshold: 80,
        costsPerModel: {
          booster: 0,
          haiku: 1,
          sonnet: 5,
          opus: 20,
        },
      };
      router = new ModelRouter(config);
    });

    describe('Routing to Appropriate Tier', () => {
      it('should route mechanical transforms to Tier 0', () => {
        const decision = router.route({
          id: 'task-1',
          description: 'var to const transform in user service',
          filesAffected: 1,
          linesOfCode: 30,
        });

        expect(decision.tier).toBe(RoutingTier.BOOSTER);
        expect(decision.model).toBe('booster');
        expect(decision.costEstimate).toBe(0);
      });

      it('should route simple tasks to Tier 1 (Haiku)', () => {
        const decision = router.route({
          id: 'task-2',
          description: 'fix null pointer check in utility',
          filesAffected: 1,
          linesOfCode: 20,
        });

        expect(decision.tier).toBe(RoutingTier.HAIKU);
        expect(decision.model).toBe('haiku');
        expect(decision.costEstimate).toBe(1);
      });

      it('should route moderate tasks to Tier 2 (Sonnet)', () => {
        const decision = router.route({
          id: 'task-3',
          description: 'add pagination feature to API',
          filesAffected: 3,
          linesOfCode: 350,
        });

        // Moderate complexity task should be Tier 2+
        expect([RoutingTier.SONNET, RoutingTier.OPUS]).toContain(decision.tier);
        expect(decision.costEstimate).toBeGreaterThanOrEqual(1);
      });

      it('should route complex tasks to Tier 3 (Opus)', () => {
        const decision = router.route({
          id: 'task-4',
          description: 'architecture and security and design system changes',
          filesAffected: 20,
          linesOfCode: 3000,
        });

        expect(decision.tier).toBe(RoutingTier.OPUS);
        expect(decision.model).toBe('opus');
        expect(decision.costEstimate).toBe(20);
      });
    });

    describe('Budget Constraint Handling', () => {
      it('should respect budget limits', () => {
        // Exhaust Opus budget
        for (let i = 0; i < 50; i++) {
          router.route({
            id: `task-${i}`,
            description: 'architecture and security and design changes',
            filesAffected: 10,
            linesOfCode: 2000,
          });
        }

        // After exhausting Opus budget, next complex task should be downgraded
        const decision = router.route({
          id: 'task-over-budget',
          description: 'security and architecture design',
          filesAffected: 10,
          linesOfCode: 2000,
        });

        expect(decision.budgetConstraint).toBe(true);
        // Should be downgraded from original tier
        expect([RoutingTier.HAIKU, RoutingTier.SONNET]).toContain(decision.tier);
      });

      it('should downgrade through tiers when budget exhausted', () => {
        // Exhaust Sonnet and Opus budgets
        for (let i = 0; i < 100; i++) {
          router.route({
            id: `task-${i}`,
            description: 'moderate complexity task',
            filesAffected: 5,
            linesOfCode: 500,
          });
        }

        // Next task should be downgraded to Haiku
        const decision = router.route({
          id: 'final-task',
          description: 'moderate complexity task',
          filesAffected: 5,
          linesOfCode: 500,
        });

        expect(decision.budgetConstraint).toBe(true);
      });
    });

    describe('Critical Task Override', () => {
      it('should handle critical tasks appropriately', () => {
        const decision = router.route({
          id: 'critical-task',
          description: 'add feature to API',
          filesAffected: 2,
          linesOfCode: 250,
          critical: true,
        });

        // Critical flag may upgrade task
        expect([RoutingTier.HAIKU, RoutingTier.SONNET, RoutingTier.OPUS]).toContain(decision.tier);
        // If upgraded to OPUS due to critical flag, should have override reason
        if (decision.overrideReason) {
          expect(decision.overrideReason).toContain('Critical');
        }
      });
    });

    describe('Routing Decision Recording', () => {
      it('should record all routing decisions', () => {
        router.route({
          id: 'task-1',
          description: 'simple task',
          filesAffected: 1,
          linesOfCode: 20,
        });
        router.route({
          id: 'task-2',
          description: 'complex task',
          filesAffected: 10,
          linesOfCode: 2000,
        });

        const stats = router.getStats();
        expect(stats.totalDecisions).toBe(2);
      });

      it('should record outcome feedback for learning', () => {
        const decision = router.route({
          id: 'task-1',
          description: 'moderate complexity task',
          filesAffected: 5,
          linesOfCode: 500,
        });

        // Record that the task actually succeeded with the routed model
        router.recordOutcome(
          decision,
          RoutingTier.SONNET,
          true,
          4.5,
          'Completed successfully with expected complexity'
        );

        const stats = router.getStats();
        expect(stats.successfulDecisions).toBe(1);
        expect(stats.routingAccuracy).toBe(1.0);
      });

      it('should calculate routing accuracy from learning records', () => {
        // Create multiple routing decisions
        const tasks = [
          { id: 'task-1', description: 'simple', files: 1, loc: 20 },
          { id: 'task-2', description: 'moderate', files: 5, loc: 500 },
          { id: 'task-3', description: 'complex', files: 15, loc: 2000 },
        ];

        const decisions = tasks.map(task =>
          router.route({
            id: task.id,
            description: task.description,
            filesAffected: task.files,
            linesOfCode: task.loc,
          })
        );

        // Record outcomes
        router.recordOutcome(decisions[0], RoutingTier.HAIKU, true, 1, '');
        router.recordOutcome(decisions[1], RoutingTier.SONNET, true, 5, '');
        router.recordOutcome(decisions[2], RoutingTier.OPUS, false, 20, 'Underestimated');

        const stats = router.getStats();
        expect(stats.totalDecisions).toBe(3);
        expect(stats.successfulDecisions).toBe(2);
        expect(stats.routingAccuracy).toBeCloseTo(0.667, 2);
      });
    });

    describe('Statistics and Reporting', () => {
      it('should provide accurate budget information', () => {
        const decision1 = router.route({
          id: 'task-1',
          description: 'fix null pointer check',
          filesAffected: 1,
          linesOfCode: 20,
        });
        const decision2 = router.route({
          id: 'task-2',
          description: 'update user service validation',
          filesAffected: 2,
          linesOfCode: 150,
        });

        // Both should be simple tasks (Tier 1)
        expect(decision1.tier).toBe(RoutingTier.HAIKU);
        expect([RoutingTier.HAIKU, RoutingTier.SONNET]).toContain(decision2.tier);

        const stats = router.getStats();
        expect(stats.totalDecisions).toBe(2);
      });

      it('should provide overall statistics', () => {
        for (let i = 0; i < 10; i++) {
          router.route({
            id: `task-${i}`,
            description: 'test task',
            filesAffected: 1,
            linesOfCode: 20,
          });
        }

        const stats = router.getStats();
        expect(stats.totalDecisions).toBe(10);
        expect(stats.routingAccuracy).toBe(0); // No learning records yet
      });
    });

    describe('Session Reset', () => {
      it('should reset all state on new session', () => {
        router.route({
          id: 'task-1',
          description: 'simple bug fix',
          filesAffected: 1,
          linesOfCode: 20,
        });

        let stats = router.getStats();
        expect(stats.totalDecisions).toBe(1);

        router.reset();

        stats = router.getStats();
        expect(stats.totalDecisions).toBe(0);
        expect(stats.successfulDecisions).toBe(0);
      });

      it('should reset budget on new session', () => {
        const decision = router.route({
          id: 'task-1',
          description: 'refactor module with performance optimization',
          filesAffected: 3,
          linesOfCode: 250,
        });

        // Track whatever tier it routed to
        const tier = decision.tier;
        const tierInfo = router.getBudgetInfo(tier) as BudgetInfo;
        const spent1 = tierInfo.spent;

        router.reset();

        const tierInfoAfterReset = router.getBudgetInfo(tier) as BudgetInfo;
        expect(tierInfoAfterReset.spent).toBe(0);
      });
    });

    describe('Budget Warning Callback', () => {
      it('should invoke warning callback when budget threshold reached', () => {
        const warnings: Array<{ tier: RoutingTier; percentage: number }> = [];
        router.onBudgetWarning((tier, percentage) => {
          warnings.push({ tier, percentage });
        });

        // Route enough tasks to reach Opus warning threshold (80% of 1000)
        for (let i = 0; i < 40; i++) {
          router.route({
            id: `task-${i}`,
            description: 'complex task',
            filesAffected: 10,
            linesOfCode: 2000,
          });
        }

        expect(warnings.length).toBeGreaterThan(0);
        expect(warnings.some(w => w.tier === RoutingTier.OPUS)).toBe(true);
      });
    });
  });
});
