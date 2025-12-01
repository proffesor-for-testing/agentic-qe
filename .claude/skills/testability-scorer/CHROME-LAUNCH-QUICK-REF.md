# Chrome Auto-Launch - Quick Reference

## ✅ Already Configured!

Chrome auto-launch is **enabled by default**. No setup needed!

## 🚀 Usage

### Run Assessment (Chrome opens automatically)
```bash
bash .claude/skills/testability-scorer/scripts/run-assessment.sh https://your-site.com
```

### Generate Report (Chrome opens automatically)
```bash
node .claude/skills/testability-scorer/scripts/generate-html-report.js \
  results.json report.html
```

## 🎯 What Happens

1. ✅ Report generates with Chart.js radar chart
2. ✅ **Chrome launches automatically**
3. ✅ Report displays with color-coded grades
4. ✅ AI recommendations ready to read

## 🔧 Options

### Disable Auto-Launch
```bash
AUTO_OPEN=false bash .claude/skills/testability-scorer/scripts/run-assessment.sh
```

### Custom Chrome Path
```bash
export CHROME_BIN="/custom/path/to/chrome"
```

## 🐳 Dev Container Behavior

In dev containers/Codespaces:
- Opens in VS Code (fallback)
- File accessible on host machine
- Right-click → "Open with Live Server" for browser preview

## ⚡ Priority Order

1. **Chrome/Chromium** ← Your preference!
2. VS Code (dev containers)
3. System default browser
4. VS Code simple browser

## 📍 Report Location

```
/workspaces/agentic-qe/tests/reports/testability-report-{timestamp}.html
```

## 🆘 Troubleshooting

**Chrome doesn't open?**
```bash
# Check if Chrome is installed
which google-chrome

# Install on Ubuntu/Debian
sudo apt-get install google-chrome-stable
```

**Opens wrong browser?**
- Set Chrome as system default browser
- Or use: `export BROWSER=google-chrome`

## 📚 Full Documentation

See: `/workspaces/agentic-qe/docs/CHROME-AUTO-LAUNCH-SETUP.md`

---

**TL;DR**: It just works! Run the script, Chrome opens automatically. 🎉
