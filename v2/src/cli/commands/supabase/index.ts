/**
 * Supabase CLI Commands
 *
 * Commands for configuring and managing Supabase cloud persistence.
 *
 * Usage:
 *   aqe supabase init    - Interactive setup wizard
 *   aqe supabase status  - Check connection and sync status
 *   aqe supabase sync    - Force sync local data to cloud
 *   aqe supabase schema  - Display SQL schema for manual setup
 *
 * @module cli/commands/supabase
 */

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import * as fs from 'fs-extra';
import * as path from 'path';
import {
  SUPABASE_ENV_VARS,
  isSupabaseConfigured,
  validateSupabaseConfig,
  buildSupabaseConfig,
  getConfiguredProvider,
} from '../../../persistence/SupabaseConfig.js';
import { SupabasePersistenceProvider } from '../../../persistence/SupabasePersistenceProvider.js';
import {
  HybridPersistenceProvider,
  createHybridPersistenceProvider,
} from '../../../persistence/HybridPersistenceProvider.js';

/**
 * Create the supabase command group
 */
export function createSupabaseCommand(): Command {
  const supabase = new Command('supabase')
    .description('Supabase cloud persistence management');

  // aqe supabase init
  supabase
    .command('init')
    .description('Interactive setup for Supabase cloud persistence')
    .option('--url <url>', 'Supabase project URL')
    .option('--anon-key <key>', 'Supabase anonymous key')
    .option('--service-key <key>', 'Supabase service role key (optional)')
    .option('-y, --yes', 'Skip prompts and use provided options')
    .action(async (options) => {
      await runSupabaseInit(options);
    });

  // aqe supabase status
  supabase
    .command('status')
    .description('Check Supabase connection and sync status')
    .action(async () => {
      await runSupabaseStatus();
    });

  // aqe supabase sync
  supabase
    .command('sync')
    .description('Force sync local data to Supabase cloud')
    .option('--direction <dir>', 'Sync direction: push, pull, both', 'push')
    .option('--type <type>', 'Data type to sync: all, memory, code, experiences, patterns', 'all')
    .option('--partition <partition>', 'Partition to sync (for memory)')
    .option('--project <projectId>', 'Project ID (for code intelligence)')
    .option('--dry-run', 'Show what would be synced without syncing')
    .option('--migrate', 'Migrate all existing local data from memory.db to Supabase')
    .action(async (options) => {
      await runSupabaseSync(options);
    });

  // aqe supabase schema
  supabase
    .command('schema')
    .description('Display SQL schema for manual Supabase setup')
    .option('--output <file>', 'Write schema to file instead of stdout')
    .action(async (options) => {
      await runSupabaseSchema(options);
    });

  // aqe supabase test
  supabase
    .command('test')
    .description('Test Supabase connection')
    .action(async () => {
      await runSupabaseTest();
    });

  return supabase;
}

/**
 * Interactive Supabase initialization wizard
 */
