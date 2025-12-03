# QX Analysis Approaches Guide

**Agentic QE Framework v1.9.4**  
**Three Ways to Generate Contextual QX Assessments**

---

## Overview

The QX Partner Agent provides three distinct approaches for generating Quality Experience (QX) assessments, each with different tradeoffs between automation, depth, and resource requirements.

| Approach | Speed | Depth | API Required | Best For |
|----------|-------|-------|--------------|----------|
| **Quantitative-Only** | ⚡ Fast | 📊 Metrics | ❌ No | Screening, CI/CD |
| **LLM-Enhanced** | 🐌 Slower | 🧠 Contextual | ✅ Yes | Detailed analysis |
| **Human-in-the-Loop** | 👤 Manual | 💎 Expert | ❌ No | Production reports |

---

## 1️⃣ Quantitative-Only Analysis

### What It Does
- Extracts automated metrics from the website
- Applies 23+ QX heuristics with scoring
- Generates recommendations based on patterns
- **No contextual understanding** of site purpose

### Strengths
✅ Fast execution (1-2 seconds)  
✅ No API costs or keys required  
✅ Consistent, reproducible results  
✅ Perfect for CI/CD screening  
✅ Identifies technical QX issues  

### Limitations
❌ Generic descriptions ("Evaluate quality experience")  
❌ No site purpose understanding  
❌ Cannot identify stakeholders  
❌ No contextual failure modes  
❌ Feature counts, not actual feature lists  

### Use Cases
- **Screening**: Quickly assess 100+ sites to find issues
- **CI/CD**: Automated QX checks in deployment pipelines
- **Monitoring**: Track QX metrics over time
- **Baseline**: Establish quantitative baseline before deep analysis

### Example Output
```
Score: 77/100
Heuristics Applied: 23
Issues Found: 5
- Missing main content landmark
- Low alt text coverage (45%)
- No skip navigation link
Recommendations: 8 generic suggestions
```

### How to Run
```bash
# Using standalone script
node scripts/generate-qx-report.js https://example.com/

# Using test harness (HTTP fallback)
node test-qx-http.js https://example.com/
```

---

## 2️⃣ LLM-Enhanced Analysis

### What It Does
- Collects quantitative metrics (Phase 1)
- Extracts actual page content (headings, nav, text)
- Sends to Claude AI for contextual understanding (Phase 2)
- Combines automated + AI insights (Phase 3)

### Strengths
✅ **Contextual understanding** of site purpose  
✅ **Specific, named failure modes** (e.g., "Content Discoverability")  
✅ **Actual feature lists** with descriptions (must/should/nice-to-have)  
✅ **Stakeholder identification** (who is affected)  
✅ **Actionable recommendations** with priority/impact/effort  
✅ Matches manual report quality  

### Limitations
❌ Requires ANTHROPIC_API_KEY  
❌ API costs (~$0.01-0.05 per analysis)  
❌ Slower execution (5-10 seconds)  
❌ Rate limits apply  
❌ Requires internet connection  

### Use Cases
- **Detailed assessments**: When you need depth over speed
- **Stakeholder reports**: For presenting to business/product teams
- **Competitive analysis**: Understanding competitor QX strategies
- **Strategic planning**: Informing UX roadmaps

### Example Output
```markdown
## Context Understanding
Tea Time with Testers is a testing community website for QA professionals 
seeking industry insights, testing tutorials, and peer discussions.

## Specific Failure Modes
1. **Content Discoverability**: Articles buried under complex navigation
2. **Mobile Experience**: Poor responsive design on smaller screens
3. **Community Engagement**: Difficult to find forums and discussions

## User Needs (Must-Have)
1. **Search Functionality**: Quickly find relevant testing articles
2. **Clear Navigation**: Access tutorials, forums, news sections easily
3. **Mobile Optimization**: Read articles on mobile devices
4. **Community Features**: Engage with other testers
5. **Newsletter Signup**: Stay updated on new content
6. **Resource Library**: Access testing templates and tools

## Stakeholders Affected
- **Readers**: Testing professionals seeking knowledge
- **Content Contributors**: Writers and tutorial creators
- **Editorial Team**: Managing content quality and calendar
- **Community Managers**: Facilitating discussions

## Recommendations
1. [HIGH PRIORITY] Implement faceted search with filters
   - Impact: 40% improvement in content discovery
   - Effort: 2-3 sprints
   - Why: Users currently struggle to find specific topics
```

