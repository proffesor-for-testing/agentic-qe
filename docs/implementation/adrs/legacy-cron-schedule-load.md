# Disable invalid legacy cron entries during schedule loading

## Context

Before strict cron validation, persisted schedules could contain unsupported
ranges such as `0 22-27 * * *`. Current loads accept these entries as enabled and
due, but markExecuted and re-enabling throw when calculating the next run. Issue
#913 identifies this compatibility gap. Treating the whole file as corrupt would
remove valid schedules alongside the invalid entry.

## Decision

Use the current cron parser when validating each loaded entry. Invalid expressions
produce a derived disabledReason and enabled=false, with a warning when an enabled
entry is disabled. Both ordinary and locked loads share the same parser. Valid
entries keep their stored nextRun and enabled state; stale derived reasons clear
once the expression is corrected. Existing explicit re-enable validation remains.

Ordinary loading does not rewrite the file. A subsequent existing locked mutation
persists the normalized entries along with the mutation. This avoids adding an
unlocked write during reads or silently discarding historical schedules. The
workflow list command renders the disabled reason so operators can correct it.

This scope uses syntactic cron validity and does not change the existing calendar
search policy for syntactically valid impossible dates. PersistentScheduler is a
CLI persistence service and has no MCP consumer; no new MCP capability is added.

## Verification

Owned temporary persisted files exercise the public scheduler and actual Commander
workflow list action. On the base, invalid entries remain enabled, survive locked
loads as enabled, and lack the CLI diagnostic (three failures). A valid schedule
CRUD/enable control passes. Fixed regression plus current scheduler, cron, and CLI
exit-status families pass 63 tests. Temporary fixtures are removed after each case.
Build, typecheck, and scoped source lint pass. Literal full regression was
invoked and bailed with three pre-existing task-handler failures and 27 passes;
all three exact failure names occur in the baseline 13-failure comparison.
This is not a full-suite green claim. The final documentation-only amendment
records actual results while production and test inputs remain frozen. No default user schedule file or production learning database is read
or changed by the regression tests.

## Consequences

Operators retain the original schedule identity, expression, pipeline path, and
history. A read-only listing shows the disabled view; file persistence waits for
an existing locked mutation. Old valid schedules do not need migration or a new
next-run calculation merely to be loaded. Warnings explain disabled entries,
and the public optional disabledReason field carries that reason to CLI callers.
