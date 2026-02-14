/**
 * Evolution Pipeline Integration for Agentic QE Fleet
 *
 * Wires @claude-flow/guidance Evolution Pipeline to AQE's ReasoningBank learning system.
 * Provides rule effectiveness tracking, pattern promotion/demotion, A/B testing for
 * rule variants, and learning from agent task outcomes.
 *
 * Evolution Pipeline Features:
 * - Rule effectiveness tracking with time-windowed success rates (1h, 24h, 7d)
 * - Context-specific effectiveness by domain and task type
 * - Automatic promotion/demotion based on statistical significance
 * - A/B testing support for rule variants
 * - Integration with ReasoningBank for trajectory-based learning
 *
 * @module governance/evolution-pipeline-integration
 * @see ADR-058-guidance-governance-integration.md
 */

import { governanceFlags, isStrictMode } from './feature-flags.js';
import type { GovernanceFeatureFlags } from './feature-flags.js';
import { getUnifiedMemory, type UnifiedMemoryManager } from '../kernel/unified-memory.js';

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Rule context for tracking effectiveness by scenario
 */
export interface RuleContext {
  /** QE domain (test-generation, coverage-analysis, etc.) */
  domain?: string;
  /** Task type (unit-test, integration-test, etc.) */
  taskType?: string;
  /** Programming language */
  language?: string;
  /** Test framework */
  framework?: string;
  /** Agent ID that applied the rule */
  agentId?: string;
  /** Additional context tags */
  tags?: string[];
}

/**
 * Rule effectiveness metrics
 */
export interface RuleEffectiveness {
  /** Rule identifier */
  ruleId: string;
  /** Total applications */
  totalApplications: number;
  /** Successful applications */
  successfulApplications: number;
  /** Overall success rate (0-1) */
  successRate: number;
  /** Success rate in last hour */
  successRate1h: number;
  /** Success rate in last 24 hours */
  successRate24h: number;
  /** Success rate in last 7 days */
  successRate7d: number;
  /** Confidence interval (95%) for overall success rate */
  confidenceInterval: {
    lower: number;
    upper: number;
  };
  /** Has enough samples for statistical significance */
  isStatisticallySignificant: boolean;
  /** Effectiveness by domain */
  byDomain: Map<string, DomainEffectiveness>;
  /** Effectiveness by task type */
  byTaskType: Map<string, TaskTypeEffectiveness>;
  /** Current promotion status */
  promotionStatus: PromotionStatus;
  /** Last updated timestamp */
  lastUpdated: number;
}

/**
 * Domain-specific effectiveness
 */
export interface DomainEffectiveness {
  domain: string;
  applications: number;
  successes: number;
  successRate: number;
}

/**
 * Task type specific effectiveness
 */
export interface TaskTypeEffectiveness {
  taskType: string;
  applications: number;
  successes: number;
  successRate: number;
}

/**
 * Rule promotion status
 */
export type PromotionStatus =
  | 'candidate'      // New rule, being evaluated
  | 'promoted'       // Proven effective, active in production
  | 'demoted'        // Below threshold, deprioritized
  | 'deprecated'     // Marked for removal
  | 'variant'        // A/B test variant
  | 'control';       // A/B test control

/**
 * Rule modifications for creating variants
 */
export interface RuleModifications {
  /** New name for the variant */
  name?: string;
  /** Parameter adjustments */
  parameters?: Record<string, unknown>;
  /** Modified template content */
  templateContent?: string;
  /** Modified context constraints */
  contextConstraints?: Partial<RuleContext>;
  /** Description of changes */
  changeDescription: string;
}

/**
 * Task outcome for learning
 */
export interface TaskOutcome {
  /** Task identifier */
  taskId: string;
  /** Task type */
  taskType: string;
  /** Whether task succeeded */
  success: boolean;
  /** Duration in milliseconds */
  durationMs: number;
  /** Quality metrics */
  qualityMetrics?: {
    testsPassed?: number;
    testsFailed?: number;
    coveragePercent?: number;
    codeQualityScore?: number;
  };
  /** Rules applied during the task */
  appliedRules?: string[];
  /** Error information if failed */
  error?: {
    type: string;
    message: string;
  };
  /** Timestamp */
  timestamp: number;
}

/**
 * Rule optimization suggestion
 */
