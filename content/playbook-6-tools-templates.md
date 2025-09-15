# Tools & Templates

*Practical resources to accelerate your Agentic QE implementation*

---

## Quick Start Templates

### Template 1: Agent Decision Log

Save this as `agent-decision-log.yaml` and customize for your needs:

```yaml
# Agent Decision Log Template
# Track every agent decision for audit and learning

agent_decision:
  metadata:
    decision_id: "{{uuid}}"
    timestamp: "{{iso_timestamp}}"
    agent_name: "{{agent_name}}"
    agent_version: "{{version}}"
    environment: "{{env}}"
  
  context:
    trigger: "What initiated this decision"
    input_data: "Raw data provided"
    previous_state: "System state before decision"
    constraints: "Any limitations or rules"
  
  decision_process:
    analysis:
      - step: "Data validation"
        result: "Pass/Fail with details"
      - step: "Pattern matching"
        result: "Patterns identified"
      - step: "Risk assessment"
        result: "Risk score and factors"
    
    alternatives_considered:
      - option: "Option A"
        score: 0.85
        reason: "Why considered"
      - option: "Option B"
        score: 0.62
        reason: "Why rejected"
    
    final_decision:
      action: "What agent decided to do"
      confidence: 0.87
      reasoning: "Why this action was chosen"
  
  execution:
    started_at: "{{timestamp}}"
    completed_at: "{{timestamp}}"
    status: "success|failure|partial"
    result: "What actually happened"
    side_effects: "Any unexpected consequences"
  
  human_interaction:
    required: true|false
    type: "approval|review|intervention"
    human_decision: "What human decided"
    human_reasoning: "Why human agreed/disagreed"
    override: true|false
  
  outcome:
    success_metrics:
      - metric: "Time saved"
        value: "3.5 hours"
      - metric: "Issues found"
        value: 7
    
    lessons_learned:
      - "What worked well"
      - "What could improve"
    
    follow_up_required: true|false
    follow_up_actions:
      - "Update training data"
      - "Adjust confidence thresholds"
```

---

### Template 2: PACT Assessment Scorecard

```markdown
# PACT Assessment Scorecard
**Date:** {{date}}
**Team:** {{team_name}}
**Assessor:** {{name}}

## Scoring (0-100 per dimension)

### Proactive Capability: {{score}}/100
- [ ] Failure prediction mechanisms
- [ ] Risk assessment processes
- [ ] Preventive measures
- [ ] Trend analysis
- [ ] Early warning systems

**Evidence:**
- 
**Gaps:**
- 
**Next Steps:**
- 

### Autonomous Capability: {{score}}/100
- [ ] Automation coverage
- [ ] Self-healing systems
- [ ] Independent decision-making
- [ ] Automated workflows
- [ ] Minimal human intervention

**Evidence:**
- 
**Gaps:**
- 
**Next Steps:**
- 

### Collaborative Capability: {{score}}/100
- [ ] Team integration
- [ ] Knowledge sharing
- [ ] Tool interoperability
- [ ] Communication protocols
- [ ] Feedback loops

**Evidence:**
- 
**Gaps:**
- 
**Next Steps:**
- 

### Targeted Capability: {{score}}/100
- [ ] Business alignment
- [ ] Prioritization methods
- [ ] Resource optimization
- [ ] Value measurement
- [ ] Context awareness

**Evidence:**
- 
**Gaps:**
- 
**Next Steps:**
- 

## Overall Maturity

**Total Score:** {{total}}/400
**Average:** {{average}}/100
**Maturity Level:** Level {{0-4}}

## Recommendations

### Immediate (Next 2 weeks)
1. 
2. 
3. 

### Short-term (Next month)
1. 
2. 
3. 

### Long-term (Next quarter)
1. 
2. 
3. 

## Success Metrics
- 
- 
- 

**Next Assessment Date:** {{date}}
```

---

### Template 3: Agent Implementation Checklist

