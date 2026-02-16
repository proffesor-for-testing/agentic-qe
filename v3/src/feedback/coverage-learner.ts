/**
 * Coverage Learner
 * ADR-023: Quality Feedback Loop System
 *
 * Learns from coverage improvement sessions to identify effective strategies.
 */

import type {
  CoverageSession,
  CoverageStrategy,
  CoverageTechnique,
  FeedbackConfig,
} from './types.js';
import { DEFAULT_FEEDBACK_CONFIG } from './types.js';
import type { RealQEReasoningBank } from '../learning/real-qe-reasoning-bank.js';
import { getUnifiedMemory, type UnifiedMemoryManager } from '../kernel/unified-memory.js';

// ============================================================================
// Database Row Types
// ============================================================================

/** Database row structure for coverage_sessions table */
interface CoverageSessionRow {
  id: string;
  target_path: string;
  agent_id: string;
  technique: string;
  before_lines: number;
  before_branches: number;
  before_functions: number;
  after_lines: number;
  after_branches: number;
  after_functions: number;
  tests_generated: number;
  tests_passed: number;
  gaps_json: string | null;
  duration_ms: number;
  started_at: string;
  completed_at: string;
  context_json: string | null;
  created_at: string;
}

// ============================================================================
// Coverage Session Store
// ============================================================================

/**
 * In-memory store for coverage sessions
 */
class SessionStore {
  private sessions: CoverageSession[] = [];
  private readonly maxSessions: number;

  constructor(maxSessions: number) {
    this.maxSessions = maxSessions;
  }

  add(session: CoverageSession): void {
    this.sessions.push(session);
    if (this.sessions.length > this.maxSessions) {
      this.sessions = this.sessions.slice(-this.maxSessions);
    }
  }

  getAll(): CoverageSession[] {
    return [...this.sessions];
  }

  getByTechnique(technique: CoverageTechnique): CoverageSession[] {
    return this.sessions.filter(s => s.technique === technique);
  }

  getByAgent(agentId: string): CoverageSession[] {
    return this.sessions.filter(s => s.agentId === agentId);
  }

  getSuccessful(minImprovement: number): CoverageSession[] {
    return this.sessions.filter(s => {
      const improvement = this.calculateImprovement(s);
      return improvement >= minImprovement;
    });
  }

  private calculateImprovement(session: CoverageSession): number {
    return (
      (session.afterCoverage.lines - session.beforeCoverage.lines) +
      (session.afterCoverage.branches - session.beforeCoverage.branches) +
      (session.afterCoverage.functions - session.beforeCoverage.functions)
    ) / 3;
  }

  clear(): void {
    this.sessions = [];
  }

  get size(): number {
    return this.sessions.length;
  }
}

// ============================================================================
// Coverage Learner
// ============================================================================

/**
 * Learns from coverage improvement sessions
 */
export class CoverageLearner {
  private sessionStore: SessionStore;
  private strategies: Map<string, CoverageStrategy> = new Map();
  private reasoningBank: RealQEReasoningBank | null = null;
  private config: FeedbackConfig;
  private db: UnifiedMemoryManager | null = null;
  private persistCount = 0;
  private static readonly RETENTION_CLEANUP_INTERVAL = 50;

  constructor(config: Partial<FeedbackConfig> = {}) {
    this.config = { ...DEFAULT_FEEDBACK_CONFIG, ...config };
    this.sessionStore = new SessionStore(this.config.maxOutcomesInMemory);
  }

  /**
   * Connect to ReasoningBank for pattern storage
   */
  connectReasoningBank(bank: RealQEReasoningBank): void {
    this.reasoningBank = bank;
  }

  /**
   * Initialize DB persistence for coverage sessions
   */
  async initialize(): Promise<void> {
    try {
      this.db = getUnifiedMemory();
      if (!this.db.isInitialized()) {
        await this.db.initialize();
      }
      await this.loadFromDb();
    } catch (error) {
      console.warn('[CoverageLearner] DB init failed, using memory-only:', error instanceof Error ? error.message : String(error));
      this.db = null;
    }
  }

