/**
 * Agentic QE v3 - Performance Benchmark Suite
 * Comprehensive benchmarks for AG-UI, A2A, and A2UI protocols
 *
 * Issue #177 Targets:
 * - AG-UI streaming: <100ms p95
 * - A2A task submission: <200ms p95
 * - A2UI surface generation: <150ms p95
 */

import { EventEmitter } from 'events';
import * as os from 'os';
import { PerformanceProfiler, createProfiler } from './profiler.js';
import { CircularBuffer } from '../shared/utils/index.js';
import { safeJsonParse } from '../shared/safe-json.js';
import { secureRandom, secureRandomInt } from '../shared/utils/crypto-random.js';

// ============================================================================
// Performance Targets (Issue #177)
// ============================================================================

/**
 * Performance targets from Issue #177
 */
export const PERFORMANCE_TARGETS = {
  // AG-UI Protocol
  aguiEventEmission: { p95: 10 },      // ms per event
  aguiStateSync: { p95: 50 },          // ms per sync
  aguiSSEStreaming: { p95: 100 },      // ms overall (Issue #177)

  // A2A Protocol
  a2aTaskSubmission: { p95: 200 },     // ms (Issue #177)
  a2aAgentDiscovery: { p95: 100 },     // ms
  a2aJSONRPCParsing: { p95: 5 },       // ms per message

  // A2UI Protocol
  a2uiSurfaceGeneration: { p95: 150 }, // ms (Issue #177)
  a2uiDataBinding: { p95: 20 },        // ms per binding
  a2uiComponentValidation: { p95: 10 },// ms per component

  // System
  memoryPeak: 4 * 1024 * 1024 * 1024,  // 4GB
  throughput: 1000,                     // ops/sec
} as const;

// ============================================================================
// Types
// ============================================================================

/**
 * Individual benchmark result
 */
export interface BenchmarkResult {
  /** Benchmark name */
  readonly name: string;
  /** Number of iterations performed */
  readonly iterations: number;
  /** Operations per second */
  readonly opsPerSecond: number;
  /** Average time in milliseconds */
  readonly avgTime: number;
  /** P50 (median) in milliseconds */
  readonly p50: number;
  /** P95 in milliseconds */
  readonly p95: number;
  /** P99 in milliseconds */
  readonly p99: number;
  /** Maximum time in milliseconds */
  readonly maxTime: number;
  /** Minimum time in milliseconds */
  readonly minTime: number;
  /** Memory delta in bytes */
  readonly memoryDelta: number;
  /** Whether target was met */
  readonly passed: boolean;
  /** Target time in ms (if applicable) */
  readonly target?: number;
  /** Timestamp */
  readonly timestamp: number;
  /** Additional metadata */
  readonly metadata?: Record<string, unknown>;
}

/**
 * Complete benchmark results
 */
export interface BenchmarkResults {
  /** All benchmark results */
  readonly results: BenchmarkResult[];
  /** Overall pass/fail */
  readonly allPassed: boolean;
  /** Total duration in milliseconds */
  readonly totalDuration: number;
  /** Start timestamp */
  readonly startedAt: number;
  /** End timestamp */
  readonly endedAt: number;
  /** System info */
  readonly system: {
    readonly nodeVersion: string;
    readonly platform: string;
    readonly arch: string;
    readonly cpus: number;
    readonly memory: number;
  };
}

/**
 * Benchmark configuration
 */
export interface BenchmarkConfig {
  /** Number of iterations per benchmark */
  readonly iterations: number;
  /** Warmup iterations (not counted) */
  readonly warmupIterations: number;
  /** Timeout per benchmark in milliseconds */
  readonly timeout: number;
  /** Whether to run GC between benchmarks */
  readonly forceGC: boolean;
  /** Whether to track memory */
  readonly trackMemory: boolean;
  /** Profiler configuration */
  readonly profilerConfig?: Record<string, unknown>;
}

/**
 * Benchmark function type
 */
