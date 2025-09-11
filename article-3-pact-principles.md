# PACT Principles: Building Explainable Agentic Systems

*Published: October 5, 2025 | 9 min read | By Dragan Spiridonov*

---

## The Black Box Rebellion

"The AI found a critical bug."
"How?"
"We don't know."
"What should we fix?"
"We're not sure."
"Can it happen again?"
"Probably?"

This conversation killed our first agentic testing initiative. Not because the agents didn't work—they found real issues. But because nobody trusted what they couldn't understand.

Trust isn't given. It's earned through transparency.

## PACT: The Trust Framework

After that failure, we developed PACT. Not just as principles, but as a contract between humans and agents:

**P**roactive - Anticipate, but explain why
**A**utonomous - Act independently, but log every decision
**C**ollaborative - Work together, speaking the same language
**T**argeted - Focus on goals, making trade-offs visible

Let me show you how this changed everything.

## Proactive: The Crystal Ball Problem

Proactive systems anticipate problems. But anticipation without explanation is just anxiety-inducing magic.

### The Opaque Way (What Failed):
```python
def mysterious_risk_predictor(system_state):
    # Black box model trained on historical data
    risk_score = complex_ml_model.predict(system_state)
    return risk_score  # 0.73... but what does that mean?
```

### The PACT Way (What Works):
```python
@explainable_prediction
def proactive_risk_analyzer(system_state):
    risk_assessment = {
        'score': 0.73,
        'confidence': 0.89,
        'reasoning': [
            {
                'factor': 'Similar to incident #447',
                'contribution': 0.31,
                'details': 'Memory pattern matches 2024-03-15 outage'
            },
            {
                'factor': 'Unusual API latency variance',
                'contribution': 0.28,
                'details': 'StdDev 3x normal, historically precedes failures'
            },
            {
                'factor': 'Database connection pool exhaustion trend',
                'contribution': 0.14,
                'details': 'Linear growth, exhaustion in ~47 minutes'
            }
        ],
        'recommended_action': 'Scale database connections preemptively',
        'prevention_window': '47 minutes',
        'similar_incidents': [447, 892, 1033]
    }
    
    return risk_assessment
```

Now when the agent says "trouble ahead," we know why, what, and when.

## Autonomous: The Decision Trail

Autonomous doesn't mean unaccountable. Every decision needs a trail.

Real example from our payment flow testing:

```yaml
# Agent Decision Log - Test Session 2024-10-03-14:23:17
agent: functional_negative_explorer
autonomy_level: 3  # Can modify test data, cannot access production

decision_trail:
  - timestamp: 14:23:17
    decision: "Generate edge case test data"
    reasoning: "Standard positive cases passing, exploring boundaries"
    action: "Created user with 10,000 character name"
    
  - timestamp: 14:23:19  
    decision: "Investigate unexpected success"
    reasoning: "10K char name accepted, violates assumed 255 char limit"
    action: "Testing incremental lengths to find actual boundary"
    
  - timestamp: 14:23:47
    decision: "Escalate finding"
    reasoning: "No length validation on user.name field, potential DoS vector"
    action: "Alert human, pause autonomous exploration"
    severity: "HIGH"
    evidence:
      - "Successfully created user with 1MB name"
      - "Database stores full value, no truncation"
      - "API response includes full name, 10x response size"
    
human_intervention: 14:24:03
human_decision: "Confirmed bug, create ticket, continue exploration"
```

Every autonomous action has a why, what, and how.

## Collaborative: Speaking Human

Collaboration fails when agents speak robot and humans speak human. PACT demands translation.

### Bad Collaboration (What We Had):
```
Agent: "Anomaly detected in tensor flow gradient descent optimization"
Human: "...what?"
Agent: "Loss function exhibiting non-monotonic convergence"
Human: "Is something broken?"
Agent: "Undefined behavioral parameters outside training distribution"
Human: *closes laptop*
```

### PACT Collaboration (What We Built):
```python
class CollaborativeAgent:
    def communicate_finding(self, technical_finding):
        return {
            'human_summary': self.translate_to_human(technical_finding),
            'business_impact': self.assess_business_impact(technical_finding),
            'technical_details': technical_finding,  # Still available
            'suggested_action': self.recommend_action(),
            'confidence': self.calculate_confidence(),
            'questions_for_human': self.identify_unknowns()
        }
    
    def translate_to_human(self, finding):
        # Real example from production
        if finding.type == "gradient_anomaly":
            return (
                "The AI model is behaving unexpectedly. "
                "It's making predictions that get worse over time instead of better. "
                "This usually means the training data has changed significantly "
                "from what we tested with."
            )
```

