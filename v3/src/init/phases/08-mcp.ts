/**
 * Phase 08: MCP
 * Configures MCP server for Claude Code integration
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
}

/**
 * MCP phase - configures MCP server
 */
export class MCPPhase extends BasePhase<MCPResult> {
  readonly name = 'mcp';
  readonly description = 'Configure MCP server';
  readonly order = 80;
  readonly critical = false;
  readonly requiresPhases = ['configuration'] as const;

  protected async run(context: InitContext): Promise<MCPResult> {
    const { projectRoot } = context;

    // Create .claude directory
    const claudeDir = join(projectRoot, '.claude');
    if (!existsSync(claudeDir)) {
      mkdirSync(claudeDir, { recursive: true });
    }

    // Load existing MCP config
    const mcpPath = join(claudeDir, 'mcp.json');
    let mcpConfig: Record<string, unknown> = {};

    if (existsSync(mcpPath)) {
      try {
        const content = readFileSync(mcpPath, 'utf-8');
        mcpConfig = JSON.parse(content);
      } catch {
        mcpConfig = {};
      }
    }

    // Ensure mcpServers object exists
    if (!mcpConfig.mcpServers) {
      mcpConfig.mcpServers = {};
    }

    // Add AQE MCP server configuration
    const servers = mcpConfig.mcpServers as Record<string, unknown>;
    servers['aqe'] = {
      command: 'aqe-mcp',
      args: [],
      env: {
        AQE_PROJECT_ROOT: projectRoot,
        NODE_ENV: 'production',
      },
    };

    // Write MCP config
    writeFileSync(mcpPath, JSON.stringify(mcpConfig, null, 2), 'utf-8');

    context.services.log(`  MCP config: ${mcpPath}`);
    context.services.log(`  Server: aqe`);

    return {
      configured: true,
      mcpPath,
      serverName: 'aqe',
    };
  }
}

// Instance exported from index.ts
