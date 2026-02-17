/**
 * Claude Flow to AQE Memory Bridge
 *
 * Syncs Claude Flow memories (.claude-flow/memory/store.json)
 * to AQE consolidated database (.agentic-qe/memory.db)
 *
 * This ensures experiences captured by Claude Code tasks
 * are available to AQE agents for learning.
 *
 * Usage:
 *   import { syncClaudeFlowToAQE } from './claude-flow-bridge.js';
 *   await syncClaudeFlowToAQE();
 *
 * Or via CLI:
 *   npx aqe sync claude-flow
 */

import * as fs from 'fs';
import * as path from 'path';
import secureJsonParse from 'secure-json-parse';
import { findProjectRoot } from '../kernel/unified-memory.js';
import { toErrorMessage } from '../shared/error-utils.js';

/**
 * Memory entry from Claude Flow store.json
 */
interface ClaudeFlowEntry {
  key: string;
  value: unknown;
  namespace?: string;
  timestamp?: number;
  expires_at?: number;
}

/**
 * Sync result
 */
export interface SyncResult {
  success: boolean;
  entriesSynced: number;
  entriesSkipped: number;
  errors: string[];
  claudeFlowPath: string;
  aqeDbPath: string;
  duration: number;
}

/**
 * Sync options
 */
export interface SyncOptions {
  /** Project root directory */
  projectRoot?: string;
  /** Only sync entries newer than this timestamp */
  since?: Date;
  /** Namespaces to sync (default: all) */
  namespaces?: string[];
  /** Dry run - don't write to DB */
  dryRun?: boolean;
  /** Verbose logging */
  verbose?: boolean;
}

/**
 * Categorize a Claude Flow entry for mapping to AQE tables
 */
function categorizeEntry(key: string, value: unknown): {
  table: 'qe_patterns' | 'sona_patterns' | 'kv_store' | 'qe_trajectories';
  domain?: string;
  type?: string;
} {
  const keyLower = key.toLowerCase();

  // Pattern-related entries -> qe_patterns
  if (keyLower.includes('pattern') || keyLower.includes('learning')) {
    return {
      table: 'qe_patterns',
      domain: extractDomain(key),
      type: 'pattern'
    };
  }

  // Agent experiences -> qe_trajectories
  if (keyLower.includes('agent') || keyLower.includes('task') ||
      keyLower.includes('experience') || keyLower.includes('outcome')) {
    return {
      table: 'qe_trajectories',
      domain: extractDomain(key),
      type: 'experience'
    };
  }

  // Analysis results -> sona_patterns (for learning)
  if (keyLower.includes('analysis') || keyLower.includes('coverage') ||
      keyLower.includes('quality') || keyLower.includes('metric')) {
    return {
      table: 'sona_patterns',
      domain: extractDomain(key),
      type: 'analysis'
    };
  }

  // Everything else -> kv_store
  return { table: 'kv_store' };
}

/**
 * Extract domain from key pattern
 */
function extractDomain(key: string): string {
  const domains = [
    'test-generation', 'test-execution', 'coverage-analysis',
    'quality-assessment', 'defect-intelligence', 'requirements-validation',
    'code-intelligence', 'security-compliance', 'contract-testing',
    'visual-accessibility', 'chaos-resilience', 'learning-optimization'
  ];

  for (const domain of domains) {
    if (key.toLowerCase().includes(domain.replace('-', ''))) {
      return domain;
    }
  }

  // Try to extract from path-style keys
  const parts = key.split('/');
  if (parts.length > 1) {
    const potential = parts[1];
    if (domains.includes(potential)) {
      return potential;
    }
  }

  return 'general';
}

/**
 * Sync Claude Flow memories to AQE V3 database
 */
