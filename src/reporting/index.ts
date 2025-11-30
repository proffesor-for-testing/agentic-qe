/**
 * Reporting Module
 *
 * Complete output generation and reporting system for quality check results.
 * Supports multiple output formats and provides result aggregation capabilities.
 *
 * @module reporting
 * @version 1.0.0
 */

// Core types
export * from './types';

// Result aggregation
export { ResultAggregator, AggregatorInput } from './ResultAggregator';

// Reporters
export {
  HumanReadableReporter,
  JSONReporter,
  JSONReportOutput,
  ControlLoopReporter,
  ControlLoopConfig
} from './reporters';

// Re-export commonly used types
export type {
  Reporter,
  ReporterConfig,
  ReportFormat,
  ReporterOutput,
  AggregatedResults,
  ControlLoopFeedback
} from './types';

/**
 * Reporter Factory
 *
 * Creates appropriate reporter based on format
 */
import {
  Reporter,
  ReporterConfig,
  ReportFormat
} from './types';
import { HumanReadableReporter } from './reporters/HumanReadableReporter';
import { JSONReporter } from './reporters/JSONReporter';
import { ControlLoopReporter } from './reporters/ControlLoopReporter';

export class ReporterFactory {
  /**
   * Create reporter by format
   */
  static create(format: ReportFormat, config?: Partial<ReporterConfig>): Reporter {
    const fullConfig: ReporterConfig = {
      format,
      detailLevel: config?.detailLevel || 'detailed',
      useColors: config?.useColors,
      includeTimestamps: config?.includeTimestamps,
      includeMetadata: config?.includeMetadata,
      outputPath: config?.outputPath,
      prettyPrint: config?.prettyPrint
    };

    switch (format) {
      case 'human':
        return new HumanReadableReporter(fullConfig);

      case 'json':
        return new JSONReporter(fullConfig);

      case 'control-loop':
        return new ControlLoopReporter(fullConfig);

      case 'html':
      case 'markdown':
        throw new Error(`Reporter format '${format}' is not yet implemented`);

      default:
        throw new Error(`Unknown reporter format: ${format}`);
    }
  }

  /**
   * Create all reporters
   */
  static createAll(config?: Partial<ReporterConfig>): Map<ReportFormat, Reporter> {
    const reporters = new Map<ReportFormat, Reporter>();

    reporters.set('human', this.create('human', config));
    reporters.set('json', this.create('json', config));
    reporters.set('control-loop', this.create('control-loop', config));

    return reporters;
  }

  /**
   * Get available formats
   */
  static getAvailableFormats(): ReportFormat[] {
    return ['human', 'json', 'control-loop'];
  }

  /**
   * Validate format
   */
  static isValidFormat(format: string): format is ReportFormat {
    return this.getAvailableFormats().includes(format as ReportFormat);
  }
}

/**
 * Convenience function to generate reports in all formats
 */
import { AggregatedResults, ReporterOutput } from './types';

export async function generateAllReports(
  results: AggregatedResults,
  config?: Partial<ReporterConfig>
): Promise<Map<ReportFormat, ReporterOutput>> {
  const reporters = ReporterFactory.createAll(config);
  const outputs = new Map<ReportFormat, ReporterOutput>();

  for (const [format, reporter] of reporters) {
    const output = reporter.report(results);
    const resolvedOutput = output instanceof Promise ? await output : output;
    outputs.set(format, resolvedOutput);
  }

  return outputs;
}

/**
 * Convenience function to write reports to files
 */
import * as fs from 'fs-extra';
import * as path from 'path';

export async function writeReports(
  results: AggregatedResults,
  outputDir: string,
  config?: Partial<ReporterConfig>
): Promise<Map<ReportFormat, string>> {
  await fs.ensureDir(outputDir);

  const outputs = await generateAllReports(results, config);
  const filePaths = new Map<ReportFormat, string>();

  for (const [format, reportOutput] of outputs) {
    const extension = format === 'human' ? 'txt' : format === 'control-loop' ? 'json' : format;
    const fileName = `quality-report-${results.executionId}.${extension}`;
    const filePath = path.join(outputDir, fileName);

    await fs.writeFile(filePath, reportOutput.content, 'utf8');
    filePaths.set(format, filePath);
  }

  return filePaths;
}

/**
 * Quick report generation helper
 */
export async function quickReport(results: AggregatedResults, format: ReportFormat = 'human'): Promise<string> {
  const reporter = ReporterFactory.create(format);
  const output = reporter.report(results);
  const resolvedOutput = output instanceof Promise ? await output : output;
  return resolvedOutput.content;
}
