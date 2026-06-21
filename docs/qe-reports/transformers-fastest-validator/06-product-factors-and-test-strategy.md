# Product-Factor Analysis & Test Strategy — ts-transformer-fastest-validator

| | |
|---|---|
| **Target** | `ts-transformer-fastest-validator` v2.0.0 (published npm package) |
| **Artifact under analysis** | `transformer.ts` (802 LOC), `index.ts`, `predefined.d.ts`, `package.json`, `test/*.spec.ts` (10 specs) |
| **Date** | 2026-06-20 |
| **Analyst** | qe-product-factors-assessor (fleet-b7ee9eba) |
| **Framework** | James Bach HTSM — Product Factors (SFDIPOT) + Risk-Based Prioritization |
| **Evidence basis** | STATIC analysis of source + existing test suite. No code executed in this pass (the package's own tests are the executable oracle; this report defines what to *add* and re-run). |

---

## Executive Summary

`ts-transformer-fastest-validator` is a **compile-time TypeScript custom AST transformer** (a `tsc` plugin loaded via ts-patch/ttypescript) that rewrites `convertToSchema<T>()` call-sites into inline `fastest-validator` JSON schema object literals. The entire product is one file — `transformer.ts` — whose `convert()` dispatcher (transformer.ts:54-113) branches on `ts.TypeFlags` to a family of `convertX()` emitters that build AST via `ts.NodeFactory`.

The conversion surface is broad (never/null/undefined→`forbidden`, literals→`equal`, 8 predefined interfaces→native types, `Buffer`→`class instanceOf`, enums→`enum`, primitives, `any`/`void`→`any`, arrays, objects/interfaces with recursion guard, unions→`multi` with all-literals→`enum` optimization, intersections→merged object, JSDoc annotations→schema rules, `?`→`optional`, `$$root` for root-level non-object schemas). The existing suite (10 specs) exercises a credible happy-path matrix using **round-trip validation against fastest-validator as the oracle** — a strong, behavior-anchored oracle choice that this strategy endorses and extends.

The product nonetheless carries **structural fragility** and **several concrete correctness risks** that the current tests do not touch:

- **HIGHEST RISK — `applyNullable` is wired wrong for arrays.** `applyNullable` (transformer.ts:611-639) recurses into array elements by calling **`applyOptional`** (line 633), not `applyNullable`. Any union/`multi` schema that is also nullable will silently emit `optional` on its branches instead of `nullable`. Zero tests cover nullable-array / nullable-multi. (INFERRED — code-evident, no test exists to confirm/deny runtime impact.)
- **HARD BUILD FAILURE on unsupported types.** The dispatcher's terminal `else` throws `Error('Unknown type')` (transformer.ts:103), and intersection throws `"Can't intersect literal or primitive!"` (line 498). Because this runs *inside `tsc`*, an unsupported construct (`unknown`, tuples in some shapes, certain mapped/conditional types) **fails the whole build** rather than degrading. No negative test asserts or characterizes this.
- **Strict `flags === ts.TypeFlags.Object` equality** at the array/object branches (transformer.ts:90,93) is brittle: composite object types (e.g. with `ObjectFlags` that surface as additional type flags, fresh/widened literals, or `Object | <other>`) can miss both branches and fall through to the throw.
- **Predefined map ↔ declaration mismatch.** `predefined` maps 8 names (transformer.ts:3-12) but `predefined.d.ts` ships only **5** (`IDate`, `IEmail`, `IForbidden`, `IUrl`, `IUUID`). `ICurrency`, `IMac`, `IObjectID` are **unusable** by consumers (no exported declaration) and have **zero test coverage**.
- **TypeScript version coupling.** `typescript` is pinned to `5.6.3` and the code reaches into internal/`any`-cast APIs — `(typeChecker as any).isArrayType` (line 90), `(type as any).value` (line 713). A TS minor/major bump is a realistic break vector with no compatibility test.

Quality posture: **capability** of the documented happy path is reasonably evidenced; **reliability** (graceful degradation), **compatibility** (TS-version drift, fastest-validator-version drift), and **negative-path correctness** (nullable arrays, unsupported types) are the under-covered, high-risk dimensions and form the spine of the test plan below.

---

## 1. SFDIPOT Product-Factor Analysis

### S — STRUCTURE (what the product *is*)

| Element | Reference | Quality Risk | Test Ideas (priority) |
|---|---|---|---|
| Single 802-LOC `transformer.ts`, no modularization | transformer.ts | Low cohesion isolation; one file = one blast radius; hard to unit-test branches in isolation | Extract `convert()` branch coverage matrix; snapshot the emitted AST per branch (P1) |
| `convert()` dispatcher — ordered `if/else` on `TypeFlags` | transformer.ts:54-104 | **Order-sensitivity**: e.g. predefined check (line 75) runs before primitive (84); `EnumLike` (81) before primitive. A type matching two conditions silently takes the first. Terminal `throw` (103). | Construct types that match multiple branches (enum-of-strings, `Buffer`-named interface) and assert dispatch order is intended (P1); negative: type that matches none → assert build-failure behavior (P0) |
| AST factory output (`ts.NodeFactory`) | throughout | Emitted node could be syntactically valid but semantically wrong schema; printed output never asserted directly | AST/printed-source snapshot oracle per conversion (P1) |
| ts-patch / ttypescript integration; `prepare: ts-patch install` | package.json:7 | Plugin-loading contract with host compiler; `transformer` default export shape (`(program) => TransformerFactory`) | Compile a fixture project through ts-patch and ttypescript; assert transform actually fires (P0) |
| npm package `files` allowlist | package.json:29-35 | Ships `transformer.js`/`index.js` (built) + `.ts` + `predefined.d.ts`. **`predefined.d.ts` under-declares the predefined map** | Assert published tarball contains all consumer-facing declarations matching the `predefined` map (P1) |
| `extractJsDocTagInfos` — 3-tier fallback (legacy API → `getJSDocTags` → comment-range regex) | transformer.ts:730-801 | Fallback regex `/@([\$\w]+)\s+([^\s*]+)/g` (line 791) is a fragile parser; multi-word tag text truncated to first token | Annotation with multi-word value, special chars, missing value → assert parse (P2) |

### F — FUNCTION (what the product *does*)

| Conversion branch | Reference | Quality Risk | Test Ideas (priority) |
|---|---|---|---|
| `never`/`null`/`undefined` → `forbidden` | convertNever 231-246 | Uses `flags === ` strict equality (line 69) — `null` in a union is stripped elsewhere; standalone OK | Covered (never.spec.ts). Add `void`-in-property edge (P2) |
| literals → `equal` (+`strict`, root `$$root`) | convertLiteral 118-137 | Negative numbers via prefix-unary (line 721); boolean literal path separate | Root literal covered (root.spec.ts:11-27). Add negative-number literal, `0`, empty-string literal (P2) |
| predefined (8) → native types | convertPredefined 142-159 | Only 4-5 predefined types tested (IEmail/IDate/IUUID/IUrl). **ICurrency, IMac, IObjectID, IForbidden untested**; 3 also undeclared | Round-trip each of the 8 predefined types as root + nested (P0 for the 3 undeclared/untested) |
| `Buffer` → `class instanceOf Buffer` | convertBuffer 164-181 | Name-string match `'Buffer'` (line 78) — user type literally named `Buffer` collides; relies on global Buffer at validate time | Buffer nested covered (types.spec.ts:93). Root Buffer untested; user-defined `Buffer` interface collision (P1) |
| enums (string/numeric/heterogeneous/const) → `enum` | convertEnum 346-383 | Numeric & heterogeneous enums **untested** (only string enums in suite); fallback member collection (357-369) for non-union enum-likes | Numeric enum, heterogeneous enum, `const enum` root + nested (P1) |
| primitives string/number/boolean | convertPrimitive 189-206 | `typeToString` used as the type name (line 198) — `String`/`Number` boxed, branded primitives, `bigint`, `symbol` not handled | Covered for 3 primitives (root.spec.ts). Add `bigint`, `symbol` → expect throw/`any` (P2) |
| `any`/`void` → `any` | convertAny 211-226 | `void` reaches here via `VoidLike` (line 87) | `any` covered; standalone `void` root untested (P3) |
| arrays incl `Array<any>`/`any[]` | convertArray 251-277 | Takes `typeArguments[0]` only → **tuples lose positional types**; nested-array item nullability path unverified | Array covered (arrays.spec.ts). **Tuple `[string, number]`, `readonly T[]`, nested `string[][]`, nullable-item `(string\|null)[]`** (P0 tuple, P1 nullable-item) |
| objects/interfaces + recursion guard + circular→`any` | convertObject 282-341 | Recursion guard keyed on **`name`**, excludes `__type` anonymous (line 292) → **recursive type *aliases* (anonymous) may not be guarded** | Named-interface cycle covered (interfaces.spec.ts:98). **Recursive `type` alias cycle** (P0); empty interface `{}`; deeply-nested (10+) (P1) |
| all-literals union optimization → `enum` | convertUnion 414-436 | Single-literal → `convertLiteral`; mixed literal+non-literal stays `multi` | Covered indirectly. Add union of 50+ literals (large-enum perf/correctness) (P2) |
| union → `multi`; optional via `undefined`, nullable via `null` | convertUnion 388-471 | `optional`/`nullable` applied per-branch in array map (459-466). **`applyNullable` array path is buggy** | Nullable union (string\|null) covered at property level (never.spec.ts:72). **Nullable multi-branch object union, nullable array** (P0) |
| intersection → merged object | convertIntersection 476-573 | Throws on literal/primitive intersect (498); merged-prop type resolution via `getPropertyOfType` (530); optional only if **all** sources optional (555) | Covered (intersections.spec.ts). Add intersection-of-unions, 3+ way intersection, intersection with predefined (P1) |
| JSDoc annotations → rules | applyJSDoc 644-693; extract 730-801 | Numeric/bool coercion regex (665); array-schema annotation recursion (683); **idempotency guard only for optional/nullable, not arbitrary tags** | `@min/@max`, `@pattern` (regex value), duplicate tag, tag on array, `@$$strict remove` covered (annotations.spec.ts) — extend to `@pattern`, numeric `@length`, conflicting tags (P2) |
| `$$root` for root non-object schemas | multiple (`history.size===0`) | `$$root` injected when history empty; interacts subtly with array/union root (history `undefined` sentinel added 264,439) | Root scalar/array/enum/literal all assert `$$root` semantics via validation (P1) |

### D — DATA (what it *processes*)

**Input data space = the universe of TypeScript types.** **Output data = a fastest-validator schema** whose correctness is judged by round-trip validation.

| Data class | Reference / status | Risk | Test Ideas (priority) |
|---|---|---|---|
| Primitives, literals, enums | covered | — | edge: empty-string literal, `0`, `false` literal, `-1` (P2) |
| Unions (optional via undefined, nullable via null, all-literal opt) | partially | nullable-array / nullable-multi unverified | **`(A\|B)[]`, `(string\|null)[]`, `string\|null\|undefined`** (P0/P1) |
| Intersections (incl of unions, generics) | covered for object∩object | intersection-of-unions, same-prop conflicting types | already 1 conflicting-type test (intersections.spec.ts:97); add union∩union (P1) |
| Index signatures / `Record<K,V>` | Index interface test passes (interfaces.spec.ts:139) via `getPropertiesOfType` returning the index sig | `Record<string, T>`, `Record<'a'\|'b', T>`, number-index — behavior unverified beyond string index | `Record<string,number>`, mapped `{[K in Enum]: T}` covered (types.spec.ts:51); add `Record` explicit, number index (P1) |
| **Tuples** `[string, number]` | **UNTESTED** | array branch keeps only `typeArguments[0]` → second element type lost | tuple positional, mixed tuple, variadic tuple → characterize/assert (P0) |
| **Mapped / conditional / template-literal types** | mapped via enum covered; conditional & template-literal **UNTESTED** | likely hit terminal throw or collapse to `any`/object | `` `prefix-${string}` ``, `T extends U ? X : Y` → assert build behavior (P1) |
| **`unknown`** | **UNTESTED** | `TypeFlags.Unknown` matches **no branch** → `throw 'Unknown type'` → **build break** | root `unknown` and property `unknown` → assert/triage (P0) |
| Empty interface `{}` / `object` / `{}`-literal | UNTESTED | object branch with zero props emits `{}` or `{type:object}` w/o `props` (335-337) | `interface E {}`, `object`, `{}` root + nested (P1) |
| Function-valued, getters, computed keys, `readonly` | UNTESTED | `getPropertiesOfType` includes methods → converted as their return/`object`? unclear | property `f: () => void`, `readonly x`, getter, computed key (P2) |
| Date/RegExp (non-predefined) | UNTESTED | native `Date` (not `IDate`) → object with `getTime` etc.? `RegExp`? | `d: Date`, `r: RegExp` → characterize (P2) |
| Boundary: deeply nested (10+), wide (100 props), large union (50+) | UNTESTED | recursion depth, compile-time cost | depth-10 nested, 100-prop object, 50-literal union (P2) |

### I — INTERFACES (how it *connects*)

| Interface | Reference | Risk | Test Ideas (priority) |
|---|---|---|---|
| `convertToSchema<T>()` public API | index.ts:1; matched by name `convertToSchema` + first type arg (transformer.ts:42) | Match is **by function name string only** — a user's own `convertToSchema` collides; no type arg → silently untransformed (left as runtime call to a stub returning `any`) | call with 0 type args, with 2 type args, aliased import, re-export → assert transform fires correctly or no-ops safely (P1) |
| Emitted schema ↔ fastest-validator contract | `^1.12` (package.json:40) | Schema keys (`type`,`props`,`items`,`optional`,`nullable`,`$$root`,`$$strict`,`enum.values`,`equal.value/strict`) must match FV's accepted spec; FV version drift | Contract test: feed every emitted schema variant to FV's own validator-compile and assert no schema error (P0) |
| JSDoc annotation interface | applyJSDoc; IExternal fixture (interfaces.d.ts) | Arbitrary `@tag value` → passed through as schema rule; typo'd tag silently becomes an invalid FV rule | `@invalidRule x` → does FV reject the compiled schema? (P1) |
| Moleculer integration (`params: convertToSchema<T>()`) | README:23-41 | Documented primary consumer; schema shape must satisfy Moleculer param validation | Moleculer service smoke: action with `params` schema validates context (P1) |
| tsconfig `plugins` transform interface | README:51-62 | `{ "transform": ".../transformer" }` default-export contract | ttypescript + ts-patch both load and run (P0) |

### P — PLATFORM (what it *depends on*)

| Dependency | Reference | Risk | Test Ideas (priority) |
|---|---|---|---|
| **TypeScript pinned `5.6.3`** + internal/`any` API use | package.json:44; `(typeChecker as any).isArrayType` (90), `(type as any).value` (713) | **HIGH fragility** — TS upgrade can change internal shape, `TypeFlags` numeric values, or `getJsDocTags` API → silent miscompile or throw | Compatibility matrix: run suite against TS 5.4, 5.5, 5.6, 5.7, next (P0) |
| ts-patch `^3.3.0` vs ttypescript vs ts-loader/webpack | package.json:43; README:47-62 | Multiple loaders documented; each patches `tsc` differently | Build same fixture via ts-patch, ttypescript, webpack+ts-loader (P1) |
| fastest-validator `^1.12.0` | package.json:40 | Caret range — FV 1.x minor could tighten schema validation | Pin-vs-floating FV: run round-trip oracle against FV 1.12 and latest 1.x (P1) |
| Node version (`@types/node ^18`) | package.json:39 | `Buffer` global, ES2019 lib (tsconfig:4) | Node 18/20/22 run of test suite (P2) |
| OS | — | Path/line-ending in comment-range JSDoc fallback regex | Linux/macOS/Windows CI of suite (P3) |

### O — OPERATIONS (how it's *used*)

| Usage mode | Reference | Risk | Test Ideas (priority) |
|---|---|---|---|
| Moleculer service `params` schemas | README:23-41 | Primary real-world use; a bad schema rejects valid traffic or accepts invalid | E2E: Moleculer action with realistic DTO interface (P1) |
| Build-pipeline / monorepo compile-time cost | transformer runs per call-site in `visitEach` (every node) | `visitEach` recurses **all** nodes of every file (transformer.ts:22-26); large monorepo → compile-time tax | Benchmark transform over a 1k-call-site fixture; assert no O(n²) blowup (P2) |
| **Error-during-build failure mode** | `throw` (103, 498) | A single unsupported type in one DTO **fails the whole `tsc` build** with a raw `Error` and no source location | Inject one unsupported field; assert the build fails *gracefully with a locatable message* (currently it does not) → drives a feature/robustness gap (P0) |
| CI of consumers | — | `noEmitOnError` (tsconfig:8) means transform throw blocks emit | Characterize CI failure surface (P2) |

### T — TIME (when things happen)

| Temporal aspect | Reference | Risk | Test Ideas (priority) |
|---|---|---|---|
| Compile-time ordering / dispatch order | convert() if/else chain | First-match wins among overlapping `TypeFlags`; order is load-bearing and undocumented | Order-sensitivity tests (see Structure) (P1) |
| Recursion / cycles over a single compile | history `Set` add/delete (296,326; 439,502,559) | `history.delete(name)` must perfectly mirror `add`; an early `return` (circular→any at 293) returns **without** deleting? No — it returns before add; but intersection adds in a loop and deletes inside map — **asymmetry risk** | Diamond inheritance, mutually-recursive aliases, self-referential array `type T = T[]` (P0/P1) |
| **Version-drift over time** (TS upgrades break `as any`) | platform | The dominant long-term failure mode | Scheduled compatibility CI against TS `next` (P1) |
| Input evolving as user DTOs grow | — | New type constructs added by users hit untested branches | Property-based fuzzer generating random valid TS types (P1) |

---

## 2. Risk-Based Prioritization (Likelihood × Impact)

| Rank | Risk | Likelihood | Impact | Score | Evidence |
|---|---|---|---|---|---|
| **R1** | `applyNullable` recurses with `applyOptional` on arrays → nullable-array/nullable-multi emits wrong rule | Med (needs nullable union/array) | High (silent wrong validation) | **CRITICAL** | transformer.ts:633 (INFERRED, no test) |
| **R2** | Unsupported type (`unknown`, some tuples/conditional/template-literal) → `throw` → **whole build fails** with no location | High (users add new types) | High (CI red, no diagnostics) | **CRITICAL** | transformer.ts:103,498 |
| **R3** | TS version pin `5.6.3` + internal `as any` APIs → upgrade breaks transform | Med (every TS release) | High (silent miscompile / throw) | **CRITICAL** | package.json:44; lines 90,713 |
| **R4** | Predefined map (8) ≠ shipped declarations (5); ICurrency/IMac/IObjectID unusable + untested | High (already true) | Med (feature unusable) | **HIGH** | transformer.ts:3-12 vs predefined.d.ts |
| **R5** | `flags === TypeFlags.Object` strict equality misses composite object types → falls to throw | Med | High | **HIGH** | transformer.ts:90,93 |
| **R6** | Tuples lose positional element types (only `typeArguments[0]`) → over-permissive schema | Med | Med | **HIGH** | transformer.ts:259,270 |
| **R7** | Recursion guard excludes anonymous `__type` → recursive type *aliases* may infinite-loop | Low-Med | High (hang) | **HIGH** | transformer.ts:292 |
| **R8** | Emitted schema may not be a *valid* FV schema for some branches (no schema-compile contract test) | Low | High | **MED-HIGH** | no contract test exists |
| **R9** | `convertToSchema` matched by bare name → user collision / 0-arg silent no-op | Low | Med | **MED** | transformer.ts:42 |
| **R10** | JSDoc comment-range regex truncates multi-word/whitespace tag values | Med | Low | **MED** | transformer.ts:791 |
| **R11** | fastest-validator `^1.12` caret drift tightens schema acceptance | Low | Med | **MED** | package.json:40 |
| **R12** | Compile-time cost on large monorepos (`visitEach` over every node) | Low | Med | **LOW-MED** | transformer.ts:22-26 |

**Top gaps to close first:** R1 (nullable arrays), R2 (graceful unsupported-type behavior), R3 (TS-version matrix), R4 (predefined coverage + declaration fix), R5/R6 (object-flag & tuple correctness).

---

## 3. Test Strategy

### 3.1 Mission
Provide evidence that, for the documented supported type space, `convertToSchema<T>()` emits a fastest-validator schema that **accepts exactly the values assignable to `T` and rejects the rest**, across the supported TypeScript and fastest-validator versions; and that unsupported constructs fail **predictably and diagnosably** rather than crashing the consumer's build.

### 3.2 Quality Criteria (CRUSSPIC, scoped to a compile-time library)
- **Capability** — every `convert()` branch produces a correct, round-trip-validating schema. *(primary)*
- **Reliability / Robustness** — unsupported types degrade gracefully (or fail with a located, actionable error); recursion/cycles terminate. *(primary)*
- **Compatibility** — works across the supported TS version range and fastest-validator `1.x`; loadable via ts-patch, ttypescript, ts-loader. *(primary — this is the #1 long-term risk)*
- **Performance (compile-time)** — transform cost scales linearly with call-sites/type-size; no pathological blowup. *(secondary)*
- **Installability** — published tarball contains all consumer-facing declarations (`predefined.d.ts` must match the `predefined` map) and the built `.js`. *(secondary)*
- **Usability (DX)** — error messages on unsupported types name the offending type and source location. *(secondary)*
- *(Out of scope for a compile-time codegen lib: Security as runtime attack surface, Scalability as concurrency — there is no running service.)*

### 3.3 Oracle Strategy
1. **Round-trip validation oracle (ENDORSE — keep as primary).** Existing specs feed values to `v.validate(value, convertToSchema<T>())` and assert `true` / `instanceof Array`. This is behavior-anchored and resistant to schema-shape churn. **Extend** it to every branch and to negative/edge data.
2. **Golden-schema (`toStrictEqual`) oracle (EXTEND).** Used only in `annotations.spec.ts`. Add golden schemas for branches where *shape* matters (nullable, optional, `$$root`, equal/strict, enum.values ordering) so regressions in emitted structure are caught even when validation still passes.
3. **AST / printed-source snapshot oracle (ADD).** Snapshot the printed output of `convert()` per branch to detect factory-level changes (e.g., negative-number prefix-unary, `$$root` placement) independent of FV.
4. **Schema-validity contract oracle (ADD).** Compile every emitted schema with fastest-validator's own `compile()` and assert it raises no schema error — separates "FV rejected the *value*" from "FV rejected the *schema*".
5. **Differential oracle (ADD, for fuzzing).** For property-based tests, derive the expected accept/reject from TS assignability and compare to FV's verdict.

### 3.4 Test Levels
- **Unit (branch)** — one focused case per `convertX()` emitter, ideally via golden-schema + AST snapshot.
- **Integration (compile + validate)** — the current model: compile a spec through the transformer, then round-trip-validate. Keep as the backbone.
- **Contract** — emitted schema ⇄ fastest-validator schema spec (oracle #4); transformer ⇄ ts-patch/ttypescript plugin contract.
- **Property-based** — generate random TS type declarations (start with a grammar over primitives/objects/unions/arrays/optionals) and assert the differential oracle.
- **Compatibility matrix** — suite × {TS 5.4,5.5,5.6,5.7,next} × {FV 1.12, latest 1.x} × {ts-patch, ttypescript}.
- **Performance** — compile-time benchmark fixtures.

### 3.5 Coverage Targets
- **Branch coverage of `convert()` dispatcher and every `convertX()`: 100%** (it is small and finite — there is no excuse for an uncovered branch).
- Statement/line ≥ 90% on `transformer.ts`.
- **Type-construct coverage matrix:** every row in the Data section has at least one positive + one negative case.
- Annotation coverage: each documented JSDoc tag + one malformed tag.

### 3.6 Entry / Exit Criteria
- **Entry:** package builds (`npm run build`), existing suite green, fixtures compile via ts-patch.
- **Exit (per release):** 100% `convert()` branch coverage; all P0/P1 plan cases green; compatibility matrix green on the supported TS range; tarball-declaration check green; no `throw`-on-build for any documented-supported type; nullable-array case green.

### 3.7 Environments & Tooling
Jest 28 + ts-patch (existing). Add: matrix CI (GitHub Actions) over TS/FV versions; `fast-check` for property tests; `ts-morph` or the TS printer for AST snapshots; a Moleculer dev-dependency for the integration smoke.

### 3.8 Automation Approach & Scope
- **IN scope:** all conversion branches, annotations, optional/nullable, recursion/cycles, root vs nested, unsupported-type behavior, TS/FV compatibility, plugin-loader contract, tarball completeness, compile-time performance smoke.
- **OUT of scope:** fastest-validator's own validation correctness (trust the library); Moleculer runtime beyond a param-schema smoke; runtime security; non-`tsc` transpilers (Babel/swc) that do not run TS transformers.
- **Automation fitness:** ~70% unit/integration (deterministic, fast), ~15% contract, ~10% property-based, ~5% human exploration (TS-version drift triage, novel type constructs). Human exploration is justified because new TypeScript releases introduce type constructs no fixed suite anticipates.

---

## 4. Test Plan

Legend — **Type:** U=unit/branch, I=integration(compile+validate), C=contract, P=property, N=negative. Oracle: RT=round-trip validate, GS=golden-schema `toStrictEqual`, AST=printed-source snapshot, SV=schema-validity compile, DIFF=differential.

### Function / branch coverage

| ID | Title | Type | Pri | Preconditions | Steps | Expected (oracle) |
|---|---|---|---|---|---|---|
| TC-01 | `never`/`null`/`undefined` root → `forbidden` | I | P2 | suite builds | `convertToSchema<never>()` etc. | undefined/null accept, others reject (RT) — *covered, keep* |
| TC-02 | Literal root (string/number/bool) → `equal`+`strict`+`$$root` | U | P1 | — | golden-compare each | exact `{type:'equal',value,strict:true,$$root:true}` (GS) |
| TC-03 | Negative & zero & empty literals (`-1`,`0`,`''`,`false`) | U | P2 | — | convert each | correct equal.value incl prefix-unary (AST+RT) |
| TC-04 | All 8 predefined as **root** | I | **P0** | declarations exist | round-trip each (IEmail,IDate,IUUID,IUrl,**ICurrency,IMac,IObjectID,IForbidden**) | valid value accepts, junk rejects (RT) |
| TC-05 | ICurrency/IMac/IObjectID importable by consumer | C | **P0** | — | `import {IMac,...} from 'predefined'` in fixture | compiles; **currently FAILS — undeclared** (compile) |
| TC-06 | Predefined nested in interface | I | P1 | — | `{a: ICurrency}` etc. | RT |
| TC-07 | `Buffer` as **root** + nested | I | P1 | Node Buffer global | `convertToSchema<Buffer>()` | instance accepts, non-buffer rejects (RT) |
| TC-08 | User interface literally named `Buffer` | N | P1 | — | declare own `Buffer` | characterize collision with name-match (RT/GS) |
| TC-09 | String enum root+nested | I | P2 | — | UserGroup | *covered, keep* (RT) |
| TC-10 | **Numeric enum** root+nested | I | P1 | — | `enum E{A=1,B=2}` | accepts 1/2, rejects 3/'A' (RT) |
| TC-11 | **Heterogeneous / const enum** | I | P1 | — | `enum E{A='a',B=2}`, `const enum` | enum.values correct (RT+GS) |
| TC-12 | Primitives string/number/boolean root | I | P2 | — | *covered, keep* | RT |
| TC-13 | `bigint`/`symbol` root | N | P2 | — | `convertToSchema<bigint>()` | characterize: throw or `any` — assert chosen behavior (RT/error) |
| TC-14 | `any`/`void` root + optional any property | I | P3 | — | *any covered*; add `void` | `{type:'any'}` (GS) |
| TC-15 | Array root + `Array<any>`/`any[]` | I | P2 | — | *covered, keep* | RT |
| TC-16 | **Tuple `[string,number]`** | N/I | **P0** | — | `convertToSchema<[string,number]>()` | characterize: 2nd element type currently lost → assert/triage (RT+AST) |
| TC-17 | `readonly T[]`, nested `string[][]` | I | P1 | — | round-trip | RT |
| TC-18 | **Nullable array `(string\|null)[]`** | I | **P0** | — | validate `['a',null]` | **likely emits `optional` not `nullable` (R1)** — assert correct nullable (RT+GS) |
| TC-19 | **Nullable multi-branch union object** `(A\|B)\|null` | I | **P0** | — | validate `null` and A and B | nullable on each multi branch, not optional (RT+GS) |
| TC-20 | Basic / nested / optional interfaces | I | P1 | — | *covered, keep* | RT |
| TC-21 | **Empty interface `{}` / `object` / `{}` literal** | I/N | P1 | — | root + nested empty | characterize emitted schema & acceptance (RT+GS) |
| TC-22 | Named-interface circular → `any` | I | P1 | — | *covered (IBase1↔2↔3), keep* | RT |
| TC-23 | **Recursive type *alias* cycle** `type T={a:T}` / `type T=T[]` | N | **P0** | — | convert | must terminate (no hang) — anonymous `__type` guard gap (R7) (RT/timeout) |
| TC-24 | Diamond inheritance / mutually-recursive aliases | I | P1 | — | convert | history add/delete symmetry holds; terminates (RT) |
| TC-25 | Deeply nested (depth 10) + wide (100 props) | I | P2 | — | convert | correct schema, no stack overflow (RT) |
| TC-26 | All-literal union → enum optimization | U | P2 | — | `'a'\|'b'\|'c'` | `{type:'enum',values:[...]}` (GS) |
| TC-27 | Single-literal union → equal | U | P2 | — | `'a'\|undefined` | equal + optional (GS) |
| TC-28 | Large union (50 literals / 50 objects) | I/perf | P2 | — | convert | correct + bounded time (RT) |
| TC-29 | Union optional via undefined / nullable via null | I | P1 | — | *partially covered* | RT+GS |
| TC-30 | Mixed literal+non-literal union stays `multi` | U | P1 | — | `'a'\|number` | array `multi` (GS) |

### Intersection / Data-transformation

| ID | Title | Type | Pri | Preconditions | Steps | Expected |
|---|---|---|---|---|---|---|
| TC-31 | Basic & generic & optional intersection | I | P1 | — | *covered, keep* | RT |
| TC-32 | **Intersection of unions** `(A\|B)&(C\|D)` | I | P1 | — | convert | merged props correct (RT) |
| TC-33 | 3+ way intersection | I | P2 | — | `A&B&C` | all props present (RT) |
| TC-34 | Intersection with predefined / Buffer member | I | P2 | — | `A & {d:IDate}` | RT |
| TC-35 | Intersect literal/primitive → throws | N | P1 | — | `string & number` (or via prop) | asserts `"Can't intersect..."` is the *intended* contract (error) |
| TC-36 | Same-prop conflicting types optional/required | I | P1 | — | *covered, keep & extend* | RT |

### Annotations

| ID | Title | Type | Pri | Preconditions | Steps | Expected |
|---|---|---|---|---|---|---|
| TC-37 | Root `@$$strict true`/`remove` (interface & type) | I | P1 | — | *covered, keep* | GS |
| TC-38 | Property `@convert`,`@positive`,`@empty`,`@numeric` | I | P1 | — | *covered (IExternal), keep* | GS |
| TC-39 | `@min`/`@max`/numeric `@length` coercion | U | P2 | — | numeric tag values | number literals incl negative (GS+AST) |
| TC-40 | `@pattern` with regex/string value & multi-word value | U | P2 | — | comment-range fallback path | value not truncated (R10) (GS) |
| TC-41 | Duplicate / conflicting tag, malformed `@tag` (no value) | N | P2 | — | convert | characterize merge & no crash (GS) |
| TC-42 | Annotation on array-typed property | U | P2 | — | `@items ...` on `T[]` | recursion into elements correct (AST) |
| TC-43 | Invalid rule name `@bogus x` | N | P1 | — | compile schema with FV | does FV reject schema? (SV) |

### Interfaces / Contract / Platform / Operations / Time

| ID | Title | Type | Pri | Preconditions | Steps | Expected |
|---|---|---|---|---|---|---|
| TC-44 | Every emitted schema compiles in fastest-validator | C | **P0** | enumerate branches | `new Validator().compile(schema)` per branch | no schema error (SV) |
| TC-45 | `convertToSchema` 0 type-args / 2 type-args / aliased import | N | P1 | — | compile fixtures | safe no-op or correct transform, no crash (compile+RT) |
| TC-46 | Unsupported type → **graceful, located** build failure | N | **P0** | — | one `unknown`/tuple field in a DTO | currently raw `throw 'Unknown type'` (R2) — assert/improve to located diagnostic (compile error text) |
| TC-47 | `unknown` root & property | N | **P0** | — | `convertToSchema<unknown>()` | characterize (throw today) → triage (compile) |
| TC-48 | Plugin loads & runs via **ts-patch** and **ttypescript** | C | **P0** | both installed | build same fixture each way | transform fires; schemas identical (RT/GS) |
| TC-49 | Build via webpack + ts-loader | C | P1 | — | bundle fixture | transform fires (RT) |
| TC-50 | **TS version matrix** 5.4/5.5/5.6/5.7/next | C | **P0** | matrix CI | run full suite each TS | green on supported range; `as any` APIs intact (suite) |
| TC-51 | **fastest-validator version** 1.12 vs latest 1.x | C | P1 | matrix | round-trip oracle each FV | green (RT) |
| TC-52 | Node 18/20/22 | C | P2 | matrix | run suite | green (suite) |
| TC-53 | Published **tarball** contains declarations matching `predefined` map + built `.js` | C | P1 | `npm pack` | inspect tarball | all 8 predefined declared; index.js/transformer.js present (file check) |
| TC-54 | Moleculer service param-schema smoke | I | P1 | moleculer dev-dep | action with `params: convertToSchema<DTO>()` | valid ctx passes, invalid rejected (RT) |
| TC-55 | Compile-time performance over 1k call-sites | perf | P2 | fixture | time the transform | linear, no O(n²) (timing) |
| TC-56 | Dispatch order-sensitivity (overlapping flags) | U | P1 | — | enum-of-strings, Buffer-named iface, predefined-named | assert intended branch wins (AST/GS) |
| TC-57 | **Property-based fuzz** over primitives/objects/unions/arrays/optionals | P | P1 | fast-check | generate type → compile → validate sample values | differential oracle: FV verdict matches TS assignability (DIFF) |
| TC-58 | `Date`/`RegExp` (non-predefined) property | N | P2 | — | `{d:Date,r:RegExp}` | characterize emitted schema (RT) |
| TC-59 | Function-valued / getter / computed-key / readonly property | N | P2 | — | convert | characterize (RT/GS) |
| TC-60 | `Record<string,T>` / `Record<'a'\|'b',T>` / number-index | I | P1 | — | convert + validate | RT |

**Coverage cross-reference (existing suite → gaps):**
- *Covered:* basic/nested/optional/extended/Omit interfaces, string enums, basic arrays incl `any[]`, object/array intersections (incl generic, conflicting-prop), unions (optional/nullable at property level), string predefined (IEmail/IDate/IUUID/IUrl), Buffer-nested, root scalars/literals/arrays, `$$strict` + property annotations, string index signature, mapped-via-enum.
- **Gaps (this plan):** nullable arrays/multi (TC-18/19, R1), unsupported-type build behavior + `unknown` (TC-46/47/16, R2), TS/FV version matrix (TC-50/51, R3), ICurrency/IMac/IObjectID + declaration fix (TC-04/05, R4), tuples (TC-16, R6), recursive *aliases* (TC-23, R7), schema-validity contract (TC-44, R8), numeric/heterogeneous enums (TC-10/11), empty/`object` types (TC-21), `convertToSchema` misuse (TC-45, R9), plugin-loader contract (TC-48/49), tarball completeness (TC-53), property-based fuzz (TC-57), dispatch order (TC-56).
