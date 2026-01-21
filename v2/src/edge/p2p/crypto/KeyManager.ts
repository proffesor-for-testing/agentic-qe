/**
 * Key Manager - Secure Key Storage with Encryption at Rest
 *
 * Provides secure storage for Ed25519 identity keys using IndexedDB.
 * All private keys are encrypted with AES-GCM before storage.
 *
 * Features:
 * - Secure key storage in IndexedDB
 * - Key rotation with proof of ownership
 * - Key revocation mechanism
 * - Export/import functionality
 * - Auto-lock timeout
 *
 * @module edge/p2p/crypto/KeyManager
 * @version 1.0.0
 */

import type {
  StoredIdentity,
  KeyPair,
  KeyStorageConfig,
  KeyRotationEvent,
  IdentityExport,
} from './types';
import { CryptoError, CryptoErrorCode } from './types';
import { IdentityManager, base64Utils } from './Identity';

/**
 * Default key storage configuration
 */
const DEFAULT_CONFIG: Required<KeyStorageConfig> = {
  dbName: 'agentic-qe-keystore',
  storeName: 'identities',
  autoLockTimeout: 0, // Disabled by default
};

/**
 * KeyManager - Secure storage and management of cryptographic identities
 *
 * @example
 * ```typescript
 * const keyManager = new KeyManager();
 * await keyManager.initialize();
 *
 * // Store identity
 * const identity = await IdentityManager.create({ password: 'secret' });
 * await keyManager.store(identity);
 *
 * // Retrieve and unlock
 * const stored = await keyManager.get(identity.agentId);
 * const keyPair = await keyManager.unlock(identity.agentId, 'secret');
 * ```
 */
