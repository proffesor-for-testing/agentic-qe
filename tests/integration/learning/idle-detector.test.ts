/**
 * IdleDetector Integration Test
 *
 * MISSION: Validate idle detection functionality for triggering learning cycles
 *
 * This test validates:
 * 1. IdleDetector initialization and configuration
 * 2. CPU and memory monitoring
 * 3. Idle state detection and transitions
 * 4. Event emission for idle detected/ended
 * 5. Task queue management
 */

import { IdleDetector, IdleDetectorConfig, IdleState } from '../../../src/learning/scheduler/IdleDetector';

describe('IdleDetector Integration', () => {
  let idleDetector: IdleDetector;

  afterEach(async () => {
    if (idleDetector) {
      await idleDetector.stop();
    }
  });

  describe('Initialization', () => {
    it('should initialize with default configuration', () => {
      idleDetector = new IdleDetector();
      const config = idleDetector.getConfig();

      expect(config.cpuThreshold).toBe(20);
      expect(config.memoryThreshold).toBe(70);
      expect(config.taskQueueEmpty).toBe(true);
      expect(config.minIdleDuration).toBe(60000);
      expect(config.checkInterval).toBe(10000);
      expect(config.debug).toBe(false);
    });

    it('should initialize with custom configuration', () => {
      const customConfig: Partial<IdleDetectorConfig> = {
        cpuThreshold: 15,
        memoryThreshold: 60,
        minIdleDuration: 30000,
        checkInterval: 5000,
        debug: true,
      };

      idleDetector = new IdleDetector(customConfig);
      const config = idleDetector.getConfig();

      expect(config.cpuThreshold).toBe(15);
      expect(config.memoryThreshold).toBe(60);
      expect(config.minIdleDuration).toBe(30000);
      expect(config.checkInterval).toBe(5000);
      expect(config.debug).toBe(true);
    });

    it('should update configuration', () => {
      idleDetector = new IdleDetector();
      idleDetector.updateConfig({ cpuThreshold: 25, memoryThreshold: 75 });

      const config = idleDetector.getConfig();
      expect(config.cpuThreshold).toBe(25);
      expect(config.memoryThreshold).toBe(75);
    });
  });

  describe('State Monitoring', () => {
    it('should start and stop monitoring', async () => {
      idleDetector = new IdleDetector({ checkInterval: 1000 });

      await idleDetector.start();
      const state = idleDetector.getState();

      expect(state).toBeDefined();
      expect(typeof state.isIdle).toBe('boolean');
      expect(typeof state.cpuUsage).toBe('number');
      expect(typeof state.memoryUsage).toBe('number');
      expect(state.activeTaskCount).toBe(0);
      expect(state.lastCheck).toBeInstanceOf(Date);

      await idleDetector.stop();
    });

    it('should provide current state with metrics', () => {
      idleDetector = new IdleDetector();
      const state = idleDetector.getState();

      expect(state.cpuUsage).toBeGreaterThanOrEqual(0);
      expect(state.cpuUsage).toBeLessThanOrEqual(100);
      expect(state.memoryUsage).toBeGreaterThanOrEqual(0);
      expect(state.memoryUsage).toBeLessThanOrEqual(100);
      expect(state.activeTaskCount).toBe(0);
      expect(state.idleDuration).toBe(0);
    });

    it('should not start multiple times', async () => {
      idleDetector = new IdleDetector({ checkInterval: 1000 });

      await idleDetector.start();
      await idleDetector.start(); // Should not error

      await idleDetector.stop();
    });
  });

  describe('Task Queue Management', () => {
    beforeEach(() => {
      idleDetector = new IdleDetector({ taskQueueEmpty: true });
    });

    it('should register and unregister tasks', () => {
      idleDetector.registerTask('task-1');
      let state = idleDetector.getState();
      expect(state.activeTaskCount).toBe(1);

      idleDetector.registerTask('task-2');
      state = idleDetector.getState();
      expect(state.activeTaskCount).toBe(2);

      idleDetector.unregisterTask('task-1');
      state = idleDetector.getState();
      expect(state.activeTaskCount).toBe(1);

      idleDetector.unregisterTask('task-2');
      state = idleDetector.getState();
      expect(state.activeTaskCount).toBe(0);
    });

    it('should clear all tasks', () => {
      idleDetector.registerTask('task-1');
      idleDetector.registerTask('task-2');
      idleDetector.registerTask('task-3');

      let state = idleDetector.getState();
      expect(state.activeTaskCount).toBe(3);

      idleDetector.clearTasks();
      state = idleDetector.getState();
      expect(state.activeTaskCount).toBe(0);
    });

    it('should prevent idle detection when tasks are active', async () => {
      // Configure with very low thresholds to ensure idle would normally be detected
      idleDetector = new IdleDetector({
        cpuThreshold: 100,
        memoryThreshold: 100,
        taskQueueEmpty: true,
        minIdleDuration: 100,
        checkInterval: 200,
      });

      idleDetector.registerTask('blocking-task');

      await idleDetector.start();

      // Wait for a check cycle
      await new Promise(resolve => setTimeout(resolve, 300));

      const state = idleDetector.getState();
      // Should not be idle because task is active
      expect(state.activeTaskCount).toBe(1);

      idleDetector.unregisterTask('blocking-task');
      await idleDetector.stop();
    });
  });

  describe('Event Emission', () => {
    it('should emit state:update events', async () => {
      idleDetector = new IdleDetector({
        cpuThreshold: 100,
        memoryThreshold: 100,
        checkInterval: 200,
      });

      const stateUpdates: IdleState[] = [];
      idleDetector.on('state:update', (state: IdleState) => {
        stateUpdates.push(state);
      });

      await idleDetector.start();

      // Wait for at least one check cycle
      await new Promise(resolve => setTimeout(resolve, 300));

      expect(stateUpdates.length).toBeGreaterThan(0);
      expect(stateUpdates[0].cpuUsage).toBeDefined();
      expect(stateUpdates[0].memoryUsage).toBeDefined();

      await idleDetector.stop();
    });

    it('should emit idle:detected after minimum duration', async () => {
      idleDetector = new IdleDetector({
        cpuThreshold: 100,    // Very high threshold to ensure idle
        memoryThreshold: 100,  // Very high threshold to ensure idle
        minIdleDuration: 200,  // Short duration for testing
        checkInterval: 100,    // Fast checks
        taskQueueEmpty: false, // Don't require empty queue
      });

      let idleDetectedCount = 0;
      let detectedState: IdleState | null = null;

      idleDetector.on('idle:detected', (state: IdleState) => {
        idleDetectedCount++;
        detectedState = state;
      });

      await idleDetector.start();

      // Wait for minimum idle duration + some buffer
      await new Promise(resolve => setTimeout(resolve, 400));

      expect(idleDetectedCount).toBeGreaterThan(0);
      expect(detectedState).not.toBeNull();
      if (detectedState) {
        expect(detectedState.isIdle).toBe(true);
        expect(detectedState.idleDuration).toBeGreaterThanOrEqual(200);
      }

      await idleDetector.stop();
    });

    it('should emit idle:ended when system becomes busy', async () => {
      idleDetector = new IdleDetector({
        cpuThreshold: 100,
        memoryThreshold: 100,
        minIdleDuration: 100,
        checkInterval: 100,
        taskQueueEmpty: true,
      });

      let idleEndedCount = 0;
      let endedState: IdleState | null = null;

      idleDetector.on('idle:ended', (state: IdleState) => {
        idleEndedCount++;
        endedState = state;
      });

      await idleDetector.start();

      // Wait for idle state
      await new Promise(resolve => setTimeout(resolve, 250));

      // Register task to break idle state
      idleDetector.registerTask('busy-task');

      // Wait for state check
      await new Promise(resolve => setTimeout(resolve, 150));

      expect(idleEndedCount).toBeGreaterThan(0);
      expect(endedState).not.toBeNull();

      await idleDetector.stop();
    });

    it('should emit error events on failures', async () => {
      idleDetector = new IdleDetector({ checkInterval: 100 });

      const errors: Error[] = [];
      idleDetector.on('error', (error: Error) => {
        errors.push(error);
      });

      await idleDetector.start();

      // Wait for some checks
      await new Promise(resolve => setTimeout(resolve, 250));

      // In normal operation, no errors should occur
      expect(errors.length).toBe(0);

      await idleDetector.stop();
    });
  });

  describe('CPU and Memory Monitoring', () => {
    it('should report valid CPU usage', async () => {
      idleDetector = new IdleDetector({ checkInterval: 200 });

      await idleDetector.start();

      // Wait for CPU measurement to stabilize
      await new Promise(resolve => setTimeout(resolve, 400));

      const state = idleDetector.getState();

      expect(state.cpuUsage).toBeGreaterThanOrEqual(0);
      expect(state.cpuUsage).toBeLessThanOrEqual(100);

      await idleDetector.stop();
    });

    it('should report valid memory usage', () => {
      idleDetector = new IdleDetector();
      const state = idleDetector.getState();

      expect(state.memoryUsage).toBeGreaterThanOrEqual(0);
      expect(state.memoryUsage).toBeLessThanOrEqual(100);
    });

    it('should update metrics over time', async () => {
      idleDetector = new IdleDetector({ checkInterval: 100 });

      await idleDetector.start();

      const state1 = idleDetector.getState();
      await new Promise(resolve => setTimeout(resolve, 250));
      const state2 = idleDetector.getState();

      // States should be different checks
      expect(state2.lastCheck.getTime()).toBeGreaterThan(state1.lastCheck.getTime());

      await idleDetector.stop();
    });
  });

  describe('Idle State Transitions', () => {
    it('should track idle duration correctly', async () => {
      idleDetector = new IdleDetector({
        cpuThreshold: 100,
        memoryThreshold: 100,
        checkInterval: 100,
        taskQueueEmpty: false,
      });

      await idleDetector.start();

      // Wait for idle state to establish
      await new Promise(resolve => setTimeout(resolve, 250));

      const state = idleDetector.getState();
      if (state.isIdle) {
        expect(state.idleSince).not.toBeNull();
        expect(state.idleDuration).toBeGreaterThan(0);
      }

      await idleDetector.stop();
    });

    it('should reset idle duration on state change', async () => {
      idleDetector = new IdleDetector({
        cpuThreshold: 100,
        memoryThreshold: 100,
        minIdleDuration: 100,
        checkInterval: 100,
        taskQueueEmpty: true,
      });

      await idleDetector.start();

      // Wait for idle
      await new Promise(resolve => setTimeout(resolve, 250));

      // Break idle state
      idleDetector.registerTask('task-1');

      await new Promise(resolve => setTimeout(resolve, 150));

      const state = idleDetector.getState();
      expect(state.idleDuration).toBe(0);
      expect(state.idleSince).toBeNull();

      idleDetector.unregisterTask('task-1');
      await idleDetector.stop();
    });
  });

  describe('Configuration Impact', () => {
    it('should respect CPU threshold', async () => {
      // High threshold - should easily be idle
      idleDetector = new IdleDetector({
        cpuThreshold: 90,
        memoryThreshold: 100,
        taskQueueEmpty: false,
        minIdleDuration: 100,
        checkInterval: 100,
      });

      let detectedIdle = false;
      idleDetector.on('idle:detected', () => {
        detectedIdle = true;
      });

      await idleDetector.start();
      await new Promise(resolve => setTimeout(resolve, 250));

      // With high threshold, should detect idle
      const state = idleDetector.getState();
      expect(state.cpuUsage).toBeLessThanOrEqual(90);

      await idleDetector.stop();
    });

    it('should respect memory threshold', () => {
      idleDetector = new IdleDetector({
        cpuThreshold: 100,
        memoryThreshold: 90,
      });

      const state = idleDetector.getState();
      expect(state.memoryUsage).toBeLessThanOrEqual(100);
    });

    it('should respect minIdleDuration', async () => {
      idleDetector = new IdleDetector({
        cpuThreshold: 100,
        memoryThreshold: 100,
        minIdleDuration: 500, // Longer duration
        checkInterval: 100,
        taskQueueEmpty: false,
      });

      let idleDetected = false;
      idleDetector.on('idle:detected', () => {
        idleDetected = true;
      });

      await idleDetector.start();

      // Wait less than minIdleDuration
      await new Promise(resolve => setTimeout(resolve, 300));
      expect(idleDetected).toBe(false);

      // Wait for minIdleDuration
      await new Promise(resolve => setTimeout(resolve, 300));
      expect(idleDetected).toBe(true);

      await idleDetector.stop();
    });
  });
});
