#!/usr/bin/env node
/**
 * QE Framework MCP Server Enhanced (Based on Claude Flow patterns)
 * Exposes Quality Engineering agents as MCP tools with advanced coordination
 */

// Use absolute paths for the MCP SDK modules
const { Server } = require('./node_modules/@modelcontextprotocol/sdk/dist/server/index.js');
const { StdioServerTransport } = require('./node_modules/@modelcontextprotocol/sdk/dist/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require('./node_modules/@modelcontextprotocol/sdk/dist/types.js');
const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const { glob } = require('glob');
const { EventEmitter } = require('events');

const execAsync = promisify(exec);
const ResponseFormatter = require('./src/utils/response-formatter');

// Load configuration
let config;
try {
  config = require('./config/mcp-config').getConfig();
} catch (error) {
  // Fallback configuration if file doesn't exist
  config = {
    response: {
      maxTokens: 2000,
      maxLength: 5000,
      summaryMode: true,
      truncateFilePreviews: true,
      maxFilesInDetail: 3
    },
    analysis: {
      defaultDepth: 'standard',
      lightweightMode: false,
      includeTests: true
    },
    swarm: {
      forceSummaryMode: true,
      maxAgents: 5,
      defaultStrategy: 'hierarchical'
    },
    session: {
      maxDuration: 3600000,
      inactivityTimeout: 900000,
      compressMemory: true
    },
    performance: {
      maxConcurrent: 5,
      enableCache: true,
      cacheTTL: 300000
    },
    logging: {
      level: 'error',
      logToFile: false
    }
  };
}

// Enhanced tool registry with metrics and capabilities (from Claude Flow)
class ToolRegistry extends EventEmitter {
  constructor() {
    super();
    this.tools = new Map();
    this.metrics = new Map();
    this.capabilities = new Map();
    this.categories = new Set();
    this.tags = new Set();
  }

  register(tool) {
    this.tools.set(tool.name, tool);
    this.metrics.set(tool.name, {
      totalInvocations: 0,
      successfulInvocations: 0,
      failedInvocations: 0,
      averageExecutionTime: 0,
      totalExecutionTime: 0,
      lastInvoked: null
    });

    // Extract metadata
    if (tool.metadata) {
      if (tool.metadata.category) {
        this.categories.add(tool.metadata.category);
      }
      if (tool.metadata.tags) {
        tool.metadata.tags.forEach(tag => this.tags.add(tag));
      }
      this.capabilities.set(tool.name, tool.metadata.capabilities || []);
    }

    this.emit('toolRegistered', tool);
  }

  async executeTool(name, input) {
    const startTime = Date.now();
    const metrics = this.metrics.get(name);

    try {
      const tool = this.tools.get(name);
      if (!tool) throw new Error(`Tool not found: ${name}`);

      const result = await tool.handler(input);

      // Update metrics
      metrics.totalInvocations++;
      metrics.successfulInvocations++;
      metrics.lastInvoked = new Date();
      const executionTime = Date.now() - startTime;
      metrics.totalExecutionTime += executionTime;
      metrics.averageExecutionTime = metrics.totalExecutionTime / metrics.totalInvocations;

      this.emit('toolExecuted', { name, success: true, executionTime });

      return result;
    } catch (error) {
      metrics.totalInvocations++;
      metrics.failedInvocations++;
      metrics.lastInvoked = new Date();

      this.emit('toolExecuted', { name, success: false, error });
      throw error;
    }
  }

  getMetrics(toolName) {
    return toolName ? this.metrics.get(toolName) : Object.fromEntries(this.metrics);
  }

  listTools() {
    return Array.from(this.tools.values()).map(tool => ({
      name: tool.name,
      description: tool.description,
      metadata: tool.metadata,
      metrics: this.metrics.get(tool.name)
    }));
  }

  getCapabilities(toolName) {
    return this.capabilities.get(toolName) || [];
  }

  getToolsByCategory(category) {
    return Array.from(this.tools.values()).filter(
      tool => tool.metadata?.category === category
    );
  }
}

// Session management for agent coordination (from Claude Flow)
class SessionManager {
  constructor() {
    this.sessions = new Map();
    this.agentStates = new Map();
    this.sharedMemory = new Map();
  }

  createSession(sessionId, context = {}) {
    const session = {
      id: sessionId,
      startTime: Date.now(),
      context,
      agents: [],
      tasks: [],
      memory: new Map(),
      metrics: {
        tasksCompleted: 0,
        totalTokens: 0,
        averageResponseTime: 0,
        agentsUsed: 0
      },
      status: 'active'
    };
    this.sessions.set(sessionId, session);
    return session;
  }

  getSession(sessionId) {
    return this.sessions.get(sessionId);
  }

  updateAgentState(sessionId, agentName, state) {
    const key = `${sessionId}:${agentName}`;
    this.agentStates.set(key, {
      ...this.agentStates.get(key),
      ...state,
      lastUpdate: Date.now()
    });
  }

  getAgentState(sessionId, agentName) {
    return this.agentStates.get(`${sessionId}:${agentName}`);
  }

  storeMemory(sessionId, key, value) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.memory.set(key, {
        value,
        timestamp: Date.now(),
        accessCount: 0
      });
    }
  }

  retrieveMemory(sessionId, key) {
    const session = this.sessions.get(sessionId);
    const memory = session?.memory.get(key);
    if (memory) {
      memory.accessCount++;
      return memory.value;
    }
    return null;
  }

  shareMemoryAcrossSessions(key, value) {
    this.sharedMemory.set(key, {
      value,
      timestamp: Date.now(),
      sessions: []
    });
  }

  getSharedMemory(key) {
    return this.sharedMemory.get(key)?.value;
  }

  endSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = 'completed';
      session.endTime = Date.now();
      session.duration = session.endTime - session.startTime;
    }
  }

  getActiveSessions() {
    return Array.from(this.sessions.values()).filter(s => s.status === 'active');
  }

  getSessionMetrics(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    return {
      ...session.metrics,
      duration: Date.now() - session.startTime,
      memorySize: session.memory.size,
      status: session.status
    };
  }
}

