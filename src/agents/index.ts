/**
 * Agent Registry System - Main Export Module
 *
 * This module provides a comprehensive agent registry system that can:
 * - Scan agents/ folder for YAML agent definitions
 * - Load and validate agent configurations
 * - Create a registry mapping agent names to their configurations
 * - Provide methods to spawn agents by name
 * - Integrate with CLI spawn command for dynamic agent execution
 */

// Core registry and spawner implementations
import { AgentRegistry, agentRegistry } from './agent-registry';
import { AgentSpawner, createAgentSpawner } from './agent-spawner';

export { AgentRegistry, agentRegistry, AgentSpawner, createAgentSpawner };

// Re-export types for convenience
export type {
  Agent,
  AgentRegistryEntry,
  SpawnConfig,
  OperationResult
} from '../types/agent';

/**
 * Quick start function to initialize the agent registry
 * and scan for available agents
 */
export async function initializeAgentSystem(options?: {
  agentsPath?: string;
  autoScan?: boolean;
}): Promise<{
  registry: AgentRegistry;
  spawner: AgentSpawner;
  availableAgents: any[];
  stats: any;
}> {
  // Initialize registry with custom options if provided
  const registry = new AgentRegistry(options);

  // Initialize the registry (scans for agents)
  await registry.initialize();

  // Create spawner
  const spawner = createAgentSpawner(registry);

  // Get available agents
  const availableAgents = registry.getAllAgents();

  // Get statistics
  const stats = registry.getStatistics();

  return {
    registry,
    spawner,
    availableAgents,
    stats
  };
}

// QE Agent implementations - TypeScript implementations
export * from './base/QEAgent';
export * from './exploratory-testing-navigator';
export * from './risk-oracle';
export * from './tdd-pair-programmer';
export * from './production-observer';
export * from './deployment-guardian';
export * from './requirements-explorer';
export * from './test-analyzer';
export * from './test-generator';
export * from './test-planner';
export * from './test-runner';
export * from './factories/QEAgentFactories';

// Default export for convenience
export default {
  initialize: initializeAgentSystem,
  registry: agentRegistry,
  createSpawner: createAgentSpawner
};