/**
 * Agentic QE v3 - Default Test Phases
 * ADR-032: Time Crystal Scheduling
 *
 * Default test phase configurations for common testing scenarios.
 */

import { TestPhase, PhaseThresholds, PhaseAgentConfig } from './types';

// ============================================================================
// Standard Quality Thresholds
// ============================================================================

/**
 * Strict thresholds for unit tests
 */
export const STRICT_UNIT_THRESHOLDS: PhaseThresholds = {
  minPassRate: 0.99,
  maxFlakyRatio: 0.01,
  minCoverage: 0.80,
};

/**
 * Standard thresholds for integration tests
 */
export const STANDARD_INTEGRATION_THRESHOLDS: PhaseThresholds = {
  minPassRate: 0.95,
  maxFlakyRatio: 0.05,
  minCoverage: 0.70,
};

/**
 * Relaxed thresholds for E2E tests
 */
export const RELAXED_E2E_THRESHOLDS: PhaseThresholds = {
  minPassRate: 0.90,
  maxFlakyRatio: 0.10,
  minCoverage: 0.60,
};

/**
 * Performance test thresholds
 */
export const PERFORMANCE_THRESHOLDS: PhaseThresholds = {
  minPassRate: 0.95,
  maxFlakyRatio: 0.02,
  minCoverage: 0.50,
};

/**
 * Security scan thresholds
 */
export const SECURITY_THRESHOLDS: PhaseThresholds = {
  minPassRate: 1.0, // No security vulnerabilities allowed
  maxFlakyRatio: 0.0,
  minCoverage: 0.40,
};

// ============================================================================
// Standard Agent Configurations
// ============================================================================

/**
 * High parallelism for unit tests
 */
export const HIGH_PARALLELISM_CONFIG: PhaseAgentConfig = {
  agents: ['qe-test-executor'],
  parallelism: 8,
};

/**
 * Medium parallelism for integration tests
 */
export const MEDIUM_PARALLELISM_CONFIG: PhaseAgentConfig = {
  agents: ['qe-test-executor', 'qe-api-contract-validator'],
  parallelism: 4,
};

/**
 * Low parallelism for E2E tests
 */
export const LOW_PARALLELISM_CONFIG: PhaseAgentConfig = {
  agents: ['qe-test-executor', 'qe-visual-tester'],
  parallelism: 2,
};

/**
 * Sequential execution for performance/security
 */
export const SEQUENTIAL_CONFIG: PhaseAgentConfig = {
  agents: ['qe-performance-tester', 'qe-security-scanner'],
  parallelism: 1,
};

// ============================================================================
// Default Test Phases
// ============================================================================

/**
 * Default 4-phase test execution cycle
 *
 * Phase 0: Unit Tests - Fast, high coverage
 * Phase 1: Integration Tests - API and service integration
 * Phase 2: E2E Tests - User journey validation
 * Phase 3: Performance/Security - Non-functional requirements
 */
export const DEFAULT_TEST_PHASES: TestPhase[] = [
  {
    id: 0,
    name: 'Unit',
    testTypes: ['unit'],
    expectedDuration: 30000, // 30 seconds
    qualityThresholds: STRICT_UNIT_THRESHOLDS,
    agentConfig: HIGH_PARALLELISM_CONFIG,
  },
  {
    id: 1,
    name: 'Integration',
    testTypes: ['integration', 'contract'],
    expectedDuration: 120000, // 2 minutes
    qualityThresholds: STANDARD_INTEGRATION_THRESHOLDS,
    agentConfig: MEDIUM_PARALLELISM_CONFIG,
  },
  {
    id: 2,
    name: 'E2E',
    testTypes: ['e2e', 'visual', 'accessibility'],
    expectedDuration: 300000, // 5 minutes
    qualityThresholds: RELAXED_E2E_THRESHOLDS,
    agentConfig: LOW_PARALLELISM_CONFIG,
  },
  {
    id: 3,
    name: 'Performance',
    testTypes: ['performance', 'security'],
    expectedDuration: 600000, // 10 minutes
    qualityThresholds: PERFORMANCE_THRESHOLDS,
    agentConfig: SEQUENTIAL_CONFIG,
  },
];

