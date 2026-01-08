/**
 * MCP Adapter - Adapts V2 MCP tool calls to V3 format
 */

import { MCPToolMapping, MCPResolution } from './types';
import { AgentMapper } from './agent-mapper';

/**
 * V2 to V3 MCP tool mappings
 */
const MCP_MAPPINGS: MCPToolMapping[] = [
  // Test generation tools
  {
    v2Tool: 'mcp__agentic-qe__test_generate_enhanced',
    v3Tool: 'mcp__agentic-qe__v3_test_generate',
    paramMapping: {
      sourceCode: 'sourceCode',
      language: 'language',
      testType: 'testType',
      coverageGoal: 'coverageTarget',
    },
    deprecated: true,
  },

  // Test execution tools
  {
    v2Tool: 'mcp__agentic-qe__test_execute',
    v3Tool: 'mcp__agentic-qe__v3_test_execute',
    paramMapping: {
      testSuites: 'testSuites',
      parallelExecution: 'parallel',
      retryCount: 'maxRetries',
    },
    deprecated: true,
  },
  {
    v2Tool: 'mcp__agentic-qe__test_execute_parallel',
    v3Tool: 'mcp__agentic-qe__v3_test_execute',
    paramMapping: {
      testFiles: 'testSuites',
      parallelism: 'workers',
      maxRetries: 'maxRetries',
    },
    deprecated: true,
  },

  // Fleet/Agent tools
  {
    v2Tool: 'mcp__agentic-qe__fleet_init',
    v3Tool: 'mcp__agentic-qe__v3_fleet_init',
    deprecated: true,
  },
  {
    v2Tool: 'mcp__agentic-qe__agent_spawn',
    v3Tool: 'mcp__agentic-qe__v3_agent_spawn',
    paramMapping: {
      type: 'agentType',
      capabilities: 'capabilities',
    },
    deprecated: true,
  },
  {
    v2Tool: 'mcp__agentic-qe__fleet_status',
    v3Tool: 'mcp__agentic-qe__v3_fleet_status',
    deprecated: true,
  },

  // Memory tools
  {
    v2Tool: 'mcp__agentic-qe__memory_store',
    v3Tool: 'mcp__agentic-qe__v3_memory_store',
    deprecated: true,
  },
  {
    v2Tool: 'mcp__agentic-qe__memory_retrieve',
    v3Tool: 'mcp__agentic-qe__v3_memory_retrieve',
    deprecated: true,
  },
  {
    v2Tool: 'mcp__agentic-qe__memory_query',
    v3Tool: 'mcp__agentic-qe__v3_memory_query',
    deprecated: true,
  },

  // Task orchestration
  {
    v2Tool: 'mcp__agentic-qe__task_orchestrate',
    v3Tool: 'mcp__agentic-qe__v3_task_orchestrate',
    deprecated: true,
  },
  {
    v2Tool: 'mcp__agentic-qe__task_status',
    v3Tool: 'mcp__agentic-qe__v3_task_status',
    deprecated: true,
  },

  // Report generation
  {
    v2Tool: 'mcp__agentic-qe__test_report_comprehensive',
    v3Tool: 'mcp__agentic-qe__v3_test_report',
    deprecated: true,
  },
];

/**
 * MCP Adapter class for V2 to V3 tool call translation
 */
export class MCPAdapter {
  private mappings: Map<string, MCPToolMapping>;
  private agentMapper: AgentMapper;

  constructor(agentMapper: AgentMapper) {
    this.agentMapper = agentMapper;
    this.mappings = new Map();

    for (const mapping of MCP_MAPPINGS) {
      this.mappings.set(mapping.v2Tool.toLowerCase(), mapping);
    }
  }

  /**
   * Resolve an MCP tool call from v2 to v3 format
   */
  resolve(
    toolName: string,
    params: Record<string, unknown> = {}
  ): MCPResolution {
    const normalized = toolName.toLowerCase();

    // Already v3 format
    if (normalized.includes('__v3_')) {
      return {
        resolved: true,
        v3Tool: toolName,
        v3Params: params,
        wasV2: false,
      };
    }

    // Try to find mapping
    const mapping = this.mappings.get(normalized);
    if (mapping) {
      const v3Params = this.translateParams(params, mapping.paramMapping);

      // Handle agent type translation in params
      if (v3Params.agentType && typeof v3Params.agentType === 'string') {
        const agentResolution = this.agentMapper.resolve(
          v3Params.agentType as string
        );
        if (agentResolution.resolved && agentResolution.v3Agent) {
          v3Params.agentType = agentResolution.v3Agent;
        }
      }

      return {
        resolved: true,
        v3Tool: mapping.v3Tool,
        v3Params,
        wasV2: true,
        deprecationWarning: `MCP tool "${toolName}" is deprecated. Use "${mapping.v3Tool}" instead.`,
      };
    }

    return {
      resolved: false,
      v3Tool: null,
      v3Params: params,
      wasV2: false,
    };
  }

  /**
   * Translate v2 parameters to v3 format
   */
  private translateParams(
    params: Record<string, unknown>,
    mapping?: Record<string, string>
  ): Record<string, unknown> {
    if (!mapping) return { ...params };

    const translated: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(params)) {
      const newKey = mapping[key] || key;
      translated[newKey] = value;
    }

    return translated;
  }

  /**
   * Check if a tool name is v2 format
   */
  isV2Tool(toolName: string): boolean {
    const normalized = toolName.toLowerCase();
    return (
      normalized.includes('mcp__agentic-qe__') &&
      !normalized.includes('__v3_') &&
      this.mappings.has(normalized)
    );
  }

  /**
   * Get all MCP mappings
   */
  getAllMappings(): MCPToolMapping[] {
    return MCP_MAPPINGS;
  }

  /**
   * Forward a v2 tool call to v3 implementation
   */
  async forward(
    toolName: string,
    params: Record<string, unknown>,
    v3Handler: (
      tool: string,
      params: Record<string, unknown>
    ) => Promise<unknown>
  ): Promise<unknown> {
    const resolution = this.resolve(toolName, params);

    if (!resolution.resolved || !resolution.v3Tool) {
      throw new Error(`Unknown MCP tool: ${toolName}`);
    }

    if (resolution.deprecationWarning) {
      console.warn(`[AQE Deprecation] ${resolution.deprecationWarning}`);
    }

    return v3Handler(resolution.v3Tool, resolution.v3Params);
  }

  /**
   * Generate MCP migration guide
   */
  generateMigrationGuide(): string {
    let guide = '# MCP Tool Migration Guide\n\n';
    guide += '| V2 Tool | V3 Tool |\n';
    guide += '|---------|----------|\n';

    for (const mapping of MCP_MAPPINGS) {
      guide += `| \`${mapping.v2Tool}\` | \`${mapping.v3Tool}\` |\n`;
    }

    return guide;
  }
}
