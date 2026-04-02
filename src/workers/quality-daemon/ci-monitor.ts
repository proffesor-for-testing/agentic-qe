/**
 * IMP-10: QE Quality Daemon — CI/CD Health Monitor
 *
 * Polls GitHub Actions workflow status via the `gh` CLI.
 * Detects failure patterns (same test failing N times) and
 * enqueues 'now' priority notifications for quality gate failures.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import type { PriorityQueue, CIFailurePayload, QueueItem, DaemonTaskPayload } from './priority-queue';

const execFileAsync = promisify(execFile);

export interface CIMonitorOptions {
  /** How many recent runs to fetch per workflow */
  runsPerWorkflow?: number;
  /** Consecutive failure count to trigger flaky detection */
  flakyThreshold?: number;
  /** Repository in owner/repo format (auto-detected if omitted) */
  repo?: string;
}

const DEFAULTS: Required<CIMonitorOptions> = {
  runsPerWorkflow: 10,
  flakyThreshold: 3,
  repo: '',
};

export interface WorkflowRun {
  readonly name: string;
  readonly status: string;
  readonly conclusion: string;
  readonly headBranch: string;
  readonly runNumber: number;
  readonly databaseId: number;
  readonly createdAt: string;
}

export interface CIHealthReport {
  readonly timestamp: number;
  readonly workflows: WorkflowStatus[];
  readonly failingWorkflows: number;
  readonly flakyWorkflows: string[];
  readonly healthScore: number;
}

export interface WorkflowStatus {
  readonly name: string;
  readonly recentRuns: number;
  readonly failedRuns: number;
  readonly successRate: number;
  readonly lastConclusion: string;
  readonly consecutiveFailures: number;
}

export class CIMonitor {
  private options: Required<CIMonitorOptions>;

  constructor(
    private readonly queue: PriorityQueue,
    options?: CIMonitorOptions
  ) {
    this.options = { ...DEFAULTS, ...options };
  }

  /**
   * Poll GitHub Actions and produce a health report.
   */
  async check(): Promise<CIHealthReport> {
    const runs = await this.fetchRecentRuns();
    const grouped = this.groupByWorkflow(runs);

    const workflows: WorkflowStatus[] = [];
    const flakyWorkflows: string[] = [];
    let failingCount = 0;

    for (const [name, workflowRuns] of Object.entries(grouped)) {
      const failedRuns = workflowRuns.filter((r) => r.conclusion === 'failure').length;
      const successRate =
        workflowRuns.length > 0
          ? ((workflowRuns.length - failedRuns) / workflowRuns.length) * 100
          : 100;

      const consecutiveFailures = this.countConsecutiveFailures(workflowRuns);
      const lastConclusion = workflowRuns[0]?.conclusion ?? 'unknown';

      if (lastConclusion === 'failure') {
        failingCount++;
      }

      if (consecutiveFailures >= this.options.flakyThreshold) {
        flakyWorkflows.push(name);

        // Enqueue 'now' alert for persistent failures
        this.enqueueFailureAlert(name, workflowRuns[0]);
      }

      workflows.push({
        name,
        recentRuns: workflowRuns.length,
        failedRuns,
        successRate: Math.round(successRate * 10) / 10,
        lastConclusion,
        consecutiveFailures,
      });
    }

    const healthScore = this.calculateHealthScore(workflows);

    return {
      timestamp: Date.now(),
      workflows,
      failingWorkflows: failingCount,
      flakyWorkflows,
      healthScore,
    };
  }

  // ============================================================================
  // Private
  // ============================================================================

  private async fetchRecentRuns(): Promise<WorkflowRun[]> {
    try {
      const args = [
        'run', 'list',
        '--limit', String(this.options.runsPerWorkflow * 5), // fetch extra to cover multiple workflows
        '--json', 'name,status,conclusion,headBranch,number,databaseId,createdAt',
      ];

      if (this.options.repo) {
        args.push('--repo', this.options.repo);
      }

      const { stdout } = await execFileAsync('gh', args, {
        timeout: 15000,
      });

      const parsed = JSON.parse(stdout) as Array<{
        name: string;
        status: string;
        conclusion: string;
        headBranch: string;
        number: number;
        databaseId: number;
        createdAt: string;
      }>;

      return parsed.map((r) => ({
        name: r.name,
        status: r.status,
        conclusion: r.conclusion ?? 'pending',
        headBranch: r.headBranch,
        runNumber: r.number,
        databaseId: r.databaseId,
        createdAt: r.createdAt,
      }));
    } catch {
      // gh CLI not available or not authenticated
      return [];
    }
  }

  private groupByWorkflow(runs: WorkflowRun[]): Record<string, WorkflowRun[]> {
    const grouped: Record<string, WorkflowRun[]> = {};
    for (const run of runs) {
      if (!grouped[run.name]) {
        grouped[run.name] = [];
      }
      grouped[run.name].push(run);
    }
    // Limit per workflow
    for (const name of Object.keys(grouped)) {
      grouped[name] = grouped[name].slice(0, this.options.runsPerWorkflow);
    }
    return grouped;
  }

  private countConsecutiveFailures(runs: WorkflowRun[]): number {
    let count = 0;
    for (const run of runs) {
      if (run.conclusion === 'failure') {
        count++;
      } else {
        break;
      }
    }
    return count;
  }

  private calculateHealthScore(workflows: WorkflowStatus[]): number {
    if (workflows.length === 0) return 100;
    const avgSuccess =
      workflows.reduce((sum, w) => sum + w.successRate, 0) / workflows.length;
    return Math.round(avgSuccess);
  }

  private enqueueFailureAlert(name: string, run: WorkflowRun): void {
    const payload: CIFailurePayload = {
      type: 'ci_failure',
      workflowName: name,
      runId: run.databaseId,
      conclusion: run.conclusion,
    };

    const item: QueueItem<DaemonTaskPayload> = {
      id: `ci-failure-${name}-${Date.now()}`,
      priority: 'now',
      payload,
      createdAt: Date.now(),
      source: 'ci-monitor',
      ttlMs: 30 * 60 * 1000, // 30 min TTL
    };

    this.queue.enqueue(item);
  }
}
