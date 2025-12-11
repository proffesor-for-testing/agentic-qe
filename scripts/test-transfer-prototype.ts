#!/usr/bin/env npx tsx
/**
 * Test script for TransferPrototype - Cross-agent pattern transfer
 *
 * Validates Phase 0.3 requirements:
 * 1. Select 2 agents with overlapping domains
 * 2. Transfer 10 patterns between them
 * 3. Measure transfer success rate
 * 4. Identify incompatibility patterns
 *
 * Success Gate: >50% transfer success rate
 *
 * @module scripts/test-transfer-prototype
 */

import { TransferPrototype, TransferResult } from '../src/learning/transfer/TransferPrototype';

async function main() {
  console.log('═'.repeat(60));
  console.log('🔄 TRANSFER PROTOTYPE TEST - Cross-Agent Pattern Transfer');
  console.log('═'.repeat(60));
  console.log();

  const prototype = new TransferPrototype();

  // Test 1: High-overlap agents (test-generator → coverage-analyzer)
  console.log('📋 Test 1: High-Overlap Transfer (test-generator → coverage-analyzer)');
  console.log('   These agents have overlapping capabilities (code analysis, test frameworks)');
  console.log();

  const highOverlapResult = await prototype.testTransfer(
    'test-generator',
    'coverage-analyzer',
    10
  );

  printResult('test-generator → coverage-analyzer', highOverlapResult);

  // Test 2: Medium-overlap agents (coverage-analyzer → quality-gate)
  console.log('📋 Test 2: Medium-Overlap Transfer (coverage-analyzer → quality-gate)');
  console.log('   Quality gate uses coverage data but has different primary function');
  console.log();

  const mediumOverlapResult = await prototype.testTransfer(
    'coverage-analyzer',
    'quality-gate',
    10
  );

  printResult('coverage-analyzer → quality-gate', mediumOverlapResult);

  // Test 3: Low-overlap agents (security-scanner → performance-tester)
  console.log('📋 Test 3: Low-Overlap Transfer (security-scanner → performance-tester)');
  console.log('   These agents have very different domains');
  console.log();

  const lowOverlapResult = await prototype.testTransfer(
    'security-scanner',
    'performance-tester',
    10
  );

  printResult('security-scanner → performance-tester', lowOverlapResult);

  // Test 4: Same-domain agents (test-generator → flaky-test-hunter)
  console.log('📋 Test 4: Same-Domain Transfer (test-generator → flaky-test-hunter)');
  console.log('   Both agents work with tests');
  console.log();

  const sameDomainResult = await prototype.testTransfer(
    'test-generator',
    'flaky-test-hunter',
    10
  );

  printResult('test-generator → flaky-test-hunter', sameDomainResult);

  // Summary
  console.log('═'.repeat(60));
  console.log('📊 OVERALL TRANSFER TEST SUMMARY');
  console.log('═'.repeat(60));
  console.log();

  const allResults = [
    { name: 'High-overlap (test-gen → coverage)', result: highOverlapResult },
    { name: 'Medium-overlap (coverage → quality-gate)', result: mediumOverlapResult },
    { name: 'Low-overlap (security → performance)', result: lowOverlapResult },
    { name: 'Same-domain (test-gen → flaky-hunter)', result: sameDomainResult },
  ];

  console.log('   Transfer Success Rates:');
  console.log('   ' + '─'.repeat(50));

  let totalPatterns = 0;
  let totalSuccessful = 0;

  for (const { name, result } of allResults) {
    const rate = (result.successRate * 100).toFixed(1);
    const bar = '█'.repeat(Math.round(result.successRate * 20)) +
                '░'.repeat(20 - Math.round(result.successRate * 20));
    console.log(`   ${name.padEnd(40)} [${bar}] ${rate}%`);

    totalPatterns += result.totalPatterns;
    totalSuccessful += result.successfulTransfers;
  }

  console.log('   ' + '─'.repeat(50));

  const overallRate = totalPatterns > 0 ? totalSuccessful / totalPatterns : 0;
  const overallBar = '█'.repeat(Math.round(overallRate * 20)) +
                     '░'.repeat(20 - Math.round(overallRate * 20));
  console.log(`   ${'OVERALL'.padEnd(40)} [${overallBar}] ${(overallRate * 100).toFixed(1)}%`);
  console.log();

  // Incompatibility patterns discovered
  console.log('   Incompatibility Patterns Discovered:');
  const allIncompatibilities = allResults.flatMap(r => r.result.incompatibilityPatterns);
  const uniqueIncompatibilities = [...new Set(allIncompatibilities)];

  if (uniqueIncompatibilities.length > 0) {
    for (const pattern of uniqueIncompatibilities.slice(0, 5)) {
      console.log(`   • ${pattern}`);
    }
    if (uniqueIncompatibilities.length > 5) {
      console.log(`   • ... and ${uniqueIncompatibilities.length - 5} more`);
    }
  } else {
    console.log('   • None (all transfers within expected parameters)');
  }
  console.log();

  // Success gate evaluation
  console.log('   Phase 0 Success Gate Evaluation:');
  console.log('   ─'.repeat(40));
  console.log(`   Target: >50% transfer success rate`);
  console.log(`   Actual: ${(overallRate * 100).toFixed(1)}%`);
  console.log();

  if (overallRate >= 0.5) {
    console.log('   ✅ SUCCESS GATE PASSED');
    console.log('   Cross-agent pattern transfer is viable!');
  } else {
    console.log('   ❌ SUCCESS GATE NOT MET');
    console.log('   May need research spike before Phase 2');
  }
  console.log();

  // Recommendations
  console.log('   📝 Recommendations:');
  if (highOverlapResult.successRate >= 0.7) {
    console.log('   • High-overlap transfers work well - prioritize these pairs');
  }
  if (lowOverlapResult.successRate < 0.3) {
    console.log('   • Low-overlap transfers have limited value - consider skipping');
  }
  if (sameDomainResult.successRate >= 0.6) {
    console.log('   • Same-domain transfers are effective - good for specialization');
  }
  console.log();

  // Store results
  await prototype.storeResults({
    totalPatterns,
    successfulTransfers: totalSuccessful,
    failedTransfers: totalPatterns - totalSuccessful,
    successRate: overallRate,
    averageApplicability: allResults.reduce((sum, r) => sum + r.result.averageApplicability, 0) / allResults.length,
    averagePerformanceImpact: allResults.reduce((sum, r) => sum + r.result.averagePerformanceImpact, 0) / allResults.length,
    tests: allResults.flatMap(r => r.result.tests),
    incompatibilityPatterns: uniqueIncompatibilities,
  });

  console.log('   📁 Results stored in memory.db');
  console.log();

  prototype.close();
}

function printResult(name: string, result: TransferResult) {
  console.log(`   Results for ${name}:`);
  console.log(`   ├─ Total patterns: ${result.totalPatterns}`);
  console.log(`   ├─ Successful: ${result.successfulTransfers} (${(result.successRate * 100).toFixed(1)}%)`);
  console.log(`   ├─ Failed: ${result.failedTransfers}`);
  console.log(`   ├─ Avg applicability: ${(result.averageApplicability * 100).toFixed(1)}%`);
  console.log(`   └─ Avg performance impact: +${(result.averagePerformanceImpact * 100).toFixed(1)}%`);

  if (result.incompatibilityPatterns.length > 0) {
    console.log(`   Incompatibilities:`);
    for (const pattern of result.incompatibilityPatterns.slice(0, 3)) {
      console.log(`     • ${pattern}`);
    }
  }

  console.log();
}

main().catch(console.error);
