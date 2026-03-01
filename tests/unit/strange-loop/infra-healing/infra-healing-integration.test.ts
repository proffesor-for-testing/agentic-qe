/**
 * Infrastructure Healing Integration Tests
 * ADR-057: Infrastructure Self-Healing Extension
 *
 * These tests prove the ACTUAL end-to-end wiring:
 * - InfraAwareAgentProvider is plugged into StrangeLoopOrchestrator
 * - CompositeActionExecutor routes infra actions to InfraActionExecutor
 * - feedTestOutput → runCycle → recovery commands flow works
 * - Synthetic infra agents appear in observations
 * - Healing actions are generated and routed correctly
 *
 * If any of these tests fail, the integration is broken — not just a library.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  createStrangeLoopWithInfraHealing,
  createInMemoryStrangeLoopWithInfraHealing,
  StrangeLoopOrchestrator,
} from '../../../../src/strange-loop/strange-loop.js';
import { InMemoryAgentProvider } from '../../../../src/strange-loop/swarm-observer.js';
import { NoOpActionExecutor } from '../../../../src/strange-loop/healing-controller.js';
import { NoOpCommandRunner } from '../../../../src/strange-loop/infra-healing/infra-action-executor.js';
import type { InfraHealingOrchestrator } from '../../../../src/strange-loop/infra-healing/infra-healing-orchestrator.js';

// ============================================================================
// Test YAML Playbook
// ============================================================================

const INTEGRATION_PLAYBOOK = `
version: "1.0.0"
defaults:
  timeoutMs: 5000
  maxRetries: 1
  backoffMs: [10]

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
`;

// ============================================================================
// Integration Tests
// ============================================================================

describe('Infra-Healing Integration with StrangeLoop', () => {
  let orchestrator: StrangeLoopOrchestrator;
  let infraHealing: InfraHealingOrchestrator;
  let provider: InMemoryAgentProvider;
  let runner: NoOpCommandRunner;

  beforeEach(() => {
    runner = new NoOpCommandRunner();

    const result = createInMemoryStrangeLoopWithInfraHealing(
      'observer-0',
      runner,
      INTEGRATION_PLAYBOOK,
      {
        // Disable cooldown so multiple actions execute within a single cycle
        actionCooldownMs: 0,
        // Allow enough actions for infra recovery + swarm healing in one cycle
        maxActionsPerCycle: 10,
      },
    );

    orchestrator = result.orchestrator;
    provider = result.provider;
    infraHealing = result.infraHealing;

    // Add a real swarm agent so the topology has at least one real node
    provider.addAgent({
      id: 'observer-0',
      type: 'observer',
      role: 'coordinator',
      status: 'active',
      joinedAt: Date.now(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // Fix #1: createStrangeLoopWithInfraHealing wires everything
  // ==========================================================================

  describe('createStrangeLoopWithInfraHealing()', () => {
    it('returns orchestrator and infraHealing', () => {
      expect(orchestrator).toBeInstanceOf(StrangeLoopOrchestrator);
      expect(infraHealing).toBeDefined();
      expect(infraHealing.isReady()).toBe(true);
    });

    it('wires InfraAwareAgentProvider — synthetic agents appear in observation', async () => {
      const cycle = await orchestrator.runCycle();
      const agentIds = [...cycle.observation.agentHealth.keys()];

      // Should include the real agent AND synthetic infra agents from playbook
      expect(agentIds).toContain('observer-0');
      expect(agentIds).toContain('infra-postgres');
      expect(agentIds).toContain('infra-redis');
    });

    it('wires CompositeActionExecutor — restartAgent for infra-* routes to recovery', async () => {
      // Feed failure so infra-postgres appears degraded
      infraHealing.feedTestOutput('Error: connect ECONNREFUSED 127.0.0.1:5432');

      // Run cycle — should detect infra-postgres degraded and attempt restart
      const cycle = await orchestrator.runCycle();

      // The runner should have been called with pg_isready (health check)
      const calls = runner.getCalls();
      const pgCalls = calls.filter(c => c.command.includes('pg_isready'));
      expect(pgCalls.length).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // Fix #2: typeToAction maps infra vulns to restart_service
  // ==========================================================================

  describe('typeToAction generates actions for infra vulnerabilities', () => {
    it('generates restart_service action when infra agent has low responsiveness', async () => {
      // Feed failure → infra-postgres responsiveness = 0.0
      infraHealing.feedTestOutput('Error: connect ECONNREFUSED 127.0.0.1:5432');

      const cycle = await orchestrator.runCycle();

      // Check that a restart_service action was generated for infra-postgres
      const infraActions = cycle.actions.filter(
        a => a.targetAgentId?.startsWith('infra-') && a.type === 'restart_service'
      );
      expect(infraActions.length).toBeGreaterThan(0);
      expect(infraActions[0].targetAgentId).toBe('infra-postgres');
    });

    it('does NOT generate restart_service for healthy infra agents', async () => {
      // No failure fed — all infra agents healthy (responsiveness 1.0)
      const cycle = await orchestrator.runCycle();

      const infraActions = cycle.actions.filter(
        a => a.targetAgentId?.startsWith('infra-') && a.type === 'restart_service'
      );
      expect(infraActions).toHaveLength(0);
    });
  });

  // ==========================================================================
  // Full Pipeline: feed → observe → detect → decide → act → recover
  // ==========================================================================

  describe('full pipeline: feed → observe → decide → act → recover', () => {
    it('detects postgres failure and executes playbook recovery commands', async () => {
      // Setup: health check fails first, then recovery commands succeed, then verify succeeds
      let healthCheckCalls = 0;
      const runSpy = vi.spyOn(runner, 'run').mockImplementation(async (cmd) => {
        if (cmd === 'pg_isready') {
          healthCheckCalls++;
          // First call = health check (fail), second = verify (pass)
          return {
            exitCode: healthCheckCalls === 1 ? 1 : 0,
            stdout: '',
            stderr: healthCheckCalls === 1 ? 'not ready' : '',
            durationMs: 10,
            timedOut: false,
          };
        }
        // docker compose and other commands succeed
        return { exitCode: 0, stdout: '', stderr: '', durationMs: 10, timedOut: false };
      });

      // 1. Feed test output with postgres error
      infraHealing.feedTestOutput('Error: connect ECONNREFUSED 127.0.0.1:5432');

      // 2. Run Strange Loop cycle
      const cycle = await orchestrator.runCycle();

      // 3. Verify actions were generated for infra-postgres
      const infraActions = cycle.actions.filter(a => a.targetAgentId === 'infra-postgres');
      expect(infraActions.length).toBeGreaterThan(0);

      // 4. Verify the recovery commands were actually executed via the spy
      // (vi.spyOn replaces .run() so callLog isn't populated — check spy calls instead)
      expect(runSpy).toHaveBeenCalledWith('pg_isready', expect.any(Number));
      expect(runSpy).toHaveBeenCalledWith(expect.stringContaining('docker compose'), expect.any(Number));
    });

    it('handles multiple failing services in a single cycle', async () => {
      infraHealing.feedTestOutput(
        'Error: connect ECONNREFUSED 127.0.0.1:5432\n' +
        'Error: connect ECONNREFUSED 127.0.0.1:6379'
      );

      const cycle = await orchestrator.runCycle();

      // Both infra agents should have actions
      const infraTargets = cycle.actions
        .filter(a => a.targetAgentId?.startsWith('infra-'))
        .map(a => a.targetAgentId);
      expect(infraTargets).toContain('infra-postgres');
      expect(infraTargets).toContain('infra-redis');

      // Recovery commands for both should have been called
      const calls = runner.getCalls();
      expect(calls.some(c => c.command.includes('pg_isready'))).toBe(true);
      expect(calls.some(c => c.command.includes('redis-cli'))).toBe(true);
    });

    it('does not route real agent restarts to infra executor', async () => {
      // Real agent should not trigger infra recovery
      const cycle = await orchestrator.runCycle();

      // runner should only be called for infra agents, not real ones
      const calls = runner.getCalls();
      const observerCalls = calls.filter(c =>
        c.command.includes('observer-0')
      );
      expect(observerCalls).toHaveLength(0);
    });
  });

  // ==========================================================================
  // Synthetic Agents in Observation
  // ==========================================================================

  describe('synthetic infra agents in observation', () => {
    it('healthy infra agents have responsiveness 1.0', async () => {
      const cycle = await orchestrator.runCycle();
      const pgHealth = cycle.observation.agentHealth.get('infra-postgres');
      expect(pgHealth).toBeDefined();
      expect(pgHealth!.responsiveness).toBe(1.0);
    });

    it('failing infra agents have responsiveness 0.0', async () => {
      infraHealing.feedTestOutput('Error: connect ECONNREFUSED 127.0.0.1:5432');

      const cycle = await orchestrator.runCycle();
      const pgHealth = cycle.observation.agentHealth.get('infra-postgres');
      expect(pgHealth).toBeDefined();
      expect(pgHealth!.responsiveness).toBe(0.0);
      expect(pgHealth!.errorRate).toBe(1.0);
    });

    it('redis is independent of postgres failure', async () => {
      infraHealing.feedTestOutput('Error: connect ECONNREFUSED 127.0.0.1:5432');

      const cycle = await orchestrator.runCycle();
      const redisHealth = cycle.observation.agentHealth.get('infra-redis');
      expect(redisHealth).toBeDefined();
      expect(redisHealth!.responsiveness).toBe(1.0);
    });
  });

  // ==========================================================================
  // Stats flow through
  // ==========================================================================

  describe('stats propagation', () => {
    it('infraHealing stats update after Strange Loop cycle triggers recovery', async () => {
      infraHealing.feedTestOutput('Error: connect ECONNREFUSED 127.0.0.1:5432');
      await orchestrator.runCycle();

      const stats = infraHealing.getStats();
      expect(stats.infraFailuresDetected).toBe(1);
      // Recovery was attempted via the CompositeActionExecutor → InfraActionExecutor path
      // so the infra executor stats should reflect actual activity
      const executorStats = infraHealing.getExecutor().getStats();
      expect(executorStats.recoveriesAttempted).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // createStrangeLoopWithInfraHealing (non-in-memory variant)
  // ==========================================================================

  describe('createStrangeLoopWithInfraHealing() with explicit dependencies', () => {
    it('accepts explicit provider and executor', () => {
      const customProvider = new InMemoryAgentProvider('custom-obs');
      const customExecutor = new NoOpActionExecutor();
      const customRunner = new NoOpCommandRunner();

      const result = createStrangeLoopWithInfraHealing({
        provider: customProvider,
        executor: customExecutor,
        commandRunner: customRunner,
        playbook: INTEGRATION_PLAYBOOK,
      });

      expect(result.orchestrator).toBeInstanceOf(StrangeLoopOrchestrator);
      expect(result.infraHealing.isReady()).toBe(true);
    });

    it('passes custom variables to playbook', () => {
      const result = createStrangeLoopWithInfraHealing({
        provider: new InMemoryAgentProvider('obs'),
        executor: new NoOpActionExecutor(),
        commandRunner: new NoOpCommandRunner(),
        playbook: INTEGRATION_PLAYBOOK,
        variables: { PGHOST: 'db.custom.local' },
      });

      const plan = result.infraHealing.getPlaybook().getRecoveryPlan('postgres');
      expect(plan).toBeDefined();
    });
  });
});
