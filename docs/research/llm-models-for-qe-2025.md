# LLM Models for Quality Engineering Tasks - 2025 Research Report

**Research Date:** 2025-12-15
**Last Updated:** 2025-12-15 (December 2025 models added)
**Research Focus:** Small, Medium, and Fine-Tuning-Optimized LLM Models for QE Tasks
**Agent:** Research Specialist

---

## 🆕 December 2025 Update - New Models Available!

> **IMPORTANT:** Since the original research, several new models have been released that are superior for QE/SE agent tasks.

### New Recommended Models (December 2025)

| Category | NEW Model | Why It's Better |
|----------|-----------|-----------------|
| **SE Agents** | **Devstral-Small-2** (24B) | Specifically designed for software engineering agents |
| **SE Agents (Full)** | **Devstral-2** (123B) | Best-in-class for agentic coding tasks |
| **Code/STEM** | **RNJ-1** (8B) | New dense model, state-of-the-art performance |
| **Efficient MoE** | **Qwen3-Coder-30B-A3B** | 30B quality at 3B inference cost |

### Updated Recommendations by Task

| Task Complexity | Best Model (Dec 2025) | Ollama Command |
|-----------------|----------------------|----------------|
| SIMPLE | `rnj-1` (8B) | `ollama pull rnj-1` |
| MODERATE | `devstral-small-2` (24B) | `ollama pull devstral-small-2` |
| COMPLEX | `qwen2.5-coder:32b` | `ollama pull qwen2.5-coder:32b` |
| VERY_COMPLEX | `devstral-2` (123B) | `ollama pull devstral-2` |

---

## Executive Summary

This comprehensive research identifies the best LLM models for Quality Engineering tasks in 2025, categorized by size and fine-tuning efficiency. Key findings:

- **Best for SE Agents (NEW!):** Devstral-Small-2 (24B) - Designed for software engineering agents
- **Best Small Model (≤8B):** RNJ-1 (8B) - New, optimized for code/STEM
- **Best Medium Model (8-32B):** Qwen3-Coder-30B-A3B - MoE, 3B active params
- **Best for Fine-Tuning:** Phi-4 (14B) - Exceptional efficiency, LoRA support, strong reasoning
- **Best Apache 2.0 Model:** IBM Granite Code 3/4 - Enterprise-ready, 116 languages, ISO 42001 certified

### Legacy Recommendations (still valid but superseded)
- ~~Best Small Model (1-7B): Qwen 2.5 Coder 7B~~ → Use RNJ-1 or devstral-small-2
- ~~Best Medium Model (7-20B): DeepSeek Coder V2~~ → Use Qwen3-Coder-30B-A3B or devstral-small-2

---

## 1. Small Models (1-7B Parameters)

### 1.1 Top Recommendations

#### **Qwen 2.5 Coder 7B** ⭐ BEST OVERALL SMALL MODEL

**Parameters:** 7B
**License:** Apache 2.0 equivalent
**Context Window:** 128K tokens

**Strengths:**
- **Code Generation Excellence:** 88.4% on HumanEval (beats GPT-4o class models)
- **Language Coverage:** 92+ programming languages (mainstream to niche)
- **Code Repair:** Competitive with GPT-4o on Aider benchmark
- **Fill-in-the-Middle (FIM):** Excellent for code completion tasks
- **Reasoning:** Strong logical code generation and optimization

**QE Use Cases:**
- Test case generation across multiple languages
- Bug detection and code repair suggestions
- API test generation with high accuracy
- Test data generation and mocking

**Fine-Tuning Efficiency:** Excellent - Supports LoRA/QLoRA, 1 GPU sufficient
**Inference:** vLLM (best), Ollama, llama.cpp - All formats supported
**Quantization:** GGUF Q4_K_M, AWQ 4-bit, GPTQ 4-bit available

**Verdict:** Best choice for QE agents requiring high accuracy test generation with efficient resource usage.

---

#### **Phi-3 Mini (3.8B)** ⭐ BEST FOR RESOURCE-CONSTRAINED

**Parameters:** 3.8B
**License:** MIT
**Context Window:** 128K tokens (4K variant available)

**Strengths:**
- **Efficiency Champion:** Beats models 15X its size on benchmarks
- **Speed:** Fast inference on cheap hardware
- **Instruction Following:** State-of-the-art for its size
- **Microsoft Backing:** Regular updates, strong ecosystem

**QE Use Cases:**
- Rapid unit test generation
- CI/CD pipeline integration (low latency)
- Edge device testing scenarios
- Cost-effective test suite expansion

**Fine-Tuning Efficiency:** Excellent - Designed for fine-tuning, minimal compute
**Inference:** Ollama (excellent), llama.cpp, ONNX Runtime
**Quantization:** GGUF all variants, ONNX optimizations

**Verdict:** Ideal for teams with limited GPU resources or edge deployment requirements.

---

#### **DeepSeek-Coder 6.7B**

**Parameters:** 6.7B
**License:** DeepSeek License (commercial use allowed)
**Context Window:** 16K tokens

**Strengths:**
- **Training Scale:** 2 trillion tokens (87% code, 13% natural language)
- **Language Coverage:** 80+ programming languages
- **Specialized:** Purpose-built for code tasks
- **Benchmark Strong:** High scores on coding benchmarks

**QE Use Cases:**
- Code-focused test generation
- Static analysis test case creation
- Integration test scenarios

**Fine-Tuning Efficiency:** Good - Standard LoRA support
**Inference:** vLLM, Ollama, llama.cpp
**Quantization:** GGUF, GPTQ available

**Verdict:** Solid choice for pure code generation, but Qwen 2.5 Coder generally outperforms.

---

### 1.2 Emerging Small Models

#### **SmolLM2 (1.7B)** - Mobile/Edge AI

**Parameters:** 1.7B (also 360M, 135M variants)
**Strengths:** On-device capable, fast inference, instruction-following
**QE Use Cases:** Mobile app testing, embedded systems QA

