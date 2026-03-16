# RuVector CNN, Sparse Inference & Domain Expansion Research

## Crates Covered
1. ruvector-cnn - Pure-Rust MobileNet-V3 feature extraction with SIMD/INT8
2. ruvector-cnn-wasm - Browser-side image embedding
3. ruvector-sparse-inference - PowerInfer-style sparse inference (2x-52x speedups)
4. ruvector-sparse-inference-wasm - Browser GGUF model inference
5. ruvector-domain-expansion - Cross-domain transfer learning engine
6. ruvector-domain-expansion-wasm - Browser transfer learning

## Key Findings

### ruvector-cnn
- MobileNet-V3 Small (576d) and Large (960d) embeddings
- SIMD backends: AVX2, NEON, WASM SIMD128, scalar
- INT8 quantization kernels per architecture
- Winograd fast convolutions
- Contrastive learning: InfoNCE (SimCLR) + Triplet loss
- Pure Rust, no Python/GPU/OpenCV dependency

### ruvector-sparse-inference
- Only computes active neurons (~10% handle ~90% of activations)
- Low-rank predictor (P*Q factorization) in O(r*d) time
- **Pi Integration System**: Pi-derived scale factors for avoiding quantization artifacts
- **Precision Lanes**: 3-bit (reflex), 5-bit (streaming), 7-bit (reasoning), Float (training)
- Graduation policies: signals move UP lanes on novelty, DOWN on stability
- W2 transpose: 83% latency reduction via contiguous memory access
- Performance: 10% active = 52x faster, 30% = 18x, 50% = 10x

### ruvector-domain-expansion
- Meta Thompson Sampling with Beta priors across context buckets
- Cross-domain transfer: extract posteriors -> sqrt-dampening -> seed target -> verify
- Transfer verification gate: target improved AND source not regressed
- Population-based policy search: 8 PolicyKernel variants with elite selection + crossover
- Curiosity-driven exploration via UCB bonus
- Regret tracking: sublinear growth = learning, linear = stagnation
- Pareto front tracking for multi-objective optimization
- 3 built-in domains: Rust Synthesis, Structured Planning, Tool Orchestration

## AQE Integration Opportunities
1. **Visual testing**: CNN embeddings for screenshot comparison without pixel matching
2. **Sparse inference**: 2-52x faster local embedding/LLM operations
3. **Precision lanes**: Map 3/5/7-bit to AQE's Tier 1/2/3 model routing
4. **Cross-domain transfer**: Train on one test domain (API), transfer to another (UI)
5. **Population search**: Evolve QE agent configurations through PolicyKernel system
6. **Regret tracking**: Measure whether AQE agents are actually learning over time
