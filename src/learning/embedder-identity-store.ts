/**
 * Persistent store for ADR-097 embedder endpoint identity.
 *
 * Identity is written into the unified memory.db `kv_store` table under
 * namespace `_system`, key `embedder_identity:<safe_endpoint_url>`. This lets
 * us detect cross-run model drift: if the fingerprint changes between AQE
 * processes, vectors written before the change may not be comparable to vectors
 * written after, and the operator should know.
 *
 * Conforms to the project's unified-persistence rule (no new .db files).
 *
 * Persistence failures are non-fatal — callers wrap us in try/catch and log.
 * We never throw out of these helpers under expected conditions; failure
 * reasons are surfaced as thrown errors only for genuine I/O problems.
 */

import { join } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { EndpointIdentity } from './embedder-endpoint-client.js';

// `require` is unavailable in pure ESM; createRequire gives us synchronous
// access to CommonJS modules like better-sqlite3 from the ESM build output.
const nodeRequire = createRequire(import.meta.url);

/**
 * Path to the unified memory.db. Honors AQE_MEMORY_PATH env override (used by
 * tests and platform installers), otherwise falls back to the project default.
 */
function getMemoryDbPath(): string {
  const env = process.env.AQE_MEMORY_PATH;
  if (env && env.length > 0) return env;
  return join(process.cwd(), '.agentic-qe', 'memory.db');
}

const NAMESPACE = '_system';
const KEY_PREFIX = 'embedder_identity:';

interface StoredIdentityRow {
  fingerprint: string;
  dim: number;
  endpoint: string;
  /** When the identity was last persisted (ms since epoch). */
  updatedAt: number;
}

let cachedDb: import('better-sqlite3').Database | null = null;
let openFailed = false;

/**
 * Lazily open memory.db. We use a dedicated read/write connection (better-sqlite3
 * supports concurrent connections to the same file under WAL mode, which the
 * init wizard enables). Failure to open is cached so we don't retry every call.
 */
function openDb(): import('better-sqlite3').Database | null {
  if (cachedDb) return cachedDb;
  if (openFailed) return null;
  try {
    // Dynamic require (via createRequire — `require` is undefined in ESM) so
    // this module doesn't fail to import when better-sqlite3 is absent in
    // some test environments. The endpoint feature is optional; identity
    // persistence is a nice-to-have on top of it.
    const Database = nodeRequire('better-sqlite3') as typeof import('better-sqlite3');
    const path = getMemoryDbPath();
    const dir = join(path, '..');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const db = new Database(path);
    db.pragma('journal_mode = WAL');
    db.pragma('busy_timeout = 5000');
    db.exec(`
      CREATE TABLE IF NOT EXISTS kv_store (
        key TEXT NOT NULL,
        namespace TEXT NOT NULL,
        value TEXT NOT NULL,
        expires_at INTEGER,
        created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
        PRIMARY KEY (namespace, key)
      );
      CREATE INDEX IF NOT EXISTS idx_kv_namespace ON kv_store(namespace);
    `);
    cachedDb = db;
    return db;
  } catch {
    openFailed = true;
    return null;
  }
}

/**
 * Load the last persisted identity for the given endpoint URL.
 * Returns null when nothing has been stored yet OR when the kv store is unavailable.
 */
export function loadEmbedderIdentity(endpointUrl: string): EndpointIdentity | null {
  const db = openDb();
  if (!db) return null;
  try {
    const row = db
      .prepare<[string, string], { value: string }>(
        'SELECT value FROM kv_store WHERE namespace = ? AND key = ?'
      )
      .get(NAMESPACE, KEY_PREFIX + endpointUrl);
    if (!row) return null;
    const parsed = JSON.parse(row.value) as StoredIdentityRow;
    if (!parsed.fingerprint || typeof parsed.dim !== 'number') return null;
    return {
      fingerprint: parsed.fingerprint,
      dim: parsed.dim,
      endpoint: parsed.endpoint,
    };
  } catch {
    return null;
  }
}

/**
 * Persist the current identity. Overwrites any prior entry for the same endpoint.
 */
export function saveEmbedderIdentity(identity: EndpointIdentity): void {
  const db = openDb();
  if (!db) return;
  const row: StoredIdentityRow = {
    fingerprint: identity.fingerprint,
    dim: identity.dim,
    endpoint: identity.endpoint,
    updatedAt: Date.now(),
  };
  db.prepare(
    'INSERT OR REPLACE INTO kv_store (key, namespace, value) VALUES (?, ?, ?)'
  ).run(KEY_PREFIX + identity.endpoint, NAMESPACE, JSON.stringify(row));
}

/**
 * For tests: close the cached connection so a fresh DB path can be used.
 */
export function resetEmbedderIdentityStore(): void {
  if (cachedDb) {
    try {
      cachedDb.close();
    } catch {
      // ignore
    }
  }
  cachedDb = null;
  openFailed = false;
}
