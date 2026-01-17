/**
 * Sandbox Manager for Docker-Based Agent Isolation
 *
 * Manages the lifecycle of sandboxed agent containers with resource limits
 * enforced by cgroups. Provides secure, isolated execution environments
 * for QE agents.
 *
 * @module infrastructure/sandbox/SandboxManager
 * @see Issue #146 - Security Hardening: Docker Sandboxing
 */

import Docker from 'dockerode';
import type {
  SandboxConfig,
  SandboxManagerConfig,
  ContainerInfo,
  ResourceStats,
  SandboxCreateResult,
  SandboxDestroyResult,
  HealthCheckResult,
  SandboxEvent,
  SandboxEventHandler,
  parseMemoryString,
} from './types.js';
import { DEFAULT_SANDBOX_CONFIG } from './types.js';
import { getAgentSandboxConfig } from './profiles/agent-profiles.js';
import { ResourceMonitor } from './ResourceMonitor.js';

/**
 * Default manager configuration
 */
const DEFAULT_MANAGER_CONFIG: SandboxManagerConfig = {
  agentImage: 'agentic-qe-agent',
  imageTag: 'latest',
  networkName: 'agentic-qe-sandbox',
  enableLogging: true,
  logDriver: 'json-file',
  logMaxSize: '10m',
  logMaxFiles: 3,
  cleanupOnShutdown: true,
  healthCheckIntervalMs: 30000,
};

/**
 * SandboxManager manages Docker containers for secure agent execution
 */
export class SandboxManager {
  private docker: Docker;
  private config: SandboxManagerConfig;
  private containers: Map<string, ContainerInfo>;
  private resourceMonitor: ResourceMonitor;
  private eventHandlers: SandboxEventHandler[] = [];
  private isInitialized: boolean = false;
  private networkId: string | null = null;

  constructor(config: Partial<SandboxManagerConfig> = {}) {
    this.config = { ...DEFAULT_MANAGER_CONFIG, ...config };

    // Initialize Docker client
    const dockerOptions: Docker.DockerOptions = {};
    if (this.config.dockerSocketPath) {
      dockerOptions.socketPath = this.config.dockerSocketPath;
    } else if (this.config.dockerHost) {
      dockerOptions.host = this.config.dockerHost;
    }
    if (this.config.dockerVersion) {
      dockerOptions.version = this.config.dockerVersion;
    }

    this.docker = new Docker(dockerOptions);
    this.containers = new Map();
    this.resourceMonitor = new ResourceMonitor(this.docker);

    // Forward resource monitor events
    this.resourceMonitor.on((event) => this.emitEvent(event));
  }

  /**
   * Initialize the sandbox manager
   * Creates network if needed and validates Docker connection
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Verify Docker connection
      await this.docker.ping();

      // Create sandbox network if needed
      if (this.config.networkName) {
        await this.ensureNetwork();
      }

      // Start resource monitoring
      this.resourceMonitor.start();

      this.isInitialized = true;
    } catch (error) {
      throw new Error(`Failed to initialize SandboxManager: ${(error as Error).message}`);
    }
  }

  /**
   * Shutdown the sandbox manager
   * Optionally cleans up all containers
   */
  async shutdown(): Promise<void> {
    this.resourceMonitor.stop();

    if (this.config.cleanupOnShutdown) {
      await this.destroyAll();
    }

    this.isInitialized = false;
  }

  /**
   * Create a sandboxed container for an agent
   */
  async createSandbox(
    agentId: string,
    agentType: string,
    customConfig?: Partial<SandboxConfig>
  ): Promise<SandboxCreateResult> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      // Get profile config and merge with custom config
      const profileConfig = getAgentSandboxConfig(agentType);
      const sandboxConfig: SandboxConfig = {
        ...DEFAULT_SANDBOX_CONFIG,
        ...profileConfig,
        ...customConfig,
      };

      // Build container create options
      const createOptions = this.buildContainerOptions(agentId, agentType, sandboxConfig);

      // Create container
      const container = await this.docker.createContainer(createOptions);
      const containerId = container.id;

      // Build container info
      const containerInfo: ContainerInfo = {
        containerId,
        agentId,
        agentType,
        status: 'creating',
        createdAt: new Date(),
        labels: createOptions.Labels,
      };

      this.containers.set(containerId, containerInfo);

      // Start container
      await container.start();
      containerInfo.status = 'running';
      containerInfo.startedAt = new Date();

      // Add to resource monitoring
      this.resourceMonitor.addContainer(containerId, agentId, agentType);

      // Emit event
      await this.emitEvent({
        type: 'created',
        containerId,
        agentId,
        agentType,
        timestamp: new Date(),
        details: { config: sandboxConfig },
      });

      await this.emitEvent({
        type: 'started',
        containerId,
        agentId,
        agentType,
        timestamp: new Date(),
      });

