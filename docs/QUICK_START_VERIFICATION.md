# Quick Start: Documentation Verification

**🚀 TL;DR** - Run these commands to prevent documentation drift:

```bash
# Verify everything
npm run verify:all

# Fix count mismatches automatically
npm run update:counts
```

## The Problem This Solves

Documentation drifts out of sync with code:
- README claims 61 MCP tools, but there are 54 ❌
- CLAUDE.md claims 18 agents, but there are 17 ❌
- Skills counts are off by several ❌

## The Solution

4 automated scripts + CI/CD that catch these automatically.

## Quick Commands

### Check Everything
```bash
npm run verify:all
```
Runs all 3 verification scripts. Exit code 0 = all good, 1 = issues found.

### Fix Count Mismatches
```bash
# Preview changes
npm run update:counts -- --dry-run

# Apply changes
npm run update:counts
```

### Individual Checks
```bash
# Check skill/agent/tool counts
npm run verify:counts

# Check agent skill references
npm run verify:agent-skills

# Check feature implementations
npm run verify:features
```

## What Gets Checked

### verify:counts
- ✓ Total skills (59 actual vs claimed)
- ✓ QE skills (34 actual vs claimed)
- ✓ Phase 1 skills (18 actual vs claimed)
- ✓ Phase 2 skills (16 actual vs claimed)
- ✓ QE agents (17 actual vs claimed)
- ✓ MCP tools (54 actual vs claimed)

### verify:agent-skills
- ✓ Skill references in agent markdown files
- ✓ Whether skills exist
- ✓ Phase 2 skill adoption
- ✓ Suggested skill additions

### verify:features
- ✓ Multi-Model Router implementation
- ✓ Learning System implementation
- ✓ Pattern Bank implementation
- ✓ ML Flaky Detection implementation
- ✓ Streaming API implementation
- ✓ AgentDB Integration
- ✓ Performance claims

## Example Output

### Verification Failure
```
❌ MCP TOOLS COUNT VERIFICATION
   README.md: 54 actual, 61 expected (MISMATCH)

🔧 SUGGESTED FIXES:
   • Update README.md to reflect 54 mcp-tools (total)

Run: npm run update:counts --dry-run to see proposed changes
```

### Verification Success
```
✅ SKILL COUNT VERIFICATION
   - Total Skills: 59 (✓ matches documentation)
   - QE Skills: 34 (✓ matches documentation)
```

## CI/CD Integration

**Automatic checks run on:**
- Every push to main/develop/testing-with-qe
- Every PR to main/develop
- Daily at 2 AM UTC
- Manual trigger

**On failure:**
- CI fails ❌
- PR gets comment with details
- Workflow artifacts contain reports
- Daily check creates GitHub issue

## Reports

All scripts generate JSON reports in `/reports/`:
```
reports/
├── verification-counts-{timestamp}.json
├── verification-agent-skills-{timestamp}.json
└── verification-features-{timestamp}.json
```

## Flags

All scripts support:
```bash
--verbose   # Detailed output
--json      # JSON output only
--dry-run   # Preview without changes (update script only)
```

Examples:
```bash
npm run verify:counts -- --verbose
npm run verify:features -- --json
npm run update:counts -- --dry-run
```

## When to Run

**Before committing:**
```bash
npm run verify:all
```

**Before creating PR:**
```bash
npm run verify:all && npm run update:counts
```

**Before release:**
```bash
npm run verify:features  # Check implementation vs claims
```

**After adding skills/agents:**
```bash
npm run verify:counts
npm run update:counts  # Auto-fix counts
```

## Common Scenarios

### Scenario 1: Added new skills
```bash
# 1. Check counts
npm run verify:counts

# 2. Auto-fix documentation
npm run update:counts

# 3. Verify fix
npm run verify:counts
```

### Scenario 2: Adding new agent
```bash
# 1. Create agent markdown
# 2. Add skill references
# 3. Verify references
npm run verify:agent-skills
```

### Scenario 3: Implementing new feature
```bash
# 1. Implement feature
# 2. Add tests
# 3. Verify implementation
npm run verify:features -- --feature=your-feature
```

### Scenario 4: Pre-release check
```bash
# Full verification
npm run verify:all

# Check feature implementations
npm run verify:features

# Fix any count issues
npm run update:counts

# Final verification
npm run verify:all
```

## Troubleshooting

**CI passes locally but fails in GitHub:**
- Ensure all files committed (especially `.claude/` directories)
- Check `.gitignore` isn't excluding needed files

**"Pattern not found" in update script:**
- Documentation format changed
- Check README.md/CLAUDE.md structure
- May need to update regex patterns in `scripts/update-documentation-counts.ts`

**"File not found" in feature verification:**
- Feature not implemented yet
- Either implement or update documentation to remove claim

**Verification fails after adding content:**
- Good! It's working as intended
- Run `npm run update:counts` to fix automatically

## Advanced Usage

### Check specific agent
```bash
npm run verify:agent-skills -- --agent=qe-test-generator
```

### Check specific feature
```bash
npm run verify:features -- --feature=multi-model-router
```

### Get JSON output for parsing
```bash
npm run verify:counts -- --json > counts.json
```

## Integration with Development Workflow

```bash
# 1. Make changes (add skills, agents, features, etc.)

# 2. Before commit
npm run verify:all

# 3. If verification fails
npm run update:counts  # Fix counts automatically
npm run verify:all     # Verify fix

# 4. Commit changes
git add .
git commit -m "Your changes + updated documentation counts"

# 5. Push (CI will verify again)
git push
```

## Help & Documentation

**Full documentation:**
- `scripts/README.md` - Detailed script documentation
- `docs/VERIFICATION_SUITE_SUMMARY.md` - Implementation summary
- `.github/workflows/verify-documentation.yml` - CI/CD workflow

**Get help:**
```bash
npm run verify:counts -- --help
npm run verify:agent-skills -- --help
npm run verify:features -- --help
npm run update:counts -- --help
```

## Key Files

| File | Purpose |
|------|---------|
| `scripts/verify-counts.ts` | Count verification |
| `scripts/verify-agent-skills.ts` | Skill reference validation |
| `scripts/verify-features.ts` | Feature implementation verification |
| `scripts/update-documentation-counts.ts` | Auto-update counts |
| `.github/workflows/verify-documentation.yml` | CI/CD automation |
| `reports/*.json` | Generated verification reports |

## Success Criteria

✅ All scripts exit with code 0
✅ CI checks pass
✅ No mismatches in counts
✅ No broken skill references
✅ Feature confidence >80%

---

**Questions?** See `scripts/README.md` for detailed documentation.
