# Project Knowledge Graph: Executive Summary
## Strategic Initiative to Extend RuVector for Code Intelligence

**Version:** 1.0.0
**Date:** 2025-12-21
**Status:** Proposal for Review
**Effort:** 8 weeks, 1-2 engineers
**Investment:** ~$58K
**Expected ROI:** 70-81% LLM cost reduction

---

## Problem Statement

Current agentic-qe agents operate with **limited code context**:

- **Pattern Storage Only**: Only test patterns vectorized, not actual code
- **File Scanning Overhead**: Agents read entire files to find relevant code
- **No Relationship Modeling**: Can't navigate dependencies, test coverage, or documentation links
- **High LLM Costs**: Processing 10KB+ context when only 1KB relevant

**Impact**: Higher LLM costs, slower context building, lower agent intelligence.

---

## Proposed Solution: Project Knowledge Graph

Extend existing RuVector (PostgreSQL + pgvector) to create a **comprehensive code intelligence system** that vectorizes ALL project data with semantic relationships.

### What Gets Vectorized

| Artifact | Entities | Embeddings | Relationships |
|----------|----------|-----------|---------------|
| **Source Code** | Functions, classes, modules | 768-dim vectors | IMPORTS, EXPORTS, CALLS |
| **Tests** | Test cases, assertions | 768-dim vectors | TESTS (test → function) |
| **Documentation** | JSDoc, Markdown | 768-dim vectors | DOCUMENTS (doc → code) |
| **Dependencies** | Import/export graph | - | IMPORTS (module → module) |

### Example Query

**Before** (without knowledge graph):
```typescript
// Agent task: "Add error handling to UserService.createUser"
// Must read:
//   - src/services/UserService.ts (5KB)
//   - All tests in tests/services/ (~20KB)
//   - Related docs (10KB)
// Total context: 35KB → $0.05 LLM cost
```

**After** (with knowledge graph):
```typescript
// Semantic search: "error handling for createUser function"
// Returns:
//   - UserService.createUser() function (500B)
//   - 2 related tests (1KB)
//   - JSDoc comment (200B)
// Total context: 1.7KB → $0.0025 LLM cost (95% savings ✅)
```

---

## Business Value

### Cost Savings

| Metric | Current | With KG | Savings |
|--------|---------|---------|---------|
| **LLM Cost per Task** | $0.05 | $0.01 | 80% |
| **Monthly LLM Spend** (1000 tasks) | $50 | $10 | $40/month |
| **Annual LLM Spend** | $600 | $120 | **$480/year** |
| **Context Size** | 35KB | 7KB | 80% reduction |

**Payback Period**: ~10 years at current usage, but value accelerates with:
- Team adoption (10+ developers)
- Higher usage (10K+ tasks/month)
- Agent intelligence improvements

### Non-Financial Benefits

1. **Faster Context Building**: 10x faster semantic retrieval (<10ms vs. 100ms+ file scanning)
2. **Better Agent Intelligence**: Agents learn from code patterns, not just test patterns
3. **Impact Analysis**: Know exactly which tests to run when code changes
4. **Code Navigation**: Natural language queries ("find database connection pooling")
5. **Test Coverage Insights**: Automatically map tests to implementation
6. **Future-Proof Platform**: Foundation for advanced features (clone detection, API migration)

---

## Technical Approach

### Architecture: PostgreSQL + pgvector (Phase 1)

```
┌───────────────────────────────────────────────────────┐
│          Existing RuVector Infrastructure             │
│          PostgreSQL + pgvector Extension              │
└───────────────────────────────────────────────────────┘
                        │
        ┌───────────────┴────────────────┐
        │                                │
┌───────▼──────────┐          ┌─────────▼──────────┐
│  code_entities   │          │ entity_relationships│
│  (768-dim vecs)  │          │  (graph edges)      │
└──────────────────┘          └────────────────────┘
        │                                │
        └───────────────┬────────────────┘
                        │
            ┌───────────▼──────────┐
            │   Query API          │
            │ • Semantic Search    │
            │ • Graph Traversal    │
            │ • Impact Analysis    │
            └──────────────────────┘
                        │
            ┌───────────▼──────────┐
            │ Agent Integration    │
            │ • BaseAgent Mixin    │
            │ • CLI Commands       │
            │ • File Watcher       │
            └──────────────────────┘
```

