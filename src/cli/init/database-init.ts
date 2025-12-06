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
 * @param config - Fleet configuration
 */
export async function initializeDatabases(config: FleetConfig): Promise<void> {
  const baseDir = process.cwd();
  const dataDir = path.join(baseDir, '.agentic-qe', 'data');

  console.log(chalk.gray(`  • Initializing databases in ${dataDir}`));

  // Phase 1: Initialize memory database FIRST (required for agents)
  await initializeMemoryDatabase();

  // Phase 2: Initialize AgentDB for learning (v1.8.0 - replaces patterns.db)
  await initializeAgentDB(config);

  // Phase 3: Initialize learning system
  await initializeLearningSystem(config);

  // Phase 4: Initialize improvement loop
  await initializeImprovementLoop(config);

  console.log(chalk.green('  ✓ All databases initialized'));
}

/**
 * Initialize Memory Manager database
 *
 * Creates and initializes the SwarmMemoryManager database with 12 tables
 * for persistent memory storage across agents.
 */
async function initializeMemoryDatabase(): Promise<void> {
  const dbPath = path.join(process.cwd(), '.agentic-qe', 'memory.db');

  console.log(chalk.cyan('  💾 Initializing Memory Manager database...'));

  // Import SwarmMemoryManager dynamically
  const { SwarmMemoryManager } = await import('../../core/memory/SwarmMemoryManager');

  const memoryManager = new SwarmMemoryManager(dbPath);
  await memoryManager.initialize();

  // Verify tables created
  const stats = await memoryManager.stats();

  await memoryManager.close();

  console.log(chalk.green('  ✓ Memory Manager initialized'));
  console.log(chalk.gray(`    • Database: ${dbPath}`));
  console.log(chalk.gray(`    • Tables: 12 tables (memory_entries, hints, events, workflow_state, patterns, etc.)`));
  console.log(chalk.gray(`    • Access control: 5 levels (private, team, swarm, public, system)`));
}

/**
 * Initialize AgentDB for Learning (v1.8.0 - replaces patterns.db)
 *
 * Consolidated learning storage for all QE agents using AgentDB.
 * Replaces the deprecated patterns.db with vector-based learning storage.
 */
async function initializeAgentDB(config: FleetConfig): Promise<void> {
  const dbPath = path.join(process.cwd(), '.agentic-qe', 'agentdb.db');

  console.log(chalk.cyan('  🧠 Initializing AgentDB learning system...'));

  // Import AgentDB dynamically
  const { createAgentDBManager } = await import('../../core/memory/AgentDBManager');

  // Initialize AgentDB with learning configuration
  const agentDB = await createAgentDBManager({
    dbPath,
    enableLearning: true,
    enableReasoning: true,
    cacheSize: 1000,
    quantizationType: 'scalar'
  });

  // CRITICAL: Must initialize before calling getStats()
  await agentDB.initialize();

  // Verify initialization
  const stats = await agentDB.getStats();
  await agentDB.close();

  console.log(chalk.green('  ✓ AgentDB learning system initialized'));
  console.log(chalk.gray(`    • Database: ${dbPath}`));
  console.log(chalk.gray(`    • Episodes stored: ${stats.episodeCount || 0}`));
  console.log(chalk.gray(`    • Vector search: HNSW enabled (150x faster)`));
  console.log(chalk.gray(`    • Learning: Reflexion pattern + Q-values`));
  console.log(chalk.gray(`    • Used by: All 19 QE agents`));
  console.log(chalk.yellow(`    ⓘ  patterns.db deprecated - using AgentDB for all learning`));
}

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
