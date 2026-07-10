/**
 * A2A Discovery Route Handlers — Wiring Gap Tests
 *
 * `tests/unit/adapters/a2a/discovery.test.ts` already covers the standalone
 * `createPlatformCardHandler` / `createAgentCardHandler` factories and asserts
 * that `getDiscoveryRouteDefinitions()` returns a route table with the right
 * paths. It never *invokes* the handlers wired into that route table, so the
 * conditional-GET (ETag/304), extended-card auth gate, search query mapping,
 * alias route, and CORS OPTIONS behavior were previously unexercised.
 *
 * @module tests/unit/adapters/a2a/discovery/routes
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  getDiscoveryRouteDefinitions,
  createExtendedCardHandler,
  type HttpRequest,
  type HttpResponse,
  type AuthenticatedRequest,
  type RouteDefinition,
} from '../../../../../src/adapters/a2a/discovery/routes.js';
import type { DiscoveryService } from '../../../../../src/adapters/a2a/discovery/discovery-service.js';
import { createQEAgentCard, createAgentSkill } from '../../../../../src/adapters/a2a/agent-cards/schema.js';

// ============================================================================
// Test Helpers
// ============================================================================

function createMockRequest(overrides: Partial<AuthenticatedRequest> = {}): AuthenticatedRequest {
  return {
    params: {},
    query: {},
    headers: {},
    header: vi.fn().mockReturnValue(undefined),
    ...overrides,
  } as AuthenticatedRequest;
}

function createMockResponse(): HttpResponse & {
  _status?: number;
  _json?: unknown;
  _ended?: boolean;
  _headers: Record<string, string | number>;
} {
  const res: any = {
    _headers: {},
    setHeader(name: string, value: string | number) {
      res._headers[name] = value;
    },
    status(code: number) {
      res._status = code;
      return res;
    },
    json(body: unknown) {
      res._json = body;
    },
    end() {
      res._ended = true;
    },
  };
  return res;
}

function createMockCard(agentId: string) {
  return createQEAgentCard(
    agentId,
    `Description for ${agentId}`,
    `https://example.com/a2a/${agentId}`,
    '3.0.0',
    [createAgentSkill(`${agentId}-skill`, 'Skill', 'A test skill')],
    { domain: 'test-generation' }
  );
}

function createMockDiscoveryService(overrides: Partial<DiscoveryService> = {}): DiscoveryService {
  return {
    getPlatformCardEtag: vi.fn().mockReturnValue('"platform-etag-1"'),
    getPlatformCard: vi.fn().mockResolvedValue({ name: 'platform', skills: [] }),
    getAgentCardEtag: vi.fn().mockReturnValue('"agent-etag-1"'),
    getAgentCard: vi.fn().mockResolvedValue(createMockCard('agent-1')),
    getExtendedAgentCard: vi.fn().mockResolvedValue(createMockCard('agent-1')),
    search: vi.fn().mockResolvedValue({ agents: [], total: 0, criteria: {} }),
    ...overrides,
  } as unknown as DiscoveryService;
}

function findRoute(routes: RouteDefinition[], method: RouteDefinition['method'], path: string): RouteDefinition {
  const route = routes.find((r) => r.method === method && r.path === path);
  if (!route) throw new Error(`Route not found: ${method} ${path}`);
  return route;
}

// ============================================================================
// GET /.well-known/agent.json (wired platform card handler)
// ============================================================================

describe('wired getPlatformCard handler', () => {
  it('returns 304 when If-None-Match matches the current ETag', async () => {
    const discoveryService = createMockDiscoveryService();
    const routes = getDiscoveryRouteDefinitions({ discoveryService });
    const handler = findRoute(routes, 'get', '/.well-known/agent.json').handlers[0];

    const req = createMockRequest({ header: vi.fn().mockReturnValue('"platform-etag-1"') });
    const res = createMockResponse();
    await handler(req, res);

    expect(res._status).toBe(304);
    expect(res._json).toBeUndefined();
  });

  it('returns 200 with the card when there is no matching ETag', async () => {
    const discoveryService = createMockDiscoveryService();
    const routes = getDiscoveryRouteDefinitions({ discoveryService });
    const handler = findRoute(routes, 'get', '/.well-known/agent.json').handlers[0];

    const req = createMockRequest();
    const res = createMockResponse();
    await handler(req, res);

    expect(res._json).toEqual({ name: 'platform', skills: [] });
    expect(res._headers['ETag']).toBe('"platform-etag-1"');
  });

  it('returns 500 when the service throws', async () => {
    const discoveryService = createMockDiscoveryService({
      getPlatformCard: vi.fn().mockRejectedValue(new Error('boom')),
    });
    const routes = getDiscoveryRouteDefinitions({ discoveryService });
    const handler = findRoute(routes, 'get', '/.well-known/agent.json').handlers[0];

    const req = createMockRequest();
    const res = createMockResponse();
    await handler(req, res);

    expect(res._status).toBe(500);
  });
});

// ============================================================================
// GET /a2a/:agentId/.well-known/agent.json (wired agent card handler)
// ============================================================================

describe('wired getAgentCard handler', () => {
  it('returns the standard card and sets a cache ETag for a non-extended request', async () => {
    const discoveryService = createMockDiscoveryService();
    const routes = getDiscoveryRouteDefinitions({ discoveryService });
    const handler = findRoute(routes, 'get', '/a2a/:agentId/.well-known/agent.json').handlers[1];

    const req = createMockRequest({ params: { agentId: 'agent-1' }, query: {} });
    const res = createMockResponse();
    await handler(req, res);

    expect(discoveryService.getAgentCard).toHaveBeenCalledWith('agent-1');
    expect(res._headers['ETag']).toBe('"agent-etag-1"');
  });

  it('returns 304 for a non-extended request whose ETag matches', async () => {
    const discoveryService = createMockDiscoveryService();
    const routes = getDiscoveryRouteDefinitions({ discoveryService });
    const handler = findRoute(routes, 'get', '/a2a/:agentId/.well-known/agent.json').handlers[1];

    const req = createMockRequest({
      params: { agentId: 'agent-1' },
      query: {},
      header: vi.fn().mockReturnValue('"agent-etag-1"'),
    });
    const res = createMockResponse();
    await handler(req, res);

    expect(res._status).toBe(304);
  });

  it('returns 401 when extended=true and no authenticated user is present', async () => {
    const discoveryService = createMockDiscoveryService();
    const routes = getDiscoveryRouteDefinitions({ discoveryService });
    const handler = findRoute(routes, 'get', '/a2a/:agentId/.well-known/agent.json').handlers[1];

    const req = createMockRequest({ params: { agentId: 'agent-1' }, query: { extended: 'true' } });
    const res = createMockResponse();
    await handler(req, res);

    expect(res._status).toBe(401);
    expect(discoveryService.getExtendedAgentCard).not.toHaveBeenCalled();
  });

  it('returns the extended card with private, short-lived cache headers when authenticated', async () => {
    const discoveryService = createMockDiscoveryService();
    const routes = getDiscoveryRouteDefinitions({ discoveryService });
    const handler = findRoute(routes, 'get', '/a2a/:agentId/.well-known/agent.json').handlers[1];

    const req = createMockRequest({
      params: { agentId: 'agent-1' },
      query: { extended: 'true' },
      user: { id: 'user-1', scopes: ['agent:extended'] },
    });
    const res = createMockResponse();
    await handler(req, res);

    expect(discoveryService.getExtendedAgentCard).toHaveBeenCalledWith('agent-1');
    expect(res._headers['Cache-Control']).toBe('private, max-age=60');
    expect(res._headers['ETag']).toBeUndefined();
  });

  it('returns 404 when the agent does not exist', async () => {
    const discoveryService = createMockDiscoveryService({
      getAgentCard: vi.fn().mockResolvedValue(null),
    });
    const routes = getDiscoveryRouteDefinitions({ discoveryService });
    const handler = findRoute(routes, 'get', '/a2a/:agentId/.well-known/agent.json').handlers[1];

    const req = createMockRequest({ params: { agentId: 'missing-agent' }, query: {} });
    const res = createMockResponse();
    await handler(req, res);

    expect(res._status).toBe(404);
    expect((res._json as any).error.data.agentId).toBe('missing-agent');
  });

  it('returns 500 when the service throws', async () => {
    const discoveryService = createMockDiscoveryService({
      getAgentCard: vi.fn().mockRejectedValue(new Error('boom')),
    });
    const routes = getDiscoveryRouteDefinitions({ discoveryService });
    const handler = findRoute(routes, 'get', '/a2a/:agentId/.well-known/agent.json').handlers[1];

    const req = createMockRequest({ params: { agentId: 'agent-1' }, query: {} });
    const res = createMockResponse();
    await handler(req, res);

    expect(res._status).toBe(500);
  });
});

// ============================================================================
// GET /a2a/agents (search) and GET /a2a/agents/:agentId (alias)
// ============================================================================

describe('wired searchAgents handler', () => {
  it('maps query params into search criteria, including a parsed limit', async () => {
    const discoveryService = createMockDiscoveryService();
    const routes = getDiscoveryRouteDefinitions({ discoveryService });
    const handler = findRoute(routes, 'get', '/a2a/agents').handlers[0];

    const req = createMockRequest({
      query: { skill: 'test-gen', tag: 'qe', domain: 'test-generation', streaming: 'true', limit: '5' },
    });
    const res = createMockResponse();
    await handler(req, res);

    expect(discoveryService.search).toHaveBeenCalledWith(
      expect.objectContaining({ skill: 'test-gen', tag: 'qe', domain: 'test-generation', streaming: true, limit: 5 })
    );
  });

  it('returns a slimmed-down agent list with total/criteria', async () => {
    const discoveryService = createMockDiscoveryService({
      search: vi.fn().mockResolvedValue({
        agents: [createMockCard('agent-1')],
        total: 1,
        criteria: { tag: 'qe' },
      }),
    });
    const routes = getDiscoveryRouteDefinitions({ discoveryService });
    const handler = findRoute(routes, 'get', '/a2a/agents').handlers[0];

    const req = createMockRequest({ query: { tag: 'qe' } });
    const res = createMockResponse();
    await handler(req, res);

    expect(res._json).toMatchObject({ total: 1, criteria: { tag: 'qe' } });
    expect((res._json as any).agents[0]).toHaveProperty('skills');
  });

  it('returns 500 when the service throws', async () => {
    const discoveryService = createMockDiscoveryService({
      search: vi.fn().mockRejectedValue(new Error('boom')),
    });
    const routes = getDiscoveryRouteDefinitions({ discoveryService });
    const handler = findRoute(routes, 'get', '/a2a/agents').handlers[0];

    const req = createMockRequest({ query: {} });
    const res = createMockResponse();
    await handler(req, res);

    expect(res._status).toBe(500);
  });
});

describe('wired getAgentCardAlias handler', () => {
  it('behaves identically to the primary agent card route', async () => {
    const discoveryService = createMockDiscoveryService();
    const routes = getDiscoveryRouteDefinitions({ discoveryService });
    const handler = findRoute(routes, 'get', '/a2a/agents/:agentId').handlers[1];

    const req = createMockRequest({ params: { agentId: 'agent-1' }, query: {} });
    const res = createMockResponse();
    await handler(req, res);

    expect(discoveryService.getAgentCard).toHaveBeenCalledWith('agent-1');
    expect(res._json).toBeDefined();
  });
});

// ============================================================================
// Conditional auth gating
// ============================================================================

describe('conditional auth middleware', () => {
  it('skips the auth middleware when extended is not requested', async () => {
    const discoveryService = createMockDiscoveryService();
    const authMiddleware = vi.fn((_req, _res, next) => next && next());
    const routes = getDiscoveryRouteDefinitions({ discoveryService, authMiddleware });
    const conditionalAuth = findRoute(routes, 'get', '/a2a/:agentId/.well-known/agent.json').handlers[0];

    const req = createMockRequest({ params: { agentId: 'agent-1' }, query: {} });
    const res = createMockResponse();
    const next = vi.fn();
    conditionalAuth(req, res, next);

    expect(authMiddleware).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('invokes the auth middleware when extended=true', async () => {
    const discoveryService = createMockDiscoveryService();
    const authMiddleware = vi.fn((_req, _res, next) => next && next());
    const routes = getDiscoveryRouteDefinitions({ discoveryService, authMiddleware });
    const conditionalAuth = findRoute(routes, 'get', '/a2a/:agentId/.well-known/agent.json').handlers[0];

    const req = createMockRequest({ params: { agentId: 'agent-1' }, query: { extended: 'true' } });
    const res = createMockResponse();
    const next = vi.fn();
    conditionalAuth(req, res, next);

    expect(authMiddleware).toHaveBeenCalledWith(req, res, next);
  });
});

// ============================================================================
// CORS OPTIONS handler
// ============================================================================

describe('wired handleOptions handler', () => {
  it('sets CORS headers and returns 204 by default', () => {
    const discoveryService = createMockDiscoveryService();
    const routes = getDiscoveryRouteDefinitions({ discoveryService });
    const handler = findRoute(routes, 'options', '/a2a/agents').handlers[0];

    const req = createMockRequest();
    const res = createMockResponse();
    handler(req, res);

    expect(res._status).toBe(204);
    expect(res._headers['Access-Control-Allow-Origin']).toBe('*');
    expect(res._headers['Access-Control-Max-Age']).toBe('86400');
  });

  it('omits CORS headers when enableCors is false', () => {
    const discoveryService = createMockDiscoveryService();
    const routes = getDiscoveryRouteDefinitions({ discoveryService, enableCors: false });
    const handler = findRoute(routes, 'options', '/a2a/agents').handlers[0];

    const req = createMockRequest();
    const res = createMockResponse();
    handler(req, res);

    expect(res._status).toBe(204);
    expect(res._headers['Access-Control-Allow-Origin']).toBeUndefined();
  });
});

// ============================================================================
// createExtendedCardHandler (standalone factory)
// ============================================================================

describe('createExtendedCardHandler', () => {
  it('returns [authMiddleware, handler] and 401s when auth sets no user', async () => {
    const discoveryService = createMockDiscoveryService();
    const authMiddleware = vi.fn((_req, _res, next) => next && next());
    const [, handler] = createExtendedCardHandler(discoveryService, authMiddleware);

    const req = createMockRequest({ params: { agentId: 'agent-1' } });
    const res = createMockResponse();
    await handler(req, res);

    expect(res._status).toBe(401);
  });

  it('returns the extended card when the request is authenticated', async () => {
    const discoveryService = createMockDiscoveryService();
    const authMiddleware = vi.fn((_req, _res, next) => next && next());
    const [, handler] = createExtendedCardHandler(discoveryService, authMiddleware);

    const req = createMockRequest({ params: { agentId: 'agent-1' }, user: { id: 'u1' } });
    const res = createMockResponse();
    await handler(req, res);

    expect(res._status).toBeUndefined(); // no explicit status(200) call before json — verifies default success path
    expect(res._json).toBeDefined();
  });

  it('returns 404 when the authenticated agent does not exist', async () => {
    const discoveryService = createMockDiscoveryService({
      getExtendedAgentCard: vi.fn().mockResolvedValue(null),
    });
    const authMiddleware = vi.fn((_req, _res, next) => next && next());
    const [, handler] = createExtendedCardHandler(discoveryService, authMiddleware);

    const req = createMockRequest({ params: { agentId: 'missing' }, user: { id: 'u1' } });
    const res = createMockResponse();
    await handler(req, res);

    expect(res._status).toBe(404);
  });

  it('returns 500 when the service throws', async () => {
    const discoveryService = createMockDiscoveryService({
      getExtendedAgentCard: vi.fn().mockRejectedValue(new Error('boom')),
    });
    const authMiddleware = vi.fn((_req, _res, next) => next && next());
    const [, handler] = createExtendedCardHandler(discoveryService, authMiddleware);

    const req = createMockRequest({ params: { agentId: 'agent-1' }, user: { id: 'u1' } });
    const res = createMockResponse();
    await handler(req, res);

    expect(res._status).toBe(500);
  });
});
