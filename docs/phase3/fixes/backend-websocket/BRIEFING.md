# Agent 4: WebSocket Specialist Briefing

## Mission
Prepare WebSocket server for integration testing and verify it can bind to port 8080 successfully.

## Target File
`/workspaces/agentic-qe-cf/src/visualization/api/WebSocketServer.ts`

## Current Status
- **Depends on:** Agent 1 (DataTransformer) completion
- **Cannot compile until:** DataTransformer type errors are fixed
- **Port:** 8080
- **Library:** ws (WebSocket)

## Pre-Work (While Waiting for Agent 1)
1. Review WebSocketServer.ts for potential issues
2. Identify configuration options
3. Draft startup script
4. Plan heartbeat test

## Main Tasks (After Agent 1 Completes)
1. Verify backend compiles with fixed DataTransformer
2. Create standalone server startup script
3. Test port 8080 binding
4. Verify heartbeat mechanism works
5. Test at least 1 client connection

## Testing Approach

### Phase 1: Compilation Check
```bash
cd /workspaces/agentic-qe-cf
npm run build
```

### Phase 2: Port Binding Test
Create: `/workspaces/agentic-qe-cf/scripts/start-websocket.ts`
```typescript
import { WebSocketServer } from './src/visualization/api/WebSocketServer';
// Test minimal startup
```

### Phase 3: Connection Test
```bash
# Use websocat or wscat to test
npm install -g wscat
wscat -c ws://localhost:8080
# Expected: Connection established, heartbeat received
```

## Success Criteria
1. Backend compiles successfully (after Agent 1)
2. Port 8080 binds without errors
3. Server starts without crashes
4. Accepts at least 1 WebSocket connection
5. Heartbeat messages work
6. Clean shutdown works

## Expected Deliverables
1. **Startup script** - `/workspaces/agentic-qe-cf/scripts/start-websocket.ts`
2. **PROGRESS.md** - Status updates
3. **BLOCKERS.md** - Any issues encountered
4. **RESULTS.md** - Final test results
5. **CONFIG.md** - Configuration options documented

## Time Estimate
1 hour (after Agent 1 completes)

## Coordination
**CRITICAL:** Do NOT start main work until Agent 1 completes
- Monitor `/workspaces/agentic-qe-cf/docs/phase3/fixes/backend-datatransformer/PROGRESS.md`
- Wait for coordinator signal: "Agent 1 COMPLETE"
- Then proceed with full implementation

## Fallback Plan
If Agent 1 is blocked, work on:
- Documentation
- Configuration planning
- Connection test scenarios
- Performance benchmarking plan
