# 01 — Code Quality Analysis (Round 2): MetaHarness generator + Darwin Mode

**Subject:** `ruvnet/agent-harness-generator` @ `5f63ac6` (branch `claude/darwin-mode-evolve-polyglot`, 2026-06-27).
**Scope:** `packages/create-agent-harness/src` (the published generator) and `packages/darwin-mode/src` (the new self-evolving engine).
**Method:** Adversarial static code review (manual). Absolute-path reads only (cross-repo hazard per `_AGENT-BRIEF.md`). Co-located `__tests__/` checked before every "untested/unprotected" claim. No `npm run build`/`npm test` run here (the coverage agent owns that); reasoning is from source + test inspection.
**Evaluator:** AQE QE Code Reviewer. **Date:** 2026-06-27.

---

## Headline verdict

**Both prior HIGH paths are STILL OPEN, and one of them is now provably enshrined by a test.** The witness-verification gate is a *guaranteed* no-op on every kernel backend (not just the degraded one) — and `witness-client.test.ts` asserts the `valid:true` result, so the fail-open is the intended, tested behavior. The bundle/export/diag redaction remains value-blind, and `diag.ts` carries a concrete copy-paste bug (line 311) that makes its attempted value-based redaction dead code. Net: **the publish/verify integrity story is security theater, and the support-bundle path can leak credentials into public GitHub issues.**

**The Darwin Mode security architecture is, by contrast, genuinely strong** — allowlist-of-7 variant files, `lstat` symlink rejection, scrubbed env, shell-free `execFile`, gate-first execution in the real/mock sandbox, and a real write-time `validateGeneratedCode` gate that *all* mutators (including the LLM ones) flow through. The one weakness: the **Tier-2 "agent" sandbox dynamically imports and executes the variant's real `.ts` code but never calls `inspectVariant`**, contradicting its own in-code claim, leaving a regex-only barrier (bypassable) on the highest-consequence path.

Weighted finding score: **4.0** (1 HIGH + 2 MEDIUM + 1 LOW) — above the 3.0 floor.

---

## Finding 1 — HIGH (STILL OPEN, now test-enshrined): witness verification is a guaranteed no-op on ALL backends

**Files:** `packages/create-agent-harness/src/witness-client.ts:45-87`, `packages/kernel-js/src/index.ts:22-27,52-57,76-81`, `packages/create-agent-harness/src/publish.ts:122-131`, `packages/create-agent-harness/src/subcommands.ts:49-79`.

The TS wrapper claims (witness-client.ts:7-8) *"there is no path to publish an unsigned or tampered harness"* and that *"The kernel is the security boundary."* Neither holds:

1. **No kernel backend exposes `witnessVerify`.** `KernelBackend` (`kernel-js/src/index.ts:22-27`) declares only `kernelInfo`, `mcpValidate`, `version`, `backend`. The native wrapper (`:52-57`) and wasm wrapper (`:76-81`) map only those three methods — they do **not** forward `witnessVerify`. `crates/kernel-wasm/src/lib.rs` still exports only `kernel_info`/`mcp_validate`/`version`. The Rust `verify_manifest` (real Ed25519, `crates/kernel/src/witness.rs:110`) is **never bridged to JS** through NAPI or wasm. Therefore `typeof kernel.witnessVerify === 'function'` (witness-client.ts:74) is **always false on every backend** — native, wasm, and js alike — so control always falls through to the `return { valid: true, reason: '...degraded' }` at **witness-client.ts:86**. The "degraded" label is misleading: this is not a fallback, it is the *only* path.

2. **Shape checks accept any well-formed forgery.** `verifyWitness` (`:50-69`) only checks: `schema===1`, a 64-char `public_key`, a 128-char `signature`, an `entries` array, and string `harness`/`version`. A manifest whose `entries[].sha256` markers have been swapped to a tampered build still passes, because the signature (any 128 hex chars) is never cryptographically checked against the entries.

