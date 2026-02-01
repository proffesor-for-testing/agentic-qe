/**
 * Agentic QE v3 - Plugin Loader
 * Dynamic domain plugin loading with lazy initialization
 */

import { DomainName } from '../shared/types';
import { DomainPlugin, PluginLoader, EventBus, MemoryBackend } from './interfaces';

type PluginFactory = (eventBus: EventBus, memory: MemoryBackend) => Promise<DomainPlugin>;

export class DefaultPluginLoader implements PluginLoader {
  private plugins: Map<DomainName, DomainPlugin> = new Map();
  private factories: Map<DomainName, PluginFactory> = new Map();
  private loading: Map<DomainName, Promise<DomainPlugin>> = new Map();

  constructor(
    private readonly eventBus: EventBus,
    private readonly memory: MemoryBackend,
    _lazyLoading: boolean = true // Reserved for future use
  ) {}

  /**
   * Register a plugin factory for a domain
   */
  registerFactory(domain: DomainName, factory: PluginFactory): void {
    this.factories.set(domain, factory);
  }

  async load(domain: DomainName): Promise<DomainPlugin> {
    // Return if already loaded
    const existing = this.plugins.get(domain);
    if (existing) {
      return existing;
    }

    // Check if currently loading (prevent duplicate loads)
    const loadingPromise = this.loading.get(domain);
    if (loadingPromise) {
      return loadingPromise;
    }

    // Get factory
    const factory = this.factories.get(domain);
    if (!factory) {
      const registeredDomains = Array.from(this.factories.keys());
      throw new Error(
        `No factory registered for domain: ${domain}\n` +
        `This usually means the domain is not enabled in your config.\n` +
        `Registered domains: ${registeredDomains.join(', ')}\n` +
        `Fix: Add '${domain}' to domains.enabled in .agentic-qe/config.yaml, ` +
        `or run 'aqe init --auto-migrate' to enable all domains.`
      );
    }

    // Start loading
    const promise = this.loadPlugin(domain, factory);
    this.loading.set(domain, promise);

    try {
      const plugin = await promise;
      this.plugins.set(domain, plugin);
      return plugin;
    } finally {
      this.loading.delete(domain);
    }
  }

  private async loadPlugin(
    _domain: DomainName, // Reserved for future logging/metrics
    factory: PluginFactory
  ): Promise<DomainPlugin> {
    // Create plugin instance
    const plugin = await factory(this.eventBus, this.memory);

    // Load dependencies first
    for (const dep of plugin.dependencies) {
      if (!this.isLoaded(dep)) {
        await this.load(dep);
      }
    }

    // Initialize plugin
    await plugin.initialize();

    return plugin;
  }

  async unload(domain: DomainName): Promise<void> {
    const plugin = this.plugins.get(domain);
    if (!plugin) {
      return;
    }

    // Check if other plugins depend on this one
    for (const [name, p] of this.plugins.entries()) {
      if (p.dependencies.includes(domain)) {
        throw new Error(
          `Cannot unload ${domain}: domain ${name} depends on it`
        );
      }
    }

    // Dispose plugin
    await plugin.dispose();
    this.plugins.delete(domain);
  }

  isLoaded(domain: DomainName): boolean {
    return this.plugins.has(domain);
  }

  getLoaded(): DomainName[] {
    return Array.from(this.plugins.keys());
  }

  async loadAll(): Promise<void> {
    const registeredDomains = Array.from(this.factories.keys());

    // Sort by dependencies (topological sort)
    const sorted = this.topologicalSort(registeredDomains);

    // Load in order
    for (const domain of sorted) {
      await this.load(domain);
    }
  }

  private topologicalSort(domains: DomainName[]): DomainName[] {
    const result: DomainName[] = [];
    const visited = new Set<DomainName>();
    const visiting = new Set<DomainName>();

    const visit = (domain: DomainName): void => {
      if (visited.has(domain)) return;
      if (visiting.has(domain)) {
        throw new Error(`Circular dependency detected involving: ${domain}`);
      }

      visiting.add(domain);

      // Get dependencies from factory if not loaded
      const plugin = this.plugins.get(domain);
      const deps = plugin?.dependencies ?? [];

      for (const dep of deps) {
        if (domains.includes(dep)) {
          visit(dep);
        }
      }

      visiting.delete(domain);
      visited.add(domain);
      result.push(domain);
    };

    for (const domain of domains) {
      visit(domain);
    }

    return result;
  }

  /**
   * Get a loaded plugin
   */
  getPlugin(domain: DomainName): DomainPlugin | undefined {
    return this.plugins.get(domain);
  }

  /**
   * Dispose all plugins
   */
  async disposeAll(): Promise<void> {
    // Unload in reverse dependency order
    const loaded = [...this.getLoaded()].reverse();

    for (const domain of loaded) {
      try {
        await this.unload(domain);
      } catch {
        // Force remove on error
        this.plugins.delete(domain);
      }
    }
  }
}
