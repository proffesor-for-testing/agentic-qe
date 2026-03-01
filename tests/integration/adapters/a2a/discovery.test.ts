/**
 * A2A Discovery Service Integration Tests
 *
 * Tests the discovery service with complete route handler flows.
 * Uses mock HTTP request/response objects that are Express-compatible.
 * Target: 15+ integration tests covering real handler flows.
 *
 * NOTE: These tests use mock request/response objects instead of actual HTTP
 * requests to avoid requiring Express as a dependency. The route handlers
 * are tested with the same interface they would receive from Express.
 *
 * @module tests/integration/adapters/a2a/discovery
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';

import {
  // Discovery Service
  DiscoveryService,
  createDiscoveryService,
  getDiscoveryRouteDefinitions,
  AuthenticatedRequest,
  HttpRequest,
  HttpResponse,
  RouteDefinition,

  // Agent Cards
  QEAgentCard,
  createAgentCardGenerator,
  createAgentSkill,
  DEFAULT_QE_PROVIDER,
  DEFAULT_INPUT_MODES,
  DEFAULT_OUTPUT_MODES,
} from '../../../../src/adapters/a2a/index.js';

// ============================================================================
// Mock HTTP Request/Response
// ============================================================================

/**
 * Create a mock HTTP request
 */
function createMockRequest(options: {
  params?: Record<string, string>;
  query?: Record<string, string | string[] | undefined>;
  headers?: Record<string, string | string[] | undefined>;
  user?: { id: string; scopes?: string[] };
}): HttpRequest & { user?: { id: string; scopes?: string[] } } {
  const { params = {}, query = {}, headers = {}, user } = options;
  return {
    params,
    query,
    headers,
    header: (name: string) => {
      const value = headers[name.toLowerCase()];
      return Array.isArray(value) ? value[0] : value;
    },
    user,
  };
}

/**
 * Mock response that captures the response data
 */
interface MockResponseData {
  statusCode: number;
  body: unknown;
  headers: Record<string, string | number>;
  ended: boolean;
}

function createMockResponse(): HttpResponse & { _getData: () => MockResponseData } {
  const data: MockResponseData = {
    statusCode: 200,
    body: null,
    headers: {},
    ended: false,
  };

  const res: HttpResponse & { _getData: () => MockResponseData } = {
    status(code: number) {
      data.statusCode = code;
      return this;
    },
    json(body: unknown) {
      data.body = body;
    },
    setHeader(name: string, value: string | number) {
      data.headers[name] = value;
    },
    end() {
      data.ended = true;
    },
    _getData: () => data,
  };

  return res;
}

// ============================================================================
// Test Setup
// ============================================================================

/**
 * Create a test agent card
 */
const createTestAgentCard = (id: string, options: Partial<QEAgentCard> = {}): QEAgentCard => ({
  name: id,
  description: `Test agent ${id} for integration testing`,
  url: `https://example.com/a2a/${id}`,
  version: '3.0.0',
  capabilities: {
    streaming: true,
    pushNotifications: false,
    stateTransitionHistory: true,
    ...options.capabilities,
  },
  skills: options.skills ?? [
    {
      id: `${id}-primary`,
      name: `${id} Primary Skill`,
      description: `Primary skill for ${id}`,
      tags: ['testing', 'integration'],
    },
  ],
  provider: DEFAULT_QE_PROVIDER,
  defaultInputModes: DEFAULT_INPUT_MODES,
  defaultOutputModes: DEFAULT_OUTPUT_MODES,
  qeMetadata: options.qeMetadata ?? {
    domain: 'test-generation',
    memoryReads: ['aqe/test/*'],
    memoryWrites: ['aqe/results/*'],
  },
  ...options,
});

/**
 * Test service setup
 */
class TestServiceSetup {
  public readonly discoveryService: DiscoveryService;
  public readonly routes: RouteDefinition[];

