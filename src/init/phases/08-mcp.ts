/**
 * Phase 08: MCP
 * Configures MCP server for Claude Code integration
 *
 * Writes MCP configuration to .mcp.json (project root) — the only
 * location Claude Code reads. Does NOT write to .claude/mcp.json
 * to avoid confusing duplication (#321).
 *
 * AQE_PROJECT_ROOT is intentionally omitted from env — the MCP server
 * discovers the project root at runtime via findProjectRoot() which
 * walks up looking for .agentic-qe/, .git/, or package.json. This
 * makes the config portable across machines, devcontainers, and CI.
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { safeJsonParse } from '../../shared/safe-json.js';

import {
  BasePhase,
  type InitContext,
} from './phase-interface.js';

export interface MCPResult {
  configured: boolean;
  mcpPath: string;
  serverName: string;
}

/**
 * MCP phase - configures MCP server
 */
export class MCPPhase extends BasePhase<MCPResult> {
  readonly name = 'mcp';
  readonly description = 'Configure MCP server';
  readonly order = 80;
  readonly critical = false;
  readonly requiresPhases = ['configuration', 'database'] as const;

  protected async run(context: InitContext): Promise<MCPResult> {
    const { projectRoot } = context;

    // AQE MCP server configuration
    // AQE_PROJECT_ROOT omitted — runtime discovery via findProjectRoot() is
    // portable across machines, devcontainers, and CI (#321)
    const aqeServerConfig = {
      command: 'aqe-mcp',
      args: [],
      env: {
        AQE_LEARNING_ENABLED: 'true',
        AQE_WORKERS_ENABLED: 'true',
        NODE_ENV: 'production',
      },
    };

    // Write to .mcp.json at project root (the only location Claude Code reads)
    const rootMcpPath = join(projectRoot, '.mcp.json');
    let rootMcpConfig: Record<string, unknown> = {};

    if (existsSync(rootMcpPath)) {
      try {
        const content = readFileSync(rootMcpPath, 'utf-8');
        rootMcpConfig = safeJsonParse<Record<string, unknown>>(content);
      } catch {
        rootMcpConfig = {};
      }
    }

    if (!rootMcpConfig.mcpServers) {
      rootMcpConfig.mcpServers = {};
    }

    const rootServers = rootMcpConfig.mcpServers as Record<string, unknown>;
    rootServers['agentic-qe'] = aqeServerConfig;

    writeFileSync(rootMcpPath, JSON.stringify(rootMcpConfig, null, 2), 'utf-8');

    context.services.log(`  MCP config: ${rootMcpPath}`);
    context.services.log(`  Server: agentic-qe`);
    context.services.log(`  Learning: enabled`);
    context.services.log(`  Workers: enabled`);

    return {
      configured: true,
      mcpPath: rootMcpPath,
      serverName: 'agentic-qe',
    };
  }
}

// Instance exported from index.ts
