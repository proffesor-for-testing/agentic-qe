import { MetricsData, ExportOptions } from '../types/metrics';

/**
 * Export metrics data to CSV format
 */
export const exportToCSV = (data: MetricsData[], filename: string = 'metrics.csv'): void => {
  if (data.length === 0) {
    console.warn('No data to export');
    return;
  }

  // Create CSV headers
  const headers = [
    'Timestamp',
    'Line Coverage',
    'Branch Coverage',
    'Function Coverage',
    'Tests Passed',
    'Tests Failed',
    'Tests Skipped',
    'Coverage %',
    'Flaky Test Rate',
    'Performance Score',
  ];

  // Create CSV rows
  const rows = data.map((item) => [
    new Date(item.timestamp).toISOString(),
    item.coverage.line,
    item.coverage.branch,
    item.coverage.function,
    item.testResults.passed,
    item.testResults.failed,
    item.testResults.skipped,
    item.qualityGates.coveragePercent,
    item.qualityGates.flakyTestRate,
    item.qualityGates.performanceScore,
  ]);

  // Combine headers and rows
  const csvContent = [headers, ...rows]
    .map((row) => row.join(','))
    .join('\n');

  // Create and trigger download
  downloadFile(csvContent, filename, 'text/csv');
};

/**
 * Export metrics data to JSON format
 */
export const exportToJSON = (data: MetricsData[], filename: string = 'metrics.json'): void => {
  if (data.length === 0) {
    console.warn('No data to export');
    return;
  }

  const jsonContent = JSON.stringify(data, null, 2);
  downloadFile(jsonContent, filename, 'application/json');
};

/**
 * Generic export function that handles both formats
 */
export const exportData = (options: ExportOptions): void => {
  const filename = options.filename || `metrics-${Date.now()}`;

  switch (options.format) {
    case 'csv':
      exportToCSV(options.data, `${filename}.csv`);
      break;
    case 'json':
      exportToJSON(options.data, `${filename}.json`);
      break;
    default:
      console.error(`Unknown export format: ${options.format}`);
  }
};

/**
 * Helper function to trigger file download
 */
const downloadFile = (content: string, filename: string, mimeType: string): void => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
