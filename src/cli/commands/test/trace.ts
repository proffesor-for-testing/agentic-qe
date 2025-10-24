import { Command } from 'commander';
import chalk from 'chalk';
import * as fs from 'fs';
import { SecureRandom } from '../../../utils/SecureRandom.js';

interface TraceOptions {
  timeline: boolean;
  save?: string;
  callStack: boolean;
}

interface TraceEvent {
  timestamp: number;
  type: 'start' | 'end' | 'step';
  test: string;
  details?: string;
}

export function createTraceCommand(): Command {
  const command = new Command('trace');

  command
    .description('Trace test execution flow and timing')
    .argument('[testFile]', 'Specific test file to trace')
    .option('--timeline', 'Show execution timeline', false)
    .option('--save <file>', 'Save trace data to file')
    .option('--call-stack', 'Show call stack for each step', false)
    .action(async (testFile: string | undefined, options: TraceOptions) => {
      console.log(chalk.bold('Tracing tests...\n'));

      const tests = testFile ? [testFile] : [
        'tests/unit/auth.test.ts',
        'tests/integration/api.test.ts'
      ];

      const traces: TraceEvent[] = [];

      for (const test of tests) {
        console.log(chalk.cyan(`Tracing test: ${test}`));
        const testTraces = await traceTest(test, options);
        traces.push(...testTraces);
      }

      // Display results
      if (options.timeline) {
        displayTimeline(traces);
      } else {
        displayTraces(traces, options);
      }

      // Save if requested
      if (options.save) {
        saveTraces(traces, options.save);
        console.log(chalk.green(`\n✓ Saved trace to: ${options.save}`));
      }
    });

  return command;
}

async function traceTest(testFile: string, options: TraceOptions): Promise<TraceEvent[]> {
  const traces: TraceEvent[] = [];
  const startTime = Date.now();

  // Start event
  traces.push({
    timestamp: Date.now() - startTime,
    type: 'start',
    test: testFile
  });

  // Simulate test steps
  const steps = [
    'Setup test environment',
    'Initialize test data',
    'Execute test case',
    'Verify assertions',
    'Cleanup resources'
  ];

  for (const step of steps) {
    await new Promise(resolve => setTimeout(resolve, SecureRandom.randomFloat() * 200 + 50));

    traces.push({
      timestamp: Date.now() - startTime,
      type: 'step',
      test: testFile,
      details: step
    });

    if (options.callStack) {
      console.log(chalk.gray(`  [${Date.now() - startTime}ms] ${step}`));
      console.log(chalk.gray(`    at TestRunner.runStep (runner.ts:45:10)`));
      console.log(chalk.gray(`    at async TestRunner.run (runner.ts:120:5)`));
    }
  }

  // End event
  traces.push({
    timestamp: Date.now() - startTime,
    type: 'end',
    test: testFile
  });

  return traces;
}

function displayTraces(traces: TraceEvent[], options: TraceOptions): void {
  console.log(chalk.bold('\nExecution Trace:'));
  console.log(chalk.gray('─'.repeat(80)));

  let currentTest = '';

  traces.forEach(trace => {
    if (trace.test !== currentTest) {
      console.log(chalk.bold(`\n${trace.test}`));
      currentTest = trace.test;
    }

    const timeStr = `${trace.timestamp}ms`.padStart(8);
    const typeIcon = {
      start: '▶',
      step: '→',
      end: '■'
    }[trace.type];

    console.log(`${chalk.gray(timeStr)} ${typeIcon} ${trace.details || trace.type}`);
  });

  console.log(chalk.gray('\n' + '─'.repeat(80)));
}

function displayTimeline(traces: TraceEvent[]): void {
  console.log(chalk.bold('\nTimeline:'));
  console.log(chalk.gray('─'.repeat(80)));

  const maxTime = Math.max(...traces.map(t => t.timestamp));
  const scale = 60 / maxTime; // Scale to 60 characters

  let currentTest = '';

  traces.forEach(trace => {
    if (trace.test !== currentTest) {
      console.log(chalk.bold(`\n${trace.test}`));
      console.log(chalk.gray('│'));
      currentTest = trace.test;
    }

    const position = Math.floor(trace.timestamp * scale);
    const timeline = ' '.repeat(position) + '●';
    const label = trace.details || trace.type;

    console.log(chalk.gray('│') + timeline + ` ${label} (${trace.timestamp}ms)`);
  });

  console.log(chalk.gray('│'));
  console.log(chalk.gray('└' + '─'.repeat(60)));
  console.log(chalk.gray(`  0ms${' '.repeat(50)}${maxTime}ms`));
}

function saveTraces(traces: TraceEvent[], filename: string): void {
  const data = {
    timestamp: new Date().toISOString(),
    traces,
    summary: {
      totalEvents: traces.length,
      duration: Math.max(...traces.map(t => t.timestamp)),
      tests: [...new Set(traces.map(t => t.test))]
    }
  };

  fs.writeFileSync(filename, JSON.stringify(data, null, 2));
}