/**
 * Fast 2-phase cycle for quick feedback
 */
export const FAST_TEST_PHASES: TestPhase[] = [
  {
    id: 0,
    name: 'Fast Unit',
    testTypes: ['unit'],
    expectedDuration: 15000, // 15 seconds
    qualityThresholds: {
      minPassRate: 0.95,
      maxFlakyRatio: 0.05,
      minCoverage: 0.70,
    },
    agentConfig: {
      agents: ['qe-test-executor'],
      parallelism: 16,
    },
  },
  {
    id: 1,
    name: 'Smoke Integration',
    testTypes: ['integration'],
    expectedDuration: 30000, // 30 seconds
    qualityThresholds: {
      minPassRate: 0.90,
      maxFlakyRatio: 0.10,
      minCoverage: 0.50,
    },
    agentConfig: {
      agents: ['qe-test-executor'],
      parallelism: 8,
    },
  },
];

/**
 * Comprehensive 6-phase cycle for thorough validation
 */
export const COMPREHENSIVE_TEST_PHASES: TestPhase[] = [
  {
    id: 0,
    name: 'Unit',
    testTypes: ['unit'],
    expectedDuration: 30000,
    qualityThresholds: STRICT_UNIT_THRESHOLDS,
    agentConfig: HIGH_PARALLELISM_CONFIG,
  },
  {
    id: 1,
    name: 'Contract',
    testTypes: ['contract'],
    expectedDuration: 60000,
    qualityThresholds: {
      minPassRate: 1.0,
      maxFlakyRatio: 0.0,
      minCoverage: 0.80,
    },
    agentConfig: {
      agents: ['qe-api-contract-validator'],
      parallelism: 4,
    },
  },
  {
    id: 2,
    name: 'Integration',
    testTypes: ['integration'],
    expectedDuration: 120000,
    qualityThresholds: STANDARD_INTEGRATION_THRESHOLDS,
    agentConfig: MEDIUM_PARALLELISM_CONFIG,
  },
  {
    id: 3,
    name: 'Visual',
    testTypes: ['visual', 'accessibility'],
    expectedDuration: 180000,
    qualityThresholds: {
      minPassRate: 0.95,
      maxFlakyRatio: 0.05,
      minCoverage: 0.70,
    },
    agentConfig: {
      agents: ['qe-visual-tester', 'qe-accessibility-tester'],
      parallelism: 2,
    },
  },
  {
    id: 4,
    name: 'E2E',
    testTypes: ['e2e'],
    expectedDuration: 300000,
    qualityThresholds: RELAXED_E2E_THRESHOLDS,
    agentConfig: LOW_PARALLELISM_CONFIG,
  },
  {
    id: 5,
    name: 'Security',
    testTypes: ['security', 'performance'],
    expectedDuration: 600000,
    qualityThresholds: SECURITY_THRESHOLDS,
    agentConfig: SEQUENTIAL_CONFIG,
  },
];

/**
 * Security-focused 3-phase cycle
 */
export const SECURITY_FOCUSED_PHASES: TestPhase[] = [
  {
    id: 0,
    name: 'Unit Security',
    testTypes: ['unit', 'security'],
    expectedDuration: 60000,
    qualityThresholds: {
      minPassRate: 1.0,
      maxFlakyRatio: 0.0,
      minCoverage: 0.80,
    },
    agentConfig: {
      agents: ['qe-test-executor', 'qe-security-scanner'],
      parallelism: 4,
    },
  },
  {
    id: 1,
    name: 'Vulnerability Scan',
    testTypes: ['security'],
    expectedDuration: 300000,
    qualityThresholds: SECURITY_THRESHOLDS,
    agentConfig: {
      agents: ['qe-security-scanner', 'qe-dependency-scanner'],
      parallelism: 2,
    },
  },
  {
    id: 2,
    name: 'Penetration Tests',
    testTypes: ['security', 'e2e'],
    expectedDuration: 600000,
    qualityThresholds: {
      minPassRate: 1.0,
      maxFlakyRatio: 0.0,
      minCoverage: 0.30,
    },
    agentConfig: {
      agents: ['qe-penetration-tester'],
      parallelism: 1,
    },
  },
];

