#!/usr/bin/env node

/**
 * Quick Test Example - Try this first!
 * A simple example to verify the framework is working
 */

import { AgenticQE } from '../src/index';
import {
  RequirementsAnalysis,
  RiskAssessment,
  TDDSuggestions,
  ExploratoryTestingSession,
  ProductionMonitoring,
  Ambiguity,
  TestSuggestion,
  Anomaly
} from '../src/core/types';
import chalk from 'chalk';

interface RiskInput {
  linesChanged: number;
  complexity: number;
  critical: boolean;
  previousBugs: number;
}

interface ProductionMetrics {
  errorRate: number;
  latencyP99: number;
  traffic: number;
  saturation: number;
}

async function quickTest(): Promise<void> {
  console.log(chalk.blue.bold('\n🚀 Quick Test - Agentic QE Framework\n'));
  console.log('This example shows basic QE tasks you can run immediately.\n');

  const aqe = new AgenticQE();

  // 1. Analyze some requirements
  console.log(chalk.yellow('1. Analyzing Requirements'));
  console.log('─'.repeat(40));

  const requirements: string[] = [
    'The login page should load quickly',
    'Users must be able to reset their password via email',
    'The system should handle multiple concurrent users'
  ];

  const reqAnalysis: RequirementsAnalysis = await aqe.analyzeRequirements(requirements);

  console.log('Requirements to analyze:');
  requirements.forEach((req, i) => {
    console.log(`  ${i + 1}. ${req}`);
  });

  console.log('\nAnalysis Results:');
  console.log(chalk.green(`✓ Found ${reqAnalysis.ambiguities.length} ambiguous terms`));

  if (reqAnalysis.ambiguities.length > 0) {
    console.log('\nAmbiguous terms that need clarification:');
    reqAnalysis.ambiguities.forEach((issue: Ambiguity) => {
      console.log(chalk.yellow(`  ⚠ "${issue.term}" in requirement ${issue.requirement + 1}`));
      console.log(`     Suggestion: ${issue.suggestion}`);
    });
  }

  // 2. Assess risk for code changes
  console.log(chalk.yellow('\n2. Risk Assessment'));
  console.log('─'.repeat(40));

  const changes: RiskInput = {
    linesChanged: 250,
    complexity: 8,
    critical: true,
    previousBugs: 2
  };

  console.log('Code change details:');
  console.log(`  • Lines changed: ${changes.linesChanged}`);
  console.log(`  • Complexity: ${changes.complexity}`);
  console.log(`  • Critical component: ${changes.critical ? 'Yes' : 'No'}`);
  console.log(`  • Previous bugs: ${changes.previousBugs}`);

  const risk: RiskAssessment = await aqe.assessRisk(changes);

  const riskLevel = risk.overallRisk > 0.7 ? '🔴 HIGH' :
                    risk.overallRisk > 0.4 ? '🟡 MEDIUM' :
                    '🟢 LOW';

  console.log(`\nRisk Assessment: ${riskLevel} (${(risk.overallRisk * 100).toFixed(0)}%)`);
  console.log('\nTesting Priorities:');
  risk.priorities.forEach((priority, i) => {
    console.log(`  ${i + 1}. ${priority}`);
  });

  // 3. Get test suggestions
  console.log(chalk.yellow('\n3. Test Suggestions'));
  console.log('─'.repeat(40));

  const sampleCode: string = `
    function calculateDiscount(price: number, customerType: string): number {
      if (customerType === 'premium') {
        return price * 0.8;
      }
      return price;
    }
  `;

  console.log('Code to test:');
  console.log(chalk.gray(sampleCode));

  const testSuggestions: TDDSuggestions = await aqe.suggestTests(sampleCode);

  console.log('Suggested Tests:');
  console.log(chalk.green(`✓ Next test to write: ${testSuggestions.nextTest.description}`));
  console.log('\nMissing test cases:');
  testSuggestions.missingTests.forEach((test: string) => {
    console.log(`  • ${test}`);
  });

  // 4. Start exploratory testing session
  console.log(chalk.yellow('\n4. Exploratory Testing Session'));
  console.log('─'.repeat(40));

  const session: ExploratoryTestingSession = await aqe.runExploratorySession({
    charter: 'Explore the checkout flow for edge cases',
    timeBox: 30,
    tour: 'garbage_collector'
  });

  console.log('Session created:');
  console.log(`  • ID: ${session.id}`);
  console.log(`  • Charter: ${session.charter}`);
  console.log(`  • Duration: ${session.timeBox} minutes`);
  console.log(`  • Tour type: ${session.tour} (testing edge cases)`);

  // 5. Check production metrics
  console.log(chalk.yellow('\n5. Production Monitoring'));
  console.log('─'.repeat(40));

  const metrics: ProductionMetrics = {
    errorRate: 0.02,
    latencyP99: 450,
    traffic: 1000,
    saturation: 0.6
  };

  console.log('Current metrics:');
  console.log(`  • Error rate: ${(metrics.errorRate * 100).toFixed(1)}%`);
  console.log(`  • P99 latency: ${metrics.latencyP99}ms`);
  console.log(`  • Traffic: ${metrics.traffic} req/s`);
  console.log(`  • Saturation: ${(metrics.saturation * 100)}%`);

  const monitoring: ProductionMonitoring = await aqe.monitorProduction(metrics);

  if (monitoring.anomalies.length > 0) {
    console.log(chalk.red('\n⚠ Anomalies detected:'));
    monitoring.anomalies.forEach((anomaly: Anomaly) => {
      console.log(`  • ${anomaly.type}: ${anomaly.value}`);
    });
  } else {
    console.log(chalk.green('\n✓ All metrics within normal range'));
  }

  // Summary
  console.log(chalk.blue.bold('\n📊 Summary'));
  console.log('─'.repeat(40));
  console.log('The Agentic QE Framework can help you:');
  console.log('  ✓ Analyze requirements for quality issues');
  console.log('  ✓ Assess risk and prioritize testing');
  console.log('  ✓ Generate test ideas and find gaps');
  console.log('  ✓ Plan exploratory testing sessions');
  console.log('  ✓ Monitor production for issues');

  console.log(chalk.green.bold('\n✅ Quick test complete!'));
  console.log('\nNext steps:');
  console.log('1. Try examples/sparc-workflow.ts for complete SPARC methodology');
  console.log('2. Try examples/swarm-coordination.ts for multi-agent testing');
  console.log('3. Read docs/LOCAL_TESTING_GUIDE.md for testing your own project');
}

// Run the quick test
if (require.main === module) {
  quickTest()
    .then(() => {
      console.log(chalk.gray('\nExiting...'));
      process.exit(0);
    })
    .catch((error: Error) => {
      console.error(chalk.red('Error:'), error);
      process.exit(1);
    });
}

export { quickTest };