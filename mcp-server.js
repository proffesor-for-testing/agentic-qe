#!/usr/bin/env node
/**
 * QE Framework MCP Server (JavaScript version)
 * Exposes Quality Engineering agents as MCP tools for Claude Code
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

const execAsync = promisify(exec);

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

    console.error(`[QE MCP] Loaded ${agents.length} agents`);
  } catch (error) {
    console.error('[QE MCP] Failed to load agents:', error);
  }
}

class QEMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'qe-framework-mcp',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    this.activeAnalyses = new Map();
    this.setupHandlers();
    this.initializeAgents();
  }

  async initializeAgents() {
    await loadAgents();
  }

  setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: await this.getTools(),
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) =>
      this.handleToolCall(request.params.name, request.params.arguments || {}),
    );
  }

  async getTools() {
    const tools = [];

    // Create a tool for each agent
    for (const agent of agents) {
      tools.push({
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
              description: 'Path to the project to analyze (defaults to current directory)',
            },
            analysisDepth: {
              type: 'string',
              enum: ['shallow', 'medium', 'deep'],
              description: 'Depth of analysis to perform',
              default: 'medium',
            },
            includeTests: {
              type: 'boolean',
              description: 'Include test file analysis',
              default: true,
            },
          },
          required: ['task'],
        },
      });
    }

    // Add meta-tools
    tools.push(
      {
        name: 'qe_analyze_project',
        description: 'Comprehensive project analysis using multiple QE agents',
        inputSchema: {
          type: 'object',
          properties: {
            projectPath: {
              type: 'string',
              description: 'Path to project',
            },
            agents: {
              type: 'array',
              items: { type: 'string' },
              description: 'Specific agents to use (optional)',
            },
            objective: {
              type: 'string',
              description: 'Analysis objective',
            },
          },
          required: ['objective'],
        },
      },
      {
        name: 'qe_list_agents',
        description: 'List all available QE agents and their capabilities',
        inputSchema: {
          type: 'object',
          properties: {
            category: {
              type: 'string',
              description: 'Filter by category',
            },
          },
        },
      },
      {
        name: 'qe_swarm',
        description: 'Coordinate multiple QE agents for comprehensive testing',
        inputSchema: {
          type: 'object',
          properties: {
            objective: {
              type: 'string',
              description: 'Testing objective',
            },
            strategy: {
              type: 'string',
              enum: ['comprehensive', 'risk-based', 'exploratory', 'regression'],
              description: 'Testing strategy',
            },
            maxAgents: {
              type: 'number',
              description: 'Maximum number of agents to use',
              default: 5,
            },
          },
          required: ['objective'],
        },
      }
    );

    return tools;
  }

  async handleToolCall(toolName, args) {
    try {
      console.error(`[QE MCP] Handling tool call: ${toolName}`, args);

      // Handle meta-tools
      if (toolName === 'qe_list_agents') {
        return await this.listAgents(args);
      }

      if (toolName === 'qe_analyze_project') {
        return await this.analyzeProject(args);
      }

      if (toolName === 'qe_swarm') {
        return await this.runSwarm(args);
      }

      // Handle individual agent tools
      if (toolName.startsWith('qe_')) {
        const agentName = toolName.substring(3).replace(/_/g, '-');
        return await this.runAgent(agentName, args);
      }

      return {
        content: [
          {
            type: 'text',
            text: `Unknown tool: ${toolName}`,
          },
        ],
      };
    } catch (error) {
      console.error(`[QE MCP] Error handling tool ${toolName}:`, error);
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

  async runAgent(agentName, args) {
    const projectPath = args.projectPath || process.cwd();

    // Find agent
    const agent = agents.find(a => a.name === agentName);
    if (!agent) {
      return {
        content: [
          {
            type: 'text',
            text: `Agent not found: ${agentName}`,
          },
        ],
        isError: true,
      };
    }

    // Analyze project structure
    const analysis = await this.analyzeProjectStructure(projectPath, args);

    // Execute agent with context
    const result = await this.executeAgentWithContext({
      agent,
      task: args.task,
      projectPath,
      projectAnalysis: analysis,
      analysisDepth: args.analysisDepth || 'medium',
    });

    return {
      content: [
        {
          type: 'text',
          text: result,
        },
      ],
    };
  }

  async analyzeProjectStructure(projectPath, options) {
    const analysis = {
      structure: {},
      files: [],
      languages: new Set(),
      frameworks: [],
      testFiles: [],
      issues: [],
    };

    try {
      // Get all source files
      const sourceFiles = await glob('**/*.{js,ts,jsx,tsx,py,java,go,rs,cpp,c,h}', {
        cwd: projectPath,
        ignore: ['node_modules/**', 'dist/**', 'build/**', '.git/**'],
      });
      analysis.files = sourceFiles;

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

      // Get directory structure
      analysis.structure = await this.getDirectoryStructure(projectPath);

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
    const { agent, task, projectPath, projectAnalysis, analysisDepth } = context;

    // Build comprehensive analysis
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

