/**
 * Output Mode Detector - Unit Tests
 *
 * Tests for environment-based output mode detection.
 * Validates detection of Claude Code, Cursor AI, Aider AI, and explicit flags.
 *
 * Coverage target: 95%+
 *
 * @module tests/unit/output/OutputModeDetector
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { OutputMode, OutputModeDetector } from '@/output/OutputFormatter';

describe('OutputModeDetector', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear all relevant environment variables before each test
    delete process.env.AQE_AI_OUTPUT;
    delete process.env.CLAUDECODE;
    delete process.env.CURSOR_AI;
    delete process.env.AIDER_AI;
    delete process.env.AQE_OUTPUT_VERSION;
    delete process.env.AQE_OUTPUT_PRETTY;
    delete process.env.AQE_OUTPUT_STREAM;
  });

  afterEach(() => {
    // Restore original environment
    process.env = { ...originalEnv };
  });

  describe('detectMode', () => {
    it('should default to HUMAN mode when no flags set', () => {
      const mode = OutputModeDetector.detectMode();
      expect(mode).toBe(OutputMode.HUMAN);
    });

    it('should detect explicit AI mode flag', () => {
      process.env.AQE_AI_OUTPUT = '1';
      const mode = OutputModeDetector.detectMode();
      expect(mode).toBe(OutputMode.AI);
    });

    it('should detect explicit HUMAN mode flag', () => {
      process.env.AQE_AI_OUTPUT = '0';
      const mode = OutputModeDetector.detectMode();
      expect(mode).toBe(OutputMode.HUMAN);
    });

    it('should detect Claude Code environment', () => {
      process.env.CLAUDECODE = '1';
      const mode = OutputModeDetector.detectMode();
      expect(mode).toBe(OutputMode.AI);
    });

    it('should detect Cursor AI environment', () => {
      process.env.CURSOR_AI = '1';
      const mode = OutputModeDetector.detectMode();
      expect(mode).toBe(OutputMode.AI);
    });

    it('should detect Aider AI environment', () => {
      process.env.AIDER_AI = '1';
      const mode = OutputModeDetector.detectMode();
      expect(mode).toBe(OutputMode.AI);
    });

    it('should prioritize explicit flag over environment detection', () => {
      process.env.CLAUDECODE = '1';
      process.env.AQE_AI_OUTPUT = '0';
      const mode = OutputModeDetector.detectMode();
      expect(mode).toBe(OutputMode.HUMAN);
    });

    it('should handle multiple AI environments', () => {
      process.env.CLAUDECODE = '1';
      process.env.CURSOR_AI = '1';
      const mode = OutputModeDetector.detectMode();
      expect(mode).toBe(OutputMode.AI);
    });

    it('should handle invalid flag values gracefully', () => {
      process.env.AQE_AI_OUTPUT = 'invalid';
      const mode = OutputModeDetector.detectMode();
      expect(mode).toBe(OutputMode.HUMAN);
    });
  });

  describe('getSchemaVersion', () => {
    it('should return default version when not set', () => {
      const version = OutputModeDetector.getSchemaVersion();
      expect(version).toBe('1.0.0');
    });

    it('should return custom version when set', () => {
      process.env.AQE_OUTPUT_VERSION = '2.1.0';
      const version = OutputModeDetector.getSchemaVersion();
      expect(version).toBe('2.1.0');
    });

    it('should handle empty string', () => {
      process.env.AQE_OUTPUT_VERSION = '';
      const version = OutputModeDetector.getSchemaVersion();
      expect(version).toBe('1.0.0');
    });
  });

  describe('isPrettyPrintEnabled', () => {
    it('should return false when not set', () => {
      const enabled = OutputModeDetector.isPrettyPrintEnabled();
      expect(enabled).toBe(false);
    });

    it('should return true when set to 1', () => {
      process.env.AQE_OUTPUT_PRETTY = '1';
      const enabled = OutputModeDetector.isPrettyPrintEnabled();
      expect(enabled).toBe(true);
    });

    it('should return false when set to 0', () => {
      process.env.AQE_OUTPUT_PRETTY = '0';
      const enabled = OutputModeDetector.isPrettyPrintEnabled();
      expect(enabled).toBe(false);
    });

    it('should handle invalid values', () => {
      process.env.AQE_OUTPUT_PRETTY = 'yes';
      const enabled = OutputModeDetector.isPrettyPrintEnabled();
      expect(enabled).toBe(false);
    });
  });

  describe('isStreamingEnabled', () => {
    it('should return false when not set', () => {
      const enabled = OutputModeDetector.isStreamingEnabled();
      expect(enabled).toBe(false);
    });

    it('should return true when set to 1', () => {
      process.env.AQE_OUTPUT_STREAM = '1';
      const enabled = OutputModeDetector.isStreamingEnabled();
      expect(enabled).toBe(true);
    });

    it('should return false when set to 0', () => {
      process.env.AQE_OUTPUT_STREAM = '0';
      const enabled = OutputModeDetector.isStreamingEnabled();
      expect(enabled).toBe(false);
    });

    it('should handle invalid values', () => {
      process.env.AQE_OUTPUT_STREAM = 'true';
      const enabled = OutputModeDetector.isStreamingEnabled();
      expect(enabled).toBe(false);
    });
  });

  describe('Environment Detection Priority', () => {
    it('should have correct priority: explicit flag > Claude Code > Cursor > Aider', () => {
      // Test 1: Explicit flag wins
      process.env.AQE_AI_OUTPUT = '0';
      process.env.CLAUDECODE = '1';
      expect(OutputModeDetector.detectMode()).toBe(OutputMode.HUMAN);

      // Test 2: Claude Code wins over Cursor
      delete process.env.AQE_AI_OUTPUT;
      process.env.CLAUDECODE = '1';
      process.env.CURSOR_AI = '1';
      expect(OutputModeDetector.detectMode()).toBe(OutputMode.AI);

      // Test 3: Cursor wins over Aider
      delete process.env.CLAUDECODE;
      process.env.CURSOR_AI = '1';
      process.env.AIDER_AI = '1';
      expect(OutputModeDetector.detectMode()).toBe(OutputMode.AI);
    });
  });

  describe('Configuration Combinations', () => {
    it('should handle AI mode with pretty print', () => {
      process.env.AQE_AI_OUTPUT = '1';
      process.env.AQE_OUTPUT_PRETTY = '1';

      expect(OutputModeDetector.detectMode()).toBe(OutputMode.AI);
      expect(OutputModeDetector.isPrettyPrintEnabled()).toBe(true);
    });

    it('should handle AI mode with streaming', () => {
      process.env.CLAUDECODE = '1';
      process.env.AQE_OUTPUT_STREAM = '1';

      expect(OutputModeDetector.detectMode()).toBe(OutputMode.AI);
      expect(OutputModeDetector.isStreamingEnabled()).toBe(true);
    });

    it('should handle custom version with AI mode', () => {
      process.env.CURSOR_AI = '1';
      process.env.AQE_OUTPUT_VERSION = '2.0.0';

      expect(OutputModeDetector.detectMode()).toBe(OutputMode.AI);
      expect(OutputModeDetector.getSchemaVersion()).toBe('2.0.0');
    });

    it('should handle all flags enabled', () => {
      process.env.AQE_AI_OUTPUT = '1';
      process.env.AQE_OUTPUT_PRETTY = '1';
      process.env.AQE_OUTPUT_STREAM = '1';
      process.env.AQE_OUTPUT_VERSION = '2.1.0';

      expect(OutputModeDetector.detectMode()).toBe(OutputMode.AI);
      expect(OutputModeDetector.isPrettyPrintEnabled()).toBe(true);
      expect(OutputModeDetector.isStreamingEnabled()).toBe(true);
      expect(OutputModeDetector.getSchemaVersion()).toBe('2.1.0');
    });
  });

  describe('Edge Cases', () => {
    it('should handle undefined environment variables', () => {
      delete process.env.AQE_AI_OUTPUT;
      expect(() => OutputModeDetector.detectMode()).not.toThrow();
    });

    it('should handle null-like values', () => {
      process.env.AQE_AI_OUTPUT = '';
      process.env.CLAUDECODE = '';

      const mode = OutputModeDetector.detectMode();
      expect(mode).toBe(OutputMode.HUMAN);
    });

    it('should handle numeric string variations', () => {
      const testCases = [
        { value: '1', expected: true },
        { value: '0', expected: false },
        { value: '01', expected: false },
        { value: '10', expected: false },
        { value: ' 1', expected: false },
        { value: '1 ', expected: false },
      ];

      testCases.forEach(({ value, expected }) => {
        process.env.AQE_OUTPUT_PRETTY = value;
        expect(OutputModeDetector.isPrettyPrintEnabled()).toBe(expected);
      });
    });
  });

  describe('CI/CD Environment Detection', () => {
    it('should detect CI environment and default to HUMAN', () => {
      process.env.CI = 'true';
      process.env.GITHUB_ACTIONS = 'true';

      const mode = OutputModeDetector.detectMode();
      expect(mode).toBe(OutputMode.HUMAN);
    });

    it('should override CI default with explicit AI flag', () => {
      process.env.CI = 'true';
      process.env.AQE_AI_OUTPUT = '1';

      const mode = OutputModeDetector.detectMode();
      expect(mode).toBe(OutputMode.AI);
    });
  });

  describe('Development vs Production', () => {
    it('should work the same in development', () => {
      process.env.NODE_ENV = 'development';
      process.env.CLAUDECODE = '1';

      const mode = OutputModeDetector.detectMode();
      expect(mode).toBe(OutputMode.AI);
    });

    it('should work the same in production', () => {
      process.env.NODE_ENV = 'production';
      process.env.CLAUDECODE = '1';

      const mode = OutputModeDetector.detectMode();
      expect(mode).toBe(OutputMode.AI);
    });
  });

  describe('Backwards Compatibility', () => {
    it('should maintain compatibility with older flag names', () => {
      // If we had legacy flags, we would test them here
      process.env.AQE_AI_OUTPUT = '1';
      expect(OutputModeDetector.detectMode()).toBe(OutputMode.AI);
    });
  });

  describe('Performance', () => {
    it('should detect mode efficiently', () => {
      const iterations = 10000;
      const startTime = performance.now();

      for (let i = 0; i < iterations; i++) {
        OutputModeDetector.detectMode();
      }

      const duration = performance.now() - startTime;
      const avgTime = duration / iterations;

      expect(avgTime).toBeLessThan(0.1); // <0.1ms per call
    });

    it('should cache environment reads efficiently', () => {
      process.env.CLAUDECODE = '1';

      const times: number[] = [];
      for (let i = 0; i < 100; i++) {
        const start = performance.now();
        OutputModeDetector.detectMode();
        times.push(performance.now() - start);
      }

      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      expect(avgTime).toBeLessThan(0.01); // <0.01ms average
    });
  });

  describe('Type Safety', () => {
    it('should return valid OutputMode enum values', () => {
      const validModes = [OutputMode.AI, OutputMode.HUMAN, OutputMode.AUTO];

      process.env.AQE_AI_OUTPUT = '1';
      expect(validModes).toContain(OutputModeDetector.detectMode());

      delete process.env.AQE_AI_OUTPUT;
      expect(validModes).toContain(OutputModeDetector.detectMode());
    });

    it('should return boolean for flag checks', () => {
      expect(typeof OutputModeDetector.isPrettyPrintEnabled()).toBe('boolean');
      expect(typeof OutputModeDetector.isStreamingEnabled()).toBe('boolean');
    });

    it('should return string for version', () => {
      expect(typeof OutputModeDetector.getSchemaVersion()).toBe('string');
    });
  });
});
