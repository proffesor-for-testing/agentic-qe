# RuVector Complementary Tools - Executive Summary

**Date:** December 21, 2025
**Full Report:** [ruvector-complementary-tools-2025.md](./ruvector-complementary-tools-2025.md)

---

## TL;DR - Top 5 Tools to Adopt

1. **Tree-sitter** - 36x faster AST parsing, 40+ languages, incremental updates
2. **Apache AGE** - Native PostgreSQL graph extension (Cypher queries)
3. **nomic-embed-text** - Local embeddings, 8192 token context, 86% accuracy
4. **LlamaIndex** - RAG framework, 40% faster retrieval than LangChain
5. **Mermaid.js** - Auto-generate diagrams, 71k GitHub stars

---

## Architecture Evolution Path

```
Current:  RuVector + pgvector + Serena + ts-morph
         ↓
Phase 1:  + Tree-sitter + Apache AGE + nomic-embed + AST chunking
         ↓
Phase 2:  + LlamaIndex + Hybrid Search (BM25+Vector) + Semgrep + Mermaid
         ↓
Phase 3:  + LangChain agents + D3.js dashboard + IDE integration
```

---

## Key Findings by Category

### 1. Code Intelligence & Understanding

| Tool | Fit | Key Metric | License | Priority |
|------|-----|------------|---------|----------|
| **Tree-sitter** | 🟢 Excellent | 36x faster parsing | MIT | **P1** |
| Semgrep | 🟢 Good | Zero false positives | LGPL | P2 |
| SWC | 🟡 Moderate | 70x faster (JS/TS only) | Apache 2.0 | P2 |
| CodeQL | 🟡 Moderate | Deep semantic analysis | MIT | P3 |

**Recommendation:** Adopt Tree-sitter immediately for multi-language AST parsing alongside ts-morph.

---

### 2. Knowledge Graph & Graph Databases

| Tool | Fit | Key Metric | License | Priority |
|------|-----|------------|---------|----------|
| **Apache AGE** | 🟢 Excellent | PostgreSQL native | Apache 2.0 | **P1** |
| DuckPGQ | 🔴 Low | Adds complexity | MIT | Skip |
| TypeDB | 🟡 Moderate | Advanced reasoning | AGPL | P3 |
| Oxigraph | 🔴 Low | RDF/SPARQL overhead | MIT | Skip |

**Recommendation:** Apache AGE is perfect - extends existing PostgreSQL with Cypher queries, no new infrastructure.

---

### 3. Embedding & Vector Models

| Model | Context | Accuracy | Deployment | Priority |
|-------|---------|----------|------------|----------|
| **nomic-embed-text** | 8,192 tokens | 86.2% | Local (free) | **P1** |
| BGE-M3 | 8,192 tokens | Balanced | Local | Alt |
| all-MiniLM | 256 tokens | -5% accuracy | Local | Fallback |
| Voyage Code-3 | N/A | 97.3% MRR | API (paid) | Optional |

**Recommendation:** nomic-embed-text offers best balance of performance, context length, and local deployment.

---

### 4. RAG Frameworks

| Framework | Strength | Performance | License | Priority |
|-----------|----------|-------------|---------|----------|
| **LlamaIndex** | Retrieval-focused | 40% faster | MIT | **P2** |
| LangChain | Workflows/agents | 3x faster dev | MIT | P3 |
| Continue | IDE integration | Good patterns | Apache 2.0 | Reference |

**Recommendation:** LlamaIndex for code retrieval, LangChain later if building multi-agent workflows.

---

### 5. Essential Techniques

#### AST-Based Chunking ⭐ CRITICAL
- **Impact:** +5.5 points on RepoEval, +4.3 on CrossCodeEval
- **Why:** Preserves code structure vs naive line-based splitting
- **Implementation:** Use Tree-sitter to chunk by functions/classes (256-512 tokens)
- **Priority:** **P1** - Essential for quality embeddings

#### Hybrid Search (BM25 + Vector) ⭐ CRITICAL
- **Impact:** 40% accuracy improvement over vector-only
- **Why:** BM25 handles exact matches, vector handles semantics
- **Fusion:** Reciprocal Rank Fusion (RRF) or weighted scoring
- **Priority:** **P2** - Significant retrieval boost

---

## Implementation Timeline

### Phase 1: Foundation (Months 1-2)
**Goal:** Multi-language support + graph relationships + quality embeddings

