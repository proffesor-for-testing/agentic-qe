/**
 * Flaky Test Tracker
 *
 * Tracks test execution history to identify flaky tests.
 * A test is considered flaky if it has inconsistent pass/fail
 * results across runs.
 */

import type { TestResult, FlakyTestRecord } from '../interfaces';

// ============================================================================
// Types
// ============================================================================

export interface FlakyTrackerConfig {
  /** Path to store flaky test history */
  historyPath?: string;

  /** Minimum runs before calculating flakiness */
  minRunsForFlakiness: number;

  /** Threshold to consider a test flaky (0-1) */
  flakinessThreshold: number;

  /** How many recent errors to keep */
  maxRecentErrors: number;

  /** Days to keep history */
  historyRetentionDays: number;
}

export interface FlakyAnalysis {
  /** All tracked tests */
  totalTests: number;

  /** Tests identified as flaky */
  flakyTests: FlakyTestRecord[];

  /** Tests that were flaky but stabilized */
  stabilizedTests: FlakyTestRecord[];

  /** Tests with not enough data */
  insufficientData: FlakyTestRecord[];

  /** Overall flakiness score (0-1) */
  overallFlakiness: number;

  /** Trend (improving, degrading, stable) */
  trend: 'improving' | 'degrading' | 'stable';
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: FlakyTrackerConfig = {
  minRunsForFlakiness: 5,
  flakinessThreshold: 0.1, // 10% failure rate = flaky
  maxRecentErrors: 5,
  historyRetentionDays: 30,
};

// ============================================================================
// Flaky Test Tracker
// ============================================================================

export class FlakyTestTracker {
  private records: Map<string, FlakyTestRecord> = new Map();
  private config: FlakyTrackerConfig;

  constructor(config?: Partial<FlakyTrackerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Record a test execution result
   */
  recordResult(result: TestResult): void {
    const testId = this.getTestId(result);
    const record = this.getOrCreateRecord(testId, result);

    record.totalRuns++;
    record.lastRun = new Date();

    if (result.passed) {
      record.passCount++;
    } else {
      record.failCount++;
      if (result.error) {
        record.recentErrors = [
          result.error,
          ...record.recentErrors.slice(0, this.config.maxRecentErrors - 1),
        ];
      }
    }

    // Check if this run was flaky (passed on retry)
    if (result.retries > 0 && result.passed) {
      record.flakyCount++;
      record.lastFlaky = new Date();
    }

    // Recalculate flakiness score
    record.flakinessScore = this.calculateFlakiness(record);
  }

  /**
   * Record multiple test results
   */
  recordResults(results: TestResult[]): void {
    for (const result of results) {
      this.recordResult(result);
    }
  }

  /**
   * Get flaky test record by ID
   */
  getRecord(testId: string): FlakyTestRecord | undefined {
    return this.records.get(testId);
  }

  /**
   * Get all flaky tests
   */
  getFlakyTests(): FlakyTestRecord[] {
    return Array.from(this.records.values()).filter(
      (record) =>
        record.totalRuns >= this.config.minRunsForFlakiness &&
        record.flakinessScore >= this.config.flakinessThreshold
    );
  }

  /**
   * Check if a specific test is flaky
   */
  isFlaky(testId: string): boolean {
    const record = this.records.get(testId);
    if (!record) return false;

    return (
      record.totalRuns >= this.config.minRunsForFlakiness &&
      record.flakinessScore >= this.config.flakinessThreshold
    );
  }

  /**
   * Get comprehensive flaky analysis
   */
  analyze(): FlakyAnalysis {
    const allRecords = Array.from(this.records.values());

    const flakyTests = allRecords.filter(
      (r) =>
        r.totalRuns >= this.config.minRunsForFlakiness &&
        r.flakinessScore >= this.config.flakinessThreshold
    );

    const stabilizedTests = allRecords.filter(
      (r) =>
        r.totalRuns >= this.config.minRunsForFlakiness &&
        r.flakyCount > 0 &&
        r.flakinessScore < this.config.flakinessThreshold
    );

    const insufficientData = allRecords.filter(
      (r) => r.totalRuns < this.config.minRunsForFlakiness
    );

    // Calculate overall flakiness
    const totalWithSufficientData = allRecords.filter(
      (r) => r.totalRuns >= this.config.minRunsForFlakiness
    );
    const overallFlakiness =
      totalWithSufficientData.length > 0
        ? flakyTests.length / totalWithSufficientData.length
        : 0;

    // Determine trend based on recent flaky events
    const trend = this.calculateTrend(flakyTests);

    return {
      totalTests: allRecords.length,
      flakyTests: flakyTests.sort((a, b) => b.flakinessScore - a.flakinessScore),
      stabilizedTests,
      insufficientData,
      overallFlakiness,
      trend,
    };
  }

  /**
   * Get quarantine list (tests that should be isolated)
   */
  getQuarantineList(threshold = 0.3): string[] {
    return Array.from(this.records.values())
      .filter((r) => r.flakinessScore >= threshold)
      .map((r) => r.testId);
  }

  /**
   * Clear old history based on retention policy
   */
  pruneHistory(): number {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - this.config.historyRetentionDays);

    let pruned = 0;
    for (const [testId, record] of this.records) {
      if (record.lastRun < cutoff) {
        this.records.delete(testId);
        pruned++;
      }
    }

    return pruned;
  }

