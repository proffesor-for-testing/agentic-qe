# Quality Experience (QX) Analysis — harness-eval

**Target:** `/tmp/harness-eval` (TypeScript/Bun framework that ranks agentic coding frameworks)
**Analyst role:** QX Partner (bridge QA ↔ UX, whole-journey)
**Date:** 2026-07-01
**Method:** Read-only static inspection of README, ROADMAP, CLAUDE.md, `docs/`, `.env.example`, `src/cli.ts`, both web UIs (`src/dashboard`, `src/studio`), launch/safety policy, and failure-classification code. No repo modifications. No live run executed (STATIC/INFERRED evidence classes; nothing here is EXECUTED).

Evidence labels per ADR-105: **STATIC** = derived from reading a named source file; **INFERRED** = reasoning over code/content without execution; **CONJECTURE** = extrapolated heuristic. No finding below gates a release on its own.

---

## Executive Summary

harness-eval is, from a Quality Experience standpoint, a **mature and unusually trustworthy tool for its category**. The product's central quality promise — "definitively rank agentic coding frameworks fairly" — is one where *trust and transparency ARE the user experience*. On that axis the tool excels: every score carries cited evidence, provenance hashes are surfaced in the UI, fairness caveats (cross-vendor judge, within-run speed/spend normalization, inconclusive orderings) are shown inline rather than buried, and real-spend actions are gated behind explicit preflight + confirmation. The Configure→launch→review journey in Eval Studio is coherent and the CLI/UI validation parity is a standout design decision.

The friction is concentrated in three areas: (1) **CLI onboarding discoverability** — there is no `--help`/`help` command, commands are documented only in a file header, and a genuine `bun run test` vs `bun test` footgun is documented but not guard-railed; (2) **time-to-first-successful-run is high and under-scaffolded** — a first-time user must assemble providers, auth tokens, a trial image, and budget mental-model largely by cross-referencing many docs, with no single "hello world" happy path that completes without cloud/Docker/API setup beyond the worktree smoke; (3) **first-run empty-state and expectation-setting** is thin in the CLI path (real spend, multi-minute waits, and what "good" looks like are learned by doing).

Overall QX grade: **B+ (strong)**. Trust/transparency is A-tier; CLI onboarding is the weakest link.

| Dimension | Assessment | Grade (INFERRED) |
|-----------|-----------|------|
| Trust & Transparency | Evidence-cited, provenance-visible, caveats surfaced | A |
| Web UI (Studio + Dashboard) | Coherent IA, live re-weighting, good failure surfacing | A− |
| Error/Failure Experience | Infra-vs-candidate classified, recovery hints present | B+ |
| Safety of Real-Spend | Preflight + confirm dialog + budget envelope | A− |
| CLI Ergonomics | Powerful but low discoverability, a documented footgun | C+ |
| Onboarding & Docs | Rich reference docs, weak guided first-run | B− |
| Accessibility | Semantic HTML, text+icon signals, some gaps | B |

---

## User Personas & Journeys

**P1 — Researcher/Evaluator ("Which framework wins?")** Runs a matrix, reads the leaderboard, re-weights, cites results in a writeup. Cares most about *trust, explainability, fairness caveats*. Best-served persona.

**P2 — Framework/Harness author ("Is my thing being judged fairly?")** Onboards a new harness/provider (`docs/HARNESS-ONBOARDING.md`), needs the fairness invariants to be legible and the failure classification to distinguish "my framework failed" from "the infra failed." Well-served by docs; depends heavily on infra-vs-candidate clarity.

**P3 — Bring-your-own-PRD user ("Evaluate on *my* spec")** Authors `PRD.md` + `testplan.yaml` + fixtures. Faces the steepest authoring curve; `docs/BRING-YOUR-OWN-PRD.md` is good but the testplan authoring loop (write → validate → smoke) is manual.

**P4 — First-time operator ("I just cloned this, now what?")** Highest friction. Must reconcile 5+ setup surfaces (`.env`, providers, trial image, budgets, auth pitfalls). This persona is where most QX debt sits.

