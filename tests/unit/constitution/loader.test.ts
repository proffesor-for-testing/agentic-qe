/**
 * Unit Tests for Constitution Loader
 * Tests loading, merging, and agent-specific constitution retrieval
 */

import * as fs from 'fs';
import * as path from 'path';

// Load test fixtures
const validPath = path.join(__dirname, '../../fixtures/phase1/valid-constitution.json');
const validFixture = JSON.parse(fs.readFileSync(validPath, 'utf-8'));

// Mock interfaces
interface Constitution {
  version: string;
  name: string;
  description?: string;
  principles: any[];
  constraints?: any[];
  behaviors?: Record<string, string[]>;
  capabilities?: string[];
  metadata?: Record<string, any>;
}

interface ConstitutionLoader {
  load(path: string): Promise<Constitution>;
  loadFromString(content: string): Constitution;
  merge(base: Constitution, override: Constitution): Constitution;
  getForAgent(agentId: string): Promise<Constitution | null>;
  register(agentId: string, constitution: Constitution): void;
  listRegistered(): string[];
  clear(): void;
}

// Mock ConstitutionLoader implementation
class MockConstitutionLoader implements ConstitutionLoader {
  private registry = new Map<string, Constitution>();
  private fileSystem = new Map<string, string>();

  // Mock file system for testing
  setFile(filePath: string, content: string): void {
    this.fileSystem.set(filePath, content);
  }

  async load(filePath: string): Promise<Constitution> {
    const content = this.fileSystem.get(filePath);
    if (!content) {
      throw new Error(`File not found: ${filePath}`);
    }

    try {
      const constitution = JSON.parse(content);
      this.validateBasicStructure(constitution);
      return constitution;
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`Invalid JSON in file: ${filePath}`);
      }
      throw error;
    }
  }

  loadFromString(content: string): Constitution {
    if (!content || content.trim() === '') {
      throw new Error('Empty constitution content');
    }

    try {
      const constitution = JSON.parse(content);
      this.validateBasicStructure(constitution);
      return constitution;
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error('Invalid JSON content');
      }
      throw error;
    }
  }

  merge(base: Constitution, override: Constitution): Constitution {
    const merged: Constitution = {
      version: override.version || base.version,
      name: override.name || base.name,
      description: override.description || base.description,
      principles: this.mergePrinciples(base.principles, override.principles),
      constraints: this.mergeConstraints(base.constraints, override.constraints),
      behaviors: this.mergeBehaviors(base.behaviors, override.behaviors),
      capabilities: this.mergeCapabilities(base.capabilities, override.capabilities),
      metadata: { ...base.metadata, ...override.metadata }
    };

    return merged;
  }

  async getForAgent(agentId: string): Promise<Constitution | null> {
    return this.registry.get(agentId) || null;
  }

  register(agentId: string, constitution: Constitution): void {
    if (!agentId) {
      throw new Error('Agent ID is required');
    }
    this.registry.set(agentId, constitution);
  }

  listRegistered(): string[] {
    return Array.from(this.registry.keys());
  }

  clear(): void {
    this.registry.clear();
    this.fileSystem.clear();
  }

  private validateBasicStructure(constitution: any): void {
    if (!constitution.version) {
      throw new Error('Constitution missing required field: version');
    }
    if (!constitution.name) {
      throw new Error('Constitution missing required field: name');
    }
    if (!constitution.principles) {
      throw new Error('Constitution missing required field: principles');
    }
  }

  private mergePrinciples(base: any[] = [], override: any[] = []): any[] {
    const merged = [...base];
    const baseIds = new Set(base.map(p => p.id));

    for (const principle of override) {
      if (baseIds.has(principle.id)) {
        // Override existing principle
        const index = merged.findIndex(p => p.id === principle.id);
        merged[index] = { ...merged[index], ...principle };
      } else {
        // Add new principle
        merged.push(principle);
      }
    }

    return merged;
  }

  private mergeConstraints(base?: any[], override?: any[]): any[] | undefined {
    if (!override) return base;
    if (!base) return override;

    const merged = [...base];
    const baseIds = new Set(base.map(c => c.id));

    for (const constraint of override) {
      if (baseIds.has(constraint.id)) {
        const index = merged.findIndex(c => c.id === constraint.id);
        merged[index] = { ...merged[index], ...constraint };
      } else {
        merged.push(constraint);
      }
    }

    return merged;
  }

  private mergeBehaviors(
    base?: Record<string, string[]>,
    override?: Record<string, string[]>
  ): Record<string, string[]> | undefined {
    if (!override) return base;
    if (!base) return override;

    return {
      onTaskStart: [...(base.onTaskStart || []), ...(override.onTaskStart || [])],
      onTaskComplete: [...(base.onTaskComplete || []), ...(override.onTaskComplete || [])],
      onError: [...(base.onError || []), ...(override.onError || [])]
    };
  }

  private mergeCapabilities(base?: string[], override?: string[]): string[] | undefined {
    if (!override) return base;
    if (!base) return override;

    return [...new Set([...base, ...override])];
  }
}