export interface RuleOptimization {
  /** Rule ID to optimize */
  ruleId: string;
  /** Type of optimization */
  optimizationType: 'parameter_adjustment' | 'context_restriction' | 'replacement' | 'deprecation';
  /** Current value/state */
  current: unknown;
  /** Suggested value/state */
  suggested: unknown;
  /** Reasoning for the suggestion */
  reasoning: string;
  /** Estimated improvement */
  estimatedImprovement: number;
  /** Confidence in the suggestion */
  confidence: number;
}

/**
 * A/B test variant
 */
export interface VariantTest {
  /** Test identifier */
  testId: string;
  /** Variant IDs (including control) */
  variants: string[];
  /** Start time */
  startTime: number;
  /** End time (null if ongoing) */
  endTime: number | null;
  /** Results per variant */
  results: Map<string, VariantResult>;
  /** Status */
  status: 'running' | 'completed' | 'cancelled';
  /** Winning variant (if determined) */
  winner: string | null;
  /** Statistical significance achieved */
  significanceAchieved: boolean;
}

/**
 * Variant test result
 */
export interface VariantResult {
  variantId: string;
  applications: number;
  successes: number;
  successRate: number;
  avgDurationMs: number;
}

/**
 * Evolution statistics
 */
export interface EvolutionStats {
  /** Total rules tracked */
  totalRules: number;
  /** Rules by promotion status */
  byStatus: Record<PromotionStatus, number>;
  /** Active A/B tests */
  activeTests: number;
  /** Completed A/B tests */
  completedTests: number;
  /** Rules auto-promoted */
  autoPromotions: number;
  /** Rules auto-demoted */
  autoDemotions: number;
  /** Total learning outcomes processed */
  learningOutcomes: number;
  /** Average rule success rate */
  avgSuccessRate: number;
  /** Rules above threshold */
  aboveThreshold: number;
  /** Rules below threshold */
  belowThreshold: number;
}

/**
 * Rule application record
 */
interface RuleApplication {
  ruleId: string;
  context: RuleContext;
  success: boolean;
  timestamp: number;
}

/**
 * Rule record in storage
 */
interface RuleRecord {
  ruleId: string;
  name: string;
  createdAt: number;
  promotionStatus: PromotionStatus;
  baseRuleId?: string;  // If this is a variant
  applications: RuleApplication[];
  promotionHistory: Array<{
    status: PromotionStatus;
    timestamp: number;
    reason: string;
  }>;
}

// ============================================================================
// Feature Flag Helpers
// ============================================================================

/**
 * Check if evolution pipeline is enabled
 */
export function isEvolutionPipelineEnabled(): boolean {
  const flags = governanceFlags.getFlags() as GovernanceFeatureFlags & {
    evolutionPipeline?: { enabled: boolean };
  };

  if (!flags.global.enableAllGates) return false;
  return flags.evolutionPipeline?.enabled ?? false;
}

/**
 * Get evolution pipeline flags with defaults
 */
function getEvolutionFlags(): {
  enabled: boolean;
  autoPromoteThreshold: number;
  autoDemoteThreshold: number;
  minSamplesForDecision: number;
  learningRate: number;
} {
  const flags = governanceFlags.getFlags() as GovernanceFeatureFlags & {
    evolutionPipeline?: {
      enabled: boolean;
      autoPromoteThreshold: number;
      autoDemoteThreshold: number;
      minSamplesForDecision: number;
      learningRate: number;
    };
  };

  return flags.evolutionPipeline ?? {
    enabled: false,
    autoPromoteThreshold: 0.9,
    autoDemoteThreshold: 0.3,
    minSamplesForDecision: 20,
    learningRate: 0.1,
  };
}

// ============================================================================
// Evolution Pipeline Integration Implementation
// ============================================================================

/**
 * Evolution Pipeline Integration for AQE ReasoningBank
 *
 * @example
 * ```typescript
 * const evolution = new EvolutionPipelineIntegration();
 * await evolution.initialize();
 *
 * // Track rule application
 * evolution.recordRuleApplication('rule-123', { domain: 'test-generation' }, true);
 *
 * // Get effectiveness
 * const effectiveness = evolution.getRuleEffectiveness('rule-123');
 * console.log(`Success rate: ${effectiveness.successRate}`);
 *
 * // Learn from task outcome
 * evolution.learnFromOutcome('task-456', {
 *   taskId: 'task-456',
 *   taskType: 'unit-test',
 *   success: true,
 *   durationMs: 1500,
 *   appliedRules: ['rule-123'],
 * });
 * ```
 */
