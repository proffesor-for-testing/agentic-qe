# RuVector Router, SONA & Utilities Research

## Crates Covered
1. ruvector-router-core - Vector DB with neural routing strategies
2. ruvector-router-cli / ruvector-router-ffi / ruvector-router-wasm - Bindings
3. ruvector-tiny-dancer-core - FastGRNN routing for 70-85% LLM cost reduction
4. ruvector-tiny-dancer-node / ruvector-tiny-dancer-wasm - Bindings
5. sona - Self-Optimizing Neural Architecture (MicroLoRA + EWC++ + ReasoningBank)
6. prime-radiant - Sheaf Laplacian coherence gate for AI safety
7. ruvector-collections - Multi-tenant collection management
8. ruvector-filter - Advanced metadata filtering (rich expression language)
9. ruvector-math - 10 advanced math modules (OT, Info Geo, TDA, Manifolds)
10. ruvector-math-wasm - Browser-side advanced math
11. ruvector-metrics - Prometheus-compatible monitoring

## Key Findings

### ruvector-tiny-dancer-core
- FastGRNN: <1MB models, 80-90% sparsity, 7.5us inference per candidate
- Multi-signal scoring: semantic similarity, recency, frequency, success rate
- Circuit breaker for graceful degradation
- Conformal prediction for uncertainty quantification
- 10 candidates routed in 8.83us, 100 in 92.86us

### sona (Self-Optimizing Neural Architecture)
- **MicroLoRA**: Rank 1-2, <100us per-request adaptation with AVX2 SIMD
- **BaseLoRA**: Rank 4-16, hourly background adaptation
- **EWC++**: Automatic task boundary detection via gradient z-score, circular buffer memory
- **ReasoningBank**: K-means++ clustering for pattern discovery, similarity search
- **Three loops**: Instant (per-request), Background (hourly), Coordination (cross-agent)
- **Federated learning**: Multi-agent aggregation support
- Golden-ratio initialization for reproducibility

### prime-radiant
- Sheaf Laplacian: E(S) = sum(w_e * ||rho_u(x_u) - rho_v(x_v)||^2)
- Compute ladder: Reflex (<1ms) -> Retrieval (~10ms) -> Heavy (~100ms) -> Human (async)
- Blake3 hash-chained witness records
- GPU acceleration (wgpu WGSL compute shaders)
- RuvLLM integration: hallucination detection via coherence energy
- SONA threshold tuning integration

### ruvector-math (10 Modules)
1. Optimal Transport: Sliced Wasserstein (1000x faster than exact), Sinkhorn, Gromov-Wasserstein
2. Information Geometry: Fisher Info, Natural Gradient (3-5x faster than Adam), K-FAC
3. Product Manifolds: E^n x H^n x S^n with geodesic distance, Frechet mean
4. Spherical Geometry: S^n operations for cyclical patterns
5. Tropical Algebra: Max-plus for piecewise linear / neural region counting
6. Tensor Networks: TT/Tucker/CP decomposition (~99% memory compression)
7. Spectral Methods: Chebyshev graph diffusion, spectral clustering
8. Persistent Homology (TDA): Vietoris-Rips, persistence diagrams, topological drift
9. Polynomial Optimization: SOS certificates for provable bounds

### ruvector-filter
- Rich expression: AND/OR/NOT, BETWEEN, IN, CONTAINS, REGEX, nested JSON access
- Filter optimization (selectivity-based reordering)
- Essential for "find similar failures WHERE env=prod AND severity>3"

## AQE Integration Opportunities
1. **SONA**: Replace JS approximations with production Rust via NAPI (already in AQE architecture)
2. **Tiny Dancer**: Neural 3-tier model routing with 70-85% cost reduction
3. **Prime Radiant**: Hallucination detection for AI-generated test artifacts
4. **Filtered search**: Hybrid vector+metadata search for practical QE queries
5. **Wasserstein drift detection**: Monitor QE metric drift over time
6. **TDA**: Detect topological changes in defect clusters
7. **Prometheus metrics**: Standard observability for AQE production deployments
