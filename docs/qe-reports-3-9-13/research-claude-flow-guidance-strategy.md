# Research Memo: `@claude-flow/guidance` Strategy

**Context:** QE audit v3.8.13 / v3.9.13 flagged `@claude-flow/guidance@3.0.0-alpha.1` as unwanted prod dep.
**Scope:** Keep / Drop / Upgrade / Reimplement / Fork decision.
**Author:** Researcher (pure investigation, no code edits).

## 1. Usage Mapping

`@claude-flow/guidance` module specifier appears **62 times across 17 files** in `src/` (`src/coordination/queen-coordinator.ts:61`, `src/governance/*` 14 files, `src/init/governance-installer.ts`, `src/init/phases/13-governance.ts`, `src/learning/real-qe-reasoning-bank.ts:66`, `src/coordination/mixins/governance-aware-domain.ts`).

All **16 direct usages** are `type`-only imports (compile-time) plus **dynamic `await import(modulePath)`** inside `try/catch` with JS fallback. Example pattern (`src/governance/continue-gate-integration.ts:21-23,75-91`):

| File:Line | Symbol | What it does |
|---|---|---|
| `continue-gate-integration.ts:21,75` | `ContinueGate`, `createContinueGate` | Loop / rework-ratio detection; JS fallback exists |
| `memory-write-gate-integration.ts:19-21,69` | `MemoryWriteGate`, `MemoryAuthority`, `WriteDecision` | Contradiction check on ReasoningBank writes |
| `trust-accumulator-integration.ts:24-25,122` | `TrustSystem`, `GateOutcome` | Agent trust tier adjustment |
| `deterministic-gateway-integration.ts:21,147` | `DeterministicToolGateway` | Tool idempotency / dedup |
| `evolution-pipeline-integration.ts:29,395` | `EvolutionPipeline` | Rule success/decay tracking |
| `shard-retriever-integration.ts:28,370` | `ShardRetriever` | Semantic shard load from `.claude/guidance/shards/` |
| `proof-envelope-integration.ts:37,181` | `ProofChain` | Hash-chained audit trail |
| `adversarial-defense-integration.ts:30-31,376` | `ThreatDetector`, `CollusionDetector` | Prompt-injection filter |
| `wasm-kernel-integration.ts:39-52,99` | `GuidanceWasmKernel` (sha256/hmac/signEnvelope/verifyChain) | WASM crypto, JS fallback |

Every integration checks `if (mod && typeof mod.X === 'function')` then **gracefully degrades** to local impl on failure.

## 2. Transitive vs Direct

- **Direct**: `package.json:131` pins `"@claude-flow/guidance": "3.0.0-alpha.1"`.
- **Also transitive**: `node_modules/@claude-flow/cli/package.json:107` depends on `@claude-flow/guidance@^3.0.0-alpha.1`, but `@claude-flow/cli` itself is **optional** (`package-lock.json:302 "optional": true`, peer of optional `@claude-flow/browser` at line 293). Dropping the direct dep does NOT remove guidance from the graph unless you also drop the `@claude-flow/browser` optional dep.
- Conclusion: **direct**, and not safely droppable without a reimplementation because 16 src files reference it.

## 3. Upstream State

- `npm view @claude-flow/guidance versions`: **only `3.0.0-alpha.1`** published 2026-02-02T04:05:29Z — one version, no patches, no stable `^3` line. Dist-tags: `latest=3.0.0-alpha.1`, `alpha=3.0.0-alpha.1`, `v3alpha=3.0.0-alpha.1`. **~2.5 months stale as of 2026-04-20.** No successor on npm.

## 4. Upstream Ruflo Repo

No `node_modules/ruflo` exists. `@claude-flow/cli@3.5.80` (desc: "Ruflo CLI") is the binary the CLAUDE.md calls "ruflo", but it **depends on** guidance — it does not subsume it. Guidance is the policy engine; cli is the shell. Ruflo cannot replace guidance.

## 5. Decision Matrix

| Option | Verdict | Reason |
|---|---|---|
| (a) Reimplement locally | **Partial-feasible** | 9 integrations, but `wasm-kernel` (sha/hmac) and `ProofChain` are already JS-fallback-covered; `ShardRetriever` + `ContinueGate` are non-trivial |
| (b) Upgrade to newer stable | **Impossible** | No newer version on npm |
| (c) Replace with AQE internal | **Partial** | `feature-flags.ts`, witness-chain.ts (674 LOC), constitutional-enforcer.ts (1185 LOC), shard-embeddings.ts (873 LOC) already exist and **don't import guidance** — JS fallback is the real runtime path today |
| (d) Ruflo as replacement | **No** — ruflo pulls guidance itself |

## RECOMMENDATION: **KEEP + ISOLATE (no action this release)**

**Reasoning:**
1. The **`protobufjs` CVE is patched** via `overrides` (`package.json:186`) — the security blocker is gone.
2. All guidance imports are **type-only** at compile time; runtime uses `try { await import } catch { JS fallback }`. Guidance is already **optional at runtime** — the graceful-degradation pattern is in place (`continue-gate-integration.ts:88-91`, `wasm-kernel-integration.ts:110-115`).
3. No stable successor on npm; reimplementing 9 modules (~14,793 LOC of governance code, of which ~60 lines per file reference guidance types) for cosmetic dependency removal is **high effort / low ROI**.
4. ADR-058 (`docs/implementation/adrs/ADR-058-...md:5`) marks this Implemented 2026-02-04 with `TODO(ruflo-rebrand)` comments across files — upstream rebrand to `@ruflo/guidance` is expected.

**Action plan (not this release):**
- (a) Move guidance from `dependencies` → `optionalDependencies` in `package.json:131` (matches `@claude-flow/browser` at line 158). The code **already handles absence**. Zero behavior change for users who have it; fleet still runs if install fails.
- (b) Add a `peerDependenciesMeta: {optional: true}` advisory.
- (c) Track the rebrand — when `@ruflo/guidance` publishes, flip the import string in 9 files (trivial codemod).
- (d) Do **NOT** drop it outright — would leave 14k LOC of governance orphaned.

**Do not** reimplement, fork, or upgrade — upgrade target doesn't exist; fork is maintenance debt.

## Citations

- `/workspaces/agentic-qe/package.json:131,158,186`
- `/workspaces/agentic-qe/package-lock.json:280-308,1394-1400`
- `/workspaces/agentic-qe/src/governance/index.ts:1-19`
- `/workspaces/agentic-qe/src/governance/continue-gate-integration.ts:4-5,21-23,75-91`
- `/workspaces/agentic-qe/src/governance/wasm-kernel-integration.ts:39-52,99,110-115`
- `/workspaces/agentic-qe/src/coordination/queen-coordinator.ts:61-62`
- `/workspaces/agentic-qe/docs/implementation/adrs/ADR-058-guidance-governance-integration.md:1-9,25`
- `npm view @claude-flow/guidance versions` → `["3.0.0-alpha.1"]`
- `npm view @claude-flow/guidance time` → published `2026-02-02T04:05:29.892Z`
