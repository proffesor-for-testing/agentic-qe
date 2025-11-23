/**
 * Bash wrapper creation module
 *
 * Creates the aqe command wrapper for convenient CLI access
 *
 * @module cli/init/bash-wrapper
 */

import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';

/**
 * Create aqe command wrapper
 *
 * Creates a bash wrapper script that allows running `aqe <command>` instead of `npx aqe <command>`
 */
export async function createBashWrapper(): Promise<void> {
  console.log(chalk.gray('  • Creating aqe command wrapper'));

  const projectRoot = process.cwd();
  const wrapperPath = path.join(projectRoot, 'aqe');

  // Skip if wrapper already exists
  if (await fs.pathExists(wrapperPath)) {
    console.log(chalk.gray('  ℹ aqe wrapper already exists, skipping'));
    return;
  }

  try {
    // Find the template file
    // Check relative to project root first (for installed package)
    let templatePath = path.join(projectRoot, 'templates', 'aqe.sh');

    // If not found, check relative to this file (for development)
    if (!await fs.pathExists(templatePath)) {
      templatePath = path.join(__dirname, '../../../templates/aqe.sh');
    }

    // If still not found, check node_modules
    if (!await fs.pathExists(templatePath)) {
      templatePath = path.join(projectRoot, 'node_modules', 'agentic-qe', 'templates', 'aqe.sh');
    }

    // Verify template exists
    if (!await fs.pathExists(templatePath)) {
      throw new Error(`Template not found at any expected location. Searched: templates/aqe.sh, ${templatePath}`);
    }

    // Copy template to project root as 'aqe' (no extension)
    await fs.copy(templatePath, wrapperPath);

    // Set executable permissions (chmod +x)
    await fs.chmod(wrapperPath, 0o755);

    console.log(chalk.green('  ✓ Command wrapper created'));
    console.log(chalk.gray(`    Run ${chalk.cyan('./aqe <command>')} or add to PATH`));
  } catch (error) {
    console.error(chalk.yellow(`  ⚠ Failed to create wrapper: ${error instanceof Error ? error.message : String(error)}`));
    console.log(chalk.gray('    You can still use npx aqe <command>'));
  }
}
