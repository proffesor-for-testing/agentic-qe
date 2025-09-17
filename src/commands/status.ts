import * as fs from 'fs-extra';
import * as path from 'path';
import { Command } from 'commander';
import chalk from 'chalk';
import { table, getBorderCharacters } from 'table';
import { OperationResult } from '../types/agent';
import { logger } from '../utils/Logger';

export class StatusCommand {
  async execute(): Promise<OperationResult> {
    try {
      console.log(chalk.blue('\n📊 AQE Framework Status\n'));

      const checks = [];

      // Check Claude Code
      const claudeMdPath = path.resolve('CLAUDE.md');
      const hasClaudeMd = await fs.pathExists(claudeMdPath);
      checks.push([
        'Claude Code Config',
        hasClaudeMd ? chalk.green('✓ CLAUDE.md found') : chalk.yellow('⚠ CLAUDE.md not found'),
        hasClaudeMd ? 'Configured' : 'Not configured'
      ]);

      // Check AQE initialization
      const configPath = path.resolve('qe.config.json');
      const hasConfig = await fs.pathExists(configPath);

      if (hasConfig) {
        const config = await fs.readJson(configPath);
        checks.push([
          'AQE Framework',
          chalk.green(`✓ v${config.version}`),
          'Initialized'
        ]);

        // Check agents
        const agentsPath = path.resolve(config.agentsPath || 'agents');
        if (await fs.pathExists(agentsPath)) {
          const agentDirs = await fs.readdir(agentsPath);
          const agentCount = agentDirs.filter(dir => !dir.startsWith('.')).length;
          checks.push([
            'Agents',
            chalk.green(`✓ ${agentCount} agents`),
            'Loaded'
          ]);
        } else {
          checks.push([
            'Agents',
            chalk.red('✗ Directory not found'),
            'Not loaded'
          ]);
        }

        // Check Claude-Flow
        checks.push([
          'Claude-Flow',
          config.claude_flow?.enabled ? chalk.green('✓ Enabled') : chalk.yellow('⚠ Disabled'),
          config.claude_flow?.enabled ? 'Active' : 'Inactive'
        ]);

        // Check .claude directory
        const claudePath = path.resolve('.claude');
        const hasClaudeDir = await fs.pathExists(claudePath);
        checks.push([
          'Claude Integration',
          hasClaudeDir ? chalk.green('✓ Found') : chalk.red('✗ Not found'),
          hasClaudeDir ? 'Configured' : 'Missing'
        ]);
      } else {
        checks.push([
          'AQE Framework',
          chalk.red('✗ Not initialized'),
          'Run: aqe init'
        ]);
      }

      // Check Claude-Flow installation
      try {
        const { exec } = require('child_process');
        const { promisify } = require('util');
        const execAsync = promisify(exec);
        await execAsync('npx claude-flow@alpha --version');
        checks.push([
          'Claude-Flow MCP',
          chalk.green('✓ Installed'),
          'Available'
        ]);
      } catch {
        checks.push([
          'Claude-Flow MCP',
          chalk.red('✗ Not installed'),
          'Run: claude mcp add claude-flow'
        ]);
      }

      // Check Node.js version
      const nodeVersion = process.version;
      const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
      checks.push([
        'Node.js',
        majorVersion >= 18 ? chalk.green(`✓ ${nodeVersion}`) : chalk.red(`✗ ${nodeVersion}`),
        majorVersion >= 18 ? 'Compatible' : 'Upgrade required'
      ]);

      // Create status table
      const tableData = [
        [chalk.bold('Component'), chalk.bold('Status'), chalk.bold('Action')],
        ...checks
      ];

      console.log(table(tableData, {
        border: getBorderCharacters('ramac')
      }));

      // Summary
      const allGood = !checks.some(check => check[1].includes('✗'));
      const hasWarnings = checks.some(check => check[1].includes('⚠'));

      if (allGood && !hasWarnings) {
        console.log(chalk.green('\n✅ All systems operational!\n'));
      } else if (allGood) {
        console.log(chalk.yellow('\n⚠️  System operational with warnings.\n'));
      } else {
        console.log(chalk.red('\n❌ Some components need attention.\n'));
      }

      // Quick start guide if not initialized
      if (!hasConfig) {
        console.log(chalk.cyan('Quick Start:'));
        console.log('  1. Run: aqe init');
        console.log('  2. Run: aqe list');
        console.log('  3. Run: aqe spawn --agents risk-oracle --task "Analyze project"');
        console.log();
      }

      return {
        success: true,
        message: 'Status check complete',
        data: {
          hasClaudeMd,
          hasConfig,
          checks
        }
      };
    } catch (error) {
      logger.error('Status check failed:', error);
      return {
        success: false,
        message: `Status check failed: ${error instanceof Error ? error.message : String(error)}`,
        errors: [error instanceof Error ? error.message : String(error)]
      };
    }
  }

  static register(program: Command): void {
    program
      .command('status')
      .description('Check AQE Framework status and configuration')
      .action(async () => {
        const command = new StatusCommand();
        const result = await command.execute();

        if (!result.success && result.errors) {
          console.error(chalk.red('❌'), result.message);
          result.errors.forEach(error => console.error(chalk.red('  •'), error));
          process.exit(1);
        }
      });
  }
}