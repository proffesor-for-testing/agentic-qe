## Summary

Speeds up the index warmup for `aqe init` by skipping files > 1 MB.

## Failure modes

- A legitimate source file > 1 MB. This is an edge case we don't need to
  handle in the initial rollout — tracked in #9876 for the next iteration
  when we have telemetry on file-size distribution.

---

### Required check (issue #401)

- [X] **Every failure mode mentioned in this PR description has either (a) a test that exercises it, or (b) a linked tracking issue.**
