/**
 * Agentic QE v3 - MCP Module
 * Model Context Protocol server and tools
 */

// Types
export * from './types';

// Tool Registry (O(1) hash-indexed lookup via Map)
export { ToolRegistry, createToolRegistry } from './tool-registry';

// Connection Pool (ADR-039)
export {
  getConnectionPool,
  initializeConnectionPool,
  shutdownConnectionPool,
  createConnectionPool,
  type PoolConnection,
  type ConnectionMetrics,
  type ConnectionPoolConfig,
  type PoolStats,
  DEFAULT_POOL_CONFIG,
} from './connection-pool';

// Load Balancer (ADR-039)
export {
  getLoadBalancer,
  resetLoadBalancer,
  createLoadBalancer,
  type AgentLoadInfo,
  type LoadBalancingStrategy,
  type LoadBalancerConfig,
  type LoadBalancerStats,
  DEFAULT_LOAD_BALANCER_CONFIG,
} from './load-balancer';

// Performance Monitor (ADR-039)
export {
  getPerformanceMonitor,
  resetPerformanceMonitor,
  createPerformanceMonitor,
  type LatencySample,
  type ToolExecutionMetric,
  type PoolMetric,
  type PerformanceAlert,
  type PerformanceReport,
  type PerformanceMonitorConfig,
  DEFAULT_MONITOR_CONFIG,
} from './performance-monitor';

// Handlers
export * from './handlers';

// Transport Layer
export * from './transport';

// Protocol Server (production MCP server)
export {
  MCPProtocolServer,
  createMCPProtocolServer,
  quickStart,
  type MCPServerConfig,
  type MCPCapabilities,
  type MCPServerInfo,
} from './protocol-server';

// Legacy aliases — server.ts was removed (dead code, never used in production).
// MCPProtocolServer is the only server. These aliases prevent import breakage.
export { MCPProtocolServer as MCPServer } from './protocol-server';
export { createMCPProtocolServer as createMCPServer } from './protocol-server';

// Per-Agent Tool Scoping
export {
  isToolAllowed,
  getToolScope,
  getAllowedTools,
  validateToolAccess,
  type AgentRole,
  type ToolScope,
} from './tool-scoping';
