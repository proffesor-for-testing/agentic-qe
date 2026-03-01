/**
 * CLI Configuration Tests
 * ADR-041: CLI Configuration for Enhanced Developer Experience
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  QECLIConfig,
  WizardConfig,
  ProgressConfig,
  CompletionConfig,
  StreamingConfig,
  DEFAULT_CLI_CONFIG,
  getConfigDir,
  getConfigPath,
  loadCLIConfig,
  saveCLIConfig,
  getCLIConfig,
  resetCLIConfig,
  updateCLIConfig,
  validateConfig,
  invalidateCache,
  isInteractive,
  shouldUseColors,
  getEffectiveWizardTheme,
  getEffectiveProgressStyle,
} from '../../../src/cli/config/index.js';

// Mock fs and os modules
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    unlinkSync: vi.fn(),
    mkdirSync: vi.fn(),
    rmSync: vi.fn(),
  };
});

vi.mock('os', async () => {
  const actual = await vi.importActual<typeof import('os')>('os');
  return {
    ...actual,
    homedir: vi.fn(() => '/mock/home'),
  };
});

describe('CLI Configuration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('DEFAULT_CLI_CONFIG', () => {
    it('should have correct wizard defaults', () => {
      expect(DEFAULT_CLI_CONFIG.wizards).toEqual({
        enabled: true,
        themes: ['default', 'minimal', 'detailed'],
        defaultTheme: 'default',
      });
    });

    it('should have correct progress defaults', () => {
      expect(DEFAULT_CLI_CONFIG.progress).toEqual({
        style: 'multi-bar',
        updateIntervalMs: 100,
        showETA: true,
        colors: true,
      });
    });

    it('should have correct completion defaults', () => {
      expect(DEFAULT_CLI_CONFIG.completion).toEqual({
        maxSuggestions: 10,
        historyWeight: 0.3,
        contextWeight: 0.7,
        fuzzyMatch: true,
      });
    });

    it('should have correct streaming defaults', () => {
      expect(DEFAULT_CLI_CONFIG.streaming).toEqual({
        enabled: true,
        bufferSize: 100,
        updateIntervalMs: 50,
      });
    });

    it('should have all required sections', () => {
      expect(DEFAULT_CLI_CONFIG).toHaveProperty('wizards');
      expect(DEFAULT_CLI_CONFIG).toHaveProperty('progress');
      expect(DEFAULT_CLI_CONFIG).toHaveProperty('completion');
      expect(DEFAULT_CLI_CONFIG).toHaveProperty('streaming');
    });
  });

  describe('getConfigDir and getConfigPath', () => {
    it('should return path in home directory', () => {
      const configDir = getConfigDir();
      expect(configDir).toBe('/mock/home/.aqe');
    });

    it('should return correct config file path', () => {
      const configPath = getConfigPath();
      expect(configPath).toBe('/mock/home/.aqe/cli-config.json');
    });
  });

  describe('validateConfig', () => {
    it('should validate correct config', () => {
      const result = validateConfig(DEFAULT_CLI_CONFIG);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject non-object config', () => {
      const result = validateConfig(null);
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toBe('config must be an object');
    });

    it('should reject invalid wizard.enabled type', () => {
      const config = { wizards: { enabled: 'yes' } };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        path: 'wizards.enabled',
        message: 'must be a boolean',
      });
    });

    it('should reject invalid wizard theme', () => {
      const config = { wizards: { themes: ['invalid-theme'] } };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        path: 'wizards.themes',
        message: 'invalid theme: invalid-theme',
      });
    });

    it('should reject invalid defaultTheme', () => {
      const config = { wizards: { defaultTheme: 'fancy' } };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        path: 'wizards.defaultTheme',
        message: 'invalid theme: fancy',
      });
    });

    it('should reject invalid progress style', () => {
      const config = { progress: { style: 'rainbow' } };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        path: 'progress.style',
        message: 'invalid style: rainbow',
      });
    });

    it('should reject updateIntervalMs below minimum', () => {
      const config = { progress: { updateIntervalMs: 5 } };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        path: 'progress.updateIntervalMs',
        message: 'must be a number >= 10',
      });
    });

    it('should reject non-boolean showETA', () => {
      const config = { progress: { showETA: 'yes' } };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        path: 'progress.showETA',
        message: 'must be a boolean',
      });
    });

    it('should reject completion maxSuggestions below 1', () => {
      const config = { completion: { maxSuggestions: 0 } };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        path: 'completion.maxSuggestions',
        message: 'must be a number >= 1',
      });
    });

    it('should reject historyWeight outside 0-1 range', () => {
      const config = { completion: { historyWeight: 1.5 } };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        path: 'completion.historyWeight',
        message: 'must be a number between 0 and 1',
      });
    });

    it('should reject negative contextWeight', () => {
      const config = { completion: { contextWeight: -0.1 } };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        path: 'completion.contextWeight',
        message: 'must be a number between 0 and 1',
      });
    });

    it('should reject non-boolean fuzzyMatch', () => {
      const config = { completion: { fuzzyMatch: 'true' } };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        path: 'completion.fuzzyMatch',
        message: 'must be a boolean',
      });
    });

    it('should reject non-boolean streaming.enabled', () => {
      const config = { streaming: { enabled: 1 } };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        path: 'streaming.enabled',
        message: 'must be a boolean',
      });
    });

    it('should reject bufferSize below 1', () => {
      const config = { streaming: { bufferSize: 0 } };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        path: 'streaming.bufferSize',
        message: 'must be a number >= 1',
      });
    });

    it('should reject streaming updateIntervalMs below minimum', () => {
      const config = { streaming: { updateIntervalMs: 5 } };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        path: 'streaming.updateIntervalMs',
        message: 'must be a number >= 10',
      });
    });

    it('should reject non-object sections', () => {
      const config = { wizards: 'invalid' };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        path: 'wizards',
        message: 'must be an object',
      });
    });

    it('should allow partial config with valid values', () => {
      const config = {
        wizards: { enabled: false },
        progress: { showETA: false },
      };
      const result = validateConfig(config);
      expect(result.valid).toBe(true);
    });

    it('should allow empty config object', () => {
      const result = validateConfig({});
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('loadCLIConfig', () => {
    it('should return defaults when config file does not exist', () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const config = loadCLIConfig();
      expect(config).toEqual(DEFAULT_CLI_CONFIG);
    });

    it('should load and merge config from file', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          wizards: { enabled: false },
          progress: { showETA: false },
        })
      );

      const config = loadCLIConfig();

      expect(config.wizards.enabled).toBe(false);
      expect(config.wizards.themes).toEqual(['default', 'minimal', 'detailed']); // Default
      expect(config.progress.showETA).toBe(false);
      expect(config.progress.style).toBe('multi-bar'); // Default
    });

    it('should return defaults on JSON parse error', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('invalid json');

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const config = loadCLIConfig();

      expect(config).toEqual(DEFAULT_CLI_CONFIG);
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should return defaults on validation error', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          wizards: { enabled: 'invalid' },
        })
      );

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const config = loadCLIConfig();

      expect(config).toEqual(DEFAULT_CLI_CONFIG);
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should handle read errors gracefully', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const config = loadCLIConfig();

      expect(config).toEqual(DEFAULT_CLI_CONFIG);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Permission denied'));
    });
  });

  describe('saveCLIConfig', () => {
    it('should create directory if it does not exist', () => {
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(writeFileSync).mockImplementation(() => {});
      vi.mocked(mkdirSync).mockImplementation(() => undefined);

      saveCLIConfig(DEFAULT_CLI_CONFIG);

      expect(mkdirSync).toHaveBeenCalledWith('/mock/home/.aqe', { recursive: true });
    });

    it('should write config as formatted JSON', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(writeFileSync).mockImplementation(() => {});

      saveCLIConfig(DEFAULT_CLI_CONFIG);

      expect(writeFileSync).toHaveBeenCalledWith(
        '/mock/home/.aqe/cli-config.json',
        JSON.stringify(DEFAULT_CLI_CONFIG, null, 2),
        'utf-8'
      );
    });

    it('should throw on invalid config', () => {
      const invalidConfig = {
        ...DEFAULT_CLI_CONFIG,
        wizards: { ...DEFAULT_CLI_CONFIG.wizards, enabled: 'invalid' as unknown as boolean },
      };

      expect(() => saveCLIConfig(invalidConfig)).toThrow('Invalid configuration');
    });

    it('should throw on write error', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(writeFileSync).mockImplementation(() => {
        throw new Error('Disk full');
      });

      expect(() => saveCLIConfig(DEFAULT_CLI_CONFIG)).toThrow('Failed to save CLI config: Disk full');
    });

    it('should invalidate cache after save', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(writeFileSync).mockImplementation(() => {});

      // Prime the cache
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(DEFAULT_CLI_CONFIG));
      getCLIConfig();

      // Save should invalidate
      saveCLIConfig(DEFAULT_CLI_CONFIG);

      // Next getCLIConfig should reload
      getCLIConfig();
      expect(readFileSync).toHaveBeenCalledTimes(2);
    });
  });

  describe('getCLIConfig', () => {
    it('should cache config on first call', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(DEFAULT_CLI_CONFIG));

      getCLIConfig();
      getCLIConfig();
      getCLIConfig();

      expect(readFileSync).toHaveBeenCalledTimes(1);
    });

    it('should return cached config on subsequent calls', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          wizards: { enabled: false },
        })
      );

      const config1 = getCLIConfig();
      const config2 = getCLIConfig();

      expect(config1).toBe(config2);
      expect(config1.wizards.enabled).toBe(false);
    });

    it('should reload after cache invalidation', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(DEFAULT_CLI_CONFIG));

      getCLIConfig();
      invalidateCache();
      getCLIConfig();

      expect(readFileSync).toHaveBeenCalledTimes(2);
    });
  });

  describe('resetCLIConfig', () => {
    it('should delete config file if it exists', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(unlinkSync).mockImplementation(() => {});

      resetCLIConfig();

      expect(unlinkSync).toHaveBeenCalledWith('/mock/home/.aqe/cli-config.json');
    });

    it('should not throw if file does not exist', () => {
      vi.mocked(existsSync).mockReturnValue(false);

      expect(() => resetCLIConfig()).not.toThrow();
    });

    it('should throw on delete error', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(unlinkSync).mockImplementation(() => {
        throw new Error('Permission denied');
      });

      expect(() => resetCLIConfig()).toThrow('Failed to reset CLI config: Permission denied');
    });

    it('should invalidate cache', () => {
      vi.mocked(existsSync).mockReturnValue(false);

      // Prime the cache
      getCLIConfig();

      resetCLIConfig();

      // After reset, should load from file again
      getCLIConfig();
      // existsSync called twice now (once for reset check, once for load)
      expect(existsSync).toHaveBeenCalledTimes(3); // Prime + reset + reload
    });
  });

  describe('updateCLIConfig', () => {
    beforeEach(() => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(DEFAULT_CLI_CONFIG));
      vi.mocked(writeFileSync).mockImplementation(() => {});
    });

    it('should merge updates with current config', () => {
      const updated = updateCLIConfig({
        wizards: { enabled: false, themes: ['minimal'], defaultTheme: 'minimal' },
      });

      expect(updated.wizards.enabled).toBe(false);
      expect(updated.wizards.themes).toEqual(['minimal']);
      expect(updated.progress).toEqual(DEFAULT_CLI_CONFIG.progress);
    });

    it('should save updated config', () => {
      updateCLIConfig({
        progress: { style: 'spinner', updateIntervalMs: 100, showETA: true, colors: true },
      });

      expect(writeFileSync).toHaveBeenCalled();
    });

    it('should return the updated config', () => {
      const result = updateCLIConfig({
        streaming: { enabled: false, bufferSize: 100, updateIntervalMs: 50 },
      });

      expect(result.streaming.enabled).toBe(false);
    });
  });

  describe('isInteractive', () => {
    it('should return true when stdout is TTY', () => {
      const originalIsTTY = process.stdout.isTTY;
      Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });

      expect(isInteractive()).toBe(true);

      Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTTY, configurable: true });
    });

    it('should return false when stdout is not TTY', () => {
      const originalIsTTY = process.stdout.isTTY;
      Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });

      expect(isInteractive()).toBe(false);

      Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTTY, configurable: true });
    });

    it('should return false when stdout.isTTY is undefined', () => {
      const originalIsTTY = process.stdout.isTTY;
      Object.defineProperty(process.stdout, 'isTTY', { value: undefined, configurable: true });

      expect(isInteractive()).toBe(false);

      Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTTY, configurable: true });
    });
  });

  describe('shouldUseColors', () => {
    beforeEach(() => {
      vi.mocked(existsSync).mockReturnValue(false);
      delete process.env.NO_COLOR;
      delete process.env.FORCE_COLOR;
    });

    afterEach(() => {
      delete process.env.NO_COLOR;
      delete process.env.FORCE_COLOR;
    });

    it('should return false when NO_COLOR is set', () => {
      process.env.NO_COLOR = '1';
      expect(shouldUseColors()).toBe(false);
    });

    it('should return true when FORCE_COLOR is set', () => {
      process.env.FORCE_COLOR = '1';
      expect(shouldUseColors()).toBe(true);
    });

    it('should respect config and TTY when no env vars', () => {
      const originalIsTTY = process.stdout.isTTY;
      Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });

      // Default config has colors: true
      expect(shouldUseColors()).toBe(true);

      Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTTY, configurable: true });
    });

    it('should return false when not TTY even with colors enabled', () => {
      const originalIsTTY = process.stdout.isTTY;
      Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });

      expect(shouldUseColors()).toBe(false);

      Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTTY, configurable: true });
    });
  });

  describe('getEffectiveWizardTheme', () => {
    beforeEach(() => {
      vi.mocked(existsSync).mockReturnValue(false);
    });

    it('should return minimal when wizards disabled', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          wizards: { enabled: false, themes: ['default'], defaultTheme: 'default' },
        })
      );
      invalidateCache();

      expect(getEffectiveWizardTheme()).toBe('minimal');
    });

    it('should return minimal when not interactive', () => {
      const originalIsTTY = process.stdout.isTTY;
      Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });

      expect(getEffectiveWizardTheme()).toBe('minimal');

      Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTTY, configurable: true });
    });

    it('should return default theme when interactive', () => {
      const originalIsTTY = process.stdout.isTTY;
      Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });

      expect(getEffectiveWizardTheme()).toBe('default');

      Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTTY, configurable: true });
    });

    it('should return configured theme when interactive', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          wizards: { enabled: true, themes: ['detailed'], defaultTheme: 'detailed' },
        })
      );
      invalidateCache();

      const originalIsTTY = process.stdout.isTTY;
      Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });

      expect(getEffectiveWizardTheme()).toBe('detailed');

      Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTTY, configurable: true });
    });
  });

  describe('getEffectiveProgressStyle', () => {
    beforeEach(() => {
      vi.mocked(existsSync).mockReturnValue(false);
    });

    it('should return spinner when not interactive', () => {
      const originalIsTTY = process.stdout.isTTY;
      Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });

      expect(getEffectiveProgressStyle()).toBe('spinner');

      Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTTY, configurable: true });
    });

    it('should return configured style when interactive', () => {
      const originalIsTTY = process.stdout.isTTY;
      Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });

      expect(getEffectiveProgressStyle()).toBe('multi-bar');

      Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTTY, configurable: true });
    });

    it('should return single-bar when configured', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          progress: { style: 'single-bar', updateIntervalMs: 100, showETA: true, colors: true },
        })
      );
      invalidateCache();

      const originalIsTTY = process.stdout.isTTY;
      Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });

      expect(getEffectiveProgressStyle()).toBe('single-bar');

      Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTTY, configurable: true });
    });
  });

  describe('Type Definitions', () => {
    it('should have correct WizardConfig structure', () => {
      const config: WizardConfig = {
        enabled: true,
        themes: ['default', 'minimal', 'detailed'],
        defaultTheme: 'default',
      };
      expect(config.enabled).toBe(true);
      expect(config.themes).toHaveLength(3);
    });

    it('should have correct ProgressConfig structure', () => {
      const config: ProgressConfig = {
        style: 'multi-bar',
        updateIntervalMs: 100,
        showETA: true,
        colors: true,
      };
      expect(config.style).toBe('multi-bar');
      expect(config.updateIntervalMs).toBe(100);
    });

    it('should have correct CompletionConfig structure', () => {
      const config: CompletionConfig = {
        maxSuggestions: 10,
        historyWeight: 0.3,
        contextWeight: 0.7,
        fuzzyMatch: true,
      };
      expect(config.maxSuggestions).toBe(10);
      expect(config.historyWeight + config.contextWeight).toBe(1);
    });

    it('should have correct StreamingConfig structure', () => {
      const config: StreamingConfig = {
        enabled: true,
        bufferSize: 100,
        updateIntervalMs: 50,
      };
      expect(config.enabled).toBe(true);
      expect(config.bufferSize).toBe(100);
    });

    it('should have correct QECLIConfig structure', () => {
      const config: QECLIConfig = {
        wizards: DEFAULT_CLI_CONFIG.wizards,
        progress: DEFAULT_CLI_CONFIG.progress,
        completion: DEFAULT_CLI_CONFIG.completion,
        streaming: DEFAULT_CLI_CONFIG.streaming,
      };
      expect(Object.keys(config)).toHaveLength(4);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty themes array in validation', () => {
      const config = { wizards: { themes: [] } };
      const result = validateConfig(config);
      expect(result.valid).toBe(true); // Empty array is valid
    });

    it('should handle boundary values for weights', () => {
      const configZero = { completion: { historyWeight: 0, contextWeight: 0 } };
      const configOne = { completion: { historyWeight: 1, contextWeight: 1 } };

      expect(validateConfig(configZero).valid).toBe(true);
      expect(validateConfig(configOne).valid).toBe(true);
    });

    it('should handle minimum valid updateIntervalMs', () => {
      const config = { progress: { updateIntervalMs: 10 } };
      const result = validateConfig(config);
      expect(result.valid).toBe(true);
    });

    it('should handle minimum valid bufferSize', () => {
      const config = { streaming: { bufferSize: 1 } };
      const result = validateConfig(config);
      expect(result.valid).toBe(true);
    });

    it('should handle null values in object properties', () => {
      const config = { wizards: null };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        path: 'wizards',
        message: 'must be an object',
      });
    });

    it('should deep merge nested config objects', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          wizards: { enabled: false },
          // progress section not provided
        })
      );

      const config = loadCLIConfig();

      // Partial wizard should be merged
      expect(config.wizards.enabled).toBe(false);
      expect(config.wizards.themes).toEqual(['default', 'minimal', 'detailed']);

      // Missing sections should get defaults
      expect(config.progress).toEqual(DEFAULT_CLI_CONFIG.progress);
      expect(config.completion).toEqual(DEFAULT_CLI_CONFIG.completion);
      expect(config.streaming).toEqual(DEFAULT_CLI_CONFIG.streaming);
    });
  });

  describe('ADR-041 Compliance', () => {
    it('should support all wizard themes per ADR-041', () => {
      const themes = DEFAULT_CLI_CONFIG.wizards.themes;
      expect(themes).toContain('default');
      expect(themes).toContain('minimal');
      expect(themes).toContain('detailed');
    });

    it('should support all progress styles per ADR-041', () => {
      const validStyles = ['multi-bar', 'single-bar', 'spinner'];

      for (const style of validStyles) {
        const config = { progress: { style } };
        const result = validateConfig(config);
        expect(result.valid).toBe(true);
      }
    });

    it('should have completion weight configuration per ADR-041', () => {
      expect(DEFAULT_CLI_CONFIG.completion.historyWeight).toBeDefined();
      expect(DEFAULT_CLI_CONFIG.completion.contextWeight).toBeDefined();
      expect(
        DEFAULT_CLI_CONFIG.completion.historyWeight + DEFAULT_CLI_CONFIG.completion.contextWeight
      ).toBe(1);
    });

    it('should have streaming configuration per ADR-041', () => {
      expect(DEFAULT_CLI_CONFIG.streaming.enabled).toBe(true);
      expect(DEFAULT_CLI_CONFIG.streaming.bufferSize).toBeGreaterThan(0);
      expect(DEFAULT_CLI_CONFIG.streaming.updateIntervalMs).toBeGreaterThan(0);
    });

    it('should persist to ~/.aqe/cli-config.json per ADR-041', () => {
      expect(getConfigPath()).toContain('.aqe');
      expect(getConfigPath()).toContain('cli-config.json');
    });
  });
});
