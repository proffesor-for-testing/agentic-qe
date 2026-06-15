# MetaHarness — Beta-Test Evaluation: Executive Summary

*Subject: `ruvnet/agent-harness-generator` (**MetaHarness**) · v0.1.x · branch `working-may` snapshot.*
*Evaluator: AQE fleet (agentic-qe), on behalf of a Ruv beta-tester request.*
*Date: 2026-06-15. Reports in this folder:*

| # | Report | Covers |
|---|---|---|
| **00** | *this file* | Executive summary, verdict, top actions, cross-pollination |
| **01** | `01-quality-analysis.md` | QCSD adversarial code-quality review of the generator + live build/test reproduction + a process finding on our own tooling |
| **02** | `02-product-analysis.md` | Thesis, personas, 5 user journeys, use cases, differentiators, beta-readiness |
| **03** | `03-technical-capabilities.md` | Kernel subsystems, live WASM/NAPI surface, generator engine, provenance, DRACO |
| **04** | `04-six-hats-cross-pollination.md` | Six Thinking Hats analysis of AQE ⇄ MetaHarness transfer opportunities |

---

## What MetaHarness is

A **factory for agent harnesses**. A CLI (`npx metaharness`) + a 100%-client-side browser Studio that turns any GitHub repo — or a blank slate — into a **branded, npm-publishable AI agent harness**: its own `npx <name>` CLI, default-deny MCP server, scoped memory, governance policy, Ed25519-signed provenance, and per-host config for up to 9 agent runtimes (Claude Code, Codex, pi.dev, Hermes, OpenClaw, RVM, Copilot, OpenCode, GitHub Actions). Its thesis: *"It is not another agent framework. It is a factory for agent frameworks. The model is replaceable; the harness is the product."* In effect it is **ruflo's own unbundling story** — the kernel factored apart from the content so you generate just what your repo needs, owned and branded by you.

---

## Overall verdict: **Strong, genuinely novel tool — beta-quality product whose docs oversell it, with one headline claim that must be retracted.**

MetaHarness is a **well-architected, genuinely useful scaffolding-and-governance engine** with an unusually complete supply-chain story for a v0.1. The product idea ("the harness is the product") is original and defensible, the browser Studio is polished and truly client-side (no backend, no telemetry — verified), the determinism + default-deny MCP + `mcp-scan` + drift detection + 21-subcommand day-2 toolkit are real and differentiated, and the **TypeScript generator that is the actual product is well-tested and clean** (our adversarial code review found no shipping-blocker defect in it). The engineering *culture* is a standout — disciplined ADRs and a benchmark (DRACO) that **published its own negative result rather than burying it**.

**Five things hold it back from "production-ready product":**

1. **The headline value claim is falsified by the project's own benchmark.** README.md:63 sells *"a tuned harness beats a vanilla model… measured, not asserted"* (citing DRACO). DRACO's **ADR-038 (Accepted)** measured the **opposite** at frontier tier — `vanilla 0.7143 > fusion 0.6472 > harness 0.6126`; the 6-stage harness *degrades* −0.10 vs a single vanilla call, and every optimization arm was rejected or tied within noise. The offline tests prove only a *constructed mechanism* (an independent verifier catching one hand-built fabricated citation); the real-corpus *measurement* contradicts the marketing. **This is the #1 thing to flag back to Ruv** (verified against primary sources).
2. **The "Rust + WASM + NAPI kernel / 7 subsystems" story oversells the live runtime.** The kernel is real and well-tested in Rust (~2,259 LOC, 82 tests), but its WASM and NAPI bridges each expose **only 3 functions to JS** (`kernelInfo`, `mcpValidate`, `version`). Hooks/routing/intel/claims/witness/federation/cost are **unreachable from the shipping npm product**; `memory.rs` is a **34-line stub** against an ADR describing an HNSW/ReasoningBank stack. Even the witness path users actually run is **TypeScript** (`witness-client.ts`), which **degrades to `{valid:true}`** when the kernel isn't loaded. The TypeScript generator is where the real product lives.
3. **A fresh clone can't run the test suite.** `npm test` fails on workspace `dist/` resolution because the root `test` script has **no `pretest` build**. After `npm run build` it's green — **530 JS tests, 0 failures** — but the **"568 passing"** badge is CI-only and not exactly reproducible (530 JS + 86 Rust = 616).
4. **Documentation contradicts itself in ways a beta tester catches in 10 minutes.** `docs/OVERVIEW.md` says *"Pre-implementation. The repo does not exist yet"* while README says *"production-ready"*; counts disagree (18≠19 packages, 6≠9 hosts, 17≠20≠21 subcommands; stale Status table). Example-package READMEs show **fabricated `harness doctor` transcripts** and unenforced "paper-by-default / drafts-only" safety claims.
5. **A stated guarantee has zero enforcement.** ADR-027 names `apps/web-ui/__tests__/parity.test.ts` as the *sole* guard for the CLI↔Studio "byte-identical" claim — **that test file does not exist**, and the web generator is an independent port that doesn't import CLI code, so drift would go undetected.

