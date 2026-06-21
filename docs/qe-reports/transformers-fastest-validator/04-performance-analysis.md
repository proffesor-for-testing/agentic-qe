# Performance Analysis: ts-transformer-fastest-validator

| Field | Value |
|-------|-------|
| **Target** | `/tmp/ts-transformer-fastest-validator/transformer.ts` (802 LOC) |
| **Type** | TypeScript custom AST transformer (tsc compile-time plugin) |
| **Performance domain** | **Build-time** tsc overhead (not runtime). Secondary: emitted schema shape vs. fastest-validator runtime cost. |
| **Date** | 2026-06-20 |
| **Analyst** | qe-performance-reviewer (fleet-b7ee9eba) |
| **Report** | 04-performance-analysis.md |

---

## Executive Summary

This is **compile-time tooling**, so all impact must be framed in terms of `tsc` build wall-clock time and CI cost, not request latency. With that calibration:

- **The dominant build-time cost is structural, not algorithmic** (Finding F1): `visitEach` (L24-26) walks **every node of every source file in the entire program** via `ts.visitEachChild`, and for **every** `CallExpression` it calls `getResolvedSignature` (L35) — an expensive typechecker operation. This runs on the whole program, including files that never touch `convertToSchema`. On a large monorepo this is the difference between a transformer that adds seconds and one that adds minutes.
- The type-graph traversal in `convert()` is **O(N) in the size of the resolved type-graph** in the normal (acyclic, non-intersecting) case, with a correct recursion guard (`history` Set) preventing infinite cycles. Good.
- However there are **two genuinely super-linear paths**: (a) intersection property merging (L488-561) re-resolves merged property types via `getPropertyOfType` + `getTypeOfSymbolAtLocation`, and (b) union-of-objects which clones each member's full subtree into a `multi` array. Both are bounded by type complexity, not pathological in typical code, but they multiply typechecker calls.
- There is a **pervasive, trivially-fixable redundancy**: `getTypeOfSymbolAtLocation` is called **twice per property** in both `convertObject` (L301 filter + L305 map) and `convertIntersection` (L507 filter + L526 single-prop map). This roughly **doubles** the most-called typechecker operation in object-heavy schemas for zero benefit.

**Severity tally (weighted, per BMAD-001):** 1 HIGH (F1) ×2.0 + 1 MEDIUM (F2) ×1.0 + 1 MEDIUM (F3) ×1.0 + 2 LOW (F5,F7) ×0.5 + 1 INFORMATIONAL (positives) ×0.25 = **5.25**, exceeding the 2.0 minimum for a performance review. The codebase is **not** clean; it has one structural HIGH and several real but modest wins.

**Bottom line:** For small projects the overhead is negligible. For **large monorepos / CI build times** the whole-program `getResolvedSignature` scan (F1) is the one finding worth engineering effort; the rest are easy single-pass / memoization cleanups with Low effort.

---

## Methodology / Scope Examined

Files examined: `transformer.ts` (entire 802 LOC, single-file transformer).

Patterns checked:
- Type-graph traversal recursion (`convert` and all `convertX` helpers, L54-573)
- Per-node program walk cost (`visitEach`/`visitNode`, L22-49)
- Redundant typechecker calls (`getTypeOfSymbolAtLocation`, `getPropertiesOfType`, `getResolvedSignature`, `getPropertyOfType`, `typeToString`, `getText`)
- Recursion-guard correctness and cost (`history` Set, L44, L292-326, L439, L502-559)
- Emitted output shape (union `multi` arrays L455-469, enum optimization L414-436 & L346-383)
- Micro-allocations (spreads L107/L592/L625/L682, `Array.from` L521, `reduce` L536/L545, `forEach` L416/L491)

---

## Findings

### F1 — [HIGH] Whole-program walk calls `getResolvedSignature` on every CallExpression

**Location:** `visitEach` L22-26, `visitNode` L28-49 (the `getResolvedSignature` call at L35).

