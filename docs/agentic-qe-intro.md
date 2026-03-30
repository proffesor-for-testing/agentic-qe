# Agentic QE (AQE) — Technical Introduction

## What Is Agentic QE?

Agentic QE is an AI-powered quality engineering platform that runs inside coding tools like **Claude Code**, **VS Code** (via Claude extension), or **Cursor**. Instead of a single test tool, it provides a **fleet of 53 specialized QE agents** — each expert in a narrow discipline — coordinated by a Queen agent. The system learns from every interaction through a ReasoningBank with 150K+ stored patterns, so it improves over time for your specific codebase.

It ships as an npm package (`agentic-qe`) and integrates via two channels: a **CLI** and a **Model Context Protocol (MCP) server** exposing 60+ tools.

---

## Architecture

### Five Layers

```
┌─────────────────────────────────────────────────┐
│                  Governance                      │
│  Constitutional rules, witness chains, trust     │
├─────────────────────────────────────────────────┤
│                  Coordination                    │
│  Queen coordinator, task executor, workflows,    │
│  consensus (Raft/CRDT), circuit breakers         │
├─────────────────────────────────────────────────┤
│                   Routing                        │
│  Neural "Tiny Dancer" router, task classifier,   │
│  3-tier model selection (WASM → Haiku → Opus)    │
├─────────────────────────────────────────────────┤
│                   Learning                       │
│  ReasoningBank, experience capture, pattern      │
│  lifecycle, metrics tracker, SONA dream engine   │
├─────────────────────────────────────────────────┤
│                    Kernel                        │
│  Microkernel, plugin registry, event bus,        │
│  HNSW vector memory, SQLite persistence          │
└─────────────────────────────────────────────────┘
```

**Kernel** — Microkernel with a plugin system. Every domain registers as a plugin. Persistence is unified through SQLite (`better-sqlite3`). Vector similarity search uses HNSW indexing (Hierarchical Navigable Small World graphs) for sub-millisecond pattern lookup across 150K+ records.

**Learning** — Every agent interaction is captured: what was generated, what patterns matched, what the outcome was. The ReasoningBank stores these as semantic embeddings. A pattern lifecycle manager promotes effective patterns and demotes bad ones. There's even a "dream engine" (SONA) that consolidates knowledge offline.

**Routing** — A neural router called "Tiny Dancer" classifies incoming tasks by complexity and routes them to the cheapest sufficient model tier:
- **Tier 1**: WASM agent booster — <1ms, $0 (simple transforms like `var→const`)
- **Tier 2**: Haiku — ~500ms, $0.0002 (straightforward tasks)
- **Tier 3**: Sonnet/Opus — 2-5s, $0.003-0.015 (complex reasoning, architecture)

**Coordination** — The Queen Coordinator is the central orchestrator. It decomposes tasks, assigns them to domain-specific agents, manages workflows, and handles fault tolerance through circuit breakers and Byzantine consensus (Raft). Work stealing balances load across agents.

**Governance** — Constitutional enforcement ensures agents stay within behavioral boundaries. A witness chain provides immutable audit trails. Trust scores accumulate per agent. Coherence validation checks mathematical consistency of outputs.

### 13 Bounded Contexts (Domains)

The system follows Domain-Driven Design. Each domain is a self-contained plugin with its own coordinator, typed interfaces, and task contracts:

| Domain | What It Handles |
|--------|----------------|
| **test-generation** | Unit, integration, property-based, BDD test creation |
| **test-execution** | Running tests with prioritization, parallelism, retry logic |
| **coverage-analysis** | Gap detection, risk-weighted prioritization, O(log n) sublinear analysis |
| **quality-assessment** | Quality gates, code metrics, deployment readiness |
| **defect-intelligence** | Defect prediction, root cause analysis, pattern recognition |
| **requirements-validation** | Acceptance criteria validation, BDD scenario verification |
| **code-intelligence** | AST analysis, dependency mapping, complexity metrics |
| **security-compliance** | SAST scanning, vulnerability detection, OWASP compliance |
| **contract-testing** | API contract validation, consumer-driven testing |
| **visual-accessibility** | WCAG compliance, visual regression, CNN-based image comparison |
| **chaos-resilience** | Fault injection, resilience testing, recovery validation |
| **learning-optimization** | Meta-learning, pattern optimization, cross-project knowledge transfer |
| **enterprise-integration** | SAP (RFC, IDoc, OData), n8n workflows, middleware connectors |

