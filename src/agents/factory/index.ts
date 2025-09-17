/**
 * Agent Factory Module
 * Provides dynamic agent creation from YAML definitions
 */

export {
  DefaultAgentFactory,
  AgentFactoryBuilder,
  createAgentFactory,
  agentFactory
} from './agent-factory';

export type {
  Agent,
  AgentInstance,
  AgentFactoryConfig,
  AgentEvent
} from './agent-factory';

import { DefaultAgentFactory, createAgentFactory } from './agent-factory';

/**
 * Quick start function to create factory with agents loaded
 */
export async function quickStartFactory(agentsDirectory: string = './agents') {
  const factory = createAgentFactory(agentsDirectory);
  const availableAgents = await factory.getAvailableAgents();

  return {
    factory,
    availableAgents,
    createAgent: (name: string) => factory.createFromName(name),
    findByCapabilities: (caps: string[]) => factory.findAgentsByCapabilities(caps)
  };
}

/**
 * Helper to find best agent for a task
 */
export async function findBestAgentForTask(
  factory: DefaultAgentFactory,
  taskDescription: string,
  requiredCapabilities: string[]
): Promise<{ agent: any | null; candidates: string[] }> {
  const candidates = await factory.findAgentsByCapabilities(requiredCapabilities);

  if (candidates.length === 0) {
    return { agent: null, candidates: [] };
  }

  // For now, just pick the first one
  // In a real implementation, this could use AI to match task to best agent
  const agent = await factory.createFromName(candidates[0]);

  return { agent, candidates };
}