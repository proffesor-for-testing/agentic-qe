# 03 — Technical Capabilities: MetaHarness (`agent-harness-generator`)

**Subject:** `ruvnet/agent-harness-generator` (MetaHarness) · v0.1.x
**Method:** Independent verification + live build/test reproduction. Repo: `/workspaces/agent-harness-generator`.
**Evaluator:** AQE fleet (agentic-qe). **Date:** 2026-06-15. No repo code executed during static analysis; build/test reproduction run live and reported verbatim.

---

## Executive verdict (read first)

1. **The "7-subsystem Rust+WASM+NAPI kernel" is ~95% Rust-internal and not reachable from the shipping npm product.** The WASM and NAPI bindings each export exactly **3 functions** (`kernelInfo`, `mcpValidate`, `version`). The six other subsystems (hooks, routing, intel, claims, witness, memory + dispatch/federation/cost) are **not bridged to JS at all**. Worse, the JS product doesn't even need the kernel binary: `packages/kernel-js` ships a **pure-TS "JS floor" backend** that reimplements the only exposed surface, and in practice that floor is what answers (no wasm/napi artifact is committed or built). The witness signing and SBOM that the README attributes to "the kernel" are actually implemented in **TypeScript**, not called through Rust.
2. **The supply-chain/provenance story is real in design and largely wired, but not "ship-grade-proven" for a v0.1** — the witness signer that actually runs in the product is the TS client, the Rust Ed25519 path is unreachable from npm, and one of the security gates (`cargo-deny`) is an intentional soft-gate.
3. **`npm test` does NOT work on a fresh clone** — it fails on workspace dependency resolution (`@metaharness/kernel`, `@metaharness/vertical-base` have no `dist/`). It works **only after `npm run build`**. The "568-test fresh-clone" claim is false as stated; the suite needs a pretest build that the `test` script does not run. This is a genuine project gap, not a container artifact.

---

## A) Architecture & subsystems

### LOC and tests, per Rust source (`crates/kernel/src/`)

| File | LOC | Role | `#[test]` count |
|---|---|---|---|
| `lib.rs` | 101 | Error enum, `KernelInfo`, module wiring | 2 |
| `mcp.rs` | 231 | MCP server spec validation (name + command-XOR-url) | 10 |
| `hooks.rs` | 264 | Lifecycle event router (5 handler types) | 10 |
| `routing.rs` | 254 | 3-tier model routing decision | 9 |
| `intel.rs` | 222 | RETRIEVE→JUDGE→DISTILL→CONSOLIDATE pipeline types | 8 |
| `claims.rs` | 224 | Claims-based authorization | 10 |
| `witness.rs` | 272 | Ed25519 sign/verify + canonicaliser | 9 |
| `federation.rs` | 271 | Cross-install federation | 11 |
| `dispatch.rs` | 239 | Dispatch logic | 6 |
| `cost.rs` | 147 | Cost accounting | 6 |
| **`memory.rs`** | **34** | **STUB** — one `MemoryHit` struct + 1 serialization test | 1 |
| **kernel total** | **2,259** | | **82** |
| `kernel-wasm/src/lib.rs` | 29 | WASM bindings | 0 |
| `kernel-napi/src/lib.rs` | 25 | NAPI bindings | 0 |
| `template-catalog/src/lib.rs` | 180 | Template catalog | 5 |

Total Rust `#[test]` across all crates: **86**.

### What is actually exposed to JS — the load-bearing finding

`crates/kernel-wasm/src/lib.rs` (29 LOC) exports **3** functions via `#[wasm_bindgen]`: `kernelInfo`, `mcpValidate`, `version`. `crates/kernel-napi/src/lib.rs` (25 LOC) exports the **same 3** via `#[napi]`. That is the entire JS-reachable surface of the kernel.

The subsystems the README headlines — **hooks, routing, intel, claims, witness, federation, dispatch, cost, memory** — have **zero binding functions**. They are reachable only from other Rust code or Rust unit tests. From the shipping `@metaharness/*` npm packages, none of them can be called.

