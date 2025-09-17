/**
 * Factory classes for QE agents
 * Provides standardized creation of agent instances
 */

import { QEAgentConfig, AgentType, AgentCapability } from '../../types';
import { QEMemory } from '../../memory/QEMemory';
import { HookManager } from '../../hooks';
import { Logger } from '../../utils/Logger';
import { QEAgent, AgentFactory, AgentRegistry } from '../base/QEAgent';

// Import all QE agent implementations
import { ExploratoryTestingNavigator } from '../exploratory-testing-navigator/ExploratoryTestingNavigator';
import { RiskOracle } from '../risk-oracle/RiskOracle';
import { TDDPairProgrammer } from '../tdd-pair-programmer/TDDPairProgrammer';
import { ProductionObserver } from '../production-observer/ProductionObserver';
import { DeploymentGuardian } from '../deployment-guardian/DeploymentGuardian';
import { RequirementsExplorer } from '../requirements-explorer/RequirementsExplorer';
import { TestAnalyzer } from '../test-analyzer/TestAnalyzer';
import { TestGenerator } from '../test-generator/TestGenerator';
import { TestPlanner } from '../test-planner/TestPlanner';
import { TestRunner } from '../test-runner/TestRunner';

/**
 * Factory for Exploratory Testing Navigator
 */
export class ExploratoryTestingNavigatorFactory implements AgentFactory {
  create(config: QEAgentConfig, memory: QEMemory, hooks: HookManager): QEAgent {
    const enhancedConfig = {
      ...config,
      type: 'exploratory-testing-navigator' as AgentType,
      capabilities: [
        'exploratory-session-management' as AgentCapability,
        'anomaly-detection' as AgentCapability,
        'pattern-recognition' as AgentCapability,
        'tour-execution' as AgentCapability,
        'observation-documentation' as AgentCapability,
        ...config.capabilities
      ]
    };

    return new ExploratoryTestingNavigator(
      enhancedConfig,
      memory,
      hooks,
      new Logger(`ExploratoryTestingNavigator:${config.name}`)
    );
  }
}

/**
 * Factory for Risk Oracle
 */
export class RiskOracleFactory implements AgentFactory {
  create(config: QEAgentConfig, memory: QEMemory, hooks: HookManager): QEAgent {
    const enhancedConfig = {
      ...config,
      type: 'risk-oracle' as AgentType,
      capabilities: [
        'risk-scoring' as AgentCapability,
        'predictive-analysis' as AgentCapability,
        'test-prioritization' as AgentCapability,
        'failure-prediction' as AgentCapability,
        'mitigation-planning' as AgentCapability,
        ...config.capabilities
      ]
    };

    return new RiskOracle(
      enhancedConfig,
      memory,
      hooks,
      new Logger(`RiskOracle:${config.name}`)
    );
  }
}

/**
 * Factory for TDD Pair Programmer
 */
export class TDDPairProgrammerFactory implements AgentFactory {
  create(config: QEAgentConfig, memory: QEMemory, hooks: HookManager): QEAgent {
    const enhancedConfig = {
      ...config,
      type: 'tdd-pair-programmer' as AgentType,
      capabilities: [
        'test-generation' as AgentCapability,
        'coverage-analysis' as AgentCapability,
        'refactoring-suggestions' as AgentCapability,
        'tdd-cycle-management' as AgentCapability,
        'style-adaptation' as AgentCapability,
        ...config.capabilities
      ]
    };

    return new TDDPairProgrammer(
      enhancedConfig,
      memory,
      hooks,
      new Logger(`TDDPairProgrammer:${config.name}`)
    );
  }
}

/**
 * Factory for Production Observer
 */
export class ProductionObserverFactory implements AgentFactory {
  create(config: QEAgentConfig, memory: QEMemory, hooks: HookManager): QEAgent {
    const enhancedConfig = {
      ...config,
      type: 'production-observer' as AgentType,
      capabilities: [
        'anomaly-detection' as AgentCapability,
        'synthetic-monitoring' as AgentCapability,
        'pattern-recognition' as AgentCapability,
        'root-cause-analysis' as AgentCapability,
        'test-gap-identification' as AgentCapability,
        ...config.capabilities
      ]
    };

    return new ProductionObserver(
      enhancedConfig,
      memory,
      hooks,
      new Logger(`ProductionObserver:${config.name}`)
    );
  }
}

/**
 * Factory for Deployment Guardian
 */
export class DeploymentGuardianFactory implements AgentFactory {
  create(config: QEAgentConfig, memory: QEMemory, hooks: HookManager): QEAgent {
    const enhancedConfig = {
      ...config,
      type: 'deployment-guardian' as AgentType,
      capabilities: [
        'smoke-test-generation' as AgentCapability,
        'canary-analysis' as AgentCapability,
        'statistical-testing' as AgentCapability,
        'rollback-automation' as AgentCapability,
        'progressive-deployment' as AgentCapability,
        ...config.capabilities
      ]
    };

    return new DeploymentGuardian(
      enhancedConfig,
      memory,
      hooks,
      new Logger(`DeploymentGuardian:${config.name}`)
    );
  }
}

