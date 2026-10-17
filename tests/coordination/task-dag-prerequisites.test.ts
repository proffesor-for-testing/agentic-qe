/**
 * Unit tests for typed prerequisite dispositions and receipts (issue #1069)
 *
 * Real DAG-state tests for every disposition path, waiver validation and
 * policy, graph revisions with compare-and-swap guards, and the original
 * obligation denominator. London-school tests cover the scheduler's
 * delegation to the DAG.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TaskDAG } from '../../src/coordination/task-dag/dag.js';
import { DAGScheduler } from '../../src/coordination/task-dag/scheduler.js';
import {
  GraphRevisionConflictError,
  PrerequisiteWaiverError,
} from '../../src/coordination/task-dag/prerequisite-ledger.js';
import {
  PREREQUISITE_RECEIPT_SCHEMA,
  type AddTaskInput,
  type DAGEvent,
  type ObligationSummary,
  type WaivePrerequisiteInput,
} from '../../src/coordination/task-dag/types.js';

function task(id: string, blockedBy?: string[]): AddTaskInput {
  return { id, name: `Task ${id}`, domain: 'ci', blockedBy };
}

function run(dag: TaskDAG, id: string, evidenceRef?: string): string[] {
  dag.start(id, 'agent-1');
  return dag.complete(id, undefined, evidenceRef ? { evidenceRef } : {});
}

function waiver(overrides: Partial<WaivePrerequisiteInput> = {}): WaivePrerequisiteInput {
  return { taskId: 'b', prerequisiteId: 'a', actor: 'release-lead', reason: 'gate retired', ...overrides };
}

const dispositionOf = (dag: TaskDAG, taskId: string, prereq: string) =>
  dag.getPrerequisiteDispositions(taskId).find((e) => e.prerequisiteId === prereq)?.disposition;

describe('TaskDAG prerequisites - disposition paths', () => {
  let dag: TaskDAG;
  beforeEach(() => { dag = new TaskDAG({ graphId: 'g-test' }); });

  it('records UNRESOLVED when a dependent is added before its prerequisite finishes', () => {
    dag.addTask(task('a'));
    dag.addTask(task('b', ['a']));
    expect(dispositionOf(dag, 'b', 'a')).toBe('UNRESOLVED');
    expect(dag.getTask('b')?.status).toBe('blocked');
  });

  it('complete() records SATISFIED bound to evidence and revision', () => {
    dag.addTask(task('a'));
    dag.addTask(task('b', ['a']));
    const unblocked = run(dag, 'a', 'junit://run-42');
    const [edge] = dag.getPrerequisiteDispositions('b');
    expect(unblocked).toEqual(['b']);
    expect(edge.disposition).toBe('SATISFIED');
    expect(edge.receipt.completionEvidenceRef).toBe('junit://run-42');
    expect(edge.receipt.graphRevision).toBe(dag.graphRevision);
    expect(dag.getTask('a')?.evidenceRef).toBe('junit://run-42');
  });

  it('removing an unfinished prerequisite records REMOVED and fails closed', () => {
    dag.addTask(task('a'));
    dag.addTask(task('b', ['a']));
    dag.removeTask('a');
    expect(dispositionOf(dag, 'b', 'a')).toBe('REMOVED');
    expect(dag.getTask('b')?.status).toBe('blocked');
    expect(dag.getRemovedTasks()).toEqual([expect.objectContaining({ taskId: 'a', statusAtRemoval: 'ready' })]);
    expect(dag.getReceipts({ taskId: 'b' }).map((r) => r.disposition)).toEqual(['UNRESOLVED', 'REMOVED']);
  });

  it('completing a sibling does not unblock a join whose other parent was removed', () => {
    dag.addTask(task('a'));
    dag.addTask(task('c'));
    dag.addTask(task('join', ['a', 'c']));
    dag.removeTask('a');
    expect(run(dag, 'c')).toEqual([]);
    expect(dag.getTask('join')?.status).toBe('blocked');
    expect(dag.getBlockers('join')).toEqual([
      expect.objectContaining({ prerequisiteId: 'a', disposition: 'REMOVED' }),
    ]);
  });

  it('removing a completed prerequisite keeps the SATISFIED receipt and readiness', () => {
    dag.addTask(task('a'));
    dag.addTask(task('b', ['a']));
    run(dag, 'a');
    dag.removeTask('a');
    expect(dispositionOf(dag, 'b', 'a')).toBe('SATISFIED');
    expect(dag.getTask('b')?.status).toBe('ready');
  });

  it('fail() records FAILED, cancels dependents and marks downstream edges CANCELLED', () => {
    dag.addTask(task('a'));
    dag.addTask(task('b', ['a']));
    dag.addTask(task('c', ['b']));
    dag.start('a', 'agent-1');
    dag.fail('a', 'crash');
    expect(dispositionOf(dag, 'b', 'a')).toBe('FAILED');
    expect(dispositionOf(dag, 'c', 'b')).toBe('CANCELLED');
    expect(dag.getTask('b')?.status).toBe('cancelled');
    expect(dag.getTask('c')?.status).toBe('cancelled');
    expect(dag.getReady()).toEqual([]);
  });

  it('a dependent added after its prerequisite failed is FAILED and never ready', () => {
    dag.addTask(task('a'));
    dag.fail('a', 'crash');
    dag.addTask(task('b', ['a']));
    expect(dispositionOf(dag, 'b', 'a')).toBe('FAILED');
    expect(dag.getTask('b')?.status).toBe('blocked');
  });

  it('cancel() records CANCELLED and cascades', () => {
    dag.addTask(task('a'));
    dag.addTask(task('b', ['a']));
    dag.cancel('a', 'descoped');
    expect(dag.getTask('a')).toEqual(expect.objectContaining({ status: 'cancelled', error: 'descoped' }));
    expect(dispositionOf(dag, 'b', 'a')).toBe('CANCELLED');
    expect(dag.getTask('b')?.error).toBe("Cancelled: upstream task 'a' cancelled");
  });

  it('cancel() rejects terminal tasks', () => {
    dag.addTask(task('a'));
    run(dag, 'a');
    expect(() => dag.cancel('a', 'late')).toThrow(/terminal/);
  });

  it('MISSING prerequisites stay blocked until materialized, independent of insertion order', () => {
    dag.addTask(task('b', ['a']));
    expect(dispositionOf(dag, 'b', 'a')).toBe('MISSING');
    expect(dag.getTask('b')?.status).toBe('blocked');
    dag.addTask(task('a'));
    expect(dispositionOf(dag, 'b', 'a')).toBe('UNRESOLVED');
    expect(dag.getTask('b')?.status).toBe('blocked');
    run(dag, 'a');
    expect(dag.getTask('b')?.status).toBe('ready');
  });

  it('re-adding a removed prerequisite re-opens the edge as UNRESOLVED', () => {
    dag.addTask(task('a'));
    dag.addTask(task('b', ['a']));
    dag.removeTask('a');
    dag.addTask(task('a'));
    expect(dispositionOf(dag, 'b', 'a')).toBe('UNRESOLVED');
    expect(dag.getRemovedTasks()).toEqual([]);
    run(dag, 'a');
    expect(dag.getTask('b')?.status).toBe('ready');
  });

  it('a new dependent of a removed task starts REMOVED', () => {
    dag.addTask(task('a'));
    dag.removeTask('a');
    dag.addTask(task('b', ['a']));
    expect(dispositionOf(dag, 'b', 'a')).toBe('REMOVED');
  });

  it('fork/join: the join reports exactly the unresolved parent as its blocker', () => {
    dag.addTask(task('left'));
    dag.addTask(task('right'));
    dag.addTask(task('join', ['left', 'right']));
    run(dag, 'left');
    expect(dag.getTask('join')?.status).toBe('blocked');
    expect(dag.getBlockers('join')).toEqual([
      expect.objectContaining({ prerequisiteId: 'right', disposition: 'UNRESOLVED' }),
    ]);
  });

  it('receipts are frozen, versioned and stamped with the graph identity', () => {
    dag.addTask(task('a'));
    dag.addTask(task('b', ['a']));
    const [receipt] = dag.getReceipts();
    expect(receipt.schema).toBe(PREREQUISITE_RECEIPT_SCHEMA);
    expect(receipt.schema).toBe('aqe.task-prerequisite@1');
    expect(receipt.graphId).toBe('g-test');
    expect(Number.isNaN(Date.parse(receipt.observedAt))).toBe(false);
    expect(Object.isFrozen(receipt)).toBe(true);
  });

  it('toJSON exposes graph identity, receipts and tombstones', () => {
    dag.addTask(task('a'));
    dag.addTask(task('b', ['a']));
    dag.removeTask('a');
    const json = dag.toJSON();
    expect(json.graphId).toBe('g-test');
    expect(json.graphRevision).toBe(dag.graphRevision);
    expect(json.receipts).toHaveLength(2);
    expect(json.removedTasks.map((r) => r.taskId)).toEqual(['a']);
    expect(json.edges).toEqual([{ from: 'a', to: 'b' }]);
  });

  it('emits task-removed with the affected dependents', () => {
    const events: DAGEvent[] = [];
    dag.onEvent((e) => events.push(e));
    dag.addTask(task('a'));
    dag.addTask(task('b', ['a']));
    dag.removeTask('a');
    expect(events.find((e) => e.type === 'task-removed')).toEqual(
      expect.objectContaining({ taskId: 'a', affectedTaskIds: ['b'] })
    );
    expect(events.some((e) => e.type === 'tasks-unblocked')).toBe(false);
  });
});

describe('TaskDAG prerequisites - waivers', () => {
  let dag: TaskDAG;
  beforeEach(() => {
    dag = new TaskDAG();
    dag.addTask(task('a'));
    dag.addTask(task('b', ['a']));
  });

  it('waiving an unresolved edge makes the dependent ready and keeps the edge', () => {
    const events: DAGEvent[] = [];
    dag.onEvent((e) => events.push(e));
    const receipt = dag.waivePrerequisite(waiver({ authorityRef: 'ADR-064' }));
    expect(receipt.disposition).toBe('WAIVED');
    expect(receipt.waiver).toEqual(expect.objectContaining({
      actor: 'release-lead', reason: 'gate retired', authorityRef: 'ADR-064',
    }));
    expect(Number.isNaN(Date.parse(receipt.waiver!.issuedAt))).toBe(false);
    expect(dag.getTask('b')?.status).toBe('ready');
    expect(dag.getTask('b')?.blockedBy).toEqual(['a']);
    expect(events.map((e) => e.type)).toEqual(['prerequisite-waived', 'task-ready', 'tasks-unblocked']);
  });

  it('waiving a REMOVED edge unblocks only after the explicit waiver', () => {
    dag.removeTask('a');
    expect(dag.getTask('b')?.status).toBe('blocked');
    dag.waivePrerequisite(waiver());
    expect(dag.getTask('b')?.status).toBe('ready');
    expect(dag.getReceipts({ taskId: 'b' }).map((r) => r.disposition)).toEqual(['UNRESOLVED', 'REMOVED', 'WAIVED']);
  });

  it('a waived edge that later completes is upgraded to SATISFIED', () => {
    dag.waivePrerequisite(waiver());
    run(dag, 'a', 'evidence-1');
    expect(dispositionOf(dag, 'b', 'a')).toBe('SATISFIED');
  });

  it('a waived edge stays WAIVED when the prerequisite later fails', () => {
    dag.waivePrerequisite(waiver());
    dag.fail('a', 'crash');
    expect(dispositionOf(dag, 'b', 'a')).toBe('WAIVED');
    expect(dag.getTask('b')?.status).toBe('ready');
  });

  it('one waiver does not unblock a join with another unresolved parent', () => {
    dag.addTask(task('c'));
    dag.addTask(task('join', ['a', 'c']));
    dag.waivePrerequisite(waiver({ taskId: 'join' }));
    expect(dag.getTask('join')?.status).toBe('blocked');
    expect(dag.getBlockers('join').map((e) => e.prerequisiteId)).toEqual(['c']);
  });

  it.each([
    ['missing actor', { actor: undefined }, /actor/],
    ['blank actor', { actor: '   ' }, /actor/],
    ['missing reason', { reason: undefined }, /reason/],
    ['blank reason', { reason: '' }, /reason/],
    ['non-string reason', { reason: 42 }, /reason/],
    ['oversized reason', { reason: 'x'.repeat(4097) }, /exceeds/],
    ['blank authorityRef', { authorityRef: ' ' }, /authorityRef/],
    ['non-integer expectedRevision', { expectedRevision: 1.5 }, /expectedRevision/],
    ['unknown task', { taskId: 'nope' }, /not found/],
    ['unknown edge', { prerequisiteId: 'nope' }, /no prerequisite/],
  ])('rejects %s at the boundary', (_label, overrides, pattern) => {
    const before = dag.graphRevision;
    expect(() => dag.waivePrerequisite(waiver(overrides as Partial<WaivePrerequisiteInput>)))
      .toThrow(PrerequisiteWaiverError);
    expect(() => dag.waivePrerequisite(waiver(overrides as Partial<WaivePrerequisiteInput>))).toThrow(pattern);
    expect(dag.graphRevision).toBe(before);
    expect(dag.getTask('b')?.status).toBe('blocked');
  });

  it('rejects a non-object input', () => {
    expect(() => dag.waivePrerequisite(null as unknown as WaivePrerequisiteInput)).toThrow(PrerequisiteWaiverError);
  });

  it('rejects waiving an already SATISFIED edge', () => {
    run(dag, 'a');
    expect(() => dag.waivePrerequisite(waiver())).toThrow(/already SATISFIED/);
  });

  it('rejects waiving for a terminal dependent', () => {
    dag.fail('a', 'crash');
    expect(() => dag.waivePrerequisite(waiver())).toThrow(/terminal/);
  });

  it('trims actor and reason before recording them', () => {
    const receipt = dag.waivePrerequisite(waiver({ actor: '  lead  ', reason: ' why ' }));
    expect(receipt.waiver).toEqual(expect.objectContaining({ actor: 'lead', reason: 'why' }));
  });
});

describe('TaskDAG prerequisites - waiver policy (London school)', () => {
  it('consults the policy with the full request and rejects when it denies', () => {
    const policy = vi.fn().mockReturnValue(false);
    const dag = new TaskDAG({ graphId: 'g-policy', waiverPolicy: policy });
    dag.addTask(task('a'));
    dag.addTask(task('b', ['a']));

    expect(() => dag.waivePrerequisite(waiver({ authorityRef: 'CAB-7' }))).toThrow(/rejected by policy/);
    expect(policy).toHaveBeenCalledOnce();
    expect(policy).toHaveBeenCalledWith({
      graphId: 'g-policy', graphRevision: 2, taskId: 'b', prerequisiteId: 'a',
      actor: 'release-lead', reason: 'gate retired', authorityRef: 'CAB-7', currentDisposition: 'UNRESOLVED',
    });
    expect(dag.getTask('b')?.status).toBe('blocked');
    expect(dag.getReceipts({ taskId: 'b' }).map((r) => r.disposition)).toEqual(['UNRESOLVED']);
  });

  it('applies the waiver when the policy approves', () => {
    const policy = vi.fn().mockReturnValue(true);
    const dag = new TaskDAG({ waiverPolicy: policy });
    dag.addTask(task('a'));
    dag.addTask(task('b', ['a']));
    dag.waivePrerequisite(waiver());
    expect(policy).toHaveBeenCalledOnce();
    expect(dag.getTask('b')?.status).toBe('ready');
  });

  it('does not consult the policy for invalid input', () => {
    const policy = vi.fn().mockReturnValue(true);
    const dag = new TaskDAG({ waiverPolicy: policy });
    dag.addTask(task('a'));
    dag.addTask(task('b', ['a']));
    expect(() => dag.waivePrerequisite(waiver({ actor: '' }))).toThrow(PrerequisiteWaiverError);
    expect(policy).not.toHaveBeenCalled();
  });

  it.each([
    ['a Promise', Promise.resolve(false)],
    ['a truthy string', 'no'],
    ['the number 1', 1],
  ])('fails closed when the policy returns %s instead of true', (_label, verdict) => {
    const dag = new TaskDAG({ waiverPolicy: vi.fn().mockReturnValue(verdict) });
    dag.addTask(task('a'));
    dag.addTask(task('b', ['a']));
    expect(() => dag.waivePrerequisite(waiver())).toThrow(/rejected by policy/);
    expect(dag.getTask('b')?.status).toBe('blocked');
  });

  it('rejects the waiver when the policy mutates the graph', () => {
    let dag!: TaskDAG;
    const policy = vi.fn(() => { dag.cancel('b', 'policy side effect'); return true; });
    dag = new TaskDAG({ waiverPolicy: policy });
    dag.addTask(task('a'));
    dag.addTask(task('b', ['a']));
    expect(() => dag.waivePrerequisite(waiver())).toThrow(GraphRevisionConflictError);
    expect(dag.getTask('b')?.status).toBe('cancelled');
    expect(dag.getReceipts({ taskId: 'b' }).some((r) => r.disposition === 'WAIVED')).toBe(false);
  });

  it('does not resurrect a task that a waiver event handler cancelled', () => {
    const dag = new TaskDAG();
    dag.addTask(task('a'));
    dag.addTask(task('b', ['a']));
    dag.onEvent((e) => { if (e.type === 'prerequisite-waived') dag.cancel('b', 'handler'); });
    dag.waivePrerequisite(waiver());
    expect(dag.getTask('b')?.status).toBe('cancelled');
    expect(dag.getReady().map((t) => t.id)).toEqual(['a']);
  });
});

describe('TaskDAG prerequisites - graph revision', () => {
  let dag: TaskDAG;
  beforeEach(() => { dag = new TaskDAG(); });

  it('starts at 0 and increments once per mutation', () => {
    expect(dag.graphRevision).toBe(0);
    dag.addTask(task('a'));
    dag.addTask(task('b', ['a']));
    expect(dag.graphRevision).toBe(2);
    dag.start('a', 'agent-1');
    expect(dag.graphRevision).toBe(3);
    dag.complete('a');
    expect(dag.graphRevision).toBe(4);
    dag.removeTask('a');
    expect(dag.graphRevision).toBe(5);
    expect(dag.getReceipts().map((r) => r.graphRevision)).toEqual([2, 4]);
  });

  it('does not change on reads or on a no-op removal', () => {
    dag.addTask(task('a'));
    dag.getStats();
    dag.toJSON();
    expect(dag.removeTask('missing')).toBe(false);
    expect(dag.graphRevision).toBe(1);
  });

  it('stays monotonic across clear()', () => {
    dag.addTask(task('a'));
    dag.clear();
    expect(dag.graphRevision).toBe(2);
    expect(dag.getReceipts()).toEqual([]);
    dag.addTask(task('a'));
    expect(dag.graphRevision).toBe(3);
  });

  it('generates a graphId when none is given', () => {
    expect(dag.graphId).toMatch(/^dag-[0-9a-f-]{36}$/);
    expect(new TaskDAG().graphId).not.toBe(dag.graphId);
  });

  it('rejects a stale removeTask and leaves the graph untouched', () => {
    dag.addTask(task('a'));
    dag.addTask(task('b', ['a']));
    const base = dag.graphRevision;
    dag.start('a', 'agent-1');
    expect(() => dag.removeTask('a', { expectedRevision: base })).toThrow(GraphRevisionConflictError);
    expect(dag.getTask('a')?.status).toBe('in_progress');
    expect(dag.graphRevision).toBe(base + 1);
  });

  it('lets exactly one of two writers from the same base revision commit', () => {
    dag.addTask(task('a'));
    dag.addTask(task('b', ['a']));
    dag.start('a', 'agent-1');
    const base = dag.graphRevision;

    dag.complete('a', undefined, { expectedRevision: base });
    expect(() => dag.waivePrerequisite(waiver({ expectedRevision: base }))).toThrow(GraphRevisionConflictError);
    expect(() => dag.removeTask('a', { expectedRevision: base })).toThrow(GraphRevisionConflictError);
    expect(dag.getReceipts({ taskId: 'b' }).map((r) => r.disposition)).toEqual(['UNRESOLVED', 'SATISFIED']);
  });

  it('accepts a guard that matches the current revision', () => {
    dag.addTask(task('a'));
    dag.addTask(task('b', ['a']));
    const receipt = dag.waivePrerequisite(waiver({ expectedRevision: dag.graphRevision }));
    expect(receipt.graphRevision).toBe(3);
  });

  it('carries the conflicting revisions on the error', () => {
    dag.addTask(task('a'));
    dag.start('a', 'agent-1');
    try {
      dag.complete('a', undefined, { expectedRevision: 1 });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(GraphRevisionConflictError);
      expect((err as GraphRevisionConflictError).expectedRevision).toBe(1);
      expect((err as GraphRevisionConflictError).actualRevision).toBe(2);
    }
  });

  it('rejects a blank evidenceRef on complete()', () => {
    dag.addTask(task('a'));
    dag.start('a', 'agent-1');
    expect(() => dag.complete('a', undefined, { evidenceRef: '  ' })).toThrow(/evidenceRef/);
    expect(dag.getTask('a')?.status).toBe('in_progress');
  });
});

describe('DAGScheduler - obligation denominator', () => {
  let dag: TaskDAG;
  let scheduler: DAGScheduler;
  beforeEach(() => {
    dag = new TaskDAG();
    scheduler = new DAGScheduler(dag);
  });

  it('keeps the original denominator when unfinished work is removed', () => {
    dag.addTask(task('a'));
    dag.addTask(task('b'));
    dag.addTask(task('c'));
    run(dag, 'a');
    const before = scheduler.getProgress();
    dag.removeTask('b');
    dag.removeTask('c');
    const after = scheduler.getProgress();
    expect(before).toEqual(expect.objectContaining({ completed: 1, total: 3, percentage: 33 }));
    expect(after).toEqual(expect.objectContaining({ completed: 1, total: 3, percentage: 33, removed: 2, currentTotal: 1 }));
    expect(scheduler.isComplete()).toBe(true);
    expect(scheduler.isSatisfied()).toBe(false);
  });

  it('counts a completed-then-removed task as completed', () => {
    dag.addTask(task('a'));
    dag.addTask(task('b'));
    run(dag, 'a');
    dag.removeTask('a');
    run(dag, 'b');
    expect(scheduler.getProgress()).toEqual(expect.objectContaining({ completed: 2, total: 2, percentage: 100, removed: 0 }));
    expect(scheduler.isSatisfied()).toBe(true);
  });

  it('reconciles every disposition against the original total', () => {
    dag.addTask(task('done'));
    dag.addTask(task('broken'));
    dag.addTask(task('child', ['broken']));
    dag.addTask(task('gone'));
    dag.addTask(task('waiting', ['gone']));
    dag.addTask(task('later'));
    run(dag, 'done');
    dag.fail('broken', 'crash');
    dag.removeTask('gone');
    dag.waivePrerequisite({ taskId: 'waiting', prerequisiteId: 'gone', actor: 'lead', reason: 'descoped' });

    const p = scheduler.getProgress();
    expect(p).toEqual(expect.objectContaining({
      total: 6, completed: 1, failed: 1, cancelled: 1, removed: 1, notRun: 2, waivedEdges: 1, currentTotal: 5,
    }));
    expect(p.completed + p.failed + p.cancelled + p.removed + p.notRun).toBe(p.total);
  });

  it('isComplete stays operational while isSatisfied requires every obligation', () => {
    dag.addTask(task('a'));
    dag.addTask(task('b', ['a']));
    dag.fail('a', 'crash');
    expect(scheduler.isComplete()).toBe(true);
    expect(scheduler.isSatisfied()).toBe(false);
  });

  it('reports 100% and satisfied for an empty DAG', () => {
    expect(scheduler.getProgress()).toEqual(expect.objectContaining({ total: 0, percentage: 100 }));
    expect(scheduler.isSatisfied()).toBe(true);
  });
});

describe('DAGScheduler - delegation (London school)', () => {
  const summary: ObligationSummary = {
    graphId: 'g', graphRevision: 9, originalTotal: 4, currentTotal: 3,
    completed: 1, failed: 0, cancelled: 0, removed: 1, notRun: 2,
    waivedEdges: 1, missingEdges: 0, removedEdges: 0,
  };

  function mockDag() {
    return {
      getObligationSummary: vi.fn().mockReturnValue(summary),
      complete: vi.fn().mockReturnValue([]),
      getTask: vi.fn(),
    };
  }

  it('getProgress derives from the DAG obligation summary', () => {
    const dag = mockDag();
    const scheduler = new DAGScheduler(dag as unknown as TaskDAG);
    expect(scheduler.getProgress()).toEqual({
      completed: 1, total: 4, percentage: 25, currentTotal: 3, failed: 0, cancelled: 0,
      removed: 1, notRun: 2, waivedEdges: 1, graphRevision: 9,
    });
    expect(dag.getObligationSummary).toHaveBeenCalledOnce();
  });

  it('onTaskComplete forwards completion evidence and revision guard', () => {
    const dag = mockDag();
    const scheduler = new DAGScheduler(dag as unknown as TaskDAG);
    const options = { evidenceRef: 'ref-1', expectedRevision: 9 };
    scheduler.onTaskComplete('a', { ok: true }, options);
    expect(dag.complete).toHaveBeenCalledWith('a', { ok: true }, options);
  });

  it('isSatisfied is false while the summary has unfinished obligations', () => {
    const scheduler = new DAGScheduler(mockDag() as unknown as TaskDAG);
    expect(scheduler.isSatisfied()).toBe(false);
  });
});
