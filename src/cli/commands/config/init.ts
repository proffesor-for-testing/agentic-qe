/**
 * Config Init Command - Initialize configuration with templates
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import Ajv from 'ajv';
import { AQEConfigSchema } from './schema';

export interface ConfigInitOptions {
  template?: string;
  force?: boolean;
  interactive?: boolean;
}

export class ConfigInitCommand {
  private static readonly CONFIG_DIR = '.agentic-qe/config';
  private static readonly CONFIG_FILE = 'aqe.config.json';
  private static readonly CONFIG_PATH = path.join(
    ConfigInitCommand.CONFIG_DIR,
    ConfigInitCommand.CONFIG_FILE
  );

  static async execute(options: ConfigInitOptions): Promise<void> {
    const spinner = ora('Initializing configuration...').start();

    try {
      // Get template name
      const template = options.template || 'default';

      // Validate template
      if (!this.isValidTemplate(template)) {
        throw new Error(
          `Invalid template: ${template}. Valid templates: default, minimal, enterprise`
        );
      }

      // Check if config exists
      const configExists = await fs.pathExists(this.CONFIG_PATH);
      if (configExists && !options.force) {
        throw new Error(
          'Configuration already exists. Use --force to overwrite'
        );
      }

      // Backup existing config if force overwrite
      if (configExists && options.force) {
        spinner.text = 'Creating backup of existing configuration...';
        const timestamp = new Date().toISOString().replace(/:/g, '-');
        const backupPath = `${this.CONFIG_PATH}.backup.${timestamp}`;
        await fs.copy(this.CONFIG_PATH, backupPath);
        spinner.succeed(chalk.green(`Backup created: ${backupPath}`));
        spinner.start('Initializing configuration...');
      }

      // Ensure directory exists
      await fs.ensureDir(this.CONFIG_DIR);

      // Generate config from template
      const config = this.getTemplate(template);

      // Validate config against schema
      const ajv = new Ajv({ strictTypes: false });
      const validate = ajv.compile(AQEConfigSchema);
      const valid = validate(config);

      if (!valid) {
        throw new Error(
          `Template validation failed: ${JSON.stringify(validate.errors)}`
        );
      }

      // Write configuration
      await fs.writeJson(this.CONFIG_PATH, config, { spaces: 2 });

      spinner.succeed(
        chalk.green(`Configuration initialized with ${template} template!`)
      );

      console.log(chalk.blue('\n📋 Configuration Details:'));
      console.log(chalk.gray(`  Location: ${this.CONFIG_PATH}`));
      console.log(chalk.gray(`  Template: ${template}`));
      console.log(chalk.gray(`  Topology: ${(config.fleet as any)?.topology || 'N/A'}`));
      console.log(chalk.gray(`  Max Agents: ${(config.fleet as any)?.maxAgents || 'N/A'}`));

      console.log(chalk.yellow('\n💡 Next Steps:'));
      console.log(
        chalk.gray('  1. Review configuration: aqe config get')
      );
      console.log(
        chalk.gray('  2. Validate configuration: aqe config validate')
      );
      console.log(chalk.gray('  3. Initialize fleet: aqe fleet init'));
    } catch (error: any) {
      spinner.fail(chalk.red('Configuration initialization failed'));
      throw error;
    }
  }

  private static isValidTemplate(template: string): boolean {
    return ['default', 'minimal', 'enterprise'].includes(template);
  }

  private static getTemplate(templateName: string): any {
    const templates: Record<string, any> = {
      default: {
        version: '1.0',
        fleet: {
          topology: 'hierarchical',
          maxAgents: 10,
          testingFocus: ['unit', 'integration', 'e2e'],
          environments: ['development', 'staging', 'production']
        },
        features: {
          monitoring: true,
          security: false,
          reporting: true,
          coordination: true
        }
      },
      minimal: {
        version: '1.0',
        fleet: {
          topology: 'hierarchical',
          maxAgents: 5,
          testingFocus: ['unit']
        },
        features: {
          monitoring: false,
          security: false,
          reporting: true,
          coordination: true
        }
      },
      enterprise: {
        version: '1.0',
        fleet: {
          topology: 'mesh',
          maxAgents: 50,
          testingFocus: ['unit', 'integration', 'e2e', 'performance', 'security'],
          environments: ['development', 'staging', 'production'],
          agents: [
            { type: 'qe-test-generator', count: 10, capabilities: ['unit', 'integration'] },
            { type: 'qe-test-executor', count: 15, capabilities: ['parallel', 'retry'] },
            { type: 'qe-coverage-analyzer', count: 5, capabilities: ['optimization'] },
            { type: 'qe-quality-gate', count: 5, capabilities: ['validation'] },
            { type: 'qe-performance-tester', count: 10, capabilities: ['load', 'stress'] },
            { type: 'qe-security-scanner', count: 5, capabilities: ['sast', 'dast'] }
          ]
        },
        features: {
          monitoring: true,
          security: {
            enabled: true,
            level: 'strict'
          },
          reporting: true,
          coordination: true
        },
        plugins: [
          { name: 'slack-notifier', enabled: true, config: {} },
          { name: 'jira-integration', enabled: true, config: {} }
        ]
      }
    };

    return templates[templateName];
  }
}

/**
 * Wrapper function for CLI usage
 */
export async function configInit(options: ConfigInitOptions): Promise<void> {
  return ConfigInitCommand.execute(options);
}