#### **DeepSeek-R1-Distill-Qwen-1.5B** - Reasoning Specialist

**Parameters:** 1.5B
**Strengths:** Distilled reasoning patterns from larger models
**QE Use Cases:** Bug reasoning, test case prioritization logic

#### **TinyLlama (1.1B)** - Legacy/Baseline

**Parameters:** 1.1B
**Status:** Outperformed by newer models (MobileLLaMA 40% faster)
**Verdict:** Not recommended for 2025 QE tasks

---

## 2. Medium Models (7-20B Parameters)

### 2.1 Top Recommendations

#### **DeepSeek Coder V2 (16B active)** ⭐ BEST MEDIUM MODEL

**Parameters:** 236B total, 21B activated per token (MoE)
**License:** DeepSeek License
**Context Window:** 128K tokens

**Strengths:**
- **Massive Language Support:** 338 programming languages (vs 86 in V1)
- **MoE Architecture:** Efficient inference despite large total params
- **Context Champion:** 128K tokens ideal for large codebases
- **State-of-the-Art:** Leading coding benchmarks
- **Debugging Partner:** "Immediately usable" code completions

**QE Use Cases:**
- Large codebase analysis and test generation
- Multi-repository test suite creation
- Complex integration test scenarios
- Cross-language test generation

**Fine-Tuning Efficiency:** Good - MoE requires more VRAM but still LoRA-friendly
**Inference:** vLLM (recommended), transformers library
**Quantization:** AWQ 4-bit, GPTQ 4-bit with Marlin kernel

**Verdict:** Best for enterprise QE teams with complex, multi-language codebases.

---

#### **Mistral Small 3.1 (24B)**

**Parameters:** 24B
**License:** Apache 2.0
**Context Window:** 128K tokens

**Strengths:**
- **Multimodal:** Vision understanding + text
- **Long Context:** 128K tokens
- **Balance:** Speed + capability sweet spot
- **Popular:** Strong community support

**QE Use Cases:**
- Visual regression testing (screenshot analysis)
- UI test generation from mockups
- Documentation-driven test creation

**Fine-Tuning Efficiency:** Moderate - Requires 2+ GPUs for full fine-tuning, LoRA viable
**Inference:** vLLM, Ollama, text-generation-webui
**Quantization:** GPTQ, AWQ, GGUF available

**Verdict:** Excellent for QE teams needing multimodal capabilities.

---

#### **Llama 3.1 8B / 3.2 Vision**

**Parameters:** 8B
**License:** Llama 3 License (permissive)
**Context Window:** 128K tokens

**Strengths:**
- **Meta Backing:** Regular updates, large ecosystem
- **Performance:** Fast, nearly optimal coding solutions
- **Vision (3.2):** Multimodal capabilities in smaller sizes (1B, 3B variants)
- **Tooling:** Excellent vLLM/Ollama support

**QE Use Cases:**
- General-purpose test generation
- Fast local development testing
- CI/CD integration

**Fine-Tuning Efficiency:** Excellent - Well-documented LoRA/QLoRA workflows
**Inference:** All platforms (vLLM, Ollama, llama.cpp, TGI)
**Quantization:** Full support across all formats

**Verdict:** Reliable, well-supported choice for standard QE tasks.

---

### 2.2 Specialized Medium Models

#### **Phi-3 Medium (14B)**

**Parameters:** 14B
**License:** MIT
**Context Window:** 128K tokens

**Strengths:** Microsoft quality, efficient architecture
**QE Use Cases:** Enterprise Windows/.NET test generation

#### **Qwen 2.5 (14B, 32B variants)**

**Parameters:** 14B - 32B
**Context Window:** 128K tokens
**Strengths:** Excellent reasoning, multi-language support
**QE Use Cases:** Complex test scenario reasoning

---

## 3. Half-Baked / Fine-Tuning Optimized Models

### 3.1 Top Recommendations

#### **Phi-4 (14B)** ⭐ BEST FOR FINE-TUNING

**Parameters:** 14B
**License:** MIT
**Released:** December 2024, Open-sourced January 2025
**Context Window:** Up to 128K tokens

**Strengths:**
- **Synthetic Data Training:** 9.8T tokens of curated + synthetic data
- **Efficiency Design:** Outperforms GPT-4/Gemini Pro despite smaller size
- **LoRA Native:** Explicitly designed for parameter-efficient fine-tuning
- **Microsoft Support:** Azure AI Foundry integration, ONNX optimizations
- **Code Excellence:** Strong HumanEval results, Python-focused
- **On-Device Ready:** Can run on-device when ONNX optimized

**Fine-Tuning Efficiency:**
- **LoRA Support:** First-class, minimal parameters to update
- **Training Data:** Works with small datasets due to synthetic data foundation
- **Compute:** Single GPU sufficient for LoRA fine-tuning
- **Cost:** Significantly cheaper than larger models
- **Time:** Fast convergence due to high-quality base training

**QE Use Cases:**
- Custom test pattern fine-tuning (BDD, TDD styles)
- Domain-specific test generation (finance, healthcare, etc.)
- Property-based testing generation
- Test oracle creation
- Bug pattern recognition fine-tuning

**Inference:** Azure AI Foundry, Ollama, llama.cpp, vLLM
**Quantization:** GGUF, ONNX, standard formats

**Verdict:** Best choice for QE teams wanting to fine-tune on proprietary test patterns and codebases.

---

#### **Qwen 2.5-Coder Series (0.5B - 32B)** ⭐ BEST CODE-SPECIFIC FINE-TUNING

**Parameters:** 0.5B, 1.5B, 3B, 7B, 14B, 32B
**License:** Apache 2.0 equivalent
**Context Window:** 128K tokens

**Strengths:**
- **Size Flexibility:** 6 sizes for different resource constraints
- **Code Training:** Continued pretraining on 5.5T code tokens
- **Fill-in-the-Middle:** Native FIM support for code completion
- **Benchmark Leader:** Highest HumanEval scores in class
- **Multi-Language:** 92+ programming languages

