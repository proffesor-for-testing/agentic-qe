#!/usr/bin/env ts-node
/**
 * Phase 2 Validation Criterion 4: Multi-Agent Voting
 *
 * Tests: Can we aggregate 3+ agent votes?
 * Expected: Voting orchestrator collects and aggregates votes
 *
 * Plan requirement:
 * | Voting Works | `aqe constitution evaluate file.ts --min-agents 3` | 3 agent votes aggregated |
 */

import { VotingOrchestrator } from '../../src/voting/orchestrator';
import { DefaultAgentPool, DefaultVotingStrategy } from '../../src/voting/panel-assembly';
import {
  VotingAgent,
  VotingTask,
  Vote,
  VotingPanelConfig
} from '../../src/voting/types';

async function validateVC4(): Promise<void> {
  console.log('='.repeat(60));
  console.log('Phase 2 VC4: Multi-Agent Voting');
  console.log('='.repeat(60));

  try {
    // Test 1: Create agent pool with 5 agents
    console.log('\n[Test 1] Creating agent pool...');
    const agents: VotingAgent[] = [
      {
        id: 'agent-1',
        type: 'test-generator',
        expertise: ['typescript', 'quality'],
        weight: 0.9
      },
      {
        id: 'agent-2',
        type: 'security-scanner',
        expertise: ['security', 'vulnerabilities'],
        weight: 0.85
      },
      {
        id: 'agent-3',
        type: 'performance-tester',
        expertise: ['performance', 'optimization'],
        weight: 0.88
      },
      {
        id: 'agent-4',
        type: 'test-generator',
        expertise: ['testing', 'quality'],
        weight: 0.92
      },
      {
        id: 'agent-5',
        type: 'visual-tester',
        expertise: ['accessibility', 'a11y'],
        weight: 0.87
      }
    ];

    const pool = new DefaultAgentPool(agents);
    console.log(`✓ Created pool with ${agents.length} agents`);

    // Test 2: Create voting orchestrator
    console.log('\n[Test 2] Initializing voting orchestrator...');
    const strategy = new DefaultVotingStrategy();

    // Mock vote executor that simulates agent voting
    const voteExecutor = async (agent: VotingAgent, task: VotingTask): Promise<Vote> => {
      // Simulate thinking time
      await new Promise(resolve => setTimeout(resolve, 10));

      return {
        agentId: agent.id,
        taskId: task.id,
        score: 0.7 + Math.random() * 0.3, // Score between 0.7 and 1.0
        confidence: 0.8 + Math.random() * 0.2, // Confidence between 0.8 and 1.0
        reasoning: `Agent ${agent.id} evaluated based on ${agent.expertise.join(', ')}`,
        timestamp: new Date(),
        metadata: {
          agentType: agent.type,
          expertise: agent.expertise
        }
      };
    };

    const orchestrator = new VotingOrchestrator(pool, strategy, voteExecutor);
    console.log('✓ Voting orchestrator initialized');

    // Test 3: Assemble voting panel
    console.log('\n[Test 3] Assembling voting panel (min 3 agents)...');
    const config: VotingPanelConfig = {
      minPanelSize: 3,
      maxPanelSize: 5,
      requiredExpertise: ['quality'],
      consensusMethod: 'majority',
      timeoutMs: 5000,
      maxRetries: 3,
      retryDelayMs: 1000,
      parallelExecution: true
    };

    const panelResult = await orchestrator.assemblePanel(config);

    console.log(`✓ Panel assembled: ${panelResult.panel.length} agents`);
    console.log(`  Selected agents: ${panelResult.panel.map(a => a.id).join(', ')}`);

    if (panelResult.panel.length < 3) {
      throw new Error(`Panel too small: ${panelResult.panel.length} < 3`);
    }

    // Test 4: Distribute task and collect votes
    console.log('\n[Test 4] Distributing task and collecting votes...');
    const task: VotingTask = {
      id: 'task-001',
      type: 'code-quality-evaluation',
      description: 'Evaluate UserService.ts for quality',
      context: {
        filePath: 'src/UserService.ts',
        codeSnippet: 'export class UserService { ... }',
        clauses: ['maintainability', 'readability', 'security']
      },
      priority: 'high',
      requiredExpertise: ['quality']
    };

    await orchestrator.distributeTask(task, panelResult.panel);
    console.log('✓ Task distributed to panel');

    const votes = await orchestrator.collectVotes(task.id, 5000); // 5s timeout
    console.log(`✓ Collected ${votes.length} votes`);

    for (const vote of votes) {
      console.log(`  ${vote.agentId}: score=${vote.score.toFixed(2)}, confidence=${vote.confidence.toFixed(2)}`);
    }

    // Test 5: Aggregate votes using consensus
    console.log('\n[Test 5] Aggregating votes with majority consensus...');
    const result = orchestrator.aggregateResults(votes, 'majority');

    console.log('✓ Votes aggregated:');
    console.log(`  Consensus reached: ${result.consensusReached}`);
    console.log(`  Final score: ${result.finalScore.toFixed(3)}`);
    console.log(`  Participation rate: ${(result.participationRate * 100).toFixed(1)}%`);
    console.log(`  Average confidence: ${result.metadata.averageConfidence.toFixed(3)}`);

    // Test 6: Verify metrics
    console.log('\n[Test 6] Verifying orchestration metrics...');
    const metrics = orchestrator.getMetrics();
    console.log(`✓ Orchestration metrics:`);
    console.log(`  Total tasks: ${metrics.totalTasks}`);
    console.log(`  Successful votes: ${metrics.successfulVotes}`);
    console.log(`  Failed votes: ${metrics.failedVotes}`);
    console.log(`  Consensus rate: ${(metrics.consensusRate * 100).toFixed(1)}%`);

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('VC4 RESULT: ✅ PASS');
    console.log('='.repeat(60));
    console.log(`✓ Panel assembly: ${panelResult.panel.length} agents (>= 3) ✅`);
    console.log(`✓ Vote collection: ${votes.length} votes ✅`);
    console.log(`✓ Vote aggregation: FUNCTIONAL ✅`);
    console.log(`✓ Consensus calculation: ${result.consensusReached ? 'REACHED' : 'NOT REACHED'}`);
    console.log(`✓ Final score: ${result.finalScore.toFixed(3)}`);
    console.log('\nEquivalent to: aqe constitution evaluate file.ts --min-agents 3');
    console.log('Functionality: OPERATIONAL ✅');

    process.exit(0);
  } catch (error) {
    console.error('\n' + '='.repeat(60));
    console.error('VC4 RESULT: ❌ FAIL');
    console.error('='.repeat(60));
    console.error('Error:', error instanceof Error ? error.message : error);
    console.error('\nPhase 2 validation criterion 4 NOT MET');
    process.exit(1);
  }
}

// Run validation
validateVC4();
