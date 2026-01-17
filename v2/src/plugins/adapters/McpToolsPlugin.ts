/**
 * MCP Tools Integration Plugin
 * Phase 3 B2: Reference Plugin Implementation
 *
 * Provides integration with the agentic-qe MCP server tools.
 * Enables plugin-based access to test generation, execution, and memory services.
 */

import {
  Plugin,
  PluginMetadata,
  PluginContext,
  PluginCategory,
} from '../types';
import { BasePlugin, createPluginMetadata } from '../BasePlugin';

/**
 * MCP tool capability descriptor
 */
export interface McpToolCapability {
  /** Tool name */
  name: string;

  /** Tool description */
  description: string;

  /** Input schema */
  inputSchema: Record<string, unknown>;

  /** Whether tool is available */
  available: boolean;
}

/**
 * MCP Server configuration
 */
export interface McpServerConfig {
  /** Server endpoint URL */
  endpoint: string;

  /** Connection timeout in milliseconds */
  timeout: number;

  /** Whether to verify server on connect */
  verifyOnConnect: boolean;

  /** API key for authentication (optional) */
  apiKey?: string;
}

/**
 * MCP JSON-RPC request structure
 */
interface McpRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

/**
 * MCP JSON-RPC response structure
 */
interface McpResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/**
 * Default MCP server configuration
 */
const DEFAULT_MCP_CONFIG: McpServerConfig = {
  endpoint: process.env.MCP_SERVER_URL || 'http://localhost:3001/mcp',
  timeout: 30000,
  verifyOnConnect: true,
};

/**
 * MCP Tools Plugin - Integration with agentic-qe MCP server
 */
export class McpToolsPlugin extends BasePlugin implements Plugin {
  readonly metadata: PluginMetadata = createPluginMetadata({
    id: '@agentic-qe/mcp-tools',
    name: 'MCP Tools Integration',
    version: '1.0.0',
    description: 'Access agentic-qe MCP server tools through the plugin system',
    author: 'Agentic QE Team',
    category: PluginCategory.MCP_TOOLS,
    minAgenticQEVersion: '2.6.0',
  });

  private initialized = false;
  private cachedCapabilities: McpToolCapability[] = [];
  private mcpConfig: McpServerConfig = DEFAULT_MCP_CONFIG;
  private requestId = 0;
  private serverConnected = false;

  async onActivate(context: PluginContext): Promise<void> {
    await super.onActivate(context);

    // Load MCP config from plugin config if available
    const configEndpoint = context.config.get<string>('mcp.endpoint');
    const configTimeout = context.config.get<number>('mcp.timeout');
    const configApiKey = context.config.get<string>('mcp.apiKey');

    if (configEndpoint) {
      this.mcpConfig.endpoint = configEndpoint;
    }
    if (configTimeout) {
      this.mcpConfig.timeout = configTimeout;
    }
    if (configApiKey) {
      this.mcpConfig.apiKey = configApiKey;
    }

    // Register as MCP tools service
    this.registerService('mcpTools:agentic-qe', this);

    // Try to connect to MCP server and discover capabilities
    try {
      await this.connectToServer();
      this.cachedCapabilities = await this.discoverCapabilitiesFromServer();
      this.serverConnected = true;
      this.log('info', `Connected to MCP server with ${this.cachedCapabilities.length} capabilities`);
    } catch (error) {
      // Fall back to static capabilities if server not available
      this.log('warn', 'MCP server not available, using static capabilities', error);
      this.cachedCapabilities = this.getStaticCapabilities();
      this.serverConnected = false;
    }

    this.initialized = true;
    this.log('info', `MCP Tools plugin ready with ${this.cachedCapabilities.length} capabilities`);
  }

  async onDeactivate(context: PluginContext): Promise<void> {
    this.initialized = false;
    this.cachedCapabilities = [];
    await super.onDeactivate(context);
  }

  /**
   * Get all available MCP tool capabilities
   */
  getCapabilities(): McpToolCapability[] {
    return [...this.cachedCapabilities];
  }

  /**
   * Check if a specific tool is available
   */
  hasCapability(toolName: string): boolean {
    return this.cachedCapabilities.some(c => c.name === toolName && c.available);
  }

