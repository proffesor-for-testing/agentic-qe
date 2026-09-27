# Agentic QE Contributor Instructions

## Scope

These instructions apply to the entire repository. A more deeply nested
`AGENTS.md` may add or override instructions for its subtree.

Agentic QE is a TypeScript/Node.js quality-engineering platform. Product code
lives in `src/`, tests in `tests/`, scripts in `scripts/`, documentation in
`docs/`, and configuration in `config/`.

## Safety and Data Protection

- Never commit secrets, credentials, `.env` files, or generated sensitive data.
- Treat `.agentic-qe/memory.db` and every learning database as production data.
- Never overwrite, recreate, delete, consolidate, or migrate a database without
  explicit user approval.
- Test database fixes against a copy. Before an approved database operation,
  create a timestamped backup; afterward, verify SQLite integrity and relevant
  row counts.
- Do not modify production adapters or published-package behavior beyond the
  user-approved scope. Explain material production impact before applying a
  high-risk change.

## Project Boundaries

- Keep source changes in `src/`, tests in `tests/`, utilities in `scripts/`,
  docs in `docs/`, and configuration in `config/` unless an existing project
  convention requires another location.
- Follow the existing domain-driven bounded contexts and event-based state
  patterns.
- Use typed interfaces for public APIs and validate input at system boundaries.
- Prefer focused files under 500 lines.
- Do not add `ruflo` as a runtime dependency or call its CLI/MCP from shipped
  product code. It is development-time coordination tooling only.

## AQE Agents and Skills

- Distinguish AQE/QE assets from Claude Flow platform assets.
- Shipped QE agents are `.claude/agents/v3/qe-*.md`. Non-`qe-` definitions in
  that directory are project or platform agents and are not part of the shipped
  AQE fleet.
- `assets/agents/v3/` must contain only shipped `qe-*.md` agents.
- AQE skills live under `.claude/skills/`, excluding platform infrastructure
  families such as `v3-*`, `flow-nexus-*`, `agentdb-*`, `reasoningbank-*`, and
  `swarm-*`, unless the task explicitly targets platform skills.
- Preserve memory namespace strings such as `aqe/v3/domains/*`; they are
  database identifiers, not filesystem paths.
- After changing shipped agents or skills, run the relevant parity and sync
  checks described below.

## Implementation Workflow

- Read a file before editing it and preserve unrelated user changes.
- For bugs, reproduce the reported behavior before patching and search the
  repository for every instance of the faulty pattern.
- Prefer London-school, mock-first TDD for new behavior when it fits the
  surrounding tests.
- Add or update focused tests for behavior changes.
- CLI and MCP paths can diverge. A change affecting one must be checked against
  the other when the same capability is exposed through both.
- Never claim a fix or migration succeeded without reporting the actual
  verification command and result.

## Commands

Use the narrowest relevant checks first:

```bash
npm run typecheck
npm run lint
npm run test:unit:fast
npm run test:unit:mcp
npm run test:integration:fast
```

For full validation when the scope warrants it:

```bash
npm run build
npm run test:ci
npm run verify:invariants
npm run verify:skill-parity
npm run verify:conservation
npm run sync:agents:check
```

Agent/skill-specific checks:

```bash
npm run verify:agent-skills
npm run verify:counts
npm run skills:validate-tier3
```

Browser and PostgreSQL integration tests require their documented external
services and should be run only when relevant.

## Release and Git Rules

- Use Conventional Commits when the user asks for a commit.
- Do not commit, push, publish, tag, create a release, or alter a pull request
  unless the user explicitly requests it.
- Treat `package.json` as the package-version source of truth, but search for
  all hard-coded versions before a version change.
- Production releases are created from merged `main` through
  `.github/workflows/npm-publish.yml`; never publish production packages
  locally.
- Keep pull-request descriptions outcome-focused and include verification
  evidence.

---

<!-- BEGIN AGENTIC-QE PRIME-AGENT -->
# Quality Engineering Standards (Agentic QE — Prime Agent)

This project uses Agentic QE for AI-powered quality engineering. AQE ships
skills under `.prime/agent/skills/` (Agent Skills standard) and a fleet of QE
subagent roles under `.prime/agent/skills/aqe-fleet/`.

## AQE MCP server

The AQE MCP server is registered at the user level, not in the repo (Prime
Agent ignores project MCP settings for execution). If it is not yet connected,
run the command reported by `aqe init` once (one registration per project; a
second project reuses the name with `--force` or its own server name):

    prime-agent mcp add aqe --cwd <this project root> -- npx -y agentic-qe@latest mcp

Always call `fleet_init` before using other AQE tools to initialize the fleet.

## Working rules

1. Prefer the installed AQE skills (aqe-plan-quality, aqe-plan-work,
   aqe-research, aqe-review-quality, aqe-test-change) for QE planning and
   review tasks.
2. Spawn aqe-fleet subagent roles for focused audits (coverage, flakiness,
   security, defect prediction, root cause, impact).
3. Test pyramid: 70% unit, 20% integration, 10% e2e; AAA pattern.
4. `quality_assess` before marking tasks complete; `security_scan_comprehensive`
   after changes to auth, security, or middleware code.
5. `memory_query` before starting work; `memory_store` successful patterns
   after task completion.
<!-- END AGENTIC-QE PRIME-AGENT -->

---

<!-- BEGIN AGENTIC-QE CODEX -->
# Quality Engineering Standards (Agentic QE)

## AQE MCP Server

This project uses Agentic QE for AI-powered quality engineering. The AQE MCP server provides tools for test generation, coverage analysis, quality assessment, and learning.

## Setup

Always call `fleet_init` before using other AQE tools to initialize the QE fleet.

## Available Tools

### Test Generation
- `test_generate_enhanced` — AI-powered test generation with pattern recognition and anti-pattern detection
- Supports unit, integration, and e2e test types

### Coverage Analysis
- `coverage_analyze_sublinear` — O(log n) coverage gap detection with ML-powered analysis
- Target: 80% statement coverage minimum, focus on risk-weighted coverage

### Quality Assessment
- `quality_assess` — Quality gate evaluation with configurable thresholds
- Run before marking tasks complete

### Security Scanning
- `security_scan_comprehensive` — SAST/DAST vulnerability scanning
- Run after changes to auth, security, or middleware code

### Defect Prediction
- `defect_predict` — AI analysis of code complexity and change history

### Learning & Memory
- `memory_store` — Store patterns and learnings for future reference
- `memory_query` — Query past patterns before starting work
- Always store successful patterns after task completion

## Best Practices

1. **Test Pyramid**: 70% unit, 20% integration, 10% e2e
2. **AAA Pattern**: Arrange-Act-Assert for clear test structure
3. **One assertion per test**: Test one behavior at a time
4. **Descriptive names**: `should_returnValue_when_condition`
5. **Mock at boundaries**: Only mock external dependencies
6. **Edge cases first**: Test boundary conditions, not just happy paths
<!-- END AGENTIC-QE CODEX -->
