/**
 * Docker-Based Agent Sandboxing Infrastructure
 *
 * Provides secure, isolated execution environments for QE agents with:
 * - Resource limits enforced by cgroups
 * - Network isolation and domain whitelisting
 * - Read-only root filesystem
 * - Non-root user execution
 * - Resource monitoring and OOM prevention
 *
 * @module infrastructure/sandbox
 * @see Issue #146 - Security Hardening: Docker Sandboxing
 */

// Types
export {
  type SandboxConfig,
  type SandboxManagerConfig,
  type ContainerInfo,
  type ContainerStatus,
  type ResourceStats,
  type SandboxCreateResult,
  type SandboxDestroyResult,
  type HealthCheckResult,
  type SandboxEvent,
  type SandboxEventType,
  type SandboxEventHandler,
  type NetworkMode,
  type VolumeMount,
  DEFAULT_SANDBOX_CONFIG,
  parseMemoryString,
  formatBytes,
} from './types.js';

// SandboxManager
export { SandboxManager, createSandboxManager } from './SandboxManager.js';

// ResourceMonitor
export {
  ResourceMonitor,
  type ResourceMonitorConfig,
  type ResourceThresholds,
  DEFAULT_THRESHOLDS,
  DEFAULT_MONITOR_CONFIG,
} from './ResourceMonitor.js';

// Agent Profiles
export {
  AGENT_PROFILES,
  type AgentProfile,
  getAgentProfile,
  getAgentSandboxConfig,
  listAgentProfiles,
  validateConfigAgainstProfile,
} from './profiles/agent-profiles.js';
