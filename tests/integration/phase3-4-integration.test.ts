/**
 * Phase 3-4 Integration Tests
 *
 * Simple integration tests verifying Phase 3-4 components work together.
 * More detailed testing is done in unit tests for each component.
 */

import {
  ProviderHealthMonitor
} from '../../src/monitoring/ProviderHealthMonitor';
import {
  QuotaManager
} from '../../src/monitoring/QuotaManager';
import {
  HybridRouterHealthIntegration
} from '../../src/providers/HybridRouterHealthIntegration';
import { ILLMProvider, LLMHealthStatus, LLMProviderMetadata } from '../../src/providers/ILLMProvider';

// Mock provider for testing
function createMockProvider(
  name: string,
  healthy: boolean = true,
  latency: number = 0
): jest.Mocked<ILLMProvider> {
  return {
    initialize: jest.fn().mockResolvedValue(undefined),
    complete: jest.fn().mockResolvedValue({
      id: `response-${name}`,
      content: [{ type: 'text', text: `Response from ${name}` }],
      usage: { input_tokens: 10, output_tokens: 20 },
      model: 'mock-model',
      stop_reason: 'end_turn'
    }),
    streamComplete: jest.fn(),
    embed: jest.fn(),
    countTokens: jest.fn().mockResolvedValue(10),
    healthCheck: jest.fn().mockResolvedValue({
      healthy,
      timestamp: new Date(),
      latency
    } as LLMHealthStatus),
    getMetadata: jest.fn().mockReturnValue({
      name,
      version: '1.0.0',
      models: ['mock-model'],
      capabilities: { streaming: true, caching: false, embeddings: true, vision: false },
      costs: { inputPerMillion: 1, outputPerMillion: 2 },
      location: 'cloud'
    } as LLMProviderMetadata),
    shutdown: jest.fn().mockResolvedValue(undefined),
    trackCost: jest.fn().mockReturnValue(0.01)
  };
}

describe('Phase 3-4 Integration', () => {
  describe('ProviderHealthMonitor + QuotaManager', () => {
    it('should coordinate health monitoring and quota tracking', async () => {
      const healthMonitor = new ProviderHealthMonitor({
        checkIntervalMs: 30000,
        failureThreshold: 3
      });

      const quotaManager = new QuotaManager({
        providers: [{
          providerId: 'test-provider',
          dailyLimit: 1000,
          minuteLimit: 10,
          resetTimeUtc: '00:00',
          warningThresholds: [50, 80, 90]
        }]
      });

      try {
        // Register provider for health monitoring
        const mockProvider = createMockProvider('test-provider', true);
        healthMonitor.registerProvider('test-provider', () => mockProvider.healthCheck());

        // Check health
        const healthResult = await healthMonitor.checkProviderHealth('test-provider');
        expect(healthResult.healthy).toBe(true);

        // Track quota
        quotaManager.recordRequest('test-provider');
        expect(quotaManager.canMakeRequest('test-provider')).toBe(true);

        const status = quotaManager.getQuotaStatus('test-provider');
        expect(status?.dailyUsed).toBe(1);
      } finally {
        healthMonitor.stopMonitoring();
        quotaManager.stopCleanup();
      }
    });
  });

  describe('HybridRouterHealthIntegration', () => {
    it('should select best provider and handle fallback', async () => {
      const healthMonitor = new ProviderHealthMonitor();
      const integration = new HybridRouterHealthIntegration(healthMonitor);

      try {
        // Create providers
        const primary = createMockProvider('primary', true, 50);
        const backup = createMockProvider('backup', true, 100);

        // Register providers
        integration.registerProvider('primary', primary);
        integration.registerProvider('backup', backup);

        // Check health
        await integration.forceHealthCheck();

        // Get ranked providers
        const ranked = integration.getRankedProviders();
        expect(ranked.length).toBe(2);
        // Both should be healthy
        expect(ranked.every(p => p.isHealthy)).toBe(true);

        // Test fallback - make primary fail
        primary.complete.mockRejectedValue(new Error('Primary failed'));

        const result = await integration.executeWithFallback({
          messages: [{ role: 'user', content: 'Hello' }],
          model: 'test'
        }, 'primary');

        expect(result.success).toBe(true);
        expect(result.providerId).toBe('backup');
      } finally {
        healthMonitor.stopMonitoring();
      }
    });

    it('should track routing decisions', async () => {
      const healthMonitor = new ProviderHealthMonitor();
      const integration = new HybridRouterHealthIntegration(healthMonitor);

      try {
        const provider = createMockProvider('test', true);
        integration.registerProvider('test', provider);

        await integration.forceHealthCheck();
        await integration.executeWithFallback({
          messages: [{ role: 'user', content: 'Hello' }],
          model: 'test'
        });

        const lastDecision = integration.getLastRoutingDecision();
        expect(lastDecision).toBeDefined();
        expect(lastDecision?.primaryProvider).toBe('test');
      } finally {
        healthMonitor.stopMonitoring();
      }
    });
  });

  describe('Circuit Breaker Coordination', () => {
    it('should open circuit after consecutive failures', async () => {
      const healthMonitor = new ProviderHealthMonitor({
        failureThreshold: 3
      });

      try {
        const failingProvider = createMockProvider('failing', false);
        healthMonitor.registerProvider('failing', () => failingProvider.healthCheck());

        // Trigger failures
        for (let i = 0; i < 5; i++) {
          await healthMonitor.checkProviderHealth('failing');
        }

        const health = healthMonitor.getProviderHealth('failing');
        expect(health?.healthy).toBe(false);
        expect(health?.consecutiveFailures).toBeGreaterThanOrEqual(3);
        expect(health?.circuitState).toBe('open');
      } finally {
        healthMonitor.stopMonitoring();
      }
    });
  });

  describe('Event Coordination', () => {
    it('should emit health change events', async () => {
      const healthMonitor = new ProviderHealthMonitor();
      const integration = new HybridRouterHealthIntegration(healthMonitor);
      const healthChangeHandler = jest.fn();

      integration.on('health-change', healthChangeHandler);

      try {
        // Register healthy provider
        const provider = createMockProvider('test', true);
        integration.registerProvider('test', provider);

        // Check health
        await integration.forceHealthCheck();

        // Make provider unhealthy
        provider.healthCheck.mockResolvedValue({
          healthy: false,
          timestamp: new Date(),
          error: 'Provider down'
        });

        // Check again to trigger event
        await integration.forceHealthCheck();

        expect(healthChangeHandler).toHaveBeenCalled();
      } finally {
        healthMonitor.stopMonitoring();
      }
    });
  });
});

describe('Component Exports', () => {
  it('should export all Phase 3-4 components from providers module', async () => {
    const providers = await import('../../src/providers');

    // Phase 3 exports
    expect(providers.HybridRouterHealthIntegration).toBeDefined();
    expect(providers.createHealthAwareRouter).toBeDefined();

    // Phase 4 exports
    expect(providers.GroqProvider).toBeDefined();
    expect(providers.GitHubModelsProvider).toBeDefined();
  });

  it('should export all Phase 3-4 components from monitoring module', async () => {
    const monitoring = await import('../../src/monitoring/ProviderHealthMonitor');
    const quota = await import('../../src/monitoring/QuotaManager');

    expect(monitoring.ProviderHealthMonitor).toBeDefined();
    expect(quota.QuotaManager).toBeDefined();
    expect(quota.createQuotaManager).toBeDefined();
  });
});
