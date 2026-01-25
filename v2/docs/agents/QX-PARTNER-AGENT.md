# QX Partner Agent - Quality Experience (QX) Analysis

## Overview

The **QX Partner Agent** implements the Quality Experience (QX) concept - a marriage between QA (Quality Advocacy) and UX (User Experience) to co-create quality experience for everyone associated with a product.

**Based on:** [Quality Experience(QX): Co-creating Quality Experience for everyone associated with the product](https://talesoftesting.com/quality-experienceqx-co-creating-quality-experience-for-everyone-associated-with-the-product/)

### Core Philosophy

> **Quality is "value to someone who matters"** - when multiple stakeholders matter simultaneously, traditional QA or UX alone may not be enough.

QX fills the gap by:
- Facilitating collaboration between QA and UX professionals
- Solving oracle problems (when quality criteria are unclear)
- Finding balance between user experience and business needs
- Providing comprehensive impact analysis for design changes

## Key Capabilities

| Capability | Description | Version |
|------------|-------------|---------|
| **qx-analysis** | Comprehensive QX analysis combining QA and UX perspectives | 1.0.0 |
| **oracle-problem-detection** | Detect and resolve oracle problems when quality criteria are unclear | 1.0.0 |
| **ux-testing-heuristics** | Apply UX testing heuristics (Rule of Three, user needs, business needs) | 1.0.0 |
| **user-business-balance** | Find optimal balance between UX and business objectives | 1.0.0 |
| **impact-analysis** | Analyze visible and invisible impacts on all stakeholders | 1.0.0 |
| **testability-integration** | Integrate with testability scoring (10 Principles) for combined insights | 1.0.0 |
| **collaborative-qx** | Coordinate with UX and QA agents for holistic assessment | 1.0.0 |

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│              QX Partner Agent                           │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────────┐  ┌──────────────────┐            │
│  │  QX Heuristics   │  │  Oracle Problem  │            │
│  │     Engine       │  │     Detector     │            │
│  └──────────────────┘  └──────────────────┘            │
│                                                          │
│  ┌──────────────────┐  ┌──────────────────┐            │
│  │  Impact          │  │  Testability     │            │
│  │  Analyzer        │  │  Integration     │            │
│  └──────────────────┘  └──────────────────┘            │
│                                                          │
└─────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
┌────────────────┐   ┌────────────────┐   ┌────────────────┐
│ Visual Tester  │   │ Quality        │   │ Testability    │
│ Agent (UX)     │   │ Analyzer (QA)  │   │ Scoring Skill  │
└────────────────┘   └────────────────┘   └────────────────┘
```

## QX Analysis Components

### 1. Problem Analysis
- **Rule of Three**: Identify at least 3 ways a design could fail
- **Complexity Assessment**: Simple, Moderate, or Complex
- **Clarity Scoring**: 0-100 score for problem clarity
- **Breakdown**: Sub-problems identification

### 2. User Needs Analysis
- **Needs Identification**: Must-have, Should-have, Nice-to-have
- **Suitability Assessment**: Excellent, Good, Adequate, Poor
- **Alignment Scoring**: 0-100 score for user needs alignment
- **Challenge Detection**: Information that invalidates user needs

### 3. Business Needs Analysis
- **Primary Goal**: Business-ease vs User-experience vs Balanced
- **KPI Impact**: Affected business metrics
- **Cross-Team Impact**: Effects on other teams
- **Compromise Detection**: UX compromises or KPI impacts

### 4. Oracle Problem Detection
Detects when quality criteria are unclear due to:
- **User vs Business conflicts**: Significant gaps in alignment
- **Missing information**: Incomplete context for decision-making
- **Stakeholder conflicts**: Disagreements between stakeholders
- **Unclear criteria**: Ambiguous quality requirements
- **Technical constraints**: Hidden technical limitations

### 5. Impact Analysis
Analyzes both **visible** and **invisible** impacts:

**Visible Impacts:**
- GUI process flow (end-user and internal-user)
- User feelings (happy, confused, frustrated, etc.)
- Cross-functional team effects

**Invisible Impacts:**
- Performance implications
- Security considerations
- Accessibility effects
- Data-dependent impacts

### 6. UX Testing Heuristics
25+ heuristics across 6 categories:

#### Problem Analysis Heuristics
- `problem-understanding`
- `rule-of-three`
- `problem-complexity`

#### User Needs Heuristics
- `user-needs-identification`
- `user-needs-suitability`
- `user-needs-validation`

#### Business Needs Heuristics
- `business-needs-identification`
- `user-vs-business-balance`
- `kpi-impact-analysis`

#### Finding Balance Heuristics
- `oracle-problem-detection`
- `what-must-not-change`
- `supporting-data-analysis`

#### Impact Analysis Heuristics
- `gui-flow-impact`
- `user-feelings-impact`
- `cross-functional-impact`
- `data-dependent-impact`

#### Creativity Heuristics
- `competitive-analysis`
- `domain-inspiration`
- `innovative-solutions`

#### Design Quality Heuristics
- `exactness-and-clarity`
- `intuitive-design`
- `counter-intuitive-design`
- `consistency-analysis`

## Usage

### Basic QX Analysis

```typescript
import { QEAgentFactory } from '@agentic-qe/agents';
import { QXTaskType } from '@agentic-qe/types/qx';

// Create QX Partner Agent
const factory = new QEAgentFactory(factoryConfig);
const qxAgent = await factory.createAgent('qx-partner', {
  analysisMode: 'full',
  integrateTestability: true,
  detectOracleProblems: true
});

// Perform full QX analysis
const analysis = await qxAgent.executeTask({
  id: 'qx-analysis-1',
  assignee: qxAgent.getAgentId(),
  task: {
    type: 'qx-task',
    payload: {
      type: QXTaskType.FULL_ANALYSIS,
      target: 'https://example.com',
      params: {
        context: {
          // Optional additional context
        }
      }
    }
  }
});

console.log(`QX Score: ${analysis.overallScore}/100 (${analysis.grade})`);
console.log(`Oracle Problems: ${analysis.oracleProblems.length}`);
console.log(`Recommendations: ${analysis.recommendations.length}`);
```

### Oracle Problem Detection Only

```typescript
const oracleProblems = await qxAgent.executeTask({
  id: 'oracle-detection-1',
  assignee: qxAgent.getAgentId(),
  task: {
    type: 'qx-task',
    payload: {
      type: QXTaskType.ORACLE_DETECTION,
      target: 'https://example.com'
    }
  }
});

// Handle oracle problems
for (const problem of oracleProblems) {
  if (problem.severity === 'critical' || problem.severity === 'high') {
    console.log(`🚨 ${problem.type}: ${problem.description}`);
    console.log(`Resolution: ${problem.resolutionApproach.join(', ')}`);
  }
}
```

### User vs Business Balance Analysis

```typescript
const balance = await qxAgent.executeTask({
  id: 'balance-analysis-1',
  assignee: qxAgent.getAgentId(),
  task: {
    type: 'qx-task',
    payload: {
      type: QXTaskType.BALANCE_ANALYSIS,
      target: 'https://example.com'
    }
  }
});

if (balance.balance.isBalanced) {
  console.log('✅ Good balance between user and business needs');
} else if (balance.balance.favorsUser) {
  console.log('⚠️  Consider business objectives more');
} else {
  console.log('⚠️  Consider user needs more');
}
```

### Apply Specific Heuristic

```typescript
import { QXHeuristic } from '@agentic-qe/types/qx';

const heuristicResult = await qxAgent.executeTask({
  id: 'heuristic-1',
  assignee: qxAgent.getAgentId(),
  task: {
    type: 'qx-task',
    payload: {
      type: QXTaskType.APPLY_HEURISTIC,
      target: 'https://example.com',
      params: {
        heuristic: QXHeuristic.RULE_OF_THREE
      }
    }
  }
});

console.log(`Heuristic Score: ${heuristicResult.score}/100`);
console.log(`Issues Found: ${heuristicResult.issues.length}`);
```

### Integration with Testability Scoring

```typescript
const qxAnalysis = await qxAgent.executeTask({
  id: 'qx-with-testability-1',
  assignee: qxAgent.getAgentId(),
  task: {
    type: 'qx-task',
    payload: {
      type: QXTaskType.FULL_ANALYSIS,
      target: 'https://example.com',
      config: {
        integrateTestability: true,
        testabilityScoringPath: '.claude/skills/testability-scoring'
      }
    }
  }
});

if (qxAnalysis.testabilityIntegration) {
  console.log('Testability Score:', qxAnalysis.testabilityIntegration.testabilityScore);
  console.log('Combined Insights:', qxAnalysis.testabilityIntegration.combinedInsights);
}
```

## Configuration

### Agent Configuration

```typescript
interface QXPartnerConfig {
  // Analysis mode: full, quick, or targeted
  analysisMode: 'full' | 'quick' | 'targeted';
  
  // Heuristics configuration
  heuristics: {
    enabledHeuristics: QXHeuristic[];
    minConfidence?: number; // 0-1, default: 0.7
    enableCompetitiveAnalysis?: boolean;
    competitorUrls?: string[];
  };
  
  // Testability integration
  integrateTestability: boolean;
  testabilityScoringPath?: string;
  
  // Oracle problem detection
  detectOracleProblems: boolean;
  minOracleSeverity?: 'low' | 'medium' | 'high' | 'critical';
  
  // Collaboration
  collaboration?: {
    coordinateWithUX: boolean;
    coordinateWithQA: boolean;
    shareWithQualityAnalyzer: boolean;
  };
  
  // Output
  outputFormat?: 'json' | 'html' | 'markdown' | 'all';
  
  // Thresholds
  thresholds?: {
    minQXScore?: number;
    minProblemClarity?: number;
    minUserNeedsAlignment?: number;
    minBusinessAlignment?: number;
  };
}
```

### Task Types

```typescript
enum QXTaskType {
  // Perform comprehensive QX analysis
  FULL_ANALYSIS = 'qx-full-analysis',
  
  // Detect oracle problems only
  ORACLE_DETECTION = 'qx-oracle-detection',
  
  // Analyze user vs business needs balance
  BALANCE_ANALYSIS = 'qx-balance-analysis',
  
  // Perform impact analysis
  IMPACT_ANALYSIS = 'qx-impact-analysis',
  
  // Apply specific heuristic
  APPLY_HEURISTIC = 'qx-apply-heuristic',
  
  // Generate QX recommendations
  GENERATE_RECOMMENDATIONS = 'qx-generate-recommendations',
  
  // Integrate with testability scoring
  INTEGRATE_TESTABILITY = 'qx-integrate-testability'
}
```

## MCP Integration

The QX Partner Agent is available via MCP (Model Context Protocol):

```bash
# Spawn QX Partner Agent via MCP
mcp__agentic_qe__agent_spawn --type "qx-partner" --config '{
  "analysisMode": "full",
  "integrateTestability": true
}'

