/**
 * Agentic QE v3 - MCP Module
 * Model Context Protocol server and tools
 */

// Types
export * from './types';

// Tool Registry
export { ToolRegistry, createToolRegistry } from './tool-registry';

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
