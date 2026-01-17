/**
 * Infrastructure Module
 *
 * Security hardening infrastructure for QE agents:
 * - SP-1: Docker-based agent sandboxing
 * - SP-3: Network policy enforcement
 *
 * @module infrastructure
 * @see Issue #146 - Security Hardening
 */

// Sandbox Infrastructure (SP-1)
export {
  SandboxManager,
  createSandboxManager,
  ResourceMonitor,
  AGENT_PROFILES,
  getAgentProfile,
  getAgentSandboxConfig,
  listAgentProfiles,
  validateConfigAgainstProfile,
  DEFAULT_SANDBOX_CONFIG,
  DEFAULT_THRESHOLDS,
  DEFAULT_MONITOR_CONFIG,
  parseMemoryString,
  formatBytes,
} from './sandbox/index.js';

export type {
  SandboxConfig,
  SandboxManagerConfig,
  ContainerInfo,
  ContainerStatus,
  ResourceStats,
  SandboxCreateResult,
  SandboxDestroyResult,
  HealthCheckResult,
  SandboxEvent,
  SandboxEventType,
  SandboxEventHandler,
  NetworkMode,
  VolumeMount,
  AgentProfile,
  ResourceMonitorConfig,
  ResourceThresholds,
} from './sandbox/index.js';

// Network Policy Infrastructure (SP-3)
export {
  NetworkPolicyManager,
  createNetworkPolicyManager,
  DomainWhitelist,
  COMMON_DOMAIN_PRESETS,
  createWhitelistFromPresets,
  AgentRateLimiter,
  createDefaultRateLimiter,
  AuditLogger,
  DEFAULT_NETWORK_POLICIES,
  getNetworkPolicy,
  listPolicyAgentTypes,
  mergePolicy,
  NetworkPolicyError,
} from './network/index.js';

export type {
  NetworkPolicy,
  RateLimitConfig,
  PolicyCheckResult,
  PolicyBlockReason,
  RateLimitStatus,
  AuditEntry,
  AuditAction,
  AuditQueryFilter,
  AuditStats,
  NetworkPolicyManagerConfig,
  NetworkPolicyEvent,
  NetworkPolicyEventType,
  NetworkPolicyEventHandler,
  IRateLimiter,
  AuditLoggerConfig,
} from './network/index.js';
