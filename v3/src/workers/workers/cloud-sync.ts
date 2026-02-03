/**
 * Agentic QE v3 - Cloud Sync Worker
 * Cloud Sync Plan Phase 4: Periodic Sync
 *
 * Periodically syncs local learning data to cloud PostgreSQL.
 * Runs every hour by default, configurable via AQE_SYNC_INTERVAL.
 */

import { BaseWorker } from '../base-worker.js';
import type {
  WorkerConfig,
  WorkerContext,
  WorkerResult,
  WorkerFinding,
  WorkerRecommendation,
  WorkerMetrics,
} from '../interfaces.js';

const CONFIG: WorkerConfig = {
  id: 'cloud-sync',
  name: 'Cloud Sync',
  description: 'Periodically syncs local learning data to cloud PostgreSQL',
  intervalMs: parseInt(process.env.AQE_SYNC_INTERVAL || '3600000', 10), // 1 hour default
  priority: 'low',
  targetDomains: ['learning-optimization'],
  enabled: process.env.AQE_CLOUD_SYNC_ENABLED === 'true',
  timeoutMs: 600000, // 10 minutes
  retryCount: 3,
  retryDelayMs: 60000, // 1 minute
};

interface SyncResultData {
  recordsSynced: number;
  tablesProcessed: number;
  errors: string[];
  durationMs: number;
}

/**
 * Create standard worker metrics
 */
function createMetrics(
  itemsAnalyzed: number,
  issuesFound: number,
  recordsSynced: number,
  durationMs: number
): WorkerMetrics {
  return {
    itemsAnalyzed,
    issuesFound,
    healthScore: issuesFound === 0 ? 100 : Math.max(0, 100 - issuesFound * 10),
    trend: 'stable',
    domainMetrics: {
      recordsSynced,
      durationMs,
    },
  };
}

export class CloudSyncWorker extends BaseWorker {
  constructor() {
    super(CONFIG);
  }

  protected async doExecute(context: WorkerContext): Promise<WorkerResult> {
    const startTime = Date.now();
    context.logger.info('Starting cloud sync worker');

    const findings: WorkerFinding[] = [];
    const recommendations: WorkerRecommendation[] = [];

    // Check if cloud sync is configured
    if (!process.env.GCP_PROJECT) {
      findings.push({
        type: 'info',
        title: 'Cloud sync not configured',
        description: 'GCP_PROJECT environment variable not set. Skipping cloud sync.',
        severity: 'info',
        domain: 'learning-optimization',
      });

      return {
        workerId: this.config.id,
        success: true,
        durationMs: Date.now() - startTime,
        findings,
        recommendations,
        metrics: createMetrics(0, 0, 0, Date.now() - startTime),
        timestamp: new Date(),
      };
    }

    // Check if gcloud is available
    const gcloudAvailable = await this.checkGcloudAvailable();
    if (!gcloudAvailable) {
      findings.push({
        type: 'warning',
        title: 'gcloud CLI not available',
        description: 'gcloud CLI not found. Install Google Cloud SDK for cloud sync.',
        severity: 'medium',
        domain: 'learning-optimization',
      });

      return {
        workerId: this.config.id,
        success: true,
        durationMs: Date.now() - startTime,
        findings,
        recommendations,
        metrics: createMetrics(0, 1, 0, Date.now() - startTime),
        timestamp: new Date(),
      };
    }

    try {
      // Dynamically import sync module to avoid loading it when not needed
      const { syncIncrementalToCloud } = await import('../../sync/index.js');

      context.logger.info('Running incremental sync to cloud...');
      const report = await syncIncrementalToCloud(undefined, {
        environment: process.env.AQE_ENV || 'devpod',
        verbose: false,
      });

      const syncResult: SyncResultData = {
        recordsSynced: report.totalRecordsSynced,
        tablesProcessed: report.results.length,
        errors: report.errors,
        durationMs: report.totalDurationMs,
      };

      // Log results
      if (syncResult.recordsSynced > 0) {
        findings.push({
          type: 'info',
          title: 'Cloud sync completed',
          description: `Synced ${syncResult.recordsSynced} records across ${syncResult.tablesProcessed} tables in ${syncResult.durationMs}ms`,
          severity: 'info',
          domain: 'learning-optimization',
        });
      }

      // Log errors
      for (const error of syncResult.errors) {
        findings.push({
          type: 'error',
          title: 'Sync error',
          description: error,
          severity: 'high',
          domain: 'learning-optimization',
        });
      }

      // Add recommendation if sync hasn't run in a while
      if (syncResult.recordsSynced === 0) {
        recommendations.push({
          priority: 'p3',
          domain: 'learning-optimization',
          action: 'Run `aqe sync --full` to force a full sync',
          description: 'No new records to sync. Consider running a full sync if data seems stale.',
          estimatedImpact: 'low',
          effort: 'low',
          autoFixable: true,
        });
      }

      return {
        workerId: this.config.id,
        success: syncResult.errors.length === 0,
        durationMs: Date.now() - startTime,
        findings,
        recommendations,
        metrics: createMetrics(
          syncResult.tablesProcessed,
          syncResult.errors.length,
          syncResult.recordsSynced,
          Date.now() - startTime
        ),
        timestamp: new Date(),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      context.logger.error(`Cloud sync failed: ${errorMessage}`);

      findings.push({
        type: 'error',
        title: 'Cloud sync failed',
        description: errorMessage,
        severity: 'high',
        domain: 'learning-optimization',
      });

      return {
        workerId: this.config.id,
        success: false,
        durationMs: Date.now() - startTime,
        error: errorMessage,
        findings,
        recommendations,
        metrics: createMetrics(0, 1, 0, Date.now() - startTime),
        timestamp: new Date(),
      };
    }
  }

  /**
   * Check if gcloud CLI is available
   */
  private async checkGcloudAvailable(): Promise<boolean> {
    try {
      const { execSync } = await import('child_process');
      execSync('which gcloud', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }
}

export default CloudSyncWorker;
