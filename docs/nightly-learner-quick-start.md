# Nightly-Learner Quick Start Guide

## 🚀 Getting Started in 15 Minutes

This guide gets you up and running with the nightly-learner system for local development and testing.

---

## Prerequisites

- Node.js 18+ installed
- Docker and Docker Compose installed
- AgentDB already configured (should exist in `.agentic-qe/memory.db`)
- 4GB+ RAM available for RuVector
- Basic understanding of the QE agent architecture

---

## Step 1: Setup RuVector (5 minutes)

### 1.1 Create Docker Compose File

```bash
# Create config directory if it doesn't exist
mkdir -p /home/user/agentic-qe/config

# Copy the RuVector Docker compose template
cat > /home/user/agentic-qe/config/ruvector-docker-compose.yml << 'EOF'
version: '3.8'
services:
  ruvector:
    image: ruvnet/ruvector-postgres:latest
    environment:
      POSTGRES_USER: aqe_user
      POSTGRES_PASSWORD: dev_password_change_in_prod
      POSTGRES_DB: aqe_vectors
      RUVECTOR_GNN_ENABLED: true
      RUVECTOR_SONA_LEARNING: true
    ports:
      - "5432:5432"
    volumes:
      - ruvector_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U aqe_user"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  ruvector_data:
EOF
```

### 1.2 Start RuVector

```bash
cd /home/user/agentic-qe/config
docker-compose -f ruvector-docker-compose.yml up -d

# Verify it's running
docker-compose -f ruvector-docker-compose.yml ps

# Check logs
docker-compose -f ruvector-docker-compose.yml logs -f ruvector
# Wait for: "database system is ready to accept connections"
```

### 1.3 Test Connection

```bash
# Install PostgreSQL client if needed
# sudo apt-get install postgresql-client

# Test connection
psql -h localhost -U aqe_user -d aqe_vectors -c "SELECT version();"
# Password: dev_password_change_in_prod

# Should show PostgreSQL version with RuVector extensions
```

---

## Step 2: Install Dependencies (2 minutes)

```bash
cd /home/user/agentic-qe

# Install RuVector client
npm install pg pgvector

# Install ML dependencies for dream engine
npm install @tensorflow/tfjs-node

# Install additional utilities
npm install node-cron
```

---

## Step 3: Configure Sleep Parameters (3 minutes)

```bash
# Create sleep configuration
cat > /home/user/agentic-qe/config/sleep-parameters.json << 'EOF'
{
  "sleep_cycles": {
    "N1_light": {
      "duration_minutes": 2,
      "activation_threshold": 0.3,
      "noise_level": 0.1
    },
    "N2_memory": {
      "duration_minutes": 3,
      "replay_count": 50,
      "consolidation_threshold": 0.6
    },
    "N3_deep": {
      "duration_minutes": 5,
      "pattern_synthesis": true,
      "distillation_ratio": 0.5
    },
    "REM_dream": {
      "duration_minutes": 5,
      "prefrontal_inhibition": 0.2,
      "noise_level": 0.5,
      "novelty_threshold": 0.7,
      "insight_extraction": true
    }
  },
  "scheduler": {
    "idle_detection_threshold": 0.2,
    "min_idle_duration_minutes": 2,
    "max_concurrent_dreamers": 2,
    "wake_on_new_task": true,
    "wake_on_manual_trigger": true,
    "dev_mode": true
  },
  "development": {
    "fast_cycles": true,
    "verbose_logging": true,
    "skip_validation": false
  }
}
EOF
```

**Note**: These are shortened cycles for development. Production uses 50-minute cycles.

---

## Step 4: Initialize Database Schema (2 minutes)

```bash
# Run migration script (to be created)
npx tsx src/nightly-learner/migrations/001-init-schema.ts

# This will create:
# - sleep_sessions table
# - sleep_cycles table
# - dream_insights table
# - pattern_transfers table
# - learning_metrics table
```

---

## Step 5: Test Basic Sleep Cycle (3 minutes)

```bash
# Run the test sleep cycle
npm run test:sleep-cycle

# Expected output:
# ✓ Sleep scheduler detects idle agent
# ✓ Initiates sleep cycle
# ✓ N1 phase completes (2m)
# ✓ N2 phase replays 50 experiences
# ✓ N3 phase consolidates patterns
# ✓ REM phase discovers 3 novel associations
# ✓ Agent wakes with new insights
# Total duration: ~15 minutes (shortened for dev)
```

---

## Step 6: Verify Integration (5 minutes)

### 6.1 Check RuVector Integration

