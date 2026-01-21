/**
 * P2P Cryptographic Identity Types
 *
 * Type definitions for Ed25519-based agent identity system.
 * All keys use Base64 encoding for safe storage and transmission.
 *
 * @module edge/p2p/crypto/types
 * @version 1.0.0
 */

/**
 * Ed25519 keypair for agent identity
 */
export interface KeyPair {
  /** Base64-encoded public key (32 bytes) */
  publicKey: string;
  /** Base64-encoded private key (64 bytes for Ed25519 seed+public) */
  privateKey: string;
}

/**
 * Encrypted keypair for secure storage
 * Private key is encrypted using AES-GCM with a derived key
 */
export interface EncryptedKeyPair {
  /** Base64-encoded public key (never encrypted) */
  publicKey: string;
  /** Base64-encoded encrypted private key */
  encryptedPrivateKey: string;
  /** Base64-encoded salt for key derivation */
  salt: string;
  /** Base64-encoded initialization vector */
  iv: string;
  /** Key derivation algorithm used */
  kdf: 'PBKDF2';
  /** Number of iterations for PBKDF2 */
  iterations: number;
}

/**
 * Agent identity derived from Ed25519 keypair
 */
export interface AgentIdentity {
  /** Unique agent identifier (first 16 chars of SHA-256 of public key) */
  agentId: string;
  /** Base64-encoded public key for signature verification */
  publicKey: string;
  /** ISO timestamp of identity creation */
  createdAt: string;
  /** Optional human-readable display name */
  displayName?: string;
  /** Optional identity metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Full identity including encrypted private key (for storage)
 */
export interface StoredIdentity extends AgentIdentity {
  /** Encrypted keypair for persistence */
  encryptedKeyPair: EncryptedKeyPair;
  /** Schema version for migration support */
  version: number;
  /** ISO timestamp of last key rotation */
  lastRotatedAt?: string;
  /** Whether this identity has been revoked */
  revoked: boolean;
  /** Revocation timestamp if revoked */
  revokedAt?: string;
  /** Reason for revocation */
  revocationReason?: string;
}

/**
 * Signed message structure
 */
export interface SignedMessage<T = unknown> {
  /** The signed payload */
  payload: T;
  /** Base64-encoded Ed25519 signature */
  signature: string;
  /** Base64-encoded public key of signer */
  signerPublicKey: string;
  /** Agent ID of signer (for quick lookup) */
  signerId: string;
  /** ISO timestamp when signed */
  signedAt: string;
  /** Optional nonce to prevent replay attacks */
  nonce?: string;
}

/**
 * Identity proof for verifying agent ownership
 * Used in P2P handshakes and authentication
 */
export interface IdentityProof {
  /** Agent ID being proven */
  agentId: string;
  /** Base64-encoded public key */
  publicKey: string;
  /** Challenge that was signed */
  challenge: string;
  /** Base64-encoded signature of challenge */
  signature: string;
  /** ISO timestamp when proof was created */
  timestamp: string;
  /** Proof expiration in milliseconds from timestamp */
  expiresIn: number;
}

/**
 * Key rotation event for audit trail
 */
export interface KeyRotationEvent {
  /** Agent ID */
  agentId: string;
  /** Previous public key (Base64) */
  previousPublicKey: string;
  /** New public key (Base64) */
  newPublicKey: string;
  /** Signature by old key proving ownership */
  rotationProof: string;
  /** ISO timestamp of rotation */
  rotatedAt: string;
  /** Optional reason for rotation */
  reason?: string;
}

/**
 * Identity export format (encrypted)
 */
export interface IdentityExport {
  /** Export format version */
  version: number;
  /** Export type identifier */
  type: 'agentic-qe-identity-export';
  /** The stored identity data */
  identity: StoredIdentity;
  /** Checksum for integrity verification */
  checksum: string;
  /** ISO timestamp of export */
  exportedAt: string;
}

/**
 * BIP39-style seed phrase for identity recovery
 */
export interface SeedPhrase {
  /** 12 or 24 word mnemonic */
  words: string[];
  /** Optional passphrase for additional security */
  passphrase?: string;
}

/**
 * Configuration for identity generation
 */
export interface IdentityConfig {
  /** Optional display name */
  displayName?: string;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
  /** Password for encrypting private key */
  password: string;
  /** PBKDF2 iterations (default: 100000) */
  iterations?: number;
}

/**
 * Configuration for key storage
 */
export interface KeyStorageConfig {
  /** IndexedDB database name */
  dbName?: string;
  /** IndexedDB store name */
  storeName?: string;
  /** Auto-lock timeout in milliseconds (0 = never) */
  autoLockTimeout?: number;
}

/**
 * Result of signature verification
 */
export interface VerificationResult {
  /** Whether signature is valid */
  valid: boolean;
  /** Signer's agent ID if valid */
  signerId?: string;
  /** Error message if invalid */
  error?: string;
}

/**
 * Batch verification result
 */
export interface BatchVerificationResult {
  /** Total messages verified */
  total: number;
  /** Number of valid signatures */
  valid: number;
  /** Number of invalid signatures */
  invalid: number;
  /** Individual results indexed by position */
  results: VerificationResult[];
}

/**
 * Error codes for crypto operations
 */
export enum CryptoErrorCode {
  INVALID_KEY = 'INVALID_KEY',
  INVALID_SIGNATURE = 'INVALID_SIGNATURE',
  INVALID_PASSWORD = 'INVALID_PASSWORD',
  KEY_NOT_FOUND = 'KEY_NOT_FOUND',
  KEY_LOCKED = 'KEY_LOCKED',
  KEY_REVOKED = 'KEY_REVOKED',
  DECRYPTION_FAILED = 'DECRYPTION_FAILED',
  STORAGE_ERROR = 'STORAGE_ERROR',
  SERIALIZATION_ERROR = 'SERIALIZATION_ERROR',
  EXPIRED_PROOF = 'EXPIRED_PROOF',
  INVALID_SEED = 'INVALID_SEED',
}

/**
 * Custom error class for crypto operations
 */
export class CryptoError extends Error {
  constructor(
    message: string,
    public readonly code: CryptoErrorCode,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'CryptoError';
  }
}
