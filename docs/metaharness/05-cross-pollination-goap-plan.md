# Cross-Pollination GOAP Plan — AQE ⇄ MetaHarness

**Source of intent:** [`04-six-hats-cross-pollination.md`](./04-six-hats-cross-pollination.md) (Blue Hat action table + sequence).
**Method:** Goal-Oriented Action Planning — A* through a precondition/effect state space, gated on an empirical decision point.
**Repos:** AQE `/workspaces/agentic-qe` · MetaHarness `/workspaces/agent-harness-generator` (`metaharness@0.1.7`).
**Date:** 2026-06-15. **Status:** PLAN (not executed).

---

## Goal state — what "done" looks like

The ecosystem realizes the *verified* subset of the cross-pollination, never on faith:

- **G1.** AQE practices the MCP governance MetaHarness preaches: a default-deny allowlist for its ~90 `mcp__agentic-qe__*` tools, derived from a real `mcp-scan` of its own surface, with HIGH findings resolved or explicitly accepted.
- **G2.** AQE's blind-refuter verification primitive ships as a standalone, domain-agnostic package (`@ruvector/adversarial-verify`) reusable by both projects.
- **G3.** An empirical verdict exists (DRACO-for-QE) on whether a verification-gated QE harness beats both *vanilla model* and *bare AQE-install* on objective QE scorers. **This is the gate that authorizes everything in Phase 2+.**
- **G4 (only if G3 passes).** Per-repo QE tuning (genome→skill subset), `adversarial-verify` embedded as a MetaHarness output gate, a version contract + shared CI, a shippable `vertical:qe` harness, and a *real* `witnessVerify`.
- **G-ABORT.** If G3 shows `vertical:qe ≤ vanilla` (the DRACO pattern repeats), Phase 2/3 are **not** built; #1/#2/#5 ship as standalone wins and the learning is recorded.

**Success is defined by evidence, not delivery:** the headline `vertical:qe` is a *conditional* goal, not a committed one.

---

## Current state (grounded, verified 2026-06-15)

| Fact | Evidence |
|---|---|
| Blind-refuter pipeline exists, single file | `.claude/workflows/qcsd-development-review.js` (7.3 KB): N refuters, blind, default-refuted, ⌈N/2⌉ kill, deterministic JS synthesis |
| Verdict contract exists | `schemas/finding-verdict.schema.json` (`finding-verdict@1`, ADR-103); refuters per ADR-074 |
| AQE MCP surface is large & real | `src/mcp/protocol-server.ts`, `src/mcp/tools/registry.ts` (`QE_TOOLS`), `src/mcp/qe-tool-bridge.ts`; ~90 tools |
| AQE has per-*role* allowlists only, no per-repo scan | `src/mcp/tool-scoping.ts` (role allowlists incl. `allowAll` for admin tiers) |
| AQE installs the full fleet wholesale | `src/init/*-installer.ts` (no per-repo subsetting) |
| AQE generated-install policy files | `.claude/settings.json`, `.mcp.json` |
| AQE has a real, tested Ed25519 chain (internal events only) | `src/audit/witness-chain.ts` |
| MetaHarness scanner / genome / bench all real | `packages/create-agent-harness/src/{mcp-scan,genome,genome-scorers}.ts`; `packages/bench/draco` + `packages/bench/src/draco/` |
| MetaHarness vertical templates are thin scaffolds; no QE vertical | `examples-packages/coding` (test-writer role ~7 LoC); no `vertical:qe` |
| DRACO measured generic harness *loses* to vanilla at frontier | ADR-038 (Accepted): vanilla 0.7143 > fusion 0.6472 > harness 0.6126 |
| MetaHarness witness ships degraded (no JS verifier wired) | `witness-client.ts:74/86`, `publish.ts:106 TODO` (see qcsd-development/05-security-scan HIGH-1) |
| **No AQE↔MetaHarness integration exists today** | zero repo refs to `metaharness`/`vertical:qe` before this folder |

---

## Gap analysis