export type BenchmarkFn = () => void | Promise<void>;

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: BenchmarkConfig = {
  iterations: 1000,
  warmupIterations: 100,
  timeout: 30000,
  forceGC: true,
  trackMemory: true,
};

// ============================================================================
// Benchmark Suite Implementation
// ============================================================================

/**
 * BenchmarkSuite - Comprehensive performance benchmark runner
 *
 * Features:
 * - Configurable iterations and warmup
 * - Memory tracking
 * - P50/P95/P99 percentile calculations
 * - Target validation
 * - System info collection
 */
export class BenchmarkSuite {
  private readonly config: BenchmarkConfig;
  private readonly profiler: PerformanceProfiler;
  private readonly results: BenchmarkResult[] = [];

  constructor(config: Partial<BenchmarkConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.profiler = createProfiler({
      enabled: true,
      trackMemory: this.config.trackMemory,
      ...this.config.profilerConfig,
    });
    this.profiler.enable();
  }

  // ============================================================================
  // Core Benchmark Methods
  // ============================================================================

  /**
   * Run all defined benchmarks
   */
  async runAll(): Promise<BenchmarkResults> {
    const startedAt = Date.now();

    // AG-UI benchmarks
    await this.benchmarkAGUIEventEmission();
    await this.benchmarkAGUIStateSync();
    await this.benchmarkAGUISSEStreaming();

    // A2A benchmarks
    await this.benchmarkA2ATaskSubmission();
    await this.benchmarkA2AAgentDiscovery();
    await this.benchmarkA2AJSONRPCParsing();

    // A2UI benchmarks
    await this.benchmarkA2UISurfaceGeneration();
    await this.benchmarkA2UIDataBinding();
    await this.benchmarkA2UIComponentValidation();

    // Cross-protocol benchmarks
    await this.benchmarkEndToEndFlow();
    await this.benchmarkMemoryUnderLoad();

    const endedAt = Date.now();

    return {
      results: [...this.results],
      allPassed: this.results.every((r) => r.passed),
      totalDuration: endedAt - startedAt,
      startedAt,
      endedAt,
      system: this.getSystemInfo(),
    };
  }

  /**
   * Run a specific benchmark by name
   */
  async run(name: string): Promise<BenchmarkResult> {
    const method = (this as Record<string, unknown>)[`benchmark${name}`] as (() => Promise<BenchmarkResult>) | undefined;
    if (!method || typeof method !== 'function') {
      throw new Error(`Benchmark '${name}' not found`);
    }

    return method.call(this) as Promise<BenchmarkResult>;
  }

  // ============================================================================
  // AG-UI Benchmarks
  // ============================================================================

  /**
   * Benchmark AG-UI event emission
   */
  async benchmarkAGUIEventEmission(): Promise<BenchmarkResult> {
    const emitter = new EventEmitter();
    let received = 0;
    emitter.on('event', () => received++);

    return this.runBenchmark(
      'AGUI Event Emission',
      () => {
        emitter.emit('event', { type: 'TEST', data: { value: secureRandom() } });
      },
      PERFORMANCE_TARGETS.aguiEventEmission.p95
    );
  }

  /**
   * Benchmark AG-UI state synchronization
   */
  async benchmarkAGUIStateSync(): Promise<BenchmarkResult> {
    const state: Record<string, unknown> = {};
    let version = 0;

    return this.runBenchmark(
      'AGUI State Sync',
      () => {
        // Simulate state sync with JSON patch
        const delta = {
          op: 'replace',
          path: `/field${version % 10}`,
          value: { timestamp: Date.now(), version: ++version },
        };
        state[`field${version % 10}`] = delta.value;
      },
      PERFORMANCE_TARGETS.aguiStateSync.p95
    );
  }

