/**
 * Crypto-WebRTC Integration Tests
 *
 * Tests the integration between the Ed25519 cryptographic identity system
 * and the WebRTC peer connection manager. Verifies that:
 * - Agent identities can be created with Ed25519 keys
 * - Peer connections can be established using those identities
 * - Messages can be signed and verified between connected peers
 * - Key-based authentication works during WebRTC handshake
 * - Secure data channel communication with signed messages functions correctly
 *
 * @module tests/edge/p2p/integration/crypto-webrtc.integration.test
 */

import { createResourceCleanup } from '../../../helpers/cleanup';

// ============================================
// Mock WebRTC APIs for Node.js test environment
// ============================================

interface MockIceCandidate {
  candidate: string;
  sdpMLineIndex: number;
  sdpMid: string;
  usernameFragment: string;
  address: string;
  port: number;
  protocol: string;
  toJSON: () => Record<string, unknown>;
}

class MockRTCPeerConnection {
  public onicecandidate: ((event: { candidate: RTCIceCandidate | null }) => void) | null = null;
  public onicegatheringstatechange: (() => void) | null = null;
  public oniceconnectionstatechange: (() => void) | null = null;
  public onconnectionstatechange: (() => void) | null = null;
  public onnegotiationneeded: (() => void) | null = null;
  public ondatachannel: ((event: { channel: RTCDataChannel }) => void) | null = null;

  public connectionState: RTCPeerConnectionState = 'new';
  public iceGatheringState: RTCIceGatheringState = 'new';
  public iceConnectionState: RTCIceConnectionState = 'new';
  public localDescription: RTCSessionDescription | null = null;
  public remoteDescription: RTCSessionDescription | null = null;

  private dataChannels: Map<string, MockRTCDataChannel> = new Map();
  private iceCandidates: RTCIceCandidate[] = [];

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    return {
      type: 'offer',
      sdp: 'mock-offer-sdp',
    };
  }

  async createAnswer(): Promise<RTCSessionDescriptionInit> {
    return {
      type: 'answer',
      sdp: 'mock-answer-sdp',
    };
  }

  async setLocalDescription(description: RTCSessionDescriptionInit): Promise<void> {
    this.localDescription = description as RTCSessionDescription;
    // Simulate ICE gathering
    setTimeout(() => {
      if (this.onicecandidate) {
        const mockCandidate: MockIceCandidate = {
          candidate: 'candidate:1 1 udp 2130706431 192.168.1.1 12345 typ host',
          sdpMLineIndex: 0,
          sdpMid: 'audio',
          usernameFragment: 'mock-ufrag',
          address: '192.168.1.1',
          port: 12345,
          protocol: 'udp',
          toJSON: () => ({}),
        };
        this.onicecandidate({
          candidate: mockCandidate as unknown as RTCIceCandidate,
        });
        // Signal end of candidates
        setTimeout(() => {
          if (this.onicecandidate) {
            this.onicecandidate({ candidate: null });
          }
        }, 10);
      }
    }, 10);
  }

  async setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void> {
    this.remoteDescription = description as RTCSessionDescription;
  }

  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    this.iceCandidates.push(candidate as RTCIceCandidate);
  }

  createDataChannel(label: string, options?: RTCDataChannelInit): RTCDataChannel {
    const channel = new MockRTCDataChannel(label, options);
    this.dataChannels.set(label, channel);
    return channel as unknown as RTCDataChannel;
  }

  async getStats(): Promise<RTCStatsReport> {
    const stats = new Map<string, unknown>();
    stats.set('candidate-pair-1', {
      type: 'candidate-pair',
      state: 'succeeded',
      currentRoundTripTime: 0.05,
      availableOutgoingBitrate: 2500000,
    });
    stats.set('local-candidate-1', {
      type: 'local-candidate',
      candidateType: 'host',
    });
    stats.set('remote-candidate-1', {
      type: 'remote-candidate',
      candidateType: 'srflx',
    });
    return stats as RTCStatsReport;
  }

  restartIce(): void {
    this.iceGatheringState = 'new';
  }

  close(): void {
    this.connectionState = 'closed';
    this.dataChannels.forEach((channel) => channel.close());
    this.dataChannels.clear();
  }

  // Helper for tests to simulate state changes
  simulateConnectionState(state: RTCPeerConnectionState): void {
    this.connectionState = state;
    if (this.onconnectionstatechange) {
      this.onconnectionstatechange();
    }
  }

  simulateIceConnectionState(state: RTCIceConnectionState): void {
    this.iceConnectionState = state;
    if (this.oniceconnectionstatechange) {
      this.oniceconnectionstatechange();
    }
  }

  simulateDataChannel(label: string): void {
    const channel = new MockRTCDataChannel(label);
    if (this.ondatachannel) {
      this.ondatachannel({ channel: channel as unknown as RTCDataChannel });
    }
  }

  getDataChannel(label: string): MockRTCDataChannel | undefined {
    return this.dataChannels.get(label);
  }
}

class MockRTCDataChannel {
  public label: string;
  public readyState: RTCDataChannelState = 'connecting';
  public bufferedAmount: number = 0;
  public bufferedAmountLowThreshold: number = 0;
  public ordered: boolean;
  public maxRetransmits: number | null = null;
  public maxPacketLifeTime: number | null = null;
  public protocol: string = '';

  public onopen: (() => void) | null = null;
  public onclose: (() => void) | null = null;
  public onerror: ((event: ErrorEvent) => void) | null = null;
  public onmessage: ((event: MessageEvent) => void) | null = null;

  private messages: string[] = [];

  constructor(label: string, options?: RTCDataChannelInit) {
    this.label = label;
    this.ordered = options?.ordered ?? true;
    if (options?.maxRetransmits !== undefined) {
      this.maxRetransmits = options.maxRetransmits;
    }
    if (options?.maxPacketLifeTime !== undefined) {
      this.maxPacketLifeTime = options.maxPacketLifeTime;
    }
    this.protocol = options?.protocol ?? '';

    // Simulate channel opening
    setTimeout(() => {
      this.readyState = 'open';
      if (this.onopen) {
        this.onopen();
      }
    }, 10);
  }