3. **Publish skips verification entirely when `witness.json` is absent.** `publish.ts:125-131` only verifies *if* `findWitness` returns a path; missing witness → no check (comment at `:123-124` admits "We accept missing witness.json"). So an unsigned harness publishes freely, and a tampered-but-shape-valid one passes the `if (!result.valid)` gate because `result.valid` is always true.

**Trigger (user-visible theater):** `harness verify` on a tampered harness with a shape-valid `witness.json` prints `Result: VALID (shape verified; kernel not loaded (degraded))` and exits 0 (`subcommands.ts:69-71`). The entries' `sha256` content is never matched against the live tree.

**Test enshrines it:** `__tests__/witness-client.test.ts:52-59` — *"accepts a shape-valid manifest in degraded mode (no kernel)"* → `expect(r.valid).toBe(true)`. The no-op is the asserted contract, so it will not be caught by the suite.

**Severity HIGH / complexity LOW-to-fix.** This is a supply-chain integrity control on a public-marketplace publish path that is a guaranteed no-op while its docstring asserts it is the security boundary. Fix: either bridge `verify_manifest` into the JS/wasm/native backends and make the missing-`witnessVerify` case **fail closed** (`valid:false`), or remove the "no path to publish a tampered harness" claim and downgrade `harness verify` output to honestly say "signature not verified."

---

## Finding 2 — MEDIUM (STILL OPEN + new concrete bug): value-blind redaction; `diag.ts:311` is dead code

**Files:** `diag.ts:303-315`, `export-config.ts:29-40,86-90`, `threat-model.ts:178-189`, `genome.ts:178-186`, `score.ts:335-343`.

Every redactor keys off the **object key name only** and never inspects the **value**, so a secret stored under a benign key leaks verbatim:

