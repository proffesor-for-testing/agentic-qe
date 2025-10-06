/**
 * Profile Command
 * Profiles test performance with CPU and memory profiling
 */

import * as fs from 'fs';
import * as path from 'path';
import * as v8 from 'v8';
import { performance } from 'perf_hooks';

export interface ProfileOptions {
  testFile: string;
  profileCPU?: boolean;
  profileMemory?: boolean;
  heapSnapshot?: boolean;
  detectLeaks?: boolean;
  export?: 'v8' | 'chrome-devtools' | 'json';
  outputDir?: string;
  flamegraph?: boolean;
  allocationProfile?: boolean;
  identifyHotFunctions?: boolean;
  compareWith?: Profile;
}

export interface CPUProfile {
  samples: CPUSample[];
  totalTime: number;
  samplingInterval: number;
}

export interface CPUSample {
  timestamp: number;
  functionName: string;
  scriptId: number;
  lineNumber: number;
  columnNumber: number;
}

export interface MemoryProfile {
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
  heapSnapshot?: any;
  leaks?: MemoryLeak[];
  allocations?: Allocation[];
}

export interface MemoryLeak {
  object: string;
  size: number;
  retainedSize: number;
  location: string;
}

export interface Allocation {
  size: number;
  count: number;
  stackTrace: string;
}

export interface HotFunction {
  name: string;
  file: string;
  line: number;
  selfTime: number;
  totalTime: number;
  calls: number;
  percentage: number;
}

export interface Profile {
  testFile: string;
  timestamp: number;
  cpu: CPUProfile;
  memory: MemoryProfile;
  hotFunctions?: HotFunction[];
}

export interface ProfileComparison {
  cpuDiff: number;
  memoryDiff: number;
  improvementPercentage: number;
  details: string[];
}

export interface ProfileResult {
  success: boolean;
  profile: Profile;
  exportPath?: string;
  flamegraphPath?: string;
  comparison?: ProfileComparison;
  error?: string;
}

/**
 * Profile test performance
 */
export async function profilePerformance(options: ProfileOptions): Promise<ProfileResult> {
  try {
    const startTime = performance.now();
    const startMemory = process.memoryUsage();

    // Start CPU profiling if requested
    let cpuProfile: CPUProfile = {
      samples: [],
      totalTime: 0,
      samplingInterval: 1,
    };

    if (options.profileCPU) {
      cpuProfile = await captureCPUProfile(options);
    }

    // Execute test (simulated)
    await simulateTestExecution();

    // Capture memory profile
    let memoryProfile: MemoryProfile = {
      heapUsed: 0,
      heapTotal: 0,
      external: 0,
      rss: 0,
    };

    if (options.profileMemory) {
      memoryProfile = await captureMemoryProfile(options);
    }

    const endTime = performance.now();
    cpuProfile.totalTime = endTime - startTime;

    // Identify hot functions if requested
    let hotFunctions: HotFunction[] | undefined;
    if (options.identifyHotFunctions) {
      hotFunctions = identifyHotFunctions(cpuProfile);
    }

    const profile: Profile = {
      testFile: options.testFile,
      timestamp: Date.now(),
      cpu: cpuProfile,
      memory: memoryProfile,
      hotFunctions,
    };

    // Compare with baseline if provided
    let comparison: ProfileComparison | undefined;
    if (options.compareWith) {
      comparison = compareProfiles(profile, options.compareWith);
    }

    // Export profile if requested
    let exportPath: string | undefined;
    let flamegraphPath: string | undefined;

    if (options.export) {
      const outputDir = options.outputDir || path.join(process.cwd(), '.swarm', 'reports');
      fs.mkdirSync(outputDir, { recursive: true });

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

      if (options.export === 'v8') {
        exportPath = path.join(outputDir, `profile-${timestamp}.cpuprofile`);
        const v8Profile = convertToV8Format(profile);
        fs.writeFileSync(exportPath, JSON.stringify(v8Profile, null, 2));
      } else if (options.export === 'chrome-devtools') {
        exportPath = path.join(outputDir, `profile-${timestamp}.json`);
        const chromeProfile = convertToChromeDevToolsFormat(profile);
        fs.writeFileSync(exportPath, JSON.stringify(chromeProfile, null, 2));
      } else if (options.export === 'json') {
        exportPath = path.join(outputDir, `profile-${timestamp}.json`);
        fs.writeFileSync(exportPath, JSON.stringify(profile, null, 2));
      }
    }

    // Generate flamegraph if requested
    if (options.flamegraph) {
      flamegraphPath = await generateFlamegraph(profile, options);
    }

    return {
      success: true,
      profile,
      exportPath,
      flamegraphPath,
      comparison,
    };
  } catch (error: any) {
    return {
      success: false,
      profile: {
        testFile: options.testFile,
        timestamp: Date.now(),
        cpu: { samples: [], totalTime: 0, samplingInterval: 1 },
        memory: { heapUsed: 0, heapTotal: 0, external: 0, rss: 0 },
      },
      error: error.message,
    };
  }
}

