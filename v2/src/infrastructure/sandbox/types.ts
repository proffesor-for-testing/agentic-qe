/**
 * Types for Docker-Based Agent Sandboxing
 *
 * Provides type definitions for secure container-based agent execution
 * with resource limits enforced by cgroups.
 *
 * @module infrastructure/sandbox/types
 * @see Issue #146 - Security Hardening: Docker Sandboxing
 */

/**
 * Network isolation mode for sandboxed agents
 */
export type NetworkMode = 'isolated' | 'whitelisted' | 'host';

/**
 * Container status states
 */
export type ContainerStatus = 'creating' | 'running' | 'stopped' | 'error' | 'removing';

/**
 * Sandbox configuration for agent containers
 */
export interface SandboxConfig {
  /** CPU cores limit (e.g., 2) */
  cpuLimit: number;

  /** Memory limit (e.g., "2g", "512m") */
  memoryLimit: string;

  /** Memory + swap limit (e.g., "2g") */
  memorySwapLimit: string;

  /** Disk quota (e.g., "512m") */
  diskLimit: string;

  /** Network isolation mode */
  networkMode: NetworkMode;

  /** Allowed domains when networkMode is 'whitelisted' */
  allowedDomains?: string[];

  /** Mount root filesystem as read-only */
  readOnlyRootFs: boolean;

  /** User to run container as (non-root) */
  user: string;

  /** Seccomp security profile path */
  seccompProfile?: string;

  /** Additional environment variables */
  environment?: Record<string, string>;

  /** Working directory inside container */
  workingDir?: string;

  /** Volumes to mount */
  volumes?: VolumeMount[];

  /** Container labels */
  labels?: Record<string, string>;
}

/**
 * Volume mount configuration
 */
export interface VolumeMount {
  /** Host path or volume name */
  source: string;

  /** Container path */
  target: string;

  /** Mount as read-only */
  readOnly?: boolean;
}

/**
 * Container information and state
 */
export interface ContainerInfo {
  /** Docker container ID */
  containerId: string;

  /** Agent ID this container belongs to */
  agentId: string;

  /** Agent type (e.g., 'qe-test-generator') */
  agentType: string;

  /** Current container status */
  status: ContainerStatus;

  /** Container creation timestamp */
  createdAt: Date;

  /** Container start timestamp */
  startedAt?: Date;

  /** Container stop timestamp */
  stoppedAt?: Date;

  /** Current resource usage */
  resourceUsage?: ResourceStats;

  /** Exit code if container stopped */
  exitCode?: number;

  /** Error message if status is 'error' */
  error?: string;

  /** Container labels */
  labels?: Record<string, string>;
}

/**
 * Resource usage statistics for a container
 */
export interface ResourceStats {
  /** CPU usage percentage (0-100 per core) */
  cpuPercent: number;

  /** Current memory usage in MB */
  memoryUsageMB: number;

  /** Memory limit in MB */
  memoryLimitMB: number;

  /** Memory usage percentage */
  memoryPercent: number;

  /** Disk usage in MB */
  diskUsageMB: number;

  /** Network bytes received */
  networkRxBytes: number;

  /** Network bytes transmitted */
  networkTxBytes: number;

  /** Number of PIDs in container */
  pidsCount: number;

  /** Timestamp of stats collection */
  timestamp: Date;
}

/**
 * Sandbox manager configuration
 */
export interface SandboxManagerConfig {
  /** Docker socket path (default: /var/run/docker.sock) */
  dockerSocketPath?: string;

  /** Docker host URL (alternative to socket) */
  dockerHost?: string;

  /** Docker API version */
  dockerVersion?: string;

  /** Base image for agent containers */
  agentImage: string;

  /** Image tag */
  imageTag?: string;

  /** Network name for sandboxed containers */
  networkName?: string;

  /** Enable container logging */
  enableLogging?: boolean;

  /** Log driver (json-file, syslog, none) */
  logDriver?: string;

  /** Maximum log size per container */
  logMaxSize?: string;

  /** Maximum number of log files */
  logMaxFiles?: number;

  /** Default sandbox config for unknown agent types */
  defaultConfig?: Partial<SandboxConfig>;

  /** Cleanup containers on manager shutdown */
  cleanupOnShutdown?: boolean;

  /** Health check interval in ms */
  healthCheckIntervalMs?: number;
}

/**
 * Result of sandbox creation
 */
export interface SandboxCreateResult {
  /** Whether creation succeeded */
  success: boolean;

  /** Container info if successful */
  container?: ContainerInfo;

  /** Error message if failed */
  error?: string;

  /** Warnings during creation */
  warnings?: string[];
}

/**
 * Result of sandbox destruction
 */
export interface SandboxDestroyResult {
  /** Whether destruction succeeded */
  success: boolean;

  /** Container ID that was destroyed */
  containerId: string;

  /** Error message if failed */
  error?: string;

  /** Whether container was force-killed */
  forced?: boolean;
}

/**
 * Health check result
 */
export interface HealthCheckResult {
  /** Whether container is healthy */
  healthy: boolean;

  /** Container ID */
  containerId: string;

  /** Health status message */
  status: string;

  /** Response time in ms */
  responseTimeMs?: number;

  /** Last check timestamp */
  checkedAt: Date;

  /** Consecutive failures count */
  failureCount?: number;
}

/**
 * Sandbox event types for monitoring
 */
export type SandboxEventType =
  | 'created'
  | 'started'
  | 'stopped'
  | 'destroyed'
  | 'error'
  | 'oom_killed'
  | 'health_check_failed'
  | 'resource_limit_exceeded';

/**
 * Sandbox event for monitoring and logging
 */
export interface SandboxEvent {
  /** Event type */
  type: SandboxEventType;

  /** Container ID */
  containerId: string;

  /** Agent ID */
  agentId: string;

  /** Agent type */
  agentType: string;

  /** Event timestamp */
  timestamp: Date;

  /** Event details */
  details?: Record<string, unknown>;

  /** Error if applicable */
  error?: string;
}

/**
 * Sandbox event handler
 */
export type SandboxEventHandler = (event: SandboxEvent) => void | Promise<void>;

/**
 * Parse memory string to bytes
 * @param memStr Memory string (e.g., "512m", "2g")
 * @returns Memory in bytes
 */
export function parseMemoryString(memStr: string): number {
  const match = memStr.toLowerCase().match(/^(\d+(?:\.\d+)?)\s*([kmgt]?)b?$/);
  if (!match) {
    throw new Error(`Invalid memory string: ${memStr}`);
  }

  const value = parseFloat(match[1]);
  const unit = match[2] || '';

  const multipliers: Record<string, number> = {
    '': 1,
    'k': 1024,
    'm': 1024 * 1024,
    'g': 1024 * 1024 * 1024,
    't': 1024 * 1024 * 1024 * 1024,
  };

  return Math.floor(value * multipliers[unit]);
}

/**
 * Format bytes to human-readable string
 * @param bytes Number of bytes
 * @returns Formatted string (e.g., "512 MB")
 */
export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let unitIndex = 0;
  let value = bytes;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }

  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * Default sandbox configuration
 */
export const DEFAULT_SANDBOX_CONFIG: SandboxConfig = {
  cpuLimit: 1,
  memoryLimit: '512m',
  memorySwapLimit: '512m',
  diskLimit: '128m',
  networkMode: 'isolated',
  readOnlyRootFs: true,
  user: 'node',
};
