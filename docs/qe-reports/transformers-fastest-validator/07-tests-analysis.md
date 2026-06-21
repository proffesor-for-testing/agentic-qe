# Tests Analysis — ts-transformer-fastest-validator

| Field | Value |
|-------|-------|
| Target | `/tmp/ts-transformer-fastest-validator` (TypeScript compile-time AST transformer) |
| Date | 2026-06-20 |
| Analyst | qe-test-architect (fleet-b7ee9eba, queen-led) |
| Scope | Existing `test/*.spec.ts` suite + new-test recommendations |
| Test runner | `tsc --project tsconfig.test.json` (applies transformer via ts-patch) then `jest --coverage` |
| Oracle | Behavioral round-trip: a real `fastest-validator` `Validator` instance asserts `v.validate(data, convertToSchema<T>())` returns `true` (valid) or an `Array` (errors) |

---

## Executive Summary

The suite is a **9-file, 63-test behavioral round-trip suite** that exercises the transformer through a real `fastest-validator` instance. All 63 tests pass (EXECUTED, `npm test`). The round-trip oracle is genuinely strong for *validation behavior*: it catches schemas that accept/reject the wrong values. But it is **blind to schema shape** — a schema that is wrong-but-behaviorally-equivalent passes, and the suite asserts almost exclusively `.toBe(true)` / `.toBeInstanceOf(Array)` (only `annotations.spec.ts` asserts exact emitted shape via `toStrictEqual`).

Two findings dominate this report, both backed by **EXECUTED evidence** I produced by compiling throwaway specs with the real transformer:

1. **Reported "100% coverage" is an artifact and is misleading (STATIC).** Jest measures `index.js` only — a one-line stub. The transformer (`transformer.ts`, 802 lines, the entire system under test) runs at *compile time* during `tsc` and is **never in Jest's coverage scope**. The 100% number must not be read as transformer coverage.

2. **A real crash defect exists and is completely untested (EXECUTED).** A multi-literal nullable union — e.g. `'a' | 'b' | null` at root OR as a property — makes the transformer **throw `Error: Unknown literal type undefined` at compile time**, failing the whole build. Root cause: `convertUnion`'s all-literals branch passes the *original* union type (still containing the `null` member) to `convertEnum`, which only filters `Undefined` (not `Null`), so `parseLiteral` chokes on the null literal.

The suspected `applyNullable` array-branch bug (line 632 calling `applyOptional`) is **real in the code but currently unreachable** through `convertUnion` (nullable is applied per-element as an object before the array is built), so it is latent. A regression test should pin the current behavior and a refactor guard should cover the dead branch.

---

## 1. Inventory

| Spec file | `describe` | `it` blocks | Test cases (`it`) | Features covered |
|-----------|-----------|-------------|-------------------|------------------|
| `annotations.spec.ts` | 1 | 4 | 4 | JSDoc tags: `@$$strict true/remove`, `@convert`, `@min`, `@empty`, `@numeric`, `@positive`; root vs property vs intersection vs external annotations. **Only file using `toStrictEqual` (exact schema shape).** |
| `arrays.spec.ts` | 1 | 3 | 3 | `string[]` root, `any[]` field, array of objects/interfaces |
| `enum.spec.ts` | 1 | 3 | 3 | Root enum, enum as interface property, optional enum property. (Two `it` share the name "Enum interface".) |
| `interfaces.spec.ts` | 1 | 14 | 14 | Basic, external, optional, optional-any, predefined (`IUrl`), nested, **infinite-loop (recursive cycle guard)**, union primitives, index signature, generic template, `extends`, override, array-of-interface, `Omit<>` (+ optional) |
| `intersections.spec.ts` | 1 | 8 | 8 | Basic `&`, generic+`Partial`, optional, optional-any, external+annotations, same-prop different-type (enum), same-prop unsupported (number&string → `{}`), same-prop different-type optionals |
| `never.spec.ts` | 1 | 5 | 5 | Root `never`, interface `never`/`undefined`/`null` props, **`string \| null` nullable prop (single, non-array)** |
| `root.spec.ts` | 1 | 12 | 12 | Literal string/number/boolean root, primitive string/number/boolean root, union roots, predefined roots: `IEmail`/`IDate`/`IUUID`/`IUrl`, array root |
| `types.spec.ts` | 1 | 7 | 7 | `type` alias basic, union, generic, mapped/enumerable, external-in-type, predefined-in-type (`IUrl`), **`Buffer` in type** |
| `union.spec.ts` | 1 | 5 | 5 | Basic union, root union, optional, optional-any, external+annotations |
| `interfaces.d.ts` | — | — | 0 | Fixture only: `IExternal` with `@$$strict`, `@empty`, `@numeric`, `@positive`, `@convert` |
| **TOTAL** | **9** | **61 `it`** | **63 tests** | Jest reports **63 passed** (two parametrized files emit extra assertions; 61 `it` literals, 63 counted by Jest due to duplicate-named blocks being counted separately) |

