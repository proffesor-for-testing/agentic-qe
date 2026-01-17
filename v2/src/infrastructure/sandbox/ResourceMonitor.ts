/**
 * Resource Monitor for Docker Containers
 *
 * Monitors CPU, memory, disk, and network usage for sandboxed agent containers.
 * Provides real-time stats and threshold-based alerts.
 *
 * @module infrastructure/sandbox/ResourceMonitor
 * @see Issue #146 - Security Hardening: Docker Sandboxing
 */

import type Docker from 'dockerode';
import type { ResourceStats, SandboxEvent, SandboxEventHandler } from './types.js';

/**
 * Resource threshold configuration
 */
export interface ResourceThresholds {
  /** CPU usage percentage threshold (0-100) */
  cpuPercent: number;

  /** Memory usage percentage threshold (0-100) */
  memoryPercent: number;

  /** Disk usage percentage threshold (0-100) */
  diskPercent: number;
}

/**
 * Default resource thresholds for alerts
 */
export const DEFAULT_THRESHOLDS: ResourceThresholds = {
  cpuPercent: 90,
  memoryPercent: 85,
  diskPercent: 80,
};

/**
 * Resource monitor configuration
 */
export interface ResourceMonitorConfig {
  /** Monitoring interval in milliseconds */
  intervalMs: number;

  /** Resource thresholds for alerts */
  thresholds: ResourceThresholds;

  /** Enable automatic OOM prevention */
  enableOomPrevention: boolean;

  /** Memory threshold for OOM prevention (percentage) */
  oomPreventionThreshold: number;
}

/**
 * Default monitor configuration
 */
export const DEFAULT_MONITOR_CONFIG: ResourceMonitorConfig = {
  intervalMs: 5000,
  thresholds: DEFAULT_THRESHOLDS,
  enableOomPrevention: true,
  oomPreventionThreshold: 95,
};

/**
 * Container monitoring state
 */
interface MonitoredContainer {
  containerId: string;
  agentId: string;
  agentType: string;
  lastStats?: ResourceStats;
  consecutiveHighMemory: number;
  consecutiveHighCpu: number;
}

/**
 * ResourceMonitor class for tracking container resource usage
 */
export class ResourceMonitor {
  private docker: Docker;
  private config: ResourceMonitorConfig;
  private containers: Map<string, MonitoredContainer>;
  private monitorInterval: ReturnType<typeof setInterval> | null = null;
  private eventHandlers: SandboxEventHandler[] = [];
  private isRunning: boolean = false;

  constructor(docker: Docker, config: Partial<ResourceMonitorConfig> = {}) {
    this.docker = docker;
    this.config = { ...DEFAULT_MONITOR_CONFIG, ...config };
    this.containers = new Map();
  }

  /**
   * Start monitoring a container
   */
  addContainer(containerId: string, agentId: string, agentType: string): void {
    this.containers.set(containerId, {
      containerId,
      agentId,
      agentType,
      consecutiveHighMemory: 0,
      consecutiveHighCpu: 0,
    });
  }

  /**
   * Stop monitoring a container
   */
  removeContainer(containerId: string): void {
    this.containers.delete(containerId);
  }

  /**
   * Start the monitoring loop
   */
  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.monitorInterval = setInterval(async () => {
      await this.collectAllStats();
    }, this.config.intervalMs);

