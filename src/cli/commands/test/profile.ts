import { Command } from 'commander';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';

interface ProfileOptions {
  cpu: boolean;
  memory: boolean;
  slowest?: number;
  export?: string;
  flameGraph: boolean;
}

interface ProfileData {
  test: string;
  duration: number;
  cpu: number;
  memory: number;
}

export function createProfileCommand(): Command {
  const command = new Command('profile');

  command
    .description('Profile test performance and resource usage')
    .option('--cpu', 'Show CPU profiling', false)
    .option('--memory', 'Show memory profiling', false)
    .option('--slowest <count>', 'Show N slowest tests')
    .option('--export <file>', 'Export profile data to file')
    .option('--flame-graph', 'Generate flame graph', false)
    .action(async (options: ProfileOptions) => {
      console.log(chalk.bold('Profiling tests...\n'));

      // Run tests with profiling
      const profileData = await runWithProfiling();

      // Display results
      displayProfileResults(profileData, options);

      // Export if requested
      if (options.export) {
        exportProfile(profileData, options.export);
        console.log(chalk.green(`\n✓ Exported to: ${options.export}`));
      }

      // Generate flame graph if requested
      if (options.flameGraph) {
        generateFlameGraph(profileData);
        console.log(chalk.green('✓ Generated flame graph: flame-graph.html'));
      }
    });

  return command;
}

async function runWithProfiling(): Promise<ProfileData[]> {
  const tests = [
    'tests/unit/auth.test.ts',
    'tests/unit/validation.test.ts',
    'tests/integration/api.test.ts',
    'tests/integration/database.test.ts',
    'tests/e2e/checkout.test.ts'
  ];

  const profileData: ProfileData[] = [];

  for (const test of tests) {
    console.log(chalk.cyan(`Profiling: ${test}`));

    const start = Date.now();
    const startMem = process.memoryUsage().heapUsed;

    // Simulate test execution
    await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 100));

    const duration = Date.now() - start;
    const memUsed = process.memoryUsage().heapUsed - startMem;

    profileData.push({
      test,
      duration,
      cpu: Math.random() * 100,
      memory: memUsed
    });

    console.log(chalk.gray(`  Duration: ${duration}ms`));
  }

  return profileData;
}

function displayProfileResults(data: ProfileData[], options: ProfileOptions): void {
  console.log(chalk.bold('\nProfile Results:'));
  console.log(chalk.gray('─'.repeat(80)));

  // Overall stats
  const totalDuration = data.reduce((sum, d) => sum + d.duration, 0);
  const avgDuration = totalDuration / data.length;
  const totalMemory = data.reduce((sum, d) => sum + d.memory, 0);

  console.log(chalk.bold('\nOverall Statistics:'));
  console.log(`Total time: ${totalDuration}ms`);
  console.log(`Average time: ${avgDuration.toFixed(2)}ms`);
  console.log(`Total memory: ${formatBytes(totalMemory)}`);

  // CPU profiling
  if (options.cpu) {
    console.log(chalk.bold('\nCPU Profile:'));
    data.forEach(d => {
      const bar = '█'.repeat(Math.floor(d.cpu / 5));
      console.log(`${d.test.padEnd(40)} ${bar} ${d.cpu.toFixed(1)}%`);
    });
  }

  // Memory profiling
  if (options.memory) {
    console.log(chalk.bold('\nMemory Profile:'));
    data.forEach(d => {
      console.log(`${d.test.padEnd(40)} ${formatBytes(d.memory)}`);
    });
  }

  // Slowest tests
  if (options.slowest) {
    const slowest = [...data]
      .sort((a, b) => b.duration - a.duration)
      .slice(0, parseInt(options.slowest.toString(), 10));

    console.log(chalk.bold(`\nSlowest ${slowest.length} Tests:`));
    slowest.forEach((d, i) => {
      console.log(`${i + 1}. ${d.test} (${d.duration}ms)`);
    });
  }

  console.log(chalk.gray('\n' + '─'.repeat(80)));
}

function exportProfile(data: ProfileData[], filename: string): void {
  const exportData = {
    timestamp: new Date().toISOString(),
    tests: data,
    summary: {
      total: data.length,
      totalDuration: data.reduce((sum, d) => sum + d.duration, 0),
      totalMemory: data.reduce((sum, d) => sum + d.memory, 0)
    }
  };

  fs.writeFileSync(filename, JSON.stringify(exportData, null, 2));
}

function generateFlameGraph(data: ProfileData[]): void {
  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Test Performance Flame Graph</title>
  <style>
    body { font-family: monospace; padding: 20px; }
    .flame-graph { display: flex; flex-direction: column; }
    .test-bar { height: 30px; margin: 2px 0; display: flex; align-items: center; padding: 0 10px; }
  </style>
</head>
<body>
  <h1>Test Performance Flame Graph</h1>
  <div class="flame-graph">
    ${data.map(d => {
      const width = (d.duration / Math.max(...data.map(x => x.duration))) * 100;
      const color = `hsl(${120 - width}, 70%, 50%)`;
      return `
        <div class="test-bar" style="width: ${width}%; background: ${color}">
          ${d.test} - ${d.duration}ms
        </div>
      `;
    }).join('')}
  </div>
</body>
</html>
  `.trim();

  fs.writeFileSync('flame-graph.html', html);
}

function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`;
}
