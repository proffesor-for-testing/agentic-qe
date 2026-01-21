# AQE Fleet LLM Independence - GOAP Implementation Plan

**Goal:** Make the Agentic Quality Engineering Fleet fully independent from vendor LLMs (Claude, OpenAI) while maintaining or improving quality, performance, and cost-effectiveness.

**Status:** Planning Phase
**Target:** Q1-Q2 2025
**Priority:** HIGH
**Risk Level:** MEDIUM (good abstractions exist, incremental migration path available)

---

## Executive Summary

### Current State Analysis
The AQE Fleet has **excellent architectural foundations** for LLM independence:
- ✅ Well-designed `ILLMProvider` abstraction (13 methods, fully typed)
- ✅ `HybridRouter` with intelligent routing, circuit breakers, and cost tracking
- ✅ `RuvllmProvider` with TRM (Test-time Reasoning) and SONA (Self-Organizing Neural Architecture)
- ✅ Vector memory with HNSW and Transformers.js embeddings (no vendor dependency)
- ⚠️ **HIGH vendor lock-in on Claude API** (used by all 20 agents + 11 subagents)
- ⚠️ **MEDIUM lock-in on OpenRouter** (fallback provider)
- ⚠️ **RuvLLM underutilized** (exists but not production-ready)

### Opportunity Analysis
- **Cost Savings:** 70-81% reduction (HybridRouter metrics show local requests = $0)
- **Privacy:** No data leaves machine for sensitive QE operations
- **Performance:** 0.09ms orchestration latency (7,500x faster than GPT-4o) with ruvLLM
- **Quality:** TRM provides iterative refinement for complex tasks
- **Scalability:** Unlimited local inference (no rate limits)

### Success Metrics
1. **Independence:** 80%+ requests routed to local inference by Q2 2025
2. **Quality:** Maintain ≥95% test generation quality vs Claude baseline
3. **Cost:** Reduce monthly LLM costs by 60%+
4. **Latency:** P50 < 2s for simple tasks, P95 < 5s for complex tasks
5. **Reliability:** 99.5% uptime with circuit breaker protection

---

## GOAP Analysis

### World State (Current Dependencies)

#### **Critical Dependencies (HIGH Lock-in)**
| Component | Provider | Usage | Risk | Migration Effort |
|-----------|----------|-------|------|------------------|
| 20 QE Agents | Claude Sonnet 4.5 | All agent inference | 🔴 HIGH | 8-12 weeks |
| 11 Subagents | Claude Sonnet 4.5 | Specialized tasks | 🔴 HIGH | 4-6 weeks |
| Test Generation | Claude API | Code synthesis | 🔴 HIGH | 6-8 weeks |
| Code Analysis | Claude API | Static analysis | 🟡 MEDIUM | 3-4 weeks |
| Embeddings | Transformers.js | Vector search | 🟢 LOW | 0 weeks (done) |

#### **Secondary Dependencies (MEDIUM Lock-in)**
| Component | Provider | Usage | Risk | Migration Effort |
|-----------|----------|-------|------|------------------|
| Fallback Router | OpenRouter | When Claude fails | 🟡 MEDIUM | 2-3 weeks |
| Multi-modal | Claude Vision | Screenshot analysis | 🟡 MEDIUM | 4-6 weeks |
| Prompt Caching | Claude API | Context optimization | 🟢 LOW | 2 weeks |

#### **Strengths (Already Independent)**
- ✅ **Vector Memory:** SQLite + HNSW + Transformers.js (no vendor)
- ✅ **Embeddings:** Local Transformers.js with hash fallback
- ✅ **Abstractions:** `ILLMProvider` interface fully vendor-agnostic
- ✅ **Router:** `HybridRouter` with cost tracking and circuit breakers
- ✅ **Learning:** SONA + TRM + Q-learning all local

---

### Goal State (Full Independence)

