# Retry session journal writes from confirmed byte progress

## Context

appendFileSync may write a prefix before a later write fails. Retaining the entire
batch on failure then retrying it duplicates completed rows or inserts a prefix
inside a JSON record. A failed partial first append similarly leaves bytes before
the next accepted first row. Metadata acceptance alone does not repair file bytes.
Maintainer issue #910 identifies this partial-append failure mode.

## Decision

Flush buffered rows through an owned append descriptor and writeSync loop. Retain
the UTF-8 byte offset after each successful short write. A later flush reopens the
file and writes only the remaining suffix, including rows queued after the failed
flush. A nonpositive write rejects rather than spinning. Retire completed bytes
before closing so a close error cannot duplicate the completed batch. Close the
descriptor even when a write throws.

Publish the first row through an exclusive staging file and rename only after its
writes and close succeed. A failed staging write/close leaves metadata unchanged
and removes only the staging file this attempt created. Existing staging files
are never removed after an exclusive-open failure. Do not retry close after it
has thrown: the operating system may already have released that descriptor.
This preserves the existing first-write acceptance guarantee; it does not add
fsync or claim survival of physical power loss.

## Verification

Actual public SessionStore calls with controlled lower I/O faults write real
owned temporary files. The base fails four cases (batch partial write, partial
first row, batch close failure, first close failure); two short-write/open-error
controls pass. Fixed journal/resume/middleware families pass 72 cases, including
Unicode bytes, subsequently queued rows, accepted metadata, and descriptor cleanup.

Actual built MCP stdio runs initialize, tools/list, tool calls, and shutdown.
An explicit --require preloader affects only its owned child's journal paths.
The original bundle fails partial-flush recovery with corrupt JSON while the
normal protocol control passes. The fixed bundle passes both cases, preserving
all unique lifecycle rows, parent lineage, and public resume acceptance. Bundle
and original/fixed source hashes are retained with raw receipts. Early marker-only
evaluator attempts are retained as invalid; the evaluator now requires the actual
injected exception diagnostic and validates file contents, not just a marker.

Build, typecheck, and scoped source lint pass. The literal full regression
invocation exits 1 after three existing task-handler failures and 27 passing
tests; all three failure identities occur in the exact-base comparison of 13
failures. The configured bailout prevents a full-corpus green claim. Tests use owned project roots and temporary stores, no production
learning database or paid model requests. Faults simulate I/O failures; these
are not claims of physical disk failure or hardware durability.

## Consequences

A retry preserves confirmed bytes instead of replaying them. File ownership is
per session; this change does not coordinate multiple external writers to one
journal. Buffer capacity and automatic timer failure handling remain separate
causes. A failed staging cleanup remains visible as an error and prevents unsafe
reuse of that exclusive staging path.
