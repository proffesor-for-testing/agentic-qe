/**
 * Commands (slash commands) template management
 * Copies AQE slash command templates from package to user project
 */

import chalk from 'chalk';
import * as fs from 'fs-extra';
import * as path from 'path';

export async function copyCommandTemplates(force: boolean = false): Promise<void> {
  console.log(chalk.cyan('  ⚡ Copying AQE slash commands...'));

  // Find package location
  const possiblePaths = [
    path.join(__dirname, '../../../.claude/commands'),
    path.join(process.cwd(), 'node_modules/agentic-qe/.claude/commands'),
    path.join(process.cwd(), '../agentic-qe/.claude/commands')
  ];

  let sourcePath: string | null = null;
  for (const p of possiblePaths) {
    if (await fs.pathExists(p)) {
      sourcePath = p;
      break;
    }
  }

  if (!sourcePath) {
    console.warn(chalk.yellow('  ⚠️  Commands not found - skipping'));
    return;
  }

  const targetPath = path.join(process.cwd(), '.claude/commands');
  await fs.ensureDir(targetPath);

  // Copy all .md files
  const items = await fs.readdir(sourcePath);
  let copied = 0;

  for (const item of items) {
    if (item.endsWith('.md') && item.startsWith('aqe-')) {
      const sourceFile = path.join(sourcePath, item);
      const targetFile = path.join(targetPath, item);

      if (!await fs.pathExists(targetFile) || force) {
        await fs.copy(sourceFile, targetFile);
        copied++;
      }
    }
  }

  console.log(chalk.green(`  ✓ Copied ${copied} AQE commands`));
}
