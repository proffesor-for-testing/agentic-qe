/**
 * Path utilities module
 *
 * Path handling for Agentic QE Fleet directories:
 * - Base directory (.agentic-qe)
 * - Data directory (databases)
 * - Config directory
 * - Agents directory
 * - Docs directory
 * - Template resolution (centralized)
 * - Relative path conversion
 *
 * @module cli/init/utils/path-utils
 */

import * as path from 'path';
import * as fs from 'fs-extra';

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

/**
 * Get the package root directory (where package.json lives)
 *
 * Searches upward from __dirname until package.json is found.
 * Handles both development and installed package scenarios.
 *
 * @returns Absolute path to package root directory
 * @throws Error if package.json cannot be found
 */
export function getPackageRoot(): string {
  let currentDir = __dirname;
  const maxDepth = 10; // Safety limit to prevent infinite loops
  let depth = 0;

  while (depth < maxDepth) {
    const packageJsonPath = path.join(currentDir, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      // Verify it's our package by checking name
      try {
        const pkg = require(packageJsonPath);
        if (pkg.name === 'agentic-qe' || pkg.name === '@agentic-qe/core') {
          return currentDir;
        }
      } catch {
        // Not a valid package.json, keep searching
      }
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      // Reached filesystem root
      break;
    }
    currentDir = parentDir;
    depth++;
  }

  throw new Error('Could not find agentic-qe package root (package.json not found)');
}

/**
 * Resolve template file path with centralized fallback logic
 *
 * Searches for templates in this order:
 * 1. Project root templates/ directory (for user customization)
 * 2. Package root templates/ directory (development)
 * 3. node_modules/agentic-qe/templates/ (installed package)
 *
 * @param templateFileName - Template file name (e.g., 'aqe.sh')
 * @param projectRoot - Project root directory (default: process.cwd())
 * @returns Absolute path to template file
 * @throws Error if template not found in any location
 */
export async function resolveTemplatePath(
  templateFileName: string,
  projectRoot: string = process.cwd()
): Promise<string> {
  const searchPaths = [
    // 1. Project root templates/ (user customization)
    path.join(projectRoot, 'templates', templateFileName),

    // 2. Package root templates/ (development)
    path.join(getPackageRoot(), 'templates', templateFileName),

    // 3. node_modules/agentic-qe/templates/ (installed package)
    path.join(projectRoot, 'node_modules', 'agentic-qe', 'templates', templateFileName),

    // 4. Parent node_modules (monorepo scenario)
    path.join(projectRoot, '..', 'node_modules', 'agentic-qe', 'templates', templateFileName),
  ];

  // Try each path in order
  for (const templatePath of searchPaths) {
    if (await fs.pathExists(templatePath)) {
      return templatePath;
    }
  }

  // Template not found anywhere
  throw new Error(
    `Template file '${templateFileName}' not found. Searched:\n${searchPaths.map(p => `  - ${p}`).join('\n')}`
  );
}

/**
 * Synchronous version of resolveTemplatePath for use in non-async contexts
 *
 * @param templateFileName - Template file name
 * @param projectRoot - Project root directory (default: process.cwd())
 * @returns Absolute path to template file
 * @throws Error if template not found
 */
export function resolveTemplatePathSync(
  templateFileName: string,
  projectRoot: string = process.cwd()
): string {
  const searchPaths = [
    path.join(projectRoot, 'templates', templateFileName),
    path.join(getPackageRoot(), 'templates', templateFileName),
    path.join(projectRoot, 'node_modules', 'agentic-qe', 'templates', templateFileName),
    path.join(projectRoot, '..', 'node_modules', 'agentic-qe', 'templates', templateFileName),
  ];

  for (const templatePath of searchPaths) {
    if (fs.existsSync(templatePath)) {
      return templatePath;
    }
  }

  throw new Error(
    `Template file '${templateFileName}' not found. Searched:\n${searchPaths.map(p => `  - ${p}`).join('\n')}`
  );
}
