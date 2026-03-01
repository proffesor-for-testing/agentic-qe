# ADR-041: QE CLI Enhancement

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-041 |
| **Status** | Implemented |
| **Date** | 2026-01-11 |
| **Author** | Claude Code |
| **Review Cadence** | 6 months |

---

## WH(Y) Decision Statement

**In the context of** the QE CLI providing basic commands for QE operations but lacking modern CLI features for complex workflows,

**facing** no interactive wizard for complex QE operations, missing progress indicators for long-running fleet operations, no workflow automation for QE pipelines, basic command completion without intelligence, and no streaming output for test execution,

**we decided for** enhancing the QE CLI with 4 interactive wizards (test generation, coverage analysis, fleet init, security scan), multi-bar progress indicators with ETA, YAML-based workflow automation with scheduling, intelligent shell completions, and real-time streaming output,

**and neglected** keeping minimal CLI (insufficient UX), GUI-based approach (deployment complexity), and external workflow tools like GitHub Actions alone (less integration),

**to achieve** improved developer experience with guided workflows, visual feedback for long operations, automated QE pipelines with scheduling, faster command discovery via completions, and CI/CD-ready workflow definitions,

**accepting that** this adds CLI dependencies (prompts, progress bars), introduces learning curve for workflow YAML, and increases CLI binary size (mitigated by tree-shaking).

---

## Context

The existing QE CLI provided basic commands but lacked modern features. Users needed guided workflows for complex operations, visual feedback during long-running tasks, and the ability to automate QE pipelines for CI/CD integration.

Security hardening was applied including path traversal protection, file size limits (YAML: 10K lines, JSON: 10MB), prototype pollution protection in deepMerge(), and scheduler path validation.

---

## Options Considered

### Option 1: Modern CLI Enhancement (Selected)

Add interactive wizards, progress bars, workflow automation, and streaming output.

**Pros:** Improved UX, automation support, CI/CD ready, visual feedback
**Cons:** Additional dependencies, learning curve for YAML workflows

### Option 2: Minimal CLI (Rejected)

Keep CLI basic, rely on documentation.

**Why rejected:** Poor developer experience, no automation capability.

### Option 3: GUI Application (Rejected)

Build separate GUI for complex operations.

**Why rejected:** Deployment complexity, not CI/CD friendly, maintenance burden.

---

## Dependencies

| Relationship | ADR ID | Title | Notes |
|--------------|--------|-------|-------|
| Part Of | MADR-001 | V3 Implementation Initiative | Developer tooling |
| Relates To | ADR-037 | V3 QE Agent Naming | Agent names used in completions |
| Relates To | ADR-039 | V3 QE MCP Optimization | CLI uses optimized MCP calls |

---

## References

| Ref ID | Title | Type | Location |
|--------|-------|------|----------|
| SPEC-041-A | Interactive Wizards | Technical Spec | [specs/SPEC-041-A-interactive-wizards.md](../specs/SPEC-041-A-interactive-wizards.md) |
| SPEC-041-B | Workflow Automation | Technical Spec | [specs/SPEC-041-B-workflow-automation.md](../specs/SPEC-041-B-workflow-automation.md) |
| SPEC-041-C | Progress and Streaming | Technical Spec | [specs/SPEC-041-C-progress-streaming.md](../specs/SPEC-041-C-progress-streaming.md) |

---

## Governance

| Review Board | Date | Outcome | Next Review |
|--------------|------|---------|-------------|
| Architecture Team | 2026-01-11 | Approved | 2026-07-11 |

---

## Status History

| Status | Date | Notes |
|--------|------|-------|
| Proposed | 2026-01-11 | Initial ADR creation |
| Approved | 2026-01-11 | Architecture review passed |
| Implemented | 2026-01-14 | All features complete, 555 CLI tests passing |
