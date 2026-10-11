# Filtered generation responses are not reusable cache entries

## Context

Gemini can return an empty response with finishReason content_filter after a
blocked prompt. ProviderManager accepted this response and cached it as if it
were a reusable success. Repeating the prompt then returned the cached refusal
without contacting the configured provider. Issue #912 asks for a decision on
cache behavior and optional failover; these are separate policy questions.

## Decision

The public LLMResponseCache generation setter excludes content_filter responses.
This centralizes the rule for ProviderManager and direct cache callers. It leaves
provider dispatch, circuit breakers, cost accounting, and failover policy intact.
The blocked result still reaches the caller with its original finish reason.

Do not infer failure solely from empty content: an empty successful response may
be legitimate. Successful responses remain cacheable. CompletionResponse does
not expose a finish reason, so this decision does not invent a completion API
extension or change completion caching.

## Verification

Before the source change, the public cache retained a filtered result, and an
actual ProviderManager using an owned registered provider returned that cached
refusal instead of dispatching a second request. Both regression cases fail on
the base; empty-success and disabled-cache controls pass. The provider fixture
has all required public methods and executes no network requests. An earlier
incomplete-fixture attempt is retained as invalid evidence.

The fixed regression and selected existing cache/provider families pass all
66 tests. Build, typecheck, and scoped source lint pass. Literal full regression was
invoked and bailed with three pre-existing task-handler failures and 27 passes;
all three identities occur in the exact-base 13-failure comparison. This is
not a full-suite green claim. The final documentation-only amendment records
actual results while production and test inputs remain frozen. No paid models, credentials, or production database access
are needed; an in-memory spend ledger and a disposed owned CostTracker are used.

## Consequences

Repeated filtered requests can contact the provider again, rather than being
pinned to the cached refusal until expiry. This does not retry within the same
request or route around a provider safety decision. The caller still receives
content_filter. Ordinary cache effectiveness and public response shapes remain
unchanged.
