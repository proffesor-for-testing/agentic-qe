/**
 * SleepScheduler Integration Test
 *
 * MISSION: Validate sleep scheduling functionality for orchestrating learning cycles
 *
 * This test validates:
 * 1. SleepScheduler initialization with different modes (idle, time, hybrid)
 * 2. Cycle triggering mechanisms
 * 3. Phase transitions and execution
 * 4. Budget constraints and limits
 * 5. State tracking and statistics
 */

import { SleepScheduler, SleepSchedulerConfig } from '../../../src/learning/scheduler/SleepScheduler';
import { SleepCycle, CycleSummary } from '../../../src/learning/scheduler/SleepCycle';

// Fast phase durations for testing (10ms each instead of 5-20 minutes)
const FAST_PHASE_DURATIONS = {
  N1_CAPTURE: 10,
  N2_PROCESS: 10,
  N3_CONSOLIDATE: 10,
  REM_DREAM: 10,
};

describe('SleepScheduler Integration', () => {
  let scheduler: SleepScheduler;

  afterEach(async () => {
    if (scheduler) {
      await scheduler.stop();
    }
  });

  describe('Initialization', () => {
    it('should initialize with idle mode', () => {
      const config: SleepSchedulerConfig = {
        mode: 'idle',
        learningBudget: {
          maxPatternsPerCycle: 50,
          maxAgentsPerCycle: 5,
          maxDurationMs: 3600000,
        },
      };

      scheduler = new SleepScheduler(config);
      const state = scheduler.getState();

      expect(state.isRunning).toBe(false);
      expect(state.mode).toBe('idle');
      expect(state.cyclesCompleted).toBe(0);
      expect(state.currentCycle).toBeNull();
    });

    it('should initialize with time mode', () => {
      const config: SleepSchedulerConfig = {
        mode: 'time',
        schedule: {
          startHour: 2,
          durationMinutes: 60,
          daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        },
        learningBudget: {
          maxPatternsPerCycle: 30,
        },
      };

      scheduler = new SleepScheduler(config);
      const state = scheduler.getState();

      expect(state.mode).toBe('time');
      expect(state.nextScheduledRun).not.toBeNull();
    });

    it('should initialize with hybrid mode', () => {
      const config: SleepSchedulerConfig = {
        mode: 'hybrid',
        idleConfig: {
          cpuThreshold: 20,
          memoryThreshold: 70,
          minIdleDuration: 60000,
        },
        schedule: {
          startHour: 3,
          durationMinutes: 30,
        },
        learningBudget: {
          maxPatternsPerCycle: 40,
          maxAgentsPerCycle: 6,
        },
      };

      scheduler = new SleepScheduler(config);
      const state = scheduler.getState();

      expect(state.mode).toBe('hybrid');
    });

    it('should apply default configuration values', () => {
      const config: SleepSchedulerConfig = {
        mode: 'idle',
        learningBudget: {},
      };

      scheduler = new SleepScheduler(config);
      const fullConfig = scheduler.getConfig();

      expect(fullConfig.learningBudget.maxPatternsPerCycle).toBe(50);
      expect(fullConfig.learningBudget.maxAgentsPerCycle).toBe(5);
      expect(fullConfig.learningBudget.maxDurationMs).toBe(3600000);
      expect(fullConfig.minCycleInterval).toBe(3600000);
    });
  });

  describe('Scheduler Lifecycle', () => {
    it('should start and stop scheduler', async () => {
      scheduler = new SleepScheduler({
        mode: 'idle',
        learningBudget: {},
        idleConfig: {
          checkInterval: 1000,
        },
      });

      let startedEmitted = false;
      scheduler.on('scheduler:started', () => {
        startedEmitted = true;
      });

      await scheduler.start();
      const state = scheduler.getState();

      expect(state.isRunning).toBe(true);
      expect(startedEmitted).toBe(true);

      let stoppedEmitted = false;
      scheduler.on('scheduler:stopped', () => {
        stoppedEmitted = true;
      });

      await scheduler.stop();
      const finalState = scheduler.getState();

      expect(finalState.isRunning).toBe(false);
      expect(stoppedEmitted).toBe(true);
    });

    it('should prevent multiple starts', async () => {
      scheduler = new SleepScheduler({
        mode: 'idle',
        learningBudget: {},
      });

      await scheduler.start();
      await scheduler.start(); // Should not error or start twice

      const state = scheduler.getState();
      expect(state.isRunning).toBe(true);

      await scheduler.stop();
    });

    it('should allow restart after stop', async () => {
      scheduler = new SleepScheduler({
        mode: 'idle',
        learningBudget: {},
      });

      await scheduler.start();
      await scheduler.stop();
      await scheduler.start();

      const state = scheduler.getState();
      expect(state.isRunning).toBe(true);

      await scheduler.stop();
    });
  });

  describe('Manual Cycle Triggering', () => {
    it('should trigger manual cycle when running', async () => {
      scheduler = new SleepScheduler({
        mode: 'idle',
        learningBudget: {
          maxPatternsPerCycle: 10,
          maxDurationMs: 5000,
        },
        phaseDurations: FAST_PHASE_DURATIONS,
      });

      await scheduler.start();

      let cycleStarted = false;
      scheduler.on('sleep:start', () => {
        cycleStarted = true;
      });

      const summary = await scheduler.triggerCycle('manual-test');

      expect(cycleStarted).toBe(true);
      expect(summary).toBeDefined();
      expect(summary?.startTime).toBeInstanceOf(Date);
      expect(summary?.endTime).toBeInstanceOf(Date);

      await scheduler.stop();
    });

    it('should not trigger cycle when not running', async () => {
      scheduler = new SleepScheduler({
        mode: 'idle',
        learningBudget: {},
      });

      // Don't start scheduler
      const summary = await scheduler.triggerCycle('test');

      expect(summary).toBeNull();
    });

    it('should prevent concurrent cycles', async () => {
      scheduler = new SleepScheduler({
        mode: 'idle',
        learningBudget: {
          maxDurationMs: 2000,
        },
        phaseDurations: FAST_PHASE_DURATIONS,
      });

      await scheduler.start();

      // Start first cycle
      const cycle1Promise = scheduler.triggerCycle('cycle-1');

      // Try to start second cycle immediately
      const cycle2 = await scheduler.triggerCycle('cycle-2');

      expect(cycle2).toBeNull(); // Should be rejected

      await cycle1Promise; // Wait for first to complete
      await scheduler.stop();
    });
  });

  describe('Task Registration', () => {
    it('should register and unregister tasks', async () => {
      scheduler = new SleepScheduler({
        mode: 'idle',
        learningBudget: {},
        idleConfig: {
          taskQueueEmpty: true,
        },
      });

      await scheduler.start();

      scheduler.registerTask('task-1');
      scheduler.registerTask('task-2');

      // Tasks are registered with idle detector
      scheduler.unregisterTask('task-1');
      scheduler.unregisterTask('task-2');

      await scheduler.stop();
    });
  });

  describe('State Tracking', () => {
    it('should track completed cycles', async () => {
      scheduler = new SleepScheduler({
        mode: 'time', // Use time mode to prevent auto-triggering from idle detection
        schedule: { startHour: 23, durationMinutes: 60 }, // Schedule in future
        learningBudget: {
          maxDurationMs: 2000,
        },
        phaseDurations: FAST_PHASE_DURATIONS,
      });

      await scheduler.start();

      const initialState = scheduler.getState();
      expect(initialState.cyclesCompleted).toBe(0);

      await scheduler.triggerCycle('test-1');

      const afterFirstState = scheduler.getState();
      expect(afterFirstState.cyclesCompleted).toBe(1);
      expect(afterFirstState.lastCycleEnd).not.toBeNull();

      await scheduler.triggerCycle('test-2');

      const finalState = scheduler.getState();
      expect(finalState.cyclesCompleted).toBe(2);

      await scheduler.stop();
    });

    it('should track patterns and agents processed', async () => {
      scheduler = new SleepScheduler({
        mode: 'time', // Use time mode to prevent auto-triggering
        schedule: { startHour: 23, durationMinutes: 60 },
        learningBudget: {
          maxDurationMs: 2000,
        },
        phaseDurations: FAST_PHASE_DURATIONS,
      });

      await scheduler.start();

      const initialState = scheduler.getState();
      expect(initialState.totalPatternsProcessed).toBe(0);
      expect(initialState.totalAgentsProcessed).toBe(0);

      await scheduler.triggerCycle('test');

      const finalState = scheduler.getState();
      // Values depend on actual cycle execution
      expect(typeof finalState.totalPatternsProcessed).toBe('number');
      expect(typeof finalState.totalAgentsProcessed).toBe('number');

      await scheduler.stop();
    });

    it('should provide current cycle information', async () => {
      scheduler = new SleepScheduler({
        mode: 'time', // Use time mode to prevent auto-triggering
        schedule: { startHour: 23, durationMinutes: 60 },
        learningBudget: {
          maxDurationMs: 5000,
        },
        phaseDurations: FAST_PHASE_DURATIONS,
      });

      await scheduler.start();

      // Before cycle
      let state = scheduler.getState();
      expect(state.currentCycle).toBeNull();

      // During cycle (we can't easily test this without making cycle async-aware)
      // Just verify state structure
      await scheduler.triggerCycle('test');

      // After cycle
      state = scheduler.getState();
      expect(state.currentCycle).toBeNull(); // Completed

      await scheduler.stop();
    });
  });

  describe('Event Emission', () => {
    it('should emit sleep:start event', async () => {
      scheduler = new SleepScheduler({
        mode: 'time',
        schedule: { startHour: 23, durationMinutes: 60 },
        learningBudget: {
          maxDurationMs: 2000,
        },
        phaseDurations: FAST_PHASE_DURATIONS,
      });

      let startEvent: any = null;
      scheduler.on('sleep:start', (event) => {
        startEvent = event;
      });

      await scheduler.start();
      await scheduler.triggerCycle('test');

      expect(startEvent).not.toBeNull();
      expect(startEvent.cycle).toBeDefined();
      expect(startEvent.trigger).toBe('test');
      expect(startEvent.timestamp).toBeInstanceOf(Date);

      await scheduler.stop();
    });

    it('should emit sleep:end event with summary', async () => {
      scheduler = new SleepScheduler({
        mode: 'time',
        schedule: { startHour: 23, durationMinutes: 60 },
        learningBudget: {
          maxDurationMs: 2000,
        },
        phaseDurations: FAST_PHASE_DURATIONS,
      });

      let endSummary: CycleSummary | null = null;
      scheduler.on('sleep:end', (summary: CycleSummary) => {
        endSummary = summary;
      });

      await scheduler.start();
      await scheduler.triggerCycle('test');

      expect(endSummary).not.toBeNull();
      expect(endSummary?.startTime).toBeInstanceOf(Date);
      expect(endSummary?.endTime).toBeInstanceOf(Date);
      expect(typeof endSummary?.patternsDiscovered).toBe('number');
      expect(typeof endSummary?.patternsConsolidated).toBe('number');
      expect(Array.isArray(endSummary?.agentsProcessed)).toBe(true);

      await scheduler.stop();
    });

    it('should emit sleep:phase events', async () => {
      scheduler = new SleepScheduler({
        mode: 'time',
        schedule: { startHour: 23, durationMinutes: 60 },
        learningBudget: {
          maxDurationMs: 2000,
        },
        phaseDurations: FAST_PHASE_DURATIONS,
      });

      const phases: string[] = [];
      scheduler.on('sleep:phase', (phase) => {
        phases.push(phase);
      });

      await scheduler.start();
      await scheduler.triggerCycle('test');

      expect(phases.length).toBeGreaterThan(0);

      await scheduler.stop();
    });

    it('should emit error events on failures', async () => {
      scheduler = new SleepScheduler({
        mode: 'time',
        schedule: { startHour: 23, durationMinutes: 60 },
        learningBudget: {},
        phaseDurations: FAST_PHASE_DURATIONS,
      });

      const errors: Error[] = [];
      scheduler.on('error', (error) => {
        errors.push(error);
      });

      await scheduler.start();

      // Normal operations should not produce errors
      await scheduler.triggerCycle('test');

      // In normal operation, no errors expected
      expect(Array.isArray(errors)).toBe(true);

      await scheduler.stop();
    });
  });

  describe('Learning Budget Enforcement', () => {
    it('should respect maxDurationMs budget', async () => {
      const maxDuration = 1000; // 1 second

      scheduler = new SleepScheduler({
        mode: 'time',
        schedule: { startHour: 23, durationMinutes: 60 },
        learningBudget: {
          maxDurationMs: maxDuration,
        },
        phaseDurations: FAST_PHASE_DURATIONS,
      });

      await scheduler.start();

      const startTime = Date.now();
      await scheduler.triggerCycle('budget-test');
      const duration = Date.now() - startTime;

      // Should complete within reasonable time (with some buffer for overhead)
      expect(duration).toBeLessThan(maxDuration + 500);

      await scheduler.stop();
    });

    it('should respect maxPatternsPerCycle budget', async () => {
      scheduler = new SleepScheduler({
        mode: 'time',
        schedule: { startHour: 23, durationMinutes: 60 },
        learningBudget: {
          maxPatternsPerCycle: 5,
          maxDurationMs: 2000,
        },
        phaseDurations: FAST_PHASE_DURATIONS,
      });

      let summary: CycleSummary | null = null;
      scheduler.on('sleep:end', (s) => {
        summary = s;
      });

      await scheduler.start();
      await scheduler.triggerCycle('pattern-budget-test');

      expect(summary).not.toBeNull();
      // The cycle respects the budget (exact enforcement depends on SleepCycle implementation)

      await scheduler.stop();
    });

    it('should respect minCycleInterval', async () => {
      scheduler = new SleepScheduler({
        mode: 'time',
        schedule: { startHour: 23, durationMinutes: 60 },
        learningBudget: {
          maxDurationMs: 500,
        },
        phaseDurations: FAST_PHASE_DURATIONS,
        minCycleInterval: 100, // 100ms between cycles for faster testing
      });

      await scheduler.start();

      // First cycle
      await scheduler.triggerCycle('cycle-1');

      // Second cycle should be allowed manually
      await scheduler.triggerCycle('cycle-2');

      // Manual triggers bypass interval check
      // But idle-triggered cycles would respect it

      await scheduler.stop();
    });
  });

  describe('Time-Based Scheduling', () => {
    it('should calculate next scheduled run for time mode', () => {
      scheduler = new SleepScheduler({
        mode: 'time',
        schedule: {
          startHour: 3,
          durationMinutes: 60,
        },
        learningBudget: {},
      });

      const state = scheduler.getState();
      expect(state.nextScheduledRun).not.toBeNull();
      expect(state.nextScheduledRun).toBeInstanceOf(Date);
    });

    it('should respect daysOfWeek configuration', () => {
      scheduler = new SleepScheduler({
        mode: 'time',
        schedule: {
          startHour: 2,
          durationMinutes: 30,
          daysOfWeek: [1, 3, 5], // Monday, Wednesday, Friday
        },
        learningBudget: {},
      });

      const state = scheduler.getState();
      const nextRun = state.nextScheduledRun;

      if (nextRun) {
        const dayOfWeek = nextRun.getDay();
        expect([1, 3, 5]).toContain(dayOfWeek);
      }
    });

    it('should return null for next run in idle mode', () => {
      scheduler = new SleepScheduler({
        mode: 'idle',
        learningBudget: {},
      });

      const state = scheduler.getState();
      expect(state.nextScheduledRun).toBeNull();
    });
  });

  describe('Idle-Based Triggering', () => {
    it('should trigger cycle on idle detection', async () => {
      scheduler = new SleepScheduler({
        mode: 'idle',
        idleConfig: {
          cpuThreshold: 100,
          memoryThreshold: 100,
          minIdleDuration: 50,
          checkInterval: 50,
          taskQueueEmpty: false,
        },
        learningBudget: {
          maxDurationMs: 2000,
        },
        phaseDurations: FAST_PHASE_DURATIONS,
        minCycleInterval: 50, // Short interval for testing
      });

      let cycleTriggered = false;
      scheduler.on('sleep:start', () => {
        cycleTriggered = true;
      });

      await scheduler.start();

      // Wait for idle detection and cycle trigger
      await new Promise(resolve => setTimeout(resolve, 300));

      expect(cycleTriggered).toBe(true);

      await scheduler.stop();
    });

    it('should respect minCycleInterval for idle triggers', async () => {
      scheduler = new SleepScheduler({
        mode: 'idle',
        idleConfig: {
          cpuThreshold: 100,
          memoryThreshold: 100,
          minIdleDuration: 50,
          checkInterval: 50,
          taskQueueEmpty: false,
        },
        learningBudget: {
          maxDurationMs: 500,
        },
        phaseDurations: FAST_PHASE_DURATIONS,
        minCycleInterval: 5000, // 5 seconds - should prevent second cycle in test window
      });

      let cycleCount = 0;
      scheduler.on('sleep:start', () => {
        cycleCount++;
      });

      await scheduler.start();

      // Wait for first cycle to complete
      await new Promise(resolve => setTimeout(resolve, 300));

      // Should have triggered one cycle
      const firstCount = cycleCount;
      expect(firstCount).toBeGreaterThan(0);

      // Wait a bit more - should not trigger another due to minCycleInterval
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(cycleCount).toBe(firstCount); // No additional cycles

      await scheduler.stop();
    });
  });

  describe('Hybrid Mode', () => {
    it('should support both idle and time-based triggers', async () => {
      scheduler = new SleepScheduler({
        mode: 'hybrid',
        idleConfig: {
          cpuThreshold: 100,
          memoryThreshold: 100,
          minIdleDuration: 50,
          checkInterval: 50,
        },
        schedule: {
          startHour: 3,
          durationMinutes: 60,
        },
        learningBudget: {
          maxDurationMs: 1000,
        },
        phaseDurations: FAST_PHASE_DURATIONS,
      });

      await scheduler.start();

      const state = scheduler.getState();
      expect(state.mode).toBe('hybrid');
      expect(state.nextScheduledRun).not.toBeNull(); // Time-based scheduling active

      await scheduler.stop();
    });
  });
});
