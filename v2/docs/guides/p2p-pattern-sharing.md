# P2P Pattern Sharing Guide

Real-time test pattern synchronization between team members using WebRTC.

## Overview

P2P Pattern Sharing enables teams to:

- **Share test patterns** in real-time without a central server
- **Sync pattern libraries** across team members automatically
- **Collaborate on test strategies** with instant propagation
- **Reduce duplication** by reusing proven patterns from teammates

## How It Works

```
┌──────────────────────────────────────────────────────────────┐
│                    Signaling Server                          │
│                    (WebSocket: 3002)                         │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Room: "team-alpha"                                    │   │
│  │ Peers: [Alice, Bob, Charlie]                          │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────┬────────────────┬───────────────────────┘
                      │                │
              Signaling Only    Signaling Only
                      │                │
                      ▼                ▼
┌─────────────────┐        ┌─────────────────┐
│   Alice's       │◄──────►│   Bob's         │
│   Browser       │ WebRTC │   Browser       │
│                 │        │                 │
│ Pattern Index:  │        │ Pattern Index:  │
│ - unit-auth-01  │ Direct │ - unit-auth-01  │
│ - e2e-login-02  │ P2P    │ - perf-api-03   │
│ - int-db-03     │ Data   │ - sec-xss-04    │
└─────────────────┘        └─────────────────┘
         ▲                          ▲
         │ WebRTC                   │ WebRTC
         │ Data Channel            │ Data Channel
         ▼                          ▼
┌─────────────────────────────────────────┐
│            Charlie's Browser             │
│                                          │
│ Pattern Index:                           │
│ - unit-auth-01 (from Alice)              │
│ - e2e-login-02 (from Alice)              │
│ - perf-api-03 (from Bob)                 │
│ - sec-xss-04 (from Bob)                  │
│ - int-db-03 (from Alice)                 │
└─────────────────────────────────────────┘
```

**Key Points:**
- Signaling server only handles peer discovery (no pattern data)
- Patterns flow directly between browsers via WebRTC data channels
- Each peer maintains a local pattern index
- Conflicts resolved by version number and timestamp

---

## Quick Start

### 1. Start the Edge Server

```bash
# Start signaling server
node dist/edge/server/index.js
```

### 2. Create React App with P2P

```tsx
// index.tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import { P2PProvider } from '@agentic-qe/edge/webapp';
import App from './App';

const root = createRoot(document.getElementById('root')!);

root.render(
  <P2PProvider config={{
    signalingUrl: 'ws://localhost:3002',
    roomId: 'my-team',
    autoConnect: true
  }}>
    <App />
  </P2PProvider>
);
```

### 3. Build the Dashboard

```tsx
// App.tsx
import { useP2P, usePatternSync } from '@agentic-qe/edge/webapp';
import { useEffect, useState } from 'react';

function App() {
  const { isInitialized, peers, sharePattern } = useP2P();
  const { syncAll, pendingCount, syncedCount, onPatternReceived } = usePatternSync();
  const [patterns, setPatterns] = useState<SharedPattern[]>([]);

  useEffect(() => {
    const unsubscribe = onPatternReceived((pattern) => {
      setPatterns(prev => [...prev, pattern]);
    });
    return unsubscribe;
  }, [onPatternReceived]);

  return (
    <div>
      <h1>Pattern Sharing Dashboard</h1>

      <section>
        <h2>Connection Status</h2>
        <p>Connected: {isInitialized ? 'Yes' : 'No'}</p>
        <p>Peers Online: {peers.size}</p>
      </section>

      <section>
        <h2>Sync Status</h2>
        <p>Pending: {pendingCount}</p>
        <p>Synced: {syncedCount}</p>
        <button onClick={syncAll}>Sync All</button>
      </section>

      <section>
        <h2>Received Patterns ({patterns.length})</h2>
        <ul>
          {patterns.map(p => (
            <li key={p.id}>
              {p.name} ({p.category}) - from {p.sharedBy}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
```

---

## React Hooks Reference

### useP2P

Core hook for P2P functionality.

```typescript
const {
  isInitialized,     // boolean - connection ready
  connectionState,   // string - signaling connection state
  peers,             // Map<PeerId, PeerInfo> - connected peers
  localPeerId,       // string - your peer ID
  error,             // Error | null - last error

  // Actions
  initialize,        // () => Promise<void> - manual init
  connectToPeer,     // (peerId: string) => Promise<void>
  disconnectFromPeer, // (peerId: string) => Promise<void>
  sharePattern,      // (patternId: string, peerIds?: string[]) => Promise<void>
  requestPatternSync, // (peerId: string) => Promise<void>

  // Event subscriptions
  subscribe,         // (event, handler) => unsubscribe
} = useP2P();
```

### usePatternSync

Pattern synchronization management.

