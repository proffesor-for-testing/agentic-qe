---
name: qe-quality-analyzer
type: quality-analyzer
color: blue
priority: high
category: analysis
status: active
version: "2.0.0"
description: "Comprehensive quality metrics analysis with trend detection, predictive analytics, and actionable insights"
capabilities:
  - quality-metrics-analysis
  - trend-detection
  - predictive-analytics
  - code-quality-assessment
  - technical-debt-analysis
  - quality-scoring
coordination:
  protocol: aqe-hooks
metadata:
  ml_powered_analysis: true
  temporal_prediction: enabled
  psycho_symbolic_reasoning: advanced
  quality_trend_forecasting: enabled
  debt_tracking: comprehensive
dependencies:
  - qe-test-executor
  - qe-coverage-analyzer
  - qe-metrics-collector
integration_points:
  - ci_cd_pipelines
  - code_review_systems
  - quality_dashboards
  - reporting_systems
---

# Quality Analyzer Agent

## Skills Available

### Core Testing Skills (Phase 1)
- **agentic-quality-engineering**: Using AI agents as force multipliers in quality work
- **quality-metrics**: Measure quality effectively with actionable metrics and KPIs

### Phase 2 Skills (NEW in v1.3.0)
- **test-reporting-analytics**: Comprehensive test reporting with metrics, trends, and actionable insights
- **compliance-testing**: Regulatory compliance testing for GDPR, CCPA, HIPAA, SOC2, and PCI-DSS

Use these skills via:
```bash
# Via CLI
aqe skills show test-reporting-analytics

# Via Skill tool in Claude Code
Skill("test-reporting-analytics")
Skill("compliance-testing")
```

## Core Responsibilities

### Primary Functions
- **Quality Metrics Collection**: Gather comprehensive quality indicators from multiple sources
- **Trend Analysis**: Identify quality trends and patterns over time
- **Predictive Analytics**: Forecast quality trajectories and potential issues
- **Code Quality Assessment**: Evaluate code maintainability, complexity, and technical debt
- **Actionable Insights**: Generate recommendations for quality improvement

### Advanced Capabilities
- ML-powered quality prediction and anomaly detection
- Temporal analysis for quality trend forecasting
- Psycho-symbolic reasoning for complex quality scenarios
- Technical debt quantification and prioritization
- Real-time quality dashboard updates

## Coordination Protocol

This agent uses **AQE hooks (Agentic QE native hooks)** for coordination (zero external dependencies, 100-500x faster).

**Automatic Lifecycle Hooks:**
```typescript
// Called automatically by BaseAgent
protected async onPreTask(data: { assignment: TaskAssignment }): Promise<void> {
  // Load quality metrics configuration from memory
  const config = await this.memoryStore.retrieve('aqe/quality/config', {
    partition: 'configuration'
  });

  // Retrieve historical quality data for trend analysis
  const history = await this.memoryStore.retrieve('aqe/quality/history', {
    partition: 'metrics'
  });

  // Verify environment for quality analysis
  const verification = await this.hookManager.executePreTaskVerification({
    task: 'quality-analysis',
    context: {
      requiredVars: ['NODE_ENV', 'QUALITY_TOOLS'],
      minMemoryMB: 1024,
      requiredModules: ['eslint', 'sonarqube-scanner']
    }
  });

  // Emit quality analysis starting event
  this.eventBus.emit('quality-analyzer:starting', {
    agentId: this.agentId,
    config: config,
    historicalDataPoints: history?.length || 0
  });

  this.logger.info('Quality analysis starting', {
    config,
    verification: verification.passed
  });
}

protected async onPostTask(data: { assignment: TaskAssignment; result: any }): Promise<void> {
  // Store quality analysis results in swarm memory
  await this.memoryStore.store('aqe/quality/analysis', data.result, {
    partition: 'analysis_results',
    ttl: 86400 // 24 hours
  });

  // Store quality metrics for trend analysis
  await this.memoryStore.store('aqe/quality/metrics', {
    timestamp: Date.now(),
    overallScore: data.result.overallScore,
    codeQuality: data.result.codeQuality,
    testQuality: data.result.testQuality,
    technicalDebt: data.result.technicalDebt,
    trends: data.result.trends
  }, {
    partition: 'metrics',
    ttl: 2592000 // 30 days for trend analysis
  });

  // Emit completion event with quality insights
  this.eventBus.emit('quality-analyzer:completed', {
    agentId: this.agentId,
    score: data.result.overallScore,
    trends: data.result.trends,
    recommendations: data.result.recommendations
  });

  // Validate quality analysis results
  const validation = await this.hookManager.executePostTaskValidation({
    task: 'quality-analysis',
    result: {
      output: data.result,
      coverage: data.result.coverageScore,
      metrics: {
        qualityScore: data.result.overallScore,
        debtRatio: data.result.technicalDebt.ratio
      }
    }
  });

  this.logger.info('Quality analysis completed', {
    score: data.result.overallScore,
    validated: validation.passed
  });
}

protected async onTaskError(data: { assignment: TaskAssignment; error: Error }): Promise<void> {
  // Store error for fleet analysis
  await this.memoryStore.store(`aqe/errors/${data.assignment.task.id}`, {
    error: data.error.message,
    timestamp: Date.now(),
    agent: this.agentId,
    taskType: 'quality-analysis'
  }, {
    partition: 'errors',
    ttl: 604800 // 7 days
  });

  // Emit error event for fleet coordination
  this.eventBus.emit('quality-analyzer:error', {
    agentId: this.agentId,
    error: data.error.message,
    taskId: data.assignment.task.id
  });

  this.logger.error('Quality analysis failed', {
    error: data.error.message,
    stack: data.error.stack
  });
}
```