| Goal | Gap to close |
|---|---|
| G1 | AQE never ran a tool-level security scan on itself; no default-deny allowlist artifact; no CI gate |
| G2 | The refuter logic is trapped in one workflow file, coupled to QCSD-dev phase, agent-driven, kill-rate uncalibrated |
| G3 | No QE-specific benchmark exists; DRACO is generic deep-research; no fixed QE task corpus or objective scorer harness |
| G4 | No genome→skill mapping; no output-gate hook in MetaHarness verticals; no version contract; no `vertical:qe`; witnessVerify unwired |

---

## Action inventory (preconditions · effects · cost)

> Cost legend: **S** ≤ ~2 days · **M** ~1–2 weeks · **L** ~3+ weeks. Risk = chance of forcing a replan.

| # | Action | Pre | Effect | Cost | Risk | Dir |
|---|---|---|---|---|---|---|
| A1 | `mcp-scan` AQE's ~90 tools → default-deny allowlist | MetaHarness `mcp-scan` runnable; AQE tool registry readable | G1; dogfood artifact | S | Low | B→A |
| A2 | Extract `@ruvector/adversarial-verify` | refuter file + schema stable | G2; reusable primitive | M | Low–Med | A→shared |
| A3 | **DRACO-for-QE benchmark** (vanilla / AQE-install / vertical:qe / +verify) | A2 (for the +verify arm); QE corpus defined | G3 verdict (**the gate**) | M | Low (valuable either way) | both |
| A4 | Genome → QE-skill subset recommender | A3 PASS; genome profile + skill→profile map | per-repo tuning | M | Med | both |
| A5 | MetaHarness embeds `adversarial-verify` as optional output gate | A2 published | verticals get earns-its-cost verification | S | Low | A→B |
| A8 | Version contract + shared integration CI | intent to deeply couple | safe coupling substrate | M | — (enabler) | both |
| A6 | `vertical:qe` minted harness | **A3 PASS** + A4 + A5 + A8 | headline composite product | L | **High** | both |
| A7 | Finish `witnessVerify` w/ AQE Ed25519 chain; sign delivered findings | A6 (or standalone) | real provenance, not theater | L | Med | A→B then B→A |

---

## The plan (A* sequence with the empirical gate)

```
Phase 0  (now, parallel, zero cross-coupling):   A1  ||  A2
Phase 1  (THE GATE):                             A3  DRACO-for-QE
            ├─ if vertical:qe  >  vanilla AND > AQE-install ─► proceed to Phase 2
            └─ if vertical:qe ≤ vanilla ───────────────────► ABORT (see below)
Phase 2  (only on PASS, parallel):               A4  ||  A5
Phase 3  (only if Phase 2 lands, sequential):    A8 → A6 → A7
```

