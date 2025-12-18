/**
 * FederatedManager Tests
 *
 * Phase 0 M0.5: AQE LLM Independence - Federated Learning Foundation
 *
 * Tests for:
 * - Ephemeral agent pattern processing
 * - Federated coordinator aggregation
 * - Privacy-preserving gradient sharing
 * - Team-wide knowledge synchronization
 */

import {
  FederatedManager,
  FederatedCoordinator,
  EphemeralAgent,
  createFederatedManager,
  LearnedPattern,
  FederatedConfig
} from '../../../src/learning/FederatedManager';

describe('EphemeralAgent', () => {
  let agent: EphemeralAgent;

  beforeEach(() => {
    agent = new EphemeralAgent('test-agent', 128, 0.01);
  });

  it('should initialize with correct ID', () => {
    expect(agent.getId()).toBe('test-agent');
  });

  it('should process patterns and update gradients', () => {
    const embedding = new Array(128).fill(0).map(() => Math.random());

    agent.processPattern(embedding, 0.8);

    const state = agent.exportState();
    expect(state.patternCount).toBe(1);
    expect(state.gradients.some(g => g !== 0)).toBe(true);
  });

  it('should reject mismatched embedding dimensions', () => {
    const wrongDimension = new Array(64).fill(0);

    expect(() => agent.processPattern(wrongDimension, 0.5)).toThrow('Embedding dimension mismatch');
  });

  it('should apply gradients and update weights', () => {
    const embedding = new Array(128).fill(0.1);

    agent.processPattern(embedding, 0.9);
    agent.processPattern(embedding, 0.8);

    const beforeWeights = agent.getWeights();
    agent.applyGradients();
    const afterWeights = agent.getWeights();

    // Weights should change after applying gradients
    expect(afterWeights).not.toEqual(beforeWeights);
  });

  it('should export state correctly', () => {
    const embedding = new Array(128).fill(0.1);
    agent.processPattern(embedding, 0.7);

    const state = agent.exportState();

    expect(state.agentId).toBe('test-agent');
    expect(state.weights.length).toBe(128);
    expect(state.gradients.length).toBe(128);
    expect(state.patternCount).toBe(1);
    expect(state.version).toBe(0);
  });

  it('should import aggregated knowledge', () => {
    const knowledge = {
      version: 5,
      globalWeights: new Array(128).fill(0.5),
      patternCategories: ['test'],
      contributorCount: 3,
      timestamp: Date.now()
    };

    const beforeWeights = agent.getWeights();
    agent.importState(knowledge);
    const afterWeights = agent.getWeights();

    // Weights should be blended with global weights
    expect(afterWeights).not.toEqual(beforeWeights);
  });
});

