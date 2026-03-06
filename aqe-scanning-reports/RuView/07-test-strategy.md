# RuView Test Strategy (Rust Codebase)

**Date**: 2026-03-06
**Version**: 1.0
**Prepared by**: AQE Queen Swarm
**Scope**: Rust port only (15 workspace crates + 65 WASM edge modules + ESP32 C firmware)

---

## 1. Context & Scope

### 1.1 Product Context
RuView is a privacy-first WiFi sensing system that estimates human pose, detects vital signs (breathing 6-30 BPM, heartbeat 40-120 BPM), and performs through-wall presence detection using WiFi CSI signals. It makes **life-safety claims** including disaster survivor detection (WiFi-Mat), fall alerts, and cardiac arrhythmia monitoring.

### 1.2 Technical Context
- **Rust workspace**: 15 crates, ~122K LOC, ~2,195 tests
- **WASM edge modules**: 65 no_std modules targeting ESP32, 609 tests
- **ESP32 firmware**: C, ~200K lines across 30 files
- **Infrastructure**: Axum REST/WebSocket server, PostgreSQL/SQLite/Redis, Docker multi-arch
- **Key dependencies**: ndarray, tch (PyTorch), ort (ONNX), candle, axum, sqlx

### 1.3 Crate Architecture

| Layer | Crates | Risk Level |
|-------|--------|------------|
| **Foundation** | core, vitals, wifiscan, hardware, config, db | Medium |
| **Processing** | signal (+ ruvsense modules), nn, ruvector | HIGH -- safety-critical math |
| **Application** | train, mat (WiFi-Mat disaster), wasm, wasm-edge | HIGH -- life-safety claims |
| **Deployment** | api, sensing-server, cli | HIGH -- attack surface |

### 1.4 Risk Profile
**Overall: HIGH** -- Life-safety claims + 7 CRITICAL security vulnerabilities + unverified performance claims + untestable sensing-server monolith.

---

## 2. Strategy Principles

1. **Safety-first**: Vital signs, WiFi-Mat triage, and fall detection require the highest rigor -- verified against reference data, tested for false negatives, regression-guarded
2. **Measure, don't claim**: Establish real criterion benchmarks before publishing throughput numbers
3. **Security as a first-class citizen**: Security tests in CI alongside functional tests; no deployment without clean scan
4. **Test at the right level**: Unit tests for math correctness, integration tests for crate boundaries, E2E for pipeline accuracy
5. **Fuzz the boundaries**: Every parser (CSI frames, UDP packets, WebSocket messages, WASM modules) gets cargo-fuzz targets

---

## 3. Test Levels

### 3.1 Unit Tests (Target: 90% module coverage)

**Current state**: 95% of Rust modules have inline `#[cfg(test)]` tests. 12 source files remain untested.

**Strategy**:
- Maintain inline `#[cfg(test)]` pattern (already well-established)
- Add **property-based tests** (proptest) for signal processing: CSI parsing, FFT, bandpass filtering, phase alignment
- Add tests for 12 untested source files, prioritized by risk
- **Math verification**: Signal processing functions tested against known reference outputs (not just "doesn't panic")
- **Boundary focus**: NaN/Inf propagation, empty arrays, maximum subcarrier counts, zero-length signals

### 3.2 Integration Tests (Target: All crate boundaries covered)

**Strategy**:
- **Cross-crate pipeline tests**: signal -> nn -> mat pipeline with fixture CSI data
- **Database integration**: sqlx tests against SQLite in-memory (test actual queries, not mocks)
- **Hardware abstraction**: Test ESP32 aggregator with recorded real CSI data fixtures
- **WASM edge integration**: Test module loading, frame processing, and result collection in a host harness
- **API contract tests**: Every Axum REST endpoint and WebSocket message type has schema validation

### 3.3 End-to-End Tests (Target: Critical sensing pipelines)

**Strategy**:
- **Docker-based E2E**: Full sensing-server in container, exercise REST + WebSocket, verify output
- **CSI-to-pose pipeline**: Recorded CSI data -> full pipeline -> verify keypoints within tolerance
- **Vital signs pipeline**: Reference signals at known BPM -> detection -> verify accuracy
- **Multi-person scenario**: 3-person simulation, verify identity tracking over 5-minute window
- **WiFi-Mat triage**: Synthetic disaster scenario -> verify START triage classification

### 3.4 Performance Tests (Target: Measured baselines, not claims)

**Current state**: No criterion benchmarks exist. 54K fps claim is unverified.

**Strategy**:
- **criterion benchmarks** for hot paths: CSI frame parsing, FFT, correlation matrix, pose estimation, vital sign detection
- **Throughput measurement**: Frames processed per second under realistic workload
- **Latency profiling**: End-to-end from CSI input to pose output
- **Memory profiling**: Long-running session over 1 hour (detect leaks, unbounded growth)
- **Regression gate**: CI fails if criterion benchmark regresses by >10%

### 3.5 Security Tests (Target: All CRITICAL/HIGH findings covered)

**Current state**: Zero security tests exist.

**Strategy**:
- **Authentication**: WebSocket auth enforcement, token validation, unauthenticated request rejection
- **Firmware**: OTA endpoint authentication (once fixed), TDM HMAC verification (once fixed)
- **Input fuzzing**: cargo-fuzz targets for CSI frame parsers, UDP packet handlers, WebSocket message parsers, WASM module loaders
- **WASM safety**: Module signature verification, memory isolation, stack overflow protection
- **Network**: Rate limiting, CORS validation, oversized payload rejection
- **Dependency scanning**: `cargo-audit` + `cargo-deny` in CI

### 3.6 Fuzz Testing (Target: All parsers and protocol handlers)

