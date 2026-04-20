# Agent Count Recount — v3.9.13 Honesty Audit Correction

**Date:** 2026-04-20
**Verdict:** The claim "60 specialized QE agents" is **HONEST**. The prior audit undercounted by omitting the 7 subagents under `.claude/agents/v3/subagents/`.

## Methodology

Filesystem enumeration of every `qe-*.md` file shipped in the package, plus verification that the non-QE files in the same tree are platform/project-internal per CLAUDE.md rules. No code-generated agents found; no AgentDB registry file. Non-truncated counts via `ls … | wc -l`.

## Counts by Location

| Location | Count | Shipped? | Note |
|---|---:|---|---|
| `.claude/agents/v3/qe-*.md` (root) | **53** | Yes | Primary QE fleet |
| `.claude/agents/v3/subagents/qe-*.md` | **7** | Yes | TDD + review subagents (frontmatter `type: subagent`) |
| `assets/agents/v3/qe-*.md` | 53 | npm dist | Byte-identical to `.claude/` primary |
| `assets/agents/v3/subagents/qe-*.md` | 7 | npm dist | Byte-identical to `.claude/` subagents |
| `.claude/agents/v3/*.md` (non-qe) | 16 | No | Platform/internal: `security-*`, `sparc-orchestrator`, `v3-integration-architect`, `adr-architect`, `ddd-domain-expert`, `memory-specialist`, `reasoningbank-learner`, `swarm-memory-manager`, `claims-authorizer`, `collective-intelligence-coordinator`, `aidefence-guardian`, `injection-analyst`, `pii-detector`, `performance-engineer` — NOT part of the AQE fleet |
| `.claude/agents/<non-v3>/` | n/a | No | Claude Flow platform topologies (analysis, architecture, consensus, sparc, etc.) |
| `src/agents/` | 0 md | No | TypeScript modules only (`claim-verifier`, `devils-advocate`); not user-facing agent definitions |

**Total shipped QE agents: 53 + 7 = 60.**

## Claim Sources (verified)

- `README.md:25` — "Coordinates **60 specialized QE agents**"
- `README.md:138` — "## 60 QE Agents"
- `README.md:158` — "Plus **7 TDD subagents** (red, green, refactor, code/integration/performance/security reviewers)"
- `package.json:4` — "60 specialized QE agents"
- `docs/implementation/adrs/ADR-093-opus-4-7-migration.md:12,46,98` — "60 qe-* agents"

## Canonical QE Fleet (60)

**53 primary (`.claude/agents/v3/qe-*.md`):** accessibility-auditor, bdd-generator, chaos-engineer, code-complexity, code-intelligence, contract-validator, coverage-specialist, defect-predictor, dependency-mapper, deployment-advisor, devils-advocate, flaky-hunter, fleet-commander, gap-detector, graphql-tester, impact-analyzer, integration-architect, integration-tester, kg-builder, learning-coordinator, load-tester, message-broker-tester, metrics-optimizer, middleware-validator, mutation-tester, odata-contract-tester, parallel-executor, pattern-learner, pentest-validator, performance-tester, product-factors-assessor, property-tester, quality-criteria-recommender, quality-gate, queen-coordinator, qx-partner, regression-analyzer, requirements-validator, responsive-tester, retry-handler, risk-assessor, root-cause-analyzer, sap-idoc-tester, sap-rfc-tester, security-auditor, security-scanner, soap-tester, sod-analyzer, tdd-specialist, test-architect, test-idea-rewriter, transfer-specialist, visual-tester.

**7 subagents (`.claude/agents/v3/subagents/`):** qe-code-reviewer, qe-integration-reviewer, qe-performance-reviewer, qe-security-reviewer, qe-tdd-green, qe-tdd-red, qe-tdd-refactor.

## Verdict

**"60" is accurate.** The prior "repo ships 53" line missed the `subagents/` directory — which is explicitly documented at `README.md:158` and carries `type: subagent` in frontmatter. The honesty audit should be corrected to note 53 + 7 = 60.