async function runSupabaseInit(options: {
  url?: string;
  anonKey?: string;
  serviceKey?: string;
  yes?: boolean;
}): Promise<void> {
  console.log(chalk.bold.cyan('\n🚀 Supabase Cloud Persistence Setup\n'));

  // Check if already configured
  if (isSupabaseConfigured()) {
    console.log(chalk.yellow('⚠️  Supabase is already configured in your environment.'));

    if (!options.yes) {
      const { reconfigure } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'reconfigure',
          message: 'Do you want to reconfigure?',
          default: false,
        },
      ]);

      if (!reconfigure) {
        console.log(chalk.gray('Keeping existing configuration.'));
        return;
      }
    }
  }

  // Gather configuration
  let url = options.url;
  let anonKey = options.anonKey;
  let serviceKey = options.serviceKey;
  let privacyLevel = 'private';
  let autoShare = false;
  let persistenceMode = 'hybrid';

  if (!options.yes) {
    console.log(chalk.gray('You can find these values in your Supabase project settings.\n'));

    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'url',
        message: 'Supabase Project URL:',
        default: url || process.env.SUPABASE_URL,
        validate: (input: string) => {
          if (!input) return 'URL is required';
          if (!input.startsWith('https://')) return 'URL must start with https://';
          if (!input.includes('supabase.co')) return 'URL should be a Supabase project URL';
          return true;
        },
      },
      {
        type: 'password',
        name: 'anonKey',
        message: 'Supabase Anon Key:',
        default: anonKey || process.env.SUPABASE_ANON_KEY,
        validate: (input: string) => {
          if (!input) return 'Anon key is required';
          if (input.length < 30) return 'Invalid key format';
          return true;
        },
      },
      {
        type: 'password',
        name: 'serviceKey',
        message: 'Supabase Service Role Key (optional, for admin):',
        default: serviceKey || process.env.SUPABASE_SERVICE_ROLE_KEY,
      },
      {
        type: 'list',
        name: 'persistenceMode',
        message: 'Persistence mode:',
        choices: [
          {
            name: 'Hybrid (recommended) - Local-first with cloud sync',
            value: 'hybrid',
          },
          {
            name: 'Supabase only - Cloud-only persistence',
            value: 'supabase',
          },
          {
            name: 'SQLite only - Local persistence (no cloud)',
            value: 'sqlite',
          },
        ],
        default: 'hybrid',
      },
      {
        type: 'list',
        name: 'privacyLevel',
        message: 'Default privacy level for learnings:',
        choices: [
          {
            name: 'Private - Only visible to you',
            value: 'private',
          },
          {
            name: 'Team - Visible to team members',
            value: 'team',
          },
          {
            name: 'Public - Visible to everyone',
            value: 'public',
          },
        ],
        default: 'private',
      },
      {
        type: 'confirm',
        name: 'autoShare',
        message: 'Automatically share successful patterns?',
        default: false,
      },
    ]);

    url = answers.url;
    anonKey = answers.anonKey;
    serviceKey = answers.serviceKey;
    privacyLevel = answers.privacyLevel;
    autoShare = answers.autoShare;
    persistenceMode = answers.persistenceMode;
  }

  // Validate configuration
  const spinner = ora('Validating configuration...').start();

  try {
    const config = buildSupabaseConfig({
      connection: {
        url: url!,
        anonKey: anonKey!,
        serviceRoleKey: serviceKey,
      },
      sharing: {
        defaultPrivacyLevel: privacyLevel as 'private' | 'team' | 'public',
        autoShare,
        autoImport: false,
      },
    });

    spinner.succeed('Configuration validated');

    // Test connection
    spinner.start('Testing connection...');

    const provider = new SupabasePersistenceProvider({
      connection: config.connection,
    });
    await provider.initialize();
    await provider.shutdown();

    spinner.succeed('Connection successful');

    // Write environment file
    spinner.start('Writing configuration...');

    const envContent = generateEnvContent({
      url: url!,
      anonKey: anonKey!,
      serviceKey,
      persistenceMode,
      privacyLevel,
      autoShare,
    });

    const envPath = path.join(process.cwd(), '.env.supabase');
    await fs.writeFile(envPath, envContent);

    spinner.succeed(`Configuration written to ${chalk.cyan('.env.supabase')}`);

    // Show next steps
    console.log(chalk.bold.green('\n✅ Supabase setup complete!\n'));

    console.log(chalk.yellow('Next steps:'));
    console.log(chalk.gray('1. Add these variables to your environment or .env file:'));
    console.log(chalk.cyan(`   source .env.supabase`));
    console.log(chalk.gray('2. Run the schema SQL on your Supabase project:'));
    console.log(chalk.cyan(`   aqe supabase schema --output supabase-schema.sql`));
    console.log(chalk.gray('3. Verify your setup:'));
    console.log(chalk.cyan(`   aqe supabase status`));
    console.log('');

  } catch (error) {
    spinner.fail('Configuration failed');
    console.error(chalk.red(`Error: ${error instanceof Error ? error.message : error}`));
    process.exit(1);
  }
}

/**
 * Check Supabase connection status
 */