#### **Phase 4 Target (Q2 2025)**
```typescript
// 100% independent AQE Fleet
const fleet = new FleetManager({
  llmProvider: new HybridRouter({
    defaultStrategy: RoutingStrategy.PRIVACY_FIRST,
    ruvllm: {
      enableTRM: true,
      enableSONA: true,
      defaultModel: 'devstral-small-2'  // Local - SE agent optimized (Dec 2025)
    },
    claude: {
      enabled: false  // Only for emergency fallback
    }
  }),
  learningEnabled: true,  // SONA + Q-learning + pattern reuse
  autonomousMode: true    // Self-learning and adaptation
});

// Metrics after full migration:
// - 95%+ requests: Local inference (Ollama/vLLM)
// - 80%+ quality: Maintained vs Claude baseline
// - $0.00/month: LLM API costs (except emergency fallback)
// - 0.09ms: Orchestration latency (ruvLLM SONA)
// - 99.9%: Uptime with circuit breakers
```

---

## Implementation Plan (4 Phases)

### **Phase 1: Local Inference MVP** (4-6 weeks)
**Goal:** Prove local LLM viability for QE tasks with production-grade setup

#### Milestones
1. **M1.1: Production Ollama Setup** (Week 1-2)
   - Install Ollama on development/CI servers
   - Pull recommended models (December 2025):
     - `devstral-small-2` (24B) - Primary: designed for SE agents
     - `rnj-1` (8B) - Fast: optimized for code/STEM
     - `qwen2.5-coder:7b` - Fallback: well-tested baseline
   - Configure models for QE tasks (system prompts, temperature)
   - Benchmark latency and throughput (target: 120+ req/sec)

2. **M1.2: OllamaProvider Implementation** (Week 2-3)
   ```typescript
   // /workspaces/agentic-qe-cf/src/providers/OllamaProvider.ts
   export class OllamaProvider implements ILLMProvider {
     private baseUrl: string = 'http://localhost:11434';

     // Model selection based on task complexity (December 2025 models)
     private modelMap = {
       simple: 'rnj-1',              // 8B - Fast code/STEM
       moderate: 'devstral-small-2', // 24B - SE agents (recommended)
       complex: 'qwen2.5-coder:32b', // 32B - Deep analysis
     };

     async complete(options: LLMCompletionOptions): Promise<LLMCompletionResponse> {
       // OpenAI-compatible /v1/chat/completions endpoint
       const model = this.selectModel(options.complexity);
       const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
         method: 'POST',
         body: JSON.stringify({
           model,
           messages: this.convertMessages(options.messages),
           temperature: options.temperature ?? 0.7,
           max_tokens: options.maxTokens ?? 2048
         })
       });
       return this.parseResponse(await response.json());
     }
   }
   ```

3. **M1.3: HybridRouter Integration** (Week 3-4)
   - Add `OllamaProvider` to `HybridRouter`
   - Implement complexity-based routing:
     - SIMPLE/MODERATE → Ollama (local)
     - COMPLEX → Claude (cloud) with TRM fallback
     - VERY_COMPLEX → Claude (cloud)
   - Add circuit breaker for Ollama health checks

4. **M1.4: Quality Baseline Testing** (Week 4-5)
   - Run 100 test generation tasks (50/50 Ollama/Claude)
   - Measure quality metrics:
     - Test coverage generated
     - Edge cases discovered
     - Code correctness (syntax/logic)
   - Target: Ollama ≥90% quality vs Claude
   - Document failure patterns

5. **M1.5: Cost & Performance Analysis** (Week 5-6)
   - Track routing decisions over 1000 requests
   - Measure actual cost savings (local vs cloud)
   - Latency analysis (P50, P95, P99)
   - Generate cost savings report
   - Decision: Go/No-Go for Phase 2

#### Success Criteria
- ✅ Ollama serving devstral-small-2/rnj-1 at 120+ req/sec
- ✅ Quality ≥90% vs Claude baseline for simple tasks
- ✅ Cost savings ≥50% with hybrid routing
- ✅ Circuit breaker prevents cascading failures
- ✅ HybridRouter routes 40%+ to Ollama

#### Dependencies
- Hardware: 16GB+ RAM (24GB+ recommended for devstral-small-2), 8+ CPU cores, optional GPU
- Software: Ollama 0.5+, devstral-small-2, rnj-1, qwen2.5-coder:7b models
- Team: 1 engineer (backend), 1 QE (validation)

---

### **Phase 2: Production Deployment** (6-8 weeks)
**Goal:** Scale to production with vLLM, multi-model routing, and observability

