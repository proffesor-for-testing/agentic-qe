# Database Backup Strategy

## Overview

This document describes the comprehensive backup and restore system for the Agentic QE Fleet database infrastructure. The system ensures zero data loss during migrations, updates, and critical operations.

## Components

### 1. Backup Scripts

#### `/scripts/backup-databases.sh`

**Purpose**: Create verified backups of all databases with checksums

**Usage**:
```bash
./scripts/backup-databases.sh [--compress] [--verify]
```

**Options**:
- `--compress`: Create compressed tar.gz archive of backups
- `--no-verify`: Skip checksum verification (not recommended)

**Features**:
- ✅ SHA-256 checksums for integrity verification
- ✅ Metadata tracking (timestamp, git branch, commit)
- ✅ Automatic cleanup (keeps last 10 backups by default)
- ✅ File size reporting
- ✅ Supports agentdb.db and all .agentic-qe/*.db files

**Output**:
```
.agentic-qe/backups/
├── agentdb.db.backup.20250116-120000
├── agentdb.db.backup.20250116-120000.sha256
├── backup-metadata.20250116-120000.json
├── qe-learning.db.backup.20250116-120000
├── qe-learning.db.backup.20250116-120000.sha256
└── databases-backup-20250116-120000.tar.gz (if --compress)
```

#### `/scripts/restore-databases.sh`

**Purpose**: Restore databases from backup with verification

**Usage**:
```bash
./scripts/restore-databases.sh <timestamp> [--verify] [--force]
```

**Options**:
- `--no-verify`: Skip checksum verification before restore
- `--force`: Skip confirmation prompt (for automation)

**Safety Features**:
- ⚠️ Creates safety backup of current state before restore
- ✅ Checksum verification before applying restore
- ✅ Interactive confirmation (unless --force)
- ✅ Detailed restore summary

**Example**:
```bash
# List available backups
./scripts/restore-databases.sh

# Restore specific backup
./scripts/restore-databases.sh 20250116-120000

# Force restore (no prompts)
./scripts/restore-databases.sh 20250116-120000 --force
```

#### `/scripts/manage-backups.sh`

**Purpose**: Manage, verify, and analyze backups

**Commands**:

```bash
# List all backups with metadata
./scripts/manage-backups.sh list

# Clean old backups (keep last N)
./scripts/manage-backups.sh clean 10

# Verify backup integrity
./scripts/manage-backups.sh verify 20250116-120000

# Compare backup with current state
./scripts/manage-backups.sh compare 20250116-120000

# Show backup details
./scripts/manage-backups.sh info 20250116-120000

# Show storage usage
./scripts/manage-backups.sh size
```

### 2. Programmatic API

#### `src/scripts/backup-helper.ts`

TypeScript helper for integration with migration scripts and application code.

**Key Methods**:

```typescript
import { backupHelper } from './src/scripts/backup-helper';

// Create backup
const result = await backupHelper.createBackup({
  compress: true,
  verify: true
});

// Restore from backup
const restore = await backupHelper.restoreBackup(timestamp, {
  verify: true,
  force: true
});

// List backups
const backups = await backupHelper.listBackups();

// Verify integrity
const isValid = await backupHelper.verifyBackup(timestamp);

// Clean old backups
const removed = await backupHelper.cleanOldBackups(10);

// Safety backup before dangerous operation
const safety = await backupHelper.createSafetyBackup('migration');
```

### 3. Automated Backups

#### `.github/workflows/backup-databases.yml`

GitHub Actions workflow for automated daily backups.

**Schedule**: Daily at 2 AM UTC

**Features**:
- Automatic backup creation
- Upload to GitHub Artifacts (30-day retention)
- Backup verification
- Automatic cleanup of old backups
- Failure notifications (creates GitHub issue)
- Manual trigger support

**Manual Trigger**:
```bash
# Via GitHub UI: Actions > Daily Database Backup > Run workflow

# Via gh CLI:
gh workflow run backup-databases.yml
```

## Backup Strategy

### Retention Policy

| Backup Type | Retention | Purpose |
|-------------|-----------|---------|
| Daily automated | 30 days | Regular snapshots |
| Manual backups | Until manually deleted | Important milestones |
| Safety backups | 7 days | Pre-operation safety net |
| Compressed archives | 90 days | Long-term storage |

### Storage Locations

1. **Local**: `.agentic-qe/backups/` (development)
2. **CI/CD**: GitHub Artifacts (automated backups)
3. **Production**: External backup service (recommended)

### Backup Frequency

- **Automated**: Daily (2 AM UTC)
- **Before migration**: Automatic via migration script
- **Before major updates**: Manual backup recommended
- **Before dangerous operations**: Automatic safety backup

## Security

### Checksum Verification

All backups use SHA-256 checksums for integrity verification:

```bash
# Create backup with checksum
sha256sum agentdb.db > backup.db.sha256

# Verify backup
sha256sum -c backup.db.sha256
```

### Metadata Tracking

Each backup includes metadata for audit trail:

```json
{
  "timestamp": "20250116-120000",
  "date": "2025-01-16T12:00:00Z",
  "hostname": "dev-machine",
  "user": "developer",
  "git_commit": "4a58796",
  "git_branch": "main",
  "compressed": true
}
```

## Migration Integration

The backup system integrates with migration scripts:

```typescript
// In migrate-to-agentdb.ts
import { backupHelper } from './src/scripts/backup-helper';

async function runMigration() {
  // 1. Create safety backup
  console.log('Creating pre-migration backup...');
  const backup = await backupHelper.createSafetyBackup('agentdb-migration');

  if (!backup.success) {
    console.error('Backup failed! Aborting migration.');
    process.exit(1);
  }

  // 2. Run migration
  try {
    await performMigration();
  } catch (error) {
    // 3. Restore on failure
    console.error('Migration failed! Restoring backup...');
    await backupHelper.restoreBackup(backup.timestamp, {
      force: true
    });
    throw error;
  }

  // 4. Verify migration success
  await verifyMigration();
}
```

## Disaster Recovery

### Recovery Procedures

#### 1. Data Corruption Detected

```bash
# List recent backups
./scripts/manage-backups.sh list

# Verify specific backup
./scripts/manage-backups.sh verify 20250116-120000

# Restore
./scripts/restore-databases.sh 20250116-120000
```

#### 2. Accidental Deletion

```bash
# Restore from most recent backup
latest=$(ls -1 .agentic-qe/backups/*.backup.* | \
  sed 's/.*backup\.//' | cut -d'.' -f1 | sort -r | head -1)
./scripts/restore-databases.sh $latest
```

#### 3. Failed Migration

```bash
# Safety backup is automatically created
# Check restore instructions in migration output
./scripts/restore-databases.sh <safety-timestamp> --force
```

### Recovery Time Objectives (RTO)

| Scenario | Target RTO | Procedure |
|----------|------------|-----------|
| Single file corruption | < 5 minutes | Restore from backup |
| Complete database loss | < 15 minutes | Restore from latest backup |
| Failed migration | < 2 minutes | Automatic safety restore |
| Backup corruption | < 30 minutes | Restore from previous backup |

## Testing

### Integration Tests

```bash
# Run backup/restore tests
npm run test:integration -- backup-restore.test.ts
```

### Manual Testing

```bash
# 1. Create test database
sqlite3 test.db "CREATE TABLE test(id INTEGER)"

# 2. Create backup
./scripts/backup-databases.sh --verify

# 3. Modify database
sqlite3 test.db "DROP TABLE test"

# 4. Restore
./scripts/restore-databases.sh <timestamp> --force

# 5. Verify restoration
sqlite3 test.db "SELECT * FROM test"
```

## Monitoring

### Backup Health Checks

```bash
# Check backup storage
./scripts/manage-backups.sh size

# Verify all backups
./scripts/manage-backups.sh verify

# Check for old backups
./scripts/manage-backups.sh list
```

### Alerts

GitHub Actions workflow creates issues for:
- Backup failures
- Verification failures
- Storage quota warnings

## Best Practices

### DO ✅

- Always create backup before migration
- Verify backups regularly
- Test restore procedures
- Monitor backup storage
- Use compression for long-term storage
- Keep multiple backup generations
- Document recovery procedures

### DON'T ❌

- Skip backup verification
- Delete backups manually without checking
- Ignore backup failures
- Run migrations without backup
- Store backups only locally
- Exceed storage quotas
- Forget to test restore procedures

## Troubleshooting

### Issue: Backup Verification Failed

```bash
# Check file integrity
./scripts/manage-backups.sh verify <timestamp>

# Compare with current state
./scripts/manage-backups.sh compare <timestamp>

# Create new backup
./scripts/backup-databases.sh --verify
```

### Issue: Insufficient Storage

```bash
# Check current usage
./scripts/manage-backups.sh size

# Clean old backups
./scripts/manage-backups.sh clean 5

# Remove compressed archives
rm .agentic-qe/backups/*.tar.gz
```

### Issue: Restore Confirmation Timeout

```bash
# Use force flag
./scripts/restore-databases.sh <timestamp> --force
```

## Automation

### Pre-commit Hook

```bash
# .git/hooks/pre-push
#!/bin/bash
./scripts/backup-databases.sh --compress
```

### Cron Job

```cron
# Daily backup at 2 AM
0 2 * * * /path/to/scripts/backup-databases.sh --compress --verify
```

### CI/CD Integration

```yaml
# In your CI/CD pipeline
- name: Create backup
  run: ./scripts/backup-databases.sh --compress

- name: Run tests
  run: npm test

- name: Restore on failure
  if: failure()
  run: ./scripts/restore-databases.sh $BACKUP_TIMESTAMP --force
```

## Compliance

### Data Retention

Backups comply with data retention policies:
- Development: 30 days
- Staging: 60 days
- Production: 90 days

### Encryption

For production environments:
```bash
# Encrypt backup
gpg --encrypt --recipient admin@example.com backup.tar.gz

# Decrypt backup
gpg --decrypt backup.tar.gz.gpg > backup.tar.gz
```

## References

- [SQLite Backup API](https://www.sqlite.org/backup.html)
- [GitHub Artifacts Documentation](https://docs.github.com/en/actions/using-workflows/storing-workflow-data-as-artifacts)
- [Data Recovery Best Practices](https://en.wikipedia.org/wiki/Disaster_recovery)

## Change Log

| Date | Version | Changes |
|------|---------|---------|
| 2025-01-16 | 1.0.0 | Initial backup system implementation |

## Support

For issues or questions:
- GitHub Issues: [agentic-qe-cf/issues](https://github.com/ruvnet/agentic-qe-cf/issues)
- Documentation: [docs/database/](https://github.com/ruvnet/agentic-qe-cf/tree/main/docs/database)
