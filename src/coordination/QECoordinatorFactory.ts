/**
 * QE Coordinator Factory - Creates pre-configured coordinators for common testing scenarios
 */

import {
  QECoordinator,
  QECoordinatorConfig,
  QualityGate,
  QualityThreshold,
  QEPhase,
  SwarmConfig
} from './QECoordinator.js';

// ============================================================================
// Pre-configured Testing Scenarios
// ============================================================================

export type TestingScenario =
  | 'comprehensive-testing'  // Full QE workflow with all phases
  | 'api-testing'           // API-focused testing workflow
  | 'security-testing'      // Security-focused testing workflow
  | 'performance-testing'   // Performance-focused testing workflow
  | 'regression-testing'    // Regression testing workflow
  | 'smoke-testing'         // Quick smoke testing workflow
  | 'exploratory-testing'   // Exploratory testing workflow
  | 'accessibility-testing' // Accessibility-focused testing workflow
  | 'mobile-testing'        // Mobile application testing workflow
  | 'e2e-testing';          // End-to-end testing workflow

/**
 * Scenario configuration templates
 */
interface ScenarioTemplate {
  name: string;
  description: string;
  phases: QEPhase[];
  qualityGates: QualityGate[];
  swarmConfig: SwarmConfig;
  defaultConfig: Partial<QECoordinatorConfig>;
}

// ============================================================================
// QE Coordinator Factory Class
// ============================================================================

