#!/usr/bin/env node

/**
 * Swarm Coordination Example
 * Demonstrates multi-agent swarm coordination with different topologies
 */

import { AgenticQE } from '../src/index';
import {
  HierarchicalCoordinatorAgent,
  MeshCoordinatorAgent,
  AdaptiveCoordinatorAgent,
  CollectiveIntelligenceCoordinatorAgent,
  SwarmMemoryManagerAgent
} from '../src/agents';
import {
  AgentType,
  AgentConfig,
  RSTHeuristic,
  ConsensusAlgorithm,
  SwarmTopology
} from '../src/core/types';
import chalk from 'chalk';

interface TestScenario {
  target: string;
  endpoints: number;
  testTypes: string[];
  expectedLoad: number;
  timeConstraint: string;
}

interface HierarchicalResult {
  queen: { id: string };
  lieutenants: any[];
  workers: any[];
  metrics: {
    commandLatency: number;
    efficiency: number;
    throughput?: number;
  };
}

interface MeshResult {
  peers: any[];
  consensus: { algorithm: ConsensusAlgorithm };
  metrics: {
    networkDiameter: number;
    faultTolerance: number;
    convergenceTime: number;
    throughput?: number;
  };
}

interface AdaptiveResult {
  topology: SwarmTopology;
  agentCount: number;
  metrics: { performance: number };
  adaptationReason: string;
}

interface CollectiveResult {
  swarmSize: number;
  wisdomScore: number;
  consensusConfidence: number;
  emergentInsights: string[];
}

interface MemoryResult {
  cacheLevels: number;
  metrics: {
    hitRatio: number;
    syncLatency: number;
    efficiency: number;
  };
}

interface ConditionPhase {
  phase: string;
  load: string;
  networkQuality: string;
}

interface SwarmAgent {
  type: string;
  expertise: number;
}

interface TopologyPerformance {
  name: string;
  throughput: number;
}

