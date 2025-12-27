# Wave 1: File Reference - Absolute Paths

This document lists all files created in Wave 1 with their absolute paths for easy reference.

## Configuration Files

### Environment Configuration
```
/workspaces/agentic-qe-cf/src/code-intelligence/config/environment.ts
```
Main configuration module with:
- `CodeIntelligenceConfig` interface
- `defaultConfig` with environment variable support
- `getConfig()` function for configuration retrieval
- `validateConfig()` function for validation
- `getDatabaseConnectionString()` helper

### Config Index
```
/workspaces/agentic-qe-cf/src/code-intelligence/config/index.ts
```
Central export point for configuration modules.

## Scripts

### Ollama Setup
```
/workspaces/agentic-qe-cf/scripts/setup-ollama.sh
```
Automated setup for Ollama and nomic-embed-text model.

**Usage**: `./scripts/setup-ollama.sh`

### Complete Setup
```
/workspaces/agentic-qe-cf/scripts/setup-code-intelligence.sh
```
Complete automated setup including database, dependencies, and validation.

**Usage**: `./scripts/setup-code-intelligence.sh`

### Validation Script
```
/workspaces/agentic-qe-cf/scripts/validate-code-intelligence-setup.ts
```
Comprehensive validation of setup and dependencies.

**Usage**: `npx tsx scripts/validate-code-intelligence-setup.ts`

## Documentation

### Prerequisites Guide
```
/workspaces/agentic-qe-cf/docs/setup/code-intelligence-prerequisites.md
```
Complete guide for installing and configuring prerequisites.

### Quick Start Guide
```
/workspaces/agentic-qe-cf/docs/setup/code-intelligence-quick-start.md
```
Quick reference for getting started with the Code Intelligence System.

### Wave 1 Completion Summary
```
/workspaces/agentic-qe-cf/docs/code-intelligence/wave1-completion-summary.md
```
Detailed summary of Wave 1 deliverables and results.

### This File
```
/workspaces/agentic-qe-cf/docs/code-intelligence/wave1-file-reference.md
```
Quick reference for all Wave 1 file paths.

## Directory Structure

### Code Intelligence Root
```
/workspaces/agentic-qe-cf/src/code-intelligence/
```

### Configuration (Wave 1 - Complete)
```
/workspaces/agentic-qe-cf/src/code-intelligence/config/
```

### Parser (Wave 2)
```
/workspaces/agentic-qe-cf/src/code-intelligence/parser/
```

### Chunking (Wave 3)
```
/workspaces/agentic-qe-cf/src/code-intelligence/chunking/
```

### Embeddings (Wave 3)
```
/workspaces/agentic-qe-cf/src/code-intelligence/embeddings/
```

### Indexing (Wave 4)
```
/workspaces/agentic-qe-cf/src/code-intelligence/indexing/
```

### Graph (Wave 4)
```
/workspaces/agentic-qe-cf/src/code-intelligence/graph/
```

### Search (Wave 5)
```
/workspaces/agentic-qe-cf/src/code-intelligence/search/
```

### RAG (Wave 5)
```
/workspaces/agentic-qe-cf/src/code-intelligence/rag/
```

### Visualization (Wave 6)
```
/workspaces/agentic-qe-cf/src/code-intelligence/visualization/
```

## Dependencies Added to package.json

Updated file:
```
/workspaces/agentic-qe-cf/package.json
```

Added dependencies:
- `tree-sitter@0.22.4`
- `tree-sitter-typescript@0.21.2`
- `tree-sitter-python@0.23.5`
- `tree-sitter-go@0.23.3`
- `tree-sitter-rust@0.24.0`
- `tree-sitter-javascript@0.23.0`
- `chokidar@3.6.0`
- `gpt-tokenizer@2.1.2`

## Quick Commands

### Run Complete Setup
```bash
/workspaces/agentic-qe-cf/scripts/setup-code-intelligence.sh
```

### Validate Setup
```bash
npx tsx /workspaces/agentic-qe-cf/scripts/validate-code-intelligence-setup.ts
```

### Setup Ollama (Optional)
```bash
/workspaces/agentic-qe-cf/scripts/setup-ollama.sh
```

### Import Configuration in Code
```typescript
import { getConfig, validateConfig } from '/workspaces/agentic-qe-cf/src/code-intelligence/config';
```

## Environment Variables

Create `.env` file at:
```
/workspaces/agentic-qe-cf/.env
```

Example contents:
```bash
RUVECTOR_HOST=localhost
RUVECTOR_PORT=5432
RUVECTOR_DATABASE=ruvector_db
RUVECTOR_USER=ruvector
RUVECTOR_PASSWORD=ruvector
AQE_KNOWLEDGE_GRAPH_ENABLED=true
```

## Notes

- All source code files are in `/workspaces/agentic-qe-cf/src/code-intelligence/`
- All scripts are in `/workspaces/agentic-qe-cf/scripts/`
- All documentation is in `/workspaces/agentic-qe-cf/docs/`
- No files were created in the root directory
- All scripts are executable (`chmod +x` applied)

---

*Last Updated: 2025-12-21*
*Wave 1: Environment Configuration*