```markdown
# Agent Implementation Checklist
**Agent Name:** {{name}}
**Pattern:** Scout|Guardian|Validator|Synthesizer|Healer|Teacher
**Start Date:** {{date}}

## Pre-Implementation

### Foundation
- [ ] Classical QE processes documented
- [ ] Current metrics baselined
- [ ] Pain points identified
- [ ] Success criteria defined

### Team Readiness
- [ ] Champions identified
- [ ] Training completed
- [ ] Concerns addressed
- [ ] Support secured

### Technical Setup
- [ ] Development environment ready
- [ ] Access permissions configured
- [ ] Monitoring tools setup
- [ ] Rollback plan created

## Implementation Phase

### Week 1: Shadow Mode
- [ ] Agent observing only
- [ ] Logging all observations
- [ ] No actions taken
- [ ] Daily review meetings

### Week 2: Suggestion Mode
- [ ] Agent makes recommendations
- [ ] Human executes actions
- [ ] Track agreement rate
- [ ] Document disagreements

### Week 3: Supervised Mode
- [ ] Agent acts with approval
- [ ] Human reviews all actions
- [ ] Measure accuracy
- [ ] Adjust thresholds

### Week 4: Delegated Mode
- [ ] Agent acts independently
- [ ] Human reviews samples
- [ ] Monitor error rate
- [ ] Fine-tune behavior

## Post-Implementation

### Metrics Collection
- [ ] Before/after comparison
- [ ] ROI calculation
- [ ] Error rate analysis
- [ ] Time savings documented

### Knowledge Transfer
- [ ] Documentation updated
- [ ] Team training conducted
- [ ] Lessons learned captured
- [ ] Best practices shared

### Continuous Improvement
- [ ] Feedback loop established
- [ ] Regular reviews scheduled
- [ ] Improvement backlog created
- [ ] Success stories shared

## Sign-offs

- [ ] Technical Lead: {{name}} {{date}}
- [ ] Team Lead: {{name}} {{date}}
- [ ] Product Owner: {{name}} {{date}}
- [ ] QE Lead: {{name}} {{date}}
```

---

## Code Templates

### Basic Agent Skeleton (Python)

```python
"""
Basic Agent Template
Copy and customize for your specific needs
"""

import logging
from datetime import datetime
from typing import Dict, Any, Optional
from enum import Enum

class AgentConfidence(Enum):
    """Confidence levels for agent decisions"""
    VERY_LOW = 0.2
    LOW = 0.4
    MEDIUM = 0.6
    HIGH = 0.8
    VERY_HIGH = 0.95

class BaseAgent:
    """
    Base template for all QE agents
    Customize the abstract methods for your use case
    """
    
    def __init__(self, name: str, config: Dict[str, Any]):
        self.name = name
        self.config = config
        self.logger = self._setup_logging()
        self.metrics = {}
        self.decision_history = []
        
    def _setup_logging(self) -> logging.Logger:
        """Configure agent-specific logging"""
        logger = logging.getLogger(f"agent.{self.name}")
        logger.setLevel(self.config.get('log_level', 'INFO'))
        return logger
    
    def analyze(self, context: Dict[str, Any]) -> Dict[str, Any]:
        """
        Analyze the situation and prepare decision
        Override this for your agent's logic
        """
        self.logger.info(f"Analyzing context: {context.get('trigger')}")
        
        # Your analysis logic here
        analysis = {
            'patterns_found': self._identify_patterns(context),
            'risks_identified': self._assess_risks(context),
            'confidence': self._calculate_confidence(context)
        }
        
        return analysis
    
    def decide(self, analysis: Dict[str, Any]) -> Dict[str, Any]:
        """
        Make decision based on analysis
        Override this for your decision logic
        """
        decision = {
            'action': self._select_action(analysis),
            'confidence': analysis['confidence'],
            'reasoning': self._explain_reasoning(analysis),
            'requires_approval': self._needs_human_approval(analysis)
        }
        
        self.decision_history.append({
            'timestamp': datetime.now(),
            'decision': decision
        })
        
        return decision
    
    def execute(self, decision: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute the decided action
        Override this for your execution logic
        """
        if decision.get('requires_approval'):
            approval = self._request_approval(decision)
            if not approval:
                return {'status': 'rejected', 'reason': 'Human rejected'}
        
        try:
            result = self._perform_action(decision['action'])
            self._log_success(decision, result)
            return {'status': 'success', 'result': result}
            
        except Exception as e:
            self._log_failure(decision, e)
            return {'status': 'failure', 'error': str(e)}
    
    def learn(self, outcome: Dict[str, Any]) -> None:
        """
        Learn from the outcome
        Override this for your learning logic
        """
        self._update_patterns(outcome)
        self._adjust_confidence_model(outcome)
        self._store_learning(outcome)
    
    # Abstract methods to override
    def _identify_patterns(self, context: Dict[str, Any]) -> list:
        """Override: Identify patterns in context"""
        raise NotImplementedError
    
    def _assess_risks(self, context: Dict[str, Any]) -> list:
        """Override: Assess risks"""
        raise NotImplementedError
    
    def _calculate_confidence(self, context: Dict[str, Any]) -> float:
        """Override: Calculate confidence score"""
        raise NotImplementedError
    
    def _select_action(self, analysis: Dict[str, Any]) -> str:
        """Override: Select action based on analysis"""
        raise NotImplementedError
    
    def _explain_reasoning(self, analysis: Dict[str, Any]) -> str:
        """Override: Explain reasoning for decision"""
        raise NotImplementedError
    
    def _needs_human_approval(self, analysis: Dict[str, Any]) -> bool:
        """Override: Determine if human approval needed"""
        return analysis['confidence'] < AgentConfidence.HIGH.value
    
    def _perform_action(self, action: str) -> Any:
        """Override: Actually perform the action"""
        raise NotImplementedError

# Example Usage
class TestScoutAgent(BaseAgent):
    """Example implementation of a Scout agent"""
    
    def _identify_patterns(self, context: Dict[str, Any]) -> list:
        # Your pattern identification logic
        return ["pattern_1", "pattern_2"]
    
    def _assess_risks(self, context: Dict[str, Any]) -> list:
        # Your risk assessment logic
        return ["low_risk_area", "high_risk_area"]
    
    def _calculate_confidence(self, context: Dict[str, Any]) -> float:
        # Your confidence calculation
        return 0.75
    
    def _select_action(self, analysis: Dict[str, Any]) -> str:
        # Your action selection logic
        return "explore_edge_case_xyz"
    
    def _explain_reasoning(self, analysis: Dict[str, Any]) -> str:
        return f"Found {len(analysis['patterns_found'])} patterns worth exploring"
    
    def _perform_action(self, action: str) -> Any:
        # Your action execution logic
        return {"explored": action, "findings": ["issue_1", "issue_2"]}

if __name__ == "__main__":
    # Initialize and run agent
    config = {
        'log_level': 'INFO',
        'max_autonomy': 0.7,
        'environment': 'staging'
    }
    
    agent = TestScoutAgent("scout-01", config)
    
    # Example workflow
    context = {'trigger': 'new_feature_deployed'}
    analysis = agent.analyze(context)
    decision = agent.decide(analysis)
    result = agent.execute(decision)
    agent.learn(result)
```

