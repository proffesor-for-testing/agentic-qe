# Agentic Quality Engineering Fleet

<div align="center">

[![npm version](https://img.shields.io/npm/v/agentic-qe.svg)](https://www.npmjs.com/package/agentic-qe)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
<img alt="NPM Downloads" src="https://img.shields.io/npm/dw/agentic-qe">


**V3 (Main)** | [V2 Documentation](v2/docs/V2-README.md) | [Release Notes](docs/releases/README.md) | [Changelog](v3/CHANGELOG.md) | [Contributors](CONTRIBUTORS.md) | [Issues](https://github.com/proffesor-for-testing/agentic-qe/issues) | [Discussions](https://github.com/proffesor-for-testing/agentic-qe/discussions)

> **V3** brings Domain-Driven Design architecture, 13 bounded contexts, 60 specialized QE agents, TinyDancer intelligent model routing, ReasoningBank learning with Dream cycles, HNSW vector search, mathematical Coherence verification, full MinCut/Consensus integration across all 13 domains, RVF cognitive container integration with portable brain export/import, OpenCode multi-client support, and deep integration with [Claude Flow](https://github.com/ruvnet/claude-flow) and [Agentic Flow](https://github.com/ruvnet/agentic-flow).

🏗️ **DDD Architecture** | 🧠 **ReasoningBank + Dream Cycles** | 🎯 **TinyDancer Model Routing** | 🔍 **HNSW Vector Search** | 👑 **Queen Coordinator** | 📊 **O(log n) Coverage** | 🔗 **Claude Flow Integration** | 🎯 **13 Bounded Contexts** | 📚 **75 QE Skills** | 🧬 **Coherence Verification** | ✅ **Trust Tiers** | 🛡️ **Governance**

</div>

---

## ⚡ Quick Start

### Install & Initialize

```bash
# Install globally
npm install -g agentic-qe

# Initialize your project (interactive mode)
cd your-project
aqe init

# Or with auto-configuration (no prompts, configures MCP automatically)
aqe init --auto

# Include OpenCode assets (agents, skills, tools, permissions)
aqe init --auto --with-opencode
```

> **Note:** `aqe init` automatically configures the MCP server in `.mcp.json` — Claude Code will auto-start it when connecting. For standalone MCP server usage (non-Claude-Code clients), run `aqe-mcp` or `npx agentic-qe mcp`.

### Use from MCP-compatible agent clients (Claude Code, OpenCode, Codex, others)

AQE is exposed as an MCP server and can be used from any client that supports MCP tool connections.

```bash
# For Claude Code: aqe init --auto configures .mcp.json automatically
# Claude Code will auto-start the MCP server on connection

# For OpenCode: provision assets automatically during init
aqe init --auto --with-opencode   # installs agents, skills, tools, permissions, opencode.json
aqe-mcp                           # starts with SSE auto-detection

# For other MCP clients: start the server manually
aqe-mcp                  # if installed globally
npx agentic-qe mcp       # without global install

# Then ask your client to invoke AQE tools (prefixed mcp__agentic-qe__):
#    - fleet_init (required first step)
#    - test_generate_enhanced for test generation
#    - task_orchestrate for multi-agent coordination
#    - quality_assess for quality gate evaluation
```

For client-specific setup examples, see `docs/integration/mcp-clients.md`.

**What V3 provides:**
- ✅ **13 DDD Bounded Contexts**: Organized by business domain (test-generation, coverage-analysis, security-compliance, enterprise-integration, etc.)
- ✅ **60 QE Agents**: Including Queen Coordinator for hierarchical orchestration (53 main + 7 TDD subagents)
- ✅ **TinyDancer Model Routing**: 3-tier intelligent routing (Haiku/Sonnet/Opus) for cost optimization
- ✅ **ReasoningBank Learning**: HNSW-indexed pattern storage with experience replay
- ✅ **O(log n) Coverage Analysis**: Sublinear algorithms for efficient gap detection
- ✅ **Claude Flow Integration**: Deep integration with MCP tools and swarm orchestration
- ✅ **Memory Coordination**: Cross-agent communication via `aqe/v3/*` namespaces
- ✅ **Coherence Verification** (v3.3.0): Mathematical proof of belief consistency using WASM engines
- ✅ **RVF Cognitive Containers** (v3.7.0): MinCut task routing, witness chain audit trail, portable brain export/import, unified HNSW search, production dual-write to native RVF
- ✅ **OpenCode Support** (v3.7.1): 59 agent configs, 86 QE skills, 5 tool wrappers, SSE/WS/HTTP transport, output compaction, graceful degradation, `aqe init --with-opencode` auto-provisioning
- ✅ **V2 Backward Compatibility**: All V2 agents map to V3 equivalents
- ✅ **75 QE Skills**: 46 Tier 3 verified + 29 additional QE skills (QCSD swarms, n8n testing, enterprise integration, qe-* domains)

---

## 🚀 Get Value in 60 Seconds

```bash
# 1. Install
npm install -g agentic-qe

# 2. Initialize (auto-detects your project, enables all 13 domains, configures MCP)
cd your-project && aqe init --auto

# 3. Use from Claude Code — MCP tools are available immediately (prefix: mcp__agentic-qe__)
# Or start MCP server manually for other clients: aqe-mcp
```

**What happens:**
1. **Auto-configuration** detects your tech stack (TypeScript/JS, testing framework, CI setup)
2. **All 13 DDD domains** enabled automatically - no "No factory registered" errors
3. **MCP server** configured in `.mcp.json` — Claude Code auto-connects on next session
4. **Pattern learning** kicks in - your project's test patterns are learned and reused
5. **AI agents** generate tests, analyze coverage, and provide actionable recommendations

---

## 🎯 Why AQE?

| Problem | AQE Solution |
|---------|--------------|
| **Writing comprehensive tests is tedious and time-consuming** | AI agents generate tests automatically with pattern reuse across projects |
| **Test suites become slow and expensive at scale** | Sublinear O(log n) algorithms for coverage analysis and intelligent test selection |
| **Flaky tests waste developer time debugging false failures** | ML-powered detection with root cause analysis and fix recommendations |
| **AI testing tools are expensive** | TinyDancer 3-tier model routing reduces costs by matching task complexity to appropriate model |
| **No memory between test runs—every analysis starts from scratch** | ReasoningBank remembers patterns, strategies, and what works for your codebase |
| **Agents waste tokens reading irrelevant code** | Code Intelligence provides token reduction with semantic search and knowledge graphs |
| **Quality engineering requires complex coordination** | Queen Coordinator orchestrates 60 agents across 13 domains with consensus and MinCut topology |
| **Tools don't understand your testing frameworks** | Works with Jest, Cypress, Playwright, Vitest, Mocha, Jasmine, AVA |

---

## ✨ V3 Features

### 🏗️ Domain-Driven Design Architecture

V3 is built on **13 DDD Bounded Contexts**, each with dedicated agents and clear responsibilities:

| Domain | Purpose | Key Agents |
|--------|---------|------------|
| **test-generation** | AI-powered test creation | qe-test-architect, qe-tdd-specialist |
| **test-execution** | Parallel execution & retry | qe-parallel-executor, qe-retry-handler |
| **coverage-analysis** | O(log n) gap detection | qe-coverage-specialist, qe-gap-detector |
| **quality-assessment** | Quality gates & decisions | qe-quality-gate, qe-risk-assessor |
| **defect-intelligence** | Prediction & root cause | qe-defect-predictor, qe-root-cause-analyzer |
| **requirements-validation** | BDD & testability | qe-requirements-validator, qe-bdd-generator |
| **code-intelligence** | Knowledge graph & search | qe-code-intelligence, qe-kg-builder |
| **security-compliance** | SAST/DAST & audit | qe-security-scanner, qe-security-auditor |
| **contract-testing** | API contracts & GraphQL | qe-contract-validator, qe-graphql-tester |
| **visual-accessibility** | Visual regression & a11y | qe-visual-tester, qe-accessibility-auditor |
| **chaos-resilience** | Chaos engineering & load | qe-chaos-engineer, qe-load-tester |
| **learning-optimization** | Cross-domain learning | qe-learning-coordinator, qe-pattern-learner |
| **enterprise-integration** | SOAP, SAP, ESB, OData | qe-soap-tester, qe-sap-rfc-tester, qe-sod-analyzer |

---

### ✅ Skill Trust Tiers (v3.4.2)

AQE includes **75 QE skills** (46 Tier 3 verified + 29 additional). Trust tiers apply to core QE skills:

| Tier | Badge | Count | Description |
|------|-------|-------|-------------|
| **Tier 3 - Verified** | ![Tier 3](https://img.shields.io/badge/Tier%203-Verified-brightgreen) | 46 | Full evaluation test suite |
| **Tier 2 - Validated** | ![Tier 2](https://img.shields.io/badge/Tier%202-Validated-green) | 7 | Has executable validator |
| **Tier 1 - Structured** | ![Tier 1](https://img.shields.io/badge/Tier%201-Structured-yellow) | 5 | Has JSON output schema |
| **Tier 0 - Advisory** | ![Tier 0](https://img.shields.io/badge/Tier%200-Advisory-lightgrey) | 5 | SKILL.md guidance only |

**Tier 3 Skills** are recommended for production use - they have:
- JSON Schema validation for output structure
- Executable validator scripts for correctness
- Evaluation test suites with multi-model testing

```bash
# Check skill trust tier
aqe eval status --skill security-testing

# Run skill evaluation
aqe eval run --skill security-testing --model claude-sonnet-4

# View all trust tiers
cat .claude/skills/TRUST-TIERS.md
```

[Full documentation: docs/guides/skill-validation.md]

---

### 🌐 Browser Automation Integration (v3.1.0)

V3.1.0 adds full browser automation support via **@claude-flow/browser** integration:

| Component | Description |
|-----------|-------------|
| **BrowserSwarmCoordinator** | Parallel multi-viewport testing (4x faster) |
| **BrowserSecurityScanner** | URL validation, PII detection with auto-masking |
| **9 Workflow Templates** | YAML-based reusable browser workflows |
| **TrajectoryAdapter** | SONA learning integration with HNSW indexing |

**Available Workflow Templates:**
- `login-flow`, `oauth-flow` - Authentication testing
- `form-validation`, `navigation-flow` - User journey testing
- `visual-regression`, `accessibility-audit` - Quality validation
- `performance-audit`, `api-integration`, `scraping-workflow` - Advanced workflows

```bash
# Use browser automation from Claude Code
claude "Use security-visual-testing skill to test https://example.com across mobile, tablet, desktop viewports"

# Load and execute a workflow template
aqe workflow run login-flow --vars '{"username": "test", "password": "secret"}'
```

---

### 👑 Queen Coordinator & Hierarchical Orchestration

The **qe-queen-coordinator** manages the entire fleet with intelligent task distribution:

```
                    qe-queen-coordinator
                           (Queen)
                             |
        +--------------------+--------------------+
        |                    |                    |
   TEST DOMAIN          QUALITY DOMAIN       LEARNING DOMAIN
   (test-generation)    (quality-assessment) (learning-optimization)
        |                    |                    |
   - test-architect     - quality-gate       - learning-coordinator
   - tdd-specialist     - risk-assessor      - pattern-learner
   - integration-tester - deployment-advisor - transfer-specialist
```

**Capabilities:**
- Orchestrate 60 QE agents concurrently across 13 domains
- TinyDancer 3-tier model routing (Haiku/Sonnet/Opus) with confidence-based decisions
- Byzantine fault-tolerant consensus for critical quality decisions
- MinCut graph-based topology optimization for self-healing coordination
- Memory-backed cross-agent communication with HNSW vector search
- Work stealing with adaptive load balancing (3-5x throughput improvement)

```bash
claude "Use qe-queen-coordinator to orchestrate release validation for v2.1.0 with 90% coverage target"
```

---

### 🤝 Agent Teams & Fleet Coordination

The Queen Coordinator is extended with **Agent Teams** (ADR-064) for hybrid fleet communication:

| Feature | Description |
|---------|-------------|
| **Mailbox Messaging** | Direct agent-to-agent and domain-scoped broadcast messaging |
| **Distributed Tracing** | TraceContext propagation across messages for end-to-end task visibility |
| **Dynamic Scaling** | Workload-based auto-scaling with configurable policies and cooldowns |
| **Competing Hypotheses** | Multi-agent root cause investigation with evidence scoring, auto-triggered on critical failures |
| **Federation** | Cross-service routing with health monitoring and service discovery |
| **Circuit Breakers** | Per-domain fault isolation with automatic recovery |
| **Task DAG** | Topological ordering with cycle detection for multi-step workflows |

**Fleet Tiers** — Activate the level of coordination your project needs:

| Tier | Agents | Best For |
|------|--------|----------|
| **Lite** | 1-4 | Small projects, focused tasks |
| **Standard** | 5-10 | Team projects, multi-domain coordination |
| **Full** | 11-15 | Enterprise, cross-fleet federation |

```bash
claude "Use qe-queen-coordinator with agent teams to investigate flaky test failures across test-execution and defect-intelligence domains"
```

---

### 🧠 ReasoningBank Learning System

V3 agents learn and improve through the **ReasoningBank** pattern storage:

| Component | Description |
|-----------|-------------|
| **Experience Storage** | Store successful patterns with confidence scores |
| **HNSW Indexing** | Fast O(log n) similarity search for pattern matching |
| **Experience Replay** | Learn from past successes and failures |
| **Cross-Project Transfer** | Share patterns between projects |

```bash
# Search learned patterns
aqe hooks search --query "test patterns"

# View learning statistics
aqe learning stats
```

---

### 🌙 Dream Cycles & Neural Learning

V3 introduces **Dream cycles** for neural consolidation and continuous improvement:

| Feature | Description |
|---------|-------------|
| **Dream Cycles** | Background neural consolidation (30s max) with spreading activation |
| **9 RL Algorithms** | Q-Learning, SARSA, DQN, PPO, A2C, DDPG, Actor-Critic, Policy Gradient, Decision Transformer |
| **SONA Integration** | Self-Optimizing Neural Architecture with <0.05ms adaptation |
| **Novelty Scoring** | Prioritize learning from novel patterns |
| **Concept Graphs** | Build semantic connections between quality patterns |

```bash
# Trigger dream cycle for pattern consolidation
aqe learning dream

# View learning dashboard and trajectory
aqe learning dashboard
```

---

### 🧬 RVF Cognitive Container Integration (v3.7.0)

V3.7 integrates **RVF (RuVector Format)** cognitive container capabilities across 4 workstreams:

| Feature | Description |
|---------|-------------|
| **MinCut Task Routing** | Models task complexity as a graph problem using vertex connectivity (lambda) for intelligent 3-tier routing |
| **RVCOW Dream Branching** | Copy-on-write branches for safe dream cycle experimentation — speculative insights are isolated until merged |
| **Cryptographic Witness Chain** | SHA-256 hash-chained audit trail for quality gate decisions, pattern promotions, and test completions |
| **Unified HNSW Search** | Consolidated 3 fragmented implementations behind a single progressive adapter (flat scan for small, full HNSW for large collections) |
| **Brain Export/Import** | Portable QE intelligence containers — export patterns, Q-values, and insights for sharing across environments |
| **MinCut Test Optimizer** | Identifies critical vs skippable tests using graph-based coverage analysis for faster test suites |
| **RVF Dual-Writer** | Best-effort dual-write to SQLite + RVF containers, preparing for future native RVF storage |

```bash
# Export your QE brain as a portable container
aqe brain export --output ./my-brain

# Import a brain into another environment
aqe brain import --input ./my-brain --dry-run

# View brain statistics
aqe brain info --input ./my-brain
```

---

### 🎯 TinyDancer Intelligent Model Routing

**TinyDancer** (ADR-026) provides 3-tier intelligent model routing for cost optimization:

| Complexity Score | Model | Use Cases |
|-----------------|-------|-----------|
| **0-20** (Simple) | Haiku | Syntax fixes, type additions, simple refactors |
| **20-70** (Moderate) | Sonnet | Bug fixes, test generation, code review |
| **70+** (Critical) | Opus | Architecture, security, complex reasoning |

**Routing Features:**
- **Confidence-based decisions**: Routes based on task complexity analysis
- **Automatic escalation**: Escalates to higher-tier model if confidence is low
- **Learning from outcomes**: Improves routing based on success/failure patterns
- **Token budget optimization**: Minimizes cost while maintaining quality

```bash
# Route a task through TinyDancer
aqe llm route --task "fix type errors in user-service.ts"

# View routing cost analysis
aqe llm cost
```

---

### 🔄 Cross-Phase Memory Unification (v3.3.5)

V3.3.5 unifies cross-phase feedback loops with UnifiedMemoryManager:

- **Single SQLite Backend**: All QCSD signals stored in `.agentic-qe/memory.db`
- **Namespace-Based Storage**: `qcsd/strategic`, `qcsd/tactical`, `qcsd/operational`, `qcsd/quality-criteria`
- **Automatic TTL**: 30-90 day expiration per signal type
- **No File-Based Storage**: Eliminated JSON file storage for cross-phase memory
- **Full Hook Integration**: Pre/post hooks for cross-phase signal injection

### 🌐 AG-UI, A2A & A2UI Protocols (v3.4.0)

V3.4.0 adds support for **industry-standard agent communication protocols**:

| Protocol | Standard | Purpose |
|----------|----------|---------|
| **AG-UI** | Anthropic | Agent-to-User streaming interface with lifecycle events |
| **A2A** | Google | Agent-to-Agent interoperability with task/artifact exchange |
| **A2UI** | Hybrid | Unified UI components combining streaming + events |

**Programmatic usage:**

```typescript
import { AGUIAdapter, A2AAdapter } from 'agentic-qe';

// AG-UI: Stream test generation progress to UI
const agui = new AGUIAdapter();
await agui.streamTask({
  type: 'test-generation',
  onProgress: (event) => updateProgressBar(event.progress),
  onArtifact: (test) => displayGeneratedTest(test),
});

// A2A: Inter-agent task delegation
const a2a = new A2AAdapter();
await a2a.sendTask({
  from: 'qe-test-architect',
  to: 'qe-security-scanner',
  task: { type: 'review-tests', files: generatedTests },
});
```

**Benefits:**
- **Streaming feedback** - Real-time progress instead of waiting for completion
- **Agent interoperability** - Standard protocols for multi-agent coordination
- **Framework integration** - Works with React, Vue, or any UI framework

---

### 🔐 Consensus & MinCut Coordination (v3.3.3)

V3.3.3 achieves **full MinCut/Consensus integration across all 13 domains**:

| Feature | Description |
|---------|-------------|
| **Byzantine Consensus** | Fault-tolerant voting for critical quality decisions |
| **MinCut Topology** | Graph-based self-healing agent coordination |
| **Multi-Model Voting** | Aggregate decisions from multiple model tiers |
| **Claim Verification** | Cryptographic verification of agent work claims |
| **13/13 Domain Integration** | All domains use `verifyFinding()` for consensus |
| **Topology-Aware Routing** | Routes tasks avoiding weak network vertices |
| **Self-Healing Triggers** | `shouldPauseOperations()` for automatic recovery |

```bash
# Check fleet health (includes consensus and topology status)
aqe fleet status

# Via MCP tools (from Claude Code)
# mcp__agentic-qe__fleet_health({ includeTopology: true })
```

---

### 🧬 Coherence-Gated Quality Engineering (v3.3.0)

V3.3.0 introduces **mathematical coherence verification** using Prime Radiant WASM engines:

| Feature | Description |
|---------|-------------|
| **Contradiction Detection** | Sheaf cohomology identifies conflicting requirements before test generation |
| **Collapse Prediction** | Spectral analysis predicts swarm failures before they happen |
| **Causal Verification** | Distinguishes true causation from spurious correlations |
| **Auto-Tuning Thresholds** | EMA-based calibration adapts to your codebase |

**Compute Lanes** - Automatic routing based on coherence energy:

| Coherence Energy | Action | Latency |
|------------------|--------|---------|
| < 0.1 (Reflex) | Execute immediately | <1ms |
| 0.1-0.4 (Retrieval) | Fetch more context | ~10ms |
| 0.4-0.7 (Heavy) | Deep analysis | ~100ms |
| > 0.7 (Human) | Escalate to Queen | Async |

**Benefits:**
- Prevents contradictory test generation
- Detects swarm drift 10x faster
- Mathematical proof instead of statistical confidence
- "Coherence Verified" CI/CD badges

```bash
# Coherence verification is available via MCP tools and programmatic API:
# mcp__agentic-qe__quality_assess({ scope: "coherence", includeMetrics: true })

# Verify learned patterns for consistency
aqe learning verify
```

---

### 🔍 O(log n) Coverage Analysis

Efficient coverage gap detection using **Johnson-Lindenstrauss algorithms**:

- **Sublinear complexity**: Analyze large codebases in logarithmic time
- **Risk-weighted gaps**: Prioritize coverage by business impact
- **Intelligent test selection**: Minimal tests for maximum coverage
- **Trend tracking**: Monitor coverage changes over time

```bash
claude "Use qe-coverage-specialist to analyze gaps in src/ with risk scoring"
```

---

### 🔗 Claude Flow Integration

V3 deeply integrates with [Claude Flow](https://github.com/ruvnet/claude-flow) for:

- **MCP Server**: All V3 tools available via Model Context Protocol
- **Swarm Orchestration**: Multi-agent coordination with hierarchical topology
- **Memory Sharing**: Cross-agent state via `aqe/v3/*` namespaces
- **Hooks System**: Pre/post task learning and optimization
- **Session Management**: Persistent state across conversations

```bash
# Initialize swarm with Claude Flow
npx @claude-flow/cli@latest swarm init --topology hierarchical-mesh

# Spawn V3 agents
npx @claude-flow/cli@latest agent spawn -t qe-test-architect --name test-gen
```

---

### 📊 60 Specialized QE Agents

| Category | Count | Highlights |
|----------|-------|------------|
| **Main QE Agents** | 53 | Test generation, coverage, security, performance, accessibility, enterprise integration, pentest validation |
| **TDD Subagents** | 7 | RED/GREEN/REFACTOR with code review |

**V2 Backward Compatibility**: All V2 agents map to V3 equivalents automatically.

<details>
<summary><b>📋 View All Main QE Agents (53)</b></summary>

| Agent | Domain | Purpose |
|-------|--------|---------|
| qe-queen-coordinator | coordination | Hierarchical fleet orchestration |
| qe-test-architect | test-generation | AI-powered test creation |
| qe-tdd-specialist | test-generation | TDD workflow coordination |
| qe-parallel-executor | test-execution | Multi-worker test execution |
| qe-retry-handler | test-execution | Intelligent retry with backoff |
| qe-coverage-specialist | coverage-analysis | O(log n) coverage analysis |
| qe-gap-detector | coverage-analysis | Risk-weighted gap detection |
| qe-quality-gate | quality-assessment | Quality threshold validation |
| qe-risk-assessor | quality-assessment | Multi-factor risk scoring |
| qe-deployment-advisor | quality-assessment | Go/no-go deployment decisions |
| qe-defect-predictor | defect-intelligence | ML-powered defect prediction |
| qe-root-cause-analyzer | defect-intelligence | Systematic root cause analysis |
| qe-flaky-hunter | defect-intelligence | Flaky test detection & fix |
| qe-requirements-validator | requirements-validation | Testability analysis |
| qe-bdd-generator | requirements-validation | Gherkin scenario generation |
| qe-code-intelligence | code-intelligence | Semantic code search |
| qe-kg-builder | code-intelligence | Knowledge graph construction |
| qe-dependency-mapper | code-intelligence | Dependency analysis |
| qe-security-scanner | security-compliance | SAST/DAST scanning |
| qe-security-auditor | security-compliance | Security audit & compliance |
| qe-contract-validator | contract-testing | API contract validation |
| qe-graphql-tester | contract-testing | GraphQL testing |
| qe-visual-tester | visual-accessibility | Visual regression testing |
| qe-accessibility-auditor | visual-accessibility | WCAG compliance testing |
| qe-responsive-tester | visual-accessibility | Cross-viewport testing |
| qe-chaos-engineer | chaos-resilience | Controlled fault injection |
| qe-load-tester | chaos-resilience | Load & performance testing |
| qe-performance-tester | chaos-resilience | Performance validation |
| qe-learning-coordinator | learning-optimization | Fleet-wide learning |
| qe-pattern-learner | learning-optimization | Pattern discovery |
| qe-transfer-specialist | learning-optimization | Cross-project transfer |
| qe-metrics-optimizer | learning-optimization | Hyperparameter tuning |
| qe-integration-tester | test-execution | Component integration |
| qe-mutation-tester | test-generation | Test effectiveness validation |
| qe-property-tester | test-generation | Property-based testing |
| qe-regression-analyzer | defect-intelligence | Regression risk analysis |
| qe-impact-analyzer | code-intelligence | Change impact assessment |
| qe-code-complexity | code-intelligence | Complexity metrics |
| qe-qx-partner | quality-assessment | QA + UX collaboration |
| qe-fleet-commander | coordination | Large-scale orchestration |
| qe-integration-architect | code-intelligence | V3 integration design |
| qe-product-factors-assessor | quality-assessment | SFDIPOT product factors analysis |
| qe-test-idea-rewriter | test-generation | Transform passive tests to active actions |
| qe-quality-criteria-recommender | quality-assessment | HTSM v6.3 Quality Criteria analysis |
| qe-devils-advocate | quality-assessment | Adversarial review of agent outputs |

</details>

<details>
<summary><b>🔧 TDD Subagents (7)</b></summary>

| Subagent | Phase | Purpose |
|----------|-------|---------|
| qe-tdd-red | RED | Write failing tests |
| qe-tdd-green | GREEN | Implement minimal code |
| qe-tdd-refactor | REFACTOR | Improve code quality |
| qe-code-reviewer | REVIEW | Code quality validation |
| qe-integration-reviewer | REVIEW | Integration review |
| qe-performance-reviewer | REVIEW | Performance review |
| qe-security-reviewer | REVIEW | Security review |

</details>

---

## 💻 V3 Usage Examples

### Example 1: Queen-Coordinated Quality Pipeline

```bash
claude "Use qe-queen-coordinator to run full quality assessment:
1. Generate tests for src/services/*.ts
2. Execute tests with parallel workers
3. Analyze coverage gaps with risk scoring
4. Run security scan
5. Validate quality gate at 90% threshold
6. Provide deployment recommendation"
```

**What happens:**
1. Queen spawns domain coordinators for each task
2. Agents execute in parallel across 5 domains
3. Results aggregate through memory coordination
4. Queen synthesizes final recommendation

### Example 2: Learning-Enhanced Test Generation

```bash
claude "Use qe-test-architect to create tests for PaymentService with:
- Property-based testing for validation
- 95% coverage target
- Apply learned patterns from similar services"
```

**Output includes:**
```
Generated 48 tests across 4 files
- unit/PaymentService.test.ts (32 unit tests)
- property/PaymentValidation.property.test.ts (8 property tests)
- integration/PaymentFlow.integration.test.ts (8 integration tests)
Coverage: 96.2%
Pattern reuse: 78% from learned patterns
Learning stored: "payment-validation-patterns" (confidence: 0.94)
```

### Example 3: TDD Workflow with Subagents

```bash
claude "Use qe-tdd-specialist to implement UserAuthentication with full RED-GREEN-REFACTOR cycle"
```

**Workflow:**
1. **qe-tdd-red**: Writes failing tests defining behavior
2. **qe-tdd-green**: Implements minimal code to pass
3. **qe-tdd-refactor**: Improves code quality
4. **qe-code-reviewer**: Validates standards
5. **qe-security-reviewer**: Checks security concerns

### Example 4: Cross-Domain Coordination

```bash
claude "Coordinate security audit across the monorepo:
- qe-security-scanner for SAST/DAST
- qe-dependency-mapper for vulnerability scanning
- qe-contract-validator for API security
- qe-chaos-engineer for resilience testing"
```

---

## 🎓 75 QE Skills

V3 agents automatically apply relevant skills from the comprehensive QE skill library.

<details>
<summary><b>View All 75 QE Skills</b></summary>

**Core Testing & Methodologies (12)**
- agentic-quality-engineering - Core PACT principles for AI-powered QE
- holistic-testing-pact - Evolved testing model with PACT integration
- context-driven-testing - Practices chosen based on project context
- tdd-london-chicago - Test-driven development with both school approaches
- xp-practices - Extreme programming practices for quality
- risk-based-testing - Focus testing effort on highest-risk areas
- test-automation-strategy - Strategic approach to automation
- refactoring-patterns - Safe code improvement patterns
- shift-left-testing - Early testing in development lifecycle
- shift-right-testing - Production testing and observability
- regression-testing - Strategic regression management
- verification-quality - Quality verification practices

**Specialized Testing (13)**
- accessibility-testing - WCAG 2.2 compliance and inclusive design
- mobile-testing - iOS and Android platform testing
- database-testing - Schema validation and data integrity
- contract-testing - Consumer-driven contract testing
- chaos-engineering-resilience - Fault injection and resilience testing
- visual-testing-advanced - Visual regression and UI testing
- security-visual-testing - Security-first visual testing with PII detection
- compliance-testing - Regulatory compliance (GDPR, HIPAA, SOC2)
- compatibility-testing - Cross-browser and platform testing
- localization-testing - i18n and l10n testing
- mutation-testing - Test suite effectiveness evaluation
- performance-testing - Load, stress, and scalability testing
- security-testing - OWASP and security vulnerability testing

**V3 Domain Skills (14)**
- qe-test-generation - AI-powered test synthesis
- qe-test-execution - Parallel execution and retry logic
- qe-coverage-analysis - O(log n) sublinear coverage
- qe-quality-assessment - Quality gates and deployment readiness
- qe-defect-intelligence - ML defect prediction and root cause
- qe-requirements-validation - BDD scenarios and acceptance criteria
- qe-code-intelligence - Knowledge graphs and token reduction
- qe-security-compliance - OWASP and CVE detection
- qe-contract-testing - Pact and schema validation
- qe-visual-accessibility - Visual regression and WCAG
- qe-chaos-resilience - Fault injection and resilience
- qe-learning-optimization - Transfer learning and self-improvement
- qe-iterative-loop - QE iteration patterns
- aqe-v2-v3-migration - Migration guide from v2 to v3

**Strategic & Communication (8)**
- six-thinking-hats - Edward de Bono's methodology for QE
- brutal-honesty-review - Unvarnished technical criticism
- sherlock-review - Evidence-based investigative code review
- cicd-pipeline-qe-orchestrator - CI/CD quality orchestration
- bug-reporting-excellence - High-quality bug reports
- consultancy-practices - QE consultancy workflows
- quality-metrics - Effective quality measurement
- pair-programming - AI-assisted pair programming

**Testing Techniques & Management (9)**
- exploratory-testing-advanced - SBTM and RST heuristics
- test-design-techniques - Test design methodologies
- test-data-management - Test data strategies
- test-environment-management - Environment configuration
- test-reporting-analytics - Quality dashboards and KPIs
- testability-scoring - Score code testability
- technical-writing - Documentation practices
- code-review-quality - Context-driven code reviews
- api-testing-patterns - REST and GraphQL testing

**n8n Workflow Testing (5)** (contributed by [@fndlalit](https://github.com/fndlalit))
- n8n-workflow-testing-fundamentals - Execution lifecycle and data flow
- n8n-expression-testing - Expression validation and testing
- n8n-security-testing - Workflow security scanning
- n8n-trigger-testing-strategies - Webhook and event testing
- n8n-integration-testing-patterns - API contract testing for n8n

**QCSD Swarms (4)** - Quality Conscious Software Delivery lifecycle
- qcsd-ideation-swarm - Phase 1: HTSM v6.3, Risk Storming, Testability analysis
- qcsd-refinement-swarm - Phase 2: SFDIPOT analysis, BDD scenario generation
- qcsd-development-swarm - Phase 3: TDD, coverage, code quality gates (SHIP/CONDITIONAL/HOLD)
- qcsd-cicd-swarm - Phase 4: Pipeline quality gates (RELEASE/REMEDIATE/BLOCK)

**Accessibility (2)**
- a11y-ally - Comprehensive WCAG auditing with video captions and EU compliance
- accessibility-testing - WCAG 2.2 compliance and screen reader validation

</details>

---

## 🔄 V2 to V3 Migration

V3 provides automatic backward compatibility with V2:

```bash
# Check migration status
aqe migrate status

# Run migration with backup
aqe migrate run --backup

# Verify migration
aqe migrate verify
```

**What gets migrated:**
- ✅ Memory data (SQLite → AgentDB with HNSW indexing)
- ✅ Configuration files
- ✅ Learned patterns (→ ReasoningBank)
- ✅ Agent mappings (V2 names → V3 equivalents)

| V2 Agent | V3 Agent |
|----------|----------|
| qe-test-generator | qe-test-architect |
| qe-coverage-analyzer | qe-coverage-specialist |
| qe-quality-gate | qe-quality-gate |
| qe-security-scanner | qe-security-scanner |
| qe-coordinator | qe-queen-coordinator |

---

## 🤖 LLM Provider Configuration

AQE V3 supports multiple LLM providers for maximum flexibility:

| Provider | Type | Cost | Best For |
|----------|------|------|----------|
| **Ollama** | Local | FREE | Privacy, offline |
| **OpenRouter** | Cloud | Varies | 300+ models |
| **Groq** | Cloud | FREE | High-speed |
| **Claude API** | Cloud | Paid | Highest quality |
| **Google AI** | Cloud | FREE | Gemini models |

```bash
# Configure provider
export GROQ_API_KEY="gsk_..."
aqe init --auto
```

---

## 📖 Documentation

### V3 Guides
- [V3 Migration Guide](docs/plans/V2-TO-V3-MIGRATION-PLAN.md) - Complete migration instructions
- [V3 CLI Reference](docs/guides/V3-CLI-REFERENCE.md) - All V3 commands
- [DDD Architecture](docs/architecture/DDD-ARCHITECTURE.md) - Domain-driven design overview

### V2 Documentation (Legacy)
- [V2 README](v2/docs/V2-README.md) - Complete V2 documentation
- [Quick Start Guide](v2/docs/AQE-CLI.md) - V2 quick start
- [User Guide](v2/docs/USER-GUIDE.md) - V2 workflows and examples

### Feature Guides
- [Learning System Guide](docs/guides/LEARNING-SYSTEM-USER-GUIDE.md) - ReasoningBank learning
- [Pattern Management Guide](docs/guides/PATTERN-MANAGEMENT-USER-GUIDE.md) - Cross-project patterns
- [MCP Integration](docs/guides/MCP-INTEGRATION.md) - Claude Code integration

### Testing Guides
- [Test Generation](docs/guides/TEST-GENERATION.md) - AI-powered test creation
- [Coverage Analysis](docs/guides/COVERAGE-ANALYSIS.md) - O(log n) gap detection
- [Quality Gates](docs/guides/QUALITY-GATES.md) - Intelligent validation

---

## 📊 Project Architecture

```
agentic-qe/
├── v3/                      # V3 DDD Implementation (Main Version)
│   ├── src/
│   │   ├── kernel/          # Shared kernel
│   │   ├── domains/         # 13 bounded contexts
│   │   │   ├── test-generation/
│   │   │   ├── coverage-analysis/
│   │   │   ├── quality-assessment/
│   │   │   └── ...
│   │   ├── routing/         # Agent routing & registry
│   │   ├── mcp/             # MCP server
│   │   └── cli/             # V3 CLI
│   ├── tests/               # 5,600+ tests
│   └── assets/agents/       # 60 QE agent definitions (53 main + 7 subagents)
├── v2/                      # V2 Implementation (Legacy)
│   ├── src/                 # V2 source code
│   ├── tests/               # V2 tests
│   └── docs/                # V2 documentation
├── .claude/
│   ├── agents/v3/           # V3 agent definitions (source)
│   └── skills/              # 15 QE-specific skills
├── docs/                    # Shared documentation
│   ├── plans/               # Migration plans
│   ├── policies/            # Project policies
│   └── v3/                  # V3 specific docs
├── package.json             # Points to v3 (main version)
└── README.md                # This file
```

---

## 🚀 Development

### Setup

```bash
# Clone repository
git clone https://github.com/proffesor-for-testing/agentic-qe.git
cd agentic-qe

# Install V3 dependencies
cd v3
npm install

# Build
npm run build

# Run tests
npm test -- --run
```

### V3 Scripts

| Script | Description |
|--------|-------------|
| `npm run build` | Compile TypeScript |
| `npm test -- --run` | Run all tests |
| `npm run cli` | Run CLI in dev mode |
| `npm run mcp` | Start MCP server |

---

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details.

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

V3 is built on the shoulders of giants:

- **[Claude Flow](https://github.com/ruvnet/claude-flow)** by [@ruvnet](https://github.com/ruvnet) - Multi-agent orchestration, MCP integration, swarm coordination
- **[Agentic Flow](https://github.com/ruvnet/agentic-flow)** by [@ruvnet](https://github.com/ruvnet) - Agent patterns, learning systems, neural coordination
- Built with TypeScript, Node.js, and better-sqlite3
- HNSW indexing via hnswlib-node
- Inspired by Domain-Driven Design and swarm intelligence
- Integrates with Jest, Cypress, Playwright, k6, SonarQube, and more
- Compatible with Claude Code via Model Context Protocol (MCP)

---

<div align="center">

**Made with ❤️ by the Agentic QE Team**

[⭐ Star us on GitHub](https://github.com/proffesor-for-testing/agentic-qe) | [💖 Sponsor](FUNDING.md) | [👥 Contributors](CONTRIBUTORS.md)

</div>
