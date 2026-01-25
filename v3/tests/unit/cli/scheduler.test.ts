/**
 * Tests for PersistentScheduler
 * ADR-041: Persistent Workflow Scheduling
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  PersistentScheduler,
  createPersistentScheduler,
  generateScheduleId,
  createScheduleEntry,
  type PersistedSchedule,
} from '../../../src/cli/scheduler/index.js';

describe('PersistentScheduler', () => {
  let scheduler: PersistentScheduler;
  let testDir: string;
  let testSchedulesPath: string;

  beforeEach(() => {
    // Create temp directory for test
    testDir = path.join(os.tmpdir(), `aqe-scheduler-test-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });
    testSchedulesPath = path.join(testDir, 'schedules.json');
    scheduler = new PersistentScheduler({ schedulesPath: testSchedulesPath });
  });

  afterEach(() => {
    // Clean up temp directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('initialization', () => {
    it('should create directory if it does not exist', async () => {
      const deepPath = path.join(testDir, 'deep', 'nested', 'schedules.json');
      const deepScheduler = new PersistentScheduler({ schedulesPath: deepPath });

      await deepScheduler.loadSchedules();

      expect(fs.existsSync(path.dirname(deepPath))).toBe(true);
    });

    it('should return empty array if schedules file does not exist', async () => {
      const schedules = await scheduler.loadSchedules();
      expect(schedules).toEqual([]);
    });
  });

  describe('saveSchedule', () => {
    it('should save a new schedule', async () => {
      const schedule = createTestSchedule();

      await scheduler.saveSchedule(schedule);

      const schedules = await scheduler.getSchedules();
      expect(schedules).toHaveLength(1);
      expect(schedules[0].id).toBe(schedule.id);
    });

    it('should update existing schedule with same ID', async () => {
      const schedule = createTestSchedule();
      await scheduler.saveSchedule(schedule);

      const updatedSchedule = { ...schedule, enabled: false };
      await scheduler.saveSchedule(updatedSchedule);

      const schedules = await scheduler.getSchedules();
      expect(schedules).toHaveLength(1);
      expect(schedules[0].enabled).toBe(false);
    });

    it('should persist schedules to disk', async () => {
      const schedule = createTestSchedule();
      await scheduler.saveSchedule(schedule);

      // Create new scheduler instance to verify persistence
      const newScheduler = new PersistentScheduler({ schedulesPath: testSchedulesPath });
      const schedules = await newScheduler.getSchedules();

      expect(schedules).toHaveLength(1);
      expect(schedules[0].id).toBe(schedule.id);
    });
  });

  describe('removeSchedule', () => {
    it('should remove a schedule by ID', async () => {
      const schedule = createTestSchedule();
      await scheduler.saveSchedule(schedule);

      await scheduler.removeSchedule(schedule.id);

      const schedules = await scheduler.getSchedules();
      expect(schedules).toHaveLength(0);
    });

    it('should not throw if schedule does not exist', async () => {
      await expect(scheduler.removeSchedule('nonexistent')).resolves.not.toThrow();
    });
  });

  describe('getSchedule', () => {
    it('should return schedule by ID', async () => {
      const schedule = createTestSchedule();
      await scheduler.saveSchedule(schedule);

      const retrieved = await scheduler.getSchedule(schedule.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(schedule.id);
    });

    it('should return undefined for nonexistent ID', async () => {
      const retrieved = await scheduler.getSchedule('nonexistent');
      expect(retrieved).toBeUndefined();
    });
  });

  describe('getDueSchedules', () => {
    it('should return schedules with nextRun in the past', async () => {
      const pastSchedule = createTestSchedule({
        nextRun: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
      });
      const futureSchedule = createTestSchedule({
        id: 'future-schedule',
        nextRun: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
      });

      await scheduler.saveSchedule(pastSchedule);
      await scheduler.saveSchedule(futureSchedule);

      const due = await scheduler.getDueSchedules();

      expect(due).toHaveLength(1);
      expect(due[0].id).toBe(pastSchedule.id);
    });

    it('should not return disabled schedules', async () => {
      const disabledSchedule = createTestSchedule({
        nextRun: new Date(Date.now() - 3600000).toISOString(),
        enabled: false,
      });

      await scheduler.saveSchedule(disabledSchedule);

      const due = await scheduler.getDueSchedules();
      expect(due).toHaveLength(0);
    });
  });

  describe('markExecuted', () => {
    it('should update lastRun and calculate new nextRun', async () => {
      const schedule = createTestSchedule({
        schedule: '0 0 * * *', // Daily at midnight
      });
      await scheduler.saveSchedule(schedule);

      await scheduler.markExecuted(schedule.id);

      const updated = await scheduler.getSchedule(schedule.id);
      expect(updated?.lastRun).toBeDefined();
      expect(new Date(updated!.nextRun).getTime()).toBeGreaterThan(Date.now());
    });

    it('should throw for nonexistent schedule', async () => {
      await expect(scheduler.markExecuted('nonexistent')).rejects.toThrow('Schedule not found');
    });
  });

  describe('setEnabled', () => {
    it('should enable a schedule and recalculate nextRun', async () => {
      const schedule = createTestSchedule({
        enabled: false,
        nextRun: new Date(Date.now() - 3600000).toISOString(), // Past
      });
      await scheduler.saveSchedule(schedule);

      await scheduler.setEnabled(schedule.id, true);

      const updated = await scheduler.getSchedule(schedule.id);
      expect(updated?.enabled).toBe(true);
      expect(new Date(updated!.nextRun).getTime()).toBeGreaterThan(Date.now());
    });

    it('should disable a schedule', async () => {
      const schedule = createTestSchedule({ enabled: true });
      await scheduler.saveSchedule(schedule);

      await scheduler.setEnabled(schedule.id, false);

      const updated = await scheduler.getSchedule(schedule.id);
      expect(updated?.enabled).toBe(false);
    });
  });

  describe('getEnabledSchedules', () => {
    it('should return only enabled schedules', async () => {
      const enabledSchedule = createTestSchedule({ enabled: true });
      const disabledSchedule = createTestSchedule({ id: 'disabled', enabled: false });

      await scheduler.saveSchedule(enabledSchedule);
      await scheduler.saveSchedule(disabledSchedule);

      const enabled = await scheduler.getEnabledSchedules();

      expect(enabled).toHaveLength(1);
      expect(enabled[0].id).toBe(enabledSchedule.id);
    });
  });

  describe('getSchedulesByWorkflow', () => {
    it('should return schedules for specific workflow', async () => {
      const schedule1 = createTestSchedule({ workflowId: 'workflow-1' });
      const schedule2 = createTestSchedule({ id: 'sched-2', workflowId: 'workflow-2' });
      const schedule3 = createTestSchedule({ id: 'sched-3', workflowId: 'workflow-1' });

      await scheduler.saveSchedule(schedule1);
      await scheduler.saveSchedule(schedule2);
      await scheduler.saveSchedule(schedule3);

      const forWorkflow1 = await scheduler.getSchedulesByWorkflow('workflow-1');

      expect(forWorkflow1).toHaveLength(2);
    });
  });

  describe('clearAll', () => {
    it('should remove all schedules', async () => {
      await scheduler.saveSchedule(createTestSchedule());
      await scheduler.saveSchedule(createTestSchedule({ id: 'sched-2' }));

      await scheduler.clearAll();

      const schedules = await scheduler.getSchedules();
      expect(schedules).toHaveLength(0);
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', async () => {
      await scheduler.saveSchedule(createTestSchedule({ enabled: true }));
      await scheduler.saveSchedule(createTestSchedule({ id: 's2', enabled: false }));
      await scheduler.saveSchedule(createTestSchedule({
        id: 's3',
        enabled: true,
        nextRun: new Date(Date.now() - 3600000).toISOString(), // Due
      }));

      const stats = await scheduler.getStats();

      expect(stats.total).toBe(3);
      expect(stats.enabled).toBe(2);
      expect(stats.disabled).toBe(1);
      expect(stats.due).toBe(1);
    });
  });

  describe('corrupt file handling', () => {
    it('should handle corrupt JSON gracefully', async () => {
      // Write corrupt JSON
      fs.writeFileSync(testSchedulesPath, '{ invalid json }', 'utf-8');

      const schedules = await scheduler.loadSchedules();

      expect(schedules).toEqual([]);
      // Corrupt file should be backed up
      const files = fs.readdirSync(testDir);
      expect(files.some(f => f.includes('.corrupt.'))).toBe(true);
    });

    it('should handle missing schedules array', async () => {
      fs.writeFileSync(testSchedulesPath, '{ "version": "1.0.0" }', 'utf-8');

      const schedules = await scheduler.loadSchedules();

      expect(schedules).toEqual([]);
    });
  });
});

describe('Helper Functions', () => {
  describe('generateScheduleId', () => {
    it('should generate unique IDs', () => {
      const id1 = generateScheduleId();
      const id2 = generateScheduleId();

      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^sched-[a-z0-9]+-[a-z0-9]+$/);
    });
  });

  describe('createScheduleEntry', () => {
    it('should create complete schedule entry with defaults', () => {
      const entry = createScheduleEntry({
        workflowId: 'test-workflow',
        pipelinePath: '/path/to/pipeline.yaml',
        schedule: '0 0 * * *',
        scheduleDescription: 'Daily at midnight',
      });

      expect(entry.id).toBeDefined();
      expect(entry.workflowId).toBe('test-workflow');
      expect(entry.enabled).toBe(true);
      expect(entry.nextRun).toBeDefined();
      expect(entry.createdAt).toBeDefined();
    });

    it('should allow overriding enabled', () => {
      const entry = createScheduleEntry({
        workflowId: 'test',
        pipelinePath: '/path',
        schedule: '* * * * *',
        scheduleDescription: 'Every minute',
        enabled: false,
      });

      expect(entry.enabled).toBe(false);
    });
  });
});

describe('createPersistentScheduler factory', () => {
  it('should create PersistentScheduler instance', () => {
    const scheduler = createPersistentScheduler();
    expect(scheduler).toBeInstanceOf(PersistentScheduler);
  });

  it('should accept custom config', () => {
    // Use /tmp path which is allowed by security validation
    const scheduler = createPersistentScheduler({
      schedulesPath: '/tmp/aqe-test/schedules.json',
      debug: true,
    });
    expect(scheduler).toBeInstanceOf(PersistentScheduler);
  });

  it('should reject custom path outside allowed directories', () => {
    expect(() => createPersistentScheduler({
      schedulesPath: '/custom/path/schedules.json',
      debug: true,
    })).toThrow(/Security: Custom schedulesPath must be within/);
  });
});

// ============================================================================
// Test Helpers
// ============================================================================

function createTestSchedule(overrides: Partial<PersistedSchedule> = {}): PersistedSchedule {
  return {
    id: 'test-schedule-1',
    workflowId: 'test-workflow',
    pipelinePath: '/path/to/pipeline.yaml',
    schedule: '0 0 * * *',
    scheduleDescription: 'Daily at midnight',
    nextRun: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
    enabled: true,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}