```bash
# Test vector operations
npm run test:ruvector-integration

# Expected:
# ✓ Stores pattern vectors (<100µs)
# ✓ Queries similar patterns (<100µs)
# ✓ GNN layer updates weights
# ✓ Graph queries return relationships
```

### 6.2 Check AgentDB Integration

```bash
# Test experience capture
npm run test:agentdb-integration

# Expected:
# ✓ Captures agent experiences
# ✓ Stores in AgentDB
# ✓ Syncs to RuVector
# ✓ Retrieves for replay
```

### 6.3 Run Single Agent Test

```bash
# Test with qe-test-generator agent
npm run test:nightly-learner -- --agent qe-test-generator --duration 15m

# Monitor in real-time
npm run monitor:sleep -- --agent qe-test-generator

# Expected output:
# Agent: qe-test-generator
# Status: SLEEPING (REM phase)
# Concepts activated: 23
# Novel associations: 5
# Insights extracted: 2
# Time remaining: 3m 45s
```

---

## Verification Checklist

- [ ] RuVector container running and healthy
- [ ] Database connection successful
- [ ] Sleep parameters loaded
- [ ] Database schema created
- [ ] Test sleep cycle passes
- [ ] RuVector integration tests pass
- [ ] AgentDB integration tests pass
- [ ] Single agent completes full cycle
- [ ] Metrics visible in logs

---

## Troubleshooting

### RuVector Won't Start

```bash
# Check if port 5432 is in use
sudo lsof -i :5432

# If something else is using it, change port in docker-compose.yml
ports:
  - "5433:5432"  # Use 5433 on host

# Update connection strings accordingly
```

### Sleep Cycle Fails

```bash
# Check logs
npm run logs:sleep-scheduler

# Common issues:
# 1. AgentDB not initialized → Run npm run init:agentdb
# 2. RuVector not reachable → Check docker-compose ps
# 3. Low memory → Increase Docker memory limit to 4GB
```

### Pattern Queries Slow

```bash
# Check RuVector performance
npm run benchmark:ruvector

# If >100µs:
# 1. Check Docker resources (docker stats)
# 2. Verify GNN layer enabled (check logs)
# 3. Rebuild HNSW index (npm run rebuild:index)
```

---

## Development Workflow

### 1. Start Development Environment

```bash
# Terminal 1: Start RuVector
cd /home/user/agentic-qe/config
docker-compose -f ruvector-docker-compose.yml up

# Terminal 2: Start sleep scheduler in dev mode
cd /home/user/agentic-qe
npm run dev:sleep-scheduler

# Terminal 3: Monitor metrics
npm run dev:metrics-dashboard
```

### 2. Test Changes

```bash
# Run unit tests
npm run test:unit -- src/nightly-learner/

# Run integration tests
npm run test:integration -- --grep "nightly-learner"

# Run full system test
npm run test:system -- --agents qe-test-generator,qe-coverage-analyzer
```

### 3. Debug Dream Cycles

```bash
# Enable verbose logging
export DEBUG=nightly-learner:*

# Run single cycle with inspection
npm run debug:dream-cycle -- --agent qe-test-generator --pause-at REM

# Inspect neural substrate
npm run inspect:neural-substrate -- --agent qe-test-generator
```

---

## Next Steps

1. **Review the Full Implementation Plan**: `/home/user/agentic-qe/docs/nightly-learner-implementation-plan.md`
2. **Implement Phase 1**: Infrastructure setup (see plan for details)
3. **Test with 3 Pilot Agents**: Start small before rolling out to all 19
4. **Monitor Metrics**: Watch for learning effectiveness
5. **Iterate**: Adjust sleep parameters based on results

---

## Useful Commands

```bash
# Start/stop RuVector
docker-compose -f config/ruvector-docker-compose.yml up -d
docker-compose -f config/ruvector-docker-compose.yml down

# Monitor sleeping agents
npm run monitor:sleep -- --all

# Force wake an agent
npm run wake -- --agent qe-test-generator

# View learning metrics
npm run metrics:learning -- --agent qe-test-generator --days 7

# Export sleep data
npm run export:sleep-data -- --format json --output sleep-data.json

# Reset learning state (careful!)
npm run reset:learning -- --agent qe-test-generator --confirm
```

---

## Getting Help

- **Implementation Plan**: `/home/user/agentic-qe/docs/nightly-learner-implementation-plan.md`
- **Architecture Details**: See Section 4 of implementation plan
- **GOAP Actions**: See Section 2 of implementation plan
- **Issues**: Create GitHub issue with `nightly-learner` label

---

**Quick Start Version**: 1.0
**Compatible With**: AgentDB 2.0+, RuVector latest
**Estimated Setup Time**: 15 minutes
**Status**: Development - Not Production Ready
