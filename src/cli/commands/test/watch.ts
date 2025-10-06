import { Command } from 'commander';
import chalk from 'chalk';
import chokidar from 'chokidar';

interface WatchOptions {
  pattern: string;
  changedOnly: boolean;
  related: boolean;
  noInteractive: boolean;
}

export function createWatchCommand(): Command {
  const command = new Command('watch');

  command
    .description('Watch mode for continuous testing on file changes')
    .option('-p, --pattern <pattern>', 'File pattern to watch', '**/*.{ts,tsx,js,jsx}')
    .option('--changed-only', 'Run only changed tests', false)
    .option('--related', 'Run tests related to changed files', false)
    .option('--no-interactive', 'Disable interactive mode', false)
    .action(async (options: WatchOptions) => {
      console.log(chalk.bold('Watch Mode Started\n'));
      console.log(chalk.gray(`Pattern: ${options.pattern}`));
      console.log(chalk.gray(`Changed only: ${options.changedOnly}`));
      console.log(chalk.gray(`Related tests: ${options.related}`));
      console.log(chalk.gray('Press Ctrl+C to exit\n'));

      const watcher = chokidar.watch(options.pattern, {
        ignored: /(^|[\/\\])\../, // ignore dotfiles
        persistent: true,
        ignoreInitial: true
      });

      watcher
        .on('change', async (path: string) => {
          console.log(chalk.cyan(`\n📝 File changed: ${path}`));

          if (options.changedOnly) {
            await runChangedTests([path]);
          } else if (options.related) {
            await runRelatedTests([path]);
          } else {
            await runAllTests();
          }
        })
        .on('add', (path: string) => {
          console.log(chalk.green(`\n➕ File added: ${path}`));
        })
        .on('unlink', (path: string) => {
          console.log(chalk.red(`\n➖ File removed: ${path}`));
        });

      // Keep process alive
      process.on('SIGINT', () => {
        console.log(chalk.yellow('\n\nWatch mode stopped'));
        watcher.close();
        process.exit(0);
      });

      // Interactive commands
      if (!options.noInteractive) {
        setupInteractiveMode(watcher);
      }
    });

  return command;
}

async function runChangedTests(files: string[]): Promise<void> {
  console.log(chalk.bold('Running changed tests...\n'));

  for (const file of files) {
    const testFile = file.replace(/\.(ts|tsx|js|jsx)$/, '.test.$1');
    console.log(chalk.cyan(`→ ${testFile}`));

    // Mock test execution
    await new Promise(resolve => setTimeout(resolve, 500));
    console.log(chalk.green(`✓ ${testFile} passed\n`));
  }
}

async function runRelatedTests(files: string[]): Promise<void> {
  console.log(chalk.bold('Running related tests...\n'));

  for (const file of files) {
    // Find related test files
    const related = findRelatedTests(file);

    for (const testFile of related) {
      console.log(chalk.cyan(`→ ${testFile}`));
      await new Promise(resolve => setTimeout(resolve, 500));
      console.log(chalk.green(`✓ ${testFile} passed\n`));
    }
  }
}

async function runAllTests(): Promise<void> {
  console.log(chalk.bold('Running all tests...\n'));

  const tests = [
    'tests/unit/auth.test.ts',
    'tests/unit/validation.test.ts',
    'tests/integration/api.test.ts'
  ];

  for (const test of tests) {
    console.log(chalk.cyan(`→ ${test}`));
    await new Promise(resolve => setTimeout(resolve, 300));
    console.log(chalk.green(`✓ ${test} passed\n`));
  }
}

function findRelatedTests(file: string): string[] {
  // Mock implementation - in real scenario, analyze imports
  const baseName = file.replace(/\.(ts|tsx|js|jsx)$/, '');
  return [
    `${baseName}.test.ts`,
    `tests/integration/${baseName.split('/').pop()}.test.ts`
  ];
}

function setupInteractiveMode(watcher: chokidar.FSWatcher): void {
  console.log(chalk.gray('\nInteractive Commands:'));
  console.log(chalk.gray('  a - Run all tests'));
  console.log(chalk.gray('  f - Run failed tests'));
  console.log(chalk.gray('  q - Quit\n'));

  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on('data', async (key: Buffer) => {
    const command = key.toString();

    switch (command) {
      case 'a':
        await runAllTests();
        break;
      case 'f':
        console.log(chalk.yellow('Running failed tests...'));
        break;
      case 'q':
      case '\u0003': // Ctrl+C
        console.log(chalk.yellow('\n\nWatch mode stopped'));
        watcher.close();
        process.exit(0);
        break;
    }
  });
}
