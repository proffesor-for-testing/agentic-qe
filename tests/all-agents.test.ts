/**
 * Comprehensive Test Suite for All TypeScript Agents
 * Verifies that all 40+ agents are properly implemented and functional
 */

import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';

// Basic test to ensure Jest works with TypeScript
describe('Agent System', () => {
  it('should have a valid test environment', () => {
    expect(true).toBe(true);
  });

  it('should be able to import EventEmitter', () => {
    const emitter = new EventEmitter();
    expect(emitter).toBeInstanceOf(EventEmitter);
  });
});

// Import all agents
import * as Agents from '../src/agents';
import { DistributedMemorySystem } from '../src/memory/distributed-memory';
import {
  AgentId,
  AgentConfig,
  TaskDefinition,
  PACTLevel,
  ILogger,
  IEventBus
} from '../src/core/types';

// Simple test logger
class TestLogger implements ILogger {
  logs: string[] = [];

  debug(message: string, context?: any): void {
    this.logs.push(`[DEBUG] ${message}`);
  }
  info(message: string, context?: any): void {
    this.logs.push(`[INFO] ${message}`);
  }
  warn(message: string, context?: any): void {
    this.logs.push(`[WARN] ${message}`);
  }
  error(message: string, context?: any): void {
    this.logs.push(`[ERROR] ${message}`);
  }
}

// Test event bus
class TestEventBus extends EventEmitter implements IEventBus {
  events: { event: string; data: any }[] = [];

  emit(event: string, data: any): boolean {
    this.events.push({ event, data });
    return super.emit(event, data);
  }
}

