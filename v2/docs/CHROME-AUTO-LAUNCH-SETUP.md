# Chrome Auto-Launch Setup Guide

## Overview

The testability scorer now **automatically launches Chrome** when generating HTML reports. This guide explains how it works in different environments and how to customize the behavior.

## 🚀 Quick Start

### Default Behavior (Already Configured!)

When you run a testability assessment, the HTML report will automatically open in Chrome:

```bash
# Full assessment with auto-launch
bash .claude/skills/testability-scorer/scripts/run-assessment.sh https://your-site.com

# Or generate report from JSON
node .claude/skills/testability-scorer/scripts/generate-html-report.js \
  results.json \
  report.html
```

**Result**: Chrome automatically opens with the radar chart visualization!

## 🔧 How It Works

The auto-launch system uses a **smart fallback approach**:

### Priority Order:

1. **Chrome/Chromium** (your preference!) ✅
   - Tries multiple Chrome paths on Linux, Windows, macOS
   - `google-chrome`, `chromium`, `chrome.exe`, etc.

2. **VS Code** (for dev containers)
   - Opens in VS Code, which can trigger browser preview
   - Works in GitHub Codespaces and remote development

3. **System Default Browser**
   - Falls back to `open` (macOS), `start` (Windows), `xdg-open` (Linux)

4. **VS Code Simple Browser**
   - Final fallback for containerized environments

## 💻 Environment-Specific Setup

### Local Development (Desktop)

✅ **No setup needed!** Chrome launches automatically if installed.

**Windows:**
```
Chrome auto-detected at:
  C:\Program Files\Google\Chrome\Application\chrome.exe
  C:\Program Files (x86)\Google\Chrome\Application\chrome.exe
```

**macOS:**
```
Chrome auto-detected at:
  /Applications/Google Chrome.app/Contents/MacOS/Google Chrome
```

**Linux:**
```bash
# Ensure Chrome is in PATH
which google-chrome  # or chromium, chromium-browser

# If not found, install:
# Ubuntu/Debian
sudo apt-get install google-chrome-stable

# Fedora/RHEL
sudo dnf install google-chrome-stable
```

### Dev Containers / Codespaces

In containerized environments, the script:
1. Opens file in VS Code
2. Attempts Chrome launch in background (for VS Code Remote users)
3. File is accessible to open manually in host Chrome

**Enhanced Dev Container Setup:**

Add to `.devcontainer/devcontainer.json`:
```json
{
  "forwardPorts": [8080],
  "portsAttributes": {
    "8080": {
      "label": "HTML Preview",
      "onAutoForward": "openBrowser"
    }
  },
  "customizations": {
    "vscode": {
      "extensions": [
        "ritwickdey.LiveServer",
        "auchenberg.vscode-browser-preview"
      ]
    }
  }
}
```

Then right-click HTML files → "Open with Live Server" to view in Chrome.

### CI/CD Environments

Disable auto-launch for headless CI/CD:

```bash
# GitHub Actions, GitLab CI, Jenkins, etc.
AUTO_OPEN=false bash .claude/skills/testability-scorer/scripts/run-assessment.sh
```

Or in code:
```javascript
// Set before generating report
process.env.AUTO_OPEN = 'false';
```

## 🎯 Customization Options

### Force Chrome Only (No Fallbacks)

Create a wrapper script:

```bash
#!/bin/bash
# scripts/chrome-only-report.sh

CHROME_ONLY=true node .claude/skills/testability-scorer/scripts/generate-html-report.js "$@"
```

Update `generate-html-report.js` to check `CHROME_ONLY` env var.

### Specify Chrome Path

Set custom Chrome location:

```bash
export CHROME_BIN="/path/to/your/chrome"
```

### Open in Specific Chrome Profile

For Chrome with specific profile:

```bash
google-chrome --profile-directory="Profile 1" report.html
```

## 🔍 Troubleshooting

### Issue: Chrome Doesn't Launch

**Check 1: Is Chrome installed?**
```bash
# Linux
which google-chrome
google-chrome --version

# Windows (PowerShell)
Get-Command chrome

# macOS
ls "/Applications/Google Chrome.app"
```

**Check 2: Check permissions**
```bash
# Linux - Make sure Chrome is executable
chmod +x $(which google-chrome)
```

**Check 3: View detailed errors**
```bash
# Run with verbose logging
DEBUG=true node .claude/skills/testability-scorer/scripts/generate-html-report.js ...
```

### Issue: Opens in Wrong Browser

**Solution 1: Set Chrome as default**
- **Windows**: Settings → Apps → Default apps → Web browser
- **macOS**: Safari → Settings → General → Default web browser
- **Linux**: `xdg-settings set default-web-browser google-chrome.desktop`