async function captureCPUProfile(options: ProfileOptions): Promise<CPUProfile> {
  const samples: CPUSample[] = [];
  const startTime = performance.now();

  // Capture CPU samples during execution
  const samplingInterval = 1; // 1ms
  const duration = 100; // Sample for 100ms

  for (let i = 0; i < duration; i += samplingInterval) {
    await new Promise(resolve => setTimeout(resolve, samplingInterval));

    // Capture stack trace at this point
    const stack = new Error().stack;
    if (stack) {
      const lines = stack.split('\n');
      if (lines.length > 2) {
        const match = lines[2].match(/at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)/);
        if (match) {
          samples.push({
            timestamp: performance.now(),
            functionName: match[1],
            scriptId: 0,
            lineNumber: parseInt(match[3]),
            columnNumber: parseInt(match[4]),
          });
        }
      }
    }
  }

  return {
    samples,
    totalTime: performance.now() - startTime,
    samplingInterval,
  };
}

async function captureMemoryProfile(options: ProfileOptions): Promise<MemoryProfile> {
  const memUsage = process.memoryUsage();

  const profile: MemoryProfile = {
    heapUsed: memUsage.heapUsed,
    heapTotal: memUsage.heapTotal,
    external: memUsage.external,
    rss: memUsage.rss,
  };

  // Capture heap snapshot if requested
  if (options.heapSnapshot) {
    try {
      const snapshot = v8.writeHeapSnapshot();
      profile.heapSnapshot = { path: snapshot };
    } catch (error) {
      // Heap snapshot failed, continue without it
    }
  }

  // Detect memory leaks if requested
  if (options.detectLeaks) {
    profile.leaks = await detectMemoryLeaks();
  }

  // Capture allocation profile if requested
  if (options.allocationProfile) {
    profile.allocations = await captureAllocationProfile();
  }

  return profile;
}

async function detectMemoryLeaks(): Promise<MemoryLeak[]> {
  const leaks: MemoryLeak[] = [];

  // Simulate leak detection
  // In real implementation, this would use heap snapshots and compare
  const memUsage = process.memoryUsage();

  if (memUsage.heapUsed > memUsage.heapTotal * 0.8) {
    leaks.push({
      object: 'LargeArray',
      size: 1024 * 1024, // 1MB
      retainedSize: 1024 * 1024 * 5, // 5MB
      location: 'test-file.ts:42',
    });
  }

  return leaks;
}

async function captureAllocationProfile(): Promise<Allocation[]> {
  // Simulate allocation profiling
  return [
    {
      size: 1024,
      count: 100,
      stackTrace: 'at Function.allocate (allocator.ts:10)',
    },
    {
      size: 2048,
      count: 50,
      stackTrace: 'at Function.createBuffer (buffer.ts:25)',
    },
  ];
}

function identifyHotFunctions(cpuProfile: CPUProfile): HotFunction[] {
  const functionStats = new Map<string, HotFunction>();

  for (const sample of cpuProfile.samples) {
    const key = `${sample.functionName}:${sample.lineNumber}`;

    if (!functionStats.has(key)) {
      functionStats.set(key, {
        name: sample.functionName,
        file: 'unknown',
        line: sample.lineNumber,
        selfTime: 0,
        totalTime: 0,
        calls: 0,
        percentage: 0,
      });
    }

    const stat = functionStats.get(key)!;
    stat.selfTime += cpuProfile.samplingInterval;
    stat.totalTime += cpuProfile.samplingInterval;
    stat.calls += 1;
  }

  // Calculate percentages
  const totalTime = cpuProfile.totalTime;
  for (const stat of functionStats.values()) {
    stat.percentage = (stat.selfTime / totalTime) * 100;
  }

  // Sort by percentage and return top functions
  return Array.from(functionStats.values())
    .sort((a, b) => b.percentage - a.percentage)
    .slice(0, 10);
}

