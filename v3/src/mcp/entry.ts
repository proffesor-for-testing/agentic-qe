/**
 * Agentic QE v3 - MCP Server Entry Point
 *
 * Starts the MCP protocol server for stdio communication.
 * Based on claude-flow's MCP pattern.
 *
 * Usage:
 *   npm run mcp
 *   npx tsx src/mcp/entry.ts
 */

import { quickStart, MCPProtocolServer } from './protocol-server';

let server: MCPProtocolServer | null = null;

async function main(): Promise<void> {
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    if (server) {
      await server.stop();
    }
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    if (server) {
      await server.stop();
    }
    process.exit(0);
  });

  // Suppress stderr output in MCP mode (stdio expects clean JSON-RPC)
  const originalStderrWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = ((chunk: string | Uint8Array): boolean => {
    // Only write to stderr if it looks like important error info
    if (typeof chunk === 'string' && chunk.includes('FATAL')) {
      return originalStderrWrite(chunk);
    }
    return true;
  }) as typeof process.stderr.write;

  try {
    // Start the MCP server
    server = await quickStart({
      name: 'agentic-qe-v3',
      version: '3.0.0-alpha.1',
    });

    // Keep the process alive - the server listens on stdin
    // The process will exit when stdin closes or SIGINT/SIGTERM is received
  } catch (error) {
    // Write error to stderr for debugging (won't interfere with JSON-RPC)
    originalStderrWrite(`[MCP Entry] Fatal error: ${error}\n`);
    process.exit(1);
  }
}

main();
