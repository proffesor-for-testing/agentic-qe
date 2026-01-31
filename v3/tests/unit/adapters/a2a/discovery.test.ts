/**
 * A2A Discovery Service Unit Tests
 *
 * Comprehensive test suite for the A2A Discovery Service and route handlers.
 * Target: 30+ unit tests covering all components.
 *
 * @module tests/unit/adapters/a2a/discovery
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  // Discovery Service
  DiscoveryService,
  createDiscoveryService,
  DEFAULT_DISCOVERY_CONFIG,

  // Routes
  getDiscoveryRouteDefinitions,
  createAgentNotFoundResponse,
  createAuthRequiredResponse,
  createInternalErrorResponse,
  DEFAULT_ROUTES_CONFIG,
  createPlatformCardHandler,
  createAgentCardHandler,
  HttpRequest,
  HttpResponse,

  // Agent Cards (for test fixtures)
  QEAgentCard,
  createAgentCardGenerator,
  createAgentSkill,
  DEFAULT_CAPABILITIES,
  DEFAULT_INPUT_MODES,
  DEFAULT_OUTPUT_MODES,
  DEFAULT_QE_PROVIDER,
} from '../../../../src/adapters/a2a/index.js';

// ============================================================================
// Test Fixtures
// ============================================================================

const createTestAgentCard = (id: string, options: Partial<QEAgentCard> = {}): QEAgentCard => ({
  name: id,
  description: `Test agent ${id}`,
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
      id: `${id}-skill`,
      name: `${id} Skill`,
      description: `Skill for ${id}`,
      tags: ['testing', id.split('-')[1] ?? 'general'],
    },
  ],
  provider: DEFAULT_QE_PROVIDER,
  defaultInputModes: DEFAULT_INPUT_MODES,
  defaultOutputModes: DEFAULT_OUTPUT_MODES,
  qeMetadata: options.qeMetadata ?? {
    domain: 'test-generation',
  },
  ...options,
});

const createMockGenerator = () => {
  return createAgentCardGenerator({
    baseUrl: 'https://test.example.com',
  });
};

const createTestDiscoveryService = (
  cards: Map<string, QEAgentCard> = new Map()
): DiscoveryService => {
  const generator = createMockGenerator();
  const service = createDiscoveryService({
    generator,
    baseUrl: 'https://qe.example.com',
    cacheTtl: 3600000,
    enableMetrics: true,
  });

  if (cards.size > 0) {
    service.registerCards(cards);
  }

  return service;
};

/**
 * Create mock HTTP request object
 */
const createMockRequest = (overrides: Partial<HttpRequest> = {}): HttpRequest => ({
  params: {},
  query: {},
  headers: {},
  header: (name: string) => {
    const headers = overrides.headers ?? {};
    const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
    return key ? (headers[key] as string) : undefined;
  },
  ...overrides,
});

/**
 * Create mock HTTP response object
 */
const createMockResponse = () => {
  const headers: Record<string, string | number> = {};
  let statusCode = 200;
  let body: unknown = null;

  const response: HttpResponse & {
    getStatusCode: () => number;
    getBody: () => unknown;
    getHeaders: () => Record<string, string | number>;
  } = {
    status: (code: number) => {
      statusCode = code;
      return response;
    },
    json: (data: unknown) => {
      body = data;
    },
    setHeader: (name: string, value: string | number) => {
      headers[name] = value;
    },
    end: () => {},
    getStatusCode: () => statusCode,
    getBody: () => body,
    getHeaders: () => headers,
  };

  return response;
};

// ============================================================================
// Discovery Service Tests
// ============================================================================

