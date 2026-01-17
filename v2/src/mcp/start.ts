#!/usr/bin/env node

/**
 * MCP Server Startup Script for Agentic QE
 * This starts the MCP server that Claude Code can connect to
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { AgenticQEMCPServer } from './server';

async function main() {
  try {
    // Create the MCP server instance
    const aqeServer = new AgenticQEMCPServer();

    // Create stdio transport for Claude Code
    const transport = new StdioServerTransport();

    // Start the server (this blocks until server is stopped)
    await aqeServer.start(transport);

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      await aqeServer.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      await aqeServer.stop();
      process.exit(0);
    });

  } catch (error) {
    console.error('Failed to start MCP server:', error);
    process.exit(1);
  }
}

// Run the server
main().catch(console.error);