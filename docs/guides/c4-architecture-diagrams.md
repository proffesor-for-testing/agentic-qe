# C4 Architecture Diagrams

Generate [C4 model](https://c4model.com/) architecture diagrams (Context → Container → Component, as Mermaid) directly from your codebase — with a confidence score so you know how much to trust the auto-detected structure.

> **What it is:** AQE scans your repo, detects components (from `src/` structure), external systems (from dependencies), and their relationships, then renders standard C4 Mermaid you can paste into GitHub, a README, or any Mermaid-aware IDE. A deterministic quality gate rates the result `high` / `medium` / `low`.

---

## CLI

```bash
# All three C4 levels for the current repo (Markdown with fenced mermaid blocks)
aqe code c4 .

# Just the component diagram
aqe code c4 src/ --level component

# Full structured result as JSON, written to a file
aqe code c4 . --format json -o c4.json
```

| Flag | Values | Default | Meaning |
|------|--------|---------|---------|
| `--level` | `context` \| `container` \| `component` \| `all` | `all` | Which C4 level(s) to emit |
| `--format` | `text` \| `json` | `text` | `text` = Markdown + Mermaid; `json` = full result object |
| `-o, --output <path>` | file path | stdout | Write the output to a file |

**Text output** prints each diagram in a ` ```mermaid ` block, then a confidence banner and a short architecture summary:

```
Confidence: MEDIUM (55%)
  - No relationships detected between components — edges are heuristic-only or missing; the structure is unverified.
  - Auto-generated draft — verify against the source before relying on it.

  Components: 6  External systems: 2  Relationships: 0
```

---

## MCP tool

`qe/code/c4` exposes the same engine to agents and IDEs.

```jsonc
// Generate
{ "action": "generate", "projectPath": ".", "level": "all" }

// Semantic search over previously generated diagrams
{ "action": "search", "query": "where does auth talk to the database", "limit": 5 }
```

`generate` returns `{ diagrams, confidence, componentsDetected, externalSystemsDetected, relationshipsDetected, circularDependencies }`. The CLI and MCP drive the **same** pipeline, so their diagrams match.

---

## How confidence is scored

The gate is **deterministic** (pure code, no LLM — it can't be talked into a good score). It reflects the detector's known limits:

| Signal | Effect |
|--------|--------|
| 0 components detected | `low` (empty diagram) |
| No relationships between components | penalized — "structure unverified" |
| External systems detected from deps | small boost (Platform picture grounded) |
| Repo > ~50K LOC | downgraded to draft (detection degrades at scale) |
| Single component | slight penalty (under-segmented) |

**Treat `medium`/`low` diagrams as a starting draft to refine, not ground truth.** Architecture detection is heuristic — most accurate on well-structured `src/` trees and small-to-mid repos.

---

## How it works (under the hood)

```
your repo ──► detect (src/ structure + dependency patterns)
          ──► C4ModelService (render Mermaid + architecture analysis + store)
          ──► confidence gate ──► CLI / MCP / product-factors (SFDIPOT)
```

The same C4 output also feeds the product-factors / SFDIPOT test-strategy assessor, so generating diagrams improves test-design analysis for free.

See [`ADR-112`](../implementation/adrs/ADR-112-c4-architecture-diagrams.md) for the design decision.
