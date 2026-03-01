/**
 * A2A Discovery Routes
 *
 * Express-compatible route handlers for RFC 8615 well-known URI agent discovery.
 * Provides endpoints for platform and individual agent card discovery.
 *
 * NOTE: This module exports handler factories that work with Express or any
 * compatible HTTP framework. Express itself is not bundled - consumers must
 * provide their own Express installation.
 *
 * @module adapters/a2a/discovery/routes
 * @see https://tools.ietf.org/html/rfc8615
 */

import { DiscoveryService, AgentSearchCriteria } from './discovery-service.js';

// ============================================================================
// Types (Express-compatible)
// ============================================================================

/**
 * Minimal HTTP request interface compatible with Express
 */
export interface HttpRequest {
  params: Record<string, string>;
  query: Record<string, string | string[] | undefined>;
  headers: Record<string, string | string[] | undefined>;
  header(name: string): string | undefined;
}

/**
 * Minimal HTTP response interface compatible with Express
 */
export interface HttpResponse {
  status(code: number): HttpResponse;
  json(body: unknown): void;
  setHeader(name: string, value: string | number): void;
  end(): void;
}

/**
 * Next function for middleware chaining
 */
export type NextFunction = (error?: unknown) => void;

/**
 * HTTP handler function
 */
export type HttpHandler = (
  req: HttpRequest,
  res: HttpResponse,
  next?: NextFunction
) => void | Promise<void>;

/**
 * Route configuration options
 */
export interface DiscoveryRoutesConfig {
  /** Discovery service instance */
  readonly discoveryService: DiscoveryService;
  /** Authentication middleware for extended cards */
  readonly authMiddleware?: HttpHandler;
  /** Default cache duration in seconds (for Cache-Control header) */
  readonly defaultCacheSeconds?: number;
  /** Enable CORS headers */
  readonly enableCors?: boolean;
}

/**
 * Authentication middleware type
 */
export type AuthMiddleware = HttpHandler;

/**
 * A2A error response format
 */
export interface A2AErrorResponse {
  readonly error: {
    readonly code: number;
    readonly message: string;
    readonly data?: unknown;
  };
}

/**
 * Request with authenticated user info
 */
export interface AuthenticatedRequest extends HttpRequest {
  user?: {
    id: string;
    scopes?: string[];
  };
}

/**
 * Route definition for Express router setup
 */
export interface RouteDefinition {
  readonly method: 'get' | 'post' | 'options';
  readonly path: string;
  readonly handlers: HttpHandler[];
}

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * Default route configuration
 */
export const DEFAULT_ROUTES_CONFIG = {
  defaultCacheSeconds: 3600, // 1 hour
  enableCors: true,
} as const;

// ============================================================================
// Error Response Helpers
// ============================================================================

/**
 * Create an A2A-formatted error response for agent not found
 */
export function createAgentNotFoundResponse(agentId: string): A2AErrorResponse {
  return {
    error: {
      code: -32001,
      message: 'Agent not found',
      data: { agentId },
    },
  };
}

/**
 * Create an A2A-formatted error response for authentication required
 */
export function createAuthRequiredResponse(): A2AErrorResponse {
  return {
    error: {
      code: -32020,
      message: 'Authentication required for extended agent card',
    },
  };
}

/**
 * Create an A2A-formatted error response for internal errors
 */
export function createInternalErrorResponse(message?: string): A2AErrorResponse {
  return {
    error: {
      code: -32603,
      message: message ?? 'Internal error',
    },
  };
}

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * Create discovery route handlers
 */