```ts
function visitEach(node, program, context): ts.Node {
  return ts.visitEachChild(visitNode(node, program, context), childNode => visitEach(childNode, ...), context);  // L25
}

function visitNode(node, program, context): ts.Node {
  if (!ts.isCallExpression(node)) return node;          // L30 — cheap filter, good
  const typeChecker = program.getTypeChecker();          // L34
  const signature = typeChecker.getResolvedSignature(node); // L35 — EXPENSIVE, per call expression
  const declaration = signature?.declaration;            // L36
  ...
}
```

**Analysis.** The transformer factory (L18-19) is applied to **every `SourceFile` in the program**, and `visitEach` recurses into **every child node** of each file. The `ts.isCallExpression` guard (L30) cheaply skips non-calls, but **every call expression in the entire codebase** — not just the handful using `convertToSchema` — pays for `getResolvedSignature(node)` (L35). `getResolvedSignature` performs full overload resolution and argument-type inference for the call; it is one of the heavier checker APIs and is **not** something TS would otherwise compute during plain emit for most calls.

Cost model: let `C` = total number of call expressions across all compiled files. Build overhead added by this transformer is **O(C × cost(getResolvedSignature))**, independent of how many schemas you actually generate. In a large monorepo `C` is easily in the hundreds of thousands. This is almost certainly the **single largest build-time contribution** of the plugin and the reason it would show up in `tsc --extendedDiagnostics` / CI build-time regressions.

**`program.getTypeChecker()` at L34 is cheap** — TS caches and returns the same checker instance per program, so calling it per node is idle but harmless. It should still be hoisted (see F6) for cleanliness, but it is **not** the cost; the cost is L35.

**Optimization.** Narrow the work *before* the expensive call:
1. Cheaply pre-filter by callee identifier text: only proceed when the call's expression is the identifier `convertToSchema` (and it has a type argument, mirroring L42). String/identifier inspection is essentially free vs. `getResolvedSignature`. Only the surviving (tiny) set then pays for `getResolvedSignature` to confirm it resolves to the real `convertToSchema` declaration.
2. Optionally skip declaration files / `node_modules` source files entirely if the transformer config allows.

This converts the cost from **O(all call expressions)** to **O(calls literally named `convertToSchema`)** — typically a 1000×+ reduction in `getResolvedSignature` invocations on a large codebase, with identical output.

**Impact: HIGH** (on large monorepos / CI). **Effort: Low-Medium** (a few lines of identifier pre-check; must preserve the existing resolution check at L38-46 to avoid false positives from a same-named local function).

---

### F2 — [MEDIUM] `getTypeOfSymbolAtLocation` called twice per property (redundant)

**Location:** `convertObject` L298-306 (filter L301 + map L305); `convertIntersection` L504-518 (filter L507) and L526.

```ts
// convertObject — L298-306
const props = typeChecker.getPropertiesOfType(type)
  .filter((property) => {
    const propertyType = typeChecker.getTypeOfSymbolAtLocation(property, node); // L301
    return !!propertyType;
  })
  .map((property) => {
    const propertyType = typeChecker.getTypeOfSymbolAtLocation(property, node); // L305 — SAME computation again
    let resolvedType = convert(propertyType, ...);
    ...
  });
```

**Analysis.** `getTypeOfSymbolAtLocation` is the most frequently invoked checker API in this transformer (once per property, recursively, across the whole type-graph). Computing it in the `.filter` (L301) purely to test truthiness and then **recomputing the identical value** in the `.map` (L305) **doubles** the call count for every object property. The same anti-pattern appears in `convertIntersection`: L507 computes the type only to null-check it, discards it, and the value is recomputed at L526 (single-property branch).

For an object-graph with `P` total properties, this is `2P` calls where `P` would suffice. On deep/wide schemas (the realistic worst case for this tool) that is a straight ~2× on the hottest operation. The filter's only purpose is to drop properties whose type is falsy — an extremely rare edge.

**Optimization.** Single-pass `.map` that computes `propertyType` once and skips falsy results (e.g. map to `{property, propertyType}` then `filter(Boolean)`, or a plain `for` loop with `continue` on falsy). This halves `getTypeOfSymbolAtLocation` calls in object and intersection conversion with no behavior change.