#### Milestones
1. **M2.1: vLLM Production Setup** (Week 1-2)
   - Deploy vLLM server with GPU support (NVIDIA A10/T4)
   - Load production models (December 2025):
     - Qwen3-Coder-30B-A3B (MoE: 30B total, 3B active - efficient!)
     - Devstral-2 (123B) - for complex agentic tasks
     - DeepSeek Coder V2 16B - fallback
   - Configure tensor parallelism for throughput (120-160 req/sec)
   - Set up load balancing (multiple vLLM instances)

2. **M2.2: Multi-Model Router** (Week 2-3)
   ```typescript
   // /workspaces/agentic-qe-cf/src/providers/MultiModelRouter.ts
   export class MultiModelRouter extends HybridRouter {
     // Updated December 2025 - Latest models
     private localModels = {
       simple: 'rnj-1',                  // 8B - Fast code/STEM (NEW!)
       moderate: 'devstral-small-2',     // 24B - SE agents (NEW!)
       complex: 'qwen3-coder-30b-a3b',   // 30B MoE, 3B active (NEW!)
       reasoning: 'devstral-2'           // 123B - Full power (NEW!)
     };

     protected selectModel(complexity: TaskComplexity): string {
       switch (complexity) {
         case TaskComplexity.SIMPLE:
           return this.localModels.simple;
         case TaskComplexity.MODERATE:
           return this.localModels.moderate;
         case TaskComplexity.COMPLEX:
           return this.localModels.complex;
         case TaskComplexity.VERY_COMPLEX:
           return this.localModels.reasoning;
       }
     }
   }
   ```

3. **M2.3: TRM Enhancement for Local Models** (Week 3-4)
   - Enable TRM for all local requests (iterative refinement)
   - Tune TRM parameters per model:
     - 7B: maxIterations=3, threshold=0.90
     - 16B: maxIterations=5, threshold=0.95
     - 32B: maxIterations=7, threshold=0.98
   - Measure quality improvement vs single-pass

4. **M2.4: Observability & Monitoring** (Week 4-5)
   - Instrument with OpenTelemetry:
     - Request latency (P50, P95, P99)
     - Token throughput (input/output)
     - Model selection frequency
     - Circuit breaker state
   - Grafana dashboards for LLM metrics
   - Alerting on quality degradation

5. **M2.5: Gradual Rollout** (Week 5-7)
   - Week 5: 20% traffic to local (shadow mode)
   - Week 6: 50% traffic to local (A/B test)
   - Week 7: 80% traffic to local (primary)
   - Continuous quality monitoring
   - Rollback plan if quality drops <95%

6. **M2.6: Cost Optimization** (Week 7-8)
   - Analyze routing decisions and model selection
   - Tune complexity thresholds for cost/quality balance
   - Implement dynamic model selection based on load
   - Generate final cost savings report

#### Success Criteria
- ✅ vLLM serving at 120+ req/sec with 99.5% uptime
- ✅ Multi-model routing based on complexity
- ✅ TRM improves quality by 5-10% for complex tasks
- ✅ 80%+ requests routed to local inference
- ✅ Cost reduction ≥60% vs pure Claude
- ✅ Quality maintained at ≥95% vs baseline

#### Dependencies
- Infrastructure: GPU server (NVIDIA A10/T4, 24GB+ VRAM)
- Models: Qwen 2.5 Coder (7B, 32B), DeepSeek Coder V2 (16B)
- Team: 2 engineers (infra, backend), 1 SRE (monitoring), 1 QE

---

### **Phase 3: Fine-Tuning Pipeline** (8-10 weeks)
**Goal:** Train custom QE models on AQE patterns using Phi-4 (14B, LoRA-first design)

#### Milestones
1. **M3.1: Dataset Curation** (Week 1-2)
   - Extract 10,000+ high-quality QE examples from memory:
     - Test generation (input: code → output: tests)
     - Coverage analysis (input: coverage → output: gaps)
     - Flaky detection (input: test history → output: classification)
   - Label data with quality scores (from SONA feedback)
   - Split: 70% train, 15% validation, 15% test

