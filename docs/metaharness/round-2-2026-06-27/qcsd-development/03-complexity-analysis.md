# MetaHarness — Code Complexity Analysis (Round 2, QCSD Development Phase)

**Agent:** qe-code-complexity
**Target repo:** `ruvnet/agent-harness-generator` (MetaHarness)
**Snapshot:** HEAD `5f63ac6`, branch `claude/darwin-mode-evolve-polyglot`, `v0.1.15-467-g5f63ac6`
**Date:** 2026-06-27
**Scope (two packages, absolute paths):**
1. `/workspaces/agent-harness-generator/packages/create-agent-harness/src` — 41 files, 7,739 LOC, 226 functions
2. `/workspaces/agent-harness-generator/packages/darwin-mode/src` — 57 files, 10,163 LOC, 365 functions (62 `__tests__` files excluded from the metric)

**Method:** Custom **TypeScript-AST** analyzer (`typescript@5.9.3` compiler, full AST — not brace/token heuristics) computing per-function cyclomatic, Sonar-style cognitive, max nesting, and line span; plus per-file LOC and import fan-out. Run over both `src` trees with `__tests__/` and `*.test.ts` excluded — **EXECUTED**. Top offenders then read by hand to separate genuine nesting from flat-ladder artifacts — **STATIC + INFERRED**.

