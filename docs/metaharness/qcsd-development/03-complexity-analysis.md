# MetaHarness — Code Complexity Analysis (QCSD Development Phase)

**Agent:** qe-code-complexity
**Target repo:** `ruvnet/agent-harness-generator` (MetaHarness) v0.1.7
**Scope:** `/workspaces/agent-harness-generator/packages/create-agent-harness/src` — 37 TS files, 6,751 LOC, 176 functions
**Date:** 2026-06-15
**Method:** Custom AST-lite analyzer (comment/string-stripped, brace-matched function bodies) run over all 37 files — EXECUTED. Manual nesting/intent review of the top offenders — STATIC + INFERRED.

---

## 1. Gate Verdict

| Metric | Value | Evidence |
|--------|-------|----------|
| **Avg cyclomatic / function** | **7.18** | EXECUTED (176 functions) |
| Median cyclomatic | 4 | EXECUTED |
| Max cyclomatic | 52 (`auditCmd`) | EXECUTED |
| Functions cyc > 10 | 40 (23%) | EXECUTED |
| Functions cyc > 15 | 25 (14%) | EXECUTED |
| Functions nesting ≥ 4 | 12 (7%) | EXECUTED |
| Functions > 60 lines | 17 (10%) | EXECUTED |

### QCSD Gate Mapping (avg-based)

```
SHIP        avg ≤ 10
CONDITIONAL 11 – 15
HOLD        > 15
```

**VERDICT: SHIP** — avg cyclomatic **7.18** is comfortably inside the SHIP band.

> **Caveat (read before acting):** The average is healthy because the codebase is dominated by small pure helpers (median cyc = 4). The risk is concentrated in a long tail of CLI-command entry points. A median of 4 with a max of 52 is a classic **bimodal** distribution: clean core, heavy edges. The gate is SHIP, but the tail carries the maintainability/testability debt and is where any future defects will land. Treat the recommendations below as CONDITIONAL-grade follow-ups even though the headline gate is SHIP.

---

## 2. Genuine Complexity vs. Token Artifact

The prior adversarial pass was correct: cyclomatic count alone mis-scores this codebase. The discriminating signal here is **nesting depth + cognitive-to-cyclomatic ratio**, not raw cyclomatic. The pattern across MetaHarness:

- **Flat dispatch / guard ladder** → high cyclomatic, **low nesting (2–3)**, cognitive ≈ cyclomatic or lower. Each branch is independent and locally readable. NOT a real risk.
- **Genuine tangle** → **nesting ≥ 4**, cognitive **far exceeds** cyclomatic (nested control multiplies cognitive weight). This is where comprehension actually breaks down.

The flagged "god functions" from the prior pass are confirmed as token artifacts:

| Function | cyc | cog | nest | Classification |
|----------|-----|-----|------|----------------|
| `mcp-scan.ts:47 scanMcp` | 48 | 54 | **3** | **Token artifact** — flat `if (policy.x) add({...})` ladder, one branch per security rule. Linear, testable, each rule isolated. |
| `index.ts:369 main` | 23 | 36 | **2** | **Token artifact** — flat sequential `if (args.x) {...; return}` flag dispatch. |
| `threat-model.ts:208 threatModelCmd` | 29 | 54 | **4** | **Mostly artifact** — dispatch ladder; cog inflated by output-format branches, nesting borderline. |
| `analyze-repo.ts:200 scoreArchetypes` | 17 | 4 | **2** | **Token artifact** — a single `.map()` with an inline weighted-sum expression. cog=4 confirms it; the cyclomatic is from `&&`/ternaries in one arithmetic line. |
| `index.ts:144 parseArgs` | 28 | 65 | 2 | **Token artifact** — flat `else if` arg-parse chain. Highest cognitive in the repo but zero nesting; trivially testable per-flag. |

---

## 3. Top 5 Hotspots (ranked by GENUINE risk, not raw score)