export class EvolutionPipelineIntegration {
  private rules: Map<string, RuleRecord> = new Map();
  private variantTests: Map<string, VariantTest> = new Map();
  private taskOutcomes: Map<string, TaskOutcome> = new Map();
  private initialized = false;

  // KV persistence
  private db: UnifiedMemoryManager | null = null;
  private persistCount = 0;
  private static readonly NAMESPACE = 'rule-evolution';
  private static readonly TTL_SECONDS = 604800; // 7 days
  private static readonly PERSIST_INTERVAL = 10;

  // Statistics
  private stats = {
    autoPromotions: 0,
    autoDemotions: 0,
    learningOutcomes: 0,
  };

  // Time windows in milliseconds
  private readonly TIME_WINDOWS = {
    HOUR: 60 * 60 * 1000,
    DAY: 24 * 60 * 60 * 1000,
    WEEK: 7 * 24 * 60 * 60 * 1000,
  };

  /**
   * Initialize the Evolution Pipeline integration
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Initialize KV persistence
    try {
      this.db = getUnifiedMemory();
      if (!this.db.isInitialized()) await this.db.initialize();
      await this.loadFromKv();
    } catch (error) {
      console.warn('[EvolutionPipeline] DB init failed, using memory-only:', error instanceof Error ? error.message : String(error));
      this.db = null;
    }

    // Initialize with some default rules if needed
    this.initialized = true;
    this.logEvent('initialize', 'Evolution Pipeline initialized');
  }

  // ============================================================================
  // Rule Tracking
  // ============================================================================

  /**
   * Record a rule application and its outcome
   */
  recordRuleApplication(ruleId: string, context: RuleContext, success: boolean): void {
    if (!isEvolutionPipelineEnabled()) return;

    const record = this.getOrCreateRuleRecord(ruleId);
    const application: RuleApplication = {
      ruleId,
      context,
      success,
      timestamp: Date.now(),
    };

    record.applications.push(application);

    // Keep only recent history (last 1000 applications or 30 days)
    this.pruneApplicationHistory(record);

    // Check for automatic promotion/demotion
    this.checkAutoPromotionDemotion(ruleId);

    // Persist snapshot on interval
    this.persistSnapshot();

    this.logEvent('rule_application', `Rule ${ruleId} applied: ${success ? 'success' : 'failure'}`);
  }

  /**
   * Get effectiveness metrics for a rule
   */
  getRuleEffectiveness(ruleId: string): RuleEffectiveness {
    const record = this.rules.get(ruleId);

    if (!record) {
      return this.createEmptyEffectiveness(ruleId);
    }

    const now = Date.now();
    const applications = record.applications;

    // Calculate time-windowed success rates
    const apps1h = applications.filter(a => now - a.timestamp < this.TIME_WINDOWS.HOUR);
    const apps24h = applications.filter(a => now - a.timestamp < this.TIME_WINDOWS.DAY);
    const apps7d = applications.filter(a => now - a.timestamp < this.TIME_WINDOWS.WEEK);

    const totalApplications = applications.length;
    const successfulApplications = applications.filter(a => a.success).length;
    const successRate = totalApplications > 0 ? successfulApplications / totalApplications : 0;

    // Calculate confidence interval using Wilson score
    const confidenceInterval = this.calculateWilsonConfidenceInterval(
      successfulApplications,
      totalApplications,
      0.95
    );

    // Build domain effectiveness map
    const byDomain = new Map<string, DomainEffectiveness>();
    const domainGroups = this.groupBy(applications, a => a.context.domain || 'unknown');
    for (const [domain, domainApps] of Object.entries(domainGroups)) {
      const domainSuccesses = domainApps.filter(a => a.success).length;
      byDomain.set(domain, {
        domain,
        applications: domainApps.length,
        successes: domainSuccesses,
        successRate: domainApps.length > 0 ? domainSuccesses / domainApps.length : 0,
      });
    }

    // Build task type effectiveness map
    const byTaskType = new Map<string, TaskTypeEffectiveness>();
    const taskTypeGroups = this.groupBy(applications, a => a.context.taskType || 'unknown');
    for (const [taskType, taskTypeApps] of Object.entries(taskTypeGroups)) {
      const taskTypeSuccesses = taskTypeApps.filter(a => a.success).length;
      byTaskType.set(taskType, {
        taskType,
        applications: taskTypeApps.length,
        successes: taskTypeSuccesses,
        successRate: taskTypeApps.length > 0 ? taskTypeSuccesses / taskTypeApps.length : 0,
      });
    }

    const flags = getEvolutionFlags();
    const isStatisticallySignificant = totalApplications >= flags.minSamplesForDecision;

    return {
      ruleId,
      totalApplications,
      successfulApplications,
      successRate,
      successRate1h: this.calculateSuccessRate(apps1h),
      successRate24h: this.calculateSuccessRate(apps24h),
      successRate7d: this.calculateSuccessRate(apps7d),
      confidenceInterval,
      isStatisticallySignificant,
      byDomain,
      byTaskType,
      promotionStatus: record.promotionStatus,
      lastUpdated: now,
    };
  }

