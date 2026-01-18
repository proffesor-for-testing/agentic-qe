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
import { createRequire } from 'module';
import { bootstrapTokenTracking, shutdownTokenTracking } from '../init/token-bootstrap.js';

const require = createRequire(import.meta.url);
const pkg = require('../../package.json') as { version: string };

let server: MCPProtocolServer | null = null;

async function main(): Promise<void> {
  // Output startup message BEFORE suppressing stderr (Claude Code health check needs this)
  const version = pkg.version;
  process.stderr.write(`[agentic-qe-v3] MCP server starting v${version}\n`);

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    await shutdownTokenTracking();
    if (server) {
      await server.stop();
    }
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await shutdownTokenTracking();
    if (server) {
      await server.stop();
    }
    process.exit(0);
  });

  // Suppress stderr output in MCP mode (stdio expects clean JSON-RPC)
  // This must come AFTER the startup message for Claude Code health checks
  const originalStderrWrite = process.stderr.write.bind(process.stderr);
  // Allow more message types through for better debugging
  const allowedPatterns = ['FATAL', '[MCP]', 'ERROR', 'WARN', '[AQE]', 'Deprecation'];
  process.stderr.write = ((chunk: string | Uint8Array): boolean => {
    // Only write to stderr if it matches allowed patterns
    if (typeof chunk === 'string') {
      if (allowedPatterns.some(pattern => chunk.includes(pattern))) {
        return originalStderrWrite(chunk);
      }
    }
    return true;
  }) as typeof process.stderr.write;

  try {
    // ADR-042: Initialize token tracking and optimization
    originalStderrWrite('[MCP] Initializing token tracking...\n');
    await bootstrapTokenTracking({
      enableOptimization: true,
      enablePersistence: true,
      verbose: process.env.AQE_VERBOSE === 'true',
    });

    // Start the MCP server
    originalStderrWrite('[MCP] Starting server...\n');
    server = await quickStart({
      name: 'agentic-qe-v3',
      version,
    });
    originalStderrWrite('[MCP] Ready\n');

    // Keep the process alive - the server listens on stdin
    // The process will exit when stdin closes or SIGINT/SIGTERM is received
  } catch (error) {
    // Write error to stderr for debugging (won't interfere with JSON-RPC)
    originalStderrWrite(`[MCP Entry] Fatal error: ${error}\n`);
    process.exit(1);
  }
}

main();
