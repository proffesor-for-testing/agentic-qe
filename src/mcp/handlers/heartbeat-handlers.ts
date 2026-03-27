/**
 * Heartbeat MCP Handlers (Imp-10)
 *
 * Exposes the token-free heartbeat scheduler through MCP tools:
 * - heartbeat_status: Returns current heartbeat health and metrics
 * - heartbeat_trigger: Triggers an immediate heartbeat cycle
 * - heartbeat_log: Returns daily log entries for a given date
 */

import * as fs from 'fs';
import * as path from 'path';
import type { ToolResult } from '../types.js';
import { HeartbeatSchedulerWorker } from '../../workers/workers/heartbeat-scheduler.js';
import type { WorkerResult } from '../../workers/interfaces.js';
import { toErrorMessage } from '../../shared/error-utils.js';
import { findProjectRoot } from '../../kernel/unified-memory.js';

// ============================================================================
// Types
// ============================================================================

export type HeartbeatStatusParams = Record<string, never>;

export interface HeartbeatStatusResult {
  status: string;
  healthScore: number;
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  avgDurationMs: number;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastResult: {
    success: boolean;
    durationMs: number;
    healthScore: number;
    trend: string;
    domainMetrics: Record<string, number | string>;
  } | null;
}

export interface HeartbeatTriggerParams {
  /** Optional: timeout in milliseconds (default: 60000) */
  timeout?: number;
}

export interface HeartbeatTriggerResult {
  success: boolean;
  durationMs: number;
  healthScore: number;
  trend: string;
  promoted: number;
  deprecated: number;
  decayed: number;
  pendingExperiences: number;
  avgConfidence: number;
  findingsCount: number;
  recommendationsCount: number;
}

export interface HeartbeatLogParams {
  /** Date in YYYY-MM-DD format (defaults to today) */
  date?: string;
}

export interface HeartbeatLogResult {
  date: string;
  exists: boolean;
  content: string;
  lineCount: number;
}

// ============================================================================
// Shared State
// ============================================================================

let sharedWorker: HeartbeatSchedulerWorker | null = null;

function getWorker(): HeartbeatSchedulerWorker {
  if (!sharedWorker) {
    sharedWorker = new HeartbeatSchedulerWorker();
  }
  return sharedWorker;
}

// ============================================================================
// Handlers
// ============================================================================

/**
 * Get the current heartbeat scheduler status and health metrics.
 */
export async function handleHeartbeatStatus(
  _params: HeartbeatStatusParams,
): Promise<ToolResult<HeartbeatStatusResult>> {
  try {
    const worker = getWorker();
    await worker.initialize();
    const health = worker.getHealth();
    const lastResult = worker.lastResult;

    return {
      success: true,
      data: {
        status: health.status,
        healthScore: health.healthScore,
        totalExecutions: health.totalExecutions,
        successfulExecutions: health.successfulExecutions,
        failedExecutions: health.failedExecutions,
        avgDurationMs: health.avgDurationMs,
        lastRunAt: worker.lastRunAt?.toISOString() ?? null,
        nextRunAt: worker.nextRunAt?.toISOString() ?? null,
        lastResult: lastResult
          ? {
              success: lastResult.success,
              durationMs: lastResult.durationMs,
              healthScore: lastResult.metrics.healthScore,
              trend: lastResult.metrics.trend,
              domainMetrics: lastResult.metrics.domainMetrics,
            }
          : null,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to get heartbeat status: ${toErrorMessage(error)}`,
    };
  }
}

/**
 * Trigger an immediate heartbeat cycle and return the result.
 */
export async function handleHeartbeatTrigger(
  params: HeartbeatTriggerParams,
): Promise<ToolResult<HeartbeatTriggerResult>> {
  try {
    const worker = getWorker();
    await worker.initialize();

    const abortController = new AbortController();

    // The worker already enforces its own 60s timeout via BaseWorker.executeWithTimeout().
    // Only add an external abort if the caller explicitly requests a *shorter* timeout.
    const userTimeout = params.timeout && params.timeout > 0 ? params.timeout : null;
    const timeoutHandle = userTimeout
      ? setTimeout(() => abortController.abort(), userTimeout)
      : null;

    let result: WorkerResult;
    try {
      result = await worker.execute({
        eventBus: { publish: async () => {} },
        memory: {
          get: async () => undefined,
          set: async () => {},
          search: async () => [],
        },
        logger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        },
        domains: {
          getDomainAPI: () => undefined,
          getDomainHealth: () => ({ status: 'healthy', errors: [] }),
        },
        signal: abortController.signal,
      });
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }

    const dm = result.metrics.domainMetrics;

    return {
      success: true,
      data: {
        success: result.success,
        durationMs: result.durationMs,
        healthScore: result.metrics.healthScore,
        trend: result.metrics.trend,
        promoted: Number(dm.promoted ?? 0),
        deprecated: Number(dm.deprecated ?? 0),
        decayed: Number(dm.decayed ?? 0),
        pendingExperiences: Number(dm.pendingExperiences ?? 0),
        avgConfidence: Number(dm.avgConfidence ?? 0),
        findingsCount: result.findings.length,
        recommendationsCount: result.recommendations.length,
      },
    };
  } catch (error) {
    const msg = toErrorMessage(error);
    const isTimeout = msg.includes('aborted') || msg.includes('abort') || msg.includes('timed out');
    return {
      success: false,
      error: isTimeout
        ? `Heartbeat timed out after ${params.timeout ?? 60000}ms`
        : `Failed to trigger heartbeat: ${msg}`,
    };
  }
}

/**
 * Read the daily log for a given date (defaults to today).
 */
export async function handleHeartbeatLog(
  params: HeartbeatLogParams,
): Promise<ToolResult<HeartbeatLogResult>> {
  try {
    const targetDate = params.date || new Date().toISOString().split('T')[0];

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
      return {
        success: false,
        error: "Invalid date format. Use YYYY-MM-DD (e.g., '2026-03-27').",
      };
    }

    const logDir = path.join(findProjectRoot(), '.agentic-qe', 'logs');
    const logPath = path.join(logDir, `${targetDate}.md`);

    if (!fs.existsSync(logPath)) {
      return {
        success: true,
        data: {
          date: targetDate,
          exists: false,
          content: '',
          lineCount: 0,
        },
      };
    }

    const content = fs.readFileSync(logPath, 'utf-8');
    const lineCount = content.split('\n').filter((l) => l.trim()).length;

    return {
      success: true,
      data: {
        date: targetDate,
        exists: true,
        content,
        lineCount,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to read heartbeat log: ${toErrorMessage(error)}`,
    };
  }
}
