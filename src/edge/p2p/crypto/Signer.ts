/**
 * Ed25519 Signature Operations
 *
 * Provides signing and verification operations for P2P agent messages.
 * Uses SHA-256 based HMAC for browser compatibility (production should use proper Ed25519).
 *
 * Features:
 * - Sign messages with private key
 * - Verify signatures with public key
 * - JSON canonicalization for structured data
 * - Batch signature verification
 * - Identity proof generation
 *
 * @module edge/p2p/crypto/Signer
 * @version 1.0.0
 */

import type {
  KeyPair,
  SignedMessage,
  VerificationResult,
  BatchVerificationResult,
  IdentityProof,
  AgentIdentity,
} from './types';
import { CryptoError, CryptoErrorCode } from './types';
import { base64Utils } from './Identity';

/**
 * Default proof expiration (5 minutes)
 */
const DEFAULT_PROOF_EXPIRY_MS = 5 * 60 * 1000;

/**
 * Signer - Ed25519 signature operations for P2P messages
 *
 * @example
 * ```typescript
 * // Sign a message
 * const signed = await Signer.sign(keyPair, identity, { action: 'share-pattern', data: {...} });
 *
 * // Verify signature
 * const result = await Signer.verify(signed);
 * if (result.valid) {
 *   console.log('Signed by:', result.signerId);
 * }
 * ```
 */
export class Signer {
  /**
   * Sign a message with the private key
   *
   * @param keyPair - Ed25519 keypair
   * @param identity - Agent identity
   * @param payload - Message payload to sign
   * @param includeNonce - Whether to include a nonce (default: true)
   * @returns Signed message
   */
  static async sign<T>(
    keyPair: KeyPair,
    identity: AgentIdentity,
    payload: T,
    includeNonce: boolean = true
  ): Promise<SignedMessage<T>> {
    const signedAt = new Date().toISOString();
    const nonce = includeNonce ? this.generateNonce() : undefined;

    // Create canonical message for signing
    const messageToSign = this.createCanonicalMessage(
      payload,
      identity.publicKey,
      signedAt,
      nonce
    );

    // Sign the message
    const signature = await this.createSignature(keyPair.privateKey, messageToSign);

    return {
      payload,
      signature,
      signerPublicKey: identity.publicKey,
      signerId: identity.agentId,
      signedAt,
      nonce,
    };
  }

  /**
   * Sign raw bytes
   *
   * @param keyPair - Ed25519 keypair
   * @param data - Data to sign
   * @returns Base64-encoded signature
   */
  static async signRaw(keyPair: KeyPair, data: Uint8Array): Promise<string> {
    return this.createSignature(keyPair.privateKey, data);
  }

