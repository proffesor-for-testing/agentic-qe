# RuVector Graph, GNN & DAG Crates Research

## Crates Covered
1. ruvector-graph - Full graph database (Cypher, hypergraphs, HNSW, RAFT, federation)
2. ruvector-graph-wasm / ruvector-graph-node - Browser/Node.js bindings
3. ruvector-gnn - GNN on HNSW topology with EWC++ and 5-level compression
4. ruvector-gnn-node / ruvector-gnn-wasm - Bindings
5. ruvector-graph-transformer - 8 specialized modules with proof-gated mutation
6. ruvector-graph-transformer-node / ruvector-graph-transformer-wasm - Bindings
7. ruvector-dag - Self-learning query optimizer with 7 DAG attention mechanisms
8. ruvector-dag-wasm - 58KB minimal WASM DAG

## Key Findings

### ruvector-graph
- Full Cypher query parser built with `nom` (lexer, parser, optimizer)
- Native hyperedge support (one edge connects N nodes)
- HNSW vector search on every node via SimSIMD
- ACID transactions, RAFT consensus, sharding, gRPC federation
- Roaring bitmap indexes for microsecond-scale label filtering
- Graph Neural Engine and RAG engine built in

### ruvector-gnn
- GNN message passing directly on HNSW graph topology (index IS the graph)
- 5-level tensor compression: None/Half/PQ8/PQ4/Binary (by access frequency)
- EWC++ for preventing catastrophic forgetting
- Replay buffer with reservoir sampling
- Memory-mapped weight storage for models larger than RAM

### ruvector-graph-transformer (8 Modules)
1. **Proof-Gated Mutation**: Every mutation requires formal proof. 82-byte attestation receipts.
2. **Sublinear Attention**: O(n log n) via LSH-bucket, PPR-sampled, spectral sparsification
3. **Verified Training**: Delta-apply rollback with BLAKE3 certificates
4. **Physics-Informed**: Hamiltonian graph networks, symplectic leapfrog, gauge equivariance
5. **Biological**: Spiking attention, Hebbian/STDP learning, dendritic branching
6. **Self-Organizing**: Morphogenetic fields, L-system graph growth
7. **Manifold**: Product manifold S^n x H^m x R^k, Riemannian Adam, geodesic message passing
8. **Temporal-Causal**: Causal masking, Granger causality extraction
9. **Economic**: Nash equilibrium attention, Shapley attribution

### ruvector-dag
- 7 DAG attention mechanisms with dynamic policy-driven selection
- SONA engine with MicroLoRA adaptation in <100us per query
- O(n^0.12) subpolynomial MinCut for bottleneck detection
- Self-healing: Z-score anomaly detection, predictive intervention
- QuDAG: Quantum-resistant distributed pattern learning with ML-KEM/ML-DSA
- Convergence demo: 847ms -> 156ms (81.6% improvement) over 10 runs

## AQE Integration Opportunities
1. GNN on HNSW for +12.4% better pattern recognition (already referenced in AQE)
2. Proof-gated mutations for tamper-evident quality gate decisions
3. DAG self-learning for AQE's autonomous query optimization
4. Granger causality to identify causal relationships between test failures
5. Nash equilibrium attention for multi-agent resource allocation
6. 58KB DAG WASM for AQE's Agent Booster (Tier 1)