2. **M3.2: Phi-4 Base Model Setup** (Week 2-3)
   - Download Phi-4 14B (MIT license, LoRA-first design)
   - Set up training infrastructure (A100 GPU, 40GB+ VRAM)
   - Baseline evaluation on QE tasks (before fine-tuning)

3. **M3.3: LoRA Fine-Tuning** (Week 3-5)
   ```python
   # Fine-tune Phi-4 for QE tasks
   from transformers import AutoModelForCausalLM, TrainingArguments
   from peft import LoraConfig, get_peft_model

   model = AutoModelForCausalLM.from_pretrained("microsoft/phi-4")
   lora_config = LoraConfig(
       r=16,           # LoRA rank (Phi-4 optimized)
       lora_alpha=32,  # Scaling factor
       target_modules=["q_proj", "v_proj", "k_proj", "o_proj"],
       lora_dropout=0.1
   )
   model = get_peft_model(model, lora_config)

   # Train on QE dataset
   trainer.train(
       train_dataset=qe_train_data,
       eval_dataset=qe_val_data,
       num_epochs=3
   )
   ```

4. **M3.4: Multi-Task Adapter Training** (Week 5-7)
   - Train separate LoRA adapters per task type:
     - `test-generation.adapter` (Test synthesis)
     - `coverage-analysis.adapter` (Gap detection)
     - `flaky-detection.adapter` (Flaky classification)
     - `code-review.adapter` (Quality analysis)
   - Hot-swap adapters based on task complexity

5. **M3.5: Quality Evaluation** (Week 7-8)
   - Benchmark fine-tuned Phi-4 vs base models:
     - Qwen 2.5 Coder 7B (baseline local)
     - Claude Sonnet 4.5 (baseline cloud)
   - Metrics: Test quality, edge cases, code correctness
   - Target: Phi-4 ≥95% quality vs Claude

6. **M3.6: Deployment & Integration** (Week 8-10)
   - Deploy fine-tuned Phi-4 to vLLM cluster
   - Integrate LoRA adapter hot-swapping in `MultiModelRouter`
   - A/B test: 20% → 50% → 80% fine-tuned traffic
   - Monitor quality and revert if needed

#### Success Criteria
- ✅ 10,000+ labeled QE examples curated
- ✅ Fine-tuned Phi-4 achieves ≥95% quality vs Claude
- ✅ LoRA adapters reduce memory usage by 80%+
- ✅ Multi-task adapters improve domain-specific quality by 10%+
- ✅ Deployment pipeline for continuous fine-tuning

#### Dependencies
- Hardware: A100 GPU (40GB VRAM) for training
- Data: 10,000+ QE examples from SONA/SwarmMemoryManager
- Models: Phi-4 14B (MIT), LoRA adapters
- Team: 2 ML engineers, 1 backend engineer, 1 QE

---

### **Phase 4: Full Independence** (6-8 weeks)
**Goal:** Self-learning fleet with federated agents, zero vendor dependency

#### Milestones
1. **M4.1: SONA Self-Learning** (Week 1-2)
   - Enable continuous learning from all agent executions
   - Store successful trajectories in ReasoningBank
   - Train LoRA adapters on-the-fly (incremental learning)
   - Measure quality improvement over time

2. **M4.2: Federated Agent Training** (Week 2-4)
   - Implement federated learning across AQE agents:
     - Each agent fine-tunes local LoRA adapter
     - Aggregate gradients via secure aggregation
     - Update global adapter every 1000 tasks
   - Privacy-preserving (no raw data shared)

3. **M4.3: Autonomous Model Selection** (Week 4-5)
   - Train meta-model to predict best model per task:
     - Input: Task features (complexity, type, context)
     - Output: Model recommendation + confidence
   - Replace manual routing rules with learned policy
   - Reinforcement learning for continuous optimization

4. **M4.4: Emergency Fallback Only** (Week 5-6)
   - Disable Claude API for normal operations
   - Keep Claude as emergency fallback (circuit breaker)
   - Trigger only on:
     - Local model failure (3+ consecutive errors)
     - Quality below 90% threshold
     - Latency > 10s timeout
   - Alert on fallback usage (should be <1% of requests)

