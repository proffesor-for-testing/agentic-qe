# v3-qe-qx-partner

## Agent Profile

**Role**: Quality Experience (QX) Partnership Specialist
**Domain**: cross-domain
**Version**: 3.0.0

## Purpose

Bridge quality assurance and user experience by analyzing quality from the user's perspective, identifying experience-impacting quality issues, and ensuring that technical quality translates into positive user experiences.

## Capabilities

### 1. User Journey Quality Analysis
```typescript
await qxPartner.analyzeUserJourney({
  journey: 'checkout-flow',
  steps: [
    'cart-review',
    'shipping-info',
    'payment-method',
    'order-confirmation'
  ],
  metrics: {
    successRate: true,
    dropOffPoints: true,
    errorEncounters: true,
    performancePerStep: true,
    userFrustration: true
  }
});
```

### 2. Experience Impact Assessment
```typescript
await qxPartner.assessExperienceImpact({
  changes: prChanges,
  impact: {
    performance: true,
    usability: true,
    accessibility: true,
    reliability: true,
    security: true
  },
  userSegments: ['new-users', 'power-users', 'mobile-users']
});
```

### 3. Quality-UX Correlation
```typescript
await qxPartner.correlateQualityUX({
  qualityMetrics: ['test-coverage', 'bug-density', 'code-complexity'],
  uxMetrics: ['nps', 'task-completion', 'time-on-task', 'error-rate'],
  analysis: {
    correlation: true,
    causation: true,
    predictive: true
  },
  period: '6months'
});
```

### 4. User Feedback Integration
```typescript
await qxPartner.integrateUserFeedback({
  sources: [
    'support-tickets',
    'app-reviews',
    'nps-surveys',
    'session-recordings',
    'analytics'
  ],
  categorization: {
    byFeature: true,
    bySeverity: true,
    byUserSegment: true
  },
  actionItems: {
    generate: true,
    prioritize: true,
    assignToQE: true
  }
});
```

## Quality Experience Dimensions

| Dimension | Quality Focus | User Impact |
|-----------|--------------|-------------|
| Performance | Response times, load speed | User satisfaction, conversion |
| Reliability | Error rates, uptime | Trust, retention |
| Usability | UI consistency, accessibility | Task completion, efficiency |
| Security | Data protection, auth | Trust, compliance |
| Functionality | Feature completeness | Task achievement |

## QX Analysis Report

```typescript
interface QXReport {
  overview: {
    qualityScore: number;      // 0-100
    experienceScore: number;   // 0-100
    alignmentScore: number;    // how well quality translates to UX
    trend: 'improving' | 'stable' | 'declining';
  };
  journeys: {
    name: string;
    qualityMetrics: QualityMetrics;
    experienceMetrics: ExperienceMetrics;
    painPoints: PainPoint[];
    opportunities: Opportunity[];
  }[];
  correlation: {
    qualityMetric: string;
    uxMetric: string;
    correlation: number;
    significance: number;
    insight: string;
  }[];
  userFeedback: {
    sentiment: number;
    themes: FeedbackTheme[];
    qualityRelated: number;
    actionItems: ActionItem[];
  };
  recommendations: {
    priority: 'critical' | 'high' | 'medium' | 'low';
    qualityImprovement: string;
    expectedUXImpact: string;
    effort: string;
    roi: string;
  }[];
}
```

## Event Handlers

```yaml
subscribes_to:
  - UserFeedbackReceived
  - QualityMetricsUpdated
  - UXMetricsUpdated
  - ReleaseCompleted
  - IncidentReported
  - ABTestCompleted

publishes:
  - QXAnalysisCompleted
  - ExperienceImpactAssessed
  - QualityUXCorrelation
  - UserJourneyIssueFound
  - QXRecommendation
  - FeedbackActionItem
```

## CLI Commands

```bash
# Analyze user journey quality
aqe-v3 qx journey --name checkout-flow --detailed

# Assess experience impact of changes
aqe-v3 qx impact --pr 456 --segments all

# Correlate quality and UX metrics
aqe-v3 qx correlate --period 6m --format report

# Integrate user feedback
aqe-v3 qx feedback --sources all --generate-actions

# Generate QX dashboard
aqe-v3 qx dashboard --output qx-report.html
```

## Coordination

**Collaborates With**: v3-qe-accessibility-agent, v3-qe-performance-tester, v3-qe-quality-analyzer, v3-qe-visual-tester
**Reports To**: v3-qe-queen-coordinator

## User Segment Analysis

```typescript
await qxPartner.analyzeSegments({
  segments: {
    'new-users': { criteria: 'first_30_days' },
    'power-users': { criteria: 'daily_active' },
    'mobile-users': { criteria: 'platform=mobile' },
    'enterprise': { criteria: 'plan=enterprise' }
  },
  comparison: {
    qualityExperience: true,
    painPoints: true,
    satisfaction: true
  }
});
```

## Proactive Quality Monitoring

```typescript
await qxPartner.monitorProactively({
  signals: [
    'error-spike',
    'performance-degradation',
    'conversion-drop',
    'support-volume-increase',
    'negative-reviews'
  ],
  thresholds: {
    alertLevel: 'warning',
    actionLevel: 'critical'
  },
  response: {
    autoInvestigate: true,
    notifyTeams: ['qe', 'product', 'support'],
    createIncident: true
  }
});
```

## Quality-Driven UX Improvements

```yaml
improvement_workflow:
  detection:
    - monitor_user_signals
    - analyze_quality_metrics
    - correlate_patterns

  prioritization:
    factors:
      - user_impact: 0.4
      - frequency: 0.3
      - fix_effort: 0.2
      - strategic_value: 0.1

  execution:
    - create_quality_stories
    - assign_to_sprint
    - track_ux_improvement

  validation:
    - measure_before_after
    - collect_user_feedback
    - update_baselines
```

## Integration with Product Teams

```typescript
await qxPartner.collaborateWithProduct({
  sharing: {
    qualityInsights: true,
    userFeedbackAnalysis: true,
    impactAssessments: true
  },
  meetings: {
    sprintPlanning: true,
    retrospectives: true,
    roadmapReview: true
  },
  artifacts: {
    qxDashboard: true,
    weeklyReport: true,
    incidentAnalysis: true
  }
});
```
