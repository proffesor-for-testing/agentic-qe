# Minting an AQE Harness — Analysis + `vertical:qe` Authoring Plan

**Date:** 2026-07-02 · **Author:** AQE Core
**Subject:** whether/how to mint a MetaHarness harness for the `agentic-qe` fleet.
**Grounded in:** the prior beta-evaluation (`00`–`07` in this folder), [ADR-111](../implementation/adrs/ADR-111-darwin-qe-self-learning.md), and live runs of `metaharness score` / `harness analyze-repo` / `harness mcp-scan` against this repo on 2026-07-02.

> **TL;DR** — The plain `vertical:coding` mint is a *downgrade* for AQE (generic agents we already out-class). AQE's MCP governance already scans clean (LOW). The genuinely useful project is **`vertical:qe`**: a *thin* factory template that scaffolds AQE's **measured, shipped** product — the asymmetric escalation lane + deterministic arena oracle from ADR-111 — as a branded, governed, per-repo harness. It must **not** be positioned as "a QE harness that beats a frontier model" (that claim is a documented G-ABORT).

---

## 1. Baseline mint — what MetaHarness produces for AQE today

Ran the deterministic (no-exec) analyzer and scorecard against this repo.

**`metaharness score .` → scaffold-ready, but generic:**

| Metric | Score |
|---|---|
| Harness fit | 88/100 |
| Compile confidence | 100/100 |
| Task coverage | 79/100 |
| Tool safety | 100/100 |
| Memory usefulness | 44/100 |
| Est. cost/run | $0.048 |
| Hard constraints | 6/6 ✓ scaffold-ready |

**`harness analyze-repo .` recommendation:**

- Best archetype: `typescript-sdk-harness` (77% · lexical)
- Template: `vertical:coding` · Hosts: claude-code + codex (both detected)
- Agents: architect, implementer, reviewer, test-writer (generic ~1-paragraph prompts)
- MCP: local · default-deny · shell/network gated, file-write read-scoped

**Finding — the baseline mint underserves AQE.** A trial scaffold (21 files) produced four generic agents whose reviewer prompt is a single paragraph. AQE already ships ~60 `qe-*` agents, ~70 skills, ~90 MCP tools, and a blind-refuter verification pipeline — vastly richer. **Minting `vertical:coding` gives less than we already have.** The scaffold's real value is the *shell*: packaging, Ed25519 signing, default-deny MCP policy, and Darwin `evolve` wiring — not the agent content. This matches the `00`/`04` conclusion: *MetaHarness is a factory with thin content; AQE is deep content with no factory — they compose, they don't compete.*

---

## 2. MCP governance — `harness mcp-scan` result: **PASS**

Scanned the live repo and, for contrast, the June snapshot taken *before* the plan-05/A1 cross-pollination work.

| | June snapshot (before A1) | **Live repo (2026-07-02)** |
|---|---|---|
| Worst severity | 🔴 HIGH | 🟢 **LOW** |
| Findings | 10 (2 HIGH, 6 MED, 2 LOW) | **1 (LOW)** |
| default-deny | ❌ not enforced | ✅ enforced |
| shell / network / file-write | ❌ all granted | ✅ all gated |
| approval gate / audit / timeout / secret-guard | ❌ missing | ✅ present |

The sole remaining finding — "21 unpinned dependency ranges" (LOW) — is already recorded as an **accepted risk** in `.harness/mcp-policy.json` (*"normal for a 23-dep application; the pinning check targets minted single-purpose harnesses, N/A here"*).

**No action needed.** The prior A1 work closed every HIGH/MEDIUM. Notably, `.harness/mcp-policy.json` ties each posture to real code via its `_enforcement` block (`src/mcp/tool-scoping.ts isToolAllowed()` → `return false`; `src/audit/witness-chain.ts` Ed25519 chain) — the "stated vs wired" honesty MetaHarness's own reports demanded of it.

**One genuine follow-up (not a scan failure):** `toolTimeoutMs`, `maxToolCallsPerTurn`, and `requireApprovalForDangerous` are self-declared **STATED, not ENFORCED** — host-layer wiring is outstanding.

