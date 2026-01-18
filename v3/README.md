# Agentic QE

[![npm version](https://img.shields.io/npm/v/agentic-qe.svg)](https://www.npmjs.com/package/agentic-qe)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)

> Domain-Driven Quality Engineering with 12 Bounded Contexts, 50 Specialized QE Agents (43 main + 7 subagents), ReasoningBank Learning, and HNSW Vector Search

## Quick Start

```bash
# Install globally
npm install -g agentic-qe

# Initialize your project
cd your-project
aqe init --wizard

# Or with auto-configuration
aqe init --auto

# Add MCP server to Claude Code (requires global install)
claude mcp add aqe -- aqe-mcp
```

### Local Installation

```bash
# Install as dev dependency
npm install --save-dev agentic-qe

# Run via npx
npx aqe init --wizard
npx aqe test generate src/
```

## Why Agentic QE?

- **50 Specialized QE Agents** - Domain-focused quality engineering agents (43 main + 7 subagents)
- **12 DDD Bounded Contexts** - Modular, extensible architecture
- **TinyDancer Model Routing** - 3-tier intelligent routing for cost optimization
- **O(log n) Coverage Analysis** - Sublinear performance with HNSW indexing
- **Fast Pattern Search** - O(log n) HNSW-indexed vector storage
- **ReasoningBank + SONA + Dream Cycles** - Neural pattern learning with 9 RL algorithms
- **Queen-led Coordination** - 3-5x throughput with work stealing and consensus
- **MinCut Topology** - Graph-based self-healing agent coordination
- **Zero-Breaking-Changes Migration** - Full v2 backward compatibility

## New in v3: Key Features

### TinyDancer Intelligent Model Routing (ADR-026)

3-tier intelligent model routing for cost optimization:

| Complexity | Model | Use Cases |
|------------|-------|-----------|
| **0-20** (Simple) | Haiku | Syntax fixes, type additions |
| **20-70** (Moderate) | Sonnet | Bug fixes, test generation |
| **70+** (Critical) | Opus | Architecture, security |

### Dream Cycles & Neural Learning

Background neural consolidation for continuous improvement:

- **9 RL Algorithms**: Q-Learning, SARSA, DQN, PPO, A2C, DDPG, Actor-Critic, Policy Gradient, Decision Transformer
- **Dream Cycles**: 30s max consolidation with spreading activation
- **SONA Integration**: Self-Optimizing Neural Architecture (<0.05ms adaptation)
- **Novelty Scoring**: Prioritize learning from novel patterns

### Consensus & MinCut Coordination

Advanced coordination for reliable multi-agent decisions:

- **Byzantine Consensus**: Fault-tolerant voting for critical quality decisions
- **MinCut Topology**: Graph-based self-healing agent coordination
- **Multi-Model Voting**: Aggregate decisions from multiple model tiers
- **Claim Verification**: Cryptographic verification of agent work claims

## Architecture Overview

Agentic QE uses a **Domain-Driven Design (DDD)** architecture with a microkernel pattern:

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
import { QEKernelImpl } from 'agentic-qe';

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
import { createQueenCoordinator } from 'agentic-qe';

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
aqe init --wizard

# Auto-configure based on project
aqe init --auto

# Manual configuration
aqe init -d test-generation,coverage-analysis -m hybrid --max-agents 20
```

### Status & Health

```bash
# System status
aqe status
aqe status --verbose

# Domain health
aqe health
aqe health -d test-generation
```

### Test Generation

```bash
# Generate tests for a file
aqe test generate src/services/user.ts

# Generate with options
aqe test generate src/ -t unit -f vitest
```

### Coverage Analysis

```bash
# Analyze coverage
aqe coverage ./src

# With gap detection and risk scoring
aqe coverage ./src --gaps --risk
```

### Security Scanning

```bash
# Run SAST scan
aqe security --sast -t ./src

# Check compliance
aqe security --compliance gdpr,hipaa
```

### Code Intelligence

```bash
# Index codebase
aqe code index ./src

# Semantic search
aqe code search "authentication middleware"

# Impact analysis
aqe code impact ./src/auth.ts

# Dependency mapping
aqe code deps ./src
```

### Migration from v2

```bash
# Preview migration
aqe migrate --dry-run

# Run migration with backup
aqe migrate --backup

# Full migration
aqe migrate
```

### Task Management

```bash
# Submit a task
aqe task submit generate-tests -p p1 --payload '{"source":"src/"}'

# List tasks
aqe task list
aqe task list -s running

# Task status
aqe task status <task-id>

# Cancel task
aqe task cancel <task-id>
```

### Agent Management

```bash
# List agents
aqe agent list
aqe agent list -d test-generation

# Spawn agent
aqe agent spawn test-generation -t worker -c unit-test,integration-test
```

## MCP Integration

Add the MCP server to Claude Code (requires global install):

```bash
# First install globally
npm install -g agentic-qe

# Then add to Claude Code
claude mcp add aqe -- aqe-mcp

# Or run directly with npx (no global install)
claude mcp add aqe -- npx agentic-qe mcp
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
| `memory_usage` | Get memory usage statistics |

**New in v3:**

| Tool | Description |
|------|-------------|
| `agent_status` | Get detailed agent status |
| `dream_cycle` | Trigger neural consolidation |
| `model_route` | Get optimal model routing |
| `model_stats` | View routing statistics |
| `consensus_status` | View consensus decisions |
| `topology_optimize` | Optimize agent topology |

## Programmatic API

### Test Generation

```typescript
import { QEKernelImpl } from 'agentic-qe';

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
| Pattern Search | Linear scan | HNSW index | O(log n) vs O(n) |
| MCP Response (P95) | ~100ms | 0.6ms | 166x faster |
| Memory Usage | Unbounded | Quantized | 50-75% reduction |
| Agent Coordination | Sequential | Work stealing | 3-5x throughput |
| Model Cost | Single tier | TinyDancer 3-tier | Optimized |
| Startup Time | ~2s | ~500ms | 4x faster |
| Neural Adaptation | N/A | SONA | <0.05ms |

## Key Differences from v2

| Feature | v2 | v3 |
|---------|----|----|
| Architecture | Monolithic | 12 DDD Bounded Contexts |
| Test Framework | Jest | Vitest |
| Module System | CommonJS | ESM |
| Memory | SQLite only | HNSW + SQLite hybrid |
| Learning | Basic patterns | ReasoningBank + SONA + Dream Cycles |
| Agents | 32 | 50 QE agents (43 main + 7 subagents) |
| Coverage | O(n) | O(log n) |
| Pattern Search | Linear | O(log n) HNSW indexing |
| Coordination | Sequential | Queen + Work Stealing + Consensus |
| Model Routing | None | TinyDancer 3-tier routing |
| CLI | `aqe` | `aqe` |
| Package | `agentic-qe@2` | `agentic-qe` |

## Migration from v2

Agentic QE v3 provides **zero-breaking-changes** migration. All v2 APIs, CLI commands, and configurations continue to work.

### Quick Migration

```bash
# Install v3 (replaces v2)
npm install agentic-qe

# Run migration with backup
aqe migrate --backup

# Verify migration
aqe migrate status
```

### What Gets Migrated

| Component | v2 Location | v3 Location | Auto-Migrate |
|-----------|-------------|-------------|--------------|
| Memory DB | `.agentic-qe/memory.db` | `.aqe/agentdb/` | Yes |
| Config | `.agentic-qe/config.json` | `.aqe/config.json` | Yes |
| Patterns | `.agentic-qe/patterns/` | `.aqe/reasoning-bank/` | Yes |

### Backward Compatibility

All v2 agent names and CLI commands remain functional:

```bash
# v2 commands still work
aqe generate tests --file src/app.ts  # Mapped to: aqe test generate

# v2 agent names still work
qe-test-generator  # Mapped to: qe-test-architect
```

See the [Migration Guide](./docs/MIGRATION-GUIDE.md) for detailed instructions and the [Changelog](./docs/CHANGELOG-V3.md) for all changes.

## Configuration

### Project Configuration (.aqe/config.json)

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

## 50 QE Agents

Agentic QE includes 50 specialized quality engineering agents (43 main + 7 subagents) organized by domain:

### Test Generation Domain
`qe-test-architect`, `qe-tdd-specialist`, `qe-tdd-red`, `qe-tdd-green`, `qe-tdd-refactor`, `qe-property-tester`, `qe-mutation-tester`, `qe-bdd-generator`

### Test Execution Domain
`qe-test-executor`, `qe-flaky-hunter`, `qe-retry-handler`, `qe-parallel-executor`

### Coverage Analysis Domain
`qe-coverage-specialist`, `qe-gap-detector`, `qe-risk-analyzer`

### Quality Assessment Domain
`qe-quality-gate`, `qe-metrics-optimizer`, `qe-deployment-advisor`

### Defect Intelligence Domain
`qe-defect-intelligence`, `qe-regression-analyzer`, `qe-root-cause-analyzer`

### Code Intelligence Domain
`qe-knowledge-manager`, `qe-dependency-mapper`, `qe-impact-analyzer`

### Security Compliance Domain
`qe-security-auditor`, `qe-security-scanner`, `qe-compliance-validator`

### Contract Testing Domain
`qe-contract-validator`, `qe-contract-testing`, `qe-graphql-tester`

### Visual Accessibility Domain
`qe-visual-accessibility`, `qe-responsive-tester`, `qe-accessibility-auditor`

### Chaos Resilience Domain
`qe-chaos-engineer`, `qe-load-tester`, `qe-resilience-tester`, `qe-performance-tester`

### Learning Optimization Domain
`qe-learning-optimization`, `qe-pattern-learner`, `qe-transfer-specialist`

### Coordination
`qe-queen-coordinator`, `qe-fleet-commander`, `qe-integration-tester`, `qe-data-generator`, `qe-code-reviewer`

### Additional Agents (New in v3)
`qe-product-factors-assessor` (SFDIPOT analysis), `qe-test-idea-rewriter` (passive→active test transforms)

## Requirements

- Node.js 18.0.0 or higher
- npm 8.0.0 or higher

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for guidelines.

## Documentation

- [Migration Guide](./docs/MIGRATION-GUIDE.md) - Migrating from v2 to v3
- [Changelog](./docs/CHANGELOG-V3.md) - Version history and changes
- [API Reference](https://github.com/proffesor-for-testing/agentic-qe) - Full API documentation

## License

MIT - see [LICENSE](../LICENSE) for details.
