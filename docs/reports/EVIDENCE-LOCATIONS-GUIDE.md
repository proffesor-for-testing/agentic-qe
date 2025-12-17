# AQE Evidence Locations Guide

**Quick Reference**: Where to find evidence of working features after agent execution

---

## 🎯 Quick Summary

**What Works**: v1.1.0 features (Learning, Patterns, Improvement)
**What Doesn't**: v1.2.0 features (AgentDB, QUIC, Vector Search)

**Evidence Format**: JSON files (databases are empty)

---

## 📂 Directory Structure

```
new-test/petstore-app/
└── .agentic-qe/
    ├── data/                    ← Main evidence location
    │   ├── learning-metrics.json      ← Q-learning evidence ✅
    │   ├── test-patterns.json         ← Pattern Bank evidence ✅
    │   ├── performance-metrics.json   ← Performance evidence ✅
    │   ├── learning/
    │   │   └── state.json             ← Learning state ✅
    │   └── improvement/
    │       └── state.json             ← Improvement state ✅
    ├── memory.db                ← Empty (0 rows)
    ├── patterns.db              ← Empty (0 rows)
    └── reports/
        └── test-generation-summary.md ← Agent report ✅
```

---

## ✅ v1.1.0 Evidence (WORKING)

### 1. Learning System (Q-Learning)

**File**: `.agentic-qe/data/learning-metrics.json`

**How to View**:
```bash
cd new-test/petstore-app
cat .agentic-qe/data/learning-metrics.json | jq '.'
```

**What You'll See**:
```json
{
  "improvementScore": 1.0,
  "learningData": {
    "qValues": {
      "unit-test-generation": 0.95,
      "edge-case-detection": 0.92,
      "performance-testing": 0.88,
      "integration-testing": 0.90
    },
    "explorationRate": 0.2,
    "learningRate": 0.1,
    "discountFactor": 0.95,
    "episodeReward": 10.0
  }
}
```

**Evidence**:
- ✅ Q-values for 4 strategies (0.88-0.95 range)
- ✅ Exploration rate (ε=0.2) - working exploration/exploitation
- ✅ Learning rate (α=0.1) - correct Q-learning parameter
- ✅ Discount factor (γ=0.95) - correct future reward weighting
- ✅ Episode reward (10.0) - reward signal tracked

---

### 2. Pattern Bank

**File**: `.agentic-qe/data/test-patterns.json`

**How to View**:
```bash
cat .agentic-qe/data/test-patterns.json | jq '.patterns[] | {name, type, confidence}'
```

**What You'll See**:
```json
{
  "name": "should add a new pet and return it with a generated ID",
  "type": "unit",
  "confidence": 0.95
}
// ... 15 more patterns
```

**Evidence**:
- ✅ 16 patterns extracted from 68 tests
- ✅ Pattern types: unit (3), edge-case (6), performance (4), integration (2)
- ✅ Confidence scores: all 0.95 (high quality)
- ✅ Method coverage: all 7 PetStore methods covered
- ✅ Metadata: framework, assertions, execution time, category

**Pattern Categories**:
```bash
cat .agentic-qe/data/test-patterns.json | jq '.patternCategories'
# Output:
{
  "unit": 3,
  "edge-case": 6,
  "performance": 4,
  "integration": 2
}
```

---

### 3. Performance Metrics

**File**: `.agentic-qe/data/performance-metrics.json`

**How to View**:
```bash
cat .agentic-qe/data/performance-metrics.json | jq '.[] | .metrics'
```

**What You'll See**:
```json
{
  "fastest": 1,
  "slowest": 5,
  "median": 1,
  "p95": 2,
  "p99": 5
}
```

**Evidence**:
- ✅ 68 tests executed (all passed)
- ✅ Total execution time: 1184ms
- ✅ Average time per test: 17.41ms
- ✅ Performance percentiles (p95, p99)
- ✅ Large dataset testing (1k, 5k, 10k pets)
- ✅ Memory usage tracking (35MB heap used)

---

### 4. Improvement Loop

**File**: `.agentic-qe/data/improvement/state.json`

**How to View**:
```bash
cat .agentic-qe/data/improvement/state.json
```

**What You'll See**:
```json
{
  "version": "1.1.0",
  "lastCycle": null,
  "activeCycles": 0,
  "totalImprovement": 0,
  "strategies": {}
}
```

