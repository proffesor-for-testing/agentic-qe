/**
 * Incremental Indexing Module
 *
 * Efficient file indexing with change detection and live updates.
 */

export { IncrementalIndexer } from './IncrementalIndexer.js';
export { FileWatcher } from './FileWatcher.js';
export { GitChangeDetector } from './GitChangeDetector.js';
export type { GitChangeDetectorConfig } from './GitChangeDetector.js';
export {
  IndexedFile,
  FileChange,
  IndexerConfig,
  IndexStats,
  WatcherConfig,
  WatcherEvent,
  FileChangeCallback,
  DEFAULT_INDEXER_CONFIG,
  DEFAULT_WATCHER_CONFIG,
} from './types.js';
