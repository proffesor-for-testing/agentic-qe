/**
 * Network Policy Enforcement Infrastructure
 *
 * Provides secure network access control for QE agents:
 * - Domain whitelisting per agent type
 * - Rate limiting with token bucket algorithm
 * - Comprehensive audit logging
 * - Event-driven monitoring
 *
 * @module infrastructure/network
 * @see Issue #146 - Security Hardening: SP-3 Network Policy Enforcement
 */

// Types
export {
  type NetworkPolicy,
  type RateLimitConfig,
  type PolicyCheckResult,
  type PolicyBlockReason,
  type RateLimitStatus,
  type AuditEntry,
  type AuditAction,
  type AuditQueryFilter,
  type AuditStats,
  type NetworkPolicyManagerConfig,
  type NetworkPolicyEvent,
  type NetworkPolicyEventType,
  type NetworkPolicyEventHandler,
  type IRateLimiter,
  NetworkPolicyError,
} from './types.js';

// NetworkPolicyManager
export {
  NetworkPolicyManager,
  createNetworkPolicyManager,
} from './NetworkPolicyManager.js';

// DomainWhitelist
export {
  DomainWhitelist,
  COMMON_DOMAIN_PRESETS,
  createWhitelistFromPresets,
} from './DomainWhitelist.js';

// AgentRateLimiter
export {
  AgentRateLimiter,
  createDefaultRateLimiter,
} from './AgentRateLimiter.js';

// AuditLogger
export {
  AuditLogger,
  type AuditLoggerConfig,
} from './AuditLogger.js';

// Default Policies
export {
  DEFAULT_NETWORK_POLICIES,
  getNetworkPolicy,
  listPolicyAgentTypes,
  mergePolicy,
} from './policies/default-policies.js';