/**
 * Factory for Requirements Explorer
 */
export class RequirementsExplorerFactory implements AgentFactory {
  create(config: QEAgentConfig, memory: QEMemory, hooks: HookManager): QEAgent {
    const enhancedConfig = {
      ...config,
      type: 'requirements-explorer' as AgentType,
      capabilities: [
        'requirement-ambiguity-detection' as AgentCapability,
        'testability-assessment' as AgentCapability,
        'risk-assessment' as AgentCapability,
        'charter-generation' as AgentCapability,
        'heuristic-application' as AgentCapability,
        ...config.capabilities
      ]
    };

    return new RequirementsExplorer(
      enhancedConfig,
      memory,
      hooks,
      new Logger(`RequirementsExplorer:${config.name}`)
    );
  }
}

/**
 * Factory for Test Analyzer
 */
export class TestAnalyzerFactory implements AgentFactory {
  create(config: QEAgentConfig, memory: QEMemory, hooks: HookManager): QEAgent {
    const enhancedConfig = {
      ...config,
      type: 'test-analyzer' as AgentType,
      capabilities: [
        'coverage-analysis' as AgentCapability,
        'test-analysis' as AgentCapability,
        'test-gap-identification' as AgentCapability,
        'metrics-collection' as AgentCapability,
        'anomaly-detection' as AgentCapability,
        'pattern-recognition' as AgentCapability,
        'performance-monitoring' as AgentCapability,
        ...config.capabilities
      ]
    };

    return new TestAnalyzer(
      enhancedConfig,
      memory,
      hooks,
      new Logger(`TestAnalyzer:${config.name}`)
    );
  }
}

/**
 * Factory for Test Generator
 */
export class TestGeneratorFactory implements AgentFactory {
  create(config: QEAgentConfig, memory: QEMemory, hooks: HookManager): QEAgent {
    const enhancedConfig = {
      ...config,
      type: 'test-generator' as AgentType,
      capabilities: [
        'test-generation' as AgentCapability,
        'test-analysis' as AgentCapability,
        'risk-assessment' as AgentCapability,
        'test-optimization' as AgentCapability,
        'coverage-analysis' as AgentCapability,
        'pattern-recognition' as AgentCapability,
        'bug-detection' as AgentCapability,
        ...config.capabilities
      ]
    };

    return new TestGenerator(
      enhancedConfig,
      memory,
      hooks,
      new Logger(`TestGenerator:${config.name}`)
    );
  }
}

/**
 * Factory for Test Planner
 */
export class TestPlannerFactory implements AgentFactory {
  create(config: QEAgentConfig, memory: QEMemory, hooks: HookManager): QEAgent {
    const enhancedConfig = {
      ...config,
      type: 'test-planner' as AgentType,
      capabilities: [
        'test-generation' as AgentCapability,
        'test-analysis' as AgentCapability,
        'risk-assessment' as AgentCapability,
        'test-optimization' as AgentCapability,
        'coverage-analysis' as AgentCapability,
        'pattern-recognition' as AgentCapability,
        'bug-detection' as AgentCapability,
        ...config.capabilities
      ]
    };

    return new TestPlanner(
      enhancedConfig,
      memory,
      hooks,
      new Logger(`TestPlanner:${config.name}`)
    );
  }
}

/**
 * Factory for Test Runner
 */
export class TestRunnerFactory implements AgentFactory {
  create(config: QEAgentConfig, memory: QEMemory, hooks: HookManager): QEAgent {
    const enhancedConfig = {
      ...config,
      type: 'test-runner' as AgentType,
      capabilities: [
        'test-generation' as AgentCapability,
        'test-analysis' as AgentCapability,
        'risk-assessment' as AgentCapability,
        'test-optimization' as AgentCapability,
        'coverage-analysis' as AgentCapability,
        'pattern-recognition' as AgentCapability,
        'bug-detection' as AgentCapability,
        ...config.capabilities
      ]
    };

    return new TestRunner(
      enhancedConfig,
      memory,
      hooks,
      new Logger(`TestRunner:${config.name}`)
    );
  }
}

/**
 * Register all QE agent factories
 */
export function registerQEAgents(): void {
  AgentRegistry.register('exploratory-testing-navigator', new ExploratoryTestingNavigatorFactory());
  AgentRegistry.register('risk-oracle', new RiskOracleFactory());
  AgentRegistry.register('tdd-pair-programmer', new TDDPairProgrammerFactory());
  AgentRegistry.register('production-observer', new ProductionObserverFactory());
  AgentRegistry.register('deployment-guardian', new DeploymentGuardianFactory());
  AgentRegistry.register('requirements-explorer', new RequirementsExplorerFactory());
  AgentRegistry.register('test-analyzer', new TestAnalyzerFactory());
  AgentRegistry.register('test-generator', new TestGeneratorFactory());
  AgentRegistry.register('test-planner', new TestPlannerFactory());
  AgentRegistry.register('test-runner', new TestRunnerFactory());
}

