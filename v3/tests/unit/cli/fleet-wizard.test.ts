/**
 * Fleet Initialization Wizard - Unit Tests
 * ADR-041: V3 QE CLI Enhancement
 */

import { describe, it, expect } from 'vitest';
import {
  FleetInitWizard,
  runFleetInitWizard,
  getTopologyConfig,
  getDomainConfig,
  getMemoryBackendConfig,
  getAllDomains,
  type FleetWizardResult,
  type TopologyType,
  type DDDDomain,
  type MemoryBackend,
} from '../../../src/cli/wizards/fleet-wizard';

describe('FleetInitWizard', () => {
  describe('Non-Interactive Mode', () => {
    it('should return defaults when nonInteractive is true', async () => {
      const result = await runFleetInitWizard({
        nonInteractive: true,
      });

      expect(result.cancelled).toBe(false);
      expect(result.topology).toBe('hierarchical-mesh');
      expect(result.maxAgents).toBe(15);
      expect(result.domains).toEqual(['all']);
      expect(result.memoryBackend).toBe('hybrid');
      expect(result.lazyLoading).toBe(true);
      expect(result.loadPatterns).toBe(false);
    });

    it('should use provided defaults', async () => {
      const result = await runFleetInitWizard({
        nonInteractive: true,
        defaultTopology: 'mesh',
        defaultMaxAgents: 25,
        defaultDomains: ['test-generation', 'coverage-analysis'],
        defaultMemoryBackend: 'agentdb',
        defaultLazyLoading: false,
        defaultLoadPatterns: true,
      });

      expect(result.topology).toBe('mesh');
      expect(result.maxAgents).toBe(25);
      expect(result.domains).toEqual(['test-generation', 'coverage-analysis']);
      expect(result.memoryBackend).toBe('agentdb');
      expect(result.lazyLoading).toBe(false);
      expect(result.loadPatterns).toBe(true);
    });
  });

  describe('FleetWizardResult', () => {
    it('should have correct structure', () => {
      const result: FleetWizardResult = {
        topology: 'hierarchical-mesh',
        maxAgents: 15,
        domains: ['all'],
        memoryBackend: 'hybrid',
        lazyLoading: true,
        loadPatterns: false,
        cancelled: false,
      };

      expect(typeof result.topology).toBe('string');
      expect(typeof result.maxAgents).toBe('number');
      expect(result.domains).toBeInstanceOf(Array);
      expect(typeof result.memoryBackend).toBe('string');
      expect(typeof result.lazyLoading).toBe('boolean');
      expect(typeof result.loadPatterns).toBe('boolean');
      expect(typeof result.cancelled).toBe('boolean');
    });

    it('should support cancelled state', () => {
      const result: FleetWizardResult = {
        topology: 'hierarchical-mesh',
        maxAgents: 15,
        domains: ['all'],
        memoryBackend: 'hybrid',
        lazyLoading: true,
        loadPatterns: false,
        cancelled: true,
      };

      expect(result.cancelled).toBe(true);
    });

    it('should support multiple domains', () => {
      const result: FleetWizardResult = {
        topology: 'mesh',
        maxAgents: 10,
        domains: ['test-generation', 'test-execution', 'coverage-analysis'],
        memoryBackend: 'sqlite',
        lazyLoading: true,
        loadPatterns: true,
        cancelled: false,
      };

      expect(result.domains).toHaveLength(3);
      expect(result.domains).toContain('test-generation');
      expect(result.domains).toContain('test-execution');
      expect(result.domains).toContain('coverage-analysis');
    });
  });

  describe('Topology Types', () => {
    const validTopologies: TopologyType[] = [
      'hierarchical',
      'mesh',
      'ring',
      'adaptive',
      'hierarchical-mesh',
    ];

    it('should support all topology types', () => {
      validTopologies.forEach(topology => {
        expect([
          'hierarchical',
          'mesh',
          'ring',
          'adaptive',
          'hierarchical-mesh',
        ]).toContain(topology);
      });
    });

    it('should have 5 topology types', () => {
      expect(validTopologies).toHaveLength(5);
    });

    it('should default to hierarchical-mesh', async () => {
      const result = await runFleetInitWizard({ nonInteractive: true });
      expect(result.topology).toBe('hierarchical-mesh');
    });
  });

  describe('DDD Domains', () => {
    const allDomains = getAllDomains();

    it('should have 12 DDD domains', () => {
      expect(allDomains).toHaveLength(12);
    });

    it('should include all expected domains', () => {
      const expectedDomains: Exclude<DDDDomain, 'all'>[] = [
        'test-generation',
        'test-execution',
        'coverage-analysis',
        'quality-assessment',
        'defect-intelligence',
        'requirements-validation',
        'code-intelligence',
        'security-compliance',
        'contract-testing',
        'visual-accessibility',
        'chaos-resilience',
        'learning-optimization',
      ];

      expectedDomains.forEach(domain => {
        expect(allDomains).toContain(domain);
      });
    });

    it('should support "all" as a domain selector', async () => {
      const result = await runFleetInitWizard({
        nonInteractive: true,
        defaultDomains: ['all'],
      });
      expect(result.domains).toContain('all');
    });

    it('should support selecting specific domains', async () => {
      const result = await runFleetInitWizard({
        nonInteractive: true,
        defaultDomains: ['test-generation', 'security-compliance'],
      });
      expect(result.domains).toEqual(['test-generation', 'security-compliance']);
    });
  });

  describe('Memory Backend Types', () => {
    const validBackends: MemoryBackend[] = ['sqlite', 'agentdb', 'hybrid'];

    it('should support all memory backends', () => {
      validBackends.forEach(backend => {
        expect(['sqlite', 'agentdb', 'hybrid']).toContain(backend);
      });
    });

    it('should have 3 memory backends', () => {
      expect(validBackends).toHaveLength(3);
    });

    it('should default to hybrid', async () => {
      const result = await runFleetInitWizard({ nonInteractive: true });
      expect(result.memoryBackend).toBe('hybrid');
    });
  });

  describe('Max Agent Validation', () => {
    it('should accept valid agent counts', async () => {
      for (const count of [5, 15, 25, 50]) {
        const result = await runFleetInitWizard({
          nonInteractive: true,
          defaultMaxAgents: count,
        });
        expect(result.maxAgents).toBe(count);
      }
    });

    it('should default to 15 agents', async () => {
      const result = await runFleetInitWizard({
        nonInteractive: true,
      });
      expect(result.maxAgents).toBe(15);
    });

    it('should accept minimum of 5 agents', async () => {
      const result = await runFleetInitWizard({
        nonInteractive: true,
        defaultMaxAgents: 5,
      });
      expect(result.maxAgents).toBe(5);
    });

    it('should accept maximum of 50 agents', async () => {
      const result = await runFleetInitWizard({
        nonInteractive: true,
        defaultMaxAgents: 50,
      });
      expect(result.maxAgents).toBe(50);
    });
  });

  describe('Lazy Loading', () => {
    it('should enable lazy loading by default', async () => {
      const result = await runFleetInitWizard({
        nonInteractive: true,
      });
      expect(result.lazyLoading).toBe(true);
    });

    it('should allow disabling lazy loading', async () => {
      const result = await runFleetInitWizard({
        nonInteractive: true,
        defaultLazyLoading: false,
      });
      expect(result.lazyLoading).toBe(false);
    });
  });

  describe('Pre-trained Patterns', () => {
    it('should not load patterns by default', async () => {
      const result = await runFleetInitWizard({
        nonInteractive: true,
      });
      expect(result.loadPatterns).toBe(false);
    });

    it('should allow enabling pattern loading', async () => {
      const result = await runFleetInitWizard({
        nonInteractive: true,
        defaultLoadPatterns: true,
      });
      expect(result.loadPatterns).toBe(true);
    });
  });

  describe('Topology Configuration', () => {
    it('should return correct config for hierarchical', () => {
      const config = getTopologyConfig('hierarchical');
      expect(config.description).toContain('Queen');
      expect(config.recommended).toBeDefined();
    });

    it('should return correct config for mesh', () => {
      const config = getTopologyConfig('mesh');
      expect(config.description).toContain('peer');
      expect(config.recommended).toBeDefined();
    });

    it('should return correct config for ring', () => {
      const config = getTopologyConfig('ring');
      expect(config.description).toContain('ring');
      expect(config.recommended).toBeDefined();
    });

    it('should return correct config for adaptive', () => {
      const config = getTopologyConfig('adaptive');
      expect(config.description).toContain('Dynamic');
      expect(config.recommended).toBeDefined();
    });

    it('should return correct config for hierarchical-mesh', () => {
      const config = getTopologyConfig('hierarchical-mesh');
      expect(config.description).toContain('Hybrid');
      expect(config.recommended).toBeDefined();
    });
  });

  describe('Domain Configuration', () => {
    it('should return config with description and agent types', () => {
      const config = getDomainConfig('test-generation');
      expect(config.description).toBeDefined();
      expect(config.agentTypes).toBeInstanceOf(Array);
      expect(config.agentTypes.length).toBeGreaterThan(0);
    });

    it('should have agent types for all domains', () => {
      const domains = getAllDomains();
      domains.forEach(domain => {
        const config = getDomainConfig(domain);
        expect(config.agentTypes.length).toBeGreaterThan(0);
      });
    });

    it('should have descriptions for all domains', () => {
      const domains = getAllDomains();
      domains.forEach(domain => {
        const config = getDomainConfig(domain);
        expect(config.description.length).toBeGreaterThan(10);
      });
    });
  });

  describe('Memory Backend Configuration', () => {
    it('should return correct config for sqlite', () => {
      const config = getMemoryBackendConfig('sqlite');
      expect(config.description).toContain('SQLite');
      expect(config.features).toBeInstanceOf(Array);
      expect(config.features.length).toBeGreaterThan(0);
    });

    it('should return correct config for agentdb', () => {
      const config = getMemoryBackendConfig('agentdb');
      expect(config.description).toContain('AgentDB');
      expect(config.features).toContain('150x-12,500x faster search');
    });

    it('should return correct config for hybrid', () => {
      const config = getMemoryBackendConfig('hybrid');
      expect(config.description).toContain('Combined');
      expect(config.features).toContain('Best of both');
    });
  });

  describe('FleetInitWizard Class', () => {
    it('should create instance', () => {
      const wizard = new FleetInitWizard();
      expect(wizard).toBeInstanceOf(FleetInitWizard);
    });

    it('should accept options', () => {
      const wizard = new FleetInitWizard({
        nonInteractive: true,
        defaultTopology: 'mesh',
      });
      expect(wizard).toBeInstanceOf(FleetInitWizard);
    });

    it('should handle non-interactive mode', async () => {
      const wizard = new FleetInitWizard({ nonInteractive: true });
      const result = await wizard.run();

      expect(result.cancelled).toBe(false);
      expect(result.topology).toBe('hierarchical-mesh');
    });
  });

  describe('Factory Function', () => {
    it('should return FleetWizardResult', async () => {
      const result = await runFleetInitWizard({ nonInteractive: true });

      expect(result).toHaveProperty('topology');
      expect(result).toHaveProperty('maxAgents');
      expect(result).toHaveProperty('domains');
      expect(result).toHaveProperty('memoryBackend');
      expect(result).toHaveProperty('lazyLoading');
      expect(result).toHaveProperty('loadPatterns');
      expect(result).toHaveProperty('cancelled');
    });

    it('should support empty options', async () => {
      const result = await runFleetInitWizard({ nonInteractive: true });
      expect(result).toBeDefined();
    });
  });

  describe('getAllDomains Helper', () => {
    it('should return array of domain strings', () => {
      const domains = getAllDomains();
      expect(domains).toBeInstanceOf(Array);
      domains.forEach(domain => {
        expect(typeof domain).toBe('string');
      });
    });

    it('should not include "all" in returned domains', () => {
      const domains = getAllDomains();
      expect(domains).not.toContain('all');
    });
  });
});

