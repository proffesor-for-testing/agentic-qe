/**
 * P2P Cryptographic Identity System Tests
 *
 * Comprehensive tests for Ed25519-based identity, key management, and signing.
 *
 * @module tests/edge/p2p/crypto.test
 */

import {
  IdentityManager,
  KeyManager,
  Signer,
  CryptoError,
  CryptoErrorCode,
  base64Utils,
  createEnvelope,
  verifyEnvelope,
  CRYPTO_CAPABILITIES,
} from '../../../src/edge/p2p/crypto';

import type {
  StoredIdentity,
  SignedMessage,
  IdentityProof,
  SeedPhrase,
} from '../../../src/edge/p2p/crypto';

// Mock IndexedDB for Node.js environment
const mockIndexedDB = (() => {
  const databases = new Map<string, Map<string, Map<string, unknown>>>();

  return {
    open: (name: string, version?: number) => {
      const request = {
        result: null as unknown,
        error: null as Error | null,
        onsuccess: null as (() => void) | null,
        onerror: null as (() => void) | null,
        onupgradeneeded: null as ((event: unknown) => void) | null,
      };

      setTimeout(() => {
        if (!databases.has(name)) {
          databases.set(name, new Map());
        }

        const db = databases.get(name)!;

        const dbObject = {
          objectStoreNames: {
            contains: (storeName: string) => db.has(storeName),
          },
          createObjectStore: (storeName: string, _options?: unknown) => {
            if (!db.has(storeName)) {
              db.set(storeName, new Map());
            }
            return {
              createIndex: () => ({}),
            };
          },
          transaction: (storeNames: string | string[], _mode?: string) => {
            const names = Array.isArray(storeNames) ? storeNames : [storeNames];
            const txn = {
              objectStore: (name: string) => {
                const store = db.get(name) || new Map<string, unknown>();
                if (!db.has(name)) {
                  db.set(name, store);
                }
                return createMockStore(store, txn);
              },
              oncomplete: null as (() => void) | null,
              onerror: null as (() => void) | null,
            };
            return txn;
          },
          close: () => {},
          onerror: null as ((event: unknown) => void) | null,
        };

        request.result = dbObject;

        if (request.onupgradeneeded) {
          request.onupgradeneeded({ target: { result: dbObject } });
        }

        if (request.onsuccess) {
          request.onsuccess();
        }
      }, 0);

      return request;
    },
    deleteDatabase: (name: string) => {
      const request = {
        onsuccess: null as (() => void) | null,
        onerror: null as (() => void) | null,
        onblocked: null as (() => void) | null,
      };

      setTimeout(() => {
        databases.delete(name);
        if (request.onsuccess) {
          request.onsuccess();
        }
      }, 0);

      return request;
    },
  };
})();

