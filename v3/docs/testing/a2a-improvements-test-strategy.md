# A2A Improvements Test Strategy

## Executive Summary

This document outlines the comprehensive test strategy for the three planned A2A protocol improvements:

1. **Phase 1: OAuth 2.0 Integration** (~1,050 lines of implementation)
2. **Phase 2: Push Notifications** (~1,000 lines of implementation)
3. **Phase 3: Dynamic Agent Count** (~850 lines of implementation)

**Total Target: 150+ new tests** covering unit, integration, and e2e scenarios.

## Test Pyramid Distribution

| Test Type | Count | Percentage | Rationale |
|-----------|-------|------------|-----------|
| Unit Tests | 100+ | 70% | Fast feedback, isolated component testing |
| Integration Tests | 40+ | 25% | Cross-component interaction verification |
| E2E Tests | 10+ | 5% | Critical user journey validation |

## Coverage Goals

| Component | Line Coverage | Branch Coverage | Rationale |
|-----------|--------------|-----------------|-----------|
| OAuth 2.0 | 90% | 85% | Security-critical code requires high coverage |
| Push Notifications | 85% | 80% | Async retry logic needs thorough testing |
| Dynamic Discovery | 85% | 80% | File system operations need comprehensive tests |

---

## Phase 1: OAuth 2.0 Integration

### Implementation Files (Estimated ~1,050 lines)

```
v3/src/adapters/a2a/auth/
├── oauth-provider.ts      (~250 lines) - OAuth 2.0 provider implementation
├── token-store.ts         (~200 lines) - Secure token storage with TTL
├── jwt-utils.ts           (~180 lines) - JWT creation, validation, parsing
├── scopes.ts              (~120 lines) - A2A scope definitions and validation
├── middleware.ts          (~200 lines) - Express/HTTP auth middleware
└── index.ts               (~100 lines) - Barrel exports
```

### Unit Tests (40+ tests)

#### 1. `oauth-provider.test.ts` (12 tests)

| Test Case | Priority | Description |
|-----------|----------|-------------|
| should create provider with valid config | P0 | Basic instantiation |
| should validate client credentials | P0 | Client ID/secret validation |
| should generate authorization URL | P1 | Authorization code flow |
| should exchange authorization code for tokens | P0 | Token exchange |
| should refresh access token | P0 | Token refresh flow |
| should revoke access token | P1 | Token revocation |
| should reject invalid client credentials | P0 | Security validation |
| should handle token expiration | P0 | TTL handling |
| should support PKCE flow | P1 | Code challenge verification |
| should emit token events | P2 | Event emission |
| should handle concurrent token refresh | P1 | Race condition prevention |
| should enforce rate limits on token requests | P1 | DoS prevention |

#### 2. `token-store.test.ts` (8 tests)

| Test Case | Priority | Description |
|-----------|----------|-------------|
| should store token with TTL | P0 | Basic storage |
| should retrieve valid token | P0 | Basic retrieval |
| should return null for expired token | P0 | TTL enforcement |
| should delete token | P1 | Token removal |
| should encrypt tokens at rest | P0 | Security requirement |
| should handle concurrent access | P1 | Thread safety |
| should clean up expired tokens | P1 | Automatic cleanup |
| should persist tokens across restarts | P2 | Durability |

#### 3. `jwt-utils.test.ts` (10 tests)

| Test Case | Priority | Description |
|-----------|----------|-------------|
| should create valid JWT | P0 | Token creation |
| should validate JWT signature | P0 | Signature verification |
| should parse JWT claims | P0 | Claim extraction |
| should reject expired JWT | P0 | Expiration check |
| should reject JWT with invalid signature | P0 | Security validation |
| should validate issuer claim | P1 | iss validation |
| should validate audience claim | P1 | aud validation |
| should handle RS256 algorithm | P0 | RSA signatures |
| should handle HS256 algorithm | P1 | HMAC signatures |
| should extract scopes from JWT | P0 | Scope extraction |

#### 4. `scopes.test.ts` (6 tests)

| Test Case | Priority | Description |
|-----------|----------|-------------|
| should define A2A standard scopes | P0 | Scope definitions |
| should validate scope string | P0 | Format validation |
| should check scope permission | P0 | Permission checking |
| should parse space-separated scopes | P1 | Scope parsing |
| should handle hierarchical scopes | P1 | domain:action format |
| should reject invalid scope format | P1 | Input validation |

#### 5. `middleware.test.ts` (8 tests)

