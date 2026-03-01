/**
 * A2A Discovery Module
 *
 * Provides RFC 8615 compliant agent discovery for A2A Protocol.
 * Includes discovery service, Express-compatible routes, hot-reload,
 * health checking, and metrics collection.
 *
 * @module adapters/a2a/discovery
 * @see https://tools.ietf.org/html/rfc8615
 * @see https://a2a-protocol.org/latest/topics/agent-discovery/
 */

// ============================================================================
// Discovery Service
// ============================================================================

export {
  // Service Class
  DiscoveryService,
  createDiscoveryService,

  // Configuration
  type DiscoveryServiceConfig,
  DEFAULT_DISCOVERY_CONFIG,

  // Search Types
  type AgentSearchCriteria,
  type AgentSearchResult,

  // Metrics Types
  type CardAccessMetrics,

  // Extended Card Types
  type RateLimitInfo,
  type UsageStats,
  type ExtendedCardData,
} from './discovery-service.js';

// ============================================================================
// Express-Compatible Routes
// ============================================================================

export {
  // Route Factory
  createDiscoveryRoutes,
  getDiscoveryRouteDefinitions,

  // Route Configuration
  type DiscoveryRoutesConfig,
  DEFAULT_ROUTES_CONFIG,

  // HTTP Types (Express-compatible)
  type HttpRequest,
  type HttpResponse,
  type NextFunction,
  type HttpHandler,
  type RouteDefinition,

  // Types
  type AuthMiddleware,
  type AuthenticatedRequest,
  type A2AErrorResponse,

  // Error Response Factories
  createAgentNotFoundResponse,
  createAuthRequiredResponse,
  createInternalErrorResponse,

  // Standalone Handlers
  createPlatformCardHandler,
  createAgentCardHandler,
  createExtendedCardHandler,
} from './routes.js';

// ============================================================================
// File Watcher
// ============================================================================

export {
  // Class
  AgentFileWatcher,
  createAgentFileWatcher,

  // Configuration
  type FileWatcherConfig,
  DEFAULT_FILE_WATCHER_CONFIG,

  // Types
  type FileEvent,
  type FileChangeEvent,
  type WatcherStatus,
  type FileWatcherEvents,
} from './file-watcher.js';

// ============================================================================
// Hot Reload Service
// ============================================================================

export {
  // Class
  HotReloadService,
  createHotReloadService,

  // Configuration
  type HotReloadServiceConfig,
  DEFAULT_HOT_RELOAD_CONFIG,

  // Types
  type HotReloadEvent,
  type HotReloadStatus,
  type ReloadResult,
  type HotReloadEvents,
} from './hot-reload-service.js';

// ============================================================================
// Agent Health Checker
// ============================================================================

export {
  // Class
  AgentHealthChecker,
  createAgentHealthChecker,

  // Configuration
  type HealthCheckConfig,
  DEFAULT_HEALTH_CHECK_CONFIG,

  // Types
  type HealthStatus,
  type AgentHealthStatus,
  type HealthCheckResult,
  type PeriodicCheckConfig,
  type HealthSummary,
  type HealthCheckerEvents,
} from './agent-health.js';

// ============================================================================
// Metrics
// ============================================================================

export {
  // Class
  MetricsCollector,
  createMetricsCollector,

  // Global Metrics
  getGlobalMetrics,
  resetGlobalMetrics,

  // Configuration
  type MetricsCollectorConfig,
  DEFAULT_METRICS_CONFIG,

  // Types
  type MetricType,
  type MetricLabels,
  type DiscoveryMetrics,
} from './metrics.js';