**Impact: MEDIUM** (build-time, scales with schema size; one of the easiest wins). **Effort: Low.**

---

### F3 — [MEDIUM] Intersection merge re-resolves merged property types — extra O(P) checker calls + clone

**Location:** `convertIntersection` L488-561, specifically the merge branch L528-533 and the two-pass collect/process structure.

```ts
// Pass 1 — collect every property of every intersected member (L491-518)
types.forEach((type) => {
  ...
  typeChecker.getPropertiesOfType(type)                 // L505 — per member
    .filter(p => !!typeChecker.getTypeOfSymbolAtLocation(p, node))  // L507 — checker call discarded
    .forEach(property => { propsRegistry.get(name)!.push(property); });
});

// Pass 2 — for merged props, re-resolve through the intersection type (L528-533)
} else {
  const propSymbol = typeChecker.getPropertyOfType(type, name);                 // L530
  const mergedPropertyType = propSymbol ? typeChecker.getTypeOfSymbolAtLocation(propSymbol, node) : undefined; // L531
  resolvedType = convert(mergedPropertyType as any, ...);                       // L532
}
```

**Analysis.** Intersection handling is inherently more expensive than plain objects:
- Pass 1 calls `getPropertiesOfType` once per intersected member (L505) and `getTypeOfSymbolAtLocation` per property (L507) — and that L507 result is **discarded** (same waste as F2).
- For any property name appearing in **more than one** member, Pass 2 calls `getPropertyOfType(type, name)` (L530, a name-keyed lookup over the merged type) **plus** another `getTypeOfSymbolAtLocation` (L531), then `convert()` recurses into the **merged** type. So a shared property is resolved effectively three times (once per member in pass 1 via L507, once via L530/L531 in pass 2) before its subtree is even walked.

This is not exponential, but it is **super-linear in the number of overlapping properties**: cost ≈ `O(members × propsPerMember)` for collection + `O(sharedProps × (getPropertyOfType + getTypeOfSymbolAtLocation))` for merge, on top of the recursive `convert` of each merged subtree. Deeply nested intersections (`A & B & C` where members are themselves objects with intersected props) multiply this per level.

A second, subtler concern: `history.add(name)` is called per member in Pass 1 (L502) but `history.delete(name)` happens once per merged property in Pass 2 (L559). The add/delete bookkeeping is asymmetric (adds are keyed by member type name, deletes by property name), which is a **correctness smell** more than a perf issue, but it means the recursion guard state for intersections is not clean — worth a correctness pass (defer to the correctness reviewer).

**Optimization.**
- Drop the discarded L507 checker call (covered by F2 fix).
- For the merge branch, the merged property type from `getPropertyOfType(type, name)` (L530) is the only one that needs converting — but you already hold the member property symbols; if a single canonical merged symbol can be obtained once, avoid the per-member collection cost for properties you'll merge anyway. At minimum, memoize `getPropertyOfType`/`getTypeOfSymbolAtLocation` results by symbol id within the call.

**Impact: MEDIUM** (only hits code using intersections; bounded). **Effort: Medium** (entangled with correctness of the merge semantics — change carefully).

---

### F4 — [MEDIUM, output-shape] Union-of-objects emits a `multi` array cloning each member's full subtree

**Location:** `convertUnion` L455-469 (the multi-member branch); positive counterpart at L414-436.

```ts
return factory.createArrayLiteralExpression(
  types.map((type) => {
    let result = convert(type, ...);   // L457 — full recursive walk + emit per union member
    ...
  }),
);
```

**Analysis (build-time).** For a union of `k` object types, `convert` recurses fully into **each** member (L457), so build cost is the sum of all members' subtree sizes — linear in total type-graph size, which is correct and unavoidable for distinct shapes. No blow-up here; characterized for completeness.

