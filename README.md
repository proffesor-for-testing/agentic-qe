# Agentic Quality Engineering Fleet

<div align="center">

[![npm version](https://img.shields.io/npm/v/agentic-qe.svg)](https://www.npmjs.com/package/agentic-qe)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![Monthly Downloads](https://img.shields.io/npm/dm/agentic-qe)](https://www.npmjs.com/package/agentic-qe)
[![Total Downloads](https://img.shields.io/npm/dt/agentic-qe?label=total%20downloads)](https://www.npmjs.com/package/agentic-qe)

[Release Notes](docs/releases/README.md) | [Changelog](CHANGELOG.md) | [Issues](https://github.com/proffesor-for-testing/agentic-qe/issues) | [Discussions](https://github.com/proffesor-for-testing/agentic-qe/discussions)

**AI-powered quality engineering agents that generate tests, find coverage gaps, detect flaky tests, and learn your codebase patterns — across 11 coding agent platforms.**

</div>

---

## What AQE Does For You

- **Generates comprehensive tests automatically** — unit, integration, property-based, and BDD scenarios for your codebase with framework-specific output (Jest, Vitest, Playwright, Cypress, pytest, JUnit, Go, Rust, Swift, Flutter, and more)
- **Finds coverage gaps and prioritizes what to test** — risk-weighted analysis identifies the most impactful untested code paths
- **Detects and fixes flaky tests** — ML-powered detection with root cause analysis and stabilization recommendations
- **Learns your codebase patterns over time** — remembered patterns are reused across sessions and projects, improving with every interaction
- **Coordinates 60 specialized QE agents** — from test generation to security scanning to chaos engineering, orchestrated by a central coordinator
- **Reduces AI costs with intelligent routing** — automatically routes tasks to the right model tier (fast/cheap for simple tasks, powerful for complex ones)
- **Works with your existing tools** — integrates with 11 coding agent platforms and your existing CI/CD pipeline

---

## Quick Start

```bash
# Install
npm install -g agentic-qe

# Initialize your project (auto-detects tech stack, configures MCP)
cd your-project && aqe init --auto

# That's it — MCP tools are available immediately in Claude Code
# For other clients: aqe-mcp
```

After init, your coding agent can use AQE tools directly. For example in Claude Code:

```
"Generate tests for src/services/UserService.ts with 90% coverage target"
"Find coverage gaps in src/ and prioritize by risk"
"Run security scan on the authentication module"
"Analyze why tests in auth/ are flaky and suggest fixes"
```

---

## Platform Support

AQE works with **11 coding agent platforms** through a single MCP server:

| Platform | Setup |
|----------|-------|
| **Claude Code** | `aqe init --auto` (built-in) |
| **GitHub Copilot** | `aqe init --auto --with-copilot` |
| **Cursor** | `aqe init --auto --with-cursor` |
| **Cline** | `aqe init --auto --with-cline` |
| **OpenCode** | `aqe init --auto --with-opencode` |
| **AWS Kiro** | `aqe init --auto --with-kiro` |
| **Kilo Code** | `aqe init --auto --with-kilocode` |
| **Roo Code** | `aqe init --auto --with-roocode` |
| **OpenAI Codex CLI** | `aqe init --auto --with-codex` |
| **Windsurf** | `aqe init --auto --with-windsurf` |
| **Continue.dev** | `aqe init --auto --with-continuedev` |

```bash
# Set up all platforms at once
aqe init --auto --with-all-platforms

# Or add a platform later
aqe platform setup cursor
aqe platform list       # show install status
aqe platform verify cursor  # validate config
```

For detailed per-platform instructions, see [Platform Setup Guide](docs/platform-setup-guide.md).

---

## Usage Examples

### Generate Tests

```bash
claude "Use qe-test-architect to create tests for PaymentService with 95% coverage target"
```

Output:
```
Generated 48 tests across 4 files
- unit/PaymentService.test.ts (32 unit tests)
- property/PaymentValidation.property.test.ts (8 property tests)
- integration/PaymentFlow.integration.test.ts (8 integration tests)
Coverage: 96.2%
Pattern reuse: 78% from learned patterns
```

### Full Quality Pipeline

```bash
claude "Use qe-queen-coordinator to run full quality assessment:
1. Generate tests for src/services/*.ts
2. Analyze coverage gaps with risk scoring
3. Run security scan
4. Validate quality gate at 90% threshold
5. Provide deployment recommendation"
```

The Queen Coordinator spawns domain-specific agents, runs them in parallel, and synthesizes a final recommendation.

### TDD Workflow

```bash
claude "Use qe-tdd-specialist to implement UserAuthentication with full RED-GREEN-REFACTOR cycle"
```

Coordinates 5 subagents: write failing tests → implement minimal code → refactor → code review → security review.

### Security Audit

```bash
claude "Coordinate security audit:
- SAST/DAST scanning with qe-security-scanner
- Dependency vulnerability scanning with qe-dependency-mapper
- API security with qe-contract-validator
- Chaos resilience testing with qe-chaos-engineer"
```

---

## 60 QE Agents

The fleet is organized into **13 domains**, coordinated by the **qe-queen-coordinator**:

| Domain | Agents | What They Do |
|--------|--------|-------------|
| **Test Generation** | test-architect, tdd-specialist, mutation-tester, property-tester | Generate tests, TDD workflows, validate test effectiveness |
| **Test Execution** | parallel-executor, retry-handler, integration-tester | Run tests in parallel, handle retries, integration testing |
| **Coverage Analysis** | coverage-specialist, gap-detector | Find untested code, prioritize by risk |
| **Quality Assessment** | quality-gate, risk-assessor, deployment-advisor, devils-advocate | Go/no-go decisions, risk scoring, adversarial review |
| **Defect Intelligence** | defect-predictor, root-cause-analyzer, flaky-hunter, regression-analyzer | Predict bugs, find root causes, fix flaky tests |
| **Requirements** | requirements-validator, bdd-generator | Validate testability, generate BDD scenarios |
| **Code Intelligence** | code-intelligence, kg-builder, dependency-mapper, impact-analyzer | Knowledge graphs, semantic search, change impact |
| **Security** | security-scanner, security-auditor, pentest-validator | SAST/DAST, compliance audits, exploit validation |
| **Contracts** | contract-validator, graphql-tester | API contracts, GraphQL schema testing |
| **Visual & A11y** | visual-tester, accessibility-auditor, responsive-tester | Visual regression, WCAG compliance, viewport testing |
| **Chaos & Performance** | chaos-engineer, load-tester, performance-tester | Fault injection, load testing, performance validation |
| **Learning** | learning-coordinator, pattern-learner, transfer-specialist, metrics-optimizer | Cross-project learning, pattern discovery |
| **Enterprise** | soap-tester, sap-rfc-tester, sap-idoc-tester, sod-analyzer, odata-contract-tester, middleware-validator, message-broker-tester | SAP, SOAP, ESB, OData, JMS/AMQP/Kafka |

Plus **7 TDD subagents** (red, green, refactor, code/integration/performance/security reviewers) and the **fleet-commander** for large-scale orchestration.

---

## 78 QE Skills

Agents automatically apply relevant skills from the skill library. Skills are rated by **trust tier**:

| Tier | Count | Meaning |
|------|-------|---------|
| **Tier 3 — Verified** | 46 | Full evaluation test suite, production-ready |
| **Tier 2 — Validated** | 7 | Has executable validator |
| **Tier 1 — Structured** | 5 | Has JSON output schema |
| **Tier 0 — Advisory** | 5 | Guidance only |

<details>
<summary><b>View all 78 skills</b></summary>

**Core Testing (12):** agentic-quality-engineering, holistic-testing-pact, context-driven-testing, tdd-london-chicago, xp-practices, risk-based-testing, test-automation-strategy, refactoring-patterns, shift-left-testing, shift-right-testing, regression-testing, verification-quality

**Specialized Testing (13):** accessibility-testing, mobile-testing, database-testing, contract-testing, chaos-engineering-resilience, visual-testing-advanced, security-visual-testing, compliance-testing, compatibility-testing, localization-testing, mutation-testing, performance-testing, security-testing

**Domain Skills (14):** qe-test-generation, qe-test-execution, qe-coverage-analysis, qe-quality-assessment, qe-defect-intelligence, qe-requirements-validation, qe-code-intelligence, qe-security-compliance, qe-contract-testing, qe-visual-accessibility, qe-chaos-resilience, qe-learning-optimization, qe-iterative-loop, aqe-v2-v3-migration

**Strategic (8):** six-thinking-hats, brutal-honesty-review, sherlock-review, cicd-pipeline-qe-orchestrator, bug-reporting-excellence, consultancy-practices, quality-metrics, pair-programming

**Testing Techniques (9):** exploratory-testing-advanced, test-design-techniques, test-data-management, test-environment-management, test-reporting-analytics, testability-scoring, technical-writing, code-review-quality, api-testing-patterns

**n8n Workflow Testing (5):** n8n-workflow-testing-fundamentals, n8n-expression-testing, n8n-security-testing, n8n-trigger-testing-strategies, n8n-integration-testing-patterns

**QCSD Swarms (5):** qcsd-ideation-swarm, qcsd-refinement-swarm, qcsd-development-swarm, qcsd-cicd-swarm, qcsd-production-swarm

**Accessibility (2):** a11y-ally, accessibility-testing

**Enterprise Integration (5):** enterprise-integration-testing, middleware-testing-patterns, observability-testing-patterns, wms-testing-patterns, pentest-validation

</details>

---

## How It Works

### Agent Coordination

The **Queen Coordinator** orchestrates agents across all 13 domains. When you ask for a quality assessment, the Queen decomposes the task, spawns the right agents, coordinates their work in parallel, and synthesizes results. Agents communicate through shared memory namespaces and use consensus protocols for critical quality decisions.

### Pattern Learning

AQE learns from every interaction. Successful test patterns, coverage strategies, and defect indicators are stored and indexed for fast retrieval. When generating tests for a new service, AQE searches for similar patterns from past sessions — even across different projects. Patterns improve over time through experience replay and dream cycles (background consolidation).

```bash
aqe learning stats      # view learning statistics
aqe learning dream      # trigger pattern consolidation
aqe brain export        # export learned patterns for sharing
```

### Intelligent Model Routing

**TinyDancer** routes tasks to the right model tier to minimize cost without sacrificing quality:

| Task Complexity | Model | Examples |
|----------------|-------|---------|
| Simple (0-20) | Haiku | Type additions, simple refactors |
| Moderate (20-70) | Sonnet | Bug fixes, test generation |
| Critical (70+) | Opus | Architecture, security, complex reasoning |

### Quality Gates

Anti-sycophancy scoring catches hollow tests. Tautological assertions (`expect(true).toBe(true)`) are rejected. Edge cases from historical patterns are injected into test generation. See [Loki-mode features](docs/loki-mode-features.md).

---

## CLI Reference

```bash
aqe init [--auto]              # Initialize project
aqe agent list                 # List available agents
aqe fleet status               # Fleet health and coordination
aqe learning stats             # Learning statistics
aqe learning dream             # Trigger dream cycle
aqe brain export/import        # Portable intelligence
aqe platform list/setup/verify # Manage coding agent platforms
aqe health                     # System health check
```

---

## LLM Providers

| Provider | Type | Cost | Best For |
|----------|------|------|----------|
| **Ollama** | Local | Free | Privacy, offline |
| **OpenRouter** | Cloud | Varies | 300+ models |
| **Groq** | Cloud | Free | High-speed |
| **Claude API** | Cloud | Paid | Highest quality |
| **Google AI** | Cloud | Free | Gemini models |

```bash
export GROQ_API_KEY="gsk_..."  # or any supported provider
aqe init --auto
```

---

## V2 to V3 Migration

```bash
aqe migrate status    # check migration status
aqe migrate run --backup  # migrate with backup
aqe migrate verify    # verify migration
```

All V2 agents map to V3 equivalents automatically. Memory, configuration, and learned patterns are migrated.

---

## Documentation

| Guide | Description |
|-------|-------------|
| [Platform Setup](docs/platform-setup-guide.md) | Per-platform configuration instructions |
| [Skill Validation](docs/guides/skill-validation.md) | Trust tiers and evaluation system |
| [Learning System](docs/guides/reasoningbank-learning-system.md) | ReasoningBank pattern learning |
| [Code Intelligence](docs/guides/fleet-code-intelligence-integration.md) | Knowledge graph and semantic search |
| [Loki-mode Features](docs/loki-mode-features.md) | Anti-sycophancy and quality gates |
| [Release Notes](docs/releases/README.md) | Version history and changelogs |
| [Architecture Glossary](docs/v3-technical-architecture-glossary.md) | Technical terms and concepts |

---

## Development

```bash
git clone https://github.com/proffesor-for-testing/agentic-qe.git
cd agentic-qe
npm install
npm run build
npm test -- --run
```

| Script | Description |
|--------|-------------|
| `npm run build` | Compile TypeScript + CLI + MCP bundles |
| `npm test -- --run` | Run all tests |
| `npm run cli` | Run CLI in dev mode |
| `npm run mcp` | Start MCP server |

---

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details.

---

## Support

- **Documentation**: [docs/](docs/)
- **Issues**: [GitHub Issues](https://github.com/proffesor-for-testing/agentic-qe/issues)
- **Discussions**: [GitHub Discussions](https://github.com/proffesor-for-testing/agentic-qe/discussions)

---

## License

MIT — see [LICENSE](LICENSE).

---

## Contributors

<!-- ALL-CONTRIBUTORS-LIST:START -->
| <img src="https://github.com/proffesor-for-testing.png" width="60" style="border-radius:50%"/><br/>**[@proffesor-for-testing](https://github.com/proffesor-for-testing)**<br/>Project Lead | <img src="https://github.com/fndlalit.png" width="60" style="border-radius:50%"/><br/>**[@fndlalit](https://github.com/fndlalit)**<br/>QX Partner, Testability | <img src="https://github.com/shaal.png" width="60" style="border-radius:50%"/><br/>**[@shaal](https://github.com/shaal)**<br/>Core Development | <img src="https://github.com/mondweep.png" width="60" style="border-radius:50%"/><br/>**[@mondweep](https://github.com/mondweep)**<br/>Architecture |
|:---:|:---:|:---:|:---:|
<!-- ALL-CONTRIBUTORS-LIST:END -->

[View all contributors](CONTRIBUTORS.md) | [Become a contributor](CONTRIBUTING.md)

---

## Support the Project

If you find AQE valuable, consider supporting its development:

| | Monthly | Annual (Save $10) |
|---|:---:|:---:|
| **Price** | $5/month | $50/year |
| **Subscribe** | [**Monthly**](https://www.paypal.com/webapps/billing/plans/subscribe?plan_id=P-88G03706DU8150205NEYZZAY) | [**Annual**](https://www.paypal.com/webapps/billing/plans/subscribe?plan_id=P-39189175UE6623540NEYZ2CI) |

[View sponsorship details](FUNDING.md)

---

## Acknowledgments

- **[Claude Flow](https://github.com/ruvnet/claude-flow)** by [@ruvnet](https://github.com/ruvnet) — Multi-agent orchestration and MCP integration
- **[Agentic Flow](https://github.com/ruvnet/agentic-flow)** by [@ruvnet](https://github.com/ruvnet) — Agent patterns and learning systems
- Built with TypeScript, Node.js, and better-sqlite3
- Compatible with Jest, Cypress, Playwright, Vitest, Mocha, pytest, JUnit, and more

---

<div align="center">

**Made with care by the Agentic QE Team**

[Star us on GitHub](https://github.com/proffesor-for-testing/agentic-qe) | [Sponsor](FUNDING.md) | [Contributors](CONTRIBUTORS.md)

</div>
