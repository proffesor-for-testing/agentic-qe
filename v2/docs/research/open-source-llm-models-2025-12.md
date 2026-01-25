# Open-Source LLM Models for Quality Engineering AI Agents
## Research Report - December 2025

**Research Date:** December 23, 2025
**Purpose:** Evaluate open-source LLM models for integration into the AQE Fleet
**Focus Areas:** Code generation, test generation, quality engineering tasks, agentic workflows

---

## Executive Summary

This research identifies the top open-source coding models available in December 2025 for integration into Quality Engineering AI agent systems. The landscape has evolved significantly, with specialized coding models now rivaling or exceeding proprietary solutions in specific tasks.

### Top Recommendations by Use Case

| Use Case | Primary Model | Alternative | Notes |
|----------|--------------|-------------|-------|
| **Test Generation** | Kimi-Dev-72B | Qwen3-Coder-30B | Best SWE-bench performance (60.4%) |
| **Code Review** | Devstral-2 (123B) | DeepSeek-Coder-V2 | Exceptional tool usage, 72.2% SWE-bench |
| **Bug Analysis** | RNJ-1 (8B) | Qwen3-Coder-30B | 20.8% SWE-bench at 8B size |
| **Documentation** | Llama 3.3 70B | Qwen3-Coder-30B | Strong text generation |
| **Multi-file Refactoring** | Qwen3-Coder-480B | Devstral-2 (123B) | 256K+ context window |
| **Local/Edge Deployment** | Devstral-Small-2 (24B) | RNJ-1 (8B) | Efficient inference, MIT/Apache 2.0 |

---

## Detailed Model Analysis

### 1. Qwen3-Coder Series (Alibaba Cloud)

**Latest Release:** July 2025
**Variants:** 30B-A3B, 480B-A35B
**Architecture:** Mixture-of-Experts (MoE)
**License:** Qwen License (research & commercial use permitted)

#### Qwen3-Coder-30B-A3B
- **Total Parameters:** 30.5B
- **Active Parameters:** 3.3B (128 experts, 8 active)
- **Context Window:** 262K tokens
- **Training Data:** 7.5T tokens (70% code ratio)
- **Ollama:** ✅ Available (`qwen3-coder:30b`)

**Benchmarks:**
- Aider Polyglot: Competitive with top models
- Clean markdown tasks: 9.25/10 (tied with Claude Opus 4, Kimi K2)
- Described as "most agentic code model in Qwen series"

**Hardware Requirements:**
- Minimum (BF16): ~60GB VRAM
- Quantized (Q4_K_M): ~15-20GB VRAM
- Recommended: 24GB+ VRAM for production use

#### Qwen3-Coder-480B-A35B
- **Total Parameters:** 480B
- **Active Parameters:** 35B
- **Context Window:** 256K native, 1M with extrapolation
- **Training Data:** 7.5T tokens

**Benchmarks:**
- Aider Polyglot: 61.8% (SOTA, rivals Claude Sonnet-4, GPT-4.1)
- HumanEval: Competitive with GPT-4 class models
- SWE-Bench: Strong performance on real-world tasks

**Hardware Requirements:**
- Minimum (BF16): ~960GB VRAM
- Quantized (Q4_K_XL): ~276GB VRAM (60.9% Aider score)
- Recommended: Multi-GPU setup (4x A100 80GB)

**Use Cases:**
- Large codebase understanding and refactoring
- Multi-file architectural changes
- Advanced agentic coding workflows
- Repository-level code intelligence

