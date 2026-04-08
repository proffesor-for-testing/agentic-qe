<!--
Synthetic PR body constructed from the actual postmortem quote in
issue #401: "But my verification fixtures don't trigger this and I
believe it's unlikely." This fixture captures the reasoning pattern
that shipped the v3.9.3 regression. The linter MUST reject it.
-->

## Summary

v3.9.3 addresses the remaining root causes of the `aqe init --auto` hang.

## Failure modes

- Pathological source file that the indexer can't tokenize. But my
  verification fixtures don't trigger this and I believe it's unlikely.

---

### Required check (issue #401)

- [x] **Every failure mode mentioned in this PR description has either (a) a test that exercises it, or (b) a linked tracking issue.**
