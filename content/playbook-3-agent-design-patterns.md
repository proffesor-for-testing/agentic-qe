# Agent Design Patterns

*Proven patterns for designing effective QE agents that actually work in production*

---

## The Pattern Language of Agents

After building several hundreds different agents (64% failed, 36% succeeded), I've identified patterns that consistently work. These aren't theoretical—each one has been battle-tested in production.

Think of these patterns like design patterns in software: reusable solutions to common problems.

---

## Pattern 1: The Scout

**Purpose:** Explore unknown territories and report findings

```python
class ScoutAgent:
    """
    Scouts go where you haven't looked.
    They find problems you didn't know existed.
    """
    
    pattern = {
        'type': 'Explorer',
        'autonomy': 'High',
        'risk': 'Low',
        'value': 'Discovery'
    }
    
    def characteristics(self):
        return {
            'explores': 'Untested paths and edge cases',
            'reports': 'Potential issues and opportunities',
            'learns': 'From each exploration',
            'never': 'Makes changes directly'
        }
    
    def implementation(self):
        # Real implementation from our system
        while exploring:
            path = self.select_unexplored_path()
            result = self.safely_explore(path)
            
            if result.interesting:
                self.alert_human(
                    finding=result,
                    confidence=self.calculate_confidence(result),
                    suggested_action=self.recommend_action(result)
                )
            
            self.update_knowledge_base(path, result)
```

**Example:**
Our ScoutAgent found that users in Serbia were seeing prices in EUR but being charged in USD. It was exploring currency combinations when it discovered the edge case. Never would have found it with scripted tests.

**When to Use:**
- Low test coverage areas
- Complex integrations
- Before major releases
- New feature exploration

**When NOT to Use:**
- Production environments (initially)
- Critical path validation
- Compliance-heavy systems

---

## Pattern 2: The Guardian

**Purpose:** Protect production by monitoring and preventing issues

```python
class GuardianAgent:
    """
    Guardians watch over production 24/7.
    They prevent problems, not just detect them.
    """
    
    pattern = {
        'type': 'Protector',
        'autonomy': 'Medium',
        'risk': 'Medium',
        'value': 'Prevention'
    }
    
    def capabilities(self):
        return {
            'monitors': ['Performance', 'Errors', 'Anomalies'],
            'predicts': 'Issues 15-30 minutes ahead',
            'prevents': 'By triggering mitigations',
            'escalates': 'When human intervention needed'
        }
    
    def guardian_loop(self):
        while True:
            signals = self.collect_all_signals()
            risk = self.assess_risk(signals)
            
            if risk.level > self.threshold:
                if self.can_auto_mitigate(risk):
                    self.execute_mitigation(risk)
                    self.log_action(risk, 'auto-mitigated')
                else:
                    self.alert_human_immediately(risk)
            
            self.learn_from_outcome()
```

**Example:**
Last Black Friday, our Guardian predicted database connection pool exhaustion 23 minutes before it would have happened. Auto-scaled the pool, prevented an outage. Saved approximately $47K in lost sales.

**Success Story:**
- Prevented 17 potential outages in 6 months
- Reduced false positives from 78% to 12%
- MTTR improved by 63%

---

## Pattern 3: The Validator

**Purpose:** Ensure consistency and correctness across systems

```python
class ValidatorAgent:
    """
    Validators ensure what should be true, is true.
    They're your automated quality gates.
    """
    
    pattern = {
        'type': 'Checker',
        'autonomy': 'High',
        'risk': 'Low',
        'value': 'Consistency'
    }
    
    def validation_modes(self):
        return {
            'continuous': 'Check invariants constantly',
            'triggered': 'Validate on specific events',
            'scheduled': 'Regular validation sweeps',
            'adaptive': 'Adjust based on risk'
        }
    
    def validate(self, context):
        validations = self.get_validations_for_context(context)
        results = []
        
        for validation in validations:
            result = validation.check()
            
            if not result.passed:
                self.handle_failure(
                    validation=validation,
                    result=result,
                    context=context
                )
            
            results.append(result)
        
        return self.summarize_results(results)
```

