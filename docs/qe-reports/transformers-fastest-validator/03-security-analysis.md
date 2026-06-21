# Security Analysis — ts-transformer-fastest-validator

| Field | Value |
|-------|-------|
| **Target** | `ts-transformer-fastest-validator` v2.0.0 (npm) |
| **Artifact under review** | `transformer.ts` (802 LOC), `index.ts`, `predefined.d.ts`, `package.json`, `package-lock.json` (lockfileVersion 3), `yarn.lock` |
| **Date** | 2026-06-20 |
| **Analyst** | qe-security-auditor (fleet-b7ee9eba) |
| **Class of artifact** | Compile-time TypeScript custom AST transformer (tsc / ts-patch / ttypescript plugin) |
| **Methodology** | Manual source review + lockfile static analysis (ADR-105 evidence labels applied per finding) |
| **Advisor consult** | Attempted (`advisor-call.cjs`); no provider configured in environment (`exit_code 4`). Severity calibration performed manually against the stated trust boundary. |

---

## Executive Summary

This package is a **compile-time-only** code generator. It hooks into the TypeScript compiler, reads the consumer's own type graph, and emits an object-literal AST that becomes a [fastest-validator](https://github.com/icebob/fastest-validator) schema. It has **no runtime code path, no network surface, no filesystem writes, and no deserialization of external data**. Every byte of input it processes (type definitions, JSDoc comments) is **authored and compiled by the same developer who runs the build**. The conventional web/runtime vulnerability classes (SQLi, XSS, SSRF, auth bypass, secret leakage at runtime) **do not apply** and are explicitly scoped out below rather than fabricated.

The realistic threat model is therefore narrow: (a) **supply-chain** — this package sits in other teams' build pipelines, and (b) **build-time robustness** — pathological self-authored types could crash `tsc`.

**Headline results:**

- **No CRITICAL or HIGH findings.** No injection across a trust boundary, no committed secrets, no ReDoS reachable from untrusted input.
- The most notable item is the **`prepare: ts-patch install` script** (`package.json:7`), which mutates the consumer's local `typescript` install at `npm install` time — an install-time side effect worth documenting in any supply-chain review, but it is the documented and intended mechanism for ts-patch plugins.
- A **dev-only `semver@6.3.0`** (CVE-2022-25883, ReDoS) sits in the transitive dev tree, but **all 323 transitive packages are `dev:true`** and the package declares **zero runtime dependencies and zero peer dependencies**, so nothing in that tree is installed into a consumer's production closure.
- The **JSDoc-tag-name-to-schema-key** path (`transformer.ts:678`) does write attacker-influenceable property names into the generated schema, but the "attacker" would have to be the developer editing their own type definitions — inside the trust boundary — so it is INFORMATIONAL hardening, not a vulnerability.

| Severity | Count | Finding IDs |
|----------|-------|-------------|
| Critical | 0 | — |
| High | 0 | — |
| Medium | 1 | SEC-01 (ts-patch install-time mutation) |
| Low | 3 | SEC-02 (dev-tree semver ReDoS CVE), SEC-03 (compile-time recursion/stack DoS), SEC-04 (ships .ts + .js source) |
| Informational | 2 | SEC-05 (JSDoc tag-name → schema key), SEC-06 (ReDoS surface in JSDoc/numeric regex — benign) |

---

## 1. Threat Model & Trust Boundary

**EVIDENCE: STATIC + INFERRED** (derived from source structure and package manifest).

### Actors

- **Consumer-developer**: writes TypeScript interfaces with JSDoc annotations, calls `convertToSchema<T>()` (`index.ts:1`), and runs `tsc`/`tspc`/`ttsc`. They are *inside* the trust boundary — they already control the build machine and the emitted output.
- **Package maintainer / npm registry**: controls what ships. This is the supply-chain attacker surface — a compromised release or a malicious transitive dep could run code on every consumer's build/CI machine.
- **End user of the consumer's app**: never interacts with this package. The transformer's output (a static validator schema) is baked into the consumer's compiled `.js` at build time; the package itself is not present at runtime.

### Trust boundary

```
  [ untrusted, runtime ]        |  [ trusted, compile-time — this package lives here ]
  ----------------------------- | -------------------------------------------------------
  app end-user input            |  consumer's own .ts type defs + JSDoc
  (validated BY fastest-        |        |  convertToSchema<T>()  -> transformer.ts
   validator, NOT by this pkg)  |        v
                                |  generated object-literal AST (static schema)
```

