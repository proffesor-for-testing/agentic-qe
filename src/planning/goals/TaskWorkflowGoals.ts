/**
 * Task Workflow Goals for GOAP Integration
 *
 * Defines goal conditions for each task orchestration type.
 * These replace the hardcoded workflow templates with dynamic GOAP planning.
 *
 * @module planning/goals/TaskWorkflowGoals
 * @version 1.0.0
 */

import { StateConditions, GOAPGoal } from '../types';

/**
 * Goal definition for task orchestration
 */
export interface TaskGoalDefinition {
  id: string;
  name: string;
  description: string;
  conditions: StateConditions;
  allowedCategories: string[];
  priority: number;
  timeoutSeconds?: number;
  /** Minimum actions expected in plan */
  minActions?: number;
  /** Required measurement flags that must be set */
  requiredMeasurements?: string[];
}

/**
 * Task Workflow Goals - GOAP goal definitions for each orchestration type
 */
export const TASK_WORKFLOW_GOALS: Record<string, TaskGoalDefinition> = {
  /**
   * Comprehensive Testing Goal
   * Requires: code analysis, test generation, test execution, coverage analysis
   */
  'comprehensive-testing': {
    id: 'goal-comprehensive-testing',
    name: 'Comprehensive Testing Complete',
    description: 'All code analyzed, tests generated, executed, and coverage verified',
    conditions: {
      // Tests must be run and passing
      'quality.testsMeasured': { eq: true },
      'quality.testsPassing': { gte: 90 },
      // Coverage must meet target
      'coverage.measured': { eq: true },
      'coverage.line': { gte: 80 },
      // Integration tests run
      'quality.integrationTested': { eq: true },
      // Code complexity analyzed
      'quality.complexityMeasured': { eq: true }
    },
    allowedCategories: ['test', 'coverage', 'analysis'],
    priority: 3,
    timeoutSeconds: 1800, // 30 minutes
    minActions: 4,
    requiredMeasurements: ['testsMeasured', 'integrationTested', 'complexityMeasured']
  },

  /**
   * Quality Gate Goal
   * Requires: metrics collection, security scan, performance check, gate decision
   *
   * NOTE: Thresholds are set to be achievable by the action library:
   * - executeUnitTests sets testsPassing: 85, executeIntegrationTests adds 5 → 90
   * - executeUnitTests sets coverage.line: 70, improveCoverage adds 15 → 85
   * - runSecurityScan sets securityScore: 85
   */
  'quality-gate': {
    id: 'goal-quality-gate',
    name: 'Quality Gate Evaluated',
    description: 'All quality metrics collected and gate decision made',
    conditions: {
      // All measurements completed
      'quality.testsMeasured': { eq: true },
      'quality.securityMeasured': { eq: true },
      'quality.performanceMeasured': { eq: true },
      'coverage.measured': { eq: true },
      // Gate evaluated
      'quality.gateEvaluated': { eq: true },
      // Minimum thresholds - achievable by action library
      // executeUnitTests(85) + executeIntegrationTests(+5) = 90
      'quality.testsPassing': { gte: 90 },
      // executeUnitTests(70) + improveCoverage(+15) = 85
      'coverage.line': { gte: 70 },
      // runSecurityScan sets 85
      'quality.securityScore': { gte: 70 }
    },
    allowedCategories: ['test', 'security', 'performance', 'process', 'coverage'],
    priority: 5, // Critical priority
    timeoutSeconds: 1200, // 20 minutes
    minActions: 4,
    requiredMeasurements: ['testsMeasured', 'securityMeasured', 'performanceMeasured', 'gateEvaluated']
  },

  /**
   * Defect Prevention Goal
   * Requires: change analysis, defect prediction, preventive test generation
   */
  'defect-prevention': {
    id: 'goal-defect-prevention',
    name: 'Defect Prevention Complete',
    description: 'Changes analyzed, defects predicted, and preventive measures applied',
    conditions: {
      // Impact analysis done
      'context.impactAnalyzed': { eq: true },
      // Coverage gaps identified
      'context.coverageGapsAnalyzed': { eq: true },
      // BDD scenarios generated
      'context.bddGenerated': { eq: true },
      // Tests passing
      'quality.testsPassing': { gte: 90 }
    },
    allowedCategories: ['analysis', 'test', 'coverage'],
    priority: 3,
    timeoutSeconds: 1500, // 25 minutes
    minActions: 3,
    requiredMeasurements: ['impactAnalyzed', 'coverageGapsAnalyzed']
  },

  /**
   * Performance Validation Goal
   * Requires: baseline measurement, load testing, stress testing, bottleneck analysis
   */
  'performance-validation': {
    id: 'goal-performance-validation',
    name: 'Performance Validated',
    description: 'Performance baseline established and SLAs verified',
    conditions: {
      // Performance measured
      'quality.performanceMeasured': { eq: true },
      // Performance score acceptable
      'quality.performanceScore': { gte: 70 },
      // SLA targets met (latency under threshold)
      'quality.slaCompliant': { eq: true }
    },
    allowedCategories: ['performance', 'analysis'],
    priority: 3,
    timeoutSeconds: 2400, // 40 minutes (performance tests take longer)
    minActions: 3,
    requiredMeasurements: ['performanceMeasured']
  }
};

