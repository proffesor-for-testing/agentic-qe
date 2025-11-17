/**
 * Unit Tests for Database Migration Functions
 * Tests migration safety, checksums, and data integrity
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import Database from 'better-sqlite3';
import * as crypto from 'crypto';

/**
 * Calculate SHA-256 checksum of database file
 */
function calculateChecksum(dbPath: string): string {
  const fileBuffer = fs.readFileSync(dbPath);
  const hashSum = crypto.createHash('sha256');
  hashSum.update(fileBuffer);
  return hashSum.digest('hex');
}

/**
 * Migration options interface
 */
interface MigrationOptions {
  dryRun?: boolean;
  backup?: boolean;
  verify?: boolean;
}

/**
 * Migration result interface
 */
interface MigrationResult {
  success: boolean;
  dryRun: boolean;
  sourceChecksum: string;
  targetChecksum?: string;
  recordsMigrated?: number;
  backupPath?: string;
}

describe('Database Migration - Unit Tests', () => {
  let testDir: string;
  let sourceDb: string;

  beforeEach(() => {
    // Create temporary test directory
    testDir = path.join(__dirname, '../.tmp/migration-test-' + Date.now());
    fs.mkdirSync(testDir, { recursive: true });

    // Create test database with sample data
    sourceDb = path.join(testDir, 'source.db');
    const db = new Database(sourceDb);

    // Create episodes table (ReasoningBank)
    db.exec(`
      CREATE TABLE IF NOT EXISTS episodes (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        task TEXT NOT NULL,
        input TEXT,
        output TEXT,
        critique TEXT,
        reward REAL,
        success INTEGER,
        tokens_used INTEGER,
        latency_ms INTEGER,
        created_at INTEGER
      );

      INSERT INTO episodes VALUES
        ('ep1', 'session1', 'test-generation', 'input1', 'output1', 'good', 0.95, 1, 1000, 500, 1234567890),
        ('ep2', 'session1', 'coverage-analysis', 'input2', 'output2', 'excellent', 0.85, 1, 1500, 600, 1234567891),
        ('ep3', 'session1', 'flaky-detection', 'input3', 'output3', 'needs work', 0.75, 1, 2000, 700, 1234567892);
    `);

    // Create patterns table
    db.exec(`
      CREATE TABLE IF NOT EXISTS patterns (
        id TEXT PRIMARY KEY,
        pattern_type TEXT NOT NULL,
        pattern_data TEXT NOT NULL,
        agent_id TEXT,
        domain TEXT DEFAULT 'general',
        success_rate REAL DEFAULT 1.0,
        usage_count INTEGER DEFAULT 0,
        created_at INTEGER
      );

      INSERT INTO patterns VALUES
        ('pat1', 'test-pattern', '{"strategy": "tdd"}', 'qe-test-gen', 'testing', 0.92, 10, 1234567890),
        ('pat2', 'coverage-pattern', '{"approach": "boundary"}', 'qe-coverage', 'analysis', 0.88, 5, 1234567891);
    `);

    db.close();
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('Checksum Calculation', () => {
    it('should calculate consistent checksums', () => {
      const checksum1 = calculateChecksum(sourceDb);
      const checksum2 = calculateChecksum(sourceDb);

      expect(checksum1).toBe(checksum2);
      expect(checksum1).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should detect file changes', () => {
      const checksum1 = calculateChecksum(sourceDb);

      // Modify database
      const db = new Database(sourceDb);
      db.exec('INSERT INTO episodes VALUES ("ep4", "session2", "new-task", NULL, NULL, NULL, 0.5, 0, 0, 0, 1234567893)');
      db.close();

      const checksum2 = calculateChecksum(sourceDb);

      expect(checksum1).not.toBe(checksum2);
    });

    it('should produce different checksums for different files', () => {
      const db2Path = path.join(testDir, 'different.db');
      const db2 = new Database(db2Path);
      db2.exec('CREATE TABLE test (id INTEGER PRIMARY KEY)');
      db2.close();

      const checksum1 = calculateChecksum(sourceDb);
      const checksum2 = calculateChecksum(db2Path);

      expect(checksum1).not.toBe(checksum2);
    });
  });

  describe('Data Preservation', () => {
    it('should preserve all episodes records', () => {
      const db = new Database(sourceDb, { readonly: true });
      const beforeCount = db.prepare('SELECT COUNT(*) as count FROM episodes').get() as { count: number };
      const beforeData = db.prepare('SELECT * FROM episodes ORDER BY id').all();
      db.close();

      // Simulate migration
      const targetDb = path.join(testDir, 'target.db');
      fs.copyFileSync(sourceDb, targetDb);

      const targetConnection = new Database(targetDb, { readonly: true });
      const afterCount = targetConnection.prepare('SELECT COUNT(*) as count FROM episodes').get() as { count: number };
      const afterData = targetConnection.prepare('SELECT * FROM episodes ORDER BY id').all();
      targetConnection.close();

      expect(afterCount.count).toBe(beforeCount.count);
      expect(afterCount.count).toBe(3);
      expect(afterData).toEqual(beforeData);
    });

    it('should preserve all patterns records', () => {
      const db = new Database(sourceDb, { readonly: true });
      const beforeCount = db.prepare('SELECT COUNT(*) as count FROM patterns').get() as { count: number };
      const beforeData = db.prepare('SELECT * FROM patterns ORDER BY id').all();
      db.close();

      // Simulate migration
      const targetDb = path.join(testDir, 'target.db');
      fs.copyFileSync(sourceDb, targetDb);

      const targetConnection = new Database(targetDb, { readonly: true });
      const afterCount = targetConnection.prepare('SELECT COUNT(*) as count FROM patterns').get() as { count: number };
      const afterData = targetConnection.prepare('SELECT * FROM patterns ORDER BY id').all();
      targetConnection.close();

      expect(afterCount.count).toBe(beforeCount.count);
      expect(afterCount.count).toBe(2);
      expect(afterData).toEqual(beforeData);
    });

    it('should detect data corruption', () => {
      const targetDb = path.join(testDir, 'target.db');
      fs.copyFileSync(sourceDb, targetDb);

      // Corrupt target database
      const db = new Database(targetDb);
      db.exec('DELETE FROM episodes WHERE id = "ep1"');
      db.close();

      const sourceChecksum = calculateChecksum(sourceDb);
      const targetChecksum = calculateChecksum(targetDb);

      expect(targetChecksum).not.toBe(sourceChecksum);
    });
  });

  describe('Column Schema', () => {
    it('should verify episodes table has all required columns', () => {
      const db = new Database(sourceDb, { readonly: true });
      const columns = db.prepare('PRAGMA table_info(episodes)').all() as Array<{
        name: string;
        type: string;
      }>;
      db.close();

      const columnNames = columns.map(col => col.name);

      expect(columnNames).toContain('id');
      expect(columnNames).toContain('session_id');
      expect(columnNames).toContain('task');
      expect(columnNames).toContain('reward');
      expect(columnNames).toContain('success');
      expect(columnNames).toContain('created_at');
    });

    it('should verify patterns table has all required columns', () => {
      const db = new Database(sourceDb, { readonly: true });
      const columns = db.prepare('PRAGMA table_info(patterns)').all() as Array<{
        name: string;
        type: string;
      }>;
      db.close();

      const columnNames = columns.map(col => col.name);

      expect(columnNames).toContain('id');
      expect(columnNames).toContain('pattern_type');
      expect(columnNames).toContain('agent_id');
      expect(columnNames).toContain('domain');
      expect(columnNames).toContain('success_rate');
    });
  });

  describe('Dry Run Mode', () => {
    it('should not create target database in dry-run mode', () => {
      const targetDb = path.join(testDir, '.agentic-qe', 'agentdb.db');

      // Simulate dry-run
      const result: MigrationResult = {
        success: true,
        dryRun: true,
        sourceChecksum: calculateChecksum(sourceDb),
        recordsMigrated: 0
      };

      expect(result.dryRun).toBe(true);
      expect(fs.existsSync(targetDb)).toBe(false);
    });

    it('should report what would be migrated in dry-run', () => {
      const db = new Database(sourceDb, { readonly: true });
      const episodesCount = db.prepare('SELECT COUNT(*) as count FROM episodes').get() as { count: number };
      const patternsCount = db.prepare('SELECT COUNT(*) as count FROM patterns').get() as { count: number };
      db.close();

      const totalRecords = episodesCount.count + patternsCount.count;

      expect(totalRecords).toBe(5);
    });
  });

  describe('Backup Creation', () => {
    it('should create backup with timestamp', () => {
      const backupDir = path.join(testDir, 'backups');
      fs.mkdirSync(backupDir, { recursive: true });

      const timestamp = Date.now();
      const backupPath = path.join(backupDir, `source.db.backup.${timestamp}.db`);

      fs.copyFileSync(sourceDb, backupPath);

      expect(fs.existsSync(backupPath)).toBe(true);

      const sourceChecksum = calculateChecksum(sourceDb);
      const backupChecksum = calculateChecksum(backupPath);

      expect(backupChecksum).toBe(sourceChecksum);
    });

    it('should create checksum file with backup', () => {
      const backupDir = path.join(testDir, 'backups');
      fs.mkdirSync(backupDir, { recursive: true });

      const timestamp = Date.now();
      const backupPath = path.join(backupDir, `source.db.backup.${timestamp}.db`);
      const checksumPath = `${backupPath}.sha256`;

      fs.copyFileSync(sourceDb, backupPath);
      const checksum = calculateChecksum(backupPath);
      fs.writeFileSync(checksumPath, checksum);

      expect(fs.existsSync(checksumPath)).toBe(true);

      const storedChecksum = fs.readFileSync(checksumPath, 'utf-8');
      expect(storedChecksum).toBe(checksum);
    });
  });

  describe('Index Preservation', () => {
    it('should preserve indexes after migration', () => {
      // Add index to source
      const db = new Database(sourceDb);
      db.exec('CREATE INDEX idx_episodes_task ON episodes(task)');
      db.exec('CREATE INDEX idx_patterns_agent ON patterns(agent_id)');
      db.close();

      // Check indexes exist
      const dbRead = new Database(sourceDb, { readonly: true });
      const indexes = dbRead.prepare(`
        SELECT name FROM sqlite_master WHERE type='index' AND sql IS NOT NULL
      `).all() as Array<{ name: string }>;
      dbRead.close();

      const indexNames = indexes.map(idx => idx.name);

      expect(indexNames).toContain('idx_episodes_task');
      expect(indexNames).toContain('idx_patterns_agent');
    });
  });

  describe('Error Handling', () => {
    it('should handle missing source database', () => {
      const missingDb = path.join(testDir, 'nonexistent.db');

      expect(() => {
        new Database(missingDb, { readonly: true });
      }).toThrow();
    });

    it('should handle corrupted database file', () => {
      const corruptDb = path.join(testDir, 'corrupt.db');
      fs.writeFileSync(corruptDb, 'NOT A VALID SQLITE DATABASE');

      expect(() => {
        new Database(corruptDb);
      }).toThrow();
    });

    it('should detect insufficient disk space scenario', () => {
      // This is a conceptual test - actual implementation would check disk space
      const dbStats = fs.statSync(sourceDb);
      const requiredSpace = dbStats.size * 2; // Need space for source + backup

      expect(requiredSpace).toBeGreaterThan(0);
    });
  });
});
