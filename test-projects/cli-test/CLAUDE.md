# Claude Code Configuration

## Project Overview
This project uses Agentic QE Fleet for comprehensive quality engineering.


## 🚀 AGENTIC QE FLEET - CRITICAL RULES

### 📦 Project Structure
**The AQE implementation is in `/agentic-qe/` subfolder by design:**
- This is a modular monorepo pattern
- Core AQE system is separate from projects using it
- This allows:
  - Centralized QE agent management
  - Reusability across multiple projects
  - Clean separation of concerns
  - Easy updates and maintenance

### 🤖 Available QE Agents
- **qe-test-generator**: AI-powered test creation with property-based testing
- **qe-test-executor**: Parallel test execution with retry logic
- **qe-coverage-analyzer**: O(log n) coverage optimization with gap detection
- **qe-quality-gate**: Intelligent go/no-go decisions with risk assessment
- **qe-performance-tester**: Load testing and bottleneck detection
- **qe-security-scanner**: SAST/DAST integration with CVE monitoring

### ⚡ Agent Usage
**Spawn agents via Claude Code Task tool:**
```javascript
Task("Generate tests", "Create comprehensive test suite", "qe-test-generator")
Task("Execute tests", "Run tests in parallel", "qe-test-executor")
Task("Analyze coverage", "Find coverage gaps", "qe-coverage-analyzer")
```

**Or use MCP tools for coordination:**
```javascript
mcp__agentic_qe__fleet_init({ topology: "hierarchical" })
mcp__agentic_qe__test_generate({ framework: "jest", coverage: 0.95 })
```

### 🎯 Best Practices
1. **Initialize Fleet First**: Run `aqe init` before using agents
2. **Use Parallel Execution**: Spawn multiple agents in single messages
3. **Leverage Memory**: Agents share state via Claude Flow memory
4. **Monitor Progress**: Check agent status with `aqe status`
5. **Claude Flow Integration**: Agents use hooks for coordination

### ⚠️ Common Pitfalls
- Don't expect agents in root .claude/agents/ - they're in project's .claude/agents/
- Real vs Mock: `aqe init` creates real agents (not mocked demos)
- Hooks are intentional: Agents coordinate via Claude Flow hooks
- Memory is shared: All agents can access aqe/* memory keys

### 🔧 Commands
- `aqe init` - Initialize AQE fleet in current project
- `aqe status` - Show fleet status
- `aqe test <module>` - Generate tests for a module
- `aqe coverage` - Analyze test coverage
- `aqe quality` - Run quality gate check
- `aqe agent spawn --name <agent>` - Spawn specific agent
- `aqe agent execute --name <agent> --task "<task>"` - Execute task

---

*Agentic QE Fleet - Enterprise-grade quality engineering powered by AI and sublinear algorithms*
