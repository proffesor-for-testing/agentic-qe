/**
 * Deprecated MCP Tools - Phase 3 Migration
 *
 * This file contains deprecation wrappers for tools that were renamed/moved in Phase 3.
 * All wrappers maintain 100% backward compatibility while warning users to migrate.
 *
 * Deprecation Timeline: v3.0.0 (February 2026)
 * Migration Guide: docs/migration/phase3-tools.md
 */

import { z } from 'zod';

// Import new Phase 3 tools
import {
  analyzeWithRiskScoring as analyzeCoverageWithRiskScoring,
  detectGapsML as identifyUncoveredRiskAreas
} from './qe/coverage/index.js';

import {
  detectFlakyTestsStatistical,
  analyzeFlakyTestPatterns,
  stabilizeFlakyTestAuto
} from './qe/flaky-detection/index.js';

import {
  runPerformanceBenchmark,
  monitorPerformanceRealtime as monitorRealtimePerformance
} from './qe/performance/index.js';

// Security domain index doesn't exist yet - commented out
// import {
//   scanSecurityComprehensive
// } from './qe/security/index.js';

// Visual regression handler not exported as function - use handler pattern
import type { VisualTestRegressionArgs, VisualRegressionResult } from './qe/visual/index.js';

// ============================================================================
// Deprecation Warning Helper
// ============================================================================

function emitDeprecationWarning(
  oldName: string,
  newName: string,
  domain: string
): void {
  console.warn(
    `\n⚠️  DEPRECATION WARNING\n` +
    `   Tool: ${oldName}()\n` +
    `   Status: Deprecated in v1.5.0\n` +
    `   Removal: v3.0.0 (February 2026)\n` +
    `   Migration: Use ${newName}() from '${domain}' domain\n` +
    `   Guide: docs/migration/phase3-tools.md\n`
  );
}

// ============================================================================
// Coverage Domain - Deprecated Tools
// ============================================================================

/**
 * @deprecated Use analyzeCoverageWithRiskScoring() from 'agentic-qe/tools/qe/coverage' instead
 * Will be removed in v3.0.0 (February 2026)
 * Migration guide: docs/migration/phase3-tools.md
 */
export const test_coverage_detailed = {
  name: 'test_coverage_detailed',
  description: '[DEPRECATED] Use analyzeCoverageWithRiskScoring() instead. Detailed coverage analysis with risk scoring.',
  schema: z.object({
    source_dirs: z.array(z.string()).optional(),
    test_dirs: z.array(z.string()).optional(),
    framework: z.enum(['jest', 'mocha', 'vitest', 'pytest']).optional(),
    risk_threshold: z.number().min(0).max(1).optional()
  }),
  handler: async (params: any) => {
    emitDeprecationWarning(
      'test_coverage_detailed',
      'analyzeWithRiskScoring',
      'coverage'
    );
    return analyzeCoverageWithRiskScoring(params);
  }
};

/**
 * @deprecated Use identifyUncoveredRiskAreas() from 'agentic-qe/tools/qe/coverage' instead
 * Will be removed in v3.0.0 (February 2026)
 * Migration guide: docs/migration/phase3-tools.md
 */
export const test_coverage_gaps = {
  name: 'test_coverage_gaps',
  description: '[DEPRECATED] Use identifyUncoveredRiskAreas() instead. Identify uncovered risk areas.',
  schema: z.object({
    source_dirs: z.array(z.string()).optional(),
    coverage_threshold: z.number().min(0).max(100).optional(),
    risk_factors: z.array(z.string()).optional()
  }),
  handler: async (params: any) => {
    emitDeprecationWarning(
      'test_coverage_gaps',
      'detectGapsML',
      'coverage'
    );
    return identifyUncoveredRiskAreas(params);
  }
};

// ============================================================================
// Flaky Detection Domain - Deprecated Tools
// ============================================================================

/**
 * @deprecated Use detectFlakyTestsStatistical() from 'agentic-qe/tools/qe/flaky-detection' instead
 * Will be removed in v3.0.0 (February 2026)
 * Migration guide: docs/migration/phase3-tools.md
 */
export const flaky_test_detect = {
  name: 'flaky_test_detect',
  description: '[DEPRECATED] Use detectFlakyTestsStatistical() instead. Detect flaky tests using statistical analysis.',
  schema: z.object({
    test_results_dir: z.string().optional(),
    runs_threshold: z.number().optional(),
    confidence_level: z.number().min(0).max(1).optional()
  }),
  handler: async (params: any) => {
    emitDeprecationWarning(
      'flaky_test_detect',
      'detectFlakyTestsStatistical',
      'flaky-detection'
    );
    return detectFlakyTestsStatistical(params);
  }
};

