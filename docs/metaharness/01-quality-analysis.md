# 01 — Code Quality Analysis: MetaHarness generator

**Subject:** `ruvnet/agent-harness-generator` → `packages/create-agent-harness/src` (the TypeScript generator — the real product surface).
**Method:** AQE `qcsd-development-review` workflow (ADR-102): parallel dimension finders (TDD-adherence, complexity, coverage-gaps) → **3 blind adversarial refuters per finding** (Loki-mode, ADR-074: refuters see only the bare claim+evidence, default to refuted on uncertainty) → deterministic `finding-verdict@1` synthesis (majority-kill at ≥2/3). **15 raw findings → 5 "confirmed" / 10 "killed."** Plus a **manual re-verification pass** by the orchestrator (see Methodology caveat — it was necessary this run).
**Evaluator:** AQE fleet. **Date:** 2026-06-15. Run IDs: `wf_7614059b-c00` (MetaHarness), with `wf_96344190-f32` discarded (mis-targeted — see caveat).

---

## Headline verdict

**The generator source is genuinely well-tested and reasonably clean — the adversarial pass surfaced no shipping-blocker code defect.** The 5 "confirmed" findings are low/medium *stylistic-complexity* observations (and the upholding panel itself flagged 4 of 5 as borderline false-positives). The 10 "killed" findings were correctly killed — the flagged modules **are** tested — though, importantly, **the automated verification reached that correct verdict via two compensating errors**, which I caught and corrected by hand. Net code-quality gate for the generator: **SHIP-grade on its own merits**; the project-level **CONDITIONAL** comes from cross-cutting issues documented in reports `00`/`02`/`03` (DRACO claim, doc contradictions, fresh-clone build gap, degraded witness path), not from this source tree.

---

## ⚠️ Methodology caveat (read before trusting any verdict below)

This run exposed a real limitation of running the workflow against a repo that is **not** the current working directory (`CWD = /workspaces/agentic-qe`, target = `/workspaces/agent-harness-generator`). Two independent path/scope artifacts compounded:

1. **Mis-targeted first run (discarded).** The workflow's `sourcePath` defaulted to the relative `'src/'`, which resolved against the AQE repo — so the first run reviewed **agentic-qe's own code**, not MetaHarness. Caught from the findings (they cited `src/domains/enterprise-integration/…`, an AQE path), the script was edited to hardcode the absolute MetaHarness path and re-run.
2. **Finder test-scope miss + refuter path-resolution miss (compensating errors).** In the corrected run:
   - The **TDD/coverage finders** searched only the **root** `__tests__/` (43 files) and missed the **co-located** `packages/create-agent-harness/__tests__/` suite (22 files) — producing false "module X is untested" findings.
   - The **refuters** then resolved the findings' **relative** `file` paths (e.g. `packages/create-agent-harness/src/secrets.ts`) against the AQE CWD, found AQE's unrelated `packages/` instead, and killed every one with the reasoning *"this file does not exist."*
   - **Net:** the killed verdict was *correct* (the modules really are tested), but **both stages were operating on wrong information** — the right answer fell out of two opposing mistakes, not sound verification. The complexity finders were unaffected because they emitted **absolute** paths, so their refuters read the real code.

**Consequence:** I did not trust the automated verdicts. I independently re-verified the high-value killed findings against the actual MetaHarness tree (greps below). This caveat is itself a finding — see the note for the AQE team at the end.

---

## Confirmed findings (5) — all complexity, all low/medium, mostly stylistic

All cite real code in `packages/create-agent-harness/src`. None is a correctness or security defect; all are maintainability/readability observations. The adversarial panel *upheld* them only because <2/3 refuters voted to kill — but the dissenting refuter's reasoning (quoted) is often the more useful read.

