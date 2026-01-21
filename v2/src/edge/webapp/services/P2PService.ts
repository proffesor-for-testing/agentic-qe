/**
 * P2P Service
 *
 * Service layer that integrates the web dashboard with the P2P foundation modules.
 * Provides a unified API for managing connections, patterns, and CRDT state.
 *
 * @module edge/webapp/services/P2PService
 */

import type {
  DashboardState,
  AgentInfo,
  PeerInfo,
  SystemMetrics,
  P2PServiceConfig,
  P2PService as IP2PService,
  WebAppEvent,
  WebAppEventHandler,
} from '../types';

// Import P2P modules
import { PatternIndex, PatternSerializer, PatternCategory } from '../../p2p/sharing';
import { CRDTStore, GCounter, ORSet } from '../../p2p/crdt';
import { CRDTEventType, CRDTType, type CRDTEvent } from '../../p2p/crdt/types';
import { HealthMonitor } from '../../p2p/coordination';
import { SignalingClient, SignalingEventHandlers } from '../../p2p/webrtc/SignalingClient';
import { SignalingClientState, PeerId } from '../../p2p/webrtc/types';

// ============================================
// Default Configuration
// ============================================

const DEFAULT_CONFIG: P2PServiceConfig = {
  autoConnect: true,
  webrtc: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ],
    enableDataChannel: true,
  },
  signaling: {
    serverUrl: 'ws://localhost:3002',
    roomId: 'agentic-qe-default',
    autoReconnect: true,
  },
  agentApi: {
    baseUrl: 'http://localhost:3001',
  },
  patternSync: {
    autoSync: true,
    syncInterval: 30000,
  },
  crdt: {
    enableDeltaSync: true,
    conflictResolution: 'lww',
  },
};

// ============================================
// Helper to generate agent ID
// ============================================

function generateAgentId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16);
}

function generatePublicKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

// ============================================
// Initial State
// ============================================

const createInitialState = (): DashboardState => ({
  connectionStatus: 'disconnected',
  localAgent: null,
  peers: [],
  patterns: {
    total: 0,
    local: 0,
    synced: 0,
    pending: 0,
    categories: {},
  },
  crdt: {
    stores: [],
    totalOperations: 0,
    conflictsResolved: 0,
    lastSync: 0,
  },
  tests: {
    running: [],
    completed: [],
    queued: 0,
  },
  metrics: {
    memoryUsage: 0,
    cpuUsage: 0,
    networkLatency: 0,
    messagesPerSecond: 0,
    uptime: 0,
  },
});

// ============================================
// P2P Service Implementation
// ============================================

export class P2PServiceImpl implements IP2PService {
  private config: P2PServiceConfig;
  private state: DashboardState;
  private subscribers: Set<(state: DashboardState) => void> = new Set();
  private eventHandlers: Set<WebAppEventHandler> = new Set();

  // P2P module instances
  private agentId: string | null = null;
  private publicKey: string | null = null;
  private patternIndex: PatternIndex | null = null;
  private patternSerializer: PatternSerializer | null = null;
  private crdtStore: CRDTStore | null = null;
  private healthMonitors: Map<string, HealthMonitor> = new Map();
  private signalingClient: SignalingClient | null = null;
  private peerConnections: Map<string, RTCPeerConnection> = new Map();
  private dataChannels: Map<string, RTCDataChannel> = new Map();

