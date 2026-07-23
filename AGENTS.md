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
