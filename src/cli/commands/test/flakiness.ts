/**
 * Test Flakiness Command
 * Detect flaky tests and calculate flakiness scores
 */

import { Database } from '../../../utils/Database';
import { Logger } from '../../../utils/Logger';

export interface FlakinessOptions {
  testHistory: TestHistoryEntry[];
  database: Database;
}

interface TestHistoryEntry {
  test: string;
  passed: boolean;
  timestamp: number;
  metadata?: Record<string, any>;
}

export interface FlakinessResult {
  success: boolean;
  flakyTests: FlakyTest[];
  rootCauses?: string[];
}

interface FlakyTest {
  test: string;
  flakinessScore: number;
  passRate: number;
  failures: number;
  successes: number;
  lastFailure?: number;
  pattern: string;
}

export async function flakiness(options: FlakinessOptions): Promise<FlakinessResult> {
  const logger = Logger.getInstance();

  try {
    // Group history by test
    const testGroups: Record<string, TestHistoryEntry[]> = {};
    for (const entry of options.testHistory) {
      if (!testGroups[entry.test]) {
        testGroups[entry.test] = [];
      }
      testGroups[entry.test].push(entry);
    }

    // Calculate flakiness for each test
    const flakyTests: FlakyTest[] = [];

    for (const [testName, history] of Object.entries(testGroups)) {
      if (history.length < 2) continue; // Need multiple runs to detect flakiness

      const successes = history.filter(h => h.passed).length;
      const failures = history.length - successes;
      const passRate = successes / history.length;

      // Calculate flakiness score (0 = stable, 1 = maximally flaky)
      // Tests with 50% pass rate are most flaky
      const flakinessScore = 1 - Math.abs(passRate - 0.5) * 2;

      // Only include tests with some flakiness
      if (failures > 0 && successes > 0 && flakinessScore > 0.3) {
        const sortedHistory = [...history].sort((a, b) => b.timestamp - a.timestamp);
        const lastFailure = sortedHistory.find(h => !h.passed)?.timestamp;

        const pattern = detectFlakinessPattern(history);

        flakyTests.push({
          test: testName,
          flakinessScore: parseFloat(flakinessScore.toFixed(3)),
          passRate: parseFloat(passRate.toFixed(3)),
          failures,
          successes,
          lastFailure,
          pattern
        });
      }
    }

    // Sort by flakiness score (highest first)
    flakyTests.sort((a, b) => b.flakinessScore - a.flakinessScore);

    // Identify root causes
    const rootCauses = identifyRootCauses(options.testHistory);

    logger.info(`Detected ${flakyTests.length} flaky tests`);

    return {
      success: true,
      flakyTests,
      rootCauses
    };

  } catch (error) {
    logger.error('Failed to analyze flakiness:', error);
    throw error;
  }
}

function detectFlakinessPattern(history: TestHistoryEntry[]): string {
  const sorted = [...history].sort((a, b) => a.timestamp - b.timestamp);

  // Check for alternating pattern
  let alternating = true;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].passed === sorted[i - 1].passed) {
      alternating = false;
      break;
    }
  }

  if (alternating) return 'alternating';

  // Check for sequential failures
  const failureRuns = [];
  let currentRun = 0;
  for (const entry of sorted) {
    if (!entry.passed) {
      currentRun++;
    } else if (currentRun > 0) {
      failureRuns.push(currentRun);
      currentRun = 0;
    }
  }
  if (currentRun > 0) failureRuns.push(currentRun);

  if (failureRuns.some(run => run >= 3)) return 'burst';

  return 'random';
}

function identifyRootCauses(history: TestHistoryEntry[]): string[] {
  const causes: Set<string> = new Set();

  // Analyze metadata for patterns
  const failedWithMetadata = history.filter(h => !h.passed && h.metadata);

  if (failedWithMetadata.length > 0) {
    // Check for environment-related flakiness
    const envs = failedWithMetadata.map(h => h.metadata?.env).filter(Boolean);
    if (new Set(envs).size > 1) {
      causes.add('Environment-dependent failures detected');
    }

    // Check for time-related flakiness
    const timestamps = failedWithMetadata.map(h => h.timestamp);
    const timeDiffs = [];
    for (let i = 1; i < timestamps.length; i++) {
      timeDiffs.push(timestamps[i] - timestamps[i - 1]);
    }
    const avgDiff = timeDiffs.reduce((a, b) => a + b, 0) / timeDiffs.length;
    if (avgDiff < 300000) { // Less than 5 minutes apart
      causes.add('Timing-related failures - tests may have race conditions');
    }
  }

  // Check overall failure patterns
  const passRate = history.filter(h => h.passed).length / history.length;
  if (passRate > 0.7 && passRate < 0.9) {
    causes.add('Moderate flakiness - may be caused by external dependencies');
  }

  return Array.from(causes);
}