**Bottom line:** treat v0.1.x as *"production-ready release pipeline, beta-quality product, with one headline claim that needs to be retracted or heavily qualified."* The product's own honesty (ADR-038) is its best asset — the README should be brought into line with it.

---

## What we can do with this project

**As a user / for AQE's own purposes:**
- **Mint branded per-repo agent harnesses** across 9 hosts — the per-host adapter breadth is the standout feature (depth varies; Claude Code is richest, others are config emitters).
- **Use it as a governance/provenance layer independent of the generator:** `harness mcp-scan` ("npm audit for agent tools" — a substantive static scanner, not theater), `harness threat-model`, SBOM (SPDX-2.3), `--bundle` secret-redacting support envelopes.
- **Lift reusable assets:** the deterministic, no-exec repo→harness analyzer (`analyze-repo.ts`/`genome.ts`), the atomic writer, the WASM/NAPI/JS-floor loader pattern, and the DRACO eval methodology are each independently valuable.

**As cross-pollination with AQE (full Six Hats analysis in `04`):** the two projects barely overlap — they **compose**. *MetaHarness is a factory with thin domain content; AQE is deep domain content (≈70 QE skills, 60 `qe-*` agents, ~90 MCP tools, the blind-refuter verification pipeline) with no factory.* Highest-leverage moves:

| Move | Direction | Effort | Risk | Why |
|---|---|---|---|---|
| **Extract `@ruvector/adversarial-verify`** (AQE's blind-refuter primitive) | B→A | M | Low | AQE's crown jewel; domain-agnostic; MetaHarness lacks a shippable verifier; **zero coupling** of two young projects |
| **Run `mcp-scan` on AQE's own ~90 MCP tools** | A→B | S | Low | Values-aligned; closes a real governance gap AQE has; ~1 config pass |
| **Repo-genome → auto-recommend QE skills per repo** | A→B | S–M | Low | Fixes AQE's "install everything"; explainable, deterministic |
| **Ship AQE as `vertical:qe`** (genome-tuned, signed, scanned QE harness backed by AQE's MCP engine) | B→A | L | Med | Fills MetaHarness's biggest content gap — but **gate it** on a benchmark (below) |
| **"DRACO-for-QE" benchmark** — prove a verification-gated QE harness beats both vanilla and bare AQE-install | both | M–L | Med | Avoids repeating DRACO's measured loss; regression guard before shipping the composite |

**Recommendation (from `04`):** start with the two **zero-coupling** wins — extract `@ruvector/adversarial-verify` and `mcp-scan` AQE's own tools. Treat the headline `npx metaharness my-repo --template vertical:qe` composite as the **last** brick, gated on the DRACO-for-QE benchmark. Verdict on the composite: **conditional yes**.

---

## Top actions to send back to Ruv (beta feedback)

| Pri | Action |
|---|---|
| **P0** | **Reconcile the DRACO claim.** README says "tuned harness beats vanilla — measured"; ADR-038 (Accepted) proves it doesn't. Retract or heavily qualify; cite the *measurement* (ADR-038), and distinguish "mechanism proven offline" from "aggregate win" (which didn't happen). |
| **P0** | **Make `npm test` work on a fresh clone** — add a `pretest: build` (or commit a JS floor / fix workspace `exports`). This also unblocks the "568" badge. |
| **P0** | **Reconcile the status story** — `docs/OVERVIEW.md` ("does not exist yet") vs README ("production-ready") vs USAGE ("Phase 1"). Pick "v0.1.x beta." Generate all counts (hosts/verticals/commands/packages/tests) from the catalog so 18≠19 / 6≠9 / 17≠21 stop happening. |
| **P0** | **Make CLI↔Studio byte-parity true or stop claiming it** — the `parity.test.ts` ADR-027 calls its "sole enforcement" doesn't exist. Write a real cross-package `Buffer.equal` test or downgrade the claim to "behaviorally equivalent." |
| **P1** | **Right-size the kernel narrative** — be explicit the live runtime is the JS floor + MCP validation + (TS) witness; the Rust subsystems and `memory.rs` are roadmap, not shipped surface. Wire the witness path through the kernel (a literal `TODO` in `publish.ts`) or stop attributing it to "the kernel." |
| **P1** | **Stop fabricating CLI output / unenforced safety in example READMEs** (trading/legal/research). Generate them from real `--scaffold` output or mark transcripts illustrative; move "paper-by-default" into enforced template code. |
| **P2** | Close two branch gaps in the generator (`pinJson` non-2xx HTTP path; `upgrade --conflict=rej`); optionally de-duplicate `runWizard`'s three pick-loops; wire `harness verify` + `mcp-scan` as CI gates. |

---

## Method & provenance of this evaluation

- **Grounded** in the actual repo: read README, USERGUIDE, ARCHITECTURE, OVERVIEW, USAGE, the ADR index + key ADRs (esp. ADR-037/038 DRACO, ADR-022 MCP, ADR-011 witness, ADR-027 parity), the kernel crate, the generator engine, host adapters, the DRACO runs, and the 19 example packages. An `Explore` agent mapped the workspace; three independent deep-read agents produced reports `02`/`03`/`04`; the orchestrator verified the headline DRACO claim directly against ADR-038.
- **Quality (`01`):** ran AQE's `qcsd-development-review` workflow (ADR-102) — dimension finders → **3 blind adversarial refuters per finding (majority-kill, uncertainty→refuted)** → `finding-verdict@1` synthesis — on `packages/create-agent-harness/src`. 15 candidates → 5 confirmed (low/medium complexity nits), 10 killed.
- **Honesty notes (two, both ours):**
  1. The **first** quality-workflow run mis-targeted **AQE's own repo** (the workflow's `sourcePath` defaulted to a relative path resolving against CWD). Caught, corrected to an absolute MetaHarness path, and re-run.
  2. In the corrected run, the verification stage was **partially unsound** — finders missed MetaHarness's **co-located** `__tests__/` suite and refuters mis-resolved relative paths against CWD, so the 10 "killed" coverage findings were killed by *compensating errors*. The orchestrator **manually re-verified** them against the real tree (the modules **are** tested — only two branch-level micro-gaps survive). This is documented in `01`, with a hardening note for the AQE workflow itself.
- **Live reproduction:** `npm install` + `npm run build` + `npm test` were run in the cloned repo; results (530 JS tests pass after build; fresh-clone `npm test` fails pre-build; `cargo` absent) are reported verbatim in `03`/`01`.

*All findings here are confirmed against the MetaHarness source as of the `working-may` snapshot, 2026-06-15.*
