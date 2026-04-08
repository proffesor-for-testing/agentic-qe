## Summary

Ships a new async path for the worker pool.

## Failure modes

- Task starvation under backpressure. I don't think this can happen with the
  current queue bounds, but we haven't stress-tested it.

---

### Required check (issue #401)

- [ ] **Every failure mode mentioned in this PR description has either (a) a test that exercises it, or (b) a linked tracking issue.**
