/**
 * Agentic QE v3 - Completions Command
 *
 * Generate shell completions for aqe.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import {
  generateCompletion,
  detectShell,
  getInstallInstructions,
  DOMAINS as COMPLETION_DOMAINS,
  QE_AGENTS,
  OTHER_AGENTS,
} from '../completions/index.js';

export function createCompletionsCommand(
  cleanupAndExit: (code: number) => Promise<never>
): Command {
  const completionsCmd = new Command('completions')
    .description('Generate shell completions for aqe');

  completionsCmd
    .command('bash')
    .description('Generate Bash completion script')
    .action(() => {
      console.log(generateCompletion('bash'));
    });

  completionsCmd
    .command('zsh')
    .description('Generate Zsh completion script')
    .action(() => {
      console.log(generateCompletion('zsh'));
    });

  completionsCmd
    .command('fish')
    .description('Generate Fish completion script')
    .action(() => {
      console.log(generateCompletion('fish'));
    });

  completionsCmd
    .command('powershell')
    .description('Generate PowerShell completion script')
    .action(() => {
      console.log(generateCompletion('powershell'));
    });

  completionsCmd
    .command('install')
    .description('Auto-install completions for current shell')
    .option('-s, --shell <shell>', 'Target shell (bash|zsh|fish|powershell)')
    .action(async (options) => {
      const fs = await import('fs');
      const path = await import('path');

      const shellInfo = options.shell
        ? { name: options.shell as 'bash' | 'zsh' | 'fish' | 'powershell', configFile: null, detected: false }
        : detectShell();

      if (shellInfo.name === 'unknown') {
        console.log(chalk.red('Could not detect shell. Please specify with --shell option.\n'));
        console.log(getInstallInstructions('unknown'));
        await cleanupAndExit(1);
        return;
      }

      console.log(chalk.blue(`\nInstalling completions for ${shellInfo.name}...\n`));

      const script = generateCompletion(shellInfo.name);

      // For Fish, write directly to completions directory
      if (shellInfo.name === 'fish') {
        const homeDir = process.env.HOME || process.env.USERPROFILE || '';
        const fishCompletionsDir = path.join(homeDir, '.config', 'fish', 'completions');
        try {
          fs.mkdirSync(fishCompletionsDir, { recursive: true });
          const completionFile = path.join(fishCompletionsDir, 'aqe.fish');
          fs.writeFileSync(completionFile, script);
          console.log(chalk.green(`Completions installed to: ${completionFile}`));
          console.log(chalk.gray('\nRestart your shell or run: source ~/.config/fish/completions/aqe.fish\n'));
        } catch (err) {
          console.log(chalk.red(`Failed to install: ${err}`));
          console.log(chalk.yellow('\nManual installation:'));
          console.log(getInstallInstructions('fish'));
        }
      } else {
        // For other shells, show instructions
        console.log(chalk.yellow('To install completions, follow these instructions:\n'));
        console.log(getInstallInstructions(shellInfo.name));
        console.log(chalk.gray('\n---\nCompletion script:\n'));
        console.log(script);
      }
    });

  completionsCmd
    .command('list')
    .description('List all completion values (domains, agents, etc.)')
    .option('-t, --type <type>', 'Type to list (domains|agents|v3-qe-agents)', 'all')
    .action((options) => {
      if (options.type === 'domains' || options.type === 'all') {
        console.log(chalk.blue('\n12 DDD Domains:'));
        COMPLETION_DOMAINS.forEach(d => console.log(chalk.gray(`  ${d}`)));
      }

      if (options.type === 'v3-qe-agents' || options.type === 'all') {
        console.log(chalk.blue('\nQE Agents (' + QE_AGENTS.length + '):'));
        QE_AGENTS.forEach(a => console.log(chalk.gray(`  ${a}`)));
      }

      if (options.type === 'agents' || options.type === 'all') {
        console.log(chalk.blue('\nOther Agents (' + OTHER_AGENTS.length + '):'));
        OTHER_AGENTS.forEach(a => console.log(chalk.gray(`  ${a}`)));
      }

      console.log('');
    });

  return completionsCmd;
}