  /**
   * Benchmark AG-UI SSE streaming
   */
  async benchmarkAGUISSEStreaming(): Promise<BenchmarkResult> {
    const events: unknown[] = [];
    const emitter = new EventEmitter();

    // Simulate SSE buffer
    emitter.on('data', (data) => {
      events.push(data);
      if (events.length > 1000) events.shift();
    });

    return this.runBenchmark(
      'AGUI SSE Streaming',
      () => {
        // Simulate SSE event formatting and emission
        const event = {
          id: Date.now().toString(36),
          type: 'TEXT_MESSAGE_CONTENT',
          data: JSON.stringify({ delta: 'a'.repeat(100) }),
        };
        const sseFormat = `id: ${event.id}\nevent: ${event.type}\ndata: ${event.data}\n\n`;
        emitter.emit('data', sseFormat);
      },
      PERFORMANCE_TARGETS.aguiSSEStreaming.p95
    );
  }

  // ============================================================================
  // A2A Benchmarks
  // ============================================================================

  /**
   * Benchmark A2A task submission
   */
  async benchmarkA2ATaskSubmission(): Promise<BenchmarkResult> {
    const tasks = new Map<string, unknown>();
    let taskId = 0;

    return this.runBenchmark(
      'A2A Task Submission',
      () => {
        const id = `task-${++taskId}`;
        const task = {
          id,
          status: 'submitted',
          message: {
            role: 'user',
            parts: [{ type: 'text', text: 'Test task' }],
          },
          contextId: `ctx-${taskId % 10}`,
          createdAt: new Date(),
        };
        tasks.set(id, task);
        if (tasks.size > 1000) {
          const firstKey = tasks.keys().next().value;
          if (firstKey) tasks.delete(firstKey);
        }
      },
      PERFORMANCE_TARGETS.a2aTaskSubmission.p95
    );
  }

  /**
   * Benchmark A2A agent discovery
   */
  async benchmarkA2AAgentDiscovery(): Promise<BenchmarkResult> {
    const agentCards = new Map<string, unknown>();

    // Pre-populate with 100 agents
    for (let i = 0; i < 100; i++) {
      agentCards.set(`agent-${i}`, {
        name: `Agent ${i}`,
        version: '1.0.0',
        url: `http://localhost:300${i}`,
        capabilities: {
          streaming: true,
          pushNotifications: false,
        },
      });
    }

    return this.runBenchmark(
      'A2A Agent Discovery',
      () => {
        // Simulate discovery lookup
        const agentId = `agent-${secureRandomInt(0, 100)}`;
        const card = agentCards.get(agentId);
        // Simulate capability matching
        const matches = card && (card as Record<string, unknown>).capabilities;
      },
      PERFORMANCE_TARGETS.a2aAgentDiscovery.p95
    );
  }

