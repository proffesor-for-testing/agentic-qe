# P2P React Hook Architecture

## Overview

This document describes the React hook architecture for connecting P2P services to the web dashboard. The design follows React best practices for state management, ensures browser compatibility (no Node.js dependencies), and works with the Vite bundler.

## Architecture Principles

### 1. Separation of Concerns
- **Context Layer**: Global P2P state and service lifecycle management
- **Hook Layer**: Specialized access to specific P2P functionality
- **Service Layer**: Browser-compatible P2P service adapters

### 2. Browser Compatibility
- No Node.js dependencies (crypto, fs, net, etc.)
- Uses Web Crypto API for cryptographic operations
- Uses WebRTC for peer connections
- Uses IndexedDB for persistent storage

### 3. Vite Bundler Compatibility
- Tree-shakeable exports
- ESM-first module design
- Lazy initialization to avoid SSR issues

---

## Component Diagram

```
+------------------+
|    App.tsx       |
+--------+---------+
         |
         v
+------------------+
|  P2PProvider     |  <-- Context provider wraps the app
+--------+---------+
         |
         | provides P2PContext
         v
+------------------+     +------------------+     +------------------+
|  useP2PService   |     |    usePeers      |     | useConnection    |
+------------------+     +------------------+     +------------------+
         |                       |                       |
         +----------+------------+-----------+-----------+
                    |                        |
                    v                        v
         +------------------+     +------------------+
         | usePatternSync   |     |   (other hooks)  |
         +------------------+     +------------------+
```

---

## Context: P2PContext

### Purpose
Provides global P2P state and service instance to all descendant components.

### State Shape

```typescript
interface P2PContextState {
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

type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';

interface PeerState {
  id: PeerId;
  publicKey: string;
  connectionState: ConnectionState;
  dataChannelState: RTCDataChannelState;
  quality: ConnectionQuality;
  lastSeen: number;
  patternsShared: number;
  metadata?: Record<string, unknown>;
}

interface PatternSyncStatus {
  status: 'idle' | 'syncing' | 'error';
  lastSyncAt: number | null;
  pendingPatterns: number;
  syncedPatterns: number;
  activePeers: string[];
  error: Error | null;
}

interface P2PMetrics {
  messagesReceived: number;
  messagesSent: number;
  bytesReceived: number;
  bytesSent: number;
  averageLatencyMs: number;
  uptime: number;
}
```

### Actions

```typescript
interface P2PContextActions {
  // Lifecycle
  initialize(config?: P2PConfig): Promise<void>;
  shutdown(): Promise<void>;

  // Peer management
  connectToPeer(peerId: PeerId): Promise<void>;
  disconnectFromPeer(peerId: PeerId): Promise<void>;

  // Pattern operations
  sharePattern(patternId: string, peerIds?: PeerId[]): Promise<void>;
  requestPatternSync(peerId: PeerId): Promise<void>;

  // Events
  subscribe(eventType: P2PEventType, handler: P2PEventHandler): () => void;
}
```

---

## Hooks

### 1. useP2PService

**Purpose**: Initialize and manage P2PService lifecycle.

```typescript
interface UseP2PServiceOptions {
  autoInit?: boolean;           // Auto-initialize on mount (default: true)
  config?: Partial<P2PConfig>;  // Service configuration
  onError?: (error: Error) => void;
}

interface UseP2PServiceReturn {
  // State
  isInitialized: boolean;
  isInitializing: boolean;
  error: Error | null;

  // Actions
  initialize: () => Promise<void>;
  shutdown: () => Promise<void>;

  // Service access
  service: P2PServiceAdapter | null;
}
```

**Implementation Notes**:
- Uses `useContext` to access P2PContext
- Handles initialization state machine
- Provides cleanup on unmount
- Exposes raw service for advanced use cases

### 2. usePeers

**Purpose**: Subscribe to peer discovery and connection events.

