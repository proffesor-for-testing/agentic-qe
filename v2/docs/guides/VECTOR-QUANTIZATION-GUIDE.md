# Vector Quantization Guide

## Overview

Vector Quantization is a memory optimization technique that reduces the memory footprint of vector embeddings by 4-32x while maintaining 93-99% accuracy. The AQE Fleet uses AgentDB's built-in quantization to optimize performance.

## Quick Start

### Check Current Status

```bash
# View quantization status across all agents
aqe quantization status

# Output:
# ═══════════════════════════════════════════════════════════
#            VECTOR QUANTIZATION REPORT
# ═══════════════════════════════════════════════════════════
#
# 📊 AGGREGATE METRICS:
#   Total Vectors: 125,430
#   Total Memory Usage: 47.20 MB
#   Average Reduction: 4.0x
#
# 🔧 QUANTIZATION DISTRIBUTION:
#   None (Full Precision): 2 agents
#   Scalar (4x):           15 agents
#   Binary (32x):          1 agents
#   Product (8-16x):       0 agents
```

### Get Recommendation

```bash
# Get recommendation for your use case
aqe quantization recommend \
  --vectors 50000 \
  --memory medium \
  --accuracy high \
  --deployment cloud

# Output:
# ✨ Recommended Type: SCALAR
# Reason: Balanced performance/accuracy for medium-scale deployment
#
# 💡 Expected Benefits:
#   Memory Reduction: 4x (e.g., 3GB → 768MB)
#   Speed Increase: 3x faster search
#   Accuracy Impact: 1-2% loss (98-99% accuracy)
#
# ✅ Configuration:
# Add to your agent config:
#   quantizationType: 'scalar'
```

### Compare Options

```bash
# Compare all quantization types
aqe quantization compare --vectors 50000

# Output (table):
# ┌────────────┬─────────────────┬────────────┬────────────┬────────────────┬──────────────┐
# │ Type       │ Memory (MB)     │ Reduction  │ Speed      │ Accuracy Loss  │ Recommended  │
# ├────────────┼─────────────────┼────────────┼────────────┼────────────────┼──────────────┤
# │ none       │ 146.48          │ none       │ 1x         │ 0%             │ -            │
# │ scalar     │ 36.62           │ 4x         │ 3x         │ 1-2%           │ ✓            │
# │ binary     │ 4.58            │ 32x        │ 10x        │ 2-5%           │ -            │
# │ product    │ 2.29            │ 16x        │ 5x         │ 3-7%           │ -            │
# └────────────┴─────────────────┴────────────┴────────────┴────────────────┴──────────────┘
```

### Calculate Memory Usage

```bash
# Calculate memory for a specific configuration
aqe quantization calculate \
  --vectors 100000 \
  --type binary

# Output:
# 💾 Memory Usage Calculation
#
# Configuration:
#   Vectors: 100,000
#   Dimensions: 768
#   Quantization: binary
#
# 📊 Results:
#   Bytes per Vector: 96
#   Total Memory: 9.16 MB
#   Reduction: 32x
#
# 💰 Savings:
#   Memory Saved: 283.48 MB (96.9%)
#   Without Quantization: 292.97 MB
```

## Quantization Types

### 1. Scalar Quantization (4x) ⭐ **RECOMMENDED**

**Best for:** Production applications, 10K-1M vectors

```typescript
{
  quantizationType: 'scalar'
}
```

**Characteristics:**
- **Memory:** 4x reduction (3GB → 768MB)
- **Speed:** 3x faster search
- **Accuracy:** 98-99% (1-2% loss)
- **Use Case:** General-purpose production applications

**Example:**
```typescript
const agent = new TestGeneratorAgent({
  // ... other config
  quantizationType: 'scalar', // ⭐ Recommended default
  agentDBPath: '.agentdb/test-generator.db'
});
```

### 2. Binary Quantization (32x)

**Best for:** Mobile apps, edge devices, >1M vectors

```typescript
{
  quantizationType: 'binary'
}
```

**Characteristics:**
- **Memory:** 32x reduction (3GB → 96MB)
- **Speed:** 10x faster search
- **Accuracy:** 95-98% (2-5% loss)
- **Use Case:** Memory-constrained environments

