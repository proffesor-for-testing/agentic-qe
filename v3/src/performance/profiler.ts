/**
 * Agentic QE v3 - Performance Profiler
 * Performance profiling utilities with section timing and memory tracking
 *
 * Issue #177 Targets:
 * - AG-UI streaming: <100ms p95
 * - A2A task submission: <200ms p95
 * - A2UI surface generation: <150ms p95
 */

import { CircularBuffer } from '../shared/utils/index.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Active profiling section
 */
export interface ProfileSection {
  /** Section name */
  readonly name: string;
  /** High-resolution start time */
  readonly startTime: bigint;
  /** Start memory in bytes */
  readonly startMemory: number;
  /** Unique section instance ID */
  readonly id: string;
}

/**
 * Completed section timing
 */
export interface SectionTiming {
  /** Section name */
  readonly name: string;
  /** Duration in milliseconds */
  readonly duration: number;
  /** Memory delta in bytes */
  readonly memoryDelta: number;
  /** Timestamp when completed */
  readonly timestamp: number;
}

/**
 * Section statistics
 */
export interface SectionStats {
  /** Section name */
  readonly name: string;
  /** Number of times this section was profiled */
  readonly count: number;
  /** Total time in milliseconds */
  readonly totalTime: number;
  /** Average time in milliseconds */
  readonly avgTime: number;
  /** Minimum time in milliseconds */
  readonly minTime: number;
  /** Maximum time in milliseconds */
  readonly maxTime: number;
  /** P50 (median) in milliseconds */
  readonly p50: number;
  /** P95 in milliseconds */
  readonly p95: number;
  /** P99 in milliseconds */
  readonly p99: number;
  /** Total memory allocated in bytes */
  readonly totalMemory: number;
  /** Average memory per call in bytes */
  readonly avgMemory: number;
}

/**
 * Complete profiling results
 */
export interface ProfileResults {
  /** Per-section statistics */
  readonly sections: SectionStats[];
  /** Total profiling duration in milliseconds */
  readonly totalDuration: number;
  /** Peak memory usage in bytes */
  readonly peakMemory: number;
  /** Average memory usage in bytes */
  readonly avgMemory: number;
  /** Number of sections profiled */
  readonly sectionCount: number;
  /** Enabled status */
  readonly enabled: boolean;
  /** Start timestamp */
  readonly startedAt: number;
  /** End timestamp */
  readonly endedAt: number;
}

/**
 * Profiler configuration
 */
export interface ProfilerConfig {
  /** Maximum timings to store per section */
  readonly maxTimingsPerSection: number;
  /** Maximum memory samples to store */
  readonly maxMemorySamples: number;
  /** Enable memory tracking (may impact performance) */
  readonly trackMemory: boolean;
  /** Initial enabled state */
  readonly enabled: boolean;
  /** Memory sample interval in ms (0 = disabled) */
  readonly memorySampleInterval: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: ProfilerConfig = {
  maxTimingsPerSection: 10000,
  maxMemorySamples: 1000,
  trackMemory: true,
  enabled: true,
  memorySampleInterval: 100,
};

// ============================================================================
// Performance Profiler Implementation
// ============================================================================

/**
 * PerformanceProfiler - High-precision performance profiling
 *
 * Features:
 * - Nanosecond-precision timing via process.hrtime.bigint()
 * - Memory tracking per section
 * - Percentile calculations (P50, P95, P99)
 * - Async operation measurement
 * - Section nesting support
 * - Enable/disable for production
 */
export class PerformanceProfiler {
  private readonly config: ProfilerConfig;
  private enabled: boolean;

  // Section tracking
  private readonly activeSections = new Map<string, ProfileSection>();
  private readonly sectionTimings = new Map<string, CircularBuffer<SectionTiming>>();
  private sectionCounter = 0;

  // Memory tracking
  private readonly memorySamples: CircularBuffer<number>;
  private peakMemory = 0;
  private memorySum = 0;
  private memorySampleCount = 0;
  private memorySamplerTimer: NodeJS.Timeout | null = null;

  // Timing
  private startedAt = 0;
  private endedAt = 0;