  /**
   * Get capability by name
   */
  getCapability(toolName: string): McpToolCapability | undefined {
    return this.cachedCapabilities.find(c => c.name === toolName);
  }

  /**
   * Check if connected to MCP server
   */
  isConnected(): boolean {
    return this.serverConnected;
  }

  /**
   * Invoke an MCP tool via JSON-RPC
   */
  async invokeTool(
    toolName: string,
    params: Record<string, unknown>
  ): Promise<unknown> {
    this.log('debug', `Invoking MCP tool: ${toolName}`, params);

    const capability = this.getCapability(toolName);
    if (!capability) {
      throw new Error(`MCP tool not found: ${toolName}`);
    }

    if (!capability.available) {
      throw new Error(`MCP tool not available: ${toolName}`);
    }

    // Use real MCP server if connected, otherwise fall back to stub
    if (this.serverConnected) {
      return this.executeToolViaServer(toolName, params);
    } else {
      this.log('warn', `MCP server not connected, using stub for ${toolName}`);
      return this.executeToolStub(toolName, params);
    }
  }

  /**
   * Execute tool via real MCP server connection
   */
  private async executeToolViaServer(
    toolName: string,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const request: McpRequest = {
      jsonrpc: '2.0',
      id: ++this.requestId,
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: params,
      },
    };

