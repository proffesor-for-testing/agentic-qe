# Six Thinking Hats: AQE ↔ MetaHarness Cross-Pollination

**Question under analysis:** *What should flow between AQE and MetaHarness, in which direction, and is it worth it?*

**Method:** Edward de Bono's Six Thinking Hats, applied as parallel thinking modes (one lens at a time), grounded in a file-level audit of both repos. Claims from the briefing were **verified, not trusted** — several were materially overstated and are corrected below.

**Date:** 2026-06-15
**Repos audited:** `/workspaces/agentic-qe` (AQE, by ruflo/ruvnet) · `/workspaces/agent-harness-generator` (MetaHarness `metaharness@0.1.7`, by ruvnet)

---

## Grounding corrections (read this first)

The briefing's headline numbers do not survive a file audit. The thesis ("they compose, not overlap") survives; the marketing does not.

| Briefing claim | Verified reality | Source |
|---|---|---|
| AQE ~84 QE skills | **~70** genuine QE skills after excluding platform-infra prefixes | `ls .claude/skills/` (123 entries; ~50 are platform: `v3-*`, `flow-nexus-*`, `agentdb-*`, `ruflo-*`, `sparc-*`, etc.) |
| AQE ~70 qe-* agents | **60** (`qe-*.md`) | `find .claude/agents -name 'qe-*.md'` = 60; `assets/agents/v3/` mirrors 60 |
| AQE ~100 MCP tools | **~90** live, wired & real | `src/mcp/protocol-server.ts` + `registry.ts` (`QE_TOOLS`) + `qe-tool-bridge.ts`; ~90 `mcp__agentic-qe__*` exposed |
| AQE 265+ patterns | **88 seed** patterns; "265" unsubstantiated in code/docs | `src/learning/pretrained-patterns.ts` (`PRETRAINED_PATTERNS`=88). Live `.agentic-qe/memory.db` may hold 1K+ via learning, but no source asserts 265 |
| MetaHarness Ed25519 witness "wired" | **Rust-only; JS product runs degraded shape-only** | `crates/kernel/src/witness.rs` real + 9 tests, but napi/wasm bridges expose only `kernelInfo`/`mcpValidate`; `witness-client.ts:74` falls through to `{valid:true, reason:'...kernel not loaded (degraded)'}`; `publish.ts:106` has literal `TODO: wire into kernel.witnessVerify` |
| MetaHarness Rust kernel | **8 of 10 subsystems have no JS bridge** (claims/cost/dispatch/federation/hooks/intel/memory/routing); plus witness | `crates/kernel/src/lib.rs` vs `kernel-napi`/`kernel-wasm` bridges |
| DRACO "honest negative result" | **CONFIRMED in ADR**, but README still over-claims the opposite | `docs/adrs/ADR-038`: vanilla 0.7325 vs 6-stage harness 0.6126 (**−0.10 loss**); `README.md:63` still says "a tuned harness beats a vanilla model" — contradiction flagged by their own `analysis/01-quality-analysis.md` |
| AQE↔MetaHarness already planned | **REFUTED.** No integration exists | `docs/metaharness/` was empty before this report; **zero** repo references to `metaharness`/`vertical:qe`; `integration-roadmap.md` is about MCP-tool wiring, not MetaHarness |

**What IS solid on each side (the composability thesis holds):**
- MetaHarness **wired & shipping**: `analyze-repo.ts` (deterministic, never executes repo code, memoized for a determinism contract), `genome.ts` (7-section readiness scorecard + verdict), `mcp-scan.ts` (static MCP-policy scanner, exits 1 on HIGH), `upgrade.ts` (3-way drift merge with conflict markers), `sbom-cmd.ts` (real SPDX-2.3), npm `--provenance` in CI, **9** host adapters (3 with genuine per-host default-deny).
- AQE **wired & shipping**: `sublinear-analyzer.ts` (HNSW, O(log n), exposed as `coverage_analyze_sublinear`), unified `better-sqlite3` memory, and — the crown jewel — the **deterministic blind-refuter pipeline** in `.claude/workflows/qcsd-development-review.js`: **3 refuters**, blind to finder confidence and each other, prompt literally says *"default to refuted=true when uncertain,"* **2-of-3 majority kills** (`killed = refutations.length >= Math.ceil(votes.length/2)`), JS synthesis (no agent in the loop). Validated run `wf_254f1271-022`: 15 findings → 14 upheld, **1 killed by 3-of-3 refutation.** Caveat: wired for the **QCSD-development phase only**; the other four QCSD phases are not yet implemented.