# Execute QX analysis task
mcp__agentic_qe__agent_execute --agent-id "qx-partner-1" --task '{
  "type": "qx-full-analysis",
  "target": "https://example.com"
}'
```

## Output Structure

### QX Analysis Result

```typescript
interface QXAnalysis {
  // Overall assessment
  overallScore: number;       // 0-100
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  timestamp: Date;
  target: string;
  
  // Analysis components
  problemAnalysis: ProblemAnalysis;
  userNeeds: UserNeedsAnalysis;
  businessNeeds: BusinessNeedsAnalysis;
  oracleProblems: OracleProblem[];
  impactAnalysis: ImpactAnalysis;
  heuristics: QXHeuristicResult[];
  recommendations: QXRecommendation[];
  
  // Optional integrations
  testabilityIntegration?: TestabilityIntegration;
  
  // Raw context
  context: QXContext;
}
```

### QX Recommendations

```typescript
interface QXRecommendation {
  principle: string;              // Which principle/area
  recommendation: string;         // What to do
  severity: 'low' | 'medium' | 'high' | 'critical';
  impact: number;                 // 0-100
  effort: 'low' | 'medium' | 'high';
  priority: number;               // Lower = higher priority
  category: 'ux' | 'qa' | 'qx' | 'technical' | 'process' | 'design';
  evidence?: string[];            // Supporting evidence
}
```

## Best Practices

### 1. Early Collaboration
Involve the QX Partner Agent early in the design process to catch oracle problems before they become costly issues.

### 2. Combine with Testability Scoring
Always enable testability integration for comprehensive quality insights that span both testing and user experience.

### 3. Address High-Priority Oracle Problems First
Focus on critical and high-severity oracle problems as they indicate fundamental uncertainties in quality criteria.

### 4. Balance User and Business Needs
Use the balance analysis regularly to ensure you're not favoring one perspective too heavily.

### 5. Apply Heuristics Iteratively
Don't try to apply all heuristics at once. Start with problem understanding and user/business needs, then expand.

### 6. Share Insights Across Teams
Enable collaboration features to share QX insights with UX designers, QA engineers, and quality analyzers.

## Scoring System

### QX Score Calculation

The overall QX score is a weighted average of:
- **Problem Clarity (20%)**: How well the problem is understood
- **User Needs Alignment (25%)**: How well user needs are addressed
- **Business Needs Alignment (20%)**: How well business needs are met
- **Impact Score (15%)**: Inverse of impact risk (lower impact = higher score)
- **Heuristics Average (20%)**: Average score across all applied heuristics

### Grading Scale

| Score | Grade | Meaning |
|-------|-------|---------|
| 90-100 | A | Excellent quality experience |
| 80-89 | B | Good quality experience |
| 70-79 | C | Adequate quality experience |
| 60-69 | D | Poor quality experience |
| 0-59 | F | Failing quality experience |

## Real-World Example

```typescript
// Real-world QX analysis scenario
const qxAnalysis = await qxAgent.executeTask({
  id: 'checkout-redesign-qx',
  assignee: qxAgent.getAgentId(),
  task: {
    type: 'qx-task',
    payload: {
      type: QXTaskType.FULL_ANALYSIS,
      target: 'https://mystore.com/checkout',
      params: {
        context: {
          feature: 'checkout-redesign',
          stakeholders: ['users', 'business', 'support'],
          constraints: ['mobile-first', 'conversion-focused']
        }
      },
      config: {
        integrateTestability: true,
        collaboration: {
          coordinateWithUX: true,
          coordinateWithQA: true,
          shareWithQualityAnalyzer: true
        }
      }
    }
  }
});