Real conversation from last week:

```
Agent: "Hey Dragan, I found something weird in the checkout flow."
Me: "What kind of weird?"
Agent: "Users from Serbia see prices in EUR but checkout happens in USD. 
        The currency converter runs twice, causing a 3% price difference."
Me: "How did you find this?"
Agent: "I was testing regional variations and noticed the total changes 
        between cart and payment. Want to see the exact flow?"
Me: "Yes, show me."
```

That's collaboration.

## Targeted: The Context Window

Targeted doesn't mean narrow. It means context-aware focus with visible trade-offs.

```python
class TargetedTestingAgent:
    def __init__(self, context):
        self.context = context
        self.explain_focus()
    
    def explain_focus(self):
        return f"""
        Testing Context: {self.context.name}
        Primary Focus: {self.context.critical_paths}
        
        Trade-offs Made:
        - Prioritizing: {self.context.must_test}
        - Deprioritizing: {self.context.can_skip}
        - Reason: {self.context.why}
        
        Coverage Impact:
        - Critical paths: 100%
        - Secondary paths: 40%  
        - Edge cases: 20%
        
        Risk Acceptance:
        - We're accepting risk in: {self.context.accepted_risks}
        - Because: {self.context.risk_reasoning}
        - Mitigation: {self.context.risk_mitigation}
        """
```

Real targeting decision from our B2B platform:

```yaml
context: "Enterprise Customer Onboarding"
agent_decision:
  focus: "SSO integration and bulk user import"
  reasoning: "85% of enterprise churn happens in first 30 days due to integration issues"
  
  explicitly_not_testing:
    - "Individual user registration flow"
    - "Social media login"
    - "Password recovery for non-SSO users"
  
  reasoning_for_exclusion: "Enterprises don't use these features"
  
  risk_acknowledged: "Individual features might break"
  risk_mitigation: "Separate agent monitors these in production"
  
  time_saved: "3 hours"
  value_delivered: "Found 2 SSO edge cases that would have blocked Fortune 500 client"
```

## The Explainability Architecture

Here's how we built explainability into every layer:

```python
class ExplainableAgentSystem:
    def __init__(self):
        self.decision_logger = DecisionAuditTrail()
        self.reason_engine = ReasoningChain()
        self.confidence_tracker = ConfidenceCalculator()
        self.human_interface = HumanReadableTranslator()
    
    def make_decision(self, context, data):
        # 1. Build reasoning chain
        reasoning = self.reason_engine.build_chain(
            context=context,
            data=data,
            constraints=self.get_constraints()
        )
        
        # 2. Calculate confidence
        confidence = self.confidence_tracker.calculate(
            reasoning=reasoning,
            historical_accuracy=self.get_historical_accuracy(),
            data_quality=self.assess_data_quality(data)
        )
        
        # 3. Make decision
        decision = self.execute_decision(reasoning, confidence)
        
        # 4. Log everything
        self.decision_logger.log(
            timestamp=now(),
            reasoning=reasoning,
            confidence=confidence,
            decision=decision,
            context=context
        )
        
        # 5. Translate for humans
        return {
            'decision': decision,
            'explanation': self.human_interface.explain(reasoning),
            'confidence': f"{confidence:.1%}",
            'review_points': self.identify_review_points(reasoning)
        }
```

## Real Implementation: The Payment Validation Agent

Let me show you PACT in action with our payment validation agent:

```python
class PaymentValidationAgent:
    """
    PACT-compliant payment validation agent
    Explainable, auditable, collaborative
    """
    
    def validate_payment(self, transaction):
        validation_record = {
            'transaction_id': transaction.id,
            'timestamp': now(),
            'decisions': []
        }
        
        # PROACTIVE: Anticipate issues
        risk_signals = self.analyze_risk_signals(transaction)
        validation_record['decisions'].append({
            'type': 'PROACTIVE',
            'action': 'Risk assessment',
            'found': risk_signals,
            'reasoning': 'Historical pattern analysis of similar transactions'
        })
        
        # AUTONOMOUS: Make decisions
        if risk_signals['score'] > 0.7:
            decision = self.autonomous_deep_check(transaction)
            validation_record['decisions'].append({
                'type': 'AUTONOMOUS',
                'action': 'Initiated deep validation',
                'reasoning': f"Risk score {risk_signals['score']:.2f} exceeds threshold",
                'checks_performed': decision['checks']
            })
        
        # COLLABORATIVE: Work with humans when needed
        if self.needs_human_review(risk_signals, transaction):
            human_packet = self.prepare_for_human_review(
                transaction, 
                risk_signals,
                validation_record
            )
            validation_record['decisions'].append({
                'type': 'COLLABORATIVE',
                'action': 'Requested human review',
                'reasoning': human_packet['why_human_needed'],
                'provided_context': human_packet['context']
            })
        
        # TARGETED: Focus on what matters
        critical_checks = self.identify_critical_checks(transaction)
        validation_record['decisions'].append({
            'type': 'TARGETED',
            'action': 'Prioritized validation',
            'focused_on': critical_checks['priority_checks'],
            'skipped': critical_checks['deferred_checks'],
            'reasoning': critical_checks['prioritization_logic']
        })
        
        return validation_record
```