**Fine-Tuning Efficiency:**
- **LoRA/QLoRA:** Excellent support across all sizes
- **Resource Scaling:** Choose size based on GPU availability
- **Dataset Efficient:** Pre-trained on massive code corpus
- **Convergence:** Fast due to strong code foundation

**QE Use Cases:**
- Test generation fine-tuning for specific frameworks (Jest, PyTest, JUnit)
- Code coverage analysis agents
- Test smell detection
- Mutation testing generation

**Inference:** vLLM, Ollama, llama.cpp - All platforms
**Quantization:** GGUF Q4_K_M, AWQ, GPTQ - Full support

**Verdict:** Best for QE teams focused purely on code testing tasks across multiple languages.

---

#### **StarCoder2 (3B, 7B, 15B)** ⭐ BEST FOR TRANSPARENCY

**Parameters:** 3B, 7B, 15B
**License:** BigCode OpenRAIL-M (permissive)
**Context Window:** 16,384 tokens

**Strengths:**
- **Open Development:** BigCode community (ServiceNow, Hugging Face, Nvidia)
- **Low-Resource Languages:** Outperforms larger models on Julia, Lua, Perl
- **Fill-in-the-Middle:** Native FIM training technique
- **Grouped Query Attention:** Efficient architecture
- **Transparency:** Fully documented training process

**Fine-Tuning Efficiency:**
- **Community Support:** Extensive documentation and examples
- **LoRA Ready:** Standard parameter-efficient fine-tuning
- **Reproducible:** Open training code and datasets

**QE Use Cases:**
- Test generation for niche languages
- Academic/research QE projects requiring transparency
- Custom test DSL generation

**Inference:** Hugging Face Transformers, vLLM, text-generation-webui
**Quantization:** GPTQ, AWQ, GGUF available

**Verdict:** Best for teams requiring full transparency and working with less common programming languages.

---

#### **IBM Granite Code Models (3B, 8B, 20B, 34B)** ⭐ BEST APACHE 2.0 ENTERPRISE

**Parameters:** 3B, 8B, 20B, 34B
**License:** Apache 2.0
**Context Window:** Standard (training with 16K window size)

**Strengths:**
- **True Apache 2.0:** Full commercial use, no restrictions
- **Enterprise Ready:** ISO 42001 certified, cryptographically signed
- **Language Coverage:** 116 programming languages
- **Data Ethics:** Trained on license-permissible data with IBM AI Ethics
- **Variants:** Both Base and Instruct models
- **Benchmarks:** Competitive/SOTA on HumanEval, RepoBench

**Granite 4.0 Updates (2025):**
- **Hybrid Architecture:** Transformer + Mamba-2 layers (faster, more memory-efficient)
- **Multilingual:** Native multilingual support
- **RAG Support:** Retrieval-augmented generation built-in
- **Tool Usage:** Native function calling
- **Structured Output:** JSON output support

**Fine-Tuning Efficiency:**
- **IBM Backing:** Enterprise support and tooling
- **Open Data Prep:** data-prep-kit open-sourced (Apache 2.0)
- **LoRA Compatible:** Standard fine-tuning approaches work
- **Legal Safety:** Corporate legal review ensures trustworthy enterprise use

**QE Use Cases:**
- Enterprise QE where legal compliance is critical
- Government/regulated industry testing
- Test generation requiring data provenance
- Multi-language enterprise test suites

**Inference:** vLLM, Ollama, Hugging Face Transformers
**Quantization:** Standard formats supported

**Verdict:** Best for enterprises requiring legal safety, compliance, and full Apache 2.0 licensing.

---

### 3.2 Fine-Tuning Cost Analysis

#### LoRA/QLoRA Efficiency (2025 Data)

**Traditional Fine-Tuning (13B model):**
- **Hardware:** 2x 80GB GPUs
- **Time:** ~24 hours
- **Cost:** ~$1000+ on major clouds

**LoRA Fine-Tuning (13B model):**
- **Hardware:** 1x RTX 4090 (24GB)
- **Time:** 3-4 hours
- **Cost:** Minimal on platforms like RunPod
- **Parameters Updated:** 1-2% of total model

**QLoRA Fine-Tuning (70B model):**
- **Hardware:** 1x GPU with 20GB HBM (replaces 15 GPUs for full fine-tuning)
- **Memory Savings:** 33%
- **Runtime Trade-off:** 39% slower than LoRA
- **Quality:** Matches full 16-bit fine-tunes on benchmarks

**Phi-4 Specific (14B with LoRA):**
- **Hardware:** 1x A100 (or equivalent)
- **Time:** ~3 hours for 50K examples
- **Memory:** ~17.86GB with AdamW optimizer
- **Settings:** r=256, alpha=512 (optimal)

**Cost Reduction:** 50-70% reduction in VRAM and compute costs vs full fine-tuning

---

## 4. Context Window Comparison

| Model | Size | Context Window | Best For |
|-------|------|----------------|----------|
| **DeepSeek Coder V2** | 16B (active) | 128K | Large codebase analysis |
| **Qwen 2.5 Coder** | 7B | 128K | Multi-file test generation |
| **Phi-4** | 14B | 128K | Complex reasoning tasks |
| **Mistral Small 3.1** | 24B | 128K | Long documentation analysis |
| **Llama 3.1** | 8B | 128K | General long-context tasks |
| **Phi-3 Mini** | 3.8B | 128K / 4K | Flexible deployment |
| **StarCoder2** | 3-15B | 16K | Standard code files |
| **DeepSeek-Coder** | 6.7B | 16K | Single-file focus |

**QE Implications:**
- **128K tokens:** Analyze entire test suites, multi-file dependencies
- **16K tokens:** Single test file generation, focused analysis
- **Larger = Better for:** Integration tests, E2E scenarios, cross-module testing

---

## 5. Quantization and Inference Framework Comparison

### 5.1 Quantization Formats

