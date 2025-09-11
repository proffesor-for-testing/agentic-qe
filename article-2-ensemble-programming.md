# Ensemble Programming with Agents: When Your Mob Includes AI

*Published: October 3, 2025 | 10 min read | By Dragan Spiridonov*

---

## The Fourth Member of Our Mob

It was Tuesday, our regular ensemble session. Three of us huddled around the screen, rotating through driver-navigator-observer roles. Then someone suggested: "What if we add Claude as the fourth member?"

What started as a joke became the most productive ensemble session we'd had in months.

## The Evolution of Collaboration

For years, I've practiced ensemble programming (or mob programming, as some call it). The pattern is beautiful:
- **Driver**: Hands on keyboard, no thinking
- **Navigator**: Tactical decisions, directing the driver
- **Mob**: Strategic thinking, pattern recognition
- **Rotation**: Every 7 minutes, roles shift

But here's what changed when we added agents to the ensemble:

```python
# Traditional Ensemble
participants = ["Marko", "Ana", "Dragan"]
roles = rotate_every_7_minutes(["driver", "navigator", "observer"])

# Agentic Ensemble  
participants = ["Marko", "Ana", "Dragan", "RiskAgent", "ExplorerAgent"]
roles = context_driven_rotation({
    "humans": ["driver", "navigator", "strategist"],
    "agents": ["risk_analyzer", "pattern_detector", "test_generator"]
})
```

## The Risk Storming Revolution

Remember risk storming? That chaotic, beautiful exercise where we throw sticky notes at walls, identifying everything that could go wrong?

Now imagine this scene from last month:

**10:00 AM - Traditional Risk Storming**
Me: "What could break in the payment flow?"
Ana: "Database timeout"
Marko: "Third-party API fails"
Me: "Currency conversion errors"
*15 risks identified in 30 minutes*

**10:30 AM - Agent-Augmented Risk Storming**
Me: "RiskAgent, analyze the payment flow"
RiskAgent: "Analyzing 47 similar systems, 2,847 incident reports..."

```yaml
identified_risks:
  - category: "Race Conditions"
    probability: "HIGH"
    discovery: "Found in 73% of similar implementations"
    specific: "Webhook arrives before transaction commits"
    
  - category: "Regional Compliance"
    probability: "MEDIUM"  
    discovery: "New EU regulation effective next month"
    specific: "Strong Customer Authentication missing fallback"
    
  - category: "Silent Failures"
    probability: "HIGH"
    discovery: "Pattern detected in your logs last quarter"
    specific: "Partial refunds failing without error propagation"
    
  # ... 47 more risks
```

*62 risks identified, 23 we'd never considered*

The agent didn't replace our thinking. It **amplified** it.

## Production Monitoring: From Watching to Understanding

Here's a confession: I used to have 47 dashboards. I watched none of them.

The shift happened when we stopped monitoring metrics and started monitoring behaviors. Enter the analytical ensemble:

### Before (Human-Only Monitoring):
- Check dashboards when something breaks
- Correlate metrics manually
- Miss patterns across systems
- React to incidents

### After (Human-Agent Ensemble):
```python
class ProductionEnsemble:
    def __init__(self):
        self.humans = ["on-call engineer"]
        self.agents = [
            PatternDetector(),      # Finds anomalies
            CorrelationAnalyzer(),   # Links seemingly unrelated events
            UserJourneyTracker(),    # Follows actual user flows
            BusinessImpactAnalyzer() # Translates tech metrics to business
        ]
    
    def continuous_analysis(self):
        while True:
            # Agents continuously analyze
            patterns = self.pattern_detector.scan_all_services()
            correlations = self.correlation_analyzer.find_connections()
            user_impact = self.journey_tracker.assess_degradation()
            
            # Humans make decisions
            if self.requires_human_judgment(patterns, correlations):
                self.alert_human_with_context()
```

## The Data Collection Symphony

Last week's debugging session. Customer complaint: "Sometimes checkout is slow."

**Traditional Approach**: Check APM, check logs, check database metrics. Find nothing conclusive.

