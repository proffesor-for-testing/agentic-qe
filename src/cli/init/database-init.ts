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

  // Phase 2: Initialize learning system configuration
  await initializeLearningSystem(config);

  // Phase 3: Initialize improvement loop configuration
  await initializeImprovementLoop(config);

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
  console.log(chalk.gray(`    • Used by: CLI, MCP server, all 19 QE agents`));
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
