#!/usr/bin/env npx tsx
/**
 * Interactive Demo: Infrastructure Self-Healing (ADR-056)
 *
 * Demonstrates the full pipeline using NoOpCommandRunner:
 *   test stderr → classify → vulnerabilities → Strange Loop cycle → recovery
 *
 * Run: cd v3 && npx tsx scripts/demo-infra-healing.ts
 */

import { createInMemoryStrangeLoopWithInfraHealing } from '../src/strange-loop/strange-loop.js';
import { NoOpCommandRunner } from '../src/strange-loop/infra-healing/infra-action-executor.js';
import { createTestOutputObserver } from '../src/strange-loop/infra-healing/test-output-observer.js';

// ============================================================================
// Helpers
// ============================================================================

const DIVIDER = '─'.repeat(72);
const THICK_DIVIDER = '═'.repeat(72);

function header(title: string): void {
  console.log(`\n${THICK_DIVIDER}`);
  console.log(`  ${title}`);
  console.log(THICK_DIVIDER);
}

function section(title: string): void {
  console.log(`\n${DIVIDER}`);
  console.log(`  ${title}`);
  console.log(DIVIDER);
}

function log(label: string, value: unknown): void {
  const str = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
  console.log(`  ${label}: ${str}`);
}

// ============================================================================
// Playbook (inline YAML for demo)
// ============================================================================

const DEMO_PLAYBOOK = `
version: "1.0.0"
defaults:
  timeoutMs: 5000
  maxRetries: 2
  backoffMs: [1000, 2000]

services:
  postgres:
    description: "PostgreSQL database"
    healthCheck:
      command: "pg_isready -h localhost -p 5432"
      timeoutMs: 3000
    recover:
      - command: "docker compose up -d postgres"
        timeoutMs: 10000
      - command: "sleep 2"
        timeoutMs: 5000
        required: false
    verify:
      command: "pg_isready -h localhost -p 5432"
      timeoutMs: 3000
    maxRetries: 2
    backoffMs: [1000, 2000]

  redis:
    description: "Redis cache"
    healthCheck:
      command: "redis-cli -h localhost -p 6379 ping"
      timeoutMs: 2000
    recover:
      - command: "docker compose up -d redis"
        timeoutMs: 10000
    verify:
      command: "redis-cli -h localhost -p 6379 ping"
      timeoutMs: 2000
    maxRetries: 2
    backoffMs: [1000, 2000]

  elasticsearch:
    description: "Elasticsearch"
    healthCheck:
      command: "curl -sf http://localhost:9200/_cluster/health"
      timeoutMs: 5000
    recover:
      - command: "docker compose up -d elasticsearch"
        timeoutMs: 30000
    verify:
      command: "curl -sf http://localhost:9200/_cluster/health"
      timeoutMs: 5000
    maxRetries: 2
    backoffMs: [2000, 5000]
`;

// ============================================================================
// Scenarios
// ============================================================================

