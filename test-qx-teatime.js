#!/usr/bin/env node
/**
 * QX Analysis of teatimewithtesters.com
 * Running via compiled JavaScript to avoid TS issues
 */

const { QXPartnerAgent } = require('./dist/agents/QXPartnerAgent');
const { QEAgentType } = require('./dist/types');
const { QXTaskType } = require('./dist/types/qx');
const { EventEmitter } = require('events');

async function main() {
  const targetUrl = process.argv[2] || 'https://teatimewithtesters.com/';

  console.log('🔍 QX Partner Agent Analysis');
  console.log('============================\n');
  console.log(`Target: ${targetUrl}\n`);

  // Simple memory store
  const memoryStore = {
    data: new Map(),
    get: async (key) => memoryStore.data.get(key),
    set: async (key, value) => { memoryStore.data.set(key, value); },
    has: async (key) => memoryStore.data.has(key),
    delete: async (key) => memoryStore.data.delete(key),
    keys: async () => Array.from(memoryStore.data.keys()),
    clear: async () => { memoryStore.data.clear(); },
    store: async (key, value) => { memoryStore.data.set(key, value); },
    retrieve: async (key) => memoryStore.data.get(key)
  };

  const eventBus = new EventEmitter();

  try {
    // Create agent
    const agent = new QXPartnerAgent({
      analysisMode: 'full',
      integrateTestability: true,
      detectOracleProblems: true,
      heuristics: {
        enabledHeuristics: [],
        minConfidence: 0.7
      },
      context: {
        project: 'teatime-analysis'
      },
      memoryStore,
      eventBus
    });

    console.log('⚙️  Initializing...');
    await agent.initialize();
    console.log('✅ Initialized\n');

    // Get agent ID
    const agentId = agent.id || 'qx-agent-' + Date.now();

    // Create task
    const task = {
      id: 'teatime-analysis',
      agentId,
      assignee: agentId,
      assignedAt: Date.now(),
      status: 'pending',
      task: {
        type: 'qx-task',
        payload: {
          type: QXTaskType.FULL_ANALYSIS,
          target: targetUrl,
          params: {
            context: {
              feature: 'Testing community website',
              userRole: 'tester',
              businessGoal: 'engagement'
            }
          }
        }
      }
    };

    console.log('🔬 Analyzing...\n');
    const result = await agent.executeTask(task);

    // Display results
    console.log('\n📊 QX ANALYSIS RESULTS');
    console.log('======================\n');
    
    console.log(`Overall QX Score: ${result.overallScore}/100 (Grade: ${result.grade})`);
    console.log(`Analysis Date: ${new Date(result.timestamp).toLocaleString()}\n`);

    console.log('📋 Problem Understanding:');
    console.log(`   Clarity Score: ${result.problemAnalysis.clarityScore}/100`);
    console.log(`   Definition: ${result.problemAnalysis.problemDefinition || 'N/A'}`);
    if (result.problemAnalysis.failureModes && result.problemAnalysis.failureModes.length > 0) {
      console.log(`   Failure Modes:`);
      result.problemAnalysis.failureModes.forEach((mode, i) => {
        console.log(`     ${i + 1}. ${mode}`);
      });
    }
    console.log();

    console.log('👤 User Needs:');
    console.log(`   Alignment Score: ${result.userNeeds.alignmentScore}/100`);
    console.log(`   Must-Have: ${result.userNeeds.mustHave?.length || 0} features`);
    console.log(`   Should-Have: ${result.userNeeds.shouldHave?.length || 0} features`);
    console.log(`   Nice-to-Have: ${result.userNeeds.niceToHave?.length || 0} features`);
    console.log();

    console.log('💼 Business Needs:');
    console.log(`   Alignment Score: ${result.businessNeeds.alignmentScore}/100`);
    console.log(`   Primary Goal: ${result.businessNeeds.primaryGoal}`);
    console.log(`   KPI Impact: ${result.businessNeeds.kpiImpact}`);
    console.log();

    if (result.oracleProblems && result.oracleProblems.length > 0) {
      console.log(`⚠️  Oracle Problems Detected: ${result.oracleProblems.length}`);
      result.oracleProblems.slice(0, 3).forEach((problem, i) => {
        console.log(`   ${i + 1}. [${problem.severity.toUpperCase()}] ${problem.type}`);
        console.log(`      ${problem.description}`);
      });
      console.log();
    }

    console.log('📈 Impact Analysis:');
    console.log(`   Overall Impact: ${result.impactAnalysis.overallImpactScore}/100`);
    console.log(`   Visible Impact: ${result.impactAnalysis.visible.score}/100`);
    console.log(`   Invisible Impact: ${result.impactAnalysis.invisible.score}/100`);
    console.log(`   Immutable Requirements: ${result.impactAnalysis.immutableRequirements?.length || 0}`);
    console.log();

    if (result.heuristicsApplied && result.heuristicsApplied.length > 0) {
      const avgScore = result.heuristicsApplied.reduce((sum, h) => sum + h.score, 0) / result.heuristicsApplied.length;
      console.log(`🎯 UX Heuristics Applied: ${result.heuristicsApplied.length}`);
      console.log(`   Average Score: ${avgScore.toFixed(1)}/100`);
      
      const sorted = [...result.heuristicsApplied].sort((a, b) => b.score - a.score);
      console.log(`   Top 3:`);
      sorted.slice(0, 3).forEach((h, i) => {
        console.log(`     ${i + 1}. ${h.name}: ${h.score}/100`);
      });
      console.log(`   Bottom 3:`);
      sorted.slice(-3).reverse().forEach((h, i) => {
        console.log(`     ${i + 1}. ${h.name}: ${h.score}/100`);
      });
      console.log();
    }

    if (result.testabilityIntegration) {
      console.log('🔬 Testability Integration:');
      console.log(`   Overall Score: ${result.testabilityIntegration.overallTestabilityScore}/100`);
      console.log(`   QX Relation: ${result.testabilityIntegration.qxRelation}`);
      if (result.testabilityIntegration.combinedInsights && result.testabilityIntegration.combinedInsights.length > 0) {
        console.log(`   Key Insights:`);
        result.testabilityIntegration.combinedInsights.slice(0, 3).forEach((insight, i) => {
          console.log(`     ${i + 1}. ${insight}`);
        });
      }
      console.log();
    }

    console.log(`💡 RECOMMENDATIONS: ${result.recommendations?.length || 0} total\n`);
    if (result.recommendations && result.recommendations.length > 0) {
      console.log('Top 5 Recommendations:\n');
      result.recommendations.slice(0, 5).forEach((rec, i) => {
        console.log(`${i + 1}. [${rec.severity.toUpperCase()}] ${rec.principle}`);
        console.log(`   ${rec.recommendation}`);
        console.log(`   Category: ${rec.category} | Impact: ${rec.impact} | Effort: ${rec.effort}`);
        console.log(`   Priority: ${rec.priority}`);
        if (rec.evidence && rec.evidence.length > 0) {
          console.log(`   Evidence: ${rec.evidence[0]}`);
        }
        console.log();
      });
    }

    console.log('✅ Analysis Complete!\n');
    
    console.log('📝 Summary:');
    console.log(`   - Overall QX Score: ${result.overallScore}/100 (${result.grade})`);
    console.log(`   - Oracle Problems: ${result.oracleProblems?.length || 0}`);
    console.log(`   - Recommendations: ${result.recommendations?.length || 0}`);
    console.log(`   - Heuristics Applied: ${result.heuristicsApplied?.length || 0}`);

  } catch (error) {
    console.error('\n❌ Error during analysis:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
