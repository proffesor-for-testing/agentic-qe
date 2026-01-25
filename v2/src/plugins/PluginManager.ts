/**
 * Plugin Manager Implementation
 * Phase 3 B2: Extensible Test Framework Adapters
 *
 * Handles plugin lifecycle:
 * - Discovery and registration
 * - Loading with lazy/eager strategies
 * - Activation and deactivation
 * - Hot-reload for development
 * - Dependency resolution
 * - Error isolation
 */

import { EventEmitter } from 'events';
import * as path from 'path';
import * as fs from 'fs/promises';
import { watch, FSWatcher } from 'fs';
import * as semver from 'semver';
import {
  Plugin,
  PluginMetadata,
  PluginState,
  PluginContext,
  PluginCategory,
  PluginRegistration,
  PluginManagerConfig,
  PluginManagerAPI,
  PluginLogger,
  PluginConfigStore,
  PluginEventBus,
  PluginStorage,
  PluginDiscoveryResult,
  PluginFactory,
  PluginModule,
} from './types';

// Package version for compatibility checking
const AGENTIC_QE_VERSION = '2.6.0';

/**
 * Default plugin manager configuration
 */
const DEFAULT_CONFIG: PluginManagerConfig = {
  pluginDirs: ['./plugins', './node_modules/@agentic-qe'],
  hotReload: process.env.NODE_ENV === 'development',
  loadTimeout: 5000,
  activationTimeout: 10000,
  sandboxing: true,
  autoActivate: false,
  pluginConfigs: {},
};

/**
 * Plugin Manager - Central hub for plugin lifecycle management
 */
export class PluginManager extends EventEmitter {
  private readonly config: PluginManagerConfig;
  private readonly plugins: Map<string, PluginRegistration> = new Map();
  private readonly services: Map<string, unknown> = new Map();
  private readonly pluginStorage: Map<string, Map<string, unknown>> = new Map();
  private initialized = false;
  private fileWatchers: Map<string, FSWatcher> = new Map();
  private pluginPathMap: Map<string, string> = new Map(); // path -> pluginId mapping

  constructor(config: Partial<PluginManagerConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize the plugin manager
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.log('info', 'Initializing Plugin Manager');

    // Discover plugins
    const discovery = await this.discoverPlugins();
    this.log('info', `Discovered ${discovery.plugins.length} plugins`);

    // Load discovered plugins
    for (const metadata of discovery.plugins) {
      try {
        await this.loadPlugin(metadata.id);
      } catch (error) {
        this.log('error', `Failed to load plugin ${metadata.id}`, error);
      }
    }

    // Auto-activate if configured
    if (this.config.autoActivate) {
      await this.activateAll();
    }

    // Setup hot reload if enabled
    if (this.config.hotReload) {
      await this.setupHotReload();
    }

    this.initialized = true;
    this.log('info', 'Plugin Manager initialized');
  }