**ABORT condition (G-ABORT):** if A3 shows `vertical:qe ≤ vanilla` on the QE scorers, **STOP at Phase 2**. Ship A1, A2, A5 as standalone wins (they pay off regardless), record the negative result as an ADR (mirroring DRACO's honesty), and do **NOT** build A6/A4-as-product. The composite is conditional, not committed.

**Highest-leverage first move:** A2 (extract `adversarial-verify`), with A1 as a same-sprint quick win — both deliver value with *no coupling* of the two pre-1.0 projects.

---

## Per-action: implementation · integration · verification

### A1 — `mcp-scan` AQE on itself → default-deny allowlist  *(Phase 0, B→A, S)*
**Implementation**
1. Build MetaHarness once (`cd /workspaces/agent-harness-generator && npm run build`) so `harness mcp-scan` runs.
2. Emit a policy snapshot of AQE's surface: enumerate `QE_TOOLS` from `src/mcp/tools/registry.ts` + role rules in `src/mcp/tool-scoping.ts` into the `.harness/mcp-policy.json` / `.claude/settings.json` shape `scanMcp` expects.
3. Run `harness mcp-scan` against it; capture HIGH/MED/LOW.
4. Triage HIGH (expect: not-default-deny, `allowAll` admin tiers, wildcard `mcp__*`, any shell-allow). Author a **default-deny** allowlist that opts *in* only the tools each role needs.
5. Wire `mcp-scan` (exit 1 on HIGH) as an AQE CI gate.

**Integration points:** `src/mcp/tools/registry.ts`, `src/mcp/tool-scoping.ts`, `.claude/settings.json`, `.mcp.json`, AQE CI workflow.
**Verification:** (a) scan runs and produces a report; (b) post-allowlist re-scan = **0 HIGH**; (c) full QE suite still green under the tightened allowlist (no tool starved); (d) CI fails on a deliberately-reintroduced HIGH. **Deliverable:** the scan report doubles as a co-marketing artifact (largest real MCP surface scanned).

### A2 — Extract `@ruvector/adversarial-verify`  *(Phase 0, A→shared, M)*
**Implementation**
1. Factor the pure logic out of `.claude/workflows/qcsd-development-review.js`: `verify(findings, {refuters:N, killThreshold:⌈N/2⌉, judge})` → `finding-verdict@1` envelopes.
2. Define a host-agnostic `Judge` interface (inject the LLM call) so the package has no AQE/agent dependency; keep deterministic JS synthesis in-package.
3. Vendor `schemas/finding-verdict.schema.json`; validate output at the boundary.
4. Harden beyond the single QCSD-dev phase: parametrize the claim/evidence shape; remove phase-specific assumptions.
5. **Calibrate the kill-rate**: build a labeled fixture set (known-true + known-false findings) and measure false-kill / false-keep; tune default `N` and threshold; document the operating point.
6. Publish under `@ruvector/*`; AQE re-consumes it in its workflow (dogfood).

**Integration points:** new package; AQE workflow imports it back; MetaHarness consumes it in A5.
**Verification:** (a) unit tests on synthesis (k-of-n math, default-refuted on uncertainty); (b) calibration report (false-kill rate on the labeled set, target stated); (c) AQE's `qcsd-development-review` produces *identical* verdicts after swapping to the package (regression parity); (d) zero AQE/Claude-Code import in the package (grep).

### A3 — DRACO-for-QE benchmark  *(Phase 1 — THE GATE, both, M)*
**Implementation**
1. Define a fixed QE corpus: N repos/modules with ground-truth (known bugs/mutants, known coverage gaps).
2. Objective scorers (no LLM judge needed): **coverage delta, mutation kill-rate, false-finding rate**, latency, token cost.
3. Four arms: (a) vanilla model, (b) bare AQE-install, (c) `vertical:qe` prototype, (d) `vertical:qe` + `adversarial-verify`.
4. Reuse MetaHarness DRACO harness shape (`packages/bench/src/draco/`) for runner/scorer/ablation plumbing.
5. Run with confidence intervals (n≥20 per arm), publish results as an ADR — **including a negative result** if that's what happens.

**Integration points:** `packages/bench/` (MetaHarness) or an AQE `bench/` mirror; A2 for arm (d).
**Verification / gate criteria:** arm (c) or (d) must **beat both (a) vanilla and (b) AQE-install** on the primary scorers with margin beyond noise. **PASS → Phase 2. FAIL/TIE → ABORT.** Either outcome is a shippable finding.

### A4 — Genome → QE-skill subset recommender  *(Phase 2, both, M)*
**Implementation**
1. Consume MetaHarness `repo-profile.json` (languages, CI, test commands, MCP surface) from `genome.ts`/`analyze-repo.ts`.
2. Author a deterministic, explainable skill→profile mapping (e.g. SAP repo → `qe-sap-rfc-tester`+`qe-sod-analyzer`; React → `qe-visual-tester`+`qe-accessibility-auditor`).
3. Emit a recommended *subset* of AQE's 60 agents / ~70 skills with rationale per pick.
4. Feed the subset into AQE installers (`src/init/*-installer.ts`) to replace wholesale install.

**Integration points:** `genome.ts` (read), `src/init/*-installer.ts` (write), skill catalog.
**Verification:** (a) deterministic output for a fixed profile (no `Math.random`/`Date.now`); (b) curated golden repos get the expected subset; (c) recommended subset still passes that repo's QE smoke; (d) explanation present for every pick.

### A5 — MetaHarness embeds `adversarial-verify` as output gate  *(Phase 2, A→B, S)*
**Implementation**
1. Add an optional per-vertical `verify` hook that routes a finding/claim through `@ruvector/adversarial-verify` before the harness acts/emits.
2. Make it opt-in in the vertical template config; default off for cheap verticals.
3. Surface verdicts in harness output + (later) witness.

**Integration points:** MetaHarness vertical template config; host adapters (`packages/host-*`); A2 package.
**Verification:** (a) a seeded false claim is killed by the gate; (b) a true claim survives; (c) gate is no-op when disabled (cost neutral); (d) added latency/token cost measured and documented.

### A8 — Version contract + shared integration CI  *(Phase 3 prereq, both, M)*
**Implementation**
1. Pin stable contracts: AQE tool-signature manifest, MetaHarness genome/host-adapter schema, the (real) witness format.
2. SemVer + compat matrix; deprecation policy; single named owner for `vertical:qe`.
3. Shared CI job that runs **both** repos' tests against the integration on each change.

**Integration points:** both repos' CI; a published contract schema.
**Verification:** (a) a breaking change in either contract fails the shared CI; (b) compat matrix documented; (c) owner + deprecation policy recorded in an ADR.

### A6 — `vertical:qe` minted harness  *(Phase 3, both, L, GATED on A3 PASS)*
**Implementation**
1. Author a `vertical:qe` template backed by AQE's MCP engine, the A4 recommender, and the A5 verify gate.
2. `npx metaharness my-repo --template vertical:qe` → branded, genome-tuned, mcp-scanned QE harness with only the repo's needed agents.
3. Ship default-deny MCP (reconcile AQE's ~90-tool surface with MetaHarness's minimal-surface posture — real design work, not wiring).

**Integration points:** MetaHarness template catalog + host adapters; AQE MCP engine; A4/A5/A8.
**Verification:** (a) minted harness passes `harness validate` + `mcp-scan` (0 HIGH); (b) re-runs the A3 scorers and **still beats vanilla** on a *held-out* repo set (no overfit to the benchmark); (c) `harness upgrade` survives a hand-edit; (d) no version-skew break under A8 CI.

### A7 — Finish `witnessVerify` with AQE's Ed25519 chain  *(Phase 3, A→B then B→A, L)*
**Implementation**
1. Point AQE's working `src/audit/witness-chain.ts` at *delivered findings* (not just internal events).
2. Contribute a working JS verifier back to MetaHarness to resolve `publish.ts:106 TODO` and replace the `witness-client.ts` degraded `{valid:true}` path — **fail closed** when no verifier (ties to qcsd-development HIGH-1).
3. Wire verify into `vertical:qe` publish.

**Integration points:** `src/audit/witness-chain.ts` (AQE), `witness-client.ts`/`publish.ts` (MetaHarness).
**Verification:** (a) a tampered witness **throws** on publish (the HIGH-1 regression test); (b) sign→verify round-trip on delivered findings; (c) no path returns `valid:true` without real crypto.

---

## Risk factors & replanning triggers

- **R1 (gate fails):** A3 shows no QE win → ABORT to Phase 2; convert A6 effort into shipping A5 as a standalone product. *(Primary, planned-for branch.)*
- **R2 (refuter over-kills):** A2 calibration shows high false-kill → keep AQE-internal until tuned; don't publish a mis-calibrated primitive.
- **R3 (governance clash):** A1/A6 reveal AQE's ~90-tool surface can't be reconciled with default-deny without crippling QE → scope `vertical:qe` to a curated tool subset; re-plan A6.
- **R4 (version skew):** two pre-1.0 projects drift → A8 must precede A6; if A8 slips, do not start A6.
- **R5 (opportunity cost):** integration displaces unfinished cores (AQE's 4 missing QCSD phases; MetaHarness's 8 unwired kernel subsystems + witness) → cap cross-pollination at Phase 0/2 standalone wins until cores stabilize.

**Replanning triggers:** any action's precondition no longer holds; A3 result (the big fork); calibration/governance findings in A1/A2; A8 contract instability.

## Fallback

If deep coupling proves unwise at any point, the **decoupled wins stand alone**: A1 (AQE self-governance), A2 (`@ruvector/adversarial-verify` as ecosystem IP), and A5 (verify gate for any vertical) each deliver value with zero composite product. That is the floor; the `vertical:qe` factory (A6) is the conditional ceiling.

---

*Plan prepared via GOAP grounded in a file-level audit of both repos. No code executed beyond read-only verification of integration points. Phase 2+ is conditional on the A3 empirical gate — by design.*

---

## Plan update — 2026-06-17 (after pulling MetaHarness main + Ruv's ADR-150)

**Trigger:** pulled MetaHarness `main` (+57 commits, `367ce6e → 61e6819`, now `v0.1.15`) and analyzed Ruv's **ADR-150** "Ruflo × MetaHarness Integration — OIA-Layered Walkthrough" ([gist](https://gist.github.com/ruvnet/9056701d13d5a5b5148d0459ff10b7c3)). ADR-150 does *into ruflo* what this plan proposes for AQE, so several actions are now de-risked or already built upstream.

### The A3 gate just got a strong prior — it leans **G-ABORT**

`ADR-038` is now **Accepted** in the pulled MetaHarness tree: the DRACO ceiling finding is *airtight and mechanistic* — at the frontier, vanilla (0.7143) > fusion (0.6472) > generic harness (0.6126), and every optimization arm (augment-verify→prune, self-consistency best-of-N, composite per-dimension selection) landed **within noise or lost** to vanilla. This is exactly the pattern the A3 gate was built to detect. **The DRACO-for-QE benchmark has NOT been run**, so the gate is not formally closed — but the upstream prior now strongly predicts a tie/loss for a generic `vertical:qe`. **Recommendation: treat A6 as unlikely-to-build; front-load the standalone wins (A1/A2/A5) and only run A3 to confirm the negative before formally invoking G-ABORT.**

### Actions changed by upstream work

| # | Was | Now (post-pull) |
|---|---|---|
| A1 | Build an `mcp-scan` self-governance gate from scratch | **Consume, don't build.** MetaHarness ships `mcp-scan --json` (`cf72072`, v0.1.15), the `metaharness score <repo>` scorecard (ADR-041), and 7 OIA MCP tools incl. `metaharness_mcp_scan` / `metaharness_threat_model`. A1 shrinks to: run these against AQE's ~90-tool surface + wire the CI gate. |
| A3 | Open empirical question | Strong prior toward FAIL (ADR-038 Accepted). Still worth running to *confirm* the negative cheaply. |
| A6 | Conditional ceiling | **Likely not built** — the prior predicts no QE win at the frontier. |

### New candidate actions lifted from ADR-150 (standalone, no coupling)

- **A9 — Graceful-degradation architecture** *(S, low risk)*: adopt ADR-150's `optionalDependencies` + `MODULE_NOT_FOUND → {degraded:true}` + CI "absent drill" pattern. Pays off twice: (1) fixes the `@ruvector/ruvllm` optional-dep fragility that keeps breaking Dependabot lockfiles (it broke PR #540), and (2) is the clean substrate for database-free mode (issues #533/#535). Highest leverage of the new items.
- **A10 — KRR cost-optimal router** *(M, med risk)*: lift ADR-150 L3 (Kernel Ridge Regression + k-NN quality predict + Thompson-sampling bandit shadow + 3-criterion AND-gate promotion: `quality +>2% AND cost +<1% AND p95 +<5%`) into AQE's `model_route`/`routing_economics`. AQE router confidence sits at ~40% across 2165 requests — concrete upside.

### Cross-link

ADR-150's discovered `spawnSync` `shell:false` bug (args-with-spaces silently triggered graceful degradation, masking a real failure) is the **same bug class** as AQE **#528** (`agentic-qe mcp` double-spawned with `stdio:'inherit'`, dropping stdin → premature shutdown). #528 is fixed on `fix/528-mcp-in-process` (server now runs in-process; reproduction + regression test added). Lesson carried over: *graceful degradation is insufficient on its own — prove the non-degraded path works.*

---

## Plan update — 2026-06-24 (reconcile against the Darwin-for-QE lane + measured D3 + Ruv's oracle arc)

**Status of this plan: PARTLY OBE.** Two things overtook it: (1) the [Darwin-for-QE lane](./06-darwin-qe-self-learning-action-lane.md) built and measured a *different* product than this plan's headline; (2) Ruv's `agent-harness-generator` `main` advanced +~50 commits (now `6fa4c25`, ADR-178→184) with an **oracle research arc** that supplies the missing piece for AQE's open work.

### The gate resolved, and the committed product pivoted

This plan's spine was **A3 (gate) → A6 (`vertical:qe`, conditional headline)**. Both moved:

- **A3 — effectively resolved as G-ABORT for the generic composite, by a re-framed measurement.** The *literal* A3 arms (vanilla / bare-AQE-install / `vertical:qe` / `+verify`) were **never run**. Instead lane-06's **D3** ran cheap-local / best-of-k / frontier / escalate on a 5-module corpus (n=30) and measured **§11 "coder binds" — frontier > cheap in 5/5 modules**. That *is* the load-bearing prior for A6's G-ABORT, now empirical rather than inherited from ADR-038.
- **A6 (`vertical:qe`) → RETIRE.** The generic harness-beats-frontier composite is confirmed G-ABORT; do not build it as a product.
- **A NEW committed product emerged that this plan never contained:** the **asymmetric escalation lane (ADR-111**, Accepted-scoped) — cheap-first → repair → best-of-k → escalate, ~frontier QE quality at ~83% tasks $0-local. The ceiling moved from A6 → ADR-111.

### Status of every action

| # | Action | Status (2026-06-24) |
|---|---|---|
| **A1** | mcp-scan → default-deny allowlist + CI gate | **DONE (2026-06-24).** See "A1 — completed" below. 0 HIGH, CI gate fails-closed, drift-guard test. |
| **A2** | Extract `@ruvector/adversarial-verify` | **NOT STARTED.** Refuter still in the workflow file. Cleanest zero-coupling IP win. |
| **A3** | DRACO-for-QE gate | **Resolved (re-framed) → G-ABORT for generic composite** (D3, n=30). |
| **A4** | Genome → QE-skill subset recommender | **NOT STARTED.** Standalone value remains (per-repo install vs wholesale). |
| **A5** | MetaHarness embeds verify gate | **NOT STARTED** (blocked on A2). |
| **A6** | `vertical:qe` minted harness | **RETIRED** (G-ABORT confirmed). |
| **A7** | `witnessVerify` w/ Ed25519 chain | **NOT STARTED.** Still internal-events only. |
| **A8** | Version contract + shared CI | **NOT STARTED (de-risked).** AQE still uses the structural type-mirror (`src/integrations/darwin/`); ruflo now *publishes* `@metaharness/darwin` so pinning it is concrete. |
| **A9** | Graceful-degradation architecture | **NOT STARTED.** High-leverage (optional-dep/Dependabot fragility). |
| **A10** | KRR cost-optimal router | **NOT STARTED.** The lane-06 D7–D9 escalation+feedback lifts the 40% confidence from the *outcome* angle, but the KRR predictor/bandit is untouched. |

The lane-06 work (escalation lane / ADR-111) is **net-new** — it did **not** advance A1/A2/A4/A5/A7/A8. The decoupled "floor" of this plan (A1, A2) is still the highest-value undone work, exactly as the original "highest-leverage first move" called it.

### New actions lifted from Ruv's oracle arc (ADR-178/182/183/184) — they answer lane-06's open gaps

The devil's-advocate review of lane-06 left two open holes; Ruv's last-24h arc supplies the principled fix for both:

- **A11 — Writer≠evaluator LLM-judge discriminator** *(M, the high-value one)*. lane-06's production oracles are **writer-evaluated structural proxies** (test+assertion regex; Gherkin structure) — Goodhart-prone (the DA's deepest finding). **ADR-178** (Best-of-N selection *without gold* via a separate LLM-judge, SWE-Search 73–84% selection accuracy) + **ADR-183** (`reproValid ∧ judgeOK ∧ passOnFix`, *writer ≠ evaluator*, **precision-validated against ground truth before trusting it**) is the answer: replace AQE's best-of-k *picker* with a separate cheap judge, and **validate that judge's precision against the mutation-kill ground truth offline** (AQE *has* that oracle — its structural advantage over SWE-bench). Kill it if it doesn't separate kill-rate-pass from kill-rate-fail ("a hallucination filtering a hallucination").
- **A12 — Cold (not warm) + cross-model escalation** *(S)*. **ADR-182**: warm-starting the escalated tier with the failed cheap reasoning causes *correlated* failure, shrinking the union — escalate **cold/fresh**. AQE's `FreeTierEscalatingExecutor` currently feeds the failed attempt forward (repair messages) = **warm** → a measurable improvement is a cold escalation path. **xbo** (cross-*model* Best-of-N "union-raiser"): AQE's best-of-k varies temperature+prompt on one model; varying the *model* raises the union more.
- **A13 — Cost-Pareto Value-Score framing** *(S, reporting)*. Ruv now leads with **quality-per-$** (Cost-Pareto leaderboard, Value Score), not absolute resolve — exactly ADR-111's "competitive cheaper than frontier" stance. Adopt the same headline metric for AQE trust tiers; pair with the **Agent Registry / measured-role-fit** idea (= lane-06 task #4, per-preset QE bench: assign models to QE roles by *measured* fit, not vendor rank).

