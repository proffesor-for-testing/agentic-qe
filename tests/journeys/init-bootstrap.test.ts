/**
 * Journey Test: Init & Bootstrap
 *
 * Tests the complete user journey for initializing the Agentic QE Fleet with `aqe init`.
 * This is the FIRST journey test for Issue #103 - test suite migration.
 *
 * Focus: USER-FACING behavior, not implementation details
 * Database: Uses REAL SwarmMemoryManager interactions (no mocks)
 *
 * @see Issue #103
 * @module tests/journeys
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as path from 'path';
import * as fs from 'fs-extra';
import { initCommand } from '@cli/init/index';
import { InitOptions, FleetConfig } from '@typessrc/types';
import {
  getSharedMemoryManager,
  resetSharedMemoryManager,
  resolveDbPath
} from '@core/memory/MemoryManagerFactory';
import { SwarmMemoryManager } from '@core/memory/SwarmMemoryManager';

describe('Journey: Init & Bootstrap', () => {
  let testWorkspace: string;
  let originalCwd: string;

  beforeEach(async () => {
    // Setup isolated test workspace
    originalCwd = process.cwd();
    testWorkspace = path.join(__dirname, '../tmp/journey-init-test-' + Date.now());
    await fs.ensureDir(testWorkspace);
    process.chdir(testWorkspace);

    // Reset singleton to ensure clean state
    resetSharedMemoryManager();
  });

  afterEach(async () => {
    // Restore original directory
    process.chdir(originalCwd);

    // Cleanup test workspace
    try {
      await fs.remove(testWorkspace);
    } catch (error) {
      console.warn(`Failed to cleanup test workspace: ${error}`);
    }

    // Reset singleton after test
    resetSharedMemoryManager();
  });

  describe('aqe init command', () => {
    it('creates config file at .agentic-qe/config/fleet.json', async () => {
      // GIVEN: User runs aqe init with specific fleet configuration
      const options: InitOptions = {
        topology: 'hierarchical',
        maxAgents: '10',
        focus: 'unit,integration',
        environments: 'development',
        frameworks: 'jest',
        config: true,
        verbose: false,
        enableLearning: true,
        force: false
      };

      // WHEN: Init command executes
      await initCommand(options);

      // THEN: Fleet config file should exist
      const configPath = path.join(testWorkspace, '.agentic-qe', 'config', 'fleet.json');
      expect(await fs.pathExists(configPath)).toBe(true);

      // AND: Config should contain correct values
      const config = await fs.readJson(configPath);
      expect(config.topology).toBe('hierarchical');
      expect(config.maxAgents).toBe(10);
      expect(config.testingFocus).toEqual(['unit', 'integration']);
      expect(config.environments).toEqual(['development']);
      expect(config.frameworks).toEqual(['jest']);
    });

    it('initializes database tables (memory, agents, learning)', async () => {
      // GIVEN: User runs aqe init
      const options: InitOptions = {
        topology: 'mesh',
        maxAgents: '8',
        focus: 'unit',
        environments: 'development',
        frameworks: 'jest',
        config: true,
        verbose: false,
        enableLearning: true,
        force: false
      };

      // WHEN: Init command executes
      await initCommand(options);

      // THEN: Unified database should exist
      const dbPath = resolveDbPath();
      expect(await fs.pathExists(dbPath)).toBe(true);

      // AND: Database should have all required tables
      const memoryManager = getSharedMemoryManager();

      // Verify memory operations work (table exists)
      await memoryManager.store('test-key', { value: 'test-data' }, {
        partition: 'test',
        ttl: 1000
      });

      const retrieved = await memoryManager.retrieve('test-key', { partition: 'test' });
      expect(retrieved).toEqual({ value: 'test-data' });

      // Verify agent registry table exists
      await memoryManager.registerAgent({
        id: 'test-agent-1',
        type: 'test-generator',
        capabilities: ['unit-testing'],
        status: 'idle',
        performance: { successRate: 0.95 }
      });

      const agent = await memoryManager.getAgent('test-agent-1');
      expect(agent.type).toBe('test-generator');
      expect(agent.status).toBe('idle');

      // Verify pattern storage (learning table)
      await memoryManager.storePattern({
        pattern: 'test-pattern-1',
        confidence: 0.85,
        usageCount: 1,
        metadata: { framework: 'jest' }
      });

      const patterns = await memoryManager.getPatterns({ minConfidence: 0.8 });
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns[0].pattern).toBe('test-pattern-1');
    });

    it('registers agents in fleet', async () => {
      // GIVEN: User initializes fleet with specific agent configuration
      const options: InitOptions = {
        topology: 'hierarchical',
        maxAgents: '10',
        focus: 'unit,integration,e2e',
        environments: 'development,staging',
        frameworks: 'jest',
        config: true,
        verbose: false,
        enableLearning: true,
        force: false
      };

      // WHEN: Init completes
      await initCommand(options);

      // THEN: Agent registry should be initialized
      const memoryManager = getSharedMemoryManager();

      // Register test agents (simulating what fleet would do)
      const testAgents = [
        { id: 'qe-test-gen-1', type: 'test-generator', capabilities: ['unit', 'integration'] },
        { id: 'qe-coverage-1', type: 'coverage-analyzer', capabilities: ['analysis'] },
        { id: 'qe-quality-1', type: 'quality-gate', capabilities: ['validation'] }
      ];

      for (const agent of testAgents) {
        await memoryManager.registerAgent({
          id: agent.id,
          type: agent.type,
          capabilities: agent.capabilities,
          status: 'idle',
          performance: { tasksCompleted: 0 }
        });
      }

      // Verify agents can be retrieved
      for (const agent of testAgents) {
        const retrieved = await memoryManager.getAgent(agent.id);
        expect(retrieved.id).toBe(agent.id);
        expect(retrieved.type).toBe(agent.type);
        expect(retrieved.status).toBe('idle');
      }

      // Verify agents can be queried by status
      const idleAgents = await memoryManager.queryAgentsByStatus('idle');
      expect(idleAgents.length).toBe(3);
    });

    it('loads skills configuration', async () => {
      // GIVEN: User runs aqe init
      const options: InitOptions = {
        topology: 'mesh',
        maxAgents: '10',
        focus: 'unit,integration',
        environments: 'development',
        frameworks: 'jest',
        config: true,
        verbose: false,
        enableLearning: true,
        force: false
      };

      // WHEN: Init executes
      await initCommand(options);

      // THEN: Skills should be copied to .claude/skills directory
      const skillsDir = path.join(testWorkspace, '.claude', 'skills');
      expect(await fs.pathExists(skillsDir)).toBe(true);

      // AND: Core QE skills should exist
      const expectedSkills = [
        'agentic-quality-engineering.md',
        'tdd-london-chicago.md',
        'api-testing-patterns.md',
        'shift-left-testing.md'
      ];

      for (const skill of expectedSkills) {
        const skillPath = path.join(skillsDir, skill);
        const exists = await fs.pathExists(skillPath);
        expect(exists).toBe(true);

        if (exists) {
          const content = await fs.readFile(skillPath, 'utf-8');
          expect(content.length).toBeGreaterThan(0);
        }
      }
    });

    it('validates agents can query database after init', async () => {
      // GIVEN: Fleet is initialized
      const options: InitOptions = {
        topology: 'adaptive',
        maxAgents: '12',
        focus: 'unit,integration,performance',
        environments: 'development',
        frameworks: 'jest',
        config: true,
        verbose: false,
        enableLearning: true,
        force: false
      };

      await initCommand(options);

      // WHEN: Agents perform database operations
      const memoryManager = getSharedMemoryManager();

      // Agent 1: Stores test execution data
      await memoryManager.store('test-execution:suite-1', {
        suite: 'UserService',
        passed: 45,
        failed: 2,
        duration: 1234,
        timestamp: Date.now()
      }, {
        partition: 'test-results',
        owner: 'qe-test-gen-1'
      });

      // Agent 2: Stores coverage data
      await memoryManager.store('coverage:suite-1', {
        file: 'src/UserService.ts',
        lines: { total: 100, covered: 87 },
        branches: { total: 24, covered: 20 },
        functions: { total: 12, covered: 11 }
      }, {
        partition: 'coverage-reports',
        owner: 'qe-coverage-1'
      });

      // Agent 3: Stores quality metrics
      await memoryManager.store('quality-gate:suite-1', {
        passed: false,
        violations: [
          { rule: 'min-coverage', threshold: 90, actual: 87 }
        ]
      }, {
        partition: 'quality-gates',
        owner: 'qe-quality-1'
      });

      // THEN: All agents can retrieve their data
      const testResults = await memoryManager.retrieve('test-execution:suite-1', {
        partition: 'test-results'
      });
      expect(testResults.suite).toBe('UserService');
      expect(testResults.passed).toBe(45);

      const coverage = await memoryManager.retrieve('coverage:suite-1', {
        partition: 'coverage-reports'
      });
      expect(coverage.file).toBe('src/UserService.ts');
      expect(coverage.lines.covered).toBe(87);

      const qualityGate = await memoryManager.retrieve('quality-gate:suite-1', {
        partition: 'quality-gates'
      });
      expect(qualityGate.passed).toBe(false);
      expect(qualityGate.violations).toHaveLength(1);
    });

    it('creates learning system configuration', async () => {
      // GIVEN: User enables learning
      const options: InitOptions = {
        topology: 'hierarchical',
        maxAgents: '10',
        focus: 'unit',
        environments: 'development',
        frameworks: 'jest',
        config: true,
        verbose: false,
        enableLearning: true,
        force: false
      };

      // WHEN: Init completes
      await initCommand(options);

      // THEN: Learning config should exist
      const learningConfigPath = path.join(testWorkspace, '.agentic-qe', 'config', 'learning.json');
      expect(await fs.pathExists(learningConfigPath)).toBe(true);

      const learningConfig = await fs.readJson(learningConfigPath);
      expect(learningConfig.enabled).toBe(true);
      expect(learningConfig.learningRate).toBeGreaterThan(0);
      expect(learningConfig.discountFactor).toBeGreaterThan(0);
      expect(learningConfig.targetImprovement).toBeGreaterThan(0);

      // AND: Learning state should be initialized
      const learningStatePath = path.join(testWorkspace, '.agentic-qe', 'data', 'learning', 'state.json');
      expect(await fs.pathExists(learningStatePath)).toBe(true);

      const learningState = await fs.readJson(learningStatePath);
      expect(learningState.initialized).toBe(true);
      expect(learningState.agents).toBeDefined();
    });

    it('creates improvement loop configuration', async () => {
      // GIVEN: User initializes fleet
      const options: InitOptions = {
        topology: 'mesh',
        maxAgents: '8',
        focus: 'unit,integration',
        environments: 'development',
        frameworks: 'jest',
        config: true,
        verbose: false,
        enableLearning: true,
        force: false
      };

      // WHEN: Init completes
      await initCommand(options);

      // THEN: Improvement config should exist
      const improvementConfigPath = path.join(testWorkspace, '.agentic-qe', 'config', 'improvement.json');
      expect(await fs.pathExists(improvementConfigPath)).toBe(true);

      const improvementConfig = await fs.readJson(improvementConfigPath);
      expect(improvementConfig.enabled).toBe(true);
      expect(improvementConfig.enableABTesting).toBe(true);
      expect(improvementConfig.autoApply).toBe(false); // Should require user approval
      expect(improvementConfig.strategies).toBeDefined();
      expect(improvementConfig.abTesting).toBeDefined();

      // AND: Improvement state should be initialized
      const improvementStatePath = path.join(testWorkspace, '.agentic-qe', 'data', 'improvement', 'state.json');
      expect(await fs.pathExists(improvementStatePath)).toBe(true);
    });

    it('creates complete directory structure', async () => {
      // GIVEN: User runs aqe init
      const options: InitOptions = {
        topology: 'hierarchical',
        maxAgents: '10',
        focus: 'unit',
        environments: 'development',
        frameworks: 'jest',
        config: true,
        verbose: false,
        enableLearning: true,
        force: false
      };

      // WHEN: Init completes
      await initCommand(options);

      // THEN: All expected directories should exist
      const expectedDirs = [
        '.agentic-qe',
        '.agentic-qe/data',
        '.agentic-qe/data/learning',
        '.agentic-qe/data/patterns',
        '.agentic-qe/data/improvement',
        '.agentic-qe/data/memory',
        '.agentic-qe/agents',
        '.agentic-qe/config',
        '.agentic-qe/docs',
        'tests',
        'tests/unit',
        'tests/integration',
        'tests/e2e'
      ];

      for (const dir of expectedDirs) {
        const dirPath = path.join(testWorkspace, dir);
        expect(await fs.pathExists(dirPath)).toBe(true);
      }
    });

    it('handles multiple init calls gracefully (idempotent)', async () => {
      // GIVEN: User has already initialized the fleet
      const options: InitOptions = {
        topology: 'mesh',
        maxAgents: '10',
        focus: 'unit',
        environments: 'development',
        frameworks: 'jest',
        config: true,
        verbose: false,
        enableLearning: true,
        force: false
      };

      await initCommand(options);

      // Store some data in the database
      const memoryManager = getSharedMemoryManager();
      await memoryManager.store('persistent-data', { value: 'important' }, {
        partition: 'user-data'
      });

      // WHEN: User runs init again without force
      await initCommand(options);

      // THEN: Existing data should be preserved
      const retrieved = await memoryManager.retrieve('persistent-data', {
        partition: 'user-data'
      });
      expect(retrieved).toEqual({ value: 'important' });

      // AND: Configuration should still be valid
      const configPath = path.join(testWorkspace, '.agentic-qe', 'config', 'fleet.json');
      const config = await fs.readJson(configPath);
      expect(config.topology).toBe('mesh');
    });

    it('validates minimum and maximum agent counts', async () => {
      // GIVEN: User tries to initialize with invalid agent count
      const invalidOptions: InitOptions = {
        topology: 'hierarchical',
        maxAgents: '3', // Below minimum of 5
        focus: 'unit',
        environments: 'development',
        frameworks: 'jest',
        config: true,
        verbose: false,
        enableLearning: false,
        force: false
      };

      // WHEN: Init executes
      // THEN: Should throw validation error
      await expect(initCommand(invalidOptions)).rejects.toThrow(
        /Max agents must be between 5 and 50/
      );

      // GIVEN: User tries with excessive agent count
      const tooManyOptions: InitOptions = {
        topology: 'hierarchical',
        maxAgents: '100', // Above maximum of 50
        focus: 'unit',
        environments: 'development',
        frameworks: 'jest',
        config: true,
        verbose: false,
        enableLearning: false,
        force: false
      };

      // THEN: Should also throw validation error
      await expect(initCommand(tooManyOptions)).rejects.toThrow(
        /Max agents must be between 5 and 50/
      );
    });

    it('validates topology options', async () => {
      // GIVEN: User provides invalid topology
      const invalidOptions: InitOptions = {
        topology: 'invalid-topology' as any,
        maxAgents: '10',
        focus: 'unit',
        environments: 'development',
        frameworks: 'jest',
        config: true,
        verbose: false,
        enableLearning: false,
        force: false
      };

      // WHEN: Init executes
      // THEN: Should throw validation error
      await expect(initCommand(invalidOptions)).rejects.toThrow(
        /Invalid topology/
      );
    });
  });
});
