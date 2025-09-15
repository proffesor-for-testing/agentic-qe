#!/usr/bin/env node

/**
 * Consensus Protocols Example
 * Demonstrates distributed consensus mechanisms for QE workflows
 */

import { AgenticQE } from '../src/index';
import {
  ByzantineCoordinatorAgent,
  RaftManagerAgent,
  GossipCoordinatorAgent,
  QuorumManagerAgent,
  CRDTSynchronizerAgent
} from '../src/agents';
import {
  AgentType,
  AgentConfig,
  ConsensusAlgorithm,
  SecurityReport,
  RSTHeuristic
} from '../src/core/types';
import chalk from 'chalk';

interface TestScenario {
  testSuite: string;
  nodes: number;
  environment: string;
  decisions: string[];
}

interface ByzantineScenario extends TestScenario {
  maliciousNodes: number;
  attackType: string;
}

interface ByzantineResult {
  honestNodes: number;
  maliciousDetected: number;
  consensusRounds: number;
  decision: string;
  confidence: number;
  latency?: number;
}

interface RaftScenario extends TestScenario {
  operation: string;
  entries: number;
}

interface RaftResult {
  leader: string;
  term: number;
  entriesReplicated: number;
  commitIndex: number;
  electionTime: number;
  latency?: number;
}

interface FailoverResult {
  newLeader: string;
  failoverTime: number;
  dataLoss: boolean;
}

interface GossipScenario extends TestScenario {
  information: string;
  initialNodes: number;
  targetNodes: number;
}

interface GossipResult {
  rounds: number;
  convergenceTime: number;
  messageCount: number;
  bandwidth: number;
  consistency: number;
  latency?: number;
}

interface QuorumVoter {
  id: string;
  weight: number;
}

interface QuorumScenario extends TestScenario {
  decision: string;
  voters: QuorumVoter[];
}

interface QuorumResult {
  requiredQuorum: number;
  votesReceived: number;
  weightedTotal: number;
  decision: string;
  consensusStrength: number;
  latency?: number;
}

interface CRDTOperation {
  node: string;
  operation: string;
  value: string;
}

interface CRDTScenario extends TestScenario {
  concurrentUpdates: CRDTOperation[];
}

interface CRDTResult {
  operationsProcessed: number;
  conflictsResolved: number;
  consistency: number;
  deltaSyncEfficiency: number;
  causalOrdering: boolean;
  latency?: number;
}

interface ProtocolComparison {
  name: string;
  latency: number;
  faultTolerance: string;
  consistency: string;
}