  // ============================================================================
  // Rule Evolution
  // ============================================================================

  /**
   * Promote a rule to higher status
   */
  promoteRule(ruleId: string, reason: string): void {
    if (!isEvolutionPipelineEnabled()) return;

    const record = this.getOrCreateRuleRecord(ruleId);
    const oldStatus = record.promotionStatus;

    // Determine new status based on current status
    let newStatus: PromotionStatus;
    switch (oldStatus) {
      case 'candidate':
      case 'demoted':
        newStatus = 'promoted';
        break;
      case 'deprecated':
        newStatus = 'candidate';  // Resurrect to candidate
        break;
      default:
        newStatus = oldStatus;  // Already promoted or variant
    }

    if (newStatus !== oldStatus) {
      record.promotionStatus = newStatus;
      record.promotionHistory.push({
        status: newStatus,
        timestamp: Date.now(),
        reason,
      });

      this.logEvent('rule_promotion', `Rule ${ruleId} promoted: ${oldStatus} -> ${newStatus}. Reason: ${reason}`);
    }
  }

  /**
   * Demote a rule to lower status
   */
  demoteRule(ruleId: string, reason: string): void {
    if (!isEvolutionPipelineEnabled()) return;

    const record = this.getOrCreateRuleRecord(ruleId);
    const oldStatus = record.promotionStatus;

    // Determine new status based on current status
    let newStatus: PromotionStatus;
    switch (oldStatus) {
      case 'promoted':
      case 'candidate':
        newStatus = 'demoted';
        break;
      case 'demoted':
        newStatus = 'deprecated';  // Further demotion leads to deprecation
        break;
      default:
        newStatus = oldStatus;
    }

    if (newStatus !== oldStatus) {
      record.promotionStatus = newStatus;
      record.promotionHistory.push({
        status: newStatus,
        timestamp: Date.now(),
        reason,
      });

      this.logEvent('rule_demotion', `Rule ${ruleId} demoted: ${oldStatus} -> ${newStatus}. Reason: ${reason}`);
    }
  }

  /**
   * Create a variant of an existing rule for A/B testing
   */
  createVariant(baseRuleId: string, modifications: RuleModifications): string {
    if (!isEvolutionPipelineEnabled()) {
      return `${baseRuleId}-variant-disabled`;
    }

    const baseRecord = this.rules.get(baseRuleId);
    const variantId = `${baseRuleId}-variant-${Date.now()}`;

    const variantRecord: RuleRecord = {
      ruleId: variantId,
      name: modifications.name || `${baseRecord?.name || baseRuleId} (Variant)`,
      createdAt: Date.now(),
      promotionStatus: 'variant',
      baseRuleId,
      applications: [],
      promotionHistory: [
        {
          status: 'variant',
          timestamp: Date.now(),
          reason: `Variant created: ${modifications.changeDescription}`,
        },
      ],
    };

    this.rules.set(variantId, variantRecord);

    this.logEvent('variant_created', `Variant ${variantId} created from ${baseRuleId}: ${modifications.changeDescription}`);

    return variantId;
  }

  // ============================================================================
  // Learning
  // ============================================================================

  /**
   * Learn from a task outcome, updating rule effectiveness
   */
  learnFromOutcome(taskId: string, outcome: TaskOutcome): void {
    if (!isEvolutionPipelineEnabled()) return;

    this.taskOutcomes.set(taskId, outcome);
    this.stats.learningOutcomes++;

    // Update effectiveness for all applied rules
    if (outcome.appliedRules && outcome.appliedRules.length > 0) {
      const context: RuleContext = {
        taskType: outcome.taskType,
      };

      for (const ruleId of outcome.appliedRules) {
        this.recordRuleApplication(ruleId, context, outcome.success);
      }
    }

    // Keep outcome history limited
    if (this.taskOutcomes.size > 10000) {
      const oldest = Array.from(this.taskOutcomes.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp)
        .slice(0, 1000);
      for (const [id] of oldest) {
        this.taskOutcomes.delete(id);
      }
    }

    this.logEvent('learning_outcome', `Learned from task ${taskId}: ${outcome.success ? 'success' : 'failure'}`);
  }

