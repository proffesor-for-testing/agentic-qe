/**
 * Witness Key Manager - Ed25519 Signing for Witness Chain
 * ADR-070: Witness Chain Audit Compliance (Phase 6.2)
 *
 * Manages Ed25519 key pairs for cryptographic signing of witness chain entries.
 * Keys are stored in-memory with support for rotation.
 * Uses Node.js built-in crypto — no native dependencies required.
 */

import {
  generateKeyPairSync,
  createPrivateKey,
  createPublicKey,
  sign,
  verify,
  createHash,
  type KeyObject,
} from 'crypto';
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';

// ============================================================================
// Types
// ============================================================================

export interface KeyPairRecord {
  keyId: string;
  publicKey: KeyObject;
  privateKey: KeyObject;
  createdAt: string;
  retired: boolean;
}

export interface SignResult {
  signature: Buffer;
  keyId: string;
}

export interface WitnessKeyManagerOptions {
  /** Auto-generate an initial key pair on construction. Default: true */
  autoGenerate?: boolean;
  /** Directory path for persisting keys as PEM files. If provided, keys are saved/loaded automatically. */
  keyDir?: string;
}

// ============================================================================
// WitnessKeyManager Implementation
// ============================================================================

/**
 * Manages Ed25519 key pairs for witness chain entry signing.
 *
 * Features:
 * - Generate Ed25519 key pairs using Node.js crypto
 * - Sign arbitrary data with the active key
 * - Verify signatures against any known key
 * - Rotate keys (retire old, generate new)
 */
export class WitnessKeyManager {
  private keys: Map<string, KeyPairRecord> = new Map();
  private activeKeyId: string | null = null;
  private readonly keyDir: string | null;

  constructor(options: WitnessKeyManagerOptions = {}) {
    this.keyDir = options.keyDir ?? null;

    // Try loading persisted keys first
    if (this.keyDir) {
      this.loadFromDisk();
    }

    // Auto-generate only if no keys were loaded
    const autoGenerate = options.autoGenerate !== false;
    if (autoGenerate && this.keys.size === 0) {
      this.generateKeyPair();
    }
  }

  /**
   * Generate a new Ed25519 key pair and set it as the active signing key.
   *
   * @returns The key ID (hex digest of public key) and the public key buffer
   */
  generateKeyPair(): { keyId: string; publicKey: Buffer } {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');

    const pubDer = publicKey.export({ type: 'spki', format: 'der' });
    const keyId = createHash('sha256').update(pubDer).digest('hex').slice(0, 16);

    const record: KeyPairRecord = {
      keyId,
      publicKey,
      privateKey,
      createdAt: new Date().toISOString(),
      retired: false,
    };

    this.keys.set(keyId, record);
    this.activeKeyId = keyId;

    // Persist to disk if keyDir is configured
    if (this.keyDir) {
      this.saveKeyPairToDisk(record);
      this.saveActiveKeyId();
    }

    return { keyId, publicKey: pubDer };
  }

  /**
   * Sign data using the active key (or a specific key by ID).
   *
   * @param data - The data to sign
   * @param keyId - Optional specific key ID to use. Defaults to active key.
   * @returns The signature buffer and the key ID used
   * @throws Error if the key is not found or no active key exists
   */
  sign(data: Buffer, keyId?: string): SignResult {
    const targetKeyId = keyId ?? this.activeKeyId;
    if (!targetKeyId) {
      throw new Error('No active key available for signing');
    }

    const record = this.keys.get(targetKeyId);
    if (!record) {
      throw new Error(`Key not found: ${targetKeyId}`);
    }

    const signature = sign(null, data, record.privateKey);
    return { signature, keyId: targetKeyId };
  }

  /**
   * Verify a signature against a known public key.
   *
   * @param data - The original data that was signed
   * @param signature - The signature to verify
   * @param keyId - The key ID that was used for signing
   * @returns true if the signature is valid, false otherwise
   */
  verify(data: Buffer, signature: Buffer, keyId: string): boolean {
    const record = this.keys.get(keyId);
    if (!record) {
      return false;
    }

    try {
      return verify(null, data, record.publicKey, signature);
    } catch {
      return false;
    }
  }

