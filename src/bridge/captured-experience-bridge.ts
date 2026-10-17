/**
 * Captured-Experience Bridge — Issue #479
 *
 * Drains rows from the `captured_experiences` SQLite table (populated by
 * hook subprocesses that fire on every Claude Code Edit/Task/Bash) and
 * republishes each row as a `DomainEvent` on the kernel-side `eventBus`.
 *
 * This is the *only* path by which hook-driven activity reaches the 13
 * domain plugins' `subscribeToEvents()` registrations. Hook subprocesses
 * are short-lived `npx aqe hooks ...` processes — they have no eventBus
 * and no domain plugins, so a direct `hookRegistry → eventBus` subscriber
 * inside `getHooksSystem()` cannot work. The shared state hooks leave
 * behind is the SQLite table; this bridge is the consumer of that queue.
 *
 * Wired from `QEKernelImpl.initialize()` so every process that owns a
 * kernel (CLI commands, MCP server) automatically picks up new hook
 * captures and fans them out as domain events.
 */

import { randomUUID } from 'crypto';
import type { EventBus, MemoryBackend } from '../kernel/interfaces.js';
import type { DomainEvent, DomainName } from '../shared/types/index.js';
import { getUnifiedMemory } from '../kernel/unified-memory.js';
import { recordLoopHealth } from '../learning/loop-health.js';

/** Cursor key in the kernel's MemoryBackend so the bridge resumes after restart. */
const CURSOR_KEY = 'aqe/bridge/captured-experiences/cursor';

/** Default polling cadence — short enough that domain plugins react quickly,
 *  long enough that idle systems don't burn CPU. */
const DEFAULT_INTERVAL_MS = 5_000;

/** Cap rows per drain so a backlog doesn't block the event loop. */
const DEFAULT_BATCH_SIZE = 100;

export interface CapturedExperienceBridgeOptions {
  intervalMs?: number;
  batchSize?: number;
}

interface ExperienceRow {
  rowid: number;
  id: string;
  task: string | null;
  agent: string | null;
  domain: string | null;
  success: number;
  quality: number;
  duration_ms: number;
  source: string | null;
  completed_at: string;
}

export class CapturedExperienceBridge {
  private cursor = 0;
  private intervalId: NodeJS.Timeout | undefined;
  private draining = false;
  private readonly intervalMs: number;
  private readonly batchSize: number;

  constructor(
    private readonly eventBus: EventBus,
    private readonly memory: MemoryBackend,
    options: CapturedExperienceBridgeOptions = {}
  ) {
    this.intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
    this.batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  }

  async start(): Promise<void> {
    if (this.intervalId) return;

    // Restore cursor so we don't re-publish events from prior process lifetimes.
    const stored = await this.memory.get<number>(CURSOR_KEY);
    this.cursor = typeof stored === 'number' ? stored : 0;

    // Drain immediately so events sitting in the table from the last hook
    // burst reach the domains without waiting for the first tick.
    await this.drainSafe();

    this.intervalId = setInterval(() => {
      void this.drainSafe();
    }, this.intervalMs);
    // Don't keep the process alive solely for this poller.
    this.intervalId.unref?.();
  }

  async stop(): Promise<void> {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }

  /** Visible for tests — perform one drain pass on demand. */
  async drainOnce(): Promise<number> {
    return this.drainSafe();
  }

  private async drainSafe(): Promise<number> {
    if (this.draining) return 0;
    this.draining = true;
    try {
      const published = await this.drain();
      // #488 B.2: record health so `aqe learning loop-health` can show the
      // bridge as live. We record success even for empty drains because
      // "polled successfully, nothing to drain" is itself a healthy signal.
      await recordLoopHealth(this.memory, 'bridge', { success: true });
      return published;
    } catch (err) {
      // Bridge is best-effort: never crash the kernel because of a stale
      // schema or a transient SQLite lock. Surface to console so operators
      // can spot persistent failures.
      console.warn(
        '[CapturedExperienceBridge] drain failed:',
        err instanceof Error ? err.message : err
      );
      await recordLoopHealth(this.memory, 'bridge', {
        success: false,
        error: err instanceof Error ? err : String(err),
      });
      return 0;
    } finally {
      this.draining = false;
    }
  }