---

## How Users Interact with AQE

AQE is designed to live inside your coding environment. There are three main interaction modes:

### 1. Skills (Slash Commands) — The Primary Way

Skills are slash commands invoked directly in Claude Code or any tool that supports Claude's skill system. This is how most users interact with AQE day-to-day.

**Example session in Claude Code:**

```
> /exploratory-testing-advanced

  User: "Explore the checkout flow for edge cases"

  → AQE creates a charter with mission, scope, time-box
  → Applies SFDIPOT heuristics across the checkout code
  → Uses test tours (Bad Neighborhood, Historical)
  → Documents findings with evidence
  → Stores patterns in ReasoningBank for next time
```

```
> /tdd-london-chicago

  User: "Implement the PaymentService using London school TDD"

  → Identifies external dependencies (payment gateway, DB)
  → Writes failing tests first with mocked dependencies
  → Guides through Red → Green → Refactor cycle
  → Generates interaction-verification tests
```

```
> /sfdipot-product-factors

  User: "Analyze this user story for test ideas"
  [pastes user story]

  → Runs James Bach's HTSM analysis
  → Generates prioritized test ideas across all 7 SFDIPOT dimensions
  → Rewrites vague test ideas into concrete, actionable ones
  → Outputs ranked test strategy
```

**Selected QE skills available (74 total):**

| Category | Skills |
|----------|--------|
| **Test Design** | `/test-design-techniques`, `/tdd-london-chicago`, `/mutation-testing`, `/property-based testing via agents` |
| **Strategy** | `/risk-based-testing`, `/sfdipot-product-factors`, `/holistic-testing-pact`, `/six-thinking-hats` |
| **Exploration** | `/exploratory-testing-advanced`, `/context-driven-testing`, `/sherlock-review` |
| **Automation** | `/test-automation-strategy`, `/regression-testing`, `/api-testing-patterns` |
| **Specialized** | `/security-testing`, `/accessibility-testing`, `/performance-testing`, `/chaos-engineering-resilience` |
| **CI/CD** | `/cicd-pipeline-qe-orchestrator`, `/shift-left-testing`, `/shift-right-testing` |
| **n8n Workflows** | `/n8n-workflow-testing-fundamentals`, `/n8n-integration-testing-patterns`, `/n8n-trigger-testing-strategies`, `/n8n-expression-testing`, `/n8n-security-testing` |
| **Enterprise** | `/enterprise-integration-testing`, `/wms-testing-patterns`, `/middleware-testing-patterns` |
| **Quality** | `/quality-metrics`, `/bug-reporting-excellence`, `/code-review-quality`, `/testability-scoring` |
| **Domain** | `/contract-testing`, `/database-testing`, `/compliance-testing`, `/localization-testing` |
| **Review** | `/brutal-honesty-review`, `/pr-review`, `/pentest-validation`, `/validation-pipeline` |

### 2. Agents (Subagents) — For Specialized Deep Work

Agents are spawned automatically by skills or the Queen coordinator, but users can also invoke them directly. Each agent is a specialized AI persona with domain knowledge, tools access, and learned patterns.

**In Claude Code, agents are spawned as subagents:**

```
> "Analyze my test suite for flaky tests"

  → Claude Code spawns qe-flaky-hunter agent
  → Agent analyzes test history, timing patterns, shared state issues
  → Reports flaky tests with root causes and fix recommendations
  → Stores findings in ReasoningBank
```

```
> "I need a security audit of the auth module"

  → Queen coordinator spawns qe-security-scanner + qe-security-auditor
  → Parallel SAST scan + OWASP compliance check
  → Combined report with severity-ranked findings
```

**The 65 QE agents, organized by function:**

