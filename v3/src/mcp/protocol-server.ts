/**
 * Agentic QE v3 - MCP Protocol Server
 * Full MCP 2025-11-25 protocol implementation with stdio transport
 * Based on claude-flow MCP implementation
 */

import {
  StdioTransport,
  createStdioTransport,
  JSONRPCRequest,
  JSON_RPC_ERRORS,
} from './transport';
import { ToolRegistry, createToolRegistry } from './tool-registry';
import { ToolDefinition } from './types';
import {
  handleFleetInit,
  handleFleetStatus,
  handleFleetHealth,
  disposeFleet,
  handleTaskSubmit,
  handleTaskList,
  handleTaskStatus,
  handleTaskCancel,
  handleTaskOrchestrate,
  handleAgentList,
  handleAgentSpawn,
  handleAgentMetrics,
  handleAgentStatus,
  handleTestGenerate,
  handleTestExecute,
  handleCoverageAnalyze,
  handleQualityAssess,
  handleSecurityScan,
  handleContractValidate,
  handleAccessibilityTest,
  handleChaosTest,
  handleDefectPredict,
  handleRequirementsValidate,
  handleCodeIndex,
  handleMemoryStore,
  handleMemoryRetrieve,
  handleMemoryQuery,
  handleMemoryDelete,
  handleMemoryUsage,
  handleMemoryShare,
} from './handlers';

// ============================================================================
// Types
// ============================================================================

export interface MCPServerConfig {
  name?: string;
  version?: string;
  transport?: 'stdio' | 'http' | 'websocket';
  maxRequestSize?: number;
}

export interface MCPCapabilities {
  tools?: { listChanged?: boolean };
  resources?: { subscribe?: boolean; listChanged?: boolean };
  prompts?: { listChanged?: boolean };
  logging?: Record<string, unknown>;
}

export interface MCPServerInfo {
  name: string;
  version: string;
  protocolVersion: string;
}

interface ToolEntry {
  definition: ToolDefinition;
  handler: (params: Record<string, unknown>) => Promise<unknown>;
}

// ============================================================================
// MCP Protocol Server
// ============================================================================

export class MCPProtocolServer {
  private readonly config: Required<MCPServerConfig>;
  private readonly transport: StdioTransport;
  private readonly registry: ToolRegistry;
  private readonly tools: Map<string, ToolEntry> = new Map();
  private initialized = false;
  private clientInfo: { name: string; version: string } | null = null;

  constructor(config: MCPServerConfig = {}) {
    this.config = {
      name: config.name ?? 'agentic-qe-v3',
      version: config.version ?? '3.0.0',
      transport: config.transport ?? 'stdio',
      maxRequestSize: config.maxRequestSize ?? 10 * 1024 * 1024,
    };

    this.transport = createStdioTransport({
      maxMessageSize: this.config.maxRequestSize,
    });

    this.registry = createToolRegistry();

    // Register all tools
    this.registerAllTools();
  }

  /**
   * Start the MCP server
   */
  async start(): Promise<void> {
    // Set up request handler
    this.transport.onRequest(async (request) => {
      return this.handleRequest(request);
    });

    // Set up notification handler
    this.transport.onNotification(async (notification) => {
      await this.handleNotification(notification);
    });

    // Start transport
    this.transport.start();

    // Log startup
    console.error(`[MCP] ${this.config.name} v${this.config.version} started`);
  }

  /**
   * Stop the MCP server
   */
  async stop(): Promise<void> {
    this.transport.stop();
    await disposeFleet();
    console.error('[MCP] Server stopped');
  }

  /**
   * Get server capabilities
   */
  getCapabilities(): MCPCapabilities {
    return {
      tools: { listChanged: true },
      logging: {},
    };
  }

  /**
   * Get server info
   */
  getServerInfo(): MCPServerInfo {
    return {
      name: this.config.name,
      version: this.config.version,
      protocolVersion: '2024-11-05', // MCP protocol version
    };
  }

  // ============================================================================
  // Request Handling
  // ============================================================================

