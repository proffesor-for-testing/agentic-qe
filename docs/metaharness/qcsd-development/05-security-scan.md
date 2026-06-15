# 05 — Security & Authorization Scan: MetaHarness (`ruvnet/agent-harness-generator`)

- **Agent:** qe-security-scanner (QCSD Development Swarm), absorbing the HAS_AUTHORIZATION surface (qe-sod-analyzer mapped but N/A — no SAP).
- **Trigger:** HAS_SECURITY_CODE=TRUE.
- **Target:** `/workspaces/agent-harness-generator` @ v0.1.0 (HEAD `367ce6e`).
- **Scope:** `packages/create-agent-harness/src`, `crates/kernel/src/witness.rs`, `packages/kernel-js/src`.
- **Method:** Manual SAST read of every in-scope file + `npm audit --omit=dev` (EXECUTED) + binding-surface grep (EXECUTED). No DAST (no running app surface; this is a CLI/codegen tool).
- **Date:** 2026-06-15.

## Verdict

| Severity | Count |
|----------|-------|
| HIGH     | 2     |
| MEDIUM   | 5     |
| LOW      | 4     |

**GATE: HOLD.**

Two HIGH findings sit directly in security/provenance code (the publish-time witness gate and the MCP secret-fetch redaction gap). Per the gate rule (HOLD if HIGH/CRITICAL in security code), this blocks. The dominant blocker is **security theater**: the witness "signed harness" badge is verified by a code path that is structurally incapable of running the signature check, so it returns `valid:true` for 100% of installs.

`npm audit --omit=dev` → **0 vulnerabilities** (EXECUTED). The supply-chain risk here is design-level, not a CVE in a dependency.

---

## HIGH findings

### HIGH-1 — Witness verification is a guaranteed no-op: "signed" badge over a verifier that can never run

- **Evidence class:** STATIC (interface/binding surface) + INFERRED (runtime consequence), corroborated by EXECUTED grep.
- **Primary file:line:**
  - `/workspaces/agent-harness-generator/packages/create-agent-harness/src/witness-client.ts:74` (degrade branch entry)
  - `/workspaces/agent-harness-generator/packages/create-agent-harness/src/witness-client.ts:86` (`return { valid: true, reason: 'shape verified; kernel not loaded (degraded)' }`)
  - `/workspaces/agent-harness-generator/packages/create-agent-harness/src/publish.ts:106` (`TODO: wire into kernel.witnessVerify`)
- **Corroborating files:**
  - `/workspaces/agent-harness-generator/packages/kernel-js/src/index.ts:22-27` — `KernelBackend` interface exposes only `kernelInfo / mcpValidate / version / backend`. **No `witnessVerify`.**
  - `/workspaces/agent-harness-generator/packages/kernel-js/src/index.ts:100-128` (js), `:31-53` (native), `:55-73` (wasm) — none of the three backends defines `witnessVerify`.
  - `/workspaces/agent-harness-generator/crates/kernel-wasm/src/lib.rs:8-27` — WASM exports only `kernelInfo / mcpValidate / version`.
  - `grep witness_verify|witnessVerify crates/` → **no NAPI/WASM export of the verifier** (the real `verify_manifest` lives in `crates/kernel/src/witness.rs:110` but is never bound).

- **Why this is HIGH, not the documented-degraded MEDIUM it looks like:** The code comment frames the `valid:true` return as a fallback for "kernel not available in this environment." That framing is false. The witness check in `witness-client.ts:74` is `if (typeof kernel.witnessVerify === 'function')`. Because **no kernel backend on any platform exposes `witnessVerify`**, that condition is `false` on every machine — native, wasm, and pure-JS alike. Execution therefore *always* falls through the `catch`/fall-through to line 86 and returns `valid: true`. There is no environment, including a fully-built native kernel in CI, in which the Ed25519 signature is actually checked from the JS publish path.