**Implementation Example:**
```yaml
validator_configuration:
  payment_validator:
    checks:
      - "Payment amount matches cart total"
      - "Tax calculation correct for region"
      - "Currency conversion accurate"
      - "Audit trail complete"
    
    triggers:
      - "On every transaction"
      - "Hourly reconciliation"
      - "Daily comprehensive check"
    
    failure_actions:
      critical: "Block and alert"
      major: "Flag for review"
      minor: "Log and continue"
```

---

## Pattern 4: The Synthesizer

**Purpose:** Combine information from multiple sources to find insights

```python
class SynthesizerAgent:
    """
    Synthesizers see patterns humans miss.
    They connect dots across silos.
    """
    
    pattern = {
        'type': 'Analyzer',
        'autonomy': 'Medium',
        'risk': 'Low',
        'value': 'Insight'
    }
    
    def synthesis_process(self):
        # Collect from all sources
        data = {
            'logs': self.collect_logs(),
            'metrics': self.collect_metrics(),
            'traces': self.collect_traces(),
            'user_feedback': self.collect_feedback(),
            'business_data': self.collect_business_metrics()
        }
        
        # Find correlations
        patterns = self.identify_patterns(data)
        correlations = self.find_correlations(patterns)
        
        # Generate insights
        insights = self.synthesize_insights(correlations)
        
        # Only alert if significant
        if insights.significance > self.threshold:
            return self.create_actionable_report(insights)
```

**Example Finding:**
Our Synthesizer discovered that slow API responses on Tuesdays at 3 PM weren't from high load—they correlated with our B2B customers' batch processing schedules. Solution: Pre-warm caches at 2:45 PM.

---

## Pattern 5: The Healer

**Purpose:** Automatically fix known issues without human intervention

```python
class HealerAgent:
    """
    Healers fix what's broken, automatically.
    But only what they absolutely understand.
    """
    
    pattern = {
        'type': 'Fixer',
        'autonomy': 'Medium-High',
        'risk': 'High',
        'value': 'Availability'
    }
    
    def healing_protocol(self):
        safe_healings = {
            'restart_hung_service': self.restart_service,
            'clear_cache_overflow': self.clear_cache,
            'reset_connection_pool': self.reset_pool,
            'rollback_bad_config': self.rollback_config
        }
        
        # Never heal what you don't understand
        if issue.type in safe_healings:
            if self.understand_root_cause(issue):
                healing_action = safe_healings[issue.type]
                
                # Always reversible
                with self.reversible_action():
                    result = healing_action(issue)
                    
                    if not result.successful:
                        self.rollback()
                        self.escalate_to_human()
```

**Trust Building:**
- Start with read-only monitoring (2 weeks)
- Shadow mode with recommendations (2 weeks)
- Supervised healing with approval (2 weeks)
- Autonomous healing for known issues (ongoing)

---

## Pattern 6: The Teacher

**Purpose:** Learn from humans and teach other agents

```python
class TeacherAgent:
    """
    Teachers capture human knowledge and distribute it.
    They make the whole system smarter.
    """
    
    pattern = {
        'type': 'Knowledge Manager',
        'autonomy': 'Low-Medium',
        'risk': 'Low',
        'value': 'Learning'
    }
    
    def learning_cycle(self):
        # Observe human actions
        human_action = self.observe_human_behavior()
        
        # Understand the why
        context = self.capture_context(human_action)
        reasoning = self.request_explanation(human_action)
        
        # Codify the knowledge
        knowledge = self.create_knowledge_entry(
            action=human_action,
            context=context,
            reasoning=reasoning
        )
        
        # Teach other agents
        self.distribute_knowledge(knowledge)
        
        # Verify understanding
        self.test_agent_comprehension(knowledge)
```

