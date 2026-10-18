/**
 * Agentic QE v3 - Learning Optimization MCP Tool
 *
 * qe/learning/optimize - Cross-domain learning and pattern optimization
 *
 * This tool wraps the learning-optimization domain services:
 * - LearningCoordinatorService for pattern learning and experience mining
 * - MetricsOptimizerService for strategy optimization
 * - TransferSpecialistService for knowledge transfer
 */

import { MCPToolBase, MCPToolConfig, MCPToolContext, MCPToolSchema, getSharedMemoryBackend, getLLMRouter } from '../base.js';
import { ToolResult } from '../../types.js';
import { DomainName } from '../../../shared/types/index.js';
import { MemoryBackend } from '../../../kernel/interfaces.js';
import { TimeRange } from '../../../shared/value-objects/index.js';
import { LearningCoordinatorService } from '../../../domains/learning-optimization/services/learning-coordinator.js';
import { MetricsOptimizerService } from '../../../domains/learning-optimization/services/metrics-optimizer.js';
import { TransferSpecialistService } from '../../../domains/learning-optimization/services/transfer-specialist.js';
import { toErrorMessage } from '../../../shared/error-utils.js';
import {
  PatternContext,
  Strategy as DomainStrategy,
  OptimizationObjective as DomainObjective,
  Constraint,
} from '../../../domains/learning-optimization/interfaces.js';
import type { LearningOptimizationAPI } from '../../../domains/learning-optimization/plugin.js';
import { partitionByRewardSource } from '../../../domains/learning-optimization/reward-source.js';
import type { PersistedSONAStats } from '../../../integrations/ruvector/sona-persistence.js';

// ============================================================================
// Types
// ============================================================================

export interface LearningOptimizeParams {
  action: 'learn' | 'optimize' | 'transfer' | 'patterns' | 'dashboard';
  domain?: DomainName;
  experienceIds?: string[];
  targetDomain?: DomainName;
  objective?: OptimizationObjective;
  [key: string]: unknown;
}

export interface OptimizationObjective {
  metric: string;
  direction: 'maximize' | 'minimize';
  constraints?: { metric: string; operator: string; value: number }[];
}

export interface LearningOptimizeResult {
  action: string;
  evidenceStatus?: 'insufficient-evidence';
  learnResult?: LearnResult;
  optimizeResult?: OptimizeResult;
  transferResult?: TransferResult;
  patternResult?: PatternResult;
  dashboardResult?: DashboardResult;
}

export interface LearnResult {
  experiencesProcessed: number;
  /** #1109: experiences with a measured outcome; patterns are learned from these only. */
  measuredExperiences?: number;
  /** #1109: experiences recorded with an assigned reward, excluded from every rate. */
  assignedRewardsExcluded?: number;
  /** #1121: requested experience IDs with no stored experience; not processed. */
  experienceIdsNotFound?: number;
  evidenceStatus?: 'insufficient-evidence';
  patternsLearned: number;
  newPatterns: LearnedPattern[];
  /** No baseline is recorded to compare against, so improvement is not measured (#1109). */
  improvement: number | null;
  unmeasured?: string[];
}

export interface LearnedPattern {
  id: string;
  type: string;
  name: string;
  description: string;
  confidence: number;
  usageCount: number;
  successRate: number;
}

export interface OptimizeResult {
  inputSource: 'recorded-experiences';
  experiencesUsed: number;
  /** #1109: recorded experiences left out because their reward was assigned. */
  assignedRewardsExcluded?: number;
  evidenceStatus?: 'insufficient-evidence';
  unmeasured?: string[];
  /** Figures that were modelled, not observed (#1099). */
  estimated?: string[];
  /** How improvement and confidence were derived, when optimization ran. */
  evaluation?: { method: 'held-out'; trainingSamples: number; heldOutSamples: number };
  strategiesEvaluated: number;
  bestStrategy: Strategy;
  improvement: number;
  confidence: number;
  validationResults: ValidationResult[];
}

export interface Strategy {
  name: string;
  parameters: Record<string, unknown>;
  expectedOutcome: Record<string, number>;
}

export interface ValidationResult {
  testId: string;
  passed: boolean;
  metrics: Record<string, number>;
}