---

## 🤍 White Hat — Facts & Data

**What we objectively know:**

1. **The two products barely overlap in function.** MetaHarness's shipping surface is *factory machinery* (repo analysis → plan → scaffold → scan → SBOM → drift → multi-host emit → signed publish). AQE's shipping surface is *QE domain execution* (~70 skills, 60 agents, ~90 MCP tools, sublinear coverage, adversarial verification). Their wired feature sets are nearly disjoint.

2. **Each side's strength is the other's confirmed gap:**
   - AQE gaps (verified): no per-repo tuning (`src/init/*-installer.ts` install the full fleet wholesale), no minting/branding, no `mcp-scan`-style tool scanner (only static per-*role* allowlists in `src/mcp/tool-scoping.ts`), no signing of its *delivered findings* (the `src/audit/witness-chain.ts` Ed25519 chain signs *internal* pattern-lifecycle/quality-gate events, not user-facing outputs).
   - MetaHarness gaps (verified): no QE vertical (catalog has ~20 verticals — coding, trading, devops, legal… none QE; closest is a 7-line `test-writer` role inside `vertical:coding`); templates are *thin scaffolds* (system prompt + topology + guardrails, ~7–28 LoC), explicitly relying on the LLM + external MCP for domain depth; and its own benchmark (DRACO) shows generic harness structure *hurts* on frontier tasks.

3. **Both are young (v0.1.7 / pre-1.0 surfaces) and share an ecosystem/maintainer (ruvnet).** This lowers coordination cost and license/governance friction but raises the *two-young-projects-coupled* risk.

4. **One hard data point everyone must respect: DRACO.** MetaHarness's own measured result is that adding generic deep-research harness structure to a frontier model *reduced* quality by ~0.10 on its scorer. This is the single most important fact in the room: **structure must earn its cost, empirically, per domain.**

**What is measurable / worth measuring:**
- Whether a `vertical:qe` harness beats "vanilla AQE install" on a fixed QE task set (a "DRACO-for-QE").
- Whether AQE's blind-refuter pass changes finding precision/recall vs. no-verify (false-positive kill rate; the wf-022 run already shows 1/15 killed).
- `mcp-scan` HIGH-finding count against AQE's own ~90-tool surface (currently unknown — never run).

**Unknown / needs data:**
- Real `.agentic-qe/memory.db` row counts (the "265" / "1K+" figures are unverified in-code).
- How portable the refuter pipeline is outside the QCSD-development phase (only 1 of 5 phases is wired).
- Whether MetaHarness's degraded witness path can be cheaply completed (the napi/wasm bridge work is unestimated here).

---

## 🖤 Black Hat — Risks & Cautions (harshest critic)

**1. The DRACO lesson is a loaded gun pointed at `vertical:qe`.** MetaHarness *measured* that generic harness structure degrades a frontier model. If `vertical:qe` is "AQE's prompts wrapped in MetaHarness's topology," there is a real, evidenced risk it makes QE *worse* than just asking a good model to write tests — while adding latency, tokens, and a supply chain. Composing two systems does not guarantee the composite beats the simpler baseline. **Until a DRACO-for-QE proves otherwise, the headline move is unproven and could embarrass both projects.**

**2. Coupling two pre-1.0 projects creates a version-skew tar pit.** AQE ships 60 agents + ~90 MCP tools + 88+ learned patterns + a SQLite schema. MetaHarness ships a genome/plan format, a host-adapter contract, and a (degraded) witness format. Wire them and every AQE release can break the minted harness, and every MetaHarness genome/host change can break the QE vertical. Neither has a stable public contract. The drift-detection (`upgrade.ts`) helps the *scaffold* but does nothing for *semantic* drift in 90 tool signatures.

**3. Security blast radius of minting a 90-tool harness.** MetaHarness's whole safety thesis is *default-deny, minimal MCP surface*. AQE is the opposite — install-everything, ~90 tools, role-allowlists that include `allowAll` for `fleet-admin`/`unrestricted`. A naive `vertical:qe` would mint a harness that violates MetaHarness's own governance posture on day one. `mcp-scan` would (correctly) light up HIGH on AQE's surface. Reconciling "90 powerful QE tools" with "default-deny minimal surface" is real design work, not a wiring task.