#### **GGUF (GPT-Generated Unified Format)**

**Best For:** CPU inference, mixed CPU/GPU setups, local development

**Advantages:**
- Single file format
- Works directly with llama.cpp, LM Studio, Ollama
- Best CPU performance
- Excellent for Mac Apple Silicon (Metal acceleration)
- Easy to download and run

**Recommended Quantization Levels:**
- **Q4_K_M:** 7B models, good quality/speed balance
- **Q5_K_M:** Better quality, moderate speed trade-off
- **Q8:** Near-native quality, larger files

**QE Use Cases:**
- Developer workstation test generation
- CI/CD runners without GPUs
- Edge device testing

---

#### **GPTQ**

**Best For:** Pure GPU inference with sufficient VRAM

**Advantages:**
- Better accuracy than equivalent GGUF
- Works with NVIDIA CUDA and AMD ROCm 6.2+
- ExLlama kernel optimization (fastest)
- Hugging Face native support

**Trade-offs:**
- Requires more VRAM than GGUF
- GPU-only (no CPU offloading)

**QE Use Cases:**
- Production test generation servers
- High-throughput test case generation
- GPU-accelerated CI/CD

---

#### **AWQ (Activation-aware Weight Quantization)**

**Best For:** Best accuracy in 4-bit quantization

**Advantages:**
- Maintains better accuracy than GPTQ/GGUF at same bit level
- vLLM production recommendation (AWQ 4-bit with Marlin kernel)
- Lower memory than GPTQ

**QE Use Cases:**
- Production deployment where accuracy is critical
- High-stakes test generation (security, compliance)

---

### 5.2 Inference Frameworks

#### **vLLM** ⭐ PRODUCTION CHAMPION

**Performance:**
- **Throughput:** 120-160 req/sec with continuous batching
- **Speed vs llama.cpp:** 35x more requests, 44x more tokens/sec
- **Speed vs Ollama:** 3.23x faster with 128 concurrent requests
- **Time-to-First-Token:** 50-80ms

**Technologies:**
- PagedAttention (memory management)
- Tensor Parallelism (multi-GPU)
- Dynamic Batching (automatic request grouping)

**Supported Formats:**
- PyTorch, Safetensors (primary)
- GPTQ, AWQ quantization
- Native Hugging Face support
- No native GGUF (requires conversion)

**Best For:**
- Enterprise-level serving
- Multi-user test generation services
- API-based test generation
- Production QE platforms

**QE Deployment:** Recommended for teams building test generation APIs serving multiple users/projects.

---

#### **Ollama** ⭐ DEVELOPER FAVORITE

**Performance:**
- **Throughput:** ~1-3 req/sec (optimized for single user)
- **Concurrent Limit:** Default 4 parallel requests
- **Latency:** Higher than vLLM but acceptable for development

**Advantages:**
- **Ease of Use:** Single command installation
- **Model Switching:** On-demand without restart
- **Automatic Memory Management:** Model swapping when VRAM constrained
- **Setup Time:** Hours vs weeks for TensorRT-LLM

**Supported Formats:**
- GGUF (primary)
- Auto-downloads from registry

**Best For:**
- Rapid prototyping
- Single-user development
- Model testing and comparison
- Privacy-focused local deployment

**QE Deployment:** Perfect for individual QE engineers experimenting with test generation locally.

---

#### **llama.cpp** ⭐ PORTABILITY KING

**Performance:**
- **CPU Inference:** 8-15 tokens/sec (13B, 4-bit, 32-core Xeon)
- **Mixed CPU/GPU:** Only real choice for layer offloading
- **Startup:** Extremely fast

**Advantages:**
- **Zero Dependencies:** Pure C/C++
- **Platform Support:** Servers, laptops, phones, edge devices
- **CPU Champion:** Best CPU-only performance
- **Apple Silicon:** Excellent Metal acceleration
- **AMD GPUs:** Only viable option with ROCm

**Supported Formats:**
- GGUF (native)
- Native quantization support

**Best For:**
- Edge computing
- Resource-constrained environments
- CPU-only scenarios
- Apple Silicon Macs
- AMD GPUs

**QE Deployment:** Best for QE teams with limited GPU resources or edge device testing scenarios.

---

### 5.3 Framework Selection Guide

| Scenario | Best Framework | Quantization | Model Size |
|----------|---------------|--------------|------------|
| **Production API (multi-user)** | vLLM | AWQ 4-bit | 7-14B |
| **Single developer** | Ollama | GGUF Q4_K_M | 3-7B |
| **Limited VRAM (8GB)** | llama.cpp | GGUF Q4_K_M | 3-7B |
| **Apple Silicon Mac** | llama.cpp | GGUF Q5_K_M | 7-14B |
| **AMD GPU** | llama.cpp | GGUF | 7B |
| **High accuracy needed** | vLLM | AWQ 4-bit | 14B+ |
| **CI/CD integration** | Ollama | GGUF Q4_K_M | 3-7B |
| **Edge devices** | llama.cpp | GGUF Q4 | 1-3B |

---

## 6. Recent 2025 Model Releases

### January 2025

**DeepSeek R1** (January 20, 2025)
- **Impact:** Small team innovation, MIT license
- **Focus:** Reasoning capabilities
- **QE Relevance:** Bug reasoning, test case prioritization

**Codestral 25.01** (Mistral)
- **Update:** 2x faster code generation vs base Codestral
- **Architecture:** More efficient tokenizer
- **QE Relevance:** Faster test generation workflows

### February 2025

**GPT-4.5** (February 27, 2025)
- **Feature:** 128K token long-term memory
- **QE Relevance:** Maintains context across test suite conversations

**Grok-3** (February 17, 2025)
- **Modes:** Think Mode, Big Brain mode
- **Focus:** Step-by-step reasoning
- **QE Relevance:** Complex test scenario reasoning

**Claude 3.7 Sonnet** (February 24, 2025)
- **Feature:** Extended Thinking Mode
- **Strength:** Coding tasks
- **QE Relevance:** Explainable test generation logic

