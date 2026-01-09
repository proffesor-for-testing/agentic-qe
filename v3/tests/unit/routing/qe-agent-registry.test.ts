/**
 * QE Agent Registry Tests
 * ADR-022: Adaptive QE Agent Routing
 */

import { describe, it, expect } from 'vitest';
import {
  QE_AGENT_REGISTRY,
  getAgentsByDomain,
  getAgentsByCapability,
  getAgentsByLanguage,
  getAgentsByFramework,
  getAgentsByComplexity,
  getAgentById,
  getAgentCounts,
} from '../../../src/routing/qe-agent-registry.js';
import type { QEDomain } from '../../../src/learning/qe-patterns.js';

describe('QE Agent Registry', () => {
  describe('Registry Contents', () => {
    it('should have 80 agents total', () => {
      expect(QE_AGENT_REGISTRY.length).toBe(80);
    });

    it('should have correct agent counts by category', () => {
      const counts = getAgentCounts();
      expect(counts.total).toBe(80);
      expect(counts.v3QE).toBeGreaterThan(30);
      expect(counts.n8n).toBeGreaterThan(10);
      expect(counts.general).toBeGreaterThan(5);
    });

    it('should have unique agent IDs', () => {
      const ids = QE_AGENT_REGISTRY.map(a => a.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should have required fields for all agents', () => {
      for (const agent of QE_AGENT_REGISTRY) {
        expect(agent.id).toBeTruthy();
        expect(agent.name).toBeTruthy();
        expect(agent.description).toBeTruthy();
        expect(agent.domains.length).toBeGreaterThan(0);
        expect(agent.capabilities.length).toBeGreaterThan(0);
        expect(agent.complexity).toBeDefined();
        expect(agent.complexity.min).toBeDefined();
        expect(agent.complexity.max).toBeDefined();
      }
    });

    it('should have valid complexity ranges', () => {
      const validComplexities = ['simple', 'medium', 'complex'];
      const complexityOrder = { simple: 0, medium: 1, complex: 2 };

      for (const agent of QE_AGENT_REGISTRY) {
        expect(validComplexities).toContain(agent.complexity.min);
        expect(validComplexities).toContain(agent.complexity.max);
        expect(complexityOrder[agent.complexity.min]).toBeLessThanOrEqual(
          complexityOrder[agent.complexity.max]
        );
      }
    });
  });

  describe('getAgentById', () => {
    it('should find agent by ID', () => {
      const agent = getAgentById('qe-test-generator');
      expect(agent).toBeDefined();
      expect(agent?.name).toBe('QE Test Generator');
    });

    it('should return undefined for unknown ID', () => {
      const agent = getAgentById('unknown-agent-123');
      expect(agent).toBeUndefined();
    });
  });

  describe('getAgentsByDomain', () => {
    it('should find agents for test-generation domain', () => {
      const agents = getAgentsByDomain('test-generation');
      expect(agents.length).toBeGreaterThan(5);
      expect(agents.every(a => a.domains.includes('test-generation'))).toBe(true);
    });

    it('should find agents for security-compliance domain', () => {
      const agents = getAgentsByDomain('security-compliance');
      expect(agents.length).toBeGreaterThan(3);
      expect(agents.every(a => a.domains.includes('security-compliance'))).toBe(true);
    });

    it('should return empty array for domain with no agents', () => {
      const agents = getAgentsByDomain('nonexistent-domain' as QEDomain);
      expect(agents.length).toBe(0);
    });
  });

  describe('getAgentsByCapability', () => {
    it('should find agents with unit-test capability', () => {
      const agents = getAgentsByCapability('unit-test');
      expect(agents.length).toBeGreaterThan(3);
      expect(agents.every(a => a.capabilities.includes('unit-test'))).toBe(true);
    });

    it('should find agents with security-scanning capability', () => {
      const agents = getAgentsByCapability('security-scanning');
      expect(agents.length).toBeGreaterThan(3);
      expect(agents.every(a => a.capabilities.includes('security-scanning'))).toBe(true);
    });

    it('should find agents with chaos-testing capability', () => {
      const agents = getAgentsByCapability('chaos-testing');
      expect(agents.length).toBeGreaterThan(1);
      expect(agents.every(a => a.capabilities.includes('chaos-testing'))).toBe(true);
    });
  });

  describe('getAgentsByLanguage', () => {
    it('should find agents supporting TypeScript', () => {
      const agents = getAgentsByLanguage('typescript');
      expect(agents.length).toBeGreaterThan(10);
      expect(agents.every(a => a.languages?.includes('typescript'))).toBe(true);
    });

    it('should find agents supporting Python', () => {
      const agents = getAgentsByLanguage('python');
      expect(agents.length).toBeGreaterThan(5);
      expect(agents.every(a => a.languages?.includes('python'))).toBe(true);
    });

    it('should find agents supporting Go', () => {
      const agents = getAgentsByLanguage('go');
      expect(agents.length).toBeGreaterThan(3);
      expect(agents.every(a => a.languages?.includes('go'))).toBe(true);
    });
  });

  describe('getAgentsByFramework', () => {
    it('should find agents supporting Jest', () => {
      const agents = getAgentsByFramework('jest');
      expect(agents.length).toBeGreaterThan(5);
      expect(agents.every(a => a.frameworks?.includes('jest'))).toBe(true);
    });

    it('should find agents supporting Playwright', () => {
      const agents = getAgentsByFramework('playwright');
      expect(agents.length).toBeGreaterThan(3);
      expect(agents.every(a => a.frameworks?.includes('playwright'))).toBe(true);
    });

    it('should find agents supporting pytest', () => {
      const agents = getAgentsByFramework('pytest');
      expect(agents.length).toBeGreaterThan(3);
      expect(agents.every(a => a.frameworks?.includes('pytest'))).toBe(true);
    });
  });

  describe('getAgentsByComplexity', () => {
    it('should find agents for simple complexity', () => {
      const agents = getAgentsByComplexity('simple');
      expect(agents.length).toBeGreaterThan(10);
    });

    it('should find agents for medium complexity', () => {
      const agents = getAgentsByComplexity('medium');
      expect(agents.length).toBeGreaterThan(30);
    });

    it('should find agents for complex tasks', () => {
      const agents = getAgentsByComplexity('complex');
      expect(agents.length).toBeGreaterThan(40);
    });

    it('should have progressively fewer agents for simple vs complex', () => {
      // More agents should handle complex tasks than only simple ones
      const simpleOnly = QE_AGENT_REGISTRY.filter(
        a => a.complexity.min === 'simple' && a.complexity.max === 'simple'
      );
      const complexCapable = getAgentsByComplexity('complex');
      expect(complexCapable.length).toBeGreaterThan(simpleOnly.length);
    });
  });

  describe('Agent Categories', () => {
    it('should have TDD specialists', () => {
      const tddAgents = QE_AGENT_REGISTRY.filter(
        a => a.capabilities.includes('tdd') || a.tags?.includes('tdd')
      );
      expect(tddAgents.length).toBeGreaterThanOrEqual(4);
    });

    it('should have n8n workflow testing agents', () => {
      const n8nAgents = QE_AGENT_REGISTRY.filter(a => a.id.startsWith('n8n-'));
      expect(n8nAgents.length).toBeGreaterThanOrEqual(15);
    });

    it('should have V3 specialized agents', () => {
      const v3Agents = QE_AGENT_REGISTRY.filter(
        a => a.id.startsWith('v3-') || a.tags?.includes('v3')
      );
      expect(v3Agents.length).toBeGreaterThanOrEqual(5);
    });

    it('should have swarm coordination agents', () => {
      const swarmAgents = QE_AGENT_REGISTRY.filter(
        a => a.tags?.includes('swarm') || a.tags?.includes('queen') || a.tags?.includes('hive')
      );
      expect(swarmAgents.length).toBeGreaterThanOrEqual(3);
    });

    it('should have consensus agents', () => {
      const consensusAgents = QE_AGENT_REGISTRY.filter(
        a => a.tags?.includes('consensus') || a.tags?.includes('byzantine') || a.tags?.includes('raft')
      );
      expect(consensusAgents.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Performance Metrics Initialization', () => {
    it('should initialize all agents with default performance values', () => {
      for (const agent of QE_AGENT_REGISTRY) {
        expect(agent.performanceScore).toBe(0.7);
        expect(agent.tasksCompleted).toBe(0);
        expect(agent.successRate).toBe(0);
        expect(agent.avgDurationMs).toBe(0);
      }
    });
  });
});