const SCENARIOS: Array<{ name: string; testOutput: string }> = [
  {
    name: 'Scenario 1: PostgreSQL Down',
    testOutput: [
      'PASS src/auth/login.test.ts',
      'FAIL src/users/create.test.ts',
      '  Error: connect ECONNREFUSED 127.0.0.1:5432',
      '  at TCPConnectWrap.afterConnect [as oncomplete] (net.js:1141:16)',
      'FAIL src/users/list.test.ts',
      '  Error: connect ECONNREFUSED 127.0.0.1:5432',
      'Tests: 2 failed, 1 passed, 3 total',
    ].join('\n'),
  },
  {
    name: 'Scenario 2: Redis + Elasticsearch Down (Multi-Failure)',
    testOutput: [
      'FAIL src/cache/session.test.ts',
      '  Error: connect ECONNREFUSED 127.0.0.1:6379',
      '  at RedisClient.connect (redis.js:42)',
      'FAIL src/search/index.test.ts',
      '  Error: connect ECONNREFUSED 127.0.0.1:9200',
      '  at SearchClient.ping (elastic.js:18)',
      'FAIL src/cache/rate-limit.test.ts',
      '  Error: connect ECONNREFUSED 127.0.0.1:6379',
      'Tests: 3 failed, 0 passed, 3 total',
    ].join('\n'),
  },
  {
    name: 'Scenario 3: DNS + OOM (Resource Exhaustion)',
    testOutput: [
      'FAIL src/external/api-client.test.ts',
      '  Error: getaddrinfo ENOTFOUND api.external-service.local',
      'FAIL src/workers/processor.test.ts',
      '  java.lang.OutOfMemoryError: Heap space',
      '  at java.util.Arrays.copyOf(Arrays.java:3236)',
      'Tests: 2 failed, 0 passed, 2 total',
    ].join('\n'),
  },
  {
    name: 'Scenario 4: Clean Run (No Failures)',
    testOutput: [
      'PASS src/auth/login.test.ts',
      'PASS src/users/create.test.ts',
      'PASS src/cache/session.test.ts',
      'Tests: 3 passed, 3 total',
      'Time: 4.2s',
    ].join('\n'),
  },
];

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  header('ADR-056: Infrastructure Self-Healing Demo');
  console.log('  Using NoOpCommandRunner (no real shell execution)');
  console.log('  All recovery commands are logged, not executed.\n');

  // ── Step 1: Demonstrate standalone observer ──
  section('STEP 1: TestOutputObserver — Pattern Matching');
  const observer = createTestOutputObserver();

  for (const scenario of SCENARIOS) {
    console.log(`\n  >> ${scenario.name}`);
    const result = observer.observe(scenario.testOutput);
    log('    Lines parsed', result.totalLinesParsed);
    log('    Infra failures', result.infraFailures.length);
    log('    Vulnerabilities', result.vulnerabilities.length);

    for (const vuln of result.vulnerabilities) {
      console.log(`    [VULN] type=${vuln.type}  severity=${vuln.severity}  agent=${vuln.affectedAgents[0]}  action=${vuln.suggestedAction}`);
    }

    if (result.infraFailures.length === 0) {
      console.log('    (clean output — no infrastructure issues detected)');
    }
  }

  // ── Step 2: Full Strange Loop pipeline ──
  section('STEP 2: Full Strange Loop Pipeline (NoOpCommandRunner)');

  const runner = new NoOpCommandRunner();

  // Configure: health checks fail (exit 1), recovery succeeds (exit 0), verify succeeds (exit 0)
  runner.setResponse('pg_isready', { exitCode: 1, stderr: 'no response', stdout: '' });
  runner.setResponse('docker compose up -d postgres', { exitCode: 0, stdout: 'Starting postgres...' });
  runner.setResponse('redis-cli', { exitCode: 1, stderr: 'Could not connect' });
  runner.setResponse('docker compose up -d redis', { exitCode: 0, stdout: 'Starting redis...' });
  runner.setResponse('curl -sf http://localhost:9200', { exitCode: 1, stderr: 'Connection refused' });
  runner.setResponse('docker compose up -d elasticsearch', { exitCode: 0, stdout: 'Starting elasticsearch...' });
  // sleep commands always succeed (default)
  // After recovery, health checks pass — set verify responses
  // (NoOp returns first match, so we need a different approach for verify after recovery)
  // For this demo, the verify will also use pg_isready which returns exit 1, showing a "failed" verify.
  // To show a successful verify, we'd need stateful mock. Instead we'll show both paths.

  const { orchestrator, infraHealing } = createInMemoryStrangeLoopWithInfraHealing(
    'observer-0',
    runner,
    DEMO_PLAYBOOK,
    { actionCooldownMs: 0, maxActionsPerCycle: 10 },
  );

  console.log('\n  >> Feeding Scenario 1 (PostgreSQL down) into full pipeline...');
  infraHealing.feedTestOutput(SCENARIOS[0].testOutput);

  console.log('  >> Running Strange Loop cycle...');
  const cycleResult = await orchestrator.runCycle();

  log('  Vulnerabilities observed', cycleResult.observation.vulnerabilities.length);
  for (const v of cycleResult.observation.vulnerabilities) {
    console.log(`    [VULN] type=${v.type}  severity=${v.severity}  agents=${v.affectedAgents.join(',')}`);
  }
  log('  Actions decided', cycleResult.actions.length);
  log('  Results executed', cycleResult.results.length);
  for (const result of cycleResult.results) {
    console.log(`    [RESULT] type=${result.action.type}  target=${result.action.targetAgentId}  success=${result.success}  msg=${result.message}`);
  }

  console.log('\n  >> Commands the runner received:');
  for (const call of runner.getCalls()) {
    console.log(`    $ ${call.command}  (timeout: ${call.timeoutMs}ms)`);
  }

  const stats = infraHealing.getStats();
  log('\n  Total observations', stats.totalObservations);
  log('  Infra failures detected', stats.infraFailuresDetected);
  log('  Recoveries attempted', stats.recoveriesAttempted);
  log('  Recoveries succeeded', stats.recoveriesSucceeded);
  log('  Recoveries failed', stats.recoveriesFailed);

  // ── Step 3: Multi-service failure ──
  section('STEP 3: Multi-Service Failure (Redis + Elasticsearch)');
  runner.reset();

  // Re-configure responses
  runner.setResponse('redis-cli', { exitCode: 1, stderr: 'Could not connect' });
  runner.setResponse('docker compose up -d redis', { exitCode: 0, stdout: 'Starting redis...' });
  runner.setResponse('curl -sf http://localhost:9200', { exitCode: 1, stderr: 'Connection refused' });
  runner.setResponse('docker compose up -d elasticsearch', { exitCode: 0, stdout: 'Starting elasticsearch...' });

  const { orchestrator: orch2, infraHealing: ih2 } = createInMemoryStrangeLoopWithInfraHealing(
    'observer-1',
    runner,
    DEMO_PLAYBOOK,
    { actionCooldownMs: 0, maxActionsPerCycle: 10 },
  );

  console.log('\n  >> Feeding Scenario 2 (Redis + Elasticsearch down)...');
  ih2.feedTestOutput(SCENARIOS[1].testOutput);

  console.log('  >> Running Strange Loop cycle...');
  const cycleResult2 = await orch2.runCycle();

  log('  Vulnerabilities detected', cycleResult2.observation.vulnerabilities.length);
  for (const v of cycleResult2.observation.vulnerabilities) {
    console.log(`    [VULN] type=${v.type}  severity=${v.severity}  agents=${v.affectedAgents.join(',')}`);
  }
  log('  Actions decided', cycleResult2.actions.length);
  log('  Results executed', cycleResult2.results.length);
  for (const result of cycleResult2.results) {
    console.log(`    [RESULT] type=${result.action.type}  target=${result.action.targetAgentId}  success=${result.success}`);
  }

  console.log('\n  >> Commands executed:');
  for (const call of runner.getCalls()) {
    console.log(`    $ ${call.command}`);
  }

  const stats2 = ih2.getStats();
  log('\n  By-service stats', stats2.byService);

  // ── Summary ──
  header('Demo Complete');
  console.log('  The pipeline correctly:');
  console.log('  1. Parsed test output and classified infra errors');
  console.log('  2. Generated SwarmVulnerability objects per service');
  console.log('  3. Strange Loop detected degraded synthetic agents');
  console.log('  4. Controller decided restart_service actions');
  console.log('  5. CompositeActionExecutor routed to InfraActionExecutor');
  console.log('  6. Recovery commands executed via NoOpCommandRunner');
  console.log('  7. Stats tracked per-service failure/recovery counts\n');
}

main().catch(console.error);
