# ONNX embedding caches identify the requested transform

## Context

The public EmbeddingGenerator supports changing curvature with updateConfig and
per-batch configuration overrides. Its cache key included only model, whether the
space was hyperbolic, and text. Consequently, after generating a vector at
curvature -1, requesting the same text at curvature -4 returned the old vector.
Batch overrides also received that stale vector. These are supported typed inputs;
this decision does not assert a delimiter collision using unsupported model names.

## Decision

Encode model, normalization, hyperbolic mode, effective curvature, and text in a
JSON tuple. Curvature is irrelevant to Euclidean embeddings, so that key component
is null in Euclidean mode. Cache capacity does not affect vector identity and is
excluded. Previously generated entries remain bounded by the existing LRU and
can be reused if the caller restores the same configuration.

This preserves the public embedding shape, model selection, transform calculation,
and batch restoration behavior. It neither installs an inference backend nor
changes how external model execution is configured.

## Evidence and validation

A deterministic normalized-vector inference fixture replaces only inference; the
public generator, cache, transform, batch, and metadata execute actual code. On the
base, two requested-curvature cases fail and the ordinary cache-hit control passes.
With the tuple, all three pass, including default configuration restoration after
a batch override. No model downloads, paid requests, or production database access
are required.

The existing ONNX test family passes 70 cases and fails 30 adapter cases on the
base because the optional local inference package is absent. The fixed family
has the identical 30 failures plus all three new passing producer cases. The
70 existing cases include a local test implementation and are not represented
as public runtime proof. Build, typecheck, and scoped source lint pass. Literal full npm test was invoked
and bailed with four pre-existing task-handler failures and 27 passing cases;
all four failure identities occur in the exact-base 13-failure comparison.
This is not a full-suite green claim. The final ADR amendment records these
results; production and test inputs were frozen throughout those gates.

## Consequences

Configuration changes recompute rather than incorrectly reuse transformed vectors.
Cache keys are internal in-memory identities; no persistent cache migration or
public API change is needed. Cache size bounds remain unchanged. The inference
fixture proves transform/cache correctness, not the quality of a real model.
