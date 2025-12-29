/**
 * GOAP Action Library Index
 *
 * Centralized export of all GOAP actions for:
 * - Quality Gate decisions
 * - Test Strategy generation
 * - Fleet Orchestration
 *
 * @module planning/actions
 * @version 1.0.0
 */

// Quality Gate Actions
export {
  qualityGateActions,
  getQualityGateAction,
  getQualityGateActionsByCategory,
  runUnitTests,
  runIntegrationTests,
  generateMissingTests,
  runSecurityScan,
  fixCriticalVulnerabilities,
  runPerformanceBenchmark,
  analyzeCodeComplexity,
  requestGateException,
  runSmokeTests,
  evaluateQualityGate,
  finalizeQualityGate
} from './quality-gate-actions';

// Test Strategy Actions
export {
  testStrategyActions,
  getTestStrategyAction,
  getQuickTestStrategyActions,
  getCoverageImprovementActions,
  analyzeChangeImpact,
  prioritizeTestsByRisk,
  selectMinimalTestSuite,
  analyzeCoverageGaps,
  generateTargetedTests,
  runCriticalPathTests,
  detectFlakyTests,
  stabilizeFlakyTests,
  generateBDDScenarios,
  optimizeParallelExecution
} from './test-strategy-actions';

// Fleet Orchestration Actions
export {
  fleetActions,
  getFleetAction,
  getSpawnActions,
  getScalingActions,
  getSpawnActionForAgentType,
  spawnTestGenerator,
  spawnCoverageAnalyzer,
  spawnSecurityScanner,
  spawnPerformanceTester,
  spawnFlakyHunter,
  terminateIdleAgent,
  scaleUpParallel,
  scaleDownFleet,
  optimizeTopology,
  initHierarchicalCoordination,
  redistributeWorkload
} from './fleet-actions';

// Orchestration Actions (for task-orchestrate GOAP integration)
export {
  orchestrationActions,
  getOrchestrationActionsByCategory,
  getActionsForTaskType,
  analyzeCodebase,
  analyzeChangeImpact as orchAnalyzeChangeImpact,
  analyzeCoverageGaps as orchAnalyzeCoverageGaps,
  generateUnitTests,
  generateIntegrationTests,
  generateBDDScenarios as orchGenerateBDDScenarios,
  executeUnitTests,
  executeIntegrationTests,
  measureCoverage,
  improveCoverage,
  runSecurityScan as orchRunSecurityScan,
  fixSecurityIssues,
  measurePerformanceBaseline,
  runLoadTests,
  runStressTests,
  analyzeBottlenecks,
  evaluateQualityGate as orchEvaluateQualityGate
} from './orchestration-actions';

import { GOAPAction } from '../types';
import { qualityGateActions } from './quality-gate-actions';
import { testStrategyActions } from './test-strategy-actions';
import { fleetActions } from './fleet-actions';
import { orchestrationActions } from './orchestration-actions';

/**
 * All available GOAP actions combined
 */
export const allActions: GOAPAction[] = [
  ...qualityGateActions,
  ...testStrategyActions,
  ...fleetActions,
  ...orchestrationActions
];

/**
 * Get any action by ID from any category
 */
export function getAction(id: string): GOAPAction | undefined {
  return allActions.find(a => a.id === id);
}

/**
 * Get actions by category across all libraries
 */
export function getActionsByCategory(category: GOAPAction['category']): GOAPAction[] {
  return allActions.filter(a => a.category === category);
}

/**
 * Get actions executable by a specific agent type
 */
export function getActionsForAgentType(agentType: string): GOAPAction[] {
  return allActions.filter(a => a.agentType === agentType);
}

/**
 * Get actions within a cost budget
 */
export function getActionsWithinCost(maxCost: number): GOAPAction[] {
  return allActions.filter(a => a.cost <= maxCost);
}

/**
 * Get actions within a time budget (milliseconds)
 */
export function getActionsWithinTime(maxTimeMs: number): GOAPAction[] {
  return allActions.filter(a => (a.durationEstimate ?? 0) <= maxTimeMs);
}

/**
 * Get actions with high success rates
 */
export function getReliableActions(minSuccessRate: number = 0.9): GOAPAction[] {
  return allActions.filter(a => (a.successRate ?? 1.0) >= minSuccessRate);
}

/**
 * Action statistics
 */
export const actionStats = {
  total: allActions.length,
  byCategory: {
    test: allActions.filter(a => a.category === 'test').length,
    security: allActions.filter(a => a.category === 'security').length,
    performance: allActions.filter(a => a.category === 'performance').length,
    process: allActions.filter(a => a.category === 'process').length,
    fleet: allActions.filter(a => a.category === 'fleet').length,
    analysis: allActions.filter(a => a.category === 'analysis').length
  },
  averageCost: allActions.reduce((sum, a) => sum + a.cost, 0) / allActions.length,
  averageSuccessRate: allActions.reduce((sum, a) => sum + (a.successRate ?? 1.0), 0) / allActions.length
};
