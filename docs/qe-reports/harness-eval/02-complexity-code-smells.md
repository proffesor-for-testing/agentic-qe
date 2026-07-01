# harness-eval — Complexity & Code-Smells Analysis

**Scope:** `/tmp/harness-eval/src` (~16.7K LOC, TypeScript/TSX, Bun). Analysis by the AQE Complexity & Code-Smells specialist.
**Date:** 2026-07-01

---

## Executive Summary

harness-eval is a small-to-mid TypeScript framework (~16.7K LOC across ~55 source files) whose complexity is **highly concentrated**: roughly 60% of the maintainability risk lives in 4–5 files. The backend/domain logic (grading, orchestration, bracket math, drivers) is mostly well-factored into short pure functions. The **studio UI layer is where complexity accumulates dangerously** — one file, `src/studio/views/TrialView.tsx` (1243 lines, 18 components, 17 hooks, 474 lines at ≥5 indent levels), is a textbook God component and the single dominant refactoring target.

**Top 3 hotspots (size × complexity):**
1. `src/studio/views/TrialView.tsx` — God component, 1243 LOC, 156 branch keywords, deepest nesting in the repo.
2. `src/report/transcript-render.ts` — 473 LOC, three near-duplicate ~100–140-line JSONL parsers (`parseTranscript` / `parseCodexTranscript` / `parseClaudeTranscript`) — duplicated code + shotgun-surgery risk.
3. `src/orchestrator/scheduler.ts` + `src/cli.ts` — `runTrial` (140 lines) and `cmdRun` (~193 lines) are long, deeply-branched procedural methods on the critical execution path.

**Worst smells:** God component (TrialView), duplicated stream-parser trio (transcript-render), scattered "large switch on `kind`/`type`" (6 files) creating shotgun-surgery risk, and pervasive primitive obsession (`(o.X ?? {}) as Record<string, unknown>` + ad-hoc `Number()`/`String()` coercion) in the driver/transcript layer.

**Churn caveat:** the repo git history is squashed — every file shows exactly **1 commit** (`git log --oneline -- <file>` returns 1 for all top files). The churn dimension of hotspot analysis is therefore **unavailable**; rankings below use size × static-complexity only. *(Evidence class: EXECUTED — `git log` run per file.)*

---

## Complexity Methodology

All metrics are **STATIC** (derived from source via AST-free lexical analysis) or **INFERRED** (structural reasoning over code read directly). No runtime/coverage instrumentation was available, and no dedicated cyclomatic-complexity tool is installed in the target repo, so cyclomatic values are **estimated proxies**, not tool-verified.

- **Cyclomatic proxy (CC≈):** count of decision keywords per unit — `grep -cE '\b(if|else if|case|catch|while|for)\b|&&|\|\||\?'`. Approximates McCabe CC = decisions + 1. *(STATIC)*
- **Cognitive complexity:** estimated from nesting depth (`grep -cP '^\t{5,}'` = lines ≥5 indent levels) plus branch density, per Sonar's cognitive-complexity model where nesting is penalized super-linearly. *(INFERRED)*
- **Function length:** distance between consecutive top-level function/arrow declarations. *(STATIC, approximate — off by a few lines where nested arrows exist.)*
- **Fan-in/shotgun risk:** number of files switching on the same discriminated-union tag (`kind`/`type`). *(STATIC)*
- **Thresholds** (AQE convention): Method >60 lines = Critical, 41–60 = High; file >500 lines = oversized; params >7 = smell; nesting >6 = critical.

---

## Top Complex Functions

Ranked by combined size × branch-density × nesting. `CC≈` is the lexical cyclomatic proxy; length is approximate.