| Function | Agents |
|----------|--------|
| **Test Creation** | `qe-test-architect`, `qe-bdd-generator`, `qe-tdd-specialist`, `qe-property-tester`, `qe-test-idea-rewriter` |
| **Test Execution** | `qe-parallel-executor`, `qe-retry-handler`, `qe-flaky-hunter`, `qe-load-tester`, `qe-performance-tester` |
| **Coverage** | `qe-coverage-specialist`, `qe-gap-detector`, `qe-mutation-tester` |
| **Quality** | `qe-quality-gate`, `qe-code-complexity`, `qe-deployment-advisor`, `qe-risk-assessor` |
| **Defects** | `qe-defect-predictor`, `qe-root-cause-analyzer`, `qe-regression-analyzer`, `qe-impact-analyzer` |
| **Requirements** | `qe-requirements-validator`, `qe-product-factors-assessor`, `qe-quality-criteria-recommender` |
| **Code Analysis** | `qe-code-intelligence`, `qe-dependency-mapper`, `qe-kg-builder` |
| **Security** | `qe-security-scanner`, `qe-security-auditor`, `qe-pentest-validator`, `qe-sod-analyzer` |
| **Contracts & APIs** | `qe-contract-validator`, `qe-graphql-tester`, `qe-soap-tester`, `qe-odata-contract-tester` |
| **Visual & A11y** | `qe-visual-tester`, `qe-responsive-tester`, `qe-accessibility-auditor` |
| **Resilience** | `qe-chaos-engineer`, `qe-middleware-validator`, `qe-message-broker-tester` |
| **Learning** | `qe-learning-coordinator`, `qe-pattern-learner`, `qe-metrics-optimizer`, `qe-transfer-specialist` |
| **n8n Workflow Testing** | `n8n-workflow-executor`, `n8n-node-validator`, `n8n-trigger-test`, `n8n-integration-test`, `n8n-performance-tester`, `n8n-security-auditor`, `n8n-expression-validator`, `n8n-monitoring-validator`, `n8n-compliance-validator`, `n8n-chaos-tester`, `n8n-version-comparator`, `n8n-ci-orchestrator` |
| **Enterprise** | `qe-sap-idoc-tester`, `qe-sap-rfc-tester`, `qe-integration-tester`, `qe-integration-architect` |
| **Meta** | `qe-queen-coordinator`, `qe-fleet-commander`, `qe-devils-advocate`, `qe-qx-partner` |

### 3. CLI — For Automation and CI/CD

The CLI (`aqe`) is used for scripting, CI pipelines, and direct terminal use.

#### `aqe init` — Project Initialization

```bash
aqe init                        # Interactive setup
aqe init --auto                 # Auto-configure without prompts
aqe init --upgrade              # Upgrade existing installation (overwrites skills, agents)
aqe init --minimal              # Minimal install (no skills, patterns, or workers)
aqe init --skip-patterns        # Skip loading pre-trained patterns

# Platform-specific provisioning:
aqe init --with-cursor          # Cursor MCP config and rules
aqe init --with-windsurf        # Windsurf MCP config and rules
aqe init --with-copilot         # GitHub Copilot MCP config and instructions
aqe init --with-cline           # Cline MCP config and custom QE mode
aqe init --with-roocode         # Roo Code MCP config and custom QE mode
aqe init --with-kilocode        # Kilo Code MCP config and custom QE mode
aqe init --with-codex           # OpenAI Codex CLI MCP config and AGENTS.md
aqe init --with-kiro            # AWS Kiro IDE integration (agents, skills, hooks, steering)
aqe init --with-opencode        # OpenCode agent/skill provisioning
aqe init --with-continuedev     # Continue.dev MCP config and rules
aqe init --with-n8n             # n8n workflow testing platform
aqe init --with-all-platforms   # All of the above at once
aqe init --with-claude-flow     # Force Claude Flow integration
aqe init --no-governance        # Skip governance configuration

# Subcommands:
aqe init status                 # Check AQE installation status
aqe init reset [--all] [--confirm]  # Reset config (--all includes data)
```

#### Core Commands

