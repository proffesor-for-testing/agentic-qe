# RuVector Attention & FPGA Crates Research

## Crates Covered
1. ruvector-attention - 46 attention mechanisms across 7 mathematical theories
2. ruvector-attention-node - NAPI-RS Node.js bindings
3. ruvector-attention-wasm - WASM bindings with CGT Sheaf Attention
4. ruvector-attention-unified-wasm - Unified 18+ mechanisms (Neural + DAG + Graph + Mamba SSM)
5. ruvector-attention-cli - CLI with compute/benchmark/serve/REPL
6. ruvector-attn-mincut - Min-cut gated attention (Dinic's algorithm)
7. ruvector-fpga-transformer - FPGA inference with coherence gating

## Key Findings

### ruvector-attention (46 Mechanisms)
- **7 Mathematical Theories**: Standard, Sparse (Flash/Linear), Geometric (Hyperbolic/Mixed Curvature), Graph (GAT/RoPE), MoE, Optimal Transport, PDE/Diffusion
- **Optimal Transport Attention**: Sliced Wasserstein with centroid clustering for O(M) transport
- **Mixed Curvature Fused**: Product manifold E^e x H^h x S^s with per-component quantization (8/5/5-bit)
- **Topology-Gated**: Adaptive 3-mode policy (Stable/Cautious/Freeze) with hysteresis
- **Unified Diagnostics**: Auto-recommends best attention mode based on data characteristics

### ruvector-attn-mincut
- Uses Dinic's max-flow to prune low-value attention edges
- Temporal hysteresis prevents gate mask oscillation
- SHA-256 witness chain for deterministic verification
- 15-40% KV-cache reduction, 10-25% RSS reduction, <1% coherence degradation

### ruvector-fpga-transformer
- 3 compute classes: Reflex (1-2 layers), Associative (4-6), Deliberative (all)
- Coherence gating with GateDecision: RanFull/EarlyExit/Skipped
- Fixed-point Q15 arithmetic for deterministic FPGA paths
- Ed25519 signed model artifacts
- 4 backends: NativeSim, WasmSim, FpgaDaemon (TCP), FpgaPCIe (mmap)

### ruvector-attention-unified-wasm
- 18+ mechanisms in single WASM package: 7 Neural + 7 DAG + 3 Graph + Mamba SSM
- Mamba SSM: O(n) selective state space model with Hybrid Mamba-Attention (70/30 mix)
- DAG attention: Topological, Causal Cone, Critical Path, MinCut-Gated, Hierarchical Lorentz, Parallel Branch, Temporal BTSP

## AQE Integration Opportunities
1. FPGA Reflex/Associative/Deliberative maps 1:1 to AQE's 3-Tier Model Routing (ADR-026)
2. CGT Sheaf Attention for hallucination detection in agent outputs
3. DAG attention for optimizing test execution ordering (Critical Path, Parallel Branch)
4. Min-cut gating to reduce compute costs by 15-40%
5. Mamba SSM for O(n) long test sequence processing
6. Native-speed attention via ruvector-attention-node for AQE's TypeScript runtime