| # | Function | File:line | Length | CC≈ | Notes |
|---|----------|-----------|--------|-----|-------|
| 1 | `TrialView` (+ 17 nested comps) | `src/studio/views/TrialView.tsx:87` | ~335 (module 1243) | very high | God component; owns fetch, live-stream, transcript ctl, jump-to-evidence, demo runner. 17 hooks, deeply nested JSX. Cognitive complexity is the repo max. |
| 2 | `parseClaudeTranscript` | `src/report/transcript-render.ts:217` | ~139 | high | Nested for-loop over JSONL lines → try/catch → cascade of `if (type===…)` → inner `for (block of content)` with more branching. Long method + primitive obsession. |
| 3 | `runTrial` | `src/orchestrator/scheduler.ts:213` | ~140 | high | `for (attempt…)` retry loop wrapping nested try/catch, abort-signal checks, install loop, env plumbing, sandbox teardown. Critical-path God method. |
| 4 | `cmdRun` | `src/cli.ts:117` | ~193 | high | Top CLI command: arg parsing, cross-vendor/design branching, preflight, provider dispatch. 42 logic lines; mixes parsing + orchestration + I/O. |
| 5 | `parseCodexTranscript` | `src/report/transcript-render.ts:111` | ~106 | high | Near-duplicate of #2 with a different tag vocabulary; same loop/branch shape. |
| 6 | `LiveStream` | `src/studio/views/TrialView.tsx:789` | ~143 | high | Poll + WebSocket merge, `lastLen` cursor, message-type switch, deep nesting inside effects. |
| 7 | `judgeQualityCC` | `src/grading/cc-driver.ts:293` | ~74 | med-high | Nested `for criterion` × `for sample` with retry-on-parse-failure inner branch. |
| 8 | `buildBrackets` + inner `consider` | `src/bracket/bracket.ts:87` | ~44 (+closure) | high | Nested loops over `groups` → `cands` → `trials`; closure `consider` mutates shared `best` map. 60 branch keywords in file (2nd densest). |
| 9 | `seededRounds` | `src/bracket/bracket.ts:206` | ~65 | high | `while (current.length>1)` with inner `for (i+=2)` tree-pairing + bye handling. Classic tournament-tree complexity. |
| 10 | `renderMarkdown` | `src/report/transcript-render.ts:368` | ~49 | med | `switch (t.kind)` over all turn kinds — the third arm of the shotgun-surgery triangle. |
| 11 | `useTranscript` (hook) | `src/studio/views/TrialView.tsx:435` | ~50 | med | Stateful controller returning imperative handle (`open/toggle/load/highlight`) — hidden mutable machine. |
| 12 | `writeFile` (container) | `src/providers/cli-container.ts:333` | ~39 | med | base64 chunk loop (`for i += 65536`) branching on `execCopy` vs pipe path. |
| 13 | `cli()` exec dispatcher | `src/providers/cli-container.ts:54` | ~52 | med | Shell-invocation builder with mode branching. |
| 14 | `runCC` | `src/grading/cc-driver.ts:124` | ~39 | med | Streaming JSON line-parse loop with `if (obj.type==='result')` accumulation. |
| 15 | `bestTurnMatch` / `extractTerms` | `src/studio/views/TrialView.tsx:528` / `:514` | ~30 | med | Scoring loop + a dense multi-alternative regex (`:519`) that is itself a readability hazard. |

---

## Oversized Files (project's own "keep files under 500 lines" rule)

harness-eval's `CLAUDE.md` is not the AQE rule, but the same 500-line maintainability heuristic applies. Files **over 500**:

| File | LOC | Assessment |
|------|-----|-----------|
| `src/studio/views/TrialView.tsx` | **1243** | 2.5× the limit. Should be ~8 files. Critical. |
| `src/dashboard/app.tsx` | **762** | Standalone SPA; leaderboard + trial detail + weight sliders in one file. High. |
| `src/studio/views/Configure.tsx` | **518** | Just over; 13 hooks, config wizard. Medium. |
| `src/cli.ts` | **502** | Command dispatcher; each `cmdX` could be its own module. Medium. |

**Approaching the limit (450–500)** — watch list: `src/report/transcript-render.ts` (473), `src/studio/views/Runs.tsx` (466), `src/studio/views/RunView.tsx` (460), `src/studio/views/BracketView.tsx` (447). The studio/views directory is systematically trending oversized.

