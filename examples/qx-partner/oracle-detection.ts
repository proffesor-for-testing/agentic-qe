#!/usr/bin/env node
/**
 * Oracle Problem Detection Example
 * 
 * This example demonstrates how to detect oracle problems
 * (unclear quality criteria) in a system or feature.
 * 
 * Usage: npx ts-node examples/qx-partner/oracle-detection.ts [url]
 */

import { QEAgentFactory } from '../../src/agents';
import { QEAgentType } from '../../src/types';
import { QXTaskType } from '../../src/types/qx';
import { EventEmitter } from 'events';

async function main() {
  const targetUrl = process.argv[2] || 'https://www.saucedemo.com';

  console.log('🔍 QX Partner Agent - Oracle Problem Detection');
  console.log('===============================================\n');
  console.log(`Target: ${targetUrl}\n`);

  // Create memory store
  const memoryStore = new Map();

  // Create event bus
  const eventBus = new EventEmitter();

  // Create QX Partner Agent with oracle detection focus
  const agent = QEAgentFactory.createAgent(QEAgentType.QX_PARTNER, {
    analysisMode: 'quick',
    integrateTestability: false,
    detectOracleProblems: true,
    minOracleSeverity: 'medium', // Only report medium and above
    heuristics: {
      enabledHeuristics: [], // We're focused on oracle detection
      minConfidence: 0.7
    },
    context: {
      workspaceRoot: process.cwd(),
      project: 'oracle-detection',
      environment: 'development'
    },
    memoryStore,
    eventBus
  });

  try {
    // Initialize agent
    console.log('⚙️  Initializing QX Partner Agent...');
    await agent.initialize();
    console.log('✅ Agent initialized\n');

    // Create task
    const task = {
      id: 'oracle-detection',
      assignee: agent.getAgentId(),
      task: {
        type: 'qx-task',
        payload: {
          type: QXTaskType.ORACLE_DETECTION,
          target: targetUrl,
          params: {
            context: {
              feature: 'Login flow',
              userRole: 'end-user',
              stakeholders: ['users', 'support-team', 'security-team']
            }
          }
        }
      }
    };

    // Execute detection
    console.log('🔬 Detecting oracle problems...\n');
    const oracleProblems = await agent.executeTask(task);

    // Display results
    console.log('📊 ORACLE PROBLEMS DETECTED');
    console.log('===========================\n');

    if (oracleProblems.length === 0) {
      console.log('✅ No significant oracle problems detected!');
      console.log('   Quality criteria appear to be well-defined.\n');
    } else {
      console.log(`Found ${oracleProblems.length} oracle problem(s):\n`);

      // Group by severity
      const critical = oracleProblems.filter(p => p.severity === 'critical');
      const high = oracleProblems.filter(p => p.severity === 'high');
      const medium = oracleProblems.filter(p => p.severity === 'medium');
      const low = oracleProblems.filter(p => p.severity === 'low');

      // Display critical problems first
      if (critical.length > 0) {
        console.log('🚨 CRITICAL PROBLEMS:');
        console.log('===================\n');
        critical.forEach((problem, idx) => {
          displayProblem(problem, idx + 1);
        });
      }

      // Display high severity problems
      if (high.length > 0) {
        console.log('⚠️  HIGH SEVERITY PROBLEMS:');
        console.log('=========================\n');
        high.forEach((problem, idx) => {
          displayProblem(problem, idx + 1);
        });
      }

      // Display medium severity problems
      if (medium.length > 0) {
        console.log('⚡ MEDIUM SEVERITY PROBLEMS:');
        console.log('==========================\n');
        medium.forEach((problem, idx) => {
          displayProblem(problem, idx + 1);
        });
      }

      // Display low severity problems
      if (low.length > 0) {
        console.log('ℹ️  LOW SEVERITY PROBLEMS:');
        console.log('========================\n');
        low.forEach((problem, idx) => {
          displayProblem(problem, idx + 1);
        });
      }

      // Summary
      console.log('\n📊 SUMMARY');
      console.log('=========\n');
      console.log(`Total Problems: ${oracleProblems.length}`);
      console.log(`  Critical: ${critical.length}`);
      console.log(`  High:     ${high.length}`);
      console.log(`  Medium:   ${medium.length}`);
      console.log(`  Low:      ${low.length}\n`);

      // Recommendations
      console.log('💡 NEXT STEPS:');
      console.log('=============\n');
      if (critical.length > 0 || high.length > 0) {
        console.log('1. Address critical and high severity problems immediately');
        console.log('2. Clarify quality criteria with stakeholders');
        console.log('3. Document acceptance criteria explicitly');
      }
      console.log('4. Run full QX analysis for comprehensive recommendations');
      console.log('5. Collaborate with UX and QA agents for deeper insights\n');
    }

  } catch (error) {
    console.error('❌ Error during detection:', error);
    process.exit(1);
  } finally {
    // Cleanup
    console.log('🧹 Cleaning up...');
    await agent.terminate();
    console.log('✅ Agent terminated');
  }
}

function displayProblem(problem: any, index: number) {
  console.log(`${index}. ${problem.type.toUpperCase().replace(/-/g, ' ')}`);
  console.log(`   Severity: ${problem.severity.toUpperCase()}`);
  console.log(`   Description: ${problem.description}`);
  console.log(`   Impact: ${problem.impact}`);
  console.log(`   Affected Stakeholders: ${problem.affectedStakeholders.join(', ')}`);
  console.log(`   Resolution Approach: ${problem.resolutionApproach}`);
  if (problem.examples.length > 0) {
    console.log(`   Examples:`);
    problem.examples.forEach((ex: string) => {
      console.log(`     - ${ex}`);
    });
  }
  console.log();
}

main().catch(console.error);