export interface TransferResult {
  sourcePatterns: number;
  transferredPatterns: number;
  adaptedPatterns: number;
  successRate: number;
  targetDomainUpdated: boolean;
}

export interface PatternResult {
  totalPatterns: number;
  byType: Record<string, number>;
  byDomain: Record<string, number>;
  topPatterns: LearnedPattern[];
  /** Null when no pattern has a measured rate (#1121); not a 0 that reads as measured. */
  avgConfidence: number | null;
  avgSuccessRate: number | null;
  /** #1109: patterns learned from assigned rewards, left out of every figure. */
  assignedPatternsExcluded?: number;
  /** #1121: untagged patterns mined before #1120, left out of every figure. */
  legacyPatternsExcluded?: number;
  evidenceStatus?: 'insufficient-evidence';
  /** Read-only persisted SONA visibility when an initialized fleet is available. */
  sona?: SONASnapshot;
}

export interface DashboardResult {
  /** Average success rate of patterns with measured rates; null when there are none. */
  overallLearningRate: number | null;
  totalPatterns: number;
  totalKnowledge: number;
  experiencesLast24h: number;
  /** #1109: last-24h experiences excluded from rankings because their reward was assigned. */
  assignedRewardsExcluded?: number;
  /** #1109: stored patterns excluded because they were learned from assigned rewards. */
  assignedPatternsExcluded?: number;
  /** #1121: untagged patterns mined before #1120 (rate selected over successes), excluded likewise. */
  legacyPatternsExcluded?: number;
  /** Ranked by measured success rate; empty when no domain has a measured outcome. */
  topPerformingDomains: DomainName[];
  evidenceStatus?: 'insufficient-evidence';
  unmeasured?: string[];
  learningTrend: TrendPoint[];
  recentMilestones: Milestone[];
  /** Read-only persisted SONA visibility when an initialized fleet is available. */
  sona?: SONASnapshot;
}

export interface SONASnapshot {
  available: boolean;
  stats: PersistedSONAStats | null;
}

export interface TrendPoint {
  timestamp: string;
  metric: string;
  value: number;
}

export interface Milestone {
  name: string;
  /** When the milestone was first reached; null because that moment is not recorded (#1109). */
  achievedAt: string | null;
  domain: DomainName;
}

// ============================================================================
// Tool Implementation
// ============================================================================

export class LearningOptimizeTool extends MCPToolBase<LearningOptimizeParams, LearningOptimizeResult> {
  readonly config: MCPToolConfig = {
    name: 'qe/learning/optimize',
    description: 'Cross-domain learning, pattern recognition, strategy optimization, and knowledge transfer.',
    domain: 'learning-optimization',
    schema: LEARNING_OPTIMIZE_SCHEMA,
    streaming: true,
    timeout: 300000,
  };

  private learningCoordinator: LearningCoordinatorService | null = null;
  private metricsOptimizer: MetricsOptimizerService | null = null;
  private transferSpecialist: TransferSpecialistService | null = null;

  private async getServices(context: MCPToolContext): Promise<{
    learningCoordinator: LearningCoordinatorService;
    metricsOptimizer: MetricsOptimizerService;
    transferSpecialist: TransferSpecialistService;
  }> {
    if (!this.learningCoordinator || !this.metricsOptimizer || !this.transferSpecialist) {
      const memory = (context as unknown as Record<string, unknown>).memory as MemoryBackend || await getSharedMemoryBackend();
      // ADR-043 wiring.
      const llmRouter = await getLLMRouter(context);
      this.learningCoordinator = new LearningCoordinatorService({ memory, llmRouter });
      this.metricsOptimizer = new MetricsOptimizerService(memory);
      this.transferSpecialist = new TransferSpecialistService(memory);
    }
    return {
      learningCoordinator: this.learningCoordinator,
      metricsOptimizer: this.metricsOptimizer,
      transferSpecialist: this.transferSpecialist,
    };
  }