// Example output:
// QX Score: 72/100 (C)
// Oracle Problems: 2 detected
//   1. High: User convenience vs business revenue conflict
//   2. Medium: Missing mobile usability data
// 
// Top Recommendations:
//   1. [HIGH] Gather mobile user data to resolve oracle problem
//   2. [HIGH] Find compromise between one-click checkout and upsell opportunities
//   3. [MEDIUM] Improve form field labeling for better clarity
//
// Testability Integration:
//   - Testability Score: 78/100 (C)
//   - Low observability may impact both testing and user experience
```

## References

- [Original QX Concept by Lalit Bhamare](https://talesoftesting.com/quality-experienceqx-co-creating-quality-experience-for-everyone-associated-with-the-product/)
- [System Design Heuristics by Jerry Weinberg](https://www.goodreads.com/book/show/40013864-system-design-heuristics)
- [Whole Team Quality](https://www.stickyminds.com/article/whole-team-testing-whole-team-quality)
- [Testability Scoring (10 Principles)](/.claude/skills/testability-scoring/README.md)

## Support

For questions or issues with the QX Partner Agent:
- Review the [Implementation Plan](/docs/agents/QX-PARTNER-IMPLEMENTATION-PLAN.md)
- Check the [Research Report](/docs/research/QE-QX-PARTNER-AGENT-RESEARCH.md)
- Examine [Type Definitions](/src/types/qx.ts)
- See [Agent Implementation](/src/agents/QXPartnerAgent.ts)

---

**Version:** 1.0.0  
**Status:** Production Ready  
**Author:** Agentic QE Team  
**Last Updated:** December 2025
