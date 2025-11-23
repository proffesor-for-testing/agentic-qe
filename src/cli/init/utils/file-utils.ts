/**
 * File system utilities module
 *
 * Common file system operations for initialization:
 * - Directory creation and validation
 * - File existence checks
 * - Safe JSON and file operations
 * - Directory structure creation
 *
 * @module cli/init/utils/file-utils
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import { logExists, logSuccess } from './log-utils';

/**
 * Ensure directory exists, creating it if necessary
 *
 * @param dirPath - Absolute or relative path to directory
 * @throws Error if directory creation fails
 */
export async function ensureDirectory(dirPath: string): Promise<void> {
  try {
    await fs.ensureDir(dirPath);
  } catch (error) {
    throw new Error(`Failed to create directory ${dirPath}: ${error}`);
  }
}

/**
 * Check if a file exists
 *
 * @param filePath - Path to check
 * @returns True if file exists, false otherwise
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    return await fs.pathExists(filePath);
  } catch {
    return false;
  }
}

/**
 * Check if a directory exists
 *
 * @param dirPath - Path to check
 * @returns True if directory exists, false otherwise
 */
export async function directoryExists(dirPath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(dirPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Write JSON data to file with proper formatting and error handling
 *
 * @param filePath - Path to write JSON file
 * @param data - Data to serialize to JSON
 * @param indent - Number of spaces for indentation (default: 2)
 * @throws Error if write fails
 */
export async function safeWriteJson(
  filePath: string,
  data: any,
  indent: number = 2
): Promise<void> {
  try {
    const jsonContent = JSON.stringify(data, null, indent);
    await fs.writeFile(filePath, jsonContent, 'utf-8');
  } catch (error) {
    throw new Error(`Failed to write JSON to ${filePath}: ${error}`);
  }
}

/**
 * Read and parse JSON file with error handling
 *
 * @param filePath - Path to JSON file
 * @returns Parsed JSON data
 * @throws Error if file doesn't exist or JSON is invalid
 */
export async function safeReadJson<T = any>(filePath: string): Promise<T> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch (error) {
    throw new Error(`Failed to read JSON from ${filePath}: ${error}`);
  }
}

/**
 * Write text file with error handling
 *
 * @param filePath - Path to write file
 * @param content - File content
 * @throws Error if write fails
 */
export async function safeWriteFile(filePath: string, content: string): Promise<void> {
  try {
    await fs.writeFile(filePath, content, 'utf-8');
  } catch (error) {
    throw new Error(`Failed to write file ${filePath}: ${error}`);
  }
}

/**
 * Create a safe directory structure (won't fail if directories exist)
 *
 * @param directories - Array of directory paths to create
 * @param baseDir - Base directory (default: process.cwd())
 * @param force - Force recreation if directory exists
 * @returns Array of created directory paths
 */
export async function createDirectories(
  directories: string[],
  baseDir: string = process.cwd(),
  force: boolean = false
): Promise<string[]> {
  const created: string[] = [];

  for (const dir of directories) {
    const fullPath = path.join(baseDir, dir);

    if (await fileExists(fullPath) && !force) {
      logExists(`Directory exists: ${dir}`);
      continue;
    }

    await ensureDirectory(fullPath);
    logSuccess(`Created: ${dir}`);
    created.push(fullPath);
  }

  return created;
}

/**
 * Format file size in human-readable format
 *
 * @param bytes - Size in bytes
 * @returns Formatted string (e.g., "1.5 KB", "2.3 MB")
 */
export function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
}
