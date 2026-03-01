/**
 * Unit tests for governance/proof-envelope-integration.ts
 *
 * Tests: envelope creation/signing, chain management, verification,
 * tamper detection, queries, Merkle tree, and export/import.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHash, createHmac } from 'node:crypto';

vi.mock('../../../src/governance/wasm-kernel-integration.js', () => {
  const { createHash: _createHash, createHmac: _createHmac } = require('node:crypto');
  const kernel = {
    initialize: vi.fn().mockResolvedValue(undefined),
    isInitialized: vi.fn().mockReturnValue(true),
    contentHash: vi.fn().mockImplementation((content: unknown) => {
      const str = JSON.stringify(content);
      return _createHash('sha256').update(str).digest('hex');
    }),
    hmac: vi.fn().mockImplementation((key: string, data: string) => {
      return _createHmac('sha256', key).update(data).digest('hex');
    }),
    hash: vi.fn().mockImplementation((input: string) => {
      return _createHash('sha256').update(input).digest('hex');
    }),
  };
  return {
    wasmKernelIntegration: kernel,
    WasmKernelIntegration: vi.fn().mockImplementation(() => kernel),
    createWasmKernelIntegration: vi.fn().mockReturnValue(kernel),
  };
});

vi.mock('../../../src/governance/feature-flags.js', () => ({
  governanceFlags: {
    getFlags: vi.fn().mockReturnValue({
      proofEnvelope: {
        enabled: true,
        hashChaining: true,
        requireProofForClaims: true,
        chainPersistence: false,
        maxChainLength: 10000,
        signAllEnvelopes: true,
      },
      global: { enableAllGates: true },
    }),
  },
}));

import {
  ProofEnvelopeIntegration,
  createProofEnvelopeIntegration,
} from '../../../src/governance/proof-envelope-integration.js';
import { wasmKernelIntegration } from '../../../src/governance/wasm-kernel-integration.js';

describe('ProofEnvelopeIntegration', () => {
  let pei: ProofEnvelopeIntegration;

  beforeEach(async () => {
    pei = createProofEnvelopeIntegration(wasmKernelIntegration as any);
    await pei.initialize('test-signing-key');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================================================
  // Initialization
  // ============================================================================

  describe('initialization', () => {
    it('should initialize successfully', () => {
      expect(pei.isInitialized()).toBe(true);
    });

    it('should be idempotent on double initialize', async () => {
      await pei.initialize('key-2');
      expect(pei.isInitialized()).toBe(true);
    });

    it('should start with empty chain', () => {
      expect(pei.getChainLength()).toBe(0);
      expect(pei.getLastEnvelope()).toBeNull();
    });
  });

  // ============================================================================
  // Envelope Creation
  // ============================================================================

  describe('createEnvelope', () => {
    it('should create an unsigned envelope with correct fields', () => {
      const envelope = pei.createEnvelope('agent-1', 'test_action', { data: 'hello' });

      expect(envelope.id).toMatch(/^env_/);
      expect(envelope.agentId).toBe('agent-1');
      expect(envelope.action).toBe('test_action');
      expect(envelope.payload).toEqual({ data: 'hello' });
      expect(envelope.contentHash).toBeDefined();
      expect(envelope.previousHash).toBe('0'.repeat(64)); // Genesis
      expect(envelope.signature).toBe('');
    });

    it('should include metadata when provided', () => {
      const envelope = pei.createEnvelope('agent-1', 'action', 'data', { key: 'value' });
      expect(envelope.metadata).toEqual({ key: 'value' });
    });
  });

  // ============================================================================
  // Envelope Signing
  // ============================================================================

  describe('signEnvelope', () => {
    it('should produce a non-empty signature', () => {
      const unsigned = pei.createEnvelope('agent-1', 'action', 'data');
      const signed = pei.signEnvelope(unsigned);

      expect(signed.signature).not.toBe('');
      expect(signed.signature.length).toBeGreaterThan(0);
    });

    it('should preserve all other fields', () => {
      const unsigned = pei.createEnvelope('agent-1', 'action', 'data');
      const signed = pei.signEnvelope(unsigned);

      expect(signed.id).toBe(unsigned.id);
      expect(signed.contentHash).toBe(unsigned.contentHash);
      expect(signed.agentId).toBe(unsigned.agentId);
    });
  });

  // ============================================================================
  // createSignedEnvelope (convenience)
  // ============================================================================

  describe('createSignedEnvelope', () => {
    it('should create and sign in one step', () => {
      const envelope = pei.createSignedEnvelope('agent-1', 'action', { foo: 'bar' });

      expect(envelope.signature).not.toBe('');
      expect(envelope.contentHash).toBeDefined();
      expect(envelope.agentId).toBe('agent-1');
    });
  });

  // ============================================================================
  // Chain Management
  // ============================================================================

  describe('chain management', () => {
    it('should append valid envelope to chain', () => {
      const envelope = pei.createSignedEnvelope('agent-1', 'action', 'data');
      pei.appendToChain(envelope);

      expect(pei.getChainLength()).toBe(1);
      expect(pei.getLastEnvelope()!.id).toBe(envelope.id);
    });

    it('should link envelopes correctly in chain', () => {
      const e1 = pei.createSignedEnvelope('agent-1', 'action1', 'data1');
      pei.appendToChain(e1);

      const e2 = pei.createSignedEnvelope('agent-1', 'action2', 'data2');
      pei.appendToChain(e2);

      expect(pei.getChainLength()).toBe(2);
      expect(e2.previousHash).toBe(e1.contentHash);
    });

    it('should reject envelope that does not link to chain', () => {
      const e1 = pei.createSignedEnvelope('agent-1', 'action1', 'data1');
      pei.appendToChain(e1);

      // Create an envelope that thinks it's first (genesis previous hash)
      const orphan = pei.createSignedEnvelope('agent-1', 'orphan', 'data');
      // Tamper: the orphan was created when chain was length=1, so previousHash = e1.contentHash
      // But if we clear and recreate, the previousHash would be genesis
      pei.clearChain();
      const genesisEnvelope = pei.createSignedEnvelope('agent-1', 'genesis', 'data');
      pei.appendToChain(genesisEnvelope);

      // Now try appending e1 which has genesis previousHash but chain expects genesisEnvelope.contentHash
      expect(() => pei.appendToChain(e1)).toThrow('does not link to chain');
    });

    it('should clear chain', () => {
      const e1 = pei.createSignedEnvelope('agent-1', 'action', 'data');
      pei.appendToChain(e1);
      expect(pei.getChainLength()).toBe(1);

      pei.clearChain();
      expect(pei.getChainLength()).toBe(0);
    });
  });

  // ============================================================================
  // Verification
  // ============================================================================

  describe('verifyEnvelope', () => {
    it('should verify a valid signed envelope', () => {
      const envelope = pei.createSignedEnvelope('agent-1', 'action', 'data');
      const result = pei.verifyEnvelope(envelope);

      expect(result.valid).toBe(true);
      expect(result.details.contentHashValid).toBe(true);
      expect(result.details.signatureValid).toBe(true);
    });

    it('should detect content hash tampering', () => {
      const envelope = pei.createSignedEnvelope('agent-1', 'action', 'data');
      // Tamper with content
      const tampered = { ...envelope, payload: 'tampered-data' };
      const result = pei.verifyEnvelope(tampered);

      expect(result.valid).toBe(false);
      expect(result.details.contentHashValid).toBe(false);
    });
  });

  describe('verifyChain', () => {
    it('should verify an empty chain as valid', () => {
      const result = pei.verifyChain();
      expect(result.valid).toBe(true);
      expect(result.envelopesVerified).toBe(0);
    });

    it('should verify a valid multi-envelope chain', () => {
      for (let i = 0; i < 3; i++) {
        const envelope = pei.createSignedEnvelope('agent-1', `action-${i}`, `data-${i}`);
        pei.appendToChain(envelope);
      }

      const result = pei.verifyChain();
      expect(result.valid).toBe(true);
      expect(result.envelopesVerified).toBe(3);
      expect(result.errors).toHaveLength(0);
    });
  });

  // ============================================================================
  // Tamper Detection
  // ============================================================================

  describe('detectTampering', () => {
    it('should report no tampering on valid chain', () => {
      const e1 = pei.createSignedEnvelope('agent-1', 'action1', 'data1');
      pei.appendToChain(e1);

      const result = pei.detectTampering();
      expect(result.tampered).toBe(false);
      expect(result.tamperedIndices).toHaveLength(0);
    });
  });

  // ============================================================================
  // Queries
  // ============================================================================

  describe('queries', () => {
    beforeEach(() => {
      const e1 = pei.createSignedEnvelope('agent-1', 'login', { user: 'alice' });
      pei.appendToChain(e1);
      const e2 = pei.createSignedEnvelope('agent-2', 'query', { table: 'users' });
      pei.appendToChain(e2);
      const e3 = pei.createSignedEnvelope('agent-1', 'logout', { user: 'alice' });
      pei.appendToChain(e3);
    });

    it('should find envelope by id', () => {
      const chain = pei.getChain();
      const found = pei.getEnvelopeById(chain[1].id);
      expect(found).not.toBeNull();
      expect(found!.action).toBe('query');
    });

    it('should return null for unknown id', () => {
      expect(pei.getEnvelopeById('nonexistent')).toBeNull();
    });

    it('should filter by agent', () => {
      const envelopes = pei.getEnvelopesByAgent('agent-1');
      expect(envelopes).toHaveLength(2);
    });

    it('should filter by action', () => {
      const envelopes = pei.getEnvelopesByAction('login');
      expect(envelopes).toHaveLength(1);
    });

    it('should filter by timestamp range', () => {
      const chain = pei.getChain();
      const start = chain[0].timestamp;
      const end = chain[2].timestamp;
      const envelopes = pei.getEnvelopesInRange(start, end);
      expect(envelopes.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ============================================================================
  // Merkle Tree
  // ============================================================================

  describe('Merkle tree', () => {
    it('should return genesis hash for empty chain', () => {
      const root = pei.computeMerkleRoot();
      expect(root).toBe('0'.repeat(64));
    });

    it('should compute Merkle root for single envelope', () => {
      const e1 = pei.createSignedEnvelope('agent-1', 'action', 'data');
      pei.appendToChain(e1);

      const root = pei.computeMerkleRoot();
      expect(root).toBe(e1.contentHash);
    });

    it('should compute different Merkle roots for different chains', () => {
      const e1 = pei.createSignedEnvelope('agent-1', 'action1', 'data1');
      pei.appendToChain(e1);
      const e2 = pei.createSignedEnvelope('agent-1', 'action2', 'data2');
      pei.appendToChain(e2);
      const root1 = pei.computeMerkleRoot();

      pei.clearChain();
      const e3 = pei.createSignedEnvelope('agent-1', 'action3', 'data3');
      pei.appendToChain(e3);
      const root2 = pei.computeMerkleRoot();

      expect(root1).not.toBe(root2);
    });

    it('should produce valid Merkle proof', () => {
      for (let i = 0; i < 4; i++) {
        const e = pei.createSignedEnvelope('agent-1', `action-${i}`, `data-${i}`);
        pei.appendToChain(e);
      }

      const chain = pei.getChain();
      const proof = pei.getMerkleProof(chain[1].id);
      expect(proof).not.toBeNull();

      const isValid = pei.verifyMerkleProof(chain[1].contentHash, proof!, 1);
      expect(isValid).toBe(true);
    });

    it('should return null proof for unknown envelope', () => {
      expect(pei.getMerkleProof('nonexistent')).toBeNull();
    });
  });

  // ============================================================================
  // Export / Import
  // ============================================================================

  describe('export and import', () => {
    it('should export chain as JSON', () => {
      const e1 = pei.createSignedEnvelope('agent-1', 'action', 'data');
      pei.appendToChain(e1);

      const exported = pei.exportChain('json');
      expect(typeof exported).toBe('string');
      const parsed = JSON.parse(exported as string);
      expect(parsed.version).toBe(1);
      expect(parsed.chainLength).toBe(1);
      expect(parsed.envelopes).toHaveLength(1);
    });

    it('should export chain as binary', () => {
      const e1 = pei.createSignedEnvelope('agent-1', 'action', 'data');
      pei.appendToChain(e1);

      const exported = pei.exportChain('binary');
      expect(exported).toBeInstanceOf(Uint8Array);
    });

    it('should import a previously exported chain', () => {
      // Build and export a chain
      const e1 = pei.createSignedEnvelope('agent-1', 'action1', 'data1');
      pei.appendToChain(e1);
      const e2 = pei.createSignedEnvelope('agent-1', 'action2', 'data2');
      pei.appendToChain(e2);

      const exported = pei.exportChain('json') as string;

      // Clear and reimport
      pei.clearChain();
      expect(pei.getChainLength()).toBe(0);

      pei.importChain(exported);
      expect(pei.getChainLength()).toBe(2);
    });

    it('should reject invalid import data', () => {
      expect(() => pei.importChain('{"invalid": true}')).toThrow('missing envelopes');
    });
  });

  // ============================================================================
  // Statistics
  // ============================================================================

  describe('getProofStats', () => {
    it('should return empty stats for empty chain', () => {
      const stats = pei.getProofStats();
      expect(stats.chainLength).toBe(0);
      expect(stats.firstTimestamp).toBeNull();
      expect(stats.uniqueAgents).toHaveLength(0);
      expect(stats.chainValid).toBe(true);
    });

    it('should compute stats for populated chain', () => {
      const e1 = pei.createSignedEnvelope('agent-1', 'action1', 'data');
      pei.appendToChain(e1);
      const e2 = pei.createSignedEnvelope('agent-2', 'action1', 'data');
      pei.appendToChain(e2);
      const e3 = pei.createSignedEnvelope('agent-1', 'action2', 'data');
      pei.appendToChain(e3);

      const stats = pei.getProofStats();
      expect(stats.chainLength).toBe(3);
      expect(stats.uniqueAgents).toContain('agent-1');
      expect(stats.uniqueAgents).toContain('agent-2');
      expect(stats.actionCounts['action1']).toBe(2);
      expect(stats.actionCounts['action2']).toBe(1);
      expect(stats.chainValid).toBe(true);
    });
  });

  // ============================================================================
  // Reset
  // ============================================================================

  describe('reset', () => {
    it('should reset all state', () => {
      const e1 = pei.createSignedEnvelope('agent-1', 'action', 'data');
      pei.appendToChain(e1);

      pei.reset();
      expect(pei.isInitialized()).toBe(false);
      expect(pei.getChainLength()).toBe(0);
    });
  });
});
