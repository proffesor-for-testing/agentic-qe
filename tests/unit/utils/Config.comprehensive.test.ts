/**
 * Comprehensive Tests for Config
 * Coverage target: 90%+ of Config.ts
 */

import { Config, FleetConfig, DatabaseConfig } from '../../../src/utils/Config';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import * as yaml from 'yaml';

describe('Config - Comprehensive Tests', () => {
  let testDir: string;
  let configFilePath: string;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `config-test-${Date.now()}`);
    await fs.ensureDir(testDir);
    configFilePath = path.join(testDir, 'fleet.yaml');

    // Reset singleton
    (Config as any).instance = null;

    // Clear environment variables
    delete process.env.FLEET_ID;
    delete process.env.FLEET_NAME;
    delete process.env.MAX_AGENTS;
    delete process.env.CONFIG_FILE;
  });

  afterEach(async () => {
    await fs.remove(testDir);
    (Config as any).instance = null;
  });

  describe('Configuration Loading', () => {
    it('should load default configuration', async () => {
      const config = await Config.load();

      expect(config.fleet.id).toBeDefined();
      expect(config.fleet.name).toBe('AQE Fleet');
      expect(config.fleet.maxAgents).toBe(10);
      expect(config.agents).toHaveLength(3);
      expect(config.database.type).toBe('sqlite');
    });

    it('should load configuration from YAML file', async () => {
      const yamlConfig: Partial<FleetConfig> = {
        fleet: {
          id: 'yaml-fleet',
          name: 'YAML Fleet',
          maxAgents: 20,
          heartbeatInterval: 60000,
          taskTimeout: 600000
        }
      };

      await fs.writeFile(configFilePath, yaml.stringify(yamlConfig));

      const config = await Config.load(configFilePath);

      expect(config.fleet.id).toBe('yaml-fleet');
      expect(config.fleet.name).toBe('YAML Fleet');
      expect(config.fleet.maxAgents).toBe(20);
    });

    it('should load configuration from JSON file', async () => {
      const jsonFilePath = path.join(testDir, 'fleet.json');
      const jsonConfig: Partial<FleetConfig> = {
        fleet: {
          id: 'json-fleet',
          name: 'JSON Fleet',
          maxAgents: 15,
          heartbeatInterval: 30000,
          taskTimeout: 300000
        }
      };

      await fs.writeJson(jsonFilePath, jsonConfig);

      const config = await Config.load(jsonFilePath);

      expect(config.fleet.id).toBe('json-fleet');
      expect(config.fleet.name).toBe('JSON Fleet');
    });

    it('should override defaults with environment variables', async () => {
      process.env.FLEET_ID = 'env-fleet';
      process.env.FLEET_NAME = 'Environment Fleet';
      process.env.MAX_AGENTS = '25';

      const config = await Config.load();

      expect(config.fleet.id).toBe('env-fleet');
      expect(config.fleet.name).toBe('Environment Fleet');
      expect(config.fleet.maxAgents).toBe(25);
    });

    it('should prioritize file config over defaults', async () => {
      const yamlConfig: Partial<FleetConfig> = {
        fleet: {
          id: 'file-fleet',
          name: 'File Fleet',
          maxAgents: 30,
          heartbeatInterval: 30000,
          taskTimeout: 300000
        }
      };

      await fs.writeFile(configFilePath, yaml.stringify(yamlConfig));

      const config = await Config.load(configFilePath);

      expect(config.fleet.id).toBe('file-fleet');
    });

    it('should handle missing config file gracefully', async () => {
      const nonExistentPath = path.join(testDir, 'nonexistent.yaml');

      const config = await Config.load(nonExistentPath);

      // Should fall back to defaults
      expect(config.fleet.name).toBe('AQE Fleet');
    });

    it('should handle malformed YAML gracefully', async () => {
      await fs.writeFile(configFilePath, 'invalid: yaml: content: [');

      const config = await Config.load(configFilePath);

      // Should fall back to defaults
      expect(config.fleet.name).toBe('AQE Fleet');
    });

    it('should handle malformed JSON gracefully', async () => {
      const jsonFilePath = path.join(testDir, 'fleet.json');
      await fs.writeFile(jsonFilePath, '{ invalid json }');

      const config = await Config.load(jsonFilePath);

      // Should fall back to defaults
      expect(config.fleet.name).toBe('AQE Fleet');
    });

    it('should use CONFIG_FILE environment variable', async () => {
      const yamlConfig: Partial<FleetConfig> = {
        fleet: {
          id: 'env-config-fleet',
          name: 'Env Config Fleet',
          maxAgents: 12,
          heartbeatInterval: 30000,
          taskTimeout: 300000
        }
      };

      await fs.writeFile(configFilePath, yaml.stringify(yamlConfig));
      process.env.CONFIG_FILE = configFilePath;

      const config = await Config.load();

      expect(config.fleet.id).toBe('env-config-fleet');
    });
  });

  describe('Configuration Validation', () => {
    it('should validate fleet ID is required', async () => {
      const invalidConfig: any = {
        fleet: {
          id: '',
          name: 'Test',
          maxAgents: 10,
          heartbeatInterval: 30000,
          taskTimeout: 300000
        },
        agents: [{ type: 'test', count: 1, config: {} }],
        database: { type: 'sqlite', database: 'test', filename: 'test.db' }
      };

      await fs.writeFile(configFilePath, yaml.stringify(invalidConfig));

      await expect(Config.load(configFilePath)).rejects.toThrow('Fleet ID is required');
    });

    it('should validate maxAgents is greater than 0', async () => {
      const invalidConfig: any = {
        fleet: {
          id: 'test',
          name: 'Test',
          maxAgents: 0,
          heartbeatInterval: 30000,
          taskTimeout: 300000
        },
        agents: [{ type: 'test', count: 1, config: {} }],
        database: { type: 'sqlite', database: 'test', filename: 'test.db' }
      };

      await fs.writeFile(configFilePath, yaml.stringify(invalidConfig));

      await expect(Config.load(configFilePath)).rejects.toThrow('Max agents must be greater than 0');
    });

    it('should validate agents array is not empty', async () => {
      const invalidConfig: any = {
        fleet: {
          id: 'test',
          name: 'Test',
          maxAgents: 10,
          heartbeatInterval: 30000,
          taskTimeout: 300000
        },
        agents: [],
        database: { type: 'sqlite', database: 'test', filename: 'test.db' }
      };

      await fs.writeFile(configFilePath, yaml.stringify(invalidConfig));

      await expect(Config.load(configFilePath)).rejects.toThrow('At least one agent configuration is required');
    });

    it('should validate agent type is required', async () => {
      const invalidConfig: any = {
        fleet: {
          id: 'test',
          name: 'Test',
          maxAgents: 10,
          heartbeatInterval: 30000,
          taskTimeout: 300000
        },
        agents: [{ type: '', count: 1, config: {} }],
        database: { type: 'sqlite', database: 'test', filename: 'test.db' }
      };

      await fs.writeFile(configFilePath, yaml.stringify(invalidConfig));

      await expect(Config.load(configFilePath)).rejects.toThrow('Agent type is required');
    });

    it('should validate agent count is greater than 0', async () => {
      const invalidConfig: any = {
        fleet: {
          id: 'test',
          name: 'Test',
          maxAgents: 10,
          heartbeatInterval: 30000,
          taskTimeout: 300000
        },
        agents: [{ type: 'test', count: 0, config: {} }],
        database: { type: 'sqlite', database: 'test', filename: 'test.db' }
      };

      await fs.writeFile(configFilePath, yaml.stringify(invalidConfig));

      await expect(Config.load(configFilePath)).rejects.toThrow('Agent count must be greater than 0');
    });

    it('should validate database name is required', async () => {
      const invalidConfig: any = {
        fleet: {
          id: 'test',
          name: 'Test',
          maxAgents: 10,
          heartbeatInterval: 30000,
          taskTimeout: 300000
        },
        agents: [{ type: 'test', count: 1, config: {} }],
        database: { type: 'sqlite', database: '', filename: 'test.db' }
      };

      await fs.writeFile(configFilePath, yaml.stringify(invalidConfig));

      await expect(Config.load(configFilePath)).rejects.toThrow('Database name is required');
    });

    it('should validate SQLite filename is required', async () => {
      const invalidConfig: any = {
        fleet: {
          id: 'test',
          name: 'Test',
          maxAgents: 10,
          heartbeatInterval: 30000,
          taskTimeout: 300000
        },
        agents: [{ type: 'test', count: 1, config: {} }],
        database: { type: 'sqlite', database: 'test', filename: '' }
      };

      await fs.writeFile(configFilePath, yaml.stringify(invalidConfig));

      await expect(Config.load(configFilePath)).rejects.toThrow('SQLite filename is required');
    });

    it('should validate API port range', async () => {
      const invalidConfig: any = {
        fleet: {
          id: 'test',
          name: 'Test',
          maxAgents: 10,
          heartbeatInterval: 30000,
          taskTimeout: 300000
        },
        agents: [{ type: 'test', count: 1, config: {} }],
        database: { type: 'sqlite', database: 'test', filename: 'test.db' },
        api: { port: 0, host: 'localhost', cors: false, rateLimit: { windowMs: 900000, max: 100 } }
      };

      await fs.writeFile(configFilePath, yaml.stringify(invalidConfig));

      await expect(Config.load(configFilePath)).rejects.toThrow('API port must be between 1 and 65535');
    });

    it('should validate API port upper bound', async () => {
      const invalidConfig: any = {
        fleet: {
          id: 'test',
          name: 'Test',
          maxAgents: 10,
          heartbeatInterval: 30000,
          taskTimeout: 300000
        },
        agents: [{ type: 'test', count: 1, config: {} }],
        database: { type: 'sqlite', database: 'test', filename: 'test.db' },
        api: { port: 70000, host: 'localhost', cors: false, rateLimit: { windowMs: 900000, max: 100 } }
      };

      await fs.writeFile(configFilePath, yaml.stringify(invalidConfig));

      await expect(Config.load(configFilePath)).rejects.toThrow('API port must be between 1 and 65535');
    });
  });

  describe('Singleton Pattern', () => {
    it('should create singleton instance after load', async () => {
      await Config.load();

      const instance = Config.getInstance();

      expect(instance).toBeDefined();
    });

    it('should throw error when getInstance called before load', () => {
      expect(() => Config.getInstance()).toThrow('Config not loaded');
    });

    it('should return same instance on multiple getInstance calls', async () => {
      await Config.load();

      const instance1 = Config.getInstance();
      const instance2 = Config.getInstance();

      expect(instance1).toBe(instance2);
    });
  });

  describe('Configuration Getters', () => {
    it('should get full configuration', async () => {
      await Config.load();
      const instance = Config.getInstance();

      const config = instance.getConfig();

      expect(config.fleet).toBeDefined();
      expect(config.agents).toBeDefined();
      expect(config.database).toBeDefined();
    });

    it('should get fleet configuration', async () => {
      await Config.load();
      const instance = Config.getInstance();

      const fleetConfig = instance.getFleetConfig();

      expect(fleetConfig.id).toBeDefined();
      expect(fleetConfig.maxAgents).toBeGreaterThan(0);
    });

    it('should get agents configuration', async () => {
      await Config.load();
      const instance = Config.getInstance();

      const agentsConfig = instance.getAgentsConfig();

      expect(Array.isArray(agentsConfig)).toBe(true);
      expect(agentsConfig.length).toBeGreaterThan(0);
    });

    it('should get database configuration', async () => {
      await Config.load();
      const instance = Config.getInstance();

      const dbConfig = instance.getDatabaseConfig();

      expect(dbConfig.type).toBeDefined();
      expect(dbConfig.database).toBeDefined();
    });

    it('should get logging configuration', async () => {
      await Config.load();
      const instance = Config.getInstance();

      const loggingConfig = instance.getLoggingConfig();

      expect(loggingConfig.level).toBeDefined();
      expect(loggingConfig.format).toBeDefined();
    });

    it('should get API configuration', async () => {
      await Config.load();
      const instance = Config.getInstance();

      const apiConfig = instance.getApiConfig();

      expect(apiConfig.port).toBeGreaterThan(0);
      expect(apiConfig.host).toBeDefined();
    });

    it('should get security configuration', async () => {
      await Config.load();
      const instance = Config.getInstance();

      const securityConfig = instance.getSecurityConfig();

      expect(securityConfig.encryption).toBeDefined();
    });
  });

  describe('Configuration Merging', () => {
    it('should deep merge nested configurations', async () => {
      const yamlConfig: Partial<FleetConfig> = {
        api: {
          port: 4000,
          host: '0.0.0.0',
          cors: true,
          rateLimit: {
            windowMs: 1000,
            max: 50
          }
        }
      };

      await fs.writeFile(configFilePath, yaml.stringify(yamlConfig));

      const config = await Config.load(configFilePath);

      expect(config.api.port).toBe(4000);
      expect(config.api.rateLimit.max).toBe(50);
    });

    it('should merge agents array completely', async () => {
      const yamlConfig: Partial<FleetConfig> = {
        agents: [
          { type: 'custom-agent', count: 5, config: { custom: true } }
        ]
      };

      await fs.writeFile(configFilePath, yaml.stringify(yamlConfig));

      const config = await Config.load(configFilePath);

      expect(config.agents).toHaveLength(1);
      expect(config.agents[0].type).toBe('custom-agent');
    });

    it('should merge security encryption settings', async () => {
      const yamlConfig: Partial<FleetConfig> = {
        security: {
          encryption: {
            algorithm: 'aes-128-gcm',
            keyLength: 16
          }
        }
      };

      await fs.writeFile(configFilePath, yaml.stringify(yamlConfig));

      const config = await Config.load(configFilePath);

      expect(config.security.encryption.algorithm).toBe('aes-128-gcm');
      expect(config.security.encryption.keyLength).toBe(16);
    });
  });

  describe('Configuration Saving', () => {
    it('should save configuration to file', async () => {
      const saveFilePath = path.join(testDir, 'saved-config.json');

      const configToSave: Partial<FleetConfig> = {
        fleet: {
          id: 'saved-fleet',
          name: 'Saved Fleet',
          maxAgents: 15,
          heartbeatInterval: 30000,
          taskTimeout: 300000
        }
      };

      await Config.save(configToSave, saveFilePath);

      const exists = await fs.pathExists(saveFilePath);
      expect(exists).toBe(true);

      const loaded = await fs.readJson(saveFilePath);
      expect(loaded.fleet.id).toBe('saved-fleet');
    });

    it('should create parent directories when saving', async () => {
      const nestedPath = path.join(testDir, 'nested', 'deep', 'config.json');

      await Config.save({}, nestedPath);

      const exists = await fs.pathExists(nestedPath);
      expect(exists).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle partial file configuration', async () => {
      const partialConfig: any = {
        fleet: {
          maxAgents: 50
        }
      };

      await fs.writeFile(configFilePath, yaml.stringify(partialConfig));

      const config = await Config.load(configFilePath);

      expect(config.fleet.maxAgents).toBe(50);
      expect(config.fleet.id).toBeDefined(); // Should use default
    });

    it('should handle all environment variables', async () => {
      process.env.FLEET_ID = 'env-id';
      process.env.FLEET_NAME = 'Env Name';
      process.env.MAX_AGENTS = '20';
      process.env.HEARTBEAT_INTERVAL = '60000';
      process.env.TASK_TIMEOUT = '600000';
      process.env.DB_TYPE = 'postgres';
      process.env.DB_HOST = 'db.example.com';
      process.env.DB_PORT = '5432';
      process.env.DB_NAME = 'fleet_db';
      process.env.DB_USER = 'admin';
      process.env.DB_PASSWORD = 'secret';
      process.env.LOG_LEVEL = 'debug';
      process.env.LOG_FORMAT = 'text';
      process.env.LOG_OUTPUTS = 'console';
      process.env.API_PORT = '8080';
      process.env.API_HOST = '127.0.0.1';
      process.env.API_CORS = 'true';

      const config = await Config.load();

      expect(config.fleet.id).toBe('env-id');
      expect(config.fleet.maxAgents).toBe(20);
      expect(config.database.type).toBe('postgres');
      expect(config.database.host).toBe('db.example.com');
      expect(config.api.port).toBe(8080);
      expect(config.api.cors).toBe(true);
    });

    it('should parse integer environment variables correctly', async () => {
      process.env.MAX_AGENTS = '99';
      process.env.TEST_EXECUTOR_COUNT = '5';
      process.env.QUALITY_ANALYZER_COUNT = '3';

      const config = await Config.load();

      expect(config.fleet.maxAgents).toBe(99);
      expect(config.agents[0].count).toBe(5);
      expect(config.agents[1].count).toBe(3);
    });

    it('should handle comma-separated log outputs', async () => {
      process.env.LOG_OUTPUTS = 'console,file,syslog';

      const config = await Config.load();

      expect(config.logging.outputs).toEqual(['console', 'file', 'syslog']);
    });
  });
});
