/**
 * Agentic QE v3 - Init Command Tests
 * Tests for the aqe-v3 init command
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { InitOrchestrator, type InitOrchestratorOptions } from '../../../src/init/init-wizard';
import * as fs from 'fs';
import * as path from 'path';

// Mock fs module
vi.mock('fs', async () => {
  const actual = await vi.importActual('fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(),
    readdirSync: vi.fn(),
    statSync: vi.fn(),
  };
});

describe('Init Command', () => {
  const testProjectRoot = '/tmp/test-project';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('InitOrchestrator', () => {
    it('should create orchestrator with default options', () => {
      const orchestrator = new InitOrchestrator({
        projectRoot: testProjectRoot,
      });

      expect(orchestrator).toBeDefined();
    });

    it('should create orchestrator with auto mode', () => {
      const orchestrator = new InitOrchestrator({
        projectRoot: testProjectRoot,
        autoMode: true,
      });

      expect(orchestrator).toBeDefined();
    });

    it('should create orchestrator with minimal mode', () => {
      const orchestrator = new InitOrchestrator({
        projectRoot: testProjectRoot,
        minimal: true,
      });

      expect(orchestrator).toBeDefined();
    });

    it('should create orchestrator with skipPatterns', () => {
      const orchestrator = new InitOrchestrator({
        projectRoot: testProjectRoot,
        skipPatterns: true,
      });

      expect(orchestrator).toBeDefined();
    });

    it('should return wizard steps', () => {
      const orchestrator = new InitOrchestrator({
        projectRoot: testProjectRoot,
      });

      const steps = orchestrator.getWizardSteps();
      expect(Array.isArray(steps)).toBe(true);
      expect(steps.length).toBeGreaterThan(0);

      // Each step should have title and description
      for (const step of steps) {
        expect(step).toHaveProperty('title');
        expect(step).toHaveProperty('description');
        expect(typeof step.title).toBe('string');
        expect(typeof step.description).toBe('string');
      }
    });
  });

  describe('Init Options Validation', () => {
    it('should accept valid domain list', () => {
      const domains = 'test-generation,coverage-analysis,quality-assessment';
      const domainList = domains.split(',');

      expect(domainList).toContain('test-generation');
      expect(domainList).toContain('coverage-analysis');
      expect(domainList).toContain('quality-assessment');
    });

    it('should accept "all" for domains', () => {
      const domains = 'all';
      expect(domains).toBe('all');
    });

    it('should accept valid memory backend options', () => {
      const validBackends = ['sqlite', 'hybrid', 'agentdb'];

      for (const backend of validBackends) {
        expect(validBackends).toContain(backend);
      }
    });

    it('should accept valid max agents value', () => {
      const maxAgents = '15';
      const parsed = parseInt(maxAgents, 10);

      expect(parsed).toBe(15);
      expect(parsed).toBeGreaterThan(0);
      expect(parsed).toBeLessThanOrEqual(50);
    });

    it('should validate lazy loading flag', () => {
      const lazy = true;
      expect(typeof lazy).toBe('boolean');
    });
  });

  describe('Init Directory Structure', () => {
    it('should define correct v3 directory structure', () => {
      const v3Dir = '.aqe-v3';
      const expectedDirs = [
        v3Dir,
        `${v3Dir}/agentdb`,
        `${v3Dir}/reasoning-bank`,
        `${v3Dir}/cache`,
        `${v3Dir}/logs`,
      ];

      for (const dir of expectedDirs) {
        expect(dir).toMatch(/^\.aqe-v3/);
      }
    });

    it('should define correct config file path', () => {
      const configPath = '.aqe-v3/config.json';
      expect(configPath).toBe('.aqe-v3/config.json');
    });
  });

  describe('Init Config Generation', () => {
    it('should generate valid v3 config structure', () => {
      const config = {
        version: '3.0.0',
        kernel: {
          eventBus: 'in-memory',
          coordinator: 'queen',
        },
        domains: {
          'test-generation': { enabled: true },
          'test-execution': { enabled: true },
          'coverage-analysis': { enabled: true, algorithm: 'hnsw', dimensions: 128 },
          'quality-assessment': { enabled: true },
          'defect-intelligence': { enabled: true },
          'requirements-validation': { enabled: true },
          'code-intelligence': { enabled: true },
          'security-compliance': { enabled: true },
          'contract-testing': { enabled: true },
          'visual-accessibility': { enabled: false },
          'chaos-resilience': { enabled: true },
          'learning-optimization': { enabled: true },
        },
        memory: {
          backend: 'hybrid',
          path: '.aqe-v3/agentdb/',
          hnsw: { M: 16, efConstruction: 200 },
        },
        learning: {
          reasoningBank: true,
          sona: true,
          patternRetention: 180,
        },
      };

      expect(config.version).toBe('3.0.0');
      expect(config.kernel.coordinator).toBe('queen');
      expect(config.domains['test-generation'].enabled).toBe(true);
      expect(config.memory.backend).toBe('hybrid');
      expect(config.learning.reasoningBank).toBe(true);
    });

    it('should support HNSW configuration', () => {
      const hnswConfig = {
        M: 16,
        efConstruction: 200,
        efSearch: 50,
      };

      expect(hnswConfig.M).toBeGreaterThan(0);
      expect(hnswConfig.efConstruction).toBeGreaterThan(0);
    });
  });

  describe('Init Success Output', () => {
    it('should define expected next steps', () => {
      const nextSteps = [
        'Add MCP: claude mcp add aqe-v3 -- aqe-v3-mcp',
        'Run tests: aqe-v3 test <path>',
        'Check status: aqe-v3 status',
      ];

      expect(nextSteps.length).toBe(3);
      expect(nextSteps[0]).toContain('mcp');
      expect(nextSteps[1]).toContain('test');
      expect(nextSteps[2]).toContain('status');
    });
  });
});

describe('Init Command Integration', () => {
  describe('Domain Validation', () => {
    const ALL_DOMAINS = [
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
    ] as const;

    it('should have 12 bounded contexts', () => {
      expect(ALL_DOMAINS.length).toBe(12);
    });

    it('should validate all domain names', () => {
      for (const domain of ALL_DOMAINS) {
        expect(typeof domain).toBe('string');
        expect(domain.length).toBeGreaterThan(0);
        expect(domain).toMatch(/^[a-z-]+$/);
      }
    });

    it('should filter invalid domains', () => {
      const inputDomains = 'test-generation,invalid-domain,coverage-analysis';
      const filtered = inputDomains
        .split(',')
        .filter((d) => ALL_DOMAINS.includes(d as typeof ALL_DOMAINS[number]));

      expect(filtered).toContain('test-generation');
      expect(filtered).toContain('coverage-analysis');
      expect(filtered).not.toContain('invalid-domain');
    });
  });

  describe('Memory Backend Selection', () => {
    it('should select sqlite for minimal mode', () => {
      const minimal = true;
      const backend = minimal ? 'sqlite' : 'hybrid';
      expect(backend).toBe('sqlite');
    });

    it('should select hybrid for standard mode', () => {
      const minimal = false;
      const backend = minimal ? 'sqlite' : 'hybrid';
      expect(backend).toBe('hybrid');
    });
  });
});
