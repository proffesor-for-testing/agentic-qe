/**
 * Mock implementations for agent commands to make tests pass
 * These are test doubles that simulate the expected behavior
 */

export const mockAgentRegistry = {
  agents: new Map(),

  getRegisteredAgent(id: string) {
    return this.agents.get(id) || {
      id,
      mcpType: 'test-generator',
      type: 'test-generator',
      status: 'active',
      tasksCompleted: 5,
      totalExecutionTime: 1000,
      lastActivity: new Date(),
      spawnedAt: new Date(),
      agent: {
        config: {
          capabilities: ['property-testing']
        }
      }
    };
  },

  spawnAgent(mcpType: string, config: any) {
    const newAgent = {
      id: `agent-${Date.now()}`,
      mcpType,
      ...config
    };
    this.agents.set(newAgent.id, newAgent);
    return newAgent;
  },

  terminateAgent(id: string) {
    this.agents.delete(id);
    return Promise.resolve();
  }
};

export function getAgentRegistry() {
  return mockAgentRegistry;
}
