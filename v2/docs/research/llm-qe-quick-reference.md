# LLM Models for QE - Quick Reference Guide

**Last Updated:** 2025-12-15 (December 2025 models added)

---

## 🆕 December 2025 - NEW RECOMMENDED MODELS

> **IMPORTANT:** Use these models instead of the older recommendations below.

### For Software Engineering Agents (AQE)
| Task | Model | Size | Ollama Command |
|------|-------|------|----------------|
| **SIMPLE** | RNJ-1 | 8B | `ollama pull rnj-1` |
| **MODERATE** | Devstral-Small-2 | 24B | `ollama pull devstral-small-2` |
| **COMPLEX** | Qwen 2.5 Coder | 32B | `ollama pull qwen2.5-coder:32b` |
| **MAX POWER** | Devstral-2 | 123B | `ollama pull devstral-2` |

### Why These Models?
- **Devstral-Small-2/Devstral-2** - From Mistral, specifically designed for SE agents
- **RNJ-1** - New dense model optimized for code and STEM
- **Qwen3-Coder-30B-A3B** - MoE: 30B quality at 3B inference cost

### Quick Setup (December 2025)
```bash
# Primary - SE agents (requires 16GB RAM)
ollama pull devstral-small-2

# Fast - simple tasks (requires 8GB RAM)
ollama pull rnj-1

# Fallback - well-tested
ollama pull qwen2.5-coder:7b
```

---

## Top 5 Models by Category (Legacy - Still Valid)

### Small Models (≤8B)
1. **RNJ-1 8B** ⭐ NEW - Optimized for code/STEM, state-of-the-art
2. **Qwen 2.5 Coder 7B** - 88.4% HumanEval, 92+ languages, 128K context
3. **Phi-3 Mini 3.8B** - Beats 15X larger models, 128K context, minimal resources
4. **DeepSeek-Coder 6.7B** - 2T tokens trained, 80+ languages
5. **SmolLM2 1.7B** - On-device capable, mobile/edge AI

### Medium Models (8-32B)
1. **Devstral-Small-2 24B** ⭐ NEW - Designed for SE agents
2. **Qwen3-Coder-30B-A3B** ⭐ NEW - MoE, 3B active params
3. **DeepSeek Coder V2 (16B active)** - 338 languages, 128K context, MoE
4. **Qwen 2.5 Coder 32B** - Excellent reasoning, well-tested
5. **Llama 3.1 8B** - Fast, optimal coding, Meta-backed

### Large Models (32B+)
1. **Devstral-2 123B** ⭐ NEW - Best-in-class for agentic coding
2. **Qwen3-Coder-480B-A35B** - MoE, 35B active params, production scale

### Fine-Tuning Optimized
1. **Phi-4 (14B)** - LoRA-first design, synthetic data trained, Microsoft-backed
2. **Qwen 2.5-Coder (0.5-32B)** - 6 sizes, 5.5T code tokens, FIM support
3. **StarCoder2 (3-15B)** - Transparent, low-resource language champion
4. **IBM Granite Code (3-34B)** - Apache 2.0, ISO 42001, enterprise-ready

---

## Quick Decision Matrix (Updated December 2025)

| Your Situation | Recommended Model | Framework | Hardware |
|----------------|-------------------|-----------|----------|
| **SE Agents (AQE)** | Devstral-Small-2 24B ⭐ | Ollama | 16GB+ RAM |
| **Small team, local dev** | RNJ-1 8B ⭐ | Ollama | 8GB+ RAM |
| **Production API** | Qwen3-Coder-30B-A3B ⭐ | vLLM | 1x A100 40GB |
| **Budget constrained** | RNJ-1 8B | llama.cpp | CPU only |
| **Enterprise/regulated** | IBM Granite Code 8B | vLLM | 1x A100 40GB |
| **Fine-tuning focus** | Phi-4 14B | Transformers + LoRA | 1x A100 40GB |
| **Edge/mobile testing** | SmolLM2 1.7B | llama.cpp | Mobile device |
| **Apple Silicon** | Devstral-Small-2 24B | Ollama | Mac M2/M3/M4 |
| **Multi-language** | Qwen3-Coder-30B-A3B | vLLM | 1x A100 40GB |
| **Maximum capability** | Devstral-2 123B ⭐ | Ollama/vLLM | 64GB+ RAM |

