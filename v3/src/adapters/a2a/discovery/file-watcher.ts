/**
 * A2A Agent File Watcher
 *
 * Provides file system watching for agent markdown files with debouncing
 * and event emission for hot-reload functionality.
 *
 * Uses native Node.js fs.watch with custom debouncing for reliable change detection.
 *
 * @module adapters/a2a/discovery/file-watcher
 */

import { EventEmitter } from 'events';
import { watch, FSWatcher, Stats } from 'fs';
import { stat, readdir } from 'fs/promises';
import { join, relative, resolve } from 'path';

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for the Agent File Watcher
 */
export interface FileWatcherConfig {
  /** Paths to watch for agent files */
  readonly paths: string[];
  /** Debounce interval in milliseconds (default: 300ms) */
  readonly debounceMs?: number;
  /** File patterns to ignore */
  readonly ignored?: string[];
  /** Whether to watch subdirectories (default: true) */
  readonly recursive?: boolean;
  /** Only watch files matching this pattern (default: *.md) */
  readonly pattern?: RegExp;
}

/**
 * Default configuration values
 */
export const DEFAULT_FILE_WATCHER_CONFIG: Required<Omit<FileWatcherConfig, 'paths'>> = {
  debounceMs: 300,
  ignored: ['README.md', '*.tmp', '*.bak', '.git'],
  recursive: true,
  pattern: /\.md$/,
};

/**
 * File event types
 */
export type FileEvent = 'add' | 'change' | 'unlink';

/**
 * File change event data
 */
export interface FileChangeEvent {
  /** Type of change */
  readonly event: FileEvent;
  /** Absolute path to the file */
  readonly path: string;
  /** Relative path from watched directory */
  readonly relativePath: string;
  /** Timestamp of the event */
  readonly timestamp: number;
  /** File stats (undefined for unlink events) */
  readonly stats?: Stats;
}

/**
 * Watcher status
 */
export interface WatcherStatus {
  /** Whether the watcher is running */
  readonly running: boolean;
  /** Paths being watched */
  readonly watchedPaths: string[];
  /** Number of known files */
  readonly knownFiles: number;
  /** Total events emitted */
  readonly totalEvents: number;
  /** Started timestamp */
  readonly startedAt: number | null;
}

// ============================================================================
// Typed Event Emitter
// ============================================================================

/**
 * Event map for AgentFileWatcher
 */
export interface FileWatcherEvents {
  'agent-change': (event: FileChangeEvent) => void;
  'add': (path: string, stats: Stats) => void;
  'change': (path: string, stats: Stats) => void;
  'unlink': (path: string) => void;
  'error': (error: Error) => void;
  'ready': () => void;
}

// ============================================================================
// Debouncer Class
// ============================================================================

/**
 * Debouncer for file system events
 */
class EventDebouncer {
  private readonly timers: Map<string, NodeJS.Timeout> = new Map();
  private readonly delayMs: number;
  private readonly callback: (path: string, eventType: FileEvent) => void;

  constructor(delayMs: number, callback: (path: string, eventType: FileEvent) => void) {
    this.delayMs = delayMs;
    this.callback = callback;
  }

  /**
   * Schedule a debounced event
   */
  schedule(path: string, eventType: FileEvent): void {
    const existing = this.timers.get(path);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      this.timers.delete(path);
      this.callback(path, eventType);
    }, this.delayMs);

    this.timers.set(path, timer);
  }

  /**
   * Cancel a pending event
   */
  cancel(path: string): void {
    const existing = this.timers.get(path);
    if (existing) {
      clearTimeout(existing);
      this.timers.delete(path);
    }
  }

  /**
   * Cancel all pending events
   */
  cancelAll(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }

  /**
   * Get the number of pending events
   */
  get pendingCount(): number {
    return this.timers.size;
  }
}

// ============================================================================
// Agent File Watcher Class
// ============================================================================

/**
 * Agent File Watcher
 *
 * Watches agent markdown files for changes and emits events for hot-reload.
 * Provides debouncing to handle rapid file system events.
 */
export class AgentFileWatcher extends EventEmitter {
  private readonly config: Required<FileWatcherConfig>;
  private readonly watchers: Map<string, FSWatcher> = new Map();
  private readonly knownFiles: Map<string, Stats> = new Map();
  private readonly debouncer: EventDebouncer;
  private running = false;
  private startedAt: number | null = null;
  private totalEvents = 0;

  constructor(config: FileWatcherConfig) {
    super();
    this.config = {
      ...DEFAULT_FILE_WATCHER_CONFIG,
      ...config,
    };

    this.debouncer = new EventDebouncer(
      this.config.debounceMs,
      this.handleDebouncedEvent.bind(this)
    );
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Start watching for file changes
   */
  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;
    this.startedAt = Date.now();

    // Initialize known files and start watchers
    for (const watchPath of this.config.paths) {
      try {
        await this.initializeWatcher(watchPath);
      } catch (error) {
        this.emit('error', error instanceof Error ? error : new Error(String(error)));
      }
    }

    this.emit('ready');
  }

  /**
   * Stop watching for file changes
   */
  stop(): void {
    if (!this.running) {
      return;
    }

    this.running = false;
    this.debouncer.cancelAll();

    // Close all watchers
    for (const [path, watcher] of this.watchers) {
      try {
        watcher.close();
      } catch {
        // Ignore errors on close
      }
      this.watchers.delete(path);
    }

    this.knownFiles.clear();
    this.startedAt = null;
  }

  /**
   * Check if the watcher is running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Get watcher status
   */
  getStatus(): WatcherStatus {
    return {
      running: this.running,
      watchedPaths: Array.from(this.watchers.keys()),
      knownFiles: this.knownFiles.size,
      totalEvents: this.totalEvents,
      startedAt: this.startedAt,
    };
  }

