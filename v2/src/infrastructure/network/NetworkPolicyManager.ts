/**
 * Network Policy Manager for Agent Network Access Control
 *
 * Central manager for enforcing network policies, domain whitelisting,
 * rate limiting, and audit logging for all agent types.
 *
 * @module infrastructure/network/NetworkPolicyManager
 * @see Issue #146 - Security Hardening: SP-3 Network Policy Enforcement
 */

import type {
  NetworkPolicy,
  PolicyCheckResult,
  NetworkPolicyManagerConfig,
  NetworkPolicyEvent,
  NetworkPolicyEventHandler,
  RateLimitStatus,
} from './types.js';
import { NetworkPolicyError } from './types.js';
import { DomainWhitelist } from './DomainWhitelist.js';
import { AgentRateLimiter } from './AgentRateLimiter.js';
import { AuditLogger } from './AuditLogger.js';
import { DEFAULT_NETWORK_POLICIES, getNetworkPolicy } from './policies/default-policies.js';

/**
 * Default manager configuration
 */
const DEFAULT_MANAGER_CONFIG: NetworkPolicyManagerConfig = {
  defaultPolicy: DEFAULT_NETWORK_POLICIES['default'],
  enableAuditLogging: true,
  maxAuditEntries: 10000,
  persistAuditLog: false,
  debug: false,
};

/**
 * Network Policy Manager
 *
 * Features:
 * - Per-agent-type policies
 * - Domain whitelisting
 * - Rate limiting with token bucket
 * - Comprehensive audit logging
 * - Event emission for monitoring
 */
export class NetworkPolicyManager {
  private config: NetworkPolicyManagerConfig;
  private policies: Map<string, NetworkPolicy>;
  private whitelists: Map<string, DomainWhitelist>;
  private rateLimiters: Map<string, AgentRateLimiter>;
  private auditLogger: AuditLogger;
  private eventHandlers: NetworkPolicyEventHandler[] = [];
  private initialized: boolean = false;

  constructor(config: Partial<NetworkPolicyManagerConfig> = {}) {
    this.config = { ...DEFAULT_MANAGER_CONFIG, ...config };
    this.policies = new Map();
    this.whitelists = new Map();
    this.rateLimiters = new Map();

    this.auditLogger = new AuditLogger({
      maxEntries: this.config.maxAuditEntries,
      persistToFile: this.config.persistAuditLog,
      filePath: this.config.auditLogPath,
      debug: this.config.debug,
    });
  }

  /**
   * Initialize the policy manager with default policies
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Load default policies
    for (const [agentType, policy] of Object.entries(DEFAULT_NETWORK_POLICIES)) {
      this.registerPolicy(policy);
    }

    // Load audit log if persisted
    if (this.config.persistAuditLog) {
      await this.auditLogger.load();
    }

    this.initialized = true;
    this.log('NetworkPolicyManager initialized');
  }

  /**
   * Shutdown the policy manager
   */
  async shutdown(): Promise<void> {
    // Close all rate limiters
    for (const limiter of this.rateLimiters.values()) {
      limiter.close();
    }

    // Save and close audit logger
    await this.auditLogger.close();

    this.initialized = false;
    this.log('NetworkPolicyManager shutdown');
  }

  /**
   * Register a network policy
   */
  registerPolicy(policy: NetworkPolicy): void {
    this.policies.set(policy.agentType, policy);

    // Create whitelist for this agent type
    const whitelist = new DomainWhitelist(policy.allowedDomains);
    this.whitelists.set(policy.agentType, whitelist);

    // Create rate limiter for this agent type
    const rateLimiter = new AgentRateLimiter(policy.rateLimit);
    this.rateLimiters.set(policy.agentType, rateLimiter);

    this.log(`Registered policy for ${policy.agentType}`);
  }

  /**
   * Check if a request is allowed
   */
  async checkRequest(
    agentId: string,
    agentType: string,
    domain: string
  ): Promise<PolicyCheckResult> {
    const policy = this.getPolicy(agentType);
    const whitelist = this.getWhitelist(agentType);
    const rateLimiter = this.getRateLimiter(agentType);

    // Check rate limit first
    const rateLimitStatus = rateLimiter.check(agentId);
    if (rateLimitStatus.limited) {
      const result: PolicyCheckResult = {
        allowed: false,
        policy,
        reason: 'rate_limit_exceeded',
        details: `Rate limit exceeded. Retry after ${rateLimitStatus.retryAfter}ms`,
        rateLimitStatus,
      };

      await this.logAndEmit(agentId, agentType, domain, result);
      return result;
    }

    // Check domain whitelist
    const domainAllowed = whitelist.isAllowed(domain);
    if (!domainAllowed && policy.blockUnknownDomains) {
      const result: PolicyCheckResult = {
        allowed: false,
        policy,
        reason: 'domain_not_allowed',
        details: `Domain ${domain} is not in the whitelist`,
        rateLimitStatus,
      };

      await this.logAndEmit(agentId, agentType, domain, result);
      return result;
    }

    // Request is allowed
    const result: PolicyCheckResult = {
      allowed: true,
      policy,
      rateLimitStatus,
    };

    return result;
  }

