#!/usr/bin/env node
/**
 * Basic QX Partner Agent Example
 * 
 * This example demonstrates how to perform a basic full QX analysis
 * on a website, combining QA and UX perspectives.
 * 
 * Usage: npx ts-node examples/qx-partner/basic-analysis.ts [url]
 */

import { QEAgentFactory } from '../../src/agents';
import { QEAgentType } from '../../src/types';
import { QXTaskType } from '../../src/types/qx';
import { EventEmitter } from 'events';

async function main() {
  const targetUrl = process.argv[2] || 'https://www.saucedemo.com';

  console.log('🔍 QX Partner Agent - Basic Analysis');
  console.log('=====================================\n');
  console.log(`Target: ${targetUrl}\n`);

  // Create memory store
  const memoryStore = new Map();

  // Create event bus
  const eventBus = new EventEmitter();

  // Create QX Partner Agent
  const agent = QEAgentFactory.createAgent(QEAgentType.QX_PARTNER, {
    analysisMode: 'full',
    integrateTestability: true,
    detectOracleProblems: true,
    heuristics: {
      enabledHeuristics: [], // Empty = all heuristics
      minConfidence: 0.7
    },
    context: {
      workspaceRoot: process.cwd(),
      project: 'basic-qx-analysis',
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
      id: 'basic-qx-analysis',
      assignee: agent.getAgentId(),
      task: {
        type: 'qx-task',
        payload: {
          type: QXTaskType.FULL_ANALYSIS,
          target: targetUrl,
          params: {
            context: {
              feature: 'Overall website quality experience',
              userRole: 'end-user',
              businessGoal: 'conversion'
            }
          }
        }
      }
    };

    // Execute analysis
    console.log('🔬 Performing full QX analysis...\n');
    const result = await agent.executeTask(task);

    // Display results
    console.log('📊 ANALYSIS RESULTS');
    console.log('==================\n');

    // Overall Score
    console.log(`Overall QX Score: ${result.overallScore}/100 (Grade: ${result.grade})`);
    console.log(`Analysis Date: ${new Date(result.timestamp).toLocaleString()}\n`);

    // Problem Analysis
    console.log('📋 Problem Understanding:');
    console.log(`  Problem Definition: ${result.problemAnalysis.problemDefinition}`);
    console.log(`  Clarity Score: ${result.problemAnalysis.clarityScore}/100`);
    if (result.problemAnalysis.failureModes.length > 0) {
      console.log(`  Potential Failure Modes:`);
      result.problemAnalysis.failureModes.forEach((mode, idx) => {
        console.log(`    ${idx + 1}. ${mode}`);
      });
    }
    console.log();

    // User Needs
    console.log('👤 User Needs Analysis:');
    console.log(`  Alignment Score: ${result.userNeeds.alignmentScore}/100`);
    console.log(`  Must-Have Features: ${result.userNeeds.mustHave.length}`);
    console.log(`  Should-Have Features: ${result.userNeeds.shouldHave.length}`);
    console.log(`  Nice-to-Have Features: ${result.userNeeds.niceToHave.length}`);
    console.log();

    // Business Needs
    console.log('💼 Business Needs Analysis:');
    console.log(`  Alignment Score: ${result.businessNeeds.alignmentScore}/100`);
    console.log(`  Primary Goal: ${result.businessNeeds.primaryGoal}`);
    console.log(`  KPI Impact: ${result.businessNeeds.kpiImpact}`);
    console.log();

    // Oracle Problems
    if (result.oracleProblems && result.oracleProblems.length > 0) {
      console.log('⚠️  Oracle Problems Detected:');
      result.oracleProblems.forEach((problem, idx) => {
        console.log(`  ${idx + 1}. [${problem.severity.toUpperCase()}] ${problem.type}`);
        console.log(`     ${problem.description}`);
        console.log(`     Resolution: ${problem.resolutionApproach}`);
      });
      console.log();
    }

    // Impact Analysis
    console.log('📈 Impact Analysis:');
    console.log(`  Overall Impact Score: ${result.impactAnalysis.overallImpactScore}/100`);
    console.log(`  Visible Impact Score: ${result.impactAnalysis.visible.score}/100`);
    console.log(`  Invisible Impact Score: ${result.impactAnalysis.invisible.score}/100`);
    console.log(`  Immutable Requirements: ${result.impactAnalysis.immutableRequirements.length}`);
    console.log();

    // Heuristics Summary
    if (result.heuristicsApplied && result.heuristicsApplied.length > 0) {
      console.log('🎯 Heuristics Applied:');
      const avgScore = result.heuristicsApplied.reduce((sum, h) => sum + h.score, 0) / result.heuristicsApplied.length;
      console.log(`  Total Heuristics: ${result.heuristicsApplied.length}`);
      console.log(`  Average Score: ${avgScore.toFixed(1)}/100`);
      
      // Show top 3 and bottom 3
      const sorted = [...result.heuristicsApplied].sort((a, b) => b.score - a.score);
      console.log(`  Top 3 Performing:`);
      sorted.slice(0, 3).forEach((h, idx) => {
        console.log(`    ${idx + 1}. ${h.name}: ${h.score}/100`);
      });
      console.log(`  Bottom 3 Performing:`);
      sorted.slice(-3).reverse().forEach((h, idx) => {
        console.log(`    ${idx + 1}. ${h.name}: ${h.score}/100`);
      });
      console.log();
    }

    // Testability Integration
    if (result.testabilityIntegration) {
      console.log('🔬 Testability Integration:');
      console.log(`  Overall Testability Score: ${result.testabilityIntegration.overallTestabilityScore}/100`);
      console.log(`  QX-Testability Relation: ${result.testabilityIntegration.qxRelation}`);
      if (result.testabilityIntegration.combinedInsights.length > 0) {
        console.log(`  Combined Insights:`);
        result.testabilityIntegration.combinedInsights.slice(0, 3).forEach((insight, idx) => {
          console.log(`    ${idx + 1}. ${insight}`);
        });
      }
      console.log();
    }

    // Recommendations
    if (result.recommendations.length > 0) {
      console.log('💡 TOP RECOMMENDATIONS:');
      console.log('=======================\n');
      
      result.recommendations.slice(0, 5).forEach((rec, idx) => {
        console.log(`${idx + 1}. [${rec.severity.toUpperCase()}] ${rec.principle}`);
        console.log(`   ${rec.recommendation}`);
        console.log(`   Category: ${rec.category} | Impact: ${rec.impact} | Effort: ${rec.effort}`);
        console.log(`   Priority Score: ${rec.priority}`);
        if (rec.evidence.length > 0) {
          console.log(`   Evidence: ${rec.evidence[0]}`);
        }
        console.log();
      });
    }

    console.log('✅ Analysis complete!');
    console.log(`   Total recommendations: ${result.recommendations.length}`);

  } catch (error) {
    console.error('❌ Error during analysis:', error);
    process.exit(1);
  } finally {
    // Cleanup
    console.log('\n🧹 Cleaning up...');
    await agent.terminate();
    console.log('✅ Agent terminated');
  }
}

main().catch(console.error);
