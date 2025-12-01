# Learning Query Fix - SQLite Parameter Issue

## Issue
The `mcp__agentic_qe__learning_query` tool was failing with error:
```
"Too many parameter values were provided"
```

## Root Cause
In `src/mcp/handlers/learning/learning-query.ts` at line 175-179, the Q-value count query had a bug:

```typescript
const qValueCount = db.prepare(
  agentId
    ? 'SELECT COUNT(*) as count FROM q_values WHERE agent_id = ?'
    : 'SELECT COUNT(*) as count FROM q_values'
).get(agentId ? agentId : undefined) as { count: number };
```

The problem: When `agentId` was not provided, the code would call `.get(undefined)`, which SQLite interprets as passing a parameter value to a query that has no placeholders. This caused the "Too many parameter values" error.

## Solution
Split the query execution into two separate branches:

```typescript
const qValueCount = agentId
  ? db.prepare('SELECT COUNT(*) as count FROM q_values WHERE agent_id = ?').get(agentId)
  : db.prepare('SELECT COUNT(*) as count FROM q_values').get();
```

Now:
- When `agentId` is provided: Uses parameterized query with `.get(agentId)`
- When `agentId` is NOT provided: Uses query without parameters and calls `.get()` with no arguments

## Files Modified
- `src/mcp/handlers/learning/learning-query.ts` (line 175-179)

## Testing
After the fix:
1. Rebuilt the project: `npm run build` ✅
2. Killed the MCP server process to force reload
3. Ready for testing once MCP server reconnects

## Next Steps
To test the fix, you need to:
1. Reload MCP servers in your IDE (usually via command palette or MCP settings)
2. Test with: `mcp__agentic_qe__learning_query` with `{"queryType": "all", "limit": 10}`
3. Verify it returns learning data without errors

## Related
- Part of Phase 1 implementation for Hybrid Learning Persistence
- Enables Claude Code Task tool to query learning data
- Critical for agent learning and pattern recognition