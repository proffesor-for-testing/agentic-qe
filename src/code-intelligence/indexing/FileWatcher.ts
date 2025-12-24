/**
 * File Watcher
 *
 * Monitors file system changes and emits events
 * for incremental index updates.
 *
 * Features:
 * - Debounced change notifications
 * - Pattern-based filtering
 * - Cross-platform support
 * - Graceful shutdown
 */

import { EventEmitter } from 'events';
import {
  WatcherConfig,
  WatcherEvent,
  FileChange,
  FileChangeCallback,
  DEFAULT_WATCHER_CONFIG,
} from './types.js';

export interface FileWatcherEvents {
  change: (changes: FileChange[]) => void;
  error: (error: Error) => void;
  ready: () => void;
}

export class FileWatcher extends EventEmitter {
  private config: WatcherConfig;
  private pendingChanges: Map<string, WatcherEvent> = new Map();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private isWatching: boolean = false;
  private watcher: any = null; // chokidar instance (optional dependency)
  private callbacks: FileChangeCallback[] = [];

  constructor(config: Partial<WatcherConfig> = {}) {
    super();
    this.config = { ...DEFAULT_WATCHER_CONFIG, ...config };
  }

  /**
   * Start watching for file changes.
   * Uses chokidar if available, otherwise manual polling.
   */
  async start(): Promise<void> {
    if (this.isWatching) return;

    try {
      // Try to use chokidar for efficient watching
      const chokidar = await this.tryLoadChokidar();

      if (chokidar) {
        await this.startChokidarWatcher(chokidar);
      } else {
        // Fallback: emit warning and allow manual change registration
        console.warn('FileWatcher: chokidar not available, using manual mode');
        this.isWatching = true;
        this.emit('ready');
      }
    } catch (error) {
      this.emit('error', error as Error);
      throw error;
    }
  }

  /**
   * Stop watching.
   */
  async stop(): Promise<void> {
    if (!this.isWatching) return;

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }

    this.isWatching = false;
    this.pendingChanges.clear();
  }

  /**
   * Register a callback for file changes.
   */
  onChanges(callback: FileChangeCallback): void {
    this.callbacks.push(callback);
  }

  /**
   * Remove a callback.
   */
  offChanges(callback: FileChangeCallback): void {
    const index = this.callbacks.indexOf(callback);
    if (index !== -1) {
      this.callbacks.splice(index, 1);
    }
  }

  /**
   * Manually register a file change (for testing or manual mode).
   */
  registerChange(event: WatcherEvent): void {
    this.pendingChanges.set(event.path, event);
    this.scheduleFlush();
  }

  /**
   * Get watching status.
   */
  isActive(): boolean {
    return this.isWatching;
  }

  /**
   * Get current configuration.
   */
  getConfig(): WatcherConfig {
    return { ...this.config };
  }

  /**
   * Update configuration (requires restart).
   */
  updateConfig(config: Partial<WatcherConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Check if a path should be watched based on patterns.
   */
  shouldWatch(filePath: string): boolean {
    // Check ignore patterns
    for (const pattern of this.config.ignorePatterns) {
      if (this.matchGlob(filePath, pattern)) {
        return false;
      }
    }

    // Check include patterns
    for (const pattern of this.config.patterns) {
      if (this.matchGlob(filePath, pattern)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Try to load chokidar dynamically.
   */
  private async tryLoadChokidar(): Promise<any> {
    try {
      // Dynamic import to make chokidar optional
      const module = await import('chokidar');
      return module.default || module;
    } catch {
      return null;
    }
  }

  /**
   * Start watching with chokidar.
   */
  private async startChokidarWatcher(chokidar: any): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.watcher = chokidar.watch(this.config.patterns, {
          cwd: this.config.rootDir,
          ignored: this.config.ignorePatterns,
          persistent: true,
          usePolling: this.config.usePolling,
          interval: this.config.pollInterval,
          ignoreInitial: true,
          awaitWriteFinish: {
            stabilityThreshold: 100,
            pollInterval: 50,
          },
        });

        this.watcher
          .on('add', (path: string) => this.handleEvent('add', path))
          .on('change', (path: string) => this.handleEvent('change', path))
          .on('unlink', (path: string) => this.handleEvent('unlink', path))
          .on('error', (error: Error) => this.emit('error', error))
          .on('ready', () => {
            this.isWatching = true;
            this.emit('ready');
            resolve();
          });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Handle a file system event.
   */
  private handleEvent(type: WatcherEvent['type'], path: string): void {
    const event: WatcherEvent = {
      type,
      path,
      timestamp: Date.now(),
    };

    this.pendingChanges.set(path, event);
    this.scheduleFlush();
  }

  /**
   * Schedule debounced flush of pending changes.
   */
  private scheduleFlush(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.flushChanges();
    }, this.config.debounceMs);
  }

  /**
   * Flush pending changes to callbacks.
   */
  private async flushChanges(): Promise<void> {
    if (this.pendingChanges.size === 0) return;

    const changes: FileChange[] = Array.from(this.pendingChanges.values())
      .map(event => ({
        type: event.type === 'unlink' ? 'delete' as const :
              event.type === 'add' ? 'add' as const : 'modify' as const,
        filePath: event.path,
        timestamp: event.timestamp,
      }));

    this.pendingChanges.clear();

    // Emit event
    this.emit('change', changes);

    // Call registered callbacks
    for (const callback of this.callbacks) {
      try {
        await callback(changes);
      } catch (error) {
        this.emit('error', error as Error);
      }
    }
  }

  /**
   * Simple glob matching (supports * and **).
   */
  private matchGlob(path: string, pattern: string): boolean {
    // Normalize path separators
    const normalizedPath = path.replace(/\\/g, '/');
    const normalizedPattern = pattern.replace(/\\/g, '/');

    // Special case: **/ at start means "anywhere in path"
    // Special case: /** at end means "anything after"
    // Pattern like **/node_modules/** means "path contains node_modules"
    if (normalizedPattern.includes('**/') && normalizedPattern.includes('/**')) {
      // Extract middle part: **/X/** -> check if path contains /X/
      const middle = normalizedPattern
        .replace(/^\*\*\//, '')
        .replace(/\/\*\*$/, '');
      // Check if path contains this segment
      return normalizedPath.includes(middle + '/') ||
             normalizedPath.includes('/' + middle) ||
             normalizedPath.startsWith(middle + '/') ||
             normalizedPath === middle;
    }

    // Pattern like **/*.ts means "any .ts file"
    if (normalizedPattern.startsWith('**/')) {
      const suffix = normalizedPattern.slice(3);
      if (suffix.startsWith('*.')) {
        // Extension match
        const ext = suffix.slice(1); // *.ts -> .ts
        return normalizedPath.endsWith(ext);
      }
      // Check if path ends with the pattern
      // Escape all special regex characters except glob wildcards
      const escapedSuffix = suffix
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&')  // Escape special regex chars
        .replace(/\\\*\\\*/g, '.*')              // ** -> match any path
        .replace(/\\\*/g, '[^/]*');              // * -> match within segment
      const suffixRegex = new RegExp(escapedSuffix + '$');
      return suffixRegex.test(normalizedPath);
    }

    // Convert full glob to regex
    // Escape all special regex characters except glob wildcards
    const regexPattern = normalizedPattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')  // Escape special regex chars
      .replace(/\\\*\\\*/g, '{{GLOBSTAR}}')   // Preserve ** temporarily
      .replace(/\\\*/g, '[^/]*')              // * -> match within segment
      .replace(/{{GLOBSTAR}}/g, '.*');        // ** -> match any path

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(normalizedPath);
  }
}