  async execute(
    params: LearningOptimizeParams,
    context: MCPToolContext
  ): Promise<ToolResult<LearningOptimizeResult>> {
    const { action, domain, experienceIds, targetDomain, objective } = params;

    try {
      this.emitStream(context, {
        status: 'processing',
        message: `Executing ${action} action`,
      });

      if (this.isAborted(context)) {
        return { success: false, error: 'Operation aborted' };
      }

      const result: LearningOptimizeResult = { action };

      switch (action) {
        case 'learn':
          result.learnResult = await this.executeLearn(domain, experienceIds, context);
          if (result.learnResult.evidenceStatus === 'insufficient-evidence') {
            result.evidenceStatus = 'insufficient-evidence';
          }
          break;
        case 'optimize':
          if (!objective) {
            return { success: false, error: 'Objective is required for optimize action' };
          }
          result.optimizeResult = await this.executeOptimize(domain, objective, context);
          if (result.optimizeResult.evidenceStatus === 'insufficient-evidence') {
            result.evidenceStatus = 'insufficient-evidence';
          }
          break;
        case 'transfer':
          if (!domain || !targetDomain) {
            return { success: false, error: 'Both domain and targetDomain are required for transfer action' };
          }
          result.transferResult = await this.executeTransfer(domain, targetDomain, context);
          break;
        case 'patterns':
          result.patternResult = await this.executePatterns(domain, context);
          if (result.patternResult.evidenceStatus === 'insufficient-evidence') {
            result.evidenceStatus = 'insufficient-evidence';
          }
          break;
        case 'dashboard':
          result.dashboardResult = await this.executeDashboard(context);
          if (result.dashboardResult.evidenceStatus === 'insufficient-evidence') {
            result.evidenceStatus = 'insufficient-evidence';
          }
          break;
        default:
          return { success: false, error: `Unknown action: ${action}` };
      }

      this.emitStream(context, {
        status: 'complete',
        message: `${action} complete`,
        progress: 100,
      });

      return { success: true, data: result };
    } catch (error) {
      return {
        success: false,
        error: `Learning optimization failed: ${toErrorMessage(error)}`,
      };
    }
  }

  private async executeLearn(
    domain: DomainName | undefined,
    experienceIds: string[] | undefined,
    context: MCPToolContext
  ): Promise<LearnResult> {
    const targetDomain = domain || 'learning-optimization';

    // Check if demo mode is explicitly requested
    if (this.isDemoMode(context)) {
      this.markAsDemoData(context, 'Demo mode explicitly requested');
      return this.getDemoLearnResult(targetDomain);
    }

    const { learningCoordinator } = await this.getServices(context);

    this.emitStream(context, {
      status: 'learning',
      message: `Learning from ${experienceIds?.length || 'recent'} experiences`,
    });

    // #1121: learn from the requested experiences; count only those read.
    if (experienceIds && experienceIds.length > 0) {
      return this.learnFromExperienceIds(learningCoordinator, experienceIds);
    }

    // Mine recent experiences
    const timeRange = TimeRange.lastNDays(7);
    const mineResult = await learningCoordinator.mineExperiences(targetDomain, timeRange);

    const newPatterns: LearnedPattern[] = [];
    let experiencesProcessed = 0;
    let evidence: Pick<LearnResult, 'measuredExperiences' | 'assignedRewardsExcluded' | 'evidenceStatus'> = {};

    if (mineResult.success) {
      experiencesProcessed = mineResult.value.experienceCount;
      // #1109: patterns come from measured outcomes only; say how many were left out.
      evidence = {
        measuredExperiences: mineResult.value.measuredExperienceCount ?? experiencesProcessed,
        assignedRewardsExcluded: mineResult.value.assignedRewardsExcluded ?? 0,
        ...(mineResult.value.evidenceStatus ? { evidenceStatus: mineResult.value.evidenceStatus } : {}),
      };

      // Convert mined patterns to result format
      for (const pattern of mineResult.value.patterns) {
        newPatterns.push({
          id: pattern.id,
          type: pattern.type,
          name: pattern.name,
          description: pattern.description,
          confidence: pattern.confidence,
          usageCount: pattern.usageCount,
          successRate: pattern.successRate,
        });
      }
    }

    // If no patterns were learned, return empty result (not fake data)
    // This is a valid state - no patterns discovered yet
    // #1109: there is no recorded baseline, so improvement is never computed
    // here. The former (successRate - 0.5) * 20 was an invented scale.
    this.markAsRealData();
    return {
      experiencesProcessed,
      ...evidence,
      patternsLearned: newPatterns.length,
      newPatterns,
      improvement: null,
      unmeasured: ['improvement'],
    };
  }

