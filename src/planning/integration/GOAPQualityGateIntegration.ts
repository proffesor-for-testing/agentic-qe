/**
 * GOAP Quality Gate Integration
 *
 * Bridges GOAP planning with quality gate evaluation:
 * - Converts quality metrics to WorldState
 * - Generates remediation plans on gate failure
 * - Tracks plan execution and success rates
 * - Provides alternative paths when primary actions fail
 *
 * @module planning/integration/GOAPQualityGateIntegration
 * @version 1.0.0
 */

import Database from 'better-sqlite3';
import { GOAPPlanner } from '../GOAPPlanner';
import { WorldStateBuilder, QualityMetricsInput, ContextInput } from '../WorldStateBuilder';
import { qualityGateActions } from '../actions/quality-gate-actions';
import { testStrategyActions } from '../actions/test-strategy-actions';
import { fleetActions } from '../actions/fleet-actions';
import {
  WorldState,
  GOAPPlan,
  GOAPAction,
  StateConditions,
  PlanConstraints
} from '../types';
import { Logger } from '../../utils/Logger';

/**
 * Quality metrics from the existing quality gate system
 */
export interface QualityGateMetrics {
  coverage?: {
    overallPercentage?: number;
    linePercentage?: number;
    branchPercentage?: number;
    functionPercentage?: number;
  };
  testResults?: {
    total?: number;
    passed?: number;
    failed?: number;
    failureRate?: number;
    flakyTests?: number;
  };
  security?: {
    summary?: {
      critical?: number;
      high?: number;
      medium?: number;
      low?: number;
    };
  };
  performance?: {
    errorRate?: number;
    p95Latency?: number;
    throughput?: number;
  };
  codeQuality?: {
    maintainabilityIndex?: number;
    cyclomaticComplexity?: number;
    technicalDebtDays?: number;
  };
}

/**
 * Quality gate context for planning
 */
export interface QualityGateContext {
  projectId: string;
  buildId: string;
  environment: 'development' | 'staging' | 'production';
  criticality?: 'low' | 'medium' | 'high' | 'critical';
  changedFiles?: string[];
  previousFailures?: number;
  timeRemaining?: number;
  availableAgents?: string[];
}

/**
 * Remediation plan for quality gate failures
 */
export interface RemediationPlan {
  planId: string;
  actions: RemediationAction[];
  totalCost: number;
  estimatedDuration: number;
  successProbability: number;
  alternativePaths: AlternativePath[];
  createdAt: string;
}

/**
 * Individual remediation action
 */
export interface RemediationAction {
  id: string;
  name: string;
  description?: string;
  agentType: string;
  category: string;
  estimatedDuration: number;
  successRate: number;
  effects: string[];
}

/**
 * Alternative remediation path
 */
export interface AlternativePath {
  planId: string;
  actions: string[];
  totalCost: number;
  estimatedDuration: number;
  differenceFromPrimary: string;
}

/**
 * Goal definitions for quality gate scenarios
 */
export const QUALITY_GATE_GOALS = {
  /**
   * Pass all quality gates with standard thresholds
   */
  PASS_QUALITY_GATE: {
    id: 'goal-pass-quality-gate',
    name: 'Pass Quality Gate',
    conditions: {
      'quality.testsPassing': { gte: 95 },
      'coverage.line': { gte: 80 },
      'quality.securityScore': { gte: 70 },
      'quality.performanceScore': { gte: 70 },
      'quality.gateStatus': { eq: 'passed' }
    } as StateConditions,
    priority: 5
  },

  /**
   * Achieve minimum viable quality for hotfix
   */
  HOTFIX_QUALITY: {
    id: 'goal-hotfix-quality',
    name: 'Hotfix Quality',
    conditions: {
      'quality.testsPassing': { gte: 90 },
      'quality.securityScore': { gte: 80 },
      'quality.smokeTestsPassing': { eq: true }
    } as StateConditions,
    priority: 4
  },

  /**
   * Fix test failures to reach passing threshold
   */
  TEST_SUCCESS: {
    id: 'goal-test-success',
    name: 'Test Success',
    conditions: {
      'quality.testsPassing': { gte: 95 }
    } as StateConditions,
    priority: 3
  },

  /**
   * Improve coverage to target threshold
   */
  COVERAGE_TARGET: {
    id: 'goal-coverage-target',
    name: 'Coverage Target',
    conditions: {
      'coverage.line': { gte: 80 },
      'coverage.branch': { gte: 70 }
    } as StateConditions,
    priority: 3
  },

  /**
   * Resolve security vulnerabilities
   */
  SECURITY_CLEAR: {
    id: 'goal-security-clear',
    name: 'Security Clear',
    conditions: {
      'quality.securityScore': { gte: 90 }
    } as StateConditions,
    priority: 5
  },

  /**
   * Performance meets SLA
   */
  PERFORMANCE_SLA: {
    id: 'goal-performance-sla',
    name: 'Performance SLA',
    conditions: {
      'quality.performanceScore': { gte: 85 }
    } as StateConditions,
    priority: 4
  }
};