export class KeyManager {
  private config: Required<KeyStorageConfig>;
  private db: IDBDatabase | null = null;
  private initialized: boolean = false;
  private unlockedKeys: Map<string, KeyPair> = new Map();
  private lockTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  constructor(config: KeyStorageConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize the key storage
   */
  async initialize(): Promise<void> {
    if (this.initialized && this.db) {
      return;
    }

    if (!this.isAvailable()) {
      throw new CryptoError(
        'IndexedDB is not available',
        CryptoErrorCode.STORAGE_ERROR
      );
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.config.dbName, 1);

      request.onerror = () => {
        reject(
          new CryptoError(
            `Failed to open key storage: ${request.error?.message}`,
            CryptoErrorCode.STORAGE_ERROR
          )
        );
      };

      request.onsuccess = () => {
        this.db = request.result;
        this.initialized = true;

        this.db.onerror = (event) => {
          console.error('[KeyManager] Database error:', event);
        };

        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        this.createObjectStores(db);
      };
    });
  }

  /**
   * Create object stores for identity storage
   */
  private createObjectStores(db: IDBDatabase): void {
    // Main identity store
    if (!db.objectStoreNames.contains(this.config.storeName)) {
      const store = db.createObjectStore(this.config.storeName, {
        keyPath: 'agentId',
      });

      // Indexes for querying
      store.createIndex('publicKey', 'publicKey', { unique: true });
      store.createIndex('createdAt', 'createdAt', { unique: false });
      store.createIndex('revoked', 'revoked', { unique: false });
    }

    // Key rotation audit log
    if (!db.objectStoreNames.contains('rotation-log')) {
      const rotationStore = db.createObjectStore('rotation-log', {
        keyPath: 'id',
        autoIncrement: true,
      });

      rotationStore.createIndex('agentId', 'agentId', { unique: false });
      rotationStore.createIndex('rotatedAt', 'rotatedAt', { unique: false });
    }
  }

  /**
   * Store a new identity
   *
   * @param identity - The stored identity to persist
   */
  async store(identity: StoredIdentity): Promise<void> {
    this.ensureInitialized();

    // Check if identity already exists
    const existing = await this.get(identity.agentId);
    if (existing) {
      throw new CryptoError(
        `Identity ${identity.agentId} already exists`,
        CryptoErrorCode.STORAGE_ERROR
      );
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(this.config.storeName, 'readwrite');
      const store = transaction.objectStore(this.config.storeName);

      const request = store.add(identity);

      request.onerror = () => {
        reject(
          new CryptoError(
            `Failed to store identity: ${request.error?.message}`,
            CryptoErrorCode.STORAGE_ERROR
          )
        );
      };

      request.onsuccess = () => {
        resolve();
      };
    });
  }

  /**
   * Get a stored identity by agent ID
   *
   * @param agentId - The agent ID to look up
   * @returns StoredIdentity or null if not found
   */
  async get(agentId: string): Promise<StoredIdentity | null> {
    this.ensureInitialized();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(this.config.storeName, 'readonly');
      const store = transaction.objectStore(this.config.storeName);
      const request = store.get(agentId);

      request.onerror = () => {
        reject(
          new CryptoError(
            `Failed to get identity: ${request.error?.message}`,
            CryptoErrorCode.STORAGE_ERROR
          )
        );
      };

      request.onsuccess = () => {
        resolve(request.result || null);
      };
    });
  }

  /**
   * Get identity by public key
   *
   * @param publicKey - Base64-encoded public key
   * @returns StoredIdentity or null
   */
  async getByPublicKey(publicKey: string): Promise<StoredIdentity | null> {
    this.ensureInitialized();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(this.config.storeName, 'readonly');
      const store = transaction.objectStore(this.config.storeName);
      const index = store.index('publicKey');
      const request = index.get(publicKey);

      request.onerror = () => {
        reject(
          new CryptoError(
            `Failed to get identity by public key: ${request.error?.message}`,
            CryptoErrorCode.STORAGE_ERROR
          )
        );
      };

      request.onsuccess = () => {
        resolve(request.result || null);
      };
    });
  }

  /**
   * List all stored identities
   *
   * @param includeRevoked - Whether to include revoked identities
   * @returns Array of stored identities
   */
  async list(includeRevoked: boolean = false): Promise<StoredIdentity[]> {
    this.ensureInitialized();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(this.config.storeName, 'readonly');
      const store = transaction.objectStore(this.config.storeName);
      const request = store.getAll();

      request.onerror = () => {
        reject(
          new CryptoError(
            `Failed to list identities: ${request.error?.message}`,
            CryptoErrorCode.STORAGE_ERROR
          )
        );
      };

      request.onsuccess = () => {
        const identities = request.result as StoredIdentity[];
        if (includeRevoked) {
          resolve(identities);
        } else {
          resolve(identities.filter((id) => !id.revoked));
        }
      };
    });
  }

  /**
   * Unlock an identity's private key
   *
   * @param agentId - Agent ID to unlock
   * @param password - Password for decryption
   * @returns Decrypted keypair
   */
  async unlock(agentId: string, password: string): Promise<KeyPair> {
    const identity = await this.get(agentId);

    if (!identity) {
      throw new CryptoError(
        `Identity ${agentId} not found`,
        CryptoErrorCode.KEY_NOT_FOUND
      );
    }

    if (identity.revoked) {
      throw new CryptoError(
        `Identity ${agentId} has been revoked`,
        CryptoErrorCode.KEY_REVOKED,
        { revokedAt: identity.revokedAt, reason: identity.revocationReason }
      );
    }

    // Check if already unlocked
    const cached = this.unlockedKeys.get(agentId);
    if (cached) {
      this.resetAutoLock(agentId);
      return cached;
    }

    // Decrypt private key
    const keyPair = await IdentityManager.decryptPrivateKey(identity, password);

    // Cache unlocked key
    this.unlockedKeys.set(agentId, keyPair);

    // Set up auto-lock if configured
    if (this.config.autoLockTimeout > 0) {
      this.setAutoLock(agentId);
    }

    return keyPair;
  }

  /**
   * Lock a previously unlocked identity
   *
   * @param agentId - Agent ID to lock
   */
  lock(agentId: string): void {
    this.unlockedKeys.delete(agentId);
    this.clearAutoLock(agentId);
  }

  /**
   * Lock all unlocked identities
   */
  lockAll(): void {
    this.unlockedKeys.clear();
    this.lockTimers.forEach((timer) => clearTimeout(timer));
    this.lockTimers.clear();
  }

  /**
   * Check if an identity is currently unlocked
   *
   * @param agentId - Agent ID to check
   * @returns true if unlocked
   */
  isUnlocked(agentId: string): boolean {
    return this.unlockedKeys.has(agentId);
  }

  /**
   * Get unlocked keypair (throws if locked)
   *
   * @param agentId - Agent ID
   * @returns KeyPair if unlocked
   */
  getUnlocked(agentId: string): KeyPair {
    const keyPair = this.unlockedKeys.get(agentId);
    if (!keyPair) {
      throw new CryptoError(
        `Identity ${agentId} is locked`,
        CryptoErrorCode.KEY_LOCKED
      );
    }
    this.resetAutoLock(agentId);
    return keyPair;
  }

  /**
   * Rotate keys for an identity
   *
   * @param agentId - Agent ID to rotate
   * @param currentPassword - Current password
   * @param newPassword - New password for encrypted storage
   * @param reason - Optional reason for rotation
   * @returns Updated stored identity
   */
  async rotateKeys(
    agentId: string,
    currentPassword: string,
    newPassword: string,
    reason?: string
  ): Promise<StoredIdentity> {
    const identity = await this.get(agentId);

    if (!identity) {
      throw new CryptoError(
        `Identity ${agentId} not found`,
        CryptoErrorCode.KEY_NOT_FOUND
      );
    }

    if (identity.revoked) {
      throw new CryptoError(
        `Cannot rotate keys for revoked identity`,
        CryptoErrorCode.KEY_REVOKED
      );
    }

    // Decrypt current private key to prove ownership
    const oldKeyPair = await IdentityManager.decryptPrivateKey(
      identity,
      currentPassword
    );

    // Generate new keypair
    const newIdentity = await IdentityManager.create({
      password: newPassword,
      displayName: identity.displayName,
      metadata: identity.metadata,
    });

    // Create rotation proof (sign new public key with old private key)
    const rotationProof = await this.createRotationProof(
      oldKeyPair,
      newIdentity.publicKey
    );

    // Log rotation event
    const rotationEvent: KeyRotationEvent = {
      agentId,
      previousPublicKey: identity.publicKey,
      newPublicKey: newIdentity.publicKey,
      rotationProof,
      rotatedAt: new Date().toISOString(),
      reason,
    };

    // Update identity with new keys but preserve agent ID and creation time
    const updatedIdentity: StoredIdentity = {
      ...newIdentity,
      agentId: identity.agentId, // Keep original agent ID
      createdAt: identity.createdAt, // Keep original creation time
      lastRotatedAt: rotationEvent.rotatedAt,
    };

    // Store updated identity and rotation log in transaction
    await this.updateWithRotation(updatedIdentity, rotationEvent);

    // Clear cached unlocked key
    this.lock(agentId);

    return updatedIdentity;
  }

  /**
   * Revoke an identity
   *
   * @param agentId - Agent ID to revoke
   * @param password - Password to prove ownership
   * @param reason - Reason for revocation
   */
  async revoke(agentId: string, password: string, reason: string): Promise<void> {
    const identity = await this.get(agentId);

    if (!identity) {
      throw new CryptoError(
        `Identity ${agentId} not found`,
        CryptoErrorCode.KEY_NOT_FOUND
      );
    }

    if (identity.revoked) {
      throw new CryptoError(
        `Identity ${agentId} is already revoked`,
        CryptoErrorCode.KEY_REVOKED
      );
    }

    // Verify ownership by decrypting
    await IdentityManager.decryptPrivateKey(identity, password);

    // Mark as revoked
    const revokedIdentity: StoredIdentity = {
      ...identity,
      revoked: true,
      revokedAt: new Date().toISOString(),
      revocationReason: reason,
    };

    await this.update(revokedIdentity);

    // Lock the key
    this.lock(agentId);
  }

  /**
   * Export identity for backup
   *
   * @param agentId - Agent ID to export
   * @returns Encrypted export
   */
  async export(agentId: string): Promise<IdentityExport> {
    const identity = await this.get(agentId);

    if (!identity) {
      throw new CryptoError(
        `Identity ${agentId} not found`,
        CryptoErrorCode.KEY_NOT_FOUND
      );
    }

    return IdentityManager.exportIdentity(identity);
  }

  /**
   * Import identity from backup
   *
   * @param exported - Exported identity data
   * @param overwrite - Whether to overwrite existing identity
   */
  async import(exported: IdentityExport, overwrite: boolean = false): Promise<StoredIdentity> {
    const identity = await IdentityManager.importIdentity(exported);

    const existing = await this.get(identity.agentId);
    if (existing && !overwrite) {
      throw new CryptoError(
        `Identity ${identity.agentId} already exists`,
        CryptoErrorCode.STORAGE_ERROR
      );
    }

    if (existing) {
      await this.update(identity);
    } else {
      await this.store(identity);
    }

    return identity;
  }

  /**
   * Delete an identity permanently
   *
   * @param agentId - Agent ID to delete
   * @param password - Password to prove ownership
   */
  async delete(agentId: string, password: string): Promise<void> {
    const identity = await this.get(agentId);

    if (!identity) {
      throw new CryptoError(
        `Identity ${agentId} not found`,
        CryptoErrorCode.KEY_NOT_FOUND
      );
    }

    // Verify ownership
    await IdentityManager.decryptPrivateKey(identity, password);

    // Lock and delete
    this.lock(agentId);

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(this.config.storeName, 'readwrite');
      const store = transaction.objectStore(this.config.storeName);
      const request = store.delete(agentId);

      request.onerror = () => {
        reject(
          new CryptoError(
            `Failed to delete identity: ${request.error?.message}`,
            CryptoErrorCode.STORAGE_ERROR
          )
        );
      };

      request.onsuccess = () => {
        resolve();
      };
    });
  }

  /**
   * Get key rotation history for an identity
   *
   * @param agentId - Agent ID
   * @returns Array of rotation events
   */
  async getRotationHistory(agentId: string): Promise<KeyRotationEvent[]> {
    this.ensureInitialized();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction('rotation-log', 'readonly');
      const store = transaction.objectStore('rotation-log');
      const index = store.index('agentId');
      const request = index.getAll(agentId);

      request.onerror = () => {
        reject(
          new CryptoError(
            `Failed to get rotation history: ${request.error?.message}`,
            CryptoErrorCode.STORAGE_ERROR
          )
        );
      };

      request.onsuccess = () => {
        resolve(request.result || []);
      };
    });
  }

  /**
   * Close the key storage
   */
  async close(): Promise<void> {
    this.lockAll();

    if (this.db) {
      this.db.close();
      this.db = null;
      this.initialized = false;
    }
  }

  /**
   * Check if storage is available
   */
  isAvailable(): boolean {
    try {
      return typeof indexedDB !== 'undefined' && indexedDB !== null;
    } catch {
      return false;
    }
  }

  // ==========================================
  // Private Helper Methods
  // ==========================================

  /**
   * Ensure database is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized || !this.db) {
      throw new CryptoError(
        'KeyManager not initialized. Call initialize() first.',
        CryptoErrorCode.STORAGE_ERROR
      );
    }
  }

  /**
   * Update an existing identity
   */
  private async update(identity: StoredIdentity): Promise<void> {
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(this.config.storeName, 'readwrite');
      const store = transaction.objectStore(this.config.storeName);
      const request = store.put(identity);

      request.onerror = () => {
        reject(
          new CryptoError(
            `Failed to update identity: ${request.error?.message}`,
            CryptoErrorCode.STORAGE_ERROR
          )
        );
      };

      request.onsuccess = () => {
        resolve();
      };
    });
  }

  /**
   * Update identity with rotation log in single transaction
   */
  private async updateWithRotation(
    identity: StoredIdentity,
    rotationEvent: KeyRotationEvent
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        [this.config.storeName, 'rotation-log'],
        'readwrite'
      );

      const identityStore = transaction.objectStore(this.config.storeName);
      const rotationStore = transaction.objectStore('rotation-log');

      const identityRequest = identityStore.put(identity);
      const rotationRequest = rotationStore.add(rotationEvent);

      let completed = 0;
      let hasError = false;

      const checkComplete = () => {
        completed++;
        if (completed === 2 && !hasError) {
          // Both operations complete
        }
      };

      identityRequest.onerror = () => {
        if (!hasError) {
          hasError = true;
          reject(
            new CryptoError(
              `Failed to update identity: ${identityRequest.error?.message}`,
              CryptoErrorCode.STORAGE_ERROR
            )
          );
        }
      };
      identityRequest.onsuccess = checkComplete;

      rotationRequest.onerror = () => {
        if (!hasError) {
          hasError = true;
          reject(
            new CryptoError(
              `Failed to log rotation: ${rotationRequest.error?.message}`,
              CryptoErrorCode.STORAGE_ERROR
            )
          );
        }
      };
      rotationRequest.onsuccess = checkComplete;

      transaction.oncomplete = () => {
        if (!hasError) {
          resolve();
        }
      };
    });
  }

  /**
   * Create rotation proof by signing new public key with old private key
   */
  private async createRotationProof(
    oldKeyPair: KeyPair,
    newPublicKey: string
  ): Promise<string> {
    // Create rotation message
    const message = `rotate:${oldKeyPair.publicKey}:${newPublicKey}:${Date.now()}`;
    const encoder = new TextEncoder();
    const data = encoder.encode(message);

    // Sign with old private key (simplified - in production use proper Ed25519)
    const privateKey = base64Utils.decode(oldKeyPair.privateKey);
    const combined = new Uint8Array(data.length + privateKey.length);
    combined.set(data);
    combined.set(privateKey.slice(0, 32), data.length);

    const signatureBuffer = await crypto.subtle.digest('SHA-256', combined);
    return base64Utils.encode(new Uint8Array(signatureBuffer));
  }

  /**
   * Set auto-lock timer for an identity
   */
  private setAutoLock(agentId: string): void {
    this.clearAutoLock(agentId);

    const timer = setTimeout(() => {
      this.lock(agentId);
    }, this.config.autoLockTimeout);

    this.lockTimers.set(agentId, timer);
  }

  /**
   * Clear auto-lock timer
   */
  private clearAutoLock(agentId: string): void {
    const timer = this.lockTimers.get(agentId);
    if (timer) {
      clearTimeout(timer);
      this.lockTimers.delete(agentId);
    }
  }

  /**
   * Reset auto-lock timer (on activity)
   */
  private resetAutoLock(agentId: string): void {
    if (this.config.autoLockTimeout > 0 && this.unlockedKeys.has(agentId)) {
      this.setAutoLock(agentId);
    }
  }

  /**
   * Delete all data (for testing)
   */
  static async deleteDatabase(dbName: string = DEFAULT_CONFIG.dbName): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(dbName);

      request.onerror = () => {
        reject(
          new CryptoError(
            `Failed to delete database: ${request.error?.message}`,
            CryptoErrorCode.STORAGE_ERROR
          )
        );
      };

      request.onsuccess = () => {
        resolve();
      };
    });
  }
}