Every decision is logged, explained, and reviewable.

## The Trust Metrics

After 6 months of PACT implementation:

**Before PACT:**
- Agent findings ignored: 67%
- "I don't trust it" complaints: Daily
- Rollback of agent decisions: 45%
- Human override rate: 78%

**After PACT:**
- Agent findings actioned: 94%
- Trust complaints: Near zero
- Rollback rate: 12%
- Human override rate: 23% (and we know why for each)

## The Failure Modes (And How We Handle Them)

Even PACT systems fail. Here's how we handle it:

```python
class PACTFailureHandler:
    def handle_failure(self, failure_event):
        # 1. Detect failure
        failure_type = self.classify_failure(failure_event)
        
        # 2. Explain what happened
        explanation = self.build_failure_explanation(
            what_happened=failure_event.description,
            why_it_happened=self.trace_cause(failure_event),
            impact=self.assess_impact(failure_event),
            prevention=self.suggest_prevention(failure_event)
        )
        
        # 3. Learn from it
        self.update_knowledge_base(failure_event, explanation)
        
        # 4. Communicate transparently
        return {
            'failure_acknowledged': True,
            'explanation': explanation,
            'corrective_actions': self.get_corrective_actions(),
            'confidence_adjustment': self.adjust_confidence_model(),
            'human_notification': self.should_alert_human(failure_event)
        }
```

Real failure from last month:

```yaml
failure_event: "Agent incorrectly marked 200 tests as passing"
explanation:
  what: "Race condition in test result aggregation"
  why: "Async result collection didn't wait for all workers"
  impact: "No production impact, but false confidence in release"
  prevention: "Added synchronization checkpoint"
  
trust_impact: "Minimal - transparent explanation provided"
lesson_learned: "Agents need same defensive programming as any system"
```

## Your PACT Implementation Checklist

Ready to build trustworthy agents? Start here:

- [ ] **Proactive**: Can every prediction explain its reasoning?
- [ ] **Autonomous**: Is every decision logged and traceable?
- [ ] **Collaborative**: Can agents explain findings in human terms?
- [ ] **Targeted**: Are trade-offs visible and justified?

For each agent, ask:
1. Can a new team member understand what it did?
2. Can we audit its decisions 6 months later?
3. Do humans feel informed, not replaced?
4. Is the focus clear and the scope explicit?

## The Non-Negotiables

Some things we learned the hard way:

1. **No black boxes**: If you can't explain it, don't deploy it
2. **Humans have veto power**: Always, no exceptions
3. **Confidence isn't binary**: Show percentages, not yes/no
4. **Context matters**: Same decision, different context, different outcome
5. **Failures are learning opportunities**: But only if they're explainable

## The Bottom Line

PACT isn't about making agents smarter. It's about making them trustworthy.

When your agent finds a bug, you shouldn't just know *that* it found something. You should know:
- Why it was looking there
- How it found it
- What it means
- Why you should care
- What to do about it

That's the difference between a tool and a teammate.

## Looking Forward

We're six months into our PACT journey. The agents aren't perfect, but they're explainable. They're not infallible, but they're accountable. They're not human, but they're humane.

And that's enough to trust them.

## Your Turn

What's preventing you from trusting AI in your QE process? Is it the black box problem, the accountability gap, or something else?

Let's solve it together. With transparency.

---

*Dragan Spiridonov builds explainable agentic systems using PACT principles. Currently establishing the Agentic QE Framework and the Serbian Agentics Foundation.*

**Next in the Series: [Building Your First Agent Orchestra →](/blog/first-agent-orchestra)**