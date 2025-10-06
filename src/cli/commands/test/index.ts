import { Command } from 'commander';
import { createRetryCommand } from './retry';
import { createParallelCommand } from './parallel';
import { createQueueCommand } from './queue';
import { createWatchCommand } from './watch';
import { createCleanCommand } from './clean';
import { createDebugCommand } from './debug';
import { createProfileCommand } from './profile';
import { createTraceCommand } from './trace';
import { createSnapshotCommand } from './snapshot';
import { createDiffCommand } from './diff';

/**
 * Create the main test command with all subcommands
 */
export function createTestCommand(): Command {
  const testCommand = new Command('test');

  testCommand.description('Advanced test execution and management commands');

  // Add all 10 test subcommands
  testCommand.addCommand(createRetryCommand());
  testCommand.addCommand(createParallelCommand());
  testCommand.addCommand(createQueueCommand());
  testCommand.addCommand(createWatchCommand());
  testCommand.addCommand(createCleanCommand());
  testCommand.addCommand(createDebugCommand());
  testCommand.addCommand(createProfileCommand());
  testCommand.addCommand(createTraceCommand());
  testCommand.addCommand(createSnapshotCommand());
  testCommand.addCommand(createDiffCommand());

  return testCommand;
}

// Export individual commands for testing
export {
  createRetryCommand,
  createParallelCommand,
  createQueueCommand,
  createWatchCommand,
  createCleanCommand,
  createDebugCommand,
  createProfileCommand,
  createTraceCommand,
  createSnapshotCommand,
  createDiffCommand
};