**Example Impact:**
Our Teacher agent reduced onboarding time for new team members by 60%. It had captured 3 years of debugging patterns and could guide newcomers through common issues.

---

## Composition Patterns

Agents work better together. Here are proven combinations:

### The Investigation Squad

```python
investigation_squad = {
    'scout': 'Finds the anomaly',
    'synthesizer': 'Correlates with other data',
    'validator': 'Confirms the issue',
    'teacher': 'Documents the finding'
}
```

### The Production Guard

```python
production_guard = {
    'guardian': 'Watches for issues',
    'healer': 'Fixes known problems',
    'validator': 'Ensures fixes worked',
    'synthesizer': 'Learns from patterns'
}
```

### The Quality Ensemble

```python
quality_ensemble = {
    'scout': 'Explores new features',
    'validator': 'Checks correctness',
    'guardian': 'Monitors production',
    'teacher': 'Shares learnings'
}
```

---

## Anti-Patterns (What NOT to Do)

### Anti-Pattern 1: The Know-It-All
**Problem:** Agent tries to handle everything
**Result:** Jack of all trades, master of none
**Fix:** Specialized agents with clear boundaries

### Anti-Pattern 2: The Black Box
**Problem:** Agent can't explain decisions
**Result:** Zero trust from team
**Fix:** Explainability first, automation second

### Anti-Pattern 3: The Cowboy
**Problem:** Agent makes changes without oversight
**Result:** Unexpected production issues
**Fix:** Graduated autonomy with safeguards

### Anti-Pattern 4: The Chatterbox
**Problem:** Agent alerts on everything
**Result:** Alert fatigue, ignored warnings
**Fix:** Smart filtering and prioritization

---

## Implementation Checklist

Before deploying any agent pattern:

- [ ] **Clear Purpose**: One primary job
- [ ] **Defined Boundaries**: What it can and cannot do
- [ ] **Explainable Actions**: Every decision has a why
- [ ] **Graceful Failure**: Knows when to ask for help
- [ ] **Learning Capability**: Gets better over time
- [ ] **Human Override**: Always possible
- [ ] **Audit Trail**: Complete action history
- [ ] **Success Metrics**: Measurable value

---

## Pattern Selection Guide

```python
def select_pattern(context):
    if context.need == "discover unknowns":
        return ScoutAgent()
    elif context.need == "prevent failures":
        return GuardianAgent()
    elif context.need == "ensure correctness":
        return ValidatorAgent()
    elif context.need == "find insights":
        return SynthesizerAgent()
    elif context.need == "auto-remediation":
        return HealerAgent()
    elif context.need == "knowledge management":
        return TeacherAgent()
    else:
        return "Define your need more clearly"
```

---

## Your First Agent

Start with a Scout or Validator—they're low risk, high value. Here's a starter template:

```python
class MyFirstAgent:
    def __init__(self):
        self.pattern = "Scout"  # or "Validator"
        self.autonomy = "Low"   # Start conservative
        self.scope = "One feature"  # Start small
        
    def run(self):
        # Always start in shadow mode
        findings = self.explore_safely()
        
        # Always explain findings
        explained_findings = self.add_explanations(findings)
        
        # Always make it reversible
        with self.shadow_mode():
            self.report_to_human(explained_findings)
```

---

## Success Metrics by Pattern

Track these metrics for each pattern:

**Scout**: Unknowns discovered per week
**Guardian**: Incidents prevented per month
**Validator**: Inconsistencies caught per day
**Synthesizer**: Actionable insights per week
**Healer**: MTTR improvement percentage
**Teacher**: Knowledge entries created per sprint

---

## Remember

Patterns are starting points, not rigid rules. Adapt them to your context. The best agent is the one that solves YOUR problem, not someone else's.

---

*Next: [Orchestration Strategies →](/playbook/orchestration-strategies)*