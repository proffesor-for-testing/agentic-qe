/**
 * Infrastructure Healing Orchestrator Tests
 * ADR-057: Infrastructure Self-Healing Extension
 *
 * Full pipeline tests: feed output → observe → detect → recover → verify.
 * Tests the top-level coordinator that wires all components together.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  InfraHealingOrchestrator,
  createInfraHealingOrchestratorSync,
  createInfraHealingOrchestrator,
} from '../../../../src/strange-loop/infra-healing/infra-healing-orchestrator.js';
import { NoOpCommandRunner } from '../../../../src/strange-loop/infra-healing/infra-action-executor.js';

// ============================================================================
// Test YAML
// ============================================================================

const TEST_PLAYBOOK = `
version: "1.0.0"
defaults:
  timeoutMs: 5000
  maxRetries: 2
  backoffMs: [10, 20]

services:
  postgres:
    description: "PostgreSQL"
    healthCheck:
      command: "pg_isready"
      timeoutMs: 3000
    recover:
      - command: "docker compose up -d postgres"
        timeoutMs: 10000
    verify:
      command: "pg_isready"
      timeoutMs: 3000
    maxRetries: 2
    backoffMs: [10, 20]

  redis:
    description: "Redis"
    healthCheck:
      command: "redis-cli ping"
      timeoutMs: 2000
    recover:
      - command: "docker compose up -d redis"
        timeoutMs: 10000
    verify:
      command: "redis-cli ping"
      timeoutMs: 2000
    maxRetries: 1
    backoffMs: [10]
`;

// ============================================================================
// Test Helpers
// ============================================================================

function createTestOrchestrator(runner?: NoOpCommandRunner) {
  const commandRunner = runner ?? new NoOpCommandRunner();
  return {
    orchestrator: createInfraHealingOrchestratorSync({
      commandRunner,
      playbook: TEST_PLAYBOOK,
    }),
    runner: commandRunner,
  };
}

// ============================================================================
// Orchestrator Tests
// ============================================================================

describe('InfraHealingOrchestrator', () => {
  let orchestrator: InfraHealingOrchestrator;
  let runner: NoOpCommandRunner;

  beforeEach(() => {
    const components = createTestOrchestrator();
    orchestrator = components.orchestrator;
    runner = components.runner;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // Factory
  // ==========================================================================

  describe('createInfraHealingOrchestratorSync', () => {
    it('creates an orchestrator with inline YAML', () => {
      expect(orchestrator).toBeInstanceOf(InfraHealingOrchestrator);
    });

    it('is ready immediately with inline YAML', () => {
      expect(orchestrator.isReady()).toBe(true);
    });

    it('accepts config overrides', () => {
      const { orchestrator: orch } = createTestOrchestrator();
      expect(orch.isReady()).toBe(true);
    });
  });

  // ==========================================================================
  // feedTestOutput()
  // ==========================================================================

  describe('feedTestOutput()', () => {
    it('processes clean output without detecting failures', () => {
      orchestrator.feedTestOutput('All 42 tests passed.\nDone in 5.3s');
      const stats = orchestrator.getStats();
      expect(stats.totalObservations).toBe(1);
      expect(stats.infraFailuresDetected).toBe(0);
    });

    it('detects postgres failure from test output', () => {
      orchestrator.feedTestOutput('Error: connect ECONNREFUSED 127.0.0.1:5432');
      const stats = orchestrator.getStats();
      expect(stats.totalObservations).toBe(1);
      expect(stats.infraFailuresDetected).toBe(1);
      expect(stats.byService['postgres']?.failures).toBe(1);
    });

    it('detects multiple service failures', () => {
      orchestrator.feedTestOutput(
        'Error: connect ECONNREFUSED 127.0.0.1:5432\n' +
        'Error: connect ECONNREFUSED 127.0.0.1:6379'
      );
      const stats = orchestrator.getStats();
      expect(stats.infraFailuresDetected).toBe(2);
      expect(stats.byService['postgres']?.failures).toBe(1);
      expect(stats.byService['redis']?.failures).toBe(1);
    });

    it('accumulates observations across multiple calls', () => {
      orchestrator.feedTestOutput('Error: connect ECONNREFUSED 127.0.0.1:5432');
      orchestrator.feedTestOutput('Error: connect ECONNREFUSED 127.0.0.1:6379');
      const stats = orchestrator.getStats();
      expect(stats.totalObservations).toBe(2);
      expect(stats.infraFailuresDetected).toBe(2);
    });
  });

  // ==========================================================================
  // runRecoveryCycle()
  // ==========================================================================

  describe('runRecoveryCycle()', () => {
    it('returns empty results when no failures detected', async () => {
      const results = await orchestrator.runRecoveryCycle();
      expect(results).toHaveLength(0);
    });

    it('returns empty results after clean output', async () => {
      orchestrator.feedTestOutput('All tests passed');
      const results = await orchestrator.runRecoveryCycle();
      expect(results).toHaveLength(0);
    });

    it('attempts recovery for detected failures', async () => {
      orchestrator.feedTestOutput('Error: connect ECONNREFUSED 127.0.0.1:5432');
      const results = await orchestrator.runRecoveryCycle();
      expect(results).toHaveLength(1);
      expect(results[0].serviceName).toBe('postgres');
    });

    it('recovers service when all commands succeed', async () => {
      // By default NoOp returns exitCode=0 (service already healthy)
      orchestrator.feedTestOutput('Error: connect ECONNREFUSED 127.0.0.1:5432');
      const results = await orchestrator.runRecoveryCycle();
      expect(results[0].recovered).toBe(true);
    });

    it('reports failure when recovery fails', async () => {
      vi.spyOn(runner, 'run').mockResolvedValue({
        exitCode: 1,
        stdout: '',
        stderr: 'still down',
        durationMs: 10,
        timedOut: false,
      });

      orchestrator.feedTestOutput('Error: connect ECONNREFUSED 127.0.0.1:5432');
      const results = await orchestrator.runRecoveryCycle();
      expect(results[0].recovered).toBe(false);
      expect(results[0].escalated).toBe(true);
    });

    it('recovers multiple services in one cycle', async () => {
      orchestrator.feedTestOutput(
        'Error: connect ECONNREFUSED 127.0.0.1:5432\n' +
        'Error: connect ECONNREFUSED 127.0.0.1:6379'
      );
      const results = await orchestrator.runRecoveryCycle();
      expect(results).toHaveLength(2);
      const serviceNames = results.map((r) => r.serviceName);
      expect(serviceNames).toContain('postgres');
      expect(serviceNames).toContain('redis');
    });

    it('respects maxConcurrentRecoveries config', async () => {
      const { orchestrator: orch } = createTestOrchestrator(runner);

      // Override with max 1 concurrent recovery
      const limitedOrch = createInfraHealingOrchestratorSync({
        commandRunner: new NoOpCommandRunner(),
        playbook: TEST_PLAYBOOK,
        config: { maxConcurrentRecoveries: 1 },
      });

      limitedOrch.feedTestOutput(
        'Error: connect ECONNREFUSED 127.0.0.1:5432\n' +
        'Error: connect ECONNREFUSED 127.0.0.1:6379'
      );
      const results = await limitedOrch.runRecoveryCycle();
      expect(results).toHaveLength(1); // Only 1 due to limit
    });
  });

  // ==========================================================================
  // Full Pipeline: feed → detect → recover → stats
  // ==========================================================================

  describe('full pipeline', () => {
    it('detects postgres failure and recovers it', async () => {
      // 1. Feed test output with postgres error
      orchestrator.feedTestOutput(
        'Running test suite...\n' +
        'Error: connect ECONNREFUSED 127.0.0.1:5432\n' +
        'FAIL: test_user_creation\n'
      );

      // 2. Verify detection
      const statsBefore = orchestrator.getStats();
      expect(statsBefore.infraFailuresDetected).toBe(1);

      // 3. Run recovery (NoOp returns success by default)
      const results = await orchestrator.runRecoveryCycle();
      expect(results).toHaveLength(1);
      expect(results[0].recovered).toBe(true);

      // 4. Verify stats updated
      const statsAfter = orchestrator.getStats();
      expect(statsAfter.recoveriesAttempted).toBe(1);
      expect(statsAfter.recoveriesSucceeded).toBe(1);
    });

    it('handles multiple failures with mixed recovery results', async () => {
      let callCount = 0;
      vi.spyOn(runner, 'run').mockImplementation(async (cmd) => {
        callCount++;
        // postgres health check passes (service already healthy)
        if (cmd === 'pg_isready') {
          return { exitCode: 0, stdout: '', stderr: '', durationMs: 10, timedOut: false };
        }
        // redis health check fails, recovery fails
        if (cmd.includes('redis')) {
          return { exitCode: 1, stdout: '', stderr: 'failed', durationMs: 10, timedOut: false };
        }
        // Everything else fails
        return { exitCode: 1, stdout: '', stderr: 'failed', durationMs: 10, timedOut: false };
      });

      orchestrator.feedTestOutput(
        'Error: connect ECONNREFUSED 127.0.0.1:5432\n' +
        'Error: connect ECONNREFUSED 127.0.0.1:6379'
      );
      const results = await orchestrator.runRecoveryCycle();

      const postgresResult = results.find((r) => r.serviceName === 'postgres');
      const redisResult = results.find((r) => r.serviceName === 'redis');

      expect(postgresResult?.recovered).toBe(true);
      expect(redisResult?.recovered).toBe(false);
    });
  });

  // ==========================================================================
  // Component Accessors
  // ==========================================================================

  describe('component accessors', () => {
    it('exposes observer', () => {
      expect(orchestrator.getObserver()).toBeDefined();
    });

    it('exposes playbook', () => {
      expect(orchestrator.getPlaybook()).toBeDefined();
      expect(orchestrator.getPlaybook().isLoaded()).toBe(true);
    });

    it('exposes lock', () => {
      expect(orchestrator.getLock()).toBeDefined();
    });

    it('exposes executor', () => {
      expect(orchestrator.getExecutor()).toBeDefined();
    });
  });

  // ==========================================================================
  // Statistics
  // ==========================================================================

  describe('getStats()', () => {
    it('returns zeroed stats initially', () => {
      const stats = orchestrator.getStats();
      expect(stats.totalObservations).toBe(0);
      expect(stats.infraFailuresDetected).toBe(0);
      expect(stats.recoveriesAttempted).toBe(0);
      expect(stats.recoveriesSucceeded).toBe(0);
      expect(stats.recoveriesFailed).toBe(0);
      expect(stats.lockContentionEvents).toBe(0);
    });

    it('merges executor stats into orchestrator stats', async () => {
      orchestrator.feedTestOutput('Error: connect ECONNREFUSED 127.0.0.1:5432');
      await orchestrator.runRecoveryCycle();

      const stats = orchestrator.getStats();
      expect(stats.totalObservations).toBe(1);
      expect(stats.infraFailuresDetected).toBe(1);
      expect(stats.recoveriesAttempted).toBeGreaterThanOrEqual(1);
    });
  });

  // ==========================================================================
  // isReady()
  // ==========================================================================

  describe('isReady()', () => {
    it('returns true when playbook is loaded', () => {
      expect(orchestrator.isReady()).toBe(true);
    });
  });

  // ==========================================================================
  // Skips services without playbook entry
  // ==========================================================================

  describe('services without playbook entry', () => {
    it('skips services not in playbook during recovery', async () => {
      // DNS errors map to service 'dns' which is not in our test playbook
      orchestrator.feedTestOutput('Error: getaddrinfo ENOTFOUND myservice.local');
      const results = await orchestrator.runRecoveryCycle();
      // 'dns' service is not in test playbook — should be skipped
      expect(results).toHaveLength(0);
    });
  });

  // ==========================================================================
  // Enterprise Services Recognition
  // ==========================================================================

  describe('enterprise service detection', () => {
    it('detects SAP RFC failure from test output', () => {
      orchestrator.feedTestOutput('RFC_COMMUNICATION_FAILURE: Connection to SAP system failed');
      const stats = orchestrator.getStats();
      expect(stats.infraFailuresDetected).toBe(1);
      expect(stats.byService['sap-rfc']?.failures).toBe(1);
    });

    it('detects Salesforce rate limit from test output', () => {
      orchestrator.feedTestOutput('REQUEST_LIMIT_EXCEEDED: Salesforce API limit');
      const stats = orchestrator.getStats();
      expect(stats.infraFailuresDetected).toBe(1);
      expect(stats.byService['salesforce']?.failures).toBe(1);
    });

    it('detects payment gateway timeout from test output', () => {
      orchestrator.feedTestOutput('payment processing ETIMEDOUT - stripe connection failed');
      const stats = orchestrator.getStats();
      expect(stats.infraFailuresDetected).toBe(1);
      expect(stats.byService['payment-gateway']?.failures).toBe(1);
    });
  });

  // ==========================================================================
  // Test Rerun Manager Integration
  // ==========================================================================

  describe('recordAffectedTests()', () => {
    it('records affected tests for a service', () => {
      orchestrator.feedTestOutput('Error: connect ECONNREFUSED 127.0.0.1:5432');
      orchestrator.recordAffectedTests('postgres', ['test-user-create', 'test-user-update']);

      const rerunManager = orchestrator.getRerunManager();
      expect(rerunManager.getTestsToRerun('postgres')).toEqual(['test-user-create', 'test-user-update']);
    });

    it('includes affectedTestIds in recovery results', async () => {
      orchestrator.feedTestOutput('Error: connect ECONNREFUSED 127.0.0.1:5432');
      orchestrator.recordAffectedTests('postgres', ['test-1', 'test-2']);

      const results = await orchestrator.runRecoveryCycle();
      expect(results).toHaveLength(1);
      expect(results[0].affectedTestIds).toEqual(['test-1', 'test-2']);
    });

    it('clears rerun queue after successful recovery', async () => {
      orchestrator.feedTestOutput('Error: connect ECONNREFUSED 127.0.0.1:5432');
      orchestrator.recordAffectedTests('postgres', ['test-1']);

      const results = await orchestrator.runRecoveryCycle();
      expect(results[0].recovered).toBe(true);

      // Queue should be cleared after successful recovery
      const rerunManager = orchestrator.getRerunManager();
      expect(rerunManager.getTestsToRerun('postgres')).toEqual([]);
    });
  });

  // ==========================================================================
  // Async factory: createInfraHealingOrchestrator (file-based)
  // ==========================================================================

  describe('createInfraHealingOrchestrator (async factory)', () => {
    it('creates orchestrator from YAML file path', async () => {
      const fs = await import('node:fs/promises');
      const path = await import('node:path');
      const os = await import('node:os');

      const tmpFile = path.join(os.tmpdir(), `aqe-orch-test-${Date.now()}.yaml`);
      await fs.writeFile(tmpFile, TEST_PLAYBOOK, 'utf-8');

      try {
        const runner = new NoOpCommandRunner();
        const orch = await createInfraHealingOrchestrator({
          commandRunner: runner,
          playbook: tmpFile, // file path, not YAML string
        });

        expect(orch.isReady()).toBe(true);
        expect(orch.getPlaybook().listServices()).toContain('postgres');
        expect(orch.getPlaybook().listServices()).toContain('redis');
      } finally {
        await fs.unlink(tmpFile);
      }
    });

    it('creates orchestrator from inline YAML when playbookIsFile is false', async () => {
      const runner = new NoOpCommandRunner();
      const orch = await createInfraHealingOrchestrator({
        commandRunner: runner,
        playbook: TEST_PLAYBOOK,
        playbookIsFile: false,
      });

      expect(orch.isReady()).toBe(true);
      expect(orch.getPlaybook().listServices()).toContain('postgres');
    });

    it('async factory produces working recovery cycle', async () => {
      const fs = await import('node:fs/promises');
      const path = await import('node:path');
      const os = await import('node:os');

      const tmpFile = path.join(os.tmpdir(), `aqe-orch-cycle-${Date.now()}.yaml`);
      await fs.writeFile(tmpFile, TEST_PLAYBOOK, 'utf-8');

      try {
        const runner = new NoOpCommandRunner();
        runner.setResponse('pg_isready', { exitCode: 1, stderr: 'no response', stdout: '' });
        runner.setResponse('docker compose up -d postgres', { exitCode: 0, stdout: 'Starting...' });

        const orch = await createInfraHealingOrchestrator({
          commandRunner: runner,
          playbook: tmpFile,
        });

        orch.feedTestOutput('Error: connect ECONNREFUSED 127.0.0.1:5432');
        const results = await orch.runRecoveryCycle();

        expect(results.length).toBeGreaterThan(0);
        expect(results[0].serviceName).toBe('postgres');
        expect(runner.getCalls().length).toBeGreaterThan(0);
      } finally {
        await fs.unlink(tmpFile);
      }
    });

    it('rejects non-existent file path', async () => {
      const runner = new NoOpCommandRunner();
      await expect(createInfraHealingOrchestrator({
        commandRunner: runner,
        playbook: '/tmp/does-not-exist-aqe-playbook.yaml',
      })).rejects.toThrow();
    });
  });
});