  /**
   * Discover plugins in configured directories
   * This method actually loads plugins from disk using dynamic import
   */
  async discoverPlugins(): Promise<PluginDiscoveryResult> {
    const startTime = Date.now();
    const plugins: PluginMetadata[] = [];
    const errors: { path: string; error: string }[] = [];

    for (const dir of this.config.pluginDirs) {
      try {
        const resolvedDir = path.resolve(dir);
        const exists = await fs.access(resolvedDir).then(() => true).catch(() => false);

        if (!exists) {
          continue;
        }

        const entries = await fs.readdir(resolvedDir, { withFileTypes: true });

        for (const entry of entries) {
          if (!entry.isDirectory()) continue;

          const pluginPath = path.join(resolvedDir, entry.name);
          const packageJsonPath = path.join(pluginPath, 'package.json');

          try {
            const packageJson = JSON.parse(
              await fs.readFile(packageJsonPath, 'utf-8')
            );

            // Check if it's an agentic-qe plugin
            if (packageJson.agenticQEPlugin) {
              const metadata = this.extractMetadata(packageJson, pluginPath);
              if (this.isCompatible(metadata)) {
                // Actually load the plugin from disk
                const plugin = await this.loadPluginFromPath(pluginPath);
                if (plugin) {
                  // Register the loaded plugin
                  if (!this.plugins.has(plugin.metadata.id)) {
                    await this.registerPlugin(plugin);
                    plugins.push(plugin.metadata);
                    this.log('info', `Discovered and loaded plugin: ${plugin.metadata.id}`);
                  }
                } else {
                  // Fallback: just report metadata if loading failed
                  plugins.push(metadata);
                  this.emit('plugin:discovered', { metadata });
                }
              }
            }
          } catch (error) {
            errors.push({
              path: pluginPath,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      } catch (error) {
        errors.push({
          path: dir,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      plugins,
      errors,
      duration: Date.now() - startTime,
    };
  }

  /**
   * Register a plugin programmatically
   */
  async registerPlugin(plugin: Plugin): Promise<void> {
    const { id } = plugin.metadata;

    if (this.plugins.has(id)) {
      throw new Error(`Plugin ${id} is already registered`);
    }

    if (!this.isCompatible(plugin.metadata)) {
      throw new Error(
        `Plugin ${id} is not compatible with agentic-qe ${AGENTIC_QE_VERSION}`
      );
    }

    const registration: PluginRegistration = {
      plugin,
      state: PluginState.DISCOVERED,
      dependenciesResolved: false,
    };

    this.plugins.set(id, registration);
    this.emit('plugin:discovered', { metadata: plugin.metadata });
    this.log('info', `Registered plugin: ${id}`);
  }

  /**
   * Load a plugin by ID
   */
  async loadPlugin(pluginId: string): Promise<void> {
    const registration = this.plugins.get(pluginId);

    if (!registration) {
      throw new Error(`Plugin ${pluginId} not found`);
    }

    if (registration.state !== PluginState.DISCOVERED) {
      return; // Already loaded or loading
    }

    this.emit('plugin:loading', { pluginId });
    registration.state = PluginState.LOADING;

    try {
      // Resolve dependencies first
      await this.resolveDependencies(pluginId);

      // Create plugin context
      const context = this.createPluginContext(registration.plugin);
      registration.context = context;

      // Call onLoad if defined
      if (registration.plugin.onLoad) {
        await this.withTimeout(
          Promise.resolve(registration.plugin.onLoad(context)),
          this.config.loadTimeout,
          `Plugin ${pluginId} load timeout`
        );
      }

      registration.state = PluginState.LOADED;
      registration.loadedAt = new Date();
      this.emit('plugin:loaded', { pluginId });
      this.log('info', `Loaded plugin: ${pluginId}`);
    } catch (error) {
      registration.state = PluginState.ERROR;
      registration.lastError = error instanceof Error ? error : new Error(String(error));
      this.emit('plugin:error', { pluginId, error: registration.lastError });
      throw error;
    }
  }

  /**
   * Activate a plugin
   */
  async activatePlugin(pluginId: string): Promise<void> {
    const registration = this.plugins.get(pluginId);

    if (!registration) {
      throw new Error(`Plugin ${pluginId} not found`);
    }

    // Load first if needed
    if (registration.state === PluginState.DISCOVERED) {
      await this.loadPlugin(pluginId);
    }

    if (registration.state !== PluginState.LOADED &&
        registration.state !== PluginState.INACTIVE) {
      return; // Already active or activating
    }

    this.emit('plugin:activating', { pluginId });
    registration.state = PluginState.ACTIVATING;

    try {
      // Ensure dependencies are activated first
      for (const dep of registration.plugin.metadata.dependencies || []) {
        if (!dep.optional) {
          await this.activatePlugin(dep.pluginId);
        }
      }

      // Call onActivate if defined
      if (registration.plugin.onActivate && registration.context) {
        await this.withTimeout(
          registration.plugin.onActivate(registration.context),
          this.config.activationTimeout,
          `Plugin ${pluginId} activation timeout`
        );
      }

      registration.state = PluginState.ACTIVE;
      registration.activatedAt = new Date();
      this.emit('plugin:activated', { pluginId });
      this.log('info', `Activated plugin: ${pluginId}`);
    } catch (error) {
      registration.state = PluginState.ERROR;
      registration.lastError = error instanceof Error ? error : new Error(String(error));
      this.emit('plugin:error', { pluginId, error: registration.lastError });
      throw error;
    }
  }

  /**
   * Deactivate a plugin
   */
  async deactivatePlugin(pluginId: string): Promise<void> {
    const registration = this.plugins.get(pluginId);

    if (!registration) {
      throw new Error(`Plugin ${pluginId} not found`);
    }

    if (registration.state !== PluginState.ACTIVE) {
      return;
    }

    this.emit('plugin:deactivating', { pluginId });
    registration.state = PluginState.DEACTIVATING;

    try {
      // Deactivate dependents first
      for (const [id, reg] of this.plugins) {
        const deps = reg.plugin.metadata.dependencies || [];
        if (deps.some(d => d.pluginId === pluginId)) {
          await this.deactivatePlugin(id);
        }
      }

      // Call onDeactivate if defined
      if (registration.plugin.onDeactivate && registration.context) {
        await registration.plugin.onDeactivate(registration.context);
      }

      registration.state = PluginState.INACTIVE;
      this.emit('plugin:deactivated', { pluginId });
      this.log('info', `Deactivated plugin: ${pluginId}`);
    } catch (error) {
      registration.state = PluginState.ERROR;
      registration.lastError = error instanceof Error ? error : new Error(String(error));
      this.emit('plugin:error', { pluginId, error: registration.lastError });
      throw error;
    }
  }

  /**
   * Unload a plugin
   */
  async unloadPlugin(pluginId: string): Promise<void> {
    const registration = this.plugins.get(pluginId);

    if (!registration) {
      return;
    }

    // Deactivate first if active
    if (registration.state === PluginState.ACTIVE) {
      await this.deactivatePlugin(pluginId);
    }

    // Call onUnload if defined
    if (registration.plugin.onUnload && registration.context) {
      registration.plugin.onUnload(registration.context);
    }

    // Clear storage
    this.pluginStorage.delete(pluginId);

    this.plugins.delete(pluginId);
    this.emit('plugin:unloaded', { pluginId });
    this.log('info', `Unloaded plugin: ${pluginId}`);
  }

  /**
   * Activate all loaded plugins
   */
  async activateAll(): Promise<void> {
    for (const [pluginId, registration] of this.plugins) {
      if (registration.state === PluginState.LOADED ||
          registration.state === PluginState.INACTIVE) {
        try {
          await this.activatePlugin(pluginId);
        } catch (error) {
          this.log('error', `Failed to activate plugin ${pluginId}`, error);
        }
      }
    }
  }

  /**
   * Deactivate all plugins
   */
  async deactivateAll(): Promise<void> {
    for (const [pluginId, registration] of this.plugins) {
      if (registration.state === PluginState.ACTIVE) {
        try {
          await this.deactivatePlugin(pluginId);
        } catch (error) {
          this.log('error', `Failed to deactivate plugin ${pluginId}`, error);
        }
      }
    }
  }

  /**
   * Get a plugin by ID
   */
  getPlugin<T extends Plugin = Plugin>(pluginId: string): T | undefined {
    const registration = this.plugins.get(pluginId);
    return registration?.plugin as T | undefined;
  }

  /**
   * Check if plugin exists
   */
  hasPlugin(pluginId: string): boolean {
    return this.plugins.has(pluginId);
  }

  /**
   * Get plugins by category
   */
  getPluginsByCategory(category: PluginCategory): Plugin[] {
    const result: Plugin[] = [];
    for (const registration of this.plugins.values()) {
      if (registration.plugin.metadata.category === category) {
        result.push(registration.plugin);
      }
    }
    return result;
  }

  /**
   * Get all active plugins
   */
  getActivePlugins(): Plugin[] {
    const result: Plugin[] = [];
    for (const registration of this.plugins.values()) {
      if (registration.state === PluginState.ACTIVE) {
        result.push(registration.plugin);
      }
    }
    return result;
  }

  /**
   * Get all registered plugins
   */
  getAllPlugins(): Plugin[] {
    return Array.from(this.plugins.values()).map(r => r.plugin);
  }

  /**
   * Check if plugin manager is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get plugin state
   */
  getPluginState(pluginId: string): PluginState | undefined {
    return this.plugins.get(pluginId)?.state;
  }

  /**
   * Register a service
   */
  registerService<T>(name: string, service: T): void {
    this.services.set(name, service);
    this.log('debug', `Registered service: ${name}`);
  }

  /**
   * Get a service
   */
  getService<T>(name: string): T | undefined {
    return this.services.get(name) as T | undefined;
  }

  /**
   * Shutdown the plugin manager
   */
  async shutdown(): Promise<void> {
    this.log('info', 'Shutting down Plugin Manager');

    // Stop file watchers
    for (const [dir, watcher] of this.fileWatchers) {
      this.log('debug', `Closing file watcher for: ${dir}`);
      watcher.close();
    }
    this.fileWatchers.clear();
    this.pluginPathMap.clear();

    // Deactivate all plugins
    await this.deactivateAll();

    // Unload all plugins
    for (const pluginId of this.plugins.keys()) {
      await this.unloadPlugin(pluginId);
    }

    this.services.clear();
    this.pluginStorage.clear();
    this.initialized = false;

    this.log('info', 'Plugin Manager shutdown complete');
  }

  // === Private Methods ===

  private extractMetadata(packageJson: any, pluginPath: string): PluginMetadata {
    const pluginConfig = packageJson.agenticQEPlugin || {};

    return {
      id: packageJson.name,
      name: pluginConfig.displayName || packageJson.name,
      version: packageJson.version,
      description: packageJson.description || '',
      author: typeof packageJson.author === 'string'
        ? packageJson.author
        : packageJson.author?.name || 'Unknown',
      homepage: packageJson.homepage,
      license: packageJson.license,
      keywords: packageJson.keywords,
      minAgenticQEVersion: pluginConfig.minVersion || '2.0.0',
      maxAgenticQEVersion: pluginConfig.maxVersion,
      dependencies: pluginConfig.dependencies,
      category: pluginConfig.category || PluginCategory.UTILITY,
      enabledByDefault: pluginConfig.enabledByDefault ?? false,
    };
  }

  private isCompatible(metadata: PluginMetadata): boolean {
    const { minAgenticQEVersion, maxAgenticQEVersion } = metadata;

    if (!semver.valid(AGENTIC_QE_VERSION)) {
      return true; // Skip check if version is invalid
    }

    if (minAgenticQEVersion && !semver.gte(AGENTIC_QE_VERSION, minAgenticQEVersion)) {
      return false;
    }

    if (maxAgenticQEVersion && !semver.lte(AGENTIC_QE_VERSION, maxAgenticQEVersion)) {
      return false;
    }

    return true;
  }

  private async resolveDependencies(pluginId: string): Promise<void> {
    const registration = this.plugins.get(pluginId);
    if (!registration || registration.dependenciesResolved) {
      return;
    }

    const dependencies = registration.plugin.metadata.dependencies || [];

    for (const dep of dependencies) {
      const depRegistration = this.plugins.get(dep.pluginId);

      if (!depRegistration) {
        if (dep.optional) {
          this.log('warn', `Optional dependency ${dep.pluginId} not found for ${pluginId}`);
          continue;
        }
        throw new Error(`Required dependency ${dep.pluginId} not found for ${pluginId}`);
      }

      // Check version
      if (!semver.satisfies(depRegistration.plugin.metadata.version, dep.versionRange)) {
        if (dep.optional) {
          this.log('warn', `Optional dependency ${dep.pluginId} version mismatch for ${pluginId}`);
          continue;
        }
        throw new Error(
          `Dependency ${dep.pluginId} version ${depRegistration.plugin.metadata.version} ` +
          `does not satisfy ${dep.versionRange} for ${pluginId}`
        );
      }

      // Load dependency first
      await this.loadPlugin(dep.pluginId);
    }

    registration.dependenciesResolved = true;
  }

  private createPluginContext(plugin: Plugin): PluginContext {
    const pluginId = plugin.metadata.id;

    // Create plugin-specific storage
    if (!this.pluginStorage.has(pluginId)) {
      this.pluginStorage.set(pluginId, new Map());
    }
    const storage = this.pluginStorage.get(pluginId)!;

    const context: PluginContext = {
      metadata: plugin.metadata,
      agenticQEVersion: AGENTIC_QE_VERSION,
      pluginManager: this.createPluginManagerAPI(),
      logger: this.createPluginLogger(pluginId),
      config: this.createPluginConfigStore(pluginId),
      events: this.createPluginEventBus(pluginId),
      storage: this.createPluginStorage(pluginId, storage),
    };

    return context;
  }

  private createPluginManagerAPI(): PluginManagerAPI {
    return {
      getPlugin: <T extends Plugin>(id: string) => this.getPlugin<T>(id),
      hasPlugin: (id: string) => this.hasPlugin(id),
      getPluginsByCategory: (category: PluginCategory) => this.getPluginsByCategory(category),
      registerService: <T>(name: string, service: T) => this.registerService(name, service),
      getService: <T>(name: string) => this.getService<T>(name),
      requestActivation: (pluginId: string) => this.activatePlugin(pluginId),
    };
  }

  private createPluginLogger(pluginId: string): PluginLogger {
    const prefix = `[Plugin:${pluginId}]`;
    return {
      debug: (msg: string, ...args: unknown[]) => this.log('debug', `${prefix} ${msg}`, ...args),
      info: (msg: string, ...args: unknown[]) => this.log('info', `${prefix} ${msg}`, ...args),
      warn: (msg: string, ...args: unknown[]) => this.log('warn', `${prefix} ${msg}`, ...args),
      error: (msg: string, ...args: unknown[]) => this.log('error', `${prefix} ${msg}`, ...args),
    };
  }

  private createPluginConfigStore(pluginId: string): PluginConfigStore {
    const config = this.config.pluginConfigs[pluginId] || {};
    const store = new Map<string, unknown>(Object.entries(config));

    return {
      get: <T>(key: string, defaultValue?: T) =>
        (store.get(key) as T) ?? defaultValue,
      set: <T>(key: string, value: T) => {
        store.set(key, value);
        this.emit('plugin:configChanged', { pluginId, changes: { [key]: value } });
      },
      has: (key: string) => store.has(key),
      getAll: () => Object.fromEntries(store),
      reset: () => {
        store.clear();
        Object.entries(config).forEach(([k, v]) => store.set(k, v));
      },
    };
  }

  private createPluginEventBus(pluginId: string): PluginEventBus {
    const prefix = `plugin:${pluginId}:`;
    const handlers = new Map<string, Set<(data: unknown) => void>>();

    return {
      emit: (event: string, data?: unknown) => {
        this.emit(`${prefix}${event}`, data);
      },
      on: (event: string, handler: (data: unknown) => void) => {
        const fullEvent = `${prefix}${event}`;
        if (!handlers.has(fullEvent)) {
          handlers.set(fullEvent, new Set());
        }
        handlers.get(fullEvent)!.add(handler);
        this.on(fullEvent, handler);
        return () => {
          handlers.get(fullEvent)?.delete(handler);
          this.off(fullEvent, handler);
        };
      },
      once: (event: string, handler: (data: unknown) => void) => {
        const fullEvent = `${prefix}${event}`;
        this.once(fullEvent, handler);
        return () => this.off(fullEvent, handler);
      },
      off: (event: string) => {
        const fullEvent = `${prefix}${event}`;
        const eventHandlers = handlers.get(fullEvent);
        if (eventHandlers) {
          for (const handler of eventHandlers) {
            this.off(fullEvent, handler);
          }
          handlers.delete(fullEvent);
        }
      },
    };
  }

  private createPluginStorage(
    pluginId: string,
    storage: Map<string, unknown>
  ): PluginStorage {
    return {
      get: async <T>(key: string) => storage.get(key) as T | undefined,
      set: async <T>(key: string, value: T) => { storage.set(key, value); },
      delete: async (key: string) => { storage.delete(key); },
      keys: async () => Array.from(storage.keys()),
      clear: async () => { storage.clear(); },
    };
  }

  private async setupHotReload(): Promise<void> {
    this.log('info', 'Setting up hot reload for plugin development');

    // Track reload debouncing per plugin
    const reloadDebounce = new Map<string, NodeJS.Timeout>();
    const DEBOUNCE_MS = 300; // Debounce rapid file changes

    for (const dir of this.config.pluginDirs) {
      try {
        const resolvedDir = path.resolve(dir);
        const exists = await fs.access(resolvedDir).then(() => true).catch(() => false);

        if (!exists) {
          continue;
        }

        // Create watcher for this directory
        const watcher = watch(resolvedDir, { recursive: true }, async (eventType, filename) => {
          if (!filename) return;

          const fullPath = path.join(resolvedDir, filename);
          const pluginId = this.getPluginIdFromPath(fullPath);

          if (!pluginId) {
            // Not a tracked plugin, skip
            return;
          }

          // Debounce rapid changes (editors often save multiple times)
          const existingTimeout = reloadDebounce.get(pluginId);
          if (existingTimeout) {
            clearTimeout(existingTimeout);
          }

          reloadDebounce.set(pluginId, setTimeout(async () => {
            reloadDebounce.delete(pluginId);
            try {
              this.log('info', `Hot reload triggered for ${pluginId} (${eventType}: ${filename})`);
              await this.reloadPlugin(pluginId);
              this.emit('plugin:hotReloaded', { pluginId, filename, eventType });
            } catch (error) {
              this.log('error', `Hot reload failed for ${pluginId}`, error);
              this.emit('plugin:hotReloadError', { pluginId, error });
            }
          }, DEBOUNCE_MS));
        });

        this.fileWatchers.set(resolvedDir, watcher);
        this.log('debug', `Watching plugin directory: ${resolvedDir}`);
      } catch (error) {
        this.log('warn', `Failed to setup hot reload for ${dir}`, error);
      }
    }

    this.log('info', `Hot reload enabled, watching ${this.fileWatchers.size} directories`);
  }

  /**
   * Reload a plugin (deactivate, unload, rediscover, load, reactivate)
   */
  async reloadPlugin(pluginId: string): Promise<void> {
    const registration = this.plugins.get(pluginId);

    if (!registration) {
      throw new Error(`Plugin ${pluginId} not found`);
    }

    const wasActive = registration.state === PluginState.ACTIVE;
    const pluginPath = this.getPluginPath(pluginId);

    this.log('info', `Reloading plugin: ${pluginId}`);
    this.emit('plugin:reloading', { pluginId });

    // Step 1: Deactivate if active
    if (wasActive) {
      await this.deactivatePlugin(pluginId);
    }

    // Step 2: Unload the plugin
    await this.unloadPlugin(pluginId);

    // Step 3: Re-discover and load from disk
    if (pluginPath) {
      try {
        const plugin = await this.loadPluginFromPath(pluginPath);
        if (plugin) {
          await this.registerPlugin(plugin);
          await this.loadPlugin(pluginId);

          // Step 4: Reactivate if it was active before
          if (wasActive) {
            await this.activatePlugin(pluginId);
          }

          this.log('info', `Successfully reloaded plugin: ${pluginId}`);
          this.emit('plugin:reloaded', { pluginId });
        }
      } catch (error) {
        this.log('error', `Failed to reload plugin from ${pluginPath}`, error);
        throw error;
      }
    }
  }

  /**
   * Get plugin ID from a file path within plugin directories
   */
  private getPluginIdFromPath(filePath: string): string | undefined {
    // Check if we already have a mapping
    for (const [mappedPath, pluginId] of this.pluginPathMap) {
      if (filePath.startsWith(mappedPath)) {
        return pluginId;
      }
    }

    // Try to determine plugin from package.json in parent directories
    let currentDir = path.dirname(filePath);
    const roots = this.config.pluginDirs.map(d => path.resolve(d));

    while (currentDir && !roots.some(r => currentDir === r || currentDir === path.dirname(r))) {
      const packageJsonPath = path.join(currentDir, 'package.json');

      // Check synchronously if we have a registered plugin at this path
      for (const [pluginId, registration] of this.plugins) {
        if (registration.plugin.metadata.id === pluginId) {
          // Check if this plugin's path matches
          const existingPath = this.getPluginPath(pluginId);
          if (existingPath && currentDir.startsWith(existingPath)) {
            this.pluginPathMap.set(currentDir, pluginId);
            return pluginId;
          }
        }
      }

      currentDir = path.dirname(currentDir);
    }

    return undefined;
  }

  /**
   * Get the filesystem path for a plugin
   */
  private getPluginPath(pluginId: string): string | undefined {
    // Reverse lookup from pluginPathMap
    for (const [pluginPath, id] of this.pluginPathMap) {
      if (id === pluginId) {
        return pluginPath;
      }
    }
    return undefined;
  }

  /**
   * Load a plugin from a filesystem path
   */
  private async loadPluginFromPath(pluginPath: string): Promise<Plugin | null> {
    try {
      const packageJsonPath = path.join(pluginPath, 'package.json');
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));

      if (!packageJson.agenticQEPlugin) {
        return null;
      }

      // Determine the entry point
      const mainFile = packageJson.main || 'index.js';
      const entryPoint = path.join(pluginPath, mainFile);

      // Clear require cache for hot reload
      this.clearRequireCache(entryPoint);

      // Dynamic import the plugin
      const pluginModule = await import(entryPoint) as PluginModule;

      // Get the plugin instance from factory or direct export
      let plugin: Plugin | null = null;

      if (typeof pluginModule.createPlugin === 'function') {
        plugin = pluginModule.createPlugin();
      } else if (pluginModule.default && typeof pluginModule.default === 'object') {
        plugin = pluginModule.default as Plugin;
      } else if (pluginModule.plugin && typeof pluginModule.plugin === 'object') {
        plugin = pluginModule.plugin as Plugin;
      }

      if (plugin) {
        // Store the path mapping
        this.pluginPathMap.set(pluginPath, plugin.metadata.id);
      }

      return plugin;
    } catch (error) {
      this.log('error', `Failed to load plugin from path: ${pluginPath}`, error);
      return null;
    }
  }

  /**
   * Clear require cache for a module and its dependencies
   */
  private clearRequireCache(modulePath: string): void {
    try {
      const resolved = require.resolve(modulePath);
      const cached = require.cache[resolved];

      if (cached) {
        // Clear children first (dependencies)
        if (cached.children) {
          for (const child of cached.children) {
            // Only clear cache for files within the same plugin
            if (child.filename.startsWith(path.dirname(modulePath))) {
              this.clearRequireCache(child.filename);
            }
          }
        }
        delete require.cache[resolved];
      }
    } catch {
      // Module not in require cache, ignore
    }
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    message: string
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(message)), timeoutMs)
      ),
    ]);
  }

  private log(level: string, message: string, ...args: unknown[]): void {
    const timestamp = new Date().toISOString();
    const formattedMessage = `[${timestamp}] [PluginManager] [${level.toUpperCase()}] ${message}`;

    switch (level) {
      case 'error':
        console.error(formattedMessage, ...args);
        break;
      case 'warn':
        console.warn(formattedMessage, ...args);
        break;
      case 'debug':
        if (process.env.DEBUG) {
          console.debug(formattedMessage, ...args);
        }
        break;
      default:
        console.log(formattedMessage, ...args);
    }
  }
}

/**
 * Global plugin manager instance
 */
let globalPluginManager: PluginManager | null = null;

/**
 * Get or create the global plugin manager instance
 */
export function getPluginManager(config?: Partial<PluginManagerConfig>): PluginManager {
  if (!globalPluginManager) {
    globalPluginManager = new PluginManager(config);
  }
  return globalPluginManager;
}

/**
 * Reset the global plugin manager (for testing)
 */
export async function resetPluginManager(): Promise<void> {
  if (globalPluginManager) {
    await globalPluginManager.shutdown();
    globalPluginManager = null;
  }
}
