/**
 * Agentic QE v3 - Prerequisite Ledger
 * Issue #1069: typed prerequisite dispositions and receipts for TaskDAG
 *
 * Holds the graph identity, the monotonically increasing graph revision,
 * the current disposition of every prerequisite edge, an append-only log
 * of PrerequisiteReceiptV1 records, and tombstones for removed tasks so the
 * original obligation denominator survives node removal.
 */

import {
  PREREQUISITE_RECEIPT_SCHEMA,
  type DAGTask,
  type DAGTaskStatus,
  type ObligationSummary,
  type PrerequisiteDisposition,
  type PrerequisiteEdgeState,
  type PrerequisiteReceiptV1,
  type PrerequisiteWaiver,
  type RemovedTaskRecord,
  type WaivePrerequisiteInput,
} from './types.js';

/** Dispositions that let a dependent become ready */
const RESOLVING: ReadonlySet<PrerequisiteDisposition> = new Set<PrerequisiteDisposition>([
  'SATISFIED',
  'WAIVED',
]);

/** Task statuses that end execution */
export const TERMINAL_STATUSES: ReadonlySet<DAGTaskStatus> = new Set<DAGTaskStatus>([
  'completed',
  'failed',
  'cancelled',
]);

const MAX_ACTOR_LENGTH = 256;
const MAX_REASON_LENGTH = 4096;
const MAX_REF_LENGTH = 1024;

/** Thrown when an operation's expectedRevision does not match the graph */
export class GraphRevisionConflictError extends Error {
  constructor(readonly expectedRevision: number, readonly actualRevision: number) {
    super(`Graph revision conflict: expected ${expectedRevision}, graph is at ${actualRevision}`);
    this.name = 'GraphRevisionConflictError';
  }
}

/** Thrown when a waiver request is invalid or rejected by policy */
export class PrerequisiteWaiverError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PrerequisiteWaiverError';
  }
}

function requireText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new PrerequisiteWaiverError(`Waiver '${field}' must be a non-empty string`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new PrerequisiteWaiverError(`Waiver '${field}' exceeds ${maxLength} characters`);
  }
  return trimmed;
}

/**
 * Validate a waiver request at the API boundary.
 * @returns The normalized (trimmed) request
 * @throws PrerequisiteWaiverError on missing or malformed fields
 */
export function validateWaiverInput(input: WaivePrerequisiteInput): WaivePrerequisiteInput {
  if (input === null || typeof input !== 'object') {
    throw new PrerequisiteWaiverError('Waiver input must be an object');
  }
  const authorityRef = input.authorityRef === undefined
    ? undefined
    : requireText(input.authorityRef, 'authorityRef', MAX_REF_LENGTH);
  const expectedRevision = input.expectedRevision;
  if (expectedRevision !== undefined && !Number.isInteger(expectedRevision)) {
    throw new PrerequisiteWaiverError(`Waiver 'expectedRevision' must be an integer`);
  }
  return {
    taskId: requireText(input.taskId, 'taskId', MAX_REF_LENGTH),
    prerequisiteId: requireText(input.prerequisiteId, 'prerequisiteId', MAX_REF_LENGTH),
    actor: requireText(input.actor, 'actor', MAX_ACTOR_LENGTH),
    reason: requireText(input.reason, 'reason', MAX_REASON_LENGTH),
    authorityRef,
    expectedRevision,
  };
}

/** Extra fields attached to a receipt */
interface ReceiptDetails {
  readonly completionEvidenceRef?: string;
  readonly waiver?: PrerequisiteWaiver;
}

/**
 * Ledger of prerequisite edge dispositions for one TaskDAG.
 * Receipts are frozen and never rewritten; the latest receipt per edge
 * is the edge's current disposition.
 */
export class PrerequisiteLedger {
  private revision = 0;
  private readonly current = new Map<string, Map<string, PrerequisiteReceiptV1>>();
  private readonly log: PrerequisiteReceiptV1[] = [];
  private readonly tombstones = new Map<string, RemovedTaskRecord>();
  private readonly obligations = new Set<string>();

  constructor(readonly graphId: string) {}

  /** Current graph revision (0 for a fresh graph) */
  get graphRevision(): number {
    return this.revision;
  }

  /** @throws GraphRevisionConflictError if expected is set and stale */
  checkRevision(expected?: number): void {
    if (expected !== undefined && expected !== this.revision) {
      throw new GraphRevisionConflictError(expected, this.revision);
    }
  }

  /** Advance the revision for a committed mutation. */
  bump(): number {
    return ++this.revision;
  }

