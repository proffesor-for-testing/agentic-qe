#!/usr/bin/env ts-node
/**
 * Verification Script for Regression Domain Tools
 *
 * This script demonstrates that both regression tools are working correctly:
 * 1. analyzeRegressionRisk() - ML-based risk analysis
 * 2. selectRegressionTests() - Smart test selection
 *
 * Run: npx ts-node scripts/verify-regression-tools.ts
 */

import {
  analyzeRegressionRisk,
  selectRegressionTests,
  type RegressionRiskAnalysisParams,
  type SmartTestSelectionParams
} from '../src/mcp/tools/qe/regression/index.js';

console.log('🔍 Verifying Regression Domain Tools...\n');

// Test 1: Risk Analysis
async function testRiskAnalysis() {
  console.log('📊 Test 1: Regression Risk Analysis');
  console.log('─'.repeat(60));

  const params: RegressionRiskAnalysisParams = {
    changes: [
      {
        file: 'src/payment/service.ts',
        type: 'modified',
        linesChanged: 150,
        complexity: 15,
        testCoverage: 85,
        author: 'dev@example.com',
        commit: 'abc123'
      },
      {
        file: 'src/auth/login.ts',
        type: 'modified',
        linesChanged: 75,
        complexity: 12,
        testCoverage: 90,
        author: 'dev@example.com',
        commit: 'def456'
      }
    ],
    historicalData: {
      'src/payment/service.ts': 0.25, // 25% historical failure rate
      'src/auth/login.ts': 0.15 // 15% historical failure rate
    },
    mlModelEnabled: true,
    includeBusinessImpact: true
  };

  try {
    const result = await analyzeRegressionRisk(params);

    if (result.success && result.data) {
      console.log('✅ Risk Analysis PASSED');
      console.log(`   Risk Score: ${result.data.riskScore.toFixed(1)}/100`);
      console.log(`   Risk Level: ${result.data.riskLevel}`);
      console.log(`   Change Pattern: ${result.data.changeAnalysis.changePattern}`);
      console.log(`   Files Changed: ${result.data.changeAnalysis.filesChanged}`);
      console.log(`   Business Risk: ${result.data.blastRadius.businessRisk}`);
      console.log(`   ML Confidence: ${(result.data.mlPrediction.confidence * 100).toFixed(1)}%`);
      console.log(`   Recommendations: ${result.data.recommendations.length}`);
      console.log(`   Execution Time: ${result.metadata.executionTime}ms`);
    } else {
      console.error('❌ Risk Analysis FAILED:', result.error);
      return false;
    }
  } catch (error) {
    console.error('❌ Risk Analysis ERROR:', error);
    return false;
  }

  console.log();
  return true;
}

// Test 2: Smart Test Selection
async function testSmartSelection() {
  console.log('🎯 Test 2: Smart Test Selection');
  console.log('─'.repeat(60));

  const params: SmartTestSelectionParams = {
    changes: [
      {
        file: 'src/payment/service.ts',
        type: 'modified',
        linesChanged: 150,
        complexity: 15,
        testCoverage: 85
      }
    ],
    availableTests: [
      {
        path: 'tests/payment/service.test.ts',
        type: 'unit',
        estimatedTime: 2000,
        priority: 'critical',
        coveredModules: ['payment.service']
      },
      {
        path: 'tests/payment/integration.test.ts',
        type: 'integration',
        estimatedTime: 5000,
        priority: 'high',
        coveredModules: ['payment.service', 'order.service']
      },
      {
        path: 'tests/order/service.test.ts',
        type: 'unit',
        estimatedTime: 1500,
        priority: 'high',
        coveredModules: ['order.service']
      },
      {
        path: 'tests/auth/login.test.ts',
        type: 'unit',
        estimatedTime: 1000,
        priority: 'high',
        coveredModules: ['auth.login']
      },
      {
        path: 'tests/ui/checkout.e2e.test.ts',
        type: 'e2e',
        estimatedTime: 15000,
        priority: 'medium',
        coveredModules: ['ui.checkout']
      },
      // Add more dummy tests to show selection
      ...Array.from({ length: 20 }, (_, i) => ({
        path: `tests/misc/test-${i}.test.ts`,
        type: 'unit' as const,
        estimatedTime: 1000 + i * 100,
        priority: 'low' as const,
        coveredModules: [`module-${i}`]
      }))
    ],
    coverageMap: {
      'src/payment/service.ts': [
        'tests/payment/service.test.ts',
        'tests/payment/integration.test.ts'
      ]
    },
    strategy: 'smart',
    confidenceTarget: 0.95,
    timeBudget: 300000, // 5 minutes
    historicalFailures: {
      'tests/payment/service.test.ts': 0.15
    },
    mlModelEnabled: true,
    includeTimeOptimization: true
  };

  try {
    const result = await selectRegressionTests(params);

    if (result.success && result.data) {
      console.log('✅ Test Selection PASSED');
      console.log(`   Total Tests: ${result.data.totalTests}`);
      console.log(`   Selected Tests: ${result.data.selectedTests.length}`);
      console.log(`   Reduction Rate: ${(result.data.metrics.reductionRate * 100).toFixed(1)}%`);
      console.log(`   Time Saved: ${(result.data.metrics.timeSaved / 1000).toFixed(1)}s`);
      console.log(`   Speedup Factor: ${result.data.timeOptimization.speedupFactor}`);
      console.log(`   Confidence: ${result.data.confidenceAssessment.confidenceLevel}`);
      console.log(`   Defect Detection: ${(result.data.confidenceAssessment.expectedDefectDetectionRate * 100).toFixed(1)}%`);
      console.log(`   Execution Time: ${result.metadata.executionTime}ms`);

      console.log('\n   Selected Tests:');
      result.data.selectedTests.slice(0, 5).forEach((test, i) => {
        console.log(`     ${i + 1}. ${test.path}`);
        console.log(`        Reason: ${test.reason}, Priority: ${test.priority}`);
      });
      if (result.data.selectedTests.length > 5) {
        console.log(`     ... and ${result.data.selectedTests.length - 5} more`);
      }
    } else {
      console.error('❌ Test Selection FAILED:', result.error);
      return false;
    }
  } catch (error) {
    console.error('❌ Test Selection ERROR:', error);
    return false;
  }

  console.log();
  return true;
}

// Run all tests
async function main() {
  const results = await Promise.all([
    testRiskAnalysis(),
    testSmartSelection()
  ]);

  console.log('─'.repeat(60));
  const passed = results.filter(r => r).length;
  const total = results.length;

  if (passed === total) {
    console.log(`✅ All ${total} tests PASSED`);
    console.log('\n🎉 Regression Domain Implementation Verified!');
    process.exit(0);
  } else {
    console.log(`❌ ${total - passed}/${total} tests FAILED`);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
