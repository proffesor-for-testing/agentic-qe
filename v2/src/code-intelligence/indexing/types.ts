/**
 * Types for Incremental Indexing System
 *
 * Supports efficient file watching and delta updates
 * to maintain index freshness without full rebuilds.
 */

export interface IndexedFile {
  /** Unique file identifier */
  fileId: string;

  /** Absolute file path */
  filePath: string;

  /** File content hash for change detection */
  contentHash: string;

  /** Last modification timestamp */
  lastModified: number;

  /** File size in bytes */
  size: number;

  /** Programming language */
  language: string;

  /** Number of chunks created from this file */
  chunkCount: number;

  /** Index status */
  status: 'indexed' | 'pending' | 'error';

  /** Error message if status is 'error' */
  error?: string;

  /** Chunk IDs belonging to this file */
  chunkIds: string[];
}

export interface FileChange {
  /** Type of change */
  type: 'add' | 'modify' | 'delete';

  /** File path */
  filePath: string;

  /** Content hash (for add/modify) */
  contentHash?: string;

  /** Timestamp of change */
  timestamp: number;
}

export interface IndexerConfig {
  /**
   * Root directory to index.
   */
  rootDir: string;

  /**
   * File extensions to include.
   * Default: ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs']
   */
  extensions: string[];

  /**
   * Directories to exclude.
   * Default: ['node_modules', '.git', 'dist', 'build']
   */
  excludeDirs: string[];

  /**
   * Maximum file size to index (bytes).
   * Default: 1MB
   */
  maxFileSize: number;

  /**
   * Batch size for parallel processing.
   * Default: 10
   */
  batchSize: number;

  /**
   * Enable file watching for live updates.
   * Default: true
   */
  watchEnabled: boolean;

  /**
   * Debounce interval for file changes (ms).
   * Default: 300
   */
  debounceMs: number;
}

export interface IndexStats {
  /** Total files indexed */
  totalFiles: number;

  /** Total chunks created */
  totalChunks: number;

  /** Files pending indexing */
  pendingFiles: number;

  /** Files with errors */
  errorFiles: number;

  /** Last full index time (ms) */
  lastFullIndexMs: number;

  /** Average incremental update time (ms) */
  avgIncrementalMs: number;

  /** Index size estimate (bytes) */
  indexSizeBytes: number;
}

export interface WatcherConfig {
  /**
   * Root directory to watch.
   */
  rootDir: string;

  /**
   * File patterns to watch (glob).
   * Default: TypeScript, JavaScript, Python, Go, Rust files
   */
  patterns: string[];

  /**
   * Patterns to ignore.
   * Default: node_modules, .git directories
   */
  ignorePatterns: string[];

  /**
   * Debounce interval (ms).
   * Default: 300
   */
  debounceMs: number;

  /**
   * Whether to use polling (for remote filesystems).
   * Default: false
   */
  usePolling: boolean;

  /**
   * Polling interval if usePolling is true (ms).
   * Default: 1000
   */
  pollInterval: number;
}

export interface WatcherEvent {
  /** Event type */
  type: 'add' | 'change' | 'unlink';

  /** File path */
  path: string;

  /** Event timestamp */
  timestamp: number;
}

export type FileChangeCallback = (changes: FileChange[]) => Promise<void>;

export const DEFAULT_INDEXER_CONFIG: IndexerConfig = {
  rootDir: '.',
  extensions: ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java', '.c', '.cpp', '.h'],
  excludeDirs: ['node_modules', '.git', 'dist', 'build', 'coverage', '__pycache__', '.next'],
  maxFileSize: 1024 * 1024, // 1MB
  batchSize: 10,
  watchEnabled: true,
  debounceMs: 300,
};

export const DEFAULT_WATCHER_CONFIG: WatcherConfig = {
  rootDir: '.',
  patterns: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.py', '**/*.go', '**/*.rs'],
  ignorePatterns: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**'],
  debounceMs: 300,
  usePolling: false,
  pollInterval: 1000,
};
