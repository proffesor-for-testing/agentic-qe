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
import { resolveTemplatePath } from './utils/path-utils';

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
    // 🔧 CENTRALIZED: Use resolveTemplatePath for robust template resolution
    const templatePath = await resolveTemplatePath('aqe.sh', projectRoot);

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