  /**
   * #1121: learn from explicitly requested experiences. experiencesProcessed
   * is the number actually read; IDs with no stored experience are counted in
   * experienceIdsNotFound instead of being reported as processed.
   */
  private async learnFromExperienceIds(
    learningCoordinator: LearningCoordinatorService,
    experienceIds: string[]
  ): Promise<LearnResult> {
    const readResult = await learningCoordinator.getExperiencesByIds(experienceIds);
    if (!readResult.success) throw readResult.error;
    const read = readResult.value;
    const { measured, assignedExcluded } = partitionByRewardSource(read);
    const learned = measured.length > 0 ? await learningCoordinator.learnPattern(read) : null;
    const newPatterns: LearnedPattern[] = learned?.success
      ? [{
          id: learned.value.id,
          type: learned.value.type,
          name: learned.value.name,
          description: learned.value.description,
          confidence: learned.value.confidence,
          usageCount: learned.value.usageCount,
          successRate: learned.value.successRate,
        }]
      : [];

    this.markAsRealData();
    return {
      experiencesProcessed: read.length,
      experienceIdsNotFound: new Set(experienceIds).size - read.length,
      measuredExperiences: measured.length,
      assignedRewardsExcluded: assignedExcluded,
      ...(measured.length === 0 ? { evidenceStatus: 'insufficient-evidence' as const } : {}),
      patternsLearned: newPatterns.length,
      newPatterns,
      improvement: null,
      unmeasured: ['improvement'],
    };
  }

  /**
   * Return demo learn results when no real data available.
   * Only used when demoMode is explicitly requested or as fallback with warning.
   */
  private getDemoLearnResult(domain: DomainName): LearnResult {
    return {
      experiencesProcessed: 150,
      patternsLearned: 12,
      newPatterns: [
        {
          id: `pattern-${domain}-001`,
          type: 'optimization',
          name: 'Parallel Execution Pattern',
          description: `Optimal parallelism settings discovered for ${domain}`,
          confidence: 0.92,
          usageCount: 45,
          successRate: 0.87,
        },
        {
          id: `pattern-${domain}-002`,
          type: 'retry',
          name: 'Exponential Backoff Pattern',
          description: 'Effective retry strategy for flaky operations',
          confidence: 0.88,
          usageCount: 32,
          successRate: 0.91,
        },
        {
          id: `pattern-${domain}-003`,
          type: 'caching',
          name: 'Result Caching Pattern',
          description: 'Cache frequently computed results for faster access',
          confidence: 0.85,
          usageCount: 28,
          successRate: 0.82,
        },
      ],
      improvement: 15.5,
    };
  }

