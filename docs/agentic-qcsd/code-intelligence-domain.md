# Code Intelligence in AQE

Code Intelligence is one of AQE v3's 13 DDD bounded contexts. It's the domain responsible for **understanding your codebase programmatically** — building a queryable knowledge graph from source code, then using that graph for semantic search, impact analysis, and dependency mapping.

## The 5 API Operations

Defined in `v3/src/domains/code-intelligence/interfaces.ts`:

| Operation | What it does |
|-----------|-------------|
| `index(request)` | Parses source files, extracts entities/relationships, builds the knowledge graph |
| `search(request)` | Semantic, exact, or fuzzy search across indexed code entities |
| `analyzeImpact(request)` | Given changed files, finds all affected code + tests via graph traversal |
| `mapDependencies(request)` | Maps incoming/outgoing/both dependency edges for a file |
| `queryKG(request)` | Runs Cypher or natural-language queries against the knowledge graph |

---

## Component 1: KnowledgeGraphService (`services/knowledge-graph.ts`, ~1438 lines)

This is the foundation. It builds and queries the code knowledge graph.

### Indexing (AST parsing)

- For TypeScript/JavaScript: uses the TypeScript compiler API to walk the AST and extract **entities** (classes, functions, interfaces, types, variables, modules) and **edges** (import, call, extends, implements, contains).
- For Python: falls back to regex-based extraction for classes, functions, and imports.
- Each entity gets a **384-dimensional vector embedding** via NomicEmbedder for semantic search.

### Querying

- **Cypher queries**: A built-in parser supports `MATCH (n:Type) WHERE n.name = 'Foo' RETURN n` patterns — it doesn't use Neo4j, it pattern-matches against the in-memory graph.
- **Natural language queries**: Converts the query to a vector embedding, searches against entity embeddings, with keyword fallback if vector search returns nothing.

### LLM-enhanced extraction (ADR-051)

- Optionally uses `HybridRouter` to call an LLM for deeper relationship extraction — design patterns, architectural boundaries, dependency impacts that pure AST parsing misses.

### Storage model

- Cache-only — the graph is rebuilt from source on each initialization. No persistent storage for nodes/edges.
- LRU eviction when node count exceeds 100,000.

---

## Component 2: ImpactAnalyzerService (`services/impact-analyzer.ts`, ~567 lines)

Covered in detail in [regression-testing-agent.md](./regression-testing-agent.md) — this is where it lives as a domain service. It queries the knowledge graph to answer "what's affected by this change?" using BFS traversal with distance-decayed risk scoring.

Key methods:

- `getImpactedTests()` — for each changed file, queries KnowledgeGraph with `direction: 'incoming', depth: 3`, also searches by naming convention patterns.
- `analyzeDirectImpact()` — depth-1 incoming dependencies.
- `analyzeTransitiveImpact()` — BFS traversal up to maxDepth (default 5) with visited set.
- `calculateFileRiskScore()` — `inDegree/20` (cap 0.3) + `outDegree/30` (cap 0.2) + critical path bonus (+0.3) + entry point bonus (+0.2), with distance decay `0.8^(distance-1)`.
- `calculateRiskLevel()` — weighted composite mapped to severity (>=0.8 critical, >=0.6 high, >=0.4 medium, >=0.2 low).

---

## Component 3: CodeIntelligenceCoordinator (`coordinator.ts`, ~2160 lines)

The orchestrator that wires everything together and adds v3-specific capabilities on top.

### Core integrations

- **QEGNNEmbeddingIndex (HNSW)** — 384-dim cosine similarity index for fast approximate nearest-neighbor search across code entities. Used for semantic code search.
- **PersistentSONAEngine** — Self-Optimizing Neural Architecture for pattern learning. Learns recurring code patterns across indexing runs.
- **MetricCollectorService** — Collects real code metrics (lines, complexity, language breakdown) using `cloc` or `tokei` CLI tools.
- **HypergraphEngine** — SQLite-backed intelligent code analysis providing:
  - `findUntestedFunctions()` — functions with no test coverage
  - `findImpactedTestsFromHypergraph()` — alternative to KG-based impact analysis
  - `findCoverageGapsFromHypergraph()` — coverage gap detection
  - `buildHypergraphFromIndex()` — builds the hypergraph from indexed code

### Architecture integrations

- **ADR-047 (MinCut)**: `MinCutAwareDomainMixin` — topology health awareness, checks domain connectivity health before operations.
- **MM-001 (Consensus)**: `ConsensusEnabledMixin` — multi-model verification for high-stakes analysis (code patterns, impact analysis, dependency mapping). Routes through consensus when confidence is low.
- **ADR-058 (Governance)**: `GovernanceAwareDomainMixin` — MemoryWriteGate integration, ensuring memory writes comply with governance policies.

### Workflow management

- Max 5 concurrent workflows with progress tracking and state persistence.
- Event-driven: publishes `KnowledgeGraphUpdated`, `ImpactAnalysisCompleted`, `SemanticSearchCompleted` domain events.

### C4 diagram generation

- Generates C4 architecture diagrams via `ProductFactorsBridgeService` from the indexed code structure.

---

## How It All Fits Together

```
Source Code Files
       │
       ▼
KnowledgeGraphService (AST parse → entities + edges + embeddings)
       │
       ├──→ ImpactAnalyzerService (BFS graph traversal → affected tests)
       │         └──→ Used by TestSchedulingPipeline for regression test selection
       │
       ├──→ Semantic Search (vector similarity via HNSW index)
       │
       ├──→ Dependency Mapping (incoming/outgoing edge queries)
       │
       └──→ Cypher/NL Queries (pattern matching against graph)

CodeIntelligenceCoordinator orchestrates all of the above,
adding SONA learning, Hypergraph analysis, metrics collection,
C4 diagrams, consensus verification, and governance gates.
```

The regression testing pipeline is the primary **consumer** of code-intelligence — it calls `analyzeImpact` to decide which tests to run. But the domain also serves standalone use cases: semantic code search, dependency visualization, coverage gap detection, and architecture diagram generation.

---

## What's Real vs Placeholder

| Component | Status |
|-----------|--------|
| KnowledgeGraphService — AST parsing, entity extraction, edge building | Fully implemented |
| Vector embeddings (NomicEmbedder) | Implemented (requires Nomic API) |
| Cypher query parser | Implemented (subset of Cypher) |
| ImpactAnalyzerService — BFS traversal, risk scoring | Fully implemented |
| HNSW index (GNN embeddings) | Implemented via QEGNNEmbeddingIndex |
| HypergraphEngine | Implemented (SQLite-backed) |
| SONA pattern learning | Implemented via PersistentSONAEngine |
| MetricCollector (cloc/tokei) | Implemented (requires CLI tools installed) |
| LLM-enhanced relationship extraction | Implemented (requires HybridRouter + LLM access) |
| C4 diagram generation | Implemented via bridge service |
| Consensus verification (MM-001) | Implemented but depends on multi-model routing availability |