The decisive fact for severity calibration: **no untrusted/external data crosses into `transformer.ts` at the time it runs.** The transformer's inputs are the TypeScript type symbols (`transformer.ts:43-44`) and JSDoc tags (`transformer.ts:107`, `:309`) of the consumer's own source. Consequently, classic "injection" framing collapses to "can a developer mis-author their own type and get a surprising schema?" — a correctness/footgun question, not a security boundary crossing.

The two boundaries that *do* matter:

1. **Supply-chain boundary** — installing this package (and running its `prepare` script) executes maintainer-controlled code on the consumer's build host. Covered by SEC-01, SEC-02, SEC-04.
2. **Build-availability boundary** — a pathological self-authored type can hang or crash `tsc`. Self-inflicted DoS only. Covered by SEC-03.

---

## 2. Findings

### SEC-01 — `prepare: ts-patch install` mutates the consumer's local TypeScript at install time

- **Severity:** Medium (qualitative; CVSS-style ~4.0 — local, high-privilege-already, install-time)
- **Likelihood:** N/A as an *exploit* (it is intended behavior); **certainty of the side-effect: 100%**
- **Impact:** Install-time code execution + mutation of the shared `typescript` binary in the consumer's `node_modules`.
- **Evidence:** `package.json:7` — `"prepare": "ts-patch install"`. `ts-patch@3.3.0` resolved at `package-lock.json` (`node_modules/ts-patch`, integrity `sha512-zAOzDnd5qsf...`). **EVIDENCE: STATIC** (manifest + lockfile).
- **Analysis:**
  - `prepare` runs automatically on `npm install` (both for the package's own dev install and, historically, when installed from a git URL; for a normal registry install of a *dependency*, npm does **not** run the dependency's `prepare`, but the README instructs consumers to wire ts-patch/ttypescript into their own build, so equivalent patching happens in the consumer pipeline by design).
  - `ts-patch install` patches the consumer's local `typescript` package so that custom transformers declared in `tsconfig.json` `plugins` are honored. This is the documented, intended mechanism — not a backdoor — but it is a **build-host-level mutation** that a supply-chain reviewer must be aware of: any future compromise of `ts-patch` (or this package's `prepare` line) would execute on every build.
  - `ts-patch` pulls its own sub-tree (`chalk`, `global-prefix`, `minimist@^1.2.8`, `resolve`, `semver`, `strip-ansi`) — all `dev:true` here, but live in the consumer's build when they adopt ts-patch.
- **Remediation:**
  - Document prominently that adopting this transformer entails running `ts-patch` against the local TypeScript install; recommend consumers pin `ts-patch` and `typescript` and review `prepare`/lifecycle scripts.
  - For defense-in-depth in CI, consumers can install with `npm ci --ignore-scripts` and run `npx ts-patch install` explicitly as a reviewed, auditable step.
  - Maintainer: keep `ts-patch` in `devDependencies` (already the case — it is not a runtime/peer dep), and consider documenting the minimum-trust install path in the README.

---

### SEC-02 — Vulnerable `semver@6.3.0` (CVE-2022-25883, ReDoS) in the transitive **dev** tree