- **Exploit sketch:**
  1. Attacker obtains/crafts a malicious harness directory with a `witness.json` whose `public_key` is 64 hex chars, `signature` is 128 hex chars, `schema:1`, and `entries:[]` — all shape-valid, signature **garbage**.
  2. `verifyWitness()` passes every shape gate (`witness-client.ts:51-68`), reaches the kernel branch, finds no `witnessVerify`, returns `{valid:true, reason:'…degraded'}`.
  3. `publishHarness()` (`publish.ts:125-131`) calls `readAndVerify`, gets `result.valid === true`, does **not** throw, and pins the manifest to IPFS / proceeds toward `npm publish --provenance`.
  4. The published artifact now carries a provenance/witness claim that no cryptographic check ever validated. Consumers who trust the "signed harness" badge (ADR-011's stated invariant: "there is no path to publish an unsigned or tampered harness") are trusting a control that does not exist.
  Note: the genuine tamper-detection tests in `witness.rs:213-238` pass — but they test the Rust function directly, never the JS path that ships. This is the classic "unit tests green, integration path dead" trap (consistent with the project's own Bug-Fix-Verification rule).

- **Fix (ordered):**
  1. Export the verifier across the binding surface: add `witnessVerify(json: &str) -> bool/string` to `crates/kernel-wasm/src/lib.rs` and the NAPI crate, delegating to `witness::verify_manifest`. Add it to the `KernelBackend` interface and all three backends in `kernel-js/src/index.ts` (the pure-JS backend must reimplement Ed25519 verify, or declare witness verification *unavailable* on the JS backend and **fail closed**).
  2. In `witness-client.ts`, change the degraded path to **fail closed for publish**: if no real verifier is reachable, return `{ valid:false, reason:'witness verifier unavailable' }` (or gate behind an explicit `--allow-unverified` opt-out that prints a loud warning). Never return `valid:true` from a path that performed no cryptographic work.
  3. Resolve the `publish.ts:106` TODO so the comment and the code agree.
  4. Add an **integration** test that drives `publishHarness()` end-to-end with a tampered `witness.json` and asserts it throws — closing the gap the existing Rust-only tests leave open.

**Verdict on the witness "degraded valid" path:** it is not a graceful degradation, it is a non-functional security control presented as a functional one. The control should be assumed *absent* in all currently-shippable builds. Treat any "witness-verified / signed harness" claim from v0.1.x as unsubstantiated.

---

### HIGH-2 — `secrets fetch` writes raw secret to stdout with no redaction; `--bundle` redaction regex does not cover it

- **Evidence class:** STATIC (code) + INFERRED (data-flow).
- **File:line:**
  - `/workspaces/agent-harness-generator/packages/create-agent-harness/src/secrets.ts:156` (`process.stdout.write(r.stdout)` — raw secret value to stdout)
  - `/workspaces/agent-harness-generator/packages/create-agent-harness/src/secrets.ts:182` (`fetched 'NPM_TOKEN' (${token.length} chars)` — length leak, minor)
  - Redaction gap context: `/workspaces/agent-harness-generator/packages/create-agent-harness/src/diag.ts:303` and `export-config.ts:29`.

- **Issue:** `secrets fetch <name>` is *designed* to print the raw secret to stdout for piping (documented at `secrets.ts:155`). That is a defensible UX choice in isolation, but two things make it HIGH in this codebase:
  1. **Redaction is keyed on object-key names, not values.** Both redaction regexes (`diag.ts:303` `/^(secret|token|key|password|api[-_]?key)/i`, `export-config.ts:29` `/(secret|token|key|password|passphrase)/i`) only redact when a JSON **key** matches. A secret value emitted as a bare stdout string (the `fetch` output) is never passed through redaction. If a user pipes `harness secrets fetch NPM_TOKEN` into a log, support bundle, or CI artifact, the token is captured verbatim.
  2. **`validateToken` injects the token via `npm_config__authToken` env (`secrets.ts:188`)** into a spawned `npm whoami`. This is the *correct* pattern (no `.npmrc` rewrite), but the surrounding `fetch` path establishes a habit of moving raw secrets through stdout, and the diag/bundle redaction will not catch a token that has leaked into command output captured elsewhere.

- **Exploit / leak sketch:** CI step runs `harness secrets fetch NPM_TOKEN > token.txt` (or the value lands in a shell trace with `set -x`, or in a `harness diag` capture that scoops stdout). The `--bundle` sanitiser the docs promise (`validate.ts:255`: "bundle is sanitised; secret_/token_/key_/password_ fields are redacted") gives false assurance — it redacts *fields*, not free-form captured secret strings. Result: long-lived NPM publish token in plaintext in an artifact.

- **Command-injection sub-assessment (in scope, rated lower):** `secrets.ts` shells out via `execFile('gcloud', args)` and `execFile('npm', [...])` — **argument-array form, not a shell string** — so there is no shell metacharacter injection (`secrets.ts:33,186`). `--project`/`--secret`/`--version` values are passed as discrete argv elements. A hostile `--secret=$(...)` is treated as a literal secret name by gcloud, not expanded. **Command injection: NOT present.** Good. The HIGH is the redaction/leak gap, not injection.

- **Fix:**
  1. Make `secrets fetch` refuse to write to a TTY-less stdout unless `--unsafe-print` is passed, or require an explicit `--out-file` with `0600` perms; default to *not* echoing the raw value.
  2. Redact `token.length` (`secrets.ts:182`) — even the length is a small oracle; print `(fetched, value hidden)`.
  3. Make the diag/bundle sanitiser value-aware: scan string values for high-entropy / known-token shapes (`npm_`, `ghp_`, JWT `eyJ…`) in addition to key-name matching, so a leaked token in a captured-output field is caught.

---

## MEDIUM findings

### MED-1 — `renderer.ts` has no output escaping; generating JSON/policy files can produce injection or invalid output
- **File:** `/workspaces/agent-harness-generator/packages/create-agent-harness/src/renderer.ts:32-43`, caveat documented at `:24-26`.
- The `{{var}}` substitution is **identifier-only** (`/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/`) and does `String(v)` substitution. **Template injection / eval escape: NOT present** — there is no expression evaluation, no dotted-path traversal, no `eval`. Good.
- The real risk is the **documented no-escaping caveat** (`:24`): a var value containing `"`, `\`, newline, or `}` injected into a `.json.tmpl` or `mcp-policy.json.tmpl` produces malformed or attacker-shaped JSON. Because harness names are validated (`validateHarnessName`, kebab-case only), the *name* var is safe, but `description` and any free-text var are not constrained, and `analyze-repo.ts:392` passes `description: \`Harness for ${profile.name}\`` straight in. A repo whose directory name contains JSON metacharacters (the profile name derives from `basename(root)`) could break or shape a generated policy file.
- **Fix:** add a `{{var | json}}` (or context-aware auto-escape) mode for `.json`/`.toml`-targeted templates; at minimum, JSON-escape any var rendered into a `*.json.tmpl`. Document which templates must pre-escape.

### MED-2 — `writeAtomic --force` does unconditional recursive `rm` of an attacker-influenceable target; no symlink guard
- **File:** `/workspaces/agent-harness-generator/packages/create-agent-harness/src/writer.ts:45-49`.
- With `--force`, `rm(targetDir, { recursive:true, force:true })` then `rename(staging, targetDir)`. There is no check that `targetDir` is not a symlink, and `mkdir(dirname(targetDir), {recursive:true})` will happily create parent paths. If `targetDir` (or a path the user is induced to pass) is a symlink to a sensitive directory, `--force` deletes the link target's contents recursively. Path components from `f.path` are split on `/` and `join`ed (`writer.ts:40`); a template author who controls `f.path` with `..` segments could stage outside the staging dir before the rename (template files are trusted today, but external templates — MED-4 — widen this).
- **Fix:** `lstat` the target and refuse to `rm` a symlink; validate each `f.path` rejects `..` and absolute segments before `join`; resolve and assert the staged dst stays within `staging`.

### MED-3 — `eject.ts` / `upgrade.ts` write rendered/merged content using path segments from source tree with no traversal guard
- **Files:** `/workspaces/agent-harness-generator/packages/create-agent-harness/src/eject.ts:143-148`, `/workspaces/agent-harness-generator/packages/create-agent-harness/src/upgrade.ts:137-156`.
- `eject` builds `dst = join(targetDir, ...rel.split('/'))` where `rel` comes from walking a user-supplied source repo; `upgrade` builds `target = join(projectDir, ...path.split('/'))` where `path` comes from the **manifest's `files` map** (attacker-controllable if the manifest is tampered — and per HIGH-1, the witness gate that should catch a tampered manifest is a no-op). A manifest entry like `../../etc/cron.d/x` would write outside `projectDir`. `applyPlan` also writes `target + '.rej'` and inline conflict markers without bound checks.
- **Fix:** normalize and assert every resolved destination is a child of the intended root before writing; reject `..`/absolute path segments in manifest `files` keys and in walked relative paths.

### MED-4 — `external-template.ts` and `analyze-repo.ts` perform `import()`/`require()` of arbitrary package names — RCE-by-install of attacker package
- **Files:** `/workspaces/agent-harness-generator/packages/create-agent-harness/src/external-template.ts:31` (`await import(packageName)`), `/workspaces/agent-harness-generator/packages/create-agent-harness/src/analyze-repo.ts:302-307` (`require('@ruvector/ruvllm')`).
- `loadExternalTemplate` dynamically imports whatever `--template-package` value the user supplies and then **executes its `load()`** (`external-template.ts:45`). This is arbitrary code execution by design — if a user is tricked into `--template-package evil-pkg`, importing it runs its top-level + `load()` code. There is no allowlist, no scope restriction (e.g. `@metaharness/*`), no integrity pin. The `@ruvector/ruvllm` `require` is opt-in (`--embed`) and wrapped in try/catch, lower risk, but same class.
- **Fix:** restrict external templates to an allowlisted scope (`@metaharness/`, or a configured org) by default; require `--allow-untrusted-template` to go outside it; document that external templates run arbitrary code.

### MED-5 — `publish.ts` / `pinJson` SSRF surface via `baseUrl` override; no URL scheme/host validation
- **File:** `/workspaces/agent-harness-generator/packages/create-agent-harness/src/publish.ts:52-68`.
- `baseUrl` defaults to `https://api.pinata.cloud` but is caller-overridable (`PinataConfig.baseUrl`) and concatenated into the fetch URL with the Bearer JWT in the `Authorization` header. If `baseUrl` is ever wired to untrusted config, the **Pinata JWT is sent to an attacker-controlled host** (credential exfiltration / SSRF). Today `publish-cmd.ts` does not expose `--base-url`, so exposure is latent, but the primitive is unsafe. `analyze-repo.ts` (GitHub) — the file does **not** make network calls (inventory is local-file-only, `analyze-repo.ts:107-133`); the docstring mentions GitHub but the code reads local `.github/workflows` presence only. No live SSRF there.
- **Fix:** validate `baseUrl` is `https:` and host is in an allowlist (`api.pinata.cloud` or configured) before attaching the Authorization header; never send the bearer token to a non-allowlisted host.

---

## LOW findings

### LOW-1 — `mcp-scan.ts` HIGH detection has a wildcard-permission bypass
- **File:** `/workspaces/agent-harness-generator/packages/create-agent-harness/src/mcp-scan.ts:105`.
- The wildcard check matches exactly `'*'`, `'mcp__*'`, `'mcp__*__*'`. It **misses** common over-broad forms: `mcp__server__*` is intended-OK, but `Bash(*)`, `Bash`, `mcp__*server`, `*__*`, or a trailing-glob like `mcp__github__*` combined with `Bash(:*)` are not flagged as HIGH. The risky-bash regex (`:108`) only catches a fixed verb list (`rm|curl|wget|sudo|chmod|ssh`) anchored at start; `Bash(node -e ...)`, `Bash(npx ...)`, `Bash(python ...)` — equally dangerous — pass clean. So the scanner can report a green MCP surface that still grants arbitrary code execution.
- **Otherwise the detection is sound:** default-deny (`:73`), allowShell (`:76`), no-approval-gate, no-audit-log, no-timeout, secret-guard (`:112`) are all reasonable HIGH/MED rules and default-deny emission in `analyze-repo.ts:77-86` (`SAFE` policy) is correct.
- **Fix:** broaden the risky-allow detection to flag any `Bash(` rule whose program is not on a safe allowlist; flag any allow ending in unscoped `*`.

### LOW-2 — `federate.ts` trust tier accepts only a fixed set but never validates `endpoint`; `self` tier assignable to any peer
- **File:** `/workspaces/agent-harness-generator/packages/create-agent-harness/src/federate.ts:108-118`.
- Trust validation (`:109`) correctly rejects unknown tiers, so an *invalid* tier cannot slip through. **But** any peer can be added with `trust=self` or `trust=trusted` directly from the CLI with no proof-of-identity — there is no signature, no challenge, no endpoint scheme check. `listPeers({trusted:true})` (`:68-71`) then returns attacker-added peers as trusted. `endpoint` is stored verbatim (`addPeer`, `:53-60`) with no `wss://`/host validation, so a `trusted` peer can point at an arbitrary endpoint that downstream transport code will connect to.
- **Severity rationale:** LOW because federation is local-state config the operator controls; elevation requires the operator to already run the command. But the trust model has no cryptographic binding between `id` and the right to claim a tier.
- **Fix:** require endpoint scheme validation (`wss:`/`https:`); gate `self`/`trusted` assignment behind a verification step (peer key exchange) rather than a free CLI flag.

### LOW-3 — `tarball.ts` truncates long names silently and skips symlink/dir entries without recording the omission
- **File:** `/workspaces/agent-harness-generator/packages/create-agent-harness/src/tarball.ts:73, 49-61`.
- Names >100 bytes are silently truncated (`:73`), and `walkFiles` only emits `e.isFile()` (`:57`) — symlinks are skipped (good, no symlink-in-archive), but a truncated name means the witness sha256 covers a tarball whose entry names differ from the source, weakening the provenance↔source correspondence the witness is supposed to guarantee. Determinism is preserved; *fidelity* is not.
- **Fix:** error out on names that exceed 100 bytes (or implement ustar prefix/GNU long-name) rather than silently truncating an entry referenced by a signed manifest.

### LOW-4 — `mcp-scan.ts` unpinned-deps check is only `low` and misses transitive/`git+`/`file:` specs
- **File:** `/workspaces/agent-harness-generator/packages/create-agent-harness/src/mcp-scan.ts:118-127`.
- Flags `^`/`~`/`latest`/`*` ranges in direct deps only. Misses `git+https://`, `file:`, `http(s)://` tarball, and `npm:alias@` specs — all higher supply-chain risk than a caret range. Transitive pinning (lockfile presence) is not checked at all.
- **Fix:** also flag non-registry specs and recommend a committed lockfile.

---

## Surfaces explicitly cleared (no finding)

- **Command injection in `secrets.ts`:** NOT present — `execFile` argv-array form, no shell. (secrets.ts:33,142,186)
- **Template eval/expansion escape in `renderer.ts`:** NOT present — identifier-only regex, `String()` substitution, no expression engine. (renderer.ts:34)
- **SSRF in `analyze-repo.ts`:** NOT present — `inventory()` reads local files only; no network call despite the docstring mention of GitHub. (analyze-repo.ts:107-133)
- **MCP scanner invalid-tier bypass in `federate.ts`:** the tier *enum* is validated; the gap is identity-binding, not enum bypass. (federate.ts:109)
- **`npm audit --omit=dev`:** 0 vulnerabilities (EXECUTED).
- **Polynomial-regex DoS in `kebab()`:** already remediated (CodeQL #1/#3, documented at analyze-repo.ts:219-228) — verified the regex is now linear.

---

## Gate mapping

| Rule | Condition | Result |
|------|-----------|--------|
| HOLD | HIGH/CRITICAL in security code | **MET** — HIGH-1 (witness gate, security/provenance), HIGH-2 (secret redaction) |
| CONDITIONAL | MEDIUM only | n/a |
| SHIP | none | n/a |

**FINAL GATE: HOLD.** Remediate HIGH-1 (wire and fail-closed the witness verifier — this is the headline) and HIGH-2 (secret-fetch redaction) before this surface can ship. Recommend MED-1..MED-5 in the same cycle since several (MED-3 manifest traversal, MED-4 arbitrary import) compound HIGH-1: with the witness check dead, a tampered manifest's path-traversal and code-execution surfaces have no provenance backstop.
