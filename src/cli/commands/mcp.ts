/**
 * MCP Command - Start the MCP Protocol Server
 *
 * This command starts the Agentic QE MCP server for integration with
 * Claude Code, Claude Desktop, and other MCP clients.
 *
 * Usage:
 *   aqe mcp              # Start MCP server on stdio
 *   aqe mcp --http 8080  # Also start HTTP server for AG-UI/A2A
 */

import { Command } from 'commander';
import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';

/**
 * Create the MCP command
 */
export function createMcpCommand(): Command {
  const cmd = new Command('mcp')
    .description('Start the MCP protocol server for Claude Code integration')
    .option('--http <port>', 'Also start HTTP server for AG-UI/A2A protocols', '0')
    .option('--verbose', 'Enable verbose logging')
    .action(async (options) => {
      // Set up environment
      const env: Record<string, string> = {
        ...process.env as Record<string, string>,
        AQE_HTTP_PORT: options.http || '0',
      };

      if (options.verbose) {
        env.AQE_VERBOSE = 'true';
      }

      // Find the MCP entry point
      const entryPath = findMcpEntry();

      if (!entryPath) {
        console.error('Error: Could not find MCP server entry point');
        console.error('Make sure agentic-qe is properly installed');
        process.exit(1);
      }

      // Determine how to run the entry point
      const isBundle = entryPath.endsWith('.js');
      const command = 'node';
      const args = isBundle
        ? [entryPath]
        : ['--import', 'tsx', entryPath];

      // Spawn the MCP server, inheriting stdio for JSON-RPC communication
      const child = spawn(command, args, {
        env,
        stdio: 'inherit',
        cwd: process.cwd(),
      });

      child.on('error', (error) => {
        console.error('Failed to start MCP server:', error.message);
        process.exit(1);
      });

      child.on('exit', (code) => {
        process.exit(code ?? 0);
      });

      // Forward signals to child
      process.on('SIGINT', () => child.kill('SIGINT'));
      process.on('SIGTERM', () => child.kill('SIGTERM'));
    });

  return cmd;
}

/**
 * Find the MCP entry point
 * Looks in multiple locations for the compiled or source entry
 */
function findMcpEntry(): string | null {
  // Get the directory of this file
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);

  // Paths to check, in order of preference:
  const candidates = [
    // 1. Bundled dist (production)
    join(__dirname, '..', '..', 'mcp', 'bundle.js'),
    // 2. Compiled dist
    join(__dirname, '..', '..', 'mcp', 'entry.js'),
    // 3. Source (development with tsx)
    join(__dirname, '..', '..', 'mcp', 'entry.ts'),
    // 4. From node_modules (when used as dependency)
    join(process.cwd(), 'node_modules', 'agentic-qe', 'v3', 'dist', 'mcp', 'bundle.js'),
    join(process.cwd(), 'node_modules', 'agentic-qe', 'v3', 'dist', 'mcp', 'entry.js'),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

export default createMcpCommand;
