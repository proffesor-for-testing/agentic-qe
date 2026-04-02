/**
 * IMP-10: QE Quality Daemon — Orchestrator
 *
 * Central tick-loop that coordinates all daemon subsystems:
 * - Priority queue processing
 * - Git commit watching
 * - Coverage delta analysis
 * - CI/CD health monitoring
 * - Test suggestion generation
 * - Nightly consolidation (dream cycle)
 * - Notification delivery
 *
 * Resource-aware: throttles when CPU > 70% or memory > 80%.
 */

import { cpus, freemem, totalmem, loadavg } from 'os';
import type { WorkerMemory } from '../interfaces';
import { PriorityQueue } from './priority-queue';
import type { DaemonTaskPayload, QueueItem } from './priority-queue';
import { GitWatcher, type GitWatcherOptions } from './git-watcher';
import { CoverageDeltaAnalyzer, type CoverageDeltaOptions, type CoverageSnapshot } from './coverage-delta';
import { CIMonitor, type CIMonitorOptions, type CIHealthReport } from './ci-monitor';
import { TestSuggester, type TestSuggesterOptions } from './test-suggester';
import { NightlyConsolidation, type NightlyConsolidationOptions, type DaemonStats } from './nightly-consolidation';
import { NotificationService, type NotificationServiceOptions } from './notification-service';

export interface QualityDaemonConfig {
  /** Tick interval in ms (default: 30s) */
  tickIntervalMs?: number;
  /** CI poll interval in ms (default: 5 min) */
  ciPollIntervalMs?: number;
  /** Coverage check interval in ms (default: 2 min) */
  coverageCheckIntervalMs?: number;
  /** CPU usage threshold to throttle (0-1, default: 0.7) */
  cpuThreshold?: number;
  /** Memory usage threshold to throttle (0-1, default: 0.8) */
  memoryThreshold?: number;
  /** Git watcher options */
  git?: GitWatcherOptions;
  /** Coverage delta options */
  coverage?: CoverageDeltaOptions;
  /** CI monitor options */
  ci?: CIMonitorOptions;
  /** Test suggester options */
  suggestions?: TestSuggesterOptions;
  /** Nightly consolidation options */
  nightly?: NightlyConsolidationOptions;
  /** Notification service options */
  notifications?: NotificationServiceOptions;
}

const DEFAULT_CONFIG: Required<Pick<QualityDaemonConfig, 'tickIntervalMs' | 'ciPollIntervalMs' | 'coverageCheckIntervalMs' | 'cpuThreshold' | 'memoryThreshold'>> = {
  tickIntervalMs: 30_000,
  ciPollIntervalMs: 5 * 60_000,
  coverageCheckIntervalMs: 2 * 60_000,
  cpuThreshold: 0.7,
  memoryThreshold: 0.8,
};

export interface QualityDaemonStatus {
  readonly running: boolean;
  readonly uptimeSeconds: number;
  readonly tickCount: number;
  readonly queueDepth: { now: number; next: number; later: number };
  readonly lastTickAt: number | undefined;
  readonly throttled: boolean;
  readonly commitsAnalyzed: number;
  readonly suggestionsGenerated: number;
  readonly notificationsSent: number;
  readonly ciHealth: number;
  readonly coverageHealth: number;
  readonly lastCICheck: number | undefined;
  readonly lastCoverageCheck: number | undefined;
}

export class QualityDaemon {
  // Subsystems
  readonly queue: PriorityQueue;
  readonly gitWatcher: GitWatcher;
  readonly coverageDelta: CoverageDeltaAnalyzer;
  readonly ciMonitor: CIMonitor;
  readonly testSuggester: TestSuggester;
  readonly nightlyConsolidation: NightlyConsolidation;
  readonly notificationService: NotificationService;

  // State
  private tickTimer: NodeJS.Timeout | undefined;
  private _running = false;
  private _startedAt = 0;
  private _tickCount = 0;
  private _lastTickAt: number | undefined;
  private _throttled = false;
  private _commitsAnalyzed = 0;
  private _suggestionsGenerated = 0;
  private _ciHealth = 100;
  private _coverageHealth = 100;
  private _lastCICheck: number | undefined;
  private _lastCoverageCheck: number | undefined;
  private _memory: WorkerMemory | undefined;

  // Config
  private config: typeof DEFAULT_CONFIG;

  constructor(config?: QualityDaemonConfig) {
    this.config = {
      tickIntervalMs: config?.tickIntervalMs ?? DEFAULT_CONFIG.tickIntervalMs,
      ciPollIntervalMs: config?.ciPollIntervalMs ?? DEFAULT_CONFIG.ciPollIntervalMs,
      coverageCheckIntervalMs: config?.coverageCheckIntervalMs ?? DEFAULT_CONFIG.coverageCheckIntervalMs,
      cpuThreshold: config?.cpuThreshold ?? DEFAULT_CONFIG.cpuThreshold,
      memoryThreshold: config?.memoryThreshold ?? DEFAULT_CONFIG.memoryThreshold,
    };

    this.queue = new PriorityQueue();
    this.gitWatcher = new GitWatcher(this.queue, config?.git);
    this.coverageDelta = new CoverageDeltaAnalyzer(this.queue, config?.coverage);
    this.ciMonitor = new CIMonitor(this.queue, config?.ci);
    this.testSuggester = new TestSuggester(config?.suggestions);
    this.nightlyConsolidation = new NightlyConsolidation(this.queue, config?.nightly);
    this.notificationService = new NotificationService(config?.notifications);
  }

