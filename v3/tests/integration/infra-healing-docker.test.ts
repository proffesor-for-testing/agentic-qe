/**
 * Real Docker Integration Test: Infrastructure Self-Healing (ADR-057)
 *
 * Tests the FULL pipeline with a real PostgreSQL container:
 *   1. Start postgres container
 *   2. Verify it's healthy (pg_isready via docker exec)
 *   3. Stop the container (simulate infrastructure failure)
 *   4. Feed the connection error into the orchestrator
 *   5. ShellCommandRunner executes real `docker start` recovery
 *   6. Verify postgres is accepting connections again
 *
 * Requirements: Docker with postgres:16-alpine image available.
 * Run: cd v3 && npx vitest run tests/integration/infra-healing-docker.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'node:child_process';
import { ShellCommandRunner } from '../../src/strange-loop/infra-healing/infra-action-executor.js';
import { createInfraHealingOrchestratorSync } from '../../src/strange-loop/infra-healing/infra-healing-orchestrator.js';
import { createStrangeLoopWithInfraHealing } from '../../src/strange-loop/strange-loop.js';
import { InMemoryAgentProvider } from '../../src/strange-loop/swarm-observer.js';
import { NoOpActionExecutor } from '../../src/strange-loop/healing-controller.js';

// ============================================================================
// Configuration
// ============================================================================

const CONTAINER_NAME = 'aqe-test-postgres';
const PG_PORT = '15432';
const PG_PASSWORD = 'testpass';
const TIMEOUT = 60_000;

const PLAYBOOK = `
version: "1.0.0"
defaults:
  timeoutMs: 10000
  maxRetries: 3
  backoffMs: [1000, 2000, 3000]

services:
  postgres:
    description: "PostgreSQL test container"
    healthCheck:
      command: "docker exec ${CONTAINER_NAME} pg_isready -U postgres"
      timeoutMs: 5000
    recover:
      - command: "docker start ${CONTAINER_NAME}"
        timeoutMs: 15000
      - command: "sleep 2"
        timeoutMs: 5000
        required: false
    verify:
      command: "docker exec ${CONTAINER_NAME} pg_isready -U postgres"
      timeoutMs: 5000
    maxRetries: 3
    backoffMs: [1000, 2000, 3000]
`;

// ============================================================================
// Helpers
// ============================================================================

function imageExists(): boolean {
  try {
    execSync('docker image inspect postgres:16-alpine', { stdio: 'ignore', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

function containerIsRunning(): boolean {
  try {
    const result = execSync(
      `docker inspect ${CONTAINER_NAME} --format='{{.State.Running}}'`,
      { encoding: 'utf-8', timeout: 5000 },
    );
    return result.trim() === 'true';
  } catch {
    return false;
  }
}

function removeContainer(): void {
  try {
    execSync(`docker rm -f ${CONTAINER_NAME}`, { timeout: 10000, stdio: 'ignore' });
  } catch {
    // Already removed
  }
}

function waitForHealthy(maxWaitMs: number = 20000): boolean {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      execSync(`docker exec ${CONTAINER_NAME} pg_isready -U postgres`, {
        timeout: 3000,
        stdio: 'ignore',
      });
      return true;
    } catch {
      execSync('sleep 1', { timeout: 2000 });
    }
  }
  return false;
}

// ============================================================================
// Tests
// ============================================================================

const skip = !imageExists();

if (skip) {
  console.warn(
    '\n⚠️  DOCKER TESTS SKIPPED: postgres:16-alpine image not available.\n' +
    '   These 5 tests prove real container recovery and are critical.\n' +
    '   Pull the image to run them: docker pull postgres:16-alpine\n',
  );
}

describe('Infrastructure Self-Healing: Real Docker Integration', () => {
  beforeAll(() => {
    if (skip) return;
    removeContainer();
    execSync(
      `docker run -d --name ${CONTAINER_NAME} -e POSTGRES_PASSWORD=${PG_PASSWORD} -p ${PG_PORT}:5432 postgres:16-alpine`,
      { timeout: 30000 },
    );
    const healthy = waitForHealthy();
    if (!healthy) throw new Error('PostgreSQL container failed to start');
    console.log(`[setup] Container "${CONTAINER_NAME}" healthy on port ${PG_PORT}`);
  }, TIMEOUT);

  afterAll(() => {
    if (skip) return;
    removeContainer();
    console.log(`[teardown] Removed "${CONTAINER_NAME}"`);
  }, TIMEOUT);

  // --------------------------------------------------------------------------
  // 1. ShellCommandRunner health check against real postgres
  // --------------------------------------------------------------------------

  it.skipIf(skip)('ShellCommandRunner detects healthy postgres', async () => {
    const runner = new ShellCommandRunner();
    const result = await runner.run(
      `docker exec ${CONTAINER_NAME} pg_isready -U postgres`,
      5000,
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('accepting connections');
    console.log(`  exit=${result.exitCode} duration=${result.durationMs}ms stdout="${result.stdout.trim()}"`);
  }, 10000);

  it.skipIf(skip)('ShellCommandRunner detects stopped postgres', async () => {
    execSync(`docker stop ${CONTAINER_NAME}`, { timeout: 15000 });
    expect(containerIsRunning()).toBe(false);

    const runner = new ShellCommandRunner();
    const result = await runner.run(
      `docker exec ${CONTAINER_NAME} pg_isready -U postgres`,
      5000,
    );

    expect(result.exitCode).not.toBe(0);
    console.log(`  exit=${result.exitCode} (container stopped)`);

    // Restore for next tests
    execSync(`docker start ${CONTAINER_NAME}`, { timeout: 15000 });
    expect(waitForHealthy()).toBe(true);
  }, TIMEOUT);

  // --------------------------------------------------------------------------
  // 2. InfraHealingOrchestrator: stop container, detect, recover, verify
  // --------------------------------------------------------------------------

  it.skipIf(skip)('recovers a stopped postgres container via playbook', async () => {
    const runner = new ShellCommandRunner();
    const orchestrator = createInfraHealingOrchestratorSync({
      commandRunner: runner,
      playbook: PLAYBOOK,
    });

    // -- STOP the container --
    execSync(`docker stop ${CONTAINER_NAME}`, { timeout: 15000 });
    expect(containerIsRunning()).toBe(false);
    console.log('  [1] Container STOPPED');

    // -- FEED test output with connection error --
    // Use standard postgres port (5432) in the error message so the observer
    // classifies it as 'postgres' (the playbook entry uses docker exec, not TCP port)
    orchestrator.feedTestOutput(
      'FAIL src/users/create.test.ts\n  Error: connect ECONNREFUSED 127.0.0.1:5432\nTests: 1 failed',
    );
    expect(orchestrator.getObserver().getFailingServices().has('postgres')).toBe(true);
    console.log('  [2] Observer detected postgres failure');

    // -- RUN recovery cycle --
    const results = await orchestrator.runRecoveryCycle();
    console.log('  [3] Recovery cycle complete');

    expect(results).toHaveLength(1);
    const pgResult = results[0];
    expect(pgResult.serviceName).toBe('postgres');
    expect(pgResult.recovered).toBe(true);
    console.log(`  [3] recovered=${pgResult.recovered} attempts=${pgResult.totalAttempts} duration=${pgResult.totalDurationMs}ms`);

    // -- VERIFY container is actually running again --
    expect(containerIsRunning()).toBe(true);
    expect(waitForHealthy(10000)).toBe(true);
    console.log('  [4] Container is RUNNING and HEALTHY');

    // -- CHECK stats --
    const stats = orchestrator.getStats();
    expect(stats.recoveriesAttempted).toBe(1);
    expect(stats.recoveriesSucceeded).toBe(1);
    expect(stats.recoveriesFailed).toBe(0);
    console.log(`  [stats] attempted=${stats.recoveriesAttempted} succeeded=${stats.recoveriesSucceeded} failed=${stats.recoveriesFailed}`);
  }, TIMEOUT);

  // --------------------------------------------------------------------------
  // 3. Full Strange Loop cycle: observe → decide → act with real Docker
  // --------------------------------------------------------------------------

  it.skipIf(skip)('full Strange Loop cycle recovers stopped postgres', async () => {
    const runner = new ShellCommandRunner();
    const provider = new InMemoryAgentProvider('obs-0');
    const executor = new NoOpActionExecutor();

    const { orchestrator, infraHealing } = createStrangeLoopWithInfraHealing({
      provider,
      executor,
      commandRunner: runner,
      playbook: PLAYBOOK,
      config: { actionCooldownMs: 0, maxActionsPerCycle: 10 },
    });

    // -- STOP postgres --
    execSync(`docker stop ${CONTAINER_NAME}`, { timeout: 15000 });
    expect(containerIsRunning()).toBe(false);
    console.log('  [1] Container STOPPED');

    // -- FEED error output --
    infraHealing.feedTestOutput(
      'FAIL src/db.test.ts\n  Error: connect ECONNREFUSED 127.0.0.1:5432\nTests: 1 failed',
    );
    console.log('  [2] Fed test output');

    // -- RUN Strange Loop cycle --
    const cycle = await orchestrator.runCycle();
    console.log('  [3] Strange Loop cycle complete');

    // Verify infra vulnerabilities detected
    const infraVulns = cycle.observation.vulnerabilities.filter(
      (v) => v.affectedAgents.some((a) => a.startsWith('infra-')),
    );
    expect(infraVulns.length).toBeGreaterThan(0);
    console.log(`  [3] Infra vulnerabilities: ${infraVulns.length}`);
    for (const v of infraVulns) {
      console.log(`      type=${v.type} severity=${v.severity} agents=${v.affectedAgents}`);
    }

    // Verify restart_service was executed
    const restartResults = cycle.results.filter(
      (r) => r.action.type === 'restart_service' && r.action.targetAgentId?.startsWith('infra-'),
    );
    expect(restartResults.length).toBeGreaterThan(0);
    console.log(`  [3] restart_service results: ${restartResults.length}`);
    for (const r of restartResults) {
      console.log(`      target=${r.action.targetAgentId} success=${r.success}`);
    }

    // -- VERIFY postgres is back --
    expect(waitForHealthy(15000)).toBe(true);
    expect(containerIsRunning()).toBe(true);
    console.log('  [4] Container is RUNNING and HEALTHY');

    // -- CHECK infra healing stats --
    const stats = infraHealing.getStats();
    expect(stats.infraFailuresDetected).toBeGreaterThan(0);
    expect(stats.recoveriesAttempted).toBeGreaterThan(0);
    expect(stats.recoveriesSucceeded).toBeGreaterThan(0);
    console.log(`  [stats] failures=${stats.infraFailuresDetected} attempted=${stats.recoveriesAttempted} succeeded=${stats.recoveriesSucceeded}`);
  }, TIMEOUT);

  // --------------------------------------------------------------------------
  // 4. Already-healthy path (no recovery needed)
  // --------------------------------------------------------------------------

  it.skipIf(skip)('skips recovery when postgres is already healthy', async () => {
    // Container should be running from previous test
    expect(containerIsRunning()).toBe(true);

    const runner = new ShellCommandRunner();
    const orchestrator = createInfraHealingOrchestratorSync({
      commandRunner: runner,
      playbook: PLAYBOOK,
    });

    // Feed error even though postgres is up
    orchestrator.feedTestOutput('Error: connect ECONNREFUSED 127.0.0.1:5432');
    const results = await orchestrator.runRecoveryCycle();

    expect(results).toHaveLength(1);
    expect(results[0].recovered).toBe(true);
    expect(results[0].totalAttempts).toBe(1);
    // Health check passed → zero recovery commands executed
    expect(results[0].attempts[0].recoveryResults).toHaveLength(0);
    console.log('  Service was already healthy — recovery commands skipped');
  }, 15000);
});