---

### Orchestrator Template

```python
"""
Basic Orchestrator Template
Coordinates multiple agents
"""

from typing import List, Dict, Any
import asyncio
from concurrent.futures import ThreadPoolExecutor

class BasicOrchestrator:
    """
    Template for orchestrating multiple agents
    """
    
    def __init__(self):
        self.agents = {}
        self.workflow = []
        self.results = {}
        
    def register_agent(self, agent_id: str, agent: Any) -> None:
        """Register an agent with the orchestrator"""
        self.agents[agent_id] = agent
        
    def define_workflow(self, workflow: List[Dict[str, Any]]) -> None:
        """
        Define the workflow for agents
        workflow = [
            {'agent': 'scout', 'action': 'explore', 'depends_on': []},
            {'agent': 'validator', 'action': 'validate', 'depends_on': ['scout']}
        ]
        """
        self.workflow = workflow
        
    def execute_sequential(self) -> Dict[str, Any]:
        """Execute agents in sequence"""
        for step in self.workflow:
            agent = self.agents[step['agent']]
            
            # Get dependencies results
            context = {
                'previous_results': {
                    dep: self.results[dep] 
                    for dep in step.get('depends_on', [])
                }
            }
            
            # Execute agent
            result = agent.execute(context)
            self.results[step['agent']] = result
            
            # Check for failures
            if result.get('status') == 'failure':
                return self._handle_failure(step['agent'], result)
        
        return self.results
    
    def execute_parallel(self) -> Dict[str, Any]:
        """Execute independent agents in parallel"""
        with ThreadPoolExecutor(max_workers=len(self.agents)) as executor:
            futures = {}
            
            for step in self.workflow:
                if not step.get('depends_on'):  # No dependencies
                    agent = self.agents[step['agent']]
                    future = executor.submit(agent.execute, {})
                    futures[future] = step['agent']
            
            for future in futures:
                agent_id = futures[future]
                try:
                    self.results[agent_id] = future.result(timeout=30)
                except Exception as e:
                    self.results[agent_id] = {'status': 'error', 'error': str(e)}
        
        return self.results
    
    async def execute_async(self) -> Dict[str, Any]:
        """Execute agents asynchronously"""
        tasks = []
        
        for step in self.workflow:
            agent = self.agents[step['agent']]
            task = asyncio.create_task(
                self._execute_agent_async(agent, step)
            )
            tasks.append(task)
        
        results = await asyncio.gather(*tasks)
        
        for i, step in enumerate(self.workflow):
            self.results[step['agent']] = results[i]
        
        return self.results
    
    async def _execute_agent_async(self, agent: Any, step: Dict[str, Any]) -> Any:
        """Execute single agent asynchronously"""
        # Implement async execution logic
        return await agent.execute_async(step)
    
    def _handle_failure(self, agent_id: str, result: Dict[str, Any]) -> Dict[str, Any]:
        """Handle agent failure"""
        return {
            'status': 'workflow_failed',
            'failed_agent': agent_id,
            'error': result.get('error'),
            'partial_results': self.results
        }
```