/**
 * Get default configuration for QE agents
 */
export function getDefaultQEAgentConfig(
  agentType: AgentType,
  overrides: Partial<QEAgentConfig> = {}
): QEAgentConfig {
  const baseConfig: QEAgentConfig = {
    id: `${agentType}-${Date.now()}`,
    name: agentType,
    type: agentType,
    capabilities: [],
    priority: 5,
    timeout: 300000, // 5 minutes
    retryCount: 3,
    metadata: {}
  };

  // Agent-specific defaults
  const agentDefaults: Record<string, Partial<QEAgentConfig>> = {
    'exploratory-testing-navigator': {
      capabilities: [
        'exploratory-session-management',
        'tour-execution',
        'observation-documentation'
      ],
      timeout: 1800000, // 30 minutes for exploration sessions
      priority: 7
    },
    'risk-oracle': {
      capabilities: [
        'risk-scoring' as AgentCapability,
        'predictive-analysis' as AgentCapability,
        'test-prioritization' as AgentCapability
      ],
      timeout: 600000, // 10 minutes for risk analysis
      priority: 8
    },
    'tdd-pair-programmer': {
      capabilities: [
        'test-generation' as AgentCapability,
        'coverage-analysis' as AgentCapability,
        'tdd-cycle-management' as AgentCapability
      ],
      timeout: 900000, // 15 minutes for TDD cycles
      priority: 6
    },
    'production-observer': {
      capabilities: [
        'anomaly-detection',
        'synthetic-monitoring' as AgentCapability,
        'test-gap-identification' as AgentCapability
      ],
      timeout: 3600000, // 1 hour for continuous monitoring
      priority: 9
    },
    'deployment-guardian': {
      capabilities: [
        'smoke-test-generation' as AgentCapability,
        'canary-analysis' as AgentCapability,
        'rollback-automation' as AgentCapability
      ],
      timeout: 1200000, // 20 minutes for deployment validation
      priority: 10
    },
    'requirements-explorer': {
      capabilities: [
        'requirement-ambiguity-detection' as AgentCapability,
        'testability-assessment' as AgentCapability,
        'charter-generation' as AgentCapability
      ],
      timeout: 600000, // 10 minutes for requirements analysis
      priority: 7
    },
    'test-analyzer': {
      capabilities: [
        'coverage-analysis' as AgentCapability,
        'test-analysis' as AgentCapability,
        'test-gap-identification' as AgentCapability
      ],
      timeout: 600000, // 10 minutes for test analysis
      priority: 6
    },
    'test-generator': {
      capabilities: [
        'test-generation' as AgentCapability,
        'test-analysis' as AgentCapability,
        'test-optimization' as AgentCapability
      ],
      timeout: 900000, // 15 minutes for test generation
      priority: 5
    },
    'test-planner': {
      capabilities: [
        'test-generation' as AgentCapability,
        'risk-assessment' as AgentCapability,
        'test-optimization' as AgentCapability
      ],
      timeout: 600000, // 10 minutes for test planning
      priority: 7
    },
    'test-runner': {
      capabilities: [
        'test-analysis' as AgentCapability,
        'coverage-analysis' as AgentCapability,
        'performance-monitoring' as AgentCapability
      ],
      timeout: 1800000, // 30 minutes for test execution
      priority: 8
    }
  };

  const agentSpecificDefaults = agentDefaults[agentType] || {};

  return {
    ...baseConfig,
    ...agentSpecificDefaults,
    ...overrides,
    type: agentType // Ensure type is not overridden
  };
}

/**
 * Create QE agent instance with sensible defaults
 */
export function createQEAgent(
  agentType: AgentType,
  memory: QEMemory,
  hooks: HookManager,
  overrides: Partial<QEAgentConfig> = {}
): QEAgent {
  const config = getDefaultQEAgentConfig(agentType, overrides);
  return AgentRegistry.create(config, memory, hooks);
}

/**
 * Batch create multiple QE agents
 */
export function createQEAgentBatch(
  agentTypes: AgentType[],
  memory: QEMemory,
  hooks: HookManager,
  commonOverrides: Partial<QEAgentConfig> = {}
): QEAgent[] {
  return agentTypes.map(type =>
    createQEAgent(type, memory, hooks, commonOverrides)
  );
}

/**
 * Get available QE agent types
 */
export function getQEAgentTypes(): AgentType[] {
  return [
    'exploratory-testing-navigator',
    'risk-oracle',
    'tdd-pair-programmer',
    'production-observer',
    'deployment-guardian',
    'requirements-explorer',
    'test-analyzer',
    'test-generator',
    'test-planner',
    'test-runner'
  ];
}

/**
 * Check if agent type is a QE agent
 */
export function isQEAgent(agentType: AgentType): boolean {
  return getQEAgentTypes().includes(agentType);
}