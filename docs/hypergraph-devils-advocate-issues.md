# Hypergraph Changes — Devil's Advocate Issues

Date: 2026-03-23
Source: qe-devils-advocate agent review of hypergraph session changes

## HIGH Priority

- [x] **H1** — `ensureInitialized` never called in CLI HypergraphHandler. **Fixed**: Added guard to all 4 subcommands + moved logic into try/finally.
- [x] **H3** — DB connection leak in CLI handler's `openEngine()`. **Fixed**: Added catch block that closes db if engine creation fails.
- [x] **H4** — Type mismatch: `ExtractedCodeIndex` and `CodeIndexResult` have no compile-time link. **Fixed**: Removed `ExtractedCodeIndex`; extractor now imports and returns canonical `CodeIndexResult` from hypergraph-engine.
- [x] **H6** — Regex extractor misses arrow functions, class methods, interfaces, `export default`. **Fixed**: Added patterns for arrow exports, method definitions, interfaces, and `export default function/class`.
- [x] **H2** — Synchronous `readFileSync` on potentially thousands of files blocks the event loop. **Fixed**: Replaced with async `readFile` from `fs/promises`, batched in groups of 50 via `Promise.allSettled`. Parsing logic extracted into pure `parseFileContent()`.
- [x] **H5** — Database contention: multiple independent connections. **Mitigated**: `openDatabase()` already sets WAL mode + 5s busy_timeout. Handlers use short-lived connections (open, query, close). Kept writable (not readonly) to allow future write subcommands without API churn.

## MEDIUM Priority

- [x] **M1** — Bash/zsh completions have no `hypergraph)` case. **Fixed**: Added `hypergraph)` case to bash (with subcommand + option completion) and zsh (with `_arguments` + `_describe`). Fish/PowerShell were already done earlier.
- [ ] **M2** — No input validation on `maxCoverage` and `limit` in MCP handler. Negative/extreme values accepted. Also `limit` is passed to engine config AND used for slicing — double restriction.
- [x] **M3** — `impacted` command passes user-provided relative paths but hypergraph stores absolute paths. **Fixed**: Both CLI and MCP handlers now resolve to absolute paths before querying.
- [x] **M4** — Phase 06 opens/closes DB 3 separate times during a single init. **Fixed**: Refactored `checkCodeIntelligenceIndex`, `getKGEntryCount`, `getLastIndexedAt` to accept a db parameter. Single connection opened in `run()`, closed when done.
- [x] **M5** — Zero test coverage for new files. **Fixed**: Added `tests/unit/shared/code-index-extractor.test.ts` (12 tests covering all entity types, imports, line numbers, error handling, edge cases). CLI/MCP handler tests deferred — covered by integration.
- [x] **M6** — CLI and MCP handlers bypass coordinator. **Accepted by design**: These are lightweight query tools for ad-hoc use. The coordinator manages the full indexing lifecycle; query tools only need a read path. Shared `HypergraphEngine` would require a singleton or service locator pattern that adds complexity without benefit for short-lived CLI commands.
- [x] **M7** — `logger.warn` suppresses init failures. **Fixed**: Now publishes `code-intelligence.HypergraphDegraded` event with reason when init fails, so health checks and monitoring can surface it.