  get running(): boolean {
    return this._running;
  }

  /**
   * Start the quality daemon tick loop.
   */
  async start(memory: WorkerMemory): Promise<void> {
    if (this._running) return;

    this._memory = memory;
    this._running = true;
    this._startedAt = Date.now();

    // Initialize subsystems
    this.notificationService.initialize();
    await this.gitWatcher.start().catch((err) => {
      console.debug('[QualityDaemon] Git watcher failed to start:', err);
    });

    // Start tick loop
    this.scheduleTick();
  }

  /**
   * Stop the quality daemon.
   */
  async stop(): Promise<void> {
    if (!this._running) return;

    this._running = false;

    if (this.tickTimer) {
      clearTimeout(this.tickTimer);
      this.tickTimer = undefined;
    }

    this.gitWatcher.stop();

    // Persist state
    if (this._memory) {
      await this._memory.set('quality-daemon:state', {
        stoppedAt: Date.now(),
        tickCount: this._tickCount,
        commitsAnalyzed: this._commitsAnalyzed,
        suggestionsGenerated: this._suggestionsGenerated,
      });
    }
  }

  /**
   * Get daemon status.
   */
  getStatus(): QualityDaemonStatus {
    return {
      running: this._running,
      uptimeSeconds: this._running
        ? Math.floor((Date.now() - this._startedAt) / 1000)
        : 0,
      tickCount: this._tickCount,
      queueDepth: this.queue.depths,
      lastTickAt: this._lastTickAt,
      throttled: this._throttled,
      commitsAnalyzed: this._commitsAnalyzed,
      suggestionsGenerated: this._suggestionsGenerated,
      notificationsSent: this.notificationService.sentCount,
      ciHealth: this._ciHealth,
      coverageHealth: this._coverageHealth,
      lastCICheck: this._lastCICheck,
      lastCoverageCheck: this._lastCoverageCheck,
    };
  }

  // ============================================================================
  // Tick Loop
  // ============================================================================

  private scheduleTick(): void {
    if (!this._running) return;
    this.tickTimer = setTimeout(() => this.tick(), this.config.tickIntervalMs);
  }

  private async tick(): Promise<void> {
    if (!this._running || !this._memory) return;

    this._tickCount++;
    this._lastTickAt = Date.now();

    // Resource check
    this._throttled = this.isResourceConstrained();
    if (this._throttled) {
      // Only process 'now' items when throttled
      await this.processNowItems(this._memory);
      this.scheduleTick();
      return;
    }

    // Process queue items
    await this.processQueue(this._memory);

    // Periodic checks
    await this.runPeriodicChecks(this._memory);

    // Nightly consolidation
    this.nightlyConsolidation.scheduleIfDue();

    // Prune expired queue items
    this.queue.pruneExpired();

    this.scheduleTick();
  }

  private async processQueue(memory: WorkerMemory): Promise<void> {
    // Process up to 10 items per tick to avoid starving the loop
    let processed = 0;
    const maxPerTick = 10;

    while (processed < maxPerTick && !this.queue.isEmpty) {
      const item = this.queue.dequeue();
      if (!item) break;

      await this.handleQueueItem(item, memory);
      processed++;
    }
  }

  private async processNowItems(memory: WorkerMemory): Promise<void> {
    const nowItems = this.queue.drainPriority('now');
    for (const item of nowItems) {
      await this.handleQueueItem(item, memory);
    }
  }