  /**
   * Record a request (consumes rate limit token)
   */
  async recordRequest(
    agentId: string,
    agentType: string,
    domain: string,
    allowed: boolean,
    responseTimeMs?: number
  ): Promise<void> {
    const policy = this.getPolicy(agentType);
    const rateLimiter = this.getRateLimiter(agentType);

    // Consume rate limit token
    const rateLimitStatus = rateLimiter.consume(agentId);

    // Log to audit
    if (policy.auditLogging && this.config.enableAuditLogging) {
      if (allowed) {
        await this.auditLogger.logAllowed(agentId, agentType, domain, {
          responseTimeMs,
        });
      } else if (rateLimitStatus.limited) {
        await this.auditLogger.logRateLimited(agentId, agentType, domain);
      } else {
        await this.auditLogger.logBlocked(agentId, agentType, domain, 'Domain not allowed');
      }
    }
  }

  /**
   * Get policy for an agent type
   */
  getPolicy(agentType: string): NetworkPolicy {
    return this.policies.get(agentType) || this.config.defaultPolicy;
  }

  /**
   * Update a policy
   */
  updatePolicy(agentType: string, updates: Partial<NetworkPolicy>): void {
    const current = this.getPolicy(agentType);
    const updated: NetworkPolicy = {
      ...current,
      ...updates,
      rateLimit: {
        ...current.rateLimit,
        ...updates.rateLimit,
      },
    };

    this.registerPolicy(updated);

    this.emitEvent({
      type: 'policy_updated',
      timestamp: new Date(),
      agentId: '',
      agentType,
      details: { updates },
    });
  }

  /**
   * Get rate limit status for an agent
   */
  getRateLimitStatus(agentId: string, agentType: string): RateLimitStatus {
    const rateLimiter = this.getRateLimiter(agentType);
    return rateLimiter.getStatus(agentId);
  }

  /**
   * Reset rate limit for an agent
   */
  resetRateLimit(agentId: string, agentType: string): void {
    const rateLimiter = this.getRateLimiter(agentType);
    rateLimiter.reset(agentId);
    this.log(`Reset rate limit for ${agentId} (${agentType})`);
  }

  /**
   * Get audit logger
   */
  getAuditLogger(): AuditLogger {
    return this.auditLogger;
  }

  /**
   * Get audit statistics
   */
  async getAuditStats(since?: Date) {
    return this.auditLogger.getStats(since);
  }

  /**
   * List all registered policy agent types
   */
  listPolicies(): string[] {
    return Array.from(this.policies.keys());
  }

  /**
   * Add event handler
   */
  on(handler: NetworkPolicyEventHandler): void {
    this.eventHandlers.push(handler);
  }

  /**
   * Remove event handler
   */
  off(handler: NetworkPolicyEventHandler): void {
    const index = this.eventHandlers.indexOf(handler);
    if (index !== -1) {
      this.eventHandlers.splice(index, 1);
    }
  }

  // ============================================
  // Private Methods
  // ============================================

  private getWhitelist(agentType: string): DomainWhitelist {
    let whitelist = this.whitelists.get(agentType);
    if (!whitelist) {
      const policy = this.getPolicy(agentType);
      whitelist = new DomainWhitelist(policy.allowedDomains);
      this.whitelists.set(agentType, whitelist);
    }
    return whitelist;
  }

  private getRateLimiter(agentType: string): AgentRateLimiter {
    let limiter = this.rateLimiters.get(agentType);
    if (!limiter) {
      const policy = this.getPolicy(agentType);
      limiter = new AgentRateLimiter(policy.rateLimit);
      this.rateLimiters.set(agentType, limiter);
    }
    return limiter;
  }

  private async logAndEmit(
    agentId: string,
    agentType: string,
    domain: string,
    result: PolicyCheckResult
  ): Promise<void> {
    const policy = result.policy;

    // Audit log
    if (policy.auditLogging && this.config.enableAuditLogging) {
      if (result.reason === 'rate_limit_exceeded') {
        await this.auditLogger.logRateLimited(agentId, agentType, domain);
      } else if (result.reason === 'domain_not_allowed') {
        await this.auditLogger.logBlocked(agentId, agentType, domain, result.details || 'Domain not allowed');
      }
    }

    // Emit event
    const eventType = result.allowed
      ? 'request_allowed'
      : result.reason === 'rate_limit_exceeded'
        ? 'request_rate_limited'
        : 'request_blocked';

    this.emitEvent({
      type: eventType,
      timestamp: new Date(),
      agentId,
      agentType,
      domain,
      details: {
        reason: result.reason,
        rateLimitStatus: result.rateLimitStatus,
      },
    });
  }

  private emitEvent(event: NetworkPolicyEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (error) {
        console.error('Error in network policy event handler:', error);
      }
    }
  }

  private log(message: string): void {
    if (this.config.debug) {
      console.log(`[NetworkPolicyManager] ${message}`);
    }
  }
}

/**
 * Create a new NetworkPolicyManager
 */
export function createNetworkPolicyManager(
  config?: Partial<NetworkPolicyManagerConfig>
): NetworkPolicyManager {
  return new NetworkPolicyManager(config);
}
