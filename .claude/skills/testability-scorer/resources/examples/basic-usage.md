# Testability Scorer - Basic Usage Example

This example demonstrates how to use the testability scorer skill to assess a simple web application.

## Scenario

You have a todo application and want to assess its testability before writing comprehensive tests.

## Step 1: Install

```bash
cd .claude/skills/testability-scorer
chmod +x scripts/*.sh
./scripts/install.sh
```

## Step 2: Configure

Create `tests/testability-scorer/config.js`:

```javascript
module.exports = {
  baseURL: 'https://todomvc.com/examples/react',
  weights: {
    observability: 15,
    controllability: 15,
    algorithmicSimplicity: 10,
    algorithmicTransparency: 10,
    explainability: 10,
    similarity: 5,
    algorithmicStability: 10,
    unbugginess: 10,
    smallness: 10,
    decomposability: 5
  },
  reports: {
    format: ['html', 'json'],
    directory: 'tests/reports',
    autoOpen: true,
    includeAI: true
  }
};
```

## Step 3: Run Quick Assessment

```bash
./scripts/quick-check.sh https://todomvc.com/examples/react
```

**Expected Output:**
```
⚡ Running Quick Testability Check (5 principles)...
   URL: https://todomvc.com/examples/react
   Estimated time: 2 minutes

✓ Observability: 68/100 (D)
✓ Controllability: 45/100 (F)
✓ Algorithmic Simplicity: 82/100 (B)
✓ Explainability: 51/100 (F)
✓ Decomposability: 74/100 (C)

Overall Quick Score: 64/100 (D)

✅ Quick check complete!
```

## Step 4: Run Full Assessment

```bash
./scripts/run-assessment.sh https://todomvc.com/examples/react chromium
```

**Expected Output:**
```
🔍 Running Full Testability Assessment...
   URL: https://todomvc.com/examples/react
   Browser: chromium

📊 Analyzing all 10 principles...

✓ 1. Observability: 68/100 (D)
✓ 2. Controllability: 45/100 (F)
✓ 3. Algorithmic Simplicity: 82/100 (B)
✓ 4. Algorithmic Transparency: 71/100 (C)
✓ 5. Explainability: 51/100 (F)
✓ 6. Similarity: 89/100 (B)
✓ 7. Algorithmic Stability: 64/100 (D)
✓ 8. Unbugginess: 77/100 (C)
✓ 9. Smallness: 85/100 (B)
✓ 10. Decomposability: 74/100 (C)

✅ Assessment complete!

📈 Results:
   Overall Score: 71/100 (C)

📄 Full report: tests/reports/testability-report-1732992000.html
```

## Step 5: Review Report

The HTML report opens automatically and shows:

### Overall Score
```
71/100 (C)
```

### Radar Chart
Visual representation of all 10 principles

### Top Recommendations

1. **Controllability [CRITICAL]**
   - Current: 45/100 (F)
   - Impact: +15 points
   - Recommendation: "Add test mode API for direct state manipulation"
   - Code example:
     ```javascript
     if (process.env.NODE_ENV === 'test') {
       window.testAPI = {
         setState: (state) => { /* ... */ },
         clearTodos: () => { /* ... */ },
         addTodo: (text) => { /* ... */ }
       };
     }
     ```

2. **Explainability [HIGH]**
   - Current: 51/100 (F)
   - Impact: +10 points
   - Recommendation: "Add JSDoc comments and improve error messages"

3. **Observability [MEDIUM]**
   - Current: 68/100 (D)
   - Impact: +8 points
   - Recommendation: "Add Redux DevTools or state logging in development mode"

## Step 6: Implement Top Recommendation

Update your React app to include a test API:

```javascript
// src/App.js
useEffect(() => {
  if (process.env.NODE_ENV === 'test') {
    window.testAPI = {
      getTodos: () => todos,
      setTodos: (newTodos) => setTodos(newTodos),
      addTodo: (text) => {
        setTodos([...todos, { id: Date.now(), text, completed: false }]);
      },
      clearCompleted: () => {
        setTodos(todos.filter(t => !t.completed));
      }
    };
  }
}, [todos]);
```

## Step 7: Re-assess

```bash
./scripts/run-assessment.sh https://todomvc.com/examples/react
```

**New Results:**
```
✓ Controllability: 75/100 (C) ⬆️ +30 points
Overall Score: 86/100 (B) ⬆️ +15 points
```

## Step 8: Track Improvement

```bash
node scripts/view-trends.js
```

**Output:**
```
📈 Testability Improvement Trends

Assessment History:
┌─────────────────────┬───────┬───────┬──────────┐
│ Date                │ Score │ Grade │ Change   │
├─────────────────────┼───────┼───────┼──────────┤
│ 2025-11-30 10:00:00 │ 71    │ C     │ baseline │
│ 2025-11-30 11:30:00 │ 86    │ B     │ +15 ⬆️   │
└─────────────────────┴───────┴───────┴──────────┘

Biggest Improvements:
  1. Controllability: +30 points (45 → 75)
  2. Overall: +15 points (71 → 86)

Next Focus Areas:
  1. Explainability: 51/100 (F) - Add documentation
  2. Algorithmic Stability: 64/100 (D) - Version your API
```

## Integration with QE Fleet

Use with Agentic QE agents:

```javascript
// In your Claude Code session
Task("Analyze testability", `
  Use testability-scorer skill to:
  1. Run assessment on https://todomvc.com/examples/react
  2. Store results in memory under aqe/testability/todomvc
  3. Create action plan for top 3 recommendations
  4. Estimate effort for each improvement
`, "qe-analyst");

// Later, generate tests based on findings
Task("Generate targeted tests", `
  Review testability results from memory (aqe/testability/todomvc).
  Generate tests that focus on weak areas:
  - Controllability tests (state manipulation)
  - Observability tests (state verification)
  - Explainability tests (error message validation)
`, "qe-test-generator");
```

## Summary

1. **Quick check** (~2 min): Get rapid feedback on top 5 principles
2. **Full assessment** (~10 min): Complete 10-principle analysis
3. **Review report**: Visual HTML report with AI recommendations
4. **Implement fixes**: Focus on critical/high severity items
5. **Re-assess**: Measure improvement
6. **Track trends**: Monitor testability over time

## Next Steps

- See [Advanced Configuration](../docs/CONFIGURATION.md) for custom weights
- See [CI/CD Integration](../docs/CI-INTEGRATION.md) for automated checks
- See [Multi-User Analysis](../docs/MULTI-USER.md) for comparative testing
