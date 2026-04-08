## Summary

Refactors the session cache lookup.

## Failure modes

- Cache key collision across sessions. Highly unlikely given our key
  derivation, but there's no bounded test for it.

---

### Required check (issue #401)

- [x] **Every failure mode mentioned in this PR description has either (a) a test that exercises it, or (b) a linked tracking issue.**