// ============================================================================
// Phase Builder Utilities
// ============================================================================

/**
 * Create a custom test phase
 */
export function createPhase(
  id: number,
  name: string,
  options: {
    testTypes: TestPhase['testTypes'];
    expectedDuration?: number;
    thresholds?: Partial<PhaseThresholds>;
    agents?: string[];
    parallelism?: number;
  }
): TestPhase {
  return {
    id,
    name,
    testTypes: options.testTypes,
    expectedDuration: options.expectedDuration ?? 60000,
    qualityThresholds: {
      minPassRate: options.thresholds?.minPassRate ?? 0.95,
      maxFlakyRatio: options.thresholds?.maxFlakyRatio ?? 0.05,
      minCoverage: options.thresholds?.minCoverage ?? 0.70,
    },
    agentConfig: {
      agents: options.agents ?? ['qe-test-executor'],
      parallelism: options.parallelism ?? 4,
    },
  };
}

/**
 * Adjust phase durations for different environments
 */
export function scalePhases(
  phases: TestPhase[],
  durationMultiplier: number
): TestPhase[] {
  return phases.map(phase => ({
    ...phase,
    expectedDuration: Math.round(phase.expectedDuration * durationMultiplier),
  }));
}

/**
 * Adjust phase thresholds (relax or tighten)
 */
export function adjustThresholds(
  phases: TestPhase[],
  adjustment: {
    passRateAdjust?: number; // e.g., -0.05 to relax, +0.02 to tighten
    flakyRatioAdjust?: number;
    coverageAdjust?: number;
  }
): TestPhase[] {
  return phases.map(phase => ({
    ...phase,
    qualityThresholds: {
      minPassRate: Math.max(0, Math.min(1,
        phase.qualityThresholds.minPassRate + (adjustment.passRateAdjust ?? 0)
      )),
      maxFlakyRatio: Math.max(0, Math.min(1,
        phase.qualityThresholds.maxFlakyRatio + (adjustment.flakyRatioAdjust ?? 0)
      )),
      minCoverage: Math.max(0, Math.min(1,
        phase.qualityThresholds.minCoverage + (adjustment.coverageAdjust ?? 0)
      )),
    },
  }));
}

/**
 * Merge phases (combine test types)
 */
export function mergePhases(
  phases: TestPhase[],
  startIndex: number,
  endIndex: number,
  newName: string
): TestPhase[] {
  if (startIndex >= endIndex || startIndex < 0 || endIndex >= phases.length) {
    throw new Error('Invalid phase indices for merge');
  }

  const toMerge = phases.slice(startIndex, endIndex + 1);
  const merged: TestPhase = {
    id: startIndex,
    name: newName,
    testTypes: [...new Set(toMerge.flatMap(p => p.testTypes))],
    expectedDuration: toMerge.reduce((sum, p) => sum + p.expectedDuration, 0),
    qualityThresholds: {
      minPassRate: Math.min(...toMerge.map(p => p.qualityThresholds.minPassRate)),
      maxFlakyRatio: Math.max(...toMerge.map(p => p.qualityThresholds.maxFlakyRatio)),
      minCoverage: Math.min(...toMerge.map(p => p.qualityThresholds.minCoverage)),
    },
    agentConfig: {
      agents: [...new Set(toMerge.flatMap(p => p.agentConfig.agents))],
      parallelism: Math.max(...toMerge.map(p => p.agentConfig.parallelism)),
    },
  };

  const result = [
    ...phases.slice(0, startIndex),
    merged,
    ...phases.slice(endIndex + 1),
  ];

  // Renumber phase IDs
  return result.map((phase, index) => ({ ...phase, id: index }));
}