  private async drain(): Promise<number> {
    const um = getUnifiedMemory();
    if (!um.isInitialized()) return 0;
    const db = um.getDatabase();

    // Skip cleanly if the schema isn't there yet (kernel started before any
    // hook ever fired in this project).
    const tableExists = db
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='captured_experiences'"
      )
      .get();
    if (!tableExists) return 0;

    const rows = db
      .prepare(
        `SELECT rowid, id, task, agent, domain, success, quality,
                duration_ms, source, completed_at
         FROM captured_experiences
         WHERE rowid > ?
         ORDER BY rowid ASC
         LIMIT ?`
      )
      .all(this.cursor, this.batchSize) as ExperienceRow[];

    if (rows.length === 0) return 0;

    let published = 0;
    for (const row of rows) {
      for (const event of mapRowToEvents(row)) {
        try {
          await this.eventBus.publish(event);
          published += 1;
        } catch (err) {
          // One bad subscriber must not stall the whole drain.
          console.warn(
            `[CapturedExperienceBridge] publish failed for ${event.type}:`,
            err instanceof Error ? err.message : err
          );
        }
      }
      this.cursor = row.rowid;
    }

    // #488 C.3: monotonic guard against cross-process cursor regression.
    // The cursor MUST move forward only. If another bridge instance (e.g.
    // a stray daemon spawned before the #488 B.1 pidfile fix landed) wrote
    // a higher cursor while we were publishing, we'd otherwise overwrite
    // it with our older value — causing the next drain to re-publish
    // already-drained rows. Read-then-max-write is a TOCTOU but it
    // collapses the regression window to milliseconds rather than seconds.
    try {
      const persisted = await this.memory.get<number>(CURSOR_KEY);
      const safeCursor = Math.max(this.cursor, persisted ?? 0);
      this.cursor = safeCursor;
      await this.memory.set(CURSOR_KEY, safeCursor);
    } catch (err) {
      // Cursor write is best-effort. On next start the bridge re-reads from
      // kv and resumes from whatever's persisted. A failed write just means
      // we'll re-publish a small batch on next boot — idempotent for any
      // domain plugin that uses event IDs for dedup.
      console.warn(
        '[CapturedExperienceBridge] cursor persist failed:',
        err instanceof Error ? err.message : err,
      );
    }
    return published;
  }
}

// ----------------------------------------------------------------------
// Row → DomainEvent mapping
// ----------------------------------------------------------------------
//
// Every captured experience yields a `learning.ExperienceCaptured` event
// with the canonical nested payload shape `{ experience, reward }` that
// the existing `LearningOptimizationCoordinator.handleExperienceCaptured`
// (and the equivalent in `experience-capture.ts:1043`) destructures.
//
// Issue #484 (Jordi): an earlier draft of this bridge used a flat
// `{ experienceId, domain, agent, task, success, quality, ... }` payload
// that didn't match the handler's destructure (`const { experience } = payload`),
// so the universal handler short-circuited on every event and no
// `learning:experience:*` kv keys appeared even after subscribers were
// loaded. Per the issue's explicit guidance, we wrap producer-side rather
// than asking every consumer to learn the bridge's quirky shape.
//
// When the row's `domain` field matches a known QE domain, we ALSO emit a
// domain-specific event in the legacy flat `basePayload` shape that the
// existing per-domain handlers already accept. Future enrichment of the
// basePayload should add fields, not rename them. A domain whose events
// need data a row does not carry (a run's results, coverage figures) gets
// no domain-specific event at all — see #1008 and #1095.

