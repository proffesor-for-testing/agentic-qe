# ADR-097: External Embedder Endpoint (OpenAI-Compatible)

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-097 |
| **Status** | Proposed |
| **Date** | 2026-05-19 |
| **Author** | AQE Team |
| **Related Issues** | [#503](https://github.com/proffesor-for-testing/agentic-qe/issues/503) |
| **Review Cadence** | 6 months |

---

## WH(Y) Decision Statement

**In the context of** AQE's embedding layer (`src/learning/real-embeddings.ts`), which today hard-wires `@huggingface/transformers` + `Xenova/all-MiniLM-L6-v2` (384-d, mean-pooled, L2-normalized) into every process that needs vectors — including each `agentic-qe hooks …` invocation, which is a fresh OS process whose module-level singleton cannot be shared with sibling processes,

**facing** three converging pressures: (1) co-deployments with `ruflo` / `ruvector` load byte-identical model weights two or more times (~45–90 MB heap per copy), (2) hook invocations pay a cold model load on every fire because Node's module cache is per-process and there is no shared resident embedder to call into, and (3) AQE has no boundary at the embedder layer that mirrors ADR-043's vendor-independence boundary at the LLM layer — so users on Bedrock / Ollama / self-hosted inference stacks cannot reuse infrastructure they already operate,

**we decided for** adding an optional `EmbeddingConfig.endpoint?: string` (default `process.env.AQE_EMBEDDER_ENDPOINT`, default unset) that, when set, routes feature-extraction to an **OpenAI-compatible `POST /v1/embeddings`** endpoint over HTTP (with `http.Agent({ keepAlive: true })`) or HTTP-over-Unix-socket (`socketPath:` form of the same request). When set, AQE skips `await import('@huggingface/transformers')` entirely — the dynamic import lives strictly inside the in-process branch of `initializeModel()`. On init, AQE probes the endpoint with a canary string, asserts `dim === 384`, and fingerprints the canary embedding as the endpoint identity stored under `.agentic-qe/`. The endpoint path **hard-fails on error** (5s connect / 30s request timeout, no internal retry, circuit breaker tripping at 3 failures in 60 s); it does **not** silently fall back to the hash embedder. Embeddings are L2-renormalized on receive regardless of any server claim of normalization. Authentication is `Authorization: Bearer ${AQE_EMBEDDER_TOKEN}` (env-only — never in config files). When endpoint identity changes between runs the in-memory cache is invalidated and the change is logged; the HNSW index is **not** auto-rebuilt,

**and neglected**:
- **(a) Bespoke `{texts:[…]} → {embeddings:[[…]]}` protocol** (per issue #503). Rejected because the OpenAI `/v1/embeddings` shape is already spoken by TEI, vLLM, llama.cpp server, Ollama, LocalAI, and LM Studio — adopting it unlocks every existing embedder server in the ecosystem for one line of config, not just bespoke ruvector servers. The reporter's server can add the route in an afternoon.
- **(b) Newline-delimited JSON over Unix socket as a second wire format.** Rejected because two parsers means two error models and two failure surfaces; Node's `http.request({ socketPath })` makes HTTP-over-unix a transport detail, not a protocol fork.
- **(c) Fall back to the hash embedder when the endpoint errors** (per issue #503). Rejected because hash embeddings and MiniLM embeddings are not comparable; mixing them in the same HNSW index silently degrades recall **forever** without ever surfacing as an error. Hard-fail with a circuit breaker is the only correctness-preserving behavior at a vector-store boundary.
- **(d) Trust the server's claim that embeddings are normalized.** Rejected because re-normalizing a unit vector is a no-op (<1 µs) and decouples us from server config drift.
- **(e) Auto-rebuild the HNSW index when endpoint identity changes.** Rejected as destructive without explicit operator intent; we log and require explicit re-indexing.
- **(f) Make batch size endpoint-aware by auto-probing.** Rejected as premature; keep the current 32 and add `endpointBatchSize` only when a real workload demands it.
- **(g) yaml schema change for `embedding.endpoint`** (per issue #503). Rejected in favor of the existing `EmbeddingConfig` TypeScript surface plus env override — matches the rest of AQE's config style.
- **(h) Ship the AQE-as-server inverse direction in this ADR.** Deferred. Choosing the OpenAI-compatible client contract here keeps that option open for a thin server wrapper later without redesign.

**to achieve** (1) elimination of duplicate model loads in `ruflo`/`ruvector` co-deployments — one resident embedder, many warm clients; (2) elimination of per-hook cold-load cost — hook processes never import `@huggingface/transformers` when the endpoint is set; (3) embedder-layer vendor independence symmetric with ADR-043's LLM-layer independence; (4) drop-in compatibility with the entire existing embedder-server ecosystem (TEI, vLLM, llama.cpp, Ollama, LocalAI, LM Studio, OpenAI); (5) silent-corruption resistance via probe-based dim/identity assertion at the boundary the rest of the pattern store implicitly trusts; (6) zero behavior change for current users (endpoint unset = today's exact code path); (7) a forward path to AQE-as-embedder-server with no protocol redesign,

**accepting that** (a) the hard-fail-on-error stance means a flaky endpoint will surface as caller-visible errors rather than degraded-but-running behavior — this is intentional and is the only choice that protects the vector store, but callers in `src/learning/experience-capture-middleware.ts`, `src/learning/sqlite-persistence.ts`, `src/learning/embed-and-insert-pattern.ts`, `src/learning/real-qe-reasoning-bank.ts`, and `src/cli/commands/hooks-handlers/hooks-dream-learning.ts` need an audit pass to confirm they prefer "skip persistence" over "persist with poison" on error; (b) embedded text often contains source code and may contain PII — endpoints that cross a trust perimeter share the same concern as ADR-092's advisor calls. The operational definition of "third-party" for the security-agent rule is: **same-host Unix socket → trusted (filesystem perms are the boundary); same-host loopback (`127.0.0.1`, `::1`) → trusted (same operator); anything off-host → third-party regardless of operator; anything traversing a network proxy → third-party**. Security-sensitive embeddings originated by `qe-security-*` or `qe-pentest-*` agents MUST NOT use a third-party endpoint and should fall back to in-process or self-hosted only; (c) the 384-d dimension is asserted at the boundary but is still hard-coded throughout the pattern store — making dimension queryable end-to-end is a separate, larger piece of work and is explicitly out of scope; (d) the hash-embedding fallback for the **in-process** path is left in place by this ADR but is suspect for the same poisoning reason and should be revisited under a separate decision; (e) endpoint identity is a fingerprint of one canary embedding — two servers serving the "same" model from different quantizations will fingerprint differently and require an operator decision; (f) the `EmbeddingConfig.endpoint` field surfaces in the public type and constitutes a minor API addition (backward-compatible — optional field with a default-unset value).

---

## Context

`src/learning/real-embeddings.ts:113-122` is the single place AQE produces semantic vectors. It dynamically imports `@huggingface/transformers` and builds a `pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { quantized: true })` whose output is mean-pooled and L2-normalized to 384-d. Every consumer in the codebase — `sqlite-persistence.ts`, `experience-capture-middleware.ts`, `embed-and-insert-pattern.ts`, `real-qe-reasoning-bank.ts`, and `hooks-dream-learning.ts` — calls into this module. A module-level singleton (`real-embeddings.ts:40-43`) amortizes the load within a process but cannot help across processes.

Two real production pain points motivate this ADR. First, AQE is commonly deployed alongside `ruflo` / `ruvector`, which embed with the *identical* HuggingFace stack and the same Xenova model. Two processes hold byte-identical weights in resident memory because they cannot share the import. Second — and more severe — every `agentic-qe hooks …` invocation is a fresh OS process. `src/cli/commands/hooks-handlers/hooks-dream-learning.ts:271,607` dynamically imports `real-embeddings` from that fresh process, paying a full cold model load every time the hook fires. The singleton inside `real-embeddings.ts` is meaningless across process boundaries.

ADR-043 (vendor-independent LLM) and ADR-092 (provider-agnostic advisor) established the principle that AQE puts a network boundary at LLM calls so users can plug in their own infrastructure. The embedding layer has no such boundary; it is hard-wired to a single library and a single model. This ADR adds the symmetric boundary at the embedding layer. Issue #503 surfaces the request from a production user running the exact ruflo+ruvector+AQE topology described above, with a working reference implementation that uses a `NODE_OPTIONS=--require` shim to monkey-patch `Module._load` — a fragile workaround the user explicitly wants to retire.

### Co-deployment topology

The endpoint boundary makes three deployment shapes reachable. Choice of shape is operational, not architectural:

| Topology | Setup | Trade-off |
|----------|-------|-----------|
| **A. Dedicated embedder daemon (recommended)** | All three tools point at a TEI / llama.cpp / Ollama instance serving `Xenova/all-MiniLM-L6-v2` on `unix:/run/embedder.sock` | Best isolation, mature server code, easiest upgrade — one extra component to operate |
| **B. ruvector hosts `/v1/embeddings`** | ruvector exposes the endpoint; AQE + ruflo are clients | One fewer process, but AQE embedding availability now depends on ruvector uptime |
| **C. ruflo hosts** | Same as B with ruflo as host | Same trade-offs |

Three operational concerns apply to all three topologies and must be coordinated across tools (they are not bugs in this ADR — they are consequences of sharing an embedder):

1. **Persisted indexes are tied to embedder identity.** AQE's `.agentic-qe/patterns.rvf`, ruvector's HNSW, and any other 384-d index in the trio are built from a specific embedder. If the operator swaps the shared embedder for a different model or quantization, every persisted index across all three tools becomes silently stale. This ADR catches the change on the AQE side via fingerprint drift logging, but operationally all three tools must coordinate on the same model version and re-index together when it changes.
2. **Single point of failure.** Today the three tools fail independently; sharing an endpoint makes them fail together. Hard-fail semantics (the correctness choice below) make this loudly visible rather than silently degrading. TEI on a Unix socket is mature enough that this is an acceptable trade; deployments that cannot tolerate it should keep `endpoint` unset.
3. **All-or-nothing endpoint adoption.** If ruflo upgrades transformers locally and starts producing slightly different vectors while AQE still uses the endpoint, cross-tool consistency breaks. Convention has to be "if the endpoint is set, use it" across the trio.

---

## Options Considered

### Option 1: OpenAI-Compatible `/v1/embeddings` Endpoint with Hard-Fail Semantics (Selected)

Add `EmbeddingConfig.endpoint?: string` and `AQE_EMBEDDER_ENDPOINT` env. When set, route to `POST {endpoint}/v1/embeddings` with body `{ "model": "Xenova/all-MiniLM-L6-v2", "input": [...] }`, expect OpenAI response shape `{ "data": [{ "embedding": [...], "index": 0 }, ...] }`. Transport is HTTP or HTTP-over-Unix-socket via `socketPath`. Probe endpoint on init for dim + identity fingerprint. Hard-fail with circuit breaker on error; no hash fallback. Re-normalize on receive. Bearer auth via env. Dynamic transformers import lives strictly inside the in-process branch.

**Pros:**
- Interop with the entire existing embedder-server ecosystem (TEI, vLLM, llama.cpp, Ollama, LocalAI, LM Studio, OpenAI) — not just bespoke ruvector
- Symmetric with ADR-043's LLM-layer vendor-independence boundary
- Silent-corruption resistance via boundary-level dim + identity assertion
- Zero behavior change when endpoint unset (true opt-in)
- Cold-load fix falls out of the import-discipline rule
- Keeps AQE-as-server open as a trivial future addition
- ~150–250 LOC of focused change; no callsite churn beyond the audit

**Cons:**
- Hard-fail surfaces flaky endpoints as caller-visible errors (intentional, but requires a callsite-audit pass)
- One new optional field in the public `EmbeddingConfig` type
- Endpoint-fingerprint identity is one-canary-only; quantization differences appear as identity drift

### Option 2: Bespoke `{texts:[…]} → {embeddings:[[…]]}` Protocol (Rejected — was the issue's proposal)

Adopt issue #503's suggested wire format verbatim.

**Why rejected:** Locks AQE to bespoke servers. Cuts off interop with every existing embedder-server in the ecosystem. The OpenAI shape costs the reporter an afternoon and unlocks orders-of-magnitude more deployment topologies.

### Option 3: HTTP + Newline-Delimited JSON Over Unix Socket as a Second Wire Format (Rejected)

Two transports, two wire formats (HTTP on TCP, NDJSON on socket).

**Why rejected:** Two parsers = two error models = bug factory. `http.request({ socketPath })` makes HTTP-over-Unix a transport detail of one protocol.

### Option 4: Endpoint Errors Fall Back to Hash Embedder (Rejected — was the issue's proposal)

When endpoint errors, fall back to the existing hash-embedding code path.

**Why rejected:** Hash and MiniLM embeddings are not comparable. Mixing them in the same HNSW index silently degrades recall forever without ever surfacing as an error. This is the highest-leverage correctness call in the ADR and the reporter's proposal must be flipped here.

### Option 5: In-Process Pre-Loaded Embedder Daemon Started by AQE Itself (Rejected)

Have AQE start its own background embedder daemon when first invoked, share via local socket.

**Why rejected:** Reinvents what the OpenAI-compatible ecosystem already ships (TEI, llama.cpp, Ollama). Adds process lifecycle, supervision, and crash-recovery responsibilities AQE should not own. The right place to deliver "AQE provides an embedder" is a future thin wrapper over `real-embeddings.ts` exposing `/v1/embeddings` — and Option 1 keeps that path open.

### Option 6: yaml Config Schema Change (Rejected — was the issue's proposal)

Add an `embedding:` section to `config.yaml`.

**Why rejected:** AQE doesn't drive embedding config from yaml today. Adding it just for this field creates a parallel config surface. `EmbeddingConfig.endpoint?: string` + env override matches the existing pattern.

---

## Dependencies

| Relationship | ADR ID | Title | Notes |
|--------------|--------|-------|-------|
| Relates To | ADR-043 | Vendor-Independent LLM (HybridRouter) | Same pattern at a different layer (embeddings vs chat) |
| Relates To | ADR-092 | Provider-Agnostic Advisor Strategy | Shares the perimeter-crossing PII/secrets concern for non-Anthropic providers |
| Relates To | ADR-050 | RuVector as Primary Neural Backbone | Establishes ruvector as the ML backbone; this ADR formalizes the network boundary co-deployment depends on |
| Relates To | ADR-066 | RVF PatternStore Progressive HNSW | Storage side of the embedding system; this ADR is the computation side |
| Relates To | ADR-071 / ADR-090 | HNSW Implementation Unification / hnswlib-node Migration | Index assumes 384-d; boundary-level dim assertion protects them |

---

## References

| Ref ID | Title | Type | Location |
|--------|-------|------|----------|
| ISSUE-503 | Feature request: optional external embedder endpoint for feature-extraction | GitHub Issue | [#503](https://github.com/proffesor-for-testing/agentic-qe/issues/503) |
| SRC-EMB | `real-embeddings.ts` (in-process embedder, integration point) | Source | [src/learning/real-embeddings.ts](../../../src/learning/real-embeddings.ts) |
| SRC-HOOK | `hooks-dream-learning.ts` (cold-load callsite) | Source | [src/cli/commands/hooks-handlers/hooks-dream-learning.ts](../../../src/cli/commands/hooks-handlers/hooks-dream-learning.ts) |
| OPENAI-EMB | OpenAI Embeddings API reference (wire-format contract) | External Spec | https://platform.openai.com/docs/api-reference/embeddings |
| TEI | HuggingFace Text Embeddings Inference (reference server) | External Project | https://github.com/huggingface/text-embeddings-inference |

---

## Implementation Sketch

Two touch-points in `src/learning/real-embeddings.ts`, plus a new `embedder-endpoint-client.ts` and a callsite audit.

```ts
// EmbeddingConfig — one new optional field
endpoint?: string;     // defaults to process.env.AQE_EMBEDDER_ENDPOINT
endpointToken?: string; // defaults to process.env.AQE_EMBEDDER_TOKEN

// initializeModel() — branch BEFORE the dynamic transformers import
if (fullConfig.endpoint) {
  embeddingModel = await createEndpointPipeline(fullConfig);
  await probeAndFingerprint(embeddingModel, fullConfig.endpoint);
  return; // transformers package never imported in this process
}
const transformers = await import('@huggingface/transformers'); // unchanged
```

The endpoint pipeline satisfies the same `FeatureExtractionPipeline` interface (`real-embeddings.ts:32-37`) so `computeRealEmbedding` and `computeBatchEmbeddings` are unchanged. Hard-fail surfaces through the existing error path. The circuit breaker, identity fingerprint, and keep-alive `http.Agent` live in `embedder-endpoint-client.ts`.

### Out of scope (deferred)

- Making embedding dimension queryable end-to-end (currently hard-coded 384 throughout the pattern store)
- Revisiting the hash-embedding fallback for the in-process path
- AQE-as-embedder-server (thin `/v1/embeddings` wrapper over `real-embeddings.ts`)

---

## Governance

| Review Board | Date | Outcome | Next Review |
|--------------|------|---------|-------------|
| AQE Team | 2026-05-19 | Proposed | 2026-06-19 |

---

## Status History

| Status | Date | Notes |
|--------|------|-------|
| Proposed | 2026-05-19 | Initial creation in response to issue #503 |

---

## Definition of Done Checklist

### Core (ECADR)
- [x] **E - Evidence**: Reference implementation exists in reporter's deployment (issue #503); in-tree consumers and pain points verified by code reading
- [x] **C - Criteria**: 6 options compared systematically
- [ ] **A - Agreement**: Maintainer review pending; issue reporter to be looped in on protocol-shape and failure-semantics deltas from their proposal
- [x] **D - Documentation**: WH(Y) statement complete, ADR published
- [ ] **R - Review**: Owner to be assigned at maintainer review

### Extended
- [x] **Dp - Dependencies**: Related ADRs (043, 050, 066, 071/090, 092) documented
- [x] **Rf - References**: Issue, source files, and external wire-format spec linked
- [ ] **M - Master**: Not part of a Master ADR