**Sources:**
- [Qwen3-Coder Official](https://qwenlm.github.io/blog/qwen3/)
- [Qwen3-Coder GitHub](https://github.com/QwenLM/Qwen3-Coder)
- [16x Engineer Evaluation](https://eval.16x.engineer/blog/qwen3-coder-evaluation-results)

---

### 2. Devstral Series (Mistral AI)

**Latest Release:** December 9, 2025
**Variants:** Devstral-2 (123B), Devstral-Small-2 (24B)
**Architecture:** Dense Transformer
**License:** Devstral-2 (Modified MIT), Devstral-Small-2 (Apache 2.0)

#### Devstral-2 (123B)
- **Parameters:** 123B (dense)
- **Context Window:** 256K tokens
- **Training:** Fine-tuned for agentic software development
- **Release Date:** December 9, 2025

**Benchmarks:**
- SWE-bench Verified: **72.2%** (highest among evaluated models)
- Cost Efficiency: 7x more efficient than Claude Sonnet
- Tool Usage: Exceptional for file system operations and code navigation

**Hardware Requirements:**
- Minimum: 4x H100-class GPUs
- VRAM (BF16): ~250GB
- Quantized (Q4): ~60GB

**API Pricing (after free tier):**
- Input: $0.40/million tokens
- Output: $2.00/million tokens

#### Devstral-Small-2 (24B)
- **Parameters:** 24B (dense)
- **Context Window:** 256K tokens
- **SWE-bench Verified:** 68.0% (best 24B model)
- **Multimodal:** Supports image inputs

**Hardware Requirements:**
- VRAM (BF16): ~48GB
- Quantized (Q4): ~12GB
- **Ideal for:** Laptop deployment, local development

**API Pricing:**
- Input: $0.10/million tokens
- Output: $0.30/million tokens

**Use Cases:**
- Multi-file codebase exploration
- Automated bug fixing and testing
- Legacy system modernization
- Framework dependency tracking
- Fast local inference with tight feedback loops

**Companion Tools:**
- Mistral Vibe CLI for end-to-end code automation
- Integration with Kilo Code and Cline

**Sources:**
- [Mistral AI Devstral-2 Announcement](https://mistral.ai/news/devstral-2-vibe-cli)
- [Devstral-2 Hugging Face](https://huggingface.co/mistralai/Devstral-2-123B-Instruct-2512)
- [VentureBeat Coverage](https://venturebeat.com/ai/mistral-launches-powerful-devstral-2-coding-model-including-open-source)

---

### 3. DeepSeek-Coder Series

**Latest Versions:** DeepSeek-Coder-V2, DeepSeek-V3
**Architecture:** Mixture-of-Experts (MoE)
**License:** DeepSeek License (open-source, commercial use)

#### DeepSeek-Coder-V2
- **Architecture:** MoE
- **Training:** 2T+ tokens of code and technical language
- **HumanEval:** **85.6%** (highest for open-source coding models in 2025)
- **Supported Languages:** 300+
- **Ollama:** ✅ Available (`deepseek-coder-v2`)

**Benchmarks:**
- HumanEval: 85.6% (best open-source)
- MBPP: Outperforms CodeLlama-34B by 9.3%
- DS-1000: Leads CodeLlama-34B by 5.9%

#### DeepSeek-V3
- **HumanEval-Mul (Pass@1):** 69.3%
- **First-try Success Rate:** ~65% (approaching GPT-4)
- **Code Quality:** Enhanced visual design and requirement comprehension

**DeepSeek-V3-0324 Update (March 24, 2025):**
- Improved webpage generation
- Better requirement comprehension
- Higher-quality code output
- Clearer logic structure

**Use Cases:**
- Multi-language code generation
- Algorithm-focused Python problems
- Math-heavy coding challenges
- Competitive programming

**Sources:**
- [DeepSeek-Coder GitHub](https://github.com/deepseek-ai/DeepSeek-Coder)
- [DeepSeek-V3 GitHub](https://github.com/deepseek-ai/DeepSeek-V3)
- [DeepWiki HumanEval Benchmark](https://deepwiki.com/deepseek-ai/DeepSeek-Coder/4.1-humaneval-benchmark)

---

### 4. Phi-4 (Microsoft)

**Release Date:** December 12, 2024 (Research Preview), Full Open-Source: Early 2025
**Parameters:** 14B (dense)
**Architecture:** Dense decoder-only transformer
**License:** MIT License

**Training:**
- **Data:** 9.8T tokens
- **Dataset Composition:**
  - Curated public documents (quality-filtered)
  - Synthetic data (math, coding, reasoning)
  - Python-focused (common packages: typing, math, random, collections, datetime, itertools)

**Benchmarks:**
- MMLU (Multitask Language Understanding): Strong performance
- MATH (Competition Math): Outperforms many larger models
- GPQA (Graduate-level Science): Competitive scores
- HumanEval (Code Generation): Strong Python generation
- SimpleQA (Factual Responses): High accuracy

**Key Strengths:**
- Mathematical reasoning
- Complex logic problems
- Memory and compute efficiency
- Python code generation

**Phi-4 Model Family (2025 Expansions):**
- **Phi-4-multimodal:** Vision + language capabilities
- **Phi-4-mini:** Smaller, faster variant
- **Phi-4-reasoning:** Enhanced step-by-step reasoning
- **Phi-4-reasoning-plus:** Advanced reasoning capabilities
- **Phi-4-mini-reasoning:** Compact reasoning model

**Notable Achievement:**
Phi-4-reasoning models achieve better performance than OpenAI o1-mini and DeepSeek-R1-Distill-Llama-70B on most benchmarks, despite 14B size vs 671B for DeepSeek-R1.

**Hardware Requirements:**
- VRAM (BF16): ~28GB
- Quantized (Q4): ~7GB
- **Ideal for:** Mid-range GPUs (12-16GB VRAM)

**Use Cases:**
- Mathematical problem solving
- Python code generation and debugging
- Reasoning-heavy coding tasks
- Resource-constrained environments

**Sources:**
- [Microsoft Phi-4 Blog](https://techcommunity.microsoft.com/blog/azure-ai-foundry-blog/introducing-phi-4-microsoft%E2%80%99s-newest-small-language-model-specializing-in-comple/4357090)
- [Phi-4 Hugging Face](https://huggingface.co/microsoft/phi-4)
- [VentureBeat Coverage](https://venturebeat.com/ai/microsoft-makes-powerful-phi-4-model-fully-open-source-on-hugging-face)

---

### 5. RNJ-1 (Essential AI)

**Release Date:** December 4, 2025
**Parameters:** 8B (dense)
**Architecture:** Dense, trained from scratch
**License:** Apache 2.0

**Training:**
- **Pretraining:** 8.4T tokens (8K context)
- **Mid-training:** 380B tokens (extended to 32K context)
- **SFT:** 150B tokens (final instruction tuning)
- **Final Context Window:** 32K tokens

**Benchmarks:**
- **SWE-bench Verified:** **20.8%** (bash-only mode)
  - Beats Gemini 2.0 Flash
  - On par with GPT-4o
  - **10x stronger** than comparably sized models
- **HE-FIM-Python (avg):**
  - Base model: 82.49%
  - Instruct model: 86.21%
- **HumanEval+, MBPP+:** Competitive with larger models
- **BigCodeBench, LiveCodeBench v6:** Strong performance

**Specialized Capabilities:**
- **Code infilling:** Explicitly trained on FIM data
- **Agentic workflows:** Order of magnitude better than 8B peers
- **STEM tasks:** Optimized for math and science
- **Tool invocation:** Enhanced for function calling

**Hardware Requirements:**
- VRAM (BF16): ~16GB
- Quantized (Q4): ~4GB
- **Ollama:** ✅ Available (`rnj-1:8b`, `rnj-1:8b-instruct-q4_K_M`)

**Use Cases:**
- Edge deployment
- Local development environments
- Agent systems requiring tool use
- Code completion and infilling
- STEM problem-solving

**Design Philosophy:**
"Limited post-training preserves flexibility for domain specialization and fine-tuning" - deliberately designed for community extension.

**Sources:**
- [RNJ-1 Medium Article](https://medium.com/data-science-in-your-pocket/rnj-1-the-best-coding-and-stem-small-llm-e56b6e076049)
- [RNJ-1 Ollama](https://ollama.com/library/rnj-1)
- [Essential AI Tweet](https://x.com/essential_ai/status/1997123631156215855)

---

### 6. StarCoder 2 (BigCode Project)

**Release Date:** February 2024 (still relevant in 2025)
**Variants:** 3B, 7B, 15B
**Architecture:** Dense Transformer
**License:** BigCode OpenRAIL-M v1

**Training Partners:**
- 3B: ServiceNow
- 7B: Hugging Face
- 15B: Nvidia

**Training Data:**
- The Stack v2: 619 programming languages
- GitHub pull requests
- Kaggle notebooks
- Code documentation
- **Size:** 67.5TB (vs 6.4TB for original StarCoder)
- **Tokens:** 3.3T to 4.3T depending on variant

**Context Window:**
- Initial training: 4,096 tokens
- Extended: 16,384 tokens (long-context pretraining)

**Benchmarks:**
- **StarCoder2-3B:** Outperforms StarCoderBase-15B
- **StarCoder2-15B:**
  - Matches/outperforms CodeLlama-34B (2x larger)
  - Beats DeepSeekCoder-33B on math and reasoning
  - Strong performance on low-resource languages
- **HumanEval & MBPP:** Exceptional for model size

**Hardware Requirements:**

| Model | BF16 VRAM | Q4 VRAM | Recommended CPU | Recommended GPU |
|-------|-----------|---------|-----------------|-----------------|
| 3B | ~6GB | ~1.5GB | 8-core, 3.0 GHz | RTX 3070 |
| 7B | ~14GB | ~3.5GB | 12-core, 3.5 GHz | RTX 3090 |
| 15B | ~30GB | ~7.5GB | 16-core, 4.0 GHz | RTX 4090 / A100 |

**Ollama:** ✅ Available (`starcoder2`)

**Use Cases:**
- Multi-language code completion
- Low-resource programming languages
- Cost-effective code generation
- GPU-constrained environments

**Sources:**
- [StarCoder 2 Paper](https://arxiv.org/abs/2402.19173)
- [StarCoder 2 GitHub](https://github.com/bigcode-project/starcoder2)
- [TechCrunch Coverage](https://techcrunch.com/2024/02/28/starcoder-2-is-a-code-generating-ai-that-runs-on-most-gpus/)

---

### 7. Kimi-Dev-72B (Moonshot AI)

**Release Date:** June 2025
**Base Model:** Qwen2.5-72B
**Parameters:** 72B (dense)
**License:** MIT License

**Training Method:**
- Large-scale reinforcement learning
- Autonomous repository patching in Docker environments
- Reward only for solutions passing complete test suites
- Mid-training: ~150B tokens (high-quality, real-world data)

**Dual Architecture:**
- **BugFixer:** Autonomous issue resolution
- **TestWriter:** Comprehensive test generation

**Benchmarks:**
- **SWE-bench Verified:** **60.4%** (SOTA among open-source)
  - Surpasses all other open-source models
  - New state-of-the-art result

**Training Data Sources:**
- Millions of GitHub issues
- Pull request commits
- Real-world software engineering scenarios

**Hardware Requirements:**
- VRAM (BF16): ~144GB
- Quantized (Q4): ~36GB
- **Recommended:** Multi-GPU setup or high-VRAM single GPU

**Use Cases:**
- Automated bug fixing
- Test suite generation
- GitHub issue resolution
- Production code patches
- Real-world software engineering tasks

**Availability:**
- **Ollama:** Quantized GGUF versions available
- **SiliconFlow API:** Production-ready inference

**Sources:**
- [Kimi-Dev-72B Hugging Face](https://huggingface.co/moonshotai/Kimi-Dev-72B)
- [Kimi-Dev GitHub](https://github.com/MoonshotAI/Kimi-Dev)
- [SiliconFlow Model Page](https://www.siliconflow.com/models/kimi-dev-72b)

---

### 8. Meta Llama 3.3 70B

**Release Date:** December 6, 2024
**Parameters:** 70B (dense)
**Architecture:** Dense decoder-only transformer
**License:** Meta Llama 3 Community License

**Training:**
- **Data:** ~15T tokens
- **Cutoff Date:** December 2023
- **Context Window:** 128K tokens

**Key Achievement:**
Performance comparable to Llama 3.1 405B at a fraction of the computational cost.

**Benchmarks:**
- **HumanEval (0-shot):** 88.4 (vs 89.0 for 3.1 405B)
- **MBPP EvalPlus (base):** 87.6 (vs 86.0 for 3.1 70B)
- Strong performance on coding, reasoning, math, general knowledge

**Coding Capabilities:**
- Enhanced programming language comprehension
- Code generation and debugging
- JSON output for function calling
- Step-by-step reasoning
- Wide programming language coverage

**Hardware Requirements:**
- VRAM (BF16): ~140GB
- Quantized (Q4): ~35GB
- **Recommended:** 48GB+ VRAM or multi-GPU

**Cost Efficiency:**
Delivers 405B-class results at 70B cost/resource requirements.

**Use Cases:**
- High-quality code generation
- Complex reasoning tasks
- Multi-language development
- Documentation generation
- Cost-sensitive production deployments

**Sources:**
- [DataCamp Llama 3.3 Overview](https://www.datacamp.com/blog/llama-3-3-70b)
- [Llama 3.3 Hugging Face](https://huggingface.co/meta-llama/Llama-3.3-70B-Instruct)
- [Llama 3.3 Coding Guide](https://blogs.novita.ai/llama-3-3-70b-for-code/)

---

## Quantization & Hardware Requirements

### Understanding Quantization

Quantization reduces the precision of model weights to decrease memory usage:

| Precision | Bits/Weight | Bytes/Weight | Quality | Use Case |
|-----------|-------------|--------------|---------|----------|
| BF16/FP16 | 16 | 2 | 100% (baseline) | Production, benchmarking |
| 8-bit | 8 | 1 | ~98% | Balanced performance |
| 4-bit (Q4_K_M) | 4 | 0.5 | ~95% | Standard local deployment |
| 4-bit (Q4_K_S) | 4 | 0.5 | ~93% | Resource-constrained |

**VRAM Calculation Formula:**
```
VRAM (GB) = (Parameters in Billions × Bits) / 8 × 1.2
```

The 1.2 multiplier accounts for inference overhead.

### Examples:

| Model | BF16 | Q8 | Q4_K_M | Q4_K_S |
|-------|------|----|---------|---------|
| 7B | ~14GB | ~7GB | ~3.5GB | ~3.2GB |
| 14B | ~28GB | ~14GB | ~7GB | ~6.4GB |
| 30B | ~60GB | ~30GB | ~15GB | ~13.5GB |
| 70B | ~140GB | ~70GB | ~35GB | ~32GB |
| 480B | ~960GB | ~480GB | ~240GB | ~220GB |

### GPU Tier Recommendations

#### Entry-Level (6-8GB VRAM)
- **GPU:** RTX 3060, RTX 4060
- **Models:** 7-9B at Q4_K_M
  - RNJ-1 8B
  - Phi-4 14B (tight fit with Q4)
  - StarCoder2-3B
- **Performance:** 40+ tokens/second
- **Use Cases:** Code completion, local development

#### Mid-Range (12-16GB VRAM)
- **GPU:** RTX 3060 Ti 16GB, RTX 4060 Ti 16GB
- **Models:** 13-30B at Q4_K_M
  - Devstral-Small-2 24B
  - Qwen3-Coder-30B
  - StarCoder2-15B
- **Performance:** 30-50 tokens/second
- **Use Cases:** Professional development, agentic tasks

#### High-End Consumer (24GB VRAM)
- **GPU:** RTX 3090, RTX 4090
- **Models:** 30-70B at Q4_K_M
  - Llama 3.3 70B
  - Kimi-Dev-72B
  - DeepSeek-Coder-V2
- **Performance:** 20-40 tokens/second
- **Use Cases:** Complex refactoring, large codebase analysis

#### Workstation (48GB+ VRAM)
- **GPU:** A6000, RTX 6000 Ada
- **Models:** 70-123B at Q4/Q8
  - Devstral-2 123B (Q4)
  - Llama 3.3 70B (Q8)
- **Performance:** 15-30 tokens/second
- **Use Cases:** Production-grade agentic systems

#### Data Center (80GB+ VRAM per GPU)
- **GPU:** A100 80GB, H100 80GB
- **Models:** 70-480B at higher precision
  - Qwen3-Coder-480B (4x A100 80GB)
  - Devstral-2 123B (BF16)
- **Performance:** Varies by setup
- **Use Cases:** Multi-agent orchestration, enterprise deployments

### Quantization Performance Impact

**Code Generation Tasks:**
- Q8: ~2% quality loss vs BF16
- Q4_K_M: ~5% quality loss
- Q4_K_S: ~7% quality loss

**Agentic Reasoning:**
- Q8: ~3% quality loss
- Q4_K_M: ~8% quality loss
- Q4_K_S: ~12% quality loss

**General Recommendation:** Q4_K_M offers the best balance (75% memory reduction, ~95% performance retention).

**Sources:**
- [DEV Community VRAM Guide](https://dev.to/simplr_sh/general-recommended-vram-guidelines-for-llms-4ef3)
- [Modal VRAM Inference Guide](https://modal.com/blog/how-much-vram-need-inference)
- [LocalLLM Ollama VRAM Guide](https://localllm.in/blog/ollama-vram-requirements-for-local-llms)

---

## Ollama Model Availability (December 2025)

### Available Models

| Model | Ollama Command | Recommended Variant | VRAM (Q4) |
|-------|----------------|---------------------|-----------|
| Qwen3-Coder | `ollama pull qwen3-coder:30b` | 30b | ~15GB |
| DeepSeek-Coder | `ollama pull deepseek-coder-v2` | v2:16b | ~8GB |
| RNJ-1 | `ollama pull rnj-1:8b-instruct-q4_K_M` | 8b-instruct | ~4GB |
| StarCoder 2 | `ollama pull starcoder2:15b` | 15b | ~7.5GB |
| Llama 3.3 | `ollama pull llama3.3:70b-instruct-q4_K_M` | 70b Q4 | ~35GB |
| Phi-4 | `ollama pull phi4:14b` | 14b | ~7GB |

### Ollama Model Selection Strategy

**For 8GB VRAM Systems:**
```bash
# Best all-around coding
ollama pull rnj-1:8b-instruct-q4_K_M

# Alternative: StarCoder2 3B for ultra-low memory
ollama pull starcoder2:3b
```

**For 16GB VRAM Systems:**
```bash
# Best coding model for this tier
ollama pull qwen3-coder:30b

# Alternative: DeepSeek for multi-language
ollama pull deepseek-coder-v2:16b
```

**For 24GB+ VRAM Systems:**
```bash
# Best general-purpose coding
ollama pull llama3.3:70b-instruct-q4_K_M

# Best for agentic workflows
ollama pull qwen3-coder:30b
```

### Ollama Performance Tips

1. **Use Q4_K_M quantization** for best balance
2. **Enable GPU acceleration** with `--gpu` flag
3. **Increase context window** for large files: `--ctx-size 16384`
4. **Adjust thread count** for CPU inference: `--num-thread 8`

**Sources:**
- [Ollama Library](https://ollama.com/library)
- [CodeGPT Ollama Coding Guide](https://www.codegpt.co/blog/best-ollama-model-for-coding)
- [Collabnix Ollama Models 2025](https://collabnix.com/best-ollama-models-for-developers-complete-2025-guide-with-code-examples/)

---

## Quality Engineering Task-Specific Recommendations

### Test Generation

**Primary:** Kimi-Dev-72B
- **Reason:** 60.4% SWE-bench (best autonomous test generation)
- **Dual architecture:** BugFixer + TestWriter design
- **Real-world training:** GitHub issues and PRs

**Alternative:** Qwen3-Coder-30B
- **Reason:** Highly agentic, efficient inference
- **Context:** 262K tokens for large test suites
- **Cost:** Lower VRAM requirements

**Budget Option:** RNJ-1 8B
- **Reason:** 20.8% SWE-bench at 8B size (10x better than peers)
- **Infilling:** Exceptional code completion for test writing

**Evaluation Framework:** DeepEval
- Open-source LLM testing framework
- 14+ evaluation metrics
- Pytest-like interface for LLM outputs
- [DeepEval GitHub](https://github.com/confident-ai/deepeval)

### Code Review

**Primary:** Devstral-2 (123B)
- **Reason:** 72.2% SWE-bench (highest score)
- **Tool usage:** Exceptional file navigation
- **Multi-file:** Strong architectural understanding

**Alternative:** Qwen3-Coder-480B
- **Reason:** 61.8% Aider Polyglot, 256K context
- **Scale:** Handles entire repository analysis
- **Long horizon:** Advanced RL training for deep review

**Local/Edge:** Devstral-Small-2 (24B)
- **Reason:** 68.0% SWE-bench (best 24B)
- **Deployment:** Runs on laptops
- **Multimodal:** Can review UI/UX code with images

### Bug Analysis & Debugging

**Primary:** Kimi-Dev-72B
- **Reason:** BugFixer architecture, trained on real GitHub issues
- **Autonomous:** Can patch and validate fixes
- **Docker-tested:** Only rewards working solutions

**Alternative:** RNJ-1 8B
- **Reason:** Matches GPT-4o on SWE-bench at 8B size
- **Tool use:** Strong agentic capabilities
- **Efficiency:** Fast iteration cycles

**Reasoning-Heavy:** Phi-4-reasoning-plus
- **Reason:** Beats larger models on complex logic bugs
- **Step-by-step:** Detailed reasoning traces
- **Math/Logic:** Excels at algorithmic bugs

### Documentation Generation

**Primary:** Llama 3.3 70B
- **Reason:** Strong text generation, 128K context
- **Balance:** 405B-class quality at 70B cost
- **JSON output:** Structured documentation

**Alternative:** Qwen3-Coder-30B
- **Reason:** Code-aware documentation
- **Context:** 262K tokens for large projects
- **Efficiency:** Fast inference for doc generation

**API Docs:** DeepSeek-Coder-V2
- **Reason:** 300+ language support
- **Consistency:** Strong cross-language docs

### Agentic Workflows & Multi-File Refactoring

**Primary:** Qwen3-Coder-480B
- **Reason:** "Most agentic code model" with 256K-1M context
- **Scale:** Repository-level understanding
- **Long horizon:** Advanced RL for complex workflows

**Cost-Effective:** Devstral-2 (123B)
- **Reason:** 7x cheaper than Claude Sonnet, 72.2% SWE-bench
- **Tools:** Excellent file system operations
- **Workflow:** Mistral Vibe CLI integration

**Local Deployment:** Qwen3-Coder-30B
- **Reason:** Only 3.3B active parameters
- **Speed:** Fast multi-agent coordination
- **MoE:** Efficient expert routing

### Performance & Load Testing

**Recommendation:** Llama 3.3 70B or DeepSeek-V3
- **Reason:** Strong mathematical reasoning
- **Metrics:** Understanding of performance concepts
- **Analysis:** Statistical analysis capabilities

### Security Scanning & Vulnerability Detection

**Primary:** Devstral-2 (123B)
- **Reason:** Comprehensive codebase scanning
- **Tool use:** Security tool integration
- **Real-world:** Trained on production code patterns

**Alternative:** Qwen3-Coder-30B
- **Reason:** Broad language coverage
- **Pattern recognition:** Identifies anti-patterns

---

## Automated Test Generation Tools

### Qodo Cover (Open-Source TestGen-LLM)

**Background:**
Implementation of Meta's TestGen-LLM paper ("Automated Unit Test Improvement using Large Language Models at Meta"), released as open-source.

**Key Features:**
- **Fully automated:** Generates, validates, and proposes tests
- **Coverage-driven:** Iterates until coverage goals met
- **Unobtrusive:** Runs in background
- **Validation:** Guarantees improvements over existing codebase

**Integration:**
Can be integrated with any of the recommended LLMs above for test generation tasks.

**Source:**
- [Qodo TestGen-LLM Blog](https://www.qodo.ai/blog/we-created-the-first-open-source-implementation-of-metas-testgen-llm/)

---

## Model Comparison Matrix

### Comprehensive Benchmark Table

| Model | Params | Active | Context | HumanEval | SWE-bench | License | Ollama | VRAM (Q4) |
|-------|--------|--------|---------|-----------|-----------|---------|--------|-----------|
| **Qwen3-Coder-30B** | 30.5B | 3.3B | 262K | Competitive | Strong | Qwen | ✅ | ~15GB |
| **Qwen3-Coder-480B** | 480B | 35B | 256K-1M | High | 61.8% (Aider) | Qwen | ❌ | ~276GB |
| **Devstral-2** | 123B | 123B | 256K | - | **72.2%** | MIT* | ❌ | ~60GB |
| **Devstral-Small-2** | 24B | 24B | 256K | - | **68.0%** | Apache 2.0 | ❌ | ~12GB |
| **DeepSeek-Coder-V2** | MoE | - | - | **85.6%** | - | DeepSeek | ✅ | ~8-16GB |
| **DeepSeek-V3** | MoE | - | - | 69.3% | - | DeepSeek | ✅ | ~20GB |
| **Phi-4** | 14B | 14B | 128K | Strong | - | MIT | ✅ | ~7GB |
| **RNJ-1** | 8B | 8B | 32K | 86.21% (FIM) | **20.8%** | Apache 2.0 | ✅ | ~4GB |
| **StarCoder2-15B** | 15B | 15B | 16K | Strong | - | OpenRAIL | ✅ | ~7.5GB |
| **Kimi-Dev-72B** | 72B | 72B | - | - | **60.4%** | MIT | Partial | ~36GB |
| **Llama 3.3 70B** | 70B | 70B | 128K | **88.4%** | - | Llama 3 | ✅ | ~35GB |

*Modified MIT for Devstral-2

### Performance vs Size Efficiency

**Best Performance (Top-Tier):**
1. Devstral-2 (123B) - 72.2% SWE-bench
2. Qwen3-Coder-480B - 61.8% Aider Polyglot
3. Kimi-Dev-72B - 60.4% SWE-bench

**Best Efficiency (Performance per Parameter):**
1. RNJ-1 (8B) - 20.8% SWE-bench (2.6% per billion params)
2. Qwen3-Coder-30B (3.3B active) - Strong Aider performance
3. Devstral-Small-2 (24B) - 68.0% SWE-bench (2.8% per billion)

**Best for Production (Balance):**
1. Llama 3.3 70B - 88.4% HumanEval, 405B-class quality
2. Qwen3-Coder-30B - Only 3.3B active, 262K context
3. DeepSeek-Coder-V2 - 85.6% HumanEval, MoE efficiency

---

## Licensing Comparison

### Fully Open-Source (Permissive)

| Model | License | Commercial Use | Modifications | Attribution |
|-------|---------|----------------|---------------|-------------|
| **Devstral-Small-2** | Apache 2.0 | ✅ Yes | ✅ Yes | ✅ Required |
| **RNJ-1** | Apache 2.0 | ✅ Yes | ✅ Yes | ✅ Required |
| **Phi-4** | MIT | ✅ Yes | ✅ Yes | ✅ Required |
| **Kimi-Dev-72B** | MIT | ✅ Yes | ✅ Yes | ✅ Required |
| **Devstral-2** | Modified MIT | ✅ Yes* | ✅ Yes* | ✅ Required |

*Check specific terms

### Open-Weight (Restricted Commercial)

| Model | License | Commercial Use | Notes |
|-------|---------|----------------|-------|
| **Llama 3.3** | Llama 3 Community | ✅ Yes (conditions) | Revenue cap for some uses |
| **Qwen3-Coder** | Qwen License | ✅ Yes (conditions) | Check specific terms |
| **DeepSeek** | DeepSeek License | ✅ Yes (conditions) | Open-source with restrictions |
| **StarCoder2** | BigCode OpenRAIL-M | ✅ Yes (responsible AI) | Use restrictions apply |

**Recommendation for AQE Fleet:**
Prioritize Apache 2.0 and MIT licensed models (RNJ-1, Phi-4, Devstral-Small-2, Kimi-Dev-72B) for maximum deployment flexibility.

---

## Integration Recommendations for AQE Fleet

### Multi-Model Strategy

**Tier 1: Primary Models (High-Performance)**
- **Devstral-2 (123B):** Code review, complex refactoring
- **Qwen3-Coder-30B:** General-purpose coding, agentic workflows
- **Kimi-Dev-72B:** Test generation, bug fixing

**Tier 2: Specialized Models**
- **RNJ-1 (8B):** Edge deployment, quick code completion
- **Phi-4 (14B):** Mathematical reasoning, logic-heavy tasks
- **Llama 3.3 70B:** Documentation, general-purpose fallback

**Tier 3: Cost-Optimized**
- **DeepSeek-Coder-V2:** Multi-language support
- **StarCoder2-15B:** Budget-friendly code generation

### Agent Assignment Strategy

```yaml
agents:
  qe-test-generator:
    primary_model: kimi-dev-72b
    fallback: qwen3-coder-30b
    local: rnj-1-8b

  qe-code-reviewer:
    primary_model: devstral-2-123b
    fallback: qwen3-coder-480b
    local: devstral-small-2-24b

  qe-bug-analyzer:
    primary_model: kimi-dev-72b
    fallback: rnj-1-8b
    reasoning: phi-4-reasoning-plus

  qe-documentation-writer:
    primary_model: llama-3.3-70b
    fallback: qwen3-coder-30b

  qe-performance-tester:
    primary_model: llama-3.3-70b
    fallback: deepseek-v3

  qe-security-scanner:
    primary_model: devstral-2-123b
    fallback: qwen3-coder-30b
```

### Deployment Architecture

**Cloud/Data Center:**
- Qwen3-Coder-480B (4x A100 80GB)
- Devstral-2 123B (4x H100)
- Kimi-Dev-72B (2x A100 80GB)

**Workstation/On-Premise:**
- Llama 3.3 70B (48GB VRAM, Q4)
- Qwen3-Coder-30B (24GB VRAM, Q4)
- Devstral-Small-2 24B (16GB VRAM, Q4)

**Edge/Local Development:**
- RNJ-1 8B (8GB VRAM, Q4)
- Phi-4 14B (12GB VRAM, Q4)
- StarCoder2-7B (8GB VRAM, Q4)

### API vs Self-Hosted Decision Matrix

| Factor | Use API | Self-Host |
|--------|---------|-----------|
| **Data Sensitivity** | Low | High |
| **Request Volume** | Low-Medium | High |
| **Customization Needed** | No | Yes |
| **Budget** | Variable usage | Fixed hardware cost |
| **Latency Requirements** | Flexible | Strict (<100ms) |
| **Model Updates** | Automatic | Manual |

**Hybrid Approach:**
- **Cloud API:** Qwen3-Coder-480B, Devstral-2 (occasional heavy tasks)
- **Self-Hosted:** Qwen3-Coder-30B, RNJ-1 (frequent, privacy-sensitive)

---

## Future-Proofing Considerations

### Emerging Trends (Q1 2026)

1. **Mixture-of-Experts (MoE) Dominance**
   - Models like Qwen3-Coder-480B show MoE can deliver massive model capabilities with active parameter efficiency
   - Expect more 200B+ total, 30-50B active models

2. **Specialized Domain Fine-Tuning**
   - Models like Kimi-Dev-72B and RNJ-1 show specialized training beats general-purpose
   - QE-specific fine-tuning likely valuable

3. **Agentic Architecture Native**
   - Future models will have built-in tool use, multi-step reasoning
   - Qwen3-Coder already leads as "most agentic"

4. **Context Window Expansion**
   - 256K-1M tokens becoming standard
   - Enables full repository understanding

5. **Reasoning Models**
   - Phi-4-reasoning series shows small models can match large with better reasoning
   - Expect more chain-of-thought native models

### Model Refresh Strategy

**Quarterly Review:**
- Monitor SWE-bench, HumanEval, Aider leaderboards
- Test new releases with AQE Fleet benchmarks
- Gradual rollout (10% -> 50% -> 100%)

**Evaluation Criteria:**
1. SWE-bench Verified score (primary)
2. HumanEval/MBPP (code generation)
3. Aider Polyglot (real-world editing)
4. License compatibility
5. VRAM requirements
6. Inference speed (tokens/second)

**Deprecation Policy:**
- Keep models competitive within 10% of SOTA
- Maintain at least 2 models per agent type
- Prioritize license flexibility

---

## Benchmark Methodology Sources

### Key Benchmarks Explained

**SWE-bench Verified:**
- Real GitHub issues from production repositories
- Models must create patches that pass test suites
- "Verified" subset: human-validated, unambiguous
- **Current SOTA:** Devstral-2 (72.2%)

**HumanEval:**
- 164 Python programming problems
- Function-level code generation
- Pass@1 metric (first attempt success)
- **Current SOTA (open-source):** DeepSeek-Coder-V2 (85.6%)

**Aider Polyglot:**
- Real-world code editing tasks
- Multi-file, multi-language changes
- Measures practical coding assistance
- **Current SOTA (open-source):** Qwen3-Coder-480B (61.8%)

**MBPP (Mostly Basic Python Problems):**
- 1,000 Python problems
- Entry-level to intermediate
- Tests practical code generation

**Sources:**
- [MarkTechPost LLM Benchmarks Guide](https://www.marktechpost.com/2025/07/31/the-ultimate-2025-guide-to-coding-llm-benchmarks-and-performance-metrics/)
- [KDnuggets LLM Evaluation Platforms](https://www.kdnuggets.com/top-5-open-source-llm-evaluation-platforms)

---

## Conclusion

### Top 5 Recommendations for AQE Fleet

1. **Qwen3-Coder-30B** (Primary Workhorse)
   - 3.3B active params, 262K context, strong agentic capabilities
   - Available on Ollama, runs on 24GB VRAM (Q4)
   - Best balance of performance, efficiency, and versatility

2. **Devstral-2 (123B)** (Code Review Specialist)
   - 72.2% SWE-bench (highest score)
   - Modified MIT license, available via API (currently free)
   - Deploy for complex review and refactoring tasks

3. **RNJ-1 (8B)** (Edge/Local Deployment)
   - 20.8% SWE-bench at 8B (10x better than peers)
   - Apache 2.0 license, runs on 8GB VRAM
   - Perfect for code completion, local agents

4. **Kimi-Dev-72B** (Test Generation Specialist)
   - 60.4% SWE-bench, BugFixer + TestWriter dual architecture
   - MIT license, trained on real GitHub issues
   - Best-in-class for automated testing

5. **Llama 3.3 70B** (Documentation & Fallback)
   - 88.4% HumanEval, 405B-class quality
   - Meta Llama 3 license, widely supported
   - Excellent documentation generation and general-purpose tasks

### Implementation Roadmap

**Phase 1: Foundation (Weeks 1-2)**
- Deploy Qwen3-Coder-30B via Ollama for all agents
- Integrate RNJ-1-8B for edge/local scenarios
- Establish baseline benchmarks on AQE tasks

**Phase 2: Specialization (Weeks 3-4)**
- Add Kimi-Dev-72B for test-generator agent
- Deploy Devstral-2 for code-review agent (API)
- Implement multi-model routing logic

**Phase 3: Optimization (Weeks 5-6)**
- Fine-tune quantization levels per GPU tier
- Implement model selection based on task complexity
- Add Llama 3.3 70B for documentation tasks

**Phase 4: Evaluation (Weeks 7-8)**
- Run comprehensive AQE Fleet benchmarks
- Compare against current Claude/OpenAI baseline
- Optimize agent-model assignments

### Expected Outcomes

**Independence:**
- 100% vendor-independent LLM infrastructure
- No API rate limits or costs for core operations
- Full data privacy and security

**Performance:**
- Comparable or better than GPT-4 on coding tasks
- Superior on specialized QE tasks (testing, review)
- Faster iteration with local deployment

**Cost:**
- One-time hardware investment vs ongoing API costs
- Estimated 60-80% cost reduction at scale
- Unlimited usage for development/testing

**Flexibility:**
- Fine-tune models on QE-specific datasets
- Customize prompts and system messages
- Experiment without vendor restrictions

---

## Additional Resources

### Research Papers
- [Qwen3 Technical Report](https://qwenlm.github.io/blog/qwen3/)
- [StarCoder 2 Paper (arXiv:2402.19173)](https://arxiv.org/abs/2402.19173)
- [DeepSeek-Coder Paper](https://github.com/deepseek-ai/DeepSeek-Coder)
- [Microsoft Phi-4 Technical Report](https://www.microsoft.com/en-us/research/wp-content/uploads/2025/04/phi_4_reasoning.pdf)

### Tools & Frameworks
- [Ollama](https://ollama.com/) - Local LLM deployment
- [LM Studio](https://lmstudio.ai/) - GUI for local models
- [DeepEval](https://github.com/confident-ai/deepeval) - LLM testing framework
- [Qodo Cover](https://www.qodo.ai/) - Automated test generation

### Leaderboards
- [SWE-bench Leaderboard](https://www.swebench.com/)
- [Hugging Face Open LLM Leaderboard](https://huggingface.co/spaces/HuggingFaceH4/open_llm_leaderboard)
- [Aider Code Editing Leaderboard](https://aider.chat/docs/leaderboards/)

### Community
- [BigCode Project](https://www.bigcode-project.org/)
- [Hugging Face](https://huggingface.co/)
- [r/LocalLLaMA](https://reddit.com/r/LocalLLaMA)

---

**Report Compiled By:** Research Agent, AQE Fleet
**Last Updated:** December 23, 2025
**Next Review:** March 2026

## Sources

### Qwen3-Coder
- [Qwen3-Coder Official](https://qwenlm.github.io/blog/qwen3/)
- [Qwen3-Coder GitHub](https://github.com/QwenLM/Qwen3-Coder)
- [16x Engineer Evaluation](https://eval.16x.engineer/blog/qwen3-coder-evaluation-results)
- [Galaxy.ai Qwen3-Coder-30B Specs](https://blog.galaxy.ai/model/qwen3-coder-30b-a3b-instruct)
- [Ollama Qwen3-Coder](https://ollama.com/library/qwen3-coder)

### Devstral
- [Mistral AI Devstral-2 Announcement](https://mistral.ai/news/devstral-2-vibe-cli)
- [Devstral-2 Hugging Face](https://huggingface.co/mistralai/Devstral-2-123B-Instruct-2512)
- [Mistral Docs Devstral-2](https://docs.mistral.ai/models/devstral-2-25-12)
- [VentureBeat Devstral-2 Coverage](https://venturebeat.com/ai/mistral-launches-powerful-devstral-2-coding-model-including-open-source)
- [SiliconANGLE Devstral-2](https://siliconangle.com/2025/12/09/mistral-ais-devstral-2-open-weights-vibe-coding-model-built-rival-best-proprietary-systems/)

### DeepSeek
- [DeepSeek-Coder GitHub](https://github.com/deepseek-ai/DeepSeek-Coder)
- [DeepSeek-V3 GitHub](https://github.com/deepseek-ai/DeepSeek-V3)
- [DeepWiki HumanEval Benchmark](https://deepwiki.com/deepseek-ai/DeepSeek-Coder/4.1-humaneval-benchmark)
- [DeepSeek Official Site](https://deepseekcoder.github.io/)

### Phi-4
- [Microsoft Phi-4 Blog](https://techcommunity.microsoft.com/blog/azure-ai-foundry-blog/introducing-phi-4-microsoft%E2%80%99s-newest-small-language-model-specializing-in-comple/4357090)
- [Phi-4 Hugging Face](https://huggingface.co/microsoft/phi-4)
- [Microsoft Azure Phi Family](https://azure.microsoft.com/en-us/products/phi)
- [VentureBeat Phi-4 Coverage](https://venturebeat.com/ai/microsoft-makes-powerful-phi-4-model-fully-open-source-on-hugging-face)

### RNJ-1
- [RNJ-1 Medium Article](https://medium.com/data-science-in-your-pocket/rnj-1-the-best-coding-and-stem-small-llm-e56b6e076049)
- [RNJ-1 Ollama](https://ollama.com/library/rnj-1)
- [Essential AI Tweet](https://x.com/essential_ai/status/1997123631156215855)
- [RNJ-1 AIBase](https://model.aibase.com/models/details/1998557684454133760)

### StarCoder 2
- [StarCoder 2 Paper](https://arxiv.org/abs/2402.19173)
- [StarCoder 2 GitHub](https://github.com/bigcode-project/starcoder2)
- [TechCrunch StarCoder 2](https://techcrunch.com/2024/02/28/starcoder-2-is-a-code-generating-ai-that-runs-on-most-gpus/)
- [StarCoder 2 Ollama](https://ollama.com/library/starcoder2)

### Kimi-Dev-72B
- [Kimi-Dev-72B Hugging Face](https://huggingface.co/moonshotai/Kimi-Dev-72B)
- [Kimi-Dev GitHub](https://github.com/MoonshotAI/Kimi-Dev)
- [SiliconFlow Model Page](https://www.siliconflow.com/models/kimi-dev-72b)
- [DEV Community Guide](https://dev.to/nodeshiftcloud/guide-to-install-kimi-dev-72b-the-most-powerful-open-source-coding-llm-m0g)

### Llama 3.3
- [DataCamp Llama 3.3 Overview](https://www.datacamp.com/blog/llama-3-3-70b)
- [Llama 3.3 Hugging Face](https://huggingface.co/meta-llama/Llama-3.3-70B-Instruct)
- [Llama 3.3 Coding Guide](https://blogs.novita.ai/llama-3-3-70b-for-code/)
- [Meta AI Llama 3 Blog](https://ai.meta.com/blog/meta-llama-3/)

### Quantization & Hardware
- [DEV Community VRAM Guide](https://dev.to/simplr_sh/general-recommended-vram-guidelines-for-llms-4ef3)
- [Modal VRAM Inference Guide](https://modal.com/blog/how-much-vram-need-inference)
- [LocalLLM Ollama VRAM Guide](https://localllm.in/blog/ollama-vram-requirements-for-local-llms)
- [LocalLLM 8GB VRAM Guide](https://localllm.in/blog/best-local-llms-8gb-vram-2025)
- [Medium Quantization Guide](https://alain-airom.medium.com/run-big-llms-on-small-gpus-a-hands-on-guide-to-4-bit-quantization-and-qlora-40e9e2c95054)

### Ollama & Deployment
- [Ollama Library](https://ollama.com/library)
- [CodeGPT Ollama Coding Guide](https://www.codegpt.co/blog/best-ollama-model-for-coding)
- [Collabnix Ollama Models 2025](https://collabnix.com/best-ollama-models-for-developers-complete-2025-guide-with-code-examples/)
- [Skywork Ollama Models List](https://skywork.ai/blog/llm/ollama-models-list-2025-100-models-compared/)

### Testing & Evaluation
- [Qodo TestGen-LLM Blog](https://www.qodo.ai/blog/we-created-the-first-open-source-implementation-of-metas-testgen-llm/)
- [DeepEval GitHub](https://github.com/confident-ai/deepeval)
- [KDnuggets LLM Evaluation Platforms](https://www.kdnuggets.com/top-5-open-source-llm-evaluation-platforms)
- [MarkTechPost LLM Benchmarks](https://www.marktechpost.com/2025/07/31/the-ultimate-2025-guide-to-coding-llm-benchmarks-and-performance-metrics/)

### General LLM Comparisons
- [SiliconFlow Best LLMs for Engineering](https://www.siliconflow.com/articles/en/best-open-source-LLM-for-engineering)
- [Klu.ai Open Source LLMs 2025](https://klu.ai/blog/open-source-llm-models)
- [Hugging Face Open-Source LLMs Blog](https://huggingface.co/blog/daya-shankar/open-source-llms)
- [Zencoder Best LLMs for Coding](https://zencoder.ai/blog/best-llm-for-coding)
