/**
 * Trace Command
 * Traces test execution flow with timing and call stack
 */

import * as fs from 'fs';
import * as path from 'path';

export interface TraceOptions {
  testFile: string;
  includeCallStack?: boolean;
  measureTiming?: boolean;
  export?: 'json' | 'chrome-devtools';
  outputDir?: string;
  minDuration?: number;
  highlightSlow?: boolean;
}

export interface TraceStep {
  name: string;
  type: 'test' | 'beforeEach' | 'afterEach' | 'function' | 'async';
  startTime: number;
  endTime?: number;
  duration?: number;
  slow?: boolean;
  children?: TraceStep[];
  stackTrace?: string[];
}

export interface Trace {
  testFile: string;
  totalDuration: number;
  steps: TraceStep[];
  callStack?: string[];
}

export interface TraceResult {
  success: boolean;
  trace: Trace;
  exportPath?: string;
  error?: string;
}

/**
 * Trace test execution flow
 */
export async function traceExecution(options: TraceOptions): Promise<TraceResult> {
  try {
    const startTime = Date.now();
    const steps: TraceStep[] = [];

    // Simulate tracing test execution
    // In real implementation, this would hook into the test runner
    steps.push(await traceTestSetup(options));
    steps.push(await traceTestExecution(options));
    steps.push(await traceTestTeardown(options));

    // Filter by minimum duration if specified
    let filteredSteps = steps;
    if (options.minDuration !== undefined) {
      filteredSteps = filterStepsByDuration(steps, options.minDuration);
    }

    // Highlight slow operations if requested
    if (options.highlightSlow) {
      markSlowSteps(filteredSteps);
    }

    const totalDuration = Date.now() - startTime;

    const trace: Trace = {
      testFile: options.testFile,
      totalDuration,
      steps: filteredSteps,
    };

    // Include call stack if requested
    if (options.includeCallStack) {
      trace.callStack = captureCallStack();
    }

    // Export trace if requested
    let exportPath: string | undefined;
    if (options.export) {
      const outputDir = options.outputDir || path.join(process.cwd(), '.swarm', 'reports');
      fs.mkdirSync(outputDir, { recursive: true });

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

      if (options.export === 'json') {
        exportPath = path.join(outputDir, `trace-${timestamp}.json`);
        fs.writeFileSync(exportPath, JSON.stringify({ trace }, null, 2));
      } else if (options.export === 'chrome-devtools') {
        exportPath = path.join(outputDir, `trace-${timestamp}.json`);
        const chromeTrace = convertToChromeDeveloperTools(trace);
        fs.writeFileSync(exportPath, JSON.stringify(chromeTrace, null, 2));
      }
    }

    return {
      success: true,
      trace,
      exportPath,
    };
  } catch (error: any) {
    return {
      success: false,
      trace: {
        testFile: options.testFile,
        totalDuration: 0,
        steps: [],
      },
      error: error.message,
    };
  }
}

async function traceTestSetup(options: TraceOptions): Promise<TraceStep> {
  const startTime = Date.now();

  // Simulate test setup
  await new Promise(resolve => setTimeout(resolve, 10));

  const endTime = Date.now();

  return {
    name: 'beforeEach',
    type: 'beforeEach',
    startTime,
    endTime,
    duration: options.measureTiming ? endTime - startTime : undefined,
  };
}

async function traceTestExecution(options: TraceOptions): Promise<TraceStep> {
  const startTime = Date.now();

  // Simulate test execution with nested calls
  const children: TraceStep[] = [];

  // Function call 1
  const fn1Start = Date.now();
  await new Promise(resolve => setTimeout(resolve, 20));
  const fn1End = Date.now();
  children.push({
    name: 'calculateResult',
    type: 'function',
    startTime: fn1Start,
    endTime: fn1End,
    duration: options.measureTiming ? fn1End - fn1Start : undefined,
  });

  // Async operation
  const asyncStart = Date.now();
  await new Promise(resolve => setTimeout(resolve, 50));
  const asyncEnd = Date.now();
  children.push({
    name: 'fetchData',
    type: 'async',
    startTime: asyncStart,
    endTime: asyncEnd,
    duration: options.measureTiming ? asyncEnd - asyncStart : undefined,
  });

  // Function call 2
  const fn2Start = Date.now();
  await new Promise(resolve => setTimeout(resolve, 15));
  const fn2End = Date.now();
  children.push({
    name: 'validateResult',
    type: 'function',
    startTime: fn2Start,
    endTime: fn2End,
    duration: options.measureTiming ? fn2End - fn2Start : undefined,
  });

  const endTime = Date.now();

  return {
    name: 'test: should complete successfully',
    type: 'test',
    startTime,
    endTime,
    duration: options.measureTiming ? endTime - startTime : undefined,
    children,
  };
}

async function traceTestTeardown(options: TraceOptions): Promise<TraceStep> {
  const startTime = Date.now();

  // Simulate test teardown
  await new Promise(resolve => setTimeout(resolve, 5));

  const endTime = Date.now();

  return {
    name: 'afterEach',
    type: 'afterEach',
    startTime,
    endTime,
    duration: options.measureTiming ? endTime - startTime : undefined,
  };
}

function filterStepsByDuration(steps: TraceStep[], minDuration: number): TraceStep[] {
  return steps
    .filter(step => step.duration === undefined || step.duration >= minDuration)
    .map(step => ({
      ...step,
      children: step.children ? filterStepsByDuration(step.children, minDuration) : undefined,
    }));
}

function markSlowSteps(steps: TraceStep[], threshold: number = 30): void {
  for (const step of steps) {
    if (step.duration && step.duration > threshold) {
      step.slow = true;
    }

    if (step.children) {
      markSlowSteps(step.children, threshold);
    }
  }
}

function captureCallStack(): string[] {
  const stack = new Error().stack;
  if (!stack) return [];

  return stack
    .split('\n')
    .slice(2) // Skip Error and this function
    .map(line => line.trim())
    .filter(line => line.startsWith('at '));
}

function convertToChromeDeveloperTools(trace: Trace): any {
  const events: any[] = [];
  let eventId = 0;

  function addStep(step: TraceStep, parentId?: number): void {
    const id = eventId++;

    events.push({
      name: step.name,
      cat: step.type,
      ph: 'B', // Begin
      ts: step.startTime * 1000, // Convert to microseconds
      pid: 1,
      tid: 1,
      args: {},
    });

    if (step.endTime) {
      events.push({
        name: step.name,
        cat: step.type,
        ph: 'E', // End
        ts: step.endTime * 1000,
        pid: 1,
        tid: 1,
        args: {},
      });
    }

    if (step.children) {
      for (const child of step.children) {
        addStep(child, id);
      }
    }
  }

  for (const step of trace.steps) {
    addStep(step);
  }

  return {
    traceEvents: events,
    displayTimeUnit: 'ms',
    otherData: {
      testFile: trace.testFile,
      totalDuration: trace.totalDuration,
    },
  };
}
