# ADR: Publish the domain-tool result saving contract

## Context

Issue #933 identifies ten domain tools whose shared handler already supports `saveResults: false` and otherwise saves result artifacts. Their MCP schemas did not expose the option, their descriptions omitted the default file writes, and successful responses supplied paths without an explicit saving report. Clients could not discover or reliably explain this existing behavior.

## Decision

Expose an optional boolean `saveResults` with default true in all ten tool definitions and parameter types. Describe the `.agentic-qe/results/` destination and the opt-out. Use the existing `describeSavedResults` helper in each result mapper to supply `resultsSaved`, `savedFiles`, and `resultsNote`. Add optional report fields to result types for compatibility with existing typed consumers.

Keep handler validation, task execution, the result writer, and server-state updates unchanged. A false option disables result artifact writes, not in-memory task bookkeeping. The report reflects actual returned paths; an enabled request without files does not claim that saving succeeded.

## Verification

A built MCP server is exercised over stdio in an owned temporary project. All ten tools are discovered through tools/list and called with both false and the omitted default. Tests verify filesystem preservation for false, actual saved paths for defaults, and explicit response reports. Existing test generation and invalid boolean input are controls. The original code fails 30 contract assertions while three controls pass. No model calls or production databases are used.

## Limits and consequences

The accessibility and chaos backends currently return guidance; these tests verify their protocol and artifact behavior, not a browser audit or injected fault. Other backend capabilities are unchanged. The additive report fields follow the existing test-generation contract. The default repository test command still encounters independently reproduced task-handler failures; passing protocol tests do not imply a green whole-repository suite.
