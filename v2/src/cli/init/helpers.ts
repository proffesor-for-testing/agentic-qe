/**
 * Helper scripts template management
 * Copies AQE helper scripts from package to user project
 */

import chalk from 'chalk';
import * as fs from 'fs-extra';
import * as path from 'path';

export async function copyHelperScripts(force: boolean = false): Promise<void> {
  console.log(chalk.cyan('  🔧 Copying AQE helper scripts...'));

  // Find package location
  const possiblePaths = [
    path.join(__dirname, '../../../.claude/helpers'),
    path.join(process.cwd(), 'node_modules/agentic-qe/.claude/helpers'),
    path.join(process.cwd(), '../agentic-qe/.claude/helpers')
  ];

  let sourcePath: string | null = null;
  for (const p of possiblePaths) {
    if (await fs.pathExists(p)) {
      sourcePath = p;
      break;
    }
  }

  if (!sourcePath) {
    console.warn(chalk.yellow('  ⚠️  Helper scripts not found - skipping'));
    return;
  }

  const targetPath = path.join(process.cwd(), '.claude/helpers');
  await fs.ensureDir(targetPath);

  // Copy all files from helpers directory
  const items = await fs.readdir(sourcePath);
  let copied = 0;

  for (const item of items) {
    // Skip hidden files and README
    if (item.startsWith('.') || item === 'README.md') {
      continue;
    }

    const sourceFile = path.join(sourcePath, item);
    const targetFile = path.join(targetPath, item);

    // Check if it's a file (not directory)
    const stats = await fs.stat(sourceFile);
    if (!stats.isFile()) {
      continue;
    }

    if (!await fs.pathExists(targetFile) || force) {
      await fs.copy(sourceFile, targetFile);

      // Make scripts executable if they have .sh extension
      if (item.endsWith('.sh')) {
        await fs.chmod(targetFile, 0o755);
      }

      copied++;
    }
  }

  console.log(chalk.green(`  ✓ Copied ${copied} helper scripts`));
}

/**
 * Copy hook scripts to user project
 * These scripts are called by Claude Code hooks for learning capture
 */
export async function copyHookScripts(force: boolean = false): Promise<void> {
  console.log(chalk.cyan('  🪝 Copying hook scripts...'));

  // Find package location
  const possiblePaths = [
    path.join(__dirname, '../../../scripts/hooks'),
    path.join(process.cwd(), 'node_modules/agentic-qe/scripts/hooks'),
    path.join(process.cwd(), '../agentic-qe/scripts/hooks')
  ];

  let sourcePath: string | null = null;
  for (const p of possiblePaths) {
    if (await fs.pathExists(p)) {
      sourcePath = p;
      break;
    }
  }

  if (!sourcePath) {
    console.warn(chalk.yellow('  ⚠️  Hook scripts not found - skipping'));
    return;
  }

  const targetPath = path.join(process.cwd(), 'scripts/hooks');
  await fs.ensureDir(targetPath);

  // Copy all hook scripts
  const items = await fs.readdir(sourcePath);
  let copied = 0;

  for (const item of items) {
    // Skip hidden files
    if (item.startsWith('.')) {
      continue;
    }

    const sourceFile = path.join(sourcePath, item);
    const targetFile = path.join(targetPath, item);

    // Check if it's a file
    const stats = await fs.stat(sourceFile);
    if (!stats.isFile()) {
      continue;
    }

    if (!await fs.pathExists(targetFile) || force) {
      await fs.copy(sourceFile, targetFile);

      // Make scripts executable
      if (item.endsWith('.sh') || item.endsWith('.js')) {
        await fs.chmod(targetFile, 0o755);
      }

      copied++;
    }
  }

  console.log(chalk.green(`  ✓ Copied ${copied} hook scripts`));
  console.log(chalk.gray('    • capture-task-learning.js: Auto-captures agent learnings'));
  console.log(chalk.gray('    • emit-task-spawn/complete.sh: Visualization events'));
}
