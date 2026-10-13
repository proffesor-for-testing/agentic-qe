/**
 * Issue #991 (+ #913): a schedules.json entry with no `schedule` key, or a
 * non-object entry, made parseSchedulesFile throw, so loadSchedules treated
 * the whole file as corrupt, backed it up and REMOVED it: every valid
 * schedule disappeared. Only genuinely unparseable JSON may take that path.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PersistentScheduler, type PersistedSchedule } from '../../../src/cli/scheduler/index.js';

let root: string;
let file: string;

const valid = (id: string): PersistedSchedule => ({
  id, workflowId: id, schedule: '0 * * * *', scheduleDescription: 'Hourly',
  pipelinePath: 'owned.yaml', nextRun: '2020-01-01T00:00:00.000Z',
  createdAt: '2020-01-01T00:00:00.000Z', enabled: true,
});

function writeEntries(entries: unknown[]): string {
  const content = JSON.stringify({ version: '1.0.0', updatedAt: '2020-01-01T00:00:00.000Z', schedules: entries });
  writeFileSync(file, content);
  return content;
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'aqe-991-'));
  file = join(root, 'schedules.json');
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

describe('malformed schedule entries (#991)', () => {
  it.each([
    ['no schedule key', { id: 'missing' }],
    ['workflowId but no schedule', { id: 'no-cron', workflowId: 'wf', enabled: true }],
    ['no workflowId', { id: 'no-wf', schedule: '0 * * * *', enabled: true }],
  ])('disables an entry with %s and keeps the file and valid schedules', async (_label, bad) => {
    const original = writeEntries([valid('keep-a'), bad, valid('keep-b')]);
    const scheduler = new PersistentScheduler({ schedulesPath: file });

    const loaded = await scheduler.getSchedules();

    expect(existsSync(file)).toBe(true);
    expect(readFileSync(file, 'utf8')).toBe(original);
    expect(loaded.map(s => s.id)).toEqual(['keep-a', (bad as { id: string }).id, 'keep-b']);
    const disabled = loaded[1];
    expect(disabled.enabled).toBe(false);
    expect(disabled.disabledReason).toMatch(/missing (cron expression|workflowId)/i);
    expect((await scheduler.getDueSchedules()).map(s => s.id)).toEqual(['keep-a', 'keep-b']);
    expect(readdirSync(root).filter(n => n.includes('.corrupt.'))).toEqual([]);
  });

  it.each([['a string', 'str'], ['a number', 5], ['null', null], ['an array', [1]], ['an object without id', { workflowId: 'x', schedule: '0 * * * *' }]])(
    'skips %s entry instead of deleting the file',
    async (_label, bad) => {
      const original = writeEntries([valid('keep-a'), bad, valid('keep-b')]);
      const scheduler = new PersistentScheduler({ schedulesPath: file });

      const loaded = await scheduler.getSchedules();

      expect(readFileSync(file, 'utf8')).toBe(original);
      expect(loaded.map(s => s.id)).toEqual(['keep-a', 'keep-b']);
      expect(readdirSync(root).filter(n => n.includes('.corrupt.'))).toEqual([]);
    },
  );

  it('quarantines skipped entries to a side file before a write drops them', async () => {
    writeEntries([valid('keep-a'), 'str', 5, null]);
    const scheduler = new PersistentScheduler({ schedulesPath: file });

    await scheduler.saveSchedule(valid('added'));

    const stored = JSON.parse(readFileSync(file, 'utf8')).schedules;
    expect(stored.map((s: PersistedSchedule) => s.id)).toEqual(['keep-a', 'added']);
    const quarantine = readdirSync(root).filter(n => n.includes('.quarantine.'));
    expect(quarantine).toHaveLength(1);
    expect(JSON.parse(readFileSync(join(root, quarantine[0]), 'utf8')).entries).toEqual(['str', 5, null]);
  });

  it('keeps a disabled malformed entry across a write and refuses to enable it', async () => {
    writeEntries([valid('keep-a'), { id: 'missing', workflowId: 'wf' }]);
    const scheduler = new PersistentScheduler({ schedulesPath: file });

    await scheduler.saveSchedule(valid('added'));
    const stored = JSON.parse(readFileSync(file, 'utf8')).schedules;
    expect(stored.map((s: PersistedSchedule) => s.id)).toEqual(['keep-a', 'missing', 'added']);
    expect(stored[1]).toMatchObject({ enabled: false });

    await expect(scheduler.setEnabled('missing', true)).rejects.toThrow(/missing cron expression/i);
    expect((await scheduler.getSchedule('missing'))?.enabled).toBe(false);
  });

  it('does not throw from markExecuted for an entry disabled on load (#913)', async () => {
    writeEntries([valid('keep-a'), { ...valid('legacy'), schedule: '0 22-27 * * *' }]);
    const scheduler = new PersistentScheduler({ schedulesPath: file });

    await expect(scheduler.markExecuted('legacy')).resolves.toBeUndefined();
    const legacy = await scheduler.getSchedule('legacy');
    expect(legacy?.enabled).toBe(false);
    expect(legacy?.lastRun).toBeDefined();
  });

  it('still backs up and removes a genuinely unparseable file', async () => {
    writeFileSync(file, '{ not json');
    const scheduler = new PersistentScheduler({ schedulesPath: file });

    expect(await scheduler.getSchedules()).toEqual([]);
    expect(existsSync(file)).toBe(false);
    expect(readdirSync(root).filter(n => n.includes('.corrupt.'))).toHaveLength(1);
  });

  it('backs up an unparseable file before a write replaces it', async () => {
    writeFileSync(file, '{ not json');
    const scheduler = new PersistentScheduler({ schedulesPath: file });

    await scheduler.saveSchedule(valid('added'));

    const backups = readdirSync(root).filter(n => n.includes('.corrupt.'));
    expect(backups).toHaveLength(1);
    expect(readFileSync(join(root, backups[0]), 'utf8')).toBe('{ not json');
    expect(JSON.parse(readFileSync(file, 'utf8')).schedules.map((s: PersistedSchedule) => s.id)).toEqual(['added']);
  });
});
