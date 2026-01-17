# Agent 3: REST API Specialist Briefing

## Mission
Prepare REST API for integration testing and verify it can bind to port 3001 successfully.

## Target File
`/workspaces/agentic-qe-cf/src/visualization/api/RestEndpoints.ts`

## Current Status
- **Depends on:** Agent 1 (DataTransformer) completion
- **Cannot compile until:** DataTransformer type errors are fixed
- **Port:** 3001
- **Framework:** Express.js

## Pre-Work (While Waiting for Agent 1)
1. Review RestEndpoints.ts for potential issues
2. Identify environment variables needed
3. Draft startup script
4. Plan minimal test endpoint

## Main Tasks (After Agent 1 Completes)
1. Verify backend compiles with fixed DataTransformer
2. Create standalone server startup script
3. Test port 3001 binding
4. Implement or verify health check endpoint
5. Document configuration

## Testing Approach

### Phase 1: Compilation Check
```bash
cd /workspaces/agentic-qe-cf
npm run build
```

### Phase 2: Port Binding Test
Create: `/workspaces/agentic-qe-cf/scripts/start-rest-api.ts`
```typescript
import { RestApiServer } from './src/visualization/api/RestEndpoints';
// Test minimal startup
```

### Phase 3: Endpoint Test
```bash
curl http://localhost:3001/health
# Expected: 200 OK
```

## Success Criteria
1. Backend compiles successfully (after Agent 1)
2. Port 3001 binds without errors
3. Server starts without crashes
4. At least 1 endpoint responds (health check or status)
5. Clean shutdown works

## Expected Deliverables
1. **Startup script** - `/workspaces/agentic-qe-cf/scripts/start-rest-api.ts`
2. **PROGRESS.md** - Status updates
3. **BLOCKERS.md** - Any issues encountered
4. **RESULTS.md** - Final test results
5. **ENV-VARS.md** - Environment variables documented

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
- Test scenario design
