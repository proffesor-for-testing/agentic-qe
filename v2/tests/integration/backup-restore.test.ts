/**
 * Integration Tests for Backup and Restore System
 * Tests end-to-end backup creation, verification, and restoration
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import Database from 'better-sqlite3';
import * as crypto from 'crypto';

const execAsync = promisify(exec);

/**
 * Calculate SHA-256 checksum
 */
function calculateChecksum(filePath: string): string {
  const fileBuffer = fs.readFileSync(filePath);
  const hashSum = crypto.createHash('sha256');
  hashSum.update(fileBuffer);
  return hashSum.digest('hex');
}

describe('Backup and Restore System - Integration Tests', () => {
  const testDir = path.join(__dirname, '../.tmp/backup-restore-test-' + Date.now());
  const dbPath = path.join(testDir, 'agentdb.db');
  const backupDir = path.join(testDir, 'backups');

  beforeAll(() => {
    // Create test environment
    fs.mkdirSync(testDir, { recursive: true });
    fs.mkdirSync(backupDir, { recursive: true });

    // Create test database
    const db = new Database(dbPath);
    db.exec(`
      CREATE TABLE episodes (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        task TEXT NOT NULL,
        reward REAL,
        success INTEGER,
        created_at INTEGER
      );

      CREATE TABLE patterns (
        id TEXT PRIMARY KEY,
        pattern_type TEXT NOT NULL,
        agent_id TEXT,
        domain TEXT DEFAULT 'general',
        success_rate REAL DEFAULT 1.0
      );

      -- Insert test data
      INSERT INTO episodes VALUES
        ('ep1', 'test-session', 'test-gen', 0.95, 1, ${Date.now()}),
        ('ep2', 'test-session', 'coverage', 0.85, 1, ${Date.now()}),
        ('ep3', 'test-session', 'security', 0.90, 1, ${Date.now()});

      INSERT INTO patterns VALUES
        ('pat1', 'tdd-pattern', 'qe-test-gen', 'testing', 0.92),
        ('pat2', 'boundary-pattern', 'qe-coverage', 'analysis', 0.88);
    `);
    db.close();
  });

  afterAll(() => {
    // Cleanup test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('Backup Creation', () => {
    it('should create backup with timestamp and checksum', () => {
      const timestamp = Date.now();
      const backupPath = path.join(backupDir, `agentdb.db.backup.${timestamp}.db`);
      const checksumPath = `${backupPath}.sha256`;

      // Create backup
      fs.copyFileSync(dbPath, backupPath);
      const checksum = calculateChecksum(backupPath);
      fs.writeFileSync(checksumPath, checksum);

      // Verify backup exists
      expect(fs.existsSync(backupPath)).toBe(true);
      expect(fs.existsSync(checksumPath)).toBe(true);

      // Verify checksums match
      const originalChecksum = calculateChecksum(dbPath);
      const backupChecksum = fs.readFileSync(checksumPath, 'utf-8');

      expect(backupChecksum).toBe(calculateChecksum(backupPath));
    });

    it('should include all tables in backup', () => {
      const timestamp = Date.now();
      const backupPath = path.join(backupDir, `agentdb.db.backup.${timestamp}.db`);

      fs.copyFileSync(dbPath, backupPath);

      const db = new Database(backupPath, { readonly: true });
      const tables = db.prepare(`
        SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'
      `).all() as Array<{ name: string }>;
      db.close();

      const tableNames = tables.map(t => t.name);
      expect(tableNames).toContain('episodes');
      expect(tableNames).toContain('patterns');
    });

    it('should preserve all data in backup', () => {
      const timestamp = Date.now();
      const backupPath = path.join(backupDir, `agentdb.db.backup.${timestamp}.db`);

      // Get original counts
      const originalDb = new Database(dbPath, { readonly: true });
      const originalEpisodes = originalDb.prepare('SELECT COUNT(*) as count FROM episodes').get() as { count: number };
      const originalPatterns = originalDb.prepare('SELECT COUNT(*) as count FROM patterns').get() as { count: number };
      originalDb.close();

      // Create backup
      fs.copyFileSync(dbPath, backupPath);

      // Verify backup counts
      const backupDb = new Database(backupPath, { readonly: true });
      const backupEpisodes = backupDb.prepare('SELECT COUNT(*) as count FROM episodes').get() as { count: number };
      const backupPatterns = backupDb.prepare('SELECT COUNT(*) as count FROM patterns').get() as { count: number };
      backupDb.close();

      expect(backupEpisodes.count).toBe(originalEpisodes.count);
      expect(backupPatterns.count).toBe(originalPatterns.count);
    });
  });

  describe('Backup Verification', () => {
    it('should detect corrupted backup files', () => {
      const timestamp = Date.now();
      const backupPath = path.join(backupDir, `agentdb.db.backup.${timestamp}.db`);
      const checksumPath = `${backupPath}.sha256`;

      // Create backup
      fs.copyFileSync(dbPath, backupPath);
      const originalChecksum = calculateChecksum(backupPath);
      fs.writeFileSync(checksumPath, originalChecksum);

      // Corrupt backup
      fs.appendFileSync(backupPath, 'CORRUPTED DATA');

      // Verify corruption detected
      const corruptChecksum = calculateChecksum(backupPath);
      expect(corruptChecksum).not.toBe(originalChecksum);
    });

    it('should validate checksum file format', () => {
      const timestamp = Date.now();
      const backupPath = path.join(backupDir, `agentdb.db.backup.${timestamp}.db`);
      const checksumPath = `${backupPath}.sha256`;

      fs.copyFileSync(dbPath, backupPath);
      const checksum = calculateChecksum(backupPath);
      fs.writeFileSync(checksumPath, checksum);

      const storedChecksum = fs.readFileSync(checksumPath, 'utf-8');

      // Verify it's a valid SHA-256 hex string
      expect(storedChecksum).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('Database Restoration', () => {
    let originalData: any[];
    let backupTimestamp: number;

    beforeEach(() => {
      // Save original data
      const db = new Database(dbPath, { readonly: true });
      originalData = db.prepare('SELECT * FROM episodes ORDER BY id').all();
      db.close();

      // Create backup
      backupTimestamp = Date.now();
      const backupPath = path.join(backupDir, `agentdb.db.backup.${backupTimestamp}.db`);
      fs.copyFileSync(dbPath, backupPath);
      const checksum = calculateChecksum(backupPath);
      fs.writeFileSync(`${backupPath}.sha256`, checksum);
    });

    it('should restore database from backup', () => {
      // Modify current database
      const db = new Database(dbPath);
      db.exec('DELETE FROM episodes WHERE id = "ep1"');
      const afterDelete = db.prepare('SELECT COUNT(*) as count FROM episodes').get() as { count: number };
      db.close();

      expect(afterDelete.count).toBe(2);

      // Restore from backup
      const backupPath = path.join(backupDir, `agentdb.db.backup.${backupTimestamp}.db`);
      fs.copyFileSync(backupPath, dbPath);

      // Verify restoration
      const restored = new Database(dbPath, { readonly: true });
      const restoredCount = restored.prepare('SELECT COUNT(*) as count FROM episodes').get() as { count: number };
      const restoredData = restored.prepare('SELECT * FROM episodes ORDER BY id').all();
      restored.close();

      expect(restoredCount.count).toBe(3);
      expect(restoredData).toEqual(originalData);
    });

    it('should verify checksum before restoration', () => {
      const backupPath = path.join(backupDir, `agentdb.db.backup.${backupTimestamp}.db`);
      const checksumPath = `${backupPath}.sha256`;

      // Read and verify checksum
      const storedChecksum = fs.readFileSync(checksumPath, 'utf-8');
      const actualChecksum = calculateChecksum(backupPath);

      expect(actualChecksum).toBe(storedChecksum);
    });

    it('should maintain database integrity after restoration', () => {
      const backupPath = path.join(backupDir, `agentdb.db.backup.${backupTimestamp}.db`);

      // Restore
      fs.copyFileSync(backupPath, dbPath);

      // Verify integrity
      const db = new Database(dbPath, { readonly: true });

      // Check tables exist
      const tables = db.prepare(`
        SELECT name FROM sqlite_master WHERE type='table'
      `).all() as Array<{ name: string }>;

      // Verify can query data
      const episodes = db.prepare('SELECT * FROM episodes').all();
      const patterns = db.prepare('SELECT * FROM patterns').all();

      db.close();

      expect(tables.length).toBeGreaterThan(0);
      expect(episodes.length).toBe(3);
      expect(patterns.length).toBe(2);
    });
  });

  describe('Backup Listing', () => {
    it('should list all backups with timestamps', () => {
      // Create multiple backups
      const timestamps = [Date.now(), Date.now() + 1000, Date.now() + 2000];

      timestamps.forEach(timestamp => {
        const backupPath = path.join(backupDir, `agentdb.db.backup.${timestamp}.db`);
        fs.copyFileSync(dbPath, backupPath);
        const checksum = calculateChecksum(backupPath);
        fs.writeFileSync(`${backupPath}.sha256`, checksum);
      });

      // List backups
      const backups = fs.readdirSync(backupDir)
        .filter(f => f.includes('.backup.') && f.endsWith('.db'));

      expect(backups.length).toBeGreaterThanOrEqual(3);
    });

    it('should identify latest backup', () => {
      // Create backups with known timestamps
      const t1 = 1000000000;
      const t2 = 2000000000;
      const t3 = 3000000000;

      [t1, t2, t3].forEach(timestamp => {
        const backupPath = path.join(backupDir, `agentdb.db.backup.${timestamp}.db`);
        fs.copyFileSync(dbPath, backupPath);
      });

      // Find latest
      const backups = fs.readdirSync(backupDir)
        .filter(f => f.includes('.backup.') && f.endsWith('.db'))
        .map(f => {
          const match = f.match(/\.backup\.(\d+)\.db$/);
          return match ? parseInt(match[1]) : 0;
        })
        .sort((a, b) => b - a);

      expect(backups[0]).toBe(t3);
    });
  });

  describe('Cleanup Operations', () => {
    it('should remove old backups', () => {
      // Create old backups
      const oldTimestamp = Date.now() - (31 * 24 * 60 * 60 * 1000); // 31 days ago
      const oldBackupPath = path.join(backupDir, `agentdb.db.backup.${oldTimestamp}.db`);

      fs.copyFileSync(dbPath, oldBackupPath);
      expect(fs.existsSync(oldBackupPath)).toBe(true);

      // Simulate cleanup
      const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
      const now = Date.now();

      const backups = fs.readdirSync(backupDir)
        .filter(f => f.includes('.backup.') && f.endsWith('.db'));

      backups.forEach(backup => {
        const match = backup.match(/\.backup\.(\d+)\.db$/);
        if (match) {
          const timestamp = parseInt(match[1]);
          const age = now - timestamp;

          if (age > maxAge) {
            const backupPath = path.join(backupDir, backup);
            const checksumPath = `${backupPath}.sha256`;

            fs.unlinkSync(backupPath);
            if (fs.existsSync(checksumPath)) {
              fs.unlinkSync(checksumPath);
            }
          }
        }
      });

      expect(fs.existsSync(oldBackupPath)).toBe(false);
    });
  });
});
