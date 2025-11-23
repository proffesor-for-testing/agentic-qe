/**
 * CLAUDE.md generation module
 *
 * Creates project-specific CLAUDE.md with AQE Fleet configuration
 *
 * @module cli/init/claude-md
 */

import chalk from 'chalk';
import * as fs from 'fs-extra';
import * as path from 'path';
import inquirer from 'inquirer';
import { FleetConfig } from '../../types';
import { generateCondensedClaudeMd } from '../commands/init-claude-md-template';

// Import version from package.json
const packageJson = require('../../../package.json');
const PACKAGE_VERSION = packageJson.version;

/**
 * Create CLAUDE.md file in project root
 *
 * Generates a condensed CLAUDE.md with AQE Fleet instructions.
 * Handles existing CLAUDE.md by backing up and asking user preference.
 *
 * @param config - Fleet configuration
 * @param isYesMode - Skip interactive prompts
 */
export async function createClaudeMd(config: FleetConfig, isYesMode: boolean = false): Promise<void> {
  console.log(chalk.gray('  • Creating CLAUDE.md configuration'));

  const claudeMdPath = path.join(process.cwd(), 'CLAUDE.md');
  const agentCount = await countAgentFiles('.claude/agents');

  // Check if CLAUDE.md exists
  const exists = await fs.pathExists(claudeMdPath);
  let existingContent = '';
  let appendPosition = 'append'; // default for --yes mode

  if (exists) {
    // Backup existing CLAUDE.md
    const backupPath = path.join(process.cwd(), 'CLAUDE.md.backup');
    await fs.copy(claudeMdPath, backupPath);
    console.log(chalk.yellow(`  ℹ️  Existing CLAUDE.md backed up to ${backupPath}`));

    // Read existing content
    existingContent = await fs.readFile(claudeMdPath, 'utf8');

    // In interactive mode, ask where to add AQE instructions
    if (!isYesMode) {
      const { position } = await inquirer.prompt([
        {
          type: 'list',
          name: 'position',
          message: 'Existing CLAUDE.md detected. Where should we add AQE instructions?',
          choices: [
            {
              name: 'At the end (append) - Recommended',
              value: 'append',
            },
            {
              name: 'At the beginning (prepend)',
              value: 'prepend',
            },
          ],
          default: 'append',
        },
      ]);
      appendPosition = position;
    }
  }

  // Generate condensed CLAUDE.md using template
  const claudeMdContent = generateCondensedClaudeMd({
    agentCount,
    topology: config.topology,
    maxAgents: config.maxAgents,
    testingFocus: config.testingFocus,
    environments: config.environments,
    frameworks: config.frameworks,
    routing: config.routing,
    streaming: config.streaming,
  }, PACKAGE_VERSION);

  // Combine with existing content if present
  let finalContent: string;
  if (exists && existingContent) {
    const separator = '\n\n---\n\n';
    if (appendPosition === 'prepend') {
      finalContent = claudeMdContent + separator + existingContent;
      console.log(chalk.gray('    AQE instructions prepended to existing CLAUDE.md'));
    } else {
      finalContent = existingContent + separator + claudeMdContent;
      console.log(chalk.gray('    AQE instructions appended to existing CLAUDE.md'));
    }
  } else {
    finalContent = claudeMdContent;
  }

  // Write CLAUDE.md
  await fs.writeFile(claudeMdPath, finalContent, 'utf8');

  console.log(chalk.green('  ✓ CLAUDE.md created'));
  console.log(chalk.gray(`    Fleet: ${config.topology} topology, ${config.maxAgents} max agents`));
}

/**
 * Count agent files in .claude/agents directory
 *
 * @param agentsDir - Path to agents directory
 * @returns Number of .md files found
 */
async function countAgentFiles(agentsDir: string): Promise<number> {
  const agentsPath = path.join(process.cwd(), agentsDir);

  if (!await fs.pathExists(agentsPath)) {
    return 0;
  }

  try {
    const files = await fs.readdir(agentsPath);
    return files.filter(f => f.endsWith('.md')).length;
  } catch {
    return 0;
  }
}
