# Quarantine unversioned Nomic real-model cache entries

## Context

The previous fallback provenance fix separates newly generated pseudo vectors
from genuine model vectors. It cannot establish the provenance of older persisted
entries: those may contain pseudo vectors stored under the real model name.
Importing such a cache currently short-circuits backend execution and reports the
old vector as genuine. Maintainer issue #913 identifies this upgrade hazard.

## Decision

Add an optional key namespace to EmbeddingCache get/set/has. Existing callers
without a namespace retain their exact existing key format. Nomic real-model
entries use verified-backend-v1; pseudo entries retain their existing namespace.
The version participates only in the cache key. Exported entry.model and public
EmbeddingResult.model continue to report the actual model name.

Unversioned real-model entries remain in the bounded cache but are not reused by
Nomic. A backend computes a replacement when available; fallback computes and
labels a pseudo vector otherwise. Strict consumers retain their existing behavior
when the backend is unavailable. Newly produced genuine entries, including those
exported/imported later, remain reusable offline.

This is a cache compatibility boundary, not cryptographic provenance. A caller
can fabricate cache data; the version does not authenticate it. No production
cache files or learning databases are modified by the change or its tests.

## Evidence and validation

An actual public cache export/import fixture contains the historical unversioned
real-model entry. Public NomicEmbedder calls use an owned loopback HTTP backend.
On the base, text fails to recompute despite an available backend and cached
chunks report a genuine model during an outage. Both fail; the genuine persisted
cache control passes. Fixed tests pass all three, alongside 44 existing cache,
Nomic, and backend controls (47 total). The HTTP server serves only deterministic
owned vectors, not an external model. Build, typecheck, and scoped source lint pass. Literal full npm test was invoked
and bailed with three pre-existing task-handler failures and 27 passes. All
three failure names occur in the exact-base 13-failure comparison; this is not
a full-suite green claim. The final documentation-only amendment records
these results while production and test inputs remain frozen.

## Consequences

Some previously valid genuine unversioned entries also recompute once because
old entries cannot distinguish genuine and pseudo origins. The LRU capacity and
vector ownership/copying behavior remain unchanged. The namespace is specific to
Nomic's real-backend producer; other EmbeddingCache clients keep legacy behavior.