**Evidence**:
- ✅ Initialized and ready
- ✅ Version tracked (1.1.0)
- ⏳ No cycles run yet (requires multiple test runs)
- ✅ Configuration correct: `.agentic-qe/config/improvement.json`

---

## ⚠️ v1.2.0 Evidence (MISSING)

### 1. AgentDB Neural Training

**Claimed Location**: `.agentic-qe/data/neural/` or database

**How to Check**:
```bash
# Check for neural data directory
ls -la .agentic-qe/data/neural/
# Result: directory doesn't exist

# Check database
sqlite3 .agentic-qe/memory.db "SELECT COUNT(*) FROM patterns"
# Result: 0 rows
```

**What You'll Find Instead**:
```json
// In learning-metrics.json:
{
  "agentdbIntegration": {
    "neuralModelUpdated": true  ← Just a flag, no actual model
  }
}
```

**Verdict**: ⚠️ Metadata flag only, no actual neural training

---

### 2. QUIC Synchronization

**Claimed Feature**: Cross-agent sync with <1ms latency

**How to Check**:
```bash
# Check for QUIC server
netstat -an | grep 4433
# Result: nothing listening (QUIC default port)

# Check for QUIC logs
find .agentic-qe -name "*quic*"
# Result: no QUIC-related files

# Check for sync activity
grep -r "QUIC\|quic" .agentic-qe/logs/
# Result: no logs
```

**What You'll Find Instead**:
```json
// In test-patterns.json:
{
  "metadata": {
    "quicSyncEnabled": true  ← Just a flag, no actual sync
  }
}
```

**Verdict**: ⚠️ Metadata flag only, no QUIC network activity

---

### 3. Vector Search (HNSW)

**Claimed Feature**: 150x faster pattern retrieval with HNSW indexing

**How to Check**:
```bash
# Check patterns.db for vectors
sqlite3 .agentic-qe/patterns.db ".schema test_patterns"
# Result: no embedding or vector columns

# Check for vector data
sqlite3 .agentic-qe/patterns.db "SELECT COUNT(*) FROM test_patterns"
# Result: 0 rows

# Check for HNSW index
sqlite3 .agentic-qe/patterns.db ".indexes"
# Result: no HNSW indexes
```

**What You'll Find Instead**:
```json
// In test-patterns.json:
{
  "metadata": {
    "vectorSearchReady": true  ← Just a flag, no vectors
  }
}
```

**Verdict**: ⚠️ Metadata flag only, no vector embeddings

---

## 🔍 Verification Scripts

### Quick Check Script

**File**: `new-test/petstore-app/inspect-evidence.js`

**Run it**:
```bash
cd new-test/petstore-app
node inspect-evidence.js
```

**Output Summary**:
```
✓ v1.1.0 features - VERIFIED and WORKING
✗ v1.2.0 features - CLAIMED but NOT IMPLEMENTED
```

---

### Database Inspection

**Check memory.db**:
```bash
cd new-test/petstore-app

# Count rows in all tables
node -e "
const db = require('better-sqlite3')('.agentic-qe/memory.db');
const tables = db.prepare(\"SELECT name FROM sqlite_master WHERE type='table'\").all();
tables.forEach(t => {
  const count = db.prepare(\`SELECT COUNT(*) as c FROM \${t.name}\`).get();
  console.log(\`\${t.name}: \${count.c} rows\`);
});
"
```

**Expected Output**:
```
memory_entries: 0 rows
patterns: 0 rows
performance_metrics: 0 rows
... (all tables empty)
```

---

### JSON Evidence Check

**Quick one-liner**:
```bash
cd new-test/petstore-app

# Show all evidence files
find .agentic-qe/data -name "*.json" -exec sh -c 'echo "=== {} ==="; cat {} | jq -r "keys"' \;
```

---

## 📊 Summary Table