/**
 * GOAP Quality Gate Integration
 */
export class GOAPQualityGateIntegration {
  private planner: GOAPPlanner;
  private db: Database.Database;
  private logger: Logger;
  private initialized = false;

  constructor(db: Database.Database) {
    this.db = db;
    this.planner = new GOAPPlanner(db);
    this.logger = Logger.getInstance();
  }

  /**
   * Initialize planner with quality gate actions
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Register all relevant actions
    this.planner.addActions(qualityGateActions);
    this.planner.addActions(testStrategyActions);
    this.planner.addActions(fleetActions.filter(a =>
      ['fleet-spawn-test-gen', 'fleet-spawn-coverage', 'fleet-spawn-security'].includes(a.id)
    ));

    this.initialized = true;
    this.logger.info('[GOAPQualityGate] Initialized with actions', {
      totalActions: this.planner.getActionLibrary().length
    });
  }

  /**
   * Close database connection and cleanup resources
   * Call this in tests to prevent memory leaks
   */
  close(): void {
    try {
      this.db.close();
    } catch {
      // Ignore close errors (may already be closed)
    }
    this.initialized = false;
  }

  /**
   * Convert quality gate metrics to GOAP WorldState
   */
  buildWorldState(
    metrics: QualityGateMetrics,
    context: QualityGateContext
  ): WorldState {
    const qualityInput: QualityMetricsInput = {
      coverage: {
        line: metrics.coverage?.linePercentage ?? metrics.coverage?.overallPercentage ?? 0,
        branch: metrics.coverage?.branchPercentage ?? 0,
        function: metrics.coverage?.functionPercentage ?? 0
      },
      testsPassing: metrics.testResults?.passed,
      testsTotal: metrics.testResults?.total,
      securityVulnerabilities: {
        critical: metrics.security?.summary?.critical ?? 0,
        high: metrics.security?.summary?.high ?? 0,
        medium: metrics.security?.summary?.medium ?? 0,
        low: metrics.security?.summary?.low ?? 0
      },
      performanceMetrics: {
        p95Latency: metrics.performance?.p95Latency,
        throughput: metrics.performance?.throughput,
        errorRate: metrics.performance?.errorRate
      },
      technicalDebt: {
        days: metrics.codeQuality?.technicalDebtDays ?? 0
      }
    };

    const contextInput: ContextInput = {
      environment: context.environment,
      riskLevel: this.mapCriticality(context.criticality),
      changedFiles: context.changedFiles,
      previousFailures: context.previousFailures ?? 0,
      projectId: context.projectId
    };

    const builder = new WorldStateBuilder()
      .withQualityMetrics(qualityInput)
      .withContext(contextInput)
      .withResources({
        timeRemaining: context.timeRemaining ?? 3600,
        parallelSlots: 4
      });

    // Add available agents if specified
    if (context.availableAgents && context.availableAgents.length > 0) {
      builder.withFleetStatus({
        activeAgents: context.availableAgents.length,
        availableAgents: context.availableAgents
      });
    } else {
      // Default available agents
      builder.withFleetStatus({
        activeAgents: 5,
        availableAgents: [
          'qe-test-executor',
          'qe-test-generator',
          'qe-coverage-analyzer',
          'qe-security-scanner',
          'qe-performance-tester'
        ]
      });
    }

    return builder.build();
  }

