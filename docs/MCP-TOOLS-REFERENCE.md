# AQE MCP Tools Reference

Comprehensive guide to all 67 Agentic QE MCP tools for quality engineering automation.

**Version**: 1.3.5
**Status**: Stable
**Last Updated**: 2025-10-30

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Tool Categories](#tool-categories)
   - [Fleet Management (4 tools)](#fleet-management)
   - [Test Generation (3 tools)](#test-generation)
   - [Test Execution (4 tools)](#test-execution)
   - [Quality Analysis (5 tools)](#quality-analysis)
   - [Coverage Analysis (3 tools)](#coverage-analysis)
   - [Memory Management (6 tools)](#memory-management)
   - [Coordination (7 tools)](#coordination)
   - [Quality Gates (5 tools)](#quality-gates)
   - [Prediction & Risk (5 tools)](#prediction--risk)
   - [Performance & Security (3 tools)](#performance--security)
   - [Requirements & Production (5 tools)](#requirements--production)
   - [Advanced Testing (3 tools)](#advanced-testing)
   - [Streaming (2 tools)](#streaming)
3. [Common Workflows](#common-workflows)
4. [Best Practices](#best-practices)
5. [Error Handling](#error-handling)
6. [Migration Guide](#migration-guide)
7. [Troubleshooting](#troubleshooting)

---

## Quick Start

### Prerequisites

```bash
# Ensure MCP server is running
npm run mcp:start

# Verify connection in Claude Code
claude mcp list
# Should show: agentic-qe: Connected ✓
```

### Basic Usage

```javascript
// In Claude Code, use MCP tools directly

// 1. Initialize a fleet
const fleet = await mcp__agentic_qe__fleet_init({
  config: {
    topology: 'hierarchical',
    maxAgents: 10,
    testingFocus: ['unit', 'integration'],
    environments: ['development'],
    frameworks: ['jest']
  }
});

// 2. Spawn specialized agents
const agent = await mcp__agentic_qe__agent_spawn({
  spec: {
    type: 'test-generator',
    capabilities: ['unit-tests', 'integration-tests'],
    name: 'test-gen-001'
  }
});

// 3. Generate tests
const tests = await mcp__agentic_qe__test_generate({
  spec: {
    type: 'unit',
    sourceCode: {
      repositoryUrl: 'https://github.com/user/repo',
      language: 'typescript',
      testPatterns: ['**/*.ts']
    },
    coverageTarget: 80,
    frameworks: ['jest']
  }
});
```

### Quick Reference

Most commonly used tools:

| Tool | Purpose | Usage |
|------|---------|-------|
| `fleet_init` | Initialize fleet | Setup coordination topology |
| `agent_spawn` | Create agent | Spawn specialized QE agents |
| `test_generate` | Generate tests | AI-powered test creation |
| `test_execute` | Run tests | Parallel test execution |
| `quality_analyze` | Quality check | Comprehensive analysis |
| `memory_store` | Store data | Share between agents |
| `task_orchestrate` | Coordinate | Multi-agent workflows |

---

## Tool Categories

### Fleet Management

**Purpose**: Initialize and manage QE agent fleets with coordinated topologies.

#### `mcp__agentic_qe__fleet_init`

Initialize a new QE fleet with specified topology and configuration.

**Status**: Stable

**Parameters**:

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| config | object | Yes | - | Fleet configuration |
| config.topology | string | Yes | - | Coordination topology: `hierarchical`, `mesh`, `ring`, `adaptive` |
| config.maxAgents | number | Yes | - | Maximum agents (5-50) |
| config.testingFocus | string[] | No | - | Testing areas: `unit`, `integration`, `performance`, etc. |
| config.environments | string[] | No | - | Target environments |
| config.frameworks | string[] | No | - | Testing frameworks |
| projectContext | object | No | - | Project metadata |

**Returns**:

```typescript
{
  success: boolean;
  fleetId: string;
  topology: string;
  maxAgents: number;
  agentCount: number;
  capabilities: string[];
  metadata: {
    createdAt: string;
    status: string;
  };
}
```

**Usage Examples**:

*Basic Fleet*:
```javascript
const fleet = await mcp__agentic_qe__fleet_init({
  config: {
    topology: 'hierarchical',
    maxAgents: 10
  }
});
```

*Advanced Fleet with Full Configuration*:
```javascript
const fleet = await mcp__agentic_qe__fleet_init({
  config: {
    topology: 'adaptive',
    maxAgents: 25,
    testingFocus: ['unit', 'integration', 'e2e', 'performance'],
    environments: ['development', 'staging', 'production'],
    frameworks: ['jest', 'mocha', 'playwright']
  },
  projectContext: {
    repositoryUrl: 'https://github.com/company/project',
    language: 'typescript',
    buildSystem: 'npm'
  }
});
```

**Error Handling**:

- `INVALID_TOPOLOGY`: Topology must be one of: hierarchical, mesh, ring, adaptive
- `AGENT_LIMIT_EXCEEDED`: maxAgents must be between 5 and 50
- `MISSING_REQUIRED`: config and config.topology are required

**Related Tools**:
- `fleet_status` - Check fleet health
- `agent_spawn` - Add agents to fleet
- `task_orchestrate` - Coordinate fleet tasks

---

#### `mcp__agentic_qe__agent_spawn`

Spawn a specialized QE agent with specific capabilities.

**Status**: Stable

**Parameters**:

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| spec | object | Yes | - | Agent specification |
| spec.type | string | Yes | - | Agent type: `test-generator`, `coverage-analyzer`, `quality-gate`, `performance-tester`, `security-scanner`, `chaos-engineer`, `visual-tester` |
| spec.name | string | No | auto | Custom agent name |
| spec.capabilities | string[] | Yes | - | Agent capabilities |
| spec.resources | object | No | default | Resource allocation |
| spec.resources.memory | number | No | 512 | Memory in MB |
| spec.resources.cpu | number | No | 1 | CPU cores |
| spec.resources.storage | number | No | 1024 | Storage in MB |
| fleetId | string | No | active | Fleet to spawn in |

**Returns**:

```typescript
{
  success: boolean;
  agentId: string;
  type: string;
  name: string;
  capabilities: string[];
  status: 'ready' | 'initializing' | 'error';
  resources: {
    memory: number;
    cpu: number;
    storage: number;
  };
}
```

**Usage Examples**:

*Basic Test Generator*:
```javascript
const agent = await mcp__agentic_qe__agent_spawn({
  spec: {
    type: 'test-generator',
    capabilities: ['unit-tests', 'integration-tests']
  }
});
```

*Advanced Performance Tester*:
```javascript
const perfAgent = await mcp__agentic_qe__agent_spawn({
  spec: {
    type: 'performance-tester',
    name: 'perf-analyzer-prod',
    capabilities: [
      'load-testing',
      'stress-testing',
      'spike-testing',
      'endurance-testing'
    ],
    resources: {
      memory: 2048,
      cpu: 4,
      storage: 4096
    }
  },
  fleetId: 'fleet-production-001'
});
```

**Error Handling**:

- `INVALID_AGENT_TYPE`: Type must be one of supported agent types
- `MISSING_CAPABILITIES`: At least one capability required
- `RESOURCE_LIMIT`: Resources exceed fleet limits
- `FLEET_NOT_FOUND`: Specified fleet doesn't exist

**Related Tools**:
- `fleet_init` - Create fleet first
- `fleet_status` - View all agents
- `task_orchestrate` - Assign tasks to agent

---

#### `mcp__agentic_qe__fleet_status`

Get comprehensive status of QE fleet and agents.

**Status**: Stable

**Parameters**:

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| fleetId | string | No | active | Fleet ID to query |
| includeMetrics | boolean | No | true | Include performance metrics |
| includeAgentDetails | boolean | No | false | Include detailed agent info |

**Returns**:

```typescript
{
  fleetId: string;
  topology: string;
  status: 'active' | 'idle' | 'busy' | 'error';
  agentCount: number;
  maxAgents: number;
  agents: Array<{
    agentId: string;
    type: string;
    name: string;
    status: string;
    currentTask?: string;
  }>;
  metrics?: {
    totalTasks: number;
    completedTasks: number;
    failedTasks: number;
    averageExecutionTime: number;
    successRate: number;
  };
  capabilities: string[];
  uptime: number;
}
```

**Usage Examples**:

*Quick Status Check*:
```javascript
const status = await mcp__agentic_qe__fleet_status({});
console.log(`Fleet: ${status.agentCount}/${status.maxAgents} agents`);
```

*Detailed Status with Metrics*:
```javascript
const detailedStatus = await mcp__agentic_qe__fleet_status({
  fleetId: 'fleet-prod-001',
  includeMetrics: true,
  includeAgentDetails: true
});

// Show performance
console.log(`Success Rate: ${detailedStatus.metrics.successRate}%`);
console.log(`Avg Time: ${detailedStatus.metrics.averageExecutionTime}ms`);

// Show agents
detailedStatus.agents.forEach(agent => {
  console.log(`${agent.name}: ${agent.status}`);
});
```

**Error Handling**:

- `FLEET_NOT_FOUND`: Specified fleet doesn't exist
- `METRICS_UNAVAILABLE`: Metrics collection not enabled

**Related Tools**:
- `fleet_init` - Initialize fleet
- `agent_spawn` - View spawned agents
- `task_status` - Check task progress

---

#### `mcp__agentic_qe__task_orchestrate`

Orchestrate complex QE tasks across multiple agents.

**Status**: Stable

**Parameters**:

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| task | object | Yes | - | Task configuration |
| task.type | string | Yes | - | Task type: `comprehensive-testing`, `quality-gate`, `defect-prevention`, `performance-validation` |
| task.priority | string | No | medium | Priority: `low`, `medium`, `high`, `critical` |
| task.strategy | string | No | adaptive | Strategy: `parallel`, `sequential`, `adaptive` |
| task.maxAgents | number | No | - | Max agents to use (1-10) |
| task.timeoutMinutes | number | No | 30 | Timeout in minutes |
| context | object | No | - | Task context |
| context.project | string | No | - | Project identifier |
| context.branch | string | No | - | Git branch |
| context.environment | string | No | - | Target environment |
| context.requirements | string[] | No | - | Specific requirements |
| fleetId | string | No | active | Fleet to use |

**Returns**:

```typescript
{
  orchestrationId: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  assignedAgents: string[];
  estimatedDuration: number;
  startTime: string;
  tasks: Array<{
    taskId: string;
    agentId: string;
    type: string;
    status: string;
  }>;
}
```

**Usage Examples**:

*Comprehensive Testing*:
```javascript
const orchestration = await mcp__agentic_qe__task_orchestrate({
  task: {
    type: 'comprehensive-testing',
    priority: 'high',
    strategy: 'adaptive',
    maxAgents: 5
  },
  context: {
    project: 'ecommerce-api',
    branch: 'feature/payment-v2',
    environment: 'staging',
    requirements: [
      'unit-coverage-80%',
      'integration-tests',
      'performance-baseline'
    ]
  }
});
```

*Quality Gate Validation*:
```javascript
const qualityGate = await mcp__agentic_qe__task_orchestrate({
  task: {
    type: 'quality-gate',
    priority: 'critical',
    strategy: 'sequential',
    timeoutMinutes: 15
  },
  context: {
    project: 'mobile-app',
    branch: 'release/v2.1.0',
    environment: 'production',
    requirements: [
      'zero-critical-bugs',
      'performance-sla-met',
      'security-scan-passed'
    ]
  }
});
```

**Error Handling**:

- `INVALID_TASK_TYPE`: Unknown task type
- `INSUFFICIENT_AGENTS`: Not enough agents for task
- `TIMEOUT_EXCEEDED`: Task exceeded timeout
- `AGENT_FAILURE`: One or more agents failed

**Related Tools**:
- `task_status` - Check orchestration progress
- `fleet_status` - View agent availability
- `workflow_create` - Create reusable workflows

**See Also**:
- [Orchestration Guide](./guides/mcp/orchestration.md)
- [Workflow Patterns](./guides/mcp/workflow-patterns.md)

---

### Test Generation

**Purpose**: AI-powered test generation with coverage optimization.

#### `mcp__agentic_qe__test_generate`

Generate comprehensive test suites using AI analysis.

**Status**: Stable

**Parameters**:

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| spec | object | Yes | - | Generation specification |
| spec.type | string | Yes | - | Test type: `unit`, `integration`, `e2e`, `property-based`, `mutation` |
| spec.sourceCode | object | Yes | - | Source code location |
| spec.sourceCode.repositoryUrl | string | Yes | - | Git repository URL |
| spec.sourceCode.branch | string | No | main | Git branch |
| spec.sourceCode.language | string | Yes | - | Programming language |
| spec.sourceCode.testPatterns | string[] | No | - | File patterns to test |
| spec.coverageTarget | number | Yes | - | Target coverage (0-100) |
| spec.frameworks | string[] | No | - | Testing frameworks |
| spec.synthesizeData | boolean | No | true | Generate test data |
| agentId | string | No | - | Specific agent to use |

**Returns**:

```typescript
{
  success: boolean;
  generatedTests: number;
  testFiles: Array<{
    path: string;
    testCount: number;
    coverage: number;
  }>;
  estimatedCoverage: number;
  generationTime: number;
  metadata: {
    patterns: string[];
    testData: boolean;
    framework: string;
  };
}
```

**Usage Examples**:

*Basic Unit Test Generation*:
```javascript
const result = await mcp__agentic_qe__test_generate({
  spec: {
    type: 'unit',
    sourceCode: {
      repositoryUrl: 'https://github.com/company/api',
      language: 'typescript',
      testPatterns: ['src/**/*.ts']
    },
    coverageTarget: 80,
    frameworks: ['jest']
  }
});
```

*Advanced Integration Tests with Custom Data*:
```javascript
const result = await mcp__agentic_qe__test_generate({
  spec: {
    type: 'integration',
    sourceCode: {
      repositoryUrl: 'https://github.com/company/api',
      branch: 'develop',
      language: 'typescript',
      testPatterns: ['src/api/**/*.ts', 'src/services/**/*.ts']
    },
    coverageTarget: 90,
    frameworks: ['jest', 'supertest'],
    synthesizeData: true
  },
  agentId: 'test-gen-integration-001'
});

console.log(`Generated ${result.generatedTests} tests`);
console.log(`Estimated coverage: ${result.estimatedCoverage}%`);
```

**Error Handling**:

- `INVALID_REPOSITORY`: Repository URL is invalid or inaccessible
- `UNSUPPORTED_LANGUAGE`: Language not supported
- `COVERAGE_TARGET_INVALID`: Coverage must be between 0-100
- `GENERATION_FAILED`: Test generation failed

**Related Tools**:
- `test_execute` - Run generated tests
- `test_coverage_detailed` - Analyze coverage
- `agent_spawn` - Create test generator agent

**See Also**:
- [Test Generation Guide](./guides/mcp/test-generation.md)
- [Coverage Optimization](./guides/mcp/coverage-optimization.md)

---

#### `mcp__agentic_qe__test_generate_enhanced`

Enhanced AI-powered test generation with pattern recognition and anti-pattern detection.

**Status**: Stable

**Parameters**:

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| sourceCode | string | Yes | - | Source code to analyze |
| language | string | Yes | - | Language: `javascript`, `typescript`, `python`, `java`, `go` |
| testType | string | Yes | - | Test type: `unit`, `integration`, `e2e`, `property-based`, `mutation` |
| aiEnhancement | boolean | No | true | Enable AI analysis |
| coverageGoal | number | No | - | Target coverage (0-100) |
| detectAntiPatterns | boolean | No | false | Detect code anti-patterns |

**Returns**:

```typescript
{
  success: boolean;
  tests: string; // Generated test code
  metadata: {
    testCount: number;
    coverage: number;
    patterns: string[];
    antiPatterns?: string[];
    suggestions: string[];
  };
}
```

**Usage Examples**:

*Enhanced Unit Tests*:
```javascript
const sourceCode = `
function calculateTotal(items) {
  return items.reduce((sum, item) => sum + item.price, 0);
}
`;

const result = await mcp__agentic_qe__test_generate_enhanced({
  sourceCode,
  language: 'javascript',
  testType: 'unit',
  aiEnhancement: true,
  coverageGoal: 100
});

console.log(result.tests);
```

*With Anti-Pattern Detection*:
```javascript
const result = await mcp__agentic_qe__test_generate_enhanced({
  sourceCode: readFileSync('src/legacy-code.js', 'utf-8'),
  language: 'javascript',
  testType: 'unit',
  detectAntiPatterns: true,
  coverageGoal: 80
});

if (result.metadata.antiPatterns?.length > 0) {
  console.log('Anti-patterns detected:');
  result.metadata.antiPatterns.forEach(pattern => {
    console.log(`- ${pattern}`);
  });
}
```

**Error Handling**:

- `INVALID_SOURCE_CODE`: Source code is empty or invalid
- `UNSUPPORTED_LANGUAGE`: Language not supported
- `AI_ANALYSIS_FAILED`: AI enhancement failed

**Related Tools**:
- `test_generate` - Standard test generation
- `mutation_test_execute` - Mutation testing
- `api_breaking_changes` - API analysis

---

#### `mcp__agentic_qe__test_optimize_sublinear`

Optimize test suites using sublinear algorithms (JL, temporal advantage, redundancy detection).

**Status**: Stable

**Parameters**:

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| testSuite | object | Yes | - | Test suite to optimize |
| testSuite.tests | array | Yes | - | Array of tests |
| algorithm | string | Yes | - | Algorithm: `johnson-lindenstrauss`, `temporal-advantage`, `redundancy-detection`, `sublinear` |
| targetReduction | number | No | - | Reduction ratio (0.1-0.9) |
| maintainCoverage | number | No | - | Min coverage to maintain (0-1) |
| predictFailures | boolean | No | false | Enable failure prediction |
| metrics | boolean | No | true | Calculate metrics |
| preserveCritical | boolean | No | true | Preserve critical tests |

**Returns**:

```typescript
{
  success: boolean;
  optimizedSuite: {
    tests: array;
    removed: number;
    kept: number;
  };
  metrics: {
    originalSize: number;
    optimizedSize: number;
    reductionRatio: number;
    coverageMaintained: number;
    estimatedTimeReduction: number;
  };
}
```

**Usage Examples**:

*Basic Optimization*:
```javascript
const testSuite = {
  tests: [
    { id: 'test1', duration: 100, coverage: ['file1.ts'] },
    { id: 'test2', duration: 150, coverage: ['file1.ts', 'file2.ts'] },
    // ... more tests
  ]
};

const result = await mcp__agentic_qe__test_optimize_sublinear({
  testSuite,
  algorithm: 'johnson-lindenstrauss',
  targetReduction: 0.3, // Reduce to 30% of original
  maintainCoverage: 0.95 // Keep 95% coverage
});

console.log(`Reduced from ${result.metrics.originalSize} to ${result.metrics.optimizedSize} tests`);
console.log(`Time savings: ${result.metrics.estimatedTimeReduction}%`);
```

**Error Handling**:

- `INVALID_ALGORITHM`: Unknown algorithm
- `INSUFFICIENT_TESTS`: Too few tests to optimize
- `COVERAGE_CANNOT_BE_MAINTAINED`: Cannot maintain coverage with target reduction

**Related Tools**:
- `test_execute_parallel` - Run optimized suite
- `coverage_analyze_sublinear` - Analyze coverage
- `optimize_tests` - Alternative optimization

---

### Test Execution

**Purpose**: Parallel test execution with retry logic and reporting.

#### `mcp__agentic_qe__test_execute`

Execute test suites with orchestrated parallel execution.

**Status**: Stable

**Parameters**:

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| spec | object | Yes | - | Execution specification |
| spec.testSuites | string[] | Yes | - | Test suites to execute |
| spec.environments | string[] | No | - | Target environments |
| spec.parallelExecution | boolean | No | true | Enable parallel execution |
| spec.retryCount | number | No | 3 | Retry attempts (0-5) |
| spec.timeoutSeconds | number | No | 300 | Timeout in seconds |
| spec.reportFormat | string | No | json | Format: `junit`, `tap`, `json`, `html` |
| fleetId | string | No | active | Fleet ID |

**Returns**:

```typescript
{
  success: boolean;
  executionId: string;
  results: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    duration: number;
  };
  suites: Array<{
    name: string;
    status: string;
    tests: number;
    duration: number;
  }>;
  report: string; // Based on reportFormat
}
```

**Usage Examples**:

*Basic Execution*:
```javascript
const result = await mcp__agentic_qe__test_execute({
  spec: {
    testSuites: ['tests/unit', 'tests/integration'],
    parallelExecution: true,
    retryCount: 3
  }
});

console.log(`Passed: ${result.results.passed}/${result.results.total}`);
```

*Production Execution with HTML Report*:
```javascript
const result = await mcp__agentic_qe__test_execute({
  spec: {
    testSuites: [
      'tests/unit',
      'tests/integration',
      'tests/e2e'
    ],
    environments: ['staging', 'production'],
    parallelExecution: true,
    retryCount: 5,
    timeoutSeconds: 600,
    reportFormat: 'html'
  },
  fleetId: 'fleet-prod-001'
});

// Save HTML report
writeFileSync('test-report.html', result.report);
```

**Error Handling**:

- `NO_TEST_SUITES`: At least one test suite required
- `EXECUTION_TIMEOUT`: Tests exceeded timeout
- `ENVIRONMENT_UNAVAILABLE`: Target environment not ready

**Related Tools**:
- `test_execute_parallel` - Advanced parallel execution
- `test_execute_stream` - Real-time streaming
- `test_report_comprehensive` - Generate reports

---

#### `mcp__agentic_qe__test_execute_parallel`

Execute tests in parallel with worker pools, retry logic, and load balancing.

**Status**: Stable

**Parameters**:

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| testFiles | string[] | Yes | - | Test files to execute |
| parallelism | number | No | 4 | Number of workers (1-16) |
| timeout | number | No | 5000 | Timeout in ms |
| retryFailures | boolean | No | true | Retry failed tests |
| maxRetries | number | No | 3 | Max retry attempts (0-5) |
| retryDelay | number | No | 1000 | Delay between retries in ms |
| continueOnFailure | boolean | No | true | Continue if test fails |
| loadBalancing | string | No | round-robin | Strategy: `round-robin`, `least-loaded`, `random` |
| collectCoverage | boolean | No | false | Collect coverage data |

**Returns**:

```typescript
{
  success: boolean;
  results: {
    total: number;
    passed: number;
    failed: number;
    retried: number;
    skipped: number;
    duration: number;
  };
  workerStats: Array<{
    workerId: number;
    testsExecuted: number;
    duration: number;
  }>;
  coverage?: object;
}
```

**Usage Examples**:

*High-Performance Parallel Execution*:
```javascript
const result = await mcp__agentic_qe__test_execute_parallel({
  testFiles: glob.sync('tests/**/*.test.ts'),
  parallelism: 8,
  timeout: 10000,
  retryFailures: true,
  maxRetries: 5,
  loadBalancing: 'least-loaded',
  collectCoverage: true
});

console.log(`Completed in ${result.results.duration}ms`);
console.log(`Worker utilization:`);
result.workerStats.forEach(worker => {
  console.log(`  Worker ${worker.workerId}: ${worker.testsExecuted} tests`);
});
```

**Error Handling**:

- `NO_TEST_FILES`: No test files provided
- `INVALID_PARALLELISM`: Parallelism must be 1-16
- `WORKER_FAILURE`: One or more workers crashed

**Related Tools**:
- `test_execute` - Standard execution
- `test_execute_stream` - Streaming execution
- `flaky_test_detect` - Detect flaky tests

---

#### `mcp__agentic_qe__test_report_comprehensive`

Generate comprehensive test reports in multiple formats (HTML, JSON, JUnit, Markdown, PDF).

**Status**: Stable

**Parameters**:

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| results | object | Yes | - | Test results |
| results.total | number | Yes | - | Total tests |
| results.passed | number | Yes | - | Passed tests |
| results.failed | number | Yes | - | Failed tests |
| results.skipped | number | No | 0 | Skipped tests |
| results.duration | number | No | - | Duration in ms |
| results.suites | array | No | - | Test suites |
| format | string | Yes | - | Format: `html`, `json`, `junit`, `markdown`, `pdf` |
| includeCharts | boolean | No | false | Include visual charts |
| includeTrends | boolean | No | false | Include trend analysis |
| includeSummary | boolean | No | true | Include summary section |
| includeDetails | boolean | No | false | Include detailed test info |
| structured | boolean | No | true | Use structured output |
| historicalData | array | No | - | Historical test data |

**Returns**:

```typescript
{
  success: boolean;
  report: string; // Formatted report
  format: string;
  metadata: {
    generatedAt: string;
    reportSize: number;
    includesCharts: boolean;
    includesTrends: boolean;
  };
}
```

**Usage Examples**:

*HTML Report with Charts*:
```javascript
const report = await mcp__agentic_qe__test_report_comprehensive({
  results: {
    total: 150,
    passed: 145,
    failed: 5,
    skipped: 0,
    duration: 45000,
    suites: [
      { name: 'Unit Tests', passed: 100, failed: 0 },
      { name: 'Integration Tests', passed: 45, failed: 5 }
    ]
  },
  format: 'html',
  includeCharts: true,
  includeTrends: false,
  includeSummary: true,
  includeDetails: true
});

writeFileSync('report.html', report.report);
```

*CI/CD JUnit Report*:
```javascript
const report = await mcp__agentic_qe__test_report_comprehensive({
  results: testExecutionResults,
  format: 'junit',
  includeSummary: true
});

writeFileSync('junit-report.xml', report.report);
```

**Error Handling**:

- `INVALID_RESULTS`: Results object is malformed
- `UNSUPPORTED_FORMAT`: Format not supported
- `CHART_GENERATION_FAILED`: Chart generation failed

**Related Tools**:
- `test_execute` - Generate results
- `test_coverage_detailed` - Coverage reports
- `quality_analyze` - Quality reports

---

#### `mcp__agentic_qe__test_execute_stream`

Execute tests with real-time streaming progress updates (recommended for long-running tests >30s).

**Status**: Stable (v1.0.5+)

**Parameters**:

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| spec | object | Yes | - | Execution specification |
| spec.testSuites | string[] | Yes | - | Test suites to execute |
| spec.environments | string[] | No | - | Target environments |
| spec.parallelExecution | boolean | No | true | Enable parallel execution |
| spec.retryCount | number | No | 3 | Retry attempts (0-5) |
| spec.timeoutSeconds | number | No | 300 | Timeout in seconds |
| spec.reportFormat | string | No | json | Format: `junit`, `tap`, `json`, `html` |
| fleetId | string | No | active | Fleet ID |
| enableRealtimeUpdates | boolean | No | true | Enable real-time streaming |

**Returns** (Stream):

```typescript
AsyncGenerator<{
  type: 'progress' | 'result' | 'error';
  percent?: number;
  message?: string;
  currentTest?: string;
  data?: object;
}>
```

**Usage Examples**:

*Streaming Execution with Progress*:
```javascript
const stream = await mcp__agentic_qe__test_execute_stream({
  spec: {
    testSuites: ['tests/large-suite'],
    parallelExecution: true,
    retryCount: 3
  },
  enableRealtimeUpdates: true
});

for await (const event of stream) {
  if (event.type === 'progress') {
    console.log(`Progress: ${event.percent}% - ${event.message}`);
    if (event.currentTest) {
      console.log(`  Current: ${event.currentTest}`);
    }
  } else if (event.type === 'result') {
    console.log('Completed:', event.data);
  } else if (event.type === 'error') {
    console.error('Error:', event.message);
  }
}
```

**Error Handling**:

- `STREAM_NOT_SUPPORTED`: Streaming not available
- `EXECUTION_INTERRUPTED`: Execution was interrupted

**Related Tools**:
- `test_execute` - Non-streaming execution
- `coverage_analyze_stream` - Streaming coverage
- `task_status` - Check progress

**See Also**:
- [Streaming Guide](./guides/mcp/streaming.md)

---

### Quality Analysis

**Purpose**: Comprehensive quality metrics analysis and reporting.

#### `mcp__agentic_qe__quality_analyze`

Analyze quality metrics and generate comprehensive reports.

**Status**: Stable

**Parameters**:

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| params | object | Yes | - | Analysis parameters |
| params.scope | string | Yes | - | Scope: `code`, `tests`, `performance`, `security`, `all` |
| params.metrics | string[] | Yes | - | Metrics to analyze |
| params.thresholds | object | No | - | Quality thresholds |
| params.generateRecommendations | boolean | No | true | Generate recommendations |
| params.historicalComparison | boolean | No | false | Compare with history |
| dataSource | object | No | - | Data source paths |
| dataSource.testResults | string | No | - | Path to test results |
| dataSource.codeMetrics | string | No | - | Path to code metrics |
| dataSource.performanceData | string | No | - | Path to performance data |

**Returns**:

```typescript
{
  success: boolean;
  analysis: {
    scope: string;
    overallScore: number;
    passedThresholds: string[];
    failedThresholds: string[];
  };
  metrics: Record<string, number>;
  recommendations?: string[];
  historicalComparison?: {
    trend: 'improving' | 'stable' | 'declining';
    changePercent: number;
  };
}
```

**Usage Examples**:

*Basic Quality Analysis*:
```javascript
const analysis = await mcp__agentic_qe__quality_analyze({
  params: {
    scope: 'all',
    metrics: ['coverage', 'complexity', 'duplication', 'maintainability'],
    thresholds: {
      coverage: 80,
      complexity: 10,
      duplication: 5,
      maintainability: 70
    },
    generateRecommendations: true
  }
});

console.log(`Overall Score: ${analysis.analysis.overallScore}/100`);
if (analysis.recommendations) {
  console.log('\nRecommendations:');
  analysis.recommendations.forEach(rec => console.log(`- ${rec}`));
}
```

*Advanced Analysis with Historical Trends*:
```javascript
const analysis = await mcp__agentic_qe__quality_analyze({
  params: {
    scope: 'all',
    metrics: [
      'coverage',
      'test-quality',
      'code-smells',
      'security-issues',
      'performance-score'
    ],
    thresholds: {
      coverage: 85,
      'test-quality': 90,
      'code-smells': 0,
      'security-issues': 0,
      'performance-score': 95
    },
    generateRecommendations: true,
    historicalComparison: true
  },
  dataSource: {
    testResults: './reports/test-results.json',
    codeMetrics: './reports/code-metrics.json',
    performanceData: './reports/performance.json'
  }
});

if (analysis.historicalComparison) {
  console.log(`Trend: ${analysis.historicalComparison.trend}`);
  console.log(`Change: ${analysis.historicalComparison.changePercent}%`);
}
```

**Error Handling**:

- `INVALID_SCOPE`: Unknown scope specified
- `NO_METRICS`: At least one metric required
- `THRESHOLD_INVALID`: Threshold values invalid
- `DATA_SOURCE_ERROR`: Cannot read data source

**Related Tools**:
- `quality_validate_metrics` - Validate against thresholds
- `quality_risk_assess` - Risk assessment
- `quality_gate_execute` - Execute quality gate

**See Also**:
- [Quality Analysis Guide](./guides/mcp/quality-analysis.md)

---

(Continue with remaining tool categories...)

## Common Workflows

### End-to-End Testing Workflow

```javascript
// 1. Initialize fleet
const fleet = await mcp__agentic_qe__fleet_init({
  config: {
    topology: 'hierarchical',
    maxAgents: 15,
    testingFocus: ['unit', 'integration', 'e2e'],
    frameworks: ['jest', 'playwright']
  }
});

// 2. Spawn specialized agents
const testGen = await mcp__agentic_qe__agent_spawn({
  spec: { type: 'test-generator', capabilities: ['unit', 'integration'] }
});

const executor = await mcp__agentic_qe__agent_spawn({
  spec: { type: 'coverage-analyzer', capabilities: ['analysis'] }
});

// 3. Generate tests
const tests = await mcp__agentic_qe__test_generate({
  spec: {
    type: 'unit',
    sourceCode: {
      repositoryUrl: 'https://github.com/company/project',
      language: 'typescript',
      testPatterns: ['src/**/*.ts']
    },
    coverageTarget: 85
  }
});

// 4. Execute tests
const results = await mcp__agentic_qe__test_execute({
  spec: {
    testSuites: tests.testFiles.map(f => f.path),
    parallelExecution: true,
    retryCount: 3
  }
});

// 5. Analyze quality
const analysis = await mcp__agentic_qe__quality_analyze({
  params: {
    scope: 'all',
    metrics: ['coverage', 'quality'],
    generateRecommendations: true
  }
});

// 6. Generate report
const report = await mcp__agentic_qe__test_report_comprehensive({
  results: results.results,
  format: 'html',
  includeCharts: true
});

console.log('Workflow completed!');
```

### CI/CD Quality Gate Workflow

```javascript
// Quality gate for CI/CD pipeline
const qualityGate = await mcp__agentic_qe__quality_gate_execute({
  projectId: 'my-project',
  buildId: process.env.CI_BUILD_ID,
  environment: 'production',
  metrics: {
    coverage: {
      line: 85,
      branch: 80,
      function: 90
    },
    testResults: {
      total: 500,
      passed: 495,
      failed: 5
    },
    security: {
      critical: 0,
      high: 0,
      medium: 2
    }
  }
});

if (qualityGate.passed) {
  console.log('✅ Quality gate passed - Deploy approved');
  process.exit(0);
} else {
  console.log('❌ Quality gate failed');
  qualityGate.violations.forEach(v => {
    console.log(`  - ${v.rule}: ${v.message}`);
  });
  process.exit(1);
}
```

---

## Best Practices

### 1. Always Initialize Fleet First

```javascript
// ✅ GOOD
const fleet = await mcp__agentic_qe__fleet_init({ ... });
const agent = await mcp__agentic_qe__agent_spawn({ ... });

// ❌ BAD
const agent = await mcp__agentic_qe__agent_spawn({ ... });
// Fleet not initialized!
```

### 2. Use Appropriate Topologies

- **Hierarchical**: Large fleets (10+ agents), clear task delegation
- **Mesh**: Small fleets (5-10 agents), peer coordination
- **Adaptive**: Dynamic workloads, variable agent counts

### 3. Set Realistic Timeouts

```javascript
// ✅ GOOD - Based on actual test duration
spec: {
  timeoutSeconds: 600, // 10 minutes for large suite
  retryCount: 3
}

// ❌ BAD - Too short, causes false failures
spec: {
  timeoutSeconds: 30, // Tests take 5 minutes!
  retryCount: 0
}
```

### 4. Handle Errors Gracefully

```javascript
try {
  const result = await mcp__agentic_qe__test_execute({ ... });
} catch (error) {
  if (error.code === 'TIMEOUT_EXCEEDED') {
    // Retry with longer timeout
    console.log('Retrying with extended timeout...');
  } else if (error.code === 'INSUFFICIENT_AGENTS') {
    // Spawn more agents
    await mcp__agentic_qe__agent_spawn({ ... });
  } else {
    throw error;
  }
}
```

### 5. Use Memory for Agent Coordination

```javascript
// Store test plan
await mcp__agentic_qe__memory_store({
  key: 'aqe/test-plan/generated',
  value: testPlan,
  namespace: 'coordination',
  ttl: 86400 // 24 hours
});

// Share with other agents
await mcp__agentic_qe__memory_share({
  sourceKey: 'aqe/test-plan/generated',
  sourceNamespace: 'coordination',
  targetAgents: ['test-executor-001', 'coverage-analyzer-001'],
  permissions: ['read']
});
```

### 6. Monitor Fleet Status

```javascript
// Regular status checks
setInterval(async () => {
  const status = await mcp__agentic_qe__fleet_status({
    includeMetrics: true
  });

  if (status.metrics.successRate < 90) {
    console.warn('Fleet success rate below threshold!');
  }

  if (status.agentCount < status.maxAgents * 0.5) {
    console.warn('Fleet under-utilized!');
  }
}, 60000); // Every minute
```

---

## Error Handling

### Common Errors

#### Fleet Initialization Errors

| Error Code | Cause | Solution |
|------------|-------|----------|
| `INVALID_TOPOLOGY` | Unknown topology | Use: hierarchical, mesh, ring, adaptive |
| `AGENT_LIMIT_EXCEEDED` | maxAgents out of range | Set between 5-50 |
| `MISSING_REQUIRED` | Missing required params | Check config.topology and config.maxAgents |

#### Agent Errors

| Error Code | Cause | Solution |
|------------|-------|----------|
| `INVALID_AGENT_TYPE` | Unknown agent type | Check supported types in docs |
| `MISSING_CAPABILITIES` | No capabilities specified | Add at least one capability |
| `RESOURCE_LIMIT` | Resources exceed limits | Reduce resource allocation |
| `FLEET_NOT_FOUND` | Fleet doesn't exist | Initialize fleet first |

#### Execution Errors

| Error Code | Cause | Solution |
|------------|-------|----------|
| `NO_TEST_SUITES` | Empty test suites | Provide at least one suite |
| `EXECUTION_TIMEOUT` | Tests exceeded timeout | Increase timeoutSeconds |
| `WORKER_FAILURE` | Worker crashed | Check test code for infinite loops |
| `ENVIRONMENT_UNAVAILABLE` | Environment not ready | Verify environment status |

### Error Handling Pattern

```javascript
async function executeWithRetry(operation, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === maxRetries) throw error;

      const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
      console.log(`Attempt ${attempt} failed, retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

// Usage
const result = await executeWithRetry(() =>
  mcp__agentic_qe__test_execute({ spec: { ... } })
);
```

---

## Migration Guide

See [MCP-TOOLS-MIGRATION.md](./MCP-TOOLS-MIGRATION.md) for v1.3.5 migration guide.

---

## Troubleshooting

### MCP Server Not Connected

**Symptom**: Tools not available in Claude Code

**Solution**:
```bash
# 1. Check MCP server status
npm run mcp:start

# 2. Verify in Claude Code
claude mcp list

# 3. Restart MCP server if needed
npm run mcp:restart
```

### Fleet Initialization Fails

**Symptom**: `FLEET_INIT_FAILED` error

**Solution**:
```javascript
// Check prerequisites
const prerequisites = {
  memoryAvailable: true,
  coordinationEnabled: true,
  agentPoolReady: true
};

// Initialize with minimal config first
const fleet = await mcp__agentic_qe__fleet_init({
  config: {
    topology: 'hierarchical',
    maxAgents: 5 // Start small
  }
});
```

### Test Execution Hangs

**Symptom**: Tests never complete

**Solution**:
```javascript
// 1. Add timeout
spec: {
  timeoutSeconds: 300,
  retryCount: 0 // Disable retries for debugging
}

// 2. Use streaming to see progress
const stream = await mcp__agentic_qe__test_execute_stream({
  spec: { ... },
  enableRealtimeUpdates: true
});

for await (const event of stream) {
  console.log(event); // See where it hangs
}
```

### Memory Issues

**Symptom**: Out of memory errors

**Solution**:
```javascript
// 1. Reduce parallelism
parallelism: 2, // Instead of 8

// 2. Enable batching
batchSize: 10,
maxConcurrent: 3,

// 3. Clear memory after operations
await mcp__agentic_qe__memory_backup({
  action: 'create',
  namespace: 'coordination'
});

// ... operations ...

await mcp__agentic_qe__memory_backup({
  action: 'delete',
  backupId: 'latest'
});
```

---

## Additional Resources

- **API Reference**: Full TypeScript definitions in `src/mcp/tools.ts`
- **Examples**: Working examples in `examples/mcp/`
- **Guides**:
  - [Testing Workflows](./guides/mcp/testing-workflow.md)
  - [Quality Gates](./guides/mcp/quality-gates.md)
  - [Agent Coordination](./guides/mcp/agent-coordination.md)
  - [Performance Optimization](./guides/mcp/performance.md)
- **Support**: Open an issue at https://github.com/proffesor-for-testing/agentic-qe-cf

---

**Generated**: 2025-10-30
**Version**: 1.3.5
**Agentic QE Fleet** - Quality Engineering Automation
