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
   * Learn from a completed coverage session
   */
  async learnFromSession(session: CoverageSession): Promise<CoverageStrategy | null> {
    // Store session
    this.sessionStore.add(session);

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
