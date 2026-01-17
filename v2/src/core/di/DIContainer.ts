/**
 * DIContainer - Dependency Injection Container for AQE Fleet
 *
 * Provides centralized dependency management for:
 * - LLM providers (Claude, ruvllm, hybrid)
 * - Learning engines and algorithms
 * - Memory stores and pattern libraries
 * - Experience sharing protocols
 *
 * Features:
 * - Singleton and transient lifecycle management
 * - Lazy initialization
 * - Hierarchical scopes (agent-level, fleet-level)
 * - Type-safe dependency resolution
 *
 * @module core/di/DIContainer
 * @version 1.0.0
 */

import { EventEmitter } from 'events';
import { Logger } from '../../utils/Logger';

/**
 * Dependency lifecycle types
 */
export type DependencyLifecycle = 'singleton' | 'transient' | 'scoped';

/**
 * Dependency registration configuration
 */
export interface DependencyConfig<T> {
  /** Factory function to create instance */
  factory: (container: DIContainer) => T | Promise<T>;
  /** Lifecycle management */
  lifecycle: DependencyLifecycle;
  /** Optional initialization function */
  initialize?: (instance: T) => Promise<void>;
  /** Optional cleanup function */
  dispose?: (instance: T) => Promise<void>;
  /** Dependencies required before this one */
  dependencies?: string[];
}

/**
 * Registered dependency with metadata
 */
interface RegisteredDependency<T = any> {
  config: DependencyConfig<T>;
  instance?: T;
  initialized: boolean;
  initPromise?: Promise<T>;
}

/**
 * Container scope for hierarchical DI
 */
export interface DIScope {
  id: string;
  parent?: DIContainer;
  instances: Map<string, any>;
}

/**
 * DIContainer - Central dependency injection container
 *
 * Usage:
 * ```typescript
 * const container = new DIContainer();
 *
 * // Register dependencies
 * container.register('llmProvider', {
 *   factory: () => new ClaudeProvider(),
 *   lifecycle: 'singleton',
 *   initialize: async (p) => p.initialize()
 * });
 *
 * // Resolve dependencies
 * const llm = await container.resolve<ILLMProvider>('llmProvider');
 * ```
 */
export class DIContainer extends EventEmitter {
  private readonly logger: Logger;
  private readonly dependencies: Map<string, RegisteredDependency>;
  private readonly scopes: Map<string, DIScope>;
  private readonly parent?: DIContainer;
  private isDisposed: boolean;

  constructor(parent?: DIContainer) {
    super();
    this.logger = Logger.getInstance();
    this.dependencies = new Map();
    this.scopes = new Map();
    this.parent = parent;
    this.isDisposed = false;
  }

  /**
   * Register a dependency
   */
  register<T>(name: string, config: DependencyConfig<T>): this {
    if (this.isDisposed) {
      throw new Error('Container has been disposed');
    }

    if (this.dependencies.has(name)) {
      this.logger.warn(`Overwriting existing dependency: ${name}`);
    }

    this.dependencies.set(name, {
      config,
      initialized: false
    });

    this.logger.debug(`Registered dependency: ${name}`, {
      lifecycle: config.lifecycle
    });

    return this;
  }

  /**
   * Register a singleton instance directly
   */
  registerInstance<T>(name: string, instance: T): this {
    return this.register(name, {
      factory: () => instance,
      lifecycle: 'singleton'
    });
  }

  /**
   * Register a factory function
   */
  registerFactory<T>(
    name: string,
    factory: (container: DIContainer) => T | Promise<T>,
    lifecycle: DependencyLifecycle = 'transient'
  ): this {
    return this.register(name, { factory, lifecycle });
  }

  /**
   * Resolve a dependency
   */
  async resolve<T>(name: string, scope?: string): Promise<T> {
    if (this.isDisposed) {
      throw new Error('Container has been disposed');
    }

    // Check scoped instances first
    if (scope) {
      const scopedInstance = this.getScopedInstance<T>(name, scope);
      if (scopedInstance !== undefined) {
        return scopedInstance;
      }
    }

    // Check local registration
    const registration = this.dependencies.get(name);
    if (registration) {
      return this.resolveRegistration<T>(name, registration, scope);
    }

    // Check parent container
    if (this.parent) {
      return this.parent.resolve<T>(name, scope);
    }

    throw new Error(`Dependency not found: ${name}`);
  }

  /**
   * Try to resolve a dependency (returns undefined if not found)
   */
  async tryResolve<T>(name: string, scope?: string): Promise<T | undefined> {
    try {
      return await this.resolve<T>(name, scope);
    } catch {
      return undefined;
    }
  }

  /**
   * Check if a dependency is registered
   */
  has(name: string): boolean {
    if (this.dependencies.has(name)) {
      return true;
    }
    return this.parent?.has(name) ?? false;
  }

  /**
   * Create a child scope
   */
  createScope(scopeId: string): DIContainer {
    const childContainer = new DIContainer(this);

    this.scopes.set(scopeId, {
      id: scopeId,
      parent: this,
      instances: new Map()
    });

    return childContainer;
  }