**Solution 2: Temporarily set default**
```bash
# Linux only
export BROWSER=google-chrome
```

### Issue: Multiple Chrome Windows Open

This is expected! The script tries multiple methods to ensure compatibility:
- Method 1: Direct Chrome launch
- Method 2: VS Code (triggers browser)
- Both may succeed, giving you options

To prevent this, modify the script to return early on first success.

### Issue: Dev Container - Chrome Not Found

Expected behavior in containers. Options:

**Option A: Use VS Code preview**
Right-click HTML → "Open with Live Server"

**Option B: Forward port and open on host**
1. Report generates in container
2. VS Code port forwarding exposes it
3. Click the port in VS Code → Opens in host Chrome

**Option C: Copy file to host**
```bash
# File is in workspace, accessible from host
# Just open: /path/to/workspace/tests/reports/report.html
```

## 📊 Expected Output

When Chrome launches successfully:

```
✓ HTML report generated: tests/reports/testability-report-1234567890.html
✓ Overall score: 75/100 (C)

🌐 Opening report in Chrome...
✓ Report opened in Chrome

💡 Tip: Set AUTO_OPEN=false to disable automatic browser opening
```

## 🛠️ Advanced Configuration

### Custom Browser Command

Create `.env` file:
```bash
# .env
TESTABILITY_BROWSER="google-chrome --incognito"
```

### Post-Generation Hook

Run custom script after report generation:

```bash
# .claude/skills/testability-scorer/hooks/post-report.sh
#!/bin/bash
REPORT_PATH="$1"

# Custom actions
echo "Report generated: $REPORT_PATH"
google-chrome --new-window "$REPORT_PATH"
```

### VS Code Task Integration

Add to `.vscode/tasks.json`:
```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Testability Report",
      "type": "shell",
      "command": "bash .claude/skills/testability-scorer/scripts/run-assessment.sh ${input:url}",
      "problemMatcher": [],
      "presentation": {
        "reveal": "always",
        "panel": "new"
      }
    }
  ],
  "inputs": [
    {
      "id": "url",
      "type": "promptString",
      "description": "Enter URL to assess:",
      "default": "https://www.saucedemo.com"
    }
  ]
}
```

Run: `Ctrl+Shift+P` → "Tasks: Run Task" → "Testability Report"

## 🎨 Chrome Developer Tools Integration

Once Chrome opens:

1. **Right-click** → Inspect
2. **Console**: View Chart.js radar chart object
3. **Network**: See CDN resources (Chart.js)
4. **Performance**: Measure rendering time

### Export as PDF

From Chrome:
1. `Ctrl+P` (Cmd+P on Mac)
2. Destination: Save as PDF
3. Click "Save"

Programmatically:
```bash
google-chrome --headless --print-to-pdf=report.pdf report.html
```

## 📱 Mobile/Responsive Testing

The HTML report is responsive! Test in Chrome DevTools:

1. `F12` → Toggle device toolbar
2. Test on: iPhone, iPad, Android
3. Portrait and landscape modes

Or open on actual mobile device via local server:
```bash
npx serve tests/reports
# Access from mobile: http://your-ip:3000/report.html
```

## 🔐 Security Notes

Auto-launching browsers is safe because:
- ✅ Only opens **local files** (file://)
- ✅ No network requests (except Chart.js CDN)
- ✅ No executable code from external sources
- ✅ User can disable anytime (AUTO_OPEN=false)

## 📚 Related Documentation

- [Auto-Open Feature](../AUTO-OPEN-ENABLED.md) - Original auto-open implementation
- [Dev Container Support](../DEV-CONTAINER-AUTO-OPEN.md) - Container-specific features
- [Testability Scorer Skill](../SKILL.md) - Complete skill documentation

## ✅ Verification

Test the setup:

```bash
# 1. Generate test report
node .claude/skills/testability-scorer/scripts/generate-html-report.js \
  tests/reports/sample-testability-results.json \
  tests/reports/test-chrome-launch.html

# 2. Chrome should open automatically
# 3. You should see the radar chart visualization

# Expected output:
# ✓ Report opened in Chrome
```

## 🎉 Success Criteria

You're all set when:
- ✅ Reports auto-open in Chrome after generation
- ✅ Radar chart displays correctly
- ✅ Color-coded grades show properly
- ✅ AI recommendations are readable
- ✅ No manual file opening needed

---

**Last Updated**: December 1, 2025
**Version**: Testability Scorer v1.3.1
**Feature**: Chrome Auto-Launch 🎯