  /**
   * Load persisted sessions from the database
   */
  private async loadFromDb(): Promise<void> {
    if (!this.db) return;
    const database = this.db.getDatabase();
    const rows = database.prepare(`
      SELECT * FROM coverage_sessions ORDER BY created_at DESC LIMIT ?
    `).all(this.config.maxOutcomesInMemory) as CoverageSessionRow[];

    for (const row of rows.reverse()) {
      const session: CoverageSession = {
        id: row.id,
        targetPath: row.target_path,
        agentId: row.agent_id,
        technique: row.technique as CoverageTechnique,
        beforeCoverage: {
          lines: row.before_lines,
          branches: row.before_branches,
          functions: row.before_functions,
        },
        afterCoverage: {
          lines: row.after_lines,
          branches: row.after_branches,
          functions: row.after_functions,
        },
        testsGenerated: row.tests_generated,
        testsPassed: row.tests_passed,
        gapsTargeted: row.gaps_json ? JSON.parse(row.gaps_json) : [],
        durationMs: row.duration_ms,
        startedAt: new Date(row.started_at),
        completedAt: new Date(row.completed_at),
        context: row.context_json ? JSON.parse(row.context_json) : undefined,
      };
      this.sessionStore.add(session);

      // Re-extract strategies from loaded sessions
      const improvement = (
        (session.afterCoverage.lines - session.beforeCoverage.lines) * 0.4 +
        (session.afterCoverage.branches - session.beforeCoverage.branches) * 0.35 +
        (session.afterCoverage.functions - session.beforeCoverage.functions) * 0.25
      );
      if (improvement >= this.config.minCoverageImprovementToLearn) {
        const filePattern = this.extractFilePattern(session.targetPath);
        const strategyKey = `${session.technique}:${filePattern}`;
        const existing = this.strategies.get(strategyKey);
        if (existing) {
          this.strategies.set(strategyKey, {
            ...existing,
            avgImprovement: (existing.avgImprovement * existing.successCount + improvement) / (existing.successCount + 1),
            successCount: existing.successCount + 1,
            confidence: Math.min(1.0, existing.confidence + 0.05),
            lastUsedAt: new Date(row.completed_at),
          });
        } else {
          this.strategies.set(strategyKey, {
            id: `strategy-${row.id}`,
            description: `Coverage strategy: ${session.technique} for ${filePattern} files`,
            technique: session.technique,
            filePatterns: [filePattern],
            avgImprovement: improvement,
            successCount: 1,
            confidence: 0.5,
            createdAt: new Date(row.started_at),
            lastUsedAt: new Date(row.completed_at),
          });
        }
      }
    }
    if (rows.length > 0) {
      console.log(`[CoverageLearner] Loaded ${rows.length} sessions from DB`);
    }
  }

