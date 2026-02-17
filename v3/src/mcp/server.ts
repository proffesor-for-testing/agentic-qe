/**
 * Agentic QE v3 - MCP Server
 * Model Context Protocol server for AI integration
 */

import { ToolRegistry, createToolRegistry } from './tool-registry';
import { ToolDefinition, ToolHandler, ToolResult } from './types';

/**
 * A tool entry pairs a definition with a handler function.
 * We use a widened handler signature here so that handlers with specific
 * parameter types (e.g., TaskSubmitParams) are assignable without `as any`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ToolEntry = { definition: ToolDefinition; handler: (params: any) => Promise<ToolResult<any>> };
import {
  // Core handlers
  handleFleetInit,
  handleFleetStatus,
  handleFleetHealth,
  disposeFleet,
  // Task handlers
  handleTaskSubmit,
  handleTaskList,
  handleTaskStatus,
  handleTaskCancel,
  handleTaskOrchestrate,
  // Agent handlers
  handleAgentList,
  handleAgentSpawn,
  handleAgentMetrics,
  handleAgentStatus,
  // Domain handlers
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
  // Memory handlers
  handleMemoryStore,
  handleMemoryRetrieve,
  handleMemoryQuery,
  handleMemoryDelete,
  handleMemoryUsage,
  handleMemoryShare,
  // Cross-phase handlers
  handleCrossPhaseStore,
  handleCrossPhaseQuery,
  handleAgentComplete,
  handlePhaseStart,
  handlePhaseEnd,
  handleCrossPhaseStats,
  handleFormatSignals,
  handleCrossPhaseCleanup,
} from './handlers';

// ============================================================================
// Tool Definitions
// ============================================================================

const CORE_TOOLS: ToolEntry[] = [
  // Fleet Init
  {
    definition: {
      name: 'mcp__agentic_qe__fleet_init',
      description: 'Initialize the AQE v3 fleet with specified topology and configuration',
      category: 'core',
      parameters: [
        { name: 'topology', type: 'string', description: 'Swarm topology type', enum: ['hierarchical', 'mesh', 'ring', 'adaptive'] },
        { name: 'maxAgents', type: 'number', description: 'Maximum number of agents', default: 15 },
        { name: 'testingFocus', type: 'array', description: 'Areas of testing focus' },
        { name: 'frameworks', type: 'array', description: 'Testing frameworks to support' },
        { name: 'environments', type: 'array', description: 'Target environments' },
        { name: 'enabledDomains', type: 'array', description: 'Domains to enable' },
        { name: 'lazyLoading', type: 'boolean', description: 'Enable lazy loading', default: true },
        { name: 'memoryBackend', type: 'string', description: 'Memory backend type', enum: ['sqlite', 'agentdb', 'hybrid'] },
      ],
    },
    handler: handleFleetInit,
  },

  // Fleet Status
  {
    definition: {
      name: 'mcp__agentic_qe__fleet_status',
      description: 'Get current fleet status including agents, tasks, and health',
      category: 'core',
      parameters: [
        { name: 'verbose', type: 'boolean', description: 'Include detailed information', default: false },
        { name: 'includeDomains', type: 'boolean', description: 'Include domain status', default: false },
        { name: 'includeMetrics', type: 'boolean', description: 'Include performance metrics', default: true },
      ],
    },
    handler: handleFleetStatus,
  },

  // Fleet Health
  {
    definition: {
      name: 'mcp__agentic_qe__fleet_health',
      description: 'Check fleet and domain health status',
      category: 'core',
      parameters: [
        { name: 'domain', type: 'string', description: 'Specific domain to check' },
        { name: 'detailed', type: 'boolean', description: 'Include detailed health info', default: false },
      ],
    },
    handler: handleFleetHealth,
  },
];

const TASK_TOOLS: ToolEntry[] = [
  // Task Submit
  {
    definition: {
      name: 'mcp__agentic_qe__task_submit',
      description: 'Submit a task to the Queen Coordinator for execution',
      category: 'task',
      parameters: [
        { name: 'type', type: 'string', description: 'Task type', required: true },
        { name: 'priority', type: 'string', description: 'Task priority', enum: ['p0', 'p1', 'p2', 'p3'], default: 'p1' },
        { name: 'targetDomains', type: 'array', description: 'Target domains for task' },
        { name: 'payload', type: 'object', description: 'Task payload data' },
        { name: 'timeout', type: 'number', description: 'Task timeout in ms', default: 300000 },
      ],
    },
    handler: handleTaskSubmit,
  },

  // Task List
  {
    definition: {
      name: 'mcp__agentic_qe__task_list',
      description: 'List tasks with optional filtering',
      category: 'task',
      parameters: [
        { name: 'status', type: 'string', description: 'Filter by status' },
        { name: 'priority', type: 'string', description: 'Filter by priority' },
        { name: 'domain', type: 'string', description: 'Filter by domain' },
        { name: 'limit', type: 'number', description: 'Maximum results', default: 50 },
      ],
    },
    handler: handleTaskList,
  },

  // Task Status
  {
    definition: {
      name: 'mcp__agentic_qe__task_status',
      description: 'Get detailed status of a specific task',
      category: 'task',
      parameters: [
        { name: 'taskId', type: 'string', description: 'Task ID', required: true },
        { name: 'detailed', type: 'boolean', description: 'Include full result data', default: false },
      ],
    },
    handler: handleTaskStatus,
  },

  // Task Cancel
  {
    definition: {
      name: 'mcp__agentic_qe__task_cancel',
      description: 'Cancel a running or pending task',
      category: 'task',
      parameters: [
        { name: 'taskId', type: 'string', description: 'Task ID to cancel', required: true },
      ],
    },
    handler: handleTaskCancel,
  },

  // Task Orchestrate
  {
    definition: {
      name: 'mcp__agentic_qe__task_orchestrate',
      description: 'Orchestrate a high-level QE task across multiple agents',
      category: 'task',
      parameters: [
        { name: 'task', type: 'string', description: 'Task description', required: true },
        { name: 'strategy', type: 'string', description: 'Execution strategy', enum: ['parallel', 'sequential', 'adaptive'], default: 'adaptive' },
        { name: 'priority', type: 'string', description: 'Task priority', enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
        { name: 'maxAgents', type: 'number', description: 'Maximum agents to use', default: 5 },
        { name: 'context', type: 'object', description: 'Additional context (project, branch, etc.)' },
      ],
    },
    handler: handleTaskOrchestrate,
  },
];

const AGENT_TOOLS: ToolEntry[] = [
  // Agent List
  {
    definition: {
      name: 'mcp__agentic_qe__agent_list',
      description: 'List all active agents with optional filtering',
      category: 'agent',
      parameters: [
        { name: 'domain', type: 'string', description: 'Filter by domain' },
        { name: 'status', type: 'string', description: 'Filter by status', enum: ['idle', 'busy', 'failed'] },
        { name: 'limit', type: 'number', description: 'Maximum results', default: 50 },
      ],
    },
    handler: handleAgentList,
  },

  // Agent Spawn
  {
    definition: {
      name: 'mcp__agentic_qe__agent_spawn',
      description: 'Spawn a new agent in a specific domain',
      category: 'agent',
      parameters: [
        { name: 'domain', type: 'string', description: 'Domain for the agent', required: true },
        { name: 'type', type: 'string', description: 'Agent type', default: 'worker' },
        { name: 'capabilities', type: 'array', description: 'Agent capabilities' },
      ],
    },
    handler: handleAgentSpawn,
  },

  // Agent Metrics
  {
    definition: {
      name: 'mcp__agentic_qe__agent_metrics',
      description: 'Get performance metrics for agents',
      category: 'agent',
      parameters: [
        { name: 'agentId', type: 'string', description: 'Specific agent ID' },
        { name: 'metric', type: 'string', description: 'Metric type', enum: ['all', 'cpu', 'memory', 'tasks', 'performance'], default: 'all' },
      ],
    },
    handler: handleAgentMetrics,
  },

  // Agent Status
  {
    definition: {
      name: 'mcp__agentic_qe__agent_status',
      description: 'Get detailed status of a specific agent',
      category: 'agent',
      parameters: [
        { name: 'agentId', type: 'string', description: 'Agent ID', required: true },
      ],
    },
    handler: handleAgentStatus,
  },
];

const DOMAIN_TOOLS: ToolEntry[] = [
  // Test Generate
  {
    definition: {
      name: 'mcp__agentic_qe__test_generate_enhanced',
      description: 'Generate tests with AI enhancement and pattern recognition',
      category: 'domain',
      domain: 'test-generation',
      lazyLoad: true,
      parameters: [
        { name: 'sourceCode', type: 'string', description: 'Source code to generate tests for' },
        { name: 'filePath', type: 'string', description: 'Path to source file' },
        { name: 'language', type: 'string', description: 'Programming language', enum: ['javascript', 'typescript', 'python', 'java', 'go'] },
        { name: 'framework', type: 'string', description: 'Test framework' },
        { name: 'testType', type: 'string', description: 'Type of tests', enum: ['unit', 'integration', 'e2e', 'property-based'] },
        { name: 'coverageGoal', type: 'number', description: 'Target coverage percentage', default: 80 },
        { name: 'aiEnhancement', type: 'boolean', description: 'Enable AI-powered analysis', default: true },
        { name: 'detectAntiPatterns', type: 'boolean', description: 'Detect code anti-patterns', default: false },
      ],
    },
    handler: handleTestGenerate,
  },

  // Test Execute
  {
    definition: {
      name: 'mcp__agentic_qe__test_execute_parallel',
      description: 'Execute tests in parallel with retry logic',
      category: 'domain',
      domain: 'test-execution',
      lazyLoad: true,
      parameters: [
        { name: 'testFiles', type: 'array', description: 'Test files to execute' },
        { name: 'testSuites', type: 'array', description: 'Test suites to run' },
        { name: 'parallel', type: 'boolean', description: 'Enable parallel execution', default: true },
        { name: 'parallelism', type: 'number', description: 'Number of parallel workers', default: 4 },
        { name: 'retryCount', type: 'number', description: 'Number of retries', default: 3 },
        { name: 'timeout', type: 'number', description: 'Test timeout in ms', default: 60000 },
        { name: 'collectCoverage', type: 'boolean', description: 'Collect coverage data', default: false },
        { name: 'reportFormat', type: 'string', description: 'Report format', enum: ['json', 'junit', 'html', 'markdown'] },
      ],
    },
    handler: handleTestExecute,
  },

  // Coverage Analyze
  {
    definition: {
      name: 'mcp__agentic_qe__coverage_analyze_sublinear',
      description: 'Analyze coverage with O(log n) sublinear algorithm',
      category: 'domain',
      domain: 'coverage-analysis',
      lazyLoad: true,
      parameters: [
        { name: 'target', type: 'string', description: 'Target path to analyze' },
        { name: 'includeRisk', type: 'boolean', description: 'Include risk scoring', default: false },
        { name: 'detectGaps', type: 'boolean', description: 'Detect coverage gaps', default: true },
        { name: 'mlPowered', type: 'boolean', description: 'Use ML for gap detection', default: false },
        { name: 'prioritization', type: 'string', description: 'Gap prioritization strategy', enum: ['complexity', 'criticality', 'change-frequency', 'ml-confidence'] },
      ],
    },
    handler: handleCoverageAnalyze,
  },

  // Quality Assess
  {
    definition: {
      name: 'mcp__agentic_qe__quality_assess',
      description: 'Assess code quality with optional quality gate',
      category: 'domain',
      domain: 'quality-assessment',
      lazyLoad: true,
      parameters: [
        { name: 'target', type: 'string', description: 'Target path to analyze' },
        { name: 'runGate', type: 'boolean', description: 'Run quality gate evaluation', default: false },
        { name: 'threshold', type: 'number', description: 'Quality threshold', default: 80 },
        { name: 'metrics', type: 'array', description: 'Metrics to evaluate' },
      ],
    },
    handler: handleQualityAssess,
  },

  // Security Scan
  {
    definition: {
      name: 'mcp__agentic_qe__security_scan_comprehensive',
      description: 'Comprehensive security scanning with SAST/DAST',
      category: 'domain',
      domain: 'security-compliance',
      lazyLoad: true,
      parameters: [
        { name: 'sast', type: 'boolean', description: 'Run SAST scan', default: true },
        { name: 'dast', type: 'boolean', description: 'Run DAST scan', default: false },
        { name: 'compliance', type: 'array', description: 'Compliance frameworks to check' },
        { name: 'target', type: 'string', description: 'Target to scan' },
      ],
    },
    handler: handleSecurityScan,
  },

  // Contract Validate
  {
    definition: {
      name: 'mcp__agentic_qe__contract_validate',
      description: 'Validate API contracts for breaking changes',
      category: 'domain',
      domain: 'contract-testing',
      lazyLoad: true,
      parameters: [
        { name: 'contractPath', type: 'string', description: 'Path to contract file' },
        { name: 'providerUrl', type: 'string', description: 'Provider URL' },
        { name: 'consumerName', type: 'string', description: 'Consumer name' },
        { name: 'checkBreakingChanges', type: 'boolean', description: 'Check for breaking changes', default: true },
      ],
    },
    handler: handleContractValidate,
  },

  // Accessibility Test
  {
    definition: {
      name: 'mcp__agentic_qe__accessibility_test',
      description: 'Test accessibility against WCAG standards',
      category: 'domain',
      domain: 'visual-accessibility',
      lazyLoad: true,
      parameters: [
        { name: 'url', type: 'string', description: 'URL to test' },
        { name: 'standard', type: 'string', description: 'Accessibility standard', enum: ['wcag21-aa', 'wcag21-aaa', 'wcag22-aa', 'section508'] },
        { name: 'includeScreenReader', type: 'boolean', description: 'Include screen reader tests', default: false },
      ],
    },
    handler: handleAccessibilityTest,
  },

  // Chaos Test
  {
    definition: {
      name: 'mcp__agentic_qe__chaos_test',
      description: 'Run chaos engineering tests',
      category: 'domain',
      domain: 'chaos-resilience',
      lazyLoad: true,
      parameters: [
        { name: 'faultType', type: 'string', description: 'Type of fault to inject', enum: ['latency', 'error', 'timeout', 'cpu', 'memory', 'network'] },
        { name: 'target', type: 'string', description: 'Target service' },
        { name: 'duration', type: 'number', description: 'Fault duration in ms', default: 30000 },
        { name: 'intensity', type: 'number', description: 'Fault intensity (0-100)', default: 50 },
        { name: 'dryRun', type: 'boolean', description: 'Dry run mode', default: true },
      ],
    },
    handler: handleChaosTest,
  },

  // Defect Predict
  {
    definition: {
      name: 'mcp__agentic_qe__defect_predict',
      description: 'Predict potential defects using AI',
      category: 'domain',
      domain: 'defect-intelligence',
      lazyLoad: true,
      parameters: [
        { name: 'target', type: 'string', description: 'Target path' },
        { name: 'lookback', type: 'number', description: 'Lookback period in days', default: 30 },
        { name: 'minConfidence', type: 'number', description: 'Minimum confidence threshold', default: 0.7 },
      ],
    },
    handler: handleDefectPredict,
  },

  // Requirements Validate
  {
    definition: {
      name: 'mcp__agentic_qe__requirements_validate',
      description: 'Validate requirements and generate BDD scenarios',
      category: 'domain',
      domain: 'requirements-validation',
      lazyLoad: true,
      parameters: [
        { name: 'requirementsPath', type: 'string', description: 'Path to requirements' },
        { name: 'testPath', type: 'string', description: 'Path to tests' },
        { name: 'generateBDD', type: 'boolean', description: 'Generate BDD scenarios', default: false },
      ],
    },
    handler: handleRequirementsValidate,
  },

  // Code Index
  {
    definition: {
      name: 'mcp__agentic_qe__code_index',
      description: 'Index code for knowledge graph',
      category: 'domain',
      domain: 'code-intelligence',
      lazyLoad: true,
      parameters: [
        { name: 'target', type: 'string', description: 'Target path' },
        { name: 'incremental', type: 'boolean', description: 'Incremental indexing', default: false },
        { name: 'gitSince', type: 'string', description: 'Index changes since git ref' },
      ],
    },
    handler: handleCodeIndex,
  },
];

const MEMORY_TOOLS: ToolEntry[] = [
  // Memory Store
  {
    definition: {
      name: 'mcp__agentic_qe__memory_store',
      description: 'Store data in memory with optional TTL',
      category: 'memory',
      parameters: [
        { name: 'key', type: 'string', description: 'Memory key', required: true },
        { name: 'value', type: 'object', description: 'Value to store', required: true },
        { name: 'namespace', type: 'string', description: 'Memory namespace', default: 'default' },
        { name: 'ttl', type: 'number', description: 'Time to live in ms' },
        { name: 'metadata', type: 'object', description: 'Additional metadata' },
        { name: 'persist', type: 'boolean', description: 'Persist to storage', default: false },
      ],
    },
    handler: handleMemoryStore,
  },

  // Memory Retrieve
  {
    definition: {
      name: 'mcp__agentic_qe__memory_retrieve',
      description: 'Retrieve data from memory',
      category: 'memory',
      parameters: [
        { name: 'key', type: 'string', description: 'Memory key', required: true },
        { name: 'namespace', type: 'string', description: 'Memory namespace', default: 'default' },
        { name: 'includeMetadata', type: 'boolean', description: 'Include metadata', default: false },
      ],
    },
    handler: handleMemoryRetrieve,
  },

  // Memory Query
  {
    definition: {
      name: 'mcp__agentic_qe__memory_query',
      description: 'Query memory with pattern matching',
      category: 'memory',
      parameters: [
        { name: 'pattern', type: 'string', description: 'Key pattern (supports wildcards)' },
        { name: 'namespace', type: 'string', description: 'Memory namespace' },
        { name: 'limit', type: 'number', description: 'Maximum results', default: 100 },
        { name: 'offset', type: 'number', description: 'Pagination offset', default: 0 },
        { name: 'includeExpired', type: 'boolean', description: 'Include expired entries', default: false },
      ],
    },
    handler: handleMemoryQuery,
  },

  // Memory Delete
  {
    definition: {
      name: 'mcp__agentic_qe__memory_delete',
      description: 'Delete memory entry',
      category: 'memory',
      parameters: [
        { name: 'key', type: 'string', description: 'Memory key', required: true },
        { name: 'namespace', type: 'string', description: 'Memory namespace', default: 'default' },
      ],
    },
    handler: handleMemoryDelete,
  },

  // Memory Usage
  {
    definition: {
      name: 'mcp__agentic_qe__memory_usage',
      description: 'Get memory usage statistics',
      category: 'memory',
      parameters: [],
    },
    handler: handleMemoryUsage,
  },

  // Memory Share
  {
    definition: {
      name: 'mcp__agentic_qe__memory_share',
      description: 'Share knowledge between agents',
      category: 'memory',
      parameters: [
        { name: 'sourceAgentId', type: 'string', description: 'Source agent ID', required: true },
        { name: 'targetAgentIds', type: 'array', description: 'Target agent IDs', required: true },
        { name: 'knowledgeDomain', type: 'string', description: 'Knowledge domain', required: true },
        { name: 'knowledgeContent', type: 'object', description: 'Knowledge content', required: true },
      ],
    },
    handler: handleMemoryShare,
  },
];

const CROSS_PHASE_TOOLS: ToolEntry[] = [
  // Cross-Phase Store
  {
    definition: {
      name: 'mcp__agentic_qe__cross_phase_store',
      description: 'Store a cross-phase signal for QCSD feedback loops (strategic, tactical, operational, quality-criteria)',
      category: 'cross-phase',
      parameters: [
        { name: 'loop', type: 'string', description: 'Feedback loop type', required: true, enum: ['strategic', 'tactical', 'operational', 'quality-criteria'] },
        { name: 'data', type: 'object', description: 'Signal data (riskWeights, factorWeights, flakyPatterns, etc.)', required: true },
      ],
    },
    handler: handleCrossPhaseStore,
  },

  // Cross-Phase Query
  {
    definition: {
      name: 'mcp__agentic_qe__cross_phase_query',
      description: 'Query cross-phase signals by loop type with optional filters',
      category: 'cross-phase',
      parameters: [
        { name: 'loop', type: 'string', description: 'Feedback loop type', required: true, enum: ['strategic', 'tactical', 'operational', 'quality-criteria'] },
        { name: 'maxAge', type: 'string', description: 'Maximum signal age (e.g., "30d", "24h")', required: false },
        { name: 'filter', type: 'object', description: 'Additional filters', required: false },
      ],
    },
    handler: handleCrossPhaseQuery,
  },

  // Agent Complete Hook
  {
    definition: {
      name: 'mcp__agentic_qe__agent_complete',
      description: 'Trigger cross-phase hooks when an agent completes (auto-stores relevant signals)',
      category: 'cross-phase',
      parameters: [
        { name: 'agentName', type: 'string', description: 'Name of the completed agent', required: true },
        { name: 'result', type: 'object', description: 'Agent result data', required: true },
      ],
    },
    handler: handleAgentComplete,
  },

  // Phase Start Hook
  {
    definition: {
      name: 'mcp__agentic_qe__phase_start',
      description: 'Trigger phase start hooks to get injected cross-phase signals for agents',
      category: 'cross-phase',
      parameters: [
        { name: 'phase', type: 'string', description: 'QCSD phase name', required: true, enum: ['ideation', 'refinement', 'development', 'cicd', 'production'] },
        { name: 'context', type: 'object', description: 'Phase context data', required: false },
      ],
    },
    handler: handlePhaseStart,
  },

  // Phase End Hook
  {
    definition: {
      name: 'mcp__agentic_qe__phase_end',
      description: 'Trigger phase end hooks to store accumulated signals',
      category: 'cross-phase',
      parameters: [
        { name: 'phase', type: 'string', description: 'QCSD phase name', required: true, enum: ['ideation', 'refinement', 'development', 'cicd', 'production'] },
        { name: 'context', type: 'object', description: 'Phase result data', required: false },
      ],
    },
    handler: handlePhaseEnd,
  },

  // Cross-Phase Stats
  {
    definition: {
      name: 'mcp__agentic_qe__cross_phase_stats',
      description: 'Get cross-phase memory statistics (total signals, by loop, by namespace)',
      category: 'cross-phase',
      parameters: [],
    },
    handler: handleCrossPhaseStats,
  },

  // Format Signals
  {
    definition: {
      name: 'mcp__agentic_qe__format_signals',
      description: 'Format cross-phase signals for injection into agent prompts',
      category: 'cross-phase',
      parameters: [
        { name: 'signals', type: 'array', description: 'Signals to format', required: true },
      ],
    },
    handler: handleFormatSignals,
  },

  // Cross-Phase Cleanup
  {
    definition: {
      name: 'mcp__agentic_qe__cross_phase_cleanup',
      description: 'Clean up expired cross-phase signals',
      category: 'cross-phase',
      parameters: [],
    },
    handler: handleCrossPhaseCleanup,
  },
];

// ============================================================================
// MCP Server Class
// ============================================================================

export class MCPServer {
  private readonly registry: ToolRegistry;
  private initialized = false;

  constructor() {
    this.registry = createToolRegistry();
  }

  /**
   * Initialize the server and register all tools
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Register all tools in a single consolidated loop
    const allTools = [
      ...CORE_TOOLS,
      ...TASK_TOOLS,
      ...AGENT_TOOLS,
      ...DOMAIN_TOOLS,
      ...MEMORY_TOOLS,
      ...CROSS_PHASE_TOOLS,
    ];
    this.registry.registerAll(allTools);

    this.initialized = true;
  }

  /**
   * Get tool registry
   */
  getRegistry(): ToolRegistry {
    return this.registry;
  }

  /**
   * Get all tool definitions
   */
  getTools(): ToolDefinition[] {
    return this.registry.getDefinitions();
  }

  /**
   * Get loaded tool definitions (for MCP protocol)
   */
  getLoadedTools(): ToolDefinition[] {
    return this.registry.getLoadedDefinitions();
  }

  /**
   * Invoke a tool
   */
  async invoke<T = unknown>(
    toolName: string,
    params: Record<string, unknown>
  ): Promise<T> {
    const result = await this.registry.invoke(toolName, params);
    if (!result.success) {
      throw new Error(result.error || 'Tool invocation failed');
    }
    return result.data as T;
  }

  /**
   * Load tools for a specific message (lazy loading)
   */
  loadToolsForMessage(message: string): string[] {
    const domains = this.registry.loadForMessage(message);
    return domains;
  }

  /**
   * Get server statistics
   */
  getStats() {
    return this.registry.getStats();
  }

  /**
   * Dispose server resources
   */
  async dispose(): Promise<void> {
    await disposeFleet();
    this.registry.clear();
    this.initialized = false;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createMCPServer(): MCPServer {
  return new MCPServer();
}

// ============================================================================
// Default Export
// ============================================================================

export default MCPServer;