| # | Finding | File:loc | Sev | Confidence | Panel's own caveat |
|---|---|---|---|---|---|
| 1 | `scanMcp` is an ~86-line function, ~16+ decision points across 3 check groups | `mcp-scan.ts:48-134` | medium | 0.80 | Dissenting refuter: *"a flat, linear, append-only sequence of independent guard checks with near-zero nesting — the textbook false-positive for cyclomatic tooling… each check emits a uniquely-id'd finding, making single-check testing trivial."* |
| 2 | `main()` ~109-line entrypoint mixing routing/wizard/from-existing/scaffold/error-handling | `index.ts:370-478` | medium | 0.75 | Dissenting refuter: *"a CLI entry point's flat guard-clause dispatch ladder… is idiomatic and cohesive, not 5 unrelated responsibilities… a subjective style preference."* |
| 3 | **`runWizard` has 3 near-identical 4-deep `while(true)` pick/validate loops (duplicated control flow)** | `wizard.ts:72-147` | low | 0.70 | **0 refutations — unanimous uphold.** The one genuinely clean finding: the template-loop and host-loop are structurally duplicated and a shared `pickFromList(items, default)` helper would remove the repetition. |
| 4 | `scoreArchetypes` packs chained/nested ternaries into a compact body | `analyze-repo.ts:201-213` | low | 0.60 | Dissenting refuter: *"each intermediate value is bound to a clearly-named const… a single linear-combination formula with no defect — a subjective readability opinion."* |
| 5 | `buildThreatModel` derives ~10 booleans then branches on compound verdict conditions | `threat-model.ts:61-129` | low | 0.50 | Dissenting refuter: *"a cohesive 68-line builder… well under the 500-line guideline… 'split into helpers' is a subjective style preference."* |

**Read:** Only #3 (`runWizard` duplicated loops) is a clean, actionable maintainability nit worth a small refactor. #1, #2, #4, #5 are token-count artifacts where an AST-free cyclomatic estimate mischaracterizes flat dispatch/guard ladders as "god-functions." A team should not chase these. This is, ironically, a good demonstration of *why* the adversarial verification layer exists — it correctly declined to escalate them, and even on the upheld ones recorded the skeptic's case.

---

## Killed findings (10) — re-verified by hand: the modules ARE tested