---

## Configuration Templates

### Agent Configuration File

```yaml
# agent-config.yaml
# Configuration template for QE agents

agent:
  name: "test-scout-01"
  type: "scout"
  version: "1.0.0"
  
capabilities:
  patterns:
    - edge_case_detection
    - anomaly_identification
    - coverage_gap_finding
  
  actions:
    - explore
    - report
    - suggest
  
  restrictions:
    - no_production_writes
    - no_data_deletion
    - no_customer_data_access

behavior:
  autonomy_level: 0.7  # 0-1 scale
  confidence_threshold: 0.6
  escalation_threshold: 0.4
  
  decision_mode: "conservative"  # conservative|balanced|aggressive
  
  human_interaction:
    approval_required_above_risk: 0.7
    notification_threshold: 0.5
    review_sample_rate: 0.1

integration:
  apis:
    - name: "test_framework"
      endpoint: "http://test-api:8080"
      auth: "bearer"
    
    - name: "monitoring"
      endpoint: "http://metrics:9090"
      auth: "basic"
  
  message_queue:
    type: "rabbitmq"
    host: "mq.internal"
    exchange: "agent_events"
  
  database:
    type: "postgresql"
    connection: "postgresql://"

monitoring:
  metrics:
    - decisions_per_hour
    - accuracy_rate
    - escalation_rate
    - error_rate
  
  logging:
    level: "INFO"
    format: "json"
    destination: "elasticsearch"
  
  alerting:
    - condition: "error_rate > 0.1"
      action: "page_oncall"
    
    - condition: "accuracy_rate < 0.8"
      action: "notify_team"

learning:
  feedback_collection: true
  pattern_storage: "s3://agent-patterns"
  model_update_frequency: "weekly"
  
  training_data:
    source: "production_logs"
    retention: "90_days"
    anonymization: true
```

---

### Orchestration Configuration

```yaml
# orchestration-config.yaml
# Template for orchestrator configuration

orchestration:
  name: "e2e-test-orchestra"
  pattern: "hierarchical"
  
workflow:
  stages:
    - stage: "preparation"
      agents:
        - id: "env-provisioner"
          timeout: 60s
          retry: 2
        
        - id: "data-seeder"
          timeout: 30s
          depends_on: ["env-provisioner"]
      
      parallel: false
      on_failure: "stop"
    
    - stage: "execution"
      agents:
        - id: "ui-tester"
          timeout: 300s
        
        - id: "api-tester"
          timeout: 300s
        
        - id: "perf-tester"
          timeout: 600s
      
      parallel: true
      on_failure: "continue"
    
    - stage: "analysis"
      agents:
        - id: "result-analyzer"
          timeout: 60s
        
        - id: "report-generator"
          timeout: 30s
          depends_on: ["result-analyzer"]
      
      parallel: false
      on_failure: "alert"

coordination:
  communication:
    protocol: "grpc"
    timeout: 5s
    retry: 3
  
  resource_management:
    max_parallel_agents: 10
    cpu_limit_per_agent: 2
    memory_limit_per_agent: "2Gi"
  
  conflict_resolution:
    strategy: "priority"  # priority|voting|escalate
    timeout: 30s

monitoring:
  dashboard: "http://orchestra-dashboard:3000"
  
  metrics:
    - workflow_duration
    - stage_success_rate
    - agent_utilization
    - resource_usage
  
  alerts:
    - metric: "workflow_duration"
      condition: "> 30 minutes"
      action: "notify"
    
    - metric: "stage_success_rate"
      condition: "< 0.9"
      action: "investigate"
```

