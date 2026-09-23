# Workflow approval gates

Set `approval: true` on a workflow step to require an explicit `approveStep(executionId, stepId)` response before its action runs. A rejection or an unanswered request prevents the step action and its output mapping. The default wait is five minutes; after that, the request expires and the step fails.

```yaml
- id: deploy
  name: Deploy
  domain: quality-assessment
  action: gate-check
  approval:
    expiresAfter: 300000
    message: "Approve deployment?"
```

Set `expiresAfter: 0` to disable the approval-specific timer; the overall workflow timeout still applies. The older `autoApproveAfter` field is accepted as a compatibility alias for `expiresAfter`, but **it no longer approves the step when the timer ends**. Update pipeline definitions that used unattended auto-approval; they now fail closed instead.

The `workflow.StepAwaitingApproval` event reports `expiresAfter` in milliseconds. Consumers of its former `autoApproveAfter` field should migrate to the new field. Valid positive waits are at most 2,147,483,647 ms, the largest timeout supported reliably by the Node.js timer used here.

An approval gate currently accepts calls to `approveStep` from any in-process caller with the execution and step IDs. It does not authenticate a person or bind approval to an action/input digest. Do not treat this gate alone as proof of human authorization for privileged actions; [issue #673](https://github.com/proffesor-for-testing/agentic-qe/issues/673) tracks that broader authorization contract.