> Risk = nesting depth × cognitive load × (state tangle / fan-out), discounted for flat ladders.

### #1 — `validate.ts:56` `runPathGuard` + nested `walk` (lines 56–96)
- **Metrics:** outer cyc=14 cog=52 **nest=6**; inner `walk` cyc=12 cog=39 **nest=5** — EXECUTED.
- **Why genuine:** Recursive `walk()` with `for (entries) → if (isDirectory) recurse / else if (regex) → for (lines) → if (comment) continue → for (patterns) → if (match)`. That is a real 4-level-deep loop/branch tangle (for-in-for-in-for-in-if), the deepest comprehension load in the repo. Cognitive 52 against cyclomatic 14 is a ~3.7× ratio — the signature of nesting, not breadth.
- **Risk:** Hard to unit-test the inner match logic in isolation; the file-walk, comment-skip, and pattern-match concerns are fused into one closure.

### #2 — `diag.ts:316` `buildSupportBundle` (lines 317–379)
- **Metrics:** cyc=17 cog=47 **nest=6** — EXECUTED; manually verified STATIC.
- **Why genuine:** `if (exists) → try → for (dep blocks) → if (block) → for (entries) → if (name matches)` — genuinely 4+ levels of nested iteration/guards for the dependency-harvesting block, each wrapped in try/catch. This is real nested state assembly, not a flat ladder.
- **Risk:** The dep-filtering predicate is buried three loops deep; a bug in the `@metaharness/` prefix match is invisible without reading the full pyramid.

### #3 — `audit-cmd.ts:19` `auditCmd` (lines 20–145, cyc=52 — the repo max)
- **Metrics:** cyc=52 cog=38 **nest=6** lines=128 — EXECUTED.
- **Why partly genuine, partly artifact:** The cyclomatic 52 is **inflated by the `--bundle` dual-output mode** — every error path is written twice (`if (bundle) return JSON; else lines.push(); return`). That doubling is a token artifact. BUT cognitive 38 with nesting 6 reflects real structure: `try/catch` around `execFile`, then nested `if (bundle) { return {...} }` blocks inside each guard. The genuine issue is the **duplicated output contract**, not control-flow tangle.
- **Risk:** Every new validation needs two return sites kept in sync (text + JSON). High edit-fragility. This is the single highest *maintenance-cost* function even though it isn't the most tangled.

### #4 — `subcommands.ts:83` `doctor` (lines 83–199)
- **Metrics:** cyc=24 cog=52 **nest=3** lines=117 — EXECUTED. File also has the worst coupling: **23 imports**, 6 functions, maxCyc=29.
- **Why genuine (coupling axis):** `doctor` itself is a moderately-nested sequential check runner, but it lives in the most-coupled module in the repo (23 imports — 3× the next file). The genuine risk is **fan-out**: `subcommands.ts` is the hub that wires every command together. Changes here ripple widely.
- **Risk:** Architectural, not local. The dispatch hub concentrates coupling; testing `doctor` drags in the whole import graph.

### #5 — `wizard.ts:72` `runWizard` (lines 72–147) — CONFIRMED duplication
- **Metrics:** cyc=16 cog=35 **nest=3** lines=77 — EXECUTED.
- **Verified:** The prior duplication finding is **CONFIRMED**. `runWizard` contains **three near-identical `while (true)` pick/validate loops** — name (74–84), template (92–111), host (118–140). Each is the same shape: prompt → trim → numeric-index branch (range-check + break) → id-lookup branch (find + break) → error + continue. The template and host loops are structurally identical (numeric pick OR id match), differing only in the collection, the default, and the error string.
- **Why genuine:** This is real, fixable duplication (3× a 4-deep prompt/validate loop), not a token artifact. cog=35 vs cyc=16 (~2.2×) reflects the repeated nested loops. Highest *refactor payoff* of any finding because the fix is mechanical and removes ~40 lines.

---

## 4. Refactor Recommendations (ranked by REAL payoff)

