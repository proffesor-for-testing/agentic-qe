# ADR: Reject impossible token-bucket waits

## Status

Accepted for implementation, pending exact-revision validation and independent review.

## Context

RateLimiter.wait retries consume until the requested tokens become available. Refills are capped at the resolved bucket maxBurst, so a cost above that capacity can never succeed. A real public API call remains pending for both a default bucket and a smaller endpoint bucket, while a valid request succeeds. Endpoint-specific limits must determine this boundary rather than the global default alone.

## Decision

Reject an impossible wait with RangeError before consuming tokens or scheduling retries. Keep consume's synchronous denial behavior, existing invalid-cost validation, ordinary refill waits, exact-capacity requests and zero-cost requests unchanged. An unmatched endpoint continues to use the default bucket.

## Scope and cost

The change affects only waits whose cost exceeds the selected bucket capacity. It adds one endpoint-configuration lookup per wait and does not add timers, a deadline option or a cancellation API. Middleware currently uses check; repository CLI and MCP tools do not expose wait, so protocol calls cannot demonstrate this public-library wait boundary. The regression uses the real RateLimiter API without a database or external provider.

## Verification

Original production code fails two new bounded fake-clock regressions and passes 32 family controls. A real Node public-API probe records both impossible requests pending after a bounded observation and a valid request allowed. The same probe and focused family must pass after the change; build, typecheck, lint and applicable broader regression evidence are recorded before publication. No claim is made that arbitrary ordinary waits are bounded when demand continues.

The focused fixed family passes all 34 tests; build, typecheck and explicit non-ignored ESLint checks pass. The required full npm test invocation fails in the existing task-handler family and bails early. An unbailed original-versus-fixed replay of that complete family produces the same 13 failing test identities and 50 passing tests. This is a baseline comparison, not a green full-suite claim. The existing offline Ruflo security command is unavailable (ENOTCACHED); no scanner was downloaded.