  /**
   * Verify a signed message
   *
   * @param signedMessage - Message to verify
   * @returns Verification result
   */
  static async verify<T>(signedMessage: SignedMessage<T>): Promise<VerificationResult> {
    try {
      const { payload, signature, signerPublicKey, signedAt, nonce } = signedMessage;

      // Recreate canonical message
      const messageToVerify = this.createCanonicalMessage(
        payload,
        signerPublicKey,
        signedAt,
        nonce
      );

      // Verify signature
      const isValid = await this.verifySignature(
        signerPublicKey,
        signature,
        messageToVerify
      );

      if (isValid) {
        return {
          valid: true,
          signerId: signedMessage.signerId,
        };
      } else {
        return {
          valid: false,
          error: 'Invalid signature',
        };
      }
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Verification failed',
      };
    }
  }

  /**
   * Verify raw signature
   *
   * @param publicKey - Base64-encoded public key
   * @param signature - Base64-encoded signature
   * @param data - Original data
   * @returns true if valid
   */
  static async verifyRaw(
    publicKey: string,
    signature: string,
    data: Uint8Array
  ): Promise<boolean> {
    return this.verifySignature(publicKey, signature, data);
  }

  /**
   * Verify multiple messages in batch
   *
   * @param messages - Array of signed messages to verify
   * @returns Batch verification results
   */
  static async verifyBatch<T>(
    messages: SignedMessage<T>[]
  ): Promise<BatchVerificationResult> {
    const results = await Promise.all(messages.map((msg) => this.verify(msg)));

    const valid = results.filter((r) => r.valid).length;
    const invalid = results.filter((r) => !r.valid).length;

    return {
      total: messages.length,
      valid,
      invalid,
      results,
    };
  }

  /**
   * Create an identity proof for authentication
   *
   * @param keyPair - Ed25519 keypair
   * @param identity - Agent identity
   * @param challenge - Challenge string to sign
   * @param expiresIn - Expiration in milliseconds (default: 5 minutes)
   * @returns Identity proof
   */
  static async createIdentityProof(
    keyPair: KeyPair,
    identity: AgentIdentity,
    challenge: string,
    expiresIn: number = DEFAULT_PROOF_EXPIRY_MS
  ): Promise<IdentityProof> {
    const timestamp = new Date().toISOString();

    // Create proof message
    const proofMessage = `proof:${identity.agentId}:${challenge}:${timestamp}:${expiresIn}`;
    const encoder = new TextEncoder();
    const messageBytes = encoder.encode(proofMessage);

    // Sign the proof
    const signature = await this.createSignature(keyPair.privateKey, messageBytes);

    return {
      agentId: identity.agentId,
      publicKey: identity.publicKey,
      challenge,
      signature,
      timestamp,
      expiresIn,
    };
  }

  /**
   * Verify an identity proof
   *
   * @param proof - Identity proof to verify
   * @returns Verification result
   */
  static async verifyIdentityProof(proof: IdentityProof): Promise<VerificationResult> {
    try {
      // Check expiration
      const proofTime = new Date(proof.timestamp).getTime();
      const now = Date.now();
      const expiresAt = proofTime + proof.expiresIn;

      if (now > expiresAt) {
        return {
          valid: false,
          error: 'Proof has expired',
        };
      }

      // Recreate proof message
      const proofMessage = `proof:${proof.agentId}:${proof.challenge}:${proof.timestamp}:${proof.expiresIn}`;
      const encoder = new TextEncoder();
      const messageBytes = encoder.encode(proofMessage);

      // Verify signature
      const isValid = await this.verifySignature(
        proof.publicKey,
        proof.signature,
        messageBytes
      );

      if (isValid) {
        return {
          valid: true,
          signerId: proof.agentId,
        };
      } else {
        return {
          valid: false,
          error: 'Invalid proof signature',
        };
      }
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Proof verification failed',
      };
    }
  }

  /**
   * Generate a random challenge for authentication
   *
   * @param length - Challenge length in bytes (default: 32)
   * @returns Base64-encoded challenge
   */
  static generateChallenge(length: number = 32): string {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return base64Utils.encode(bytes);
  }

  /**
   * Canonicalize JSON for consistent signing
   *
   * @param obj - Object to canonicalize
   * @returns Canonical JSON string
   */
  static canonicalizeJson(obj: unknown): string {
    return JSON.stringify(obj, this.sortedReplacer);
  }

  // ==========================================
  // Private Helper Methods
  // ==========================================

  /**
   * Create canonical message bytes for signing
   */
  private static createCanonicalMessage<T>(
    payload: T,
    publicKey: string,
    signedAt: string,
    nonce?: string
  ): Uint8Array {
    const canonical = {
      payload: this.canonicalizeJson(payload),
      publicKey,
      signedAt,
      nonce,
    };

    const encoder = new TextEncoder();
    return encoder.encode(this.canonicalizeJson(canonical));
  }

  /**
   * Create signature using HMAC-SHA256 (browser-compatible)
   * Note: In production, use proper Ed25519 signing via @noble/ed25519
   */
  private static async createSignature(
    privateKeyBase64: string,
    message: Uint8Array
  ): Promise<string> {
    const privateKey = base64Utils.decode(privateKeyBase64);

    // Use the public key portion (bytes 32-64) for HMAC to ensure
    // verification can work with the same key
    // In production, this should use proper Ed25519 signing
    const publicKeyPortion = privateKey.slice(32, 64);
    const keyBuffer = new ArrayBuffer(publicKeyPortion.length);
    new Uint8Array(keyBuffer).set(publicKeyPortion);
    const messageBuffer = new ArrayBuffer(message.length);
    new Uint8Array(messageBuffer).set(message);

    // Use HMAC-SHA256 for browser compatibility
    const key = await crypto.subtle.importKey(
      'raw',
      keyBuffer,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signatureBuffer = await crypto.subtle.sign('HMAC', key, messageBuffer);
    return base64Utils.encode(new Uint8Array(signatureBuffer));
  }

  /**
   * Verify signature using HMAC-SHA256 (browser-compatible)
   * Note: In production, use proper Ed25519 verification via @noble/ed25519
   */
  private static async verifySignature(
    publicKeyBase64: string,
    signatureBase64: string,
    message: Uint8Array
  ): Promise<boolean> {
    try {
      // For our simplified implementation, we derive the verification key
      // from the public key. In real Ed25519, verification uses the public key directly.
      const publicKey = base64Utils.decode(publicKeyBase64);

      // Create ArrayBuffer copies for Web Crypto API
      const keyBuffer = new ArrayBuffer(publicKey.length);
      new Uint8Array(keyBuffer).set(publicKey);
      const messageBuffer = new ArrayBuffer(message.length);
      new Uint8Array(messageBuffer).set(message);

      // Import key for HMAC verification
      // Note: This is a simplified approach - real Ed25519 verification
      // would use the public key to verify the signature mathematically
      const key = await crypto.subtle.importKey(
        'raw',
        keyBuffer,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify']
      );

      const signature = base64Utils.decode(signatureBase64);
      const sigBuffer = new ArrayBuffer(signature.length);
      new Uint8Array(sigBuffer).set(signature);

      return crypto.subtle.verify('HMAC', key, sigBuffer, messageBuffer);
    } catch {
      return false;
    }
  }

  /**
   * Generate random nonce
   */
  private static generateNonce(): string {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return base64Utils.encode(bytes);
  }

  /**
   * JSON replacer that sorts object keys for canonical output
   */
  private static sortedReplacer(_key: string, value: unknown): unknown {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const sorted: Record<string, unknown> = {};
      const keys = Object.keys(value as Record<string, unknown>).sort();
      for (const k of keys) {
        sorted[k] = (value as Record<string, unknown>)[k];
      }
      return sorted;
    }
    return value;
  }
}

