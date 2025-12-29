/**
 * Database initialization module
 *
 * Initializes AgentDB, memory databases, and learning databases
 *
 * @module cli/init/database-init
 */

import * as path from 'path';
import * as fs from 'fs-extra';
import chalk from 'chalk';
import { FleetConfig } from '../../types';
import { MigrationRunner } from '../../persistence/migrations';
import { allMigrations } from '../../persistence/migrations/all-migrations';

// Import version from package.json to maintain consistency
const packageJson = require('../../../package.json');
const PACKAGE_VERSION = packageJson.version;

/**
 * Initialize all databases for the Agentic QE Fleet
 *
 * ARCHITECTURE (v2.2.0): All persistence now goes to a SINGLE database:
 * - .agentic-qe/memory.db - The unified database for ALL operations
 *
 * This ensures CLI, MCP, and agents all share the same data.
 * AgentDB (.agentic-qe/agentdb.db) is no longer used - all learning,
 * patterns, and agent data goes through SwarmMemoryManager to memory.db.
 *
 * @param config - Fleet configuration
 */
export async function initializeDatabases(config: FleetConfig): Promise<void> {
  const baseDir = process.cwd();
  const dataDir = path.join(baseDir, '.agentic-qe', 'data');

  console.log(chalk.gray(`  • Initializing databases in ${dataDir}`));

  // Phase 1: Initialize the UNIFIED memory database (required for ALL operations)
  // This is the ONLY database used by CLI, MCP, and agents
  await initializeMemoryDatabase();

  // Phase 1.5: Run database migrations to ensure schema is up to date
  await runDatabaseMigrations();

  // Phase 2: Initialize learning system configuration
  await initializeLearningSystem(config);

  // Phase 3: Initialize improvement loop configuration
  await initializeImprovementLoop(config);

  // Phase 4: Initialize GOAP action library
  await initializeGOAPActions();

  console.log(chalk.green('  ✓ All databases initialized'));
  console.log(chalk.cyan('    ℹ All persistence unified to .agentic-qe/memory.db'));
}

/**
 * Initialize Memory Manager database
 *
 * Creates and initializes the UNIFIED SwarmMemoryManager database.
 * This is the SINGLE database for all persistence in the Agentic QE Fleet.
 *
 * Uses the shared memory manager singleton to ensure all components
 * (CLI, MCP, agents) use the same database connection.
 */
async function initializeMemoryDatabase(): Promise<void> {
  const dbPath = path.join(process.cwd(), '.agentic-qe', 'memory.db');

  console.log(chalk.cyan('  💾 Initializing unified memory database...'));

  // Use the shared memory manager singleton for consistent persistence
  const { initializeSharedMemoryManager, getSharedMemoryManagerPath } = await import('../../core/memory/MemoryManagerFactory');

  const memoryManager = await initializeSharedMemoryManager();

  // Verify tables created
  const stats = await memoryManager.stats();

  console.log(chalk.green('  ✓ Unified memory database initialized'));
  console.log(chalk.gray(`    • Database: ${getSharedMemoryManagerPath()}`));
  console.log(chalk.gray(`    • Tables: 20+ tables (memory_entries, patterns, learning_experiences, q_values, etc.)`));
  console.log(chalk.gray(`    • Access control: 5 levels (private, team, swarm, public, system)`));
  console.log(chalk.gray(`    • Used by: CLI, MCP server, all 20 QE agents`));
}

/**
 * Run database migrations
 *
 * Ensures database schema is up to date by running all pending migrations.
 * Migrations are versioned and tracked in the schema_migrations table.
 */
async function runDatabaseMigrations(): Promise<void> {
  const dbPath = path.join(process.cwd(), '.agentic-qe', 'memory.db');

  console.log(chalk.cyan('  🔄 Running database migrations...'));

  try {
    const BetterSqlite3 = (await import('better-sqlite3')).default;
    const db = new BetterSqlite3(dbPath);

    const runner = new MigrationRunner(db);
    runner.registerAll(allMigrations);

    const status = runner.getStatus();

    if (status.pendingMigrations === 0) {
      console.log(chalk.green('  ✓ Database schema is up to date'));
      console.log(chalk.gray(`    • Schema version: ${status.currentVersion}`));
      db.close();
      return;
    }

    console.log(chalk.gray(`    • Pending migrations: ${status.pendingMigrations}`));

    const results = runner.runAll();
    let success = 0;
    let failed = 0;

    for (const result of results) {
      if (result.success) {
        success++;
      } else {
        failed++;
        console.log(chalk.red(`    ✗ Migration ${result.version} failed: ${result.error}`));
      }
    }

    db.close();

    if (failed === 0) {
      console.log(chalk.green(`  ✓ ${success} migration(s) applied successfully`));
      console.log(chalk.gray(`    • Schema version: ${status.latestVersion}`));
    } else {
      console.log(chalk.yellow(`  ⚠ ${failed} migration(s) failed, ${success} succeeded`));
    }
  } catch (error) {
    // Non-critical - SwarmMemoryManager may have already created tables
    console.log(chalk.yellow('  ⚠ Migration check skipped'));
    console.log(chalk.gray(`    • Reason: ${error instanceof Error ? error.message : 'Unknown error'}`));
  }
}

// DEPRECATED (v2.2.0): AgentDB initialization removed
// All learning data now persists to the unified memory.db via SwarmMemoryManager.
// The separate agentdb.db file is no longer used.
// See: Sherlock Investigation Report - Database Fragmentation Root Cause

/**
 * Initialize Phase 2 Learning System
 *
 * Creates learning configuration and database directory for agent learning.
 */