  /**
   * Persist a coverage session to the database
   */
  private persistSession(session: CoverageSession): void {
    if (!this.db) return;
    try {
      const database = this.db.getDatabase();
      database.prepare(`
        INSERT OR REPLACE INTO coverage_sessions (
          id, target_path, agent_id, technique,
          before_lines, before_branches, before_functions,
          after_lines, after_branches, after_functions,
          tests_generated, tests_passed, gaps_json,
          duration_ms, started_at, completed_at, context_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        session.id, session.targetPath, session.agentId, session.technique,
        session.beforeCoverage.lines, session.beforeCoverage.branches, session.beforeCoverage.functions,
        session.afterCoverage.lines, session.afterCoverage.branches, session.afterCoverage.functions,
        session.testsGenerated, session.testsPassed,
        JSON.stringify(session.gapsTargeted),
        session.durationMs,
        session.startedAt instanceof Date ? session.startedAt.toISOString() : session.startedAt,
        session.completedAt instanceof Date ? session.completedAt.toISOString() : session.completedAt,
        session.context ? JSON.stringify(session.context) : null
      );
      this.persistCount++;
      if (this.persistCount % CoverageLearner.RETENTION_CLEANUP_INTERVAL === 0) {
        this.enforceRetention(database);
      }
    } catch (error) {
      console.warn('[CoverageLearner] Failed to persist session:', error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Delete oldest rows beyond retention limit
   */
  private enforceRetention(database: ReturnType<UnifiedMemoryManager['getDatabase']>): void {
    try {
      const maxRows = this.config.maxOutcomesInMemory * 2;
      database.prepare(`
        DELETE FROM coverage_sessions WHERE id NOT IN (
          SELECT id FROM coverage_sessions ORDER BY created_at DESC LIMIT ?
        )
      `).run(maxRows);
    } catch (error) {
      console.warn('[CoverageLearner] Retention cleanup failed:', error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Learn from a completed coverage session
   */
  async learnFromSession(session: CoverageSession): Promise<CoverageStrategy | null> {
    // Store session
    this.sessionStore.add(session);
    this.persistSession(session);

    // Calculate improvement
    const improvement = this.calculateOverallImprovement(session);

    // Only learn from significant improvements
    if (improvement < this.config.minCoverageImprovementToLearn) {
      return null;
    }

    // Extract or update strategy
    const strategy = await this.extractStrategy(session, improvement);

    // Store in ReasoningBank
    if (this.reasoningBank && strategy) {
      await this.storeStrategyAsPattern(strategy);
    }

    return strategy;
  }

  /**
   * Calculate overall coverage improvement
   */
  private calculateOverallImprovement(session: CoverageSession): number {
    const before = session.beforeCoverage;
    const after = session.afterCoverage;

    // Weighted average improvement
    const lineImprovement = after.lines - before.lines;
    const branchImprovement = after.branches - before.branches;
    const functionImprovement = after.functions - before.functions;

    return (lineImprovement * 0.4 + branchImprovement * 0.35 + functionImprovement * 0.25);
  }

  /**
   * Extract a reusable strategy from a successful session
   */
  private async extractStrategy(
    session: CoverageSession,
    improvement: number
  ): Promise<CoverageStrategy> {
    // Create strategy key based on technique and file patterns
    const filePattern = this.extractFilePattern(session.targetPath);
    const strategyKey = `${session.technique}:${filePattern}`;

    // Get existing strategy or create new
    let strategy = this.strategies.get(strategyKey);

    if (strategy) {
      // Update existing strategy
      strategy = {
        ...strategy,
        avgImprovement: (strategy.avgImprovement * strategy.successCount + improvement) / (strategy.successCount + 1),
        successCount: strategy.successCount + 1,
        confidence: Math.min(1.0, strategy.confidence + 0.05),
        lastUsedAt: new Date(),
      };
    } else {
      // Create new strategy
      strategy = {
        id: `strategy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        description: this.generateStrategyDescription(session, improvement),
        technique: session.technique,
        filePatterns: [filePattern],
        avgImprovement: improvement,
        successCount: 1,
        confidence: 0.5,
        createdAt: new Date(),
        lastUsedAt: new Date(),
      };
    }

    this.strategies.set(strategyKey, strategy);
    return strategy;
  }

  /**
   * Extract file pattern from path
   */
  private extractFilePattern(filePath: string): string {
    // Extract meaningful pattern from file path
    // e.g., "src/services/user.ts" -> "services/*.ts"
    const parts = filePath.split('/');
    const fileName = parts[parts.length - 1];
    const ext = fileName.split('.').pop() || '';

    if (parts.length >= 2) {
      const dir = parts[parts.length - 2];
      return `${dir}/*.${ext}`;
    }

    return `*.${ext}`;
  }