---

## 3. `vertical:qe` authoring plan

### 3.0 Framing (keeps it honest — per ADR-111)

ADR-111 lists as an explicit **non-goal**: *"the generic `vertical:qe` composite (DRACO/ADR-038 prior leans G-ABORT)."*

> **`vertical:qe` is NOT "a QE harness that beats a frontier model."** That is falsified — *the coder binds, not the oracle*. It **IS** a factory template that scaffolds AQE's *measured, shipped* product: the **asymmetric escalation lane + deterministic arena oracle**.

Four load-bearing constraints from ADR-111, encoded **structurally** (not as prose):

1. **Cheap tier only on bounded QE generation** (a test, a coverage probe) — never cross-file reasoning.
2. **Best-of-k, never a single gated escalation shot** (Goodhart — a single sniper shot added $25 for 0 gold lift).
3. **Accept gate is pure code** (mutation-kill 0.6 + coverage 0.3) — no LLM judge, no self-authored test as signal.
4. **Top tier swappable + benchmarked on *our* scorer** — external leaderboard rank does not transfer (qwen3-coder was catastrophic in-scaffold).

The measured product (ADR-111 D3, n=30, 5 modules): escalation lane **81.6 ±0.9** vs frontier **82.7 ±2.9** (within noise), **~83% of tasks $0-local** → ~70–85% paid-LLM cost cut at ~frontier quality, on a box that runs the 30B model.

### 3.1 Architecture — a *thin* template that composes AQE

The template does **not** reimplement QE. It scaffolds config + governance + the benchmark gate, and **depends on the published `agentic-qe` package** for the engine (MCP tools, `src/routing/free-tier/executor.ts`, `src/integrations/darwin/qe-fitness.ts`, the arena scorer). This is the only architecture consistent with ADR-111 (which built D1/D2/D6–D9 *inside AQE*) and with the "don't duplicate" finding.

```
npx metaharness my-qe-bot --template vertical:qe --host claude-code
        │
        ├─ scaffolds: QE agents + settings + arena-gate config + conformance bench
        └─ depends on: agentic-qe (the engine)  ← deep content, already measured
```

### 3.2 Concrete file targets (in `agent-harness-generator`)

Mirror `packages/vertical-trading/` — the proven pattern:

```
packages/vertical-qe/
├── package.json                       # @metaharness/vertical-qe, dep @metaharness/vertical-base
├── src/index.ts                       # load() → {manifest, templateRoot}  (copy trading verbatim)
├── templates/
│   ├── manifest.json                  # id "vertical:qe", files[], vars[]
│   ├── package.json.tmpl              # harness dep: "agentic-qe": "^3.11"
│   ├── CLAUDE.md.tmpl                 # QE rules + the 4 ADR-111 constraints + 8GB caveat
│   ├── .claude/settings.json.tmpl     # AQE default-deny policy (scans LOW)
│   ├── .harness/mcp-policy.json.tmpl  # port AQE live policy incl. _enforcement block
│   ├── src/agents/test-architect.ts.tmpl
│   ├── src/agents/coverage-specialist.ts.tmpl
│   ├── src/agents/security-scanner.ts.tmpl
│   ├── src/agents/quality-gate.ts.tmpl
│   └── src/qe/arena-gate.ts.tmpl      # thin wrapper → agentic-qe arena oracle + escalation lane
└── __tests__/pack.test.ts             # copy trading's pack test
```

Register in three places (confirmed where `trading`/`coding` are wired):
- `packages/create-agent-harness/src/analyze-repo.ts` — recommend `vertical:qe` for QE-signal repos
- `packages/create-agent-harness/src/index.ts` — external template loader
- `crates/template-catalog/src/lib.rs` — add a `qe-fleet-harness` archetype keyed on `hasMcp` + `qe-*` agent presence + test-tooling signals (today AQE resolves to `typescript-sdk-harness` @ 77%)

### 3.3 What the scaffolded harness contains

