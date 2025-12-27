/**
 * Tests for HybridRouterHealthIntegration
 *
 * Verifies health-aware routing and fallback logic.
 */

import {
  HybridRouterHealthIntegration,
  FallbackConfig,
  RankedProvider,
  createHealthAwareRouter
} from '../../src/providers/HybridRouterHealthIntegration';
import {
  ProviderHealthMonitor,
  ProviderHealthState
} from '../../src/monitoring/ProviderHealthMonitor';
import {
  ILLMProvider,
  LLMCompletionOptions,
  LLMCompletionResponse,
  LLMHealthStatus,
  LLMProviderError
} from '../../src/providers/ILLMProvider';

// Mock provider factory
function createMockProvider(
  name: string,
  healthy: boolean = true,
  latency: number = 100,
  shouldFail: boolean = false
): jest.Mocked<ILLMProvider> {
  return {
    initialize: jest.fn().mockResolvedValue(undefined),
    complete: jest.fn().mockImplementation(async () => {
      if (shouldFail) {
        throw new LLMProviderError(
          `${name} failed`,
          name,
          'API_ERROR',
          true
        );
      }
      return {
        id: `response-${name}`,
        content: [{ type: 'text', text: `Response from ${name}` }],
        usage: { input_tokens: 10, output_tokens: 20 },
        model: 'mock-model',
        stop_reason: 'end_turn'
      } as LLMCompletionResponse;
    }),
    streamComplete: jest.fn(),
    embed: jest.fn(),
    countTokens: jest.fn().mockResolvedValue(10),
    healthCheck: jest.fn().mockImplementation(async () => {
      await new Promise(r => setTimeout(r, latency));
      return {
        healthy,
        timestamp: new Date(),
        latency,
        metadata: { provider: name }
      } as LLMHealthStatus;
    }),
    getMetadata: jest.fn().mockReturnValue({
      name,
      version: '1.0.0',
      models: ['mock-model'],
      capabilities: { streaming: true, caching: false, embeddings: true, vision: false },
      costs: { inputPerMillion: 1, outputPerMillion: 2 },
      location: 'cloud'
    }),
    shutdown: jest.fn().mockResolvedValue(undefined),
    trackCost: jest.fn().mockReturnValue(0.01)
  };
}

