# WebSocket Server Quick Start Guide

## Quick Test

Run the standalone test to verify the WebSocket server works:

```bash
cd /workspaces/agentic-qe-cf
node scripts/test-websocket-standalone.js
```

Expected output:
```
🧪 Testing WebSocket Server Implementation
✅ HTTP/WebSocket server started on port 8080
✅ Port 8080 is bound and listening
✅ Client connected successfully
✅ All tests passed!
```

## Verify Port Binding

```bash
netstat -an | grep 8080
```

Should show:
```
tcp6       0      0 :::8080                 :::*                    LISTEN
```

## Connect with a Client

### Using wscat (install with: npm install -g wscat)

```bash
wscat -c ws://localhost:8080
```

### Using Node.js

```javascript
const { WebSocket } = require('ws');
const client = new WebSocket('ws://localhost:8080');

client.on('open', () => {
  console.log('Connected');
  client.send(JSON.stringify({ type: 'ping' }));
});

client.on('message', (data) => {
  console.log('Received:', data.toString());
});
```

## Integration Example

```typescript
import { WebSocketServer } from './src/visualization/api/WebSocketServer';
import { EventStore } from './src/persistence/event-store';
import { ReasoningStore } from './src/persistence/reasoning-store';

async function startWebSocketServer() {
  // Create stores
  const eventStore = new EventStore();
  const reasoningStore = new ReasoningStore();

  // Create server
  const wsServer = new WebSocketServer(eventStore, reasoningStore, {
    port: 8080,
    heartbeatInterval: 30000,
    clientTimeout: 60000,
    maxBacklogSize: 1000,
    compression: true
  });

  // Setup event listeners
  wsServer.on('started', ({ port }) => {
    console.log(`WebSocket server listening on port ${port}`);
  });

  wsServer.on('client_connected', ({ clientId, subscriptions }) => {
    console.log(`Client ${clientId} connected with subscriptions:`, subscriptions);
  });

  wsServer.on('client_disconnected', ({ clientId, reason }) => {
    console.log(`Client ${clientId} disconnected: ${reason}`);
  });

  wsServer.on('error', ({ error, source }) => {
    console.error(`Error from ${source}:`, error);
  });

  // Start the server
  await wsServer.start();

  // Broadcast events to all connected clients
  wsServer.broadcastEvent({
    type: 'event',
    timestamp: new Date().toISOString(),
    data: {
      agent_id: 'test-generator',
      event_type: 'test_generated',
      test_count: 42
    }
  });

  // Get server statistics
  const stats = wsServer.getStatistics();
  console.log('Server stats:', stats);

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('Shutting down...');
    await wsServer.stop();
    process.exit(0);
  });
}

startWebSocketServer().catch(console.error);
```

## Client Subscription Example

Connect with query parameters to filter events:

```bash
wscat -c "ws://localhost:8080?session_id=session-123&agent_id=test-gen&event_types=test_generated,test_passed"
```

Available subscription options:
- `session_id` - Filter by session ID
- `agent_id` - Filter by agent ID
- `event_types` - Comma-separated list of event types
- `since` - ISO timestamp to get events after

## Message Types

### Heartbeat
```json
{
  "type": "heartbeat",
  "timestamp": "2025-11-21T13:00:00.000Z",
  "data": {
    "connected_clients": 5,
    "uptime_ms": 120000
  }
}
```

### Event
```json
{
  "type": "event",
  "timestamp": "2025-11-21T13:00:00.000Z",
  "data": {
    "agent_id": "test-gen",
    "event_type": "test_generated",
    "payload": { "test_count": 42 }
  }
}
```

### Reasoning
```json
{
  "type": "reasoning",
  "timestamp": "2025-11-21T13:00:00.000Z",
  "data": {
    "chain_id": "chain-123",
    "steps": [...],
    "verdict": "approved"
  }
}
```

## Troubleshooting

### Port already in use
```bash
# Find process using port 8080
lsof -i :8080

# Kill the process
kill -9 <PID>
```

### Connection refused
- Check if server is running
- Verify port number matches
- Check firewall settings

### No messages received
- Verify subscription filters
- Check client connection status
- Review server logs for errors

## Performance Tuning

### High throughput scenarios

```typescript
const wsServer = new WebSocketServer(eventStore, reasoningStore, {
  port: 8080,
  maxBacklogSize: 5000,        // Increase queue size
  compression: true,            // Enable compression
  heartbeatInterval: 60000,     // Reduce heartbeat frequency
});
```

### Low latency scenarios

```typescript
const wsServer = new WebSocketServer(eventStore, reasoningStore, {
  port: 8080,
  maxBacklogSize: 100,          // Smaller queue
  compression: false,           // Disable compression
  heartbeatInterval: 10000,     // More frequent heartbeats
});
```

## Further Reading

- Full implementation details: `docs/websocket-server-implementation.md`
- WebSocket API docs: `src/visualization/api/WebSocketServer.ts`
- Test examples: `scripts/test-websocket-standalone.js`
