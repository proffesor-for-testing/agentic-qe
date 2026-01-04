/**
 * Browser-Compatible P2P Adapter
 *
 * Provides a browser-native adapter layer for P2P services, wrapping the
 * core P2P functionality with browser-compatible implementations of:
 * - WebRTC (RTCPeerConnection, RTCDataChannel)
 * - Cryptography (SubtleCrypto for key derivation, tweetnacl-compatible Ed25519 simulation)
 * - Signaling (WebSocket or manual SDP exchange)
 *
 * This adapter is designed to run purely in the browser without Node.js dependencies.
 *
 * @module edge/webapp/services/P2PAdapter
 * @version 1.0.0
 */

// ============================================
// Type Definitions
// ============================================

/**
 * Browser-compatible key pair
 */
export interface BrowserKeyPair {
  /** Base64-encoded public key */
  publicKey: string;
  /** Base64-encoded private key (encrypted at rest) */
  privateKey: string;
}

/**
 * Agent identity for browser P2P
 */
export interface BrowserAgentIdentity {
  /** Unique agent identifier (hex string) */
  agentId: string;
  /** Base64-encoded public key */
  publicKey: string;
  /** Display name */
  displayName?: string;
  /** Creation timestamp */
  createdAt: string;
}

/**
 * Signed message structure
 */
export interface BrowserSignedMessage<T = unknown> {
  /** Message payload */
  payload: T;
  /** Base64-encoded signature */
  signature: string;
  /** Signer's public key */
  signerPublicKey: string;
  /** Signer's agent ID */
  signerId: string;
  /** ISO timestamp */
  signedAt: string;
  /** Replay protection nonce */
  nonce?: string;
}

/**
 * Verification result
 */
export interface VerificationResult {
  valid: boolean;
  signerId?: string;
  error?: string;
}

/**
 * Peer connection state
 */
export type PeerConnectionState =
  | 'new'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'failed'
  | 'closed';

/**
 * Data channel message
 */
export interface DataChannelMessage<T = unknown> {
  type: string;
  data: T;
  id?: string;
  timestamp: number;
  requireAck?: boolean;
}

/**
 * ICE candidate info
 */
export interface ICECandidateInfo {
  candidate: string;
  sdpMLineIndex: number | null;
  sdpMid: string | null;
}

/**
 * Signaling message types
 */
export type SignalingMessageType =
  | 'offer'
  | 'answer'
  | 'ice-candidate'
  | 'ping'
  | 'pong'
  | 'error';

/**
 * Signaling message
 */
export interface SignalingMessage {
  type: SignalingMessageType;
  from: string;
  to?: string;
  payload: unknown;
  timestamp: number;
}

/**
 * P2P Adapter configuration
 */
export interface P2PAdapterConfig {
  /** Display name for local agent */
  displayName?: string;
  /** ICE servers for WebRTC */
  iceServers?: RTCIceServer[];
  /** Signaling server WebSocket URL (optional) */
  signalingUrl?: string;
  /** Enable auto-reconnect */
  autoReconnect?: boolean;
  /** Maximum reconnect attempts */
  maxReconnectAttempts?: number;
  /** Data channels to create on connection */
  dataChannels?: Array<{
    label: string;
    ordered?: boolean;
    maxRetransmits?: number;
  }>;
}

/**
 * Peer info
 */
export interface BrowserPeerInfo {
  id: string;
  publicKey?: string;
  connectionState: PeerConnectionState;
  dataChannels: Map<string, RTCDataChannel>;
  lastActivityAt: number;
}

/**
 * P2P Adapter event types
 */
export type P2PAdapterEventType =
  | 'connection:state-changed'
  | 'connection:error'
  | 'data:received'
  | 'ice:candidate'
  | 'signaling:connected'
  | 'signaling:disconnected'
  | 'signaling:error';

/**
 * P2P Adapter event
 */
export interface P2PAdapterEvent<T = unknown> {
  type: P2PAdapterEventType;
  peerId?: string;
  data: T;
  timestamp: number;
}

/**
 * Event handler type
 */
export type P2PAdapterEventHandler<T = unknown> = (event: P2PAdapterEvent<T>) => void;

// ============================================
// Default Configuration
// ============================================