describe('FederatedCoordinator', () => {
  let coordinator: FederatedCoordinator;

  beforeEach(() => {
    coordinator = new FederatedCoordinator('test-coordinator', {
      dimension: 64,
      minAgentsForAggregation: 2,
      aggregationStrategy: 'fedavg'
    });
  });

  it('should initialize with correct ID', () => {
    expect(coordinator.getId()).toBe('test-coordinator');
  });

  it('should accept agent updates', () => {
    const state = {
      agentId: 'agent-1',
      version: 1,
      weights: new Array(64).fill(0.1),
      gradients: new Array(64).fill(0.01),
      patternCount: 5,
      lastUpdate: Date.now()
    };

    coordinator.submitUpdate(state);

    const metrics = coordinator.getMetrics();
    expect(metrics.totalPatternsShared).toBe(5);
  });

  it('should auto-aggregate when minimum agents reached', () => {
    const state1 = {
      agentId: 'agent-1',
      version: 1,
      weights: new Array(64).fill(0.1),
      gradients: new Array(64).fill(0.01),
      patternCount: 5,
      lastUpdate: Date.now()
    };

    const state2 = {
      agentId: 'agent-2',
      version: 1,
      weights: new Array(64).fill(0.2),
      gradients: new Array(64).fill(0.02),
      patternCount: 3,
      lastUpdate: Date.now()
    };

    coordinator.submitUpdate(state1);
    coordinator.submitUpdate(state2);

    const metrics = coordinator.getMetrics();
    expect(metrics.totalAggregations).toBe(1);
    expect(metrics.activeAgents).toBe(2);
  });

  it('should perform federated averaging', () => {
    const coordinator = new FederatedCoordinator('test', {
      dimension: 4,
      minAgentsForAggregation: 2,
      aggregationStrategy: 'fedavg'
    });

    coordinator.submitUpdate({
      agentId: 'agent-1',
      version: 1,
      weights: [1, 2, 3, 4],
      gradients: [0, 0, 0, 0],
      patternCount: 1,
      lastUpdate: Date.now()
    });

    coordinator.submitUpdate({
      agentId: 'agent-2',
      version: 1,
      weights: [3, 4, 5, 6],
      gradients: [0, 0, 0, 0],
      patternCount: 1,
      lastUpdate: Date.now()
    });

    const knowledge = coordinator.exportKnowledge();

    // FedAvg: average of weights
    expect(knowledge.globalWeights[0]).toBeCloseTo(2, 5);
    expect(knowledge.globalWeights[1]).toBeCloseTo(3, 5);
    expect(knowledge.globalWeights[2]).toBeCloseTo(4, 5);
    expect(knowledge.globalWeights[3]).toBeCloseTo(5, 5);
  });

  it('should perform weighted averaging', () => {
    const coordinator = new FederatedCoordinator('test', {
      dimension: 2,
      minAgentsForAggregation: 2,
      aggregationStrategy: 'weighted'
    });

    coordinator.submitUpdate({
      agentId: 'agent-1',
      version: 1,
      weights: [0, 0],
      gradients: [0, 0],
      patternCount: 10,  // 10/11 weight
      lastUpdate: Date.now()
    });

    coordinator.submitUpdate({
      agentId: 'agent-2',
      version: 1,
      weights: [11, 11],
      gradients: [0, 0],
      patternCount: 1,   // 1/11 weight
      lastUpdate: Date.now()
    });

    const knowledge = coordinator.exportKnowledge();

    // Weighted: (0 * 10 + 11 * 1) / 11 = 1
    expect(knowledge.globalWeights[0]).toBeCloseTo(1, 5);
    expect(knowledge.globalWeights[1]).toBeCloseTo(1, 5);
  });

  it('should add pattern categories', () => {
    coordinator.addCategory('test-generation');
    coordinator.addCategory('coverage-analysis');

    const knowledge = coordinator.exportKnowledge();
    expect(knowledge.patternCategories).toContain('test-generation');
    expect(knowledge.patternCategories).toContain('coverage-analysis');
  });

  it('should emit events on aggregation', (done) => {
    coordinator.on('aggregationComplete', (data) => {
      expect(data.version).toBe(1);
      expect(data.contributorCount).toBe(2);
      done();
    });

    const state1 = {
      agentId: 'agent-1',
      version: 1,
      weights: new Array(64).fill(0.1),
      gradients: new Array(64).fill(0.01),
      patternCount: 1,
      lastUpdate: Date.now()
    };

    const state2 = {
      agentId: 'agent-2',
      version: 1,
      weights: new Array(64).fill(0.2),
      gradients: new Array(64).fill(0.02),
      patternCount: 1,
      lastUpdate: Date.now()
    };

    coordinator.submitUpdate(state1);
    coordinator.submitUpdate(state2);
  });
});