### How to Run
```bash
# Set your Anthropic API key
export ANTHROPIC_API_KEY="sk-ant-..."

# Generate LLM-enhanced report
node scripts/generate-contextual-qx-report.js https://example.com/

# Output: reports/qx-contextual-<timestamp>.md
```

### API Key Setup
```bash
# Option 1: Environment variable (recommended)
export ANTHROPIC_API_KEY="sk-ant-api03-..."

# Option 2: .env file
echo 'ANTHROPIC_API_KEY=sk-ant-api03-...' >> .env

# Option 3: Shell profile (persistent)
echo 'export ANTHROPIC_API_KEY="sk-ant-api03-..."' >> ~/.bashrc
source ~/.bashrc
```

Get your API key at: https://console.anthropic.com/

### Graceful Degradation
If no API key is found, the script automatically falls back to **quantitative-only** mode with a clear warning:

```
⚠️  No Anthropic API key found
   Set ANTHROPIC_API_KEY environment variable for rich contextual analysis
   Falling back to quantitative-only report...
```

---

## 3️⃣ Human-in-the-Loop Analysis

### What It Does
- Generates template with automated metrics (Phase 1)
- Provides structured sections marked `[HUMAN: ...]` (Phase 2)
- Human expert fills in contextual insights (Phase 3)
- Combines automated accuracy + human understanding (Phase 4)

### Strengths
✅ **Best of both worlds**: Automated + human expertise  
✅ **No API costs**: Uses human intelligence, not AI  
✅ **Expert insights**: Domain knowledge and intuition  
✅ **Production quality**: Suitable for critical assessments  
✅ **Customizable**: Humans can add company-specific context  
✅ **Educational**: Template guides proper QX analysis  

### Limitations
❌ Requires human time (30-60 minutes per site)  
❌ Not scalable for 100+ sites  
❌ Quality depends on human expertise  
❌ Not real-time  

### Use Cases
- **Critical assessments**: For key products or competitors
- **Client deliverables**: When you need to present to stakeholders
- **Training**: Teaching QX analysis methodology
- **Hybrid workflow**: AI draft → human refinement

### Example Workflow

#### Step 1: Generate Template
```bash
node scripts/generate-qx-template.js https://example.com/
# Output: reports/qx-template-<timestamp>.md
```

#### Step 2: Open in Editor
```bash
code reports/qx-template-1764627990577.md
```

#### Step 3: Fill in `[HUMAN: ...]` Sections
```markdown
## Context Understanding
[HUMAN: Describe the website's purpose and target users in 2-3 sentences]
→ Tea Time with Testers is a testing community website serving QA professionals
  who need industry insights, testing tutorials, and peer discussions.

## Potential Failure Modes
1. **[HUMAN: Name]**: [HUMAN: Describe what could fail]
→ 1. **Content Discoverability**: With 1000+ articles, users struggle to find
     relevant content without advanced search and filtering capabilities.

## Must-Have Features
[HUMAN: List 4-6 specific features users absolutely need]
→ 1. **Advanced Search**: Filter by testing type, technology, difficulty level
  2. **Category Navigation**: Clear taxonomy (automation, manual, performance)
  3. **Mobile Optimization**: 60% of traffic is mobile devices
  4. **Newsletter Signup**: Weekly digest of new content
```

#### Step 4: Review Automated Metrics
The template includes automated scores - review and add context:
```markdown
### Bottom 3 Performing Heuristics:
1. **Content Accessibility**: 45/100 - [HUMAN: Explain why this scores low]
   *Automated issue*: Low alt text coverage
→ 1. **Content Accessibility**: 45/100 - Many tutorial images lack alt text,
     particularly code screenshots. This prevents screen reader users from
     understanding examples. Priority fix for WCAG compliance.
```

#### Step 5: Complete Checklist
```markdown
## Analysis Completion Checklist
- [x] Added website context and user description
- [x] Identified 3+ specific failure modes with names
- [x] Listed must-have/should-have/nice-to-have features
- [x] Defined business requirements and KPIs
- [x] Identified affected stakeholders
- [x] Added resolution approaches for oracle problems
- [x] Described visible and invisible impacts
- [x] Listed immutable requirements
- [x] Enhanced top/bottom heuristic explanations
- [x] Enriched recommendations with rationale and evidence
- [x] Added 3-5 additional contextual recommendations
```

#### Step 6: Deliver
The completed template becomes your production-quality QX assessment.

---

## Comparison Matrix

