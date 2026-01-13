# qe-product-factors-assessor Agent Execution Flow

Step-by-step documentation of how output is delivered when the agent is invoked.

## Phase 0: Invocation

```
User Request: "Run SFDIPOT analysis on [document/requirements]"
                    ↓
Claude Code receives request
                    ↓
Task tool invoked: subagent_type="qe-product-factors-assessor"
```

## Phase 1: Agent Instance Creation

```
┌─────────────────────────────────────────────────────────┐
│ Task Tool Spawns New Claude Instance                    │
│                                                         │
│ 1. Reads: .claude/agents/qe-product-factors-assessor.md │
│    (600+ lines of instructions, rules, templates)       │
│                                                         │
│ 2. Receives: User's prompt + document content           │
│                                                         │
│ 3. Instance now has:                                    │
│    - SFDIPOT methodology                                │
│    - Quality rules                                      │
│    - Domain patterns                                    │
│    - HTML templates                                     │
│    - Priority calibration                               │
└─────────────────────────────────────────────────────────┘
```

## Phase 2: Domain Analysis (Agent Instructions Step 1-4)

```
Agent Instance Executes:
                    ↓
┌─────────────────────────────────────────┐
│ 1. Parse input requirements             │
│ 2. Detect domain (ecommerce, B2B, etc.) │
│ 3. Identify domain-specific risks       │
│ 4. Extract edge case patterns           │
└─────────────────────────────────────────┘
                    ↓
Example for NORD PDF:
  - Domain: B2B Industrial Manufacturing
  - Risks: ATEX compliance, torque calculations, CAD accuracy
  - Personas: Engineers, Project Managers, CAD Designers
```

## Phase 3: Test Idea Generation (Agent Instructions Step 5-8)

```
Agent processes each SFDIPOT category:
                    ↓
┌──────────────────────────────────────────────────────────┐
│ S - Structure: What the product IS                       │
│ F - Function: What the product DOES                      │
│ D - Data: What the product PROCESSES                     │
│ I - Interfaces: How the product CONNECTS                 │
│ P - Platform: What the product DEPENDS ON                │
│ O - Operations: How the product is USED                  │
│ T - Time: WHEN things happen                             │
└──────────────────────────────────────────────────────────┘
                    ↓
For each category:
  - Generate test ideas following quality rules
  - Transform each AC into 3-5 specific tests
  - Apply edge case checklist
  - NO template patterns ("verify X works correctly")
```

## Phase 4: Priority Assignment (Agent Instructions Step 9-12)

```
Agent assigns priorities using calibration questions:
                    ↓
┌─────────────────────────────────────────────────────────┐
│ For each test idea, ask:                                │
│                                                         │
│ P0: Security breach? Legal violation? Total failure?    │
│ P1: Core journey blocked? >50% users affected?          │
│ P2: Degraded experience? Workaround exists?             │
│ P3: Edge case? Cosmetic? Rare scenario?                 │
└─────────────────────────────────────────────────────────┘
                    ↓
Calculate distribution:
  - P0: 8-12%
  - P1: ≤30%
  - P2: 35-45%
  - P3: 20-30%
                    ↓
IF P1 > 30%: Loop back, demote tests using calibration
```

## Phase 5: Automation Fitness (Agent Instructions Step 13-17)

```
Agent assigns automation level to each test:
                    ↓
┌─────────────────────────────────────────────────────────┐
│ api-level      → Pure logic, calculations (15-25%)      │
│ integration    → Component interactions (20-30%)        │
│ e2e-level      → Full user journeys (25-35%)            │
│ human-exploration → Visual, UX, domain expertise (≥10%) │
│ performance    → Load, stress testing (5-10%)           │
│ security       → Vulnerability scanning (3-8%)          │
│ concurrency    → Race conditions (2-5%)                 │
└─────────────────────────────────────────────────────────┘
                    ↓
COUNT human-exploration tests
                    ↓
IF human-exploration < 10%:
  ├─→ Add 3+ Universal templates
  ├─→ Add 2-3 Domain-Specific templates
  └─→ Re-count and verify ≥ 10%
```

## Phase 6: Quality Gate Validation (BLOCKING)