---

## Monitoring Dashboards

### Grafana Dashboard JSON Template

```json
{
  "dashboard": {
    "title": "Agentic QE Monitoring",
    "panels": [
      {
        "title": "Agent Activity",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(agent_decisions_total[5m])",
            "legendFormat": "{{agent_name}}"
          }
        ]
      },
      {
        "title": "Confidence Distribution",
        "type": "histogram",
        "targets": [
          {
            "expr": "agent_confidence_score",
            "legendFormat": "Confidence"
          }
        ]
      },
      {
        "title": "Human Interventions",
        "type": "stat",
        "targets": [
          {
            "expr": "sum(rate(human_interventions_total[1h]))",
            "legendFormat": "Interventions/hour"
          }
        ]
      },
      {
        "title": "PACT Scores",
        "type": "gauge",
        "targets": [
          {
            "expr": "pact_score{dimension=\"proactive\"}",
            "legendFormat": "Proactive"
          },
          {
            "expr": "pact_score{dimension=\"autonomous\"}",
            "legendFormat": "Autonomous"
          },
          {
            "expr": "pact_score{dimension=\"collaborative\"}",
            "legendFormat": "Collaborative"
          },
          {
            "expr": "pact_score{dimension=\"targeted\"}",
            "legendFormat": "Targeted"
          }
        ]
      }
    ]
  }
}
```

---

## Quick Reference Cards

### PACT Principles Card

```
╔══════════════════════════════════════════╗
║          PACT PRINCIPLES                 ║
╠══════════════════════════════════════════╣
║                                          ║
║ P - PROACTIVE                           ║
║     Anticipate and prevent              ║
║     • Predictive analytics              ║
║     • Risk forecasting                  ║
║     • Preventive actions                ║
║                                          ║
║ A - AUTONOMOUS                          ║
║     Independent operation               ║
║     • Self-directed execution           ║
║     • Minimal supervision               ║
║     • Self-optimization                 ║
║                                          ║
║ C - COLLABORATIVE                       ║
║     Work with humans & agents          ║
║     • Knowledge sharing                 ║
║     • Coordinated actions               ║
║     • Feedback loops                    ║
║                                          ║
║ T - TARGETED                            ║
║     Focus on what matters              ║
║     • Business alignment                ║
║     • Smart prioritization              ║
║     • Context awareness                 ║
║                                          ║
╚══════════════════════════════════════════╝
```

### Agent Patterns Quick Reference

```
╔══════════════════════════════════════════╗
║         AGENT PATTERNS                   ║
╠══════════════════════════════════════════╣
║                                          ║
║ SCOUT                                    ║
║ └─ Explores unknowns                     ║
║ └─ High autonomy, low risk              ║
║ └─ Use: Discovery & exploration         ║
║                                          ║
║ GUARDIAN                                 ║
║ └─ Protects production                  ║
║ └─ Medium autonomy, medium risk         ║
║ └─ Use: Monitoring & prevention         ║
║                                          ║
║ VALIDATOR                                ║
║ └─ Ensures correctness                  ║
║ └─ High autonomy, low risk              ║
║ └─ Use: Quality gates                   ║
║                                          ║
║ SYNTHESIZER                              ║
║ └─ Finds insights                       ║
║ └─ Medium autonomy, low risk            ║
║ └─ Use: Pattern recognition             ║
║                                          ║
║ HEALER                                   ║
║ └─ Fixes issues                         ║
║ └─ Medium autonomy, high risk           ║
║ └─ Use: Auto-remediation                ║
║                                          ║
║ TEACHER                                  ║
║ └─ Manages knowledge                    ║
║ └─ Low autonomy, low risk               ║
║ └─ Use: Learning & training             ║
║                                          ║
╚══════════════════════════════════════════╝
```

---

## Community Contributions

Have a template that worked for you? Share it with the community:

- **Email**: templates@agentic-qe.dev

---

## Remember

Templates are starting points, not final solutions. Every organization is different. Take what works, modify what doesn't, and share what you learn.

The best template is the one that solves YOUR problem.

---

*Back to [Playbook Home](/playbook) | [Framework](/framework) | [Assessment](/assessment)*