# ADR: Preserve literal identities during test retries

## Status

Accepted for implementation, pending exact-revision gates and independent review.

## Context

Retry requests identify a failed test by its file and literal assertion name. Jest's regex path option interprets bracket and parenthesis characters in a real filename; a requested bracket-path retry can execute a different passing file and falsely report recovery. Separate name-filter arguments and positional filenames can also be parsed as flags when their literal values start with a dash. Native runner fixtures reproduce these failures without a model or database.

## Decision

Use Jest's runTestsByPath option for literal filenames, supported by tested Jest 29 and 30. Keep the existing regex escaping of assertion names, but attach each name pattern to its option using equals syntax. Place positional filenames after --, following every runner option. Apply the same argument boundary to Vitest, Jest and Mocha. Whole-file retries still omit the name filter.

## Scope and cost

The fix changes argument construction only; no extra runner executions or filesystem operations are added to production retries. Regex matching still permits a suite prefix around an assertion name, preserving the existing contract. This does not redesign runner discovery, retry policy or test-report validation. Existing test harnesses prepend their private config/root options before the production delimiter rather than after it.

## Verification

Actual public RetryHandlerService calls execute real installed Vitest, isolated Jest 29/30 and Mocha processes. The initial native run fails the target, then a controlled second run can pass; marker files prove the requested callback ran and a decoy did not. The same final test family produces thirteen original failures and fourteen passing controls, versus twenty-seven fixed passes without skips. Cases cover regex-special filenames, leading-dash names/files, whole-file retries and ordinary selections. Isolated optional Jest/Mocha executables are selected through explicit test environment variables; absent executables are not represented as validated. Build, typecheck, scoped lint and broader baseline limitations are recorded privately before publication.

The full four-file retry family passes 33 tests. Production build, TypeScript check and scoped production ESLint pass. Literal npm test was invoked with one worker: it stops at four pre-existing task-handler failures, with 27 passing tests. All four exact failure identities occur in the original unbailed task-handler baseline (13 failures, 50 controls); the full suite is not green.
