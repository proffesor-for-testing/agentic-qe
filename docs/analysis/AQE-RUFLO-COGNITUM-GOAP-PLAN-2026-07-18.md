# GOAP Plan — AQE ↔ ruflo ↔ Cognitum Improvements

**Date:** 2026-07-18 · **Method:** Goal-Oriented Action Planning (A* over state space)
**Feeds from:** `AQE-RUFLO-COGNITUM-INTEGRATION-SIX-HATS-2026-07-18.md`
**Execution rule:** every milestone has an **approval gate** — nothing executes without the user's explicit per-item OK. This document is a plan, not a mandate to proceed.

---

## Goal state (what "done" looks like)

AQE is measurably improved and integrated with ruflo + `api.cognitum.one`, delivered as approved, independently-verifiable increments, where:
- The `qe-court` skill is a **self-learning, model-routed, tier-3** capability — not a static doc.
- Cognitum's QE namespace (`/v1/qe/*`) is reserved and the hosted court is speccd.
- Each shipped increment has a durable acceptance test and honest provenance.

## Current state (verified this session)

- `qe-court`: SKILL.md + config.json + eval **scaffold** written; ADR-124 written; registered in installer `V3_DOMAIN_SKILLS` + `skills-manifest` (both trees); copied to `assets/`. **UNFINISHED:** `totalQESkills` count edit; **not committed**; **no model routing, no learning wiring, no runnable eval** → honestly tier 1.
- `#565`: fixed + verified on branch `fix/565-transformers-optional-peer` (not pushed).
- `COGNITUM_API_KEY`: live in env (from `~/.bashrc`).
- qe-harness: confirmed private repo in `cognitum-one` org (user has access).
- Assets from ADR-123 (billing-aware provider layer, `spend-ledger.ts`, cognitum tiers), ADR-117–122 (frozen anchor, two-gate judge, provenance, DoE), ADR-118 witness signer — all exist and are the raw materials.

---

## MILESTONE 0 — Finish qe-court's design (the four gaps). **Blocks everything downstream.**

> Rationale: the report's flagship (`/v1/qe/verdict`) is the *hosted* qe-court. Shipping a half-designed local court and then hosting it would productize the holes. Fix the design first.

### M0.A — Per-step model routing (answers Q2). `OSS-AQE · M`
**Precondition:** ADR-123 provider layer + HybridRouter present (✓). **Effect:** every court step has a defined, enforced model assignment; writer≠juror is a checked invariant, not a hope.

Design (to be encoded in `config.json` + a `qe-court` router policy):

| Step | Model / tier | Provider route (ADR-123) | Why |
|------|-------------|--------------------------|-----|
| **Defense** | cheap, may equal writer | `cognitum-low` or subscription `claude-code` | States case-for-ship; never grades, so writer reuse is allowed |
| **Prosecutor: devils-advocate** | mid | `cognitum-mid` | Gap/assumption hunting |
| **Prosecutor: brutal-honesty** | strong, **different family** from jury | Claude `claude-code` (Opus/Sonnet) | Rigor lens; family-diverse from Cognitum jury |
| **Prosecutor: sherlock** | high | `cognitum-high` | Deductive/root-cause needs a strong model |
| **Prosecutor: security-scanner** | tool-first + mid reasoning | SAST (deterministic) + `cognitum-mid` | Exploit probes; determinism where possible |
| **Prosecutor: mutation** | tool-first + Agent-Booster tier-1 | Stryker/mutmut + `local`/booster | Test-adequacy is mostly mechanical |
| **Prosecutor: codex-review** | GPT-family, **cross-vendor** | `codex exec review` (ChatGPT-subscription) | TRUE vendor diversity — a non-Claude, non-Cognitum brain; subscription-covered ≈ $0 |
| **Jury (two-gate judge)** | high, **cross-model from writer** | `cognitum-high` or Opus, provider-id ≠ writer | ADR-119/120; must not grade its own family's output |
| **Deeper reviewer (overturn)** | highest tier / best-of-N, higher effort | `cognitum-high` @ high-effort or Opus/Codex best-of-N | Escalation must be *stronger* than the base panel |

