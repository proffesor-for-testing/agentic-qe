# ADR: Restore executable current initialization coverage

## Status

Implemented, pending immutable revision review and required gates.

## Context

The platform init E2E suite imports the deleted init-wizard-migration module and asserts obsolete V2 migration behavior. Explicit collection fails before any test runs. Its .e2e.test.ts suffix is excluded by normal test configuration and the journey-root integration shard, hiding this broken coverage.

## Decision

Restore the suite against the current InitOrchestrator and move it to the enabled top-level integration directory. Remove removed-module mocks and the obsolete V2 assertion. Mock writeVersionToDb at its current init-wizard-steps boundary. Keep ProjectAnalyzer, SelfConfigurator and orchestration real while mocking database, code-index, installer, hook, MCP-config and worker side effects.

## Scope and cost

There are no production changes, external services, model calls or learning-database changes. Temporary fixture projects contain only owned files and are removed after each test. The added enabled suite is eleven small integration tests; duration is allowed to be zero milliseconds rather than depending on clock resolution. This exercises orchestration and configuration, not actual side-effect implementations or MCP protocol.

## Verification

The original suite explicitly collected with a private configuration fails on its deleted migration import with zero tests run. The replacement passes eleven tests through the real current orchestrator: TypeScript/Vitest configuration, ordered steps and side-effect call order, persistence rejection preventing downstream effects, explicit no-MCP behavior, skills/agents, version marker and result summaries. The current journey-root workflow selector matches the new filename; this is source-based CI discovery evidence, not hosted CI success. Existing CLI idempotence coverage remains separate and unchanged.

Build and typecheck pass; scoped unchanged orchestrator ESLint and explicit syntax parsing of the new test pass. The repository typed test lint configuration excludes tests; no typed test-lint claim is made. Literal one-worker npm test was invoked and stops at existing task-handler failures, with all failure identities present in the original baseline. Full-suite green is not claimed.
