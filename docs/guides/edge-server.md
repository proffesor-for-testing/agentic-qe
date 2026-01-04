# Edge Server Guide

Complete guide for deploying and using the AQE Edge Server for REST API access and P2P pattern sharing.

## Overview

The Edge Server provides two deployment options beyond the standard Claude Code integration:

1. **REST API** - Spawn and manage agents from external applications, CI/CD pipelines, or custom tools
2. **P2P Pattern Sharing** - Real-time test pattern synchronization between team members via WebRTC

## Quick Start

### Starting the Edge Server

```bash
# Build the project (if not already built)
npm run build

# Start with default ports (HTTP: 3001, WebSocket: 3002)
node dist/edge/server/index.js

# Or with custom configuration
HTTP_PORT=8080 WS_PORT=8081 HOST=0.0.0.0 node dist/edge/server/index.js
```

### Verify Server is Running

```bash
# Health check
curl http://localhost:3001/health

# Response:
# {"status":"ok","uptime":1234,"version":"1.0.0"}

# Full API health with agent/peer counts
curl http://localhost:3001/api/health

# Response:
# {"status":"ok","uptime":1234,"version":"1.0.0","agents":0,"signalingPeers":0}
```

---

## REST API Reference

### Agent Management

#### Spawn Agent

```bash
POST /api/agents/spawn
Content-Type: application/json

{
  "agentType": "test-generator",
  "task": "Create unit tests for UserService",
  "model": "claude-sonnet-4-20250514",  // optional
  "maxTokens": 8192                      // optional
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "agentId": "agent-550e8400-e29b-41d4-a716-446655440000",
  "agentType": "test-generator",
  "status": "running",
  "startedAt": "2025-01-03T10:30:00.000Z"
}
```

#### List Agents

```bash
GET /api/agents
GET /api/agents?status=running
GET /api/agents?type=test-generator
```

**Response:**
```json
{
  "agents": [
    {
      "id": "agent-550e8400...",
      "agentType": "test-generator",
      "status": "running",
      "startedAt": "2025-01-03T10:30:00.000Z"
    }
  ]
}
```

#### Get Agent Status

```bash
GET /api/agents/:id
```

**Response:**
```json
{
  "id": "agent-550e8400...",
  "agentType": "test-generator",
  "status": "completed",
  "startedAt": "2025-01-03T10:30:00.000Z",
  "completedAt": "2025-01-03T10:32:15.000Z",
  "exitCode": 0
}
```

#### Get Agent Output

```bash
GET /api/agents/:id/output
GET /api/agents/:id/output?last=100  # Last 100 lines
```

**Response:**
```json
{
  "output": "Generated 15 test cases for UserService...\n..."
}
```

#### Cancel Agent

```bash
DELETE /api/agents/:id
```

**Response:**
```json
{
  "success": true,
  "message": "Agent cancelled"
}
```

#### List Available Agent Types

```bash
GET /api/agents/types
```

**Response:**
```json
{
  "types": [
    "test-generator",
    "coverage-analyzer",
    "quality-gate",
    "performance-tester",
    "security-scanner",
    "flaky-test-hunter",
    "chaos-engineer",
    "visual-tester",
    "code-reviewer",
    "integration-tester"
  ]
}
```

### Signaling Server Stats

```bash
GET /api/signaling/stats
```

**Response:**
```json
{
  "totalPeers": 5,
  "totalRooms": 2,
  "messagesProcessed": 1247,
  "uptime": 3600000
}
```

### Room Peers

```bash
GET /api/signaling/rooms/:roomId/peers
```

**Response:**
```json
{
  "roomId": "team-alpha",
  "peers": ["peer-1", "peer-2", "peer-3"]
}
```

---

## P2P Pattern Sharing

### Architecture

