# ruvllm Integration - Quick Reference Card

**Version:** 1.0.0 | **Status:** Planning | **Target:** v2.2.0

---

## 🎯 Project Goals (1-Minute Overview)

| Goal | Description | Impact |
|------|-------------|--------|
| **G1: LLM Abstraction** | Decouple agents from specific providers | Pluggable backends |
| **G2: Local Inference** | Enable ruvllm for offline capability | 80% requests local |
| **G3: Hybrid Routing** | Smart local/cloud selection | Cost + performance |
| **G4: Privacy Mode** | Guarantee no external calls | GDPR/HIPAA compliance |
| **G5: CI/CD Optimization** | 3x faster pipelines | Developer experience |

---

## 📅 Timeline (8 Weeks)

```
Week 1-2: Foundation → LLM abstraction, BaseAgent refactor
Week 3-4: Core       → ruvllm provider, hybrid routing
Week 5-6: Optimize   → Performance, privacy mode
Week 7:   CI/CD      → Docker, GitHub Actions
Week 8:   QA         → Validation, release prep
```

---

## 🔑 Key Deliverables

### Phase 1 (Weeks 1-2)
- ✅ `ILLMProvider` interface
- ✅ All 18 agents use abstraction
- ✅ Can switch providers via config

### Phase 2 (Weeks 3-4)
- ✅ `RuvllmProvider` implementation
- ✅ Qwen2.5-Coder-7B model support
- ✅ Hybrid routing: 80% local, 20% cloud

### Phase 3 (Weeks 5-6)
- ✅ Model warm pool (<5s cold start)
- ✅ Batch inference (20 tests/min)
- ✅ Privacy mode (strict/balanced/off)

### Phase 4 (Week 7)
- ✅ Docker image (<4GB)
- ✅ CI pipeline 3x faster

### Phase 5 (Week 8)
- ✅ A/B testing (local vs cloud)
- ✅ Release v2.2.0

---

## 💰 Cost Impact

### Break-Even Point
- **Low usage** (<1M tokens/day): Cloud cheaper
- **Medium usage** (1-5M tokens/day): Hybrid competitive
- **High usage** (>5M tokens/day): **63% savings** ($2,902 → $1,080/month)

### ROI Calculator
```
Monthly savings = (Cloud cost - Hybrid cost)
Cloud cost = tokens/month × mix × price
Hybrid cost = $500 (infra) + 20% × Cloud cost

Example (2.7B tokens/month):
Cloud: $2,902
Hybrid: $1,080
Savings: $1,822 (63%)
```

---

## 🛠️ Technical Architecture

```
Agents (18)
    ↓
ILLMProvider interface
    ↓
HybridModelRouter
    ├─→ RuvllmProvider (local, 80%)
    └─→ AnthropicProvider (cloud, 20%)
```

---

## 📊 Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Inference latency | 500ms | <2s |
| Throughput | 10/min | 20+/min |
| Cold start | N/A | <5s |
| CI speed | 120s | <40s |
| Cost (high-vol) | $2,902 | $1,080 |
| Test coverage | 100% | 90%+ |
| Opt-in rate | N/A | 30% |

---

## 🔒 Privacy Mode

### Configuration
```yaml
privacy:
  mode: strict         # strict | balanced | off
  allowedProviders: [ruvllm]
  auditLog: true
  blockExternalCalls: true
```

### Modes
- **Strict:** Local-only, no external calls
- **Balanced:** Prefer local, fallback to cloud
- **Off:** Cloud-first (current behavior)

---

## 🚀 Quick Start (Post-Launch)

### Install
```bash
npm install -g agentic-qe@2.2.0
```

### Configure Local Inference
```bash
# Download model (one-time)
aqe model download Qwen2.5-Coder-7B-Instruct-Q5_K_M

# Enable hybrid mode
aqe config set inference.mode hybrid

# Generate tests with local inference
aqe generate --provider ruvllm --files src/**/*.ts
```

### Enable Privacy Mode
```bash
aqe config set privacy.mode strict
aqe generate --files src/  # Guaranteed local-only
```

---

## 🐛 Troubleshooting

### Common Issues

**Issue:** Model download fails
```bash
# Solution: Specify custom cache dir
export RUVLLM_CACHE=/path/to/cache
aqe model download <model-name>
```

**Issue:** GPU not detected
```bash
# Solution: Verify CUDA/Metal
nvidia-smi  # Linux
system_profiler SPDisplaysDataType  # macOS

# Force CPU mode
aqe config set ruvllm.gpuLayers 0
```

**Issue:** Local inference too slow
```bash
# Solution: Use smaller model
aqe model download Phi-3-Mini-4K-Instruct  # 2.3GB vs 5.6GB
aqe config set ruvllm.model Phi-3-Mini-4K-Instruct
```

**Issue:** Out of memory (OOM)
```bash
# Solution: Reduce context length
aqe config set ruvllm.contextLength 4096  # Default: 8192
```

---

## 📚 Documentation Links

### User Guides
- [Getting Started with Local Inference](../guides/local-inference.md)
- [Privacy Mode Guide](../guides/privacy-mode.md)
- [CI/CD Integration](../deployment/docker.md)

### Technical Docs
- [LLM Provider Architecture](../architecture/llm-providers.md)
- [Hybrid Routing Design](../architecture/hybrid-routing.md)
- [Migration Guide](../migration/llm-providers.md)

### Planning Docs
- [Executive Summary](./ruvllm-integration-executive-summary.md)
- [Full GOAP Plan](./ruvllm-integration-goap-plan.md)
- [Visual Roadmap](./ruvllm-integration-roadmap.md)

---

