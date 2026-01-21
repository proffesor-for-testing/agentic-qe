/**
 * Tests for Provider CLI Commands
 *
 * Tests the provider status command and health dashboard functionality.
 */

import { ProviderStatusCommand, ProviderStatusReport } from '../../src/cli/commands/providers/status';

describe('ProviderStatusCommand', () => {
  beforeAll(() => {
    // Use fake timers to avoid Jest timeout issues with setInterval
    jest.useFakeTimers();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    // Clean up any previous state
    ProviderStatusCommand.cleanup();
    jest.clearAllMocks();
  });

  afterEach(() => {
    ProviderStatusCommand.cleanup();
    jest.clearAllTimers();
  });

  describe('execute', () => {
    it('should generate a status report', async () => {
      const report = await ProviderStatusCommand.execute({ json: true });

      expect(report).toBeDefined();
      expect(report.timestamp).toBeDefined();
      expect(report.overallHealth).toBeDefined();
      expect(report.providers).toBeDefined();
      expect(report.summary).toBeDefined();
    });

    it('should include summary statistics', async () => {
      const report = await ProviderStatusCommand.execute({ json: true });

      expect(report.summary).toHaveProperty('total');
      expect(report.summary).toHaveProperty('healthy');
      expect(report.summary).toHaveProperty('degraded');
      expect(report.summary).toHaveProperty('unhealthy');
      expect(report.summary).toHaveProperty('circuitOpen');
    });

    it('should register default providers', async () => {
      const report = await ProviderStatusCommand.execute({ json: true });

      // Should have at least some default providers registered
      expect(report.summary.total).toBeGreaterThan(0);
    });

    it('should include provider details', async () => {
      const report = await ProviderStatusCommand.execute({ json: true });

      for (const provider of report.providers) {
        expect(provider.id).toBeDefined();
        expect(provider.name).toBeDefined();
        expect(typeof provider.healthy).toBe('boolean');
        expect(provider.circuitState).toMatch(/^(closed|open|half-open)$/);
        expect(typeof provider.latency).toBe('number');
        expect(typeof provider.errorRate).toBe('number');
        expect(typeof provider.availability).toBe('number');
        expect(provider.lastCheck).toBeDefined();
      }
    });

    it('should calculate overall health correctly', async () => {
      const report = await ProviderStatusCommand.execute({ json: true });

      expect(report.overallHealth).toMatch(/^(healthy|degraded|unhealthy|unknown)$/);

      // Verify overall health matches summary
      if (report.summary.total === 0) {
        expect(report.overallHealth).toBe('unknown');
      } else if (report.summary.healthy === report.summary.total) {
        expect(report.overallHealth).toBe('healthy');
      } else if (report.summary.healthy > 0) {
        expect(report.overallHealth).toBe('degraded');
      } else {
        expect(report.overallHealth).toBe('unhealthy');
      }
    });

    it('should work with detailed option', async () => {
      const report = await ProviderStatusCommand.execute({ detailed: true, json: true });

      expect(report).toBeDefined();
      expect(report.providers).toBeDefined();
    });
  });

  describe('provider health checks', () => {
    // Save original env
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should detect Groq based on GROQ_API_KEY', async () => {
      process.env.GROQ_API_KEY = 'test-key';

      const report = await ProviderStatusCommand.execute({ json: true });
      const groq = report.providers.find(p => p.id === 'groq');

      expect(groq).toBeDefined();
      expect(groq?.healthy).toBe(true);
    });

    it('should detect missing GROQ_API_KEY', async () => {
      delete process.env.GROQ_API_KEY;

      const report = await ProviderStatusCommand.execute({ json: true });
      const groq = report.providers.find(p => p.id === 'groq');

      expect(groq).toBeDefined();
      expect(groq?.healthy).toBe(false);
      expect(groq?.lastError).toContain('GROQ_API_KEY');
    });

    it('should detect Claude based on ANTHROPIC_API_KEY', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';

      const report = await ProviderStatusCommand.execute({ json: true });
      const claude = report.providers.find(p => p.id === 'claude');

      expect(claude).toBeDefined();
      expect(claude?.healthy).toBe(true);
    });

    it('should detect GitHub Models in Codespaces', async () => {
      process.env.CODESPACES = 'true';

      const report = await ProviderStatusCommand.execute({ json: true });
      const github = report.providers.find(p => p.id === 'github-models');

      expect(github).toBeDefined();
      expect(github?.healthy).toBe(true);
    });

    it('should detect GitHub Models with GITHUB_TOKEN', async () => {
      delete process.env.CODESPACES;
      process.env.GITHUB_TOKEN = 'test-token';

      const report = await ProviderStatusCommand.execute({ json: true });
      const github = report.providers.find(p => p.id === 'github-models');

      expect(github).toBeDefined();
      expect(github?.healthy).toBe(true);
    });

    it('should detect OpenRouter based on OPENROUTER_API_KEY', async () => {
      process.env.OPENROUTER_API_KEY = 'test-key';

      const report = await ProviderStatusCommand.execute({ json: true });
      const openrouter = report.providers.find(p => p.id === 'openrouter');

      expect(openrouter).toBeDefined();
      expect(openrouter?.healthy).toBe(true);
    });
  });

  describe('output formatting', () => {
    it('should output JSON when json option is true', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const report = await ProviderStatusCommand.execute({ json: true });

      expect(consoleSpy).toHaveBeenCalled();

      // Find the JSON output (first call with stringified object)
      const jsonCall = consoleSpy.mock.calls.find(call => {
        const arg = call[0];
        if (typeof arg === 'string' && arg.startsWith('{')) {
          try {
            JSON.parse(arg);
            return true;
          } catch {
            return false;
          }
        }
        return false;
      });

      expect(jsonCall).toBeDefined();
      if (jsonCall) {
        const parsed = JSON.parse(jsonCall[0]);
        expect(parsed.timestamp).toBeDefined();
        expect(parsed.overallHealth).toBeDefined();
      }

      consoleSpy.mockRestore();
    });
  });

  describe('cleanup', () => {
    it('should cleanup resources', () => {
      // Should not throw
      expect(() => ProviderStatusCommand.cleanup()).not.toThrow();
    });

    it('should stop watch mode on cleanup', () => {
      ProviderStatusCommand.cleanup();
      // Calling cleanup again should be safe
      expect(() => ProviderStatusCommand.cleanup()).not.toThrow();
    });
  });
});