// Batch tool execution coordinator (from Claude Flow patterns)
class BatchToolCoordinator {
  constructor(toolRegistry) {
    this.toolRegistry = toolRegistry;
    this.queue = [];
    this.executing = false;
    this.maxConcurrent = config.performance.maxConcurrent || 5;
    this.results = new Map();
  }

  async addBatch(tools, sessionId) {
    const batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const batch = {
      id: batchId,
      sessionId,
      tools,
      status: 'pending',
      results: [],
      startTime: null,
      endTime: null,
      errors: []
    };

    this.queue.push(batch);

    if (!this.executing) {
      this.executeBatches();
    }

    return batchId;
  }

  async executeBatches() {
    this.executing = true;

    while (this.queue.length > 0) {
      const batch = this.queue.shift();
      batch.status = 'executing';
      batch.startTime = Date.now();

      try {
        // Execute tools in parallel with concurrency limit
        const results = await this.executeParallel(batch.tools, batch.sessionId);
        batch.results = results;
        batch.status = 'completed';
      } catch (error) {
        batch.status = 'failed';
        batch.errors.push(error.message);
      }

      batch.endTime = Date.now();
      this.results.set(batch.id, batch);
    }

    this.executing = false;
  }

  async executeParallel(tools, sessionId) {
    const chunks = [];
    for (let i = 0; i < tools.length; i += this.maxConcurrent) {
      chunks.push(tools.slice(i, i + this.maxConcurrent));
    }

    const results = [];
    for (const chunk of chunks) {
      const chunkResults = await Promise.all(
        chunk.map(tool => this.executeToolSafe(tool, sessionId))
      );
      results.push(...chunkResults);
    }

    return results;
  }

  async executeToolSafe(tool, sessionId) {
    try {
      const result = await this.toolRegistry.executeTool(tool.name, tool.input);
      return {
        tool: tool.name,
        success: true,
        result,
        executionTime: Date.now()
      };
    } catch (error) {
      return {
        tool: tool.name,
        success: false,
        error: error.message,
        executionTime: Date.now()
      };
    }
  }

  getBatchStatus(batchId) {
    return this.results.get(batchId);
  }
}

// Load agent definitions
const agentsPath = path.join(__dirname, 'agents');
let agents = [];

async function loadAgents() {
  try {
    const agentFiles = await glob('**/agent.yaml', {
      cwd: agentsPath,
      absolute: true
    });

    for (const file of agentFiles) {
      try {
        const yaml = require('yaml');
        const content = await fs.readFile(file, 'utf-8');
        const agent = yaml.parse(content);
        agents.push(agent);
      } catch (error) {
        console.error(`Failed to load agent from ${file}:`, error);
      }
    }

    console.error(`[QE MCP Enhanced] Loaded ${agents.length} agents`);
  } catch (error) {
    console.error('[QE MCP Enhanced] Failed to load agents:', error);
  }
}

// Enhanced QE MCP Server
class QEMCPServerEnhanced {
  constructor() {
    this.toolRegistry = new ToolRegistry();
    this.sessionManager = new SessionManager();
    this.batchCoordinator = new BatchToolCoordinator(this.toolRegistry);
    this.responseFormatter = new ResponseFormatter();

    this.server = new Server(
      {
        name: 'qe-framework-mcp-enhanced',
        version: '2.0.0',
      },
      {
        capabilities: {
          tools: {},
          logging: { level: 'info' },
          resources: { listChanged: true }
        },
      },
    );

    this.activeAnalyses = new Map();
    this.setupHandlers();
    this.initializeAgents();
    this.setupEventListeners();
  }

