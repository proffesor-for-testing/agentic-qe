/**
 * Path utilities module
 *
 * Path handling for Agentic QE Fleet directories:
 * - Base directory (.agentic-qe)
 * - Data directory (databases)
 * - Config directory
 * - Agents directory
 * - Docs directory
 * - Relative path conversion
 *
 * @module cli/init/utils/path-utils
 */

import * as path from 'path';

/**
 * Get the base directory for Agentic QE Fleet (.agentic-qe)
 *
 * @param cwd - Current working directory (default: process.cwd())
 * @returns Absolute path to .agentic-qe directory
 */
export function getBaseDir(cwd: string = process.cwd()): string {
  return path.join(cwd, '.agentic-qe');
}

/**
 * Get the data directory for databases
 *
 * @param cwd - Current working directory (default: process.cwd())
 * @returns Absolute path to .agentic-qe/data directory
 */
export function getDataDir(cwd: string = process.cwd()): string {
  return path.join(getBaseDir(cwd), 'data');
}

/**
 * Get the config directory
 *
 * @param cwd - Current working directory (default: process.cwd())
 * @returns Absolute path to .agentic-qe/config directory
 */
export function getConfigDir(cwd: string = process.cwd()): string {
  return path.join(getBaseDir(cwd), 'config');
}

/**
 * Get the agents directory
 *
 * @param cwd - Current working directory (default: process.cwd())
 * @returns Absolute path to .agentic-qe/agents directory
 */
export function getAgentsDir(cwd: string = process.cwd()): string {
  return path.join(getBaseDir(cwd), 'agents');
}

/**
 * Get the docs directory
 *
 * @param cwd - Current working directory (default: process.cwd())
 * @returns Absolute path to .agentic-qe/docs directory
 */
export function getDocsDir(cwd: string = process.cwd()): string {
  return path.join(getBaseDir(cwd), 'docs');
}

/**
 * Get relative path from base directory
 *
 * @param fullPath - Absolute path
 * @param baseDir - Base directory (default: process.cwd())
 * @returns Relative path from base directory
 */
export function getRelativePath(fullPath: string, baseDir: string = process.cwd()): string {
  return path.relative(baseDir, fullPath);
}
