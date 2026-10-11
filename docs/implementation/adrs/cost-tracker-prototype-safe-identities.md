# ADR: Own caller identities in cost pricing and report dictionaries

## Status

Accepted for implementation; independent promotion review required.

## Context

Maintainer follow-up #914 identifies model names such as `constructor` and
`toString` colliding with inherited object properties in cost summaries.
The same dictionary assumption also affects the pricing lookup and per-provider
model usage report. Public `recordUsage` accepts these string identities: an
unknown model can acquire NaN pricing, and aggregation can concatenate inherited
functions or mutate inherited objects. An accepted provider named `__proto__`
does not become an own numeric bucket. Merged #878 fixed ordinary external
provider accumulation but did not address all prototype property semantics.

An original-source regression exercised the actual `CostTracker` API with
`constructor`, `toString`, and `__proto__`: seven cases failed, while the ordinary
paid/free accounting control passed. Tests restore any inherited properties
changed by the original implementation so the replay cannot contaminate other
cases. No provider request, paid model, persistence or learning database is used.

## Decision

Require an own pricing-table entry before treating a model as priced. Preserve
the registry fallback and existing zero-cost behavior for unknown/local models.
Build the provider, model-cost, and provider-model-usage report dictionaries with
null prototypes. Keep their existing enumerable built-in zero buckets and public
record shapes; JSON serialization retains caller keys including `__proto__`.

All instances of these lookups in the cost tracker are handled together. No
provider selection, billing rates, budget enforcement or live configuration is
changed. This is one dictionary-identity correction, not separate PRs for each
special spelling or report consumer.

## Consequences

Ordinary named models and registered providers retain their prices and totals.
Caller identities cannot select inherited values or modify inherited accounting
objects. Returned dictionaries have no prototype methods; consumers should use
`Object.hasOwn` rather than invoke `hasOwnProperty` on a report dictionary.
The documented interfaces remain records and serialized reports remain objects.

## Verification

Focused producer regressions cover finite unknown-model pricing, own numeric
summary buckets, JSON round trips, exact per-provider token/request totals,
prototype immutability, paid prototype-named providers, and ordinary paid/free
controls. The original eight-case run had seven failures and one passing
control; the corrected tests plus the existing cost tracker and external-provider
families passed all 40 cases. Build and typecheck passed, source-scoped lint passed, and an actual built-module
smoke check passed. Repository-wide lint reported 356 errors and 63 warnings;
none refer to the changed source file. Baseline comparison is recorded by the
campaign reviewer rather than treating this as a clean global lint result.

The literal one-worker `npm test` regression invocation stopped at the existing
MCP task-handler failures: two failed and 27 passed cases, with the corpus
bailing before all 1,149 files executed. Both failed test identities are in the
reviewer's original-source 13-failure task-handler comparison. This is not a
claim that the full suite passes. No unrelated handler or fixture changes were
added to this cost-accounting fix.