  /**
   * Generate rule optimization suggestions based on collected data
   */
  suggestRuleOptimizations(): RuleOptimization[] {
    if (!isEvolutionPipelineEnabled()) return [];

    const suggestions: RuleOptimization[] = [];
    const flags = getEvolutionFlags();

    for (const [ruleId, _record] of Array.from(this.rules.entries())) {
      const effectiveness = this.getRuleEffectiveness(ruleId);

      if (!effectiveness.isStatisticallySignificant) {
        continue;  // Not enough data
      }

      // Suggest deprecation for consistently poor performers
      if (effectiveness.successRate < flags.autoDemoteThreshold) {
        suggestions.push({
          ruleId,
          optimizationType: 'deprecation',
          current: effectiveness.successRate,
          suggested: null,
          reasoning: `Rule has ${(effectiveness.successRate * 100).toFixed(1)}% success rate (below ${(flags.autoDemoteThreshold * 100).toFixed(1)}% threshold)`,
          estimatedImprovement: 1 - effectiveness.successRate,
          confidence: Math.min(1, effectiveness.totalApplications / 100),
        });
        continue;
      }

      // Suggest context restrictions for rules that perform better in specific domains
      for (const [domain, domainEff] of Array.from(effectiveness.byDomain.entries())) {
        if (domainEff.applications >= 10 && domainEff.successRate > effectiveness.successRate + 0.1) {
          suggestions.push({
            ruleId,
            optimizationType: 'context_restriction',
            current: { domain: 'all' },
            suggested: { domain },
            reasoning: `Rule performs ${((domainEff.successRate - effectiveness.successRate) * 100).toFixed(1)}% better in ${domain} domain`,
            estimatedImprovement: domainEff.successRate - effectiveness.successRate,
            confidence: Math.min(1, domainEff.applications / 50),
          });
        }
      }

      // Suggest context restrictions for task types
      for (const [taskType, taskTypeEff] of Array.from(effectiveness.byTaskType.entries())) {
        if (taskTypeEff.applications >= 10 && taskTypeEff.successRate > effectiveness.successRate + 0.1) {
          suggestions.push({
            ruleId,
            optimizationType: 'context_restriction',
            current: { taskType: 'all' },
            suggested: { taskType },
            reasoning: `Rule performs ${((taskTypeEff.successRate - effectiveness.successRate) * 100).toFixed(1)}% better for ${taskType} tasks`,
            estimatedImprovement: taskTypeEff.successRate - effectiveness.successRate,
            confidence: Math.min(1, taskTypeEff.applications / 50),
          });
        }
      }
    }

    // Sort by estimated improvement
    suggestions.sort((a, b) => b.estimatedImprovement - a.estimatedImprovement);

    return suggestions;
  }

  // ============================================================================
  // A/B Testing Support
  // ============================================================================

  /**
   * Register a new variant test
   */
  registerVariantTest(testId: string, variants: string[]): void {
    if (!isEvolutionPipelineEnabled()) return;

    if (variants.length < 2) {
      throw new Error('A/B test requires at least 2 variants');
    }

    const test: VariantTest = {
      testId,
      variants,
      startTime: Date.now(),
      endTime: null,
      results: new Map(),
      status: 'running',
      winner: null,
      significanceAchieved: false,
    };

    // Initialize results for each variant
    for (const variantId of variants) {
      test.results.set(variantId, {
        variantId,
        applications: 0,
        successes: 0,
        successRate: 0,
        avgDurationMs: 0,
      });
    }

    this.variantTests.set(testId, test);

    this.logEvent('variant_test_registered', `A/B test ${testId} registered with ${variants.length} variants`);
  }