  /**
   * Generate remediation plan for quality gate failure
   */
  async generateRemediationPlan(
    metrics: QualityGateMetrics,
    context: QualityGateContext,
    targetGoal?: keyof typeof QUALITY_GATE_GOALS
  ): Promise<RemediationPlan | null> {
    await this.initialize();

    const worldState = this.buildWorldState(metrics, context);
    const goal = QUALITY_GATE_GOALS[targetGoal ?? 'PASS_QUALITY_GATE'];

    this.logger.info('[GOAPQualityGate] Generating remediation plan', {
      goal: goal.name,
      currentCoverage: worldState.coverage.line,
      targetConditions: Object.keys(goal.conditions)
    });

    // Define constraints based on context and goal type
    const constraints: PlanConstraints = {
      maxIterations: 3000,
      timeoutMs: 8000,
      maxPlanLength: 10
    };

    // Add goal-specific category preferences for faster search
    if (targetGoal === 'SECURITY_CLEAR') {
      // Focus on security actions for security goals
      constraints.allowedCategories = ['security', 'process'];
    } else if (targetGoal === 'COVERAGE_TARGET') {
      // Focus on test actions for coverage goals
      constraints.allowedCategories = ['test', 'analysis', 'process'];
    } else if (targetGoal === 'PERFORMANCE_SLA') {
      // Focus on performance actions
      constraints.allowedCategories = ['performance', 'analysis', 'process'];
    }
    // PASS_QUALITY_GATE needs all categories

    // Restrict actions for production
    if (context.environment === 'production') {
      constraints.allowedCategories = ['test', 'security', 'analysis', 'process'];
      // Exclude risky actions in production
      constraints.excludedActions = ['qg-fix-critical-vulns'];
    }

    try {
      const plan = await this.planner.findPlan(worldState, goal.conditions, constraints);

      if (!plan) {
        this.logger.warn('[GOAPQualityGate] No remediation plan found');
        return null;
      }

      // Find alternative paths
      const alternatives = await this.findAlternativePaths(
        worldState,
        goal.conditions,
        plan,
        constraints
      );

      // Calculate success probability
      const successProbability = this.calculateSuccessProbability(plan);

      // Persist plan
      await this.persistPlan(plan, context, goal.id);

      return this.formatRemediationPlan(plan, alternatives, successProbability);
    } catch (error) {
      this.logger.error('[GOAPQualityGate] Failed to generate remediation plan', { error });
      return null;
    }
  }