### Forward plan (this session)

1. **Finish A1** — snapshot AQE's MCP surface to `.harness/mcp-policy.json`, run `metaharness mcp-scan`/`metaharness_mcp_scan`, author the default-deny allowlist, wire the CI gate. (Memory gotcha: mcp-scan false-negatives on `.mcp.json` layout → snapshot the policy file first.)
2. **A2** — extract `@ruvector/adversarial-verify` (calibrate kill-rate; dogfood back into the workflow).
3. Then the new oracle ideas, **A11 first** (it closes ADR-111's biggest open caveat and is independently measurable at ~$1, mirroring Ruv's ADR-183 discipline).

A4/A7/A8/A9/A10 remain standalone candidates; A6 is retired.

### A1 — completed (2026-06-24)

Closed G1. The original "default-deny OFF, score 54/C" reading was a **scan false-negative**: MetaHarness `scanMcp` only inspects `.claude/settings.json` `mcpServers`, but AQE declares its server in `.mcp.json` → "No MCP surface" (INFO). Two grounded corrections + the deliverables:

- **Enforcement was already default-deny.** `src/mcp/tool-scoping.ts` `isToolAllowed()` falls through to `return false`; only `fleet-admin`/`unrestricted` carry `allowAll`. The interface doc-comment *claimed* "empty/undefined → allowAll" — the opposite of the code; **fixed** (it denies). Added `ALL_AGENT_ROLES` export.
- **Host permissions were already clean** — `.claude/settings.json` scopes to `mcp__<server>__*` (no `*`/`mcp__*` wildcard), denies `Read(./.env*)`, no `rm -rf`/`curl` allows.
- **`.harness/mcp-policy.json`** — truthful default-deny snapshot (flags mapped to real enforcement in `_enforcement`: defaultDeny←tool-scoping, auditLog←witness-chain; postures/stated-intent labelled, not theater). With it present, **re-scan = 0 HIGH, 0 MEDIUM, 1 LOW** (caret app-deps, accepted N/A).
- **CI gate** — `scripts/mcp-policy-gate.mjs` (self-contained mirror of the scanner's HIGH checks; also reads `.mcp.json`, closing the false-negative) + `.github/workflows/mcp-policy-gate.yml` + `npm run security:mcp-policy`. Exit 1 on any HIGH (verified: fails on a reintroduced `defaultDeny:false`/`allowShell:true`).
- **Drift guard** — `tests/unit/mcp/mcp-policy-gate.test.ts` (14 tests) asserts the policy `roles` mirror `tool-scoping` enforcement per-role + the default-deny posture. 46/46 green with the existing scoping suite; strict-tsc clean.

**Verification:** (a) scan runs ✓ (b) 0 HIGH ✓ (c) tool-scoping behaviour unchanged — additive export + comment only, 32 scoping tests still green ✓ (d) CI fails on a reintroduced HIGH ✓. **Next: A2** (extract `@ruvector/adversarial-verify`).
