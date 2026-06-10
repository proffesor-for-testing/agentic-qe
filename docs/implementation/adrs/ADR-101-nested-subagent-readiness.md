# ADR-101: Nested Subagent Hierarchy — Depth Limits, Privilege Model, Trajectory Provenance

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-101 |
| **Status** | Implemented (P2 stage 1) / Proposed (P1 frontmatter — pending maintainer confirmation) |
| **Date** | 2026-06-10 |
| **Author** | AQE Core (Fable 5 improvement initiative, issue #520) |
| **Review Cadence** | After every `claude update` (re-run the probe) |

---

## WH(Y) Decision Statement

**In the context of** the AQE fleet's agent hierarchy (queen → fleet-commander → domain specialists), which today flattens all delegation into depth-1 Task-tool fan-out,

**facing** Anthropic's 2026-06-09 announcement of nested subagent support (depth=5), where empirical probing shows the runtime plumbing exists but the `Task` tool is stripped at parent→child spawn time by an upstream denylist,

**we decided for** building the readiness infrastructure now — nesting provenance (`parentAgentId`, `depth`) through trajectory recording and the post-task hook, a committed empirical probe script as the regression test for the gate lifting, and validation bounds (identifier check, 0 ≤ depth ≤ 32),

**and neglected** waiting for the upstream rollout (loses the independently-useful provenance for today's flat spawns) and immediately retrofitting `tools:` frontmatter onto all shipped `qe-*.md` agents (a restrictive allowlist that would cut agents off from inherited MCP tools — deferred pending maintainer confirmation, see P1 below),

**to achieve** zero-code-change activation when Anthropic flips the gate, plus per-hierarchy-level pattern segmentation in ReasoningBank starting today,

**accepting that** provenance lands in the JSON metadata blob rather than dedicated columns (stage 1 — no schema migration) and that the privilege split between coordinator and leaf agents is documented but not yet enforced in frontmatter.

---

## Context

ruflo's ADR-147 (PR #2336) probed Claude CLI 2.1.169 and found: `parentAgentId`/`isSubagent` plumbing exists in the binary; YAML `tools:` declarations propagate to children; the runtime strips `Task` at parent→child spawn regardless of flags — a hardcoded or server-side denylist. Our own probe (committed at `docs/probes/probe-nested-spawn-2026-06-10.txt`) reproduces this against this project's runtime: `level=0 task_tool=yes`, `level=1 task_tool=no` → `NO_AGENT_TOOL`.

The provenance fields are useful before the gate lifts: Claude Code's flat spawns still have a parent (the main loop or the queen), and segmenting learned patterns by hierarchy level improves routing priors (ADR-095/096 read the same outcome rows).

## Phases

| Phase | Content | Status |
|---|---|---|
| **P1** | `tools:` frontmatter with coordinator/leaf privilege split across `qe-*.md` (+ `assets/agents/v3/` mirror) | **Proposed — blocked on maintainer confirmation.** Claude Code's `tools:` frontmatter is a restrictive *allowlist*: declaring it cuts the agent off from inherited tools, **including all `mcp__agentic-qe__*` tools** unless each is enumerated (wildcard support in agent frontmatter is unverified). Retrofitting ~50 shipped agents risks breaking the fleet for users — production-safety rule requires explicit sign-off and an MCP-wildcard test first. |
| **P2 stage 1** | `--parent-agent-id` / `--depth` on post-task; validation; persisted to `qe_trajectories.metadata_json`; forwarded into ReasoningBank feedback; `TaskExecution.parentAgentId/depth` types | **Implemented** (this ADR) |
| **P2 stage 2** | Dedicated columns + indexes for provenance | Deferred until query patterns demand it |
| **P3** | Depth-aware pre-task guardrail (`NESTING_DEPTH_EXCEEDED`) | Blocked on P2 stage 2 |
| **P4** | Queen-coordinator delegation rewrite for real nesting | Blocked on the upstream gate lifting (probe flips to `TASK_TOOL_LIVE`) |

## Options Considered

### Option 1: Provenance-first readiness, frontmatter deferred (Selected)

**Pros:** all shipped behavior unchanged; provenance independently useful today; probe tells us exactly when to do more
**Cons:** least-privilege boundary not yet enforced

### Option 2: Full ruflo-style P1 now (restrictive tools: lists on all agents) (Rejected for now)

**Why rejected:** ruflo declared `tools:` on 8 *new* agents; retrofitting AQE's ~50 *shipped* agents changes their effective toolset (MCP access loss risk) without a way to test nested behavior until the denylist lifts. Revisit with maintainer sign-off + an MCP-wildcard frontmatter test.

### Option 3: Wait for upstream rollout (Rejected)

**Why rejected:** loses today's provenance value and the regression signal; ruflo's "independently useful" argument applies verbatim.

---

## Dependencies

| Relationship | ADR ID | Title | Notes |
|--------------|--------|-------|-------|
| Relates To | ADR-095/096 | Routing exploration / Route-Q loop | Consume the same outcome rows provenance now annotates |
| Relates To | ADR-064 | Agentic Teams | Queen hierarchy whose delegation P4 will rewrite |
| Relates To | ADR-099 | Reasoning-tag scrub | Same trajectory pipeline |
| Part Of | — | Fable 5 / ruflo-parity initiative | Tracking issue #520, improvement 4 |

---

## References

| Ref ID | Title | Type | Location |
|--------|-------|------|----------|
| — | Provenance validation | Source | `src/cli/commands/hooks-handlers/nesting-provenance.ts` |
| — | Hook + persistence wiring | Source | `task-hooks.ts`, `hooks-dream-learning.ts` (metadata_json) |
| — | Type extension | Source | `src/coordination/queen-types.ts` (`TaskExecution`) |
| — | Probe script | Source | `scripts/probe-nested-spawn-depth.mjs` |
| — | Probe result (2026-06-10) | Evidence | `docs/probes/probe-nested-spawn-2026-06-10.txt` — `level=1 status=NO_AGENT_TOOL` |
| — | Tests (8) | Tests | `tests/unit/cli/hooks/nesting-provenance.test.ts` |
| — | ruflo prior art | External | ruvnet/ruflo PR #2336 (ADR-147) |

---

## Governance

| Review Board | Date | Outcome | Next Review |
|--------------|------|---------|-------------|
| AQE Core | 2026-06-10 | P2 stage 1 Implemented; P1 awaiting maintainer call | Re-run probe after every `claude update` |

---

## Status History

| Status | Date | Notes |
|--------|------|-------|
| Proposed | 2026-06-10 | From Fable 5 improvement plan (issue #520) |
| Implemented (P2 stage 1) | 2026-06-10 | Provenance flags + validation + metadata_json persistence + probe + 8 tests. Drive-by fix: fresh-project `captured_experiences`/`experience_applications` DDL in persistTaskOutcome (Stream B silently no-oped on fresh installs). |

---

## Definition of Done Checklist

- [x] Evidence: probe committed (`NO_AGENT_TOOL` — denylist active, matching ruflo); E2E persistence of `{"parentAgentId":"qe-fleet-commander","depth":2}` and `{"depth":0}` on a fresh temp project; rejection of invalid id / negative / non-integer / >32 depth
- [x] Criteria: 3 options compared; validation bounds match ruflo's suite (0 ≤ d ≤ 32)
- [ ] Agreement: **P1 frontmatter awaits maintainer confirmation** (MCP allowlist risk)
- [x] Documentation: this ADR; fail-open exit semantics documented (hooks never break the tool pipeline — rejection = printed error + no persistence, exit 0)
- [x] Review: verification record on issue #520