  async initializeAgents() {
    await loadAgents();
    this.registerAgentTools();
    this.registerCoordinationTools();
    this.registerMetricTools();
  }

  setupEventListeners() {
    // Listen for tool execution events
    this.toolRegistry.on('toolExecuted', ({ name, success, executionTime }) => {
      console.error(`[QE MCP] Tool ${name} executed: ${success ? 'success' : 'failure'} (${executionTime}ms)`);
    });

    // Listen for tool registration
    this.toolRegistry.on('toolRegistered', (tool) => {
      console.error(`[QE MCP] Tool registered: ${tool.name}`);
    });
  }

  registerAgentTools() {
    // Register each agent as a tool with enhanced metadata
    for (const agent of agents) {
      const tool = {
        name: `qe_${agent.name.replace(/-/g, '_')}`,
        description: `${agent.description} (Category: ${agent.category})`,
        inputSchema: {
          type: 'object',
          properties: {
            task: {
              type: 'string',
              description: 'The specific task or analysis to perform',
            },
            projectPath: {
              type: 'string',
              description: 'Path to the project to analyze',
            },
            analysisDepth: {
              type: 'string',
              enum: ['shallow', 'standard', 'deep'],
              description: 'Depth of analysis',
              default: 'standard',
            },
            format: {
              type: 'string',
              enum: ['minimal', 'summary', 'detailed', 'json'],
              description: 'Response format',
              default: 'summary',
            },
            sessionId: {
              type: 'string',
              description: 'Session ID for coordination',
            },
            enableCoordination: {
              type: 'boolean',
              description: 'Enable coordination with other agents',
              default: false,
            },
            sharedContext: {
              type: 'object',
              description: 'Shared context from other agents',
            },
            includeTests: {
              type: 'boolean',
              description: 'Include test file analysis',
              default: true,
            },
          },
          required: ['task'],
        },
        handler: async (args) => {
          const result = await this.runAgentEnhanced(agent.name, args);
          return this.responseFormatter.format(result, args.format || 'summary');
        },
        metadata: {
          category: agent.category,
          capabilities: agent.capabilities || [],
          tags: agent.tags || [],
          estimatedTime: agent.estimatedTime || 'medium',
          maxConcurrentTasks: agent.maxConcurrentTasks || 1
        }
      };

      this.toolRegistry.register(tool);
    }
  }

  registerCoordinationTools() {
    // Multi-agent coordination tool
    this.toolRegistry.register({
      name: 'qe_coordinate',
      description: 'Coordinate multiple QE agents for comprehensive analysis',
      inputSchema: {
        type: 'object',
        properties: {
          agents: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of agent names to coordinate',
          },
          objective: {
            type: 'string',
            description: 'Overall objective for the coordinated agents',
          },
          strategy: {
            type: 'string',
            enum: ['parallel', 'sequential', 'hierarchical', 'adaptive'],
            description: 'Coordination strategy',
            default: 'parallel',
          },
          format: {
            type: 'string',
            enum: ['minimal', 'summary', 'detailed', 'json'],
            description: 'Response format',
            default: 'summary',
          },
          projectPath: {
            type: 'string',
            description: 'Path to the project',
          },
        },
        required: ['agents', 'objective'],
      },
      handler: async (args) => {
        const result = await this.coordinateAgents(args);
        return this.responseFormatter.format(result, args.format || 'summary');
      },
      metadata: {
        category: 'coordination',
        capabilities: ['multi-agent', 'orchestration'],
        tags: ['coordination', 'swarm']
      }
    });

