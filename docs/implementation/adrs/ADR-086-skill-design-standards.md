# ADR-086: Skill Design Standards — Anthropic Best Practices Alignment

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-086 |
| **Status** | In Progress |
| **Date** | 2026-03-18 |
| **Author** | Architecture Team |
| **Review Cadence** | 6 months |
| **Analysis Method** | Gap analysis against Anthropic published best practices + Nagual/local DB failure mining |

---

## WH(Y) Decision Statement

**In the context of** AQE's 77 shipped QE skills (in `assets/skills/`, distributed via npm) that are the primary interface between users and the agentic QE fleet,

**facing** structural gaps between our skill design and Anthropic's published best practices (Shihipar, March 2026): 97% of skills lack gotchas sections, 99% lack composable scripts, 100% lack config.json setup patterns, 100% lack on-demand hooks, 100% lack skill composition references, and ~30% restate textbook knowledge Claude already knows — all validated against real failure data from Nagual (5,316 patterns) and local learning DB (6,709 experiences showing 18-54% failure rates in key domains),

**we decided for** adopting 9 mandatory skill design standards aligned with Anthropic's internal practices, enforced through updated skill-builder tooling and PR review, executed in 4 phases over ~2 weeks,

**and neglected** (a) status quo (skills work but underperform — agent makes same mistakes repeatedly), (b) complete skill rewrite from scratch (rejected: too disruptive, existing validation infrastructure from ADR-056 is valuable), (c) automated skill generation (rejected: ETH Zurich study shows auto-generated agent configs hurt performance by 14-22%),

**to achieve** measurable improvement in skill effectiveness: reduced repeated agent failures via gotchas, better trigger accuracy via description rewrites, reduced context overhead via progressive disclosure, and persistent user config via setup patterns,

**accepting that** this requires touching ~77 skill files across 4 phases, some skill consolidation may require deprecation notices, and gotchas sections need ongoing curation (not a one-time fix).

---

## Context

### The Problem

ADR-056 established a validation system for skill outputs (trust tiers, JSON schemas, eval suites). That system verifies that skill output is structurally correct. But it does not address whether the skill itself is well-designed — whether it gives Claude the right information, in the right structure, to avoid repeating known failures.

Thariq Shihipar (Anthropic, Claude Code team) published "Lessons from Building Claude Code: How We Use Skills" on March 18, 2026, documenting 9 design patterns from Anthropic's internal use of hundreds of skills. Gap analysis against our 110 skills reveals systematic deficiencies.

### Evidence from Failure Data

**Nagual Knowledge Base** (5,316 patterns, nagual.profqe.com):
- "The Conductor Who Won't Stop Conducting": Agent violated "don't run full test suite" rule 20 times despite it being in CLAUDE.md. Fix: change the environment, not the instruction.
- "When the Orchestra Learns to Tune Itself": Completion theater (hardcoded `3.0.0` shipped), incorrect scoping (97 vs 63 skills), wrong workflow selected 8+ sessions.
- Crystal/reflex patterns (reward 0.92): "Agent swarms over-claim completion status, hiding 12 real integration gaps."
- Harness engineering principle (Hashimoto): "Every time an agent makes a mistake, engineer a solution so it never makes that mistake again."

**Local Learning DB** (.agentic-qe/memory.db, 6,709 experiences):
- Fleet initialization failure: 54 occurrences
- HybridMemoryBackend not initialized: 22 occurrences
- code-intelligence domain: 18.3% success rate
- quality-assessment domain: 53.7% success rate

### Current State vs. Target

| Design Standard | Current | Target | Gap |
|----------------|---------|--------|-----|
| Skills with Gotchas section | 2 (1.8%) | 25 (30%+) | Critical |
| Descriptions as trigger conditions | ~50% | 100% | High |
| Progressive disclosure (hub+spoke) | 1 (0.9%) | 15 (18%+) | High |
| Skills with composable scripts | 1 (0.9%) | 10 (12%+) | High |
| Skills with config.json setup | 0 (0%) | 7 (8%+) | Medium |
| Skills composing other skills | 0 (0%) | 10 (12%+) | Medium |
| Skills with run-history/memory | 0 (0%) | 5 (6%+) | Medium |
| Skills with on-demand hooks | 0 (0%) | 5 (6%+) | Medium |
| Total QE skills (after consolidation) | 77 | ~65 | Low |

