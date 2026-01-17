# Code Intelligence System Prerequisites

This document outlines the required software and setup steps for the Code Intelligence System.

## Required Software

### 1. Docker with RuVector

RuVector is a PostgreSQL extension providing vector similarity search capabilities.

```bash
# Start RuVector container
docker run -d \
  --name agentic-qe-ruvector-dev \
  -p 5432:5432 \
  -e POSTGRES_PASSWORD=ruvector \
  ruvnet/ruvector:latest
```

Verify the database is running:
```bash
docker exec agentic-qe-ruvector-dev psql -U ruvector -d ruvector_db -c "SELECT version();"
```

### 2. Ollama for Embeddings (Recommended)

Ollama provides local embedding generation using the nomic-embed-text model.

#### Installation

```bash
# Install Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# Start Ollama service (in separate terminal)
ollama serve

# Pull embedding model
ollama pull nomic-embed-text
```

#### Automated Setup

We provide a setup script for convenience:

```bash
# Make script executable
chmod +x scripts/setup-ollama.sh

# Run setup
./scripts/setup-ollama.sh
```

#### Verify Ollama

```bash
# Check if Ollama is running
curl http://localhost:11434/api/tags

# Test embedding generation
curl http://localhost:11434/api/embeddings -d '{"model": "nomic-embed-text", "prompt": "Hello world"}'
```

### 3. Node.js 18+

Node.js 18 or higher is required for Tree-sitter native bindings.

```bash
# Check Node.js version
node --version  # Should be v18.0.0 or higher
```

## Environment Variables

Configure the Code Intelligence System using these environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `RUVECTOR_HOST` | localhost | RuVector database host |
| `RUVECTOR_PORT` | 5432 | RuVector database port |
| `RUVECTOR_DATABASE` | ruvector_db | Database name |
| `RUVECTOR_USER` | ruvector | Database user |
| `RUVECTOR_PASSWORD` | ruvector | Database password |
| `AQE_KNOWLEDGE_GRAPH_ENABLED` | false | Enable knowledge graph features |

### Setting Environment Variables

Create a `.env` file in the project root:

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

## Installation Steps

### 1. Install Dependencies

```bash
npm install
```

This will install:
- `tree-sitter` - Parsing library
- `tree-sitter-typescript` - TypeScript grammar
- `tree-sitter-python` - Python grammar
- `tree-sitter-go` - Go grammar
- `tree-sitter-rust` - Rust grammar
- `tree-sitter-javascript` - JavaScript grammar
- `chokidar` - File system watcher
- `gpt-tokenizer` - Token counting

### 2. Setup RuVector Database

```bash
# Start the database
docker run -d \
  --name agentic-qe-ruvector-dev \
  -p 5432:5432 \
  -e POSTGRES_PASSWORD=ruvector \
  ruvnet/ruvector:latest

# Wait for database to be ready
sleep 5

# Verify connection
docker exec agentic-qe-ruvector-dev psql -U ruvector -d ruvector_db -c "SELECT version();"
```

### 3. Setup Ollama (Optional)

```bash
# Run automated setup
./scripts/setup-ollama.sh
```

Or manually:
```bash
ollama serve  # In separate terminal
ollama pull nomic-embed-text
```

## Verification

Run these commands to verify your setup:

```bash
# 1. Check database connection
docker exec agentic-qe-ruvector-dev psql -U ruvector -d ruvector_db -c "SELECT version();"

# 2. Check Ollama (if using local embeddings)
curl http://localhost:11434/api/tags

# 3. Verify Tree-sitter installation
node -e "require('tree-sitter')"

# 4. Test embedding generation
curl http://localhost:11434/api/embeddings -d '{"model": "nomic-embed-text", "prompt": "test"}'
```

All commands should complete without errors.

## Troubleshooting

### Database Connection Issues

```bash
# Check if container is running
docker ps | grep ruvector

# View container logs
docker logs agentic-qe-ruvector-dev

# Restart container
docker restart agentic-qe-ruvector-dev
```

### Ollama Issues

```bash
# Check if Ollama is running
curl http://localhost:11434/api/tags

# View available models
ollama list

# Re-pull model if corrupted
ollama pull nomic-embed-text
```

### Tree-sitter Build Issues

```bash
# Rebuild native modules
npm rebuild tree-sitter

# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install
```

## Alternative: OpenAI Embeddings

If you prefer not to run Ollama locally, you can use OpenAI's embedding API:

```bash
# Add to .env
OPENAI_API_KEY=your-api-key-here
```

Update configuration in your code:
```typescript
import { getConfig } from './src/code-intelligence/config';

const config = getConfig({
  embeddings: {
    provider: 'openai',
    model: 'text-embedding-3-small',
    dimensions: 1536,
    batchSize: 100,
  },
});
```

## Next Steps

Once prerequisites are installed:

1. Review the [Code Intelligence Architecture](../architecture/code-intelligence.md)
2. Run the initialization script (Wave 2)
3. Index your first codebase (Wave 4)
4. Try semantic code search (Wave 5)

## Support

For issues or questions:
- GitHub Issues: https://github.com/ruvnet/agentic-qe-cf/issues
- Documentation: See `docs/` directory
