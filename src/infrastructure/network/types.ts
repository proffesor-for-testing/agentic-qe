/**
 * Types for Network Policy Enforcement
 *
 * Provides type definitions for agent network access control,
 * domain whitelisting, rate limiting, and audit logging.
 *
 * @module infrastructure/network/types
 * @see Issue #146 - Security Hardening: SP-3 Network Policy Enforcement
 */

/**
 * Network policy for an agent type
 */
export interface NetworkPolicy {
  /** Agent type this policy applies to */
  agentType: string;

  /** Allowed domains for network access */
  allowedDomains: string[];

  /** Rate limiting configuration */
  rateLimit: RateLimitConfig;

  /** Enable audit logging for this agent type */
  auditLogging: boolean;

  /** Block requests to domains not in allowedDomains */
  blockUnknownDomains: boolean;

  /** Custom headers to add to requests */
  customHeaders?: Record<string, string>;

  /** Timeout for requests in ms */
  timeoutMs?: number;
}

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  /** Maximum requests per minute */
  requestsPerMinute: number;

  /** Maximum requests per hour */
  requestsPerHour: number;

  /** Burst size for token bucket */
  burstSize: number;
}

/**
 * Policy check result
 */
export interface PolicyCheckResult {
  /** Whether the request is allowed */
  allowed: boolean;

  /** Policy that was applied */
  policy: NetworkPolicy;

  /** Reason if blocked */
  reason?: PolicyBlockReason;

  /** Details about the block */
  details?: string;

  /** Rate limit status */
  rateLimitStatus?: RateLimitStatus;
}

/**
 * Reasons for blocking a request
 */
export type PolicyBlockReason =
  | 'domain_not_allowed'
  | 'rate_limit_exceeded'
  | 'policy_not_found'
  | 'agent_blocked';

/**
 * Rate limit status
 */
export interface RateLimitStatus {
  /** Whether currently rate limited */
  limited: boolean;

  /** Current request count in window */
  currentRate: number;

  /** Remaining requests in window */
  remaining: number;

  /** Time until rate limit resets (ms) */
  resetIn: number;

  /** Retry after time if limited (ms) */
  retryAfter?: number;
}

/**
 * Audit entry for network requests
 */
export interface AuditEntry {
  /** Entry ID */
  id: string;

  /** Timestamp of the request */
  timestamp: Date;

  /** Agent ID making the request */
  agentId: string;

  /** Agent type */
  agentType: string;

  /** Target domain */
  domain: string;

  /** Full URL (optional, may be redacted) */
  url?: string;

  /** Action taken */
  action: AuditAction;

  /** Reason for action */
  reason?: string;

  /** HTTP method */
  requestMethod?: string;

  /** Request path */
  requestPath?: string;

  /** Response status code */
  responseStatus?: number;

  /** Response time in ms */
  responseTimeMs?: number;

  /** Request body size */
  requestSizeBytes?: number;

  /** Response body size */
  responseSizeBytes?: number;

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Audit action types
 */
export type AuditAction = 'allowed' | 'blocked' | 'rate_limited';

/**
 * Query filter for audit entries
 */
export interface AuditQueryFilter {
  /** Filter by agent ID */
  agentId?: string;

  /** Filter by agent type */
  agentType?: string;

  /** Filter by domain */
  domain?: string;

  /** Filter by action */
  action?: AuditAction;

  /** Start timestamp */
  since?: Date;

  /** End timestamp */
  until?: Date;

  /** Maximum entries to return */
  limit?: number;

  /** Offset for pagination */
  offset?: number;
}

/**
 * Audit statistics
 */
export interface AuditStats {
  /** Total requests */
  totalRequests: number;

  /** Allowed requests */
  allowedRequests: number;

  /** Blocked requests */
  blockedRequests: number;

  /** Rate limited requests */
  rateLimitedRequests: number;

  /** Requests by domain */
  byDomain: Record<string, number>;

  /** Requests by agent type */
  byAgentType: Record<string, number>;

  /** Average response time */
  avgResponseTimeMs: number;

  /** Time period for stats */
  since: Date;

  /** Stats collection timestamp */
  timestamp: Date;
}

/**
 * Network policy manager configuration
 */
export interface NetworkPolicyManagerConfig {
  /** Default policy for unknown agent types */
  defaultPolicy: NetworkPolicy;

  /** Enable audit logging */
  enableAuditLogging: boolean;

  /** Maximum audit entries to keep in memory */
  maxAuditEntries: number;

  /** Persist audit log to file */
  persistAuditLog?: boolean;

  /** Audit log file path */
  auditLogPath?: string;

  /** Enable debug logging */
  debug: boolean;
}

/**
 * Network policy error
 */
export class NetworkPolicyError extends Error {
  constructor(
    message: string,
    public readonly reason: PolicyBlockReason,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'NetworkPolicyError';
  }
}

/**
 * Rate limiter interface
 */
export interface IRateLimiter {
  /** Check if request is allowed (doesn't consume) */
  check(agentId: string): RateLimitStatus;

  /** Consume a request (returns status) */
  consume(agentId: string): RateLimitStatus;

  /** Reset rate limit for agent */
  reset(agentId: string): void;

  /** Get current status for agent */
  getStatus(agentId: string): RateLimitStatus;
}

/**
 * Event types for network policy events
 */
export type NetworkPolicyEventType =
  | 'request_allowed'
  | 'request_blocked'
  | 'request_rate_limited'
  | 'policy_updated'
  | 'policy_violation';

/**
 * Network policy event
 */
export interface NetworkPolicyEvent {
  type: NetworkPolicyEventType;
  timestamp: Date;
  agentId: string;
  agentType: string;
  domain?: string;
  details?: Record<string, unknown>;
}

/**
 * Event handler type
 */
export type NetworkPolicyEventHandler = (event: NetworkPolicyEvent) => void | Promise<void>;