    // Collect initial stats immediately
    this.collectAllStats().catch(console.error);
  }

  /**
   * Stop the monitoring loop
   */
  stop(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
    this.isRunning = false;
  }

  /**
   * Get stats for a specific container
   */
  async getStats(containerId: string): Promise<ResourceStats | null> {
    const monitored = this.containers.get(containerId);
    if (!monitored) return null;

    try {
      const stats = await this.collectContainerStats(containerId);
      if (stats) {
        monitored.lastStats = stats;
      }
      return stats;
    } catch (error) {
      console.error(`Failed to get stats for ${containerId}:`, error);
      return monitored.lastStats || null;
    }
  }

  /**
   * Get cached stats for a container (no API call)
   */
  getCachedStats(containerId: string): ResourceStats | null {
    return this.containers.get(containerId)?.lastStats || null;
  }

  /**
   * Get stats for all monitored containers
   */
  async getAllStats(): Promise<Map<string, ResourceStats>> {
    const result = new Map<string, ResourceStats>();

    for (const [containerId, monitored] of this.containers) {
      const stats = await this.getStats(containerId);
      if (stats) {
        result.set(containerId, stats);
      }
    }

    return result;
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
   * Collect stats for all monitored containers
   */
  private async collectAllStats(): Promise<void> {
    const promises = Array.from(this.containers.keys()).map((containerId) =>
      this.collectAndCheckContainer(containerId)
    );

    await Promise.allSettled(promises);
  }

  /**
   * Collect stats and check thresholds for a container
   */
  private async collectAndCheckContainer(containerId: string): Promise<void> {
    const monitored = this.containers.get(containerId);
    if (!monitored) return;

    try {
      const stats = await this.collectContainerStats(containerId);
      if (!stats) return;

      monitored.lastStats = stats;

      // Check thresholds
      await this.checkThresholds(monitored, stats);
    } catch (error) {
      // Container might have been removed
      if ((error as Error).message?.includes('no such container')) {
        this.containers.delete(containerId);
      }
    }
  }

  /**
   * Collect resource stats for a container
   */
  private async collectContainerStats(containerId: string): Promise<ResourceStats | null> {
    try {
      const container = this.docker.getContainer(containerId);
      const stats = await container.stats({ stream: false });

      return this.parseDockerStats(stats);
    } catch {
      return null;
    }
  }

  /**
   * Parse Docker stats response into ResourceStats
   */
  private parseDockerStats(stats: Docker.ContainerStats): ResourceStats {
    // Calculate CPU percentage
    const cpuDelta =
      stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
    const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
    const cpuCount = stats.cpu_stats.online_cpus || 1;
    const cpuPercent = systemDelta > 0 ? (cpuDelta / systemDelta) * cpuCount * 100 : 0;

    // Memory stats
    const memoryUsage = stats.memory_stats.usage || 0;
    const memoryLimit = stats.memory_stats.limit || 1;
    const memoryUsageMB = memoryUsage / (1024 * 1024);
    const memoryLimitMB = memoryLimit / (1024 * 1024);
    const memoryPercent = (memoryUsage / memoryLimit) * 100;

    // Network stats
    let networkRxBytes = 0;
    let networkTxBytes = 0;
    if (stats.networks) {
      for (const network of Object.values(stats.networks)) {
        networkRxBytes += network.rx_bytes || 0;
        networkTxBytes += network.tx_bytes || 0;
      }
    }

    // PIDs
    const pidsCount = stats.pids_stats?.current || 0;

    return {
      cpuPercent: Math.round(cpuPercent * 100) / 100,
      memoryUsageMB: Math.round(memoryUsageMB * 100) / 100,
      memoryLimitMB: Math.round(memoryLimitMB * 100) / 100,
      memoryPercent: Math.round(memoryPercent * 100) / 100,
      diskUsageMB: 0, // Disk stats require additional API call
      networkRxBytes,
      networkTxBytes,
      pidsCount,
      timestamp: new Date(),
    };
  }

  /**
   * Check resource thresholds and emit events
   */
  private async checkThresholds(
    monitored: MonitoredContainer,
    stats: ResourceStats
  ): Promise<void> {
    const { thresholds } = this.config;

    // Check CPU threshold
    if (stats.cpuPercent > thresholds.cpuPercent) {
      monitored.consecutiveHighCpu++;
      if (monitored.consecutiveHighCpu >= 3) {
        await this.emitEvent({
          type: 'resource_limit_exceeded',
          containerId: monitored.containerId,
          agentId: monitored.agentId,
          agentType: monitored.agentType,
          timestamp: new Date(),
          details: {
            resource: 'cpu',
            current: stats.cpuPercent,
            threshold: thresholds.cpuPercent,
          },
        });
      }
    } else {
      monitored.consecutiveHighCpu = 0;
    }

    // Check memory threshold
    if (stats.memoryPercent > thresholds.memoryPercent) {
      monitored.consecutiveHighMemory++;

      // OOM prevention
      if (
        this.config.enableOomPrevention &&
        stats.memoryPercent > this.config.oomPreventionThreshold
      ) {
        await this.emitEvent({
          type: 'oom_killed',
          containerId: monitored.containerId,
          agentId: monitored.agentId,
          agentType: monitored.agentType,
          timestamp: new Date(),
          details: {
            memoryPercent: stats.memoryPercent,
            threshold: this.config.oomPreventionThreshold,
            action: 'container_restart_recommended',
          },
        });
      } else if (monitored.consecutiveHighMemory >= 3) {
        await this.emitEvent({
          type: 'resource_limit_exceeded',
          containerId: monitored.containerId,
          agentId: monitored.agentId,
          agentType: monitored.agentType,
          timestamp: new Date(),
          details: {
            resource: 'memory',
            current: stats.memoryPercent,
            threshold: thresholds.memoryPercent,
          },
        });
      }
    } else {
      monitored.consecutiveHighMemory = 0;
    }
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

  /**
   * Get monitoring status
   */
  getStatus(): {
    running: boolean;
    containerCount: number;
    intervalMs: number;
  } {
    return {
      running: this.isRunning,
      containerCount: this.containers.size,
      intervalMs: this.config.intervalMs,
    };
  }
}
