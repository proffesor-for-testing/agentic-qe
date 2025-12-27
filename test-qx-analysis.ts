#!/usr/bin/env node
/**
 * QX Partner Agent - Website Analysis Script (TypeScript)
 * Performs Quality Experience (QX) analysis on any website
 */

import { QXPartnerAgent } from './src/agents/QXPartnerAgent';
import { QEAgentType } from './src/types';
import { QXTaskType } from './src/types/qx';
import { EventEmitter } from 'events';

async function main() {
  const targetUrl = process.argv[2];

  if (!targetUrl) {
    console.error('❌ Error: URL is required\n');
    console.log('Usage: npx ts-node test-qx-analysis.ts <URL>\n');
    console.log('Example: npx ts-node test-qx-analysis.ts https://example.com');
    process.exit(1);
  }

  console.log('🔍 QX Partner Agent Analysis');
  console.log('============================\n');
  console.log(`Target: ${targetUrl}\n`);

  // Simple in-memory store
  const memoryStore = {
    data: new Map(),
    get: async (key: string) => memoryStore.data.get(key),
    set: async (key: string, value: unknown) => { memoryStore.data.set(key, value); },
    has: async (key: string) => memoryStore.data.has(key),
    delete: async (key: string) => memoryStore.data.delete(key),
    keys: async () => Array.from(memoryStore.data.keys()),
    clear: async () => { memoryStore.data.clear(); }
  };

  const eventBus = new EventEmitter();

  // Create agent directly
  const agent = new QXPartnerAgent({
    analysisMode: 'full',
    integrateTestability: true,
    detectOracleProblems: true,
    heuristics: {
      enabledHeuristics: [],
      minConfidence: 0.7
    },
    context: {
      workspaceRoot: process.cwd(),
      project: 'qx-analysis',
      environment: 'development'
    },
    memoryStore,
    eventBus
  });

  try {
    console.log('⚙️  Initializing agent...');
    await agent.initialize();
    console.log('✅ Agent initialized\n');

    const task = {
      id: 'qx-analysis-' + Date.now(),
      assignee: agent.getAgentId(),
      task: {
        type: 'qx-task',
        payload: {
          type: QXTaskType.FULL_ANALYSIS,
          target: targetUrl,
          params: {
            context: {
              feature: 'Website quality experience analysis',
              userRole: 'end-user',
              businessGoal: 'optimal-experience'
            }
          }
        }
      }
    };

    console.log('🔬 Analyzing...\n');
    const result = await agent.executeTask(task);

    // Display results
    console.log('📊 RESULTS');
    console.log('=========\n');
    console.log(`Overall QX Score: ${result.overallScore}/100 (${result.grade})`);
    console.log(`Timestamp: ${new Date(result.timestamp).toLocaleString()}\n`);

    console.log('📋 Problem Analysis:');
    console.log(`   Clarity: ${result.problemAnalysis.clarityScore}/100`);
    console.log(`   Definition: ${result.problemAnalysis.problemDefinition}\n`);

    console.log('👤 User Needs:');
    console.log(`   Alignment: ${result.userNeeds.alignmentScore}/100`);
    console.log(`   Must-Have: ${result.userNeeds.mustHave.length}`);
    console.log(`   Should-Have: ${result.userNeeds.shouldHave.length}\n`);

    console.log('💼 Business Needs:');
    console.log(`   Alignment: ${result.businessNeeds.alignmentScore}/100`);
    console.log(`   Goal: ${result.businessNeeds.primaryGoal}\n`);

    if (result.oracleProblems && result.oracleProblems.length > 0) {
      console.log(`⚠️  Oracle Problems: ${result.oracleProblems.length}`);
      result.oracleProblems.slice(0, 3).forEach((p, i) => {
        console.log(`   ${i + 1}. [${p.severity}] ${p.type}: ${p.description}`);
      });
      console.log();
    }

    console.log('📈 Impact:');
    console.log(`   Overall: ${result.impactAnalysis.overallImpactScore}/100`);
    console.log(`   Visible: ${result.impactAnalysis.visible.score}/100`);
    console.log(`   Invisible: ${result.impactAnalysis.invisible.score}/100\n`);

    if (result.heuristicsApplied && result.heuristicsApplied.length > 0) {
      const avg = result.heuristicsApplied.reduce((sum, h) => sum + h.score, 0) / result.heuristicsApplied.length;
      console.log(`🎯 Heuristics: ${result.heuristicsApplied.length} applied (avg: ${avg.toFixed(1)})\n`);
    }

    if (result.testabilityIntegration) {
      console.log('🔬 Testability:');
      console.log(`   Score: ${result.testabilityIntegration.overallTestabilityScore}/100`);
      console.log(`   Relation: ${result.testabilityIntegration.qxRelation}\n`);
    }

    console.log(`💡 Recommendations: ${result.recommendations.length} total\n`);
    if (result.recommendations.length > 0) {
      console.log('Top 5 Recommendations:');
      result.recommendations.slice(0, 5).forEach((rec, i) => {
        console.log(`${i + 1}. [${rec.severity}] ${rec.principle}`);
        console.log(`   ${rec.recommendation}`);
        console.log(`   Impact: ${rec.impact} | Effort: ${rec.effort} | Priority: ${rec.priority}\n`);
      });
    }

    console.log('✅ Analysis complete!');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await agent.terminate();
  }
}

main().catch(console.error);
