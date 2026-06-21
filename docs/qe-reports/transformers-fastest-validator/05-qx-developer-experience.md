# QX / Developer-Experience & Product Report — `ts-transformer-fastest-validator`

| Field | Value |
|-------|-------|
| **Target** | `ts-transformer-fastest-validator` (published npm package, v2.0.0) |
| **Type** | TypeScript custom AST transformer (compile-time) |
| **Primary users** | TypeScript developers wiring this into `tsconfig.json` to auto-generate [fastest-validator](https://github.com/icebob/fastest-validator) schemas from interfaces (often with Moleculer) |
| **Report** | 05 — Quality Experience / Developer Experience & Product |
| **Date** | 2026-06-20 |
| **Analyst** | qe-qx-partner (QE swarm fleet-b7ee9eba, queen-led) |
| **Method** | Static source review of `README.md`, `package.json`, `index.ts`, `predefined.d.ts`, `transformer.ts`, `.travis.yml`, `test/*.spec.ts` + git history (ADR-105 evidence class: **STATIC**, no build/runtime executed) |

> **QX philosophy applied:** *"Quality is value to someone who matters."* The someone here is a TypeScript developer who has already decided custom transformers are worth the pain. This report assesses whether the product's onboarding, API, errors, docs, and maturity signals deliver that value — or leak it.

---

## Executive Summary

The package solves a genuinely useful problem (type-driven validation schemas) and the **engine is more capable than its docs admit** — it supports unions, intersections, enums, arrays, recursion guards, Buffers, 8 predefined validator types, and at least 6 JSDoc annotations. But almost none of that surface is discoverable from the README, and the parts a new user touches *first* are the parts that are broken or inconsistent. The result is a product whose **internal quality outruns its experienced quality** — a classic QX gap.

The five most damaging DX issues, in priority order:

1. **The "How to use directly" snippet does not run** — `import Validator from 'fastest'` is the wrong package name (should be `fastest-validator`). The very first copy-paste a user makes fails. (`README.md:13`)
2. **Setup instructions contradict the package itself** — README documents `ttypescript`, but `package.json` ships a `ts-patch install` prepare hook. A user following the README configures the wrong toolchain. (`README.md:47`, `package.json:7`)
3. **Predefined types are half-undiscoverable and half-broken at the type level** — the transformer recognizes 8 predefined types but `predefined.d.ts` only exports 5. `ICurrency`, `IMac`, `IObjectID` work at transform-time but have no importable declaration, so `import { ICurrency } from '.../predefined'` is a `tsc` error. (`predefined.d.ts:1-5` vs `transformer.ts:3-12`)
4. **Error experience during compilation is effectively undebuggable** — unsupported types abort `tsc` with bare `throw Error('Unknown type')` and `"Can't intersect literal or primitive!"`: no type name, no file, no line, no offending symbol. (`transformer.ts:103`, `:498`)
5. **Documentation defers the entire feature surface to the test folder** — "Take a look at tests for all possibilities." There is no list of supported types, no list of the 6+ JSDoc annotations, no `convertToSchema` API contract, no CHANGELOG. (`README.md:64-66`)

A secondary but real trust problem: the build badge points at **travis-ci.org**, which has been shut down — the badge is permanently broken/red regardless of actual code health, and `.travis.yml` is a dead config (the project no longer runs Travis). The npm metadata, MIT license, and repo links are otherwise clean.

**Overall QX verdict: 2.6 / 5 — "Powerful engine, leaky funnel."** Most issues are cheap-to-fix documentation/declaration defects with disproportionate experience impact. Fixing items 1–5 above is < 1 day of work and would lift the experienced quality close to the actual code quality.

---

## QX Scorecard

| Dimension | Score (1–5) | One-line justification |
|-----------|:-----------:|------------------------|
| **Onboarding / Setup** | **2 / 5** | First snippet has a wrong import; README toolchain (`ttypescript`) contradicts shipped one (`ts-patch`); transformer wiring is inherently hard and docs barely mitigate it. |
| **API Ergonomics** | **3 / 5** | Single clean entry point `convertToSchema<T>()` is elegant *to call*, but returns `any` (zero result typing), is "magic" (no body, compile-time only), and 3 of 8 predefined types are un-importable. |
| **Error Experience** | **1 / 5** | Unsupported types throw bare `Error` strings during `tsc` with no type/file/line/symbol context — among the worst possible failure modes for a compile-time tool. |
| **Documentation** | **2 / 5** | README defers the whole feature catalogue to `test/`; no annotation list, no predefined-type list, no API contract, no CHANGELOG, no error-troubleshooting. |
| **Trust / Maturity** | **2.5 / 5** | v2.0.0, MIT, valid repo/npm links, real test suite (10 specs) — but a permanently broken Travis-CI badge and dead `.travis.yml` actively signal abandonment. |
| **Weighted overall** | **≈ 2.6 / 5** | Strong engine undermined by first-touch friction and silent feature surface. |

---

## Detailed Findings

### 1. Onboarding / Setup UX — **2 / 5**

**Custom TS transformers are a hostile onboarding context to begin with.** The README honestly concedes this: *"Unfortunately, TypeScript itself does not currently provide any easy way to use custom transformers"* (`README.md:45`). That candor is good QX. The problem is that the docs then *increase* friction instead of mitigating it.

**Finding 1a — Broken first snippet (HIGH).**
`README.md:13` shows:
```ts
import Validator from 'fastest';
```
`fastest` is not the dependency. The package is `fastest-validator` (`package.json:40`, and every test uses `require('fastest-validator')`, e.g. `test/types.spec.ts:3`). A developer copy-pasting the headline example gets `Cannot find module 'fastest'`. This is the single worst onboarding defect because it sits at step one of the happy path.

**Finding 1b — Toolchain contradiction (HIGH).**
The README's only setup section is **"### For ttypescript"** (`README.md:47`) and tells users to follow *ttypescript*'s README. But the shipped `package.json` declares:
```json
"prepare": "ts-patch install"   // package.json:7
"ts-patch": "^3.3.0"            // package.json:43
```
`ts-patch` and `ttypescript` are *different* tools with *different* wiring (`ts-patch` patches `tsc` in place; `ttypescript` is a wrapper binary). Git history shows the maintainer churned on this (`4795a81 remove tspatch`, `81bf521 revert prepare`), which strongly suggests the README was never reconciled with the final `ts-patch` decision. A user reading the README will configure the wrong half of the setup and the transformer will silently not run — producing the worst class of bug for this tool: **no error, just untransformed `convertToSchema` calls returning the phantom `any`.**

**Finding 1c — No "verify it worked" step (MEDIUM).**
Because `convertToSchema` is compile-time-only, a misconfigured plugin fails *silently* (the call is left in place and resolves to `index.ts`'s `declare`d stub returning `any`). The docs give the user no smoke test ("compile this, expect this output") to confirm the transformer is actually firing. For a tool whose #1 failure mode is "not wired up," the absence of a verification step is a notable gap.

**Mitigations the README is missing:** a copy-paste-correct minimal repo, the actual `ts-patch install` step, a note that runtime tools (ts-node, jest, webpack/ts-loader) each need their own transformer registration, and a "how to confirm the transform ran" snippet.

---

### 2. API Ergonomics — **3 / 5**

**The call site is genuinely elegant.** A single generic function, `convertToSchema<IUser>()`, with the type as the only input and the schema as output, is about as clean as a type-driven API gets. Credit where due.

**Finding 2a — Result is untyped `any` (MEDIUM).**
`index.ts` is one line:
```ts
export declare function convertToSchema<T>(): any;
```
The return is `any`. Downstream, the developer gets zero IntelliSense or type-safety on the generated schema object, and no compile-time guarantee it conforms to fastest-validator's `ValidationSchema`. A `ValidationSchema` return type (fastest-validator ships one) would cost nothing and add real ergonomics.

**Finding 2b — "Magic" generic with no runtime body (MEDIUM).**
`convertToSchema` is `declare`d only — there is no implementation; the transformer rewrites the call AST at compile time (`transformer.ts:42-44`). This is intrinsic to how TS transformers work, but it is surprising: the function "exists" for the type checker yet has no JS to step into. If the transformer is not wired up, the call survives to runtime and there is **no body to throw**, so the failure is invisible (see 1b). The docs never explain this mental model.

**Finding 2c — Predefined types are under-discoverable AND partially un-importable (HIGH).**
The transformer's `predefined` map recognizes **8** types (`transformer.ts:3-12`):
`ICurrency, IDate, IEmail, IForbidden, IMac, IUrl, IUUID, IObjectID`.
But `predefined.d.ts` only exports **5**:
```ts
export interface IDate extends Date {}
export interface IEmail extends String {}
export interface IForbidden {}
export interface IUrl extends String {}
export interface IUUID extends String {}
```
`ICurrency`, `IMac`, and `IObjectID` have **no exported declaration**. A developer who learns they exist (only by reading `transformer.ts`) and writes `import { ICurrency } from 'ts-transformer-fastest-validator/predefined'` gets a `tsc` "no exported member" error. So three working features are reachable only by *manually re-declaring the interface themselves* — a real, file-cited DX gap with a one-line fix (add the 3 missing exports).

Worse, the predefined types are *only* discoverable by importing from a side-path (`'../predefined'` in tests, e.g. `test/annotations.spec.ts:8`), and that path is never mentioned in the README at all.

**Finding 2d — JSDoc annotation support is invisible (HIGH).**
The transformer supports rich per-property and per-type annotations via JSDoc (`applyJSDoc`, `transformer.ts:644-693`; `@$$strict` root handling). The test suite exercises at least: `@$$strict`, `@convert`, `@empty`, `@numeric`, `@positive`, `@min` (grep of `test/*.spec.ts`), plus the generic mechanism passes through *any* tag name as a fastest-validator rule. This is the package's most powerful feature — and the README mentions it **zero times**. A user cannot discover that `/** @min 6 */` on a property even works without reading the test files.

---

### 3. Error Experience — **1 / 5**

This is the weakest dimension and the one most likely to make a developer rage-quit.

**Finding 3a — `throw Error('Unknown type')` with no context (HIGH).**
`transformer.ts:103`:
```ts
} else {
  throw Error('Unknown type');
}
```
When a user references a type the transformer can't map (e.g. a tuple, a function type, a generic mapped type it doesn't handle, a `Record<>`, `Map`, `Set`, etc.), the **entire `tsc` compile aborts** with the literal string `Unknown type`. There is:
- no type name (the `typeChecker.typeToString(type)` is right there and unused),
- no file/line (the `node` carries position info that is discarded),
- no offending interface/property name,
- no hint about *which* of the developer's many `convertToSchema` calls triggered it.

For a compile-time tool, this is close to a worst-case failure mode: a wall of TypeScript stack trace pointing into the transformer's internals, not the user's source. **Diagnosability: very poor.** The fix is cheap — interpolate `typeChecker.typeToString(type)` and the node's source position into the message.

**Finding 3b — `"Can't intersect literal or primitive!"` (HIGH, same class).**
`transformer.ts:498` throws when an intersection includes a primitive/literal — again with no type name, file, or line. The message at least hints at the cause, but the user still has to binary-search their own codebase to find which intersection.

**Finding 3c — `'Unknown literal type ' + value` (LOW).**
`transformer.ts:726` does include the value, which is marginally better, but still no source location.

**Net:** because these are `throw`s inside a compiler plugin (not `tsc` diagnostics with a `DiagnosticCategory`), they bypass TypeScript's normal, IDE-friendly error reporting entirely. The developer experiences a crash, not a diagnostic.

---

### 4. Documentation Completeness — **2 / 5**

**Finding 4a — Feature catalogue outsourced to tests (HIGH).**
`README.md:64-66`:
> ### What can be transformed
> Take a look at [tests](...) for all possibilities.

The README documents *two* usage snippets and then sends the user to read 10 `.spec.ts` files to learn what the tool actually supports. The real, demonstrable feature surface that is **never documented in prose** includes: primitives, literals (→ `equal`), enums, arrays, `Buffer`, unions (→ `multi`/`enum`), intersections (object merge), `optional`/`nullable` via `?`/`| null`/`| undefined`, recursion guards, 8 predefined types, and 6+ JSDoc annotations. That is a substantial product hidden behind "look at the tests."

**Finding 4b — No annotation reference, no predefined-type reference (HIGH).** As established in 2c/2d, the two highest-leverage features have no documented list.

**Finding 4c — No API contract for `convertToSchema` (MEDIUM).** No documentation of the generic constraint, what `T` may be, what shape comes back, or that it is compile-time-only.

**Finding 4d — No CHANGELOG / no migration notes (MEDIUM).** The package is at v2.0.0 (a major), implying a breaking change from v1, but there is no CHANGELOG, no release notes, and no "upgrading from v1" guidance. Users upgrading are flying blind.

**Finding 4e — No troubleshooting section (MEDIUM).** Given that the #1 failure (transformer not wired) is silent and the #2 (unsupported type) is a cryptic crash, the absence of any "if it didn't work, check X" section compounds findings 1 and 3.

---

### 5. Product Maturity & Trust Signals — **2.5 / 5**

**Finding 5a — Dead CI badge / dead CI config (HIGH for trust).**
`README.md:72-73` and the header badge point to:
```
https://travis-ci.org/ipetrovic11/ts-transformer-fastest-validator.svg
```
**travis-ci.org was shut down** (Travis migrated to travis-ci.com and the `.org` host no longer serves builds). The badge is therefore permanently broken/unknown regardless of real code health — a negative trust signal at the top of the README. The `.travis.yml` (`node_js: ['16']`) is a dead config: node 16 is EOL and the project's actual `package.json` test path is `tsc … && jest --coverage`, with no evidence Travis still runs it. **Net effect: the most prominent "is this maintained?" signal a developer sees is red/stale.**

**Finding 5b — Positive maturity signals (credit).**
- Valid npm version badge and downloads badge (`README.md:1,3`) — real, working trust signals.
- MIT license, present and declared (`package.json:25`).
- Working `repository`, `bugs`, and `homepage` links (`package.json:14-36`).
- A real, non-trivial test suite: 10 spec files covering interfaces, arrays, enums, unions, intersections, never, root, annotations, types (`test/`). This is the strongest maturity signal the package has and is *underused* — it should be surfaced as documentation, not just CI.
- Modern toolchain pins: TypeScript 5.6.3, ts-patch ^3.3.0, jest 28 (`package.json:37-45`).

**Finding 5c — Version/release hygiene gap (MEDIUM).** v2.0.0 with no CHANGELOG and a README that still references the abandoned `ttypescript` path suggests docs were not part of the v2 release checklist.

---

## Rule-of-Three Failure-Mode Analysis (for the top issue)

Per QX practice, the highest-impact issue gets ≥3 distinct failure modes enumerated.

**Issue: "Setup looks done but the transformer never runs" (combines Findings 1a + 1b + 2b).**

1. **Wrong package import** — user copies `import Validator from 'fastest'`; build fails immediately with a module-not-found that is *unrelated* to the transformer, sending them debugging the wrong thing.
2. **Wrong toolchain** — user follows the README's `ttypescript` path while the package expects `ts-patch`; compile *succeeds*, but `convertToSchema<T>()` is left untransformed and resolves to the `declare`d stub returning `any` — validation silently passes everything, a latent production data-integrity bug.
3. **Right toolchain, wrong consumer** — user wires `ts-patch` for `tsc` but runs tests/dev via `ts-node`/`jest`/`ts-loader`, none of which inherit the plugin automatically; transformer runs in build but not in test, producing confusing environment-dependent behavior with no error in either.

All three fail *silently or misleadingly* — none surfaces a message that names the real cause. This is why Onboarding scores a 2 despite the engine being solid.

---

## Oracle Problems Detected

| # | Oracle problem | Type | Why it matters |
|---|----------------|------|----------------|
| O1 | "Did the transformer actually run?" has **no observable success criterion** for the user. | Unclear success / missing info | The happy path and the broken path can look identical until runtime validation misbehaves. The product offers no oracle. |
| O2 | Supported-type surface is defined **only by the test suite**, not by a spec. | Unclear acceptance criteria | A user cannot tell whether an unsupported type is a bug or out-of-scope; the only oracle is "try it and see if `tsc` crashes." |

---

## Prioritized DX-Improvement Backlog

| Priority | Item | Files | Effort | Experience impact |
|:--------:|------|-------|:------:|-------------------|
| **P1** | Fix the broken first snippet: `'fastest'` → `'fastest-validator'`. | `README.md:13` | Trivial | Unblocks the entire happy-path first impression. |
| **P1** | Reconcile setup docs with shipped toolchain: replace/augment the `ttypescript` section with the actual `ts-patch install` flow (and note ts-node/jest/webpack registration). | `README.md:47-62`, `package.json:7` | Low | Eliminates the silent "transformer never ran" trap. |
| **P1** | Export the 3 missing predefined types so they're importable. | `predefined.d.ts` (+`ICurrency,IMac,IObjectID`) | Trivial | Makes 3 working features actually usable without manual re-declaration. |
| **P1** | Turn the bare `throw`s into context-rich messages (type name + source file/line). Ideally emit as `tsc` diagnostics, not exceptions. | `transformer.ts:103`, `:498`, `:726` | Low–Med | Transforms the error experience from "crash" to "actionable." |
| **P2** | Document the feature surface in prose: a table of supported TS constructs → fastest-validator rule, instead of "see tests." | `README.md:64-66` | Med | Surfaces the product's real value. |
| **P2** | Document the JSDoc annotation mechanism + a reference list (`@$$strict`, `@convert`, `@empty`, `@numeric`, `@positive`, `@min`, and "any tag passes through"). | `README.md` (new section) | Low–Med | Exposes the most powerful, currently-invisible feature. |
| **P2** | Replace the dead Travis badge with the real CI (GitHub Actions) badge; delete or update `.travis.yml`. | `README.md:1,72-73`, `.travis.yml` | Low | Repairs the top-of-README "is this alive?" trust signal. |
| **P2** | Type the return: `convertToSchema<T>(): ValidationSchema<T>` (or at least `ValidationSchema`). | `index.ts`, `predefined.d.ts` | Low | Restores downstream type-safety/IntelliSense. |
| **P3** | Add a "Verify the transformer ran" smoke-test snippet to the README. | `README.md` | Low | Gives users the missing success oracle (O1). |
| **P3** | Add a CHANGELOG and a brief "v1 → v2" upgrade note. | new `CHANGELOG.md` | Low | Closes the major-version release hygiene gap. |
| **P3** | Add a Troubleshooting section keyed to the two top failure modes (silent no-op; `Unknown type` crash). | `README.md` | Low | Compounding fix that ties findings 1+3 together. |

**Sequencing note:** the four P1 items are < 1 day combined and would move Onboarding 2→4, API Ergonomics 3→4, and Error Experience 1→3 — i.e. the cheapest possible path from "powerful but frustrating" to "pleasant."

---

## Evidence Classification (ADR-105)

| Finding class | Findings | Basis |
|---------------|----------|-------|
| **STATIC** (derived from source/data) | All findings 1a–5c | Direct reading of source files and git log; line-cited. |
| **INFERRED** (reasoning, not executed) | Silent-failure runtime behavior (1b/2b/O1); exact set of types that trigger `Unknown type` | Reasoned from `index.ts` `declare` stub + transformer control flow; **not** reproduced via an actual `tsc` run. |
| **NOT executed** | No build, no `tsc`, no `jest` run was performed in this review. | Quality gates that require EXECUTED evidence (e.g. "snippet fails to compile") should be confirmed by a real `tsc` reproduction before being treated as verified fact. |

> Recommended verification follow-up for the swarm: an EXECUTED reproduction that (a) compiles the README's "direct" snippet to confirm the `'fastest'` import error, (b) wires `ts-patch` vs `ttypescript` to confirm the silent-no-op, and (c) feeds an unsupported type (e.g. `Record<string,number>` or a tuple) to capture the actual `Unknown type` stack trace.

---

*Report generated by qe-qx-partner — QE swarm fleet-b7ee9eba. Scope: developer-experience & product quality. Evidence class: STATIC + INFERRED (no build/runtime executed).*
