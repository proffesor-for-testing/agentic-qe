# ADR: Total ordering for LWW register writes

Status: Proposed for review

Date: 2026-10-11

## Context

The LWW register accepts explicit numeric timestamps, including zero. Treating timestamp zero as an unwritten sentinel allows older writes and repeated deliveries to replace an existing value. Exchanging two zero-timestamp states can leave replicas with opposite values. Separately, locale collation can compare distinct canonically equivalent Unicode owner IDs as equal, leaving equal-timestamp replicas unable to select a common winner.

## Decision

Use the existing zero version to identify an unwritten register. Compare distinct owner IDs by JavaScript code-unit order when timestamps tie. Keep the persisted state format and timestamp precedence unchanged. A written undefined value is initialized just like any other write.

## Alternatives

Disallowing zero timestamps would narrow the existing API. Normalizing owner IDs would merge distinct existing identifiers. Locale collation cannot supply the required total order for opaque identifiers.

## Consequences

Epoch-zero writes obey the same rejection and replay rules as ordinary writes. Distinct Unicode IDs have a deterministic winner without changing their stored spelling. Non-ASCII tie ordering can change from locale collation; mixed old and new replicas may resolve such conflicts differently during an upgrade. This correction does not introduce timestamp validation, authenticate owners, or guarantee convergence between incompatible implementations.

## Verification

Seven public register cases reproduce five original failures with two passing controls: zero-time convergence, rejecting stale writes after zero, replay idempotence, distinct Unicode owner ordering, and written undefined initialization. Ordinary positive-time convergence and first negative-time writes remain valid controls. The corrected focused register family passes 19 tests. The broader CRDT/register family passes 112 tests; typecheck, scoped lint, and full build pass. Literal npm test was run with one worker and stopped under default bail on the known task-handler failure family. Each observed failure matches separately reproduced original-source failures. Unexecuted files have no verdict; the full suite is not claimed green.
