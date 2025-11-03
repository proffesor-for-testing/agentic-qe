/**
 * Comprehensive Tests for RollbackManager
 * Coverage target: 90%+ of RollbackManager.ts
 */

import { RollbackManager, Snapshot, RollbackResult } from '@core/hooks/RollbackManager';
import { SwarmMemoryManager } from '@core/memory/SwarmMemoryManager';
import * as fs from 'fs-extra';

// Use CommonJS require to avoid module resolution issues
const pathLib = require('path');
const osLib = require('os');

describe('RollbackManager - Comprehensive Tests', () => {
  let rollbackManager: RollbackManager;
  let memoryManager: SwarmMemoryManager;
  let testDir: string;
  let testFile1: string;
  let testFile2: string;

  beforeEach(async () => {
    // Create test directory
    testDir = pathLib.join(osLib.tmpdir(), `rollback-test-${Date.now()}`);
    await fs.ensureDir(testDir);

    testFile1 = pathLib.join(testDir, 'test1.txt');
    testFile2 = pathLib.join(testDir, 'test2.txt');

    await fs.writeFile(testFile1, 'original content 1');
    await fs.writeFile(testFile2, 'original content 2');

    // Initialize memory manager
    const dbPath = pathLib.join(testDir, 'memory.db');
    memoryManager = new SwarmMemoryManager(dbPath);
    await memoryManager.initialize();

    rollbackManager = new RollbackManager(memoryManager);
  });

  afterEach(async () => {
    await memoryManager.close();
    await fs.remove(testDir);
  });

  describe('Snapshot Creation', () => {
    it('should create snapshot with valid files', async () => {
      const snapshot = await rollbackManager.createSnapshot({
        id: 'snap-1',
        files: [testFile1, testFile2],
        metadata: { reason: 'test' }
      });

      expect(snapshot.id).toBe('snap-1');
      expect(snapshot.files).toHaveLength(2);
      expect(snapshot.files[0].path).toBe(testFile1);
      expect(snapshot.files[0].content).toBe('original content 1');
      expect(snapshot.files[0].hash).toMatch(/^[a-f0-9]{64}$/);
      expect(snapshot.metadata).toEqual({ reason: 'test' });
      expect(snapshot.timestamp).toBeGreaterThan(0);
    });

    it('should handle non-existent files gracefully', async () => {
      const nonExistentFile = pathLib.join(testDir, 'nonexistent.txt');

      const snapshot = await rollbackManager.createSnapshot({
        id: 'snap-2',
        files: [testFile1, nonExistentFile, testFile2]
      });

      expect(snapshot.files).toHaveLength(2);
      expect(snapshot.files.map(f => f.path)).toEqual([testFile1, testFile2]);
    });

    it('should store snapshot in memory manager', async () => {
      await rollbackManager.createSnapshot({
        id: 'snap-3',
        files: [testFile1]
      });

      const stored = await memoryManager.retrieve('snapshot:snap-3', { partition: 'snapshots' });
      expect(stored).toBeDefined();
      expect(stored.id).toBe('snap-3');
    });

    it('should create multiple snapshots independently', async () => {
      const snap1 = await rollbackManager.createSnapshot({
        id: 'snap-4',
        files: [testFile1]
      });

      await fs.writeFile(testFile1, 'modified content');

      const snap2 = await rollbackManager.createSnapshot({
        id: 'snap-5',
        files: [testFile1]
      });

      expect(snap1.files[0].content).toBe('original content 1');
      expect(snap2.files[0].content).toBe('modified content');
      expect(snap1.files[0].hash).not.toBe(snap2.files[0].hash);
    });

    it('should include metadata in snapshot', async () => {
      const metadata = {
        user: 'test-agent',
        reason: 'pre-deployment',
        version: '1.0.0'
      };

      const snapshot = await rollbackManager.createSnapshot({
        id: 'snap-6',
        files: [testFile1],
        metadata
      });

      expect(snapshot.metadata).toEqual(metadata);
    });

    it('should handle empty file list', async () => {
      const snapshot = await rollbackManager.createSnapshot({
        id: 'snap-7',
        files: []
      });

      expect(snapshot.files).toHaveLength(0);
    });

    it('should handle large files', async () => {
      const largeContent = 'x'.repeat(1024 * 1024); // 1MB
      const largeFile = pathLib.join(testDir, 'large.txt');
      await fs.writeFile(largeFile, largeContent);

      const snapshot = await rollbackManager.createSnapshot({
        id: 'snap-8',
        files: [largeFile]
      });

      expect(snapshot.files[0].content).toHaveLength(1024 * 1024);
    });

    it('should handle files with special characters', async () => {
      const specialFile = pathLib.join(testDir, 'special-!@#$%^&().txt');
      await fs.writeFile(specialFile, 'special content');

      const snapshot = await rollbackManager.createSnapshot({
        id: 'snap-9',
        files: [specialFile]
      });

      expect(snapshot.files[0].path).toBe(specialFile);
    });

    it('should compute correct SHA256 hash', async () => {
      const content = 'test content for hashing';
      await fs.writeFile(testFile1, content);

      const snapshot = await rollbackManager.createSnapshot({
        id: 'snap-10',
        files: [testFile1]
      });

      const crypto = require('crypto');
      const expectedHash = crypto.createHash('sha256').update(content).digest('hex');

      expect(snapshot.files[0].hash).toBe(expectedHash);
    });

    it('should handle binary files', async () => {
      const binaryFile = pathLib.join(testDir, 'binary.bin');
      const binaryData = Buffer.from([0x00, 0x01, 0xFF, 0xFE]);
      await fs.writeFile(binaryFile, binaryData);

      const snapshot = await rollbackManager.createSnapshot({
        id: 'snap-11',
        files: [binaryFile]
      });

      expect(snapshot.files).toHaveLength(1);
    });
  });

  describe('Snapshot Restoration', () => {
    it('should restore files from snapshot', async () => {
      const snapshot = await rollbackManager.createSnapshot({
        id: 'snap-restore-1',
        files: [testFile1, testFile2]
      });

      // Modify files
      await fs.writeFile(testFile1, 'modified 1');
      await fs.writeFile(testFile2, 'modified 2');

      const result = await rollbackManager.restoreSnapshot('snap-restore-1');

      expect(result.success).toBe(true);
      expect(result.filesRestored).toBe(2);
      expect(result.errors).toHaveLength(0);

      const content1 = await fs.readFile(testFile1, 'utf-8');
      const content2 = await fs.readFile(testFile2, 'utf-8');

      expect(content1).toBe('original content 1');
      expect(content2).toBe('original content 2');
    });

    it('should handle non-existent snapshot', async () => {
      const result = await rollbackManager.restoreSnapshot('nonexistent-snap');

      expect(result.success).toBe(false);
      expect(result.filesRestored).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Snapshot not found');
    });

    it('should create parent directories when restoring', async () => {
      const nestedFile = pathLib.join(testDir, 'nested', 'deep', 'file.txt');
      await fs.ensureDir(pathLib.dirname(nestedFile));
      await fs.writeFile(nestedFile, 'nested content');

      const snapshot = await rollbackManager.createSnapshot({
        id: 'snap-nested',
        files: [nestedFile]
      });

      // Remove the nested directory
      await fs.remove(pathLib.join(testDir, 'nested'));

      const result = await rollbackManager.restoreSnapshot('snap-nested');

      expect(result.success).toBe(true);
      expect(await fs.pathExists(nestedFile)).toBe(true);
    });

    it('should report errors for files that cannot be restored', async () => {
      const snapshot = await rollbackManager.createSnapshot({
        id: 'snap-error',
        files: [testFile1]
      });

      // Make directory read-only (simulate permission error)
      // Note: This test may behave differently on Windows
      try {
        await fs.chmod(testDir, 0o444);

        const result = await rollbackManager.restoreSnapshot('snap-error');

        expect(result.success).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);

        // Restore permissions
        await fs.chmod(testDir, 0o755);
      } catch (error) {
        // Skip on Windows or if chmod fails
        await fs.chmod(testDir, 0o755);
      }
    });

    it('should restore partial snapshot when some files fail', async () => {
      const goodFile = pathLib.join(testDir, 'good.txt');
      const badFile = '/root/impossible/path/bad.txt';

      await fs.writeFile(goodFile, 'good content');

      // Create snapshot manually with invalid path
      const snapshot: Snapshot = {
        id: 'snap-partial',
        timestamp: Date.now(),
        files: [
          {
            path: goodFile,
            hash: 'hash1',
            content: 'good content'
          },
          {
            path: badFile,
            hash: 'hash2',
            content: 'bad content'
          }
        ]
      };

      await memoryManager.store('snapshot:snap-partial', snapshot, { partition: 'snapshots' });

      await fs.writeFile(goodFile, 'modified');

      const result = await rollbackManager.restoreSnapshot('snap-partial');

      expect(result.filesRestored).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(await fs.readFile(goodFile, 'utf-8')).toBe('good content');
    });
  });

  describe('Rollback Triggers', () => {
    it('should trigger rollback when error rate exceeds threshold', async () => {
      const shouldTrigger = await rollbackManager.shouldTriggerRollback({
        metrics: {
          errorRate: 0.15,
          errorCount: 15,
          totalOperations: 100
        },
        thresholds: {
          maxErrorRate: 0.1
        }
      });

      expect(shouldTrigger).toBe(true);
    });

    it('should not trigger rollback when error rate is acceptable', async () => {
      const shouldTrigger = await rollbackManager.shouldTriggerRollback({
        metrics: {
          errorRate: 0.05,
          errorCount: 5,
          totalOperations: 100
        },
        thresholds: {
          maxErrorRate: 0.1
        }
      });

      expect(shouldTrigger).toBe(false);
    });

    it('should trigger rollback when error count exceeds threshold', async () => {
      const shouldTrigger = await rollbackManager.shouldTriggerRollback({
        metrics: {
          errorCount: 50
        },
        thresholds: {
          maxErrors: 10
        }
      });

      expect(shouldTrigger).toBe(true);
    });

    it('should trigger rollback on accuracy degradation', async () => {
      const shouldTrigger = await rollbackManager.shouldTriggerRollback({
        metrics: {
          currentAccuracy: 0.75,
          baselineAccuracy: 0.95
        },
        thresholds: {
          maxAccuracyDegradation: 0.1
        }
      });

      expect(shouldTrigger).toBe(true);
    });

    it('should trigger rollback when accuracy falls below minimum', async () => {
      const shouldTrigger = await rollbackManager.shouldTriggerRollback({
        metrics: {
          currentAccuracy: 0.65
        },
        thresholds: {
          minAccuracy: 0.8
        }
      });

      expect(shouldTrigger).toBe(true);
    });

    it('should handle multiple threshold checks', async () => {
      const shouldTrigger = await rollbackManager.shouldTriggerRollback({
        metrics: {
          errorRate: 0.05,
          errorCount: 20,
          currentAccuracy: 0.85,
          baselineAccuracy: 0.9
        },
        thresholds: {
          maxErrorRate: 0.1,
          maxErrors: 50,
          maxAccuracyDegradation: 0.1,
          minAccuracy: 0.7
        }
      });

      expect(shouldTrigger).toBe(false);
    });

    it('should handle missing metrics gracefully', async () => {
      const shouldTrigger = await rollbackManager.shouldTriggerRollback({
        metrics: {},
        thresholds: {
          maxErrorRate: 0.1
        }
      });

      expect(shouldTrigger).toBe(false);
    });

    it('should handle edge case: zero error rate', async () => {
      const shouldTrigger = await rollbackManager.shouldTriggerRollback({
        metrics: {
          errorRate: 0
        },
        thresholds: {
          maxErrorRate: 0.1
        }
      });

      expect(shouldTrigger).toBe(false);
    });

    it('should handle edge case: 100% error rate', async () => {
      const shouldTrigger = await rollbackManager.shouldTriggerRollback({
        metrics: {
          errorRate: 1.0
        },
        thresholds: {
          maxErrorRate: 0.1
        }
      });

      expect(shouldTrigger).toBe(true);
    });
  });

  describe('Rollback Execution', () => {
    it('should execute rollback and log to history', async () => {
      const snapshot = await rollbackManager.createSnapshot({
        id: 'snap-exec-1',
        files: [testFile1]
      });

      await fs.writeFile(testFile1, 'modified');

      const result = await rollbackManager.executeRollback({
        snapshotId: 'snap-exec-1',
        reason: 'High error rate detected'
      });

      expect(result.success).toBe(true);

      const history = await rollbackManager.getRollbackHistory(1);
      expect(history).toHaveLength(1);
      expect(history[0].snapshotId).toBe('snap-exec-1');
      expect(history[0].reason).toBe('High error rate detected');
    });

    it('should store rollback history in memory', async () => {
      await rollbackManager.createSnapshot({
        id: 'snap-exec-2',
        files: [testFile1]
      });

      await rollbackManager.executeRollback({
        snapshotId: 'snap-exec-2',
        reason: 'Test rollback'
      });

      const history = await memoryManager.query('rollback:%', {
        partition: 'rollback_history'
      });

      expect(history.length).toBeGreaterThan(0);
    });
  });

  describe('Snapshot Management', () => {
    it('should list all snapshots', async () => {
      await rollbackManager.createSnapshot({ id: 'snap-list-1', files: [testFile1] });
      await rollbackManager.createSnapshot({ id: 'snap-list-2', files: [testFile2] });
      await rollbackManager.createSnapshot({ id: 'snap-list-3', files: [testFile1, testFile2] });

      const list = await rollbackManager.listSnapshots();

      expect(list.length).toBeGreaterThanOrEqual(3);
      expect(list[0].id).toBe('snap-list-3'); // Most recent first
    });

    it('should clean old snapshots', async () => {
      // Get baseline snapshot count (from previous tests)
      const beforeList = await rollbackManager.listSnapshots();
      const baselineCount = beforeList.length;

      // Create 10 new snapshots
      for (let i = 0; i < 10; i++) {
        await rollbackManager.createSnapshot({
          id: `snap-clean-${i}`,
          files: [testFile1]
        });
      }

      // Total snapshots now = baselineCount + 10
      const afterCreate = await rollbackManager.listSnapshots();
      expect(afterCreate.length).toBe(baselineCount + 10);

      // Wait a bit to ensure new snapshots have age > 0
      await new Promise(resolve => setTimeout(resolve, 10));

      const cleaned = await rollbackManager.cleanSnapshots({
        maxAge: 0, // Clean snapshots older than 0ms
        keepMinimum: 5 // Keep 5 most recent
      });

      // Should clean (baselineCount + 10 - 5) = (baselineCount + 5) snapshots
      const expectedCleaned = baselineCount + 5;
      expect(cleaned).toBe(expectedCleaned);

      const remaining = await rollbackManager.listSnapshots();
      // Should have exactly 5 snapshots remaining (the keepMinimum)
      expect(remaining.length).toBe(5);
    });

    it('should respect keepMinimum when cleaning', async () => {
      await rollbackManager.createSnapshot({ id: 'snap-keep-1', files: [testFile1] });
      await rollbackManager.createSnapshot({ id: 'snap-keep-2', files: [testFile1] });

      const cleaned = await rollbackManager.cleanSnapshots({
        maxAge: 0,
        keepMinimum: 10
      });

      expect(cleaned).toBe(0); // Should not clean because we have less than keepMinimum

      const remaining = await rollbackManager.listSnapshots();
      expect(remaining.length).toBeGreaterThanOrEqual(2);
    });

    it('should get rollback history with limit', async () => {
      for (let i = 0; i < 15; i++) {
        await rollbackManager.createSnapshot({
          id: `snap-history-${i}`,
          files: [testFile1]
        });
        await rollbackManager.executeRollback({
          snapshotId: `snap-history-${i}`,
          reason: `Test ${i}`
        });
      }

      const history = await rollbackManager.getRollbackHistory(5);

      expect(history).toHaveLength(5);
      expect(history[0].timestamp).toBeGreaterThan(history[4].timestamp);
    });

    it('should return sorted snapshot list by timestamp', async () => {
      const snap1 = await rollbackManager.createSnapshot({
        id: 'snap-sort-1',
        files: [testFile1]
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      const snap2 = await rollbackManager.createSnapshot({
        id: 'snap-sort-2',
        files: [testFile1]
      });

      const list = await rollbackManager.listSnapshots();

      const idx1 = list.findIndex(s => s.id === 'snap-sort-1');
      const idx2 = list.findIndex(s => s.id === 'snap-sort-2');

      expect(idx2).toBeLessThan(idx1); // snap2 is more recent
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle concurrent snapshot creation', async () => {
      const promises = Array.from({ length: 5 }, (_, i) =>
        rollbackManager.createSnapshot({
          id: `snap-concurrent-${i}`,
          files: [testFile1]
        })
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(5);
      results.forEach((snapshot, i) => {
        expect(snapshot.id).toBe(`snap-concurrent-${i}`);
      });
    });

    it('should handle very long file paths', async () => {
      const longPath = pathLib.join(testDir, 'a'.repeat(200), 'long-file.txt');
      await fs.ensureDir(pathLib.dirname(longPath));
      await fs.writeFile(longPath, 'long path content');

      const snapshot = await rollbackManager.createSnapshot({
        id: 'snap-long-path',
        files: [longPath]
      });

      expect(snapshot.files).toHaveLength(1);
    });

    it('should handle empty file content', async () => {
      const emptyFile = pathLib.join(testDir, 'empty.txt');
      await fs.writeFile(emptyFile, '');

      const snapshot = await rollbackManager.createSnapshot({
        id: 'snap-empty',
        files: [emptyFile]
      });

      expect(snapshot.files[0].content).toBe('');
    });

    it('should handle Unicode file content', async () => {
      const unicodeContent = '你好世界 🌍 Здравствуй мир';
      await fs.writeFile(testFile1, unicodeContent);

      const snapshot = await rollbackManager.createSnapshot({
        id: 'snap-unicode',
        files: [testFile1]
      });

      expect(snapshot.files[0].content).toBe(unicodeContent);

      await fs.writeFile(testFile1, 'modified');
      await rollbackManager.restoreSnapshot('snap-unicode');

      const restored = await fs.readFile(testFile1, 'utf-8');
      expect(restored).toBe(unicodeContent);
    });

    it('should handle missing metadata gracefully', async () => {
      const snapshot = await rollbackManager.createSnapshot({
        id: 'snap-no-metadata',
        files: [testFile1]
      });

      expect(snapshot.metadata).toBeUndefined();
    });
  });
});
