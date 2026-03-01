import { randomUUID } from 'node:crypto';
import { safeJsonParse } from '../shared/safe-json.js';

/**
 * Proof Envelope Integration for Agentic QE Fleet
 *
 * Provides hash-chained audit trails with cryptographic proof generation,
 * tamper detection, and action attestation for governance compliance.
 *
 * Key features:
 * - Hash chaining for tamper-evident audit trails
 * - Cryptographic envelope signing
 * - Chain integrity verification
 * - Genesis envelope for chain initialization
 * - Merkle root computation for efficient verification
 *
 * @module governance/proof-envelope-integration
 * @see ADR-058-guidance-governance-integration.md
 */

import {
  WasmKernelIntegration,
  wasmKernelIntegration,
  createWasmKernelIntegration,
} from './wasm-kernel-integration.js';
import {
  governanceFlags,
  type GovernanceFeatureFlags,
} from './feature-flags.js';

/**
 * Proof envelope structure
 */
export interface ProofEnvelope {
  /** Unique envelope identifier */
  id: string;
  /** Creation timestamp (ms since epoch) */
  timestamp: number;
  /** Agent that created this envelope */
  agentId: string;
  /** Action being attested */
  action: string;
  /** Action payload data */
  payload: unknown;
  /** Hash of the envelope content (excluding chain fields) */
  contentHash: string;
  /** Hash of the previous envelope in the chain */
  previousHash: string;
  /** Cryptographic signature */
  signature: string;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Result of envelope verification
 */
export interface VerificationResult {
  /** Whether the envelope is valid */
  valid: boolean;
  /** Verification details */
  details: {
    contentHashValid: boolean;
    signatureValid: boolean;
    chainLinkValid: boolean;
  };
  /** Error message if invalid */
  error?: string;
}

/**
 * Result of full chain verification
 */
export interface ChainVerificationResult {
  /** Whether the entire chain is valid */
  valid: boolean;
  /** Number of envelopes verified */
  envelopesVerified: number;
  /** Index of first invalid envelope (-1 if all valid) */
  firstInvalidIndex: number;
  /** Computed Merkle root of the chain */
  merkleRoot: string;
  /** Verification errors */
  errors: Array<{
    index: number;
    envelopeId: string;
    error: string;
  }>;
}

/**
 * Result of tamper detection
 */
export interface TamperDetectionResult {
  /** Whether tampering was detected */
  tampered: boolean;
  /** Indices of tampered envelopes */
  tamperedIndices: number[];
  /** Details of detected tampering */
  details: Array<{
    index: number;
    envelopeId: string;
    issue: string;
  }>;
}

/**
 * Statistics about the proof chain
 */
export interface ProofStats {
  /** Total number of envelopes in chain */
  chainLength: number;
  /** Timestamp of first envelope */
  firstTimestamp: number | null;
  /** Timestamp of last envelope */
  lastTimestamp: number | null;
  /** Unique agents in chain */
  uniqueAgents: string[];
  /** Action type counts */
  actionCounts: Record<string, number>;
  /** Current Merkle root */
  merkleRoot: string;
  /** Chain is valid */
  chainValid: boolean;
}

/**
 * Genesis envelope hash constant
 */
const GENESIS_HASH = '0'.repeat(64);

/**
 * Proof Envelope Integration class
 *
 * Manages hash-chained audit trails with cryptographic verification.
 */
export class ProofEnvelopeIntegration {
  private kernel: WasmKernelIntegration;
  private chain: ProofEnvelope[] = [];
  private signingKey: string = '';
  private initialized = false;
  private envelopeIndex: Map<string, number> = new Map();

  /**
   * Create a new ProofEnvelopeIntegration instance
   *
   * @param kernel - Optional WASM kernel integration (uses singleton if not provided)
   */
  constructor(kernel?: WasmKernelIntegration) {
    this.kernel = kernel ?? wasmKernelIntegration;
  }

  /**
   * Initialize the proof envelope integration
   *
   * @param signingKey - Key used for signing envelopes
   */
  async initialize(signingKey: string = 'agentic-qe-default-key'): Promise<void> {
    if (this.initialized) return;

    await this.kernel.initialize();
    this.signingKey = signingKey;
    this.initialized = true;
  }

