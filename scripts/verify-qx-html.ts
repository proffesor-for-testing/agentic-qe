#!/usr/bin/env ts-node
/**
 * Quick verification script for QX HTML report generation
 * Tests that the HTML report includes the QX framework attribution
 */

import { QXPartnerAgent } from '../src/agents/QXPartnerAgent';
import { QEAgentType } from '../src/types';
import { EventBus } from '../src/core/EventBus';
import { SwarmMemoryManager } from '../src/core/memory/SwarmMemoryManager';

async function verify() {
  console.log('🔍 Verifying QX HTML Report Generation...\n');

  // Create required dependencies
  const eventBus = new EventBus();
  const memoryStore = new SwarmMemoryManager(':memory:');
  await memoryStore.initialize();

  // Create QX Partner Agent
  const agent = new QXPartnerAgent({
    capabilities: [],
    context: {
      id: 'verify-test',
      type: 'qx-partner',
      status: 'active' as any
    },
    memoryStore: memoryStore as any,
    eventBus,
    enableLearning: false
  });

  await agent.initialize();

  // Create a simple mock analysis to test HTML generation
  const mockAnalysis = {
    targetName: 'Test Website',
    targetUrl: 'https://example.com',
    timestamp: new Date().toISOString(),
    overallScore: 85,
    sixThinkingHats: {
      whiteFacts: { facts: ['Test fact 1'], dataGaps: [] },
      redFeelings: { emotions: [], concerns: [] },
      blackCritical: { risks: [], challenges: [] },
      yellowPositive: { strengths: [], opportunities: [] },
      greenCreative: { ideas: [], innovations: [] },
      blueMeta: { processInsights: [], improvements: [] }
    },
    impactAnalysis: {
      visible: {
        guiFlow: {
          forEndUser: ['Simple navigation'],
          forInternalUser: []
        },
        userFeelings: [
          { feeling: 'satisfied' as any, context: 'Easy to use', likelihood: 'high' as any }
        ]
      },
      invisible: {
        userFeelings: []
      },
      immutableRequirements: [],
      overallImpactScore: 80
    },
    heuristicAnalysis: {
      heuristics: [
        {
          name: 'H001-Usability',
          score: 85,
          observations: ['Good usability'],
          recommendations: ['Keep it simple']
        }
      ],
      overallScore: 85
    },
    synthesisRecommendations: {
      immediate: ['Fix issue A'],
      shortTerm: ['Improve feature B'],
      longTerm: ['Consider redesign'],
      overall: 'Good quality product'
    }
  };

  // Generate HTML report (this should include the attribution)
  const reportPath = await (agent as any).generateHTMLReport(mockAnalysis);

  console.log(`✅ HTML report generated: ${reportPath}`);

  // Read the generated HTML to verify attribution exists
  const fs = require('fs');
  const htmlContent = fs.readFileSync(reportPath, 'utf-8');

  // Check for key attribution elements
  const checks = [
    { name: 'QX Framework mention', pattern: /QX framework/i },
    { name: 'Quality Advocacy mention', pattern: /Quality Advocacy/i },
    { name: 'Lalitkumar Bhamare mention', pattern: /Lalitkumar Bhamare/i },
    { name: 'QCSD link', pattern: /https:\/\/talesoftesting\.com\/qcsd\//i },
    { name: 'User feelings rendering', pattern: /satisfied.*Easy to use/i }
  ];

  console.log('\n📋 Verification Results:');
  let allPassed = true;

  for (const check of checks) {
    const passed = check.pattern.test(htmlContent);
    console.log(`  ${passed ? '✅' : '❌'} ${check.name}`);
    if (!passed) allPassed = false;
  }

  await agent.terminate();
  await memoryStore.close();

  if (allPassed) {
    console.log('\n✅ All verifications passed! HTML report generation is working correctly.');
    process.exit(0);
  } else {
    console.log('\n❌ Some verifications failed.');
    process.exit(1);
  }
}

verify().catch((error) => {
  console.error('❌ Verification failed:', error);
  process.exit(1);
});