```typescript
interface UsePeersOptions {
  autoSubscribe?: boolean;  // Auto-subscribe on mount (default: true)
  filter?: PeerFilter;      // Filter peers by criteria
}

interface PeerFilter {
  connectionState?: ConnectionState[];
  minQuality?: number;
  maxLatencyMs?: number;
}

interface UsePeersReturn {
  // State
  peers: PeerState[];
  peerCount: number;
  connectedPeers: PeerState[];

  // Peer info
  getPeer: (peerId: PeerId) => PeerState | undefined;

  // Actions
  connect: (peerId: PeerId) => Promise<void>;
  disconnect: (peerId: PeerId) => Promise<void>;
  refreshPeers: () => void;

  // Events
  onPeerDiscovered: (handler: (peer: PeerState) => void) => () => void;
  onPeerConnected: (handler: (peer: PeerState) => void) => () => void;
  onPeerDisconnected: (handler: (peerId: PeerId) => void) => () => void;
}
```

**Implementation Notes**:
- Subscribes to peer-related events from P2PContext
- Provides filtered views of peer list
- Memoizes peer lists to prevent unnecessary re-renders
- Uses `useSyncExternalStore` for optimal React 18+ performance

### 3. useConnection

**Purpose**: Track connection state with granular updates.

```typescript
interface UseConnectionOptions {
  peerId?: PeerId;  // Track specific peer (optional)
}

interface UseConnectionReturn {
  // Overall state
  state: ConnectionState;
  isConnected: boolean;
  isConnecting: boolean;
  isDisconnected: boolean;

  // Specific peer state (if peerId provided)
  peerState?: PeerState;

  // Quality metrics
  quality: ConnectionQuality | null;
  latencyMs: number;
  packetLossPercent: number;

  // Actions
  reconnect: () => Promise<void>;
  disconnect: () => Promise<void>;

  // History
  connectionHistory: ConnectionEvent[];
}

interface ConnectionEvent {
  timestamp: number;
  fromState: ConnectionState;
  toState: ConnectionState;
  reason?: string;
}
```

**Implementation Notes**:
- Tracks overall P2P connection state OR specific peer connection
- Maintains connection history for debugging
- Provides connection quality metrics
- Handles reconnection logic

### 4. usePatternSync

**Purpose**: Subscribe to pattern synchronization events.

```typescript
interface UsePatternSyncOptions {
  autoSync?: boolean;        // Auto-sync on peer connect (default: true)
  syncInterval?: number;     // Sync interval in ms (default: 30000)
  maxPendingPatterns?: number;
}

interface UsePatternSyncReturn {
  // State
  status: PatternSyncStatus;
  isSyncing: boolean;
  lastSyncAt: number | null;

  // Pattern stats
  pendingCount: number;
  syncedCount: number;
  localCount: number;

  // Actions
  sync: (peerId?: PeerId) => Promise<SyncResult>;
  syncAll: () => Promise<SyncResult[]>;
  cancelSync: () => void;

  // Events
  onPatternReceived: (handler: (pattern: SharedPattern) => void) => () => void;
  onSyncComplete: (handler: (result: SyncResult) => void) => () => void;
  onSyncError: (handler: (error: Error) => void) => () => void;
  onConflict: (handler: (conflict: PatternConflict) => void) => () => void;
}

interface SyncResult {
  peerId: PeerId;
  patternsReceived: number;
  patternsSent: number;
  conflicts: PatternConflict[];
  durationMs: number;
  error?: Error;
}
```

**Implementation Notes**:
- Manages pattern sync lifecycle
- Handles sync conflicts with configurable resolution
- Provides progress tracking
- Supports incremental sync with vector clocks

---

## Data Flow

### Initialization Flow

```
1. App mounts P2PProvider
2. P2PProvider creates P2PServiceAdapter (browser-compatible)
3. P2PServiceAdapter initializes:
   - Identity from IndexedDB (or creates new)
   - WebRTC configuration
   - Pattern index
4. P2PProvider sets isInitialized = true
5. Child hooks can now access service
```

### Peer Connection Flow

```
1. usePeers.connect(peerId) called
2. P2PContext.connectToPeer dispatched
3. P2PServiceAdapter.connect:
   - Creates RTCPeerConnection
   - Performs signaling handshake
   - Opens data channels
4. On success: peer added to peers Map
5. usePeers receives updated peer list
6. useConnection reflects new state
```

### Pattern Sync Flow

```
1. usePatternSync.sync(peerId) called
2. P2PContext dispatches sync request
3. P2PServiceAdapter:
   - Sends PatternSyncRequest via data channel
   - Receives PatternSyncResponse
   - Resolves any conflicts
   - Updates local pattern index
4. usePatternSync receives sync result
5. onPatternReceived handlers called for each new pattern
```

---

