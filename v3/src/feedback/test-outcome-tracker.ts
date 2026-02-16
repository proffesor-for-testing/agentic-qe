/**
 * Test Outcome Tracker
 * ADR-023: Quality Feedback Loop System
 *
 * Tracks test outcomes and updates pattern quality in the ReasoningBank.
 */

import type {
  TestOutcome,
  TestOutcomeStats,
  CoverageMetrics,
  FeedbackConfig,
  PatternTier,
} from './types.js';
import type { TestFramework, ProgrammingLanguage } from '../routing/types.js';
import { DEFAULT_FEEDBACK_CONFIG } from './types.js';
import type { QEDomain } from '../learning/qe-patterns.js';
import type { RealQEReasoningBank } from '../learning/real-qe-reasoning-bank.js';
import { getUnifiedMemory, type UnifiedMemoryManager } from '../kernel/unified-memory.js';

// ============================================================================
// Database Row Types
// ============================================================================

/** Database row structure for test_outcomes table */
interface TestOutcomeRow {
  id: string;
  test_id: string;
  test_name: string;
  generated_by: string;
  pattern_id: string | null;
  framework: string;
  language: string;
  domain: string;
  passed: number;
  error_message: string | null;
  coverage_lines: number;
  coverage_branches: number;
  coverage_functions: number;
  mutation_score: number | null;
  execution_time_ms: number;
  flaky: number;
  flakiness_score: number | null;
  maintainability_score: number;
  complexity: number | null;
  lines_of_code: number | null;
  assertion_count: number | null;
  file_path: string | null;
  source_file_path: string | null;
  metadata_json: string | null;
  created_at: string;
}

// ============================================================================
// Outcome Store
// ============================================================================

/**
 * In-memory store for test outcomes (can be persisted)
 */
class OutcomeStore {
  private outcomes: TestOutcome[] = [];
  private readonly maxOutcomes: number;

  constructor(maxOutcomes: number) {
    this.maxOutcomes = maxOutcomes;
  }

  add(outcome: TestOutcome): void {
    this.outcomes.push(outcome);
    if (this.outcomes.length > this.maxOutcomes) {
      this.outcomes = this.outcomes.slice(-this.maxOutcomes);
    }
  }

  getAll(): TestOutcome[] {
    return [...this.outcomes];
  }

  getByPattern(patternId: string): TestOutcome[] {
    return this.outcomes.filter(o => o.patternId === patternId);
  }

  getByAgent(agentId: string): TestOutcome[] {
    return this.outcomes.filter(o => o.generatedBy === agentId);
  }

  getByDomain(domain: QEDomain): TestOutcome[] {
    return this.outcomes.filter(o => o.domain === domain);
  }

  getRecent(count: number): TestOutcome[] {
    return this.outcomes.slice(-count);
  }

  clear(): void {
    this.outcomes = [];
  }

  get size(): number {
    return this.outcomes.length;
  }
}

// ============================================================================
// Test Outcome Tracker
// ============================================================================

/**
 * Tracks test outcomes and updates pattern quality
 */
export class TestOutcomeTracker {
  private store: OutcomeStore;
  private reasoningBank: RealQEReasoningBank | null = null;
  private config: FeedbackConfig;
  private db: UnifiedMemoryManager | null = null;
  private persistCount = 0;
  private static readonly RETENTION_CLEANUP_INTERVAL = 100;

  // Pattern metrics cache
  private patternMetrics: Map<string, {
    successCount: number;
    failureCount: number;
    totalQuality: number;
    outcomes: number;
  }> = new Map();

  constructor(config: Partial<FeedbackConfig> = {}) {
    this.config = { ...DEFAULT_FEEDBACK_CONFIG, ...config };
    this.store = new OutcomeStore(this.config.maxOutcomesInMemory);
  }

  /**
   * Connect to ReasoningBank for pattern updates
   */
  connectReasoningBank(bank: RealQEReasoningBank): void {
    this.reasoningBank = bank;
  }

  /**
   * Initialize DB persistence (optional - tracker works without it)
   */
  async initialize(): Promise<void> {
    try {
      this.db = getUnifiedMemory();
      if (!this.db.isInitialized()) {
        await this.db.initialize();
      }
      await this.loadFromDb();
    } catch (error) {
      console.warn('[TestOutcomeTracker] DB initialization failed, using memory-only:', error instanceof Error ? error.message : String(error));
      this.db = null;
    }
  }