- **Severity:** Low (dev-only; not in any consumer's production closure)
- **Likelihood:** Low — requires feeding attacker-controlled version ranges to `semver` during the maintainer's own build/CI; not reachable by consumers of the published package.
- **Impact:** ReDoS (CPU exhaustion) in the maintainer's build tooling only.
- **Evidence:** `package-lock.json` `node_modules/semver` v**6.3.0** (line ~3797, `"dev": true`), and `node_modules/jest-snapshot/node_modules/semver` v**7.3.7** (line ~3096, `"dev": true`). CVE-2022-25883 affects `semver < 6.3.1` and `< 7.5.2`; both of these are vulnerable. A patched `node_modules/ts-patch/node_modules/semver@7.7.2` (line ~4098) also exists. **EVIDENCE: STATIC** (lockfile).
- **Analysis:** Confirmed via lockfile parse that **all 323 non-root packages carry `"dev": true`** and `package.json` declares **no `dependencies` and no `peerDependencies`**. Therefore none of this tree — including the vulnerable `semver` copies — is installed when a consumer runs `npm install ts-transformer-fastest-validator`. The exposure is limited to the maintainer's own dev environment.
- **Remediation:**
  - Run `npm audit fix` / bump `jest` and `ts-patch` lines to pull `semver >= 7.5.2` (and `>= 6.3.1`) to keep the dev tree clean and avoid false positives in downstream `npm audit` of forks.
  - Add a CI `npm audit --omit=dev` gate to prove production closure stays empty, plus a separate non-blocking dev-audit.

---

### SEC-03 — Unbounded compile-time recursion / stack exhaustion on pathological self-authored types

- **Severity:** Low (self-inflicted build-time DoS; no cross-boundary impact)
- **Likelihood:** Low — requires the developer to author a deeply nested / large union/intersection type that survives TypeScript's own structural de-duplication.
- **Impact:** `tsc` stack overflow or long compile (availability of the developer's own build).
- **Evidence:** Recursion entry `convert()` (`transformer.ts:54`) re-enters via `convertObject` (`:306`), `convertArray` (`:270`), `convertUnion` (`:443`, `:457`), `convertIntersection` (`:527`, `:532`). The only depth guard is the `history: Set` (`transformer.ts:59`), used as a **circular-reference** guard, **not** a depth limiter. **EVIDENCE: STATIC** (control-flow read).
- **Analysis of the circular-ref guard soundness:**
  - `convertObject` adds the type's `name` to `history` (`:296`), recurses into properties (`:306`), then `history.delete(name)` (`:326`). A named type that references itself (`interface A { a: A }`) is caught at `:292` (`history.has(name)` → emits `{ type: 'any' }`), which is **sound for named self-reference**.
  - **Anonymous `__type` is explicitly excluded** at `:292` (`name !== '__type'`). The reasoning in the prompt is correct to flag this: an anonymous object literal type (`{ a: { a: { a: ... } } }`) is never added to the guard set in a way that blocks re-entry, because each nesting is a *distinct* `__type` symbol. **However**, in practice TypeScript's own type system materializes such a structure to a finite depth — a *recursive* anonymous type (`type T = { a: T }`) is represented by the checker as a single circular `Type` object whose property `a` resolves back to the same `Type` reference, and a genuinely infinite anonymous expansion is rejected by the checker before this transformer ever sees it. So unbounded re-entry via `__type` is **not** trivially reachable; the realistic failure mode is **deep-but-finite** nesting (hand-written or generated 10k-deep types) causing native stack overflow in the recursive descent. **EVIDENCE: INFERRED** (no executed repro performed; routed as INFERRED per ADR-105).
  - `convertUnion`/`convertIntersection` add `undefined`/`name` to `history` (`:439`, `:502`) and `convertIntersection` deletes inside the map loop (`:559`); the bookkeeping is asymmetric across helpers (e.g. `convertUnion` adds `undefined` at `:439` but never deletes it within that call), but because `history` size only gates `$$root` emission and named-cycle detection, the asymmetry is a **correctness smell**, not an unbounded-growth bug.
  - Exponential blowup: a wide union/intersection of N members each referencing M shared sub-types is converted per-occurrence (no memoization of generated AST), so output size can be super-linear in the type graph. Again: build-time cost borne by the developer, on their own input.
- **Remediation:**
  - Add an explicit depth counter (e.g. `depth > 100 → emit { type: 'any' }` with a compiler diagnostic) alongside the `history` set, so a malformed/huge type degrades gracefully instead of crashing `tsc`.
  - Memoize converted sub-schemas by type id to bound output size on wide graphs.
  - Make the `history` add/delete lifecycle symmetric across all `convert*` helpers to remove the bookkeeping smell.

---

### SEC-04 — `files` whitelist ships both `.ts` source and compiled `.js`

- **Severity:** Low (information exposure / minor supply-chain surface)
- **Likelihood:** N/A (it is what it is); **impact is low.**
- **Impact:** Both `transformer.ts`/`index.ts` and `transformer.js`/`index.js` are published (`package.json:29-35`). Shipping source `.ts` is intentional and required here (ttypescript/ts-patch consumers reference `.../transformer`, which resolves to the source). No secret or internal-only logic is exposed. The minor concern is a larger published attack surface (two parseable copies of the same logic) and the general supply-chain principle of shipping only what is needed.
- **Evidence:** `package.json:29-35` lists `index.js, index.ts, transformer.js, transformer.ts, predefined.d.ts`. `.gitignore` ignores `*.js` (so `.js` are build artifacts, not committed) — confirmed only `jest.config.js` is git-tracked. **EVIDENCE: STATIC**.
- **Remediation:** Acceptable as-is for a transformer that must ship source. Optionally publish a provenance attestation (`npm publish --provenance`) so consumers can verify the `.js`/`.ts` pair was built from the tagged commit, closing the "is the shipped `.js` actually the compiled `.ts`?" gap.

---

### SEC-05 — JSDoc tag name becomes a raw schema key (`createPropertyAssignment(anyAnno.name, …)`)

- **Severity:** Informational (no trust boundary crossed)
- **Likelihood:** N/A — the "attacker" is the developer authoring their own type.
- **Impact:** A JSDoc annotation on the consumer's own type can introduce arbitrary keys into the generated fastest-validator schema, including ones that change validation semantics (`type`, `$$root`, `optional`, `nullable`, custom validator keys).
- **Evidence:** `applyJSDoc` (`transformer.ts:644-693`): every annotation is mapped to `factory.createPropertyAssignment(anyAnno.name, literalValue)` at `:678`, where `anyAnno.name` is the **raw tag name** extracted in `extractJsDocTagInfos` (`:748-761`, `:773-781`, `:794-796`). There is **no allow-list** of permitted fastest-validator keys and **no collision check** against keys the converter already emitted (`type`, `value`, `$$root`, `items`, `props`, …). So a developer writing `/** @type evil */` or `/** @$$root true */` on a property can override the converter-emitted `type`/`$$root` (the annotation properties are appended *after* the base properties at `:682`, and fastest-validator's last-write-wins object semantics let the JSDoc value take effect).
- **Analysis:** Because the JSDoc lives on the developer's own interface and the developer also controls the call site, this is a **footgun / correctness** issue, not a privilege or boundary violation — there is no scenario where a *third party* supplies the JSDoc. It is filed Informational so it is not over-stated as a vulnerability, but it is worth hardening because a mistaken or copy-pasted annotation could silently weaken a validator (e.g. an accidental `@optional true` or `@type any`) and validators are security-relevant downstream.
- **Remediation (hardening, not urgent):**
  - Restrict `applyJSDoc` to a known allow-list of fastest-validator rule keys (or a documented namespace prefix), and emit a compiler diagnostic for unknown/reserved tags rather than silently injecting them.
  - Reject or warn when a JSDoc tag would override a converter-emitted structural key (`type`, `$$root`, `props`, `items`).

---

### SEC-06 — ReDoS / parsing-safety review of the JSDoc and numeric regexes (benign)

- **Severity:** Informational (no exploitable backtracking; input is in-boundary regardless)
- **Likelihood:** Negligible.
- **Impact:** None demonstrated.
- **Evidence & analysis:** **EVIDENCE: STATIC** (regex structure analysis).
  - **JSDoc tag regex** `/@([\$\w]+)\s+([^\s*]+)/g` (`transformer.ts:791`, in the leading-comment fallback path): both capture groups are **single, non-nested character classes** with simple greedy quantifiers over *disjoint* alphabets (`[\$\w]+` then a literal-ish run `[^\s*]+`). There is no `(a+)+`, no overlapping alternation, no nested quantifier — so it runs in **linear time**; no catastrophic backtracking. Worst case is O(n) over a pathologically long comment, which is bounded by the developer's own source file size. Pathological input (e.g. a 10MB comment with no whitespace) would cost linear CPU only.
  - **Numeric-detection regex** `/^[+-]?\d+(?:\.\d+)?$/` (`transformer.ts:665`): fully **anchored** (`^…$`), single optional sign, one `\d+`, one optional `(?:\.\d+)?` group — classic linear, **ReDoS-safe**. The downstream handling (`:666-673`) correctly splits sign vs. magnitude and builds a `PrefixUnaryExpression` for negatives; no injection because the value is parsed into a numeric AST node, not concatenated as text.
  - The regexes are also only ever fed the developer's own JSDoc/comment text (`extractJsDocTagInfos` reads `decl.getSourceFile().getFullText()` at `:786-787`), so even a true ReDoS would be self-inflicted at compile time. Both vectors are therefore benign.
- **Remediation:** None required. (Optional: cap comment length scanned in the fallback path for belt-and-suspenders.)

---

## 3. Non-issues / Out of Scope (explicitly NOT findings)

These are listed so the report does not over-state risk for a compile-time tool:

| Item | Why it is a non-issue |
|------|----------------------|
| **SQL injection / NoSQL injection** | No database, no query construction anywhere in the codebase. |
| **XSS / HTML / template injection** | No HTML/DOM/template rendering; output is a TypeScript AST object literal. |
| **SSRF / outbound network** | No `http`, `fetch`, socket, or URL fetch in `transformer.ts` or `index.ts`. The `IUrl`/`url` (`predefined.d.ts:4`, `index.ts` mapping) is a *fastest-validator rule name string*, not a request. |
| **Authentication / authorization / session** | None present; not an auth-bearing component. |
| **Runtime code injection via generated schema** | The generated object literal is data (rules + literal values via `factory.createStringLiteral`/`createNumericLiteral`), not `eval`'d code. No `eval`, `Function`, `vm`, or `child_process` in the source. |
| **Deserialization of untrusted data** | No `JSON.parse`/`require` of external input at the transformer's runtime; inputs are TS compiler symbols. |
| **Secrets / credentials committed** | Grep for AWS keys, PEM blocks, `ghp_`/`npm_` tokens, and `password/secret/api_key` assignments across `*.ts/*.js/*.json/*.yml` returned **nothing**; no `.env`/`credential` files are git-tracked. `.travis.yml` contains only a Node version. **EVIDENCE: EXECUTED** (grep). |
| **End-user input validation by this package** | This package *generates* a validator; it never validates untrusted runtime input itself — that is fastest-validator's job in the consumer's app. |
| **Prototype pollution in the transformer** | `predefined.hasOwnProperty(name)` (`transformer.ts:75`) is used for the predefined lookup (safe own-property check); object construction is via the TS factory, not by writing to arbitrary `obj[key]` at the transformer's own runtime. (Note: SEC-05's arbitrary *generated* keys are a separate, in-boundary correctness concern, not pollution of this process.) |

---

## 4. Remediation Priority (for maintainer)

1. **(Low effort, do first)** Bump dev deps to clear `semver@<7.5.2`/`<6.3.1` from the dev tree (SEC-02); add `npm audit --omit=dev` CI gate.
2. **(Hardening)** Add an allow-list / reserved-key guard in `applyJSDoc` (SEC-05) so accidental or unknown JSDoc tags cannot silently weaken a generated validator.
3. **(Robustness)** Add an explicit recursion-depth cap + memoization in `convert*` (SEC-03) to fail gracefully on huge/deep types.
4. **(Supply-chain transparency)** Document the `ts-patch install` install-time behavior in the README and publish with `--provenance` (SEC-01, SEC-04).

---

## 5. Evidence Ledger (ADR-105)

| Finding | Evidence class | Artifact |
|---------|----------------|----------|
| Secrets scan (none) | EXECUTED | `grep -rnIE '(AKIA…|PRIVATE KEY|ghp_…|password\|secret\|api_key)'` → no hits; `git ls-files` → no env/secret files |
| Dev-only tree, zero runtime deps | EXECUTED + STATIC | lockfile parse: 323/323 `dev:true`; `package.json` `dependencies={}`, `peerDependencies={}` |
| `semver@6.3.0` / `7.3.7` vulnerable | STATIC | `package-lock.json` lines ~3797, ~3096 |
| `prepare: ts-patch install` | STATIC | `package.json:7` |
| JSDoc tag → schema key | STATIC | `transformer.ts:678`, `:644-693`, `:748-796` |
| Regex linearity | STATIC | `transformer.ts:665`, `:791` |
| Recursion guard / `__type` exclusion | STATIC + INFERRED | `transformer.ts:292`, `:296`, `:326`; deep-nesting stack-overflow reachability is INFERRED (no executed repro) |
| `files` ships `.ts`+`.js` | STATIC | `package.json:29-35`; `.gitignore` `*.js` |

*Advisor consult was attempted per protocol but no provider was configured in the environment; severity calibration was performed manually against the compile-time / self-authored trust boundary.*