```typescript
const {
  status,           // PatternSyncStatus - current sync state
  isSyncing,        // boolean - sync in progress
  lastSyncAt,       // Date | null - last successful sync
  pendingCount,     // number - patterns awaiting sync
  syncedCount,      // number - successfully synced patterns

  // Actions
  sync,             // (peerId?: string) => Promise<SyncResult>
  syncAll,          // () => Promise<SyncResult[]>
  cancelSync,       // () => void

  // Event subscriptions
  onPatternReceived, // (handler) => unsubscribe
  onSyncComplete,    // (handler) => unsubscribe
  onSyncError,       // (handler) => unsubscribe
  onConflict,        // (handler) => unsubscribe
} = usePatternSync({
  autoSync: true,           // Auto-sync on connect (default: true)
  syncInterval: 30000,      // Periodic sync interval ms (default: 30000)
  maxPendingPatterns: 100,  // Trigger sync threshold (default: 100)
});
```

### usePeerConnection

Monitor individual peer connections.

```typescript
const {
  connectionState,   // 'new' | 'connecting' | 'connected' | 'disconnected' | 'failed'
  dataChannelState,  // 'connecting' | 'open' | 'closing' | 'closed'
  stats,             // { latency, bytesReceived, bytesSent }
  error,             // Error | null

  // Actions
  connect,           // () => Promise<void>
  disconnect,        // () => Promise<void>
  sendMessage,       // (message: any) => void
} = usePeerConnection(peerId);
```

---

## Pattern Data Model

```typescript
interface SharedPattern {
  id: string;              // Unique pattern identifier
  name: string;            // Human-readable name
  category: PatternCategory;
  framework: string;       // jest, cypress, playwright, etc.
  pattern: string;         // The actual test pattern code
  description: string;     // What this pattern tests
  confidence: number;      // 0-100 quality score
  usageCount: number;      // Times used successfully
  version: number;         // For conflict resolution
  createdAt: Date;
  updatedAt: Date;
  sharedBy: string;        // Peer ID of sharer
}

enum PatternCategory {
  UNIT_TEST = 'unit-test',
  INTEGRATION_TEST = 'integration-test',
  E2E_TEST = 'e2e-test',
  PERFORMANCE_TEST = 'performance-test',
  SECURITY_TEST = 'security-test',
  DEFECT_FIX = 'defect-fix'
}
```

---

## Conflict Resolution

When two peers modify the same pattern:

1. **Version Check**: Higher version number wins
2. **Timestamp Tiebreaker**: If versions equal, later timestamp wins
3. **Manual Resolution**: `onConflict` callback for custom handling

```typescript
const { onConflict } = usePatternSync();

useEffect(() => {
  const unsubscribe = onConflict((conflict) => {
    console.log('Conflict detected:', {
      patternId: conflict.patternId,
      localVersion: conflict.localVersion,
      remoteVersion: conflict.remoteVersion,
      localTimestamp: conflict.localUpdatedAt,
      remoteTimestamp: conflict.remoteUpdatedAt
    });

    // Custom resolution logic
    if (conflict.remoteVersion > conflict.localVersion) {
      conflict.resolveWith('remote');
    } else {
      conflict.resolveWith('local');
    }
  });

  return unsubscribe;
}, [onConflict]);
```

---

## Security Considerations

### WebRTC Security

- **Encryption**: All data channels use DTLS encryption
- **Authentication**: Peer IDs verified via signaling server
- **No Server Storage**: Patterns never stored on signaling server

### Best Practices

```typescript
// Validate incoming patterns
onPatternReceived((pattern) => {
  // Check pattern structure
  if (!pattern.id || !pattern.pattern) {
    console.warn('Invalid pattern received');
    return;
  }

  // Sanitize pattern content
  if (pattern.pattern.includes('eval(')) {
    console.warn('Potentially unsafe pattern rejected');
    return;
  }

  // Accept valid pattern
  addToLocalIndex(pattern);
});
```

---

## Troubleshooting

### Peers Not Connecting

1. Check signaling server is running:
   ```bash
   curl http://localhost:3002/health  # Should return OK
   ```

2. Verify same room ID:
   ```typescript
   // Both peers must use same roomId
   <P2PProvider config={{ roomId: 'team-alpha' }}>
   ```

3. Check browser console for WebRTC errors

### Patterns Not Syncing

1. Verify data channel is open:
   ```typescript
   const { dataChannelState } = usePeerConnection(peerId);
   console.log(dataChannelState);  // Should be 'open'
   ```

2. Check pattern format matches expected schema

3. Enable debug logging:
   ```typescript
   <P2PProvider config={{ debug: true }}>
   ```

### High Latency

1. Check network conditions between peers
2. Consider using TURN server for relay:
   ```typescript
   const config = {
     iceServers: [
       { urls: 'stun:stun.l.google.com:19302' },
       {
         urls: 'turn:your-turn-server.com',
         username: 'user',
         credential: 'password'
       }
     ]
   };
   ```

---

## Related Documentation

- [Edge Server Guide](./edge-server.md)
- [Agent Commands Reference](../cli/agent-commands.md)
- [Pattern Management Guide](./PATTERN-MANAGEMENT-USER-GUIDE.md)