  /**
   * Load outcomes from DB into memory
   */
  private async loadFromDb(): Promise<void> {
    if (!this.db) return;
    const database = this.db.getDatabase();
    const rows = database.prepare(`
      SELECT * FROM test_outcomes ORDER BY created_at DESC LIMIT ?
    `).all(this.config.maxOutcomesInMemory) as TestOutcomeRow[];

    // Load in chronological order (oldest first)
    for (const row of rows.reverse()) {
      const outcome: TestOutcome = {
        id: row.id,
        testId: row.test_id,
        testName: row.test_name,
        generatedBy: row.generated_by,
        patternId: row.pattern_id || undefined,
        framework: row.framework as TestFramework,
        language: row.language as ProgrammingLanguage,
        domain: row.domain as QEDomain,
        passed: Boolean(row.passed),
        errorMessage: row.error_message || undefined,
        coverage: {
          lines: row.coverage_lines,
          branches: row.coverage_branches,
          functions: row.coverage_functions,
        },
        mutationScore: row.mutation_score ?? undefined,
        executionTimeMs: row.execution_time_ms,
        flaky: Boolean(row.flaky),
        flakinessScore: row.flakiness_score ?? undefined,
        maintainabilityScore: row.maintainability_score,
        complexity: row.complexity ?? undefined,
        linesOfCode: row.lines_of_code ?? undefined,
        assertionCount: row.assertion_count ?? undefined,
        filePath: row.file_path || undefined,
        sourceFilePath: row.source_file_path || undefined,
        timestamp: new Date(row.created_at),
        metadata: row.metadata_json ? JSON.parse(row.metadata_json) : undefined,
      };
      this.store.add(outcome);
      if (outcome.patternId) {
        this.updatePatternMetrics(outcome);
      }
    }
    if (rows.length > 0) {
      console.log(`[TestOutcomeTracker] Loaded ${rows.length} outcomes from DB`);
    }
  }