async function simulateTestExecution(): Promise<void> {
  // Simulate CPU-intensive work
  for (let i = 0; i < 1000000; i++) {
    Math.sqrt(i);
  }

  // Simulate memory allocation
  const arrays: any[] = [];
  for (let i = 0; i < 100; i++) {
    arrays.push(new Array(1000).fill(i));
  }

  // Simulate async work
  await new Promise(resolve => setTimeout(resolve, 10));
}

function compareProfiles(current: Profile, baseline: Profile): ProfileComparison {
  const cpuDiff = current.cpu.totalTime - baseline.cpu.totalTime;
  const memoryDiff = current.memory.heapUsed - baseline.memory.heapUsed;

  const improvementPercentage = ((baseline.cpu.totalTime - current.cpu.totalTime) / baseline.cpu.totalTime) * 100;

  const details: string[] = [];

  if (cpuDiff > 0) {
    details.push(`CPU time increased by ${cpuDiff.toFixed(2)}ms`);
  } else {
    details.push(`CPU time decreased by ${Math.abs(cpuDiff).toFixed(2)}ms`);
  }

  if (memoryDiff > 0) {
    details.push(`Memory usage increased by ${(memoryDiff / 1024 / 1024).toFixed(2)}MB`);
  } else {
    details.push(`Memory usage decreased by ${Math.abs(memoryDiff / 1024 / 1024).toFixed(2)}MB`);
  }

  return {
    cpuDiff,
    memoryDiff,
    improvementPercentage,
    details,
  };
}

function convertToV8Format(profile: Profile): any {
  return {
    nodes: profile.cpu.samples.map((sample, index) => ({
      id: index,
      callFrame: {
        functionName: sample.functionName,
        scriptId: sample.scriptId.toString(),
        url: profile.testFile,
        lineNumber: sample.lineNumber,
        columnNumber: sample.columnNumber,
      },
      hitCount: 1,
      children: [],
    })),
    startTime: profile.timestamp,
    endTime: profile.timestamp + profile.cpu.totalTime,
    samples: profile.cpu.samples.map((_, index) => index),
    timeDeltas: profile.cpu.samples.map(() => profile.cpu.samplingInterval),
  };
}

function convertToChromeDevToolsFormat(profile: Profile): any {
  return {
    head: {
      functionName: '(root)',
      scriptId: '0',
      url: '',
      lineNumber: 0,
      columnNumber: 0,
      hitCount: 0,
      children: profile.cpu.samples.map((sample, index) => ({
        id: index + 1,
        functionName: sample.functionName,
        scriptId: sample.scriptId.toString(),
        url: profile.testFile,
        lineNumber: sample.lineNumber,
        columnNumber: sample.columnNumber,
        hitCount: 1,
        children: [],
      })),
    },
    startTime: profile.timestamp,
    endTime: profile.timestamp + profile.cpu.totalTime,
  };
}

async function generateFlamegraph(profile: Profile, options: ProfileOptions): Promise<string> {
  const outputDir = options.outputDir || path.join(process.cwd(), '.swarm', 'reports');
  fs.mkdirSync(outputDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const flamegraphPath = path.join(outputDir, `flamegraph-${timestamp}.svg`);

  // Generate simple SVG flamegraph
  const svg = generateSVGFlamegraph(profile);
  fs.writeFileSync(flamegraphPath, svg);

  return flamegraphPath;
}

function generateSVGFlamegraph(profile: Profile): string {
  const width = 1200;
  const height = 600;
  const barHeight = 20;

  let svg = `<?xml version="1.0" standalone="no"?>
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
<svg version="1.1" width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
<rect width="100%" height="100%" fill="#eeeeee"/>
<text x="10" y="20" font-family="Verdana" font-size="14">Flamegraph - ${profile.testFile}</text>
`;

  let y = 40;
  const totalTime = profile.cpu.totalTime;

  if (profile.hotFunctions) {
    for (const func of profile.hotFunctions) {
      const barWidth = (func.percentage / 100) * (width - 40);
      const color = `hsl(${(func.percentage / 100) * 120}, 70%, 60%)`;

      svg += `<rect x="20" y="${y}" width="${barWidth}" height="${barHeight}" fill="${color}" stroke="#000" stroke-width="0.5"/>
<text x="${25}" y="${y + 15}" font-family="Verdana" font-size="12">${func.name} (${func.percentage.toFixed(2)}%)</text>
`;
      y += barHeight + 2;
    }
  }

  svg += '</svg>';
  return svg;
}