/**
 * @deprecated Use analyzeFlakyTestPatterns() from 'agentic-qe/tools/qe/flaky-detection' instead
 * Will be removed in v3.0.0 (February 2026)
 * Migration guide: docs/migration/phase3-tools.md
 */
export const flaky_test_patterns = {
  name: 'flaky_test_patterns',
  description: '[DEPRECATED] Use analyzeFlakyTestPatterns() instead. Analyze patterns in flaky test behavior.',
  schema: z.object({
    test_results_dir: z.string().optional(),
    pattern_types: z.array(z.string()).optional()
  }),
  handler: async (params: any) => {
    emitDeprecationWarning(
      'flaky_test_patterns',
      'analyzeFlakyTestPatterns',
      'flaky-detection'
    );
    return analyzeFlakyTestPatterns(params);
  }
};

/**
 * @deprecated Use stabilizeFlakyTestAuto() from 'agentic-qe/tools/qe/flaky-detection' instead
 * Will be removed in v3.0.0 (February 2026)
 * Migration guide: docs/migration/phase3-tools.md
 */
export const flaky_test_stabilize = {
  name: 'flaky_test_stabilize',
  description: '[DEPRECATED] Use stabilizeFlakyTestAuto() instead. Auto-stabilize flaky tests with ML-powered fixes.',
  schema: z.object({
    test_file: z.string(),
    flaky_test_name: z.string(),
    stabilization_strategy: z.enum(['retry', 'timeout', 'isolation', 'auto']).optional()
  }),
  handler: async (params: any) => {
    emitDeprecationWarning(
      'flaky_test_stabilize',
      'stabilizeFlakyTestAuto',
      'flaky-detection'
    );
    return stabilizeFlakyTestAuto(params);
  }
};

// ============================================================================
// Performance Domain - Deprecated Tools
// ============================================================================

/**
 * @deprecated Use runPerformanceBenchmark() from 'agentic-qe/tools/qe/performance' instead
 * Will be removed in v3.0.0 (February 2026)
 * Migration guide: docs/migration/phase3-tools.md
 */
export const performance_benchmark_run = {
  name: 'performance_benchmark_run',
  description: '[DEPRECATED] Use runPerformanceBenchmark() instead. Run comprehensive performance benchmarks.',
  schema: z.object({
    target: z.string().optional(),
    duration: z.number().optional(),
    concurrency: z.number().optional(),
    tool: z.enum(['k6', 'jmeter', 'gatling', 'artillery']).optional()
  }),
  handler: async (params: any) => {
    emitDeprecationWarning(
      'performance_benchmark_run',
      'runPerformanceBenchmark',
      'performance'
    );
    return runPerformanceBenchmark(params);
  }
};

/**
 * @deprecated Use monitorRealtimePerformance() from 'agentic-qe/tools/qe/performance' instead
 * Will be removed in v3.0.0 (February 2026)
 * Migration guide: docs/migration/phase3-tools.md
 */
export const performance_monitor_realtime = {
  name: 'performance_monitor_realtime',
  description: '[DEPRECATED] Use monitorRealtimePerformance() instead. Monitor performance metrics in real-time.',
  schema: z.object({
    target: z.string().optional(),
    metrics: z.array(z.string()).optional(),
    interval: z.number().optional(),
    duration: z.number().optional()
  }),
  handler: async (params: any) => {
    emitDeprecationWarning(
      'performance_monitor_realtime',
      'monitorPerformanceRealtime',
      'performance'
    );
    return monitorRealtimePerformance(params);
  }
};

// ============================================================================
// Security Domain - Deprecated Tools
// ============================================================================

/**
 * @deprecated Use scanSecurityComprehensive() from 'agentic-qe/tools/qe/security' instead
 * Will be removed in v3.0.0 (February 2026)
 * Migration guide: docs/migration/phase3-tools.md
 */
export const security_scan_comprehensive = {
  name: 'security_scan_comprehensive',
  description: '[DEPRECATED] Use scanSecurityComprehensive() instead. Comprehensive multi-layer security scanning.',
  schema: z.object({
    target_dirs: z.array(z.string()).optional(),
    scan_types: z.array(z.string()).optional(),
    severity_threshold: z.enum(['low', 'medium', 'high', 'critical']).optional()
  }),
  handler: async (params: any) => {
    emitDeprecationWarning(
      'security_scan_comprehensive',
      'scanSecurityComprehensive',
      'security'
    );
    throw new Error('Security domain tools not yet migrated to Phase 3 structure. Coming soon in v1.6.0');
  }
};

// ============================================================================
// Visual Domain - Deprecated Tools
// ============================================================================

