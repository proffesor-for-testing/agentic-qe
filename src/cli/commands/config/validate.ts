/**
 * Config Validate Command - Validate configuration against JSON schema
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { AQEConfigSchema } from './schema';

export interface ConfigValidateOptions {
  config?: string;
  detailed?: boolean;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings?: string[];
  schema?: any;
}

export class ConfigValidateCommand {
  private static readonly DEFAULT_CONFIG_PATH = '.agentic-qe/config/aqe.config.json';

  static async execute(
    options: ConfigValidateOptions
  ): Promise<ValidationResult> {
    const spinner = ora('Validating configuration...').start();

    try {
      // Determine config file path
      const configPath = options.config || this.DEFAULT_CONFIG_PATH;

      // Check if config exists
      if (!(await fs.pathExists(configPath))) {
        throw new Error(`Configuration file not found: ${configPath}`);
      }

      // Read configuration
      const config = await fs.readJson(configPath);

      // Initialize AJV with strict mode
      const ajv = new Ajv({
        allErrors: true,
        verbose: true,
        strict: true,
        strictTypes: false // Allow union types
      });
      addFormats(ajv);

      // Compile schema
      const validate = ajv.compile(AQEConfigSchema);

      // Validate configuration
      const valid = validate(config);

      const result: ValidationResult = {
        valid,
        errors: [],
        warnings: []
      };

      if (!valid && validate.errors) {
        result.errors = validate.errors.map((err) => {
          const path = err.instancePath || err.schemaPath;
          const message = err.message || 'Unknown error';
          return `${path}: ${message}`;
        });
      }

      // Perform additional validation checks
      if (valid) {
        const warnings = this.performAdditionalChecks(config);
        result.warnings = warnings;
      }

      // Include schema in detailed mode
      if (options.detailed) {
        result.schema = AQEConfigSchema;
      }

      spinner.stop();

      // Display results
      if (result.valid) {
        console.log(chalk.green('\n✅ Configuration is valid!\n'));

        if (result.warnings && result.warnings.length > 0) {
          console.log(chalk.yellow('⚠️  Warnings:'));
          result.warnings.forEach((warning) => {
            console.log(chalk.yellow(`  • ${warning}`));
          });
        }

        console.log(chalk.blue('\n📊 Configuration Summary:'));
        console.log(chalk.gray(`  Version: ${config.version}`));
        console.log(chalk.gray(`  Topology: ${config.fleet.topology}`));
        console.log(chalk.gray(`  Max Agents: ${config.fleet.maxAgents}`));
        if (config.fleet.testingFocus) {
          console.log(
            chalk.gray(`  Testing Focus: ${config.fleet.testingFocus.join(', ')}`)
          );
        }
      } else {
        console.log(chalk.red('\n❌ Configuration validation failed!\n'));
        console.log(chalk.red('Errors:'));
        result.errors.forEach((error) => {
          console.log(chalk.red(`  • ${error}`));
        });
      }

      if (options.detailed) {
        console.log(chalk.blue('\n📋 Schema Details:'));
        console.log(
          chalk.gray(JSON.stringify(AQEConfigSchema, null, 2).slice(0, 500) + '...')
        );
      }

      return result;
    } catch (error: any) {
      spinner.fail(chalk.red('Validation failed'));
      throw error;
    }
  }

  private static performAdditionalChecks(config: any): string[] {
    const warnings: string[] = [];

    // Check if testingFocus is empty
    if (!config.fleet.testingFocus || config.fleet.testingFocus.length === 0) {
      warnings.push('No testing focus areas specified');
    }

    // Check if environments is empty
    if (!config.fleet.environments || config.fleet.environments.length === 0) {
      warnings.push('No target environments specified');
    }

    // Check for very low agent count
    if (config.fleet.maxAgents < 5) {
      warnings.push(
        'Low agent count may impact parallel execution performance'
      );
    }

    // Check for very high agent count without mesh topology
    if (config.fleet.maxAgents > 30 && config.fleet.topology !== 'mesh') {
      warnings.push(
        'High agent count recommended to use mesh topology for better coordination'
      );
    }

    // Check if security is disabled in production-like setup
    if (
      config.fleet.environments?.includes('production') &&
      (!config.features?.security || config.features.security === false)
    ) {
      warnings.push(
        'Security features disabled for production environment'
      );
    }

    return warnings;
  }
}

/**
 * Wrapper function for CLI usage
 */
export async function configValidate(options: ConfigValidateOptions): Promise<ValidationResult> {
  return ConfigValidateCommand.execute(options);
}
