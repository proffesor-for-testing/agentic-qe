/**
 * Progress Indicators Tests
 *
 * Tests for the CLI progress utilities per ADR-041.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  FleetProgressManager,
  SimpleProgress,
  SpinnerManager,
  EtaEstimator,
  createTimedSpinner,
  withSpinner,
  withProgress,
  trackParallelOperations,
} from '../../../src/cli/utils/progress';

// Mock console to prevent actual output during tests
const mockConsole = {
  log: vi.fn(),
  clear: vi.fn(),
};

describe('Progress Indicators (ADR-041)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(mockConsole.log);
    vi.spyOn(console, 'clear').mockImplementation(mockConsole.clear);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('FleetProgressManager', () => {
    it('should create a fleet progress manager with default options', () => {
      const manager = new FleetProgressManager();
      expect(manager).toBeDefined();
    });

    it('should create a fleet progress manager with custom options', () => {
      const manager = new FleetProgressManager({
        title: 'Custom Title',
        showEta: true,
        showPercentage: true,
      });
      expect(manager).toBeDefined();
    });

    it('should start and stop progress tracking', () => {
      const manager = new FleetProgressManager({ title: 'Test' });
      manager.start(3);
      manager.stop();
      // Should not throw
    });

    it('should add and update agents', () => {
      const manager = new FleetProgressManager({ title: 'Test' });
      manager.start(2);

      manager.addAgent({
        id: 'agent-1',
        name: 'Test Agent 1',
        status: 'pending',
        progress: 0,
      });

      manager.addAgent({
        id: 'agent-2',
        name: 'Test Agent 2',
        status: 'pending',
        progress: 0,
      });

      manager.updateAgent('agent-1', 50, { status: 'running' });
      manager.updateAgent('agent-2', 25, { status: 'running', message: 'Processing...' });

      manager.stop();
      // Should not throw
    });

    it('should complete agents successfully', () => {
      const manager = new FleetProgressManager({ title: 'Test' });
      manager.start(1);

      manager.addAgent({
        id: 'agent-1',
        name: 'Test Agent',
        status: 'pending',
        progress: 0,
      });

      manager.completeAgent('agent-1', true);
      manager.stop();
      // Should not throw
    });

    it('should complete agents with failure', () => {
      const manager = new FleetProgressManager({ title: 'Test' });
      manager.start(1);

      manager.addAgent({
        id: 'agent-1',
        name: 'Test Agent',
        status: 'pending',
        progress: 0,
      });

      manager.completeAgent('agent-1', false);
      manager.stop();
      // Should not throw
    });

    it('should handle ETA estimation', () => {
      const manager = new FleetProgressManager({
        title: 'Test',
        showEta: true,
      });
      manager.start(1);

      manager.addAgent({
        id: 'agent-1',
        name: 'Test Agent',
        status: 'pending',
        progress: 0,
        eta: 5000,
      });

      manager.updateAgent('agent-1', 50, {
        status: 'running',
        eta: 2500,
      });

      manager.stop();
      // Should not throw
    });
  });

  describe('SimpleProgress', () => {
    it('should create a simple progress bar', () => {
      const progress = new SimpleProgress({ title: 'Test', total: 100 });
      expect(progress).toBeDefined();
      progress.stop();
    });

    it('should update progress', () => {
      const progress = new SimpleProgress({ title: 'Test', total: 100 });
      progress.update(25);
      progress.update(50);
      progress.update(75);
      progress.update(100);
      progress.stop();
    });

    it('should increment progress', () => {
      const progress = new SimpleProgress({ title: 'Test', total: 10 });
      progress.increment();
      progress.increment(2);
      progress.increment(3);
      progress.stop();
    });
  });

  describe('SpinnerManager', () => {
    it('should create a spinner manager', () => {
      const manager = new SpinnerManager();
      expect(manager).toBeDefined();
    });

    it('should start and stop a spinner with string', () => {
      const manager = new SpinnerManager();
      manager.start('Loading...');
      manager.stop();
    });

    it('should start and stop a spinner with options', () => {
      const manager = new SpinnerManager();
      manager.start({
        text: 'Loading...',
        color: 'cyan',
      });
      manager.stop();
    });

    it('should update spinner text', () => {
      const manager = new SpinnerManager();
      manager.start('Initial');
      manager.update('Updated');
      manager.stop();
    });

    it('should succeed spinner', () => {
      const manager = new SpinnerManager();
      manager.start('Processing...');
      manager.succeed('Done!');
    });

    it('should fail spinner', () => {
      const manager = new SpinnerManager();
      manager.start('Processing...');
      manager.fail('Failed!');
    });

    it('should warn spinner', () => {
      const manager = new SpinnerManager();
      manager.start('Processing...');
      manager.warn('Warning!');
    });

    it('should info spinner', () => {
      const manager = new SpinnerManager();
      manager.start('Processing...');
      manager.info('Info!');
    });
  });

  describe('createTimedSpinner', () => {
    it('should create a timed spinner', () => {
      const { spinner, stop, succeed, fail } = createTimedSpinner('Test operation');
      expect(spinner).toBeDefined();
      expect(stop).toBeTypeOf('function');
      expect(succeed).toBeTypeOf('function');
      expect(fail).toBeTypeOf('function');
      stop();
    });

    it('should succeed timed spinner', () => {
      const { succeed } = createTimedSpinner('Test operation');
      succeed('Completed!');
    });

    it('should fail timed spinner', () => {
      const { fail } = createTimedSpinner('Test operation');
      fail('Error occurred!');
    });
  });

  describe('EtaEstimator', () => {
    it('should create an ETA estimator', () => {
      const estimator = new EtaEstimator();
      expect(estimator).toBeDefined();
    });

    it('should create an ETA estimator with custom window size', () => {
      const estimator = new EtaEstimator(20);
      expect(estimator).toBeDefined();
    });

    it('should add samples and estimate ETA', async () => {
      const estimator = new EtaEstimator(5);

      estimator.addSample(0);
      await new Promise(resolve => setTimeout(resolve, 50));
      estimator.addSample(25);
      await new Promise(resolve => setTimeout(resolve, 50));
      estimator.addSample(50);

      const estimate = estimator.estimate(50);
      // ETA should be estimated based on progress rate
      if (estimate) {
        expect(estimate.remainingMs).toBeGreaterThan(0);
        expect(estimate.estimatedCompletion).toBeInstanceOf(Date);
        expect(estimate.formatted).toBeTruthy();
      }
    });

    it('should return null for completed progress', () => {
      const estimator = new EtaEstimator();
      estimator.addSample(100);
      const estimate = estimator.estimate(100);
      expect(estimate).toBeNull();
    });

    it('should return null with insufficient samples', () => {
      const estimator = new EtaEstimator();
      estimator.addSample(0);
      const estimate = estimator.estimate(0);
      expect(estimate).toBeNull();
    });

    it('should get elapsed time', async () => {
      const estimator = new EtaEstimator();
      await new Promise(resolve => setTimeout(resolve, 50));
      const elapsed = estimator.getElapsed();
      expect(elapsed).toBeGreaterThanOrEqual(45); // Allow some tolerance
    });

    it('should reset the estimator', () => {
      const estimator = new EtaEstimator();
      estimator.addSample(50);
      estimator.reset();
      const elapsed = estimator.getElapsed();
      expect(elapsed).toBeLessThan(50);
    });
  });

  describe('withSpinner', () => {
    it('should wrap an operation with a spinner', async () => {
      const result = await withSpinner('Test operation', async () => {
        return 'success';
      });
      expect(result).toBe('success');
    });

    it('should handle operation failure', async () => {
      await expect(
        withSpinner('Test operation', async () => {
          throw new Error('Operation failed');
        })
      ).rejects.toThrow('Operation failed');
    });
  });

  describe('withProgress', () => {
    it('should process items with progress', async () => {
      const items = [1, 2, 3, 4, 5];
      const results = await withProgress(
        items,
        'Processing items',
        async (item) => item * 2
      );
      expect(results).toEqual([2, 4, 6, 8, 10]);
    });

    it('should handle empty items', async () => {
      const results = await withProgress(
        [],
        'Processing items',
        async (item: number) => item * 2
      );
      expect(results).toEqual([]);
    });
  });

  describe('trackParallelOperations', () => {
    it('should track parallel operations', async () => {
      const operations = [
        {
          id: 'op-1',
          name: 'Operation 1',
          operation: async () => 'result-1',
        },
        {
          id: 'op-2',
          name: 'Operation 2',
          operation: async () => 'result-2',
        },
      ];

      const results = await trackParallelOperations(operations, {
        title: 'Parallel Operations',
      });

      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('op-1');
      expect(results[0].result).toBe('result-1');
      expect(results[1].id).toBe('op-2');
      expect(results[1].result).toBe('result-2');
    });

    it('should handle operation failures', async () => {
      const operations = [
        {
          id: 'op-1',
          name: 'Operation 1',
          operation: async () => {
            throw new Error('Failed');
          },
        },
        {
          id: 'op-2',
          name: 'Operation 2',
          operation: async () => 'result-2',
        },
      ];

      const results = await trackParallelOperations(operations);

      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('op-1');
      expect(results[0].error).toBeDefined();
      expect(results[1].id).toBe('op-2');
      expect(results[1].result).toBe('result-2');
    });
  });
});
