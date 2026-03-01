/**
 * @agentic-qe/opencode-bridge
 * Bridge between AQE MCP server and OpenCode.
 *
 * This package provides:
 * - OpenCode config generation from AQE tool registry
 * - Tool name mapping (AQE naming -> OpenCode display)
 * - Output compaction for token-limited contexts
 * - Template loading for opencode.json
 */

import * as fs from 'fs';
import * as path from 'path';

export {
  OpenCodeAgentConfig,
  OpenCodeSkillConfig,
  OpenCodeToolConfig,
  AQEPluginConfig,
  ModelTier,
} from '@agentic-qe/opencode-types';

// Skill tier registry
export {
  getSkillTier,
  getAllSkillTiers,
  getSkillsByTier,
  getBlockedSkills,
  getSkillTierSummary,
  canSkillRunOnTier,
  TIER_RANK,
} from './skill-tier-registry.js';

export interface BridgeOptions {
  /** Path to opencode.json template */
  templatePath?: string;
  /** AQE MCP server URL or command */
  mcpEndpoint?: string;
}

export interface BridgeStatus {
  initialized: boolean;
  skillCount: number;
  tierBreakdown: {
    tier1: number;
    tier2: number;
    tier3: number;
  };
  mcpEndpoint: string;
  templateValid: boolean;
}

/**
 * Initialize the AQE-OpenCode bridge.
 * Validates the template, loads skill tier summary, and returns bridge status.
 */
export async function initBridge(options?: BridgeOptions): Promise<BridgeStatus> {
  const templatePath = options?.templatePath ?? path.resolve(__dirname, '../templates/opencode.json');
  const mcpEndpoint = options?.mcpEndpoint ?? 'npx agentic-qe mcp';

  // Validate template exists and is valid JSON
  let templateValid = false;
  try {
    if (fs.existsSync(templatePath)) {
      const content = fs.readFileSync(templatePath, 'utf-8');
      JSON.parse(content);
      templateValid = true;
    }
  } catch {
    templateValid = false;
  }

  // Load skill tier summary
  const { getSkillTierSummary: getSummary } = await import('./skill-tier-registry.js');
  const summary = getSummary();

  return {
    initialized: true,
    skillCount: summary.total,
    tierBreakdown: {
      tier1: summary.tier1Count,
      tier2: summary.tier2Count,
      tier3: summary.tier3Count,
    },
    mcpEndpoint,
    templateValid,
  };
}