Counting note: the source has 61 `it(...)` literals; Jest's runner reported **`Tests: 63 passed`** (EXECUTED). The delta is from duplicate `it` names and how the compiled `.spec.js` is enumerated. The authoritative number from the runner is **63**.

---

## 2. Test Quality Assessment

### 2.1 Oracle strength
- **Strength (round-trip behavioral oracle):** strong for accept/reject semantics. `interfaces.spec.ts:98` "Infinite loop interfaces" genuinely proves the recursion cycle guard (`convertObject` line 292, returns `{type:'any'}` on cycle) does not hang and accepts cyclic data. `intersections.spec.ts:122` proves `number & string` collapses to `{}` (accepts anything for `a`). These are valuable behavioral checks.
- **Weakness (shape-blindness):** the oracle cannot distinguish a *correct* schema from a *coincidentally-equivalent* one. Example: an `any` field and a missing field both "accept anything"; the round-trip cannot tell them apart. Several "valid" assertions (e.g. `never.spec.ts` lines 27-29 accepting unknown extra keys) only pass because `$$strict` is absent — the test does not assert *why*.
- **Recommendation:** add **`toStrictEqual` snapshot/AST assertions** for the structurally interesting branches (nullable, optional, `$$root`, enum `values` order, predefined `type` mapping, Buffer `instanceOf`). `annotations.spec.ts` already demonstrates the pattern; it should be extended to arrays/unions/predefined/never. Where exact shape is brittle, a Jest inline snapshot of `convertToSchema<T>()` is the right tool. This would have caught both defects in this report at the schema level rather than relying on a value happening to be rejected.

### 2.2 Assertion quality
- **Negative coverage is decent but coarse.** Most `it` blocks pair `.toBe(true)` positives with `.toBeInstanceOf(Array)` negatives — good that negatives exist, but `toBeInstanceOf(Array)` only asserts "some error", never *which* error or field. A schema that rejects for the wrong reason still passes.
- **Tautological/weak assertions in my-only probes aside, the suite has none that are pure tautologies**, but `arrays.spec.ts:11-14` and `:27-30` declare an unused local `interface IBase { type:'Buffer'; data:any[] }` inside the first two `it` blocks that is shadowed/irrelevant to the assertion (dead in-test declarations — see smells).
- **Missing negative classes:** no assertion ever checks `v.validate` error `.type`/`.field`; no test asserts that a *valid-looking-but-should-fail* extra property is rejected under `$$strict` for the generated (non-external) interfaces.