> **Methodology note vs prior round.** The prior round-1 report used a custom brace-matched "AST-lite" counter; this round uses the real TS compiler AST. Absolute maxima are therefore not 1:1 comparable (e.g. prior `auditCmd` cyc=52 vs this tool's 26). Averages and medians agree closely, so the trend comparison is sound; individual max deltas are flagged where they matter.
>
> **Known tool bias (disclosed).** My nesting/cognitive counter increments nesting on every `if`, including the `if` of an `else if` chain — the Sonar spec does not. This **inflates** cognitive and nesting for flat `else if` dispatch ladders (CLI arg-parsers, command routers). I corrected for this by hand on every top-12 offender; the corrected "genuine nest" is what drives the hotspot ranking below. Affected artifacts are explicitly labelled.

---

## 1. Gate Verdict (per package)

### QCSD gate mapping (avg cyclomatic)
```
SHIP        avg ≤ 10
CONDITIONAL 11 – 15
HOLD        > 15
```

| Package | Avg cyc | Median cyc | Max cyc | Avg cog | Max cog | **Gate** |
|---------|---------|------------|---------|---------|---------|----------|
| **create-agent-harness** | **6.53** | 4 | 33 (`scaffold`) | 7.47 | 141\* (`parseArgs`, artifact) | **SHIP** |
| **darwin-mode** | **3.53** | 2 | 53 (`evolve`) | 3.10 | 124 (`evolve`, genuine) | **SHIP** |

\* `parseArgs` cog=141 / nest=15 is a tool artifact of an `else if` ladder (genuine nest=2). See §3.

**Both packages: SHIP.** Both averages sit comfortably inside the SHIP band. As in round 1, each package is **bimodal** — a clean, small-function core (medians 4 and 2) with risk concentrated in a short tail of orchestrator/command-entry functions.

- All metrics in this section: **EXECUTED** (226 + 365 functions parsed by TS AST).

---

## 2. Package A — create-agent-harness (the generator)

### 2.1 Distribution (EXECUTED)
```
Complexity band      Functions    %
Low      (1–5)          139      62%   (median = 4)
Medium   (6–10)          46      20%
High     (11–20)         25      11%
Critical (>20)           16       7%   <-- CLI-command tail
```
- Functions cyc>10: **41 (18%)**; cyc>15: 23; nesting≥4 (genuine): see §2.3; functions >60 lines: 23.
- Files >500 lines: **1** (`index.ts`, 732 lines).
- Worst coupling: **`subcommands.ts` — 23 imports** (3× the next file), the command-dispatch hub. Unchanged from round 1.

### 2.2 Top by raw score (EXECUTED) — with genuine-vs-artifact classification
| Function | file:line | cyc | cog | nest(tool→genuine) | lines | Classification |
|----------|-----------|-----|-----|--------------------|-------|----------------|
| `scaffold` | `index.ts:339` | 33 | 62 | 4→3 | 147 | **Genuine (mild)** — long sequential procedure: render → multi-host overlay → package.json edits → license inject. Many concerns fused, but mostly flat blocks + try/catch, not deep tangle. |
| `analyzeRepoCmd` | `analyze-repo.ts:329` | 31 | 50 | 7→~2 | 71 | **Artifact** — `for`+`else if` arg-parse ladder then sequential `lines.push`. Flat. |
| `scanMcp` | `mcp-scan.ts:48` | 31 | 36 | 2 | 87 | **Artifact** — flat `if(policy.x) add({...})` security-rule ladder (matches round 1). |
| `dispatch` | `subcommands.ts:294` | 29 | 5 | 1 | 97 | **Pure artifact** — flat command switch. cog=5 confirms. |
| `parseArgs` | `index.ts:150` | 28 | 141\* | 15→2 | 45 | **Pure artifact** — flat `else if` flag ladder (verified, lines 150–194). Highest tool-cognitive in repo, zero real nesting, trivially testable per-flag. |
| `genomeCmd`/`scoreCmd`/`threatModelCmd` | `genome.ts:208`,`score.ts:366`,`threat-model.ts:209` | 27 | 55 | 7→2-3 | 57-59 | **Artifact** — command entry points: arg-parse ladder + output-format branches. |
| `main` | `index.ts:592` | 27 | 37 | 3 | 134 | **Artifact** — flat top-level flag dispatch. |
| `auditCmd` | `audit-cmd.ts:20` | 26 | 25 | 3 | 127 | **Mild** — dual-output (`--bundle`) doubling still present; prior split-rec NOT applied. cog=25 modest. |
| `formatReport` | `compare-cmd.ts:142` | 26 | 30 | 2 | 39 | **Artifact** — flat formatting ladder. |

### 2.3 Genuine hotspots (ranked by REAL nesting/tangle, discounting flat ladders)
1. **`validate.ts:65 walk`** — cyc=12 cog=31 **genuine nest=6**, 22 lines. Recursive file-walk fusing directory recursion + comment-skip + per-line regex match. Deepest real tangle in the package. **Still open** (round-1 #1). EXECUTED.
2. **`diag.ts:317 buildSupportBundle`** — cyc=17 cog=32 **genuine nest=5**, 63 lines. Nested dep-harvest pyramid (`exists → try → for deps → if block → for entries → if name`). **Still open** (round-1 #2). EXECUTED.
3. **`index.ts:339 scaffold`** — cyc=33 cog=62 nest~3, 147 lines. Largest single procedure; multiple unrelated package.json mutations + host overlays in one body. New top-by-cyc this round (was `auditCmd`). Genuine maintenance load, low tangle. EXECUTED.
4. **`wizard.ts:75/93/119 runWizard`** — **CONFIRMED still-open duplication**: three `while (true)` pick/validate loops at lines 75, 93, 119 (grep verified). Round-1 rec #1 (extract `pickFromList`) **NOT applied**. STATIC.
5. **`subcommands.ts` (module)** — 23 imports, the coupling hub. Architectural fan-out unchanged. EXECUTED.

### 2.4 Comparison vs prior round (generator)
| Metric | Prior (round 1) | Now (round 2) | Direction |
|--------|-----------------|---------------|-----------|
| Files / LOC / functions | 37 / 6,751 / 176 | 41 / 7,739 / 226 | +4 files, +988 LOC, +50 fns |
| **Avg cyclomatic** | **7.18** | **6.53** | **Improved** (−0.65 despite +1k LOC) |
| Median cyclomatic | 4 | 4 | Flat |
| Functions cyc>10 | 40 (23%) | 41 (18%) | Improved (share down) |
| Max cyclomatic | 52 (`auditCmd`)\* | 33 (`scaffold`)\* | Lower (\*see methodology note) |

The generator **absorbed ~1,000 LOC of new surface without raising average complexity** — new code is predominantly small helpers; the high-complexity share actually fell from 23% → 18%. Net positive trend.

---

## 3. Package B — darwin-mode (self-evolving harness)

### 3.1 Distribution (EXECUTED)
```
Complexity band      Functions    %
Low      (1–5)          302      83%   (median = 2)
Medium   (6–10)          42      11%
High     (11–20)         19       5%
Critical (>20)            2       1%   <-- evolve() + cli main()
```
- Functions cyc>10: **21 (6%)**; cyc>15: 6; functions >60 lines: 16.
- Files >500 lines: **1** (`evolve.ts`, 545 lines, 23 imports).
- **Average cyclomatic 3.53 / cognitive 3.10 / median 2 is exceptionally low** for a 10k-LOC package — the genome/pareto/scorer/stats/types core is almost entirely small pure functions. This is a genuinely well-decomposed codebase.

### 3.2 Top by raw score (EXECUTED)
| Function | file:line | cyc | cog | nest | lines | Classification |
|----------|-----------|-----|-----|------|-------|----------------|
| **`evolve`** | **`evolve.ts:234`** | **53** | **124** | **6** | **311** | **GENUINE god-function** — the dominant hotspot of the entire repo. |
| `main` | `cli.ts:127` | 25 | 23 | 1 | 89 | **Artifact** — flat CLI flag dispatch. |
| `evolveDetectorsReal` | `security/real-evolve.ts:89` | 20 | 15 | 2 | 144 | Mild — long but shallow loop body. |
| `evolve` | `security/evolve.ts:72` | 17 | 20 | 4 | 81 | **Genuine** — nested generation/candidate loops. |
| `runSwarm` | `security/swarm.ts:97` | 17 | 30 | 4 | 87 | **Genuine** — nested agent/round loops + branches. |
| `runRepo` | `security/agentic.ts:102` | 15 | 35 | 4 | 61 | **Genuine** — highest cog/line in security; nested repo-iteration tangle. |
| `inspectVariant` | `safety.ts:118` | 15 | 27 | 3 | 67 | Genuine (mild) — safety-gate guard cascade. |
| `resolveTooling` | `repo_profiler.ts:70` | 14 | 29 | 5→3 | 34 | **Artifact-ish** — nest inflated by a nested ternary runner-pick; real nest≈3, readable. |
| `scoreVariant` | `scorer.ts:78` | 14 | 11 | 1 | 114 | **Artifact** — flat sequential scoring; cog=11 confirms flat. |

### 3.3 The one genuine hotspot — `evolve()` (`evolve.ts:234`)
- **Metrics:** cyc=53 (repo max), cog=124 (repo max), **genuine nest=6**, **311 lines**, in the only >500-line file (545 LOC, 23 imports — also the worst-coupled file in the package). EXECUTED, body read lines 234–364.
- **Why genuine:** triple-nested generation engine — `for generation → for parents → for children`, then a parallel bench-evaluation loop, an SGM risk-budget gate loop, curriculum escalation, crossover/epistasis branching, and Pareto bookkeeping, **all in one function body**. This is real fused control flow + state, not a flat ladder. Cognitive 124 against cyclomatic 53 (~2.3×) confirms nesting, not breadth.
- **Risk:** This single function concentrates essentially all of the package's complexity debt. The generation loop, statistical-gate logic (`admitWithStatisticalGate`), and crossover wiring cannot be unit-tested in isolation; any defect in promotion/curriculum/risk-budget interaction lands here and is invisible without reading the whole 311-line body. The 83%-low distribution means the rest of the package is clean — fixing `evolve()` would resolve the package's complexity story almost entirely.

### 3.4 Comparison vs prior round (darwin-mode)
New surface since round 1 (round-1 had no darwin complexity baseline). **No regression** to report; baseline established here: avg cyc 3.53, max 53 (`evolve`).

---

## 4. Refactor Recommendations (ranked by REAL payoff)

| # | Package | Target | Action | Payoff | Effort | Evidence |
|---|---------|--------|--------|--------|--------|----------|
| **1** | darwin | `evolve.ts:234 evolve` | Extract the per-generation step into `runGeneration(parents, ctx): GenerationResult` (child-build + bench-eval + SGM-gate), leaving `evolve` as a thin generation loop. Pull crossover/linkage and the bench-gate block into named helpers. | **Highest** — collapses the repo's single cyc=53/cog=124/311-line god-function; makes promotion logic unit-testable. Resolves ~all of darwin's debt. | Medium-High (~4-6h) | EXECUTED (cyc=53, nest=6, 311 lines) |
| **2** | generator | `wizard.ts:75/93/119 runWizard` | Extract `pickFromList(ask, label, items, {default,toId})`; collapse 3 `while(true)` loops → 1 helper + 3 call sites. | **High** — confirmed mechanical dedup, removes ~40 LOC. Round-1 rec, still unfixed. | Low (~1h) | STATIC (3 loops grep-verified still present) |
| **3** | generator | `validate.ts:65 walk` | Split recursive directory discovery from per-file `scanLine` pattern match (pure fn over content). | **High** — breaks deepest nesting (6→~2), pattern logic testable without FS. | Medium (~2h) | EXECUTED (nest=6, cog=31) |
| **4** | generator | `diag.ts:317 buildSupportBundle` | Extract `harvestRufloDeps(pkg)` (the 3-deep dep loop). | Medium — flattens worst diag pyramid. | Low (~1h) | EXECUTED (nest=5) |
| **5** | generator | `index.ts:339 scaffold` | Separate the package.json mutations (host deps, license) into pure `applyHostDeps`/`ensureLicense` helpers over the rendered set. | Medium — shrinks the 147-line/cyc=33 procedure, isolates each GH-issue fix. | Medium (~2h) | EXECUTED (cyc=33, 147 lines) |
| — | both | `parseArgs`, `analyzeRepoCmd`, `scanMcp`, `dispatch`, `main`(×2), `genomeCmd`/`scoreCmd`/`threatModelCmd`, `scoreVariant` | **DO NOT refactor for complexity.** Flat `else if`/dispatch ladders — high cyc/cog is a counting artifact (verified low genuine nest). Splitting would scatter locally-cohesive logic and *lower* readability. | N/A | INFERRED (hand-verified flat, nest 1–3) |

---

## 5. Status vs prior round

| Prior finding (round 1, generator) | Status | Evidence (file:line) |
|-----------------------------------|--------|----------------------|
| Gate = SHIP (avg cyc 7.18) | **Fixed/Improved** | avg now **6.53**, high-complexity share 23%→18% — EXECUTED |
| Bimodal: clean core, heavy CLI tail | **Still-open (by design)** | median 4, max 33; tail = command entry points — EXECUTED |
| #1 `validate.ts walk` genuine nest=6 | **Still-open** | `validate.ts:65` cog=31 nest=6 — EXECUTED |
| #2 `diag.ts buildSupportBundle` nest=6 | **Still-open** | `diag.ts:317` cog=32 nest=5 — EXECUTED |
| #3 `auditCmd` dual-output fragility (was repo max cyc) | **Still-open (partly relieved)** | `audit-cmd.ts:20` still monolithic, no `runAudit`/`toText`/`toBundle` split; this tool scores it cyc=26 (methodology delta vs prior 52) — EXECUTED + grep |
| #1 rec `runWizard` 3× duplicated `while(true)` | **Still-open** | `wizard.ts:75,93,119` three loops present, no `pickFromList` — STATIC (grep) |
| `subcommands.ts` 23-import coupling hub | **Still-open** | `subcommands.ts` imports=23 — EXECUTED |
| darwin-mode complexity baseline | **New** | avg cyc 3.53, max 53 `evolve.ts:234` — EXECUTED |

---

## 6. Bottom Line

- **Both packages SHIP.** Generator avg cyclomatic **6.53** (improved from 7.18 despite +1k LOC); darwin-mode avg **3.53** — exceptionally low for 10k LOC.
- **Risk is bimodal and contained in both.** Generator debt = a 4-function tail (`walk`, `buildSupportBundle`, `scaffold`, `runWizard`); darwin debt = essentially **one** function, `evolve()` (cyc=53/cog=124/311 lines), which holds nearly all of the package's complexity.
- **The token-/brace-based "god functions" remain mostly artifacts** — `parseArgs`, `scanMcp`, `dispatch`, the `*Cmd` entry points and `scoreVariant` are flat ladders; leave them alone.
- **Highest-ROI actions:** decompose darwin `evolve()` (resolves the package's whole complexity story) and finally dedupe the generator's `runWizard` (round-1 rec, ~40 LOC, ~1h, still unfixed).