**Analysis (emitted-shape → runtime).** The emitted schema is fastest-validator's `multi` (an array of sub-schemas). At **validation runtime**, fastest-validator tries each branch of a `multi` until one passes — so a wide union produces O(k) validation attempts per value. The transformer does the right thing by collapsing **all-literal** unions into a single `enum` (L421-425) rather than a `multi` of `equal` schemas (see Positives). But unions mixing objects and literals, or unions of many object shapes, still emit large `multi` arrays. This is mostly fastest-validator's concern, but the transformer **chooses** the shape: where members share a discriminant, a `multi` is inherently O(k) at runtime with no early-out.

**Optimization (output shape).** Out of scope to fully implement here, but a future enhancement: detect a common discriminant property across union members and emit a discriminated shape if/when fastest-validator supports it, or at minimum order `multi` members cheapest-first. Low priority.

**Impact: MEDIUM** but **mostly runtime-of-generated-code**, not build-time. **Effort: High** (semantic feature). Flag, don't fix now.

---

### F5 — [LOW] `program.getTypeChecker()` and repeated `typeToString`/`getText` calls

**Location:** L34 (`getTypeChecker` per call expression), L39 (`declaration.name?.getText()` per matched declaration), L198 & L699 (`typeToString`).

**Analysis.** `getTypeChecker()` (L34) is cached by the program (cheap, see F1) — hoist for cleanliness only. `declaration.name?.getText()` (L39) does a source-text scan but only runs for calls that already resolved to a `FunctionDeclaration` (post-L38), a small set — negligible. `typeToString` (L198 in `convertPrimitive`, L699 in `parseLiteralBoolean`) is moderately expensive but called once per primitive/boolean-literal leaf, which is fine; note L199 then uses the stringified type **directly as the fastest-validator type name** (`number`/`string`/`boolean`), which is a neat trick but brittle if TS ever returns a widened/aliased string — not a perf issue.

**Impact: LOW.** **Effort: Low** (hoist checker; leave the rest).

---

### F6 — [LOW] `getTypeChecker()` resolved per-node instead of once per program

**Location:** L34 inside `visitNode`.

**Analysis.** Functionally folded into F1/F5: the checker is cached so this is not a cost, but resolving it once in `transformer()` (L18) and threading it down (it is *already* threaded everywhere else as `typeChecker`) removes the per-node call and the `program` parameter from the hot `visitEach`/`visitNode` path. Purely cosmetic/idle-cycle.

**Impact: LOW.** **Effort: Low.**

---

### F7 — [LOW] Micro-allocations: spreads, `Array.from`, `reduce`, immutable node updates

**Locations:** annotation spread L107 (`[...extractJsDocTagInfos(a), ...extractJsDocTagInfos(b)]`); `Array.from(propsRegistry.entries())` L521; `reduce` allocations L536-539 (`result.concat(...docs)` builds a new array each iteration → O(annotations²) in the worst case) and L545-554; immutable `updateObjectLiteralExpression([...type.properties, ...])` in `applyOptional`/`applyNullable`/`applyJSDoc` (L592, L625, L682).

**Analysis.** All are small constant-factor allocations relative to the checker calls, so they do not move the needle on build time. The one worth a glance is L536-539: `annotations.reduce((result, p) => result.concat(...docs), [])` reallocates the accumulator on every property in an intersection-merged set — `concat` is O(n) so the reduce is O(n²) in the number of contributing declarations. Annotation counts are tiny in practice, so impact is theoretical. `extractJsDocTagInfos` (L730-801) itself has a multi-tier fallback with a regex (`/@([\$\w]+)\s+([^\s*]+)/g`, L791) and `getLeadingCommentRanges` re-scanning `getFullText()` (L787) — only reached when faster APIs return nothing, so amortized cheap, but it does re-read full source text per declaration in the last fallback.

**Impact: LOW** (constant factors). **Effort: Low.** Replace `Array.from(...).map` with direct `for...of` over `.entries()`; use `push`/flat instead of `reduce`+`concat`.

---

## Positives (calibrated credit)