## Event System

### Event Types

```typescript
enum P2PEventType {
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
```

### Event Subscription Pattern

```typescript
// In hook
useEffect(() => {
  const unsubscribe = subscribe(P2PEventType.PEER_CONNECTED, (event) => {
    // Handle event
  });
  return () => unsubscribe();
}, [subscribe]);
```

---

## Browser Service Adapter

### P2PServiceAdapter Interface

```typescript
interface P2PServiceAdapter {
  // Lifecycle
  initialize(config: P2PConfig): Promise<void>;
  shutdown(): Promise<void>;

  // Identity
  getIdentity(): AgentIdentity | null;
  createIdentity(config: IdentityConfig): Promise<AgentIdentity>;

  // Peers
  connectToPeer(peerId: PeerId, options?: ConnectOptions): Promise<void>;
  disconnectFromPeer(peerId: PeerId): Promise<void>;
  getPeers(): Map<PeerId, PeerState>;

  // Patterns
  sharePattern(pattern: SharedPattern, peerIds?: PeerId[]): Promise<void>;
  requestSync(peerId: PeerId): Promise<PatternSyncResponse>;
  getPatterns(): SharedPattern[];
  searchPatterns(query: PatternQuery): Promise<PatternMatch[]>;

  // Events
  on(event: P2PEventType, handler: P2PEventHandler): () => void;

  // State
  getState(): P2PContextState;
}
```

### Browser Compatibility Strategy

1. **Crypto**: Use `@noble/ed25519` for Ed25519 operations (browser-compatible)
2. **Storage**: Use IndexedDB via `idb-keyval` for identity persistence
3. **WebRTC**: Native browser WebRTC APIs
4. **Signaling**: WebSocket-based signaling (configurable server URL)

---

## Configuration

### P2PConfig

```typescript
interface P2PConfig {
  // Identity
  identityStorageKey?: string;  // IndexedDB key for identity
  autoCreateIdentity?: boolean; // Create identity if none exists

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
  defaultPrivacyLevel?: PrivacyLevel;
  enableDifferentialPrivacy?: boolean;

  // Debug
  debug?: boolean;
  logLevel?: 'error' | 'warn' | 'info' | 'debug';
}
```

### Default Configuration

```typescript
const DEFAULT_P2P_CONFIG: P2PConfig = {
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
```

---

## Usage Example

```tsx
// App.tsx
import { P2PProvider } from './context/P2PContext';

function App() {
  return (
    <P2PProvider config={{ debug: true }}>
      <Dashboard />
    </P2PProvider>
  );
}

// Dashboard.tsx
import { useP2PService, usePeers, useConnection, usePatternSync } from './hooks/p2p';

function Dashboard() {
  const { isInitialized, error } = useP2PService();
  const { peers, connect } = usePeers();
  const { state, isConnected } = useConnection();
  const { sync, pendingCount } = usePatternSync();

  if (!isInitialized) return <LoadingSpinner />;
  if (error) return <ErrorDisplay error={error} />;

  return (
    <div>
      <ConnectionStatus state={state} />
      <PeerList peers={peers} onConnect={connect} />
      <PatternSyncPanel
        pendingCount={pendingCount}
        onSync={sync}
      />
    </div>
  );
}
```

---

## File Structure

```
src/edge/webapp/
  context/
    P2PContext.tsx          # Main context provider
    P2PReducer.ts           # State reducer
    P2PEventEmitter.ts      # Event system
  hooks/
    p2p/
      architecture.md       # This document
      index.ts              # Re-exports all hooks
      useP2PService.ts      # Service lifecycle hook
      usePeers.ts           # Peer management hook
      useConnection.ts      # Connection state hook
      usePatternSync.ts     # Pattern sync hook
      types.ts              # Hook-specific types
  services/
    P2PServiceAdapter.ts    # Browser-compatible service adapter
    BrowserCrypto.ts        # Browser crypto utilities
    BrowserStorage.ts       # IndexedDB storage
```

---

## Testing Strategy

1. **Unit Tests**: Test hooks with React Testing Library
2. **Integration Tests**: Test with mock P2PServiceAdapter
3. **E2E Tests**: Test real P2P connections in browser

---

## Version History

| Version | Date       | Changes                          |
|---------|------------|----------------------------------|
| 1.0.0   | 2025-01-03 | Initial architecture design      |
