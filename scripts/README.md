# Documentation Verification Scripts

Automated scripts to prevent documentation drift and verify feature claims.

## Overview

These scripts ensure that documentation (README.md, CLAUDE.md, package.json) stays accurate as the project evolves by:
- Automatically counting skills, agents, and MCP tools
- Verifying agent skill references
- Validating feature implementation against claims
- Providing automated updates and continuous monitoring

## Scripts

### 1. verify-counts.ts

Counts skills, agents, and MCP tools, then compares against documentation claims.

**Usage:**
```bash
npm run verify:counts
npm run verify:counts -- --verbose
npm run verify:counts -- --json
```

**What it checks:**
- Total skills count
- QE skills count
- Phase 1 skills count
- Phase 2 skills count
- Claude Flow skills count
- QE agents count
- MCP tools count

**Exit codes:**
- `0` - All counts match documentation
- `1` - Mismatches found

**Output:**
```
✅ Skill Count Verification
   - Total Skills: 60 (✓ matches documentation)
   - QE Skills: 35 (✓ matches documentation)
   - Phase 1 Skills: 18 (✓ matches documentation)
   - Phase 2 Skills: 17 (✓ matches documentation)

⚠️  MCP Tools Count Mismatch
   - Actual: 61 tools
   - README.md line 14: claims 52 tools ❌
```

### 2. verify-agent-skills.ts

Validates that agent skill references exist and suggests additions based on specialization.

**Usage:**
```bash
npm run verify:agent-skills
npm run verify:agent-skills -- --verbose
npm run verify:agent-skills -- --json
npm run verify:agent-skills -- --agent=qe-test-generator
```

**What it checks:**
- Skill references in agent markdown files
- Whether referenced skills exist in `.claude/skills/`
- Phase 2 skill adoption
- Skill suggestions based on agent specialization

**Exit codes:**
- `0` - All agent skills valid
- `1` - Missing or broken skill references found

**Output:**
```
🤖 Agent: qe-test-generator
   Skills Referenced: 5
   Valid References: 5
   Broken References: 0
   Phase 2 Skills: 0

⚠️  No Phase 2 skills referenced

💡 SUGGESTED ADDITIONS:
   - shift-left-testing (matches specialization)
   - test-design-techniques (matches specialization)
   - test-data-management (matches specialization)
```

### 3. update-documentation-counts.ts

Automatically updates counts in documentation files based on actual counts.

**Usage:**
```bash
npm run update:counts                    # Apply updates
npm run update:counts -- --dry-run       # Preview changes
npm run update:counts -- --verbose       # Detailed output
```

**What it updates:**
- README.md: Skills, agents, and MCP tools counts
- CLAUDE.md: QE skills and agents counts
- package.json: MCP tools count in description

**Safety features:**
- Creates backups before modification (`.backup-TIMESTAMP`)
- Dry-run mode to preview changes
- Detailed changelog of updates

**Output:**
```
📊 Current Counts:
  Skills (Total): 60
  Skills (QE): 35
  Skills (Phase 1): 18
  Skills (Phase 2): 17
  Agents (QE): 18
  MCP Tools: 61

✅ Operations to apply: 8

📄 README.md
  ✓ Update MCP tools count in README header
  ✓ Update total QE skills
  ✓ Update Phase 1 skills count
  ✓ Update Phase 2 skills count
```

### 4. verify-features.ts

Comprehensive verification of feature claims against actual implementation.

**Usage:**
```bash
npm run verify:features
npm run verify:features -- --verbose
npm run verify:features -- --json
npm run verify:features -- --feature=multi-model-router
```

**What it verifies:**
1. **Multi-Model Router** (70-81% cost savings)
   - AdaptiveModelRouter class exists
   - Configuration file exists
   - Cost tracking implemented
   - Tests exist

2. **Learning System** (20% improvement target)
   - LearningEngine class exists
   - Q-learning algorithm implemented
   - Experience replay buffer
   - Tests exist

3. **Pattern Bank** (85%+ matching accuracy)
   - QEReasoningBank class exists
   - Pattern extraction works
   - Pattern matching implemented
   - Cross-project sharing

4. **ML Flaky Detection** (100% accuracy claim)
   - FlakyTestDetector class exists
   - ML model implemented
   - Root cause analysis
   - Fix recommendations

5. **Streaming API** (real-time progress)
   - Streaming handlers exist
   - AsyncGenerator pattern used
   - Progress events emitted