---

## Options Considered

### Option 1: 9-Standard Phased Adoption (Selected)

Adopt Anthropic's 9 skill design patterns as mandatory standards, implemented in 4 phases. Integrate with existing ADR-056 validation infrastructure. Gotchas seeded from Nagual + local DB failure data.

**Pros:**
- Evidence-based: patterns validated by Anthropic across hundreds of skills
- Phased: quick wins first, structural changes later
- Composable: builds on ADR-056 validation, doesn't replace it
- Measurable: clear before/after metrics per standard

**Cons:**
- Touches ~80 files over 4 phases
- Gotchas require ongoing curation
- Some standards (on-demand hooks) depend on Claude Code features

### Option 2: Status Quo — Improve Incrementally (Rejected)

Keep current skill structure, fix problems as they arise.

**Why rejected:** 6,709 captured experiences show systematic failure patterns that repeat because skills lack accumulated failure knowledge. "Incrementally" has been the approach for 3+ months with no gotchas sections added.

### Option 3: Complete Skill Rewrite (Rejected)

Rewrite all skills from scratch following new standards.

**Why rejected:** Loses ADR-056 validation infrastructure (52 schemas, 46 eval suites). ETH Zurich study shows auto-generated agent configs hurt performance. Existing skills contain valuable domain knowledge that should be refined, not discarded.

---

## The 9 Standards

### Standard 1: Gotchas Section (MANDATORY for all skills)

Every skill MUST include a `## Gotchas` section containing documented failure points. Initial seed from Nagual/local DB, then grow organically.

**Source:** "The highest-signal content in any skill is the Gotchas section. Add a line each time Claude trips on something." (Shihipar)

**Enforcement:** skill-builder template includes empty Gotchas section. PR review checks for gotchas in new/modified skills.

### Standard 2: Description as Trigger Condition (MANDATORY for all skills)

The `description` field MUST be written as trigger conditions for the model, not human-readable summaries.

**Source:** "The description field is not a summary — it's a description of when to trigger." (Shihipar)

**Pattern:** "Use when [situation], [situation], or [situation]" instead of "AI-powered X using Y for Z."

### Standard 3: Progressive Disclosure (MANDATORY for skills >200 lines)

Skills exceeding 200 lines MUST use hub+spoke pattern: SKILL.md as ~30-100 line hub with references to spoke files in `references/`, `templates/`, `examples/` directories.

**Source:** "Think of the entire file system as a form of context engineering and progressive disclosure." (Shihipar)

**Metric:** Average SKILL.md length must decrease from 413 lines to <200 lines.

### Standard 4: No Railroading (RECOMMENDED for all skills)

Skills SHOULD state goals and constraints, not step-by-step procedures. Prescriptive steps only for genuinely tricky sequences.

**Source:** "Give Claude the information it needs, but give it the flexibility to adapt to the situation." (Shihipar)

### Standard 5: Don't State the Obvious (RECOMMENDED for knowledge skills)

Skills SHOULD focus on information that pushes Claude out of its default thinking. Remove textbook content Claude already knows.

**Source:** "If you're publishing a skill that is primarily about knowledge, try to focus on information that pushes Claude out of its normal way of thinking." (Shihipar)

### Standard 6: Config.json Setup Pattern (RECOMMENDED for user-facing skills)

Skills that need user preferences SHOULD use config.json in the skill directory, with first-run detection and AskUserQuestion for setup.

**Source:** "Store this setup information in a config.json file. If the config is not set up, the agent can ask the user." (Shihipar)

### Standard 7: Composable Scripts (RECOMMENDED for tool-based skills)

Skills paired with external tools SHOULD include composable helper scripts in `scripts/` or `lib/` directories.

**Source:** "Giving Claude scripts and libraries lets Claude spend its turns on composition, deciding what to do next rather than reconstructing boilerplate." (Shihipar)

