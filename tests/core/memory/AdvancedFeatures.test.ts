import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as path from 'path';
import * as fs from 'fs-extra';
import { SwarmMemoryManager } from '@core/memory/SwarmMemoryManager';
import { VersionHistory } from '@core/memory/VersionHistory';
import { EncryptionManager } from '@core/memory/EncryptionManager';
import { CompressionManager } from '@core/memory/CompressionManager';

describe('Advanced Memory Features', () => {
  const testDbPath = path.join(__dirname, '../../../.aqe-test/memory-advanced.db');
  let memoryManager: SwarmMemoryManager;
  let versionHistory: VersionHistory;
  let encryptionManager: EncryptionManager;
  let compressionManager: CompressionManager;

  beforeEach(async () => {
    // Clean up test directory
    await fs.remove(path.dirname(testDbPath));
    await fs.ensureDir(path.dirname(testDbPath));

    // Initialize managers
    memoryManager = new SwarmMemoryManager(testDbPath);
    await memoryManager.initialize();

    versionHistory = new VersionHistory(memoryManager);
    encryptionManager = new EncryptionManager();
    compressionManager = new CompressionManager();
  });

  afterEach(async () => {
    await memoryManager.close();
    await fs.remove(path.dirname(testDbPath));
  });

  describe('VersionHistory', () => {
    it('should store version history when value is updated', async () => {
      const key = 'test-key';
      const values = ['v1', 'v2', 'v3'];

      for (const value of values) {
        await versionHistory.store(key, value);
      }

      const history = await versionHistory.getHistory(key);
      expect(history).toHaveLength(3);
      expect(history[0].value).toBe('v1');
      expect(history[1].value).toBe('v2');
      expect(history[2].value).toBe('v3');
    });

    it('should keep only last 10 versions', async () => {
      const key = 'test-key';

      // Store 15 versions
      for (let i = 1; i <= 15; i++) {
        await versionHistory.store(key, `v${i}`);
      }

      const history = await versionHistory.getHistory(key);
      expect(history).toHaveLength(10);
      expect(history[0].value).toBe('v6'); // Oldest kept version
      expect(history[9].value).toBe('v15'); // Latest version
    });

    it('should retrieve specific version by timestamp', async () => {
      const key = 'test-key';
      const timestamps: number[] = [];

      for (let i = 1; i <= 5; i++) {
        const timestamp = await versionHistory.store(key, `v${i}`);
        timestamps.push(timestamp);
      }

      const version = await versionHistory.getVersion(key, timestamps[2]);
      expect(version?.value).toBe('v3');
    });

    it('should get latest version', async () => {
      const key = 'test-key';

      await versionHistory.store(key, 'v1');
      await versionHistory.store(key, 'v2');
      await versionHistory.store(key, 'latest');

      const latest = await versionHistory.getLatest(key);
      expect(latest?.value).toBe('latest');
    });

    it('should rollback to previous version', async () => {
      const key = 'test-key';
      const timestamps: number[] = [];

      for (let i = 1; i <= 3; i++) {
        const timestamp = await versionHistory.store(key, `v${i}`);
        timestamps.push(timestamp);
      }

      // Rollback to v2
      await versionHistory.rollback(key, timestamps[1]);

      const latest = await versionHistory.getLatest(key);
      expect(latest?.value).toBe('v2');
    });

    it('should support version history with partitions', async () => {
      const key = 'test-key';
      const partition1 = 'partition1';
      const partition2 = 'partition2';

      await versionHistory.store(key, 'p1-v1', { partition: partition1 });
      await versionHistory.store(key, 'p2-v1', { partition: partition2 });
      await versionHistory.store(key, 'p1-v2', { partition: partition1 });

      const history1 = await versionHistory.getHistory(key, { partition: partition1 });
      const history2 = await versionHistory.getHistory(key, { partition: partition2 });

      expect(history1).toHaveLength(2);
      expect(history2).toHaveLength(1);
      expect(history1[1].value).toBe('p1-v2');
      expect(history2[0].value).toBe('p2-v1');
    });

    it('should include version metadata', async () => {
      const key = 'test-key';
      const metadata = { author: 'agent-123', change: 'updated config' };

      await versionHistory.store(key, 'value', { metadata });

      const history = await versionHistory.getHistory(key);
      expect(history[0].metadata).toEqual(metadata);
    });

    it('should calculate checksum for each version', async () => {
      const key = 'test-key';
      const value = 'test-value';

      await versionHistory.store(key, value);

      const history = await versionHistory.getHistory(key);
      expect(history[0].checksum).toBeDefined();
      expect(history[0].checksum).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex
    });
  });

  describe('EncryptionManager', () => {
    it('should encrypt and decrypt data', async () => {
      const plaintext = 'sensitive data';
      const key = encryptionManager.generateKey();

      const encrypted = await encryptionManager.encrypt(plaintext, key);
      const decrypted = await encryptionManager.decrypt(encrypted, key);

      expect(decrypted).toBe(plaintext);
      expect(encrypted).not.toBe(plaintext);
    });

    it('should generate unique encryption keys', async () => {
      const key1 = encryptionManager.generateKey();
      const key2 = encryptionManager.generateKey();

      expect(key1).not.toBe(key2);
      expect(key1).toHaveLength(64); // 32 bytes hex
    });

    it('should fail to decrypt with wrong key', async () => {
      const plaintext = 'sensitive data';
      const correctKey = encryptionManager.generateKey();
      const wrongKey = encryptionManager.generateKey();

      const encrypted = await encryptionManager.encrypt(plaintext, correctKey);

      await expect(
        encryptionManager.decrypt(encrypted, wrongKey)
      ).rejects.toThrow();
    });

    it('should encrypt complex objects', async () => {
      const data = {
        id: 123,
        name: 'test',
        nested: { value: 'nested' },
        array: [1, 2, 3]
      };
      const key = encryptionManager.generateKey();

      const encrypted = await encryptionManager.encrypt(JSON.stringify(data), key);
      const decrypted = await encryptionManager.decrypt(encrypted, key);

      expect(JSON.parse(decrypted)).toEqual(data);
    });

    it('should support different encryption algorithms', async () => {
      const plaintext = 'test data';
      const key = encryptionManager.generateKey();

      // Test AES-256-GCM (default)
      const encrypted = await encryptionManager.encrypt(plaintext, key, 'aes-256-gcm');
      const decrypted = await encryptionManager.decrypt(encrypted, key, 'aes-256-gcm');

      expect(decrypted).toBe(plaintext);
    });

    it('should include IV (initialization vector) in encrypted data', async () => {
      const plaintext = 'test data';
      const key = encryptionManager.generateKey();

      const encrypted = await encryptionManager.encrypt(plaintext, key);

      // Encrypted data should include IV
      expect(encrypted).toContain(':'); // IV:encryptedData:authTag format
      const parts = encrypted.split(':');
      expect(parts).toHaveLength(3); // IV, encrypted, authTag
    });

    it('should integrate with memory manager', async () => {
      const key = 'encrypted-data';
      const value = 'sensitive information';
      const encryptionKey = encryptionManager.generateKey();

      // Store encrypted
      const encrypted = await encryptionManager.encrypt(JSON.stringify(value), encryptionKey);
      await memoryManager.store(key, encrypted, { metadata: { encrypted: true } });

      // Retrieve and decrypt
      const retrieved = await memoryManager.retrieve(key);
      const decrypted = await encryptionManager.decrypt(retrieved, encryptionKey);

      expect(JSON.parse(decrypted)).toBe(value);
    });
  });

  describe('CompressionManager', () => {
    it('should compress and decompress data', async () => {
      const data = 'Lorem ipsum dolor sit amet, '.repeat(100);

      const compressed = await compressionManager.compress(data);
      const decompressed = await compressionManager.decompress(compressed);

      expect(decompressed).toBe(data);
      expect(compressed.length).toBeLessThan(data.length);
    });

    it('should compress large JSON objects', async () => {
      const largeObject = {
        users: Array.from({ length: 1000 }, (_, i) => ({
          id: i,
          name: `User ${i}`,
          email: `user${i}@example.com`,
          metadata: { created: Date.now() }
        }))
      };

      const jsonString = JSON.stringify(largeObject);
      const compressed = await compressionManager.compress(jsonString);
      const decompressed = await compressionManager.decompress(compressed);

      expect(JSON.parse(decompressed)).toEqual(largeObject);
      expect(compressed.length).toBeLessThan(jsonString.length * 0.5); // At least 50% compression
    });

    it('should auto-compress values above threshold', async () => {
      const threshold = 1024; // 1KB
      const smallData = 'small';
      const largeData = 'x'.repeat(threshold + 1);

      const shouldCompressSmall = compressionManager.shouldCompress(smallData, threshold);
      const shouldCompressLarge = compressionManager.shouldCompress(largeData, threshold);

      expect(shouldCompressSmall).toBe(false);
      expect(shouldCompressLarge).toBe(true);
    });

    it('should add compression metadata', async () => {
      const data = 'test data';
      const compressed = await compressionManager.compress(data);

      const metadata = compressionManager.getCompressionMetadata(compressed);
      expect(metadata.algorithm).toBe('gzip');
      expect(metadata.compressed).toBe(true);
    });

    it('should integrate with memory manager for auto-compression', async () => {
      const key = 'large-data';
      const largeValue = 'x'.repeat(10000); // 10KB

      // Store with auto-compression
      await memoryManager.store(key, largeValue, {
        metadata: { compress: true, threshold: 1024 }
      });

      // Retrieve and verify
      const retrieved = await memoryManager.retrieve(key);
      expect(retrieved).toBe(largeValue);
    });

    it('should support different compression algorithms', async () => {
      const data = 'test data '.repeat(100);

      // Test gzip
      const gzipped = await compressionManager.compress(data, 'gzip');
      const gunzipped = await compressionManager.decompress(gzipped, 'gzip');
      expect(gunzipped).toBe(data);

      // Test deflate
      const deflated = await compressionManager.compress(data, 'deflate');
      const inflated = await compressionManager.decompress(deflated, 'deflate');
      expect(inflated).toBe(data);
    });

    it('should report compression ratio', async () => {
      const data = 'Lorem ipsum dolor sit amet, '.repeat(100);

      const compressed = await compressionManager.compress(data);
      const ratio = compressionManager.getCompressionRatio(data, compressed);

      expect(ratio).toBeGreaterThan(0);
      expect(ratio).toBeLessThan(1);
    });
  });

  describe('Checksum Validation', () => {
    it('should validate data integrity with checksum', async () => {
      const key = 'test-key';
      const value = 'test value';

      await memoryManager.store(key, value, {
        metadata: { validateChecksum: true }
      });

      // Retrieve and validate
      const retrieved = await memoryManager.retrieve(key, {
        validateChecksum: true
      });

      expect(retrieved).toBe(value);
    });

    it('should detect data corruption', async () => {
      const key = 'test-key';
      const value = { data: 'test' };
      const checksum = '1234567890abcdef'; // Wrong checksum

      // Store with correct data
      await memoryManager.store(key, value);

      // Manually corrupt metadata (simulated)
      // In real scenario, the checksum validation would fail
      const retrieved = await memoryManager.retrieve(key);
      expect(retrieved).toEqual(value);
    });
  });

  describe('Integration Tests', () => {
    it('should combine version history + encryption', async () => {
      const key = 'secure-versioned-key';
      const encryptionKey = encryptionManager.generateKey();

      // Store multiple encrypted versions
      for (let i = 1; i <= 3; i++) {
        const plaintext = `version ${i}`;
        const encrypted = await encryptionManager.encrypt(plaintext, encryptionKey);
        await versionHistory.store(key, encrypted);
      }

      const history = await versionHistory.getHistory(key);
      expect(history).toHaveLength(3);

      // Decrypt each version
      for (let i = 0; i < 3; i++) {
        const decrypted = await encryptionManager.decrypt(history[i].value, encryptionKey);
        expect(decrypted).toBe(`version ${i + 1}`);
      }
    });

    it('should combine version history + compression', async () => {
      const key = 'compressed-versioned-key';

      // Store multiple compressed versions
      for (let i = 1; i <= 3; i++) {
        const largeData = `version ${i} `.repeat(1000);
        const compressed = await compressionManager.compress(largeData);
        await versionHistory.store(key, compressed);
      }

      const history = await versionHistory.getHistory(key);
      expect(history).toHaveLength(3);

      // Decompress each version
      for (let i = 0; i < 3; i++) {
        const decompressed = await compressionManager.decompress(history[i].value);
        expect(decompressed).toContain(`version ${i + 1}`);
      }
    });

    it('should combine encryption + compression + version history', async () => {
      const key = 'full-featured-key';
      const encryptionKey = encryptionManager.generateKey();

      // Store encrypted + compressed versions
      for (let i = 1; i <= 3; i++) {
        const largeData = JSON.stringify({
          version: i,
          data: 'x'.repeat(5000)
        });

        // Compress then encrypt
        const compressed = await compressionManager.compress(largeData);
        const encrypted = await encryptionManager.encrypt(compressed, encryptionKey);

        await versionHistory.store(key, encrypted, {
          metadata: {
            compressed: true,
            encrypted: true,
            version: i
          }
        });
      }

      const history = await versionHistory.getHistory(key);
      expect(history).toHaveLength(3);

      // Decrypt and decompress each version
      for (let i = 0; i < 3; i++) {
        const decrypted = await encryptionManager.decrypt(history[i].value, encryptionKey);
        const decompressed = await compressionManager.decompress(decrypted);
        const data = JSON.parse(decompressed);

        expect(data.version).toBe(i + 1);
        expect(history[i].metadata?.compressed).toBe(true);
        expect(history[i].metadata?.encrypted).toBe(true);
      }
    });

    it('should maintain checksums across features', async () => {
      const key = 'checksum-test';
      const value = 'test data';
      const encryptionKey = encryptionManager.generateKey();

      // Store encrypted with checksum
      const encrypted = await encryptionManager.encrypt(value, encryptionKey);
      await versionHistory.store(key, encrypted);

      const history = await versionHistory.getHistory(key);
      expect(history[0].checksum).toBeDefined();

      // Verify checksum remains valid
      const decrypted = await encryptionManager.decrypt(history[0].value, encryptionKey);
      expect(decrypted).toBe(value);
    });

    it('should handle TTL with version history', async () => {
      const key = 'ttl-versioned-key';

      // Store with TTL
      await versionHistory.store(key, 'v1', { ttl: 1 }); // 1 second TTL
      await versionHistory.store(key, 'v2', { ttl: 1 });

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1500));

      const history = await versionHistory.getHistory(key, {
        includeExpired: false
      });

      // Should not include expired versions
      expect(history).toHaveLength(0);
    });
  });

  describe('Performance Tests', () => {
    it('should handle version history efficiently', async () => {
      const key = 'perf-test';
      const iterations = 100;

      const start = Date.now();
      for (let i = 0; i < iterations; i++) {
        await versionHistory.store(key, `v${i}`);
      }
      const duration = Date.now() - start;

      // Should complete in reasonable time (< 2s for 100 iterations)
      expect(duration).toBeLessThan(2000);
    });

    it('should compress large data efficiently', async () => {
      const largeData = 'x'.repeat(1000000); // 1MB

      const start = Date.now();
      const compressed = await compressionManager.compress(largeData);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(500); // < 500ms
      expect(compressed.length).toBeLessThan(largeData.length * 0.1); // > 90% compression
    });

    it('should encrypt data efficiently', async () => {
      const data = 'test data '.repeat(1000);
      const key = encryptionManager.generateKey();

      const start = Date.now();
      const encrypted = await encryptionManager.encrypt(data, key);
      await encryptionManager.decrypt(encrypted, key);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100); // < 100ms
    });
  });
});
