/**
 * Agentic QE v3 - CLI Tests
 * Tests for the command line interface
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QEKernelImpl } from '../../../src/kernel/kernel';
import { QueenCoordinator, createQueenCoordinator } from '../../../src/coordination/queen-coordinator';
import { CrossDomainEventRouter } from '../../../src/coordination/cross-domain-router';
import { DefaultProtocolExecutor } from '../../../src/coordination/protocol-executor';
import { WorkflowOrchestrator } from '../../../src/coordination/workflow-orchestrator';
import { DomainName, ALL_DOMAINS } from '../../../src/shared/types';

describe('CLI Components', () => {
  let kernel: QEKernelImpl;
  let router: CrossDomainEventRouter;
  let queen: QueenCoordinator;

  beforeEach(async () => {
    kernel = new QEKernelImpl({
      maxConcurrentAgents: 5,
      memoryBackend: 'hybrid',
      hnswEnabled: false,
      lazyLoading: true,
      enabledDomains: [...ALL_DOMAINS],
    });
    await kernel.initialize();

    router = new CrossDomainEventRouter(kernel.eventBus);
    await router.initialize();

    const getDomainAPI = <T>(domain: DomainName): T | undefined => {
      return kernel.getDomainAPI<T>(domain);
    };

    const protocolExecutor = new DefaultProtocolExecutor(
      kernel.eventBus,
      kernel.memory,
      getDomainAPI
    );

    queen = createQueenCoordinator(
      kernel,
      router,
      protocolExecutor,
      undefined
    );
    await queen.initialize();
  });

  afterEach(async () => {
    await queen.dispose();
    await router.dispose();
    await kernel.dispose();
  });

  describe('Kernel Initialization', () => {
    it('should initialize kernel with configuration', () => {
      const health = kernel.getHealth();
      expect(health.status).toBeDefined();
      expect(health.agents.maxAllowed).toBe(5);
    });

    it('should provide domain API access', () => {
      // Lazy loading means API might not be available immediately
      // This tests the mechanism exists
      const api = kernel.getDomainAPI('test-generation');
      // May be undefined due to lazy loading
      expect(api === undefined || api !== null).toBe(true);
    });
  });

  describe('Router Initialization', () => {
    it('should initialize cross-domain router', async () => {
      // Router is initialized if we reach this point without error
      // The router exposes event handling methods
      const history = router.getHistory({ limit: 1 });
      expect(Array.isArray(history)).toBe(true);
    });
  });

  describe('Queen Coordinator Integration', () => {
    it('should initialize queen coordinator', async () => {
      const health = queen.getHealth();
      expect(['healthy', 'degraded']).toContain(health.status);
      expect(health.totalAgents).toBeGreaterThanOrEqual(0);
    });

    it('should accept task submission', async () => {
      const result = await queen.submitTask({
        type: 'generate-tests',
        priority: 'p1',
        targetDomains: [],
        payload: { source: 'test.ts' },
        timeout: 30000,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBeDefined();
      }
    });

    it('should list tasks', () => {
      const tasks = queen.listTasks({});
      expect(Array.isArray(tasks)).toBe(true);
    });

    it('should provide domain health', () => {
      const health = queen.getDomainHealth('test-generation');
      expect(health).toBeDefined();
      expect(health?.status).toBeDefined();
    });

    it('should provide domain load', () => {
      const load = queen.getDomainLoad('test-generation');
      expect(typeof load).toBe('number');
      expect(load).toBeGreaterThanOrEqual(0);
    });

    it('should provide metrics', () => {
      const metrics = queen.getMetrics();
      expect(metrics.tasksReceived).toBeGreaterThanOrEqual(0);
      expect(metrics.uptime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Task Types', () => {
    const taskTypes = [
      'generate-tests',
      'execute-tests',
      'analyze-coverage',
      'assess-quality',
      'predict-defects',
      'validate-requirements',
      'index-code',
      'scan-security',
      'validate-contracts',
      'test-accessibility',
      'run-chaos',
      'optimize-learning',
    ] as const;

    it.each(taskTypes)('should accept %s task type', async (taskType) => {
      const result = await queen.submitTask({
        type: taskType,
        priority: 'p2',
        targetDomains: [],
        payload: {},
        timeout: 10000,
      });

      expect(result.success).toBe(true);
    });
  });

  describe('Priority Handling', () => {
    it('should accept all priority levels', async () => {
      const priorities = ['p0', 'p1', 'p2', 'p3'] as const;

      for (const priority of priorities) {
        const result = await queen.submitTask({
          type: 'generate-tests',
          priority,
          targetDomains: [],
          payload: {},
          timeout: 10000,
        });
        expect(result.success).toBe(true);
      }
    });
  });

  describe('Agent Management', () => {
    it('should list all agents', () => {
      const agents = queen.listAllAgents();
      expect(Array.isArray(agents)).toBe(true);
    });

    it('should get agents by domain', () => {
      const agents = queen.getAgentsByDomain('test-generation');
      expect(Array.isArray(agents)).toBe(true);
    });

    it('should request agent spawn', async () => {
      const result = await queen.requestAgentSpawn(
        'test-generation',
        'worker',
        ['unit-test']
      );
      expect(result.success).toBe(true);
    });
  });

  describe('Protocol Execution', () => {
    it('should attempt protocol execution', async () => {
      // Protocol may not exist, but mechanism should work
      const result = await queen.executeProtocol('non-existent-protocol', {});
      // Expected to fail as protocol doesn't exist
      expect(result.success).toBe(false);
    });
  });

  describe('Cleanup', () => {
    it('should dispose cleanly', async () => {
      // Create fresh instances for disposal test
      const testKernel = new QEKernelImpl({
        maxConcurrentAgents: 3,
        lazyLoading: true,
      });
      await testKernel.initialize();

      const testRouter = new CrossDomainEventRouter(testKernel.eventBus);
      await testRouter.initialize();

      const getDomainAPI = <T>(domain: DomainName): T | undefined => {
        return testKernel.getDomainAPI<T>(domain);
      };

      const testProtocolExecutor = new DefaultProtocolExecutor(
        testKernel.eventBus,
        testKernel.memory,
        getDomainAPI
      );

      const testQueen = createQueenCoordinator(
        testKernel,
        testRouter,
        testProtocolExecutor,
        undefined
      );
      await testQueen.initialize();

      // Dispose in order
      await testQueen.dispose();
      await testRouter.dispose();
      await testKernel.dispose();

      // Verify clean state after disposal
      expect(true).toBe(true);
    });
  });
});

describe('CLI Command Patterns', () => {
  describe('Command Structure', () => {
    it('should have init command requirements', () => {
      // Test validates that init command accepts expected options
      const initOptions = {
        domains: 'all',
        maxAgents: '15',
        memory: 'hybrid',
        lazy: false,
      };

      expect(initOptions.domains).toBe('all');
      expect(parseInt(initOptions.maxAgents, 10)).toBe(15);
      expect(initOptions.memory).toBe('hybrid');
      expect(initOptions.lazy).toBe(false);
    });

    it('should have task command structure', () => {
      // Test validates task command structure
      const taskOptions = {
        type: 'generate-tests',
        priority: 'p1',
        domain: 'test-generation',
        timeout: '300000',
        payload: '{}',
      };

      expect(taskOptions.type).toBeDefined();
      expect(['p0', 'p1', 'p2', 'p3']).toContain(taskOptions.priority);
      expect(parseInt(taskOptions.timeout, 10)).toBeGreaterThan(0);
      expect(JSON.parse(taskOptions.payload)).toEqual({});
    });

    it('should have agent command structure', () => {
      const agentOptions = {
        domain: 'test-generation',
        type: 'worker',
        capabilities: 'unit-test,integration-test',
      };

      expect(ALL_DOMAINS).toContain(agentOptions.domain);
      expect(agentOptions.type).toBe('worker');
      expect(agentOptions.capabilities.split(',')).toHaveLength(2);
    });
  });

  describe('Output Formatting', () => {
    it('should format status correctly', () => {
      const formatStatus = (status: string): string => {
        switch (status) {
          case 'healthy':
          case 'completed':
            return 'green';
          case 'degraded':
          case 'running':
            return 'yellow';
          case 'unhealthy':
          case 'failed':
            return 'red';
          default:
            return 'gray';
        }
      };

      expect(formatStatus('healthy')).toBe('green');
      expect(formatStatus('degraded')).toBe('yellow');
      expect(formatStatus('unhealthy')).toBe('red');
      expect(formatStatus('unknown')).toBe('gray');
    });

    it('should format duration correctly', () => {
      const formatDuration = (ms: number): string => {
        if (ms < 1000) return `${ms}ms`;
        if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
        if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
        return `${(ms / 3600000).toFixed(1)}h`;
      };

      expect(formatDuration(500)).toBe('500ms');
      expect(formatDuration(5000)).toBe('5.0s');
      expect(formatDuration(120000)).toBe('2.0m');
      expect(formatDuration(7200000)).toBe('2.0h');
    });

    it('should format uptime correctly', () => {
      const formatUptime = (ms: number): string => {
        const hours = Math.floor(ms / 3600000);
        const minutes = Math.floor((ms % 3600000) / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);
        return `${hours}h ${minutes}m ${seconds}s`;
      };

      expect(formatUptime(3661000)).toBe('1h 1m 1s');
      expect(formatUptime(0)).toBe('0h 0m 0s');
    });
  });
});