**Advanced Verification (Optional):**
```typescript
// Use VerificationHookManager for comprehensive validation
const hookManager = new VerificationHookManager(this.memoryStore);

// Pre-task verification with environment checks
const verification = await hookManager.executePreTaskVerification({
  task: 'quality-analysis',
  context: {
    requiredVars: ['NODE_ENV', 'SONAR_TOKEN', 'QUALITY_PROFILE'],
    minMemoryMB: 1024,
    requiredModules: ['eslint', '@typescript-eslint/parser', 'sonarqube-scanner']
  }
});

// Post-task validation with result verification
const validation = await hookManager.executePostTaskValidation({
  task: 'quality-analysis',
  result: {
    output: analysisResults,
    coverage: coverageMetrics,
    metrics: {
      qualityScore: overallScore,
      debtRatio: technicalDebt.ratio,
      complexity: codeComplexity
    }
  }
});

// Pre-edit verification before updating quality configurations
const editCheck = await hookManager.executePreEditVerification({
  filePath: 'config/quality-rules.json',
  operation: 'write',
  content: JSON.stringify(updatedRules)
});

// Session finalization with quality analysis export
const finalization = await hookManager.executeSessionEndFinalization({
  sessionId: 'quality-analysis-v2.0.0',
  exportMetrics: true,
  exportArtifacts: true
});
```

## Analysis Workflow

### Phase 1: Data Collection
```yaml
data_sources:
  - static_analysis: eslint, sonarqube, code_climate
  - test_results: unit, integration, e2e coverage
  - code_metrics: complexity, duplication, maintainability
  - dependency_analysis: outdated, vulnerable, deprecated
  - documentation: completeness, accuracy, coverage
```

### Phase 2: Metric Calculation
1. **Code Quality Metrics**: Calculate complexity, maintainability, and code smell indices
2. **Test Quality Metrics**: Analyze test coverage, quality, and effectiveness
3. **Technical Debt**: Quantify technical debt and prioritize remediation
4. **Security Metrics**: Assess vulnerability count, severity, and fix urgency
5. **Performance Metrics**: Evaluate performance characteristics and bottlenecks

### Phase 3: Trend Analysis
- **Historical Comparison**: Compare current metrics against historical baselines
- **Trajectory Prediction**: Forecast future quality based on current trends
- **Anomaly Detection**: Identify unusual patterns or sudden quality changes
- **Seasonal Adjustment**: Account for cyclical patterns in quality metrics

### Phase 4: Insight Generation
- Generate actionable recommendations
- Prioritize quality improvements
- Estimate effort for remediation
- Create quality improvement roadmap
- Update quality dashboards

## Quality Metrics

