/**
 * A2A Hot Reload Service
 *
 * Provides automatic hot-reload functionality for agent discovery.
 * Watches agent markdown files and automatically regenerates cards
 * when files are added, modified, or removed.
 *
 * @module adapters/a2a/discovery/hot-reload-service
 */

import { EventEmitter } from 'events';
import { basename } from 'path';

import { QEAgentCard } from '../agent-cards/schema.js';
import { AgentCardGenerator } from '../agent-cards/generator.js';
import { DiscoveryService } from './discovery-service.js';
import {
  AgentFileWatcher,
  FileChangeEvent,
  FileWatcherConfig,
  createAgentFileWatcher,
} from './file-watcher.js';
import { MetricsCollector, createMetricsCollector } from './metrics.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for the Hot Reload Service
 */
export interface HotReloadServiceConfig {
  /** Agent card generator instance */
  readonly generator: AgentCardGenerator;
  /** Discovery service instance */
  readonly discoveryService: DiscoveryService;
  /** File watcher instance (optional - will create one if not provided) */
  readonly watcher?: AgentFileWatcher;
  /** Paths to watch for agent files */
  readonly watchPaths: string[];
  /** Debounce interval in milliseconds */
  readonly debounceMs?: number;
  /** Enable metrics collection */
  readonly enableMetrics?: boolean;
  /** Auto-update platform card on agent changes */
  readonly autoUpdatePlatformCard?: boolean;
  /** Callback for successful card regeneration */
  readonly onCardRegenerated?: (agentId: string, card: QEAgentCard) => void;
  /** Callback for card removal */
  readonly onCardRemoved?: (agentId: string) => void;
  /** Callback for errors */
  readonly onError?: (error: Error, context: string) => void;
}

/**
 * Default configuration values
 */
export const DEFAULT_HOT_RELOAD_CONFIG = {
  debounceMs: 300,
  enableMetrics: true,
  autoUpdatePlatformCard: true,
} as const;

/**
 * Hot reload event types
 */
export type HotReloadEvent = 'card-added' | 'card-updated' | 'card-removed' | 'error' | 'ready';

/**
 * Hot reload status
 */
export interface HotReloadStatus {
  /** Whether the service is running */
  readonly running: boolean;
  /** Total cards managed */
  readonly totalCards: number;
  /** Total reloads performed */
  readonly totalReloads: number;
  /** Failed reloads */
  readonly failedReloads: number;
  /** Last reload timestamp */
  readonly lastReloadAt: number | null;
  /** Watched paths */
  readonly watchedPaths: string[];
}

/**
 * Reload result
 */
export interface ReloadResult {
  readonly success: boolean;
  readonly agentId: string;
  readonly event: 'added' | 'updated' | 'removed';
  readonly card?: QEAgentCard;
  readonly error?: Error;
  readonly duration: number;
}

// ============================================================================
// Event Emitter Types
// ============================================================================

/**
 * Event map for HotReloadService
 */
export interface HotReloadEvents {
  'card-added': (agentId: string, card: QEAgentCard) => void;
  'card-updated': (agentId: string, card: QEAgentCard) => void;
  'card-removed': (agentId: string) => void;
  'error': (error: Error, context: string) => void;
  'ready': () => void;
  'reload-complete': (result: ReloadResult) => void;
}

// ============================================================================
// Card Cache
// ============================================================================

/**
 * Cache entry for agent cards
 */
interface CardCacheEntry {
  readonly card: QEAgentCard;
  readonly filePath: string;
  readonly generatedAt: number;
  readonly fileModifiedAt: number;
}

// ============================================================================
// Hot Reload Service Class
// ============================================================================

/**
 * Hot Reload Service
 *
 * Automatically watches agent markdown files and regenerates agent cards
 * when changes are detected. Integrates with DiscoveryService to keep
 * the agent registry up-to-date.
 */