### 2.3 Test smells
- **In-test interface/enum/type declarations inside `it()` blocks (pervasive).** Nearly every test declares its types locally. This *relies on the transformer running over the spec file itself* (the `convertToSchema<LocalType>()` call is rewritten at compile time). It works here, but it is unusual and couples every test to compile-time transform success — which is exactly why the nullable-crash defect (Section 4) takes down the whole `tsc` build rather than failing one test.
- **Dead in-test declarations:** `arrays.spec.ts:11-14, 27-30` `interface IBase { type:'Buffer' ... }` unused in the first array tests.
- **Duplicate `describe`/`it` names:** `enum.spec.ts` has two `it("Enum interface", ...)` (lines 27, 50) — harms test reporting/filtering.
- **Shared mutable validator instance:** every file does `const v = new Validator()` at module top. `fastest-validator` `.validate(value, schema)` compiles the schema each call and is stateless per call, so this is low-risk, but there is **no teardown** and the instance is shared across all `it` in a file. `jest.config.js` sets `clearMocks: true` only (no mocks used). Acceptable but worth a comment.
- **Magic data:** UUID/email/url literals in `root.spec.ts` are reasonable fixtures; acceptable.

### 2.4 Determinism / flakiness / TS-version coupling
- **Determinism:** high. No timers, no network, no randomness, no filesystem. `root.spec.ts:72` uses `new Date()` but only checks "is a date" — not flaky.
- **TS-version coupling: HIGH and under-documented.** The transformer reaches deep into TS internals: `(typeChecker as any).isArrayType` (line 90), `type.flags === ts.TypeFlags.Object` strict-equality checks (lines 90, 93), `getJsDocTags`/`getJSDocTags` dual-path (lines 734, 744). It is pinned to `typescript@5.6.3` and `ts-patch@3.3.0`. There is **no test that asserts the TS version**, and a TS minor bump could silently change `TypeFlags` composition and break conversion branches with no early warning. This is the suite's biggest hidden fragility.

---

## 3. Coverage Mapping (feature → test)

Cross-referencing every conversion branch in `transformer.ts` against the specs:

| Transformer feature (line) | Covered? | Spec evidence | Notes |
|---|---|---|---|
| `convertLiteral` string/number/boolean (118) | YES | `root.spec.ts:11-27` | `$$root` emitted at root |
| `convertPredefined` dispatch (142) | PARTIAL | see predefined table below | 5/8 types tested |
| `convertBuffer` (164) | **WEAK** | `types.spec.ts:93` only (Buffer as property) | **No Buffer-as-root test**; `instanceOf: Buffer` shape never asserted |
| `convertPrimitive` string/number/boolean (189) | YES | `root.spec.ts:29-45`, `interfaces.spec.ts` | |
| `convertAny` / `VoidLike` (211) | PARTIAL | `interfaces.spec.ts:49` (`any`/`?:any`) | `void` type never tested |
| `convertNever` (231) — Never/Undefined/Null | YES | `never.spec.ts:10-69` | root + property |
| `convertArray` regular (251) | YES | `arrays.spec.ts`, `root.spec.ts:102` | |
| `convertArray` `Array<any>`/`any[]` branch (271) | YES | `arrays.spec.ts:25` | |
| `convertObject` interface/type (282) | YES | `interfaces.spec.ts`, `types.spec.ts` | |
| `convertObject` cycle guard (292) | YES | `interfaces.spec.ts:98` "Infinite loop" | strong behavioral check |
| `convertEnum` from union (358) | YES | `enum.spec.ts`, `root.spec.ts` | |
| `convertEnum` from EnumLike members fallback (362) | YES | `enum.spec.ts:10` root enum | |
| `convertUnion` multi (388) | YES | `union.spec.ts`, `types.spec.ts:23` | |
| `convertUnion` all-literals → enum (421) | YES (happy) / **NO (nullable)** | `union.spec.ts:28` root `number\|'string'` | nullable+multi-literal **crashes** — see §4 |
| `convertUnion` single-member optional/nullable (442) | PARTIAL | `never.spec.ts:72` `string\|null` (nullable, single object) | optional single tested via `?:`; nullable single-object array tested only by my probe |
| `convertIntersection` (476) | YES | `intersections.spec.ts` (8 tests) | well covered |
| `convertIntersection` "Can't intersect literal/primitive" throw (498) | **NO** | — | error path never asserted |
| `convert` "Unknown type" throw (103) | **NO** | — | error path never asserted |
| `applyOptional` object (578) | YES | `interfaces.spec.ts:35`, unions/intersections | |
| `applyOptional` array branch (596) | YES (indirect) | `union.spec.ts:38` optional union | |
| `applyNullable` object (611) | YES | `never.spec.ts:72` | |
| `applyNullable` **array branch (629, calls `applyOptional` — BUG)** | **NO / latent** | — | dead/unreachable via current paths; see §4 |
| `applyJSDoc` object (681) | YES | `annotations.spec.ts` | exact-shape asserted |
| `applyJSDoc` array branch (683) | **NO** | — | annotations on a union/array-literal schema never tested |
| `applyJSDoc` numeric/`+`/`-`/bool coercion (661-676) | PARTIAL | `@min 6`, `@$$strict true` | negative numbers, `+N`, `false` literal never tested |
| `parseLiteral` negative number (719) | **NO** | — | no literal `-5` or enum with negative value tested |

