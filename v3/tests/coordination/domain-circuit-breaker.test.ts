/**
 * Unit tests for Domain Circuit Breaker and Domain Breaker Registry
 * ADR-064, Phase 2D: Validates circuit breaker state machine and registry behavior
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  DomainCircuitBreaker,
  DomainCircuitOpenError,
  DEFAULT_DOMAIN_BREAKER_CONFIG,
} from '../../src/coordination/circuit-breaker/domain-circuit-breaker.js';
import {
  DomainBreakerRegistry,
  DOMAIN_CRITICALITY,
  DOMAIN_CRITICALITY_CONFIGS,
} from '../../src/coordination/circuit-breaker/breaker-registry.js';

// ============================================================================
// DomainCircuitBreaker Tests
// ============================================================================

describe('DomainCircuitBreaker', () => {
  let breaker: DomainCircuitBreaker;

  beforeEach(() => {
    vi.useFakeTimers();
    breaker = new DomainCircuitBreaker('test-generation', {
      failureThreshold: 3,
      resetTimeoutMs: 60_000,
      halfOpenSuccessThreshold: 2,
      failureWindowMs: 120_000,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts in closed state', () => {
    expect(breaker.getState()).toBe('closed');
  });

  it('canExecute returns true when closed', () => {
    expect(breaker.canExecute()).toBe(true);
  });

  it('records success, stays closed', () => {
    breaker.recordSuccess();
    expect(breaker.getState()).toBe('closed');
    const stats = breaker.getStats();
    expect(stats.successCount).toBe(1);
  });

  it('records failure, stays closed below threshold', () => {
    breaker.recordFailure(new Error('fail 1'));
    breaker.recordFailure(new Error('fail 2'));
    expect(breaker.getState()).toBe('closed');
    const stats = breaker.getStats();
    expect(stats.failureCount).toBe(2);
  });

  it('opens after failureThreshold failures', () => {
    breaker.recordFailure(new Error('fail 1'));
    breaker.recordFailure(new Error('fail 2'));
    breaker.recordFailure(new Error('fail 3'));
    expect(breaker.getState()).toBe('open');
  });

  it('canExecute returns false when open', () => {
    breaker.recordFailure(new Error('f1'));
    breaker.recordFailure(new Error('f2'));
    breaker.recordFailure(new Error('f3'));
    expect(breaker.getState()).toBe('open');
    expect(breaker.canExecute()).toBe(false);
  });

  it('execute throws DomainCircuitOpenError when open', async () => {
    breaker.recordFailure(new Error('f1'));
    breaker.recordFailure(new Error('f2'));
    breaker.recordFailure(new Error('f3'));
    expect(breaker.getState()).toBe('open');

    await expect(
      breaker.execute(() => Promise.resolve('ok')),
    ).rejects.toThrow(DomainCircuitOpenError);
  });

  it('DomainCircuitOpenError has domain and retryAfterMs', async () => {
    breaker.recordFailure(new Error('f1'));
    breaker.recordFailure(new Error('f2'));
    breaker.recordFailure(new Error('f3'));

    try {
      await breaker.execute(() => Promise.resolve('ok'));
      // Should not reach here
      expect.fail('Expected DomainCircuitOpenError');
    } catch (err) {
      expect(err).toBeInstanceOf(DomainCircuitOpenError);
      const openErr = err as DomainCircuitOpenError;
      expect(openErr.domain).toBe('test-generation');
      expect(openErr.retryAfterMs).toBeDefined();
      expect(typeof openErr.retryAfterMs).toBe('number');
    }
  });

  it('transitions from open to half-open after resetTimeoutMs', () => {
    breaker.recordFailure(new Error('f1'));
    breaker.recordFailure(new Error('f2'));
    breaker.recordFailure(new Error('f3'));
    expect(breaker.getState()).toBe('open');

    // Advance time past resetTimeoutMs
    vi.advanceTimersByTime(60_001);
    expect(breaker.getState()).toBe('half-open');
  });

  it('half-open: success increments counter', () => {
    // Open the breaker
    breaker.recordFailure(new Error('f1'));
    breaker.recordFailure(new Error('f2'));
    breaker.recordFailure(new Error('f3'));
    expect(breaker.getState()).toBe('open');

    // Transition to half-open
    vi.advanceTimersByTime(60_001);
    expect(breaker.getState()).toBe('half-open');

    // Record one success, still half-open
    breaker.recordSuccess();
    expect(breaker.getState()).toBe('half-open');
    expect(breaker.getStats().consecutiveSuccesses).toBe(1);
  });

  it('half-open: closes after halfOpenSuccessThreshold successes', () => {
    // Open the breaker
    breaker.recordFailure(new Error('f1'));
    breaker.recordFailure(new Error('f2'));
    breaker.recordFailure(new Error('f3'));

    // Transition to half-open
    vi.advanceTimersByTime(60_001);
    expect(breaker.getState()).toBe('half-open');

    // Meet the threshold (2 successes)
    breaker.recordSuccess();
    breaker.recordSuccess();
    expect(breaker.getState()).toBe('closed');
  });

  it('half-open: opens on any failure', () => {
    // Open the breaker
    breaker.recordFailure(new Error('f1'));
    breaker.recordFailure(new Error('f2'));
    breaker.recordFailure(new Error('f3'));

    // Transition to half-open
    vi.advanceTimersByTime(60_001);
    expect(breaker.getState()).toBe('half-open');

    // One success then a failure
    breaker.recordSuccess();
    breaker.recordFailure(new Error('half-open fail'));
    expect(breaker.getState()).toBe('open');
  });

  it('old failures outside window are cleaned', () => {
    // Record 2 failures
    breaker.recordFailure(new Error('old fail 1'));
    breaker.recordFailure(new Error('old fail 2'));

    // Advance past failureWindowMs (120s)
    vi.advanceTimersByTime(121_000);

    // Record one more failure -- old failures should be cleaned
    breaker.recordFailure(new Error('new fail'));

    // Should still be closed since only 1 failure in the window
    expect(breaker.getState()).toBe('closed');
  });

  it('reset() returns to closed state', () => {
    breaker.recordFailure(new Error('f1'));
    breaker.recordFailure(new Error('f2'));
    breaker.recordFailure(new Error('f3'));
    expect(breaker.getState()).toBe('open');

    breaker.reset();
    expect(breaker.getState()).toBe('closed');
    expect(breaker.canExecute()).toBe(true);
  });

  it('forceOpen() forces open', () => {
    expect(breaker.getState()).toBe('closed');
    breaker.forceOpen();
    expect(breaker.getState()).toBe('open');
    expect(breaker.canExecute()).toBe(false);
  });

  it('getStats returns correct counts', () => {
    breaker.recordSuccess();
    breaker.recordSuccess();
    breaker.recordFailure(new Error('one fail'));

    const stats = breaker.getStats();
    expect(stats.domain).toBe('test-generation');
    expect(stats.state).toBe('closed');
    expect(stats.successCount).toBe(2);
    expect(stats.failureCount).toBe(1);
    expect(stats.lastSuccessTime).toBeDefined();
    expect(stats.lastFailureTime).toBeDefined();
  });

  it('getRecentFailures returns last N failures', () => {
    breaker.recordFailure(new Error('fail A'));
    breaker.recordFailure(new Error('fail B'));
    breaker.recordFailure(new Error('fail C'));
    // Breaker is now open; test getRecentFailures

    const recent = breaker.getRecentFailures(2);
    expect(recent).toHaveLength(2);
    // Most recent should be last
    expect(recent[1]).toContain('fail C');
    expect(recent[0]).toContain('fail B');
  });

  it('onStateChange fires callback on transitions', () => {
    const handler = vi.fn();
    breaker.onStateChange(handler);

    // Trigger closed -> open
    breaker.recordFailure(new Error('f1'));
    breaker.recordFailure(new Error('f2'));
    breaker.recordFailure(new Error('f3'));

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'state-change',
        domain: 'test-generation',
        previousState: 'closed',
        newState: 'open',
      }),
    );
  });

  it('onStateChange unsubscribe works', () => {
    const handler = vi.fn();
    const unsubscribe = breaker.onStateChange(handler);

    unsubscribe();

    // Trigger a transition; handler should NOT fire
    breaker.recordFailure(new Error('f1'));
    breaker.recordFailure(new Error('f2'));
    breaker.recordFailure(new Error('f3'));

    expect(handler).not.toHaveBeenCalled();
  });
});

// ============================================================================
// DomainBreakerRegistry Tests
// ============================================================================

describe('DomainBreakerRegistry', () => {
  let registry: DomainBreakerRegistry;

  beforeEach(() => {
    vi.useFakeTimers();
    registry = new DomainBreakerRegistry();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('getBreaker creates breaker lazily', () => {
    const breaker = registry.getBreaker('test-generation');
    expect(breaker).toBeDefined();
    expect(breaker.domain).toBe('test-generation');
    expect(breaker.getState()).toBe('closed');
  });

  it('getBreaker returns same instance for same domain', () => {
    const first = registry.getBreaker('test-generation');
    const second = registry.getBreaker('test-generation');
    expect(first).toBe(second);
  });

  it('configureBreaker overrides config', () => {
    registry.configureBreaker('test-generation', { failureThreshold: 10 });
    const breaker = registry.getBreaker('test-generation');
    expect(breaker.getConfig().failureThreshold).toBe(10);
  });

  it('configureCriticality applies preset', () => {
    registry.configureCriticality('my-domain', 'critical');
    const breaker = registry.getBreaker('my-domain');
    const config = breaker.getConfig();
    expect(config.failureThreshold).toBe(DOMAIN_CRITICALITY_CONFIGS.critical.failureThreshold);
    expect(config.resetTimeoutMs).toBe(DOMAIN_CRITICALITY_CONFIGS.critical.resetTimeoutMs);
  });

  it('canExecuteInDomain delegates correctly', () => {
    expect(registry.canExecuteInDomain('test-generation')).toBe(true);

    // Force open
    registry.getBreaker('test-generation').forceOpen();
    expect(registry.canExecuteInDomain('test-generation')).toBe(false);
  });

  it('getOpenDomains returns only open domains', () => {
    registry.getBreaker('domain-a');
    registry.getBreaker('domain-b');
    registry.getBreaker('domain-c');

    registry.getBreaker('domain-b').forceOpen();

    const open = registry.getOpenDomains();
    expect(open).toContain('domain-b');
    expect(open).not.toContain('domain-a');
    expect(open).not.toContain('domain-c');
  });

  it('getHealthyDomains returns only closed domains', () => {
    registry.getBreaker('domain-a');
    registry.getBreaker('domain-b');

    registry.getBreaker('domain-b').forceOpen();

    const healthy = registry.getHealthyDomains();
    expect(healthy).toContain('domain-a');
    expect(healthy).not.toContain('domain-b');
  });

  it('getDegradedDomains returns only half-open domains', () => {
    // Create a breaker and force it to half-open via open -> time advance
    const breaker = registry.getBreaker('domain-x');
    breaker.forceOpen();
    // Advance past the default reset timeout
    vi.advanceTimersByTime(DEFAULT_DOMAIN_BREAKER_CONFIG.resetTimeoutMs + 1);

    expect(breaker.getState()).toBe('half-open');

    const degraded = registry.getDegradedDomains();
    expect(degraded).toContain('domain-x');
  });

  it('getHealthSummary returns correct counts', () => {
    // Create 3 domains: 1 closed, 1 open, 1 half-open
    registry.getBreaker('healthy-domain');

    // Configure open-domain with a very long reset timeout so it stays open
    registry.configureBreaker('open-domain', { resetTimeoutMs: 600_000 });
    registry.getBreaker('open-domain').forceOpen();

    // Configure half-open-domain with a short reset timeout
    registry.configureBreaker('half-open-domain', { resetTimeoutMs: 10_000 });
    registry.getBreaker('half-open-domain').forceOpen();

    // Advance enough for half-open-domain to transition, but not open-domain
    vi.advanceTimersByTime(10_001);

    expect(registry.getBreaker('half-open-domain').getState()).toBe('half-open');
    expect(registry.getBreaker('open-domain').getState()).toBe('open');

    const summary = registry.getHealthSummary();
    expect(summary.healthy).toBe(1);
    expect(summary.open).toBe(1);
    expect(summary.degraded).toBe(1);
    expect(summary.total).toBe(3);
  });

  it('resetAll resets all breakers', () => {
    registry.getBreaker('domain-a').forceOpen();
    registry.getBreaker('domain-b').forceOpen();

    expect(registry.getOpenDomains()).toHaveLength(2);

    registry.resetAll();

    expect(registry.getOpenDomains()).toHaveLength(0);
    expect(registry.getHealthyDomains()).toHaveLength(2);
  });

  it('onAnyStateChange fires for any domain', () => {
    const handler = vi.fn();
    registry.onAnyStateChange(handler);

    // Force open domain-a
    registry.getBreaker('domain-a').forceOpen();

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'state-change',
        domain: 'domain-a',
        newState: 'open',
      }),
    );

    // Force open domain-b
    registry.getBreaker('domain-b').forceOpen();

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'state-change',
        domain: 'domain-b',
        newState: 'open',
      }),
    );

    expect(handler.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('DOMAIN_CRITICALITY maps all 13 domains', () => {
    const domains = Object.keys(DOMAIN_CRITICALITY);
    expect(domains).toHaveLength(13);

    const expectedDomains = [
      'test-generation',
      'test-execution',
      'coverage-analysis',
      'quality-assessment',
      'security-compliance',
      'defect-intelligence',
      'requirements-validation',
      'code-intelligence',
      'contract-testing',
      'visual-accessibility',
      'chaos-resilience',
      'learning-optimization',
      'enterprise-integration',
    ];

    for (const domain of expectedDomains) {
      expect(DOMAIN_CRITICALITY).toHaveProperty(domain);
      expect(['critical', 'standard', 'lenient']).toContain(DOMAIN_CRITICALITY[domain]);
    }
  });
});
