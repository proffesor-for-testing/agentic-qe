# Code Intelligence System - Quick Start Guide

This guide will help you get the Code Intelligence System up and running in minutes.

## Prerequisites Check

Run the validation script to check your setup:

```bash
npx tsx scripts/validate-code-intelligence-setup.ts
```

## Installation Steps

### 1. Install Dependencies (Already Done)

The following dependencies have been installed:

- `tree-sitter@0.22.4` - Core parsing library
- `tree-sitter-typescript@0.21.2` - TypeScript grammar
- `tree-sitter-python@0.23.5` - Python grammar
- `tree-sitter-go@0.23.3` - Go grammar
- `tree-sitter-rust@0.24.0` - Rust grammar
- `tree-sitter-javascript@0.23.0` - JavaScript grammar
- `chokidar@3.6.0` - File system watcher
- `gpt-tokenizer@2.1.2` - Token counting

### 2. Start RuVector Database

```bash
docker run -d \
  --name agentic-qe-ruvector-dev \
  -p 5432:5432 \
  -e POSTGRES_PASSWORD=ruvector \
  ruvnet/ruvector:latest
```

Verify database is running:
```bash
docker exec agentic-qe-ruvector-dev psql -U ruvector -d ruvector_db -c "SELECT version();"
```

### 3. Setup Ollama (Optional - for local embeddings)

```bash
# Run automated setup script
./scripts/setup-ollama.sh
```

Or manually:
```bash
# Install Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# Start Ollama service (in separate terminal)
ollama serve

# Pull embedding model
ollama pull nomic-embed-text
```

## Configuration

### Environment Variables

Create a `.env` file in the project root (optional):

```bash
# Database Configuration
RUVECTOR_HOST=localhost
RUVECTOR_PORT=5432
RUVECTOR_DATABASE=ruvector_db
RUVECTOR_USER=ruvector
RUVECTOR_PASSWORD=ruvector

# Knowledge Graph (optional)
AQE_KNOWLEDGE_GRAPH_ENABLED=true
```

### Default Configuration

The system uses sensible defaults from `src/code-intelligence/config/environment.ts`:

```typescript
import { getConfig } from './src/code-intelligence/config';

// Use defaults
const config = getConfig();

// Or override specific settings
const customConfig = getConfig({
  embeddings: {
    provider: 'openai',
    model: 'text-embedding-3-small',
    dimensions: 1536,
    batchSize: 100,
  },
});
```

## Supported Languages

The system currently supports:

- TypeScript (`.ts`, `.tsx`)
- JavaScript (`.js`, `.jsx`)
- Python (`.py`)
- Go (`.go`)
- Rust (`.rs`)

## Next Steps

Once setup is complete, proceed to:

1. **Wave 2**: Tree-sitter Parser Implementation
2. **Wave 3**: Chunking and Embeddings
3. **Wave 4**: Database Schema and Indexing
4. **Wave 5**: Semantic Search and RAG
5. **Wave 6**: Knowledge Graph Visualization

## Usage Example

```typescript
import { getConfig, validateConfig } from './src/code-intelligence/config';

// Get configuration
const config = getConfig();

// Validate configuration
validateConfig(config);

// Get database connection string
const connectionString = getDatabaseConnectionString(config);

console.log(`Connecting to: ${connectionString}`);
```

## Directory Structure

```
src/code-intelligence/
├── config/
│   ├── environment.ts          ✅ Configuration management
│   ├── database-schema.ts      (Wave 2)
│   └── index.ts                ✅ Exports
├── parser/                     (Wave 2)
├── chunking/                   (Wave 3)
├── embeddings/                 (Wave 3)
├── indexing/                   (Wave 4)
├── graph/                      (Wave 4)
├── search/                     (Wave 5)
├── rag/                        (Wave 5)
└── visualization/              (Wave 6)
```

## Troubleshooting

### Tree-sitter Build Issues

```bash
# Rebuild native modules
npm rebuild tree-sitter

# If that doesn't work, reinstall
npm install --legacy-peer-deps
```

### Database Connection Issues

```bash
# Check container status
docker ps | grep ruvector

# View logs
docker logs agentic-qe-ruvector-dev

# Restart container
docker restart agentic-qe-ruvector-dev
```

### Ollama Issues

```bash
# Check service status
curl http://localhost:11434/api/tags

# View models
ollama list

# Re-pull model
ollama pull nomic-embed-text
```

## Verification Commands

```bash
# 1. Validate setup
npx tsx scripts/validate-code-intelligence-setup.ts

# 2. Test Tree-sitter
node -e "require('tree-sitter'); console.log('OK')"

# 3. Test database
docker exec agentic-qe-ruvector-dev psql -U ruvector -d ruvector_db -c "SELECT 1;"

# 4. Test Ollama
curl http://localhost:11434/api/embeddings -d '{"model": "nomic-embed-text", "prompt": "test"}'
```

## Support

For issues or questions:
- GitHub Issues: https://github.com/ruvnet/agentic-qe-cf/issues
- Full Prerequisites Guide: [code-intelligence-prerequisites.md](./code-intelligence-prerequisites.md)