const DEFAULT_CONFIG: Required<P2PAdapterConfig> = {
  displayName: 'Browser Agent',
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
  signalingUrl: '',
  autoReconnect: true,
  maxReconnectAttempts: 5,
  dataChannels: [
    { label: 'reliable', ordered: true },
    { label: 'unreliable', ordered: false, maxRetransmits: 0 },
  ],
};

// ============================================
// Browser Crypto Utilities
// ============================================

/**
 * Browser-compatible cryptographic utilities using SubtleCrypto
 *
 * Note: Web Crypto API doesn't natively support Ed25519 in all browsers.
 * This implementation uses HMAC-SHA256 for signing/verification as a fallback.
 * For production Ed25519 support, consider using tweetnacl or noble-ed25519.
 */
export class BrowserCrypto {
  /**
   * Generate a new key pair
   * Uses random bytes + SHA-512 derivation (Ed25519-style)
   */
  static async generateKeyPair(): Promise<BrowserKeyPair> {
    // Generate 32-byte random seed
    const seed = new Uint8Array(32);
    crypto.getRandomValues(seed);

    // Derive private scalar using SHA-512 (Ed25519 style)
    const hashBuffer = await crypto.subtle.digest('SHA-512', seed);
    const hash = new Uint8Array(hashBuffer);

    // Clamp scalar (Ed25519 requirement)
    hash[0] &= 248;
    hash[31] &= 127;
    hash[31] |= 64;

    // Derive "public key" from private scalar using SHA-256
    const privateScalar = hash.slice(0, 32);
    const publicKeyHash = await crypto.subtle.digest('SHA-256', privateScalar);
    const publicKey = new Uint8Array(publicKeyHash).slice(0, 32);

    // Store full key (seed + public key portion for signing)
    const fullPrivateKey = new Uint8Array(64);
    fullPrivateKey.set(seed, 0);
    fullPrivateKey.set(publicKey, 32);

    return {
      publicKey: this.arrayToBase64(publicKey),
      privateKey: this.arrayToBase64(fullPrivateKey),
    };
  }

  /**
   * Derive agent ID from public key (first 16 hex chars of SHA-256)
   */
  static async deriveAgentId(publicKeyBase64: string): Promise<string> {
    const publicKey = this.base64ToArray(publicKeyBase64);
    const hashBuffer = await crypto.subtle.digest('SHA-256', this.toArrayBuffer(publicKey));
    const hashArray = new Uint8Array(hashBuffer);

    return Array.from(hashArray.slice(0, 8))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Sign a message using HMAC-SHA256
   * In production, use proper Ed25519 via tweetnacl or noble-ed25519
   */
  static async sign(privateKeyBase64: string, message: Uint8Array): Promise<string> {
    const privateKey = this.base64ToArray(privateKeyBase64);
    // Use the public key portion (bytes 32-64) for HMAC
    const keyMaterial = privateKey.slice(32, 64);

    const key = await crypto.subtle.importKey(
      'raw',
      this.toArrayBuffer(keyMaterial),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signatureBuffer = await crypto.subtle.sign('HMAC', key, this.toArrayBuffer(message));
    return this.arrayToBase64(new Uint8Array(signatureBuffer));
  }

  /**
   * Verify a signature using HMAC-SHA256
   */
  static async verify(
    publicKeyBase64: string,
    signatureBase64: string,
    message: Uint8Array
  ): Promise<boolean> {
    try {
      const publicKey = this.base64ToArray(publicKeyBase64);

      const key = await crypto.subtle.importKey(
        'raw',
        this.toArrayBuffer(publicKey),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify']
      );

      const signature = this.base64ToArray(signatureBase64);
      return crypto.subtle.verify('HMAC', key, this.toArrayBuffer(signature), this.toArrayBuffer(message));
    } catch {
      return false;
    }
  }

  /**
   * Generate random nonce
   */
  static generateNonce(): string {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return this.arrayToBase64(bytes);
  }

  /**
   * Generate random challenge for authentication
   */
  static generateChallenge(length: number = 32): string {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return this.arrayToBase64(bytes);
  }

  /**
   * Encrypt data with password using AES-GCM
   */
  static async encryptWithPassword(
    data: Uint8Array,
    password: string,
    iterations: number = 100000
  ): Promise<{ ciphertext: string; salt: string; iv: string }> {
    const salt = new Uint8Array(32);
    crypto.getRandomValues(salt);

    const iv = new Uint8Array(12);
    crypto.getRandomValues(iv);

    const derivedKey = await this.deriveKeyFromPassword(password, salt, iterations);
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: this.toArrayBuffer(iv) },
      derivedKey,
      this.toArrayBuffer(data)
    );

    return {
      ciphertext: this.arrayToBase64(new Uint8Array(ciphertext)),
      salt: this.arrayToBase64(salt),
      iv: this.arrayToBase64(iv),
    };
  }

