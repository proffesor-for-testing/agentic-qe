# AQE OpenCode Integration Guide

> Version: 1.0.0
> Last Updated: 2026-02-24
> Status: Production-ready

## Quick Start

### 1. Install AQE

```bash
npm install -g agentic-qe
# or use npx
npx agentic-qe init --wizard
```

### 2. Add MCP Server to OpenCode

Add the AQE MCP server to your `opencode.json`:

```json
{
  "mcp": {
    "agentic-qe": {
      "type": "local",
      "command": "npx",
      "args": ["agentic-qe", "mcp"],
      "env": {
        "AQE_MEMORY_PATH": ".agentic-qe/memory.db",
        "AQE_V3_MODE": "true",
        "AQE_V3_HNSW_ENABLED": "true"
      }
    }
  }
}
```

For SSE transport (remote deployment):

```json
{
  "mcp": {
    "agentic-qe-sse": {
      "type": "sse",
      "url": "http://localhost:3100/sse",
      "env": {
        "AQE_V3_MODE": "true"
      }
    }
  }
}
```

### 3. Copy Agent and Skill Configs

```bash
cp -r .opencode/agents/ ~/.opencode/agents/
cp -r .opencode/skills/ ~/.opencode/skills/
cp .opencode/permissions.yaml ~/.opencode/permissions.yaml
```

## Configuration

### MCP Server Options

| Option | Description | Default |
|---|---|---|
| `AQE_MEMORY_PATH` | Path to SQLite memory database | `.agentic-qe/memory.db` |
| `AQE_V3_MODE` | Enable v3 architecture | `true` |
| `AQE_V3_HNSW_ENABLED` | Enable HNSW vector search | `true` |
| `AQE_MAX_AGENTS` | Maximum concurrent agents | `15` |
| `AQE_TOPOLOGY` | Swarm topology | `hierarchical` |

### Plugin Hooks

AQE integrates with OpenCode's lifecycle through hooks:

- **SessionStart**: Initializes learning patterns, loads memory
- **PostTask**: Captures experience for dream cycle learning
- **SessionEnd**: Persists session knowledge

### Agent Selection

Agents are auto-selected based on task type. Override with explicit agent references in your prompts or use the `model_route` MCP tool for tier-aware routing.

## Available Agents

| Agent | Description | Model Tier |
|---|---|---|
| `qe-test-architect` | AI-powered test generation with pattern recognition | tier3-best |
| `qe-tdd-specialist` | TDD Red-Green-Refactor workflow guidance | tier2-good |
| `qe-coverage-analyst` | O(log n) sublinear coverage gap detection | tier2-good |
| `qe-security-scanner` | SAST/DAST security vulnerability scanning | tier3-best |
| `qe-defect-predictor` | ML-powered defect prediction from code metrics | tier3-best |
| `qe-code-reviewer` | Context-driven code review with quality scoring | tier2-good |
| `qe-debugger` | Hypothesis-driven autonomous debugging | tier3-best |
| `qe-performance-engineer` | Performance testing and bottleneck analysis | tier2-good |
| `qe-api-tester` | API contract testing and endpoint validation | tier2-good |
| `qe-accessibility-auditor` | WCAG 2.1/2.2 accessibility testing | tier2-good |

## Available Skills

### Quality Engineering Core

| Skill | Description | Tier |
|---|---|---|
| `qe-test-design-techniques` | Boundary value, equivalence partitioning, pairwise | tier2-good |
| `qe-tdd-london-chicago` | London (mock-based) and Chicago (state-based) TDD | tier2-good |
| `qe-debug-loop` | Hypothesis-driven autonomous debugging loop | tier3-best |
| `qe-regression-testing` | Regression risk analysis and test selection | tier2-good |
| `qe-mutation-testing` | Mutation testing for test suite effectiveness | tier3-best |

### Security & Compliance

| Skill | Description | Tier |
|---|---|---|
| `qe-security-testing` | OWASP Top 10 vulnerability testing | tier3-best |
| `qe-compliance-testing` | GDPR, HIPAA, SOC2 compliance checks | tier1-any |
| `qe-accessibility-testing` | WCAG automated accessibility audits | tier2-good |

### Analysis & Reporting

| Skill | Description | Tier |
|---|---|---|
| `qe-code-review-quality` | Context-driven code review | tier2-good |
| `qe-risk-based-testing` | Risk-based test prioritization | tier2-good |
| `qe-performance-testing` | Load, stress, and endurance testing | tier2-good |
| `qe-exploratory-testing-advanced` | Charter-based exploratory testing | tier2-good |