  /**
   * Check if the integration is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get current feature flags for proof envelope
   */
  getFlags(): GovernanceFeatureFlags['proofEnvelope'] {
    return governanceFlags.getFlags().proofEnvelope;
  }

  // ============================================================================
  // Envelope Creation
  // ============================================================================

  /**
   * Create a new proof envelope
   *
   * @param agentId - Agent creating the envelope
   * @param action - Action being attested
   * @param payload - Action payload
   * @param metadata - Optional metadata
   * @returns Unsigned proof envelope
   */
  createEnvelope(
    agentId: string,
    action: string,
    payload: unknown,
    metadata?: Record<string, unknown>
  ): ProofEnvelope {
    const id = this.generateEnvelopeId();
    const timestamp = Date.now();

    // Get previous hash (genesis if first envelope)
    const previousHash = this.chain.length > 0
      ? this.chain[this.chain.length - 1].contentHash
      : GENESIS_HASH;

    // Create content to hash (excluding signature and chain fields)
    const content = {
      id,
      timestamp,
      agentId,
      action,
      payload,
      metadata,
    };

    const contentHash = this.kernel.contentHash(content);

    return {
      id,
      timestamp,
      agentId,
      action,
      payload,
      contentHash,
      previousHash,
      signature: '',
      metadata,
    };
  }

  /**
   * Sign an envelope with the configured key
   *
   * @param envelope - Envelope to sign
   * @param key - Optional key override
   * @returns Signed envelope
   */
  signEnvelope(envelope: ProofEnvelope, key?: string): ProofEnvelope {
    const signingKey = key ?? this.signingKey;

    // Create signature over content hash + previous hash
    const signatureContent = `${envelope.contentHash}:${envelope.previousHash}`;
    const signature = this.kernel.hmac(signingKey, signatureContent);

    return {
      ...envelope,
      signature,
    };
  }

  /**
   * Create and sign an envelope in one step
   *
   * @param agentId - Agent creating the envelope
   * @param action - Action being attested
   * @param payload - Action payload
   * @param metadata - Optional metadata
   * @returns Signed proof envelope
   */
  createSignedEnvelope(
    agentId: string,
    action: string,
    payload: unknown,
    metadata?: Record<string, unknown>
  ): ProofEnvelope {
    const envelope = this.createEnvelope(agentId, action, payload, metadata);
    return this.signEnvelope(envelope);
  }

  // ============================================================================
  // Chain Management
  // ============================================================================

  /**
   * Append an envelope to the chain
   *
   * @param envelope - Envelope to append
   * @throws Error if envelope is invalid or doesn't link correctly
   */
  appendToChain(envelope: ProofEnvelope): void {
    // Verify envelope before appending
    const verification = this.verifyEnvelope(envelope);
    if (!verification.valid) {
      throw new Error(`Cannot append invalid envelope: ${verification.error}`);
    }

    // Verify chain link
    const expectedPreviousHash = this.chain.length > 0
      ? this.chain[this.chain.length - 1].contentHash
      : GENESIS_HASH;

    if (envelope.previousHash !== expectedPreviousHash) {
      throw new Error(
        `Envelope does not link to chain. Expected previous hash ${expectedPreviousHash}, got ${envelope.previousHash}`
      );
    }

    // Add to chain and index
    const index = this.chain.length;
    this.chain.push(envelope);
    this.envelopeIndex.set(envelope.id, index);
  }

  /**
   * Get the current chain
   */
  getChain(): ProofEnvelope[] {
    return [...this.chain];
  }

  /**
   * Get the chain length
   */
  getChainLength(): number {
    return this.chain.length;
  }

  /**
   * Get the last envelope in the chain
   */
  getLastEnvelope(): ProofEnvelope | null {
    if (this.chain.length === 0) return null;
    return this.chain[this.chain.length - 1];
  }

  /**
   * Clear the chain (for testing)
   */
  clearChain(): void {
    this.chain = [];
    this.envelopeIndex.clear();
  }

  // ============================================================================
  // Verification
  // ============================================================================

