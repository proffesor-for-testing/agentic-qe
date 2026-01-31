/**
 * Agentic QE v3 - Performance Module
 * Barrel export for performance profiling, optimization, and benchmarking
 *
 * Issue #177 Targets:
 * - AG-UI streaming: <100ms p95 (from current 500ms)
 * - A2A task submission: <200ms p95
 * - A2UI surface generation: <150ms p95
 */

// ============================================================================
// Profiler
// ============================================================================

export {
  PerformanceProfiler,
  createProfiler,
  getGlobalProfiler,
  resetGlobalProfiler,
} from './profiler.js';

export type {
  ProfileSection,
  SectionTiming,
  SectionStats,
  ProfileResults,
  ProfilerConfig,
} from './profiler.js';

// ============================================================================
// Optimizer
// ============================================================================

export {
  PerformanceOptimizer,
  createOptimizer,
  ObjectPool,
  EventBatcher,
  LRUCache,
  DEFAULT_OPTIMIZER_CONFIG,
  DEFAULT_TECHNIQUES,
} from './optimizer.js';

export type {
  OptimizationTechniques,
  OptimizerConfig,
  OptimizationResult,
} from './optimizer.js';

// ============================================================================
// Benchmarks
// ============================================================================

export {
  BenchmarkSuite,
  createBenchmarkSuite,
  PERFORMANCE_TARGETS,
} from './benchmarks.js';

export type {
  BenchmarkResult,
  BenchmarkResults,
  BenchmarkConfig,
  BenchmarkFn,
} from './benchmarks.js';

// ============================================================================
// CI Gates
// ============================================================================

export {
  CIPerformanceGates,
  createCIGates,
  DEFAULT_GATE_CONFIG,
} from './ci-gates.js';

export type {
  GateCheckResult,
  CIReport,
  GateConfig,
} from './ci-gates.js';
