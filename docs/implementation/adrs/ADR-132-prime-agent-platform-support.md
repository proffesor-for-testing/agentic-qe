# ADR-132: Prime Agent platform support — repo-scoped skills, seeded subagents, instructed MCP

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-132 |
| **Status** | Accepted — implemented (see Verification) |
| **Date** | 2026-09-21 |
| **Author** | AQE Core |
| **Review Cadence** | 6 months |
| **Supersedes** | — |
| **Related** | ADR-025 (the installer pattern this follows), ADR-115 (sibling "guard a surface in CI" pattern), the Codex installer (AGENTS.md owned-section semantics, now shared via `src/init/agents-md-section.ts`) |

---

## WH(Y) Decision Statement

**In the context of** AQE supporting eleven coding agent platforms through
installers that always write three things — a project MCP config file, a
behavioral-rules file, and platform assets (agents/skills) — and Prime Agent
consuming two of those three natively (the Agent Skills `SKILL.md` standard and
`AGENTS.md` context files) but **rejecting the third** (project-level MCP
settings are ignored for execution: a repository must not start local
processes; MCP servers are registered per-user via `prime-agent mcp add`) —

**facing** the naive options of (a) skipping Prime Agent because its MCP model
differs, or (b) writing a project MCP config anyway (dead file, confusing UX),
or (c) reusing the Codex install target wholesale (`.agents/skills/` is
discovered by both harnesses, but it makes one install silently mutate two
platforms and leaves Prime Agent without subagent roles, which it has no
file-based format for) —

**we decided** to add a standalone installer (`src/init/primeagent-installer.ts`,
following the Kiro/Codex standalone style rather than the 8-entry
`PLATFORM_REGISTRY`, because its MCP step is a user action, not a generated
config file) that:

1. Installs the curated skills into the **dedicated** `.prime/agent/skills/`
   tree (explicit manifest in `primeagent-skill-manifest.ts`, same curation
   policy as the Codex manifest) so installs never collide across harnesses.
2. Seeds an `aqe-fleet` skill carrying eight curated QE agent roles copied
   from `.claude/agents/v3/` as subagent prompt content — Prime Agent has no
   file-based agents, so roles travel as skill content with spawn
   instructions.
3. Merges an AQE-owned guidance section into `AGENTS.md` using **sentinel
   semantics shared with the Codex installer** (extracted to
   `agents-md-section.ts` so both installers merge the same file without
   duplicating logic or fighting over it).
4. Treats MCP as **instruct-by-default**: reports the exact
   `prime-agent mcp add aqe -- npx -y agentic-qe@latest mcp` command; the
   opt-in `--prime-agent-auto-mcp` flag executes it when the binary is on
   PATH and falls back to instructing when it is not.

**because** Prime Agent's MCP restriction is a deliberate security property of
that harness, not a gap to route around — the correct AQE behavior is to do
everything repo-scoped that the platform supports (skills, guidance,
subagent content) and to surface the one user-level step explicitly instead of
faking it with an ignored config file. Quality is never silently degraded:
without the MCP connection the skills and AGENTS.md guidance still work, and
the installer always prints the exact command.

---

## Consequences

### Positive

- One more supported platform with zero changes to the shared platform config
  generator (registry untouched; generic generators keep their file-based
  invariants).
- Codex + Prime Agent can coexist in one `AGENTS.md` (two sentinel-marked
  owned sections, tested in both orders).
- The owned-section merge logic now has one implementation instead of a
  second copy.

### Negative

- The MCP step cannot be verified end-to-end by repo-scoped tests (the
  registration lives in user settings); the auto mode is covered by a
  command-runner seam instead.
- Two more platforms sharing `AGENTS.md` increases the value of keeping the
  sentinel merge logic shared — divergence would corrupt user files.

---

## Verification

- `tests/unit/init/primeagent-installer.test.ts` — 12 tests: instruct/auto/none
  MCP modes, database-free env, AGENTS.md create/merge/replace/malformed-sentinel
  preservation, skills under `.prime/agent/skills/`, aqe-fleet seeding,
  `removeGuidance()`.
- `tests/integration/platform-installers.test.ts` — 3 real-filesystem tests:
  full install, Codex coexistence in one `AGENTS.md`, reinstall replaces only
  the owned section and preserves user content.
- `tests/unit/init/codex-installer.test.ts` — 22 tests still green after the
  merge-helper extraction.
- `npm run typecheck`, `npm run lint` clean; full fast unit suite green.

