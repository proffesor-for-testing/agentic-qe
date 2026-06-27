# 02 — MetaHarness Product Analysis (Round 2)

**Repo:** `ruvnet/agent-harness-generator` · **CLI:** `metaharness` · **Library:** `@ruvnet/agent-harness-generator` · **Studio:** https://ruvnet.github.io/agent-harness-generator/
**Evaluator:** AQE fleet (agentic-qe). **Reviewed at:** HEAD `5f63ac6`, `v0.1.15-467-g5f63ac6`, branch `claude/darwin-mode-evolve-polyglot` (checked out as `main`), **2026-06-27**. Static analysis + targeted shell counts; the full test suite was **not executed** (the root `pretest` runs an ordered build that OOMs against this host's shared, cross-platform `node_modules` — flagged, not guessed).
**Prior round:** working-may, 2026-06-15 (`docs/metaharness/02-product-analysis.md`), diffed below.

**Verdict in one line:** The thesis sharpened and the substrate grew a lot (Darwin Mode, a real cost-router, standalone vertical packs, a SWE-bench/DRACO value-score leaderboard), and the *headline-honesty* layer genuinely improved — but the **count/claim contradictions that defined prior P0 #3 are still open and now larger** (196 ADRs sold as "31", ~1,747 tests behind a "568" badge, 9 hosts called "6/four/Six-proposed"), and the example packages still **describe a scaffold they don't actually emit**.

---

## 1. Product thesis & positioning — sharpened, not changed

The core bet is intact and stated more crisply than in working-may:

> "It is not another agent framework. It is a factory for agent frameworks. The model is replaceable. The harness is the product." (`README.md:27-29`)

What's **new since working-may** is a *second* thesis bolted alongside the first — **the harness as cost/quality multiplier**, not just as packaging/governance:

- "**Make older, cheaper models punch like frontier ones.** … putting the *right* model on each task and getting out of the way" (`README.md:82-87`).
- "**Let your harness improve itself.** Every scaffold now ships with **Darwin Mode** … run `npm run evolve` and the harness mutates its own config … keeps only what *measurably* improves. The model stays frozen; the harness evolves." (`README.md:55-60`).
- Darwin's own framing: "**An LLM supercharger and cost optimizer.** Keep your model frozen — evolve the harness around it" (`packages/darwin-mode/README.md:3`).

This is a genuine evolution of positioning. working-may sold "harness = durable governed packaging around a swappable model." Round-2 keeps that and adds "harness = the measurable performance lever" backed by a benchmark arc (DRACO + SWE-bench). The two theses are complementary and the second is now the louder one in the README's "New" block.

**Where the framing still strains (unchanged):** the same multi-layer vertigo (you run `metaharness` → it emits a `harness` → which wraps `@metaharness/kernel` → which loads a host adapter → which calls an LLM; `README.md:271-284`), and the same reliance on the unexplained parent product `ruflo` in lead docs (`README.md:324` "the meta-harness this generator factors apart"; `docs/OVERVIEW.md:18`). Neither prior P1 friction (de-vertigo the stack; bury the ruflo lineage) has been addressed.

**Bottom line §1:** Thesis is stronger and better-evidenced. The conceptual heaviness and ruflo inside-baseball are unchanged.

---

## 2. Personas — stable, with two new ones implied by Darwin/router

The working-may persona table still holds (OSS maintainer + Platform/DevEx remain the sharpest fits). Round-2 adds two:

| Persona | New in round-2? | Job-to-be-done | What they get | Friction |
|---|---|---|---|---|
| **Cost-conscious AI team** | **New** | "Stop paying frontier prices for work a cheap model does." | `@metaharness/router` (`route(query)` → cheapest model predicted to clear a quality bar, `packages/router/src/index.ts`) + Darwin Mode's measured cost-Pareto results. | Router quality depends on *your* eval logs; the headline "frontier-quality at ~1/10th cost" is a DRACO/SWE-bench claim, not a guarantee for arbitrary workloads. |
| **CI/CD maintainer (autofixer)** | **New** | "Hand a failing test, get a verified-fix PR." | Darwin "Test-Driven Repair (TDR)" — 68.3% resolve on SWE-bench Lite *with the acceptance test* at ~$0.01–0.08/instance (`packages/darwin-mode/README.md:30-36`). | The 68.3% is explicitly a *with-test* number, separated from the conformant 34%/52% — honest, but a reader skimming may conflate them. |
| OSS maintainer | (existing, strongest fit) | repo-aware `npx my-repo-agent` | `repo-maintainer` vertical + `harness analyze-repo .` | unchanged |
| Platform / DevEx team | (existing, strongest commercial fit) | one governed org-wide agent | `npx @your-org/your-harness`, default-deny MCP, witness signing | unchanged |
| **Vertical SaaS builder** | (existing, **caveat worsened**) | stand up a domain pod fast | 19 vertical templates + standalone `@metaharness/vertical-*` packs (ADR-013) | The shipped trading scaffold **does not match its own wrapper README** (see §6.6) — a SaaS builder reading the package page is misled about agents *and* safety. |

Weakest personas unchanged: enterprise-governance-today (OIA still `Proposed`, ADR-034) and the ruflo-migration persona (tiny audience).

---

## 3. Major user journeys

### (a) Browser Studio — zero install — **still the most finished thing**
Unchanged in substance: real client-side React/Vite SPA (`apps/web-ui/`), Repo→Harness / Create / Artifact / Verify tabs, in-browser zip download, "nothing leaves your machine." Still the journey most likely to convert a beta tester. (Round-2 note: the Studio generator remains an independent behaviour-port — see §5 parity.)

### (b) `npx metaharness --wizard`
Still a 4-question form (`docs/USAGE.md:34`). The doc-roughness that hurt this journey in working-may is **partly fixed**: the install section now reads "`metaharness` is published to npm (v0.1.x beta)" (`docs/USAGE.md:24`) instead of "Phase 1 development." Good.

### (c) `harness analyze-repo` → scaffold
Smooth and honest, unchanged. Local, deterministic, no code execution (`README.md:113-117`, FAQ `README.md:384-388`). The pre-flight `harness genome <repo>` and the **new** `metaharness score <repo>` ("fit / build-likelihood / safety / cost-per-run report card," `README.md:45-48`) strengthen this journey — a good "know what you'll get before scaffolding" addition.

### (d) Tune + `npm publish` your own org harness — **the best story, now louder**
The "keep only what your repo needs, then ship it as your org's package" narrative (`README.md:62-91`) is unchanged and remains the product's strongest pitch. The unproven-at-scale caveat on `harness upgrade`/`doctor`/`validate` survival against hand-edited harnesses (working-may P1 #7) is **still unaddressed** — no worked drift/upgrade example shipped.

### (e) Day-2 ops + **`npm run evolve`** (new)
The ~21-subcommand day-2 surface is intact. The **new** journey is self-evolution: scaffolds are claimed to wire Darwin in (`@metaharness/darwin`, `npm run evolve`, `--no-darwin` to skip; `README.md:55-60`). The wiring is real in the generator (`packages/create-agent-harness/src/index.ts` + `__tests__/darwin-integration.test.ts` reference it). This is the single biggest new day-2 capability and it is backed by 13,018 LOC and 62 test files in `packages/darwin-mode/`.

---

## 4. Use cases, ranked

**Strong / real (round-2):**
1. **Org-wide branded agent CLI** — unchanged top use case.
2. **Cheap-model-as-frontier via router** — **new and genuinely strong.** `@metaharness/router` is dependency-free, ~130 lines of clean k-NN cost-optimal routing (`packages/router/src/index.ts`), productizing the DRACO Phase-2 finding (ADR-040). Real code, real value.
3. **CI autofixer (Darwin TDR)** — **new**, evidenced (68.3% with-test), high-margin framing.
4. **OSS repo companion agent** — unchanged.
5. **Governed MCP server scaffolding** — unchanged (default-deny + `mcp-scan`).

**Weak / speculative (round-2):**
- **Sensitive verticals as turnkey-safe products** — *worse* than working-may: the trading wrapper now asserts a "non-bypassable risk gate" in `package.json` and README, but the shipped template does not enforce it (§6.6/§6.7).
- **Self-evolving routing** (`docs/USAGE.md:225-250`) — still honestly caveated ("a diagnostic signal, not a proven early-warning lead… bench it").
- Federation / memory-merkle attestation — unchanged exotic, thin demand.

---

## 5. Differentiators — real vs table-stakes (round-2 deltas)

| Differentiator | Real? | Round-2 assessment |
|---|---|---|
| **Default-deny MCP + `mcp-scan`** | **Genuinely differentiated** | Unchanged; still the strongest posture (ADR-022). |
| **Cost-optimal router (`@metaharness/router`)** | **New, real** | Clean dependency-free primitive + optional native/training backends (`src/native.ts`, `src/train.ts`). The most defensible *new* differentiator. |
| **Darwin Mode self-evolution** | **New, real, unusually well-evidenced** | 13k LOC / 62 test files; README separates conformant (34%/52%, no gold tests in loop) from with-test (68.3%) with Wilson CIs and per-number proof links (`packages/darwin-mode/README.md:14-36`). This is the honesty bar the rest of the repo should meet. |
| **DRACO / SWE-bench value-score leaderboard** | **New, substantiated** | `README.md:328-357`: SWE-bench Verified 55.6% (278/500, CI [51.2,59.9]), Lite cascade 51.3%, LiveCodeBench 44→62% via cascade — with explicit "estimate" / variance caveats. Directly rehabilitates prior P0 #1. |
| **Determinism / CLI↔Studio byte-parity** | **Claim retracted in ADR, still asserted in marketing** | ADR-027 now *honestly* states the parity test "was never written, and the two surfaces are not byte-identical," downgrading to behavioural equivalence (`docs/adrs/ADR-027-cli-and-web-ui-integration.md:39-52`). **But `README.md:178` and `examples-packages/README.md:75` still claim "byte-identical."** Fixed in the ADR; stale in the sales copy. |
| **Multi-host breadth** | **Real, broadest in market** | Now 9 host adapters on disk (`packages/host-*`); depth still varies. |
| **Witness-signed provenance** | (out of product scope — see eval report 03) | Real Rust; shipping JS path degradation tracked there. |

---

## 6. Product maturity / beta-readiness

The substrate is more real than ever and the **honesty of headline claims** has improved markedly. The **internal-consistency** layer has not — and because the repo grew ~467 commits, the stale numbers are now further from reality.

### What genuinely improved since working-may

1. **The binary status contradiction is RESOLVED.** All three primary docs now agree: README "**v0.1.x beta** — published and usable" (`README.md:248`); OVERVIEW "**Status**: v0.1.x beta… is published" (`docs/OVERVIEW.md:5`, was "Pre-implementation. The repo does not exist yet"); USAGE "published to npm (v0.1.x beta)" (`docs/USAGE.md:24`, was "Phase 1 development"). This was the worst part of prior P0 #3 and it is fixed.
2. **Example-README transcripts now carry an honesty disclaimer.** Both `examples-packages/trading/README.md:3-6` and `.../research/README.md:3-6` open with "⚠️ **Illustrative output.** Transcripts and validation/run output shown… are representative examples, not captured from a specific run." This is exactly the working-may P0 #4 remediation ("clearly mark transcripts as illustrative").
3. **DRACO/Darwin claims are now substantiated and self-caveated** (§5), rehabilitating prior P0 #1.

### What is still broken (beta-tester landmines)

4. **Count contradictions — STILL OPEN, now larger.** A single discerning reader hits all of these in minutes:
   - **ADRs:** README "(**31** ADRs)" (`README.md:286`); USAGE "the design docs (**21** ADRs)" (`docs/USAGE.md:357`); **actual = 196** files, max `ADR-196`.
   - **Tests:** badge "**568 passing**" (`README.md:13`); Status table "**568/568** across **67** files" (`README.md:263`); **actual = 215 test files, ~1,747 `it/test` cases** (static count; suite not run).
   - **Hosts:** "**nine** agent hosts" (`README.md:125`) vs Status table "**6** host adapters" (`README.md:258`) vs FAQ "**Six** today… GitHub Copilot and GitHub Actions are **proposed**" (`README.md:392-393`) vs USAGE "run on **four** hosts" (`docs/USAGE.md:73`) vs USERGUIDE "Why are there **6** hosts?" (`docs/USERGUIDE.md:172`) vs examples-packages "**8** hosts" (`examples-packages/README.md:79`) — **actual = 9** `host-*` packages.
   - **Subcommands:** "**21** subcommands total" (`README.md:240`) vs Status table "**17** harness subcommands" (`README.md:258-259`) vs USAGE "**20** subcommands total as of iter 112" (`docs/USAGE.md:297`) vs ADR-027 "**12** harness subcommands" (`ADR-027:16`).
   - **Example packages:** "The **19** `@metaharness/*` examples" (`README.md:78-79`) and "All **18** are live on npm" (`README.md:210`) — **actual = 37** package dirs under `examples-packages/` (9 host + 10 vertical + 18 `example-*` SDK showcases from ADR-051, which the README count omits entirely).
   - **Kernel subsystems:** Status table "Rust kernel… **7** subsystems" (`README.md:256`) vs ARCHITECTURE's 8-name list (`docs/ARCHITECTURE.md:31-32`) vs **10** real `.rs` modules + `lib.rs` in `crates/kernel/src/`.
5. **The README "Status" table (`README.md:254-267`) is the single worst offender** — it is stale on hosts (6), subcommands (17), kernel (7), and carries the 568 badge, while the body of the same file says 9 hosts / 21 subcommands. Prior round flagged this table specifically; it has not been regenerated.
6. **The FAQ self-contradicts the Hosts table** on whether Copilot/GitHub Actions ship: FAQ says they are "proposed in ADR-032 and ADR-033" (`README.md:392-394`), but the Hosts table lists both as shipped with concrete artifacts (`README.md:135-137`) and both `packages/host-copilot` and `packages/host-github-actions` exist.
7. **Example packages still describe a scaffold they don't emit (the disclaimer doesn't cover the inventory).** The trading wrapper's "What you get" section is presented as *fact*, not illustrative transcript, and is wrong:
   - **Agents claimed:** `researcher, strategist, risk-officer (non-bypassable), executor, backtester` (`examples-packages/trading/README.md:21-25`). **Agents actually shipped:** `market-watcher, risk-checker, signal-gen, executor, postmortem` (`packages/create-agent-harness/templates/vertical_trading/src/agents/*.tmpl`).
   - **Config claimed:** "`.claude/settings.json` — `PAPER_TRADING=true`, `RISK_GATE=required`, deny-list on any live-order tool" (`README.md:27`) and `policies/risk.yaml` (`README.md:28`). **Actual:** no `PAPER_TRADING`, no `RISK_GATE`, no `policies/risk.yaml` anywhere in the template (grep: NONE FOUND); the only real control is a Claude-Code permission deny `mcp__broker__live_order*` (`.../vertical_trading/.claude/settings.json.tmpl`). The illustrative transcript even shows a *different* deny-list (`broker.live.placeOrder, broker.live.cancelOrder`, `README.md:38`).