  /**
   * Verify a single envelope
   *
   * @param envelope - Envelope to verify
   * @param key - Optional key override for signature verification
   * @returns Verification result
   */
  verifyEnvelope(envelope: ProofEnvelope, key?: string): VerificationResult {
    const signingKey = key ?? this.signingKey;
    const details = {
      contentHashValid: false,
      signatureValid: false,
      chainLinkValid: true, // Assume valid unless we can check
    };

    // Verify content hash
    const content = {
      id: envelope.id,
      timestamp: envelope.timestamp,
      agentId: envelope.agentId,
      action: envelope.action,
      payload: envelope.payload,
      metadata: envelope.metadata,
    };
    const expectedContentHash = this.kernel.contentHash(content);
    details.contentHashValid = envelope.contentHash === expectedContentHash;

    if (!details.contentHashValid) {
      return {
        valid: false,
        details,
        error: 'Content hash does not match envelope content',
      };
    }

    // Verify signature
    const signatureContent = `${envelope.contentHash}:${envelope.previousHash}`;
    const expectedSignature = this.kernel.hmac(signingKey, signatureContent);
    details.signatureValid = envelope.signature === expectedSignature;

    if (!details.signatureValid) {
      return {
        valid: false,
        details,
        error: 'Signature verification failed',
      };
    }

    // Check chain link if we have the chain
    const envelopeIndex = this.envelopeIndex.get(envelope.id);
    if (envelopeIndex !== undefined && envelopeIndex > 0) {
      const previousEnvelope = this.chain[envelopeIndex - 1];
      details.chainLinkValid = envelope.previousHash === previousEnvelope.contentHash;

      if (!details.chainLinkValid) {
        return {
          valid: false,
          details,
          error: 'Chain link is broken - previous hash does not match',
        };
      }
    }

    return {
      valid: true,
      details,
    };
  }

  /**
   * Verify the entire chain
   *
   * @param key - Optional key override for signature verification
   * @returns Chain verification result
   */
  verifyChain(key?: string): ChainVerificationResult {
    const errors: ChainVerificationResult['errors'] = [];
    let firstInvalidIndex = -1;

    // Verify each envelope
    for (let i = 0; i < this.chain.length; i++) {
      const envelope = this.chain[i];
      const verification = this.verifyEnvelope(envelope, key);

      if (!verification.valid) {
        errors.push({
          index: i,
          envelopeId: envelope.id,
          error: verification.error ?? 'Unknown error',
        });
        if (firstInvalidIndex === -1) {
          firstInvalidIndex = i;
        }
      }

      // Verify chain link
      const expectedPreviousHash = i > 0
        ? this.chain[i - 1].contentHash
        : GENESIS_HASH;

      if (envelope.previousHash !== expectedPreviousHash) {
        errors.push({
          index: i,
          envelopeId: envelope.id,
          error: `Chain link broken at index ${i}`,
        });
        if (firstInvalidIndex === -1) {
          firstInvalidIndex = i;
        }
      }
    }

    return {
      valid: errors.length === 0,
      envelopesVerified: this.chain.length,
      firstInvalidIndex,
      merkleRoot: this.computeMerkleRoot(),
      errors,
    };
  }

  /**
   * Detect tampering in the chain
   *
   * @returns Tamper detection result
   */
  detectTampering(): TamperDetectionResult {
    const details: TamperDetectionResult['details'] = [];
    const tamperedIndices: number[] = [];

    for (let i = 0; i < this.chain.length; i++) {
      const envelope = this.chain[i];

      // Verify content hash
      const content = {
        id: envelope.id,
        timestamp: envelope.timestamp,
        agentId: envelope.agentId,
        action: envelope.action,
        payload: envelope.payload,
        metadata: envelope.metadata,
      };
      const expectedContentHash = this.kernel.contentHash(content);

      if (envelope.contentHash !== expectedContentHash) {
        tamperedIndices.push(i);
        details.push({
          index: i,
          envelopeId: envelope.id,
          issue: 'Content hash mismatch - envelope content was modified',
        });
      }

      // Verify chain link
      const expectedPreviousHash = i > 0
        ? this.chain[i - 1].contentHash
        : GENESIS_HASH;

      if (envelope.previousHash !== expectedPreviousHash) {
        if (!tamperedIndices.includes(i)) {
          tamperedIndices.push(i);
        }
        details.push({
          index: i,
          envelopeId: envelope.id,
          issue: 'Chain link broken - previous hash does not match',
        });
      }
    }

    return {
      tampered: tamperedIndices.length > 0,
      tamperedIndices,
      details,
    };
  }