  private async handleRequest(request: JSONRPCRequest): Promise<unknown> {
    const { method, params = {} } = request;

    switch (method) {
      // MCP Lifecycle
      case 'initialize':
        return this.handleInitialize(params as Record<string, unknown>);

      case 'shutdown':
        return this.handleShutdown();

      // Tools
      case 'tools/list':
        return this.handleToolsList();

      case 'tools/call':
        return this.handleToolsCall(params as { name: string; arguments?: Record<string, unknown> });

      // Ping
      case 'ping':
        return { pong: true };

      // Unknown method
      default:
        throw {
          code: JSON_RPC_ERRORS.METHOD_NOT_FOUND,
          message: `Unknown method: ${method}`,
        };
    }
  }

  private async handleNotification(notification: JSONRPCRequest): Promise<void> {
    const { method, params = {} } = notification;

    switch (method) {
      case 'initialized':
        // Client has finished initialization
        console.error('[MCP] Client initialized');
        break;

      case 'notifications/cancelled':
        // Request was cancelled
        console.error('[MCP] Request cancelled:', params);
        break;

      default:
        console.error(`[MCP] Unknown notification: ${method}`);
    }
  }

  // ============================================================================
  // MCP Protocol Methods
  // ============================================================================

  private async handleInitialize(
    params: Record<string, unknown>
  ): Promise<{ protocolVersion: string; capabilities: MCPCapabilities; serverInfo: MCPServerInfo }> {
    if (this.initialized) {
      throw {
        code: JSON_RPC_ERRORS.INVALID_REQUEST,
        message: 'Server already initialized',
      };
    }

    // Store client info
    if (params.clientInfo) {
      this.clientInfo = params.clientInfo as { name: string; version: string };
      console.error(`[MCP] Client: ${this.clientInfo.name} v${this.clientInfo.version}`);
    }

    this.initialized = true;

    return {
      protocolVersion: '2024-11-05',
      capabilities: this.getCapabilities(),
      serverInfo: this.getServerInfo(),
    };
  }

  private async handleShutdown(): Promise<Record<string, never>> {
    console.error('[MCP] Shutdown requested');
    // Graceful shutdown - stop accepting new requests
    setTimeout(() => {
      this.stop();
      process.exit(0);
    }, 100);
    return {};
  }

  private handleToolsList(): { tools: Array<{ name: string; description: string; inputSchema: unknown }> } {
    const tools = Array.from(this.tools.values()).map((entry) => ({
      name: entry.definition.name,
      description: entry.definition.description,
      inputSchema: this.buildInputSchema(entry.definition),
    }));

    return { tools };
  }

