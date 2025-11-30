/**
 * JSON Reporter
 *
 * Generates structured JSON output for API consumption, storage,
 * and programmatic processing of quality check results.
 *
 * @module reporting/reporters/JSONReporter
 * @version 1.0.0
 */

import {
  Reporter,
  ReporterConfig,
  ReportFormat,
  ReporterOutput,
  AggregatedResults
} from '../types';

/**
 * JSON output structure
 */
export interface JSONReportOutput {
  /** Report metadata */
  meta: {
    reportVersion: string;
    generatedAt: string;
    executionId: string;
    format: string;
  };

  /** Project information */
  project: {
    name: string;
    version?: string;
    repository?: string;
    branch?: string;
    commit?: string;
    environment?: string;
  };

  /** Execution summary */
  summary: {
    status: string;
    message: string;
    deploymentReady: boolean;
    criticalIssues: number;
    warnings: number;
    highlights: string[];
    recommendations: string[];
  };

  /** Test results */
  tests: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    flaky?: number;
    duration: number;
    passRate: number;
    failureRate: number;
    results?: any[];
    suites?: any[];
  };

  /** Coverage data */
  coverage?: {
    overall: number;
    lines: {
      total: number;
      covered: number;
      uncovered: number;
      percentage: number;
    };
    branches: {
      total: number;
      covered: number;
      uncovered: number;
      percentage: number;
    };
    functions: {
      total: number;
      covered: number;
      uncovered: number;
      percentage: number;
    };
    statements: {
      total: number;
      covered: number;
      uncovered: number;
      percentage: number;
    };
    trend?: string;
    files?: any[];
  };

  /** Quality metrics */
  quality?: {
    score: number;
    grade: string;
    codeQuality: {
      maintainabilityIndex: number;
      cyclomaticComplexity: number;
      technicalDebt: number;
      codeSmells: number;
      duplications: number;
    };
    gates: {
      passed: number;
      failed: number;
      details?: any[];
    };
  };

  /** Security data */
  security?: {
    total: number;
    score: number;
    summary: {
      critical: number;
      high: number;
      medium: number;
      low: number;
      info: number;
    };
    vulnerabilities?: any[];
  };

  /** Performance data */
  performance?: {
    responseTime: {
      min: number;
      max: number;
      mean: number;
      median: number;
      p95: number;
      p99: number;
    };
    throughput: number;
    errorRate: number;
    resources: {
      cpu: number;
      memory: number;
      disk?: number;
    };
  };

  /** Execution metadata */
  metadata: {
    startedAt: string;
    completedAt: string;
    duration: number;
    ci?: any;
    agent?: any;
    environment?: any;
  };
}

/**
 * JSON Reporter
 *
 * @example
 * ```typescript
 * const reporter = new JSONReporter({ prettyPrint: true });
 * const output = reporter.report(aggregatedResults);
 * console.log(output.content); // Pretty-printed JSON
 * ```
 */
export class JSONReporter implements Reporter {
  private config: ReporterConfig;

  constructor(config: Partial<ReporterConfig> = {}) {
    this.config = {
      format: 'json',
      detailLevel: config.detailLevel || 'detailed',
      prettyPrint: config.prettyPrint !== undefined ? config.prettyPrint : true,
      includeTimestamps: config.includeTimestamps !== undefined ? config.includeTimestamps : true,
      includeMetadata: config.includeMetadata !== undefined ? config.includeMetadata : true
    };
  }

