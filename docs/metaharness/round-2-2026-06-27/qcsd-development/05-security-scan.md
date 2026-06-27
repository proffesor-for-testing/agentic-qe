# 05 — Security & Authorization Scan (Round 2): MetaHarness generator + Darwin Mode

- **Agent:** qe-security-scanner (QCSD Development Swarm, ADR-102 Batch-2 CONDITIONAL). GATE-CRITICAL dimension.
- **Trigger:** HAS_SECURITY_CODE=TRUE. (qe-sod-analyzer N/A — no SAP/authorization-matrix surface.)
- **Target:** `/workspaces/agent-harness-generator` @ `5f63ac6` (branch `claude/darwin-mode-evolve-polyglot`, 2026-06-27).
- **Scope:** `packages/create-agent-harness/src` (published generator) + `packages/darwin-mode/src` (self-mutation engine: safety/sandbox/tier2/evolve/mutator/genome/score).
- **Method:** Adversarial SAST read of every in-scope file (absolute paths only — cross-repo hazard per `_AGENT-BRIEF.md`) + `npm audit --omit=dev` (EXECUTED) + binding-surface grep (EXECUTED). No full build (workspace RED — missing `@ruvector/tiny-dancer`; environmental, not fixed). No DAST (CLI/codegen tool, no running-app surface).
- **Date:** 2026-06-27.

## Verdict

| Severity | Count |
|----------|-------|
| CRITICAL | 0     |
| HIGH     | 2     |
| MEDIUM   | 6     |
| LOW      | 5     |

**SECURITY GATE: HOLD.**

Both prior HIGH findings sit in security/provenance code and are **STILL OPEN**. HIGH-1 (witness verification no-op) is now *test-enshrined* — `witness-client.test.ts:52-60` asserts `valid:true` for an unverified signature, so the fail-open is the suite's contract. HIGH-2 (value-blind redaction) is confirmed across five redactors and the support-bundle redactor carries a provably-dead branch (`diag.ts:311`) plus a `^`-anchored key regex that fails to redact `github_token`/`npm_token`/`ANTHROPIC_API_KEY` even by key name. Per the gate rule (HOLD on any HIGH/CRITICAL in security code), this blocks — HIGH-1 alone is dispositive.

`npm audit --omit=dev` → **found 0 vulnerabilities** (EXECUTED, exit 0). Supply-chain risk here is design-level, not a dependency CVE.

**Genuinely strong, verified controls (credit):** the Darwin Mode `safety.ts` gate (7-file allowlist, `lstat` symlink rejection, size/file caps, broad blocked-content regex set), the *real* sandbox (`sandbox.ts` gate-first, shell-free `execFile`, scrubbed env), and the shared `validateGeneratedCode` write-gate that all mutators (incl. LLM ones) flow through are real, test-pinned defense-in-depth. The one regression in that architecture is the Tier-2 "agent" path (MED-6), which executes variant code while skipping the `inspectVariant` gate its own comment claims runs.

---

## HIGH findings

### HIGH-1 — Witness verification is a guaranteed no-op on ALL backends; publish/verify fails open (STILL OPEN, test-enshrined)

