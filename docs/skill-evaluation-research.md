# Skill Evaluation Research Report

**Date**: 2026-02-18
**Status**: Complete
**Sources**: 10+ industry sources analyzed

---

## Executive Summary

We analyzed how leading platforms evaluate AI agent skills and compared them against our AQE skill evaluation infrastructure. Our system is already more sophisticated than most in areas like trust tiers, multi-model testing, and learning integration. However, we have clear gaps in **skill quality scoring** (LLM-as-a-judge for how well skills are written), **activation conflict detection**, **adaptive rubric-based grading**, and **eval-driven development workflow**. This report synthesizes findings from Tessl, Anthropic's official guidance, OpenAI's eval methodology, Google Vertex AI's rubric systems, DeepEval, and Anthropic's engineering blog.

---

## 1. Tessl Framework Analysis

**Source**: [docs.tessl.io/evaluate/evaluating-skills](https://docs.tessl.io/evaluate/evaluating-skills), [docs.tessl.io/evaluate/evaluate-skill-quality-using-scenarios](https://docs.tessl.io/evaluate/evaluate-skill-quality-using-scenarios)

### Two-Layer Evaluation System

#### Layer 1: `tessl skill review` — Static Quality Assessment (LLM-as-a-Judge)

- **Validation Checks**: Deterministic grading on structure (frontmatter, line count, licensing, metadata) — ~12-15 structural criteria
- **Implementation Score**: LLM judges conciseness, actionability, workflow clarity, progressive disclosure — 1-4 point subscores per metric
- **Activation Score**: LLM judges description specificity, trigger term quality, distinctiveness/conflict risk
- Scoring benchmarks: 90%+ = best practice, 70-89% = good, <70% = needs revision

#### Layer 2: `tessl eval run` — Scenario-Based End-to-End Evaluation

- Each scenario has 3 files:
  - `capability.text` — which skill capability is targeted
  - `TASK.md` — a real task for the agent to solve
  - `criteria.json` — grading rubric
- Scenarios can be **auto-generated** from skill instructions, then manually reviewed
- Agent actually executes the task, and output is graded against criteria
- CLI: `tessl eval run`, `tessl eval view`, `tessl eval list`, `tessl eval retry`

### Key Tessl Insight

Tessl separates **skill quality** (how well is the SKILL.md written?) from **skill effectiveness** (does the agent produce correct output?). We only do the latter.

---

## 2. Anthropic's Official Skill Authoring Guidance

**Source**: [Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)

### Evaluation-Driven Development (Most Important Takeaway)

Anthropic recommends building evals **BEFORE** writing extensive skill documentation:

1. **Identify gaps**: Run Claude on representative tasks without a skill. Document failures.
2. **Create evaluations**: Build 3+ scenarios that test those gaps
3. **Establish baseline**: Measure Claude's performance without the skill
4. **Write minimal instructions**: Just enough to pass evaluations
5. **Iterate**: Execute evaluations, compare against baseline, refine

> "This approach ensures you're solving actual problems rather than anticipating requirements that may never materialize."

### Skill Quality Checklist (from Anthropic)

**Core Quality**:
- Description is specific, includes trigger terms, written in **third person**
- SKILL.md body under 500 lines
- Progressive disclosure with one-level-deep references
- No time-sensitive information
- Consistent terminology throughout

**Key Principles**:
- **Conciseness is critical** — context window is a shared resource. Challenge every paragraph: "Does Claude really need this?"
- **Degrees of freedom** — match specificity to task fragility (high freedom for flexible tasks, low freedom for fragile operations)
- **Test with ALL models** — what works for Opus may need more detail for Haiku

**Naming Conventions**:
- Use **gerund form**: `processing-pdfs`, `analyzing-spreadsheets` (not `pdf-helper`, `utils`)
- Lowercase, hyphens only, max 64 characters

### Iterative Development with Claude A/B Pattern

- **Claude A** = skill author (helps design/refine the skill)
- **Claude B** = skill user (tests the skill on real tasks in a fresh context)
- Observe Claude B's behavior → bring findings back to Claude A → refine → repeat

### Relevance to AQE

Many of our 97 skills likely violate these principles. An automated quality scorer could flag:
- Skills over 500 lines
- Inconsistent terminology
- Vague descriptions
- Time-sensitive content
- Deeply nested references

---

## 3. Anthropic's Agent Eval Engineering Guide

**Source**: [Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)

### Three Grader Types

| Type | Speed | Cost | Best For |
|------|-------|------|----------|
| **Code-based** | Fast | Free | Exact match, regex, schema validation, outcome verification |
| **Model-based** | Medium | $$ | Subjective quality, reasoning assessment, rubric grading |
| **Human** | Slow | $$$$ | Gold-standard calibration, complex judgment |

### Key Metrics

- **pass@k**: Probability of ≥1 success across k attempts (when one working solution suffices)
- **pass^k**: Probability ALL k trials succeed (critical for consistency-required agents)

### Critical Best Practices

1. **Start with 20-50 tasks from REAL user failures** — outperforms hundreds of synthetic ones
2. **Grade outputs, not paths** — agents often discover valid approaches evaluators didn't anticipate
3. **Build in partial credit** — recognize continua of success, not just binary pass/fail
4. **Read transcripts regularly** — distinguish genuine failures from grading bugs
5. **Monitor saturation** — when evals hit 100%, graduate them to regression suites and create harder ones

### Relevance to AQE

Our `must_contain` keyword checks are **code-based graders only**. We're missing:
- **Model-based grading** for subjective quality dimensions
- **Partial credit scoring** (currently binary pass/fail per keyword)
- **pass@k / pass^k metrics** for measuring consistency across trials
- **Saturation monitoring** for knowing when to create harder evals

---

## 4. OpenAI's Eval Skills Methodology

**Source**: [Testing Agent Skills Systematically with Evals](https://developers.openai.com/blog/eval-skills/)

### Four Success Dimensions

Every skill eval should measure across these dimensions:
1. **Outcome goals**: Did the task complete correctly?
2. **Process goals**: Did the agent follow intended steps?
3. **Style goals**: Does output adhere to conventions?
4. **Efficiency goals**: Were unnecessary operations minimized?

### Evaluation Dataset Structure

Start with 10-20 test cases covering:
- **Explicit invocation**: Direct skill name reference
- **Implicit invocation**: Skill triggers via description match
- **Contextual invocation**: Real-world scenarios
- **Negative controls**: Cases where skill should NOT activate

### Advanced Checks to Layer In

Beyond basic output validation:
- **Command counting**: Detect looping or inefficient workflows
- **Token tracking**: Monitor input/output usage for prompt bloat
- **Build verification**: Run actual builds as end-to-end validation
- **Repository cleanliness**: Ensure no unwanted files generated
- **Permission validation**: Verify least-privilege constraints

### Key Insight

> "The fundamental shift is from subjective assessment ('this feels better') to measurable validation."

### Relevance to AQE

We're missing:
- **Negative control test cases** — verifying skills DON'T activate incorrectly
- **Efficiency metrics** — token usage and command counting per skill invocation
- **Process goals** — did the agent follow the right steps, not just get the right answer?

---

## 5. Google Vertex AI: Adaptive vs Static Rubrics

**Source**: [Vertex AI Rubric-Based Metrics](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/rubric-metric-details)

### Two Rubric Approaches

| Approach | Description | Best For |
|----------|-------------|----------|
| **Adaptive Rubrics** | Auto-generate unique pass/fail checks per prompt | Varied prompts, no reference answers |
| **Static Rubrics** | Fixed scoring guidelines across all prompts | Consistent benchmarks, standardized metrics |

### Adaptive Rubrics (Recommended Default)

For each input, the system dynamically generates prompt-specific checks:
- "Is the response under 100 words?"
- "Does it mention the Sept 15 deadline?"
- "Does it return valid JSON with keys `risk_level` and `next_steps`?"

These catch **highly specific contracts** that static rubrics miss.

### Relevance to AQE

Our current eval system uses entirely **static rubrics** (`must_contain` patterns). Adopting adaptive rubrics would:
- Auto-generate context-specific validation per test case
- Catch skill-specific output requirements we currently miss
- Reduce manual effort writing `must_contain` lists

---

## 6. DeepEval Agent Metrics

**Source**: [DeepEval AI Agent Evaluation](https://deepeval.com/guides/guides-ai-agent-evaluation), [Tool Correctness Metric](https://deepeval.com/docs/metrics-tool-correctness)

### Agent-Specific Metrics

| Metric | What It Measures |
|--------|-----------------|
| **Tool Correctness** | Did the agent select the right tools and call them with correct arguments? |
| **Task Completion** | Did the agent accomplish what the user asked? |
| **Reasoning Quality** | Was the agent's decision-making process sound? |

### Key Insight

> "AI agents fail in fundamentally different ways than simple LLM applications—an agent might select the right tool but pass wrong arguments, create a brilliant plan but fail to follow it, or complete the task but waste resources on redundant steps."

### Relevance to AQE

For our MCP-integrated skills, we should evaluate:
- Did the skill invoke the correct MCP tools?
- Were tool arguments correct?
- Was the overall task completed?
- Were any redundant tool calls made?

---

## 7. Anthropic's Empirical Evaluation Guide

**Source**: [Create strong empirical evaluations](https://platform.claude.com/docs/en/test-and-evaluate/develop-tests)

### Grading Method Hierarchy

Choose the **fastest, most reliable, most scalable** method:

1. **Code-based**: Exact match, string match — fastest, most reliable
2. **LLM-based**: Rubric-driven assessment — fast, flexible, requires calibration
3. **Human**: Most flexible — slow, expensive, avoid if possible

### Eval Methods by Quality Dimension

| Dimension | Method | Example |
|-----------|--------|---------|
| Task fidelity | Exact match | Sentiment == "positive" |
| Consistency | Cosine similarity | Paraphrased inputs → similar outputs |
| Relevance | ROUGE-L | Summary captures key information |
| Tone/Style | LLM Likert scale | Rate empathy 1-5 |
| Safety | LLM binary classification | Contains PHI? yes/no |
| Context use | LLM ordinal scale | References conversation history? 1-5 |

### Tips for LLM-Based Grading

- **Detailed, clear rubrics** with specific criteria and examples
- **Empirical output** — "Output only 'correct' or 'incorrect'" or 1-5 scale
- **Encourage reasoning** — ask LLM to think first, then score (chain-of-thought improves grading accuracy)
- **Use a different model** to grade than the model that generated the output

### Relevance to AQE

We should adopt:
- **Cosine similarity** for consistency testing across similar inputs
- **LLM Likert scales** for subjective quality dimensions
- **Chain-of-thought grading** — have the judge reason before scoring
- **Cross-model grading** — don't use the same model to both generate and evaluate

---

## 8. Comparison: AQE vs Industry

| Capability | AQE | Tessl | Anthropic | OpenAI | Vertex AI | DeepEval |
|-----------|-----|-------|-----------|--------|-----------|----------|
| Trust tiers | **T0-T4** | None | None | None | None | None |
| Multi-model testing | **Built-in** | None | Recommended | None | None | None |
| Learning integration | **MCP + ReasoningBank** | None | None | None | None | None |
| Schema validation | **4-layer** | Basic | None | None | None | None |
| Skill quality scoring | Missing | **LLM judge** | Checklist | None | None | None |
| Adaptive rubrics | Missing | None | None | None | **Built-in** | None |
| Negative controls | Missing | None | **Recommended** | **Required** | None | None |
| Tool correctness | Missing | None | None | None | None | **Built-in** |
| Partial credit | Missing | None | **Recommended** | None | None | None |
| pass@k / pass^k | Missing | None | **Built-in** | None | None | None |
| Eval-driven development | Missing | None | **Core workflow** | **Core workflow** | None | None |
| Activation conflict detection | Missing | **Built-in** | None | None | None | None |
| Auto-generated evals | Missing | **Built-in** | None | None | **Adaptive** | None |
| Efficiency metrics | Missing | None | None | **Command/token counting** | None | None |
| Cosine similarity grading | Missing | None | **Documented** | None | None | None |

**Legend**: Bold = strong implementation

---

## 9. Prioritized Recommendations

### P0 — High Impact, Addresses Core Gaps

#### 1. Eval-Driven Development Workflow
**Why**: Anthropic and OpenAI both make this their #1 recommendation. Write evals before skill content.
**Implementation**: Add `aqe skill eval-init <skill-name>` that creates baseline eval from task failures, then `aqe skill eval-compare` to measure improvement.
**Effort**: Medium

#### 2. LLM-as-a-Judge Skill Quality Scorer
**Why**: Tessl has this, Anthropic recommends it. We have 39 Tier-0 skills with no quality signal.
**Implementation**: Score each SKILL.md on: conciseness (under 500 lines), actionability, description specificity, trigger term quality, terminology consistency, progressive disclosure usage. Output a 0-100 score with specific improvement suggestions.
**Effort**: Medium

#### 3. Activation Conflict Detector
**Why**: With 97 skills, overlapping descriptions cause mis-routing. Tessl scores this as "distinctiveness."
**Implementation**: Embed all skill descriptions → compute pairwise cosine similarity → flag pairs above 0.7 threshold → suggest description refinements.
**Effort**: Low (we already have HNSW/vector infrastructure)

### P1 — Medium Impact, Deepens Eval Quality

#### 4. Adaptive Rubric Grading
**Why**: Our `must_contain` keyword matching misses context-specific requirements. Vertex AI's adaptive rubrics auto-generate checks.
**Implementation**: For each eval test case, have an LLM generate prompt-specific pass/fail checks, then grade the output against those checks.
**Effort**: Medium

#### 5. Multi-Dimensional Grading (Beyond Keywords)
**Why**: Anthropic documents 6+ grading methods (exact match, cosine similarity, ROUGE-L, Likert, binary classification, ordinal). We only use keyword match.
**Implementation**: Add grading modes to eval YAML: `grading_method: [keyword_match | cosine_similarity | llm_likert | llm_rubric | schema_check]`
**Effort**: Medium-High

#### 6. Negative Control Test Cases
**Why**: OpenAI requires testing when skills should NOT activate. We don't test this.
**Implementation**: Add `negative_test_cases` section to eval YAML — inputs where the skill should decline or redirect.
**Effort**: Low

### P2 — Refinements and Efficiency

#### 7. pass@k / pass^k Consistency Metrics
**Why**: Anthropic's engineering guide highlights these as critical for measuring agent reliability across multiple trials.
**Implementation**: Run each eval test case k times, compute both metrics. Surface pass^k for skills used in CI/production.
**Effort**: Low

#### 8. Efficiency Metrics (Token/Command Tracking)
**Why**: OpenAI recommends tracking token usage and command counts per skill invocation to detect bloat.
**Implementation**: Add `max_tokens`, `max_tool_calls` fields to eval success criteria.
**Effort**: Low

#### 9. Auto-Generate Eval YAML from SKILL.md
**Why**: 39 skills at Tier 0 need evals. Tessl auto-generates scenarios from skill instructions.
**Implementation**: LLM reads SKILL.md → generates eval YAML with test cases, expected outputs, and success criteria → human reviews and refines.
**Effort**: Medium

#### 10. Tool Correctness Metrics (for MCP Skills)
**Why**: DeepEval shows agent-specific metrics are different. Our MCP-integrated skills should validate tool selection and arguments.
**Implementation**: For MCP-calling skills, verify: correct tools selected, correct arguments passed, no redundant calls.
**Effort**: Medium

---

## 10. What We Already Do Better Than Everyone

These are genuine competitive advantages we should maintain and publicize:

1. **Trust Tier System (T0-T4)** — No other platform has a graduated trust system with clear upgrade paths
2. **Multi-Model Consistency Testing** — Built-in variance tracking across Sonnet/Haiku is unique
3. **MCP + ReasoningBank Learning** — Eval results feed into shared learning, no competitor does this
4. **Structured YAML Eval Format** — More organized than Tessl's 3-file-per-scenario approach
5. **4-Layer Validation Architecture** — Schema → Validator → Eval Suite → CI is more rigorous than industry standard
6. **Fleet-Wide Pattern Sharing** — Successful patterns propagate to other agents automatically

---

## Sources

- [Tessl: Evaluating Skills](https://docs.tessl.io/evaluate/evaluating-skills)
- [Tessl: Evaluate Skill Quality Using Scenarios](https://docs.tessl.io/evaluate/evaluate-skill-quality-using-scenarios)
- [Anthropic: Demystifying Evals for AI Agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
- [Anthropic: Skill Authoring Best Practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
- [Anthropic: Create Strong Empirical Evaluations](https://platform.claude.com/docs/en/test-and-evaluate/develop-tests)
- [OpenAI: Testing Agent Skills Systematically with Evals](https://developers.openai.com/blog/eval-skills/)
- [Google Vertex AI: Rubric-Based Metrics](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/rubric-metric-details)
- [DeepEval: AI Agent Evaluation](https://deepeval.com/guides/guides-ai-agent-evaluation)
- [DeepEval: Tool Correctness Metric](https://deepeval.com/docs/metrics-tool-correctness)
- [LLM Evaluation: 2026 Edition (Medium)](https://medium.com/@future_agi/llm-evaluation-frameworks-metrics-and-best-practices-2026-edition-162790f831f4)
- [IBM Research: Evaluating LLM-based Agents](https://research.ibm.com/publications/evaluating-llm-based-agents-foundations-best-practices-and-open-challenges)
- [orq.ai: Agent Evaluation in 2025](https://orq.ai/blog/agent-evaluation)
- [Rubric-Based Evaluation for Agentic Systems](https://medium.com/@aiforhuman/rubric-based-evaluation-for-agentic-systems-db6cb14d8526)
