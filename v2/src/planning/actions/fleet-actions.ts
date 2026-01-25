/**
 * Fleet Orchestration GOAP Actions
 *
 * Actions for agent fleet management:
 * - Agent spawning and termination
 * - Resource scaling
 * - Load balancing
 * - Fleet topology optimization
 *
 * @module planning/actions/fleet-actions
 * @version 1.0.0
 */

import { GOAPAction } from '../types';

/**
 * Spawn test generator agent action
 */
export const spawnTestGenerator: GOAPAction = {
  id: 'fleet-spawn-test-gen',
  name: 'Spawn Test Generator',
  description: 'Deploy AI-powered test generation agent',
  agentType: 'qe-fleet-commander',
  preconditions: {
    'fleet.activeAgents': { lt: 10 },             // Under max capacity
    'resources.memoryAvailable': { gte: 512 },    // 512MB minimum
    'resources.parallelSlots': { gte: 1 }
  },
  effects: {
    'fleet.activeAgents': { increment: 1 },
    'fleet.availableAgents': { add: 'qe-test-generator' },
    'resources.memoryAvailable': { decrease: 256 },
    'resources.parallelSlots': { decrement: 1 }
  },
  cost: 1.0,
  durationEstimate: 5000,  // 5 seconds
  successRate: 0.95,
  executionCount: 0,
  category: 'fleet'
};

/**
 * Spawn coverage analyzer agent action
 */
export const spawnCoverageAnalyzer: GOAPAction = {
  id: 'fleet-spawn-coverage',
  name: 'Spawn Coverage Analyzer',
  description: 'Deploy sublinear coverage gap detection agent',
  agentType: 'qe-fleet-commander',
  preconditions: {
    'fleet.activeAgents': { lt: 10 },
    'resources.memoryAvailable': { gte: 256 },
    'resources.parallelSlots': { gte: 1 }
  },
  effects: {
    'fleet.activeAgents': { increment: 1 },
    'fleet.availableAgents': { add: 'qe-coverage-analyzer' },
    'resources.memoryAvailable': { decrease: 128 },
    'resources.parallelSlots': { decrement: 1 }
  },
  cost: 0.8,
  durationEstimate: 3000,
  successRate: 0.97,
  executionCount: 0,
  category: 'fleet'
};

/**
 * Spawn security scanner agent action
 */
export const spawnSecurityScanner: GOAPAction = {
  id: 'fleet-spawn-security',
  name: 'Spawn Security Scanner',
  description: 'Deploy SAST/DAST security scanning agent',
  agentType: 'qe-fleet-commander',
  preconditions: {
    'fleet.activeAgents': { lt: 10 },
    'resources.memoryAvailable': { gte: 512 },
    'resources.parallelSlots': { gte: 1 }
  },
  effects: {
    'fleet.activeAgents': { increment: 1 },
    'fleet.availableAgents': { add: 'qe-security-scanner' },
    'resources.memoryAvailable': { decrease: 384 },
    'resources.parallelSlots': { decrement: 1 }
  },
  cost: 1.2,
  durationEstimate: 6000,
  successRate: 0.94,
  executionCount: 0,
  category: 'fleet'
};

/**
 * Spawn performance tester agent action
 */
export const spawnPerformanceTester: GOAPAction = {
  id: 'fleet-spawn-perf',
  name: 'Spawn Performance Tester',
  description: 'Deploy load/stress testing agent',
  agentType: 'qe-fleet-commander',
  preconditions: {
    'fleet.activeAgents': { lt: 10 },
    'resources.memoryAvailable': { gte: 1024 },   // Needs more memory
    'resources.parallelSlots': { gte: 2 }         // Needs more slots
  },
  effects: {
    'fleet.activeAgents': { increment: 1 },
    'fleet.availableAgents': { add: 'qe-performance-tester' },
    'resources.memoryAvailable': { decrease: 768 },
    'resources.parallelSlots': { decrease: 2 }
  },
  cost: 1.5,
  durationEstimate: 8000,
  successRate: 0.90,
  executionCount: 0,
  category: 'fleet'
};

/**
 * Spawn flaky test hunter agent action
 */
export const spawnFlakyHunter: GOAPAction = {
  id: 'fleet-spawn-flaky',
  name: 'Spawn Flaky Test Hunter',
  description: 'Deploy flaky test detection and remediation agent',
  agentType: 'qe-fleet-commander',
  preconditions: {
    'fleet.activeAgents': { lt: 10 },
    'resources.memoryAvailable': { gte: 256 },
    'resources.parallelSlots': { gte: 1 },
    'context.previousFailures': { gte: 1 }        // Only if there are failures
  },
  effects: {
    'fleet.activeAgents': { increment: 1 },
    'fleet.availableAgents': { add: 'qe-flaky-test-hunter' },
    'resources.memoryAvailable': { decrease: 192 },
    'resources.parallelSlots': { decrement: 1 }
  },
  cost: 1.0,
  durationEstimate: 4000,
  successRate: 0.96,
  executionCount: 0,
  category: 'fleet'
};

/**
 * Terminate idle agent action
 */
