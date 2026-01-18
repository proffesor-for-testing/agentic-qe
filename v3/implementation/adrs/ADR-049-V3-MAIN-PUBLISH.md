# ADR-049: V3 Main Package Publication

## Status

**Accepted**

| Attribute | Value |
|-----------|-------|
| Date | 2026-01-17 |
| Author | Architecture Team |
| Related ADRs | ADR-047 (V3 Implementation Status), ADR-048 (V2-to-V3 Migration) |

## Context

Agentic QE v3 represents a complete architectural rewrite implementing Domain-Driven Design (DDD) with 12 bounded contexts, O(log n) coverage analysis, ReasoningBank learning, and 47 specialized QE agents. After extensive development and stabilization (currently at 3.0.0-alpha.26), v3 has proven production-ready for the following capabilities:

1. **Domain-Driven Architecture**: 12 bounded contexts providing clear separation of concerns
2. **Performance**: HNSW-indexed vector search (150x-12,500x faster), Flash Attention integration
3. **Learning System**: ReasoningBank with SONA (Self-Optimizing Neural Architecture)
4. **CLI Maturity**: 26 commands with 140+ subcommands, comprehensive hook system
5. **MCP Integration**: Full Model Context Protocol support with specialized tools

The root `agentic-qe` package (v2.8.2) has been configured with bin entries pointing to v3 CLI:

```json
{
  "bin": {
    "agentic-qe": "./v3/dist/cli/bundle.js",
    "aqe": "./v3/dist/cli/bundle.js",
    "aqe-v3": "./v3/dist/cli/bundle.js",
    "aqe-mcp": "./v3/dist/mcp/bundle.js"
  }
}
```

This pattern follows the established claude-flow approach where the root package serves as the distribution point while v3 contains the actual implementation.

## Decision

**Make `@agentic-qe/v3` the main implementation behind the `agentic-qe` npm package.**

### Publication Strategy

1. **Root Package (`agentic-qe`)**: Published to npm as the primary package
   - Version: 3.0.0 (incrementing from 2.8.2)
   - All CLI commands (`aqe`, `agentic-qe`, `aqe-mcp`) point to v3 bundles
   - Files array includes only v3 distribution and assets

2. **V3 Package (`@agentic-qe/v3`)**: Remains as scoped package for direct imports
   - Version: 3.0.0 (aligned with root)
   - Provides programmatic API exports
   - Used for advanced integrations requiring direct module access

### Zero-Breaking-Changes Approach

Users will experience seamless migration:

| Command | Before (v2) | After (v3) |
|---------|-------------|------------|
| `npx agentic-qe` | v2 CLI | v3 CLI (enhanced) |
| `npx aqe` | v2 CLI | v3 CLI (enhanced) |
| `aqe init` | Basic init | `aqe init --wizard` with enhanced options |
| MCP tools | 100 tools | 100+ tools with lazy loading |

### Package Structure

```
agentic-qe/
├── package.json          # Root: name="agentic-qe", bin points to v3
├── v3/
│   ├── package.json      # Scoped: name="@agentic-qe/v3"
│   ├── dist/
│   │   ├── cli/bundle.js   # CLI entry point
│   │   ├── mcp/bundle.js   # MCP entry point
│   │   └── index.js        # Programmatic API
│   └── assets/
│       └── agents/         # 47 QE agent definitions
└── README.md
```

### Version Alignment

Both packages will be published with version 3.0.0:

```json
// Root package.json
{
  "name": "agentic-qe",
  "version": "3.0.0"
}

// v3/package.json
{
  "name": "@agentic-qe/v3",
  "version": "3.0.0"
}
```

## Consequences

### Positive

1. **Unified User Experience**: Single `agentic-qe` package name, familiar to existing users
2. **Backward Compatibility**: Existing scripts using `aqe` or `agentic-qe` CLI continue working
3. **Enhanced Capabilities**: Users automatically get v3 features (DDD, learning, performance)
4. **Simplified Installation**: `npm install -g agentic-qe` gets the latest architecture
5. **Dual Access Patterns**: CLI users get main package, API users can import scoped package

### Negative

1. **Version Jump**: 2.8.2 to 3.0.0 is a major version jump (mitigated by semantic versioning expectations)
2. **Package Size**: Root package includes v3 distribution (mitigated by proper files array configuration)
3. **Dual Publishing**: Need to publish both packages in sync (automated via CI/CD)

### Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Breaking CLI changes | v3 CLI maintains all v2 command signatures with enhanced options |
| Missing v2 features | ADR-048 migration provides compatibility layer |
| User confusion | Clear changelog and migration guide in README |

## Implementation Plan

### Phase 1: Pre-Publication (Current)
- [x] Configure root package.json bin entries to v3
- [x] Configure root package.json files array for v3 distribution
- [x] Implement ADR-048 migration compatibility layer
- [ ] Final v3 build verification

### Phase 2: Publication
- [ ] Update root package.json version to 3.0.0
- [ ] Update v3/package.json version to 3.0.0
- [ ] Publish `agentic-qe@3.0.0` to npm
- [ ] Publish `@agentic-qe/v3@3.0.0` to npm

### Phase 3: Post-Publication
- [ ] Update documentation with v3 as primary
- [ ] Deprecation notice for v2 programmatic imports
- [ ] Monitor npm download metrics and issue reports

## Related Decisions

- **ADR-047 (V3 Implementation Status)**: Documents v3 feature completeness and stability metrics
- **ADR-048 (V2-to-V3 Migration)**: Provides the migration tooling and compatibility layer referenced in this ADR

## References

- Claude Flow Publication Pattern: Root package pointing to v3 CLI bundles
- npm Package Best Practices: Scoped vs unscoped package distribution
- Semantic Versioning: Major version increment for architectural changes
