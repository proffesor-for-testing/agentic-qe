# 03 — Technical Capabilities: MetaHarness (`agent-harness-generator`) — Round 2

**Subject:** `ruvnet/agent-harness-generator` (MetaHarness)
**Snapshot:** HEAD `5f63ac6`, `v0.1.15-467-g5f63ac6`, branch `claude/darwin-mode-evolve-polyglot`
**Method:** Independent deep-read + live build/test reproduction. Repo: `/workspaces/agent-harness-generator` (all paths absolute).
**Evaluator:** AQE fleet (agentic-qe). **Date:** 2026-06-27.
**Prior report:** `/workspaces/agentic-qe/docs/metaharness/03-technical-capabilities.md` (working-may, 2026-06-15).

---

## Executive verdict (read first)

1. **The Rust kernel surface has NOT materially grown. It is byte-for-byte the prior story.** `crates/kernel-wasm/src/lib.rs` and `crates/kernel-napi/src/lib.rs` still each export exactly **3** JS functions: `kernelInfo`, `mcpValidate`, `version`. `witnessVerify` is **still not exported**. `crates/kernel/src/memory.rs` is **still a 34-LOC stub** (one `MemoryHit` struct + one serialization test). The kernel crate is identical in size to the prior round (2,259 LOC, same per-file line counts). The "7-subsystem Rust+WASM+NAPI kernel" remains ~1/7 reachable from JS (`mcpValidate`, mirrored in TS anyway). **HIGH-1 (witness no-op) is STILL OPEN.**

2. **But the live PRODUCT surface has grown substantially — entirely in TypeScript, above the kernel.** Three real new TS subsystems ship and are wired in: **Darwin Mode** (`@metaharness/darwin`, ~10.2k src LOC, 62 test files, real evolutionary loop with a real sandboxed executor) is now **deep-integrated into every scaffolded harness by default** (ADR-147); **`@metaharness/router`** is a real dependency-free cost-optimal model router; **`@metaharness/harness`** is a new control-plane (intent→strategy DAG); and `packages/kernel-js` gained TS `./memory` / `./dispatch` subpath exports wrapping `@ruvector/emergent-time`. The capability story is now "a strong TypeScript product with a frozen, mostly-internal Rust kernel," not "a Rust kernel product."

3. **Fresh build is currently RED in this environment.** `npm run build` **fails at phase 1 on `@metaharness/router`**: `src/native.ts(54,31): error TS2307: Cannot find module '@ruvector/tiny-dancer'`. The dep is a `peerDependency` (`^0.1.21`), used optionally at runtime (try/catch → null) but **`tsc` hard-requires its types**. It is in the lockfile (29 refs) and CI installs it, so this is most likely a local-install gap (matches the known "host-shared node_modules / dropped @ruvector optional deps" issue), **not provably a fresh-clone defect** — but because `pretest: npm run build` now exists, **a failing build means `npm test` aborts too** in any environment missing that peer. P0 #2's fix is real but is now gated behind a brittle build.

---

## A) Rust kernel — Status vs prior (UNCHANGED)

### What is exposed to JS — re-verified verbatim

`crates/kernel-wasm/src/lib.rs` (29 LOC) — exactly 3 `#[wasm_bindgen]` exports:

```rust
#[wasm_bindgen(js_name = kernelInfo)] pub fn kernel_info() -> Result<JsValue, JsValue>
#[wasm_bindgen(js_name = mcpValidate)] pub fn mcp_validate(spec_json: &str) -> Result<JsValue, JsValue>
#[wasm_bindgen(js_name = version)] pub fn version() -> String
```

`crates/kernel-napi/src/lib.rs` (25 LOC) — the same 3 via `#[napi]` (`kernelInfo`, `mcpValidate`, `version`). **No `witnessVerify`, no `memory*`, no `claims*`, no `hooks*`, no `routing*`.**

`packages/kernel-js/src/index.ts` `KernelBackend` interface is unchanged — three methods only:

```ts
interface KernelBackend {
  kernelInfo(): KernelInfo;
  mcpValidate(specJson: string): string | null;
  version(): string;
  backend: 'native' | 'wasm' | 'js';
}
```

