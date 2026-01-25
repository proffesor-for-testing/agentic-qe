# Migration Integration Tests

Quick reference for running database migration integration tests.

## Test Files

- **backup-restore.test.ts** - Backup creation and restoration (332 lines, ~12 tests)
- **data-integrity.test.ts** - Data preservation and validation (500 lines, ~25 tests)
- **rollback.test.ts** - Rollback functionality (463 lines, ~18 tests)

## Quick Commands

```bash
# Run all migration integration tests
npm run test:integration -- --testPathPattern="backup-restore|data-integrity|rollback"

# Run individual test suites
npm run test:integration -- --testPathPattern=backup-restore
npm run test:integration -- --testPathPattern=data-integrity
npm run test:integration -- --testPathPattern=rollback

# Run with coverage
npm run test:integration -- --testPathPattern=data-integrity --coverage

# Run specific test
npm run test:integration -- --testPathPattern=rollback -t "should restore original schema"

# Run all migration tests (unit + integration)
./scripts/test-migration.sh
```

## What's Tested

### Backup & Restore
✅ Backup creation with timestamps and checksums
✅ All tables included in backups
✅ Data preservation in backups
✅ Corrupted backup detection
✅ Database restoration from backup
✅ Integrity after restoration

### Data Integrity
✅ Complete data migration (100 episodes, 50 patterns)
✅ JSON data integrity
✅ Numeric precision preservation
✅ Index preservation and functionality
✅ Query performance (<100ms for 100 queries)
✅ Complex joins (<50ms) and aggregations (<20ms)
✅ Special character handling
✅ Edge cases (empty strings, long text)

### Rollback
✅ Schema restoration to original state
✅ Data restoration with zero loss
✅ Post-rollback system functionality (CRUD)
✅ Database integrity checks
✅ Transaction support
✅ Partial migration rollback
✅ Multi-version rollback

## Performance Benchmarks

- **Indexed queries**: <100ms for 100 queries
- **Complex joins**: <50ms
- **Aggregations**: <20ms
- **Insert 10k records**: <5 seconds

## Test Data

Tests use realistic data:
- 100 episodes (ReasoningBank)
- 50 patterns
- Multiple sessions
- Various agent types
- JSON metadata

## Common Issues

**Tests failing?**
1. Check if `.tmp` directories exist
2. Verify better-sqlite3 is installed
3. Ensure write permissions
4. Clear old test artifacts

**Performance slow?**
1. Check disk space
2. Verify SSD usage
3. Reduce concurrent test runs

**Database errors?**
1. Verify schema is up to date
2. Check for file locks
3. Ensure proper cleanup in afterEach

## See Also

- `/workspaces/agentic-qe-cf/docs/testing/migration-test-suite.md` - Full documentation
- `/workspaces/agentic-qe-cf/docs/testing/MIGRATION-TEST-SUMMARY.md` - Implementation summary
- `/workspaces/agentic-qe-cf/scripts/test-migration.sh` - Test execution script