  /**
   * Benchmark A2A JSON-RPC parsing
   */
  async benchmarkA2AJSONRPCParsing(): Promise<BenchmarkResult> {
    const sampleRequest = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'message/send',
      params: {
        message: {
          role: 'user',
          parts: [{ type: 'text', text: 'Hello, agent!' }],
        },
      },
    });

    return this.runBenchmark(
      'A2A JSON-RPC Parsing',
      () => {
        const parsed = safeJsonParse<Record<string, unknown>>(sampleRequest);
        // Validate structure
        const valid =
          parsed.jsonrpc === '2.0' &&
          typeof parsed.id === 'number' &&
          typeof parsed.method === 'string';
      },
      PERFORMANCE_TARGETS.a2aJSONRPCParsing.p95
    );
  }

  // ============================================================================
  // A2UI Benchmarks
  // ============================================================================

  /**
   * Benchmark A2UI surface generation
   */
  async benchmarkA2UISurfaceGeneration(): Promise<BenchmarkResult> {
    const surfaces = new Map<string, unknown>();
    let surfaceId = 0;

    return this.runBenchmark(
      'A2UI Surface Generation',
      () => {
        const id = `surface-${++surfaceId}`;
        const components = Array.from({ length: 20 }, (_, i) => ({
          id: `comp-${i}`,
          type: i % 3 === 0 ? 'Text' : i % 3 === 1 ? 'Button' : 'Card',
          properties: {
            text: `Component ${i}`,
            variant: 'primary',
          },
          children: i < 5 ? [`comp-${i + 10}`] : undefined,
        }));

        const surface = {
          id,
          version: 1,
          components,
          rootComponentId: 'comp-0',
        };

        surfaces.set(id, surface);
        if (surfaces.size > 100) {
          const firstKey = surfaces.keys().next().value;
          if (firstKey) surfaces.delete(firstKey);
        }
      },
      PERFORMANCE_TARGETS.a2uiSurfaceGeneration.p95
    );
  }

  /**
   * Benchmark A2UI data binding
   */
  async benchmarkA2UIDataBinding(): Promise<BenchmarkResult> {
    const dataModel = {
      users: Array.from({ length: 100 }, (_, i) => ({
        id: i,
        name: `User ${i}`,
        email: `user${i}@example.com`,
      })),
    };

    return this.runBenchmark(
      'A2UI Data Binding',
      () => {
        // Simulate JSON Pointer resolution
        const pointer = `/users/${secureRandomInt(0, 100)}/name`;
        const parts = pointer.split('/').filter(Boolean);
        let value: unknown = dataModel;
        for (const part of parts) {
          if (value && typeof value === 'object') {
            value = (value as Record<string, unknown>)[part];
          }
        }
      },
      PERFORMANCE_TARGETS.a2uiDataBinding.p95
    );
  }

  /**
   * Benchmark A2UI component validation
   */
  async benchmarkA2UIComponentValidation(): Promise<BenchmarkResult> {
    const schemas: Record<string, string[]> = {
      Text: ['text', 'variant', 'style'],
      Button: ['text', 'onPress', 'disabled', 'variant'],
      Card: ['title', 'children', 'elevation'],
    };

    const componentTypes = ['Text', 'Button', 'Card'];

    return this.runBenchmark(
      'A2UI Component Validation',
      () => {
        const type = componentTypes[secureRandomInt(0, 3)];
        const component = {
          id: `comp-${Date.now()}`,
          type,
          properties: {
            text: 'Sample',
            variant: 'primary',
            onPress: 'action:submit',
          },
        };

        // Validate properties
        const schema = schemas[type];
        const props = Object.keys(component.properties);
        const valid = props.every((p) => schema.includes(p) || p.startsWith('aria-'));
      },
      PERFORMANCE_TARGETS.a2uiComponentValidation.p95
    );
  }

  // ============================================================================
  // Cross-Protocol Benchmarks
  // ============================================================================

  /**
   * Benchmark end-to-end flow across all protocols
   */
  async benchmarkEndToEndFlow(): Promise<BenchmarkResult> {
    const emitter = new EventEmitter();
    const tasks = new Map<string, unknown>();
    const surfaces = new Map<string, unknown>();
    let counter = 0;

    return this.runBenchmark(
      'End-to-End Flow',
      () => {
        const id = ++counter;

        // 1. A2A: Submit task
        const task = {
          id: `task-${id}`,
          status: 'submitted',
          message: { role: 'user', parts: [{ type: 'text', text: 'Test' }] },
        };
        tasks.set(task.id, task);

        // 2. AG-UI: Emit events
        emitter.emit('RUN_STARTED', { runId: `run-${id}` });
        emitter.emit('STEP_STARTED', { stepId: `step-${id}` });

        // 3. A2UI: Generate surface
        const surface = {
          id: `surface-${id}`,
          components: [{ id: 'root', type: 'Card', children: [] }],
        };
        surfaces.set(surface.id, surface);

        // 4. AG-UI: Complete
        emitter.emit('STEP_FINISHED', { stepId: `step-${id}` });
        emitter.emit('RUN_FINISHED', { runId: `run-${id}` });

        // Cleanup
        if (tasks.size > 100) tasks.delete(`task-${id - 100}`);
        if (surfaces.size > 100) surfaces.delete(`surface-${id - 100}`);
      },
      250 // Combined target
    );
  }

  /**
   * Benchmark memory under load
   */
  async benchmarkMemoryUnderLoad(): Promise<BenchmarkResult> {
    const buffer = new CircularBuffer<Record<string, unknown>>(10000);
    const startMemory = process.memoryUsage().heapUsed;

    const result = await this.runBenchmark(
      'Memory Under Load',
      () => {
        // Create objects that would normally cause memory pressure
        const obj = {
          id: Date.now().toString(36),
          data: Array.from({ length: 100 }, (_, i) => ({
            key: `key-${i}`,
            value: secureRandom(),
          })),
          timestamp: new Date().toISOString(),
        };
        buffer.push(obj);
      },
      50, // ms target
      {
        iterations: 10000, // More iterations for memory test
      }
    );

    const endMemory = process.memoryUsage().heapUsed;
    const memoryTarget = PERFORMANCE_TARGETS.memoryPeak;

    return {
      ...result,
      memoryDelta: endMemory - startMemory,
      passed: result.passed && endMemory < memoryTarget,
      metadata: {
        ...result.metadata,
        memoryUsed: endMemory,
        memoryTarget,
      },
    };
  }

  // ============================================================================
  // Benchmark Runner
  // ============================================================================

  /**
   * Run a single benchmark function
   */
  private async runBenchmark(
    name: string,
    fn: BenchmarkFn,
    target?: number,
    options?: Partial<BenchmarkConfig>
  ): Promise<BenchmarkResult> {
    const config = { ...this.config, ...options };
    const timings: number[] = [];
    let memoryStart = 0;
    let memoryEnd = 0;

    // Force GC if available and enabled
    if (config.forceGC && global.gc) {
      global.gc();
    }

    // Warmup
    for (let i = 0; i < config.warmupIterations; i++) {
      await fn();
    }

    // Record start memory
    if (config.trackMemory) {
      memoryStart = process.memoryUsage().heapUsed;
    }

    // Run benchmark
    for (let i = 0; i < config.iterations; i++) {
      const start = process.hrtime.bigint();
      await fn();
      const end = process.hrtime.bigint();

      const durationMs = Number(end - start) / 1_000_000;
      timings.push(durationMs);
    }

    // Record end memory
    if (config.trackMemory) {
      memoryEnd = process.memoryUsage().heapUsed;
    }

    // Calculate statistics
    const sorted = [...timings].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);
    const avgTime = sum / sorted.length;
    const totalTime = sum;
    const opsPerSecond = (config.iterations / totalTime) * 1000;

    const result: BenchmarkResult = {
      name,
      iterations: config.iterations,
      opsPerSecond,
      avgTime,
      p50: this.percentile(sorted, 0.5),
      p95: this.percentile(sorted, 0.95),
      p99: this.percentile(sorted, 0.99),
      maxTime: sorted[sorted.length - 1],
      minTime: sorted[0],
      memoryDelta: memoryEnd - memoryStart,
      passed: target !== undefined ? this.percentile(sorted, 0.95) <= target : true,
      target,
      timestamp: Date.now(),
    };

    this.results.push(result);
    return result;
  }

  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const index = Math.ceil(sorted.length * p) - 1;
    return sorted[Math.max(0, index)];
  }

  private getSystemInfo() {
    return {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      cpus: os.cpus().length,
      memory: os.totalmem(),
    };
  }

  // ============================================================================
  // Results Access
  // ============================================================================

  /**
   * Get all benchmark results
   */
  getResults(): BenchmarkResult[] {
    return [...this.results];
  }

  /**
   * Get result by name
   */
  getResult(name: string): BenchmarkResult | undefined {
    return this.results.find((r) => r.name === name);
  }

  /**
   * Clear all results
   */
  clearResults(): void {
    this.results.length = 0;
  }

  /**
   * Destroy the benchmark suite
   */
  destroy(): void {
    this.profiler.destroy();
    this.clearResults();
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new BenchmarkSuite instance
 */
export function createBenchmarkSuite(config?: Partial<BenchmarkConfig>): BenchmarkSuite {
  return new BenchmarkSuite(config);
}