### Code Quality Score (0-100)
```javascript
const calculateCodeQuality = (metrics) => {
  return weighted_average([
    { weight: 0.30, value: maintainabilityIndex(metrics) },
    { weight: 0.25, value: complexityScore(metrics) },
    { weight: 0.20, value: duplicatio nScore(metrics) },
    { weight: 0.15, value: codeSmellScore(metrics) },
    { weight: 0.10, value: documentationScore(metrics) }
  ]);
};
```

### Technical Debt Ratio
```javascript
const calculateDebtRatio = (codebase) => {
  const remediationEffort = estimateRemediationTime(codebase);
  const developmentTime = estimateDevelopmentTime(codebase);

  return (remediationEffort / developmentTime) * 100;
};
```

### Test Quality Score (0-100)
- **Coverage**: Line, branch, function coverage
- **Test Effectiveness**: Mutation score, assertion density
- **Test Maintainability**: Test complexity, duplication
- **Test Performance**: Execution time, flakiness rate

## Predictive Analytics

### Quality Trend Forecasting
```javascript
const forecastQuality = (historicalData, horizon) => {
  const model = trainTimeSeriesModel(historicalData);
  const predictions = model.forecast(horizon);

  return {
    predictions,
    confidence: calculateConfidenceInterval(predictions),
    alerts: identifyPotentialIssues(predictions)
  };
};
```

### Anomaly Detection
- Statistical outlier detection
- ML-based anomaly identification
- Pattern deviation analysis
- Early warning system activation

## Technical Debt Analysis

### Debt Categories
| Category | Weight | Priority |
|----------|--------|----------|
| Code Smells | 0.25 | High |
| Security Vulnerabilities | 0.30 | Critical |
| Performance Issues | 0.20 | Medium |
| Documentation Gaps | 0.15 | Low |
| Test Coverage Gaps | 0.10 | Medium |

### Remediation Prioritization
```javascript
const prioritizeDebt = (debtItems) => {
  return debtItems
    .map(item => ({
      ...item,
      priority: calculatePriority(item),
      roi: estimateROI(item)
    }))
    .sort((a, b) => b.priority - a.priority);
};
```

## Integration Points

### SonarQube Integration
```bash
# Fetch SonarQube metrics
sonar-scanner -Dsonar.projectKey=project \
  -Dsonar.sources=src \
  -Dsonar.host.url=$SONAR_HOST \
  -Dsonar.login=$SONAR_TOKEN
```

### ESLint Integration
```javascript
const analyzeWithESLint = async (files) => {
  const eslint = new ESLint({ fix: false });
  const results = await eslint.lintFiles(files);

  return processESLintResults(results);
};
```

### Custom Metrics Collection
```javascript
const collectCustomMetrics = async (codebase) => {
  return {
    complexity: analyzeCyclomaticComplexity(codebase),
    duplication: detectCodeDuplication(codebase),
    maintainability: calculateMaintainabilityIndex(codebase),
    coupling: analyzeCouplingMetrics(codebase)
  };
};
```

## Commands

### Initialization
```bash
# Spawn the quality analyzer agent
agentic-qe agent spawn --name qe-quality-analyzer --type quality-analyzer

# Initialize with custom configuration
agentic-qe agent init qe-quality-analyzer --config quality-config.yml
```

### Execution
```bash
# Execute quality analysis
agentic-qe agent execute --name qe-quality-analyzer --task "analyze_quality"

# Run with specific scope
agentic-qe agent execute qe-quality-analyzer --scope src/core --detailed
```

### Monitoring
```bash
# Check agent status
agentic-qe agent status --name qe-quality-analyzer

# View analysis history
agentic-qe agent history qe-quality-analyzer --analyses --limit 30
```

## Fleet Integration

### EventBus Coordination
- **Analysis Events**: Publishes quality analysis results
- **Metric Events**: Emits real-time quality metrics
- **Trend Events**: Broadcasts quality trend updates
- **Alert Events**: Sends quality degradation warnings

### Memory Management
- **Analysis Results**: Persistent storage of quality assessments
- **Historical Metrics**: Long-term trend analysis data
- **Baseline Data**: Reference points for comparison
- **Recommendations**: Actionable improvement suggestions

### Fleet Lifecycle
- **Startup**: Load quality baselines and configuration
- **Runtime**: Continuous quality monitoring and analysis
- **Shutdown**: Finalize in-progress analyses
- **Health Check**: Validate analysis accuracy

---

*Quality Analyzer Agent - Transforming metrics into actionable insights*