  private async executeOptimize(
    domain: DomainName | undefined,
    objective: OptimizationObjective,
    context: MCPToolContext
  ): Promise<OptimizeResult> {
    const { learningCoordinator, metricsOptimizer } = await this.getServices(context);

    this.emitStream(context, {
      status: 'optimizing',
      message: `Optimizing for ${objective.metric}`,
    });

    // Get recent experiences for optimization
    const targetDomain = domain || 'learning-optimization';
    const timeRange = TimeRange.lastNDays(30);
    const recorded = await learningCoordinator.getExperiences(targetDomain, timeRange);
    if (!recorded.success) throw recorded.error;
    // #1109: an assigned reward is not an observation; leave it out before the
    // sample-count gate so it can neither pad the count nor fail the optimizer.
    const { measured, assignedExcluded } = partitionByRewardSource(recorded.value);
    // Missing objective values are absence of evidence, not zero or a random
    // synthetic observation. Preserve eligible records (including failures).
    const experiences = measured.filter(experience => {
      const value = experience.result.outcome[objective.metric];
      return typeof value === 'number' && Number.isFinite(value);
    });

    // Create current strategy
    const currentStrategy: DomainStrategy = {
      name: `${targetDomain}-current`,
      parameters: {
        parallelism: 4,
        retryCount: 3,
        timeout: 30000,
      },
      // #1099: the current strategy's outcome was never measured here.
      expectedOutcome: {},
    };

    // Convert objective to domain type, properly cast constraints
    const domainConstraints: Constraint[] = (objective.constraints || []).map(c => ({
      metric: c.metric,
      operator: c.operator as 'lt' | 'gt' | 'lte' | 'gte' | 'eq',
      value: c.value,
    }));
    const domainObjective: DomainObjective = {
      metric: objective.metric,
      direction: objective.direction,
      constraints: domainConstraints,
    };

    // Run optimization if we have enough experiences
    let bestStrategy: Strategy = currentStrategy;
    let improvement = 0;
    let confidence = 0;
    let validationResults: ValidationResult[] = [];
    let unmeasured: string[] = [];
    let estimated: string[] | undefined;
    let evaluation: OptimizeResult['evaluation'];

    if (experiences.length >= 20) {
      const optimizeResult = await metricsOptimizer.optimizeStrategy(
        currentStrategy,
        domainObjective,
        experiences
      );

      if (!optimizeResult.success) throw optimizeResult.error;
      bestStrategy = {
        name: optimizeResult.value.optimizedStrategy.name,
        parameters: optimizeResult.value.optimizedStrategy.parameters,
        expectedOutcome: optimizeResult.value.optimizedStrategy.expectedOutcome,
      };
      improvement = optimizeResult.value.improvement * 100; // Convert to percentage
      confidence = optimizeResult.value.confidence;
      validationResults = optimizeResult.value.validationResults;
      const derived = optimizeResult.value.evaluation;
      if (derived) {
        evaluation = {
          method: derived.method,
          trainingSamples: derived.trainingSamples,
          heldOutSamples: derived.heldOutSamples,
        };
        estimated = derived.estimated;
        unmeasured = [...(derived.unmeasured ?? [])];
      }
    } else {
      // Not enough data - recommend default strategy
      const contextForRecommendation: PatternContext = {
        tags: [targetDomain, objective.metric],
      };
      const recommendResult = await metricsOptimizer.recommendStrategy(contextForRecommendation);
      if (!recommendResult.success) throw recommendResult.error;
      bestStrategy = {
        name: recommendResult.value.name,
        parameters: recommendResult.value.parameters,
        expectedOutcome: recommendResult.value.expectedOutcome,
      };
      unmeasured = ['improvement', 'confidence'];
    }
    if (Object.keys(bestStrategy.expectedOutcome).length === 0) {
      unmeasured.push('expectedOutcome');
    }

    return {
      inputSource: 'recorded-experiences',
      experiencesUsed: experiences.length,
      ...(assignedExcluded > 0 ? { assignedRewardsExcluded: assignedExcluded } : {}),
      strategiesEvaluated: experiences.length >= 20 ? 1 : 0,
      ...(experiences.length < 20 ? { evidenceStatus: 'insufficient-evidence' as const } : {}),
      ...(unmeasured.length > 0 ? { unmeasured } : {}),
      ...(estimated ? { estimated } : {}),
      ...(evaluation ? { evaluation } : {}),
      bestStrategy,
      improvement,
      confidence,
      validationResults,
    };
  }

  private async executeTransfer(
    sourceDomain: DomainName,
    targetDomain: DomainName,
    context: MCPToolContext
  ): Promise<TransferResult> {
    const { transferSpecialist } = await this.getServices(context);

    this.emitStream(context, {
      status: 'transferring',
      message: `Transferring knowledge from ${sourceDomain} to ${targetDomain}`,
    });

    // Query knowledge from source domain
    const queryResult = await transferSpecialist.queryKnowledge({
      domain: sourceDomain,
      minRelevance: 0.5,
      limit: 50,
    });

    let sourcePatterns = 0;
    let transferredPatterns = 0;
    let adaptedPatterns = 0;
    let totalRelevance = 0;

    if (queryResult.success) {
      sourcePatterns = queryResult.value.length;

      // Transfer each piece of knowledge to target domain
      for (const knowledge of queryResult.value) {
        const transferResult = await transferSpecialist.transferKnowledge(
          knowledge,
          targetDomain
        );

        if (transferResult.success) {
          transferredPatterns++;
          totalRelevance += transferResult.value.relevanceScore;

          // Count as adapted if relevance changed significantly
          if (Math.abs(transferResult.value.relevanceScore - knowledge.relevanceScore) > 0.1) {
            adaptedPatterns++;
          }
        }
      }
    }

    const successRate = sourcePatterns > 0
      ? transferredPatterns / sourcePatterns
      : 0;

    return {
      sourcePatterns,
      transferredPatterns,
      adaptedPatterns,
      successRate,
      targetDomainUpdated: transferredPatterns > 0,
    };
  }

