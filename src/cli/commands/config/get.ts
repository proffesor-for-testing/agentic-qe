/**
 * Config Get Command - Get configuration values
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import * as yaml from 'yaml';

export interface ConfigGetOptions {
  key?: string;
  config?: string;
  format?: 'json' | 'yaml' | 'plain';
}

export interface ConfigGetResult {
  value: any;
  formatted?: string;
}

export class ConfigGetCommand {
  private static readonly DEFAULT_CONFIG_PATH = '.agentic-qe/config/aqe.config.json';

  static async execute(options: ConfigGetOptions): Promise<ConfigGetResult> {
    const spinner = ora('Reading configuration...').start();

    try {
      // Determine config file path
      const configPath = options.config || this.DEFAULT_CONFIG_PATH;

      // Check if config exists
      if (!(await fs.pathExists(configPath))) {
        throw new Error(`Configuration file not found: ${configPath}`);
      }

      // Read configuration
      const config = await fs.readJson(configPath);

      // Get value
      let value: any;
      if (options.key) {
        value = this.getNestedValue(config, options.key);
      } else {
        value = config;
      }

      spinner.stop();

      // Format output
      const result: ConfigGetResult = { value };

      if (options.format) {
        result.formatted = this.formatValue(value, options.format);
      }

      // Display value
      if (value === undefined) {
        console.log(chalk.yellow(`\n⚠️  Key not found: ${options.key}\n`));
      } else {
        console.log(chalk.blue('\n📋 Configuration Value:\n'));
        if (result.formatted) {
          console.log(result.formatted);
        } else {
          console.log(this.formatValue(value, 'json'));
        }
      }

      return result;
    } catch (error: any) {
      spinner.fail(chalk.red('Failed to read configuration'));
      throw error;
    }
  }

  private static getNestedValue(obj: any, path: string): any {
    const keys = path.split('.');
    let current = obj;

    for (const key of keys) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = current[key];
    }

    return current;
  }

  private static formatValue(value: any, format: string): string {
    switch (format) {
      case 'json':
        return JSON.stringify(value, null, 2);
      case 'yaml':
        return yaml.stringify(value);
      case 'plain':
        if (typeof value === 'object') {
          return JSON.stringify(value);
        }
        return String(value);
      default:
        return JSON.stringify(value, null, 2);
    }
  }
}

/**
 * Wrapper function for CLI usage
 */
export async function configGet(options: ConfigGetOptions): Promise<ConfigGetResult> {
  return ConfigGetCommand.execute(options);
}
