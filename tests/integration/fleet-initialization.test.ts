/**
 * Fleet Initialization Integration Tests
 * 
 * Tests the complete fleet initialization flow from configuration
 * to agent spawning and coordination setup.
 */

import { describe, beforeEach, afterEach, it, expect, jest } from '@jest/globals';
import * as path from 'path';
import * as fs from 'fs-extra';
import { FleetManager } from '../../src/core/FleetManager';
import { EventBus } from '../../src/core/EventBus';
import { Database } from '../../src/utils/Database';
import { Logger } from '../../src/utils/Logger';
import { InitCommand } from '../../src/cli/commands/init';
import { FleetConfig } from '../../src/types';

// Mock external dependencies
jest.mock('../../src/utils/Database');
jest.mock('../../src/utils/Logger');
jest.mock('fs-extra');
jest.mock('inquirer');
jest.mock('ora');

const mockDatabase = Database as jest.MockedClass<typeof Database>;
const mockLogger = Logger as jest.MockedClass<typeof Logger>;
const mockFs = fs as jest.Mocked<typeof fs>;

describe('Fleet Initialization Integration Tests', () => {
  let testDir: string;
  let originalCwd: string;
  let mockLoggerInstance: jest.Mocked<Logger>;

  beforeEach(async () => {
    // Setup test environment
    originalCwd = process.cwd();
    testDir = path.join(__dirname, '../tmp/fleet-init-test');
    
    // Mock logger instance
    mockLoggerInstance = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    } as any;
    mockLogger.getInstance.mockReturnValue(mockLoggerInstance);

    // Mock fs operations
    mockFs.ensureDir.mockResolvedValue(undefined as any);
    mockFs.writeJson.mockResolvedValue(undefined as any);
    mockFs.writeFile.mockResolvedValue(undefined as any);
    mockFs.chmod.mockResolvedValue(undefined as any);
    mockFs.pathExists.mockResolvedValue(true);

    // Clear all mocks
    jest.clearAllMocks();
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    jest.clearAllMocks();
  });

  describe('Fleet Manager Initialization', () => {
    it('should initialize fleet manager with valid configuration', async () => {
      const config: FleetConfig = {
        topology: 'hierarchical',
        maxAgents: 10,
        testingFocus: ['unit', 'integration'],
        environments: ['development', 'staging'],
        frameworks: ['jest', 'mocha']
      };

      const mockDb = {
        initialize: jest.fn().mockResolvedValue(undefined),
        close: jest.fn().mockResolvedValue(undefined)
      };
      mockDatabase.prototype.initialize = mockDb.initialize;
      mockDatabase.prototype.close = mockDb.close;

      const fleetManager = new FleetManager(config);
      await fleetManager.initialize();

      expect(mockDb.initialize).toHaveBeenCalled();
      expect(mockLoggerInstance.info).toHaveBeenCalledWith(
        expect.stringContaining('Initializing Fleet Manager')
      );
      expect(fleetManager.getStatus().status).toBe('running');
    });

    it('should handle initialization failures gracefully', async () => {
      const config: FleetConfig = {
        topology: 'mesh',
        maxAgents: 5,
        testingFocus: ['unit'],
        environments: ['test'],
        frameworks: ['jest']
      };

      const initError = new Error('Database connection failed');
      const mockDb = {
        initialize: jest.fn().mockRejectedValue(initError)
      };
      mockDatabase.prototype.initialize = mockDb.initialize;

      const fleetManager = new FleetManager(config);
      
      await expect(fleetManager.initialize()).rejects.toThrow('Database connection failed');
      expect(mockLoggerInstance.error).toHaveBeenCalledWith(
        'Failed to initialize Fleet Manager:',
        initError
      );
    });

    it('should create initial agent pool based on configuration', async () => {
      const config: FleetConfig = {
        topology: 'adaptive',
        maxAgents: 8,
        testingFocus: ['unit', 'integration', 'e2e'],
        environments: ['development'],
        frameworks: ['jest'],
        agents: [
          { type: 'test-generator', count: 2, config: {} },
          { type: 'coverage-analyzer', count: 1, config: {} }
        ]
      };

      const mockDb = {
        initialize: jest.fn().mockResolvedValue(undefined)
      };
      mockDatabase.prototype.initialize = mockDb.initialize;

      const fleetManager = new FleetManager(config);
      await fleetManager.initialize();

      const agents = fleetManager.getAllAgents();
      expect(agents).toHaveLength(3); // 2 test-generators + 1 coverage-analyzer
      expect(mockLoggerInstance.info).toHaveBeenCalledWith(
        expect.stringContaining('Fleet Manager initialized successfully')
      );
    });
  });

  describe('CLI Initialization Command', () => {
    it('should execute full initialization workflow', async () => {
      const options = {
        topology: 'hierarchical' as const,
        maxAgents: '10',
        focus: 'unit,integration',
        environments: 'development,staging',
        frameworks: 'jest,mocha',
        config: false,
        verbose: false
      };

      // Mock inquirer responses
      const inquirer = require('inquirer');
      inquirer.prompt = jest.fn().mockResolvedValue({
        projectName: 'test-project',
        language: 'TypeScript',
        useClaudeFlow: true,
        setupCi: true
      });

      // Mock ora spinner
      const ora = require('ora');
      const mockSpinner = {
        start: jest.fn().mockReturnThis(),
        text: '',
        succeed: jest.fn()
      };
      ora.mockReturnValue(mockSpinner);

      await InitCommand.execute(options);

      // Verify directory structure creation
      const expectedDirs = [
        '.agentic-qe',
        '.agentic-qe/config',
        '.agentic-qe/logs',
        '.agentic-qe/data',
        '.agentic-qe/agents',
        '.agentic-qe/reports',
        'tests/unit',
        'tests/integration',
        'tests/e2e',
        'tests/performance',
        'tests/security'
      ];

      expectedDirs.forEach(dir => {
        expect(mockFs.ensureDir).toHaveBeenCalledWith(dir);
      });

      // Verify configuration files creation
      expect(mockFs.writeJson).toHaveBeenCalledWith(
        '.agentic-qe/config/fleet.json',
        expect.objectContaining({
          topology: 'hierarchical',
          maxAgents: 10,
          testingFocus: ['unit', 'integration'],
          environments: ['development', 'staging'],
          frameworks: ['jest', 'mocha']
        }),
        { spaces: 2 }
      );

      expect(mockSpinner.succeed).toHaveBeenCalledWith(
        expect.stringContaining('Fleet initialization completed successfully!')
      );
    });

    it('should validate input parameters and fail on invalid values', async () => {
      const invalidOptions = {
        topology: 'invalid' as any,
        maxAgents: '100', // exceeds limit
        focus: 'unit',
        environments: 'development',
        frameworks: 'jest',
        config: false,
        verbose: false
      };

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const processSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      await expect(InitCommand.execute(invalidOptions)).rejects.toThrow('process.exit called');
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid topology')
      );

      consoleSpy.mockRestore();
      processSpy.mockRestore();
    });

    it('should setup Claude Flow integration when requested', async () => {
      const options = {
        topology: 'mesh' as const,
        maxAgents: '6',
        focus: 'unit',
        environments: 'development',
        frameworks: 'jest',
        config: false,
        verbose: false
      };

      const inquirer = require('inquirer');
      inquirer.prompt = jest.fn().mockResolvedValue({
        projectName: 'claude-flow-project',
        language: 'TypeScript',
        useClaudeFlow: true,
        setupCi: false
      });

      const ora = require('ora');
      ora.mockReturnValue({
        start: jest.fn().mockReturnThis(),
        text: '',
        succeed: jest.fn()
      });

      await InitCommand.execute(options);

      // Verify Claude Flow configuration
      expect(mockFs.writeJson).toHaveBeenCalledWith(
        '.agentic-qe/config/claude-flow.json',
        expect.objectContaining({
          hooks: expect.objectContaining({
            'pre-task': expect.objectContaining({
              command: 'npx claude-flow@alpha hooks pre-task',
              enabled: true
            }),
            'post-edit': expect.objectContaining({
              command: 'npx claude-flow@alpha hooks post-edit',
              enabled: true
            }),
            'post-task': expect.objectContaining({
              command: 'npx claude-flow@alpha hooks post-task',
              enabled: true
            })
          }),
          coordination: expect.objectContaining({
            enabled: true,
            topology: 'mesh',
            memory: expect.objectContaining({
              namespace: 'agentic-qe',
              ttl: 3600
            })
          })
        }),
        { spaces: 2 }
      );
    });
  });

  describe('Configuration Generation', () => {
    it('should generate proper agent configurations', async () => {
      const config: FleetConfig = {
        topology: 'ring',
        maxAgents: 15,
        testingFocus: ['unit', 'integration', 'performance'],
        environments: ['development', 'staging', 'production'],
        frameworks: ['jest', 'cypress']
      };

      const options = {
        topology: config.topology,
        maxAgents: config.maxAgents.toString(),
        focus: config.testingFocus.join(','),
        environments: config.environments.join(','),
        frameworks: config.frameworks.join(','),
        config: true,
        verbose: false
      };

      const ora = require('ora');
      ora.mockReturnValue({
        start: jest.fn().mockReturnThis(),
        text: '',
        succeed: jest.fn()
      });

      await InitCommand.execute(options);

      // Verify agent configurations include all expected types
      const agentConfigCall = mockFs.writeJson.mock.calls.find(
        call => call[0] === '.agentic-qe/config/agents.json'
      );
      
      expect(agentConfigCall).toBeDefined();
      const agentConfig = agentConfigCall![1];
      
      expect(agentConfig.fleet.topology).toBe('ring');
      expect(agentConfig.fleet.maxAgents).toBe(15);
      expect(agentConfig.fleet.agents).toHaveLength(5); // 5 agent types
      
      const agentTypes = agentConfig.fleet.agents.map((a: any) => a.type);
      expect(agentTypes).toContain('test-generator');
      expect(agentTypes).toContain('coverage-analyzer');
      expect(agentTypes).toContain('quality-gate');
      expect(agentTypes).toContain('performance-tester');
      expect(agentTypes).toContain('security-scanner');
    });

    it('should generate environment-specific configurations', async () => {
      const environments = ['development', 'staging', 'production'];
      const options = {
        topology: 'adaptive' as const,
        maxAgents: '8',
        focus: 'unit',
        environments: environments.join(','),
        frameworks: 'jest',
        config: true,
        verbose: false
      };

      const ora = require('ora');
      ora.mockReturnValue({
        start: jest.fn().mockReturnThis(),
        text: '',
        succeed: jest.fn()
      });

      await InitCommand.execute(options);

      // Verify environment configurations
      const envConfigCall = mockFs.writeJson.mock.calls.find(
        call => call[0] === '.agentic-qe/config/environments.json'
      );
      
      expect(envConfigCall).toBeDefined();
      const envConfig = envConfigCall![1];
      
      // Check each environment has proper configuration
      environments.forEach(env => {
        expect(envConfig[env]).toBeDefined();
        expect(envConfig[env].database).toBeDefined();
        expect(envConfig[env].testing).toBeDefined();
        expect(envConfig[env].monitoring).toBeDefined();
        
        // Production should have different settings
        if (env === 'production') {
          expect(envConfig[env].database.type).toBe('postgresql');
          expect(envConfig[env].testing.parallel).toBe(false);
          expect(envConfig[env].monitoring.alerts).toBe(true);
        } else {
          expect(envConfig[env].database.type).toBe('sqlite');
          expect(envConfig[env].testing.parallel).toBe(true);
        }
      });
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle file system errors gracefully', async () => {
      const options = {
        topology: 'hierarchical' as const,
        maxAgents: '5',
        focus: 'unit',
        environments: 'development',
        frameworks: 'jest',
        config: true,
        verbose: true
      };

      const fsError = new Error('Permission denied');
      mockFs.ensureDir.mockRejectedValueOnce(fsError);

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const processSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      await expect(InitCommand.execute(options)).rejects.toThrow('process.exit called');
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Initialization failed:'),
        'Permission denied'
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error: Permission denied')
      );

      consoleSpy.mockRestore();
      processSpy.mockRestore();
    });

    it('should clean up resources on initialization failure', async () => {
      const config: FleetConfig = {
        topology: 'mesh',
        maxAgents: 5,
        testingFocus: ['unit'],
        environments: ['test'],
        frameworks: ['jest']
      };

      const mockDb = {
        initialize: jest.fn().mockRejectedValue(new Error('Connection failed')),
        close: jest.fn().mockResolvedValue(undefined)
      };
      mockDatabase.prototype.initialize = mockDb.initialize;
      mockDatabase.prototype.close = mockDb.close;

      const fleetManager = new FleetManager(config);
      
      await expect(fleetManager.initialize()).rejects.toThrow('Connection failed');
      
      // Fleet should remain in error state
      expect(fleetManager.getStatus().status).toBe('initializing');
    });
  });

  describe('Coordination Setup', () => {
    it('should create coordination scripts for Claude Flow integration', async () => {
      const options = {
        topology: 'adaptive' as const,
        maxAgents: '7',
        focus: 'unit,integration',
        environments: 'development,staging',
        frameworks: 'jest',
        config: false,
        verbose: false
      };

      const inquirer = require('inquirer');
      inquirer.prompt = jest.fn().mockResolvedValue({
        projectName: 'coordination-test',
        language: 'TypeScript',
        useClaudeFlow: true,
        setupCi: true
      });

      const ora = require('ora');
      ora.mockReturnValue({
        start: jest.fn().mockReturnThis(),
        text: '',
        succeed: jest.fn()
      });

      await InitCommand.execute(options);

      // Verify pre-execution coordination script creation (AQE native)
      const preScriptCall = mockFs.writeFile.mock.calls.find(
        call => call[0] === '.agentic-qe/scripts/pre-execution.sh'
      );

      expect(preScriptCall).toBeDefined();
      const preScript = preScriptCall![1];

      expect(preScript).toContain('agentic-qe fleet status --json');
      expect(preScript).toContain('.agentic-qe/state/coordination/fleet-config.json');
      expect(preScript).toContain('Pre-execution coordination complete');

      // Verify post-execution coordination script creation (AQE native)
      const postScriptCall = mockFs.writeFile.mock.calls.find(
        call => call[0] === '.agentic-qe/scripts/post-execution.sh'
      );

      expect(postScriptCall).toBeDefined();
      const postScript = postScriptCall![1];

      expect(postScript).toContain('agentic-qe fleet status --json');
      expect(postScript).toContain('.agentic-qe/state/coordination/last-execution.json');
      expect(postScript).toContain('Post-execution coordination complete');

      // Verify script permissions for both scripts
      expect(mockFs.chmod).toHaveBeenCalledWith(
        '.agentic-qe/scripts/pre-execution.sh',
        '755'
      );
      expect(mockFs.chmod).toHaveBeenCalledWith(
        '.agentic-qe/scripts/post-execution.sh',
        '755'
      );
    });

    it('should create agent registry for tracking', async () => {
      const config: FleetConfig = {
        topology: 'hierarchical',
        maxAgents: 5,
        testingFocus: ['unit'],
        environments: ['development'],
        frameworks: ['jest']
      };

      const options = {
        topology: config.topology,
        maxAgents: config.maxAgents.toString(),
        focus: config.testingFocus.join(','),
        environments: config.environments.join(','),
        frameworks: config.frameworks.join(','),
        config: true,
        verbose: false
      };

      const ora = require('ora');
      ora.mockReturnValue({
        start: jest.fn().mockReturnThis(),
        text: '',
        succeed: jest.fn()
      });

      await InitCommand.execute(options);

      // Verify registry creation
      const registryCall = mockFs.writeJson.mock.calls.find(
        call => call[0] === '.agentic-qe/data/registry.json'
      );
      
      expect(registryCall).toBeDefined();
      const registry = registryCall![1];
      
      expect(registry.fleet.status).toBe('initializing');
      expect(registry.fleet.agents).toEqual([]);
      expect(registry.fleet.id).toMatch(/^fleet-\d+$/);
      expect(registry.fleet.created).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });
});
