# QX Analysis CLI

Professional implementation of QX (Quality Experience) Analysis following the official QX Partner Agent architecture.

## What is QX?

**QX = Quality Advocacy (QA) + User Experience (UX)**

QX is a marriage between QA and UX to co-create quality experience for everyone associated with a product. Based on the [Quality Experience concept by Lalit Bhamare](https://talesoftesting.com/quality-experienceqx-co-creating-quality-experience-for-everyone-associated-with-the-product/).

## Architecture

This script is a proper CLI wrapper around the QX Partner Agent, following the architecture documented in:
- `/workspaces/agentic-qe/docs/agents/QX-PARTNER-AGENT.md`
- `/workspaces/agentic-qe/src/agents/QXPartnerAgent.ts`

## Usage

```bash
node scripts/generate-qx-analysis.js <url> [options]
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--mode <full\|quick\|targeted>` | Analysis mode | `full` |
| `--no-testability` | Disable testability integration | enabled |
| `--no-oracle` | Disable oracle problem detection | enabled |
| `--format <json\|markdown\|html>` | Output format | `markdown` |
| `--output <path>` | Output file path | auto-generated |
| `--min-score <number>` | Minimum acceptable QX score | none |

### Examples

**Basic analysis:**
```bash
node scripts/generate-qx-analysis.js https://example.com
```

**Quick analysis (faster, less detailed):**
```bash
node scripts/generate-qx-analysis.js https://example.com --mode quick
```

**HTML report:**
```bash
node scripts/generate-qx-analysis.js https://example.com --format html --output report.html
```

**With minimum score threshold:**
```bash
node scripts/generate-qx-analysis.js https://example.com --min-score 80
```
*Note: Exit code 1 if score below threshold*

**Standalone UX analysis (no testability):**
```bash
node scripts/generate-qx-analysis.js https://example.com --no-testability
```

**Quick oracle problem check:**
```bash
node scripts/generate-qx-analysis.js https://example.com --mode quick --format json | jq '.oracleProblems'
```

## What Gets Analyzed

### 1. Problem Analysis (20% of score)
- **Clarity Score**: How well the problem is understood
- **Complexity**: Simple, Moderate, or Complex
- **Rule of Three**: At least 3 ways the design could fail

### 2. User Needs Analysis (25% of score)
- **Needs Identification**: Must-have, Should-have, Nice-to-have
- **Suitability Assessment**: How well needs are addressed
- **Alignment Score**: Overall user needs satisfaction
- **Challenges**: Information that invalidates user needs

### 3. Business Needs Analysis (20% of score)
- **Primary Goal**: Business-ease vs User-experience vs Balanced
- **KPI Impact**: Affected business metrics
- **Cross-Team Impact**: Effects on other teams
- **UX Compromises**: Trade-offs made for business needs

### 4. Oracle Problem Detection
Detects when quality criteria are unclear:
- User vs Business conflicts
- Missing information
- Stakeholder conflicts
- Unclear criteria
- Technical constraints

### 5. Impact Analysis (15% of score)
**Visible Impacts:**
- GUI process flow
- User feelings
- Cross-functional team effects

**Invisible Impacts:**
- Performance implications
- Security considerations
- Accessibility effects
- Data-dependent impacts

### 6. UX Testing Heuristics (20% of score)
25+ heuristics across 6 categories:
- Problem Analysis
- User Needs
- Business Needs
- Finding Balance
- Impact Analysis
- Creativity
- Design Quality

### 7. Testability Integration (Optional)
When enabled, integrates with the 10 Principles of Testability Scoring:
- Observability
- Controllability
- Decomposability
- Simplicity
- Stability
- Unbugginess
- etc.

## Output Formats

### Markdown (Default)
Comprehensive human-readable report with:
- Executive summary
- Detailed analysis by component
- Oracle problems with resolution approaches
- Impact analysis (visible + invisible)
- Heuristics results
- Prioritized recommendations
- Testability integration (if enabled)

### JSON
Machine-readable format containing:
```json
{
  "overallScore": 77,
  "grade": "C",
  "timestamp": "2025-12-02T10:20:59.860Z",
  "target": "https://example.com",
  "problemAnalysis": {...},
  "userNeeds": {...},
  "businessNeeds": {...},
  "oracleProblems": [...],
  "impactAnalysis": {...},
  "heuristics": [...],
  "recommendations": [...],
  "testabilityIntegration": {...}
}
```

### HTML
Styled HTML report suitable for sharing with stakeholders.

## Grading Scale

| Score | Grade | Meaning |
|-------|-------|---------|
| 90-100 | A | Excellent quality experience |
| 80-89 | B | Good quality experience |
| 70-79 | C | Adequate quality experience |
| 60-69 | D | Poor quality experience |
| 0-59 | F | Failing quality experience |

## Report Location

Reports are saved to `/workspaces/agentic-qe/reports/` with auto-generated filenames:
- `qx-analysis-{timestamp}.md`
- `qx-analysis-{timestamp}.json`
- `qx-analysis-{timestamp}.html`

Or specify custom path with `--output <path>`

## Key Differences from Old Script

### Old Script (`generate-contextual-qx-report.js`) ❌
- **Garbage implementation** - Did NOT follow QX Partner Agent architecture
- Mixed HTTP scraping with ad-hoc analysis
- Ignored agent's built-in capabilities
- Generic templates, not actual analysis
- No proper task execution flow
- Missing oracle problems, impact analysis, recommendations

### New Script (`generate-qx-analysis.js`) ✅
- **Proper implementation** - Follows official QX Partner Agent documentation
- Uses QXPartnerAgent class properly
- Executes tasks via proper task flow
- Leverages all agent capabilities:
  - Problem analysis
  - User needs analysis
  - Business needs analysis
  - Oracle problem detection
  - Impact analysis (visible + invisible)
  - Heuristics engine
  - Recommendations generation
  - Testability integration
- Actual analysis, not templates
- Proper memory store implementation
- Clean architecture

## Integration with Agent System

This CLI script is a thin wrapper around the QX Partner Agent. The agent can also be used programmatically:

```javascript
const { QXPartnerAgent } = require('../dist/agents/QXPartnerAgent');
const { QXTaskType } = require('../dist/types/qx');

// Create agent
const agent = new QXPartnerAgent({
  analysisMode: 'full',
  integrateTestability: true,
  detectOracleProblems: true,
  context: {...},
  memoryStore: {...},
  eventBus: {...}
});

// Initialize
await agent.initialize();

// Execute analysis
const analysis = await agent.executeTask({
  id: 'qx-1',
  assignee: agent.agentId,
  task: {
    type: 'qx-task',
    payload: {
      type: QXTaskType.FULL_ANALYSIS,
      target: 'https://example.com'
    }
  }
});

// Cleanup
await agent.cleanup();
```

## Requirements

- Node.js 18+
- Playwright (installed automatically)
- Built TypeScript code (`npm run build`)

## Troubleshooting

**Error: "Cannot find module '../dist/agents/QXPartnerAgent'"**
- Run `npm run build` to compile TypeScript

**Browser launch fails:**
- Install Playwright browsers: `npx playwright install chromium`

**Low score but looks good:**
- Check oracle problems - may indicate unclear quality criteria
- Review impact analysis for invisible impacts
- Consider testability integration for technical quality

**Script hangs:**
- Check target URL is accessible
- Try `--mode quick` for faster analysis
- Check network/firewall

## Related Documentation

- [QX Partner Agent Documentation](/workspaces/agentic-qe/docs/agents/QX-PARTNER-AGENT.md)
- [QX Partner Agent Implementation](/workspaces/agentic-qe/src/agents/QXPartnerAgent.ts)
- [QX Types](/workspaces/agentic-qe/src/types/qx.ts)
- [Quality Experience Concept](https://talesoftesting.com/quality-experienceqx-co-creating-quality-experience-for-everyone-associated-with-the-product/)

## License

Part of the Agentic QE Framework