export class QECoordinatorFactory {
  private static readonly scenarioTemplates: Record<TestingScenario, ScenarioTemplate> = {
    'comprehensive-testing': {
      name: 'Comprehensive Testing',
      description: 'Full QE workflow covering all testing phases',
      phases: ['requirements', 'test-planning', 'test-execution', 'validation', 'reporting'],
      qualityGates: [
        QECoordinatorFactory.createQualityGate('requirements-gate', 'requirements', 'test-planning', [
          { metric: 'artifact-count', operator: 'gte', value: 2, weight: 0.5, critical: true },
          { metric: 'quality-score', operator: 'gte', value: 0.8, weight: 0.5, critical: false }
        ]),
        QECoordinatorFactory.createQualityGate('planning-gate', 'test-planning', 'test-execution', [
          { metric: 'test-coverage', operator: 'gte', value: 0.8, weight: 0.6, critical: true },
          { metric: 'artifact-count', operator: 'gte', value: 3, weight: 0.4, critical: false }
        ]),
        QECoordinatorFactory.createQualityGate('execution-gate', 'test-execution', 'validation', [
          { metric: 'quality-score', operator: 'gte', value: 0.85, weight: 0.7, critical: true },
          { metric: 'defect-density', operator: 'lte', value: 0.1, weight: 0.3, critical: false }
        ]),
        QECoordinatorFactory.createQualityGate('validation-gate', 'validation', 'reporting', [
          { metric: 'quality-score', operator: 'gte', value: 0.9, weight: 1.0, critical: true }
        ])
      ],
      swarmConfig: {
        topology: 'mesh',
        maxAgents: 8,
        minAgents: 2,
        scalingStrategy: 'adaptive',
        loadBalancing: true,
        failoverEnabled: true,
        communicationProtocol: 'event-bus'
      },
      defaultConfig: {
        neuralEnabled: true,
        metricsEnabled: true,
        persistenceEnabled: true,
        parallelExecution: false,
        timeout: 1800000, // 30 minutes
        retryLimit: 3,
        logLevel: 'info'
      }
    },

    'api-testing': {
      name: 'API Testing',
      description: 'API-focused testing workflow with contract validation',
      phases: ['requirements', 'test-planning', 'test-execution', 'validation'],
      qualityGates: [
        QECoordinatorFactory.createQualityGate('api-requirements-gate', 'requirements', 'test-planning', [
          { metric: 'artifact-count', operator: 'gte', value: 1, weight: 1.0, critical: true }
        ]),
        QECoordinatorFactory.createQualityGate('api-planning-gate', 'test-planning', 'test-execution', [
          { metric: 'test-coverage', operator: 'gte', value: 0.9, weight: 1.0, critical: true }
        ]),
        QECoordinatorFactory.createQualityGate('api-execution-gate', 'test-execution', 'validation', [
          { metric: 'quality-score', operator: 'gte', value: 0.95, weight: 1.0, critical: true }
        ])
      ],
      swarmConfig: {
        topology: 'star',
        maxAgents: 5,
        minAgents: 2,
        scalingStrategy: 'linear',
        loadBalancing: true,
        failoverEnabled: false,
        communicationProtocol: 'direct'
      },
      defaultConfig: {
        neuralEnabled: true,
        metricsEnabled: true,
        persistenceEnabled: false,
        parallelExecution: true,
        timeout: 900000, // 15 minutes
        retryLimit: 2,
        logLevel: 'info'
      }
    },

    'security-testing': {
      name: 'Security Testing',
      description: 'Security-focused testing workflow with vulnerability assessment',
      phases: ['requirements', 'test-planning', 'test-execution', 'validation', 'reporting'],
      qualityGates: [
        QECoordinatorFactory.createQualityGate('security-requirements-gate', 'requirements', 'test-planning', [
          { metric: 'quality-score', operator: 'gte', value: 0.9, weight: 1.0, critical: true }
        ]),
        QECoordinatorFactory.createQualityGate('security-planning-gate', 'test-planning', 'test-execution', [
          { metric: 'test-coverage', operator: 'gte', value: 0.95, weight: 1.0, critical: true }
        ]),
        QECoordinatorFactory.createQualityGate('security-execution-gate', 'test-execution', 'validation', [
          { metric: 'quality-score', operator: 'gte', value: 0.95, weight: 0.8, critical: true },
          { metric: 'defect-density', operator: 'eq', value: 0, weight: 0.2, critical: true }
        ]),
        QECoordinatorFactory.createQualityGate('security-validation-gate', 'validation', 'reporting', [
          { metric: 'quality-score', operator: 'gte', value: 0.98, weight: 1.0, critical: true }
        ])
      ],
      swarmConfig: {
        topology: 'hierarchical',
        maxAgents: 6,
        minAgents: 3,
        scalingStrategy: 'adaptive',
        loadBalancing: true,
        failoverEnabled: true,
        communicationProtocol: 'event-bus'
      },
      defaultConfig: {
        neuralEnabled: true,
        metricsEnabled: true,
        persistenceEnabled: true,
        parallelExecution: false,
        timeout: 2700000, // 45 minutes
        retryLimit: 1,
        logLevel: 'debug'
      }
    },

    'performance-testing': {
      name: 'Performance Testing',
      description: 'Performance-focused testing workflow with load testing',
      phases: ['test-planning', 'test-execution', 'validation', 'reporting'],
      qualityGates: [
        QECoordinatorFactory.createQualityGate('perf-planning-gate', 'test-planning', 'test-execution', [
          { metric: 'test-coverage', operator: 'gte', value: 0.8, weight: 1.0, critical: true }
        ]),
        QECoordinatorFactory.createQualityGate('perf-execution-gate', 'test-execution', 'validation', [
          { metric: 'execution-efficiency', operator: 'gte', value: 0.8, weight: 1.0, critical: true }
        ]),
        QECoordinatorFactory.createQualityGate('perf-validation-gate', 'validation', 'reporting', [
          { metric: 'quality-score', operator: 'gte', value: 0.85, weight: 1.0, critical: true }
        ])
      ],
      swarmConfig: {
        topology: 'ring',
        maxAgents: 10,
        minAgents: 3,
        scalingStrategy: 'exponential',
        loadBalancing: true,
        failoverEnabled: true,
        communicationProtocol: 'message-queue'
      },
      defaultConfig: {
        neuralEnabled: true,
        metricsEnabled: true,
        persistenceEnabled: true,
        parallelExecution: true,
        timeout: 3600000, // 60 minutes
        retryLimit: 2,
        logLevel: 'info'
      }
    },

    'regression-testing': {
      name: 'Regression Testing',
      description: 'Regression testing workflow for change validation',
      phases: ['test-planning', 'test-execution', 'validation'],
      qualityGates: [
        QECoordinatorFactory.createQualityGate('regression-planning-gate', 'test-planning', 'test-execution', [
          { metric: 'test-coverage', operator: 'gte', value: 0.75, weight: 1.0, critical: true }
        ]),
        QECoordinatorFactory.createQualityGate('regression-execution-gate', 'test-execution', 'validation', [
          { metric: 'quality-score', operator: 'gte', value: 0.9, weight: 0.7, critical: true },
          { metric: 'error-count', operator: 'eq', value: 0, weight: 0.3, critical: false }
        ])
      ],
      swarmConfig: {
        topology: 'star',
        maxAgents: 6,
        minAgents: 2,
        scalingStrategy: 'linear',
        loadBalancing: true,
        failoverEnabled: false,
        communicationProtocol: 'direct'
      },
      defaultConfig: {
        neuralEnabled: false,
        metricsEnabled: true,
        persistenceEnabled: false,
        parallelExecution: true,
        timeout: 1200000, // 20 minutes
        retryLimit: 2,
        logLevel: 'warn'
      }
    },

    'smoke-testing': {
      name: 'Smoke Testing',
      description: 'Quick smoke testing workflow for basic functionality validation',
      phases: ['test-execution', 'validation'],
      qualityGates: [
        QECoordinatorFactory.createQualityGate('smoke-execution-gate', 'test-execution', 'validation', [
          { metric: 'error-count', operator: 'eq', value: 0, weight: 1.0, critical: true }
        ])
      ],
      swarmConfig: {
        topology: 'star',
        maxAgents: 3,
        minAgents: 1,
        scalingStrategy: 'linear',
        loadBalancing: false,
        failoverEnabled: false,
        communicationProtocol: 'direct'
      },
      defaultConfig: {
        neuralEnabled: false,
        metricsEnabled: false,
        persistenceEnabled: false,
        parallelExecution: true,
        timeout: 300000, // 5 minutes
        retryLimit: 1,
        logLevel: 'error'
      }
    },

    'exploratory-testing': {
      name: 'Exploratory Testing',
      description: 'Exploratory testing workflow with session-based testing',
      phases: ['requirements', 'test-execution', 'validation', 'reporting'],
      qualityGates: [
        QECoordinatorFactory.createQualityGate('exploratory-requirements-gate', 'requirements', 'test-execution', [
          { metric: 'artifact-count', operator: 'gte', value: 1, weight: 1.0, critical: true }
        ]),
        QECoordinatorFactory.createQualityGate('exploratory-execution-gate', 'test-execution', 'validation', [
          { metric: 'artifact-count', operator: 'gte', value: 3, weight: 1.0, critical: false }
        ]),
        QECoordinatorFactory.createQualityGate('exploratory-validation-gate', 'validation', 'reporting', [
          { metric: 'quality-score', operator: 'gte', value: 0.7, weight: 1.0, critical: false }
        ])
      ],
      swarmConfig: {
        topology: 'mesh',
        maxAgents: 4,
        minAgents: 2,
        scalingStrategy: 'adaptive',
        loadBalancing: true,
        failoverEnabled: false,
        communicationProtocol: 'event-bus'
      },
      defaultConfig: {
        neuralEnabled: true,
        metricsEnabled: true,
        persistenceEnabled: true,
        parallelExecution: false,
        timeout: 2400000, // 40 minutes
        retryLimit: 3,
        logLevel: 'info'
      }
    },

    'accessibility-testing': {
      name: 'Accessibility Testing',
      description: 'Accessibility-focused testing workflow with WCAG compliance',
      phases: ['requirements', 'test-planning', 'test-execution', 'validation', 'reporting'],
      qualityGates: [
        QECoordinatorFactory.createQualityGate('a11y-requirements-gate', 'requirements', 'test-planning', [
          { metric: 'quality-score', operator: 'gte', value: 0.85, weight: 1.0, critical: true }
        ]),
        QECoordinatorFactory.createQualityGate('a11y-planning-gate', 'test-planning', 'test-execution', [
          { metric: 'test-coverage', operator: 'gte', value: 0.9, weight: 1.0, critical: true }
        ]),
        QECoordinatorFactory.createQualityGate('a11y-execution-gate', 'test-execution', 'validation', [
          { metric: 'quality-score', operator: 'gte', value: 0.95, weight: 1.0, critical: true }
        ]),
        QECoordinatorFactory.createQualityGate('a11y-validation-gate', 'validation', 'reporting', [
          { metric: 'defect-density', operator: 'eq', value: 0, weight: 1.0, critical: true }
        ])
      ],
      swarmConfig: {
        topology: 'hierarchical',
        maxAgents: 5,
        minAgents: 2,
        scalingStrategy: 'adaptive',
        loadBalancing: true,
        failoverEnabled: true,
        communicationProtocol: 'event-bus'
      },
      defaultConfig: {
        neuralEnabled: true,
        metricsEnabled: true,
        persistenceEnabled: true,
        parallelExecution: false,
        timeout: 2100000, // 35 minutes
        retryLimit: 2,
        logLevel: 'info'
      }
    },

    'mobile-testing': {
      name: 'Mobile Testing',
      description: 'Mobile application testing workflow with device compatibility',
      phases: ['requirements', 'test-planning', 'test-execution', 'validation', 'reporting'],
      qualityGates: [
        QECoordinatorFactory.createQualityGate('mobile-requirements-gate', 'requirements', 'test-planning', [
          { metric: 'artifact-count', operator: 'gte', value: 2, weight: 1.0, critical: true }
        ]),
        QECoordinatorFactory.createQualityGate('mobile-planning-gate', 'test-planning', 'test-execution', [
          { metric: 'test-coverage', operator: 'gte', value: 0.85, weight: 1.0, critical: true }
        ]),
        QECoordinatorFactory.createQualityGate('mobile-execution-gate', 'test-execution', 'validation', [
          { metric: 'quality-score', operator: 'gte', value: 0.9, weight: 0.8, critical: true },
          { metric: 'execution-efficiency', operator: 'gte', value: 0.7, weight: 0.2, critical: false }
        ]),
        QECoordinatorFactory.createQualityGate('mobile-validation-gate', 'validation', 'reporting', [
          { metric: 'quality-score', operator: 'gte', value: 0.88, weight: 1.0, critical: true }
        ])
      ],
      swarmConfig: {
        topology: 'mesh',
        maxAgents: 7,
        minAgents: 3,
        scalingStrategy: 'adaptive',
        loadBalancing: true,
        failoverEnabled: true,
        communicationProtocol: 'event-bus'
      },
      defaultConfig: {
        neuralEnabled: true,
        metricsEnabled: true,
        persistenceEnabled: true,
        parallelExecution: true,
        timeout: 2700000, // 45 minutes
        retryLimit: 3,
        logLevel: 'info'
      }
    },

    'e2e-testing': {
      name: 'End-to-End Testing',
      description: 'End-to-end testing workflow with full user journey validation',
      phases: ['requirements', 'test-planning', 'test-execution', 'validation', 'reporting'],
      qualityGates: [
        QECoordinatorFactory.createQualityGate('e2e-requirements-gate', 'requirements', 'test-planning', [
          { metric: 'quality-score', operator: 'gte', value: 0.8, weight: 1.0, critical: true }
        ]),
        QECoordinatorFactory.createQualityGate('e2e-planning-gate', 'test-planning', 'test-execution', [
          { metric: 'test-coverage', operator: 'gte', value: 0.85, weight: 1.0, critical: true }
        ]),
        QECoordinatorFactory.createQualityGate('e2e-execution-gate', 'test-execution', 'validation', [
          { metric: 'quality-score', operator: 'gte', value: 0.9, weight: 0.7, critical: true },
          { metric: 'defect-density', operator: 'lte', value: 0.05, weight: 0.3, critical: false }
        ]),
        QECoordinatorFactory.createQualityGate('e2e-validation-gate', 'validation', 'reporting', [
          { metric: 'quality-score', operator: 'gte', value: 0.92, weight: 1.0, critical: true }
        ])
      ],
      swarmConfig: {
        topology: 'hierarchical',
        maxAgents: 8,
        minAgents: 3,
        scalingStrategy: 'adaptive',
        loadBalancing: true,
        failoverEnabled: true,
        communicationProtocol: 'event-bus'
      },
      defaultConfig: {
        neuralEnabled: true,
        metricsEnabled: true,
        persistenceEnabled: true,
        parallelExecution: false,
        timeout: 3600000, // 60 minutes
        retryLimit: 2,
        logLevel: 'info'
      }
    }
  };

