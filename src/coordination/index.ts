/**
 * QE Coordination System - Entry Point
 * Exports all coordination components for the Quality Engineering framework
 */

// Import types for internal use
import {
  QECoordinator,
  type QEPhase,
  type QECoordinatorConfig,
  type PhaseStatus
} from './QECoordinator';
import {
  QECoordinatorFactory,
  QECoordinatorConfigBuilder,
  type TestingScenario,
  createQualityThreshold,
  createQualityGate,
  createSwarmConfig
} from './QECoordinatorFactory';

// Main coordinator exports
export {
  QECoordinator,
  type QECoordinatorConfig,
  type QEPhase,
  type QEPhaseContext,
  type PhaseStatus,
  type PhaseMetrics,
  type PhaseArtifact,
  type ArtifactType,
  type QualityGate,
  type QualityThreshold,
  type QualityGateResult,
  type ThresholdResult,
  type PhaseHandoff,
  type PhaseError,
  type NeuralContext,
  type TestPattern,
  type SuccessPrediction,
  type LearningData,
  type SwarmConfig,
  type SessionMetrics
} from './QECoordinator';

// Factory exports
export {
  QECoordinatorFactory,
  QECoordinatorConfigBuilder,
  type TestingScenario,
  createQualityThreshold,
  createQualityGate,
  createSwarmConfig
} from './QECoordinatorFactory';

// Re-export common types from main types module for convenience
export {
  type QEAgentConfig,
  type AgentType,
  type AgentCapability,
  type TestSession,
  type TestResult,
  type TestMetrics,
  type HookEventType,
  type QEHookEvent,
  type QEAgent,
  type AgentMetrics,
  type QEContext
} from '../types/index';

// ============================================================================
// Convenience Functions and Constants
// ============================================================================

/**
 * Default QE phases in typical execution order
 */
export const DEFAULT_QE_PHASES: QEPhase[] = [
  'requirements',
  'test-planning',
  'test-execution',
  'validation',
  'reporting'
];

/**
 * Common quality gate thresholds
 */
export const QUALITY_THRESHOLDS = {
  HIGH_QUALITY: 0.9,
  GOOD_QUALITY: 0.8,
  ACCEPTABLE_QUALITY: 0.7,
  MINIMUM_QUALITY: 0.6,
  HIGH_COVERAGE: 0.9,
  GOOD_COVERAGE: 0.8,
  MINIMUM_COVERAGE: 0.7,
  MAX_DEFECT_DENSITY: 0.1,
  HIGH_EFFICIENCY: 0.9,
  GOOD_EFFICIENCY: 0.8
} as const;

/**
 * Agent capability mappings for different testing types
 */
export const TESTING_CAPABILITIES = {
  API_TESTING: [
    'api-validation',
    'test-execution',
    'bug-detection',
    'performance-monitoring'
  ],
  SECURITY_TESTING: [
    'security-scanning',
    'risk-assessment',
    'failure-prediction',
    'test-analysis'
  ],
  PERFORMANCE_TESTING: [
    'performance-monitoring',
    'load-simulation',
    'metrics-collection',
    'test-optimization'
  ],
  ACCESSIBILITY_TESTING: [
    'accessibility-validation',
    'heuristic-application',
    'test-generation',
    'report-generation'
  ],
  MOBILE_TESTING: [
    'cross-platform-testing',
    'ui-automation',
    'visual-comparison',
    'test-execution'
  ],
  E2E_TESTING: [
    'ui-automation',
    'test-execution',
    'integration-testing',
    'regression-analysis'
  ]
} as const;

/**
 * Quick start function to create a coordinator for common scenarios
 */
export function createQECoordinator(
  scenario: TestingScenario,
  sessionId?: string,
  options?: {
    neuralEnabled?: boolean;
    parallelExecution?: boolean;
    logLevel?: 'debug' | 'info' | 'warn' | 'error';
    timeout?: number;
  }
): QECoordinator {
  const finalSessionId = sessionId || `qe-session-${Date.now()}`;

  return QECoordinatorFactory.createForScenario(scenario, finalSessionId, {
    neuralEnabled: options?.neuralEnabled,
    parallelExecution: options?.parallelExecution,
    logLevel: options?.logLevel,
    timeout: options?.timeout
  });
}

/**
 * Create a coordinator with builder pattern for complex configurations
 */