  constructor(config: Partial<ProfilerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.enabled = this.config.enabled;
    this.memorySamples = new CircularBuffer<number>(this.config.maxMemorySamples);
  }

  // ============================================================================
  // Enable/Disable
  // ============================================================================

  /**
   * Enable the profiler
   */
  enable(): void {
    this.enabled = true;
    this.startedAt = Date.now();

    if (this.config.trackMemory && this.config.memorySampleInterval > 0) {
      this.startMemorySampling();
    }
  }

  /**
   * Disable the profiler
   */
  disable(): void {
    this.enabled = false;
    this.endedAt = Date.now();
    this.stopMemorySampling();
  }

  /**
   * Check if profiler is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  // ============================================================================
  // Section Profiling
  // ============================================================================

  /**
   * Start profiling a section
   */
  startSection(name: string): ProfileSection {
    const section: ProfileSection = {
      name,
      startTime: process.hrtime.bigint(),
      startMemory: this.config.trackMemory ? this.getCurrentMemory() : 0,
      id: `${name}_${++this.sectionCounter}`,
    };

    if (this.enabled) {
      this.activeSections.set(section.id, section);
    }

    return section;
  }

  /**
   * End profiling a section
   */
  endSection(section: ProfileSection): SectionTiming {
    const endTime = process.hrtime.bigint();
    const endMemory = this.config.trackMemory ? this.getCurrentMemory() : 0;

    // Calculate duration in milliseconds
    const durationNs = Number(endTime - section.startTime);
    const duration = durationNs / 1_000_000; // Convert to ms

    const timing: SectionTiming = {
      name: section.name,
      duration,
      memoryDelta: endMemory - section.startMemory,
      timestamp: Date.now(),
    };

    if (this.enabled) {
      this.activeSections.delete(section.id);
      this.recordTiming(timing);
    }

    return timing;
  }

  // ============================================================================
  // Measurement Methods
  // ============================================================================

  /**
   * Measure an async operation
   */
  async measure<T>(name: string, fn: () => Promise<T>): Promise<T> {
    if (!this.enabled) {
      return fn();
    }

    const section = this.startSection(name);
    try {
      const result = await fn();
      this.endSection(section);
      return result;
    } catch (error) {
      this.endSection(section);
      throw error;
    }
  }

  /**
   * Measure a sync operation
   */
  measureSync<T>(name: string, fn: () => T): T {
    if (!this.enabled) {
      return fn();
    }

    const section = this.startSection(name);
    try {
      const result = fn();
      this.endSection(section);
      return result;
    } catch (error) {
      this.endSection(section);
      throw error;
    }
  }

  /**
   * Wrap a function to measure its execution
   */
  wrap<T extends (...args: unknown[]) => unknown>(
    name: string,
    fn: T
  ): T {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const profiler = this;

    const wrapped = function (this: unknown, ...args: unknown[]) {
      const section = profiler.startSection(name);
      try {
        const result = fn.apply(this, args);

        if (result instanceof Promise) {
          return result.finally(() => profiler.endSection(section));
        }

        profiler.endSection(section);
        return result;
      } catch (error) {
        profiler.endSection(section);
        throw error;
      }
    };
    return wrapped as T;
  }

  // ============================================================================
  // Results
  // ============================================================================

  /**
   * Get profiling results
   */
  getResults(): ProfileResults {
    const sections: SectionStats[] = [];

    for (const [name, buffer] of this.sectionTimings.entries()) {
      const timings = buffer.toArray();
      if (timings.length === 0) continue;

      const durations = timings.map((t) => t.duration);
      const memories = timings.map((t) => t.memoryDelta);

      sections.push({
        name,
        count: timings.length,
        totalTime: durations.reduce((a, b) => a + b, 0),
        avgTime: this.calculateAverage(durations),
        minTime: Math.min(...durations),
        maxTime: Math.max(...durations),
        p50: this.calculatePercentile(durations, 0.5),
        p95: this.calculatePercentile(durations, 0.95),
        p99: this.calculatePercentile(durations, 0.99),
        totalMemory: memories.reduce((a, b) => a + b, 0),
        avgMemory: this.calculateAverage(memories),
      });
    }

    // Sort by total time descending
    sections.sort((a, b) => b.totalTime - a.totalTime);

    return {
      sections,
      totalDuration: this.endedAt > 0
        ? this.endedAt - this.startedAt
        : Date.now() - this.startedAt,
      peakMemory: this.peakMemory,
      avgMemory: this.memorySampleCount > 0
        ? this.memorySum / this.memorySampleCount
        : 0,
      sectionCount: this.sectionTimings.size,
      enabled: this.enabled,
      startedAt: this.startedAt,
      endedAt: this.endedAt || Date.now(),
    };
  }