**4. The witness story is half-built on the MetaHarness side.** Selling "signed QE harnesses" while the JS product's `verify_manifest` falls through to `{valid:true, ...degraded}` with a `TODO` is **security theater**. If AQE adopts MetaHarness's witness for provenance, it inherits a feature that does not cryptographically verify anything in a plain `npm install`. Shipping a "signed" badge over a no-op verifier is worse than no badge.

**5. AQE's refuter pipeline is narrower than it sounds.** It is wired for *one* QCSD phase, uses agents (cost, nondeterminism in the LLM calls even if synthesis is deterministic), and "default-to-refuted" can over-kill true findings. Extracting it as a reusable package means hardening it against the 4 unimplemented phases and proving the kill-rate is calibrated, not just aggressive.

**6. Maintenance burden & ownership ambiguity.** Who owns `vertical:qe` when it breaks — the AQE team or the MetaHarness team? A composite product needs a single on-call owner, a shared CI that runs *both* repos' tests against the integration, and a deprecation policy. None exists. Same-maintainer (ruvnet) mitigates but does not eliminate this; it can actually *hide* the coupling cost until it's load-bearing.

**7. Opportunity cost.** Both projects have unfinished core work (AQE: 4 of 5 QCSD phases; MetaHarness: 8 of 10 kernel subsystems + the witness bridge + the README/DRACO contradiction). Cross-pollination is seductive precisely because it's more fun than finishing your own kernel. The harshest read: *integrate before either core is done and you get two half-products lashed together.*

---

## 💛 Yellow Hat — Benefits & Value

**1. The composability is genuine and rare.** Verified: wired feature sets are nearly disjoint, and each gap maps to the other's strength. This is the cleanest "1+1" case you get — MetaHarness gives AQE the *distribution, governance, provenance, and per-repo tuning* it provably lacks; AQE gives MetaHarness the *one deep, defensible vertical* it provably lacks. MetaHarness's verticals are admittedly thin scaffolds; AQE is the densest domain content in the ecosystem.

**2. `vertical:qe` answers MetaHarness's existential question.** DRACO showed a *generic* harness doesn't beat vanilla. The obvious rebuttal is: *generic* doesn't, but *deep-domain* might. QE is the perfect test case — it has objective scorers (coverage, mutation score, kill-rate), so a "harness that demonstrably improves QE outcomes" would be MetaHarness's first evidence-backed win and directly rehabilitate the DRACO narrative.

**3. The biggest leverage is the *reverse* flow, and it's cheap.** AQE adopting MetaHarness's **`mcp-scan` + per-host default-deny** for its own ~90 tools closes a real, embarrassing gap (no per-repo tool governance) using *already-shipping* MetaHarness code. This is low-effort, high-credibility, and needs zero "composite product."

**4. AQE's adversarial-verify is a portable crown jewel.** The blind-refuter pipeline is domain-agnostic by construction (it sees only claim+evidence). Extracted as `@ruvector/adversarial-verify`, it could harden *every* MetaHarness vertical's outputs — and is exactly the kind of "earns-its-cost structure" DRACO says generic harnesses lack. This is AQE's most reusable IP and currently trapped in one workflow file.

