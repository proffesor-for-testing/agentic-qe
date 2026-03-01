/**
 * Universal Platform Config Generator
 * Generates MCP configs and behavioral rules for all supported coding agent platforms.
 *
 * Supports: GitHub Copilot, Cursor, Cline, Kilo Code, Roo Code, OpenAI Codex, Windsurf, Continue.dev
 */

// ============================================================================
// Types
// ============================================================================

export type PlatformId =
  | 'copilot'
  | 'cursor'
  | 'cline'
  | 'kilocode'
  | 'roocode'
  | 'codex'
  | 'windsurf'
  | 'continuedev';

export interface PlatformDefinition {
  id: PlatformId;
  name: string;
  configPath: string;
  configFormat: 'json' | 'toml' | 'yaml';
  configKey: string;
  rulesPath: string;
  rulesFormat: 'markdown' | 'json' | 'yaml' | 'toml';
  supportsAutoApprove: boolean;
  supportsCustomModes: boolean;
  globalConfig: boolean;
}

export interface GeneratedConfig {
  path: string;
  content: string;
  format: string;
}

// ============================================================================
// Platform Registry
// ============================================================================

export const PLATFORM_REGISTRY: Record<PlatformId, PlatformDefinition> = {
  copilot: {
    id: 'copilot',
    name: 'GitHub Copilot',
    configPath: '.vscode/mcp.json',
    configFormat: 'json',
    configKey: 'servers',
    rulesPath: '.github/copilot-instructions.md',
    rulesFormat: 'markdown',
    supportsAutoApprove: false,
    supportsCustomModes: false,
    globalConfig: false,
  },
  cursor: {
    id: 'cursor',
    name: 'Cursor',
    configPath: '.cursor/mcp.json',
    configFormat: 'json',
    configKey: 'mcpServers',
    rulesPath: '.cursorrules',
    rulesFormat: 'markdown',
    supportsAutoApprove: false,
    supportsCustomModes: false,
    globalConfig: false,
  },
  cline: {
    id: 'cline',
    name: 'Cline',
    configPath: '.vscode/cline_mcp_settings.json',
    configFormat: 'json',
    configKey: 'mcpServers',
    rulesPath: '.vscode/cline_custom_modes.json',
    rulesFormat: 'json',
    supportsAutoApprove: true,
    supportsCustomModes: true,
    globalConfig: false,
  },
  kilocode: {
    id: 'kilocode',
    name: 'Kilo Code',
    configPath: '.kilocode/mcp.json',
    configFormat: 'json',
    configKey: 'mcpServers',
    rulesPath: '.kilocode/modes.json',
    rulesFormat: 'json',
    supportsAutoApprove: true,
    supportsCustomModes: true,
    globalConfig: false,
  },
  roocode: {
    id: 'roocode',
    name: 'Roo Code',
    configPath: '.roo/mcp.json',
    configFormat: 'json',
    configKey: 'mcpServers',
    rulesPath: '.roo/modes.json',
    rulesFormat: 'json',
    supportsAutoApprove: true,
    supportsCustomModes: true,
    globalConfig: false,
  },
  codex: {
    id: 'codex',
    name: 'OpenAI Codex CLI',
    configPath: '.codex/config.toml',
    configFormat: 'toml',
    configKey: 'mcp_servers',
    rulesPath: 'AGENTS.md',
    rulesFormat: 'markdown',
    supportsAutoApprove: false,
    supportsCustomModes: false,
    globalConfig: false,
  },
  windsurf: {
    id: 'windsurf',
    name: 'Windsurf',
    configPath: '.windsurf/mcp_config.json',
    configFormat: 'json',
    configKey: 'mcpServers',
    rulesPath: '.windsurfrules',
    rulesFormat: 'markdown',
    supportsAutoApprove: false,
    supportsCustomModes: false,
    globalConfig: false,
  },
  continuedev: {
    id: 'continuedev',
    name: 'Continue.dev',
    configPath: '.continue/config.yaml',
    configFormat: 'yaml',
    configKey: 'mcpServers',
    rulesPath: '.continue/rules/aqe-qe-standards.yaml',
    rulesFormat: 'yaml',
    supportsAutoApprove: false,
    supportsCustomModes: false,
    globalConfig: false,
  },
};

// ============================================================================
// Safe Auto-Approve Tool List
// ============================================================================

const SAFE_AUTO_APPROVE_TOOLS = [
  'fleet_init',
  'fleet_status',
  'fleet_health',
  'agent_list',
  'agent_metrics',
  'agent_status',
  'team_list',
  'team_health',
  'task_list',
  'task_status',
  'test_generate_enhanced',
  'coverage_analyze_sublinear',
  'quality_assess',
  'defect_predict',
  'code_index',
  'memory_store',
  'memory_retrieve',
  'memory_query',
  'memory_usage',
  'model_route',
  'routing_metrics',
  'aqe_health',
];

// ============================================================================
// MCP Server Entry
// ============================================================================

function getMcpServerEntry(withAutoApprove: boolean): Record<string, unknown> {
  const entry: Record<string, unknown> = {
    command: 'npx',
    args: ['-y', 'agentic-qe@latest', 'mcp'],
    env: {
      AQE_MEMORY_PATH: '.agentic-qe/memory.db',
      AQE_V3_MODE: 'true',
    },
  };

  if (withAutoApprove) {
    entry.disabled = false;
    entry.alwaysAllow = SAFE_AUTO_APPROVE_TOOLS;
  }

  return entry;
}

// ============================================================================
// Config Generators
// ============================================================================

