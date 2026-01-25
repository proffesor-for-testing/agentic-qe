/**
 * Agent Config Factory - Helper for creating proper BaseAgentConfig in tests
 *
 * Simplifies agent instantiation in tests by providing a factory that creates
 * proper BaseAgentConfig from simplified test configuration.
 */

import { QEAgentType, AgentCapability, AgentContext } from '../../src/types';
import { BaseAgentConfig } from '../../src/agents/BaseAgent';
import { SwarmMemoryManager } from '../../src/core/memory/SwarmMemoryManager';
import { EventBus } from '../../src/core/EventBus';
import { EventEmitter } from 'events';

/**
 * Simplified agent configuration for tests
 */
export interface SimpleAgentConfig {
  agentId?: string;
  type: QEAgentType;
  capabilities?: string[];
  workingDirectory?: string;
  environment?: string;
  enablePatterns?: boolean;
  enableLearning?: boolean;
  targetImprovement?: number;
  gapDetection?: boolean;
  [key: string]: any; // Allow additional agent-specific config
}

/**
 * Create a proper BaseAgentConfig from simplified test configuration
 *
 * @param simple - Simplified agent configuration
 * @param memoryManager - SwarmMemoryManager instance (should be initialized)
 * @param eventBus - EventBus instance (should be initialized)
 * @returns Complete BaseAgentConfig ready for agent instantiation
 */
export function createAgentConfig(
  simple: SimpleAgentConfig,
  memoryManager: SwarmMemoryManager,
  eventBus: EventBus
): BaseAgentConfig & Record<string, any> {
  // Default capabilities based on agent type
  const defaultCapabilities = getDefaultCapabilities(simple.type);

  // Create capabilities array
  const capabilities: AgentCapability[] = (simple.capabilities || defaultCapabilities).map(name => ({
    name,
    version: '1.0.0',
    enabled: true,
    parameters: {}
  }));

  // Create agent context
  const context: AgentContext = {
    workingDirectory: simple.workingDirectory || process.cwd(),
    environment: simple.environment || 'test',
    configuration: {
      testMode: true,
      verbose: false
    }
  };

  // Build base configuration
  const baseConfig: BaseAgentConfig = {
    id: simple.agentId,
    type: simple.type,
    capabilities,
    context,
    memoryStore: memoryManager as any, // Cast to MemoryStore interface
    eventBus: eventBus as EventEmitter
  };

  // Spread additional configuration (agent-specific options)
  const additionalConfig: Record<string, any> = {};
  Object.keys(simple).forEach(key => {
    if (!['agentId', 'type', 'capabilities', 'workingDirectory', 'environment'].includes(key)) {
      additionalConfig[key] = simple[key];
    }
  });

  return {
    ...baseConfig,
    ...additionalConfig
  };
}

/**
 * Get default capabilities for an agent type
 */
function getDefaultCapabilities(type: QEAgentType): string[] {
  switch (type) {
    case QEAgentType.TEST_GENERATOR:
      return ['test-generation', 'pattern-matching', 'code-analysis'];

    case QEAgentType.COVERAGE_ANALYZER:
      return ['coverage-analysis', 'gap-detection', 'optimization'];

    case QEAgentType.FLAKY_TEST_HUNTER:
      return ['flaky-detection', 'ml-analysis', 'root-cause-identification'];

    case QEAgentType.TEST_EXECUTOR:
      return ['test-execution', 'parallel-execution', 'result-aggregation'];

    case QEAgentType.QUALITY_GATE:
      return ['quality-assessment', 'go-no-go-decision', 'risk-analysis'];

    case QEAgentType.PERFORMANCE_TESTER:
      return ['performance-testing', 'load-testing', 'bottleneck-detection'];

    case QEAgentType.SECURITY_SCANNER:
      return ['security-scanning', 'vulnerability-detection', 'cve-monitoring'];

    default:
      return ['basic-capability'];
  }
}

/**
 * Create multiple agent configs at once
 *
 * @param configs - Array of simplified configurations
 * @param memoryManager - Shared memory manager
 * @param eventBus - Shared event bus
 * @returns Array of complete BaseAgentConfig objects
 */
export function createAgentConfigs(
  configs: SimpleAgentConfig[],
  memoryManager: SwarmMemoryManager,
  eventBus: EventBus
): (BaseAgentConfig & Record<string, any>)[] {
  return configs.map(config => createAgentConfig(config, memoryManager, eventBus));
}

/**
 * Create agent config with custom capabilities
 */
export function createAgentConfigWithCapabilities(
  agentId: string,
  type: QEAgentType,
  capabilities: Array<{ name: string; version?: string; parameters?: Record<string, any> }>,
  memoryManager: SwarmMemoryManager,
  eventBus: EventBus,
  additionalConfig?: Record<string, any>
): BaseAgentConfig & Record<string, any> {
  const context: AgentContext = {
    workingDirectory: process.cwd(),
    environment: 'test',
    configuration: {
      testMode: true
    }
  };

  const agentCapabilities: AgentCapability[] = capabilities.map(cap => ({
    name: cap.name,
    version: cap.version || '1.0.0',
    enabled: true,
    parameters: cap.parameters || {}
  }));

  return {
    id: agentId,
    type,
    capabilities: agentCapabilities,
    context,
    memoryStore: memoryManager as any,
    eventBus: eventBus as EventEmitter,
    ...additionalConfig
  };
}
