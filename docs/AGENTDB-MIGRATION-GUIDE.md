# AgentDB Learning Migration Guide

**Version**: 1.0.0  
**Target Audience**: Existing AQE users  
**Migration Difficulty**: Easy (Opt-in, backward compatible)

---

## 🎯 Overview

AgentDB Learning is a **new optional feature** that enhances QE agents with self-learning capabilities.

**Key Points**:
- ✅ **Backward Compatible**: Existing code works without changes
- ✅ **Opt-In**: Enable when ready  
- ✅ **No Breaking Changes**: Basic learning still works
- ✅ **Gradual Migration**: Enable per agent, not all at once

---

## 🚀 Quick Start

```bash
# Check compatibility
aqe agentdb learn status

# Enable learning
# Edit .agentic-qe/config/agentdb.json - set enabled: true

# Monitor progress
aqe agentdb learn stats --agent qe-test-generator
```

---

See `/docs/AGENTDB-LEARNING-GUIDE.md` for full documentation.