function createMockStore(store: Map<string, unknown>, txn?: { oncomplete: (() => void) | null }) {
  return {
    put: (value: { agentId?: string; key?: string; id?: number }) => {
      const request = {
        result: null,
        error: null as Error | null,
        onsuccess: null as (() => void) | null,
        onerror: null as (() => void) | null,
      };

      setTimeout(() => {
        const key = value.agentId || value.key || value.id || String(store.size);
        store.set(String(key), value);
        if (request.onsuccess) {
          request.onsuccess();
        }
        // Trigger transaction oncomplete after operation
        setTimeout(() => {
          if (txn?.oncomplete) {
            txn.oncomplete();
          }
        }, 0);
      }, 0);

      return request;
    },
    add: (value: { agentId?: string; key?: string; id?: number }) => {
      const request = {
        result: null,
        error: null as Error | null,
        onsuccess: null as (() => void) | null,
        onerror: null as (() => void) | null,
      };

      setTimeout(() => {
        const key = value.agentId || value.key || String(store.size);
        if (store.has(String(key))) {
          request.error = new Error('Key already exists');
          if (request.onerror) {
            request.onerror();
          }
        } else {
          store.set(String(key), value);
          if (request.onsuccess) {
            request.onsuccess();
          }
        }
        // Trigger transaction oncomplete after operation
        setTimeout(() => {
          if (txn?.oncomplete) {
            txn.oncomplete();
          }
        }, 0);
      }, 0);

      return request;
    },
    get: (key: string) => {
      const request = {
        result: undefined as unknown,
        error: null as Error | null,
        onsuccess: null as (() => void) | null,
        onerror: null as (() => void) | null,
      };

      setTimeout(() => {
        request.result = store.get(String(key));
        if (request.onsuccess) {
          request.onsuccess();
        }
      }, 0);

      return request;
    },
    getAll: () => {
      const request = {
        result: [] as unknown[],
        error: null as Error | null,
        onsuccess: null as (() => void) | null,
        onerror: null as (() => void) | null,
      };

      setTimeout(() => {
        request.result = Array.from(store.values());
        if (request.onsuccess) {
          request.onsuccess();
        }
      }, 0);

      return request;
    },
    delete: (key: string) => {
      const request = {
        result: undefined,
        error: null as Error | null,
        onsuccess: null as (() => void) | null,
        onerror: null as (() => void) | null,
      };

      setTimeout(() => {
        store.delete(String(key));
        if (request.onsuccess) {
          request.onsuccess();
        }
      }, 0);

      return request;
    },
    index: (_name: string) => ({
      get: (key: string) => {
        const request = {
          result: undefined as unknown,
          error: null as Error | null,
          onsuccess: null as (() => void) | null,
          onerror: null as (() => void) | null,
        };

        setTimeout(() => {
          // Simple index lookup by iterating
          for (const value of store.values()) {
            const v = value as Record<string, unknown>;
            if (v.publicKey === key || v.agentId === key) {
              request.result = value;
              break;
            }
          }
          if (request.onsuccess) {
            request.onsuccess();
          }
        }, 0);

        return request;
      },
      getAll: (key?: string) => {
        const request = {
          result: [] as unknown[],
          error: null as Error | null,
          onsuccess: null as (() => void) | null,
          onerror: null as (() => void) | null,
        };

        setTimeout(() => {
          if (key) {
            request.result = Array.from(store.values()).filter(
              (v) => (v as Record<string, unknown>).agentId === key
            );
          } else {
            request.result = Array.from(store.values());
          }
          if (request.onsuccess) {
            request.onsuccess();
          }
        }, 0);

        return request;
      },
    }),
  };
}

