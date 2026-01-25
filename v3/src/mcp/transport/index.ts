/**
 * Agentic QE v3 - MCP Transport Layer
 * Exports all transport implementations
 */

export * from './stdio';

// Transport type enum
export type TransportType = 'stdio' | 'http' | 'websocket';

// Factory for creating transports
import { StdioTransport, TransportConfig, createStdioTransport } from './stdio';

export interface TransportOptions extends TransportConfig {
  type?: TransportType;
}

export function createTransport(options: TransportOptions = {}): StdioTransport {
  const type = options.type ?? 'stdio';

  switch (type) {
    case 'stdio':
      return createStdioTransport(options);
    case 'http':
    case 'websocket':
      // Future: implement HTTP and WebSocket transports
      throw new Error(`Transport type '${type}' not yet implemented`);
    default:
      throw new Error(`Unknown transport type: ${type}`);
  }
}