- **`memory.rs` is a 34-LOC stub.** Its own doc comment says `(stub)`. It contains a single `MemoryHit` struct and one test that asserts JSON serialization. There is no store, no search, no HNSW, no decay implementation — despite `lib.rs` describing it as "AgentDB + HNSW + ReasoningBank bridge." The "HNSW vector search / ReasoningBank / agent memory" keywords in the README map to **nothing executable**.
- **The kernel binary isn't even on the critical path.** `packages/kernel-js/src/index.ts` implements `native > wasm > pure-JS` fallback, and the **pure-JS floor** (`loadJs()`) reimplements `kernelInfo`/`version`/`mcpValidate` in TypeScript "so a harness installed from npm works with no compiled artifacts." In this checkout there is **no `pkg/`, no `native/`, no `dist/`** under `kernel-js` until you build — so the JS floor is what runs. The kernel's 6 real subsystems (claims/hooks/routing/intel/federation/cost, ~1,400 LOC of tested Rust) are **dark code** relative to the product.

**Conclusion (live vs roadmap):** Only `mcp::validate` is genuinely live end-to-end (and it is mirrored in TS anyway). The remaining ~95% of the "7-subsystem kernel" is Rust-internal, well-tested-in-isolation roadmap code. The "Rust + WASM + NAPI kernel" narrative materially oversells the live runtime surface.

---

## B) Generator engine (`packages/create-agent-harness`, ~37 source files)

The real product is the TS generator, not the kernel.

- **`renderer.ts` (82 LOC):** Mustache-style `{{var}}` interpolation via a single regex `\{\{\s*([a-zA-Z_]\w*)\s*\}\}`. Identifier-restricted (no dotted paths, no arbitrary expressions), so it is **injection-safe in the code-execution sense** — there is no eval/template-language to escape into. Honestly documented caveat: **no HTML/JSON auto-escaping** — templates needing JSON-safe output must pre-escape vars. Unresolved vars are left in place and surfaced for lint.
- **`writer.ts` (57 LOC):** Genuinely atomic — stages all files into an OS-tempdir, then `rename()`s into place; mid-stream failure leaves target untouched; refuses to overwrite without `--force`.
- **`analyze-repo.ts` (19KB) + `genome.ts` (10KB):** Both carry an explicit, verifiable **no-exec contract** — "No repository code is ever executed; only static inspection." Suggested commands are emitted with `trust: 'inferred', execution: 'disabled'` and a "never run" banner. `grep` confirms **no `Math.random`/`Date.now`** in `genome.ts`/`genome-scorers.ts`/`score.ts`, so genome scoring is deterministic. (Caveat: `analyze-repo.ts` *optionally* `require()`s `@ruvector/ruvllm` for an LLM-assisted path — an optional, non-default network/model dependency.)
- **`mcp-scan.ts` (165 LOC) — "npm audit for agent tools":** Pure static inspection of `.harness/mcp-policy.json`, `.claude/settings.json`, `package.json`. Flags real, specific risks: not-default-deny (HIGH), `allowShell` (HIGH), wildcard tool perms `mcp__*` (HIGH), `allowNetwork`/`allowFileWrite`/missing-approval-gate/missing-audit-log/missing-timeout (MED), risky `Bash(rm|curl|wget|sudo|ssh)` allow-rules (MED), missing `.env` deny-guard (MED), unpinned deps (LOW). Exit 1 on any HIGH. This is a substantive, well-targeted check, not theater.
- **21 `harness` subcommands** dispatched from `subcommands.ts`: `verify, doctor, sign, federate, secrets, validate, mcp, publish, upgrade, completions, sbom, audit, mcp-scan, analyze-repo, diag, export-config, compare, genome, score, threat-model, oia-manifest` (+ `plugin-init`, `help`). The surface is broad and each maps to a real TS module.