describe('A2A Discovery Service', () => {
  describe('createDiscoveryService', () => {
    it('should create service with required config', () => {
      const generator = createMockGenerator();
      const service = createDiscoveryService({
        generator,
        baseUrl: 'https://test.com',
      });

      expect(service).toBeInstanceOf(DiscoveryService);
    });

    it('should create service with full config', () => {
      const generator = createMockGenerator();
      const service = createDiscoveryService({
        generator,
        baseUrl: 'https://test.com',
        cacheTtl: 1800000,
        platformName: 'Custom Platform',
        platformDescription: 'Custom description',
        platformVersion: '2.0.0',
        enableMetrics: true,
      });

      expect(service).toBeInstanceOf(DiscoveryService);
    });

    it('should use default config values', () => {
      expect(DEFAULT_DISCOVERY_CONFIG.cacheTtl).toBe(3600000);
      expect(DEFAULT_DISCOVERY_CONFIG.platformName).toBe('Agentic QE Platform');
      expect(DEFAULT_DISCOVERY_CONFIG.enableMetrics).toBe(true);
    });
  });

  describe('Card Registration', () => {
    let service: DiscoveryService;

    beforeEach(() => {
      service = createTestDiscoveryService();
    });

    it('should register a single card', () => {
      const card = createTestAgentCard('qe-test-agent');
      service.registerCard(card);

      expect(service.hasAgent('qe-test-agent')).toBe(true);
      expect(service.getAgentCount()).toBe(1);
    });

    it('should register multiple cards', () => {
      const cards = new Map<string, QEAgentCard>();
      cards.set('agent-1', createTestAgentCard('agent-1'));
      cards.set('agent-2', createTestAgentCard('agent-2'));
      cards.set('agent-3', createTestAgentCard('agent-3'));

      service.registerCards(cards);

      expect(service.getAgentCount()).toBe(3);
      expect(service.hasLoadedCards()).toBe(true);
    });

    it('should return false for unregistered agent', () => {
      expect(service.hasAgent('non-existent')).toBe(false);
    });

    it('should get all agent IDs', () => {
      const cards = new Map<string, QEAgentCard>();
      cards.set('agent-a', createTestAgentCard('agent-a'));
      cards.set('agent-b', createTestAgentCard('agent-b'));

      service.registerCards(cards);

      const ids = service.getAgentIds();
      expect(ids).toContain('agent-a');
      expect(ids).toContain('agent-b');
      expect(ids).toHaveLength(2);
    });
  });

  describe('Platform Card', () => {
    it('should generate platform card', async () => {
      const cards = new Map<string, QEAgentCard>();
      cards.set('agent-1', createTestAgentCard('agent-1'));
      cards.set('agent-2', createTestAgentCard('agent-2'));

      const service = createTestDiscoveryService(cards);
      const platformCard = await service.getPlatformCard();

      expect(platformCard.name).toBe('Agentic QE Platform');
      expect(platformCard.url).toBe('https://qe.example.com');
      expect(platformCard.version).toBe('3.0.0');
      expect(platformCard.provider).toEqual(DEFAULT_QE_PROVIDER);
    });

    it('should aggregate skills from all agents', async () => {
      const cards = new Map<string, QEAgentCard>();
      cards.set(
        'agent-1',
        createTestAgentCard('agent-1', {
          skills: [createAgentSkill('skill-a', 'Skill A', 'Description A')],
        })
      );
      cards.set(
        'agent-2',
        createTestAgentCard('agent-2', {
          skills: [createAgentSkill('skill-b', 'Skill B', 'Description B')],
        })
      );

      const service = createTestDiscoveryService(cards);
      const platformCard = await service.getPlatformCard();

      expect(platformCard.skills.length).toBeGreaterThanOrEqual(2);
      expect(platformCard.skills.some((s) => s.id === 'skill-a')).toBe(true);
      expect(platformCard.skills.some((s) => s.id === 'skill-b')).toBe(true);
    });

    it('should deduplicate skills by ID', async () => {
      const cards = new Map<string, QEAgentCard>();
      cards.set(
        'agent-1',
        createTestAgentCard('agent-1', {
          skills: [createAgentSkill('shared-skill', 'Shared', 'Description')],
        })
      );
      cards.set(
        'agent-2',
        createTestAgentCard('agent-2', {
          skills: [createAgentSkill('shared-skill', 'Shared', 'Description')],
        })
      );

      const service = createTestDiscoveryService(cards);
      const platformCard = await service.getPlatformCard();

      const sharedSkills = platformCard.skills.filter((s) => s.id === 'shared-skill');
      expect(sharedSkills).toHaveLength(1);
    });

    it('should aggregate capabilities from all agents', async () => {
      const cards = new Map<string, QEAgentCard>();
      cards.set(
        'agent-1',
        createTestAgentCard('agent-1', {
          capabilities: { streaming: true, pushNotifications: false, stateTransitionHistory: false },
        })
      );
      cards.set(
        'agent-2',
        createTestAgentCard('agent-2', {
          capabilities: { streaming: false, pushNotifications: true, stateTransitionHistory: true },
        })
      );

      const service = createTestDiscoveryService(cards);
      const platformCard = await service.getPlatformCard();

      // Should have streaming=true because at least one agent supports it
      expect(platformCard.capabilities.streaming).toBe(true);
      expect(platformCard.capabilities.pushNotifications).toBe(true);
      expect(platformCard.capabilities.stateTransitionHistory).toBe(true);
    });

    it('should cache platform card', async () => {
      const service = createTestDiscoveryService();
      service.registerCard(createTestAgentCard('agent-1'));

      const card1 = await service.getPlatformCard();
      const card2 = await service.getPlatformCard();

      // Same object reference due to caching
      expect(card1).toBe(card2);
    });

    it('should generate ETag for platform card', async () => {
      const service = createTestDiscoveryService();
      service.registerCard(createTestAgentCard('agent-1'));

      await service.getPlatformCard();
      const etag = service.getPlatformCardEtag();

      expect(etag).toBeDefined();
      expect(etag).toMatch(/^"[a-f0-9]+"$/);
    });

    it('should support supportsAuthenticatedExtendedCard', async () => {
      const service = createTestDiscoveryService();
      service.registerCard(createTestAgentCard('agent-1'));

      const platformCard = await service.getPlatformCard();

      expect(platformCard.supportsAuthenticatedExtendedCard).toBe(true);
    });
  });

  describe('Agent Card Retrieval', () => {
    let service: DiscoveryService;

    beforeEach(() => {
      const cards = new Map<string, QEAgentCard>();
      cards.set('qe-test-architect', createTestAgentCard('qe-test-architect'));
      cards.set('qe-coverage-specialist', createTestAgentCard('qe-coverage-specialist'));

      service = createTestDiscoveryService(cards);
    });

    it('should get agent card by ID', async () => {
      const card = await service.getAgentCard('qe-test-architect');

      expect(card).not.toBeNull();
      expect(card?.name).toBe('qe-test-architect');
    });

    it('should return null for non-existent agent', async () => {
      const card = await service.getAgentCard('non-existent-agent');

      expect(card).toBeNull();
    });

    it('should cache agent cards', async () => {
      const card1 = await service.getAgentCard('qe-test-architect');
      const card2 = await service.getAgentCard('qe-test-architect');

      expect(card1).toBe(card2);
    });

    it('should generate ETag for agent card', async () => {
      await service.getAgentCard('qe-test-architect');
      const etag = service.getAgentCardEtag('qe-test-architect');

      expect(etag).toBeDefined();
      expect(etag).toMatch(/^"[a-f0-9]+"$/);
    });

    it('should return null ETag for non-cached agent', () => {
      const etag = service.getAgentCardEtag('non-cached');

      expect(etag).toBeNull();
    });
  });

  describe('Extended Agent Card', () => {
    let service: DiscoveryService;

    beforeEach(() => {
      const cards = new Map<string, QEAgentCard>();
      cards.set(
        'qe-test-architect',
        createTestAgentCard('qe-test-architect', {
          qeMetadata: { domain: 'test-generation' },
        })
      );

      service = createTestDiscoveryService(cards);
    });

    it('should get extended agent card', async () => {
      const card = await service.getExtendedAgentCard('qe-test-architect');

      expect(card).not.toBeNull();
      expect(card?.extended).toBeDefined();
    });

    it('should include rate limits in extended card', async () => {
      const card = await service.getExtendedAgentCard('qe-test-architect');

      expect(card?.extended?.rateLimits).toBeDefined();
      expect(card?.extended?.rateLimits?.requestsPerMinute).toBe(100);
      expect(card?.extended?.rateLimits?.requestsPerHour).toBe(1000);
      expect(card?.extended?.rateLimits?.requestsPerDay).toBe(10000);
    });

    it('should include SLA info in extended card', async () => {
      const card = await service.getExtendedAgentCard('qe-test-architect');

      expect(card?.extended?.sla).toBeDefined();
      expect(card?.extended?.sla?.uptimeTarget).toBe(99.9);
      expect(card?.extended?.sla?.responseTimeTarget).toBe(200);
    });

    it('should include required scopes in extended card', async () => {
      const card = await service.getExtendedAgentCard('qe-test-architect');

      expect(card?.extended?.requiredScopes).toBeDefined();
      expect(card?.extended?.requiredScopes).toContain('test-generation:read');
      expect(card?.extended?.requiredScopes).toContain('test-generation:execute');
    });

    it('should return null for non-existent agent', async () => {
      const card = await service.getExtendedAgentCard('non-existent');

      expect(card).toBeNull();
    });
  });

  describe('Search and Filter', () => {
    let service: DiscoveryService;

    beforeEach(() => {
      const cards = new Map<string, QEAgentCard>();

      // Agent with streaming
      cards.set(
        'streaming-agent',
        createTestAgentCard('streaming-agent', {
          capabilities: { streaming: true, pushNotifications: false, stateTransitionHistory: true },
          skills: [
            createAgentSkill('test-generation', 'Test Generation', 'Generate tests', {
              tags: ['testing', 'ai'],
            }),
          ],
          qeMetadata: { domain: 'test-generation' },
        })
      );

      // Agent without streaming
      cards.set(
        'non-streaming-agent',
        createTestAgentCard('non-streaming-agent', {
          capabilities: { streaming: false, pushNotifications: true, stateTransitionHistory: false },
          skills: [
            createAgentSkill('security-scan', 'Security Scan', 'Scan for vulnerabilities', {
              tags: ['security', 'owasp'],
            }),
          ],
          qeMetadata: { domain: 'security-compliance' },
        })
      );

      // Agent with multiple skills
      cards.set(
        'multi-skill-agent',
        createTestAgentCard('multi-skill-agent', {
          capabilities: { streaming: true, pushNotifications: true, stateTransitionHistory: true },
          skills: [
            createAgentSkill('test-generation', 'Test Generation', 'Generate tests', {
              tags: ['testing'],
            }),
            createAgentSkill('coverage-analysis', 'Coverage Analysis', 'Analyze coverage', {
              tags: ['coverage', 'analysis'],
            }),
          ],
          qeMetadata: { domain: 'coverage-analysis' },
        })
      );

      service = createTestDiscoveryService(cards);
    });

    it('should find agents by capability', async () => {
      const agents = await service.findByCapability('streaming');

      expect(agents).toHaveLength(2);
      expect(agents.some((a) => a.name === 'streaming-agent')).toBe(true);
      expect(agents.some((a) => a.name === 'multi-skill-agent')).toBe(true);
    });

    it('should find agents by skill', async () => {
      const agents = await service.findBySkill('test-generation');

      expect(agents).toHaveLength(2);
      expect(agents.some((a) => a.name === 'streaming-agent')).toBe(true);
      expect(agents.some((a) => a.name === 'multi-skill-agent')).toBe(true);
    });

    it('should find agents by tag', async () => {
      const agents = await service.findByTag('security');

      expect(agents).toHaveLength(1);
      expect(agents[0].name).toBe('non-streaming-agent');
    });

    it('should find agents by domain', async () => {
      const agents = await service.findByDomain('test-generation');

      expect(agents).toHaveLength(1);
      expect(agents[0].name).toBe('streaming-agent');
    });

    it('should search with multiple criteria', async () => {
      const result = await service.search({
        streaming: true,
        skill: 'test-generation',
      });

      expect(result.total).toBe(2);
      expect(result.agents.every((a) => a.capabilities.streaming)).toBe(true);
    });

    it('should apply limit to search results', async () => {
      const result = await service.search({
        limit: 1,
      });

      expect(result.agents).toHaveLength(1);
      expect(result.total).toBe(3); // Total before limit
    });

    it('should return empty array for no matches', async () => {
      const agents = await service.findByTag('non-existent-tag');

      expect(agents).toHaveLength(0);
    });

    it('should be case-insensitive for tag search', async () => {
      const agents = await service.findByTag('SECURITY');

      expect(agents).toHaveLength(1);
    });
  });

  describe('Access Metrics', () => {
    let service: DiscoveryService;

    beforeEach(() => {
      const cards = new Map<string, QEAgentCard>();
      cards.set('test-agent', createTestAgentCard('test-agent'));

      service = createTestDiscoveryService(cards);
    });

    it('should track card access', async () => {
      await service.getAgentCard('test-agent');
      await service.getAgentCard('test-agent');
      await service.getAgentCard('test-agent');

      const metrics = service.getAccessMetrics('test-agent');

      expect(metrics).not.toBeNull();
      expect(metrics?.accessCount).toBe(3);
    });

    it('should track extended card access separately', async () => {
      await service.getAgentCard('test-agent');
      await service.getExtendedAgentCard('test-agent');

      const metrics = service.getAccessMetrics('test-agent');

      // accessCount is 3 because:
      // 1. First getAgentCard call increments accessCount to 1
      // 2. getExtendedAgentCard calls getAgentCard internally (accessCount to 2)
      // 3. getExtendedAgentCard also calls recordAccess again (accessCount to 3)
      expect(metrics?.accessCount).toBe(3);
      expect(metrics?.extendedAccessCount).toBe(1);
    });

    it('should return null for unaccessed agent', () => {
      const metrics = service.getAccessMetrics('unaccessed-agent');

      expect(metrics).toBeNull();
    });

    it('should get all access metrics', async () => {
      const cards = new Map<string, QEAgentCard>();
      cards.set('agent-1', createTestAgentCard('agent-1'));
      cards.set('agent-2', createTestAgentCard('agent-2'));

      service.registerCards(cards);

      await service.getAgentCard('agent-1');
      await service.getAgentCard('agent-2');

      const allMetrics = service.getAllAccessMetrics();

      // Original + 2 new = 3 total accessed
      expect(allMetrics.length).toBeGreaterThanOrEqual(2);
    });

    it('should update lastAccessedAt', async () => {
      await service.getAgentCard('test-agent');
      const metrics1 = service.getAccessMetrics('test-agent');

      // Wait a tiny bit
      await new Promise((r) => setTimeout(r, 10));

      await service.getAgentCard('test-agent');
      const metrics2 = service.getAccessMetrics('test-agent');

      expect(metrics2!.lastAccessedAt).toBeGreaterThanOrEqual(metrics1!.lastAccessedAt);
    });
  });

  describe('Cache Management', () => {
    let service: DiscoveryService;

    beforeEach(() => {
      const cards = new Map<string, QEAgentCard>();
      cards.set('test-agent', createTestAgentCard('test-agent'));

      service = createTestDiscoveryService(cards);
    });

    it('should invalidate cache for specific agent', async () => {
      await service.getAgentCard('test-agent');
      expect(service.getAgentCardEtag('test-agent')).not.toBeNull();

      service.invalidateCache('test-agent');

      expect(service.getAgentCardEtag('test-agent')).toBeNull();
    });

    it('should invalidate all caches', async () => {
      await service.getAgentCard('test-agent');
      await service.getPlatformCard();

      service.invalidateAllCaches();

      expect(service.getAgentCardEtag('test-agent')).toBeNull();
      expect(service.getPlatformCardEtag()).toBeNull();
    });

    it('should provide cache statistics', async () => {
      await service.getAgentCard('test-agent');

      const stats = service.getCacheStats();

      expect(stats.cardCacheSize).toBe(1);
      expect(stats.hasPlatformCard).toBe(false);
      expect(stats.oldestEntry).not.toBeNull();
    });

    it('should invalidate platform cache when card registered', async () => {
      await service.getPlatformCard();
      expect(service.getPlatformCardEtag()).not.toBeNull();

      service.registerCard(createTestAgentCard('new-agent'));

      expect(service.getPlatformCardEtag()).toBeNull();
    });
  });
});

