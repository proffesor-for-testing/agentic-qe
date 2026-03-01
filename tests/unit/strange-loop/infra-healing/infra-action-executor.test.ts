/**
 * Infrastructure Action Executor Tests
 * ADR-057: Infrastructure Self-Healing Extension
 *
 * Tests for the recovery cycle: healthCheck → recover → backoff → verify.
 * Uses NoOpCommandRunner for deterministic testing.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  InfraActionExecutor,
  createInfraActionExecutor,
  NoOpCommandRunner,
} from '../../../../src/strange-loop/infra-healing/infra-action-executor.js';
import {
  RecoveryPlaybook,
  createRecoveryPlaybook,
} from '../../../../src/strange-loop/infra-healing/recovery-playbook.js';
import {
  CoordinationLock,
  createCoordinationLock,
} from '../../../../src/strange-loop/infra-healing/coordination-lock.js';

// ============================================================================
// Test YAML
// ============================================================================

const TEST_PLAYBOOK = `
version: "1.0.0"
defaults:
  timeoutMs: 5000
  maxRetries: 2
  backoffMs: [100, 200]

services:
  postgres:
    description: "PostgreSQL"
    healthCheck:
      command: "pg_isready"
      timeoutMs: 3000
    recover:
      - command: "docker compose up -d postgres"
        timeoutMs: 10000
      - command: "sleep 1"
        timeoutMs: 2000
        required: false
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

function createTestComponents() {
  const runner = new NoOpCommandRunner();
  const playbook = createRecoveryPlaybook();
  playbook.loadFromString(TEST_PLAYBOOK);
  const lock = createCoordinationLock(60_000);
  const executor = createInfraActionExecutor(runner, playbook, lock);
  return { runner, playbook, lock, executor };
}

// ============================================================================
// Infrastructure Action Executor Tests
// ============================================================================

describe('InfraActionExecutor', () => {
  let runner: NoOpCommandRunner;
  let lock: CoordinationLock;
  let executor: InfraActionExecutor;

  beforeEach(() => {
    const components = createTestComponents();
    runner = components.runner;
    lock = components.lock;
    executor = components.executor;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // Factory
  // ==========================================================================

  describe('createInfraActionExecutor', () => {
    it('creates an executor', () => {
      const components = createTestComponents();
      expect(components.executor).toBeInstanceOf(InfraActionExecutor);
    });
  });

  // ==========================================================================
  // NoOpCommandRunner
  // ==========================================================================

  describe('NoOpCommandRunner', () => {
    it('returns success by default', async () => {
      const noopRunner = new NoOpCommandRunner();
      const result = await noopRunner.run('any command', 5000);
      expect(result.exitCode).toBe(0);
      expect(result.timedOut).toBe(false);
    });

    it('returns configured response for exact command match', async () => {
      const noopRunner = new NoOpCommandRunner();
      noopRunner.setResponse('fail-cmd', { exitCode: 1, stderr: 'error' });
      const result = await noopRunner.run('fail-cmd', 5000);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toBe('error');
    });

    it('matches command prefix', async () => {
      const noopRunner = new NoOpCommandRunner();
      noopRunner.setResponse('pg_isready', { exitCode: 1 });
      const result = await noopRunner.run('pg_isready -h localhost', 5000);
      expect(result.exitCode).toBe(1);
    });

    it('logs all calls', async () => {
      const noopRunner = new NoOpCommandRunner();
      await noopRunner.run('cmd1', 1000);
      await noopRunner.run('cmd2', 2000);
      const calls = noopRunner.getCalls();
      expect(calls).toHaveLength(2);
      expect(calls[0]).toEqual({ command: 'cmd1', timeoutMs: 1000 });
      expect(calls[1]).toEqual({ command: 'cmd2', timeoutMs: 2000 });
    });

    it('resets state', async () => {
      const noopRunner = new NoOpCommandRunner();
      noopRunner.setResponse('cmd', { exitCode: 1 });
      await noopRunner.run('cmd', 1000);
      noopRunner.reset();
      expect(noopRunner.getCalls()).toHaveLength(0);
      const result = await noopRunner.run('cmd', 1000);
      expect(result.exitCode).toBe(0); // default after reset
    });
  });

  // ==========================================================================
  // Recovery: Service Already Healthy
  // ==========================================================================

  describe('service already healthy', () => {
    it('skips recovery when health check passes', async () => {
      // Default NoOp returns exitCode=0 (healthy)
      const result = await executor.recoverService('postgres', 'action-1');
      expect(result.recovered).toBe(true);
      expect(result.totalAttempts).toBe(1);
      expect(result.attempts[0].success).toBe(true);
      expect(result.attempts[0].recoveryResults).toHaveLength(0);
    });
  });

  // ==========================================================================
  // Recovery: Successful After Commands
  // ==========================================================================

  describe('successful recovery', () => {
    it('runs health check, recovery commands, and verify', async () => {
      // Health check fails, recovery commands succeed, verify succeeds
      runner.setResponse('pg_isready', { exitCode: 1, stderr: 'not ready' });
      runner.setResponse('docker compose up -d postgres', { exitCode: 0 });
      runner.setResponse('sleep 1', { exitCode: 0 });

      // Override verify to succeed (pg_isready exact match already set to fail,
      // but we need the verify to pass — so we remove the general override
      // and use a more specific approach)
      runner.reset();
      let healthCheckCalls = 0;
      const origRun = runner.run.bind(runner);
      vi.spyOn(runner, 'run').mockImplementation(async (cmd, timeout) => {
        if (cmd === 'pg_isready') {
          healthCheckCalls++;
          // First call (health check) fails, second call (verify) succeeds
          return {
            exitCode: healthCheckCalls === 1 ? 1 : 0,
            stdout: '',
            stderr: healthCheckCalls === 1 ? 'not ready' : '',
            durationMs: 10,
            timedOut: false,
          };
        }
        return { exitCode: 0, stdout: '', stderr: '', durationMs: 10, timedOut: false };
      });

      const result = await executor.recoverService('postgres', 'action-1');
      expect(result.recovered).toBe(true);
      expect(result.totalAttempts).toBe(1);
      expect(result.escalated).toBe(false);
    });
  });

  // ==========================================================================
  // Recovery: Failed After All Retries
  // ==========================================================================

  describe('failed recovery', () => {
    it('reports failure after exhausting retries', async () => {
      // All commands fail
      vi.spyOn(runner, 'run').mockResolvedValue({
        exitCode: 1,
        stdout: '',
        stderr: 'still down',
        durationMs: 10,
        timedOut: false,
      });

      const result = await executor.recoverService('postgres', 'action-1');
      expect(result.recovered).toBe(false);
      expect(result.totalAttempts).toBe(2); // maxRetries=2
      expect(result.escalated).toBe(true);
    });

    it('stops on required recovery command failure', async () => {
      let callCount = 0;
      vi.spyOn(runner, 'run').mockImplementation(async () => {
        callCount++;
        // Health check fails (1), docker compose fails (2)
        return {
          exitCode: 1,
          stdout: '',
          stderr: 'failed',
          durationMs: 10,
          timedOut: false,
        };
      });

      const result = await executor.recoverService('postgres', 'action-1');
      expect(result.recovered).toBe(false);
      // Should have errored on the required recovery command
      expect(result.attempts[0].error).toContain('Required recovery command failed');
    });
  });

  // ==========================================================================
  // Recovery: Non-required Command Failure
  // ==========================================================================

  describe('non-required command failure', () => {
    it('continues recovery when non-required command fails', async () => {
      let callIndex = 0;
      vi.spyOn(runner, 'run').mockImplementation(async () => {
        callIndex++;
        // 1: health check fails, 2: docker compose succeeds,
        // 3: sleep fails (non-required), 4: verify succeeds
        const exitCode = callIndex === 1 ? 1 : callIndex === 3 ? 1 : 0;
        return { exitCode, stdout: '', stderr: '', durationMs: 10, timedOut: false };
      });

      const result = await executor.recoverService('postgres', 'action-1');
      expect(result.recovered).toBe(true);
    });
  });

  // ==========================================================================
  // Coordination Lock
  // ==========================================================================

  describe('lock coordination', () => {
    it('acquires and releases lock during recovery', async () => {
      await executor.recoverService('postgres', 'action-1');
      // Lock should be released after recovery
      expect(lock.isLocked('postgres')).toBe(false);
    });

    it('returns early when lock is already held', async () => {
      lock.acquire('postgres', 'other-action');
      const result = await executor.recoverService('postgres', 'action-1');
      expect(result.recovered).toBe(false);
      expect(result.totalAttempts).toBe(0);
    });

    it('releases lock even when recovery throws', async () => {
      vi.spyOn(runner, 'run').mockRejectedValue(new Error('crash'));
      try {
        await executor.recoverService('postgres', 'action-1');
      } catch {
        // expected
      }
      // Lock should still be released via finally
      expect(lock.isLocked('postgres')).toBe(false);
    });
  });

  // ==========================================================================
  // Unknown Service
  // ==========================================================================

  describe('unknown service', () => {
    it('returns escalated result for service not in playbook', async () => {
      const result = await executor.recoverService('nonexistent', 'action-1');
      expect(result.recovered).toBe(false);
      expect(result.totalAttempts).toBe(0);
      expect(result.escalated).toBe(true);
    });
  });

  // ==========================================================================
  // Statistics
  // ==========================================================================

  describe('getStats()', () => {
    it('tracks recoveries attempted', async () => {
      await executor.recoverService('postgres', 'action-1');
      const stats = executor.getStats();
      expect(stats.recoveriesAttempted).toBe(1);
    });

    it('tracks successful recoveries', async () => {
      // Default NoOp returns healthy
      await executor.recoverService('postgres', 'action-1');
      const stats = executor.getStats();
      expect(stats.recoveriesSucceeded).toBe(1);
    });

    it('tracks failed recoveries', async () => {
      vi.spyOn(runner, 'run').mockResolvedValue({
        exitCode: 1,
        stdout: '',
        stderr: 'failed',
        durationMs: 10,
        timedOut: false,
      });
      await executor.recoverService('postgres', 'action-1');
      const stats = executor.getStats();
      expect(stats.recoveriesFailed).toBe(1);
    });

    it('tracks lock contention events', async () => {
      lock.acquire('postgres', 'blocker');
      await executor.recoverService('postgres', 'action-1');
      const stats = executor.getStats();
      expect(stats.lockContentionEvents).toBe(1);
    });

    it('tracks per-service stats', async () => {
      await executor.recoverService('postgres', 'action-1');
      await executor.recoverService('redis', 'action-2');
      const stats = executor.getStats();
      expect(stats.byService['postgres']).toBeDefined();
      expect(stats.byService['redis']).toBeDefined();
    });
  });
});
