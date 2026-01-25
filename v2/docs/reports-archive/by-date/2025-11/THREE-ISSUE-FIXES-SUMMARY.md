# Three Key Issues - Implementation Plan

**Date**: 2025-10-30
**Version**: Post-1.3.6 Improvements
**Priority**: HIGH (User feedback)

---

## Issue #1: CLAUDE.md Append Strategy ⚠️ HIGH PRIORITY

### Current Behavior
When running `aqe init`, AQE instructions are **prepended** to existing CLAUDE.md files (added at beginning).

### User Feedback
> "When we do init of CLAUDE.md, maybe we should if there is already existing CLAUDE.md in project offer user where to add AQE related instructions... I would suggest to append the AQE instructions to the end of the existing CLAUDE.md by default if the user runs aqe init -y, and if they run aqe init to offer them option to select should we append the aqe instructions at the beginning or at the end of the existing CLAUDE.md."

### Proposed Solution

#### For `aqe init --yes` (non-interactive):
- **Default**: Append AQE instructions to **END** of existing CLAUDE.md
- **Rationale**: Less disruptive to existing project configuration

#### For `aqe init` (interactive):
- **Show prompt**: "Existing CLAUDE.md detected. Where should we add AQE instructions?"
  - Option 1: "At the beginning (prepend)"
  - Option 2: "At the end (append)" [DEFAULT]
- **Allow user choice**

### Implementation

**File**: `src/cli/commands/init.ts`

**Current Code** (line ~1800):
```typescript
// If CLAUDE.md exists, prepend AQE instructions
if (fs.existsSync(claudeMdPath)) {
  const existingContent = fs.readFileSync(claudeMdPath, 'utf8');
  const updatedContent = claudeMdContent + '\n\n' + existingContent;
  fs.writeFileSync(claudeMdPath, updatedContent);
}
```

**New Code**:
```typescript
// If CLAUDE.md exists, ask where to add AQE instructions
if (fs.existsSync(claudeMdPath)) {
  const existingContent = fs.readFileSync(claudeMdPath, 'utf8');
  
  let position = 'append'; // default for --yes mode
  
  // In interactive mode, ask user
  if (!options.yes) {
    const answer = await inquirer.prompt([{
      type: 'list',
      name: 'position',
      message: 'Existing CLAUDE.md detected. Where should we add AQE instructions?',
      choices: [
        { name: 'At the end (append) - Recommended', value: 'append' },
        { name: 'At the beginning (prepend)', value: 'prepend' }
      ],
      default: 'append'
    }]);
    position = answer.position;
  }
  
  const updatedContent = position === 'append'
    ? existingContent + '\n\n---\n\n' + claudeMdContent
    : claudeMdContent + '\n\n---\n\n' + existingContent;
    
  fs.writeFileSync(claudeMdPath, updatedContent);
  
  console.log(`  ✓ AQE instructions ${position === 'append' ? 'appended to' : 'prepended to'} existing CLAUDE.md`);
}
```

### Testing
1. Create project with existing CLAUDE.md
2. Run `aqe init --yes` → Should append to end
3. Run `aqe init` (interactive) → Should show prompt
4. Verify both positions work correctly

### Risk: LOW
- Simple change
- Non-breaking (only affects new inits)
- Easy to test

---

## Issue #2: CLI Skills Count Display Bug ⚠️ MEDIUM PRIORITY

### Current Behavior
`aqe skills list` shows "Total QE Skills: 8/17" when 34 skills are actually installed.

### Evidence
- Filesystem: 34 SKILL.md files present ✅
- Init output: "✓ Copied 34 new QE skills" ✅
- CLI display: Shows "8/17" ❌

### Root Cause
CLI command likely counting only Phase 1 skills or using old hardcoded value.

### Proposed Solution

**File**: `src/cli/commands/skills.ts` (or skills command handler)

**Find the display logic** and update to:
1. Count actual skills in `.claude/skills/` directory
2. Remove hardcoded "/17" or "/8" values
3. Display actual count dynamically

**Example Fix**:
```typescript
// Before:
console.log(`Total QE Skills: ${skillsList.length}/17`);

// After:
const totalSkills = fs.readdirSync('.claude/skills').length;
console.log(`Total QE Skills: ${skillsList.length}/${totalSkills}`);
```

### Testing
1. Run `aqe init`
2. Run `aqe skills list`
3. Verify shows "34/34" or correct count

### Risk: LOW
- Display-only bug
- No functional impact
- Easy fix

---

## Issue #3: Memory Storage in Complexity Agent (Minor)

### Current Behavior
CodeComplexityAnalyzerAgent shows "Results stored in memory: NO" in test.

### Investigation Needed
- Is this a postTask hook issue?
- Does executeTask vs direct method call affect storage?
- Is this expected behavior for direct API calls?

### Proposed Investigation
1. Check if postTask hook fires for direct analyzeComplexity() calls
2. Verify storage works through executeTask() flow
3. Document expected behavior in agent API docs

### Priority: LOW
- Functionality works
- May be expected behavior for direct calls
- Not a blocker

---

## Implementation Priority

### Version 1.3.7 (Patch - Within 1 Week)
1. ✅ **Issue #1**: CLAUDE.md append strategy (HIGH)
2. ✅ **Issue #2**: CLI skills count fix (MEDIUM)

### Version 1.4.0 (Minor - Future)
3. ⏳ **Issue #3**: Memory storage investigation (LOW)

---

## Acceptance Criteria

### Issue #1 (CLAUDE.md Append)
- [  ] Interactive mode shows position choice
- [  ] `--yes` mode defaults to append
- [  ] Both prepend and append work correctly
- [  ] Clear visual separator added (---)
- [  ] User sees confirmation message

### Issue #2 (Skills Count)
- [  ] `aqe skills list` shows correct total (34/34)
- [  ] Count is dynamic (not hardcoded)
- [  ] Works after aqe init

### Issue #3 (Memory Storage)
- [  ] Investigation documented
- [  ] Expected behavior clarified
- [  ] User docs updated if needed

---

**Document Status**: Ready for Implementation
**Estimated Effort**: 2-4 hours
**Target Version**: 1.3.7
**User Impact**: HIGH (better UX)

---

**Reported By**: User feedback (2025-10-30)
**Documented By**: Claude Code Implementation Session
**Priority Assessment**: User experience improvement
