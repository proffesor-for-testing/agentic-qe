# Learning Persistence Quick Fix Guide

**TL;DR**: QE agents' learning pattern storage is broken because `LearningStorePatternHandler` creates a separate `test_patterns` table instead of using the existing `patterns` table shared with Claude Flow. Fix: Extend `patterns` table and update handler.

---

## Problem Summary

### Current Issue
```typescript
// When you use this:
Task("Store pattern", "Use Jest for tests", "qe-test-generator")

// Handler creates test_patterns table dynamically
// But SwarmMemoryManager queries patterns table
// Result: Patterns stored but not retrievable ❌
```

### Why It Fails
1. **Table Mismatch**: Handler uses `test_patterns`, manager uses `patterns`
2. **Dynamic Creation**: `test_patterns` created on first use, not in schema
3. **No Integration**: Two separate pattern storage systems
4. **Data Fragmentation**: Claude Flow patterns invisible to QE agents and vice versa

---

## Quick Fix (30 minutes)

### Step 1: Add Columns to `patterns` Table (5 min)

```typescript
// Migration script: scripts/migrate-patterns.ts
import Database from 'better-sqlite3';

const db = new Database('.agentic-qe/memory.db');

console.log('Adding QE metadata columns to patterns table...');

db.exec(`
  ALTER TABLE patterns ADD COLUMN agent_id TEXT;
  ALTER TABLE patterns ADD COLUMN domain TEXT;
  ALTER TABLE patterns ADD COLUMN success_rate REAL DEFAULT 1.0;
  ALTER TABLE patterns ADD COLUMN updated_at INTEGER;
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_patterns_agent ON patterns(agent_id);
  CREATE INDEX IF NOT EXISTS idx_patterns_domain ON patterns(domain);
`);

console.log('✓ Migration complete');
db.close();
```

Run: `npx tsx scripts/migrate-patterns.ts`

### Step 2: Update Handler (10 min)

```typescript
// src/mcp/handlers/learning/learning-store-pattern.ts

// CHANGE THIS (line ~70):
const tableExists = db.prepare(`
  SELECT name FROM sqlite_master WHERE type='table' AND name='test_patterns'
`).get();

if (!tableExists) {
  // Create test_patterns table...
}

// TO THIS:
// No table check needed - patterns always exists!
// Just insert directly:

const existing = agentId ? db.prepare(`
  SELECT id, usage_count, success_rate, confidence
  FROM patterns  /* Changed from test_patterns */
  WHERE agent_id = ? AND pattern = ?