// Setup global mocks
beforeAll(() => {
  // Mock indexedDB
  (global as unknown as { indexedDB: typeof mockIndexedDB }).indexedDB = mockIndexedDB;

  // Mock crypto.subtle if not available
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    const nodeCrypto = require('crypto');

    (global as unknown as { crypto: Crypto }).crypto = {
      getRandomValues: (array: Uint8Array) => {
        const randomBytes = nodeCrypto.randomBytes(array.length);
        array.set(randomBytes);
        return array;
      },
      randomUUID: () => nodeCrypto.randomUUID(),
      subtle: {
        digest: async (algorithm: string, data: ArrayBuffer) => {
          const hashName = algorithm.replace('-', '').toLowerCase();
          const hash = nodeCrypto.createHash(hashName);
          hash.update(Buffer.from(data));
          return hash.digest().buffer;
        },
        importKey: async (
          format: string,
          keyData: ArrayBuffer,
          algorithm: unknown,
          extractable: boolean,
          usages: string[]
        ) => {
          return {
            format,
            keyData: Buffer.from(keyData),
            algorithm,
            extractable,
            usages,
          };
        },
        deriveKey: async (
          algorithm: unknown,
          baseKey: unknown,
          derivedKeyAlgorithm: unknown,
          _extractable: boolean,
          _usages: string[]
        ) => {
          const algo = algorithm as { salt: ArrayBuffer; iterations: number };
          const key = baseKey as { keyData: Buffer };
          const derived = nodeCrypto.pbkdf2Sync(
            key.keyData,
            Buffer.from(algo.salt),
            algo.iterations,
            32,
            'sha256'
          );
          return {
            keyData: derived,
            algorithm: derivedKeyAlgorithm,
          };
        },
        deriveBits: async (
          algorithm: unknown,
          baseKey: unknown,
          length: number
        ) => {
          const algo = algorithm as { salt: ArrayBuffer; iterations: number };
          const key = baseKey as { keyData: Buffer };
          const derived = nodeCrypto.pbkdf2Sync(
            key.keyData,
            Buffer.from(algo.salt),
            algo.iterations,
            length / 8,
            'sha512'
          );
          return derived.buffer;
        },
        encrypt: async (
          algorithm: unknown,
          key: unknown,
          data: ArrayBuffer
        ) => {
          const algo = algorithm as { name: string; iv: ArrayBuffer };
          const k = key as { keyData: Buffer };
          const cipher = nodeCrypto.createCipheriv(
            'aes-256-gcm',
            k.keyData,
            Buffer.from(algo.iv)
          );
          const encrypted = Buffer.concat([
            cipher.update(Buffer.from(data)),
            cipher.final(),
            cipher.getAuthTag(),
          ]);
          return encrypted.buffer;
        },
        decrypt: async (
          algorithm: unknown,
          key: unknown,
          data: ArrayBuffer
        ) => {
          const algo = algorithm as { name: string; iv: ArrayBuffer };
          const k = key as { keyData: Buffer };
          const buf = Buffer.from(data);
          const authTag = buf.subarray(buf.length - 16);
          const encrypted = buf.subarray(0, buf.length - 16);
          const decipher = nodeCrypto.createDecipheriv(
            'aes-256-gcm',
            k.keyData,
            Buffer.from(algo.iv)
          );
          decipher.setAuthTag(authTag);
          const decrypted = Buffer.concat([
            decipher.update(encrypted),
            decipher.final(),
          ]);
          return decrypted.buffer;
        },
        sign: async (
          _algorithm: string,
          key: unknown,
          data: ArrayBuffer
        ) => {
          const k = key as { keyData: Buffer };
          const hmac = nodeCrypto.createHmac('sha256', k.keyData);
          hmac.update(Buffer.from(data));
          return hmac.digest().buffer;
        },
        verify: async (
          _algorithm: string,
          key: unknown,
          signature: ArrayBuffer,
          data: ArrayBuffer
        ) => {
          const k = key as { keyData: Buffer };
          const hmac = nodeCrypto.createHmac('sha256', k.keyData);
          hmac.update(Buffer.from(data));
          const expected = hmac.digest();
          const received = Buffer.from(signature);
          return expected.equals(received);
        },
      },
    } as unknown as Crypto;
  }

  // Mock btoa/atob for Node.js
  if (typeof btoa === 'undefined') {
    (global as unknown as { btoa: (s: string) => string }).btoa = (s: string) =>
      Buffer.from(s, 'binary').toString('base64');
  }
  if (typeof atob === 'undefined') {
    (global as unknown as { atob: (s: string) => string }).atob = (s: string) =>
      Buffer.from(s, 'base64').toString('binary');
  }
});

