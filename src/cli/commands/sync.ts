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
 *
 * Exit codes for sync and pull: 0 completed, 2 partial, 1 failed.
 * Exit codes for verify: 0 verified, 2 partial (some sources could not be
 * counted, the rest matched), 1 mismatch or not verified.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import {
  createSyncAgent,
  syncToCloud,
  syncIncrementalToCloud,
  DEFAULT_SYNC_CONFIG,
  DEFAULT_PULL_CONFIG,
  type SyncReport,
  type SyncAgentConfig,
  type VerifyResult,
  pullFromCloud,
  pullIncrementalFromCloud,
  pullTablesProblem,
  type PullAgentConfig,
} from '../../sync/index.js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { toErrorMessage } from '../../shared/error-utils.js';
import { findPackageRoot } from '../../init/find-package-root.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Exit code for a finished sync or pull report (#1345): 0 when every source
 * synced, 2 when some sources failed (partial), 1 when the sync failed.
 */
export function syncReportExitCode(report: Pick<SyncReport, 'status'>): number {
  if (report.status === 'completed') return 0;
  if (report.status === 'partial') return 2;
  return 1;
}

/**
 * Exit code for `aqe sync verify` (#1361), in the #1345 convention: 0 when
 * every source was counted on both sides and matched, 2 when the sources that
 * could be counted matched but others could not be, 1 on a mismatch or when
 * nothing could be verified (no cloud connection).
 */
export function verifyExitCode(result: Pick<VerifyResult, 'status'>): number {
  if (result.status === 'verified') return 0;
  if (result.status === 'partial') return 2;
  return 1;
}

/** #1361: names given to a filter option that match nothing it filters. */
function unknownNames(given: string[], known: string[]): string[] {
  const set = new Set(known);
  return given.filter(name => !set.has(name));
}

/**
 * Create sync commands
 */
