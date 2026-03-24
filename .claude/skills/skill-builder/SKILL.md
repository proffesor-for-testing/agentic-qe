---
name: "skill-builder"
description: "Create Claude Code Skills with proper YAML frontmatter, progressive disclosure structure, and directory organization. Use when building custom skills, generating skill templates, or understanding the Claude Skills specification."
---

# Skill Builder

Creates production-ready Claude Code Skills with proper YAML frontmatter, progressive disclosure architecture, and complete file/folder structure.

## Prerequisites

- Claude Code 2.0+ or Claude.ai with Skills support
- Basic understanding of Markdown and YAML

## Quick Start

```bash
# 1. Create skill directory (MUST be at top level, NOT in subdirectories!)
mkdir -p ~/.claude/skills/my-first-skill

# 2. Create SKILL.md with proper format
cat > ~/.claude/skills/my-first-skill/SKILL.md << 'EOF'
---
name: "My First Skill"
description: "Brief description of what this skill does and when Claude should use it."
---

# My First Skill

## What This Skill Does
[Your instructions here]

## Quick Start
[Basic usage]
EOF

# 3. Restart Claude Code or refresh Claude.ai to detect skill
```

---

## YAML Frontmatter (REQUIRED)

Every SKILL.md **must** start with YAML frontmatter containing exactly two fields:

```yaml
---
name: "Skill Name"                    # REQUIRED: Max 64 chars
description: "What this skill does    # REQUIRED: Max 1024 chars
and when Claude should use it."       # Include BOTH what & when
---
```

**`name`**: Max 64 chars, Title Case, concise and descriptive.

**`description`**: Max 1024 chars. MUST include:
1. **What** the skill does (functionality)
2. **When** Claude should invoke it (trigger conditions)

**Examples**:
```yaml
# Good: Specific with trigger conditions
description: "Generate OpenAPI 3.0 documentation from Express.js routes. Use when creating API docs, documenting endpoints, or building API specifications."

# Bad: No "when" clause
description: "A comprehensive guide to API documentation"
```

**Critical**: Only `name` and `description` are used by Claude. Additional fields are ignored.

---

## Directory Structure

```
~/.claude/skills/                    # Personal skills (all projects)
└── my-skill/                        # MUST be at top level!
    ├── SKILL.md                     # REQUIRED: Main skill file
    ├── scripts/                     # Optional: Executable scripts
    ├── resources/                   # Optional: Templates, examples, schemas
    └── docs/                        # Optional: Additional documentation

<project-root>/.claude/skills/       # Project skills (team-shared, git-tracked)
└── team-skill/
    └── SKILL.md
```

**IMPORTANT**: Skills MUST be directly under `~/.claude/skills/[skill-name]/` or `.claude/skills/[skill-name]/`. Claude Code does NOT support nested subdirectories.

---

## Progressive Disclosure Architecture

Claude Code uses a **3-level system** to scale to 100+ skills:

| Level | Loaded | Size | Purpose |
|-------|--------|------|---------|
| 1: Metadata | Always (startup) | ~200 chars/skill | Autonomous skill matching |
| 2: SKILL.md Body | When triggered | 1-10KB | Main instructions |
| 3: Referenced Files | On-demand | Variable | Deep reference, examples |

**Benefit**: 100+ skills with ~6KB context. Only active skill content enters context.

---

## Content Structure

```markdown
---
name: "Your Skill Name"
description: "What it does and when to use it"
---

# Your Skill Name

## Level 1: Overview
Brief 2-3 sentence description.

## Prerequisites
- Requirement 1

## Quick Start
```bash
command --option value
```

## Step-by-Step Guide

### Step 1: Setup
[Instructions with expected output]

### Step 2: Configuration
[Options and settings]

### Step 3: Execution
[Run and verify]

## Troubleshooting
- **Issue**: Problem → **Solution**: Fix
```

---

## Description Best Practices

1. **Front-load keywords**: Put action verbs and technologies first
2. **Include trigger conditions**: Always add "Use when..." clause
3. **Be specific**: Name technologies, frameworks, patterns

```yaml
# Good
description: "Generate TypeScript interfaces from JSON schema. Use when converting schemas, creating types, or building API clients."

# Bad
description: "This skill helps developers who need to work with JSON schemas."
```

---

## Validation Checklist

**Frontmatter**: `---` delimiters, `name` (max 64), `description` (max 1024) with what+when, no YAML errors.

**Structure**: SKILL.md exists, directory is top-level under skills/, no nested subdirectories.

**Content**: Brief overview, quick start with example, step-by-step guide, troubleshooting section.

**Progressive Disclosure**: Core in SKILL.md (~2-5KB), advanced in separate docs/, large resources in resources/.

---

## Skill Templates

### Basic Skill

```markdown
---
name: "My Basic Skill"
description: "One sentence what. Use when [trigger conditions]."
---

# My Basic Skill

## What This Skill Does
[2-3 sentences]

## Quick Start
```bash
# Single command to get started
```

## Step-by-Step Guide
### Step 1: Setup
### Step 2: Usage
### Step 3: Verify

## Troubleshooting
- **Issue**: Problem → **Solution**: Fix
```

### Intermediate Skill (With Scripts)

```markdown
---
name: "My Skill"
description: "What with key features. Use when [trigger 1], [trigger 2], or [trigger 3]."
---

# My Skill

## Prerequisites
- Requirement 1

## Quick Start
```bash
./scripts/setup.sh
./scripts/generate.sh my-project
```

## Configuration
Edit `config.json`: `{ "option1": "value1" }`

## Available Scripts
- `scripts/setup.sh` - Initial setup
- `scripts/generate.sh` - Code generation
- `scripts/validate.sh` - Validation
```

---

## Micro-File Step Architecture (BMAD-006)

For skills exceeding 1,000 lines, split into step files to combat LLM "lost in the middle" context degradation.

| SKILL.md Size | Recommendation |
|---------------|----------------|
| Under 1,000 lines | Single file is fine |
| 1,000 - 1,500 lines | SHOULD split into step files |
| Over 1,500 lines | MUST split into step files |

### Directory Convention

```
my-skill/
  SKILL.md            # Compact orchestrator (200-300 lines)
  steps/
    01-first-step.md   # Self-contained step file
    02-second-step.md
    03-third-step.md
```

### Step File Requirements

Each step file MUST include:
1. **Title** with step number
2. **Prerequisites** from prior steps
3. **Instructions** (self-contained, no references back to SKILL.md)
4. **Success Criteria** checklist
5. **Output** description
6. **Navigation** with explicit Read tool instructions for next step

### Key Rules

- Step files MUST be under 500 lines each
- Step files MUST be self-contained (no references to SKILL.md content)
- Step files MUST include explicit `Read()` instructions for next step
- Orchestrator is table of contents and control flow, not content dump

---

## Learn More

- [Anthropic Agent Skills Documentation](https://docs.claude.com/en/docs/agents-and-tools/agent-skills)
- [GitHub Skills Repository](https://github.com/anthropics/skills)
- [Claude Code Documentation](https://docs.claude.com/en/docs/claude-code)
