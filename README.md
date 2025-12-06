# Agentic Quality Engineering Fleet

<div align="center">

[![npm version](https://img.shields.io/npm/v/agentic-qe.svg)](https://www.npmjs.com/package/agentic-qe)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
<img alt="NPM Downloads" src="https://img.shields.io/npm/dw/agentic-qe">


**Version 2.1.2** | [Changelog](CHANGELOG.md) | [Contributors](CONTRIBUTORS.md) | [Issues](https://github.com/proffesor-for-testing/agentic-qe/issues) | [Discussions](https://github.com/proffesor-for-testing/agentic-qe/discussions)

> Agentic test automation with AI learning, real-time visualization, QUIC transport, testability scoring, OpenTelemetry observability, persistent event storage, constitutional AI governance, and intelligent model routing.

🎨 **Real-Time Visualization** | 📊 **Testability Scoring** | 🧠 **QE Agent Learning** | 🚀 **QUIC Transport** | 📋 **Constitution System** | 📚 **41 QE Skills** | 🎯 **Flaky Detection** | 💰 **Multi-Model Router**

</div>

---

## ⚡ Quick Start

### Install & Initialize

```bash
# Install globally
npm install -g agentic-qe

# Initialize your project
cd your-project
aqe init

# Add MCP server to Claude Code (optional)
claude mcp add agentic-qe npx aqe-mcp

# Verify connection
claude mcp list
```

### Use from Claude Code CLI

Ask Claude to use AQE agents directly from your terminal:

```bash
# Generate comprehensive tests
claude "Use qe-test-generator to create tests for src/services/user-service.ts with 95% coverage"

# Run quality pipeline
claude "Initialize AQE fleet: generate tests, execute them, analyze coverage, and run quality gate"

# Detect flaky tests
claude "Use qe-flaky-test-hunter to analyze the last 100 test runs and identify flaky tests"
```

**What gets initialized:**
- ✅ **Phase 3 Visualization**: Real-time dashboards, interactive graphs (v1.9.0)
- ✅ **Phase 1-2 Infrastructure**: OpenTelemetry, Event Store, Constitution System
- ✅ Multi-Model Router (70-81% cost savings - opt-in)
- ✅ Learning System (20% improvement target)
- ✅ Pattern Bank (cross-project reuse)
- ✅ ML Flaky Detection (100% accuracy)
- ✅ 19 Specialized agent definitions (including qe-code-complexity)
- ✅ 11 TDD subagent definitions (RED/GREEN/REFACTOR phases + specialized)
- ✅ 41 World-class QE skills library (accessibility, shift-left/right, verification, visual testing, XP practices, **testability-scoring** by [@fndlalit](https://github.com/fndlalit))
- ✅ 8 AQE slash commands
- ✅ Modular init system with comprehensive project setup

---

## ✨ Features

### 🎨 Phase 3: Real-Time Visualization (v1.9.0)

**Production-Ready Observability Dashboards**

#### 📊 Interactive React Frontend
- **MindMap Component**: Cytoscape.js-powered graph visualization with 6 layout algorithms
  - Support for 1000+ nodes with <500ms render time
  - Expand/collapse, zoom/pan, search/filter
  - Real-time WebSocket updates
  - Export to PNG/JSON

- **QualityMetrics Panel**: Recharts-based quality visualization
  - 7-dimension radar chart (coverage, security, performance, etc.)
  - Trend analysis with historical data
  - Token usage and cost tracking
  - Auto-refresh every 30 seconds

- **Timeline View**: Virtual scrolling for event history
  - Handle 1000+ events with react-window
  - Color-coded event types
  - Advanced filtering (agent, type, session, time range)
  - Drill-down detail panels

#### 🔌 Backend API Services
- **REST API**: 6 endpoints for historical data queries
  - Event history with pagination
  - Aggregated metrics
  - Graph visualization data
  - Agent activity history

- **WebSocket Server**: Real-time streaming with backpressure
  - Event streaming with client subscriptions
  - Heartbeat mechanism
  - Connection management
  - <50ms latency

#### 📈 Grafana Dashboards
- **Executive Dashboard**: Quality trends and cost analysis
- **Developer Dashboard**: Trace explorer and debugging tools
- **QA Dashboard**: Test metrics and coverage visualization

**Performance:**
- ✅ 185 events/sec write throughput (186% of target)
- ✅ <1ms query latency (99% better than target)
- ✅ <100ms render time for 100 nodes
- ✅ <500ms render time for 1000 nodes

**Quick Start:**
```bash
# Start visualization services
node scripts/start-visualization-services.ts

# Start frontend dev server
cd frontend && npm run dev

# Open in browser
open http://localhost:3000
```

**Documentation**: See `PHASE3-COMPLETE.md` for full details

---

### 🏗️ Phase 1-2: Foundation & Infrastructure

**Enterprise-Grade Observability & Governance**

#### 📊 OpenTelemetry Integration
- **Full OTEL SDK**: 12 OpenTelemetry packages for comprehensive observability
- **Auto-Instrumentation**: HTTP, file system, and custom metrics
- **Metrics Export**: gRPC and HTTP exporters for Grafana, Prometheus, Jaeger
- **Agent Metrics**: Task completion, success rate, error tracking
- **Quality Metrics**: Coverage %, defect density, test effectiveness
- **System Metrics**: Memory, CPU, latency, throughput

#### 💾 Event Sourcing & Persistence
- **Event Store**: SQLite-based event sourcing with correlation tracking
- **Reasoning Capture**: Agent decision tracking and prompt/response analysis
- **Metrics Aggregation**: Time-window aggregation (hourly, daily, weekly)
- **Performance Optimization**: Prepared statements, indexes, connection pooling
- **Query API**: Time-range queries with pagination support

#### 📋 Constitutional AI Governance
- **JSON Schema Validation**: Type-safe constitution definitions
- **4 Base Constitutions**: Default, test-generation, code-review, performance
- **Inheritance & Merge**: Constitution composition with override support
- **Agent-Specific**: Per-agent constitutional rules and guidelines
- **Validation Pipeline**: Ensure agents follow constitutional principles

**Benefits:**
- 🔍 **Full Observability**: Track every agent action, metric, and decision
- 📈 **Data-Driven**: Historical analysis for continuous improvement
- 🛡️ **Governance**: Constitutional AI ensures quality and compliance
- 🚀 **Production Ready**: Enterprise-grade persistence and monitoring

### 🤖 Autonomous Agent Fleet
- **18 Specialized Agents**: Expert agents for every QE domain (test generation, coverage analysis, security scanning, performance testing, code complexity analysis)
- **11 TDD Subagents**: Specialized subagents for Test-Driven Development workflow (RED/GREEN/REFACTOR phases + quality validation + analysis)
- **AI-Powered Coordination**: Event-driven architecture with intelligent task distribution
- **Zero External Dependencies**: Native AQE hooks system (100-500x faster than external coordination)
- **Scalable**: From single developer projects to enterprise-scale testing infrastructure

### 🧠 Intelligence & Learning (v1.1.0)
- **QE Agent Learning System**: Q-Learning integrated with AgentDB's 9 RL algorithms, 20% improvement target with automatic strategy optimization
- **Pattern Bank**: 85%+ matching accuracy across 6 test frameworks (Jest, Mocha, Cypress, Vitest, Jasmine, AVA)
- **ML Flaky Detection**: 100% accuracy with root cause analysis and automated fix recommendations
- **Continuous Improvement**: A/B testing framework with 95%+ statistical confidence
- **Experience Replay**: Learn from 10,000+ past executions

### 💰 Cost Optimization (v1.0.5)
- **Multi-Model Router**: 70-81% cost savings through intelligent model selection (opt-in feature)
- **4+ AI Models**: GPT-3.5, GPT-4, Claude Haiku, Claude Sonnet 4.5
- **Smart Routing**: Automatic complexity analysis and optimal model selection
- **Real-Time Tracking**: Live cost monitoring with budget alerts and forecasting
- **ROI Dashboard**: Track savings vs single-model baseline

### 📊 Comprehensive Testing
- **Multi-Framework Support**: Jest, Mocha, Cypress, Playwright, Vitest, Jasmine, AVA
- **Parallel Execution**: 10,000+ concurrent tests with intelligent orchestration
- **Real-Time Coverage**: O(log n) algorithms for instant gap detection
- **Performance Testing**: k6, JMeter, Gatling integration
- **Real-Time Streaming**: Live progress updates for all operations

### 🎓 41 QE Skills Library (v1.9.0)
**95%+ coverage of modern QE practices**

<details>
<summary><b>View All Skills</b></summary>

**Phase 1: Original Quality Engineering Skills (18 skills)**
- **Core Testing**: agentic-quality-engineering, holistic-testing-pact, context-driven-testing, exploratory-testing-advanced
- **Methodologies**: tdd-london-chicago, xp-practices, risk-based-testing, test-automation-strategy
- **Techniques**: api-testing-patterns, performance-testing, security-testing
- **Code Quality**: code-review-quality, refactoring-patterns, quality-metrics
- **Communication**: bug-reporting-excellence, technical-writing, consultancy-practices

**Phase 2: Expanded QE Skills Library (16 skills)**
- **Testing Methodologies (7)**: regression-testing, shift-left-testing, shift-right-testing, test-design-techniques, mutation-testing, test-data-management, verification-quality
- **Specialized Testing (9)**: accessibility-testing, mobile-testing, database-testing, contract-testing, chaos-engineering-resilience, compatibility-testing, localization-testing, compliance-testing, visual-testing-advanced
- **Testing Infrastructure (2)**: test-environment-management, test-reporting-analytics

**Phase 3: Advanced Quality Engineering Skills (4 skills)**
- **Strategic Testing Methodologies (4)**: six-thinking-hats, brutal-honesty-review, sherlock-review, cicd-pipeline-qe-orchestrator

**Total: 41 QE Skills** - Includes accessibility testing, shift-left/right testing, verification & quality assurance, visual testing advanced, XP practices, and technical writing

</details>

---

## 💻 Usage Examples

### Example 1: Single Agent Execution

Ask Claude to use a specific agent:

```bash
claude "Use the qe-test-generator agent to create comprehensive tests for src/services/user-service.ts with 95% coverage"
```

**What happens:**
1. Claude Code spawns qe-test-generator via Task tool
2. Agent analyzes the source file
3. Generates tests with pattern matching (Phase 2 feature)
4. Stores results in memory at `aqe/test-plan/generated`

**Output:**
```
Generated 42 tests
Pattern hit rate: 67%
Time saved: 2.3s
Quality score: 96%
```

### Example 2: Multi-Agent Parallel Execution

Coordinate multiple agents at once:

```bash
claude "Initialize the AQE fleet:
1. Use qe-test-generator to create tests for src/services/*.ts
2. Use qe-test-executor to run all tests in parallel
3. Use qe-coverage-analyzer to find gaps with sublinear algorithms
4. Use qe-quality-gate to validate against 95% threshold"
```

**What happens:**
1. Claude spawns 4 agents concurrently in a single message
2. Agents coordinate through `aqe/*` memory namespace
3. Pipeline: test generator → executor → analyzer → gate
4. Real-time streaming progress updates

**Memory namespaces:**
- `aqe/test-plan/*` - Test planning and requirements
- `aqe/coverage/*` - Coverage analysis results
- `aqe/performance/*` - Performance test data
- `aqe/quality/*` - Quality metrics

### Example 3: Using Agents with Skills

Agents automatically leverage skills:

```bash
claude "Use qe-test-generator with shift-left-testing and test-design-techniques skills to create tests before implementing the new payment feature"
```

**Available skills** (agents auto-select from 40):
- TDD, API testing, performance, security
- Accessibility, mobile, chaos engineering, visual testing
- Regression, shift-left/right, compliance, verification
- Six thinking hats, brutal honesty reviews, CI/CD orchestration
- XP practices, technical writing, refactoring patterns

### Example 4: Full Quality Pipeline

End-to-end quality workflow:

```bash
claude "Run the full AQE quality pipeline:
1. qe-requirements-validator - validate requirements are testable
2. qe-test-generator - generate comprehensive test suite
3. qe-test-executor - run tests with parallel execution
4. qe-coverage-analyzer - analyze gaps using O(log n) algorithms
5. qe-flaky-test-hunter - detect flaky tests with 100% ML accuracy
6. qe-security-scanner - run SAST/DAST scans
7. qe-performance-tester - load test critical paths
8. qe-quality-gate - validate all quality criteria met
9. qe-deployment-readiness - assess deployment risk"
```

### Example 5: Specialized Testing Scenarios

```bash
# API contract validation
claude "Use qe-api-contract-validator to check if the new API changes break any existing contracts"

# Visual regression testing
claude "Use qe-visual-tester to compare screenshots of the updated dashboard against baseline"

# Chaos engineering
claude "Use qe-chaos-engineer to inject random failures and validate system resilience"

# Flaky test detection with ML
claude "Use qe-flaky-test-hunter to analyze the last 100 test runs and identify flaky tests with ML-powered root cause analysis"

# Code complexity analysis
claude "Use qe-code-complexity to analyze src/ directory and get refactoring recommendations for complex code"
```

### Example 6: Fleet Coordination at Scale

```bash
# Coordinate 50+ agents for large projects
claude "Use qe-fleet-commander to coordinate parallel testing across 8 microservices with 50 agents total"
```

### MCP Integration Examples

You can also use agents through MCP tools:

```bash
# Check MCP connection
claude mcp list

# Direct MCP tool usage (in Claude Code)
# Generate tests
mcp__agentic_qe__test_generate({
  type: "unit",
  framework: "jest",
  targetFile: "src/user-service.ts"
})

# Execute tests
mcp__agentic_qe__test_execute({
  parallel: true,
  coverage: true
})

# Analyze coverage
mcp__agentic_qe__coverage_analyze({
  threshold: 95
})
```

**All 84 MCP Tools Available:**
- Fleet Management (9 tools): init, spawn, status, coordinate, orchestrate
- Test Generation (2 tools): generate enhanced, execute
- Test Execution (3 tools): execute, parallel, stream
- Coverage Analysis (4 tools): analyze with risk scoring, detect gaps ML, trends, recommendations
- Quality Gates (3 tools): execute, validate metrics, generate report
- Flaky Test Detection (2 tools): detect statistical, analyze patterns
- Performance Testing (3 tools): benchmark, analyze bottlenecks, generate report
- Security Scanning (2 tools): comprehensive scan, detect vulnerabilities
- Visual Testing (3 tools): compare screenshots, accessibility validation, regression detection
- API Contract Testing (3 tools): validate, breaking changes, versioning
- Test Data Management (3 tools): generate, mask, analyze schema
- Code Quality (2 tools): complexity analysis, metrics
- Memory & Collaboration (5 tools): store, retrieve, query, share, backup
- Blackboard System (2 tools): post, read
- Consensus Mechanisms (2 tools): propose, vote
- Workflow Management (4 tools): create, execute, checkpoint, resume
- Event System (2 tools): emit, subscribe
- Regression Analysis (2 tools): analyze risk, select tests
- Production Monitoring (2 tools): incident replay, RUM analyze
- Mutation Testing (1 tool): execute
- Deployment Readiness (1 tool): check
- Artifact Management (1 tool): manifest
- Task Management (1 tool): status
- Learning System (4 tools): store experience, store Q-value, store pattern, query

### CLI Direct Usage

```bash
# Generate tests
aqe test src/services/user-service.ts

# Analyze coverage
aqe coverage --threshold 95

# Run quality gate
aqe quality

# View fleet status
aqe status --verbose

# Enable multi-model router (70-81% cost savings)
aqe routing enable

# Start learning system
aqe learn enable --all
```

### Advanced Patterns

#### Pattern 1: Continuous Learning

```bash
# Agents learn from execution
claude "Use qe-test-generator with learning enabled to create tests, then analyze improvement over time"

# Check learning metrics
aqe learn status --agent test-generator
```

**Example Output:**
```
📊 LEARNING STATUS

Agent: test-generator
Status: ENABLED ✅
Total Experiences: 247
Exploration Rate: 15.3%

Performance:
├─ Average Reward: 1.23
├─ Success Rate: 87.5%
└─ Improvement Rate: 18.7% (↑ target: 20%)

Top Strategies:
1. property-based (confidence: 92%, success: 95%)
2. mutation-based (confidence: 85%, success: 88%)
3. example-based (confidence: 78%, success: 82%)
```

#### Pattern 2: Pattern Bank Usage

```bash
# Extract and reuse patterns
claude "Use qe-test-generator to extract test patterns from existing tests, then apply them to new modules"

# List patterns
aqe patterns list --framework jest
```

**Example Output:**
```
📦 PATTERN LIBRARY (247 patterns)

ID         | Name                      | Framework | Quality | Uses
-----------|---------------------------|-----------|---------|-----
pattern-001| Null Parameter Check      | jest      | 92%     | 142
pattern-002| Empty Array Handling      | jest      | 89%     | 98
pattern-003| API Timeout Test          | cypress   | 95%     | 87
```

#### Pattern 3: Cost Optimization

```bash
# Enable intelligent model routing
aqe routing enable

# View savings
claude "Check routing status and show cost savings"
aqe routing dashboard
```

**Example Output:**
```
✅ Multi-Model Router Status

Cost Summary (Last 30 Days):
  Total Cost: $127.50
  Baseline Cost: $545.00
  Savings: $417.50 (76.6%)
  Budget Status: ON TRACK ✓

Model Usage:
  ├─ gpt-3.5-turbo: 42% (simple tasks)
  ├─ claude-haiku: 31% (medium tasks)
  ├─ claude-sonnet-4.5: 20% (complex tasks)
  └─ gpt-4: 7% (critical tasks)
```

### Pro Tips

1. **Batch agent operations**: Always spawn multiple agents in one Claude message for parallel execution
2. **Use memory namespace**: Agents coordinate through `aqe/*` memory keys
3. **Enable learning**: Add `--enable-learning` to agent commands for continuous improvement
4. **Check agent status**: Use `aqe status` to see active agents and coordination
5. **Review agent output**: Agents store detailed results in `.agentic-qe/logs/`

---

## 🤖 Agent Types

<details>
<summary><b>Core Testing Agents (6 agents)</b></summary>

| Agent | Purpose | Key Features | Phase 2 Enhancements |
|-------|---------|-------------|---------------------|
| **test-generator** | AI-powered test creation | Property-based testing, edge case detection | ✅ Pattern matching, Learning |
| **test-executor** | Multi-framework execution | Parallel processing, retry logic, reporting | - |
| **coverage-analyzer** | Real-time gap analysis | O(log n) algorithms, trend tracking | ✅ Learning, Pattern recommendations |
| **quality-gate** | Intelligent validation | ML-driven decisions, risk assessment | ✅ Flaky test metrics |
| **quality-analyzer** | Metrics analysis | ESLint, SonarQube, Lighthouse integration | - |
| **code-complexity** | Complexity analysis | Cyclomatic/cognitive metrics, refactoring recommendations | ✅ Educational agent |

</details>

<details>
<summary><b>Performance & Security (2 agents)</b></summary>

| Agent | Purpose | Key Features |
|-------|---------|-------------|
| **performance-tester** | Load & stress testing | k6, JMeter, Gatling, bottleneck detection |
| **security-scanner** | Vulnerability detection | SAST, DAST, dependency scanning |

</details>

<details>
<summary><b>Strategic Planning (3 agents)</b></summary>

| Agent | Purpose | Key Features |
|-------|---------|-------------|
| **requirements-validator** | Testability analysis | INVEST criteria, BDD generation |
| **production-intelligence** | Incident replay | RUM analysis, anomaly detection |
| **fleet-commander** | Hierarchical coordination | 50+ agent orchestration |

</details>

<details>
<summary><b>Advanced Testing (4 agents)</b></summary>

| Agent | Purpose | Key Features | Phase 2 Enhancements |
|-------|---------|-------------|---------------------|
| **regression-risk-analyzer** | Smart test selection | ML patterns, AST analysis | ✅ Pattern matching |
| **test-data-architect** | Realistic data generation | 10k+ records/sec, GDPR compliant | - |
| **api-contract-validator** | Breaking change detection | OpenAPI, GraphQL, gRPC | - |
| **flaky-test-hunter** | Stability analysis | Statistical detection, auto-fix | ✅ 100% accuracy ML detection |

</details>

<details>
<summary><b>Specialized (3 agents)</b></summary>

| Agent | Purpose | Key Features |
|-------|---------|-------------|
| **deployment-readiness** | Release validation | Multi-factor risk scoring |
| **visual-tester** | UI regression | AI-powered comparison |
| **chaos-engineer** | Resilience testing | Fault injection, blast radius |

</details>

<details>
<summary><b>General Purpose (1 agent)</b></summary>

| Agent | Purpose | Key Features |
|-------|---------|-------------|
| **base-template-generator** | Agent templates | General-purpose agent creation |

</details>

**Total: 29 Agents** (18 main agents + 11 TDD subagents)

### TDD Subagents (11 specialized)

<details>
<summary><b>Test-Driven Development Subagents</b></summary>

The test generator orchestrates a complete TDD workflow through specialized subagents:

| Subagent | Phase | Purpose | Key Features |
|----------|-------|---------|-------------|
| **qe-test-writer** | RED | Write failing tests | Behavior specification, boundary analysis, assertion definition |
| **qe-test-implementer** | GREEN | Make tests pass | Minimal implementation, test-driven coding, incremental development |
| **qe-test-refactorer** | REFACTOR | Improve code quality | Code refactoring, design patterns, quality improvement |
| **qe-code-reviewer** | REVIEW | Quality validation | Standards enforcement, linting, complexity checking, security |
| **qe-integration-tester** | INTEGRATION | Component testing | API testing, database testing, service integration |
| **qe-data-generator** | GENERATION | Test data creation | Realistic data generation, constraint satisfaction, edge cases |
| **qe-performance-validator** | VALIDATION | Performance checks | SLA validation, benchmark comparison, threshold enforcement |
| **qe-security-auditor** | AUDIT | Security validation | Vulnerability detection, compliance checking, threat modeling |
| **qe-flaky-investigator** | ANALYSIS | Flaky test detection | Pattern detection, timing analysis, stabilization fixes |
| **qe-coverage-gap-analyzer** | ANALYSIS | Coverage gaps | Risk scoring, gap detection, test recommendations |
| **qe-test-data-architect-sub** | GENERATION | High-volume data | Schema-aware generation, relationship preservation |

**Coordination Protocol:**
All subagents use a unified coordination protocol with cycle-based memory namespaces (`aqe/tdd/cycle-{id}/*`) ensuring tests written in RED are the same tests validated in GREEN and refactored in REFACTOR. See [Coordination Guide](docs/subagents/coordination-guide.md).

**Usage Example:**
```bash
claude "Use qe-test-generator to run the complete TDD workflow for src/services/payment.ts"
```

The test generator automatically delegates to subagents for a complete RED-GREEN-REFACTOR-REVIEW cycle.

</details>

---

## 📖 Documentation

### Getting Started
- [Quick Start Guide](docs/AQE-CLI.md) - Get started in 5 minutes
- [User Guide](docs/USER-GUIDE.md) - Comprehensive workflows and examples
- [MCP Integration](docs/guides/MCP-INTEGRATION.md) - Claude Code integration
- [Configuration Guide](docs/CONFIGURATION.md) - Complete configuration reference
- [Troubleshooting Guide](docs/TROUBLESHOOTING.md) - Common issues and solutions

### Feature Guides

**Phase 2 Features (v1.1.0)**
- [Learning System User Guide](docs/guides/LEARNING-SYSTEM-USER-GUIDE.md) - Q-learning and continuous improvement
- [Pattern Management User Guide](docs/guides/PATTERN-MANAGEMENT-USER-GUIDE.md) - Cross-project pattern sharing
- [ML Flaky Detection Guide](docs/guides/ML-FLAKY-DETECTION-USER-GUIDE.md) - 100% accurate flaky detection
- [Performance Improvement Guide](docs/guides/PERFORMANCE-IMPROVEMENT-USER-GUIDE.md) - A/B testing and optimization

**Phase 1 Features (v1.0.5)**
- [Multi-Model Router Guide](docs/guides/MULTI-MODEL-ROUTER.md) - Save 70% on AI costs
- [Streaming API Tutorial](docs/guides/STREAMING-API.md) - Real-time progress updates
- [Cost Optimization Best Practices](docs/guides/COST-OPTIMIZATION.md) - Maximize ROI

### Testing Guides
- [Test Generation](docs/guides/TEST-GENERATION.md) - AI-powered test creation
- [Coverage Analysis](docs/guides/COVERAGE-ANALYSIS.md) - O(log n) gap detection
- [Quality Gates](docs/guides/QUALITY-GATES.md) - Intelligent validation
- [Performance Testing](docs/guides/PERFORMANCE-TESTING.md) - Load and stress testing
- [Test Execution](docs/guides/TEST-EXECUTION.md) - Parallel orchestration

### Advanced Topics
- [API Reference](docs/API.md) - Complete API documentation
- [Agent Development](docs/AGENT-DEVELOPMENT.md) - Create custom agents
- [Agent Types Overview](docs/Agentic-QE-Fleet-Specification.md) - Complete agent reference
- [AQE Hooks Guide](docs/AQE-HOOKS-GUIDE.md) - Native coordination system
- [Best Practices](docs/AI%20%26%20Agentic%20Security%20Best%20Practices.md) - Security and quality

### Commands Reference
- [AQE Commands Overview](docs/QE-COMMANDS-INDEX.md) - All CLI commands
- [Command Specifications](docs/QE-SLASH-COMMANDS-SPECIFICATION.md) - Slash command reference
- [Hooks Architecture](docs/QE_HOOKS_ARCHITECTURE.md) - Coordination architecture

### Code Examples
- [Learning System Examples](docs/examples/LEARNING-SYSTEM-EXAMPLES.md) - Learning code examples
- [Pattern Examples](docs/examples/REASONING-BANK-EXAMPLES.md) - Pattern usage examples
- [Flaky Detection Examples](docs/examples/FLAKY-DETECTION-ML-EXAMPLES.md) - ML detection examples
- [Routing Examples](docs/examples/ROUTING-EXAMPLES.md) - Cost optimization examples

---

## 📊 Performance Benchmarks

| Feature | Target | Actual | Status |
|---------|--------|--------|--------|
| **Pattern Matching (p95)** | <50ms | 32ms | ✅ Exceeded |
| **Learning Iteration** | <100ms | 68ms | ✅ Exceeded |
| **ML Flaky Detection (1000 tests)** | <500ms | 385ms | ✅ Exceeded |
| **Agent Memory** | <100MB | 85MB | ✅ Exceeded |
| **Cost Savings** | 70%+ | 70-81% | ✅ Achieved |
| **Test Improvement** | 20%+ | 23%+ | ✅ Exceeded |
| **Flaky Detection Accuracy** | 90%+ | 100% | ✅ Exceeded |
| **False Positive Rate** | <5% | 0% | ✅ Exceeded |

### Core Performance
- **Test Generation**: 1000+ tests/minute
- **Parallel Execution**: 10,000+ concurrent tests
- **Coverage Analysis**: O(log n) complexity
- **Data Generation**: 10,000+ records/second
- **Agent Spawning**: <100ms per agent
- **Memory Efficient**: <2GB for typical projects

---

## 📝 What's New in v2.1.0

🚀 **Comprehensive QX Analysis & Skills Optimization** (2025-12-03)

This release delivers comprehensive QX (Quality Experience) analysis improvements, optimized skills format, and enhanced agent coordination.

### Key Features

- **Comprehensive QX Analysis** (PR #104 by @fndlalit): 23+ heuristics with detailed findings, domain-specific failure detection (e-commerce, SaaS, content/blog, forms), contextual page content extraction
- **38 QE Skills Optimized** (PR #102): Agent-focused format with `<default_to_action>` blocks, quick reference cards, 40-60% token reduction
- **Testability Scoring v2.1**: Optimized skill format, Fleet coordination hints, improved memory namespace organization
- **QX Partner Agent v2.1**: Enhanced capabilities for Rule of Three analysis, domain-specific detection, comprehensive report formatting

### Skills Optimization

All 38 QE skills now feature:
- Optimized frontmatter with `tokenEstimate`, `agents`, `implementation_status`, `optimization_version`
- `<default_to_action>` blocks for immediate actionable guidance
- Quick reference cards with tables and command examples
- Fleet coordination and memory namespace hints

### QX Analysis Improvements

- **23+ Heuristics**: Detailed findings, issues, and recommendations per heuristic
- **Domain Detection**: Automatic failure mode detection by site type
- **Contextual Extraction**: Real page content analysis (headings, navigation, buttons, forms, links)
- **Rule of Three**: Problem complexity assessment ensuring minimum 3 failure modes identified

**Upgrade**: `npm install agentic-qe@2.1.0`

---

## 📝 What's New in v1.9.3

📦 **NPM Package Fix** (2025-11-26)

This release fixes missing files in the npm package distribution that caused `aqe init` to fail.

### Key Fixes

- **Added missing `templates/` directory**: Includes `aqe.sh` wrapper script
- **Added missing `.claude/helpers/` directory**: Includes 6 helper scripts (checkpoint-manager.sh, github-safe.js, etc.)
- **Added missing `docs/reference/` directory**: Includes reference documentation (agents.md, skills.md, usage.md)

**Upgrade**: `npm install agentic-qe@1.9.3`

---

## 📝 What's New in v1.9.2

🐛 **Learning Persistence Fix** (2025-11-26)

This release fixes critical learning persistence issues (Issue #79) where learning data was not being saved to SQLite.

### Key Fixes

- **Database schema fixes**: Added missing columns to patterns, q_values, and learning_experiences tables
- **Memory persistence**: MemoryStoreHandler now actually persists to SQLite when `persist: true`
- **Database migrations**: Automatic migrations for existing databases

**Upgrade**: `npm install agentic-qe@1.9.2`

---

## 📝 What's New in v1.8.3

🔄 **Phase 4: TDD Subagent Coordination** (2025-01-19)

This release implements comprehensive TDD subagent coordination, solving the disconnected tests/code/refactor issue where RED-GREEN-REFACTOR cycle agents were producing inconsistent outputs.

### Key Improvements

- **TDD Coordination Protocol** - Memory-based coordination for consistent TDD cycles
  - ✅ Cycle-based memory namespace (`aqe/tdd/cycle-{cycleId}/*`)
  - ✅ File hash validation ensures test file integrity across phases
  - ✅ Handoff gates prevent premature phase transitions
  - ✅ Phase output interfaces for typed contracts

- **Runtime Enforcement** - TDDPhaseValidator class validates memory state
  - ✅ Validates memory keys exist before phase transitions
  - ✅ Enforces output schema compliance
  - ✅ Checks file hash integrity across RED→GREEN→REFACTOR
  - ✅ Coverage comparison warnings

- **New Subagents (3)** - Specialized quality engineering agents
  - ✅ `qe-flaky-investigator` - Detects flaky tests, analyzes root causes
  - ✅ `qe-coverage-gap-analyzer` - Identifies coverage gaps, risk-scores untested code
  - ✅ `qe-test-data-architect-sub` - High-volume test data generation

### Updated Subagents (8)
All existing subagents now include coordination protocol:
- `qe-test-writer`, `qe-test-implementer`, `qe-test-refactorer` (TDD phases)
- `qe-code-reviewer`, `qe-integration-tester`, `qe-performance-validator`
- `qe-security-auditor`, `qe-data-generator`

### Testing
- 22 integration tests for TDD coordination
- All tests passing

### Documentation
- Coordination guide at `docs/subagents/coordination-guide.md`

### Impact
✅ **Build Status**: Passing (0 errors)
✅ **TDD Coordination**: Fully operational
✅ **Subagents**: 11 total (3 new, 8 updated)
✅ **Integration Tests**: 22 passing
❌ **Breaking Changes**: None

**Upgrade**: `npm install agentic-qe@1.8.3`

**Previous Releases**: See [CHANGELOG.md](CHANGELOG.md) for complete version history.

[📖 View Full Changelog](CHANGELOG.md) | [🐛 Report Issues](https://github.com/proffesor-for-testing/agentic-qe/issues)

---

## 🚀 Development

### Setup

```bash
# Clone repository
git clone https://github.com/proffesor-for-testing/agentic-qe.git
cd agentic-qe

# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test
```

### Available Scripts

| Script | Description |
|--------|-------------|
| `npm run build` | Compile TypeScript to JavaScript |
| `npm run dev` | Development mode with hot reload |
| `npm test` | Run all test suites |
| `npm run test:unit` | Unit tests only |
| `npm run test:integration` | Integration tests |
| `npm run test:coverage` | Generate coverage report |
| `npm run lint` | ESLint code checking |
| `npm run lint:fix` | Auto-fix linting issues |
| `npm run typecheck` | TypeScript type checking |

### Project Structure

```
agentic-qe/
├── src/
│   ├── agents/          # Agent implementation classes
│   ├── core/            # Core fleet management
│   ├── learning/        # Phase 2: Learning system
│   ├── reasoning/       # Phase 2: Pattern bank
│   ├── cli/             # Command-line interface
│   ├── mcp/             # Model Context Protocol server
│   ├── types/           # TypeScript type definitions
│   └── utils/           # Shared utilities
├── tests/               # Comprehensive test suites
├── examples/            # Usage examples
├── docs/                # Documentation
├── .claude/             # Agent & command definitions
│   ├── agents/          # 19 main agent definitions
│   │   └── subagents/   # 11 TDD subagent definitions
│   ├── skills/          # 40 QE skill definitions
│   └── commands/        # 8 AQE slash commands
└── config/              # Configuration files
```

---

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details.

### Quick Contribution Guide

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass (`npm test`)
6. Commit your changes (`git commit -m 'feat: add amazing feature'`)
7. Push to your branch (`git push origin feature/amazing-feature`)
8. Open a Pull Request

### Development Guidelines

- Follow the existing code style
- Write comprehensive tests
- Update documentation
- Use conventional commits
- Ensure TypeScript types are accurate

---

## 📞 Support

- **Documentation**: [docs/](docs/)
- **Issues**: [GitHub Issues](https://github.com/proffesor-for-testing/agentic-qe/issues)
- **Discussions**: [GitHub Discussions](https://github.com/proffesor-for-testing/agentic-qe/discussions)
- **Email**: support@agentic-qe.com

---

## 🗺️ Roadmap

### Current (v1.5)
- ✅ Learning System with Q-learning
- ✅ Pattern Bank with cross-project sharing
- ✅ ML Flaky Detection (100% accuracy)
- ✅ Continuous Improvement Loop
- ✅ 18 specialized agents + 11 TDD subagents
- ✅ Complete TDD workflow automation (RED/GREEN/REFACTOR/REVIEW)
- ✅ Multi-framework test execution
- ✅ Real-time coverage analysis
- ✅ MCP integration
- ✅ Multi-model router (70-81% cost savings)
- ✅ 40 QE skills library
- ✅ Modular init system for streamlined project setup

### Planned (v1.4)
- 🔄 Web dashboard for visualization
- 🔄 GraphQL API
- 🔄 CI/CD integrations (GitHub Actions, GitLab CI)
- 🔄 Enhanced pattern adaptation across frameworks
- 🔄 Real-time collaboration features

### Future (v2.0)
- 📋 Natural language test generation
- 📋 Self-healing test suites
- 📋 Multi-language support (Python, Java, Go)
- 📋 Advanced analytics and insights
- 📋 Cloud deployment support

---

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 👥 Contributors

Thanks to all the amazing people who have contributed to Agentic QE Fleet!

<!-- ALL-CONTRIBUTORS-LIST:START -->
| <img src="https://github.com/proffesor-for-testing.png" width="60" style="border-radius:50%"/><br/>**[@proffesor-for-testing](https://github.com/proffesor-for-testing)**<br/>Project Lead | <img src="https://github.com/fndlalit.png" width="60" style="border-radius:50%"/><br/>**[@fndlalit](https://github.com/fndlalit)**<br/>QX Partner, Testability | <img src="https://github.com/shaal.png" width="60" style="border-radius:50%"/><br/>**[@shaal](https://github.com/shaal)**<br/>Core Development | <img src="https://github.com/mondweep.png" width="60" style="border-radius:50%"/><br/>**[@mondweep](https://github.com/mondweep)**<br/>Architecture |
|:---:|:---:|:---:|:---:|
<!-- ALL-CONTRIBUTORS-LIST:END -->

[View all contributors](CONTRIBUTORS.md) | [Become a contributor](CONTRIBUTING.md)

---

## 💖 Support the Project

If you find Agentic QE Fleet valuable, consider supporting its development:

| | Monthly | Annual (Save $10) |
|---|:---:|:---:|
| **Price** | $5/month | $50/year |
| **Benefits** | Sponsor recognition, Priority support | All monthly + Featured in README, Roadmap input |
| **Subscribe** | [**Monthly**](https://www.paypal.com/webapps/billing/plans/subscribe?plan_id=P-88G03706DU8150205NEYZZAY) | [**Annual**](https://www.paypal.com/webapps/billing/plans/subscribe?plan_id=P-39189175UE6623540NEYZ2CI) |

[View sponsorship details](FUNDING.md)

---

## 🙏 Acknowledgments

- Built with TypeScript, Node.js, and better-sqlite3
- Inspired by autonomous agent architectures and swarm intelligence
- Integrates with Jest, Cypress, Playwright, k6, SonarQube, and more
- Compatible with Claude Code via Model Context Protocol (MCP)

---

<div align="center">

**Made with ❤️ by the Agentic QE Team**

[⭐ Star us on GitHub](https://github.com/proffesor-for-testing/agentic-qe) | [💖 Sponsor](FUNDING.md) | [👥 Contributors](CONTRIBUTORS.md)

</div>