## Project Structure
\`\`\`
${JSON.stringify(projectAnalysis.structure, null, 2)}
\`\`\`
`;

    if (analysisDepth === 'deep' && projectAnalysis.files.length > 0) {
      // Read sample files for deep analysis
      const keyFiles = projectAnalysis.files.slice(0, 5);
      analysisPrompt += '\n## Sample Files Analyzed:\n';

      for (const file of keyFiles) {
        const filePath = path.join(projectPath, file);
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          const preview = content.substring(0, 300);
          analysisPrompt += `\n### ${file}\n\`\`\`\n${preview}\n...\n\`\`\`\n`;
        } catch (error) {
          // Skip unreadable files
        }
      }
    }

    // Return formatted analysis
    return `
# ${agent.name} Analysis Report

**Agent**: ${agent.name}
**Category**: ${agent.category}
**Project**: ${path.basename(projectPath)}

## Analysis

${analysisPrompt}

## Capabilities Applied
${agent.capabilities ? agent.capabilities.map(cap => `- ${cap}`).join('\n') : 'No specific capabilities listed'}

## Recommendations

Based on the project structure and the task "${task}":

1. **Project Type**: ${projectAnalysis.frameworks.length > 0 ? projectAnalysis.frameworks[0] : 'Generic'} project
2. **Test Coverage**: ${projectAnalysis.testFiles.length} test files found
3. **Complexity**: ${projectAnalysis.files.length} source files to analyze

## Next Steps

For deeper analysis with AI-powered recommendations:
1. Use the Anthropic API integration for intelligent insights
2. Combine multiple agents for comprehensive testing
3. Enable deep analysis mode for code-level inspection

*Note: This is a structural analysis. For AI-powered recommendations specific to your code, ensure the Anthropic API is configured.*
`;
  }

  async listAgents(args) {
    let filtered = agents;

    if (args.category) {
      filtered = agents.filter(a => a.category === args.category);
    }

    const agentList = filtered.map(a => ({
      name: a.name,
      category: a.category,
      description: a.description,
      capabilities: a.capabilities?.length || 0,
    }));

    return {
      content: [
        {
          type: 'text',
          text: `Found ${agentList.length} QE agents:\n\n${
            agentList.map(a => `• **${a.name}** (${a.category}): ${a.description}`).join('\n')
          }`,
        },
      ],
    };
  }

  async analyzeProject(args) {
    const projectPath = args.projectPath || process.cwd();
    const objective = args.objective;

    // Select agents
    const selectedAgents = this.selectAgentsForObjective(objective, args.agents);

    let results = [];

    for (const agentName of selectedAgents) {
      const result = await this.runAgent(agentName, {
        task: objective,
        projectPath,
        analysisDepth: 'deep',
        includeTests: true,
      });

      if (result.content && result.content.length > 0) {
        results.push(result.content[0].text);
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: results.join('\n\n---\n\n'),
        },
      ],
    };
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

    // Default
    if (selected.length === 0) {
      selected.push('risk-oracle', 'test-strategist');
    }

    return selected.slice(0, 5);
  }

  async runSwarm(args) {
    const { objective, strategy = 'comprehensive', maxAgents = 5 } = args;

    let agentNames = [];

    switch (strategy) {
      case 'comprehensive':
        agentNames = ['risk-oracle', 'test-architect', 'security-sentinel', 'requirements-explorer'];
        break;
      case 'risk-based':
        agentNames = ['risk-oracle', 'security-sentinel', 'chaos-engineer'];
        break;
      case 'exploratory':
        agentNames = ['exploratory-tester', 'boundary-explorer'];
        break;
      case 'regression':
        agentNames = ['regression-guardian', 'test-orchestrator'];
        break;
    }

    agentNames = agentNames.slice(0, maxAgents);

    const swarmResults = await this.analyzeProject({
      objective,
      agents: agentNames,
      projectPath: process.cwd(),
    });

    return {
      content: [
        {
          type: 'text',
          text: `# QE Swarm Analysis\n\n**Strategy**: ${strategy}\n**Agents**: ${agentNames.join(', ')}\n\n${swarmResults.content[0].text}`,
        },
      ],
    };
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('[QE MCP] Server started and listening for connections');
  }
}

// Start the server
if (require.main === module) {
  const server = new QEMCPServer();
  server.start().catch(console.error);
}