  /**
   * Get all known file paths
   */
  getKnownFiles(): string[] {
    return Array.from(this.knownFiles.keys());
  }

  /**
   * Force a rescan of all watched paths
   */
  async rescan(): Promise<void> {
    const previousFiles = new Set(this.knownFiles.keys());
    this.knownFiles.clear();

    for (const watchPath of this.config.paths) {
      await this.scanDirectory(watchPath, watchPath);
    }

    // Detect removed files
    for (const filePath of previousFiles) {
      if (!this.knownFiles.has(filePath)) {
        this.emitFileEvent('unlink', filePath);
      }
    }
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Initialize watcher for a directory
   */
  private async initializeWatcher(watchPath: string): Promise<void> {
    const resolvedPath = resolve(watchPath);

    // Check if path exists
    try {
      const stats = await stat(resolvedPath);
      if (!stats.isDirectory()) {
        throw new Error(`Path is not a directory: ${resolvedPath}`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // Directory doesn't exist yet, try to watch parent
        return;
      }
      throw error;
    }

    // Scan for existing files
    await this.scanDirectory(resolvedPath, resolvedPath);

    // Start watching
    const watcher = watch(
      resolvedPath,
      { recursive: this.config.recursive },
      (eventType, filename) => {
        if (filename) {
          const fullPath = join(resolvedPath, filename);
          this.handleRawEvent(eventType, fullPath, resolvedPath);
        }
      }
    );

    watcher.on('error', (error) => {
      this.emit('error', error);
    });

    this.watchers.set(resolvedPath, watcher);
  }

  /**
   * Scan a directory for agent files
   */
  private async scanDirectory(dirPath: string, basePath: string): Promise<void> {
    try {
      const entries = await readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(dirPath, entry.name);

        if (entry.isDirectory() && this.config.recursive) {
          if (!this.isIgnored(entry.name)) {
            await this.scanDirectory(fullPath, basePath);
          }
        } else if (entry.isFile() && this.shouldWatch(entry.name)) {
          try {
            const stats = await stat(fullPath);
            const wasKnown = this.knownFiles.has(fullPath);
            this.knownFiles.set(fullPath, stats);

            if (!wasKnown) {
              // New file discovered during scan
              this.emitFileEvent('add', fullPath, stats);
            }
          } catch {
            // File may have been deleted
          }
        }
      }
    } catch {
      // Directory may not exist or be accessible
    }
  }

  /**
   * Handle raw file system event
   */
  private handleRawEvent(eventType: string, filePath: string, basePath: string): void {
    const filename = relative(basePath, filePath).split('/').pop() ?? '';

    if (this.isIgnored(filename) || !this.shouldWatch(filename)) {
      return;
    }

    // Determine the event type
    let fileEvent: FileEvent;
    if (eventType === 'rename') {
      // 'rename' can mean add or unlink - we need to check if file exists
      fileEvent = this.knownFiles.has(filePath) ? 'unlink' : 'add';
    } else {
      fileEvent = 'change';
    }

    // Schedule debounced processing
    this.debouncer.schedule(filePath, fileEvent);
  }

  /**
   * Handle debounced file event
   */
  private async handleDebouncedEvent(filePath: string, eventType: FileEvent): Promise<void> {
    try {
      const stats = await stat(filePath).catch(() => null);

      if (stats) {
        // File exists
        const wasKnown = this.knownFiles.has(filePath);
        this.knownFiles.set(filePath, stats);

        if (!wasKnown) {
          this.emitFileEvent('add', filePath, stats);
        } else {
          this.emitFileEvent('change', filePath, stats);
        }
      } else {
        // File doesn't exist
        if (this.knownFiles.has(filePath)) {
          this.knownFiles.delete(filePath);
          this.emitFileEvent('unlink', filePath);
        }
      }
    } catch (error) {
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Emit a file change event
   */
  private emitFileEvent(event: FileEvent, filePath: string, stats?: Stats): void {
    this.totalEvents++;

    // Find the base path for relative path calculation
    let relativePath = filePath;
    for (const watchPath of this.config.paths) {
      const resolved = resolve(watchPath);
      if (filePath.startsWith(resolved)) {
        relativePath = relative(resolved, filePath);
        break;
      }
    }

    const changeEvent: FileChangeEvent = {
      event,
      path: filePath,
      relativePath,
      timestamp: Date.now(),
      stats,
    };

    // Emit typed events
    this.emit('agent-change', changeEvent);
    this.emit(event, filePath, stats);
  }

  /**
   * Check if a filename should be ignored
   */
  private isIgnored(filename: string): boolean {
    for (const pattern of this.config.ignored) {
      if (pattern.startsWith('*.')) {
        // Glob pattern for extension
        const ext = pattern.slice(1);
        if (filename.endsWith(ext)) {
          return true;
        }
      } else if (filename === pattern) {
        return true;
      } else if (filename.startsWith('.') && pattern === '.*') {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if a filename matches the watch pattern
   */
  private shouldWatch(filename: string): boolean {
    return this.config.pattern.test(filename);
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create an Agent File Watcher instance
 *
 * @param config - Watcher configuration
 * @returns Agent file watcher instance
 *
 * @example
 * ```typescript
 * const watcher = createAgentFileWatcher({
 *   paths: ['.claude/agents/v3'],
 *   debounceMs: 300,
 * });
 *
 * watcher.on('agent-change', (event) => {
 *   console.log(`File ${event.event}: ${event.path}`);
 * });
 *
 * await watcher.start();
 * ```
 */
export function createAgentFileWatcher(config: FileWatcherConfig): AgentFileWatcher {
  return new AgentFileWatcher(config);
}