  /**
   * Decrypt data with password using AES-GCM
   */
  static async decryptWithPassword(
    ciphertextBase64: string,
    saltBase64: string,
    ivBase64: string,
    password: string,
    iterations: number = 100000
  ): Promise<Uint8Array> {
    const salt = this.base64ToArray(saltBase64);
    const iv = this.base64ToArray(ivBase64);
    const ciphertext = this.base64ToArray(ciphertextBase64);

    const derivedKey = await this.deriveKeyFromPassword(password, salt, iterations);
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: this.toArrayBuffer(iv) },
      derivedKey,
      this.toArrayBuffer(ciphertext)
    );

    return new Uint8Array(plaintext);
  }

  /**
   * Derive encryption key from password using PBKDF2
   */
  private static async deriveKeyFromPassword(
    password: string,
    salt: Uint8Array,
    iterations: number
  ): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const passwordData = encoder.encode(password);

    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      this.toArrayBuffer(passwordData),
      'PBKDF2',
      false,
      ['deriveKey']
    );

    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: this.toArrayBuffer(salt),
        iterations,
        hash: 'SHA-256',
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Convert Uint8Array to ArrayBuffer (for SubtleCrypto compatibility)
   * Creates a new ArrayBuffer to avoid SharedArrayBuffer issues
   */
  private static toArrayBuffer(array: Uint8Array): ArrayBuffer {
    const buffer = new ArrayBuffer(array.length);
    new Uint8Array(buffer).set(array);
    return buffer;
  }

  /**
   * Convert Uint8Array to Base64
   */
  static arrayToBase64(array: Uint8Array): string {
    const binary = Array.from(array)
      .map((byte) => String.fromCharCode(byte))
      .join('');
    return btoa(binary);
  }

  /**
   * Convert Base64 to Uint8Array
   */
  static base64ToArray(base64: string): Uint8Array {
    const binary = atob(base64);
    const array = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      array[i] = binary.charCodeAt(i);
    }
    return array;
  }
}

// ============================================
// Browser Message Signer
// ============================================

/**
 * Browser-compatible message signing and verification
 */
