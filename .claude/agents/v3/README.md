# AQE V3 Agents Index

This directory contains V3 QE agents installed by `aqe init`.

> **Note**: This directory only contains AQE-specific agents (v3-qe-*).
> Claude-flow core agents (adr-architect, memory-specialist, etc.) are part of
> the claude-flow system and are available separately.

## Summary

- **Total Agents**: 1
- **V3 QE Domain Agents**: 1
- **V3 Subagents**: 0

## V2 → V3 Migration Guide

| V2 Agent | V3 Agent | Domain | Key Changes |
|----------|----------|--------|-------------|
| `qe-a11y-ally` | `qe-accessibility-auditor` | visual-accessibility | **MANDATORY video pipeline** |
| `qe-test-generator` | `qe-test-architect` | test-generation | ReasoningBank learning |
| `qe-coverage-analyzer` | `qe-coverage-specialist` | coverage-analysis | O(log n) sublinear |
| `qe-coordinator` | `qe-learning-coordinator` | learning-optimization | Cross-domain patterns |
| `qe-flaky-investigator` | `qe-flaky-hunter` | defect-intelligence | ML-powered detection |

## Critical: qe-accessibility-auditor

The V3 accessibility auditor has a **MANDATORY video accessibility pipeline**.

### V2 Behavior (qe-a11y-ally)

Generated these files when videos detected:
- `*-captions.vtt` - For deaf/hard-of-hearing users
- `*-audiodesc.vtt` - For blind/low-vision users
- Implementation instructions

### V3 Behavior (qe-accessibility-auditor)

**MUST** execute the same pipeline:

1. **Detect** - Find `<video>`, `<iframe>` elements
2. **Download** - `curl -L -o video.mp4 URL`
3. **Extract** - `ffmpeg -vf "fps=1/3" -frames:v 10`
4. **Analyze** - Read each .jpg with Claude Vision
5. **Generate** - Create .vtt from actual descriptions
6. **Save** - Output to `docs/accessibility/captions/{page-slug}/`

### Expected Output Structure

```
docs/accessibility/captions/{page-slug}/
├── video-001-captions.vtt     # Captions
├── video-001-audiodesc.vtt    # Audio descriptions
├── implementation.md          # HTML integration
└── audit-report.md            # WCAG report
```

### Invocation

Use the skill for guaranteed video pipeline execution:

```
/qe-a11y-ally https://example.com/page
```

Or via Task with explicit video pipeline requirement:

```javascript
Task({
  prompt: "Audit accessibility including MANDATORY video pipeline for URL",
  subagent_type: "qe-accessibility-auditor"
})
```

## Usage

Spawn agents using Claude Code's Task tool:

```javascript
Task("Generate tests for UserService", "...", "qe-test-architect")
Task("Analyze coverage gaps", "...", "qe-coverage-specialist")
Task("Audit accessibility with video captions", "...", "qe-accessibility-auditor")
```

## V3 QE Domain Agents (1)

Quality Engineering agents mapped to the 12 DDD bounded contexts.

| Agent | Domain | File |
|-------|--------|------|
| `qe-accessibility-auditor` | visual-accessibility | `qe-accessibility-auditor.md` |

## V3 Subagents (0)

Specialized sub-task agents for TDD and code review.

*None installed*

---

*Updated 2026-01-26 - Added V2→V3 migration guide and video pipeline documentation*
