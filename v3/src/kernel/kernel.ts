/**
 * Agentic QE v3 - QE Kernel
 * Microkernel implementation coordinating all domains
 */

import { DomainName, ALL_DOMAINS } from '../shared/types';
import {
  QEKernel,
  EventBus,
  AgentCoordinator,
  PluginLoader,
  MemoryBackend,
  KernelHealth,
  KernelConfig,
  DomainHealth,
} from './interfaces';
import { InMemoryEventBus } from './event-bus';
import { DefaultAgentCoordinator } from './agent-coordinator';
import { DefaultPluginLoader } from './plugin-loader';
import { InMemoryBackend } from './memory-backend';

const DEFAULT_CONFIG: KernelConfig = {
  maxConcurrentAgents: 15,
  memoryBackend: 'hybrid',
  hnswEnabled: true,
  lazyLoading: true,
  enabledDomains: [...ALL_DOMAINS],
};

export class QEKernelImpl implements QEKernel {
  private _eventBus: EventBus;
  private _coordinator: AgentCoordinator;
  private _plugins: PluginLoader;
  private _memory: MemoryBackend;
  private _config: KernelConfig;
  private _startTime: Date;
  private _initialized = false;

  constructor(config: Partial<KernelConfig> = {}) {
    this._config = { ...DEFAULT_CONFIG, ...config };
    this._startTime = new Date();

    // Initialize core components
    this._memory = new InMemoryBackend();
    this._eventBus = new InMemoryEventBus();
    this._coordinator = new DefaultAgentCoordinator(this._config.maxConcurrentAgents);
    this._plugins = new DefaultPluginLoader(
      this._eventBus,
      this._memory,
      this._config.lazyLoading
    );
  }

  get eventBus(): EventBus {
    return this._eventBus;
  }

  get coordinator(): AgentCoordinator {
    return this._coordinator;
  }

  get plugins(): PluginLoader {
    return this._plugins;
  }

  get memory(): MemoryBackend {
    return this._memory;
  }

  async initialize(): Promise<void> {
    if (this._initialized) {
      return;
    }

    // Initialize memory backend
    await this._memory.initialize();

    // Load plugins based on configuration
    if (!this._config.lazyLoading) {
      await this._plugins.loadAll();
    }

    this._initialized = true;
  }

  async dispose(): Promise<void> {
    // Dispose in reverse order of initialization
    await (this._plugins as DefaultPluginLoader).disposeAll();
    await this._coordinator.dispose();
    await this._eventBus.dispose();
    await this._memory.dispose();

    this._initialized = false;
  }

  getDomainAPI<T>(domain: DomainName): T | undefined {
    const plugin = (this._plugins as DefaultPluginLoader).getPlugin(domain);
    return plugin?.getAPI<T>();
  }

  getHealth(): KernelHealth {
    const agentList = this._coordinator.listAgents();
    const domains: Record<string, DomainHealth> = {};

    // Get health for loaded domains
    for (const domain of this._plugins.getLoaded()) {
      const plugin = (this._plugins as DefaultPluginLoader).getPlugin(domain);
      if (plugin) {
        domains[domain] = plugin.getHealth();
      }
    }

    // Add placeholder for unloaded domains
    for (const domain of ALL_DOMAINS) {
      if (!domains[domain]) {
        domains[domain] = {
          status: 'healthy',
          agents: { total: 0, active: 0, idle: 0, failed: 0 },
          errors: [],
        };
      }
    }

    const activeCount = this._coordinator.getActiveCount();
    const memStats = (this._memory as InMemoryBackend).getStats();

    return {
      status: this.determineOverallStatus(domains),
      uptime: Date.now() - this._startTime.getTime(),
      domains: domains as Record<DomainName, DomainHealth>,
      agents: {
        total: agentList.length,
        active: activeCount,
        maxAllowed: this._config.maxConcurrentAgents,
      },
      memory: {
        used: memStats.entries + memStats.vectors,
        available: Number.MAX_SAFE_INTEGER, // In-memory has no limit
      },
    };
  }

  private determineOverallStatus(
    domains: Record<string, DomainHealth>
  ): 'healthy' | 'degraded' | 'unhealthy' {
    const statuses = Object.values(domains).map((d) => d.status);

    if (statuses.some((s) => s === 'unhealthy')) {
      return 'unhealthy';
    }
    if (statuses.some((s) => s === 'degraded')) {
      return 'degraded';
    }
    return 'healthy';
  }

  getConfig(): KernelConfig {
    return { ...this._config };
  }
}

// Factory function
export function createKernel(config?: Partial<KernelConfig>): QEKernel {
  return new QEKernelImpl(config);
}