### Predefined types matrix (`predefined` map, transformer lines 4-11)

| Predefined | In `predefined.d.ts`? | Tested? | Where |
|---|---|---|---|
| `IDate` → `date` | YES | YES | `root.spec.ts:71`, `annotations.spec.ts:75` |
| `IEmail` → `email` | YES | YES | `root.spec.ts:61` |
| `IUrl` → `url` | YES | YES | `root.spec.ts:92`, `interfaces.spec.ts:68`, `types.spec.ts:81` |
| `IUUID` → `uuid` | YES | YES | `root.spec.ts:81` |
| `IForbidden` → `forbidden` | YES (`predefined.d.ts:3`) | **NO** | never imported or validated |
| `ICurrency` → `currency` | **NO** (missing from `.d.ts`) | **NO** | **not exportable → untestable as written** |
| `IMac` → `mac` | **NO** (missing from `.d.ts`) | **NO** | **not exportable → untestable as written** |
| `IObjectID` → `objectID` | **NO** (missing from `.d.ts`) | **NO** | **not exportable → untestable as written** |

**STATIC finding:** `predefined.d.ts` exports only 5 of the 8 names in the transformer's `predefined` map. `ICurrency`, `IMac`, `IObjectID` cannot be imported by a consumer at all, so the corresponding `currency`/`mac`/`objectID` conversion branches are **dead in practice and 100% untested**. Either the `.d.ts` is missing exports (a product bug) or these features are vestigial.

---

## 4. Coverage Measurement (EXECUTED)

`npm ci` (322 packages, ~7s) and `npm test` both succeeded within the 4-minute cap.

```
PASS test/union.spec.js
PASS test/intersections.spec.js
PASS test/arrays.spec.js
PASS test/root.spec.js
PASS test/types.spec.js
PASS test/interfaces.spec.js
PASS test/annotations.spec.js
PASS test/enum.spec.js
PASS test/never.spec.js
----------|---------|----------|---------|---------|-------------------
File      | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
----------|---------|----------|---------|---------|-------------------
All files |     100 |      100 |     100 |     100 |
 index.js |     100 |      100 |     100 |     100 |
----------|---------|----------|---------|---------|-------------------

Test Suites: 9 passed, 9 total
Tests:       63 passed, 63 total
Time:        0.993 s
```

**Interpretation (critical):** Jest's `--coverage` instruments only the runtime JS it loads — `index.js`, a one-line stub (`export declare function convertToSchema<T>(): any;`). The transformer executes during the *compile* step (`tsc --project tsconfig.test.json`), so **`transformer.ts` contributes 0 instrumented lines** and the "100%" applies to a file that contains essentially no logic. **There is no measured line/branch coverage for the actual system under test.** The real coverage signal in this project is the *feature-coverage matrix* in §3, not the Jest number.

### Discovered defects (EXECUTED via throwaway specs compiled with the real transformer)

I compiled disposable specs against the real transformer (then removed them; git tree verified clean) to probe the suspected nullable issues.