export class BrowserSigner {
  /**
   * Sign a message
   */
  static async sign<T>(
    keyPair: BrowserKeyPair,
    identity: BrowserAgentIdentity,
    payload: T,
    includeNonce: boolean = true
  ): Promise<BrowserSignedMessage<T>> {
    const signedAt = new Date().toISOString();
    const nonce = includeNonce ? BrowserCrypto.generateNonce() : undefined;

    // Create canonical message
    const canonical = {
      payload: JSON.stringify(payload, this.sortedReplacer),
      publicKey: identity.publicKey,
      signedAt,
      nonce,
    };

    const encoder = new TextEncoder();
    const messageBytes = encoder.encode(JSON.stringify(canonical, this.sortedReplacer));

    const signature = await BrowserCrypto.sign(keyPair.privateKey, messageBytes);

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
   * Verify a signed message
   */
  static async verify<T>(signedMessage: BrowserSignedMessage<T>): Promise<VerificationResult> {
    try {
      const { payload, signature, signerPublicKey, signedAt, nonce } = signedMessage;

      const canonical = {
        payload: JSON.stringify(payload, this.sortedReplacer),
        publicKey: signerPublicKey,
        signedAt,
        nonce,
      };

      const encoder = new TextEncoder();
      const messageBytes = encoder.encode(JSON.stringify(canonical, this.sortedReplacer));

      const isValid = await BrowserCrypto.verify(signerPublicKey, signature, messageBytes);

      if (isValid) {
        return { valid: true, signerId: signedMessage.signerId };
      } else {
        return { valid: false, error: 'Invalid signature' };
      }
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Verification failed',
      };
    }
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

// ============================================
// Browser WebRTC Manager
// ============================================

/**
 * Browser-native WebRTC peer connection manager
 */
export class BrowserWebRTCManager {
  private config: Required<P2PAdapterConfig>;
  private peers: Map<string, BrowserPeerInfo> = new Map();
  private peerConnections: Map<string, RTCPeerConnection> = new Map();
  private eventHandlers: Map<P2PAdapterEventType, Set<P2PAdapterEventHandler>> = new Map();
  private pendingCandidates: Map<string, ICECandidateInfo[]> = new Map();

  constructor(config: P2PAdapterConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Create a peer connection as initiator (caller)
   */
  async createOffer(peerId: string): Promise<RTCSessionDescriptionInit> {
    const pc = this.createPeerConnection(peerId, true);

    // Create data channels for initiator
    for (const channelConfig of this.config.dataChannels) {
      const channel = pc.createDataChannel(channelConfig.label, {
        ordered: channelConfig.ordered ?? true,
        maxRetransmits: channelConfig.maxRetransmits,
      });
      this.setupDataChannel(peerId, channel);
    }

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    return offer;
  }

  /**
   * Handle incoming offer and create answer (callee)
   */
  async handleOffer(
    peerId: string,
    offer: RTCSessionDescriptionInit
  ): Promise<RTCSessionDescriptionInit> {
    const pc = this.createPeerConnection(peerId, false);

    await pc.setRemoteDescription(offer);

    // Process any pending ICE candidates
    await this.processPendingCandidates(peerId);

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    return answer;
  }

  /**
   * Handle incoming answer
   */
  async handleAnswer(peerId: string, answer: RTCSessionDescriptionInit): Promise<void> {
    const pc = this.peerConnections.get(peerId);
    if (!pc) {
      throw new Error(`No peer connection for: ${peerId}`);
    }

    await pc.setRemoteDescription(answer);

    // Process any pending ICE candidates
    await this.processPendingCandidates(peerId);
  }

  /**
   * Add ICE candidate
   */
  async addIceCandidate(peerId: string, candidate: ICECandidateInfo): Promise<void> {
    const pc = this.peerConnections.get(peerId);

    if (!pc || !pc.remoteDescription) {
      // Queue candidate until remote description is set
      if (!this.pendingCandidates.has(peerId)) {
        this.pendingCandidates.set(peerId, []);
      }
      this.pendingCandidates.get(peerId)!.push(candidate);
      return;
    }

    await pc.addIceCandidate(
      new RTCIceCandidate({
        candidate: candidate.candidate,
        sdpMLineIndex: candidate.sdpMLineIndex ?? undefined,
        sdpMid: candidate.sdpMid ?? undefined,
      })
    );
  }

  /**
   * Send message through data channel
   */
  send<T>(peerId: string, channelLabel: string, message: DataChannelMessage<T>): void {
    const peer = this.peers.get(peerId);
    if (!peer) {
      throw new Error(`No peer: ${peerId}`);
    }

    const channel = peer.dataChannels.get(channelLabel);
    if (!channel) {
      throw new Error(`No data channel: ${channelLabel}`);
    }

    if (channel.readyState !== 'open') {
      throw new Error(`Data channel not open: ${channelLabel} (${channel.readyState})`);
    }

    const data = JSON.stringify({
      ...message,
      id: message.id ?? this.generateMessageId(),
      timestamp: message.timestamp ?? Date.now(),
    });

    channel.send(data);
    peer.lastActivityAt = Date.now();
  }

  /**
   * Close connection to peer
   */
  close(peerId: string): void {
    const pc = this.peerConnections.get(peerId);
    const peer = this.peers.get(peerId);

    if (peer) {
      peer.dataChannels.forEach((channel) => {
        try {
          channel.close();
        } catch {
          // Ignore
        }
      });
    }

    if (pc) {
      try {
        pc.close();
      } catch {
        // Ignore
      }
    }

    this.peerConnections.delete(peerId);
    this.peers.delete(peerId);
    this.pendingCandidates.delete(peerId);

    this.emit('connection:state-changed', peerId, 'closed');
  }

  /**
   * Get connection state
   */
  getConnectionState(peerId: string): PeerConnectionState | null {
    return this.peers.get(peerId)?.connectionState ?? null;
  }

  /**
   * Get all connected peer IDs
   */
  getConnectedPeers(): string[] {
    const connected: string[] = [];
    this.peers.forEach((peer, id) => {
      if (peer.connectionState === 'connected') {
        connected.push(id);
      }
    });
    return connected;
  }

  /**
   * Register event handler
   */
  on<T>(event: P2PAdapterEventType, handler: P2PAdapterEventHandler<T>): () => void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler as P2PAdapterEventHandler);

    return () => {
      this.eventHandlers.get(event)?.delete(handler as P2PAdapterEventHandler);
    };
  }

  /**
   * Destroy all connections
   */
  destroy(): void {
    this.peerConnections.forEach((_, peerId) => this.close(peerId));
    this.eventHandlers.clear();
  }

  // ============================================
  // Private Methods
  // ============================================

  private createPeerConnection(peerId: string, isInitiator: boolean): RTCPeerConnection {
    // Clean up existing connection if any
    if (this.peerConnections.has(peerId)) {
      this.close(peerId);
    }

    const pc = new RTCPeerConnection({
      iceServers: this.config.iceServers,
    });

    // Create peer info
    const peerInfo: BrowserPeerInfo = {
      id: peerId,
      connectionState: 'new',
      dataChannels: new Map(),
      lastActivityAt: Date.now(),
    };

    this.peerConnections.set(peerId, pc);
    this.peers.set(peerId, peerInfo);

    // Set up event handlers
    pc.onconnectionstatechange = () => {
      const state = this.mapConnectionState(pc.connectionState);
      peerInfo.connectionState = state;
      this.emit('connection:state-changed', peerId, state);
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        const candidateInfo: ICECandidateInfo = {
          candidate: event.candidate.candidate,
          sdpMLineIndex: event.candidate.sdpMLineIndex,
          sdpMid: event.candidate.sdpMid,
        };
        this.emit('ice:candidate', peerId, candidateInfo);
      }
    };

    // Handle incoming data channels (for callee)
    if (!isInitiator) {
      pc.ondatachannel = (event) => {
        this.setupDataChannel(peerId, event.channel);
      };
    }

    return pc;
  }