The pure-TS `loadJs()` floor still reimplements `mcpValidate` byte-for-byte against `crates/kernel/src/mcp.rs`, and `loadKernel()` still resolves `native > wasm > js` with the JS floor as the guaranteed fallback. In this checkout no `pkg/`/`native/` artifact is built, so **the JS floor is what answers** — exactly as last round. (One genuine, modest improvement: GH #20/#22 added `kernelDiagnostics()` and `METAHARNESS_KERNEL_BACKEND=native|wasm|js` with **fail-loud** behavior when a requested higher tier is unavailable — honest capability reporting, `index.ts:217-260`.)

### `memory.rs` — STILL A STUB

`crates/kernel/src/memory.rs` is 34 LOC; doc comment literally says `(stub)`; contents are one `MemoryHit` struct + one `hit_serializes` test. No store, no search, no HNSW, no decay. The "AgentDB + HNSW + ReasoningBank bridge" in `lib.rs:7` maps to nothing executable in Rust.

### `witness.rs` — real Rust crypto, still unreachable from npm

`crates/kernel/src/witness.rs` (272 LOC, unchanged) still has the correct Ed25519 path: `canonical_payload()` (`:62`), `sign_manifest()` (`:87`), `verify_manifest()` (`:110`), property-tested for sign→verify, order-invariance, tamper-detection, malformed-key/wrong-schema. **But `verify_manifest` is exported through neither WASM nor NAPI.** The product calls `packages/create-agent-harness/src/witness-client.ts`, which probes `kernel.witnessVerify` — a function that does not exist on the backend — and therefore falls through to:

```ts
// witness-client.ts:86
return { valid: true, reason: 'shape verified; kernel not loaded (degraded)' };
```

`publish.ts:127-129` only throws when `result.valid === false`; in degraded mode it is always `true`, so the publish gate **fails open**. `publish.ts:106` still carries `TODO: wire into kernel.witnessVerify`. **HIGH-1 is STILL OPEN, identical to prior.**

### Rust test count grew (but not in the kernel)

Total Rust `#[test]` across `crates/*/src` is now **117** (was 86). The increase is in the new `poker-darwin` crate, not the kernel — every `crates/kernel/src/*.rs` file is identical in line count to the prior table. **`cargo` is not installed in this container** (`cargo: command not found`), so Rust tests were inventoried, not executed (genuine environment limit; CI `rust` job covers 3 OSes).

---

## B) NEW shipping surface — TypeScript (the real growth)

### Darwin Mode (`packages/darwin-mode`, `@metaharness/darwin@0.7.1`) — LIVE

This is the substantive new capability and it is **real, not roadmap**: ~10.2k src LOC across 57 files, **62 test files**, its own `bin: metaharness-darwin`. The evolve loop (`src/evolve.ts`, ADR-070) is genuine:

- **Real sandboxed executor** (`src/sandbox.ts`): the safety gate (`inspectVariant`) runs **first** (disqualified → reserved exit 99, no command run); commands run via `execFile` (**no shell** → no injection surface) with a **scrubbed env** (PATH + 3 identifying vars only). `runVariantTask` never throws. There is also a fully-offline `mock-sandbox.ts` and an agent-based `tier2-sandbox.ts`.
- **Real mutators**: `openrouter-mutator.ts`, `requesty-mutator.ts`, `ruvllm-mutator.ts` (LLM-backed) **and** a `DeterministicMutator` (no network, no API key).
- **Real selection machinery**: MAP-Elites/behavioral niching (`phenotype.ts`), Pareto front (`pareto.ts`), clade Thompson sampling (`clade.ts`), linkage/epistasis crossover (`epistasis.ts`), curriculum (`curriculum.ts`), statistical admission with Benjamini-Hochberg (`bench/stats.ts`, `bench/risk.ts`). A whole `security/` evolution sub-arc (real-loop, oracles for codeql/semgrep/fuzz, swarm) adds ~24 files.
- **Deep-integrated into the generator (ADR-147, `create-agent-harness/src/index.ts:424-437`).** Default ON (`--no-darwin` to skip): every scaffolded harness gets the `@metaharness/darwin` devDependency, `npm run evolve` (`metaharness-darwin evolve . --sandbox real --generations 3 --children 4`) and `npm run evolve:dry`, plus a real `evolve` skill. Secure-by-default: the wired default uses the **deterministic** mutator (no network).

**Caveat — version drift (NEW finding).** `create-agent-harness/src/index.ts:234` pins `const DARWIN_VERSION = '^0.2.2'` for the scaffolded dependency, and `package.json` declares `"@metaharness/darwin": "^0.2.2"` — but the in-repo package is **0.7.1**. `^0.2.2` cannot resolve to `0.7.x`, so generated harnesses (and the main package's own dep) pull a **stale 0.2.x Darwin** from npm, not the current engine. The integration is real but the pinned version is ~5 minors behind.

### `@metaharness/router@0.3.2` — LIVE primitive (but breaks this build)

`packages/router/src/index.ts` is a real, dependency-free k-NN cost-optimal model router: given candidates with `costPerMTok` + labelled `(embedding → quality)` examples, `route(queryEmbedding)` returns the **cheapest candidate predicted to clear the quality bar** (the productized DRACO Phase-2 / ADR-040 finding that routing — not structure — is the measured Pareto win). Consumed by `packages/harness` and `packages/bench`. `native.ts` optionally accelerates via `@ruvector/tiny-dancer` (FastGRNN) with graceful runtime degradation — but as noted, its absence currently **fails `tsc`** (§E).

### `@metaharness/harness@0.1.0` — NEW control-plane

`packages/harness` (11 files, ~1.2k LOC) is a new runtime orchestration layer: `src/router.ts` (ADR-047) is an **intent classifier + strategy DAG** (softmax over keyword features → ordered step DAGs like `plan→scan-repo→code→test→review`). Explicitly distinct from `@metaharness/router` (control-plane "which steps" vs data-plane "which model"); they compose.

### `packages/kernel-js` TS subsystems — NEW, shipped as subpath exports, honestly hedged

`package.json` now exposes `./memory`, `./memory-rvf`, `./dispatch` subpath exports (plus internal `self-evolution.ts`, `trajectory.ts`). These implement the memory/dispatch/self-evolving-routing surface **in TypeScript** over `@ruvector/emergent-time` (AgenticClock decay-weighting, etc.) — i.e. the "memory bridge" the Rust `memory.rs` stub never implemented now exists, but in TS. To the project's credit, the code candidly quotes the upstream README — *"diagnostic signal, no proven early-warning lead over a fair baseline"* — and **gates the decay path behind a flag while always preserving the raw cosine score** (`memory.ts:18-21`, `self-evolution.ts:13-15`). Note these are **not re-exported from the kernel index**, so they are opt-in subpaths, not the default load-bearing path.

### `@metaharness/sdk@0.1.0` — present, ORPHAN

`packages/sdk` (1 file, 147 LOC) provides typed `define*()` helpers (`defineHarness`, `defineAgent`, …). Useful, but **no in-repo consumer** depends on `@metaharness/sdk` — roadmap-leaning convenience layer, not yet load-bearing.

---

## C) Generator engine — still the real, strong core

The TS generator remains the legitimately strong product, unchanged in character: `renderer.ts` identifier-restricted `{{var}}` interpolation (injection-safe in the code-exec sense), `writer.ts` atomic stage-then-`rename()`, `analyze-repo.ts`/`genome.ts` explicit no-exec contract, and `mcp-scan.ts` ("npm audit for agent tools") flagging real default-deny/allowShell/wildcard-perm risks with exit-1 on HIGH. The CLI dispatches **23** verbs from `subcommands.ts` (`analyze-repo, audit, compare, completions, diag, doctor, export-config, federate, genome, help, mcp, mcp-scan, oia-manifest, plugin-init, publish, sbom, score, secrets, sign, threat-model, upgrade, validate, verify`) — essentially the same surface as prior (21 + plugin-init + help). No regressions observed in this layer.

---

## D) Supply chain — unchanged from prior

No change to the assessment: the machinery is real and complete for v0.1 (Ed25519 witness in Rust, SPDX SBOM, cargo-audit/cargo-deny/npm-audit/CodeQL, npm `--provenance`), but the **shipping witness path is TS-only and degrades silently to `valid:true`** (§A), and one gate (`cargo-deny`) is a deliberate soft-gate. Real, not yet fully load-bearing. (Secrets-redaction HIGH-2 is in the security pillar's scope — not re-verified here.)

---

## E) LIVE build/test reproduction

**Toolchain:** `node v24.15.0`. `cargo: command not found` — Rust tests inventoried (117 `#[test]`), not executed.

**`npm run build` → FAILS (exit, ~2.0s, phase 1).**

```
[build-ordered] phase 1 failed: router
# packages/router: src/native.ts(54,31): error TS2307:
#   Cannot find module '@ruvector/tiny-dancer' or its corresponding type declarations.
```

Root cause: `@ruvector/tiny-dancer` is a `peerDependency` (`^0.1.21`) consumed optionally at runtime (`native.ts:48-63`, try/catch → `null`) but **`tsc` requires its type declarations**. It is **present in `package-lock.json` (29 refs) and referenced by `.github/workflows/ci.yml`**, yet **absent from this container's `node_modules/@ruvector/`** (only `emergent-time`, `ruvllm`, `ruvllm-linux-arm64-gnu` are installed). This strongly matches the known "host-shared node_modules / dependabot-dropped @ruvector optional deps" environment issue, so I am **not** asserting a fresh-clone defect — but I am flagging the **fragility**: a `tsc`-hard peer dep means `npm run build` (and therefore `npm test`, via `pretest`) hard-fails in any environment where that optional peer is missing. I did not `npm install` it (would pull native binaries; per project guidance, CI is source of truth and local native rebuilds are unreliable here).

**Per-package test reproduction (run directly, bypassing the broken root build):**

| Package | Result | Files |
|---|---|---|
| `create-agent-harness` | **306 passed** | 29 |
| `darwin-mode` | **549 passed, 14 skipped (563)** | 62 |

Both green. (Prior round: create-agent-harness was 257; it has grown.)

**On the "568/568 across 67 files" badge:** now badly stale on the **low** side. `README.md:13` and `:263` still claim 568/67, but **`darwin-mode` alone is 563 tests across 62 files**, `create-agent-harness` is 306/29, and the repo has **162 `*.test.ts` files** (excl. node_modules/dist) plus 117 Rust `#[test]`. The true suite is several times the advertised number. The badge was overstated-vs-reproducible last round; it is now **understated and frozen** — still not trustworthy as written.

---

## Status vs prior round

| Prior finding | Status | Evidence |
|---|---|---|
| HIGH-1 — witness verify is a guaranteed no-op (kernel exposes no `witnessVerify`; TS falls open to `{valid:true}`) | **Still open** | `kernel-wasm/src/lib.rs` (3 exports, no witness), `witness-client.ts:86`, `publish.ts:106` TODO + `:127-129` only throws on false |
| `memory.rs` is a 34-LOC stub (no store/search/HNSW) | **Still open** | `crates/kernel/src/memory.rs` (34 LOC, `(stub)` doc comment) — but a **TS** memory bridge now exists at `kernel-js` `./memory` (new, hedged) |
| Kernel JS-reachable surface = 3 functions (`mcpValidate` only one truly live, mirrored in TS) | **Still open / unchanged** | `kernel-wasm` + `kernel-napi` lib.rs; `KernelBackend` interface in `kernel-js/src/index.ts` |
| Kernel "7 subsystems" oversells the live runtime | **Still open / unchanged** | kernel crate byte-identical (2,259 LOC, same per-file counts); ~1/7 bridged |
| P0 #2 — fresh-clone `npm test` had no pretest build | **Fixed (but newly fragile)** | `package.json` `pretest: npm run build` present — yet `build` now RED on missing `@ruvector/tiny-dancer` peer (`packages/router/src/native.ts:54`) |
| Tests badge "568/568 across 67 files" not reproducible | **Still inaccurate (now understated)** | `README.md:13,263` = 568/67; reality: darwin-mode 563/62, create-agent-harness 306/29, 162 test files on disk, 117 Rust `#[test]` |
| Darwin self-evolving loop (prior: roadmap/ADR-only) | **New — LIVE** | `packages/darwin-mode` real `evolve.ts`+`sandbox.ts`; deep-integrated by default (`create-agent-harness/src/index.ts:424-437`) |
| `@metaharness/router`, `harness`, kernel-js `./memory`/`./dispatch` | **New — LIVE (TS)** | `router/src/index.ts`, `harness/src/router.ts`, `kernel-js` subpath exports |
| `@metaharness/sdk` | **New — present, orphan** | `packages/sdk` (147 LOC), no in-repo consumer |
| Darwin scaffold version pin | **New — drift** | `index.ts:234` `DARWIN_VERSION='^0.2.2'` vs in-repo darwin `0.7.1` |

---

## Bottom line

**The live runtime is still TS-floor + MCP-validation *at the kernel layer* — the Rust kernel surface has not grown at all** (3 JS exports each in WASM/NAPI, `memory.rs` still a 34-LOC stub, `witnessVerify` still unexported, witness still fails open). **What materially grew is the TypeScript product *above* the kernel:** a genuinely real, default-on Darwin Mode evolutionary loop with a hardened sandbox, a cost-optimal model router, a control-plane harness, and TS memory/dispatch bridges — all shipping and tested (darwin-mode 563 tests / create-agent-harness 306, both green). The honest summary is that MetaHarness is now a strong *TypeScript* engine wrapped around a frozen, mostly-internal Rust kernel — and its biggest current liability is that the build is RED on a `tsc`-hard optional peer (`@ruvector/tiny-dancer`), which (via the new `pretest`) takes `npm test` down with it.
