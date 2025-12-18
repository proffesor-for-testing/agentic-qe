# RuVector Docker Setup

This directory contains Docker Compose configurations for running RuVector as part of the Agentic QE Fleet.

## Quick Start

### 1. Start RuVector (Production)

```bash
./scripts/ruvector-start.sh start
```

### 2. Start RuVector (Development)

```bash
./scripts/ruvector-start.sh start development
```

### 3. Check Status

```bash
./scripts/ruvector-start.sh status
```

### 4. View Logs

```bash
./scripts/ruvector-start.sh logs
```

### 5. Stop RuVector

```bash
./scripts/ruvector-start.sh stop
```

## Configuration

### Environment Variables

Create a `.env` file in the project root to customize settings:

```bash
# Data Paths
RUVECTOR_DATA_PATH=/custom/path/to/data
RUVECTOR_MODELS_PATH=/custom/path/to/models

# Performance Tuning
RUVECTOR_MAX_MEMORY_GB=8
RUVECTOR_CACHE_SIZE_MB=1024

# Learning Configuration
RUVECTOR_LORA_RANK=16
RUVECTOR_EWC_LAMBDA=0.5
```

### Profiles

#### Production Profile (Default)

- Optimized for performance
- JSON logging
- Resource limits: 2-4GB RAM, 1-2 CPUs
- Ports: 8080 (REST), 9090 (gRPC)

#### Development Profile

- Debug logging enabled
- Text format logs for readability
- Profiling endpoint exposed (port 6060)
- More aggressive learning settings
- Separate data volumes

## Architecture

### Ports

| Port | Service | Description |
|------|---------|-------------|
| 8080 | REST API | HTTP/JSON endpoints |
| 9090 | gRPC | High-performance RPC |
| 6060 | Profiling | Go pprof (dev only) |

### Volumes

| Volume | Purpose | Path |
|--------|---------|------|
| ruvector-data | Vector storage | `/data` |
| ruvector-models | LoRA models | `/models` |

### Health Checks

The container includes automatic health monitoring:

- **Endpoint**: `http://localhost:8080/health`
- **Interval**: 30 seconds
- **Timeout**: 10 seconds
- **Retries**: 3
- **Start Period**: 40 seconds

## Advanced Usage

### Manual Docker Compose Commands

```bash
# Start with specific profile
docker compose -f docker/docker-compose.ruvector.yml --profile production up -d

# View logs
docker compose -f docker/docker-compose.ruvector.yml logs -f

# Stop and remove volumes
docker compose -f docker/docker-compose.ruvector.yml down -v
```

### Custom Configuration File

Mount a custom config file:

```yaml
volumes:
  - ./config/ruvector.yml:/app/config.yml:ro
```

### Resource Limits

Adjust in `docker-compose.ruvector.yml`:

```yaml
deploy:
  resources:
    limits:
      cpus: '4.0'
      memory: 8G
    reservations:
      cpus: '2.0'
      memory: 4G
```

## Integration with Agentic QE

### 1. Initialize AQE with RuVector

```bash
aqe init --vector-db ruvector --ruvector-url http://localhost:8080
```

### 2. Configure Agent Learning

```bash
# Enable self-learning for specific agent
aqe learn enable --agent qe-test-generator

# Set RuVector as backend
aqe config set learning.backend ruvector
```

### 3. Verify Integration

```bash
# Check RuVector connection
curl http://localhost:8080/health

# Test vector operations
curl -X POST http://localhost:8080/api/v1/vectors \
  -H "Content-Type: application/json" \
  -d '{"embedding": [0.1, 0.2, 0.3], "metadata": {"test": true}}'
```

## Monitoring

### Container Stats

```bash
docker stats agentic-qe-ruvector
```

### Health Status

```bash
./scripts/ruvector-start.sh health
```

### Logs Analysis

```bash
# Last 100 lines
./scripts/ruvector-start.sh logs 100

# Stream logs
./scripts/ruvector-start.sh logs follow

# Filter for errors
docker compose -f docker/docker-compose.ruvector.yml logs | grep ERROR
```

## Troubleshooting

### Container Won't Start

1. Check Docker is running:
   ```bash
   docker info
   ```

2. Check port availability:
   ```bash
   lsof -i :8080
   lsof -i :9090
   ```

3. View startup logs:
   ```bash
   ./scripts/ruvector-start.sh logs
   ```

### Health Check Failing

1. Verify endpoint manually:
   ```bash
   curl -v http://localhost:8080/health
   ```

2. Check container logs:
   ```bash
   ./scripts/ruvector-start.sh logs 50
   ```

3. Restart container:
   ```bash
   ./scripts/ruvector-start.sh restart
   ```

### Out of Memory

1. Increase memory limit in `docker-compose.ruvector.yml`
2. Reduce cache size: `RUVECTOR_CACHE_SIZE_MB=256`
3. Lower max memory: `RUVECTOR_MAX_MEMORY_GB=2`

### Permission Errors

Ensure data directories are writable:

```bash
chmod -R 755 ./data/ruvector ./data/ruvector-models
```

## Performance Tuning

### HNSW Index Optimization

```yaml
environment:
  RUVECTOR_HNSW_M: 64              # Higher = more accurate, more memory
  RUVECTOR_HNSW_EF_CONSTRUCTION: 400  # Higher = slower build, better quality
  RUVECTOR_HNSW_EF_SEARCH: 200     # Higher = slower search, more accurate
```

### Learning Rate Tuning

```yaml
environment:
  RUVECTOR_LORA_RANK: 16           # Higher = more capacity, more memory
  RUVECTOR_LORA_ALPHA: 32          # Scaling factor for LoRA updates
  RUVECTOR_EWC_LAMBDA: 0.5         # Higher = more forgetting prevention
```

## Backup and Recovery

### Backup Data

```bash
# Stop container
./scripts/ruvector-start.sh stop

# Backup volumes
tar -czf ruvector-backup-$(date +%Y%m%d).tar.gz ./data/ruvector ./data/ruvector-models

# Restart
./scripts/ruvector-start.sh start
```

### Restore Data

```bash
# Stop container
./scripts/ruvector-start.sh stop

# Restore from backup
tar -xzf ruvector-backup-20250101.tar.gz

# Restart
./scripts/ruvector-start.sh start
```

## References

- [RuVector GitHub](https://github.com/ruvnet/ruvector)
- [RuVector Documentation](https://ruvector.dev/docs)
- [Phase 0.5 Implementation Guide](../docs/llm-independence/phase-0.5-implementation.md)

## Support

For issues specific to:
- **Docker setup**: Check this README and container logs
- **RuVector service**: See [RuVector docs](https://ruvector.dev/docs)
- **AQE integration**: See [Phase 0.5 docs](../docs/llm-independence/phase-0.5-implementation.md)