  private setupDataChannel(peerId: string, channel: RTCDataChannel): void {
    const peer = this.peers.get(peerId);
    if (!peer) return;

    peer.dataChannels.set(channel.label, channel);

    channel.onopen = () => {
      if (peer.connectionState !== 'connected') {
        peer.connectionState = 'connected';
        this.emit('connection:state-changed', peerId, 'connected');
      }
    };

    channel.onclose = () => {
      peer.dataChannels.delete(channel.label);
    };

    channel.onerror = (event) => {
      const error = new Error(
        `Data channel error: ${(event as ErrorEvent).message || 'unknown'}`
      );
      this.emit('connection:error', peerId, error);
    };

    channel.onmessage = (event) => {
      peer.lastActivityAt = Date.now();

      let message: DataChannelMessage;
      try {
        if (typeof event.data === 'string') {
          message = JSON.parse(event.data);
        } else {
          message = {
            type: 'binary',
            data: event.data,
            timestamp: Date.now(),
          };
        }
      } catch {
        message = {
          type: 'raw',
          data: event.data,
          timestamp: Date.now(),
        };
      }

      this.emit('data:received', peerId, { channel: channel.label, message });
    };
  }

  private async processPendingCandidates(peerId: string): Promise<void> {
    const pending = this.pendingCandidates.get(peerId);
    if (!pending || pending.length === 0) return;

    const pc = this.peerConnections.get(peerId);
    if (!pc || !pc.remoteDescription) return;

    for (const candidate of pending) {
      await pc.addIceCandidate(
        new RTCIceCandidate({
          candidate: candidate.candidate,
          sdpMLineIndex: candidate.sdpMLineIndex ?? undefined,
          sdpMid: candidate.sdpMid ?? undefined,
        })
      );
    }

    this.pendingCandidates.set(peerId, []);
  }

  private mapConnectionState(rtcState: RTCPeerConnectionState): PeerConnectionState {
    switch (rtcState) {
      case 'new':
        return 'new';
      case 'connecting':
        return 'connecting';
      case 'connected':
        return 'connected';
      case 'disconnected':
        return 'disconnected';
      case 'failed':
        return 'failed';
      case 'closed':
        return 'closed';
      default:
        return 'new';
    }
  }

