# harness-eval — Code Quality Report

**Analyst:** Code Quality specialist (QE swarm)
**Target:** `/tmp/harness-eval` (harness-eval — TypeScript/Bun framework that ranks agentic coding frameworks by building the same PRD in isolated sandboxes and grading the artifacts)
**Scope:** Code quality only — naming, modularity, separation of concerns, DRY, type safety, error handling, consistency, API design, adherence to the repo's own conventions, dead code, markers, magic values, comment quality. (Complexity metrics are covered by a separate agent.)
**Date:** 2026-07-01

---

## Executive Summary

harness-eval is a **mature, carefully-engineered codebase** with unusually strong type discipline and exceptional comment quality. Domain types are defined once as Zod schemas and inferred everywhere (`src/types.ts`), so the type surface is honest and validated at the system boundary. The hot path (`src/orchestrator/scheduler.ts`) shows genuine production-grade care: infra-vs-candidate failure classification, retry-with-backoff, cooperative cancellation, time-boxed teardown, and provenance persisted at every terminal state.

Signal greps came back clean: **4 `any`** (all `biome-ignore`-annotated at JSON-deserialization boundaries), **0 `@ts-ignore`**, **3 non-null assertions**, **0 truly-empty catch blocks**, **0 stray `eslint-disable`**. All 12 `TODO` markers live inside scaffolding template strings, not real debt. Biome lint + `tsc --noEmit` are wired into the `check` script, and there are 31 test files against 83 source files.

