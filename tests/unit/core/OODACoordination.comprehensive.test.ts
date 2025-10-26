/**
 * Comprehensive Tests for OODACoordination
 * Coverage target: 90%+ of OODACoordination.ts
 */

import { OODACoordination, OODALoop, Observation, Orientation, Decision, Action } from '@core/coordination/OODACoordination';
import { SwarmMemoryManager } from '@core/memory/SwarmMemoryManager';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs-extra';

describe('OODACoordination - Comprehensive Tests', () => {
  let oodaCoordination: OODACoordination;
  let memoryManager: SwarmMemoryManager;
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `ooda-test-${Date.now()}`);
    await fs.ensureDir(testDir);

    const dbPath = path.join(testDir, 'memory.db');
    memoryManager = new SwarmMemoryManager(dbPath);
    await memoryManager.initialize();

    oodaCoordination = new OODACoordination(memoryManager);
  });

  afterEach(async () => {
    await memoryManager.close();
    await fs.remove(testDir);
  });

  describe('Cycle Management', () => {
    it('should start a new OODA cycle', async () => {
      const cycleId = await oodaCoordination.startCycle();

      expect(cycleId).toMatch(/^ooda-cycle-\d+-\d+$/);

      const currentCycle = oodaCoordination.getCurrentCycle();
      expect(currentCycle).not.toBeNull();
      expect(currentCycle?.id).toBe(cycleId);
      expect(currentCycle?.cycleNumber).toBe(1);
      expect(currentCycle?.observations).toEqual([]);
      expect(currentCycle?.startTime).toBeLessThanOrEqual(Date.now());
    });

    it('should increment cycle number on successive starts', async () => {
      const cycle1Id = await oodaCoordination.startCycle();
      await oodaCoordination.completeCycle();

      const cycle2Id = await oodaCoordination.startCycle();
      const currentCycle = oodaCoordination.getCurrentCycle();

      expect(currentCycle?.cycleNumber).toBe(2);
    });

    it('should store cycle in memory on start', async () => {
      const cycleId = await oodaCoordination.startCycle();

      const stored = await memoryManager.retrieve(`ooda:cycle:${cycleId}`, {
        partition: 'ooda_cycles'
      });

      expect(stored).toBeDefined();
      expect(stored.id).toBe(cycleId);
    });

    it('should emit cycle-started event', async () => {
      const eventHandler = jest.fn();
      oodaCoordination.on('ooda:cycle-started', eventHandler);

      await oodaCoordination.startCycle();

      expect(eventHandler).toHaveBeenCalledTimes(1);
      expect(eventHandler.mock.calls[0][0]).toHaveProperty('id');
    });

    it('should complete current OODA cycle', async () => {
      await oodaCoordination.startCycle();
      const completedLoop = await oodaCoordination.completeCycle();

      expect(completedLoop.endTime).toBeDefined();
      expect(completedLoop.duration).toBeDefined();
      expect(completedLoop.duration).toBeGreaterThanOrEqual(0);

      const currentCycle = oodaCoordination.getCurrentCycle();
      expect(currentCycle).toBeNull();
    });

    it('should throw error when completing without active cycle', async () => {
      await expect(oodaCoordination.completeCycle()).rejects.toThrow('No active OODA cycle');
    });

    it('should emit cycle-completed event', async () => {
      const eventHandler = jest.fn();
      oodaCoordination.on('ooda:cycle-completed', eventHandler);

      await oodaCoordination.startCycle();
      await oodaCoordination.completeCycle();

      expect(eventHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe('Observe Phase', () => {
    beforeEach(async () => {
      await oodaCoordination.startCycle();
    });

    it('should add observation to current cycle', async () => {
      const observation = await oodaCoordination.observe({
        data: { metric: 'cpu_usage', value: 75 },
        source: 'performance-monitor'
      });

      expect(observation.id).toMatch(/^obs-\d+-[a-z0-9]+$/);
      expect(observation.data.metric).toBe('cpu_usage');
      expect(observation.source).toBe('performance-monitor');
      expect(observation.timestamp).toBeLessThanOrEqual(Date.now());

      const currentCycle = oodaCoordination.getCurrentCycle();
      expect(currentCycle?.observations).toHaveLength(1);
      expect(currentCycle?.observations[0].id).toBe(observation.id);
    });

    it('should add multiple observations', async () => {
      await oodaCoordination.observe({
        data: { metric: 'memory_usage', value: 50 },
        source: 'system-monitor'
      });

      await oodaCoordination.observe({
        data: { metric: 'disk_io', value: 100 },
        source: 'io-monitor'
      });

      const currentCycle = oodaCoordination.getCurrentCycle();
      expect(currentCycle?.observations).toHaveLength(2);
    });

    it('should throw error when observing without active cycle', async () => {
      await oodaCoordination.completeCycle();

      await expect(
        oodaCoordination.observe({
          data: { test: 'data' },
          source: 'test'
        })
      ).rejects.toThrow('No active OODA cycle');
    });

    it('should persist observations to memory', async () => {
      const observation = await oodaCoordination.observe({
        data: { test: 'data' },
        source: 'test-source'
      });

      const cycleId = oodaCoordination.getCurrentCycle()?.id;
      const stored = await memoryManager.retrieve(`ooda:cycle:${cycleId}`, {
        partition: 'ooda_cycles'
      });

      expect(stored.observations).toHaveLength(1);
      expect(stored.observations[0].id).toBe(observation.id);
    });

    it('should emit observation-added event', async () => {
      const eventHandler = jest.fn();
      oodaCoordination.on('ooda:observation-added', eventHandler);

      await oodaCoordination.observe({
        data: { test: 'data' },
        source: 'test'
      });

      expect(eventHandler).toHaveBeenCalledTimes(1);
      expect(eventHandler.mock.calls[0][0]).toHaveProperty('observation');
    });

    it('should handle complex observation data', async () => {
      const complexData = {
        metrics: {
          cpu: { usage: 75, cores: 8 },
          memory: { usage: 50, total: 16384 }
        },
        nested: {
          deep: {
            value: 'test'
          }
        },
        array: [1, 2, 3]
      };

      const observation = await oodaCoordination.observe({
        data: complexData,
        source: 'complex-monitor'
      });

      expect(observation.data).toEqual(complexData);
    });
  });

  describe('Orient Phase', () => {
    beforeEach(async () => {
      await oodaCoordination.startCycle();
    });

    it('should create orientation from observations', async () => {
      await oodaCoordination.observe({
        data: { metric: 'load', value: 'high' },
        source: 'monitor'
      });

      const analysis = {
        situation: 'system under load',
        recommendation: 'scale up'
      };

      const orientation = await oodaCoordination.orient(analysis, {
        environment: 'production'
      });

      expect(orientation.id).toMatch(/^orient-\d+$/);
      expect(orientation.analysis).toEqual(analysis);
      expect(orientation.context.environment).toBe('production');
      expect(orientation.observations).toHaveLength(1);
    });

    it('should throw error without active cycle', async () => {
      await oodaCoordination.completeCycle();

      await expect(
        oodaCoordination.orient({ test: 'analysis' })
      ).rejects.toThrow('No active OODA cycle');
    });

    it('should throw error without observations', async () => {
      await expect(
        oodaCoordination.orient({ test: 'analysis' })
      ).rejects.toThrow('Cannot orient without observations');
    });

    it('should reference all observation IDs', async () => {
      const obs1 = await oodaCoordination.observe({
        data: { metric: 'cpu', value: 80 },
        source: 'cpu-monitor'
      });

      const obs2 = await oodaCoordination.observe({
        data: { metric: 'memory', value: 60 },
        source: 'mem-monitor'
      });

      const orientation = await oodaCoordination.orient({
        analysis: 'high resource usage'
      });

      expect(orientation.observations).toContain(obs1.id);
      expect(orientation.observations).toContain(obs2.id);
    });

    it('should emit orientation-completed event', async () => {
      await oodaCoordination.observe({
        data: { test: 'data' },
        source: 'test'
      });

      const eventHandler = jest.fn();
      oodaCoordination.on('ooda:orientation-completed', eventHandler);

      await oodaCoordination.orient({ analysis: 'test' });

      expect(eventHandler).toHaveBeenCalledTimes(1);
    });

    it('should store orientation in current cycle', async () => {
      await oodaCoordination.observe({
        data: { test: 'data' },
        source: 'test'
      });

      const orientation = await oodaCoordination.orient({ analysis: 'test' });

      const currentCycle = oodaCoordination.getCurrentCycle();
      expect(currentCycle?.orientation?.id).toBe(orientation.id);
    });
  });

  describe('Decide Phase', () => {
    beforeEach(async () => {
      await oodaCoordination.startCycle();
      await oodaCoordination.observe({
        data: { metric: 'load', value: 'high' },
        source: 'monitor'
      });
      await oodaCoordination.orient({ analysis: 'system overloaded' });
    });

    it('should make decision based on orientation', async () => {
      const options = [
        { action: 'scale-up', cost: 100 },
        { action: 'optimize', cost: 50 },
        { action: 'throttle', cost: 10 }
      ];

      const decision = await oodaCoordination.decide(
        options,
        options[0],
        'Highest impact solution'
      );

      expect(decision.id).toMatch(/^decision-\d+$/);
      expect(decision.options).toEqual(options);
      expect(decision.selected).toEqual(options[0]);
      expect(decision.rationale).toBe('Highest impact solution');
    });

    it('should throw error without active cycle', async () => {
      await oodaCoordination.completeCycle();

      await expect(
        oodaCoordination.decide([], {}, 'test')
      ).rejects.toThrow('No active OODA cycle');
    });

    it('should throw error without orientation', async () => {
      await oodaCoordination.startCycle();
      await oodaCoordination.observe({ data: {}, source: 'test' });

      await expect(
        oodaCoordination.decide([], {}, 'test')
      ).rejects.toThrow('Cannot decide without orientation');
    });

    it('should emit decision-made event', async () => {
      const eventHandler = jest.fn();
      oodaCoordination.on('ooda:decision-made', eventHandler);

      await oodaCoordination.decide([{ option: 1 }], { option: 1 }, 'test');

      expect(eventHandler).toHaveBeenCalledTimes(1);
    });

    it('should store decision in current cycle', async () => {
      const decision = await oodaCoordination.decide(
        [{ option: 1 }],
        { option: 1 },
        'test'
      );

      const currentCycle = oodaCoordination.getCurrentCycle();
      expect(currentCycle?.decision?.id).toBe(decision.id);
    });

    it('should reference orientation ID', async () => {
      const currentCycle = oodaCoordination.getCurrentCycle();
      const orientationId = currentCycle?.orientation?.id;

      const decision = await oodaCoordination.decide([], {}, 'test');

      expect(decision.orientationId).toBe(orientationId);
    });
  });

  describe('Act Phase', () => {
    beforeEach(async () => {
      await oodaCoordination.startCycle();
      await oodaCoordination.observe({
        data: { metric: 'load', value: 'high' },
        source: 'monitor'
      });
      await oodaCoordination.orient({ analysis: 'system overloaded' });
      await oodaCoordination.decide([{ action: 'scale' }], { action: 'scale' }, 'needed');
    });

    it('should execute action successfully', async () => {
      const executor = jest.fn().mockResolvedValue({ success: true, scaled: 2 });

      const action = await oodaCoordination.act(
        'scale-up',
        { instances: 2 },
        executor
      );

      expect(action.id).toMatch(/^action-\d+$/);
      expect(action.type).toBe('scale-up');
      expect(action.status).toBe('completed');
      expect(action.result).toEqual({ success: true, scaled: 2 });
      expect(executor).toHaveBeenCalledTimes(1);
    });

    it('should handle action failure', async () => {
      const executor = jest.fn().mockRejectedValue(new Error('Scaling failed'));

      const action = await oodaCoordination.act(
        'scale-up',
        { instances: 2 },
        executor
      );

      expect(action.status).toBe('failed');
      expect(action.result).toEqual({ error: 'Scaling failed' });
    });

    it('should throw error without active cycle', async () => {
      await oodaCoordination.completeCycle();

      await expect(
        oodaCoordination.act('test', {}, jest.fn())
      ).rejects.toThrow('No active OODA cycle');
    });

    it('should throw error without decision', async () => {
      await oodaCoordination.startCycle();
      await oodaCoordination.observe({ data: {}, source: 'test' });
      await oodaCoordination.orient({ analysis: 'test' });

      await expect(
        oodaCoordination.act('test', {}, jest.fn())
      ).rejects.toThrow('Cannot act without decision');
    });

    it('should emit action-started event', async () => {
      const eventHandler = jest.fn();
      oodaCoordination.on('ooda:action-started', eventHandler);

      const executor = jest.fn().mockResolvedValue({});

      await oodaCoordination.act('test', {}, executor);

      expect(eventHandler).toHaveBeenCalledTimes(1);
    });

    it('should emit action-completed event on success', async () => {
      const eventHandler = jest.fn();
      oodaCoordination.on('ooda:action-completed', eventHandler);

      const executor = jest.fn().mockResolvedValue({ result: 'success' });

      await oodaCoordination.act('test', {}, executor);

      expect(eventHandler).toHaveBeenCalledTimes(1);
    });

    it('should emit action-failed event on failure', async () => {
      const eventHandler = jest.fn();
      oodaCoordination.on('ooda:action-failed', eventHandler);

      const executor = jest.fn().mockRejectedValue(new Error('Test error'));

      await oodaCoordination.act('test', {}, executor);

      expect(eventHandler).toHaveBeenCalledTimes(1);
    });

    it('should reference decision ID', async () => {
      const currentCycle = oodaCoordination.getCurrentCycle();
      const decisionId = currentCycle?.decision?.id;

      const executor = jest.fn().mockResolvedValue({});
      const action = await oodaCoordination.act('test', {}, executor);

      expect(action.decisionId).toBe(decisionId);
    });
  });

  describe('Cycle History', () => {
    it('should retrieve cycle history', async () => {
      await oodaCoordination.startCycle();
      await oodaCoordination.observe({ data: {}, source: 'test' });
      await oodaCoordination.orient({ analysis: 'test' });
      await oodaCoordination.decide([], {}, 'test');
      await oodaCoordination.act('test', {}, jest.fn().mockResolvedValue({}));
      await oodaCoordination.completeCycle();

      const history = await oodaCoordination.getCycleHistory(10);

      expect(history.length).toBeGreaterThan(0);
      expect(history[0].duration).toBeDefined();
    });

    it('should limit history results', async () => {
      for (let i = 0; i < 15; i++) {
        await oodaCoordination.startCycle();
        await oodaCoordination.completeCycle();
      }

      const history = await oodaCoordination.getCycleHistory(5);

      expect(history).toHaveLength(5);
    });

    it('should sort history by timestamp descending', async () => {
      await oodaCoordination.startCycle();
      await oodaCoordination.completeCycle();

      await new Promise(resolve => setTimeout(resolve, 10));

      await oodaCoordination.startCycle();
      await oodaCoordination.completeCycle();

      const history = await oodaCoordination.getCycleHistory(10);

      expect(history[0].startTime).toBeGreaterThan(history[1].startTime);
    });
  });

  describe('Performance Metrics', () => {
    it('should calculate average cycle time', async () => {
      for (let i = 0; i < 5; i++) {
        await oodaCoordination.startCycle();
        await new Promise(resolve => setTimeout(resolve, 10));
        await oodaCoordination.completeCycle();
      }

      const avgTime = await oodaCoordination.getAverageCycleTime();

      expect(avgTime).toBeGreaterThan(0);
    });

    it('should return 0 for average cycle time with no completed cycles', async () => {
      const avgTime = await oodaCoordination.getAverageCycleTime();

      expect(avgTime).toBe(0);
    });

    it('should exclude incomplete cycles from average', async () => {
      await oodaCoordination.startCycle();
      await oodaCoordination.completeCycle();

      await oodaCoordination.startCycle();
      // Don't complete this one

      const avgTime = await oodaCoordination.getAverageCycleTime();

      expect(avgTime).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle concurrent observations', async () => {
      await oodaCoordination.startCycle();

      const observations = await Promise.all([
        oodaCoordination.observe({ data: { id: 1 }, source: 'test1' }),
        oodaCoordination.observe({ data: { id: 2 }, source: 'test2' }),
        oodaCoordination.observe({ data: { id: 3 }, source: 'test3' })
      ]);

      expect(observations).toHaveLength(3);
      const currentCycle = oodaCoordination.getCurrentCycle();
      expect(currentCycle?.observations).toHaveLength(3);
    });

    it('should handle empty context in orientation', async () => {
      await oodaCoordination.startCycle();
      await oodaCoordination.observe({ data: {}, source: 'test' });

      const orientation = await oodaCoordination.orient({ analysis: 'test' });

      expect(orientation.context).toEqual({});
    });

    it('should handle very long cycle durations', async () => {
      await oodaCoordination.startCycle();

      await new Promise(resolve => setTimeout(resolve, 100));

      const completed = await oodaCoordination.completeCycle();

      expect(completed.duration).toBeGreaterThan(90);
    });

    it('should get current cycle returns copy', async () => {
      await oodaCoordination.startCycle();

      const cycle1 = oodaCoordination.getCurrentCycle();
      const cycle2 = oodaCoordination.getCurrentCycle();

      expect(cycle1).not.toBe(cycle2); // Different objects
      expect(cycle1?.id).toBe(cycle2?.id); // Same data
    });
  });
});