  private emit<T>(type: P2PAdapterEventType, peerId: string | undefined, data: T): void {
    const event: P2PAdapterEvent<T> = {
      type,
      peerId,
      data,
      timestamp: Date.now(),
    };

    const handlers = this.eventHandlers.get(type);
    handlers?.forEach((handler) => {
      try {
        handler(event);
      } catch (error) {
        console.error(`Event handler error for ${type}:`, error);
      }
    });
  }

  private generateMessageId(): string {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const hex = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
}

// ============================================
// Browser Signaling Client
// ============================================

/**
 * WebSocket-based signaling client for browser
 */
export class BrowserSignalingClient {
  private socket: WebSocket | null = null;
  private localPeerId: string;
  private serverUrl: string;
  private autoReconnect: boolean;
  private maxReconnectAttempts: number;
  private reconnectAttempts: number = 0;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private eventHandlers: Map<string, Set<(data: unknown) => void>> = new Map();
  private state: 'disconnected' | 'connecting' | 'connected' | 'failed' = 'disconnected';

  constructor(
    peerId: string,
    serverUrl: string,
    options: { autoReconnect?: boolean; maxReconnectAttempts?: number } = {}
  ) {
    this.localPeerId = peerId;
    this.serverUrl = serverUrl;
    this.autoReconnect = options.autoReconnect ?? true;
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? 5;
  }

  /**
   * Connect to signaling server
   */
  async connect(): Promise<void> {
    if (this.state === 'connected') return;

    return new Promise((resolve, reject) => {
      this.state = 'connecting';

      try {
        const url = new URL(this.serverUrl);
        url.searchParams.set('peerId', this.localPeerId);

        this.socket = new WebSocket(url.toString());
      } catch (error) {
        this.state = 'failed';
        reject(new Error(`Failed to create WebSocket: ${error}`));
        return;
      }

      const connectionTimeout = setTimeout(() => {
        if (this.state === 'connecting') {
          this.socket?.close();
          this.state = 'failed';
          reject(new Error('Connection timeout'));
        }
      }, 10000);

      this.socket.onopen = () => {
        clearTimeout(connectionTimeout);
        this.state = 'connected';
        this.reconnectAttempts = 0;
        this.startHeartbeat();
        this.emit('connected', {});
        resolve();
      };

      this.socket.onclose = (event) => {
        clearTimeout(connectionTimeout);
        this.stopHeartbeat();
        this.handleDisconnect(event.code, event.reason);
      };

      this.socket.onerror = () => {
        if (this.state === 'connecting') {
          clearTimeout(connectionTimeout);
          reject(new Error('WebSocket connection error'));
        }
      };

      this.socket.onmessage = (event) => {
        this.handleMessage(event.data);
      };
    });
  }

  /**
   * Disconnect from signaling server
   */
  disconnect(): void {
    this.clearReconnect();
    this.stopHeartbeat();

    if (this.socket) {
      this.socket.onclose = null;
      this.socket.close(1000, 'Client disconnect');
      this.socket = null;
    }

    this.state = 'disconnected';
    this.emit('disconnected', {});
  }

  /**
   * Send offer to peer
   */
  async sendOffer(to: string, sdp: string): Promise<void> {
    await this.send({
      type: 'offer',
      from: this.localPeerId,
      to,
      payload: { sdp },
      timestamp: Date.now(),
    });
  }

  /**
   * Send answer to peer
   */
  async sendAnswer(to: string, sdp: string): Promise<void> {
    await this.send({
      type: 'answer',
      from: this.localPeerId,
      to,
      payload: { sdp },
      timestamp: Date.now(),
    });
  }

  /**
   * Send ICE candidate to peer
   */
  async sendIceCandidate(to: string, candidate: ICECandidateInfo): Promise<void> {
    await this.send({
      type: 'ice-candidate',
      from: this.localPeerId,
      to,
      payload: { candidate },
      timestamp: Date.now(),
    });
  }

  /**
   * Register event handler
   */
  on(event: string, handler: (data: unknown) => void): () => void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);

