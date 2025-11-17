# AgentDB v2.0 Implementation Checklist

## 📋 Pre-Migration Phase

### Documentation Review
- [ ] Read [SCHEMA-V2-SUMMARY.md](SCHEMA-V2-SUMMARY.md) (10 min)
- [ ] Review [migration-v1-to-v2.md](migration-v1-to-v2.md) (20 min)
- [ ] Browse [example-queries.sql](example-queries.sql) (10 min)
- [ ] Study [schema-diagram.md](schema-diagram.md) (15 min)

### Environment Preparation
- [ ] Verify Node.js installed with `better-sqlite3`
- [ ] Check current database location: `/workspaces/agentic-qe-cf/agentdb.db`
- [ ] Verify disk space: ~100MB free for migration
- [ ] Ensure no running processes using databases:
  ```bash
  lsof | grep agentdb.db
  lsof | grep patterns.db
  lsof | grep memory.db
  ```

### Backup Current State
- [ ] Create backup directory:
  ```bash
  mkdir -p /workspaces/agentic-qe-cf/.agentic-qe/backup-$(date +%Y%m%d-%H%M%S)
  ```
- [ ] Backup `agentdb.db` (1,759 episodes)
- [ ] Backup `.agentic-qe/patterns.db` (0 patterns, schema only)
- [ ] Backup `.agentic-qe/memory.db` (Q-values, metrics)
- [ ] Verify backups are readable:
  ```bash
  node -e "const db = require('better-sqlite3')('./backup/agentdb.db', {readonly:true}); console.log('Episodes:', db.prepare('SELECT COUNT(*) as c FROM episodes').get().c);"
  ```

---

## 🔨 Migration Phase

### Step 1: Create v2.0 Schema
- [ ] Create new database from schema:
  ```bash
  node -e "
  const Database = require('better-sqlite3');
  const fs = require('fs');
  const db = new Database('./agentdb-v2.db');
  const schema = fs.readFileSync('./docs/database/schema-v2.sql', 'utf8');
  db.exec(schema);
  db.close();
  console.log('✅ Schema v2.0 created');
  "
  ```
- [ ] Verify schema version:
  ```bash
  node -e "const db = require('better-sqlite3')('./agentdb-v2.db', {readonly:true}); console.log(db.prepare('SELECT * FROM schema_version').get());"
  ```

### Step 2: Migrate Episodes (1,759 rows)
- [ ] Create `migrate-episodes.js` from migration guide
- [ ] Run episode migration:
  ```bash
  node migrate-episodes.js
  ```
- [ ] Verify episode count:
  ```bash
  node -e "const db = require('better-sqlite3')('./agentdb-v2.db', {readonly:true}); console.log('Episodes:', db.prepare('SELECT COUNT(*) FROM episodes').get());"
  ```
- [ ] Expected output: `Episodes: { 'COUNT(*)': 1759 }`

### Step 3: Migrate Patterns (0 rows expected)
- [ ] Create `migrate-patterns.js` from migration guide
- [ ] Run pattern migration:
  ```bash
  node migrate-patterns.js
  ```
- [ ] Expected: "No patterns to migrate" message

### Step 4: Migrate Learning Data
- [ ] Create `migrate-learning-data.js` from migration guide
- [ ] Run learning data migration:
  ```bash
  node migrate-learning-data.js
  ```
- [ ] Verify tables populated:
  - [ ] `learning_metrics`
  - [ ] `q_values`
  - [ ] `learning_experiences`

### Step 5: Verification
- [ ] Create `verify-migration.js` from migration guide
- [ ] Run comprehensive verification:
  ```bash
  node verify-migration.js
  ```
- [ ] Check output for:
  - [ ] Episodes: 1,759 ✅
  - [ ] Schema version: 2.0.0 ✅
  - [ ] Indexes created: 40+ ✅
  - [ ] Views created: 3 ✅
  - [ ] Triggers created: 5 ✅
  - [ ] Sample query performance: < 100ms ✅

---

## ✅ Post-Migration Phase

### Switch to v2.0
- [ ] Stop all processes using old database
- [ ] Rename old database:
  ```bash
  mv agentdb.db agentdb-v1-backup.db
  ```
- [ ] Activate new database:
  ```bash
  mv agentdb-v2.db agentdb.db
  ```

### Performance Testing
- [ ] Create `test-performance.js` from migration guide
- [ ] Run performance benchmarks:
  ```bash
  node test-performance.js
  ```
- [ ] Verify all queries < 100ms:
  - [ ] Pattern by ID: < 1ms
  - [ ] Framework filter: < 10ms
  - [ ] Similarity search: < 50ms
  - [ ] Full-text search: < 100ms
  - [ ] Aggregate queries: < 100ms

### Application Code Updates
- [ ] Update database connection to use single unified database
- [ ] Remove references to `patterns.db` and `memory.db`
- [ ] Test all existing queries work with new schema
- [ ] Update any hardcoded column references

### Data Population
- [ ] Run test generation to populate new columns:
  - [ ] `episodes.test_framework`
  - [ ] `episodes.test_type`
  - [ ] `episodes.coverage_before`
  - [ ] `episodes.coverage_after`
  - [ ] `episodes.test_count`
  - [ ] `episodes.quality_score`

---

## 🔍 Validation Phase

### Data Integrity Checks
- [ ] Verify no duplicate patterns:
  ```sql
  SELECT code_signature_hash, framework, COUNT(*)
  FROM test_patterns
  GROUP BY code_signature_hash, framework
  HAVING COUNT(*) > 1;
  ```
  Expected: 0 rows

- [ ] Check JSON validity:
  ```sql
  SELECT COUNT(*) FROM test_patterns
  WHERE json_valid(code_signature) = 0
     OR json_valid(test_template) = 0
     OR json_valid(metadata) = 0;
  ```
  Expected: 0