### Depth Comparison

| Aspect | Quantitative | LLM-Enhanced | Human-in-the-Loop |
|--------|-------------|--------------|-------------------|
| **Site Purpose** | ❌ Generic | ✅ Specific | ✅ Expert-level |
| **Failure Modes** | ⚠️ Template | ✅ Named & Specific | ✅ Domain-contextualized |
| **Feature Lists** | ⚠️ Counts | ✅ Actual features | ✅ Prioritized & detailed |
| **Stakeholders** | ❌ None | ✅ Identified | ✅ With impact analysis |
| **Recommendations** | ⚠️ Generic | ✅ Actionable | ✅ Strategic |
| **Business Context** | ❌ None | ⚠️ Inferred | ✅ Company-specific |

### Resource Comparison

| Resource | Quantitative | LLM-Enhanced | Human-in-the-Loop |
|----------|-------------|--------------|-------------------|
| **Time** | 1-2 seconds | 5-10 seconds | 30-60 minutes |
| **Cost** | $0 | $0.01-0.05 | Human time |
| **API Key** | Not required | Required | Not required |
| **Scalability** | 1000+ sites/hour | 100 sites/hour | 5-10 sites/day |
| **Quality** | Consistent | High | Variable |

---

## Choosing the Right Approach

### Decision Tree

```
START: I need a QX assessment
│
├─ Do I need it for 100+ sites?
│  └─ YES → Use Quantitative-Only (screening)
│  └─ NO → Continue
│
├─ Is this for CI/CD or monitoring?
│  └─ YES → Use Quantitative-Only (automation)
│  └─ NO → Continue
│
├─ Do I have an Anthropic API key?
│  ├─ YES → Do I need it quickly?
│  │  ├─ YES → Use LLM-Enhanced (5-10 sec)
│  │  └─ NO → Continue
│  └─ NO → Continue
│
├─ Is this a critical assessment?
│  └─ YES → Use Human-in-the-Loop (production quality)
│  └─ NO → Use LLM-Enhanced if available, else Quantitative
```

### Recommendations by Scenario

#### Scenario 1: CI/CD Pipeline
**Use**: Quantitative-Only  
**Why**: Fast, no dependencies, catches technical QX issues  
**Setup**: Add to GitHub Actions or Jenkins

#### Scenario 2: Competitive Analysis
**Use**: LLM-Enhanced  
**Why**: Need to understand competitor strategy and positioning  
**Setup**: Run locally with API key

#### Scenario 3: Client Deliverable
**Use**: Human-in-the-Loop  
**Why**: Production quality, company-specific insights  
**Setup**: Generate template → Fill in → Review → Deliver

#### Scenario 4: Product Redesign
**Use**: LLM-Enhanced → Human-in-the-Loop  
**Why**: AI draft provides starting point, human adds strategic context  
**Setup**: Generate AI report → Refine with domain expertise

#### Scenario 5: QX Monitoring Dashboard
**Use**: Quantitative-Only  
**Why**: Track metrics over time, visualize trends  
**Setup**: Scheduled runs with metric storage

---

## Advanced: Hybrid Workflows

### Workflow 1: AI Draft → Human Refinement

```bash
# Step 1: Generate AI-enhanced report
export ANTHROPIC_API_KEY="sk-ant-..."
node scripts/generate-contextual-qx-report.js https://example.com/

# Step 2: Review AI insights
code reports/qx-contextual-<timestamp>.md

# Step 3: Add company-specific context
# - Add internal KPI mappings
# - Reference past decisions
# - Include stakeholder quotes
# - Add competitive positioning

# Step 4: Final review and delivery
```

**Best For**: High-stakes assessments where AI provides foundation and human adds strategic layer

### Workflow 2: Quantitative Screening → Deep Dive

```bash
# Step 1: Screen 100 sites quantitatively
for url in $(cat competitor-list.txt); do
  node scripts/generate-qx-report.js "$url"
done

# Step 2: Sort by QX score
# Identify top 10 worst scores

# Step 3: Deep dive with LLM
for url in $(head -10 worst-scores.txt); do
  node scripts/generate-contextual-qx-report.js "$url"
done

# Step 4: Prioritize fixes based on AI insights
```

**Best For**: Large-scale analysis where you need to focus human/AI resources on problematic sites

### Workflow 3: Template-Guided Human Analysis

