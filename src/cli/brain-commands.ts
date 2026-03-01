/**
 * Brain CLI Commands
 *
 * Exported functions for brain export/import that can be wired into
 * the CLI command registry. These are thin wrappers around the core
 * brain-exporter module, handling database connection lifecycle.
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

/**
 * Export the QE brain state from a database to a portable directory.
 *
 * Opens the database in read-only WAL mode to avoid write locks,
 * then delegates to the core export function.
 *
 * @param dbPath - Path to the source SQLite database
 * @param options - Export options including output path and filters
 * @returns The export manifest with stats and checksum
 */
export async function exportBrain(
  dbPath: string,
  options: BrainExportOptions
): Promise<BrainExportManifest> {
  const db = new Database(dbPath, { readonly: true });
  db.pragma('journal_mode = WAL');

  try {
    return coreExportBrain(db, options, dbPath);
  } finally {
    db.close();
  }
}

/**
 * Import a brain export directory into a target database.
 *
 * Opens the database in read-write mode, validates the manifest
 * checksum, then merges data using the specified strategy.
 *
 * @param dbPath - Path to the target SQLite database
 * @param containerPath - Path to the brain export directory
 * @param options - Import options including merge strategy
 * @returns Import result with counts of imported, skipped, and conflicting records
 */
export async function importBrain(
  dbPath: string,
  containerPath: string,
  options: BrainImportOptions
): Promise<BrainImportResult> {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  try {
    return coreImportBrain(db, containerPath, options);
  } finally {
    db.close();
  }
}

/**
 * Read the manifest from a brain export directory.
 *
 * @param containerPath - Path to the brain export directory
 * @returns The export manifest
 */
export async function brainInfo(
  containerPath: string
): Promise<BrainExportManifest> {
  return coreBrainInfo(containerPath);
}
