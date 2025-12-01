/**
 * Logging utilities module
 *
 * Formatted console logging with chalk:
 * - Success messages (green)
 * - Warning messages (yellow)
 * - Error messages (red)
 * - Info messages (gray)
 * - Existence messages (gray)
 *
 * @module cli/init/utils/log-utils
 */

import chalk from 'chalk';

/**
 * Log success message with green checkmark
 *
 * @param message - Success message
 * @param prefix - Optional prefix (default: '✓')
 */
export function logSuccess(message: string, prefix: string = '✓'): void {
  console.log(chalk.green(`  ${prefix} ${message}`));
}

/**
 * Log warning message with yellow color
 *
 * @param message - Warning message
 * @param prefix - Optional prefix (default: '⚠️')
 */
export function logWarning(message: string, prefix: string = '⚠️'): void {
  console.log(chalk.yellow(`  ${prefix} ${message}`));
}

/**
 * Log error message with red color
 *
 * @param message - Error message
 * @param prefix - Optional prefix (default: '✗')
 */
export function logError(message: string, prefix: string = '✗'): void {
  console.log(chalk.red(`  ${prefix} ${message}`));
}

/**
 * Log info message with gray color
 *
 * @param message - Info message
 * @param prefix - Optional prefix (default: '•')
 */
export function logInfo(message: string, prefix: string = '•'): void {
  console.log(chalk.gray(`  ${prefix} ${message}`));
}

/**
 * Log message indicating existing resource (gray checkmark)
 *
 * @param message - Message about existing resource
 */
export function logExists(message: string): void {
  console.log(chalk.gray(`  ✓ ${message}`));
}
