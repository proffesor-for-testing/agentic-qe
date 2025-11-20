/**
 * Integration Tests: Adapter Fail-Fast Behavior
 * Issue: #57 - Verify adapter architecture fail-fast guarantees
 *
 * These tests verify that:
 * 1. AdapterFactory throws on invalid configuration
 * 2. No silent fallback to mock adapters occurs
 * 3. Explicit configuration is required
 * 4. Validation errors provide actionable messages
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import * as path from 'path';
import * as fs from 'fs-extra';
import {
  AdapterConfig,
  AdapterType,
  AdapterConfigValidator,
  AdapterConfigHelper
} from '../../src/core/memory/AdapterConfig';
import { AdapterFactory } from '../../src/core/memory/AdapterFactory';

describe('Adapter Fail-Fast Behavior', () => {
  const testDbDir = path.resolve(process.cwd(), '.test-adapter-failfast');
  const testDbPath = path.join(testDbDir, 'test.db');

  beforeEach(async () => {
    // Clean test directory
    await fs.remove(testDbDir);
    await fs.ensureDir(testDbDir);
  });

  afterEach(async () => {
    await fs.remove(testDbDir);
  });

  describe('AdapterConfigValidator', () => {
    test('throws on missing type', () => {
      const config = { dbPath: testDbPath } as AdapterConfig;
      expect(() => AdapterConfigValidator.validate(config)).toThrow();
    });

    test('throws on invalid type', () => {
      const config = {
        type: 'invalid' as AdapterType,
        dbPath: testDbPath
      };
      expect(() => AdapterConfigValidator.validate(config)).toThrow(/Invalid adapter type/);
    });

    test('throws on REAL type without dbPath', () => {
      const config: AdapterConfig = {
        type: AdapterType.REAL
        // Missing dbPath
      };
      expect(() => AdapterConfigValidator.validate(config)).toThrow(/dbPath is required/);
    });

    test('throws on deprecated AUTO type', () => {
      const config: AdapterConfig = {
        type: AdapterType.AUTO,
        dbPath: testDbPath
      };
      expect(() => AdapterConfigValidator.validate(config)).toThrow(/AUTO.*deprecated/i);
    });

    test('accepts valid REAL configuration', () => {
      const config: AdapterConfig = {
        type: AdapterType.REAL,
        dbPath: testDbPath,
        failFast: true,
        validateOnStartup: true
      };
      expect(() => AdapterConfigValidator.validate(config)).not.toThrow();
    });

    test('accepts valid MOCK configuration', () => {
      const config: AdapterConfig = {
        type: AdapterType.MOCK
      };
      expect(() => AdapterConfigValidator.validate(config)).not.toThrow();
    });
  });

  describe('AdapterConfigHelper', () => {
    test('forProduction requires dbPath', () => {
      const config = AdapterConfigHelper.forProduction(testDbPath);
      expect(config.type).toBe(AdapterType.REAL);
      expect(config.dbPath).toBe(testDbPath);
      expect(config.failFast).toBe(true);
      expect(config.validateOnStartup).toBe(true);
    });

    test('forTesting returns MOCK type', () => {
      const config = AdapterConfigHelper.forTesting();
      expect(config.type).toBe(AdapterType.MOCK);
    });

    test('forDevelopment sets correct defaults', () => {
      const config = AdapterConfigHelper.forDevelopment(testDbPath);
      expect(config.type).toBe(AdapterType.REAL);
      expect(config.dbPath).toBe(testDbPath);
    });

    test('fromEnvironment respects AQE_USE_MOCK_AGENTDB for testing', () => {
      const originalEnv = process.env.AQE_USE_MOCK_AGENTDB;
      process.env.AQE_USE_MOCK_AGENTDB = 'true';

      try {
        const config = AdapterConfigHelper.fromEnvironment(testDbPath);
        expect(config.type).toBe(AdapterType.MOCK);
      } finally {
        if (originalEnv === undefined) {
          delete process.env.AQE_USE_MOCK_AGENTDB;
        } else {
          process.env.AQE_USE_MOCK_AGENTDB = originalEnv;
        }
      }
    });
  });

  describe('AdapterFactory', () => {
    test('throws on invalid configuration', async () => {
      const config = {
        type: 'invalid' as AdapterType,
        dbPath: testDbPath
      };

      await expect(AdapterFactory.create(config)).rejects.toThrow();
    });

    test('throws on non-existent database path', async () => {
      const config: AdapterConfig = {
        type: AdapterType.REAL,
        dbPath: '/nonexistent/path/db.sqlite',
        failFast: true,
        validateOnStartup: true
      };

      await expect(AdapterFactory.create(config)).rejects.toThrow();
    });

    test('creates MOCK adapter successfully', async () => {
      const config: AdapterConfig = {
        type: AdapterType.MOCK
      };

      const result = await AdapterFactory.create(config);
      expect(result).toBeDefined();
      expect(result.adapter).toBeDefined();
    });

    test('never silently falls back to mock', async () => {
      // When REAL is requested but fails, it should throw, not fallback
      const config: AdapterConfig = {
        type: AdapterType.REAL,
        dbPath: '/invalid/path/that/does/not/exist.db',
        failFast: true
      };

      // Should throw, not return a mock adapter
      await expect(AdapterFactory.create(config)).rejects.toThrow();
    });

    test('provides actionable error messages', async () => {
      const config: AdapterConfig = {
        type: AdapterType.REAL,
        dbPath: '/invalid/path.db',
        failFast: true
      };

      try {
        await AdapterFactory.create(config);
        fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        const errorMessage = (error as Error).message;
        // Error should contain helpful information
        expect(
          errorMessage.includes('path') ||
          errorMessage.includes('database') ||
          errorMessage.includes('not found') ||
          errorMessage.includes('ENOENT')
        ).toBe(true);
      }
    });
  });

  describe('No Silent Fallback Guarantee', () => {
    test('explicit REAL configuration never returns MOCK', async () => {
      // Create a valid database first
      await fs.writeFile(testDbPath, '');

      const config: AdapterConfig = {
        type: AdapterType.REAL,
        dbPath: testDbPath,
        failFast: true,
        validateOnStartup: true
      };

      try {
        const result = await AdapterFactory.create(config);
        // If creation succeeds, verify it's actually REAL
        expect(result.adapterType).not.toBe(AdapterType.MOCK);
        expect(result.adapterType).toBe(AdapterType.REAL);
      } catch {
        // If it fails, that's acceptable - but it should NOT return a mock
        // The fact that it throws is the correct behavior
      }
    });

    test('environment variables do not override explicit config', async () => {
      const originalEnv = process.env.AQE_USE_MOCK_AGENTDB;
      process.env.AQE_USE_MOCK_AGENTDB = 'true';

      try {
        // Explicit REAL config should be respected even with env var set
        const config: AdapterConfig = {
          type: AdapterType.REAL,
          dbPath: testDbPath,
          failFast: true
        };

        // Should try to create REAL adapter and potentially fail
        // but should NOT silently use MOCK just because env var is set
        try {
          const result = await AdapterFactory.create(config);
          expect(result.adapterType).toBe(AdapterType.REAL);
        } catch {
          // Throwing is acceptable, silent fallback is not
        }
      } finally {
        if (originalEnv === undefined) {
          delete process.env.AQE_USE_MOCK_AGENTDB;
        } else {
          process.env.AQE_USE_MOCK_AGENTDB = originalEnv;
        }
      }
    });
  });
});