async function runSupabaseStatus(): Promise<void> {
  console.log(chalk.bold.cyan('\n📊 Supabase Status\n'));

  // Check environment
  const isConfigured = isSupabaseConfigured();
  const provider = getConfiguredProvider();

  console.log(chalk.bold('Configuration:'));
  console.log(`  Provider: ${chalk.cyan(provider)}`);
  console.log(`  Supabase URL: ${process.env.SUPABASE_URL ? chalk.green('✓ Set') : chalk.red('✗ Not set')}`);
  console.log(`  Anon Key: ${process.env.SUPABASE_ANON_KEY ? chalk.green('✓ Set') : chalk.red('✗ Not set')}`);
  console.log(`  Service Key: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? chalk.green('✓ Set') : chalk.gray('○ Optional')}`);
  console.log('');

  if (!isConfigured) {
    console.log(chalk.yellow('⚠️  Supabase is not configured. Run `aqe supabase init` to set up.'));
    return;
  }

  // Test connection
  const spinner = ora('Testing connection...').start();

  try {
    const config = buildSupabaseConfig();
    const testProvider = new SupabasePersistenceProvider({
      connection: config.connection,
    });

    await testProvider.initialize();
    const info = testProvider.getProviderInfo();
    await testProvider.shutdown();

    spinner.succeed('Connection successful');

    console.log(chalk.bold('\nProvider Info:'));
    console.log(`  Type: ${chalk.cyan(info.type)}`);
    console.log(`  Location: ${chalk.gray(info.location || 'N/A')}`);
    console.log(`  Features: ${chalk.gray(info.features.join(', '))}`);

    if (info.stats) {
      console.log(chalk.bold('\nStatistics:'));
      if (info.stats.agentCount !== undefined) {
        console.log(`  Agents: ${info.stats.agentCount}`);
      }
      if (info.stats.lastSyncTime) {
        console.log(`  Last Sync: ${info.stats.lastSyncTime.toISOString()}`);
      }
    }

  } catch (error) {
    spinner.fail('Connection failed');
    console.error(chalk.red(`Error: ${error instanceof Error ? error.message : error}`));
  }

  console.log('');
}

/**
 * Sync options interface
 */
interface SyncOptions {
  direction: 'push' | 'pull' | 'both';
  type: 'all' | 'memory' | 'code' | 'experiences' | 'patterns';
  partition?: string;
  project?: string;
  dryRun?: boolean;
  migrate?: boolean;
}

/**
 * Force sync data to/from cloud
 */
async function runSupabaseSync(options: SyncOptions): Promise<void> {
  // Handle migration mode
  if (options.migrate) {
    await runSupabaseMigrate(options.dryRun);
    return;
  }

  console.log(chalk.bold.cyan('\n🔄 Syncing with Supabase...\n'));

  if (!isSupabaseConfigured()) {
    console.log(chalk.red('❌ Supabase is not configured. Run `aqe supabase init` first.'));
    process.exit(1);
  }

  console.log(chalk.gray(`Direction: ${options.direction}`));
  console.log(chalk.gray(`Type: ${options.type}`));
  if (options.partition) console.log(chalk.gray(`Partition: ${options.partition}`));
  if (options.project) console.log(chalk.gray(`Project: ${options.project}`));
  if (options.dryRun) console.log(chalk.yellow('(Dry run - no changes will be made)\n'));
  console.log('');

  const spinner = ora('Initializing sync...').start();

  try {
    // Build configuration
    const config = buildSupabaseConfig();
    const dbDir = path.join(process.cwd(), '.agentic-qe');

    // Create hybrid provider for sync
    spinner.text = 'Creating hybrid provider...';
    const provider = createHybridPersistenceProvider({
      localDbPath: path.join(dbDir, 'aqe-telemetry.db'),
      supabaseConfig: {
        connection: {
          url: config.connection.url,
          anonKey: config.connection.anonKey,
          serviceRoleKey: config.connection.serviceRoleKey,
        },
        sync: config.sync,
      },
      syncConfig: {
        syncInterval: 0, // Disable automatic sync for manual mode
        batchSize: config.sync.batchSize,
        conflictResolution: config.sync.conflictResolution,
        retryAttempts: config.sync.retryAttempts,
        retryDelay: config.sync.retryDelay,
        backgroundSync: false,
      },
      autoSync: false,
    });

    await provider.initialize();
    spinner.succeed('Provider initialized');

    const results: { type: string; synced: number; failed: number }[] = [];

    // Sync based on direction and type
    if (options.direction === 'push' || options.direction === 'both') {
      spinner.start('Pushing local data to cloud...');

      if (!options.dryRun) {
        // Get sync queue status
        const stats = provider.getSyncStats();
        spinner.text = `Syncing ${stats.pendingOperations} pending operations...`;

        // Force sync
        const syncResult = await provider.forceSyncNow();
        results.push({
          type: 'push',
          synced: syncResult.synced,
          failed: syncResult.failed,
        });

        spinner.succeed(`Push complete: ${syncResult.synced} synced, ${syncResult.failed} failed`);
      } else {
        const stats = provider.getSyncStats();
        spinner.info(`Would push ${stats.pendingOperations} pending operations`);
      }
    }

    if (options.direction === 'pull' || options.direction === 'both') {
      spinner.start('Pulling data from cloud...');

      if (!options.dryRun) {
        let pulled = 0;

        // Pull based on type
        if (options.type === 'all' || options.type === 'experiences') {
          spinner.text = 'Pulling experiences...';
          const experiences = await provider.importSharedExperiences?.({
            limit: 1000,
          });
          pulled += experiences?.length ?? 0;
        }

        if (options.type === 'all' || options.type === 'patterns') {
          spinner.text = 'Pulling patterns...';
          const patterns = await provider.queryPatterns?.({
            limit: 1000,
          });
          pulled += patterns?.length ?? 0;
        }

        results.push({ type: 'pull', synced: pulled, failed: 0 });
        spinner.succeed(`Pull complete: ${pulled} items retrieved`);
      } else {
        spinner.info('Would pull experiences and patterns from cloud');
      }
    }

    await provider.shutdown();

    // Summary
    console.log(chalk.bold.green('\n✅ Sync complete!\n'));

    console.log(chalk.bold('Summary:'));
    for (const result of results) {
      const status = result.failed > 0 ? chalk.yellow('⚠') : chalk.green('✓');
      console.log(`  ${status} ${result.type}: ${result.synced} synced, ${result.failed} failed`);
    }

    if (options.dryRun) {
      console.log(chalk.yellow('\n(Dry run - no actual changes were made)'));
    }

  } catch (error) {
    spinner.fail('Sync failed');
    console.error(chalk.red(`\nError: ${error instanceof Error ? error.message : error}`));

    if (error instanceof Error && error.message.includes('database')) {
      console.log(chalk.yellow('\nHint: Make sure the .agentic-qe directory exists and contains valid databases.'));
    }

    process.exit(1);
  }
}