describe('P2P Crypto Module', () => {
  describe('IdentityManager', () => {
    const testPassword = 'test-password-123';

    describe('create()', () => {
      it('should generate a new identity with valid structure', async () => {
        const identity = await IdentityManager.create({
          password: testPassword,
          displayName: 'Test Agent',
        });

        // Check required fields
        expect(identity.agentId).toBeDefined();
        expect(identity.agentId).toHaveLength(16);
        expect(identity.publicKey).toBeDefined();
        expect(identity.createdAt).toBeDefined();
        expect(identity.displayName).toBe('Test Agent');
        expect(identity.version).toBe(1);
        expect(identity.revoked).toBe(false);

        // Check encrypted keypair
        expect(identity.encryptedKeyPair).toBeDefined();
        expect(identity.encryptedKeyPair.publicKey).toBe(identity.publicKey);
        expect(identity.encryptedKeyPair.encryptedPrivateKey).toBeDefined();
        expect(identity.encryptedKeyPair.salt).toBeDefined();
        expect(identity.encryptedKeyPair.iv).toBeDefined();
        expect(identity.encryptedKeyPair.kdf).toBe('PBKDF2');
      });

      it('should generate unique identities', async () => {
        const identity1 = await IdentityManager.create({ password: testPassword });
        const identity2 = await IdentityManager.create({ password: testPassword });

        expect(identity1.agentId).not.toBe(identity2.agentId);
        expect(identity1.publicKey).not.toBe(identity2.publicKey);
      });

      it('should include metadata in identity', async () => {
        const metadata = { role: 'validator', region: 'us-west' };
        const identity = await IdentityManager.create({
          password: testPassword,
          metadata,
        });

        expect(identity.metadata).toEqual(metadata);
      });
    });

    describe('decryptPrivateKey()', () => {
      it('should decrypt private key with correct password', async () => {
        const identity = await IdentityManager.create({ password: testPassword });
        const keyPair = await IdentityManager.decryptPrivateKey(identity, testPassword);

        expect(keyPair.publicKey).toBe(identity.publicKey);
        expect(keyPair.privateKey).toBeDefined();
        expect(keyPair.privateKey.length).toBeGreaterThan(0);
      });

      it('should reject incorrect password', async () => {
        const identity = await IdentityManager.create({ password: testPassword });

        await expect(
          IdentityManager.decryptPrivateKey(identity, 'wrong-password')
        ).rejects.toThrow(CryptoError);
      });
    });

    describe('Seed Phrase Recovery', () => {
      it('should generate valid 12-word seed phrase', () => {
        const seedPhrase = IdentityManager.generateSeedPhrase(12);

        expect(seedPhrase.words).toHaveLength(12);
        expect(IdentityManager.validateSeedPhrase(seedPhrase)).toBe(true);
      });

      it('should generate valid 24-word seed phrase', () => {
        const seedPhrase = IdentityManager.generateSeedPhrase(24);

        expect(seedPhrase.words).toHaveLength(24);
        expect(IdentityManager.validateSeedPhrase(seedPhrase)).toBe(true);
      });

      it('should recover same identity from seed phrase', async () => {
        const seedPhrase = IdentityManager.generateSeedPhrase();

        const identity1 = await IdentityManager.fromSeedPhrase(seedPhrase, {
          password: testPassword,
        });
        const identity2 = await IdentityManager.fromSeedPhrase(seedPhrase, {
          password: testPassword,
        });

        // Agent IDs should match (derived from same seed)
        expect(identity1.agentId).toBe(identity2.agentId);
        expect(identity1.publicKey).toBe(identity2.publicKey);
      });

      it('should reject invalid seed phrase', () => {
        const invalidSeed: SeedPhrase = {
          words: ['invalid', 'words', 'that', 'are', 'not', 'in', 'wordlist'],
        };

        expect(IdentityManager.validateSeedPhrase(invalidSeed)).toBe(false);
      });
    });

    describe('Export/Import', () => {
      it('should export and import identity', async () => {
        const identity = await IdentityManager.create({
          password: testPassword,
          displayName: 'Export Test',
        });

        const exported = await IdentityManager.exportIdentity(identity);

        expect(exported.type).toBe('agentic-qe-identity-export');
        expect(exported.version).toBe(1);
        expect(exported.checksum).toBeDefined();

        const imported = await IdentityManager.importIdentity(exported);

        expect(imported.agentId).toBe(identity.agentId);
        expect(imported.publicKey).toBe(identity.publicKey);
        expect(imported.displayName).toBe(identity.displayName);
      });

      it('should detect corrupted export', async () => {
        const identity = await IdentityManager.create({ password: testPassword });
        const exported = await IdentityManager.exportIdentity(identity);

        // Corrupt the checksum
        exported.checksum = 'corrupted-checksum';

        await expect(IdentityManager.importIdentity(exported)).rejects.toThrow(
          /checksum/i
        );
      });
    });

    describe('getPublicIdentity()', () => {
      it('should return identity without encrypted keys', async () => {
        const identity = await IdentityManager.create({ password: testPassword });
        const publicIdentity = IdentityManager.getPublicIdentity(identity);

        expect(publicIdentity.agentId).toBe(identity.agentId);
        expect(publicIdentity.publicKey).toBe(identity.publicKey);
        expect((publicIdentity as StoredIdentity).encryptedKeyPair).toBeUndefined();
      });
    });
  });

  describe('KeyManager', () => {
    let keyManager: KeyManager;
    const testPassword = 'key-manager-test-123';

    beforeEach(async () => {
      keyManager = new KeyManager({ dbName: `test-keystore-${Date.now()}` });
      await keyManager.initialize();
    });

    afterEach(async () => {
      await keyManager.close();
    });

    describe('store() and get()', () => {
      it('should store and retrieve identity', async () => {
        const identity = await IdentityManager.create({ password: testPassword });
        await keyManager.store(identity);

        const retrieved = await keyManager.get(identity.agentId);

        expect(retrieved).toBeDefined();
        expect(retrieved!.agentId).toBe(identity.agentId);
        expect(retrieved!.publicKey).toBe(identity.publicKey);
      });

      it('should return null for non-existent identity', async () => {
        const retrieved = await keyManager.get('non-existent-id');
        expect(retrieved).toBeNull();
      });

      it('should reject duplicate identity', async () => {
        const identity = await IdentityManager.create({ password: testPassword });
        await keyManager.store(identity);

        await expect(keyManager.store(identity)).rejects.toThrow(CryptoError);
      });
    });

    describe('unlock() and lock()', () => {
      it('should unlock identity with correct password', async () => {
        const identity = await IdentityManager.create({ password: testPassword });
        await keyManager.store(identity);

        const keyPair = await keyManager.unlock(identity.agentId, testPassword);

        expect(keyPair.publicKey).toBe(identity.publicKey);
        expect(keyPair.privateKey).toBeDefined();
        expect(keyManager.isUnlocked(identity.agentId)).toBe(true);
      });

      it('should cache unlocked keys', async () => {
        const identity = await IdentityManager.create({ password: testPassword });
        await keyManager.store(identity);

        const keyPair1 = await keyManager.unlock(identity.agentId, testPassword);
        const keyPair2 = await keyManager.unlock(identity.agentId, testPassword);

        expect(keyPair1).toEqual(keyPair2);
      });

      it('should lock identity', async () => {
        const identity = await IdentityManager.create({ password: testPassword });
        await keyManager.store(identity);

        await keyManager.unlock(identity.agentId, testPassword);
        expect(keyManager.isUnlocked(identity.agentId)).toBe(true);

        keyManager.lock(identity.agentId);
        expect(keyManager.isUnlocked(identity.agentId)).toBe(false);
      });

      it('should reject unlock for revoked identity', async () => {
        const identity = await IdentityManager.create({ password: testPassword });
        await keyManager.store(identity);

        await keyManager.revoke(identity.agentId, testPassword, 'Test revocation');

        await expect(
          keyManager.unlock(identity.agentId, testPassword)
        ).rejects.toThrow(CryptoError);
      });
    });

    describe('list()', () => {
      it('should list all identities', async () => {
        const identity1 = await IdentityManager.create({ password: testPassword });
        const identity2 = await IdentityManager.create({ password: testPassword });

        await keyManager.store(identity1);
        await keyManager.store(identity2);

        const list = await keyManager.list();

        expect(list).toHaveLength(2);
        expect(list.map((i) => i.agentId)).toContain(identity1.agentId);
        expect(list.map((i) => i.agentId)).toContain(identity2.agentId);
      });

      it('should exclude revoked identities by default', async () => {
        const identity = await IdentityManager.create({ password: testPassword });
        await keyManager.store(identity);
        await keyManager.revoke(identity.agentId, testPassword, 'Test');

        const list = await keyManager.list();
        const listWithRevoked = await keyManager.list(true);

        expect(list).toHaveLength(0);
        expect(listWithRevoked).toHaveLength(1);
      });
    });

    describe('Key Rotation', () => {
      // These tests require multi-store transactions which need a real IndexedDB
      // In browser environment, these would work correctly
      it.skip('should rotate keys successfully (requires real IndexedDB)', async () => {
        const identity = await IdentityManager.create({ password: testPassword });
        await keyManager.store(identity);

        const oldPublicKey = identity.publicKey;
        const newPassword = 'new-password-456';

        const rotated = await keyManager.rotateKeys(
          identity.agentId,
          testPassword,
          newPassword,
          'Security upgrade'
        );

        expect(rotated.agentId).toBe(identity.agentId); // Agent ID preserved
        expect(rotated.publicKey).not.toBe(oldPublicKey); // New public key
        expect(rotated.lastRotatedAt).toBeDefined();

        // Old password should no longer work
        await expect(
          keyManager.unlock(identity.agentId, testPassword)
        ).rejects.toThrow();

        // New password should work
        const keyPair = await keyManager.unlock(identity.agentId, newPassword);
        expect(keyPair.publicKey).toBe(rotated.publicKey);
      });

      it.skip('should record rotation history (requires real IndexedDB)', async () => {
        const identity = await IdentityManager.create({ password: testPassword });
        await keyManager.store(identity);

        await keyManager.rotateKeys(
          identity.agentId,
          testPassword,
          'new-pass-1',
          'First rotation'
        );
        await keyManager.rotateKeys(
          identity.agentId,
          'new-pass-1',
          'new-pass-2',
          'Second rotation'
        );

        const history = await keyManager.getRotationHistory(identity.agentId);

        expect(history).toHaveLength(2);
        expect(history[0].reason).toBe('First rotation');
        expect(history[1].reason).toBe('Second rotation');
      });
    });

    describe('Key Revocation', () => {
      it('should revoke identity', async () => {
        const identity = await IdentityManager.create({ password: testPassword });
        await keyManager.store(identity);

        await keyManager.revoke(identity.agentId, testPassword, 'Compromised');

        const retrieved = await keyManager.get(identity.agentId);

        expect(retrieved!.revoked).toBe(true);
        expect(retrieved!.revokedAt).toBeDefined();
        expect(retrieved!.revocationReason).toBe('Compromised');
      });

      it('should not allow double revocation', async () => {
        const identity = await IdentityManager.create({ password: testPassword });
        await keyManager.store(identity);

        await keyManager.revoke(identity.agentId, testPassword, 'First');

        await expect(
          keyManager.revoke(identity.agentId, testPassword, 'Second')
        ).rejects.toThrow(CryptoError);
      });
    });

    describe('Export/Import', () => {
      it('should export and import identity via KeyManager', async () => {
        const identity = await IdentityManager.create({
          password: testPassword,
          displayName: 'Export Test',
        });
        await keyManager.store(identity);

        const exported = await keyManager.export(identity.agentId);

        // Create new key manager
        const newKeyManager = new KeyManager({
          dbName: `test-import-${Date.now()}`,
        });
        await newKeyManager.initialize();

        const imported = await newKeyManager.import(exported);

        expect(imported.agentId).toBe(identity.agentId);
        expect(imported.displayName).toBe('Export Test');

        await newKeyManager.close();
      });
    });

    describe('Delete', () => {
      it('should delete identity with correct password', async () => {
        const identity = await IdentityManager.create({ password: testPassword });
        await keyManager.store(identity);

        await keyManager.delete(identity.agentId, testPassword);

        const retrieved = await keyManager.get(identity.agentId);
        expect(retrieved).toBeNull();
      });

      it('should reject delete with wrong password', async () => {
        const identity = await IdentityManager.create({ password: testPassword });
        await keyManager.store(identity);

        await expect(
          keyManager.delete(identity.agentId, 'wrong-password')
        ).rejects.toThrow(CryptoError);
      });
    });
  });

  describe('Signer', () => {
    let identity: StoredIdentity;
    let keyPair: { publicKey: string; privateKey: string };
    const testPassword = 'signer-test-123';

    beforeAll(async () => {
      identity = await IdentityManager.create({ password: testPassword });
      keyPair = await IdentityManager.decryptPrivateKey(identity, testPassword);
    });

    describe('sign() and verify()', () => {
      it('should sign and verify a message', async () => {
        const payload = { action: 'share-pattern', data: { patternId: '123' } };

        const signed = await Signer.sign(
          keyPair,
          IdentityManager.getPublicIdentity(identity),
          payload
        );

        expect(signed.payload).toEqual(payload);
        expect(signed.signature).toBeDefined();
        expect(signed.signerPublicKey).toBe(identity.publicKey);
        expect(signed.signerId).toBe(identity.agentId);
        expect(signed.signedAt).toBeDefined();
        expect(signed.nonce).toBeDefined();

        const result = await Signer.verify(signed);

        expect(result.valid).toBe(true);
        expect(result.signerId).toBe(identity.agentId);
      });

      it('should detect tampered payload', async () => {
        const payload = { action: 'test', value: 42 };

        const signed = await Signer.sign(
          keyPair,
          IdentityManager.getPublicIdentity(identity),
          payload
        );

        // Tamper with payload
        (signed.payload as { value: number }).value = 100;

        const result = await Signer.verify(signed);

        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
      });

      it('should detect forged signature', async () => {
        const payload = { action: 'test' };

        const signed = await Signer.sign(
          keyPair,
          IdentityManager.getPublicIdentity(identity),
          payload
        );

        // Forge signature
        signed.signature = base64Utils.encode(new Uint8Array(32));

        const result = await Signer.verify(signed);

        expect(result.valid).toBe(false);
      });

      it('should sign without nonce when specified', async () => {
        const signed = await Signer.sign(
          keyPair,
          IdentityManager.getPublicIdentity(identity),
          { test: true },
          false // No nonce
        );

        expect(signed.nonce).toBeUndefined();

        const result = await Signer.verify(signed);
        expect(result.valid).toBe(true);
      });
    });

    describe('Batch Verification', () => {
      it('should verify multiple messages in batch', async () => {
        const messages: SignedMessage<{ index: number }>[] = [];

        for (let i = 0; i < 5; i++) {
          const signed = await Signer.sign(
            keyPair,
            IdentityManager.getPublicIdentity(identity),
            { index: i }
          );
          messages.push(signed);
        }

        const result = await Signer.verifyBatch(messages);

        expect(result.total).toBe(5);
        expect(result.valid).toBe(5);
        expect(result.invalid).toBe(0);
      });

      it('should report invalid messages in batch', async () => {
        const messages: SignedMessage<{ index: number }>[] = [];

        for (let i = 0; i < 3; i++) {
          const signed = await Signer.sign(
            keyPair,
            IdentityManager.getPublicIdentity(identity),
            { index: i }
          );
          messages.push(signed);
        }

        // Tamper with one message
        (messages[1].payload as { index: number }).index = 999;

        const result = await Signer.verifyBatch(messages);

        expect(result.total).toBe(3);
        expect(result.valid).toBe(2);
        expect(result.invalid).toBe(1);
        expect(result.results[1].valid).toBe(false);
      });
    });

    describe('Identity Proofs', () => {
      it('should create and verify identity proof', async () => {
        const challenge = Signer.generateChallenge();

        const proof = await Signer.createIdentityProof(
          keyPair,
          IdentityManager.getPublicIdentity(identity),
          challenge
        );

        expect(proof.agentId).toBe(identity.agentId);
        expect(proof.challenge).toBe(challenge);
        expect(proof.signature).toBeDefined();

        const result = await Signer.verifyIdentityProof(proof);

        expect(result.valid).toBe(true);
        expect(result.signerId).toBe(identity.agentId);
      });

      it('should reject expired proof', async () => {
        const challenge = Signer.generateChallenge();

        const proof = await Signer.createIdentityProof(
          keyPair,
          IdentityManager.getPublicIdentity(identity),
          challenge,
          1 // 1ms expiration
        );

        // Wait for expiration
        await new Promise((resolve) => setTimeout(resolve, 10));

        const result = await Signer.verifyIdentityProof(proof);

        expect(result.valid).toBe(false);
        expect(result.error).toMatch(/expired/i);
      });

      it('should reject tampered proof', async () => {
        const challenge = Signer.generateChallenge();

        const proof = await Signer.createIdentityProof(
          keyPair,
          IdentityManager.getPublicIdentity(identity),
          challenge
        );

        // Tamper with challenge
        proof.challenge = 'tampered-challenge';

        const result = await Signer.verifyIdentityProof(proof);

        expect(result.valid).toBe(false);
      });
    });

    describe('JSON Canonicalization', () => {
      it('should produce consistent output regardless of key order', () => {
        const obj1 = { b: 2, a: 1, c: 3 };
        const obj2 = { a: 1, c: 3, b: 2 };

        const canonical1 = Signer.canonicalizeJson(obj1);
        const canonical2 = Signer.canonicalizeJson(obj2);

        expect(canonical1).toBe(canonical2);
      });

      it('should handle nested objects', () => {
        const obj = { outer: { z: 1, a: 2 }, first: true };
        const canonical = Signer.canonicalizeJson(obj);

        // Keys should be sorted at all levels
        expect(canonical).toContain('"first"');
        expect(canonical.indexOf('"first"')).toBeLessThan(
          canonical.indexOf('"outer"')
        );
      });
    });
  });

  describe('Message Envelope', () => {
    let identity: StoredIdentity;
    let keyPair: { publicKey: string; privateKey: string };

    beforeAll(async () => {
      identity = await IdentityManager.create({ password: 'envelope-test' });
      keyPair = await IdentityManager.decryptPrivateKey(identity, 'envelope-test');
    });

    it('should create message envelope', async () => {
      const signed = await Signer.sign(
        keyPair,
        IdentityManager.getPublicIdentity(identity),
        { action: 'broadcast' }
      );

      const envelope = createEnvelope(signed, '*', 'broadcast', 5);

      expect(envelope.messageId).toBeDefined();
      expect(envelope.signedMessage).toBe(signed);
      expect(envelope.to).toBe('*');
      expect(envelope.type).toBe('broadcast');
      expect(envelope.ttl).toBe(5);
      expect(envelope.timestamp).toBeDefined();
    });

    it('should verify envelope', async () => {
      const signed = await Signer.sign(
        keyPair,
        IdentityManager.getPublicIdentity(identity),
        { action: 'test' }
      );

      const envelope = createEnvelope(signed, 'target-agent', 'direct');
      const result = await verifyEnvelope(envelope);

      expect(result.valid).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should use correct error codes', async () => {
      const identity = await IdentityManager.create({ password: 'test' });

      try {
        await IdentityManager.decryptPrivateKey(identity, 'wrong');
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(CryptoError);
        expect((error as CryptoError).code).toBe(CryptoErrorCode.INVALID_PASSWORD);
      }
    });

    it('should include error details', async () => {
      try {
        await IdentityManager.fromSeedPhrase(
          { words: ['invalid'] },
          { password: 'test' }
        );
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(CryptoError);
        expect((error as CryptoError).details).toBeDefined();
      }
    });
  });

  describe('Module Capabilities', () => {
    it('should export capabilities', () => {
      expect(CRYPTO_CAPABILITIES.keyGeneration).toBe(true);
      expect(CRYPTO_CAPABILITIES.encryptionAtRest).toBe(true);
      expect(CRYPTO_CAPABILITIES.seedPhraseRecovery).toBe(true);
      expect(CRYPTO_CAPABILITIES.keyRotation).toBe(true);
      expect(CRYPTO_CAPABILITIES.batchVerification).toBe(true);
    });
  });

  describe('Base64 Utilities', () => {
    it('should encode and decode correctly', () => {
      const original = new Uint8Array([1, 2, 3, 4, 5, 255, 0, 128]);
      const encoded = base64Utils.encode(original);
      const decoded = base64Utils.decode(encoded);

      expect(decoded).toEqual(original);
    });

    it('should handle empty array', () => {
      const original = new Uint8Array([]);
      const encoded = base64Utils.encode(original);
      const decoded = base64Utils.decode(encoded);

      expect(decoded).toEqual(original);
    });
  });
});
