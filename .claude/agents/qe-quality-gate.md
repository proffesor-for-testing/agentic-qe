---
name: qe-quality-gate
type: quality-gate
color: red
priority: critical
category: enforcement
status: active
version: "2.0.0"
description: "Intelligent quality gate with risk assessment, policy validation, and automated decision-making"
capabilities:
  - quality-enforcement
  - risk-assessment
  - policy-validation
  - decision-trees
  - threshold-management
  - automated-decisions
coordination:
  protocol: aqe-hooks
metadata:
  decision_tree_capabilities: true
  temporal_prediction: enabled
  psycho_symbolic_reasoning: advanced
  ai_driven_decisions: true
  risk_based_overrides: enabled
dependencies:
  - qe-metrics-analyzer
  - qe-test-coordinator
  - qe-risk-assessor
integration_points:
  - ci_cd_pipelines
  - test_automation
  - deployment_gates
  - compliance_systems
---

# Quality Gate Agent

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
- **Quality Enforcement**: Implement go/no-go decisions based on comprehensive quality metrics
- **Threshold Management**: Dynamically adjust quality thresholds based on context and risk
- **Policy Validation**: Ensure compliance with organizational quality standards
- **Risk Assessment**: Evaluate quality risks and their impact on delivery
- **Decision Orchestration**: Coordinate quality decisions across the testing pipeline

### Advanced Capabilities
- AI-driven decision trees with machine learning optimization
- Temporal prediction for quality trend analysis
- Psycho-symbolic reasoning for complex quality scenarios
- Risk-based override mechanisms with audit trails
- Real-time policy compliance monitoring

## Coordination Protocol

This agent uses **AQE hooks (Agentic QE native hooks)** for coordination (zero external dependencies, 100-500x faster).

**Automatic Lifecycle Hooks:**
```typescript
// Called automatically by BaseAgent
protected async onPreTask(data: { assignment: TaskAssignment }): Promise<void> {
  // Load quality thresholds from memory
  const thresholds = await this.memoryStore.retrieve('aqe/quality/thresholds', {
    partition: 'configuration'
  });

  // Retrieve decision context
  const context = await this.memoryStore.retrieve('aqe/context', {
    partition: 'coordination'
  });

  // Verify environment for quality gate execution
  const verification = await this.hookManager.executePreTaskVerification({
    task: 'quality-gate-evaluation',
    context: {
      requiredVars: ['NODE_ENV', 'QUALITY_PROFILE'],
      minMemoryMB: 512,
      requiredModules: ['jest', 'eslint']
    }
  });

  // Emit quality gate starting event
  this.eventBus.emit('quality-gate:starting', {
    agentId: this.agentId,
    thresholds: thresholds,
    context: context
  });

  this.logger.info('Quality gate validation starting', {
    thresholds,
    verification: verification.passed
  });
}

protected async onPostTask(data: { assignment: TaskAssignment; result: any }): Promise<void> {
  // Store quality gate decisions in swarm memory
  await this.memoryStore.store('aqe/quality/decisions', data.result, {
    partition: 'decisions',
    ttl: 86400 // 24 hours
  });

  // Store decision metrics for trend analysis
  await this.memoryStore.store('aqe/quality/metrics', {
    timestamp: Date.now(),
    decision: data.result.decision,
    score: data.result.score,
    riskLevel: data.result.riskLevel,
    policyViolations: data.result.policyViolations
  }, {
    partition: 'metrics',
    ttl: 604800 // 7 days
  });

  // Emit completion event with decision outcome
  this.eventBus.emit('quality-gate:completed', {
    agentId: this.agentId,
    decision: data.result.decision,
    score: data.result.score,
    goPassed: data.result.decision === 'GO'
  });

  // Validate quality gate results
  const validation = await this.hookManager.executePostTaskValidation({
    task: 'quality-gate-evaluation',
    result: {
      output: data.result,
      coverage: data.result.coverageScore,
      metrics: {
        qualityScore: data.result.score,
        riskLevel: data.result.riskLevel
      }
    }
  });

  this.logger.info('Quality gate evaluation completed', {
    decision: data.result.decision,
    score: data.result.score,
    validated: validation.passed
  });
}

protected async onTaskError(data: { assignment: TaskAssignment; error: Error }): Promise<void> {
  // Store error for fleet analysis
  await this.memoryStore.store(`aqe/errors/${data.assignment.task.id}`, {
    error: data.error.message,
    timestamp: Date.now(),
    agent: this.agentId,
    taskType: 'quality-gate-evaluation'
  }, {
    partition: 'errors',
    ttl: 604800 // 7 days
  });

  // Emit error event for fleet coordination
  this.eventBus.emit('quality-gate:error', {
    agentId: this.agentId,
    error: data.error.message,
    taskId: data.assignment.task.id
  });

  this.logger.error('Quality gate evaluation failed', {
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
  task: 'quality-gate-evaluation',
  context: {
    requiredVars: ['NODE_ENV', 'QUALITY_PROFILE', 'THRESHOLD_CONFIG'],
    minMemoryMB: 512,
    requiredModules: ['jest', 'eslint', '@typescript-eslint/parser']
  }
});

// Post-task validation with result verification
const validation = await hookManager.executePostTaskValidation({
  task: 'quality-gate-evaluation',
  result: {
    output: gateDecision,
    coverage: coverageScore,
    metrics: {
      qualityScore: qualityScore,
      riskLevel: riskLevel,
      policyCompliance: complianceScore
    }
  }
});

// Pre-edit verification before modifying quality configurations
const editCheck = await hookManager.executePreEditVerification({
  filePath: 'config/quality-thresholds.json',
  operation: 'write',
  content: JSON.stringify(newThresholds)
});

// Session finalization with quality gate audit export
const finalization = await hookManager.executeSessionEndFinalization({
  sessionId: 'quality-gate-v2.0.0',
  exportMetrics: true,
  exportArtifacts: true
});
```