  // ========================================================================
  // Factory Methods
  // ========================================================================

  /**
   * Create a QE Coordinator for a specific testing scenario
   */
  public static createForScenario(
    scenario: TestingScenario,
    sessionId: string,
    overrides?: Partial<QECoordinatorConfig>
  ): QECoordinator {
    const template = this.scenarioTemplates[scenario];
    if (!template) {
      throw new Error(`Unknown testing scenario: ${scenario}`);
    }

    const config: QECoordinatorConfig = {
      sessionId,
      phases: template.phases,
      qualityGates: template.qualityGates,
      swarmConfig: template.swarmConfig,
      ...template.defaultConfig,
      ...overrides
    } as QECoordinatorConfig;

    return new QECoordinator(config);
  }

  /**
   * Create a custom QE Coordinator with full configuration
   */
  public static createCustom(config: QECoordinatorConfig): QECoordinator {
    return new QECoordinator(config);
  }

  /**
   * Create a QE Coordinator with minimal configuration (defaults to comprehensive testing)
   */
  public static createDefault(sessionId: string): QECoordinator {
    return this.createForScenario('comprehensive-testing', sessionId);
  }

  /**
   * Get available testing scenarios
   */
  public static getAvailableScenarios(): Array<{ scenario: TestingScenario; template: ScenarioTemplate }> {
    return Object.entries(this.scenarioTemplates).map(([scenario, template]) => ({
      scenario: scenario as TestingScenario,
      template
    }));
  }

