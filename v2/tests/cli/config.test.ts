/**
 * Comprehensive Tests for Configuration CLI Commands
 * Tests all 6 config commands with 35+ test cases
 * Uses REAL JSON schema validation (no mocks except fs)
 */

import * as fs from 'fs-extra';

// Mock Logger to prevent undefined errors in Database
jest.mock('@utils/Logger', () => ({
  Logger: {
    getInstance: jest.fn(() => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    }))
  }
}));
import { ConfigInitCommand } from '@cli/commands/config/init';
import { ConfigValidateCommand } from '@cli/commands/config/validate';
import { ConfigSetCommand } from '@cli/commands/config/set';
import { ConfigGetCommand } from '@cli/commands/config/get';
import { ConfigExportCommand } from '@cli/commands/config/export';
import { ConfigImportCommand } from '@cli/commands/config/import';

jest.mock('fs-extra');
jest.mock('ora', () => {
  const mockOra = (text?: string) => ({
    start: jest.fn().mockReturnThis(),
    stop: jest.fn().mockReturnThis(),
    succeed: jest.fn().mockReturnThis(),
    fail: jest.fn().mockReturnThis(),
    text: ''
  });
  return mockOra;
});

const mockedFs = fs as jest.Mocked<typeof fs>;

describe('Configuration CLI Commands', () => {
  beforeEach(() => {
    // Mock process.exit to prevent test interruption
    jest.spyOn(process, 'exit').mockImplementation((code?: number) => {
      throw new Error(`Process.exit called with code ${code}`);
    });

    jest.clearAllMocks();
    mockedFs.pathExists.mockResolvedValue(false);
    mockedFs.readJson.mockResolvedValue({});
    mockedFs.writeJson.mockResolvedValue();
    mockedFs.ensureDir.mockResolvedValue();
    mockedFs.readFile.mockResolvedValue('{}');
    mockedFs.writeFile.mockResolvedValue();
  });

  describe('config init', () => {
    it('should initialize configuration with default template', async () => {
      await ConfigInitCommand.execute({ template: 'default' });

      expect(mockedFs.ensureDir).toHaveBeenCalledWith('.agentic-qe/config');
      expect(mockedFs.writeJson).toHaveBeenCalledWith(
        '.agentic-qe/config/aqe.config.json',
        expect.objectContaining({
          version: '1.0',
          fleet: expect.any(Object)
        }),
        { spaces: 2 }
      );
    });

    it('should initialize with minimal template', async () => {
      await ConfigInitCommand.execute({ template: 'minimal' });

      expect(mockedFs.writeJson).toHaveBeenCalledWith(
        expect.stringContaining('aqe.config.json'),
        expect.objectContaining({
          version: '1.0',
          fleet: expect.objectContaining({
            topology: 'hierarchical',
            maxAgents: 5
          })
        }),
        expect.any(Object)
      );
    });

    it('should initialize with enterprise template', async () => {
      await ConfigInitCommand.execute({ template: 'enterprise' });

      expect(mockedFs.writeJson).toHaveBeenCalledWith(
        expect.stringContaining('aqe.config.json'),
        expect.objectContaining({
          version: '1.0',
          fleet: expect.objectContaining({
            topology: 'mesh',
            maxAgents: 50
          }),
          features: expect.objectContaining({
            monitoring: true,
            security: expect.objectContaining({
              enabled: true
            })
          })
        }),
        expect.any(Object)
      );
    });

    it('should reject invalid template name', async () => {
      await expect(
        ConfigInitCommand.execute({ template: 'invalid-template' })
      ).rejects.toThrow('Invalid template');
    });

    it('should not overwrite existing config without force flag', async () => {
      mockedFs.pathExists.mockResolvedValue(true);

      await expect(
        ConfigInitCommand.execute({ template: 'default' })
      ).rejects.toThrow('Configuration already exists');
    });

    it('should overwrite existing config with force flag', async () => {
      mockedFs.pathExists.mockResolvedValue(true);

      await ConfigInitCommand.execute({ template: 'default', force: true });

      expect(mockedFs.writeJson).toHaveBeenCalled();
    });

    it('should create backup when overwriting with force', async () => {
      mockedFs.pathExists.mockResolvedValue(true);
      mockedFs.readJson.mockResolvedValue({ version: '1.0', fleet: {} });

      await ConfigInitCommand.execute({ template: 'default', force: true });

      expect(mockedFs.copy).toHaveBeenCalledWith(
        '.agentic-qe/config/aqe.config.json',
        expect.stringContaining('.backup.')
      );
    });

    it('should support interactive mode for template selection', async () => {
      // Mock inquirer responses would go here
      await ConfigInitCommand.execute({ interactive: true });

      expect(mockedFs.writeJson).toHaveBeenCalled();
    });
  });

  describe('config validate', () => {
    it('should validate valid configuration against schema', async () => {
      const validConfig = {
        version: '1.0',
        fleet: {
          topology: 'hierarchical',
          maxAgents: 10,
          testingFocus: ['unit', 'integration']
        }
      };

      mockedFs.pathExists.mockResolvedValue(true);
      mockedFs.readJson.mockResolvedValue(validConfig);

      const result = await ConfigValidateCommand.execute({});

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing required fields', async () => {
      const invalidConfig = {
        version: '1.0'
        // Missing fleet object
      };

      mockedFs.pathExists.mockResolvedValue(true);
      mockedFs.readJson.mockResolvedValue(invalidConfig);

      const result = await ConfigValidateCommand.execute({});

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('fleet');
    });

    it('should detect invalid topology value', async () => {
      const invalidConfig = {
        version: '1.0',
        fleet: {
          topology: 'invalid-topology',
          maxAgents: 10
        }
      };

      mockedFs.pathExists.mockResolvedValue(true);
      mockedFs.readJson.mockResolvedValue(invalidConfig);

      const result = await ConfigValidateCommand.execute({});

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('topology'))).toBe(true);
    });

    it('should detect maxAgents out of range', async () => {
      const invalidConfig = {
        version: '1.0',
        fleet: {
          topology: 'hierarchical',
          maxAgents: 150 // Out of valid range
        }
      };

      mockedFs.pathExists.mockResolvedValue(true);
      mockedFs.readJson.mockResolvedValue(invalidConfig);

      const result = await ConfigValidateCommand.execute({});

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('maxAgents'))).toBe(true);
    });

    it('should validate custom config file path', async () => {
      const customPath = './custom-config.json';
      const validConfig = {
        version: '1.0',
        fleet: { topology: 'mesh', maxAgents: 20 }
      };

      mockedFs.pathExists.mockResolvedValue(true);
      mockedFs.readJson.mockResolvedValue(validConfig);

      const result = await ConfigValidateCommand.execute({ config: customPath });

      expect(mockedFs.readJson).toHaveBeenCalledWith(customPath);
      expect(result.valid).toBe(true);
    });

    it('should handle missing config file gracefully', async () => {
      mockedFs.pathExists.mockResolvedValue(false);

      await expect(
        ConfigValidateCommand.execute({})
      ).rejects.toThrow('Configuration file not found');
    });

    it('should provide detailed validation report', async () => {
      const invalidConfig = {
        version: '1.0',
        fleet: {
          topology: 'invalid',
          maxAgents: -1
        }
      };

      mockedFs.pathExists.mockResolvedValue(true);
      mockedFs.readJson.mockResolvedValue(invalidConfig);

      const result = await ConfigValidateCommand.execute({ detailed: true });

      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('warnings');
      expect(result).toHaveProperty('schema');
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should validate nested configuration properties', async () => {
      const configWithNestedErrors = {
        version: '1.0',
        fleet: {
          topology: 'hierarchical',
          maxAgents: 10,
          agents: [
            {
              type: 'test-generator',
              count: -1 // Invalid
            }
          ]
        }
      };

      mockedFs.pathExists.mockResolvedValue(true);
      mockedFs.readJson.mockResolvedValue(configWithNestedErrors);

      const result = await ConfigValidateCommand.execute({});

      expect(result.valid).toBe(false);
    });
  });

  describe('config set', () => {
    it('should set top-level configuration value', async () => {
      const existingConfig = {
        version: '1.0',
        fleet: { topology: 'hierarchical', maxAgents: 10 }
      };

      mockedFs.pathExists.mockResolvedValue(true);
      mockedFs.readJson.mockResolvedValue(existingConfig);

      await ConfigSetCommand.execute({ key: 'fleet.topology', value: 'mesh' });

      expect(mockedFs.writeJson).toHaveBeenCalledWith(
        '.agentic-qe/config/aqe.config.json',
        expect.objectContaining({
          fleet: expect.objectContaining({ topology: 'mesh' })
        }),
        { spaces: 2 }
      );
    });

    it('should set nested configuration value', async () => {
      const existingConfig = {
        version: '1.0',
        fleet: { topology: 'hierarchical', maxAgents: 10 }
      };

      mockedFs.pathExists.mockResolvedValue(true);
      mockedFs.readJson.mockResolvedValue(existingConfig);

      await ConfigSetCommand.execute({
        key: 'fleet.maxAgents',
        value: '20'
      });

      expect(mockedFs.writeJson).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          fleet: expect.objectContaining({ maxAgents: 20 })
        }),
        expect.any(Object)
      );
    });

    it('should parse numeric values correctly', async () => {
      const existingConfig = {
        version: '1.0',
        fleet: { topology: 'hierarchical', maxAgents: 10 }
      };

      mockedFs.pathExists.mockResolvedValue(true);
      mockedFs.readJson.mockResolvedValue(existingConfig);

      await ConfigSetCommand.execute({
        key: 'fleet.maxAgents',
        value: '30'
      });

      const writtenConfig = mockedFs.writeJson.mock.calls[0][1] as any;
      expect(typeof writtenConfig.fleet.maxAgents).toBe('number');
      expect(writtenConfig.fleet.maxAgents).toBe(30);
    });

    it('should parse boolean values correctly', async () => {
      const existingConfig = {
        version: '1.0',
        fleet: { topology: 'hierarchical', maxAgents: 10 }
      };

      mockedFs.pathExists.mockResolvedValue(true);
      mockedFs.readJson.mockResolvedValue(existingConfig);

      await ConfigSetCommand.execute({
        key: 'features.monitoring',
        value: 'true'
      });

      const writtenConfig = mockedFs.writeJson.mock.calls[0][1] as any;
      expect(typeof writtenConfig.features.monitoring).toBe('boolean');
      expect(writtenConfig.features.monitoring).toBe(true);
    });

    it('should validate value against schema after setting', async () => {
      const existingConfig = {
        version: '1.0',
        fleet: { topology: 'hierarchical', maxAgents: 10 }
      };

      mockedFs.pathExists.mockResolvedValue(true);
      mockedFs.readJson.mockResolvedValue(existingConfig);

      await expect(
        ConfigSetCommand.execute({
          key: 'fleet.topology',
          value: 'invalid-topology'
        })
      ).rejects.toThrow('validation');
    });

    it('should create nested objects if they do not exist', async () => {
      const existingConfig = {
        version: '1.0',
        fleet: { topology: 'hierarchical', maxAgents: 10 }
      };

      mockedFs.pathExists.mockResolvedValue(true);
      mockedFs.readJson.mockResolvedValue(existingConfig);

      await ConfigSetCommand.execute({
        key: 'features.security.enabled',
        value: 'true'
      });

      const writtenConfig = mockedFs.writeJson.mock.calls[0][1] as any;
      expect(writtenConfig.features).toBeDefined();
      expect(writtenConfig.features.security).toBeDefined();
      expect(writtenConfig.features.security.enabled).toBe(true);
    });

    it('should reject setting invalid keys', async () => {
      mockedFs.pathExists.mockResolvedValue(true);
      mockedFs.readJson.mockResolvedValue({ version: '1.0', fleet: {} });

      await expect(
        ConfigSetCommand.execute({ key: '', value: 'test' })
      ).rejects.toThrow('Invalid key');
    });

    // Security Tests - Prototype Pollution Protection (Alert #25)
    describe('prototype pollution protection', () => {
      it('should block __proto__ key in path', async () => {
        mockedFs.pathExists.mockResolvedValue(true);
        mockedFs.readJson.mockResolvedValue({ version: '1.0', fleet: {} });

        await expect(
          ConfigSetCommand.execute({ key: '__proto__.isAdmin', value: 'true' })
        ).rejects.toThrow('Prototype pollution attempt detected');
      });

      it('should block constructor key in path', async () => {
        mockedFs.pathExists.mockResolvedValue(true);
        mockedFs.readJson.mockResolvedValue({ version: '1.0', fleet: {} });

        await expect(
          ConfigSetCommand.execute({ key: 'constructor.prototype.isAdmin', value: 'true' })
        ).rejects.toThrow('Prototype pollution attempt detected');
      });

      it('should block prototype key in path', async () => {
        mockedFs.pathExists.mockResolvedValue(true);
        mockedFs.readJson.mockResolvedValue({ version: '1.0', fleet: {} });

        await expect(
          ConfigSetCommand.execute({ key: 'fleet.prototype.isAdmin', value: 'true' })
        ).rejects.toThrow('Prototype pollution attempt detected');
      });

      it('should block __proto__ in nested path', async () => {
        mockedFs.pathExists.mockResolvedValue(true);
        mockedFs.readJson.mockResolvedValue({ version: '1.0', fleet: {} });

        await expect(
          ConfigSetCommand.execute({ key: 'fleet.__proto__.isAdmin', value: 'true' })
        ).rejects.toThrow('Prototype pollution attempt detected');
      });

      it('should block multiple dangerous keys in path', async () => {
        mockedFs.pathExists.mockResolvedValue(true);
        mockedFs.readJson.mockResolvedValue({ version: '1.0', fleet: {} });

        await expect(
          ConfigSetCommand.execute({ key: 'constructor.__proto__.isAdmin', value: 'true' })
        ).rejects.toThrow('Prototype pollution attempt detected');
      });

      it('should allow safe nested property names', async () => {
        const existingConfig = {
          version: '1.0',
          fleet: { topology: 'hierarchical', maxAgents: 10 }
        };

        mockedFs.pathExists.mockResolvedValue(true);
        mockedFs.readJson.mockResolvedValue(existingConfig);

        // These should all work fine
        await ConfigSetCommand.execute({ key: 'fleet.protocol', value: 'http' });
        const writtenConfig1 = mockedFs.writeJson.mock.calls[0][1] as any;
        expect(writtenConfig1.fleet.protocol).toBe('http');

        mockedFs.readJson.mockResolvedValue(writtenConfig1);
        await ConfigSetCommand.execute({ key: 'features.constructor_mode', value: 'safe' });
        const writtenConfig2 = mockedFs.writeJson.mock.calls[1][1] as any;
        expect(writtenConfig2.features.constructor_mode).toBe('safe');
      });

      it('should verify Object.prototype is not polluted', async () => {
        const existingConfig = {
          version: '1.0',
          fleet: { topology: 'hierarchical', maxAgents: 10 }
        };

        mockedFs.pathExists.mockResolvedValue(true);
        mockedFs.readJson.mockResolvedValue(existingConfig);

        // Attempt prototype pollution (should fail)
        await expect(
          ConfigSetCommand.execute({ key: '__proto__.polluted', value: 'true' })
        ).rejects.toThrow('Prototype pollution attempt detected');

        // Verify Object.prototype was not modified
        expect((Object.prototype as any).polluted).toBeUndefined();
      });
    });
  });

  describe('config get', () => {
    it('should get top-level configuration value', async () => {
      const config = {
        version: '1.0',
        fleet: { topology: 'hierarchical', maxAgents: 10 }
      };

      mockedFs.pathExists.mockResolvedValue(true);
      mockedFs.readJson.mockResolvedValue(config);

      const result = await ConfigGetCommand.execute({ key: 'version' });

      expect(result.value).toBe('1.0');
    });

    it('should get nested configuration value', async () => {
      const config = {
        version: '1.0',
        fleet: { topology: 'hierarchical', maxAgents: 10 }
      };

      mockedFs.pathExists.mockResolvedValue(true);
      mockedFs.readJson.mockResolvedValue(config);

      const result = await ConfigGetCommand.execute({ key: 'fleet.maxAgents' });

      expect(result.value).toBe(10);
    });

    it('should return entire config when no key specified', async () => {
      const config = {
        version: '1.0',
        fleet: { topology: 'hierarchical', maxAgents: 10 }
      };

      mockedFs.pathExists.mockResolvedValue(true);
      mockedFs.readJson.mockResolvedValue(config);

      const result = await ConfigGetCommand.execute({});

      expect(result.value).toEqual(config);
    });

    it('should return undefined for non-existent key', async () => {
      const config = {
        version: '1.0',
        fleet: { topology: 'hierarchical', maxAgents: 10 }
      };

      mockedFs.pathExists.mockResolvedValue(true);
      mockedFs.readJson.mockResolvedValue(config);

      const result = await ConfigGetCommand.execute({ key: 'non.existent.key' });

      expect(result.value).toBeUndefined();
    });

    it('should format output as JSON when specified', async () => {
      const config = {
        version: '1.0',
        fleet: { topology: 'hierarchical', maxAgents: 10 }
      };

      mockedFs.pathExists.mockResolvedValue(true);
      mockedFs.readJson.mockResolvedValue(config);

      const result = await ConfigGetCommand.execute({
        key: 'fleet',
        format: 'json'
      });

      expect(result.formatted).toBeDefined();
      expect(() => JSON.parse(result.formatted)).not.toThrow();
    });

    it('should format output as YAML when specified', async () => {
      const config = {
        version: '1.0',
        fleet: { topology: 'hierarchical', maxAgents: 10 }
      };

      mockedFs.pathExists.mockResolvedValue(true);
      mockedFs.readJson.mockResolvedValue(config);

      const result = await ConfigGetCommand.execute({
        key: 'fleet',
        format: 'yaml'
      });

      expect(result.formatted).toBeDefined();
      expect(result.formatted).toContain('topology:');
    });
  });

  describe('config export', () => {
    it('should export configuration to JSON file', async () => {
      const config = {
        version: '1.0',
        fleet: { topology: 'hierarchical', maxAgents: 10 }
      };

      mockedFs.pathExists.mockImplementation((path: any) => {
        if (path === '.agentic-qe/config/aqe.config.json') return Promise.resolve(true);
        return Promise.resolve(false); // Output file doesn't exist yet
      });
      mockedFs.readJson.mockResolvedValue(config);

      await ConfigExportCommand.execute({
        output: './exported-config.json',
        format: 'json'
      });

      expect(mockedFs.writeJson).toHaveBeenCalledWith(
        './exported-config.json',
        config,
        { spaces: 2 }
      );
    });

    it('should export configuration to YAML file', async () => {
      const config = {
        version: '1.0',
        fleet: { topology: 'hierarchical', maxAgents: 10 }
      };

      mockedFs.pathExists.mockImplementation((path: any) => {
        if (path === '.agentic-qe/config/aqe.config.json') return Promise.resolve(true);
        return Promise.resolve(false); // Output file doesn't exist yet
      });
      mockedFs.readJson.mockResolvedValue(config);

      await ConfigExportCommand.execute({
        output: './exported-config.yaml',
        format: 'yaml'
      });

      expect(mockedFs.writeFile).toHaveBeenCalledWith(
        './exported-config.yaml',
        expect.stringContaining('version:'),
        'utf-8'
      );
    });

    it('should use default filename if not specified', async () => {
      const config = {
        version: '1.0',
        fleet: { topology: 'hierarchical', maxAgents: 10 }
      };

      mockedFs.pathExists.mockImplementation((path: any) => {
        if (path === '.agentic-qe/config/aqe.config.json') return Promise.resolve(true);
        return Promise.resolve(false); // Generated filename doesn't exist
      });
      mockedFs.readJson.mockResolvedValue(config);

      await ConfigExportCommand.execute({ format: 'json' });

      expect(mockedFs.writeJson).toHaveBeenCalledWith(
        expect.stringContaining('aqe-config-'),
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should not overwrite existing file without force flag', async () => {
      const config = {
        version: '1.0',
        fleet: { topology: 'hierarchical', maxAgents: 10 }
      };

      mockedFs.pathExists.mockResolvedValue(true);
      mockedFs.readJson.mockResolvedValue(config);

      await expect(
        ConfigExportCommand.execute({
          output: './existing-file.json',
          format: 'json'
        })
      ).rejects.toThrow('File already exists');
    });

    it('should overwrite existing file with force flag', async () => {
      const config = {
        version: '1.0',
        fleet: { topology: 'hierarchical', maxAgents: 10 }
      };

      mockedFs.pathExists.mockResolvedValue(true);
      mockedFs.readJson.mockResolvedValue(config);

      await ConfigExportCommand.execute({
        output: './existing-file.json',
        format: 'json',
        force: true
      });

      expect(mockedFs.writeJson).toHaveBeenCalled();
    });

    it('should include metadata in export when requested', async () => {
      const config = {
        version: '1.0',
        fleet: { topology: 'hierarchical', maxAgents: 10 }
      };

      mockedFs.pathExists.mockImplementation((path: any) => {
        if (path === '.agentic-qe/config/aqe.config.json') return Promise.resolve(true);
        return Promise.resolve(false); // Output file doesn't exist yet
      });
      mockedFs.readJson.mockResolvedValue(config);

      await ConfigExportCommand.execute({
        output: './config-with-meta.json',
        format: 'json',
        includeMetadata: true
      });

      const exportedData = mockedFs.writeJson.mock.calls[0][1] as any;
      expect(exportedData.metadata).toBeDefined();
      expect(exportedData.metadata.exportedAt).toBeDefined();
      expect(exportedData.config).toEqual(config);
    });
  });

  describe('config import', () => {
    it('should import configuration from JSON file', async () => {
      const importedConfig = {
        version: '1.0',
        fleet: { topology: 'mesh', maxAgents: 20 }
      };

      mockedFs.pathExists.mockImplementation((path: any) => {
        if (path === './import-config.json') return Promise.resolve(true);
        return Promise.resolve(false); // Target config doesn't exist
      });
      mockedFs.readJson.mockResolvedValue(importedConfig);

      await ConfigImportCommand.execute({ input: './import-config.json' });

      expect(mockedFs.writeJson).toHaveBeenCalledWith(
        '.agentic-qe/config/aqe.config.json',
        importedConfig,
        { spaces: 2 }
      );
    });

    it('should import configuration from YAML file', async () => {
      const yamlContent = `version: '1.0'
fleet:
  topology: ring
  maxAgents: 15`;

      mockedFs.pathExists.mockImplementation((path: any) => {
        if (path === './import-config.yaml') return Promise.resolve(true);
        return Promise.resolve(false); // Target config doesn't exist
      });
      mockedFs.readFile.mockResolvedValue(yamlContent);

      await ConfigImportCommand.execute({ input: './import-config.yaml' });

      expect(mockedFs.writeJson).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          version: '1.0',
          fleet: expect.objectContaining({ topology: 'ring' })
        }),
        expect.any(Object)
      );
    });

    it('should validate imported configuration', async () => {
      const invalidConfig = {
        version: '1.0',
        fleet: { topology: 'invalid', maxAgents: -1 }
      };

      mockedFs.pathExists.mockResolvedValue(true);
      mockedFs.readJson.mockResolvedValue(invalidConfig);

      await expect(
        ConfigImportCommand.execute({ input: './invalid-config.json' })
      ).rejects.toThrow('validation');
    });

    it('should not overwrite existing config without force flag', async () => {
      const importedConfig = {
        version: '1.0',
        fleet: { topology: 'mesh', maxAgents: 20 }
      };

      mockedFs.pathExists.mockImplementation((path: any) => {
        if (path === '.agentic-qe/config/aqe.config.json') return Promise.resolve(true);
        return Promise.resolve(true);
      });
      mockedFs.readJson.mockResolvedValue(importedConfig);

      await expect(
        ConfigImportCommand.execute({ input: './import-config.json' })
      ).rejects.toThrow('Configuration already exists');
    });

    it('should merge with existing config when merge flag is set', async () => {
      const existingConfig = {
        version: '1.0',
        fleet: { topology: 'hierarchical', maxAgents: 10 },
        features: { monitoring: true }
      };

      const importedConfig = {
        version: '1.0',
        fleet: { topology: 'hierarchical', maxAgents: 20 },
        features: { security: true }
      };

      mockedFs.pathExists.mockResolvedValue(true);
      mockedFs.readJson.mockImplementation((path: any) => {
        if (path === '.agentic-qe/config/aqe.config.json') {
          return Promise.resolve(existingConfig);
        }
        return Promise.resolve(importedConfig);
      });

      await ConfigImportCommand.execute({
        input: './import-config.json',
        merge: true
      });

      const mergedConfig = mockedFs.writeJson.mock.calls[0][1] as any;
      expect(mergedConfig.fleet.maxAgents).toBe(20);
      expect(mergedConfig.features.monitoring).toBe(true);
      expect(mergedConfig.features.security).toBe(true);
    });

    it('should handle missing import file gracefully', async () => {
      mockedFs.pathExists.mockResolvedValue(false);

      await expect(
        ConfigImportCommand.execute({ input: './missing-file.json' })
      ).rejects.toThrow('File not found');
    });

    it('should parse file format automatically from extension', async () => {
      const jsonConfig = {
        version: '1.0',
        fleet: {
          topology: 'hierarchical',
          maxAgents: 10
        }
      };

      mockedFs.pathExists.mockImplementation((path: any) => {
        if (path === './config.json') return Promise.resolve(true);
        return Promise.resolve(false);
      });
      mockedFs.readJson.mockResolvedValue(jsonConfig);

      await ConfigImportCommand.execute({ input: './config.json' });

      expect(mockedFs.readJson).toHaveBeenCalled();
    });
  });

  describe('Integration Tests', () => {
    it('should init, set, get, and validate config in sequence', async () => {
      // Init
      await ConfigInitCommand.execute({ template: 'default' });
      const initConfig = mockedFs.writeJson.mock.calls[0][1];

      // Set
      mockedFs.readJson.mockResolvedValue(initConfig);
      mockedFs.pathExists.mockResolvedValue(true);
      await ConfigSetCommand.execute({
        key: 'fleet.maxAgents',
        value: '25'
      });

      // Get
      const updatedConfig = mockedFs.writeJson.mock.calls[1][1];
      mockedFs.readJson.mockResolvedValue(updatedConfig);
      const getResult = await ConfigGetCommand.execute({
        key: 'fleet.maxAgents'
      });

      expect(getResult.value).toBe(25);

      // Validate
      const validateResult = await ConfigValidateCommand.execute({});
      expect(validateResult.valid).toBe(true);
    });

    it('should export and import config maintaining integrity', async () => {
      const originalConfig = {
        version: '1.0',
        fleet: { topology: 'mesh', maxAgents: 30 }
      };

      // Export
      mockedFs.pathExists.mockImplementation((path: any) => {
        if (path === '.agentic-qe/config/aqe.config.json') return Promise.resolve(true);
        return Promise.resolve(false);
      });
      mockedFs.readJson.mockResolvedValue(originalConfig);
      await ConfigExportCommand.execute({
        output: './test-export.json',
        format: 'json'
      });

      const exportedConfig = mockedFs.writeJson.mock.calls[0][1];

      // Import - now with proper mocking
      mockedFs.readJson.mockResolvedValue(exportedConfig);
      mockedFs.pathExists.mockImplementation((path: any) => {
        if (path === './test-export.json') return Promise.resolve(true);
        return Promise.resolve(false);
      });

      await ConfigImportCommand.execute({ input: './test-export.json' });

      const importedConfig = mockedFs.writeJson.mock.calls[1][1];
      expect(importedConfig).toEqual(originalConfig);
    });
  });
});