  /**
   * Record outcome for a variant in an A/B test
   */
  recordVariantOutcome(testId: string, variantId: string, success: boolean, durationMs?: number): void {
    if (!isEvolutionPipelineEnabled()) return;

    const test = this.variantTests.get(testId);
    if (!test) {
      this.logEvent('variant_test_error', `A/B test ${testId} not found`);
      return;
    }

    if (test.status !== 'running') {
      this.logEvent('variant_test_error', `A/B test ${testId} is not running (status: ${test.status})`);
      return;
    }

    const result = test.results.get(variantId);
    if (!result) {
      this.logEvent('variant_test_error', `Variant ${variantId} not found in test ${testId}`);
      return;
    }

    // Update results
    result.applications++;
    if (success) {
      result.successes++;
    }
    result.successRate = result.applications > 0 ? result.successes / result.applications : 0;

    if (durationMs !== undefined) {
      result.avgDurationMs = (result.avgDurationMs * (result.applications - 1) + durationMs) / result.applications;
    }

    // Check for statistical significance
    this.checkVariantTestSignificance(test);
  }

  /**
   * Get the winning variant from a test
   */
  getWinningVariant(testId: string): string | null {
    const test = this.variantTests.get(testId);
    if (!test) return null;

    if (test.winner) {
      return test.winner;
    }

    // Calculate if there's a clear winner even if test is still running
    if (test.significanceAchieved) {
      return this.determineWinner(test);
    }

    return null;
  }

  /**
   * Get all active A/B tests
   */
  getActiveTests(): VariantTest[] {
    return Array.from(this.variantTests.values()).filter(t => t.status === 'running');
  }

  /**
   * Complete an A/B test
   */
  completeVariantTest(testId: string): VariantTest | null {
    const test = this.variantTests.get(testId);
    if (!test) return null;

    test.status = 'completed';
    test.endTime = Date.now();
    test.winner = this.determineWinner(test);

    // Promote winner if significance achieved
    if (test.winner && test.significanceAchieved) {
      this.promoteRule(test.winner, `Won A/B test ${testId}`);
    }

    this.logEvent('variant_test_completed', `A/B test ${testId} completed. Winner: ${test.winner || 'none'}`);

    return test;
  }

  /**
   * Cancel an A/B test
   */
  cancelVariantTest(testId: string): void {
    const test = this.variantTests.get(testId);
    if (!test) return;

    test.status = 'cancelled';
    test.endTime = Date.now();

    this.logEvent('variant_test_cancelled', `A/B test ${testId} cancelled`);
  }

  // ============================================================================
  // Statistics
  // ============================================================================

  /**
   * Get evolution statistics
   */
  getEvolutionStats(): EvolutionStats {
    const rules = Array.from(this.rules.values());
    const flags = getEvolutionFlags();

    // Count by status
    const byStatus: Record<PromotionStatus, number> = {
      candidate: 0,
      promoted: 0,
      demoted: 0,
      deprecated: 0,
      variant: 0,
      control: 0,
    };

    let totalSuccessRate = 0;
    let aboveThreshold = 0;
    let belowThreshold = 0;
    let rulesWithData = 0;

    for (const rule of rules) {
      byStatus[rule.promotionStatus]++;

      const effectiveness = this.getRuleEffectiveness(rule.ruleId);
      if (effectiveness.totalApplications > 0) {
        rulesWithData++;
        totalSuccessRate += effectiveness.successRate;

        if (effectiveness.successRate >= flags.autoPromoteThreshold) {
          aboveThreshold++;
        } else if (effectiveness.successRate <= flags.autoDemoteThreshold) {
          belowThreshold++;
        }
      }
    }

    const activeTests = Array.from(this.variantTests.values()).filter(t => t.status === 'running').length;
    const completedTests = Array.from(this.variantTests.values()).filter(t => t.status === 'completed').length;

    return {
      totalRules: rules.length,
      byStatus,
      activeTests,
      completedTests,
      autoPromotions: this.stats.autoPromotions,
      autoDemotions: this.stats.autoDemotions,
      learningOutcomes: this.stats.learningOutcomes,
      avgSuccessRate: rulesWithData > 0 ? totalSuccessRate / rulesWithData : 0,
      aboveThreshold,
      belowThreshold,
    };
  }

  /**
   * Get all rule records
   */
  getAllRules(): RuleRecord[] {
    return Array.from(this.rules.values());
  }

  /**
   * Get rules by promotion status
   */
  getRulesByStatus(status: PromotionStatus): string[] {
    return Array.from(this.rules.entries())
      .filter(([_, record]) => record.promotionStatus === status)
      .map(([id]) => id);
  }

  // ============================================================================
  // State Management
  // ============================================================================

  /**
   * Reset all state
   */
  reset(): void {
    this.rules.clear();
    this.variantTests.clear();
    this.taskOutcomes.clear();
    this.stats = {
      autoPromotions: 0,
      autoDemotions: 0,
      learningOutcomes: 0,
    };
    this.initialized = false;
  }

