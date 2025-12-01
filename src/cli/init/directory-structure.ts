/**
 * Directory structure creation module
 *
 * Creates the standardized Agentic QE Fleet directory structure
 *
 * @module cli/init/directory-structure
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import chalk from 'chalk';

/**
 * Create the standard Agentic QE directory structure
 *
 * @param force - Force overwrite existing directories
 */
export async function createDirectoryStructure(force: boolean = false): Promise<void> {
  const baseDir = process.cwd();

  // Define directory structure
  const directories = [
    '.agentic-qe',
    '.agentic-qe/data',
    '.agentic-qe/data/learning',
    '.agentic-qe/data/patterns',
    '.agentic-qe/data/improvement',
    '.agentic-qe/data/memory',
    '.agentic-qe/agents',
    '.agentic-qe/config',
    '.agentic-qe/docs',
    'tests',
    'tests/unit',
    'tests/integration',
    'tests/e2e'
  ];

  // Create each directory
  for (const dir of directories) {
    const fullPath = path.join(baseDir, dir);

    try {
      if (await fs.pathExists(fullPath) && !force) {
        console.log(chalk.gray(`  ✓ Directory exists: ${dir}`));
        continue;
      }

      await fs.ensureDir(fullPath);
      console.log(chalk.green(`  ✓ Created: ${dir}`));
    } catch (error) {
      throw new Error(`Failed to create directory ${dir}: ${error}`);
    }
  }

  // Note: .gitignore is NOT created - users should add .agentic-qe/ entries to their root .gitignore
  // This prevents unwanted files being created in the .agentic-qe directory
}