## 🧪 Testing Commands

### Unit Tests
```bash
npm run test:unit -- src/core/llm
```

### Integration Tests
```bash
npm run test:integration -- tests/integration/llm
```

### Benchmark
```bash
npm run test:benchmark -- benchmarks/local-vs-cloud.ts
```

### A/B Test
```bash
aqe test compare --local ruvllm --cloud anthropic --files src/
```

---

## 🔥 CI/CD Example

### GitHub Actions
```yaml
name: Tests with Local Inference

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Pull ruvllm image
        run: docker pull ghcr.io/agentic-qe/ruvllm:2.2.0

      - name: Generate tests
        run: |
          aqe generate \
            --provider ruvllm \
            --model Qwen2.5-Coder-7B-Instruct-Q5_K_M \
            --files src/**/*.ts

      - name: Run tests
        run: npm test
```

---

## 🎛️ Configuration Reference

### Environment Variables
```bash
# Model configuration
export RUVLLM_MODEL=Qwen2.5-Coder-7B-Instruct-Q5_K_M
export RUVLLM_CACHE=/path/to/models
export RUVLLM_GPU_LAYERS=-1  # -1 = auto-detect

# Privacy mode
export AQE_PRIVACY_MODE=strict
export AQE_AUDIT_LOG=true

# Performance tuning
export RUVLLM_CONTEXT_LENGTH=8192
export RUVLLM_BATCH_SIZE=4
export RUVLLM_THREADS=8
```

### Config File (.aqe/config.yml)
```yaml
inference:
  mode: hybrid  # local | cloud | hybrid
  preferLocal: true
  fallbackToCloud: true

ruvllm:
  model: Qwen2.5-Coder-7B-Instruct-Q5_K_M
  gpuLayers: -1  # Auto-detect
  contextLength: 8192
  temperature: 0.7
  maxTokens: 2048

privacy:
  mode: strict  # strict | balanced | off
  allowedProviders: [ruvllm]
  auditLog: true
  blockExternalCalls: true

routing:
  rules:
    - name: privacy-code
      condition: privacy === 'strict'
      action: route-to-local
      priority: 100

    - name: high-complexity
      condition: complexity > 0.8
      action: route-to-cloud
      priority: 80

    - name: cost-optimization
      condition: taskType === 'test-generation'
      action: prefer-local
      priority: 50
```

---

## 🚦 Status Codes

### CLI Exit Codes
- `0`: Success
- `1`: General error
- `2`: Configuration error
- `3`: Model not found
- `4`: Inference error (fallback to cloud if enabled)
- `5`: Privacy violation (strict mode)

---

## 📞 Support

**Issues:** https://github.com/proffesor-for-testing/agentic-qe/issues
**Discussions:** https://github.com/proffesor-for-testing/agentic-qe/discussions
**Slack:** `#aqe-ruvllm-integration`

---

## 🏆 Key Features (Marketing)

### For Developers
- ✅ **Offline Development:** Work on flights, remote locations
- ✅ **Faster Feedback:** 3x faster CI pipelines
- ✅ **No API Keys:** Simplified local development

### For Enterprises
- ✅ **Compliance:** GDPR, HIPAA, SOC2 via privacy mode
- ✅ **Cost Savings:** 63% reduction for high-volume users
- ✅ **Air-Gapped:** Deploy in isolated environments

### For Open Source
- ✅ **Sustainability:** No ongoing cloud costs
- ✅ **Community:** Enable broader participation
- ✅ **Privacy:** Code stays on contributor machines

---

## 🔮 Future Enhancements (v2.3.0+)

1. **Custom Model Fine-Tuning**
   - Train on your codebase for better accuracy
   - Enterprise tier feature

2. **Distributed Inference**
   - Cluster of GPU servers for scale
   - Kubernetes operator

3. **Model Marketplace**
   - Community-trained models
   - Domain-specific models (React, Python, etc.)

4. **Edge Deployment**
   - Run on developer laptops
   - Mobile device support (iOS/Android)

5. **Federated Learning**
   - Learn from distributed deployments
   - Privacy-preserving model updates

---

## 📋 Checklist for New Users

### Getting Started
- [ ] Install `agentic-qe@2.2.0`
- [ ] Download model: `aqe model download Qwen2.5-Coder-7B-Instruct-Q5_K_M`
- [ ] Configure hybrid mode: `aqe config set inference.mode hybrid`
- [ ] Test generation: `aqe generate --provider ruvllm --files src/`
- [ ] Validate: `npm test`

### For Enterprise (Privacy Mode)
- [ ] Review privacy policy requirements (GDPR, HIPAA, etc.)
- [ ] Enable strict mode: `aqe config set privacy.mode strict`
- [ ] Configure audit logging: `aqe config set privacy.auditLog true`
- [ ] Test with sample code
- [ ] Generate compliance report: `aqe privacy report`
- [ ] Review with legal/compliance team

### For CI/CD
- [ ] Build Docker image: `docker build -t aqe-local:latest .`
- [ ] Update GitHub Actions workflow
- [ ] Test in CI: Run a pilot pipeline
- [ ] Benchmark: Compare speed (baseline vs local)
- [ ] Rollout: Enable for all pipelines

---

## 🎉 Celebration Milestones

- [ ] Week 2: LLM abstraction complete 🎊
- [ ] Week 4: Local inference working 🚀
- [ ] Week 6: Performance targets met ⚡
- [ ] Week 8: Release v2.2.0 shipped 🎉
- [ ] Month 3: 30% adoption reached 🏆

---

**Print this card and keep it handy!**

**Last Updated:** 2025-12-04
**Version:** 1.0.0
