# RuVector Quantum Computing & Solver Crates Research

## Crates Covered
1. ruqu-core - Quantum circuit simulator (5 backends, SIMD, QEC)
2. ruqu-algorithms - VQE, Grover, QAOA, Surface Code
3. ruqu-exotic - Quantum-classical hybrid: reasoning QEC, swarm interference
4. ruqu-wasm - Browser quantum simulation (25 qubits, 180KB)
5. ruQu - Coherence gating platform (256-tile fabric, PERMIT/DEFER/DENY)
6. ruvector-solver - 7 sublinear sparse algorithms with auto-routing
7. ruvector-solver-node / ruvector-solver-wasm - Bindings
8. ruvector-mincut - Dynamic minimum cut (arXiv:2512.13105, O(n^0.12))
9. ruvector-mincut-node / ruvector-mincut-wasm - Bindings
10. ruvector-mincut-gated-transformer - Lambda-controlled transformer inference
11. ruvector-mincut-gated-transformer-wasm - Browser coherence-gated inference

## Key Findings

### ruqu-core
- 5 backends: StateVector (exact, 32 qubits), Stabilizer (millions of qubits), Clifford+T, TensorNetwork (MPS), Hardware profiles
- Cost-model planner auto-routes circuits to optimal backend
- Hybrid decomposition: partition by entanglement structure for multi-backend execution
- Subpolynomial QEC decoders: O(d^{2-epsilon} * polylog(d))

### ruqu-exotic (Most Novel for AQE)
- **Reasoning QEC**: Quantum error correction applied to AI reasoning chains
- **Swarm Interference**: Quantum-inspired multi-agent consensus via constructive/destructive interference
- **Interference Search**: Amplitude-based vector similarity (fundamentally different from cosine)
- **Reversible Memory**: Quantum uncomputation for perfect undo/redo
- **Memory Decay**: T1/T2 decay modeling for temporal confidence in cached results

### ruvector-solver
- 7 algorithms: Neumann, CG, Forward Push PPR, Backward Push, Hybrid Random Walk, TRUE, BMSSP Multigrid
- SolverRouter auto-selects based on matrix sparsity profile
- AVX2 SIMD SpMV with fused residual+norm (3x less memory traffic)
- Arena allocator for zero per-iteration heap allocation

### ruvector-mincut (Dec 2025 Breakthrough)
- First production implementation of arXiv:2512.13105
- O(n^0.12) amortized update time (verified)
- 448+ tests passing
- Advanced: Link-Cut Trees, Euler Tour Trees, graph sparsification
- 256-core agentic chip support (6.7KB/core)
- SNN module: temporal attractors, strange loops, causal discovery

### ruvector-mincut-gated-transformer
- Lambda (min-cut) as first-class transformer control signal
- 4-tier system: Normal (1x) -> Reduced (2-3x) -> Safe (5-10x) -> Skip (50-200x)
- Spike-driven scheduling: 87x energy efficiency
- EAGLE-3 speculative decoding: 3-5x speedup
- FlashAttention tiling: O(n) memory
- KV cache INT4 (RotateKV): 8-16x compression
- Every inference produces explainable witness

## AQE Integration Opportunities
1. **Reasoning QEC**: Validate and correct AI agent reasoning chains
2. **Swarm interference**: Better multi-agent consensus mechanisms
3. **MinCut monitoring**: Real-time agent network health via O(n^0.12) updates
4. **PageRank prioritization**: Rank test cases/agents by graph importance
5. **Lambda-gated execution**: 4-tier compute allocation based on system health
6. **Memory decay modeling**: Confidence decay for cached test results over time