  private async executePatterns(
    domain: DomainName | undefined,
    context: MCPToolContext
  ): Promise<PatternResult> {
    const { learningCoordinator } = await this.getServices(context);
    const sona = await this.getSONASnapshot(context);

    this.emitStream(context, {
      status: 'analyzing',
      message: `Analyzing patterns${domain ? ` for ${domain}` : ''}`,
    });

    // Get pattern statistics from the real service
    const statsResult = await learningCoordinator.getPatternStats(domain);

    if (!statsResult.success) {
      // Stats could not be read: nothing is measured, so no averages (#1121).
      return {
        totalPatterns: 0,
        byType: {},
        byDomain: {},
        topPatterns: [],
        avgConfidence: null,
        avgSuccessRate: null,
        evidenceStatus: 'insufficient-evidence',
        sona,
      };
    }

    const stats = statsResult.value;

    // Convert top patterns to result format
    const topPatterns: LearnedPattern[] = stats.topPatterns.map(p => ({
      id: p.id,
      type: p.type,
      name: p.name,
      description: p.description,
      confidence: p.confidence,
      usageCount: p.usageCount,
      successRate: p.successRate,
    }));

    const measured = stats.totalPatterns > 0;
    return {
      totalPatterns: stats.totalPatterns,
      byType: stats.byType,
      byDomain: stats.byDomain,
      topPatterns,
      avgConfidence: measured ? stats.avgConfidence : null,
      avgSuccessRate: measured ? stats.avgSuccessRate : null,
      ...(stats.assignedPatternsExcluded ? { assignedPatternsExcluded: stats.assignedPatternsExcluded } : {}),
      ...(stats.legacyPatternsExcluded ? { legacyPatternsExcluded: stats.legacyPatternsExcluded } : {}),
      ...(measured ? {} : { evidenceStatus: 'insufficient-evidence' as const }),
      sona,
    };
  }

  private async executeDashboard(context: MCPToolContext): Promise<DashboardResult> {
    const { learningCoordinator, transferSpecialist } = await this.getServices(context);
    const sona = await this.getSONASnapshot(context);

    this.emitStream(context, {
      status: 'aggregating',
      message: 'Aggregating learning metrics',
    });

    // Get pattern stats across all domains
    const statsResult = await learningCoordinator.getPatternStats();

    // Get knowledge count
    const knowledgeResult = await transferSpecialist.queryKnowledge({
      minRelevance: 0,
      limit: 1000,
    });

    // Get recent experiences (last 24h)
    const recentTimeRange = TimeRange.lastNDays(1);
    const domains: DomainName[] = [
      'test-generation', 'test-execution', 'coverage-analysis',
      'quality-assessment', 'defect-intelligence', 'learning-optimization'
    ];

    let experiencesLast24h = 0;
    let assignedRewardsExcluded = 0;
    const domainPerformance: { domain: DomainName; successRate: number }[] = [];

    for (const domain of domains) {
      const mineResult = await learningCoordinator.mineExperiences(domain, recentTimeRange);
      if (mineResult.success) {
        experiencesLast24h += mineResult.value.experienceCount;
        assignedRewardsExcluded += mineResult.value.assignedRewardsExcluded ?? 0;
        // #1109: only a measured success rate can rank a domain.
        const { successRate } = mineResult.value;
        if (successRate !== null) {
          domainPerformance.push({ domain, successRate });
        }
      }
    }

    // Calculate top performing domains
    domainPerformance.sort((a, b) => b.successRate - a.successRate);
    const topPerformingDomains = domainPerformance
      .slice(0, 3)
      .map(d => d.domain);

    // Calculate overall learning rate from pattern stats
    // getPatternStats already leaves out patterns learned from assigned rewards.
    const totalPatterns = statsResult.success ? statsResult.value.totalPatterns : 0;
    const assignedPatternsExcluded = statsResult.success
      ? statsResult.value.assignedPatternsExcluded ?? 0
      : 0;
    const legacyPatternsExcluded = statsResult.success
      ? statsResult.value.legacyPatternsExcluded ?? 0
      : 0;
    const avgSuccessRate = totalPatterns > 0 && statsResult.success
      ? statsResult.value.avgSuccessRate
      : null;
    const overallLearningRate = avgSuccessRate;

    // Generate learning trend from weekly pattern mining
    const learningTrend: TrendPoint[] = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const dayStart = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
      const dayRange = TimeRange.create(dayStart, dayEnd);

      let dayPatterns = 0;
      for (const domain of domains.slice(0, 3)) {
        const dayResult = await learningCoordinator.mineExperiences(domain, dayRange);
        if (dayResult.success) {
          dayPatterns += dayResult.value.patterns.length;
        }
      }

      learningTrend.push({
        timestamp: dayStart.toISOString(),
        metric: 'patterns-learned',
        value: dayPatterns,
      });
    }

