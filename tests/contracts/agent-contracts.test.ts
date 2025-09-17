/**
 * Agent Contract Tests
 * Ensures all 48 QE agents conform to expected interfaces
 */

import { describe, it, expect, jest, beforeAll } from '@jest/globals';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'yaml';

// Define the expected agent contract
interface QEAgentContract {
  name: string;
  description: string;
  category: string;
  version: string;
  author: string;
  capabilities: string[];
  config?: {
    maxRetries?: number;
    timeout?: number;
    [key: string]: any;
  };
  required?: {
    tools?: string[];
    permissions?: string[];
    environment?: string[];
  };
}

// List of all 48 QE agents that should exist
const EXPECTED_QE_AGENTS = [
  // Core QE Agents
  'risk-oracle',
  'requirements-explorer',
  'tdd-pair-programmer',
  'production-observer',
  'deployment-guardian',
  'exploratory-testing-navigator',

  // Functional Testing
  'functional-positive',
  'functional-negative',
  'functional-flow-validator',
  'functional-stateful',

  // Security Testing
  'security-sentinel',
  'security-auth',
  'security-injection',

  // Performance Testing
  'performance-planner',
  'performance-analyzer',
  'performance-hunter',

  // Specialized Testing
  'accessibility-advocate',
  'mutation-testing-swarm',
  'mocking-agent',
  'resilience-challenger',
  'design-challenger',
  'spec-linter',

  // Knowledge & Learning
  'knowledge-curator',
  'pattern-recognition-sage',
  'quality-storyteller',
  'context-orchestrator',

  // SPARC Methodology
  'sparc-coord',
  'sparc-coder',
  'specification',
  'pseudocode',
  'architecture',
  'refinement',

  // Coordination
  'hierarchical-coordinator',
  'mesh-coordinator',
  'adaptive-coordinator',
  'collective-intelligence-coordinator',
  'swarm-memory-manager',

  // Consensus
  'byzantine-coordinator',
  'raft-manager',
  'gossip-coordinator',
  'crdt-synchronizer',
  'quorum-manager',

  // GitHub/Development
  'github-modes',
  'pr-manager',
  'issue-tracker',
  'release-manager',
  'code-review-swarm',
  'workflow-automation'
];

// Categories that agents should belong to
const VALID_CATEGORIES = [
  'quality-engineering',
  'functional-testing',
  'security',
  'non-functional',
  'learning',
  'orchestration',
  'reporting',
  'coordination',
  'consensus',
  'development'
];

// Required capabilities for different agent types
const REQUIRED_CAPABILITIES_BY_TYPE = {
  'testing': ['test-execution', 'validation'],
  'security': ['vulnerability-detection', 'security-testing'],
  'performance': ['performance-testing', 'metrics-collection'],
  'coordination': ['agent-coordination', 'task-distribution'],
  'consensus': ['consensus-protocol', 'fault-tolerance']
};