  /**
   * Reset a specific rule
   */
  resetRule(ruleId: string): void {
    this.rules.delete(ruleId);
  }

  // ============================================================================
  // KV Persistence
  // ============================================================================

  /**
   * Load rules snapshot from KV store
   */
  private async loadFromKv(): Promise<void> {
    if (!this.db) return;
    const data = await this.db.kvGet<Record<string, RuleRecord>>('snapshot', EvolutionPipelineIntegration.NAMESPACE);
    if (data) {
      for (const [key, record] of Object.entries(data)) {
        this.rules.set(key, record);
      }
    }
  }

  /**
   * Persist rules snapshot to KV store on interval
   */
  private persistSnapshot(): void {
    if (!this.db) return;
    this.persistCount++;
    if (this.persistCount % EvolutionPipelineIntegration.PERSIST_INTERVAL !== 0) return;
    try {
      const snapshot: Record<string, RuleRecord> = Object.fromEntries(this.rules);
      this.db.kvSet('snapshot', snapshot, EvolutionPipelineIntegration.NAMESPACE, EvolutionPipelineIntegration.TTL_SECONDS).catch(() => {});
    } catch (error) {
      console.warn('[EvolutionPipeline] Persist failed:', error instanceof Error ? error.message : String(error));
    }
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  /**
   * Get or create a rule record
   */
  private getOrCreateRuleRecord(ruleId: string): RuleRecord {
    let record = this.rules.get(ruleId);

    if (!record) {
      record = {
        ruleId,
        name: ruleId,
        createdAt: Date.now(),
        promotionStatus: 'candidate',
        applications: [],
        promotionHistory: [
          {
            status: 'candidate',
            timestamp: Date.now(),
            reason: 'Initial creation',
          },
        ],
      };
      this.rules.set(ruleId, record);
    }

    return record;
  }

  /**
   * Create empty effectiveness metrics
   */
  private createEmptyEffectiveness(ruleId: string): RuleEffectiveness {
    return {
      ruleId,
      totalApplications: 0,
      successfulApplications: 0,
      successRate: 0,
      successRate1h: 0,
      successRate24h: 0,
      successRate7d: 0,
      confidenceInterval: { lower: 0, upper: 1 },
      isStatisticallySignificant: false,
      byDomain: new Map(),
      byTaskType: new Map(),
      promotionStatus: 'candidate',
      lastUpdated: Date.now(),
    };
  }

  /**
   * Calculate success rate from applications
   */
  private calculateSuccessRate(applications: RuleApplication[]): number {
    if (applications.length === 0) return 0;
    const successes = applications.filter(a => a.success).length;
    return successes / applications.length;
  }

  /**
   * Calculate Wilson confidence interval
   * @see https://en.wikipedia.org/wiki/Binomial_proportion_confidence_interval#Wilson_score_interval
   */
  private calculateWilsonConfidenceInterval(
    successes: number,
    total: number,
    confidence: number
  ): { lower: number; upper: number } {
    if (total === 0) {
      return { lower: 0, upper: 1 };
    }

    // Z-score for confidence level (95% = 1.96)
    const z = confidence === 0.95 ? 1.96 : confidence === 0.99 ? 2.576 : 1.645;
    const p = successes / total;
    const n = total;

    const denominator = 1 + (z * z) / n;
    const center = p + (z * z) / (2 * n);
    const spread = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n);

    const lower = Math.max(0, (center - spread) / denominator);
    const upper = Math.min(1, (center + spread) / denominator);

    return { lower, upper };
  }

  /**
   * Check and perform automatic promotion/demotion
   */
  private checkAutoPromotionDemotion(ruleId: string): void {
    const flags = getEvolutionFlags();
    const effectiveness = this.getRuleEffectiveness(ruleId);

    if (!effectiveness.isStatisticallySignificant) {
      return;  // Not enough samples
    }

    const record = this.rules.get(ruleId);
    if (!record) return;

    // Auto-promote if above threshold
    if (
      effectiveness.successRate >= flags.autoPromoteThreshold &&
      record.promotionStatus !== 'promoted' &&
      record.promotionStatus !== 'variant'
    ) {
      this.promoteRule(ruleId, `Auto-promoted: ${(effectiveness.successRate * 100).toFixed(1)}% success rate >= ${(flags.autoPromoteThreshold * 100).toFixed(1)}% threshold`);
      this.stats.autoPromotions++;
    }

    // Auto-demote if below threshold
    if (
      effectiveness.successRate <= flags.autoDemoteThreshold &&
      record.promotionStatus !== 'demoted' &&
      record.promotionStatus !== 'deprecated'
    ) {
      this.demoteRule(ruleId, `Auto-demoted: ${(effectiveness.successRate * 100).toFixed(1)}% success rate <= ${(flags.autoDemoteThreshold * 100).toFixed(1)}% threshold`);
      this.stats.autoDemotions++;
    }
  }