  /** Append a receipt and make it the edge's current disposition. */
  record(
    taskId: string,
    prerequisiteId: string,
    disposition: PrerequisiteDisposition,
    details: ReceiptDetails = {}
  ): PrerequisiteReceiptV1 {
    const receipt: PrerequisiteReceiptV1 = Object.freeze({
      schema: PREREQUISITE_RECEIPT_SCHEMA,
      graphId: this.graphId,
      graphRevision: this.revision,
      taskId,
      prerequisiteId,
      disposition,
      ...(details.completionEvidenceRef !== undefined
        ? { completionEvidenceRef: details.completionEvidenceRef }
        : {}),
      ...(details.waiver ? { waiver: Object.freeze({ ...details.waiver }) } : {}),
      observedAt: new Date().toISOString(),
    });
    let edges = this.current.get(taskId);
    if (!edges) {
      edges = new Map();
      this.current.set(taskId, edges);
    }
    edges.set(prerequisiteId, receipt);
    this.log.push(receipt);
    return receipt;
  }

  /** Current disposition of an edge, or undefined if the edge is unknown. */
  disposition(taskId: string, prerequisiteId: string): PrerequisiteDisposition | undefined {
    return this.current.get(taskId)?.get(prerequisiteId)?.disposition;
  }

  /** True when every listed prerequisite edge is SATISFIED or WAIVED. */
  allResolved(taskId: string, prerequisiteIds: Iterable<string>): boolean {
    for (const id of prerequisiteIds) {
      const d = this.disposition(taskId, id);
      if (!d || !RESOLVING.has(d)) return false;
    }
    return true;
  }

  /** True when any edge of the task has one of the given dispositions. */
  hasAny(taskId: string, dispositions: readonly PrerequisiteDisposition[]): boolean {
    const edges = this.current.get(taskId);
    if (!edges) return false;
    for (const receipt of edges.values()) {
      if (dispositions.includes(receipt.disposition)) return true;
    }
    return false;
  }

  /** Current edge states for a dependent, in the given prerequisite order. */
  edgesOf(taskId: string, prerequisiteIds: Iterable<string>): PrerequisiteEdgeState[] {
    const edges = this.current.get(taskId);
    const states: PrerequisiteEdgeState[] = [];
    if (!edges) return states;
    for (const id of prerequisiteIds) {
      const receipt = edges.get(id);
      if (receipt) states.push({ prerequisiteId: id, disposition: receipt.disposition, receipt });
    }
    return states;
  }

  /** Count live edges by disposition across the given dependents. */
  countEdges(taskIds: Iterable<string>, disposition: PrerequisiteDisposition): number {
    let count = 0;
    for (const id of taskIds) {
      const edges = this.current.get(id);
      if (!edges) continue;
      for (const receipt of edges.values()) {
        if (receipt.disposition === disposition) count++;
      }
    }
    return count;
  }

  /** Append-only receipt log, optionally filtered. */
  receipts(filter: { taskId?: string; prerequisiteId?: string } = {}): PrerequisiteReceiptV1[] {
    return this.log.filter(
      (r) =>
        (filter.taskId === undefined || r.taskId === filter.taskId) &&
        (filter.prerequisiteId === undefined || r.prerequisiteId === filter.prerequisiteId)
    );
  }

  /** Drop a removed task's own edges from the current projection (log is kept). */
  dropEdgesOf(taskId: string): void {
    this.current.delete(taskId);
  }

  /** Register a task as an obligation; re-adding clears any tombstone. */
  addObligation(taskId: string): void {
    this.obligations.add(taskId);
    this.tombstones.delete(taskId);
  }

  tombstone(taskId: string, statusAtRemoval: DAGTaskStatus): void {
    this.tombstones.set(taskId, Object.freeze({
      taskId,
      statusAtRemoval,
      graphRevision: this.revision,
    }));
  }

  isTombstoned(taskId: string): boolean {
    return this.tombstones.has(taskId);
  }

  removedTasks(): RemovedTaskRecord[] {
    return Array.from(this.tombstones.values());
  }

  get obligationCount(): number {
    return this.obligations.size;
  }

  /** Obligation accounting over live tasks plus tombstones. */
  summarize(liveTasks: Iterable<DAGTask>): ObligationSummary {
    let completed = 0, failed = 0, cancelled = 0, notRun = 0, removed = 0;
    const liveIds: string[] = [];
    for (const task of liveTasks) {
      liveIds.push(task.id);
      if (task.status === 'completed') completed++;
      else if (task.status === 'failed') failed++;
      else if (task.status === 'cancelled') cancelled++;
      else notRun++;
    }
    for (const record of this.tombstones.values()) {
      if (record.statusAtRemoval === 'completed') completed++;
      else removed++;
    }
    return {
      graphId: this.graphId,
      graphRevision: this.revision,
      originalTotal: this.obligations.size,
      currentTotal: liveIds.length,
      completed, failed, cancelled, removed, notRun,
      waivedEdges: this.countEdges(liveIds, 'WAIVED'),
      missingEdges: this.countEdges(liveIds, 'MISSING'),
      removedEdges: this.countEdges(liveIds, 'REMOVED'),
    };
  }

  /** Reset all state except the revision, which stays monotonic. */
  reset(): void {
    this.current.clear();
    this.log.length = 0;
    this.tombstones.clear();
    this.obligations.clear();
  }
}
