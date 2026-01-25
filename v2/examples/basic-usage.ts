/**
 * Basic Usage Example - Agentic QE Fleet
 *
 * This example demonstrates how to initialize and use the AQE Fleet
 * for automated testing and quality assurance tasks.
 */

import { FleetManager } from '../src/core/FleetManager';
import { Task, TaskPriority } from '../src/core/Task';
import { Config } from '../src/utils/Config';
import { Logger } from '../src/utils/Logger';

async function basicUsageExample() {
  const logger = Logger.getInstance();

  try {
    logger.info('🚀 Starting Basic AQE Fleet Example');

    // 1. Load configuration
    const config = await Config.load();

    // 2. Create and initialize fleet manager
    const fleetManager = new FleetManager(config);
    await fleetManager.initialize();

    logger.info('✅ Fleet initialized successfully');

    // 3. Start the fleet
    await fleetManager.start();

    logger.info('✅ Fleet started successfully');

    // 4. Submit some test tasks
    const tasks = [
      new Task(
        'unit-test',
        'Run Unit Tests',
        {
          testPath: './tests/unit',
          framework: 'jest',
          pattern: '**/*.test.js'
        },
        {},
        TaskPriority.HIGH
      ),

      new Task(
        'code-analysis',
        'Analyze Code Quality',
        {
          sourcePath: './src',
          language: 'typescript'
        },
        {},
        TaskPriority.MEDIUM
      ),

      new Task(
        'security-scan',
        'Security Vulnerability Scan',
        {
          sourcePath: './src',
          depth: 'comprehensive'
        },
        {},
        TaskPriority.HIGH
      )
    ];

    // Submit tasks to the fleet
    for (const task of tasks) {
      await fleetManager.submitTask(task);
      logger.info(`📋 Submitted task: ${task.getName()} (${task.getId()})`);
    }

    // 5. Monitor fleet status
    const status = fleetManager.getStatus();
    logger.info('📊 Fleet Status:', {
      activeAgents: status.activeAgents,
      totalAgents: status.totalAgents,
      runningTasks: status.runningTasks,
      completedTasks: status.completedTasks
    });

    // 6. Wait for tasks to complete (in a real scenario, you'd use events)
    await new Promise(resolve => setTimeout(resolve, 10000));

    // 7. Check final status
    const finalStatus = fleetManager.getStatus();
    logger.info('📊 Final Fleet Status:', {
      completedTasks: finalStatus.completedTasks,
      failedTasks: finalStatus.failedTasks
    });

    // 8. Stop the fleet
    await fleetManager.stop();
    logger.info('🛑 Fleet stopped successfully');

  } catch (error) {
    logger.error('❌ Example failed:', error);
    process.exit(1);
  }
}

// Run the example
if (require.main === module) {
  basicUsageExample();
}