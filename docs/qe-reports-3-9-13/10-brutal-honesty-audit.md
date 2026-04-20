# Brutal Honesty Audit - v3.9.13

**Date**: 2026-04-20
**Auditor**: QE Devil's Advocate (Adversarial Reviewer)
**Previous Honesty Scores**: 82 (v3.7.0) -> 78 (v3.7.10) -> 72 (v3.8.3) -> 68 (v3.8.13)
**Current Honesty Score**: **74/100** (FIRST REVERSAL IN FIVE MEASUREMENTS, +6)
**Methodology**: Every claim verified against actual codebase. Trust nothing. Cite everything.

---

## Executive Summary

v3.9.13 is the first release in five measurements where the honesty score increases. The primary driver is structural: `.github/workflows/npm-publish.yml` now has a mandatory `tests-on-tag-sha` gate AND a `pre-publish-gate` (corpus init fixtures) blocking the publish step (`needs: [build, pre-publish-gate, tests-on-tag-sha]`, L228-237). The v3.9.13 publish run (`databaseId=24578317724`, `headSha=4742c41f`) shows all four jobs — Build and Verify, Pre-publish init gate, Tests on tag SHA, Publish to npm — passed. v3.8.13's most-damaging finding (npm publishes without test verification) is **genuinely fixed**.

