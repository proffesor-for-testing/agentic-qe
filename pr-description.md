Hey 👋 @proffesor-for-testing

I ran your skills through `tessl skill review` at work and found some targeted improvements. Here's the full before/after:

![Score Card](score_card.png)

**87 skills improved** across the board — average score went from **61% → 83%** (+22%).

Here are the top 10 by improvement:

| Skill | Before | After | Change |
|-------|--------|-------|--------|
| sparc-methodology | 17% | 76% | +59% |
| github-project-management | 34% | 90% | +56% |
| github-code-review | 29% | 83% | +54% |
| v3-core-implementation | 31% | 83% | +52% |
| v3-mcp-optimization | 32% | 83% | +51% |
| github-workflow-automation | 34% | 83% | +49% |
| hooks-automation | 34% | 80% | +46% |
| flow-nexus-neural | 49% | 94% | +45% |
| flow-nexus-swarm | 36% | 81% | +45% |
| github-release-management | 30% | 75% | +45% |

<details>
<summary>Changes made</summary>

**Across all 87 improved skills:**

- **Fixed 34 non-kebab-case skill names** (e.g. `"QE Chaos Resilience"` → `"qe-chaos-resilience"`) — these were causing validation failures and 0% scores
- **Cleaned up frontmatter** — removed non-standard keys (`trust_tier`, `validation`, `implementation_status`, `optimization_version`, `last_optimized`, `category`, `priority`, `tokenEstimate`, `agents`, etc.), keeping only `name` and `description`
- **Improved descriptions** — added specific concrete actions, natural trigger terms, and "Use when..." clauses for better skill activation
- **Standardized description format** — converted chevron (`|`/`>`) separators to quoted strings
- **Trimmed verbose content** — removed redundant explanations, motivational statements, and generic "You are an expert" patterns
- **Added executable code examples** where skills had only abstract advice
- **Structured workflows** into numbered steps with validation checkpoints
- **Reduced bloated skills** — several went from 500-1100+ lines down to 100-300 lines while preserving all domain expertise
- **Preserved domain knowledge** — all specialized terminology and expert framing retained

**8 skills were reverted** after optimization caused score regressions — no harm done there.

**9 skills at 90%+ were left untouched** — already in great shape.

</details>

Honest disclosure — I work at @tesslio where we build tooling around skills like these. Not a pitch - just saw room for improvement and wanted to contribute.

Want to self-improve your skills? Just point your agent (Claude Code, Codex, etc.) at [this Tessl guide](https://docs.tessl.io/evaluate/optimize-a-skill-using-best-practices) and ask it to optimize your skill. Ping me - [@rohan-tessl](https://github.com/rohan-tessl) - if you hit any snags.

Thanks in advance 🙏
