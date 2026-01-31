# A2A Improvements Integration Plan

**Status:** Draft
**Created:** 2026-01-31
**Last Updated:** 2026-01-31
**Related ADR:** ADR-054 A2A Protocol Integration

## Executive Summary

This document provides a comprehensive integration plan for the three A2A improvement initiatives:
1. **OAuth 2.0 Authentication** (`auth/` directory)
2. **Push Notifications** (`notifications/` directory)
3. **Dynamic Agent Discovery** (`discovery/` enhancements)

The goal is to ensure these components are properly wired together following the project's dependency injection pattern and anti-drift policies.

---

## Table of Contents

1. [Current State Analysis](#current-state-analysis)
2. [Integration Architecture](#integration-architecture)
3. [File-by-File Integration Guide](#file-by-file-integration-guide)
4. [Interface Contracts](#interface-contracts)
5. [Dependency Injection Pattern](#dependency-injection-pattern)
6. [Code Review Checklist](#code-review-checklist)
7. [Testing Strategy](#testing-strategy)
8. [Migration Path](#migration-path)

---

## Current State Analysis

### Existing Components

| Component | Location | Status | Lines |
|-----------|----------|--------|-------|
| OAuth Scopes | `v3/src/adapters/a2a/auth/scopes.ts` | Implemented | 355 |
| JWT Middleware | `v3/src/adapters/a2a/auth/middleware.ts` | Implemented | 468 |
| Webhook Signatures | `v3/src/adapters/a2a/notifications/signature.ts` | Implemented | 321 |
| Discovery Service | `v3/src/adapters/a2a/discovery/discovery-service.ts` | Implemented | 744 |
| Task Manager | `v3/src/adapters/a2a/tasks/task-manager.ts` | Implemented | 773 |
| HTTP Server | `v3/src/mcp/http-server.ts` | Implemented | 858 |

### Missing Integration Points

| Integration | Status | Priority |
|-------------|--------|----------|
| OAuth routes in HTTP server | Not Wired | High |
| JWT middleware on protected routes | Not Wired | High |
| Push notification routes | Not Wired | High |
| Webhook delivery on task events | Not Wired | High |
| Hot reload for discovery | Not Wired | Medium |
| Health checker integration | Not Wired | Medium |

---

## Integration Architecture

```
+-------------------------------------------------------------------+
|                    A2A IMPROVEMENTS INTEGRATION                    |
+-------------------------------------------------------------------+
|                                                                    |
|  +------------------+     +------------------+     +--------------+|
|  | OAuth 2.0 Layer  |     | HTTP Server      |     | Discovery    ||
|  +------------------+     +------------------+     +--------------+|
|  | - Token Store    |---->| - OAuth Routes   |     | - Hot Reload ||
|  | - OAuth Provider |     | - Auth Middleware|     | - File Watch ||
|  | - JWT Verifier   |     | - Scope Checks   |     | - Health Chk ||
|  +------------------+     +--------+---------+     +--------------+|
|                                    |                               |
|                           +--------v---------+                     |
|                           | Task Manager     |                     |
|                           +------------------+                     |
|                           | - Event Emitter  |                     |
|                           | - State Machine  |                     |
|                           +--------+---------+                     |
|                                    |                               |
|                           +--------v---------+                     |
|                           | Notifications    |                     |
|                           +------------------+                     |
|                           | - Webhook Service|                     |
|                           | - Subscription   |                     |
|                           | - Signature      |                     |
|                           +------------------+                     |
|                                                                    |
+-------------------------------------------------------------------+
```

---

## File-by-File Integration Guide

### File: `v3/src/mcp/http-server.ts`

#### OAuth Routes Integration

```typescript
// ADD: Import OAuth modules
import {
  createJWTMiddleware,
  requireScopes,
  optionalAuth,
  type JWTVerifier,
  type JWTMiddlewareOptions,
} from '../adapters/a2a/auth/middleware.js';

import {
  A2A_SCOPES,
  validateScopes,
} from '../adapters/a2a/auth/scopes.js';
```

**Changes Required:**

1. Add `jwtVerifier` to `HTTPServerConfig`:
```typescript
export interface HTTPServerConfig {
  // ... existing fields

  /** JWT verifier for OAuth 2.0 authentication */
  jwtVerifier?: JWTVerifier;
  /** OAuth configuration */
  oauthConfig?: {
    issuer?: string;
    audience?: string;
    clockTolerance?: number;
  };
  /** Enable OAuth protection on A2A routes */
  enableOAuth?: boolean;
}
```

2. Create authentication middleware in constructor:
```typescript
// In constructor
if (config.jwtVerifier && config.enableOAuth !== false) {
  this.authMiddleware = createJWTMiddleware({
    verifier: config.jwtVerifier,
    optional: false,
    issuer: config.oauthConfig?.issuer,
    audience: config.oauthConfig?.audience,
    clockTolerance: config.oauthConfig?.clockTolerance ?? 0,
  });

  this.optionalAuthMiddleware = createJWTMiddleware({
    verifier: config.jwtVerifier,
    optional: true,
    issuer: config.oauthConfig?.issuer,
    audience: config.oauthConfig?.audience,
  });
}
```

3. Apply middleware to routes in `setupRoutes()`:
```typescript
private setupRoutes(): void {
  // ... existing discovery routes

  // Protected A2A Task routes
  this.router.add('POST', '/a2a/tasks', this.withAuth(
    this.handleTaskSubmit.bind(this),
    'task:create'
  ));

  this.router.add('GET', '/a2a/tasks/:taskId', this.withAuth(
    this.handleTaskGet.bind(this),
    'task:read'
  ));

  this.router.add('POST', '/a2a/tasks/:taskId/cancel', this.withAuth(
    this.handleTaskCancel.bind(this),
    'task:cancel'
  ));

  // Extended card (requires authentication)
  this.router.add('GET', '/a2a/:agentId/card', this.withAuth(
    this.handleExtendedCard.bind(this),
    'agent:extended'
  ));
}

// Helper method for auth
private withAuth(
  handler: RouteHandler,
  ...scopes: string[]
): RouteHandler {
  return async (req, res) => {
    if (this.authMiddleware) {
      await this.applyMiddleware(req, res, this.authMiddleware);
      if (res.writableEnded) return;

      if (scopes.length > 0) {
        this.applyScopeCheck(req, res, scopes);
        if (res.writableEnded) return;
      }
    }
    await handler(req, res);
  };
}
```

---

#### Push Notification Routes Integration

```typescript
// ADD: Import notification modules
import {
  generateSignatureHeader,
  verifySignature,
  SIGNATURE_HEADER,
} from '../adapters/a2a/notifications/signature.js';
```

**New Routes Required:**

```typescript
// In setupRoutes()

// Push notification subscription management
this.router.add('POST', '/a2a/tasks/:taskId/pushNotification',
  this.withAuth(this.handlePushNotificationSet.bind(this), 'notification:manage'));

this.router.add('GET', '/a2a/tasks/:taskId/pushNotification',
  this.withAuth(this.handlePushNotificationGet.bind(this), 'task:read'));

this.router.add('DELETE', '/a2a/tasks/:taskId/pushNotification',
  this.withAuth(this.handlePushNotificationDelete.bind(this), 'notification:manage'));
```

**Handler Implementations:**

```typescript
private async handlePushNotificationSet(
  req: IncomingMessage & { params?: Record<string, string> },
  res: ServerResponse
): Promise<void> {
  try {
    const taskId = req.params?.taskId;
    if (!taskId) {
      this.sendError(res, 400, 'Missing task ID');
      return;
    }

    const body = await this.parseBody(req);
    const { url, token, events } = body as {
      url: string;
      token?: string;
      events?: string[];
    };

    if (!url) {
      this.sendError(res, 400, 'Missing required field: url');
      return;
    }

    // Validate URL
    try {
      new URL(url);
    } catch {
      this.sendError(res, 400, 'Invalid webhook URL');
      return;
    }

    // Store subscription
    await this.webhookService.subscribe(taskId, {
      url,
      secret: token,
      events: events ?? ['stateChange', 'artifactAdded'],
    });

    this.setCorsHeaders(res);
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = 200;
    res.end(JSON.stringify({ success: true }));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to set push notification';
    this.sendError(res, 500, message);
  }
}

private async handlePushNotificationGet(
  req: IncomingMessage & { params?: Record<string, string> },
  res: ServerResponse
): Promise<void> {
  try {
    const taskId = req.params?.taskId;
    if (!taskId) {
      this.sendError(res, 400, 'Missing task ID');
      return;
    }

    const subscription = await this.webhookService.getSubscription(taskId);
    if (!subscription) {
      this.sendError(res, 404, 'No push notification configured for this task');
      return;
    }

    this.setCorsHeaders(res);
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      url: subscription.url,
      events: subscription.events,
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get push notification';
    this.sendError(res, 500, message);
  }
}

private async handlePushNotificationDelete(
  req: IncomingMessage & { params?: Record<string, string> },
  res: ServerResponse
): Promise<void> {
  try {
    const taskId = req.params?.taskId;
    if (!taskId) {
      this.sendError(res, 400, 'Missing task ID');
      return;
    }

    await this.webhookService.unsubscribe(taskId);

    this.setCorsHeaders(res);
    res.statusCode = 204;
    res.end();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete push notification';
    this.sendError(res, 500, message);
  }
}
```

---

#### Discovery Integration with Hot Reload

```typescript
// In constructor, after discoveryService initialization

if (config.enableHotReload !== false) {
  this.hotReloadService = createHotReloadService({
    generator: agentCardGenerator,
    discovery: this.discoveryService,
    watchPaths: [this.agentMarkdownDir],
    debounceMs: config.hotReloadDebounceMs ?? 1000,
  });
}
```

**Start method changes:**

```typescript
async start(port: number): Promise<void> {
  // ... existing code

  // Start hot reload watcher
  if (this.hotReloadService) {
    await this.hotReloadService.start();
    console.error('[AQE] Hot reload enabled for agent cards');
  }
}
```

---

### File: `v3/src/adapters/a2a/index.ts`

**Export Updates Required:**

```typescript
// ============================================================================
// OAuth 2.0 Authentication (ADR-054 Improvements)
// ============================================================================

export {
  // Scopes
  A2A_CORE_SCOPES,
  A2A_DOMAIN_SCOPES,
  A2A_SCOPES,
  type A2ACoreScope,
  type A2ADomainScope,
  type A2AScope,

  // Scope Utilities
  getScopeDescription,
  isValidScope,
  scopeHierarchy,
  expandScopes,
  validateScopes,
  getMissingScopes,
  normalizeScopes,
  parseScopeString,
  formatScopeString,
  getScopesByCategory,
  getQEDomainScopes,
  getCoreScopes,
  DEFAULT_CLIENT_SCOPES,
  ADMIN_SCOPES,
} from './auth/scopes.js';

export {
  // JWT Middleware
  createJWTMiddleware,
  jwtAuthMiddleware,
  requireScopes,
  optionalAuth,
  mockAuthMiddleware,

  // Token Utilities
  extractBearerToken,
  parseScopes,
  hasScope,
  hasAnyScope,
  hasAllScopes,

  // OAuth Error Utilities
  createOAuthError,

  // Types
  type TokenClaims,
  type JWTVerifier,
  type JWTAuthenticatedRequest,
  type JWTMiddlewareOptions,
  type ScopeOptions,
  type OAuthErrorType,
  type OAuthError,
} from './auth/middleware.js';

// ============================================================================
// Push Notifications (ADR-054 Improvements)
// ============================================================================

export {
  // Signature Generation
  generateSignature,
  generateSignatureHeader,

  // Signature Verification
  parseSignatureHeader,
  verifySignature,
  isValidSignature,

  // Constants
  SIGNATURE_HEADER,
  SIGNATURE_VERSION,
  DEFAULT_MAX_AGE_MS,
  MIN_TIMESTAMP,

  // Types
  type ParsedSignature,
  type VerificationResult,
} from './notifications/signature.js';
```

---

### File: `v3/src/adapters/a2a/tasks/task-manager.ts`

**Event Integration with Webhook Service:**

```typescript
// ADD: Import webhook service types
import type { WebhookService, TaskWebhookPayload } from '../notifications/webhook-service.js';

export interface TaskManagerConfig {
  // ... existing fields

  /** Webhook service for push notifications */
  webhookService?: WebhookService;
}
```

**Wire webhook delivery in state transitions:**

```typescript
// In transition() method, after emitting events

// Trigger webhook delivery if configured
if (this.config.webhookService) {
  const payload: TaskWebhookPayload = {
    event: 'task.stateChange',
    taskId,
    task: updatedTask,
    previousStatus: currentStatus,
    newStatus,
    timestamp: now.toISOString(),
  };

  // Fire and forget - don't block on webhook delivery
  this.config.webhookService.deliver(taskId, payload).catch((err) => {
    // Log but don't fail the transition
    console.error(`[TaskManager] Webhook delivery failed for task ${taskId}:`, err);
  });
}
```

**Wire artifact webhook in addArtifact():**

```typescript
// In addArtifact() method, after emitting event

if (this.config.webhookService) {
  const payload: TaskWebhookPayload = {
    event: 'task.artifactAdded',
    taskId,
    artifact,
    isUpdate,
    timestamp: now.toISOString(),
  };

  this.config.webhookService.deliver(taskId, payload).catch((err) => {
    console.error(`[TaskManager] Artifact webhook delivery failed for task ${taskId}:`, err);
  });
}
```

---

## Interface Contracts

### OAuth Integration Contract

```typescript
/**
 * OAuth integration interface for HTTP Server
 */
export interface OAuthIntegration {
  /** JWT verification middleware */
  readonly middleware: {
    /** Require valid JWT */
    jwt: (req: HttpRequest, res: HttpResponse, next?: NextFunction) => Promise<void>;
    /** Optional JWT (allows unauthenticated) */
    optionalJwt: (req: HttpRequest, res: HttpResponse, next?: NextFunction) => Promise<void>;
    /** Require specific scopes */
    scopes: (...requiredScopes: string[]) => (req: HttpRequest, res: HttpResponse, next?: NextFunction) => void;
  };

  /** Validate scopes against granted permissions */
  validateScopes(requested: string[], granted: string[]): boolean;

  /** Expand scope hierarchy */
  expandScopes(scopes: string[]): string[];
}

/**
 * Factory function signature
 */
export function createOAuthIntegration(
  verifier: JWTVerifier,
  options?: {
    issuer?: string;
    audience?: string;
    clockTolerance?: number;
  }
): OAuthIntegration;
```

### Notification Integration Contract

```typescript
/**
 * Notification integration interface for Task Manager
 */
export interface NotificationIntegration {
  /**
   * Called when task state changes
   * @returns Promise that resolves when webhook is queued (not delivered)
   */
  onTaskStateChange(
    taskId: string,
    from: TaskStatus,
    to: TaskStatus,
    task: A2ATask
  ): Promise<void>;

  /**
   * Called when artifact is added to task
   */
  onArtifactCreated(
    taskId: string,
    artifact: A2AArtifact,
    isUpdate: boolean
  ): Promise<void>;

  /**
   * Called when task encounters an error
   */
  onTaskError(
    taskId: string,
    error: TaskError
  ): Promise<void>;
}

/**
 * Webhook subscription configuration
 */
export interface WebhookSubscription {
  /** Webhook endpoint URL */
  readonly url: string;
  /** Shared secret for signature generation */
  readonly secret?: string;
  /** Events to subscribe to */
  readonly events: ('stateChange' | 'artifactAdded' | 'error')[];
  /** Retry configuration */
  readonly retry?: {
    maxAttempts: number;
    backoffMs: number;
  };
}

/**
 * Factory function signature
 */
export function createNotificationIntegration(
  subscriptionStore: WebhookSubscriptionStore
): NotificationIntegration;
```

### Discovery Integration Contract

```typescript
/**
 * Discovery integration interface for HTTP Server
 */
export interface DiscoveryIntegration {
  /** Hot reload service for live agent card updates */
  readonly hotReload: HotReloadService;

  /** Health checker for agent availability */
  readonly healthChecker: AgentHealthChecker;

  /** Metrics collector for discovery endpoints */
  readonly metrics: MetricsCollector;
}

/**
 * Hot reload service interface
 */
export interface HotReloadService {
  /** Start watching for changes */
  start(): Promise<void>;

  /** Stop watching */
  stop(): Promise<void>;

  /** Check if watching is active */
  isActive(): boolean;

  /** Get reload statistics */
  getStats(): {
    reloadCount: number;
    lastReloadAt: Date | null;
    watchedPaths: string[];
  };

  /** Force immediate reload */
  forceReload(): Promise<void>;
}

/**
 * Agent health checker interface
 */
export interface AgentHealthChecker {
  /** Check health of a specific agent */
  checkAgent(agentId: string): Promise<HealthStatus>;

  /** Get health of all agents */
  checkAll(): Promise<Map<string, HealthStatus>>;

  /** Subscribe to health changes */
  onHealthChange(callback: (agentId: string, status: HealthStatus) => void): () => void;
}

export interface HealthStatus {
  readonly healthy: boolean;
  readonly lastCheck: Date;
  readonly latencyMs?: number;
  readonly error?: string;
}
```

---

## Dependency Injection Pattern

### Correct Pattern (Follow This)

```typescript
/**
 * Create a fully-wired A2A server with all improvements
 */
export function createA2AServer(config: A2AServerConfig): HTTPServer {
  // ========================================
  // 1. Create base dependencies (no cross-deps)
  // ========================================

  const tokenStore = new TokenStore();
  const subscriptionStore = new WebhookSubscriptionStore();

  // ========================================
  // 2. Create services with dependencies injected
  // ========================================

  // OAuth Provider - requires token store
  const oauthProvider = new OAuth2Provider({
    ...config.oauth,
    tokenStore,  // Injected
  });

  // JWT Verifier - requires OAuth provider
  const jwtVerifier = createJWTVerifier({
    publicKeyUrl: config.oauth.publicKeyUrl,
    issuer: config.oauth.issuer,
  });

  // Webhook Service - requires subscription store
  const webhookService = new WebhookService({
    subscriptionStore,  // Injected
    signatureSecret: config.notifications?.signatureSecret,
    retryConfig: config.notifications?.retry,
  });

  // ========================================
  // 3. Create core services
  // ========================================

  // Agent Card Generator
  const agentCardGenerator = createAgentCardGenerator({
    baseUrl: config.baseUrl,
  });

  // Discovery Service - requires generator
  const discoveryService = createDiscoveryService({
    generator: agentCardGenerator,  // Injected
    baseUrl: config.baseUrl,
  });

  // Task Manager - requires webhook service for notifications
  const taskManager = createTaskManager({
    webhookService,  // Injected - enables push notifications
    storeConfig: config.taskStore,
  });

  // ========================================
  // 4. Create optional services
  // ========================================

  // File watcher for hot reload
  const fileWatcher = config.enableHotReload
    ? new AgentFileWatcher(config.agentPaths)
    : undefined;

  // Hot reload service - requires generator, discovery, watcher
  const hotReloadService = fileWatcher
    ? new HotReloadService({
        generator: agentCardGenerator,  // Injected
        discovery: discoveryService,     // Injected
        fileWatcher,                     // Injected
      })
    : undefined;

  // Health checker
  const healthChecker = new AgentHealthChecker({
    taskManager,       // Injected
    discoveryService,  // Injected
  });

  // ========================================
  // 5. Create HTTP Server with all dependencies
  // ========================================

  return createHTTPServer({
    // Core dependencies
    agentCardGenerator,
    discoveryService,
    taskManager,

    // OAuth dependencies
    jwtVerifier,
    oauthConfig: {
      issuer: config.oauth.issuer,
      audience: config.oauth.audience,
    },
    enableOAuth: config.oauth.enabled !== false,

    // Notification dependencies
    webhookService,

    // Discovery dependencies
    hotReloadService,
    healthChecker,

    // Other config
    enableCors: config.enableCors,
    enableWebSocket: config.enableWebSocket,
    agentMarkdownDir: config.agentMarkdownDir,
  });
}
```

### Anti-Pattern (Avoid This)

```typescript
// BAD: Creating dependencies internally
export function createA2AServer(config: A2AServerConfig): HTTPServer {
  // WRONG: Factory creates its own dependencies
  const tokenStore = new TokenStore();  // Not configurable!

  // WRONG: Optional integration with fallback
  const webhookService = config.notifications?.enabled
    ? new WebhookService(config.notifications)
    : new NoOpWebhookService();  // Silent failure!

  // WRONG: Dependencies not exposed for testing
  const taskManager = createTaskManager({
    // webhookService not injected
  });

  // Test code cannot mock these dependencies!
}
```

---

## Code Review Checklist

### General Quality

- [ ] Consistent error handling (use A2A error codes)
- [ ] Proper TypeScript types (no `any`)
- [ ] JSDoc comments on all public APIs
- [ ] No hardcoded values (use constants/config)
- [ ] Dependency injection ready (accept deps via constructor/config)
- [ ] Testable (mockable dependencies)

### OAuth 2.0 Implementation

- [ ] JWT verification uses timing-safe comparison
- [ ] Token expiration properly validated
- [ ] Scope hierarchy correctly expanded
- [ ] WWW-Authenticate header on 401 responses
- [ ] Clock tolerance configurable
- [ ] Token claims properly typed

### Push Notifications Implementation

- [ ] HMAC-SHA256 signatures use timing-safe comparison
- [ ] Timestamp validation prevents replay attacks
- [ ] Webhook delivery is non-blocking (fire and forget)
- [ ] Retry logic with exponential backoff
- [ ] Subscription storage is durable
- [ ] Secret rotation supported

### Discovery Implementation

- [ ] File watcher properly debounced
- [ ] Cache invalidation on reload
- [ ] ETag generation consistent
- [ ] Health checks non-blocking
- [ ] Graceful shutdown supported

### HTTP Server Integration

- [ ] All routes properly documented
- [ ] CORS headers applied consistently
- [ ] Request body size limits enforced
- [ ] Error responses follow A2A format
- [ ] Middleware chain order correct

---

## Testing Strategy

### Unit Tests Required

```typescript
// OAuth Tests
describe('OAuth 2.0 Integration', () => {
  describe('JWT Middleware', () => {
    it('should reject requests without Authorization header');
    it('should reject expired tokens');
    it('should reject tokens from wrong issuer');
    it('should attach claims to request on success');
    it('should allow requests when optional=true and no token');
  });

  describe('Scope Validation', () => {
    it('should expand scope hierarchy');
    it('should validate required scopes');
    it('should return missing scopes');
  });
});

// Notification Tests
describe('Push Notifications', () => {
  describe('Signature Generation', () => {
    it('should generate valid HMAC-SHA256 signatures');
    it('should include timestamp in signature');
    it('should reject invalid timestamps');
  });

  describe('Webhook Delivery', () => {
    it('should deliver to subscribed endpoints');
    it('should include X-A2A-Signature header');
    it('should retry on failure');
    it('should not block task transitions');
  });
});

// Discovery Tests
describe('Discovery Integration', () => {
  describe('Hot Reload', () => {
    it('should detect file changes');
    it('should debounce rapid changes');
    it('should update discovery service');
    it('should invalidate cache on reload');
  });
});
```

### Integration Tests Required

```typescript
describe('A2A Improvements Integration', () => {
  let server: HTTPServer;
  let mockJwtVerifier: JWTVerifier;

  beforeEach(async () => {
    mockJwtVerifier = createMockJwtVerifier();
    server = createA2AServer({
      oauth: { enabled: true },
      notifications: { enabled: true },
      enableHotReload: true,
    });
    await server.start(0);
  });

  it('should require auth on protected endpoints', async () => {
    const response = await fetch(`${baseUrl}/a2a/tasks`, { method: 'POST' });
    expect(response.status).toBe(401);
  });

  it('should accept valid JWT on protected endpoints', async () => {
    const response = await fetch(`${baseUrl}/a2a/tasks`, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer valid-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: { role: 'user', parts: [] } }),
    });
    expect(response.status).toBe(201);
  });

  it('should deliver webhooks on task state change', async () => {
    // Subscribe to notifications
    await fetch(`${baseUrl}/a2a/tasks/${taskId}/pushNotification`, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer valid-token' },
      body: JSON.stringify({ url: 'http://webhook.test/callback' }),
    });

    // Trigger state change
    taskManager.startTask(taskId);

    // Verify webhook was called
    expect(mockWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'task.stateChange',
        newStatus: 'working',
      })
    );
  });
});
```

---

## Migration Path

### Phase 1: OAuth 2.0 (Week 1)

1. Create `auth/index.ts` barrel export
2. Add JWT verifier to HTTP server config
3. Apply middleware to protected routes
4. Update tests to use mock JWT verifier
5. Document OAuth configuration

### Phase 2: Push Notifications (Week 2)

1. Create `notifications/webhook-service.ts`
2. Create `notifications/subscription-store.ts`
3. Wire webhook service to task manager
4. Add push notification routes
5. Integration tests for webhook delivery

### Phase 3: Discovery Enhancements (Week 3)

1. Create `discovery/hot-reload.ts`
2. Create `discovery/health-checker.ts`
3. Wire hot reload to HTTP server
4. Add health endpoints
5. Performance testing

### Phase 4: Integration Validation (Week 4)

1. End-to-end tests covering all improvements
2. Load testing with auth + notifications
3. Documentation update
4. ADR-054 update

---

## Appendix: File Locations

| New File | Purpose |
|----------|---------|
| `v3/src/adapters/a2a/auth/index.ts` | OAuth barrel exports |
| `v3/src/adapters/a2a/notifications/index.ts` | Notification barrel exports |
| `v3/src/adapters/a2a/notifications/webhook-service.ts` | Webhook delivery |
| `v3/src/adapters/a2a/notifications/subscription-store.ts` | Subscription persistence |
| `v3/src/adapters/a2a/discovery/hot-reload.ts` | Live agent card updates |
| `v3/src/adapters/a2a/discovery/health-checker.ts` | Agent health monitoring |

---

*Document generated by Code Reviewer Agent*
*Swarm ID: swarm-1769857761086*