  /**
   * Prune old application history
   */
  private pruneApplicationHistory(record: RuleRecord): void {
    const maxApplications = 1000;
    const maxAge = 30 * 24 * 60 * 60 * 1000;  // 30 days
    const now = Date.now();

    // Filter by age first
    record.applications = record.applications.filter(
      a => now - a.timestamp < maxAge
    );

    // Then by count
    if (record.applications.length > maxApplications) {
      record.applications = record.applications.slice(-maxApplications);
    }
  }

  /**
   * Group array by key function
   */
  private groupBy<T>(array: T[], keyFn: (item: T) => string): Record<string, T[]> {
    const groups: Record<string, T[]> = {};
    for (const item of array) {
      const key = keyFn(item);
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(item);
    }
    return groups;
  }

  /**
   * Check if an A/B test has achieved statistical significance
   */
  private checkVariantTestSignificance(test: VariantTest): void {
    const flags = getEvolutionFlags();
    const results = Array.from(test.results.values());

    // Check if all variants have minimum samples
    const allHaveMinSamples = results.every(r => r.applications >= flags.minSamplesForDecision);
    if (!allHaveMinSamples) {
      return;
    }

    // Use chi-square test approximation for statistical significance
    const totalApps = results.reduce((sum, r) => sum + r.applications, 0);
    const overallSuccessRate = results.reduce((sum, r) => sum + r.successes, 0) / totalApps;

    let chiSquare = 0;
    for (const result of results) {
      const expected = result.applications * overallSuccessRate;
      if (expected > 0) {
        const diff = result.successes - expected;
        chiSquare += (diff * diff) / expected;
      }
    }

    // Chi-square critical value for p=0.05 with df=variants-1
    const criticalValue = results.length === 2 ? 3.841 : results.length === 3 ? 5.991 : 7.815;

    test.significanceAchieved = chiSquare >= criticalValue;

    if (test.significanceAchieved) {
      test.winner = this.determineWinner(test);
      this.logEvent('variant_test_significant', `A/B test ${test.testId} achieved significance. Winner: ${test.winner}`);
    }
  }

  /**
   * Determine the winning variant
   */
  private determineWinner(test: VariantTest): string | null {
    const results = Array.from(test.results.values());
    if (results.length === 0) return null;

    // Find variant with highest success rate
    let best = results[0];
    for (const result of results) {
      if (result.successRate > best.successRate) {
        best = result;
      }
    }

    return best.variantId;
  }

  /**
   * Log governance event
   */
  private logEvent(eventType: string, message: string): void {
    if (!governanceFlags.getFlags().global.logViolations) return;

    console.info(`[EvolutionPipeline] ${eventType}:`, {
      message,
      timestamp: new Date().toISOString(),
    });
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

/**
 * Singleton instance of the Evolution Pipeline integration
 */
export const evolutionPipelineIntegration = new EvolutionPipelineIntegration();

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a task outcome object
 */
export function createTaskOutcome(
  taskId: string,
  taskType: string,
  success: boolean,
  durationMs: number,
  options: {
    qualityMetrics?: TaskOutcome['qualityMetrics'];
    appliedRules?: string[];
    error?: TaskOutcome['error'];
  } = {}
): TaskOutcome {
  return {
    taskId,
    taskType,
    success,
    durationMs,
    qualityMetrics: options.qualityMetrics,
    appliedRules: options.appliedRules,
    error: options.error,
    timestamp: Date.now(),
  };
}

/**
 * Convenience wrapper to track and learn from a rule application
 */
export async function withRuleTracking<T>(
  ruleId: string,
  context: RuleContext,
  execute: () => Promise<T>
): Promise<T> {
  const startTime = Date.now();

  try {
    const result = await execute();
    evolutionPipelineIntegration.recordRuleApplication(ruleId, context, true);
    return result;
  } catch (error) {
    evolutionPipelineIntegration.recordRuleApplication(ruleId, context, false);
    throw error;
  }
}