describe('HybridRouterHealthIntegration', () => {
  let healthMonitor: ProviderHealthMonitor;
  let integration: HybridRouterHealthIntegration;

  beforeEach(() => {
    healthMonitor = new ProviderHealthMonitor({
      checkIntervalMs: 30000,
      timeoutMs: 5000,
      failureThreshold: 3,
      recoveryTimeMs: 60000,
      healthyLatencyThresholdMs: 3000
    });
    integration = new HybridRouterHealthIntegration(healthMonitor);
  });

  afterEach(() => {
    healthMonitor.stopMonitoring();
  });

  describe('Provider Registration', () => {
    it('should register a provider', () => {
      const provider = createMockProvider('test-provider');
      integration.registerProvider('test-provider', provider);

      const summary = integration.getHealthSummary();
      expect(summary.has('test-provider')).toBe(true);
    });

    it('should unregister a provider', () => {
      const provider = createMockProvider('test-provider');
      integration.registerProvider('test-provider', provider);
      integration.unregisterProvider('test-provider');

      const summary = integration.getHealthSummary();
      expect(summary.has('test-provider')).toBe(false);
    });

    it('should register multiple providers', () => {
      const providers = [
        createMockProvider('provider-1'),
        createMockProvider('provider-2'),
        createMockProvider('provider-3')
      ];

      providers.forEach((p, i) => {
        integration.registerProvider(`provider-${i + 1}`, p);
      });

      const summary = integration.getHealthSummary();
      expect(summary.size).toBe(3);
    });
  });

  describe('Provider Ranking', () => {
    it('should rank providers by health score', async () => {
      // Register providers with different health characteristics
      const healthyProvider = createMockProvider('healthy', true, 100);
      const slowProvider = createMockProvider('slow', true, 2000);
      const unhealthyProvider = createMockProvider('unhealthy', false, 100);

      integration.registerProvider('healthy', healthyProvider);
      integration.registerProvider('slow', slowProvider);
      integration.registerProvider('unhealthy', unhealthyProvider);

      // Trigger health checks
      await integration.forceHealthCheck();

      const ranked = integration.getRankedProviders();

      // Healthy fast provider should rank first
      expect(ranked[0].providerId).toBe('healthy');
      // Slow but healthy second
      expect(ranked[1].providerId).toBe('slow');
      // Unhealthy last
      expect(ranked[2].providerId).toBe('unhealthy');
    });

    it('should get best available provider', async () => {
      const provider1 = createMockProvider('provider-1', true, 100);
      const provider2 = createMockProvider('provider-2', true, 200);

      integration.registerProvider('provider-1', provider1);
      integration.registerProvider('provider-2', provider2);

      await integration.forceHealthCheck();

      const best = integration.getBestProvider();
      expect(best).toBeDefined();
      expect(best!.providerId).toBe('provider-1');
    });

    it('should return undefined when no providers available', () => {
      const best = integration.getBestProvider();
      expect(best).toBeUndefined();
    });

    it('should return undefined when all providers unhealthy with open circuits', async () => {
      const unhealthyProvider = createMockProvider('unhealthy', false, 100);
      integration.registerProvider('unhealthy', unhealthyProvider);

      // Force circuit open by triggering multiple failures
      for (let i = 0; i < 5; i++) {
        await integration.forceHealthCheck();
      }

      // Mock the health state to have open circuit
      jest.spyOn(healthMonitor, 'getProviderHealth').mockReturnValue({
        providerId: 'unhealthy',
        healthy: false,
        latency: 100,
        errorRate: 1,
        availability: 0,
        consecutiveFailures: 5,
        circuitState: 'open',
        lastCheck: new Date(),
        checkCount: 5,
        successCount: 0
      });

      const ranked = integration.getRankedProviders();
      const available = ranked.filter(p => p.circuitState !== 'open' && p.healthScore >= 0.3);
      expect(available.length).toBe(0);
    });
  });

  describe('Fallback Chain', () => {
    it('should build fallback chain excluding primary', async () => {
      const provider1 = createMockProvider('provider-1', true, 100);
      const provider2 = createMockProvider('provider-2', true, 150);
      const provider3 = createMockProvider('provider-3', true, 200);

      integration.registerProvider('provider-1', provider1);
      integration.registerProvider('provider-2', provider2);
      integration.registerProvider('provider-3', provider3);

      await integration.forceHealthCheck();

      const chain = integration.buildFallbackChain('provider-1');

      expect(chain).not.toContain('provider-1');
      expect(chain.length).toBe(2);
    });

    it('should exclude providers with open circuits from fallback chain', async () => {
      const provider1 = createMockProvider('provider-1', true, 100);
      const provider2 = createMockProvider('provider-2', false, 100);

      integration.registerProvider('provider-1', provider1);
      integration.registerProvider('provider-2', provider2);

      // Mock open circuit for provider-2
      jest.spyOn(healthMonitor, 'getProviderHealth').mockImplementation((id) => {
        if (id === 'provider-2') {
          return {
            providerId: 'provider-2',
            healthy: false,
            latency: 100,
            errorRate: 1,
            availability: 0,
            consecutiveFailures: 5,
            circuitState: 'open',
            lastCheck: new Date(),
            checkCount: 5,
            successCount: 0
          };
        }
        return {
          providerId: 'provider-1',
          healthy: true,
          latency: 100,
          errorRate: 0,
          availability: 1,
          consecutiveFailures: 0,
          circuitState: 'closed',
          lastCheck: new Date(),
          checkCount: 1,
          successCount: 1
        };
      });

      const chain = integration.buildFallbackChain();
      expect(chain).not.toContain('provider-2');
    });
  });

  describe('Execute with Fallback', () => {
    const options: LLMCompletionOptions = {
      messages: [{ role: 'user', content: 'Hello' }],
      model: 'test-model'
    };

    it('should execute successfully with primary provider', async () => {
      const provider = createMockProvider('primary', true, 100, false);
      integration.registerProvider('primary', provider);

      await integration.forceHealthCheck();

      const result = await integration.executeWithFallback(options, 'primary');

      expect(result.success).toBe(true);
      expect(result.providerId).toBe('primary');
      expect(result.attemptCount).toBe(1);
      expect(result.response).toBeDefined();
    });

    it('should fallback to secondary when primary fails', async () => {
      const primaryProvider = createMockProvider('primary', true, 100, true); // Will fail
      const secondaryProvider = createMockProvider('secondary', true, 100, false);

      integration.registerProvider('primary', primaryProvider);
      integration.registerProvider('secondary', secondaryProvider);

      await integration.forceHealthCheck();

      const result = await integration.executeWithFallback(options, 'primary');

      expect(result.success).toBe(true);
      expect(result.providerId).toBe('secondary');
      expect(result.attemptCount).toBe(2);
      expect(result.fallbackChain).toContain('primary');
      expect(result.fallbackChain).toContain('secondary');
    });

    it('should fail when all providers fail', async () => {
      const provider1 = createMockProvider('provider-1', true, 100, true);
      const provider2 = createMockProvider('provider-2', true, 100, true);

      integration.registerProvider('provider-1', provider1);
      integration.registerProvider('provider-2', provider2);

      await integration.forceHealthCheck();

      const result = await integration.executeWithFallback(options);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.fallbackChain.length).toBeGreaterThan(0);
    });

    it('should respect maxAttempts configuration', async () => {
      const customIntegration = new HybridRouterHealthIntegration(healthMonitor, {
        maxAttempts: 2
      });

      // Provider-3 has highest latency so it will be ranked last
      const provider1 = createMockProvider('provider-1', true, 50, true);   // Fast, fails
      const provider2 = createMockProvider('provider-2', true, 100, true);  // Medium, fails
      const provider3 = createMockProvider('provider-3', true, 2000, false); // Slow, would succeed but won't be reached

      customIntegration.registerProvider('provider-1', provider1);
      customIntegration.registerProvider('provider-2', provider2);
      customIntegration.registerProvider('provider-3', provider3);

      await healthMonitor.checkAllProviders();

      const result = await customIntegration.executeWithFallback(options);

      // Should stop after 2 attempts, not reaching provider-3 (the slow one)
      expect(result.success).toBe(false);
      expect(result.attemptCount).toBe(2);
    });

    it('should return error when no providers available', async () => {
      const result = await integration.executeWithFallback(options);

      expect(result.success).toBe(false);
      expect(result.error).toBe('No healthy providers available');
    });

    it('should work with fallback disabled', async () => {
      const customIntegration = new HybridRouterHealthIntegration(healthMonitor, {
        enabled: false
      });

      const provider = createMockProvider('primary', true, 100, false);
      customIntegration.registerProvider('primary', provider);

      const result = await customIntegration.executeWithFallback(options, 'primary');

      expect(result.success).toBe(true);
      expect(result.fallbackChain).toEqual([]);
    });
  });

  describe('Provider Availability', () => {
    it('should report provider as available when healthy and circuit closed', async () => {
      const provider = createMockProvider('test', true, 100);
      integration.registerProvider('test', provider);

      await integration.forceHealthCheck();

      expect(integration.isProviderAvailable('test')).toBe(true);
    });

    it('should report provider as unavailable when circuit open', async () => {
      const provider = createMockProvider('test', false, 100);
      integration.registerProvider('test', provider);

      // Mock open circuit
      jest.spyOn(healthMonitor, 'getProviderHealth').mockReturnValue({
        providerId: 'test',
        healthy: false,
        latency: 100,
        errorRate: 1,
        availability: 0,
        consecutiveFailures: 5,
        circuitState: 'open',
        lastCheck: new Date(),
        checkCount: 5,
        successCount: 0
      });

      expect(integration.isProviderAvailable('test')).toBe(false);
    });

    it('should report provider as available when circuit half-open', async () => {
      const provider = createMockProvider('test', true, 100);
      integration.registerProvider('test', provider);

      // Mock half-open circuit
      jest.spyOn(healthMonitor, 'getProviderHealth').mockReturnValue({
        providerId: 'test',
        healthy: false,
        latency: 100,
        errorRate: 0.5,
        availability: 0.5,
        consecutiveFailures: 0,
        circuitState: 'half-open',
        lastCheck: new Date(),
        checkCount: 10,
        successCount: 5
      });

      expect(integration.isProviderAvailable('test')).toBe(true);
    });

    it('should report unregistered provider as unavailable', () => {
      expect(integration.isProviderAvailable('nonexistent')).toBe(false);
    });
  });

  describe('Health Summary', () => {
    it('should return health summary for all providers', async () => {
      const provider1 = createMockProvider('provider-1', true, 100);
      const provider2 = createMockProvider('provider-2', true, 200);

      integration.registerProvider('provider-1', provider1);
      integration.registerProvider('provider-2', provider2);

      await integration.forceHealthCheck();

      const summary = integration.getHealthSummary();

      expect(summary.size).toBe(2);
      expect(summary.get('provider-1')?.healthy).toBe(true);
      expect(summary.get('provider-2')?.healthy).toBe(true);
    });

    it('should include health score in summary', async () => {
      const provider = createMockProvider('test', true, 100);
      integration.registerProvider('test', provider);

      await integration.forceHealthCheck();

      const summary = integration.getHealthSummary();
      const testSummary = summary.get('test');

      expect(testSummary?.healthScore).toBeGreaterThan(0);
      expect(testSummary?.healthScore).toBeLessThanOrEqual(1);
    });
  });

  describe('Event Emission', () => {
    it('should emit fallback-success on successful fallback', async () => {
      const successHandler = jest.fn();
      integration.on('fallback-success', successHandler);

      const provider = createMockProvider('test', true, 100, false);
      integration.registerProvider('test', provider);
      await integration.forceHealthCheck();

      await integration.executeWithFallback({
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'test'
      });

      expect(successHandler).toHaveBeenCalled();
    });

    it('should emit provider-failed when provider fails', async () => {
      const failHandler = jest.fn();
      integration.on('provider-failed', failHandler);

      const failingProvider = createMockProvider('failing', true, 100, true);
      const backupProvider = createMockProvider('backup', true, 100, false);

      integration.registerProvider('failing', failingProvider);
      integration.registerProvider('backup', backupProvider);
      await integration.forceHealthCheck();

      await integration.executeWithFallback({
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'test'
      }, 'failing');

      expect(failHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          providerId: 'failing',
          attemptNumber: 1
        })
      );
    });

    it('should emit fallback-exhausted when all providers fail', async () => {
      const exhaustedHandler = jest.fn();
      integration.on('fallback-exhausted', exhaustedHandler);

      const provider1 = createMockProvider('provider-1', true, 100, true);
      const provider2 = createMockProvider('provider-2', true, 100, true);

      integration.registerProvider('provider-1', provider1);
      integration.registerProvider('provider-2', provider2);
      await integration.forceHealthCheck();

      await integration.executeWithFallback({
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'test'
      });

      expect(exhaustedHandler).toHaveBeenCalled();
    });

    it('should re-emit health-change events from monitor', async () => {
      const healthChangeHandler = jest.fn();
      integration.on('health-change', healthChangeHandler);

      const provider = createMockProvider('test', true, 100);
      integration.registerProvider('test', provider);

      // Trigger health check
      await integration.forceHealthCheck();

      // Change provider to unhealthy and check again
      provider.healthCheck.mockResolvedValue({
        healthy: false,
        timestamp: new Date(),
        error: 'Provider down'
      });

      await integration.forceHealthCheck();

      expect(healthChangeHandler).toHaveBeenCalled();
    });
  });

  describe('Last Routing Decision', () => {
    it('should track last routing decision', async () => {
      const provider1 = createMockProvider('provider-1', true, 100, false);
      const provider2 = createMockProvider('provider-2', true, 200, false);

      integration.registerProvider('provider-1', provider1);
      integration.registerProvider('provider-2', provider2);
      await integration.forceHealthCheck();

      await integration.executeWithFallback({
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'test'
      }, 'provider-1');

      const lastDecision = integration.getLastRoutingDecision();

      expect(lastDecision).toBeDefined();
      expect(lastDecision?.primaryProvider).toBe('provider-1');
      expect(lastDecision?.fallbackChain).toContain('provider-2');
    });
  });

  describe('createHealthAwareRouter Factory', () => {
    it('should create integration with health monitor', () => {
      const { healthMonitor: monitor, integration: integ } = createHealthAwareRouter();

      expect(monitor).toBeInstanceOf(ProviderHealthMonitor);
      expect(integ).toBeInstanceOf(HybridRouterHealthIntegration);

      monitor.stopMonitoring();
    });

    it('should accept custom configurations', () => {
      const { healthMonitor: monitor, integration: integ } = createHealthAwareRouter(
        { checkIntervalMs: 10000 },
        { maxAttempts: 5 }
      );

      expect(monitor).toBeDefined();
      expect(integ).toBeDefined();

      monitor.stopMonitoring();
    });
  });

  describe('Health Score Calculation', () => {
    it('should calculate higher score for healthy providers', async () => {
      const healthyProvider = createMockProvider('healthy', true, 100);
      const unhealthyProvider = createMockProvider('unhealthy', false, 100);

      integration.registerProvider('healthy', healthyProvider);
      integration.registerProvider('unhealthy', unhealthyProvider);

      await integration.forceHealthCheck();

      const ranked = integration.getRankedProviders();
      const healthyRank = ranked.find(p => p.providerId === 'healthy');
      const unhealthyRank = ranked.find(p => p.providerId === 'unhealthy');

      expect(healthyRank!.healthScore).toBeGreaterThan(unhealthyRank!.healthScore);
    });

    it('should calculate higher score for lower latency', async () => {
      const fastProvider = createMockProvider('fast', true, 50);
      const slowProvider = createMockProvider('slow', true, 2000);

      integration.registerProvider('fast', fastProvider);
      integration.registerProvider('slow', slowProvider);

      await integration.forceHealthCheck();

      const ranked = integration.getRankedProviders();
      const fastRank = ranked.find(p => p.providerId === 'fast');
      const slowRank = ranked.find(p => p.providerId === 'slow');

      expect(fastRank!.healthScore).toBeGreaterThan(slowRank!.healthScore);
    });
  });
});