---

## Code Smells (Fowler taxonomy)

### 1. God Component / Large Class — **worst smell in the repo**
`src/studio/views/TrialView.tsx` defines **18 functions/components in one 1243-line file** (`TrialView`, `PageNav`, `Section`, `useTranscript`, `Conversation`, `Spinner`, `PulseDot`, `LiveStream`, `TurnBlock`, `Lane`, `Payload`, `Artifacts`, `Stat`, `Demo`, plus helpers `jumpTo/turnText/extractTerms/bestTurnMatch/firstLine/buildOutline`). It owns data fetching, a live WebSocket stream, a transcript state machine, evidence-jump navigation, a demo/cold-start runner, and all their JSX. 17 React hooks in the file, 474 lines at ≥5 indent levels. *(STATIC: line/grep counts; INFERRED: responsibility mapping from reading `:87–420`.)*

### 2. Duplicated Code — the transcript-parser trio
`src/report/transcript-render.ts` contains three parsers with the **same structural skeleton** (split JSONL → per-line try/parse → discriminate on a tag → push normalized `Turn`):
- `parseTranscript` (`:95`)
- `parseCodexTranscript` (`:111`, ~106 lines)
- `parseClaudeTranscript` (`:217`, ~139 lines)

They diverge only in tag vocabulary (`turn.started` vs `system`/`result`, etc.). A shared `parseJsonlStream(line => Turn[])` driver with per-format adapters would remove ~150 duplicated lines. Minor duplication also exists in the UI: the `byKey.get(key) ?? { rows: [], runs: 0 }` grouping idiom is copy-pasted in `Runs.tsx:87` and `Leaderboard.tsx:51`. *(STATIC + INFERRED.)*

### 3. Shotgun Surgery risk — parallel `switch (kind/type)`
The discriminated-union tag is switched on in **6 files**: `TrialView.tsx:487` & `:933` (`turn.kind`), `transcript-render.ts:371` (`t.kind`), `driver/zeroclaw.ts:257` (`sessionUpdate`), `driver/codex.ts:106` (`obj.type`), `providers/factory.ts:69` (`id`). Adding a new turn/session kind forces edits across the renderer, the driver, and the UI simultaneously — the definition of shotgun surgery. *(STATIC.)*

### 4. Primitive Obsession
Driver/transcript code leans on untyped `Record<string, unknown>` bags with inline coercion: `(o.usage ?? {}) as Record<string, unknown>` appears **7× in transcript-render.ts, 5× in zeroclaw.ts, 3× in codex.ts, 2× in claude.ts**, each followed by scattered `Number(x ?? 0)` / `String(x ?? …)`. Raw provider JSON should be parsed once into typed value objects at the boundary rather than re-coerced field-by-field at every use. *(STATIC: grep counts; excerpt at `transcript-render.ts:264–278`.)*

### 5. Long Method
`cmdRun` (`cli.ts:117`, ~193 lines), `runTrial` (`scheduler.ts:213`, ~140), `parseClaudeTranscript` (~139), `parseCodexTranscript` (~106), `LiveStream` (~143). All exceed the 60-line Critical threshold, several by 2–3×. *(STATIC.)*

### 6. Boolean-Parameter Flags (control coupling)
`launch(dryRun: boolean, confirmed: boolean)` (`Configure.tsx:67`) — two-boolean signature yields 4 call-site meanings; prefer an options object or discrete actions. `tab(href, label, active: boolean)` (`frontend.tsx:97`) is the milder variant. *(STATIC.)*

### 7. Deeply Nested Ternaries / JSX conditionals
Readability hazards in the studio views, e.g. `TrialView.tsx:713` (triple-nested `? :` inside a className template), `:970`, `:1097`; `Runs.tsx:87` (`r.summary ? … : r.error ? … : …`); `InverseScaling.tsx:70`. Combined with the ≥5-level indentation, the JSX is hard to trace. *(STATIC.)*

