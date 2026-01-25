/**
 * Client-Side Data Filtering Layer (QW-1) - Handler Exports
 *
 * This module exports all filtered handler implementations that apply
 * client-side filtering to reduce output tokens by 95%+.
 *
 * **Performance Impact Summary (Registered Tools):**
 * - Test Execution: 30,000 → 800 tokens (97.3% reduction)
 * - Performance Benchmarks: 60,000 → 1,000 tokens (98.3% reduction)
 * - Quality Assessment: 20,000 → 500 tokens (97.5% reduction)
 *
 * **Note:** Coverage, Flaky, and Security filtering were removed as they
 * overlap with existing registered tools (coverage_analyze_sublinear,
 * flaky_detect_statistical, security_scan_comprehensive).
 *
 * @version 2.0.0 - Cleanup: Removed overlapping handlers
 * @author Agentic QE Team
 * @see docs/planning/mcp-improvement-plan-revised.md (QW-1 section)
 */

// Test Execution
export {
  executeTestsFiltered,
  type TestResult,
  type TestExecutionParams,
  type FilteredTestExecutionResult
} from './test-executor-filtered.js';

// Performance Benchmarking
export {
  runBenchmarksFiltered,
  type PerformanceResult,
  type PerformanceBenchmarkParams,
  type FilteredPerformanceResult
} from './performance-tester-filtered.js';

// Quality Assessment
export {
  assessQualityFiltered,
  type QualityIssue,
  type QualityAssessmentParams,
  type FilteredQualityResult
} from './quality-assessor-filtered.js';

/**
 * Usage Example:
 *
 * ```typescript
 * import { executeTestsFiltered } from './filtered';
 *
 * // Full test results loaded locally
 * const fullTestResults = await runTests(testSuites);
 *
 * // Apply filtering - returns only failures + summary
 * const result = await executeTestsFiltered(
 *   { testSuites: ['unit', 'integration'], topN: 10 },
 *   fullTestResults
 * );
 *
 * // Output: 800 tokens instead of 30,000 (97.3% reduction)
 * console.log(result.summary);
 * console.log(result.failures);
 * ```
 */