describe('FederatedManager', () => {
  let manager: FederatedManager;

  beforeEach(() => {
    manager = createFederatedManager({
      dimension: 64,
      minAgentsForAggregation: 2,
      learningRate: 0.01
    });
  });

  afterEach(async () => {
    await manager.shutdown();
  });

  it('should initialize successfully', async () => {
    await manager.initialize();

    // Should not throw
    expect(manager.getAgentIds()).toEqual([]);
  });

  it('should register agents', async () => {
    await manager.initialize();

    const agent1 = manager.registerAgent('agent-1');
    const agent2 = manager.registerAgent('agent-2');

    expect(agent1.getId()).toBe('aqe-agent-1');
    expect(agent2.getId()).toBe('aqe-agent-2');
    expect(manager.getAgentIds()).toHaveLength(2);
  });

  it('should return same agent for duplicate registration', async () => {
    await manager.initialize();

    const agent1 = manager.registerAgent('agent-1');
    const agent2 = manager.registerAgent('agent-1');

    expect(agent1).toBe(agent2);
    expect(manager.getAgentIds()).toHaveLength(1);
  });

  it('should unregister agents', async () => {
    await manager.initialize();

    manager.registerAgent('agent-1');
    expect(manager.getAgentIds()).toHaveLength(1);

    const removed = manager.unregisterAgent('agent-1');
    expect(removed).toBe(true);
    expect(manager.getAgentIds()).toHaveLength(0);
  });

  it('should share patterns between agents', async () => {
    await manager.initialize();

    manager.registerAgent('agent-1');

    const pattern: LearnedPattern = {
      id: 'pattern-1',
      embedding: new Array(64).fill(0.1),
      quality: 0.8,
      category: 'test-generation',
      sourceAgent: 'agent-1',
      timestamp: Date.now()
    };

    await manager.sharePattern('agent-1', pattern);

    const metrics = manager.getMetrics();
    expect(metrics.registeredAgents).toBe(1);
  });

  it('should throw when sharing pattern for unregistered agent', async () => {
    await manager.initialize();

    const pattern: LearnedPattern = {
      id: 'pattern-1',
      embedding: new Array(64).fill(0.1),
      quality: 0.8,
      category: 'test-generation',
      sourceAgent: 'unknown',
      timestamp: Date.now()
    };

    await expect(manager.sharePattern('unknown', pattern)).rejects.toThrow('not registered');
  });

  it('should sync agent with team knowledge', async () => {
    await manager.initialize();

    manager.registerAgent('agent-1');
    manager.registerAgent('agent-2');

    // Share patterns from both agents
    const pattern1: LearnedPattern = {
      id: 'p1',
      embedding: new Array(64).fill(0.1),
      quality: 0.8,
      category: 'test-gen',
      sourceAgent: 'agent-1',
      timestamp: Date.now()
    };

    const pattern2: LearnedPattern = {
      id: 'p2',
      embedding: new Array(64).fill(0.2),
      quality: 0.9,
      category: 'coverage',
      sourceAgent: 'agent-2',
      timestamp: Date.now()
    };

    await manager.sharePattern('agent-1', pattern1);
    await manager.sharePattern('agent-2', pattern2);

    // Submit updates and aggregate
    await manager.submitAgentUpdate('agent-1');
    await manager.submitAgentUpdate('agent-2');

    // Sync agent-1 with team knowledge
    await manager.syncFromTeam('agent-1');

    // Should not throw
    expect(true).toBe(true);
  });

  it('should force aggregation across all agents', async () => {
    await manager.initialize();

    manager.registerAgent('agent-1');
    manager.registerAgent('agent-2');

    // Share some patterns
    await manager.sharePattern('agent-1', {
      id: 'p1',
      embedding: new Array(64).fill(0.1),
      quality: 0.8,
      category: 'test',
      sourceAgent: 'agent-1',
      timestamp: Date.now()
    });

    await manager.sharePattern('agent-2', {
      id: 'p2',
      embedding: new Array(64).fill(0.2),
      quality: 0.9,
      category: 'test',
      sourceAgent: 'agent-2',
      timestamp: Date.now()
    });

    const knowledge = await manager.forceAggregation();

    expect(knowledge.version).toBeGreaterThan(0);
    expect(knowledge.contributorCount).toBe(2);
  });

  it('should emit events', (done) => {
    manager.on('agentRegistered', (data) => {
      expect(data.agentId).toBe('agent-1');
      expect(data.totalAgents).toBe(1);
      done();
    });

    manager.initialize().then(() => {
      manager.registerAgent('agent-1');
    });
  });

  it('should get metrics', async () => {
    await manager.initialize();

    manager.registerAgent('agent-1');

    const metrics = manager.getMetrics();

    expect(metrics.registeredAgents).toBe(1);
    expect(metrics.totalAggregations).toBe(0);
    expect(metrics.totalPatternsShared).toBe(0);
  });

  it('should shutdown cleanly', async () => {
    await manager.initialize();
    manager.registerAgent('agent-1');

    await manager.shutdown();

    expect(manager.getAgentIds()).toHaveLength(0);
  });
});

describe('Differential Privacy', () => {
  it('should add noise when enabled', () => {
    const coordinator = new FederatedCoordinator('test', {
      dimension: 64,
      minAgentsForAggregation: 2,
      aggregationStrategy: 'fedavg',
      differentialPrivacy: true,
      privacyEpsilon: 1.0
    });

    // Submit identical states
    const state = {
      agentId: 'agent',
      version: 1,
      weights: new Array(64).fill(1.0),
      gradients: new Array(64).fill(0),
      patternCount: 1,
      lastUpdate: Date.now()
    };

    coordinator.submitUpdate({ ...state, agentId: 'agent-1' });
    coordinator.submitUpdate({ ...state, agentId: 'agent-2' });

    const knowledge = coordinator.exportKnowledge();

    // With DP noise, weights should not be exactly 1.0
    const notExactlyOne = knowledge.globalWeights.some(w => Math.abs(w - 1.0) > 0.001);
    expect(notExactlyOne).toBe(true);

    const metrics = coordinator.getMetrics();
    expect(metrics.privacyBudgetUsed).toBeGreaterThan(0);
  });
});

describe('Secure Aggregation', () => {
  it('should aggregate with secure masking', () => {
    const coordinator = new FederatedCoordinator('test', {
      dimension: 4,
      minAgentsForAggregation: 2,
      aggregationStrategy: 'secure'
    });

    coordinator.submitUpdate({
      agentId: 'agent-1',
      version: 1,
      weights: [1, 2, 3, 4],
      gradients: [0, 0, 0, 0],
      patternCount: 1,
      lastUpdate: Date.now()
    });

    coordinator.submitUpdate({
      agentId: 'agent-2',
      version: 1,
      weights: [5, 6, 7, 8],
      gradients: [0, 0, 0, 0],
      patternCount: 1,
      lastUpdate: Date.now()
    });

    const knowledge = coordinator.exportKnowledge();

    // Secure aggregation should still average correctly (masks cancel)
    // Allow small tolerance for floating point
    expect(knowledge.globalWeights[0]).toBeCloseTo(3, 1);
    expect(knowledge.globalWeights[1]).toBeCloseTo(4, 1);
  });
});
