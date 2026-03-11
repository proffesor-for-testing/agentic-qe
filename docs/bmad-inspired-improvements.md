# BMAD-Inspired AQE Improvements — Implementation Plan

> Inspired by [BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD) patterns adapted for AQE's autonomous quality engineering platform.
> Created: 2026-03-11 | Status: Planning

---

## Overview

Six features to adopt from BMAD-METHOD, adapted to AQE's architecture (agents, learning, MCP, swarms). Each feature has Specification, Implementation, and Verification sections.

### Progress Tracker

| # | Feature | Status | Priority | Effort |
|---|---------|--------|----------|--------|
| 1 | [Adversarial Review with Minimum Findings](#1-adversarial-review-with-minimum-findings) | [ ] Not Started | P0 | Low |
| 2 | [Agent Customization Overlays](#2-agent-customization-overlays) | [ ] Not Started | P0 | Medium |
| 3 | [Structured Validation Pipelines](#3-structured-validation-pipelines) | [ ] Not Started | P1 | Medium |
| 4 | [Edge Case Hunter (Mechanical)](#4-edge-case-hunter-mechanical) | [ ] Not Started | P1 | Low |
| 5 | [Context Compilation for Agents](#5-context-compilation-for-agents) | [ ] Not Started | P2 | Medium |
| 6 | [Micro-File Step Architecture for Skills](#6-micro-file-step-architecture-for-skills) | [ ] Not Started | P2 | High |

---

## 1. Adversarial Review with Minimum Findings

### Specification

**Problem:** Our `qe-devils-advocate` agent allows "no significant findings" (0.3 reward for clean output). Reviews can complete without finding anything. BMAD forces a **minimum of 3-10 issues** per review using an adversarial persona, breaking the LLM's agreeability bias.

**Goal:** Enforce minimum finding requirements across all review agents. Reviews that find fewer than the minimum must dig deeper or explicitly justify why the target is genuinely clean (with evidence).

**Affected Files:**
- `src/agents/devils-advocate/agent.ts` — Core review logic
- `src/agents/devils-advocate/strategies.ts` — 7 challenge strategies (25KB)
- `src/agents/devils-advocate/types.ts` — Type definitions
- `.claude/agents/v3/qe-devils-advocate.md` — Agent instructions (218 lines)
- `.claude/agents/v3/subagents/qe-code-reviewer.md` — Code review agent (344 lines)
- `.claude/agents/v3/subagents/qe-security-reviewer.md` — Security review agent (379 lines)
- `.claude/agents/v3/subagents/qe-performance-reviewer.md` — Performance review agent (356 lines)
- `.claude/agents/v3/subagents/qe-integration-reviewer.md` — Integration review agent (349 lines)

### Implementation

**Step 1: Add minimum findings config to Devil's Advocate types**
- File: `src/agents/devils-advocate/types.ts`
- Add `minimumFindings` field to `DevilsAdvocateConfig` (default: 3)
- Add `minimumFindingsJustification` to `ReviewResult` for when clean is genuine
- Add severity weighting: CRITICAL=3, HIGH=2, MEDIUM=1, LOW=0.5 toward minimum

**Step 2: Enforce minimum in review loop**
- File: `src/agents/devils-advocate/agent.ts`
- After initial strategy pass, if weighted findings < minimum:
  - Run a second pass with deeper strategies (broader scope, lower thresholds)
  - If still under minimum, require explicit "clean justification" with evidence
  - Evidence = specific files examined, patterns checked, tools run
- Adjust reward tiers:
  - 0.3 ("no findings") → requires justification or becomes 0.1 penalty
  - New tier: 0.8 for "under minimum but justified with evidence"

**Step 3: Update agent instructions**
- Files: `qe-devils-advocate.md` and all 4 subagent reviewers
- Add adversarial framing: "You are a skeptical reviewer. Your job is to find problems. Every review MUST surface at least 3 findings (weighted by severity). If the code is genuinely clean, you must explain WHY with specific evidence of what you checked."
- Add anti-pattern: "NEVER produce a review that says 'looks good' without at least 3 observations (improvements, concerns, questions, or confirmed-clean areas with reasoning)"
- Per-reviewer minimums: code=3, security=3, performance=2, integration=2

**Step 4: Update the skill for adversarial reviews**
- File: `.claude/skills/code-review-quality/SKILL.md`
- Add minimum findings enforcement section
- Add escalation: if reviewer returns <3 findings, spawn `qe-devils-advocate` as a meta-reviewer

### Verification

- [ ] Unit test: `DevilsAdvocate.review()` with trivially clean code → must produce ≥3 weighted findings or justified clean report
- [ ] Unit test: Review with 1 CRITICAL (weight 3) satisfies minimum of 3
- [ ] Unit test: Review with 2 LOW (weight 1) does NOT satisfy minimum of 3 → triggers second pass
- [ ] Unit test: Clean justification requires non-empty `evidenceChecked` array
- [ ] Integration test: Run devil's advocate against a real small file, verify structured output
- [ ] Regression: Existing test suite passes with new minimum defaults

---

## 2. Agent Customization Overlays

### Specification

**Problem:** AQE has 63 shipped agents but users can't customize their behavior without editing the `.md` files directly (which get overwritten on reinstall). BMAD uses `.customize.yaml` overlay files where persona fields **replace** and menu/actions/prompts **append**.

**Goal:** Allow users to customize agent behavior via overlay files that survive `aqe init` reinstalls. Customizations apply at agent load time.

**Affected Files:**
- `src/init/agents-installer.ts` — Agent file discovery and installation
- `src/routing/qe-agent-registry.ts` — Agent registry with 90+ profiles
- New: `src/agents/overlay-loader.ts` — Overlay merging logic
- New: overlay schema definition

### Implementation

**Step 1: Define overlay schema**
- File: `src/agents/overlay-schema.ts` (new)
- Schema:
  ```typescript
  interface AgentOverlay {
    agent: string;              // e.g. "qe-test-architect"
    replace?: {                 // Fields that REPLACE base agent content
      description?: string;
      domains?: string[];
      complexity?: string;
    };
    append?: {                  // Fields that APPEND to base agent content
      instructions?: string;   // Additional instructions appended to agent .md
      capabilities?: string[];
      tags?: string[];
    };
    config?: {                  // Runtime configuration overrides
      minimumFindings?: number;       // For review agents
      maxParallelAgents?: number;
      preferredFrameworks?: string[];
      severityThresholds?: Record<string, number>;
    };
  }
  ```

**Step 2: Create overlay loader**
- File: `src/agents/overlay-loader.ts` (new)
- Discovery: look for `.claude/agent-overrides/*.yaml` in project root
- Filename convention: `qe-test-architect.override.yaml`
- Merge logic:
  - `replace` fields → overwrite corresponding sections in agent .md frontmatter
  - `append.instructions` → append to end of agent .md body
  - `append.capabilities/tags` → concat with existing arrays (deduplicated)
  - `config` → stored in registry as runtime overrides

**Step 3: Integrate with agents-installer**
- File: `src/init/agents-installer.ts`
- During `aqe init`, preserve existing `.claude/agent-overrides/` directory
- After copying agent .md files, apply overlays
- Log which agents have active overlays

**Step 4: Integrate with agent registry**
- File: `src/routing/qe-agent-registry.ts`
- On registry initialization, load overlay configs
- When routing tasks to agents, check for config overrides
- Pass override config to agent spawn parameters

**Step 5: Create example overlay**
- File: `assets/templates/agent-override-example.yaml` (shipped with npm)
- Copied to `.claude/agent-overrides/_example.yaml` during init
- Shows all customizable fields with comments

### Verification

- [ ] Unit test: Overlay loader discovers `.yaml` files in correct directory
- [ ] Unit test: `replace` fields overwrite base agent metadata
- [ ] Unit test: `append.instructions` appends to agent body without corrupting markdown
- [ ] Unit test: `append.capabilities` deduplicates correctly
- [ ] Unit test: Missing overlay file → agent loads normally (no error)
- [ ] Unit test: Malformed YAML → warning logged, agent loads without overlay
- [ ] Integration test: `aqe init --auto` preserves existing overrides directory
- [ ] Integration test: Registry serves overridden config to task router
- [ ] Regression: All 63 agents load correctly without any overlays present

---

## 3. Structured Validation Pipelines

### Specification

**Problem:** Our `qe-requirements-validator` has 7 validation steps but runs them as a single monolithic pass. BMAD's PRD validation has **13 structured steps**, each with explicit success/failure criteria, and halts at gates. Our validators could be more rigorous with step-by-step validation, gate enforcement, and per-step reporting.

**Goal:** Refactor validation agents into step-based pipelines where each step produces a structured verdict, and failures at critical steps halt progression.

**Affected Files:**
- `.claude/agents/v3/qe-requirements-validator.md` (469 lines)
- `.claude/agents/v3/qe-quality-gate.md` (257 lines)
- New: `src/validation/pipeline.ts` — Generic validation pipeline runner
- New: `src/validation/steps/` — Individual step implementations
- New: `.claude/skills/validation-pipeline/SKILL.md` — Orchestration skill

### Implementation

**Step 1: Define pipeline framework**
- File: `src/validation/pipeline.ts` (new)
- Generic `ValidationPipeline` class:
  ```typescript
  interface ValidationStep {
    id: string;
    name: string;
    category: 'format' | 'content' | 'quality' | 'traceability' | 'compliance';
    severity: 'blocking' | 'warning' | 'info';
    execute(context: ValidationContext): Promise<StepResult>;
  }

  interface StepResult {
    stepId: string;
    status: 'pass' | 'fail' | 'warn' | 'skip';
    score: number;          // 0-100
    findings: Finding[];
    evidence: string[];     // What was checked
    duration: number;
  }

  interface PipelineResult {
    overall: 'pass' | 'fail' | 'warn';
    score: number;          // Weighted average
    steps: StepResult[];
    blockers: Finding[];    // Findings from blocking steps that failed
    halted: boolean;        // Did pipeline halt early?
    haltedAt?: string;      // Step ID where it halted
  }
  ```

**Step 2: Define requirements validation steps (13 steps, inspired by BMAD)**
- File: `src/validation/steps/requirements/` (new directory)
- Steps:
  1. `format-check` — Structure, headings, required sections present (blocking)
  2. `completeness-check` — All required fields populated (blocking)
  3. `invest-criteria` — Independent, Negotiable, Valuable, Estimable, Small, Testable (warning)
  4. `smart-acceptance` — Specific, Measurable, Achievable, Relevant, Time-bound (warning)
  5. `testability-score` — Can each requirement be tested? Score 0-100 (warning)
  6. `vague-term-detection` — Flag "should", "might", "various", "etc." (info)
  7. `information-density` — Every sentence carries weight, no filler (info)
  8. `traceability-check` — Requirements → tests mapping exists (warning)
  9. `implementation-leakage` — Requirements don't prescribe implementation (warning)
  10. `domain-compliance` — Requirements align with domain model (info)
  11. `dependency-analysis` — Cross-requirement dependencies identified (info)
  12. `bdd-scenario-generation` — Can generate Given/When/Then for each requirement (warning)
  13. `holistic-quality` — Overall coherence, no contradictions (blocking)

**Step 3: Update agent instructions**
- Files: `qe-requirements-validator.md`, `qe-quality-gate.md`
- Rewrite to use pipeline framework: "Execute validation pipeline step by step. Report each step's result before proceeding. Halt at blocking failures."
- Add structured output format for each step

**Step 4: Create validation pipeline skill**
- File: `.claude/skills/validation-pipeline/SKILL.md` (new)
- Orchestrates pipeline execution
- Supports `--steps` flag to run specific steps only
- Supports `--continue-on-failure` to skip blocking halts
- Produces summary report with per-step scores and overall grade

### Verification

- [ ] Unit test: Pipeline runner executes steps in order
- [ ] Unit test: Blocking step failure halts pipeline
- [ ] Unit test: Warning step failure continues pipeline
- [ ] Unit test: `--continue-on-failure` skips blocking halts
- [ ] Unit test: Each of 13 steps produces valid StepResult
- [ ] Unit test: Overall score is weighted average of step scores
- [ ] Integration test: Run pipeline against a real requirements document
- [ ] Integration test: Pipeline produces structured JSON report
- [ ] Regression: Existing `qe-requirements-validator` behavior preserved

---

## 4. Mechanical Edge Case Mode for Gap Detector

> **Decision:** No new agent. The existing `qe-gap-detector` already does branch gap detection,
> error handling pattern matching, and edge case boundary analysis (lines 289-294 of its definition).
> Adding a separate `qe-edge-case-hunter` agent would create routing ambiguity, domain overlap,
> and agent sprawl. Instead, add a `--mechanical` / `--exhaustive` mode to the existing gap detector
> and build the AST branch enumerator as a reusable utility in `src/analysis/`.

### Specification

**Problem:** The `qe-gap-detector` already does semantic gap analysis with AST patterns, but its output is **opinionated** — it risk-scores and prioritizes. BMAD's edge case hunter is purely mechanical: enumerate every branch, report every unhandled path, no opinions. We need this exhaustive mode as a complement to the existing risk-scored mode.

**Goal:** Add an exhaustive mechanical mode to `qe-gap-detector` that enumerates all branching constructs without filtering or prioritization. Build the AST enumerator as a standalone utility so other agents (property-tester, mutation-tester) can also use it.

**Affected Files:**
- `.claude/agents/v3/qe-gap-detector.md` (304 lines) — add mechanical mode instructions
- `assets/agents/v3/qe-gap-detector.md` — sync shipped copy
- New: `src/analysis/branch-enumerator.ts` — Reusable AST branch enumeration utility
- No new agent definition

### Implementation

**Step 1: Build the branch enumerator utility**
- File: `src/analysis/branch-enumerator.ts` (new)
- Parse TypeScript/JavaScript AST (using `@typescript-eslint/parser@^6.13.0` already in deps)
- Design as a strategy pattern (`BranchEnumerator` interface) for future multi-language support
- Enumerate all branching constructs:
  - `if/else` — missing else branch
  - `switch` — missing default case, missing break
  - `try/catch` — empty catch blocks, missing finally
  - `?.` optional chaining — what happens on null?
  - `??` nullish coalescing — what's the fallback?
  - `||` / `&&` short-circuit — missing truthy/falsy handling
  - Promise `.catch()` — missing error handler
  - Array methods with callbacks — empty array case
  - Type guards — unhandled type narrowing branches
- Output format:
  ```typescript
  interface UnhandledBranch {
    file: string;
    line: number;
    column: number;
    language: 'typescript' | 'javascript';  // Extensible for future languages
    construct: string;        // "if-without-else", "switch-no-default", etc.
    triggerCondition: string;  // "when input is null", "when array is empty"
    currentHandling: string;  // "falls through", "throws uncaught", "returns undefined"
    suggestedGuard: string;   // Code snippet for handling
    severity: 'high' | 'medium' | 'low';
  }

  interface BranchEnumerator {
    enumerate(sourceCode: string, filePath: string): UnhandledBranch[];
  }
  ```

**Step 2: Update gap detector agent instructions**
- File: `.claude/agents/v3/qe-gap-detector.md`
- Add to capabilities: "Mechanical/Exhaustive mode: enumerate ALL branching constructs without risk-scoring or prioritization"
- Add mode instructions: "When invoked with `--mechanical` or `--exhaustive`, switch to exhaustive mode: report every unhandled branch path as structured JSON without filtering by risk score. This mode is for completeness, not prioritization."
- Keep existing risk-scored mode as default behavior
- Sync to `assets/agents/v3/qe-gap-detector.md`

**Step 3: Add CLI command**
- Wire into existing CLI: `npx agentic-qe analyze gaps --file src/foo.ts --mechanical`
- Output formats: `--json`, `--table`, `--markdown`
- Default mode (no flag) = existing risk-scored behavior

### Verification

- [ ] Unit test: `BranchEnumerator` detects if-without-else
- [ ] Unit test: `BranchEnumerator` detects switch-without-default
- [ ] Unit test: `BranchEnumerator` detects empty catch block
- [ ] Unit test: `BranchEnumerator` detects optional chaining without null handling
- [ ] Unit test: `BranchEnumerator` detects Promise without .catch
- [ ] Unit test: Output is valid `UnhandledBranch[]` JSON
- [ ] Unit test: Severity assignment is deterministic (no subjective scoring)
- [ ] Unit test: `language` field is set correctly for TS vs JS files
- [ ] Integration test: Run against a real source file, verify all branches enumerated
- [ ] Integration test: `--mechanical` flag on CLI produces exhaustive output
- [ ] Regression: Existing gap-detector default behavior unchanged (risk-scored mode)

---

## 5. Context Compilation for Agents

### Specification

**Problem:** Each agent queries its own memory namespaces independently. There's no unified context compilation step before agent execution. BMAD's story creation workflow aggregates context from 6+ sources (PRD, Architecture, UX, previous stories, git history, web research) into a single document — giving the agent maximum relevant context.

**Goal:** Build a context compiler that aggregates relevant context from multiple sources before agent execution, producing a focused context document that reduces agent memory queries and improves output quality.

**Affected Files:**
- New: `src/context/compiler.ts` — Context compilation engine
- New: `src/context/sources/` — Context source adapters
- `src/routing/qe-agent-registry.ts` — Integrate context compilation into agent dispatch

### Implementation

**Step 1: Define context source adapters**
- File: `src/context/sources/` (new directory)
- Adapters:
  ```typescript
  interface ContextSource {
    id: string;
    priority: number;          // Higher = more important
    maxTokens: number;         // Budget per source
    gather(request: ContextRequest): Promise<ContextFragment>;
  }
  ```
- Sources to implement:
  1. `memory-source.ts` — Relevant patterns from AgentDB (by domain, tags)
  2. `coverage-source.ts` — Current coverage data for target files
  3. `git-source.ts` — Recent commits touching target files, blame info
  4. `requirements-source.ts` — Requirements linked to target code
  5. `test-source.ts` — Existing tests for target files
  6. `defect-source.ts` — Past defects in target files/modules

**Step 2: Build context compiler**
- File: `src/context/compiler.ts` (new)
- Takes a `ContextRequest` (target files, agent type, task description)
- Queries all relevant sources in parallel
- Ranks and trims fragments to fit token budget
- Produces a `CompiledContext` object:
  ```typescript
  interface CompiledContext {
    summary: string;           // 1-paragraph overview
    fragments: ContextFragment[];
    totalTokens: number;
    sources: string[];         // Which sources contributed
    timestamp: string;
  }
  ```

**Step 3: Integrate with agent dispatch**
- File: `src/routing/qe-agent-registry.ts`
- Before spawning an agent, run context compilation
- Pass compiled context as part of agent prompt
- Cache compiled context for same-session reuse (TTL: 5 minutes)

**Step 4: Add context compilation to key agents**
- Agents that benefit most: `qe-test-architect`, `qe-test-generator`, `qe-gap-detector`, `qe-code-reviewer`
- Add to agent instructions: "You will receive a compiled context section. Use it to inform your analysis. Do not re-query for information already provided."

### Verification

- [ ] Unit test: Each context source returns valid ContextFragment
- [ ] Unit test: Compiler respects token budget (truncates lowest-priority sources first)
- [ ] Unit test: Compiler handles source failures gracefully (timeout, empty result)
- [ ] Unit test: Cache returns same result within TTL
- [ ] Unit test: Cache invalidates after TTL expires
- [ ] Integration test: Compile context for a real source file, verify all sources queried
- [ ] Integration test: Agent receives compiled context in its prompt
- [ ] Performance test: Context compilation completes in <2 seconds for typical files
- [ ] Regression: Agents work correctly without compiled context (graceful degradation)

---

## 6. Micro-File Step Architecture for Skills

### Specification

**Problem:** Five QCSD swarm skills are 2,000-2,800 lines each. LLMs suffer from "lost in the middle" with such large context. BMAD uses micro-file step architecture — small, self-contained step files loaded one at a time via just-in-time loading.

**Goal:** Split the largest skills into step files. The main SKILL.md becomes an orchestrator that loads steps on demand. Each step is self-contained with its own instructions, success criteria, and navigation.

**Candidates for splitting (>1,500 lines):**
- `qcsd-production-swarm/SKILL.md` — 2,781 lines
- `qcsd-refinement-swarm/SKILL.md` — 2,398 lines
- `qcsd-cicd-swarm/SKILL.md` — 2,206 lines
- `qcsd-development-swarm/SKILL.md` — 2,154 lines
- `qcsd-ideation-swarm/SKILL.md` — 2,008 lines
- `a11y-ally/SKILL.md` — 1,664 lines

### Implementation

**Step 1: Define step file convention**
- Directory structure:
  ```
  .claude/skills/qcsd-production-swarm/
    SKILL.md              # Orchestrator (reduced to ~200 lines)
    steps/
      01-flag-detection.md
      02-agent-spawning.md
      03-defect-analysis.md
      04-feedback-synthesis.md
      05-validation.md
  ```
- Step file format:
  ```markdown
  # Step N: Step Name

  ## Prerequisites
  - Previous step completed: {step-id}
  - Required context: {what this step needs}

  ## Instructions
  {Self-contained instructions for this step}

  ## Success Criteria
  - [ ] Criterion 1
  - [ ] Criterion 2

  ## Output
  {What this step produces for the next step}

  ## Navigation
  - On success: proceed to step N+1
  - On failure: halt and report
  ```

**Step 2: Implement step loader in skill orchestrators**
- Each SKILL.md orchestrator:
  - Lists all steps with brief descriptions
  - Loads one step at a time using `Read` tool
  - Passes output from step N as input to step N+1
  - Tracks progress via checklist in orchestrator
  - Supports resuming from a specific step

**Step 3: Split QCSD Production Swarm (largest, pilot)**
- Current phases → step files:
  1. `01-flag-detection.md` — Feature flag and signal detection
  2. `02-core-agents.md` — Agent spawning configuration
  3. `03-telemetry-collection.md` — Production telemetry gathering
  4. `04-defect-analysis.md` — Defect pattern analysis
  5. `05-feedback-synthesis.md` — Cross-phase feedback loop
  6. `06-validation-checkpoint.md` — Final validation and reporting

**Step 4: Split remaining candidates**
- Apply same pattern to refinement, cicd, development, ideation swarms
- Split a11y-ally into: browser-setup, audit-execution, remediation, reporting

**Step 5: Update skill builder**
- File: `.claude/skills/skill-builder/SKILL.md`
- Add guidance: "Skills over 1,000 lines SHOULD use step files. Skills over 1,500 lines MUST use step files."
- Add step file template generation

### Verification

- [ ] Functional test: QCSD production swarm runs end-to-end with step files
- [ ] Functional test: Resuming from step 3 works correctly
- [ ] Functional test: Step failure halts at correct point
- [ ] Functional test: Each step file is self-contained (can be understood without reading others)
- [ ] Size check: Orchestrator SKILL.md is under 300 lines
- [ ] Size check: Each step file is under 500 lines
- [ ] Regression: All QCSD swarm skills produce same outputs as before splitting
- [ ] Performance: Step-by-step loading doesn't increase total execution time significantly

---

## Implementation Order

```
Phase 1 (P0 — Do First)
├── Feature 1: Adversarial Review Minimum Findings
│   ├── Update types & agent.ts
│   ├── Update agent .md instructions
│   ├── Write tests
│   └── Estimated: 1-2 sessions
│
└── Feature 2: Agent Customization Overlays
    ├── Define schema
    ├── Build overlay loader
    ├── Integrate with installer & registry
    ├── Write tests
    └── Estimated: 2-3 sessions

Phase 2 (P1 — Do Next)
├── Feature 3: Structured Validation Pipelines
│   ├── Build pipeline framework
│   ├── Implement 13 validation steps
│   ├── Update agent instructions
│   ├── Write tests
│   └── Estimated: 3-4 sessions
│
└── Feature 4: Edge Case Hunter
    ├── Build AST-based path tracer
    ├── Create agent definition
    ├── Integrate with gap detector
    ├── Write tests
    └── Estimated: 2-3 sessions

Phase 3 (P2 — Do After)
├── Feature 5: Context Compilation
│   ├── Build source adapters
│   ├── Build compiler
│   ├── Integrate with agent dispatch
│   ├── Write tests
│   └── Estimated: 3-4 sessions
│
└── Feature 6: Micro-File Step Architecture
    ├── Define convention
    ├── Split production swarm (pilot)
    ├── Split remaining 5 candidates
    ├── Verify all swarms still work
    └── Estimated: 3-4 sessions
```

## Dependencies

- Feature 1 (Adversarial Review) → standalone, no dependencies
- Feature 2 (Overlays) → standalone, no dependencies
- Feature 3 (Validation Pipelines) → benefits from Feature 1 (minimum findings in validation)
- Feature 4 (Edge Case Hunter) → standalone, integrates with existing gap detector
- Feature 5 (Context Compilation) → benefits from Feature 2 (overlays can configure context sources)
- Feature 6 (Micro-File Steps) → standalone, but should be done after other features to avoid rework

## Success Metrics

| Feature | Metric | Target |
|---------|--------|--------|
| Adversarial Review | Avg findings per review | ≥3 (up from ~1.2) |
| Agent Overlays | Users with custom overlays | Track adoption |
| Validation Pipelines | Validation step pass rate | Track per-step metrics |
| Edge Case Hunter | Unhandled branches found | Track per-file |
| Context Compilation | Agent query reduction | ≥40% fewer memory queries |
| Micro-File Steps | Largest skill file size | <500 lines (down from 2,800) |

---

## Gap Analysis — What the Plan Missed

> Added 2026-03-11 after critical review of the plan against actual codebase state.

### GAP 1: Existing Review Skills Not Integrated

The plan updates `qe-devils-advocate` and 4 subagent reviewers but **misses 3 existing review skills** that also need adversarial minimum findings:

- `.claude/skills/brutal-honesty-review/SKILL.md` — Already has adversarial framing but no minimum finding enforcement
- `.claude/skills/sherlock-review/SKILL.md` — Evidence-based review, no minimum findings
- `.claude/skills/pr-review/SKILL.md` — PR review skill, no minimum findings

**Action:** Feature 1 must also update these 3 skills with minimum findings enforcement. The `brutal-honesty-review` already has assessment rubrics (`resources/assessment-rubrics.md`) and shell scripts (`scripts/assess-code.sh`, `scripts/assess-tests.sh`) that need the minimum wired in.

### GAP 2: Learning Integration Missing from Adversarial Review

The `DevilsAdvocate` class in `src/agents/devils-advocate/agent.ts` has **zero learning integration** — no pattern store calls, no hook post-task recording, no memory queries. The plan adds minimum findings but doesn't address:

- Recording which challenges were accepted vs dismissed (feedback loop)
- Learning from past reviews to avoid repeating false positives
- Storing successful challenge patterns for cross-project transfer

**Action:** Add a step to Feature 1: "Wire review outcomes to `qe_pattern_usage` table via post-task hook. Record `{challenge_id, accepted: boolean, target_type}` for each challenge so the learning system can weight strategies."

### GAP 3: Adversarial Defense Collision Risk

AQE already has an `adversarial-defense-integration.ts` in `src/governance/` — this is **input prompt defense** (detecting manipulation attempts), not code review. The plan's adversarial review framing in agent instructions could trigger governance flags (the `ThreatDetector` loaded at session start).

**Action:** Ensure the adversarial agent instructions use framing that won't be flagged by the governance `ThreatDetector`. Use "skeptical reviewer" / "critical evaluator" terminology rather than "adversarial attacker" language. Add Feature 1 to the governance allowlist if needed.

### GAP 4: Overlay Schema Doesn't Cover MCP Path

Feature 2 defines overlays that modify agent `.md` files, but the **MCP dispatch path** (`src/mcp/services/task-router.ts`) resolves agents differently from the CLI path. The MCP task router uses `QETaskRouter` (`src/routing/qe-task-router.ts`) which reads from the agent registry, not from `.md` files directly.

**Action:** Feature 2's Step 4 (registry integration) must handle BOTH paths:
1. CLI/skill path → overlay applied to `.md` file content at load time
2. MCP path → overlay config injected into registry profiles at initialization time
Add a verification test: "Run same agent via CLI and MCP, confirm overlay config is identical in both paths."

### GAP 5: Edge Case Hunter — AST Parser Already in Dependencies But May Need Version Bump

The plan says "@typescript-eslint/parser already in deps" — it is (`"@typescript-eslint/parser": "^6.13.0"`), but version 6.x is legacy. The current ecosystem is on v8.x with the new `@typescript-eslint/utils` package. The existing version works for parsing but may lack newer AST node types.

**Action:** Verify `@typescript-eslint/parser@6.x` can parse all constructs listed (optional chaining, nullish coalescing, etc.). If not, plan a controlled version bump. Add a test: "Parse a file using `satisfies`, `using` declarations, and other modern TS — verify no parse errors."

### ~~GAP 6: Edge Case Hunter — Multi-Language Support~~

~~Resolved: The updated plan (Feature 4) now uses a `BranchEnumerator` strategy pattern interface with a `language` field on `UnhandledBranch`, designed for extensibility. No new agent is created.~~

### GAP 7: Context Compilation Token Counting

The plan defines a `maxTokens` budget per context source and a `totalTokens` field on `CompiledContext`, but doesn't specify **how tokens are counted**. AQE doesn't currently have a token counter utility. Using rough estimates (4 chars = 1 token) is unreliable.

**Action:** Either:
1. Use `tiktoken` or `gpt-tokenizer` npm package for accurate counting, or
2. Use character-based estimation with a safety margin (÷3.5 instead of ÷4), or
3. Use the existing model routing tier info to determine approximate budget

Add this decision to Feature 5 implementation steps.

### GAP 8: Context Compilation — No Opt-Out Mechanism

The plan injects compiled context into ALL agent prompts automatically. Some agents (like `qe-parallel-executor`, `qe-fleet-commander`) don't need file-level context — they're orchestrators. Injecting unnecessary context wastes tokens.

**Action:** Add an agent-level flag in the registry: `needsContext: boolean` (default: true for leaf agents, false for orchestrators). Or use the overlay system (Feature 2) to let users disable context compilation per-agent.

### GAP 9: Micro-File Steps — Claude Code Skill Loading Constraint

The plan assumes skills can `Read` step files on demand. But Claude Code loads the entire `SKILL.md` content when a skill is invoked — it doesn't support partial loading natively. The step files would need to be explicitly read via the `Read` tool during execution.

**Action:** Clarify in the plan: the orchestrator SKILL.md must include explicit `Read` tool instructions like:
```
1. Read the step file: use Read tool on `.claude/skills/{skill}/steps/01-*.md`
2. Execute the step instructions
3. Read the next step file
```
This is a prompt-engineering pattern, not a code change. Add a verification test: "Skill orchestrator correctly reads step files sequentially via Read tool."

### ~~GAP 10: Missing `assets/agents/v3/` Sync for New Agent~~

~~Resolved: Feature 4 no longer creates a new agent. The gap detector `.md` is updated in-place and synced to `assets/agents/v3/` as part of the existing update flow.~~

### GAP 11: No Migration Path for Existing Users

Features 1 and 2 change agent behavior (minimum findings) and add new directories (`agent-overrides/`). Users who already ran `aqe init` need these changes applied without a full re-init.

**Action:** Add an `aqe upgrade` consideration or document that `aqe init --auto` on an existing project will:
- Preserve `agent-overrides/` (Feature 2 already covers this)
- Update agent `.md` files with new adversarial instructions (Feature 1 needs to document this)
- Not break existing hooks or settings

### GAP 12: Validation Pipeline — No Integration with QCSD Swarms

Feature 3 creates a standalone validation pipeline, but the QCSD swarms already have "validation checkpoints" embedded in their skills. The plan doesn't address how the new pipeline interacts with existing QCSD validation.

**Action:** Add to Feature 3: "The validation pipeline is a general-purpose framework. QCSD swarm validation checkpoints can optionally delegate to this pipeline for structured step-by-step validation, but existing inline validation remains supported for backward compatibility."

### Summary of Required Plan Amendments

| Gap | Feature | Severity | Action |
|-----|---------|----------|--------|
| 1 | Adversarial Review | Medium | Add brutal-honesty, sherlock, pr-review skills to scope |
| 2 | Adversarial Review | High | Add learning feedback loop for challenge outcomes |
| 3 | Adversarial Review | Medium | Avoid governance ThreatDetector collision |
| 4 | Overlays | High | Handle MCP dispatch path, not just CLI |
| 5 | Edge Case Hunter | Low | Verify parser version handles modern TS |
| ~~6~~ | ~~Edge Case Hunter~~ | ~~Resolved~~ | ~~Addressed in updated Feature 4~~ |
| 7 | Context Compilation | Medium | Specify token counting strategy |
| 8 | Context Compilation | Medium | Add opt-out for orchestrator agents |
| 9 | Micro-File Steps | Medium | Clarify Read tool loading pattern |
| ~~10~~ | ~~Edge Case Hunter~~ | ~~Resolved~~ | ~~No new agent needed~~ |
| 11 | All Features | Medium | Document migration path for existing users |
| 12 | Validation Pipelines | Low | Clarify relationship with QCSD checkpoints |
