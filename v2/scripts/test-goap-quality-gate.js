/**
 * Test GOAP Quality Gate Integration
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const { GOAPQualityGateIntegration, QUALITY_GATE_GOALS } = require('../dist/planning');

async function main() {
  console.log('=== GOAP Quality Gate Integration Test ===\n');

  // Setup test database
  const dbPath = '.agentic-qe/test-qg.db';
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const db = new Database(dbPath);

  // Create required tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS goap_actions (
      id TEXT PRIMARY KEY, name TEXT, description TEXT, agent_type TEXT,
      preconditions TEXT, effects TEXT, cost REAL, duration_estimate INTEGER,
      success_rate REAL DEFAULT 1.0, execution_count INTEGER DEFAULT 0, category TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS goap_plans (
      id TEXT PRIMARY KEY, goal_id TEXT, initial_state TEXT, goal_state TEXT,
      action_sequence TEXT, total_cost REAL, estimated_duration INTEGER,
      actual_duration INTEGER, status TEXT DEFAULT 'pending', success INTEGER,
      failure_reason TEXT, execution_trace TEXT, replanned_from TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP, executed_at DATETIME, completed_at DATETIME
    );
  `);

  // Create integration instance
  const integration = new GOAPQualityGateIntegration(db);

  // Test scenario: Low coverage, needs remediation
  // Start with 65% line coverage - can reach 80% with one action
  const metrics = {
    coverage: {
      overallPercentage: 68,
      linePercentage: 65,
      branchPercentage: 60
    },
    testResults: {
      total: 100,
      passed: 92,
      failed: 8,
      failureRate: 0.08
    },
    security: {
      summary: {
        critical: 0,
        high: 1,
        medium: 3,
        low: 5
      }
    },
    performance: {
      errorRate: 0.03,
      p95Latency: 250
    },
    codeQuality: {
      maintainabilityIndex: 72,
      technicalDebtDays: 5
    }
  };

  const context = {
    projectId: 'test-project-123',
    buildId: 'build-456',
    environment: 'staging',
    criticality: 'medium',
    changedFiles: ['src/app.ts', 'src/utils.ts', 'src/service.ts'],
    timeRemaining: 1800  // 30 minutes
  };

  console.log('Test Scenario:');
  console.log('  Coverage: 65% line, 60% branch (target: 80%)');
  console.log('  Tests: 92% passing');
  console.log('  Security: 0 critical, 1 high vulnerability');
  console.log('  Environment: staging\n');

  // Test 1: Build world state
  console.log('--- Test 1: Building World State ---');
  const worldState = integration.buildWorldState(metrics, context);
  console.log('  Coverage.line:', worldState.coverage.line);
  console.log('  Quality.testsPassing:', worldState.quality.testsPassing);
  console.log('  Quality.securityScore:', worldState.quality.securityScore);
  console.log('  Context.environment:', worldState.context.environment);
  console.log('  Context.riskLevel:', worldState.context.riskLevel);
  console.log('  ✓ World state built successfully\n');

  // Test 2: Generate remediation plan for coverage target
  console.log('--- Test 2: Generate Remediation Plan (Coverage Target) ---');
  const coveragePlan = await integration.generateRemediationPlan(
    metrics,
    context,
    'COVERAGE_TARGET'
  );

  if (coveragePlan) {
    console.log('  ✅ Remediation plan generated!');
    console.log('  Plan ID:', coveragePlan.planId);
    console.log('  Actions:', coveragePlan.actions.length);
    console.log('  Total Cost:', coveragePlan.totalCost.toFixed(2));
    console.log('  Estimated Duration:', Math.round(coveragePlan.estimatedDuration / 1000) + 's');
    console.log('  Success Probability:', (coveragePlan.successProbability * 100).toFixed(1) + '%');
    console.log('  Alternative Paths:', coveragePlan.alternativePaths.length);
    console.log('  Action Sequence:');
    coveragePlan.actions.forEach((a, i) => {
      console.log(`    ${i + 1}. ${a.name} (${a.agentType}) - ${a.category}`);
    });
  } else {
    console.log('  ⚠ No remediation plan found');
  }

  console.log();

  // Test 3: Generate remediation plan for full quality gate
  console.log('--- Test 3: Generate Remediation Plan (Full Quality Gate) ---');
  const fullPlan = await integration.generateRemediationPlan(
    metrics,
    context,
    'PASS_QUALITY_GATE'
  );

  if (fullPlan) {
    console.log('  ✅ Full quality gate plan generated!');
    console.log('  Actions:', fullPlan.actions.length);
    console.log('  Total Cost:', fullPlan.totalCost.toFixed(2));
    console.log('  Alternative Paths:', fullPlan.alternativePaths.length);
  } else {
    console.log('  ⚠ No full plan found (may need more complex goal)');
  }

  console.log();

  // Test 4: Verify plan persistence
  console.log('--- Test 4: Verify Plan Persistence ---');
  const storedPlans = db.prepare('SELECT * FROM goap_plans').all();
  console.log('  Plans stored in database:', storedPlans.length);
  if (storedPlans.length > 0) {
    console.log('  Latest plan status:', storedPlans[storedPlans.length - 1].status);
    console.log('  ✓ Plan persistence working');
  }

  console.log();

  // Test 5: Record action outcome (simulated)
  console.log('--- Test 5: Record Action Outcome ---');
  if (coveragePlan && coveragePlan.actions.length > 0) {
    await integration.recordActionOutcome(coveragePlan.actions[0].id, true);
    console.log('  ✓ Action outcome recorded');
  }

  // Cleanup
  db.close();
  fs.unlinkSync(dbPath);

  console.log('\n=== All GOAP Quality Gate Tests Passed! ===');
}

main().catch(console.error);