### Experience-journey walkthrough (install → first run → read results)

1. **Install** — `bun install`, `cp .env.example .env`. Clean. `.env.example` is well-commented (STATIC: `.env.example`). Friction: a first-timer cannot tell *which* keys are required for the *minimal* path — all nine keys look equally load-bearing. The zero-dependency worktree path actually needs none of them, but that isn't called out at the top.
2. **Validate** — `bun run src/cli.ts validate`. Good: prints registry, target step count, plan/PRD hash prefixes, catalog, and a staleness gate (STATIC: `cmdValidate`). This is a confidence-building first command. Minor: emits raw truncated sha prefixes with no one-line "this means your spec is frozen and unchanged" gloss for newcomers.
3. **First run** — `bun run src/cli.ts run --candidates superpowers --trials 1 --provider worktree`. The README labels this "one smoke trial (worktree = zero-dependency local)." Good default choice. But the run itself is REAL SPEND against a Claude subscription (INFERRED from `cmdRun` + README §Build phase), a fact the *command line* never restates at invocation time the way the Studio confirm-dialog does.
4. **Grade** — separate `bun scripts/grade-trial.ts <run-dir> <trial-id>` step, or `--grade` on the run. The two-step build-then-grade split is powerful (resumable) but non-obvious; a newcomer may not realize their run produced an ungraded artifact.
5. **Read results** — `report <run-dir>` writes `results.json` + `scorecard.md`; `bun run dashboard` serves the leaderboard. Strong payoff: evidence-cited, re-weightable, caveated. This is where the tool's quality shines and rewards the effort.

INFERRED time-to-first-*graded*-result for P4: high (multi-minute build + separate grade step + reading two output formats), with several places to get lost between build and graded scorecard.

---

## CLI Experience

Source: `src/cli.ts` (STATIC throughout this section).

**Strengths**
- **Preflight before spend** — providers with a `preflight` refuse before provisioning when image/daemon/lifetime caps aren't satisfiable, and print `preflight OK: <provider>` (lines 243–252). Excellent fail-before-spend UX.
- **Budget echo at launch** — prints `budget: $X/trial, $Y/run, Nm wall-clock/trial` before running (lines 257–259). Good expectation-setting.
- **Caveats surfaced inline** — cross-vendor judge prints a `⚠ ... recorded as a judge-bias caveat` line (lines 189–193); worker-model routing prints the resolved profile/transport (lines 177–183). The tool tells you what it's about to do.
- **`model probe`** — a 1-token connectivity check with a 150s timeout, clear `✓ probe OK`/`✗ probe FAILED` and last-5-lines-of-stderr on failure (lines 310–365). Textbook actionable auth diagnostic.
- **Validation refusals are specific** — `--trial-minutes must be a positive number, got X` (lines 129–133); `report` usage on missing dir; init usage on missing args.

**Friction / findings**