`).get(agentId, pattern) : undefined;

if (existing) {
  // Update with weighted averaging
  db.prepare(`
    UPDATE patterns  /* Changed from test_patterns */
    SET usage_count = ?, confidence = ?, success_rate = ?,
        metadata = ?, updated_at = ?
    WHERE id = ?
  `).run(...);
} else {
  // Insert new pattern
  const patternId = `pattern-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  db.prepare(`
    INSERT INTO patterns  /* Changed from test_patterns */
    (id, pattern, confidence, usage_count, metadata, created_at,
     agent_id, domain, success_rate, updated_at, ttl, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    patternId,
    pattern,
    confidence,
    usageCount,
    JSON.stringify(metadata),
    now,
    agentId || null,
    domain,
    successRate,
    now,
    604800000,
    now + 604800000
  );
}
```

### Step 3: Test (10 min)

```bash
# Test pattern storage
npm test tests/unit/mcp/handlers/learning-store-pattern.test.ts

# Test pattern retrieval
npm test tests/integration/learning-persistence.test.ts

# Manual test via MCP
node -e "
const handler = new LearningStorePatternHandler(...);
const result = await handler.handle({
  pattern: 'Test pattern',
  confidence: 0.9,
  domain: 'test',
  agentId: 'test-agent'
});
console.log('Pattern ID:', result.data.patternId);
"
```

### Step 4: Verify (5 min)

```sql
-- Check patterns table has new columns
PRAGMA table_info(patterns);
-- Should show: agent_id, domain, success_rate, updated_at

-- Check no test_patterns table
SELECT name FROM sqlite_master WHERE type='table' AND name='test_patterns';
-- Should return nothing

-- Check pattern storage works
SELECT * FROM patterns ORDER BY created_at DESC LIMIT 5;
-- Should show patterns with agent_id and domain
```

---

## Before vs After

### Before (Broken)
```typescript
// Store pattern
await handler.handle({ pattern: "Use Jest", confidence: 0.9 });
// ✅ Stored in test_patterns table

// Query pattern
const patterns = await memoryManager.queryPatternsByDomain("test-gen");
// ❌ Returns [] (empty) - queries patterns table
```

### After (Fixed)
```typescript
// Store pattern
await handler.handle({
  pattern: "Use Jest",
  confidence: 0.9,
  agentId: "qe-test-gen",
  domain: "test-gen"
});
// ✅ Stored in patterns table

// Query pattern
const patterns = await memoryManager.queryPatternsByDomain("test-gen");
// ✅ Returns [{ pattern: "Use Jest", confidence: 0.9, ... }]
```

---

## Common Issues

### Issue 1: "test_patterns table already exists"
**Cause**: Handler created it before migration
**Fix**: Drop it and migrate data
```sql
-- Migrate data first
INSERT INTO patterns (id, pattern, confidence, agent_id, domain, ...)
SELECT 'pattern-' || id || '-migrated', pattern, confidence, agent_id, domain, ...
FROM test_patterns;

-- Then drop
DROP TABLE test_patterns;
```

### Issue 2: "Cannot add column to patterns"
**Cause**: Migration already run
**Fix**: Check if columns exist
```sql
PRAGMA table_info(patterns);
-- If agent_id exists, migration already done
```

### Issue 3: "Patterns not showing in queries"
**Cause**: Old code still using test_patterns
**Fix**: Grep for test_patterns and replace
```bash
grep -r "test_patterns" src/
# Replace all occurrences with "patterns"
```

---

## Rollback

If something breaks:

```bash
# Restore backup
cp .agentic-qe/memory.db.backup .agentic-qe/memory.db

# Revert code
git checkout HEAD~1 src/mcp/handlers/learning/learning-store-pattern.ts

# Restart
npm run build && npm run mcp:start
```

---

## Testing Checklist

- [ ] Migration script runs without errors
- [ ] `patterns` table has new columns: `agent_id`, `domain`, `success_rate`, `updated_at`
- [ ] Indexes created: `idx_patterns_agent`, `idx_patterns_domain`
- [ ] Handler stores patterns in `patterns` table (not `test_patterns`)
- [ ] `test_patterns` table does NOT exist
- [ ] Pattern retrieval via `SwarmMemoryManager` works
- [ ] Claude Flow patterns still work (13 existing patterns)
- [ ] Unit tests pass: `npm test learning-store-pattern`
- [ ] Integration tests pass: `npm test learning-persistence`

---

## Quick Commands

```bash
# Run migration
npx tsx scripts/migrate-patterns.ts

# Check schema
sqlite3 .agentic-qe/memory.db "PRAGMA table_info(patterns);"

# Test pattern storage
npm test -- learning-store-pattern

# Check patterns
sqlite3 .agentic-qe/memory.db "SELECT id, pattern, agent_id, domain FROM patterns LIMIT 10;"
```

---

## Need Help?

1. Read full investigation: `docs/LEARNING-PERSISTENCE-INVESTIGATION-REPORT.md`
2. Check architecture: `docs/LEARNING-PERSISTENCE-ARCHITECTURE.md`
3. Ask in #agentic-qe channel
4. File issue: [GitHub Issues](https://github.com/your-repo/issues)

---

**Last Updated**: 2025-11-12
**Status**: Ready to implement ✅
