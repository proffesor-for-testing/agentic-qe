import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PersistentScheduler, type PersistedSchedule } from '../../../src/cli/scheduler/index.js';
import { createWorkflowCommand } from '../../../src/cli/commands/workflow.js';
import type { CLIContext } from '../../../src/cli/handlers/interfaces.js';

let root: string;
let file: string;
const schedule = (id: string, cron: string): PersistedSchedule => ({
  id, workflowId: id, schedule: cron, scheduleDescription: 'Historical schedule',
  pipelinePath: 'owned.yaml', nextRun: '2020-01-01T00:00:00.000Z',
  createdAt: '2020-01-01T00:00:00.000Z', enabled: true,
});
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'aqe-legacy-cron-'));
  file = join(root, 'schedules.json');
  writeFileSync(file, JSON.stringify({ version: '1.0.0', updatedAt: '2020-01-01T00:00:00.000Z',
    schedules: [schedule('legacy-invalid', '0 22-27 * * *'), schedule('valid-control', '0 * * * *')] }));
});
afterEach(() => { vi.restoreAllMocks(); rmSync(root, { recursive: true, force: true }); });

describe('legacy persisted cron compatibility', () => {
  it('keeps invalid legacy entries visible but excludes them from due execution', async () => {
    const original = readFileSync(file, 'utf8');
    const scheduler = new PersistentScheduler({ schedulesPath: file });
    const loaded = await scheduler.getSchedules();
    expect(loaded).toHaveLength(2);
    expect(loaded[0]).toMatchObject({ id: 'legacy-invalid', enabled: false,
      disabledReason: expect.stringContaining('Invalid cron expression') });
    expect((await scheduler.getDueSchedules()).map(value => value.id)).toEqual(['valid-control']);
    expect(loaded[1]).toEqual(schedule('valid-control', '0 * * * *'));
    expect(readFileSync(file, 'utf8')).toBe(original);
  });

  it.each([5, { legacy: true }, 0, false, null, ''])('disables a non-string cron value %j without deleting the schedule file', async (cron) => {
    const good = schedule('valid-control', '0 * * * *');
    const bad = { ...schedule('typed-bad', 'ignored'), schedule: cron };
    const original = JSON.stringify({ version: '1.0.0', schedules: [good, bad] });
    writeFileSync(file, original);
    const scheduler = new PersistentScheduler({ schedulesPath: file });
    const loaded = await scheduler.getSchedules();
    expect(readFileSync(file, 'utf8')).toBe(original);
    expect(loaded).toHaveLength(2);
    expect(loaded[0]).toEqual(good);
    expect(loaded[1]).toMatchObject({ id: 'typed-bad', enabled: false,
      disabledReason: expect.stringContaining('Invalid cron expression') });
    expect((await scheduler.getDueSchedules()).map(value => value.id)).toEqual(['valid-control']);
    await scheduler.saveSchedule(schedule('added-control', '*/5 * * * *'));
    const stored = JSON.parse(readFileSync(file, 'utf8')).schedules;
    expect(stored).toHaveLength(3);
    expect(stored[0]).toEqual(good);
    expect(stored[1]).toMatchObject({ schedule: cron, enabled: false });
  });

  it('normalizes legacy entries in locked loads without discarding unrelated schedules', async () => {
    const scheduler = new PersistentScheduler({ schedulesPath: file });
    await scheduler.saveSchedule(schedule('added-control', '*/5 * * * *'));
    const stored = JSON.parse(readFileSync(file, 'utf8')).schedules;
    expect(stored).toHaveLength(3);
    expect(stored[0].enabled).toBe(false);
    expect(stored[0].disabledReason).toContain('Invalid cron expression');
    await expect(scheduler.setEnabled('legacy-invalid', true)).rejects.toThrow(/Invalid cron expression/);
    expect((await scheduler.getEnabledSchedules()).map(value => value.id)).toEqual(['valid-control', 'added-control']);
  });

  it('keeps supported schedules executable and preserves ordinary enable/disable behavior', async () => {
    const scheduler = new PersistentScheduler({ schedulesPath: file });
    await scheduler.markExecuted('valid-control');
    expect((await scheduler.getSchedule('valid-control'))?.lastRun).toBeDefined();
    await scheduler.setEnabled('valid-control', false);
    expect((await scheduler.getSchedule('valid-control'))?.enabled).toBe(false);
    await scheduler.setEnabled('valid-control', true);
    expect((await scheduler.getSchedule('valid-control'))?.enabled).toBe(true);
  });

  it('shows the disabled reason through the actual workflow list command', async () => {
    const messages: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...values) => { messages.push(values.join(' ')); });
    const exit = vi.fn(async () => undefined) as unknown as (code: number) => Promise<never>;
    const context = { persistentScheduler: new PersistentScheduler({ schedulesPath: file }) } as unknown as CLIContext;
    await createWorkflowCommand(context, exit, async () => true).parseAsync(['list', '--scheduled'], { from: 'user' });
    expect(messages.join('\n')).toContain('Invalid cron expression');
    expect(messages.join('\n')).toContain('legacy-invalid');
    expect(exit).toHaveBeenCalledWith(0);
  });
});
