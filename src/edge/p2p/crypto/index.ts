/**
 * P2P Cryptographic Identity Module
 *
 * Ed25519-based cryptographic identity system for P2P agent communication.
 * Provides secure identity generation, key management, and message signing.
 *
 * @module edge/p2p/crypto
 * @version 1.0.0
 *
 * @example
 * ```typescript
 * import { IdentityManager, KeyManager, Signer } from './crypto';
 *
 * // Create new identity
 * const identity = await IdentityManager.create({
 *   displayName: 'My Agent',
 *   password: 'secure-password'
 * });
 *
 * // Store identity securely
 * const keyManager = new KeyManager();
 * await keyManager.initialize();
 * await keyManager.store(identity);
 *
 * // Sign messages
 * const keyPair = await keyManager.unlock(identity.agentId, 'secure-password');
 * const signed = await Signer.sign(keyPair, identity, { action: 'share-pattern' });
 *
 * // Verify signatures
 * const result = await Signer.verify(signed);
 * console.log('Valid:', result.valid);
 * ```
 */

// Types
export type {
  KeyPair,
  EncryptedKeyPair,
  AgentIdentity,
  StoredIdentity,
  SignedMessage,
  IdentityProof,
  KeyRotationEvent,
  IdentityExport,
  SeedPhrase,
  IdentityConfig,
  KeyStorageConfig,
  VerificationResult,
  BatchVerificationResult,
} from './types';

export { CryptoError, CryptoErrorCode } from './types';

// Identity Management
export { IdentityManager, base64Utils } from './Identity';

// Key Storage
export { KeyManager } from './KeyManager';

// Signing Operations
export {
  Signer,
  createEnvelope,
  verifyEnvelope,
  type MessageEnvelope,
} from './Signer';

/**
 * Convenience function to create a complete identity setup
 *
 * @param config - Identity configuration
 * @returns Object with identity and initialized key manager
 */
export async function createIdentityWithStorage(config: {
  displayName?: string;
  password: string;
  metadata?: Record<string, unknown>;
}): Promise<{
  identity: import('./types').StoredIdentity;
  keyManager: import('./KeyManager').KeyManager;
}> {
  const { IdentityManager } = await import('./Identity');
  const { KeyManager } = await import('./KeyManager');

  // Create identity
  const identity = await IdentityManager.create({
    displayName: config.displayName,
    password: config.password,
    metadata: config.metadata,
  });

  // Initialize storage
  const keyManager = new KeyManager();
  await keyManager.initialize();

  // Store identity
  await keyManager.store(identity);

  return { identity, keyManager };
}

/**
 * Quick sign helper - signs data with a stored identity
 *
 * @param keyManager - Initialized key manager
 * @param agentId - Agent ID to sign with
 * @param password - Password to unlock the key
 * @param payload - Data to sign
 * @returns Signed message
 */
export async function quickSign<T>(
  keyManager: import('./KeyManager').KeyManager,
  agentId: string,
  password: string,
  payload: T
): Promise<import('./types').SignedMessage<T>> {
  const { IdentityManager } = await import('./Identity');
  const { Signer } = await import('./Signer');

  // Get identity
  const storedIdentity = await keyManager.get(agentId);
  if (!storedIdentity) {
    throw new Error(`Identity ${agentId} not found`);
  }

  // Unlock and sign
  const keyPair = await keyManager.unlock(agentId, password);
  const publicIdentity = IdentityManager.getPublicIdentity(storedIdentity);

  return Signer.sign(keyPair, publicIdentity, payload);
}

/**
 * Version information
 */
export const CRYPTO_VERSION = '1.0.0';

/**
 * Module capabilities
 */
export const CRYPTO_CAPABILITIES = {
  /** Ed25519 key generation (browser-compatible) */
  keyGeneration: true,
  /** AES-GCM encryption for private keys */
  encryptionAtRest: true,
  /** PBKDF2 key derivation */
  keyDerivation: true,
  /** Seed phrase recovery */
  seedPhraseRecovery: true,
  /** IndexedDB key storage */
  persistentStorage: true,
  /** Key rotation support */
  keyRotation: true,
  /** Key revocation */
  keyRevocation: true,
  /** Batch signature verification */
  batchVerification: true,
  /** Identity proof generation */
  identityProofs: true,
};
