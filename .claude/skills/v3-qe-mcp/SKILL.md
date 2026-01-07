# v3-qe-mcp

## Purpose
Guide the implementation of MCP (Model Context Protocol) tools for AQE v3, enabling AI agent integration and tool orchestration.

## Activation
- When implementing MCP server tools
- When adding AI agent capabilities
- When integrating with Claude/LLM providers
- When building tool orchestration

## MCP Architecture

### 1. QE MCP Server

```typescript
// v3/src/mcp/server/QEMCPServer.ts
import { Server, McpError, ErrorCode } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

export class QEMCPServer {
  private readonly server: Server;
  private readonly coordinator: QEFleetCoordinator;
  private readonly memory: QEAgentDB;

  constructor(config: MCPServerConfig) {
    this.server = new Server(
      {
        name: 'agentic-qe',
        version: '3.0.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {}
        }
      }
    );

    this.coordinator = new QEFleetCoordinator(config.fleet);
    this.memory = new QEAgentDB(config.memory);

    this.registerTools();
    this.registerResources();
    this.registerPrompts();
  }

  private registerTools(): void {
    this.server.setRequestHandler('tools/list', async () => ({
      tools: QE_MCP_TOOLS
    }));

    this.server.setRequestHandler('tools/call', async (request) => {
      const { name, arguments: args } = request.params;
      return await this.executeTool(name, args);
    });
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}
```

### 2. QE MCP Tools

```typescript
// v3/src/mcp/tools/index.ts
export const QE_MCP_TOOLS = [
  // Test Generation Tools
  {
    name: 'qe_test_generate',
    description: 'Generate tests for source code using AI-powered analysis',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to source file or directory' },
        framework: { type: 'string', enum: ['jest', 'vitest', 'playwright', 'pytest'] },
        testType: { type: 'string', enum: ['unit', 'integration', 'e2e'] },
        coverage: { type: 'number', description: 'Target coverage percentage' },
        aiPowered: { type: 'boolean', default: true }
      },
      required: ['path']
    }
  },

  // Coverage Analysis Tools
  {
    name: 'qe_coverage_analyze',
    description: 'Analyze code coverage with O(log n) gap detection',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to analyze' },
        threshold: { type: 'number', description: 'Coverage threshold' },
        includeGaps: { type: 'boolean', default: true },
        useVectors: { type: 'boolean', default: true }
      }
    }
  },

  {
    name: 'qe_coverage_gaps',
    description: 'Find coverage gaps using HNSW vector search',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        limit: { type: 'number', default: 20 },
        minSeverity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] }
      }
    }
  },

  // Quality Assessment Tools
  {
    name: 'qe_quality_gate',
    description: 'Evaluate quality gate criteria',
    inputSchema: {
      type: 'object',
      properties: {
        gateName: { type: 'string', default: 'default' },
        strict: { type: 'boolean', default: false }
      }
    }
  },

  {
    name: 'qe_quality_metrics',
    description: 'Get quality metrics for the project',
    inputSchema: {
      type: 'object',
      properties: {
        includeTrend: { type: 'boolean' },
        compareBaseline: { type: 'string' }
      }
    }
  },

  // Fleet Management Tools
  {
    name: 'qe_fleet_init',
    description: 'Initialize QE agent fleet',
    inputSchema: {
      type: 'object',
      properties: {
        topology: { type: 'string', enum: ['hierarchical', 'mesh', 'ring'] },
        maxAgents: { type: 'number', default: 21 }
      }
    }
  },

  {
    name: 'qe_fleet_status',
    description: 'Get status of QE agent fleet',
    inputSchema: {
      type: 'object',
      properties: {
        verbose: { type: 'boolean', default: false }
      }
    }
  },

  {
    name: 'qe_agent_spawn',
    description: 'Spawn a specialized QE agent',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: [
            'test-architect', 'tdd-specialist', 'coverage-specialist',
            'quality-gate', 'defect-predictor', 'parallel-executor',
            'learning-coordinator', 'flaky-hunter', 'security-scanner'
          ]
        },
        task: { type: 'string', description: 'Initial task to assign' }
      },
      required: ['type']
    }
  },

  {
    name: 'qe_task_orchestrate',
    description: 'Orchestrate a QE task across the fleet',
    inputSchema: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'Task description' },
        protocol: { type: 'string', description: 'Protocol to use' },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
        maxAgents: { type: 'number' }
      },
      required: ['task']
    }
  },

  // Memory Tools
  {
    name: 'qe_memory_store',
    description: 'Store data in QE memory with optional embedding',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string' },
        value: { type: 'object' },
        namespace: { type: 'string', default: 'default' },
        ttl: { type: 'number', description: 'Time to live in seconds' },
        persist: { type: 'boolean', default: false }
      },
      required: ['key', 'value']
    }
  },

  {
    name: 'qe_memory_retrieve',
    description: 'Retrieve data from QE memory',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string' },
        namespace: { type: 'string', default: 'default' }
      },
      required: ['key']
    }
  },

  {
    name: 'qe_memory_search',
    description: 'Semantic search in QE memory using vectors',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        namespace: { type: 'string' },
        limit: { type: 'number', default: 10 }
      },
      required: ['query']
    }
  },

  // Learning Tools
  {
    name: 'qe_learn_pattern',
    description: 'Learn a new pattern from test results',
    inputSchema: {
      type: 'object',
      properties: {
        pattern: { type: 'object' },
        source: { type: 'string' }
      },
      required: ['pattern']
    }
  },

  {
    name: 'qe_learn_status',
    description: 'Get learning status and progress',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string' },
        detailed: { type: 'boolean', default: false }
      }
    }
  }
];
```