  /**
   * Find alternative remediation paths
   *
   * STRATEGY: With flag-based actions, we have two types:
   * 1. MEASUREMENT actions (set flags like testsMeasured=true) - MUST run, cannot be excluded
   * 2. IMPROVEMENT actions (increase metrics) - CAN be swapped for alternatives
   *
   * We find diverse alternatives by:
   * - Keeping measurement actions fixed (they're prerequisites)
   * - Swapping improvement actions for alternatives with similar effects
   */
  private async findAlternativePaths(
    worldState: WorldState,
    goalConditions: StateConditions,
    primaryPlan: GOAPPlan,
    constraints: PlanConstraints
  ): Promise<AlternativePath[]> {
    const alternatives: AlternativePath[] = [];
    const seenPlanKeys = new Set<string>();

    // Identify measurement vs improvement actions in primary plan
    const measurementActionIds = new Set<string>();
    const improvementActions: GOAPAction[] = [];

    for (const action of primaryPlan.actions) {
      // Check if this is a measurement action (effects set boolean flags)
      const isMeasurement = Object.entries(action.effects).some(([key, effect]) => {
        const effectObj = effect as any;
        // Measurement actions set boolean flags like testsMeasured, securityMeasured
        return effectObj?.set === true && (
          key.includes('Measured') ||
          key.includes('measured') ||
          key.includes('Tested') ||
          key.includes('Evaluated') ||
          key.includes('Analyzed')
        );
      });

      if (isMeasurement) {
        measurementActionIds.add(action.id);
      } else {
        improvementActions.push(action);
      }
    }

    // Helper to generate plan key for deduplication
    const getPlanKey = (actions: GOAPAction[]): string =>
      actions.map(a => a.id).sort().join(',');

    // Add primary plan to seen
    seenPlanKeys.add(getPlanKey(primaryPlan.actions));

    // Helper to add unique alternative
    const addAlternative = (altPlan: GOAPPlan, description: string): boolean => {
      const planKey = getPlanKey(altPlan.actions);
      if (seenPlanKeys.has(planKey)) return false;

      // Check for actual action diversity (not just order)
      const primaryIds = new Set(primaryPlan.actions.map(a => a.id));
      const altIds = altPlan.actions.map(a => a.id);
      const differentActions = altIds.filter(id => !primaryIds.has(id));

      if (differentActions.length === 0 && altIds.length === primaryPlan.actions.length) {
        return false; // No real difference
      }

      seenPlanKeys.add(planKey);
      alternatives.push({
        planId: altPlan.id,
        actions: altIds,
        totalCost: altPlan.totalCost,
        estimatedDuration: altPlan.estimatedDuration,
        differenceFromPrimary: description
      });
      return true;
    };

    // Strategy 1: For each improvement action, exclude it to force an alternative
    // Keep measurement actions (they're prerequisites that MUST run)
    for (const improvementAction of improvementActions) {
      if (alternatives.length >= 3) break;

      const altConstraints = {
        ...constraints,
        excludedActions: [
          ...(constraints.excludedActions ?? []),
          improvementAction.id
        ],
        maxIterations: 1200
      };

      try {
        const altPlan = await this.planner.findPlan(worldState, goalConditions, altConstraints);
        if (altPlan && altPlan.actions.length > 0) {
          // Find what replaced the excluded action
          const newActions = altPlan.actions
            .filter(a => !measurementActionIds.has(a.id))
            .filter(a => !primaryPlan.actions.some(pa => pa.id === a.id));
          const newActionNames = newActions.map(a => a.name).join(', ') || 'different approach';
          addAlternative(altPlan, `Uses ${newActionNames} instead of ${improvementAction.name}`);
        }
      } catch {
        // Ignore failed searches
      }
    }

    // Strategy 2: Find alternatives by category
    // Group improvement actions by what they improve (category + effect target)
    if (alternatives.length < 3) {
      const effectGroups: Map<string, GOAPAction[]> = new Map();

      for (const action of this.planner.getActionLibrary()) {
        // Skip measurement actions and actions already used
        if (measurementActionIds.has(action.id)) continue;
        if (improvementActions.some(ia => ia.id === action.id)) continue;

        // Group by primary effect target
        for (const [key, effect] of Object.entries(action.effects)) {
          const effectObj = effect as any;
          if (effectObj?.increase !== undefined) {
            const effectKey = key; // e.g., 'coverage.line', 'quality.testsPassing'
            if (!effectGroups.has(effectKey)) {
              effectGroups.set(effectKey, []);
            }
            effectGroups.get(effectKey)!.push(action);
          }
        }
      }

      // For each improvement action in primary plan, find alternatives that improve same metric
      for (const improvementAction of improvementActions) {
        if (alternatives.length >= 3) break;

        // Find what this action improves
        for (const [key, effect] of Object.entries(improvementAction.effects)) {
          const effectObj = effect as any;
          if (effectObj?.increase !== undefined) {
            const alternativeActions = effectGroups.get(key) ?? [];
            for (const altAction of alternativeActions) {
              if (alternatives.length >= 3) break;

              // Exclude primary plan's improvement actions, keep this alternative
              const excludeIds = improvementActions
                .filter(ia => ia.id !== altAction.id)
                .map(ia => ia.id);

              const altConstraints = {
                ...constraints,
                excludedActions: [...(constraints.excludedActions ?? []), ...excludeIds],
                maxIterations: 1000
              };

              try {
                const altPlan = await this.planner.findPlan(worldState, goalConditions, altConstraints);
                if (altPlan && altPlan.actions.length > 0) {
                  addAlternative(altPlan, `Uses ${altAction.name} to improve ${key}`);
                }
              } catch {
                // Ignore
              }
            }
          }
        }
      }
    }

    // Strategy 3: Exclude all improvement actions from primary + alternatives to find new approaches
    if (alternatives.length < 3 && alternatives.length > 0) {
      const allUsedImprovements = new Set<string>();
      improvementActions.forEach(a => allUsedImprovements.add(a.id));
      alternatives.forEach(alt =>
        alt.actions.forEach(id => {
          if (!measurementActionIds.has(id)) allUsedImprovements.add(id);
        })
      );

      const altConstraints = {
        ...constraints,
        excludedActions: [...(constraints.excludedActions ?? []), ...allUsedImprovements],
        maxIterations: 1500
      };

      try {
        const altPlan = await this.planner.findPlan(worldState, goalConditions, altConstraints);
        if (altPlan && altPlan.actions.length > 0) {
          addAlternative(altPlan, 'Completely different improvement approach');
        }
      } catch {
        // Ignore
      }
    }

    return alternatives;
  }

  /**
   * Calculate success probability for a plan
   */
  private calculateSuccessProbability(plan: GOAPPlan): number {
    if (plan.actions.length === 0) return 0;

    // Multiply individual action success rates
    let probability = 1.0;
    for (const action of plan.actions) {
      probability *= action.successRate ?? 0.9;
    }

    return Math.round(probability * 100) / 100;
  }

