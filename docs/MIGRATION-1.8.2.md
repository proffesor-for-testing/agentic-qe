# Migration Guide: v1.8.0/1.8.1 → v1.8.2

## 🔥 Critical Hotfix - Missing AgentDB Tables

**Affected Versions**: v1.8.0, v1.8.1
**Fix Version**: v1.8.2

## Problem

If you initialized a project with v1.8.0 or v1.8.1, your `agentdb.db` is **missing 6 critical tables**, breaking the QE learning system:

- ❌ `test_patterns` - Pattern storage broken
- ❌ `pattern_usage` - Quality metrics unavailable
- ❌ `cross_project_mappings` - Cross-framework sharing disabled
- ❌ `pattern_similarity_index` - Pattern similarity broken
- ❌ `pattern_fts` - Full-text search missing
- ❌ `schema_version` - No migration tracking

**Only the base `patterns` table was created** (1/7 tables).

## Solution

Choose one of the migration options below based on whether you need to preserve existing data.

---

## Option 1: Automated Migration (Recommended ✅)

**Preserves all existing data** (episodes, patterns, learning history)

### Steps

1. **Update to v1.8.2**
   ```bash
   npm install agentic-qe@1.8.2
   ```

2. **Run Migration Script**
   ```bash
   npx tsx node_modules/agentic-qe/scripts/migrate-add-qe-tables.ts
   ```

3. **Verify Migration**
   ```bash
   sqlite3 .agentic-qe/agentdb.db ".tables" | grep -E "(test_patterns|pattern_usage|cross_project_mappings|pattern_similarity_index|pattern_fts|schema_version)"
   ```

   You should see all 6 tables:
   ```
   cross_project_mappings
   pattern_fts
   pattern_similarity_index
   pattern_usage
   schema_version
   test_patterns
   ```

### What the Migration Does

- ✅ Creates automatic backup (`.agentic-qe/agentdb.db.backup-TIMESTAMP`)
- ✅ Adds 6 missing tables with proper indexes
- ✅ Handles FTS5 unavailability (falls back to indexed table)
- ✅ Verifies data integrity (episodes, patterns preserved)
- ✅ Rolls back on failure

### Migration Output

```
🔄 Starting QE Tables Migration...
📁 Database: /path/to/.agentic-qe/agentdb.db
💾 Creating backup: /path/to/.agentic-qe/agentdb.db.backup-1763474254350
📊 Existing data: 2047 episodes, 28 patterns
Creating test_patterns table...
✅ test_patterns created
Creating pattern_usage table...
✅ pattern_usage created
Creating cross_project_mappings table...
✅ cross_project_mappings created
Creating pattern_similarity_index table...
✅ pattern_similarity_index created
Creating pattern_fts table...
⚠️  FTS5 not available, using regular table fallback
✅ pattern_fts created (fallback)
Creating schema_version table...
✅ schema_version created

✅ Migration completed successfully!
📊 Total tables: 45
💾 Backup saved: /path/to/.agentic-qe/agentdb.db.backup-1763474254350
✨ New QE tables added: 6

✅ Data integrity verified:
   Episodes: 2047 (unchanged)
   Patterns: 28 (unchanged)
```

---

## Option 2: Manual Re-initialization (⚠️ Data Loss)

**Destroys all existing data** - only use if you don't need to preserve learning history.

### Steps

1. **Backup Old Database** (optional)
   ```bash
   cp .agentic-qe/agentdb.db .agentic-qe/agentdb.old.db
   ```

2. **Update to v1.8.2**
   ```bash
   npm install agentic-qe@1.8.2
   ```

3. **Remove Old Database**
   ```bash
   rm .agentic-qe/agentdb.db
   ```

4. **Re-initialize**
   ```bash
   aqe init
   ```

5. **Verify**
   ```bash
   sqlite3 .agentic-qe/agentdb.db "SELECT COUNT(*) FROM sqlite_master WHERE type='table';"
   ```

   Should show **7 tables** for a fresh project (or more if you have existing data).

---

## Verification

### Check All Required Tables Exist