| # | Target | Action | Payoff | Effort | Evidence class |
|---|--------|--------|--------|--------|----------------|
| **1** | `wizard.ts:72 runWizard` | Extract a generic `pickFromList(ask, label, items, { default, toId })` helper. Collapses 3 duplicated `while(true)` loops into 1 reusable function + 3 call sites. | **High** — removes ~40 LOC, kills the confirmed duplication, makes each picker independently testable. Lowest-risk, highest-certainty win. | Low (~1h) | STATIC (verified duplication) |
| **2** | `audit-cmd.ts:19 auditCmd` | Separate **compute** from **render**: a pure `runAudit(dir, opts): AuditResult` (cyc collapses), then two thin formatters `toText(result)` / `toBundle(result)`. Eliminates the doubled return sites that drive cyc 52. | **High** — removes the dual-output fragility (the actual defect risk), drops the repo's max cyclomatic by ~half. | Medium (~3h) | EXECUTED (cyc=52, dual-output verified) |
| **3** | `validate.ts:56 runPathGuard/walk` | Split the recursive `walk` (file discovery) from the per-file `scanLine` (pattern match). Discovery yields paths; matching is a pure function over content. | **High** — breaks the deepest nesting (6→~2 per function) and makes the pattern logic unit-testable without filesystem. | Medium (~2h) | EXECUTED (nest=6, cog=52) |
| **4** | `diag.ts:316 buildSupportBundle` | Extract `harvestRufloDeps(pkg): Record<string,string>` (the 3-deep dep loop) as a pure helper. | Medium — flattens the worst pyramid in diag; isolates the prefix-match predicate. | Low (~1h) | EXECUTED (nest=6) |
| **5** | `subcommands.ts` (module) | Architectural: 23 imports is a coupling hub. Consider a command-registry pattern (each subcommand self-registers) so the hub doesn't import every implementation. | Medium-Long term — reduces fan-out, but higher risk; defer unless the file keeps growing. | High (~1d) | EXECUTED (23 imports, 3× next file) |
| — | `mcp-scan.ts scanMcp`, `index.ts parseArgs/main`, `threatModelCmd`, `scoreCmd`, `genomeCmd`, `scoreArchetypes` | **DO NOT refactor for complexity.** Flat ladders/dispatch; high cyclomatic is a token-counting artifact. Splitting them would *reduce* readability by scattering locally-cohesive logic. | N/A | INFERRED (nest 2–4, verified flat) |

---

## 5. Distribution Detail (EXECUTED)

```
Complexity band      Functions    %
Low      (1–5)          ~110     63%   (median = 4)
Medium   (6–10)          ~26     15%
High     (11–20)         ~25     14%
Critical (>20)            ~15      8%   <-- the CLI-command tail
```

The "critical" band is almost entirely **CLI command entry points** (`*Cmd`, `main`, `dispatch`, `doctor`, `scanMcp`), most of which are flat dispatch ladders. Only ~5 of the ~40 high-complexity functions carry genuine nesting risk (the hotspots in §3). The pure core (renderer, walker, writer, manifest, registry, genome-scorers) is clean — `writer.ts` maxCyc=1, `genome-scorers.ts` low throughout.

---

## 6. Bottom Line

- **Gate: SHIP** (avg cyc 7.18 ≤ 10).
- The headline number understates a real but *contained* tail: ~5 functions carry genuine maintainability debt, of which only 1 (`wizard.ts runWizard`) is a confirmed clean duplication.
- **The token-count tools are wrong about the "god functions"** — `scanMcp`, `parseArgs`, `main`, `scoreArchetypes` are flat and should be left alone. Refactoring them would *lower* quality.
- **Highest-ROI action:** dedupe `runWizard` (mechanical, ~40 LOC removed). **Highest-risk-reduction action:** split compute/render in `auditCmd` (kills dual-output fragility) and decouple discovery/matching in `runPathGuard` (kills deepest nesting).