  // Internal state
  private startTime: number = 0;
  private messageCount: number = 0;
  private syncInterval: ReturnType<typeof setInterval> | null = null;
  private metricsInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: Partial<P2PServiceConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.state = createInitialState();
  }

  // ============================================
  // Initialization
  // ============================================

  async init(): Promise<void> {
    try {
      this.updateState({ connectionStatus: 'connecting' });
      this.startTime = Date.now();

      // Initialize identity (simplified for browser - no password protection)
      this.initIdentity();

      // Initialize CRDT store
      this.initCRDTStore();

      // Initialize pattern index
      this.initPatternIndex();

      // Initialize signaling client
      await this.initSignaling();

      // Start metrics collection
      this.startMetricsCollection();

      // Start sync if enabled
      if (this.config.patternSync.autoSync) {
        this.startAutoSync();
      }

      this.updateState({ connectionStatus: 'connected' });
      this.emit({ type: 'peer:connected', peer: this.state.peers[0] || {} as PeerInfo });

    } catch (error) {
      this.updateState({ connectionStatus: 'error' });
      this.emit({ type: 'error', message: (error as Error).message });
      throw error;
    }
  }

  private async initSignaling(): Promise<void> {
    if (!this.agentId) {
      throw new Error('Agent ID not initialized');
    }

    // Create signaling client
    this.signalingClient = new SignalingClient({
      serverUrl: this.config.signaling.serverUrl,
      peerId: this.agentId,
      autoReconnect: this.config.signaling.autoReconnect,
    });

    // Set up signaling event handlers
    const handlers: SignalingEventHandlers = {
      onPeerJoined: (peerId: PeerId, metadata?: Record<string, unknown>) => {
        console.log(`[P2P] Peer joined room: ${peerId}`);
        this.handleRemotePeerJoined(peerId, metadata);
      },

      onPeerLeft: (peerId: PeerId, reason?: string) => {
        console.log(`[P2P] Peer left room: ${peerId} (${reason})`);
        this.handleRemotePeerLeft(peerId);
      },

      onOffer: async (from: PeerId, sdp: string) => {
        console.log(`[P2P] Received offer from: ${from}`);
        await this.handleOffer(from, sdp);
      },

      onAnswer: async (from: PeerId, sdp: string) => {
        console.log(`[P2P] Received answer from: ${from}`);
        await this.handleAnswer(from, sdp);
      },

      onIceCandidate: async (from: PeerId, candidate) => {
        await this.handleIceCandidate(from, candidate);
      },

      onRoomInfo: (roomId, peers) => {
        console.log(`[P2P] Room info: ${roomId} with ${peers.length} peers`);
        for (const peer of peers) {
          this.handleRemotePeerJoined(peer.id, peer.metadata);
        }
      },

      onError: (code, message) => {
        console.error(`[P2P] Signaling error: ${code} - ${message}`);
        this.emit({ type: 'error', message: `Signaling: ${message}` });
      },

      onStateChange: (state: SignalingClientState) => {
        console.log(`[P2P] Signaling state: ${state}`);
        if (state === SignalingClientState.CONNECTED) {
          this.updateState({ connectionStatus: 'connected' });
        } else if (state === SignalingClientState.RECONNECTING) {
          this.updateState({ connectionStatus: 'connecting' });
        } else if (state === SignalingClientState.FAILED) {
          this.updateState({ connectionStatus: 'error' });
        }
      },
    };

    this.signalingClient.on(handlers);

    // Connect to signaling server
    try {
      await this.signalingClient.connect();
      console.log(`[P2P] Connected to signaling server: ${this.config.signaling.serverUrl}`);

      // Join the default room
      const roomId = this.config.signaling.roomId || 'agentic-qe-default';
      await this.signalingClient.joinRoom(roomId);
      console.log(`[P2P] Joined room: ${roomId}`);
    } catch (error) {
      console.warn(`[P2P] Signaling connection failed: ${(error as Error).message}`);
      // Don't throw - allow offline mode
    }
  }

  private handleRemotePeerJoined(peerId: PeerId, metadata?: Record<string, unknown>): void {
    // Don't add ourselves
    if (peerId === this.agentId) return;

    // Check if peer already exists
    const existingPeer = this.state.peers.find(p => p.id === peerId);
    if (existingPeer) return;

    const peer: PeerInfo = {
      id: peerId,
      publicKey: (metadata?.publicKey as string) || '',
      connectionState: 'new',
      latencyMs: 0,
      lastSeen: Date.now(),
      patternsShared: 0,
    };

    this.addPeer(peer);
    this.emit({ type: 'peer:discovered', peer });

    // Initiate WebRTC connection to the new peer
    this.connect(peerId).catch((error) => {
      console.error(`[P2P] Failed to connect to peer ${peerId}:`, error);
    });
  }

  private handleRemotePeerLeft(peerId: PeerId): void {
    // Close RTCPeerConnection if exists
    const rtcConn = this.peerConnections.get(peerId);
    if (rtcConn) {
      rtcConn.close();
      this.peerConnections.delete(peerId);
    }

    // Stop health monitor
    const healthMonitor = this.healthMonitors.get(peerId);
    if (healthMonitor) {
      healthMonitor.stop();
      this.healthMonitors.delete(peerId);
    }

    this.removePeer(peerId);
    this.emit({ type: 'peer:disconnected', peerId });
  }

  private async handleOffer(from: PeerId, sdp: string): Promise<void> {
    if (!this.signalingClient) return;

    // Create RTCPeerConnection if it doesn't exist
    let rtcConn = this.peerConnections.get(from);
    if (!rtcConn) {
      rtcConn = this.createRTCConnection(from);
    }

    try {
      // Set remote description
      await rtcConn.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp }));

      // Create and set local answer
      const answer = await rtcConn.createAnswer();
      await rtcConn.setLocalDescription(answer);

      // Send answer via signaling
      await this.signalingClient.sendAnswer(from, answer.sdp!);
    } catch (error) {
      console.error(`[P2P] Failed to handle offer from ${from}:`, error);
    }
  }

  private async handleAnswer(from: PeerId, sdp: string): Promise<void> {
    const rtcConn = this.peerConnections.get(from);
    if (!rtcConn) {
      console.warn(`[P2P] Received answer from unknown peer: ${from}`);
      return;
    }

    try {
      await rtcConn.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp }));
    } catch (error) {
      console.error(`[P2P] Failed to handle answer from ${from}:`, error);
    }
  }

  private async handleIceCandidate(from: PeerId, candidate: { candidate: string; sdpMid: string | null; sdpMLineIndex: number | null }): Promise<void> {
    const rtcConn = this.peerConnections.get(from);
    if (!rtcConn) {
      console.warn(`[P2P] Received ICE candidate from unknown peer: ${from}`);
      return;
    }

    try {
      await rtcConn.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      console.error(`[P2P] Failed to add ICE candidate from ${from}:`, error);
    }
  }

  private createRTCConnection(peerId: PeerId): RTCPeerConnection {
    const rtcConn = new RTCPeerConnection({
      iceServers: this.config.webrtc.iceServers,
    });

    // Store the connection
    this.peerConnections.set(peerId, rtcConn);

    // Handle ICE candidates
    rtcConn.onicecandidate = (event) => {
      if (event.candidate && this.signalingClient) {
        // Extract candidate type from the candidate string
        const candidateStr = event.candidate.candidate;
        let candidateType: 'host' | 'srflx' | 'prflx' | 'relay' | 'unknown' = 'unknown';
        if (candidateStr.includes(' host ')) candidateType = 'host';
        else if (candidateStr.includes(' srflx ')) candidateType = 'srflx';
        else if (candidateStr.includes(' prflx ')) candidateType = 'prflx';
        else if (candidateStr.includes(' relay ')) candidateType = 'relay';

        this.signalingClient.sendIceCandidate(peerId, {
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid,
          sdpMLineIndex: event.candidate.sdpMLineIndex,
          usernameFragment: event.candidate.usernameFragment,
          type: candidateType,
          priority: 0, // Priority is extracted from candidate string, using 0 as default
        }).catch((error) => {
          console.error(`[P2P] Failed to send ICE candidate:`, error);
        });
      }
    };

    // Handle connection state changes
    rtcConn.onconnectionstatechange = () => {
      const state = rtcConn.connectionState;
      console.log(`[P2P] Connection state with ${peerId}: ${state}`);

      const mappedState: PeerInfo['connectionState'] =
        state === 'connected' ? 'connected' :
        state === 'connecting' ? 'connecting' :
        state === 'disconnected' ? 'disconnected' :
        state === 'failed' ? 'failed' : 'new';

      this.updatePeer(peerId, { connectionState: mappedState });

      if (state === 'connected') {
        this.emit({ type: 'peer:connected', peer: this.state.peers.find(p => p.id === peerId)! });
      } else if (state === 'failed' || state === 'disconnected') {
        this.emit({ type: 'peer:disconnected', peerId });
      }
    };

    // Handle data channel (for receiving)
    rtcConn.ondatachannel = (event) => {
      const channel = event.channel;
      console.log(`[P2P] Received data channel: ${channel.label} from ${peerId}`);
      this.setupDataChannel(peerId, channel);
    };

    return rtcConn;
  }

  private setupDataChannel(peerId: PeerId, channel: RTCDataChannel): void {
    // Store reference to data channel for later use
    this.dataChannels.set(peerId, channel);

    channel.onopen = () => {
      console.log(`[P2P] Data channel open with ${peerId}`);
    };

    channel.onclose = () => {
      console.log(`[P2P] Data channel closed with ${peerId}`);
      this.dataChannels.delete(peerId);
    };

    channel.onmessage = (event) => {
      this.messageCount++;
      try {
        const message = JSON.parse(event.data);
        this.handleDataChannelMessage(peerId, message);
      } catch (error) {
        console.error(`[P2P] Failed to parse message from ${peerId}:`, error);
      }
    };
  }

  private handleDataChannelMessage(peerId: PeerId, message: { type: string; payload: unknown }): void {
    switch (message.type) {
      case 'pattern': {
        const patternData = message.payload as {
          id: string;
          category: string;
          content: string;
          embedding: number[];
          metadata: Record<string, unknown>;
        };

        console.log(`[P2P] Received pattern ${patternData.id} from ${peerId}`);

        // Add pattern to local index if it doesn't exist
        if (this.patternIndex && this.patternSerializer) {
          const existing = this.patternIndex.get(patternData.id);
          if (!existing) {
            const pattern = this.patternSerializer.createPattern(
              patternData.id,
              patternData.category as PatternCategory,
              'qe-pattern',
              peerId,
              patternData.content,
              patternData.embedding,
              patternData.metadata
            );
            this.patternIndex.add(pattern);
            console.log(`[P2P] Added pattern ${patternData.id} to local index`);
          }
        }

        this.emit({ type: 'pattern:received', patternId: patternData.id, from: peerId });
        break;
      }
      case 'crdt-delta':
        this.emit({ type: 'crdt:updated', storeId: (message.payload as { storeId: string }).storeId });
        break;
      case 'ping':
        // Handle ping for latency measurement
        break;
      case 'sync-request':
        // Handle sync request from peer
        this.handleSyncRequest(peerId);
        break;
      default:
        console.log(`[P2P] Unknown message type: ${message.type}`);
    }
  }

  private handleSyncRequest(peerId: PeerId): void {
    const channel = this.dataChannels.get(peerId);
    if (!channel || channel.readyState !== 'open') {
      console.warn(`[P2P] Cannot respond to sync request - no open channel to ${peerId}`);
      return;
    }

    // Send all patterns to the requesting peer
    if (this.patternIndex) {
      const patterns = this.patternIndex.search('*', 100);
      for (const pattern of patterns) {
        const message = JSON.stringify({
          type: 'pattern',
          payload: {
            id: pattern.id,
            category: pattern.category,
            content: pattern.content,
            embedding: pattern.embedding,
            metadata: pattern.metadata,
          },
        });
        channel.send(message);
        this.messageCount++;
      }
      console.log(`[P2P] Sent ${patterns.length} patterns to ${peerId} in response to sync request`);
    }
  }

  private initIdentity(): void {
    // Generate simple identity for browser dashboard
    this.agentId = generateAgentId();
    this.publicKey = generatePublicKey();

    // Update state with agent info
    const agentInfo: AgentInfo = {
      id: this.agentId,
      publicKey: this.publicKey,
      createdAt: Date.now(),
      capabilities: ['p2p', 'patterns', 'crdt', 'coordination'],
    };

    this.updateState({ localAgent: agentInfo });
  }

  private initCRDTStore(): void {
    if (!this.agentId) return;

    // CRDTStore requires replicaId
    this.crdtStore = new CRDTStore({
      replicaId: this.agentId,
      enableDeltas: this.config.crdt.enableDeltaSync,
    });

    // Create default CRDTs using proper methods
    this.crdtStore.createGCounter('patterns-counter');
    this.crdtStore.createLWWRegister('shared-config');
    this.crdtStore.createORSet<string>('active-peers');

    // Subscribe to CRDT events using the proper handler signature
    this.crdtStore.on((event: CRDTEvent) => {
      if (event.type === CRDTEventType.Update || event.type === CRDTEventType.Merge) {
        this.updateCRDTState();
        this.emit({ type: 'crdt:updated', storeId: event.crdtId });
      } else if (event.type === CRDTEventType.Conflict) {
        this.emit({ type: 'crdt:conflict', storeId: event.crdtId, resolved: true });
      }
    });

    this.updateCRDTState();
  }

  private initPatternIndex(): void {
    this.patternIndex = new PatternIndex({
      maxPatterns: 10000,
      embeddingDimension: 128,
    });

    this.patternSerializer = new PatternSerializer();

    this.updatePatternStats();
  }

  // ============================================
  // Connection Management
  // ============================================

  async connect(peerId: string): Promise<void> {
    if (!this.agentId) {
      throw new Error('Service not initialized');
    }

    if (!this.signalingClient) {
      throw new Error('Signaling client not initialized');
    }

    try {
      // Check if peer already exists
      let peer = this.state.peers.find(p => p.id === peerId);
      if (!peer) {
        peer = {
          id: peerId,
          publicKey: '',
          connectionState: 'connecting',
          latencyMs: 0,
          lastSeen: Date.now(),
          patternsShared: 0,
        };
        this.addPeer(peer);
      } else {
        this.updatePeer(peerId, { connectionState: 'connecting' });
      }

      // Create RTCPeerConnection
      let rtcConn = this.peerConnections.get(peerId);
      if (!rtcConn) {
        rtcConn = this.createRTCConnection(peerId);
      }

      // Create data channel for communication
      const dataChannel = rtcConn.createDataChannel('agentic-qe', {
        ordered: true,
      });
      this.setupDataChannel(peerId, dataChannel);

      // Create and send offer
      const offer = await rtcConn.createOffer();
      await rtcConn.setLocalDescription(offer);
      await this.signalingClient.sendOffer(peerId, offer.sdp!);

      // Create health monitor for this peer
      const healthMonitor = new HealthMonitor({
        peerId,
        pingInterval: 5000,
        onPing: async (sequence: number) => {
          // Send ping message to peer via data channel
          this.messageCount++;
          if (dataChannel.readyState === 'open') {
            dataChannel.send(JSON.stringify({ type: 'ping', payload: { sequence, timestamp: Date.now() } }));
          }
        },
        onHealthChange: (health) => {
          // Update peer health status
          const currentPeer = this.state.peers.find(p => p.id === peerId);
          if (currentPeer) {
            this.updatePeer(peerId, {
              latencyMs: health.currentRttMs,
            });
          }
        },
      });
      this.healthMonitors.set(peerId, healthMonitor);
      healthMonitor.start();

      // Add to CRDT active peers set
      const activePeers = this.crdtStore?.getORSet<string>('active-peers');
      if (activePeers) {
        activePeers.add(peerId);
      }

      console.log(`[P2P] WebRTC offer sent to ${peerId}`);

    } catch (error) {
      this.updatePeer(peerId, { connectionState: 'failed' });
      this.emit({ type: 'error', message: `Failed to connect to ${peerId}: ${(error as Error).message}` });
      throw error;
    }
  }

  async disconnect(peerId: string): Promise<void> {
    const peer = this.state.peers.find(p => p.id === peerId);
    if (!peer) return;

    // Stop health monitor
    const healthMonitor = this.healthMonitors.get(peerId);
    if (healthMonitor) {
      healthMonitor.stop();
      this.healthMonitors.delete(peerId);
    }

    // Remove from active peers
    const activePeers = this.crdtStore?.getORSet<string>('active-peers');
    if (activePeers) {
      activePeers.remove(peerId);
    }

    this.removePeer(peerId);
    this.emit({ type: 'peer:disconnected', peerId });
  }

  // ============================================
  // Pattern Sharing
  // ============================================

  async sharePattern(patternId: string, peerIds?: string[]): Promise<void> {
    if (!this.patternIndex) {
      throw new Error('Pattern service not initialized');
    }

    const pattern = this.patternIndex.get(patternId);
    if (!pattern) {
      throw new Error(`Pattern ${patternId} not found`);
    }

    const targetPeers = peerIds || this.state.peers.map(p => p.id);

    for (const peerId of targetPeers) {
      const channel = this.dataChannels.get(peerId);
      if (!channel || channel.readyState !== 'open') {
        console.warn(`[P2P] No open data channel to peer ${peerId}, skipping pattern share`);
        continue;
      }

      try {
        const message = JSON.stringify({
          type: 'pattern',
          payload: {
            id: pattern.id,
            category: pattern.category,
            content: pattern.content,
            embedding: pattern.embedding,
            metadata: pattern.metadata,
          },
        });

        // Send pattern over data channel
        channel.send(message);
        this.messageCount++;

        this.emit({ type: 'pattern:shared', patternId, peerId });
        console.log(`[P2P] Pattern ${patternId} sent to peer ${peerId}`);

        this.updatePeer(peerId, {
          patternsShared: (this.state.peers.find(p => p.id === peerId)?.patternsShared || 0) + 1,
        });
      } catch (error) {
        console.error(`[P2P] Failed to share pattern with ${peerId}:`, error);
      }
    }

    // Update pattern counter
    const counter = this.crdtStore?.getGCounter('patterns-counter');
    if (counter) {
      counter.increment();
    }

    this.updatePatternStats();
  }

  async syncPatterns(peerIds?: string[]): Promise<number> {
    const targetPeers = peerIds || this.state.peers.map(p => p.id);
    let patternsReceived = 0;

    for (const peerId of targetPeers) {
      const channel = this.dataChannels.get(peerId);
      if (!channel || channel.readyState !== 'open') {
        console.warn(`[P2P] No open data channel to peer ${peerId}, skipping sync`);
        continue;
      }

      try {
        // Send sync request to peer
        const message = JSON.stringify({
          type: 'sync-request',
          payload: { timestamp: Date.now() },
        });
        channel.send(message);
        this.messageCount++;

        console.log(`[P2P] Sent sync request to peer ${peerId}`);
      } catch (error) {
        console.error(`[P2P] Failed to sync with ${peerId}:`, error);
      }
    }

    return patternsReceived;
  }

  async addPattern(name: string, category: string, embedding: number[]): Promise<string> {
    if (!this.patternIndex || !this.patternSerializer) {
      throw new Error('Pattern service not initialized');
    }

    const patternId = `pattern-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Map category string to PatternCategory enum
    const categoryMap: Record<string, PatternCategory> = {
      'test': PatternCategory.TEST,
      'fix': PatternCategory.DEFECT_FIX,
      'refactor': PatternCategory.REFACTOR,
      'feature': PatternCategory.CODE,
      'performance': PatternCategory.PERFORMANCE,
      'security': PatternCategory.SECURITY,
      'documentation': PatternCategory.CODE,
      'architecture': PatternCategory.CODE,
      'code': PatternCategory.CODE,
    };

    const patternCategory = categoryMap[category.toLowerCase()] || PatternCategory.TEST;

    // Create a proper SharedPattern using the serializer
    const pattern = this.patternSerializer.createPattern(
      patternId,
      patternCategory,
      'qe-pattern',
      'dashboard',
      `Pattern: ${name}\nCategory: ${category}\nCreated from dashboard`,
      embedding,
      {
        name,
        description: `Pattern created from Agentic QE Dashboard`,
        tags: ['dashboard', 'user-created', category.toLowerCase()],
        language: 'typescript',
      }
    );

    // Actually add to the index
    const added = this.patternIndex.add(pattern);

    if (added) {
      console.log(`[P2P] Pattern added: ${name} (${patternId})`);

      // Increment CRDT counter
      const counter = this.crdtStore?.getGCounter('patterns-counter');
      if (counter) {
        counter.increment();
      }

      this.emit({ type: 'pattern:created', patternId, name });
    } else {
      console.warn(`[P2P] Pattern rejected (duplicate?): ${name}`);
    }

    this.updatePatternStats();
    return patternId;
  }

  // ============================================
  // CRDT Operations
  // ============================================

  async syncCRDT(peerId: string): Promise<void> {
    if (!this.crdtStore) {
      throw new Error('CRDT service not initialized');
    }

    // Generate deltas for sync (no specific peer clock for now)
    const deltas = this.crdtStore.generateDeltas();

    // Simulate sync
    await new Promise(resolve => setTimeout(resolve, 200));

    console.log(`Syncing ${deltas.length} deltas with peer ${peerId}`);

    this.updateCRDTState();
    this.emit({ type: 'crdt:updated', storeId: 'all' });
  }

  getCRDT<T>(key: string): T | undefined {
    return this.crdtStore?.get(key) as T | undefined;
  }

  // ============================================
  // State Management
  // ============================================

  getState(): DashboardState {
    return { ...this.state };
  }

  subscribe(callback: (state: DashboardState) => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  onEvent(handler: WebAppEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  private updateState(partial: Partial<DashboardState>): void {
    this.state = { ...this.state, ...partial };
    this.notifySubscribers();
  }

  private notifySubscribers(): void {
    for (const callback of this.subscribers) {
      try {
        callback(this.getState());
      } catch (error) {
        console.error('Subscriber error:', error);
      }
    }
  }

  private emit(event: WebAppEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (error) {
        console.error('Event handler error:', error);
      }
    }
  }

  // ============================================
  // Internal State Updates
  // ============================================

  private addPeer(peer: PeerInfo): void {
    this.updateState({
      peers: [...this.state.peers, peer],
    });
  }

  private updatePeer(peerId: string, updates: Partial<PeerInfo>): void {
    this.updateState({
      peers: this.state.peers.map(p =>
        p.id === peerId ? { ...p, ...updates, lastSeen: Date.now() } : p
      ),
    });
  }

  private removePeer(peerId: string): void {
    this.updateState({
      peers: this.state.peers.filter(p => p.id !== peerId),
    });
  }

  private updatePatternStats(): void {
    if (!this.patternIndex) return;

    const stats = this.patternIndex.getStats();

    // Map PatternIndexStats to our PatternStats format
    // byCategory is Record<PatternCategory, number>
    const categories: Record<string, number> = {};
    if (stats.byCategory) {
      for (const [cat, count] of Object.entries(stats.byCategory)) {
        categories[cat] = count;
      }
    }

    this.updateState({
      patterns: {
        total: stats.totalPatterns,
        local: stats.totalPatterns, // All patterns are local in single-node mode
        synced: 0,
        pending: 0,
        categories,
      },
    });
  }

  private updateCRDTState(): void {
    if (!this.crdtStore) return;

    const crdtStats = this.crdtStore.getStats();
    const ids = this.crdtStore.getIds();

    const stores = ids.map(id => {
      const crdtType = this.crdtStore!.getType(id);
      const crdt = this.crdtStore!.get(id);

      // Map CRDTType enum to string literal
      let typeStr: 'GCounter' | 'LWWRegister' | 'ORSet' | 'PatternCRDT' = 'GCounter';
      if (crdtType === CRDTType.GCounter) typeStr = 'GCounter';
      else if (crdtType === CRDTType.LWWRegister) typeStr = 'LWWRegister';
      else if (crdtType === CRDTType.ORSet) typeStr = 'ORSet';
      else if (crdtType === CRDTType.PatternCRDT) typeStr = 'PatternCRDT';

      return {
        id,
        type: typeStr,
        size: crdt ? 64 : 0, // Approximate size
        version: 0, // Version tracking is per-CRDT
      };
    });

    this.updateState({
      crdt: {
        stores,
        totalOperations: crdtStats.pendingDeltas,
        conflictsResolved: crdtStats.totalConflicts,
        lastSync: Date.now(),
      },
    });
  }

  // ============================================
  // Metrics Collection
  // ============================================

  private startMetricsCollection(): void {
    this.metricsInterval = setInterval(() => {
      this.updateMetrics();
    }, 5000);
  }

  private updateMetrics(): void {
    const uptime = Date.now() - this.startTime;

    // Get memory usage if available
    let memoryUsage = 0;
    if (typeof performance !== 'undefined' && (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory) {
      memoryUsage = Math.round((performance as unknown as { memory: { usedJSHeapSize: number } }).memory.usedJSHeapSize / 1024 / 1024);
    }

    const metrics: SystemMetrics = {
      memoryUsage,
      cpuUsage: 0, // Not available in browser
      networkLatency: this.calculateAverageLatency(),
      messagesPerSecond: this.messageCount / (uptime / 1000),
      uptime,
    };

    this.updateState({ metrics });
  }

  private calculateAverageLatency(): number {
    if (this.state.peers.length === 0) return 0;
    const total = this.state.peers.reduce((sum, p) => sum + p.latencyMs, 0);
    return Math.round(total / this.state.peers.length);
  }

  // ============================================
  // Auto Sync
  // ============================================

  private startAutoSync(): void {
    this.syncInterval = setInterval(async () => {
      for (const peer of this.state.peers) {
        if (peer.connectionState === 'connected') {
          await this.syncCRDT(peer.id);
        }
      }
    }, this.config.patternSync.syncInterval);
  }

  // ============================================
  // Agent Spawn API
  // ============================================

  async spawnAgent(agentType: string, task: string, options?: {
    priority?: 'low' | 'medium' | 'high' | 'critical';
    dryRun?: boolean;
  }): Promise<{ success: boolean; agentId?: string; error?: string }> {
    try {
      const response = await fetch(`${this.config.agentApi.baseUrl}/api/agents/spawn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentType,
          task,
          options,
        }),
      });

      const result = await response.json();

      if (result.success && result.agentId) {
        this.emit({ type: 'agent:spawned', agentId: result.agentId, agentType });
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to spawn agent';
      this.emit({ type: 'error', message: errorMessage });
      return { success: false, error: errorMessage };
    }
  }

  async getAgentStatus(agentId: string): Promise<{
    id: string;
    agentType: string;
    status: string;
    task: string;
    startedAt: number;
    duration?: number;
    outputLines: number;
    lastOutput?: string;
  } | null> {
    try {
      const response = await fetch(`${this.config.agentApi.baseUrl}/api/agents/${agentId}`);

      if (!response.ok) {
        return null;
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to get agent status:', error);
      return null;
    }
  }

  async getAgentOutput(agentId: string, lastN?: number): Promise<string[]> {
    try {
      const url = new URL(`${this.config.agentApi.baseUrl}/api/agents/${agentId}/output`);
      if (lastN) {
        url.searchParams.set('last', String(lastN));
      }

      const response = await fetch(url.toString());

      if (!response.ok) {
        return [];
      }

      const data = await response.json();
      return data.output || [];
    } catch (error) {
      console.error('Failed to get agent output:', error);
      return [];
    }
  }

  async listAgents(filter?: { status?: string; type?: string }): Promise<Array<{
    id: string;
    agentType: string;
    status: string;
    task: string;
    startedAt: number;
    duration?: number;
  }>> {
    try {
      const url = new URL(`${this.config.agentApi.baseUrl}/api/agents`);
      if (filter?.status) {
        url.searchParams.set('status', filter.status);
      }
      if (filter?.type) {
        url.searchParams.set('type', filter.type);
      }

      const response = await fetch(url.toString());

      if (!response.ok) {
        return [];
      }

      const data = await response.json();
      return data.agents || [];
    } catch (error) {
      console.error('Failed to list agents:', error);
      return [];
    }
  }

  async cancelAgent(agentId: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.agentApi.baseUrl}/api/agents/${agentId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        this.emit({ type: 'agent:completed', agentId, exitCode: -1 });
        return true;
      }

      return false;
    } catch (error) {
      console.error('Failed to cancel agent:', error);
      return false;
    }
  }

  // ============================================
  // Cleanup
  // ============================================

  destroy(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }

    // Stop all health monitors
    for (const monitor of this.healthMonitors.values()) {
      monitor.stop();
    }
    this.healthMonitors.clear();

    // Close all RTCPeerConnections
    for (const rtcConn of this.peerConnections.values()) {
      rtcConn.close();
    }
    this.peerConnections.clear();

    // Disconnect signaling client
    if (this.signalingClient) {
      this.signalingClient.disconnect('Service destroyed');
      this.signalingClient = null;
    }

    this.crdtStore?.dispose();

    this.subscribers.clear();
    this.eventHandlers.clear();

    this.state = createInitialState();
  }
}

// ============================================
// Singleton Instance
// ============================================

let serviceInstance: P2PServiceImpl | null = null;

export function getP2PService(config?: Partial<P2PServiceConfig>): P2PServiceImpl {
  if (!serviceInstance) {
    serviceInstance = new P2PServiceImpl(config);
  }
  return serviceInstance;
}

export function resetP2PService(): void {
  if (serviceInstance) {
    serviceInstance.destroy();
    serviceInstance = null;
  }
}