```yaml
Week 1-2:
  - Tree-sitter integration (TypeScript, Python, Go)
  - Apache AGE extension deployment
  - nomic-embed-text local setup (Ollama)

Week 3-4:
  - AST-based chunking pipeline
  - Git-based change detection workflow
  - Graph schema design (Files, Classes, Methods, Relationships)

Week 5-8:
  - Incremental indexing implementation
  - Vector + graph integration
  - Query optimization
```

**Success Metrics:**
- Parse 40+ languages incrementally (<10s updates)
- Graph queries in <100ms (3-hop traversal)
- Retrieval MRR >75%

---

### Phase 2: Enhancement (Months 3-4)
**Goal:** Production-ready RAG + hybrid search + visualization

```yaml
Week 9-12:
  - LlamaIndex RAG framework integration
  - Hybrid search (BM25 + vector) with RRF
  - Semgrep for code quality graph enrichment
  - e-dant/watcher for local development

Week 13-16:
  - Mermaid.js diagram auto-generation
  - Performance tuning (query <50ms p95)
  - Documentation and examples
```

**Success Metrics:**
- Retrieval MRR >85%
- Query latency <10ms (p95)
- Auto-generated diagrams in GitHub/GitLab

---

### Phase 3: Advanced (Months 5-6)
**Goal:** Interactive dashboard + IDE integration + agents

```yaml
Week 17-20:
  - D3.js interactive graph explorer
  - LangChain multi-agent workflows
  - VS Code extension (Continue patterns)

Week 21-24:
  - CodeQL deep security analysis
  - Advanced reasoning (optional: TypeDB)
  - Production scaling and monitoring
```

**Success Metrics:**
- 50% reduction in LLM context tokens
- 20% faster code navigation
- 30% faster developer onboarding

---

## Cost & Risk Analysis

### Costs (vs Managed Services)

| Component | Cost | Savings vs Cloud |
|-----------|------|------------------|
| Embeddings (nomic-embed) | **$0** | $0.0001/token = ~$1000/month |
| Vector DB (pgvector) | **Existing infra** | ~$500/month (Pinecone) |
| Graph DB (Apache AGE) | **$0** | ~$800/month (Neo4j) |
| **Total Savings** | | **~$2,300/month** |

**Note:** Costs are infrastructure-only, using existing PostgreSQL.

---

### Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| **pgvector scale limits** | High | Monitor at 1M, 5M, 10M vectors; Qdrant fallback |
| **Apache AGE maturity** | Medium | v1.1.0+ stable; thorough testing; SQL fallback |
| **Multi-language complexity** | High | Start with top 5 languages, expand gradually |
| **Embedding model drift** | Low | Pin versions; version embeddings table |

---

## Technology Stack Summary

```yaml
Core (Phase 1):
  AST Parsing:
    - Tree-sitter (multi-language, incremental)
    - ts-morph (TypeScript deep analysis)
    - Serena (LSP symbols)

  Database:
    - PostgreSQL 16+
    - pgvector extension (vectors)
    - Apache AGE extension (graphs)

  Embeddings:
    - nomic-embed-text (local, 8192 context)

  Chunking:
    - AST-based with cAST algorithm

  Indexing:
    - Git-based (tj-actions/changed-files)
    - e-dant/watcher (local dev)

Enhancement (Phase 2):
  RAG: LlamaIndex
  Search: Hybrid (BM25 + vector, RRF)
  Analysis: Semgrep (SAST)
  Visualization: Mermaid.js
  Monorepo: Nx (optional)

Advanced (Phase 3):
  Agents: LangChain
  Security: CodeQL
  Dashboard: D3.js
  Reasoning: TypeDB (optional)
```

---

## Quick Start (Week 1)

### 1. Install Apache AGE
```sql
CREATE EXTENSION age;
SET search_path = ag_catalog, "$user", public;
SELECT create_graph('code_graph');
```

### 2. Deploy nomic-embed-text
```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Pull model
ollama pull nomic-embed-text

# Test
ollama embeddings nomic-embed-text "function login() { ... }"
```

### 3. Set up Tree-sitter
```bash
npm install tree-sitter tree-sitter-typescript tree-sitter-python tree-sitter-go
```

```javascript
// Example usage
import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';

const parser = new Parser();
parser.setLanguage(TypeScript.typescript);
const tree = parser.parse(sourceCode);
```

### 4. Git-based change detection
```yaml
# .github/workflows/index-code.yml
- uses: tj-actions/changed-files@v40
  with:
    files: 'src/**/*.{ts,js,py}'
```

