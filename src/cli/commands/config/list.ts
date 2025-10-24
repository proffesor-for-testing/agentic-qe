/**
 * Config List Command - List all configuration values
 */

import chalk from 'chalk';
import { Config } from '../../../utils/Config.js';
import { ProcessExit } from '../../../utils/ProcessExit';

export async function configList(options: any): Promise<void> {
  try {
    const config = await Config.load(options.file || '.aqe/config.json');

    if (options.json) {
      console.log(JSON.stringify(config, null, 2));
      return;
    }

    console.log(chalk.blue('📋 AQE Configuration:'));
    printConfig(config, '');

  } catch (error) {
    console.error(chalk.red('❌ Failed to list config:'), error);
    ProcessExit.exitIfNotTest(1);
  }
}

function printConfig(obj: any, prefix: string): void {
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      console.log(chalk.cyan(`${fullKey}:`));
      printConfig(value, fullKey);
    } else {
      console.log(chalk.cyan(`  ${fullKey}:`), chalk.white(JSON.stringify(value)));
    }
  }
}