  constructor() {
    const generator = createAgentCardGenerator({
      baseUrl: 'http://localhost:3000',
    });

    this.discoveryService = createDiscoveryService({
      generator,
      baseUrl: 'http://localhost:3000',
      cacheTtl: 60000, // 1 minute for tests
      enableMetrics: true,
    });

    // Register test agents
    const cards = new Map<string, QEAgentCard>();
    cards.set('qe-test-architect', createTestAgentCard('qe-test-architect', {
      skills: [
        createAgentSkill('test-generation', 'Test Generation', 'Generate tests', {
          tags: ['testing', 'ai', 'tdd'],
        }),
        createAgentSkill('property-testing', 'Property Testing', 'Property-based tests', {
          tags: ['testing', 'property-based'],
        }),
      ],
      qeMetadata: { domain: 'test-generation' },
    }));

    cards.set('qe-coverage-specialist', createTestAgentCard('qe-coverage-specialist', {
      capabilities: { streaming: true, pushNotifications: true, stateTransitionHistory: true },
      skills: [
        createAgentSkill('coverage-analysis', 'Coverage Analysis', 'Analyze coverage', {
          tags: ['coverage', 'analysis'],
        }),
      ],
      qeMetadata: { domain: 'coverage-analysis' },
    }));

    cards.set('qe-security-scanner', createTestAgentCard('qe-security-scanner', {
      capabilities: { streaming: false, pushNotifications: false, stateTransitionHistory: true },
      skills: [
        createAgentSkill('security-scan', 'Security Scan', 'OWASP scanning', {
          tags: ['security', 'owasp', 'vulnerability'],
        }),
      ],
      qeMetadata: { domain: 'security-compliance' },
    }));

    this.discoveryService.registerCards(cards);

    // Create mock auth middleware
    const mockAuthMiddleware = (
      req: HttpRequest,
      res: HttpResponse,
      next?: () => void
    ): void => {
      const authHeader = req.header('Authorization');

      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.slice(7);
        if (token === 'valid-test-token') {
          (req as AuthenticatedRequest).user = {
            id: 'test-user',
            scopes: ['agent:read', 'agent:extended'],
          };
        }
      }

      if (next) next();
    };

    // Get route definitions
    this.routes = getDiscoveryRouteDefinitions({
      discoveryService: this.discoveryService,
      authMiddleware: mockAuthMiddleware,
    });
  }

  /**
   * Find and execute a route handler
   */
  async executeRoute(
    method: 'get' | 'post' | 'options',
    path: string,
    req: HttpRequest,
    res: HttpResponse
  ): Promise<void> {
    // Find matching route
    const route = this.routes.find((r) => {
      if (r.method !== method) return false;

      // Simple path matching (handles :param patterns)
      const routeParts = r.path.split('/');
      const pathParts = path.split('?')[0].split('/');

      if (routeParts.length !== pathParts.length) return false;

      for (let i = 0; i < routeParts.length; i++) {
        if (routeParts[i].startsWith(':')) {
          // Extract param name and value
          const paramName = routeParts[i].slice(1);
          req.params[paramName] = pathParts[i];
        } else if (routeParts[i] !== pathParts[i]) {
          return false;
        }
      }

      return true;
    });

    if (!route) {
      throw new Error(`No route found for ${method.toUpperCase()} ${path}`);
    }

    // Execute all handlers in sequence
    for (const handler of route.handlers) {
      let nextCalled = false;
      await handler(req, res, () => {
        nextCalled = true;
      });
      // If next wasn't called and response hasn't been sent, stop
      if (!nextCalled && (res as unknown as { _getData: () => MockResponseData })._getData().body !== null) {
        break;
      }
    }
  }
}

// ============================================================================
// Integration Tests
// ============================================================================