But: CLAUDE.md still misstates the database (still says "1K+" despite 16,941 captured_experiences and 468 qe_patterns); claude-3-* and retiring Sonnet 4 model IDs are still referenced in production code 30 times despite ADR-093 being marked "Accepted — Implemented"; the 500-line limit is violated by 446 files (worse than v3.8.13's 442); the "13 bounded contexts" claim in package.json matches the filesystem (13 domain dirs) but the "60 specialized QE agents" claim is contradicted by the repo (53 qe-* files shipped in assets/, not 60 — ADR-093 also claims 60 in its own text); qe-browser evals are a self-admitted "design-spec, NOT yet a runnable automated eval"; console.log outnumbers logger imports at 3,161 vs 1 (ratio now 3,161:1 — arguably worse, the logger import count dropped from 139 last release).

Net: one structural fix of real magnitude (publish gating), and a batch of unfixed claims plus new ones that don't survive contact with grep.

---

## Section 1: Database Reality Check (CLAUDE.md Claim)

### CLAUDE.md Line 24: "1K+ irreplaceable learning records"

**Verdict: STILL MISLEADING — WRONG DIRECTION OF THE SLIDER**

Evidence:
- `.agentic-qe/memory.db` is 53.9MB (Apr 20 09:23).
- `sqlite3 .agentic-qe/memory.db "SELECT COUNT(*) FROM qe_patterns;"` returns **468**, up from 129 at v3.8.13. Recovery from the March corruption event is real but partial.
- Total rows across 52 tables are ~140K now (concept_edges 69,883; captured_experiences 16,941; witness_chain 13,446; dream_insights 7,730; concept_nodes 5,032; kv_store 5,012; qe_trajectories 335; qe_pattern_embeddings 457; routing_outcomes 1,709; embeddings table still 0).
- February backup (`memory-aqe-root-Feb-27-2026.db`) had 15,625 qe_patterns — we are still at 468, a net 97% shortfall.

The prior audit (v3.8.13) challenged the then-current "150K+" CLAUDE.md claim. Someone swung the copy in the opposite direction to "1K+" without correcting the underlying accuracy problem: "1K+" technically now matches (qe_patterns=468 + qe_pattern_usage=268 + qe_trajectories=335 = 1,071) but the phrase still pretends this is a curated corpus rather than a sparse, post-corruption, mostly-auto-generated graph. The corruption event (Mar 19, `memory-corrupted.db` 61MB still sitting beside the live DB) is still undocumented in any commit message or changelog.

**Severity**: HIGH. CLAUDE.md is the primary AI-context document; undercounting by ~100x in one direction after overcounting by ~100x in the other direction signals the number is decoration, not truth.

---

## Section 2: CI Health — THE ONE GENUINE IMPROVEMENT

### 2.1 npm-publish.yml NOW has test gates (FIXED)

Evidence from `.github/workflows/npm-publish.yml`:
- **L203-224**: `tests-on-tag-sha` job runs `npm run test:unit:fast` on every `release` event, gated by `needs: [build]`.
- **L99-179**: `pre-publish-gate` job runs `./tests/fixtures/init-corpus/run-gate.sh` against pinned public-repo fixtures before publish — the exact "feedback_synthetic_fixtures_dont_count.md" pattern.
- **L228-237**: `publish` job `needs: [build, pre-publish-gate, tests-on-tag-sha]` with explicit `if: always() && needs.build.result == 'success' && needs.pre-publish-gate.result == 'success' && (needs.tests-on-tag-sha.result == 'success' || needs.tests-on-tag-sha.result == 'skipped')`.
- v3.9.13 actual publish run `24578317724` (SHA `4742c41f`, 2026-04-17 17:33:04Z) shows all four jobs succeeded. Confirmed by `gh run view 24578317724 --json jobs`.

This is the single most damaging v3.8.13 finding reversed with a real structural fix. The comments at L81-98 and L181-202 acknowledge the prior post-mortem and explain why the conditional optimization was rejected in favor of always-run simplicity. Commit `1aac5206` ("fix(adr-093): address devil's-advocate C1-C4 critical findings") and `4a641e7e` ("post-audit sweep — CI workflow ...") are in-range.

### 2.2 Optimized CI still messy (PARTIAL)

`gh run list --workflow optimized-ci.yml --limit 10`: {'cancelled': 5, 'success': 4, 'failure': 1}. Success rate is 40% of runs (vs 0% at v3.8.13), but cancellations still dominate on pull_request events. The underlying cancellation pattern that v3.8.13 flagged is unfixed.

### 2.3 Other workflows (MIXED)

| Workflow | Last 10 runs |
|----------|--------------|
| benchmark.yml | 10 failures |
| n8n-workflow-ci.yml | 10 failures |
| qcsd-production-trigger.yml | 8 fail, 2 skip |
| coherence.yml | 10 success |
| skill-validation.yml | 10 success |
| mcp-tools-test.yml | 10 success |
| npm-publish.yml | 8 success, 1 fail, 1 cancel |
| optimized-ci.yml | 4 success, 5 cancel, 1 fail |
| post-publish-canary.yml | 7 success, 2 skip |
| init-chaos.yml | 2 failure |
| init-corpus-mirror-test.yml | 4 success, 2 failure |
| pr-template-check.yml | 9 success, 1 failure |

benchmark and n8n-workflow-ci have been 0% for two consecutive audits. They are either (a) broken and unfixed, or (b) cosmetic workflows nobody uses — either way, they shouldn't be green-theater in the repo.

**Net**: the critical path (publish) is fixed; peripheral CI is still visibly broken.

---

## Section 3: Structured Logger Claim — WORSE

v3.8.13 ratio: 3,010 console.* vs 139 logger imports (21.7:1).
v3.9.13 ratio:

```
grep -rE "console\.(log|error|warn|info|debug)" src --include=*.ts | wc -l
→ 3,272

grep -rE "from ['\"].*logger['\"]" src --include=*.ts | wc -l
→ 1
```

That's **3,272 : 1**. The previously-counted 139 logger imports either used a different path pattern or the codebase actively removed them. Either way, the "adopted in all 13 domains" claim from the v3.8.3 era is flatly contradicted by a one-liner.

Even filtering out `eslint-disable no-console` and tests doesn't rescue this: **3,161** remain. Logging is not adopted.

**Severity**: HIGH. Production debuggability at scale requires structured logs. This is debt that compounds.

---

## Section 4: 500-Line File Limit — WORSE

CLAUDE.md explicit rule: "Keep files under 500 lines."

v3.8.13: 442 files violated. v3.9.13: **446 files** violate (out of 1,263 total src .ts files = 35.3%). Getting worse, not better.

Top 10 largest:
- src/learning/pattern-store.ts — 1,862 lines
- src/domains/requirements-validation/qcsd-refinement-plugin.ts — 1,861
- src/domains/contract-testing/services/contract-validator.ts — 1,827
- src/domains/learning-optimization/coordinator.ts — 1,778
- src/cli/completions/index.ts — 1,778
- src/domains/test-generation/services/pattern-matcher.ts — 1,769
- src/domains/chaos-resilience/coordinator.ts — 1,704
- src/domains/test-generation/coordinator.ts — 1,703
- src/domains/requirements-validation/qcsd-ideation-plugin.ts — 1,699
- src/mcp/protocol-server.ts — 1,641

Four of the top five are in the "13 bounded contexts" touted in package.json. The domain coordinators in particular exceed the limit by 3x-3.5x. This is architectural — the DDD layering is being done, but within-file discipline is not.

**Severity**: MEDIUM. Self-imposed rule, systematically ignored.

---

## Section 5: Agent-Skill Mismatch — DID NOT IMPROVE

- `.claude/agents/v3/qe-*.md`: **53 files**
- `.claude/skills/qe-*/`: **12 directories** (browser, chaos-resilience, code-intelligence, coverage-analysis, defect-intelligence, iterative-loop, learning-optimization, quality-assessment, requirements-validation, test-execution, test-generation, visual-accessibility)
- `assets/agents/v3/qe-*.md` (shipped to users): **53 files**

That's 53 agents but only 12 skills in the qe-* namespace. 41 of 53 (77%) agents have no matching qe-* skill. Improvement from v3.8.13's 49/53 (92%) is modest and may be an artifact of renamed skills rather than new pairings. The `/verify:agent-skills` quality gate was supposed to catch this; it still flags, nothing acts on it.

Also: the README says "60 specialized QE agents" (`README.md:25`) and `package.json:4` says "60 specialized QE agents". ADR-093 also says "60 qe-* agents" (L12). The repo ships 53. **The "60" figure is literally not in the filesystem anywhere**. Either 7 agents were dropped without updating the count, or the count was marketing from the start.

**Severity**: HIGH on the "60" claim (directly disprovable by `ls | wc -l`). MEDIUM on the mismatch (chronic but tracked).

---

## Section 6: v3.9.13 New Claims

### 6.1 ADR-093: "Opus 4.7 Migration Complete" — PARTIAL, CLAIMS OVERSTATE

Status in `docs/implementation/adrs/ADR-093-opus-4-7-migration.md:6`: "Accepted — Phases 1, 2, 4 Implemented; Phase 3 Not Required; Phases 5–6 Scheduled". Commit range `3ee1fbf5..4742c41f`.

Verification: `grep -rE "claude-sonnet-4-20250514|claude-3-haiku-20240307|claude-3-5-sonnet-20241022|claude-3-opus-" src --include="*.ts"` returns **30 matches**. After excluding comments/deprecation markers, **22 live references** remain:
- `src/domains/chaos-resilience/services/chaos-engineer.ts` tier 1 → 'claude-3-haiku-20240307'
- `src/domains/learning-optimization/services/learning-coordinator.ts` tier 1 → 'claude-3-haiku-20240307'
- `src/domains/constants.ts:608` `MODEL_TIERS[1]: 'claude-3-haiku-20240307'`
- `src/domains/test-execution/services/test-executor.ts:354`
- `src/domains/contract-testing/services/contract-validator.ts:140`
- `src/domains/visual-accessibility/services/visual-tester.ts:148`
- `src/coordination/consensus/providers/claude-provider.ts` — claude-3-5-sonnet-20241022 and claude-3-opus-20240229 enumerated as valid types
- `src/shared/llm/providers/bedrock.ts` — ARN mappings for claude-3-5-sonnet and claude-3-opus
- `src/shared/llm/providers/claude.ts` — still lists claude-3-opus and claude-3-haiku in accepted model lists
- `src/shared/llm/model-mapping.ts:113` default `anthropic: 'claude-sonnet-4-20250514'`
- `src/shared/llm/cost-tracker.ts` — pricing entries for retiring Sonnet 4, Opus 3, Haiku 3

ADR-093 claimed a "single-commit model-ID sweep replacing 25+ hardcoded `claude-sonnet-4-20250514` occurrences with a central `DEFAULT_SONNET_MODEL` constant". `DEFAULT_SONNET_MODEL` exists at `src/shared/llm/model-registry.ts:1300 = 'claude-sonnet-4-6'` — good. But `claude-sonnet-4-20250514` is still referenced in 5 non-comment locations including `model-mapping.ts:113` as the anthropic default. The sweep is incomplete.

The tier-1-Haiku-3 pattern (`claude-3-haiku-20240307` in MODEL_TIERS and 5 domain services) is the biggest live regression: `claude-3-haiku-20240307` has an Anthropic retirement date. When Anthropic decommissions it, anything routed to tier 1 will 404.

**Severity**: HIGH. Claim says "Implemented"; grep says "30 refs pending".

### 6.2 ADR-092: "Provider-Agnostic Advisor" — MOSTLY HONEST, WITH ASTERISKS

`src/routing/advisor/multi-model-executor.ts:49-50`:
```
export const DEFAULT_ADVISOR_PROVIDER: ExtendedProviderType = 'openrouter';
export const DEFAULT_ADVISOR_MODEL = 'anthropic/claude-opus-4.7';
```

The default is OpenRouter (a multi-vendor proxy), which is reasonable. But:
- OpenRouter IS a third-party proxy for Anthropic models — ADR-092 itself acknowledges this at L41(c): "OpenRouter is a third-party proxy, so the transcript passes through its servers even when the underlying model is Anthropic."
- The consult() path hard-codes `DEFAULT_ADVISOR_MODEL = 'anthropic/claude-opus-4.7'` (L51) — not literally provider-agnostic at the default-model level, but user can override via `opts.provider` and `opts.model`.
- `validateProviderForAgent(agentName, provider, redactionMode)` at L116 enforces that `qe-security-*` and `qe-pentest-*` may use only Anthropic-direct or Ollama — so security agents explicitly cannot use the "default" OpenRouter path.

Honest summary: "Provider-configurable with a multi-vendor-proxy default, Anthropic-pinned for security work" is accurate. "Provider-agnostic" is marketing gloss.

**Severity**: LOW. The actual implementation matches the ADR text; only the one-liner claim oversells.

### 6.3 qe-browser Skill — HONEST ABOUT BEING A STUB

`.claude/skills/qe-browser/evals/qe-browser.yaml:5`:
> status: design-spec
> description: Manual smoke-test plan for the qe-browser fleet skill, NOT yet a runnable automated eval.

The skill self-discloses that `qe-browser.yaml` is a specification, not runnable. `scripts/smoke-test.sh` (212 lines) IS runnable and uses pinned public fixtures (httpbin.org) — good. Script files (`assert.js`, `batch.js`, `check-injection.js`, `intent-score.js`, `visual-diff.js`) total 1,750 LOC of real logic, not stubs.

The skill SKILL.md claims Linux ARM64 requires a workaround with native Debian chromium — documented honestly as a platform caveat.

**Severity**: LOW. The skill IS partially runnable and the gaps are documented. This is the kind of honesty I want to see more of in other claims.

### 6.4 Marketing claims in package.json/README

`package.json:4` description string:
- "Domain-Driven Design Architecture with **13 Bounded Contexts**" — `ls src/domains/ | grep -v '\.ts$'` returns 13 dirs. **TRUE**.
- "**O(log n) coverage analysis**" — `src/domains/coverage-analysis/services/hnsw-index.ts` exists; `sublinear-analyzer.ts` exists. Implementation is HNSW-backed. **PLAUSIBLE** (Big-O on HNSW is empirically O(log n); I did not microbenchmark).
- "**ReasoningBank learning**" — qe_patterns table exists, captured_experiences table has 16,941 rows, services/patterns wired to it. **TRUE but sparse**.
- "**60 specialized QE agents**" — repo ships **53**. **FALSE**.
- "**mathematical Coherence verification**" — `.github/workflows/coherence.yml` exists and has 100% pass rate. Exists and runs. **TRUE**.
- "**deep Claude Flow integration**" — vague claim, hard to disprove.

**Severity**: HIGH on the "60 agents" claim (directly wrong). Others pass.

---

## Section 7: Release Discipline — GENUINELY FIXED

Per CLAUDE.md's "npm Publish Process (MUST FOLLOW)" section, the expected flow is:
1. Merge PR to main → 2. Build → 3. Create GitHub release → 4. Workflow `npm-publish.yml` triggers, runs tests, publishes.

Evidence for v3.9.13:
- Release `v3.9.13` published 2026-04-17 17:33:02Z, tag SHA `4742c41f`, named "v3.9.13: Opus 4.7 Migration — Fleet-Wide xhigh Effort".
- `npm-publish.yml` workflow run `24578317724` triggered on release event, completed successfully with all four jobs green (Build and Verify, Pre-publish init gate, Tests on tag SHA, Publish to npm).
- The workflow definition at L228-237 makes the publish step unable to run if either gate fails.

**Severity**: N/A. This is the fix that justifies most of the score reversal.

---

## Section 8: Commit Composition

123 commits since v3.8.13 (since 2026-03-30):

| Prefix | Count |
|--------|-------|
| chore(release) | 15 |
| fix(qe-browser) | 8 |
| fix(init) | 7 |
| chore(deps) | 6 |
| fix(adr-093) | 5 |
| fix (unprefixed) | 5 |
| feat(adr-093) | 4 |
| test(ruvector) | 3 |
| fix(kernel) | 3 |

Fix-to-feat ratio is heavily fix-weighted (~50 fix-prefixed, ~10 feat-prefixed visible in the top prefixes). This is healthy — debt is being worked on. `fix(adr-093): address devil's-advocate C1-C4 critical findings` (commit `1aac5206`) and `fix(adr-093): post-audit sweep` (`4a641e7e`) indicate the team is taking adversarial review seriously. That's a genuine cultural improvement.

---

## Section 9: What's Actually Honest (Credit Where Due)

1. **npm-publish.yml now gates on tests.** The single biggest v3.8.13 finding is fixed with a real structural change. Commit evidence: `1aac5206`, `4a641e7e`, merged 2026-04-17.
2. **qe-browser skill self-discloses stub status.** `evals/qe-browser.yaml` explicitly says "design-spec, NOT yet a runnable automated eval" and the runnable `smoke-test.sh` takes the real work. This is how honesty looks.
3. **ADR-092 acknowledges its own compromises.** The ADR text at L41(c) admits OpenRouter is a third-party proxy — doesn't hide the perimeter question.
4. **ADR-093 tracks the 2026-06-15 Sonnet 4 retirement deadline in-registry.** `src/shared/llm/model-registry.ts:1322` has `'claude-sonnet-4-20250514': '2026-06-15'` as a retirement date field. The incomplete sweep is bad, but the awareness is documented.
5. **Devil's-advocate feedback loops into code.** Commit `1aac5206` ("fix(adr-093): address devil's-advocate C1-C4 critical findings") exists. That mechanism is working, which is why this report can be candid without being useless.
6. **13 bounded contexts claim is accurate.** Uncommon for a marketing description to match `ls`.
7. **qe_patterns recovered from 129 → 468.** Not back to February's 15,625 but recovery is happening.
8. **captured_experiences grew from 11,210 → 16,941.** The learning loop is collecting data.

---

## Section 10: Top 10 Most-Damaging Findings

| # | Finding | Severity | File/Evidence |
|---|---------|----------|---------------|
| 1 | ADR-093 "Opus 4.7 migration complete" status contradicted by 22 live retiring-model refs in src/ | HIGH | `src/domains/constants.ts:608`, `src/domains/chaos-resilience/services/chaos-engineer.ts:414`, `src/shared/llm/providers/claude.ts`, `src/shared/llm/model-mapping.ts:113`, 18 more |
| 2 | "60 specialized QE agents" claim — repo ships 53 | HIGH | `README.md:25`, `package.json:4`, `.claude/agents/v3/qe-*.md` count = 53 |
| 3 | CLAUDE.md "1K+ irreplaceable learning records" — pendulum swung the wrong way, still misrepresents | HIGH | `CLAUDE.md:24` |
| 4 | March 19 database corruption still undocumented; `memory-corrupted.db` (61MB) sits next to live DB | HIGH | `.agentic-qe/memory-corrupted.db` timestamp 2026-03-19, no changelog entry |
| 5 | Structured-logger ratio got worse (3,272:1 vs 21.7:1) — logger imports count dropped to 1 | HIGH | `grep -rE "from ['\"].*logger['\"]" src --include=*.ts \| wc -l` = 1 |
| 6 | 500-line limit violated by 446 files (vs 442 at v3.8.13). Top offenders 3x-3.7x limit | MEDIUM | `src/learning/pattern-store.ts` 1,862 LOC, 9 others > 1,600 |
| 7 | benchmark.yml and n8n-workflow-ci.yml at 0% pass for two consecutive audits | MEDIUM | `gh run list --workflow benchmark.yml` = 10/10 failure |
| 8 | 41/53 (77%) agents still have no matching qe-* skill | MEDIUM | `ls .claude/skills/qe-*/` = 12 dirs, agents = 53 |
| 9 | Optimized CI cancellation rate still dominant (5/10 cancelled) | MEDIUM | `gh run list --workflow optimized-ci.yml --limit 10` |
| 10 | Tier-1 routing hardcoded to `claude-3-haiku-20240307` in 5 domain services + constants — will 404 on Haiku 3 retirement | MEDIUM | `src/domains/constants.ts:608`, 5 services reference same hardcode |

---

## Honesty Score Calculation

| Category | Weight | Score | Weighted |
|----------|--------|-------|----------|
| CI health (critical path) | 20 | 9/10 | 18.0 |
| CI health (peripheral) | 5 | 3/10 | 1.5 |
| Database claims accuracy | 10 | 3/10 | 3.0 |
| ADR-093 claim vs reality | 15 | 4/10 | 6.0 |
| ADR-092 claim vs reality | 5 | 7/10 | 3.5 |
| Marketing claim accuracy (README/package.json) | 10 | 5/10 | 5.0 |
| 500-line discipline | 5 | 3/10 | 1.5 |
| Structured logging adoption | 5 | 1/10 | 0.5 |
| Agent-skill coverage | 5 | 3/10 | 1.5 |
| qe-browser honest self-disclosure | 5 | 9/10 | 4.5 |
| Incident transparency (DB corruption) | 5 | 0/10 | 0.0 |
| Fix-over-feat commit discipline | 5 | 8/10 | 4.0 |
| Devil's-advocate loop visible in commits | 5 | 10/10 | 5.0 |
| **TOTAL** | **100** | | **54.0** |

Adjustments from baseline (published-without-tests crisis reversed): +20
Penalty for new marketing overclaim ("60 agents"): -5
Credit for self-disclosed stubs: +5

**Final Honesty Score: 74/100**

---

## Trend

```
v3.7.0:  82  ████████████████░░░░
v3.7.10: 78  ███████████████░░░░░
v3.8.3:  72  ██████████████░░░░░░
v3.8.13: 68  █████████████░░░░░░░
v3.9.13: 74  ██████████████░░░░░░   Direction: UP (+6) — FIRST REVERSAL
```

The reversal is real but narrow. It is carried almost entirely by the `npm-publish.yml` structural fix. Two or three more fixes of comparable magnitude (ADR-093 model-ID sweep completion, CLAUDE.md correction, 500-line decomposition on top 10 files) would justify a score in the 80s. One more feature-stuffing cycle that ignores the remaining findings and the score will retrace.

---

## Recommendations (Priority Order)

1. **[HIGH] Finish the ADR-093 model-ID sweep.** 22 live references to retiring model IDs remain. Particular attention to `src/domains/constants.ts:608` and the 5 domain-service tier-1 hardcodes — those will 404 on Haiku 3 retirement. Replace with registry lookups or DEFAULT_HAIKU_MODEL constant (doesn't exist yet).

2. **[HIGH] Correct or remove the "60 specialized QE agents" claim.** It's in README.md, package.json, and ADR-093 itself. Either ship 7 more agents or say 53.

3. **[HIGH] Fix CLAUDE.md line 24.** "1K+ irreplaceable learning records" is vague and still wrong-directional. Replace with specific, dated numbers (e.g., "qe_patterns: 468, captured_experiences: 16,941; post-Mar-19-corruption recovery ongoing; see docs/incidents/2026-03-19-memory-corruption.md").

4. **[HIGH] Write the Mar 19 corruption post-mortem.** `memory-corrupted.db` has been sitting in the repo for a month. Either document it or delete it — both would be an improvement over silence.

5. **[MEDIUM] Decompose top-10 files over 1,600 lines.** Start with `src/learning/pattern-store.ts` (1,862) and the two domain coordinators (1,704 and 1,703). This is self-imposed policy being ignored.

6. **[MEDIUM] Decide about benchmark.yml and n8n-workflow-ci.yml.** Two consecutive 0% audits. Either fix or archive.

7. **[MEDIUM] Adopt structured logging in at least one domain as proof of concept.** The 3,272:1 ratio is unchanged and now the logger-import count dropped to 1, meaning the library is essentially unused.

8. **[LOW] Keep doing the devil's-advocate loop commits.** `1aac5206` and `4a641e7e` are visible culture work. The score reversal wouldn't have happened without them.

---

## Methodology Notes

### Files Examined
- `CLAUDE.md` (line 24 verification)
- `package.json` (L4 description claims)
- `README.md` (L25 agent count)
- `.agentic-qe/memory.db`, `.agentic-qe/memory-corrupted.db`, `.agentic-qe/memory-aqe-root-Feb-27-2026.db`
- `.github/workflows/npm-publish.yml`, `optimized-ci.yml` + 10 other workflows
- `src/shared/llm/model-registry.ts` (DEFAULT_SONNET_MODEL, DEFAULT_OPUS_MODEL, retirement dates)
- `src/shared/llm/providers/claude.ts`, `bedrock.ts`, `cost-tracker.ts`, `model-mapping.ts`
- `src/coordination/consensus/providers/claude-provider.ts`, `openrouter-provider.ts`
- `src/domains/constants.ts`, 5 domain-service tier-1 mappings
- `src/routing/advisor/multi-model-executor.ts`, `redaction.ts`, `circuit-breaker.ts`
- `src/domains/coverage-analysis/*` (O(log n) claim)
- `.claude/skills/qe-browser/SKILL.md`, `evals/qe-browser.yaml`, `scripts/smoke-test.sh`
- `docs/implementation/adrs/ADR-092-provider-agnostic-advisor-strategy.md`
- `docs/implementation/adrs/ADR-093-opus-4-7-migration.md`
- `.claude/agents/v3/qe-*.md` (53 files), `.claude/skills/qe-*/` (12 dirs), `assets/agents/v3/qe-*.md` (53 files)
- 10 workflow run histories via `gh run list`, one publish run detail via `gh run view 24578317724`
- 123 commits since v3.8.13 via `git log --since=2026-03-30`

### Key Commits Cited
- `4742c41f` — Merge PR #429 (adr-093 final)
- `1aac5206` — fix(adr-093): address devil's-advocate C1-C4 critical findings
- `4a641e7e` — fix(adr-093): post-audit sweep — CI workflow, consensus provider...
- `d55fcfbb` — refactor(adr-093): sweep retiring model IDs (incomplete, per Section 6.1)
- `3ee1fbf5` — feat(adr-093): add Opus 4.7, Sonnet 4.6, Haiku 4.5 to model registry
- `864741a7` — docs(adr-093): mark Accepted

### Patterns/Anti-Patterns Checked
- Feature-stuffing (ADR-093 claims completion while 22 refs linger)
- Pendulum claims (150K → 1K+ without addressing truth)
- Incident opacity (Mar 19 corruption)
- Marketing inflation (60 agents, 53 files)
- Self-policy violations (500-line limit, structured logging)
- Verification-gate honesty (npm-publish: real fix; benchmark.yml: still theater)
- Self-disclosed stubs (qe-browser evals — this is good honesty)
- Devil's-advocate follow-through (visible in commits 1aac5206, 4a641e7e)

### Strategies Run
- AssumptionQuestioningStrategy (migration-complete claims)
- FalsePositiveDetectionStrategy (CI success theater on peripheral workflows)
- CoverageGapCritiqueStrategy (22 retiring-model references vs "sweep complete")
- MissingEdgeCaseStrategy (Haiku 3 retirement will 404 tier-1 routing)
- BoundaryValueGapStrategy (file-size 500-line cliff)
- ErrorHandlingGapStrategy (undocumented DB corruption)
- SecurityBlindSpotStrategy (OpenRouter-as-default transcript perimeter)
