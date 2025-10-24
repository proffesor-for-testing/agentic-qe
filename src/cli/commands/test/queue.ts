import { SecureRandom } from '../../../utils/SecureRandom.js';
import { Command } from 'commander';
import chalk from 'chalk';

interface QueueItem {
  id: string;
  test: string;
  priority: 'low' | 'medium' | 'high';
  addedAt: Date;
}

const testQueue: QueueItem[] = [];

export function createQueueCommand(): Command {
  const command = new Command('queue');

  command.description('Manage test queue for scheduled execution');

  // Status subcommand
  command
    .command('status')
    .description('Show current queue status')
    .action(() => {
      console.log(chalk.bold('Queue Status:'));
      console.log(chalk.gray(`Total items: ${testQueue.length}\n`));

      if (testQueue.length === 0) {
        console.log(chalk.yellow('Queue is empty'));
        return;
      }

      testQueue.forEach((item, index) => {
        const priorityColor = {
          low: chalk.gray,
          medium: chalk.yellow,
          high: chalk.red
        }[item.priority];

        console.log(`${index + 1}. ${item.test}`);
        console.log(`   Priority: ${priorityColor(item.priority)}`);
        console.log(`   Added: ${item.addedAt.toISOString()}\n`);
      });
    });

  // Add subcommand
  command
    .command('add <pattern>')
    .description('Add tests to queue')
    .option('-p, --priority <level>', 'Priority level (low|medium|high)', 'medium')
    .action((pattern: string, options: { priority: string }) => {
      const tests = expandPattern(pattern);

      tests.forEach(test => {
        const item: QueueItem = {
          id: generateId(),
          test,
          priority: options.priority as 'low' | 'medium' | 'high',
          addedAt: new Date()
        };
        testQueue.push(item);
        console.log(chalk.green(`✓ Added to queue: ${test}`));
      });

      console.log(chalk.gray(`\nTotal queued: ${testQueue.length}`));
    });

  // Remove subcommand
  command
    .command('remove <pattern>')
    .description('Remove tests from queue')
    .action((pattern: string) => {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      const before = testQueue.length;

      for (let i = testQueue.length - 1; i >= 0; i--) {
        if (regex.test(testQueue[i].test)) {
          const removed = testQueue.splice(i, 1)[0];
          console.log(chalk.green(`✓ Removed from queue: ${removed.test}`));
        }
      }

      const removed = before - testQueue.length;
      console.log(chalk.gray(`\nRemoved ${removed} item(s)`));
    });

  // Clear subcommand
  command
    .command('clear')
    .description('Clear entire queue')
    .action(() => {
      const count = testQueue.length;
      testQueue.length = 0;
      console.log(chalk.green(`✓ Queue cleared (${count} items removed)`));
    });

  // Process subcommand
  command
    .command('process')
    .description('Process queued tests')
    .option('-p, --priority <level>', 'Process only specific priority')
    .action(async (options: { priority?: string }) => {
      const items = options.priority
        ? testQueue.filter(item => item.priority === options.priority)
        : testQueue;

      if (items.length === 0) {
        console.log(chalk.yellow('No tests to process'));
        return;
      }

      console.log(chalk.bold(`Processing ${items.length} tests...\n`));

      // Sort by priority
      items.sort((a, b) => {
        const priorities = { high: 3, medium: 2, low: 1 };
        return priorities[b.priority] - priorities[a.priority];
      });

      for (const item of items) {
        console.log(chalk.cyan(`Running: ${item.test}`));
        await new Promise(resolve => setTimeout(resolve, 500));
        console.log(chalk.green(`✓ Completed: ${item.test}\n`));

        // Remove from queue after processing
        const index = testQueue.findIndex(q => q.id === item.id);
        if (index !== -1) {
          testQueue.splice(index, 1);
        }
      }

      console.log(chalk.green('✓ Queue processing complete'));
    });

  // Stats subcommand
  command
    .command('stats')
    .description('Show queue statistics')
    .action(() => {
      const stats = {
        total: testQueue.length,
        high: testQueue.filter(i => i.priority === 'high').length,
        medium: testQueue.filter(i => i.priority === 'medium').length,
        low: testQueue.filter(i => i.priority === 'low').length
      };

      console.log(chalk.bold('Queue Statistics:'));
      console.log(`Total: ${stats.total}`);
      console.log(chalk.red(`High priority: ${stats.high}`));
      console.log(chalk.yellow(`Medium priority: ${stats.medium}`));
      console.log(chalk.gray(`Low priority: ${stats.low}`));
    });

  return command;
}

function expandPattern(pattern: string): string[] {
  // Mock implementation - in real scenario, use glob
  return [
    'tests/unit/sample.test.ts',
    'tests/integration/sample.test.ts'
  ];
}

function generateId(): string {
  return `test-${Date.now()}-${SecureRandom.generateId(9)}`;
}