  /**
   * Generate human-readable strategy description
   */
  private generateStrategyDescription(session: CoverageSession, improvement: number): string {
    const techniqueDescriptions: Record<CoverageTechnique, string> = {
      'gap-analysis': 'Identify and target uncovered code paths',
      'branch-coverage': 'Focus on branch conditions and decision points',
      'edge-case-generation': 'Generate tests for edge cases and boundary conditions',
      'mutation-guided': 'Use mutation testing to identify weak test areas',
      'risk-based': 'Prioritize high-risk code paths',
      'semantic-analysis': 'Use code semantics to generate meaningful tests',
      'boundary-testing': 'Test boundary conditions and limits',
      'state-machine': 'Model state transitions and test state changes',
      'data-flow': 'Follow data flow paths through the code',
    };

    const baseDescription = techniqueDescriptions[session.technique] || session.technique;
    const gapsAddressed = session.gapsTargeted.filter(g => g.addressed).length;
    const totalGaps = session.gapsTargeted.length;

    return `${baseDescription} for ${this.extractFilePattern(session.targetPath)} files. ` +
      `Achieved ${improvement.toFixed(1)}% improvement. ` +
      `Addressed ${gapsAddressed}/${totalGaps} gaps with ${session.testsGenerated} tests.`;
  }

  /**
   * Store strategy as a ReasoningBank pattern
   */
  private async storeStrategyAsPattern(strategy: CoverageStrategy): Promise<void> {
    if (!this.reasoningBank) return;

    await this.reasoningBank.storeQEPattern({
      patternType: 'coverage-strategy',
      name: `Coverage Strategy: ${strategy.technique}`,
      description: strategy.description,
      template: {
        type: 'workflow',
        content: JSON.stringify({
          technique: strategy.technique,
          filePatterns: strategy.filePatterns,
          avgImprovement: strategy.avgImprovement,
        }),
        variables: [
          { name: 'targetFile', type: 'string', required: true, description: 'Target file to analyze' },
          { name: 'currentCoverage', type: 'number', required: true, description: 'Current coverage percentage' },
        ],
      },
      context: {
        tags: ['coverage', strategy.technique, ...strategy.filePatterns],
      },
    });
  }

  /**
   * Get recommended strategy for a file
   */
  getRecommendedStrategy(filePath: string): CoverageStrategy | null {
    const filePattern = this.extractFilePattern(filePath);
    let bestStrategy: CoverageStrategy | null = null;
    let bestScore = 0;

    for (const strategy of this.strategies.values()) {
      // Check if strategy applies to this file pattern
      const patternMatch = strategy.filePatterns.some(p =>
        filePattern.includes(p.split('/').pop() || '') ||
        p.includes(filePattern.split('/').pop() || '')
      );

      if (patternMatch || strategy.filePatterns.length === 0) {
        // Score based on improvement * confidence * recency
        const recencyDays = (Date.now() - strategy.lastUsedAt.getTime()) / (1000 * 60 * 60 * 24);
        const recencyFactor = Math.max(0.5, 1 - recencyDays / 30);
        const score = strategy.avgImprovement * strategy.confidence * recencyFactor;

        if (score > bestScore) {
          bestScore = score;
          bestStrategy = strategy;
        }
      }
    }

    return bestStrategy;
  }

  /**
   * Get all strategies
   */
  getAllStrategies(): CoverageStrategy[] {
    return Array.from(this.strategies.values());
  }

  /**
   * Get strategies by technique
   */
  getStrategiesByTechnique(technique: CoverageTechnique): CoverageStrategy[] {
    return this.getAllStrategies().filter(s => s.technique === technique);
  }

