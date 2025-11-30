# Auto-Open Feature Now Enabled by Default ✅

## Summary

HTML reports now **automatically open in your default browser** every time you run a testability assessment. No need to set `AUTO_OPEN=true` anymore!

## What Changed

### Before (Required Manual Configuration)
```bash
# Had to explicitly enable auto-open
AUTO_OPEN=true .claude/skills/testability-scorer/scripts/run-assessment.sh
```

### After (Auto-Opens by Default) 🌐
```bash
# Just run the assessment - report opens automatically!
.claude/skills/testability-scorer/scripts/run-assessment.sh https://example.com

# Output:
# ✓ HTML report generated: tests/reports/testability-report-1733003700.html
# ✓ Overall score: 65/100 (D)
#
# 🌐 Opening report in browser...
# ✓ Report opened in default browser
#
# 💡 Tip: Set AUTO_OPEN=false to disable automatic browser opening
```

## How to Disable Auto-Open

If you prefer to manually open reports (e.g., in CI/CD pipelines or automated workflows):

```bash
# Disable auto-open for this run
AUTO_OPEN=false .claude/skills/testability-scorer/scripts/run-assessment.sh

# Or set it globally in your shell
export AUTO_OPEN=false
```

## Files Modified

### 1. `generate-html-report.js` (Main Change)

**Before:**
```javascript
// Auto-open if requested
if (process.env.AUTO_OPEN === 'true') {
  const open = require('child_process').exec;
  const command = process.platform === 'darwin' ? 'open' :
                  process.platform === 'win32' ? 'start' : 'xdg-open';
  open(`${command} ${outputPath}`);
}
```

**After:**
```javascript
// Auto-open by default (disable with AUTO_OPEN=false)
if (process.env.AUTO_OPEN !== 'false') {
  console.log(`\n🌐 Opening report in browser...`);

  const { exec } = require('child_process');
  const command = process.platform === 'darwin' ? 'open' :
                  process.platform === 'win32' ? 'start' : 'xdg-open';

  exec(`${command} "${outputPath}"`, (error) => {
    if (error) {
      console.log(`\n⚠️  Could not auto-open browser. Please open manually:`);
      console.log(`  ${outputPath}`);
    } else {
      console.log(`✓ Report opened in default browser`);
    }
  });
} else {
  console.log(`\nView report:`);
  console.log(`  open ${outputPath}`);
}

// Tip for disabling auto-open
if (process.env.AUTO_OPEN !== 'false') {
  console.log(`\n💡 Tip: Set AUTO_OPEN=false to disable automatic browser opening`);
}
```

### 2. `run-assessment.sh` & `quick-check.sh`

Removed duplicate auto-open logic (now handled by generate-html-report.js):

```bash
# Note: HTML report auto-opens by default via generate-html-report.js
# To disable auto-open, set AUTO_OPEN=false before running this script
```

### 3. Documentation Updates

**SKILL.md:**
- Changed "Auto-Opening - Set `AUTO_OPEN=true`" → "🌐 Auto-Opens in Browser (disable with `AUTO_OPEN=false`)"
- Updated example from "AUTO_OPEN=true to enable" → "AUTO_OPEN=false to disable"

**README.md:**
- Changed "Auto-Opening - Set `AUTO_OPEN=true`" → "🌐 Auto-Opens in Browser"
- Updated example from "AUTO_OPEN=true" → "AUTO_OPEN=false to disable"

## Platform Support

The auto-open feature works across all major platforms:

| Platform | Command Used | Status |
|----------|-------------|---------|
| macOS | `open` | ✅ Fully Supported |
| Windows | `start` | ✅ Fully Supported |
| Linux | `xdg-open` | ✅ Fully Supported |
| Dev Containers | N/A | ⚠️ Falls back to manual open |

**Note:** In development containers or headless environments where no browser is available, the script gracefully falls back to displaying the file path for manual opening.

## User Experience Flow

### Normal Environment (Desktop/Laptop)
```
1. User runs assessment
   ↓
2. Playwright analyzes website
   ↓
3. JSON results generated
   ↓
4. HTML report created
   ↓
5. 🌐 Browser automatically opens
   ↓
6. User sees visual radar chart immediately!
```

### CI/CD or Headless Environment
```
1. User runs with AUTO_OPEN=false
   ↓
2. Assessment completes
   ↓
3. Reports generated (HTML + JSON)
   ↓
4. File paths displayed in console
   ↓
5. Reports stored as artifacts
```

## Benefits

### ✅ Better User Experience
- No need to remember to set `AUTO_OPEN=true`
- Instant visual feedback after assessment
- Matches user expectation (reports should open automatically)

### ✅ Flexibility
- Easy to disable for CI/CD (`AUTO_OPEN=false`)
- Graceful fallback if browser unavailable
- Clear console messages guide users

### ✅ Professional
- Matches behavior of professional testing tools
- Immediate visualization of results
- Reduces friction in workflow

