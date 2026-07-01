# ADR-116: Proof-Gate — tamper-evident integrity for the unified memory.db write path

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-116 |
| **Status** | Accepted (2026-06-30) — implemented (`HashChainGate` TS port + `UnifiedMemoryManager` kv wiring; 14 tests green, typecheck clean) |
| **Date** | 2026-06-30 |
| **Author** | AQE Core |
| **Review Cadence** | 3 months |
| **Supersedes** | — |
| **Related** | RuVector upstream **ADR-194** (`ruvector-proof-gate`, the algorithm this ports — cited in source comments), the unified-memory ADR (single store, no competing DB), ADR-043 vendor-independent LLM, ADR-113/114 (evals/conservation sibling guards) |

---

## WH(Y) Decision Statement

**In the context of** AQE's absolute data-protection mandate — "verify row counts BEFORE and AFTER, never claim a sync/migration succeeded without proof; the `.agentic-qe/memory.db` holds 1K+ irreplaceable learning records" — where today that mandate is enforced only by procedure (run a `SELECT COUNT(*)`, eyeball it) with nothing that proves a write was not silently mutated, reordered, or dropped between two count checks,

**facing** the choice of whether to gain a cryptographic integrity guarantee by **depending on RuVector's `ruvector-proof-gate` npm package** (the upstream that defines the hash-chain algorithm, ADR-194) or by **porting the algorithm into AQE** — against a verified track record that RuVector's npm publishing is unreliable (see Current State: the sibling `@ruvector/ruvllm` package ships a demo crate, not its engine, with no NAPI binding and version-skewed platform binaries),

**we decided for** a **dependency-free TypeScript port** — `HashChainGate` (`src/integrations/ruvector/proof-gate.ts`), using only Node's `crypto`, opening no database — wired into `UnifiedMemoryManager` as an **opt-in, fail-soft, no-re-entrancy** audit over the kv write path: every `kvSet`/`kvDelete` admits a content-bound receipt to a SHA-256 hash chain, and `verifyMemoryIntegrity()` re-derives the chain from genesis to prove no admitted write was tampered with,

**and neglected** taking a runtime dependency on any `@ruvector/*` npm package (demonstrably fragile — and the proof-gate crate ships no NAPI/WASM binding at all, so there is nothing to bind), a second/parallel audit store (the chain serializes into the same `memory.db` `kv_store` — the unified-store ADR forbids a competing DB), always-on auditing (the chain grows O(n) per audited write — it is for bounded windows), and byte-level interop with RuVector's Rust receipts (we self-verify only; our genesis differs deliberately),

**to achieve** turning the "never claim a sync succeeded without proof" rule from a manual procedure into a **tamper-evident cryptographic guarantee** that survives process restarts, while staying 100% vendor-independent on a path that touches production learning data,

**accepting that** the guarantee is self-referential (it proves *our recorded chain* is internally consistent, not that it matches an external notary), that enabling it adds an O(n) in-memory chain plus a per-write snapshot rewrite (hence bounded-window use), and that the TS port must be kept algorithmically faithful by its own tests rather than by shared code with the Rust crate.

---

## Current state (grounded, verified 2026-06-30)

| Fact | Evidence |
|---|---|
| Mandate was procedure-only | CLAUDE.md data-protection rules; no integrity primitive in `UnifiedMemoryManager` before this branch |
| Algorithm ported, not bound | `proof-gate.ts:5` — "the Rust crate ships no NAPI/WASM binding"; uses only `node:crypto` |
| **RuVector npm publishing is unreliable** (the "why not depend") | Verified against a fresh clone in a sibling session: `@ruvector/ruvllm@2.5.6` `build:native` targets `examples/ruvLLM` (a random-weight demo `SmallTransformer`), `crates/ruvllm` has **zero `#[napi]`** bindings, `optionalDependencies` pin platform binaries to **2.0.1** while the package is **2.5.6**, and even a from-source `ruvllm-cli` build's GGUF loader is **Llama/Mistral-arch-only** (rejects qwen2/qwen3/gemma/phi). A runtime dep on this ecosystem would be fragile or non-functional. |
| Wired into the live kv path | `unified-memory.ts` `kvSet`/`kvDelete` → `auditWrite()` (`:613`, `:640`) |
| Single store preserved | chain persists via a DIRECT `kv_store` write to reserved namespace `__proofgate__` (`persistProofChain`, `:743`) — no second DB |
| No re-entrancy | the reserved namespace is never itself audited (`:733`); persistence bypasses `kvSet` |
| Tests green | 7 `proof-gate.test.ts` + 7 `unified-memory-proof-gate.test.ts`; full branch suite 46/46, `tsc --noEmit` clean |

**The core problem in one line:** AQE could *count* rows before and after a write but could not *prove* the write in between was untampered — and the obvious off-the-shelf fix (RuVector's npm package) is exactly the kind of dependency that ships broken.

---

## Decision detail

### 1. The primitive (`HashChainGate`, pure, no DB)
`commitment[n] = SHA256("ruvector:chain:" ‖ commitment[n-1] ‖ payloadHash[n] ‖ u64le(n))`, seeded from a fixed genesis. `admit(payload)` is O(1) and returns a `WriteReceipt`; `verifyIntegrity()` replays from genesis (O(n)) and fails on any mutation, reorder, or length mismatch. Payloads are canonicalized (sorted-key JSON) so equal content hashes equally. Persist/restore via `toJSON`/`fromJSON` — the gate never opens a database.

### 2. The wiring (`UnifiedMemoryManager`, opt-in + fail-soft)
- **OFF by default.** `enableProofGate()` or `AQE_PROOF_GATE=1` (lazy env check) turns it on for a bounded audit window — a sync, migration, or publish gate — not permanent use.
- **Fail-soft.** `auditWrite()` runs *after* the row is committed and never throws into the caller — an audit failure can neither break nor alter the actual write.
- **No re-entrancy.** The chain snapshot persists via a direct `kv_store` write to the reserved `__proofgate__` namespace, which is itself never audited.
- **Survives restarts.** `loadProofChain()` restores the chain from `memory.db` on the next process, so an audit window can span runs.
- `verifyMemoryIntegrity()` / `getProofChainRoot()` / `getProofChainLength()` expose the verdict.

### 3. Relationship to upstream ADR-194
Source comments cite **ADR-194** — that is RuVector's *upstream* decision record for the original `ruvector-proof-gate`, kept as provenance for the algorithm. **This ADR-116 is the AQE-side integration decision** (port vs. depend, opt-in/fail-soft wiring, single-store persistence). The two are complementary; ADR-194 is not an AQE in-repo ADR.

---

## Consequences

- **Positive:** the data-protection mandate becomes tamper-evident, not just procedural; zero new runtime dependencies on a demonstrably-fragile ecosystem; no competing store (unified-memory ADR honored); fail-soft design keeps the production write path safe; survives restarts for multi-run audit windows.
- **Negative / watch:** self-verifying only (not an external notary); O(n) chain + per-write snapshot rewrite ⇒ bounded-window use, not always-on; the TS port's fidelity rests on its own tests, so upstream algorithm changes must be mirrored deliberately.
- **Follow-ups:** consider exposing the audit window via a CLI verb for the publish/migration runbooks; if always-on auditing is ever wanted, add chain compaction/checkpointing first.