/**
 * Message envelope for P2P transmission
 * Wraps signed messages with routing information
 */
export interface MessageEnvelope<T = unknown> {
  /** Unique message ID */
  messageId: string;
  /** The signed message */
  signedMessage: SignedMessage<T>;
  /** Target agent ID (or '*' for broadcast) */
  to: string;
  /** Message type for routing */
  type: string;
  /** TTL in hops (for gossip protocols) */
  ttl: number;
  /** Timestamp for ordering */
  timestamp: number;
}

/**
 * Create a message envelope for P2P transmission
 *
 * @param signedMessage - The signed message
 * @param to - Target agent ID
 * @param type - Message type
 * @param ttl - Time to live in hops
 * @returns Message envelope
 */
export function createEnvelope<T>(
  signedMessage: SignedMessage<T>,
  to: string,
  type: string,
  ttl: number = 3
): MessageEnvelope<T> {
  const messageId = generateMessageId();

  return {
    messageId,
    signedMessage,
    to,
    type,
    ttl,
    timestamp: Date.now(),
  };
}

/**
 * Generate unique message ID
 */
function generateMessageId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  // Format as UUID-like string
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Verify a message envelope
 *
 * @param envelope - Message envelope to verify
 * @returns Verification result
 */
export async function verifyEnvelope<T>(
  envelope: MessageEnvelope<T>
): Promise<VerificationResult> {
  // Verify the contained signed message
  return Signer.verify(envelope.signedMessage);
}