```
┌─────────────────┐     WebSocket     ┌──────────────────┐
│   Browser A     │◄──────────────────►│  Signaling       │
│   (P2PService)  │                    │  Server          │
└────────┬────────┘                    │  (WS: 3002)      │
         │                             └──────────────────┘
         │ WebRTC Data Channel                  ▲
         │ (Direct P2P)                         │ WebSocket
         ▼                                      │
┌─────────────────┐                    ┌────────┴─────────┐
│   Browser B     │◄───────────────────│   Browser C      │
│   (P2PService)  │    WebRTC          │   (P2PService)   │
└─────────────────┘                    └──────────────────┘
```

### React Integration

#### Setup Provider

```tsx
// App.tsx
import { P2PProvider } from '@agentic-qe/edge/webapp';

function App() {
  return (
    <P2PProvider config={{
      signalingUrl: 'ws://localhost:3002',
      roomId: 'team-alpha',
      autoConnect: true
    }}>
      <PatternDashboard />
    </P2PProvider>
  );
}
```

#### Using P2P Hooks

```tsx
import { useP2P, usePatternSync, usePeerConnection } from '@agentic-qe/edge/webapp';

function PatternDashboard() {
  // Core P2P functionality
  const {
    isInitialized,
    peers,
    connectToPeer,
    disconnectFromPeer,
    sharePattern
  } = useP2P();

  // Pattern synchronization
  const {
    status,
    isSyncing,
    pendingCount,
    syncedCount,
    sync,
    syncAll,
    onPatternReceived,
    onConflict
  } = usePatternSync({
    autoSync: true,
    syncInterval: 30000  // 30 seconds
  });

  // Subscribe to received patterns
  useEffect(() => {
    const unsubscribe = onPatternReceived((pattern) => {
      console.log('Received pattern:', pattern.id, pattern.name);
    });
    return unsubscribe;
  }, [onPatternReceived]);

  return (
    <div>
      <h2>P2P Status</h2>
      <p>Connected: {isInitialized ? 'Yes' : 'No'}</p>
      <p>Peers: {peers.size}</p>
      <p>Sync Status: {status.status}</p>
      <p>Pending: {pendingCount} | Synced: {syncedCount}</p>

      <button onClick={syncAll} disabled={isSyncing}>
        {isSyncing ? 'Syncing...' : 'Sync All Patterns'}
      </button>
    </div>
  );
}
```

#### Monitor Peer Connections

```tsx
import { usePeerConnection } from '@agentic-qe/edge/webapp';

function PeerMonitor({ peerId }: { peerId: string }) {
  const {
    connectionState,
    dataChannelState,
    stats,
    connect,
    disconnect
  } = usePeerConnection(peerId);

  return (
    <div>
      <p>Peer: {peerId}</p>
      <p>Connection: {connectionState}</p>
      <p>Data Channel: {dataChannelState}</p>
      <p>Latency: {stats?.latency}ms</p>

      {connectionState === 'disconnected' && (
        <button onClick={connect}>Connect</button>
      )}
      {connectionState === 'connected' && (
        <button onClick={disconnect}>Disconnect</button>
      )}
    </div>
  );
}
```

### Pattern Data Format

```typescript
interface SharedPattern {
  id: string;
  name: string;
  category: PatternCategory;
  framework: string;
  pattern: string;
  description: string;
  confidence: number;
  usageCount: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  sharedBy: string;  // Peer ID
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

## CI/CD Integration

### GitHub Actions Example

```yaml
name: AQE Test Generation

on: [push]