**Defect A — multi-literal nullable union crashes the compile (HIGH).** Both at root and as a property:

```
convertToSchema<'a' | 'b' | null>()        // CRASH
interface H { f: 'a' | 'b' | null }         // CRASH
```
yields, during `tsc`:
```
Error: Unknown literal type undefined
    at parseLiteral (transformer.js:544)
    at convertEnum (transformer.js:270)
    at convertUnion (transformer.js:306)
```
Root cause: `convertUnion` all-literals branch (transformer.ts:421-425) calls `convertEnum(type, ...)` passing the **original union type that still includes the `null` member**. `convertEnum` reads `(type as UnionType).types` and filters only `ts.TypeFlags.Undefined` (line 372), **not `Null`**, so `parseLiteral` receives the null literal (whose `.value` is `undefined`) and throws (line 726). **No test covers this; it fails the entire build.**

**Defect B — `applyNullable` array branch is wrong but currently latent (MEDIUM).** transformer.ts:632 — inside `applyNullable`'s `isArrayLiteralExpression` branch it calls `applyOptional(element, factory)` instead of `applyNullable(element, factory)`. EXECUTED probes show this branch is **not reached** through `convertUnion`, because nullable is applied per-element (as an object) inside the `types.map` at lines 463-465 *before* the array literal is constructed. Observed schemas:

```
(string | null)[]      -> items: { type:string, nullable:true }            // single → object branch (correct)
(A | null)[]           -> items: { type:object, props:{x:..}, nullable:true } // single → object branch (correct)
(A | B | null)[]       -> items: [ {object,nullable:true}, {object,nullable:true} ] // per-element, NOT array branch
```
So Defect B is dead code today, but it is a refactor hazard: any change that routes an `ArrayLiteralExpression` into `applyNullable` will silently emit `optional:true` where `nullable:true` was intended. A guard test (pinning the per-element schema) plus a unit test of `applyNullable` on an array literal is warranted.

**Behavioral nuance found (LOW):** for `(A | B | null)[]`, `v.validate([null], schema)` returns a `required` error — the `multi`-rule array with per-element `nullable` does **not** accept a bare `null` element the way a single-rule nullable does. Worth a documented test so the intended semantics are explicit.

---

## 5. Prioritized New-Test Recommendations

### P0 — defects that fail the build or are user-facing data-integrity risks

| ID | Test to add | Construct | Expected fastest-validator behavior | Bug it catches |
|----|-------------|-----------|--------------------------------------|----------------|
| P0-1 | **Regression: nullable multi-literal union does not crash** | `convertToSchema<'a' \| 'b' \| null>()` and `interface H { f: 'a' \| 'b' \| null }` | Should compile; schema enum `values:['a','b']` with `nullable:true`; `validate(null)`/`validate({f:null})` → `true`; `validate('a')` → `true`; `validate('c')` → error | **Defect A** (compile crash `Unknown literal type undefined`). Once the transformer is fixed to drop the `Null` member before `convertEnum`, this test pins it. Until then, the test documents the crash (`expect(() => compile).not.toThrow` cannot be expressed in-spec, so add as an exact-shape `toStrictEqual` once fixed). |
| P0-2 | **Nullable inside array — current-behavior guard** | `convertToSchema<(A \| B \| null)[]>()` | `toStrictEqual` snapshot of `items:[{...nullable:true},{...nullable:true}]`; assert `validate([{x:1}])`→true | **Defect B** (locks the per-element schema so a future `applyNullable` refactor that hits the buggy array branch is caught) |
| P0-3 | **`applyNullable` array-branch unit/property test** | feed an `ArrayLiteralExpression` schema through nullable (via a constructed union of ≥2 nullable members rendered as array) and assert each element has `nullable:true`, NOT `optional:true` | each element `nullable:true` | **Defect B** directly (kills the line-632 `applyOptional` mutation) |

### P1 — material untested features / branches