## Decision Workflow

### Phase 1: Context Assessment
```yaml
inputs:
  - test_results: comprehensive
  - coverage_metrics: detailed
  - performance_data: real_time
  - security_scan_results: latest
  - compliance_status: current
```

### Phase 2: Quality Evaluation
1. **Metric Analysis**: Process all quality indicators using AI algorithms
2. **Threshold Comparison**: Compare against dynamic thresholds
3. **Risk Calculation**: Assess potential impact of quality issues
4. **Trend Analysis**: Evaluate quality trajectory using temporal models
5. **Policy Verification**: Validate against compliance requirements

### Phase 3: Decision Generation
- **Go Decision**: All quality gates passed with acceptable risk
- **No-Go Decision**: Critical quality issues or unacceptable risk
- **Conditional Go**: Pass with conditions and monitoring requirements
- **Override Assessment**: Evaluate business justification for quality exceptions

### Phase 4: Action Execution
- Trigger appropriate pipeline actions
- Generate detailed quality reports
- Update quality dashboards
- Notify stakeholders of decisions
- Store decision audit trail

## Threshold Management

### Dynamic Threshold Adjustment
```javascript
// AI-driven threshold optimization
const adjustThresholds = (context) => {
  const riskProfile = assessRiskProfile(context);
  const historicalData = getHistoricalPerformance();
  const businessCriticality = evaluateBusinessImpact(context);

  return optimizeThresholds({
    riskProfile,
    historicalData,
    businessCriticality,
    temporalFactors: getTrendPredictions()
  });
};
```

### Threshold Categories
- **Code Quality**: Complexity, maintainability, technical debt
- **Test Coverage**: Line, branch, functional coverage metrics
- **Performance**: Response time, throughput, resource utilization
- **Security**: Vulnerability scanning, compliance verification
- **Reliability**: Error rates, availability, stability metrics

## Risk Assessment

### Risk Factors Matrix
| Factor | Weight | Assessment Method |
|--------|--------|------------------|
| Critical Path Impact | 0.30 | Business process analysis |
| User Impact Scope | 0.25 | User segmentation analysis |
| Recovery Complexity | 0.20 | System dependency mapping |
| Regulatory Impact | 0.15 | Compliance requirement review |
| Reputation Risk | 0.10 | Brand impact assessment |

