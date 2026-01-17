/**
 * Config Reset Command - Reset configuration to defaults
 */

import chalk from 'chalk';
import inquirer from 'inquirer';
import { Config } from '../../../utils/Config.js';

export async function configReset(options: any): Promise<void> {
  if (!options.force) {
    const { confirmed } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmed',
        message: chalk.yellow('⚠️  This will reset all configuration to defaults. Continue?'),
        default: false
      }
    ]);

    if (!confirmed) {
      console.log(chalk.gray('Reset cancelled.'));
      return;
    }
  }

  const defaultConfig: any = {
    fleet: {
      id: 'default-fleet',
      name: 'AQE Fleet',
      maxAgents: 10,
      heartbeatInterval: 30000,
      taskTimeout: 300000,
      topology: 'hierarchical'
    },
    quality: {
      coverageThreshold: 0.8
    }
  };

  await Config.save(defaultConfig, options.file || '.aqe/config.json');
  console.log(chalk.green('✅ Configuration reset to defaults'));
}