export class HotReloadService extends EventEmitter {
  private readonly config: Required<Omit<HotReloadServiceConfig, 'watcher' | 'onCardRegenerated' | 'onCardRemoved' | 'onError'>> & {
    watcher?: AgentFileWatcher;
    onCardRegenerated?: HotReloadServiceConfig['onCardRegenerated'];
    onCardRemoved?: HotReloadServiceConfig['onCardRemoved'];
    onError?: HotReloadServiceConfig['onError'];
  };
  private readonly generator: AgentCardGenerator;
  private readonly discoveryService: DiscoveryService;
  private watcher: AgentFileWatcher;
  private readonly cardCache: Map<string, CardCacheEntry> = new Map();
  private readonly pathToAgentId: Map<string, string> = new Map();
  private readonly metrics: MetricsCollector;
  private running = false;
  private totalReloads = 0;
  private failedReloads = 0;
  private lastReloadAt: number | null = null;

  constructor(config: HotReloadServiceConfig) {
    super();

    this.config = {
      ...DEFAULT_HOT_RELOAD_CONFIG,
      ...config,
    };

    this.generator = config.generator;
    this.discoveryService = config.discoveryService;
    this.metrics = createMetricsCollector();

    // Create or use provided watcher
    this.watcher = config.watcher ?? createAgentFileWatcher({
      paths: config.watchPaths,
      debounceMs: this.config.debounceMs,
    });

    // Bind event handlers
    this.handleFileChange = this.handleFileChange.bind(this);
    this.handleWatcherError = this.handleWatcherError.bind(this);
    this.handleWatcherReady = this.handleWatcherReady.bind(this);
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Start the hot reload service
   */
  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;

    // Attach event handlers
    this.watcher.on('agent-change', this.handleFileChange);
    this.watcher.on('error', this.handleWatcherError);
    this.watcher.on('ready', this.handleWatcherReady);

    // Start the watcher
    await this.watcher.start();

    this.metrics.increment('hot-reload.start');
  }

  /**
   * Stop the hot reload service
   */
  stop(): void {
    if (!this.running) {
      return;
    }

    this.running = false;

    // Remove event handlers
    this.watcher.off('agent-change', this.handleFileChange);
    this.watcher.off('error', this.handleWatcherError);
    this.watcher.off('ready', this.handleWatcherReady);

    // Stop the watcher
    this.watcher.stop();

    this.metrics.increment('hot-reload.stop');
  }

  /**
   * Check if the service is running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Get service status
   */
  getStatus(): HotReloadStatus {
    return {
      running: this.running,
      totalCards: this.cardCache.size,
      totalReloads: this.totalReloads,
      failedReloads: this.failedReloads,
      lastReloadAt: this.lastReloadAt,
      watchedPaths: this.config.watchPaths,
    };
  }

  /**
   * Get cached card by agent ID
   */
  getCachedCard(agentId: string): QEAgentCard | null {
    const entry = this.cardCache.get(agentId);
    return entry?.card ?? null;
  }

  /**
   * Get all cached agent IDs
   */
  getCachedAgentIds(): string[] {
    return Array.from(this.cardCache.keys());
  }

  /**
   * Force reload a specific agent card
   */
  async forceReload(filePath: string): Promise<ReloadResult> {
    return this.regenerateCard(filePath);
  }

  /**
   * Force reload all agent cards
   */
  async forceReloadAll(): Promise<ReloadResult[]> {
    const results: ReloadResult[] = [];

    for (const filePath of this.watcher.getKnownFiles()) {
      const result = await this.regenerateCard(filePath);
      results.push(result);
    }

    return results;
  }

  /**
   * Manually invalidate a card
   */
  invalidateCard(agentId: string): boolean {
    const entry = this.cardCache.get(agentId);
    if (!entry) {
      return false;
    }

    this.cardCache.delete(agentId);
    this.pathToAgentId.delete(entry.filePath);
    this.discoveryService.invalidateCache(agentId);

    this.metrics.increment('hot-reload.cache-invalidation', { agent_id: agentId });
    return true;
  }

  /**
   * Get metrics
   */
  getMetrics(): string {
    return this.metrics.getMetrics();
  }