// ============================================================================
// Error Response Tests
// ============================================================================

describe('A2A Error Responses', () => {
  describe('createAgentNotFoundResponse', () => {
    it('should create agent not found response', () => {
      const response = createAgentNotFoundResponse('missing-agent');

      expect(response.error.code).toBe(-32001);
      expect(response.error.message).toBe('Agent not found');
      expect(response.error.data).toEqual({ agentId: 'missing-agent' });
    });
  });

  describe('createAuthRequiredResponse', () => {
    it('should create auth required response', () => {
      const response = createAuthRequiredResponse();

      expect(response.error.code).toBe(-32020);
      expect(response.error.message).toBe('Authentication required for extended agent card');
    });
  });

  describe('createInternalErrorResponse', () => {
    it('should create internal error response with default message', () => {
      const response = createInternalErrorResponse();

      expect(response.error.code).toBe(-32603);
      expect(response.error.message).toBe('Internal error');
    });

    it('should create internal error response with custom message', () => {
      const response = createInternalErrorResponse('Custom error message');

      expect(response.error.code).toBe(-32603);
      expect(response.error.message).toBe('Custom error message');
    });
  });
});

// ============================================================================
// Route Handler Tests
// ============================================================================

describe('Discovery Route Handlers', () => {
  let service: DiscoveryService;

  beforeEach(() => {
    const cards = new Map<string, QEAgentCard>();
    cards.set('qe-test-agent', createTestAgentCard('qe-test-agent'));
    service = createTestDiscoveryService(cards);
  });

  describe('createPlatformCardHandler', () => {
    it('should return platform card', async () => {
      const handler = createPlatformCardHandler(service);
      const req = createMockRequest();
      const res = createMockResponse();

      await handler(req, res);

      expect(res.getStatusCode()).toBe(200);
      const body = res.getBody() as { name: string };
      expect(body.name).toBe('Agentic QE Platform');
    });

    it('should set correct headers', async () => {
      const handler = createPlatformCardHandler(service);
      const req = createMockRequest();
      const res = createMockResponse();

      await handler(req, res);

      const headers = res.getHeaders();
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['Cache-Control']).toContain('public');
      expect(headers['ETag']).toBeDefined();
      expect(headers['Access-Control-Allow-Origin']).toBe('*');
    });

    it('should use custom cache seconds', async () => {
      const handler = createPlatformCardHandler(service, { cacheSeconds: 7200 });
      const req = createMockRequest();
      const res = createMockResponse();

      await handler(req, res);

      const headers = res.getHeaders();
      expect(headers['Cache-Control']).toContain('7200');
    });
  });

  describe('createAgentCardHandler', () => {
    it('should return agent card', async () => {
      const handler = createAgentCardHandler(service);
      const req = createMockRequest({ params: { agentId: 'qe-test-agent' } });
      const res = createMockResponse();

      await handler(req, res);

      expect(res.getStatusCode()).toBe(200);
      const body = res.getBody() as { name: string };
      expect(body.name).toBe('qe-test-agent');
    });

    it('should return 404 for unknown agent', async () => {
      const handler = createAgentCardHandler(service);
      const req = createMockRequest({ params: { agentId: 'unknown-agent' } });
      const res = createMockResponse();

      await handler(req, res);

      expect(res.getStatusCode()).toBe(404);
      const body = res.getBody() as { error: { code: number } };
      expect(body.error.code).toBe(-32001);
    });
  });

  describe('getDiscoveryRouteDefinitions', () => {
    it('should return route definitions', () => {
      const routes = getDiscoveryRouteDefinitions({ discoveryService: service });

      expect(routes).toBeDefined();
      expect(Array.isArray(routes)).toBe(true);
      expect(routes.length).toBeGreaterThan(0);
    });

    it('should include platform card route', () => {
      const routes = getDiscoveryRouteDefinitions({ discoveryService: service });

      const platformRoute = routes.find((r) => r.path === '/.well-known/agent.json' && r.method === 'get');
      expect(platformRoute).toBeDefined();
    });

    it('should include agent card route', () => {
      const routes = getDiscoveryRouteDefinitions({ discoveryService: service });

      const agentRoute = routes.find(
        (r) => r.path === '/a2a/:agentId/.well-known/agent.json' && r.method === 'get'
      );
      expect(agentRoute).toBeDefined();
    });

    it('should include search route', () => {
      const routes = getDiscoveryRouteDefinitions({ discoveryService: service });

      const searchRoute = routes.find((r) => r.path === '/a2a/agents' && r.method === 'get');
      expect(searchRoute).toBeDefined();
    });

    it('should include CORS preflight routes', () => {
      const routes = getDiscoveryRouteDefinitions({ discoveryService: service });

      const optionsRoutes = routes.filter((r) => r.method === 'options');
      expect(optionsRoutes.length).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// Route Configuration Tests
// ============================================================================

describe('Discovery Routes Configuration', () => {
  it('should have default route config values', () => {
    expect(DEFAULT_ROUTES_CONFIG.defaultCacheSeconds).toBe(3600);
    expect(DEFAULT_ROUTES_CONFIG.enableCors).toBe(true);
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('Edge Cases', () => {
  it('should handle empty agent cards', async () => {
    const service = createTestDiscoveryService();

    const card = await service.getAgentCard('any-agent');
    expect(card).toBeNull();

    const platformCard = await service.getPlatformCard();
    expect(platformCard.skills).toHaveLength(0);
  });

  it('should handle agent with no skills', async () => {
    const cards = new Map<string, QEAgentCard>();
    cards.set(
      'no-skills-agent',
      createTestAgentCard('no-skills-agent', { skills: [] })
    );

    const service = createTestDiscoveryService(cards);
    const card = await service.getAgentCard('no-skills-agent');

    expect(card).not.toBeNull();
    expect(card?.skills).toHaveLength(0);
  });

  it('should handle agent with no metadata', async () => {
    const cards = new Map<string, QEAgentCard>();
    const card = createTestAgentCard('no-metadata-agent');
    delete (card as Record<string, unknown>).qeMetadata;
    cards.set('no-metadata-agent', card);

    const service = createTestDiscoveryService(cards);
    const result = await service.findByDomain('any-domain');

    expect(result).toHaveLength(0);
  });

  it('should handle special characters in agent ID', async () => {
    const cards = new Map<string, QEAgentCard>();
    cards.set('agent.with.dots', createTestAgentCard('agent.with.dots'));
    cards.set('agent_with_underscores', createTestAgentCard('agent_with_underscores'));

    const service = createTestDiscoveryService(cards);

    const card1 = await service.getAgentCard('agent.with.dots');
    const card2 = await service.getAgentCard('agent_with_underscores');

    expect(card1?.name).toBe('agent.with.dots');
    expect(card2?.name).toBe('agent_with_underscores');
  });

  it('should handle very long skill lists', async () => {
    const skills = Array.from({ length: 100 }, (_, i) =>
      createAgentSkill(`skill-${i}`, `Skill ${i}`, `Description ${i}`)
    );

    const cards = new Map<string, QEAgentCard>();
    cards.set('many-skills-agent', createTestAgentCard('many-skills-agent', { skills }));

    const service = createTestDiscoveryService(cards);
    const card = await service.getAgentCard('many-skills-agent');

    expect(card?.skills).toHaveLength(100);
  });

  it('should generate different ETags for different cards', async () => {
    const cards = new Map<string, QEAgentCard>();
    cards.set('agent-1', createTestAgentCard('agent-1'));
    cards.set('agent-2', createTestAgentCard('agent-2'));

    const service = createTestDiscoveryService(cards);

    await service.getAgentCard('agent-1');
    await service.getAgentCard('agent-2');

    const etag1 = service.getAgentCardEtag('agent-1');
    const etag2 = service.getAgentCardEtag('agent-2');

    expect(etag1).not.toBe(etag2);
  });
});

// ============================================================================
// A2A v0.3 Specification Compliance Tests
// ============================================================================

describe('A2A v0.3 Specification Compliance', () => {
  it('should support RFC 8615 well-known URI path', () => {
    const service = createTestDiscoveryService();
    const routes = getDiscoveryRouteDefinitions({ discoveryService: service });

    // Check that routes include the well-known path
    const wellKnownRoute = routes.find((r) => r.path === '/.well-known/agent.json');

    expect(wellKnownRoute).toBeDefined();
  });

  it('should support per-agent discovery path', () => {
    const service = createTestDiscoveryService();
    const routes = getDiscoveryRouteDefinitions({ discoveryService: service });

    // Check for parameterized agent route
    const agentRoute = routes.find((r) => r.path === '/a2a/:agentId/.well-known/agent.json');

    expect(agentRoute).toBeDefined();
  });

  it('should include all required fields in platform card', async () => {
    const service = createTestDiscoveryService();
    service.registerCard(createTestAgentCard('test-agent'));

    const card = await service.getPlatformCard();

    // Required fields per A2A v0.3
    expect(card.name).toBeDefined();
    expect(card.description).toBeDefined();
    expect(card.url).toBeDefined();
    expect(card.version).toBeDefined();
    expect(card.capabilities).toBeDefined();
    expect(card.skills).toBeDefined();
  });

  it('should support extended card for authenticated clients', async () => {
    const cards = new Map<string, QEAgentCard>();
    cards.set('test-agent', createTestAgentCard('test-agent'));

    const service = createTestDiscoveryService(cards);
    const extendedCard = await service.getExtendedAgentCard('test-agent');

    expect(extendedCard?.extended).toBeDefined();
    expect(extendedCard?.extended?.rateLimits).toBeDefined();
  });

  it('should use correct error codes per A2A spec', () => {
    // -32001 for agent not found
    const notFoundResponse = createAgentNotFoundResponse('test');
    expect(notFoundResponse.error.code).toBe(-32001);

    // -32020 for authentication required
    const authResponse = createAuthRequiredResponse();
    expect(authResponse.error.code).toBe(-32020);
  });
});