export const terminateIdleAgent: GOAPAction = {
  id: 'fleet-terminate-idle',
  name: 'Terminate Idle Agent',
  description: 'Shut down agents that have no pending work',
  agentType: 'qe-fleet-commander',
  preconditions: {
    'fleet.activeAgents': { gte: 1 }
  },
  effects: {
    'fleet.activeAgents': { decrement: 1 },
    'resources.memoryAvailable': { increase: 256 },
    'resources.parallelSlots': { increment: 1 }
  },
  cost: 0.2,
  durationEstimate: 2000,
  successRate: 0.99,
  executionCount: 0,
  category: 'fleet'
};

/**
 * Scale up parallel capacity action
 */
export const scaleUpParallel: GOAPAction = {
  id: 'fleet-scale-up',
  name: 'Scale Up Parallel Capacity',
  description: 'Increase parallel execution slots for faster throughput',
  agentType: 'qe-fleet-commander',
  preconditions: {
    'resources.parallelSlots': { lt: 8 },         // Not at max
    'resources.memoryAvailable': { gte: 1024 },   // Have memory headroom
    'resources.timeRemaining': { lt: 600 }        // Time pressure
  },
  effects: {
    'resources.parallelSlots': { increase: 2 },
    'resources.memoryAvailable': { decrease: 512 }
  },
  cost: 0.8,
  durationEstimate: 10000,
  successRate: 0.92,
  executionCount: 0,
  category: 'fleet'
};

/**
 * Scale down to conserve resources action
 */
export const scaleDownFleet: GOAPAction = {
  id: 'fleet-scale-down',
  name: 'Scale Down Fleet',
  description: 'Reduce fleet size to conserve resources',
  agentType: 'qe-fleet-commander',
  preconditions: {
    'fleet.activeAgents': { gte: 3 },             // Have agents to scale down
    'resources.memoryAvailable': { lt: 512 }      // Low on memory
  },
  effects: {
    'fleet.activeAgents': { decrease: 2 },
    'resources.memoryAvailable': { increase: 512 },
    'resources.parallelSlots': { increase: 2 }
  },
  cost: 0.5,
  durationEstimate: 5000,
  successRate: 0.95,
  executionCount: 0,
  category: 'fleet'
};

/**
 * Optimize fleet topology action
 */
export const optimizeTopology: GOAPAction = {
  id: 'fleet-optimize-topology',
  name: 'Optimize Fleet Topology',
  description: 'Rebalance agent communication patterns for efficiency',
  agentType: 'qe-fleet-commander',
  preconditions: {
    'fleet.activeAgents': { gte: 3 },             // Multiple agents
    'resources.timeRemaining': { gte: 60 }
  },
  effects: {
    'resources.parallelSlots': { increment: 1 },  // Better utilization
    'resources.timeRemaining': { decrease: 30 }
  },
  cost: 0.6,
  durationEstimate: 30000,
  successRate: 0.88,
  executionCount: 0,
  category: 'fleet'
};

/**
 * Initialize hierarchical coordination action
 */
export const initHierarchicalCoordination: GOAPAction = {
  id: 'fleet-init-hierarchical',
  name: 'Initialize Hierarchical Coordination',
  description: 'Set up queen-worker coordination topology',
  agentType: 'qe-fleet-commander',
  preconditions: {
    'fleet.activeAgents': { gte: 4 },             // Need enough agents
    'context.changeSize': { eq: 'large' }         // Large tasks benefit
  },
  effects: {
    'resources.parallelSlots': { increase: 3 },
    'fleet.topologyOptimized': { set: true }       // Flag: topology has been optimized
  },
  cost: 1.2,
  durationEstimate: 15000,
  successRate: 0.85,
  executionCount: 0,
  category: 'fleet'
};

/**
 * Redistribute workload action
 */
export const redistributeWorkload: GOAPAction = {
  id: 'fleet-redistribute',
  name: 'Redistribute Workload',
  description: 'Balance tasks across available agents',
  agentType: 'qe-fleet-commander',
  preconditions: {
    'fleet.activeAgents': { gte: 2 },
    'fleet.busyAgents': { exists: true }
  },
  effects: {
    'resources.parallelSlots': { increment: 1 },
    'resources.timeRemaining': { decrease: 20 }
  },
  cost: 0.4,
  durationEstimate: 20000,
  successRate: 0.93,
  executionCount: 0,
  category: 'fleet'
};

/**
 * All fleet orchestration actions
 */
export const fleetActions: GOAPAction[] = [
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
];

/**
 * Get fleet action by ID
 */
export function getFleetAction(id: string): GOAPAction | undefined {
  return fleetActions.find(a => a.id === id);
}

/**
 * Get spawn actions only
 */
export function getSpawnActions(): GOAPAction[] {
  return fleetActions.filter(a => a.id.startsWith('fleet-spawn'));
}

/**
 * Get scaling actions
 */
export function getScalingActions(): GOAPAction[] {
  return fleetActions.filter(a =>
    a.id.includes('scale') ||
    a.id.includes('terminate')
  );
}

/**
 * Get action to spawn specific agent type
 */
export function getSpawnActionForAgentType(agentType: string): GOAPAction | undefined {
  const mapping: Record<string, string> = {
    'qe-test-generator': 'fleet-spawn-test-gen',
    'qe-coverage-analyzer': 'fleet-spawn-coverage',
    'qe-security-scanner': 'fleet-spawn-security',
    'qe-performance-tester': 'fleet-spawn-perf',
    'qe-flaky-test-hunter': 'fleet-spawn-flaky'
  };
  const actionId = mapping[agentType];
  return actionId ? getFleetAction(actionId) : undefined;
}