async function demonstrateConsensusProtocols(): Promise<void> {
  console.log(chalk.blue.bold('\n🤝 Consensus Protocols Example\n'));

  const aqe = new AgenticQE({
    security: {
      enablePromptInjectionProtection: true,
      enableAuditLogging: true
    }
  });

  // Scenario: Distributed test execution requiring consensus
  const scenario: TestScenario = {
    testSuite: 'critical-payment-flow',
    nodes: 7,
    environment: 'production-staging',
    decisions: [
      'test-execution-order',
      'resource-allocation',
      'failure-handling',
      'result-aggregation'
    ]
  };

  console.log(chalk.yellow('Scenario: Distributed Test Execution'));
  console.log('─'.repeat(50));
  console.log(`Test Suite: ${scenario.testSuite}`);
  console.log(`Nodes: ${scenario.nodes}`);
  console.log(`Environment: ${scenario.environment}`);
  console.log(`Decisions Required: ${scenario.decisions.join(', ')}`);

  // 1. Byzantine Fault Tolerance
  console.log(chalk.yellow('\n1. Byzantine Fault Tolerance (pBFT)'));
  console.log('─'.repeat(40));

  const byzantineConfig: AgentConfig = {
    type: 'byzantine-coordinator' as AgentType,
    pactLevel: 4,
    capabilities: {
      maxConcurrentTasks: 7,
      supportedTaskTypes: ['consensus', 'fault-tolerance'],
      pactLevel: 4,
      rstHeuristics: ['SFDIPOT', 'CRUSSPIC'] as RSTHeuristic[],
      contextAwareness: true,
      explainability: true,
      learningEnabled: true,
      securityClearance: 'confidential' as any
    },
    learning: { enabled: true }
  };

  const byzantineCoord = aqe.createAgent('byzantine-coordinator' as AgentType, byzantineConfig);

  // Simulate Byzantine scenario with malicious nodes
  const byzantineScenario: ByzantineScenario = {
    ...scenario,
    maliciousNodes: 2,
    attackType: 'false-results'
  };

  const byzObservation = await byzantineCoord.perceive(byzantineScenario);
  const byzDecision = await byzantineCoord.decide(byzObservation);
  const byzResult = await byzantineCoord.act(byzDecision) as ByzantineResult;

  console.log(chalk.green('✓ Byzantine consensus achieved'));
  console.log(`  Honest nodes: ${byzResult.honestNodes}`);
  console.log(`  Malicious detected: ${byzResult.maliciousDetected}`);
  console.log(`  Consensus rounds: ${byzResult.consensusRounds}`);
  console.log(`  Final decision: ${byzResult.decision}`);
  console.log(`  Confidence: ${byzResult.confidence}%`);

  if (byzResult.maliciousDetected > 0) {
    console.log(chalk.red(`  ⚠️  Malicious behavior detected and isolated`));
  }

  // 2. Raft Consensus
  console.log(chalk.yellow('\n2. Raft Consensus (Leader-based)'));
  console.log('─'.repeat(40));

  const raftManager = aqe.createAgent('raft-manager' as AgentType, {
    type: 'raft-manager' as AgentType,
    pactLevel: 3,
    capabilities: {
      maxConcurrentTasks: 7,
      supportedTaskTypes: ['leader-election', 'log-replication'],
      pactLevel: 3,
      rstHeuristics: ['SFDIPOT'] as RSTHeuristic[],
      contextAwareness: true,
      explainability: true,
      learningEnabled: false,
      securityClearance: 'internal' as any
    },
    learning: { enabled: false }
  });

  // Simulate leader election and log replication
  const raftScenario: RaftScenario = {
    ...scenario,
    operation: 'distribute-test-execution',
    entries: 100
  };

  const raftObservation = await raftManager.perceive(raftScenario);
  const raftDecision = await raftManager.decide(raftObservation);
  const raftResult = await raftManager.act(raftDecision) as RaftResult;

  console.log(chalk.green('✓ Raft consensus established'));
  console.log(`  Current leader: ${raftResult.leader}`);
  console.log(`  Term: ${raftResult.term}`);
  console.log(`  Log entries replicated: ${raftResult.entriesReplicated}`);
  console.log(`  Commit index: ${raftResult.commitIndex}`);
  console.log(`  Election time: ${raftResult.electionTime}ms`);

  // Simulate leader failure
  console.log(chalk.cyan('\n  Simulating leader failure...'));
  const failoverResult = await raftManager.act({
    action: 'leader-failure',
    recovery: 'automatic'
  }) as FailoverResult;

  console.log(`  New leader elected: ${failoverResult.newLeader}`);
  console.log(`  Failover time: ${failoverResult.failoverTime}ms`);
  console.log(`  Data loss: ${failoverResult.dataLoss ? 'Yes' : 'No'}`);

  // 3. Gossip Protocol
  console.log(chalk.yellow('\n3. Gossip Protocol (Eventually Consistent)'));
  console.log('─'.repeat(40));

  const gossipCoord = aqe.createAgent('gossip-coordinator' as AgentType, {
    type: 'gossip-coordinator' as AgentType,
    pactLevel: 2,
    capabilities: {
      maxConcurrentTasks: 7,
      supportedTaskTypes: ['gossip-propagation'],
      pactLevel: 2,
      rstHeuristics: ['SFDIPOT'] as RSTHeuristic[],
      contextAwareness: true,
      explainability: false,
      learningEnabled: false,
      securityClearance: 'internal' as any
    },
    learning: { enabled: false }
  });

  // Simulate information dissemination
  const gossipScenario: GossipScenario = {
    ...scenario,
    information: 'test-results',
    initialNodes: 1,
    targetNodes: scenario.nodes
  };

  const gossipObservation = await gossipCoord.perceive(gossipScenario);
  const gossipDecision = await gossipCoord.decide(gossipObservation);
  const gossipResult = await gossipCoord.act(gossipDecision) as GossipResult;

  console.log(chalk.green('✓ Gossip protocol convergence'));
  console.log(`  Rounds to convergence: ${gossipResult.rounds}`);
  console.log(`  Time to convergence: ${gossipResult.convergenceTime}ms`);
  console.log(`  Messages exchanged: ${gossipResult.messageCount}`);
  console.log(`  Bandwidth used: ${gossipResult.bandwidth}KB`);
  console.log(`  Final consistency: ${gossipResult.consistency}%`);

  // 4. Quorum-based Consensus
  console.log(chalk.yellow('\n4. Quorum-based Consensus'));
  console.log('─'.repeat(40));

  const quorumManager = aqe.createAgent('quorum-manager' as AgentType, {
    type: 'quorum-manager' as AgentType,
    pactLevel: 3,
    capabilities: {
      maxConcurrentTasks: 5,
      supportedTaskTypes: ['voting', 'quorum-management'],
      pactLevel: 3,
      rstHeuristics: ['SFDIPOT'] as RSTHeuristic[],
      contextAwareness: true,
      explainability: true,
      learningEnabled: false,
      securityClearance: 'internal' as any
    },
    learning: { enabled: false }
  });

  // Simulate weighted voting scenario
  const quorumScenario: QuorumScenario = {
    ...scenario,
    decision: 'approve-production-deployment',
    voters: [
      { id: 'qa-lead', weight: 3 },
      { id: 'security-expert', weight: 2 },
      { id: 'performance-tester', weight: 2 },
      { id: 'automation-engineer', weight: 1 },
      { id: 'manual-tester', weight: 1 }
    ]
  };

  const quorumObservation = await quorumManager.perceive(quorumScenario);
  const quorumDecision = await quorumManager.decide(quorumObservation);
  const quorumResult = await quorumManager.act(quorumDecision) as QuorumResult;

  console.log(chalk.green('✓ Quorum decision reached'));
  console.log(`  Required quorum: ${quorumResult.requiredQuorum}`);
  console.log(`  Votes received: ${quorumResult.votesReceived}`);
  console.log(`  Weighted total: ${quorumResult.weightedTotal}`);
  console.log(`  Decision: ${quorumResult.decision}`);
  console.log(`  Consensus strength: ${quorumResult.consensusStrength}%`);

  // 5. CRDT Synchronization
  console.log(chalk.yellow('\n5. CRDT Synchronization (Conflict-free)'));
  console.log('─'.repeat(40));

  const crdtSync = aqe.createAgent('crdt-synchronizer' as AgentType, {
    type: 'crdt-synchronizer' as AgentType,
    pactLevel: 2,
    capabilities: {
      maxConcurrentTasks: 10,
      supportedTaskTypes: ['crdt-sync', 'conflict-resolution'],
      pactLevel: 2,
      rstHeuristics: ['SFDIPOT'] as RSTHeuristic[],
      contextAwareness: true,
      explainability: false,
      learningEnabled: false,
      securityClearance: 'internal' as any
    },
    learning: { enabled: false }
  });

  // Simulate concurrent test result updates
  const crdtScenario: CRDTScenario = {
    ...scenario,
    concurrentUpdates: [
      { node: 'node-1', operation: 'add', value: 'test-1-passed' },
      { node: 'node-2', operation: 'add', value: 'test-2-failed' },
      { node: 'node-3', operation: 'add', value: 'test-3-passed' },
      { node: 'node-2', operation: 'remove', value: 'test-2-failed' },
      { node: 'node-2', operation: 'add', value: 'test-2-passed' }
    ]
  };

  const crdtObservation = await crdtSync.perceive(crdtScenario);
  const crdtDecision = await crdtSync.decide(crdtObservation);
  const crdtResult = await crdtSync.act(crdtDecision) as CRDTResult;

  console.log(chalk.green('✓ CRDT synchronization complete'));
  console.log(`  Operations processed: ${crdtResult.operationsProcessed}`);
  console.log(`  Conflicts resolved: ${crdtResult.conflictsResolved}`);
  console.log(`  Final state consistency: ${crdtResult.consistency}%`);
  console.log(`  Delta sync efficiency: ${crdtResult.deltaSyncEfficiency}%`);
  console.log(`  Causal ordering preserved: ${crdtResult.causalOrdering ? 'Yes' : 'No'}`);

  // Performance Comparison
  console.log(chalk.blue('\n📊 Consensus Protocol Comparison'));
  console.log('─'.repeat(50));

  const protocols: ProtocolComparison[] = [
    {
      name: 'Byzantine (pBFT)',
      latency: byzResult.latency || 250,
      faultTolerance: 'Byzantine',
      consistency: 'Strong'
    },
    {
      name: 'Raft',
      latency: raftResult.latency || 100,
      faultTolerance: 'Crash',
      consistency: 'Strong'
    },
    {
      name: 'Gossip',
      latency: gossipResult.latency || 500,
      faultTolerance: 'Partition',
      consistency: 'Eventual'
    },
    {
      name: 'Quorum',
      latency: quorumResult.latency || 150,
      faultTolerance: 'Crash',
      consistency: 'Strong'
    },
    {
      name: 'CRDT',
      latency: crdtResult.latency || 50,
      faultTolerance: 'Partition',
      consistency: 'Eventual'
    }
  ];

  console.log(chalk.cyan('Protocol Characteristics:'));
  console.log('─'.repeat(50));
  console.table(protocols);

  // Use Case Recommendations
  console.log(chalk.blue('\n💡 Use Case Recommendations'));
  console.log('─'.repeat(50));
  console.log('• Byzantine: When nodes may be compromised or malicious');
  console.log('• Raft: For strong consistency with leader-based coordination');
  console.log('• Gossip: For large-scale eventual consistency scenarios');
  console.log('• Quorum: For democratic decision-making with voting');
  console.log('• CRDT: For conflict-free concurrent updates');

  // Security Report
  const securityReport: SecurityReport = aqe.getSecurityReport();
  console.log(chalk.blue('\n🔒 Security Report'));
  console.log('─'.repeat(50));
  console.log(`Total validations: ${securityReport.totalValidations}`);
  console.log(`Security issues: ${securityReport.securityIssues.length}`);
  console.log(`Audit entries: ${securityReport.auditLog.length}`);

  console.log(chalk.green.bold('\n✅ Consensus Protocols Demonstration Complete!\n'));
}

// Run the example
if (require.main === module) {
  demonstrateConsensusProtocols()
    .then(() => process.exit(0))
    .catch((error: Error) => {
      console.error(chalk.red('Error:'), error);
      process.exit(1);
    });
}

export { demonstrateConsensusProtocols };