### Why PostgreSQL? (vs. Neo4j, AgentDB)

| Criterion | PostgreSQL | Neo4j | AgentDB |
|-----------|-----------|-------|---------|
| **Cost** | ✅ $0 | ❌ $100K/yr | ✅ $0 |
| **Team Expertise** | ✅ High | ❌ Low | ⚠️ Medium |
| **Infrastructure** | ✅ Existing | ❌ New | ⚠️ Partial |
| **Time to Market** | ✅ 8 weeks | ❌ 12+ weeks | ⚠️ 10 weeks |
| **Risk** | ✅ Low | ❌ High | ⚠️ Medium |

**Decision**: Start with PostgreSQL, evolve to hybrid if needed.

---

## Implementation Plan

### 8-Week Phased Rollout

| Phase | Duration | Deliverable | Success Metric |
|-------|----------|-------------|----------------|
| **Phase 1: Foundation** | Week 1-2 | Database schema, AST parser, embeddings | Single file → vectorized |
| **Phase 2: Relationships** | Week 3-4 | Dependency graph, test mapper, doc linker | Graph queryable via SQL |
| **Phase 3: Indexing** | Week 5-6 | Full project indexer, file watcher, query API | `aqe kg index` works |
| **Phase 4: Integration** | Week 7-8 | Agent integration, CLI commands, docs | Agents use KG, 80% cost reduction |

### Key Milestones

**Week 2**: Single TypeScript file successfully indexed into knowledge graph
**Week 4**: Dependency graph and test-to-code relationships extracted
**Week 6**: Full agentic-qe project indexed (543 test files, 500+ source files)
**Week 8**: Agents transparently using knowledge graph for context building

---

## Performance Targets (GOAP Metrics)

| Metric | Target | Measurement Method |
|--------|--------|--------------------|
| **Indexing Speed** | <5s per 100 files | Benchmark on agentic-qe codebase |
| **Query Latency** | <10ms | p50 for semantic search + graph join |
| **LLM Call Reduction** | 80%+ | Compare context size before/after |
| **Storage Efficiency** | <500MB per 10K files | PostgreSQL database size |
| **Graph Accuracy** | 95%+ | Precision/recall for relationships |
| **Incremental Updates** | <1s | File change → reindex latency |

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| **Indexing too slow** | Medium | Medium | Parallel processing, batch embeddings |
| **Test mapping accuracy <80%** | Medium | High | Multi-strategy validation, ML-based approach |
| **Agent adoption <50%** | Medium | High | Improve docs, training, success stories |
| **Storage costs high** | Low | Medium | Quantization (halfvec), pruning |
| **Query latency >10ms** | Low | High | SQL optimization, caching, indexes |

**Overall Risk**: **Low-Medium** (well-understood technologies, phased approach)

---

## Budget & Resources

### Team Allocation

| Role | Commitment | Duration | Cost |
|------|-----------|----------|------|
| **Core Developer** | 100% | 8 weeks | $32,000 |
| **Database Engineer** | 50% | 4 weeks | $8,000 |
| **QE Engineer** | 25% | 4 weeks | $4,000 |
| **Technical Writer** | 50% | 2 weeks | $3,000 |

**Total Labor**: ~$47,000

### Infrastructure & Other Costs

| Category | Cost |
|----------|------|
| PostgreSQL Hosting | $500 (3 months) |
| Embedding API (OpenAI) | $100 (initial indexing) |
| Contingency (20%) | $9,720 |

**Total Investment**: **$58,320**

### ROI Calculation

