/**
 * P2P Context Provider
 *
 * Provides global P2P state and service instance to all descendant components.
 * Browser-compatible implementation using WebRTC and Web Crypto APIs.
 *
 * @module edge/webapp/context/P2PContext
 * @version 1.0.0
 */

import React, {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useEffect,
  useRef,
  useMemo,
  type ReactNode,
} from 'react';

// Import P2P Service singleton
import { getP2PService, P2PServiceImpl } from '../services/P2PService';
import type { WebAppEvent, P2PServiceConfig } from '../types';

// ============================================
// Types
// ============================================

/**
 * Peer identifier type
 */
export type PeerId = string;

/**
 * Connection state enumeration
 */
export type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

/**
 * Agent identity from P2P crypto module
 */
export interface AgentIdentity {
  agentId: string;
  publicKey: string;
  createdAt: string;
  displayName?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Agent info for display
 */
export interface AgentInfo {
  id: string;
  publicKey: string;
  createdAt: number;
  capabilities: string[];
}

/**
 * Connection quality metrics
 */
export interface ConnectionQuality {
  rttMs: number;
  packetLossPercent: number;
  availableBandwidth: number;
  localCandidateType: string;
  remoteCandidateType: string;
  measuredAt: number;
}

/**
 * Peer state
 */
export interface PeerState {
  id: PeerId;
  publicKey: string;
  connectionState: ConnectionState;
  dataChannelState: RTCDataChannelState | 'unknown';
  quality: ConnectionQuality;
  lastSeen: number;
  patternsShared: number;
  metadata?: Record<string, unknown>;
}

/**
 * Pattern sync status
 */
export interface PatternSyncStatus {
  status: 'idle' | 'syncing' | 'error';
  lastSyncAt: number | null;
  pendingPatterns: number;
  syncedPatterns: number;
  activePeers: string[];
  error: Error | null;
}

/**
 * P2P metrics
 */
export interface P2PMetrics {
  messagesReceived: number;
  messagesSent: number;
  bytesReceived: number;
  bytesSent: number;
  averageLatencyMs: number;
  uptime: number;
}

/**
 * P2P context state
 */
export interface P2PContextState {
  // Service lifecycle
  isInitialized: boolean;
  isInitializing: boolean;
  initError: Error | null;

  // Connection state
  connectionState: ConnectionState;

  // Local identity
  localAgent: AgentInfo | null;
  localIdentity: AgentIdentity | null;

  // Peers
  peers: Map<PeerId, PeerState>;

  // Pattern sync
  patternSyncState: PatternSyncStatus;

  // Metrics
  metrics: P2PMetrics;
}

/**
 * P2P event types
 */
export enum P2PEventType {
  // Lifecycle
  INITIALIZED = 'initialized',
  SHUTDOWN = 'shutdown',
  ERROR = 'error',

  // Connection
  CONNECTION_STATE_CHANGED = 'connection_state_changed',
  PEER_DISCOVERED = 'peer_discovered',
  PEER_CONNECTED = 'peer_connected',
  PEER_DISCONNECTED = 'peer_disconnected',
  PEER_UPDATED = 'peer_updated',

  // Patterns
  PATTERN_RECEIVED = 'pattern_received',
  PATTERN_SHARED = 'pattern_shared',
  SYNC_STARTED = 'sync_started',
  SYNC_COMPLETED = 'sync_completed',
  SYNC_ERROR = 'sync_error',
  CONFLICT_DETECTED = 'conflict_detected',
  CONFLICT_RESOLVED = 'conflict_resolved',

  // Quality
  QUALITY_UPDATED = 'quality_updated',
  LATENCY_UPDATED = 'latency_updated',
}

/**
 * P2P event
 */
export interface P2PEvent<T = unknown> {
  type: P2PEventType;
  timestamp: number;
  data: T;
}

/**
 * P2P event handler
 */
export type P2PEventHandler<T = unknown> = (event: P2PEvent<T>) => void;

/**
 * P2P configuration
 */
export interface P2PConfig {
  // Identity
  identityStorageKey?: string;
  autoCreateIdentity?: boolean;

  // WebRTC
  iceServers?: RTCIceServer[];
  enableTurnFallback?: boolean;

  // Signaling
  signalingUrl?: string;
  signalingReconnect?: boolean;

  // Patterns
  patternAutoSync?: boolean;
  patternSyncInterval?: number;
  maxPatterns?: number;

