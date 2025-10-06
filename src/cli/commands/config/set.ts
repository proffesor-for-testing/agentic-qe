/**
 * Config Set Command - Set configuration values
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import Ajv from 'ajv';
import { AQEConfigSchema } from './schema';

export interface ConfigSetOptions {
  key: string;
  value: string;
  config?: string;
}

export class ConfigSetCommand {
  private static readonly DEFAULT_CONFIG_PATH = '.agentic-qe/config/aqe.config.json';

  static async execute(options: ConfigSetOptions): Promise<void> {
    const spinner = ora('Setting configuration value...').start();

    try {
      // Validate inputs
      if (!options.key || options.key.trim() === '') {
        throw new Error('Invalid key: key cannot be empty');
      }

      // Determine config file path
      const configPath = options.config || this.DEFAULT_CONFIG_PATH;

      // Check if config exists
      if (!(await fs.pathExists(configPath))) {
        throw new Error(`Configuration file not found: ${configPath}`);
      }

      // Read current configuration
      const config = await fs.readJson(configPath);

      // Parse and set the value
      const parsedValue = this.parseValue(options.value);
      this.setNestedValue(config, options.key, parsedValue);

      // Validate updated configuration
      const ajv = new Ajv({ allErrors: true, strictTypes: false });
      const validate = ajv.compile(AQEConfigSchema);
      const valid = validate(config);

      if (!valid) {
        const errors = validate.errors
          ?.map((err) => `${err.instancePath}: ${err.message}`)
          .join(', ');
        throw new Error(
          `Configuration validation failed after setting value: ${errors}`
        );
      }

      // Write updated configuration
      await fs.writeJson(configPath, config, { spaces: 2 });

      spinner.succeed(chalk.green('Configuration value set successfully!'));

      console.log(chalk.blue('\n📝 Updated Configuration:'));
      console.log(chalk.gray(`  Key: ${options.key}`));
      console.log(
        chalk.gray(`  Value: ${JSON.stringify(parsedValue, null, 2)}`)
      );

      console.log(chalk.yellow('\n💡 Tip:'));
      console.log(
        chalk.gray('  Verify the change: aqe config get --key ' + options.key)
      );
    } catch (error: any) {
      spinner.fail(chalk.red('Failed to set configuration value'));
      throw error;
    }
  }

  private static parseValue(value: string): any {
    // Try to parse as JSON first
    try {
      return JSON.parse(value);
    } catch {
      // Not JSON, continue with other parsers
    }

    // Try to parse as number
    if (/^-?\d+(\.\d+)?$/.test(value)) {
      const num = Number(value);
      if (!isNaN(num)) {
        return num;
      }
    }

    // Try to parse as boolean
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;

    // Try to parse as array (comma-separated)
    if (value.includes(',')) {
      return value.split(',').map((v) => v.trim());
    }

    // Return as string
    return value;
  }

  private static setNestedValue(obj: any, path: string, value: any): void {
    const keys = path.split('.');
    let current = obj;

    // Navigate to the parent object
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!(key in current)) {
        current[key] = {};
      }
      current = current[key];
    }

    // Set the final value
    const finalKey = keys[keys.length - 1];
    current[finalKey] = value;
  }
}

/**
 * Wrapper function for CLI usage
 */
export async function configSet(options: ConfigSetOptions): Promise<void> {
  return ConfigSetCommand.execute(options);
}