**Scenario 1: Current Usage** (1000 tasks/month)
- Annual savings: $480
- Payback: 121 years ❌

**Scenario 2: Team Adoption** (10 developers, 10K tasks/month)
- Annual savings: $4,800
- Payback: 12 years ⚠️

**Scenario 3: High Usage** (100 developers, 100K tasks/month)
- Annual savings: $48,000
- Payback: 1.2 years ✅

**Strategic Value**: Platform foundation for future code intelligence features.

---

## Success Criteria

### Quantitative Metrics (Week 8)

- [ ] **80%+ LLM cost reduction** (context size: 35KB → 7KB)
- [ ] **<10ms query latency** (semantic search + graph traversal)
- [ ] **>95% graph accuracy** (relationship precision/recall)
- [ ] **<5s indexing per 100 files**
- [ ] **>50% agent adoption** (agents using knowledge graph)

### Qualitative Metrics (Month 3)

- [ ] **Developer satisfaction**: Positive feedback on code navigation
- [ ] **Agent quality**: Improved test generation, better context relevance
- [ ] **Productivity**: Faster debugging, impact analysis
- [ ] **Documentation**: Complete user guide, examples, troubleshooting

---

## Alternative Approaches Considered

### Option 1: Do Nothing
**Pros**: No cost, no risk
**Cons**: High LLM costs continue, agents remain less intelligent
**Verdict**: ❌ Not viable long-term

### Option 2: File-Based Caching Only
**Pros**: Simple, low effort
**Cons**: No semantic search, no relationships, limited value
**Verdict**: ⚠️ Insufficient for agent intelligence

### Option 3: Neo4j Graph Database
**Pros**: Native graph performance, advanced algorithms
**Cons**: $100K/year license, new dependency, learning curve
**Verdict**: ⚠️ Overkill for v1, consider for v2

### Option 4: Full AgentDB Rewrite
**Pros**: 150x faster vector search, quantization
**Cons**: High effort, sync complexity, new patterns
**Verdict**: 🔄 Good for v2 after PostgreSQL proven

**Recommended**: **PostgreSQL + pgvector** (lowest risk, fastest time-to-market)

---

## Stakeholder Alignment

### Engineering Team
**Needs**: Maintainable, performant, scalable
**Benefits**: Existing PostgreSQL expertise, proven infrastructure
**Concerns**: Schema evolution, query complexity
**Mitigation**: Backward-compatible schema, comprehensive tests

### Product Team
**Needs**: Fast time-to-market, measurable value
**Benefits**: 8-week delivery, 80% LLM cost reduction
**Concerns**: ROI unclear at current usage levels
**Mitigation**: Phased rollout, early validation, usage growth plan

### Operations Team
**Needs**: Reliable, monitorable, supportable
**Benefits**: Standard PostgreSQL tooling, no new dependencies
**Concerns**: Storage growth, backup/recovery
**Mitigation**: Storage estimates, backup strategy, monitoring

### Finance Team
**Needs**: Cost-effective, positive ROI
**Benefits**: LLM cost reduction, no new licensing fees
**Concerns**: $58K investment, long payback period
**Mitigation**: Strategic value, platform play, usage growth

---

## Go/No-Go Decision Criteria

### Go if:
- ✅ Team has capacity (1-2 engineers for 8 weeks)
- ✅ Budget approved ($58K)
- ✅ Strategic alignment (code intelligence platform priority)
- ✅ Usage expected to grow (10+ developers, 10K+ tasks/month)

### No-Go if:
- ❌ Team over-committed (no bandwidth)
- ❌ Budget constrained
- ❌ Usage unlikely to grow (payback too long)
- ❌ Other priorities higher

---

## Recommendation

**Approve Phase 1** (PostgreSQL + pgvector) for these reasons:

1. **Low Risk**: Leverages existing infrastructure, no new dependencies
2. **Fast Time-to-Market**: 8 weeks vs. 12+ for alternatives
3. **Proven Technology**: PostgreSQL + pgvector battle-tested
4. **Measurable Value**: 80% LLM cost reduction, 10x faster context building
5. **Platform Foundation**: Enables future code intelligence features
6. **Reversible**: Can disable with env var, no migration needed