  /**
   * Rotate the active key: retire the current key and generate a new one.
   *
   * @returns The old key ID and the new key ID
   * @throws Error if no active key exists to rotate
   */
  rotateKey(): { oldKeyId: string; newKeyId: string } {
    const oldKeyId = this.activeKeyId;
    if (!oldKeyId) {
      throw new Error('No active key to rotate');
    }

    const oldRecord = this.keys.get(oldKeyId);
    if (oldRecord) {
      oldRecord.retired = true;
      // Persist retired status
      if (this.keyDir) this.saveKeyPairToDisk(oldRecord);
    }

    const { keyId: newKeyId } = this.generateKeyPair();

    return { oldKeyId, newKeyId };
  }

  /**
   * Get the ID of the currently active signing key.
   *
   * @returns The active key ID
   * @throws Error if no active key exists
   */
  getActiveKeyId(): string {
    if (!this.activeKeyId) {
      throw new Error('No active key');
    }
    return this.activeKeyId;
  }

  /**
   * Check if a key ID is known to this manager.
   */
  hasKey(keyId: string): boolean {
    return this.keys.has(keyId);
  }

  /**
   * Get the number of keys managed (including retired).
   */
  getKeyCount(): number {
    return this.keys.size;
  }

  // ==========================================================================
  // Disk Persistence (PEM files in keyDir)
  // ==========================================================================

  /** Save a single key pair as PEM files + metadata JSON. */
  private saveKeyPairToDisk(record: KeyPairRecord): void {
    if (!this.keyDir) return;
    if (!existsSync(this.keyDir)) mkdirSync(this.keyDir, { recursive: true });

    const prefix = join(this.keyDir, record.keyId);
    writeFileSync(`${prefix}.pub.pem`,
      record.publicKey.export({ type: 'spki', format: 'pem' }) as string, 'utf-8');
    writeFileSync(`${prefix}.key.pem`,
      record.privateKey.export({ type: 'pkcs8', format: 'pem' }) as string, { encoding: 'utf-8', mode: 0o600 });
    writeFileSync(`${prefix}.meta.json`, JSON.stringify({
      keyId: record.keyId,
      createdAt: record.createdAt,
      retired: record.retired,
    }), 'utf-8');
  }

  /** Save the active key ID pointer. */
  private saveActiveKeyId(): void {
    if (!this.keyDir || !this.activeKeyId) return;
    writeFileSync(join(this.keyDir, 'active-key-id'), this.activeKeyId, 'utf-8');
  }

  /** Load all key pairs from PEM files in keyDir. */
  private loadFromDisk(): void {
    if (!this.keyDir || !existsSync(this.keyDir)) return;

    const files = readdirSync(this.keyDir);
    const metaFiles = files.filter(f => f.endsWith('.meta.json'));

    for (const metaFile of metaFiles) {
      try {
        const meta = JSON.parse(readFileSync(join(this.keyDir, metaFile), 'utf-8')) as {
          keyId: string; createdAt: string; retired: boolean;
        };
        const prefix = join(this.keyDir, meta.keyId);
        const pubPem = readFileSync(`${prefix}.pub.pem`, 'utf-8');
        const keyPem = readFileSync(`${prefix}.key.pem`, 'utf-8');

        const record: KeyPairRecord = {
          keyId: meta.keyId,
          publicKey: createPublicKey(pubPem),
          privateKey: createPrivateKey(keyPem),
          createdAt: meta.createdAt,
          retired: meta.retired,
        };
        this.keys.set(meta.keyId, record);
      } catch {
        // Skip corrupt key files
      }
    }

    // Restore active key pointer
    const activeFile = join(this.keyDir, 'active-key-id');
    if (existsSync(activeFile)) {
      const storedId = readFileSync(activeFile, 'utf-8').trim();
      if (this.keys.has(storedId)) {
        this.activeKeyId = storedId;
      }
    }

    // Fallback: if no active key ID file, pick the newest non-retired key
    if (!this.activeKeyId) {
      const nonRetired = [...this.keys.values()]
        .filter(k => !k.retired)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      if (nonRetired.length > 0) {
        this.activeKeyId = nonRetired[0].keyId;
      }
    }
  }
}