  /**
   * Generate JSON report
   */
  report(results: AggregatedResults): ReporterOutput {
    const startTime = Date.now();

    // Build JSON structure
    const jsonOutput: JSONReportOutput = {
      meta: {
        reportVersion: '1.0.0',
        generatedAt: new Date().toISOString(),
        executionId: results.executionId,
        format: 'json'
      },
      project: {
        name: results.project.name,
        version: results.project.version,
        repository: results.project.repository,
        branch: results.project.branch,
        commit: results.project.commit,
        environment: results.project.environment
      },
      summary: {
        status: results.summary.status,
        message: results.summary.message,
        deploymentReady: results.summary.deploymentReady,
        criticalIssues: results.summary.criticalIssues,
        warnings: results.summary.warnings,
        highlights: results.summary.highlights,
        recommendations: results.summary.recommendations
      },
      tests: {
        total: results.testResults.total,
        passed: results.testResults.passed,
        failed: results.testResults.failed,
        skipped: results.testResults.skipped,
        flaky: results.testResults.flaky,
        duration: results.testResults.duration,
        passRate: results.testResults.passRate,
        failureRate: results.testResults.failureRate
      },
      metadata: {
        startedAt: results.metadata.startedAt,
        completedAt: results.metadata.completedAt,
        duration: results.metadata.duration,
        ci: results.metadata.ci,
        agent: results.metadata.agent,
        environment: this.config.includeMetadata ? results.metadata.environment : undefined
      }
    };

    // Add detailed test results if requested
    if (this.config.detailLevel !== 'summary') {
      jsonOutput.tests.results = results.testResults.tests.map(t => ({
        testId: t.testId,
        name: t.name,
        status: t.status,
        duration: t.duration,
        error: t.error,
        retryCount: t.retryCount
      }));

      if (results.testResults.suites) {
        jsonOutput.tests.suites = results.testResults.suites;
      }
    }

    // Add coverage data
    if (results.coverage) {
      jsonOutput.coverage = {
        overall: results.coverage.overall,
        lines: results.coverage.lines,
        branches: results.coverage.branches,
        functions: results.coverage.functions,
        statements: results.coverage.statements,
        trend: results.coverage.trend
      };

      // Add file-level coverage for detailed reports
      if (this.config.detailLevel === 'comprehensive' && results.coverage.files) {
        jsonOutput.coverage.files = results.coverage.files;
      }
    }

    // Add quality metrics
    if (results.qualityMetrics) {
      jsonOutput.quality = {
        score: results.qualityMetrics.score,
        grade: results.qualityMetrics.grade,
        codeQuality: results.qualityMetrics.codeQuality,
        gates: {
          passed: results.qualityMetrics.gatesPassed,
          failed: results.qualityMetrics.gatesFailed,
          details: this.config.detailLevel !== 'summary'
            ? results.qualityMetrics.gates
            : undefined
        }
      };
    }

    // Add security data
    if (results.security) {
      jsonOutput.security = {
        total: results.security.total,
        score: results.security.score,
        summary: results.security.summary,
        vulnerabilities: this.config.detailLevel !== 'summary'
          ? results.security.vulnerabilities
          : undefined
      };
    }

    // Add performance data
    if (results.performance) {
      jsonOutput.performance = {
        responseTime: results.performance.responseTime,
        throughput: results.performance.throughput,
        errorRate: results.performance.errorRate,
        resources: results.performance.resources
      };
    }

    // Convert to JSON string
    const content = this.config.prettyPrint
      ? JSON.stringify(jsonOutput, null, 2)
      : JSON.stringify(jsonOutput);

    const generationDuration = Date.now() - startTime;

    return {
      format: 'json',
      content,
      timestamp: new Date().toISOString(),
      size: Buffer.byteLength(content, 'utf8'),
      generationDuration
    };
  }

  /**
   * Generate compact JSON (single line, minimal whitespace)
   */
  reportCompact(results: AggregatedResults): ReporterOutput {
    const originalPrettyPrint = this.config.prettyPrint;
    this.config.prettyPrint = false;
    const output = this.report(results);
    this.config.prettyPrint = originalPrettyPrint;
    return output;
  }

  /**
   * Generate JSON with custom filter
   */
  reportFiltered(
    results: AggregatedResults,
    filter: (key: string, value: any) => boolean
  ): ReporterOutput {
    const startTime = Date.now();
    const output = this.report(results);

    // Parse and re-stringify with filter
    const parsed = JSON.parse(output.content);
    const filtered = this.filterObject(parsed, filter);
    const content = this.config.prettyPrint
      ? JSON.stringify(filtered, null, 2)
      : JSON.stringify(filtered);

    const generationDuration = Date.now() - startTime;

    return {
      format: 'json',
      content,
      timestamp: new Date().toISOString(),
      size: Buffer.byteLength(content, 'utf8'),
      generationDuration
    };
  }

