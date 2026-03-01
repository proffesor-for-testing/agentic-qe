# Agentic QE Package Publishing Structure

This document explains how the agentic-qe package is structured and published to npm.

## Package Structure

```
agentic-qe/
├── package.json          # ROOT - This is what gets published to npm
├── v3/                   # v3 implementation (DDD architecture)
│   ├── package.json      # v3-specific deps (NOT published directly)
│   ├── dist/             # Built CLI, MCP server, and library
│   │   ├── cli/bundle.js # CLI entry point
│   │   ├── mcp/bundle.js # MCP server entry point
│   │   └── index.js      # Library entry point
│   └── assets/           # Agent definitions, skills, etc.
└── .claude/              # Claude Code integration files
    ├── agents/           # Agent definitions
    ├── skills/           # Skills
    └── commands/         # Commands
```

## Which package.json is Published?

**The ROOT `package.json` is what npm publishes.**

The `files` array in root package.json specifies what gets included:
```json
{
  "files": [
    "v3/dist/**",
    "v3/assets/**",
    "v3/package.json",
    ".claude/agents",
    ".claude/skills",
    ".claude/commands",
    ".claude/helpers",
    "README.md",
    "CHANGELOG.md",
    "LICENSE"
  ]
}
```

## Important: Dependencies

**All runtime dependencies must be in ROOT package.json's `dependencies`**, not:
- NOT in root `devDependencies` (users don't get these)
- NOT only in `v3/package.json` (this file is included but its deps aren't auto-installed)

### Common Pitfall: Missing Dependencies

If the CLI fails with `Cannot find package 'X'`, check:
1. Is `X` in root `package.json` `dependencies`?
2. If not, add it there (not just in v3/package.json)

Example error:
```
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'typescript'
```

Solution: Add `typescript` to root package.json `dependencies`.

## Build Process

1. `npm run build` → runs TypeScript compilation + esbuild bundles
2. Build outputs:
   - TypeScript compilation → `dist/`
   - CLI bundle (esbuild) → `dist/cli/bundle.js`
   - MCP bundle (esbuild) → `dist/mcp/bundle.js`

## Publishing Workflow

1. Update version in **root** `package.json`
2. Create GitHub release with tag (e.g., `v3.1.1`)
3. GitHub Action `npm-publish.yml` triggers:
   - Installs deps from root
   - Builds v3
   - Runs tests
   - Publishes to npm

## Versioning

- Root `package.json` version is the published version
- v3/package.json version should match but is NOT what npm reads
- Always update root version when releasing

## Entry Points

```json
{
  "main": "./v3/dist/index.js",      // Library import
  "types": "./v3/dist/index.d.ts",   // TypeScript types
  "bin": {
    "aqe": "./v3/dist/cli/bundle.js",       // CLI
    "aqe-mcp": "./v3/dist/mcp/bundle.js"    // MCP server
  }
}
```

## Checklist Before Publishing

- [ ] Root `package.json` version is updated
- [ ] All runtime imports are in root `dependencies` (not devDependencies)
- [ ] v3 builds successfully: `npm run build`
- [ ] Tests pass: `npm test`
- [ ] CLI works locally: `node v3/dist/cli/bundle.js --version`

## Troubleshooting

### "Cannot find package 'X'" after install

The package `X` is imported at runtime but not in root `dependencies`.

Fix: Add to root package.json dependencies:
```json
{
  "dependencies": {
    "X": "^version"
  }
}
```

### "Module not found" for v3 internal imports

The esbuild bundle may have incorrect externals. Check:
- `v3/scripts/build-cli.js` - externals list
- `v3/scripts/build-mcp.js` - externals list

### Version mismatch

Ensure both are in sync:
- Root `package.json` version (this is what npm uses)
- v3/package.json version (for internal consistency)
