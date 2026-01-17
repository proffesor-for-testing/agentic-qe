/**
 * Tests for ProviderHealthMonitor
 *
 * Comprehensive test coverage for health monitoring, circuit breaker,
 * error rate tracking, and event emission.
 */

import { ProviderHealthMonitor, ProviderHealthConfig } from '../../src/monitoring/ProviderHealthMonitor';
import { LLMHealthStatus } from '../../src/providers/ILLMProvider';
import { advanceAndFlush } from '../helpers/timerTestUtils';

describe('ProviderHealthMonitor', () => {
  let monitor: ProviderHealthMonitor;
  let mockHealthCheckFn: jest.Mock<Promise<LLMHealthStatus>>;

  beforeEach(() => {
    jest.useFakeTimers();

    // Use shorter intervals for faster tests
    const config: Partial<ProviderHealthConfig> = {
      checkIntervalMs: 100,
      timeoutMs: 500,
      failureThreshold: 3,
      recoveryTimeMs: 200,
      healthyLatencyThresholdMs: 100
    };

    monitor = new ProviderHealthMonitor(config);

    // Create mock health check function
    mockHealthCheckFn = jest.fn<Promise<LLMHealthStatus>, []>();
  });

  afterEach(() => {
    monitor.stopMonitoring();
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  describe('Provider Registration', () => {
    it('should register a provider successfully', () => {
      monitor.registerProvider('test-provider', mockHealthCheckFn);

      const state = monitor.getProviderHealth('test-provider');
      expect(state).toBeDefined();
      expect(state?.providerId).toBe('test-provider');
      expect(state?.healthy).toBe(true);
      expect(state?.circuitState).toBe('closed');
    });

    it('should replace existing provider on re-registration', () => {
      const firstFn = jest.fn<Promise<LLMHealthStatus>, []>();
      const secondFn = jest.fn<Promise<LLMHealthStatus>, []>();

      monitor.registerProvider('test-provider', firstFn);
      monitor.registerProvider('test-provider', secondFn);

      const state = monitor.getProviderHealth('test-provider');
      expect(state).toBeDefined();
    });

    it('should unregister a provider successfully', () => {
      monitor.registerProvider('test-provider', mockHealthCheckFn);
      monitor.unregisterProvider('test-provider');

      const state = monitor.getProviderHealth('test-provider');
      expect(state).toBeUndefined();
    });

    it('should handle unregistering non-existent provider', () => {
      expect(() => {
        monitor.unregisterProvider('non-existent');
      }).not.toThrow();
    });
  });

  describe('Health Check Execution', () => {
    it('should execute health check successfully', async () => {
      mockHealthCheckFn.mockResolvedValue({
        healthy: true,
        latency: 50,
        timestamp: new Date()
      });

      monitor.registerProvider('test-provider', mockHealthCheckFn);

      const result = await monitor.checkProviderHealth('test-provider');

      expect(result.healthy).toBe(true);
      expect(result.providerId).toBe('test-provider');
      expect(result.latency).toBeGreaterThanOrEqual(0); // Can be 0 for instant responses
      expect(mockHealthCheckFn).toHaveBeenCalledTimes(1);
    });

    it('should handle health check failure', async () => {
      mockHealthCheckFn.mockResolvedValue({
        healthy: false,
        error: 'Connection failed',
        timestamp: new Date()
      });

      monitor.registerProvider('test-provider', mockHealthCheckFn);

      const result = await monitor.checkProviderHealth('test-provider');

      expect(result.healthy).toBe(false);
      expect(result.error).toBe('Connection failed');
    });

    it('should timeout slow health checks', async () => {
      mockHealthCheckFn.mockImplementation(() => {
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              healthy: true,
              timestamp: new Date()
            });
          }, 1000); // Longer than timeout
        });
      });

      monitor.registerProvider('test-provider', mockHealthCheckFn);

      // Start the health check (don't await yet)
      const resultPromise = monitor.checkProviderHealth('test-provider');

      // Advance time past the timeout (500ms) but before the mock resolves (1000ms)
      await advanceAndFlush(600);

      const result = await resultPromise;

      expect(result.healthy).toBe(false);
      expect(result.error).toContain('timeout');
    });

    it('should throw error when checking unregistered provider', async () => {
      await expect(
        monitor.checkProviderHealth('non-existent')
      ).rejects.toThrow('Provider non-existent not registered');
    });

    it('should check all providers concurrently', async () => {
      const provider1Fn = jest.fn<Promise<LLMHealthStatus>, []>().mockResolvedValue({
        healthy: true,
        timestamp: new Date()
      });

      const provider2Fn = jest.fn<Promise<LLMHealthStatus>, []>().mockResolvedValue({
        healthy: true,
        timestamp: new Date()
      });

      monitor.registerProvider('provider1', provider1Fn);
      monitor.registerProvider('provider2', provider2Fn);

      const results = await monitor.checkAllProviders();

      expect(results).toHaveLength(2);
      expect(provider1Fn).toHaveBeenCalledTimes(1);
      expect(provider2Fn).toHaveBeenCalledTimes(1);
      expect(results.every(r => r.healthy)).toBe(true);
    });
  });

  describe('Circuit Breaker', () => {
    it('should transition from closed to open after threshold failures', async () => {
      mockHealthCheckFn.mockResolvedValue({
        healthy: false,
        error: 'Service unavailable',
        timestamp: new Date()
      });

      monitor.registerProvider('test-provider', mockHealthCheckFn);

      // Trigger failures up to threshold
      await monitor.checkProviderHealth('test-provider'); // Failure 1
      expect(monitor.getCircuitState('test-provider')).toBe('closed');

      await monitor.checkProviderHealth('test-provider'); // Failure 2
      expect(monitor.getCircuitState('test-provider')).toBe('closed');

      await monitor.checkProviderHealth('test-provider'); // Failure 3 - threshold reached
      expect(monitor.getCircuitState('test-provider')).toBe('open');
    });

    it('should fail fast when circuit is open', async () => {
      mockHealthCheckFn.mockResolvedValue({
        healthy: false,
        error: 'Service unavailable',
        timestamp: new Date()
      });

      monitor.registerProvider('test-provider', mockHealthCheckFn);

      // Open the circuit
      await monitor.checkProviderHealth('test-provider');
      await monitor.checkProviderHealth('test-provider');
      await monitor.checkProviderHealth('test-provider');

      expect(monitor.getCircuitState('test-provider')).toBe('open');

      // Reset call count
      mockHealthCheckFn.mockClear();

      // Next check should fail fast without calling health check
      const result = await monitor.checkProviderHealth('test-provider');

      expect(result.healthy).toBe(false);
      expect(result.error).toBe('Circuit breaker is open');
      expect(mockHealthCheckFn).not.toHaveBeenCalled();
    });

    it('should transition to half-open after recovery time', async () => {
      mockHealthCheckFn.mockResolvedValue({
        healthy: false,
        error: 'Service unavailable',
        timestamp: new Date()
      });

      monitor.registerProvider('test-provider', mockHealthCheckFn);

      // Open the circuit
      await monitor.checkProviderHealth('test-provider');
      await monitor.checkProviderHealth('test-provider');
      await monitor.checkProviderHealth('test-provider');

      expect(monitor.getCircuitState('test-provider')).toBe('open');

      // Advance past recovery time (200ms)
      await advanceAndFlush(250);

      // Mock successful response for recovery attempt
      mockHealthCheckFn.mockResolvedValue({
        healthy: true,
        latency: 50,
        timestamp: new Date()
      });

      // Next check should transition to half-open
      await monitor.checkProviderHealth('test-provider');

      const state = monitor.getProviderHealth('test-provider');
      expect(state?.circuitState).toBe('closed'); // Should close after successful half-open check
    });

    it('should close circuit after successful check in half-open state', async () => {
      monitor.registerProvider('test-provider', mockHealthCheckFn);

      // Manually force circuit open
      monitor.forceCircuitOpen('test-provider');
      expect(monitor.getCircuitState('test-provider')).toBe('open');

      // Advance past recovery time (200ms)
      await advanceAndFlush(250);

      // Mock successful health check
      mockHealthCheckFn.mockResolvedValue({
        healthy: true,
        latency: 50,
        timestamp: new Date()
      });

      // Should transition to half-open, then close on success
      await monitor.checkProviderHealth('test-provider');

      expect(monitor.getCircuitState('test-provider')).toBe('closed');
    });

    it('should support manual circuit opening', () => {
      monitor.registerProvider('test-provider', mockHealthCheckFn);

      monitor.forceCircuitOpen('test-provider');

      expect(monitor.getCircuitState('test-provider')).toBe('open');
    });

    it('should support manual circuit reset', async () => {
      mockHealthCheckFn.mockResolvedValue({
        healthy: false,
        error: 'Service unavailable',
        timestamp: new Date()
      });

      monitor.registerProvider('test-provider', mockHealthCheckFn);

      // Open the circuit
      await monitor.checkProviderHealth('test-provider');
      await monitor.checkProviderHealth('test-provider');
      await monitor.checkProviderHealth('test-provider');

      expect(monitor.getCircuitState('test-provider')).toBe('open');

      // Reset circuit
      monitor.resetCircuit('test-provider');

      expect(monitor.getCircuitState('test-provider')).toBe('closed');

      const state = monitor.getProviderHealth('test-provider');
      expect(state?.consecutiveFailures).toBe(0);
    });

    it('should throw error when forcing open non-existent provider', () => {
      expect(() => {
        monitor.forceCircuitOpen('non-existent');
      }).toThrow('Provider non-existent not registered');
    });

    it('should throw error when resetting non-existent provider', () => {
      expect(() => {
        monitor.resetCircuit('non-existent');
      }).toThrow('Provider non-existent not registered');
    });
  });

  describe('Error Rate and Availability Tracking', () => {
    it('should calculate error rate correctly', async () => {
      monitor.registerProvider('test-provider', mockHealthCheckFn);

      // 7 successes, 3 failures = 30% error rate
      for (let i = 0; i < 7; i++) {
        mockHealthCheckFn.mockResolvedValue({
          healthy: true,
          timestamp: new Date()
        });
        await monitor.checkProviderHealth('test-provider');
      }

      for (let i = 0; i < 3; i++) {
        mockHealthCheckFn.mockResolvedValue({
          healthy: false,
          error: 'Intermittent failure',
          timestamp: new Date()
        });
        await monitor.checkProviderHealth('test-provider');
      }

      const state = monitor.getProviderHealth('test-provider');
      expect(state?.errorRate).toBeCloseTo(0.3, 1);
      expect(state?.availability).toBeCloseTo(0.7, 1);
      expect(state?.checkCount).toBe(10);
      expect(state?.successCount).toBe(7);
    });

    it('should reset consecutive failures on success', async () => {
      monitor.registerProvider('test-provider', mockHealthCheckFn);

      // Two failures
      mockHealthCheckFn.mockResolvedValue({
        healthy: false,
        error: 'Failure',
        timestamp: new Date()
      });
      await monitor.checkProviderHealth('test-provider');
      await monitor.checkProviderHealth('test-provider');

      let state = monitor.getProviderHealth('test-provider');
      expect(state?.consecutiveFailures).toBe(2);

      // Success should reset consecutive failures
      mockHealthCheckFn.mockResolvedValue({
        healthy: true,
        timestamp: new Date()
      });
      await monitor.checkProviderHealth('test-provider');

      state = monitor.getProviderHealth('test-provider');
      expect(state?.consecutiveFailures).toBe(0);
    });

    it('should consider high latency as unhealthy', async () => {
      mockHealthCheckFn.mockImplementation(() => {
        // Simulate slow response with setTimeout
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              healthy: true,
              timestamp: new Date()
            });
          }, 150);
        });
      });

      monitor.registerProvider('test-provider', mockHealthCheckFn);

      // Start the health check (don't await yet)
      const resultPromise = monitor.checkProviderHealth('test-provider');

      // Advance time to allow the mock to resolve
      await advanceAndFlush(150);

      const result = await resultPromise;

      // Should be marked unhealthy due to latency > threshold (100ms)
      expect(result.healthy).toBe(false);
      expect(result.latency).toBeGreaterThan(100);
    });
  });

  describe('Health State Queries', () => {
    it('should return provider health state', async () => {
      mockHealthCheckFn.mockResolvedValue({
        healthy: true,
        latency: 50,
        timestamp: new Date()
      });

      monitor.registerProvider('test-provider', mockHealthCheckFn);
      await monitor.checkProviderHealth('test-provider');

      const state = monitor.getProviderHealth('test-provider');

      expect(state).toBeDefined();
      expect(state?.providerId).toBe('test-provider');
      expect(state?.healthy).toBe(true);
      expect(state?.latency).toBeGreaterThanOrEqual(0); // Can be 0 for instant responses
      expect(state?.circuitState).toBe('closed');
      expect(state?.checkCount).toBe(1);
    });

    it('should return all provider health states', async () => {
      const provider1Fn = jest.fn<Promise<LLMHealthStatus>, []>().mockResolvedValue({
        healthy: true,
        timestamp: new Date()
      });

      const provider2Fn = jest.fn<Promise<LLMHealthStatus>, []>().mockResolvedValue({
        healthy: false,
        error: 'Unavailable',
        timestamp: new Date()
      });

      monitor.registerProvider('provider1', provider1Fn);
      monitor.registerProvider('provider2', provider2Fn);

      await monitor.checkAllProviders();

      const allHealth = monitor.getAllProviderHealth();

      expect(allHealth.size).toBe(2);
      expect(allHealth.get('provider1')?.healthy).toBe(true);
      expect(allHealth.get('provider2')?.healthy).toBe(false);
    });

    it('should return list of healthy providers', async () => {
      const provider1Fn = jest.fn<Promise<LLMHealthStatus>, []>().mockResolvedValue({
        healthy: true,
        timestamp: new Date()
      });

      const provider2Fn = jest.fn<Promise<LLMHealthStatus>, []>().mockResolvedValue({
        healthy: false,
        error: 'Unavailable',
        timestamp: new Date()
      });

      const provider3Fn = jest.fn<Promise<LLMHealthStatus>, []>().mockResolvedValue({
        healthy: true,
        timestamp: new Date()
      });

      monitor.registerProvider('provider1', provider1Fn);
      monitor.registerProvider('provider2', provider2Fn);
      monitor.registerProvider('provider3', provider3Fn);

      await monitor.checkAllProviders();

      const healthyProviders = monitor.getHealthyProviders();

      expect(healthyProviders).toEqual(['provider1', 'provider3']);
    });

    it('should check if provider is healthy', async () => {
      mockHealthCheckFn.mockResolvedValue({
        healthy: true,
        timestamp: new Date()
      });

      monitor.registerProvider('test-provider', mockHealthCheckFn);
      await monitor.checkProviderHealth('test-provider');

      expect(monitor.isProviderHealthy('test-provider')).toBe(true);
    });

    it('should return false for unhealthy provider', async () => {
      mockHealthCheckFn.mockResolvedValue({
        healthy: false,
        error: 'Unavailable',
        timestamp: new Date()
      });

      monitor.registerProvider('test-provider', mockHealthCheckFn);
      await monitor.checkProviderHealth('test-provider');

      expect(monitor.isProviderHealthy('test-provider')).toBe(false);
    });

    it('should return false for non-existent provider', () => {
      expect(monitor.isProviderHealthy('non-existent')).toBe(false);
    });
  });

  describe('Event Emission', () => {
    it('should emit health-change event when health status changes', async () => {
      const healthChangeHandler = jest.fn();
      monitor.on('health-change', healthChangeHandler);

      monitor.registerProvider('test-provider', mockHealthCheckFn);

      // Start healthy
      mockHealthCheckFn.mockResolvedValue({
        healthy: true,
        timestamp: new Date()
      });
      await monitor.checkProviderHealth('test-provider');

      // Change to unhealthy
      mockHealthCheckFn.mockResolvedValue({
        healthy: false,
        error: 'Failure',
        timestamp: new Date()
      });
      await monitor.checkProviderHealth('test-provider');

      expect(healthChangeHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          providerId: 'test-provider',
          healthy: false,
          previousHealthy: true
        })
      );
    });

    it('should emit circuit-change event on state transitions', async () => {
      const circuitChangeHandler = jest.fn();
      monitor.on('circuit-change', circuitChangeHandler);

      mockHealthCheckFn.mockResolvedValue({
        healthy: false,
        error: 'Failure',
        timestamp: new Date()
      });

      monitor.registerProvider('test-provider', mockHealthCheckFn);

      // Trigger circuit opening
      await monitor.checkProviderHealth('test-provider');
      await monitor.checkProviderHealth('test-provider');
      await monitor.checkProviderHealth('test-provider');

      expect(circuitChangeHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          providerId: 'test-provider',
          circuitState: 'open',
          previousState: 'closed'
        })
      );
    });

    it('should not emit events when status unchanged', async () => {
      const healthChangeHandler = jest.fn();
      monitor.on('health-change', healthChangeHandler);

      mockHealthCheckFn.mockResolvedValue({
        healthy: true,
        timestamp: new Date()
      });

      monitor.registerProvider('test-provider', mockHealthCheckFn);

      await monitor.checkProviderHealth('test-provider');
      await monitor.checkProviderHealth('test-provider');
      await monitor.checkProviderHealth('test-provider');

      // Should not emit events since health didn't change
      expect(healthChangeHandler).not.toHaveBeenCalled();
    });
  });

  describe('Automatic Monitoring', () => {
    it('should start monitoring successfully', () => {
      expect(() => {
        monitor.startMonitoring();
      }).not.toThrow();
    });

    it('should stop monitoring successfully', () => {
      monitor.startMonitoring();

      expect(() => {
        monitor.stopMonitoring();
      }).not.toThrow();
    });

    it('should perform periodic health checks', async () => {
      mockHealthCheckFn.mockResolvedValue({
        healthy: true,
        timestamp: new Date()
      });

      monitor.registerProvider('test-provider', mockHealthCheckFn);

      monitor.startMonitoring();

      // Advance time for multiple check intervals (checkIntervalMs = 100ms)
      await advanceAndFlush(350);

      monitor.stopMonitoring();

      // Should have performed multiple checks (initial + periodic)
      expect(mockHealthCheckFn.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it('should handle repeated start calls gracefully', () => {
      monitor.startMonitoring();
      monitor.startMonitoring(); // Second call should be ignored

      expect(() => {
        monitor.stopMonitoring();
      }).not.toThrow();
    });

    it('should handle repeated stop calls gracefully', () => {
      monitor.startMonitoring();
      monitor.stopMonitoring();
      monitor.stopMonitoring(); // Second call should be ignored

      expect(true).toBe(true); // No exception thrown
    });
  });

  describe('Edge Cases', () => {
    it('should handle health check with no latency metadata', async () => {
      mockHealthCheckFn.mockResolvedValue({
        healthy: true,
        timestamp: new Date()
        // No latency provided
      });

      monitor.registerProvider('test-provider', mockHealthCheckFn);

      const result = await monitor.checkProviderHealth('test-provider');

      expect(result.healthy).toBe(true);
      expect(result.latency).toBeGreaterThanOrEqual(0); // Should measure latency itself (can be 0)
    });

    it('should handle concurrent health checks for same provider', async () => {
      mockHealthCheckFn.mockImplementation(() => {
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              healthy: true,
              timestamp: new Date()
            });
          }, 50);
        });
      });

      monitor.registerProvider('test-provider', mockHealthCheckFn);

      // Execute multiple checks concurrently (don't await yet)
      const resultsPromise = Promise.all([
        monitor.checkProviderHealth('test-provider'),
        monitor.checkProviderHealth('test-provider'),
        monitor.checkProviderHealth('test-provider')
      ]);

      // Advance time to allow all mocks to resolve
      await advanceAndFlush(50);

      const results = await resultsPromise;

      expect(results).toHaveLength(3);
      expect(results.every(r => r.healthy)).toBe(true);
    });

    it('should return empty array when checking all providers with none registered', async () => {
      const results = await monitor.checkAllProviders();

      expect(results).toEqual([]);
    });

    it('should get circuit state as closed for unregistered provider', () => {
      expect(monitor.getCircuitState('non-existent')).toBe('closed');
    });
  });
});