      return {
        success: true,
        container: containerInfo,
      };
    } catch (error) {
      const errorMessage = (error as Error).message;
      return {
        success: false,
        error: `Failed to create sandbox: ${errorMessage}`,
      };
    }
  }

  /**
   * Destroy a sandboxed container
   */
  async destroySandbox(containerId: string, force: boolean = false): Promise<SandboxDestroyResult> {
    try {
      const containerInfo = this.containers.get(containerId);
      if (!containerInfo) {
        return {
          success: false,
          containerId,
          error: 'Container not found',
        };
      }

      const container = this.docker.getContainer(containerId);

      // Update status
      containerInfo.status = 'removing';

      // Stop container
      try {
        await container.stop({ t: force ? 0 : 10 });
      } catch (error) {
        // Container might already be stopped
        if (!(error as Error).message?.includes('is not running')) {
          throw error;
        }
      }

      // Remove container
      await container.remove({ force });

      // Remove from tracking
      this.containers.delete(containerId);
      this.resourceMonitor.removeContainer(containerId);

      // Emit event
      await this.emitEvent({
        type: 'destroyed',
        containerId,
        agentId: containerInfo.agentId,
        agentType: containerInfo.agentType,
        timestamp: new Date(),
      });

      return {
        success: true,
        containerId,
        forced: force,
      };
    } catch (error) {
      return {
        success: false,
        containerId,
        error: `Failed to destroy sandbox: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Destroy all sandboxed containers
   */
  async destroyAll(): Promise<SandboxDestroyResult[]> {
    const results: SandboxDestroyResult[] = [];

    for (const containerId of this.containers.keys()) {
      const result = await this.destroySandbox(containerId, true);
      results.push(result);
    }

    return results;
  }

  /**
   * Get resource usage for a container
   */
  async getResourceUsage(containerId: string): Promise<ResourceStats | null> {
    return this.resourceMonitor.getStats(containerId);
  }

  /**
   * List all sandboxed containers
   */
  listSandboxes(): ContainerInfo[] {
    return Array.from(this.containers.values());
  }

  /**
   * Get container info by ID
   */
  getContainer(containerId: string): ContainerInfo | undefined {
    return this.containers.get(containerId);
  }

  /**
   * Get container by agent ID
   */
  getContainerByAgentId(agentId: string): ContainerInfo | undefined {
    for (const container of this.containers.values()) {
      if (container.agentId === agentId) {
        return container;
      }
    }
    return undefined;
  }

  /**
   * Check container health
   */
  async healthCheck(containerId: string): Promise<HealthCheckResult> {
    const startTime = Date.now();

    try {
      const container = this.docker.getContainer(containerId);
      const inspection = await container.inspect();

      const healthy = inspection.State.Running && !inspection.State.OOMKilled;

      return {
        healthy,
        containerId,
        status: inspection.State.Status,
        responseTimeMs: Date.now() - startTime,
        checkedAt: new Date(),
      };
    } catch (error) {
      const containerInfo = this.containers.get(containerId);

      await this.emitEvent({
        type: 'health_check_failed',
        containerId,
        agentId: containerInfo?.agentId || 'unknown',
        agentType: containerInfo?.agentType || 'unknown',
        timestamp: new Date(),
        error: (error as Error).message,
      });

      return {
        healthy: false,
        containerId,
        status: 'error',
        checkedAt: new Date(),
      };
    }
  }

  /**
   * Execute a command in a container
   */
  async exec(
    containerId: string,
    command: string[]
  ): Promise<{ exitCode: number; output: string }> {
    const container = this.docker.getContainer(containerId);

    const exec = await container.exec({
      Cmd: command,
      AttachStdout: true,
      AttachStderr: true,
    });

    const stream = await exec.start({ hijack: true, stdin: false });

    return new Promise((resolve, reject) => {
      let output = '';

      stream.on('data', (chunk: Buffer) => {
        // Docker multiplexes stdout/stderr, skip the 8-byte header
        output += chunk.slice(8).toString();
      });

      stream.on('end', async () => {
        try {
          const inspection = await exec.inspect();
          resolve({
            exitCode: inspection.ExitCode || 0,
            output,
          });
        } catch (error) {
          reject(error);
        }
      });

      stream.on('error', reject);
    });
  }

  /**
   * Get container logs
   */
  async getLogs(
    containerId: string,
    options: { tail?: number; since?: number } = {}
  ): Promise<string> {
    const container = this.docker.getContainer(containerId);

    const logs = await container.logs({
      stdout: true,
      stderr: true,
      tail: options.tail || 100,
      since: options.since,
    });

    return logs.toString();
  }

  /**
   * Add event handler
   */
  on(handler: SandboxEventHandler): void {
    this.eventHandlers.push(handler);
  }

  /**
   * Remove event handler
   */
  off(handler: SandboxEventHandler): void {
    const index = this.eventHandlers.indexOf(handler);
    if (index !== -1) {
      this.eventHandlers.splice(index, 1);
    }
  }

  /**
   * Check if Docker is available
   */
  async isDockerAvailable(): Promise<boolean> {
    try {
      await this.docker.ping();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get manager status
   */
  getStatus(): {
    initialized: boolean;
    dockerAvailable: boolean;
    containerCount: number;
    networkId: string | null;
  } {
    return {
      initialized: this.isInitialized,
      dockerAvailable: this.isInitialized,
      containerCount: this.containers.size,
      networkId: this.networkId,
    };
  }

  // ============================================
  // Private Methods
  // ============================================

  /**
   * Build Docker container create options
   */
  private buildContainerOptions(
    agentId: string,
    agentType: string,
    config: SandboxConfig
  ): Docker.ContainerCreateOptions {
    const image = `${this.config.agentImage}:${this.config.imageTag || 'latest'}`;

    // Parse memory limits
    const memoryBytes = this.parseMemory(config.memoryLimit);
    const memorySwapBytes = this.parseMemory(config.memorySwapLimit);

    // Build labels
    const labels: Record<string, string> = {
      'agentic-qe.agent-id': agentId,
      'agentic-qe.agent-type': agentType,
      'agentic-qe.sandbox': 'true',
      'agentic-qe.created-at': new Date().toISOString(),
      ...config.labels,
    };

    // Build environment
    const env = Object.entries(config.environment || {}).map(([k, v]) => `${k}=${v}`);
    env.push(`AGENT_ID=${agentId}`);
    env.push(`AGENT_TYPE=${agentType}`);

    // Build host config
    const hostConfig: Docker.HostConfig = {
      // CPU limits
      CpuQuota: config.cpuLimit * 100000, // 100000 = 1 CPU
      CpuPeriod: 100000,

      // Memory limits
      Memory: memoryBytes,
      MemorySwap: memorySwapBytes,

      // Security
      ReadonlyRootfs: config.readOnlyRootFs,
      SecurityOpt: ['no-new-privileges:true'],
      CapDrop: ['ALL'],

      // Logging
      LogConfig: this.config.enableLogging
        ? {
            Type: this.config.logDriver as 'json-file',
            Config: {
              'max-size': this.config.logMaxSize || '10m',
              'max-file': String(this.config.logMaxFiles || 3),
            },
          }
        : { Type: 'none', Config: {} },

      // Tmpfs for writable directories
      Tmpfs: {
        '/tmp': 'size=100m',
        '/app/tmp': 'size=50m',
      },

      // Network
      NetworkMode:
        config.networkMode === 'host'
          ? 'host'
          : config.networkMode === 'isolated'
            ? 'none'
            : this.config.networkName || 'bridge',

      // Restart policy
      RestartPolicy: {
        Name: 'on-failure',
        MaximumRetryCount: 3,
      },
    };

    // Add seccomp profile if specified
    if (config.seccompProfile) {
      hostConfig.SecurityOpt?.push(`seccomp=${config.seccompProfile}`);
    }

    // Add volumes
    if (config.volumes) {
      hostConfig.Binds = config.volumes.map(
        (v) => `${v.source}:${v.target}${v.readOnly ? ':ro' : ''}`
      );
    }

    return {
      Image: image,
      name: `agentic-qe-${agentType}-${agentId.substring(0, 8)}`,
      Labels: labels,
      Env: env,
      User: config.user,
      WorkingDir: config.workingDir || '/app',
      HostConfig: hostConfig,
      Healthcheck: {
        Test: ['CMD', 'node', '-e', 'process.exit(0)'],
        Interval: this.config.healthCheckIntervalMs! * 1000000, // nanoseconds
        Timeout: 10000000000, // 10 seconds
        Retries: 3,
        StartPeriod: 5000000000, // 5 seconds
      },
    };
  }

  /**
   * Ensure sandbox network exists
   */
  private async ensureNetwork(): Promise<void> {
    const networkName = this.config.networkName!;

    try {
      // Check if network exists
      const networks = await this.docker.listNetworks({
        filters: { name: [networkName] },
      });

      if (networks.length > 0) {
        this.networkId = networks[0].Id;
        return;
      }

      // Create network
      const network = await this.docker.createNetwork({
        Name: networkName,
        Driver: 'bridge',
        Internal: true, // Isolated from external network
        Labels: {
          'agentic-qe.sandbox-network': 'true',
        },
      });

      this.networkId = network.id;
    } catch (error) {
      console.warn(`Failed to ensure network ${networkName}:`, error);
    }
  }

  /**
   * Parse memory string to bytes
   */
  private parseMemory(memStr: string): number {
    const match = memStr.toLowerCase().match(/^(\d+(?:\.\d+)?)\s*([kmgt]?)$/);
    if (!match) {
      throw new Error(`Invalid memory string: ${memStr}`);
    }

    const value = parseFloat(match[1]);
    const unit = match[2] || '';

    const multipliers: Record<string, number> = {
      '': 1,
      k: 1024,
      m: 1024 * 1024,
      g: 1024 * 1024 * 1024,
      t: 1024 * 1024 * 1024 * 1024,
    };

    return Math.floor(value * multipliers[unit]);
  }

  /**
   * Emit event to all handlers
   */
  private async emitEvent(event: SandboxEvent): Promise<void> {
    for (const handler of this.eventHandlers) {
      try {
        await handler(event);
      } catch (error) {
        console.error('Error in sandbox event handler:', error);
      }
    }
  }
}

/**
 * Create a new SandboxManager instance
 */
export function createSandboxManager(config?: Partial<SandboxManagerConfig>): SandboxManager {
  return new SandboxManager(config);
}