describe('ConstitutionLoader', () => {
  let loader: MockConstitutionLoader;

  beforeEach(() => {
    loader = new MockConstitutionLoader();
  });

  afterEach(() => {
    loader.clear();
  });

  describe('load', () => {
    test('should load constitution from file', async () => {
      loader.setFile('/config/test.json', JSON.stringify(validFixture));

      const constitution = await loader.load('/config/test.json');

      expect(constitution.name).toBe(validFixture.name);
      expect(constitution.version).toBe(validFixture.version);
    });

    test('should throw error for non-existent file', async () => {
      await expect(loader.load('/non/existent.json'))
        .rejects.toThrow('File not found');
    });

    test('should throw error for invalid JSON', async () => {
      loader.setFile('/config/invalid.json', 'not valid json');

      await expect(loader.load('/config/invalid.json'))
        .rejects.toThrow('Invalid JSON in file');
    });

    test('should throw error for missing required fields', async () => {
      loader.setFile('/config/incomplete.json', JSON.stringify({
        name: 'test'
        // Missing version and principles
      }));

      await expect(loader.load('/config/incomplete.json'))
        .rejects.toThrow('missing required field');
    });

    test('should load constitution with all fields', async () => {
      loader.setFile('/config/complete.json', JSON.stringify(validFixture));

      const constitution = await loader.load('/config/complete.json');

      expect(constitution.principles).toBeDefined();
      expect(constitution.constraints).toBeDefined();
      expect(constitution.behaviors).toBeDefined();
      expect(constitution.capabilities).toBeDefined();
      expect(constitution.metadata).toBeDefined();
    });
  });

  describe('loadFromString', () => {
    test('should load constitution from JSON string', () => {
      const content = JSON.stringify(validFixture);

      const constitution = loader.loadFromString(content);

      expect(constitution.name).toBe(validFixture.name);
    });

    test('should throw error for empty content', () => {
      expect(() => loader.loadFromString('')).toThrow('Empty constitution content');
      expect(() => loader.loadFromString('   ')).toThrow('Empty constitution content');
    });

    test('should throw error for invalid JSON', () => {
      expect(() => loader.loadFromString('invalid')).toThrow('Invalid JSON content');
    });

    test('should throw error for missing required fields', () => {
      const incomplete = JSON.stringify({ name: 'test' });

      expect(() => loader.loadFromString(incomplete))
        .toThrow('missing required field');
    });
  });

  describe('merge', () => {
    test('should merge two constitutions', () => {
      const base: Constitution = {
        version: '1.0.0',
        name: 'base',
        principles: [
          { id: 'p1', name: 'base_principle', description: 'Base' }
        ]
      };

      const override: Constitution = {
        version: '2.0.0',
        name: 'override',
        principles: [
          { id: 'p2', name: 'override_principle', description: 'Override' }
        ]
      };

      const merged = loader.merge(base, override);

      expect(merged.version).toBe('2.0.0');
      expect(merged.name).toBe('override');
      expect(merged.principles).toHaveLength(2);
    });

    test('should override principles with same ID', () => {
      const base: Constitution = {
        version: '1.0.0',
        name: 'base',
        principles: [
          { id: 'p1', name: 'original', description: 'Original', priority: 'low' }
        ]
      };

      const override: Constitution = {
        version: '1.0.0',
        name: 'base',
        principles: [
          { id: 'p1', name: 'updated', description: 'Updated', priority: 'high' }
        ]
      };

      const merged = loader.merge(base, override);

      expect(merged.principles).toHaveLength(1);
      expect(merged.principles[0].name).toBe('updated');
      expect(merged.principles[0].priority).toBe('high');
    });

    test('should merge constraints', () => {
      const base: Constitution = {
        version: '1.0.0',
        name: 'base',
        principles: [],
        constraints: [
          { id: 'c1', type: 'coverage', condition: 'coverage >= 80' }
        ]
      };

      const override: Constitution = {
        version: '1.0.0',
        name: 'base',
        principles: [],
        constraints: [
          { id: 'c2', type: 'performance', condition: 'duration <= 30000' }
        ]
      };

      const merged = loader.merge(base, override);

      expect(merged.constraints).toHaveLength(2);
    });

    test('should override constraints with same ID', () => {
      const base: Constitution = {
        version: '1.0.0',
        name: 'base',
        principles: [],
        constraints: [
          { id: 'c1', type: 'coverage', condition: 'coverage >= 70', description: 'Old' }
        ]
      };

      const override: Constitution = {
        version: '1.0.0',
        name: 'base',
        principles: [],
        constraints: [
          { id: 'c1', type: 'coverage', condition: 'coverage >= 90', description: 'New' }
        ]
      };

      const merged = loader.merge(base, override);

      expect(merged.constraints).toHaveLength(1);
      expect(merged.constraints![0].condition).toBe('coverage >= 90');
    });

    test('should merge behaviors by concatenating', () => {
      const base: Constitution = {
        version: '1.0.0',
        name: 'base',
        principles: [],
        behaviors: {
          onTaskStart: ['log'],
          onError: ['notify']
        }
      };

      const override: Constitution = {
        version: '1.0.0',
        name: 'base',
        principles: [],
        behaviors: {
          onTaskStart: ['validate'],
          onTaskComplete: ['record']
        }
      };

      const merged = loader.merge(base, override);

      expect(merged.behaviors?.onTaskStart).toEqual(['log', 'validate']);
      expect(merged.behaviors?.onTaskComplete).toEqual(['record']);
      expect(merged.behaviors?.onError).toEqual(['notify']);
    });

    test('should merge capabilities without duplicates', () => {
      const base: Constitution = {
        version: '1.0.0',
        name: 'base',
        principles: [],
        capabilities: ['unit_tests', 'integration_tests']
      };

      const override: Constitution = {
        version: '1.0.0',
        name: 'base',
        principles: [],
        capabilities: ['integration_tests', 'e2e_tests']
      };

      const merged = loader.merge(base, override);

      expect(merged.capabilities).toHaveLength(3);
      expect(merged.capabilities).toContain('unit_tests');
      expect(merged.capabilities).toContain('integration_tests');
      expect(merged.capabilities).toContain('e2e_tests');
    });

    test('should merge metadata', () => {
      const base: Constitution = {
        version: '1.0.0',
        name: 'base',
        principles: [],
        metadata: {
          author: 'original',
          createdAt: '2025-01-01'
        }
      };

      const override: Constitution = {
        version: '1.0.0',
        name: 'base',
        principles: [],
        metadata: {
          author: 'updated',
          updatedAt: '2025-01-15'
        }
      };

      const merged = loader.merge(base, override);

      expect(merged.metadata?.author).toBe('updated');
      expect(merged.metadata?.createdAt).toBe('2025-01-01');
      expect(merged.metadata?.updatedAt).toBe('2025-01-15');
    });

    test('should use base values when override is undefined', () => {
      const base: Constitution = {
        version: '1.0.0',
        name: 'base',
        description: 'Base description',
        principles: [
          { id: 'p1', name: 'test', description: 'Test' }
        ]
      };

      const override: Constitution = {
        version: '2.0.0',
        name: 'override',
        principles: []
      };

      const merged = loader.merge(base, override);

      expect(merged.description).toBe('Base description');
      expect(merged.principles).toHaveLength(1);
    });
  });

  describe('register and getForAgent', () => {
    test('should register constitution for agent', async () => {
      const constitution: Constitution = {
        version: '1.0.0',
        name: 'test-agent',
        principles: []
      };

      loader.register('qe-test-generator', constitution);

      const retrieved = await loader.getForAgent('qe-test-generator');
      expect(retrieved).toEqual(constitution);
    });

    test('should return null for unregistered agent', async () => {
      const result = await loader.getForAgent('non-existent');

      expect(result).toBeNull();
    });

    test('should throw error for empty agent ID', () => {
      const constitution: Constitution = {
        version: '1.0.0',
        name: 'test',
        principles: []
      };

      expect(() => loader.register('', constitution)).toThrow('Agent ID is required');
    });

    test('should overwrite existing registration', async () => {
      const constitution1: Constitution = {
        version: '1.0.0',
        name: 'original',
        principles: []
      };

      const constitution2: Constitution = {
        version: '2.0.0',
        name: 'updated',
        principles: []
      };

      loader.register('agent', constitution1);
      loader.register('agent', constitution2);

      const retrieved = await loader.getForAgent('agent');
      expect(retrieved?.version).toBe('2.0.0');
    });

    test('should register multiple agents', async () => {
      const agents = ['agent-1', 'agent-2', 'agent-3'];

      for (const agentId of agents) {
        loader.register(agentId, {
          version: '1.0.0',
          name: agentId,
          principles: []
        });
      }

      for (const agentId of agents) {
        const retrieved = await loader.getForAgent(agentId);
        expect(retrieved?.name).toBe(agentId);
      }
    });
  });

  describe('listRegistered', () => {
    test('should return empty array when no agents registered', () => {
      const registered = loader.listRegistered();

      expect(registered).toEqual([]);
    });

    test('should return all registered agent IDs', () => {
      loader.register('agent-1', { version: '1.0.0', name: 'a1', principles: [] });
      loader.register('agent-2', { version: '1.0.0', name: 'a2', principles: [] });
      loader.register('agent-3', { version: '1.0.0', name: 'a3', principles: [] });

      const registered = loader.listRegistered();

      expect(registered).toHaveLength(3);
      expect(registered).toContain('agent-1');
      expect(registered).toContain('agent-2');
      expect(registered).toContain('agent-3');
    });
  });

  describe('clear', () => {
    test('should clear all registrations', async () => {
      loader.register('agent', { version: '1.0.0', name: 'test', principles: [] });
      loader.setFile('/test.json', '{}');

      loader.clear();

      expect(loader.listRegistered()).toEqual([]);
      await expect(loader.load('/test.json')).rejects.toThrow('File not found');
    });
  });

  describe('Real-world Scenarios', () => {
    test('should load and merge agent-specific constitution', async () => {
      // Base QE constitution
      const baseConstitution: Constitution = {
        version: '1.0.0',
        name: 'qe-base',
        description: 'Base QE constitution',
        principles: [
          { id: 'isolation', name: 'test_isolation', description: 'Tests must be isolated' },
          { id: 'assertions', name: 'meaningful_assertions', description: 'Assertions must be meaningful' }
        ],
        constraints: [
          { id: 'coverage', type: 'coverage', condition: 'coverage >= 70', description: 'Minimum coverage' }
        ]
      };

      // Agent-specific override
      const agentConstitution: Constitution = {
        version: '1.1.0',
        name: 'qe-test-generator',
        principles: [
          { id: 'coverage', name: 'high_coverage', description: 'Aim for high coverage' }
        ],
        constraints: [
          { id: 'coverage', type: 'coverage', condition: 'coverage >= 80', description: 'Higher coverage requirement' }
        ],
        capabilities: ['unit_test_generation', 'property_based_testing']
      };

      const merged = loader.merge(baseConstitution, agentConstitution);

      expect(merged.version).toBe('1.1.0');
      expect(merged.principles).toHaveLength(3);
      expect(merged.constraints![0].condition).toBe('coverage >= 80');
      expect(merged.capabilities).toContain('unit_test_generation');
    });

    test('should handle QE fleet with multiple agent constitutions', () => {
      // Register constitutions for different QE agents
      const agents = [
        {
          id: 'qe-test-generator',
          constitution: {
            version: '1.0.0',
            name: 'test-generator',
            principles: [{ id: 'p1', name: 'tdd', description: 'Test-driven development' }],
            capabilities: ['unit_tests', 'integration_tests']
          }
        },
        {
          id: 'qe-coverage-analyzer',
          constitution: {
            version: '1.0.0',
            name: 'coverage-analyzer',
            principles: [{ id: 'p1', name: 'accuracy', description: 'Accurate analysis' }],
            capabilities: ['coverage_analysis', 'gap_detection']
          }
        },
        {
          id: 'qe-security-scanner',
          constitution: {
            version: '1.0.0',
            name: 'security-scanner',
            principles: [{ id: 'p1', name: 'thoroughness', description: 'Thorough scanning' }],
            capabilities: ['vulnerability_detection', 'owasp_testing']
          }
        }
      ];

      for (const agent of agents) {
        loader.register(agent.id, agent.constitution as Constitution);
      }

      const registered = loader.listRegistered();
      expect(registered).toHaveLength(3);

      // Verify each agent has correct capabilities
      for (const agent of agents) {
        const retrieved = loader.getForAgent(agent.id);
        expect(retrieved).resolves.not.toBeNull();
      }
    });

    test('should inherit from fixture constitution', async () => {
      // Load base from fixture
      const base = validFixture;

      // Agent-specific customization
      const override: Constitution = {
        version: '1.1.0',
        name: 'custom-test-generator',
        principles: [
          { id: 'custom', name: 'custom_principle', description: 'Custom agent principle' }
        ],
        constraints: [
          {
            id: 'constraint-001',  // Override existing
            type: 'coverage',
            description: 'Higher coverage',
            condition: 'coverage >= 90',
            parameters: { threshold: 90 }
          }
        ]
      };

      const merged = loader.merge(base as Constitution, override);

      // Should have all base principles plus custom
      expect(merged.principles.length).toBe(base.principles.length + 1);

      // Coverage constraint should be overridden
      const coverageConstraint = merged.constraints?.find(c => c.id === 'constraint-001');
      expect(coverageConstraint?.parameters?.threshold).toBe(90);
    });
  });
});