function createRouteHandlers(config: Required<DiscoveryRoutesConfig>) {
  const { discoveryService, defaultCacheSeconds, enableCors } = config;

  /**
   * Set common response headers
   */
  function setCommonHeaders(res: HttpResponse, etag?: string | null): void {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', `public, max-age=${defaultCacheSeconds}`);

    if (etag) {
      res.setHeader('ETag', etag);
    }

    if (enableCors) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }
  }

  /**
   * Handle conditional GET (If-None-Match)
   */
  function handleConditionalGet(
    req: HttpRequest,
    res: HttpResponse,
    currentEtag: string | null
  ): boolean {
    const ifNoneMatch = req.header('If-None-Match');

    if (ifNoneMatch && currentEtag && ifNoneMatch === currentEtag) {
      res.status(304).end();
      return true;
    }

    return false;
  }

  return {
    /**
     * GET /.well-known/agent.json
     * Returns the aggregate platform card
     */
    async getPlatformCard(req: HttpRequest, res: HttpResponse): Promise<void> {
      try {
        // Check conditional GET
        const etag = discoveryService.getPlatformCardEtag();
        if (handleConditionalGet(req, res, etag)) {
          return;
        }

        const card = await discoveryService.getPlatformCard();
        const newEtag = discoveryService.getPlatformCardEtag();

        setCommonHeaders(res, newEtag);
        res.json(card);
      } catch (error) {
        res.status(500).json(createInternalErrorResponse());
      }
    },

    /**
     * GET /a2a/:agentId/.well-known/agent.json
     * Returns an individual agent card
     */
    async getAgentCard(req: HttpRequest, res: HttpResponse): Promise<void> {
      try {
        const { agentId } = req.params;
        const extended = req.query.extended === 'true';

        // If extended is requested, check authentication
        if (extended) {
          const authReq = req as AuthenticatedRequest;
          if (!authReq.user) {
            res.status(401).json(createAuthRequiredResponse());
            return;
          }
        }

        // Check conditional GET
        const etag = discoveryService.getAgentCardEtag(agentId);
        if (!extended && handleConditionalGet(req, res, etag)) {
          return;
        }

        // Get the appropriate card type
        const card = extended
          ? await discoveryService.getExtendedAgentCard(agentId)
          : await discoveryService.getAgentCard(agentId);

        if (!card) {
          res.status(404).json(createAgentNotFoundResponse(agentId));
          return;
        }

        // For extended cards, don't cache as aggressively
        if (extended) {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'private, max-age=60');
        } else {
          const newEtag = discoveryService.getAgentCardEtag(agentId);
          setCommonHeaders(res, newEtag);
        }

        res.json(card);
      } catch (error) {
        res.status(500).json(createInternalErrorResponse());
      }
    },

    /**
     * GET /a2a/agents
     * Search for agents with optional filters
     */
    async searchAgents(req: HttpRequest, res: HttpResponse): Promise<void> {
      try {
        const criteria: AgentSearchCriteria = {
          capability: req.query.capability as keyof typeof req.query.capability,
          skill: req.query.skill as string | undefined,
          tag: req.query.tag as string | undefined,
          domain: req.query.domain as string | undefined,
          streaming:
            req.query.streaming !== undefined
              ? req.query.streaming === 'true'
              : undefined,
          limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
        };

        const result = await discoveryService.search(criteria);

        setCommonHeaders(res);
        res.json({
          agents: result.agents.map((a) => ({
            name: a.name,
            description: a.description,
            url: a.url,
            version: a.version,
            skills: a.skills.map((s) => s.id),
          })),
          total: result.total,
          criteria: result.criteria,
        });
      } catch (error) {
        res.status(500).json(createInternalErrorResponse());
      }
    },

    /**
     * GET /a2a/agents/:agentId
     * Alias for individual agent card (without .well-known path)
     */
    async getAgentCardAlias(req: HttpRequest, res: HttpResponse): Promise<void> {
      return this.getAgentCard(req, res);
    },

    /**
     * OPTIONS handler for CORS preflight
     */
    handleOptions(req: HttpRequest, res: HttpResponse): void {
      if (enableCors) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        res.setHeader('Access-Control-Max-Age', '86400');
      }
      res.status(204).end();
    },
  };
}

// ============================================================================
// Middleware Helpers
// ============================================================================

/**
 * Default auth middleware (no-op)
 */
function defaultAuthMiddleware(
  req: HttpRequest,
  res: HttpResponse,
  next?: NextFunction
): void {
  if (next) next();
}

/**
 * Conditional authentication middleware
 *
 * Only applies auth middleware if extended=true query parameter is present
 */
function createConditionalAuth(authMiddleware: HttpHandler): HttpHandler {
  return (req: HttpRequest, res: HttpResponse, next?: NextFunction): void => {
    if (req.query.extended === 'true' && authMiddleware) {
      authMiddleware(req, res, next);
    } else {
      if (next) next();
    }
  };
}

// ============================================================================
// Route Factory (Framework-agnostic)
// ============================================================================

/**
 * Get route definitions for A2A agent discovery
 *
 * Returns an array of route definitions that can be used to setup routes
 * in Express or any compatible HTTP framework.
 *
 * @param config - Route configuration
 * @returns Array of route definitions
 *
 * @example
 * ```typescript
 * const routeDefs = getDiscoveryRouteDefinitions({
 *   discoveryService,
 *   authMiddleware: verifyToken,
 * });
 *
 * // Setup in Express
 * for (const route of routeDefs) {
 *   app[route.method](route.path, ...route.handlers);
 * }
 * ```
 */
export function getDiscoveryRouteDefinitions(
  config: DiscoveryRoutesConfig
): RouteDefinition[] {
  const fullConfig: Required<DiscoveryRoutesConfig> = {
    authMiddleware: config.authMiddleware ?? defaultAuthMiddleware,
    ...DEFAULT_ROUTES_CONFIG,
    ...config,
  };

  const handlers = createRouteHandlers(fullConfig);
  const conditionalAuth = createConditionalAuth(fullConfig.authMiddleware);

  return [
    // CORS preflight
    {
      method: 'options',
      path: '/.well-known/agent.json',
      handlers: [handlers.handleOptions.bind(handlers)],
    },
    {
      method: 'options',
      path: '/a2a/:agentId/.well-known/agent.json',
      handlers: [handlers.handleOptions.bind(handlers)],
    },
    {
      method: 'options',
      path: '/a2a/agents',
      handlers: [handlers.handleOptions.bind(handlers)],
    },
    {
      method: 'options',
      path: '/a2a/agents/:agentId',
      handlers: [handlers.handleOptions.bind(handlers)],
    },

    // Platform card
    {
      method: 'get',
      path: '/.well-known/agent.json',
      handlers: [handlers.getPlatformCard.bind(handlers)],
    },

    // Individual agent card (with optional extended)
    {
      method: 'get',
      path: '/a2a/:agentId/.well-known/agent.json',
      handlers: [conditionalAuth, handlers.getAgentCard.bind(handlers)],
    },

    // Search agents
    {
      method: 'get',
      path: '/a2a/agents',
      handlers: [handlers.searchAgents.bind(handlers)],
    },

    // Alias for agent card
    {
      method: 'get',
      path: '/a2a/agents/:agentId',
      handlers: [conditionalAuth, handlers.getAgentCardAlias.bind(handlers)],
    },
  ];
}

