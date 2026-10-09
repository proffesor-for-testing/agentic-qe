import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { calculateNextRun, isValidCronExpression } from '../../../src/cli/utils/workflow-parser.js';
import { createScheduleEntry, PersistentScheduler } from '../../../src/cli/scheduler/index.js';

describe('accepted workflow cron schedules', () => {
  let root: string;
  beforeEach(() => {
    vi.stubEnv('TZ', 'UTC');
    root = mkdtempSync(join(tmpdir(), 'aqe-cron-regression-'));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true });
  });

  it.each([
    ['minute step', '*/5 * * * *', '2026-10-09T10:01:00Z', '2026-10-09T10:05:00.000Z'],
    ['weekday', '0 0 * * 1', '2026-10-09T10:01:00Z', '2026-10-12T00:00:00.000Z'],
    ['minute list', '15,45 * * * *', '2026-10-09T10:20:00Z', '2026-10-09T10:45:00.000Z'],
    ['minute range', '10-20 * * * *', '2026-10-09T10:12:00Z', '2026-10-09T10:13:00.000Z'],
    ['monthly', '0 0 1 * *', '2026-10-09T10:01:00Z', '2026-11-01T00:00:00.000Z'],
    ['range step', '10-20/5 * * * *', '2026-10-09T10:11:00Z', '2026-10-09T10:15:00.000Z'],
    ['numeric step', '0/35 * * * *', '2026-10-09T10:01:00Z', '2026-10-09T10:35:00.000Z'],
    ['both restricted days', '0 0 1 * 1', '2026-10-09T10:01:00Z', '2026-10-12T00:00:00.000Z'],
    ['stepped day and weekday', '0 0 */2 * 1', '2026-10-09T10:01:00Z', '2026-10-19T00:00:00.000Z'],
    ['Sunday seven', '0 0 * * 7', '2026-10-09T10:01:00Z', '2026-10-11T00:00:00.000Z'],
    ['leap-century gap', '0 0 29 2 *', '2096-02-29T00:00:00Z', '2104-02-29T00:00:00.000Z'],
    ['weekly alias', 'weekly', '2026-10-09T10:01:00Z', '2026-10-11T00:00:00.000Z'],
    ['hourly alias', 'hourly', '2026-10-09T10:01:00Z', '2026-10-09T11:00:00.000Z'],
    ['minutely alias', 'minutely', '2026-10-09T10:01:00Z', '2026-10-09T10:02:00.000Z'],
    ['every minute control', '* * * * *', '2026-10-09T10:01:00Z', '2026-10-09T10:02:00.000Z'],
    ['hourly control', '0 * * * *', '2026-10-09T10:01:00Z', '2026-10-09T11:00:00.000Z'],
    ['daily control', '0 9 * * *', '2026-10-09T10:01:00Z', '2026-10-10T09:00:00.000Z'],
  ])('finds the next %s match without mutating the start date', (_name, cron, from, expected) => {
    const start = new Date(from);
    expect(isValidCronExpression(cron)).toBe(true);
    expect(calculateNextRun(cron, start).toISOString()).toBe(expected);
    expect(start.toISOString()).toBe(new Date(from).toISOString());
  });

  it.each([
    ['0 2 * * *', 'America/New_York', '2026-03-08T06:59:00Z', '2026-03-09T06:00:00.000Z'],
    ['30 1 * * *', 'America/New_York', '2026-11-01T05:30:00Z', '2026-11-01T06:30:00.000Z'],
    ['45 1 * * *', 'Australia/Lord_Howe', '2026-04-04T14:45:00Z', '2026-04-04T15:15:00.000Z'],
  ])('uses local clock matches through DST for %s in %s', (cron, zone, from, expected) => {
    vi.stubEnv('TZ', zone);
    expect(calculateNextRun(cron, new Date(from)).toISOString()).toBe(expected);
  });

  it.each(['*/0 * * * *', '0 22-27 * * *', '20-10 * * * *', '0 0 * 12-13 *', '0 0 * * 8'])('rejects unexecutable %s', cron => {
    expect(isValidCronExpression(cron)).toBe(false);
    expect(() => calculateNextRun(cron)).toThrow(/Invalid cron expression/);
  });

  it('bounds a syntactically valid impossible calendar date', () => {
    expect(isValidCronExpression('0 0 31 2 *')).toBe(true);
    expect(() => calculateNextRun('0 0 31 2 *', new Date('2026-10-09T10:01:00Z'))).toThrow(/No matching cron date/);
  });

  it('rejects an invalid starting date', () => {
    expect(() => calculateNextRun('* * * * *', new Date(Number.NaN))).toThrow(/Invalid schedule start date/);
  });

  it('creates and persists an accepted stepped schedule', async () => {
    const scheduler = new PersistentScheduler({ schedulesPath: join(root, 'schedules.json') });
    const entry = createScheduleEntry({ workflowId: 'owned', pipelinePath: join(root, 'pipeline.yaml'), schedule: '*/5 * * * *', scheduleDescription: 'Every five minutes' });
    expect(new Date(entry.nextRun).getUTCMinutes() % 5).toBe(0);
    expect(Date.parse(entry.nextRun)).toBeGreaterThanOrEqual(Date.parse(entry.createdAt));
    await scheduler.saveSchedule(entry);
    expect(await scheduler.getSchedule(entry.id)).toEqual(entry);
  });

  it('updates an existing stepped schedule through the public persistence API', async () => {
    const scheduler = new PersistentScheduler({ schedulesPath: join(root, 'schedules.json') });
    await scheduler.saveSchedule({ id: 'owned', workflowId: 'owned', pipelinePath: join(root, 'pipeline.yaml'), schedule: '*/5 * * * *', scheduleDescription: 'Every five minutes', nextRun: '2026-10-09T10:05:00.000Z', enabled: true, createdAt: '2026-10-09T10:00:00.000Z' });
    await scheduler.markExecuted('owned');
    const stored = await scheduler.getSchedule('owned');
    expect(stored?.lastRun).toBeDefined();
    expect(new Date(stored!.nextRun).getUTCMinutes() % 5).toBe(0);
    expect(Date.parse(stored!.nextRun)).toBeGreaterThan(Date.parse(stored!.lastRun!));
  });
});
