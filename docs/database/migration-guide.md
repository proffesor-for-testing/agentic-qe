# AgentDB Migration Guide

## Overview

This guide covers the migration of `agentdb.db` from the project root to `.agentic-qe/agentdb.db` with full data integrity verification and rollback capabilities.

## Migration Features

### ✅ Data Safety
- **SHA-256 Checksum Verification** - Ensures data integrity during copy
- **Automatic Backups** - Creates timestamped backups before migration
- **Integrity Checks** - SQLite PRAGMA integrity_check before and after
- **Record Count Validation** - Verifies all records are preserved
- **Rollback Capability** - Easy restoration from backups

### ⚡ Schema Enhancements
- **Performance Indexes** - Adds indexes for faster queries
- **Metadata Columns** - Adds metadata, tags, and version columns
- **Database Optimization** - Runs ANALYZE and VACUUM
- **Version Tracking** - Marks schema as v2.0

### 🔍 Dry-Run Mode
- **Preview Changes** - See what will happen without making changes
- **Validation** - Checks source database integrity
- **Statistics** - Shows table counts and record numbers

## Quick Start

### 1. Preview Migration (Dry-Run)

```bash
npm run migrate:dry-run
```

**Output:**
```
🔄 Starting AgentDB Migration...

✓ Source database found: /path/to/agentdb.db
  Checksum: a1b2c3d4...

📊 Analyzing source database...
✓ Tables found: 3
  - episodes: 1,747 records
  - patterns: 42 records
  - metadata: 1 records
✓ Total records: 1,790

🔍 Verifying source database integrity...
✓ Source integrity verified

🔍 DRY RUN MODE - No changes will be made

Migration plan:
  Source: /path/to/agentdb.db
  Target: /path/to/.agentic-qe/agentdb.db
  Records: 1,790
  Backup: Yes
```

### 2. Run Migration

```bash
npm run migrate:agentdb
```

**Output:**
```
🔄 Starting AgentDB Migration...

✓ Source database found: /path/to/agentdb.db
✓ Tables found: 3
  - episodes: 1,747 records
  - patterns: 42 records
  - metadata: 1 records
✓ Total records: 1,790

🔍 Verifying source database integrity...
✓ Source integrity verified

💾 Creating backup...
✓ Backup created: /path/to/agentdb.db.backup.1731759123456

📁 Creating target directory...
✓ Target directory: /path/to/.agentic-qe

📋 Copying database...
✓ Database copied to: /path/to/.agentic-qe/agentdb.db

🔐 Verifying copy integrity...
✓ Copy verified: checksums match

⚡ Applying schema enhancements...
✓ Schema v2.0 enhancements applied

🔍 Verifying final database integrity...
✓ Final integrity verified

✓ Record count verified: 1,790

✅ Migration Complete!

Summary:
  Source:     /path/to/agentdb.db
  Target:     /path/to/.agentic-qe/agentdb.db
  Records:    1,790
  Duration:   342ms
  Backup:     /path/to/agentdb.db.backup.1731759123456
  Checksum:   a1b2c3d4...
```

### 3. Verify Migration

After migration, verify the new location:

```bash
ls -lh .agentic-qe/agentdb.db
```

Check the database:

```bash
sqlite3 .agentic-qe/agentdb.db "SELECT COUNT(*) FROM episodes"
```

## Rollback

### Automatic Rollback (Latest Backup)

```bash
npm run migrate:rollback
```

**Output:**
```
⏮️  Starting AgentDB Migration Rollback...

✓ Found latest backup: /path/to/agentdb.db.backup.1731759123456

🔍 Verifying backup integrity...
✓ Backup integrity verified

♻️  Restoring backup...
  Safety backup: /path/to/agentdb.db.pre-rollback.1731759234567
✓ Backup restored to: /path/to/agentdb.db

🔐 Verifying restoration...
✓ Restoration verified

✅ Rollback Complete!

Summary:
  Backup:     /path/to/agentdb.db.backup.1731759123456
  Restored:   /path/to/agentdb.db
  Checksum:   a1b2c3d4...
```

### Rollback with Cleanup

Remove the migrated database:

```bash
npm run migrate:rollback -- --cleanup
```

### Rollback from Specific Backup

```bash
npm run migrate:rollback -- --backup-file=agentdb.db.backup.1731759123456
```

## Migration Options

### Command-Line Flags

| Flag | Description | Default |
|------|-------------|---------|
| `--dry-run` | Preview changes without executing | `false` |
| `--no-backup` | Skip backup creation | `false` (backup enabled) |
| `--verbose` | Show detailed output | `false` |
| `-v` | Alias for `--verbose` | `false` |

### Examples

```bash
# Preview migration
npm run migrate:agentdb -- --dry-run

# Migrate without backup (not recommended)
npm run migrate:agentdb -- --no-backup

# Migrate with verbose output
npm run migrate:agentdb -- --verbose

# Rollback with cleanup
npm run migrate:rollback -- --cleanup --verbose
```

## Schema v2.0 Enhancements

The migration automatically applies the following schema enhancements:

### 1. Performance Indexes