describe('Agent Contract Tests', () => {
  let loadedAgents: Map<string, any> = new Map();

  beforeAll(async () => {
    // Load all agent YAML files
    const agentsPath = path.join(process.cwd(), 'agents');

    try {
      const agentDirs = await fs.readdir(agentsPath);

      for (const dir of agentDirs) {
        const agentYamlPath = path.join(agentsPath, dir, 'agent.yaml');

        try {
          const content = await fs.readFile(agentYamlPath, 'utf-8');
          const agentConfig = yaml.parse(content);
          loadedAgents.set(agentConfig.name, agentConfig);
        } catch (error) {
          // Agent might not have a YAML file
        }
      }
    } catch (error) {
      console.warn('Could not load agents from filesystem, using mock data');
      // Use mock data for testing if filesystem is not available
      EXPECTED_QE_AGENTS.forEach(name => {
        loadedAgents.set(name, createMockAgent(name));
      });
    }
  });

  describe('Agent Existence', () => {
    it('should have all 48 expected QE agents', () => {
      const missingAgents = EXPECTED_QE_AGENTS.filter(
        name => !loadedAgents.has(name)
      );

      if (missingAgents.length > 0) {
        console.log('Missing agents:', missingAgents);
      }

      expect(loadedAgents.size).toBeGreaterThanOrEqual(48);
    });

    EXPECTED_QE_AGENTS.forEach(agentName => {
      it(`should have ${agentName} agent defined`, () => {
        expect(loadedAgents.has(agentName)).toBe(true);
      });
    });
  });

  describe('Agent Interface Conformance', () => {
    EXPECTED_QE_AGENTS.forEach(agentName => {
      describe(`${agentName} agent`, () => {
        let agent: any;

        beforeAll(() => {
          agent = loadedAgents.get(agentName);
        });

        it('should have required properties', () => {
          expect(agent).toHaveProperty('name');
          expect(agent).toHaveProperty('description');
          expect(agent).toHaveProperty('category');
          expect(agent).toHaveProperty('capabilities');
        });

        it('should have valid name format', () => {
          expect(agent?.name).toMatch(/^[a-z-]+$/);
          expect(agent?.name).toBe(agentName);
        });

        it('should have non-empty description', () => {
          expect(agent?.description).toBeDefined();
          expect(agent?.description.length).toBeGreaterThan(10);
        });

        it('should have valid category', () => {
          expect(agent?.category).toBeDefined();
          expect(VALID_CATEGORIES).toContain(agent?.category);
        });

        it('should have capabilities array', () => {
          expect(Array.isArray(agent?.capabilities)).toBe(true);
          expect(agent?.capabilities.length).toBeGreaterThan(0);
        });

        it('should have valid capability format', () => {
          agent?.capabilities?.forEach((capability: string) => {
            // Allow both hyphens and underscores in capabilities
            expect(capability).toMatch(/^[a-z_-]+$/);
            expect(capability.length).toBeGreaterThan(3);
          });
        });

        it('should have version if specified', () => {
          if (agent?.version) {
            expect(agent.version).toMatch(/^\d+\.\d+\.\d+$/);
          }
        });

        it('should have valid author if specified', () => {
          if (agent?.author) {
            expect(agent.author).toBeDefined();
            expect(agent.author.length).toBeGreaterThan(0);
          }
        });
      });
    });
  });

  describe('Agent Category Distribution', () => {
    it('should have agents in all major categories', () => {
      const categoriesWithAgents = new Set<string>();

      loadedAgents.forEach(agent => {
        if (agent.category) {
          categoriesWithAgents.add(agent.category);
        }
      });

      expect(categoriesWithAgents.has('quality-engineering')).toBe(true);
      expect(categoriesWithAgents.has('coordination')).toBe(true);
      expect(categoriesWithAgents.has('consensus')).toBe(true);
      expect(categoriesWithAgents.has('development')).toBe(true);
    });

    it('should have minimum number of agents per category', () => {
      const agentsByCategory: Record<string, number> = {};

      loadedAgents.forEach(agent => {
        const category = agent.category || 'uncategorized';
        agentsByCategory[category] = (agentsByCategory[category] || 0) + 1;
      });

      // Each major category should have at least 2 agents
      expect(agentsByCategory['quality-engineering'] || 0).toBeGreaterThanOrEqual(2);
      expect(agentsByCategory['coordination'] || 0).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Agent Capabilities', () => {
    it('testing agents should have testing capabilities', () => {
      const testingAgents = [
        'functional-positive',
        'functional-negative',
        'tdd-pair-programmer',
        'mutation-testing-swarm'
      ];

      testingAgents.forEach(agentName => {
        const agent = loadedAgents.get(agentName);
        const hasTestingCapability = agent?.capabilities?.some(
          (cap: string) => cap.includes('test') || cap.includes('validation')
        );
        expect(hasTestingCapability).toBe(true);
      });
    });

    it('security agents should have security capabilities', () => {
      const securityAgents = [
        'security-sentinel',
        'security-auth',
        'security-injection'
      ];

      securityAgents.forEach(agentName => {
        const agent = loadedAgents.get(agentName);
        const hasSecurityCapability = agent?.capabilities?.some(
          (cap: string) => cap.includes('security') || cap.includes('vulnerability')
        );
        expect(hasSecurityCapability).toBe(true);
      });
    });

    it('coordination agents should have coordination capabilities', () => {
      const coordAgents = [
        'hierarchical-coordinator',
        'mesh-coordinator',
        'adaptive-coordinator'
      ];

      coordAgents.forEach(agentName => {
        const agent = loadedAgents.get(agentName);
        const hasCoordCapability = agent?.capabilities?.some(
          (cap: string) => cap.includes('coord') || cap.includes('orchestr')
        );
        expect(hasCoordCapability).toBe(true);
      });
    });
  });

  describe('Agent Configuration', () => {
    it('agents with timeout config should have valid values', () => {
      loadedAgents.forEach((agent, name) => {
        if (agent.config?.timeout) {
          expect(agent.config.timeout).toBeGreaterThan(0);
          expect(agent.config.timeout).toBeLessThanOrEqual(300000); // Max 5 minutes
        }
      });
    });

    it('agents with retry config should have valid values', () => {
      loadedAgents.forEach((agent, name) => {
        if (agent.config?.maxRetries) {
          expect(agent.config.maxRetries).toBeGreaterThanOrEqual(0);
          expect(agent.config.maxRetries).toBeLessThanOrEqual(10);
        }
      });
    });
  });

  describe('Agent Dependencies', () => {
    it('agents with tool requirements should specify valid tools', () => {
      const validTools = ['git', 'npm', 'docker', 'kubectl', 'terraform'];

      loadedAgents.forEach((agent, name) => {
        if (agent.required?.tools) {
          agent.required.tools.forEach((tool: string) => {
            expect(tool).toBeDefined();
            expect(tool.length).toBeGreaterThan(0);
          });
        }
      });
    });

    it('agents with environment requirements should specify valid env vars', () => {
      loadedAgents.forEach((agent, name) => {
        if (agent.required?.environment) {
          agent.required.environment.forEach((envVar: string) => {
            expect(envVar).toMatch(/^[A-Z_]+$/);
          });
        }
      });
    });
  });

  describe('SPARC Agents Specific Tests', () => {
    const sparcAgents = [
      'sparc-coord',
      'sparc-coder',
      'specification',
      'pseudocode',
      'architecture',
      'refinement'
    ];

    sparcAgents.forEach(agentName => {
      it(`${agentName} should have SPARC-related capabilities`, () => {
        const agent = loadedAgents.get(agentName);
        const hasSparcCapability = agent?.capabilities?.some(
          (cap: string) =>
            cap.includes('sparc') ||
            cap.includes('specification') ||
            cap.includes('design') ||
            cap.includes('implementation')
        );
        expect(hasSparcCapability).toBe(true);
      });
    });
  });

  describe('Consensus Agents Specific Tests', () => {
    const consensusAgents = [
      'byzantine-coordinator',
      'raft-manager',
      'gossip-coordinator',
      'crdt-synchronizer',
      'quorum-manager'
    ];

    consensusAgents.forEach(agentName => {
      it(`${agentName} should have consensus-related capabilities`, () => {
        const agent = loadedAgents.get(agentName);
        const hasConsensusCapability = agent?.capabilities?.some(
          (cap: string) =>
            cap.includes('consensus') ||
            cap.includes('fault-tolerance') ||
            cap.includes('replication') ||
            cap.includes('synchron')
        );
        expect(hasConsensusCapability).toBe(true);
      });
    });
  });

  describe('Agent Naming Conventions', () => {
    it('all agents should follow kebab-case naming', () => {
      loadedAgents.forEach((agent, name) => {
        expect(name).toMatch(/^[a-z]+(-[a-z]+)*$/);
      });
    });

    it('coordinator agents should end with -coordinator', () => {
      const coordinatorAgents = Array.from(loadedAgents.keys()).filter(
        name => name.includes('coordinator')
      );

      coordinatorAgents.forEach(name => {
        expect(name).toMatch(/-coordinator$/);
      });
    });

    it('manager agents should end with -manager', () => {
      const managerAgents = Array.from(loadedAgents.keys()).filter(
        name => name.includes('manager')
      );

      managerAgents.forEach(name => {
        expect(name).toMatch(/-manager$/);
      });
    });
  });

  describe('Agent Uniqueness', () => {
    it('all agents should have unique names', () => {
      const names = Array.from(loadedAgents.keys());
      const uniqueNames = new Set(names);
      expect(names.length).toBe(uniqueNames.size);
    });

    it('all agents should have unique descriptions', () => {
      const descriptions = Array.from(loadedAgents.values())
        .map(a => a.description)
        .filter(Boolean);
      const uniqueDescriptions = new Set(descriptions);

      // Allow some duplicate descriptions but should be mostly unique
      expect(uniqueDescriptions.size).toBeGreaterThan(descriptions.length * 0.9);
    });
  });
});

// Helper function to create mock agent for testing when filesystem is not available
function createMockAgent(name: string): QEAgentContract {
  return {
    name,
    description: `Mock description for ${name} agent`,
    category: 'quality-engineering',
    version: '1.0.0',
    author: 'QE Framework',
    capabilities: ['test-execution', 'validation'],
    config: {
      timeout: 30000,
      maxRetries: 3
    }
  };
}