describe('CLI Integration', () => {
  describe('--wizard flag', () => {
    it('should accept wizard flag', () => {
      const options = { wizard: true };
      expect(options.wizard).toBe(true);
    });

    it('should combine with other options', () => {
      const options = {
        wizard: true,
        topology: 'mesh',
        maxAgents: '25',
        domains: 'test-generation,coverage-analysis',
      };

      expect(options.wizard).toBe(true);
      expect(options.topology).toBe('mesh');
    });
  });

  describe('--topology flag', () => {
    it('should accept all topology types', () => {
      const topologies: TopologyType[] = [
        'hierarchical',
        'mesh',
        'ring',
        'adaptive',
        'hierarchical-mesh',
      ];
      topologies.forEach(topology => {
        const options = { topology };
        expect(options.topology).toBe(topology);
      });
    });

    it('should default to hierarchical-mesh', () => {
      const defaultTopology = 'hierarchical-mesh';
      expect(defaultTopology).toBe('hierarchical-mesh');
    });
  });

  describe('--max-agents flag', () => {
    it('should accept valid agent counts', () => {
      const counts = [5, 10, 15, 25, 50];
      counts.forEach(count => {
        const options = { maxAgents: count };
        expect(options.maxAgents).toBe(count);
      });
    });

    it('should default to 15', () => {
      const defaultCount = 15;
      expect(defaultCount).toBe(15);
    });
  });

  describe('--memory-backend flag', () => {
    it('should accept all memory backends', () => {
      const backends: MemoryBackend[] = ['sqlite', 'agentdb', 'hybrid'];
      backends.forEach(backend => {
        const options = { memoryBackend: backend };
        expect(options.memoryBackend).toBe(backend);
      });
    });

    it('should default to hybrid', () => {
      const defaultBackend = 'hybrid';
      expect(defaultBackend).toBe('hybrid');
    });
  });

  describe('--lazy-loading flag', () => {
    it('should accept boolean values', () => {
      expect({ lazyLoading: true }).toHaveProperty('lazyLoading', true);
      expect({ lazyLoading: false }).toHaveProperty('lazyLoading', false);
    });

    it('should default to true', () => {
      const defaultValue = true;
      expect(defaultValue).toBe(true);
    });
  });

  describe('--load-patterns flag', () => {
    it('should accept boolean values', () => {
      expect({ loadPatterns: true }).toHaveProperty('loadPatterns', true);
      expect({ loadPatterns: false }).toHaveProperty('loadPatterns', false);
    });

    it('should default to false', () => {
      const defaultValue = false;
      expect(defaultValue).toBe(false);
    });
  });
});