**Example:**
```typescript
const agent = new CoverageAnalyzerAgent({
  // ... other config
  quantizationType: 'binary', // Aggressive compression
  deployment: 'mobile'
});
```

### 3. Product Quantization (8-16x)

**Best for:** High-dimensional vectors, >100K vectors

```typescript
{
  quantizationType: 'product'
}
```

**Characteristics:**
- **Memory:** 8-16x reduction (3GB → 192MB)
- **Speed:** 5x faster search
- **Accuracy:** 93-97% (3-7% loss)
- **Use Case:** Large-scale similarity search

**Example:**
```typescript
const agent = new FlakyTestHunterAgent({
  // ... other config
  quantizationType: 'product', // High-dimensional patterns
  vectorCount: 500000
});
```

### 4. No Quantization (Full Precision)

**Best for:** <10K vectors, critical accuracy

```typescript
{
  quantizationType: 'none'
}
```

**Characteristics:**
- **Memory:** No reduction
- **Speed:** Baseline (1x)
- **Accuracy:** 100% (no loss)
- **Use Case:** Development, small datasets, critical accuracy

**Example:**
```typescript
const agent = new SecurityScannerAgent({
  // ... other config
  quantizationType: 'none', // Maximum accuracy for security
  accuracyPriority: 'critical'
});
```

## Selection Guide

### By Vector Count

| Vector Count | Recommended Type | Reason |
|--------------|------------------|--------|
| < 10K | `none` | Small dataset, no optimization needed |
| 10K - 100K | `scalar` | Balanced performance/accuracy |
| 100K - 1M | `scalar` or `product` | Depends on accuracy requirements |
| > 1M | `binary` or `product` | Aggressive compression needed |

### By Deployment

| Deployment | Recommended Type | Reason |
|------------|------------------|--------|
| Cloud | `scalar` | Balanced default |
| Desktop | `scalar` | Balanced default |
| Edge | `binary` | Memory constraints |
| Mobile | `binary` | Aggressive optimization |

### By Priority

| Priority | Recommended Type | Reason |
|----------|------------------|--------|
| **Accuracy = Critical** | `none` | Zero loss |
| **Accuracy = High** | `scalar` | 1-2% loss acceptable |
| **Speed = Critical** | `binary` | 10x faster |
| **Memory = Low** | `binary` | 32x reduction |

## Configuration Examples

### Development Environment

```typescript
const config = {
  agentDBPath: '.agentdb/dev.db',
  quantizationType: 'none', // Full precision for debugging
  enableLearning: true
};
```

### Production Environment (Balanced)

```typescript
const config = {
  agentDBPath: '.agentdb/prod.db',
  quantizationType: 'scalar', // ⭐ Recommended
  cacheSize: 2000,
  enableLearning: true
};
```

### Production Environment (High Performance)

```typescript
const config = {
  agentDBPath: '.agentdb/prod-fast.db',
  quantizationType: 'binary', // Maximum speed
  cacheSize: 5000,
  enableLearning: true
};
```

### Mobile Deployment

```typescript
const config = {
  agentDBPath: '.agentdb/mobile.db',
  quantizationType: 'binary', // Aggressive compression
  cacheSize: 500, // Smaller cache
  deployment: 'mobile'
};
```

## Performance Impact

### Memory Usage Example (100K vectors, 768 dimensions)

| Type | Memory | vs None | vs Scalar |
|------|--------|---------|-----------|
| **none** | 293 MB | - | - |
| **scalar** | 73 MB | ↓ 75% | - |
| **binary** | 9 MB | ↓ 97% | ↓ 88% |
| **product** | 5 MB | ↓ 98% | ↓ 93% |

### Search Speed Example (1M vectors)

| Type | Search Time | Improvement |
|------|-------------|-------------|
| **none** | 100s | Baseline |
| **scalar** | 33s | 3x faster |
| **binary** | 10s | 10x faster |
| **product** | 20s | 5x faster |

### Accuracy Impact

| Type | Typical Accuracy | Use Case |
|------|------------------|----------|
| **none** | 100% | Critical accuracy needs |
| **scalar** | 98-99% | Production applications |
| **binary** | 95-98% | Mobile/edge deployment |
| **product** | 93-97% | Large-scale search |