```sql
CREATE INDEX IF NOT EXISTS idx_episodes_session_id ON episodes(session_id);
CREATE INDEX IF NOT EXISTS idx_episodes_task ON episodes(task);
CREATE INDEX IF NOT EXISTS idx_episodes_created_at ON episodes(created_at);
CREATE INDEX IF NOT EXISTS idx_episodes_success ON episodes(success);
CREATE INDEX IF NOT EXISTS idx_episodes_reward ON episodes(reward);
CREATE INDEX IF NOT EXISTS idx_patterns_type ON patterns(type);
CREATE INDEX IF NOT EXISTS idx_patterns_domain ON patterns(domain);
CREATE INDEX IF NOT EXISTS idx_patterns_created_at ON patterns(created_at);
```

### 2. Metadata Columns

```sql
-- Episodes table
ALTER TABLE episodes ADD COLUMN metadata TEXT;
ALTER TABLE episodes ADD COLUMN tags TEXT;
ALTER TABLE episodes ADD COLUMN version TEXT DEFAULT "2.0";

-- Patterns table
ALTER TABLE patterns ADD COLUMN metadata TEXT;
ALTER TABLE patterns ADD COLUMN tags TEXT;
ALTER TABLE patterns ADD COLUMN version TEXT DEFAULT "2.0";
```

### 3. Database Optimization

```sql
ANALYZE;  -- Update query planner statistics
VACUUM;   -- Reclaim unused space and defragment
```

## Configuration Updates

After migration, the following components will use the new database location:

### AgentDBManager

```typescript
// Default configuration now uses .agentic-qe/agentdb.db
const config: AgentDBConfig = {
  dbPath: '.agentic-qe/agentdb.db',
  // ... other options
};
```

### CLI Commands

All CLI commands will automatically use the new location:

```bash
aqe learn status --agent test-gen
aqe patterns list --framework jest
```

## Troubleshooting

### Migration Fails with Checksum Mismatch

**Error:**
```
❌ Migration failed: Checksum mismatch! Data corruption detected during copy.
```

**Solution:**
1. Check disk space: `df -h`
2. Verify source database: `sqlite3 agentdb.db "PRAGMA integrity_check"`
3. Run migration again with verbose mode: `npm run migrate:agentdb -- --verbose`

### No Backup Files Found

**Error:**
```
❌ Rollback failed: No backup files found. Cannot rollback.
```

**Solution:**
1. Check for manual backups in project root: `ls -lh agentdb.db.backup.*`
2. If migration completed, restore from `.agentic-qe/agentdb.db`
3. Specify backup file manually: `npm run migrate:rollback -- --backup-file=path/to/backup`

### Target Directory Already Exists

**Warning:**
```
⚠ Existing database found, backing up to: .agentic-qe/agentdb.db.old.1731759123456
```

**Solution:**
This is normal. The migration automatically backs up any existing target database.

### Integrity Check Failed

**Error:**
```
❌ Migration failed: Source database integrity check failed!
```

**Solution:**
1. Backup current database: `cp agentdb.db agentdb.db.manual-backup`
2. Try to repair: `sqlite3 agentdb.db "PRAGMA integrity_check"`
3. If corrupted, restore from last known good backup

## Best Practices

### Before Migration

1. **Verify current state:**
   ```bash
   sqlite3 agentdb.db "SELECT COUNT(*) FROM episodes"
   ```

2. **Run dry-run:**
   ```bash
   npm run migrate:dry-run
   ```

3. **Ensure disk space:**
   ```bash
   df -h .
   ```

### After Migration

1. **Verify record counts:**
   ```bash
   sqlite3 .agentic-qe/agentdb.db "SELECT COUNT(*) FROM episodes"
   ```

2. **Test basic queries:**
   ```bash
   aqe learn status
   ```

3. **Keep backup:**
   Don't delete the backup file (`agentdb.db.backup.*`) for at least 7 days

### Production Migrations

For production systems:

1. **Schedule downtime** - Run during low-usage period
2. **Test on staging** - Run migration on a copy first
3. **Monitor performance** - Check query performance after migration
4. **Keep multiple backups** - Create manual backups before migration

## Files Created

### Migration

- **Target Database:** `.agentic-qe/agentdb.db`
- **Backup:** `agentdb.db.backup.[timestamp]`
- **Old Target (if exists):** `.agentic-qe/agentdb.db.old.[timestamp]`

### Rollback

- **Safety Backup:** `agentdb.db.pre-rollback.[timestamp]`
- **Removed Target:** `.agentic-qe/agentdb.db.removed.[timestamp]`

## NPM Scripts Reference

```json
{
  "scripts": {
    "migrate:agentdb": "tsx scripts/migrate-to-agentdb.ts",
    "migrate:dry-run": "tsx scripts/migrate-to-agentdb.ts --dry-run",
    "migrate:rollback": "tsx scripts/rollback-migration.ts"
  }
}
```

## Support

For issues or questions:

1. Check this guide's troubleshooting section
2. Review migration logs for error details
3. Open an issue on GitHub with migration output
4. Include checksums and record counts in bug reports

## Changelog

### Version 2.0 (Current)

- ✅ SHA-256 checksum verification
- ✅ Automatic backup creation
- ✅ Schema enhancements (indexes, metadata)
- ✅ Dry-run mode
- ✅ Rollback capability
- ✅ Progress reporting
- ✅ Error handling and recovery

### Version 1.0 (Legacy)

- Database stored in project root (`agentdb.db`)
- No schema versioning
- Manual backup required
