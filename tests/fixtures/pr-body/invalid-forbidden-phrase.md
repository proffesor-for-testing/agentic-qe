## Summary

Adds concurrency guards around the memory cache writer.

## Failure modes

- Simultaneous writers to the same key. I believe it's unlikely because we
  only have one writer in practice.

---

### Required check (issue #401)

- [x] **Every failure mode mentioned in this PR description has either (a) a test that exercises it, or (b) a linked tracking issue.**