/**
 * Get goal definition for a task type
 */
export function getGoalForType(taskType: string): TaskGoalDefinition {
  const goal = TASK_WORKFLOW_GOALS[taskType];
  if (!goal) {
    throw new Error(`No goal definition found for task type: ${taskType}`);
  }
  return goal;
}

/**
 * Get all available task types
 */
export function getAvailableTaskTypes(): string[] {
  return Object.keys(TASK_WORKFLOW_GOALS);
}

/**
 * Customize goal conditions based on context
 *
 * @param baseGoal - The base goal definition
 * @param context - Orchestration context with custom requirements
 */
export function customizeGoalConditions(
  baseGoal: TaskGoalDefinition,
  context?: {
    coverageThreshold?: number;
    securityThreshold?: number;
    performanceThreshold?: number;
    testPassingThreshold?: number;
    requirements?: string[];
  }
): TaskGoalDefinition {
  const customizedGoal = { ...baseGoal, conditions: { ...baseGoal.conditions } };

  if (context?.coverageThreshold !== undefined) {
    customizedGoal.conditions['coverage.line'] = { gte: context.coverageThreshold };
  }

  if (context?.securityThreshold !== undefined) {
    customizedGoal.conditions['quality.securityScore'] = { gte: context.securityThreshold };
  }

  if (context?.performanceThreshold !== undefined) {
    customizedGoal.conditions['quality.performanceScore'] = { gte: context.performanceThreshold };
  }

  if (context?.testPassingThreshold !== undefined) {
    customizedGoal.conditions['quality.testsPassing'] = { gte: context.testPassingThreshold };
  }

  return customizedGoal;
}

/**
 * Convert GOAP goal definition to database-compatible format
 */
export function toGOAPGoal(definition: TaskGoalDefinition): GOAPGoal {
  return {
    id: definition.id,
    name: definition.name,
    description: definition.description,
    conditions: definition.conditions,
    priority: definition.priority,
    costWeight: 1.0,
    deadlineSeconds: definition.timeoutSeconds
  };
}

/**
 * Validate that a goal's required measurements can be achieved
 * by the available actions
 */
export function validateGoalAchievability(
  goal: TaskGoalDefinition,
  availableActions: { id: string; effects: Record<string, unknown> }[]
): { achievable: boolean; missingEffects: string[] } {
  const missingEffects: string[] = [];

  // Check each required measurement
  for (const measurement of goal.requiredMeasurements || []) {
    const canAchieve = availableActions.some(action => {
      const effects = action.effects as Record<string, { set?: boolean }>;
      for (const [key, effect] of Object.entries(effects)) {
        if (key.includes(measurement) && effect?.set === true) {
          return true;
        }
      }
      return false;
    });

    if (!canAchieve) {
      missingEffects.push(measurement);
    }
  }

  return {
    achievable: missingEffects.length === 0,
    missingEffects
  };
}
