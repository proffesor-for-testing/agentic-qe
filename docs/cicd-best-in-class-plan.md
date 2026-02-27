# AQE Fleet CI/CD Integration — Best in Class Plan

**Date:** February 26, 2026
**Status:** Active
**Related:** Issue #47, Issue #50, docs/cicd-agentic-workflows-report.md

---

## Context

### Research Inputs
1. **Issue #47** — Original Jujutsu VCS proposal (scored 23% in brutal-honesty review)
2. **CI/CD Landscape Research** (Feb 25, 2026) — Dagger, GitHub Actions Agentic Workflows, Superplane, Buildkite MCP, GitLab Duo evaluated
3. **agentic-jujutsu v2.3.6** — Embedded jj via N-API, MCP server (3 tools), ReasoningBank, QuantumDAG. Last updated Nov 2025 (3 months stale)
4. **AQE Fleet Current State** — 102 agents, 78 QE skills, 21+ CLI commands, 31+ MCP tools, 10 GitHub workflows, 150K+ learning records

### Six Thinking Hats Summary
- **White (Facts):** AQE already has mature CLI, MCP server, and CI workflows. Gap is output format standardization
- **Red (Feelings):** MCP convergence is exciting; Jujutsu stale package is concerning
- **Black (Risks):** agentic-jujutsu abandonment, unverified perf claims, over-engineering before PMF
- **Yellow (Strengths):** 150K learning records + 102 agents = unique moat. CLI is universal CI interface
- **Green (Ideas):** CLI-first CI-native outputs, self-healing pipeline agent, Dagger modules, layered VCS
- **Blue (Decision):** CLI-first, format-rich, zero special integration needed

---

## Strategic Decision

**CLI-first, format-rich, platform-agnostic.**

The differentiator is that `aqe security --format sarif` runs in ANY pipeline and brings 150K learned patterns. No special SDK, no MCP requirement, no VCS migration.

---

## Phase 0: CLI/MCP Verification (COMPLETE ✅)

**Date completed:** February 27, 2026

Ran 87 test cases across CLI and MCP. Fixed 17 issues (5 CRIT, 6 HIGH, 6 MEDIUM). All verified.

Key outcomes:
- All MCP tools return real data (no fabricated/empty results)
- Coverage analysis uses heuristic estimation when no instrumented data exists
- Model router correctly assigns tiers based on task complexity
- Quality gate runs synchronously with structured verdict
- Ghost coverage analyzer filters false positives by file type

Full results: `docs/cli-mcp-verification-test-plan.md`
Remaining work: Issue #310

---

## Phase 1: Make Existing CLI Commands CI-Native (Weeks 1-3)

### 1.1 Add `--format` flag to all output-producing commands ✅
- Formats: `text` (default), `json`, `sarif` (security only), `junit` (test only), `markdown`
- Commands: `aqe test`, `aqe coverage`, `aqe security`, `aqe quality`
- Also: `aqe fleet init`, `aqe task status`, `aqe code`
- **Status: DONE** — All 4 core commands support `--format` with text/json/sarif/junit/markdown as applicable

### 1.2 Add `--output <path>` flag for artifact generation ✅
- All commands that produce reports should support writing to file
- Default: stdout. With `--output`, write to file AND print summary to stdout
- **Status: DONE** — All 4 core commands support `--output <path>` via shared `writeOutput()` utility

### 1.3 Configure vitest JUnit XML generation ✅
- Current: workflow uploads `junit.xml` but vitest doesn't generate it
- Fix: Add vitest reporter config for `junit` output
- **Status: DONE** — JUnit reporter added to `vitest.config.ts` (commit 1c0aa55c)

### 1.4 Make `aqe quality assess --gate` synchronous with direct pass/fail ✅
- Current: submits async task, returns task ID, requires polling
- Target: `aqe quality assess --gate` blocks, returns structured verdict with exit code
- Output: criteria breakdown, pass/fail per criterion, overall verdict
- **Status: DONE** — Inline synchronous mode implemented in `quality.ts`. Returns structured JSON with criteria breakdown and exit code 1 on failure.

### 1.5 Add SARIF output to `aqe security` ✅
- For GitHub Code Scanning / GHAS integration
- SARIF v2.1.0 schema compliance
- **Status: DONE** — `toSARIF()` fully implemented in `ci-output.ts`, wired to `aqe security --format sarif`

---

## Phase 2: First-Class CI/CD Config (Weeks 3-5)

### 2.1 Polish `.aqe-ci.yml` schema
- Define phases (test, coverage, security, quality-gate, code-intelligence, custom)
- Phase-specific config (target, framework, threshold, timeout, continue_on_failure)
- Quality gate criteria with thresholds
- Output format defaults for CI

### 2.2 Add `aqe ci run` command
- Reads `.aqe-ci.yml`, executes full pipeline
- Reports per-phase results with proper exit codes
- Generates combined report (all formats)

### 2.3 Publish reusable GitHub Action
- `uses: agentic-qe/action@v3` wrapping CLI commands
- Inputs: command, format, threshold, output-path
- Outputs: pass/fail, report-path, summary

---

## Phase 3: Jujutsu VCS PoC (Weeks 3-5, Parallel)

### 3.1 Measure Git baseline
- Actual VCS overhead in current agent workflows
- Lock contention, conflict rate, ops/sec

### 3.2 Evidence-based PoC per Issue #50
- Fork agentic-jujutsu, upgrade to latest jj
- Extend MCP server with write operations
- Compare against Git baseline with 3 concurrent agents

### 3.3 Decision gate (Week 5)
- If ≥4x validated → plan 8-week full integration
- If <2x → document learnings, stop

---

## What NOT to Do
- Don't build Jujutsu integration before CLI is CI-native (wrong order)
- Don't target Superplane or GH Agentic Workflows until GA
- Don't trust performance claims — measure everything
- Don't touch 150K-record AgentDB without backup + verification

---

## Success Criteria

| Metric | Target |
|--------|--------|
| All CLI commands support `--format json` | 100% |
| Security scan outputs valid SARIF | Schema-validated |
| Test execution generates JUnit XML | Parseable by CI |
| Quality gate returns direct pass/fail | Exit code 0/1, <30s |
| Zero new dependencies added | Confirmed |
| All existing tests still pass | `npm test -- --run` green |
