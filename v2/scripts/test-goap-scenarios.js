/**
 * Test GOAP alternative paths for different failure scenarios
 */
const BetterSqlite3 = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), '.agentic-qe', 'memory.db');
const db = new BetterSqlite3(dbPath);

const { GOAPQualityGateIntegration } = require('../dist/planning/integration/GOAPQualityGateIntegration');

const integration = new GOAPQualityGateIntegration(db);

const context = {
  projectId: 'test',
  buildId: 'b1',
  environment: 'staging',
  timeRemaining: 3600,
  availableAgents: ['qe-test-generator', 'qe-coverage-analyzer', 'qe-security-scanner', 'qe-performance-tester', 'qe-test-executor']
};

async function testScenarios() {
  console.log('=== Testing GOAP Alternative Paths ===\n');

  // Test 1: Coverage failure
  console.log('Test 1: Coverage Failure (60% line)');
  const plan1 = await integration.generateRemediationPlan(
    {
      coverage: { linePercentage: 60, branchPercentage: 50 },
      testResults: { total: 100, passed: 95 },
      security: { summary: { critical: 0, high: 0 } }
    },
    context,
    'COVERAGE_TARGET'
  );
  console.log('  Primary plan:', plan1 ? plan1.actions.length + ' actions' : 'None');
  console.log('  Alternative paths:', plan1 ? plan1.alternativePaths.length : 0);
  if (plan1) {
    console.log('  Actions:', plan1.actions.map(a => a.name).join(' -> '));
  }

  // Test 2: Security failure
  console.log('\nTest 2: Security Failure (score ~50)');
  const plan2 = await integration.generateRemediationPlan(
    {
      coverage: { linePercentage: 85 },
      testResults: { total: 100, passed: 95 },
      security: { summary: { critical: 1, high: 2, medium: 5 } }
    },
    context,
    'SECURITY_CLEAR'
  );
  console.log('  Primary plan:', plan2 ? plan2.actions.length + ' actions' : 'None');
  if (plan2) {
    console.log('  Actions:', plan2.actions.map(a => a.name).join(' -> '));
    console.log('  Alternative paths:', plan2.alternativePaths.length);
  }

  // Test 3: Test failure
  console.log('\nTest 3: Test Failure (80% passing)');
  const plan3 = await integration.generateRemediationPlan(
    {
      coverage: { linePercentage: 85 },
      testResults: { total: 100, passed: 80, failed: 20 },
      security: { summary: { critical: 0, high: 0 } }
    },
    { ...context, timeRemaining: 1800 },
    'TEST_SUCCESS'
  );
  console.log('  Primary plan:', plan3 ? plan3.actions.length + ' actions' : 'None');
  if (plan3) {
    console.log('  Actions:', plan3.actions.map(a => a.name).join(' -> '));
    console.log('  Alternative paths:', plan3.alternativePaths.length);
  }

  // Test 4: Performance failure
  // errorRate of 3.0 = score of 100 - (3.0*10) = 70, which is below 80 threshold
  console.log('\nTest 4: Performance Failure (score ~70 due to high error rate)');
  const plan4 = await integration.generateRemediationPlan(
    {
      coverage: { linePercentage: 85 },
      testResults: { total: 100, passed: 95 },
      security: { summary: { critical: 0, high: 0 } },
      performance: { errorRate: 3.0, p95Latency: 500 }  // High latency + errors = score ~55
    },
    context,
    'PERFORMANCE_SLA'
  );
  console.log('  Primary plan:', plan4 ? plan4.actions.length + ' actions' : 'None');
  if (plan4) {
    console.log('  Actions:', plan4.actions.map(a => a.name).join(' -> '));
    console.log('  Alternative paths:', plan4.alternativePaths.length);
  }

  integration.close();

  // Summary
  console.log('\n=== Summary ===');
  const results = [
    { scenario: 'Coverage', plan: plan1 },
    { scenario: 'Security', plan: plan2 },
    { scenario: 'Tests (TEST_SUCCESS)', plan: plan3 },
    { scenario: 'Performance', plan: plan4 }
  ];

  let allPassed = true;
  for (const r of results) {
    const hasPlan = r.plan !== null;
    const altPaths = r.plan ? r.plan.alternativePaths.length : 0;
    const status = hasPlan && altPaths >= 2 ? '✅' : (hasPlan ? '⚠️' : '❌');
    console.log(`${status} ${r.scenario}: ${hasPlan ? 'Plan found' : 'No plan'} (${altPaths} alternatives)`);
    if (!hasPlan) allPassed = false;
  }

  console.log('\n' + (allPassed ? '✅ All failure types have remediation plans' : '❌ Some scenarios need work'));
}

testScenarios().catch(err => {
  console.error('Error:', err);
  integration.close();
});