  /**
   * Get session statistics
   */
  getSessionStats(): {
    totalSessions: number;
    successfulSessions: number;
    avgImprovement: number;
    byTechnique: Map<CoverageTechnique, { count: number; avgImprovement: number }>;
    strategiesLearned: number;
  } {
    const sessions = this.sessionStore.getAll();

    if (sessions.length === 0) {
      return {
        totalSessions: 0,
        successfulSessions: 0,
        avgImprovement: 0,
        byTechnique: new Map(),
        strategiesLearned: 0,
      };
    }

    const improvements = sessions.map(s => this.calculateOverallImprovement(s));
    const successfulSessions = improvements.filter(i => i >= this.config.minCoverageImprovementToLearn).length;
    const avgImprovement = improvements.reduce((a, b) => a + b, 0) / improvements.length;

    // Group by technique
    const byTechnique = new Map<CoverageTechnique, { count: number; avgImprovement: number }>();
    const techniqueGroups = new Map<CoverageTechnique, CoverageSession[]>();

    for (const session of sessions) {
      const group = techniqueGroups.get(session.technique) || [];
      group.push(session);
      techniqueGroups.set(session.technique, group);
    }

    for (const [technique, techniqueSessions] of techniqueGroups) {
      const techImprovements = techniqueSessions.map(s => this.calculateOverallImprovement(s));
      byTechnique.set(technique, {
        count: techniqueSessions.length,
        avgImprovement: techImprovements.reduce((a, b) => a + b, 0) / techImprovements.length,
      });
    }

    return {
      totalSessions: sessions.length,
      successfulSessions,
      avgImprovement,
      byTechnique,
      strategiesLearned: this.strategies.size,
    };
  }

  /**
   * Analyze gap resolution effectiveness
   */
  analyzeGapResolution(): {
    totalGapsTargeted: number;
    gapsAddressed: number;
    resolutionRate: number;
    byGapType: Map<string, { targeted: number; addressed: number }>;
  } {
    const sessions = this.sessionStore.getAll();
    const allGaps = sessions.flatMap(s => s.gapsTargeted);

    if (allGaps.length === 0) {
      return {
        totalGapsTargeted: 0,
        gapsAddressed: 0,
        resolutionRate: 0,
        byGapType: new Map(),
      };
    }

    const gapsAddressed = allGaps.filter(g => g.addressed).length;

    // Group by gap type
    const byGapType = new Map<string, { targeted: number; addressed: number }>();
    for (const gap of allGaps) {
      const existing = byGapType.get(gap.type) || { targeted: 0, addressed: 0 };
      existing.targeted++;
      if (gap.addressed) existing.addressed++;
      byGapType.set(gap.type, existing);
    }

    return {
      totalGapsTargeted: allGaps.length,
      gapsAddressed,
      resolutionRate: gapsAddressed / allGaps.length,
      byGapType,
    };
  }

  /**
   * Export sessions for persistence
   */
  exportSessions(): CoverageSession[] {
    return this.sessionStore.getAll();
  }

  /**
   * Import sessions from persistence
   */
  importSessions(sessions: CoverageSession[]): void {
    for (const session of sessions) {
      this.sessionStore.add(session);
    }
  }

  /**
   * Export strategies for persistence
   */
  exportStrategies(): CoverageStrategy[] {
    return this.getAllStrategies();
  }

  /**
   * Import strategies from persistence
   */
  importStrategies(strategies: CoverageStrategy[]): void {
    for (const strategy of strategies) {
      const key = `${strategy.technique}:${strategy.filePatterns[0] || '*'}`;
      this.strategies.set(key, strategy);
    }
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.sessionStore.clear();
    this.strategies.clear();
  }

  /**
   * Get learner statistics
   */
  getLearnerStats(): {
    totalSessions: number;
    totalStrategies: number;
    hasReasoningBank: boolean;
    minImprovementThreshold: number;
  } {
    return {
      totalSessions: this.sessionStore.size,
      totalStrategies: this.strategies.size,
      hasReasoningBank: this.reasoningBank !== null,
      minImprovementThreshold: this.config.minCoverageImprovementToLearn,
    };
  }
}

/**
 * Create a new coverage learner
 */
export function createCoverageLearner(config?: Partial<FeedbackConfig>): CoverageLearner {
  return new CoverageLearner(config);
}
