# Phase 3 Fixes - Agent Assignments

**Coordination Session:** 2025-11-21
**Total Agents:** 4 (3 parallel, 1 sequential)

---

## Parallel Execution Phase

### Agent 1: DataTransformer Specialist
**Working Directory:** `/workspaces/agentic-qe-cf/docs/phase3/fixes/backend-datatransformer/`
**Primary File:** `/workspaces/agentic-qe-cf/src/visualization/core/DataTransformer.ts`
**Mission:** Fix all 28 TypeScript type errors

**Specific Tasks:**
1. Add type guards for AgentDB query results (lines 70-123)
2. Define proper interfaces for event objects
3. Fix ReasoningChain type to include `steps` property (line 293)
4. Add type assertions where TypeScript cannot infer types
5. Verify backend compiles: `npm run build` passes

**Success Criteria:**
- Zero TypeScript errors in DataTransformer.ts
- Backend build succeeds
- No runtime type errors

**Dependencies:** None (can start immediately)
**Estimated Time:** 2-3 hours

---

### Agent 2: React Frontend Specialist
**Working Directory:** `/workspaces/agentic-qe-cf/docs/phase3/fixes/frontend-react/`
**Primary Files:**
- `/workspaces/agentic-qe-cf/frontend/src/components/MindMap/MindMap.tsx`
- `/workspaces/agentic-qe-cf/frontend/src/components/MetricsPanel/RadarChart.tsx`

**Mission:** Fix all frontend TypeScript errors and build issues

**Specific Tasks:**
1. Install or create type declarations for `cytoscape-cose-bilkent`
2. Fix Cytoscape layout property types (lines 90, 130, 199)
3. Remove unused `QualityMetrics` import (line 13 of RadarChart)
4. Verify frontend builds: `cd /workspaces/agentic-qe-cf/frontend && npm run build`

**Success Criteria:**
- Zero TypeScript errors in frontend
- Frontend build succeeds
- Vite bundle size < 500KB

**Dependencies:** None (can start immediately)
**Estimated Time:** 1-2 hours

---

### Agent 3: REST API Specialist
**Working Directory:** `/workspaces/agentic-qe-cf/docs/phase3/fixes/backend-rest-api/`
**Primary File:** `/workspaces/agentic-qe-cf/src/visualization/api/RestEndpoints.ts`

**Mission:** Prepare REST API for integration testing (after DataTransformer fixes)

**Specific Tasks:**
1. Review RestEndpoints.ts for any hidden dependency issues
2. Create startup script to test port 3001 binding
3. Verify Express server configuration
4. Test at least 1 endpoint works (health check or status)
5. Document environment variables needed

**Success Criteria:**
- REST API compiles (depends on DataTransformer)
- Port 3001 binds successfully
- At least 1 endpoint responds (200 OK)

**Dependencies:** **WAITS FOR AGENT 1** (DataTransformer fixes)
**Estimated Time:** 1 hour

---

### Agent 4: WebSocket Specialist
**Working Directory:** `/workspaces/agentic-qe-cf/docs/phase3/fixes/backend-websocket/`
**Primary File:** `/workspaces/agentic-qe-cf/src/visualization/api/WebSocketServer.ts`

**Mission:** Prepare WebSocket server for integration testing (after DataTransformer fixes)

**Specific Tasks:**
1. Review WebSocketServer.ts for dependency issues
2. Create startup script to test port 8080 binding
3. Verify ws library integration
4. Test heartbeat mechanism
5. Document configuration options

**Success Criteria:**
- WebSocket server compiles (depends on DataTransformer)
- Port 8080 binds successfully
- Server accepts at least 1 connection

**Dependencies:** **WAITS FOR AGENT 1** (DataTransformer fixes)
**Estimated Time:** 1 hour

---

## Sequential Execution Phase

### Agent 5: Integration Tester (WAITS FOR ALL)
**Working Directory:** `/workspaces/agentic-qe-cf/docs/phase3/fixes/integration/`
**Test Files:** `/workspaces/agentic-qe-cf/tests/phase3/visualization-api.test.ts`

**Mission:** Verify all 3 servers work together

**Specific Tasks:**
1. Start all 3 servers simultaneously (WebSocket, REST API, React dev)
2. Verify port binding: 8080, 3001, 5173
3. Test WebSocket connection from React frontend
4. Test REST API call from React frontend
5. Run existing test suite: `npm run test:phase3`
6. Measure runtime stability (30-second stress test)

**Success Criteria:**
- All 3 servers start without errors
- All 3 ports are bound
- At least 1 WebSocket message sent/received
- At least 1 REST API call succeeds
- No crashes for 30 seconds

**Dependencies:** **WAITS FOR AGENTS 1, 2, 3, 4**
**Estimated Time:** 1-2 hours

---

## Coordination Protocol

### Quality Gates
- **Gate 1:** Agent 1 (DataTransformer) must complete before Agents 3, 4 start
- **Gate 2:** Agents 1, 2, 3, 4 must all complete before Agent 5 starts
- **Gate 3:** Agent 5 must pass before Phase 3 is marked "complete"

### Communication
- All agents update their working directory with:
  - `PROGRESS.md` - Current status
  - `BLOCKERS.md` - Issues encountered
  - `RESULTS.md` - Final outcomes

### Escalation
- If Agent 1 is blocked for >1 hour, escalate to coordinator
- If integration test fails, all agents reconvene for debugging

