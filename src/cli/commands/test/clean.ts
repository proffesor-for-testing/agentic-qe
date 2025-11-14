import { Command } from 'commander';
import chalk from 'chalk';
import { promises as fs } from 'fs';
import * as path from 'path';

interface CleanOptions {
  coverage: boolean;
  snapshots: boolean;
  cache: boolean;
  dryRun: boolean;
  showSize: boolean;
}

export function createCleanCommand(): Command {
  const command = new Command('clean');

  command
    .description('Clean test artifacts and temporary files')
    .option('--coverage', 'Clean coverage reports only', false)
    .option('--snapshots', 'Clean snapshot files only', false)
    .option('--cache', 'Clean test cache only', false)
    .option('--dry-run', 'Show what would be cleaned without deleting', false)
    .option('--show-size', 'Show size of files to be cleaned', false)
    .action(async (options: CleanOptions) => {
      console.log(chalk.bold('Cleaning test artifacts...\n'));

      const artifacts = getArtifactPaths(options);
      let totalSize = 0;

      for (const artifact of artifacts) {
        // Check if artifact exists (async)
        let exists = false;
        try {
          await fs.access(artifact.path);
          exists = true;
        } catch {
          exists = false;
        }

        const size = exists ? await getDirectorySize(artifact.path) : 0;

        if (exists) {
          totalSize += size;

          if (options.dryRun) {
            console.log(chalk.yellow(`Would clean: ${artifact.name}`));
          } else {
            await fs.rm(artifact.path, { recursive: true, force: true });
            console.log(chalk.green(`✓ Cleaned: ${artifact.name}`));
          }

          if (options.showSize) {
            console.log(chalk.gray(`  Size: ${formatSize(size)}`));
          }
        } else {
          console.log(chalk.gray(`⊘ Not found: ${artifact.name}`));
        }
      }

      console.log(chalk.bold(`\nTotal ${options.dryRun ? 'would clean' : 'cleaned'}: ${formatSize(totalSize)}`));
    });

  return command;
}

function getArtifactPaths(options: CleanOptions): Array<{ name: string; path: string }> {
  const artifacts: Array<{ name: string; path: string }> = [];

  if (!options.coverage && !options.snapshots && !options.cache) {
    // Clean all if no specific option
    artifacts.push(
      { name: 'Coverage reports', path: path.join(process.cwd(), 'coverage') },
      { name: 'Snapshots', path: path.join(process.cwd(), '__snapshots__') },
      { name: 'Test cache', path: path.join(process.cwd(), '.vitest') },
      { name: 'Test results', path: path.join(process.cwd(), 'test-results') },
      { name: 'Temp files', path: path.join(process.cwd(), '.tmp-test') }
    );
  } else {
    if (options.coverage) {
      artifacts.push({ name: 'Coverage reports', path: path.join(process.cwd(), 'coverage') });
    }
    if (options.snapshots) {
      artifacts.push({ name: 'Snapshots', path: path.join(process.cwd(), '__snapshots__') });
    }
    if (options.cache) {
      artifacts.push({ name: 'Test cache', path: path.join(process.cwd(), '.vitest') });
    }
  }

  return artifacts;
}

async function getDirectorySize(dirPath: string): Promise<number> {
  let size = 0;

  try {
    // Check if path exists (async)
    let exists = false;
    try {
      await fs.access(dirPath);
      exists = true;
    } catch {
      exists = false;
    }

    if (exists) {
      const stats = await fs.stat(dirPath);

      if (stats.isFile()) {
        size = stats.size;
      } else if (stats.isDirectory()) {
        const files = await fs.readdir(dirPath);
        for (const file of files) {
          size += await getDirectorySize(path.join(dirPath, file));
        }
      }
    }
  } catch (error) {
    // Ignore errors
  }

  return size;
}

function formatSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`;
}
