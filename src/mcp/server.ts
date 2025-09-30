/**
 * MCP Server for Agentic QE Fleet System
 * 
 * This module implements the Model Context Protocol server that handles
 * tool requests and coordinates with the Agentic QE Fleet components.
 * 
 * @version 1.0.0
 * @author Agentic QE Team
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { 
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError
} from '@modelcontextprotocol/sdk/types.js';
import { agenticQETools, TOOL_NAMES } from './tools.js';
import { FleetInitHandler } from './handlers/fleet-init.js';
import { AgentSpawnHandler } from './handlers/agent-spawn.js';
import { TestGenerateHandler } from './handlers/test-generate.js';
import { TestExecuteHandler } from './handlers/test-execute.js';
import { QualityAnalyzeHandler } from './handlers/quality-analyze.js';
import { PredictDefectsHandler } from './handlers/predict-defects.js';
import { FleetStatusHandler } from './handlers/fleet-status.js';
import { TaskOrchestrateHandler } from './handlers/task-orchestrate.js';
import { OptimizeTestsHandler } from './handlers/optimize-tests.js';
import { AgentRegistry, getAgentRegistry } from './services/AgentRegistry.js';
import { HookExecutor, getHookExecutor } from './services/HookExecutor.js';

/**
 * Agentic QE MCP Server
 * 
 * Handles MCP tool requests and coordinates with QE fleet components.
 * Integrates with Claude Flow coordination patterns and sublinear-core optimization.
 */
export class AgenticQEMCPServer {
  private server: Server;
  private handlers: Map<string, any>;
  private registry: AgentRegistry;
  private hookExecutor: HookExecutor;

  constructor() {
    this.server = new Server(
      {
        name: 'agentic-qe-server',
        version: '1.0.0',
        description: 'Agentic Quality Engineering Fleet MCP Server'
      },
      {
        capabilities: {
          tools: {},
          logging: {}
        }
      }
    );

    // Initialize services
    this.registry = getAgentRegistry({
      maxAgents: 50,
      enableMetrics: true
    });

    this.hookExecutor = getHookExecutor({
      enabled: true,
      dryRun: false,
      timeout: 30000
    });

    this.handlers = new Map();
    this.initializeHandlers();
    this.setupRequestHandlers();
  }

  /**
   * Initialize tool handlers
   */
  private initializeHandlers(): void {
    // Core fleet management handlers
    this.handlers.set(TOOL_NAMES.FLEET_INIT, new FleetInitHandler(this.registry, this.hookExecutor));
    this.handlers.set(TOOL_NAMES.AGENT_SPAWN, new AgentSpawnHandler(this.registry, this.hookExecutor));
    this.handlers.set(TOOL_NAMES.FLEET_STATUS, new FleetStatusHandler(this.registry, this.hookExecutor));

    // Test lifecycle handlers
    this.handlers.set(TOOL_NAMES.TEST_GENERATE, new TestGenerateHandler(this.registry, this.hookExecutor));
    this.handlers.set(TOOL_NAMES.TEST_EXECUTE, new TestExecuteHandler(this.registry, this.hookExecutor));

    // Quality and analysis handlers
    this.handlers.set(TOOL_NAMES.QUALITY_ANALYZE, new QualityAnalyzeHandler(this.registry, this.hookExecutor));
    this.handlers.set(TOOL_NAMES.PREDICT_DEFECTS, new PredictDefectsHandler(this.registry, this.hookExecutor));

    // Orchestration and optimization handlers
    this.handlers.set(TOOL_NAMES.TASK_ORCHESTRATE, new TaskOrchestrateHandler(this.registry, this.hookExecutor));
    this.handlers.set(TOOL_NAMES.OPTIMIZE_TESTS, new OptimizeTestsHandler(this.registry, this.hookExecutor));
  }

  /**
   * Setup MCP request handlers
   */
  private setupRequestHandlers(): void {
    // Handle tool listing requests
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: agenticQETools
      };
    });

    // Handle tool call requests
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      try {
        // Validate tool exists
        if (!this.handlers.has(name)) {
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${name}`
          );
        }

        // Get handler and execute
        const handler = this.handlers.get(name);
        const result = await handler.handle(args);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      } catch (error) {
        // Handle known MCP errors
        if (error instanceof McpError) {
          throw error;
        }

        // Handle unexpected errors
        this.server.notification({
          method: 'notifications/message',
          params: {
            level: 'error',
            logger: 'agentic-qe-server',
            data: {
              tool: name,
              error: error instanceof Error ? error.message : String(error),
              stack: error instanceof Error ? error.stack : undefined
            }
          }
        });

        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    });

    // Handle logging - removed as onNotification doesn't exist in new SDK
    // this.server.notification('notifications/message', (notification: any) => {
    //   const { level, logger, data } = notification.params;
    //   console.log(`[${level}] ${logger}:`, data);
    // });
  }

  /**
   * Start the MCP server
   */
  async start(transport?: StdioServerTransport): Promise<void> {
    const serverTransport = transport || new StdioServerTransport();
    await this.server.connect(serverTransport);

    // Log to stderr to not interfere with MCP stdio protocol
    console.error('Agentic QE MCP Server started successfully');
    console.error(`Available tools: ${agenticQETools.map(t => t.name).join(', ')}`);
  }

  /**
   * Stop the MCP server
   */
  async stop(): Promise<void> {
    // Cleanup all agents
    await this.registry.clearAll();

    await this.server.close();
    console.error('Agentic QE MCP Server stopped');
  }

  /**
   * Get server instance for testing
   */
  getServer(): Server {
    return this.server;
  }

  /**
   * Get available tools
   */
  getTools() {
    return agenticQETools;
  }

  /**
   * Check if tool is supported
   */
  supportsTool(toolName: string): boolean {
    return this.handlers.has(toolName);
  }
}

/**
 * Factory function to create and start MCP server
 */
export async function createAgenticQEServer(): Promise<AgenticQEMCPServer> {
  const server = new AgenticQEMCPServer();
  await server.start();
  return server;
}

/**
 * Main entry point for standalone server execution
 */
export async function main(): Promise<void> {
  try {
    const server = await createAgenticQEServer();
    
    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\nReceived SIGINT, shutting down gracefully...');
      await server.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('\nReceived SIGTERM, shutting down gracefully...');
      await server.stop();
      process.exit(0);
    });

    // Keep process alive
    process.stdin.resume();
  } catch (error) {
    console.error('Failed to start Agentic QE MCP Server:', error);
    process.exit(1);
  }
}

// Start server if this file is run directly
// Note: import.meta requires ES module configuration
// if (import.meta.url === `file://${process.argv[1]}`) {
//   main().catch(console.error);
// }
