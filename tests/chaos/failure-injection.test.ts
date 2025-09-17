/**
 * Chaos Engineering Tests
 * Testing system resilience through controlled failure injection
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import {
  createMockMemory,
  createMockHooks,
  createMockLogger,
  createMockAgentSpawner,
  createMockFileSystem,
  createMockProcessManager,
  createMockEventEmitter,
  createMockMCPServer
} from '../mocks';

// Chaos injection utilities
class ChaosInjector {
  private failureRate: number = 0;
  private latencyMs: number = 0;
  private memoryPressure: number = 0;
  private networkPartitions: Set<string> = new Set();
  private crashedAgents: Set<string> = new Set();
  private corruptedMemory: Map<string, any> = new Map();

  setFailureRate(rate: number): void {
    this.failureRate = Math.min(1, Math.max(0, rate));
  }

  setLatency(ms: number): void {
    this.latencyMs = ms;
  }

  setMemoryPressure(percentage: number): void {
    this.memoryPressure = Math.min(100, Math.max(0, percentage));
  }

  async injectRandomFailure(): Promise<boolean> {
    return Math.random() < this.failureRate;
  }

  async injectLatency<T>(operation: () => Promise<T>): Promise<T> {
    if (this.latencyMs > 0) {
      await new Promise(resolve => setTimeout(resolve, this.latencyMs));
    }
    return operation();
  }

  partitionNetwork(agentId: string): void {
    this.networkPartitions.add(agentId);
  }

  healPartition(agentId: string): void {
    this.networkPartitions.delete(agentId);
  }

  isPartitioned(agentId: string): boolean {
    return this.networkPartitions.has(agentId);
  }

  crashAgent(agentId: string): void {
    this.crashedAgents.add(agentId);
  }

  isAgentCrashed(agentId: string): boolean {
    return this.crashedAgents.has(agentId);
  }

  corruptMemory(key: string, value: any): void {
    this.corruptedMemory.set(key, this.corruptValue(value));
  }

  private corruptValue(value: any): any {
    if (typeof value === 'string') {
      return value + '�corrupted�';
    } else if (typeof value === 'number') {
      return NaN;
    } else if (typeof value === 'object' && value !== null) {
      return { ...value, corrupted: true };
    }
    return null;
  }

  getCorruptedValue(key: string): any {
    return this.corruptedMemory.get(key);
  }

  reset(): void {
    this.failureRate = 0;
    this.latencyMs = 0;
    this.memoryPressure = 0;
    this.networkPartitions.clear();
    this.crashedAgents.clear();
    this.corruptedMemory.clear();
  }
}

// Resilient system with chaos recovery mechanisms
class ResilientSystem {
  private agents: Map<string, any> = new Map();
  private memory: any;
  private hooks: any;
  private logger: any;
  private chaos: ChaosInjector;
  private circuitBreakers: Map<string, any> = new Map();
  private retryPolicies: Map<string, any> = new Map();
  private healthChecks: Map<string, any> = new Map();

  constructor(
    memory: any,
    hooks: any,
    logger: any,
    chaos: ChaosInjector
  ) {
    this.memory = memory;
    this.hooks = hooks;
    this.logger = logger;
    this.chaos = chaos;
  }

  async spawnAgentWithRecovery(name: string): Promise<any> {
    const maxRetries = 3;
    let lastError;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        if (await this.chaos.injectRandomFailure()) {
          throw new Error(`Chaos: Agent spawn failed for ${name}`);
        }

        const agent = {
          id: `${name}-${Date.now()}`,
          name,
          state: 'idle',
          healthStatus: 'healthy',
          restartCount: 0
        };

        this.agents.set(agent.id, agent);
        this.setupHealthCheck(agent.id);
        this.setupCircuitBreaker(agent.id);

        return agent;
      } catch (error) {
        lastError = error;
        this.logger.warn(`Spawn attempt ${attempt + 1} failed for ${name}`);
        await this.backoffDelay(attempt);
      }
    }

    throw lastError;
  }

  private async backoffDelay(attempt: number): Promise<void> {
    const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  private setupHealthCheck(agentId: string): void {
    this.healthChecks.set(agentId, {
      lastCheck: Date.now(),
      consecutiveFailures: 0,
      status: 'healthy'
    });
  }

  private setupCircuitBreaker(agentId: string): void {
    this.circuitBreakers.set(agentId, {
      state: 'closed', // closed, open, half-open
      failures: 0,
      lastFailure: null,
      threshold: 5,
      timeout: 60000 // 1 minute
    });
  }

  async executeWithCircuitBreaker(agentId: string, operation: () => Promise<any>): Promise<any> {
    const breaker = this.circuitBreakers.get(agentId);

    if (!breaker) {
      throw new Error(`No circuit breaker for agent ${agentId}`);
    }

    if (breaker.state === 'open') {
      const now = Date.now();
      if (now - breaker.lastFailure < breaker.timeout) {
        throw new Error(`Circuit breaker open for agent ${agentId}`);
      }
      // Try half-open
      breaker.state = 'half-open';
    }

    try {
      const result = await operation();

      if (breaker.state === 'half-open') {
        breaker.state = 'closed';
        breaker.failures = 0;
      }

      return result;
    } catch (error) {
      breaker.failures++;
      breaker.lastFailure = Date.now();

      if (breaker.failures >= breaker.threshold) {
        breaker.state = 'open';
        this.logger.error(`Circuit breaker opened for agent ${agentId}`);
      }

      throw error;
    }
  }

  async performHealthCheck(agentId: string): Promise<boolean> {
    const agent = this.agents.get(agentId);
    const health = this.healthChecks.get(agentId);

    if (!agent || !health) {
      return false;
    }

    // Check if agent is crashed
    if (this.chaos.isAgentCrashed(agentId)) {
      health.consecutiveFailures++;
      health.status = 'unhealthy';

      if (health.consecutiveFailures >= 3) {
        await this.restartAgent(agentId);
      }

      return false;
    }

    // Check if agent is partitioned
    if (this.chaos.isPartitioned(agentId)) {
      health.status = 'degraded';
      return false;
    }

    health.lastCheck = Date.now();
    health.consecutiveFailures = 0;
    health.status = 'healthy';

    return true;
  }

  async restartAgent(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);

    if (agent) {
      agent.restartCount++;
      agent.state = 'restarting';

      // Simulate restart
      await this.backoffDelay(0);

      agent.state = 'idle';
      agent.healthStatus = 'healthy';

      // Clear crashed state
      if (this.chaos.isAgentCrashed(agentId)) {
        this.chaos.crashedAgents.delete(agentId);
      }

      this.logger.info(`Agent ${agentId} restarted (attempt ${agent.restartCount})`);
    }
  }

  async handleMemoryCorruption(key: string): Promise<any> {
    const corruptedValue = this.chaos.getCorruptedValue(key);

    if (corruptedValue) {
      // Attempt recovery from backup
      const backupKey = `${key}:backup`;
      const backup = await this.memory.get(backupKey);

      if (backup) {
        this.logger.warn(`Recovered from corrupted memory: ${key}`);
        return backup;
      }

      throw new Error(`Memory corruption detected for key: ${key}`);
    }

    return await this.memory.get(key);
  }

  async performGracefulDegradation(): Promise<void> {
    // Reduce system load under pressure
    const pressure = this.chaos.memoryPressure;

    if (pressure > 80) {
      // Critical - stop non-essential agents
      for (const [id, agent] of this.agents) {
        if (agent.priority === 'low') {
          agent.state = 'suspended';
        }
      }
    } else if (pressure > 60) {
      // High - reduce operation frequency
      for (const [id, agent] of this.agents) {
        agent.throttled = true;
      }
    }
  }

  async implementBulkheadPattern(resourceType: string, maxConcurrent: number): Promise<any> {
    const bulkhead = {
      active: 0,
      queue: [],
      maxConcurrent
    };

    return {
      acquire: async () => {
        if (bulkhead.active >= maxConcurrent) {
          // Queue the request
          return new Promise((resolve) => {
            bulkhead.queue.push(resolve);
          });
        }

        bulkhead.active++;
        return true;
      },
      release: () => {
        bulkhead.active--;

        if (bulkhead.queue.length > 0) {
          const next = bulkhead.queue.shift();
          next(true);
          bulkhead.active++;
        }
      }
    };
  }

  getSystemMetrics(): any {
    const healthy = Array.from(this.healthChecks.values())
      .filter(h => h.status === 'healthy').length;

    const total = this.agents.size;
    const crashed = this.chaos.crashedAgents.size;
    const partitioned = this.chaos.networkPartitions.size;

    return {
      totalAgents: total,
      healthyAgents: healthy,
      crashedAgents: crashed,
      partitionedAgents: partitioned,
      memoryPressure: this.chaos.memoryPressure,
      circuitBreakersOpen: Array.from(this.circuitBreakers.values())
        .filter(cb => cb.state === 'open').length
    };
  }
}

describe('Chaos Engineering - Failure Injection', () => {
  let chaos: ChaosInjector;
  let system: ResilientSystem;
  let mockMemory: any;
  let mockHooks: any;
  let mockLogger: any;

  beforeEach(() => {
    chaos = new ChaosInjector();
    mockMemory = createMockMemory();
    mockHooks = createMockHooks();
    mockLogger = createMockLogger();
    system = new ResilientSystem(mockMemory, mockHooks, mockLogger, chaos);
  });

  afterEach(() => {
    chaos.reset();
    jest.clearAllMocks();
  });

  describe('Agent Failure Scenarios', () => {
    it('should handle agent crashes gracefully', async () => {
      const agent = await system.spawnAgentWithRecovery('test-agent');

      // Crash the agent
      chaos.crashAgent(agent.id);

      // Health check should detect crash
      const isHealthy = await system.performHealthCheck(agent.id);
      expect(isHealthy).toBe(false);

      // Multiple health check failures should trigger restart
      await system.performHealthCheck(agent.id);
      await system.performHealthCheck(agent.id);
      await system.performHealthCheck(agent.id);

      // Agent should be restarted
      expect(agent.restartCount).toBe(1);
      expect(agent.state).toBe('idle');
    });

    it('should recover from multiple agent failures', async () => {
      const agents = [];

      // Spawn multiple agents
      for (let i = 0; i < 5; i++) {
        agents.push(await system.spawnAgentWithRecovery(`agent-${i}`));
      }

      // Crash multiple agents
      chaos.crashAgent(agents[0].id);
      chaos.crashAgent(agents[2].id);
      chaos.crashAgent(agents[4].id);

      // Perform health checks and recovery
      for (const agent of agents) {
        for (let i = 0; i < 3; i++) {
          await system.performHealthCheck(agent.id);
        }
      }

      // Check recovery
      const metrics = system.getSystemMetrics();
      expect(metrics.crashedAgents).toBe(0); // All recovered
      expect(metrics.healthyAgents).toBe(5);
    });

    it('should handle spawn failures with retry', async () => {
      chaos.setFailureRate(0.7); // 70% failure rate

      // Should eventually succeed despite failures
      const agent = await system.spawnAgentWithRecovery('resilient-agent');

      expect(agent).toBeDefined();
      expect(agent.name).toBe('resilient-agent');
      expect(mockLogger.warn).toHaveBeenCalled(); // Logged retry attempts
    });

    it('should fail after max retries', async () => {
      chaos.setFailureRate(1.0); // 100% failure rate

      await expect(system.spawnAgentWithRecovery('doomed-agent'))
        .rejects.toThrow('Chaos: Agent spawn failed');
    });
  });

  describe('Memory Corruption Scenarios', () => {
    it('should recover from memory corruption', async () => {
      const key = 'important-data';
      const originalValue = { data: 'critical information' };
      const backupKey = `${key}:backup`;

      // Store original and backup
      await mockMemory.set({ key, value: originalValue });
      await mockMemory.set({ key: backupKey, value: originalValue });

      // Corrupt the memory
      chaos.corruptMemory(key, originalValue);

      // Mock the get to return backup
      mockMemory.get.mockImplementation(async (k: string) => {
        if (k === backupKey) return originalValue;
        return null;
      });

      // Should recover from backup
      const recovered = await system.handleMemoryCorruption(key);

      expect(recovered).toEqual(originalValue);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Recovered from corrupted memory')
      );
    });

    it('should handle unrecoverable memory corruption', async () => {
      const key = 'no-backup-data';

      chaos.corruptMemory(key, 'original');
      mockMemory.get.mockResolvedValue(null); // No backup

      await expect(system.handleMemoryCorruption(key))
        .rejects.toThrow('Memory corruption detected');
    });
  });

  describe('Network Partition Scenarios', () => {
    it('should handle network partitions', async () => {
      const agent1 = await system.spawnAgentWithRecovery('agent1');
      const agent2 = await system.spawnAgentWithRecovery('agent2');

      // Partition agent1
      chaos.partitionNetwork(agent1.id);

      const health1 = await system.performHealthCheck(agent1.id);
      const health2 = await system.performHealthCheck(agent2.id);

      expect(health1).toBe(false); // Partitioned
      expect(health2).toBe(true); // Healthy

      const metrics = system.getSystemMetrics();
      expect(metrics.partitionedAgents).toBe(1);
    });

    it('should heal network partitions', async () => {
      const agent = await system.spawnAgentWithRecovery('partitioned-agent');

      chaos.partitionNetwork(agent.id);
      expect(chaos.isPartitioned(agent.id)).toBe(true);

      chaos.healPartition(agent.id);
      expect(chaos.isPartitioned(agent.id)).toBe(false);

      const health = await system.performHealthCheck(agent.id);
      expect(health).toBe(true);
    });
  });

  describe('Circuit Breaker Pattern', () => {
    it('should open circuit breaker after threshold failures', async () => {
      const agent = await system.spawnAgentWithRecovery('breaker-agent');

      const failingOperation = jest.fn().mockRejectedValue(new Error('Operation failed'));

      // Trigger failures to open breaker
      for (let i = 0; i < 5; i++) {
        try {
          await system.executeWithCircuitBreaker(agent.id, failingOperation);
        } catch (e) {
          // Expected failures
        }
      }

      // Circuit should be open
      await expect(system.executeWithCircuitBreaker(agent.id, failingOperation))
        .rejects.toThrow('Circuit breaker open');

      expect(failingOperation).toHaveBeenCalledTimes(5); // Not 6
    });

    it('should allow half-open state after timeout', async () => {
      jest.useFakeTimers();

      const agent = await system.spawnAgentWithRecovery('timeout-agent');

      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockRejectedValueOnce(new Error('Fail 2'))
        .mockRejectedValueOnce(new Error('Fail 3'))
        .mockRejectedValueOnce(new Error('Fail 4'))
        .mockRejectedValueOnce(new Error('Fail 5'))
        .mockResolvedValue('Success');

      // Open the circuit
      for (let i = 0; i < 5; i++) {
        try {
          await system.executeWithCircuitBreaker(agent.id, operation);
        } catch (e) {
          // Expected
        }
      }

      // Advance time past timeout
      jest.advanceTimersByTime(61000);

      // Should allow retry (half-open)
      const result = await system.executeWithCircuitBreaker(agent.id, operation);
      expect(result).toBe('Success');

      jest.useRealTimers();
    });
  });

  describe('Graceful Degradation', () => {
    it('should degrade gracefully under memory pressure', async () => {
      const agents = [];

      // Create agents with different priorities
      for (let i = 0; i < 3; i++) {
        const agent = await system.spawnAgentWithRecovery(`high-priority-${i}`);
        agent.priority = 'high';
        agents.push(agent);
      }

      for (let i = 0; i < 3; i++) {
        const agent = await system.spawnAgentWithRecovery(`low-priority-${i}`);
        agent.priority = 'low';
        agents.push(agent);
      }

      // Apply critical memory pressure
      chaos.setMemoryPressure(85);
      await system.performGracefulDegradation();

      // Low priority agents should be suspended
      const suspended = agents.filter(a => a.state === 'suspended');
      expect(suspended).toHaveLength(3);
      expect(suspended.every(a => a.priority === 'low')).toBe(true);
    });

    it('should throttle operations under moderate pressure', async () => {
      const agents = [];

      for (let i = 0; i < 5; i++) {
        agents.push(await system.spawnAgentWithRecovery(`agent-${i}`));
      }

      chaos.setMemoryPressure(65);
      await system.performGracefulDegradation();

      // All agents should be throttled
      expect(agents.every(a => a.throttled === true)).toBe(true);
    });
  });

  describe('Bulkhead Pattern', () => {
    it('should limit concurrent resource access', async () => {
      const bulkhead = await system.implementBulkheadPattern('database', 3);

      const acquiredSlots = [];

      // Try to acquire more than limit
      for (let i = 0; i < 5; i++) {
        const slot = bulkhead.acquire();
        acquiredSlots.push(slot);
      }

      // First 3 should succeed immediately
      await expect(Promise.race([
        acquiredSlots[0],
        acquiredSlots[1],
        acquiredSlots[2]
      ])).resolves.toBe(true);

      // 4th and 5th should be queued
      const timeout = new Promise(resolve => setTimeout(() => resolve('timeout'), 100));
      const result = await Promise.race([acquiredSlots[3], timeout]);
      expect(result).toBe('timeout');

      // Release one slot
      bulkhead.release();

      // Now 4th should proceed
      await expect(acquiredSlots[3]).resolves.toBe(true);
    });
  });

  describe('Latency Injection', () => {
    it('should inject artificial latency', async () => {
      chaos.setLatency(100);

      const startTime = Date.now();

      await chaos.injectLatency(async () => {
        return 'result';
      });

      const duration = Date.now() - startTime;

      expect(duration).toBeGreaterThanOrEqual(100);
      expect(duration).toBeLessThan(200);
    });

    it('should handle timeout with latency', async () => {
      chaos.setLatency(5000); // 5 second latency

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Timeout')), 1000);
      });

      const operationPromise = chaos.injectLatency(async () => {
        return 'should not complete';
      });

      await expect(Promise.race([operationPromise, timeoutPromise]))
        .rejects.toThrow('Timeout');
    });
  });

  describe('Cascading Failures', () => {
    it('should handle cascading agent failures', async () => {
      const agents = [];

      // Create dependent agents
      for (let i = 0; i < 5; i++) {
        const agent = await system.spawnAgentWithRecovery(`agent-${i}`);
        agent.dependencies = i > 0 ? [`agent-${i - 1}`] : [];
        agents.push(agent);
      }

      // Crash the first agent
      chaos.crashAgent(agents[0].id);

      // Simulate cascading effect
      for (let i = 1; i < agents.length; i++) {
        const dependency = agents[i].dependencies[0];
        if (dependency && chaos.isAgentCrashed(agents[i - 1].id)) {
          chaos.crashAgent(agents[i].id);
        }
      }

      // All should be crashed
      expect(chaos.crashedAgents.size).toBe(5);

      // Recovery should restore all
      for (const agent of agents) {
        for (let j = 0; j < 3; j++) {
          await system.performHealthCheck(agent.id);
        }
      }

      const metrics = system.getSystemMetrics();
      expect(metrics.crashedAgents).toBe(0);
    });
  });

  describe('System Metrics Under Chaos', () => {
    it('should track system health metrics', async () => {
      // Create diverse system state
      const agents = [];

      for (let i = 0; i < 10; i++) {
        agents.push(await system.spawnAgentWithRecovery(`agent-${i}`));
      }

      // Apply various failure modes
      chaos.crashAgent(agents[0].id);
      chaos.crashAgent(agents[1].id);
      chaos.partitionNetwork(agents[2].id);
      chaos.partitionNetwork(agents[3].id);
      chaos.partitionNetwork(agents[4].id);
      chaos.setMemoryPressure(75);

      const metrics = system.getSystemMetrics();

      expect(metrics.totalAgents).toBe(10);
      expect(metrics.crashedAgents).toBe(2);
      expect(metrics.partitionedAgents).toBe(3);
      expect(metrics.memoryPressure).toBe(75);
      expect(metrics.healthyAgents).toBeLessThanOrEqual(5); // Some unhealthy
    });
  });
});