/**
 * Migrate existing local data to Supabase
 */
async function runSupabaseMigrate(dryRun?: boolean): Promise<void> {
  console.log(chalk.bold.cyan('\n📦 Migrating local data to Supabase...\n'));

  if (!isSupabaseConfigured()) {
    console.log(chalk.red('❌ Supabase is not configured. Run `aqe supabase init` first.'));
    process.exit(1);
  }

  const dbDir = path.join(process.cwd(), '.agentic-qe');
  const memoryDbPath = path.join(dbDir, 'memory.db');

  // Check if memory.db exists
  if (!fs.existsSync(memoryDbPath)) {
    console.log(chalk.yellow('⚠️  No local memory.db found. Nothing to migrate.'));
    return;
  }

  if (dryRun) {
    console.log(chalk.yellow('(Dry run - showing what would be migrated)\n'));

    // Count local data
    const Database = (await import('better-sqlite3')).default;
    const db = new Database(memoryDbPath, { readonly: true });

    const expCount = (db.prepare('SELECT COUNT(*) as count FROM learning_experiences').get() as any)?.count || 0;
    const memCount = (db.prepare('SELECT COUNT(*) as count FROM memory_entries').get() as any)?.count || 0;
    const patCount = (db.prepare('SELECT COUNT(*) as count FROM patterns').get() as any)?.count || 0;

    db.close();

    console.log(chalk.bold('Would migrate:'));
    console.log(`  📚 Learning experiences: ${chalk.cyan(expCount)}`);
    console.log(`  💾 Memory entries: ${chalk.cyan(memCount)} (first 2000)`);
    console.log(`  🎯 Patterns: ${chalk.cyan(patCount)} (first 500)`);
    return;
  }

  const spinner = ora('Initializing migration...').start();

  try {
    const config = buildSupabaseConfig();

    // Create hybrid provider
    const provider = createHybridPersistenceProvider({
      localDbPath: path.join(dbDir, 'aqe-telemetry.db'),
      supabaseConfig: {
        connection: {
          url: config.connection.url,
          anonKey: config.connection.anonKey,
          serviceRoleKey: config.connection.serviceRoleKey,
        },
        sync: config.sync,
      },
      syncConfig: {
        syncInterval: 0,
        batchSize: 100,
        conflictResolution: 'remote',
        retryAttempts: 3,
        retryDelay: 1000,
        backgroundSync: false,
      },
      autoSync: false,
    });

    await provider.initialize();
    spinner.succeed('Provider initialized');

    // Run migration
    spinner.start('Migrating data...');
    const results = await provider.migrateLocalToCloud(memoryDbPath, {
      batchSize: 50,
      onProgress: (msg) => {
        spinner.text = msg;
      },
    });

    await provider.shutdown();

    spinner.succeed('Migration complete');

    // Summary
    console.log(chalk.bold.green('\n✅ Migration complete!\n'));

    console.log(chalk.bold('Summary:'));
    console.log(`  ${chalk.green('✓')} Learning experiences: ${results.experiences}`);
    console.log(`  ${chalk.green('✓')} Memory entries: ${results.memories}`);
    console.log(`  ${chalk.green('✓')} Patterns: ${results.patterns}`);
    console.log(`  ${chalk.green('✓')} Events: ${results.events}`);
    if (results.failed > 0) {
      console.log(`  ${chalk.yellow('⚠')} Failed: ${results.failed}`);
    }

  } catch (error) {
    spinner.fail('Migration failed');
    console.error(chalk.red(`\nError: ${error instanceof Error ? error.message : error}`));
    process.exit(1);
  }
}

