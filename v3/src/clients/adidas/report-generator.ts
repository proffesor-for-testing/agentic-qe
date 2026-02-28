/**
 * Adidas TC01 Report Generator
 * Thin wrapper around the generic lifecycle report generator.
 */
import { generateLifecycleReport } from '../../integrations/orchestration/report-generator';
import type { RunResult } from '../../integrations/orchestration/action-types';

export { generateLifecycleReport } from '../../integrations/orchestration/report-generator';
export type { ReportOptions } from '../../integrations/orchestration/report-generator';

/**
 * Generate a TC01-specific HTML report.
 * Convenience wrapper that sets title and filename prefix for Adidas O2C.
 */
export async function generateTC01Report(
  result: RunResult,
  orderId: string,
  outputDir?: string,
): Promise<string> {
  return generateLifecycleReport(result, orderId, {
    title: 'TC_01 Order Lifecycle Report',
    filenamePrefix: 'tc01',
    outputDir,
  });
}