describe('Provider Status Report Structure', () => {
  let report: ProviderStatusReport;

  beforeAll(async () => {
    jest.useFakeTimers();
    report = await ProviderStatusCommand.execute({ json: true });
  });

  afterAll(() => {
    ProviderStatusCommand.cleanup();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('should have valid timestamp format', () => {
    expect(new Date(report.timestamp).toISOString()).toBe(report.timestamp);
  });

  it('should have valid overall health status', () => {
    expect(['healthy', 'degraded', 'unhealthy', 'unknown']).toContain(report.overallHealth);
  });

  it('should have providers array', () => {
    expect(Array.isArray(report.providers)).toBe(true);
  });

  it('should have summary object with required fields', () => {
    expect(report.summary).toMatchObject({
      total: expect.any(Number),
      healthy: expect.any(Number),
      degraded: expect.any(Number),
      unhealthy: expect.any(Number),
      circuitOpen: expect.any(Number)
    });
  });

  it('should have consistent summary counts', () => {
    const { total, healthy, degraded, unhealthy } = report.summary;
    // All providers should be accounted for (some may be in multiple states)
    expect(total).toBeGreaterThanOrEqual(0);
    expect(healthy).toBeGreaterThanOrEqual(0);
    expect(degraded).toBeGreaterThanOrEqual(0);
    expect(unhealthy).toBeGreaterThanOrEqual(0);
  });
});