| # | Where | Observation | Impact | Severity | Improvement |
|---|-------|-------------|--------|----------|-------------|
| C1 | `cli.ts` command dispatch (485–502) | **No `--help` or `help` command.** Usage only prints to stderr *after* an invalid command, exit 2. All per-command flags live in the file header comment (1–22), invisible from the terminal. | New users can't discover commands/flags without opening source. High discoverability tax for P4. | High | Add `help`/`--help` (and `<cmd> --help`) that prints the header block; list every command incl. flags. |
| C2 | Dispatch table (486–494) vs usage string (498) | **`cleanup` is a registered command but omitted from the usage string** (`validate\|init\|catalog\|model\|run\|report`). | Undocumented command; inconsistent surface. | Low | Add `cleanup` to the usage list. |
| C3 | CLAUDE.md line 123 + `package.json` scripts | **`bun run test` vs bare `bun test` footgun.** Bare `bun test` path-matches archived workspaces under `runs/` and fails. Documented, not guard-railed. | A confusing, self-inflicted failure for anyone who types the "obvious" command. Erodes trust on first contact. | High | Add a `bunfig.toml` test-path scope or a root `bun test` guard that prints "use `bun run test` — see CLAUDE.md"; or gitignore-scope the test runner away from `runs/`. |
| C4 | `cmdRun` (117–308) | **REAL SPEND is not restated at CLI invocation.** The Studio has a confirm dialog; the CLI just runs. The word "REAL SPEND" is in the file header, not in the runtime output before builds start. | A user who copies a `run` command from docs may spend before understanding it. Asymmetry with the (safer) Studio path. | Med | Print a one-line spend banner (and, absent `--yes`, a `[y/N]` confirm for non-worktree/real runs) mirroring the Studio budget envelope. |
| C5 | `run` → grade split | Build and grade are separate invocations unless `--grade` is passed; nothing after a build-only run nudges "you have an ungraded artifact; run grade-trial or report." | Silent dead-end between build and scorecard for newcomers. | Med | After a build-only run, print the exact `grade-trial`/`report` next-command (the `init` flow already models this "next:" pattern well, lines 379–382). |
| C6 | Flag ergonomics | Flags are positional-ish via `arg()`/`flag()` scanning `process.argv`; unknown flags are silently ignored (e.g. a typo'd `--canddates` falls back to "all candidates"). | Silent misconfiguration; a typo can launch a bigger/more expensive matrix than intended. | Med | Validate/reject unknown `--flags`; echo the resolved candidate set count (already partially done at line 254–255) *before* preflight so the user can abort. |

The `init` command is the best-designed CLI touchpoint: it scaffolds, prints each created file, and ends with an explicit `next:`/`then:` two-step (lines 375–382). That "tell the user their next command" pattern should be propagated to `run` (C5).

---

## Error / Failure Experience

Source: `src/orchestrator/scheduler.ts` (classification), `src/driver/archive.ts` (redaction), `src/studio/views/Runs.tsx` + `TrialView.tsx` (surfacing).

**Strengths**
- **Infra-vs-candidate failure classification is a first-class concept** (STATIC: `scheduler.ts:102` "Classify a thrown error: infra failures are retried, candidate failures are not"; `isInfraFailure`, `infra-failed` status, bounded infra-retry with backoff at 318–337). This is *the* correct QX model for an eval tool — users must never conflate "the framework under test failed" with "the harness/cloud flaked." Excellent.
- **Recovery hints embedded in error text.** Interrupted runs surface `owner process died — recover: scripts/grade-trial.ts then scripts/finalize-run.ts` directly in the Runs view (STATIC: `Runs.tsx:125`). Actionable, not just a stack trace.
- **Failure reason on the trial drill-down.** `EVAL-STUDIO.md` and `TrialView.tsx` surface a non-completed trial's failure reason, `cappedBy`, and a `complete failure` badge (STATIC: `TrialView.tsx:201, 244`). Capped ≠ crashed is distinguished (`right-censored`/`capped` badges).
- **Error navigator in conversation replay.** The transcript view builds an outline of "every errored tool result" and a cycler to step through run errors one at a time (STATIC: `TrialView.tsx:564, 604–612, 670–680`). This is a genuinely thoughtful failure-forensics UX rare in eval tools.
- **Redaction transparency.** Secrets are redacted from archived transcripts with a counted `[REDACTED:secret]` marker (STATIC: `archive.ts:12, 45–67`); the live stream renders "redacted turns" (STATIC: `TrialView.tsx:786`). Users can *see* that redaction happened rather than wondering what's missing.

**Friction / findings**

| # | Where | Observation | Impact | Severity | Improvement |
|---|-------|-------------|--------|----------|-------------|
| E1 | Redaction | Redaction *count* is computed (`redactions` in `archive.ts`) but I found no place it's surfaced to the user as "N secrets redacted from this transcript." | Transparency is partial — user sees redaction markers inline but not an at-a-glance assurance/summary. | Low | Show "N redactions" on the trial provenance line to close the transparency loop. |
| E2 | CLI failure path | Infra-vs-candidate distinction is rich in provenance/UI but the *CLI* run output's terminal-state messaging for a failed trial is less legible than the Studio's `why?` tooltip. | CLI-only users (P4) get a weaker failure narrative than Studio users. | Med | Mirror the Studio failure-reason text in the CLI end-of-run summary (MCP/CLI parity concern). |
| E3 | Cancellation semantics | Cooperative cancellation ("an in-flight build finishes its step first," `Runs.tsx:142`) is correct but the `cancelling…` spinner gives no ETA/step context. | User may think cancel hung. | Low | Show the current stage next to `cancelling…` ("cancelling — finishing build step"). |

---

## Web UI Experience (Dashboard + Eval Studio)

Sources: `src/dashboard/app.tsx`, `src/dashboard/index.html`, `src/studio/*` (STATIC).

**Information architecture**
- Studio nav is clean and legible: Review / Configure / Inverse-scaling / Bracket / Runs, with active-tab styling and per-route document titles ("CodingHarness — Configure") for good tab/bookmark UX (STATIC: `frontend.tsx:20–46, 95–116`). IA maps cleanly to the user's mental model (configure → launch → watch → review).
- The dashboard (legacy) and Studio deliberately share the **same scoring module** so re-weighting is identical to the CLI's `report --weights` (STATIC: dashboard `reweight()` + `composite`; EVAL-STUDIO.md §Review). This is a major *trust* win: the UI can't silently disagree with the CLI.

**Score clarity — a standout.** Every scoring column carries an info-tooltip with a precise, honest definition (STATIC: dashboard `HELP` map, lines 40–54; studio `ColHead`/`InfoTip`). The definitions actively communicate limitations: Speed*/Token-spend* are explicitly "min-max normalized within THIS run… Not comparable across runs"; PRD adherence explains partial credit and fatal cold-start zeroing; Code quality explains blind judging, medians, and judge≠worker. The `*` asterisks on Speed/Spend, the `±σ` explanation, and the `inconclusive`/`right-censored` badges turn statistical caveats into visible UI affordances rather than fine print. **This is best-in-class for an eval tool.**

**Live re-weighting** is ephemeral, client-side, normalized-to-sum-1, with a reset button (STATIC: `WeightControls`, both UIs). The "(ephemeral, client-side)" label correctly sets the expectation that re-weighting doesn't mutate stored results. Good.

**Configure view** (STATIC: `Configure.tsx`) is the strongest single screen:
- Validation runs on every change via the *same server rules as the CLI* (`/api/validate`, lines 122–155) — CLI/UI parity is enforced, not aspired to.
- Unsupported combinations are *disabled with the reason inline* (provider "— missing DAYTONA_API_KEY", framework "no claude-code section", judge==worker warning) rather than failing on submit.
- Budget envelope badge (`N trial(s) · up to $X · ≤Yh`) + copyable equivalent CLI command + three launch modes (real / dry / copy). This is exemplary progressive disclosure of cost before commitment.
- Provider-aware concurrency default (daytona→1 with a "free tier is ~1" warning) prevents a known overcommit footgun (lines 118–120, 312–316).

**Empty/loading/error states**
- Loading: consistent "loading…" placeholders (dashboard + studio). Functional but minimal (no skeletons).
- Empty: Runs view has a proper empty state with a call-to-action link to Configure (STATIC: `Runs.tsx:244–251`) and a per-filter empty state (273–274). Good.
- Unsupported-schema runs are listed with a regenerate hint rather than crashing (STATIC: README §dashboard; dashboard `RunView` unsupported branch). Resilient.

**Findings**

| # | Where | Observation | Impact | Severity | Improvement |
|---|-------|-------------|--------|----------|-------------|
| U1 | Both UIs | Loading states are bare "loading…" text; no skeleton/there's-progress affordance on slower `/api/runs`. | Minor perceived-latency cost. | Low | Lightweight skeleton rows for the leaderboard/runs tables. |
| U2 | `Configure.tsx` launch | The confirm dialog (real run) is a good gate, but `Launch real run` and `Dry run` sit adjacent with similar visual weight; both are primary-ish. | Small mis-click risk toward the spend action. | Low | De-emphasize Dry run to secondary (it already is `border`), and make the real-run button's spend explicit in its label ("Launch real run — up to $X"). |
| U3 | Dashboard `app.tsx` | Two parallel UIs (legacy dashboard + Studio) exist; README says Studio "supersedes the dashboard once it reaches launch parity." Until then, terminology/feature drift between them is a live risk. | Two front doors; a user could land on the weaker one. | Med | State clearly in README/dashboard which is canonical; add a banner in the legacy dashboard pointing to Studio. |
| U4 | `Runs.tsx` polling | Live polling every 1.5s (queue) / 10s (disk) with no visible "last updated"/pause control. | Fine locally; no user control over refresh. | Low | Optional; a subtle "updated Ns ago" reduces uncertainty during long runs. |

---

## Onboarding & Docs

**Strengths**
- Docs are **numerous, specific, and honest**: `HARNESS-ONBOARDING.md`, `BRING-YOUR-OWN-PRD.md`, `EVAL-STUDIO.md`, `E2B-SETUP.md`, `MACOS-VZ-SETUP.md`, `ZEROCODE-HARNESS.md`, plus `ROADMAP.md` that distinguishes shipped vs branch vs not-built with task counts. Reference-quality.
- README is excellent as a *conceptual* onboarding: the ASCII pipeline diagram, "What the scores mean," default-weights rationale ("a fast, cheap implementation of the wrong thing is worthless"), and the fairness-engineering bullet list all build trust fast.
- `.env.example` documents *why* each key exists and points to where to mint it (STATIC). `CLAUDE.md` §"Hard-won environment facts" is a goldmine of pitfall-avoidance (auth precedence, sandbox stdout, tier caps).
- BRING-YOUR-OWN-PRD encodes real process discipline (hash-freeze, attested vs spec-checklist, mandatory NOTICE for adapted specs, single-candidate smoke before matrix).

**Friction / findings**

| # | Where | Observation | Impact | Severity | Improvement |
|---|-------|-------------|--------|----------|-------------|
| O1 | README Quick start + `.env.example` | No explicit **"minimal zero-setup path"** callout. The worktree smoke needs no cloud keys, but a newcomer reading nine env keys assumes heavy setup. Auth requirement for the *build* (subscription token) isn't separated from provider keys. | Raises perceived onboarding cost; P4 may bounce. | High | Add a "Fastest path (no cloud, no API keys beyond a Claude token)" 3-line block; annotate `.env.example` keys as Required-for-worktree / Cloud-only / Model-provider-only. |
| O2 | README §Quick start | The 5-command quick start mixes worktree smoke with a `grade-trial` step referencing `<run-dir>`/`superpowers-t1` the user must hand-substitute. | Copy-paste friction; the run-dir is a timestamp they must go find. | Med | Have `run` print the exact ready-to-paste `grade-trial` and `report` commands with the real run-dir filled in (ties to C5). |
| O3 | Auth pitfall | The critical auth gotcha (must blank `ANTHROPIC_API_KEY` when using `CLAUDE_CODE_OAUTH_TOKEN` or Claude Code silently bills the API account, CLAUDE.md:134) lives in an internal doc, not in `.env.example` where the user sets both keys. | Silent wrong-account billing — a trust-and-money failure. | High | Move/duplicate this warning into `.env.example` next to the two keys, and have `model probe`/preflight detect "both set" and warn. |
| O4 | Docs discoverability | 15+ docs with no `docs/README.md` index; discovery is via README inline links only. | Users miss relevant guides. | Low | Add a `docs/` index with one-line descriptions. |
| O5 | BYO-PRD loop | Testplan authoring is write→validate→smoke with no linter/dry-checker for common testplan mistakes beyond hash/attestation rules. | P3 iterates slowly. | Med | A `validate --target X --explain` that reports weak checks (e.g. non-observable `check` fields) would tighten the authoring loop. |

---

## Trust & Transparency

This is the product's core quality attribute and its strongest QX dimension.

- **Evidence-or-it-didn't-happen** is enforced and *shown*: every adherence step cites commands+output (STATIC: dashboard/studio TrialView `evidence` in collapsible `<details>`, hover on the step-comparison matrix), every judge criterion carries all raw samples + a written justification (STATIC: TrialView quality table). Users can audit any score to its source.
- **Provenance is visible, not just recorded**: PRD/test-plan hashes, judge model, harness/model/provider, snapshot id, and start/end times render on the run and trial views (STATIC: dashboard `RunView` Provenance block lines 516–523; TrialView provenance line). Drift "fails loudly" (README §Specific features).
- **Fairness caveats are UI-level, not footnotes**: cross-vendor-judge caveat (CLI ⚠ line + `crossVendorJudge` in results), within-run speed/spend normalization asterisks + mixed-candidate-set badge, `inconclusive` when top-two ranges overlap, `right-censored`/`capped` for budget-truncated trials. The tool is conspicuously honest about what it *cannot* claim.
- **Cost-basis honesty**: token-only harnesses (Codex/ZeroClaw) are priced from profile/tokens, never a fake $0 (STATIC: `costSourceForHarness`, cli.ts:196–199), and this basis is recorded per run.
- **Blind judging** on a framework-marker-scrubbed copy with judge≠worker enforced (STATIC: `scrub.ts`, `judgeWorkerRelation`, Configure judge==worker warning).

**Findings**

| # | Observation | Severity | Improvement |
|---|-------------|----------|-------------|
| T1 | The cross-vendor-judge *bias direction* is flagged but not quantified/explained in the UI ("recorded as a caveat" — but what should a reader *do* with it?). | Low | One-line UI note on affected runs: "a GLM judge may systematically favor/penalize — treat cross-vendor code-quality deltas as directional, not absolute." |
| T2 | Speed*/Spend* non-comparability is well-labeled, but the leaderboard *aggregates* across runs by mean; a user could still eyeball cross-run speed bars. The mixed-set badge helps but only triggers on differing candidate sets, not differing runs per se. | Med | Consider visually muting/withholding Speed*/Spend* bars in the cross-run aggregate, or badge them individually as within-run-only in the aggregate table. |
| T3 | Redaction count not surfaced (see E1) — a completeness gap in the otherwise-thorough transparency story. | Low | Surface "N redactions" per trial. |

---

## Accessibility Notes

Sources: `dashboard/index.html`, `studio/index.html`, `frontend.tsx`, view `.tsx` files (STATIC).

**Strengths**
- Semantic HTML: `<html lang="en">` on both UIs; real `<table>/<thead>/<th>`, `<nav>`, `<main>`, `<label htmlFor>` bound to inputs in Configure, `<details>/<summary>` for evidence.
- **Signals are not color-only**: pass/partial/fail use ✅/🟡/❌ *emoji + text label* ("pass"/"partial"/"fail"), status badges carry text ("inconclusive", "capped", "right-censored"), and the spinner has `role="status" aria-label="running"` (STATIC: `Runs.tsx:352–356`). This clears the most common eval-dashboard a11y failure.
- Theme toggle has `aria-label` describing current+next state; theme resolves pre-paint to avoid flash (STATIC: `frontend.tsx:82–92`, `index.html` inline script).
- Sort control is a real `<button>` with the arrow marked `aria-hidden`; error tooltips are button-triggered (keyboard-reachable), not hover-only div soup.

**Findings**

| # | Where | Observation | Severity | Improvement |
|---|-------|-------------|----------|-------------|
| A1 | Dashboard `.tip::after` CSS tooltips (STATIC: `index.html`) | The legacy dashboard's info-tooltips are pure CSS `:hover`/`data-tip` — **not keyboard-focusable and not screen-reader announced**. The scoring *definitions* (the trust payload) are hover-only there. | High (for legacy dashboard) | Use the Studio's Radix `InfoTip` pattern (focusable, ARIA) — or since Studio supersedes the dashboard, deprecate the CSS tooltips. |
| A2 | Emoji-as-data | ✅/🟡/❌ and status emoji lack explicit `aria-label`/`title` in several tables (e.g. integration-tier cells `TrialView.tsx:378–381`). Screen readers may read "white heavy check mark" or nothing consistent. | Med | Wrap data-emoji in a span with `role="img" aria-label="pass"` etc. |
| A3 | Info tooltip content | Long definitional content lives only in tooltips; no always-visible fallback for users who can't hover/focus reliably. | Med | Provide a "Scoring guide" expandable section replicating the HELP text as static content. |
| A4 | Color contrast (INFERRED) | Muted-foreground grays on dark (`#8b949e` on `#0d1117`, and `text-muted-foreground` at 12–13px) may fall below WCAG AA 4.5:1 for small text. | Med | Verify contrast of muted text/badges with an automated pass (axe/Lighthouse); bump muted tokens if under AA. |
| A5 | Charts/bars | The `Bar` data bars encode value by width only; the numeric value is adjacent (good), but bars have no accessible role. | Low | Acceptable given adjacent numerics; optionally `aria-hidden` the bar and keep the number as the source of truth. |

No keyboard-trap, focus-management, or motion-preference (`prefers-reduced-motion` on the spin animations) handling was observed (INFERRED — not exhaustively audited); the spinners animate unconditionally (A6, Low: honor `prefers-reduced-motion`).

---

## Prioritized QX Improvements

**Priority 1 — Trust/safety/first-contact (do first)**
1. **Fix the `bun test` footgun (C3)** — a documented self-inflicted failure on the most obvious command erodes trust immediately. Guard-rail it, don't just document it.
2. **Surface the auth double-key billing pitfall where keys are set (O3)** — this is a real money/trust hazard; move the warning into `.env.example` and detect "both set" in preflight/`model probe`.
3. **Add CLI `help`/`--help` + per-command help (C1)** — the single biggest discoverability lever for P4; the knowledge already exists in the file header.
4. **Fix the legacy dashboard's hover-only tooltips (A1)** — the trust payload (score definitions) must be keyboard/SR accessible, or explicitly deprecate the dashboard in favor of Studio.

**Priority 2 — Onboarding & failure legibility**
5. **Add a "fastest zero-setup path" + annotate `.env.example` by requirement (O1)** — separate worktree-smoke from cloud/model keys so P4 doesn't over-estimate setup.
6. **Print the exact next command after a build-only run, with run-dir filled in (C5/O2)** — close the build→grade→report gap; reuse the `init` "next:" pattern.
7. **Restate REAL SPEND at CLI invocation with an opt-in confirm (C4)** — bring the CLI up to the Studio's safety bar (parity).
8. **Mirror Studio failure-reason narrative in CLI output (E2)** — CLI users deserve the same "why did this trial fail (infra vs candidate)" clarity.

**Priority 3 — Polish & completeness**
9. Reject unknown `--flags` and echo resolved matrix size pre-preflight (C6).
10. Surface redaction counts (E1/T3) and quantify/soften the cross-vendor-judge caveat with a "what to do with this" note (T1).
11. Withhold or badge Speed*/Spend* in cross-run aggregates (T2).
12. Accessibility hardening: emoji `aria-label`s (A2), a static "Scoring guide" fallback (A3), contrast audit (A4), `prefers-reduced-motion` (A6).
13. Declare the canonical UI and add a legacy→Studio banner (U3); add a `docs/` index (O4); loading skeletons (U1).

---

## Evidence & Method Notes

- All source-file findings are **STATIC** (read the named file). Time-to-first-run estimates, contrast concerns, and comparative "best-in-class" judgments are **INFERRED** — no run was executed and no automated a11y/contrast tool was run (would upgrade A4 to STATIC/EXECUTED). CONJECTURE is confined to persona friction extrapolation.
- Not covered (out of scope / not read exhaustively): `InverseScaling.tsx`, `BracketView.tsx`, preview/live-stream internals beyond error surfacing, provider-specific setup docs' accuracy. These are unlikely to change the top-line QX assessment but were not fully audited.
</content>
</invoke>
