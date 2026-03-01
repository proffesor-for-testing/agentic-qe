/**
 * Enhanced Streaming Output for AQE v3 CLI
 *
 * Provides real-time streaming output for test execution,
 * coverage analysis, and agent activity per ADR-041.
 *
 * Features:
 * - Test result streaming with pass/fail icons
 * - Coverage progress streaming
 * - Agent activity streaming
 * - Real-time updates with buffering
 */

import chalk from 'chalk';
import { getCLIConfig, shouldUseColors } from '../config/cli-config.js';

// ============================================================================
// Types
// ============================================================================

/** Test result status */
export type TestStatus = 'passed' | 'failed' | 'skipped' | 'pending' | 'running';

/** Individual test case result */
export interface TestCaseResult {
  name: string;
  status: TestStatus;
  duration?: number;
  error?: {
    expected?: string;
    received?: string;
    message?: string;
  };
}

/** Test file/suite result */
export interface TestSuiteResult {
  name: string;
  status: TestStatus;
  tests: TestCaseResult[];
  duration?: number;
}

/** Summary of test execution */
export interface TestSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
}

/** Coverage data for a file */
export interface FileCoverage {
  file: string;
  lines: { covered: number; total: number };
  branches: { covered: number; total: number };
  functions: { covered: number; total: number };
  statements: { covered: number; total: number };
}

/** Coverage summary */
export interface CoverageSummary {
  overall: number;
  files: FileCoverage[];
  gaps: CoverageGap[];
}

/** Coverage gap information */
export interface CoverageGap {
  file: string;
  line: number;
  type: 'line' | 'branch' | 'function';
  description?: string;
  risk?: 'high' | 'medium' | 'low';
}

/** Agent activity event */
export interface AgentActivity {
  agentId: string;
  agentName: string;
  action: string;
  timestamp: number;
  details?: Record<string, unknown>;
}

/** Streaming options configuration */
export interface StreamingOptions {
  /** Buffer size for batching updates */
  bufferSize?: number;
  /** Update interval in milliseconds */
  updateIntervalMs?: number;
  /** Enable colors in output */
  colors?: boolean;
  /** Show timestamps */
  showTimestamps?: boolean;
  /** Indentation level */
  indentLevel?: number;
  /** Compact output mode */
  compact?: boolean;
}

// ============================================================================
// Icons and Formatting
// ============================================================================

const ICONS = {
  pass: '\u2713', // checkmark
  fail: '\u2717', // X
  skip: '\u25CB', // circle
  pending: '\u25CF', // filled circle
  running: '\u25B6', // play
  arrow: '\u2192', // arrow
  bullet: '\u2022', // bullet
};

/**
 * Get default streaming options from CLI config (ADR-041)
 */
function getDefaultOptions(): Required<StreamingOptions> {
  const cliConfig = getCLIConfig();
  return {
    bufferSize: cliConfig.streaming.bufferSize,
    updateIntervalMs: cliConfig.streaming.updateIntervalMs,
    colors: shouldUseColors(),
    showTimestamps: false,
    indentLevel: 0,
    compact: false,
  };
}

// ============================================================================
// Test Result Streaming
// ============================================================================

/**
 * Stream handler for real-time test result output
 */