The workflow killed all 10 TDD/coverage findings. My independent re-verification confirms the **kill verdict is correct** — but for the *real* reason (the tests exist in the co-located suite the finders didn't search), not the refuters' stated reason (which was a path-resolution error). Evidence:

```
packages/create-agent-harness/__tests__/  (22 test files the finders missed)
  ├─ secrets.test.ts     → imports { check, fetch, secretsDispatch, GcloudRunner }; uses a mockRunner — the injectable path IS exercised
  ├─ publish.test.ts     → imports { publishHarness, pinJson }; tests the JWT-required throw
  ├─ federate.test.ts    → drives federateDispatch ['add'], ['list'], ['status'], bad-trust-tier  (the exact "untested subactions")
  ├─ eject.test.ts       → tests planEject 'source does not exist' + applyEject 'target exists'
  ├─ tarball.test.ts     → imports/exercises buildTarball  (so it is NOT dead code)
  ├─ upgrade.test.ts     → tests planUpgrade 'No .harness' throw
  └─ mcp-scan / renderer / witness-client / manifest / validate / registry / …
```

| Killed finding (finder's claim) | Real status after manual re-verification |
|---|---|
| `secrets.ts` (gcloud/npm shell-out) entirely untested | **FALSE** — `secrets.test.ts` covers `check`/`fetch`/`secretsDispatch` via the injectable `GcloudRunner` mock. |
| `federate` add/remove/list/status subactions untested | **FALSE** — `federate.test.ts` tests add/list/status + unknown-trust-tier rejection. |
| `eject.ts` `rewriteContent`/`applyEject` untested | **FALSE** — `eject.test.ts` tests `planEject`/`applyEject` guards. |
| `buildTarball` dead + untested | **FALSE** — `tarball.test.ts` imports and exercises it. |
| `analyze-repo` scoring/CLI untested | **FALSE** — `analyze-repo.test.ts` + `mcp-scan.test.ts` exist co-located. |
| Lib/smoke tests assert structure not behavior | Partly fair in spirit but mis-cited; co-located `renderer.test.ts`/`validate.test.ts` carry behavioral assertions. |

### Residual genuine micro-gaps (low severity, branch-level — the only survivors)

Two *specific branches* do appear uncovered even though their modules are tested — worth a line each, not a blocker:

- **`publish.ts` `pinJson` non-2xx HTTP path.** `publish.test.ts` covers the `PINATA_API_JWT is required` throw but does **not** mock a failed `fetch` to exercise `if (!res.ok) throw` (`publish.ts:70-73`). A `fetch`-mock test would close it.
- **`upgrade.ts` `--conflict=rej` `.rej`-write branch.** `upgrade.test.ts` exercises `planUpgrade` and (per the finder) the inline-conflict path, but no test drives `--conflict=rej` → the `writeFile(target + '.rej', …)` branch (`upgrade.ts:152-154`) is uncovered.

---

## Live build/test reproduction (summary; full detail in `03` §E)

- `npm test` on a **fresh clone → FAILS** (workspace `dist/` resolution: `@metaharness/kernel`, `@metaharness/vertical-base` unbuilt). Root `test` script has **no `pretest` build**. Genuine project gap.
- `npm run build` → **succeeds** (~5.8s, pure `tsc`).
- `npm test` after build → **530 JS tests across 50 vitest files, 0 failures.** (Co-located + root suites together.)
- `cargo` is absent in this container → 86 Rust `#[test]` inventoried from source, not executed.
- The **"568/568 across 67 files"** badge is **directionally true but not exactly reproducible** today (530 JS measured; 530+86 = 616), and is **gated behind a build step the `test` script doesn't run.**

---

## Code-quality gate (QCSD SHIP / CONDITIONAL / HOLD)

| Dimension | Evidence | Gate |
|---|---|---|
| TDD adherence | Modules broadly covered by co-located suites; behavioral + DI-mock tests present; 2 residual branch gaps | **SHIP** (with 2 micro-gaps to close) |
| Complexity | No correctness hotspots; 1 clean duplication nit (`runWizard`); 4 stylistic false-positives the panel itself discounted | **SHIP** |
| Coverage | 530 passing after build; genuine gaps are branch-level (pinJson HTTP-error, upgrade `.rej`) | **SHIP / CONDITIONAL** |
| Build/test reproducibility | Fresh-clone `npm test` fails without a build; no `pretest` | **CONDITIONAL** (process gap, not code) |

**Generator source verdict: SHIP-grade code, CONDITIONAL on the fresh-clone test gap.** The project-level CONDITIONAL/HOLD pressure lives outside this tree (see `00`).

### Recommended actions (this report's scope)
1. **P2** Add a `pretest`/build step (or commit a JS floor) so `npm test` works on a fresh clone — also unblocks the "568" badge claim. *(This is the #2 project P0 in `00`.)*
2. **P3** Close the two branch gaps: a `fetch`-mock test for `pinJson` non-2xx, and a `--conflict=rej` test for `applyPlan`'s `.rej` write.
3. **P3** Optional: extract a `pickFromList()` helper in `wizard.ts` to remove the triplicated pick/validate loop (finding #3).
4. *(Don't act on findings #1/#2/#4/#5 — they're flat-dispatch shapes mis-scored by token-count complexity; the panel's dissent is correct.)*

---

### Note for the AQE team (process finding on our own tooling)
The `qcsd-development-review` workflow has two latent defects when the **target repo ≠ CWD**: (a) the default `sourcePath` is relative and silently reviews the wrong repo; (b) finder agents `grep` a single `__tests__/` and miss **co-located package test suites**, and refuters resolve **relative** `file` paths against CWD and kill valid findings as "file not found." The absolute-path edit fixed (a) for source, but findings/refuters should be forced to **emit and resolve absolute paths**, and finders should **glob all `**/__tests__/` + `*.test.*`**, not one directory. Without these, the verification can produce a right verdict from compensating errors — undetectable without a manual pass. Worth a small hardening PR to `.claude/workflows/qcsd-development-review.js`.