---

## Key Performance Targets

| Metric | Target | Why It Matters |
|--------|--------|----------------|
| **Query Latency** | <10ms (p95) | Real-time code search |
| **Retrieval Accuracy** | >85% MRR | Relevant results in top 5 |
| **Indexing Speed** | <2 min (1K files incremental) | Developer productivity |
| **Graph Traversal** | <50ms (3 hops) | Fast relationship queries |
| **Context Reduction** | 50% fewer tokens | Lower LLM costs |

---

## Why These Tools?

### Tree-sitter
- ✅ **36x faster** than traditional parsers
- ✅ **40+ languages** with community grammars
- ✅ **Incremental parsing** for real-time analysis
- ✅ **Error resilient** - works with incomplete code
- ✅ **Production-ready** - used by GitHub, Neovim

### Apache AGE
- ✅ **PostgreSQL native** - no new infrastructure
- ✅ **Cypher queries** for powerful graph traversal
- ✅ **ACID transactions** - reliable and consistent
- ✅ **Multi-model** - SQL + graph in one query
- ✅ **Cloud support** - Azure PostgreSQL compatible

### nomic-embed-text
- ✅ **8,192 token context** - handles large code files
- ✅ **86.2% accuracy** - best open-source model
- ✅ **Local deployment** - zero API costs, full privacy
- ✅ **Matryoshka architecture** - flexible dimensions
- ✅ **MoE model** - state-of-the-art embedding technology

### LlamaIndex
- ✅ **40% faster retrieval** than LangChain
- ✅ **150+ data connectors** - Git, GitHub, file systems
- ✅ **35% accuracy boost** in 2025 updates
- ✅ **Code-focused** - designed for document retrieval
- ✅ **Built-in observability** - evaluation tools included

### Mermaid.js
- ✅ **71k+ GitHub stars** - most popular diagram-as-code
- ✅ **Native GitHub/GitLab** - renders in markdown
- ✅ **47% adoption increase** since 2021
- ✅ **2.4x better docs** - teams using it are more successful
- ✅ **Auto-generation** - create from graph data

---

## Next Actions

### This Week
1. Review full research report: `docs/research/ruvector-complementary-tools-2025.md`
2. Schedule architecture review meeting
3. Provision PostgreSQL with AGE extension
4. Set up local nomic-embed-text deployment

### Next Week
1. POC: Tree-sitter integration for TypeScript
2. POC: Apache AGE graph schema design
3. POC: AST-based chunking pipeline
4. Document integration decisions

### Next Month
1. Implement Phase 1 (Foundation) components
2. Benchmark query performance
3. Create developer documentation
4. Plan Phase 2 enhancements

---

## Questions & Answers

**Q: Why not use a dedicated vector database like Qdrant or Milvus?**
A: pgvector on PostgreSQL provides sufficient performance for <10M vectors, uses existing infrastructure, enables SQL joins with graph data, and avoids operational complexity. Plan migration only if hitting scale limits.

**Q: Why local embeddings instead of OpenAI API?**
A: nomic-embed-text offers 8192 token context (vs 8191 for OpenAI), eliminates API costs (~$2k/month savings), ensures full privacy, and performs competitively (86% accuracy).

**Q: Can we use both ts-morph and Tree-sitter?**
A: Yes! Use ts-morph for TypeScript-specific deep analysis (type checking, refactoring) and Tree-sitter for fast multi-language parsing and incremental updates.

**Q: What if Apache AGE has issues?**
A: v1.1.0+ is production-ready with Azure support. Fallback: Pure SQL with recursive CTEs for graph queries (slower but works).

**Q: How does this reduce LLM costs?**
A: Better retrieval means sending only relevant code to LLM context (50% reduction), hybrid search improves accuracy (fewer retries), AST chunking preserves semantics (better understanding).

---

## Resources

- **Full Research Report:** [ruvector-complementary-tools-2025.md](./ruvector-complementary-tools-2025.md)
- **Apache AGE Docs:** https://age.apache.org/
- **Tree-sitter Guide:** https://tree-sitter.github.io/
- **nomic-embed-text:** https://huggingface.co/nomic-ai/nomic-embed-text-v2
- **LlamaIndex Docs:** https://docs.llamaindex.ai/
- **Mermaid.js:** https://mermaid.js.org/

---

**Report Version:** 1.0
**Status:** Ready for architecture review
**Researcher:** Agentic QE Research Specialist
**Date:** December 21, 2025