  /**
   * Get scenario template for inspection
   */
  public static getScenarioTemplate(scenario: TestingScenario): ScenarioTemplate | null {
    return this.scenarioTemplates[scenario] || null;
  }

  // ========================================================================
  // Builder Methods
  // ========================================================================

  /**
   * Create a configuration builder for custom scenarios
   */
  public static createBuilder(sessionId: string): QECoordinatorConfigBuilder {
    return new QECoordinatorConfigBuilder(sessionId);
  }

  // ========================================================================
  // Helper Methods
  // ========================================================================

  private static createQualityGate(
    id: string,
    phase: QEPhase,
    nextPhase: QEPhase,
    thresholds: Array<Omit<QualityThreshold, 'metric'> & { metric: string }>
  ): QualityGate {
    return {
      id,
      name: `${phase} Quality Gate`,
      phase,
      nextPhase,
      thresholds: thresholds.map(t => ({
        ...t,
        metric: t.metric
      })),
      required: true,
      timeout: 300000, // 5 minutes
      retryLimit: 2
    };
  }
}

// ============================================================================
// Configuration Builder
// ============================================================================

/**
 * Builder pattern for creating custom QE Coordinator configurations
 */
export class QECoordinatorConfigBuilder {
  private config: Partial<QECoordinatorConfig>;