5. **M4.5: Cost & Quality Final Validation** (Week 6-7)
   - Run 10,000 QE tasks with 100% local inference
   - Measure final metrics:
     - Cost: $0.00/month LLM APIs (except <1% fallback)
     - Quality: ≥95% vs Claude baseline
     - Latency: P50 < 2s, P95 < 5s
     - Uptime: 99.9% with circuit breakers
   - Generate independence report

6. **M4.6: Documentation & Handoff** (Week 7-8)
   - Document architecture and operational procedures
   - Create runbooks for model deployment and monitoring
   - Train operations team on troubleshooting
   - Public release announcement

#### Success Criteria
- ✅ 99%+ requests served by local inference
- ✅ SONA improves quality by 5-10% over 30 days
- ✅ Federated learning reduces per-agent fine-tuning cost
- ✅ Autonomous routing outperforms manual rules
- ✅ Claude usage <1% (emergency fallback only)
- ✅ Total independence achieved

#### Dependencies
- Infrastructure: Production vLLM cluster with GPUs
- Models: Fine-tuned Phi-4, LoRA adapters, meta-model
- Team: 2 ML engineers, 2 backend engineers, 1 SRE, 1 QE

---

## Resource Requirements

### **Hardware**

#### Development (Phase 1)
- **CPU:** 8+ cores, 16GB+ RAM
- **GPU:** Optional (CPU inference acceptable for MVP)
- **Storage:** 50GB for models
- **Cost:** $0 (use existing dev machines)

#### Production (Phase 2-4)
- **GPU Server:** NVIDIA A10/T4 (24GB VRAM) or A100 (40GB VRAM)
  - vLLM cluster: 2-4 servers for redundancy
  - Cost: ~$1-2/hour per server (AWS/GCP)
- **Storage:** 500GB for models, adapters, checkpoints
- **Network:** Low-latency for inference (<10ms)

### **Software**
- **Inference:** Ollama (dev), vLLM (prod), llama.cpp (edge)
- **Training:** Transformers, PEFT (LoRA), DeepSpeed
- **Monitoring:** OpenTelemetry, Prometheus, Grafana
- **Models:**
  - Qwen 2.5 Coder (7B, 32B) - Apache 2.0
  - DeepSeek Coder V2 (16B) - MIT
  - Phi-4 (14B) - MIT
  - IBM Granite Code (8B) - Apache 2.0

### **Team**
- **Phase 1 (MVP):** 1 backend engineer, 1 QE engineer (4-6 weeks)
- **Phase 2 (Production):** 2 engineers, 1 SRE, 1 QE (6-8 weeks)
- **Phase 3 (Fine-Tuning):** 2 ML engineers, 1 backend, 1 QE (8-10 weeks)
- **Phase 4 (Independence):** 2 ML engineers, 2 backend, 1 SRE, 1 QE (6-8 weeks)

### **Budget Estimate**
```
Phase 1 (MVP):
- Team: 2 engineers × 6 weeks × $2000/week = $24,000
- Infrastructure: $0 (use existing dev machines)
- Total: $24,000

Phase 2 (Production):
- Team: 4 engineers × 8 weeks × $2000/week = $64,000
- GPU servers: 2 servers × $2/hour × 24h × 56 days = $5,376
- Total: $69,376

Phase 3 (Fine-Tuning):
- Team: 4 engineers × 10 weeks × $2000/week = $80,000
- A100 GPU: 1 server × $3/hour × 24h × 70 days = $5,040
- Total: $85,040

Phase 4 (Independence):
- Team: 6 engineers × 8 weeks × $2000/week = $96,000
- Infrastructure: $6,000 (vLLM cluster maintenance)
- Total: $102,000

GRAND TOTAL: $280,416 (one-time investment)

ROI Analysis:
- Current Claude costs: ~$5,000/month (estimated)
- Post-migration costs: <$500/month (GPU hosting + <1% fallback)
- Monthly savings: $4,500
- Break-even: 62 months (~5 years)
- BUT: Adds privacy, control, unlimited scale, learning capabilities
```

---

## Risk Assessment & Mitigations

### **Critical Risks**

