/**
 * Config Import Command - Import configuration from file
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import Ajv from 'ajv';
import * as yaml from 'yaml';
import { AQEConfigSchema } from './schema';

export interface ConfigImportOptions {
  input: string;
  force?: boolean;
  merge?: boolean;
  validate?: boolean;
}

export class ConfigImportCommand {
  private static readonly DEFAULT_CONFIG_PATH = '.agentic-qe/config/aqe.config.json';

  static async execute(options: ConfigImportOptions): Promise<void> {
    const spinner = ora('Importing configuration...').start();

    try {
      // Check if input file exists
      if (!(await fs.pathExists(options.input))) {
        throw new Error(`File not found: ${options.input}`);
      }

      // Read and parse input file
      const importedConfig = await this.readConfigFile(options.input);

      // Extract actual config if it has metadata wrapper
      const config = importedConfig.config || importedConfig;

      // Validate imported configuration
      if (options.validate !== false) {
        const ajv = new Ajv({ allErrors: true, strictTypes: false });
        const validate = ajv.compile(AQEConfigSchema);
        const valid = validate(config);

        if (!valid) {
          const errors = validate.errors
            ?.map((err) => `${err.instancePath}: ${err.message}`)
            .join(', ');
          throw new Error(`Configuration validation failed: ${errors}`);
        }
      }

      // Check if target config exists
      const targetExists = await fs.pathExists(this.DEFAULT_CONFIG_PATH);

      if (targetExists && !options.force && !options.merge) {
        throw new Error(
          'Configuration already exists. Use --force to overwrite or --merge to merge'
        );
      }

      // Prepare final configuration
      let finalConfig = config;

      if (options.merge && targetExists) {
        spinner.text = 'Merging configurations...';
        const existingConfig = await fs.readJson(this.DEFAULT_CONFIG_PATH);
        finalConfig = this.deepMerge(existingConfig, config);
      }

      // Ensure directory exists
      await fs.ensureDir(path.dirname(this.DEFAULT_CONFIG_PATH));

      // Write configuration
      await fs.writeJson(this.DEFAULT_CONFIG_PATH, finalConfig, { spaces: 2 });

      spinner.succeed(chalk.green('Configuration imported successfully!'));

      console.log(chalk.blue('\n📥 Import Details:'));
      console.log(chalk.gray(`  Source: ${options.input}`));
      console.log(chalk.gray(`  Target: ${this.DEFAULT_CONFIG_PATH}`));
      console.log(
        chalk.gray(`  Mode: ${options.merge ? 'Merge' : 'Overwrite'}`)
      );
      console.log(chalk.gray(`  Validated: ${options.validate !== false ? 'Yes' : 'No'}`));

      console.log(chalk.blue('\n📊 Configuration Summary:'));
      console.log(chalk.gray(`  Version: ${finalConfig.version}`));
      console.log(chalk.gray(`  Topology: ${finalConfig.fleet.topology}`));
      console.log(chalk.gray(`  Max Agents: ${finalConfig.fleet.maxAgents}`));

      console.log(chalk.yellow('\n💡 Next Steps:'));
      console.log(
        chalk.gray('  1. Review configuration: aqe config get')
      );
      console.log(
        chalk.gray('  2. Validate configuration: aqe config validate')
      );
    } catch (error: any) {
      spinner.fail(chalk.red('Failed to import configuration'));
      throw error;
    }
  }

  private static async readConfigFile(filePath: string): Promise<any> {
    const ext = path.extname(filePath).toLowerCase();

    if (ext === '.json') {
      return await fs.readJson(filePath);
    } else if (ext === '.yaml' || ext === '.yml') {
      const content = await fs.readFile(filePath, 'utf-8');
      return yaml.parse(content);
    } else {
      // Try to parse as JSON by default
      return await fs.readJson(filePath);
    }
  }

  private static deepMerge(target: any, source: any): any {
    const output = { ...target };

    if (this.isObject(target) && this.isObject(source)) {
      Object.keys(source).forEach((key) => {
        if (this.isObject(source[key])) {
          if (!(key in target)) {
            Object.assign(output, { [key]: source[key] });
          } else {
            output[key] = this.deepMerge(target[key], source[key]);
          }
        } else {
          Object.assign(output, { [key]: source[key] });
        }
      });
    }

    return output;
  }

  private static isObject(item: any): boolean {
    return item && typeof item === 'object' && !Array.isArray(item);
  }
}