```bash
# Test generation and execution
aqe test generate src/           # Generate tests (unit by default)
aqe test generate src/ -t integration -f vitest  # Integration tests with Vitest
aqe test execute tests/          # Execute tests with parallel + retry
aqe test schedule . --git-ref HEAD~3  # Git-aware test scheduling
aqe test load --agents 10 --profile heavy --duration 60000  # Load testing

# Coverage analysis
aqe coverage src/                # Analyze coverage
aqe coverage src/ --risk --gaps --threshold 80  # With risk scoring + gap detection
aqe coverage --wizard            # Interactive coverage wizard
aqe coverage --ghost             # Ghost intent coverage (detect untested behaviors)
aqe coverage gaps src/file.ts    # Enumerate unhandled branches in a file
aqe coverage gaps src/file.ts --mechanical  # Exhaustive branch enumeration

# Security scanning
aqe security --sast -t src/      # Static analysis
aqe security --dast              # Dynamic analysis
aqe security --compliance gdpr,hipaa,soc2  # Compliance checks
aqe security --url-validate https://example.com  # URL + PII exposure validation

# Quality gates
aqe quality --gate               # Evaluate quality gate (pass/fail with exit codes)

# Code intelligence
aqe code index src/                  # Index codebase into knowledge graph
aqe code index src/ --incremental    # Incremental index (changed files only)
aqe code index . --git-since HEAD~5  # Index files changed since a git ref
aqe code search "authentication"     # Semantic code search
aqe code impact src/changed.ts       # Impact analysis for changed files
aqe code deps src/module.ts          # Dependency mapping
aqe code complexity src/             # Complexity metrics and hotspots

# Fleet management
aqe fleet init --wizard          # Interactive fleet wizard
aqe fleet init -t hierarchical-mesh -m 15 --memory hybrid
aqe fleet spawn -d test-generation,coverage-analysis -c 2
aqe fleet run test --target src/ --parallel 4
aqe fleet run analyze --target src/
aqe fleet run scan --target src/
aqe fleet status [--watch]       # Live fleet monitoring
```

#### Advanced Commands

```bash
# Learning system
aqe learning stats               # Pattern counts, domain distribution
aqe learning consolidate         # Promote/demote patterns by effectiveness
aqe learning export patterns.gz  # Export learned patterns for sharing
aqe learning import patterns.gz  # Import patterns from another project

# LLM routing
aqe llm providers                # List available LLM providers and status
aqe llm models --provider anthropic  # List models for a provider
aqe llm route "generate security tests"  # Test routing decision
aqe llm cost claude-sonnet --tokens 10000  # Estimate cost
aqe llm health                   # Provider health check

# Evaluation
aqe eval run --skill tdd --model sonnet  # Evaluate a skill
aqe eval run-all --skills-tier 2 --models "haiku,sonnet" --parallel
aqe eval report --skill tdd --format markdown

# CI/CD pipeline orchestration
aqe ci run                       # Execute pipeline from .aqe-ci.yml
aqe ci run --format json -o results.json  # JSON output for CI

# Proof of Quality
aqe prove                        # Generate SHA-256 quality attestation
aqe prove --format json -o proof.json

# Audit trail
aqe audit verify                 # Verify witness chain integrity

# Token usage tracking
aqe token-usage --period 24h --by-agent --recommendations

# Validation
aqe validate report results/     # Aggregate validation results
aqe validate regression --baseline baseline.json

# Platform management
aqe platform list                # List supported coding platforms
aqe platform setup cursor        # Set up a specific platform
aqe platform verify cursor       # Verify platform config

# Hooks (self-learning)
aqe hooks stats                  # Hook execution statistics
aqe hooks route --task "generate tests"  # Test hook routing
```

All commands support `--format json|markdown` and `--output <file>` for CI/CD integration. Exit codes follow conventions: 0 = pass, 1 = fail, 2 = warning.

### 4. MCP Server — For Tool-Based Integration

AQE exposes 60+ tools via the Model Context Protocol. Any AI coding tool that supports MCP can call these tools programmatically.

**Supported MCP-compatible platforms** (set up with `aqe init --with-<platform>` or `aqe platform setup <platform>`):