### API & Contract Testing

| Skill | Description | Tier |
|---|---|---|
| `qe-api-testing-patterns` | REST/GraphQL API test patterns | tier2-good |
| `qe-contract-testing` | Consumer-driven contract testing | tier2-good |
| `qe-chaos-engineering-resilience` | Chaos engineering resilience testing | tier3-best |

### QCSD Workflow (Swarm)

| Skill | Phase | Description |
|---|---|---|
| `qcsd-ideation` | Ideation | Quality criteria sessions with HTSM v6.3 and Risk Storming |
| `qcsd-refinement` | Refinement | SFDIPOT product factors and BDD scenario generation |
| `qcsd-development` | Development | TDD adherence, complexity analysis, coverage gaps |
| `qcsd-cicd` | Verification | Regression analysis, flaky detection, quality gates |
| `qcsd-production` | Production | DORA metrics, RCA, cross-phase feedback loops |

## Custom Composite Tools

AQE registers 40+ MCP tools. Key composite tools for common workflows:

| Tool | Description | Use Case |
|---|---|---|
| `task_orchestrate` | Multi-agent task orchestration | Complex QE workflows spanning multiple domains |
| `test_generate_enhanced` | AI-powered test generation | Generate unit/integration/e2e tests with pattern recognition |
| `coverage_analyze_sublinear` | O(log n) coverage analysis | Fast coverage gap detection for large codebases |
| `security_scan_comprehensive` | Combined SAST+DAST scanning | Pre-deployment security validation |
| `defect_predict` | ML defect prediction | Identify high-risk code areas before they become bugs |

## Provider Compatibility

AQE uses a 3-tier model classification for graceful degradation:

- **tier1-any**: Any model works (formatting, checklists, data management)
- **tier2-good**: Needs decent reasoning (test generation, code review, coverage)
- **tier3-best**: Needs advanced reasoning (security, mutation testing, QCSD swarms)

See [Provider Capability Matrix](provider-capability-matrix.md) for full provider-to-tier mapping.

### Degradation Behavior

| Behavior | Description |
|---|---|
| `warn` | Skill runs with a quality warning |
| `block` | Skill is blocked (security-critical skills) |
| `use-fallback` | Automatically falls back to a simpler skill |

## QCSD Workflow

The Quality Criteria-driven Software Development (QCSD) workflow runs as a 4-phase quality swarm:

1. **Ideation** → Quality criteria analysis, risk storming, testability scoring
2. **Refinement** → SFDIPOT product factors, BDD scenario generation, requirements validation
3. **Development** → TDD adherence, complexity analysis, coverage gap detection, defect prediction
4. **Verification (CI/CD)** → Regression analysis, flaky test detection, quality gates, deployment readiness
5. **Production** → DORA metrics, root cause analysis, feedback loops to Ideation

Each phase consumes outputs from the previous phase via shared memory, creating a continuous quality feedback loop.

## Troubleshooting

### Cold Start Latency

The first MCP tool invocation may take 2-5 seconds as the server initializes memory, loads patterns, and sets up HNSW indexes.

**Mitigation**: Run `npx agentic-qe mcp` as a background process, or use the `SessionStart` hook to pre-warm.

### Token Limit Exceeded

Large tool outputs (coverage reports, security scans) may exceed OpenCode's context budget.

**Mitigation**: AQE automatically compacts outputs to stay under 35k tokens. If you see truncated results, use `memory_store` to save the full report and `memory_retrieve` to fetch specific sections.

### Provider Degradation

If your model provider doesn't meet the minimum tier for a skill, AQE will:
1. **Warn** for most skills (reduced quality but functional)
2. **Block** for security-critical skills
3. **Fallback** to a simpler skill where configured

Check `model_route` tool to see tier recommendations for your current provider.

### Memory Database Issues

If the memory database becomes corrupted:

```bash
# Backup first
cp .agentic-qe/memory.db .agentic-qe/memory.db.bak

# Remove stale WAL/SHM files
rm -f .agentic-qe/memory.db-wal .agentic-qe/memory.db-shm

# Verify integrity
sqlite3 .agentic-qe/memory.db "PRAGMA integrity_check;"
```

### Connection Issues (SSE/WebSocket)

For remote MCP server connections:

```bash
# Test SSE endpoint
curl http://localhost:3100/sse

# Test WebSocket endpoint
wscat -c ws://localhost:3100/ws
```

Verify `AQE_V3_MODE=true` is set in the environment.