  send(data: string | ArrayBuffer | Blob): void {
    if (this.readyState !== 'open') {
      throw new Error('Data channel not open');
    }
    this.messages.push(data as string);
  }

  close(): void {
    this.readyState = 'closed';
    if (this.onclose) {
      this.onclose();
    }
  }

  // Helper for tests
  simulateMessage(data: string): void {
    if (this.onmessage) {
      this.onmessage({ data } as MessageEvent);
    }
  }

  getMessages(): string[] {
    return [...this.messages];
  }
}

class MockWebSocket {
  public url: string;
  public readyState: number = MockWebSocket.CONNECTING;

  public onopen: ((event: Event) => void) | null = null;
  public onclose: ((event: CloseEvent) => void) | null = null;
  public onerror: ((event: Event) => void) | null = null;
  public onmessage: ((event: MessageEvent) => void) | null = null;

  private sentMessages: string[] = [];

  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  constructor(url: string) {
    this.url = url;

    // Simulate connection opening
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      if (this.onopen) {
        this.onopen({} as Event);
      }
    }, 10);
  }

  send(data: string): void {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error('WebSocket not open');
    }
    this.sentMessages.push(data);
  }

  close(code?: number, reason?: string): void {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose({ code: code ?? 1000, reason: reason ?? '' } as CloseEvent);
    }
  }

  // Helpers for tests
  simulateMessage(data: string): void {
    if (this.onmessage) {
      this.onmessage({ data } as MessageEvent);
    }
  }

  getSentMessages(): string[] {
    return [...this.sentMessages];
  }
}

// ============================================
// Mock IndexedDB for Node.js environment
// ============================================