| Platform | What Gets Provisioned |
|----------|----------------------|
| **Claude Code** | MCP server config, CLAUDE.md with QE instructions |
| **Cursor** | `.cursor/mcp.json`, `.cursorrules` with QE rules |
| **Windsurf** | MCP config, `.windsurfrules` |
| **GitHub Copilot** | MCP config, Copilot instructions file |
| **Cline** | MCP config, custom QE mode definition |
| **Roo Code** | MCP config, custom QE mode |
| **Kilo Code** | MCP config, custom QE mode |
| **OpenAI Codex CLI** | MCP config, `AGENTS.md` |
| **AWS Kiro** | Agents, skills, hooks, steering rules |
| **OpenCode** | Agent/skill provisioning |
| **Continue.dev** | MCP config, rules |

```bash
# Claude Code setup
claude mcp add agentic-qe -- npx agentic-qe mcp

# Or auto-provision for any platform
aqe init --with-cursor
aqe init --with-all-platforms
```

Once added, the AI assistant can call tools like:
- `mcp__agentic-qe__generate_tests` — generate tests for given code
- `mcp__agentic-qe__analyze_coverage` — find coverage gaps
- `mcp__agentic-qe__security_scan` — run security analysis
- `mcp__agentic-qe__fleet_init` — spin up the agent fleet
- `mcp__agentic-qe__memory_query` — search learned patterns

The MCP path is how the Queen coordinator actually orchestrates agents behind the scenes — it calls MCP tools to spawn agents, query memory, and coordinate work.

---

## Folder Structure

```
agentic-qe/
├── src/
│   ├── kernel/                 # Microkernel: plugin registry, event bus, HNSW memory
│   ├── coordination/           # Queen coordinator, task executor, workflows, consensus
│   ├── learning/               # ReasoningBank, experience capture, pattern lifecycle
│   ├── routing/                # Neural Tiny Dancer router, task classifier
│   ├── governance/             # Constitutional enforcement, witness chain, compliance
│   ├── domains/                # 13 bounded contexts
│   │   ├── test-generation/
│   │   ├── test-execution/
│   │   ├── coverage-analysis/
│   │   ├── quality-assessment/
│   │   ├── defect-intelligence/
│   │   ├── requirements-validation/
│   │   ├── code-intelligence/
│   │   ├── security-compliance/
│   │   ├── contract-testing/
│   │   ├── visual-accessibility/
│   │   ├── chaos-resilience/
│   │   ├── learning-optimization/
│   │   └── enterprise-integration/
│   ├── integrations/           # External systems
│   │   ├── ruvector/           # Neural engine (GNN, SONA, attention)
│   │   ├── embeddings/         # HNSW vector indexing
│   │   ├── browser/            # Playwright automation
│   │   └── ...                 # n8n, vibium, RL suite, WASM booster
│   ├── mcp/                    # Model Context Protocol server (60+ tools)
│   │   ├── handlers/           # Domain-specific MCP handlers
│   │   ├── tools/              # Tool implementations
│   │   └── security/           # Input validation, sanitization
│   ├── cli/                    # CLI commands and handlers
│   └── shared/                 # Types, value objects, events, parsers
│
├── tests/
│   ├── unit/                   # Mirrors src/ structure
│   ├── integration/            # MCP, sync, browser tests
│   ├── performance/            # Benchmarks
│   └── fixtures/               # Test data, golden files
│
├── .claude/
│   ├── agents/v3/              # All agent definitions (53 qe-* + internal agents)
│   ├── skills/                 # 114 skill definitions
│   └── hooks/                  # Lifecycle hooks (learning, formatting)
│
├── assets/agents/v3/           # QE agents shipped to users via npm (qe-*.md only)
├── docs/                       # ADRs, guides, API docs, research
├── .agentic-qe/memory.db      # 150K+ learned patterns (SQLite)
└── package.json                # v3.7.22, bins: aqe, aqe-v3, aqe-mcp
```

---

## Design Decisions Worth Knowing

**Why DDD with 13 contexts?** — Each quality discipline (coverage, security, defects, etc.) has distinct vocabulary, rules, and workflows. Bounded contexts prevent them from bleeding into each other. A coverage analysis shouldn't need to know about SAP IDoc formats.