- **Evidence class:** STATIC (binding surface) + EXECUTED (grep) + INFERRED (runtime consequence).
- **Files:**
  - `packages/create-agent-harness/src/witness-client.ts:74` (`if (typeof kernel.witnessVerify === 'function')`) → always false.
  - `packages/create-agent-harness/src/witness-client.ts:86` (`return { valid: true, reason: 'shape verified; kernel not loaded (degraded)' }`) — the ONLY reachable terminal path.
  - `packages/create-agent-harness/src/publish.ts:106` (TODO still present) and `:122-131` (gate `if (!result.valid)` is dead — `result.valid` is always true; missing-witness path skips verification entirely at `:126`).
  - `packages/kernel-js/src/index.ts:22-27` — `KernelBackend` interface exposes only `kernelInfo / mcpValidate / version / backend`. **No `witnessVerify`.** All three backends (native `:52-57`, wasm `:76-81`, js floor `:113-144`) map only those three methods.
  - `crates/kernel-wasm/src/lib.rs:8-27` — exports only `kernelInfo`/`mcpValidate`/`version` (EXECUTED grep).
  - `crates/kernel-napi/src/lib.rs:6-22` — NAPI exports only `kernelInfo`/`mcpValidate`/`version` (EXECUTED grep). The real Ed25519 `verify_manifest` (`crates/kernel/src/witness.rs:110`) is **never bridged** to JS via NAPI or wasm.
  - `packages/create-agent-harness/__tests__/witness-client.test.ts:52-60` — *"accepts a shape-valid manifest in degraded mode"* → `expect(r.valid).toBe(true)`. The no-op is the asserted contract.

- **Why HIGH (not the documented-degraded MEDIUM it looks like):** The docstring (`witness-client.ts:7-8`, `:42`) asserts *"there is no path to publish an unsigned or tampered harness"* and *"the kernel is the security boundary."* Neither holds. Because no kernel backend on any platform exposes `witnessVerify`, the `typeof === 'function'` gate at `:74` is false on native, wasm, and js alike, so control *always* falls to `:86` and returns `valid:true`. There is no shippable build — including a fully-compiled native kernel in CI — in which the signature is checked from the JS publish path. The shape gate (`:50-68`) accepts any 64-hex `public_key` + 128-hex `signature` + `entries` array; the signature is never matched against the entries' `sha256` markers.

- **Exploit sketch:**
  1. Craft a malicious harness with a `witness.json`: `schema:1`, 64-hex `public_key`, 128-hex (garbage) `signature`, `entries:[]`, string `harness`/`version`.
  2. `verifyWitness()` passes every shape gate, reaches the kernel branch, finds no `witnessVerify`, returns `{valid:true}`.
  3. `publishHarness()` (`publish.ts:126-131`) sees `result.valid === true`, does not throw, proceeds to pin to IPFS / `npm publish --provenance`.
  4. `harness verify` on a tampered-but-shape-valid harness prints `VALID (...degraded)` and exits 0. The published artifact carries a provenance/witness claim no cryptographic check ever validated. The genuine tamper tests in `witness.rs:213-238` pass — but they test the Rust function directly, never the JS path that ships ("unit green, integration path dead").

- **Fix (ordered):**
  1. Bridge `witness::verify_manifest` across the binding surface: add `witnessVerify(json) -> bool|string` to `crates/kernel-wasm/src/lib.rs` and `crates/kernel-napi/src/lib.rs`; reimplement Ed25519 verify in the pure-JS floor (or have the JS backend declare witness verification *unavailable*). Add it to `KernelBackend` and all three backends in `kernel-js/src/index.ts`.
  2. In `witness-client.ts`, **fail closed for publish** when no real verifier is reachable: return `{valid:false, reason:'witness verifier unavailable'}` (or gate behind an explicit, loud `--allow-unverified`). Never return `valid:true` from a path that did no crypto.
  3. Resolve `publish.ts:106` TODO; decide whether missing-`witness.json` should fail closed on the publish path.
  4. Fix `witness-client.test.ts:52-60` to stop asserting `valid:true` for an unverified signature; add an **integration** test driving `publishHarness()` with a tampered `witness.json` that asserts it throws.

---

### HIGH-2 — Value-blind redaction + dead-code redaction branch + `^`-anchored key regex leak credentials into a public-paste support bundle (STILL OPEN, with new confirmed bug)