**Ensemble Approach**:

```python
# The Debugging Ensemble in action
@ensemble_session("checkout_slowness_investigation")
def investigate():
    # Human: Define the problem
    problem = "Intermittent checkout slowness, no clear pattern"
    
    # DataCollectorAgent: Gather everything
    data_sources = agent.collect_from([
        "APM traces",
        "Browser RUM data",
        "CDN logs",
        "Database slow query logs",
        "Third-party API response times",
        "User session recordings",
        "Feature flag evaluations",
        "Cache hit rates"
    ])
    
    # CorrelationAgent: Find hidden patterns
    discoveries = agent.correlate(data_sources)
    
    # Result that surprised us all:
    """
    Pattern found: Slowness occurs when:
    1. User has 7+ items in cart (12% of cases)
    2. AND promotional engine makes 3+ external calls (happens with stacked coupons)
    3. AND session originates from EU (GDPR consent check adds latency)
    4. AND it's between 14:00-15:00 UTC (peak promotional API load)
    
    Individual correlation: weak
    Combined correlation: 0.94
    """
```

No human would have found that combination manually. The agent found it in 3 minutes.

## Exploring the Unknown Unknowns

Donald Rumsfeld was onto something with "unknown unknowns." In testing, these are the bugs that kill you—the ones you didn't know to look for.

Here's how our exploration ensemble works:

```yaml
exploration_session:
  human_role: "Define boundaries and safety limits"
  
  explorer_agent:
    instructions: "Within these boundaries, go wild"
    techniques:
      - Mutation testing: "What if I change this?"
      - Chaos injection: "What if this fails?"
      - Property exploration: "What patterns hold true?"
      - Boundary pushing: "Where does it break?"
    
  observer_agent:
    tracks: "Everything the explorer does"
    identifies: "Interesting behaviors"
    
  analyst_agent:
    correlates: "Explorer findings with production patterns"
    prioritizes: "What matters to real users"

  human_decision: "Which findings to act on"
```

Real finding from last month: ExplorerAgent discovered that entering emoji in the search box caused a 10x increase in database CPU. Why? Unicode normalization in a hot path we'd never optimized. 

In production? 0.01% of searches. 
Business impact? Those searches were from our biggest B2B client's automated system. 💀

## The Debugging Revolution

My favorite debugging story from this year:

**The Mystery**: Memory leak in production. Slow, subtle, deadly.

**Traditional Approach** (2 days):
- Heap dumps
- Code review  
- More heap dumps
- Gave up, added more RAM

**Ensemble Approach** (2 hours):
```python
# The Debugging Ensemble
debug_session = DebugEnsemble(
    humans=["Dragan", "Ana"],
    agents=[
        MemoryPatternAnalyzer(),
        CodePathTracer(),
        TemporalCorrelator()
    ]
)

# Human: "Memory grows 100MB/hour"
# MemoryPatternAnalyzer: "Growth is stepwise, not linear"
# Human: "Check the release timeline"
# TemporalCorrelator: "Correlates with feature flag evaluation"
# CodePathTracer: "Flag evaluation caches user objects"
# Human: "But we clear the cache"
# CodePathTracer: "Not when evaluation throws non-critical errors"
# Human: "...oh no"

# Found: Feature flag library cached entire user objects 
# when evaluation failed, which happened for deleted users
# accessing the system (edge case, but accumulative)
```

The agents didn't solve it. But they made the invisible visible.

## Real User Monitoring: The Truth Detector

RUM data is gold, but it's also noise. Here's our ensemble approach:

```javascript
// Frontend RUM collector
class RUMEnsemble {
    constructor() {
        this.collectors = {
            performance: new PerformanceCollector(),
            errors: new ErrorCollector(),
            userJourney: new JourneyCollector(),
            rage: new RageClickDetector()
        };
        
        this.analyzers = {
            pattern: new PatternAnalyzer(),
            impact: new BusinessImpactAnalyzer(),
            correlation: new CorrelationEngine()
        };
    }
    
    analyze() {
        // Collect everything
        const data = this.collectors.all();
        
        // Agent analysis
        const patterns = this.analyzers.pattern.find(data);
        const impact = this.analyzers.impact.calculate(patterns);
        
        // Human insight
        if (impact.severity > threshold) {
            return {
                alert: "Human judgment needed",
                context: this.analyzers.correlation.explain(patterns),
                suggestion: this.analyzers.pattern.recommend_action()
            };
        }
    }
}
```

