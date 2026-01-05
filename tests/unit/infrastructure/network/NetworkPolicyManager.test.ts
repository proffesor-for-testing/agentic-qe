/**
 * Unit tests for NetworkPolicyManager
 *
 * @module tests/unit/infrastructure/network/NetworkPolicyManager.test
 * @see Issue #146 - Security Hardening: SP-3 Network Policy Enforcement
 */

import {
  NetworkPolicyManager,
  createNetworkPolicyManager,
} from '../../../../src/infrastructure/network/NetworkPolicyManager.js';
import type {
  NetworkPolicy,
  NetworkPolicyEvent,
  PolicyCheckResult,
} from '../../../../src/infrastructure/network/types.js';
import { DEFAULT_NETWORK_POLICIES } from '../../../../src/infrastructure/network/policies/default-policies.js';

describe('NetworkPolicyManager', () => {
  let manager: NetworkPolicyManager;

  beforeEach(async () => {
    manager = new NetworkPolicyManager({ debug: false });
    await manager.initialize();
  });

  afterEach(async () => {
    await manager.shutdown();
  });

  describe('constructor and initialization', () => {
    it('should create manager with default config', async () => {
      const mgr = new NetworkPolicyManager();
      await mgr.initialize();
      expect(mgr.listPolicies().length).toBeGreaterThan(0);
      await mgr.shutdown();
    });

    it('should load default policies on initialize', async () => {
      const policies = manager.listPolicies();
      expect(policies).toContain('qe-test-generator');
      expect(policies).toContain('qe-security-scanner');
      expect(policies).toContain('default');
    });

    it('should not re-initialize if already initialized', async () => {
      const mgr = new NetworkPolicyManager();
      await mgr.initialize();
      await mgr.initialize(); // Second call should be no-op
      expect(mgr.listPolicies().length).toBeGreaterThan(0);
      await mgr.shutdown();
    });
  });

  describe('registerPolicy', () => {
    it('should register a custom policy', () => {
      const customPolicy: NetworkPolicy = {
        agentType: 'custom-agent',
        allowedDomains: ['custom.example.com'],
        rateLimit: {
          requestsPerMinute: 100,
          requestsPerHour: 2000,
          burstSize: 20,
        },
        auditLogging: true,
        blockUnknownDomains: true,
        timeoutMs: 30000,
      };

      manager.registerPolicy(customPolicy);

      const policies = manager.listPolicies();
      expect(policies).toContain('custom-agent');
    });

    it('should override existing policy', () => {
      const newPolicy: NetworkPolicy = {
        agentType: 'qe-test-generator',
        allowedDomains: ['new.example.com'],
        rateLimit: {
          requestsPerMinute: 999,
          requestsPerHour: 9999,
          burstSize: 99,
        },
        auditLogging: false,
        blockUnknownDomains: false,
      };

      manager.registerPolicy(newPolicy);

      const policy = manager.getPolicy('qe-test-generator');
      expect(policy.allowedDomains).toContain('new.example.com');
      expect(policy.rateLimit.requestsPerMinute).toBe(999);
    });
  });

  describe('getPolicy', () => {
    it('should return policy for known agent type', () => {
      const policy = manager.getPolicy('qe-test-generator');
      expect(policy.agentType).toBe('qe-test-generator');
      expect(policy.allowedDomains).toContain('api.anthropic.com');
    });

    it('should return default policy for unknown agent type', () => {
      const policy = manager.getPolicy('unknown-agent');
      expect(policy.agentType).toBe('default');
    });
  });

  describe('checkRequest', () => {
    it('should allow request to whitelisted domain', async () => {
      const result = await manager.checkRequest(
        'agent-123',
        'qe-test-generator',
        'api.anthropic.com'
      );

      expect(result.allowed).toBe(true);
      expect(result.policy.agentType).toBe('qe-test-generator');
    });

    it('should block request to non-whitelisted domain', async () => {
      const result = await manager.checkRequest(
        'agent-123',
        'qe-test-generator',
        'blocked.example.com'
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('domain_not_allowed');
      expect(result.details).toContain('blocked.example.com');
    });

    it('should enforce rate limiting', async () => {
      // Register a policy with very low rate limit
      const limitedPolicy: NetworkPolicy = {
        agentType: 'rate-limited-agent',
        allowedDomains: ['example.com'],
        rateLimit: {
          requestsPerMinute: 2,
          requestsPerHour: 10,
          burstSize: 2,
        },
        auditLogging: true,
        blockUnknownDomains: true,
      };
      manager.registerPolicy(limitedPolicy);

      // Make requests up to limit
      await manager.checkRequest('agent-1', 'rate-limited-agent', 'example.com');
      await manager.recordRequest('agent-1', 'rate-limited-agent', 'example.com', true);
      await manager.checkRequest('agent-1', 'rate-limited-agent', 'example.com');
      await manager.recordRequest('agent-1', 'rate-limited-agent', 'example.com', true);

      // Third request should be rate limited
      const result = await manager.checkRequest('agent-1', 'rate-limited-agent', 'example.com');
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('rate_limit_exceeded');
    });

    it('should use default policy for unknown agent type', async () => {
      const result = await manager.checkRequest(
        'agent-unknown',
        'unknown-agent-type',
        'api.anthropic.com'
      );

      expect(result.allowed).toBe(true);
      expect(result.policy.agentType).toBe('default');
    });
  });

  describe('recordRequest', () => {
    it('should consume rate limit token', async () => {
      await manager.recordRequest('agent-1', 'qe-test-generator', 'api.anthropic.com', true);

      const status = manager.getRateLimitStatus('agent-1', 'qe-test-generator');
      expect(status.currentRate).toBe(1);
    });

    it('should log to audit logger', async () => {
      await manager.recordRequest('agent-1', 'qe-test-generator', 'api.anthropic.com', true, 150);

      const auditLogger = manager.getAuditLogger();
      const recent = auditLogger.getRecent(1);
      expect(recent[0].domain).toBe('api.anthropic.com');
      expect(recent[0].responseTimeMs).toBe(150);
    });
  });

  describe('updatePolicy', () => {
    it('should update existing policy', () => {
      manager.updatePolicy('qe-test-generator', {
        allowedDomains: ['new-domain.com'],
      });

      const policy = manager.getPolicy('qe-test-generator');
      expect(policy.allowedDomains).toContain('new-domain.com');
    });

    it('should emit policy_updated event', () => {
      const events: NetworkPolicyEvent[] = [];
      manager.on((event) => events.push(event));

      manager.updatePolicy('qe-test-generator', {
        timeoutMs: 60000,
      });

      expect(events.some((e) => e.type === 'policy_updated')).toBe(true);
    });

    it('should merge rate limit config', () => {
      const originalPolicy = manager.getPolicy('qe-test-generator');
      const originalBurstSize = originalPolicy.rateLimit.burstSize;

      manager.updatePolicy('qe-test-generator', {
        rateLimit: {
          requestsPerMinute: 999,
          requestsPerHour: 9999,
          burstSize: originalBurstSize,
        },
      });

      const updated = manager.getPolicy('qe-test-generator');
      expect(updated.rateLimit.requestsPerMinute).toBe(999);
      expect(updated.rateLimit.burstSize).toBe(originalBurstSize);
    });
  });

  describe('getRateLimitStatus', () => {
    it('should return current rate limit status', () => {
      const status = manager.getRateLimitStatus('agent-1', 'qe-test-generator');

      expect(status).toHaveProperty('limited');
      expect(status).toHaveProperty('currentRate');
      expect(status).toHaveProperty('remaining');
      expect(status).toHaveProperty('resetIn');
    });
  });

  describe('resetRateLimit', () => {
    it('should reset rate limit for agent', async () => {
      await manager.recordRequest('agent-1', 'qe-test-generator', 'api.anthropic.com', true);
      await manager.recordRequest('agent-1', 'qe-test-generator', 'api.anthropic.com', true);

      expect(manager.getRateLimitStatus('agent-1', 'qe-test-generator').currentRate).toBe(2);

      manager.resetRateLimit('agent-1', 'qe-test-generator');

      expect(manager.getRateLimitStatus('agent-1', 'qe-test-generator').currentRate).toBe(0);
    });
  });

  describe('event handling', () => {
    it('should emit events on blocked request', async () => {
      const events: NetworkPolicyEvent[] = [];
      manager.on((event) => events.push(event));

      await manager.checkRequest('agent-1', 'qe-test-generator', 'blocked.example.com');

      expect(events.length).toBeGreaterThan(0);
      expect(events.some((e) => e.type === 'request_blocked')).toBe(true);
    });

    it('should remove event handler', () => {
      const events: NetworkPolicyEvent[] = [];
      const handler = (event: NetworkPolicyEvent) => events.push(event);

      manager.on(handler);
      manager.off(handler);

      manager.updatePolicy('qe-test-generator', { timeoutMs: 999 });

      expect(events.length).toBe(0);
    });

    it('should handle errors in event handlers gracefully', async () => {
      const errorHandler = () => {
        throw new Error('Handler error');
      };
      manager.on(errorHandler);

      // Should not throw
      await expect(
        manager.checkRequest('agent-1', 'qe-test-generator', 'blocked.example.com')
      ).resolves.toBeDefined();
    });
  });

  describe('getAuditStats', () => {
    it('should return audit statistics', async () => {
      await manager.recordRequest('agent-1', 'qe-test-generator', 'api.anthropic.com', true);
      await manager.recordRequest('agent-2', 'qe-security-scanner', 'nvd.nist.gov', true);

      const stats = await manager.getAuditStats();

      expect(stats).toHaveProperty('totalRequests');
      expect(stats).toHaveProperty('allowedRequests');
      expect(stats).toHaveProperty('byDomain');
      expect(stats).toHaveProperty('byAgentType');
    });

    it('should filter by date', async () => {
      await manager.recordRequest('agent-1', 'qe-test-generator', 'api.anthropic.com', true);

      const futureStats = await manager.getAuditStats(new Date(Date.now() + 60000));
      expect(futureStats.totalRequests).toBe(0);
    });
  });

  describe('listPolicies', () => {
    it('should list all registered policy agent types', () => {
      const policies = manager.listPolicies();

      expect(Array.isArray(policies)).toBe(true);
      expect(policies.length).toBeGreaterThan(0);
      expect(policies).toContain('qe-test-generator');
      expect(policies).toContain('qe-security-scanner');
    });
  });
});

describe('createNetworkPolicyManager', () => {
  it('should create manager instance', () => {
    const manager = createNetworkPolicyManager();
    expect(manager).toBeInstanceOf(NetworkPolicyManager);
  });

  it('should accept custom config', () => {
    const manager = createNetworkPolicyManager({
      debug: true,
      maxAuditEntries: 5000,
    });
    expect(manager).toBeInstanceOf(NetworkPolicyManager);
  });
});

describe('DEFAULT_NETWORK_POLICIES', () => {
  it('should have policy for each QE agent type', () => {
    const expectedAgents = [
      'qe-test-generator',
      'qe-coverage-analyzer',
      'qe-security-scanner',
      'qe-performance-tester',
      'qe-flaky-test-hunter',
    ];

    for (const agent of expectedAgents) {
      expect(DEFAULT_NETWORK_POLICIES[agent]).toBeDefined();
      expect(DEFAULT_NETWORK_POLICIES[agent].agentType).toBe(agent);
    }
  });

  it('should have default policy', () => {
    expect(DEFAULT_NETWORK_POLICIES.default).toBeDefined();
    expect(DEFAULT_NETWORK_POLICIES.default.agentType).toBe('default');
  });

  it('should have restrictive default policy', () => {
    const defaultPolicy = DEFAULT_NETWORK_POLICIES.default;
    expect(defaultPolicy.blockUnknownDomains).toBe(true);
    expect(defaultPolicy.rateLimit.requestsPerMinute).toBeLessThanOrEqual(60);
  });

  it('should include security domains for security scanner', () => {
    const securityPolicy = DEFAULT_NETWORK_POLICIES['qe-security-scanner'];
    expect(securityPolicy.allowedDomains).toContain('nvd.nist.gov');
    expect(securityPolicy.allowedDomains).toContain('cve.mitre.org');
  });
});