  /**
   * Export history for persistence
   */
  exportHistory(): FlakyTestRecord[] {
    return Array.from(this.records.values());
  }

  /**
   * Import history from persistence
   */
  importHistory(records: FlakyTestRecord[]): void {
    for (const record of records) {
      // Convert date strings to Date objects
      const imported: FlakyTestRecord = {
        ...record,
        lastRun: new Date(record.lastRun),
        lastFlaky: record.lastFlaky ? new Date(record.lastFlaky) : undefined,
      };
      this.records.set(record.testId, imported);
    }
  }

  /**
   * Reset all tracking data
   */
  reset(): void {
    this.records.clear();
  }

  // --------------------------------------------------------------------------
  // Private Methods
  // --------------------------------------------------------------------------

  private getTestId(result: TestResult): string {
    return `${result.file}:${result.suite}:${result.name}`;
  }

  private getOrCreateRecord(testId: string, result: TestResult): FlakyTestRecord {
    let record = this.records.get(testId);

    if (!record) {
      record = {
        testId,
        file: result.file,
        name: result.name,
        totalRuns: 0,
        passCount: 0,
        failCount: 0,
        flakyCount: 0,
        flakinessScore: 0,
        lastRun: new Date(),
        recentErrors: [],
      };
      this.records.set(testId, record);
    }

    return record;
  }

  private calculateFlakiness(record: FlakyTestRecord): number {
    if (record.totalRuns < this.config.minRunsForFlakiness) {
      return 0; // Not enough data
    }

    // Flakiness score based on:
    // 1. Direct flaky events (passed on retry)
    // 2. Inconsistent pass/fail ratio (neither 100% pass nor 100% fail)

    const flakyRatio = record.flakyCount / record.totalRuns;
    const passRatio = record.passCount / record.totalRuns;

    // A test is flaky if it has direct flaky events
    // OR if it has a mixed pass/fail ratio (not stable)
    const inconsistencyScore =
      passRatio > 0 && passRatio < 1
        ? Math.min(passRatio, 1 - passRatio) * 2 // 0.5 pass ratio = 1.0 inconsistency
        : 0;

    // Weight direct flaky events more heavily
    return Math.min(1, flakyRatio * 3 + inconsistencyScore);
  }

  private calculateTrend(
    flakyTests: FlakyTestRecord[]
  ): 'improving' | 'degrading' | 'stable' {
    if (flakyTests.length === 0) {
      return 'stable';
    }

    const now = Date.now();
    const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;

    // Count recent vs old flaky events
    let recentFlaky = 0;
    let oldFlaky = 0;

    for (const test of flakyTests) {
      if (test.lastFlaky) {
        if (test.lastFlaky.getTime() > oneWeekAgo) {
          recentFlaky++;
        } else {
          oldFlaky++;
        }
      }
    }

    if (recentFlaky > oldFlaky * 1.5) {
      return 'degrading';
    } else if (oldFlaky > recentFlaky * 1.5) {
      return 'improving';
    }

    return 'stable';
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a flaky test tracker
 */
export function createFlakyTracker(
  config?: Partial<FlakyTrackerConfig>
): FlakyTestTracker {
  return new FlakyTestTracker(config);
}

/**
 * Load flaky tracker with persisted history
 */
export async function loadFlakyTracker(
  historyPath: string,
  config?: Partial<FlakyTrackerConfig>
): Promise<FlakyTestTracker> {
  const tracker = createFlakyTracker({ ...config, historyPath });

  try {
    const fs = await import('fs/promises');
    const content = await fs.readFile(historyPath, 'utf-8');
    const records = JSON.parse(content) as FlakyTestRecord[];
    tracker.importHistory(records);
  } catch {
    // No history file or invalid - start fresh
  }

  return tracker;
}

/**
 * Save flaky tracker history to disk
 */
export async function saveFlakyTracker(
  tracker: FlakyTestTracker,
  historyPath: string
): Promise<void> {
  const fs = await import('fs/promises');
  const history = tracker.exportHistory();
  await fs.writeFile(historyPath, JSON.stringify(history, null, 2));
}
