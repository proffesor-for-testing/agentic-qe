# Archived V3 Development Skills

These 21 skills were created to help the AQE team build v3 itself. They are **not intended for end users** and have been archived here for team reference.

## Why Archived?

These skills contain implementation details, architecture decisions, and development workflows specific to building the v3 codebase. End users should use:

- **V2 Skills** (46+): Methodology-focused, version-agnostic (shift-left-testing, tdd-london-chicago, etc.)
- **V3 Domain Skills** (12): User-facing guides for v3 features (v3-qe-test-generation, etc.)

## Archived Skills

### General V3 Development (9)
| Skill | Purpose |
|-------|---------|
| v3-core-implementation | Building DDD base classes, entities, repositories |
| v3-cli-modernization | CLI refactoring and command structure |
| v3-ddd-architecture | Architecture design and bounded contexts |
| v3-integration-deep | Integration planning with claude-flow |
| v3-mcp-optimization | MCP server optimization |
| v3-memory-unification | Memory system migration to AgentDB |
| v3-performance-optimization | Performance profiling and optimization |
| v3-security-overhaul | Security improvements and CWE fixes |
| v3-swarm-coordination | Swarm topology implementation |

### V3 QE Internal (12)
| Skill | Purpose |
|-------|---------|
| v3-qe-core-implementation | QE domain core building |
| v3-qe-ddd-architecture | QE DDD design decisions |
| v3-qe-cli | CLI feature implementation |
| v3-qe-memory-system | Memory system internals |
| v3-qe-performance | Performance optimization work |
| v3-qe-security | Security implementation details |
| v3-qe-mcp | MCP handler implementation |
| v3-qe-mcp-optimization | MCP response optimization |
| v3-qe-memory-unification | Memory backend migration |
| v3-qe-integration | Integration implementation |
| v3-qe-agentic-flow-integration | Agentic-flow package integration |
| v3-qe-fleet-coordination | Fleet coordination internals |

## For AQE Developers

If you're working on v3 internals, these skills may still be useful. Reference them as needed, but do not expose to end users.

## User-Facing Skills Location

- **V2 Skills**: `.claude/skills/` (46+ methodology skills)
- **V3 Domain Skills**: `.claude/skills/v3-qe-*` (12 domain-specific)