export async function syncClaudeFlowToAQE(options: SyncOptions = {}): Promise<SyncResult> {
  const startTime = Date.now();
  const projectRoot = options.projectRoot || findProjectRoot();

  const claudeFlowPath = path.join(projectRoot, '.claude-flow', 'memory', 'store.json');
  const aqeDbPath = path.join(projectRoot, '.agentic-qe', 'memory.db');

  const result: SyncResult = {
    success: false,
    entriesSynced: 0,
    entriesSkipped: 0,
    errors: [],
    claudeFlowPath,
    aqeDbPath,
    duration: 0,
  };

  // Check Claude Flow store exists
  if (!fs.existsSync(claudeFlowPath)) {
    result.errors.push(`Claude Flow memory not found: ${claudeFlowPath}`);
    result.duration = Date.now() - startTime;
    return result;
  }

  // Check AQE DB exists
  if (!fs.existsSync(aqeDbPath)) {
    result.errors.push(`AQE V3 database not found: ${aqeDbPath}`);
    result.duration = Date.now() - startTime;
    return result;
  }

  try {
    // Read Claude Flow store
    const storeContent = fs.readFileSync(claudeFlowPath, 'utf-8');
    const store = secureJsonParse.parse(storeContent);

    // Extract entries
    let entries: Map<string, unknown>;
    if (store.entries && typeof store.entries === 'object') {
      entries = new Map(Object.entries(store.entries));
    } else {
      // Flat structure
      entries = new Map(Object.entries(store).filter(([k]) => !k.startsWith('_') && k !== 'version'));
    }

    if (options.verbose) {
      console.log(`[Claude Flow Bridge] Found ${entries.size} entries`);
    }

    // Filter by namespace if specified
    if (options.namespaces && options.namespaces.length > 0) {
      for (const [key, value] of entries) {
        const entry = value as ClaudeFlowEntry;
        if (entry.namespace && !options.namespaces.includes(entry.namespace)) {
          entries.delete(key);
        }
      }
    }

    // Filter by timestamp if specified
    if (options.since) {
      const sinceTs = options.since.getTime();
      for (const [key, value] of entries) {
        const entry = value as ClaudeFlowEntry;
        if (entry.timestamp && entry.timestamp < sinceTs) {
          entries.delete(key);
        }
      }
    }

    if (options.dryRun) {
      result.entriesSynced = entries.size;
      result.success = true;
      result.duration = Date.now() - startTime;
      console.log(`[DRY RUN] Would sync ${entries.size} entries`);
      return result;
    }

    // Import better-sqlite3
    const Database = (await import('better-sqlite3')).default;
    const db = new Database(aqeDbPath);

    try {
      db.pragma('journal_mode = WAL');

      // Prepare insert statements
      const insertKv = db.prepare(`
        INSERT OR REPLACE INTO kv_store (key, namespace, value, expires_at, created_at)
        VALUES (?, ?, ?, ?, ?)
      `);

      // Check if qe_patterns table has required columns
      const qePatternsCols = db.prepare("PRAGMA table_info(qe_patterns)").all() as Array<{ name: string }>;
      const hasQePatterns = qePatternsCols.length > 0;

      const sonaPatternsCols = db.prepare("PRAGMA table_info(sona_patterns)").all() as Array<{ name: string }>;
      const hasSonaPatterns = sonaPatternsCols.length > 0;

      // Process entries in a transaction
      const processEntries = db.transaction(() => {
        for (const [key, value] of entries) {
          try {
            const entry = value as ClaudeFlowEntry;
            const category = categorizeEntry(key, entry.value || entry);
            const now = Date.now();

            // All entries go to kv_store for guaranteed persistence
            insertKv.run(
              `cf:${key}`, // Prefix with cf: to identify Claude Flow origin
              entry.namespace || 'claude-flow',
              JSON.stringify(entry.value || entry),
              entry.expires_at || null,
              entry.timestamp || now
            );

            // Additionally, store learning-relevant entries in appropriate tables
            if (category.table === 'sona_patterns' && hasSonaPatterns) {
              const insertSona = db.prepare(`
                INSERT OR REPLACE INTO sona_patterns
                (id, type, domain, action_type, outcome_reward, outcome_success, metadata, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
              `);

              insertSona.run(
                `cf-${key.replace(/[^a-zA-Z0-9-]/g, '-')}`,
                category.type || 'analysis',
                category.domain || 'general',
                'claude-flow-import',
                0.5, // Default reward
                1,   // Assume successful
                JSON.stringify({ sourceKey: key, value: entry.value || entry })
              );
            }

            result.entriesSynced++;

            if (options.verbose) {
              console.log(`  [SYNC] ${key} -> ${category.table}`);
            }
          } catch (entryError) {
            result.entriesSkipped++;
            result.errors.push(`Failed to sync ${key}: ${entryError}`);
          }
        }
      });

      processEntries();

      result.success = true;
    } finally {
      db.close();
    }
  } catch (error) {
    result.errors.push(`Sync failed: ${toErrorMessage(error)}`);
  }

  result.duration = Date.now() - startTime;

  if (result.success) {
    console.log(`[Claude Flow Bridge] Synced ${result.entriesSynced} entries in ${result.duration}ms`);
  } else {
    console.error(`[Claude Flow Bridge] Sync failed:`, result.errors);
  }

  return result;
}