  /**
   * Get results for a specific section
   */
  getSectionResults(name: string): SectionStats | null {
    const buffer = this.sectionTimings.get(name);
    if (!buffer) return null;

    const timings = buffer.toArray();
    if (timings.length === 0) return null;

    const durations = timings.map((t) => t.duration);
    const memories = timings.map((t) => t.memoryDelta);

    return {
      name,
      count: timings.length,
      totalTime: durations.reduce((a, b) => a + b, 0),
      avgTime: this.calculateAverage(durations),
      minTime: Math.min(...durations),
      maxTime: Math.max(...durations),
      p50: this.calculatePercentile(durations, 0.5),
      p95: this.calculatePercentile(durations, 0.95),
      p99: this.calculatePercentile(durations, 0.99),
      totalMemory: memories.reduce((a, b) => a + b, 0),
      avgMemory: this.calculateAverage(memories),
    };
  }

  /**
   * Get raw timings for a section
   */
  getRawTimings(name: string): SectionTiming[] {
    const buffer = this.sectionTimings.get(name);
    return buffer ? buffer.toArray() : [];
  }

  // ============================================================================
  // Reset
  // ============================================================================

  /**
   * Reset all profiling data
   */
  reset(): void {
    this.activeSections.clear();
    this.sectionTimings.clear();
    this.memorySamples.clear();
    this.peakMemory = 0;
    this.memorySum = 0;
    this.memorySampleCount = 0;
    this.sectionCounter = 0;
    this.startedAt = Date.now();
    this.endedAt = 0;
  }

  /**
   * Stop profiler and cleanup
   */
  destroy(): void {
    this.disable();
    this.reset();
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private recordTiming(timing: SectionTiming): void {
    let buffer = this.sectionTimings.get(timing.name);
    if (!buffer) {
      buffer = new CircularBuffer<SectionTiming>(this.config.maxTimingsPerSection);
      this.sectionTimings.set(timing.name, buffer);
    }
    buffer.push(timing);
  }

  private getCurrentMemory(): number {
    const memUsage = process.memoryUsage();
    const heapUsed = memUsage.heapUsed;

    // Track peak
    if (heapUsed > this.peakMemory) {
      this.peakMemory = heapUsed;
    }

    // Track average
    this.memorySum += heapUsed;
    this.memorySampleCount++;

    return heapUsed;
  }

  private startMemorySampling(): void {
    if (this.memorySamplerTimer) return;

    this.memorySamplerTimer = setInterval(() => {
      if (!this.enabled) return;
      const memory = this.getCurrentMemory();
      this.memorySamples.push(memory);
    }, this.config.memorySampleInterval);
  }

  private stopMemorySampling(): void {
    if (this.memorySamplerTimer) {
      clearInterval(this.memorySamplerTimer);
      this.memorySamplerTimer = null;
    }
  }

  private calculatePercentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;

    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * percentile) - 1;
    return sorted[Math.max(0, index)];
  }

  private calculateAverage(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new PerformanceProfiler instance
 */
export function createProfiler(config?: Partial<ProfilerConfig>): PerformanceProfiler {
  return new PerformanceProfiler(config);
}

// ============================================================================
// Singleton Instance
// ============================================================================

let globalProfiler: PerformanceProfiler | null = null;

/**
 * Get the global profiler instance
 */
export function getGlobalProfiler(): PerformanceProfiler {
  if (!globalProfiler) {
    globalProfiler = createProfiler();
  }
  return globalProfiler;
}

/**
 * Reset the global profiler instance
 */
export function resetGlobalProfiler(): void {
  if (globalProfiler) {
    globalProfiler.destroy();
  }
  globalProfiler = null;
}
