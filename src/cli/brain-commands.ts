/**
 * Brain CLI Commands
 *
 * Exported functions for brain export/import that can be wired into
 * the CLI command registry. These are thin wrappers around the core
 * brain-exporter module, handling database connection lifecycle.
 *
 * Supports two formats:
 *   - 'rvf'  — Single portable .rvf file (native @ruvector/rvf-node)
 *   - 'jsonl' — JSONL directory format (fallback, no native dependency)
 */

import Database from 'better-sqlite3';
import {
  exportBrain as coreExportBrain,
  importBrain as coreImportBrain,
  brainInfo as coreBrainInfo,
  type BrainExportManifest,
  type BrainExportOptions,
  type BrainImportOptions,
  type BrainImportResult,
} from '../integrations/ruvector/brain-exporter.js';
import {
  exportBrainToRvf,
  importBrainFromRvf,
  brainInfoFromRvf,
  isRvfAvailable,
  type RvfBrainManifest,
  type RvfBrainImportResult,
} from '../integrations/ruvector/brain-rvf-exporter.js';

/** Unified manifest type covering both formats */
export type BrainManifest = BrainExportManifest | RvfBrainManifest;

/** Unified import result type */
export type BrainImportResultUnified = BrainImportResult | RvfBrainImportResult;

/**
 * Export the QE brain state.
 *
 * When format is 'rvf' (default when native available), creates a single
 * portable .rvf file. Falls back to 'jsonl' directory format when the
 * native binding is unavailable.
 */
export async function exportBrain(
  dbPath: string,
  options: BrainExportOptions & { format?: string }
): Promise<BrainManifest> {
  const format = resolveFormat(options.format);

  if (format === 'rvf') {
    const db = new Database(dbPath, { readonly: true });
    db.pragma('journal_mode = WAL');
    try {
      return exportBrainToRvf(db, {
        outputPath: options.outputPath,
        domains: options.domains,
      }, dbPath);
    } finally {
      db.close();
    }
  }

  // JSONL fallback
  const db = new Database(dbPath, { readonly: true });
  db.pragma('journal_mode = WAL');
  try {
    return coreExportBrain(db, options, dbPath);
  } finally {
    db.close();
  }
}

/**
 * Import a brain export into a target database.
 *
 * Auto-detects format based on file extension:
 *   - .rvf → RVF format
 *   - directory → JSONL format
 */
export async function importBrain(
  dbPath: string,
  containerPath: string,
  options: BrainImportOptions & { format?: string }
): Promise<BrainImportResultUnified> {
  const format = detectImportFormat(containerPath, options.format);

  if (format === 'rvf') {
    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    try {
      return importBrainFromRvf(db, containerPath, {
        mergeStrategy: options.mergeStrategy,
        dryRun: options.dryRun,
      });
    } finally {
      db.close();
    }
  }

  // JSONL fallback
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  try {
    return coreImportBrain(db, containerPath, options);
  } finally {
    db.close();
  }
}

/**
 * Read manifest/info from a brain export.
 *
 * Auto-detects format based on path.
 */
export async function brainInfo(
  containerPath: string,
  format?: string
): Promise<BrainManifest> {
  const resolvedFormat = detectImportFormat(containerPath, format);

  if (resolvedFormat === 'rvf') {
    return brainInfoFromRvf(containerPath);
  }

  return coreBrainInfo(containerPath);
}

// ============================================================================
// Format resolution
// ============================================================================

/**
 * Resolve export format. Defaults to 'rvf' if native is available.
 */
function resolveFormat(format?: string): 'rvf' | 'jsonl' {
  if (format === 'jsonl') return 'jsonl';
  if (format === 'rvf') {
    if (!isRvfAvailable()) {
      throw new Error(
        'RVF format requested but @ruvector/rvf-node is not available on this platform. ' +
        'Use --format jsonl instead.'
      );
    }
    return 'rvf';
  }
  // Default: prefer RVF if available
  return isRvfAvailable() ? 'rvf' : 'jsonl';
}

/**
 * Detect import format from file path or explicit option.
 */
function detectImportFormat(path: string, format?: string): 'rvf' | 'jsonl' {
  if (format === 'rvf') return 'rvf';
  if (format === 'jsonl') return 'jsonl';

  // Auto-detect from file extension
  if (path.endsWith('.rvf')) return 'rvf';

  // Default to jsonl (directory)
  return 'jsonl';
}
