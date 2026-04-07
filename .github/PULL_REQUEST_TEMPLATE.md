<!--
Thanks for the contribution. The single load-bearing checkbox below is the
direct result of issue #401 (the v3.9.1–v3.9.4 init regression series).
Other items in this template are guidance, not enforcement — the checkbox
is the one that has teeth in review.

The checkbox is honor-system today; CI enforcement is tracked in #408.
-->

## Summary

<!-- 1-3 sentences. What changed and why. -->

## Verification

<!-- How did you verify this works? Real commands, real output. CLAUDE.md
forbids "I believe it works" — show evidence. -->

## Failure modes

<!-- List any failure modes this change introduces, mitigates, or doesn't
cover. Be honest about what you didn't test. -->

---

### Required check (issue #401)

- [ ] **Every failure mode mentioned in this PR description has either (a) a test that exercises it, or (b) a linked tracking issue.** "Unlikely" is not an acceptable substitute. If you wrote "I don't think this can happen but...", that sentence is a failure mode and needs a test or an issue link.

### Optional context

- Linked issues: #
- Trust tier change (if any): tier N → tier M (because ...)
- Affects published API or CLI surface: yes / no
- Touches the init flow / `npm-publish.yml` / `tests/fixtures/init-corpus/`: yes / no
  - If yes: did you run `./tests/fixtures/init-corpus/run-gate.sh` locally? yes / no / not applicable