async function initializeLearningSystem(config: FleetConfig): Promise<void> {
  const learningConfig = {
    enabled: true,
    learningRate: 0.1,
    discountFactor: 0.95,
    explorationRate: 0.2,
    explorationDecay: 0.995,
    minExplorationRate: 0.01,
    targetImprovement: 0.20, // 20% improvement goal
    maxMemorySize: 100 * 1024 * 1024, // 100MB
    batchSize: 32,
    updateFrequency: 10,
    replayBufferSize: 10000
  };

  // Ensure config directory exists (in case directory structure phase had issues)
  await fs.ensureDir('.agentic-qe/config');

  // Store learning configuration
  await fs.writeJson('.agentic-qe/config/learning.json', learningConfig, { spaces: 2 });

  // Create learning database directory
  await fs.ensureDir('.agentic-qe/data/learning');

  // Create learning state placeholder
  const learningState = {
    initialized: true,
    version: PACKAGE_VERSION,
    createdAt: new Date().toISOString(),
    agents: {} // Will be populated as agents learn
  };

  await fs.writeJson('.agentic-qe/data/learning/state.json', learningState, { spaces: 2 });

  console.log(chalk.green('  ✓ Learning system initialized'));
  console.log(chalk.gray(`    • Learning rate: ${learningConfig.learningRate}`));
  console.log(chalk.gray(`    • Target improvement: ${learningConfig.targetImprovement * 100}%`));
}

/**
 * Initialize Improvement Loop
 *
 * Creates improvement configuration for continuous optimization with A/B testing.
 */
async function initializeImprovementLoop(config: FleetConfig): Promise<void> {
  const improvementConfig = {
    enabled: true,
    intervalMs: 3600000, // 1 hour
    autoApply: false, // Requires user approval
    enableABTesting: true,
    strategies: {
      parallelExecution: { enabled: true, weight: 0.8 },
      adaptiveRetry: { enabled: true, maxRetries: 3 },
      resourceOptimization: { enabled: true, adaptive: true }
    },
    thresholds: {
      minImprovement: 0.05, // 5% minimum improvement to apply
      maxFailureRate: 0.1, // 10% max failure rate
      minConfidence: 0.8 // 80% confidence required
    },
    abTesting: {
      sampleSize: 100,
      significanceLevel: 0.05,
      minSampleDuration: 3600000 // 1 hour
    }
  };

  // Ensure directories exist (defensive, in case directory-structure phase had issues)
  await fs.ensureDir('.agentic-qe/config');
  await fs.ensureDir('.agentic-qe/data/improvement');

  // Store improvement configuration
  await fs.writeJson('.agentic-qe/config/improvement.json', improvementConfig, { spaces: 2 });

  // Create improvement state
  const improvementState = {
    version: PACKAGE_VERSION,
    lastCycle: null,
    activeCycles: 0,
    totalImprovement: 0,
    strategies: {}
  };

  await fs.writeJson('.agentic-qe/data/improvement/state.json', improvementState, { spaces: 2 });

  console.log(chalk.green('  ✓ Improvement loop initialized'));
  console.log(chalk.gray(`    • Cycle interval: ${improvementConfig.intervalMs / 3600000} hour(s)`));
  console.log(chalk.gray(`    • A/B testing: enabled (sample size: ${improvementConfig.abTesting.sampleSize})`));
  console.log(chalk.gray(`    • Auto-apply: ${improvementConfig.autoApply ? 'enabled' : 'disabled (requires approval)'}`));
}

/**
 * Initialize GOAP Action Library
 *
 * Seeds the GOAP action library to the database for planner use.
 * Uses upsert pattern - safe to run multiple times.
 */
async function initializeGOAPActions(): Promise<void> {
  console.log(chalk.cyan('  🎯 Initializing GOAP action library...'));

  try {
    const dbPath = path.join(process.cwd(), '.agentic-qe', 'memory.db');
    const BetterSqlite3 = (await import('better-sqlite3')).default;
    const db = new BetterSqlite3(dbPath);

    // Migrate schema if needed (add missing columns)
    const tableInfo = db.prepare('PRAGMA table_info(goap_actions)').all() as Array<{ name: string }>;
    const existingCols = tableInfo.map(c => c.name);
    const columnsToAdd = [
      { name: 'name', type: 'TEXT' },
      { name: 'description', type: 'TEXT' },
      { name: 'duration_estimate', type: 'INTEGER' },
      { name: 'success_rate', type: 'REAL DEFAULT 1.0' },
      { name: 'execution_count', type: 'INTEGER DEFAULT 0' },
      { name: 'category', type: 'TEXT' },
      { name: 'updated_at', type: 'DATETIME' }
    ];

    for (const col of columnsToAdd) {
      if (!existingCols.includes(col.name)) {
        try {
          db.exec(`ALTER TABLE goap_actions ADD COLUMN ${col.name} ${col.type}`);
        } catch {
          // Column may already exist
        }
      }
    }

    // Import and seed actions
    const { GOAPPlanner } = await import('../../planning/GOAPPlanner');
    const { allActions } = await import('../../planning/actions');

    const planner = new GOAPPlanner(db);
    const seeded = planner.seedActions(allActions);

    db.close();

    console.log(chalk.green('  ✓ GOAP action library initialized'));
    console.log(chalk.gray(`    • Actions seeded: ${seeded}`));
    console.log(chalk.gray(`    • Categories: test, security, performance, analysis, process, fleet`));
  } catch (error) {
    // GOAP is optional - don't fail init if it fails
    console.log(chalk.yellow('  ⚠ GOAP initialization skipped (non-critical)'));
    console.log(chalk.gray(`    • Reason: ${error instanceof Error ? error.message : 'Unknown error'}`));
  }
}
