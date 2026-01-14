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
  process.stderr.write = ((chunk: string | Uint8Array): boolean => {
    // Only write to stderr if it looks like important error info
    if (typeof chunk === 'string' && (chunk.includes('FATAL') || chunk.includes('[MCP]'))) {
      return originalStderrWrite(chunk);
    }
    return true;
  }) as typeof process.stderr.write;

  try {
    // ADR-042: Initialize token tracking and optimization
    await bootstrapTokenTracking({
      enableOptimization: true,
      enablePersistence: true,
      verbose: process.env.AQE_VERBOSE === 'true',
    });

    // Start the MCP server
    server = await quickStart({
      name: 'agentic-qe-v3',
      version,
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