  private async handleQueueItem(
    item: QueueItem<DaemonTaskPayload>,
    memory: WorkerMemory
  ): Promise<void> {
    const payload = item.payload;

    switch (payload.type) {
      case 'git_commit':
        this._commitsAnalyzed++;
        // Trigger coverage analysis for changed files
        const snapshot = await this.coverageDelta.buildSnapshot(memory);
        if (snapshot) {
          const delta = await this.coverageDelta.analyze(
            snapshot,
            memory,
            payload.changedFiles
          );
          if (delta.regressionDetected) {
            await this.notificationService.send({
              type: 'coverage_drop',
              title: 'Coverage Regression Detected',
              message: `Line coverage delta: ${delta.overallDelta.line.toFixed(1)}% (${delta.affectedFiles.length} files affected)`,
              severity: 'high',
              metadata: { delta: delta.overallDelta, commit: payload.commitHash },
            });
          }
          if (delta.newGaps.length > 0) {
            const suggestions = await this.testSuggester.suggest(
              delta.newGaps,
              payload.changedFiles,
              memory
            );
            this._suggestionsGenerated += suggestions.length;
            if (suggestions.length > 0) {
              await this.notificationService.send({
                type: 'suggestion_available',
                title: 'New Test Suggestions Available',
                message: `${suggestions.length} test suggestions generated for uncovered code`,
                severity: 'info',
                metadata: { count: suggestions.length },
              });
            }
          }
        }
        break;

      case 'coverage_delta': {
        // coverage_delta items are enqueued by analyze() when regression/gaps
        // are found. The analysis itself was already completed by the
        // git_commit handler or periodic check that triggered it.
        // Here we just ensure pending test suggestions are surfaced.
        const pending = await this.testSuggester.getPending(memory);
        if (pending.length > 0) {
          await this.notificationService.send({
            type: 'suggestion_available',
            title: 'Test Suggestions Pending',
            message: `${pending.length} test suggestions awaiting review`,
            severity: 'info',
            metadata: { count: pending.length },
          });
        }
        break;
      }

      case 'gate_failure':
        await this.notificationService.send({
          type: 'gate_failure',
          title: `Quality Gate Failed: ${payload.gateName}`,
          message: `Score ${payload.score} below threshold ${payload.threshold}`,
          severity: 'critical',
          metadata: { gate: payload.gateName, score: payload.score, threshold: payload.threshold },
        });
        break;

      case 'ci_failure':
        await this.notificationService.send({
          type: 'ci_failure',
          title: `CI Failure: ${payload.workflowName}`,
          message: `Workflow ${payload.workflowName} run #${payload.runId} concluded: ${payload.conclusion}`,
          severity: 'high',
          metadata: { workflow: payload.workflowName, runId: payload.runId },
        });
        break;

      case 'nightly': {
        const stats: DaemonStats = {
          coverageHealth: this._coverageHealth,
          ciHealth: this._ciHealth,
          commitsAnalyzed: this._commitsAnalyzed,
          suggestionsGenerated: this._suggestionsGenerated,
          notificationsSent: this.notificationService.sentCount,
          queueDepthAvg: this.queue.size,
          uptimeSeconds: Math.floor((Date.now() - this._startedAt) / 1000),
        };
        await this.nightlyConsolidation.execute(memory, stats);
        break;
      }

      default: {
        // Exhaustiveness check — TypeScript will error if a new payload type
        // is added to DaemonTaskPayload without handling it here.
        const _exhaustive: never = payload;
        console.warn('[QualityDaemon] Unhandled payload type:', (_exhaustive as any).type);
      }
    }
  }

  private async runPeriodicChecks(memory: WorkerMemory): Promise<void> {
    const now = Date.now();

    // CI check
    if (
      !this._lastCICheck ||
      now - this._lastCICheck >= this.config.ciPollIntervalMs
    ) {
      try {
        const report = await this.ciMonitor.check();
        this._ciHealth = report.healthScore;
        this._lastCICheck = now;

        if (report.flakyWorkflows.length > 0) {
          await this.notificationService.send({
            type: 'flaky_detected',
            title: 'Flaky Workflows Detected',
            message: `${report.flakyWorkflows.length} workflows showing repeated failures: ${report.flakyWorkflows.join(', ')}`,
            severity: 'medium',
            metadata: { workflows: report.flakyWorkflows },
          });
        }
      } catch {
        // CI check failed, keep going
      }
    }

    // Coverage health check — read-only metrics update.
    // Full analysis is triggered by git commits; periodic check only updates
    // the health score from the latest snapshot without re-running analyze()
    // to avoid duplicate notifications.
    if (
      !this._lastCoverageCheck ||
      now - this._lastCoverageCheck >= this.config.coverageCheckIntervalMs
    ) {
      try {
        const snapshot = await this.coverageDelta.buildSnapshot(memory);
        if (snapshot) {
          this._coverageHealth = Math.round(
            (snapshot.overall.line +
              snapshot.overall.branch +
              snapshot.overall.function +
              snapshot.overall.statement) /
              4
          );
          this._lastCoverageCheck = now;
        }
      } catch {
        // Coverage check failed, keep going
      }
    }
  }

  // ============================================================================
  // Resource Awareness
  // ============================================================================

  private isResourceConstrained(): boolean {
    // Memory check
    const memUsage = 1 - freemem() / totalmem();
    if (memUsage > this.config.memoryThreshold) return true;

    // CPU check (rough heuristic via load average)
    const cpuCount = cpus().length;
    const load = cpuCount > 0 ? loadavg()[0] / cpuCount : 0;
    if (load > this.config.cpuThreshold) return true;

    return false;
  }
}

// Re-export subsystems
export { PriorityQueue } from './priority-queue';
export type { QueueItem, QueuePriority, DaemonTaskPayload } from './priority-queue';
export { GitWatcher } from './git-watcher';
export { CoverageDeltaAnalyzer } from './coverage-delta';
export { CIMonitor } from './ci-monitor';
export { TestSuggester } from './test-suggester';
export { NightlyConsolidation } from './nightly-consolidation';
export { NotificationService } from './notification-service';
export { PersistentWorkerMemory } from './persistent-memory';
