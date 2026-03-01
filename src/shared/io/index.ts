/**
 * Agentic QE v3 - I/O Module Exports
 * File system operations with caching and Result pattern
 */

export {
  // Main class
  FileReader,

  // Types
  type FileReaderOptions,
  type FileReaderStats,
  type CacheEntry,

  // Error classes
  FileReadError,
  JsonParseError,
  PathTraversalError, // SEC-004: Added for path traversal security

  // Convenience functions
  getFileReader,
  readFile,
  readJSON,
  fileExists,
  listFiles,
} from './file-reader';
