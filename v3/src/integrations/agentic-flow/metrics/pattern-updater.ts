/**
 * Agentic QE v3 - Pattern File Updater
 *
 * Updates pattern JSON files with real runtime metrics from the MetricsTracker.
 * Replaces hardcoded "successRate" values with actual measured outcomes.
 *
 * @example
 * ```typescript
 * const updater = await createPatternUpdater();
 *
 * // Update all pattern files with real metrics
 * await updater.updateAllPatterns();
 *
 * // Or update specific component patterns
 * await updater.updateComponentPatterns('booster');
 * ```
 *
 * @module integrations/agentic-flow/metrics/pattern-updater
 */

import * as fs from 'fs';
import * as path from 'path';
import type { MetricsTracker } from './metrics-tracker';
import { getMetricsTracker } from './metrics-tracker';
import type { MetricComponent, TimeWindow } from './types';

// ============================================================================
// Types
// ============================================================================

/**
 * Pattern file structure
 */
interface PatternFile {
  namespace: string;
  description: string;
  created: string;
  patterns: PatternEntry[];
}

/**
 * Individual pattern entry
 */
interface PatternEntry {
  key: string;
  pattern: string;
  description: string;
  successRate: number;
  lastUpdated: string;
  [key: string]: unknown;
}

/**
 * Pattern index file structure
 */
interface PatternIndex {
  name: string;
  version: string;
  description: string;
  created: string;
  namespace_index: Record<string, {
    file: string;
    patterns: string[];
    description: string;
  }>;
  pattern_statistics: {
    total_patterns: number;
    namespaces: number;
    avg_success_rate: number;
    implementation_status: string;
  };
  [key: string]: unknown;
}

/**
 * Pattern updater configuration
 */
export interface PatternUpdaterConfig {
  /** Base directory for pattern files */
  patternsDir: string;
  /** Time window for metrics (default: '30d') */
  timeWindow: TimeWindow;
  /** Minimum operations required before updating (default: 10) */
  minOperations: number;
  /** Whether to backup files before updating (default: true) */
  backup: boolean;
  /** Dry run mode - don't write files (default: false) */
  dryRun: boolean;
}

const DEFAULT_PATTERN_UPDATER_CONFIG: PatternUpdaterConfig = {
  patternsDir: '.agentic-qe/patterns',
  timeWindow: '30d',
  minOperations: 10,
  backup: true,
  dryRun: false,
};

/**
 * Mapping from component to pattern file
 */
const COMPONENT_PATTERN_FILES: Record<MetricComponent, string> = {
  booster: 'adr-051-booster-patterns.json',
  router: 'adr-051-router-patterns.json',
  embeddings: 'adr-051-embedding-patterns.json',
  reasoning: 'adr-051-reasoning-patterns.json',
};

// ============================================================================
// Pattern Updater Implementation
// ============================================================================

/**
 * Updates pattern JSON files with real runtime metrics
 */
export class PatternUpdater {
  private readonly config: PatternUpdaterConfig;
  private metricsTracker: MetricsTracker | null = null;
  private initialized = false;

  constructor(config: Partial<PatternUpdaterConfig> = {}) {
    this.config = { ...DEFAULT_PATTERN_UPDATER_CONFIG, ...config };
  }

