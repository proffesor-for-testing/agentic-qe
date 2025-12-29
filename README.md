# Agentic Quality Engineering Fleet


<div align="center">

[![npm version](https://img.shields.io/npm/v/agentic-qe.svg)](https://www.npmjs.com/package/agentic-qe)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
<img alt="NPM Downloads" src="https://img.shields.io/npm/dw/agentic-qe">
[![Run in Smithery](https://smithery.ai/badge/skills/proffesor-for-testing)](https://smithery.ai/skills?ns=proffesor-for-testing&utm_source=github&utm_medium=badge)


**Version 2.7.1** | [Changelog](CHANGELOG.md) | [Contributors](CONTRIBUTORS.md) | [Issues](https://github.com/proffesor-for-testing/agentic-qe/issues) | [Discussions](https://github.com/proffesor-for-testing/agentic-qe/discussions)

> AI-powered test automation that learns from every task, switches between 300+ AI models on-the-fly, scores code testability, visualizes agent activity in real-time, and improves autonomously overnight — with built-in safety guardrails and full observability.

🎨 **Real-Time Visualization** | 📊 **Testability Scoring** | 🧠 **QE Agent Learning** | 🚀 **QUIC Transport** | 📋 **Constitution System** | 📚 **46 QE Skills** | 🎯 **Flaky Detection** | 💰 **Multi-Model Router** | 🔄 **n8n Workflow Testing**

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
- ✅ **Real-time Visualization**: Dashboards, interactive graphs, WebSocket streaming
- ✅ **Observability Stack**: OpenTelemetry, Event Store, Constitution System
- ✅ **HybridRouter**: Intelligent LLM routing with 70-81% cost savings
- ✅ **Self-Learning System**: Agents improve with every task (20% target)
- ✅ **Pattern Bank**: Cross-project pattern reuse (85%+ matching)
- ✅ **ML Flaky Detection**: 90%+ accuracy with root cause analysis
- ✅ **21 QE Agents**: Including Code Intelligence (80% token reduction)
- ✅ **15 n8n Agents**: Workflow testing by [@fndlalit](https://github.com/fndlalit)
- ✅ **11 TDD Subagents**: RED/GREEN/REFACTOR phases
- ✅ **46 QE Skills**: Including **testability-scoring** by [@fndlalit](https://github.com/fndlalit)
- ✅ **8 Slash Commands**: Quick access to common workflows

**Optional Configuration** (`.env`):
```bash
# Enable advanced features (see .env.example)
LLM_MODE=hybrid              # Cost-optimized routing
AQE_RUVECTOR_ENABLED=true    # Self-learning with PostgreSQL
```

---

## 🎯 Why AQE?

| Problem | AQE Solution |
|---------|--------------|
| **Writing comprehensive tests is tedious and time-consuming** | AI agents generate tests automatically with pattern reuse across projects |
| **Test suites become slow and expensive at scale** | Sublinear O(log n) algorithms for coverage analysis and intelligent test selection |
| **Flaky tests waste developer time debugging false failures** | ML-powered detection (90%+ accuracy) with root cause analysis and fix recommendations |
| **AI testing tools are expensive** | Multi-model routing cuts costs by up to 70-81% by matching task complexity to model |
| **No memory between test runs—every analysis starts from scratch** | Self-learning system remembers patterns, strategies, and what works for your codebase |
| **Agents waste tokens reading irrelevant code** | Code Intelligence provides 80% token reduction with semantic search and knowledge graphs |
| **Tools don't understand your testing frameworks** | Works with Jest, Cypress, Playwright, Vitest, Mocha, Jasmine, AVA |

---

## ✨ Features

### 🧠 Self-Learning Agents That Get Smarter

Unlike traditional testing tools that start from scratch every run, **AQE agents build institutional knowledge** for your codebase:

| What Gets Learned | Benefit |
|-------------------|---------|
| **Test patterns** that work for your framework | 85%+ pattern reuse across projects |
| **Optimal strategies** for your codebase structure | Faster, more relevant test generation |
| **Failure patterns** and how to prevent them | Proactive defect prevention |
| **Cost-effective routing** decisions | Automatic budget optimization |

**4 Reinforcement Learning Algorithms**: Q-Learning (default), SARSA, Actor-Critic (A2C), PPO

```bash
# Check what your agents have learned
aqe learn status --agent qe-test-generator
aqe patterns list --framework jest
```

---

### 💰 70-81% Cost Savings with Intelligent Routing

**HybridRouter** automatically matches task complexity to the right model:

| Task Type | Model Selected | Cost |
|-----------|----------------|------|
| Simple (formatting, syntax) | Claude Haiku / GPT-3.5 | $0.25/M |
| Moderate (unit tests, refactoring) | Claude Sonnet / GPT-4 Turbo | $3/M |
| Complex (architecture, security) | Claude Opus 4.5 / GPT-5 | $15/M |
| Reasoning-heavy | DeepSeek R1 / o1-preview | Varies |

**25+ December 2025 models** including Claude Opus 4.5, DeepSeek R1 (671B), GPT-5, Gemini 2.5 Pro

---

### 🤖 48 Specialized QE Agents

| Category | Agents | Highlights |
|----------|--------|------------|
| **Core QE** | 21 agents | Test generation, coverage, security, performance, accessibility |
| **TDD Workflow** | 11 subagents | RED/GREEN/REFACTOR phases with coordination |
| **n8n Workflow Testing** | 15 agents | Chaos, compliance, security, BDD scenarios |
| **Base** | 1 template | Create custom agents |

**Zero external dependencies** - Native hooks system runs 100-500x faster than external coordination

---

### 🎯 ML-Powered Flaky Test Detection

**90%+ accuracy** with automated root cause analysis:

- Statistical pattern detection across test runs
- Timing analysis and race condition identification
- **Auto-fix recommendations** with code suggestions
- Integration with CI/CD for continuous monitoring

```bash
claude "Use qe-flaky-test-hunter to analyze the last 100 test runs"
```

---

### 🔍 Code Intelligence (80% Token Reduction)

Stop wasting tokens on irrelevant code. **Semantic search + knowledge graphs** deliver only what matters:

- **Tree-sitter parsing** for TypeScript, Python, Go, Rust, JavaScript
- **Hybrid search**: BM25 + vector similarity with <10ms latency
- **RAG context building** for LLM queries
- **Mermaid visualization** of code relationships

```bash
aqe kg index src/          # Index your codebase
aqe kg search "auth flow"  # Semantic search
```

---

### 📊 Real-Time Visualization

**See your agents work** with live dashboards:

- **MindMap**: 1000+ nodes, <500ms render, WebSocket updates
- **Quality Radar**: 7-dimension chart (coverage, security, performance)
- **Timeline**: Virtual scrolling for 1000+ events
- **Grafana**: Executive, Developer, and QA dashboards

**Performance**: 185 events/sec throughput, <1ms query latency

---

### 🎓 46 World-Class QE Skills

**95%+ coverage of modern QE practices** - agents automatically apply relevant skills:

<details>
<summary><b>View All 46 Skills</b></summary>

**Core Testing & Methodologies**
- agentic-quality-engineering, holistic-testing-pact, context-driven-testing
- tdd-london-chicago, xp-practices, risk-based-testing, test-automation-strategy

**Specialized Testing**
- accessibility-testing, mobile-testing, database-testing, contract-testing
- chaos-engineering-resilience, visual-testing-advanced, compliance-testing

**Strategic & Communication**
- six-thinking-hats, brutal-honesty-review, sherlock-review
- cicd-pipeline-qe-orchestrator, bug-reporting-excellence

**n8n Workflow Testing** (contributed by [@fndlalit](https://github.com/fndlalit))
- n8n-workflow-testing, n8n-expression-testing, n8n-security-testing

**Unique Skills**
- **testability-scoring** - Score code testability before writing tests
- **qx-partner** - QA + UX collaboration for quality experience

</details>

---

### 📦 Multi-Framework Support

Works with your existing tools:

| Category | Supported |
|----------|-----------|
| **Unit Testing** | Jest, Mocha, Vitest, Jasmine, AVA |
| **E2E Testing** | Cypress, Playwright |
| **Performance** | k6, JMeter, Gatling |
| **Code Quality** | ESLint, SonarQube, Lighthouse |

**Parallel execution**: 10,000+ concurrent tests with intelligent orchestration

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
5. qe-flaky-test-hunter - detect flaky tests with ML-powered analysis
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

**All 91 MCP Tools Available:**
- Fleet Management (9 tools): init, spawn, status, coordinate, orchestrate
- Test Generation (2 tools): generate enhanced, execute
- Test Execution (3 tools): execute, parallel, stream
- Coverage Analysis (4 tools): analyze with risk scoring, detect gaps ML, trends, recommendations
- Quality Gates (3 tools): execute, validate metrics, generate report
- Flaky Test Detection (2 tools): detect statistical, analyze patterns
- Performance Testing (3 tools): benchmark, analyze bottlenecks, generate a report
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
- Production Monitoring (2 tools): incident replay, RUM analysis
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
| **flaky-test-hunter** | Stability analysis | Statistical detection, auto-fix | ✅ 90%+ accuracy ML detection |

</details>

<details>
<summary><b>Specialized (4 agents)</b></summary>

| Agent | Purpose | Key Features |
|-------|---------|-------------|
| **deployment-readiness** | Release validation | Multi-factor risk scoring |
| **visual-tester** | UI regression | AI-powered comparison |
| **chaos-engineer** | Resilience testing | Fault injection, blast radius |
| **a11y-ally** | Accessibility testing | WCAG 2.2, AI video analysis, EU compliance |

</details>

<details>
<summary><b>General Purpose (1 agent)</b></summary>

| Agent | Purpose | Key Features |
|-------|---------|-------------|
| **base-template-generator** | Agent templates | General-purpose agent creation |

</details>

**Total: 31 Agents** (20 main agents + 11 TDD subagents)

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

## 🤖 LLM Provider Configuration

### Multi-Provider Support (v2.6+)

AQE supports multiple LLM providers for maximum flexibility and cost optimization:

| Provider | Type | Cost | Setup Time | Best For |
|----------|------|------|------------|----------|
| **Ollama** | Local | FREE | 10 min | Privacy, offline, no budget |
| **OpenRouter** | Cloud | Paid/Free | 2 min | 300+ models, flexibility |
| **Groq** | Cloud | FREE | 1 min | High-speed, 14,400 req/day |
| **GitHub Models** | Cloud | FREE | 0 min | Codespaces, auto-detected |
| **Claude API** | Cloud | Paid | 2 min | Highest quality |
| **Google AI** | Cloud | FREE | 2 min | Gemini models, 1,500 req/day |

### Quick Setup

#### Free Cloud (No Hardware Required)

```bash
# 1. Get free API key from https://console.groq.com/
export GROQ_API_KEY="gsk_..."

# 2. Install AQE
npm install -g agentic-qe
aqe init

# 3. Start using
claude "Use qe-test-generator to create tests for UserService"
```

#### Local Ollama (Private, Offline)

```bash
# 1. Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# 2. Download model
ollama pull qwen3-coder:30b

# 3. Start server
ollama serve

# 4. Install AQE
npm install -g agentic-qe
aqe init
```

#### Multi-Provider (Recommended)

```typescript
import { LLMProviderFactory } from 'agentic-qe';

const factory = new LLMProviderFactory({
  defaultProvider: 'auto',  // Auto-detect best provider
  enableFallback: true,      // Automatic failover

  // Free tier cloud (primary)
  openrouter: {
    apiKey: process.env.OPENROUTER_API_KEY,
    defaultModel: 'mistralai/devstral-2512:free'  // FREE 123B model
  },

  // Local backup (unlimited)
  ruvllm: {
    defaultModel: 'qwen3-coder:30b'
  }
});

await factory.initialize();
```

### Model Recommendations

**FREE Tier**:
- **Best Quality**: `mistralai/devstral-2512:free` (123B, OpenRouter)
- **High Speed**: `llama-3.3-70b-versatile` (Groq, 14,400 req/day)
- **Local Privacy**: `qwen3-coder:30b` (Ollama, unlimited)

**Paid Tier** (Cost-Effective):
- **Cheapest**: `mistralai/devstral-small-2505` ($0.06/$0.12 per M)
- **Balanced**: `qwen/qwen-2.5-coder-32b-instruct` ($0.18/$0.18 per M)
- **Premium**: `claude-sonnet-4` ($3/$15 per M)

### Provider Health Monitoring (v2.6.5+)

Monitor and manage LLM providers with built-in health checks and automatic failover:

```bash
# View provider health dashboard
aqe providers status

# Detailed metrics with circuit breaker states
aqe providers status --detailed

# Test specific provider connectivity
aqe providers test groq

# Check quota usage
aqe providers quota
```

**Features:**
- **Circuit Breaker Pattern**: Automatic detection of unhealthy providers (closed → half-open → open)
- **Health-Aware Routing**: Requests automatically route to healthy providers
- **Quota Management**: Per-provider rate limit tracking with alerts
- **Fallback Chains**: Graceful degradation when primary provider fails

### Documentation

- **[LLM Providers Guide](docs/guides/llm-providers-guide.md)** - Complete provider overview
- **[Ollama Setup Guide](docs/guides/ollama-setup.md)** - Local inference setup
- **[Free Tier Guide](docs/guides/free-tier-guide.md)** - Zero-cost deployment
- **[Config Schema](docs/reference/provider-config-schema.md)** - Full configuration reference

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

## 📊 Performance

For detailed performance benchmarks and metrics, see [docs/PERFORMANCE.md](docs/PERFORMANCE.md).

### Core Performance
- **Test Generation**: Pattern-based with cross-project reuse
- **Parallel Execution**: Multi-framework concurrent tests
- **Coverage Analysis**: O(log n) sublinear algorithms
- **Data Generation**: 10,000+ records/second with GDPR compliance
- **Agent Spawning**: <100ms per agent
- **Flaky Detection**: 90%+ accuracy with ML-powered root cause analysis

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
