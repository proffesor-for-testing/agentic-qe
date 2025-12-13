/**
 * CLI Output Helper
 *
 * Provides convenient helpers for integrating AI output formatting
 * into CLI commands and agents.
 *
 * @module output/CLIOutputHelper
 * @version 1.0.0
 */

import {
  OutputMode,
  OutputType,
  TestResultsData,
  CoverageReportData,
  AgentStatusData,
  QualityMetricsData,
  ExecutionMetadata,
  OutputModeDetector
} from './OutputFormatter';
import { OutputFormatterImpl } from './OutputFormatterImpl';

/**
 * CLI Output Helper
 * Simplifies output formatting for CLI commands
 */
export class CLIOutputHelper {
  private formatter: OutputFormatterImpl;

  constructor() {
    this.formatter = new OutputFormatterImpl();
  }

  /**
   * Output test results
   */
  outputTestResults(results: TestResultsData, options: OutputOptions = {}): void {
    const metadata = this.createMetadata('qe-test-executor', options);
    const output = this.formatter.formatTestResults(results, metadata);
    const mode = options.mode || this.formatter.detectMode();

    this.writeOutput(JSON.stringify(output), mode);
  }

  /**
   * Output coverage report
   */
  outputCoverageReport(coverage: CoverageReportData, options: OutputOptions = {}): void {
    const metadata = this.createMetadata('qe-coverage-analyzer', options);
    const output = this.formatter.formatCoverageReport(coverage, metadata);
    const mode = options.mode || this.formatter.detectMode();

    this.writeOutput(JSON.stringify(output), mode);
  }

  /**
   * Output agent status
   */
  outputAgentStatus(status: AgentStatusData, options: OutputOptions = {}): void {
    const metadata = this.createMetadata(status.agent.id, options);
    const output = this.formatter.formatAgentStatus(status, metadata);
    const mode = options.mode || this.formatter.detectMode();

    this.writeOutput(JSON.stringify(output), mode);
  }

  /**
   * Output quality metrics
   */
  outputQualityMetrics(metrics: QualityMetricsData, options: OutputOptions = {}): void {
    const metadata = this.createMetadata('qe-quality-assessor', options);
    const output = this.formatter.formatQualityMetrics(metrics, metadata);
    const mode = options.mode || this.formatter.detectMode();

    this.writeOutput(JSON.stringify(output), mode);
  }

  /**
   * Generic output method
   */
  output(data: unknown, outputType: OutputType, options: OutputOptions = {}): void {
    const mode = options.mode || this.formatter.detectMode();
    const formatted = this.formatter.format(data, outputType, mode);

    this.writeOutput(formatted, mode);
  }

  /**
   * Check if AI mode is enabled
   */
  isAIMode(): boolean {
    return this.formatter.detectMode() === OutputMode.AI;
  }

  /**
   * Check if human mode is enabled
   */
  isHumanMode(): boolean {
    return this.formatter.detectMode() === OutputMode.HUMAN;
  }

  /**
   * Get current output mode
   */
  getOutputMode(): OutputMode {
    return this.formatter.detectMode();
  }

  // ==================== Private Methods ====================

  /**
   * Create execution metadata
   */
  private createMetadata(agentId: string, options: OutputOptions): ExecutionMetadata {
    const startTime = options.startTime || Date.now();
    const duration = Date.now() - startTime;

    return {
      agentId,
      agentVersion: options.agentVersion || '2.3.5',
      duration,
      environment: (options.environment || process.env.NODE_ENV || 'development') as any,
      framework: options.framework,
      ci: options.ci
    };
  }

  /**
   * Write output to stdout
   */
  private writeOutput(output: string, mode: OutputMode): void {
    if (mode === OutputMode.AI) {
      // AI mode: write compact JSON to stdout
      process.stdout.write(output);
      process.stdout.write('\n');
    } else {
      // Human mode: use console.log for formatting
      console.log(output);
    }
  }
}

/**
 * Output options
 */
export interface OutputOptions {
  /** Output mode (overrides auto-detection) */
  mode?: OutputMode;

  /** Agent version */
  agentVersion?: string;

  /** Environment */
  environment?: 'production' | 'staging' | 'development' | 'test';

  /** Test framework */
  framework?: string;

  /** Start time for duration calculation */
  startTime?: number;

  /** CI/CD information */
  ci?: {
    provider: string;
    buildNumber: string;
    buildUrl?: string;
  };
}

/**
 * Streaming output helper
 */
export class StreamingOutputHelper {
  private executionId: string;
  private outputType: OutputType;

  constructor(executionId: string, outputType: OutputType) {
    this.executionId = executionId;
    this.outputType = outputType;
  }

  /**
   * Emit stream start
   */
  emitStart(metadata: { totalTests?: number; totalFiles?: number; estimatedDuration?: number }): void {
    if (!OutputModeDetector.isStreamingEnabled()) {
      return;
    }

    const message = {
      schemaVersion: '1.0.0',
      outputType: this.outputType,
      streamType: 'start',
      executionId: this.executionId,
      timestamp: new Date().toISOString(),
      metadata
    };

    this.emitMessage(message);
  }

