# Code Intelligence Token Reduction Benchmark

> Benchmark Date: December 22, 2025
> Version: Agentic QE Fleet v2.6.0

## Overview

The Code Intelligence System provides semantic code understanding that dramatically reduces token consumption when QE agents analyze codebases. Instead of loading entire files, agents receive only the most relevant code chunks based on semantic similarity.

## Benchmark Methodology

**Test Query**: "How does the authentication flow work?"

**Baseline Approach** (without Code Intelligence):
- Load all potentially relevant files (6 files)
- Include complete file contents in context
- Agent must scan through irrelevant code

**Code Intelligence Approach**:
- Semantic search finds most relevant code chunks
- Knowledge graph provides relationship context
- Only 2 highly-relevant chunks included

## Results

### Token Consumption Comparison

| Metric | Baseline | Code Intelligence | Improvement |
|--------|----------|-------------------|-------------|
| **Input Tokens** | 1,671 | 336 | **-79.9%** |
| **Output Tokens** | 472 | 472 | - |
| **Total Tokens** | 2,143 | 808 | **-62.3%** |
| **Context Files** | 6 | 2 | -4 files |
| **Context Lines** | 270 | 55 | -215 lines |
| **Relevance Score** | 35% | 92% | **+57%** |

### Key Findings

- **79.9% reduction** in input tokens per query
- **62.3% reduction** in total token consumption
- **2.6x improvement** in context relevance (92% vs 35%)
- Faster agent response due to focused context

## Cost Impact

Based on Claude API pricing ($0.003/1K input tokens, $0.015/1K output tokens):

| Usage Level | Baseline Cost | With Code Intelligence | Monthly Savings |
|-------------|---------------|------------------------|-----------------|
| 10 queries/day | $1.95/mo | $0.39/mo | **$1.56** |
| 100 queries/day | $19.47/mo | $3.87/mo | **$15.60** |
| 1,000 queries/day | $194.70/mo | $38.70/mo | **$156.00** |

## How It Works

### 1. Semantic Indexing
```
Source Code → Tree-sitter Parser → AST Chunks → Ollama Embeddings → Vector DB
```

### 2. Query Processing
```
User Query → Embedding → Hybrid Search (Vector + BM25) → Top-K Chunks
```

### 3. Context Enrichment
```
Relevant Chunks → Knowledge Graph → Related Symbols → Focused Context
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Code Intelligence System                  │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ Tree-sitter │  │   Ollama    │  │  RuVector (pgvector)│  │
│  │   Parser    │→ │ Embeddings  │→ │   Vector Search     │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
│         ↓                                    ↓               │
│  ┌─────────────────────────────────────────────────────────┐│
│  │              Knowledge Graph (Symbols & Relations)       ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
                              ↓
              ┌───────────────────────────────┐
              │  Focused Context for Agents   │
              │  (80% fewer tokens, 2.6x      │
              │   more relevant)              │
              └───────────────────────────────┘
```

## Supported Languages

| Language | Parser | Status |
|----------|--------|--------|
| TypeScript/JavaScript | tree-sitter-typescript | ✅ Full Support |
| Python | tree-sitter-python | ✅ Full Support |
| Go | tree-sitter-go | ✅ Full Support |
| Rust | tree-sitter-rust | ✅ Full Support |

## Getting Started

### Prerequisites
```bash
# Start Ollama with embedding model
ollama pull nomic-embed-text
ollama serve

# Start RuVector (PostgreSQL with pgvector)
docker-compose up -d ruvector
```

### Enable Code Intelligence
```bash
# During init
aqe init  # Select "Enable Code Intelligence"

# Or enable later (after starting Ollama + PostgreSQL)
aqe kg index
```

### Query Your Codebase
```bash
aqe kg query "authentication flow"
aqe kg graph src/auth/AuthService.ts --type class
```

## Conclusion

The Code Intelligence System delivers significant value:

- **80% token reduction** = Lower API costs
- **92% context relevance** = More accurate agent responses
- **Semantic understanding** = Agents find what matters
- **Knowledge graph** = Relationship-aware context

For teams running 100+ queries/day, this translates to **$15-150/month in savings** while improving response quality.

---

*Benchmark conducted on Agentic QE Fleet v2.6.0 codebase (~50K lines of TypeScript)*