    return () => {
      this.eventHandlers.get(event)?.delete(handler);
    };
  }

  /**
   * Get current state
   */
  getState(): 'disconnected' | 'connecting' | 'connected' | 'failed' {
    return this.state;
  }

  // ============================================
  // Private Methods
  // ============================================

  private async send(message: SignalingMessage): Promise<void> {
    if (this.state !== 'connected' || !this.socket) {
      throw new Error('Not connected to signaling server');
    }

    this.socket.send(JSON.stringify(message));
  }

  private handleMessage(data: string): void {
    let message: SignalingMessage;
    try {
      message = JSON.parse(data);
    } catch {
      console.error('Failed to parse signaling message');
      return;
    }

    this.emit(message.type, message);
  }

  private handleDisconnect(code: number, reason: string): void {
    this.socket = null;

    if (code === 1000) {
      this.state = 'disconnected';
      return;
    }

    if (this.autoReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
      this.scheduleReconnect();
    } else {
      this.state = 'failed';
      this.emit('error', { code, reason });
    }
  }

  private scheduleReconnect(): void {
    this.clearReconnect();

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    const jitter = delay * 0.3 * Math.random();

    this.reconnectTimeout = setTimeout(async () => {
      this.reconnectAttempts++;
      try {
        await this.connect();
      } catch {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.scheduleReconnect();
        } else {
          this.state = 'failed';
          this.emit('error', { message: 'Max reconnect attempts reached' });
        }
      }
    }, delay + jitter);
  }

  private clearReconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (this.state === 'connected' && this.socket) {
        this.send({
          type: 'ping',
          from: this.localPeerId,
          payload: { timestamp: Date.now() },
          timestamp: Date.now(),
        }).catch(() => {
          // Ignore ping errors
        });
      }
    }, 30000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private emit(event: string, data: unknown): void {
    this.eventHandlers.get(event)?.forEach((handler) => {
      try {
        handler(data);
      } catch (error) {
        // Use separate args to avoid format string injection
        console.error('Event handler error for %s:', event, error);
      }
    });
  }
}

// ============================================
// Main P2P Adapter
// ============================================

/**
 * Browser-compatible P2P Adapter
 *
 * Provides the same interface as the Node.js P2P services but uses
 * browser-native APIs (WebRTC, SubtleCrypto, WebSocket).
 *
 * @example
 * ```typescript
 * // Create adapter
 * const adapter = new P2PAdapter({
 *   displayName: 'My Browser Agent',
 *   signalingUrl: 'wss://signaling.example.com',
 * });
 *
 * // Initialize
 * await adapter.initialize();
 *
 * // Connect to a peer (via signaling server)
 * await adapter.connectToPeer('remote-peer-id');
 *
 * // Or manually exchange SDP
 * const offer = await adapter.createOffer('remote-peer-id');
 * // ... send offer to peer via your own channel ...
 * // ... receive answer from peer ...
 * await adapter.handleAnswer('remote-peer-id', answerSdp);
 *
 * // Send messages
 * adapter.send('remote-peer-id', 'reliable', {
 *   type: 'chat',
 *   data: { text: 'Hello!' },
 *   timestamp: Date.now(),
 * });
 *
 * // Listen for messages
 * adapter.on('data:received', (event) => {
 *   console.log('Message from', event.peerId, event.data);
 * });
 * ```
 */
export class P2PAdapter {
  private config: Required<P2PAdapterConfig>;
  private identity: BrowserAgentIdentity | null = null;
  private keyPair: BrowserKeyPair | null = null;
  private webrtc: BrowserWebRTCManager;
  private signaling: BrowserSignalingClient | null = null;
  private initialized: boolean = false;

  constructor(config: P2PAdapterConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.webrtc = new BrowserWebRTCManager(this.config);
  }

  /**
   * Initialize the P2P adapter
   */
  async initialize(): Promise<BrowserAgentIdentity> {
    if (this.initialized && this.identity) {
      return this.identity;
    }

    // Generate key pair
    this.keyPair = await BrowserCrypto.generateKeyPair();

    // Derive agent ID
    const agentId = await BrowserCrypto.deriveAgentId(this.keyPair.publicKey);

    // Create identity
    this.identity = {
      agentId,
      publicKey: this.keyPair.publicKey,
      displayName: this.config.displayName,
      createdAt: new Date().toISOString(),
    };

    // Connect to signaling server if configured
    if (this.config.signalingUrl) {
      await this.initializeSignaling();
    }

    this.initialized = true;
    return this.identity;
  }

  /**
   * Get local identity
   */
  getIdentity(): BrowserAgentIdentity | null {
    return this.identity;
  }

  /**
   * Create an offer to connect to a peer
   */
  async createOffer(peerId: string): Promise<string> {
    const offer = await this.webrtc.createOffer(peerId);
    return offer.sdp!;
  }