  // ============================================================================
  // Queries
  // ============================================================================

  /**
   * Get an envelope by ID
   *
   * @param id - Envelope ID
   * @returns Envelope or null if not found
   */
  getEnvelopeById(id: string): ProofEnvelope | null {
    const index = this.envelopeIndex.get(id);
    if (index === undefined) return null;
    return this.chain[index];
  }

  /**
   * Get all envelopes by agent
   *
   * @param agentId - Agent ID
   * @returns Array of envelopes
   */
  getEnvelopesByAgent(agentId: string): ProofEnvelope[] {
    return this.chain.filter(e => e.agentId === agentId);
  }

  /**
   * Get all envelopes by action
   *
   * @param action - Action type
   * @returns Array of envelopes
   */
  getEnvelopesByAction(action: string): ProofEnvelope[] {
    return this.chain.filter(e => e.action === action);
  }

  /**
   * Get all envelopes since a timestamp
   *
   * @param timestamp - Start timestamp (inclusive)
   * @returns Array of envelopes
   */
  getEnvelopesSince(timestamp: number): ProofEnvelope[] {
    return this.chain.filter(e => e.timestamp >= timestamp);
  }

  /**
   * Get envelopes in a time range
   *
   * @param startTime - Start timestamp (inclusive)
   * @param endTime - End timestamp (inclusive)
   * @returns Array of envelopes
   */
  getEnvelopesInRange(startTime: number, endTime: number): ProofEnvelope[] {
    return this.chain.filter(e => e.timestamp >= startTime && e.timestamp <= endTime);
  }

  // ============================================================================
  // Export/Import
  // ============================================================================

  /**
   * Export the chain
   *
   * @param format - Export format ('json' or 'binary')
   * @returns Exported chain data
   */
  exportChain(format: 'json' | 'binary'): string | Uint8Array {
    const exportData = {
      version: 1,
      exportedAt: Date.now(),
      chainLength: this.chain.length,
      merkleRoot: this.computeMerkleRoot(),
      envelopes: this.chain,
    };

    if (format === 'json') {
      return JSON.stringify(exportData, null, 2);
    }

    // Binary format: UTF-8 encoded JSON
    const jsonStr = JSON.stringify(exportData);
    const encoder = new TextEncoder();
    return encoder.encode(jsonStr);
  }

  /**
   * Import a chain
   *
   * @param data - Chain data to import
   * @param verifyOnImport - Whether to verify the chain after import
   * @throws Error if import fails or verification fails
   */
  importChain(data: string | Uint8Array, verifyOnImport: boolean = true): void {
    let jsonStr: string;

    if (typeof data === 'string') {
      jsonStr = data;
    } else {
      const decoder = new TextDecoder();
      jsonStr = decoder.decode(data);
    }

    const importData = safeJsonParse<Record<string, unknown>>(jsonStr);

    if (!importData.envelopes || !Array.isArray(importData.envelopes)) {
      throw new Error('Invalid chain data: missing envelopes array');
    }

    // Clear existing chain
    this.clearChain();

    // Import envelopes
    for (const envelope of importData.envelopes) {
      const index = this.chain.length;
      this.chain.push(envelope);
      this.envelopeIndex.set(envelope.id, index);
    }

    // Verify if requested
    if (verifyOnImport) {
      const verification = this.verifyChain();
      if (!verification.valid) {
        this.clearChain();
        throw new Error(
          `Imported chain failed verification: ${verification.errors[0]?.error}`
        );
      }
    }
  }

  // ============================================================================
  // Statistics
  // ============================================================================

