# Bound pending session history and disclose rejected lifecycle entries

## Context

Maintainer followup #910 identifies unbounded retained session batches under
persistent write failure. Retaining accepted rows is necessary, but continuing
to accept arbitrarily many rows exhausts memory. Tool result journaling occurs
after execution, so reporting a new false tool failure can repeat side effects.
This cause is independent of confirmed-byte retry progress in the partial-write
change: this branch starts from the same main base without that implementation.

## Decision

Bound persistent pending JSONL at 1024 entries and 4 MiB of serialized UTF-8.
Before admission exceeds either bound, attempt a synchronous flush. If storage
still fails, reject with SessionBufferLimitError before advancing the candidate
UUID chain, entry count, timestamp, or state. A subsequent pre-hook must recover
storage before dispatch. A single pending row over 4 MiB is rejected even when
storage is healthy. The first synchronous row remains outside the pending batch
limit. These are backlog limits, not total journal-file limits or peak request
allocation limits. Memory-only bookkeeping bypasses serialization and limits.

When a result was already produced, the durability post-hook catches only the
typed pressure error, warns that the transcript is incomplete, and returns the
actual result unchanged. Other errors retain existing behavior. A pre-hook
pressure failure blocks the later tool before its execution. This cannot prevent
the already-executed result from being absent from the transcript.

Keep accepted rows and bounded, saturating omission counters. After recovery,
append an explicit error marker with rejected-entry/result/call counts and
requires_action state, without fabricating missing results. Queue the marker
before clearing counters, then flush it through the same ordinary batch path
with bounded one-level recursion. A write failure retains its accepted bytes for
a later flush; the companion byte-progress loop also covers the marker. Resume diagnostics inspect all retained records, including a gap
outside the latest 256-entry projection. Legacy opt-in resume remains opt-in;
the marker exposes incompleteness rather than claiming authenticated recovery.
Timer flush errors warn and retain rows without an unhandled asynchronous throw.
Both timer and post-result warnings include [MCP] so the real entry-point stderr
whitelist preserves these operational diagnostics.

## Verification

Original actual public SessionStore calls accept 1100 pending rows and 50
128-KiB payloads while a real owned directory obstruction rejects every append.
Three original regression cases fail; memory-only circular-value control passes.
The fixed family passes 73 cases including byte/count limits, healthy capacity
flush, unchanged rejected metadata, accepted-row recovery, old-gap diagnostics,
automatic timer failure containment, oversized pending rows, and memory-only mode.

An actual freshly built MCP stdio producer stores an owned large value, then
returns six large reads while its journal path is obstructed. The original
executes the subsequent sentinel mutation (success true, found true). The fixed
server returns all completed reads, rejects that mutation before dispatch
(success false, found false), and after recovery records a gap with missing
result/call counts and a public resume diagnostic. The owned loopback embedder
returns 503; no paid model call or production learning database is used.

Build, typecheck, and scoped source lint are recorded before promotion. Literal
full regression exits 1 after 3 existing task-handler failures and 27
passes, with exact failure names contained in the original 13-failure baseline.
The configured bailout prevents a full-corpus green claim. Independent
review and combined replay with the partial-write branch are required before
publication. Faults exercise software I/O behavior, not physical disk durability.

## Consequences

At most 4 MiB / 1024 accepted pending rows are retained, plus one bounded gap
marker after recovery and the current serialized candidate. A rejected entry is
not silently represented as accepted history. Pending result size and total
request allocations are not claimed to be capped. Partial writes and close
failures are covered by the separate byte-progress change; aggregate conflict
resolution must preserve its progress when normal rows or gap markers are added.