- **Evidence class:** STATIC (code) + INFERRED (data-flow).
- **Files (all re-read this round):**
  - `packages/create-agent-harness/src/diag.ts:303` — `REDACT_KEY_RE = /^(secret|token|key|password|api[-_]?key)/i` (**anchored**).
  - `packages/create-agent-harness/src/diag.ts:310-311` — **DEAD CODE (confirmed verbatim):**
    ```ts
    if (REDACT_KEY_RE.test(k)) out[k] = '<redacted>';
    else if (typeof v === 'string' && REDACT_KEY_RE.test(k)) out[k] = '<redacted>'; // unreachable: re-tests k
    ```
    The `else` is only reached when `REDACT_KEY_RE.test(k)` is already false; line 311 re-tests the same `k`, so it is provably unreachable. The author clearly intended `REDACT_KEY_RE.test(v)` (value-shaped redaction) — so the value-based safety net is non-functional.
  - `packages/create-agent-harness/src/export-config.ts:29-39` — unanchored key regex, but `redact()` returns string values unchanged (`:32`) — **value-blind**.
  - `packages/create-agent-harness/src/threat-model.ts:178,186` — `SECRET_RE.test(k)` key-only.
  - `packages/create-agent-harness/src/genome.ts:178,186` — `SECRET_RE.test(k)` key-only.
  - `packages/create-agent-harness/src/score.ts:335,343` — `SECRET_RE.test(k)` key-only.
  - `packages/create-agent-harness/src/secrets.ts:156` (raw value to stdout — **by design**, like `gcloud secrets versions access`; not the defect), `:182` (`(${token.length} chars)` — minor length oracle, still present).

- **Issue:** Every redactor keys off the **object-key name**, never the **value**. A secret stored under a benign key leaks verbatim: a Postgres DSN under `"database":"postgres://u:p4ss@host/db"`, an MCP `"args":["--token=sk-..."]` element, or an `"Authorization":"Bearer sk-..."` header all pass through (keys `database`/`args`/`Authorization` match no regex). Worse for the **support-bundle path** (`diag.ts`): the docstring (`:273-276`) explicitly promises *"users can paste this without leaking credentials"*, yet (a) its value-based net is dead code (`:311`), and (b) its `^`-anchor means `github_token`, `npm_token`, `db_password`, `ANTHROPIC_API_KEY` fail to redact **even by key name** (`github_token` does not start with `token`). `harness diag --bundle` output is routinely pasted into public GitHub issues.

- **Why HIGH (Batch-1 quality rated this MEDIUM):** I keep HIGH because the disclosure target is a *public channel* under an explicit safe-to-paste promise, and the control is doubly broken (value-blind **and** key-blind for common credential names) on that exact path. The dependency — a real secret stored as a manifest var value / under a benign key — is realistic given the docstring invites users who *"typed credentials into prompts."* If the gate hinges on this finding alone, MEDIUM is defensible; combined with HIGH-1 the gate is HOLD regardless.

- **Fix:** fix `diag.ts:311` to test `v`; drop the `^` anchor in `diag.ts`; add value-scanning (JWT `eyJ`, `sk-`, `ghp_`, `npm_`, PEM `BEGIN ... PRIVATE KEY`, high-entropy) to all five redactors; redact `secrets.ts:182` length; add a redaction test with secret-under-benign-key fixtures (none exists today).

---

## MEDIUM findings