8. **The new "non-bypassable risk gate" safety claim is prose, not enforced code.** `package.json` describes the trading pack as having a "non-bypassable risk gate" and the README says the gate "is not bypassable from prompts" (`examples-packages/trading/README.md:64`). The actual `risk-checker` is a **codemod-tier `SYSTEM_PROMPT` string** that *asks* an agent to output APPROVE/REJECT (`.../agents/risk-checker.ts.tmpl`); nothing structurally forces the `executor` to consult it. Real enforcement is limited to the host-level MCP deny rule. A SaaS builder taking "non-bypassable" at face value would be misled — this is the same sensitive-vertical-safety risk flagged in working-may §6, now with a *stronger* unbacked adjective.
9. **CHANGELOG still trails the prose.** `CHANGELOG.md` tops out at **Iter 104** (Unreleased), while the README/USAGE reference iter 110/111/112/113/121 (e.g. `repo-maintainer` "iter 113", `oia-manifest` "iter 121"). Prior round flagged this; unfixed.
10. **One residual "doesn't exist yet" line survives** the otherwise-fixed status reconciliation: `docs/OVERVIEW.md:64` still tells adopters to "Wait for the `create-agent-harness` CLI to exist." Minor, but it's the exact phrasing prior P0 #3 called out.

**First-10-minutes beta-tester experience (round-2):** Better than working-may — they will no longer read "this repo does not exist yet." But they will still count 196 ADRs against a "31" claim, see a 568 test badge over a 215-file suite, get four different host counts in one README, and — if they `npx @metaharness/trading` — find agents and config files that don't match the package's own README. The credibility problem is unchanged in kind and larger in degree.