- `export-config.ts:31-39` — `redact()` returns string values unchanged (`:32`) and only replaces a value when its *key* matches `REDACT_KEY_RE`. A Postgres DSN under `"database": "postgres://u:p4ss@host/db"`, an MCP `"args": ["--token=sk-..."]` element, or an `"Authorization": "Bearer sk-..."` header all pass through verbatim (the key strings `database`/`args`/`Authorization` don't match `secret|token|key|password|passphrase`). This feeds the `harness export-config` output users share for security review.
- `threat-model.ts:186` and `genome.ts:186` and `score.ts:343` — identical key-only `SECRET_RE.test(k)` pattern; value-blind.

**New concrete bug — `diag.ts:310-311` (support-bundle path, pasted into public GitHub issues):**
```ts
if (REDACT_KEY_RE.test(k)) out[k] = '<redacted>';
else if (typeof v === 'string' && REDACT_KEY_RE.test(k)) out[k] = '<redacted>';   // dead
```
The `else` branch is reached only when `REDACT_KEY_RE.test(k)` is already **false**; line 311 then re-tests the same `k`, so the condition is **provably unreachable**. The author plainly intended `REDACT_KEY_RE.test(v)` (redact when the *value* looks secret-shaped) but typed `k` — so the value-based safety net is non-functional. Compounding it, `diag.ts`'s regex is **anchored** (`/^(secret|token|key|password|api[-_]?key)/i`, `:303`), weaker than the others: `db_password`, `github_token`, `npm_token`, `ANTHROPIC_API_KEY` all **fail** the `^`-anchored match and are **not** redacted — yet the docstring (`:273-276`) promises "anything starting with `secret_`/`token_`/`key_` is replaced … so users can paste this without leaking credentials they typed into prompts."

**Untested:** no `diag`/`export-config`/`threat-model` redaction test exists (only `validate.test.ts` references `redact`), so neither the value-blindness nor the dead-code branch is covered.

**Severity MEDIUM.** Realistic credential disclosure into public bug reports; the `diag.ts:311` typo is a clean, high-confidence correctness defect. Fix: scan values (not just keys) with a JWT/`sk-`/`ghp_`/PEM/high-entropy detector, drop the `^` anchor in `diag.ts`, and fix line 311 to test `v`. Add a redaction test with secret-under-benign-key fixtures.

---

## Finding 3 — MEDIUM (NEW): Tier-2 "agent" sandbox executes variant code without `inspectVariant`; in-code invariant is false

**Files:** `tier2-sandbox.ts:8-9,78-114`, `tier2-driver.ts:30-34`, `evolve.ts:113-118`, `safety.ts:77-101,192-199`.

`runVariantTaskAgent` spawns `node --experimental-strip-types tier2-driver.js <variantDir>`, and the driver **dynamically imports and runs the variant's real surface code** (`tier2-driver.ts:31-34`: `await import(\`${variantDir}/planner.ts\`)`, etc.). `--experimental-strip-types` is **not** a security sandbox — it only strips TS types; the child runs with full Node privileges.

The module comment (`tier2-sandbox.ts:8-9`) states *"The gate (`inspectVariant`) has already cleared the variant before any execution."* This is **false on this path**: `runVariantTaskAgent`/`runVariantTasksAgent` never call `inspectVariant`, and the only caller — `evolve.ts:115` — doesn't either (the real/mock sandbox `runVariantTask` *does* gate first, `sandbox.ts:95`; the agent path does not). So the second, independent defense-in-depth layer (which alone catches symlinks, extra/oversized files, and the filename allowlist — things `validateGeneratedCode` cannot see) is **absent** on the one path that actually executes the code.

The remaining barrier is the write-time `validateGeneratedCode` (`mutator.ts:356`, correctly applied to all generators incl. LLM mutators via the shared `createChildVariant`), but it is a **regex content scan** (`safety.ts:77-101`) and is bypassable for code that will then be executed in Tier-2: e.g. `"".constructor.constructor` reaches the `Function` constructor without matching `/\bnew\s+Function\b/`, and `String.fromCharCode(...)`/`atob(...)` payloads evade the `child_process`/`require(`/`exec(` substring patterns. Reaching this requires an LLM mutator to be induced (prompt-injection via `repoSummary`/`failedTraces`) to emit such a payload, and `sandboxMode:'agent'` is opt-in (default `'real'`) — hence MEDIUM, not HIGH.

**Severity MEDIUM.** Fix: call `inspectVariant(variant.dir)` at the top of `runVariantTaskAgent` (mirror `sandbox.ts:94-110`, return exitCode 99 on findings) so the claimed two-layer guarantee is real, and correct the comment. Consider executing Tier-2 children under `--disallow-code-generation-from-strings` and a `--permission`-restricted child to neutralize the `constructor.constructor` class of bypass.

---

## Finding 4 — LOW / INFORMATIONAL: `with-wasm.ts` builds a shell string with `execSync`

**File:** `with-wasm.ts:77-80`.

`execSync(\`wasm-pack build ${JSON.stringify(crate)} ... ${JSON.stringify(outDir)}\`, …)` interpolates a user-supplied `--with-wasm <path>` into a **shell** command; `JSON.stringify` is not shell-safe (a path containing `$(...)`/backticks inside the double quotes is still expanded by `sh`). Not a meaningful vulnerability — `crate` is the invoking user's own CLI arg, gated by an `existsSync(<crate>/Cargo.toml)` check (`:60`), so no trust boundary is crossed — but it is inconsistent with the rest of the codebase, which deliberately uses bare-argv `execFile` "no shell, no injection" everywhere else. **Fix (style/consistency):** switch to `execFileSync('wasm-pack', ['build', crate, '--target', 'nodejs', '--release', '--out-dir', outDir], …)`.

---

## Genuinely strong code (credit where due)

- **`safety.ts` (Darwin gate)** — allowlist of exactly 7 filenames (`:36-49`), `lstat`-based symlink/non-regular-file rejection (`:143-154`, no symlink escape), size + file-count caps (`:104-105,127-129,166-169`), blocked filename + content pattern sets, and a *separate* write-time `validateGeneratedCode`. Real, test-pinned, defense-in-depth code — not comments.
- **`sandbox.ts`** — gate-first (`:94-110`), shell-free `execFile` with bare argv (`:135`), scrubbed env exposing only `PATH` + 3 identifiers (`:69-76`, no secret/proxy leak into variants), never-throws contract (failures become `RunTrace`s). Clean and well-reasoned.
- **`mutator.ts:createChildVariant`** — single shared write path enforcing `validateGeneratedCode` before `writeFile` (`:356-366`); LLM mutators (`openrouter`/`requesty`/`ruvllm`) only *return* code and correctly inherit the gate rather than re-implementing it. The "slots behind the SAME gate" claim is substantiated.
- **`kernel-js/src/index.ts`** — honest backend resolution with recorded failure reasons (`:34,201-215`) and a fail-loud path when a specific backend is requested but unavailable (`:173-194`). (The witness gap is in the generator's wrapper, not here.)
- **`publish.ts` / `index.ts:531-549`** — Pinata JWT is env-only (`:49-51`), git clone uses `spawnSync` argv with a `--` separator to defeat option-injection (`index.ts:543-549`).

---

## Status vs prior round (working-may, 2026-06-15)

| Prior finding | Status | Evidence (file:line) |
|---|---|---|
| **HIGH-1** — witness verify is a guaranteed no-op; no backend exposes `witnessVerify`; publish fails open | **STILL OPEN (worse: test-enshrined)** | `witness-client.ts:74,86`; `kernel-js/src/index.ts:22-27,52-57,76-81`; `crates/kernel-wasm/src/lib.rs:9-27`; `publish.ts:125-131`; `__tests__/witness-client.test.ts:52-59` |
| **HIGH-2** — `secrets fetch` prints raw secret; bundle/export redaction keys on names not values | **STILL OPEN (redaction)** — *the `secrets fetch`→stdout part is by-design* (a pipe-able fetch, like `gcloud secrets versions access`), not a defect; the **value-blind redaction is the real, open issue** | `export-config.ts:31-39`; `diag.ts:303-315`; `threat-model.ts:178-189`; `genome.ts:178-186`; `score.ts:335-343`; `secrets.ts:155-157` |
| **NEW** — `diag.ts:311` dead-code defeats value-based redaction; `^`-anchored regex misses `db_password`/`github_token` | **NEW (HIGH-confidence bug)** | `diag.ts:303,310-311` |
| **NEW** — Tier-2 agent sandbox executes variant code via dynamic import without `inspectVariant`; comment claims otherwise; sole barrier is bypassable regex | **NEW** | `tier2-sandbox.ts:8-9,78-114`; `tier2-driver.ts:30-34`; `evolve.ts:113-118` |
| **NEW (LOW)** — `with-wasm.ts` shell `execSync` with non-shell-safe quoting (no trust-boundary impact) | **NEW (style)** | `with-wasm.ts:77-80` |
| Darwin safety architecture (gate, sandbox, mutator write-gate) | **STRONG / no defect** | `safety.ts:36-199`; `sandbox.ts:69-174`; `mutator.ts:356-366` |
| Generator source broadly well-tested (prior killed-findings re-verified) | **Holds** — co-located `__tests__/` (28 files) present incl. `witness-client`, `secrets`, `publish`, `federate`, `eject`, `tarball` | `packages/create-agent-harness/__tests__/` |

---

## Recommended actions (this report's scope)

1. **P0/P1** — Make witness verification real or honest: bridge `verify_manifest` into the kernel JS surface and **fail closed** when `witnessVerify` is unavailable; remove the "no path to publish a tampered harness" claim until then; update `harness verify` output and `witness-client.test.ts` to stop asserting `valid:true` for an unverified signature.
2. **P1** — Fix `diag.ts:311` (`test(v)` not `k`), drop the `^` anchor, add value-scanning (JWT/`sk-`/`ghp_`/PEM/high-entropy) to all five redactors, and add a redaction test with secret-under-benign-key fixtures.
3. **P2** — Call `inspectVariant` at the top of `runVariantTaskAgent` and correct the false invariant comment; harden Tier-2 children (`--disallow-code-generation-from-strings`).
4. **P3** — Replace `with-wasm.ts` `execSync` shell string with bare-argv `execFileSync` for consistency with the rest of the codebase.
