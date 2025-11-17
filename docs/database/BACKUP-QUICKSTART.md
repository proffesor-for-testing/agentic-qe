# Backup System Quick Start

## 5-Minute Quick Start

### Create Your First Backup

```bash
# Create a verified backup of all databases
./scripts/backup-databases.sh --verify

# Create compressed backup (recommended for storage)
./scripts/backup-databases.sh --compress --verify
```

### List Available Backups

```bash
./scripts/manage-backups.sh list
```

Output:
```
📦 Available Backups
===================

[1] 20250116-120000
    Date: 2025-01-16T12:00:00Z
    Files: 4 | Size: 21M
    Branch: main (4a58796)
    Compressed: 8.5M

[2] 20250115-140000
    Date: 2025-01-15T14:00:00Z
    Files: 4 | Size: 20M
    Branch: main (25cb212)
```

### Restore from Backup

```bash
# List backups and select timestamp
./scripts/restore-databases.sh

# Restore specific backup
./scripts/restore-databases.sh 20250116-120000

# Force restore without confirmation (automation)
./scripts/restore-databases.sh 20250116-120000 --force
```

## Common Operations

### Before Migration

```bash
# Create safety backup before risky operation
./scripts/backup-databases.sh --compress --verify
```

### After Failed Operation

```bash
# List recent backups
./scripts/manage-backups.sh list

# Restore to previous state
./scripts/restore-databases.sh <timestamp> --force
```

### Verify Backup Health

```bash
# Verify specific backup
./scripts/manage-backups.sh verify 20250116-120000

# Verify all backups
./scripts/manage-backups.sh verify

# Compare backup with current state
./scripts/manage-backups.sh compare 20250116-120000
```

### Manage Storage

```bash
# Check storage usage
./scripts/manage-backups.sh size

# Clean old backups (keep last 10)
./scripts/manage-backups.sh clean 10

# Get backup details
./scripts/manage-backups.sh info 20250116-120000
```

## Integration with Code

### TypeScript/Node.js

```typescript
import { backupHelper } from './src/scripts/backup-helper';

// Create backup
const backup = await backupHelper.createBackup({
  compress: true,
  verify: true
});

console.log(`Backup created: ${backup.timestamp}`);

// Restore backup
await backupHelper.restoreBackup(backup.timestamp, {
  verify: true,
  force: true
});

// List backups
const backups = await backupHelper.listBackups();
console.log(`Found ${backups.length} backups`);
```

### Migration Example

```typescript
import { backupHelper } from './src/scripts/backup-helper';

async function safeMigration() {
  // Create safety backup
  const backup = await backupHelper.createSafetyBackup('my-migration');

  try {
    // Perform migration
    await performMigration();
  } catch (error) {
    // Restore on failure
    await backupHelper.restoreBackup(backup.timestamp, {
      force: true
    });
    throw error;
  }
}
```

## Automation

### Daily Backups (GitHub Actions)

The workflow is already configured in `.github/workflows/backup-databases.yml`

Runs daily at 2 AM UTC automatically.

### Manual Trigger

```bash
# Via GitHub UI
Actions > Daily Database Backup > Run workflow

# Via gh CLI
gh workflow run backup-databases.yml
```

### Cron Job (Linux/Mac)

```bash
# Edit crontab
crontab -e

# Add daily backup at 2 AM
0 2 * * * cd /path/to/project && ./scripts/backup-databases.sh --compress --verify
```

## Testing

### Run Full Test Suite

```bash
# Run backup system tests
./scripts/test-backup-system.sh
```

### Integration Tests

```bash
# Run Jest integration tests
npm run test:integration -- backup-restore.test.ts
```

## Troubleshooting

### Backup Failed

```bash
# Check disk space
df -h

# Check permissions
ls -la .agentic-qe/backups

# Verify script is executable
chmod +x ./scripts/backup-databases.sh
```

### Restore Failed

```bash
# Verify backup exists
./scripts/manage-backups.sh list

# Check backup integrity
./scripts/manage-backups.sh verify <timestamp>

# Try force restore
./scripts/restore-databases.sh <timestamp> --force
```

### Out of Storage

```bash
# Check current usage
./scripts/manage-backups.sh size

# Clean old backups (keep last 5)
./scripts/manage-backups.sh clean 5

# Remove compressed archives
rm .agentic-qe/backups/*.tar.gz
```

## Best Practices

### ✅ DO

- Create backup before every migration
- Verify backups regularly
- Test restore procedures
- Use compression for long-term storage
- Keep multiple backup generations
- Monitor storage usage

### ❌ DON'T

- Skip backup verification
- Delete backups without checking
- Run migrations without backup
- Ignore backup failures
- Store backups only locally
- Exceed storage quotas

## Emergency Recovery

### Complete Data Loss

```bash
# 1. Check for backups
./scripts/manage-backups.sh list

# 2. Identify most recent good backup
./scripts/manage-backups.sh verify <timestamp>

# 3. Restore
./scripts/restore-databases.sh <timestamp> --force

# 4. Verify restoration
sqlite3 agentdb.db "SELECT COUNT(*) FROM episodes"
```

### Corrupted Backup

```bash
# 1. Verify corruption
./scripts/manage-backups.sh verify <timestamp>

# 2. Try previous backup
./scripts/manage-backups.sh list
./scripts/restore-databases.sh <previous-timestamp> --force
```

## Support

- Full Documentation: [docs/database/backup-strategy.md](./backup-strategy.md)
- GitHub Issues: [agentic-qe-cf/issues](https://github.com/ruvnet/agentic-qe-cf/issues)
- Test Scripts: `./scripts/test-backup-system.sh`

## Quick Reference

| Command | Purpose |
|---------|---------|
| `./scripts/backup-databases.sh` | Create backup |
| `./scripts/restore-databases.sh <ts>` | Restore backup |
| `./scripts/manage-backups.sh list` | List backups |
| `./scripts/manage-backups.sh verify <ts>` | Verify integrity |
| `./scripts/manage-backups.sh clean N` | Keep last N |
| `./scripts/manage-backups.sh size` | Show storage |
| `./scripts/test-backup-system.sh` | Run tests |

**Remember**: Always verify backups before relying on them!