- **Agents** with real prompts distilled from `.claude/agents/v3/qe-*` (test-architect, coverage-specialist, security-scanner, quality-gate) — not the generic 4.
- **`arena-gate.ts`** — ~40-line wrapper calling `agentic-qe`'s arena scorer (mutation-kill 0.6 + coverage 0.3) as the **accept gate**. Pure code; DRACO/Goodhart-immunizing.
- **Escalation-lane config** — `{ enableFreeTier, freeTierModel: 'qwen3:30b-a3b', freeTierBestOfK: 2 }`, wired to AQE's existing executor. **Off by default** (matches ADR-111).
- **Governance** — port AQE's `.harness/mcp-policy.json` verbatim (LOW scan + honest `_enforcement`).

### 3.4 The gate that lets it ship (non-negotiable)

ADR-111's Accepted status is conditional on a benchmark; DRACO's lesson is *don't ship an unmeasured harness claim*. The template ships with, and is CI-gated by, a **DRACO-for-QE conformance bench** that **already exists**: `docs/metaharness/prototype/d3-proof.mjs` + `d3-corpus/`.

Port into `packages/vertical-qe/bench/`, wire like the repo's `draco.yml`:
- 4 arms (vanilla-local / best-of-k / vanilla-frontier / escalation), 5-module corpus, composite ±SE.
- **PASS:** escalation lane within ~2 SE of frontier while keeping the majority of tasks local (matches the n=30 result).
- **The README may only claim what the bench measures** — "~frontier QE quality at ~17% of frontier cost," never "beats frontier."

### 3.5 Phased plan & effort

| Phase | Work | Effort | Gate to advance |
|---|---|---|---|
| **P0** Skeleton | Copy `vertical-trading/` → `vertical-qe/`, rename, `pack.test.ts` green | S (½ day) | `npm test -w @metaharness/vertical-qe` passes |
| **P1** Content | Port 4 QE agent prompts, write `arena-gate.ts` + policy tmpl | M (1–2 days) | scaffolds + `harness doctor`/`mcp-scan` clean |
| **P2** Recommendation | Add `qe-fleet-harness` archetype (`template-catalog` + `analyze-repo.ts`) | M | `harness analyze-repo <qe-repo>` recommends `vertical:qe` |
| **P3** Gate | Port `d3-proof.mjs` → `bench/`, wire CI, reconcile claims to measured numbers | L (2–3 days) | Bench PASS with Wilson/SE; README == bench output |
| **P4** Ship | `examples-packages/qe/` wrapper (`npx @metaharness/qe`), sign, SBOM, PR | M | `harness sign`/`verify` + `harness score` ≥ baseline |

### 3.6 Honesty constraints baked into the template

- Escalation lane **off by default**; on-miss falls through to paid path (can only save money).
- CLAUDE.md.tmpl states the **8 GB caveat** — the 30B model floor; an 8 GB box gets no savings (qwen3:8b scored 0/3 valid).
- Cost strings labeled **"escalation-rate × frontier-price estimate,"** not invoices (token accounting is open).
- Production-oracle caveat surfaced: shipped coordinators gate on a **structural proxy** (block+assertion), not full mutant execution.

### 3.7 Open decisions

1. **Where `vertical:qe` lives** — upstream in `ruvnet/agent-harness-generator` (real OSS contribution, needs their review) vs. a controlled fork. Changes P4 entirely.
2. **Dependency coupling** — pin `agentic-qe` as a hard dep (simple; inherits AQE's 23-dep surface) vs. first extract the escalation lane + arena scorer into a small `@ruvector/qe-arena` package (cleaner; this is the "extract adversarial-verify" B→A zero-coupling win from report `04`).

---

## 4. Recommendation

- **Do not ship the plain `vertical:coding` mint** — it is a downgrade.
- **MCP governance is already clean** — close only the STATED-not-ENFORCED bound wiring (§2), separately.
- **Treat `vertical:qe` as the real project**, scoped strictly to the ADR-111-measured escalation lane + arena oracle, gated on the ported DRACO-for-QE bench. Start with **P0** (reversible skeleton) while decisions §3.7 are resolved.
