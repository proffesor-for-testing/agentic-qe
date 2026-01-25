/**
 * Sync CLI Commands
 *
 * Commands for syncing local AQE learning data to cloud PostgreSQL.
 *
 * Usage:
 *   aqe sync                    # Incremental sync
 *   aqe sync --full             # Full sync
 *   aqe sync status             # Show sync status
 *   aqe sync verify             # Verify sync integrity
 *   aqe sync init               # Initialize cloud schema
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import {
  createSyncAgent,
  syncToCloud,
  syncIncrementalToCloud,
  DEFAULT_SYNC_CONFIG,
  type SyncReport,
  type SyncAgentConfig,
} from '../../sync/index.js';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Create sync commands
 */
export function createSyncCommands(): Command {
  const syncCmd = new Command('sync')
    .description('Sync local learning data to cloud PostgreSQL');

  // Default sync (incremental)
  syncCmd
    .option('-f, --full', 'Run full sync instead of incremental')
    .option('-e, --env <environment>', 'Environment identifier', process.env.AQE_ENV || 'devpod')
    .option('--dry-run', 'Preview sync without making changes')
    .option('-v, --verbose', 'Enable verbose output')
    .option('--since <date>', 'Sync changes since date (ISO 8601)')
    .option('--sources <sources>', 'Comma-separated list of sources to sync')
    .action(async (options) => {
      const config: Partial<SyncAgentConfig> = {
        environment: options.env,
        verbose: options.verbose,
        sync: {
          ...DEFAULT_SYNC_CONFIG.sync,
          dryRun: options.dryRun,
        },
      };

      // Filter sources if specified
      if (options.sources) {
        const sourceNames = options.sources.split(',').map((s: string) => s.trim());
        config.sync!.sources = DEFAULT_SYNC_CONFIG.sync.sources.filter(
          s => sourceNames.includes(s.name)
        );
      }

      const spinner = ora('Initializing sync agent...').start();

      try {
        let report: SyncReport;

        if (options.full) {
          spinner.text = 'Running full sync...';
          report = await syncToCloud(config);
        } else {
          const since = options.since ? new Date(options.since) : undefined;
          spinner.text = 'Running incremental sync...';
          report = await syncIncrementalToCloud(since, config);
        }

        spinner.stop();
        printSyncReport(report);
      } catch (error) {
        spinner.fail(`Sync failed: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      }
    });

  // Status subcommand
  syncCmd
    .command('status')
    .description('Show sync status and data source information')
    .option('-e, --env <environment>', 'Environment identifier', process.env.AQE_ENV || 'devpod')
    .action(async (options) => {
      const spinner = ora('Checking sync status...').start();

      try {
        const agent = createSyncAgent({ environment: options.env, verbose: false });
        await agent.initialize();
        const status = await agent.getStatus();
        await agent.close();

        spinner.stop();
        printSyncStatus(status);
      } catch (error) {
        spinner.fail(`Failed to get status: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      }
    });

  // Verify subcommand
  syncCmd
    .command('verify')
    .description('Verify sync integrity between local and cloud')
    .option('-e, --env <environment>', 'Environment identifier', process.env.AQE_ENV || 'devpod')
    .action(async (options) => {
      const spinner = ora('Verifying sync integrity...').start();

      try {
        const agent = createSyncAgent({ environment: options.env, verbose: false });
        await agent.initialize();

        // Note: Verify requires cloud connection
        spinner.text = 'Connecting to cloud...';
        const verifyResult = await agent.verify();
        await agent.close();

        spinner.stop();
        printVerifyResult(verifyResult);
      } catch (error) {
        spinner.fail(`Verification failed: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      }
    });

  // Init subcommand
  syncCmd
    .command('init')
    .description('Initialize cloud schema (requires GCP credentials)')
    .option('--dry-run', 'Print schema without executing')
    .option('-o, --output <file>', 'Save schema to file')
    .action(async (options) => {
      // Read schema file
      const schemaPath = path.join(__dirname, '../../sync/schema/cloud-schema.sql');
      let schema: string;

      try {
        schema = fs.readFileSync(schemaPath, 'utf-8');
      } catch {
        // Try alternative path for bundled version
        const altPath = path.join(process.cwd(), 'v3/src/sync/schema/cloud-schema.sql');
        schema = fs.readFileSync(altPath, 'utf-8');
      }

      if (options.output) {
        fs.writeFileSync(options.output, schema);
        console.log(chalk.green(`Schema saved to ${options.output}`));
        return;
      }

      if (options.dryRun) {
        console.log(chalk.cyan('\n=== Cloud Schema ===\n'));
        console.log(schema);
        console.log(chalk.yellow('\nDry run - no changes made'));
        return;
      }

      const spinner = ora('Initializing cloud schema...').start();

      try {
        const agent = createSyncAgent({ verbose: true });
        // Would execute schema here with cloud connection
        spinner.info('Schema initialization requires cloud connection');
        spinner.info('Run with --output to save schema, then apply manually');
        await agent.close();
      } catch (error) {
        spinner.fail(`Init failed: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      }
    });

  // Config subcommand
  syncCmd
    .command('config')
    .description('Show or modify sync configuration')
    .option('--show', 'Show current configuration')
    .option('--sources', 'List configured data sources')
    .action(async (options) => {
      if (options.sources) {
        console.log(chalk.cyan('\n=== Configured Data Sources ===\n'));
        for (const source of DEFAULT_SYNC_CONFIG.sync.sources) {
          const statusIcon = source.enabled !== false ? chalk.green('✓') : chalk.gray('○');
          console.log(`${statusIcon} ${chalk.bold(source.name)}`);
          console.log(`   Type: ${source.type}`);
          console.log(`   Path: ${source.path}`);
          console.log(`   Target: ${source.targetTable}`);
          console.log(`   Priority: ${source.priority}`);
          console.log(`   Mode: ${source.mode}`);
          console.log();
        }
        return;
      }

      // Default: show full config
      console.log(chalk.cyan('\n=== Sync Configuration ===\n'));
      console.log(chalk.bold('Environment:'), process.env.AQE_ENV || 'devpod');
      console.log(chalk.bold('Sync Mode:'), DEFAULT_SYNC_CONFIG.sync.mode);
      console.log(chalk.bold('Batch Size:'), DEFAULT_SYNC_CONFIG.sync.batchSize);
      console.log(chalk.bold('Conflict Resolution:'), DEFAULT_SYNC_CONFIG.sync.conflictResolution);
      console.log();
      console.log(chalk.bold('Cloud Configuration:'));
      console.log(`   Project: ${DEFAULT_SYNC_CONFIG.cloud.project || '(not set)'}`);
      console.log(`   Zone: ${DEFAULT_SYNC_CONFIG.cloud.zone}`);
      console.log(`   Instance: ${DEFAULT_SYNC_CONFIG.cloud.instance}`);
      console.log(`   Database: ${DEFAULT_SYNC_CONFIG.cloud.database}`);
      console.log(`   Tunnel Port: ${DEFAULT_SYNC_CONFIG.cloud.tunnelPort}`);
      console.log();
      console.log(chalk.gray('Use --sources to list data sources'));
    });

  return syncCmd;
}

/**
 * Print sync report
 */
function printSyncReport(report: SyncReport): void {
  const statusColor = report.status === 'completed' ? chalk.green :
                      report.status === 'partial' ? chalk.yellow :
                      chalk.red;

  console.log(chalk.cyan('\n=== Sync Report ===\n'));
  console.log(chalk.bold('Sync ID:'), report.syncId);
  console.log(chalk.bold('Status:'), statusColor(report.status.toUpperCase()));
  console.log(chalk.bold('Environment:'), report.environment);
  console.log(chalk.bold('Mode:'), report.mode);
  console.log(chalk.bold('Duration:'), `${report.totalDurationMs}ms`);
  console.log();

  console.log(chalk.bold('Summary:'));
  console.log(`   Records Synced: ${chalk.green(report.totalRecordsSynced)}`);
  console.log(`   Conflicts Resolved: ${chalk.yellow(report.totalConflictsResolved)}`);
  console.log();

  if (report.results.length > 0) {
    console.log(chalk.bold('Results by Source:'));
    for (const result of report.results) {
      const icon = result.success ? chalk.green('✓') : chalk.red('✗');
      console.log(`   ${icon} ${result.source}`);
      console.log(`      Table: ${result.table}`);
      console.log(`      Records: ${result.recordsSynced}`);
      console.log(`      Duration: ${result.durationMs}ms`);
      if (result.error) {
        console.log(`      Error: ${chalk.red(result.error)}`);
      }
    }
    console.log();
  }

  if (report.errors.length > 0) {
    console.log(chalk.red('Errors:'));
    for (const error of report.errors) {
      console.log(`   - ${error}`);
    }
  }
}

/**
 * Print sync status
 */
function printSyncStatus(status: { sources: any[]; lastSync?: Date }): void {
  console.log(chalk.cyan('\n=== Sync Status ===\n'));

  if (status.lastSync) {
    console.log(chalk.bold('Last Sync:'), status.lastSync.toISOString());
    console.log();
  }

  console.log(chalk.bold('Data Sources:'));
  console.log();

  let totalRecords = 0;
  for (const source of status.sources) {
    const icon = source.enabled ? chalk.green('✓') : chalk.gray('○');
    const priorityColor = source.priority === 'high' ? chalk.red :
                          source.priority === 'medium' ? chalk.yellow :
                          chalk.gray;

    console.log(`${icon} ${chalk.bold(source.name)}`);
    console.log(`   Type: ${source.type}`);
    console.log(`   Target: ${source.targetTable}`);
    console.log(`   Records: ${chalk.cyan(source.recordCount)}`);
    console.log(`   Priority: ${priorityColor(source.priority)}`);
    if (source.error) {
      console.log(`   Error: ${chalk.red(source.error)}`);
    }
    console.log();

    totalRecords += source.recordCount;
  }

  console.log(chalk.bold('Total Records:'), chalk.cyan(totalRecords));
}

/**
 * Print verify result
 */
function printVerifyResult(result: any): void {
  const statusColor = result.verified ? chalk.green : chalk.red;

  console.log(chalk.cyan('\n=== Verification Result ===\n'));
  console.log(chalk.bold('Status:'), statusColor(result.verified ? 'VERIFIED' : 'MISMATCH'));
  console.log();

  console.log(chalk.bold('Table Comparison:'));
  for (const table of result.results) {
    const icon = table.match ? chalk.green('✓') :
                 table.cloudCount === -1 ? chalk.yellow('?') :
                 chalk.red('✗');
    console.log(`${icon} ${table.source}`);
    console.log(`   Local: ${table.localCount}`);
    console.log(`   Cloud: ${table.cloudCount === -1 ? 'N/A' : table.cloudCount}`);
    if (!table.match && table.cloudCount !== -1) {
      const diffColor = table.diff > 0 ? chalk.green : chalk.red;
      console.log(`   Diff: ${diffColor(table.diff > 0 ? '+' + table.diff : table.diff)}`);
    }
    console.log();
  }
}

export default createSyncCommands;