function mapRowToEvents(row: ExperienceRow): DomainEvent[] {
  const timestamp = parseTimestamp(row.completed_at);
  const correlationId = row.id;
  const events: DomainEvent[] = [];

  // 1. Universal experience event — always emit, canonical nested shape.
  //
  // Build a TaskExperience-shaped object the coordinator can destructure.
  // Field names must match `interface TaskExperience` in
  // src/learning/experience-capture.ts. Not every field is reconstructible
  // from a captured_experiences row — `steps` defaults to [], timestamps
  // collapse to the `completed_at` instant — but the fields the handler
  // actually reads (`success`, `quality`, `domain`, `agent`, `task`, `id`)
  // round-trip cleanly.
  const completedAtMs = timestamp.getTime();
  const startedAtMs = completedAtMs - (row.duration_ms || 0);
  const reward = row.success === 1 ? 1 : 0;

  const experience = {
    id: row.id,
    task: row.task ?? '',
    agent: row.agent ?? '',
    domain: row.domain ?? '',
    startedAt: startedAtMs,
    completedAt: completedAtMs,
    durationMs: row.duration_ms ?? 0,
    steps: [],
    success: row.success === 1,
    quality: row.quality,
    reward,
    metadata: {
      sourceHook: row.source ?? '',
      bridgedAt: Date.now(),
    },
  };

  events.push(buildEvent({
    type: 'learning.ExperienceCaptured',
    source: 'learning-optimization',
    correlationId,
    timestamp,
    payload: {
      experience,
      reward,
    },
  }));

  // 2. Domain-specific event — fan out by `domain` field, legacy flat shape.
  const domainSpecific = mapDomainSpecificEvent(row, timestamp, correlationId);
  if (domainSpecific) events.push(domainSpecific);

  return events;
}

function mapDomainSpecificEvent(
  row: ExperienceRow,
  timestamp: Date,
  correlationId: string
): DomainEvent | null {
  const basePayload = {
    experienceId: row.id,
    agent: row.agent ?? '',
    task: row.task ?? '',
    success: row.success === 1,
    quality: row.quality,
    durationMs: row.duration_ms,
  };

  switch (row.domain) {
    case 'test-generation':
      return buildEvent({
        type: 'test-generation.TestGenerated',
        source: 'test-generation',
        correlationId,
        timestamp,
        payload: basePayload,
      });

    // #1095: a test-execution experience row is a record that the tool ran,
    // not a test run. It carries no run id and no passed/failed/skipped
    // counts, so it must not masquerade as `TestRunCompleted`: consumers key
    // their records by `runId` and would write `...:undefined` kv keys, and
    // learning would record a 0% success rate. The real event is published
    // by the test-execution coordinator with the run's actual results.
    // Learning still receives the row via `learning.ExperienceCaptured`.
    case 'test-execution':
      return null;

    // #1008: a coverage-analysis experience row is a record that the tool
    // ran, not a coverage report or a gap. It carries no line/branch figures
    // and no gap file, so it must not masquerade as `CoverageReportCreated`
    // (quality-assessment stores that as `coverage:latest`) or as
    // `CoverageGapDetected` (test generation/execution act on its file).
    // Learning still receives the row via `learning.ExperienceCaptured`.
    case 'coverage-analysis':
      return null;

    case 'code-intelligence':
      return buildEvent({
        type: 'code-intelligence.FileChanged',
        source: 'code-intelligence',
        correlationId,
        timestamp,
        payload: basePayload,
      });

    default:
      return null;
  }
}

function buildEvent<T>(input: {
  type: string;
  source: DomainName;
  correlationId: string;
  timestamp: Date;
  payload: T;
}): DomainEvent<T> {
  return {
    id: randomUUID(),
    type: input.type,
    timestamp: input.timestamp,
    source: input.source,
    correlationId: input.correlationId,
    payload: input.payload,
  };
}

function parseTimestamp(value: string): Date {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}
