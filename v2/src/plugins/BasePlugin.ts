/**
 * Base Plugin Class
 * Phase 3 B2: Extensible Test Framework Adapters
 *
 * Provides a base implementation for plugins with common functionality.
 * Extend this class to create custom plugins more easily.
 */

import {
  Plugin,
  PluginMetadata,
  PluginContext,
  PluginCategory,
} from './types';

/**
 * Base plugin implementation with common functionality
 */
export abstract class BasePlugin implements Plugin {
  protected context?: PluginContext;
  private _healthy = true;

  /**
   * Plugin metadata - must be provided by subclass
   */
  abstract readonly metadata: PluginMetadata;

  /**
   * Called when plugin is loaded
   */
  onLoad(context: PluginContext): void {
    this.context = context;
    this.log('debug', 'Plugin loaded');
  }

  /**
   * Called when plugin is activated
   * Override in subclass for custom activation logic
   */
  async onActivate(context: PluginContext): Promise<void> {
    this.context = context;
    this.log('info', 'Plugin activated');
  }

  /**
   * Called when plugin is deactivated
   * Override in subclass for custom deactivation logic
   */
  async onDeactivate(_context: PluginContext): Promise<void> {
    this.log('info', 'Plugin deactivated');
  }

  /**
   * Called when plugin is unloaded
   */
  onUnload(_context: PluginContext): void {
    this.context = undefined;
    this.log('debug', 'Plugin unloaded');
  }

  /**
   * Called when configuration changes
   */
  onConfigChange(_context: PluginContext, changes: Record<string, unknown>): void {
    this.log('debug', 'Config changed', changes);
  }

  /**
   * Health check - returns true if plugin is healthy
   */
  async healthCheck(): Promise<boolean> {
    return this._healthy;
  }

  /**
   * Mark plugin as unhealthy
   */
  protected setUnhealthy(): void {
    this._healthy = false;
  }

  /**
   * Mark plugin as healthy
   */
  protected setHealthy(): void {
    this._healthy = true;
  }

  /**
   * Log a message using the plugin's logger
   */
  protected log(level: 'debug' | 'info' | 'warn' | 'error', message: string, ...args: unknown[]): void {
    if (this.context?.logger) {
      this.context.logger[level](message, ...args);
    } else {
      console[level](`[${this.metadata.id}] ${message}`, ...args);
    }
  }

  /**
   * Get configuration value
   */
  protected getConfig<T>(key: string, defaultValue?: T): T | undefined {
    return this.context?.config.get(key, defaultValue);
  }

  /**
   * Set configuration value
   */
  protected setConfig<T>(key: string, value: T): void {
    this.context?.config.set(key, value);
  }

  /**
   * Emit an event
   */
  protected emit(event: string, data?: unknown): void {
    this.context?.events.emit(event, data);
  }

  /**
   * Listen for an event
   */
  protected on(event: string, handler: (data: unknown) => void): () => void {
    return this.context?.events.on(event, handler) ?? (() => {});
  }

  /**
   * Get persistent storage value
   */
  protected async getStoredValue<T>(key: string): Promise<T | undefined> {
    return this.context?.storage.get<T>(key);
  }

  /**
   * Set persistent storage value
   */
  protected async setStoredValue<T>(key: string, value: T): Promise<void> {
    await this.context?.storage.set(key, value);
  }

  /**
   * Get another plugin
   */
  protected getPlugin<T extends Plugin>(id: string): T | undefined {
    return this.context?.pluginManager.getPlugin<T>(id);
  }

  /**
   * Register a service for other plugins to use
   */
  protected registerService<T>(name: string, service: T): void {
    this.context?.pluginManager.registerService(name, service);
  }

  /**
   * Get a registered service
   */
  protected getService<T>(name: string): T | undefined {
    return this.context?.pluginManager.getService<T>(name);
  }
}

/**
 * Helper to create plugin metadata
 */
export function createPluginMetadata(
  options: {
    id: string;
    name: string;
    version: string;
    description: string;
    author: string;
    category: PluginCategory;
    minAgenticQEVersion?: string;
    dependencies?: { pluginId: string; versionRange: string; optional?: boolean }[];
  }
): PluginMetadata {
  return {
    id: options.id,
    name: options.name,
    version: options.version,
    description: options.description,
    author: options.author,
    category: options.category,
    minAgenticQEVersion: options.minAgenticQEVersion || '2.0.0',
    dependencies: options.dependencies,
  };
}
