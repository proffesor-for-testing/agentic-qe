/**
 * Phase 1 Integration Tests: CLI Integration
 *
 * Tests fleet initialization via CLI, agent spawning,
 * memory operations, and workflow execution.
 */

import { FleetManager } from '@core/FleetManager';
import { SwarmMemoryManager } from '@core/memory/SwarmMemoryManager';
import { Task, TaskPriority } from '@core/Task';
import * as path from 'path';
import * as fs from 'fs-extra';
import * as os from 'os';

describe('Phase 1 - CLI Integration', () => {
  let tempDbPath: string;
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aqe-cli-test-'));
    tempDbPath = path.join(tempDir, 'test.db');
  });

  afterAll(async () => {
    await fs.remove(tempDir);
  });

  describe('Fleet Initialization', () => {
    test('should initialize fleet with configuration', async () => {
      const fleet = new FleetManager({
        agents: [
          { type: 'test-generator', count: 2, config: {} },
          { type: 'test-executor', count: 3, config: {} }
        ]
      });

      await fleet.initialize();
      await fleet.start();

      const status = fleet.getStatus();

      expect(status.totalAgents).toBe(5);
      expect(status.status).toBe('running');

      await fleet.stop();
    });

    test('should initialize memory manager for CLI operations', async () => {
      const memory = new SwarmMemoryManager(tempDbPath);
      await memory.initialize();

      // Test CLI memory operations
      await memory.store('cli:config', {
        version: '1.0.0',
        features: ['memory', 'coordination']
      }, { partition: 'workflow_state' });

      const config = await memory.retrieve('cli:config', {
        partition: 'workflow_state'
      });

      expect(config.version).toBe('1.0.0');

      await memory.close();
    });

    test('should handle fleet initialization errors gracefully', async () => {
      const fleet = new FleetManager({
        agents: [
          { type: 'invalid-agent-type', count: 1, config: {} }
        ]
      });

      // Should handle gracefully
      await expect(fleet.initialize()).rejects.toThrow();
    });
  });

  describe('Agent Spawning via CLI', () => {
    test('should spawn agents dynamically', async () => {
      const fleet = new FleetManager({ agents: [] });
      await fleet.initialize();
      await fleet.start();

      // Spawn agents via CLI-like operation
      const agent1 = await fleet.spawnAgent('test-generator', {
        framework: 'jest'
      });

      const agent2 = await fleet.spawnAgent('test-executor', {
        parallel: true
      });

      expect(agent1).toBeDefined();
      expect(agent2).toBeDefined();

      const status = fleet.getStatus();
      expect(status.totalAgents).toBe(2);

      await fleet.stop();
    });

    test('should remove agents dynamically', async () => {
      const fleet = new FleetManager({ agents: [] });
      await fleet.initialize();
      await fleet.start();

      const agent = await fleet.spawnAgent('test-generator', {});
      const agentId = agent.getId();

      await fleet.removeAgent(agentId);

      const status = fleet.getStatus();
      expect(status.totalAgents).toBe(0);

      await fleet.stop();
    });
  });

  describe('Memory Operations via CLI', () => {
    let memory: SwarmMemoryManager;

    beforeEach(async () => {
      memory = new SwarmMemoryManager(tempDbPath);
      await memory.initialize();
    });

    afterEach(async () => {
      await memory.close();
    });

    test('should execute memory store command', async () => {
      // Simulate CLI: aqe memory store <key> <value>
      await memory.store('cli-test-key', {
        data: 'stored via CLI',
        timestamp: Date.now()
      }, { partition: 'shared_state' });

      const result = await memory.retrieve('cli-test-key', {
        partition: 'shared_state'
      });

      expect(result.data).toBe('stored via CLI');
    });

    test('should execute memory query command', async () => {
      // Setup test data
      await memory.store('aqe/test/1', { id: 1 }, { partition: 'shared_state' });
      await memory.store('aqe/test/2', { id: 2 }, { partition: 'shared_state' });

      // Simulate CLI: aqe memory query "aqe/test/*"
      const results = await memory.query('aqe/test/%', {
        partition: 'shared_state'
      });

      expect(results).toHaveLength(2);
    });

    test('should execute memory stats command', async () => {
      // Simulate CLI: aqe memory stats
      const stats = await memory.stats();

      expect(stats).toHaveProperty('totalEntries');
      expect(stats).toHaveProperty('totalHints');
      expect(stats).toHaveProperty('partitions');
    });

    test('should execute memory clear command', async () => {
      await memory.store('temp1', { data: 1 }, { partition: 'temp' });
      await memory.store('temp2', { data: 2 }, { partition: 'temp' });

      // Simulate CLI: aqe memory clear temp
      await memory.clear('temp');

      const stats = await memory.stats();
      expect(stats.partitions).not.toContain('temp');
    });
  });

  describe('Workflow Execution via CLI', () => {
    test('should execute complete workflow', async () => {
      const fleet = new FleetManager({
        agents: [
          { type: 'test-generator', count: 1, config: {} }
        ]
      });

      await fleet.initialize();
      await fleet.start();

      // Submit task via CLI-like operation
      const task = new Task(
        'test-generation',
        'Generate tests for module',
        { module: 'calculator' },
        {},
        TaskPriority.HIGH
      );

      await fleet.submitTask(task);

      // Wait for task completion (with timeout)
      const result = await Promise.race([
        task.waitForCompletion(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Task timeout')), 5000)
        )
      ]);

      expect(task.getStatus()).not.toBe('failed');

      await fleet.stop();
    });

    test('should monitor task status', async () => {
      const fleet = new FleetManager({
        agents: [
          { type: 'test-executor', count: 1, config: {} }
        ]
      });

      await fleet.initialize();
      await fleet.start();

      const task = new Task(
        'test-execution',
        'Run tests',
        { suite: 'unit' },
        {},
        TaskPriority.MEDIUM
      );

      await fleet.submitTask(task);

      // Simulate CLI: aqe task status <task-id>
      const taskId = task.getId();
      const retrievedTask = fleet.getTask(taskId);

      expect(retrievedTask).toBeDefined();
      expect(retrievedTask?.getId()).toBe(taskId);

      await fleet.stop();
    });

    test('should get fleet status', async () => {
      const fleet = new FleetManager({
        agents: [
          { type: 'test-generator', count: 2, config: {} },
          { type: 'test-executor', count: 3, config: {} }
        ]
      });

      await fleet.initialize();
      await fleet.start();

      // Simulate CLI: aqe status
      const status = fleet.getStatus();

      expect(status.totalAgents).toBe(5);
      expect(status.status).toBe('running');
      expect(status.uptime).toBeGreaterThan(0);

      await fleet.stop();
    });
  });

  describe('CLI Error Handling', () => {
    test('should handle invalid memory operations', async () => {
      const memory = new SwarmMemoryManager(tempDbPath);
      await memory.initialize();

      // Invalid retrieve
      const result = await memory.retrieve('non-existent', {
        partition: 'test'
      });

      expect(result).toBeNull();

      await memory.close();
    });

    test('should handle fleet errors gracefully', async () => {
      const fleet = new FleetManager({
        agents: [{ type: 'test-generator', count: 1, config: {} }]
      });

      // Cannot start before initialize
      await expect(fleet.start()).rejects.toThrow();

      await fleet.initialize();
      await fleet.start();
      await fleet.stop();
    });
  });

  describe('CLI Configuration', () => {
    test('should load and use configuration', async () => {
      const config = {
        agents: [
          { type: 'test-generator', count: 1, config: { aiModel: 'claude-sonnet-4.5' } }
        ]
      };

      const fleet = new FleetManager(config);
      await fleet.initialize();
      await fleet.start();

      const agents = fleet.getAllAgents();
      expect(agents).toHaveLength(1);

      await fleet.stop();
    });

    test('should validate configuration before initialization', async () => {
      // Empty config should work
      const fleet = new FleetManager({ agents: [] });
      await expect(fleet.initialize()).resolves.not.toThrow();
      await fleet.start();
      await fleet.stop();
    });
  });
});
