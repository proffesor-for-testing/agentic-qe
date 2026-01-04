#!/usr/bin/env tsx
/**
 * Verification script for Phase 3 Metrics implementation
 *
 * This script verifies that the metrics system is properly implemented
 * and can connect to the database.
 */

import * as path from 'path';
import { LearningMetricsCollector as LearningMetrics, MetricsStore } from '../src/learning/metrics';
import BetterSqlite3 from 'better-sqlite3';

const dbPath = path.join(process.cwd(), '.agentic-qe', 'memory.db');

async function verifyMetrics() {
  console.log('🔍 Verifying Phase 3 Metrics Implementation\n');
  console.log('=' .repeat(60));

  // Check database exists
  console.log('\n1. Database Connection');
  console.log('-'.repeat(60));
  try {
    const db = new BetterSqlite3(dbPath);
    console.log(`✅ Database exists: ${dbPath}`);

    // Check tables exist
    const tables = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name IN (
        'patterns',
        'dream_cycles',
        'dream_insights',
        'transfer_registry',
        'captured_experiences',
        'metrics_snapshots'
      )
    `).all() as any[];

    console.log(`✅ Found ${tables.length}/6 expected tables:`);
    for (const table of tables) {
      console.log(`   - ${table.name}`);
    }

    db.close();
  } catch (error) {
    console.log(`❌ Database error: ${error}`);
    return false;
  }

  // Initialize LearningMetrics
  console.log('\n2. LearningMetrics Initialization');
  console.log('-'.repeat(60));
  let metrics: LearningMetrics;
  try {
    metrics = new LearningMetrics({ dbPath, debug: true });
    console.log('✅ LearningMetrics initialized');
  } catch (error) {
    console.log(`❌ LearningMetrics initialization failed: ${error}`);
    return false;
  }

  // Get current metrics
  console.log('\n3. Current Metrics (Last 24 Hours)');
  console.log('-'.repeat(60));
  try {
    const current = await metrics.getCurrentMetrics(24);

    console.log('\n📊 Discovery Metrics:');
    console.log(`   Total patterns: ${current.patternsDiscoveredTotal}`);
    console.log(`   Today patterns: ${current.patternsDiscoveredToday}`);
    console.log(`   Discovery rate: ${current.discoveryRate.toFixed(2)} patterns/hour`);

    console.log('\n🎯 Quality Metrics:');
    console.log(`   Pattern accuracy: ${(current.patternAccuracy * 100).toFixed(1)}%`);
    console.log(`   Insight actionability: ${(current.insightActionability * 100).toFixed(1)}%`);
    console.log(`   False positive rate: ${(current.falsePositiveRate * 100).toFixed(1)}%`);

    console.log('\n🔄 Transfer Metrics:');
    console.log(`   Transfer success rate: ${(current.transferSuccessRate * 100).toFixed(1)}%`);
    console.log(`   Adoption rate: ${(current.adoptionRate * 100).toFixed(1)}%`);
    console.log(`   Negative transfers: ${current.negativeTransferCount}`);

    console.log('\n📈 Impact Metrics:');
    console.log(`   Task time reduction: ${current.taskTimeReduction.toFixed(1)}%`);
    console.log(`   Coverage improvement: ${current.coverageImprovement.toFixed(1)}%`);
    console.log(`   Bug detection improvement: ${current.bugDetectionImprovement.toFixed(1)}%`);

    console.log('\n💚 System Health:');
    console.log(`   Cycle completion rate: ${(current.sleepCycleCompletionRate * 100).toFixed(1)}%`);
    console.log(`   Avg cycle duration: ${(current.avgCycleDuration / 1000).toFixed(1)}s`);
    console.log(`   Error rate: ${(current.errorRate * 100).toFixed(1)}%`);

    console.log('\n✅ Current metrics calculated successfully');
  } catch (error) {
    console.log(`❌ Current metrics calculation failed: ${error}`);
    return false;
  }

  // Get metrics summary with trends
  console.log('\n4. Metrics Summary with Trends');
  console.log('-'.repeat(60));
  try {
    const summary = await metrics.getMetricsSummary(24);

    console.log('\n📊 Breakdown:');
    console.log(`   Discovery - Total: ${summary.breakdown.discovery.totalPatterns}, Today: ${summary.breakdown.discovery.todayPatterns}`);
    console.log(`   Quality - High confidence: ${summary.breakdown.quality.highConfidencePatterns}, Applied insights: ${summary.breakdown.quality.insightsApplied}`);
    console.log(`   Transfer - Total: ${summary.breakdown.transfer.totalTransfers}, Successful: ${summary.breakdown.transfer.successfulTransfers}`);
    console.log(`   Impact - With patterns: ${summary.breakdown.impact.tasksWithPatterns}, Without: ${summary.breakdown.impact.tasksWithoutPatterns}`);
    console.log(`   System - Total cycles: ${summary.breakdown.system.totalCycles}, Completed: ${summary.breakdown.system.completedCycles}`);

    console.log('\n📈 Trends (normalized -1 to 1):');
    console.log(`   Discovery: ${summary.trends.discoveryTrend.toFixed(3)} ${summary.trends.discoveryTrend > 0 ? '📈' : summary.trends.discoveryTrend < 0 ? '📉' : '➡️'}`);
    console.log(`   Quality: ${summary.trends.qualityTrend.toFixed(3)} ${summary.trends.qualityTrend > 0 ? '📈' : summary.trends.qualityTrend < 0 ? '📉' : '➡️'}`);
    console.log(`   Transfer: ${summary.trends.transferTrend.toFixed(3)} ${summary.trends.transferTrend > 0 ? '📈' : summary.trends.transferTrend < 0 ? '📉' : '➡️'}`);
    console.log(`   Impact: ${summary.trends.impactTrend.toFixed(3)} ${summary.trends.impactTrend > 0 ? '📈' : summary.trends.impactTrend < 0 ? '📉' : '➡️'}`);

    console.log('\n✅ Metrics summary calculated successfully');
  } catch (error) {
    console.log(`❌ Metrics summary calculation failed: ${error}`);
    return false;
  }

  metrics.close();

  // Initialize MetricsStore
  console.log('\n5. MetricsStore Initialization');
  console.log('-'.repeat(60));
  let store: MetricsStore;
  try {
    store = new MetricsStore({
      dbPath,
      autoSnapshotInterval: 0, // Disable auto-snapshot for testing
      debug: true
    });
    console.log('✅ MetricsStore initialized');
  } catch (error) {
    console.log(`❌ MetricsStore initialization failed: ${error}`);
    return false;
  }

  // Capture a snapshot
  console.log('\n6. Snapshot Capture');
  console.log('-'.repeat(60));
  try {
    const snapshot = await store.captureSnapshot(24);
    console.log(`✅ Snapshot captured: ${snapshot.id}`);
    console.log(`   Time: ${snapshot.snapshotTime.toISOString()}`);
    console.log(`   Period: ${snapshot.periodHours} hours`);
    console.log(`   Discovery rate: ${snapshot.metrics.discoveryRate.toFixed(2)} patterns/hour`);
  } catch (error) {
    console.log(`❌ Snapshot capture failed: ${error}`);
    return false;
  }

  // Get historical snapshots
  console.log('\n7. Historical Snapshots');
  console.log('-'.repeat(60));
  try {
    const history = await store.getHistory({ limit: 5 });
    console.log(`✅ Retrieved ${history.length} historical snapshots`);

    if (history.length > 0) {
      console.log('\n   Latest snapshots:');
      for (let i = 0; i < Math.min(5, history.length); i++) {
        const snap = history[i];
        console.log(`   ${i + 1}. ${snap.snapshotTime.toISOString()} - ${snap.metrics.discoveryRate.toFixed(2)} patterns/hour`);
      }
    }
  } catch (error) {
    console.log(`❌ Historical snapshots retrieval failed: ${error}`);
    return false;
  }

  // Get snapshot count
  console.log('\n8. Snapshot Statistics');
  console.log('-'.repeat(60));
  try {
    const count = store.getSnapshotCount();
    console.log(`✅ Total snapshots in database: ${count}`);

    const last7Days = store.getSnapshotCount({
      startTime: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    });
    console.log(`   Snapshots (last 7 days): ${last7Days}`);
  } catch (error) {
    console.log(`❌ Snapshot statistics failed: ${error}`);
    return false;
  }

  store.close();

  // Final summary
  console.log('\n' + '='.repeat(60));
  console.log('✅ Phase 3 Metrics Verification Complete');
  console.log('='.repeat(60));
  console.log('\nAll components verified:');
  console.log('  ✅ Database connection');
  console.log('  ✅ LearningMetrics collector');
  console.log('  ✅ Current metrics calculation');
  console.log('  ✅ Metrics summary with trends');
  console.log('  ✅ MetricsStore persistence');
  console.log('  ✅ Snapshot capture');
  console.log('  ✅ Historical queries');
  console.log('  ✅ Statistics');
  console.log('\n🎉 Phase 3 Metrics implementation is COMPLETE and working!\n');

  return true;
}

// Run verification
verifyMetrics()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error('Verification failed:', error);
    process.exit(1);
  });
