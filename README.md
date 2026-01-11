# Agentic Quality Engineering Fleet

<div align="center">

[![npm version](https://img.shields.io/npm/v/agentic-qe.svg)](https://www.npmjs.com/package/agentic-qe)
[![npm v3](https://img.shields.io/npm/v/@agentic-qe/v3.svg?label=v3%20alpha)](https://www.npmjs.com/package/@agentic-qe/v3)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
<img alt="NPM Downloads" src="https://img.shields.io/npm/dw/agentic-qe">
[![Run in Smithery](https://smithery.ai/badge/skills/proffesor-for-testing)](https://smithery.ai/skills?ns=proffesor-for-testing&utm_source=github&utm_medium=badge)


**V3 Alpha** | [V2 Documentation](docs/V2-README.md) | [Changelog](CHANGELOG.md) | [Contributors](CONTRIBUTORS.md) | [Issues](https://github.com/proffesor-for-testing/agentic-qe/issues) | [Discussions](https://github.com/proffesor-for-testing/agentic-qe/discussions)

> **V3** brings Domain-Driven Design architecture, 12 bounded contexts, 59 specialized agents, ReasoningBank learning, HNSW vector search, and deep integration with [Claude Flow](https://github.com/ruvnet/claude-flow) and [Agentic Flow](https://github.com/ruvnet/agentic-flow).

🏗️ **DDD Architecture** | 🧠 **ReasoningBank Learning** | 🔍 **HNSW Vector Search** | 👑 **Queen Coordinator** | 📊 **O(log n) Coverage** | 🔗 **Claude Flow Integration** | 🎯 **12 Bounded Contexts** | 📚 **46+ QE Skills**

</div>

---

## ⚡ Quick Start (V3)

### Install & Initialize

```bash
# Install V3 globally
npm install -g @agentic-qe/v3

# Initialize your project
cd your-project
aqe-v3 init --wizard

# Or with auto-configuration
aqe-v3 init --auto

# Add MCP server to Claude Code (optional)
claude mcp add agentic-qe-v3 npx @agentic-qe/v3 mcp

# Verify connection
claude mcp list
```

### Use from Claude Code CLI

Ask Claude to use V3 QE agents directly from your terminal:

```bash
# Generate comprehensive tests with learning
claude "Use v3-qe-test-architect to create tests for src/services/user-service.ts with 95% coverage"

# Run full quality pipeline with Queen coordination
claude "Use v3-qe-queen-coordinator to orchestrate: test generation, coverage analysis, security scan, and quality gate"

# Detect flaky tests with root cause analysis
claude "Use v3-qe-flaky-hunter to analyze the last 100 test runs and stabilize flaky tests"
```

**What V3 provides:**
- ✅ **12 DDD Bounded Contexts**: Organized by business domain (test-generation, coverage-analysis, security-compliance, etc.)
- ✅ **59 Specialized Agents**: Including Queen Coordinator for hierarchical orchestration
- ✅ **ReasoningBank Learning**: HNSW-indexed pattern storage with experience replay
- ✅ **O(log n) Coverage Analysis**: Sublinear algorithms for efficient gap detection
- ✅ **Claude Flow Integration**: Deep integration with MCP tools and swarm orchestration
- ✅ **Memory Coordination**: Cross-agent communication via `aqe/v3/*` namespaces
- ✅ **V2 Backward Compatibility**: All V2 agents map to V3 equivalents
- ✅ **46+ QE Skills**: Context-driven testing, TDD, security, accessibility, and more

---

## 🎯 Why AQE?

| Problem | AQE Solution |
|---------|--------------|
| **Writing comprehensive tests is tedious and time-consuming** | AI agents generate tests automatically with pattern reuse across projects |
| **Test suites become slow and expensive at scale** | Sublinear O(log n) algorithms for coverage analysis and intelligent test selection |
| **Flaky tests waste developer time debugging false failures** | ML-powered detection with root cause analysis and fix recommendations |
| **AI testing tools are expensive** | Multi-model routing cuts costs by up to 70-81% by matching task complexity to model |
| **No memory between test runs—every analysis starts from scratch** | ReasoningBank remembers patterns, strategies, and what works for your codebase |
| **Agents waste tokens reading irrelevant code** | Code Intelligence provides token reduction with semantic search and knowledge graphs |
| **Quality engineering requires complex coordination** | Queen Coordinator orchestrates 50+ agents across 12 domains automatically |
| **Tools don't understand your testing frameworks** | Works with Jest, Cypress, Playwright, Vitest, Mocha, Jasmine, AVA |

---

## ✨ V3 Features

### 🏗️ Domain-Driven Design Architecture

V3 is built on **12 DDD Bounded Contexts**, each with dedicated agents and clear responsibilities:

| Domain | Purpose | Key Agents |
|--------|---------|------------|
| **test-generation** | AI-powered test creation | v3-qe-test-architect, v3-qe-tdd-specialist |
| **test-execution** | Parallel execution & retry | v3-qe-parallel-executor, v3-qe-retry-handler |
| **coverage-analysis** | O(log n) gap detection | v3-qe-coverage-specialist, v3-qe-gap-detector |
| **quality-assessment** | Quality gates & decisions | v3-qe-quality-gate, v3-qe-risk-assessor |
| **defect-intelligence** | Prediction & root cause | v3-qe-defect-predictor, v3-qe-root-cause-analyzer |
| **requirements-validation** | BDD & testability | v3-qe-requirements-validator, v3-qe-bdd-generator |
| **code-intelligence** | Knowledge graph & search | v3-qe-code-intelligence, v3-qe-kg-builder |
| **security-compliance** | SAST/DAST & audit | v3-qe-security-scanner, v3-qe-security-auditor |
| **contract-testing** | API contracts & GraphQL | v3-qe-contract-validator, v3-qe-graphql-tester |
| **visual-accessibility** | Visual regression & a11y | v3-qe-visual-tester, v3-qe-accessibility-auditor |
| **chaos-resilience** | Chaos engineering & load | v3-qe-chaos-engineer, v3-qe-load-tester |
| **learning-optimization** | Cross-domain learning | v3-qe-learning-coordinator, v3-qe-pattern-learner |

---

### 👑 Queen Coordinator & Hierarchical Orchestration

The **v3-qe-queen-coordinator** manages the entire fleet with intelligent task distribution:

```
                    v3-qe-queen-coordinator
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
- Orchestrate 50+ agents concurrently across 12 domains
- Intelligent task routing based on learned patterns
- Byzantine fault-tolerant consensus for critical decisions
- Memory-backed cross-agent communication
- Adaptive load balancing

```bash
claude "Use v3-qe-queen-coordinator to orchestrate release validation for v2.1.0 with 90% coverage target"
```

---

### 🧠 ReasoningBank Learning System

V3 agents learn and improve through the **ReasoningBank** pattern storage:

| Component | Description |
|-----------|-------------|
| **Experience Storage** | Store successful patterns with confidence scores |
| **HNSW Indexing** | Fast similarity search for pattern matching |
| **Experience Replay** | Learn from past successes and failures |
| **Cross-Project Transfer** | Share patterns between projects |

```bash
# Check what agents have learned
aqe-v3 memory search --query "test patterns" --namespace learning

# View learning metrics
aqe-v3 hooks metrics --v3-dashboard
```

---

### 🔍 O(log n) Coverage Analysis

Efficient coverage gap detection using **Johnson-Lindenstrauss algorithms**:

- **Sublinear complexity**: Analyze large codebases in logarithmic time
- **Risk-weighted gaps**: Prioritize coverage by business impact
- **Intelligent test selection**: Minimal tests for maximum coverage
- **Trend tracking**: Monitor coverage changes over time

```bash
claude "Use v3-qe-coverage-specialist to analyze gaps in src/ with risk scoring"
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
npx @claude-flow/cli@latest agent spawn -t v3-qe-test-architect --name test-gen
```

---

### 📊 59 Specialized V3 Agents

| Category | Count | Highlights |
|----------|-------|------------|
| **V3 QE Agents** | 40 | Test generation, coverage, security, performance, accessibility |
| **TDD Subagents** | 7 | RED/GREEN/REFACTOR with code review |
| **Core Specialized** | 12 | Queen coordinator, memory specialist, security architect |

**V2 Backward Compatibility**: All V2 agents map to V3 equivalents automatically.

<details>
<summary><b>📋 View All V3 QE Agents (40)</b></summary>

| Agent | Domain | Purpose |
|-------|--------|---------|
| v3-qe-queen-coordinator | coordination | Hierarchical fleet orchestration |
| v3-qe-test-architect | test-generation | AI-powered test creation |
| v3-qe-tdd-specialist | test-generation | TDD workflow coordination |
| v3-qe-parallel-executor | test-execution | Multi-worker test execution |
| v3-qe-retry-handler | test-execution | Intelligent retry with backoff |
| v3-qe-coverage-specialist | coverage-analysis | O(log n) coverage analysis |
| v3-qe-gap-detector | coverage-analysis | Risk-weighted gap detection |
| v3-qe-quality-gate | quality-assessment | Quality threshold validation |
| v3-qe-risk-assessor | quality-assessment | Multi-factor risk scoring |
| v3-qe-deployment-advisor | quality-assessment | Go/no-go deployment decisions |
| v3-qe-defect-predictor | defect-intelligence | ML-powered defect prediction |
| v3-qe-root-cause-analyzer | defect-intelligence | Systematic root cause analysis |
| v3-qe-flaky-hunter | defect-intelligence | Flaky test detection & fix |
| v3-qe-requirements-validator | requirements-validation | Testability analysis |
| v3-qe-bdd-generator | requirements-validation | Gherkin scenario generation |
| v3-qe-code-intelligence | code-intelligence | Semantic code search |
| v3-qe-kg-builder | code-intelligence | Knowledge graph construction |
| v3-qe-dependency-mapper | code-intelligence | Dependency analysis |
| v3-qe-security-scanner | security-compliance | SAST/DAST scanning |
| v3-qe-security-auditor | security-compliance | Security audit & compliance |
| v3-qe-contract-validator | contract-testing | API contract validation |
| v3-qe-graphql-tester | contract-testing | GraphQL testing |
| v3-qe-visual-tester | visual-accessibility | Visual regression testing |
| v3-qe-accessibility-auditor | visual-accessibility | WCAG compliance testing |
| v3-qe-responsive-tester | visual-accessibility | Cross-viewport testing |
| v3-qe-chaos-engineer | chaos-resilience | Controlled fault injection |
| v3-qe-load-tester | chaos-resilience | Load & performance testing |
| v3-qe-performance-tester | chaos-resilience | Performance validation |
| v3-qe-learning-coordinator | learning-optimization | Fleet-wide learning |
| v3-qe-pattern-learner | learning-optimization | Pattern discovery |
| v3-qe-transfer-specialist | learning-optimization | Cross-project transfer |
| v3-qe-metrics-optimizer | learning-optimization | Hyperparameter tuning |
| v3-qe-integration-tester | test-execution | Component integration |
| v3-qe-mutation-tester | test-generation | Test effectiveness validation |
| v3-qe-property-tester | test-generation | Property-based testing |
| v3-qe-regression-analyzer | defect-intelligence | Regression risk analysis |
| v3-qe-impact-analyzer | code-intelligence | Change impact assessment |
| v3-qe-code-complexity | code-intelligence | Complexity metrics |
| v3-qe-qx-partner | quality-assessment | QA + UX collaboration |
| v3-qe-fleet-commander | coordination | Large-scale orchestration |

</details>

<details>
<summary><b>🔧 TDD Subagents (7)</b></summary>

| Subagent | Phase | Purpose |
|----------|-------|---------|
| v3-qe-tdd-red | RED | Write failing tests |
| v3-qe-tdd-green | GREEN | Implement minimal code |
| v3-qe-tdd-refactor | REFACTOR | Improve code quality |
| v3-qe-code-reviewer | REVIEW | Code quality validation |
| v3-qe-integration-reviewer | REVIEW | Integration review |
| v3-qe-performance-reviewer | REVIEW | Performance review |
| v3-qe-security-reviewer | REVIEW | Security review |

</details>

<details>
<summary><b>🏛️ Core Specialized Agents (12)</b></summary>

| Agent | Purpose |
|-------|---------|
| adr-architect | Architecture Decision Records |
| claims-authorizer | Claims-based authorization |
| collective-intelligence-coordinator | Hive-mind consensus |
| ddd-domain-expert | Domain modeling |
| memory-specialist | Memory optimization |
| performance-engineer | Performance profiling |
| reasoningbank-learner | Pattern learning |
| security-architect | Security design |
| security-auditor | Security auditing |
| sparc-orchestrator | SPARC methodology |
| swarm-memory-manager | Distributed memory |
| v3-integration-architect | V3 integration |

</details>

---

## 💻 V3 Usage Examples

### Example 1: Queen-Coordinated Quality Pipeline

```bash
claude "Use v3-qe-queen-coordinator to run full quality assessment:
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
claude "Use v3-qe-test-architect to create tests for PaymentService with:
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
claude "Use v3-qe-tdd-specialist to implement UserAuthentication with full RED-GREEN-REFACTOR cycle"
```

**Workflow:**
1. **v3-qe-tdd-red**: Writes failing tests defining behavior
2. **v3-qe-tdd-green**: Implements minimal code to pass
3. **v3-qe-tdd-refactor**: Improves code quality
4. **v3-qe-code-reviewer**: Validates standards
5. **v3-qe-security-reviewer**: Checks security concerns

### Example 4: Cross-Domain Coordination

```bash
claude "Coordinate security audit across the monorepo:
- v3-qe-security-scanner for SAST/DAST
- v3-qe-dependency-mapper for vulnerability scanning
- v3-qe-contract-validator for API security
- v3-qe-chaos-engineer for resilience testing"
```

---

## 🎓 46+ QE Skills

V3 agents automatically apply relevant skills from the comprehensive skill library:

<details>
<summary><b>View All Skills</b></summary>

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
- **swarm-orchestration** - Multi-agent coordination patterns
- **hive-mind-advanced** - Queen-led hierarchical coordination

</details>

---

## 🔄 V2 to V3 Migration

V3 provides automatic backward compatibility with V2:

```bash
# Check migration status
aqe-v3 migrate status

# Run migration with backup
aqe-v3 migrate run --backup

# Validate migration
aqe-v3 migrate validate
```

**What gets migrated:**
- ✅ Memory data (SQLite → AgentDB with HNSW indexing)
- ✅ Configuration files
- ✅ Learned patterns (→ ReasoningBank)
- ✅ Agent mappings (V2 names → V3 equivalents)

| V2 Agent | V3 Agent |
|----------|----------|
| qe-test-generator | v3-qe-test-architect |
| qe-coverage-analyzer | v3-qe-coverage-specialist |
| qe-quality-gate | v3-qe-quality-gate |
| qe-security-scanner | v3-qe-security-scanner |
| qe-coordinator | v3-qe-queen-coordinator |

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
aqe-v3 init --auto
```

---

## 📖 Documentation

### V3 Guides
- [V3 Migration Guide](docs/plans/V2-TO-V3-MIGRATION-PLAN.md) - Complete migration instructions
- [V3 CLI Reference](docs/guides/V3-CLI-REFERENCE.md) - All V3 commands
- [DDD Architecture](docs/architecture/DDD-ARCHITECTURE.md) - Domain-driven design overview

### V2 Documentation (Still Valid)
- [V2 README](docs/V2-README.md) - Complete V2 documentation
- [Quick Start Guide](docs/AQE-CLI.md) - V2 quick start
- [User Guide](docs/USER-GUIDE.md) - V2 workflows and examples

### Feature Guides
- [Learning System Guide](docs/guides/LEARNING-SYSTEM-USER-GUIDE.md) - ReasoningBank learning
- [Pattern Management Guide](docs/guides/PATTERN-MANAGEMENT-USER-GUIDE.md) - Cross-project patterns
- [MCP Integration](docs/guides/MCP-INTEGRATION.md) - Claude Code integration

### Testing Guides
- [Test Generation](docs/guides/TEST-GENERATION.md) - AI-powered test creation
- [Coverage Analysis](docs/guides/COVERAGE-ANALYSIS.md) - O(log n) gap detection
- [Quality Gates](docs/guides/QUALITY-GATES.md) - Intelligent validation

---

## 📊 V3 Architecture

```
agentic-qe/
├── v3/                      # V3 DDD Implementation
│   ├── src/
│   │   ├── kernel/          # Shared kernel
│   │   ├── domains/         # 12 bounded contexts
│   │   │   ├── test-generation/
│   │   │   ├── coverage-analysis/
│   │   │   ├── quality-assessment/
│   │   │   └── ...
│   │   ├── routing/         # Agent routing & registry
│   │   ├── mcp/             # MCP server
│   │   └── cli/             # V3 CLI
│   └── tests/               # 1171+ tests
├── src/                     # V2 Implementation
├── .claude/
│   ├── agents/v3/           # 59 V3 agent definitions
│   └── skills/              # 46+ skill definitions
└── docs/                    # Documentation
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