async function demonstrateSwarmCoordination(): Promise<void> {
  console.log(chalk.blue.bold('\n🐝 Swarm Coordination Example\n'));

  const aqe = new AgenticQE({
    security: {
      enablePromptInjectionProtection: true,
      rateLimiting: { requests: 1000, window: 60000 }
    }
  });

  // Test scenario: Large-scale API testing with multiple agents
  const testScenario: TestScenario = {
    target: 'e-commerce-api',
    endpoints: 50,
    testTypes: ['functional', 'security', 'performance', 'contract'],
    expectedLoad: 10000,
    timeConstraint: '2 hours'
  };

  console.log(chalk.yellow('Scenario: Large-scale API Testing'));
  console.log('─'.repeat(50));
  console.log(`Target: ${testScenario.target}`);
  console.log(`Endpoints: ${testScenario.endpoints}`);
  console.log(`Test Types: ${testScenario.testTypes.join(', ')}`);
  console.log(`Expected Load: ${testScenario.expectedLoad} requests`);

  // 1. Hierarchical Coordination (Queen-led)
  console.log(chalk.yellow('\n1. Hierarchical Swarm (Queen-led)'));
  console.log('─'.repeat(40));

  const hierarchicalConfig: AgentConfig = {
    type: 'hierarchical-coordinator' as AgentType,
    pactLevel: 4,
    capabilities: {
      maxConcurrentTasks: 10,
      supportedTaskTypes: ['coordination', 'delegation'],
      pactLevel: 4,
      rstHeuristics: ['SFDIPOT'] as RSTHeuristic[],
      contextAwareness: true,
      explainability: true,
      learningEnabled: true,
      securityClearance: 'confidential' as any
    },
    learning: { enabled: true }
  };

  const hierarchicalCoord = aqe.createAgent('hierarchical-coordinator' as AgentType, hierarchicalConfig);

  const hierObservation = await hierarchicalCoord.perceive(testScenario);
  const hierDecision = await hierarchicalCoord.decide(hierObservation);
  const hierResult = await hierarchicalCoord.act(hierDecision) as HierarchicalResult;

  console.log(chalk.green('✓ Hierarchical swarm deployed'));
  console.log(`  Queen: ${hierResult.queen.id}`);
  console.log(`  Lieutenants: ${hierResult.lieutenants.length}`);
  console.log(`  Workers: ${hierResult.workers.length}`);
  console.log(`  Command latency: ${hierResult.metrics.commandLatency}ms`);
  console.log(`  Efficiency: ${hierResult.metrics.efficiency}%`);

  // 2. Mesh Coordination (Peer-to-peer)
  console.log(chalk.yellow('\n2. Mesh Network Swarm (P2P)'));
  console.log('─'.repeat(40));

  const meshCoord = aqe.createAgent('mesh-coordinator' as AgentType, {
    type: 'mesh-coordinator' as AgentType,
    pactLevel: 3,
    capabilities: {
      maxConcurrentTasks: 20,
      supportedTaskTypes: ['p2p-coordination'],
      pactLevel: 3,
      rstHeuristics: ['SFDIPOT', 'CRUSSPIC'] as RSTHeuristic[],
      contextAwareness: true,
      explainability: true,
      learningEnabled: true,
      securityClearance: 'internal' as any
    },
    learning: { enabled: true }
  });

  const meshObservation = await meshCoord.perceive(testScenario);
  const meshDecision = await meshCoord.decide(meshObservation);
  const meshResult = await meshCoord.act(meshDecision) as MeshResult;

  console.log(chalk.green('✓ Mesh swarm deployed'));
  console.log(`  Peers: ${meshResult.peers.length}`);
  console.log(`  Consensus: ${meshResult.consensus.algorithm}`);
  console.log(`  Network diameter: ${meshResult.metrics.networkDiameter}`);
  console.log(`  Fault tolerance: ${meshResult.metrics.faultTolerance} nodes`);
  console.log(`  Gossip convergence: ${meshResult.metrics.convergenceTime}ms`);

  // 3. Adaptive Coordination (Dynamic topology)
  console.log(chalk.yellow('\n3. Adaptive Swarm (Dynamic Topology)'));
  console.log('─'.repeat(40));

  const adaptiveCoord = aqe.createAgent('adaptive-coordinator' as AgentType, {
    type: 'adaptive-coordinator' as AgentType,
    pactLevel: 4,
    capabilities: {
      maxConcurrentTasks: 15,
      supportedTaskTypes: ['adaptive-coordination'],
      pactLevel: 4,
      rstHeuristics: ['FEW_HICCUPPS'] as RSTHeuristic[],
      contextAwareness: true,
      explainability: true,
      learningEnabled: true,
      securityClearance: 'internal' as any
    },
    learning: { enabled: true }
  });

  // Simulate changing conditions
  const conditions: ConditionPhase[] = [
    { phase: 'initial', load: 'low', networkQuality: 'good' },
    { phase: 'peak', load: 'high', networkQuality: 'degraded' },
    { phase: 'recovery', load: 'medium', networkQuality: 'recovering' }
  ];

  for (const condition of conditions) {
    console.log(chalk.cyan(`\n  Phase: ${condition.phase}`));

    const adaptObservation = await adaptiveCoord.perceive({
      ...testScenario,
      currentConditions: condition
    });
    const adaptDecision = await adaptiveCoord.decide(adaptObservation);
    const adaptResult = await adaptiveCoord.act(adaptDecision) as AdaptiveResult;

    console.log(`  - Selected topology: ${adaptResult.topology}`);
    console.log(`  - Agents: ${adaptResult.agentCount}`);
    console.log(`  - Performance: ${adaptResult.metrics.performance}/10`);
    console.log(`  - Adaptation reason: ${adaptResult.adaptationReason}`);
  }

  // 4. Collective Intelligence
  console.log(chalk.yellow('\n4. Collective Intelligence Swarm'));
  console.log('─'.repeat(40));

  const collectiveCoord = aqe.createAgent('collective-intelligence-coordinator' as AgentType, {
    type: 'collective-intelligence-coordinator' as AgentType,
    pactLevel: 4,
    capabilities: {
      maxConcurrentTasks: 25,
      supportedTaskTypes: ['collective-intelligence'],
      pactLevel: 4,
      rstHeuristics: ['FEW_HICCUPPS', 'CRUSSPIC'] as RSTHeuristic[],
      contextAwareness: true,
      explainability: true,
      learningEnabled: true,
      securityClearance: 'confidential' as any
    },
    learning: { enabled: true }
  });

  // Create diverse agent swarm
  const swarmAgents: SwarmAgent[] = [
    { type: 'security-sentinel', expertise: 0.9 },
    { type: 'performance-hunter', expertise: 0.85 },
    { type: 'functional-flow-validator', expertise: 0.88 },
    { type: 'risk-oracle', expertise: 0.92 },
    { type: 'pattern-recognition-sage', expertise: 0.87 }
  ];

  const collectiveObservation = await collectiveCoord.perceive({
    scenario: testScenario,
    agents: swarmAgents
  });
  const collectiveDecision = await collectiveCoord.decide(collectiveObservation);
  const collectiveResult = await collectiveCoord.act(collectiveDecision) as CollectiveResult;

  console.log(chalk.green('✓ Collective intelligence activated'));
  console.log(`  Swarm size: ${collectiveResult.swarmSize}`);
  console.log(`  Wisdom score: ${collectiveResult.wisdomScore}/10`);
  console.log(`  Consensus confidence: ${collectiveResult.consensusConfidence}%`);
  console.log(`  Emergent insights: ${collectiveResult.emergentInsights.length}`);

  if (collectiveResult.emergentInsights.length > 0) {
    console.log(chalk.cyan('\n  Emergent Insights:'));
    collectiveResult.emergentInsights.slice(0, 3).forEach(insight => {
      console.log(`  • ${insight}`);
    });
  }

  // 5. Memory-Coordinated Swarm
  console.log(chalk.yellow('\n5. Memory-Coordinated Swarm'));
  console.log('─'.repeat(40));

  const memoryManager = aqe.createAgent('swarm-memory-manager' as AgentType, {
    type: 'swarm-memory-manager' as AgentType,
    pactLevel: 3,
    capabilities: {
      maxConcurrentTasks: 5,
      supportedTaskTypes: ['memory-management'],
      pactLevel: 3,
      rstHeuristics: ['SFDIPOT'] as RSTHeuristic[],
      contextAwareness: true,
      explainability: true,
      learningEnabled: false,
      securityClearance: 'internal' as any
    },
    learning: { enabled: false }
  });

  const memoryObservation = await memoryManager.perceive({
    swarmSize: 25,
    dataVolume: '10GB',
    accessPattern: 'read-heavy'
  });
  const memoryDecision = await memoryManager.decide(memoryObservation);
  const memoryResult = await memoryManager.act(memoryDecision) as MemoryResult;

  console.log(chalk.green('✓ Distributed memory established'));
  console.log(`  Cache levels: ${memoryResult.cacheLevels}`);
  console.log(`  Hit ratio: ${memoryResult.metrics.hitRatio}%`);
  console.log(`  Sync latency: ${memoryResult.metrics.syncLatency}ms`);
  console.log(`  Memory efficiency: ${memoryResult.metrics.efficiency}%`);

  // Performance Comparison
  console.log(chalk.blue('\n📊 Performance Comparison'));
  console.log('─'.repeat(50));

  const topologies: TopologyPerformance[] = [
    { name: 'Hierarchical', throughput: hierResult.metrics.throughput || 8500 },
    { name: 'Mesh', throughput: meshResult.metrics.throughput || 7200 },
    { name: 'Adaptive', throughput: 9200 },
    { name: 'Collective', throughput: 8800 }
  ];

  topologies.sort((a, b) => b.throughput - a.throughput);

  console.log(chalk.cyan('Throughput (tests/minute):'));
  topologies.forEach((topo, index) => {
    const bar = '█'.repeat(Math.floor(topo.throughput / 200));
    console.log(`  ${index + 1}. ${topo.name.padEnd(15)} ${bar} ${topo.throughput}`);
  });

  // Recommendations
  console.log(chalk.blue('\n💡 Recommendations'));
  console.log('─'.repeat(50));
  console.log('• Use Hierarchical for clear command structures');
  console.log('• Use Mesh for fault-tolerant, decentralized operations');
  console.log('• Use Adaptive for dynamic, changing environments');
  console.log('• Use Collective Intelligence for complex decision-making');
  console.log('• Use Memory Coordination for stateful operations');

  console.log(chalk.green.bold('\n✅ Swarm Coordination Demonstration Complete!\n'));
}

// Run the example
if (require.main === module) {
  demonstrateSwarmCoordination()
    .then(() => process.exit(0))
    .catch((error: Error) => {
      console.error(chalk.red('Error:'), error);
      process.exit(1);
    });
}

export { demonstrateSwarmCoordination };