**Why HNSW vector indexing?** — When you have 150K+ learned patterns, you need sub-millisecond semantic search. "Find patterns similar to this authentication test" isn't a SQL query — it's a nearest-neighbor search in embedding space. HNSW gives O(log n) lookup.

**Why a Queen coordinator?** — Flat agent architectures don't scale. When 8 agents need to collaborate on a test strategy, someone needs to decompose the task, assign work, handle failures, and synthesize results. The Queen does this using a hierarchical topology with Raft consensus for consistency.

**Why 3-tier model routing?** — Most QE tasks don't need Opus-level reasoning. Adding a type annotation is a WASM transform (<1ms, free). Generating a simple unit test is Haiku work. Only complex architectural test strategies need Sonnet/Opus. Routing saves 70-90% on inference costs.

**Why SQLite, not Postgres?** — AQE runs locally inside your coding tool. No server dependencies. SQLite with WAL mode handles concurrent reads from multiple agents while keeping everything in a single file that travels with the project.

**Why event sourcing?** — Every domain event (test generated, pattern matched, coverage gap found) is captured with a semantic fingerprint. This enables: (a) full replay of any QE session, (b) learning from historical outcomes, (c) audit trails for compliance.

---

## The Learning Loop

This is what makes AQE different from static test tools:

```
  User invokes skill/agent
         │
         ▼
  Agent generates output (tests, analysis, findings)
         │
         ▼
  Experience Capture records: input, output, context, duration
         │
         ▼
  Pattern Lifecycle scores the pattern (did it produce good tests? find real bugs?)
         │
         ▼
  ReasoningBank stores/updates the embedding
         │
         ▼
  Next invocation: Router queries ReasoningBank for similar past patterns
         │
         ▼
  Agent starts with relevant prior knowledge instead of from scratch
```

Over time, AQE builds a codebase-specific model of what works. If property-based tests consistently find more bugs in your payment service than unit tests do, the system learns to prefer property-based testing for financial code.

---

## QCSD Lifecycle (Quality Continuous Software Delivery)

AQE organizes QE work across four phases, each with a dedicated swarm:

| Phase | Swarm | When | What |
|-------|-------|------|------|
| **Ideation** | `qcsd-ideation-swarm` | Before development (Sprint Planning) | HTSM quality criteria analysis, risk storming, testability assessment |
| **Refinement** | `qcsd-refinement-swarm` | During refinement | SFDIPOT product factors, BDD scenario generation, requirements validation |
| **Development** | `qcsd-development-swarm` | In-sprint | TDD adherence, code complexity, coverage gaps, defect prediction |
| **Verification** | `qcsd-cicd-swarm` | CI/CD pipeline | Regression analysis, flaky test detection, quality gates, deployment readiness |
| **Production** | `qcsd-production-swarm` | Post-release | DORA metrics, root cause analysis, feedback loops to Ideation |

Each phase consumes outputs from the previous one and produces signals for the next, creating a continuous quality feedback loop.

---

## Quick Reference: Getting Started

```bash
# 1. Install
npm install -g agentic-qe

# 2. Initialize in your project (auto-detects everything)
cd your-project && aqe init --auto

# 3. Provision for your coding tool
aqe init --with-cursor           # or --with-windsurf, --with-copilot, etc.
# Or for Claude Code:
claude mcp add agentic-qe -- npx agentic-qe mcp

# 4. Start using skills in your coding tool
#    /test-design-techniques       — systematic test case design
#    /exploratory-testing-advanced  — structured exploration with SBTM
#    /sfdipot-product-factors      — HTSM requirements analysis
#    /risk-based-testing           — prioritize testing effort
#    /tdd-london-chicago           — London/Chicago school TDD
#    /security-testing             — OWASP vulnerability testing
#    /six-thinking-hats            — multi-perspective quality analysis
#    /holistic-testing-pact        — PACT-based test strategy

# 5. Or use CLI directly
aqe test generate src/
aqe coverage src/ --risk --gaps
aqe security --sast -t src/
aqe quality --gate
aqe fleet init --wizard
```