---

## 7. Ranked Recommendations for QE Use Cases

### 7.1 Test Generation (Unit Tests)

**Ranking:**
1. **Qwen 2.5 Coder 7B** - Best accuracy, multi-language
2. **Phi-4 (14B)** - Best reasoning, fine-tunable
3. **Phi-3 Mini (3.8B)** - Best efficiency
4. **IBM Granite Code 8B** - Best for enterprises (Apache 2.0)

**Rationale:** Qwen 2.5 Coder's 88.4% HumanEval and 92+ language support makes it ideal for diverse codebases.

---

### 7.2 Integration Test Generation

**Ranking:**
1. **DeepSeek Coder V2** - 128K context, 338 languages
2. **Qwen 2.5 Coder 32B** - High accuracy, long context
3. **Mistral Small 3.1** - Multimodal, vision support
4. **Llama 3.1 8B** - Reliable, fast

**Rationale:** DeepSeek Coder V2's massive context window handles large codebases and complex dependencies.

---

### 7.3 Bug Detection and Code Repair

**Ranking:**
1. **Qwen 2.5 Coder 7B** - GPT-4o competitive on Aider
2. **DeepSeek Coder V2** - "Debugging partner" reputation
3. **Phi-4** - Strong reasoning capabilities
4. **StarCoder2** - Good for niche languages

**Rationale:** Qwen's code repair performance rivals commercial models.

---

### 7.4 Test Coverage Analysis

**Ranking:**
1. **DeepSeek Coder V2** - Large codebase analysis
2. **Qwen 2.5 Coder 14B** - Reasoning + coverage
3. **Phi-4** - Logical reasoning
4. **IBM Granite Code 20B** - Enterprise-grade

**Rationale:** DeepSeek's 128K context allows analyzing entire projects.

---

### 7.5 Fine-Tuning for Custom Test Patterns

**Ranking:**
1. **Phi-4 (14B)** - Best fine-tuning efficiency
2. **Qwen 2.5 Coder 7B** - Code-specific, easy to fine-tune
3. **StarCoder2 7B** - Transparent, community support
4. **IBM Granite Code 8B** - Enterprise backing

**Rationale:** Phi-4's LoRA-first design and synthetic data training make it the fine-tuning champion.

---

### 7.6 API Testing and Mocking

**Ranking:**
1. **Qwen 2.5 Coder 7B** - Excellent code generation
2. **DeepSeek Coder V2** - Multi-language API support
3. **Phi-4** - Structured JSON output
4. **Llama 3.1 8B** - Tool usage support

**Rationale:** Qwen's code generation accuracy and FIM support excel at API generation.

---

### 7.7 Edge/On-Device Testing

**Ranking:**
1. **SmolLM2 1.7B** - On-device optimized
2. **Phi-3 Mini 3.8B** - ONNX optimized
3. **Qwen 2.5 Coder 0.5B** - Smallest code model
4. **DeepSeek-R1-Distill-Qwen 1.5B** - Reasoning in small size

**Rationale:** SmolLM2's on-device optimization is unmatched for mobile/embedded testing.

---

### 7.8 Enterprise/Regulated Industries

**Ranking:**
1. **IBM Granite Code 8B** - ISO 42001, Apache 2.0
2. **Phi-4** - Microsoft-backed, enterprise support
3. **Qwen 2.5 Coder** - Open license, strong performance
4. **Llama 3.1** - Meta-backed, permissive license

**Rationale:** IBM Granite's legal compliance and certification are critical for regulated industries.

---

## 8. Self-Hosted Deployment Recommendations

### 8.1 Small Team (2-5 QE Engineers)

**Model:** Qwen 2.5 Coder 7B
**Framework:** Ollama
**Quantization:** GGUF Q4_K_M
**Hardware:** 1x RTX 4090 or equivalent (24GB VRAM)
**Cost:** ~$1500 one-time hardware investment

**Workflow:**
```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Download model
ollama pull qwen2.5-coder:7b-q4_K_M

# Run
ollama run qwen2.5-coder:7b-q4_K_M
```

**Pros:** Simple setup, easy model switching, perfect for experimentation
**Cons:** Limited concurrency (4 parallel requests)

---

### 8.2 Medium Team (10-20 QE Engineers)

**Model:** DeepSeek Coder V2 or Qwen 2.5 Coder 14B
**Framework:** vLLM
**Quantization:** AWQ 4-bit with Marlin kernel
**Hardware:** 2x A100 (40GB) or 1x A100 (80GB)
**Cost:** Cloud ~$2-3/hour, dedicated ~$15K-20K

**Workflow:**
```bash
# Install vLLM
pip install vllm

# Run server
vllm serve Qwen/Qwen2.5-Coder-14B-Instruct-AWQ \
  --tensor-parallel-size 2 \
  --max-model-len 32768

# API endpoint available at localhost:8000
```

**Pros:** High throughput (120+ req/sec), production-ready, excellent concurrency
**Cons:** More complex setup, dedicated GPUs needed

---

### 8.3 Large Enterprise (50+ QE Engineers)

**Model:** Multiple models in rotation
- **Primary:** DeepSeek Coder V2 (high accuracy)
- **Fast:** Qwen 2.5 Coder 7B (speed)
- **Specialized:** Phi-4 fine-tuned on internal patterns

**Framework:** vLLM cluster with load balancing
**Quantization:** AWQ 4-bit for primary, GGUF for fast
**Hardware:**
- 4x A100 (80GB) for DeepSeek Coder V2
- 2x A100 (40GB) for Qwen 2.5 Coder 7B
- 1x A100 (40GB) for Phi-4 custom

**Infrastructure:**
- Kubernetes deployment
- Ray Serve for multi-model routing
- Redis for request queue
- Prometheus/Grafana monitoring

**Cost:** ~$10-15/hour cloud, ~$80K-100K dedicated hardware

---

### 8.4 Budget-Constrained (CPU-Only)