  // ============================================================================
  // Event Handlers
  // ============================================================================

  /**
   * Handle file change event from watcher
   */
  private async handleFileChange(event: FileChangeEvent): Promise<void> {
    const { event: eventType, path: filePath } = event;

    this.metrics.increment('hot-reload.file-event', { event: eventType });

    try {
      switch (eventType) {
        case 'add':
          await this.onAgentAdded(filePath);
          break;
        case 'change':
          await this.onAgentModified(filePath);
          break;
        case 'unlink':
          await this.onAgentRemoved(filePath);
          break;
      }
    } catch (error) {
      this.handleError(error instanceof Error ? error : new Error(String(error)), `file-${eventType}`);
    }
  }

  /**
   * Handle watcher error
   */
  private handleWatcherError(error: Error): void {
    this.handleError(error, 'watcher');
  }

  /**
   * Handle watcher ready event
   */
  private handleWatcherReady(): void {
    this.emit('ready');
  }

  // ============================================================================
  // Agent Event Handlers
  // ============================================================================

  /**
   * Handle agent file added
   */
  private async onAgentAdded(filePath: string): Promise<void> {
    const startTime = Date.now();
    const agentId = this.extractAgentId(filePath);

    try {
      const card = await this.regenerateCardFromFile(filePath);

      // Update caches
      this.cardCache.set(agentId, {
        card,
        filePath,
        generatedAt: Date.now(),
        fileModifiedAt: Date.now(),
      });
      this.pathToAgentId.set(filePath, agentId);

      // Register with discovery service
      this.discoveryService.registerCard(card);

      // Update platform card if configured
      if (this.config.autoUpdatePlatformCard) {
        await this.updatePlatformCard();
      }

      // Emit events and callbacks
      this.emit('card-added', agentId, card);
      this.config.onCardRegenerated?.(agentId, card);

      this.recordReloadSuccess(agentId, 'added', card, startTime);
      this.metrics.increment('hot-reload.card-added', { agent_id: agentId });
    } catch (error) {
      this.recordReloadFailure(agentId, 'added', error instanceof Error ? error : new Error(String(error)), startTime);
      throw error;
    }
  }

  /**
   * Handle agent file modified
   */
  private async onAgentModified(filePath: string): Promise<void> {
    const startTime = Date.now();
    const agentId = this.pathToAgentId.get(filePath) ?? this.extractAgentId(filePath);

    try {
      const card = await this.regenerateCardFromFile(filePath);

      // Update caches
      this.cardCache.set(agentId, {
        card,
        filePath,
        generatedAt: Date.now(),
        fileModifiedAt: Date.now(),
      });
      this.pathToAgentId.set(filePath, agentId);

      // Invalidate and re-register with discovery service
      this.discoveryService.invalidateCache(agentId);
      this.discoveryService.registerCard(card);

      // Update platform card if configured
      if (this.config.autoUpdatePlatformCard) {
        await this.updatePlatformCard();
      }

      // Emit events and callbacks
      this.emit('card-updated', agentId, card);
      this.config.onCardRegenerated?.(agentId, card);

      this.recordReloadSuccess(agentId, 'updated', card, startTime);
      this.metrics.increment('hot-reload.card-updated', { agent_id: agentId });
    } catch (error) {
      this.recordReloadFailure(agentId, 'updated', error instanceof Error ? error : new Error(String(error)), startTime);
      throw error;
    }
  }

  /**
   * Handle agent file removed
   */
  private async onAgentRemoved(filePath: string): Promise<void> {
    const startTime = Date.now();
    const agentId = this.pathToAgentId.get(filePath);

    if (!agentId) {
      // File was never tracked
      return;
    }

    try {
      // Remove from caches
      this.cardCache.delete(agentId);
      this.pathToAgentId.delete(filePath);

      // Invalidate in discovery service
      this.discoveryService.invalidateCache(agentId);

      // Update platform card if configured
      if (this.config.autoUpdatePlatformCard) {
        await this.updatePlatformCard();
      }

      // Emit events and callbacks
      this.emit('card-removed', agentId);
      this.config.onCardRemoved?.(agentId);

      this.recordReloadSuccess(agentId, 'removed', undefined, startTime);
      this.metrics.increment('hot-reload.card-removed', { agent_id: agentId });
    } catch (error) {
      this.recordReloadFailure(agentId, 'removed', error instanceof Error ? error : new Error(String(error)), startTime);
      throw error;
    }
  }