    try {
      const response = await this.sendRequest(request);

      if (response.error) {
        throw new Error(`MCP error ${response.error.code}: ${response.error.message}`);
      }

      return response.result;
    } catch (error) {
      this.log('error', `Failed to execute tool ${toolName}`, error);

      // If server connection failed, mark as disconnected and retry with stub
      if (error instanceof Error && error.message.includes('fetch')) {
        this.serverConnected = false;
        this.log('warn', 'MCP server connection lost, falling back to stub');
        return this.executeToolStub(toolName, params);
      }

      throw error;
    }
  }

  /**
   * Send JSON-RPC request to MCP server
   */
  private async sendRequest(request: McpRequest): Promise<McpResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.mcpConfig.timeout);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (this.mcpConfig.apiKey) {
        headers['Authorization'] = `Bearer ${this.mcpConfig.apiKey}`;
      }

      const response = await fetch(this.mcpConfig.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`MCP server error: ${response.status} ${response.statusText}`);
      }

      const jsonResponse = await response.json() as McpResponse;
      return jsonResponse;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Connect to MCP server and verify connection
   */
  private async connectToServer(): Promise<void> {
    if (!this.mcpConfig.verifyOnConnect) {
      return;
    }

    const request: McpRequest = {
      jsonrpc: '2.0',
      id: ++this.requestId,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'agentic-qe-plugin',
          version: this.metadata.version,
        },
      },
    };

    const response = await this.sendRequest(request);

    if (response.error) {
      throw new Error(`MCP initialization failed: ${response.error.message}`);
    }

    this.log('debug', 'MCP server connection verified', response.result);
  }

  /**
   * Discover capabilities from MCP server
   */
  private async discoverCapabilitiesFromServer(): Promise<McpToolCapability[]> {
    const request: McpRequest = {
      jsonrpc: '2.0',
      id: ++this.requestId,
      method: 'tools/list',
    };

    const response = await this.sendRequest(request);

    if (response.error) {
      throw new Error(`Failed to list tools: ${response.error.message}`);
    }

    const tools = (response.result as { tools: Array<{
      name: string;
      description: string;
      inputSchema: Record<string, unknown>;
    }> })?.tools || [];

    return tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      available: true,
    }));
  }

  /**
   * Get tools by category
   */
  getToolsByCategory(category: string): McpToolCapability[] {
    return this.cachedCapabilities.filter(c =>
      c.name.startsWith(`mcp__agentic_qe__${category}`)
    );
  }

  // === Private Methods ===

  /**
   * Get static capability definitions (fallback when server unavailable)
   */
  private getStaticCapabilities(): McpToolCapability[] {
    // These are the known MCP tools exposed by agentic-qe
    return [
      // Fleet Management
      {
        name: 'mcp__agentic_qe__fleet_init',
        description: 'Initialize a QE fleet with specified topology and configuration',
        inputSchema: {
          type: 'object',
          properties: {
            config: {
              type: 'object',
              properties: {
                topology: { enum: ['hierarchical', 'mesh', 'ring', 'adaptive'] },
                maxAgents: { type: 'number', minimum: 5, maximum: 50 },
                frameworks: { type: 'array', items: { type: 'string' } },
                testingFocus: { type: 'array', items: { type: 'string' } },
              },
              required: ['topology', 'maxAgents'],
            },
          },
          required: ['config'],
        },
        available: true,
      },
      {
        name: 'mcp__agentic_qe__agent_spawn',
        description: 'Spawn a specialized QE agent with specific capabilities',
        inputSchema: {
          type: 'object',
          properties: {
            spec: {
              type: 'object',
              properties: {
                type: { enum: ['test-generator', 'coverage-analyzer', 'quality-gate', 'performance-tester', 'security-scanner', 'chaos-engineer', 'visual-tester'] },
                capabilities: { type: 'array', items: { type: 'string' } },
                name: { type: 'string' },
              },
              required: ['type', 'capabilities'],
            },
          },
          required: ['spec'],
        },
        available: true,
      },
      {
        name: 'mcp__agentic_qe__fleet_status',
        description: 'Get QE fleet and agent status',
        inputSchema: {
          type: 'object',
          properties: {
            fleetId: { type: 'string' },
            includeMetrics: { type: 'boolean', default: true },
            includeAgentDetails: { type: 'boolean', default: false },
          },
        },
        available: true,
      },

      // Test Generation
      {
        name: 'mcp__agentic_qe__test_generate_enhanced',
        description: 'AI test generation with pattern recognition and anti-pattern detection',
        inputSchema: {
          type: 'object',
          properties: {
            sourceCode: { type: 'string', description: 'Source code to analyze' },
            language: { enum: ['javascript', 'typescript', 'python', 'java', 'go'] },
            testType: { enum: ['unit', 'integration', 'e2e', 'property-based', 'mutation'] },
            coverageGoal: { type: 'number', minimum: 0, maximum: 100 },
            aiEnhancement: { type: 'boolean', default: true },
            detectAntiPatterns: { type: 'boolean', default: false },
          },
          required: ['sourceCode', 'language', 'testType'],
        },
        available: true,
      },

      // Test Execution
      {
        name: 'mcp__agentic_qe__test_execute',
        description: 'Execute test suites with parallel orchestration',
        inputSchema: {
          type: 'object',
          properties: {
            spec: {
              type: 'object',
              properties: {
                testSuites: { type: 'array', items: { type: 'string' } },
                parallelExecution: { type: 'boolean', default: true },
                environments: { type: 'array', items: { type: 'string' } },
                retryCount: { type: 'number', default: 3, minimum: 0, maximum: 5 },
                timeoutSeconds: { type: 'number', default: 300, minimum: 10 },
                reportFormat: { enum: ['junit', 'tap', 'json', 'html'], default: 'json' },
              },
              required: ['testSuites'],
            },
          },
          required: ['spec'],
        },
        available: true,
      },
      {
        name: 'mcp__agentic_qe__test_execute_parallel',
        description: 'Execute tests with workers, retry, and load balancing',
        inputSchema: {
          type: 'object',
          properties: {
            testFiles: { type: 'array', items: { type: 'string' } },
            parallelism: { type: 'number', default: 4, minimum: 1, maximum: 16 },
            retryFailures: { type: 'boolean', default: true },
            maxRetries: { type: 'number', default: 3 },
            loadBalancing: { enum: ['round-robin', 'least-loaded', 'random'], default: 'round-robin' },
            collectCoverage: { type: 'boolean', default: false },
          },
          required: ['testFiles'],
        },
        available: true,
      },

      // Memory Management
      {
        name: 'mcp__agentic_qe__memory_store',
        description: 'Store QE data with TTL and namespacing for coordination',
        inputSchema: {
          type: 'object',
          properties: {
            key: { type: 'string' },
            value: { description: 'Value to store (any type)' },
            namespace: { type: 'string', default: 'default' },
            ttl: { type: 'number', description: 'Time to live in seconds (0 for persistent)' },
            persist: { type: 'boolean', default: false },
          },
          required: ['key', 'value'],
        },
        available: true,
      },
      {
        name: 'mcp__agentic_qe__memory_retrieve',
        description: 'Retrieve QE data with optional metadata',
        inputSchema: {
          type: 'object',
          properties: {
            key: { type: 'string' },
            namespace: { type: 'string', default: 'default' },
            includeMetadata: { type: 'boolean', default: false },
          },
          required: ['key'],
        },
        available: true,
      },
      {
        name: 'mcp__agentic_qe__memory_query',
        description: 'Query memory with pattern matching and filtering',
        inputSchema: {
          type: 'object',
          properties: {
            pattern: { type: 'string', description: 'Key pattern (supports wildcards)' },
            namespace: { type: 'string' },
            limit: { type: 'number', default: 100, minimum: 1, maximum: 1000 },
            offset: { type: 'number', default: 0 },
            includeExpired: { type: 'boolean', default: false },
          },
        },
        available: true,
      },

      // Task Orchestration
      {
        name: 'mcp__agentic_qe__task_orchestrate',
        description: 'Orchestrate QE tasks across multiple agents',
        inputSchema: {
          type: 'object',
          properties: {
            task: {
              type: 'object',
              properties: {
                type: { enum: ['comprehensive-testing', 'quality-gate', 'defect-prevention', 'performance-validation'] },
                priority: { enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
                strategy: { enum: ['parallel', 'sequential', 'adaptive'], default: 'adaptive' },
                maxAgents: { type: 'number', minimum: 1, maximum: 10 },
                timeoutMinutes: { type: 'number', default: 30, minimum: 1 },
              },
              required: ['type'],
            },
            fleetId: { type: 'string' },
            context: {
              type: 'object',
              properties: {
                project: { type: 'string' },
                environment: { type: 'string' },
                branch: { type: 'string' },
              },
            },
          },
          required: ['task'],
        },
        available: true,
      },
      {
        name: 'mcp__agentic_qe__task_status',
        description: 'Check task status and progress',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: { type: 'string', description: 'Task or orchestration ID' },
            includeDetails: { type: 'boolean', default: false },
            includeTimeline: { type: 'boolean', default: false },
          },
          required: ['taskId'],
        },
        available: true,
      },

      // Reporting
      {
        name: 'mcp__agentic_qe__test_report_comprehensive',
        description: 'Generate test reports in multiple formats',
        inputSchema: {
          type: 'object',
          properties: {
            results: {
              type: 'object',
              properties: {
                total: { type: 'number' },
                passed: { type: 'number' },
                failed: { type: 'number' },
                skipped: { type: 'number' },
                duration: { type: 'number' },
                suites: { type: 'array' },
              },
              required: ['total', 'passed', 'failed'],
            },
            format: { enum: ['html', 'json', 'junit', 'markdown', 'pdf'] },
            includeSummary: { type: 'boolean', default: true },
            includeDetails: { type: 'boolean', default: false },
            includeTrends: { type: 'boolean', default: false },
            includeCharts: { type: 'boolean', default: false },
          },
          required: ['results', 'format'],
        },
        available: true,
      },
    ];
  }

  private async executeToolStub(
    toolName: string,
    params: Record<string, unknown>
  ): Promise<unknown> {
    // Stub implementation - in real usage, this would call the MCP server
    // This demonstrates the plugin pattern for MCP tool access
    this.log('debug', `Stub execution for ${toolName}`, params);

    switch (toolName) {
      case 'mcp__agentic_qe__fleet_status':
        return {
          status: 'active',
          agentCount: 0,
          topology: 'none',
          message: 'No fleet initialized',
        };

      case 'mcp__agentic_qe__memory_retrieve':
        return {
          found: false,
          key: params.key,
          namespace: params.namespace || 'default',
        };

      default:
        return {
          success: true,
          tool: toolName,
          params,
          message: 'Tool executed via plugin stub',
        };
    }
  }
}

/**
 * Factory function for plugin registration
 */
export function createMcpToolsPlugin(): McpToolsPlugin {
  return new McpToolsPlugin();
}