**5. Who wins:**
   - *MetaHarness*: a flagship vertical with objective wins; proof that domain-specific structure beats vanilla; a verification primitive for all verticals.
   - *AQE*: distribution + branding it has never had; per-repo tuning (stop installing 60 agents everyone doesn't need); tool governance; real provenance on outputs.
   - *Users*: `npx metaharness my-repo --template vertical:qe` → a branded, genome-tuned, mcp-scanned QE harness with only the agents their repo needs.

**6. What becomes possible that isn't today:** genome→auto-recommend-QE-skills (the analyzer already detects languages/CI/test commands; mapping that to a *subset* of AQE's 60 agents is the per-repo tuning AQE can't do alone); self-testing harnesses (any MetaHarness-minted harness ships with an AQE smoke suite); a QE vertical that is the *reference* for "deep vertical done right."

---

## 💚 Green Hat — Creativity (beyond the obvious)

Ranked roughly by novelty × feasibility:

1. **`mcp-scan` AQE on itself, then publish the report.** Run MetaHarness's `scanMcp` against AQE's ~90-tool surface and `src/mcp/tool-scoping.ts`. Turn the HIGH findings into AQE's per-repo default-deny allowlist. *Bonus:* this is dogfooding that simultaneously validates MetaHarness's scanner on the largest real MCP surface in the ecosystem — a co-marketing artifact for both.

2. **Extract `@ruvector/adversarial-verify`** — the domain-agnostic blind-refuter (N refuters, blind, default-refuted, k-of-n kill, deterministic JS synthesis) as a standalone package. AQE keeps using it for QE; MetaHarness embeds it as an *optional output gate* for any vertical. This is the single most reusable asset across the whole ecosystem and it's currently one un-extracted `.js` file.

3. **DRACO-for-QE benchmark.** Build the rebuttal to DRACO: a fixed QE task set (generate tests for N repos), scored objectively (coverage delta, mutation kill-rate, false-finding rate), comparing (a) vanilla model, (b) AQE install, (c) `vertical:qe` harness, (d) `vertical:qe` + adversarial-verify. *This benchmark is the gate that decides whether the composite is worth building at all* — and it's valuable even if the answer is "no."

4. **Genome → QE-skill auto-recommender.** Feed `repo-profile.json` (languages, hasCi, test commands, mcp surface) into a recommender that selects the *subset* of AQE's 60 agents/70 skills the repo actually needs (e.g., SAP repo → `qe-sap-rfc-tester`+`qe-sod-analyzer`; React repo → `qe-visual-tester`+`qe-accessibility-auditor`). This *is* the per-repo tuning AQE lacks, built from machinery MetaHarness already ships.

5. **Verification-as-a-host-adapter.** Rather than a vertical, expose AQE's refuter as a MetaHarness *host capability*: any harness on any of the 9 hosts can route a claim through adversarial-verify before acting. Verification becomes infrastructure, not a product.

6. **Self-testing harnesses ("eat your own dog food").** Every MetaHarness-minted harness ships with a tiny AQE-generated smoke suite that runs in the harness's own CI (`host-github-actions` already emits workflows). The factory's output proves itself.

7. **Provenance the *right* way round.** Don't adopt MetaHarness's degraded JS witness. Instead, AQE already has a *real, tested* Ed25519 hash-chain (`src/audit/witness-chain.ts`). Point it at *delivered findings* (not just internal events) and contribute the working verifier *back* to MetaHarness to finish their `witnessVerify` TODO. Net: the working crypto flows B→A's-gap-and-then-A→B's-gap. Provenance is the one place AQE is *ahead*.

8. **Refuter-as-a-DRACO-scorer-component.** MetaHarness's DRACO needs honest scoring; AQE's default-refuted refuter is a natural "is this output actually good?" judge. Cross-wire them.

---

## ❤️ Red Hat — Intuition & Feeling (no justification)

- **Exciting / feels right:** AQE running `mcp-scan` on itself. It just *feels* correct — the QE project should obviously be the most-governed MCP surface, and it isn't. Mild embarrassment is the right motivator.
- **Exciting:** extracting `@ruvector/adversarial-verify`. This feels like the real treasure — everyone in the ecosystem would want it, and it's currently hidden in a workflow file. Strong pull.
- **Genuinely thrilling:** DRACO-for-QE. There's a satisfying narrative arc — "your own benchmark said harnesses don't help; here's the domain where it does (or honestly, doesn't)." Feels brave and on-brand for a team that publishes negative results.
- **Forced / uneasy:** the flagship `npx metaharness my-repo --template vertical:qe` headline. It *sounds* like the goal but my gut says it's the *last* step, not the first — and that rushing it produces a demo, not a product. The DRACO result makes me actively nervous about it.
- **Suspicious:** anything leaning on MetaHarness's witness. The degraded `{valid:true}` fallthrough leaves a bad taste; signing-theater is the kind of thing that erodes trust fast.
- **Quiet worry:** that "cross-pollination" becomes a way to avoid finishing cores (AQE's 4 missing QCSD phases, MetaHarness's 8 unwired kernel subsystems). Integration is more fun than finishing. That instinct should be respected.
- **Net feeling:** the *small reverse-direction moves (B→A: scan; A→B-as-package: verify)* feel right and energizing. The *big composite product* feels premature and slightly anxiety-inducing until a benchmark de-risks it.

---

## 🔵 Blue Hat — Process & Synthesis

### Prioritized action table

