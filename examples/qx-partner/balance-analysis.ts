#!/usr/bin/env node
/**
 * User vs Business Balance Analysis Example
 * 
 * This example demonstrates how to analyze the balance between
 * user needs and business needs in a feature or system.
 * 
 * Usage: npx ts-node examples/qx-partner/balance-analysis.ts [url]
 */

import { QEAgentFactory } from '../../src/agents';
import { QEAgentType } from '../../src/types';
import { QXTaskType } from '../../src/types/qx';
import { EventEmitter } from 'events';

async function main() {
  const targetUrl = process.argv[2] || 'https://www.saucedemo.com';

  console.log('⚖️  QX Partner Agent - User vs Business Balance Analysis');
  console.log('=======================================================\n');
  console.log(`Target: ${targetUrl}\n`);

  // Create memory store
  const memoryStore = new Map();

  // Create event bus
  const eventBus = new EventEmitter();

  // Create QX Partner Agent
  const agent = QEAgentFactory.createAgent(QEAgentType.QX_PARTNER, {
    analysisMode: 'full',
    integrateTestability: false,
    detectOracleProblems: false,
    heuristics: {
      enabledHeuristics: [],
      minConfidence: 0.7
    },
    context: {
      workspaceRoot: process.cwd(),
      project: 'balance-analysis',
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
      id: 'balance-analysis',
      assignee: agent.getAgentId(),
      task: {
        type: 'qx-task',
        payload: {
          type: QXTaskType.BALANCE_ANALYSIS,
          target: targetUrl,
          params: {
            context: {
              feature: 'E-commerce checkout process',
              userRole: 'customer',
              businessGoal: 'maximize-conversion'
            }
          }
        }
      }
    };

    // Execute analysis
    console.log('🔬 Analyzing user vs business balance...\n');
    const result = await agent.executeTask(task);

    // Display results
    console.log('📊 BALANCE ANALYSIS RESULTS');
    console.log('===========================\n');

    // Overall Balance Status
    const statusEmoji = result.balance.isBalanced ? '✅' : '⚠️';
    console.log(`${statusEmoji} Balance Status: ${result.balance.isBalanced ? 'BALANCED' : 'IMBALANCED'}\n`);

    // User Needs
    console.log('👤 USER NEEDS ANALYSIS:');
    console.log('======================\n');
    console.log(`Alignment Score: ${result.userNeeds.alignmentScore}/100\n`);

    console.log('Must-Have Features:');
    result.userNeeds.mustHave.forEach((feature, idx) => {
      console.log(`  ${idx + 1}. ${feature}`);
    });
    console.log();

    if (result.userNeeds.shouldHave.length > 0) {
      console.log('Should-Have Features:');
      result.userNeeds.shouldHave.forEach((feature, idx) => {
        console.log(`  ${idx + 1}. ${feature}`);
      });
      console.log();
    }

    if (result.userNeeds.niceToHave.length > 0) {
      console.log('Nice-to-Have Features:');
      result.userNeeds.niceToHave.slice(0, 3).forEach((feature, idx) => {
        console.log(`  ${idx + 1}. ${feature}`);
      });
      if (result.userNeeds.niceToHave.length > 3) {
        console.log(`  ... and ${result.userNeeds.niceToHave.length - 3} more`);
      }
      console.log();
    }

    // Business Needs
    console.log('💼 BUSINESS NEEDS ANALYSIS:');
    console.log('==========================\n');
    console.log(`Alignment Score: ${result.businessNeeds.alignmentScore}/100\n`);
    console.log(`Primary Goal: ${result.businessNeeds.primaryGoal}`);
    console.log(`KPI Impact: ${result.businessNeeds.kpiImpact}`);
    console.log();

    if (result.businessNeeds.requirements.length > 0) {
      console.log('Business Requirements:');
      result.businessNeeds.requirements.forEach((req, idx) => {
        console.log(`  ${idx + 1}. ${req}`);
      });
      console.log();
    }

    if (result.businessNeeds.crossTeamImpact.length > 0) {
      console.log('Cross-Team Impact:');
      result.businessNeeds.crossTeamImpact.forEach((impact, idx) => {
        console.log(`  ${idx + 1}. ${impact}`);
      });
      console.log();
    }

    // Balance Details
    console.log('⚖️  BALANCE DETAILS:');
    console.log('==================\n');

    const userScore = result.userNeeds.alignmentScore;
    const businessScore = result.businessNeeds.alignmentScore;
    const gap = Math.abs(userScore - businessScore);

    console.log(`User Alignment:     ${userScore}/100`);
    console.log(`Business Alignment: ${businessScore}/100`);
    console.log(`Gap:                ${gap} points\n`);

    if (result.balance.favorsUser) {
      console.log('📊 Analysis: Currently FAVORING USER NEEDS');
      console.log(`   User needs are ${gap} points higher than business needs.`);
      console.log(`   This may indicate excellent UX but potential business concerns.\n`);
    } else if (result.balance.favorsBusiness) {
      console.log('📊 Analysis: Currently FAVORING BUSINESS NEEDS');
      console.log(`   Business needs are ${gap} points higher than user needs.`);
      console.log(`   This may indicate strong business alignment but potential UX issues.\n`);
    } else {
      console.log('📊 Analysis: WELL BALANCED');
      console.log(`   User and business needs are closely aligned (gap: ${gap} points).\n`);
    }

    // Recommendation
    console.log('💡 RECOMMENDATION:');
    console.log('=================\n');
    console.log(result.balance.recommendation);
    console.log();

    // Action Items
    console.log('🎯 SUGGESTED ACTION ITEMS:');
    console.log('=========================\n');

    if (!result.balance.isBalanced) {
      if (result.balance.favorsUser) {
        console.log('1. Review business requirements and ensure they are adequately addressed');
        console.log('2. Identify opportunities to better align user experience with business goals');
        console.log('3. Consult with product and business stakeholders');
        console.log('4. Consider A/B testing to validate business impact');
      } else if (result.balance.favorsBusiness) {
        console.log('1. Conduct user research to better understand user needs');
        console.log('2. Review UX heuristics to identify usability improvements');
        console.log('3. Consider usability testing with real users');
        console.log('4. Balance conversion optimization with user satisfaction');
      }
    } else {
      console.log('1. Continue monitoring both user and business metrics');
      console.log('2. Maintain the current balance during future changes');
      console.log('3. Use this as a baseline for future feature development');
      console.log('4. Share this success pattern with other teams');
    }
    console.log();

    // Next Steps
    console.log('🚀 NEXT STEPS:');
    console.log('=============\n');
    console.log('1. Run full QX analysis for detailed recommendations');
    console.log('2. Perform testability assessment to ensure quality');
    console.log('3. Collaborate with UX team for user experience improvements');
    console.log('4. Work with QA team to validate business requirements');
    console.log('5. Monitor KPIs after implementing any changes\n');

  } catch (error) {
    console.error('❌ Error during analysis:', error);
    process.exit(1);
  } finally {
    // Cleanup
    console.log('🧹 Cleaning up...');
    await agent.terminate();
    console.log('✅ Agent terminated');
  }
}

main().catch(console.error);