    // Milestones from measured figures. When each was first reached is not
    // recorded, so achievedAt is null rather than an invented date (#1109).
    const recentMilestones: Milestone[] = [];
    if (totalPatterns >= 100) {
      recentMilestones.push({
        name: `Reached ${Math.floor(totalPatterns / 50) * 50} patterns`,
        achievedAt: null,
        domain: 'learning-optimization',
      });
    }
    if (avgSuccessRate !== null && avgSuccessRate >= 0.8) {
      recentMilestones.push({
        name: `${Math.round(avgSuccessRate * 100)}% pattern success rate`,
        achievedAt: null,
        domain: topPerformingDomains[0] || 'learning-optimization',
      });
    }

    const unmeasured: string[] = [];
    if (overallLearningRate === null) unmeasured.push('overallLearningRate');
    if (topPerformingDomains.length === 0) unmeasured.push('topPerformingDomains');

    return {
      overallLearningRate,
      totalPatterns,
      totalKnowledge: knowledgeResult.success ? knowledgeResult.value.length : 0,
      experiencesLast24h,
      ...(assignedRewardsExcluded > 0 ? { assignedRewardsExcluded } : {}),
      ...(assignedPatternsExcluded > 0 ? { assignedPatternsExcluded } : {}),
      ...(legacyPatternsExcluded > 0 ? { legacyPatternsExcluded } : {}),
      topPerformingDomains,
      ...(unmeasured.length > 0
        ? { evidenceStatus: 'insufficient-evidence' as const, unmeasured }
        : {}),
      learningTrend,
      recentMilestones,
      sona,
    };
  }

  /** Read SONA through the initialized domain API; never construct a second engine here. */
  private async getSONASnapshot(context: MCPToolContext): Promise<SONASnapshot> {
    const api = context.kernel?.getDomainAPI<LearningOptimizationAPI>('learning-optimization');
    if (!api?.isSONAAvailable()) return { available: false, stats: null };

    try {
      return { available: true, stats: await api.getSONAPersistedStats() };
    } catch (error) {
      this.logger.warn('Failed to read persisted SONA statistics', {
        requestId: context.requestId,
        error: toErrorMessage(error),
      });
      return { available: false, stats: null };
    }
  }
}

// ============================================================================
// Schema
// ============================================================================

const LEARNING_OPTIMIZE_SCHEMA: MCPToolSchema = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      description: 'Learning action to perform',
      enum: ['learn', 'optimize', 'transfer', 'patterns', 'dashboard'],
    },
    domain: {
      type: 'string',
      description: 'Source domain for learning/optimization',
      enum: [
        'test-generation', 'test-execution', 'coverage-analysis', 'quality-assessment',
        'defect-intelligence', 'requirements-validation', 'code-intelligence',
        'security-compliance', 'contract-testing', 'visual-accessibility',
        'chaos-resilience', 'learning-optimization',
      ],
    },
    experienceIds: {
      type: 'array',
      description: 'Specific experience IDs to learn from',
      items: { type: 'string', description: 'Experience ID' },
    },
    targetDomain: {
      type: 'string',
      description: 'Target domain for knowledge transfer',
    },
    objective: {
      type: 'object',
      description: 'Optimization objective',
      properties: {
        metric: { type: 'string', description: 'Metric to optimize' },
        direction: { type: 'string', description: 'maximize or minimize', enum: ['maximize', 'minimize'] },
        constraints: {
          type: 'array',
          description: 'Optimization constraints',
          items: { type: 'object', description: 'Constraint' },
        },
      },
    },
  },
  required: ['action'],
};