export function buildQECoordinator(sessionId?: string): QECoordinatorConfigBuilder {
  const finalSessionId = sessionId || `qe-session-${Date.now()}`;
  return QECoordinatorFactory.createBuilder(finalSessionId);
}

/**
 * Get recommended agent count based on testing scenario
 */
export function getRecommendedAgentCount(scenario: TestingScenario): number {
  const agentCountMap: Record<TestingScenario, number> = {
    'comprehensive-testing': 8,
    'api-testing': 5,
    'security-testing': 6,
    'performance-testing': 10,
    'regression-testing': 6,
    'smoke-testing': 3,
    'exploratory-testing': 4,
    'accessibility-testing': 5,
    'mobile-testing': 7,
    'e2e-testing': 8
  };

  return agentCountMap[scenario] || 5;
}

/**
 * Get estimated duration for testing scenarios (in milliseconds)
 */
export function getEstimatedDuration(scenario: TestingScenario): number {
  const durationMap: Record<TestingScenario, number> = {
    'comprehensive-testing': 1800000, // 30 minutes
    'api-testing': 900000,           // 15 minutes
    'security-testing': 2700000,     // 45 minutes
    'performance-testing': 3600000,  // 60 minutes
    'regression-testing': 1200000,   // 20 minutes
    'smoke-testing': 300000,         // 5 minutes
    'exploratory-testing': 2400000,  // 40 minutes
    'accessibility-testing': 2100000, // 35 minutes
    'mobile-testing': 2700000,       // 45 minutes
    'e2e-testing': 3600000           // 60 minutes
  };

  return durationMap[scenario] || 1800000;
}

/**
 * Validate coordinator configuration
 */
export function validateCoordinatorConfig(config: Partial<QECoordinatorConfig>): string[] {
  const errors: string[] = [];

  if (!config.sessionId) {
    errors.push('sessionId is required');
  }

  if (!config.phases || config.phases.length === 0) {
    errors.push('At least one phase must be specified');
  }

  if (config.swarmConfig) {
    if (config.swarmConfig.maxAgents < config.swarmConfig.minAgents) {
      errors.push('maxAgents must be greater than or equal to minAgents');
    }

    if (config.swarmConfig.minAgents < 1) {
      errors.push('minAgents must be at least 1');
    }
  }

  if (config.timeout && config.timeout < 30000) {
    errors.push('timeout must be at least 30 seconds');
  }

  if (config.retryLimit && config.retryLimit < 0) {
    errors.push('retryLimit cannot be negative');
  }

  return errors;
}

/**
 * Create a minimal testing configuration for quick starts
 */
export function createMinimalConfig(sessionId: string): QECoordinatorConfig {
  return {
    sessionId,
    phases: ['test-execution', 'validation'],
    qualityGates: [
      createQualityGate(
        'minimal-gate',
        'Minimal Quality Gate',
        'test-execution',
        'validation',
        [createQualityThreshold('error-count', 'eq', 0, 1.0, true)]
      )
    ],
    swarmConfig: createSwarmConfig('star', 3, 1),
    neuralEnabled: false,
    metricsEnabled: true,
    persistenceEnabled: false,
    parallelExecution: true,
    timeout: 600000, // 10 minutes
    retryLimit: 1,
    logLevel: 'info'
  };
}

/**
 * Create a comprehensive testing configuration with all features
 */
