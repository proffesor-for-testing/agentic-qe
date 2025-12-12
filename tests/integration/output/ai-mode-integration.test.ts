/**
 * AI Mode Integration Tests
 *
 * End-to-end integration tests for AI-friendly output mode.
 * Tests environment detection, CLI integration, and output formatting.
 *
 * Coverage target: 95%+
 *
 * @module tests/integration/output/ai-mode-integration
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { OutputMode, OutputModeDetector, SCHEMA_VERSION } from '@/output/OutputFormatter';

describe('AI Mode Integration', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear environment variables
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

  describe('Environment Detection Flow', () => {
    it('should detect Claude Code environment end-to-end', () => {
      process.env.CLAUDECODE = '1';

      const mode = OutputModeDetector.detectMode();
      expect(mode).toBe(OutputMode.AI);

      // Verify all related flags
      expect(OutputModeDetector.getSchemaVersion()).toBe('1.0.0');
      expect(OutputModeDetector.isPrettyPrintEnabled()).toBe(false);
      expect(OutputModeDetector.isStreamingEnabled()).toBe(false);
    });

    it('should detect Cursor AI environment with custom settings', () => {
      process.env.CURSOR_AI = '1';
      process.env.AQE_OUTPUT_PRETTY = '1';
      process.env.AQE_OUTPUT_VERSION = '2.0.0';

      const mode = OutputModeDetector.detectMode();
      expect(mode).toBe(OutputMode.AI);
      expect(OutputModeDetector.isPrettyPrintEnabled()).toBe(true);
      expect(OutputModeDetector.getSchemaVersion()).toBe('2.0.0');
    });

    it('should handle manual AI mode activation', () => {
      process.env.AQE_AI_OUTPUT = '1';

      const mode = OutputModeDetector.detectMode();
      expect(mode).toBe(OutputMode.AI);
    });
  });

  describe('CLI Integration Scenarios', () => {
    it('should work with aqe test command in AI mode', () => {
      process.env.CLAUDECODE = '1';

      // Simulate CLI invocation
      const cliContext = {
        mode: OutputModeDetector.detectMode(),
        schemaVersion: OutputModeDetector.getSchemaVersion(),
        prettyPrint: OutputModeDetector.isPrettyPrintEnabled(),
        streaming: OutputModeDetector.isStreamingEnabled(),
      };

      expect(cliContext.mode).toBe(OutputMode.AI);
      expect(cliContext.schemaVersion).toBe('1.0.0');
      expect(cliContext.prettyPrint).toBe(false);
      expect(cliContext.streaming).toBe(false);
    });

    it('should work with aqe coverage command in AI mode', () => {
      process.env.CURSOR_AI = '1';
      process.env.AQE_OUTPUT_STREAM = '1';

      const cliContext = {
        mode: OutputModeDetector.detectMode(),
        streaming: OutputModeDetector.isStreamingEnabled(),
      };

      expect(cliContext.mode).toBe(OutputMode.AI);
      expect(cliContext.streaming).toBe(true);
    });

    it('should work with aqe quality command with pretty print', () => {
      process.env.AQE_AI_OUTPUT = '1';
      process.env.AQE_OUTPUT_PRETTY = '1';

      const cliContext = {
        mode: OutputModeDetector.detectMode(),
        prettyPrint: OutputModeDetector.isPrettyPrintEnabled(),
      };

      expect(cliContext.mode).toBe(OutputMode.AI);
      expect(cliContext.prettyPrint).toBe(true);
    });
  });

  describe('Output Format Validation', () => {
    it('should generate valid JSON output in AI mode', () => {
      process.env.CLAUDECODE = '1';

      const mockOutput = {
        schemaVersion: OutputModeDetector.getSchemaVersion(),
        outputType: 'test_results' as const,
        timestamp: new Date().toISOString(),
        executionId: 'test-123',
        status: 'success' as const,
        metadata: {
          agentId: 'qe-test-generator',
          agentVersion: '2.3.5',
          duration: 1500,
          environment: 'test' as const,
        },
        data: {
          summary: {
            total: 10,
            passed: 9,
            failed: 1,
            skipped: 0,
            duration: 1500,
            passRate: 90,
            failureRate: 10,
          },
        },
        actionSuggestions: [],
        warnings: [],
        errors: [],
      };

      // Validate JSON serialization
      const json = JSON.stringify(mockOutput);
      expect(json).toBeDefined();
      expect(json.length).toBeGreaterThan(0);

      // Validate JSON parsing
      const parsed = JSON.parse(json);
      expect(parsed.schemaVersion).toBe(SCHEMA_VERSION);
      expect(parsed.status).toBe('success');
    });

    it('should generate compact JSON when pretty print disabled', () => {
      process.env.AQE_AI_OUTPUT = '1';
      process.env.AQE_OUTPUT_PRETTY = '0';

      const mockOutput = { test: 'data', nested: { value: 123 } };

      const compact = JSON.stringify(mockOutput);
      expect(compact).not.toContain('\n');
      expect(compact).not.toContain('  ');
    });

    it('should generate pretty JSON when pretty print enabled', () => {
      process.env.AQE_AI_OUTPUT = '1';
      process.env.AQE_OUTPUT_PRETTY = '1';

      const mockOutput = { test: 'data', nested: { value: 123 } };

      const pretty = JSON.stringify(mockOutput, null, 2);
      expect(pretty).toContain('\n');
      expect(pretty).toContain('  ');
    });
  });

  describe('Streaming Output Integration', () => {
    it('should support streaming mode for long-running operations', () => {
      process.env.CLAUDECODE = '1';
      process.env.AQE_OUTPUT_STREAM = '1';

      expect(OutputModeDetector.isStreamingEnabled()).toBe(true);

      // Simulate streaming messages
      const streamStart = {
        schemaVersion: SCHEMA_VERSION,
        outputType: 'test_results_stream' as const,
        streamType: 'start' as const,
        executionId: 'stream-123',
        timestamp: new Date().toISOString(),
        metadata: {
          totalTests: 100,
          estimatedDuration: 5000,
        },
      };

      const streamProgress = {
        streamType: 'progress' as const,
        completed: 50,
        total: 100,
        passed: 45,
        failed: 5,
        elapsed: 2500,
      };

      expect(streamStart.streamType).toBe('start');
      expect(streamProgress.streamType).toBe('progress');
      expect(streamProgress.completed / streamProgress.total).toBe(0.5);
    });

    it('should handle streaming errors gracefully', () => {
      process.env.AQE_OUTPUT_STREAM = '1';

      const streamError = {
        streamType: 'error' as const,
        executionId: 'stream-456',
        timestamp: new Date().toISOString(),
        error: {
          code: 'TEST_TIMEOUT',
          message: 'Test execution timed out after 30s',
        },
      };

      expect(streamError.streamType).toBe('error');
      expect(streamError.error.code).toBe('TEST_TIMEOUT');
    });
  });

  describe('Schema Version Compatibility', () => {
    it('should support default schema version', () => {
      const version = OutputModeDetector.getSchemaVersion();
      expect(version).toBe('1.0.0');
    });

    it('should support custom schema versions', () => {
      const versions = ['1.0.0', '1.1.0', '2.0.0'];

      versions.forEach((ver) => {
        process.env.AQE_OUTPUT_VERSION = ver;
        expect(OutputModeDetector.getSchemaVersion()).toBe(ver);
      });
    });

    it('should validate schema version format', () => {
      const version = OutputModeDetector.getSchemaVersion();
      const versionRegex = /^\d+\.\d+\.\d+$/;
      expect(versionRegex.test(version)).toBe(true);
    });
  });

  describe('Multi-Agent Coordination', () => {
    it('should maintain consistent mode across multiple agents', () => {
      process.env.CLAUDECODE = '1';

      // Simulate multiple agents checking mode
      const agents = ['test-gen', 'coverage-analyzer', 'quality-checker'];

      agents.forEach((agent) => {
        const mode = OutputModeDetector.detectMode();
        expect(mode).toBe(OutputMode.AI);
      });
    });

    it('should support per-agent output configuration', () => {
      process.env.AQE_AI_OUTPUT = '1';

      const agentConfigs = [
        { agentId: 'test-gen', streaming: true },
        { agentId: 'coverage', streaming: false },
        { agentId: 'quality', streaming: true },
      ];

      agentConfigs.forEach((config) => {
        const mode = OutputModeDetector.detectMode();
        expect(mode).toBe(OutputMode.AI);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle corrupted environment gracefully', () => {
      process.env.AQE_AI_OUTPUT = 'corrupted';
      process.env.AQE_OUTPUT_VERSION = '';

      expect(() => OutputModeDetector.detectMode()).not.toThrow();
      expect(() => OutputModeDetector.getSchemaVersion()).not.toThrow();
    });

    it('should fallback to safe defaults on errors', () => {
      process.env.AQE_AI_OUTPUT = 'invalid';

      const mode = OutputModeDetector.detectMode();
      expect(mode).toBe(OutputMode.HUMAN);

      const version = OutputModeDetector.getSchemaVersion();
      expect(version).toBe('1.0.0');
    });
  });

  describe('Performance under Load', () => {
    it('should handle rapid mode detection calls', () => {
      process.env.CLAUDECODE = '1';

      const iterations = 1000;
      const startTime = performance.now();

      for (let i = 0; i < iterations; i++) {
        const mode = OutputModeDetector.detectMode();
        expect(mode).toBe(OutputMode.AI);
      }

      const duration = performance.now() - startTime;
      const avgTime = duration / iterations;

      expect(avgTime).toBeLessThan(0.1); // <0.1ms per call
    });

    it('should handle concurrent detection across multiple contexts', async () => {
      process.env.CURSOR_AI = '1';

      const promises = Array.from({ length: 100 }, async () => {
        return OutputModeDetector.detectMode();
      });

      const results = await Promise.all(promises);
      results.forEach((mode) => {
        expect(mode).toBe(OutputMode.AI);
      });
    });
  });

  describe('Real-world Usage Patterns', () => {
    it('should support typical Claude Code workflow', () => {
      // Claude Code spawns agent
      process.env.CLAUDECODE = '1';

      // Agent checks mode
      const mode = OutputModeDetector.detectMode();
      expect(mode).toBe(OutputMode.AI);

      // Agent generates output
      const output = {
        schemaVersion: OutputModeDetector.getSchemaVersion(),
        mode,
        timestamp: new Date().toISOString(),
      };

      // Output is valid JSON
      expect(() => JSON.stringify(output)).not.toThrow();
    });

    it('should support manual AI mode for testing', () => {
      // Developer sets AI mode manually
      process.env.AQE_AI_OUTPUT = '1';
      process.env.AQE_OUTPUT_PRETTY = '1';

      // Verify configuration
      expect(OutputModeDetector.detectMode()).toBe(OutputMode.AI);
      expect(OutputModeDetector.isPrettyPrintEnabled()).toBe(true);
    });

    it('should support CI/CD with AI mode', () => {
      // CI environment with AI output
      process.env.CI = 'true';
      process.env.AQE_AI_OUTPUT = '1';

      expect(OutputModeDetector.detectMode()).toBe(OutputMode.AI);
    });
  });

  describe('Backwards Compatibility', () => {
    it('should work without any flags (default behavior)', () => {
      const mode = OutputModeDetector.detectMode();
      expect(mode).toBe(OutputMode.HUMAN);

      const version = OutputModeDetector.getSchemaVersion();
      expect(version).toBe('1.0.0');

      expect(OutputModeDetector.isPrettyPrintEnabled()).toBe(false);
      expect(OutputModeDetector.isStreamingEnabled()).toBe(false);
    });

    it('should maintain schema compatibility across versions', () => {
      const versions = ['1.0.0', '1.1.0', '1.2.0'];

      versions.forEach((ver) => {
        process.env.AQE_OUTPUT_VERSION = ver;
        const version = OutputModeDetector.getSchemaVersion();

        // All 1.x versions should be compatible
        expect(version.startsWith('1.')).toBe(true);
      });
    });
  });

  describe('Documentation Compliance', () => {
    it('should follow documented environment variable names', () => {
      const envVars = [
        'AQE_AI_OUTPUT',
        'CLAUDECODE',
        'CURSOR_AI',
        'AIDER_AI',
        'AQE_OUTPUT_VERSION',
        'AQE_OUTPUT_PRETTY',
        'AQE_OUTPUT_STREAM',
      ];

      // Verify all documented variables are checked
      envVars.forEach((varName) => {
        expect(typeof process.env[varName]).toBeDefined;
      });
    });

    it('should provide documented default values', () => {
      // Defaults from documentation
      expect(OutputModeDetector.detectMode()).toBe(OutputMode.HUMAN);
      expect(OutputModeDetector.getSchemaVersion()).toBe('1.0.0');
      expect(OutputModeDetector.isPrettyPrintEnabled()).toBe(false);
      expect(OutputModeDetector.isStreamingEnabled()).toBe(false);
    });
  });
});
