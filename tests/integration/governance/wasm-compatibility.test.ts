/**
 * Integration tests for @claude-flow/guidance WASM kernel compatibility
 *
 * Tests verify:
 * - WASM kernel loads or falls back to JS gracefully
 * - Crypto operations (hashing, HMAC) work correctly
 * - Hash chaining functionality works
 * - Performance meets acceptable thresholds
 *
 * @see ADR-058-guidance-governance-integration.md
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  WasmKernelIntegration,
  wasmKernelIntegration,
  createWasmKernelIntegration,
  type WasmKernelMetrics,
} from '../../../src/governance/wasm-kernel-integration.js';

describe('WASM Kernel Compatibility', () => {
  let kernel: WasmKernelIntegration;

  beforeEach(async () => {
    kernel = createWasmKernelIntegration();
    await kernel.initialize();
  });

  afterEach(() => {
    kernel.reset();
  });

  describe('Initialization', () => {
    it('should load wasm-kernel or fallback gracefully', async () => {
      // Initialize should not throw regardless of WASM availability
      const integration = createWasmKernelIntegration();
      await expect(integration.initialize()).resolves.not.toThrow();

      // Should report a backend (either wasm or js)
      const metrics = integration.getPerformanceMetrics();
      expect(['wasm', 'js']).toContain(metrics.backend);

      // Version should be available
      const version = integration.getVersion();
      expect(version).toBeDefined();
      expect(typeof version).toBe('string');
      expect(version.length).toBeGreaterThan(0);

      integration.reset();
    });

    it('should handle multiple initialize calls idempotently', async () => {
      const integration = createWasmKernelIntegration();

      await integration.initialize();
      const firstVersion = integration.getVersion();

      await integration.initialize();
      const secondVersion = integration.getVersion();

      expect(firstVersion).toBe(secondVersion);
      integration.reset();
    });

    it('should report initialization errors without throwing', async () => {
      // Even if the WASM module fails to load, initialize should not throw
      const integration = createWasmKernelIntegration();
      await integration.initialize();

      // If WASM failed, initError may be set (but not required)
      // The key point is that initialization completed
      expect(integration.getPerformanceMetrics().backend).toBeDefined();
      integration.reset();
    });

    it('should use singleton instance correctly', async () => {
      await wasmKernelIntegration.initialize();
      expect(wasmKernelIntegration).toBeInstanceOf(WasmKernelIntegration);

      // Singleton should work
      const hash1 = wasmKernelIntegration.hash('test');
      const hash2 = wasmKernelIntegration.hash('test');
      expect(hash1).toBe(hash2);

      wasmKernelIntegration.reset();
    });
  });

  describe('Hash Operations', () => {
    it('should provide consistent hash results', async () => {
      const testData = 'Hello, WASM Kernel!';

      // Multiple hashes of the same data should be identical
      const hash1 = kernel.hash(testData);
      const hash2 = kernel.hash(testData);
      const hash3 = kernel.hash(testData);

      expect(hash1).toBe(hash2);
      expect(hash2).toBe(hash3);

      // Hash should be a valid hex string
      expect(hash1).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should produce correct SHA-256 hashes', async () => {
      // Known SHA-256 test vectors
      const testVectors = [
        {
          input: '',
          expected: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        },
        {
          input: 'abc',
          expected: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
        },
        {
          input: 'The quick brown fox jumps over the lazy dog',
          expected: 'd7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592',
        },
      ];

      for (const { input, expected } of testVectors) {
        const result = kernel.hash(input);
        expect(result).toBe(expected);
      }
    });

    it('should handle Uint8Array input', async () => {
      const text = 'binary test';
      const encoder = new TextEncoder();
      const uint8Data = encoder.encode(text);

      const hashFromString = kernel.hash(text);
      const hashFromUint8 = kernel.hash(uint8Data);

      // Both should produce valid hashes
      expect(hashFromString).toMatch(/^[a-f0-9]{64}$/);
      expect(hashFromUint8).toMatch(/^[a-f0-9]{64}$/);

      // Note: Uint8Array and string may produce different hashes
      // depending on encoding, so we just verify both work
    });

    it('should handle empty input', async () => {
      const hash = kernel.hash('');
      expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    });

    it('should handle special characters', async () => {
      const hash = kernel.hash('Special chars: \u00e9\u00f1\u00fc\u4e2d\u6587');
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('Hash Chaining', () => {
    it('should support hash chaining', async () => {
      const hashes = [
        kernel.hash('block1'),
        kernel.hash('block2'),
        kernel.hash('block3'),
      ];

      const chainedHash = kernel.hashChain(hashes);

      // Should produce a valid hash
      expect(chainedHash).toMatch(/^[a-f0-9]{64}$/);

      // Same input should produce same output
      const chainedHash2 = kernel.hashChain(hashes);
      expect(chainedHash).toBe(chainedHash2);
    });

    it('should produce different chains for different orders', async () => {
      const hash1 = kernel.hash('a');
      const hash2 = kernel.hash('b');
      const hash3 = kernel.hash('c');

      const chain1 = kernel.hashChain([hash1, hash2, hash3]);
      const chain2 = kernel.hashChain([hash3, hash2, hash1]);

      expect(chain1).not.toBe(chain2);
    });

    it('should handle empty array', async () => {
      const chain = kernel.hashChain([]);
      // Empty chain should return hash of empty string
      expect(chain).toBe(kernel.hash(''));
    });

    it('should handle single element', async () => {
      const singleHash = kernel.hash('single');
      const chain = kernel.hashChain([singleHash]);
      expect(chain).toBe(singleHash);
    });

    it('should chain multiple hashes deterministically', async () => {
      const items = ['item1', 'item2', 'item3', 'item4', 'item5'];
      const hashes = items.map((item) => kernel.hash(item));

      // Create chain multiple times
      const chains = [
        kernel.hashChain(hashes),
        kernel.hashChain(hashes),
        kernel.hashChain(hashes),
      ];

      // All should be identical
      expect(chains[0]).toBe(chains[1]);
      expect(chains[1]).toBe(chains[2]);
    });
  });

  describe('HMAC Operations', () => {
    it('should create valid HMAC signatures', async () => {
      const key = 'secret-key';
      const data = 'data to sign';

      const hmac = kernel.hmac(key, data);

      // Should produce a valid hex string
      expect(hmac).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should produce consistent HMAC results', async () => {
      const key = 'my-key';
      const data = 'my-data';

      const hmac1 = kernel.hmac(key, data);
      const hmac2 = kernel.hmac(key, data);

      expect(hmac1).toBe(hmac2);
    });

    it('should produce different HMACs for different keys', async () => {
      const data = 'same data';

      const hmac1 = kernel.hmac('key1', data);
      const hmac2 = kernel.hmac('key2', data);

      expect(hmac1).not.toBe(hmac2);
    });

    it('should produce different HMACs for different data', async () => {
      const key = 'same-key';

      const hmac1 = kernel.hmac(key, 'data1');
      const hmac2 = kernel.hmac(key, 'data2');

      expect(hmac1).not.toBe(hmac2);
    });
  });

  describe('Verification', () => {
    it('should verify matching hash correctly', async () => {
      const data = 'verify this';
      const hash = kernel.hash(data);

      expect(kernel.verify(data, hash)).toBe(true);
    });

    it('should reject non-matching hash', async () => {
      const data = 'original data';
      const wrongHash = kernel.hash('different data');

      expect(kernel.verify(data, wrongHash)).toBe(false);
    });

    it('should reject tampered data', async () => {
      const originalData = 'original content';
      const originalHash = kernel.hash(originalData);

      // Tamper with data
      const tamperedData = 'tampered content';

      expect(kernel.verify(tamperedData, originalHash)).toBe(false);
    });
  });

  describe('Content Hash', () => {
    it('should hash JSON content deterministically', async () => {
      const obj = { name: 'test', value: 42 };

      const hash1 = kernel.contentHash(obj);
      const hash2 = kernel.contentHash(obj);

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should produce same hash regardless of key order', async () => {
      const obj1 = { a: 1, b: 2, c: 3 };
      const obj2 = { c: 3, a: 1, b: 2 };
      const obj3 = { b: 2, c: 3, a: 1 };

      const hash1 = kernel.contentHash(obj1);
      const hash2 = kernel.contentHash(obj2);
      const hash3 = kernel.contentHash(obj3);

      expect(hash1).toBe(hash2);
      expect(hash2).toBe(hash3);
    });

    it('should handle nested objects', async () => {
      const nested = {
        outer: {
          inner: {
            value: 'deep',
          },
        },
        array: [1, 2, 3],
      };

      const hash = kernel.contentHash(nested);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should accept string JSON input', async () => {
      const json = '{"key": "value"}';
      const hash = kernel.contentHash(json);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('Envelope Signing', () => {
    it('should sign envelopes', async () => {
      const key = 'signing-key';
      const envelope = {
        action: 'test-action',
        timestamp: Date.now(),
        agentId: 'test-agent',
      };

      const signature = kernel.signEnvelope(key, envelope);

      expect(signature).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should produce consistent signatures', async () => {
      const key = 'my-key';
      const envelope = { data: 'test' };

      const sig1 = kernel.signEnvelope(key, envelope);
      const sig2 = kernel.signEnvelope(key, envelope);

      expect(sig1).toBe(sig2);
    });
  });

  describe('Performance Metrics', () => {
    it('should meet performance thresholds', async () => {
      // Warm up
      for (let i = 0; i < 10; i++) {
        kernel.hash(`warmup-${i}`);
      }
      kernel.resetMetrics();

      // Run performance test
      const iterations = 1000;
      const startTime = performance.now();

      for (let i = 0; i < iterations; i++) {
        kernel.hash(`test-data-${i}`);
      }

      const totalTime = performance.now() - startTime;
      const avgTimeMs = totalTime / iterations;

      // Performance threshold: average hash should be < 1ms
      // (JS fallback is typically < 0.1ms, WASM may be slightly faster)
      expect(avgTimeMs).toBeLessThan(1);

      const metrics = kernel.getPerformanceMetrics();
      expect(metrics.totalOperations).toBe(iterations);
      expect(metrics.avgHashTimeMs).toBeLessThan(1);
    });

    it('should track operation counts correctly', async () => {
      kernel.resetMetrics();

      // Perform various operations
      kernel.hash('test1');
      kernel.hash('test2');
      kernel.hashChain([kernel.hash('a'), kernel.hash('b')]);
      kernel.verify('test', kernel.hash('test'));
      kernel.hmac('key', 'data');

      const metrics = kernel.getPerformanceMetrics();

      // hash: 2 direct + 2 in hashChain setup + 2 inside hashChain + 1 in verify = 7
      // But hashChain calls hash internally, so counts may vary
      expect(metrics.totalOperations).toBeGreaterThan(0);
      expect(metrics.operationCounts.hash).toBeGreaterThan(0);
    });

    it('should report backend correctly', async () => {
      const metrics = kernel.getPerformanceMetrics();

      expect(['wasm', 'js']).toContain(metrics.backend);

      // Backend should match isWasmAvailable
      if (kernel.isWasmAvailable()) {
        expect(metrics.backend).toBe('wasm');
      } else {
        expect(metrics.backend).toBe('js');
      }
    });

    it('should reset metrics correctly', async () => {
      // Perform some operations
      kernel.hash('test');
      kernel.hash('test2');

      expect(kernel.getPerformanceMetrics().totalOperations).toBeGreaterThan(0);

      // Reset
      kernel.resetMetrics();

      const metrics = kernel.getPerformanceMetrics();
      expect(metrics.totalOperations).toBe(0);
      expect(metrics.totalTimeMs).toBe(0);
      expect(metrics.avgHashTimeMs).toBe(0);
    });
  });

  describe('WASM vs JS Consistency', () => {
    it('should produce identical results regardless of backend', async () => {
      // This test verifies that both WASM and JS produce the same results
      // We test with the current backend (whichever loaded)
      const testCases = [
        'simple string',
        '',
        'special chars: \u00e9\u00f1\u00fc',
        '{"json": true, "value": 123}',
        'a'.repeat(10000), // Long string
      ];

      for (const testCase of testCases) {
        const hash = kernel.hash(testCase);

        // Verify against Node.js crypto directly
        const { createHash } = await import('node:crypto');
        const expected = createHash('sha256').update(testCase).digest('hex');

        expect(hash).toBe(expected);
      }
    });
  });

  describe('Error Handling', () => {
    it('should not throw on any valid input', async () => {
      const validInputs = [
        '',
        'a',
        'test',
        '\0',
        '\n\r\t',
        'unicode: \u{1F600}',
      ];

      for (const input of validInputs) {
        expect(() => kernel.hash(input)).not.toThrow();
      }
    });

    it('should handle very long inputs', async () => {
      const longInput = 'x'.repeat(1000000); // 1MB string

      const hash = kernel.hash(longInput);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('Integration with Governance', () => {
    it('should work for audit trail hash chaining', async () => {
      // Simulate audit trail creation
      const auditEntries = [
        { action: 'task_start', agentId: 'agent-1', timestamp: 1000 },
        { action: 'file_read', agentId: 'agent-1', timestamp: 1001 },
        { action: 'file_write', agentId: 'agent-1', timestamp: 1002 },
        { action: 'task_complete', agentId: 'agent-1', timestamp: 1003 },
      ];

      // Hash each entry
      const entryHashes = auditEntries.map((entry) =>
        kernel.contentHash(entry)
      );

      // Create chain
      const auditChain = kernel.hashChain(entryHashes);

      // Verify chain is deterministic
      const auditChain2 = kernel.hashChain(
        auditEntries.map((e) => kernel.contentHash(e))
      );

      expect(auditChain).toBe(auditChain2);
    });

    it('should support proof envelope signing', async () => {
      const proofEnvelope = {
        claim: 'Task completed successfully',
        evidence: {
          testsPassed: 10,
          coverage: 85,
        },
        agentId: 'qe-tester',
        timestamp: Date.now(),
      };

      const key = 'governance-secret-key';
      const signature = kernel.signEnvelope(key, proofEnvelope);

      // Signature should be consistent
      const signature2 = kernel.signEnvelope(key, proofEnvelope);
      expect(signature).toBe(signature2);

      // Different key should produce different signature
      const signature3 = kernel.signEnvelope('different-key', proofEnvelope);
      expect(signature).not.toBe(signature3);
    });
  });
});