/**
 * Get recommended phases for a project type
 */
export function getPhasesForProjectType(
  projectType: 'frontend' | 'backend' | 'fullstack' | 'library' | 'microservice'
): TestPhase[] {
  switch (projectType) {
    case 'frontend':
      return [
        createPhase(0, 'Unit', {
          testTypes: ['unit'],
          expectedDuration: 30000,
          thresholds: { minPassRate: 0.98, minCoverage: 0.80 },
          parallelism: 8,
        }),
        createPhase(1, 'Component', {
          testTypes: ['integration'],
          expectedDuration: 60000,
          thresholds: { minPassRate: 0.95, minCoverage: 0.70 },
          parallelism: 4,
        }),
        createPhase(2, 'Visual/A11y', {
          testTypes: ['visual', 'accessibility'],
          expectedDuration: 180000,
          thresholds: { minPassRate: 0.90, minCoverage: 0.60 },
          agents: ['qe-visual-tester', 'qe-accessibility-tester'],
          parallelism: 2,
        }),
        createPhase(3, 'E2E', {
          testTypes: ['e2e'],
          expectedDuration: 300000,
          thresholds: { minPassRate: 0.85, maxFlakyRatio: 0.15, minCoverage: 0.50 },
          parallelism: 2,
        }),
      ];

    case 'backend':
      return [
        createPhase(0, 'Unit', {
          testTypes: ['unit'],
          expectedDuration: 30000,
          thresholds: { minPassRate: 0.99, minCoverage: 0.85 },
          parallelism: 8,
        }),
        createPhase(1, 'Integration', {
          testTypes: ['integration', 'contract'],
          expectedDuration: 120000,
          thresholds: { minPassRate: 0.95, minCoverage: 0.75 },
          agents: ['qe-test-executor', 'qe-api-contract-validator'],
          parallelism: 4,
        }),
        createPhase(2, 'Performance', {
          testTypes: ['performance'],
          expectedDuration: 300000,
          thresholds: { minPassRate: 0.95, minCoverage: 0.60 },
          agents: ['qe-performance-tester'],
          parallelism: 2,
        }),
        createPhase(3, 'Security', {
          testTypes: ['security'],
          expectedDuration: 600000,
          thresholds: { minPassRate: 1.0, maxFlakyRatio: 0.0, minCoverage: 0.40 },
          agents: ['qe-security-scanner'],
          parallelism: 1,
        }),
      ];

    case 'fullstack':
      return COMPREHENSIVE_TEST_PHASES;

    case 'library':
      return [
        createPhase(0, 'Unit', {
          testTypes: ['unit'],
          expectedDuration: 30000,
          thresholds: { minPassRate: 1.0, minCoverage: 0.95 },
          parallelism: 8,
        }),
        createPhase(1, 'Integration', {
          testTypes: ['integration'],
          expectedDuration: 60000,
          thresholds: { minPassRate: 0.98, minCoverage: 0.85 },
          parallelism: 4,
        }),
      ];

    case 'microservice':
      return [
        createPhase(0, 'Unit', {
          testTypes: ['unit'],
          expectedDuration: 20000,
          thresholds: { minPassRate: 0.99, minCoverage: 0.90 },
          parallelism: 8,
        }),
        createPhase(1, 'Contract', {
          testTypes: ['contract'],
          expectedDuration: 60000,
          thresholds: { minPassRate: 1.0, maxFlakyRatio: 0.0, minCoverage: 0.85 },
          agents: ['qe-api-contract-validator'],
          parallelism: 2,
        }),
        createPhase(2, 'Integration', {
          testTypes: ['integration'],
          expectedDuration: 120000,
          thresholds: { minPassRate: 0.95, minCoverage: 0.75 },
          parallelism: 4,
        }),
      ];

    default:
      return DEFAULT_TEST_PHASES;
  }
}