#### R1: Quality Degradation
- **Risk:** Local models produce lower quality tests than Claude
- **Likelihood:** MEDIUM
- **Impact:** HIGH
- **Mitigation:**
  - Phase 1 baseline testing (go/no-go decision point)
  - TRM iterative refinement for complex tasks
  - Gradual rollout with A/B testing
  - Automatic rollback if quality <95%
  - Keep Claude as fallback for very complex tasks

#### R2: Latency Regression
- **Risk:** Local inference slower than Claude API
- **Likelihood:** LOW (vLLM benchmarks show 120-160 req/sec)
- **Impact:** MEDIUM
- **Mitigation:**
  - GPU acceleration (mandatory for prod)
  - Model quantization (4-bit GPTQ/AWQ)
  - Tensor parallelism across GPUs
  - Circuit breaker timeout: fallback to Claude if >10s

#### R3: Infrastructure Costs
- **Risk:** GPU hosting costs exceed Claude API costs
- **Likelihood:** LOW
- **Impact:** MEDIUM
- **Mitigation:**
  - ROI analysis every phase (cost tracking)
  - Optimize GPU utilization (>80% target)
  - Auto-scaling based on load
  - CPU inference for simple tasks (llama.cpp)

### **Medium Risks**

#### R4: Model Drift
- **Risk:** Fine-tuned models degrade over time
- **Likelihood:** MEDIUM
- **Impact:** MEDIUM
- **Mitigation:**
  - Continuous quality monitoring (daily reports)
  - Automated retraining pipeline (weekly)
  - EWC (Elastic Weight Consolidation) prevents catastrophic forgetting
  - Fallback to base model if drift detected

#### R5: Operational Complexity
- **Risk:** vLLM cluster harder to maintain than API
- **Likelihood:** MEDIUM
- **Impact:** LOW
- **Mitigation:**
  - Comprehensive documentation (runbooks)
  - Automated health checks and restarts
  - SRE training and handoff
  - Managed GPU hosting (Lambda Labs, RunPod)

#### R6: Regulatory/Compliance
- **Risk:** Fine-tuned models violate licensing or data privacy
- **Likelihood:** LOW
- **Impact:** HIGH
- **Mitigation:**
  - Use MIT/Apache 2.0 models only (Phi-4, Qwen, Granite)
  - No training on customer data (only internal AQE patterns)
  - Legal review before Phase 3 (fine-tuning)

### **Low Risks**

#### R7: Team Expertise Gap
- **Risk:** Team lacks ML/vLLM expertise
- **Likelihood:** LOW
- **Impact:** LOW
- **Mitigation:**
  - Hire ML consultant for Phase 3 (fine-tuning)
  - Training budget for vLLM/LoRA
  - Start with simple Ollama setup (Phase 1 MVP)

---

## Success Criteria (Measurable)

### **Phase 1: MVP**
- ✅ Ollama serving at 120+ req/sec
- ✅ Quality ≥90% vs Claude for simple tasks
- ✅ Cost savings ≥50% with hybrid routing
- ✅ Circuit breaker prevents failures
- ✅ Decision: GO for Phase 2

### **Phase 2: Production**
- ✅ 80%+ requests routed to local
- ✅ Quality maintained at ≥95%
- ✅ Cost reduction ≥60%
- ✅ Latency: P50 < 2s, P95 < 5s
- ✅ Uptime: 99.5%+

### **Phase 3: Fine-Tuning**
- ✅ Fine-tuned Phi-4 ≥95% quality vs Claude
- ✅ LoRA adapters reduce memory by 80%+
- ✅ Multi-task adapters improve quality by 10%+
- ✅ Continuous fine-tuning pipeline deployed

### **Phase 4: Independence**
- ✅ 99%+ requests served locally
- ✅ Claude usage <1% (emergency only)
- ✅ SONA improves quality by 5-10% over 30 days
- ✅ Cost: $0.00/month LLM APIs (except fallback)
- ✅ Quality: ≥95% vs baseline
- ✅ **INDEPENDENCE ACHIEVED**

---

## Decision Points

### **Go/No-Go: Phase 1 → Phase 2**
**Week 6 (Phase 1 end)**

Criteria:
- ✅ Quality ≥90% vs Claude for simple tasks
- ✅ Cost savings ≥50% demonstrated
- ✅ No critical bugs in Ollama integration

Decision: **GO** if all criteria met, **PIVOT** to alternative approach if quality <85%