  // ============================================================================
  // Card Regeneration
  // ============================================================================

  /**
   * Regenerate a card from a file path
   */
  private async regenerateCard(filePath: string): Promise<ReloadResult> {
    const startTime = Date.now();
    const agentId = this.extractAgentId(filePath);

    try {
      const card = await this.regenerateCardFromFile(filePath);

      // Update caches
      this.cardCache.set(agentId, {
        card,
        filePath,
        generatedAt: Date.now(),
        fileModifiedAt: Date.now(),
      });
      this.pathToAgentId.set(filePath, agentId);

      // Register with discovery service
      this.discoveryService.invalidateCache(agentId);
      this.discoveryService.registerCard(card);

      return this.recordReloadSuccess(agentId, 'updated', card, startTime);
    } catch (error) {
      return this.recordReloadFailure(agentId, 'updated', error instanceof Error ? error : new Error(String(error)), startTime);
    }
  }

  /**
   * Generate a card from a file
   */
  private async regenerateCardFromFile(filePath: string): Promise<QEAgentCard> {
    const card = await this.generator.generateFromFile(filePath);
    return card;
  }

  /**
   * Update the platform card
   */
  private async updatePlatformCard(): Promise<void> {
    // Force platform card regeneration by invalidating cache
    this.discoveryService.invalidateAllCaches();
    await this.discoveryService.getPlatformCard();

    this.metrics.increment('hot-reload.platform-card-updated');
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Extract agent ID from file path
   */
  private extractAgentId(filePath: string): string {
    return basename(filePath, '.md');
  }

  /**
   * Record a successful reload
   */
  private recordReloadSuccess(
    agentId: string,
    event: 'added' | 'updated' | 'removed',
    card: QEAgentCard | undefined,
    startTime: number
  ): ReloadResult {
    const duration = Date.now() - startTime;
    this.totalReloads++;
    this.lastReloadAt = Date.now();

    const result: ReloadResult = {
      success: true,
      agentId,
      event,
      card,
      duration,
    };

    this.emit('reload-complete', result);
    this.metrics.gauge('hot-reload.last-duration-ms', duration);

    return result;
  }

  /**
   * Record a failed reload
   */
  private recordReloadFailure(
    agentId: string,
    event: 'added' | 'updated' | 'removed',
    error: Error,
    startTime: number
  ): ReloadResult {
    const duration = Date.now() - startTime;
    this.totalReloads++;
    this.failedReloads++;
    this.lastReloadAt = Date.now();

    const result: ReloadResult = {
      success: false,
      agentId,
      event,
      error,
      duration,
    };

    this.handleError(error, `reload-${event}`);
    this.emit('reload-complete', result);
    this.metrics.increment('hot-reload.failures', { agent_id: agentId, event });

    return result;
  }

  /**
   * Handle an error
   */
  private handleError(error: Error, context: string): void {
    this.emit('error', error, context);
    this.config.onError?.(error, context);
    this.metrics.increment('hot-reload.errors', { context });
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a Hot Reload Service instance
 *
 * @param config - Service configuration
 * @returns Hot reload service instance
 *
 * @example
 * ```typescript
 * const hotReload = createHotReloadService({
 *   generator: agentCardGenerator,
 *   discoveryService: discovery,
 *   watchPaths: ['.claude/agents/v3'],
 * });
 *
 * hotReload.on('card-updated', (agentId, card) => {
 *   console.log(`Agent ${agentId} updated`);
 * });
 *
 * await hotReload.start();
 * ```
 */
export function createHotReloadService(config: HotReloadServiceConfig): HotReloadService {
  return new HotReloadService(config);
}