  /**
   * Initialize the pattern updater
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.metricsTracker = await getMetricsTracker();
    this.initialized = true;
  }

  /**
   * Update all pattern files with real metrics
   *
   * @returns Summary of updates
   */
  async updateAllPatterns(): Promise<UpdateSummary> {
    await this.ensureInitialized();

    const summary: UpdateSummary = {
      updatedFiles: [],
      skippedFiles: [],
      errors: [],
      overallAvgSuccessRate: 0,
      totalPatterns: 0,
    };

    const components: MetricComponent[] = ['booster', 'router', 'embeddings', 'reasoning'];
    let totalSuccessRate = 0;
    let filesWithData = 0;

    for (const component of components) {
      try {
        const result = await this.updateComponentPatterns(component);

        if (result.updated) {
          summary.updatedFiles.push(result.file);
          totalSuccessRate += result.avgSuccessRate;
          filesWithData++;
        } else {
          summary.skippedFiles.push(result.file);
        }

        summary.totalPatterns += result.patternsCount;
      } catch (error) {
        summary.errors.push({
          file: COMPONENT_PATTERN_FILES[component],
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Update index file
    try {
      await this.updateIndexFile();
    } catch (error) {
      summary.errors.push({
        file: 'index.json',
        error: error instanceof Error ? error.message : String(error),
      });
    }

    summary.overallAvgSuccessRate = filesWithData > 0
      ? totalSuccessRate / filesWithData
      : 0;

    return summary;
  }

  /**
   * Update patterns for a specific component
   */
  async updateComponentPatterns(component: MetricComponent): Promise<ComponentUpdateResult> {
    await this.ensureInitialized();

    const filename = COMPONENT_PATTERN_FILES[component];
    const filepath = path.join(this.config.patternsDir, filename);

    // Check if file exists
    if (!fs.existsSync(filepath)) {
      return {
        file: filename,
        updated: false,
        patternsCount: 0,
        avgSuccessRate: 0,
        reason: 'File not found',
      };
    }

    // Get metrics from tracker
    const patternMetrics = await this.metricsTracker!.getPatternMetrics(
      component,
      this.config.timeWindow
    );

    // Also get overall component success rate
    const overallStats = await this.metricsTracker!.getSuccessRate(
      component,
      this.config.timeWindow
    );

    // Check minimum operations threshold
    if (overallStats.total < this.config.minOperations) {
      return {
        file: filename,
        updated: false,
        patternsCount: 0,
        avgSuccessRate: overallStats.rate,
        reason: `Insufficient data (${overallStats.total} < ${this.config.minOperations})`,
      };
    }

    // Read current file
    const content = fs.readFileSync(filepath, 'utf-8');
    const patternFile: PatternFile = JSON.parse(content);

    // Backup if enabled
    if (this.config.backup) {
      const backupPath = filepath + '.bak';
      fs.writeFileSync(backupPath, content);
    }

    // Update patterns
    let updatedCount = 0;
    const now = new Date().toISOString().split('T')[0];

    for (const pattern of patternFile.patterns) {
      // Find matching metrics by sub-type
      const matchingMetric = patternMetrics.find(m =>
        m.patternKey.includes(pattern.key) ||
        pattern.key.includes(m.patternKey.split('-').slice(1).join('-'))
      );

      if (matchingMetric && matchingMetric.totalOperations >= this.config.minOperations) {
        // Update with real metrics
        pattern.successRate = Math.round(matchingMetric.successRate * 100) / 100;
        pattern.lastUpdated = now;
        updatedCount++;
      } else if (overallStats.total >= this.config.minOperations) {
        // Use overall component success rate as fallback
        pattern.successRate = Math.round(overallStats.rate * 100) / 100;
        pattern.lastUpdated = now;
        updatedCount++;
      }
    }

    // Calculate average success rate
    const avgSuccessRate = patternFile.patterns.length > 0
      ? patternFile.patterns.reduce((sum, p) => sum + p.successRate, 0) / patternFile.patterns.length
      : 0;

    // Write updated file (unless dry run)
    if (!this.config.dryRun) {
      fs.writeFileSync(filepath, JSON.stringify(patternFile, null, 2) + '\n');
    }

    return {
      file: filename,
      updated: updatedCount > 0,
      patternsCount: patternFile.patterns.length,
      avgSuccessRate,
      updatedCount,
    };
  }

  /**
   * Update the index.json file with aggregated statistics
   */
  async updateIndexFile(): Promise<void> {
    await this.ensureInitialized();

    const indexPath = path.join(this.config.patternsDir, 'index.json');

    if (!fs.existsSync(indexPath)) {
      console.warn('[PatternUpdater] index.json not found, skipping');
      return;
    }

    // Get overall metrics summary
    const summary = await this.metricsTracker!.getMetricsSummary(this.config.timeWindow);

    // Read current index
    const content = fs.readFileSync(indexPath, 'utf-8');
    const index: PatternIndex = JSON.parse(content);

    // Backup if enabled
    if (this.config.backup) {
      fs.writeFileSync(indexPath + '.bak', content);
    }

    // Update statistics
    index.pattern_statistics.avg_success_rate =
      Math.round(summary.overall.successRate * 1000) / 1000;

    // Write updated file (unless dry run)
    if (!this.config.dryRun) {
      fs.writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n');
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }
}

// ============================================================================
// Result Types
// ============================================================================

interface ComponentUpdateResult {
  file: string;
  updated: boolean;
  patternsCount: number;
  avgSuccessRate: number;
  updatedCount?: number;
  reason?: string;
}

interface UpdateSummary {
  updatedFiles: string[];
  skippedFiles: string[];
  errors: Array<{ file: string; error: string }>;
  overallAvgSuccessRate: number;
  totalPatterns: number;
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create and initialize a pattern updater
 */
export async function createPatternUpdater(
  config: Partial<PatternUpdaterConfig> = {}
): Promise<PatternUpdater> {
  const updater = new PatternUpdater(config);
  await updater.initialize();
  return updater;
}

/**
 * Update all patterns with real metrics (convenience function)
 *
 * @example
 * ```typescript
 * // At end of session, update patterns with real metrics
 * const summary = await updatePatternsWithRealMetrics();
 * console.log(`Updated ${summary.updatedFiles.length} pattern files`);
 * ```
 */
export async function updatePatternsWithRealMetrics(
  config: Partial<PatternUpdaterConfig> = {}
): Promise<UpdateSummary> {
  const updater = await createPatternUpdater(config);
  return updater.updateAllPatterns();
}