The findings are mostly **consistency and DRY** items plus **one genericity-coupling issue** (the grader hardcodes a single target's domain — "Symphony"/"Linear" — into an otherwise target-agnostic framework). None are correctness-critical.

**Overall maintainability grade: A− (strong).**

---

## Methodology

1. Mapped the source tree and per-directory LOC (`find` + `wc`); confirmed ~16.7K LOC across `orchestrator`, `driver`, `grading`, `providers`, `bracket`, `studio`, `dashboard`, `report`, `live`, `preview`, and root modules.
2. Ran signal greps for type escapes (`: any`, `as any`, `<any>`, `@ts-ignore`, non-null `!.`), markers (`TODO/FIXME/HACK/XXX`), `console.*`, `eslint-disable`, and empty catch blocks.
3. Read the repo's own conventions (`CLAUDE.md` — Bun-first APIs) and cross-checked adherence: `node:fs` vs `Bun.file`, `node:child_process` vs `Bun.$`, `better-sqlite3`/`express`/`dotenv` bans.
4. Read representative core modules in full or in part: `types.ts`, `orchestrator/scheduler.ts`, `grading/evaluator.ts`, `providers/cli-container.ts`, `bracket/bracket.ts`, `report/inverse-scaling.ts`.
5. Inspected every "swallowed" catch body and every `any`/`require()` site to judge intent vs accident.

Read-only throughout; the target repo was not modified.

---

## Strengths

- **Type safety is the standout.** `src/types.ts` (415 lines) defines the entire domain — registry, run config, telemetry, provenance, test plan, grades, results — as Zod schemas with `z.infer` types. Runtime validation and compile-time types share a single source of truth. Refinements encode real invariants: `pinnedVersion !== "latest"` (`types.ts:77`), weights must sum to 1 (`types.ts:108`), candidates must declare ≥1 harness (`types.ts:84`).
- **Comment quality is excellent — comments explain *why*, not *what*.** Examples: the worker-auth OAuth-vs-API-key precedence and its silent-billing trap (`scheduler.ts:269-287`), the teardown time-box rationale (`scheduler.ts:25-28, 344-361`), fatal-step ViBench §3.1 semantics (`types.ts:237-242`). This is institutional knowledge captured inline, not noise.
- **Robust hot-path error handling.** `runTrial` (`scheduler.ts:213-364`) distinguishes infra failures (retried with escalating backoff) from candidate failures (graded as-is, never retried), honors an `AbortSignal` mid-trial, and guarantees sandbox teardown in `finally` with a hard cap so a hung reap can never stall the run. No sandbox leak path.
- **Testable API design via dependency injection.** `SchedulerDeps` (`scheduler.ts:30-73`) makes `driver`, `executeScript`, `archive`, and `now` injectable "for tests" — clean seams, no global reach-in. 31 test files cover providers, drivers, grading, studio, transcripts, durability.
- **Disciplined boundary typing.** The few `any` sites are all at the edge where arbitrary historical JSON artifacts are read, and every one carries a `biome-ignore` with a justification (e.g. `bracket.ts:110` "loose provenance/grades JSON"). Intentional and documented, not sloppy.
- **Security-conscious primitives.** Subprocess calls use `execFile`/`execFileSync` with **array args** (no shell interpolation) rather than the `Bun.$` template form the conventions suggest — a defensible, safer deviation. Secrets are env-only and the archiver redacts.
- **Tooling gate.** `biome.json` present; `check` = `tsc --noEmit && biome check`. Only 5 `biome-ignore` in the whole tree.

---

## Findings

| # | Severity | Area | Location | Summary |
|---|----------|------|----------|---------|
| 1 | Medium | Genericity / coupling | `grading/evaluator.ts:46,57`; `grading/cc-driver.ts:239`; `grading/testplan.ts:9` | Grader system prompts hardcode one target's domain ("Symphony service", "mock Linear GraphQL API") into a framework designed to grade arbitrary targets |
| 2 | Medium | Convention drift | pervasive `node:fs` across ~40 files | Repo's own CLAUDE.md says "Prefer `Bun.file` over node:fs"; codebase mostly uses `node:fs` sync APIs, and only a few files use `Bun.file` — inconsistent idiom |
| 3 | Low-Med | Module system consistency | `providers/cli-container.ts:306-316,358-365`; `targets.ts:101` | Inline `require("node:fs"/"node:child_process"/"node:os")` (CJS) inside an ESM `"type":"module"` project — same modules already imported at top of file |
| 4 | Low-Med | DRY | `bracket/bracket.ts`, `report/inverse-scaling.ts`, `studio/index.ts` | sha→target-name resolution (`targetBySha`/`targetName`) reimplemented three times |
| 5 | Low | Type-safety smell | `orchestrator/scheduler.ts:92-99` | `buildMatrix` smuggles an `_order` field onto plan objects then casts it away (`as { _order: number }`, `as TrialPlan`) to interleave |
| 6 | Low | Boundary typing | `bracket/bracket.ts:111-113`; `report/inverse-scaling.ts:139-141` | `any` params leak untyped field access downstream (`p.prdSha256`, `g.adherence…`); a parsed/narrowed interface would contain the untyped surface |
| 7 | Low | Magic numbers | providers, preview, live | Inline timeouts/sizes (`60_000`, `300_000`, `65536` chunk, `15*60_000` idle) — mostly readable but not all named |
| 8 | Low | Logging consistency | 47 `console.*` sites | Appropriate for a CLI/orchestrator, but prefix convention is uneven (`[scheduler]`, `[preview]` vs bare) and concurrent-worker output can be hard to attribute |
| 9 | Info | Large files | `studio/views/TrialView.tsx` (1243), `dashboard/app.tsx` (762), `studio/views/Configure.tsx` (518), `cli.ts` (502) | No stated line cap in this repo, but the two largest React views are decomposition candidates |
| 10 | Info | Markers | `cli.ts:10,380`; `targets.ts:226-262` | All `TODO`s are scaffolding-template content, not live debt — no action |

### Detail

**#1 — Grader hardcoded to a single target (Medium).**
The framework is explicitly target-agnostic: `targets.ts` loads any target from `targets/`, and the whole premise is ranking frameworks that build "the same PRD." Yet the grading layer bakes one specific target's domain into its prompts:

- `grading/evaluator.ts:46` — ``const EVALUATOR_SYSTEM = `You are a rigorous QA evaluator assessing whether a built implementation of the Symphony service conforms to its specification…``
- `grading/evaluator.ts:57` — "A mock **Linear GraphQL API** is running at the URL in MOCK_LINEAR_URL…"
- `grading/cc-driver.ts:239` — same mock-Linear environment description embedded in the driver prompt
- `grading/testplan.ts:9` — "Symphony §18.1 REQUIRED-for-Conformance items…"

`MOCK_LINEAR_URL` is threaded through `evaluator.ts:68,185` and `cc-driver.ts:189,255` as typed options, so the *plumbing* is parameterized — but the natural-language grader instructions are not. Adding a second target with a different backend would require editing prompt strings, not just config. Impact: reduced reuse and a latent fairness/correctness risk if the hardcoded environment description ever diverges from an actual target. Recommend templating the domain-specific nouns out of the system prompt (target metadata already carries `summary`/`domain`/`shape` in `targets.ts`).

**#2 — CLAUDE.md convention drift on file I/O (Medium).**
The repo's own `CLAUDE.md` states "Prefer `Bun.file` over `node:fs`'s readFile/writeFile." In practice ~40 files import `readFileSync`/`writeFileSync`/`existsSync` from `node:fs`, while a minority (`bracket/bracket.ts:134`, `report/inverse-scaling.ts:152`) use `Bun.file(path).json()`. Both work under Bun, but the split idiom means a reader can't predict which style a given module uses. This is a consistency issue, not a bug — sync config reads are pragmatic — but it contradicts the stated house rule. Pick one and apply it (or relax the rule in CLAUDE.md).

*Note:* the parallel convention "`Bun.$` instead of execa" is deviated from too (`node:child_process` `execFile` used throughout), but that deviation is **defensible on security grounds** (array-arg exec avoids shell injection) and I do not flag it as a defect.

**#3 — CJS `require()` inside an ESM project (Low-Medium).**
`providers/cli-container.ts` uses inline `require("node:os").tmpdir()`, `require("node:fs").writeFileSync(...)`, `require("node:child_process").execFileSync(...)` at lines 306-316 and 358-365; `targets.ts:101` does `require("node:fs")`. The package is `"type": "module"` and these files already `import` from `node:child_process`/`node:fs` at the top. Mixing dynamic `require` into ESM is inconsistent and unnecessary; hoist to top-level `import`s.

**#4 — Duplicated sha→target resolution (Low-Medium).**
`bracket/bracket.ts` (`targetBySha` map + `unknown:<sha>` fallback), `report/inverse-scaling.ts:126` (`targetName`), and `studio/index.ts:58-79` (cached `targetBySha()`) each independently rebuild the "content-hash → target name" mapping with slightly different fallback formatting (`unknown:${sha}` vs `unknown:${sha.slice(0,8)}`). Extract a single helper (natural home: `catalog.ts`, which already owns `targetNames`/`loadTarget`) to prevent drift.

**#5 — `_order` cast smell in `buildMatrix` (Low).**
`scheduler.ts:82-100` attaches a non-interface `_order` field to each plan, sorts via `(a as { _order: number })._order`, then strips it with `as TrialPlan`. It works and the interleave intent is commented, but the double cast defeats the type system for a purely internal ordering concern. A typed `{ plan, order }[]` intermediate or a stable index computation would be cleaner and cast-free.

**#6 — `any` propagation past the JSON boundary (Low).**
The `any`-typed `p`/`g`/`embedded` params (`bracket.ts:111-113`, `inverse-scaling.ts:139-141`) are documented, but downstream code then reads `p.prdSha256`, `p.harness`, `p.model`, `g.adherence.gradedScore`, `g.quality.criteria` with no structural guarantee. Since Zod schemas for these shapes already exist (`TrialProvenance`, `TrialGrades` in `types.ts`), a `.safeParse` or a narrow local `interface` at ingest would keep the untyped surface one line wide instead of flowing into every field access.

**#7 — Unnamed magic numbers (Low).**
Timeout ladders and chunk sizes appear inline: `65536` b64 chunk (`cli-container.ts:342`), `300_000`/`60_000` exec timeouts (multiple providers), `15 * 60_000` idle (`preview/manager.ts:48`, `preview/studio.ts:63`). Readability is helped by `_` separators and nearby comments, and `scheduler.ts` does this right with the named `TEARDOWN_CAP_MS` — that pattern should be extended to the provider timeout ladder and the copy chunk size.

**#8 — Uneven logging (Low).**
47 `console.*` calls, reasonable for a CLI/orchestrator. Some carry component prefixes (`[scheduler]`, `[preview]`), others don't. Under bounded-concurrency workers (`scheduler.ts:141`) unprefixed lines are hard to attribute to a trial. A thin prefixed-logger helper would tighten this without adding a dependency.

**"Swallowed" catches are legitimate.** Every catch body that returns/continues silently does so for a documented reason — non-JSON stream noise (`driver/codex.ts:104`, `driver/claude.ts:66`, `driver/zeroclaw.ts:229`), unloadable targets in best-effort aggregation (`bracket.ts:102`, `inverse-scaling.ts:123`), or `SyntaxError`-only skips (`cc-driver.ts:171`). No accidental error suppression found.

---

## Metrics

| Metric | Value |
|--------|-------|
| Source LOC (src) | ~16,726 (TS/TSX) |
| Source files | 83 |
| Test files | 31 (`tests/` + `src/bracket/scoring.test.ts`) |
| `: any` / `as any` / `<any>` | 4 (all `biome-ignore`-annotated, JSON boundaries) |
| `@ts-ignore` / `@ts-expect-error` / `@ts-nocheck` | 0 |
| Non-null assertions (`x!.`) | 3 (`dashboard/app.tsx`) |
| Empty catch blocks | 0 |
| `eslint-disable` | 0 |
| `biome-ignore` | 5 |
| `console.*` calls | 47 |
| `TODO/FIXME/HACK/XXX` | 12 (all in scaffolding templates) |
| Files > 500 lines | 4 (`TrialView.tsx` 1243, `app.tsx` 762, `Configure.tsx` 518, `cli.ts` 502) |
| Lint/typecheck gate | `biome.json` + `tsc --noEmit` via `check` script |
| Convention source | `CLAUDE.md` (Bun-first APIs) |

---

## Recommendations (prioritized)

1. **(Medium) Detach the grader from a single target.** Template the domain nouns ("Symphony", "mock Linear GraphQL API") out of `EVALUATOR_SYSTEM` (`evaluator.ts:46`) and the `cc-driver` prompt, sourcing them from target metadata. Highest-leverage fix for the framework's stated genericity.
2. **(Medium) Resolve the `Bun.file` vs `node:fs` split.** Either standardize on `Bun.file` per CLAUDE.md, or update CLAUDE.md to bless pragmatic sync `node:fs` reads. Consistency over ideology — just make it one rule.
3. **(Low-Med) Hoist inline `require()` to ESM imports** in `cli-container.ts` and `targets.ts`.
4. **(Low-Med) Extract a single `targetBySha`/`targetName` helper** into `catalog.ts` and consume it from bracket, inverse-scaling, and studio to kill the 3× duplication and fallback-format drift.
5. **(Low) Contain `any` at JSON ingest** with a Zod `safeParse` or narrow interface in `bracket.ts`/`inverse-scaling.ts`.
6. **(Low) Replace `_order` casting** in `buildMatrix` with a typed intermediate.
7. **(Low) Name the provider timeout ladder and b64 chunk size** as constants, following the `TEARDOWN_CAP_MS` precedent.
8. **(Info) Consider decomposing `TrialView.tsx` (1243) and `dashboard/app.tsx` (762)** for editability; not urgent.

---

## Overall Grade: A−

**Justification.** Type discipline (single-source Zod schemas, near-zero escapes, zero `@ts-ignore`), comment quality (rationale-rich, capturing hard-won operational knowledge), and hot-path robustness (failure classification, backoff, cancellation, guaranteed teardown, provenance) put this well above typical project quality. Test coverage footprint and an enforced lint/typecheck gate reinforce it. It falls short of an A only on **consistency**: a target-coupled grader, a house-rule the code doesn't uniformly follow (`Bun.file`), CJS/ESM module-system mixing, and a handful of small DRY/typing/magic-number items. All findings are Medium-or-below and none threaten correctness — this is a codebase to refine, not repair.
