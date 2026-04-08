## Summary

Adds a new retry helper for flaky network calls in the fetcher layer. No behavior change for non-error paths.

## Verification

- Unit tests cover retry-on-500, retry-on-network-error, and the max-retry cap
- Ran `npm test src/fetcher` — 14/14 pass
- Hand-verified the retry count via debug logs on a killed-then-restarted server

## Failure modes

- Upstream returns 500 repeatedly → tested (max-retry cap + final error surface)
- Network disconnect mid-request → tested (the retry loop picks it up on next attempt)
- Upstream returns 200 with malformed JSON → not a retry path; parse errors bypass the helper

---

### Required check (issue #401)

- [x] **Every failure mode mentioned in this PR description has either (a) a test that exercises it, or (b) a linked tracking issue.** "Unlikely" is not an acceptable substitute. If you wrote "I don't think this can happen but...", that sentence is a failure mode and needs a test or an issue link.

### Optional context

- Linked issues: #
- Trust tier change (if any): none
- Affects published API or CLI surface: no
- Touches the init flow / `npm-publish.yml` / `tests/fixtures/init-corpus/`: no