**Model:** Qwen 2.5 Coder 7B or Phi-3 Mini 3.8B
**Framework:** llama.cpp
**Quantization:** GGUF Q4_K_M
**Hardware:** 32-core CPU, 64GB RAM (no GPU)
**Cost:** ~$2000-3000 workstation

**Workflow:**
```bash
# Download llama.cpp
git clone https://github.com/ggml-org/llama.cpp
cd llama.cpp && make

# Download model (GGUF)
# Run with CPU
./main -m qwen2.5-coder-7b-q4_k_m.gguf -t 32 -p "Generate unit tests for..."
```

**Performance:** 8-15 tokens/sec (acceptable for single-user)
**Pros:** No GPU needed, low cost
**Cons:** Slow for concurrent usage

---

## 9. Fine-Tuning Recipes for QE Tasks

### 9.1 Custom Test Pattern Fine-Tuning (Phi-4)

**Use Case:** Fine-tune Phi-4 to generate tests in your company's specific style (e.g., Given-When-Then BDD)

**Dataset Requirements:**
- **Size:** 500-2000 examples minimum
- **Format:** Code + corresponding tests in your style
- **Quality:** High-quality, reviewed test cases

**LoRA Configuration:**
```python
from transformers import AutoModelForCausalLM, TrainingArguments
from peft import LoraConfig, get_peft_model

# LoRA config for Phi-4
lora_config = LoraConfig(
    r=256,  # Rank
    lora_alpha=512,  # Scaling
    target_modules=["q_proj", "v_proj", "k_proj", "o_proj"],
    lora_dropout=0.1,
    bias="none",
    task_type="CAUSAL_LM"
)

# Training args
training_args = TrainingArguments(
    output_dir="./phi4-qe-tests",
    num_train_epochs=3,
    per_device_train_batch_size=4,
    gradient_accumulation_steps=4,
    learning_rate=2e-4,
    fp16=True,
    logging_steps=10,
    save_steps=100
)
```

**Hardware:** 1x A100 (40GB) or RTX 4090 (24GB)
**Training Time:** ~3-4 hours for 1000 examples
**Cost:** ~$10-20 on cloud platforms like RunPod

---

### 9.2 Domain-Specific Test Generation (Qwen 2.5 Coder)

**Use Case:** Fine-tune for specific domain (e.g., financial services, healthcare)

**Dataset Requirements:**
- **Size:** 1000-5000 examples
- **Format:** Domain code + tests with domain knowledge
- **Annotations:** Include domain-specific edge cases

**QLoRA Configuration (Memory Efficient):**
```python
from transformers import BitsAndBytesConfig

# 4-bit quantization config
bnb_config = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_use_double_quant=True,
    bnb_4bit_quant_type="nf4",
    bnb_4bit_compute_dtype=torch.float16
)

# Load model in 4-bit
model = AutoModelForCausalLM.from_pretrained(
    "Qwen/Qwen2.5-Coder-7B-Instruct",
    quantization_config=bnb_config,
    device_map="auto"
)

# Apply LoRA
lora_config = LoraConfig(
    r=128,
    lora_alpha=256,
    target_modules=["q_proj", "v_proj"],
    lora_dropout=0.05,
    bias="none",
    task_type="CAUSAL_LM"
)
```

**Hardware:** 1x RTX 4090 (24GB) sufficient with QLoRA
**Training Time:** ~6-8 hours for 5000 examples
**Cost:** ~$30-50 on RunPod

---

### 9.3 Framework-Specific Test Generation

**Use Case:** Fine-tune for specific testing frameworks (Jest, PyTest, JUnit)

**Recommended Models:**
1. **Qwen 2.5 Coder 7B** - Multi-language support
2. **StarCoder2 7B** - Transparent, good for niche frameworks
3. **IBM Granite Code 8B** - Enterprise, Apache 2.0

**Dataset Strategy:**
- Collect open-source projects using target framework
- Extract code + test pairs
- Filter for high-quality tests (coverage, assertions, edge cases)
- Augment with synthetic examples

**Expected Improvement:** 20-40% better framework-specific idiom usage vs base model

---

## 10. Performance Metrics Summary

### 10.1 Benchmark Comparison

| Model | HumanEval | HumanEval+ | MBPP | Params | Context |
|-------|-----------|------------|------|--------|---------|
| **Qwen 2.5 Coder 7B** | 88.4% | - | - | 7B | 128K |
| **DeepSeek Coder V2** | - | - | SOTA | 16B (active) | 128K |
| **Phi-4** | Strong | - | - | 14B | 128K |
| **Codestral 25.01** | 81.1% | - | - | ~22B | - |
| **StarCoder2 15B** | - | - | Good | 15B | 16K |
| **IBM Granite Code 8B** | Competitive | - | - | 8B | - |
| **Llama 3.1 8B** | Fast/optimal | - | - | 8B | 128K |

---

### 10.2 Inference Speed Comparison

| Framework | Model | Hardware | Throughput | Latency |
|-----------|-------|----------|------------|---------|
| **vLLM** | Qwen 7B | 1x A100 | 120-160 req/sec | 50-80ms TTFT |
| **Ollama** | Qwen 7B | 1x RTX 4090 | 1-3 req/sec | 100-200ms |
| **llama.cpp** | Qwen 7B (CPU) | 32-core Xeon | 0.1 req/sec | 8-15 tok/sec |
| **llama.cpp** | Qwen 7B (GPU) | 1x RTX 4090 | 5-10 req/sec | 30-50 tok/sec |

---

### 10.3 Memory Requirements

| Model | Size | Full Precision | GGUF Q4 | AWQ 4-bit | Fine-Tuning (LoRA) |
|-------|------|----------------|---------|-----------|-------------------|
| **Phi-3 Mini** | 3.8B | 15GB | 2.5GB | 3GB | 8-10GB |
| **Qwen 2.5 Coder** | 7B | 28GB | 4.5GB | 5GB | 12-15GB |
| **Phi-4** | 14B | 56GB | 9GB | 10GB | 17-20GB |
| **DeepSeek Coder V2** | 16B (active) | 90GB+ | - | 15GB | 25-30GB |
| **Mistral Small 3.1** | 24B | 96GB | 15GB | 18GB | 35-40GB |

