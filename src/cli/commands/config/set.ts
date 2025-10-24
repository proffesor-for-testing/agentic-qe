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

  /**
   * Set nested value (SECURE - Prototype pollution protected)
   *
   * Security Fix (Alert #21): Added guards against prototype pollution
   * Previous vulnerability: Allowed setting __proto__, constructor, prototype
   * New approach: Validates keys and uses Object.defineProperty
   */
  private static setNestedValue(obj: any, path: string, value: any): void {
    const keys = path.split('.');
    let current = obj;

    // Security: Validate all keys in the path
    const dangerousKeys = ['__proto__', 'constructor', 'prototype'];
    for (const key of keys) {
      if (dangerousKeys.includes(key)) {
        throw new Error(
          `Invalid configuration key '${key}': Prototype pollution attempt detected. ` +
          `Keys '__proto__', 'constructor', and 'prototype' are not allowed.`
        );
      }
    }

    // Navigate to the parent object
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];

      // Only create objects if they don't exist
      if (!Object.prototype.hasOwnProperty.call(current, key)) {
        // Use Object.create(null) to avoid prototype chain
        current[key] = Object.create(null);
      }

      current = current[key];

      // Validate we're still working with an object
      if (current === null || typeof current !== 'object') {
        throw new Error(`Cannot set property on non-object at path segment '${key}'`);
      }
    }

    // Set the final value using Object.defineProperty for safety
    const finalKey = keys[keys.length - 1];

    // Additional validation for the final key
    if (typeof finalKey !== 'string' || finalKey.length === 0) {
      throw new Error('Invalid property key: must be a non-empty string');
    }

    // Use Object.defineProperty instead of direct assignment
    Object.defineProperty(current, finalKey, {
      value: value,
      writable: true,
      enumerable: true,
      configurable: true
    });
  }
}

/**
 * Wrapper function for CLI usage
 */
export async function configSet(options: ConfigSetOptions): Promise<void> {
  return ConfigSetCommand.execute(options);
}
