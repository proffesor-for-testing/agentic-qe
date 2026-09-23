# Task cancellation status

`task_cancel` accepts a cancellation request for a queued or running Queen task.
Repeated requests for the same cancelled task succeed without publishing another
cancellation event. Completed and failed tasks still reject cancellation.

For a running task, `task_cancel` and `task_status` expose
`cancellationResultPending`. A value of `true` means no result from the assigned handler or domain event has
been observed since the request. A value of `false` means a result notification was
received, or that the task was cancelled while queued. It does **not** prove
that work in another process or an external service stopped.

The task remains `cancelled` if an already-running handler later reports success
or failure. That late report cannot change the Queen task to `completed` or
`failed`, increase normal completion or failure counts, retry the task, or enter
the ordinary successful outcome path. A handler may still perform effects after
the request. Its capacity slot remains occupied until its result arrives, so
new tasks are not admitted on a slot whose work is still running. Stop external
work separately when its effects matter. If a handler never reports a result,
the slot remains occupied; a bounded abort and cleanup receipt are still needed.

The CLI reports a cancellation request and displays the same pending-result
field in task status. A new CLI process does not share an in-memory task session
with a prior process; use a persistent MCP session for the task lifecycle.

This is one part of [issue #707](https://github.com/proffesor-for-testing/agentic-qe/issues/707).
Aborting in-flight work, process-tree termination, and cleanup acknowledgement
remain separate work.