/**
 * Display SQL schema for manual setup
 */
async function runSupabaseSchema(options: { output?: string }): Promise<void> {
  const schemaPath = path.join(__dirname, '../../../../scripts/supabase-schema.sql');

  try {
    const schema = await fs.readFile(schemaPath, 'utf8');

    if (options.output) {
      await fs.writeFile(options.output, schema);
      console.log(chalk.green(`✅ Schema written to ${chalk.cyan(options.output)}`));
      console.log(chalk.gray('\nRun this SQL in your Supabase SQL Editor to create the tables.'));
    } else {
      console.log(chalk.bold.cyan('\n📋 Supabase Schema\n'));
      console.log(chalk.gray('Copy and run this SQL in your Supabase SQL Editor:\n'));
      console.log(schema);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      console.log(chalk.red('❌ Schema file not found.'));
      console.log(chalk.gray('The schema file should be at: scripts/supabase-schema.sql'));
    } else {
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : error}`));
    }
    process.exit(1);
  }
}

/**
 * Test Supabase connection
 */
async function runSupabaseTest(): Promise<void> {
  console.log(chalk.bold.cyan('\n🧪 Testing Supabase Connection...\n'));

  if (!isSupabaseConfigured()) {
    console.log(chalk.red('❌ Supabase is not configured. Run `aqe supabase init` first.'));
    process.exit(1);
  }

  const spinner = ora('Connecting...').start();

  try {
    const config = buildSupabaseConfig();

    spinner.text = 'Initializing provider...';
    const provider = new SupabasePersistenceProvider({
      connection: config.connection,
    });

    await provider.initialize();
    spinner.succeed('Connected successfully');

    // Try a simple operation
    spinner.start('Testing data operations...');
    const agents = await provider.listAgentsWithState();
    spinner.succeed(`Found ${agents.length} agents with state`);

    await provider.shutdown();

    console.log(chalk.green('\n✅ All tests passed!'));
  } catch (error) {
    spinner.fail('Test failed');
    console.error(chalk.red(`\nError: ${error instanceof Error ? error.message : error}`));

    if (error instanceof Error && error.message.includes('Invalid API key')) {
      console.log(chalk.yellow('\nHint: Check that your SUPABASE_ANON_KEY is correct.'));
    } else if (error instanceof Error && error.message.includes('fetch failed')) {
      console.log(chalk.yellow('\nHint: Check that your SUPABASE_URL is correct and reachable.'));
    }

    process.exit(1);
  }
}

/**
 * Generate .env file content
 */
function generateEnvContent(config: {
  url: string;
  anonKey: string;
  serviceKey?: string;
  persistenceMode: string;
  privacyLevel: string;
  autoShare: boolean;
}): string {
  const lines = [
    '# Supabase Configuration for Agentic QE',
    '# Generated by: aqe supabase init',
    `# Date: ${new Date().toISOString()}`,
    '',
    '# Supabase Connection',
    `export ${SUPABASE_ENV_VARS.URL}="${config.url}"`,
    `export ${SUPABASE_ENV_VARS.ANON_KEY}="${config.anonKey}"`,
  ];

  if (config.serviceKey) {
    lines.push(`export ${SUPABASE_ENV_VARS.SERVICE_ROLE_KEY}="${config.serviceKey}"`);
  }

  lines.push(
    '',
    '# Persistence Settings',
    `export ${SUPABASE_ENV_VARS.PROVIDER}="${config.persistenceMode}"`,
    `export ${SUPABASE_ENV_VARS.DEFAULT_PRIVACY}="${config.privacyLevel}"`,
    `export ${SUPABASE_ENV_VARS.AUTO_SHARE}="${config.autoShare}"`,
    ''
  );

  return lines.join('\n');
}

// Export for use in main CLI
export default createSupabaseCommand;
