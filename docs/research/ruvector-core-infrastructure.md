# RuVector Core & Infrastructure Crates Research

## Crates Covered
1. ruvector-core - Foundational vector database engine with HNSW, quantization, SIMD, AgenticDB
2. ruvector-cli - CLI + MCP server with 30+ self-learning hooks
3. ruvector-bench - Benchmarking suite with AgenticDB workload simulation
4. ruvector-profiler - Memory/power/latency profiling with SHA-256 fingerprinting
5. rvlite - WASM-native vector DB with SQL/SPARQL/Cypher (<3MB)
6. rvf - Universal binary "cognitive container" format (24 segment types, self-booting, COW branching, quantum-safe signatures)
7. ruvector-snapshot - Point-in-time backup/restore with incremental snapshots
8. ruvector-postgres - PostgreSQL extension (143+ SQL functions, pgvector replacement, self-learning)
9. ruvector-replication - Multi-master replication with vector clocks, CRDTs, failover

## Key Findings

### ruvector-core
- Pure-Rust vector database engine, embeddable, no external service dependencies
- HNSW indexing: O(log n) ANN search, <0.5ms p50 at 1M vectors
- Three-tier quantization: Scalar (4x), Product (8-32x), Binary (32x)
- Hybrid search combining dense vector similarity with sparse BM25
- Conformal prediction for uncertainty quantification on search results
- Paged memory system (ADR-006) with 2MB pages, LRU eviction, Hot/Warm/Cold tiers
- AgenticDB module with session state, policy entries, witness logs

### rvf (RuVector Format)
- Single file = database + AI model (LoRA) + graph engine (GNN) + compute runtime (WASM/eBPF/kernel) + trust chain
- Self-booting microservice: <125ms on Firecracker
- 5.5KB WASM runtime for browser queries
- COW branching: 2.6ms branch creation, 28ns lookup
- Post-quantum dual signing (Ed25519 + ML-DSA-65)
- Already has claude-flow and agentdb adapters

### ruvector-postgres
- Drop-in pgvector replacement with 143+ SQL functions
- Local embedding generation (6 fastembed models inside PostgreSQL)
- Self-healing indexes via Stoer-Wagner mincut
- Neural DAG query optimization (59 SQL functions)
- SPARQL 1.1 (~198K triples/sec insertion)
- Multi-tenancy with RLS

## AQE Integration Opportunities
1. Replace SQLite-based HNSW with ruvector-core for 150x-12,500x faster retrieval
2. Package AQE skills as RVF cognitive containers (embeddings + LoRA + graph + runtime)
3. Use ruvector-postgres for production deployments with self-healing indexes
4. Multi-master replication for distributed AQE deployments
5. rvlite for browser-based QE dashboards (SQL+SPARQL+Cypher in <3MB WASM)