1. **Recursion guard is present and correct for the common case** — `history: Set<string|undefined>` is threaded through every `convert` call (created fresh at L44), checked before descending into named objects (L292-294), added on entry (L296) and removed on exit (L326). This prevents infinite recursion on self-referential / mutually-recursive types and emits a safe `{ type: 'any' }` on cycle detection (L293). This is the correct, low-overhead approach (Set add/has/delete are O(1)).
2. **All-literal union → `enum` optimization (L414-436)** — instead of emitting a `multi` array of N `equal` sub-schemas (which fastest-validator would evaluate branch-by-branch at runtime), the transformer detects when every union member is a literal (L416-419) and collapses to a single `enum` with a `values` array (L421-425, building on `convertEnum` L346-383). This is **both** a smaller emitted schema **and** materially cheaper validation runtime (one set-membership check vs. N branch attempts). Genuine, thoughtful optimization.
3. **Single-member union collapse (L442-453)** — after stripping `undefined`/`null`, a union that reduces to one type emits that type directly (with `optional`/`nullable` flags) rather than a one-element `multi`. Avoids a needless wrapper at both build and runtime.
4. **Cheap pre-filter on node kind (L30)** — `visitNode` bails immediately on non-call nodes, so the expensive path (F1) at least only touches call expressions, not literally every node. (The remaining problem is it touches *all* call expressions — F1.)

---

## Prioritized Optimization List

| # | Optimization | Finding | Build-time Impact | Effort | Notes |
|---|--------------|---------|-------------------|--------|-------|
| 1 | Pre-filter call expressions by callee name before `getResolvedSignature` | F1 | **HIGH** (large monorepos/CI) | Low-Med | Biggest win; preserve L38-46 resolution check |
| 2 | Single-pass property iteration (drop duplicate `getTypeOfSymbolAtLocation`) | F2 | **MEDIUM** (~2× on object-heavy schemas) | Low | Easiest win; `convertObject` L298-306, `convertIntersection` L507/L526 |
| 3 | Memoize/dedupe intersection property resolution; drop discarded L507 call | F3 | MEDIUM (intersection-using code only) | Med | Tangled with merge correctness — change carefully |
| 4 | Hoist `getTypeChecker()` to `transformer()`; drop per-node `program` plumbing | F5/F6 | LOW (idle cycles) | Low | Cleanliness |
| 5 | Replace `Array.from().map`, `reduce`+`concat` with loops/flat | F7 | LOW (constant factors) | Low | Optional |
| 6 | Discriminated-union / cheaper `multi` ordering for emitted schema | F4 | LOW build / MED runtime-of-output | High | Future feature; flag only |

---

## Big-O Summary of `convert()` Traversal

Let `T` = number of distinct nodes in the resolved type-graph (objects, props, array items, union/intersection members) reachable from the root type.

- **Normal case (acyclic objects, arrays, simple unions):** `O(T)` recursive `convert` calls, each doing O(1)–O(props) checker work. Linear. Correct.
- **Constant-factor inflation:** ~**2×** on per-property checker calls due to F2 (the duplicate `getTypeOfSymbolAtLocation`).
- **Cycles:** bounded by the `history` guard — a back-edge terminates in O(1) emitting `{type:'any'}`. No blow-up.
- **Intersections:** `O(members × propsPerMember)` collection + `O(sharedProps × extra checker calls)` merge, recursively per level (F3). Super-linear in overlap but not exponential.
- **Unions of objects:** `O(sum of member subtree sizes)` at build (linear), but emits an O(k) `multi` that costs O(k) at validation **runtime** (F4).
- **Program-level (the real cost):** independent of any single schema — `O(C)` where `C` = **all call expressions in the whole program**, each paying `getResolvedSignature` (F1). This dominates everything above on a large codebase.

---

## Clean-Justification Note

This review is **not** "no issues found." Seven findings are grounded in specific lines (F1 L35, F2 L301/L305, F3 L530-531, F4 L455-469, F5 L198/L699, F6 L34, F7 L521/L536). The weighted finding score is 5.25 (≥ 2.0 minimum, BMAD-001). The dominant, engineering-worthy item is F1; the rest are calibrated as easy cleanups appropriate to compile-time tooling.