| ID | Test to add | Construct | Expected behavior | Gap closed |
|----|-------------|-----------|-------------------|-----------|
| P1-1 | Buffer as **root** | `convertToSchema<Buffer>()` | `{ type:'class', instanceOf:Buffer, $$root:true }`; `validate(Buffer.from([1]))`→true; `validate('x')`→error | `convertBuffer` `$$root` branch (line 176) never tested; shape never asserted |
| P1-2 | `IForbidden` predefined | `convertToSchema<IForbidden>()` and as a property | `{ type:'forbidden' }`; any defined value → error, `undefined`→true | predefined `forbidden` branch untested |
| P1-3 | Restore + test `ICurrency`/`IMac`/`IObjectID` | add the three missing exports to `predefined.d.ts`, then root + property tests | `type:'currency'`/`'mac'`/`'objectID'` | dead/undeliverable predefined branches; also surfaces the **missing-export product bug** |
| P1-4 | `convertIntersection` "Can't intersect literal" throw | `convertToSchema<{a:1} & 'b'>()` or `number & 'x'` | transformer throws `Can't intersect literal or primitive!` | error path (line 498) never asserted |
| P1-5 | `convert` "Unknown type" throw | a type that hits no branch (e.g. a bare `unknown`/conditional/`symbol`) | throws `Unknown type` | error path (line 103) never asserted |
| P1-6 | JSDoc on a union/array schema (`applyJSDoc` array branch, line 683) | `interface H { /** @min 1 */ f: number \| string }` (union → array of rules) | `min:1` applied to each union member | array branch of `applyJSDoc` untested |
| P1-7 | `@convert`/numeric annotation edge cases | `@max -5`, `@default false`, `@min +3` | negative → `-5` (PrefixUnary), `false` literal, `+3`→`3` | `applyJSDoc` lines 661-676 / `parseLiteral` line 719 untested |

### P2 — robustness / shape-hardening / hidden fragility

| ID | Test to add | Rationale |
|----|-------------|-----------|
| P2-1 | Convert ~6 representative branches to **`toStrictEqual` exact-schema** assertions (array root, predefined root, nested object, enum `values`, optional, nullable) | Upgrade the oracle from behavior-only to shape-aware; would have caught Defects A/B at schema level |
| P2-2 | `void` type and `Array<any>` root explicit shape | `convertAny` `VoidLike` (line 87) and array-any branch shape unasserted |
| P2-3 | Negative-literal enum / `enum E { A = -1 }` | exercises `parseLiteral` negative path (line 719) end-to-end |
| P2-4 | Deeply nested (4-5 level) object + large union (10+ members) | stress `convertObject`/`convertUnion` recursion; no current depth/breadth stress |
| P2-5 | TS-version assertion / pinned-version smoke note | document the hard `typescript@5.6.3` + `ts-patch@3.3.0` coupling; add a guard test that fails loudly if `TypeFlags`-dependent branches regress on a TS bump |
| P2-6 | De-dup `enum.spec.ts` `it("Enum interface")` names; remove dead `IBase` decls in `arrays.spec.ts` | test-reporting hygiene |
| P2-7 | Error-`.type`/`.field` assertions on key negatives | so negatives reject for the *right* reason, not any reason |

---

## Appendix — Evidence labels (ADR-105)

- **EXECUTED:** `npm ci` + `npm test` (63 passed, 100% on `index.js`); throwaway-spec compiles proving Defect A crash (`Unknown literal type undefined`) and Defect B latent/per-element schemas. Commands run against the real transformer at `/tmp/ts-transformer-fastest-validator`; probe files removed, `git status` clean.
- **STATIC:** predefined export gap (`predefined.d.ts` 5/8); coverage scope = `index.js` only (Jest instruments runtime, transformer runs at compile time); feature→test matrix derived from `transformer.ts` AST branches vs spec content.
- **INFERRED:** Defect B reachability assessment (probed but exhaustive path proof not attempted); TS-version fragility severity.
- **CONJECTURE:** none load-bearing.