/**
 * Create Express routes for A2A agent discovery
 *
 * NOTE: This function requires Express to be installed separately.
 * If Express is not available, use getDiscoveryRouteDefinitions() instead.
 *
 * Registers the following endpoints:
 * - GET /.well-known/agent.json - Platform aggregate card
 * - GET /a2a/:agentId/.well-known/agent.json - Individual agent card
 * - GET /a2a/:agentId/.well-known/agent.json?extended=true - Extended agent card (auth required)
 * - GET /a2a/agents - Search/list agents
 * - GET /a2a/agents/:agentId - Alias for individual agent card
 *
 * @param config - Route configuration
 * @returns Express router (requires express to be installed)
 *
 * @example
 * ```typescript
 * import express from 'express';
 * import { createDiscoveryRoutes } from '@agentic-qe/v3';
 *
 * const app = express();
 * const routes = createDiscoveryRoutes({
 *   discoveryService,
 *   authMiddleware: verifyToken,
 * });
 *
 * app.use(routes);
 * ```
 */
export function createDiscoveryRoutes(
  config: DiscoveryRoutesConfig
): { stack: Array<{ route?: { path?: string } }> } & Record<string, unknown> {
  // Dynamically import express - this allows the module to be loaded
  // even when express is not installed
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const express = require('express');
  const router = express.Router();

  const routeDefs = getDiscoveryRouteDefinitions(config);

  for (const route of routeDefs) {
    router[route.method](route.path, ...route.handlers);
  }

  return router;
}

// ============================================================================
// Standalone Route Functions (for custom router setup)
// ============================================================================

/**
 * Create a standalone platform card handler
 */
export function createPlatformCardHandler(
  discoveryService: DiscoveryService,
  options: { cacheSeconds?: number; enableCors?: boolean } = {}
): HttpHandler {
  const { cacheSeconds = 3600, enableCors = true } = options;

  return async (req: HttpRequest, res: HttpResponse): Promise<void> => {
    try {
      const card = await discoveryService.getPlatformCard();
      const etag = discoveryService.getPlatformCardEtag();

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', `public, max-age=${cacheSeconds}`);

      if (etag) {
        res.setHeader('ETag', etag);
      }

      if (enableCors) {
        res.setHeader('Access-Control-Allow-Origin', '*');
      }

      res.json(card);
    } catch (error) {
      res.status(500).json(createInternalErrorResponse());
    }
  };
}

/**
 * Create a standalone agent card handler
 */
export function createAgentCardHandler(
  discoveryService: DiscoveryService,
  options: { cacheSeconds?: number; enableCors?: boolean } = {}
): HttpHandler {
  const { cacheSeconds = 3600, enableCors = true } = options;

  return async (req: HttpRequest, res: HttpResponse): Promise<void> => {
    try {
      const { agentId } = req.params;

      const card = await discoveryService.getAgentCard(agentId);

      if (!card) {
        res.status(404).json(createAgentNotFoundResponse(agentId));
        return;
      }

      const etag = discoveryService.getAgentCardEtag(agentId);

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', `public, max-age=${cacheSeconds}`);

      if (etag) {
        res.setHeader('ETag', etag);
      }

      if (enableCors) {
        res.setHeader('Access-Control-Allow-Origin', '*');
      }

      res.json(card);
    } catch (error) {
      res.status(500).json(createInternalErrorResponse());
    }
  };
}

/**
 * Create a standalone extended card handler
 */
export function createExtendedCardHandler(
  discoveryService: DiscoveryService,
  authMiddleware: HttpHandler,
  options: { enableCors?: boolean } = {}
): HttpHandler[] {
  const { enableCors = true } = options;

  return [
    authMiddleware,
    async (req: HttpRequest, res: HttpResponse): Promise<void> => {
      try {
        const { agentId } = req.params;
        const authReq = req as AuthenticatedRequest;

        if (!authReq.user) {
          res.status(401).json(createAuthRequiredResponse());
          return;
        }

        const card = await discoveryService.getExtendedAgentCard(agentId);

        if (!card) {
          res.status(404).json(createAgentNotFoundResponse(agentId));
          return;
        }

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'private, max-age=60');

        if (enableCors) {
          res.setHeader('Access-Control-Allow-Origin', '*');
        }

        res.json(card);
      } catch (error) {
        res.status(500).json(createInternalErrorResponse());
      }
    },
  ];
}