/**
 * Watch Claude Flow store for changes and sync automatically
 */
export function watchAndSync(options: SyncOptions = {}): () => void {
  const projectRoot = options.projectRoot || findProjectRoot();
  const claudeFlowPath = path.join(projectRoot, '.claude-flow', 'memory', 'store.json');

  let debounceTimer: NodeJS.Timeout | null = null;

  const watcher = fs.watch(claudeFlowPath, (eventType) => {
    if (eventType === 'change') {
      // Debounce to avoid multiple syncs for rapid changes
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }

      debounceTimer = setTimeout(async () => {
        console.log('[Claude Flow Bridge] Detected changes, syncing...');
        await syncClaudeFlowToAQE(options);
      }, 1000);
    }
  });

  console.log('[Claude Flow Bridge] Watching for changes...');

  // Return cleanup function
  return () => {
    watcher.close();
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
  };
}

/**
 * Get sync status - compare entries between systems
 */
export async function getSyncStatus(projectRoot?: string): Promise<{
  claudeFlowEntries: number;
  aqeKvEntries: number;
  aqeSonaPatterns: number;
  lastClaudeFlowUpdate: Date | null;
  lastAqeUpdate: Date | null;
  needsSync: boolean;
}> {
  const root = projectRoot || findProjectRoot();

  const claudeFlowPath = path.join(root, '.claude-flow', 'memory', 'store.json');
  const aqeDbPath = path.join(root, '.agentic-qe', 'memory.db');

  let claudeFlowEntries = 0;
  let lastClaudeFlowUpdate: Date | null = null;

  if (fs.existsSync(claudeFlowPath)) {
    const stats = fs.statSync(claudeFlowPath);
    lastClaudeFlowUpdate = stats.mtime;

    try {
      // Use secure-json-parse for consistency and defense-in-depth
      const store = secureJsonParse.parse(fs.readFileSync(claudeFlowPath, 'utf-8'));
      claudeFlowEntries = store.entries
        ? Object.keys(store.entries).length
        : Object.keys(store).filter(k => !k.startsWith('_') && k !== 'version').length;
    } catch (error) {
      // Non-critical: Claude Flow store parse errors
      console.debug('[ClaudeFlowBridge] Store parse error:', error instanceof Error ? error.message : error);
    }
  }

  let aqeKvEntries = 0;
  let aqeSonaPatterns = 0;
  let lastAqeUpdate: Date | null = null;

  if (fs.existsSync(aqeDbPath)) {
    const stats = fs.statSync(aqeDbPath);
    lastAqeUpdate = stats.mtime;

    try {
      const Database = (await import('better-sqlite3')).default;
      const db = new Database(aqeDbPath, { readonly: true });

      const kvCount = db.prepare("SELECT COUNT(*) as count FROM kv_store WHERE key LIKE 'cf:%'").get() as { count: number };
      aqeKvEntries = kvCount?.count || 0;

      const sonaCount = db.prepare("SELECT COUNT(*) as count FROM sona_patterns").get() as { count: number };
      aqeSonaPatterns = sonaCount?.count || 0;

      db.close();
    } catch (error) {
      // Non-critical: AQE database read errors during sync check
      console.debug('[ClaudeFlowBridge] AQE database read error:', error instanceof Error ? error.message : error);
    }
  }

  // Need sync if Claude Flow has more entries than we've synced
  const needsSync: boolean = claudeFlowEntries > aqeKvEntries ||
    !!(lastClaudeFlowUpdate && lastAqeUpdate && lastClaudeFlowUpdate > lastAqeUpdate);

  return {
    claudeFlowEntries,
    aqeKvEntries,
    aqeSonaPatterns,
    lastClaudeFlowUpdate,
    lastAqeUpdate,
    needsSync,
  };
}
