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

// Server (legacy)
export { MCPServer, createMCPServer } from './server';
export { default } from './server';

// Transport Layer
export * from './transport';

// Protocol Server (v3 - claude-flow pattern)
export {
  MCPProtocolServer,
  createMCPProtocolServer,
  quickStart,
  type MCPServerConfig,
  type MCPCapabilities,
  type MCPServerInfo,
} from './protocol-server';