**Assessment:** The generator engine is the legitimately strong, real part of this product — deterministic, no-exec, atomic-write, injection-safe interpolation, and a genuinely useful MCP security scanner.

---

## C) Provenance & supply chain

- **`witness.rs` (272 LOC, 9 tests):** A correct, real Ed25519 implementation using `ed25519-dalek` + `sha2`. `canonical_payload()` sorts entries by `id` and serializes a fixed-field struct for byte-determinism; tests prove sign→verify, order-invariance of the signature, and tamper-detection on both entry-mutation and version-mutation, plus malformed-key/wrong-schema error paths. The cryptography and the **byte-determinism claim are genuinely demonstrated** — in Rust.
- **The catch:** witness signing is **not exposed via WASM/NAPI** (only `mcpValidate` is). The product's witnessing runs through `witness-client.ts` (TS), which **falls through to a degraded `{valid:true, reason:'...kernel not loaded (degraded)'}`** when the kernel binary is absent (`witness-client.ts:74`), and `publish.ts:106` carries a literal `TODO: wire into kernel.witnessVerify`. So the audited Rust signer is **not the code path users exercise** via npm. The two implementations must be kept in lockstep manually; only the Rust side is property-tested.
- **`security.yml`:** Real jobs for `cargo-audit` (`--deny warnings`), `cargo-deny` (**intentional soft-gate** — won't fail the build on a cargo-deny parse/outage), `npm audit --omit=dev --audit-level=high`, an aggregate `audit-deps.mjs`, and **SPDX-2.3 SBOM** via `scripts/sbom.mjs`. **CodeQL is present.** So the README's "cargo-audit · cargo-deny · npm-audit · CodeQL · SBOM" pipeline genuinely exists.
- **SLSA L2 / `--provenance`:** Lives in `publish.yml` (GCP WIF → Secret Manager → smoke → `npm publish --provenance`). Wired, not independently verifiable here without publishing.

**Assessment:** The supply-chain *machinery* is real and unusually complete for a v0.1 (SBOM + 4 scanners + provenance + signed witness). But "ship-grade" overstates it: the witness path that actually ships is TS-only (and degrades silently to "valid"), and one gate is deliberately non-blocking. Real and ambitious, not yet fully load-bearing.

---

## D) DRACO benchmark (`packages/bench/draco`)

Machinery: a versioned `corpus.json` + `schema.json` + `horizon.json`, a committed `runs/` directory of result JSON, and TS scorers in `packages/bench/src/draco/` (`runner.ts`, `scorer.ts`, `fusion.ts`, `judge.ts`, `ablation.ts`, `augment.ts`, `self-consistency.ts`, `optimized.ts`). It scores 5 dimensions (grounding, coverage, balance, faithfulness, efficiency); dimensions 2/3/5 are deterministic-offline (`--no-judge`), 1/4 need network/LLM.

**Confirmation (not a win):** ADR-038 (**Status: Accepted**) records that at frontier tier the harness **loses to vanilla**: vanilla **0.7143** > fusion+harness **0.6472** > harness **0.6126**. The ADR's own final conclusion calls this "airtight and **mechanistic**": the 6-stage transform harness *degrades* grounding (−0.10), best-of-N selection only ties within noise (+0.001), and union dilutes. The fusion arm's one measured positive — independent verify recovers ~+0.035 over the single-model harness — **still does not clear vanilla**. The offline tests prove a *constructed mechanism* exists (and is reproducible behind flags), **not an aggregate quality win**. The honest shippable finding is the benchmark *falsifying* the harness-beats-vanilla thesis. (See `01-quality-analysis.md` for why the README's contradicting claim is the #1 item to send back.)

---

## E) LIVE build/test reproduction

**Toolchain:** `node v24.15.0`. **`cargo: command not found`** — no Rust toolchain in this container, so `cargo test --workspace` **cannot be run here** (genuine environment limitation; Rust tests are exercised only by the CI `rust` job across 3 OSes). The 86 Rust `#[test]` cases were inventoried by source, not executed.

**`npm test` on the as-cloned tree → FAILS.** Representative error:

```
Error: Failed to resolve entry for package "@metaharness/kernel".
The package may have incorrect main/module/exports specified in its package.json.
  File: packages/create-agent-harness/src/subcommands.ts
...
Error: Failed to resolve entry for package "@metaharness/vertical-base".
  File: packages/vertical-trading/__tests__/pack.test.ts
```

Failing suites pre-build: `create-agent-harness` (4 files), `bench` (1), `vertical-trading` (1). **Diagnosis:** `@metaharness/kernel`'s `package.json` declares `main: ./dist/index.js`, but `packages/kernel-js/dist/` does not exist in a fresh clone. Same for `vertical-base`. This is a **workspace build-ordering gap** — the root `test` script (`npm run -ws --if-present test`) has **no `pretest` that runs the build**. It is **NOT** a wasm/napi or container/native-binary issue: the failure is plain TS `dist/` resolution, the kernel-js JS-floor backend needs no compiled artifact, and `build-ordered.mjs` invokes only `tsc` (no `cargo`/`wasm-pack`).

**`npm run build` → SUCCESS** (exit 0, ~5.8s, pure `tsc`, 4 ordered phases).

**`npm test` after build → ALL PASS, 0 failures.** Live totals from this machine: **530 JS tests across 50 vitest files** (e.g. `create-agent-harness` 257, `bench` 97, `kernel-js` 39, `host-rvm` 26, `sdk`/`host-openclaw` 18 each, etc.).

**On the "568/568 across 67 files" badge:** not reproduced as stated. Live JS = 530 tests / 50 vitest files; on disk there are 94 `*.test.ts` files but several are co-located Rust-mirror or non-collected. 530 JS + 86 Rust = 616, also not 568. The badge appears to count a different (likely older or combined-but-stale) snapshot. The headline number is **directionally true but not exactly reproducible** today, and crucially is **gated behind a build step the test script doesn't perform**.

---

## Bottom line

- **(1) Rust kernel live vs roadmap:** ~1 of 7 subsystems is JS-reachable (`mcpValidate`, and it's mirrored in TS); `memory.rs` is a 34-LOC stub; the other ~1,400 LOC of tested Rust (claims/hooks/routing/intel/witness/federation/cost) is internal/unreachable from npm. The "Rust+WASM+NAPI kernel" is mostly roadmap. The **real, strong product is the TypeScript generator** (deterministic, no-exec, atomic, injection-safe, with a substantive MCP scanner).
- **(2) Supply chain:** machinery is real and impressively complete for v0.1 (Ed25519 witness, SPDX-2.3 SBOM, cargo-audit/cargo-deny/npm-audit/CodeQL, npm `--provenance`), but the *shipping* witness path is TS-only (and degrades silently to "valid") and the Rust-proven signer is unreachable; one gate is a deliberate soft-gate. Real, not yet fully load-bearing.
- **(3) Fresh-clone `npm test`:** does **not** work — fails on `dist/` resolution; requires `npm run build` first (a missing `pretest`/build step, a genuine project gap). After build it is green with 530 JS tests. `cargo` isn't installed here, so Rust tests were inventoried (86 `#[test]`), not executed.

**Key files:** `crates/kernel-wasm/src/lib.rs`, `crates/kernel-napi/src/lib.rs`, `crates/kernel/src/memory.rs`, `crates/kernel/src/witness.rs`, `packages/kernel-js/src/index.ts`, `packages/create-agent-harness/src/{renderer,writer,mcp-scan,analyze-repo,genome}.ts`, `scripts/build-ordered.mjs`, `.github/workflows/security.yml`, `docs/adrs/ADR-038-draco-beyond-sota-ruflo-components.md`, `packages/bench/draco/README.md`.
