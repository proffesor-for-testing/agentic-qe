## Summary

Refactors the cache eviction policy from LRU to LFU.

## Failure modes

- LFU thrashing under write-heavy workloads. I believe it's unlikely in our
  current traffic shape, but it's a known theoretical weakness of LFU. Tracked
  for follow-up benchmarking: see #1234.
- Migration of the on-disk cache header format — tested by the roundtrip
  fixture in `tests/cache/migration.test.ts`.

---

### Required check (issue #401)

- [x] **Every failure mode mentioned in this PR description has either (a) a test that exercises it, or (b) a linked tracking issue.** "Unlikely" is not an acceptable substitute.
