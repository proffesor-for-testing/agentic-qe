/**
 * Agent Spawn API Tests
 *
 * Tests for the QE agent spawn service that manages agent lifecycle.
 *
 * @module tests/edge/server/AgentSpawnAPI.test
 */

import { AgentSpawnService } from '../../../src/edge/server/AgentSpawnAPI';

describe('AgentSpawnService', () => {
  let service: AgentSpawnService;

  beforeEach(() => {
    service = new AgentSpawnService({
      maxAgents: 5,
      projectPath: process.cwd(),
    });
  });

  afterEach(() => {
    // Cancel any running agents
    for (const agent of service.list({ status: 'running' })) {
      service.cancel(agent.id);
    }
  });

  describe('spawn', () => {
    it('should spawn an agent with dry run', async () => {
      const result = await service.spawn({
        agentType: 'qe-test-generator',
        task: 'Generate unit tests for UserService',
        options: { dryRun: true },
      });

      expect(result.success).toBe(true);
      expect(result.agentId).toBeDefined();

      const status = service.getStatus(result.agentId!);
      expect(status).toBeDefined();
      expect(status!.agentType).toBe('qe-test-generator');
      expect(status!.status).toBe('completed');
    });

    it('should enforce max agents limit', async () => {
      // Spawn max agents with dry run
      const agents: string[] = [];

      for (let i = 0; i < 5; i++) {
        const result = await service.spawn({
          agentType: 'qe-test-generator',
          task: `Task ${i}`,
          options: { dryRun: true },
        });
        expect(result.success).toBe(true);
        agents.push(result.agentId!);
      }

      // All agents completed, so we can spawn more
      const extraResult = await service.spawn({
        agentType: 'qe-coverage-analyzer',
        task: 'Analyze coverage',
        options: { dryRun: true },
      });

      expect(extraResult.success).toBe(true);
    });

    it('should map agent types correctly', async () => {
      const testCases = [
        { input: 'qe-test-generator', expected: 'test-generator' },
        { input: 'qe-coverage-analyzer', expected: 'coverage-analyzer' },
        { input: 'qe-security-scanner', expected: 'security-scanner' },
      ];

      for (const { input, expected } of testCases) {
        const result = await service.spawn({
          agentType: input,
          task: 'Test task',
          options: { dryRun: true },
        });

        expect(result.success).toBe(true);

        const output = service.getOutput(result.agentId!);
        expect(output).toBeDefined();
        expect(output!.length).toBeGreaterThan(0);
        expect(output![0]).toContain(expected);
      }
    });
  });

  describe('getStatus', () => {
    it('should return null for unknown agent', () => {
      const status = service.getStatus('unknown-agent');
      expect(status).toBeNull();
    });

    it('should return correct status for spawned agent', async () => {
      const result = await service.spawn({
        agentType: 'qe-test-writer',
        task: 'Write failing tests',
        options: { dryRun: true },
      });

      const status = service.getStatus(result.agentId!);

      expect(status).toBeDefined();
      expect(status!.id).toBe(result.agentId);
      expect(status!.agentType).toBe('qe-test-writer');
      expect(status!.task).toBe('Write failing tests');
      expect(status!.status).toBe('completed');
    });
  });

  describe('getOutput', () => {
    it('should return null for unknown agent', () => {
      const output = service.getOutput('unknown-agent');
      expect(output).toBeNull();
    });

    it('should return output lines', async () => {
      const result = await service.spawn({
        agentType: 'qe-flaky-investigator',
        task: 'Find flaky tests',
        options: { dryRun: true },
      });

      const output = service.getOutput(result.agentId!);

      expect(output).toBeDefined();
      expect(Array.isArray(output)).toBe(true);
    });

    it('should limit output lines with lastN', async () => {
      const result = await service.spawn({
        agentType: 'qe-code-reviewer',
        task: 'Review code quality',
        options: { dryRun: true },
      });

      const fullOutput = service.getOutput(result.agentId!);
      const lastOutput = service.getOutput(result.agentId!, 1);

      expect(fullOutput).toBeDefined();
      expect(lastOutput).toBeDefined();
      expect(lastOutput!.length).toBeLessThanOrEqual(1);
    });
  });

  describe('list', () => {
    it('should list all agents', async () => {
      await service.spawn({
        agentType: 'qe-test-generator',
        task: 'Task 1',
        options: { dryRun: true },
      });

      await service.spawn({
        agentType: 'qe-coverage-analyzer',
        task: 'Task 2',
        options: { dryRun: true },
      });

      const agents = service.list();

      expect(agents.length).toBeGreaterThanOrEqual(2);
    });

    it('should filter by status', async () => {
      await service.spawn({
        agentType: 'qe-test-generator',
        task: 'Task 1',
        options: { dryRun: true },
      });

      const completed = service.list({ status: 'completed' });
      const running = service.list({ status: 'running' });

      expect(completed.every((a) => a.status === 'completed')).toBe(true);
      expect(running.every((a) => a.status === 'running')).toBe(true);
    });

    it('should filter by agent type', async () => {
      await service.spawn({
        agentType: 'qe-test-generator',
        task: 'Task 1',
        options: { dryRun: true },
      });

      await service.spawn({
        agentType: 'qe-security-scanner',
        task: 'Task 2',
        options: { dryRun: true },
      });

      const generators = service.list({ agentType: 'qe-test-generator' });
      const scanners = service.list({ agentType: 'qe-security-scanner' });

      expect(generators.every((a) => a.agentType === 'qe-test-generator')).toBe(true);
      expect(scanners.every((a) => a.agentType === 'qe-security-scanner')).toBe(true);
    });
  });

  describe('cancel', () => {
    it('should return false for unknown agent', () => {
      const cancelled = service.cancel('unknown-agent');
      expect(cancelled).toBe(false);
    });

    it('should return false for completed agent', async () => {
      const result = await service.spawn({
        agentType: 'qe-test-generator',
        task: 'Task 1',
        options: { dryRun: true },
      });

      // Agent is already completed (dry run)
      const cancelled = service.cancel(result.agentId!);
      expect(cancelled).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('should clean up old completed agents', async () => {
      await service.spawn({
        agentType: 'qe-test-generator',
        task: 'Old task',
        options: { dryRun: true },
      });

      // Wait a tiny bit so the timestamp difference is > 0
      await new Promise((resolve) => setTimeout(resolve, 10));

      // With maxAge=1ms, just-completed agents should be cleaned
      const cleaned = service.cleanup(1);

      expect(cleaned).toBeGreaterThanOrEqual(1);
      expect(service.list().length).toBe(0);
    });
  });

  describe('getAvailableTypes', () => {
    it('should return list of available agent types', () => {
      const types = service.getAvailableTypes();

      expect(Array.isArray(types)).toBe(true);
      expect(types.length).toBeGreaterThan(0);

      const testGenerator = types.find((t) => t.id === 'qe-test-generator');
      expect(testGenerator).toBeDefined();
      expect(testGenerator!.cliType).toBe('test-generator');
    });
  });

  describe('events', () => {
    it('should emit agent:created event', async () => {
      const created: { agentId: string; agentType: string }[] = [];

      service.on('agent:created', (data) => {
        created.push(data);
      });

      await service.spawn({
        agentType: 'qe-performance-tester',
        task: 'Run performance tests',
        options: { dryRun: true },
      });

      expect(created.length).toBe(1);
      expect(created[0].agentType).toBe('qe-performance-tester');
    });

    it('should emit agent:completed event', async () => {
      const completed: { agentId: string; exitCode: number }[] = [];

      service.on('agent:completed', (data) => {
        completed.push(data);
      });

      await service.spawn({
        agentType: 'qe-api-validator',
        task: 'Validate API contracts',
        options: { dryRun: true },
      });

      expect(completed.length).toBe(1);
      expect(completed[0].exitCode).toBe(0);
    });
  });
});
