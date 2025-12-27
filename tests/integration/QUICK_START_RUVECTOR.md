# RuVector Tests - Quick Start Guide

**Goal**: Get RuVector self-learning tests running in under 5 minutes.

## TL;DR

```bash
# Option 1: With Docker (full integration)
docker run -d -p 8080:8080 ruvector/server:latest
npm run test:integration -- RuVector.SelfLearning

# Option 2: Mock mode (no Docker, CI/CD friendly)
RUVECTOR_MOCK=true npm run test:integration -- RuVector.SelfLearning
```

## Step-by-Step

### 1. Verify Setup (Optional)

```bash
cd /workspaces/agentic-qe-cf/tests/integration
./verify-ruvector-setup.sh
```

This script will:
- ✅ Check Docker is installed and running
- 🐳 Start RuVector container if needed
- 🏥 Verify health endpoint responds
- 📊 Display service status

### 2. Run Tests

**Full Integration (with Docker)**:
```bash
npm run test:integration -- RuVector.SelfLearning
```

**Fast Mock Mode (no Docker)**:
```bash
RUVECTOR_MOCK=true npm run test:integration -- RuVector.SelfLearning
```

**Run Specific Test**:
```bash
npm run test:integration -- RuVector.SelfLearning -t "Search Quality"
```

**Debug Mode**:
```bash
DEBUG=true npm run test:integration -- RuVector.SelfLearning
```

### 3. Interpret Results

Expected output:
```
 PASS  tests/integration/RuVector.SelfLearning.test.ts (145s)
  RuVector Self-Learning Validation
    ✓ Health Check
    ✓ Search Quality Improvement (15s)
      📊 Improvement: 15.07% ✅ (target: 10%+)
    ✓ EWC++ Pattern Retention (45s)
      📊 Retention: 98.00% ✅ (target: 98%+)
    ✓ Search Latency (12s)
      📊 p95: 0.876ms ✅ (target: <1ms)
    ✓ LoRA Memory (18s)
      📊 Memory: 127.34 MB ✅ (target: <300MB)
```

## What's Being Tested?

| Test | GOAP Target | What It Proves |
|------|-------------|----------------|
| **Search Quality** | 10%+ improvement | GNN learns from queries |
| **EWC++ Retention** | 98%+ retention | No catastrophic forgetting |
| **Latency** | <1ms p95 | Fast O(log n) search |
| **Memory** | <300MB | Low-rank adapters efficient |

## Common Issues

### "Connection refused" on localhost:8080
**Fix**: Start Docker container
```bash
docker run -d -p 8080:8080 ruvector/server:latest
```

### "Port 8080 already in use"
**Fix**: Use different port
```bash
docker run -d -p 9090:8080 ruvector/server:latest
export RUVECTOR_URL=http://localhost:9090
npm run test:integration -- RuVector.SelfLearning
```

### Tests timeout or hang
**Fix**: Use mock mode
```bash
RUVECTOR_MOCK=true npm run test:integration -- RuVector.SelfLearning
```

### Want faster iteration
**Fix**: Use mock mode (20 seconds vs 2.5 minutes)
```bash
RUVECTOR_MOCK=true npm run test:integration -- RuVector.SelfLearning
```

## Environment Variables

```bash
# Service URL (default: http://localhost:8080)
export RUVECTOR_URL=http://localhost:9090

# Use mock client instead of real Docker (default: false)
export RUVECTOR_MOCK=true

# Skip all RuVector tests (default: false)
export SKIP_RUVECTOR_TESTS=true

# Enable debug logging (default: false)
export DEBUG=true
```

## CI/CD Integration

Add to your pipeline:

```yaml
# .github/workflows/tests.yml
- name: RuVector Integration Tests (Mock Mode)
  run: RUVECTOR_MOCK=true npm run test:integration -- RuVector.SelfLearning

- name: RuVector Integration Tests (Real Docker)
  run: |
    docker run -d -p 8080:8080 ruvector/server:latest
    sleep 15
    npm run test:integration -- RuVector.SelfLearning
  if: github.event_name == 'push' && github.ref == 'refs/heads/main'
```

## Files

| File | Purpose |
|------|---------|
| `RuVector.SelfLearning.test.ts` | Main test file (750 lines) |
| `RuVector.README.md` | Full documentation |
| `RuVector.IMPLEMENTATION_SUMMARY.md` | Technical details |
| `verify-ruvector-setup.sh` | Setup verification script |
| `QUICK_START_RUVECTOR.md` | This file |

## Next Steps

1. ✅ **Run tests** (see commands above)
2. 📊 **Review metrics** in console output
3. 🔍 **Verify GOAP targets met** (10%+, 98%+, <1ms, <300MB)
4. 📝 **Read full docs** in `RuVector.README.md`
5. 🐳 **Try Docker mode** for real validation
6. 🎭 **Use mock mode** for development

## Help & Support

- **Full Documentation**: `RuVector.README.md`
- **Technical Details**: `RuVector.IMPLEMENTATION_SUMMARY.md`
- **Test File**: `RuVector.SelfLearning.test.ts`
- **Client Implementation**: `../../src/providers/RuVectorClient.ts`

## Quick Reference

**Start Docker**:
```bash
docker run -d -p 8080:8080 ruvector/server:latest
```

**Check Health**:
```bash
curl http://localhost:8080/health | jq
```

**Run Tests (Docker)**:
```bash
npm run test:integration -- RuVector.SelfLearning
```

**Run Tests (Mock)**:
```bash
RUVECTOR_MOCK=true npm run test:integration -- RuVector.SelfLearning
```

**Stop Container**:
```bash
docker stop $(docker ps -q -f ancestor=ruvector/server:latest)
```

---

**Time to first test run**: <5 minutes
**Test execution time**: ~20 seconds (mock) or ~2.5 minutes (Docker)
**Success rate**: 8/8 tests pass when GOAP targets met