export function createComprehensiveConfig(sessionId: string): QECoordinatorConfig {
  return {
    sessionId,
    phases: DEFAULT_QE_PHASES,
    qualityGates: [
      createQualityGate('requirements-gate', 'Requirements Quality Gate', 'requirements', 'test-planning', [
        createQualityThreshold('quality-score', 'gte', QUALITY_THRESHOLDS.GOOD_QUALITY, 0.7, true),
        createQualityThreshold('artifact-count', 'gte', 2, 0.3, false)
      ]),
      createQualityGate('planning-gate', 'Planning Quality Gate', 'test-planning', 'test-execution', [
        createQualityThreshold('test-coverage', 'gte', QUALITY_THRESHOLDS.HIGH_COVERAGE, 0.8, true),
        createQualityThreshold('quality-score', 'gte', QUALITY_THRESHOLDS.GOOD_QUALITY, 0.2, false)
      ]),
      createQualityGate('execution-gate', 'Execution Quality Gate', 'test-execution', 'validation', [
        createQualityThreshold('quality-score', 'gte', QUALITY_THRESHOLDS.HIGH_QUALITY, 0.6, true),
        createQualityThreshold('defect-density', 'lte', QUALITY_THRESHOLDS.MAX_DEFECT_DENSITY, 0.2, false),
        createQualityThreshold('execution-efficiency', 'gte', QUALITY_THRESHOLDS.GOOD_EFFICIENCY, 0.2, false)
      ]),
      createQualityGate('validation-gate', 'Validation Quality Gate', 'validation', 'reporting', [
        createQualityThreshold('quality-score', 'gte', QUALITY_THRESHOLDS.HIGH_QUALITY, 1.0, true)
      ])
    ],
    swarmConfig: createSwarmConfig('mesh', 10, 3),
    neuralEnabled: true,
    metricsEnabled: true,
    persistenceEnabled: true,
    parallelExecution: false,
    timeout: 3600000, // 60 minutes
    retryLimit: 3,
    logLevel: 'info'
  };
}

// ============================================================================
// Type Guards and Utilities
// ============================================================================

/**
 * Type guard to check if a phase is valid
 */
export function isValidQEPhase(phase: string): phase is QEPhase {
  return ['requirements', 'test-planning', 'test-execution', 'validation', 'reporting'].includes(phase);
}

/**
 * Type guard to check if a testing scenario is valid
 */
export function isValidTestingScenario(scenario: string): scenario is TestingScenario {
  return [
    'comprehensive-testing',
    'api-testing',
    'security-testing',
    'performance-testing',
    'regression-testing',
    'smoke-testing',
    'exploratory-testing',
    'accessibility-testing',
    'mobile-testing',
    'e2e-testing'
  ].includes(scenario);
}

/**
 * Get phase order index for dependency checking
 */
export function getPhaseOrder(phase: QEPhase): number {
  const order: Record<QEPhase, number> = {
    'requirements': 0,
    'test-planning': 1,
    'test-execution': 2,
    'validation': 3,
    'reporting': 4
  };

  return order[phase] ?? -1;
}

/**
 * Check if phase dependencies are satisfied
 */
export function areDependenciesSatisfied(
  targetPhase: QEPhase,
  completedPhases: QEPhase[]
): boolean {
  const targetOrder = getPhaseOrder(targetPhase);

  // Check if all previous phases in the standard order are completed
  for (let i = 0; i < targetOrder; i++) {
    const requiredPhase = DEFAULT_QE_PHASES[i];
    if (!completedPhases.includes(requiredPhase)) {
      return false;
    }
  }

  return true;
}

// ============================================================================
// Event Types for Coordinator Integration
// ============================================================================

export interface CoordinatorEvent {
  type: 'coordinator-start' | 'coordinator-stop' | 'phase-change' | 'quality-gate' | 'error';
  timestamp: Date;
  sessionId: string;
  data: Record<string, unknown>;
}

export interface PhaseChangeEvent extends CoordinatorEvent {
  type: 'phase-change';
  data: {
    fromPhase?: QEPhase;
    toPhase: QEPhase;
    status: PhaseStatus;
  };
}

export interface QualityGateEvent extends CoordinatorEvent {
  type: 'quality-gate';
  data: {
    gateId: string;
    phase: QEPhase;
    passed: boolean;
    score: number;
  };
}

// ============================================================================
// Version and Metadata
// ============================================================================

export const COORDINATION_VERSION = '1.0.0';
export const SUPPORTED_NEURAL_FEATURES = [
  'pattern-recognition',
  'success-prediction',
  'adaptive-thresholds',
  'learning-storage'
] as const;

export const SUPPORTED_TOPOLOGIES = [
  'hierarchical',
  'mesh',
  'ring',
  'star'
] as const;

/**
 * Get coordination system metadata
 */
export function getCoordinationMetadata() {
  return {
    version: COORDINATION_VERSION,
    supportedPhases: DEFAULT_QE_PHASES,
    supportedScenarios: Object.keys(QECoordinatorFactory.getAvailableScenarios()),
    supportedTopologies: SUPPORTED_TOPOLOGIES,
    supportedNeuralFeatures: SUPPORTED_NEURAL_FEATURES,
    defaultTimeout: 1800000,
    defaultRetryLimit: 3,
    defaultLogLevel: 'info'
  };
}