export function createSyncCommands(): Command {
  const syncCmd = new Command('sync')
    .description('Sync local learning data to cloud PostgreSQL');

  // Default sync (push to cloud, incremental by default)
  syncCmd
    .option('--full', 'Run full sync instead of incremental')
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
        const sourceNames: string[] = options.sources.split(',').map((s: string) => s.trim()).filter(Boolean);
        // #1361: a name that matches no source is an error, not an empty "completed" sync.
        const known = DEFAULT_SYNC_CONFIG.sync.sources.map(s => s.name);
        const unknown = unknownNames(sourceNames, known);
        if (unknown.length > 0 || sourceNames.length === 0) {
          console.error(chalk.red(`Unknown source(s): ${unknown.join(', ') || '(none given)'}`));
          console.error(`Known sources: ${known.join(', ')} (see \`aqe sync config --sources\`)`);
          process.exitCode = 1;
          return;
        }
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
        // #1345: scripts must be able to tell a failed sync from a good one.
        process.exitCode = syncReportExitCode(report);
      } catch (error) {
        spinner.fail(`Sync failed: ${toErrorMessage(error)}`);
        process.exit(1);
      }
    });

  // Pull subcommand (cloud → local)
  syncCmd
    .command('pull')
    .description('Pull cloud learning data into local SQLite database')
    .option('-f, --full', 'Full pull (all cloud data)')
    .option('-e, --env <environment>', 'Pull only data from specific environment', 'all')
    .option('--tables <tables>', 'Comma-separated list of tables to pull')
    .option('--dry-run', 'Preview pull without writing to local DB')
    .option('--target <path>', 'Custom target SQLite database path')
    .option('--since <date>', 'Pull changes since date (ISO 8601)')
    .option('-v, --verbose', 'Enable verbose output')
    .action(async (options) => {
      const pullConfig: Partial<PullAgentConfig> = {
        environment: options.env,
        verbose: options.verbose,
        dryRun: options.dryRun,
        targetDb: options.target,
      };

      // Filter tables if specified
      if (options.tables) {
        pullConfig.tables = options.tables.split(',').map((t: string) => t.trim()).filter(Boolean);
        // #1361: refuse a typo, or a disabled table, before connecting, not
        // after an empty "completed" pull.
        const problem = pullTablesProblem(pullConfig.tables!, DEFAULT_PULL_CONFIG.sources);
        if (problem) {
          console.error(chalk.red(problem));
          process.exitCode = 1;
          return;
        }
      }

      const spinner = ora('Initializing pull sync agent...').start();

      try {
        let report: SyncReport;

        if (options.full) {
          spinner.text = 'Pulling all data from cloud...';
          report = await pullFromCloud(pullConfig);
        } else {
          const since = options.since ? new Date(options.since) : undefined;
          spinner.text = `Pulling ${since ? 'changes since ' + since.toISOString() : 'incremental changes (last 24h)'}...`;
          report = await pullIncrementalFromCloud(since, pullConfig);
        }

        spinner.stop();
        printPullReport(report);
        process.exitCode = syncReportExitCode(report);
      } catch (error) {
        spinner.fail(`Pull failed: ${toErrorMessage(error)}`);
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
        spinner.fail(`Failed to get status: ${toErrorMessage(error)}`);
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

        // #1361: verify connects to the cloud itself; without a connection it
        // reports UNVERIFIED and exits 1, never VERIFIED against a count of 0.
        spinner.text = 'Connecting to cloud...';
        const verifyResult = await agent.verify();
        await agent.close();

        spinner.stop();
        printVerifyResult(verifyResult);
        process.exitCode = verifyExitCode(verifyResult);
      } catch (error) {
        spinner.fail(`Verification failed: ${toErrorMessage(error)}`);
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
      // Read schema file.
      // fix/init-v3-9-4: same chunk-split bundle regression as
      // governance-installer. Walk up to the agentic-qe package root
      // via findPackageRoot() so the schema path survives esbuild
      // chunk-splitting.
      const candidates: string[] = [
        path.join(__dirname, '../../sync/schema/cloud-schema.sql'),
      ];
      const packageRoot = findPackageRoot(import.meta.url);
      if (packageRoot) {
        candidates.push(path.join(packageRoot, 'src/sync/schema/cloud-schema.sql'));
        candidates.push(path.join(packageRoot, 'dist/sync/schema/cloud-schema.sql'));
      }
      candidates.push(path.join(process.cwd(), 'src/sync/schema/cloud-schema.sql'));

      let schema: string | undefined;
      for (const c of candidates) {
        try {
          schema = fs.readFileSync(c, 'utf-8');
          break;
        } catch {
          // try next candidate
        }
      }
      if (!schema) {
        throw new Error(
          `Could not locate cloud-schema.sql. Searched: ${candidates.join(', ')}`,
        );
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
        spinner.fail(`Init failed: ${toErrorMessage(error)}`);
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
  console.log(chalk.bold('Mode:'), report.dryRun ? `${report.mode} (dry run)` : report.mode);
  console.log(chalk.bold('Duration:'), `${report.totalDurationMs}ms`);
  console.log();
  if (report.dryRun) {
    // #1331: a dry run reads local sources only and sends nothing.
    console.log(chalk.yellow('Dry run: nothing was sent to the cloud; counts are the records found locally (a real sync may skip rows that already exist).'));
    console.log();
  }

  console.log(chalk.bold('Summary:'));
  console.log(`   ${report.dryRun ? 'Records That Would Sync' : 'Records Synced'}: ${chalk.green(report.totalRecordsSynced)}`);
  console.log(`   Conflicts Resolved: ${chalk.yellow(report.totalConflictsResolved)}`);
  console.log();

  if (report.results.length > 0) {
    console.log(chalk.bold('Results by Source:'));
    for (const result of report.results) {
      // #1361: a source whose file does not exist was not read.
      const icon = !result.success ? chalk.red('✗') : result.sourceMissing ? chalk.gray('-') : chalk.green('✓');
      console.log(`   ${icon} ${result.source}`);
      console.log(`      Table: ${result.table}`);
      console.log(`      Records: ${result.recordsSynced}`);
      if (result.sourceMissing) console.log(`      ${chalk.gray('Not read: the source file does not exist')}`);
      console.log(`      Duration: ${result.durationMs}ms`);
      // #1384: entries skipped while reading (the source still succeeded).
      if (result.success && result.recordsSkipped > 0) console.log(`      Skipped: ${chalk.yellow(result.recordsSkipped)}`);
      for (const warning of result.warnings ?? []) console.log(`      Note: ${chalk.yellow(warning)}`);
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
interface SyncSource {
  name: string;
  type: string;
  targetTable: string;
  recordCount: number;
  priority: 'high' | 'medium' | 'low';
  enabled: boolean;
  error?: string;
}

function printSyncStatus(status: { sources: SyncSource[]; lastSync?: Date }): void {
  console.log(chalk.cyan('\n=== Sync Status ===\n'));

  if (status.lastSync) {
    console.log(chalk.bold('Last Sync:'), status.lastSync.toISOString());
    console.log();
  }

  console.log(chalk.bold('Data Sources:'));
  console.log();

  let totalRecords = 0;
  for (const source of status.sources) {
    // #1378: a source that could not be read or counted is not a ✓.
    const icon = source.error ? chalk.red('✗') : source.enabled ? chalk.green('✓') : chalk.gray('○');
    const priorityColor = source.priority === 'high' ? chalk.red :
                          source.priority === 'medium' ? chalk.yellow :
                          chalk.gray;

    console.log(`${icon} ${chalk.bold(source.name)}`);
    console.log(`   Type: ${source.type}`);
    console.log(`   Target: ${source.targetTable}`);
    // #1378: a source that could not be counted has no count, not 0.
    console.log(`   Records: ${source.error ? chalk.gray('N/A') : chalk.cyan(source.recordCount)}`);
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
function printVerifyResult(result: VerifyResult): void {
  const statusColor = result.status === 'verified' ? chalk.green :
                      result.status === 'mismatch' ? chalk.red :
                      chalk.yellow;

  console.log(chalk.cyan('\n=== Verification Result ===\n'));
  console.log(chalk.bold('Status:'), statusColor(result.status.toUpperCase()));
  if (result.error) console.log(chalk.bold('Reason:'), chalk.yellow(result.error));
  if (result.status === 'unverified' || result.status === 'partial') {
    console.log(chalk.yellow('Counts marked ? could not be read, so they were not compared.'));
  }
  console.log();

  console.log(chalk.bold('Table Comparison:'));
  for (const table of result.results) {
    const icon = table.status === 'match' ? chalk.green('✓') :
                 table.status === 'unverified' ? chalk.yellow('?') :
                 chalk.red('✗');
    console.log(`${icon} ${table.source}`);
    console.log(`   Local: ${table.localCount === -1 ? 'N/A' : table.localCount}`);
    console.log(`   Cloud: ${table.cloudCount === -1 ? 'N/A' : table.cloudCount}`);
    if (table.status === 'mismatch') {
      const diffColor = table.diff > 0 ? chalk.green : chalk.red;
      console.log(`   Diff: ${diffColor(table.diff > 0 ? '+' + table.diff : table.diff)}`);
    }
    // The connection failure is printed once above, not per table.
    if (table.error && table.error !== result.error) console.log(`   Error: ${chalk.yellow(table.error)}`);
    console.log();
  }
}

/**
 * Print pull sync report
 */
function printPullReport(report: SyncReport): void {
  const statusColor = report.status === 'completed' ? chalk.green :
                      report.status === 'partial' ? chalk.yellow :
                      chalk.red;

  console.log(chalk.cyan('\n=== Pull Sync Report (Cloud → Local) ===\n'));
  console.log(chalk.bold('Sync ID:'), report.syncId);
  console.log(chalk.bold('Status:'), statusColor(report.status.toUpperCase()));
  console.log(chalk.bold('Environment:'), report.environment);
  console.log(chalk.bold('Mode:'), report.mode);
  console.log(chalk.bold('Duration:'), `${report.totalDurationMs}ms`);
  console.log();

  console.log(chalk.bold('Summary:'));
  console.log(`   Records Pulled: ${chalk.green(report.totalRecordsSynced)}`);
  console.log();

  if (report.results.length > 0) {
    console.log(chalk.bold('Results by Table:'));
    for (const result of report.results) {
      const icon = result.success ? chalk.green('✓') : chalk.red('✗');
      console.log(`   ${icon} ${result.source} → ${result.table}`);
      console.log(`      Records: ${result.recordsSynced}`);
      console.log(`      Duration: ${result.durationMs}ms`);
      if (result.recordsSkipped > 0) {
        console.log(`      Skipped: ${chalk.yellow(result.recordsSkipped)}`);
      }
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

export default createSyncCommands;