### **Go/No-Go: Phase 2 → Phase 3**
**Week 8 (Phase 2 end)**

Criteria:
- ✅ 80%+ traffic routed to local successfully
- ✅ Quality ≥95% maintained in production
- ✅ Cost reduction ≥60% achieved

Decision: **GO** if all criteria met, **PAUSE** to optimize if quality <90%

### **Go/No-Go: Phase 3 → Phase 4**
**Week 10 (Phase 3 end)**

Criteria:
- ✅ Fine-tuned Phi-4 quality ≥95% vs Claude
- ✅ LoRA adapters functional and stable
- ✅ Team confident in model deployment

Decision: **GO** if all criteria met, **EXTEND PHASE 3** to retrain if quality <90%

---

## Rollback Plan

### **Immediate Rollback (< 1 hour)**
**Trigger:** Critical quality drop (<80%), system outage, data loss

Actions:
1. Set `HybridRouter.defaultStrategy = RoutingStrategy.QUALITY_OPTIMIZED` (forces Claude)
2. Disable local provider in config: `ruvllm.enabled = false`
3. Restart fleet with cloud-only mode
4. Alert engineering team

### **Partial Rollback (< 4 hours)**
**Trigger:** Moderate quality degradation (80-90%), latency spike (>10s)

Actions:
1. Reduce local routing: `maxLocalLatency = 2000` (forces more cloud routing)
2. Enable stricter circuit breaker: `circuitBreakerThreshold = 2`
3. A/B test: 20% local → 80% cloud
4. Investigate root cause

### **Complete Rollback (< 1 day)**
**Trigger:** Persistent issues, infrastructure failure, cost overrun

Actions:
1. Revert to pre-migration config (pure Claude)
2. Disable all local providers
3. Post-mortem analysis
4. Re-evaluate migration strategy

---

## Monitoring & Observability

### **Key Metrics**

#### Quality Metrics
- **Test Coverage:** % of code covered by generated tests
- **Edge Cases:** # unique edge cases discovered
- **Code Correctness:** % syntax-valid + logic-valid tests
- **Flaky Detection Accuracy:** Precision/recall for flaky test classification

#### Performance Metrics
- **Latency:** P50, P95, P99 response times
- **Throughput:** Requests per second
- **Token Rate:** Input/output tokens per second
- **GPU Utilization:** % GPU usage (target: >80%)

#### Cost Metrics
- **Total Cost:** $ spent on LLM APIs + infrastructure
- **Cost per Request:** $ per inference request
- **Savings:** $ saved vs pure Claude baseline
- **ROI:** Return on investment vs migration costs

#### Reliability Metrics
- **Uptime:** % availability (target: 99.5%+)
- **Error Rate:** % failed requests
- **Circuit Breaker Trips:** # times fallback triggered
- **Fallback Usage:** % requests using Claude emergency fallback

### **Dashboards**
1. **Executive Dashboard:** Cost savings, quality, uptime
2. **Operations Dashboard:** Latency, throughput, GPU utilization
3. **Quality Dashboard:** Test quality, edge cases, correctness
4. **Routing Dashboard:** Local vs cloud routing decisions

### **Alerts**
- 🔴 **CRITICAL:** Quality <90%, uptime <99%, error rate >5%
- 🟡 **WARNING:** Quality 90-95%, latency P95 >5s, fallback >5%
- 🟢 **INFO:** New model deployed, routing strategy changed

---

## Appendix: Model Selection Rationale (Updated December 2025)

### **Small Models (≤8B) - Simple/Fast Tasks**

**Winner: RNJ-1 8B** ⭐ NEW (December 2025)
- Dense model optimized for code and STEM
- Performance on par with state-of-the-art open-weight models
- Ollama: `ollama pull rnj-1`
- License: Open-weight

**Runner-up: Qwen 2.5 Coder 7B**
- HumanEval: 88.4%
- Languages: 92+
- Context: 128K tokens
- Ollama: `ollama pull qwen2.5-coder:7b`

### **Medium Models (8-32B) - General QE Tasks**