| Test Case | Priority | Description |
|-----------|----------|-------------|
| should extract Bearer token from header | P0 | Token extraction |
| should validate token and attach user | P0 | Authentication |
| should reject missing token | P0 | Error handling |
| should reject invalid token | P0 | Security validation |
| should check required scopes | P0 | Authorization |
| should handle token refresh in middleware | P1 | Transparent refresh |
| should set CORS headers | P1 | CORS support |
| should rate limit requests by client | P1 | Rate limiting |

### Integration Tests (15+ tests)

#### `oauth-flow.integration.test.ts` (8 tests)

| Test Case | Priority | Description |
|-----------|----------|-------------|
| should complete authorization code flow | P0 | Full OAuth flow |
| should complete client credentials flow | P0 | M2M authentication |
| should refresh and use new token | P0 | Token refresh flow |
| should handle concurrent sessions | P1 | Multi-session support |
| should persist tokens across server restart | P1 | Durability |
| should revoke all tokens on client revocation | P1 | Security cleanup |
| should support multiple OAuth providers | P2 | Multi-provider |
| should integrate with A2A error codes | P1 | Error code mapping |

#### `authenticated-endpoints.integration.test.ts` (7 tests)

| Test Case | Priority | Description |
|-----------|----------|-------------|
| should protect /a2a/:agentId/card endpoint | P0 | Extended card auth |
| should allow access with valid token | P0 | Happy path |
| should return 401 without token | P0 | Unauthenticated rejection |
| should return 403 with insufficient scope | P0 | Authorization check |
| should include rate limit headers | P1 | Rate limit info |
| should handle token expiration gracefully | P1 | Graceful degradation |
| should audit authentication attempts | P2 | Security logging |

---

## Phase 2: Push Notifications

### Implementation Files (Estimated ~1,000 lines)

```
v3/src/adapters/a2a/notifications/
├── webhook-service.ts       (~300 lines) - Webhook delivery with retry
├── retry-queue.ts           (~250 lines) - Persistent retry queue
├── signature.ts             (~150 lines) - HMAC-SHA256 payload signing
├── subscription-store.ts    (~200 lines) - Webhook subscription storage
└── index.ts                 (~100 lines) - Barrel exports
```

### Unit Tests (30+ tests)

#### 1. `webhook-service.test.ts` (10 tests)

| Test Case | Priority | Description |
|-----------|----------|-------------|
| should deliver webhook to valid URL | P0 | Basic delivery |
| should sign payload with HMAC-SHA256 | P0 | Signature generation |
| should include A2A headers | P0 | Protocol compliance |
| should retry on 5xx errors | P0 | Retry on server error |
| should not retry on 4xx errors | P0 | Client error handling |
| should respect timeout configuration | P1 | Timeout handling |
| should emit delivery events | P1 | Event emission |
| should handle network errors | P0 | Error handling |
| should track delivery metrics | P1 | Observability |
| should support batch deliveries | P2 | Performance optimization |

#### 2. `retry-queue.test.ts` (8 tests)

| Test Case | Priority | Description |
|-----------|----------|-------------|
| should enqueue failed delivery | P0 | Queue addition |
| should dequeue in FIFO order | P0 | Queue ordering |
| should apply exponential backoff | P0 | Backoff strategy |
| should persist queue across restarts | P1 | Durability |
| should expire items after max retries | P0 | Retry limit |
| should process queue in background | P1 | Background processing |
| should pause on rate limit | P1 | Rate limit handling |
| should prioritize by age | P1 | Priority ordering |

#### 3. `signature.test.ts` (6 tests)

| Test Case | Priority | Description |
|-----------|----------|-------------|
| should generate valid HMAC-SHA256 | P0 | Signature creation |
| should verify valid signature | P0 | Signature verification |
| should reject invalid signature | P0 | Security validation |
| should include timestamp in signature | P1 | Replay protection |
| should reject stale signatures | P1 | Time-based validation |
| should handle different encodings | P1 | Encoding support |

#### 4. `subscription-store.test.ts` (8 tests)

| Test Case | Priority | Description |
|-----------|----------|-------------|
| should create subscription | P0 | Basic creation |
| should retrieve subscription by task ID | P0 | Task lookup |
| should update subscription URL | P1 | URL modification |
| should delete subscription | P0 | Subscription removal |
| should validate webhook URL format | P0 | URL validation |
| should store subscription secret | P0 | Secret management |
| should list subscriptions by agent | P1 | Agent filtering |
| should enforce subscription limits | P1 | DoS prevention |