### Standard 8: Run History (OPTIONAL for metric-producing skills)

Skills that produce measurable output MAY log results to `${CLAUDE_PLUGIN_DATA}` for trend detection across sessions.

**Source:** "Store data in a stable folder... the next time you run it, Claude reads its own history and can tell what's changed." (Shihipar)

### Standard 9: On-Demand Hooks (OPTIONAL for guardrail skills)

Skills that enforce constraints MAY register session-scoped hooks via skill frontmatter.

**Source:** "Skills can include hooks that are only activated when the skill is called, and last for the duration of the session." (Shihipar)

---

## Implementation Phases

### Phase 1: Quick Wins (1-2 days)
- Add Gotchas sections to top 20 QE skills (seeded from Nagual + local DB)
- Rewrite descriptions as trigger conditions for all 80 QE skills
- Strip obvious textbook content from ~30 knowledge-heavy skills

### Phase 2: Structural (3-5 days)
- Split 14 monster skills (>500 lines) into hub+spoke
- Add folder structure (references, templates, examples) to top 10 skills
- De-railroad prescriptive skills (goals over steps)
- Add config.json setup to 7 user-facing skills

### Phase 3: Behavioral (3-5 days)
- Add composable scripts to 5 tool-based skills
- Add run-history logging to 5 metric-producing skills
- Implement 5 on-demand hook skills
- Add skill composition cross-references

### Phase 4: Architecture (5-7 days)
- Consolidate 5 redundancy clusters (14 skills → 7)
- Implement skill usage measurement (PreToolUse hook)
- Create 4 new skills for missing categories (Runbooks, Product Verification)
- Update skill-builder skill to enforce new standards

---

## Dependencies

| Relationship | ADR ID | Title | Notes |
|--------------|--------|-------|-------|
| Builds On | ADR-056 | Skill Validation System | ADR-056 validates output; ADR-086 improves input (skill design). Complementary. |
| Relates To | ADR-060 | Semantic Anti-Drift | Gotchas sections prevent semantic drift in skill interpretation across model versions |
| Relates To | ADR-083 | Coherence-Gated Actions | Completion theater gotchas align with coherence verification |

---

## References

| Ref ID | Title | Type | Location |
|--------|-------|------|----------|
| EXT-001 | Lessons from Building Claude Code: How We Use Skills (Shihipar, Anthropic) | External Article | [LinkedIn](https://www.linkedin.com/pulse/lessons-from-building-claude-code-how-we-use-skills-thariq-shihipar-iclmc/) |
| INT-001 | QE Skills Improvement Plan | Internal Plan | [docs/qe-skills-improvement-plan.md](../../qe-skills-improvement-plan.md) |
| INT-002 | The Conductor Who Won't Stop Conducting | Blog/Retrospective | Nagual pattern (forge-quality.dev) |
| INT-003 | When the Orchestra Learns to Tune Itself | Blog/Retrospective | Nagual pattern (forge-quality.dev) |
| EXT-002 | ETH Zurich agentfile study (138 configs) | Academic | Referenced in Nagual agentic-qe domain |

---

## Governance

| Review Board | Date | Outcome | Next Review |
|--------------|------|---------|-------------|
| QE Architecture | 2026-03-18 | Proposed | 2026-09-18 |

---

## Status History

| Status | Date | Notes |
|--------|------|-------|
| Proposed | 2026-03-18 | Initial creation from Anthropic best practices gap analysis |

---

## Definition of Done Checklist

### Core (ECADR)
- [x] **E - Evidence**: Gap analysis against Anthropic published practices + failure data from Nagual (5,316 patterns) and local DB (6,709 experiences)
- [x] **C - Criteria**: 3 options compared (phased adoption, status quo, full rewrite)
- [ ] **A - Agreement**: Pending stakeholder review
- [x] **D - Documentation**: WH(Y) statement complete, improvement plan linked
- [x] **R - Review**: 6-month cadence set

### Extended
- [x] **Dp - Dependencies**: ADR-056, ADR-060, ADR-083 relationships documented
- [x] **Rf - References**: External article, internal plan, blog articles linked
- [ ] **M - Master**: Not part of a larger initiative