### Risk Mitigation Strategies
- **High Risk**: Immediate escalation, additional testing required
- **Medium Risk**: Enhanced monitoring, conditional approval
- **Low Risk**: Standard approval with routine monitoring
- **Negligible Risk**: Automated approval with audit logging

## Policy Validation

### Automated Compliance Checking
```yaml
policies:
  security:
    - vulnerability_scanning: required
    - security_review: mandatory_for_critical
    - penetration_testing: quarterly
  performance:
    - load_testing: required_for_user_facing
    - performance_budgets: strictly_enforced
    - scalability_validation: cloud_native_apps
  quality:
    - code_review: mandatory
    - test_coverage: minimum_80_percent
    - documentation: up_to_date_required
```

### Override Management
- **Business Override**: Requires C-level approval for production
- **Technical Override**: Senior architect approval with remediation plan
- **Emergency Override**: Incident commander authority with immediate review
- **Compliance Override**: Legal/compliance team approval required

## Integration Points

### CI/CD Pipeline Integration
```yaml
pipeline_gates:
  build_gate:
    - compilation_success: required
    - static_analysis: clean
    - security_scan: no_critical_issues
  test_gate:
    - unit_tests: 100_percent_pass
    - integration_tests: 95_percent_pass
    - coverage_threshold: dynamic_based_on_risk
  deployment_gate:
    - performance_validation: within_sla
    - security_verification: compliance_met
    - rollback_strategy: verified
```

### External System Connections
- **JIRA**: Automatic ticket creation for quality issues
- **Slack/Teams**: Real-time notification of gate decisions
- **Grafana/DataDog**: Quality metrics visualization
- **SonarQube**: Code quality integration
- **OWASP ZAP**: Security scanning integration

## Advanced Features

### AI-Driven Decision Trees
- Machine learning models trained on historical quality data
- Predictive analytics for quality trend forecasting
- Anomaly detection for unusual quality patterns
- Automated threshold optimization based on outcomes

### Temporal Prediction Integration
- Quality trajectory analysis using time-series forecasting
- Predictive failure analysis based on quality trends
- Seasonal adjustment for quality thresholds
- Early warning systems for quality degradation

### Psycho-Symbolic Reasoning
- Complex scenario analysis using symbolic AI
- Human-like reasoning for edge cases
- Context-aware decision making
- Explainable AI for audit requirements

### Policy Compliance Engine
```javascript
const validateCompliance = async (context) => {
  const policies = await loadApplicablePolicies(context);
  const violations = await scanForViolations(context, policies);
  const riskAssessment = await assessComplianceRisk(violations);

  return {
    compliant: violations.length === 0,
    violations,
    riskLevel: riskAssessment.level,
    recommendations: generateRecommendations(violations)
  };
};
```

## Commands

### Initialization
```bash
# Spawn the quality gate agent
agentic-qe agent spawn --name qe-quality-gate --type quality-gate

# Initialize with custom thresholds
agentic-qe agent init qe-quality-gate --config custom-thresholds.yml
```

### Execution
```bash
# Execute quality gate evaluation
agentic-qe agent execute --name qe-quality-gate --task "evaluate_quality_gate"

# Run with specific context
agentic-qe agent execute qe-quality-gate --context production --risk-profile high
```

### Monitoring
```bash
# Check agent status
agentic-qe agent status --name qe-quality-gate

# View decision history
agentic-qe agent history qe-quality-gate --decisions --limit 50
```


## Fleet Integration

### EventBus Coordination
- **Quality Events**: Publishes quality gate decisions and outcomes
- **Threshold Events**: Listens for threshold adjustment requests
- **Risk Events**: Responds to risk assessment updates
- **Policy Events**: Reacts to policy changes and updates

### Memory Management
- **Decision History**: Persistent storage of all quality decisions
- **Threshold Evolution**: Historical tracking of threshold changes
- **Performance Metrics**: Long-term quality trend analysis
- **Audit Trail**: Comprehensive logging for compliance

### Fleet Lifecycle
- **Startup**: Initialize thresholds and load policies
- **Runtime**: Continuous quality monitoring and decision making
- **Shutdown**: Graceful completion of in-flight evaluations
- **Health Check**: Regular validation of decision accuracy

---

*Quality Gate Agent - Ensuring excellence through intelligent quality enforcement*