---

## 7. Top product feedback for Ruv (prioritized)

**P0 — credibility blockers (still open from working-may):**
1. **Generate every count from a single source of truth.** Hosts, verticals, subcommands, example packages, ADRs, and the test number should be emitted into docs from the catalog/filesystem at build time. Today: 196 ADRs sold as 31/21; 37 example packages sold as 18/19; 9 hosts called 6/four/Six-proposed; ~1,747 tests behind a 568 badge. **Regenerate the README "Status" table first — it is the worst offender.**
2. **Reconcile the byte-parity claim with the ADR you already fixed.** ADR-027 honestly retracted byte-identity; `README.md:178` and `examples-packages/README.md:75` still claim it. Change the marketing to "behaviourally equivalent" (the ADR's own wording) or ship the cross-package parity test.
3. **Make example-package "What you get" sections match the scaffold.** Generate the agent/file inventory from real `--scaffold` output. The trading wrapper currently lists agents and config files that the template does not emit — the new illustrative disclaimer covers transcripts but not the factual inventory.
4. **Either enforce "non-bypassable" or stop saying it.** Move the trading risk gate into structural enforcement (e.g. an executor that hard-fails without a signed risk-checker verdict) and prove it, or downgrade the `package.json`/README claim to "default deny on live-order tools + a risk-checker agent."

**P1 — adoption frictions (unchanged from working-may, still open):**
5. Bury the ruflo lineage from the adopter path (README/USERGUIDE/OVERVIEW still lead with it).
6. De-vertigo the naming stack with one early diagram.
7. Prove `harness upgrade` on a hand-edited harness (worked example).
8. Sync the CHANGELOG (iter 104) with the prose (iter 121+).

**P2 — polish:**
9. Fix the FAQ↔Hosts-table disagreement on Copilot/GitHub Actions shipped-vs-proposed.
10. Remove the residual `docs/OVERVIEW.md:64` "wait for the CLI to exist" line.
11. Tighten the still-present 60+ keyword SEO dump (`README.md:411`).

---

## 8. Status vs prior round

| Prior finding | Status | Evidence |
|---|---|---|
| **P0 #1 — DRACO claim falsified by own benchmark** | **Fixed / substantiated** | README reworded to "pick the right model + router; cheap model → frontier-quality at ~1/10 cost" (`README.md:82-87`) and backed by the new leaderboard (SWE-bench Verified 55.6% w/ CI, `README.md:337-354`) + Darwin's per-number-linked README (`packages/darwin-mode/README.md:14-36`). |
| **P0 #3a — binary status contradiction** (production-ready vs "does not exist yet") | **Fixed** | All three primary docs now say "v0.1.x beta, published": `README.md:248`, `docs/OVERVIEW.md:5`, `docs/USAGE.md:24`. |
| **P0 #3b — count contradictions** (hosts/verticals/commands/packages/tests) | **Still open — worse** | ADRs 196 vs "31/21" (`README.md:286`, `USAGE.md:357`); tests ~1,747/215 vs "568/67" (`README.md:13,263`); hosts 9 vs "nine/6/four/Six-proposed/8" (`README.md:125,258,392`; `USAGE.md:73`; `examples-packages/README.md:79`); subcommands "21/17/20/12" (`README.md:240,259`; `USAGE.md:297`; `ADR-027:16`); example pkgs 37 vs "18/19" (`README.md:78,210`). |
| **P0 #3c — README "Status" table stale** | **Still open — worse** | `README.md:254-267` still says 6 hosts / 17 subcommands / 7 kernel subsystems / 568 tests while the same file's body says 9 / 21. |
| **P0 #4a — `apps/web-ui/__tests__/parity.test.ts` named as sole parity guard but absent** | **Partially fixed (ADR honest; claim retracted)** | ADR-027 now states the test "was never written, and the two surfaces are not byte-identical," downgrading to behavioural equivalence (`ADR-027:39-52`). File still absent (`apps/web-ui/__tests__/` does not exist). |
| **P0 #4b — "byte-identical" parity claim** | **Still open in marketing** | `README.md:178` and `examples-packages/README.md:75` still claim "byte-identical" despite ADR-027's retraction. |
| **P0 #4c — fabricated CLI transcripts in example READMEs** | **Partially fixed** | "Illustrative output" disclaimers added (`trading/README.md:3-6`, `research/README.md:3-6`), but the factual "What you get" inventory in `trading/README.md:21-28` still misdescribes the actual scaffold. |
| **Sensitive-vertical safety = prose, not enforced** | **Still open — regressed claim** | `package.json` now asserts "non-bypassable risk gate"; actual `risk-checker.ts.tmpl` is a codemod `SYSTEM_PROMPT`; only real control is the `mcp__broker__live_order*` deny in `settings.json.tmpl`; no `PAPER_TRADING`/`RISK_GATE`/`policies/risk.yaml` exist. |
| **CHANGELOG behind the prose** | **Still open** | `CHANGELOG.md` tops at Iter 104; prose cites iter 113/121. |
| **Cost-router as productized differentiator** | **New** | `@metaharness/router` real, dependency-free k-NN router (`packages/router/src/index.ts`), ADR-040. |
| **Darwin Mode self-evolution (`npm run evolve`)** | **New** | 13,018 LOC / 62 test files in `packages/darwin-mode/`; wired into scaffolds (`create-agent-harness/__tests__/darwin-integration.test.ts`). |
| **`@metaharness/sdk` + standalone `@metaharness/vertical-*` packs (ADR-013)** | **New** | `packages/sdk/src/index.ts` (typed `define*()` helpers); `packages/vertical-base` + `packages/vertical-trading` (publishable template packs). |
| **18 `example-*` SDK showcase packages (ADR-051)** | **New** | `examples-packages/example-{aws,gcp,azure,stripe,slack,…}`; "read-only/sandbox/test-mode by default" framing (`examples-packages/README.md:33-55`). |
