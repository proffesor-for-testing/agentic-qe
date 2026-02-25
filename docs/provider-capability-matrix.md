# Provider Capability Matrix

> Generated: 2026-02-24
> Purpose: Map AQE skill requirements to provider capabilities for OpenCode integration.

## Provider Capabilities

| Capability | Claude Sonnet/Opus | GPT-4o | Gemini Pro | Local (Llama/Mistral) |
|---|---|---|---|---|
| Extended thinking | Yes | No | No | No |
| Tool use reliability | Excellent | Good | Good | Variable |
| Code generation quality | Excellent | Excellent | Good | Fair |
| Complex reasoning | Excellent | Good | Good | Fair |
| Context window | 200k | 128k | 1M | 4k-128k |
| Max output tokens | 8k-16k | 16k | 8k | 2k-4k |
| Cost per 1M tokens (input) | $3-15 | $2.50 | $1.25 | Free |
| Streaming support | Yes | Yes | Yes | Yes |
| Function/tool calling | Native | Native | Native | Varies |
| JSON mode | Yes | Yes | Yes | Partial |
| Multi-turn consistency | Excellent | Good | Good | Fair |
| Instruction following | Excellent | Excellent | Good | Fair |

## Effective Model Tier Mapping

| Provider / Model | Effective Tier | Notes |
|---|---|---|
| Claude Opus | tier3-best | Full capability, extended thinking, best reasoning |
| Claude Sonnet | tier3-best | Strong reasoning, reliable tool use |
| Claude Haiku | tier2-good | Fast, good for simple analysis and generation |
| GPT-4o | tier2-good | Strong code generation, good reasoning |
| GPT-4o-mini | tier2-good | Decent for straightforward tasks |
| GPT-3.5-turbo | tier1-any | Only for simple mechanical tasks |
| Gemini Pro | tier2-good | Large context window, good code generation |
| Gemini Flash | tier1-any | Fast but limited reasoning |
| Llama 3.1 70B | tier2-good | Strong open model, needs good quantization |
| Llama 3.1 8B | tier1-any | Simple tasks only |
| Mistral Large | tier2-good | Good reasoning for an open model |
| Mistral 7B | tier1-any | Basic tasks, formatting, linting |
| CodeLlama 34B | tier1-any | Code-specific but limited reasoning |

## AQE Skill Tier Requirements

### tier1-any (Any model works)

Simple, mechanical tasks that follow clear patterns. No complex reasoning needed.

**Required capabilities**: Basic text generation, instruction following.
**Skills**: Formatting checks, linting rules, simple code transforms, basic reporting.

| Skill | Key Requirement | Degradation if Lower |
|---|---|---|
| quality-metrics | Compute metrics from structured data | N/A (lowest tier) |
| test-reporting-analytics | Format test results into reports | N/A |
| compliance-testing | Check against compliance checklists | N/A |
| localization-testing | Verify i18n/l10n patterns | N/A |
| compatibility-testing | Check platform compatibility matrices | N/A |
| test-data-management | Generate structured test data | N/A |
| test-environment-management | Environment config validation | N/A |

### tier2-good (Needs decent reasoning)

Tasks requiring code understanding, pattern recognition, and structured analysis.

**Required capabilities**: Good code generation, tool calling, multi-step reasoning.
**Skills**: Test generation, code review, coverage analysis, basic security checks.

| Skill | Key Requirement | Degradation if Lower |
|---|---|---|
| qe-test-generation | Generate meaningful test cases | Lower coverage, weaker assertions |
| qe-coverage-analysis | Analyze coverage gaps | May miss edge cases |
| code-review-quality | Structured code review | Shallower analysis |
| regression-testing | Identify regression risk areas | May miss subtle regressions |
| api-testing-patterns | Generate API test suites | Simpler test patterns |
| contract-testing | Validate API contracts | May miss breaking changes |
| performance-testing | Design performance test plans | Less sophisticated scenarios |
| tdd-london-chicago | Guide TDD workflows | Weaker mock design |

### tier3-best (Needs advanced reasoning)

Complex tasks requiring deep analysis, multi-factor reasoning, or security expertise.

**Required capabilities**: Extended thinking, excellent reasoning, strong tool orchestration.
**Skills**: Security analysis, architecture review, mutation testing, defect prediction.

| Skill | Key Requirement | Degradation if Lower |
|---|---|---|
| qe-security-compliance | Deep security analysis | BLOCK: security gaps unacceptable |
| pentest-validation | Penetration test validation | BLOCK: requires expert reasoning |
| mutation-testing | Design effective mutants | WARN: weaker mutant design |
| qe-defect-intelligence | Predict defects from patterns | WARN: lower prediction quality |
| chaos-engineering-resilience | Design chaos experiments | WARN: simpler fault models |
| qcsd-ideation-swarm | Multi-agent quality analysis | WARN: reduced swarm quality |

## Context Window Considerations

| Provider | Effective Context | AQE Impact |
|---|---|---|
| Claude Opus/Sonnet | 200k tokens | Full skill support, large codebase analysis |
| GPT-4o | 128k tokens | Most skills work, may need file chunking for large repos |
| Gemini Pro | 1M tokens | Largest context, good for whole-repo analysis |
| Local 8B models | 4k-32k tokens | Severe limitation: must chunk aggressively, skip multi-file analysis |
| Local 70B models | 32k-128k tokens | Workable with careful context management |

## Recommendations

1. **Default to Claude Sonnet/Opus** for tier3-best skills (security, architecture, defect prediction)
2. **GPT-4o is a strong alternative** for tier2-good skills (test generation, code review)
3. **Gemini Pro excels** when large context is needed (whole-repo coverage analysis)
4. **Local models** should only run tier1-any skills unless the model is 70B+ with good quantization
5. **Always check provider tier** before executing a skill -- use the graceful degradation middleware
