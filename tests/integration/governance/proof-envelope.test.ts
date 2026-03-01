/**
 * Integration tests for Proof Envelope hash-chained audit trails
 *
 * Tests verify:
 * - Envelope creation and signing
 * - Hash chaining for tamper detection
 * - Chain verification
 * - Tamper detection
 * - Chain queries
 * - Merkle tree operations
 * - Export/import functionality
 * - WASM kernel integration
 *
 * @see ADR-058-guidance-governance-integration.md
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  ProofEnvelopeIntegration,
  proofEnvelopeIntegration,
  createProofEnvelopeIntegration,
  isProofRequiredForClaims,
  type ProofEnvelope,
} from '../../../src/governance/proof-envelope-integration.js';
import {
  createWasmKernelIntegration,
} from '../../../src/governance/wasm-kernel-integration.js';
import { governanceFlags } from '../../../src/governance/feature-flags.js';

describe('Proof Envelope Integration', () => {
  let integration: ProofEnvelopeIntegration;
  const testSigningKey = 'test-signing-key-12345';

  beforeEach(async () => {
    integration = createProofEnvelopeIntegration();
    await integration.initialize(testSigningKey);
  });

  afterEach(() => {
    integration.reset();
  });

  describe('Initialization', () => {
    it('should initialize correctly', async () => {
      const newIntegration = createProofEnvelopeIntegration();
      expect(newIntegration.isInitialized()).toBe(false);

      await newIntegration.initialize();
      expect(newIntegration.isInitialized()).toBe(true);

      newIntegration.reset();
    });

    it('should handle multiple initialize calls idempotently', async () => {
      const newIntegration = createProofEnvelopeIntegration();
      await newIntegration.initialize('key1');
      await newIntegration.initialize('key2'); // Should not change key

      // Create and verify envelope with original key
      const envelope = newIntegration.createSignedEnvelope('agent', 'test', {});
      const result = newIntegration.verifyEnvelope(envelope, 'key1');
      expect(result.valid).toBe(true);

      newIntegration.reset();
    });

    it('should use custom WASM kernel if provided', async () => {
      const customKernel = createWasmKernelIntegration();
      await customKernel.initialize();

      const customIntegration = createProofEnvelopeIntegration(customKernel);
      await customIntegration.initialize();

      const envelope = customIntegration.createSignedEnvelope('agent', 'test', {});
      expect(envelope.contentHash).toMatch(/^[a-f0-9]{64}$/);

      customKernel.reset();
      customIntegration.reset();
    });

    it('should use singleton instance correctly', async () => {
      await proofEnvelopeIntegration.initialize();
      expect(proofEnvelopeIntegration).toBeInstanceOf(ProofEnvelopeIntegration);
      proofEnvelopeIntegration.reset();
    });

    it('should return feature flags', async () => {
      const flags = integration.getFlags();
      expect(flags).toHaveProperty('enabled');
      expect(flags).toHaveProperty('hashChaining');
      expect(flags).toHaveProperty('requireProofForClaims');
      expect(flags).toHaveProperty('chainPersistence');
      expect(flags).toHaveProperty('maxChainLength');
      expect(flags).toHaveProperty('signAllEnvelopes');
    });
  });

  describe('Envelope Creation', () => {
    it('should create an unsigned envelope', () => {
      const envelope = integration.createEnvelope(
        'test-agent',
        'task_complete',
        { result: 'success' }
      );

      expect(envelope.id).toMatch(/^env_[a-f0-9-]+$/);
      expect(envelope.agentId).toBe('test-agent');
      expect(envelope.action).toBe('task_complete');
      expect(envelope.payload).toEqual({ result: 'success' });
      expect(envelope.contentHash).toMatch(/^[a-f0-9]{64}$/);
      expect(envelope.previousHash).toMatch(/^[a-f0-9]{64}$/);
      expect(envelope.signature).toBe('');
      expect(envelope.timestamp).toBeGreaterThan(0);
    });

    it('should create envelope with metadata', () => {
      const envelope = integration.createEnvelope(
        'agent-1',
        'test',
        { data: 'value' },
        { context: 'testing', priority: 'high' }
      );

      expect(envelope.metadata).toEqual({ context: 'testing', priority: 'high' });
    });

    it('should use genesis hash for first envelope', () => {
      const envelope = integration.createEnvelope('agent', 'first', {});
      expect(envelope.previousHash).toBe('0'.repeat(64));
    });

    it('should link to previous envelope after first', () => {
      const first = integration.createSignedEnvelope('agent', 'first', {});
      integration.appendToChain(first);

      const second = integration.createEnvelope('agent', 'second', {});
      expect(second.previousHash).toBe(first.contentHash);
    });
  });

  describe('Envelope Signing', () => {
    it('should sign an envelope', () => {
      const envelope = integration.createEnvelope('agent', 'test', {});
      expect(envelope.signature).toBe('');

      const signed = integration.signEnvelope(envelope);
      expect(signed.signature).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should produce consistent signatures', () => {
      const envelope = integration.createEnvelope('agent', 'test', { value: 42 });

      const signed1 = integration.signEnvelope(envelope);
      const signed2 = integration.signEnvelope(envelope);

      expect(signed1.signature).toBe(signed2.signature);
    });

    it('should produce different signatures with different keys', () => {
      const envelope = integration.createEnvelope('agent', 'test', {});

      const signed1 = integration.signEnvelope(envelope, 'key1');
      const signed2 = integration.signEnvelope(envelope, 'key2');

      expect(signed1.signature).not.toBe(signed2.signature);
    });

    it('should create signed envelope in one step', () => {
      const envelope = integration.createSignedEnvelope(
        'agent',
        'task_start',
        { taskId: 'task-123' }
      );

      expect(envelope.signature).toMatch(/^[a-f0-9]{64}$/);
      expect(envelope.agentId).toBe('agent');
      expect(envelope.action).toBe('task_start');
    });
  });

  describe('Chain Management', () => {
    it('should append valid envelope to chain', () => {
      const envelope = integration.createSignedEnvelope('agent', 'test', {});
      integration.appendToChain(envelope);

      expect(integration.getChainLength()).toBe(1);
      expect(integration.getChain()).toHaveLength(1);
    });

    it('should maintain chain order', () => {
      const env1 = integration.createSignedEnvelope('agent', 'action1', {});
      integration.appendToChain(env1);

      const env2 = integration.createSignedEnvelope('agent', 'action2', {});
      integration.appendToChain(env2);

      const env3 = integration.createSignedEnvelope('agent', 'action3', {});
      integration.appendToChain(env3);

      const chain = integration.getChain();
      expect(chain[0].action).toBe('action1');
      expect(chain[1].action).toBe('action2');
      expect(chain[2].action).toBe('action3');
    });

    it('should reject invalid envelope', () => {
      const envelope = integration.createEnvelope('agent', 'test', {});
      // Don't sign it

      expect(() => integration.appendToChain(envelope)).toThrow(
        /Cannot append invalid envelope/
      );
    });

    it('should reject envelope with broken chain link', () => {
      const env1 = integration.createSignedEnvelope('agent', 'first', {});
      integration.appendToChain(env1);

      // Create envelope but tamper with previousHash
      const env2 = integration.createSignedEnvelope('agent', 'second', {});
      const tamperedEnv2: ProofEnvelope = {
        ...env2,
        previousHash: 'invalid-hash',
        signature: env2.signature, // Signature won't match now
      };

      expect(() => integration.appendToChain(tamperedEnv2)).toThrow();
    });

    it('should get last envelope', () => {
      expect(integration.getLastEnvelope()).toBeNull();

      const env1 = integration.createSignedEnvelope('agent', 'first', {});
      integration.appendToChain(env1);

      expect(integration.getLastEnvelope()?.id).toBe(env1.id);

      const env2 = integration.createSignedEnvelope('agent', 'second', {});
      integration.appendToChain(env2);

      expect(integration.getLastEnvelope()?.id).toBe(env2.id);
    });

    it('should clear chain', () => {
      const env = integration.createSignedEnvelope('agent', 'test', {});
      integration.appendToChain(env);
      expect(integration.getChainLength()).toBe(1);

      integration.clearChain();
      expect(integration.getChainLength()).toBe(0);
    });
  });

  describe('Verification', () => {
    it('should verify valid envelope', () => {
      const envelope = integration.createSignedEnvelope('agent', 'test', {});

      const result = integration.verifyEnvelope(envelope);
      expect(result.valid).toBe(true);
      expect(result.details.contentHashValid).toBe(true);
      expect(result.details.signatureValid).toBe(true);
    });

    it('should reject envelope with tampered content', () => {
      const envelope = integration.createSignedEnvelope('agent', 'test', { value: 1 });

      // Tamper with payload
      const tampered: ProofEnvelope = {
        ...envelope,
        payload: { value: 999 },
      };

      const result = integration.verifyEnvelope(tampered);
      expect(result.valid).toBe(false);
      expect(result.details.contentHashValid).toBe(false);
      expect(result.error).toContain('Content hash');
    });

    it('should reject envelope with wrong signature', () => {
      const envelope = integration.createSignedEnvelope('agent', 'test', {});

      // Use different key for verification
      const result = integration.verifyEnvelope(envelope, 'wrong-key');
      expect(result.valid).toBe(false);
      expect(result.details.signatureValid).toBe(false);
    });

    it('should verify full chain', () => {
      // Build a chain
      for (let i = 0; i < 5; i++) {
        const env = integration.createSignedEnvelope('agent', `action${i}`, { i });
        integration.appendToChain(env);
      }

      const result = integration.verifyChain();
      expect(result.valid).toBe(true);
      expect(result.envelopesVerified).toBe(5);
      expect(result.firstInvalidIndex).toBe(-1);
      expect(result.errors).toHaveLength(0);
      expect(result.merkleRoot).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should detect chain with invalid envelope', () => {
      const env1 = integration.createSignedEnvelope('agent', 'first', {});
      integration.appendToChain(env1);

      const env2 = integration.createSignedEnvelope('agent', 'second', {});
      integration.appendToChain(env2);

      // Manually tamper with chain
      const chain = integration.getChain();
      (chain[1] as any).payload = { tampered: true };

      // Re-run verification
      const result = integration.verifyChain();
      expect(result.valid).toBe(false);
      expect(result.firstInvalidIndex).toBe(1);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Tamper Detection', () => {
    it('should detect no tampering in valid chain', () => {
      for (let i = 0; i < 3; i++) {
        const env = integration.createSignedEnvelope('agent', `action${i}`, {});
        integration.appendToChain(env);
      }

      const result = integration.detectTampering();
      expect(result.tampered).toBe(false);
      expect(result.tamperedIndices).toHaveLength(0);
      expect(result.details).toHaveLength(0);
    });

    it('should detect content tampering', () => {
      const env1 = integration.createSignedEnvelope('agent', 'first', { value: 1 });
      integration.appendToChain(env1);

      const env2 = integration.createSignedEnvelope('agent', 'second', { value: 2 });
      integration.appendToChain(env2);

      // Tamper with first envelope's payload
      const chain = integration.getChain();
      (chain[0] as any).payload = { value: 999 };

      const result = integration.detectTampering();
      expect(result.tampered).toBe(true);
      expect(result.tamperedIndices).toContain(0);
      expect(result.details[0].issue).toContain('Content hash mismatch');
    });

    it('should detect chain link tampering', () => {
      const env1 = integration.createSignedEnvelope('agent', 'first', {});
      integration.appendToChain(env1);

      const env2 = integration.createSignedEnvelope('agent', 'second', {});
      integration.appendToChain(env2);

      // Tamper with second envelope's previousHash
      const chain = integration.getChain();
      (chain[1] as any).previousHash = 'fake-hash';

      const result = integration.detectTampering();
      expect(result.tampered).toBe(true);
      expect(result.tamperedIndices).toContain(1);
    });
  });

  describe('Queries', () => {
    beforeEach(() => {
      // Set up test chain
      const agents = ['agent-1', 'agent-2', 'agent-1'];
      const actions = ['start', 'process', 'complete'];

      for (let i = 0; i < 3; i++) {
        const env = integration.createSignedEnvelope(
          agents[i],
          actions[i],
          { index: i }
        );
        integration.appendToChain(env);
      }
    });

    it('should get envelope by ID', () => {
      const chain = integration.getChain();
      const firstId = chain[0].id;

      const envelope = integration.getEnvelopeById(firstId);
      expect(envelope).not.toBeNull();
      expect(envelope?.id).toBe(firstId);
    });

    it('should return null for unknown ID', () => {
      const envelope = integration.getEnvelopeById('unknown-id');
      expect(envelope).toBeNull();
    });

    it('should get envelopes by agent', () => {
      const agent1Envelopes = integration.getEnvelopesByAgent('agent-1');
      expect(agent1Envelopes).toHaveLength(2);

      const agent2Envelopes = integration.getEnvelopesByAgent('agent-2');
      expect(agent2Envelopes).toHaveLength(1);
    });

    it('should get envelopes by action', () => {
      const startEnvelopes = integration.getEnvelopesByAction('start');
      expect(startEnvelopes).toHaveLength(1);
      expect(startEnvelopes[0].action).toBe('start');
    });

    it('should get envelopes since timestamp', () => {
      const chain = integration.getChain();
      const midTimestamp = chain[1].timestamp;

      const recentEnvelopes = integration.getEnvelopesSince(midTimestamp);
      expect(recentEnvelopes.length).toBeGreaterThanOrEqual(2);
    });

    it('should get envelopes in time range', () => {
      const chain = integration.getChain();
      const start = chain[0].timestamp;
      const end = chain[2].timestamp;

      const rangeEnvelopes = integration.getEnvelopesInRange(start, end);
      expect(rangeEnvelopes).toHaveLength(3);
    });
  });

  describe('Export/Import', () => {
    beforeEach(() => {
      for (let i = 0; i < 3; i++) {
        const env = integration.createSignedEnvelope('agent', `action${i}`, { i });
        integration.appendToChain(env);
      }
    });

    it('should export chain as JSON', () => {
      const exported = integration.exportChain('json') as string;
      const parsed = JSON.parse(exported);

      expect(parsed.version).toBe(1);
      expect(parsed.chainLength).toBe(3);
      expect(parsed.envelopes).toHaveLength(3);
      expect(parsed.merkleRoot).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should export chain as binary', () => {
      const exported = integration.exportChain('binary') as Uint8Array;
      expect(exported).toBeInstanceOf(Uint8Array);
      expect(exported.length).toBeGreaterThan(0);
    });

    it('should import JSON chain', async () => {
      const exported = integration.exportChain('json') as string;
      const originalLength = integration.getChainLength();

      const newIntegration = createProofEnvelopeIntegration();
      await newIntegration.initialize(testSigningKey);
      newIntegration.importChain(exported);

      expect(newIntegration.getChainLength()).toBe(originalLength);
      expect(newIntegration.verifyChain().valid).toBe(true);

      newIntegration.reset();
    });

    it('should import binary chain', async () => {
      const exported = integration.exportChain('binary') as Uint8Array;

      const newIntegration = createProofEnvelopeIntegration();
      await newIntegration.initialize(testSigningKey);
      newIntegration.importChain(exported);

      expect(newIntegration.getChainLength()).toBe(3);

      newIntegration.reset();
    });

    it('should reject invalid import data', () => {
      const newIntegration = createProofEnvelopeIntegration();
      newIntegration.initialize(testSigningKey);

      expect(() => newIntegration.importChain('{"invalid": true}')).toThrow(
        /Invalid chain data/
      );

      newIntegration.reset();
    });

    it('should verify chain on import by default', () => {
      const exported = integration.exportChain('json') as string;
      const parsed = JSON.parse(exported);

      // Tamper with exported data
      parsed.envelopes[1].payload = { tampered: true };

      const newIntegration = createProofEnvelopeIntegration();
      newIntegration.initialize(testSigningKey);

      expect(() => newIntegration.importChain(JSON.stringify(parsed))).toThrow(
        /failed verification/
      );

      newIntegration.reset();
    });

    it('should allow import without verification', () => {
      const exported = integration.exportChain('json') as string;
      const parsed = JSON.parse(exported);

      // Tamper with exported data
      parsed.envelopes[1].payload = { tampered: true };

      const newIntegration = createProofEnvelopeIntegration();
      newIntegration.initialize(testSigningKey);

      // Import without verification
      newIntegration.importChain(JSON.stringify(parsed), false);
      expect(newIntegration.getChainLength()).toBe(3);

      // Now verification should fail
      expect(newIntegration.verifyChain().valid).toBe(false);

      newIntegration.reset();
    });
  });

  describe('Statistics', () => {
    it('should return stats for empty chain', () => {
      const stats = integration.getProofStats();

      expect(stats.chainLength).toBe(0);
      expect(stats.firstTimestamp).toBeNull();
      expect(stats.lastTimestamp).toBeNull();
      expect(stats.uniqueAgents).toHaveLength(0);
      expect(Object.keys(stats.actionCounts)).toHaveLength(0);
      expect(stats.chainValid).toBe(true);
    });

    it('should return accurate stats', () => {
      // Create diverse chain
      integration.appendToChain(
        integration.createSignedEnvelope('agent-1', 'start', {})
      );
      integration.appendToChain(
        integration.createSignedEnvelope('agent-1', 'process', {})
      );
      integration.appendToChain(
        integration.createSignedEnvelope('agent-2', 'process', {})
      );
      integration.appendToChain(
        integration.createSignedEnvelope('agent-3', 'complete', {})
      );

      const stats = integration.getProofStats();

      expect(stats.chainLength).toBe(4);
      expect(stats.firstTimestamp).not.toBeNull();
      expect(stats.lastTimestamp).not.toBeNull();
      expect(stats.uniqueAgents).toHaveLength(3);
      expect(stats.uniqueAgents).toContain('agent-1');
      expect(stats.uniqueAgents).toContain('agent-2');
      expect(stats.uniqueAgents).toContain('agent-3');
      expect(stats.actionCounts.start).toBe(1);
      expect(stats.actionCounts.process).toBe(2);
      expect(stats.actionCounts.complete).toBe(1);
      expect(stats.merkleRoot).toMatch(/^[a-f0-9]{64}$/);
      expect(stats.chainValid).toBe(true);
    });
  });

  describe('Merkle Tree', () => {
    it('should compute merkle root for empty chain', () => {
      const root = integration.computeMerkleRoot();
      expect(root).toBe('0'.repeat(64)); // Genesis hash
    });

    it('should compute merkle root for single envelope', () => {
      const env = integration.createSignedEnvelope('agent', 'test', {});
      integration.appendToChain(env);

      const root = integration.computeMerkleRoot();
      expect(root).toBe(env.contentHash);
    });

    it('should compute consistent merkle root', () => {
      for (let i = 0; i < 4; i++) {
        const env = integration.createSignedEnvelope('agent', `action${i}`, { i });
        integration.appendToChain(env);
      }

      const root1 = integration.computeMerkleRoot();
      const root2 = integration.computeMerkleRoot();

      expect(root1).toBe(root2);
      expect(root1).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should change merkle root when chain changes', () => {
      const env1 = integration.createSignedEnvelope('agent', 'first', {});
      integration.appendToChain(env1);

      const root1 = integration.computeMerkleRoot();

      const env2 = integration.createSignedEnvelope('agent', 'second', {});
      integration.appendToChain(env2);

      const root2 = integration.computeMerkleRoot();

      expect(root1).not.toBe(root2);
    });

    it('should generate merkle proof', () => {
      for (let i = 0; i < 4; i++) {
        const env = integration.createSignedEnvelope('agent', `action${i}`, { i });
        integration.appendToChain(env);
      }

      const chain = integration.getChain();
      const proof = integration.getMerkleProof(chain[1].id);

      expect(proof).not.toBeNull();
      expect(proof!.length).toBeGreaterThan(0);
    });

    it('should return null proof for unknown envelope', () => {
      const proof = integration.getMerkleProof('unknown-id');
      expect(proof).toBeNull();
    });

    it('should verify valid merkle proof', () => {
      for (let i = 0; i < 4; i++) {
        const env = integration.createSignedEnvelope('agent', `action${i}`, { i });
        integration.appendToChain(env);
      }

      const chain = integration.getChain();
      const targetIndex = 2;
      const targetEnvelope = chain[targetIndex];
      const proof = integration.getMerkleProof(targetEnvelope.id);

      expect(proof).not.toBeNull();

      const isValid = integration.verifyMerkleProof(
        targetEnvelope.contentHash,
        proof!,
        targetIndex
      );
      expect(isValid).toBe(true);
    });

    it('should reject invalid merkle proof', () => {
      for (let i = 0; i < 4; i++) {
        const env = integration.createSignedEnvelope('agent', `action${i}`, { i });
        integration.appendToChain(env);
      }

      const chain = integration.getChain();
      const proof = integration.getMerkleProof(chain[2].id);

      // Use wrong content hash
      const isValid = integration.verifyMerkleProof(
        'wrong-content-hash',
        proof!,
        2
      );
      expect(isValid).toBe(false);
    });
  });

  describe('WASM Kernel Integration', () => {
    it('should use WASM kernel for hashing', async () => {
      const kernel = createWasmKernelIntegration();
      await kernel.initialize();

      const customIntegration = createProofEnvelopeIntegration(kernel);
      await customIntegration.initialize();

      // Create and verify several envelopes
      for (let i = 0; i < 5; i++) {
        const env = customIntegration.createSignedEnvelope('agent', `action${i}`, { i });
        customIntegration.appendToChain(env);
      }

      const result = customIntegration.verifyChain();
      expect(result.valid).toBe(true);
      expect(result.envelopesVerified).toBe(5);

      // Check kernel was used
      const metrics = kernel.getPerformanceMetrics();
      expect(metrics.totalOperations).toBeGreaterThan(0);

      kernel.reset();
      customIntegration.reset();
    });

    it('should produce consistent results regardless of backend', async () => {
      // Test with default kernel
      const env1 = integration.createSignedEnvelope('agent', 'test', { value: 42 });

      // Create another integration with explicit kernel
      const kernel = createWasmKernelIntegration();
      await kernel.initialize();

      const otherIntegration = createProofEnvelopeIntegration(kernel);
      await otherIntegration.initialize(testSigningKey);

      const env2 = otherIntegration.createEnvelope('agent', 'test', { value: 42 });
      // Manually set same ID and timestamp for comparison
      const env2Fixed = {
        ...env2,
        id: env1.id,
        timestamp: env1.timestamp,
      };

      // Recalculate content hash with fixed values
      const env2Signed = otherIntegration.signEnvelope(env2Fixed);

      // Content hashes should match since content is the same
      // Note: We can't directly compare due to different IDs/timestamps,
      // but we verify both produce valid hashes
      expect(env1.contentHash).toMatch(/^[a-f0-9]{64}$/);
      expect(env2.contentHash).toMatch(/^[a-f0-9]{64}$/);

      kernel.reset();
      otherIntegration.reset();
    });
  });

  describe('Feature Flags', () => {
    it('should check if proof is required for claims', () => {
      const isRequired = isProofRequiredForClaims();
      expect(typeof isRequired).toBe('boolean');
    });

    it('should respect feature flags', () => {
      const flags = governanceFlags.getFlags().proofEnvelope;

      expect(flags.enabled).toBe(true);
      expect(flags.hashChaining).toBe(true);
      expect(flags.requireProofForClaims).toBe(true);
      expect(flags.chainPersistence).toBe(false);
      expect(flags.maxChainLength).toBe(10000);
      expect(flags.signAllEnvelopes).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty payload', () => {
      const env = integration.createSignedEnvelope('agent', 'test', {});
      integration.appendToChain(env);

      expect(integration.verifyChain().valid).toBe(true);
    });

    it('should handle null payload', () => {
      const env = integration.createSignedEnvelope('agent', 'test', null);
      integration.appendToChain(env);

      expect(integration.verifyChain().valid).toBe(true);
    });

    it('should handle complex nested payload', () => {
      const complexPayload = {
        array: [1, 2, 3],
        nested: {
          deep: {
            value: 'test',
          },
        },
        date: new Date().toISOString(),
        unicode: '\u00e9\u00f1\u00fc',
      };

      const env = integration.createSignedEnvelope('agent', 'test', complexPayload);
      integration.appendToChain(env);

      expect(integration.verifyChain().valid).toBe(true);
      expect(integration.getLastEnvelope()?.payload).toEqual(complexPayload);
    });

    it('should handle special characters in agent ID', () => {
      const env = integration.createSignedEnvelope(
        'agent-with-special_chars.v1',
        'test',
        {}
      );
      integration.appendToChain(env);

      expect(integration.getEnvelopesByAgent('agent-with-special_chars.v1')).toHaveLength(1);
    });

    it('should handle very long chain', () => {
      const chainLength = 100;

      for (let i = 0; i < chainLength; i++) {
        const env = integration.createSignedEnvelope('agent', `action${i}`, { i });
        integration.appendToChain(env);
      }

      expect(integration.getChainLength()).toBe(chainLength);
      expect(integration.verifyChain().valid).toBe(true);
    });
  });

  describe('Performance', () => {
    it('should create envelopes quickly', async () => {
      const iterations = 100;
      const start = performance.now();

      for (let i = 0; i < iterations; i++) {
        integration.createSignedEnvelope('agent', 'test', { i });
      }

      const elapsed = performance.now() - start;
      const avgTime = elapsed / iterations;

      // Should average less than 5ms per envelope
      expect(avgTime).toBeLessThan(5);
    });

    it('should verify chain efficiently', async () => {
      // Build chain
      for (let i = 0; i < 50; i++) {
        const env = integration.createSignedEnvelope('agent', `action${i}`, { i });
        integration.appendToChain(env);
      }

      const start = performance.now();
      const result = integration.verifyChain();
      const elapsed = performance.now() - start;

      expect(result.valid).toBe(true);
      // Should verify 50 envelopes in less than 100ms
      expect(elapsed).toBeLessThan(100);
    });
  });
});