## Usage Examples

### Basic Assessment (Auto-Opens)
```bash
.claude/skills/testability-scorer/scripts/run-assessment.sh https://talesoftesting.com

# Output:
# 🔍 Running Full Testability Assessment...
# 📊 Analyzing all 10 principles...
# 📊 Generating HTML report with radar chart...
# ✓ HTML report generated: tests/reports/testability-report-1733003700.html
# ✓ Overall score: 65/100 (D)
#
# 🌐 Opening report in browser...
# ✓ Report opened in default browser
#
# 💡 Tip: Set AUTO_OPEN=false to disable automatic browser opening
```

### Quick Check (Auto-Opens)
```bash
.claude/skills/testability-scorer/scripts/quick-check.sh https://example.com

# Output:
# ⚡ Running Quick Testability Check (5 principles)...
# 📊 Generating HTML report...
# ✓ HTML report generated: tests/reports/quick-check-1733003800.html
#
# 🌐 Opening report in browser...
# ✓ Report opened in default browser
```

### CI/CD Pipeline (Disabled Auto-Open)
```bash
# In GitHub Actions or GitLab CI
AUTO_OPEN=false .claude/skills/testability-scorer/scripts/run-assessment.sh

# Output:
# ✓ HTML report generated: tests/reports/testability-report-1733003900.html
# ✓ Overall score: 78/100 (C)
#
# View report:
#   open tests/reports/testability-report-1733003900.html
```

### Using with Claude Code Agents
```javascript
// Agent automatically gets visual report opened
Task(
  "Testability Analysis",
  "Run testability-scorer on https://example.com. Report will auto-open in browser.",
  "qe-analyst"
);

// To disable auto-open in agent workflows:
// Set environment: AUTO_OPEN=false before spawning agent
```

## Troubleshooting

### Browser Doesn't Open

**Symptom:** You see the message but browser doesn't open
```
⚠️  Could not auto-open browser. Please open manually:
  tests/reports/testability-report-1733003700.html
```

**Solutions:**

1. **Check if browser is installed:**
   ```bash
   # macOS
   which open

   # Linux
   which xdg-open

   # Windows
   where start
   ```

2. **Manually open the file:**
   ```bash
   open tests/reports/testability-report-1733003700.html
   ```

3. **Set default browser:**
   ```bash
   # Linux
   xdg-settings set default-web-browser firefox.desktop
   ```

### Running in Docker/Dev Container

**Issue:** Dev containers often don't have GUI access

**Solution:** Reports are still generated, just not auto-opened:
```bash
# The report HTML file is accessible on your host machine
# Navigate to the tests/reports directory and open manually
```

### Prefer Manual Opening

**Solution:** Simply disable auto-open:
```bash
export AUTO_OPEN=false
# Now all assessments will not auto-open
```

## Testing

### Verify Auto-Open Works
```bash
# Test with sample data
node .claude/skills/testability-scorer/scripts/generate-html-report.js \
  .claude/skills/testability-scorer/resources/examples/sample-results.json \
  tests/reports/test-auto-open.html

# Should see:
# 🌐 Opening report in browser...
# ✓ Report opened in default browser
```

### Verify Disable Works
```bash
# Test with auto-open disabled
AUTO_OPEN=false node .claude/skills/testability-scorer/scripts/generate-html-report.js \
  .claude/skills/testability-scorer/resources/examples/sample-results.json \
  tests/reports/test-no-open.html

# Should see:
# View report:
#   open tests/reports/test-no-open.html
```

## Migration Guide

### For Existing Users

If you previously used `AUTO_OPEN=true`:
- **No action needed!** Reports will continue to auto-open
- You can remove `AUTO_OPEN=true` from your scripts (it's now the default)

If you never used auto-open:
- Reports will now auto-open automatically
- To restore old behavior: `export AUTO_OPEN=false` in your shell profile

### For CI/CD Pipelines

Add to your pipeline configuration:
```yaml
# GitHub Actions
- name: Run Testability Assessment
  env:
    AUTO_OPEN: false  # Disable auto-open in CI
  run: |
    .claude/skills/testability-scorer/scripts/run-assessment.sh

# GitLab CI
test-testability:
  variables:
    AUTO_OPEN: "false"
  script:
    - .claude/skills/testability-scorer/scripts/run-assessment.sh
```

## Summary

✅ **Auto-open is now enabled by default**
✅ **Works cross-platform** (macOS, Windows, Linux)
✅ **Easy to disable** when needed (`AUTO_OPEN=false`)
✅ **Graceful fallback** if browser unavailable
✅ **Documentation updated** (SKILL.md, README.md)
✅ **Better user experience** - instant visual feedback

**Impact:** Users get immediate visual feedback without any configuration. Professional testing tools should "just work"!

---

**Updated:** November 30, 2025
**Version:** Testability Scorer v1.2.0
**Feature:** Auto-Open by Default 🌐
