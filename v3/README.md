# Agentic QE v3

[![npm version](https://img.shields.io/npm/v/@agentic-qe/v3.svg)](https://www.npmjs.com/package/@agentic-qe/v3)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)

> Domain-Driven Quality Engineering with 12 Bounded Contexts, ReasoningBank Learning, and HNSW Vector Search

## Quick Start

```bash
# Install globally
npm install -g @agentic-qe/v3

# Initialize your project
cd your-project
aqe-v3 init --wizard

# Or with auto-configuration
aqe-v3 init --auto

# Add MCP server to Claude Code
claude mcp add agentic-qe-v3 npx @agentic-qe/v3 mcp
```

## Architecture Overview

Agentic QE v3 uses a **Domain-Driven Design (DDD)** architecture with a microkernel pattern:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Queen Coordinator                                  │
│                    (Task Orchestration & Work Stealing)                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                        Cross-Domain Event Router                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                              QE Kernel                                       │
│  ┌──────────┐  ┌──────────────┐  ┌─────────────┐  ┌──────────────────────┐  │
│  │ EventBus │  │ AgentCoord.  │  │ PluginLoader│  │ Memory (HNSW+SQLite) │  │
│  └──────────┘  └──────────────┘  └─────────────┘  └──────────────────────┘  │
├─────────────────────────────────────────────────────────────────────────────┤
│                          12 Bounded Contexts                                 │
│  ┌───────────────┐ ┌───────────────┐ ┌───────────────┐ ┌───────────────┐   │
│  │ Test          │ │ Test          │ │ Coverage      │ │ Quality       │   │
│  │ Generation    │ │ Execution     │ │ Analysis      │ │ Assessment    │   │
│  └───────────────┘ └───────────────┘ └───────────────┘ └───────────────┘   │
│  ┌───────────────┐ ┌───────────────┐ ┌───────────────┐ ┌───────────────┐   │
│  │ Defect        │ │ Requirements  │ │ Code          │ │ Security      │   │
│  │ Intelligence  │ │ Validation    │ │ Intelligence  │ │ Compliance    │   │
│  └───────────────┘ └───────────────┘ └───────────────┘ └───────────────┘   │
│  ┌───────────────┐ ┌───────────────┐ ┌───────────────┐ ┌───────────────┐   │
│  │ Contract      │ │ Visual        │ │ Chaos         │ │ Learning      │   │
│  │ Testing       │ │ Accessibility │ │ Resilience    │ │ Optimization  │   │
│  └───────────────┘ └───────────────┘ └───────────────┘ └───────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 12 DDD Bounded Contexts

| Domain | Description | Key Features |
|--------|-------------|--------------|
| **test-generation** | AI-powered test creation | Pattern learning, multi-framework support, coverage targeting |
| **test-execution** | Parallel test running | Retry logic, flaky detection, parallel orchestration |
| **coverage-analysis** | O(log n) gap detection | HNSW indexing, risk scoring, sublinear analysis |
| **quality-assessment** | Quality gates | Deployment decisions, metric aggregation, trend analysis |
| **defect-intelligence** | Defect prediction | Root cause analysis, pattern learning, regression detection |
| **requirements-validation** | BDD scenarios | Testability scoring, acceptance criteria, Gherkin generation |
| **code-intelligence** | Knowledge graph | Semantic search, impact analysis, dependency mapping |
| **security-compliance** | SAST/DAST scanning | OWASP checks, CVE detection, compliance validation |
| **contract-testing** | API contracts | Schema validation, breaking change detection, GraphQL support |
| **visual-accessibility** | Visual regression | WCAG compliance, responsive testing, screenshot comparison |
| **chaos-resilience** | Chaos engineering | Fault injection, load testing, resilience validation |
| **learning-optimization** | Cross-domain learning | Pattern transfer, metric optimization, SONA integration |

## Core Components

### QE Kernel

The microkernel provides core infrastructure:

```typescript
import { QEKernelImpl } from '@agentic-qe/v3';

const kernel = new QEKernelImpl({
  maxConcurrentAgents: 15,
  memoryBackend: 'hybrid',      // 'sqlite' | 'hybrid' | 'agentdb'
  hnswEnabled: true,            // 150x faster vector search
  lazyLoading: true,            // Load domains on demand
  enabledDomains: [
    'test-generation',
    'coverage-analysis',
    // ... other domains
  ],
});

await kernel.initialize();
```

### Queen Coordinator

Orchestrates tasks across all domains:

```typescript
import { createQueenCoordinator } from '@agentic-qe/v3';

const queen = createQueenCoordinator(kernel, router, executor);
await queen.initialize();

// Submit a task
const result = await queen.submitTask({
  type: 'generate-tests',
  priority: 'p1',
  targetDomains: ['test-generation'],
  payload: { sourceFile: 'src/user-service.ts' },
  timeout: 300000,
});

// Check health
const health = queen.getHealth();
console.log(`Status: ${health.status}, Agents: ${health.totalAgents}`);
```

### Event Bus

Cross-domain communication:

```typescript
// Publish events
kernel.eventBus.publish('test-generation.tests-generated', {
  testCount: 15,
  coverage: 85,
});

// Subscribe to events
kernel.eventBus.subscribe('coverage-analysis.gap-detected', (event) => {
  console.log('Coverage gap:', event.payload);
});
```

### Memory Backend

HNSW-indexed vector storage:

```typescript
// Store with vector embedding
await kernel.memory.store('pattern:auth-test', {
  pattern: 'JWT authentication test pattern',
  confidence: 0.95,
}, { namespace: 'patterns', ttl: 86400 });

// Semantic search (150x faster with HNSW)
const results = await kernel.memory.search('authentication patterns', {
  limit: 10,
  threshold: 0.7,
});
```

## CLI Commands

### Initialization

```bash
# Interactive wizard
aqe-v3 init --wizard

# Auto-configure based on project
aqe-v3 init --auto

# Manual configuration
aqe-v3 init -d test-generation,coverage-analysis -m hybrid --max-agents 20
```

### Status & Health

```bash
# System status
aqe-v3 status
aqe-v3 status --verbose

# Domain health
aqe-v3 health
aqe-v3 health -d test-generation
```

### Test Generation

```bash
# Generate tests for a file
aqe-v3 test generate src/services/user.ts

# Generate with options
aqe-v3 test generate src/ -t unit -f vitest
```

### Coverage Analysis

```bash
# Analyze coverage
aqe-v3 coverage ./src

# With gap detection and risk scoring
aqe-v3 coverage ./src --gaps --risk
```

### Security Scanning

```bash
# Run SAST scan
aqe-v3 security --sast -t ./src

# Check compliance
aqe-v3 security --compliance gdpr,hipaa
```

### Code Intelligence

```bash
# Index codebase
aqe-v3 code index ./src

# Semantic search
aqe-v3 code search "authentication middleware"

# Impact analysis
aqe-v3 code impact ./src/auth.ts

# Dependency mapping
aqe-v3 code deps ./src
```

### Migration from v2

```bash
# Preview migration
aqe-v3 migrate --dry-run

# Run migration with backup
aqe-v3 migrate --backup

# Full migration
aqe-v3 migrate
```

### Task Management

```bash
# Submit a task
aqe-v3 task submit generate-tests -p p1 --payload '{"source":"src/"}'

# List tasks
aqe-v3 task list
aqe-v3 task list -s running

# Task status
aqe-v3 task status <task-id>

# Cancel task
aqe-v3 task cancel <task-id>
```

### Agent Management

```bash
# List agents
aqe-v3 agent list
aqe-v3 agent list -d test-generation

# Spawn agent
aqe-v3 agent spawn test-generation -t worker -c unit-test,integration-test
```

## MCP Integration

Add the v3 MCP server to Claude Code:

```bash
claude mcp add agentic-qe-v3 npx @agentic-qe/v3 mcp
```

### Available MCP Tools

| Tool | Description |
|------|-------------|
| `fleet_init` | Initialize the QE fleet |
| `fleet_status` | Get fleet and agent status |
| `fleet_health` | Check fleet health |
| `task_submit` | Submit a task |
| `task_list` | List all tasks |
| `task_status` | Get task status |
| `task_cancel` | Cancel a task |
| `task_orchestrate` | Orchestrate complex QE workflows |
| `agent_list` | List active agents |
| `agent_spawn` | Spawn a new agent |
| `agent_metrics` | Get agent performance metrics |
| `test_generate_enhanced` | AI-powered test generation |
| `test_execute_parallel` | Parallel test execution |
| `coverage_analyze_sublinear` | O(log n) coverage analysis |
| `quality_assess` | Quality gate assessment |
| `security_scan_comprehensive` | SAST/DAST security scanning |
| `contract_validate` | API contract validation |
| `accessibility_test` | WCAG accessibility testing |
| `chaos_test` | Chaos engineering tests |
| `defect_predict` | AI defect prediction |
| `requirements_validate` | Requirements validation |
| `code_index` | Code intelligence indexing |
| `memory_store` | Store data in memory |
| `memory_retrieve` | Retrieve from memory |
| `memory_query` | Query memory with patterns |
| `memory_share` | Share knowledge between agents |

## Programmatic API

### Test Generation

```typescript
import { QEKernelImpl } from '@agentic-qe/v3';

const kernel = new QEKernelImpl();
await kernel.initialize();

const testGenAPI = kernel.getDomainAPI('test-generation');
const result = await testGenAPI.generateTests({
  sourceFiles: ['src/user-service.ts'],
  testType: 'unit',
  framework: 'vitest',
  coverageTarget: 90,
});

console.log(`Generated ${result.value.tests.length} tests`);
```

### Coverage Analysis

```typescript
const coverageAPI = kernel.getDomainAPI('coverage-analysis');
const gaps = await coverageAPI.detectGaps({
  coverageData: existingCoverage,
  minCoverage: 80,
  prioritize: 'risk',
});

console.log(`Found ${gaps.value.gaps.length} coverage gaps`);
```

### Quality Assessment

```typescript
const qualityAPI = kernel.getDomainAPI('quality-assessment');
const gate = await qualityAPI.evaluateQualityGate({
  metrics: {
    coverage: 85,
    testsPassing: 100,
    securityVulnerabilities: 0,
  },
  thresholds: {
    minCoverage: 80,
    maxVulnerabilities: 0,
  },
});

console.log(`Quality gate: ${gate.value.passed ? 'PASSED' : 'FAILED'}`);
```

## Performance Characteristics

| Metric | v2 | v3 | Improvement |
|--------|----|----|-------------|
| Coverage Analysis | O(n) | O(log n) | Sublinear |
| Pattern Search | Linear scan | HNSW index | 150x faster |
| Memory Usage | Unbounded | Quantized | 50-75% reduction |
| Agent Coordination | Sequential | Work stealing | 3-5x throughput |
| Startup Time | ~2s | ~500ms | 4x faster |

## Key Differences from v2

| Feature | v2 | v3 |
|---------|----|----|
| Architecture | Monolithic | 12 DDD Bounded Contexts |
| Test Framework | Jest | Vitest |
| Module System | CommonJS | ESM |
| Memory | SQLite only | HNSW + SQLite hybrid |
| Learning | Basic patterns | ReasoningBank + SONA |
| Agents | 31 | 78 specialized |
| CLI | `aqe` | `aqe-v3` |
| Package | `agentic-qe` | `@agentic-qe/v3` |

## Migration from v2

See the [Migration Guide](../docs/MIGRATION-GUIDE.md) for detailed instructions.

```bash
# Quick migration
npm install @agentic-qe/v3
aqe-v3 migrate --backup
```

## Configuration

### Project Configuration (.aqe-v3/config.json)

```json
{
  "version": "3.0.0",
  "kernel": {
    "maxConcurrentAgents": 15,
    "memoryBackend": "hybrid",
    "hnswEnabled": true,
    "lazyLoading": true
  },
  "domains": {
    "test-generation": { "enabled": true },
    "coverage-analysis": { "enabled": true, "algorithm": "hnsw" },
    "security-compliance": { "enabled": true }
  },
  "learning": {
    "reasoningBank": true,
    "sona": true,
    "patternRetention": 180
  }
}
```

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for guidelines.

## License

MIT - see [LICENSE](../LICENSE) for details.
