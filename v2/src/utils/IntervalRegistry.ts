/**
 * Global Interval Registry for Memory Leak Prevention
 *
 * Provides a centralized registry for tracking intervals that need cleanup.
 * This is especially important for:
 * - Module-level intervals that persist across tests
 * - Intervals in singleton instances
 * - Cleanup during graceful shutdown
 *
 * Usage:
 * ```typescript
 * import { IntervalRegistry } from './utils/IntervalRegistry';
 *
 * // Register an interval for cleanup
 * const intervalId = setInterval(fn, 1000);
 * IntervalRegistry.register('my-feature', intervalId);
 *
 * // Register with shutdown callback
 * IntervalRegistry.registerWithShutdown('my-feature', {
 *   interval: intervalId,
 *   shutdown: async () => { ... }
 * });
 *
 * // Cleanup specific feature
 * await IntervalRegistry.shutdown('my-feature');
 *
 * // Cleanup all (for tests or process exit)
 * await IntervalRegistry.shutdownAll();
 * ```
 *
 * @module utils/IntervalRegistry
 */

export interface RegisteredInterval {
  interval: NodeJS.Timeout;
  shutdown?: () => Promise<void> | void;
  registeredAt: number;
}

/**
 * Global registry for tracking intervals that need cleanup
 */
class IntervalRegistryClass {
  private registry: Map<string, RegisteredInterval[]> = new Map();
  private shutdownCallbacks: Map<string, () => Promise<void> | void> = new Map();

  /**
   * Register an interval for later cleanup
   *
   * @param feature - Feature/module name for grouping
   * @param interval - The interval handle from setInterval
   */
  register(feature: string, interval: NodeJS.Timeout): void {
    const entry: RegisteredInterval = {
      interval,
      registeredAt: Date.now(),
    };

    const existing = this.registry.get(feature) ?? [];
    existing.push(entry);
    this.registry.set(feature, existing);
  }

  /**
   * Register an interval with a custom shutdown callback
   *
   * @param feature - Feature/module name for grouping
   * @param config - Interval and optional shutdown callback
   */
  registerWithShutdown(
    feature: string,
    config: { interval: NodeJS.Timeout; shutdown?: () => Promise<void> | void }
  ): void {
    const entry: RegisteredInterval = {
      interval: config.interval,
      shutdown: config.shutdown,
      registeredAt: Date.now(),
    };

    const existing = this.registry.get(feature) ?? [];
    existing.push(entry);
    this.registry.set(feature, existing);
  }

  /**
   * Register a shutdown callback for a feature
   * This is called even if no intervals are registered
   *
   * @param feature - Feature/module name
   * @param callback - Shutdown callback
   */
  registerShutdownCallback(feature: string, callback: () => Promise<void> | void): void {
    this.shutdownCallbacks.set(feature, callback);
  }

  /**
   * Unregister a specific interval
   *
   * @param feature - Feature name
   * @param interval - The interval to unregister
   */
  unregister(feature: string, interval: NodeJS.Timeout): void {
    const entries = this.registry.get(feature);
    if (entries) {
      const filtered = entries.filter(e => e.interval !== interval);
      if (filtered.length === 0) {
        this.registry.delete(feature);
      } else {
        this.registry.set(feature, filtered);
      }
    }
  }

  /**
   * Shutdown all intervals for a specific feature
   *
   * @param feature - Feature name to shutdown
   */
  async shutdown(feature: string): Promise<void> {
    const entries = this.registry.get(feature);

    if (entries) {
      for (const entry of entries) {
        clearInterval(entry.interval);
        if (entry.shutdown) {
          try {
            await Promise.resolve(entry.shutdown());
          } catch (error) {
            console.warn(`[IntervalRegistry] Shutdown error for ${feature}:`, error);
          }
        }
      }
      this.registry.delete(feature);
    }

    // Call feature shutdown callback if registered
    const callback = this.shutdownCallbacks.get(feature);
    if (callback) {
      try {
        await Promise.resolve(callback());
      } catch (error) {
        console.warn(`[IntervalRegistry] Callback error for ${feature}:`, error);
      }
      this.shutdownCallbacks.delete(feature);
    }
  }

  /**
   * Shutdown all registered intervals
   * Typically called during test teardown or process exit
   */
  async shutdownAll(): Promise<void> {
    const features = Array.from(this.registry.keys());
    const callbacks = Array.from(this.shutdownCallbacks.keys());

    // Combine unique features
    const allFeatures = [...new Set([...features, ...callbacks])];

    await Promise.all(
      allFeatures.map(feature =>
        this.shutdown(feature).catch(error => {
          console.warn(`[IntervalRegistry] Shutdown error for ${feature}:`, error);
        })
      )
    );
  }

  /**
   * Get statistics about registered intervals
   */
  getStats(): {
    totalIntervals: number;
    features: string[];
    byFeature: Record<string, number>;
  } {
    const byFeature: Record<string, number> = {};
    let total = 0;

    for (const [feature, entries] of this.registry.entries()) {
      byFeature[feature] = entries.length;
      total += entries.length;
    }

    return {
      totalIntervals: total,
      features: Array.from(this.registry.keys()),
      byFeature,
    };
  }

  /**
   * Clear all registrations without calling shutdown
   * Use with caution - primarily for testing
   */
  clear(): void {
    for (const entries of this.registry.values()) {
      for (const entry of entries) {
        clearInterval(entry.interval);
      }
    }
    this.registry.clear();
    this.shutdownCallbacks.clear();
  }
}

/**
 * Singleton instance of the interval registry
 */
export const IntervalRegistry = new IntervalRegistryClass();

/**
 * Export shutdown functions for chaos handlers and other modules
 */
export { shutdown as shutdownChaosLatency } from '../mcp/handlers/chaos/chaos-inject-latency';
export { shutdown as shutdownChaosFailure } from '../mcp/handlers/chaos/chaos-inject-failure';