**With the understanding**:
- ROI depends on usage growth (target: 10K+ tasks/month within 1 year)
- Strategic value beyond cost savings (agent intelligence, developer productivity)
- Can evolve to AgentDB hybrid or Neo4j if bottlenecks emerge

---

## Next Steps

### Week 0 (Pre-Launch)
1. ✅ Finalize stakeholder approvals
2. ✅ Allocate team resources (1 core dev, 0.5 database eng)
3. ✅ Create Jira epic and stories
4. ✅ Set up monitoring dashboard
5. ✅ Schedule weekly syncs

### Week 1 (Foundation Kickoff)
1. ✅ Create database migration script
2. ✅ Implement AST parser
3. ✅ Set up embedding service
4. ✅ Write unit tests

### Week 8 (Integration Complete)
1. ✅ Deploy to production
2. ✅ Enable for 10% of users (gradual rollout)
3. ✅ Monitor metrics (cost reduction, latency, adoption)
4. ✅ Iterate based on feedback

### Month 3 (Post-Launch Review)
1. ✅ Measure success criteria
2. ✅ Decide on Phase 2 (optimization) or Phase 3 (AgentDB hybrid)
3. ✅ Plan advanced features (clone detection, API migration)

---

## Questions & Answers

**Q: Why not use Neo4j if it's better for graphs?**
A: Neo4j is 10-100x faster for graph traversal, but our queries are simple (1-3 hops). PostgreSQL recursive CTEs are sufficient, and we avoid $100K/year licensing costs.

**Q: Will this slow down agents?**
A: No. Semantic retrieval (<10ms) is 10x faster than file scanning (100ms+). Agents will be faster with smaller context.

**Q: What if embeddings change (model update)?**
A: Embeddings are frozen (768-dim). If we change models, we'd reindex (8-hour process for full codebase). Rarely needed.

**Q: How do we handle large codebases (100K+ files)?**
A: PostgreSQL scales to 100M+ rows. pgvector HNSW index maintains <10ms search. Storage grows linearly (~500MB per 10K files).

**Q: Can we disable if it doesn't work?**
A: Yes. Set `AQE_KNOWLEDGE_GRAPH_ENABLED=false`. Agents fallback to traditional context building. No migration needed.

**Q: What about private/sensitive code?**
A: All data stays in your PostgreSQL instance. Embeddings generated locally (or via OpenAI API with DPA). No third-party access.

---

## Appendices

### A. Detailed GOAP Plan
See: [`project-knowledge-graph-goap.md`](./project-knowledge-graph-goap.md)

### B. Implementation Roadmap
See: [`knowledge-graph-implementation-roadmap.md`](./knowledge-graph-implementation-roadmap.md)

### C. Architecture Comparison
See: [`knowledge-graph-architecture-comparison.md`](./knowledge-graph-architecture-comparison.md)

### D. Related Documentation
- [RuVector Self-Learning Guide](../guides/ruvector-self-learning.md)
- [Agent Learning System Architecture](../architecture/agent-learning-system.md)
- [Phase 0.5 Planning Document](../planning/v2.4.0-phase0.5-ruvector-self-learning.md)

---

**Document Owner**: GOAP Planning Specialist
**Approvers**: CTO, VP Engineering, Head of Product
**Review Date**: 2025-12-21
**Decision Deadline**: 2025-12-28
**Status**: ⏳ Awaiting approval

---

**For approval, please review**:
1. ✅ Problem statement and proposed solution (pages 1-2)
2. ✅ Business value and ROI analysis (page 3)
3. ✅ Technical approach and implementation plan (pages 4-5)
4. ✅ Budget and resources (page 7)
5. ✅ Success criteria and go/no-go (pages 8-9)

**Questions?** Contact project lead or review detailed appendices.