**Invariants enforced in code:** (1) ≥2 distinct model **vendors** across the panel (Claude / Cognitum / GPT-via-Codex) — not just tiers; (2) jury `provider-id ∉ {writer, defense}`; (3) all routed through `ProviderManager` so the ADR-123 budget cap + receipts apply (Codex runs are subscription-covered, logged as `source: 'subscription'`).

**Codex integration (confirmed live 2026-07-18):** `codex-cli 0.136.0` present, **logged in via ChatGPT** (subscription auth → runs ≈ $0, not API-billed). `codex exec review` runs an independent repo code-review; `codex exec "<prompt>"` is a general non-interactive agent; `codex mcp-server` exposes Codex as an MCP server. AQE already ships `codex-installer.ts` (AQE→Codex: writes `.codex/config.toml` + `AGENTS.md`). Adding Codex as a **prosecutor/juror** gives the court its first genuinely cross-vendor adversary — the strongest possible form of `writer≠juror`.
**Verify:** unit test asserts writer≠juror rejection; a run emits per-step provider IDs in the court record.

### M0.B — Self-learning wiring (answers Q3). `OSS-AQE · M`
**Precondition:** M0.A; pattern store (ADR-110) + flywheel receipts (ADR-118) + provenance tiers (ADR-121) present (✓). **Effect:** the court *feeds the loop* instead of being write-once.

- **Court record → flywheel receipt:** sign via `platform-signer.ts` (ADR-118) and persist as a receipt; the verdict + surviving charges are the payload.
- **Reproduced surviving charge → `qe_patterns` (ADR-110), provenance `oracle:test-exec`** (it reproduced). Refuted/killed charges are **not** stored as positives (noise control); optionally stored as `judge:llm` negatives for calibration.
- **Overturned-SHIP event → discriminator training pair for the frozen anchor (ADR-117) + two-gate judge (ADR-119):** `{shallow=SHIP, true=BLOCK/REMAND}` is the single most valuable signal — a labeled instance of "review was too easy." This is what lets the judge get *harder to fool* over time.
- **Retrieval-augmented prosecution:** seed each prosecutor's probe set with HNSW-nearest prior charges for similar deliveries (`qe_pattern_embeddings`) — the court gets sharper as the corpus grows.
**Data-protection:** all writes are appends to existing stores; **no** destructive `memory.db` ops. Test against a DB copy.
**Verify:** after a court run, assert a new receipt row + ≥1 `qe_patterns` row with the right provenance tier (against a **copy** of `memory.db`).

### M0.C — Improvement-over-time loop (answers Q4). `OSS-AQE · M`
**Precondition:** M0.B. **Effect:** the court's own quality is measured and self-tunes.