  // Privacy
  defaultPrivacyLevel?: 'full' | 'anonymized' | 'embedding_only';
  enableDifferentialPrivacy?: boolean;

  // Debug
  debug?: boolean;
  logLevel?: 'error' | 'warn' | 'info' | 'debug';
}

/**
 * P2P context actions
 */
export interface P2PContextActions {
  // Lifecycle
  initialize: (config?: P2PConfig) => Promise<void>;
  shutdown: () => Promise<void>;

  // Peer management
  connectToPeer: (peerId: PeerId) => Promise<void>;
  disconnectFromPeer: (peerId: PeerId) => Promise<void>;

  // Pattern operations
  sharePattern: (patternId: string, peerIds?: PeerId[]) => Promise<void>;
  requestPatternSync: (peerId: PeerId) => Promise<void>;

  // Events
  subscribe: <T = unknown>(
    eventType: P2PEventType,
    handler: P2PEventHandler<T>
  ) => () => void;
  emit: <T = unknown>(eventType: P2PEventType, data: T) => void;
}

/**
 * Combined P2P context value
 */
export interface P2PContextValue extends P2PContextState, P2PContextActions {}

// ============================================
// Default Values
// ============================================

const DEFAULT_CONFIG: P2PConfig = {
  identityStorageKey: 'ruvector-edge-identity',
  autoCreateIdentity: true,
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
  enableTurnFallback: true,
  signalingUrl: 'wss://signal.ruvector.io',
  signalingReconnect: true,
  patternAutoSync: true,
  patternSyncInterval: 30000,
  maxPatterns: 1000,
  defaultPrivacyLevel: 'anonymized',
  enableDifferentialPrivacy: false,
  debug: false,
  logLevel: 'warn',
};

const DEFAULT_CONNECTION_QUALITY: ConnectionQuality = {
  rttMs: 0,
  packetLossPercent: 0,
  availableBandwidth: 0,
  localCandidateType: 'unknown',
  remoteCandidateType: 'unknown',
  measuredAt: Date.now(),
};

const DEFAULT_PATTERN_SYNC_STATUS: PatternSyncStatus = {
  status: 'idle',
  lastSyncAt: null,
  pendingPatterns: 0,
  syncedPatterns: 0,
  activePeers: [],
  error: null,
};

const DEFAULT_METRICS: P2PMetrics = {
  messagesReceived: 0,
  messagesSent: 0,
  bytesReceived: 0,
  bytesSent: 0,
  averageLatencyMs: 0,
  uptime: 0,
};

const INITIAL_STATE: P2PContextState = {
  isInitialized: false,
  isInitializing: false,
  initError: null,
  connectionState: 'disconnected',
  localAgent: null,
  localIdentity: null,
  peers: new Map(),
  patternSyncState: DEFAULT_PATTERN_SYNC_STATUS,
  metrics: DEFAULT_METRICS,
};

// ============================================
// Action Types
// ============================================

type P2PAction =
  | { type: 'INIT_START' }
  | { type: 'INIT_SUCCESS'; identity: AgentIdentity }
  | { type: 'INIT_ERROR'; error: Error }
  | { type: 'SHUTDOWN' }
  | { type: 'SET_CONNECTION_STATE'; state: ConnectionState }
  | { type: 'ADD_PEER'; peer: PeerState }
  | { type: 'UPDATE_PEER'; peerId: PeerId; updates: Partial<PeerState> }
  | { type: 'REMOVE_PEER'; peerId: PeerId }
  | { type: 'SET_PEERS'; peers: Map<PeerId, PeerState> }
  | { type: 'UPDATE_PATTERN_SYNC'; status: Partial<PatternSyncStatus> }
  | { type: 'UPDATE_METRICS'; metrics: Partial<P2PMetrics> }
  | { type: 'RESET' };

// ============================================
// Reducer
// ============================================

function p2pReducer(state: P2PContextState, action: P2PAction): P2PContextState {
  switch (action.type) {
    case 'INIT_START':
      return {
        ...state,
        isInitializing: true,
        initError: null,
      };

    case 'INIT_SUCCESS': {
      const agent: AgentInfo = {
        id: action.identity.agentId,
        publicKey: action.identity.publicKey,
        createdAt: new Date(action.identity.createdAt).getTime(),
        capabilities: ['webrtc', 'pattern-sharing', 'crdt-sync'],
      };
      return {
        ...state,
        isInitialized: true,
        isInitializing: false,
        localAgent: agent,
        localIdentity: action.identity,
        connectionState: 'connected',
      };
    }

    case 'INIT_ERROR':
      return {
        ...state,
        isInitializing: false,
        initError: action.error,
        connectionState: 'error',
      };

    case 'SHUTDOWN':
      return {
        ...INITIAL_STATE,
      };

    case 'SET_CONNECTION_STATE':
      return {
        ...state,
        connectionState: action.state,
      };

    case 'ADD_PEER': {
      const newPeers = new Map(state.peers);
      newPeers.set(action.peer.id, action.peer);
      return {
        ...state,
        peers: newPeers,
      };
    }

    case 'UPDATE_PEER': {
      const peer = state.peers.get(action.peerId);
      if (!peer) return state;

      const newPeers = new Map(state.peers);
      newPeers.set(action.peerId, { ...peer, ...action.updates });
      return {
        ...state,
        peers: newPeers,
      };
    }

    case 'REMOVE_PEER': {
      const newPeers = new Map(state.peers);
      newPeers.delete(action.peerId);
      return {
        ...state,
        peers: newPeers,
      };
    }

    case 'SET_PEERS':
      return {
        ...state,
        peers: action.peers,
      };

    case 'UPDATE_PATTERN_SYNC':
      return {
        ...state,
        patternSyncState: {
          ...state.patternSyncState,
          ...action.status,
        },
      };

    case 'UPDATE_METRICS':
      return {
        ...state,
        metrics: {
          ...state.metrics,
          ...action.metrics,
        },
      };

    case 'RESET':
      return INITIAL_STATE;

    default:
      return state;
  }
}

// ============================================
// Event Emitter
// ============================================

class P2PEventEmitter {
  private listeners: Map<P2PEventType, Set<P2PEventHandler>> = new Map();