**Winner: Devstral-Small-2 24B** ⭐ NEW (December 2025)
- Specifically designed for software engineering agents
- Excels at: exploring codebases, editing multiple files, powering SE agents
- Perfect for AQE use case
- Ollama: `ollama pull devstral-small-2`
- License: Apache 2.0 (Mistral)

**Runner-up: Qwen3-Coder-30B-A3B-Instruct** ⭐ NEW
- MoE architecture: 30B total, only 3B active parameters
- Extremely efficient inference (3B cost, 30B quality)
- 1.06M downloads, 811 likes on HuggingFace
- Ollama: Coming soon (use vLLM for now)

**Alternative: DeepSeek Coder V2 16B**
- MoE architecture, 338 languages
- Ollama: `ollama pull deepseek-coder-v2:16b`

### **Large Models (32B+) - Complex Reasoning**

**Winner: Devstral-2 123B** ⭐ NEW (December 2025)
- Full-size version of Devstral for software engineering
- Best-in-class for agentic coding tasks
- Requires 64GB+ RAM
- Ollama: `ollama pull devstral-2`

**Alternative: Qwen 2.5 Coder 32B**
- Well-tested, 1.96k likes
- Ollama: `ollama pull qwen2.5-coder:32b`

### **Production Scale (MoE)**

**Winner: Qwen3-Coder-480B-A35B-Instruct**
- Massive MoE: 480B total, 35B active
- For production vLLM clusters with GPU
- 1.25k likes on HuggingFace

### **Fine-Tuning Base**

**Winner: Phi-4 14B**
- LoRA-first design (optimized for fine-tuning)
- License: MIT (permissive)
- Size: 14B (good quality/speed balance)

**Alternative: Qwen3-Coder-30B-A3B** (for MoE fine-tuning)

### **Inference Frameworks**

| Environment | Framework | Best For |
|-------------|-----------|----------|
| **Local Mac** | Ollama | Easy setup, great UX |
| **Development** | Ollama | Fast iteration |
| **Production** | vLLM | 120-160 req/sec, tensor parallelism |
| **Edge/CI** | llama.cpp | CPU inference, portable |

### **Recommended Ollama Setup for Local Mac**

```bash
# Install Ollama (if not already installed)
curl -fsSL https://ollama.com/install.sh | sh

# Pull recommended models
ollama pull devstral-small-2   # 24B - Best for SE agents (NEW!)
ollama pull rnj-1              # 8B - Fast code/STEM (NEW!)
ollama pull qwen2.5-coder:7b   # 7B - Fallback, well-tested
ollama pull deepseek-coder-v2:16b  # 16B - MoE alternative

# Optional: Large model if you have 64GB+ RAM
ollama pull devstral-2         # 123B - Full power
ollama pull qwen2.5-coder:32b  # 32B - Alternative
```

### **Model Selection by Task Complexity**

| Complexity | Recommended Model | Active Params | RAM Required |
|------------|-------------------|---------------|--------------|
| SIMPLE | rnj-1 | 8B | 8GB |
| MODERATE | devstral-small-2 | 24B | 16GB |
| COMPLEX | qwen2.5-coder:32b | 32B | 24GB |
| VERY_COMPLEX | devstral-2 | 123B | 64GB+ |

---

## Conclusion

The AQE Fleet is **exceptionally well-positioned** for LLM independence:
- ✅ Strong abstractions (`ILLMProvider`, `HybridRouter`)
- ✅ Advanced features ready (TRM, SONA, Q-learning)
- ✅ Clear migration path (4 phases, 24-32 weeks)
- ✅ Proven local models (Qwen 2.5, Phi-4, DeepSeek)
- ✅ Manageable risk (go/no-go gates, rollback plans)

**Recommendation:** **PROCEED** with Phase 1 MVP (6 weeks, $24k investment) to validate viability. With 90%+ quality demonstrated, the path to full independence is clear and achievable by Q2 2025.

**Next Steps:**
1. Approve Phase 1 budget and timeline
2. Provision development environment (Ollama + Qwen 2.5 Coder 7B)
3. Assign team (1 backend engineer, 1 QE engineer)
4. Kick off M1.1: Production Ollama Setup

---

**Document Version:** 1.0
**Last Updated:** 2025-12-15
**Authors:** AQE Research Team
**Status:** APPROVED FOR EXECUTION