### 3. Tool Implementations

```typescript
// v3/src/mcp/tools/implementations/testGeneration.ts
export async function executeTestGenerate(
  args: TestGenerateArgs,
  coordinator: QEFleetCoordinator
): Promise<ToolResult> {
  try {
    const result = await coordinator.orchestrate({
      type: 'test-generation',
      task: 'generate',
      target: args.path,
      options: {
        framework: args.framework || 'jest',
        testType: args.testType || 'unit',
        coverage: args.coverage || 80,
        aiPowered: args.aiPowered !== false
      }
    });

    return {
      content: [
        {
          type: 'text',
          text: formatTestGenerationResult(result)
        }
      ],
      isError: false
    };
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Error: ${error.message}` }],
      isError: true
    };
  }
}

// v3/src/mcp/tools/implementations/coverage.ts
export async function executeCoverageAnalyze(
  args: CoverageAnalyzeArgs,
  coordinator: QEFleetCoordinator
): Promise<ToolResult> {
  const result = await coordinator.orchestrate({
    type: 'coverage-analysis',
    task: 'analyze',
    target: args.path || '.',
    options: {
      threshold: args.threshold || 80,
      includeGaps: args.includeGaps !== false,
      useVectors: args.useVectors !== false
    }
  });

  return {
    content: [
      {
        type: 'text',
        text: formatCoverageResult(result)
      }
    ],
    isError: false
  };
}

// v3/src/mcp/tools/implementations/fleet.ts
export async function executeFleetStatus(
  args: FleetStatusArgs,
  coordinator: QEFleetCoordinator
): Promise<ToolResult> {
  const status = await coordinator.getFleetStatus();

  const summary = {
    totalAgents: status.totalAgents,
    activeAgents: status.activeAgents,
    groups: status.groups.map(g => ({
      name: g.name,
      agents: g.totalAgents,
      active: g.activeAgents,
      status: g.status
    })),
    tasksCompleted: status.tasksCompleted,
    patternsLearned: status.patternsLearned
  };

  if (args.verbose) {
    summary.agentDetails = status.agents;
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(summary, null, 2)
      }
    ],
    isError: false
  };
}
```

### 4. MCP Resources

```typescript
// v3/src/mcp/resources/index.ts
export const QE_MCP_RESOURCES = [
  {
    uri: 'qe://fleet/status',
    name: 'Fleet Status',
    description: 'Current status of the QE agent fleet',
    mimeType: 'application/json'
  },
  {
    uri: 'qe://coverage/report',
    name: 'Coverage Report',
    description: 'Latest coverage analysis report',
    mimeType: 'application/json'
  },
  {
    uri: 'qe://quality/metrics',
    name: 'Quality Metrics',
    description: 'Current quality metrics',
    mimeType: 'application/json'
  },
  {
    uri: 'qe://learning/patterns',
    name: 'Learning Patterns',
    description: 'Learned patterns from test results',
    mimeType: 'application/json'
  }
];