## Programmatic API

### QuantizationManager

```typescript
import { QuantizationManager, type AgentProfile } from '@/core/quantization';

// Get recommendation
const profile: AgentProfile = {
  vectorCount: 50000,
  memoryConstraint: 'medium',
  accuracyPriority: 'high',
  speedPriority: 'medium',
  deployment: 'cloud'
};

const recommendation = QuantizationManager.getRecommendation(profile);
console.log('Recommended:', recommendation.type);
console.log('Reason:', recommendation.reason);

// Calculate memory usage
const usage = QuantizationManager.calculateMemoryUsage(
  50000,  // vectors
  768,    // dimensions
  'scalar' // type
);

console.log(`Memory: ${usage.totalMB} MB`);
console.log(`Reduction: ${usage.reduction}`);

// Compare options
const comparison = QuantizationManager.compareQuantizationTypes(50000, 768);
comparison.forEach(item => {
  console.log(`${item.type}: ${item.memoryMB} MB, ${item.reduction}`);
});

// Record metrics (for monitoring)
QuantizationManager.recordMetrics('agent-1', {
  type: 'scalar',
  memoryReduction: 4,
  estimatedAccuracyLoss: 1.5,
  searchSpeedIncrease: 3,
  memoryUsageMB: 73.2,
  vectorCount: 100000,
  timestamp: new Date()
});

// Get aggregated metrics
const aggregated = QuantizationManager.getAggregatedMetrics();
console.log(`Total Vectors: ${aggregated.totalVectors}`);
console.log(`Total Memory: ${aggregated.totalMemoryMB} MB`);
console.log(`Average Reduction: ${aggregated.averageMemoryReduction}x`);

// Generate report
const report = QuantizationManager.generateReport();
console.log(report);
```

## Best Practices

### 1. Start with Scalar (Recommended)

```typescript
// Default to scalar for most use cases
const config = {
  quantizationType: 'scalar' // Safe, balanced default
};
```

### 2. Profile Before Optimizing

```bash
# Understand your usage before changing
aqe quantization recommend \
  --vectors $(estimate-your-vectors) \
  --deployment cloud
```

### 3. Test Accuracy Impact

```typescript
// Always benchmark accuracy before production
const testResults = {
  none: 99.8,    // Baseline
  scalar: 98.5,  // -1.3% (acceptable)
  binary: 95.2   // -4.6% (evaluate if acceptable)
};
```

### 4. Monitor in Production

```typescript
// Record metrics for each agent
QuantizationManager.recordMetrics(agentId, {
  type: 'scalar',
  vectorCount: agent.getVectorCount(),
  memoryUsageMB: agent.getMemoryUsage(),
  // ... other metrics
});

// Regularly review
const report = QuantizationManager.generateReport();
```

### 5. Optimize Per-Agent

```typescript
// Different agents can use different quantization
const criticalAgent = { quantizationType: 'none' };
const bulkAgent = { quantizationType: 'binary' };
const balancedAgent = { quantizationType: 'scalar' };
```

## Troubleshooting

### Issue: High memory usage despite quantization

**Solution:** Check if quantization is actually enabled:

```bash
aqe quantization status

# If showing "None (Full Precision): 10 agents"
# Then quantization is not enabled
```

**Fix:** Explicitly set quantization type:

```typescript
const config = {
  quantizationType: 'scalar' // Explicit
};
```

### Issue: Accuracy loss too high

**Solution:** Use lighter quantization:

```typescript
// Change from binary → scalar
const config = {
  quantizationType: 'scalar' // Instead of 'binary'
};
```

### Issue: Slow search performance

**Solution:** Increase quantization or cache:

```typescript
const config = {
  quantizationType: 'binary', // More aggressive
  cacheSize: 5000 // Larger cache
};
```

## Learn More

- **AgentDB Optimization Skill:** `.claude/skills/agentdb-optimization/SKILL.md`
- **Performance Benchmarks:** `tests/benchmarks/agentdb-performance.test.ts`
- **CLI Reference:** `aqe quantization guide`

---

**Generated by:** Agentic QE Fleet v1.2.0
**Last Updated:** 2025-10-23