```bash
sqlite3 .agentic-qe/agentdb.db "
  SELECT name
  FROM sqlite_master
  WHERE type='table'
    AND name IN (
      'patterns',
      'test_patterns',
      'pattern_usage',
      'cross_project_mappings',
      'pattern_similarity_index',
      'pattern_fts',
      'schema_version'
    )
  ORDER BY name;
"
```

**Expected output** (all 7 tables):
```
cross_project_mappings
pattern_fts
pattern_similarity_index
pattern_usage
patterns
schema_version
test_patterns
```

### Check Schema Version

```bash
sqlite3 .agentic-qe/agentdb.db "SELECT version, description FROM schema_version;"
```

**Expected output**:
```
1.1.0|Initial QE ReasoningBank schema
```

### Check Data Preservation (if using Option 1)

```bash
sqlite3 .agentic-qe/agentdb.db "
  SELECT
    (SELECT COUNT(*) FROM episodes) as episodes,
    (SELECT COUNT(*) FROM patterns) as patterns;
"
```

Should show your original counts unchanged.

---

## Troubleshooting

### Migration Script Fails

**Error**: `Migration failed: ...`

**Solution**:
1. Check backup was created: `ls -lh .agentic-qe/agentdb.db.backup-*`
2. Restore from backup: `cp .agentic-qe/agentdb.db.backup-XXXXX .agentic-qe/agentdb.db`
3. Check database file permissions: `ls -l .agentic-qe/agentdb.db`
4. Try manual SQL migration (see below)

### Manual SQL Migration

If the automated script fails, you can manually add the tables:

```bash
sqlite3 .agentic-qe/agentdb.db < node_modules/agentic-qe/scripts/qe-tables-schema.sql
```

(The SQL file is extracted from the migration script)

### FTS5 Warning

**Warning**: `FTS5 not available, using regular table fallback`

**Explanation**: This is expected when using sql.js (WASM SQLite). The migration creates a regular indexed table instead of FTS5 virtual table. **Full-text search still works**, just slightly slower.

**To get FTS5**: Use native SQLite instead of sql.js (requires compilation).

### Database Viewer Shows Incomplete Tables

**Issue**: IDE/database viewer shows only 25 tables, missing `patterns` or QE tables.

**Solution**:
1. Refresh database connection in IDE
2. Close and reopen database file
3. Restart IDE/extension
4. Use command-line verification (shown above)
5. Try different SQLite viewer (DB Browser for SQLite, etc.)

The database is correct - it's a viewer caching issue.

---

## FAQ

### Do I need to migrate if I'm a new user?

**No**. Fresh installs of v1.8.2+ automatically create all 7 tables. This migration is only for users who ran `aqe init` with v1.8.0 or v1.8.1.

### Will this migration affect my tests?

**No**. The migration only adds missing tables. It doesn't modify any code or test behavior.

### Can I skip the migration?

**No**. Without the 6 missing tables, core QE features are broken:
- Pattern storage (test generation learns nothing)
- Quality metrics (no improvement tracking)
- Cross-framework sharing (can't reuse patterns between Jest/Vitest/etc.)

### How long does migration take?

**1-3 seconds** for most databases. Time scales with database size (episodes, patterns).

### What happens to my backups?

The migration script creates timestamped backups automatically:
```
.agentic-qe/agentdb.db.backup-1763474254350
```

You can safely delete old backups after verifying the migration succeeded.

---

## Support

If you encounter issues with the migration:

1. **Check the backup**: `.agentic-qe/agentdb.db.backup-TIMESTAMP`
2. **Open an issue**: [GitHub Issues](https://github.com/proffesor-for-testing/agentic-qe-cf/issues)
3. **Include**:
   - Migration script output (full terminal logs)
   - Database table list: `sqlite3 .agentic-qe/agentdb.db ".tables"`
   - Table count: `sqlite3 .agentic-qe/agentdb.db "SELECT COUNT(*) FROM sqlite_master WHERE type='table';"`
   - Error messages

---

**Last Updated**: 2025-01-18
**Migration Script**: `scripts/migrate-add-qe-tables.ts`
**Schema Version**: 1.1.0
