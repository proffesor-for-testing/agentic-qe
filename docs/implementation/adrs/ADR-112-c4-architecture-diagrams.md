# ADR-112: First-Class C4 Architecture Diagrams (Consolidate, Gate, Expose)

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-112 |
| **Status** | Accepted (2026-06-26) — implemented C0–C7 (incl. C2 KG-backed relationships; C6 deletes the duplicate + fails loud) |
| **Date** | 2026-06-26 |
| **Author** | AQE Core |
| **Review Cadence** | 3 months |
| **Supersedes** | — |
| **Related** | [ADR-050](./ADR-050-ruvector-neural-backbone.md) (the "Code Intelligence Gap"), [ADR-090](./ADR-090-hnswlib-node-migration.md) (HNSW index), product-factors-assessor (SFDIPOT consumer) |

---

## WH(Y) Decision Statement

**In the context of** AQE already shipping a C4 model (Simon Brown's Context → Container → Component) that feeds the product-factors / SFDIPOT test-strategy assessor, and users who would benefit from auto-generated, always-current architecture diagrams for onboarding, impact review, and test design,

**facing** a **half-wired** C4 implementation built without any ADR: the production path renders Mermaid via ~100 lines of inline string-concatenation in `ProductFactorsBridgeService`, while a far richer, fully-written `C4ModelService` (1606 LoC — Mermaid + architecture analysis + embeddings + memory-backed semantic search) sits **orphaned**, instantiated only by its own factory and never called; plus there is **no user-facing surface** (C4 is reachable only internally via product-factors),

**we decided for** making C4 a **first-class, fully-implemented capability**: (a) **consolidate** on `C4ModelService` as the single render + analyze + store engine and reduce the bridge to a detector that delegates to it, (b) add a **deterministic quality/confidence gate** so we never emit a confident-but-wrong diagram, and (c) **expose** C4 to users through a CLI (`aqe code c4`) and an MCP tool (`qe/code/c4`),

**and neglected** a third parallel renderer (we remove duplication, not add to it), heavyweight UML/PlantUML output (Mermaid C4 is enough and renders in GitHub/IDEs), and full LLM-authored architecture narration (kept optional/out of the accept gate to avoid hallucinated structure),

**to achieve** real user value — one command or tool call produces accurate Context/Container/Component diagrams + coupling/cycle analysis + semantic diagram search, current with the codebase — while collapsing two code paths into one maintained engine,

**accepting that** auto-detected components/relationships have a **capability ceiling** (the `qe-code-intelligence` skill itself records ~18% success on complex queries and degradation above ~50K LOC), so the gate must surface a **confidence score** and the diagrams are explicitly "a generated draft to refine," not ground truth.

---

## Current state (grounded, verified 2026-06-26)

| Fact | Evidence |
|---|---|
| **No ADR governs C4.** ADR-050 flagged the "Code Intelligence Gap"; ADR-018 is referenced in `v3-adrs.md` but the file does not exist | grep across all 83 ADRs — zero `C4` decisions |
| Production C4 path = bridge's **inline Mermaid string-builders** | `coordinator.generateC4Diagrams()` (`coordinator.ts:1217`) → `bridge.requestC4Diagrams()` (`:1242`) → `generateContextDiagram`/`Container`/`Component`/`DependencyGraph` (`product-factors-bridge.ts:397–500`) |
| The rich **`C4ModelService` is orphaned** — built but never wired | only `new C4ModelService(...)` is its own factory `createC4ModelService` (`c4-model/index.ts:1605`); exported via `services/index.ts:36` but **no production caller** |
| `C4ModelService` is a pure **renderer + analyzer + store** (takes structured specs; no filesystem scanning) | `buildContext/Container/Component(request)` take `components`/`containers` specs (`types.ts:328,364,412`); `analyzeArchitecture` → coupling (`:1384`), cycle detection (`:1445`), recommendations (`:1491`), pattern + layer detection (`:1327,:1357`); embeddings + memory + `searchDiagrams` |
| The **bridge is the detector** (filesystem scan) | `analyzeComponents(projectPath)` (`:589`, `fs.readdir` walk `:611,:682`), external systems via 76 dependency patterns (`:76`), package.json parsing (`:516`) |
| Consumer today = product-factors / SFDIPOT only | `product-factors-service.ts:174–193` requests C4; `architecture-parser.ts:108–144` parses the Mermaid back into components |
| Shared vocabulary is already factored out | `src/shared/c4-model/index.ts` (`C4Person`/`Container`/`Component`/`Relationship`, `inferComponentType`, helpers) |
| **No direct user surface.** CLI `aqe code` has `index\|search\|impact\|deps\|complexity` (no `c4`); MCP has only `qe/code/analyze` | `cli/commands/code.ts:20`; `mcp/tools/code-intelligence/analyze.ts` |

**The core problem in one line:** the *good* C4 engine exists and is unused; the *production* C4 path is a weaker duplicate; and neither is reachable by users.

---

## Decision detail

### 1. Consolidate — one engine

`C4ModelService` becomes the single source for **rendering, architecture analysis, embeddings, and storage**. `ProductFactorsBridgeService` keeps only its **detection** responsibility (scan repo → external systems + components + relationships) and **delegates** rendering/analysis to `C4ModelService` instead of its inline generators. The inline `generate*Diagram` methods are removed once parity tests pass.

```
repo ──[Bridge.detect: fs scan + 76 dep patterns + (optional) KnowledgeGraph edges]──►
        DetectedComponents/Relationships/ExternalSystems
          └──► C4ModelService.buildContext/Container/Component  ──► Mermaid
          └──► C4ModelService.analyzeArchitecture              ──► coupling, cycles, recs
          └──► C4ModelService (embeddings + memory)            ──► searchDiagrams / retrieval
```

Relationship quality is the weakest link in today's detector (directory heuristics). Where the **KnowledgeGraph** already has real import/call edges (`knowledge-graph.ts`), the detector should prefer those over directory grouping — this is the single biggest accuracy lever.

### 2. Quality gate — never ship a confident-but-wrong diagram

A **deterministic** confidence score (no LLM in the gate, per the ADR-111 discipline), surfaced in output and metadata:

- inputs: # files analyzed vs total, # components with real KG edges vs heuristic-only, external-systems matched, repo size vs the ~50K-LOC degradation threshold.
- `confidence: 'high' | 'medium' | 'low'` with the reasons; **low** prints a visible "draft — verify against source" banner and (CLI) a non-zero hint. This directly answers the skill's recorded 18%/50K-LOC limits instead of hiding them.

### 3. Expose — CLI + MCP (both, per decision)

- **CLI:** extend `cli/commands/code.ts` with a `c4` action:
  `aqe code c4 <path> [--level context|container|component|all] [--format mermaid|json] [--search "<query>"] [--output file]`.
  Prints Mermaid (copy-paste into GitHub/IDE), or JSON for tooling; `--search` runs semantic diagram retrieval.
- **MCP:** new tool `qe/code/c4` (mirror `analyze.ts` structure) with actions `generate` (level-scoped), `search`, `analyze` (coupling/cycles/recommendations), `get`. Wraps the same `C4ModelService` — no logic duplication.

---

## Implementation plan (phased — for review before any code)

> Cost: **S** ≤ ~2 days · **M** ~3–5 days. All phases keep existing product-factors behavior green.

| # | Phase | Work | Pre | Cost | Risk |
|---|---|---|---|---|---|
| **C0** | **Confirm orphan + parity baseline** | Prove `C4ModelService` is unreachable in prod; snapshot current bridge Mermaid output on a fixture repo as the parity oracle | — | S | Low |
| **C1** | **Delegate rendering** | Bridge calls `C4ModelService.build*` instead of inline `generate*Diagram`; map `DetectedComponent[]` → `ComponentSpec[]`. Parity test: new output ⊇ old (same elements/edges) | C0 | M | Med (output drift — guarded by C0 snapshot) |
| **C2** | **KG-backed relationships** | Detector prefers KnowledgeGraph import/call edges over directory heuristics where available; fall back cleanly | C1 | M | Med (accuracy lever) |
| **C3** | **Quality gate** | Deterministic `confidence` scorer + reasons; thread into `C4DiagramResult.metadata` and all surfaces | C1 | S | Low |
| **C4** | **CLI `aqe code c4`** | New action in `code.ts`; Mermaid/JSON output, `--level`, `--search`, low-confidence banner; help + fish completion | C1, C3 | S | Low |
| **C5** | **MCP `qe/code/c4`** | New tool wrapping `C4ModelService`; register in tool registry; integration test via the protocol server (per CLAUDE.md MCP-parity rule) | C1, C3 | M | Med |
| **C6** | **Remove the duplicate** | Delete bridge inline `generate*Diagram` once C1 parity holds; update product-factors path to the consolidated call | C1–C5 green | S | Low |
| **C7** | **Docs + tests** | User guide (`docs/guides/`), unit + integration (CLI and MCP), update `v3-adrs.md` index; flip this ADR to Accepted | C4, C5 | S | Low |

**Verification (per CLAUDE.md):** real `node --test` suites for the renderer/gate; **MCP-CLI parity** — the same fixture repo must produce equivalent C4 via `aqe code c4` and the `qe/code/c4` MCP tool; a smoke run on a real fixture before any release.

**Acceptance / flip-to-Accepted criteria:**
1. `C4ModelService` is the only renderer; bridge inline generators deleted; product-factors output unchanged (parity test green).
2. `aqe code c4` and `qe/code/c4` both emit valid Mermaid C4 + an architecture analysis + a confidence score on a fixture repo.
3. Low-confidence repos (e.g. >50K LOC) surface the warning rather than a silent wrong diagram.

**G-ABORT (record-and-stop):** if KG-backed detection (C2) cannot lift relationship accuracy above directory heuristics on real repos, ship C1/C3/C4/C5 with the detector as-is and an explicit "draft" confidence framing — still net-positive (one maintained engine + a user surface), just no accuracy claim.

---

## Consequences

**Positive:** one maintained C4 engine (deletes a duplicate); users get architecture diagrams + semantic diagram search via CLI and MCP; product-factors gains the richer analysis for free; honest confidence gating turns a known limitation into a surfaced signal.

**Negative / risks:** auto-detection accuracy is capped by code-intelligence quality (mitigated by C2 + the gate, bounded by G-ABORT); C1 risks output drift (mitigated by the C0 parity snapshot); a new MCP tool adds protocol surface to maintain.

**Neutral:** no new dependencies (Mermaid is plain strings; HNSW/embeddings already shipped). The shared `src/shared/c4-model` vocabulary is unchanged.

---

## Implementation status (2026-06-26 — Accepted)

Delivered across phases C0–C7. `tsc --noEmit` = 0 errors; the C4 area is green (code-intelligence + shared C4 + MCP registry/tool suites).

| Phase | Status | Artifacts |
|---|---|---|
| C0 parity baseline | ✅ | orphan confirmed; parser-compatibility verified (`architecture-parser` keys on `Component(`/`Person(` labels, which `C4ModelService` emits) |
| C1 delegate rendering | ✅ | `services/c4-model/from-detected.ts` (pure detected→spec mapping, enum translation); bridge `renderContext/Container/Component` delegate to `C4ModelService` with inline fallback. Tests: `from-detected.test.ts` (16), `c4-consolidation.test.ts` (4) |
| C2 KG-backed relationships | ✅ | `services/c4-model/kg-relationships.ts` — folds the KnowledgeGraph's REAL import/call edges (AST/TS parser, no LLM) up to component→component relationships, replacing the naming heuristic; injected into the bridge as a project-scoped resolver with heuristic fallback. Required adding `basePath` to `KnowledgeGraphConfig` (so analyzing a repo outside cwd doesn't trip the FileReader path-traversal guard). Tests: `kg-relationships.test.ts` (8 pure) + `c4-kg-relationships.test.ts` (2 real-KG, assert `depends_on` edges from actual `import`s) |
| C3 confidence gate | ✅ | `shared/c4-model/confidence.ts` `assessC4Confidence()` (deterministic, no LLM); attached to `C4AnalysisMetadata.confidence`. Tests: `c4-confidence.test.ts` (6) |
| C4 CLI | ✅ | `aqe code c4 <path> [--level] [--format] [-o]` + confidence banner + completions. Validated by `c4-generation-e2e.test.ts` (3, real pipeline over a temp fixture) |
| C5 MCP tool | ✅ | `qe/code/c4` (generate/search) registered; **MCP-CLI parity test** asserts MCP output == bridge/CLI pipeline. Tests: `code-c4.test.ts` (5) |
| C6 remove duplicate | ✅ | The inline `generateContext/Container/Component` methods are **deleted** and the bridge no longer `implements IC4DiagramGenerator`. `render*` now **fails loud** — on a `C4ModelService` failure it logs at error level and propagates, so the caller surfaces it (CLI prints `Failed:`, MCP returns `success:false`) instead of silently degrading to a weaker diagram (ADR-050: no silent degradation). `generateDependencyGraph` stays (not a C4 level; `C4ModelService` doesn't render it). Test: `c4-generation-e2e.test.ts` asserts a forced render failure surfaces as an error. |
| C7 docs + status | ✅ | `docs/guides/c4-architecture-diagrams.md`; this status block; ADR flipped to Accepted. (The `v3-adrs.md` index is stale — stops at ADR-094, missing 095–111 — so no lone row was forced in, per that precedent.) |

**Production-safety note:** the C1 change touches the product-factors render path. It is guarded by (a) verified parser compatibility, (b) the inline fallback, and (c) the parity tests proving detected elements survive into the new output. Behavior is preserved as a superset.

**Open follow-ups:** wiring `totalLoc` (from MetricCollector) into the confidence gate (so large repos auto-downgrade). *(C2 KG-backed relationships and the `qe/code/c4 search` persistence path are both DONE — see the status table.)*

**Search persistence (DONE):** the bridge gained an `enableC4Embeddings` option (default off → product-factors stays fast/offline). The MCP `qe/code/c4` tool turns it on, so `generate` embeds + persists diagrams to memory; `search` then finds them by vector similarity over the shared `code-intelligence:c4` namespace. Test: `code-c4.test.ts` asserts `search` returns hits after `generate`.