jobs:
  generate-tests:
    runs-on: ubuntu-latest
    services:
      edge-server:
        image: node:20
        ports:
          - 3001:3001
          - 3002:3002

    steps:
      - uses: actions/checkout@v4

      - name: Start Edge Server
        run: |
          npm ci
          npm run build
          node dist/edge/server/index.js &
          sleep 5  # Wait for server startup

      - name: Generate Tests
        run: |
          RESPONSE=$(curl -X POST http://localhost:3001/api/agents/spawn \
            -H "Content-Type: application/json" \
            -d '{
              "agentType": "test-generator",
              "task": "Create unit tests for src/services/"
            }')

          AGENT_ID=$(echo $RESPONSE | jq -r '.agentId')
          echo "Agent ID: $AGENT_ID"

          # Wait for completion
          while true; do
            STATUS=$(curl -s http://localhost:3001/api/agents/$AGENT_ID | jq -r '.status')
            if [ "$STATUS" = "completed" ]; then
              break
            fi
            sleep 5
          done

          # Get output
          curl http://localhost:3001/api/agents/$AGENT_ID/output
```

### Jenkins Pipeline Example

```groovy
pipeline {
    agent any

    stages {
        stage('Start Edge Server') {
            steps {
                sh '''
                    npm ci
                    npm run build
                    nohup node dist/edge/server/index.js &
                    sleep 5
                '''
            }
        }

        stage('Generate Tests') {
            steps {
                script {
                    def response = sh(
                        script: '''
                            curl -X POST http://localhost:3001/api/agents/spawn \
                                -H "Content-Type: application/json" \
                                -d '{"agentType": "test-generator", "task": "Generate tests"}'
                        ''',
                        returnStdout: true
                    )
                    def agentId = readJSON(text: response).agentId

                    // Poll for completion
                    timeout(time: 10, unit: 'MINUTES') {
                        waitUntil {
                            def status = sh(
                                script: "curl -s http://localhost:3001/api/agents/${agentId} | jq -r '.status'",
                                returnStdout: true
                            ).trim()
                            return status == 'completed'
                        }
                    }
                }
            }
        }
    }
}
```

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `HTTP_PORT` | `3001` | HTTP API port |
| `WS_PORT` | `3002` | WebSocket signaling port |
| `HOST` | `0.0.0.0` | Bind address |
| `CORS_ORIGINS` | `localhost:3000,3001,5173` | Allowed CORS origins |
| `MAX_AGENTS` | `10` | Maximum concurrent agents |

### Programmatic Configuration

```typescript
import { EdgeServer } from '@agentic-qe/edge/server';

const server = new EdgeServer({
  httpPort: 3001,
  wsPort: 3002,
  host: '0.0.0.0',
  projectPath: process.cwd(),
  maxAgents: 20,
  corsOrigins: [
    'http://localhost:3000',
    'https://my-app.example.com'
  ],
  signalingConfig: {
    maxPeersPerRoom: 50,
    heartbeatInterval: 30000
  }
});

await server.start();
console.log('Edge Server running');

// Graceful shutdown
process.on('SIGTERM', async () => {
  await server.stop();
  process.exit(0);
});
```

---

## Comparison: CLI vs REST API vs Task Tool

| Feature | CLI (`aqe agent spawn`) | REST API | Task Tool |
|---------|-------------------------|----------|-----------|
| **Use Case** | Terminal, scripts | CI/CD, web apps | Claude Code |
| **Async Support** | `--wait` flag | Polling | Built-in |
| **Output Streaming** | Yes (attach) | Polling | Yes |
| **External Access** | Local only | Network | Local only |
| **Authentication** | N/A | Custom (CORS) | N/A |
| **Best For** | Developers | Automation | AI workflows |

---

## Troubleshooting

### Port Already in Use

```bash
# Find process using port
lsof -i :3001

# Kill process
kill -9 <PID>

# Or use different port
HTTP_PORT=4001 node dist/edge/server/index.js
```

### CORS Errors

Add your origin to the CORS configuration:

```typescript
const server = new EdgeServer({
  corsOrigins: [
    'http://localhost:3000',
    'https://your-domain.com'  // Add your domain
  ]
});
```

### WebRTC Connection Failed

1. Ensure both peers are connected to the signaling server
2. Check firewall settings for WebRTC ports
3. Verify STUN/TURN server configuration for NAT traversal

```typescript
// Configure ICE servers for NAT traversal
const config: P2PServiceConfig = {
  signalingUrl: 'ws://localhost:3002',
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'turn:your-turn-server.com', username: 'user', credential: 'pass' }
  ]
};
```

---

## Related Documentation

- [Agent Commands Reference](../cli/agent-commands.md)
- [Usage Guide](../reference/usage.md)
- [P2P Pattern Sharing](./p2p-pattern-sharing.md)