// Test configuration factory
function createTestConfig(type: string): AgentConfig {
  return {
    name: `Test ${type}`,
    type: type as any,
    pactLevel: PACTLevel.COLLABORATIVE,
    capabilities: {
      maxConcurrentTasks: 3,
      supportedTaskTypes: [type] as any,
      pactLevel: PACTLevel.COLLABORATIVE,
      rstHeuristics: ['SFDIPOT'],
      contextAwareness: true,
      explainability: true,
      learningEnabled: true,
      securityClearance: 'internal' as any
    },
    environment: {
      runtime: 'node',
      version: '18.0.0',
      workingDirectory: './test',
      logLevel: 'info',
      timeout: 5000
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
}

// Test task factory
function createTestTask(type: string): TaskDefinition {
  return {
    id: `test-${type}-${Date.now()}`,
    type: type as any,
    priority: 'medium',
    context: {
      test: true,
      agent: type,
      requirements: ['test requirement'],
      domain: 'testing'
    },
    constraints: {
      timeLimit: 5000
    },
    dependencies: [],
    expectedOutcome: 'Test execution',
    metadata: {
      test: true
    }
  };
}

// List of all agent classes
const AGENT_CLASSES = [
  // Core QE Agents
  { name: 'RequirementsExplorerAgent', type: 'requirements-explorer' },
  { name: 'RiskOracleAgent', type: 'risk-oracle' },
  { name: 'SecuritySentinelAgent', type: 'security-sentinel' },
  { name: 'PerformanceHunterAgent', type: 'performance-hunter' },
  { name: 'ExploratoryNavigatorAgent', type: 'exploratory-navigator' },

  // Swarm Coordination
  { name: 'AdaptiveCoordinatorAgent', type: 'adaptive-coordinator' },
  { name: 'HierarchicalCoordinatorAgent', type: 'hierarchical-coordinator' },
  { name: 'MeshCoordinatorAgent', type: 'mesh-coordinator' },
  { name: 'CollectiveIntelligenceCoordinatorAgent', type: 'collective-intelligence' },

  // Consensus & Distributed
  { name: 'ByzantineCoordinator', type: 'byzantine-coordinator' },
  { name: 'RaftManager', type: 'raft-manager' },
  { name: 'GossipCoordinator', type: 'gossip-coordinator' },
  { name: 'QuorumManager', type: 'quorum-manager' },
  { name: 'CRDTSynchronizer', type: 'crdt-synchronizer' },

  // SPARC Methodology
  { name: 'SPARCCoordinatorAgent', type: 'sparc-coord' },
  { name: 'SPARCCoderAgent', type: 'sparc-coder' },
  { name: 'SpecificationAgent', type: 'specification' },
  { name: 'PseudocodeAgent', type: 'pseudocode' },
  { name: 'ArchitectureAgent', type: 'architecture' },
  { name: 'RefinementAgent', type: 'refinement' },

  // Testing & Quality
  { name: 'TDDPairProgrammerAgent', type: 'tdd-pair-programmer' },
  { name: 'MutationTestingSwarmAgent', type: 'mutation-testing-swarm' },
  { name: 'FunctionalStatefulAgent', type: 'functional-stateful' },
  { name: 'SpecLinterAgent', type: 'spec-linter' },
  { name: 'QualityStorytellerAgent', type: 'quality-storyteller' },
  { name: 'DesignChallengerAgent', type: 'design-challenger' },
  { name: 'PatternRecognitionSageAgent', type: 'pattern-recognition-sage' },
  { name: 'ResilienceChallengerAgent', type: 'resilience-challenger' },

  // GitHub & Deployment
  { name: 'GitHubModesAgent', type: 'github-modes' },
  { name: 'PRManagerAgent', type: 'pr-manager' },
  { name: 'CodeReviewSwarmAgent', type: 'code-review-swarm' },
  { name: 'IssueTrackerAgent', type: 'issue-tracker' },
  { name: 'ReleaseManagerAgent', type: 'release-manager' },
  { name: 'WorkflowAutomationAgent', type: 'workflow-automation' },
  { name: 'DeploymentGuardianAgent', type: 'deployment-guardian' },
  { name: 'ProductionObserverAgent', type: 'production-observer' },

  // Context & Security
  { name: 'ContextOrchestrator', type: 'context-orchestrator' },
  { name: 'SwarmMemoryManager', type: 'swarm-memory-manager' },
  { name: 'SecurityInjection', type: 'security-injection' }
];

// Test results storage
interface TestResult {
  agent: string;
  success: boolean;
  error?: string;
  initialization: boolean;
  execution: boolean;
  hasDecision: boolean;
  hasConfidence: boolean;
  memoryOperations: number;
  eventsEmitted: number;
}

const testResults: TestResult[] = [];

// Main test function
async function testAllAgents() {
  console.log('🧪 Testing All TypeScript Agents\n');
  console.log(`Total agents to test: ${AGENT_CLASSES.length}\n`);

  for (const agentClass of AGENT_CLASSES) {
    console.log(`\n📍 Testing ${agentClass.name}...`);

    const result: TestResult = {
      agent: agentClass.name,
      success: false,
      initialization: false,
      execution: false,
      hasDecision: false,
      hasConfidence: false,
      memoryOperations: 0,
      eventsEmitted: 0
    };

    try {
      // Create test infrastructure
      const logger = new TestLogger();
      const eventBus = new TestEventBus();
      const memory = new DistributedMemorySystem(logger, eventBus);

      // Create agent ID
      const agentId: AgentId = {
        id: `test-${agentClass.type}`,
        swarmId: 'test-swarm',
        type: agentClass.type as any,
        instance: 1
      };

      // Create configuration
      const config = createTestConfig(agentClass.type);

      // Get agent class
      const AgentClass = (Agents as any)[agentClass.name];

      if (!AgentClass) {
        throw new Error(`Agent class ${agentClass.name} not found in exports`);
      }

      // Create agent instance
      const agent = new AgentClass(agentId, config, logger, eventBus, memory);

      // Test initialization
      await agent.initialize();
      result.initialization = true;
      console.log('  ✅ Initialization successful');

      // Create test task
      const task = createTestTask(agentClass.type);

      // Execute task
      const taskResult = await agent.executeTask(task);
      result.execution = true;
      console.log('  ✅ Task execution successful');

      // Verify result structure
      if (taskResult.decision) {
        result.hasDecision = true;
        console.log('  ✅ Decision generated');
      }

      if (taskResult.confidence !== undefined) {
        result.hasConfidence = true;
        console.log(`  ✅ Confidence: ${(taskResult.confidence * 100).toFixed(0)}%`);
      }

      // Check memory operations
      const memStats = memory.getStatistics();
      result.memoryOperations = memStats.totalEntries;
      if (result.memoryOperations > 0) {
        console.log(`  ✅ Memory operations: ${result.memoryOperations}`);
      }

      // Check events
      result.eventsEmitted = eventBus.events.length;
      if (result.eventsEmitted > 0) {
        console.log(`  ✅ Events emitted: ${result.eventsEmitted}`);
      }

      // Shutdown agent
      await agent.shutdown();

      result.success = true;
      console.log(`  ✅ ${agentClass.name} passed all tests`);

    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error);
      console.log(`  ❌ Error: ${result.error}`);
    }

    testResults.push(result);
  }

  // Generate summary report
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY REPORT');
  console.log('='.repeat(60) + '\n');

  const successful = testResults.filter(r => r.success).length;
  const failed = testResults.filter(r => !r.success).length;

  console.log(`Total Agents Tested: ${testResults.length}`);
  console.log(`✅ Successful: ${successful}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`Success Rate: ${((successful / testResults.length) * 100).toFixed(1)}%\n`);

  // List successful agents
  console.log('✅ Working Agents:');
  testResults
    .filter(r => r.success)
    .forEach(r => {
      console.log(`  • ${r.agent}`);
    });

  // List failed agents with errors
  if (failed > 0) {
    console.log('\n❌ Failed Agents:');
    testResults
      .filter(r => !r.success)
      .forEach(r => {
        console.log(`  • ${r.agent}`);
        if (r.error) {
          console.log(`    Error: ${r.error}`);
        }
      });
  }

  // Statistics
  console.log('\n📈 Agent Capabilities:');
  const withDecisions = testResults.filter(r => r.hasDecision).length;
  const withConfidence = testResults.filter(r => r.hasConfidence).length;
  const withMemory = testResults.filter(r => r.memoryOperations > 0).length;
  const withEvents = testResults.filter(r => r.eventsEmitted > 0).length;

  console.log(`  Decision Making: ${withDecisions}/${testResults.length}`);
  console.log(`  Confidence Scoring: ${withConfidence}/${testResults.length}`);
  console.log(`  Memory Usage: ${withMemory}/${testResults.length}`);
  console.log(`  Event Emission: ${withEvents}/${testResults.length}`);

  // Save detailed report
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      total: testResults.length,
      successful,
      failed,
      successRate: (successful / testResults.length) * 100
    },
    agents: testResults
  };

  fs.writeFileSync(
    path.join(__dirname, 'test-report.json'),
    JSON.stringify(report, null, 2)
  );

  console.log('\n📝 Detailed report saved to: tests/test-report.json');

  // Exit with appropriate code
  if (failed === 0) {
    console.log('\n🎉 All agents are functional!');
    process.exit(0);
  } else {
    console.log(`\n⚠️ ${failed} agents need attention`);
    process.exit(1);
  }
}

// Run tests if this is the main module
if (require.main === module) {
  testAllAgents().catch(error => {
    console.error('Test suite failed:', error);
    process.exit(1);
  });
}

export { testAllAgents, AGENT_CLASSES, TestLogger, TestEventBus };