/**
 * Agentic QE Fleet - AI-Driven Quality Engineering Platform
 *
 * @packageDocumentation
 *
 * The Agentic QE Fleet is a comprehensive quality engineering platform that provides
 * autonomous testing, quality analysis, and deployment readiness assessment through
 * a swarm of specialized AI agents.
 *
 * ## Features
 *
 * - **AI-Driven Test Generation**: Generate comprehensive test suites using Claude Sonnet 4.5
 * - **Parallel Test Execution**: Execute tests across multiple frameworks concurrently
 * - **Real-Time Coverage Analysis**: Detect coverage gaps with O(log n) sublinear algorithms
 * - **Intelligent Quality Gates**: AI-driven quality assessment and enforcement
 * - **Performance Testing**: Load testing and performance profiling with k6, JMeter, Gatling
 * - **Security Scanning**: Multi-layer security analysis (SAST, DAST, dependencies, containers)
 * - **Deployment Readiness**: Multi-factor deployment risk assessment
 * - **Production Intelligence**: Learn from production incidents and user behavior
 * - **Regression Risk Analysis**: Smart test selection based on code change impact
 * - **Flaky Test Detection**: Statistical analysis and auto-stabilization
 *
 * ## Installation
 *
 * ```bash
 * npm install agentic-qe
 * ```
 *
 * ## Quick Start
 *
 * ```typescript
 * import { FleetManager, Task, TaskPriority } from 'agentic-qe';
 *
 * // Initialize the fleet
 * const fleet = new FleetManager({
 *   agents: [
 *     { type: 'test-generator', count: 2 },
 *     { type: 'test-executor', count: 4 },
 *     { type: 'coverage-analyzer', count: 1 }
 *   ]
 * });
 *
 * await fleet.initialize();
 * await fleet.start();
 *
 * // Submit a task
 * const task = new Task(
 *   'test-generation',
 *   'Generate unit tests',
 *   { filePath: './src/services/UserService.ts' },
 *   {},
 *   TaskPriority.HIGH
 * );
 *
 * await fleet.submitTask(task);
 * ```
 *
 * ## Architecture
 *
 * The fleet uses a distributed agent architecture with:
 * - **Event-Driven Coordination**: Real-time agent communication via EventBus
 * - **Shared Memory**: Cross-agent knowledge sharing through MemoryManager
 * - **Sublinear Optimization**: O(log n) algorithms for scale
 * - **Fault Tolerance**: Automatic retry and recovery mechanisms
 *
 * @author AQE Development Team
 * @license MIT
 * @version 1.0.0
 */

import { FleetManager } from './core/FleetManager';
import { Logger } from './utils/Logger';
import { Config } from './utils/Config';

// ============================================================================
// Core Exports
// ============================================================================

/**
 * Core fleet management and coordination components
 * @module Core
 */
export * from './core/FleetManager';
export * from './core/Agent';
export * from './core/Task';
export * from './core/EventBus';
export * from './core/MemoryManager';

/**
 * All agent implementations and agent factory
 * @module Agents
 */
export * from './agents';

/**
 * Utility classes and helper functions
 * @module Utilities
 */
export * from './utils';

/**
 * Phase 2: Learning System (Milestone 2.2)
 * @module Learning
 */
export * from './learning';

/**
 * Phase 2: Reasoning Bank (Milestone 2.1)
 * @module Reasoning
 */
export * from './reasoning';

const logger = Logger.getInstance();

/**
 * Initialize and start the AQE Fleet
 */
async function startFleet(): Promise<void> {
  try {
    logger.info('🚀 Starting Agentic QE Fleet...');

    // Load configuration
    const config = await Config.load();

    // Initialize fleet manager
    const fleetManager = new FleetManager(config);

    // Start the fleet
    await fleetManager.initialize();
    await fleetManager.start();

    logger.info('✅ Agentic QE Fleet started successfully');

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('🛑 Shutting down Agentic QE Fleet...');
      await fleetManager.stop();
      process.exit(0);
    });

  } catch (error) {
    logger.error('❌ Failed to start Agentic QE Fleet:', error);
    process.exit(1);
  }
}

// Start the fleet if this file is run directly
if (require.main === module) {
  startFleet();
}