---

## 11. Key Takeaways and Actionable Recommendations

### For Small QE Teams (2-5 engineers):

**Recommended Setup:**
- **Model:** Qwen 2.5 Coder 7B
- **Framework:** Ollama
- **Quantization:** GGUF Q4_K_M
- **Hardware:** 1x RTX 4090 or Mac Studio M2 Ultra
- **Total Cost:** ~$1500-2000 one-time

**Why:** Perfect balance of accuracy, speed, and ease of use. Ollama's simplicity means you're productive day one.

---

### For Medium QE Teams (10-20 engineers):

**Recommended Setup:**
- **Primary Model:** DeepSeek Coder V2 (high accuracy, large codebases)
- **Fast Model:** Qwen 2.5 Coder 7B (quick iterations)
- **Framework:** vLLM for both
- **Quantization:** AWQ 4-bit with Marlin kernel
- **Hardware:** 2x A100 (40GB)
- **Total Cost:** ~$15K-20K dedicated or ~$2-3/hour cloud

**Why:** vLLM's throughput handles concurrent users, dual models provide flexibility.

---

### For Enterprise QE Teams (50+ engineers):

**Recommended Setup:**
- **Primary:** DeepSeek Coder V2 (production test generation)
- **Fast:** Qwen 2.5 Coder 7B (developer assistance)
- **Custom:** Phi-4 fine-tuned on internal patterns
- **Framework:** vLLM cluster with Ray Serve
- **Quantization:** AWQ 4-bit primary, GGUF fast
- **Hardware:** 4x A100 (80GB) + 2x A100 (40GB) + 1x A100 (40GB)
- **Total Cost:** ~$80K-100K dedicated or ~$10-15/hour cloud

**Why:** Multi-model approach handles diverse use cases, fine-tuning captures institutional knowledge.

---

### For Budget-Constrained Teams:

**Recommended Setup:**
- **Model:** Phi-3 Mini 3.8B or Qwen 2.5 Coder 7B
- **Framework:** llama.cpp
- **Quantization:** GGUF Q4_K_M
- **Hardware:** 32-core CPU server, 64GB RAM (no GPU)
- **Total Cost:** ~$2000-3000

**Why:** CPU-only viable with efficient models, sufficient for single-user workflows.

---

### For Research/Academic Teams:

**Recommended Setup:**
- **Model:** StarCoder2 7B or IBM Granite Code 8B
- **Framework:** Hugging Face Transformers
- **Quantization:** GPTQ or AWQ
- **Hardware:** Shared GPU cluster
- **License Focus:** Apache 2.0 or OpenRAIL-M

**Why:** Full transparency, permissive licensing, excellent documentation.

---

## 12. Future-Proofing Considerations

### Emerging Trends (2025)

1. **Mixture-of-Experts (MoE) Architectures:** DeepSeek Coder V2 leads this trend - expect more efficient large models.

2. **Reasoning-Focused Models:** DeepSeek R1, Claude Extended Thinking - reasoning capabilities becoming standard.

3. **Hybrid Architectures:** IBM Granite 4.0's Transformer + Mamba-2 - efficiency gains without quality loss.

4. **Multimodal Code Models:** Mistral Small 3.1, Llama 3.2 Vision - visual test generation (UI tests from screenshots).

5. **Fine-Tuning as Default:** Phi-4's LoRA-first design - custom models becoming the norm, not exception.

### What to Watch

- **Llama 4:** Meta's next release (expected mid-2025)
- **Qwen 3:** Alibaba's next iteration with thinking modes
- **Gemma 3:** Google's small model updates
- **OpenCoder:** New reproducible code models with leaner datasets

### Investment Protection

- **Choose Apache 2.0 models** (IBM Granite, Qwen, Mistral) for legal safety
- **Invest in LoRA/QLoRA skills** - fine-tuning is the future
- **Build with vLLM** - production-grade, future-compatible
- **Document your fine-tuning datasets** - your competitive advantage

---

## 13. Sources and References