### Integration Tests (10+ tests)

#### `push-notification.integration.test.ts` (10 tests)

| Test Case | Priority | Description |
|-----------|----------|-------------|
| should deliver task status change | P0 | Status notification |
| should deliver task completion | P0 | Completion notification |
| should deliver task failure | P0 | Error notification |
| should retry failed delivery | P0 | Retry mechanism |
| should respect unsubscribe | P1 | Unsubscribe flow |
| should handle webhook server down | P1 | Graceful degradation |
| should validate signature on receiver | P0 | E2E signature check |
| should support concurrent notifications | P1 | Parallelism |
| should integrate with task manager | P0 | Component integration |
| should clean up after task completion | P1 | Resource cleanup |

---

## Phase 3: Dynamic Agent Count

### Implementation Files (Estimated ~850 lines)

```
v3/src/adapters/a2a/discovery/
├── file-watcher.ts          (~200 lines) - FS event watching
├── hot-reload-service.ts    (~300 lines) - Dynamic card reloading
├── agent-health.ts          (~200 lines) - Agent health tracking
├── metrics.ts               (~150 lines) - Discovery metrics
```

### Unit Tests (25+ tests)

#### 1. `file-watcher.test.ts` (7 tests)

| Test Case | Priority | Description |
|-----------|----------|-------------|
| should detect new agent markdown files | P0 | File creation |
| should detect modified agent files | P0 | File modification |
| should detect deleted agent files | P0 | File deletion |
| should debounce rapid changes | P1 | Performance |
| should watch nested directories | P1 | Directory support |
| should ignore non-markdown files | P1 | Filter non-agents |
| should emit file events | P0 | Event emission |

#### 2. `hot-reload-service.test.ts` (10 tests)

| Test Case | Priority | Description |
|-----------|----------|-------------|
| should add agent card on file creation | P0 | Dynamic addition |
| should update agent card on file change | P0 | Dynamic update |
| should remove agent card on file deletion | P0 | Dynamic removal |
| should invalidate caches on change | P0 | Cache invalidation |
| should not interrupt active tasks | P0 | Graceful reload |
| should validate card before adding | P0 | Validation |
| should emit reload events | P1 | Event emission |
| should support manual reload trigger | P1 | Manual control |
| should batch rapid changes | P1 | Performance |
| should maintain agent count accuracy | P0 | Count tracking |

#### 3. `agent-health.test.ts` (5 tests)

| Test Case | Priority | Description |
|-----------|----------|-------------|
| should track agent health status | P0 | Health tracking |
| should mark unhealthy agents | P0 | Health degradation |
| should recover healthy agents | P1 | Health recovery |
| should exclude unhealthy from routing | P0 | Routing integration |
| should emit health events | P1 | Event emission |

#### 4. `metrics.test.ts` (5 tests)

| Test Case | Priority | Description |
|-----------|----------|-------------|
| should track total agent count | P0 | Count metric |
| should track healthy/unhealthy counts | P0 | Health metrics |
| should track reload frequency | P1 | Operational metric |
| should expose prometheus format | P2 | Prometheus support |
| should reset metrics on demand | P2 | Admin control |

### Integration Tests (10+ tests)

#### `dynamic-agents.integration.test.ts` (10 tests)

| Test Case | Priority | Description |
|-----------|----------|-------------|
| should load agents on startup | P0 | Initial load |
| should add new agent at runtime | P0 | Hot addition |
| should update agent at runtime | P0 | Hot update |
| should remove agent at runtime | P0 | Hot removal |
| should reflect changes in discovery | P0 | Discovery sync |
| should maintain routing during reload | P0 | Routing stability |
| should handle bulk file changes | P1 | Bulk operations |
| should recover from invalid files | P1 | Error recovery |
| should update platform card skills | P1 | Aggregation |
| should persist changes across restart | P1 | Durability |

---

## Test Data Fixtures

### Location: `v3/tests/fixtures/a2a/`

### OAuth Fixtures (`oauth-fixtures.ts`)

```typescript
// Mock OAuth clients
export const mockOAuthClients = {
  validClient: {
    clientId: 'test-client-001',
    clientSecret: 'secret-abc123xyz',
    redirectUris: ['https://app.example.com/callback'],
    scopes: ['tasks:read', 'tasks:write', 'agents:read'],
    grantTypes: ['authorization_code', 'refresh_token']
  },
  serviceClient: {
    clientId: 'service-client-001',
    clientSecret: 'service-secret-xyz',
    scopes: ['agents:read', 'agents:execute'],
    grantTypes: ['client_credentials']
  }
};

// Sample JWT tokens
export const mockJwtTokens = {
  validAccessToken: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...',
  expiredToken: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...',
  invalidSignatureToken: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...'
};

// JWT claims
export const mockJwtClaims = {
  standard: {
    iss: 'https://auth.agentic-qe.dev',
    sub: 'client:test-client-001',
    aud: 'https://api.agentic-qe.dev/a2a',
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
    scope: 'tasks:read tasks:write'
  }
};
```