  /**
   * Get chain statistics
   */
  getProofStats(): ProofStats {
    const actionCounts: Record<string, number> = {};
    const agents = new Set<string>();

    for (const envelope of this.chain) {
      agents.add(envelope.agentId);
      actionCounts[envelope.action] = (actionCounts[envelope.action] || 0) + 1;
    }

    const chainValid = this.chain.length === 0 || this.verifyChain().valid;

    return {
      chainLength: this.chain.length,
      firstTimestamp: this.chain.length > 0 ? this.chain[0].timestamp : null,
      lastTimestamp: this.chain.length > 0 ? this.chain[this.chain.length - 1].timestamp : null,
      uniqueAgents: Array.from(agents),
      actionCounts,
      merkleRoot: this.computeMerkleRoot(),
      chainValid,
    };
  }

  // ============================================================================
  // Merkle Tree
  // ============================================================================

  /**
   * Compute the Merkle root of the chain
   *
   * @returns Merkle root hash
   */
  computeMerkleRoot(): string {
    if (this.chain.length === 0) {
      return GENESIS_HASH;
    }

    // Get all content hashes as leaves
    let hashes = this.chain.map(e => e.contentHash);

    // Build Merkle tree
    while (hashes.length > 1) {
      const nextLevel: string[] = [];

      for (let i = 0; i < hashes.length; i += 2) {
        if (i + 1 < hashes.length) {
          // Hash pair
          nextLevel.push(this.kernel.hash(hashes[i] + hashes[i + 1]));
        } else {
          // Odd number - promote single hash
          nextLevel.push(hashes[i]);
        }
      }

      hashes = nextLevel;
    }

    return hashes[0];
  }

  /**
   * Get Merkle proof for an envelope
   *
   * @param envelopeId - Envelope ID
   * @returns Merkle proof (array of sibling hashes) or null if not found
   */
  getMerkleProof(envelopeId: string): string[] | null {
    const index = this.envelopeIndex.get(envelopeId);
    if (index === undefined) return null;

    const proof: string[] = [];
    let hashes = this.chain.map(e => e.contentHash);
    let idx = index;

    while (hashes.length > 1) {
      const siblingIndex = idx % 2 === 0 ? idx + 1 : idx - 1;

      if (siblingIndex < hashes.length) {
        proof.push(hashes[siblingIndex]);
      }

      // Build next level
      const nextLevel: string[] = [];
      for (let i = 0; i < hashes.length; i += 2) {
        if (i + 1 < hashes.length) {
          nextLevel.push(this.kernel.hash(hashes[i] + hashes[i + 1]));
        } else {
          nextLevel.push(hashes[i]);
        }
      }

      hashes = nextLevel;
      idx = Math.floor(idx / 2);
    }

    return proof;
  }

  /**
   * Verify a Merkle proof
   *
   * @param contentHash - Content hash of the envelope
   * @param proof - Merkle proof
   * @param index - Index of the envelope in the chain
   * @returns True if proof is valid
   */
  verifyMerkleProof(contentHash: string, proof: string[], index: number): boolean {
    let hash = contentHash;
    let idx = index;

    for (const sibling of proof) {
      if (idx % 2 === 0) {
        hash = this.kernel.hash(hash + sibling);
      } else {
        hash = this.kernel.hash(sibling + hash);
      }
      idx = Math.floor(idx / 2);
    }

    return hash === this.computeMerkleRoot();
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Generate a unique envelope ID
   */
  private generateEnvelopeId(): string {
    return `env_${randomUUID()}`;
  }

  /**
   * Reset the integration (for testing)
   */
  reset(): void {
    this.chain = [];
    this.envelopeIndex.clear();
    this.signingKey = '';
    this.initialized = false;
  }
}

/**
 * Singleton instance
 */
export const proofEnvelopeIntegration = new ProofEnvelopeIntegration();

/**
 * Factory function for creating new instances
 *
 * @param kernel - Optional WASM kernel integration
 * @returns New ProofEnvelopeIntegration instance
 */
export function createProofEnvelopeIntegration(
  kernel?: WasmKernelIntegration
): ProofEnvelopeIntegration {
  return new ProofEnvelopeIntegration(kernel);
}

/**
 * Helper to check if proof envelopes are required for claims
 */
export function isProofRequiredForClaims(): boolean {
  return governanceFlags.getFlags().proofEnvelope.requireProofForClaims;
}
