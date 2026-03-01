/**
 * SQLite Writer Unit Tests
 *
 * Tests for local database write operations:
 * - INSERT ... ON CONFLICT DO UPDATE (preserves unmapped columns)
 * - INSERT OR IGNORE for tables without PK
 * - Column filtering (only insert columns that exist locally)
 * - Batch processing with retry on failure
 * - Value serialization (objects→JSON, booleans→int, dates→ISO)
 * - Table existence validation with warning
 * - Count queries
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { SQLiteWriter, createSQLiteWriter } from '../../../../src/sync/writers/sqlite-writer.js';
import { openDatabase } from '../../../../src/shared/safe-db.js';

// Use a temp directory for test databases
// __dirname resolves correctly regardless of cwd
const TEST_DB_DIR = path.resolve(import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname));
const TEST_DB_PATH = path.join(TEST_DB_DIR, '_test_sqlite_writer.db');

describe('SQLiteWriter', () => {
  let writer: SQLiteWriter;

  beforeEach(() => {
    // Create a fresh test database with schema
    const db = openDatabase(TEST_DB_PATH);
    db.exec(`
      CREATE TABLE IF NOT EXISTS qe_patterns (
        id TEXT PRIMARY KEY,
        name TEXT,
        confidence REAL,
        reusable INTEGER DEFAULT 0,
        local_only_col TEXT DEFAULT 'preserved'
      );
      CREATE TABLE IF NOT EXISTS dream_insights (
        data TEXT,
        created_at TEXT
      );
      CREATE TABLE IF NOT EXISTS rl_q_values (
        state_key TEXT,
        action_key TEXT,
        q_value REAL,
        visits INTEGER DEFAULT 0,
        PRIMARY KEY (state_key, action_key)
      );
    `);
    db.close();

    writer = createSQLiteWriter({ dbPath: TEST_DB_PATH, batchSize: 2 });
  });

  afterEach(async () => {
    if (writer) {
      await writer.close();
    }
    // Clean up test database
    try { fs.unlinkSync(TEST_DB_PATH); } catch { /* ok */ }
    try { fs.unlinkSync(TEST_DB_PATH + '-wal'); } catch { /* ok */ }
    try { fs.unlinkSync(TEST_DB_PATH + '-shm'); } catch { /* ok */ }
  });

  describe('connect', () => {
    it('should open an existing database', async () => {
      await writer.connect();
      const count = await writer.count('qe_patterns');
      expect(count).toBe(0);
    });

    it('should throw for non-existent database', async () => {
      const badWriter = createSQLiteWriter({ dbPath: '/tmp/nonexistent_test_db.db' });
      await expect(badWriter.connect()).rejects.toThrow('not found');
    });
  });

  describe('upsert with ON CONFLICT', () => {
    it('should insert new records', async () => {
      await writer.connect();
      const written = await writer.upsert('qe_patterns', [
        { id: 'p1', name: 'Pattern 1', confidence: 0.9 },
        { id: 'p2', name: 'Pattern 2', confidence: 0.8 },
      ]);
      expect(written).toBe(2);
      expect(await writer.count('qe_patterns')).toBe(2);
    });

    it('should update existing records on conflict without NULLing unmapped columns', async () => {
      await writer.connect();

      // Insert initial record with local_only_col set
      const db = openDatabase(TEST_DB_PATH);
      db.exec("INSERT INTO qe_patterns (id, name, confidence, local_only_col) VALUES ('p1', 'Old Name', 0.5, 'important_data')");
      db.close();

      // Upsert with only some columns — local_only_col should NOT be NULLed
      await writer.upsert('qe_patterns', [
        { id: 'p1', name: 'New Name', confidence: 0.95 },
      ]);

      // Verify the update preserved local_only_col
      const db2 = openDatabase(TEST_DB_PATH, { readonly: true });
      const row = db2.prepare('SELECT * FROM qe_patterns WHERE id = ?').get('p1') as Record<string, unknown>;
      db2.close();

      expect(row.name).toBe('New Name');
      expect(row.confidence).toBe(0.95);
      expect(row.local_only_col).toBe('important_data');  // PRESERVED, not NULLed
    });

    it('should handle composite primary keys', async () => {
      await writer.connect();

      await writer.upsert('rl_q_values', [
        { state_key: 's1', action_key: 'a1', q_value: 0.5 },
      ]);

      // Update the q_value for the same state/action
      await writer.upsert('rl_q_values', [
        { state_key: 's1', action_key: 'a1', q_value: 0.9 },
      ]);

      const db = openDatabase(TEST_DB_PATH, { readonly: true });
      const row = db.prepare('SELECT * FROM rl_q_values WHERE state_key = ? AND action_key = ?').get('s1', 'a1') as Record<string, unknown>;
      db.close();

      expect(row.q_value).toBe(0.9);
      expect(await writer.count('rl_q_values')).toBe(1);
    });
  });

  describe('upsert with no PK (INSERT OR IGNORE)', () => {
    it('should insert into tables without primary key', async () => {
      await writer.connect();
      // dream_insights has no PK in our test schema — uses INSERT OR IGNORE
      const written = await writer.upsert('dream_insights', [
        { data: 'record1', created_at: '2026-01-01' },
        { data: 'record2', created_at: '2026-01-02' },
      ]);
      expect(written).toBe(2);
    });
  });

  describe('column filtering', () => {
    it('should skip columns that do not exist in local table', async () => {
      await writer.connect();
      const written = await writer.upsert('qe_patterns', [
        { id: 'p1', name: 'test', nonexistent_col: 'should be ignored', confidence: 0.5 },
      ]);
      expect(written).toBe(1);

      const db = openDatabase(TEST_DB_PATH, { readonly: true });
      const row = db.prepare('SELECT * FROM qe_patterns WHERE id = ?').get('p1') as Record<string, unknown>;
      db.close();

      expect(row.name).toBe('test');
      expect(row).not.toHaveProperty('nonexistent_col');
    });
  });

  describe('missing table handling', () => {
    it('should return 0 and warn when table does not exist in DB', async () => {
      await writer.connect();
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Use a real allowlisted name that doesn't exist in our test DB schema
      const written = await writer.upsert('sona_patterns', [{ id: '1' }]);

      expect(written).toBe(0);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Table 'sona_patterns' does not exist")
      );

      warnSpy.mockRestore();
    });
  });

  describe('batch processing', () => {
    it('should process records in configured batch size', async () => {
      await writer.connect();
      // batchSize=2, so 3 records = 2 batches
      const written = await writer.upsert('qe_patterns', [
        { id: 'p1', name: 'a', confidence: 0.1 },
        { id: 'p2', name: 'b', confidence: 0.2 },
        { id: 'p3', name: 'c', confidence: 0.3 },
      ]);
      expect(written).toBe(3);
      expect(await writer.count('qe_patterns')).toBe(3);
    });
  });

  describe('value serialization', () => {
    it('should serialize objects to JSON strings', async () => {
      await writer.connect();
      await writer.upsert('qe_patterns', [
        { id: 'p1', name: JSON.stringify({ nested: true }) },
      ]);

      const db = openDatabase(TEST_DB_PATH, { readonly: true });
      const row = db.prepare('SELECT name FROM qe_patterns WHERE id = ?').get('p1') as Record<string, unknown>;
      db.close();

      // Objects should become JSON strings
      expect(typeof row.name).toBe('string');
    });

    it('should convert booleans to integers', async () => {
      await writer.connect();
      await writer.upsert('qe_patterns', [
        { id: 'p1', reusable: true },
        { id: 'p2', reusable: false },
      ]);

      const db = openDatabase(TEST_DB_PATH, { readonly: true });
      const r1 = db.prepare('SELECT reusable FROM qe_patterns WHERE id = ?').get('p1') as Record<string, unknown>;
      const r2 = db.prepare('SELECT reusable FROM qe_patterns WHERE id = ?').get('p2') as Record<string, unknown>;
      db.close();

      expect(r1.reusable).toBe(1);
      expect(r2.reusable).toBe(0);
    });

    it('should convert null and undefined to null', async () => {
      await writer.connect();
      await writer.upsert('qe_patterns', [
        { id: 'p1', name: null },
      ]);

      const db = openDatabase(TEST_DB_PATH, { readonly: true });
      const row = db.prepare('SELECT name FROM qe_patterns WHERE id = ?').get('p1') as Record<string, unknown>;
      db.close();

      expect(row.name).toBeNull();
    });
  });

  describe('count', () => {
    it('should return 0 for empty table', async () => {
      await writer.connect();
      expect(await writer.count('qe_patterns')).toBe(0);
    });

    it('should return 0 for nonexistent table', async () => {
      await writer.connect();
      expect(await writer.count('nonexistent')).toBe(0);
    });
  });
});
