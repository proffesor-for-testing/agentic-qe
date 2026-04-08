## Summary

Inlines the config loader.

## Failure modes

- Config file with a trailing newline. I can't see how this would break
  the parser, but it's also not tested.

---

### Required check (issue #401)

- [x] **Every failure mode mentioned in this PR description has either (a) a test that exercises it, or (b) a linked tracking issue.**
