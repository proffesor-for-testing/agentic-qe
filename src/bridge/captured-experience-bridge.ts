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
      return await this.drain();
    } catch (err) {
      // Bridge is best-effort: never crash the kernel because of a stale
      // schema or a transient SQLite lock. Surface to console so operators
      // can spot persistent failures.
      console.warn(
        '[CapturedExperienceBridge] drain failed:',
        err instanceof Error ? err.message : err
      );
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

    await this.memory.set(CURSOR_KEY, this.cursor);
    return published;
  }
}

// ----------------------------------------------------------------------
// Row → DomainEvent mapping
// ----------------------------------------------------------------------
//
// Every captured experience yields a `learning.ExperienceCaptured` event
// (the learning-optimization domain consumes this for its replay/dream
// pipeline). When the row's `domain` field matches a known QE domain, we
// also emit the domain-specific event the corresponding plugin listens
// for in `subscribeToEvents()`.
//
// Mapping is intentionally narrow: we only emit events that at least one
// domain plugin actually subscribes to (verified at issue #479 filing).
// Adding a new event here only makes sense after a subscriber exists.

function mapRowToEvents(row: ExperienceRow): DomainEvent[] {
  const timestamp = parseTimestamp(row.completed_at);
  const correlationId = row.id;
  const events: DomainEvent[] = [];

  // 1. Universal experience event — always emit.
  events.push(buildEvent({
    type: 'learning.ExperienceCaptured',
    source: 'learning-optimization',
    correlationId,
    timestamp,
    payload: {
      experienceId: row.id,
      domain: row.domain ?? '',
      agent: row.agent ?? '',
      task: row.task ?? '',
      success: row.success === 1,
      quality: row.quality,
      durationMs: row.duration_ms,
      sourceHook: row.source ?? '',
    },
  }));

  // 2. Domain-specific event — fan out by `domain` field.
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

    case 'test-execution':
      return buildEvent({
        type: 'test-execution.TestRunCompleted',
        source: 'test-execution',
        correlationId,
        timestamp,
        payload: basePayload,
      });

    case 'coverage-analysis':
      // Successful coverage runs publish CoverageReportCreated;
      // failed/incomplete runs publish CoverageGapDetected so the
      // subscribers (code-intelligence, test-generation) can react.
      return buildEvent({
        type: row.success === 1
          ? 'coverage-analysis.CoverageReportCreated'
          : 'coverage-analysis.CoverageGapDetected',
        source: 'coverage-analysis',
        correlationId,
        timestamp,
        payload: basePayload,
      });

    case 'code-intelligence':
      // Hook-fired edits surface here as FileChanged; the plugin's
      // handler decides whether to re-index based on payload.
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
