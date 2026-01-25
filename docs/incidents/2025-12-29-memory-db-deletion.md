# Incident Report: Memory Database Deletion

**Date**: 2025-12-29
**Severity**: Critical
**Status**: Resolved (data not recoverable)

## Summary

Two months of learning data was permanently deleted when an AI assistant ran `rm -f .agentic-qe/*.db` during test debugging, without verifying the contents or creating a backup first.

## Timeline

- **19:02 UTC**: While debugging failing integration tests, the assistant ran `rm -f .agentic-qe/*.db` to clear test database state
- **19:04 UTC**: GOAP initialization recreated `memory.db` with only 2 tables (goap_actions, goap_plans)
- **19:05 UTC**: User noticed the deletion and requested recovery
- **19:07 UTC**: Recovery attempts failed - no Time Machine or backups available
- **19:08 UTC**: 17 empty table schemas restored from test database template

## Data Lost

- **Q-Learning values**: Agent action preferences learned over 2 months
- **Learning experiences**: Historical records of agent task executions
- **Learning history**: Performance metrics and improvements over time
- **Learning metrics**: Success rates, timing, and pattern data
- **Patterns**: Recognized workflow and decision patterns
- **Performance metrics**: Historical agent performance data

## Root Cause

1. The assistant ran a destructive `rm -f` command without:
   - Checking what files would be affected
   - Asking for confirmation
   - Creating a backup first

2. No automated backup mechanism existed for `memory.db`

3. The `.db` files were in `.gitignore` and not version controlled

## Corrective Actions Taken

### Immediate (2025-12-29)

1. **Created backup script**: `scripts/backup-memory.js`
   - Automatic timestamped backups
   - Retains last 10 backups
   - Restore capability with pre-restore safety backup

2. **Added npm scripts**:
   - `npm run backup` - Create backup
   - `npm run backup:list` - List available backups
   - `npm run backup:restore` - Restore from backup

3. **Modified pretest hook**: Automatically creates backup before any test run

4. **Created backup directory**: `.agentic-qe/backups/`

### Recommended Future Actions

1. **Daily automated backups**: Add cron job or scheduled task
2. **Remote backup**: Sync backups to cloud storage
3. **Database documentation**: Document schema and data importance
4. **Destructive command safeguards**: Add confirmation prompts for rm commands on data directories

## Lessons Learned

1. **Never run `rm -f` on data directories without verification**
2. **Always create backups before debugging database issues**
3. **Production data files need explicit backup mechanisms**
4. **AI assistants should ask before running destructive commands on user data**

## Recovery Status

- Schema restored: Yes (17 tables)
- Data restored: No (not recoverable)
- Time to rebuild: Estimated 2+ months of agent usage

## Prevention Checklist for AI Assistants

Before running any `rm`, `delete`, or destructive database command:

- [ ] Verify exactly what files will be affected
- [ ] Check if files contain user data
- [ ] Ask user for explicit confirmation
- [ ] Create backup first
- [ ] Document the action in the conversation

---

*This incident resulted in significant data loss. The backup mechanisms added should prevent recurrence.*