describe('A2A Discovery Integration Tests', () => {
  let setup: TestServiceSetup;

  beforeAll(() => {
    setup = new TestServiceSetup();
  });

  // ============================================================================
  // Platform Card Endpoint Tests
  // ============================================================================

  describe('GET /.well-known/agent.json', () => {
    it('should return platform aggregate card', async () => {
      const req = createMockRequest({});
      const res = createMockResponse();

      await setup.executeRoute('get', '/.well-known/agent.json', req, res);

      const data = res._getData();
      expect(data.statusCode).toBe(200);
      expect((data.body as { name: string }).name).toBe('Agentic QE Platform');
      expect((data.body as { skills: unknown[] }).skills).toBeDefined();
    });

    it('should return correct Content-Type header', async () => {
      const req = createMockRequest({});
      const res = createMockResponse();

      await setup.executeRoute('get', '/.well-known/agent.json', req, res);

      const data = res._getData();
      expect(data.headers['Content-Type']).toBe('application/json');
    });

    it('should return Cache-Control header', async () => {
      const req = createMockRequest({});
      const res = createMockResponse();

      await setup.executeRoute('get', '/.well-known/agent.json', req, res);

      const data = res._getData();
      expect(data.headers['Cache-Control']).toContain('public');
      expect(data.headers['Cache-Control']).toContain('max-age=');
    });

    it('should return ETag header', async () => {
      const req = createMockRequest({});
      const res = createMockResponse();

      await setup.executeRoute('get', '/.well-known/agent.json', req, res);

      const data = res._getData();
      expect(data.headers['ETag']).toBeDefined();
      expect(data.headers['ETag']).toMatch(/^"[a-f0-9]+"$/);
    });

    it('should support conditional GET with If-None-Match', async () => {
      // First request to get ETag
      const req1 = createMockRequest({});
      const res1 = createMockResponse();
      await setup.executeRoute('get', '/.well-known/agent.json', req1, res1);
      const etag = res1._getData().headers['ETag'];

      // Second request with If-None-Match
      const req2 = createMockRequest({
        headers: { 'if-none-match': etag as string },
      });
      const res2 = createMockResponse();
      await setup.executeRoute('get', '/.well-known/agent.json', req2, res2);

      expect(res2._getData().statusCode).toBe(304);
      expect(res2._getData().ended).toBe(true);
    });

    it('should aggregate capabilities from all agents', async () => {
      const req = createMockRequest({});
      const res = createMockResponse();

      await setup.executeRoute('get', '/.well-known/agent.json', req, res);

      const card = res._getData().body as { capabilities: { streaming: boolean; pushNotifications: boolean } };
      expect(card.capabilities.streaming).toBe(true);
      expect(card.capabilities.pushNotifications).toBe(true);
    });

    it('should aggregate skills from all agents', async () => {
      const req = createMockRequest({});
      const res = createMockResponse();

      await setup.executeRoute('get', '/.well-known/agent.json', req, res);

      const card = res._getData().body as { skills: Array<{ id: string }> };
      const skillIds = card.skills.map((s) => s.id);
      expect(skillIds).toContain('test-generation');
      expect(skillIds).toContain('coverage-analysis');
      expect(skillIds).toContain('security-scan');
    });
  });

  // ============================================================================
  // Individual Agent Card Endpoint Tests
  // ============================================================================

  describe('GET /a2a/:agentId/.well-known/agent.json', () => {
    it('should return individual agent card', async () => {
      const req = createMockRequest({ params: {} });
      const res = createMockResponse();

      await setup.executeRoute('get', '/a2a/qe-test-architect/.well-known/agent.json', req, res);

      const data = res._getData();
      expect(data.statusCode).toBe(200);
      expect((data.body as { name: string }).name).toBe('qe-test-architect');
      expect((data.body as { skills: unknown[] }).skills).toHaveLength(2);
    });

    it('should return 404 for unknown agent', async () => {
      const req = createMockRequest({ params: {} });
      const res = createMockResponse();

      await setup.executeRoute('get', '/a2a/unknown-agent/.well-known/agent.json', req, res);

      const data = res._getData();
      expect(data.statusCode).toBe(404);

      const error = data.body as { error: { code: number; message: string; data: { agentId: string } } };
      expect(error.error.code).toBe(-32001);
      expect(error.error.message).toBe('Agent not found');
      expect(error.error.data.agentId).toBe('unknown-agent');
    });

    it('should return correct Content-Type header', async () => {
      const req = createMockRequest({ params: {} });
      const res = createMockResponse();

      await setup.executeRoute('get', '/a2a/qe-test-architect/.well-known/agent.json', req, res);

      expect(res._getData().headers['Content-Type']).toBe('application/json');
    });

    it('should return ETag header', async () => {
      const req = createMockRequest({ params: {} });
      const res = createMockResponse();

      await setup.executeRoute('get', '/a2a/qe-test-architect/.well-known/agent.json', req, res);

      expect(res._getData().headers['ETag']).toBeDefined();
    });

    it('should support conditional GET', async () => {
      const req1 = createMockRequest({ params: {} });
      const res1 = createMockResponse();
      await setup.executeRoute('get', '/a2a/qe-test-architect/.well-known/agent.json', req1, res1);
      const etag = res1._getData().headers['ETag'];

      const req2 = createMockRequest({
        params: {},
        headers: { 'if-none-match': etag as string },
      });
      const res2 = createMockResponse();
      await setup.executeRoute('get', '/a2a/qe-test-architect/.well-known/agent.json', req2, res2);

      expect(res2._getData().statusCode).toBe(304);
    });

    it('should include QE metadata', async () => {
      const req = createMockRequest({ params: {} });
      const res = createMockResponse();

      await setup.executeRoute('get', '/a2a/qe-test-architect/.well-known/agent.json', req, res);

      const card = res._getData().body as { qeMetadata: { domain: string } };
      expect(card.qeMetadata).toBeDefined();
      expect(card.qeMetadata.domain).toBe('test-generation');
    });
  });

  // ============================================================================
  // Extended Card Endpoint Tests
  // ============================================================================

  describe('GET /a2a/:agentId/.well-known/agent.json?extended=true', () => {
    it('should return 401 without authentication', async () => {
      const req = createMockRequest({
        params: {},
        query: { extended: 'true' },
      });
      const res = createMockResponse();

      await setup.executeRoute('get', '/a2a/qe-test-architect/.well-known/agent.json', req, res);

      const data = res._getData();
      expect(data.statusCode).toBe(401);

      const error = data.body as { error: { code: number; message: string } };
      expect(error.error.code).toBe(-32020);
      expect(error.error.message).toContain('Authentication required');
    });

    it('should return extended card with valid token', async () => {
      const req = createMockRequest({
        params: {},
        query: { extended: 'true' },
        headers: { authorization: 'Bearer valid-test-token' },
      });
      const res = createMockResponse();

      await setup.executeRoute('get', '/a2a/qe-test-architect/.well-known/agent.json', req, res);

      const data = res._getData();
      expect(data.statusCode).toBe(200);

      const card = data.body as { extended: { rateLimits: unknown } };
      expect(card.extended).toBeDefined();
      expect(card.extended.rateLimits).toBeDefined();
    });

    it('should include rate limits in extended card', async () => {
      const req = createMockRequest({
        params: {},
        query: { extended: 'true' },
        headers: { authorization: 'Bearer valid-test-token' },
      });
      const res = createMockResponse();

      await setup.executeRoute('get', '/a2a/qe-test-architect/.well-known/agent.json', req, res);

      const card = res._getData().body as {
        extended: {
          rateLimits: { requestsPerMinute: number; requestsPerHour: number; requestsPerDay: number };
        };
      };
      expect(card.extended.rateLimits.requestsPerMinute).toBe(100);
      expect(card.extended.rateLimits.requestsPerHour).toBe(1000);
      expect(card.extended.rateLimits.requestsPerDay).toBe(10000);
    });

    it('should include SLA in extended card', async () => {
      const req = createMockRequest({
        params: {},
        query: { extended: 'true' },
        headers: { authorization: 'Bearer valid-test-token' },
      });
      const res = createMockResponse();

      await setup.executeRoute('get', '/a2a/qe-test-architect/.well-known/agent.json', req, res);

      const card = res._getData().body as { extended: { sla: { uptimeTarget: number } } };
      expect(card.extended.sla).toBeDefined();
      expect(card.extended.sla.uptimeTarget).toBe(99.9);
    });

    it('should return 404 for unknown agent even with auth', async () => {
      const req = createMockRequest({
        params: {},
        query: { extended: 'true' },
        headers: { authorization: 'Bearer valid-test-token' },
      });
      const res = createMockResponse();

      await setup.executeRoute('get', '/a2a/unknown-agent/.well-known/agent.json', req, res);

      expect(res._getData().statusCode).toBe(404);
    });

    it('should have private Cache-Control for extended cards', async () => {
      const req = createMockRequest({
        params: {},
        query: { extended: 'true' },
        headers: { authorization: 'Bearer valid-test-token' },
      });
      const res = createMockResponse();

      await setup.executeRoute('get', '/a2a/qe-test-architect/.well-known/agent.json', req, res);

      expect(res._getData().headers['Cache-Control']).toContain('private');
    });
  });

  // ============================================================================
  // Search Endpoint Tests
  // ============================================================================

  describe('GET /a2a/agents', () => {
    it('should list all agents', async () => {
      const req = createMockRequest({});
      const res = createMockResponse();

      await setup.executeRoute('get', '/a2a/agents', req, res);

      const data = res._getData();
      expect(data.statusCode).toBe(200);

      const result = data.body as { agents: unknown[]; total: number };
      expect(result.agents).toBeDefined();
      expect(result.total).toBe(3);
    });

    it('should filter by skill', async () => {
      const req = createMockRequest({
        query: { skill: 'test-generation' },
      });
      const res = createMockResponse();

      await setup.executeRoute('get', '/a2a/agents', req, res);

      const result = res._getData().body as { agents: Array<{ skills: string[] }> };
      expect(result.agents.every((a) => a.skills.includes('test-generation'))).toBe(true);
    });

    it('should filter by tag', async () => {
      const req = createMockRequest({
        query: { tag: 'security' },
      });
      const res = createMockResponse();

      await setup.executeRoute('get', '/a2a/agents', req, res);

      const result = res._getData().body as { agents: Array<{ name: string }>; total: number };
      expect(result.total).toBe(1);
      expect(result.agents[0].name).toBe('qe-security-scanner');
    });

    it('should filter by domain', async () => {
      const req = createMockRequest({
        query: { domain: 'coverage-analysis' },
      });
      const res = createMockResponse();

      await setup.executeRoute('get', '/a2a/agents', req, res);

      const result = res._getData().body as { agents: Array<{ name: string }>; total: number };
      expect(result.total).toBe(1);
      expect(result.agents[0].name).toBe('qe-coverage-specialist');
    });

    it('should filter by streaming capability', async () => {
      const req = createMockRequest({
        query: { streaming: 'false' },
      });
      const res = createMockResponse();

      await setup.executeRoute('get', '/a2a/agents', req, res);

      const result = res._getData().body as { agents: Array<{ name: string }>; total: number };
      expect(result.total).toBe(1);
      expect(result.agents[0].name).toBe('qe-security-scanner');
    });

    it('should apply limit', async () => {
      const req = createMockRequest({
        query: { limit: '2' },
      });
      const res = createMockResponse();

      await setup.executeRoute('get', '/a2a/agents', req, res);

      const result = res._getData().body as { agents: unknown[]; total: number };
      expect(result.agents).toHaveLength(2);
      expect(result.total).toBe(3); // Total without limit
    });

    it('should return correct Content-Type', async () => {
      const req = createMockRequest({});
      const res = createMockResponse();

      await setup.executeRoute('get', '/a2a/agents', req, res);

      expect(res._getData().headers['Content-Type']).toBe('application/json');
    });
  });

  // ============================================================================
  // CORS Tests
  // ============================================================================

  describe('CORS Support', () => {
    it('should return CORS headers on platform card', async () => {
      const req = createMockRequest({});
      const res = createMockResponse();

      await setup.executeRoute('get', '/.well-known/agent.json', req, res);

      expect(res._getData().headers['Access-Control-Allow-Origin']).toBe('*');
    });

    it('should return CORS headers on agent card', async () => {
      const req = createMockRequest({ params: {} });
      const res = createMockResponse();

      await setup.executeRoute('get', '/a2a/qe-test-architect/.well-known/agent.json', req, res);

      expect(res._getData().headers['Access-Control-Allow-Origin']).toBe('*');
    });

    it('should handle OPTIONS preflight request', async () => {
      const req = createMockRequest({});
      const res = createMockResponse();

      await setup.executeRoute('options', '/.well-known/agent.json', req, res);

      const data = res._getData();
      expect(data.statusCode).toBe(204);
      expect(data.headers['Access-Control-Allow-Methods']).toContain('GET');
    });
  });

  // ============================================================================
  // Metrics Integration Tests
  // ============================================================================

  describe('Access Metrics', () => {
    it('should track access to agent cards', async () => {
      const initialMetrics = setup.discoveryService.getAccessMetrics('qe-coverage-specialist');
      const initialCount = initialMetrics?.accessCount ?? 0;

      // Make requests
      const req1 = createMockRequest({ params: {} });
      const res1 = createMockResponse();
      await setup.executeRoute('get', '/a2a/qe-coverage-specialist/.well-known/agent.json', req1, res1);

      const req2 = createMockRequest({ params: {} });
      const res2 = createMockResponse();
      await setup.executeRoute('get', '/a2a/qe-coverage-specialist/.well-known/agent.json', req2, res2);

      const metrics = setup.discoveryService.getAccessMetrics('qe-coverage-specialist');
      expect(metrics).not.toBeNull();
      expect(metrics!.accessCount).toBe(initialCount + 2);
    });

    it('should track extended card access separately', async () => {
      const initialMetrics = setup.discoveryService.getAccessMetrics('qe-test-architect');
      const initialExtendedCount = initialMetrics?.extendedAccessCount ?? 0;

      // Make extended request
      const req = createMockRequest({
        params: {},
        query: { extended: 'true' },
        headers: { authorization: 'Bearer valid-test-token' },
      });
      const res = createMockResponse();
      await setup.executeRoute('get', '/a2a/qe-test-architect/.well-known/agent.json', req, res);

      const metrics = setup.discoveryService.getAccessMetrics('qe-test-architect');
      expect(metrics!.extendedAccessCount).toBe(initialExtendedCount + 1);
    });
  });

  // ============================================================================
  // Error Handling Tests
  // ============================================================================

  describe('Error Handling', () => {
    it('should return JSON error for 404', async () => {
      const req = createMockRequest({ params: {} });
      const res = createMockResponse();

      await setup.executeRoute('get', '/a2a/nonexistent/.well-known/agent.json', req, res);

      const data = res._getData();
      expect(data.statusCode).toBe(404);

      const error = data.body as { error: { code: number } };
      expect(error.error).toBeDefined();
      expect(error.error.code).toBe(-32001);
    });

    it('should return JSON error for 401', async () => {
      const req = createMockRequest({
        params: {},
        query: { extended: 'true' },
      });
      const res = createMockResponse();

      await setup.executeRoute('get', '/a2a/qe-test-architect/.well-known/agent.json', req, res);

      const data = res._getData();
      expect(data.statusCode).toBe(401);

      const error = data.body as { error: { code: number } };
      expect(error.error).toBeDefined();
      expect(error.error.code).toBe(-32020);
    });
  });

  // ============================================================================
  // Agent Card Alias Tests
  // ============================================================================

  describe('GET /a2a/agents/:agentId', () => {
    it('should return agent card via alias endpoint', async () => {
      const req = createMockRequest({ params: {} });
      const res = createMockResponse();

      await setup.executeRoute('get', '/a2a/agents/qe-test-architect', req, res);

      const data = res._getData();
      expect(data.statusCode).toBe(200);
      expect((data.body as { name: string }).name).toBe('qe-test-architect');
    });

    it('should return 404 for unknown agent via alias', async () => {
      const req = createMockRequest({ params: {} });
      const res = createMockResponse();

      await setup.executeRoute('get', '/a2a/agents/unknown-agent', req, res);

      expect(res._getData().statusCode).toBe(404);
    });

    it('should support extended card via alias', async () => {
      const req = createMockRequest({
        params: {},
        query: { extended: 'true' },
        headers: { authorization: 'Bearer valid-test-token' },
      });
      const res = createMockResponse();

      await setup.executeRoute('get', '/a2a/agents/qe-test-architect', req, res);

      const card = res._getData().body as { extended: unknown };
      expect(card.extended).toBeDefined();
    });
  });
});