---

## Quantization Quick Guide

| Format | Best For | Pros | Cons |
|--------|----------|------|------|
| **GGUF Q4_K_M** | CPU, mixed CPU/GPU | Easy, portable, single file | Lower accuracy vs AWQ |
| **AWQ 4-bit** | Production GPU | Best accuracy at 4-bit | GPU only, more VRAM |
| **GPTQ 4-bit** | Pure GPU inference | Fast with ExLlama | Requires more VRAM |
| **GGUF Q5_K_M** | Mac Apple Silicon | Better quality, Metal fast | Larger files |

---

## Inference Framework Comparison

| Framework | Throughput | Best For | Ease of Use |
|-----------|------------|----------|-------------|
| **vLLM** | 120-160 req/sec | Production, multi-user | Complex |
| **Ollama** | 1-3 req/sec | Development, single-user | Very easy |
| **llama.cpp** | Variable | CPU, edge, portability | Moderate |

---

## Fine-Tuning Cost Estimates

| Model | Method | Hardware | Time | Cloud Cost |
|-------|--------|----------|------|------------|
| **Phi-4 14B** | LoRA | 1x A100 | 3-4 hours | $10-20 |
| **Qwen 7B** | QLoRA | 1x RTX 4090 | 6-8 hours | $30-50 |
| **DeepSeek V2** | LoRA | 2x A100 | 8-12 hours | $100-150 |

---

## Recommended Starting Point (December 2025)

**For SE agents (AQE use case):**

```bash
# 1. Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# 2. Download Devstral-Small-2 (primary for SE agents)
ollama pull devstral-small-2

# 3. Download RNJ-1 (fast for simple tasks)
ollama pull rnj-1

# 4. Run
ollama run devstral-small-2
```

**Hardware:** 16GB+ RAM for devstral-small-2, 8GB+ for rnj-1

**Why:** Devstral models are specifically designed for software engineering agents - perfect for AQE.

---

**For 90% of general QE teams:**

```bash
# 1. Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# 2. Download Qwen 2.5 Coder 7B (fallback, well-tested)
ollama pull qwen2.5-coder:7b

# 3. Run
ollama run qwen2.5-coder:7b
```

**Hardware:** Any GPU with 8GB+ VRAM or CPU with 16GB RAM

**Why:** Best balance of accuracy, speed, ease of use, and cost.

---

## Key Metrics Comparison

| Model | HumanEval | Context | Params | License | Fine-Tuning |
|-------|-----------|---------|--------|---------|-------------|
| **Qwen 2.5 Coder 7B** | 88.4% | 128K | 7B | Apache-like | Excellent |
| **Phi-4** | Strong | 128K | 14B | MIT | Excellent |
| **DeepSeek V2** | SOTA | 128K | 16B active | Custom | Good |
| **IBM Granite 8B** | Competitive | Standard | 8B | Apache 2.0 | Good |
| **Phi-3 Mini** | Strong | 128K | 3.8B | MIT | Excellent |

---

## When to Fine-Tune

**Fine-tune if:**
- You have 500+ examples of your test style
- Your domain has specific patterns (finance, healthcare, etc.)
- You need consistent test framework usage (BDD, TDD)
- You want to capture institutional knowledge

**Use base model if:**
- You're just starting with LLM-based testing
- Your tests follow standard patterns
- You don't have quality training data yet
- You want to experiment first

---

## Resources

**Full Research Report:** `/workspaces/agentic-qe-cf/docs/research/llm-models-for-qe-2025.md`

**Key Links:**
- Qwen Models: https://github.com/QwenLM/Qwen
- Phi Models: https://huggingface.co/microsoft
- DeepSeek: https://github.com/deepseek-ai
- IBM Granite: https://github.com/ibm-granite/granite-code-models
- Ollama: https://ollama.com
- vLLM: https://github.com/vllm-project/vllm
- llama.cpp: https://github.com/ggml-org/llama.cpp

---

**Version:** 1.0
**Maintained By:** Agentic QE Fleet Research Team