// Resource handlers
export async function handleResourceRead(uri: string): Promise<ResourceContent> {
  switch (uri) {
    case 'qe://fleet/status':
      return await getFleetStatusResource();
    case 'qe://coverage/report':
      return await getCoverageReportResource();
    case 'qe://quality/metrics':
      return await getQualityMetricsResource();
    case 'qe://learning/patterns':
      return await getLearningPatternsResource();
    default:
      throw new McpError(ErrorCode.InvalidRequest, `Unknown resource: ${uri}`);
  }
}
```

### 5. MCP Prompts

```typescript
// v3/src/mcp/prompts/index.ts
export const QE_MCP_PROMPTS = [
  {
    name: 'generate-tests',
    description: 'Generate comprehensive tests for source code',
    arguments: [
      { name: 'path', description: 'Path to source code', required: true },
      { name: 'framework', description: 'Test framework to use', required: false }
    ]
  },
  {
    name: 'analyze-quality',
    description: 'Analyze code quality and coverage',
    arguments: [
      { name: 'path', description: 'Path to analyze', required: false }
    ]
  },
  {
    name: 'investigate-failure',
    description: 'Investigate a test failure',
    arguments: [
      { name: 'testId', description: 'Test identifier', required: true },
      { name: 'errorMessage', description: 'Error message', required: false }
    ]
  }
];

// Prompt handlers
export async function handlePromptGet(name: string, args: Record<string, string>): Promise<PromptResult> {
  switch (name) {
    case 'generate-tests':
      return generateTestsPrompt(args.path, args.framework);
    case 'analyze-quality':
      return analyzeQualityPrompt(args.path);
    case 'investigate-failure':
      return investigateFailurePrompt(args.testId, args.errorMessage);
    default:
      throw new McpError(ErrorCode.InvalidRequest, `Unknown prompt: ${name}`);
  }
}
```

### 6. Security Configuration

```typescript
// v3/src/mcp/security/MCPSecurity.ts
export class MCPSecurityManager {
  private readonly allowedOrigins: Set<string>;
  private readonly rateLimiter: RateLimiter;

  constructor(config: MCPSecurityConfig) {
    this.allowedOrigins = new Set(config.allowedOrigins);
    this.rateLimiter = new RateLimiter(config.rateLimit);
  }

  validateRequest(request: MCPRequest): void {
    // Check origin
    if (!this.allowedOrigins.has(request.origin)) {
      throw new McpError(ErrorCode.InvalidRequest, 'Unauthorized origin');
    }

    // Rate limiting
    if (!this.rateLimiter.allow(request.clientId)) {
      throw new McpError(ErrorCode.InvalidRequest, 'Rate limit exceeded');
    }

    // Input validation
    this.validateInput(request.params);
  }

  private validateInput(params: unknown): void {
    // Prevent path traversal
    if (typeof params === 'object' && params !== null) {
      for (const [key, value] of Object.entries(params)) {
        if (typeof value === 'string' && value.includes('..')) {
          throw new McpError(ErrorCode.InvalidParams, `Path traversal detected in ${key}`);
        }
      }
    }
  }
}
```

## MCP Tool Reference

| Tool | Description | Domain |
|------|-------------|--------|
| `qe_test_generate` | AI-powered test generation | test-generation |
| `qe_coverage_analyze` | O(log n) coverage analysis | coverage-analysis |
| `qe_coverage_gaps` | Find coverage gaps | coverage-analysis |
| `qe_quality_gate` | Evaluate quality gate | quality-assessment |
| `qe_fleet_init` | Initialize agent fleet | coordination |
| `qe_fleet_status` | Get fleet status | coordination |
| `qe_agent_spawn` | Spawn QE agent | coordination |
| `qe_task_orchestrate` | Orchestrate tasks | coordination |
| `qe_memory_store` | Store in memory | memory |
| `qe_memory_search` | Semantic search | memory |
| `qe_learn_pattern` | Learn patterns | learning |

## Implementation Checklist

- [ ] Implement QE MCP Server
- [ ] Add all QE tools
- [ ] Create resource handlers
- [ ] Implement prompt handlers
- [ ] Add security manager
- [ ] Write MCP tests
- [ ] Document tool schemas

## Related Skills
- v3-qe-fleet-coordination - Agent orchestration
- v3-qe-memory-system - Memory integration
- v3-qe-security - Security patterns