| # | Move | Direction | Effort | Value | Risk | Notes |
|---|------|-----------|--------|-------|------|-------|
| 1 | **Run `mcp-scan` on AQE's ~90 tools; build a default-deny allowlist from the HIGH findings** | B→A | **S** | High | Low | Uses shipping MetaHarness code; closes verified AQE governance gap; dogfoods the scanner on the biggest real surface |
| 2 | **Extract `@ruvector/adversarial-verify`** (blind refuters, default-refuted, k-of-n kill, deterministic synthesis) | A→ shared | **M** | **Very High** | Low–Med | AQE's most portable IP; must harden beyond the 1 wired QCSD phase + calibrate kill-rate |
| 3 | **DRACO-for-QE benchmark** (vanilla vs AQE-install vs vertical:qe vs vertical:qe+verify) | both | **M** | **Very High (decision gate)** | Low | The go/no-go for the whole composite; valuable even if it says "no" |
| 4 | **Genome → QE-skill subset recommender** | both | **M** | High | Med | Delivers AQE's missing per-repo tuning from MetaHarness machinery; needs a skill→profile mapping |
| 5 | **MetaHarness embeds adversarial-verify as optional output gate** for verticals | A→B | **S** (after #2) | High | Low | Directly addresses DRACO's "structure must earn its cost" |
| 6 | **`vertical:qe` minted harness** (`npx metaharness … --template vertical:qe`) | both | **L** | High (headline) | **High** | **Gated on #3 passing.** The composite product; do not start until benchmark de-risks it |
| 7 | **Finish MetaHarness `witnessVerify` using AQE's working Ed25519 chain; sign delivered findings** | A→B then B→A | **L** | Med | Med | Replaces security-theater with real crypto; lower priority than core de-risking |
| 8 | **Version-contract + shared integration CI** before any deep coupling | both | **M** | Med (enabler) | — | Prerequisite hygiene for #6; pin genome/host/tool-signature contracts |

### Recommended sequence

```
Phase 0 (now, parallel, low-risk):  #1 mcp-scan-self   +   #2 extract adversarial-verify
Phase 1 (the gate):                 #3 DRACO-for-QE benchmark  ← decides everything downstream
Phase 2 (if #3 ≥ vanilla):          #4 genome-recommender  +  #5 verify-as-output-gate
Phase 3 (only if Phase 2 lands):    #8 contracts/CI → then #6 vertical:qe → later #7 provenance
ABORT condition:                    if #3 shows vertical:qe ≤ vanilla (the DRACO pattern repeats),
                                    STOP at Phase 2. Ship #1/#2/#5 as standalone wins. Do NOT build #6.
```

### Single highest-leverage first move

**Move #2 — extract `@ruvector/adversarial-verify` — is the highest-leverage first move**, with **#1 (`mcp-scan` self-audit) as a same-sprint quick win** running in parallel.

Rationale: #2 liberates AQE's single most reusable, most differentiated asset — a domain-agnostic verification primitive that DRACO's own logic says is the *kind* of structure that earns its cost (unlike generic research scaffolding). It benefits AQE immediately (reuse across its 4 unwired phases), benefits MetaHarness immediately (an output gate for every vertical), and is a prerequisite for the only honest version of the composite product (#3/#6). It requires *no coupling of the two products* to deliver value, sidestepping every Black Hat coupling/version-skew risk. #1 is the cheap credibility win that makes AQE practice the governance MetaHarness preaches.

### Is the "composite QE harness factory" worth pursuing?

**Conditionally yes — but not yet, and not on faith.** The composability is real and verified (disjoint shipping surfaces, complementary gaps, shared maintainer). But MetaHarness's *own measured DRACO result* forbids building `vertical:qe` on the assumption that wrapping AQE in a harness helps. The intellectually honest path:

1. **Do the cheap, decoupled wins now** (#1, #2) — they pay off regardless.
2. **Let the DRACO-for-QE benchmark (#3) be the judge.** If a deep, verification-gated QE harness *measurably* beats both vanilla and bare AQE-install, build the factory (#6) — and it becomes MetaHarness's evidence-backed flagship and AQE's distribution story. If it ties or loses, you will have *honestly* learned that QE belongs as a *library AQE ships* and a *verify primitive MetaHarness embeds*, not as a minted harness — and you'll have shipped #1/#2/#5 anyway.

The trap to avoid is the briefing's own framing: leading with the headline `npx metaharness … --template vertical:qe`. That is the *last* brick, gated on evidence — not the first. Lead with the verification primitive and the self-audit; let the benchmark decide the rest.

---

*Prepared via Six Thinking Hats parallel analysis. All asset/gap claims grounded in file-level audit of both repos; briefing figures corrected where the source disagreed. No repo code was executed; no files in either repo were modified beyond writing this report.*
