# ADR: Unambiguous convergence state fingerprints

Status: Proposed for review

Date: 2026-10-11

## Context

The convergence tracker reports distributed health by comparing state fingerprints. Its delimiter-joined encoding aliases one set element `a,s:b` with two elements `a` and `b`. Its 32-bit polynomial hash also gives distinct sets containing `Aa` and `BB` the same fingerprint. Both public producer pairs are therefore falsely reported as converged.

## Decision

Encode each semantic entry as a structured JSON tuple, sort the entries and relevant owner/member collections deterministically, and hash the structured encoding with SHA-256. Preserve the existing comparison fields: register value/winner, nonzero counter contributions, and active typed set members. Ignore set allocation tags, tombstoned members, zero counter contributions, and store version as before.

## Alternatives

Changing only the hash leaves delimiter aliases unchanged. Escaping a bespoke delimiter format adds a second serialization contract. Comparing full fingerprints as raw state strings increases retained diagnostics and exposes values unnecessarily.

## Consequences

Fingerprint strings change and become longer. This tracker computes fingerprints locally rather than merging persisted fingerprints. The digest is collision-resistant semantic evidence, not authentication, a proof of eventual convergence, or a guarantee against every mathematical hash collision. Existing JSON serialization behavior for register values is retained; arbitrary non-JSON value semantics are not newly defined.

## Verification

Seven public producer/control cases yield two original failures and five passes. Controls cover typed values, dictionary/set insertion order, active membership after removal, zero counter contributions, and nonzero ownership. The corrected tracker/CRDT family passes 115 tests. The initial empty-set control accidentally compared an absent key with an existing empty key; its failed attempt is retained separately and corrected to compare identical key presence before reproducing the two intended failures. Typecheck, scoped lint, and full build pass. Literal full npm test stops under default bail on the original-source task-handler failure family; all observed failure identities match the verified baseline. Unexecuted files have no verdict, and the full suite is not claimed green.