- **Probe-set promotion:** track each probe's historical **mutant-kill rate**; promote high-kill probes (provenance-tiered), retire dead ones. Stored in a `qe-court/probes` namespace.
- **DoE-gated scoring (ADR-122):** before emitting any numeric score, run an ANOVA screen on the rubric across a fixture set; emit the number **only if** the rubric discriminates (significant F). Else report verdict-class + charges. (Directly answers report open-Q #3 — no un-validated "91/100".)
- **Learnable overturn depth K:** start K=2; learn per-domain the depth at which new charges stop appearing (the empirical loop-until-dry tail).
**Verify:** a guard test proves a score is suppressed when the rubric fails the ANOVA screen.

### M0.D — Trust-tier trajectory 1 → 3 (answers Q1). `OSS-AQE · M`
**Precondition:** M0.A–C. **Effect:** qe-court earns tier 3 honestly.

- Build the **seeded-mutant fixture** (a diff with one planted non-obvious bug a shallow reviewer rates SHIP).
- Wire `evals/qe-court.yaml` to the real runner (`aqe eval run --skill qe-court`).
- Reach **5+ passing oracle cases:** overturn-catches-mutant, no-score-without-DoE, writer≠juror-enforced, blind-filing-independence, budget-cap-respected. Each passes on correct behavior and **fails on regression** (e.g. K=0 must regress overturn-catches-mutant to SHIP).
- Flip `trust_tier: 1 → 3` only when the runner reports ≥5 passing.

### M0.E — Finish the mechanical wiring + commit. `OSS-AQE · S`
Finish `totalQESkills` 81→82 (+ nested block + notes string) in **both** manifest trees; run `check-skill-parity`; build; run the skills-installer test; then commit qe-court + ADR-124 together.
**Gate ▶ APPROVAL #1:** review M0 design (routing table + learning wiring) before I build any of it.

---

## MILESTONE 1 — Resolve the live Cognitum unknown (Tier 0 remainder). `Cognitum · S` — ✅ DONE 2026-07-18
**Result (probed live, read-only, ~$0.00003 spent):** the inference API and the ADR-308 funnel/proxy API are **NOT the same backend.**
- **Inference host `api.cognitum.one`** (Express on GCP, `X-API-Key` auth): `/v1/chat/completions`, `/v1/messages`, `/v1/embeddings`, `/v1/responses`, `/v1/models`, `/v1/usage` all live. Tiers resolve to a model marketplace under the hood (`cognitum-low → z-ai/glm-5.2`). Receipt carries `price_usd`. `/v1/usage.budget`: `hardCapUsd: 20`, `headroomUsd: 19.34`, status active.
- **Funnel/proxy contract (ADR-308)** — `/v1/proxy/chat/completions`, `/v1/credits`, `/v1/events`, `/v1/funnel-policy` — all **404 ROUTE_NOT_FOUND** on this host. Not deployed here; the funnel layer (if live) is a separate service, confirming ADR-308's own addendum. Auth work → follow meta-proxy `oauth/client.rs`, not this host.
- **`/v1/qe/verdict` → 404**: the `/v1/qe/*` namespace is **free to reserve** — build ADR-124 Phase 2 as a NEW route on the existing inference Express app (where the real X-API-Key/receipt service lives), NOT on the non-existent funnel service.

---

## MILESTONE 2 — Tier 1 commercial ground (depends on M0 + M1)

| # | Action | Type · Effort | Precondition | Effect |
|---|--------|--------------|--------------|--------|
| 2.1 | **Spec `/v1/qe/verdict`** = hosted qe-court (ADR-124 Phase 2). Reserve `/v1/qe/*`. | Cognitum · L | M0 done (protocol proven locally), M1 (backend clarity) | QE namespace reserved before funnel API ossifies |
| 2.2 | **Formalize witness-key bridge** — shared receipt schema + verification tool across `platform-signer.ts` ↔ `cognitum-one/qe-harness`. | Both · M | qe-harness access (✓), M0.B receipts | Court records become externally attestable |
| 2.3 | **Per-agent cost attribution** — extend `spend-ledger.ts` keyed by QE agent-type. | Both · S–M | ADR-123 ledger (✓) | Cognitum billing-dashboard seed; per-`qe-*` spend |

**Gate ▶ APPROVAL #3 per item** (2.1/2.2 touch shared Cognitum surfaces & the qe-harness repo).

### M2 status (2026-07-18)
- **2.1 ✅ DONE** — `docs/api/qe-verdict-v1.openapi.yaml` (commit 42e5bf9b).
- **2.3 ✅ DONE** — per-agent attribution in `spend-ledger.ts` (commit 64d4936c).
- **2.2 ⏳ AQE-side DONE; blocked on owner for full cross-verify** —
  - *Already aligned (the bridge exists):* both AQE and `cognitum-one/qe-harness` use Ed25519, the same secret `QE_WITNESS_SIGNING_KEY` (JSON PEM), and the **identical fingerprint scheme** `sha256(pem.trim())[:16]` — both sign as `f1ac28607da49ec1`. Proven by test (keyFingerprint === signer.keyId).
  - *Built (AQE-only, no shared-repo change):* `src/learning/qe-flywheel/witness-verify.ts` — one verifier for BOTH artifact formats (AQE receipt: fixed-order JSON body, hex; qe-harness: `stableStringify` `sha256:` digest, base64, nested `witness{}`), allowlist-driven, tamper-detecting. 15 tests green.
  - **NEEDS THE qe-harness OWNER (ruvnet / Cognitum eng) — surface, do NOT do unilaterally:**
    1. **Provision the public key** for `f1ac28607da49ec1` to AQE via `QE_WITNESS_PUBLIC_KEYS_JSON` — committed to NEITHER repo today (lives on meta-llm). Until then AQE can sign-as but not offline-verify platform bundles. (Like the cog_ key — the user may be able to provide it.)
    2. **Confirm byte-parity** of `witness-verify.ts`'s harness path against a REAL qe-harness sample bundle before it gates anything.
    3. **Decide canonicalization convergence:** AQE's `receiptBodyString` hand-lists fields (silently drops new ones from the signature — a real latent bug); recommend both sides adopt `stableStringify`. This changes AQE's receipt signing format → coordinated change, needs agreement.

---

## MILESTONE 3 — Tier 2 cross-pollinate & harden (independent; can interleave)

| # | Action | Type · Effort | Notes |
|---|--------|--------------|-------|
| 3.1 | Contribute AQE's DoE/ANOVA rigor upstream to ruflo **ADR-176** flywheel (issue/PR + convo with Ruv). | OSS→ruflo · S | Shared-repo → PR only, per-item OK |
| 3.2 | Read ruflo v3.25.2 **AgentDB atomic-flush** fix; check AQE `memory.db` virtiofs exposure. | OSS-AQE · S | No import (different engines); read-and-assess |
| 3.3 | Trial a **Lattice embedder** — **⚠️ NUANCED (2026-07-18): npm "Lattice WASM" = vaporware; `ohdearquant/lattice` = real but not drop-in** | OSS-AQE | See detail below |
| 3.4 | Doc note: **ruflo is dev-time, not an AQE runtime dep.** | OSS-AQE · S | Prevents contributor confusion |
| 3.5 | **Codex as an AQE subscription model provider** (ADR-123-style, mirrors the `claude-code` provider): spawn `codex exec --json` with API keys stripped so it bills the ChatGPT subscription. Unlocks GPT-family as a first-class AQE provider (prosecutor/juror diversity, fallback). | OSS-AQE · M | New from 2026-07-18 Codex probe; billing-mode = `subscription` |

### M3.3 detail (2026-07-18, evidence-verified — two different "lattices")
**(A) npm "Lattice WASM embedder" (ruflo/@ruvector) — ❌ VAPORWARE.** `@ruvector/lattice`,
`@ruvector/lattice-wasm`, `lattice-embedder` all npm E404. `@claude-flow/cli@3.32.7`'s own
`wasm-embedder.js` admits the default `@ruvector/lattice-wasm` "does not exist — npm 404"; the
"Lattice WASM tier" is an inert opt-in adapter slot (`RUFLO_EMBED_WASM_PKG`), nothing shipped —
naming-only, the **ruvllm mock-mode pattern** ([[project_ruvllm_mock_mode_qwen_verified]]). The one
real npm WASM embedder (`ruvector-onnx-embeddings-wasm@0.1.2`) is broken-in-Node-as-published AND
runs the same MiniLM AQE already uses (zero delta).

**(B) `ohdearquant/lattice` (crates.io/GitHub-release) — ✅ REAL engine, ⚠️ not a drop-in.**
Verified by running the binary (aarch64 — this container is arm64, not x86_64): real pure-Rust
inference engine, actively developed (pushed 2026-07-18). Findings:
- Shipped `lattice` binary is **chat-only** (`chat`/`serve`/`doctor`); `serve` exposes only
  `/v1/chat/completions`, `/v1/models`, `/health` — **no `/v1/embeddings`** (confirmed in binary
  strings + source `crates/inference/src/serve/mod.rs:248`).
- Embeddings live in a **separate `lattice-embed` crate NOT in the release** — source-build only,
  and it's a **CLI (JSON on stdout), not an HTTP server**. crates.io 404 → source-only.
- Models: **BGE-small 384-dim (default)**, BGE-base 768, BGE-large 1024, all-MiniLM-L6 384,
  Qwen3-Embedding-0.6B →1024.
- **AQE integration is NOT "zero-dep endpoint" as-shipped** (no `/v1/embeddings` server). Would need
  build-from-source + either a `/v1/embeddings` shim over `lattice-embed`, or a new CLI-shelling
  adapter — new Rust maintenance surface.
- *(Real-vector cosine proof was still building `lattice-embed` from source when the investigator
  went unresponsive; it's a real crate with SIMD benches so genuine vectors are near-certain, and the
  verdict does not hinge on it.)*

**Verdict: GO-with-caveats, but not the cheapest path to the near-term win.** The genuine upgrade on
offer is **BGE-small @ 384-dim** (same dim as AQE's index, MTEB-stronger than MiniLM — no dimensional
reindex, though a model switch re-embeds stored vectors since values change). AQE can get that **exact
model via its existing transformers.js path** (`Xenova/bge-small-en-v1.5`, HF ONNX) — no lattice, no
Rust, no shim. **Recommendation:** for the near-term embedding upgrade, do BGE-small via transformers.js
through the existing `EmbedderEndpointClient`/dynamic-import path; keep `ohdearquant/lattice` on the
radar for a *bigger* move (Qwen3-Embedding-1024, SIMD perf at scale, or Cognitum-side embedding serving)
where its Rust engine earns the from-source cost.

**Gate ▶ APPROVAL #4 per item** (3.1 is outward-facing to ruvnet/ruflo).

---

## MILESTONE 4 — Tier 3 product bets (largest; gated on M0–M2 success)

| # | Action | Type · Effort |
|---|--------|--------------|
| 4.1 | **QE Pattern Marketplace** — ADR-121 provenance tiers × ADR-317 payout rails; high-tier `qe_patterns` earn Cognitum credits. | Cognitum · L |
| 4.2 | **GAIA-for-QE signed leaderboard** — publish overturn-tested court verdicts as signed, cost-tracked fleet-quality claims. | Both · M |
| 4.3 | **Route AQE inference through the signed meta-proxy** — inherit funnel/credit/telemetry. | Both · L |

**Gate ▶ APPROVAL #5 per item.**

---

## Plan cost & critical path

```
Critical path:  M0 (design qe-court right) → M1 (Cognitum backend clarity) → M2.1 (/v1/qe/verdict spec)
Parallelizable: M3.* (hardening) can run alongside M0/M1.
Total to a shippable, self-learning, tier-3 qe-court + reserved QE namespace: M0 (4×M + 1×S) + M1 (S) + M2.1 (L).
```

## Risk factors → replan triggers
- **M1 finding:** if inference and funnel are *different* backends, M2.1's endpoint design changes (proxy-routed vs direct). Replan 2.1.
- **M0.C DoE null:** if the scoring rubric *never* passes ANOVA, qe-court ships verdict-class-only (no score) — that's an acceptable, honest outcome, not a failure.
- **qe-harness schema unknown:** 2.2 blocked until the receipt schema in `cognitum-one/qe-harness` is read; that's a shared-repo read, needs OK.
- **Budget:** the court is token-heavy; M0.D eval runs must respect `AQE_MAX_BUDGET_USD`.

## Fallback
If Cognitum-commercial items stall (backend ambiguity, org decisions), the entire OSS-AQE spine (M0 full + M3.2/3.4) still delivers a self-learning adversarial court to open-source users independently — the commercial layer is additive, not load-bearing.

---

## Approval gates summary (nothing runs without these)
1. **#1 — M0 design** (routing table + learning wiring) before building qe-court properly.
2. **#2 — M1** live Cognitum probe (billed API).
3. **#3 — M2** items (shared Cognitum/qe-harness surfaces).
4. **#4 — M3** items (3.1 outward to ruflo).
5. **#5 — M4** product bets.