### Webhook Fixtures (`webhook-fixtures.ts`)

```typescript
// Webhook payloads
export const mockWebhookPayloads = {
  taskStatusChange: {
    type: 'task.status_changed',
    taskId: 'task-001',
    previousStatus: 'submitted',
    newStatus: 'working',
    timestamp: '2026-01-31T10:00:00Z'
  },
  taskCompleted: {
    type: 'task.completed',
    taskId: 'task-001',
    status: 'completed',
    artifacts: [
      { id: 'artifact-001', name: 'Test Results' }
    ],
    timestamp: '2026-01-31T10:05:00Z'
  },
  taskFailed: {
    type: 'task.failed',
    taskId: 'task-001',
    status: 'failed',
    error: { code: 'TIMEOUT', message: 'Task timed out' },
    timestamp: '2026-01-31T10:05:00Z'
  }
};

// Webhook subscriptions
export const mockSubscriptions = {
  standard: {
    id: 'sub-001',
    taskId: 'task-001',
    webhookUrl: 'https://callback.example.com/webhook',
    secret: 'whsec_test123',
    events: ['task.status_changed', 'task.completed', 'task.failed']
  }
};
```

### Agent Markdown Fixtures (`agent-fixtures.ts`)

```typescript
// Sample agent markdown content
export const mockAgentMarkdown = {
  testArchitect: `---
name: qe-test-architect
version: 3.0.0
domain: test-generation
---

# QE Test Architect

AI-powered test generation specialist.

## Skills
- test-generation: Generate comprehensive test suites
- tdd-support: Red-green-refactor guidance

## Capabilities
- streaming: true
- pushNotifications: true
`,
  securityScanner: `---
name: qe-security-scanner
version: 3.0.0
domain: security-compliance
---

# QE Security Scanner

OWASP vulnerability detection.

## Skills
- security-scan: Comprehensive security scanning
`
};
```

---

## Test Execution Guidelines

### Running Tests

```bash
# All A2A tests
cd v3 && npm test -- --run --grep "A2A"

# Phase-specific tests
npm test -- --run --grep "OAuth"
npm test -- --run --grep "Push Notification"
npm test -- --run --grep "Dynamic Agent"

# With coverage
npm test -- --run --coverage --grep "A2A"
```

### CI/CD Integration

```yaml
# .github/workflows/a2a-tests.yml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run A2A Tests
        run: |
          cd v3
          npm ci
          npm test -- --run --coverage
      - name: Check Coverage Thresholds
        run: |
          # OAuth: 90% line, 85% branch
          # Notifications: 85% line, 80% branch
          # Discovery: 85% line, 80% branch
```

### Test Isolation

- Each test file creates its own fixtures
- Use `beforeEach` for test setup, `afterEach` for cleanup
- Mock external HTTP calls with `vi.mock()` or `nock`
- Use fake timers (`vi.useFakeTimers()`) for time-dependent tests
- Destroy any services/stores in `afterEach` to prevent memory leaks

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| OAuth token security | Use secure random for secrets, encrypt at rest |
| Webhook delivery failure | Retry queue with exponential backoff |
| File watcher performance | Debounce changes, batch processing |
| Test flakiness | Isolate tests, use deterministic data |
| Coverage gaps | PR reviews require coverage report |

---

## Timeline

| Week | Phase | Tests |
|------|-------|-------|
| 1 | OAuth 2.0 Unit Tests | 40 tests |
| 1 | OAuth 2.0 Integration Tests | 15 tests |
| 2 | Push Notification Unit Tests | 30 tests |
| 2 | Push Notification Integration Tests | 10 tests |
| 3 | Dynamic Agent Unit Tests | 25 tests |
| 3 | Dynamic Agent Integration Tests | 10 tests |
| 3 | E2E Tests | 10 tests |
| 4 | Coverage Analysis & Gap Filling | +10 tests |

**Total: 150+ tests**

---

*Document Version: 1.0*
*Created: 2026-01-31*
*Author: QE Test Architect Agent*
