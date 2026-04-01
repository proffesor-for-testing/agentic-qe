/**
 * IMP-10: QE Quality Daemon — Nightly Consolidation
 *
 * Runs the learning dream cycle:
 * - Consolidates patterns from the day's experiences
 * - Prunes expired memory entries
 * - Generates a daily quality report
 * - Enqueues as 'later' priority (runs during idle)
 */

import type { WorkerMemory } from '../interfaces';
import type { PriorityQueue, NightlyPayload, QueueItem, DaemonTaskPayload } from './priority-queue';

export interface ConsolidationResult {
  readonly timestamp: number;
  readonly patternsConsolidated: number;
  readonly entriesPruned: number;
  readonly reportGenerated: boolean;
  readonly durationMs: number;
}

export interface DailyQualityReport {
  readonly date: string;
  readonly coverageHealth: number;
  readonly ciHealth: number;
  readonly commitsAnalyzed: number;
  readonly suggestionsGenerated: number;
  readonly notificationsSent: number;
  readonly queueDepthAvg: number;
  readonly daemonUptime: number;
}

export interface NightlyConsolidationOptions {
  /** Memory key prefix */
  memoryPrefix?: string;
  /** Max age for memory entries before pruning (ms) */
  maxEntryAge?: number;
  /** Hour to run nightly tasks (0-23, default 2 = 2 AM) */
  nightlyHour?: number;
}

const DEFAULTS: Required<NightlyConsolidationOptions> = {
  memoryPrefix: 'quality-daemon:nightly',
  maxEntryAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  nightlyHour: 2,
};

export class NightlyConsolidation {
  private options: Required<NightlyConsolidationOptions>;
  private lastRunDate: string | undefined;

  constructor(
    private readonly queue: PriorityQueue,
    options?: NightlyConsolidationOptions
  ) {
    this.options = { ...DEFAULTS, ...options };
  }

  /**
   * Check if nightly consolidation should run.
   */
  shouldRun(): boolean {
    const now = new Date();
    const todayDate = now.toISOString().split('T')[0];

    // Already ran today
    if (this.lastRunDate === todayDate) return false;

    // Only run at or after the configured hour
    return now.getHours() >= this.options.nightlyHour;
  }

  /**
   * Schedule nightly consolidation into the queue.
   */
  scheduleIfDue(): boolean {
    if (!this.shouldRun()) return false;

    const payload: NightlyPayload = {
      type: 'nightly',
      tasks: ['consolidate_patterns', 'prune_expired', 'generate_report'],
    };

    const item: QueueItem<DaemonTaskPayload> = {
      id: `nightly-${Date.now()}`,
      priority: 'later',
      payload,
      createdAt: Date.now(),
      source: 'nightly-consolidation',
      ttlMs: 12 * 60 * 60 * 1000, // 12 hour TTL
    };

    return this.queue.enqueue(item);
  }

  /**
   * Execute the nightly consolidation cycle.
   */
  async execute(memory: WorkerMemory, stats: DaemonStats): Promise<ConsolidationResult> {
    const startTime = Date.now();
    const todayDate = new Date().toISOString().split('T')[0];

    // 1. Consolidate patterns
    const patternsConsolidated = await this.consolidatePatterns(memory);

    // 2. Prune expired entries
    const entriesPruned = await this.pruneExpired(memory);

    // 3. Generate daily report
    const report = this.generateReport(todayDate, stats);
    await memory.set(`${this.options.memoryPrefix}:report:${todayDate}`, report);

    this.lastRunDate = todayDate;

    const result: ConsolidationResult = {
      timestamp: Date.now(),
      patternsConsolidated,
      entriesPruned,
      reportGenerated: true,
      durationMs: Date.now() - startTime,
    };

    await memory.set(`${this.options.memoryPrefix}:last-result`, result);

    return result;
  }

  /**
   * Get the last consolidation result.
   */
  async getLastResult(memory: WorkerMemory): Promise<ConsolidationResult | undefined> {
    return memory.get<ConsolidationResult>(`${this.options.memoryPrefix}:last-result`);
  }

  // ============================================================================
  // Private
  // ============================================================================

  private async consolidatePatterns(memory: WorkerMemory): Promise<number> {
    // Find all daemon-generated patterns from today
    const keys = await memory.search('quality-daemon:*');
    let consolidated = 0;

    // Consolidate suggestion stats
    const suggestionCount = await memory.get<{ pending: number; total: number }>(
      'quality-daemon:suggestions:count'
    );
    if (suggestionCount) {
      consolidated++;
    }

    // Consolidate coverage deltas
    const delta = await memory.get<{ regressionDetected: boolean }>(
      'quality-daemon:coverage:delta'
    );
    if (delta) {
      consolidated++;
    }

    return consolidated;
  }

  private async pruneExpired(memory: WorkerMemory): Promise<number> {
    const keys = await memory.search('quality-daemon:*');
    let pruned = 0;
    const now = Date.now();

    for (const key of keys) {
      // Skip critical keys
      if (key.endsWith(':snapshot') || key.endsWith(':list')) continue;

      const value = await memory.get<{ timestamp?: number }>(key);
      if (
        value &&
        typeof value.timestamp === 'number' &&
        now - value.timestamp > this.options.maxEntryAge
      ) {
        // Mark as pruned (set to null equivalent)
        await memory.set(key, { pruned: true, prunedAt: now });
        pruned++;
      }
    }

    return pruned;
  }

  private generateReport(date: string, stats: DaemonStats): DailyQualityReport {
    return {
      date,
      coverageHealth: stats.coverageHealth ?? 0,
      ciHealth: stats.ciHealth ?? 0,
      commitsAnalyzed: stats.commitsAnalyzed ?? 0,
      suggestionsGenerated: stats.suggestionsGenerated ?? 0,
      notificationsSent: stats.notificationsSent ?? 0,
      queueDepthAvg: stats.queueDepthAvg ?? 0,
      daemonUptime: stats.uptimeSeconds ?? 0,
    };
  }
}

/**
 * Runtime stats passed from the daemon orchestrator.
 */
export interface DaemonStats {
  coverageHealth?: number;
  ciHealth?: number;
  commitsAnalyzed?: number;
  suggestionsGenerated?: number;
  notificationsSent?: number;
  queueDepthAvg?: number;
  uptimeSeconds?: number;
}
