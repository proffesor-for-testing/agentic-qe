/**
 * Tests for ConfigLoader
 *
 * Validates YAML loading, environment variable interpolation,
 * schema validation, and configuration merging.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ConfigLoader, loadConfig, validateConfig } from '../../src/config/ConfigLoader';
import { MultiProviderConfig, DeploymentMode } from '../../src/config/ProviderConfig';

describe('ConfigLoader', () => {
  let tempDir: string;
  let loader: ConfigLoader;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Create temporary directory for test configs
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-config-test-'));
    loader = new ConfigLoader(tempDir);

    // Save original environment
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // Restore environment
    process.env = originalEnv;

    // Cleanup temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('loadFromYaml', () => {
    it('should load valid YAML configuration', async () => {
      const configContent = `
mode: local_first

providers:
  - type: ollama
    enabled: true
    priority: 10
    defaultModel: llama3.2:3b
    baseUrl: http://localhost:11434

  - type: groq
    enabled: true
    priority: 20
    apiKey: test-key
    defaultModel: llama-3.3-70b-versatile
`;

      const configPath = path.join(tempDir, 'test-config.yaml');
      fs.writeFileSync(configPath, configContent, 'utf-8');

      const config = await loader.load({ configPath, validate: false });

      expect(config.mode).toBe('local_first');
      expect(config.providers).toHaveLength(2);
      expect(config.providers[0].type).toBe('ollama');
      expect(config.providers[1].type).toBe('groq');
    });

    it('should throw error for non-existent file', async () => {
      const configPath = path.join(tempDir, 'non-existent.yaml');

      await expect(
        loader.load({ configPath, validate: false })
      ).rejects.toThrow('Configuration file not found');
    });

    it('should load from default locations', async () => {
      const aqeDir = path.join(tempDir, '.aqe');
      fs.mkdirSync(aqeDir, { recursive: true });

      const configContent = `
mode: hybrid
providers:
  - type: groq
    enabled: true
    priority: 10
    defaultModel: llama-3.3-70b-versatile
`;

      const configPath = path.join(aqeDir, 'providers.yaml');
      fs.writeFileSync(configPath, configContent, 'utf-8');

      const config = await loader.load({ validate: false });

      expect(config.mode).toBe('hybrid');
    });
  });

  describe('loadFromEnvironment', () => {
    it('should load configuration from environment variables', async () => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test-123';
      process.env.GROQ_API_KEY = 'gsk-test-456';
      process.env.LLM_MODE = 'hosted';

      const config = await loader.load({
        loadFromEnv: true,
        mergeDefaults: false,
        validate: false,
      });

      expect(config.providers?.length).toBeGreaterThan(0);

      const claudeProvider = config.providers?.find(p => p.type === 'claude');
      expect(claudeProvider).toBeDefined();
      expect(claudeProvider?.apiKey).toBe('sk-ant-test-123');

      const groqProvider = config.providers?.find(p => p.type === 'groq');
      expect(groqProvider).toBeDefined();
      expect(groqProvider?.apiKey).toBe('gsk-test-456');
    });

    it('should auto-detect providers based on API keys', async () => {
      process.env.OPENROUTER_API_KEY = 'sk-or-test-789';

      const config = await loader.load({
        loadFromEnv: true,
        mergeDefaults: false,
        validate: false,
      });

      const openRouterProvider = config.providers?.find(p => p.type === 'openrouter');
      expect(openRouterProvider).toBeDefined();
      expect(openRouterProvider?.enabled).toBe(true);
    });
  });

  describe('validate', () => {
    it('should validate valid configuration', async () => {
      const validConfig: MultiProviderConfig = {
        mode: 'hosted',
        providers: [
          {
            type: 'groq',
            enabled: true,
            priority: 10,
            defaultModel: 'llama-3.3-70b-versatile',
            apiKey: 'test-key',
          },
        ],
      };

      const result = loader.validate(validConfig);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject missing mode', () => {
      const invalidConfig: any = {
        providers: [
          {
            type: 'groq',
            enabled: true,
            priority: 10,
            defaultModel: 'llama-3.3-70b-versatile',
          },
        ],
      };

      const result = loader.validate(invalidConfig);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Deployment mode is required');
    });

    it('should reject empty providers', () => {
      const invalidConfig: MultiProviderConfig = {
        mode: 'hosted',
        providers: [],
      };

      const result = loader.validate(invalidConfig);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('At least one provider must be configured');
    });
  });
});
