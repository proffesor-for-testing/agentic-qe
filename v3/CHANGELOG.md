# Changelog

All notable changes to Agentic QE will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.3.1] - 2026-01-25

### 🎯 Highlights

**GOAP Quality Remediation Complete** - Comprehensive 6-phase quality improvement achieving production-ready status. Quality score improved from 37 to 82 (+121%), cyclomatic complexity reduced by 52%, and 527 tests now passing with 80%+ coverage.

### Added

#### Quality Metrics Improvement
| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Quality Score | 37/100 | 82/100 | +121% |
| Cyclomatic Complexity | 41.91 | <20 | -52% |
| Maintainability Index | 20.13 | 88/100 | +337% |
| Test Coverage | 70% | 80%+ | +14% |
| Security False Positives | 20 | 0 | -100% |

#### New Modules (Extract Method + Strategy Pattern)
- **score-calculator.ts** - Extracted complexity score calculations
- **tier-recommender.ts** - Extracted model tier recommendation logic
- **validators/** - Security validation using Strategy Pattern:
  - `path-traversal-validator.ts` - Directory traversal prevention
  - `regex-safety-validator.ts` - ReDoS attack prevention
  - `command-validator.ts` - Shell injection prevention
  - `input-sanitizer.ts` - General input sanitization
  - `crypto-validator.ts` - Cryptographic input validation
  - `validation-orchestrator.ts` - Orchestrates all validators

#### CLI Commands Modularization
- Extracted standalone command modules: `code.ts`, `coverage.ts`, `fleet.ts`, `security.ts`, `test.ts`, `quality.ts`, `migrate.ts`, `completions.ts`
- Added `command-registry.ts` for centralized command management
- Improved CLI handlers organization

#### Test Generation Improvements
- **coherence-gate-service.ts** - Service layer for coherence verification
- **property-test-generator.ts** - Property-based testing support
- **tdd-generator.ts** - TDD-specific test generation
- **test-data-generator.ts** - Test data factory patterns
- Factory pattern implementation in `factories/`
- Interface segregation in `interfaces/`

#### 527 New Tests (Phase 4)
- `score-calculator.test.ts` - 109 tests for complexity scoring
- `tier-recommender.test.ts` - 86 tests for tier selection
- `validation-orchestrator.test.ts` - 136 tests for security validators
- `coherence-gate-service.test.ts` - 56 tests for coherence service
- `complexity-analyzer.test.ts` - 89 tests for signal collection
- `test-generator-di.test.ts` - 11 tests for dependency injection
- `test-generator-factory.test.ts` - 40 tests for factory patterns

#### Cloud Sync Feature
- **feat(sync)**: Cloud sync to ruvector-postgres backend
- Incremental and full sync modes
- Sync status and verification commands

### Changed

- **complexity-analyzer.ts** - Refactored from 656 to ~200 lines using Extract Method
- **cve-prevention.ts** - Refactored from 823 to ~300 lines using Strategy Pattern
- **test-generator.ts** - Refactored to use dependency injection
- **Wizard files** - Standardized using Command Pattern
- All domains now follow consistent code organization standards

### Fixed

- **fix(coherence)**: Resolve WASM SpectralEngine binding and add defensive null checks
- **fix(init)**: Preserve config.yaml customizations on reinstall
- **fix(security)**: Implement SEC-001 input validation and sanitization
- **fix(ux)**: Resolve issue #205 regression - fresh install shows 'idle' not 'degraded'
- Security scanner false positives eliminated via `.gitleaks.toml` and `security-scan.config.json`
- Defect-prone files remediated with comprehensive test coverage

### Security

- Resolved 20 false positive AWS secret detections in wizard files
- CodeQL incomplete-sanitization alerts #116-121 fixed
- Shell argument backslash escaping (CodeQL #117)

### Documentation

- `CODE-ORGANIZATION-STANDARDIZATION.md` - Domain structure guidelines
- `DOMAIN-STRUCTURE-GUIDE.md` - DDD implementation guide
- `JSDOC-TEMPLATES.md` - 15 JSDoc documentation templates
- `quality-remediation-final.md` - Complete remediation report
- `phase3-verification-report.md` - Maintainability improvements

---

## [3.3.0] - 2026-01-24

### 🎯 Highlights

**Mathematical Coherence Verification** - ADR-052 introduces Prime Radiant WASM engines for mathematically-proven coherence checking. This is a major quality improvement that prevents contradictory test generation, detects swarm drift 10x faster, and provides formal verification for multi-agent decisions.

### Added

#### Coherence-Gated Quality Engineering (ADR-052)
- **CoherenceService** with 6 Prime Radiant WASM engines:
  - CohomologyEngine - Sheaf cohomology for contradiction detection
  - SpectralEngine - Spectral analysis for swarm collapse prediction
  - CausalEngine - Causal inference for spurious correlation detection
  - CategoryEngine - Category theory for type verification
  - HomotopyEngine - Homotopy type theory for formal verification
  - WitnessEngine - Blake3 witness chain for audit trails

- **Compute Lanes** - Automatic routing based on coherence energy:
  | Lane | Energy | Latency | Action |
  |------|--------|---------|--------|
  | Reflex | < 0.1 | <1ms | Immediate execution |
  | Retrieval | 0.1-0.4 | ~10ms | Fetch additional context |
  | Heavy | 0.4-0.7 | ~100ms | Deep analysis |
  | Human | > 0.7 | Async | Queen escalation |

- **ThresholdTuner** - Auto-calibrating energy thresholds with EMA
- **BeliefReconciler** - Contradiction resolution with 5 strategies (latest, authority, consensus, merge, escalate)
- **MemoryAuditor** - Background coherence auditing for QE patterns
- **CausalVerifier** - Intervention-based causal link verification
- **Test Generation Coherence Gate** - Block incoherent requirements before test generation

#### 4 New MCP Tools
- `qe/coherence/check` - Check coherence of beliefs/facts
- `qe/coherence/audit` - Audit QE memory for contradictions
- `qe/coherence/consensus` - Verify multi-agent consensus mathematically
- `qe/coherence/collapse` - Predict swarm collapse risk

#### CI/CD Integration
- GitHub Actions workflow for coherence verification
- Shields.io badge generation (verified/fallback/violation)
- Automatic coherence checks on PR

### Changed

- **Strange Loop Integration** - Now includes coherence verification in self-awareness cycle
- **QEReasoningBank** - Pattern promotion now requires coherence gate approval
- **WASM Loader** - Enhanced with full fallback support and retry logic

### Fixed

- Fresh install UX now shows 'idle' status instead of alarming warnings
- ESM/CommonJS interop issue with hnswlib-node resolved
- Visual-accessibility workflow actions properly registered with orchestrator
- **DevPod/Codespaces OOM crash** - Test suite now uses forks pool with process isolation
  - Prevents HNSW native module segfaults from concurrent access
  - Limits to 2 parallel workers (was unlimited)
  - Added `npm run test:safe` script with 1.5GB heap limit

### Performance

Benchmark results (ADR-052 targets met):
- 10 nodes: **0.3ms** (target: <1ms) ✅
- 100 nodes: **3.2ms** (target: <5ms) ✅
- 1000 nodes: **32ms** (target: <50ms) ✅
- Memory overhead: **<10MB** ✅
- Concurrent checks: **865 ops/sec** (10 parallel)

---

## [3.2.3] - 2026-01-23

### Added

- EN 301 549 EU accessibility compliance mapping
- Phase 4 Self-Learning Features with brutal honesty fixes
- Experience capture integration tests

### Fixed

- CodeQL security alerts #69, #70, #71, #74
- All vulnerabilities from security audit #202
- Real HNSW implementation in ExperienceReplay for O(log n) search

### Security

- Resolved lodash security vulnerability
- Fixed potential prototype pollution issues

---

## [3.2.0] - 2026-01-21

### Added

- Agentic-Flow deep integration (ADR-051)
- Agent Booster for instant transforms
- Model Router with 3-tier optimization
- ONNX Embeddings for fast vector generation

### Performance

- 100% success rate on AgentBooster operations
- Model routing: 0.05ms average latency
- Embeddings: 0.57ms average generation time

---

## User Benefits

### For Test Generation
```typescript
// Before v3.3.0: Tests could be generated from contradictory requirements
const tests = await generator.generate(conflictingSpecs); // No warning!

// After v3.3.0: Coherence check prevents bad tests
const tests = await generator.generate(specs);
// Throws: "Requirements contain unresolvable contradictions"
// Returns: coherence.contradictions with specific conflicts
```

### For Multi-Agent Coordination
```typescript
// Mathematically verify consensus instead of simple majority
const consensus = await coherenceService.verifyConsensus(votes);

if (consensus.isFalseConsensus) {
  // Fiedler value < 0.05 indicates weak connectivity
  // Spawn independent reviewer to break false agreement
}
```

### For Memory Quality
```typescript
// Audit QE patterns for contradictions
const audit = await memoryAuditor.auditPatterns(patterns);

// Get hotspots (high-energy domains with conflicts)
audit.hotspots.forEach(h => {
  console.log(`${h.domain}: energy=${h.energy}, patterns=${h.patternIds}`);
});
```

### For Swarm Health
```typescript
// Predict collapse before it happens
const risk = await coherenceService.predictCollapse(swarmState);

if (risk.probability > 0.5) {
  // Weak vertices identified - take preventive action
  await strangeLoop.reinforceConnections(risk.weakVertices);
}
```

---

[3.3.0]: https://github.com/anthropics/agentic-qe/compare/v3.2.3...v3.3.0
[3.2.3]: https://github.com/anthropics/agentic-qe/compare/v3.2.0...v3.2.3
[3.2.0]: https://github.com/anthropics/agentic-qe/releases/tag/v3.2.0
