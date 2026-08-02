# Evidence Rules

| Label | Meaning | Required support |
| --- | --- | --- |
| Verified | Directly observed and reproducible | File and line, command output, test, official page, release, or commit |
| Upstream claim | Asserted by a maintainer or project | Primary-source link and date; preserve attribution |
| Inference | Conclusion derived from evidence | Name the evidence and reasoning; do not present as shipped behavior |
| Proposal | Recommended future action | State expected benefit, cost, risk, and validation |
| Unknown | Evidence is absent or conflicting | Identify what would resolve it |

## Source priority

1. Executable behavior and focused tests.
2. Current source code and configuration.
3. Release tags, commit history, merged pull requests, and ADRs.
4. Official documentation.
5. Maintainer-authored design notes.
6. Secondary commentary only when primary evidence is unavailable.

Compare dates and commits before calling anything "latest." Separate what a
design document describes, what code implements, and what field evidence proves.