Last week's discovery: 3% of users rage-clicking our submit button. Not because it was broken—because our loading spinner was transparent on dark mode. Agents found it. Humans understood why it mattered.

## The Integration Points

Here's where ensemble programming with agents shines:

1. **Requirements Analysis**
   - Humans understand context
   - Agents find edge cases and conflicts
   - Together: Comprehensive requirement coverage

2. **Risk Assessment**
   - Humans know the business
   - Agents know the patterns
   - Together: Prioritized risk mitigation

3. **Production Monitoring**
   - Humans understand impact
   - Agents detect anomalies
   - Together: Meaningful alerts, not noise

4. **Data Analysis**
   - Humans ask questions
   - Agents find correlations
   - Together: Actionable insights

5. **System Exploration**
   - Humans set boundaries
   - Agents explore possibilities
   - Together: Discovered unknown unknowns

## The Learning Curve

**Week 1**: "This is just fancy autocomplete"
**Week 2**: "Wait, it found what?"
**Week 3**: "How did we work without this?"
**Week 4**: "We need better prompts"
**Month 2**: "The ensemble is smarter than any individual"
**Month 3**: "But we still need human judgment"

## The Failures (Because Honesty Matters)

Not everything works. Here's what failed:

1. **Autonomous Debugging**: Agents can trace but can't understand business logic
2. **Risk Prioritization**: Agents find risks but don't understand company politics
3. **Performance Optimization**: Agents suggest; humans know what's actually feasible
4. **User Empathy**: Agents see patterns but don't feel user frustration

The lesson? **Ensemble, not replacement.**

## Your Ensemble Starter Kit

Ready to add agents to your ensemble? Start here:

```python
# Your first agent ensemble session
def first_ensemble_session():
    # 1. Start with familiar territory
    problem = "Your most frequent debugging task"
    
    # 2. Add one agent at a time
    agents = {
        "week_1": PatternFinder(),      # Find patterns in logs
        "week_2": CorrelationAgent(),   # Connect dots
        "week_3": ExplorerAgent()        # Discover unknowns
    }
    
    # 3. Keep humans in control
    humans_decide = [
        "What to investigate",
        "What patterns matter",
        "What actions to take"
    ]
    
    # 4. Measure the delta
    metrics = {
        "time_to_discovery": "Before vs. after",
        "bugs_found": "Quantity and severity",
        "team_satisfaction": "The real metric"
    }
```

## The New Reality

Ensemble programming with agents isn't about replacing humans. It's about amplification:

- **Human intuition** + **Agent analysis** = Faster debugging
- **Human context** + **Agent exploration** = Better testing
- **Human judgment** + **Agent correlation** = Smarter monitoring

The agents are ensemble members, not overlords.

## Looking Forward

Six months into ensemble programming with agents, here's what changed:

- Risk storming sessions find 3x more risks
- Production issues detected 45 minutes earlier (average)
- Debugging complex issues: 60% faster
- Unknown unknowns discovered: 12 per month (was ~1)
- Team satisfaction: "Wouldn't go back"

But the biggest change? We stopped thinking of agents as tools. They're team members. Weird, specialized, sometimes frustrating team members—but team members nonetheless.

## Your Turn

What's your most painful debugging or exploration challenge? How would an ensemble of humans and agents tackle it differently?

Share your story. Let's learn together.

---

*Dragan Spiridonov practices ensemble programming with both humans and agents. Currently building the Agentic QE Framework and fostering the Serbian Agentics Foundation.*

**Next: [PACT Principles: Building Explainable Systems →](/blog/pact-principles-explainable)**