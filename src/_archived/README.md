# Archived Modules

Complete implementations set aside for future use. These modules are fully functional but not currently integrated into the main product.

## neural-optimizer/

RL-based swarm topology optimizer using value networks and replay buffers. ~90% complete.

**Why archived**: Overkill for typical 6-15 agent fleets. The simpler heuristic-based topology selection in the coordination domain handles current use cases well.

**When to restore**: When 100+ agent fleets become common and adaptive topology optimization provides measurable benefit over heuristics.

**Restore command**:
```bash
git mv src/_archived/neural-optimizer src/neural-optimizer
git mv tests/_archived/neural-optimizer tests/unit/neural-optimizer
```