### 8. Feature Envy
`src/dashboard/app.tsx` repeatedly reaches deep into foreign trial structures (`t.grades?.quality?.score`, `t.provenance.*`) to format them — presentation logic that envies the `TrialResult`/grading domain. A `TrialViewModel` mapper would localize this. *(INFERRED.)*

---

## Refactoring Hotspots (prioritized)

Priority = maintainability risk × blast radius. (Churn unavailable — see caveat.)

| Priority | Target | Why | Suggested move | Est. impact |
|----------|--------|-----|----------------|-------------|
| **P0** | `TrialView.tsx` | 1243 LOC God component; deepest nesting; 18 responsibilities | Split into `TrialView` (shell) + `TranscriptPanel`/`useTranscript` + `LiveStream` + `DemoRunner` + `Artifacts` + shared `Section/Stat/PageNav` module | Testability ↑ 3–4× (each piece unit-testable); nesting ↓; unblocks the whole studio dir |
| **P1** | `transcript-render.ts` parser trio | 3× ~100–140-line duplicated parsers; shotgun-surgery epicenter | Extract `parseJsonlStream(mapLine)` + one adapter per format; centralize the `kind` union & its renderers | ~150 LOC removed; single edit-point for new turn kinds |
| **P1** | `scheduler.ts:runTrial` | 140-line critical-path method, retry+abort+teardown tangled | Extract `attemptTrial`, `installDeps`, `teardown`; hoist retry loop to a small policy | Lowers CC on the most execution-critical path; safer to test failure modes |
| **P2** | `cli.ts:cmdRun` | ~193-line command mixing parse+orchestrate+I/O | Extract arg-parsing to a typed options struct; move orchestration into an already-existing service | Command becomes thin; parsing testable in isolation |
| **P2** | `bracket.ts` (`buildBrackets`/`seededRounds`) | 2nd-densest branch file; nested loops + shared-mutable `best` | Extract `groupCandidates`, `pickBest`, pure `buildTree`; replace mutation with returns | Bracket math becomes property-testable |
| **P3** | `dashboard/app.tsx` (762) + `Configure.tsx` (518) | Oversized, feature-envy / boolean-flag | Introduce view-model mappers; split app.tsx per view | Aligns with 500-line rule |

---

## Recommendations

1. **Attack TrialView.tsx first (P0).** It is the single highest-leverage change: it caps the studio-views directory's growth, removes the repo's deepest nesting, and makes the live-stream and transcript logic independently testable. Target ≤8 files of ≤200 lines.
2. **De-duplicate the transcript parsers (P1).** One `parseJsonlStream` driver + format adapters kills ~150 duplicated lines *and* collapses the shotgun-surgery surface for new turn/session kinds into one place.
3. **Introduce a boundary DTO layer for provider JSON.** Parse each provider's raw stream once into typed `Turn`/`Usage` value objects; eliminate the ~17 scattered `(o.X ?? {}) as Record` + `Number()/String()` coercions. Fixes primitive obsession across all drivers at once.
4. **Decompose the two 140–193-line critical-path methods** (`runTrial`, `cmdRun`) into named sub-steps; this is where a defect in orchestration would be most expensive and is currently the hardest code to test.
5. **Enforce the 500-line rule in CI** (Biome is already configured — add a size lint / `wc` gate). Four files breach it and four more are within 40 lines; a gate stops the studio/views drift now.
6. **Replace boolean-flag signatures** (`launch(dryRun, confirmed)`) with option objects or explicit actions to remove control coupling.
7. **Add complexity gates** (e.g., `eslint-plugin-complexity`/Biome `noExcessiveCognitiveComplexity`) with a CC threshold of ~15 to prevent regressions after the above refactors.

**Evidence recap:** file sizes, branch-keyword density, nesting counts, hook counts, duplicate-pattern counts, and function-length estimates are all **EXECUTED** (`find`/`wc`/`grep`/`git log`) or **STATIC**. Cyclomatic values are labeled `CC≈` because they are lexical proxies, not tool-verified; responsibility/feature-envy judgments are **INFERRED** from reading the cited line ranges.
