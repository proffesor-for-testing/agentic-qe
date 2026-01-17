# QX Analysis Scripts

Three production-ready scripts for generating Quality Experience (QX) assessments with different approaches.

## 📊 Quick Comparison

| Script | Depth | Speed | Cost | Best For |
|--------|-------|-------|------|----------|
| `generate-qx-report.js` | ⚡ Quantitative | Fast (1-2s) | Free | Screening, CI/CD |
| `generate-contextual-qx-report.js` | 🧠 Contextual | Medium (5-10s) | ~$0.03/site | Detailed analysis |
| `generate-qx-template.js` | 💎 Expert | Manual (30-60min) | Free | Production reports |

## Scripts

### 1. generate-qx-report.js - Quantitative Analysis

**Purpose**: Fast automated screening with 23+ QX heuristics

```bash
node scripts/generate-qx-report.js https://example.com/
```

**Output**: HTML report with scores, grades, heuristics, recommendations  
**Use Case**: CI/CD pipelines, batch screening, metric tracking  
**No API Key Required** ✅

---

### 2. generate-contextual-qx-report.js - LLM-Enhanced Analysis

**Purpose**: Contextual insights matching manual report quality

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
node scripts/generate-contextual-qx-report.js https://example.com/
```

**Output**: Markdown report with:
- Site purpose understanding
- Named failure modes (e.g., "Content Discoverability")
- Actual feature lists (must/should/nice-to-have)
- Stakeholder identification
- Actionable recommendations with priority/impact/effort

**Use Case**: Stakeholder reports, competitive analysis, strategic planning  
**Requires API Key** ⚠️ (falls back to quantitative if missing)

---

### 3. generate-qx-template.js - Human-in-the-Loop

**Purpose**: Template combining automated metrics + human expertise

```bash
node scripts/generate-qx-template.js https://example.com/
code reports/qx-template-*.md
# Fill in [HUMAN: ...] sections
```

**Output**: Editable Markdown template with:
- Automated metrics and scores
- Structured sections for human insights
- Checklist to ensure completeness
- Best of both: automation + expertise

**Use Case**: Critical assessments, client deliverables, training  
**No API Key Required** ✅

---

## Setup

### Prerequisites
```bash
npm install  # Installs all dependencies including @anthropic-ai/sdk
```

### API Key (Optional - only for LLM-enhanced)
```bash
# Get key at: https://console.anthropic.com/
export ANTHROPIC_API_KEY="sk-ant-api03-..."

# Or add to .env file
echo 'ANTHROPIC_API_KEY=sk-ant-api03-...' >> .env
```

---

## Examples

### Example 1: Quick Screening
```bash
# Screen 100 competitors quantitatively
cat competitors.txt | while read url; do
  node scripts/generate-qx-report.js "$url"
done
```

### Example 2: Detailed Analysis
```bash
# Deep dive with AI contextual understanding
export ANTHROPIC_API_KEY="sk-ant-..."
node scripts/generate-contextual-qx-report.js https://teatimewithtesters.com/

# Output: reports/qx-contextual-<timestamp>.md
# Contains: Purpose, failure modes, features, stakeholders, recommendations
```

### Example 3: Production Report
```bash
# Generate template for human expert
node scripts/generate-qx-template.js https://example.com/

# Open in editor
code reports/qx-template-1764627990577.md

# Search for [HUMAN: and fill in insights
# Complete checklist at end
```

---

## Output Locations

All reports are saved to `reports/` directory:

- **HTML Reports**: `reports/qx-report-<timestamp>.html`
- **Contextual Reports**: `reports/qx-contextual-<timestamp>.md`
- **Templates**: `reports/qx-template-<timestamp>.md`

---

## Advanced Usage

### Hybrid Workflow: AI Draft → Human Refinement
```bash
# Step 1: Generate AI-enhanced report
node scripts/generate-contextual-qx-report.js https://example.com/

# Step 2: Review and add company-specific context
code reports/qx-contextual-*.md

# Step 3: Enhance with internal knowledge
# - Add KPI mappings
# - Reference past decisions
# - Include stakeholder feedback
```

### Batch Processing with Delays
```bash
# Avoid rate limits when processing many sites
for url in $(cat urls.txt); do
  node scripts/generate-contextual-qx-report.js "$url"
  sleep 2  # 2 second delay between requests
done
```

---

## Choosing the Right Script

**Use `generate-qx-report.js` if you need:**
- Fast results (1-2 seconds)
- No API costs
- CI/CD integration
- Quantitative metrics

**Use `generate-contextual-qx-report.js` if you need:**
- Contextual understanding
- Stakeholder-ready reports
- Named failure modes
- Strategic recommendations
- Have API key available

**Use `generate-qx-template.js` if you need:**
- Production-quality reports
- Domain expertise insights
- No API costs
- Team collaboration
- Educational/training value

---

## Troubleshooting

### "No API key found"
```bash
# LLM script gracefully falls back to quantitative-only
# To enable LLM enhancement:
export ANTHROPIC_API_KEY="sk-ant-..."
```

### "Timeout connecting to site"
```bash
# Some sites take longer to load
# Scripts have 10s timeout, most sites load in 1-3s
```

### "Template sections not filled"
```bash
# Search for [HUMAN: in your editor to find all sections
grep -n "\[HUMAN:" reports/qx-template-*.md
```

---

## Documentation

See [docs/QX-ANALYSIS-APPROACHES.md](../docs/QX-ANALYSIS-APPROACHES.md) for:
- Detailed comparison of all three approaches
- Use case recommendations
- API cost management
- Advanced hybrid workflows
- Decision tree for choosing approach

---

## Support

- **QX Framework**: [docs/Agentic-QE-Framework.md](../docs/Agentic-QE-Framework.md)
- **Baseline Example**: [teatime-qx-analysis-report.md](../teatime-qx-analysis-report.md)
- **Claude API**: https://docs.anthropic.com/

---

*Agentic QE Framework v1.9.4*