  subscribe<T = unknown>(
    eventType: P2PEventType,
    handler: P2PEventHandler<T>
  ): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(handler as P2PEventHandler);

    return () => {
      const handlers = this.listeners.get(eventType);
      if (handlers) {
        handlers.delete(handler as P2PEventHandler);
      }
    };
  }

  emit<T = unknown>(eventType: P2PEventType, data: T): void {
    const handlers = this.listeners.get(eventType);
    if (!handlers) return;

    const event: P2PEvent<T> = {
      type: eventType,
      timestamp: Date.now(),
      data,
    };

    handlers.forEach((handler) => {
      try {
        handler(event);
      } catch (error) {
        console.error(`[P2P] Event handler error for ${eventType}:`, error);
      }
    });
  }

  clear(): void {
    this.listeners.clear();
  }
}

// ============================================
// Context
// ============================================

const P2PContext = createContext<P2PContextValue | null>(null);

// ============================================
// Provider Props
// ============================================

export interface P2PProviderProps {
  children: ReactNode;
  config?: Partial<P2PConfig>;
  autoInit?: boolean;
}

// ============================================
// Provider Component
// ============================================

export function P2PProvider({
  children,
  config: userConfig,
  autoInit = true,
}: P2PProviderProps): JSX.Element {
  const [state, dispatch] = useReducer(p2pReducer, INITIAL_STATE);
  const configRef = useRef<P2PConfig>({ ...DEFAULT_CONFIG, ...userConfig });
  const eventEmitterRef = useRef<P2PEventEmitter>(new P2PEventEmitter());
  const initializingRef = useRef(false);
  const startTimeRef = useRef<number>(Date.now());
  const p2pServiceRef = useRef<P2PServiceImpl | null>(null);

  // Update config when props change
  useEffect(() => {
    configRef.current = { ...DEFAULT_CONFIG, ...userConfig };
  }, [userConfig]);

  // Logger helper
  const log = useCallback(
    (level: 'error' | 'warn' | 'info' | 'debug', ...args: unknown[]) => {
      if (!configRef.current.debug) return;

      const levels = ['error', 'warn', 'info', 'debug'];
      const configLevel = configRef.current.logLevel || 'warn';
      if (levels.indexOf(level) > levels.indexOf(configLevel)) return;

      const prefix = `[P2P ${level.toUpperCase()}]`;
      switch (level) {
        case 'error':
          console.error(prefix, ...args);
          break;
        case 'warn':
          console.warn(prefix, ...args);
          break;
        case 'info':
          console.info(prefix, ...args);
          break;
        case 'debug':
          console.log(prefix, ...args);
          break;
      }
    },
    []
  );

  // Generate agent ID from public key (browser-compatible)
  const generateAgentId = useCallback(async (publicKey: Uint8Array): Promise<string> => {
    // Create a proper ArrayBuffer from the Uint8Array
    const buffer = new ArrayBuffer(publicKey.length);
    const view = new Uint8Array(buffer);
    view.set(publicKey);
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    return hashHex.substring(0, 16);
  }, []);

  // Initialize P2P service
  const initialize = useCallback(async (overrideConfig?: P2PConfig): Promise<void> => {
    if (initializingRef.current || state.isInitialized) {
      log('debug', 'Already initialized or initializing');
      return;
    }

    initializingRef.current = true;
    dispatch({ type: 'INIT_START' });

    const finalConfig = { ...configRef.current, ...overrideConfig };

    try {
      log('info', 'Initializing P2P service...');

      // Check browser compatibility
      if (typeof crypto === 'undefined' || !crypto.subtle) {
        throw new Error('Web Crypto API not available');
      }
      if (typeof RTCPeerConnection === 'undefined') {
        throw new Error('WebRTC not available');
      }

      // Initialize the P2PService singleton with signaling config
      const serviceConfig: Partial<P2PServiceConfig> = {
        signaling: {
          serverUrl: finalConfig.signalingServer || 'ws://localhost:3002',
          roomId: 'agentic-qe-default',
          autoReconnect: true,
        },
        agentApi: {
          baseUrl: finalConfig.agentApiUrl || 'http://localhost:3001',
        },
      };

      const service = getP2PService(serviceConfig);
      p2pServiceRef.current = service;

      // Subscribe to P2PService events
      const handleServiceEvent = (event: WebAppEvent) => {
        switch (event.type) {
          case 'peer:discovered':
            if (event.peer) {
              const peerState: PeerState = {
                id: event.peer.id,
                publicKey: event.peer.publicKey || '',
                connectionState: 'connecting',
                dataChannelState: 'connecting',
                quality: DEFAULT_CONNECTION_QUALITY,
                lastSeen: Date.now(),
                patternsShared: 0,
              };
              dispatch({ type: 'ADD_PEER', peer: peerState });
              eventEmitterRef.current.emit(P2PEventType.PEER_DISCOVERED, { peer: peerState });
            }
            break;
          case 'peer:connected':
            if (event.peer) {
              dispatch({
                type: 'UPDATE_PEER',
                peerId: event.peer.id,
                updates: { connectionState: 'connected', dataChannelState: 'open' },
              });
              eventEmitterRef.current.emit(P2PEventType.PEER_CONNECTED, { peerId: event.peer.id });
            }
            break;
          case 'peer:disconnected':
            if (event.peer) {
              dispatch({ type: 'REMOVE_PEER', peerId: event.peer.id });
              eventEmitterRef.current.emit(P2PEventType.PEER_DISCONNECTED, { peerId: event.peer.id });
            }
            break;
          case 'pattern:received':
            eventEmitterRef.current.emit(P2PEventType.PATTERN_RECEIVED, {
              patternId: event.patternId,
              from: event.from,
            });
            break;
          case 'error':
            log('error', 'P2PService error:', event.message);
            break;
        }
      };

      service.on(handleServiceEvent);

      // Initialize the service (connects to signaling server)
      await service.initialize();

      // Generate or load identity
      let identity: AgentIdentity;

      // Try to load existing identity from IndexedDB
      const storedIdentity = await loadIdentityFromStorage(
        finalConfig.identityStorageKey || 'ruvector-edge-identity'
      );

      if (storedIdentity) {
        identity = storedIdentity;
        log('info', 'Loaded existing identity:', identity.agentId);
      } else if (finalConfig.autoCreateIdentity) {
        // Use the agent ID from P2PService
        const serviceState = service.getState();
        identity = {
          agentId: serviceState.agentInfo?.id || await generateAgentId(new Uint8Array(32)),
          publicKey: serviceState.agentInfo?.publicKey || '',
          createdAt: new Date().toISOString(),
          displayName: `Agent-${(serviceState.agentInfo?.id || '').substring(0, 8)}`,
        };

        // Store identity
        await saveIdentityToStorage(
          finalConfig.identityStorageKey || 'ruvector-edge-identity',
          identity
        );

        log('info', 'Created new identity:', identity.agentId);
      } else {
        throw new Error('No identity found and autoCreateIdentity is disabled');
      }

      startTimeRef.current = Date.now();
      dispatch({ type: 'INIT_SUCCESS', identity });

      eventEmitterRef.current.emit(P2PEventType.INITIALIZED, { identity });

      log('info', 'P2P service initialized successfully');
    } catch (error) {
      log('error', 'Initialization failed:', error);
      dispatch({ type: 'INIT_ERROR', error: error as Error });
      eventEmitterRef.current.emit(P2PEventType.ERROR, { error });
    } finally {
      initializingRef.current = false;
    }
  }, [state.isInitialized, log, generateAgentId]);

  // Shutdown P2P service
  const shutdown = useCallback(async (): Promise<void> => {
    log('info', 'Shutting down P2P service...');

    // Destroy the P2PService instance
    if (p2pServiceRef.current) {
      p2pServiceRef.current.destroy();
      p2pServiceRef.current = null;
    }

    // Close all peer connections
    state.peers.forEach((peer) => {
      log('debug', 'Closing connection to peer:', peer.id);
    });

    eventEmitterRef.current.emit(P2PEventType.SHUTDOWN, {});
    eventEmitterRef.current.clear();
    dispatch({ type: 'SHUTDOWN' });

    log('info', 'P2P service shut down');
  }, [state.peers, log]);

  // Connect to peer
  const connectToPeer = useCallback(
    async (peerId: PeerId): Promise<void> => {
      if (!state.isInitialized) {
        throw new Error('P2P service not initialized');
      }

      if (!p2pServiceRef.current) {
        throw new Error('P2P service not available');
      }

      log('info', 'Connecting to peer:', peerId);

      // Create new peer state
      const peer: PeerState = {
        id: peerId,
        publicKey: '',
        connectionState: 'connecting',
        dataChannelState: 'connecting',
        quality: DEFAULT_CONNECTION_QUALITY,
        lastSeen: Date.now(),
        patternsShared: 0,
      };

      dispatch({ type: 'ADD_PEER', peer });
      eventEmitterRef.current.emit(P2PEventType.PEER_DISCOVERED, { peer });

      // Connect via P2PService (uses SignalingClient for WebRTC signaling)
      try {
        await p2pServiceRef.current.connect(peerId);

        dispatch({
          type: 'UPDATE_PEER',
          peerId,
          updates: {
            connectionState: 'connected',
            dataChannelState: 'open',
            lastSeen: Date.now(),
          },
        });

        eventEmitterRef.current.emit(P2PEventType.PEER_CONNECTED, {
          peerId,
          timestamp: Date.now(),
        });

        log('info', 'Connected to peer:', peerId);
      } catch (error) {
        dispatch({
          type: 'UPDATE_PEER',
          peerId,
          updates: {
            connectionState: 'error',
            dataChannelState: 'closed',
          },
        });
        throw error;
      }
    },
    [state.isInitialized, log]
  );

  // Disconnect from peer
  const disconnectFromPeer = useCallback(
    async (peerId: PeerId): Promise<void> => {
      const peer = state.peers.get(peerId);
      if (!peer) {
        log('warn', 'Peer not found:', peerId);
        return;
      }

      log('info', 'Disconnecting from peer:', peerId);

      // Disconnect via P2PService
      if (p2pServiceRef.current) {
        p2pServiceRef.current.disconnect(peerId);
      }

      dispatch({ type: 'REMOVE_PEER', peerId });
      eventEmitterRef.current.emit(P2PEventType.PEER_DISCONNECTED, { peerId });
    },
    [state.peers, log]
  );

  // Share pattern with peers
  const sharePattern = useCallback(
    async (patternId: string, peerIds?: PeerId[]): Promise<void> => {
      if (!state.isInitialized) {
        throw new Error('P2P service not initialized');
      }

      if (!p2pServiceRef.current) {
        throw new Error('P2P service not available');
      }

      const targetPeers = peerIds || Array.from(state.peers.keys());
      log('info', 'Sharing pattern:', patternId, 'with peers:', targetPeers);

      // Share pattern via P2PService data channels
      await p2pServiceRef.current.sharePattern(patternId);

      eventEmitterRef.current.emit(P2PEventType.PATTERN_SHARED, {
        patternId,
        peerIds: targetPeers,
      });
    },
    [state.isInitialized, state.peers, log]
  );

  // Request pattern sync from peer
  const requestPatternSync = useCallback(
    async (peerId: PeerId): Promise<void> => {
      if (!state.isInitialized) {
        throw new Error('P2P service not initialized');
      }

      if (!p2pServiceRef.current) {
        throw new Error('P2P service not available');
      }

      const peer = state.peers.get(peerId);
      if (!peer || peer.connectionState !== 'connected') {
        throw new Error(`Peer ${peerId} not connected`);
      }

      log('info', 'Requesting pattern sync from peer:', peerId);

      dispatch({
        type: 'UPDATE_PATTERN_SYNC',
        status: {
          status: 'syncing',
          activePeers: [...state.patternSyncState.activePeers, peerId],
        },
      });

      eventEmitterRef.current.emit(P2PEventType.SYNC_STARTED, { peerId });

      try {
        // Sync patterns via P2PService
        await p2pServiceRef.current.syncPatterns();

        dispatch({
          type: 'UPDATE_PATTERN_SYNC',
          status: {
            status: 'idle',
            lastSyncAt: Date.now(),
            activePeers: state.patternSyncState.activePeers.filter((p) => p !== peerId),
          },
        });

        eventEmitterRef.current.emit(P2PEventType.SYNC_COMPLETED, {
          peerId,
          patternsReceived: 0,
          patternsSent: 0,
        });

        log('info', 'Pattern sync completed with peer:', peerId);
      } catch (error) {
        dispatch({
          type: 'UPDATE_PATTERN_SYNC',
          status: {
            status: 'error',
            error: error as Error,
            activePeers: state.patternSyncState.activePeers.filter((p) => p !== peerId),
          },
        });

        eventEmitterRef.current.emit(P2PEventType.SYNC_ERROR, { peerId, error });
        throw error;
      }
    },
    [state.isInitialized, state.peers, state.patternSyncState.activePeers, log]
  );

  // Event subscription
  const subscribe = useCallback(
    <T = unknown>(eventType: P2PEventType, handler: P2PEventHandler<T>): (() => void) => {
      return eventEmitterRef.current.subscribe(eventType, handler);
    },
    []
  );

  // Event emission
  const emit = useCallback(<T = unknown>(eventType: P2PEventType, data: T): void => {
    eventEmitterRef.current.emit(eventType, data);
  }, []);

  // Update uptime metric periodically
  useEffect(() => {
    if (!state.isInitialized) return;

    const interval = setInterval(() => {
      dispatch({
        type: 'UPDATE_METRICS',
        metrics: {
          uptime: Date.now() - startTimeRef.current,
        },
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [state.isInitialized]);

  // Auto-initialize on mount
  useEffect(() => {
    if (autoInit && !state.isInitialized && !state.isInitializing) {
      initialize();
    }
  }, [autoInit, state.isInitialized, state.isInitializing, initialize]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (state.isInitialized) {
        shutdown();
      }
    };
  }, []);

  // Memoize context value
  const contextValue = useMemo<P2PContextValue>(
    () => ({
      ...state,
      initialize,
      shutdown,
      connectToPeer,
      disconnectFromPeer,
      sharePattern,
      requestPatternSync,
      subscribe,
      emit,
    }),
    [
      state,
      initialize,
      shutdown,
      connectToPeer,
      disconnectFromPeer,
      sharePattern,
      requestPatternSync,
      subscribe,
      emit,
    ]
  );

  return <P2PContext.Provider value={contextValue}>{children}</P2PContext.Provider>;
}

// ============================================
// Hook
// ============================================

/**
 * Access P2P context
 * @throws Error if used outside P2PProvider
 */
export function useP2PContext(): P2PContextValue {
  const context = useContext(P2PContext);
  if (!context) {
    throw new Error('useP2PContext must be used within a P2PProvider');
  }
  return context;
}

// ============================================
// Storage Helpers (IndexedDB)
// ============================================

const DB_NAME = 'ruvector-edge-db';
const STORE_NAME = 'identity';
const DB_VERSION = 1;

async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

async function loadIdentityFromStorage(key: string): Promise<AgentIdentity | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);
    });
  } catch (error) {
    console.warn('[P2P] Failed to load identity from storage:', error);
    return null;
  }
}

async function saveIdentityToStorage(key: string, identity: AgentIdentity): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(identity, key);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  } catch (error) {
    console.warn('[P2P] Failed to save identity to storage:', error);
  }
}

// ============================================
// Re-exports for convenience
// ============================================

export { P2PContext };
