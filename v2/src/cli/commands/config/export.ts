/**
 * Config Export Command - Export configuration to file
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import * as yaml from 'yaml';

export interface ConfigExportOptions {
  output?: string;
  format?: 'json' | 'yaml';
  force?: boolean;
  includeMetadata?: boolean;
  config?: string;
}

export class ConfigExportCommand {
  private static readonly DEFAULT_CONFIG_PATH = '.agentic-qe/config/aqe.config.json';

  static async execute(options: ConfigExportOptions): Promise<void> {
    const spinner = ora('Exporting configuration...').start();

    try {
      // Determine config file path
      const configPath = options.config || this.DEFAULT_CONFIG_PATH;

      // Check if config exists
      if (!(await fs.pathExists(configPath))) {
        throw new Error(`Configuration file not found: ${configPath}`);
      }

      // Read configuration
      const config = await fs.readJson(configPath);

      // Determine output path
      const format = options.format || 'json';
      const defaultFilename = `aqe-config-${Date.now()}.${format}`;
      const outputPath = options.output || defaultFilename;

      // Check if output file exists
      if ((await fs.pathExists(outputPath)) && !options.force) {
        throw new Error(
          'File already exists. Use --force to overwrite'
        );
      }

      // Prepare export data
      let exportData: any = config;
      if (options.includeMetadata) {
        exportData = {
          metadata: {
            exportedAt: new Date().toISOString(),
            exportedFrom: configPath,
            version: config.version
          },
          config: config
        };
      }

      // Write to file based on format
      if (format === 'json') {
        await fs.writeJson(outputPath, exportData, { spaces: 2 });
      } else if (format === 'yaml') {
        const yamlContent = yaml.stringify(exportData);
        await fs.writeFile(outputPath, yamlContent, 'utf-8');
      }

      spinner.succeed(chalk.green('Configuration exported successfully!'));

      console.log(chalk.blue('\n📦 Export Details:'));
      console.log(chalk.gray(`  Source: ${configPath}`));
      console.log(chalk.gray(`  Output: ${outputPath}`));
      console.log(chalk.gray(`  Format: ${format}`));
      console.log(
        chalk.gray(`  Metadata: ${options.includeMetadata ? 'Included' : 'Not included'}`)
      );

      console.log(chalk.yellow('\n💡 Tip:'));
      console.log(
        chalk.gray('  Import this config: aqe config import --input ' + outputPath)
      );
    } catch (error: any) {
      spinner.fail(chalk.red('Failed to export configuration'));
      throw error;
    }
  }
}
