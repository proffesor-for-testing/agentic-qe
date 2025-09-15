#!/usr/bin/env ts-node

/**
 * TypeScript Agents Example
 * Demonstrates the new TypeScript implementation with shared memory and explainability
 */

import { EventEmitter } from 'events';
import { RequirementsExplorerAgent } from '../src/agents/requirements-explorer';
import { DistributedMemorySystem } from '../src/memory/distributed-memory';
import {
  AgentId,
  AgentConfig,
  TaskDefinition,
  PACTLevel,
  ILogger,
  IEventBus
} from '../src/core/types';

// Simple logger implementation
class ConsoleLogger implements ILogger {
  debug(message: string, context?: any): void {
    console.log(`[DEBUG] ${message}`, context || '');
  }
  info(message: string, context?: any): void {
    console.log(`[INFO] ${message}`, context || '');
  }
  warn(message: string, context?: any): void {
    console.warn(`[WARN] ${message}`, context || '');
  }
  error(message: string, context?: any): void {
    console.error(`[ERROR] ${message}`, context || '');
  }
}

// Event bus implementation
class SimpleEventBus extends EventEmitter implements IEventBus {
  emit(event: string, data: any): boolean {
    return super.emit(event, data);
  }
}

async function demonstrateTypescriptAgents() {
  console.log('\n🚀 TypeScript Agents Demonstration\n');
  console.log('This example shows the new TypeScript implementation with:');
  console.log('- Shared distributed memory');
  console.log('- Explainable decisions');
  console.log('- RST heuristics');
  console.log('- PACT framework levels\n');

  // Initialize core services
  const logger = new ConsoleLogger();
  const eventBus = new SimpleEventBus();
  const memory = new DistributedMemorySystem(logger, eventBus);

  // Create agent ID
  const agentId: AgentId = {
    id: 'req-explorer-001',
    swarmId: 'qe-swarm',
    type: 'requirements-explorer',
    instance: 1
  };

  // Configure agent
  const config: AgentConfig = {
    name: 'Requirements Explorer',
    type: 'requirements-explorer',
    pactLevel: PACTLevel.COLLABORATIVE,
    capabilities: {
      maxConcurrentTasks: 3,
      supportedTaskTypes: ['analyze-requirements'],
      pactLevel: PACTLevel.COLLABORATIVE,
      rstHeuristics: ['SFDIPOT', 'FEW_HICCUPPS', 'CRUSSPIC'],
      contextAwareness: true,
      explainability: true,
      learningEnabled: true,
      securityClearance: 'internal' as any
    },
    environment: {
      runtime: 'node',
      version: '18.0.0',
      workingDirectory: './agents',
      logLevel: 'info',
      timeout: 30000
    },
    learning: {
      enabled: true,
      strategy: 'reinforcement',
      learningRate: 0.1,
      memoryRetention: 0.9,
      experienceSharing: true
    },
    security: {
      enablePromptInjectionProtection: true,
      enableOutputSanitization: true,
      enableAuditLogging: true,
      rateLimiting: {
        requests: 100,
        window: 60000
      },
      permissions: ['read', 'write', 'share']
    },
    collaboration: {
      maxCollaborators: 5,
      communicationProtocol: 'pubsub',
      consensusRequired: false,
      sharingStrategy: 'selective'
    },
    explainability: {
      enabled: true,
      detailLevel: 'detailed',
      includeAlternatives: true,
      includeConfidence: true,
      includeEvidence: true
    }
  };

  // Create Requirements Explorer agent
  const requirementsAgent = new RequirementsExplorerAgent(
    agentId,
    config,
    logger,
    eventBus,
    memory
  );

  // Initialize agent
  await requirementsAgent.initialize();
  console.log('✅ Requirements Explorer agent initialized\n');

  // Create a task
  const task: TaskDefinition = {
    id: 'task-001',
    type: 'analyze-requirements',
    priority: 'high',
    context: {
      domain: 'e-commerce',
      environment: 'production',
      testingPhase: 'requirements',
      qualityGates: [
        {
          name: 'Ambiguity Check',
          criteria: 'Less than 5 ambiguous terms',
          threshold: 5,
          mandatory: true
        },
        {
          name: 'Testability',
          criteria: 'Testability score > 70%',
          threshold: 0.7,
          mandatory: false
        }
      ],
      riskLevel: 'medium'
    },
    requirements: [
      'The system should respond quickly to user requests',
      'Users must be able to login with email and password within 2 seconds',
      'The application should be user-friendly and intuitive',
      'Payment processing must be secure and comply with PCI standards',
      'The system should handle 1000 concurrent users',
      'Data should be encrypted at rest and in transit',
      'The search feature should return results quickly'
    ],
    constraints: {
      timeLimit: 60000,
      qualityThreshold: 0.8,
      securityRequirements: [
        {
          type: 'encryption',
          level: 'confidential' as any,
          mandatory: true
        }
      ]
    },
    dependencies: [],
    expectedOutcome: 'Analyzed requirements with identified ambiguities and risks',
    metadata: {
      client: 'Demo Corp',
      project: 'E-Commerce Platform'
    }
  };

  console.log('📋 Analyzing Requirements:\n');
  task.requirements.forEach((req, i) => {
    console.log(`  ${i + 1}. ${req}`);
  });
  console.log('');

  // Execute the task
  console.log('🔍 Executing analysis...\n');
  const result = await requirementsAgent.executeTask(task);

  // Display results
  console.log('📊 Analysis Results:\n');

  console.log('Ambiguities Found:');
  if (result.ambiguities && result.ambiguities.length > 0) {
    result.ambiguities.forEach((amb: any) => {
      console.log(`  ⚠️  Requirement ${amb.requirement + 1}: "${amb.term}"`);
      console.log(`     Type: ${amb.type}`);
      console.log(`     Suggestion: ${amb.suggestion}`);
    });
  } else {
    console.log('  ✅ No ambiguities detected');
  }

  console.log('\nTestability Issues:');
  if (result.testability && result.testability.length > 0) {
    result.testability.forEach((issue: any) => {
      console.log(`  ⚠️  Requirement ${issue.requirement + 1}: ${issue.issue}`);
      console.log(`     Recommendation: ${issue.recommendation}`);
    });
  } else {
    console.log('  ✅ All requirements are testable');
  }

  console.log('\nRisks Identified:');
  if (result.risks && result.risks.length > 0) {
    result.risks.forEach((risk: any) => {
      console.log(`  🔴 Requirement ${risk.requirement + 1}: ${risk.category}`);
      console.log(`     Description: ${risk.description}`);
      console.log(`     Mitigation: ${risk.mitigation}`);
    });
  } else {
    console.log('  ✅ No significant risks identified');
  }

  console.log('\nTest Charters Generated:');
  if (result.charters && result.charters.length > 0) {
    result.charters.forEach((charter: any) => {
      console.log(`  📝 ${charter.charter}`);
      console.log(`     Duration: ${charter.timeBox} minutes`);
      console.log(`     Focus: ${charter.focus}`);
      console.log(`     Heuristics: ${charter.heuristics.join(', ')}`);
    });
  }

  console.log('\nRecommendations:');
  if (result.recommendations && result.recommendations.length > 0) {
    result.recommendations.forEach((rec: string) => {
      console.log(`  • ${rec}`);
    });
  }

  console.log(`\n🎯 Decision: ${result.decision}`);
  console.log(`📈 Confidence: ${(result.confidence * 100).toFixed(0)}%`);

  // Demonstrate explainability
  console.log('\n🧠 Explainable Decision:\n');

  // Query memory for the decision
  const decisions = await memory.query({
    type: 'decision',
    tags: ['requirements', 'explainable'],
    limit: 1
  });

  if (decisions.length > 0) {
    const decision = decisions[0].value;
    console.log('Reasoning Factors:');
    decision.reasoning.factors.forEach((factor: any) => {
      console.log(`  • ${factor.name}: ${factor.explanation}`);
      console.log(`    Weight: ${factor.weight}, Impact: ${factor.impact}`);
    });

    console.log('\nHeuristics Applied:');
    decision.reasoning.heuristics.forEach((heuristic: string) => {
      console.log(`  • ${heuristic}`);
    });

    console.log('\nAlternatives Considered:');
    decision.alternatives.forEach((alt: any) => {
      console.log(`  • ${alt.action} (Confidence: ${(alt.confidence * 100).toFixed(0)}%)`);
      console.log(`    Reason: ${alt.reason}`);
    });
  }

  // Demonstrate memory sharing
  console.log('\n💾 Shared Memory:\n');

  // Query shared knowledge
  const knowledge = await memory.query({
    type: 'knowledge',
    tags: ['shared'],
    limit: 5
  });

  console.log(`Total shared knowledge entries: ${knowledge.length}`);

  // Demonstrate collaboration
  console.log('\n🤝 Collaboration Example:\n');

  // Create another agent ID for collaboration
  const otherAgentId: AgentId = {
    id: 'risk-oracle-001',
    swarmId: 'qe-swarm',
    type: 'risk-oracle',
    instance: 1
  };

  // Collaborate
  const collaborationId = await requirementsAgent.collaborate(
    otherAgentId,
    {
      type: 'risk-assessment-request',
      findings: result.risks,
      priority: 'high'
    }
  );

  console.log(`Collaboration initiated: ${collaborationId}`);
  console.log('Message sent to Risk Oracle agent for further analysis');

  // Get agent state
  const state = requirementsAgent.getState();
  console.log('\n📊 Agent Metrics:');
  console.log(`  Requirements analyzed: ${state.metrics.requirementsAnalyzed}`);
  console.log(`  Ambiguities detected: ${state.metrics.ambiguitiesDetected}`);
  console.log(`  Risks identified: ${state.metrics.risksIdentified}`);
  console.log(`  Learning progress: ${(state.metrics.learningProgress * 100).toFixed(0)}%`);
  console.log(`  Explainability score: ${(state.metrics.explainabilityScore * 100).toFixed(0)}%`);

  // Get memory statistics
  const memStats = memory.getStatistics();
  console.log('\n💾 Memory Statistics:');
  console.log(`  Total entries: ${memStats.totalEntries}`);
  console.log(`  Partitions: ${memStats.partitionCount}`);
  console.log(`  Cache hit rate: ${(memStats.cacheHitRate * 100).toFixed(0)}%`);
  console.log(`  Replication health: ${(memStats.replicationHealth * 100).toFixed(0)}%`);

  // Cleanup
  await requirementsAgent.shutdown();
  console.log('\n✅ Agent shutdown complete');

  console.log('\n🎉 TypeScript Agents Demonstration Complete!\n');
  console.log('Key Features Demonstrated:');
  console.log('✅ TypeScript implementation with strong typing');
  console.log('✅ Distributed shared memory system');
  console.log('✅ Explainable AI decisions with reasoning');
  console.log('✅ RST heuristics application');
  console.log('✅ PACT framework compliance');
  console.log('✅ Agent collaboration');
  console.log('✅ Learning and adaptation');
  console.log('✅ Security controls');
}

// Run the demonstration
if (require.main === module) {
  demonstrateTypescriptAgents()
    .then(() => {
      console.log('\nExiting...');
      process.exit(0);
    })
    .catch(error => {
      console.error('Error:', error);
      process.exit(1);
    });
}

export { demonstrateTypescriptAgents };