### Small LLM Models
- [Local AI Zone - LLM Model Parameters Guide 2025](https://local-ai-zone.github.io/guides/what-is-ai-model-3b-7b-30b-parameters-guide-2025.html)
- [Silicon Flow - Best Small LLMs for Personal Projects](https://www.siliconflow.com/articles/en/best-small-LLMs-for-personal-projects)
- [Medium - Top Open-Source LLMs: Small and Mid-Range in 2025](https://medium.com/@sulbha.jindal/top-open-source-llms-small-and-mid-range-in-2025-ff8ea8df8738)
- [Cubix - Best Open Source LLMs for Code Generation](https://www.cubix.co/blog/best-open-source-llms-for-code-generation-in-2025/)
- [Koyeb - Best Open Source LLMs in 2025](https://www.koyeb.com/blog/best-open-source-llms-in-2025)
- [DataCamp - Top 15 Small Language Models](https://www.datacamp.com/blog/top-small-language-models)

### Medium LLM Models
- [Medium - Which AI Model is Best for Coding](https://medium.com/@elisheba.t.anderson/which-ai-model-is-best-for-coding-i-tested-mistral-llama-3-2-deepseek-and-qwen-185a058b15be)
- [Hugging Face - 10 Best Open-Source LLM Models](https://huggingface.co/blog/daya-shankar/open-source-llms)
- [n8n Blog - The 11 best open-source LLMs](https://blog.n8n.io/open-source-llm/)

### Fine-Tuning and Code Models
- [Ollama Library](https://ollama.com/library)
- [Qwen2.5-Coder Technical Report](https://arxiv.org/html/2409.12186v1)
- [Deepgram - Best Local Coding LLM](https://deepgram.com/learn/best-local-coding-llm)
- [CodeGPT - Choosing Best Ollama Model](https://www.codegpt.co/blog/choosing-best-ollama-model)

### LoRA/QLoRA Fine-Tuning
- [RunPod - Fine-Tune LLMs on Budget](https://www.runpod.io/articles/guides/how-to-fine-tune-large-language-models-on-a-budget)
- [PanelsAI - How to Fine-Tune LLMs 2025](https://panelsai.com/generative-ai/fine-tuning/)
- [Sebastian Raschka - Practical Tips for LoRA](https://magazine.sebastianraschka.com/p/practical-tips-for-finetuning-llms)
- [Mercity - Guide to LoRA and QLoRA](https://www.mercity.ai/blog-post/guide-to-fine-tuning-llms-with-lora-and-qlora)
- [Index.dev - LoRA vs QLoRA 2025](https://www.index.dev/blog/top-ai-fine-tuning-tools-lora-vs-qlora-vs-full)

### Phi-4
- [Microsoft Phi-4 on Hugging Face](https://huggingface.co/microsoft/phi-4)
- [VentureBeat - Microsoft Phi-4 Open Source](https://venturebeat.com/ai/microsoft-makes-powerful-phi-4-model-fully-open-source-on-hugging-face)
- [Analytics Vidhya - How to Fine-Tune Phi-4](https://www.analyticsvidhya.com/blog/2025/01/fine-tune-phi-4-locally/)
- [Microsoft Azure - Empowering Innovation: Phi Family](https://azure.microsoft.com/en-us/blog/empowering-innovation-the-next-generation-of-the-phi-family/)

### Quantization and Inference
- [Towards Data Science - Quantize Llama with GGUF](https://towardsdatascience.com/quantize-llama-models-with-ggml-and-llama-cpp-3612dfbcc172/)
- [Qwen - llama.cpp Integration](https://qwen.readthedocs.io/en/latest/quantization/llama.cpp.html)
- [Markaicode - Llama 3.3 Quantization Guide](https://markaicode.com/llama-33-quantization-gguf-ollama-guide/)
- [Rost Glukhov - Local LLM Hosting 2025](https://www.glukhov.org/post/2025/11/hosting-llms-ollama-localai-jan-lmstudio-vllm-comparison/)
- [Hardware Corner - Quantization for Local LLMs](https://www.hardware-corner.net/quantization-local-llms-formats/)

### Inference Framework Comparison
- [Red Hat - vLLM or llama.cpp](https://developers.redhat.com/articles/2025/09/30/vllm-or-llamacpp-choosing-right-llm-inference-engine-your-use-case)
- [ITECS - vLLM vs Ollama vs llama.cpp](https://itecsonline.com/post/vllm-vs-ollama-vs-llama.cpp-vs-tgi-vs-tensort)
- [Arsturn - Multi-GPU LLM Performance](https://www.arsturn.com/blog/multi-gpu-showdown-benchmarking-vllm-llama-cpp-ollama-for-maximum-performance)
- [Medium - Performance vs Practicality: vLLM and Ollama](https://robert-mcdermott.medium.com/performance-vs-practicality-a-comparison-of-vllm-and-ollama-104acad250fd)
- [House of FOSS - Ollama vs llama.cpp vs vLLM](https://www.houseoffoss.com/post/ollama-vs-llama-cpp-vs-vllm-local-llm-deployment-in-2025)

### 2025 New Releases
- [Shakudo - Top 9 LLMs December 2025](https://www.shakudo.io/blog/top-9-large-language-models)
- [Backlinko - 23 Best LLMs December 2025](https://backlinko.com/list-of-llms)
- [MarkTechPost - Top 7 LLMs for Coding 2025](https://www.marktechpost.com/2025/11/04/comparing-the-top-7-large-language-models-llms-systems-for-coding-in-2025/)
- [Interconnects - 2025 Open Models Year in Review](https://www.interconnects.ai/p/2025-open-models-year-in-review)

### IBM Granite
- [IBM Granite Code Documentation](https://www.ibm.com/granite/docs/models/code)
- [GitHub - IBM Granite Code Models](https://github.com/ibm-granite/granite-code-models)
- [IBM - Granite 4.0 Announcement](https://www.ibm.com/new/announcements/ibm-granite-4-0-hyper-efficient-high-performance-hybrid-models)
- [IBM - Granite 3.0 Announcement](https://www.ibm.com/new/announcements/ibm-granite-3-0-open-state-of-the-art-enterprise-models)
- [IBM Research - Granite Code Models Open Source](https://research.ibm.com/blog/granite-code-models-open-source)

---

## 14. Conclusion

The 2025 LLM landscape for Quality Engineering is rich with powerful, accessible models suitable for fine-tuning and deployment. Key recommendations:

**Best Overall:** Qwen 2.5 Coder 7B for balanced performance, accuracy, and resource efficiency.

**Best for Fine-Tuning:** Phi-4 (14B) for teams wanting to customize models to their specific test patterns.

**Best for Enterprise:** IBM Granite Code (8B) for legal compliance and Apache 2.0 licensing.

**Best for Scale:** DeepSeek Coder V2 for large codebases and high-concurrency production environments.

**Best for Budget:** Phi-3 Mini (3.8B) for teams with limited GPU resources.

The democratization of AI through these models, combined with efficient fine-tuning techniques (LoRA/QLoRA) and self-hosted inference frameworks (vLLM, Ollama, llama.cpp), makes sophisticated QE automation accessible to teams of all sizes.

**Next Steps:**
1. Start with Ollama + Qwen 2.5 Coder 7B for rapid experimentation
2. Collect 500-1000 high-quality test examples from your codebase
3. Fine-tune Phi-4 or Qwen with LoRA on your patterns
4. Deploy with vLLM for production or keep Ollama for development
5. Iterate and expand based on team feedback

---

**Document Version:** 1.0
**Last Updated:** 2025-12-15
**Maintained By:** Agentic QE Fleet Research Team
