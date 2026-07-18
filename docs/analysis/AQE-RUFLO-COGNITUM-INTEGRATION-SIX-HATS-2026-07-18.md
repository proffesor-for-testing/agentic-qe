# AQE ↔ ruflo ↔ Cognitum: Integration Strategy (Six Thinking Hats)

**Date:** 2026-07-18
**Author:** Dragan Spiridonov (Head of Agentic QE & Engineering, Cognitum) + Claude
**Method:** `ruflo-goals:deep-researcher` evidence-graded research → Edward de Bono's Six Thinking Hats
**Focus question:** How do we improve the AQE fleet and integrate it more deeply with ruflo and `api.cognitum.one` — serving both open-source AQE and the commercial Cognitum product?

> Provenance note: the "What's new in ruflo" and "Current state" facts below come from a live-sourced research pass (GitHub API, PR bodies, ADR docs read directly, local file reads, `npx ruflo --version`). Every material claim was graded High/Medium; see the [Sources & Confidence](#sources--confidence) section. Two items are explicitly flagged as needing a direct answer from a human owner rather than inference.

---

## 0. The one-paragraph framing

AQE and ruflo have been building **the same learning-integrity machinery in parallel, in two repos, importing almost none of each other's code.** AQE went deep on rigor (frozen oracle anchor, two-gate judge, DoE/ANOVA, honest nulls). ruflo went wide on product (Cognitum auth, signed meta-proxy, billing, funnel, developer revenue-share). The commercial opportunity is not to pick one — it's to **make AQE the QE-rigor engine underneath the Cognitum funnel ruflo already built.** The single biggest fact shaping every hat below: **AQE does not depend on the `ruflo` npm package at all** — it imports only low-level `@ruvector/*` primitives and two alpha `@claude-flow/*` packages. Real code reuse today is near-zero. That is the gap and the opportunity.

---

## 🤍 White Hat — Facts & Data

**AQE current state (file-verified):**
- Version 3.12.3 (`working-july`), latest release PR #563/#564 — atomic RVF export.
- Cognitum wiring that **already exists**: `src/shared/llm/providers/cognitum.ts` (OpenAI/Anthropic-compatible, `X-API-Key`, tiers `cognitum-auto/low/mid/high`, reads `x_cognitum.price_usd` receipts, `getRemoteBudget()` off `/v1/usage`); `providers/claude-code.ts` (subscription mode); `spend-ledger.ts` (cross-process `llm_spend` in `memory.db`, budget enforced in both `ProviderManager.generate()` and `HybridRouter.executeWithFallback()`).
- Learning-integrity cluster built **independently** (not imported from ruflo): ADR-117 frozen anchor, ADR-118 receipt-gated flywheel (Ed25519 via node `crypto`), ADR-119 two-gate judge, ADR-120 gate re-execute/forgery catch, ADR-121 provenance tiers, ADR-122 DoE harness. ~80+ tests, DI'd.
- `src/learning/qe-flywheel/platform-signer.ts` (v3.12.3, PR #562) signs receipts with a **Cognitum-platform Ed25519 identity** (`QE_WITNESS_SIGNING_KEY`, fingerprint `f1ac28607da49ec1`) and references a sibling **"qe-harness"** project's Stage-B Secret-Manager key.
- Open items: issue #554 (A9 hook triggers, A14 13/40 GOAP actions unbacked, ADR-069 RVCOW untouched); **issue #565 (opened today, CI-filed): 4 HIGH CVEs** — `@huggingface/transformers`, `adm-zip`, `onnxruntime-node`, `agentic-qe` itself ≥3.9.33.

**ruflo state (live GitHub, last ~2 weeks):**
- Global install here is **v3.32.7**; ~1 release every 1–2 days.
- v3.24.0 "Self-Learning Flywheel" (ADR-176 + ADR-177 signed RVFA propagation); v3.25.0/.1 anti-overfitting (frozen human eval, red/blue deltas, clean-room replay) + Lattice WASM embedder tier; v3.25.2 AgentDB atomic flush + backup auto-restore.
- **ADR-301–319 "Cognitum customer lifecycle funnel"** dominates the last ~10 days: OAuth device-flow to `auth.cognitum.one`, signed local meta-proxy binary (`ruflo proxy install`, from `cognitum-one/meta-proxy-dist`), credit/budget UX, **developer revenue-share (ADR-317, 50/50 via Stripe Connect)**, **free-user flywheel training pipeline (ADR-315, feeds meta-llm `/v1/microlora/evolve`; server side "not started")**.
- **ADR-308** public API contract (`/v1/auth/*`, `/v1/events`, `/v1/funnel-policy`, `/v1/proxy/chat/completions`, `/v1/credits`) — with a **2026-07-16 addendum admitting the `/v1/auth/*` shape is aspirational and does not match production.**

**Cognitum platform surface:**
- **Inference layer (AQE uses today):** `/v1/chat/completions`, `/v1/messages`, `/v1/embeddings`, `/v1/responses`, `/v1/batches`; `x_cognitum` receipts; `/v1/usage` MTD spend + hard cap ($20 test acct).
- **Funnel/telemetry/auth layer (new, ruflo-facing):** a *different* surface per ADR-308.
- **Missing:** no QE-specific Cognitum endpoint anywhere. Closest analog is meta-llm's `/v1/microlora/evolve` (adaptation, not eval/oracle).

---

## ❤️ Red Hat — Gut Feelings (no justification)

- **Excited** that AQE's rigor is genuinely ahead of ruflo on the "is this signal real?" axis — we have the harder-won methodology.
- **Uneasy** that ruflo is moving ~10× faster and the funnel/monetization work could define the commercial API shape *before* QE gets a seat at the table.
- **Nervous** about the "qe-harness" sibling repo we bridge to but can't see — we're signing against infrastructure we don't fully understand.
- **Mildly alarmed** by issue #565 landing today — 4 HIGH CVEs reachable by consumers is a bad look for a fleet we want to commercialize.
- **Skeptical** of ruflo's ADR-176 "2 compounding promotions" headline — it pattern-matches exactly the "beads" null AQE's own DoE caught.
- **Confident** that "QE-as-a-service on Cognitum" is the right north star — it's the natural product wrapper around what we already built.
- **A little proud, a little worried** we built all of ADR-117–123 without importing ruflo — great sovereignty, but possible wasted duplication.

---

## 🖤 Black Hat — Risks, Gaps, What Could Go Wrong

1. **Duplication debt.** Two flywheels, two witness chains, two signing schemes. If ruflo's ADR-176/177 becomes the platform standard, AQE's independent stack could be declared non-canonical and need a costly retrofit.
2. **Auth drift trap.** Building Cognitum-commercial features on ADR-308's `/v1/auth/*` spec is a landmine — ruflo's own team says it doesn't match production. Follow meta-proxy's real `oauth/client.rs`, not the doc.
3. **Opaque dependency ("qe-harness").** We sign receipts against a Secret-Manager key in a repo not documented here. If that key rotates, is revoked, or the repo's owner changes the schema, our evidence chain silently breaks. **This is a single point of failure we don't control.**
4. **CVE exposure (#565).** 4 HIGH CVEs reachable by consumers. Per `[[feedback_consumer_audit]]`, in-repo `npm audit` lies when root-level overrides mask exposure — must verify via tarball install. Blocks any credible "enterprise QE" pitch.
5. **Unvalidated flywheel claims propagating.** If we adopt ruflo's flywheel wholesale without DoE-validating it the way we did our own, we import their potential false-positive as our result.
6. **API-surface ambiguity.** We don't know if `/v1/chat/completions` (inference, AQE uses) and `/v1/proxy/chat/completions` (funnel) are the same backend. Building on the wrong assumption could route QE traffic through billing/telemetry paths never meant for it.
7. **Funnel-first roadmap risk.** ruflo's last 10 days are monetization, not QE capability. If Cognitum's API ossifies around ad/funnel/credit primitives, there may be no `/v1/qe/*` namespace reserved when we need it. **First-mover advantage on the QE endpoint is time-sensitive.**
8. **Runtime-vs-dev-time confusion.** Contributors may assume ruflo is an AQE runtime dependency (the CLAUDE.md tooling implies deep coupling that doesn't exist in source). Misleads architecture decisions.
9. **Data-protection blast radius.** Anything touching `memory.db` (spend-ledger, receipts) is governed by ABSOLUTE data rules. A careless "sync AQE receipts to Cognitum" migration could corrupt 1K+ irreplaceable learning records.

---

## 💛 Yellow Hat — Strengths & Opportunities

1. **We own the rigor.** ADR-117–122 (frozen anchor, two-gate judge, DoE/ANOVA, honest nulls) is a genuine moat. ruflo has reach; we have *correctness*. That's exactly what a commercial QE product must sell.
2. **The bridge already exists.** `platform-signer.ts` proves the AQE↔Cognitum witness-key seam is live, not theoretical. We're one formalization away from a two-way integration.
3. **Provenance tiers are a ready-made quality currency.** ADR-121's `oracle:test-exec > judge:llm > proxy:structural` grading is precisely the attribution layer a "QE pattern marketplace" (ADR-317-style revenue-share) would need — half the machinery is done.
4. **Billing is already wired.** `spend-ledger.ts` + receipt reading means per-agent cost attribution is an *extension*, not a greenfield build.
5. **Complementary, not competitive, with Ruv.** ruflo built the funnel/proxy/billing; AQE built the eval rigor. As a main ruflo collaborator, you can merge these without a turf fight — contribute AQE's DoE discipline upstream, consume ruflo's distribution machinery.
6. **GAIA harness is free reference tooling.** `ruflo-workflows:gaia*` (run/validate/submit/leaderboard/cost) already exists — a proven pattern for publishing signed, cost-tracked fleet-quality claims.
7. **Timing.** Cognitum's QE endpoint is unclaimed territory. Being Head of Agentic QE *and* a main ruflo collaborator is the rare position to define `/v1/qe/*` before anyone else does.

---

## 💚 Green Hat — Creative Ideas & Alternatives

1. **"QE-as-a-Service" endpoint on Cognitum (`/v1/qe/verdict`).** Host AQE's two-gate judge + frozen anchor server-side, analogous to `/v1/microlora/evolve`. Customers get graded QE verdicts without running the fleet locally. This is the flagship commercial product.
2. **QE Pattern Marketplace with credit payout.** Fuse ADR-121 provenance tiers (quality grading) + ADR-317 revenue-share (payout rails). Contributors of high-tier `qe_patterns` earn Cognitum credits. Turns the learning DB into a two-sided market.
3. **Cross-team DoE gift.** Open a PR/issue against `ruvnet/ruflo` applying AQE's ADR-122 ANOVA screen to ruflo's ADR-176 flywheel claims. Cheap, high-trust, positions AQE's methodology as the platform's validation standard.
4. **"Attestable QE evidence" as a product.** Formalize the qe-harness witness bridge into a shared receipt schema + public verification tool. Cognitum customers get cryptographically attestable test evidence — a compliance/audit selling point (SOC2, regulated industries).
5. **GAIA-for-QE leaderboard.** Adapt the GAIA harness to publish AQE fleet-quality benchmarks (signed, cost-tracked, leaderboarded). Marketing + credibility + a forcing function for honest metrics.
6. **Meta-proxy as the QE traffic router.** Instead of AQE calling Cognitum inference directly, route through the signed meta-proxy — inherit sponsored-downtime, credit UX, and telemetry for free. QE becomes a first-class funnel citizen.
7. **Lattice WASM embedder swap.** Trial ruflo's Lattice tier for `qe_pattern_embeddings` vs. current MiniLM — potentially better retrieval for the coupling mechanism, smaller dep surface (verify what npm actually ships first — remember the ruvllm mock-mode lesson).
8. **Per-agent cost dashboards.** Extend `spend-ledger.ts` keyed by the 60+ QE agent-type names → a Cognitum billing dashboard showing spend per `qe-security-scanner`, `qe-coverage-specialist`, etc. Immediate enterprise value.
9. **Dogfood the funnel.** Run AQE's own dev sessions through the Cognitum funnel/proxy to stress-test ADR-301–319 as its first serious QE customer — you'd find the bugs before paying customers do.

---

## 🔵 Blue Hat — Action Plan (prioritized, with owner intent)

### Tier 0 — Unblock & de-risk (this week, S effort)
| # | Action | Why now | Owner |
|---|--------|---------|-------|
| 0.1 | **Triage issue #565 CVEs via tarball install** (not in-repo audit) | Blocks any enterprise QE credibility; consumer-reachable | AQE sec |
| 0.2 | **Get a human answer on "qe-harness" repo + `QE_WITNESS_SIGNING_KEY` ownership** | We sign against infra we can't see; SPOF | You (ask Ruv / Cognitum eng) |
| 0.3 | **Confirm whether `/v1/chat/completions` == `/v1/proxy/chat/completions` backend** | Prevents building on wrong routing assumption | You (Cognitum team) |
| 0.4 | **Follow meta-proxy `oauth/client.rs`, NOT ADR-308 `/v1/auth/*` spec** for any auth work | ruflo's own addendum says spec ≠ production | AQE |

### Tier 1 — Reserve the commercial ground (2–4 weeks, M–L)
| # | Action | Type |
|---|--------|------|
| 1.1 | **Draft ADR-124: `/v1/qe/verdict` — QE-as-a-Service on Cognitum.** Reserve the `/v1/qe/*` namespace before the funnel API ossifies. Host two-gate judge + frozen anchor. | Cognitum-commercial (flagship) |
| 1.2 | **Formalize the witness-key bridge** into a shared receipt schema + verification tool (from one-off signer → two-way integration). | Both |
| 1.3 | **Extend `spend-ledger.ts` with per-agent-type attribution** → Cognitum billing dashboard seed. | Both |

### Tier 2 — Cross-pollinate & harden (1–2 months)
| # | Action | Type |
|---|--------|------|
| 2.1 | **Contribute AQE's DoE/ANOVA rigor upstream to ruflo's ADR-176 flywheel** (issue/PR + conversation with Ruv). DoE-validate before adopting any ruflo flywheel result as AQE's. | OSS contribution to ruflo |
| 2.2 | **Read ruflo v3.25.2 AgentDB atomic-flush/backup-restore fix**; check AQE's `memory.db` virtiofs exposure against it (no import — different engines). | OSS-AQE |
| 2.3 | **Trial Lattice WASM embedder** for `qe_pattern_embeddings` (verify npm-shipped capability first). | OSS-AQE |
| 2.4 | **Clarify in docs: ruflo is dev-time tooling, not an AQE runtime dependency.** | OSS-AQE hygiene |

### Tier 3 — Product bets (quarter horizon, L)
| # | Action | Type |
|---|--------|------|
| 3.1 | **QE Pattern Marketplace** (ADR-121 tiers × ADR-317 payout rails). | Cognitum-commercial |
| 3.2 | **GAIA-for-QE signed leaderboard** for public fleet-quality claims. | Both |
| 3.3 | **Route AQE inference through the signed meta-proxy** to inherit funnel/credit/telemetry. | Both |

### Sequencing logic
Tier 0 is pure de-risking — cheap, and everything above depends on the answers (esp. 0.2/0.3 gate 1.1/1.2). **The single highest-leverage move is 1.1 — reserving `/v1/qe/*` on Cognitum** — because the research shows the funnel API is being defined *right now*, and QE has no seat at that table yet. Your dual role (Head of QE + main ruflo collaborator) is exactly the leverage to land it before the surface ossifies.

---

## Open Questions / Contradictions (carry into next session)

1. **Does the "qe-harness" repo exist, and is it Cognitum-internal or public?** Not discoverable from AQE alone — needs a human answer. *(→ action 0.2)*
2. **Is the inference API the same backend as the funnel/auth API?** ADR-308 lists both `/v1/chat/completions` and `/v1/proxy/chat/completions` — unresolved. *(→ action 0.3)*
3. **Has ruflo's ADR-176 flywheel been DoE-validated?** Its "2 compounding promotions" with a flat human anchor pattern-matches AQE's own "beads" null. Don't adopt as fact until validated. *(→ action 2.1)*
4. **Runtime vs. dev-time coupling** — worth a one-line architecture doc note so contributors don't assume ruflo is a shipped dependency.

---

## Sources & Confidence

All from the deep-research pass (2026-07-18), graded at collection:
- `gh api repos/ruvnet/ruflo/commits`, `/releases`, PR #2697/#2707 bodies, ADR-308/315/317 contents — **High** (live, read directly)
- `gh issue list/view` proffesor-for-testing/agentic-qe #554, #565 — **High**
- Local reads: `package.json`, `src/shared/llm/providers/cognitum.ts` + siblings, `src/learning/qe-flywheel/platform-signer.ts` — **High**
- `docs/implementation/adrs/ADR-110`–`ADR-123` — titles **High**, contents **Medium** (not all re-read this session; leaned on memory summaries)
- Auto-memory files (4–23 days old, self-flagged point-in-time, cross-checked against live sources) — **Medium**
- `npx ruflo --version` → 3.32.7 — **High**

**Two claims explicitly require human confirmation, not inference:** the qe-harness repo/key ownership (0.2) and the inference-vs-funnel backend identity (0.3). Both are flagged in the action plan rather than assumed.

---

# ADDENDUM (2026-07-18): The "QE-Court" — Adversarial Review as the Product

> Added after Colby shared a demo (YouTube `QR0EBhTP6Jg`, titled *"Einstein vs Einstein vs Einstein: Why I Code With an AI Council, Not a Copilot"*). Transcript wasn't machine-extractable; design below is built from the shared description: *"Adversarial courts — deliveries get attacked by independent AI reviewers with their own probe sets. One agent's 91/100 SHIP verdict got overturned by another agent's deeper review… Einstein vs. Einstein vs. Einstein, different roles, different personalities, challenging each other, with you in the loop."*

## Why this is the same idea as `/v1/qe/verdict` — from the other end

The demo's "adversarial court" and this report's Tier-1 flagship (`ADR-124 /v1/qe/verdict`, QE-as-a-Service) are **the same product described from two directions.** The court is the *user-facing metaphor*; `/v1/qe/verdict` is the *API surface*. AQE already owns most of the machinery — it's currently scattered across skills/agents/ADRs and has never been assembled into a single "court" protocol with **overturn semantics**. That assembly is the new work.

**The one mechanic the video adds that AQE doesn't have yet:** a shallow **SHIP verdict can be *overturned* by a deeper, independent reviewer.** AQE today runs verification that *confirms or refutes findings*; it does not run an escalating adversarial tournament where a passing grade must *survive* progressively deeper attackers before it's allowed to stand. That's the gap QE-Court closes.

## What AQE already has (the court's raw materials)

| Court role | Existing AQE asset | Provenance |
|---|---|---|
| Prosecutor (harsh) | `brutal-honesty-review` skill (Torvalds/Ramsay/Bach) | shipped skill |
| Prosecutor (gap-finder) | `qe-devils-advocate` agent | shipped agent |
| Prosecutor (deductive) | `sherlock-review` skill | shipped skill |
| Blind refuter | `src/verification/adversarial-verify` (host-agnostic blind-refuter) | `[[project_adversarial_verify_extracted]]` (A2) |
| Independent probe sets | `qe-test-architect`, `qe-security-scanner`, `qe-mutation-tester`, `qe-property-tester` — each generates its *own* attack set | shipped agents |
| Jury / verdict | Two-gate LLM-judge (ADR-119) + gate re-execute forgery catch (ADR-120) | `[[project_learning_integrity_cluster_built]]` |
| Cross-model impartiality | writer≠evaluator discriminator + cross-model best-of-N (ADR-178/182/183) | `[[project_metaharness_oracle_arc]]` |
| Evidence grading | Provenance tiers `oracle:test-exec > judge:llm > proxy:structural` (ADR-121) | shipped |
| Signed court record | `platform-signer.ts` witness signing (Cognitum Ed25519 identity) | v3.12.3 / PR #562 |
| Human-as-judge | in-the-loop review (you) | — |

**Known trap to design around:** `[[project_qcsd_use_full_swarm_not_workflow]]` — the 3-dimension QCSD *workflow* can falsely rate SHIP because it skips security/mutation/defect lanes. QE-Court must spawn the *specialized* qe-* prosecutors, not a reduced workflow, or it reproduces the exact false-SHIP the demo is designed to catch.

## The QE-Court protocol (design)

```
                         ┌──────────────────────────────────────────┐
   DELIVERY (PR/diff/    │              QE-COURT                     │
   test-suite/artifact) →│                                          │
                         │  1. DEFENSE builds the case-for-ship      │
                         │     (writer model summarizes evidence)    │
                         │  2. PROSECUTION panel — N independent     │
                         │     reviewers, DIFFERENT models/personas, │
                         │     EACH with its own probe set:          │
                         │       • brutal-honesty (style/rigor)      │
                         │       • devils-advocate (gaps/assumptions)│
                         │       • sherlock (deductive/root-cause)   │
                         │       • security-scanner (exploit probes) │
                         │       • mutation-tester (test adequacy)   │
                         │  3. Each files CHARGES (findings +        │
                         │     reproduction). Blind-refuters try to  │
                         │     KILL weak charges (adversarial-verify)│
                         │  4. JURY = two-gate judge, cross-model,   │
                         │     writer≠evaluator. Verdict + score.    │
                         │  5. OVERTURN ROUND (the new bit): if the  │
                         │     verdict is SHIP, escalate one deeper  │
                         │     reviewer (higher effort/model tier).  │
                         │     Loop-until-dry: SHIP only stands if K │
                         │     consecutive deeper rounds find nothing│
                         │     new. Any surviving charge → OVERTURN. │
                         │  6. SIGNED COURT RECORD (provenance tiers │
                         │     + witness sig) → durable evidence.    │
                         └───────────────────┬──────────────────────┘
                                             │
                                    HUMAN JUDGE (you) — sees the
                                    strongest case FOR and AGAINST,
                                    rules SHIP / REMAND / BLOCK
```

**Verdict states (3-valued, never binary):** `SHIP` (survived overturn) · `REMAND` (fixable charges, back to author) · `BLOCK` (fatal charge survived). Mirrors the two-gate judge's 3-valued output and `[[project_retort_doe_harness]]`'s "never economize on the oracle" principle.

**Anti-collusion rules (why it's a real court, not a rubber stamp):**
1. **Writer ≠ any juror** — the model/agent that produced or defended the delivery may never grade it (ADR-178).
2. **Independent probe sets** — prosecutors do NOT see each other's charges until after filing (multi-modal sweep; each blind to the others).
3. **Overturn asymmetry** — a SHIP must survive escalation; a BLOCK needs only one surviving fatal charge. Bias toward catching, not passing.
4. **DoE-gated claims** — before QE-Court reports a *score* as meaningful, the scoring rubric itself must pass an ANOVA screen (ADR-122) so we don't ship a "91/100" that's noise. Directly answers the report's open-question #3 (don't trust un-DoE'd verdicts).

## Build vs. combine — recommendation

**Create a new `qe-court` orchestrator skill that COMPOSES the existing assets — do not reimplement review logic.** The value is the *protocol* (roles, probe-set independence, overturn loop, verdict aggregation, signed record, human-as-judge), not new critics. Staged:

- **Phase 0 (S, OSS-AQE):** `qe-court` skill = a Workflow that fans out the existing prosecutors (specialized agents, per the false-SHIP lesson), runs blind-refuter kill rounds, aggregates via the two-gate judge, and adds the **overturn loop-until-dry**. Reuses `[[project_adversarial_verify_extracted]]` + ADR-119/121. Output: a signed court record markdown + verdict.
- **Phase 1 (M, both):** wire the signed court record through `platform-signer.ts` so verdicts chain to the Cognitum witness key → *attestable* court records.
- **Phase 2 (L, Cognitum-commercial):** expose the whole protocol as **`/v1/qe/verdict`** (this report's Tier-1 flagship). The court becomes the productized "jury waiting for everything you ship" — customers POST a delivery, get back a signed, overturn-tested verdict without running the fleet locally. **This is the commercial embodiment of the video's pitch.**

## Fit with the six-hats action plan

QE-Court is not a new workstream — it's the **unifying spine** that makes several existing Tier items concrete:
- It **is** Tier-1 #1.1 (`/v1/qe/verdict`) with a name and a UX.
- It **consumes** #1.2 (witness-key bridge) as its court-record signer.
- It **applies** #2.1 (DoE rigor) as its anti-noise-score gate.
- It **showcases** #3.2 (GAIA-for-QE leaderboard) — court verdicts are exactly the signed, cost-tracked claims worth publishing.

**Revised single highest-leverage move:** build the **Phase 0 `qe-court` skill** now (cheap, OSS, immediately useful in your own dev loop), because it (a) proves the protocol, (b) becomes the reference implementation for `/v1/qe/verdict`, and (c) is the most direct answer to Colby's demo — an adversarial court AQE can actually run today, on its own fleet.

---

*Next: (1) resolve #565 fix path [awaiting decision]; (2) draft the `qe-court` Phase-0 skill spec; (3) draft ADR-124 (`/v1/qe/verdict`) framed as the hosted court.*