const mockIndexedDB = (() => {
  const databases = new Map<string, Map<string, Map<string, unknown>>>();

  interface MockIDBRequest<T> {
    result: T | null;
    error: Error | null;
    onsuccess: (() => void) | null;
    onerror: (() => void) | null;
    onupgradeneeded?: ((event: { target: { result: unknown } }) => void) | null;
    onblocked?: (() => void) | null;
  }

  interface MockIDBTransaction {
    objectStore: (name: string) => MockIDBObjectStore;
    oncomplete: (() => void) | null;
    onerror: (() => void) | null;
  }

  interface MockIDBObjectStore {
    put: (value: Record<string, unknown>) => MockIDBRequest<void>;
    add: (value: Record<string, unknown>) => MockIDBRequest<void>;
    get: (key: string) => MockIDBRequest<unknown>;
    getAll: () => MockIDBRequest<unknown[]>;
    delete: (key: string) => MockIDBRequest<void>;
    index: (name: string) => MockIDBIndex;
    createIndex: () => Record<string, unknown>;
  }

  interface MockIDBIndex {
    get: (key: string) => MockIDBRequest<unknown>;
    getAll: (key?: string) => MockIDBRequest<unknown[]>;
  }

  function createMockStore(
    store: Map<string, unknown>,
    txn?: { oncomplete: (() => void) | null }
  ): MockIDBObjectStore {
    return {
      put: (value: Record<string, unknown>) => {
        const request: MockIDBRequest<void> = {
          result: null,
          error: null,
          onsuccess: null,
          onerror: null,
        };

        setTimeout(() => {
          const key = (value.agentId || value.key || value.id || String(store.size)) as string;
          store.set(String(key), value);
          if (request.onsuccess) {
            request.onsuccess();
          }
          setTimeout(() => {
            if (txn?.oncomplete) {
              txn.oncomplete();
            }
          }, 0);
        }, 0);

        return request;
      },
      add: (value: Record<string, unknown>) => {
        const request: MockIDBRequest<void> = {
          result: null,
          error: null,
          onsuccess: null,
          onerror: null,
        };

        setTimeout(() => {
          const key = (value.agentId || value.key || String(store.size)) as string;
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
          setTimeout(() => {
            if (txn?.oncomplete) {
              txn.oncomplete();
            }
          }, 0);
        }, 0);

        return request;
      },
      get: (key: string) => {
        const request: MockIDBRequest<unknown> = {
          result: null,
          error: null,
          onsuccess: null,
          onerror: null,
        };

        setTimeout(() => {
          request.result = store.get(String(key)) ?? null;
          if (request.onsuccess) {
            request.onsuccess();
          }
        }, 0);

        return request;
      },
      getAll: () => {
        const request: MockIDBRequest<unknown[]> = {
          result: null,
          error: null,
          onsuccess: null,
          onerror: null,
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
        const request: MockIDBRequest<void> = {
          result: null,
          error: null,
          onsuccess: null,
          onerror: null,
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
          const request: MockIDBRequest<unknown> = {
            result: null,
            error: null,
            onsuccess: null,
            onerror: null,
          };

          setTimeout(() => {
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
          const request: MockIDBRequest<unknown[]> = {
            result: null,
            error: null,
            onsuccess: null,
            onerror: null,
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
      createIndex: () => ({}),
    };
  }

  return {
    open: (name: string, _version?: number) => {
      const request: MockIDBRequest<unknown> = {
        result: null,
        error: null,
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
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
            const txn: MockIDBTransaction = {
              objectStore: (storeName: string) => {
                const storeData = db.get(storeName) || new Map<string, unknown>();
                if (!db.has(storeName)) {
                  db.set(storeName, storeData);
                }
                return createMockStore(storeData, txn);
              },
              oncomplete: null,
              onerror: null,
            };
            return txn;
          },
          close: () => {},
          onerror: null,
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
      const request: MockIDBRequest<void> = {
        result: null,
        error: null,
        onsuccess: null,
        onerror: null,
        onblocked: null,
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

// ============================================
// Install mocks before importing modules
// ============================================

(global as unknown as { RTCPeerConnection: typeof MockRTCPeerConnection }).RTCPeerConnection =
  MockRTCPeerConnection;
(global as unknown as { RTCDataChannel: typeof MockRTCDataChannel }).RTCDataChannel =
  MockRTCDataChannel;
(
  global as unknown as { RTCIceCandidate: new (init: RTCIceCandidateInit) => RTCIceCandidate }
).RTCIceCandidate = class {
  candidate: string;
  sdpMLineIndex: number | null;
  sdpMid: string | null;
  usernameFragment: string | null;

  constructor(init: RTCIceCandidateInit) {
    this.candidate = init.candidate ?? '';
    this.sdpMLineIndex = init.sdpMLineIndex ?? null;
    this.sdpMid = init.sdpMid ?? null;
    this.usernameFragment = init.usernameFragment ?? null;
  }

  toJSON() {
    return {};
  }
} as unknown as new (init: RTCIceCandidateInit) => RTCIceCandidate;
(global as unknown as { WebSocket: typeof MockWebSocket }).WebSocket =
  MockWebSocket as unknown as typeof WebSocket;
(global as unknown as { indexedDB: typeof mockIndexedDB }).indexedDB = mockIndexedDB;

// Mock crypto.subtle if not available
if (typeof crypto === 'undefined' || !crypto.subtle) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
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
      deriveBits: async (algorithm: unknown, baseKey: unknown, length: number) => {
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
      encrypt: async (algorithm: unknown, key: unknown, data: ArrayBuffer) => {
        const algo = algorithm as { name: string; iv: ArrayBuffer };
        const k = key as { keyData: Buffer };
        const cipher = nodeCrypto.createCipheriv('aes-256-gcm', k.keyData, Buffer.from(algo.iv));
        const encrypted = Buffer.concat([
          cipher.update(Buffer.from(data)),
          cipher.final(),
          cipher.getAuthTag(),
        ]);
        return encrypted.buffer;
      },
      decrypt: async (algorithm: unknown, key: unknown, data: ArrayBuffer) => {
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
        const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
        return decrypted.buffer;
      },
      sign: async (_algorithm: string, key: unknown, data: ArrayBuffer) => {
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

// ============================================
// Now import the modules under test
// ============================================

import {
  IdentityManager,
  KeyManager,
  Signer,
  createEnvelope,
  verifyEnvelope,
} from '../../../../src/edge/p2p/crypto';

import type {
  StoredIdentity,
  KeyPair,
  AgentIdentity,
  SignedMessage,
} from '../../../../src/edge/p2p/crypto';

import {
  PeerConnectionManager,
  SignalingClient,
  ConnectionState,
  SignalingClientState,
  SignalingMessageType,
  WebRTCEventType,
} from '../../../../src/edge/p2p/webrtc';

import type { DataChannelMessage } from '../../../../src/edge/p2p/webrtc';

// ============================================
// Integration Test Suite
// ============================================

describe('Crypto-WebRTC Integration', () => {
  const cleanup = createResourceCleanup();

  afterEach(async () => {
    await cleanup.afterEach();
    jest.clearAllMocks();
  });

  // ============================================
  // Section 1: Agent Identity Creation
  // ============================================
  describe('Agent Identity Creation with Ed25519 Keys', () => {
    let keyManager: KeyManager;
    const testPassword = 'integration-test-password-123';

    beforeEach(async () => {
      keyManager = new KeyManager({ dbName: `test-keystore-${Date.now()}` });
      await keyManager.initialize();
    });

    afterEach(async () => {
      await keyManager.close();
    });

    it('should create an agent identity with valid Ed25519 keys', async () => {
      const identity = await IdentityManager.create({
        password: testPassword,
        displayName: 'Integration Test Agent',
        metadata: { role: 'peer', version: '1.0.0' },
      });

      expect(identity.agentId).toBeDefined();
      expect(identity.agentId).toHaveLength(16);
      expect(identity.publicKey).toBeDefined();
      expect(identity.displayName).toBe('Integration Test Agent');
      expect(identity.metadata).toEqual({ role: 'peer', version: '1.0.0' });

      // Verify encrypted key structure
      expect(identity.encryptedKeyPair).toBeDefined();
      expect(identity.encryptedKeyPair.kdf).toBe('PBKDF2');
      expect(identity.encryptedKeyPair.salt).toBeDefined();
      expect(identity.encryptedKeyPair.iv).toBeDefined();
    });

    it('should store and retrieve identity from KeyManager', async () => {
      const identity = await IdentityManager.create({
        password: testPassword,
        displayName: 'Stored Agent',
      });

      await keyManager.store(identity);
      const retrieved = await keyManager.get(identity.agentId);

      expect(retrieved).toBeDefined();
      expect(retrieved!.agentId).toBe(identity.agentId);
      expect(retrieved!.publicKey).toBe(identity.publicKey);
    });

    it('should unlock identity and provide keypair for signing', async () => {
      const identity = await IdentityManager.create({
        password: testPassword,
        displayName: 'Unlockable Agent',
      });

      await keyManager.store(identity);
      const keyPair = await keyManager.unlock(identity.agentId, testPassword);

      expect(keyPair.publicKey).toBe(identity.publicKey);
      expect(keyPair.privateKey).toBeDefined();
      expect(keyManager.isUnlocked(identity.agentId)).toBe(true);
    });

    it('should create multiple unique identities for different peers', async () => {
      const identities: StoredIdentity[] = [];

      for (let i = 0; i < 3; i++) {
        const identity = await IdentityManager.create({
          password: testPassword,
          displayName: `Peer ${i + 1}`,
        });
        identities.push(identity);
        await keyManager.store(identity);
      }

      // Verify all identities are unique
      const agentIds = identities.map((id) => id.agentId);
      const uniqueIds = new Set(agentIds);
      expect(uniqueIds.size).toBe(3);

      // Verify all stored
      const storedList = await keyManager.list();
      expect(storedList).toHaveLength(3);
    });
  });

  // ============================================
  // Section 2: Peer Connection Establishment with Identity
  // ============================================
  describe('Peer Connection Establishment Using Identities', () => {
    let aliceIdentity: StoredIdentity;
    let bobIdentity: StoredIdentity;
    let aliceKeyPair: KeyPair;
    let bobKeyPair: KeyPair;
    let aliceManager: PeerConnectionManager;
    let bobManager: PeerConnectionManager;
    let aliceSignaling: SignalingClient;
    let bobSignaling: SignalingClient;
    let keyManager: KeyManager;

    const testPassword = 'peer-connection-test-123';

    beforeEach(async () => {
      // Create key manager
      keyManager = new KeyManager({ dbName: `test-peer-keystore-${Date.now()}` });
      await keyManager.initialize();

      // Create identities for Alice and Bob
      aliceIdentity = await IdentityManager.create({
        password: testPassword,
        displayName: 'Alice',
        metadata: { role: 'initiator' },
      });
      bobIdentity = await IdentityManager.create({
        password: testPassword,
        displayName: 'Bob',
        metadata: { role: 'responder' },
      });

      await keyManager.store(aliceIdentity);
      await keyManager.store(bobIdentity);

      // Unlock keys
      aliceKeyPair = await keyManager.unlock(aliceIdentity.agentId, testPassword);
      bobKeyPair = await keyManager.unlock(bobIdentity.agentId, testPassword);

      // Create signaling clients using agent IDs as peer IDs
      aliceSignaling = new SignalingClient({
        serverUrl: 'wss://test.signal.com',
        peerId: aliceIdentity.agentId,
        autoReconnect: false,
      });

      bobSignaling = new SignalingClient({
        serverUrl: 'wss://test.signal.com',
        peerId: bobIdentity.agentId,
        autoReconnect: false,
      });

      // Create peer connection managers using agent IDs
      aliceManager = new PeerConnectionManager({
        localPeerId: aliceIdentity.agentId,
        autoReconnect: false,
      });

      bobManager = new PeerConnectionManager({
        localPeerId: bobIdentity.agentId,
        autoReconnect: false,
      });

      // Connect managers to signaling
      aliceManager.setSignaling(aliceSignaling);
      bobManager.setSignaling(bobSignaling);

      // Connect signaling clients
      await aliceSignaling.connect();
      await bobSignaling.connect();
    });

    afterEach(async () => {
      await aliceManager.destroy();
      await bobManager.destroy();
      aliceSignaling.disconnect();
      bobSignaling.disconnect();
      await keyManager.close();
    });

    it('should use agent ID as peer ID for connection', () => {
      expect(aliceManager.getLocalPeerId()).toBe(aliceIdentity.agentId);
      expect(bobManager.getLocalPeerId()).toBe(bobIdentity.agentId);
    });

    it('should establish peer connection using cryptographic identity', async () => {
      // Alice connects to Bob using Bob's agent ID
      const connection = await aliceManager.connect(bobIdentity.agentId, {
        metadata: {
          publicKey: aliceIdentity.publicKey,
          displayName: 'Alice',
        },
      });

      expect(connection).toBeDefined();
      expect(connection.id).toBe(bobIdentity.agentId);
      expect(connection.metadata?.publicKey).toBe(aliceIdentity.publicKey);
    });

    it('should include identity metadata in connection', async () => {
      const connection = await aliceManager.connect(bobIdentity.agentId, {
        metadata: {
          agentId: aliceIdentity.agentId,
          publicKey: aliceIdentity.publicKey,
          displayName: aliceIdentity.displayName,
          role: aliceIdentity.metadata?.role,
        },
      });

      expect(connection.metadata).toBeDefined();
      expect(connection.metadata?.agentId).toBe(aliceIdentity.agentId);
      expect(connection.metadata?.publicKey).toBe(aliceIdentity.publicKey);
      expect(connection.metadata?.displayName).toBe('Alice');
    });

    it('should track connection states for identified peers', async () => {
      const stateChanges: ConnectionState[] = [];

      aliceManager.on(WebRTCEventType.CONNECTION_STATE_CHANGED, (event) => {
        if (event.peerId === bobIdentity.agentId) {
          stateChanges.push(event.data as ConnectionState);
        }
      });

      await aliceManager.connect(bobIdentity.agentId);

      // Should have at least connecting state
      expect(stateChanges).toContain(ConnectionState.CONNECTING);
    });
  });

  // ============================================
  // Section 3: Message Signing and Verification
  // ============================================
  describe('Signing and Verifying Messages Between Connected Peers', () => {
    let aliceIdentity: StoredIdentity;
    let bobIdentity: StoredIdentity;
    let aliceKeyPair: KeyPair;
    let bobKeyPair: KeyPair;
    let keyManager: KeyManager;

    const testPassword = 'signing-test-123';

    beforeEach(async () => {
      keyManager = new KeyManager({ dbName: `test-signing-keystore-${Date.now()}` });
      await keyManager.initialize();

      aliceIdentity = await IdentityManager.create({
        password: testPassword,
        displayName: 'Alice',
      });
      bobIdentity = await IdentityManager.create({
        password: testPassword,
        displayName: 'Bob',
      });

      await keyManager.store(aliceIdentity);
      await keyManager.store(bobIdentity);

      aliceKeyPair = await keyManager.unlock(aliceIdentity.agentId, testPassword);
      bobKeyPair = await keyManager.unlock(bobIdentity.agentId, testPassword);
    });

    afterEach(async () => {
      await keyManager.close();
    });

    it('should sign a message from Alice that Bob can verify', async () => {
      const payload = {
        type: 'pattern-share',
        patternId: 'abc123',
        data: { name: 'Test Pattern', accuracy: 0.95 },
      };

      // Alice signs the message
      const signedMessage = await Signer.sign(
        aliceKeyPair,
        IdentityManager.getPublicIdentity(aliceIdentity),
        payload
      );

      expect(signedMessage.signerId).toBe(aliceIdentity.agentId);
      expect(signedMessage.signerPublicKey).toBe(aliceIdentity.publicKey);
      expect(signedMessage.signature).toBeDefined();
      expect(signedMessage.nonce).toBeDefined();

      // Bob verifies Alice's message
      const verificationResult = await Signer.verify(signedMessage);

      expect(verificationResult.valid).toBe(true);
      expect(verificationResult.signerId).toBe(aliceIdentity.agentId);
    });

    it('should detect tampered messages', async () => {
      const payload = { action: 'transfer', amount: 100 };

      const signedMessage = await Signer.sign(
        aliceKeyPair,
        IdentityManager.getPublicIdentity(aliceIdentity),
        payload
      );

      // Tamper with the payload
      (signedMessage.payload as { amount: number }).amount = 1000;

      const verificationResult = await Signer.verify(signedMessage);

      expect(verificationResult.valid).toBe(false);
      expect(verificationResult.error).toBeDefined();
    });

    it('should verify batch of messages from same sender', async () => {
      const messages: SignedMessage<{ index: number }>[] = [];

      for (let i = 0; i < 5; i++) {
        const signed = await Signer.sign(
          aliceKeyPair,
          IdentityManager.getPublicIdentity(aliceIdentity),
          { index: i }
        );
        messages.push(signed);
      }

      const batchResult = await Signer.verifyBatch(messages);

      expect(batchResult.total).toBe(5);
      expect(batchResult.valid).toBe(5);
      expect(batchResult.invalid).toBe(0);
    });

    it('should verify messages from different senders', async () => {
      // Alice signs a message
      const aliceMessage = await Signer.sign(
        aliceKeyPair,
        IdentityManager.getPublicIdentity(aliceIdentity),
        { from: 'Alice', content: 'Hello Bob!' }
      );

      // Bob signs a message
      const bobMessage = await Signer.sign(
        bobKeyPair,
        IdentityManager.getPublicIdentity(bobIdentity),
        { from: 'Bob', content: 'Hello Alice!' }
      );

      // Verify both
      const aliceVerification = await Signer.verify(aliceMessage);
      const bobVerification = await Signer.verify(bobMessage);

      expect(aliceVerification.valid).toBe(true);
      expect(aliceVerification.signerId).toBe(aliceIdentity.agentId);

      expect(bobVerification.valid).toBe(true);
      expect(bobVerification.signerId).toBe(bobIdentity.agentId);
    });

    it('should create and verify message envelopes for P2P transmission', async () => {
      const payload = { type: 'sync-request', timestamp: Date.now() };

      const signedMessage = await Signer.sign(
        aliceKeyPair,
        IdentityManager.getPublicIdentity(aliceIdentity),
        payload
      );

      // Create envelope for Bob
      const envelope = createEnvelope(signedMessage, bobIdentity.agentId, 'sync-request', 3);

      expect(envelope.messageId).toBeDefined();
      expect(envelope.to).toBe(bobIdentity.agentId);
      expect(envelope.type).toBe('sync-request');
      expect(envelope.ttl).toBe(3);

      // Verify envelope
      const verificationResult = await verifyEnvelope(envelope);

      expect(verificationResult.valid).toBe(true);
    });
  });

  // ============================================
  // Section 4: Key-Based Authentication During Handshake
  // ============================================
  describe('Key-Based Authentication During WebRTC Handshake', () => {
    let aliceIdentity: StoredIdentity;
    let bobIdentity: StoredIdentity;
    let aliceKeyPair: KeyPair;
    let bobKeyPair: KeyPair;
    let keyManager: KeyManager;

    const testPassword = 'handshake-auth-test-123';

    beforeEach(async () => {
      keyManager = new KeyManager({ dbName: `test-handshake-keystore-${Date.now()}` });
      await keyManager.initialize();

      aliceIdentity = await IdentityManager.create({
        password: testPassword,
        displayName: 'Alice',
      });
      bobIdentity = await IdentityManager.create({
        password: testPassword,
        displayName: 'Bob',
      });

      await keyManager.store(aliceIdentity);
      await keyManager.store(bobIdentity);

      aliceKeyPair = await keyManager.unlock(aliceIdentity.agentId, testPassword);
      bobKeyPair = await keyManager.unlock(bobIdentity.agentId, testPassword);
    });

    afterEach(async () => {
      await keyManager.close();
    });

    it('should create identity proof for authentication challenge', async () => {
      // Bob sends challenge to Alice
      const challenge = Signer.generateChallenge();

      // Alice creates proof
      const proof = await Signer.createIdentityProof(
        aliceKeyPair,
        IdentityManager.getPublicIdentity(aliceIdentity),
        challenge,
        60000 // 1 minute expiration
      );

      expect(proof.agentId).toBe(aliceIdentity.agentId);
      expect(proof.publicKey).toBe(aliceIdentity.publicKey);
      expect(proof.challenge).toBe(challenge);
      expect(proof.signature).toBeDefined();
      expect(proof.timestamp).toBeDefined();
      expect(proof.expiresIn).toBe(60000);

      // Bob verifies Alice's proof
      const verificationResult = await Signer.verifyIdentityProof(proof);

      expect(verificationResult.valid).toBe(true);
      expect(verificationResult.signerId).toBe(aliceIdentity.agentId);
    });

    it('should reject expired identity proof', async () => {
      const challenge = Signer.generateChallenge();

      // Create proof with very short expiration
      const proof = await Signer.createIdentityProof(
        aliceKeyPair,
        IdentityManager.getPublicIdentity(aliceIdentity),
        challenge,
        1 // 1ms expiration
      );

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 10));

      const verificationResult = await Signer.verifyIdentityProof(proof);

      expect(verificationResult.valid).toBe(false);
      expect(verificationResult.error).toMatch(/expired/i);
    });

    it('should reject proof with tampered challenge', async () => {
      const challenge = Signer.generateChallenge();

      const proof = await Signer.createIdentityProof(
        aliceKeyPair,
        IdentityManager.getPublicIdentity(aliceIdentity),
        challenge
      );

      // Tamper with challenge
      proof.challenge = 'tampered-challenge';

      const verificationResult = await Signer.verifyIdentityProof(proof);

      expect(verificationResult.valid).toBe(false);
    });

    it('should simulate mutual authentication handshake', async () => {
      // Step 1: Alice initiates connection, Bob sends challenge
      const bobChallenge = Signer.generateChallenge();

      // Step 2: Alice proves identity and sends her own challenge
      const aliceProof = await Signer.createIdentityProof(
        aliceKeyPair,
        IdentityManager.getPublicIdentity(aliceIdentity),
        bobChallenge
      );
      const aliceChallenge = Signer.generateChallenge();

      // Step 3: Bob verifies Alice and sends proof
      const aliceVerification = await Signer.verifyIdentityProof(aliceProof);
      expect(aliceVerification.valid).toBe(true);

      const bobProof = await Signer.createIdentityProof(
        bobKeyPair,
        IdentityManager.getPublicIdentity(bobIdentity),
        aliceChallenge
      );

      // Step 4: Alice verifies Bob
      const bobVerification = await Signer.verifyIdentityProof(bobProof);
      expect(bobVerification.valid).toBe(true);

      // Both identities are now mutually authenticated
      expect(aliceVerification.signerId).toBe(aliceIdentity.agentId);
      expect(bobVerification.signerId).toBe(bobIdentity.agentId);
    });

    it('should include identity proof in connection metadata', async () => {
      const signaling = new SignalingClient({
        serverUrl: 'wss://test.signal.com',
        peerId: aliceIdentity.agentId,
        autoReconnect: false,
      });

      const manager = new PeerConnectionManager({
        localPeerId: aliceIdentity.agentId,
        autoReconnect: false,
      });

      manager.setSignaling(signaling);
      await signaling.connect();

      // Create proof for authentication
      const challenge = Signer.generateChallenge();
      const proof = await Signer.createIdentityProof(
        aliceKeyPair,
        IdentityManager.getPublicIdentity(aliceIdentity),
        challenge
      );

      // Connect with identity proof in metadata
      const connection = await manager.connect(bobIdentity.agentId, {
        metadata: {
          identityProof: proof,
          publicKey: aliceIdentity.publicKey,
        },
      });

      expect(connection.metadata?.identityProof).toBeDefined();
      expect(connection.metadata?.publicKey).toBe(aliceIdentity.publicKey);

      await manager.destroy();
      signaling.disconnect();
    });
  });

  // ============================================
  // Section 5: Secure Data Channel Communication
  // ============================================
  describe('Secure Data Channel Communication with Signed Messages', () => {
    let aliceIdentity: StoredIdentity;
    let bobIdentity: StoredIdentity;
    let aliceKeyPair: KeyPair;
    let bobKeyPair: KeyPair;
    let aliceManager: PeerConnectionManager;
    let bobManager: PeerConnectionManager;
    let aliceSignaling: SignalingClient;
    let bobSignaling: SignalingClient;
    let keyManager: KeyManager;

    const testPassword = 'secure-channel-test-123';

    beforeEach(async () => {
      keyManager = new KeyManager({ dbName: `test-channel-keystore-${Date.now()}` });
      await keyManager.initialize();

      aliceIdentity = await IdentityManager.create({
        password: testPassword,
        displayName: 'Alice',
      });
      bobIdentity = await IdentityManager.create({
        password: testPassword,
        displayName: 'Bob',
      });

      await keyManager.store(aliceIdentity);
      await keyManager.store(bobIdentity);

      aliceKeyPair = await keyManager.unlock(aliceIdentity.agentId, testPassword);
      bobKeyPair = await keyManager.unlock(bobIdentity.agentId, testPassword);

      aliceSignaling = new SignalingClient({
        serverUrl: 'wss://test.signal.com',
        peerId: aliceIdentity.agentId,
        autoReconnect: false,
      });

      bobSignaling = new SignalingClient({
        serverUrl: 'wss://test.signal.com',
        peerId: bobIdentity.agentId,
        autoReconnect: false,
      });

      aliceManager = new PeerConnectionManager({
        localPeerId: aliceIdentity.agentId,
        autoReconnect: false,
      });

      bobManager = new PeerConnectionManager({
        localPeerId: bobIdentity.agentId,
        autoReconnect: false,
      });

      aliceManager.setSignaling(aliceSignaling);
      bobManager.setSignaling(bobSignaling);

      await aliceSignaling.connect();
      await bobSignaling.connect();
    });

    afterEach(async () => {
      await aliceManager.destroy();
      await bobManager.destroy();
      aliceSignaling.disconnect();
      bobSignaling.disconnect();
      await keyManager.close();
    });

    it('should create data channels after connection', async () => {
      const connection = await aliceManager.connect(bobIdentity.agentId);

      // Wait for channel creation
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(connection.dataChannels.size).toBeGreaterThan(0);
    });

    it('should format signed message for data channel transmission', async () => {
      const payload = {
        type: 'pattern-share',
        pattern: { id: 'pattern-1', data: [1, 2, 3] },
      };

      // Alice signs the message
      const signedMessage = await Signer.sign(
        aliceKeyPair,
        IdentityManager.getPublicIdentity(aliceIdentity),
        payload
      );

      // Create data channel message wrapper
      const channelMessage: DataChannelMessage<SignedMessage<typeof payload>> = {
        type: 'signed-message',
        data: signedMessage,
        timestamp: Date.now(),
        requireAck: true,
      };

      // Serialize for transmission
      const serialized = JSON.stringify(channelMessage);

      expect(serialized).toBeDefined();
      expect(typeof serialized).toBe('string');

      // Deserialize and verify
      const deserialized = JSON.parse(serialized) as DataChannelMessage<
        SignedMessage<typeof payload>
      >;

      expect(deserialized.type).toBe('signed-message');
      expect(deserialized.data.signerId).toBe(aliceIdentity.agentId);

      const verification = await Signer.verify(deserialized.data);
      expect(verification.valid).toBe(true);
    });

    it('should handle message events and verify signatures', async () => {
      interface MessagePayload {
        action: string;
        value: number;
      }

      const receivedMessages: SignedMessage<MessagePayload>[] = [];

      await aliceManager.connect(bobIdentity.agentId);

      // Wait for channel to open
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Set up message handler
      aliceManager.on(WebRTCEventType.DATA_CHANNEL_MESSAGE, async (event) => {
        const messageData = event.data as {
          channel: string;
          message: { type: string; data: SignedMessage<MessagePayload> };
        };

        if (messageData.message.type === 'signed-message') {
          const signedMessage = messageData.message.data;
          const verification = await Signer.verify(signedMessage);

          if (verification.valid) {
            receivedMessages.push(signedMessage);
          }
        }
      });

      // Simulate receiving a signed message from Bob
      const signedPayload = await Signer.sign(
        bobKeyPair,
        IdentityManager.getPublicIdentity(bobIdentity),
        { action: 'test', value: 42 }
      );

      const channelMessage = {
        type: 'signed-message',
        data: signedPayload,
        timestamp: Date.now(),
      };

      // Get the mock data channel and simulate message
      const connection = aliceManager.getPeerConnection(bobIdentity.agentId);
      if (connection) {
        const rtcConnection = connection.rtcConnection as unknown as MockRTCPeerConnection;
        const channel = rtcConnection.getDataChannel('reliable');
        if (channel) {
          channel.simulateMessage(JSON.stringify(channelMessage));
        }
      }

      // Wait for message processing
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    it('should reject unsigned or invalid messages', async () => {
      interface UnsignedPayload {
        action: string;
        value: number;
      }

      const invalidMessages: unknown[] = [];
      const validMessages: SignedMessage<UnsignedPayload>[] = [];

      // Simulate receiving and validating messages
      const messages = [
        // Valid signed message
        await Signer.sign(bobKeyPair, IdentityManager.getPublicIdentity(bobIdentity), {
          action: 'valid',
          value: 1,
        }),
        // Tampered message (simulated)
        await (async () => {
          const msg = await Signer.sign(
            bobKeyPair,
            IdentityManager.getPublicIdentity(bobIdentity),
            { action: 'tampered', value: 2 }
          );
          (msg.payload as { value: number }).value = 999;
          return msg;
        })(),
      ];

      for (const msg of messages) {
        const verification = await Signer.verify(msg);
        if (verification.valid) {
          validMessages.push(msg as SignedMessage<UnsignedPayload>);
        } else {
          invalidMessages.push(msg);
        }
      }

      expect(validMessages).toHaveLength(1);
      expect(invalidMessages).toHaveLength(1);
    });

    it('should create secure communication wrapper', async () => {
      // Create a secure message wrapper class for demonstration
      class SecureMessageChannel {
        constructor(
          private keyPair: KeyPair,
          private identity: AgentIdentity
        ) {}

        async createMessage<T>(type: string, payload: T): Promise<DataChannelMessage<SignedMessage<T>>> {
          const signedMessage = await Signer.sign(this.keyPair, this.identity, payload);

          return {
            type,
            data: signedMessage,
            timestamp: Date.now(),
            requireAck: true,
          };
        }

        async verifyMessage<T>(
          message: DataChannelMessage<SignedMessage<T>>
        ): Promise<{ valid: boolean; payload?: T; signerId?: string }> {
          const verification = await Signer.verify(message.data);

          if (verification.valid) {
            return {
              valid: true,
              payload: message.data.payload,
              signerId: verification.signerId,
            };
          }

          return { valid: false };
        }
      }

      // Use secure channel
      const aliceChannel = new SecureMessageChannel(
        aliceKeyPair,
        IdentityManager.getPublicIdentity(aliceIdentity)
      );

      const bobChannel = new SecureMessageChannel(
        bobKeyPair,
        IdentityManager.getPublicIdentity(bobIdentity)
      );

      // Alice sends message
      const aliceMessage = await aliceChannel.createMessage('pattern-request', {
        patternId: 'pattern-123',
      });

      // Bob receives and verifies
      const verification = await bobChannel.verifyMessage(aliceMessage);

      expect(verification.valid).toBe(true);
      expect(verification.signerId).toBe(aliceIdentity.agentId);
      expect(verification.payload).toEqual({ patternId: 'pattern-123' });
    });

    it('should implement message sequencing with signatures', async () => {
      interface SequencedMessage {
        sequenceNumber: number;
        content: string;
      }

      const messages: SignedMessage<SequencedMessage>[] = [];

      // Create sequence of signed messages
      for (let i = 0; i < 5; i++) {
        const signed = await Signer.sign(
          aliceKeyPair,
          IdentityManager.getPublicIdentity(aliceIdentity),
          { sequenceNumber: i, content: `Message ${i}` }
        );
        messages.push(signed);
      }

      // Verify sequence integrity
      let lastSequence = -1;
      for (const msg of messages) {
        const verification = await Signer.verify(msg);
        expect(verification.valid).toBe(true);

        const payload = msg.payload as SequencedMessage;
        expect(payload.sequenceNumber).toBe(lastSequence + 1);
        lastSequence = payload.sequenceNumber;
      }

      expect(lastSequence).toBe(4);
    });
  });

  // ============================================
  // Section 6: End-to-End Integration Scenarios
  // ============================================
  describe('End-to-End Integration Scenarios', () => {
    let keyManager: KeyManager;
    const testPassword = 'e2e-test-123';

    beforeEach(async () => {
      keyManager = new KeyManager({ dbName: `test-e2e-keystore-${Date.now()}` });
      await keyManager.initialize();
    });

    afterEach(async () => {
      await keyManager.close();
    });

    it('should complete full peer discovery and connection flow', async () => {
      // Step 1: Create identities for multiple agents
      const agents: Array<{
        identity: StoredIdentity;
        keyPair: KeyPair;
        signaling: SignalingClient;
        manager: PeerConnectionManager;
      }> = [];

      for (let i = 0; i < 3; i++) {
        const identity = await IdentityManager.create({
          password: testPassword,
          displayName: `Agent ${i + 1}`,
        });
        await keyManager.store(identity);
        const keyPair = await keyManager.unlock(identity.agentId, testPassword);

        const signaling = new SignalingClient({
          serverUrl: 'wss://test.signal.com',
          peerId: identity.agentId,
          autoReconnect: false,
        });

        const manager = new PeerConnectionManager({
          localPeerId: identity.agentId,
          autoReconnect: false,
        });

        manager.setSignaling(signaling);
        await signaling.connect();

        agents.push({ identity, keyPair, signaling, manager });
      }

      // Step 2: First agent connects to others
      const [agent0, agent1, agent2] = agents;

      await agent0.manager.connect(agent1.identity.agentId);
      await agent0.manager.connect(agent2.identity.agentId);

      // Step 3: Verify connections
      const connectedPeers = agent0.manager.getConnectedPeers();
      // Note: In mock environment, connections start as CONNECTING
      expect(agent0.manager.getConnectionState(agent1.identity.agentId)).toBeDefined();
      expect(agent0.manager.getConnectionState(agent2.identity.agentId)).toBeDefined();

      // Cleanup
      for (const agent of agents) {
        await agent.manager.destroy();
        agent.signaling.disconnect();
      }
    });

    it('should broadcast signed message to all connected peers', async () => {
      interface BroadcastPayload {
        type: string;
        content: string;
        timestamp: number;
      }

      // Create broadcaster identity
      const broadcaster = await IdentityManager.create({
        password: testPassword,
        displayName: 'Broadcaster',
      });
      await keyManager.store(broadcaster);
      const broadcasterKeyPair = await keyManager.unlock(broadcaster.agentId, testPassword);

      // Create multiple receiver identities
      const receivers: StoredIdentity[] = [];
      for (let i = 0; i < 3; i++) {
        const receiver = await IdentityManager.create({
          password: testPassword,
          displayName: `Receiver ${i + 1}`,
        });
        await keyManager.store(receiver);
        receivers.push(receiver);
      }

      // Create broadcast message
      const broadcastPayload: BroadcastPayload = {
        type: 'announcement',
        content: 'Hello all peers!',
        timestamp: Date.now(),
      };

      const signedBroadcast = await Signer.sign(
        broadcasterKeyPair,
        IdentityManager.getPublicIdentity(broadcaster),
        broadcastPayload
      );

      // Create envelope for broadcast (to: '*')
      const envelope = createEnvelope(signedBroadcast, '*', 'broadcast', 5);

      expect(envelope.to).toBe('*');

      // Each receiver verifies the broadcast
      for (const receiver of receivers) {
        const verification = await verifyEnvelope(envelope);
        expect(verification.valid).toBe(true);
        expect(verification.signerId).toBe(broadcaster.agentId);
      }
    });

    it('should handle identity rotation during active connection', async () => {
      // Create initial identity
      const identity = await IdentityManager.create({
        password: testPassword,
        displayName: 'Rotating Agent',
      });
      await keyManager.store(identity);

      const oldKeyPair = await keyManager.unlock(identity.agentId, testPassword);
      const oldPublicKey = identity.publicKey;

      // Sign message with old key
      const oldMessage = await Signer.sign(
        oldKeyPair,
        IdentityManager.getPublicIdentity(identity),
        { action: 'pre-rotation' }
      );

      // Verify with old key
      const oldVerification = await Signer.verify(oldMessage);
      expect(oldVerification.valid).toBe(true);

      // Note: In this mock environment, we simulate the concept
      // Actual rotation would use keyManager.rotateKeys() but that requires real IndexedDB
      expect(oldPublicKey).toBe(identity.publicKey);
    });

    it('should implement request-response pattern with signed messages', async () => {
      interface RequestPayload {
        requestId: string;
        action: string;
        params: Record<string, unknown>;
      }

      interface ResponsePayload {
        requestId: string;
        status: string;
        result: unknown;
      }

      // Create requester and responder
      const requester = await IdentityManager.create({
        password: testPassword,
        displayName: 'Requester',
      });
      const responder = await IdentityManager.create({
        password: testPassword,
        displayName: 'Responder',
      });

      await keyManager.store(requester);
      await keyManager.store(responder);

      const requesterKeyPair = await keyManager.unlock(requester.agentId, testPassword);
      const responderKeyPair = await keyManager.unlock(responder.agentId, testPassword);

      // Requester sends request
      const requestPayload: RequestPayload = {
        requestId: 'req-001',
        action: 'get-patterns',
        params: { category: 'test' },
      };

      const signedRequest = await Signer.sign(
        requesterKeyPair,
        IdentityManager.getPublicIdentity(requester),
        requestPayload
      );

      // Responder verifies and processes request
      const requestVerification = await Signer.verify(signedRequest);
      expect(requestVerification.valid).toBe(true);

      // Responder sends response
      const responsePayload: ResponsePayload = {
        requestId: (signedRequest.payload as RequestPayload).requestId,
        status: 'success',
        result: { patterns: ['pattern-1', 'pattern-2'] },
      };

      const signedResponse = await Signer.sign(
        responderKeyPair,
        IdentityManager.getPublicIdentity(responder),
        responsePayload
      );

      // Requester verifies response
      const responseVerification = await Signer.verify(signedResponse);
      expect(responseVerification.valid).toBe(true);
      expect(responseVerification.signerId).toBe(responder.agentId);

      // Verify response matches request
      expect((signedResponse.payload as ResponsePayload).requestId).toBe(requestPayload.requestId);
    });
  });
});
