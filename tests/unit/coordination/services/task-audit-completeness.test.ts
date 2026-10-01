import { describe, expect, it } from 'vitest';
import { TaskAuditLogger } from '../../../../src/coordination/services/task-audit-logger.js';

describe('bounded task audit completeness (#695)', () => {
  it('reports lifecycle evidence lost to eviction and labels statistics as window counts', () => {
    const logger = new TaskAuditLogger({ maxEntries: 2, enableConsoleLog: false });
    logger.logSubmit('evicted-task');
    logger.logAssign('evicted-task', 'agent', 'test-generation');
    logger.logComplete('evicted-task', 'agent');
    expect(logger.getStatistics()).toMatchObject({ disposition: 'truncated', droppedEntries: 1 });
    const snapshot = logger.getSnapshot();
    expect(snapshot).toMatchObject({
      recordedEntries: 3, retainedEntries: 2, droppedEntries: 1,
      firstRetainedSequence: 2, lastRetainedSequence: 3, disposition: 'truncated',
    });
    expect(snapshot.entries.map(entry => entry.sequence)).toEqual([2, 3]);
    expect(logger.getStatistics()).toMatchObject({
      basis: 'retained-window', disposition: 'truncated', recordedEntries: 3,
      retainedEntries: 2, droppedEntries: 1, totalEntries: 2,
      operationCounts: { submit: 0, assign: 1, complete: 1 },
    });
  });

  it('keeps retention metadata when filtering or limiting the returned selection', () => {
    const logger = new TaskAuditLogger({ maxEntries: 3, enableConsoleLog: false });
    for (let i = 0; i < 5; i++) logger.logSubmit(`task-${i}`);
    const full = logger.getSnapshot();
    const limited = logger.getSnapshot({ limit: 1 });
    expect(limited).toMatchObject({ ...full, entries: [full.entries[2]] });
    expect(logger.getSnapshot({ taskId: 'absent' })).toMatchObject({ ...full, entries: [] });
    expect(logger.getSnapshot({ limit: 0 }).entries).toEqual([]);
    expect(logger.getEntries({ limit: 0 })).toEqual([]);
  });

  it('starts a distinguishable generation after clear, including empty resets', () => {
    const logger = new TaskAuditLogger({ maxEntries: 1, enableConsoleLog: false });
    logger.logSubmit('old'); logger.logComplete('old');
    const old = logger.getSnapshot();
    logger.clear();
    const cleared = logger.getSnapshot();
    expect(cleared.generation).not.toBe(old.generation);
    expect(cleared).toMatchObject({ recordedEntries: 0, droppedEntries: 0, retainedEntries: 0,
      firstRetainedSequence: null, lastRetainedSequence: null, disposition: 'complete', entries: [] });
    logger.logSubmit('new');
    expect(logger.getSnapshot().entries[0].sequence).toBe(1);
    logger.clear(); logger.clear();
    expect(logger.getSnapshot().generation).not.toBe(cleared.generation);
    expect(old).toMatchObject({ droppedEntries: 1, disposition: 'truncated' });
  });

  it('records loss when retention capacity is zero', () => {
    const logger = new TaskAuditLogger({ maxEntries: 0, enableConsoleLog: false });
    logger.logSubmit('task');
    expect(logger.getSnapshot()).toMatchObject({ recordedEntries: 1, retainedEntries: 0,
      droppedEntries: 1, firstRetainedSequence: null, lastRetainedSequence: null, disposition: 'truncated' });
  });

  it.each([-1, 1.5, NaN, Infinity])('rejects invalid retention capacity %s', maxEntries => {
    expect(() => new TaskAuditLogger({ maxEntries })).toThrow('maxEntries');
  });
});
