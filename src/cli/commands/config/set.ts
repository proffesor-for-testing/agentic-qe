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
   * Security Fix (Alert #21, #25): Added guards against prototype pollution
   * Previous vulnerability: Allowed setting __proto__, constructor, prototype
   * New approach: Validates keys and uses Object.defineProperty
   *
   * CodeQL Alert #25 Remediation:
   * This function implements comprehensive prototype pollution protection:
   * 1. Validates all keys against dangerous names (__proto__, constructor, prototype)
   * 2. Only processes own properties (hasOwnProperty checks)
   * 3. Validates that traversed objects are not built-in prototypes
   * 4. Uses Object.defineProperty for final assignment
   * 5. Creates new objects with Object.create(null) to avoid prototype chain
   */
  // codeql [js/prototype-pollution-utility] - Safe: Multiple layers of protection implemented
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

      // Security: Additional check - only process own properties
      if (!Object.prototype.hasOwnProperty.call(current, key)) {
        // Use Object.create(null) to avoid prototype chain
        current[key] = Object.create(null);
      }

      // lgtm[js/prototype-pollution-utility]
      // Safe: All keys validated against dangerous names above (line 121-129)
      // Using Object.create(null) and explicit hasOwnProperty checks
      const nextValue = current[key];

      // Validate we're still working with an object
      if (nextValue === null || typeof nextValue !== 'object') {
        throw new Error(`Cannot set property on non-object at path segment '${key}'`);
      }

      // Security: Ensure nextValue is not a built-in prototype before recursion
      if (nextValue === Object.prototype || nextValue === Array.prototype || nextValue === Function.prototype) {
        throw new Error(`Cannot traverse into built-in prototypes at key '${key}'`);
      }

      // Security: Ensure nextValue is not a constructor's prototype
      if (nextValue.constructor && nextValue === nextValue.constructor.prototype) {
        throw new Error(`Cannot traverse into constructor prototypes at key '${key}'`);
      }

      // Only recurse if this is an own property of the destination object
      if (Object.prototype.hasOwnProperty.call(current, key)) {
        current = nextValue;
      } else {
        throw new Error(`Cannot set property on inherited path segment '${key}'`);
      }
    }

    // Set the final value using Object.defineProperty for safety
    const finalKey = keys[keys.length - 1];

    // Additional validation for the final key
    if (typeof finalKey !== 'string' || finalKey.length === 0) {
      throw new Error('Invalid property key: must be a non-empty string');
    }

    // Security Fix (Alert #25): Additional guard against prototype pollution
    // Ensure current is a safe object and not Object.prototype or similar
    if (current === Object.prototype || current === Array.prototype || current === Function.prototype) {
      throw new Error('Cannot modify built-in prototypes');
    }

    // Additional check: Ensure we're not modifying a constructor's prototype
    if (current.constructor && current === current.constructor.prototype) {
      throw new Error('Cannot modify constructor prototypes');
    }

    // Use Object.defineProperty instead of direct assignment
    // All dangerous keys have been validated at the beginning of the function
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