  private async handleToolsCall(params: {
    name: string;
    arguments?: Record<string, unknown>;
  }): Promise<{ content: Array<{ type: string; text: string }> }> {
    const { name, arguments: args = {} } = params;

    const tool = this.tools.get(name);
    if (!tool) {
      throw {
        code: JSON_RPC_ERRORS.METHOD_NOT_FOUND,
        message: `Unknown tool: ${name}`,
      };
    }

    try {
      const result = await tool.handler(args);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err) {
      const error = err as Error;
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: error.message || 'Tool execution failed' }),
          },
        ],
      };
    }
  }

  // ============================================================================
  // Tool Registration
  // ============================================================================

  private registerAllTools(): void {
    // Core tools
    this.registerTool({
      definition: {
        name: 'fleet_init',
        description: 'Initialize the AQE v3 fleet with specified topology and configuration',
        category: 'core',
        parameters: [
          { name: 'topology', type: 'string', description: 'Swarm topology type', enum: ['hierarchical', 'mesh', 'ring', 'adaptive'] },
          { name: 'maxAgents', type: 'number', description: 'Maximum number of agents', default: 15 },
          { name: 'enabledDomains', type: 'array', description: 'Domains to enable' },
          { name: 'lazyLoading', type: 'boolean', description: 'Enable lazy loading', default: true },
        ],
      },
      handler: (params) => handleFleetInit(params as Parameters<typeof handleFleetInit>[0]),
    });

    this.registerTool({
      definition: {
        name: 'fleet_status',
        description: 'Get current fleet status including agents, tasks, and health',
        category: 'core',
        parameters: [
          { name: 'verbose', type: 'boolean', description: 'Include detailed information', default: false },
        ],
      },
      handler: (params) => handleFleetStatus(params as Parameters<typeof handleFleetStatus>[0]),
    });

    this.registerTool({
      definition: {
        name: 'fleet_health',
        description: 'Check fleet and domain health status',
        category: 'core',
        parameters: [
          { name: 'domain', type: 'string', description: 'Specific domain to check' },
        ],
      },
      handler: (params) => handleFleetHealth(params as Parameters<typeof handleFleetHealth>[0]),
    });

    // Task tools
    this.registerTool({
      definition: {
        name: 'task_submit',
        description: 'Submit a task to the Queen Coordinator',
        category: 'task',
        parameters: [
          { name: 'type', type: 'string', description: 'Task type', required: true },
          { name: 'priority', type: 'string', description: 'Task priority', enum: ['p0', 'p1', 'p2', 'p3'], default: 'p1' },
          { name: 'payload', type: 'object', description: 'Task payload data' },
        ],
      },
      handler: (params) => handleTaskSubmit(params as Parameters<typeof handleTaskSubmit>[0]),
    });

    this.registerTool({
      definition: {
        name: 'task_list',
        description: 'List tasks with optional filtering',
        category: 'task',
        parameters: [
          { name: 'status', type: 'string', description: 'Filter by status' },
          { name: 'limit', type: 'number', description: 'Maximum results', default: 50 },
        ],
      },
      handler: (params) => handleTaskList(params as Parameters<typeof handleTaskList>[0]),
    });

    this.registerTool({
      definition: {
        name: 'task_status',
        description: 'Get detailed status of a specific task',
        category: 'task',
        parameters: [
          { name: 'taskId', type: 'string', description: 'Task ID', required: true },
        ],
      },
      handler: (params) => handleTaskStatus(params as Parameters<typeof handleTaskStatus>[0]),
    });

    this.registerTool({
      definition: {
        name: 'task_cancel',
        description: 'Cancel a running or pending task',
        category: 'task',
        parameters: [
          { name: 'taskId', type: 'string', description: 'Task ID to cancel', required: true },
        ],
      },
      handler: (params) => handleTaskCancel(params as Parameters<typeof handleTaskCancel>[0]),
    });

    this.registerTool({
      definition: {
        name: 'task_orchestrate',
        description: 'Orchestrate a high-level QE task across multiple agents',
        category: 'task',
        parameters: [
          { name: 'task', type: 'string', description: 'Task description', required: true },
          { name: 'strategy', type: 'string', description: 'Execution strategy', enum: ['parallel', 'sequential', 'adaptive'] },
        ],
      },
      handler: (params) => handleTaskOrchestrate(params as Parameters<typeof handleTaskOrchestrate>[0]),
    });

    // Agent tools
    this.registerTool({
      definition: {
        name: 'agent_list',
        description: 'List all active agents',
        category: 'agent',
        parameters: [
          { name: 'domain', type: 'string', description: 'Filter by domain' },
        ],
      },
      handler: (params) => handleAgentList(params as Parameters<typeof handleAgentList>[0]),
    });

    this.registerTool({
      definition: {
        name: 'agent_spawn',
        description: 'Spawn a new agent in a specific domain',
        category: 'agent',
        parameters: [
          { name: 'domain', type: 'string', description: 'Domain for the agent', required: true },
          { name: 'type', type: 'string', description: 'Agent type', default: 'worker' },
        ],
      },
      handler: (params) => handleAgentSpawn(params as Parameters<typeof handleAgentSpawn>[0]),
    });

    this.registerTool({
      definition: {
        name: 'agent_metrics',
        description: 'Get performance metrics for agents',
        category: 'agent',
        parameters: [
          { name: 'agentId', type: 'string', description: 'Specific agent ID' },
        ],
      },
      handler: (params) => handleAgentMetrics(params as Parameters<typeof handleAgentMetrics>[0]),
    });

    this.registerTool({
      definition: {
        name: 'agent_status',
        description: 'Get detailed status of a specific agent',
        category: 'agent',
        parameters: [
          { name: 'agentId', type: 'string', description: 'Agent ID', required: true },
        ],
      },
      handler: (params) => handleAgentStatus(params as Parameters<typeof handleAgentStatus>[0]),
    });

    // Domain tools - Test Generation
    this.registerTool({
      definition: {
        name: 'test_generate_enhanced',
        description: 'Generate tests with AI enhancement and pattern recognition',
        category: 'domain',
        parameters: [
          { name: 'sourceCode', type: 'string', description: 'Source code to generate tests for' },
          { name: 'language', type: 'string', description: 'Programming language' },
          { name: 'testType', type: 'string', description: 'Type of tests', enum: ['unit', 'integration', 'e2e'] },
        ],
      },
      handler: (params) => handleTestGenerate(params as Parameters<typeof handleTestGenerate>[0]),
    });

    // Domain tools - Test Execution
    this.registerTool({
      definition: {
        name: 'test_execute_parallel',
        description: 'Execute tests in parallel with retry logic',
        category: 'domain',
        parameters: [
          { name: 'testFiles', type: 'array', description: 'Test files to execute' },
          { name: 'parallel', type: 'boolean', description: 'Enable parallel execution', default: true },
        ],
      },
      handler: (params) => handleTestExecute(params as Parameters<typeof handleTestExecute>[0]),
    });

    // Domain tools - Coverage Analysis
    this.registerTool({
      definition: {
        name: 'coverage_analyze_sublinear',
        description: 'Analyze coverage with O(log n) sublinear algorithm',
        category: 'domain',
        parameters: [
          { name: 'target', type: 'string', description: 'Target path to analyze' },
          { name: 'detectGaps', type: 'boolean', description: 'Detect coverage gaps', default: true },
        ],
      },
      handler: (params) => handleCoverageAnalyze(params as Parameters<typeof handleCoverageAnalyze>[0]),
    });

    // Domain tools - Quality Assessment
    this.registerTool({
      definition: {
        name: 'quality_assess',
        description: 'Assess code quality with optional quality gate',
        category: 'domain',
        parameters: [
          { name: 'runGate', type: 'boolean', description: 'Run quality gate evaluation', default: false },
        ],
      },
      handler: (params) => handleQualityAssess(params as Parameters<typeof handleQualityAssess>[0]),
    });

    // Domain tools - Security
    this.registerTool({
      definition: {
        name: 'security_scan_comprehensive',
        description: 'Comprehensive security scanning with SAST/DAST',
        category: 'domain',
        parameters: [
          { name: 'sast', type: 'boolean', description: 'Run SAST scan', default: true },
          { name: 'dast', type: 'boolean', description: 'Run DAST scan', default: false },
          { name: 'target', type: 'string', description: 'Target to scan' },
        ],
      },
      handler: (params) => handleSecurityScan(params as Parameters<typeof handleSecurityScan>[0]),
    });

    // Domain tools - Contract Testing
    this.registerTool({
      definition: {
        name: 'contract_validate',
        description: 'Validate API contracts for breaking changes',
        category: 'domain',
        parameters: [
          { name: 'contractPath', type: 'string', description: 'Path to contract file' },
        ],
      },
      handler: (params) => handleContractValidate(params as Parameters<typeof handleContractValidate>[0]),
    });

    // Domain tools - Accessibility
    this.registerTool({
      definition: {
        name: 'accessibility_test',
        description: 'Test accessibility against WCAG standards',
        category: 'domain',
        parameters: [
          { name: 'url', type: 'string', description: 'URL to test' },
          { name: 'standard', type: 'string', description: 'Accessibility standard' },
        ],
      },
      handler: (params) => handleAccessibilityTest(params as Parameters<typeof handleAccessibilityTest>[0]),
    });

    // Domain tools - Chaos Engineering
    this.registerTool({
      definition: {
        name: 'chaos_test',
        description: 'Run chaos engineering tests',
        category: 'domain',
        parameters: [
          { name: 'faultType', type: 'string', description: 'Type of fault to inject' },
          { name: 'target', type: 'string', description: 'Target service' },
        ],
      },
      handler: (params) => handleChaosTest(params as Parameters<typeof handleChaosTest>[0]),
    });

    // Domain tools - Defect Intelligence
    this.registerTool({
      definition: {
        name: 'defect_predict',
        description: 'Predict potential defects using AI',
        category: 'domain',
        parameters: [
          { name: 'target', type: 'string', description: 'Target path' },
        ],
      },
      handler: (params) => handleDefectPredict(params as Parameters<typeof handleDefectPredict>[0]),
    });

    // Domain tools - Requirements
    this.registerTool({
      definition: {
        name: 'requirements_validate',
        description: 'Validate requirements and generate BDD scenarios',
        category: 'domain',
        parameters: [
          { name: 'requirementsPath', type: 'string', description: 'Path to requirements' },
        ],
      },
      handler: (params) => handleRequirementsValidate(params as Parameters<typeof handleRequirementsValidate>[0]),
    });

    // Domain tools - Code Intelligence
    this.registerTool({
      definition: {
        name: 'code_index',
        description: 'Index code for knowledge graph',
        category: 'domain',
        parameters: [
          { name: 'target', type: 'string', description: 'Target path' },
        ],
      },
      handler: (params) => handleCodeIndex(params as Parameters<typeof handleCodeIndex>[0]),
    });

    // Memory tools
    this.registerTool({
      definition: {
        name: 'memory_store',
        description: 'Store data in memory with optional TTL',
        category: 'memory',
        parameters: [
          { name: 'key', type: 'string', description: 'Memory key', required: true },
          { name: 'value', type: 'object', description: 'Value to store', required: true },
          { name: 'namespace', type: 'string', description: 'Memory namespace', default: 'default' },
        ],
      },
      handler: (params) => handleMemoryStore(params as Parameters<typeof handleMemoryStore>[0]),
    });

    this.registerTool({
      definition: {
        name: 'memory_retrieve',
        description: 'Retrieve data from memory',
        category: 'memory',
        parameters: [
          { name: 'key', type: 'string', description: 'Memory key', required: true },
          { name: 'namespace', type: 'string', description: 'Memory namespace', default: 'default' },
        ],
      },
      handler: (params) => handleMemoryRetrieve(params as Parameters<typeof handleMemoryRetrieve>[0]),
    });

    this.registerTool({
      definition: {
        name: 'memory_query',
        description: 'Query memory with pattern matching',
        category: 'memory',
        parameters: [
          { name: 'pattern', type: 'string', description: 'Key pattern' },
          { name: 'namespace', type: 'string', description: 'Memory namespace' },
        ],
      },
      handler: (params) => handleMemoryQuery(params as Parameters<typeof handleMemoryQuery>[0]),
    });

    this.registerTool({
      definition: {
        name: 'memory_delete',
        description: 'Delete memory entry',
        category: 'memory',
        parameters: [
          { name: 'key', type: 'string', description: 'Memory key', required: true },
          { name: 'namespace', type: 'string', description: 'Memory namespace', default: 'default' },
        ],
      },
      handler: (params) => handleMemoryDelete(params as Parameters<typeof handleMemoryDelete>[0]),
    });

    this.registerTool({
      definition: {
        name: 'memory_usage',
        description: 'Get memory usage statistics',
        category: 'memory',
        parameters: [],
      },
      handler: () => handleMemoryUsage(),
    });

    this.registerTool({
      definition: {
        name: 'memory_share',
        description: 'Share knowledge between agents',
        category: 'memory',
        parameters: [
          { name: 'sourceAgentId', type: 'string', description: 'Source agent ID', required: true },
          { name: 'targetAgentIds', type: 'array', description: 'Target agent IDs', required: true },
          { name: 'knowledgeDomain', type: 'string', description: 'Knowledge domain', required: true },
        ],
      },
      handler: (params) => handleMemoryShare(params as Parameters<typeof handleMemoryShare>[0]),
    });

    console.error(`[MCP] Registered ${this.tools.size} tools`);
  }

  private registerTool(entry: ToolEntry): void {
    this.tools.set(entry.definition.name, entry);
    this.registry.register(entry.definition, entry.handler as Parameters<typeof this.registry.register>[1]);
  }

  private buildInputSchema(definition: ToolDefinition): {
    type: string;
    properties: Record<string, unknown>;
    required?: string[];
  } {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const param of definition.parameters) {
      properties[param.name] = {
        type: param.type === 'array' ? 'array' : param.type,
        description: param.description,
      };

      if (param.enum) {
        properties[param.name] = {
          ...properties[param.name] as object,
          enum: param.enum,
        };
      }

      if (param.default !== undefined) {
        properties[param.name] = {
          ...properties[param.name] as object,
          default: param.default,
        };
      }

      if (param.required) {
        required.push(param.name);
      }
    }

    return {
      type: 'object',
      properties,
      ...(required.length > 0 ? { required } : {}),
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createMCPProtocolServer(config?: MCPServerConfig): MCPProtocolServer {
  return new MCPProtocolServer(config);
}

// ============================================================================
// Quick Start Function (like claude-flow)
// ============================================================================

export async function quickStart(config?: MCPServerConfig): Promise<MCPProtocolServer> {
  const server = createMCPProtocolServer(config);
  await server.start();
  return server;
}