6. **AgentDB Integration**
   - AgentDB installed
   - QUIC sync configured
   - Vector search works
   - Learning plugins exist

7. **61 MCP Tools**
   - Count actual tool definitions
   - Verify each tool exported
   - Check handler existence

8. **Performance Claims**
   - Test generation: 1000+ tests/minute
   - Coverage analysis: O(log n) complexity
   - Data generation: 10,000+ records/second
   - Pattern matching: <50ms p95

**Exit codes:**
- `0` - All features verified (≥80% confidence)
- `1` - Features missing or low confidence

**Output:**
```
✅ Multi-Model Router
   Claimed: 70-81% cost savings, intelligent model selection
   Status: VERIFIED (87.5% confidence)

   Checks: 7 passed, 1 failed, 0 warnings

⚠️  Learning System
   Claimed: 20% improvement target, Q-learning algorithm
   Status: PARTIAL (62.5% confidence)

   Detailed Checks:
   ✓ LearningEngine class found
   ✓ Q-learning implemented
   ✗ Experience replay tests missing
   ✓ Improvement tracking works

💡 Action Required:
  • Add tests for experience replay buffer
```

## Continuous Integration

All scripts run automatically in CI/CD via GitHub Actions.

**Workflow:** `.github/workflows/verify-documentation.yml`

**Triggers:**
- Push to main/develop/testing-with-qe branches
- Pull requests to main/develop
- Daily scheduled check (2 AM UTC)
- Manual workflow dispatch

**On failure:**
- PR gets comment with results
- Workflow artifacts contain detailed reports
- Daily check creates GitHub issue

## Reports

All scripts generate JSON reports saved to `/reports/` directory:
- `verification-counts-{timestamp}.json`
- `verification-agent-skills-{timestamp}.json`
- `verification-features-{timestamp}.json`
- `update-counts-{timestamp}.json`

## Best Practices

1. **Run verification before committing:**
   ```bash
   npm run verify:all
   ```

2. **Fix count mismatches automatically:**
   ```bash
   npm run update:counts --dry-run  # Preview
   npm run update:counts            # Apply
   ```

3. **Check feature claims before release:**
   ```bash
   npm run verify:features
   ```

4. **Review agent skill references quarterly:**
   ```bash
   npm run verify:agent-skills --verbose
   ```

## Development

### Adding New Checks

**verify-counts.ts:**
```typescript
// Add new category to count
const newCategory = extractCountFromDocs(
  readmePath,
  /(\d+)\s+New\s+Category/i
);

results.push({
  type: 'new-category',
  category: 'total',
  actual: actualCount,
  expected: newCategory || undefined,
  source: 'README.md',
  status: newCategory !== null && actualCount === newCategory ? 'match' : 'mismatch'
});
```

**verify-features.ts:**
```typescript
function verifyNewFeature(): FeatureVerification {
  const checks: FeatureCheck[] = [
    checkClassExists('src/new/Feature.ts', 'Feature'),
    checkTestsExist('*new-feature*.test.ts'),
    // ... more checks
  ];

  const passCount = checks.filter(c => c.status === 'pass').length;
  const confidence = (passCount / checks.length) * 100;

  return {
    feature: 'New Feature',
    description: 'Description of new feature',
    claimed: 'What the docs claim',
    checks,
    overallStatus: confidence >= 80 ? 'verified' :
                   confidence >= 50 ? 'partial' : 'missing',
    confidence
  };
}
```

### Testing

All scripts include comprehensive error handling and can be tested independently:

```bash
# Test count verification
npm run verify:counts

# Test with verbose output
npm run verify:counts -- --verbose

# Test update in dry-run mode
npm run update:counts -- --dry-run

# Test specific agent
npm run verify:agent-skills -- --agent=qe-test-generator

# Test specific feature
npm run verify:features -- --feature=multi-model-router
```

## Troubleshooting

### "Pattern not found" warnings
If update script can't find a pattern, the documentation format may have changed. Update the regex pattern in `update-documentation-counts.ts`.

### "File not found" errors
Ensure project structure hasn't changed. Update file paths in verification scripts.

### CI failing but local passing
Check that all files are committed, especially in `.claude/` directories which might be gitignored.

## Dependencies

- **tsx**: TypeScript execution
- **fs**: File system operations
- **path**: Path manipulation
- **child_process**: For running shell commands

No external dependencies required beyond Node.js built-ins.

## License

MIT - Part of Agentic QE Fleet System