### MED-1 — `renderer.ts` has no output escaping (STILL OPEN)
- `packages/create-agent-harness/src/renderer.ts:24-25,34,40`. `{{var}}` is identifier-only regex + `String(v)` — **template-injection/eval escape NOT present** (good). The risk is the documented no-escaping caveat: a var with `"`/`\`/newline rendered into a `*.json.tmpl`/`mcp-policy.json.tmpl` yields malformed or attacker-shaped JSON. `name` is kebab-validated, but `description` (`analyze-repo.ts` passes `Harness for ${profile.name}` from `basename(root)`) is not. **Fix:** JSON-escape vars rendered into `*.json.tmpl`.

### MED-2 — `writer.ts --force` recursive `rm` with no symlink guard (STILL OPEN)
- `packages/create-agent-harness/src/writer.ts:8,16,30` — `rm` + `force` flag present, no `lstat`/symlink check before removing `targetDir`. A `--force` against a symlinked target deletes the link-target contents. Path segments from `f.path` are `split('/')`/`join`ed with no `..` rejection. **Fix:** `lstat` and refuse symlinked targets; reject `..`/absolute segments; assert staged dst stays within staging.

### MED-3 — `eject.ts` / `upgrade.ts` path traversal from source-tree / manifest keys (STILL OPEN)
- `packages/create-agent-harness/src/eject.ts:143-144` (`join(targetDir, ...rel.split('/'))`), `upgrade.ts:68,137,143` (`join(projectDir, ...path.split('/'))` where `path` comes from the manifest `files` map). No `normalize`/`resolve`/`..` guard. A tampered manifest entry `../../etc/cron.d/x` writes outside `projectDir` — and per HIGH-1 the witness gate that should catch a tampered manifest is a no-op, so this compounds. **Fix:** resolve every destination and assert it is a child of the intended root; reject `..`/absolute segments.

### MED-4 — `external-template.ts` dynamic `import()` of arbitrary package = RCE-by-install (STILL OPEN)
- `packages/create-agent-harness/src/external-template.ts:31` (`await import(packageName)`) then executes its `.load()`. Arbitrary code execution by design if a user is tricked into `--template-package evil-pkg`; no allowlist, scope restriction, or integrity pin. **Fix:** restrict to an allowlisted scope (e.g. `@metaharness/`) by default; require `--allow-untrusted-template` to go outside it; document that external templates run arbitrary code.

### MED-5 — `publish.ts` / `pinJson` SSRF surface via caller-overridable `baseUrl` (STILL OPEN, latent)
- `packages/create-agent-harness/src/publish.ts:52-66` — `baseUrl` defaults to `https://api.pinata.cloud` but is overridable via `PinataConfig.baseUrl` and concatenated into the fetch URL with the Bearer JWT in the `Authorization` header. No `--base-url` is exposed in the CLI today (grep of `publish-cmd.ts`/`subcommands.ts` → none), so exposure is **latent**, but the primitive sends the Pinata JWT wherever `baseUrl` points. **Fix:** validate `baseUrl` is `https:` and host-allowlisted before attaching the Authorization header.

### MED-6 — Tier-2 "agent" sandbox executes variant code without `inspectVariant`; in-code invariant is false (NEW)
- `packages/darwin-mode/src/tier2-sandbox.ts:8-9` (comment: *"The gate (`inspectVariant`) has already cleared the variant before any execution"*), `:78-114` (`runVariantTaskAgent` — **no `inspectVariant` call**; grep confirms zero references in `tier2-sandbox.ts`/`tier2-driver.ts`). `tier2-driver.ts:31-34` dynamically `import()`s and runs the variant's real `.ts` surfaces under `node --experimental-strip-types` (a type-stripper, **not** a security sandbox — full Node privileges). `evolve.ts:114-118` routes `sandboxMode==='agent'` straight to `runVariantTasksAgent` with no gate; the real path `runVariantTasks` (`sandbox.ts:95`) *does* gate first. So the second, independent defense-in-depth layer (the only one that catches symlinks, extra/oversized files, the filename allowlist) is **absent on the one path that actually executes the code.**
- The remaining barrier is the write-time `validateGeneratedCode` (regex scan, `safety.ts:77-101`), which is bypassable for code that will then execute: `"".constructor.constructor(...)` reaches the `Function` constructor without matching `/constructor\s*\[/` (the regex only catches the **bracket** form, `safety.ts:96`) or `/\bnew\s+Function\b/`; `String.fromCharCode`/`atob` payloads evade the substring patterns. Reaching it requires inducing an LLM mutator (prompt-injection via `repoSummary`/`failedTraces`) to emit such a payload, and `sandboxMode:'agent'` is **opt-in** (default `'real'`, `cli.ts:177`) — hence MEDIUM, not HIGH.
- **Fix:** call `inspectVariant(variant.dir)` at the top of `runVariantTaskAgent` (mirror `sandbox.ts:94-110`, return exitCode 99 on findings) so the claimed two-layer guarantee is real; correct the false comment; add `constructor\s*\.\s*constructor` to `BLOCKED_CONTENT_PATTERNS`; run Tier-2 children with `--disallow-code-generation-from-strings`.