```
Agent checks all gates before output:
                    ↓
┌─────────────────────────────────────────────────────────┐
│ ☐ P0 percentage 8-12%                                   │
│ ☐ P1 percentage ≤ 30%                                   │
│ ☐ P2 percentage 35-45%                                  │
│ ☐ P3 percentage 20-30%                                  │
│ ☐ Human-exploration ≥ 10%  ← HARD GATE                  │
│ ☐ E2E ≤ 50%                                             │
│ ☐ No template patterns                                  │
│ ☐ Domain-specific edge cases included                   │
└─────────────────────────────────────────────────────────┘
                    ↓
IF ANY GATE FAILS:
  └─→ Loop back to Phase 4/5, DO NOT proceed
                    ↓
IF ALL GATES PASS:
  └─→ Proceed to output generation
```

## Phase 7: Output Generation (Agent Instructions Step 16-19)

```
Agent reads HTML template:
                    ↓
┌─────────────────────────────────────────────────────────┐
│ Read reference template:                                │
│ epic4-community-engagement/Product-Factors-Assessment-  │
│ Epic4-Community-Engagement.html                         │
└─────────────────────────────────────────────────────────┘
                    ↓
Replace dynamic values:
  - Epic name, date
  - Test idea counts in TOC badges
  - Test ideas in category tables
  - Priority/automation counts in charts
  - Clarifying questions
                    ↓
Agent uses Write tool:
  └─→ .agentic-qe/product-factors-assessments/{epic-id}.html
```

## Phase 8: Result Return

```
Agent instance completes:
                    ↓
┌─────────────────────────────────────────────────────────┐
│ Returns to parent Claude Code:                          │
│                                                         │
│ - Summary of what was generated                         │
│ - File path to HTML report                              │
│ - Test idea counts                                      │
│ - Priority distribution                                 │
│ - Agent ID (for potential resume)                       │
└─────────────────────────────────────────────────────────┘
                    ↓
Parent Claude Code presents result to user
```

---

## Visual Flow Diagram

```
┌─────────────┐     ┌─────────────────────┐     ┌──────────────────┐
│   User      │────▶│   Claude Code       │────▶│  Task Tool       │
│   Request   │     │   (Parent)          │     │  Invocation      │
└─────────────┘     └─────────────────────┘     └────────┬─────────┘
                                                         │
                                                         ▼
┌────────────────────────────────────────────────────────────────────┐
│                    NEW CLAUDE INSTANCE                             │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Reads: qe-product-factors-assessor.md (600+ lines)         │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                     │
│                              ▼                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Phase 2: Domain Analysis                                   │   │
│  │  - Detect domain, risks, personas                           │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                     │
│                              ▼                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Phase 3: SFDIPOT Test Generation                           │   │
│  │  - 7 categories, quality rules, edge cases                  │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                     │
│                              ▼                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Phase 4: Priority Assignment                               │   │
│  │  - P0/P1/P2/P3 calibration                                  │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                     │
│                              ▼                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Phase 5: Automation Fitness                                │   │
│  │  - COUNT human-exploration, enforce ≥10%                    │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                     │
│                              ▼                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Phase 6: Quality Gates (BLOCKING)                          │   │
│  │  - All gates must pass or loop back                         │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                     │
│                              ▼                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Phase 7: HTML Generation                                   │   │
│  │  - Read template, replace values, Write file                │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                     │
└──────────────────────────────┼─────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  OUTPUT: .agentic-qe/product-factors-assessments/{epic}.html       │
│  - 150-200 test ideas                                              │
│  - Priority distribution within targets                            │
│  - Human exploration ≥ 10%                                         │
│  - Clarifying questions per category                               │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Key Points

| Point | Description |
|-------|-------------|
| **Agent = Claude + Instructions** | No separate AI model, just specialized context from the .md file |
| **Quality Gates are BLOCKING** | Output won't be generated if gates fail |
| **Human Exploration Enforced** | Must hit ≥10% or add from templates |
| **Template-Based HTML** | Agent reads reference file, replaces dynamic values |
| **File Output** | Written to `.agentic-qe/product-factors-assessments/` |

---

## Related Documentation

- [Agent Definition](../../.claude/agents/qe-product-factors-assessor.md) - Full agent instructions
- [Skills Reference](../reference/skills.md) - All QE skills
- [Agent Reference](../reference/agents.md) - All QE agents