```bash
# Step 1: Generate template
node scripts/generate-qx-template.js https://example.com/

# Step 2: Team review session
# - Product Manager: Business requirements
# - UX Designer: User needs and flows
# - QA Engineer: Technical quality issues
# - Developer: Implementation feasibility

# Step 3: Consensus report
# Each team member fills their expertise areas
```

**Best For**: Cross-functional QX assessment where multiple perspectives are needed

---

## API Cost Management

### Claude API Pricing (as of 2024)
- **Model**: claude-3-5-sonnet-20241022
- **Input**: $3 per million tokens (~$0.003 per 1K tokens)
- **Output**: $15 per million tokens (~$0.015 per 1K tokens)

### Estimated Costs per Analysis
- **Input tokens**: ~1,500 (page context + prompt)
- **Output tokens**: ~2,000 (structured analysis)
- **Cost per analysis**: ~$0.03-0.05

### Cost Optimization Tips

1. **Batch Processing**: Run multiple analyses in sequence
2. **Caching**: Save results for unchanged sites
3. **Selective Enhancement**: Use quantitative screening first
4. **Token Limits**: Adjust max_tokens if briefer output acceptable
5. **Prompt Tuning**: Optimize prompt to reduce tokens

### Budget Examples

```
$10/month budget:
- 200-300 LLM-enhanced analyses
- 10 analyses per day
- Suitable for: small teams, occasional deep dives

$100/month budget:
- 2,000-3,000 analyses
- 100 analyses per day
- Suitable for: agencies, large teams, continuous analysis

$0/month budget:
- Unlimited quantitative-only
- Template-guided human analysis
- Suitable for: open source projects, tight budgets
```

---

## Example Commands Reference

```bash
# 1. Quantitative-Only (Fast Screening)
node scripts/generate-qx-report.js https://example.com/
node test-qx-http.js https://example.com/

# 2. LLM-Enhanced (Contextual Insights)
export ANTHROPIC_API_KEY="sk-ant-api03-..."
node scripts/generate-contextual-qx-report.js https://example.com/

# 3. Human-in-the-Loop (Production Quality)
node scripts/generate-qx-template.js https://example.com/
code reports/qx-template-*.md
# Fill in [HUMAN: ...] sections

# Batch processing example
cat urls.txt | while read url; do
  node scripts/generate-qx-report.js "$url"
done

# Compare before/after QX improvements
node scripts/generate-contextual-qx-report.js https://example.com/ > before.md
# ... make improvements ...
node scripts/generate-contextual-qx-report.js https://example.com/ > after.md
diff before.md after.md
```

---

## Troubleshooting

### Issue: "No API key found"
**Solution**: Set ANTHROPIC_API_KEY environment variable
```bash
export ANTHROPIC_API_KEY="sk-ant-api03-..."
```

### Issue: "API rate limit exceeded"
**Solution**: Wait or reduce frequency
```bash
# Add delay between requests
for url in $(cat urls.txt); do
  node scripts/generate-contextual-qx-report.js "$url"
  sleep 2  # 2 second delay
done
```

### Issue: "Timeout connecting to site"
**Solution**: Increase timeout or check connectivity
```javascript
// In script, modify timeout:
{ timeout: 30000 }  // 30 seconds
```

### Issue: "Template sections not filled"
**Solution**: Search for `[HUMAN:` in editor to find all sections
```bash
grep -n "\[HUMAN:" reports/qx-template-*.md
```

---

## Next Steps

1. **Try All Three Approaches**
   ```bash
   # Quantitative
   node scripts/generate-qx-report.js https://example.com/
   
   # LLM (if you have API key)
   node scripts/generate-contextual-qx-report.js https://example.com/
   
   # Human-in-the-Loop
   node scripts/generate-qx-template.js https://example.com/
   ```

2. **Compare Outputs**: See the depth difference yourself

3. **Choose Your Workflow**: Based on your needs and resources

4. **Integrate into Process**: CI/CD, weekly reviews, etc.

5. **Share Insights**: Use reports to drive QX improvements

---

## Resources

- **QX Philosophy**: [docs/Agentic-QE-Framework.md](./Agentic-QE-Framework.md)
- **Manual Baseline**: [teatime-qx-analysis-report.md](../teatime-qx-analysis-report.md)
- **Agent Architecture**: [src/agents/QXPartnerAgent.ts](../src/agents/QXPartnerAgent.ts)
- **Claude API Docs**: https://docs.anthropic.com/

---

*Generated by Agentic QE Framework v1.9.4*  
*QX Partner Agent - Production Ready*
