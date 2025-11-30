# Testability Scorer - Claude Code Skill

Automated testability assessment using 10 principles of intrinsic testability. Provides quantitative scoring (0-100), **automatic HTML reports with Chart.js radar visualizations**, AI-powered recommendations, and historical tracking.

## 📊 Automatic HTML Reports (NEW!)

**Every assessment automatically generates professional HTML reports** matching the original [testability-scorer repository](https://github.com/fndlalit/testability-scorer) style:

✨ **Chart.js Radar Visualization** - See all 10 principles at a glance
🎨 **Color-Coded Grades** - A=green, B=teal, C=yellow, D=orange, F=red
🤖 **AI-Powered Recommendations** - Prioritized improvements with effort estimates
📱 **Responsive Design** - Works on desktop, tablet, and mobile
🌐 **Auto-Opens in Browser** - Reports automatically launch in your default browser

**Example:**
```bash
# Full assessment with automatic HTML report generation
.claude/skills/testability-scorer/scripts/run-assessment.sh https://example.com

# Output includes:
# 📊 HTML Report: tests/reports/testability-report-1732998400.html
# ✓ Interactive radar chart with all 10 principles
# ✓ Color-coded grade cards for visual analysis
# ✓ AI-generated improvement recommendations
```

**Disable auto-open (if needed):**
```bash
# Reports open automatically by default. To disable:
AUTO_OPEN=false .claude/skills/testability-scorer/scripts/run-assessment.sh
```

## Quick Reference

### Installation
```bash
./scripts/install.sh
```

### Quick Assessment (2 minutes)
```bash
./scripts/quick-check.sh [url]
```

### Full Assessment (10 minutes)
```bash
./scripts/run-assessment.sh [url] [browser]
```

### View Trends
```bash
node scripts/view-trends.js
```

## The 10 Principles

1. **Observability** (15%) - State transparency and monitoring
2. **Controllability** (15%) - State manipulation and test data injection
3. **Algorithmic Simplicity** (10%) - Clear input-output relationships
4. **Algorithmic Transparency** (10%) - Understandable logic flow
5. **Explainability** (10%) - Documentation and clarity
6. **Similarity** (5%) - Standard patterns and familiar architecture
7. **Algorithmic Stability** (10%) - API versioning and compatibility
8. **Unbugginess** (10%) - Low defect rate
9. **Smallness** (10%) - Manageable size and modularity
10. **Decomposability** (5%) - Component isolation

## Scoring Scale

- **A (90-100)**: Excellent testability
- **B (80-89)**: Good testability
- **C (70-79)**: Acceptable testability
- **D (60-69)**: Below average
- **F (0-59)**: Poor testability

## Directory Structure

```
.claude/skills/testability-scorer/
├── SKILL.md                          # Main skill documentation
├── README.md                         # This file
├── scripts/
│   ├── install.sh                    # Installation script
│   ├── run-assessment.sh             # Full assessment
│   ├── quick-check.sh                # Quick 5-principle check
│   ├── track-history.js              # Historical tracking
│   └── view-trends.js                # Trend analysis
├── resources/
│   ├── templates/
│   │   ├── config.template.js        # Configuration template
│   │   └── testability-scorer.spec.js # Test template
│   ├── examples/
│   │   └── basic-usage.md            # Usage examples
│   └── schemas/
│       └── testability-report.schema.json # Report schema
└── docs/
    ├── CONFIGURATION.md              # Configuration guide
    ├── CI-INTEGRATION.md             # CI/CD integration
    └── API_REFERENCE.md              # Complete API reference
```

## Integration with Agentic QE Fleet

This skill integrates seamlessly with the Agentic QE Fleet:

```javascript
// Spawn agent to analyze testability
Task("Analyze testability", "Run testability-scorer on application", "qe-analyst");

// Use results to guide test generation
Task("Generate tests", "Focus on low-scoring principles from testability analysis", "qe-test-generator");

// Improve code based on recommendations
Task("Refactor for testability", "Implement top 3 testability recommendations", "coder");
```

## Key Features

- ✅ **Automatic HTML Reports** - Chart.js radar visualizations generated every run
- ✅ **Automated scoring** - 0-100 scale with letter grades (A-F)
- ✅ **Visual analysis** - Interactive radar charts and color-coded cards
- ✅ **AI-powered recommendations** - Prioritized improvements with effort estimates
- ✅ **Historical trend tracking** - Monitor testability over time
- ✅ **Multi-browser support** - Chromium, Firefox, WebKit
- ✅ **Multi-user comparative analysis** - Compare different user journeys
- ✅ **CI/CD integration ready** - JSON/Text output for automation
- ✅ **Auto-opening reports** - Instant visualization in browser

## Example Output

```
📈 Testability Assessment Results

Overall Score: 71/100 (C)

Principle Scores:
  1. Observability: 68/100 (D)
  2. Controllability: 45/100 (F) ⚠️
  3. Algorithmic Simplicity: 82/100 (B)
  4. Algorithmic Transparency: 71/100 (C)
  5. Explainability: 51/100 (F) ⚠️
  6. Similarity: 89/100 (B)
  7. Algorithmic Stability: 64/100 (D)
  8. Unbugginess: 77/100 (C)
  9. Smallness: 85/100 (B)
  10. Decomposability: 74/100 (C)

Top Recommendations:
  🔴 CRITICAL: Improve controllability (+15 points)
     Add test mode API for state manipulation
  🟡 HIGH: Enhance explainability (+10 points)
     Add JSDoc and improve error messages
  🟢 MEDIUM: Boost observability (+8 points)
     Add state logging in development mode
```

## Documentation

- **[SKILL.md](SKILL.md)** - Complete skill documentation
- **[Basic Usage](resources/examples/basic-usage.md)** - Step-by-step tutorial
- **[Configuration Guide](docs/CONFIGURATION.md)** - Advanced configuration
- **[API Reference](docs/API_REFERENCE.md)** - Complete API documentation

## Resources

- [Original Repository](https://github.com/fndlalit/testability-scorer)
- [Playwright Documentation](https://playwright.dev/)
- [Agentic QE Fleet](../../README.md)

## License

Based on [fndlalit/testability-scorer](https://github.com/fndlalit/testability-scorer)

## Version

**1.0.0** - Initial release for Agentic QE Fleet v1.9.3+