  /**
   * Dispose a scope and its instances
   */
  async disposeScope(scopeId: string): Promise<void> {
    const scope = this.scopes.get(scopeId);
    if (!scope) return;

    // Dispose scoped instances
    for (const [name, instance] of scope.instances.entries()) {
      const registration = this.dependencies.get(name);
      if (registration?.config.dispose) {
        try {
          await registration.config.dispose(instance);
        } catch (error) {
          this.logger.warn(`Error disposing scoped instance ${name}`, { error });
        }
      }
    }

    scope.instances.clear();
    this.scopes.delete(scopeId);
  }

  /**
   * Dispose all dependencies and clean up
   */
  async dispose(): Promise<void> {
    if (this.isDisposed) return;

    this.isDisposed = true;

    // Dispose all scopes
    for (const scopeId of this.scopes.keys()) {
      await this.disposeScope(scopeId);
    }

    // Dispose singleton instances in reverse registration order
    const registrations = Array.from(this.dependencies.entries()).reverse();

    for (const [name, registration] of registrations) {
      if (registration.instance && registration.config.dispose) {
        try {
          await registration.config.dispose(registration.instance);
          this.logger.debug(`Disposed dependency: ${name}`);
        } catch (error) {
          this.logger.warn(`Error disposing ${name}`, { error });
        }
      }
      registration.instance = undefined;
      registration.initialized = false;
    }

    this.dependencies.clear();
    this.removeAllListeners();

    this.logger.info('DIContainer disposed');
  }

  /**
   * Get all registered dependency names
   */
  getRegisteredNames(): string[] {
    const names = new Set(this.dependencies.keys());
    if (this.parent) {
      for (const name of this.parent.getRegisteredNames()) {
        names.add(name);
      }
    }
    return Array.from(names);
  }

  /**
   * Resolve a registration
   */
  private async resolveRegistration<T>(
    name: string,
    registration: RegisteredDependency<T>,
    scope?: string
  ): Promise<T> {
    const { config } = registration;

    // Handle different lifecycles
    switch (config.lifecycle) {
      case 'singleton':
        return this.resolveSingleton(name, registration);

      case 'scoped':
        if (!scope) {
          throw new Error(`Scoped dependency ${name} requires a scope`);
        }
        return this.resolveScoped(name, registration, scope);

      case 'transient':
      default:
        return this.resolveTransient(name, registration);
    }
  }

  /**
   * Resolve singleton instance
   */
  private async resolveSingleton<T>(
    name: string,
    registration: RegisteredDependency<T>
  ): Promise<T> {
    // Return existing instance
    if (registration.initialized && registration.instance !== undefined) {
      return registration.instance;
    }

    // Wait for initialization in progress
    if (registration.initPromise) {
      return registration.initPromise;
    }

    // Initialize new instance
    registration.initPromise = this.createAndInitialize(name, registration);

    try {
      const instance = await registration.initPromise;
      registration.instance = instance;
      registration.initialized = true;
      return instance;
    } finally {
      registration.initPromise = undefined;
    }
  }

  /**
   * Resolve scoped instance
   */
  private async resolveScoped<T>(
    name: string,
    registration: RegisteredDependency<T>,
    scopeId: string
  ): Promise<T> {
    const scope = this.scopes.get(scopeId);
    if (!scope) {
      throw new Error(`Scope not found: ${scopeId}`);
    }

    // Check for existing scoped instance
    if (scope.instances.has(name)) {
      return scope.instances.get(name);
    }

    // Create new scoped instance
    const instance = await this.createAndInitialize(name, registration);
    scope.instances.set(name, instance);

    return instance;
  }

  /**
   * Resolve transient instance (new instance each time)
   */
  private async resolveTransient<T>(
    name: string,
    registration: RegisteredDependency<T>
  ): Promise<T> {
    return this.createAndInitialize(name, registration);
  }

  /**
   * Create and initialize an instance
   */
  private async createAndInitialize<T>(
    name: string,
    registration: RegisteredDependency<T>
  ): Promise<T> {
    const { config } = registration;

    // Resolve dependencies first
    if (config.dependencies) {
      for (const dep of config.dependencies) {
        await this.resolve(dep);
      }
    }

    // Create instance
    const instance = await config.factory(this);

    // Initialize if needed
    if (config.initialize) {
      await config.initialize(instance);
    }

    this.logger.debug(`Created instance: ${name}`);
    this.emit('resolved', { name, instance });

    return instance;
  }

  /**
   * Get scoped instance
   */
  private getScopedInstance<T>(name: string, scopeId: string): T | undefined {
    const scope = this.scopes.get(scopeId);
    return scope?.instances.get(name);
  }
}

/**
 * Global container instance
 */
let globalContainer: DIContainer | undefined;

/**
 * Get the global DI container
 */
export function getGlobalContainer(): DIContainer {
  if (!globalContainer) {
    globalContainer = new DIContainer();
  }
  return globalContainer;
}

/**
 * Set the global DI container
 */
export function setGlobalContainer(container: DIContainer): void {
  globalContainer = container;
}

/**
 * Reset the global container (for testing)
 */
export async function resetGlobalContainer(): Promise<void> {
  if (globalContainer) {
    await globalContainer.dispose();
    globalContainer = undefined;
  }
}