  /**
   * Persist plan to database
   */
  private async persistPlan(
    plan: GOAPPlan,
    context: QualityGateContext,
    goalId: string
  ): Promise<void> {
    try {
      const actionSequence = JSON.stringify(plan.actions.map(a => a.id));
      this.db.prepare(`
        INSERT INTO goap_plans (
          id, goal_id, sequence, total_cost, created_at,
          initial_state, goal_state, action_sequence, estimated_duration, status
        ) VALUES (?, ?, ?, ?, strftime('%s', 'now'), ?, ?, ?, ?, 'pending')
      `).run(
        plan.id,
        goalId,
        actionSequence,  // sequence (required NOT NULL)
        Math.round(plan.totalCost),  // total_cost as INTEGER
        JSON.stringify({ projectId: context.projectId, buildId: context.buildId }),
        JSON.stringify(plan.goalConditions),
        actionSequence,  // action_sequence (same as sequence)
        Math.round(plan.estimatedDuration)
      );

      this.logger.debug('[GOAPQualityGate] Plan persisted', { planId: plan.id });
    } catch (error) {
      this.logger.warn('[GOAPQualityGate] Failed to persist plan', { error });
    }
  }

  /**
   * Format plan for external consumption
   */
  private formatRemediationPlan(
    plan: GOAPPlan,
    alternatives: AlternativePath[],
    successProbability: number
  ): RemediationPlan {
    return {
      planId: plan.id,
      actions: plan.actions.map(a => ({
        id: a.id,
        name: a.name,
        description: a.description,
        agentType: a.agentType,
        category: a.category,
        estimatedDuration: a.durationEstimate ?? 60000,
        successRate: a.successRate ?? 0.9,
        effects: Object.keys(a.effects)
      })),
      totalCost: plan.totalCost,
      estimatedDuration: plan.estimatedDuration,
      successProbability,
      alternativePaths: alternatives,
      createdAt: new Date().toISOString()
    };
  }

  /**
   * Map criticality to risk level
   */
  private mapCriticality(criticality?: string): 'low' | 'medium' | 'high' | 'critical' {
    switch (criticality) {
      case 'critical': return 'critical';
      case 'high': return 'high';
      case 'medium': return 'medium';
      default: return 'low';
    }
  }

  /**
   * Update action success rate based on execution outcome
   */
  async recordActionOutcome(
    actionId: string,
    success: boolean
  ): Promise<void> {
    try {
      // Get current stats
      const row = this.db.prepare(`
        SELECT success_rate, execution_count FROM goap_actions WHERE id = ?
      `).get(actionId) as { success_rate: number; execution_count: number } | undefined;

      if (!row) return;

      const currentRate = row.success_rate ?? 1.0;
      const count = row.execution_count ?? 0;
      const newRate = (currentRate * count + (success ? 1 : 0)) / (count + 1);

      this.db.prepare(`
        UPDATE goap_actions
        SET success_rate = ?,
            execution_count = execution_count + 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(newRate, actionId);

      this.logger.debug('[GOAPQualityGate] Action outcome recorded', {
        actionId,
        success,
        newRate
      });
    } catch (error) {
      this.logger.warn('[GOAPQualityGate] Failed to record action outcome', { error });
    }
  }

  /**
   * Mark plan as completed
   */
  async completePlan(planId: string, success: boolean, reason?: string): Promise<void> {
    try {
      this.db.prepare(`
        UPDATE goap_plans
        SET status = ?,
            success = ?,
            failure_reason = ?,
            completed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        success ? 'completed' : 'failed',
        success ? 1 : 0,
        reason ?? null,
        planId
      );
    } catch (error) {
      this.logger.warn('[GOAPQualityGate] Failed to complete plan', { error });
    }
  }

  /**
   * Get successful plan templates for similar goals
   */
  async getSimilarSuccessfulPlans(
    goalId: string,
    limit: number = 5
  ): Promise<GOAPPlan[]> {
    try {
      const rows = this.db.prepare(`
        SELECT id, action_sequence, total_cost, estimated_duration, goal_state
        FROM goap_plans
        WHERE goal_id = ? AND success = 1
        ORDER BY total_cost ASC
        LIMIT ?
      `).all(goalId, limit) as Array<{
        id: string;
        action_sequence: string;
        total_cost: number;
        estimated_duration: number;
        goal_state: string;
      }>;

      return rows.map(row => ({
        id: row.id,
        actions: [],  // Would need to hydrate from action library
        totalCost: row.total_cost,
        estimatedDuration: row.estimated_duration,
        goalConditions: JSON.parse(row.goal_state)
      }));
    } catch (error) {
      this.logger.warn('[GOAPQualityGate] Failed to get similar plans', { error });
      return [];
    }
  }
}

/**
 * Factory function to create integration instance
 */
export function createQualityGateIntegration(dbPath: string): GOAPQualityGateIntegration {
  const Database = require('better-sqlite3');
  const db = new Database(dbPath);
  return new GOAPQualityGateIntegration(db);
}
