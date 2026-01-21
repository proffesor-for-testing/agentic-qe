# LLM API Providers Comparison for AQE Fleet
**Research Date**: December 23, 2025
**Purpose**: Multi-provider strategy for Quality Engineering AI system

---

## Executive Summary

This research evaluates LLM API providers for the Agentic QE Fleet, focusing on cost optimization, reliability, and code-specific capabilities. Key findings:

- **OpenRouter** offers 200+ models with pass-through pricing and automatic failover
- **Groq** provides exceptional speed (275-594 tokens/sec) at competitive pricing
- **Together.ai** delivers 4x faster inference than vLLM with transparent pricing
- **Self-hosted options** (vLLM, Ollama, LocalAI) offer long-term cost savings for high-volume use
- **DeepSeek** and **Qwen** models lead in coding performance among open-source LLMs

**Recommendation**: Implement a hybrid multi-provider strategy with OpenRouter as primary gateway, Groq for speed-critical tasks, and self-hosted vLLM for high-volume batch processing.

---

## Table of Contents

1. [Multi-Model API Providers](#multi-model-api-providers)
2. [Specialized Inference Providers](#specialized-inference-providers)
3. [Self-Hosted Solutions](#self-hosted-solutions)
4. [Best Coding Models](#best-coding-models)
5. [Cost Comparison Tables](#cost-comparison-tables)
6. [Multi-Provider Strategy Recommendations](#multi-provider-strategy-recommendations)

---

## Multi-Model API Providers

### OpenRouter (openrouter.ai)

**Overview**: Unified API gateway to 200+ models from 50+ providers with automatic failover and no markup pricing.

#### Key Features
- **Pass-Through Pricing**: No markup on provider prices, only platform fee
- **Automatic Failover**: Edge deployment with provider health monitoring
- **Zero Completion Insurance**: Only billed for successful completions
- **BYOK Support**: Bring Your Own Keys with 5% usage fee

#### Pricing Model
- **Platform Fee**: 5.5% on credit purchases (minimum $0.80), 5% for crypto
- **Free Tier**:
  - New users: Very small free allowance to test
  - 50 requests/day with `:free` suffix models (low rate limits)
  - 1,000 requests/day after purchasing $10 in credits
- **Rate Limits**:
  - Free users: 20 RPM, 50-200 requests/day depending on credit purchase
  - Paid users: No platform-level limits

#### Model Routing Variants
- **`:nitro`** - Providers sorted by throughput for fastest response
- **`:floor`** - Providers sorted by price for most cost-effective option

#### Reliability & Performance
- Handles **billions of requests and trillions of tokens weekly**
- Latency: ~40ms under typical conditions
- First-token latency: 0.40-0.45 seconds (measured 2025)

#### Best For
- Multi-model experimentation
- Automatic failover/redundancy
- Cost optimization through provider selection
- Production workloads requiring high uptime

**Sources**: [OpenRouter Pricing](https://openrouter.ai/pricing), [OpenRouter Review 2025](https://binaryverseai.com/openrouter-ai-review-pricing-models-api-how-use/), [API Rate Limits](https://openrouter.ai/docs/api/reference/limits)

---

### Together.ai

**Overview**: Fast serverless API for 200+ open-source models with 4x faster inference than vLLM.

#### Key Features
- **Together Inference Stack**: 4x faster than vLLM
- **OpenAI-Compatible API**: Easy integration
- **200+ Models**: Text, code, image, and multimodal models
- **Dedicated Endpoints**: Custom deployments with per-minute billing

#### Pricing Structure
- **Serverless API**: Pay-per-token pricing
- **Dedicated Endpoints**: Per-minute billing
- **Fine-Tuning**: Minimum charges, LoRA fine-tuning only
  - Price = (dataset size × epochs) tokens + eval dataset tokens

#### Notable Models for Coding
- **DeepSeek-R1**: Strong on math, code, logic (comparable to OpenAI-o1)
- **Llama variants**: Multiple sizes available
- **Qwen family**: Multi-size options
- **Mixtral & DBRX**: MoE architectures

#### GPU Clusters
- **Instant & Reserved Clusters**: Kubernetes or Slurm on Kubernetes
- **Free network ingress/egress**
- **NVIDIA InfiniBand & NVLink networking**
- **Scale**: 1K → 10K → 100K+ NVIDIA GPUs

#### Best For
- Production deployments requiring high performance
- Custom model deployments
- Multi-model workflows
- Enterprise requiring transparent pricing

**Sources**: [Together AI Pricing](https://www.together.ai/pricing), [Together AI Guide](https://www.eesel.ai/blog/together-ai-pricing)

---

### Groq

**Overview**: Purpose-built LPU (Language Processing Unit) delivering unprecedented inference speed.

#### Key Features
- **LPU Technology**: Custom chip optimized for LLM inference
- **Exceptional Speed**: 275-594 tokens/second (2x traditional GPU)
- **Prompt Caching**: 50% discount on cached tokens
- **Batch Processing**: 50% cost reduction, 24-hour to 7-day processing window

#### Pricing Model
- **Large Models (120B+)**: Up to $1.00 per million input tokens
- **Llama 3.1 70B**:
  - 4x cheaper on input vs GPT-4o
  - 12x cheaper on output vs GPT-4o
- **Typical Savings**: 30-50% vs comparable offerings

#### Performance Metrics
- **Throughput**: 275-594 tokens/second
- **Llama 3.1 70B**: Up to 249 tokens/second
- **Speech Processing**: Up to 228× real-time

#### Service Tiers
1. **Starter**: Free tier for building/testing with community support
2. **Developer**: Higher token limits, chat support, batch processing, prompt caching
3. **Enterprise**: Custom models, regional endpoints, dedicated support

#### Prompt Caching Benefits
- Up to 50% discount on cached tokens
- Significantly lower latency for identical token prefixes
- Cached tokens don't count toward rate limits

#### Best For
- Real-time applications requiring low latency
- Speech processing and transcription
- Voice-controlled interfaces
- Cost-sensitive high-throughput workloads

**Sources**: [Groq Pricing](https://groq.com/pricing), [Groq Guide](https://www.eesel.ai/blog/groq-pricing), [Groq Performance Analysis](https://artificialanalysis.ai/providers/groq)

---

### Fireworks.ai

**Overview**: Production-grade inference platform with transparent usage-based pricing.

#### Key Features
- **Pay-Per-Token Serverless**: Instant access to popular models
- **Dedicated Deployments**: Private GPU with custom hardware
- **Batch API**: 50% lower cost, no rate limits, 24-hour turnaround
- **2x Cost-Efficient Fine-Tuning**: LoRA-based service

#### Pricing Structure
- **Serverless**: Pay-per-token (instant deployment)
- **Dedicated**: GPU-based billing (pay for usage time only)
- **Batch API**: 50% discount for asynchronous processing
- **Image Generation**: By inference steps or flat rate per image

#### Example Pricing
- **GLM-4.6**: $0.55/M input, $2.19/M output tokens

#### Fine-Tuning Features
- Deploy and switch between up to 100 fine-tuned models
- No extra costs for experimentation
- LoRA-based approach

#### Compliance
- HIPAA, GDPR, SOC 2 compliant
- Secure deployment options

#### Best For
- Production deployments requiring compliance
- Teams needing dedicated resources
- Batch processing workloads
- Fine-tuning experiments

**Sources**: [Fireworks Pricing](https://fireworks.ai/pricing), [Fireworks AI Guide](https://www.eesel.ai/blog/fireworks-ai-pricing)

---

### Replicate

**Overview**: Pay-as-you-go platform billing by compute time on various GPU configurations.

#### Pricing Model
- **Hardware-Based**: $0.36/hour (CPU) to $43.92/hour (8x H100)
- **Per-Second Billing**: Minimum 1 second

#### Public vs Private Models

**Public Models**:
- CPU: $0.000100/second
- Nvidia T4 GPU: $0.000225/second
- Only pay for active processing time
- Setup and idle time is free

**Private Models**:
- CPU: $0.000200/second
- Nvidia T4 GPU: $0.000550/second
- 8x Nvidia A40 (Large): $0.005800/second
- Pay for all online time (setup, idle, active)
- Exception: Fast-booting fine-tunes (idle time free)

#### Scaling Features
- **Auto-Scaling**: Handles traffic spikes automatically
- **Scale to Zero**: No charges when no traffic
- **Cancellation**: No charge if canceled before start, partial charge if after

#### Official Models
- Always-on with predictable pricing
- Multi-GPU capacity available with committed spend

#### Best For
- Variable/bursty workloads
- Image generation models
- Teams wanting simple consumption-based pricing
- Projects with unpredictable traffic

**Sources**: [Replicate Pricing](https://replicate.com/pricing), [Replicate Billing Docs](https://replicate.com/docs/topics/billing)

---

### Perplexity API

**Overview**: Search-augmented LLM API with real-time web research capabilities.

#### Key Features
- **Real-Time Search**: Web-wide research and Q&A
- **No LLM Training**: Data privacy commitment
- **Multiple Model Tiers**: From lightweight to deep reasoning

#### Pricing Model
- **Pay-As-You-Go**: Credit-based system on token usage
- **No Permanent Free Tier**: Must add payment method for API key
- **Pro Subscriber Credits**: $5/month recurring credit
- **Token Pricing**: $0.2-$5 per 1M tokens depending on model

#### Model Tiers
1. **Sonar**: Lightweight, speed-optimized (most affordable)
2. **Sonar Pro**: Llama 3.1 70B-based, higher reasoning, larger context
3. **Sonar Reasoning Pro**: Premium tier for complex analysis (most expensive)

#### Cost Calculation
Total cost = Token costs + Request fee (varies by search context)
- Search modes: Low, Medium, High (affects cost)
- Citation tokens: Free for standard Sonar/Sonar Pro (2025 update)

#### Rate Limits
- Based on RPM, TPD (Tokens Per Day), bandwidth
- Throttling/queuing on limit (not overage charges)

#### Best For
- Applications requiring real-time information
- Research-augmented generation
- Q&A systems needing current data
- Privacy-conscious teams

**Sources**: [Perplexity Pricing](https://docs.perplexity.ai/getting-started/pricing), [Perplexity API Guide](https://www.eesel.ai/blog/perplexity-pricing)

---

### Hugging Face Inference API

**Overview**: Access to 200+ models from leading providers with transparent pass-through pricing.

#### Key Features
- **No Markup**: Pass-through provider pricing
- **Centralized Billing**: Single account for multiple providers
- **Monthly Free Credits**: Every user receives credits
- **Pro Account Integration**: Enhanced limits and credits

#### Pricing Structure
- **Free Tier**: Monthly credits for experimentation
- **Pro Plan**: $9/month
  - Includes $2 usage credits
  - 20× inference credits for Inference Providers
  - 8× ZeroGPU quota with highest priority
- **Team/Enterprise**: Shared credits across organization

#### Pay-As-You-Go
- Required: Pro subscription ($9/month) to access pay-as-you-go
- Charges: Compute time × hardware price
- No additional Hugging Face markup

#### Usage Tracking
- Real-time spending monitoring
- Detailed breakdown by model and provider
- Accessible from settings/billing page

#### Best For
- Teams already using Hugging Face ecosystem
- Multi-provider experimentation
- Shared team billing
- Moderate usage with Pro account benefits

**Sources**: [Hugging Face Pricing](https://huggingface.co/pricing), [HF Inference Providers](https://huggingface.co/docs/inference-providers/pricing)

---

### Anyscale Endpoints

**Overview**: Cost-effective open-source LLM deployment powered by Ray framework.

#### Pricing
- **Llama-2 70B**: $1 per million tokens
- **Smaller Models**: Less than $1/M tokens
- **Fine-Tuning (Llama-2 70B)**: $5 fixed cost/job + $4/M tokens
- **Embedding (gte-large)**: $0.05/M tokens

#### Cost Comparison
- ~50% lower than OpenAI GPT-3.5 (at launch)
- 10x more cost-effective for popular open-source LLMs

#### Deployment Options
- **Cloud Account**: Run within existing AWS/GCP account
- **Private Endpoints**: Self-hosted LLMs (as of June 2024)
- **No Credit Card**: Free credits available to start

#### Current Status
- Endpoints and Private Endpoints now part of Anyscale Platform (2024)
- Focus on open-source models

#### Best For
- Teams committed to open-source LLMs
- Ray framework users
- Cost-conscious deployments
- AWS/GCP infrastructure

**Sources**: [Anyscale Endpoints](https://www.anyscale.com/endpoints), [Anyscale Launch](https://www.anyscale.com/press/anyscale-launches-new-service-anyscale-endpoints-10x-more-cost-effective-for-most-popular-open-source-llms)

---

### Modal

**Overview**: Serverless GPU platform with pay-per-second billing and instant autoscaling.

#### Key Features
- **Serverless Architecture**: No infrastructure management
- **Fast Cold Starts**: 1-4 seconds
- **Elastic GPU Capacity**: Scale to thousands of GPUs
- **Python-First**: SDK and automatic containerization

#### Pricing Model
- **Free Tier**: $30/month free compute
- **Pay-Per-Second**: No instance planning required
- **Scale to Zero**: Only pay when using

#### GPU Pricing Examples

**NVIDIA B200**:
- $6.25/hour ($0.001736/second)
- Most cost-effective for bursty workloads

**NVIDIA L40S**:
- $1.95/hour ($0.000542/second)
- Break-even vs reserved: 60% idle time

**General Range**: $0.50-$3.30/hour billed by second

#### When to Use Modal
- **Variable traffic**: Most economical for bursty workloads
- **New AI/ML apps**: Best for custom applications
- **Rapid iteration**: Fast prototyping to production
- **Not ideal**: Pre-built AI services or standard web apps

#### Performance Characteristics
- Cold starts: 2-4 seconds typical
- Access to thousands of GPUs across clouds
- No quotas or reservations

#### Best For
- AI/ML development requiring flexible GPU access
- Bursty workloads with variable demand
- Teams wanting code-based infrastructure
- Prototyping that needs quick scaling

**Sources**: [Modal Pricing](https://modal.com/pricing), [Serverless GPU Comparison](https://www.runpod.io/articles/guides/top-serverless-gpu-clouds), [Modal B200 Pricing](https://modal.com/blog/nvidia-b200-pricing)

---

## Specialized Inference Providers

### Best Coding Models (2025)

#### Top Coding LLMs Overview

**Proprietary Leaders**:
1. **Claude 3.5 Sonnet** (Anthropic) - Superior for complex coding
2. **GPT-4o** (OpenAI) - Strong all-around performance
3. **Gemini 2.5 Pro** (Google) - Competitive for code tasks

**Open-Source Leaders**:
1. **DeepSeek Coder V2** / **DeepSeek V3**
2. **Qwen2.5-Coder** / **Qwen3-Coder**
3. **Codestral 25.01** (Mistral AI)
4. **Code Llama 70B** (Meta)

---

#### DeepSeek Models

**DeepSeek Coder V2**:
- 300+ programming languages supported
- State-of-the-art coding benchmarks
- Specialist model fine-tuned for code

**DeepSeek V3**:
- 671B parameters (MoE with 37B active)
- Outperforms Claude 3.7 Sonnet and GPT-4o on coding benchmarks
- Strong HumanEval scores for code and math

**DeepSeek-R1**:
- Reasoning model comparable to OpenAI-o1
- Excellent for code review, analysis, planning
- Available on Together.ai and OpenRouter

**Performance**:
- **SWE-bench**: Superior performance vs GPT-4.1
- **HumanEval**: Top-tier pass@1 scores
- Catches edge cases without explicit prompting

**Pricing** (via providers):
- OpenRouter/Together: Highly competitive
- Often 90% cheaper than GPT-4 equivalents

**Best For**:
- Code generation and completion
- Mathematical reasoning
- Complex debugging and refactoring
- Production code quality

---

#### Qwen Models

**Qwen2.5-Coder**:
- Six sizes: 0.5B to 32B parameters
- 5.5T+ tokens of code-heavy training data
- Very strong HumanEval/MBPP/Spider results
- Competitive with closed models on pure code tasks

**Qwen3-Coder**:
- 100+ programming languages
- Agentic workflow support
- 256k+ context window
- Ideal for local and enterprise deployment

**Qwen 2.5 72B**:
- Top choice for mathematical reasoning
- Asks clarifying questions vs fabricating
- Careful, precise edits

**Qwen3 MoE**:
- 235B total parameters (~22B active per token)
- Strong on reasoning, code, multilingual
- 32,768 native context (expandable to 131,072 with YaRN)

**Performance**:
- Competitive with closed models
- Strong on HumanEval, MBPP, Spider benchmarks
- Excellent for careful refactoring

**Best For**:
- Multi-language code projects
- Mathematical and logical reasoning
- Enterprise self-hosted deployments
- Large context requirements

---

#### Other Notable Coding Models

**Codestral 25.01** (Mistral AI):
- Strong general coding performance
- Good balance of quality and speed

**Code Llama 70B** (Meta):
- Established open-source baseline
- Widely supported across platforms

**Llama 3.1 405B**:
- Largest open model for code
- Suitable for self-hosted infrastructure

**Recommendations**:
- **Best Open Code Specialist**: Qwen2.5-Coder-32B-Instruct
- **Best MoE Open Model**: DeepSeek-V2.5-1210 or DeepSeek-V3
- **Best for Self-Hosting**: Llama 3.1, Qwen variants, Codestral

**Sources**: [Best Open Source LLMs 2025](https://huggingface.co/blog/daya-shankar/open-source-llms), [Best Coding LLMs](https://www.labellerr.com/blog/best-coding-llms/), [DeepSeek Review](https://dev.to/ashinno/best-code-llm-2025-is-here-deepseek-1e3m)

---

## Self-Hosted Solutions

### vLLM

**Overview**: Open-source inference server with PagedAttention for efficient LLM serving.

#### Key Features
- **Free & Open-Source**: No licensing costs
- **PagedAttention**: 60-80% reduction in memory fragmentation
- **High Performance**: 2,300-2,500 tokens/second (Llama 8B on H100)
- **Version 0.6.0**: 2.7x throughput, 5x latency reduction vs earlier versions

#### Cost Analysis

**Break-Even Point**:
- Typical: 30-50M tokens monthly for Llama 2 70B
- Assumes setup costs absorbed

**Usage Recommendations**:
- **<1M tokens/day**: Stay with API providers
- **1-10M tokens/day**: Single RTX 4090/5090 with quantization (ROI in 6-12 months)
- **10M+ tokens/day**: Enterprise deployment becomes cost-effective

**Real-World Savings**:
- Fintech case: 83% reduction ($47k/month GPT-4o Mini → $8k/month hybrid with self-hosted 7B)
- Vision models: $187/month on RTX 4000 Ada (4000+ docs/hour)

#### Enterprise Software Stack Costs

**Free/Open-Source Core**:
- vLLM inference server: $0

**Additional Enterprise Tools**:
- Monitoring (Langfuse, Grafana): $0-$60k/year
- Guardrails (NeMo): $0-$80k/year
- Load Balancing (NGINX, Kong): $0-$50k/year
- Vector Database for RAG: $3k-$15k/year

**Hidden Costs**:
- **Expertise**: CUDA optimization, vLLM tuning ($200k+ engineer)
- **Ongoing Maintenance**: Model updates, optimization
- **Infrastructure**: GPU hardware, networking, cooling

#### Performance Optimization
- W8A8, FP8 KV cache quantization
- Achieves 4000+ documents/hour on consumer hardware
- Production-grade throughput on H100 GPUs

#### Best For
- High-volume consistent workloads (>50M tokens/month)
- Teams with ML engineering expertise
- Privacy-sensitive applications
- Long-term cost optimization

**Sources**: [vLLM Deployment Guide](https://rabiloo.com/blog/deploying-local-llm-hosting-for-free-with-vllm), [Self-Hosting LLMs 2025](https://kextcache.com/self-hosting-llms-privacy-cost-efficiency-guide/), [LLM Cost Analysis](https://medium.com/@vlad.koval/self-hosting-llms-a-genius-move-or-a-silent-money-pit-c992e46a3894)

---

### Ollama

**Overview**: Free, open-source framework for running LLMs locally with ease.

#### Key Features
- **100% Free**: CC0-1.0 license (public domain)
- **100+ Models**: Ready-to-use model library
- **Cross-Platform**: macOS, Windows, Linux native support
- **Complete Privacy**: All data stays on device
- **Hardware Flexible**: Works on CPU, GPU, M1, older hardware

#### Technical Details
- **Inference Engine**: llama.cpp
- **Quantization**: Enables running on low-VRAM hardware
- **REST API**: Port 11434 (default)
- **OpenAI-Compatible API**: Drop-in replacement

#### Available Models

**Recent Additions** (2025):
- **DeepSeek-R1**: Reasoning model (approaching O3/Gemini 2.5 Pro)
- **GPT-OS-120b & GPT-OS-20b**: OpenAI's first open models since 2019
- **Llama 3.1**: 8B, 70B, 405B variants
- **Gemma 2**: From 2B to larger sizes
- **Llama 3.2 Vision**: Multimodal support

**Model Categories**:
- Code models (Code Llama)
- Vision models (Llama 3.2 Vision)
- General purpose (Llama, Gemma, Qwen)
- Specialized (DeepSeek, GPT-OS)

#### Cloud Integration (Preview)
- Run larger models on datacenter hardware
- Keep using local tools
- Handle models too large for local machines

#### Performance
- Prioritizes GPU when available
- CPU-only mode functional
- Optimized for local inference

#### Best For
- Individual developers
- Privacy-focused applications
- Development/testing environments
- Resource-constrained deployments
- Offline/air-gapped systems

**Sources**: [Ollama Complete Guide](https://skywork.ai/blog/agent/what-is-ollama-complete-guide-to-local-ai-models-2025/), [Ollama Review 2026](https://elephas.app/blog/ollama-review), [Ollama Library](https://ollama.com/library)

---

### Text Generation Inference (TGI)

**Overview**: Hugging Face's production-grade LLM deployment toolkit (now in maintenance mode).

#### Current Status
- **Maintenance Mode**: As of December 11, 2025
- Only accepting minor bug fixes, docs, lightweight maintenance
- Still used in production at Hugging Face

#### Key Features
- **Production-Proven**: Powers Hugging Chat, Inference API, Endpoints
- **Tensor Parallelism**: Efficient multi-GPU deployment
- **Dynamic Batching**: Optimal throughput
- **Multi-Backend Support**: TRT-LLM, vLLM integration

#### Supported Models
- Llama, Falcon, StarCoder
- BLOOM, GPT-NeoX, T5
- Most popular open-source LLMs

#### Hardware Support
- **NVIDIA GPUs**: Primary support
- **AMD Instinct**: MI210, MI250
- **Intel GPUs & Gaudi**
- **AWS Inferentia 2 & Trainium**
- **Google TPU**: Via Optimum TPU

#### Deployment Options

**Google Kubernetes Engine (GKE)**:
- NVIDIA L4 GPUs
- Kubernetes-native deployment
- Performance monitoring

**AWS SageMaker**:
- Generally available on Inferentia 2
- Production-ready for AWS users

**Google Cloud TPU**:
- Optimized TGI runtime via Optimum TPU
- Fully optimized for TPU hardware

#### Future Direction
- Hugging Face contributing to vLLM
- vLLM integration planned Q1 '25
- AWS Neuron teams: Inferentia 2 & Trainium 2 support
- Google Jetstream & TPU optimization

#### Related Engines (Recommended Going Forward)
- **vLLM**: Active development, community-driven
- **SGLang**: Modern inference framework
- **llama.cpp**: Local inference
- **MLX**: Apple Silicon optimization

#### Best For
- Existing TGI deployments (stable)
- AWS/GCP cloud deployments
- Teams migrating to vLLM/SGLang
- Production workloads requiring proven stability

**Sources**: [TGI Documentation](https://huggingface.co/docs/text-generation-inference/en/index), [TGI GitHub](https://github.com/huggingface/text-generation-inference), [TGI Multi-Backend](https://huggingface.co/blog/tgi-multi-backend)

---

### LocalAI

**Overview**: Free, open-source, OpenAI-compatible API for local AI inferencing.

#### Key Features
- **OpenAI API Compatible**: Drop-in replacement
- **No GPU Required**: Runs on consumer hardware
- **All-in-One Stack**: Text, image, speech, embeddings
- **Multimodal**: LLM + DALL·E + Whisper equivalent
- **Model Context Protocol (MCP)**: Agentic capabilities (Oct 2025)

#### 2025 Updates

**December 2025**:
- Dynamic Memory Resource reclaimer
- Automatic multi-GPU model fitting (llama.cpp)
- Vibevoice backend added

**November 2025**:
- Import models via URL
- Multiple chats and history support
- Major UX improvements

**October 2025**:
- MCP support for external tools

**September 2025**:
- New Launcher app (MacOS, Linux)

**July/August 2025**:
- Object Detection API (rf-detr)
- Modular backend architecture (smaller binary)
- Automatic backend downloads

**May 2025**:
- Realtime API
- Audio input and reranking (llama.cpp)
- Gemma, SmollVLM support

#### Technical Specifications
- **Model Formats**: GGUF, GGML, Safetensors, PyTorch, GPTQ, AWQ
- **Backends**: llama.cpp, vLLM, Transformers, ExLlama, ExLlama2
- **License**: MIT (very permissive)

#### Hardware Requirements
- **Minimum**: CPU-only systems
- **Recommended**: 16GB+ RAM
- **Optional**: NVIDIA GPU for performance boost

#### Ecosystem
- **LocalAI**: Core inference stack
- **LocalAGI**: Self-hostable AI agent platform
- **LocalRecall**: Vector store

#### Best For
- Teams wanting OpenAI-compatible local inference
- Docker-based deployments
- Privacy-sensitive environments
- Multi-modal applications
- Agentic workflows with MCP support

**Sources**: [LocalAI Official](https://localai.io/), [LocalAI GitHub](https://github.com/mudler/LocalAI), [Self-Hosting Guide](https://dev.to/rosgluk/local-llm-hosting-complete-2025-guide-ollama-vllm-localai-jan-lm-studio-more-1dcl)

---

### LM Studio

**Overview**: User-friendly desktop application for running LLMs locally with API server mode.

#### Key Features
- **Desktop App**: Native macOS, Windows, Linux
- **API Server**: OpenAI-compatible REST API
- **Network Sharing**: Serve to local network
- **Model Discovery**: Browse and download models
- **No Configuration**: Simple setup

#### API Server Setup
1. Open Developer tab
2. Switch status from Stop to Run
3. Access at `http://localhost:1234`

#### API Capabilities
- **REST API**: Full HTTP endpoints
- **OpenAI SDK Compatible**: Use OpenAI libraries directly
- **SDKs**: lmstudio-js, lmstudio-python
- **Streaming**: SSE events support

#### Recent Updates (v0.3.29 - October 6, 2025)

**OpenAI Responses API Support**:
- **Stateful Interactions**: Use `previous_response_id` to continue
- **Custom Function Tools**: Similar to chat/completions
- **Remote MCP**: Model calls tools from remote MCP servers (opt-in)
- **Reasoning Support**: Parse reasoning output, control effort levels
- **Streaming or Sync**: Stream with SSE or single JSON response

#### Supported Models (2025)
- **gpt-oss**: OpenAI's open models
- **Qwen3, Gemma3**: Latest versions
- **DeepSeek**: Various sizes
- **Many more**: 100+ models available

#### Network Sharing
- **Local Network**: Enable "Serve on Local Network"
- **Use Cases**:
  - Share powerful machine with other devices
  - Multiple users on single instance
  - Mobile/laptop access to desktop GPU

#### Best For
- Individual developers wanting GUI
- Teams needing quick local inference
- Development/testing environments
- Network-shared local models
- Users preferring visual model management

**Sources**: [LM Studio API Docs](https://lmstudio.ai/docs/developer/core/server), [LM Studio Blog](https://lmstudio.ai/blog/lmstudio-v0.3.29), [LM Studio Setup Guide](https://www.convert.com/blog/ai/local-llm-server-lm-studio-ollama/)

---

## Cost Comparison Tables

### Multi-Model Providers - Token Pricing

| Provider | Input (per 1M tokens) | Output (per 1M tokens) | Notable Features | Free Tier |
|----------|----------------------|------------------------|------------------|-----------|
| **OpenRouter** | Pass-through pricing | Pass-through pricing | 5.5% platform fee, automatic failover | 50-1000 req/day |
| **Together.ai** | Model-dependent | Model-dependent | 4x faster than vLLM | Trial credits |
| **Groq** | $0.05-$1.00 | Varies | 275-594 tokens/sec, 50% caching discount | Starter plan |
| **Fireworks.ai** | $0.55+ (example) | $2.19+ (example) | 50% batch discount | No |
| **Replicate** | N/A (time-based) | N/A (time-based) | $0.36-$43.92/hour | Scale to zero |
| **Perplexity** | $0.20-$5.00 | Varies by tier | Real-time search, $5/month Pro credit | No permanent |
| **HuggingFace** | Pass-through | Pass-through | No markup, $9/month Pro | Monthly credits |
| **Anyscale** | $1.00 (Llama-2 70B) | $1.00 | Ray-based, 50% vs GPT-3.5 | Free credits |

### Coding Models - Specific Pricing Examples

| Model | Provider | Input (per 1M) | Output (per 1M) | Context | Performance Notes |
|-------|----------|----------------|-----------------|---------|-------------------|
| **DeepSeek-R1** | Together.ai | $0.55 | $2.19 | Large | Comparable to O1 |
| **DeepSeek V3** | OpenRouter | Variable | Variable | 671B MoE | Outperforms GPT-4.1 on code |
| **Qwen2.5-Coder-32B** | Various | Variable | Variable | 32B params | Best open specialist |
| **Llama 3.1 70B** | Groq | Low | Very low | 70B | 4x cheaper input, 12x cheaper output vs GPT-4o |
| **Claude Opus 4** | Anthropic | $15.00 | $75.00 | Large | 72.5% SWE-bench |
| **Claude Sonnet 4** | Anthropic | $3.00 | $15.00 | Medium | Balanced cost/performance |
| **Claude Haiku 3.5** | Anthropic | $0.80 | $4.00 | Small | Most economical |
| **GPT-4o** | OpenAI | $3.00 | Varies | Large | Premium pricing |
| **GPT-4.1** | OpenAI | $3-$12 | Varies | Large | Flagship model |

### Self-Hosted Solutions - Setup & Operating Costs

| Solution | License | Setup Cost | GPU Required | Operating Cost | Monthly @ 50M Tokens |
|----------|---------|------------|--------------|----------------|----------------------|
| **vLLM** | Open-source | $0 | Recommended | GPU + DevOps | $187-$8k depending on scale |
| **Ollama** | CC0-1.0 | $0 | Optional | Hardware only | $0 (local) |
| **TGI** | Open-source | $0 | Yes | GPU + maintenance | Cloud compute costs |
| **LocalAI** | MIT | $0 | Optional | Hardware only | $0 (local) |
| **LM Studio** | Free | $0 | Optional | Hardware only | $0 (local) |

### GPU Hardware Costs (Modal Serverless)

| GPU Type | Cost/Hour | Cost/Second | Best For | Notes |
|----------|-----------|-------------|----------|-------|
| **CPU** | $0.50 | N/A | Testing | Minimal performance |
| **NVIDIA T4** | Variable | $0.000225 | Small models | Good balance |
| **NVIDIA L40S** | $1.95 | $0.000542 | Medium models | Break-even at 60% idle |
| **NVIDIA B200** | $6.25 | $0.001736 | Large models | Most cost-effective for bursts |
| **8x H100** | $43.92 | High | Enterprise | Maximum performance |

### Monthly Cost Estimates (10M, 50M, 100M Tokens)

Assumptions: 50/50 input/output split, average model size

| Provider/Approach | 10M Tokens/Month | 50M Tokens/Month | 100M Tokens/Month |
|-------------------|------------------|------------------|-------------------|
| **OpenAI GPT-4o** | $300-$600 | $1,500-$3,000 | $3,000-$6,000 |
| **Claude Sonnet 4** | $90-$180 | $450-$900 | $900-$1,800 |
| **Claude Haiku 3.5** | $24-$48 | $120-$240 | $240-$480 |
| **Groq (Llama 3.1 70B)** | $25-$75 | $125-$375 | $250-$750 |
| **OpenRouter (mixed)** | $50-$200 | $250-$1,000 | $500-$2,000 |
| **DeepSeek (via providers)** | $15-$40 | $75-$200 | $150-$400 |
| **Self-Hosted vLLM** | $500 setup + $200 | $500 setup + $400 | $500 setup + $800 |
| **Ollama (local)** | $0 (hardware owned) | $0 (hardware owned) | $0 (hardware owned) |

*Note: Costs are estimates and vary by specific model, provider routing, and usage patterns.*

---

## Multi-Provider Strategy Recommendations

### Recommended Architecture: Hybrid Multi-Provider

#### Tier 1: Primary Gateway (OpenRouter)
**Use Case**: 80% of general workloads
- **Why**: Automatic failover, 200+ models, pass-through pricing, no markup
- **Models**:
  - Code: DeepSeek V3, Qwen2.5-Coder
  - General: Claude Haiku, GPT-4o-mini
- **Routing Strategy**: Use `:floor` for cost optimization, `:nitro` for speed
- **Estimated Cost**: $500-$1,500/month for 50M tokens

#### Tier 2: Speed-Critical (Groq)
**Use Case**: 10% - Real-time, low-latency requirements
- **Why**: 275-594 tokens/sec, prompt caching, low latency
- **Models**: Llama 3.1 70B, Mixtral
- **Use Cases**:
  - Test generation (fast iteration)
  - Real-time code analysis
  - Interactive debugging sessions
- **Estimated Cost**: $100-$300/month

#### Tier 3: Batch Processing (Self-Hosted vLLM)
**Use Case**: 10% - High-volume, non-urgent workloads
- **Why**: 83% cost reduction vs cloud APIs for consistent high volume
- **Models**: Qwen2.5-Coder-32B, DeepSeek-Coder V2
- **Use Cases**:
  - Nightly test suite generation
  - Documentation generation
  - Code analysis batches
- **Setup**: RTX 4090/5090 or cloud GPU
- **Estimated Cost**: $200-$800/month (after setup)

#### Tier 4: Development/Testing (Ollama + LM Studio)
**Use Case**: Local development, offline work
- **Why**: $0 cost, complete privacy, no API dependency
- **Models**: Qwen-2.5-Coder, DeepSeek, Codestral
- **Use Cases**:
  - Developer local testing
  - Offline environments
  - Rapid prototyping
- **Cost**: $0 (hardware owned)

### Implementation Roadmap

#### Phase 1: Foundation (Week 1-2)
1. **OpenRouter Integration**
   - Set up account with $100 credits
   - Configure API keys and routing
   - Implement `:floor` routing for cost optimization
   - Set up monitoring and usage tracking

2. **Groq Integration**
   - Create Groq account (Starter tier)
   - Integrate for speed-critical endpoints
   - Configure prompt caching for repeated queries
   - Test latency benchmarks

3. **Monitoring Setup**
   - Implement cost tracking per provider
   - Set up latency monitoring
   - Create alerting for failures/costs
   - Dashboard for provider performance

#### Phase 2: Optimization (Week 3-4)
1. **Usage Analysis**
   - Analyze request patterns
   - Identify high-volume vs. latency-sensitive workloads
   - Categorize by cost/speed requirements
   - Optimize routing strategies

2. **Local Development**
   - Deploy Ollama on developer machines
   - Configure LM Studio for team
   - Document local setup process
   - Train team on local usage

#### Phase 3: Self-Hosted (Month 2-3)
1. **vLLM Deployment** (if >50M tokens/month sustained)
   - Evaluate hardware options (RTX 5090 or cloud GPU)
   - Deploy vLLM with Qwen2.5-Coder-32B
   - Configure batch processing pipeline
   - Migrate appropriate workloads
   - Monitor ROI and adjust

2. **Advanced Features**
   - Implement fine-tuning for QE-specific tasks
   - Set up model versioning
   - Create staging/production separation
   - Document operational procedures

#### Phase 4: Scale & Refine (Ongoing)
1. **Continuous Optimization**
   - Monthly cost/performance reviews
   - Model updates and evaluations
   - Routing strategy refinements
   - Capacity planning

2. **Team Training**
   - Provider selection guidelines
   - Cost optimization best practices
   - Local vs. cloud decision matrix
   - Troubleshooting procedures

### Routing Decision Matrix

```
┌─────────────────────────────────────────────────────────────┐
│                    Request Routing Logic                    │
└─────────────────────────────────────────────────────────────┘

Request Type                → Provider Choice
─────────────────────────────────────────────────────────────
Real-time test generation   → Groq (Llama 3.1 70B)
Interactive code review     → Groq or OpenRouter :nitro
Complex reasoning           → OpenRouter (DeepSeek-R1)
Cost-sensitive bulk         → OpenRouter :floor or vLLM
Overnight batch jobs        → vLLM self-hosted
Development/prototyping     → Ollama/LM Studio local
Standard test execution     → OpenRouter (Qwen2.5-Coder)
Documentation generation    → vLLM or OpenRouter :floor
Code coverage analysis      → vLLM batch or OpenRouter
Security scanning           → OpenRouter (Claude Haiku)
```

### Failover Strategy

```
Primary: OpenRouter
   ↓ (if unavailable)
Secondary: Groq
   ↓ (if unavailable)
Tertiary: Direct provider (Together.ai/Fireworks)
   ↓ (if all unavailable)
Fallback: Local Ollama (degraded performance)
```

### Cost Optimization Rules

1. **Prompt Caching**: Use Groq's 50% cached token discount for repeated queries
2. **Batch Processing**: Route all non-urgent jobs to vLLM or batch APIs (50% savings)
3. **Model Selection**: Use smallest model that meets quality threshold
4. **Context Management**: Minimize token usage through smart context windows
5. **Compression**: Implement prompt compression techniques (6-10% savings)
6. **Local First**: Default to Ollama for dev/test when possible

### Monitoring & Alerting

#### Key Metrics
- **Cost per request** by provider and model
- **Latency** (p50, p95, p99) per provider
- **Error rate** and type by provider
- **Token usage** (input/output) trends
- **Uptime** and availability per provider

#### Alerts
- Daily cost exceeds $X threshold
- Provider error rate >5% in 15 min
- Latency p95 >3 seconds
- API key approaching rate limit
- Monthly budget at 80% utilization

#### Dashboards
1. **Real-Time**: Current requests, latency, errors
2. **Cost Analysis**: Daily/weekly/monthly spend by provider
3. **Performance**: Model comparison, provider comparison
4. **Capacity**: Usage trends, forecast, scaling needs

### Risk Mitigation

1. **Vendor Lock-In**: OpenAI-compatible APIs across all providers
2. **Cost Overruns**: Pre-paid credits, spending limits, alerts
3. **Downtime**: Multi-provider failover, local fallback
4. **Data Privacy**: Local Ollama for sensitive code, no data retention policies
5. **Quality Variance**: A/B testing, quality monitoring, rollback procedures

### Expected Outcomes

**Month 1** (OpenRouter + Groq):
- 50M tokens/month
- Estimated cost: $600-$800
- 40% savings vs. Claude-only approach
- 99%+ uptime with failover

**Month 3** (+ vLLM for batch):
- 100M tokens/month (doubled usage)
- Estimated cost: $900-$1,200
- 60% savings vs. Claude-only
- 30% of workload on self-hosted

**Month 6** (Optimized):
- 200M tokens/month
- Estimated cost: $1,500-$2,000
- 70% savings vs. Claude-only
- 50% of workload on self-hosted
- ROI positive on vLLM hardware

---

## Summary & Quick Reference

### Quick Provider Selection Guide

| Need | Recommended Provider | Alternative |
|------|---------------------|-------------|
| **Lowest cost** | OpenRouter :floor or DeepSeek | Groq, Anyscale |
| **Fastest speed** | Groq | Modal, Together.ai |
| **Best code quality** | DeepSeek V3, Qwen2.5-Coder | Claude Opus 4 |
| **Highest reliability** | OpenRouter (auto-failover) | Groq + fallback |
| **Privacy-first** | Ollama, LocalAI, vLLM | LM Studio |
| **Enterprise compliance** | Fireworks.ai, Hugging Face | Anyscale |
| **Easiest setup** | OpenRouter, Groq | Replicate |
| **Best for experimentation** | Hugging Face, OpenRouter | Together.ai |
| **Long-term cost optimization** | vLLM self-hosted | Anyscale, Together.ai |

### Key Recommendations

1. **Start with OpenRouter**: Immediate access to 200+ models, automatic failover, transparent pricing
2. **Add Groq for speed**: Use for latency-sensitive workloads (test generation, real-time analysis)
3. **Deploy Ollama locally**: Free development/testing, complete privacy, offline capability
4. **Plan vLLM for scale**: If sustained >50M tokens/month, self-hosting becomes economical
5. **Use coding-specific models**: DeepSeek V3, Qwen2.5-Coder outperform general models on code

### Cost Savings Opportunities

- **Prompt Caching** (Groq): 50% discount on repeated tokens
- **Batch Processing**: 50% savings on all providers offering batch APIs
- **OpenRouter :floor routing**: Automatic cost optimization
- **Self-hosted vLLM**: 83% savings at high volume (>50M tokens/month)
- **Prompt compression**: 6-10% savings across all providers
- **Model right-sizing**: Use smallest model meeting quality threshold

### Critical Success Factors

1. **Monitoring**: Track cost, latency, quality per provider continuously
2. **Failover**: Implement multi-provider redundancy from day one
3. **Team Training**: Ensure developers understand when to use each provider
4. **Iterative Optimization**: Monthly reviews of usage patterns and costs
5. **Quality Gates**: Don't sacrifice quality for cost—measure both

---

## Appendix: Additional Resources

### Research Sources

**OpenRouter**:
- [OpenRouter Pricing](https://openrouter.ai/pricing)
- [OpenRouter API Review 2025](https://binaryverseai.com/openrouter-ai-review-pricing-models-api-how-use/)
- [OpenRouter FAQ](https://openrouter.ai/docs/faq)
- [API Rate Limits Documentation](https://openrouter.ai/docs/api/reference/limits)

**Together.ai**:
- [Together AI Pricing](https://www.together.ai/pricing)
- [Together AI Guide 2025](https://www.eesel.ai/blog/together-ai-pricing)
- [Together AI Products](https://www.together.ai/products)

**Groq**:
- [Groq Pricing](https://groq.com/pricing)
- [Groq Pricing Guide 2025](https://www.eesel.ai/blog/groq-pricing)
- [Groq Performance Analysis](https://artificialanalysis.ai/providers/groq)

**Fireworks.ai**:
- [Fireworks Pricing](https://fireworks.ai/pricing)
- [Fireworks AI Guide](https://www.eesel.ai/blog/fireworks-ai-pricing)

**Replicate**:
- [Replicate Pricing](https://replicate.com/pricing)
- [Replicate Billing Documentation](https://replicate.com/docs/topics/billing)

**Perplexity**:
- [Perplexity API Pricing](https://docs.perplexity.ai/getting-started/pricing)
- [Perplexity Pricing Guide 2025](https://www.eesel.ai/blog/perplexity-pricing)

**Hugging Face**:
- [Hugging Face Pricing](https://huggingface.co/pricing)
- [Inference Providers Pricing](https://huggingface.co/docs/inference-providers/pricing)

**Anyscale**:
- [Anyscale Endpoints](https://www.anyscale.com/endpoints)
- [Anyscale Launch Announcement](https://www.anyscale.com/press/anyscale-launches-new-service-anyscale-endpoints-10x-more-cost-effective-for-most-popular-open-source-llms)

**Modal**:
- [Modal Pricing](https://modal.com/pricing)
- [Serverless GPU Comparison](https://www.runpod.io/articles/guides/top-serverless-gpu-clouds)
- [Modal B200 Pricing](https://modal.com/blog/nvidia-b200-pricing)

**Self-Hosted Solutions**:
- [vLLM Deployment Guide](https://rabiloo.com/blog/deploying-local-llm-hosting-for-free-with-vllm)
- [Self-Hosting LLMs 2025 Guide](https://kextcache.com/self-hosting-llms-privacy-cost-efficiency-guide/)
- [Ollama Complete Guide](https://skywork.ai/blog/agent/what-is-ollama-complete-guide-to-local-ai-models-2025/)
- [LocalAI GitHub](https://github.com/mudler/LocalAI)
- [LM Studio API Documentation](https://lmstudio.ai/docs/developer/core/server)
- [TGI Documentation](https://huggingface.co/docs/text-generation-inference/en/index)

**Coding Models**:
- [Best Open Source LLMs 2025](https://huggingface.co/blog/daya-shankar/open-source-llms)
- [Best Coding LLMs](https://www.labellerr.com/blog/best-coding-llms/)
- [DeepSeek Coder Review](https://dev.to/ashinno/best-code-llm-2025-is-here-deepseek-1e3m)

**Cost Comparison**:
- [LLM Pricing Calculator](https://www.llm-prices.com/)
- [PricePerToken Comparison](https://pricepertoken.com/)
- [LLM API Pricing Comparison 2025](https://intuitionlabs.ai/articles/llm-api-pricing-comparison-2025)
- [Claude vs GPT-4 Pricing](https://www.vantage.sh/blog/aws-bedrock-claude-vs-azure-openai-gpt-ai-cost)

### Useful Tools

- **LLM Pricing Calculators**:
  - https://www.llm-prices.com/
  - https://pricepertoken.com/
  - https://www.helicone.ai/llm-cost

- **Performance Benchmarks**:
  - https://artificialanalysis.ai/
  - https://huggingface.co/spaces/open-llm-leaderboard

- **Model Libraries**:
  - https://ollama.com/library
  - https://huggingface.co/models
  - https://lmstudio.ai/models

---

**Report Compiled**: December 23, 2025
**Next Review**: March 2026 (or when major pricing/model changes occur)
**Maintained By**: AQE Fleet Research Team
