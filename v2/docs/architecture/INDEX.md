# Agentic QE Fleet - Architecture Documentation

**Current Version:** v1.8.0
**Last Updated:** November 16, 2025

---

## Documentation Index

This folder contains comprehensive architecture documentation for the Agentic QE Fleet, covering learning systems, database architecture, and performance optimizations.

---

## 🆕 v1.8.0 Architecture (Production)

### Core System Architecture

| Document | Purpose | Highlights | Status |
|----------|---------|------------|--------|
| **[database-architecture.md](./database-architecture.md)** | Database consolidation & design | • 2-database architecture (agentdb.db + memory.db)<br>• 150x faster vector search<br>• 3,766 records migrated<br>• Clear separation: learning vs coordination | ✅ Production |
| **[learning-system.md](./learning-system.md)** | QE agent learning architecture | • Reflexion-based learning (self-reflection + critique)<br>• Q-learning reinforcement<br>• HNSW semantic search<br>• Persistent cross-session memory | ✅ Production |
| **[mcp-optimizations.md](./mcp-optimizations.md)** | MCP server performance | • 95-99% token reduction (filtering)<br>• 60-80% latency reduction (batching)<br>• 90% cost savings (prompt caching)<br>• $500-1000/month savings | ✅ Production |

### Key Metrics (v1.8.0)

```
Database Performance:
  • Vector search:     87µs (172x faster than v1.7.0)
  • Pattern retrieval: 1.8ms (2.8x faster)
  • Learning update:   7ms (2.9x faster)

Learning Impact:
  • Test coverage:     +17% improvement after 500 tasks
  • Detection speed:   -53% faster after 500 tasks
  • Pattern reuse:     92% of tasks benefit from prior learning

MCP Optimizations:
  • Token reduction:   95-99% across all tools
  • API cost:          99.1% reduction
  • Response time:     69.2% faster
```

---

## 📚 v1.0.5 Architecture (Historical)

### Phase 1: Multi-Model Router + Streaming

| Document | Purpose | Audience | Status |
|----------|---------|----------|--------|
| **[PHASE1-SUMMARY.md](./PHASE1-SUMMARY.md)** | Executive overview and quick reference | All stakeholders | ✅ Complete |
| **[PHASE1-ARCHITECTURE.md](./PHASE1-ARCHITECTURE.md)** | Complete technical architecture design | Architects, Senior Engineers | ✅ Complete |
| **[COMPONENT-DIAGRAM.md](../diagrams/COMPONENT-DIAGRAM.md)** | Visual component breakdown and interactions | All Engineers | ✅ Complete |
| **[INTEGRATION-SPEC.md](../specifications/INTEGRATION-SPEC.md)** | Detailed integration specifications | Implementation Team | ✅ Complete |
| **[MIGRATION-STRATEGY.md](../specifications/MIGRATION-STRATEGY.md)** | 7-week deployment and migration plan | Ops Team, Tech Leads | ✅ Complete |

---

## 🗺️ Additional Architecture Documents

### Learning & ReasoningBank

| Document | Purpose | Status |
|----------|---------|--------|
| **[LEARNING-SYSTEM-ARCHITECTURE.md](./LEARNING-SYSTEM-ARCHITECTURE.md)** | Original learning system design | ✅ Complete |
| **[REASONING-BANK-V1.1.md](./REASONING-BANK-V1.1.md)** | ReasoningBank architecture v1.1 | ✅ Complete |
| **[REASONING-BANK-COORDINATION.md](./REASONING-BANK-COORDINATION.md)** | Multi-agent coordination patterns | ✅ Complete |
| **[AGENTDB-INTEGRATION-ARCHITECTURE.md](./AGENTDB-INTEGRATION-ARCHITECTURE.md)** | AgentDB integration design | ✅ Complete |

### Implementation Summaries

| Document | Purpose | Status |
|----------|---------|--------|
| **[learning-system-summary.md](./learning-system-summary.md)** | Learning system implementation summary | ✅ Complete |
| **[ARCHITECTURE-SUMMARY.md](./ARCHITECTURE-SUMMARY.md)** | Overall architecture summary | ✅ Complete |
| **[IMPLEMENTATION-GUIDE.md](./IMPLEMENTATION-GUIDE.md)** | Implementation guidelines | ✅ Complete |

---

## 🚀 Quick Start

### For v1.8.0 (Current Release)

**🏗️ Architects & Tech Leads:**
1. Start with [database-architecture.md](./database-architecture.md) - understand the 2-database design
2. Review [learning-system.md](./learning-system.md) - see how agents learn and improve
3. Check [mcp-optimizations.md](./mcp-optimizations.md) - understand performance gains

**👨‍💻 Developers:**
1. Read [database-architecture.md](./database-architecture.md) - developer guide section
2. Study [learning-system.md](./learning-system.md) - integration examples
3. Implement using [mcp-optimizations.md](./mcp-optimizations.md) - optimization patterns

**📊 Product Managers:**
1. Review [learning-system.md](./learning-system.md) - performance metrics
2. Check [mcp-optimizations.md](./mcp-optimizations.md) - cost savings analysis
3. See [database-architecture.md](./database-architecture.md) - migration summary

### For v1.0.5 (Historical Reference)

**For Stakeholders:** Start with [PHASE1-SUMMARY.md](./PHASE1-SUMMARY.md)

**For Engineers:** Review [PHASE1-ARCHITECTURE.md](./PHASE1-ARCHITECTURE.md) and [COMPONENT-DIAGRAM.md](../diagrams/COMPONENT-DIAGRAM.md)

**For Implementation:** Follow [INTEGRATION-SPEC.md](../specifications/INTEGRATION-SPEC.md) and [MIGRATION-STRATEGY.md](../specifications/MIGRATION-STRATEGY.md)

---

## 📖 Documentation Structure

```
docs/architecture/
├── database-architecture.md        # ⭐ v1.8.0 Database design
├── learning-system.md              # ⭐ v1.8.0 Learning architecture
├── mcp-optimizations.md            # ⭐ v1.8.0 Performance optimizations
├── PHASE1-ARCHITECTURE.md          # v1.0.5 Multi-model router
├── PHASE1-SUMMARY.md               # v1.0.5 Executive summary
├── AGENTDB-INTEGRATION-ARCHITECTURE.md  # AgentDB integration
├── LEARNING-SYSTEM-ARCHITECTURE.md      # Original learning design
├── REASONING-BANK-V1.1.md          # ReasoningBank patterns
└── [28 other architecture documents]
```

---

## 🔗 Related Documentation

- **Implementation:** `docs/implementation/` - Detailed implementation summaries
- **Database:** `docs/database/` - Database schema and migration guides
- **Testing:** `docs/testing/` - Test strategies and coverage analysis
- **Planning:** `docs/planning/` - Roadmaps and improvement plans
- **Analysis:** `docs/analysis/` - Coverage and optimization analysis

---

## 📈 Version History

| Version | Date | Key Changes |
|---------|------|-------------|
| **v1.8.0** | Nov 16, 2025 | Database consolidation, learning system, MCP optimizations |
| **v1.7.0** | Nov 13, 2025 | Sherlock-review skill, brutal-honesty-review improvements |
| **v1.6.1** | Oct 2025 | ReasoningBank integration, 18 QE agents |
| **v1.0.5** | Earlier 2025 | Multi-model router, streaming support |

---

**Current Status:** ✅ v1.8.0 Production Ready
**Database Migration:** ✅ Complete (3,766 records migrated)
**Learning System:** ✅ Active (150x faster vector search)
**MCP Optimizations:** ✅ Deployed (95-99% token reduction)