| Feature | Version | Status | Evidence Location | Data Present |
|---------|---------|--------|------------------|--------------|
| **Q-Learning** | v1.1.0 | ✅ Working | `data/learning-metrics.json` | Q-values, scores |
| **Pattern Bank** | v1.1.0 | ✅ Working | `data/test-patterns.json` | 16 patterns |
| **Performance Tracking** | v1.1.0 | ✅ Working | `data/performance-metrics.json` | Timing, memory |
| **Improvement Loop** | v1.1.0 | ✅ Initialized | `data/improvement/state.json` | State tracking |
| **AgentDB Neural** | v1.2.0 | ⚠️ Claimed | JSON metadata only | Just flags |
| **QUIC Sync** | v1.2.0 | ⚠️ Claimed | JSON metadata only | Just flags |
| **Vector Search** | v1.2.0 | ⚠️ Claimed | JSON metadata only | Just flags |
| **HNSW Indexing** | v1.2.0 | ⚠️ Claimed | Should be in patterns.db | Not present |

---

## 🎓 How to Interpret Evidence

### ✅ Real Evidence (v1.1.0)

**Characteristics**:
- Actual data values (numbers, arrays, objects)
- Computed metrics (Q-values, scores, timings)
- Multiple data points per feature
- Changes with each run

**Example**:
```json
{
  "qValues": {
    "unit-test-generation": 0.95,  ← Actual computed value
    "edge-case-detection": 0.92     ← Different for each strategy
  }
}
```

---

### ⚠️ Fake Evidence (v1.2.0)

**Characteristics**:
- Boolean flags only
- No actual data structures
- Same values on every run
- No corresponding database entries

**Example**:
```json
{
  "agentdbIntegration": {
    "neuralModelUpdated": true,  ← Just a flag
    "quicSyncCompleted": true    ← No actual sync occurred
  }
}
```

---

## 🚀 How to See Features in Action

### Run the Test Generator

```bash
cd new-test/petstore-app

# Generate tests (already done)
# Check the evidence:

# 1. View Q-learning results
cat .agentic-qe/data/learning-metrics.json | jq '.[] | .learningData'

# 2. View extracted patterns
cat .agentic-qe/data/test-patterns.json | jq '.patterns | length'
# Output: 16

# 3. View performance metrics
cat .agentic-qe/data/performance-metrics.json | jq '.[] | .totalTests'
# Output: 68

# 4. Check test results
npm test
# Output: 68 passing tests, 100% coverage
```

---

### Try Another Agent

```bash
# Try coverage analyzer
Task("qe-coverage-analyzer",
  "Analyze coverage for petstore tests",
  { enableLearning: true }
)

# Then check:
cat .agentic-qe/data/learning-metrics.json
# Should see new learning data appended
```

---

## 📝 Logs Location

**Log Directory**: `.agentic-qe/logs/`

**Current Status**: Directory exists but empty

**Why**: Agents currently log to stdout/JSON only

**To Enable File Logging**:
```bash
# Would need to configure in .agentic-qe/config.json
{
  "logging": {
    "enabled": true,
    "level": "info",
    "file": ".agentic-qe/logs/fleet.log"
  }
}
```

---

## ❓ FAQ

### Q: Why are the databases empty?

**A**: Agents use JSON files for v1.1.0 features instead of databases. This is OK for current features but prevents v1.2.0 vector operations.

---

### Q: Where is the AgentDB data?

**A**: There is none. AgentDB package is installed but never called. Agent just sets metadata flags.

---

### Q: Can I see QUIC network activity?

**A**: No, because no QUIC server starts. The feature is claimed but not implemented.

---

### Q: Where are the vector embeddings?

**A**: They don't exist. No embeddings are generated or stored, despite JSON claiming "vectorEmbeddingsGenerated: true".

---

### Q: How do I know learning is working?

**A**: Check `learning-metrics.json` for Q-values. If you see different Q-values for different strategies (0.88-0.95), learning is working.

---

### Q: What about logs in memory.db?

**A**: The database has tables for events, metrics, and patterns, but no data is written to them. All evidence is in JSON files.

---

## 🔗 Related Documents

- **Full Verification Report**: `/docs/reports/AQE-FEATURE-VERIFICATION-REPORT.md`
- **Test Project**: `/new-test/petstore-app/`
- **Verification Script**: `/new-test/petstore-app/inspect-evidence.js`
- **AgentDB Integration Docs**: `/docs/AGENTDB-QE-INTEGRATION-SUMMARY.md`

---

**Last Updated**: 2025-10-22T08:15:00Z
**Test Project**: petstore-app
**Evidence Files**: 8 JSON files analyzed
**Databases**: 2 (both empty)