  constructor(sessionId: string) {
    this.config = {
      sessionId,
      phases: ['requirements', 'test-planning', 'test-execution', 'validation', 'reporting'],
      qualityGates: [],
      swarmConfig: {
        topology: 'mesh',
        maxAgents: 5,
        minAgents: 2,
        scalingStrategy: 'adaptive',
        loadBalancing: true,
        failoverEnabled: true,
        communicationProtocol: 'event-bus'
      },
      neuralEnabled: true,
      metricsEnabled: true,
      persistenceEnabled: true,
      parallelExecution: false,
      timeout: 1800000,
      retryLimit: 3,
      logLevel: 'info'
    };
  }

  /**
   * Set the phases to execute
   */
  public withPhases(phases: QEPhase[]): this {
    this.config.phases = phases;
    return this;
  }

  /**
   * Add a quality gate
   */
  public addQualityGate(gate: QualityGate): this {
    if (!this.config.qualityGates) {
      this.config.qualityGates = [];
    }
    this.config.qualityGates.push(gate);
    return this;
  }

  /**
   * Set swarm configuration
   */
  public withSwarmConfig(swarmConfig: Partial<SwarmConfig>): this {
    this.config.swarmConfig = { ...this.config.swarmConfig!, ...swarmConfig };
    return this;
  }