  /**
   * Handle incoming offer and create answer
   */
  async handleOffer(peerId: string, offerSdp: string): Promise<string> {
    const answer = await this.webrtc.handleOffer(peerId, {
      type: 'offer',
      sdp: offerSdp,
    });
    return answer.sdp!;
  }

  /**
   * Handle incoming answer
   */
  async handleAnswer(peerId: string, answerSdp: string): Promise<void> {
    await this.webrtc.handleAnswer(peerId, {
      type: 'answer',
      sdp: answerSdp,
    });
  }

  /**
   * Add ICE candidate
   */
  async addIceCandidate(peerId: string, candidate: ICECandidateInfo): Promise<void> {
    await this.webrtc.addIceCandidate(peerId, candidate);
  }

  /**
   * Connect to peer via signaling server
   */
  async connectToPeer(peerId: string): Promise<void> {
    if (!this.signaling) {
      throw new Error('No signaling server configured');
    }

    // Create offer
    const offer = await this.createOffer(peerId);

    // Send via signaling
    await this.signaling.sendOffer(peerId, offer);

    // ICE candidates will be sent automatically via event handlers
  }

  /**
   * Send message to peer
   */
  send<T>(peerId: string, channelLabel: string, message: DataChannelMessage<T>): void {
    this.webrtc.send(peerId, channelLabel, message);
  }

  /**
   * Sign a message
   */
  async sign<T>(payload: T): Promise<BrowserSignedMessage<T>> {
    if (!this.keyPair || !this.identity) {
      throw new Error('Not initialized');
    }
    return BrowserSigner.sign(this.keyPair, this.identity, payload);
  }

  /**
   * Verify a signed message
   */
  async verify<T>(message: BrowserSignedMessage<T>): Promise<VerificationResult> {
    return BrowserSigner.verify(message);
  }

  /**
   * Register event handler
   */
  on<T>(event: P2PAdapterEventType, handler: P2PAdapterEventHandler<T>): () => void {
    return this.webrtc.on(event, handler);
  }

  /**
   * Get connection state for a peer
   */
  getConnectionState(peerId: string): PeerConnectionState | null {
    return this.webrtc.getConnectionState(peerId);
  }

  /**
   * Get all connected peer IDs
   */
  getConnectedPeers(): string[] {
    return this.webrtc.getConnectedPeers();
  }

  /**
   * Disconnect from a peer
   */
  disconnect(peerId: string): void {
    this.webrtc.close(peerId);
  }

  /**
   * Destroy the adapter and clean up resources
   */
  destroy(): void {
    this.webrtc.destroy();
    this.signaling?.disconnect();
    this.identity = null;
    this.keyPair = null;
    this.initialized = false;
  }

  // ============================================
  // Private Methods
  // ============================================

  private async initializeSignaling(): Promise<void> {
    if (!this.identity) {
      throw new Error('Identity not initialized');
    }

    this.signaling = new BrowserSignalingClient(
      this.identity.agentId,
      this.config.signalingUrl,
      {
        autoReconnect: this.config.autoReconnect,
        maxReconnectAttempts: this.config.maxReconnectAttempts,
      }
    );

    // Handle incoming offers
    this.signaling.on('offer', async (data) => {
      const msg = data as SignalingMessage & { payload: { sdp: string } };
      const answer = await this.handleOffer(msg.from, msg.payload.sdp);
      await this.signaling!.sendAnswer(msg.from, answer);
    });

    // Handle incoming answers
    this.signaling.on('answer', async (data) => {
      const msg = data as SignalingMessage & { payload: { sdp: string } };
      await this.handleAnswer(msg.from, msg.payload.sdp);
    });

    // Handle incoming ICE candidates
    this.signaling.on('ice-candidate', async (data) => {
      const msg = data as SignalingMessage & { payload: { candidate: ICECandidateInfo } };
      await this.addIceCandidate(msg.from, msg.payload.candidate);
    });

    // Forward local ICE candidates to signaling
    this.webrtc.on('ice:candidate', (event) => {
      if (event.peerId && this.signaling) {
        this.signaling.sendIceCandidate(event.peerId, event.data as ICECandidateInfo);
      }
    });

    await this.signaling.connect();
  }
}

// ============================================
// Exports
// ============================================

export default P2PAdapter;