  /**
   * Filter object recursively
   */
  private filterObject(
    obj: any,
    filter: (key: string, value: any) => boolean
  ): any {
    if (Array.isArray(obj)) {
      return obj.map(item => this.filterObject(item, filter));
    }

    if (obj !== null && typeof obj === 'object') {
      const filtered: any = {};
      for (const [key, value] of Object.entries(obj)) {
        if (filter(key, value)) {
          filtered[key] = this.filterObject(value, filter);
        }
      }
      return filtered;
    }

    return obj;
  }

  /**
   * Generate JSON Lines format (for streaming)
   */
  reportJSONLines(results: AggregatedResults): string {
    const output = this.report(results);
    const data = JSON.parse(output.content);

    // Convert to JSON Lines (one JSON object per line)
    const lines: string[] = [];

    // Meta line
    lines.push(JSON.stringify({ type: 'meta', data: data.meta }));

    // Summary line
    lines.push(JSON.stringify({ type: 'summary', data: data.summary }));

    // Tests line
    lines.push(JSON.stringify({ type: 'tests', data: data.tests }));

    // Coverage line
    if (data.coverage) {
      lines.push(JSON.stringify({ type: 'coverage', data: data.coverage }));
    }

    // Quality line
    if (data.quality) {
      lines.push(JSON.stringify({ type: 'quality', data: data.quality }));
    }

    // Security line
    if (data.security) {
      lines.push(JSON.stringify({ type: 'security', data: data.security }));
    }

    // Performance line
    if (data.performance) {
      lines.push(JSON.stringify({ type: 'performance', data: data.performance }));
    }

    return lines.join('\n');
  }

  getFormat(): ReportFormat {
    return 'json';
  }

  validateConfig(config: ReporterConfig): boolean {
    return config.format === 'json';
  }

  /**
   * Create a minimal summary (useful for APIs)
   */
  static createSummary(results: AggregatedResults): object {
    return {
      executionId: results.executionId,
      timestamp: results.timestamp,
      status: results.summary.status,
      deploymentReady: results.summary.deploymentReady,
      tests: {
        total: results.testResults.total,
        passed: results.testResults.passed,
        failed: results.testResults.failed,
        passRate: results.testResults.passRate
      },
      coverage: results.coverage ? results.coverage.overall : null,
      qualityScore: results.qualityMetrics?.score || null,
      securityScore: results.security?.score || null
    };
  }

  /**
   * Parse JSON report back to AggregatedResults
   */
  static parse(jsonContent: string): JSONReportOutput {
    try {
      return JSON.parse(jsonContent);
    } catch (error) {
      throw new Error(`Failed to parse JSON report: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate JSON report structure
   */
  static validate(jsonContent: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    try {
      const data = JSON.parse(jsonContent);

      // Required fields
      if (!data.meta) errors.push('Missing meta section');
      if (!data.summary) errors.push('Missing summary section');
      if (!data.tests) errors.push('Missing tests section');
      if (!data.metadata) errors.push('Missing metadata section');

      // Validate meta
      if (data.meta && !data.meta.executionId) {
        errors.push('Missing meta.executionId');
      }

      // Validate summary
      if (data.summary && !data.summary.status) {
        errors.push('Missing summary.status');
      }

      // Validate tests
      if (data.tests) {
        if (typeof data.tests.total !== 'number') {
          errors.push('tests.total must be a number');
        }
        if (typeof data.tests.passed !== 'number') {
          errors.push('tests.passed must be a number');
        }
      }

      return {
        valid: errors.length === 0,
        errors
      };
    } catch (error) {
      return {
        valid: false,
        errors: [`Invalid JSON: ${error instanceof Error ? error.message : 'Unknown error'}`]
      };
    }
  }
}
