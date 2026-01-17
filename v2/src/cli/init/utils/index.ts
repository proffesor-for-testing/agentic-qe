/**
 * Shared utilities module for init operations
 *
 * Re-exports all utility functions from specialized modules:
 * - File system operations (file-utils)
 * - Logging with chalk formatting (log-utils)
 * - Path handling (path-utils)
 * - Validation (validation-utils)
 *
 * This barrel export maintains backward compatibility with existing imports.
 *
 * @module cli/init/utils
 */

// File system utilities
export {
  ensureDirectory,
  fileExists,
  directoryExists,
  safeWriteJson,
  safeReadJson,
  safeWriteFile,
  createDirectories,
  formatFileSize,
} from './file-utils';

// Logging utilities
export {
  logSuccess,
  logWarning,
  logError,
  logInfo,
  logExists,
} from './log-utils';

// Path utilities
export {
  getBaseDir,
  getDataDir,
  getConfigDir,
  getAgentsDir,
  getDocsDir,
  getRelativePath,
} from './path-utils';

// Validation utilities
export {
  validateRange,
  validateEnum,
  parseCommaSeparated,
  getPackageVersion,
} from './validation-utils';