  /**
   * Persist a single outcome to DB (write-through)
   */
  private persistOutcome(outcome: TestOutcome): void {
    if (!this.db) return;
    try {
      const database = this.db.getDatabase();
      database.prepare(`
        INSERT OR REPLACE INTO test_outcomes (
          id, test_id, test_name, generated_by, pattern_id,
          framework, language, domain, passed, error_message,
          coverage_lines, coverage_branches, coverage_functions,
          mutation_score, execution_time_ms, flaky, flakiness_score,
          maintainability_score, complexity, lines_of_code,
          assertion_count, file_path, source_file_path, metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        outcome.id, outcome.testId, outcome.testName, outcome.generatedBy,
        outcome.patternId || null,
        outcome.framework, outcome.language, outcome.domain,
        outcome.passed ? 1 : 0, outcome.errorMessage || null,
        outcome.coverage.lines, outcome.coverage.branches, outcome.coverage.functions,
        outcome.mutationScore ?? null, outcome.executionTimeMs,
        outcome.flaky ? 1 : 0, outcome.flakinessScore ?? null,
        outcome.maintainabilityScore, outcome.complexity ?? null,
        outcome.linesOfCode ?? null, outcome.assertionCount ?? null,
        outcome.filePath || null, outcome.sourceFilePath || null,
        outcome.metadata ? JSON.stringify(outcome.metadata) : null
      );
      this.persistCount++;
      if (this.persistCount % TestOutcomeTracker.RETENTION_CLEANUP_INTERVAL === 0) {
        this.enforceRetention(database);
      }
    } catch (error) {
      console.warn('[TestOutcomeTracker] Failed to persist outcome:', error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Delete oldest rows beyond retention limit
   */
  private enforceRetention(database: ReturnType<UnifiedMemoryManager['getDatabase']>): void {
    try {
      const maxRows = this.config.maxOutcomesInMemory * 2; // Keep 2x in-memory limit in DB
      database.prepare(`
        DELETE FROM test_outcomes WHERE id NOT IN (
          SELECT id FROM test_outcomes ORDER BY created_at DESC LIMIT ?
        )
      `).run(maxRows);
    } catch (error) {
      console.warn('[TestOutcomeTracker] Retention cleanup failed:', error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Track a test outcome
   */
  async track(outcome: TestOutcome): Promise<void> {
    // 1. Store outcome
    this.store.add(outcome);
    this.persistOutcome(outcome);

    // 2. Update pattern metrics if pattern was used
    if (outcome.patternId) {
      this.updatePatternMetrics(outcome);

      // 3. Update ReasoningBank pattern quality
      if (this.reasoningBank) {
        await this.updateReasoningBankPattern(outcome);
      }

      // 4. Check for pattern promotion/demotion
      if (this.config.autoPromote || this.config.autoDemote) {
        await this.checkPatternTierChange(outcome.patternId);
      }
    }
  }

  /**
   * Track multiple outcomes in batch
   */
  async trackBatch(outcomes: TestOutcome[]): Promise<void> {
    for (const outcome of outcomes) {
      await this.track(outcome);
    }
  }

  /**
   * Update pattern metrics from outcome
   */
  private updatePatternMetrics(outcome: TestOutcome): void {
    const patternId = outcome.patternId!;
    const existing = this.patternMetrics.get(patternId) || {
      successCount: 0,
      failureCount: 0,
      totalQuality: 0,
      outcomes: 0,
    };

    if (outcome.passed && !outcome.flaky) {
      existing.successCount++;
    } else {
      existing.failureCount++;
    }

    existing.totalQuality += outcome.maintainabilityScore;
    existing.outcomes++;

    this.patternMetrics.set(patternId, existing);
  }

  /**
   * Update ReasoningBank pattern based on outcome
   */
  private async updateReasoningBankPattern(outcome: TestOutcome): Promise<void> {
    if (!this.reasoningBank || !outcome.patternId) return;

    // Calculate quality delta
    const qualityScore = this.calculateOutcomeQuality(outcome);
    const success = outcome.passed && !outcome.flaky;

    // Record outcome in ReasoningBank
    await this.reasoningBank.recordPatternOutcome(
      outcome.patternId,
      success,
      qualityScore
    );
  }

  /**
   * Calculate quality score for an outcome
   */
  private calculateOutcomeQuality(outcome: TestOutcome): number {
    const weights = this.config.qualityWeights;

    // Effectiveness: passed and not flaky
    const effectiveness = outcome.passed && !outcome.flaky ? 1.0 : 0.0;

    // Coverage: average of all metrics
    const coverage = (
      outcome.coverage.lines +
      outcome.coverage.branches +
      outcome.coverage.functions
    ) / 3 / 100;

    // Mutation: if available
    const mutationKill = outcome.mutationScore ?? 0.5;

    // Stability: inverse of flakiness
    const stability = outcome.flaky ? 0.2 : (1 - (outcome.flakinessScore ?? 0));

    // Maintainability: directly from outcome
    const maintainability = outcome.maintainabilityScore;

    // Performance: based on execution time (faster = better)
    // Assume <100ms = 1.0, >10s = 0.0
    const maxTime = 10000;
    const performance = Math.max(0, 1 - outcome.executionTimeMs / maxTime);

    return (
      weights.effectiveness * effectiveness +
      weights.coverage * coverage +
      weights.mutationKill * mutationKill +
      weights.stability * stability +
      weights.maintainability * maintainability +
      weights.performance * performance
    );
  }

  /**
   * Check if pattern should be promoted or demoted
   */
  private async checkPatternTierChange(patternId: string): Promise<void> {
    if (!this.reasoningBank) return;

    const metrics = this.patternMetrics.get(patternId);
    if (!metrics) return;

    const successRate = metrics.successCount / (metrics.successCount + metrics.failureCount);
    const avgQuality = metrics.totalQuality / metrics.outcomes;

    // Check for promotion
    if (this.config.autoPromote) {
      const shouldPromote = await this.reasoningBank.checkPatternPromotion(
        patternId,
        metrics.successCount,
        successRate,
        avgQuality
      );

      if (shouldPromote) {
        await this.reasoningBank.promotePattern(patternId);
      }
    }

    // Check for demotion (if recent performance is poor)
    if (this.config.autoDemote) {
      const recentOutcomes = this.store.getByPattern(patternId).slice(-10);
      if (recentOutcomes.length >= 5) {
        const recentSuccessRate = recentOutcomes.filter(
          o => o.passed && !o.flaky
        ).length / recentOutcomes.length;

        if (recentSuccessRate < 0.3) {
          await this.reasoningBank.demotePattern(patternId);
        }
      }
    }
  }

  /**
   * Get statistics for all tracked outcomes
   */
  getStats(): TestOutcomeStats {
    const outcomes = this.store.getAll();

    if (outcomes.length === 0) {
      return this.emptyStats();
    }

    const passedTests = outcomes.filter(o => o.passed).length;

    // Aggregate coverage
    const avgCoverage: CoverageMetrics = {
      lines: outcomes.reduce((sum, o) => sum + o.coverage.lines, 0) / outcomes.length,
      branches: outcomes.reduce((sum, o) => sum + o.coverage.branches, 0) / outcomes.length,
      functions: outcomes.reduce((sum, o) => sum + o.coverage.functions, 0) / outcomes.length,
    };

    // Aggregate other metrics
    const mutationScores = outcomes.filter(o => o.mutationScore !== undefined);
    const avgMutationScore = mutationScores.length > 0
      ? mutationScores.reduce((sum, o) => sum + o.mutationScore!, 0) / mutationScores.length
      : 0;

    const avgExecutionTimeMs = outcomes.reduce((sum, o) => sum + o.executionTimeMs, 0) / outcomes.length;
    const flakyTests = outcomes.filter(o => o.flaky).length;
    const avgMaintainability = outcomes.reduce((sum, o) => sum + o.maintainabilityScore, 0) / outcomes.length;

    // Stats by agent
    const byAgent = new Map<string, { total: number; passed: number; avgCoverage: number; avgMaintainability: number }>();
    const agentGroups = this.groupBy(outcomes, o => o.generatedBy);
    for (const [agent, agentOutcomes] of agentGroups) {
      byAgent.set(agent, {
        total: agentOutcomes.length,
        passed: agentOutcomes.filter(o => o.passed).length,
        avgCoverage: agentOutcomes.reduce((sum, o) => sum + o.coverage.lines, 0) / agentOutcomes.length,
        avgMaintainability: agentOutcomes.reduce((sum, o) => sum + o.maintainabilityScore, 0) / agentOutcomes.length,
      });
    }

    // Stats by domain
    const byDomain = new Map<QEDomain, { total: number; passed: number; avgCoverage: number }>();
    const domainGroups = this.groupBy(outcomes, o => o.domain);
    for (const [domain, domainOutcomes] of domainGroups) {
      byDomain.set(domain as QEDomain, {
        total: domainOutcomes.length,
        passed: domainOutcomes.filter(o => o.passed).length,
        avgCoverage: domainOutcomes.reduce((sum, o) => sum + o.coverage.lines, 0) / domainOutcomes.length,
      });
    }

    return {
      totalTests: outcomes.length,
      passedTests,
      passRate: passedTests / outcomes.length,
      avgCoverage,
      avgMutationScore,
      avgExecutionTimeMs,
      flakyTests,
      avgMaintainability,
      byAgent,
      byDomain,
    };
  }

  /**
   * Get pattern performance metrics
   */
  getPatternMetrics(patternId: string): {
    successCount: number;
    failureCount: number;
    successRate: number;
    avgQuality: number;
  } | null {
    const metrics = this.patternMetrics.get(patternId);
    if (!metrics) return null;

    const total = metrics.successCount + metrics.failureCount;
    return {
      successCount: metrics.successCount,
      failureCount: metrics.failureCount,
      successRate: total > 0 ? metrics.successCount / total : 0,
      avgQuality: metrics.outcomes > 0 ? metrics.totalQuality / metrics.outcomes : 0,
    };
  }

  /**
   * Get all pattern metrics
   */
  getAllPatternMetrics(): Map<string, {
    successCount: number;
    failureCount: number;
    successRate: number;
    avgQuality: number;
  }> {
    const result = new Map();
    for (const [patternId, _] of this.patternMetrics) {
      result.set(patternId, this.getPatternMetrics(patternId));
    }
    return result;
  }

  /**
   * Get outcomes for a specific agent
   */
  getAgentOutcomes(agentId: string): TestOutcome[] {
    return this.store.getByAgent(agentId);
  }

  /**
   * Get recent outcomes
   */
  getRecentOutcomes(count: number): TestOutcome[] {
    return this.store.getRecent(count);
  }

  /**
   * Export outcomes for persistence
   */
  exportOutcomes(): TestOutcome[] {
    return this.store.getAll();
  }

  /**
   * Import outcomes from persistence
   */
  importOutcomes(outcomes: TestOutcome[]): void {
    for (const outcome of outcomes) {
      this.store.add(outcome);
      if (outcome.patternId) {
        this.updatePatternMetrics(outcome);
      }
    }
  }

  /**
   * Clear all tracked outcomes
   */
  clear(): void {
    this.store.clear();
    this.patternMetrics.clear();
  }

  /**
   * Get tracker statistics
   */
  getTrackerStats(): {
    totalOutcomes: number;
    patternsTracked: number;
    hasReasoningBank: boolean;
  } {
    return {
      totalOutcomes: this.store.size,
      patternsTracked: this.patternMetrics.size,
      hasReasoningBank: this.reasoningBank !== null,
    };
  }

  // Helper methods

  private emptyStats(): TestOutcomeStats {
    return {
      totalTests: 0,
      passedTests: 0,
      passRate: 0,
      avgCoverage: { lines: 0, branches: 0, functions: 0 },
      avgMutationScore: 0,
      avgExecutionTimeMs: 0,
      flakyTests: 0,
      avgMaintainability: 0,
      byAgent: new Map(),
      byDomain: new Map(),
    };
  }

  private groupBy<T, K extends string>(arr: T[], keyFn: (item: T) => K): Map<K, T[]> {
    const map = new Map<K, T[]>();
    for (const item of arr) {
      const key = keyFn(item);
      const group = map.get(key) || [];
      group.push(item);
      map.set(key, group);
    }
    return map;
  }
}

/**
 * Create a new test outcome tracker
 */
export function createTestOutcomeTracker(config?: Partial<FeedbackConfig>): TestOutcomeTracker {
  return new TestOutcomeTracker(config);
}
