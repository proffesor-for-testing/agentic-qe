/**
 * Agentic QE v3 - Swarm Topology Tests
 * ADR-034: Neural Topology Optimizer
 *
 * Tests for MutableSwarmTopology and topology builder functions.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  MutableSwarmTopology,
  createTopology,
  createAgent,
  buildMeshTopology,
  buildRingTopology,
  buildStarTopology,
  buildHierarchicalTopology,
} from '../../../src/neural-optimizer/swarm-topology';
import type { TopologyAgent } from '../../../src/neural-optimizer/types';

describe('MutableSwarmTopology', () => {
  let topology: MutableSwarmTopology;

  beforeEach(() => {
    topology = new MutableSwarmTopology('custom');
  });

  describe('initialization', () => {
    it('should create empty topology', () => {
      expect(topology.agents).toHaveLength(0);
      expect(topology.connections).toHaveLength(0);
      expect(topology.type).toBe('custom');
    });

    it('should accept different topology types', () => {
      const mesh = new MutableSwarmTopology('mesh');
      expect(mesh.type).toBe('mesh');

      const ring = new MutableSwarmTopology('ring');
      expect(ring.type).toBe('ring');
    });
  });

  describe('agent operations', () => {
    it('should add agents', () => {
      const agent = createAgent('agent-1', 'worker');
      topology.addAgent(agent);

      expect(topology.agents).toHaveLength(1);
      expect(topology.agents[0].id).toBe('agent-1');
    });

    it('should not add duplicate agents', () => {
      const agent = createAgent('agent-1', 'worker');
      topology.addAgent(agent);
      topology.addAgent(agent);

      expect(topology.agents).toHaveLength(1);
    });

    it('should remove agents', () => {
      const agent = createAgent('agent-1', 'worker');
      topology.addAgent(agent);

      const removed = topology.removeAgent('agent-1');

      expect(removed).toBe(true);
      expect(topology.agents).toHaveLength(0);
    });

    it('should return false when removing non-existent agent', () => {
      const removed = topology.removeAgent('non-existent');

      expect(removed).toBe(false);
    });

    it('should remove agent connections when agent is removed', () => {
      topology.addAgent(createAgent('agent-1', 'worker'));
      topology.addAgent(createAgent('agent-2', 'worker'));
      topology.addAgent(createAgent('agent-3', 'worker'));
      topology.addConnection('agent-1', 'agent-2');
      topology.addConnection('agent-1', 'agent-3');

      topology.removeAgent('agent-1');

      expect(topology.connections).toHaveLength(0);
    });

    it('should get agent by ID', () => {
      const agent = createAgent('agent-1', 'worker');
      topology.addAgent(agent);

      const retrieved = topology.getAgent('agent-1');

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe('agent-1');
    });

    it('should return undefined for non-existent agent', () => {
      const retrieved = topology.getAgent('non-existent');

      expect(retrieved).toBeUndefined();
    });

    it('should update agent status', () => {
      topology.addAgent(createAgent('agent-1', 'worker'));

      topology.updateAgentStatus('agent-1', 'busy');

      expect(topology.getAgent('agent-1')?.status).toBe('busy');
    });
  });

  describe('connection operations', () => {
    beforeEach(() => {
      topology.addAgent(createAgent('agent-1', 'worker'));
      topology.addAgent(createAgent('agent-2', 'worker'));
      topology.addAgent(createAgent('agent-3', 'worker'));
    });

    it('should add connections', () => {
      topology.addConnection('agent-1', 'agent-2');

      expect(topology.connections).toHaveLength(1);
      expect(topology.connections[0].from).toBe('agent-1');
      expect(topology.connections[0].to).toBe('agent-2');
    });

    it('should add connections with weight', () => {
      topology.addConnection('agent-1', 'agent-2', 0.5);

      expect(topology.connections[0].weight).toBe(0.5);
    });

    it('should default connection weight to 1.0', () => {
      topology.addConnection('agent-1', 'agent-2');

      expect(topology.connections[0].weight).toBe(1.0);
    });

    it('should not add duplicate connections', () => {
      topology.addConnection('agent-1', 'agent-2');
      topology.addConnection('agent-1', 'agent-2');

      expect(topology.connections).toHaveLength(1);
    });

    it('should not add connection to non-existent agents', () => {
      topology.addConnection('agent-1', 'non-existent');

      expect(topology.connections).toHaveLength(0);
    });

    it('should remove connections', () => {
      topology.addConnection('agent-1', 'agent-2');

      const removed = topology.removeConnection('agent-1', 'agent-2');

      expect(removed).toBe(true);
      expect(topology.connections).toHaveLength(0);
    });

    it('should remove bidirectional connections', () => {
      topology.addConnection('agent-1', 'agent-2');

      // Remove using reversed order
      const removed = topology.removeConnection('agent-2', 'agent-1');

      expect(removed).toBe(true);
      expect(topology.connections).toHaveLength(0);
    });

    it('should update connection weight', () => {
      topology.addConnection('agent-1', 'agent-2', 1.0);

      topology.updateConnectionWeight('agent-1', 'agent-2', 0.5);

      expect(topology.connections[0].weight).toBe(1.5);
    });

    it('should clamp connection weight', () => {
      topology.addConnection('agent-1', 'agent-2', 1.0);

      // Try to reduce below minimum
      topology.updateConnectionWeight('agent-1', 'agent-2', -100);

      expect(topology.connections[0].weight).toBe(0.01);

      // Try to increase above maximum
      topology.updateConnectionWeight('agent-1', 'agent-2', 100);

      expect(topology.connections[0].weight).toBe(10);
    });

    it('should check if connection exists', () => {
      topology.addConnection('agent-1', 'agent-2');

      expect(topology.hasConnection('agent-1', 'agent-2')).toBe(true);
      expect(topology.hasConnection('agent-2', 'agent-1')).toBe(true);
      expect(topology.hasConnection('agent-1', 'agent-3')).toBe(false);
    });

    it('should get agent connections', () => {
      topology.addConnection('agent-1', 'agent-2');
      topology.addConnection('agent-1', 'agent-3');

      const connections = topology.getAgentConnections('agent-1');

      expect(connections).toHaveLength(2);
    });

    it('should get agent degree', () => {
      topology.addConnection('agent-1', 'agent-2');
      topology.addConnection('agent-1', 'agent-3');

      expect(topology.getAgentDegree('agent-1')).toBe(2);
      expect(topology.getAgentDegree('agent-2')).toBe(1);
    });

    it('should get neighbors', () => {
      topology.addConnection('agent-1', 'agent-2');
      topology.addConnection('agent-1', 'agent-3');

      const neighbors = topology.getNeighbors('agent-1');

      expect(neighbors).toContain('agent-2');
      expect(neighbors).toContain('agent-3');
      expect(neighbors).toHaveLength(2);
    });
  });

  describe('topology metrics', () => {
    beforeEach(() => {
      topology.addAgent(createAgent('agent-1', 'worker'));
      topology.addAgent(createAgent('agent-2', 'worker'));
      topology.addAgent(createAgent('agent-3', 'worker'));
      topology.addAgent(createAgent('agent-4', 'worker'));
    });

    it('should calculate density', () => {
      // Max connections for 4 nodes = 6
      topology.addConnection('agent-1', 'agent-2');
      topology.addConnection('agent-1', 'agent-3');
      topology.addConnection('agent-1', 'agent-4');

      expect(topology.getDensity()).toBe(3 / 6);
    });

    it('should return 0 density for fewer than 2 agents', () => {
      const small = createTopology();
      small.addAgent(createAgent('agent-1', 'worker'));

      expect(small.getDensity()).toBe(0);
    });

    it('should calculate average degree', () => {
      topology.addConnection('agent-1', 'agent-2');
      topology.addConnection('agent-1', 'agent-3');
      // Degrees: agent-1=2, agent-2=1, agent-3=1, agent-4=0
      // Average = 4/4 = 1

      expect(topology.getAverageDegree()).toBe(1);
    });

    it('should calculate minimum degree', () => {
      topology.addConnection('agent-1', 'agent-2');
      topology.addConnection('agent-1', 'agent-3');
      // agent-4 has degree 0

      expect(topology.getMinDegree()).toBe(0);
    });

    it('should calculate average weight', () => {
      topology.addConnection('agent-1', 'agent-2', 1.0);
      topology.addConnection('agent-1', 'agent-3', 2.0);

      expect(topology.getAverageWeight()).toBe(1.5);
    });

    it('should calculate weight variance', () => {
      topology.addConnection('agent-1', 'agent-2', 1.0);
      topology.addConnection('agent-1', 'agent-3', 3.0);
      // Mean = 2.0, variance = ((1-2)^2 + (3-2)^2) / 2 = 1

      expect(topology.getWeightVariance()).toBe(1);
    });

    it('should calculate clustering coefficient', () => {
      // Create a triangle
      topology.addConnection('agent-1', 'agent-2');
      topology.addConnection('agent-2', 'agent-3');
      topology.addConnection('agent-1', 'agent-3');

      // Clustering coefficient for a triangle = 1.0
      const cc = topology.getClusteringCoefficient();
      expect(cc).toBeGreaterThan(0);
    });

    it('should get load statistics', () => {
      const stats = topology.getLoadStats();

      expect(stats.avg).toBeGreaterThanOrEqual(0);
      expect(stats.variance).toBeGreaterThanOrEqual(0);
      expect(stats.idle).toBeGreaterThanOrEqual(0);
      expect(stats.overloaded).toBeGreaterThanOrEqual(0);
    });
  });

  describe('serialization', () => {
    beforeEach(() => {
      topology.addAgent(createAgent('agent-1', 'worker'));
      topology.addAgent(createAgent('agent-2', 'worker'));
      topology.addConnection('agent-1', 'agent-2', 0.8);
    });

    it('should export to JSON', () => {
      const json = topology.toJSON();

      expect(json.type).toBe('custom');
      expect(json.agents).toHaveLength(2);
      expect(json.connections).toHaveLength(1);
    });

    it('should import from JSON', () => {
      const json = topology.toJSON();
      const imported = MutableSwarmTopology.fromJSON(json);

      expect(imported.agents).toHaveLength(2);
      expect(imported.connections).toHaveLength(1);
      expect(imported.connections[0].weight).toBe(0.8);
    });

    it('should create a clone', () => {
      const clone = topology.clone();

      // Modify original
      topology.addAgent(createAgent('agent-3', 'worker'));

      // Clone should be unaffected
      expect(clone.agents).toHaveLength(2);
      expect(topology.agents).toHaveLength(3);
    });
  });
});

describe('topology builders', () => {
  const agents: TopologyAgent[] = [
    createAgent('agent-1', 'worker'),
    createAgent('agent-2', 'worker'),
    createAgent('agent-3', 'worker'),
    createAgent('agent-4', 'worker'),
  ];

  describe('buildMeshTopology', () => {
    it('should create fully connected graph', () => {
      const topology = buildMeshTopology(agents);

      expect(topology.type).toBe('mesh');
      expect(topology.agents).toHaveLength(4);
      // Full mesh: n*(n-1)/2 = 4*3/2 = 6 connections
      expect(topology.connections).toHaveLength(6);
    });

    it('should have all pairs connected', () => {
      const topology = buildMeshTopology(agents);

      expect(topology.hasConnection('agent-1', 'agent-2')).toBe(true);
      expect(topology.hasConnection('agent-1', 'agent-3')).toBe(true);
      expect(topology.hasConnection('agent-1', 'agent-4')).toBe(true);
      expect(topology.hasConnection('agent-2', 'agent-3')).toBe(true);
      expect(topology.hasConnection('agent-2', 'agent-4')).toBe(true);
      expect(topology.hasConnection('agent-3', 'agent-4')).toBe(true);
    });
  });

  describe('buildRingTopology', () => {
    it('should create ring graph', () => {
      const topology = buildRingTopology(agents);

      expect(topology.type).toBe('ring');
      expect(topology.agents).toHaveLength(4);
      expect(topology.connections).toHaveLength(4);
    });

    it('should have each agent connected to neighbors', () => {
      const topology = buildRingTopology(agents);

      expect(topology.getAgentDegree('agent-1')).toBe(2);
      expect(topology.getAgentDegree('agent-2')).toBe(2);
      expect(topology.getAgentDegree('agent-3')).toBe(2);
      expect(topology.getAgentDegree('agent-4')).toBe(2);
    });
  });

  describe('buildStarTopology', () => {
    it('should create star graph with hub', () => {
      const topology = buildStarTopology(agents, 'agent-1');

      expect(topology.type).toBe('star');
      expect(topology.agents).toHaveLength(4);
      expect(topology.connections).toHaveLength(3);
    });

    it('should have hub connected to all others', () => {
      const topology = buildStarTopology(agents, 'agent-1');

      expect(topology.getAgentDegree('agent-1')).toBe(3);
      expect(topology.getAgentDegree('agent-2')).toBe(1);
      expect(topology.getAgentDegree('agent-3')).toBe(1);
      expect(topology.getAgentDegree('agent-4')).toBe(1);
    });
  });

  describe('buildHierarchicalTopology', () => {
    it('should create hierarchical graph', () => {
      const coordinator = createAgent('coordinator', 'coordinator');
      const workers = agents;

      const topology = buildHierarchicalTopology(coordinator, workers);

      expect(topology.type).toBe('hierarchical');
      expect(topology.agents).toHaveLength(5);
      expect(topology.connections).toHaveLength(4);
    });

    it('should have coordinator connected to all workers', () => {
      const coordinator = createAgent('coordinator', 'coordinator');
      const workers = agents;

      const topology = buildHierarchicalTopology(coordinator, workers);

      expect(topology.getAgentDegree('coordinator')).toBe(4);
    });
  });
});

describe('createAgent', () => {
  it('should create agent with default metrics', () => {
    const agent = createAgent('test-agent', 'worker');

    expect(agent.id).toBe('test-agent');
    expect(agent.type).toBe('worker');
    expect(agent.status).toBe('idle');
    expect(agent.metrics).toBeDefined();
    expect(agent.metrics?.currentLoad).toBe(0);
  });

  it('should accept custom options', () => {
    const agent = createAgent('test-agent', 'coordinator', {
      status: 'active',
      domain: 'test-execution',
      capabilities: ['test', 'analyze'],
    });

    expect(agent.status).toBe('active');
    expect(agent.domain).toBe('test-execution');
    expect(agent.capabilities).toContain('test');
  });
});

describe('createTopology', () => {
  it('should create empty topology with default type', () => {
    const topology = createTopology();

    expect(topology.type).toBe('custom');
    expect(topology.agents).toHaveLength(0);
  });

  it('should create topology with specified type', () => {
    const topology = createTopology('mesh');

    expect(topology.type).toBe('mesh');
  });
});
