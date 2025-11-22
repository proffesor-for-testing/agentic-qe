/**
 * Utility functions for formatting metrics data
 */

/**
 * Format a number as a percentage
 */
export const formatPercentage = (value: number, decimals: number = 1): string => {
  return `${(value * 100).toFixed(decimals)}%`;
};

/**
 * Format duration in milliseconds to human-readable format
 */
export const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
};

/**
 * Format a timestamp to a readable date/time string
 */
export const formatTimestamp = (timestamp: number): string => {
  const date = new Date(timestamp);
  return date.toLocaleString();
};

/**
 * Format a number with thousand separators
 */
export const formatNumber = (value: number): string => {
  return value.toLocaleString();
};

/**
 * Calculate trend percentage change
 */
export const calculateTrend = (current: number, previous: number): number => {
  if (previous === 0) return 0;
  return ((current - previous) / previous) * 100;
};

/**
 * Get status based on threshold
 */
export const getStatus = (
  value: number,
  thresholds: { success: number; warning: number }
): 'success' | 'warning' | 'error' => {
  if (value >= thresholds.success) return 'success';
  if (value >= thresholds.warning) return 'warning';
  return 'error';
};

/**
 * Get color based on status
 */
export const getStatusColor = (status: 'success' | 'warning' | 'error'): string => {
  const colors = {
    success: 'text-green-600',
    warning: 'text-yellow-600',
    error: 'text-red-600',
  };
  return colors[status];
};

/**
 * Get background color based on status
 */
export const getStatusBgColor = (status: 'success' | 'warning' | 'error'): string => {
  const colors = {
    success: 'bg-green-100',
    warning: 'bg-yellow-100',
    error: 'bg-red-100',
  };
  return colors[status];
};