- [ ] Verify constraint compliance:
  ```sql
  SELECT COUNT(*) FROM episodes
  WHERE (reward < 0 OR reward > 1)
     OR (coverage_before < 0 OR coverage_before > 100)
     OR (coverage_after < 0 OR coverage_after > 100);
  ```
  Expected: 0

### Query Functionality Tests
- [ ] Test FTS search works:
  ```sql
  SELECT COUNT(*) FROM pattern_fts;
  ```

- [ ] Test views are accessible:
  ```sql
  SELECT COUNT(*) FROM v_pattern_performance;
  SELECT COUNT(*) FROM v_agent_learning_progress;
  SELECT COUNT(*) FROM v_top_patterns;
  ```

- [ ] Test triggers fire correctly:
  - [ ] Insert test pattern usage
  - [ ] Verify `usage_count` increments
  - [ ] Verify `success_rate` updates
  - [ ] Verify `trend` calculation works

### Performance Validation
- [ ] Run `ANALYZE` to update statistics
- [ ] Verify index usage with `EXPLAIN QUERY PLAN`
- [ ] Check cache effectiveness:
  ```sql
  SELECT COUNT(*) FROM pattern_stats_cache;
  ```

---

## 📝 Documentation Updates

### Update Application Docs
- [ ] Update architecture diagrams
- [ ] Update database schema references
- [ ] Update query examples in docs
- [ ] Update troubleshooting guides

### Update Developer Guides
- [ ] Update local setup instructions
- [ ] Update testing procedures
- [ ] Update backup procedures
- [ ] Add migration notes to changelog

### Team Communication
- [ ] Notify team of schema changes
- [ ] Share migration timeline
- [ ] Provide rollback instructions
- [ ] Schedule post-migration review

---

## 🚨 Rollback Plan (If Needed)

### Rollback Procedure
- [ ] Stop all processes using v2.0 database
- [ ] Restore from backup:
  ```bash
  cp /path/to/backup/agentdb.db ./agentdb.db
  cp /path/to/backup/patterns.db ./.agentic-qe/patterns.db
  cp /path/to/backup/memory.db ./.agentic-qe/memory.db
  ```
- [ ] Verify backup restoration:
  ```bash
  node verify-v1-backup.js
  ```
- [ ] Document rollback reason
- [ ] Plan retry with fixes

---

## 📊 Success Metrics

### Data Preservation
- [ ] All 1,759 episodes migrated successfully
- [ ] Zero data loss confirmed
- [ ] All metadata preserved
- [ ] Relationships maintained

### Performance
- [ ] All queries meet performance targets
- [ ] No degradation in application speed
- [ ] Index usage confirmed
- [ ] Cache working as expected

### Functionality
- [ ] All existing features work
- [ ] New features accessible
- [ ] Views return correct data
- [ ] Triggers execute properly

---

## 🎯 Next Steps After Migration

### Week 1: Monitoring
- [ ] Monitor query performance daily
- [ ] Track database file size growth
- [ ] Watch for any error logs
- [ ] Collect user feedback

### Week 2: Optimization
- [ ] Generate embeddings for existing patterns
- [ ] Build similarity index
- [ ] Populate pattern statistics cache
- [ ] Tune SQLite settings based on usage

### Week 3: Enhancement
- [ ] Start collecting test context in episodes
- [ ] Begin pattern creation from successful tests
- [ ] Track learning metrics
- [ ] Monitor Q-value convergence

### Month 1: Analysis
- [ ] Analyze learning progress
- [ ] Identify high-performing patterns
- [ ] Review cross-project pattern sharing
- [ ] Plan v2.1 enhancements

---

## 🔧 Maintenance Tasks

### Daily
- [ ] Monitor database size
- [ ] Check query performance
- [ ] Review error logs

### Weekly
- [ ] Clear expired cache:
  ```sql
  DELETE FROM pattern_stats_cache
  WHERE strftime('%s', 'now') > expires_at;
  ```
- [ ] Review learning metrics trends
- [ ] Check pattern usage statistics

### Monthly
- [ ] Run `VACUUM` to reclaim space
- [ ] Run `ANALYZE` to update statistics
- [ ] Rebuild indexes if needed: `REINDEX`
- [ ] Archive old episodes (optional)
- [ ] Review and update documentation

---

## 📞 Support Contacts

**Migration Issues**:
- Check [migration-v1-to-v2.md](migration-v1-to-v2.md) troubleshooting section
- Review [QUICK-REFERENCE.md](QUICK-REFERENCE.md) for commands

**Schema Questions**:
- See [schema-v2.md](schema-v2.md) for detailed documentation
- Check [schema-diagram.md](schema-diagram.md) for architecture

**Query Help**:
- Browse [example-queries.sql](example-queries.sql) for patterns
- Reference [QUICK-REFERENCE.md](QUICK-REFERENCE.md) for common queries

---

## ✅ Sign-Off

### Pre-Migration Sign-Off
- [ ] Technical lead reviewed plan
- [ ] Backup strategy approved
- [ ] Rollback plan tested
- [ ] Team notified of schedule

Date: ________________
Signed: ________________

### Post-Migration Sign-Off
- [ ] All episodes migrated (1,759/1,759)
- [ ] Performance targets met
- [ ] Functionality verified
- [ ] Documentation updated
- [ ] Team trained on new schema

Date: ________________
Signed: ________________

---

**Schema Version**: 2.0.0
**Migration Date**: ________________
**Completion Time**: ________ minutes (target: 3-5 min)
**Data Preserved**: ________ / 1,759 episodes (target: 100%)
**Status**: ⬜ Not Started | ⬜ In Progress | ⬜ Completed | ⬜ Rolled Back