---

## LOW findings (carried forward; surfaces re-confirmed present)

- **LOW-1** — `mcp-scan.ts:105,108` wildcard/risky-bash detection misses `Bash(node -e ...)`/`Bash(npx ...)`/trailing-glob forms (scanner can report green on an RCE-granting surface). Otherwise detection (default-deny, allowShell, no-approval, secret-guard) is sound.
- **LOW-2** — `federate.ts:108-118` trust tier enum validated, but any peer can be added `trust=self|trusted` from the CLI with no proof-of-identity; `endpoint` stored verbatim with no scheme check.
- **LOW-3** — `tarball.ts:73` silently truncates names >100 bytes, weakening the witness sha256 ↔ source correspondence (determinism preserved, fidelity not).
- **LOW-4** — `mcp-scan.ts:118-127` unpinned-dep check is `low` and misses `git+`/`file:`/`http(s)://`/`npm:alias@` specs and lockfile absence.
- **LOW-5 (NEW, style)** — `with-wasm.ts:25,77` builds a shell string with `execSync` (`JSON.stringify` is not shell-safe). No trust boundary crossed (the path is the invoking user's own CLI arg, gated by `existsSync(<crate>/Cargo.toml)`), but inconsistent with the bare-argv `execFile` "no shell" convention used everywhere else. **Fix:** switch to `execFileSync('wasm-pack', [...])`.

---

## Surfaces explicitly cleared (no finding) / strong controls credited

- **`npm audit --omit=dev` → 0 vulnerabilities** (EXECUTED, exit 0).
- **Command injection in `secrets.ts`:** NOT present — `execFile` argv-array form, no shell (`:33,142,186`); `validateToken` injects the token via `npm_config__authToken` env, not an `.npmrc` rewrite (`:187`) — correct pattern.
- **Template eval/expansion escape in `renderer.ts`:** NOT present — identifier-only regex + `String()` (`:34,40`).
- **Darwin `safety.ts` gate — STRONG (verified):** 7-file allowlist (`:36-49`), `lstat` symlink + non-regular-file rejection (`:143-154`), size/file caps (`:104-105,127-129,166-169`), broad blocked-content regex incl. `process.env`/`child_process`/`require(`/`import(`/`eval`/`new Function`/`fetch`/`globalThis`/`__proto__`/`constructor[` (`:77-101`), and an independent write-time `validateGeneratedCode` (`:192-199`). Real, test-pinned defense-in-depth.
- **Darwin real `sandbox.ts` — STRONG (verified):** gate-first (`inspectVariant` at `:95`, exitCode 99 disqualified), shell-free `execFile` bare argv (`:135`), scrubbed env exposing only PATH + 3 identifiers (`:69-76`), never-throws contract.
- **`mutator.ts:createChildVariant` — STRONG (verified):** single shared `validateGeneratedCode` gate before `writeFile` (`:356`); LLM mutators (`openrouter`/`requesty`/`ruvllm`) only *return* code and inherit the gate (confirmed via module headers). The "all mutators behind the SAME gate" claim is substantiated.
- **`kernel-js/src/index.ts`:** honest backend resolution with recorded failure reasons and fail-loud on requested-but-missing backend (`:163-194`). (The witness gap is in the generator wrapper, not here.)

---

## Gate mapping

| Rule | Condition | Result |
|------|-----------|--------|
| HOLD | HIGH/CRITICAL in security code | **MET** — HIGH-1 (witness/provenance gate), HIGH-2 (support-bundle redaction) |
| CONDITIONAL | MEDIUM only | n/a |
| SHIP | none | n/a |

**SECURITY GATE: HOLD.** HIGH-1 is dispositive on its own (a supply-chain integrity control on a public-marketplace publish path that is a guaranteed no-op while its docstring asserts it is the security boundary). Remediate HIGH-1 (wire + fail-closed the witness verifier; un-enshrine the test) and HIGH-2 (value-aware redaction; fix the `diag.ts:311` dead branch). Address MED-3/MED-4/MED-6 in the same cycle: with the witness check dead (HIGH-1), the tampered-manifest path-traversal (MED-3), arbitrary-import RCE (MED-4), and gate-skipping Tier-2 exec (MED-6) have no provenance backstop.

---

## Status vs prior round

| Prior finding | Status | Evidence (file:line) |
|---|---|---|
| **HIGH-1** — witness verify is a guaranteed no-op; no backend exposes `witnessVerify`; publish fails open | **STILL OPEN (worse: test-enshrined)** | `witness-client.ts:74,86`; `publish.ts:106,122-131`; `kernel-js/src/index.ts:22-27,52-57,76-81,113-144`; `crates/kernel-wasm/src/lib.rs:8-27`; `crates/kernel-napi/src/lib.rs:6-22`; `__tests__/witness-client.test.ts:52-60` |
| **HIGH-2** — value-blind redaction; bundle redaction keys on names not values; `secrets fetch`→stdout | **STILL OPEN** (the stdout pipe is by-design; value-blind redaction is the real defect) + **new confirmed dead-code bug** `diag.ts:311` + `^`-anchor misses `github_token`/`npm_token` | `diag.ts:303,310-311`; `export-config.ts:29-39`; `threat-model.ts:178,186`; `genome.ts:178,186`; `score.ts:335,343`; `secrets.ts:156,182` |
| **MED-1** — `renderer.ts` no output escaping | **STILL OPEN** | `renderer.ts:24-25,34,40` |
| **MED-2** — `writer.ts --force` recursive rm, no symlink guard | **STILL OPEN** | `writer.ts:8,16,30` |
| **MED-3** — `eject.ts`/`upgrade.ts` path traversal from source/manifest keys | **STILL OPEN** | `eject.ts:143-144`; `upgrade.ts:68,137,143` |
| **MED-4** — `external-template.ts` `import()` arbitrary package RCE | **STILL OPEN** | `external-template.ts:31` |
| **MED-5** — `publish.ts` `baseUrl` SSRF (latent; no CLI exposure) | **STILL OPEN (latent)** | `publish.ts:52-66`; no `--base-url` in `publish-cmd.ts`/`subcommands.ts` |
| **MED-6** — Tier-2 agent sandbox executes variant code without `inspectVariant`; false invariant comment | **NEW** | `tier2-sandbox.ts:8-9,78-114`; `tier2-driver.ts:31-34`; `evolve.ts:114-118`; `safety.ts:96` (bracket-only constructor regex) |
| **LOW-1..4** — mcp-scan wildcard/bash bypass, federate trust binding, tarball truncation, unpinned-dep check | **STILL OPEN** | `mcp-scan.ts:105,108,118-127`; `federate.ts:108-118`; `tarball.ts:73` |
| **LOW-5** — `with-wasm.ts` shell `execSync` (no trust-boundary impact) | **NEW (style)** | `with-wasm.ts:25,77` |
| Darwin safety architecture (gate / real sandbox / mutator write-gate) | **STRONG / no defect** | `safety.ts:36-199`; `sandbox.ts:69-166`; `mutator.ts:356` |
| `npm audit --omit=dev` | **0 vulnerabilities (EXECUTED)** | exit 0 |