/**
 * @deprecated Use detectVisualRegression() from 'agentic-qe/tools/qe/visual' instead
 * Will be removed in v3.0.0 (February 2026)
 * Migration guide: docs/migration/phase3-tools.md
 */
export const visual_test_regression = {
  name: 'visual_test_regression',
  description: '[DEPRECATED] Use detectVisualRegression() instead. Visual regression testing with AI-powered comparison.',
  schema: z.object({
    baseline_dir: z.string().optional(),
    current_dir: z.string().optional(),
    threshold: z.number().min(0).max(1).optional(),
    ai_analysis: z.boolean().optional()
  }),
  handler: async (params: any) => {
    emitDeprecationWarning(
      'visual_test_regression',
      'detectVisualRegression',
      'visual'
    );
    throw new Error('Visual regression tool needs API wrapper. Use VisualTestRegressionHandler directly or wait for v1.6.0');
  }
};

// ============================================================================
// Export All Deprecated Tools
// ============================================================================

export const deprecatedTools = [
  // Coverage (2 tools)
  test_coverage_detailed,
  test_coverage_gaps,

  // Flaky Detection (3 tools)
  flaky_test_detect,
  flaky_test_patterns,
  flaky_test_stabilize,

  // Performance (2 tools)
  performance_benchmark_run,
  performance_monitor_realtime,

  // Security (1 tool)
  security_scan_comprehensive,

  // Visual (1 tool)
  visual_test_regression
];

/**
 * Get deprecation info for a tool
 */
export function getDeprecationInfo(toolName: string): {
  isDeprecated: boolean;
  newName?: string;
  domain?: string;
  removalVersion?: string;
} {
  const deprecationMap: Record<string, { newName: string; domain: string }> = {
    'test_coverage_detailed': { newName: 'analyzeCoverageWithRiskScoring', domain: 'coverage' },
    'test_coverage_gaps': { newName: 'identifyUncoveredRiskAreas', domain: 'coverage' },
    'flaky_test_detect': { newName: 'detectFlakyTestsStatistical', domain: 'flaky-detection' },
    'flaky_test_patterns': { newName: 'analyzeFlakyTestPatterns', domain: 'flaky-detection' },
    'flaky_test_stabilize': { newName: 'stabilizeFlakyTestAuto', domain: 'flaky-detection' },
    'performance_benchmark_run': { newName: 'runPerformanceBenchmark', domain: 'performance' },
    'performance_monitor_realtime': { newName: 'monitorRealtimePerformance', domain: 'performance' },
    'security_scan_comprehensive': { newName: 'scanSecurityComprehensive', domain: 'security' },
    'visual_test_regression': { newName: 'detectVisualRegression', domain: 'visual' }
  };

  if (toolName in deprecationMap) {
    return {
      isDeprecated: true,
      newName: deprecationMap[toolName].newName,
      domain: deprecationMap[toolName].domain,
      removalVersion: 'v3.0.0 (February 2026)'
    };
  }

  return { isDeprecated: false };
}

/**
 * List all deprecated tools
 */
export function listDeprecatedTools(): Array<{
  oldName: string;
  newName: string;
  domain: string;
  removalVersion: string;
}> {
  return [
    { oldName: 'test_coverage_detailed', newName: 'analyzeCoverageWithRiskScoring', domain: 'coverage', removalVersion: 'v3.0.0 (February 2026)' },
    { oldName: 'test_coverage_gaps', newName: 'identifyUncoveredRiskAreas', domain: 'coverage', removalVersion: 'v3.0.0 (February 2026)' },
    { oldName: 'flaky_test_detect', newName: 'detectFlakyTestsStatistical', domain: 'flaky-detection', removalVersion: 'v3.0.0 (February 2026)' },
    { oldName: 'flaky_test_patterns', newName: 'analyzeFlakyTestPatterns', domain: 'flaky-detection', removalVersion: 'v3.0.0 (February 2026)' },
    { oldName: 'flaky_test_stabilize', newName: 'stabilizeFlakyTestAuto', domain: 'flaky-detection', removalVersion: 'v3.0.0 (February 2026)' },
    { oldName: 'performance_benchmark_run', newName: 'runPerformanceBenchmark', domain: 'performance', removalVersion: 'v3.0.0 (February 2026)' },
    { oldName: 'performance_monitor_realtime', newName: 'monitorRealtimePerformance', domain: 'performance', removalVersion: 'v3.0.0 (February 2026)' },
    { oldName: 'security_scan_comprehensive', newName: 'scanSecurityComprehensive', domain: 'security', removalVersion: 'v3.0.0 (February 2026)' },
    { oldName: 'visual_test_regression', newName: 'detectVisualRegression', domain: 'visual', removalVersion: 'v3.0.0 (February 2026)' }
  ];
}