export class TestResultStreamer {
  private options: Required<StreamingOptions>;
  private buffer: string[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private suiteCount = 0;
  private testCount = { passed: 0, failed: 0, skipped: 0, total: 0 };
  private startTime = Date.now();
  private isActive = false;

  constructor(options: StreamingOptions = {}) {
    this.options = { ...getDefaultOptions(), ...options };
  }

  /**
   * Start streaming output
   */
  start(): void {
    this.isActive = true;
    this.startTime = Date.now();
    this.testCount = { passed: 0, failed: 0, skipped: 0, total: 0 };
    this.suiteCount = 0;
  }

  /**
   * Stream a test suite result
   */
  streamSuite(suite: TestSuiteResult): void {
    if (!this.isActive) return;

    this.suiteCount++;
    const icon = this.getSuiteIcon(suite.status);
    const name = this.formatName(suite.name);
    const duration = suite.duration ? this.formatDuration(suite.duration) : '';

    // Suite header
    this.writeLine(`${icon} ${name}${duration ? ` ${chalk.gray(`(${duration})`)}` : ''}`);

    // Individual tests
    for (const test of suite.tests) {
      this.streamTest(test, 1);
    }

    // Add blank line after suite (unless compact)
    if (!this.options.compact) {
      this.writeLine('');
    }
  }

  /**
   * Stream a single test result
   */
  streamTest(test: TestCaseResult, indent = 0): void {
    if (!this.isActive) return;

    this.testCount.total++;
    const icon = this.getTestIcon(test.status);
    const name = this.formatName(test.name);
    const duration = test.duration !== undefined ? this.formatDuration(test.duration) : '';
    const prefix = '  '.repeat(indent + this.options.indentLevel);

    // Update counts
    if (test.status === 'passed') this.testCount.passed++;
    else if (test.status === 'failed') this.testCount.failed++;
    else if (test.status === 'skipped') this.testCount.skipped++;

    // Test line
    this.writeLine(`${prefix}${icon} ${name}${duration ? ` ${chalk.gray(`(${duration})`)}` : ''}`);

    // Error details for failed tests
    if (test.status === 'failed' && test.error) {
      this.streamError(test.error, indent + 1);
    }
  }

  /**
   * Stream error details
   */
  private streamError(error: TestCaseResult['error'], indent: number): void {
    if (!error) return;

    const prefix = '  '.repeat(indent + this.options.indentLevel + 1);

    if (error.expected !== undefined) {
      this.writeLine(`${prefix}${chalk.green(`Expected: ${JSON.stringify(error.expected)}`)}`);
    }
    if (error.received !== undefined) {
      this.writeLine(`${prefix}${chalk.red(`Received: ${JSON.stringify(error.received)}`)}`);
    }
    if (error.message && !error.expected && !error.received) {
      this.writeLine(`${prefix}${chalk.red(error.message)}`);
    }
  }

  /**
   * Stream the test summary
   */
  streamSummary(): void {
    if (!this.isActive) return;

    const duration = Date.now() - this.startTime;
    const { passed, failed, skipped, total } = this.testCount;

    this.writeLine('');

    // Tests line
    const parts: string[] = [];
    if (passed > 0) parts.push(chalk.green(`${passed} passed`));
    if (failed > 0) parts.push(chalk.red(`${failed} failed`));
    if (skipped > 0) parts.push(chalk.yellow(`${skipped} skipped`));

    this.writeLine(`Tests: ${parts.join(', ')}`);
    this.writeLine(`Time:  ${this.formatDuration(duration)}`);
  }

  /**
   * Stop streaming and flush buffer
   */
  stop(): TestSummary {
    this.flush();
    this.isActive = false;

    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    return {
      total: this.testCount.total,
      passed: this.testCount.passed,
      failed: this.testCount.failed,
      skipped: this.testCount.skipped,
      duration: Date.now() - this.startTime,
    };
  }

  /**
   * Get the current test counts
   */
  getCounts(): { passed: number; failed: number; skipped: number; total: number } {
    return { ...this.testCount };
  }

  private getSuiteIcon(status: TestStatus): string {
    const colors = this.options.colors;
    switch (status) {
      case 'passed':
        return colors ? chalk.green(ICONS.pass) : ICONS.pass;
      case 'failed':
        return colors ? chalk.red(ICONS.fail) : ICONS.fail;
      case 'skipped':
        return colors ? chalk.yellow(ICONS.skip) : ICONS.skip;
      case 'running':
        return colors ? chalk.cyan(ICONS.running) : ICONS.running;
      default:
        return colors ? chalk.gray(ICONS.pending) : ICONS.pending;
    }
  }

  private getTestIcon(status: TestStatus): string {
    const colors = this.options.colors;
    switch (status) {
      case 'passed':
        return colors ? chalk.green(ICONS.pass) : ICONS.pass;
      case 'failed':
        return colors ? chalk.red(ICONS.fail) : ICONS.fail;
      case 'skipped':
        return colors ? chalk.yellow(ICONS.skip) : ICONS.skip;
      case 'running':
        return colors ? chalk.cyan(ICONS.running) : ICONS.running;
      default:
        return colors ? chalk.gray(ICONS.pending) : ICONS.pending;
    }
  }

  private formatName(name: string): string {
    return this.options.colors ? name : name;
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(3)}s`;
    const mins = Math.floor(ms / 60000);
    const secs = ((ms % 60000) / 1000).toFixed(1);
    return `${mins}m ${secs}s`;
  }

  private writeLine(line: string): void {
    this.buffer.push(line);

    if (this.buffer.length >= this.options.bufferSize) {
      this.flush();
    } else if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), this.options.updateIntervalMs);
      this.flushTimer.unref?.();
    }
  }

  private flush(): void {
    if (this.buffer.length > 0) {
      console.log(this.buffer.join('\n'));
      this.buffer = [];
    }

    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }
}

// ============================================================================
// Coverage Progress Streaming
// ============================================================================

/**
 * Stream handler for coverage analysis progress
 */
export class CoverageStreamer {
  private options: Required<StreamingOptions>;
  private isActive = false;
  private fileCount = 0;
  private processedCount = 0;

  constructor(options: StreamingOptions = {}) {
    this.options = { ...getDefaultOptions(), ...options };
  }

  /**
   * Start streaming coverage output
   */
  start(totalFiles?: number): void {
    this.isActive = true;
    this.fileCount = totalFiles || 0;
    this.processedCount = 0;

    if (totalFiles) {
      console.log(chalk.blue(`\nAnalyzing coverage for ${totalFiles} file(s)...\n`));
    }
  }

  /**
   * Stream coverage for a single file
   */
  streamFileCoverage(coverage: FileCoverage): void {
    if (!this.isActive) return;

    this.processedCount++;
    const percent = this.calculateOverallPercent(coverage);
    const icon = this.getCoverageIcon(percent);
    const bar = this.createCoverageBar(percent);

    const line = `${icon} ${coverage.file.padEnd(50)} ${bar} ${percent.toFixed(1)}%`;
    console.log(line);
  }

  /**
   * Stream a coverage gap
   */
  streamGap(gap: CoverageGap): void {
    if (!this.isActive) return;

    const riskColor = gap.risk === 'high' ? chalk.red : gap.risk === 'medium' ? chalk.yellow : chalk.gray;
    const riskBadge = gap.risk ? riskColor(`[${gap.risk.toUpperCase()}]`) : '';

    console.log(`  ${ICONS.arrow} ${gap.file}:${gap.line} ${chalk.gray(gap.type)} ${riskBadge}`);
    if (gap.description) {
      console.log(`    ${chalk.gray(gap.description)}`);
    }
  }

  /**
   * Stream the coverage summary
   */
  streamSummary(summary: CoverageSummary): void {
    if (!this.isActive) return;

    console.log('');
    console.log(chalk.bold('Coverage Summary'));
    console.log('');

    // Overall coverage
    const overallIcon = this.getCoverageIcon(summary.overall);
    const overallBar = this.createCoverageBar(summary.overall);
    console.log(`Overall: ${overallIcon} ${overallBar} ${summary.overall.toFixed(1)}%`);
    console.log('');

    // Gaps section
    if (summary.gaps.length > 0) {
      console.log(chalk.yellow(`Coverage Gaps (${summary.gaps.length}):`));
      for (const gap of summary.gaps.slice(0, 10)) {
        this.streamGap(gap);
      }
      if (summary.gaps.length > 10) {
        console.log(chalk.gray(`  ... and ${summary.gaps.length - 10} more gaps`));
      }
    } else {
      console.log(chalk.green('No significant coverage gaps found.'));
    }

    console.log('');
  }

  /**
   * Stop streaming
   */
  stop(): void {
    this.isActive = false;
  }

  private calculateOverallPercent(coverage: FileCoverage): number {
    const metrics = [
      coverage.lines.total > 0 ? (coverage.lines.covered / coverage.lines.total) * 100 : 100,
      coverage.branches.total > 0 ? (coverage.branches.covered / coverage.branches.total) * 100 : 100,
      coverage.functions.total > 0 ? (coverage.functions.covered / coverage.functions.total) * 100 : 100,
      coverage.statements.total > 0 ? (coverage.statements.covered / coverage.statements.total) * 100 : 100,
    ];
    return metrics.reduce((a, b) => a + b, 0) / metrics.length;
  }

  private getCoverageIcon(percent: number): string {
    if (percent >= 80) return chalk.green(ICONS.pass);
    if (percent >= 50) return chalk.yellow(ICONS.pending);
    return chalk.red(ICONS.fail);
  }

  private createCoverageBar(percent: number, width = 20): string {
    const filled = Math.round((percent / 100) * width);
    const empty = width - filled;
    const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(empty);

    if (percent >= 80) return chalk.green(bar);
    if (percent >= 50) return chalk.yellow(bar);
    return chalk.red(bar);
  }
}

// ============================================================================
// Agent Activity Streaming
// ============================================================================

/**
 * Stream handler for agent activity in real-time
 */
export class AgentActivityStreamer {
  private options: Required<StreamingOptions>;
  private isActive = false;
  private activities: AgentActivity[] = [];

  constructor(options: StreamingOptions = {}) {
    this.options = { ...getDefaultOptions(), ...options };
  }

  /**
   * Start streaming agent activity
   */
  start(): void {
    this.isActive = true;
    this.activities = [];
    console.log(chalk.blue('\nAgent Activity Stream\n'));
  }

  /**
   * Stream an agent activity event
   */
  streamActivity(activity: AgentActivity): void {
    if (!this.isActive) return;

    this.activities.push(activity);

    const timestamp = this.options.showTimestamps
      ? chalk.gray(`[${new Date(activity.timestamp).toISOString().slice(11, 23)}] `)
      : '';
    const agentBadge = chalk.cyan(`[${activity.agentName}]`);
    const action = activity.action;

    console.log(`${timestamp}${agentBadge} ${action}`);

    if (activity.details && Object.keys(activity.details).length > 0) {
      const detailsStr = JSON.stringify(activity.details, null, 2)
        .split('\n')
        .map(line => `  ${chalk.gray(line)}`)
        .join('\n');
      console.log(detailsStr);
    }
  }

  /**
   * Stream a summary of agent activities
   */
  streamSummary(): void {
    if (!this.isActive) return;

    const agentCounts = new Map<string, number>();
    for (const activity of this.activities) {
      const count = agentCounts.get(activity.agentName) || 0;
      agentCounts.set(activity.agentName, count + 1);
    }

    console.log('');
    console.log(chalk.bold('Activity Summary'));
    console.log(`Total activities: ${this.activities.length}`);

    for (const [agent, count] of agentCounts.entries()) {
      console.log(`  ${agent}: ${count} actions`);
    }
    console.log('');
  }

  /**
   * Stop streaming
   */
  stop(): AgentActivity[] {
    this.isActive = false;
    return this.activities;
  }
}

// ============================================================================
// Unified Stream Handler
// ============================================================================

/** Stream event types */
export type StreamEventType = 'test-suite' | 'test-case' | 'coverage-file' | 'coverage-gap' | 'agent-activity' | 'summary' | 'message';

/** Stream event data */
export interface StreamEvent {
  type: StreamEventType;
  data: TestSuiteResult | TestCaseResult | FileCoverage | CoverageGap | AgentActivity | TestSummary | CoverageSummary | string;
}

/**
 * Unified streaming handler that routes events to appropriate streamers
 */
export class UnifiedStreamer {
  private testStreamer: TestResultStreamer;
  private coverageStreamer: CoverageStreamer;
  private agentStreamer: AgentActivityStreamer;
  private options: Required<StreamingOptions>;

  constructor(options: StreamingOptions = {}) {
    this.options = { ...getDefaultOptions(), ...options };
    this.testStreamer = new TestResultStreamer(options);
    this.coverageStreamer = new CoverageStreamer(options);
    this.agentStreamer = new AgentActivityStreamer(options);
  }

  /**
   * Handle a stream event
   */
  handleEvent(event: StreamEvent): void {
    switch (event.type) {
      case 'test-suite':
        this.testStreamer.streamSuite(event.data as TestSuiteResult);
        break;
      case 'test-case':
        this.testStreamer.streamTest(event.data as TestCaseResult);
        break;
      case 'coverage-file':
        this.coverageStreamer.streamFileCoverage(event.data as FileCoverage);
        break;
      case 'coverage-gap':
        this.coverageStreamer.streamGap(event.data as CoverageGap);
        break;
      case 'agent-activity':
        this.agentStreamer.streamActivity(event.data as AgentActivity);
        break;
      case 'summary':
        // Handle summary based on data type
        if ('total' in (event.data as object) && 'passed' in (event.data as object)) {
          this.testStreamer.streamSummary();
        } else if ('overall' in (event.data as object)) {
          this.coverageStreamer.streamSummary(event.data as CoverageSummary);
        }
        break;
      case 'message':
        console.log(chalk.gray(`  [stream] ${event.data}`));
        break;
    }
  }

  /**
   * Start all streamers
   */
  start(): void {
    this.testStreamer.start();
    this.coverageStreamer.start();
    this.agentStreamer.start();
  }

  /**
   * Stop all streamers
   */
  stop(): { tests: TestSummary; activities: AgentActivity[] } {
    return {
      tests: this.testStreamer.stop(),
      activities: this.agentStreamer.stop(),
    };
  }

  /**
   * Get the test result streamer for direct access
   */
  getTestStreamer(): TestResultStreamer {
    return this.testStreamer;
  }

  /**
   * Get the coverage streamer for direct access
   */
  getCoverageStreamer(): CoverageStreamer {
    return this.coverageStreamer;
  }

  /**
   * Get the agent activity streamer for direct access
   */
  getAgentStreamer(): AgentActivityStreamer {
    return this.agentStreamer;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a streaming handler for test execution
 */
export function createTestStreamHandler(options?: StreamingOptions): {
  onStream: (data: unknown) => void;
  streamer: TestResultStreamer;
} {
  const streamer = new TestResultStreamer(options);
  streamer.start();

  return {
    onStream: (data: unknown) => {
      const event = data as { type?: string; suite?: TestSuiteResult; test?: TestCaseResult; message?: string };

      if (event.suite) {
        streamer.streamSuite(event.suite);
      } else if (event.test) {
        streamer.streamTest(event.test);
      } else if (event.type === 'summary') {
        streamer.streamSummary();
      } else if (event.message) {
        console.log(chalk.gray(`  [stream] ${event.message}`));
      }
    },
    streamer,
  };
}

/**
 * Create a streaming handler for coverage analysis
 */
export function createCoverageStreamHandler(options?: StreamingOptions): {
  onStream: (data: unknown) => void;
  streamer: CoverageStreamer;
} {
  const streamer = new CoverageStreamer(options);

  return {
    onStream: (data: unknown) => {
      const event = data as {
        type?: string;
        file?: FileCoverage;
        gap?: CoverageGap;
        summary?: CoverageSummary;
        totalFiles?: number;
        message?: string;
      };

      if (event.type === 'start' && event.totalFiles) {
        streamer.start(event.totalFiles);
      } else if (event.file) {
        streamer.streamFileCoverage(event.file);
      } else if (event.gap) {
        streamer.streamGap(event.gap);
      } else if (event.summary) {
        streamer.streamSummary(event.summary);
      } else if (event.message) {
        console.log(chalk.gray(`  [stream] ${event.message}`));
      }
    },
    streamer,
  };
}

/**
 * Create a generic streaming handler that routes based on data type
 */
export function createUnifiedStreamHandler(options?: StreamingOptions): {
  onStream: (data: unknown) => void;
  unified: UnifiedStreamer;
} {
  const unified = new UnifiedStreamer(options);
  unified.start();

  return {
    onStream: (data: unknown) => {
      const event = data as StreamEvent | { message?: string };

      if ('type' in event && event.type) {
        unified.handleEvent(event as StreamEvent);
      } else if ('message' in event && event.message) {
        console.log(chalk.gray(`  [stream] ${event.message}`));
      }
    },
    unified,
  };
}

// ============================================================================
// Exports
// ============================================================================

export default {
  TestResultStreamer,
  CoverageStreamer,
  AgentActivityStreamer,
  UnifiedStreamer,
  createTestStreamHandler,
  createCoverageStreamHandler,
  createUnifiedStreamHandler,
  ICONS,
};
