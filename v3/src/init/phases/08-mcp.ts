/**
 * Phase 08: MCP
 * Configures MCP server for Claude Code integration
 *
 * Creates MCP configuration in both locations for compatibility:
 * - .mcp.json (project root) - Claude Code primary location
 * - .claude/mcp.json - Alternative location
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

import {
  BasePhase,
  type InitContext,
} from './phase-interface.js';

export interface MCPResult {
  configured: boolean;
  mcpPath: string;
  serverName: string;
  alternativePath: string;
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
    const aqeServerConfig = {
      command: 'aqe-mcp',
      args: [],
      env: {
        AQE_PROJECT_ROOT: projectRoot,
        AQE_LEARNING_ENABLED: 'true',
        AQE_WORKERS_ENABLED: 'true',
        NODE_ENV: 'production',
      },
    };

    // 1. Write to .mcp.json at project root (Claude Code primary location)
    const rootMcpPath = join(projectRoot, '.mcp.json');
    let rootMcpConfig: Record<string, unknown> = {};

    if (existsSync(rootMcpPath)) {
      try {
        const content = readFileSync(rootMcpPath, 'utf-8');
        rootMcpConfig = JSON.parse(content);
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

    // 2. Also write to .claude/mcp.json for alternative location
    const claudeDir = join(projectRoot, '.claude');
    if (!existsSync(claudeDir)) {
      mkdirSync(claudeDir, { recursive: true });
    }

    const claudeMcpPath = join(claudeDir, 'mcp.json');
    let claudeMcpConfig: Record<string, unknown> = {};

    if (existsSync(claudeMcpPath)) {
      try {
        const content = readFileSync(claudeMcpPath, 'utf-8');
        claudeMcpConfig = JSON.parse(content);
      } catch {
        claudeMcpConfig = {};
      }
    }

    if (!claudeMcpConfig.mcpServers) {
      claudeMcpConfig.mcpServers = {};
    }

    const claudeServers = claudeMcpConfig.mcpServers as Record<string, unknown>;
    claudeServers['agentic-qe'] = aqeServerConfig;

    writeFileSync(claudeMcpPath, JSON.stringify(claudeMcpConfig, null, 2), 'utf-8');

    context.services.log(`  MCP config (primary): ${rootMcpPath}`);
    context.services.log(`  MCP config (alt): ${claudeMcpPath}`);
    context.services.log(`  Server: agentic-qe`);
    context.services.log(`  Learning: enabled`);
    context.services.log(`  Workers: enabled`);

    return {
      configured: true,
      mcpPath: rootMcpPath,
      serverName: 'agentic-qe',
      alternativePath: claudeMcpPath,
    };
  }
}

// Instance exported from index.ts