function generateJsonConfig(platform: PlatformDefinition): string {
  const serverEntry = getMcpServerEntry(platform.supportsAutoApprove);

  if (platform.id === 'copilot') {
    // Copilot uses "servers" key with "type": "stdio"
    const config = {
      [platform.configKey]: {
        'agentic-qe': {
          type: 'stdio',
          ...serverEntry,
        },
      },
    };
    return JSON.stringify(config, null, 2) + '\n';
  }

  const config = {
    [platform.configKey]: {
      'agentic-qe': serverEntry,
    },
  };
  return JSON.stringify(config, null, 2) + '\n';
}

function generateTomlConfig(): string {
  return `# Agentic QE MCP Server
[mcp_servers.agentic-qe]
type = "stdio"
command = "npx"
args = ["-y", "agentic-qe@latest", "mcp"]

[mcp_servers.agentic-qe.env]
AQE_MEMORY_PATH = ".agentic-qe/memory.db"
AQE_V3_MODE = "true"
`;
}

function generateYamlConfig(): string {
  return `# Agentic QE MCP Server
mcpServers:
  - name: agentic-qe
    command: npx
    args:
      - "-y"
      - agentic-qe@latest
      - mcp
    env:
      AQE_MEMORY_PATH: .agentic-qe/memory.db
      AQE_V3_MODE: "true"
`;
}

// ============================================================================
// Behavioral Rules Content
// ============================================================================

const AQE_RULES_CONTENT = `# Quality Engineering Standards (Agentic QE)

## AQE MCP Server

This project uses Agentic QE for AI-powered quality engineering. The AQE MCP server provides tools for test generation, coverage analysis, quality assessment, and learning.

## Setup

Always call \`fleet_init\` before using other AQE tools to initialize the QE fleet.

## Available Tools

### Test Generation
- \`test_generate_enhanced\` — AI-powered test generation with pattern recognition and anti-pattern detection
- Supports unit, integration, and e2e test types

### Coverage Analysis
- \`coverage_analyze_sublinear\` — O(log n) coverage gap detection with ML-powered analysis
- Target: 80% statement coverage minimum, focus on risk-weighted coverage

### Quality Assessment
- \`quality_assess\` — Quality gate evaluation with configurable thresholds
- Run before marking tasks complete

### Security Scanning
- \`security_scan_comprehensive\` — SAST/DAST vulnerability scanning
- Run after changes to auth, security, or middleware code

### Defect Prediction
- \`defect_predict\` — AI analysis of code complexity and change history

### Learning & Memory
- \`memory_store\` — Store patterns and learnings for future reference
- \`memory_query\` — Query past patterns before starting work
- Always store successful patterns after task completion

## Best Practices

1. **Test Pyramid**: 70% unit, 20% integration, 10% e2e
2. **AAA Pattern**: Arrange-Act-Assert for clear test structure
3. **One assertion per test**: Test one behavior at a time
4. **Descriptive names**: \`should_returnValue_when_condition\`
5. **Mock at boundaries**: Only mock external dependencies
6. **Edge cases first**: Test boundary conditions, not just happy paths
`;

function generateCustomModeJson(platformName: string): string {
  const mode = {
    slug: 'qe-engineer',
    name: 'QE Engineer',
    roleDefinition: 'You are a Quality Engineering specialist powered by Agentic QE. Use AQE MCP tools for test generation, coverage analysis, quality assessment, and security scanning. Always call fleet_init before using other AQE tools.',
    groups: ['read', 'edit', 'browser', 'command', 'mcp'],
    customInstructions: `Follow the test pyramid: 70% unit, 20% integration, 10% e2e. Use boundary value analysis and equivalence partitioning for test design. Always run quality_assess before marking work complete. Store learned patterns with memory_store for future reference.`,
  };
  return JSON.stringify([mode], null, 2) + '\n';
}

// ============================================================================
// PlatformConfigGenerator Class
// ============================================================================

export class PlatformConfigGenerator {
  /**
   * Get the platform definition for a given platform ID
   */
  getPlatform(platformId: PlatformId): PlatformDefinition {
    const platform = PLATFORM_REGISTRY[platformId];
    if (!platform) {
      throw new Error(`Unknown platform: ${platformId}`);
    }
    return platform;
  }

  /**
   * Get all supported platform IDs
   */
  getAllPlatformIds(): PlatformId[] {
    return Object.keys(PLATFORM_REGISTRY) as PlatformId[];
  }

  /**
   * Generate the MCP config for a platform
   */
  generateMcpConfig(platformId: PlatformId): GeneratedConfig {
    const platform = this.getPlatform(platformId);

    let content: string;
    switch (platform.configFormat) {
      case 'toml':
        content = generateTomlConfig();
        break;
      case 'yaml':
        content = generateYamlConfig();
        break;
      case 'json':
      default:
        content = generateJsonConfig(platform);
        break;
    }

    return {
      path: platform.configPath,
      content,
      format: platform.configFormat,
    };
  }

  /**
   * Generate behavioral rules / instruction file for a platform
   */
  generateBehavioralRules(platformId: PlatformId): GeneratedConfig {
    const platform = this.getPlatform(platformId);

    let content: string;
    switch (platform.rulesFormat) {
      case 'json':
        content = generateCustomModeJson(platform.name);
        break;
      case 'yaml':
        content = `# AQE Quality Engineering Rules\n${AQE_RULES_CONTENT}`;
        break;
      case 'markdown':
      default:
        content = AQE_RULES_CONTENT;
        break;
    }

    return {
      path: platform.rulesPath,
      content,
      format: platform.rulesFormat,
    };
  }

  /**
   * Get the safe auto-approve tool list
   */
  getAutoApproveTools(): string[] {
    return [...SAFE_AUTO_APPROVE_TOOLS];
  }
}

/**
 * Create a new PlatformConfigGenerator instance
 */
export function createPlatformConfigGenerator(): PlatformConfigGenerator {
  return new PlatformConfigGenerator();
}