  /**
   * Enable/disable neural context
   */
  public withNeuralContext(enabled: boolean): this {
    this.config.neuralEnabled = enabled;
    return this;
  }

  /**
   * Enable/disable metrics collection
   */
  public withMetrics(enabled: boolean): this {
    this.config.metricsEnabled = enabled;
    return this;
  }

  /**
   * Enable/disable persistence
   */
  public withPersistence(enabled: boolean): this {
    this.config.persistenceEnabled = enabled;
    return this;
  }

  /**
   * Enable/disable parallel execution
   */
  public withParallelExecution(enabled: boolean): this {
    this.config.parallelExecution = enabled;
    return this;
  }

  /**
   * Set timeout and retry configuration
   */
  public withTimeout(timeout: number, retryLimit: number = 3): this {
    this.config.timeout = timeout;
    this.config.retryLimit = retryLimit;
    return this;
  }

  /**
   * Set log level
   */
  public withLogLevel(level: 'debug' | 'info' | 'warn' | 'error'): this {
    this.config.logLevel = level;
    return this;
  }

  /**
   * Build the configuration
   */
  public build(): QECoordinatorConfig {
    if (!this.config.sessionId) {
      throw new Error('SessionId is required');
    }

    return this.config as QECoordinatorConfig;
  }

  /**
   * Build and create the coordinator
   */
  public create(): QECoordinator {
    return new QECoordinator(this.build());
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create a basic quality threshold
 */
export function createQualityThreshold(
  metric: string,
  operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq',
  value: number | string,
  weight: number = 1.0,
  critical: boolean = false
): QualityThreshold {
  return {
    metric,
    operator,
    value,
    weight,
    critical
  };
}

/**
 * Create a quality gate with sensible defaults
 */
export function createQualityGate(
  id: string,
  name: string,
  phase: QEPhase,
  nextPhase: QEPhase,
  thresholds: QualityThreshold[]
): QualityGate {
  return {
    id,
    name,
    phase,
    nextPhase,
    thresholds,
    required: true,
    timeout: 300000, // 5 minutes
    retryLimit: 2
  };
}

/**
 * Create a swarm configuration with defaults
 */
export function createSwarmConfig(
  topology: 'hierarchical' | 'mesh' | 'ring' | 'star' = 'mesh',
  maxAgents: number = 5,
  minAgents: number = 2
): SwarmConfig {
  return {
    topology,
    maxAgents,
    minAgents,
    scalingStrategy: 'adaptive',
    loadBalancing: true,
    failoverEnabled: true,
    communicationProtocol: 'event-bus'
  };
}

export default QECoordinatorFactory;