**Strategy**:
- **CSI frame parser** (signal crate) -- malformed frames, truncated data, invalid subcarrier counts
- **UDP packet handler** (sensing-server) -- corrupt packets, oversized payloads, fragmentation
- **WebSocket message parser** -- invalid JSON, binary injection, oversized messages
- **WASM module loader** -- malformed WASM, missing exports, excessive memory requests
- **TDM protocol parser** (hardware crate) -- timing attacks, replay, malformed headers
- Run in nightly CI with 10-minute budget per target

---

## 4. Test Types by Risk Area

| Risk Area | Unit | Integration | E2E | Perf | Security | Fuzz | Exploratory |
|-----------|------|-------------|-----|------|----------|------|-------------|
| Signal processing (ruvsense) | HIGH | Medium | High | High | - | High | High |
| Vital sign detection (vitals) | HIGH | High | High | Medium | - | Medium | High |
| WiFi-Mat triage (mat) | HIGH | High | High | - | - | - | High |
| Sensing server (sensing-server) | Medium | High | High | High | High | High | Medium |
| ESP32 firmware | Medium | High | Medium | Medium | HIGH | Medium | High |
| WASM edge modules | HIGH | Medium | Low | Medium | High | High | Medium |
| Database layer (db) | High | High | Low | Medium | Medium | - | Low |
| Neural network inference (nn) | High | Medium | Medium | High | - | - | Medium |
| Hardware abstraction (hardware) | Medium | High | Medium | - | High | Medium | High |
| REST API (api) | Medium | High | High | High | High | Medium | Medium |

---

## 5. Test Environment Strategy

| Environment | Purpose | Infrastructure |
|-------------|---------|----------------|
| **Dev** | Unit + fast integration | `cargo test --workspace --no-default-features` |
| **CI** | Full regression | GitHub Actions, Docker, recorded CSI fixtures |
| **Fuzz** | Continuous fuzzing | Nightly CI, cargo-fuzz with libFuzzer |
| **Benchmark** | Performance baselines | Dedicated machine (consistent results), criterion |
| **Hardware-in-loop** | ESP32 integration | Physical ESP32 mesh + WiFi AP (optional) |
| **Staging** | E2E + security | Docker Compose full stack |

---

## 6. Test Data Strategy

| Data Type | Source | Management |
|-----------|--------|------------|
| **CSI reference frames** | Synthetic (seed=42), SHA-256 verified | Version-controlled in tests/fixtures/ |
| **Real CSI recordings** | Captured from ESP32 mesh | Anonymized, stored in test fixtures |
| **Vital sign reference** | Synthesized at known BPM (breathing: 6,12,18,24,30; heart: 60,80,100,120) | Deterministic seed, generated by test |
| **Edge cases** | NaN frames, empty arrays, max subcarrier counts, corrupt UDP | Hand-crafted fixtures |
| **Fuzz corpus** | Seed from real data, evolved by fuzzer | Stored in fuzz/corpus/ per target |
| **Benchmark inputs** | Standardized frame batches (1, 10, 100, 1000 frames) | Criterion benchmark fixtures |

---

## 7. Tool Stack

| Category | Tool | Notes |
|----------|------|-------|
| Unit/Integration | `cargo test` | Inline #[cfg(test)] modules |
| Property-based | proptest | Signal processing, CSI parsing |
| Benchmarking | criterion | Hot path measurement |
| Coverage | cargo-tarpaulin / cargo-llvm-cov | 90% module target |
| Security deps | cargo-audit, cargo-deny | CI-integrated |
| Fuzzing | cargo-fuzz (libFuzzer) | All parsers and protocol handlers |
| Mutation | cargo-mutants | Test suite effectiveness |
| Linting | clippy (pedantic), rustfmt | CI-enforced |
| Load testing | k6 | REST + WebSocket endpoints |
| E2E | Docker Compose + custom harness | Full stack validation |
| WASM testing | wasmtime test harness | Edge module validation |

---

## 8. CI Pipeline

```
PR Pipeline (~5 min):
  ├── clippy --all-targets -- -D warnings ...... ~1min
  ├── cargo test --workspace --no-default-features ~2min
  ├── cargo-audit ............................. ~15s
  ├── cargo-deny check ........................ ~15s
  ├── coverage check (>= 90% module) ......... ~2min
  └── WASM edge tests (wasm32 target) ......... ~1min

Nightly Pipeline (~30 min):
  ├── Docker E2E (full sensing-server) ........ ~10min
  ├── criterion benchmarks + regression check . ~5min
  ├── cargo-fuzz (10 min budget per target) ... ~10min
  ├── cargo-mutants (sample) .................. ~10min
  └── 1-hour stability test ................... ~60min (separate job)
```

---

## 9. Quality Gates

| Gate | Criteria | Enforcement |
|------|----------|-------------|
| **PR Merge** | All tests pass, coverage >= 90% modules, no clippy warnings, cargo-audit clean | CI required checks |
| **Release Candidate** | E2E pass, benchmarks within 10% of baseline, witness bundle generated, fuzz clean | Manual + CI |
| **Production** | All RC gates + security review of changes + Docker smoke test | Team sign-off |

---

## 10. Risk Mitigation

| Risk | Mitigation | Owner |
|------|------------|-------|
| Life-safety claims unverified | Establish reference-data validation for vital signs and WiFi-Mat | QE Lead |
| 54K fps unsubstantiated | criterion benchmarks with published measured numbers | Performance Lead |
| 7 CRITICAL security vulns | Sprint 1 security fixes + regression tests | Security Champion |
| sensing-server untestable monolith | Decompose main.rs into ~14 modules | Dev Team |
| WASM edge excluded from workspace tests | Separate WASM CI job with wasmtime harness | QE Lead |
| ESP32 long-run stability unknown | 24-hour soak test with real hardware | Hardware Team |