  /**
   * Emit progress update
   */
  emitProgress(progress: {
    completed: number;
    total: number;
    passed?: number;
    failed?: number;
    elapsed?: number;
  }): void {
    if (!OutputModeDetector.isStreamingEnabled()) {
      return;
    }

    const message = {
      streamType: 'progress',
      ...progress
    };

    this.emitMessage(message);
  }

  /**
   * Emit completion
   */
  emitComplete(data: unknown): void {
    if (!OutputModeDetector.isStreamingEnabled()) {
      return;
    }

    const message = {
      streamType: 'complete',
      executionId: this.executionId,
      timestamp: new Date().toISOString(),
      data
    };

    this.emitMessage(message);
  }

  /**
   * Emit error
   */
  emitError(error: { code: string; message: string; stack?: string }): void {
    if (!OutputModeDetector.isStreamingEnabled()) {
      return;
    }

    const message = {
      streamType: 'error',
      executionId: this.executionId,
      timestamp: new Date().toISOString(),
      error
    };

    this.emitMessage(message);
  }

  /**
   * Emit message (newline-delimited JSON)
   */
  private emitMessage(message: unknown): void {
    process.stdout.write(JSON.stringify(message));
    process.stdout.write('\n');
  }
}

/**
 * Environment detection utilities
 */
export class EnvironmentDetector {
  /**
   * Check if running in Claude Code
   */
  static isClaudeCode(): boolean {
    return process.env.CLAUDECODE === '1';
  }

  /**
   * Check if running in Cursor AI
   */
  static isCursorAI(): boolean {
    return process.env.CURSOR_AI === '1';
  }

  /**
   * Check if running in Aider AI
   */
  static isAiderAI(): boolean {
    return process.env.AIDER_AI === '1';
  }

  /**
   * Check if running in CI/CD
   */
  static isCI(): boolean {
    return process.env.CI === 'true' || process.env.CI === '1';
  }

  /**
   * Detect CI/CD provider
   */
  static detectCIProvider(): string | null {
    if (process.env.GITHUB_ACTIONS === 'true') {
      return 'github-actions';
    }
    if (process.env.GITLAB_CI === 'true') {
      return 'gitlab-ci';
    }
    if (process.env.JENKINS_URL) {
      return 'jenkins';
    }
    if (process.env.CIRCLECI === 'true') {
      return 'circleci';
    }
    if (process.env.TRAVIS === 'true') {
      return 'travis-ci';
    }
    return null;
  }

  /**
   * Get CI/CD information
   */
  static getCIInfo(): { provider: string; buildNumber: string; buildUrl?: string } | undefined {
    const provider = this.detectCIProvider();
    if (!provider) {
      return undefined;
    }

    let buildNumber = '';
    let buildUrl: string | undefined;

    switch (provider) {
      case 'github-actions':
        buildNumber = process.env.GITHUB_RUN_NUMBER || '';
        buildUrl = process.env.GITHUB_SERVER_URL
          ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
          : undefined;
        break;
      case 'gitlab-ci':
        buildNumber = process.env.CI_PIPELINE_ID || '';
        buildUrl = process.env.CI_PIPELINE_URL;
        break;
      case 'jenkins':
        buildNumber = process.env.BUILD_NUMBER || '';
        buildUrl = process.env.BUILD_URL;
        break;
      case 'circleci':
        buildNumber = process.env.CIRCLE_BUILD_NUM || '';
        buildUrl = process.env.CIRCLE_BUILD_URL;
        break;
      case 'travis-ci':
        buildNumber = process.env.TRAVIS_BUILD_NUMBER || '';
        buildUrl = process.env.TRAVIS_BUILD_WEB_URL;
        break;
    }

    return {
      provider,
      buildNumber,
      buildUrl
    };
  }
}

/**
 * Default singleton instance
 */
export const cliOutputHelper = new CLIOutputHelper();

/**
 * Convenience functions for direct use
 */
export function outputTestResults(results: TestResultsData, options?: OutputOptions): void {
  cliOutputHelper.outputTestResults(results, options);
}

export function outputCoverageReport(coverage: CoverageReportData, options?: OutputOptions): void {
  cliOutputHelper.outputCoverageReport(coverage, options);
}

export function outputAgentStatus(status: AgentStatusData, options?: OutputOptions): void {
  cliOutputHelper.outputAgentStatus(status, options);
}

export function outputQualityMetrics(metrics: QualityMetricsData, options?: OutputOptions): void {
  cliOutputHelper.outputQualityMetrics(metrics, options);
}

export function isAIMode(): boolean {
  return cliOutputHelper.isAIMode();
}

export function isHumanMode(): boolean {
  return cliOutputHelper.isHumanMode();
}

export function createStreamingOutput(executionId: string, outputType: OutputType): StreamingOutputHelper {
  return new StreamingOutputHelper(executionId, outputType);
}