    // Batch execution tool
    this.toolRegistry.register({
      name: 'qe_batch_execute',
      description: 'Execute multiple tools in batch for efficient processing',
      inputSchema: {
        type: 'object',
        properties: {
          tools: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                input: { type: 'object' },
              },
            },
            description: 'List of tools to execute in batch',
          },
          sessionId: {
            type: 'string',
            description: 'Session ID for coordination',
          },
        },
        required: ['tools'],
      },
      handler: async (args) => {
        const sessionId = args.sessionId || `batch_session_${Date.now()}`;
        const batchId = await this.batchCoordinator.addBatch(args.tools, sessionId);

        // Wait for batch completion
        let batch;
        do {
          await new Promise(resolve => setTimeout(resolve, 100));
          batch = this.batchCoordinator.getBatchStatus(batchId);
        } while (batch && batch.status === 'executing');

        return batch;
      },
      metadata: {
        category: 'coordination',
        capabilities: ['batch-processing', 'parallel-execution'],
        tags: ['batch', 'performance']
      }
    });

    // Swarm coordination tool
    this.toolRegistry.register({
      name: 'qe_swarm',
      description: 'Deploy a swarm of QE agents for comprehensive testing',
      inputSchema: {
        type: 'object',
        properties: {
          objective: {
            type: 'string',
            description: 'Testing objective',
          },
          format: {
            type: 'string',
            enum: ['minimal', 'summary', 'detailed', 'json'],
            description: 'Response format',
            default: 'summary',
          },
          strategy: {
            type: 'string',
            enum: ['comprehensive', 'risk-based', 'exploratory', 'regression', 'adaptive'],
            description: 'Testing strategy',
            default: 'comprehensive',
          },
          maxAgents: {
            type: 'number',
            description: 'Maximum number of agents to use',
            default: config.swarm.maxAgents || 5,
          },
          projectPath: {
            type: 'string',
            description: 'Path to the project',
          },
        },
        required: ['objective'],
      },
      handler: async (args) => {
        const result = await this.runSwarmEnhanced({ ...args, summaryMode: true });
        return this.responseFormatter.format(result, args.format || 'summary');
      },
      metadata: {
        category: 'coordination',
        capabilities: ['swarm', 'multi-agent', 'adaptive'],
        tags: ['swarm', 'testing', 'coordination']
      }
    });
  }

  registerMetricTools() {
    // Session management tool
    this.toolRegistry.register({
      name: 'qe_session_status',
      description: 'Get status of active QE sessions',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: {
            type: 'string',
            description: 'Specific session ID (optional)',
          },
        },
      },
      handler: async (args) => {
        if (args.sessionId) {
          const session = this.sessionManager.getSession(args.sessionId);
          const metrics = this.sessionManager.getSessionMetrics(args.sessionId);
          return {
            session: session ? {
              id: session.id,
              status: session.status,
              agents: session.agents,
              tasks: session.tasks.length,
              metrics
            } : null
          };
        }

        const activeSessions = this.sessionManager.getActiveSessions();
        return {
          activeSessions: activeSessions.map(s => ({
            id: s.id,
            status: s.status,
            agents: s.agents,
            tasks: s.tasks.length,
            startTime: s.startTime
          }))
        };
      },
      metadata: {
        category: 'monitoring',
        capabilities: ['session-management', 'metrics'],
        tags: ['monitoring', 'session']
      }
    });

    // Metrics tool
    this.toolRegistry.register({
      name: 'qe_metrics',
      description: 'Get metrics for QE agent execution',
      inputSchema: {
        type: 'object',
        properties: {
          toolName: {
            type: 'string',
            description: 'Specific tool name (optional)',
          },
          sessionId: {
            type: 'string',
            description: 'Session ID for metrics',
          },
        },
      },
      handler: async (args) => {
        const metrics = {
          tools: this.toolRegistry.getMetrics(args.toolName),
          sessions: args.sessionId ?
            this.sessionManager.getSessionMetrics(args.sessionId) :
            this.sessionManager.getActiveSessions().length,
          registry: {
            totalTools: this.toolRegistry.tools.size,
            categories: Array.from(this.toolRegistry.categories),
            tags: Array.from(this.toolRegistry.tags)
          }
        };

        return metrics;
      },
      metadata: {
        category: 'monitoring',
        capabilities: ['metrics', 'analytics'],
        tags: ['monitoring', 'metrics']
      }
    });

    // List agents tool with enhanced capabilities
    this.toolRegistry.register({
      name: 'qe_list_agents',
      description: 'List all available QE agents with detailed capabilities and metrics',
      inputSchema: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            description: 'Filter by category (optional)',
          },
          includeMetrics: {
            type: 'boolean',
            description: 'Include execution metrics',
            default: false,
          },
          includeCapabilities: {
            type: 'boolean',
            description: 'Include detailed capabilities',
            default: true,
          },
        },
      },
      handler: async (args) => {
        const result = await this.listAgentsEnhanced(args);
        return this.responseFormatter.format(result, args.format || 'minimal');
      },
      metadata: {
        category: 'discovery',
        capabilities: ['agent-discovery', 'capability-analysis'],
        tags: ['discovery', 'agents']
      }
    });
  }

  setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: this.getToolsWithMetrics(),
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) =>
      this.handleToolCall(request.params.name, request.params.arguments || {}),
    );
  }

  getToolsWithMetrics() {
    const tools = this.toolRegistry.listTools();

    return tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: this.toolRegistry.tools.get(tool.name).inputSchema,
      metadata: {
        ...tool.metadata,
        metrics: tool.metrics
      }
    }));
  }

  async handleToolCall(toolName, args) {
    try {
      console.error(`[QE MCP Enhanced] Handling tool call: ${toolName}`, args);

      const tool = this.toolRegistry.tools.get(toolName);
      if (!tool) {
        return {
          content: [
            {
              type: 'text',
              text: `Unknown tool: ${toolName}`,
            },
          ],
          isError: true,
        };
      }

      const result = await this.toolRegistry.executeTool(toolName, args);

      return {
        content: [
          {
            type: 'text',
            text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      console.error(`[QE MCP Enhanced] Error handling tool ${toolName}:`, error);
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error.message || String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }

  async runAgentEnhanced(agentName, args) {
    const projectPath = args.projectPath || process.cwd();
    const summaryMode = args.summaryMode !== false && config.response.summaryMode;

    // Create or get session
    const sessionId = args.sessionId || `session_${Date.now()}`;
    let session = this.sessionManager.getSession(sessionId);
    if (!session) {
      session = this.sessionManager.createSession(sessionId, {
        projectPath,
        task: args.task,
        agentName
      });
    }

    // Store agent in session
    session.agents.push(agentName);
    session.tasks.push({
      agent: agentName,
      task: args.task,
      startTime: Date.now()
    });

    // Find agent
    const agent = agents.find(a => a.name === agentName);
    if (!agent) {
      return `Agent not found: ${agentName}`;
    }

    // Analyze project structure (but keep it lean)
    const analysis = await this.analyzeProjectStructure(projectPath, {
      ...args,
      lightweight: summaryMode  // Use lightweight mode when in summary mode
    });

    // Check for coordination with other agents
    let coordinationData = null;
    if (args.enableCoordination) {
      coordinationData = {
        currentAgent: agentName,
        otherAgents: session.agents.filter(a => a !== agentName),
        sharedMemory: Object.fromEntries(session.memory),
        sharedContext: args.sharedContext
      };
    }

    // Execute agent with context
    const result = await this.executeAgentWithContext({
      agent,
      task: args.task,
      projectPath,
      projectAnalysis: analysis,
      analysisDepth: args.analysisDepth || 'standard',
      coordinationData,
      sessionId
    });

    // Update session metrics
    session.metrics.tasksCompleted++;
    session.metrics.agentsUsed = new Set(session.agents).size;

    // Store result in shared memory for other agents (but only key info in summary mode)
    const memoryData = summaryMode ?
      { summary: result.substring(0, 500), timestamp: Date.now(), task: args.task } :
      { result, timestamp: Date.now(), task: args.task };

    this.sessionManager.storeMemory(sessionId, `${agentName}_result`, memoryData);

    return result;
  }

  async coordinateAgents(args) {
    const sessionId = `coord_${Date.now()}`;
    const session = this.sessionManager.createSession(sessionId, {
      objective: args.objective,
      strategy: args.strategy || 'parallel',
      projectPath: args.projectPath || process.cwd()
    });

    const results = [];
    const agents = args.agents || this.selectAgentsForObjective(args.objective);

    // Limit agents based on configuration
    const limitedAgents = agents.slice(0, config.swarm.maxAgents);

    if (args.strategy === 'parallel') {
      // Execute all agents in parallel
      const promises = limitedAgents.map(agent =>
        this.runAgentEnhanced(agent, {
          task: args.objective,
          projectPath: args.projectPath,
          sessionId,
          enableCoordination: true
        })
      );
      const parallelResults = await Promise.all(promises);
      results.push(...parallelResults);

    } else if (args.strategy === 'sequential') {
      // Execute agents sequentially with context passing
      for (const agent of agents) {
        const result = await this.runAgentEnhanced(agent, {
          task: args.objective,
          projectPath: args.projectPath,
          sessionId,
          enableCoordination: true,
          sharedContext: results
        });
        results.push(result);
      }

    } else if (args.strategy === 'hierarchical') {
      // Execute in hierarchical order (leaders first, then workers)
      const leaders = ['risk-oracle', 'test-architect'].filter(a => agents.includes(a));
      const workers = agents.filter(a => !leaders.includes(a));

      // Leaders analyze first
      for (const leader of leaders) {
        const result = await this.runAgentEnhanced(leader, {
          task: args.objective,
          projectPath: args.projectPath,
          sessionId,
          enableCoordination: true
        });
        results.push(result);
      }

      // Workers execute with leader context
      const leaderContext = results;
      const workerPromises = workers.map(worker =>
        this.runAgentEnhanced(worker, {
          task: args.objective,
          projectPath: args.projectPath,
          sessionId,
          enableCoordination: true,
          sharedContext: leaderContext
        })
      );
      const workerResults = await Promise.all(workerPromises);
      results.push(...workerResults);

    } else if (args.strategy === 'adaptive') {
      // Adaptive strategy based on objective analysis
      const analysisAgent = 'risk-oracle';
      const analysisResult = await this.runAgentEnhanced(analysisAgent, {
        task: `Analyze and prioritize: ${args.objective}`,
        projectPath: args.projectPath,
        sessionId,
        enableCoordination: true
      });
      results.push(analysisResult);

      // Select next agents based on analysis
      const nextAgents = this.selectAgentsBasedOnAnalysis(analysisResult, agents);
      for (const agent of nextAgents) {
        const result = await this.runAgentEnhanced(agent, {
          task: args.objective,
          projectPath: args.projectPath,
          sessionId,
          enableCoordination: true,
          sharedContext: [analysisResult]
        });
        results.push(result);
      }
    }

    // End session and collect metrics
    this.sessionManager.endSession(sessionId);
    const metrics = this.sessionManager.getSessionMetrics(sessionId);

    const summaryMode = config.response.summaryMode;
    const maxResponseLength = config.response.maxLength;

    const fullResponse = {
      sessionId,
      strategy: args.strategy,
      agents: agents,
      results,
      metrics,
      summary: this.generateCoordinationSummary(results, agents, args.objective)
    };

    // Truncate results if too large
    if (summaryMode) {
      const responseStr = JSON.stringify(fullResponse);
      if (responseStr.length > maxResponseLength) {
        // Return condensed version
        return {
          sessionId,
          strategy: args.strategy,
          agents: agents,
          resultsCount: results.length,
          metrics,
          summary: this.generateCoordinationSummary(results, agents, args.objective),
          note: `Full results truncated (${results.length} analyses). Use QE_MCP_SUMMARY_MODE=false for full output.`
        };
      }
    }

    return fullResponse;
  }

  async runSwarmEnhanced(args) {
    const { objective, strategy = config.swarm.defaultStrategy || 'comprehensive', maxAgents = config.swarm.maxAgents || 5, summaryMode = config.swarm.forceSummaryMode !== false } = args;

    // Select agents based on strategy
    let agentNames = this.selectSwarmAgents(strategy, maxAgents);

    // Use hierarchical coordination for swarms
    const result = await this.coordinateAgents({
      agents: agentNames,
      objective,
      strategy: strategy === 'adaptive' ? 'adaptive' : 'hierarchical',
      projectPath: args.projectPath,
      summaryMode
    });

    // Return ultra-concise for swarm operations
    if (summaryMode) {
      return {
        swarmStrategy: strategy,
        agents: agentNames.length,
        status: 'complete',
        sessionId: result.sessionId,
        metrics: result.metrics,
        summary: result.summary || 'Swarm analysis complete'
      };
    }

    return {
      swarmStrategy: strategy,
      ...result
    };
  }

  selectSwarmAgents(strategy, maxAgents) {
    const strategies = {
      'comprehensive': ['risk-oracle', 'test-architect', 'security-sentinel', 'requirements-explorer', 'performance-tester'],
      'risk-based': ['risk-oracle', 'security-sentinel', 'chaos-engineer', 'boundary-explorer'],
      'exploratory': ['exploratory-tester', 'boundary-explorer', 'usability-advocate'],
      'regression': ['regression-guardian', 'test-orchestrator', 'test-cartographer'],
      'adaptive': ['risk-oracle', 'test-strategist', 'ai-test-generator']
    };

    return (strategies[strategy] || strategies.comprehensive).slice(0, maxAgents);
  }

  selectAgentsBasedOnAnalysis(analysisResult, availableAgents) {
    // Simple heuristic - in real implementation, parse analysis result
    const riskKeywords = ['security', 'vulnerability', 'risk', 'threat'];
    const perfKeywords = ['performance', 'speed', 'latency', 'throughput'];
    const testKeywords = ['test', 'coverage', 'quality', 'validation'];

    const selected = [];
    const resultText = JSON.stringify(analysisResult).toLowerCase();

    if (riskKeywords.some(k => resultText.includes(k))) {
      selected.push('security-sentinel', 'risk-oracle');
    }
    if (perfKeywords.some(k => resultText.includes(k))) {
      selected.push('performance-tester', 'chaos-engineer');
    }
    if (testKeywords.some(k => resultText.includes(k))) {
      selected.push('test-architect', 'tdd-pair-programmer');
    }

    // Filter to available agents and limit
    return selected.filter(a => availableAgents.includes(a)).slice(0, 3);
  }

  generateCoordinationSummary(results, agents, objective) {
    const summaryMode = config.response.summaryMode;

    if (summaryMode) {
      // Ultra-concise summary for MCP
      return `## Summary: ${objective.substring(0, 50)}...
Agents: ${agents.length} | Results: ${results.length}
Status: Complete`;
    }

    return `# Coordinated Analysis Summary

**Objective**: ${objective}
**Agents Used**: ${agents.length} (${agents.join(', ')})
**Results Generated**: ${results.length}

## Key Findings
${results.slice(0, 3).map((r, i) => `${i + 1}. ${agents[i]}: Analysis completed`).join('\n')}

## Recommendations
Based on the coordinated analysis, consider:
1. Review all agent reports for comprehensive insights
2. Prioritize findings based on risk and impact
3. Implement suggested improvements iteratively
`;
  }

  async listAgentsEnhanced(args) {
    let filtered = agents;

    if (args.category) {
      filtered = agents.filter(a => a.category === args.category);
    }

    const agentList = filtered.map(a => {
      const toolName = `qe_${a.name.replace(/-/g, '_')}`;
      const metrics = args.includeMetrics ? this.toolRegistry.getMetrics(toolName) : null;
      const capabilities = args.includeCapabilities ? (a.capabilities || []) : null;

      return {
        name: a.name,
        category: a.category,
        description: a.description,
        capabilities,
        metrics,
        metadata: {
          tags: a.tags || [],
          estimatedTime: a.estimatedTime || 'medium'
        }
      };
    });

    return {
      total: agentList.length,
      agents: agentList,
      categories: Array.from(new Set(agents.map(a => a.category))),
      summary: `Found ${agentList.length} QE agents across ${Array.from(new Set(agents.map(a => a.category))).length} categories`
    };
  }

  async analyzeProjectStructure(projectPath, options = {}) {
    const analysis = {
      structure: {},
      files: [],
      languages: new Set(),
      frameworks: [],
      testFiles: [],
      issues: [],
      metrics: {
        totalFiles: 0,
        totalLines: 0,
        complexity: 'medium'
      }
    };

    // Skip detailed structure in lightweight mode
    const lightweight = options.lightweight || false;

    try {
      // Get all source files
      const sourceFiles = await glob('**/*.{js,ts,jsx,tsx,py,java,go,rs,cpp,c,h}', {
        cwd: projectPath,
        ignore: ['node_modules/**', 'dist/**', 'build/**', '.git/**'],
      });
      analysis.files = sourceFiles;
      analysis.metrics.totalFiles = sourceFiles.length;

      // Identify languages
      sourceFiles.forEach(file => {
        const ext = path.extname(file);
        if (['.js', '.jsx', '.ts', '.tsx'].includes(ext)) analysis.languages.add('JavaScript/TypeScript');
        if (['.py'].includes(ext)) analysis.languages.add('Python');
        if (['.java'].includes(ext)) analysis.languages.add('Java');
        if (['.go'].includes(ext)) analysis.languages.add('Go');
        if (['.rs'].includes(ext)) analysis.languages.add('Rust');
      });

      // Find test files
      if (options.includeTests) {
        analysis.testFiles = await glob('**/*.{test,spec}.{js,ts,jsx,tsx}', {
          cwd: projectPath,
          ignore: ['node_modules/**'],
        });
      }

      // Check for frameworks
      const packageJsonPath = path.join(projectPath, 'package.json');
      if (await fs.pathExists(packageJsonPath)) {
        const packageJson = await fs.readJson(packageJsonPath);
        const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

        if (deps.react) analysis.frameworks.push('React');
        if (deps.vue) analysis.frameworks.push('Vue');
        if (deps.angular) analysis.frameworks.push('Angular');
        if (deps.express) analysis.frameworks.push('Express');
        if (deps.jest) analysis.frameworks.push('Jest');
        if (deps.typescript) analysis.frameworks.push('TypeScript');
      }

      // Get directory structure (skip in lightweight mode)
      if (!lightweight) {
        analysis.structure = await this.getDirectoryStructure(projectPath);
      } else {
        analysis.structure = { note: 'Structure analysis skipped (lightweight mode)' };
      }

      // Estimate complexity
      if (analysis.files.length > 100) analysis.metrics.complexity = 'high';
      else if (analysis.files.length > 30) analysis.metrics.complexity = 'medium';
      else analysis.metrics.complexity = 'low';

    } catch (error) {
      analysis.issues.push({
        type: 'analysis_error',
        message: error.message || String(error),
      });
    }

    return analysis;
  }

  async getDirectoryStructure(dirPath, maxDepth = 3, currentDepth = 0) {
    if (currentDepth >= maxDepth) return null;

    const structure = {};
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name.startsWith('.') || ['node_modules', 'dist', 'build'].includes(entry.name)) {
        continue;
      }

      if (entry.isDirectory()) {
        structure[entry.name] = await this.getDirectoryStructure(
          path.join(dirPath, entry.name),
          maxDepth,
          currentDepth + 1
        );
      } else {
        structure[entry.name] = 'file';
      }
    }

    return structure;
  }

  async executeAgentWithContext(context) {
    const { agent, task, projectPath, projectAnalysis, analysisDepth, coordinationData, sessionId } = context;

    // Get response limit from configuration
    const maxTokens = config.response.maxTokens;
    const summaryMode = config.response.summaryMode;

    // Build concise analysis
    let analysisPrompt = `
## Task
${task}

## Project Context
- **Path**: ${projectPath}
- **Name**: ${path.basename(projectPath)}
- **Files**: ${projectAnalysis.files.length} source files
- **Languages**: ${Array.from(projectAnalysis.languages).join(', ')}
- **Frameworks**: ${projectAnalysis.frameworks.join(', ') || 'None detected'}
- **Test Files**: ${projectAnalysis.testFiles.length} test files
- **Complexity**: ${projectAnalysis.metrics.complexity}
`;

    // Add coordination context if available
    if (coordinationData) {
      analysisPrompt += `
## Coordination Context
- **Current Agent**: ${coordinationData.currentAgent}
- **Other Active Agents**: ${coordinationData.otherAgents.join(', ') || 'None'}
- **Shared Insights**: ${coordinationData.sharedContext ? 'Available' : 'None'}
`;
    }

    if (analysisDepth === 'deep' && projectAnalysis.files.length > 0) {
      // For deep analysis, just mention key files without including content
      const keyFiles = projectAnalysis.files.slice(0, 5);
      analysisPrompt += `\n## Key Files Identified:\n${keyFiles.map(f => `- ${f}`).join('\n')}\n`;
    }

    // Store analysis in session memory
    if (sessionId) {
      this.sessionManager.storeMemory(sessionId, `${agent.name}_analysis`, analysisPrompt);
    }

    // Return formatted analysis with coordination insights
    const fullReport = `
# ${agent.name} Analysis Report

**Agent**: ${agent.name}
**Category**: ${agent.category}
**Project**: ${path.basename(projectPath)}
${coordinationData ? `**Session**: ${sessionId}` : ''}

## Analysis

${analysisPrompt}

## Key Findings
- **Project Type**: ${projectAnalysis.frameworks.length > 0 ? projectAnalysis.frameworks[0] : 'Generic'} project
- **Test Coverage**: ${projectAnalysis.testFiles.length} test files found
- **Complexity**: ${projectAnalysis.metrics.complexity} (${projectAnalysis.files.length} source files)

## Recommendations
1. ${analysisDepth === 'deep' ? 'Continue with detailed code analysis' : 'Consider deep analysis for more insights'}
2. ${coordinationData ? 'Coordinate with other agents for comprehensive coverage' : 'Consider multi-agent analysis'}
3. ${projectAnalysis.testFiles.length === 0 ? 'Add test files for better quality assurance' : 'Enhance existing test coverage'}
`;

    // Check if we're in summary mode and should truncate
    if (summaryMode && fullReport.length > maxTokens * 4) {
      // Create a concise summary instead
      const summary = `
# ${agent.name} Summary

**Project**: ${path.basename(projectPath)} | **Files**: ${projectAnalysis.files.length} | **Tests**: ${projectAnalysis.testFiles.length}
**Languages**: ${Array.from(projectAnalysis.languages).join(', ')}
**Complexity**: ${projectAnalysis.metrics.complexity}

## Key Points
- Task: ${task.substring(0, 100)}${task.length > 100 ? '...' : ''}
- Test coverage ${projectAnalysis.testFiles.length > 0 ? 'exists' : 'missing'}
- ${projectAnalysis.frameworks.length > 0 ? `Using ${projectAnalysis.frameworks[0]}` : 'No framework detected'}

## Quick Recommendations
1. ${projectAnalysis.testFiles.length === 0 ? 'Add tests' : 'Expand test coverage'}
2. ${analysisDepth === 'deep' ? 'Deep analysis in progress' : 'Run deep analysis for details'}

[Full analysis available - ${Math.round(fullReport.length / 4)} tokens]
`;
      return summary;
    }

    return fullReport;
  }

  selectAgentsForObjective(objective, requestedAgents) {
    if (requestedAgents && requestedAgents.length > 0) {
      return requestedAgents;
    }

    // Auto-select based on keywords
    const selected = [];
    const objectiveLower = objective.toLowerCase();

    if (objectiveLower.includes('risk') || objectiveLower.includes('security')) {
      selected.push('risk-oracle', 'security-sentinel');
    }
    if (objectiveLower.includes('test') || objectiveLower.includes('coverage')) {
      selected.push('test-architect', 'tdd-pair-programmer');
    }
    if (objectiveLower.includes('performance')) {
      selected.push('performance-tester', 'chaos-engineer');
    }
    if (objectiveLower.includes('requirement')) {
      selected.push('requirements-explorer', 'specification-validator');
    }

    // Default
    if (selected.length === 0) {
      selected.push('risk-oracle', 'test-strategist', 'exploratory-tester');
    }

    return selected.slice(0, 5);
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('[QE MCP Enhanced] Server started with Claude Flow patterns');
    console.error(`[QE MCP Enhanced] ${this.toolRegistry.tools.size} tools registered`);
    console.error(`[QE MCP Enhanced] Categories: ${Array.from(this.toolRegistry.categories).join(', ')}`);
  }
}

// Start the server
if (require.main === module) {
  const server = new QEMCPServerEnhanced();
  server.start().catch(console.error);
}