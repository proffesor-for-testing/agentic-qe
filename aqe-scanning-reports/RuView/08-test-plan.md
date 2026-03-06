# RuView Test Plan (Rust Codebase)

**Date**: 2026-03-06
**Version**: 1.0
**Prepared by**: AQE Queen Swarm
**Scope**: Rust port only (15 workspace crates + 65 WASM edge modules + ESP32 firmware)

---

## 1. Objectives

1. Verify signal processing pipeline produces accurate, reliable results against reference data
2. Validate life-safety claims (vital signs, WiFi-Mat triage, fall detection) with measured accuracy thresholds
3. Close all 7 CRITICAL security vulnerabilities with regression tests
4. Establish real performance baselines (criterion benchmarks) replacing the unsubstantiated 54K fps claim
5. Validate ESP32 firmware stability and data integrity over extended operation
6. Decompose and test the sensing-server monolith

---

## 2. Scope

### In Scope

| Component | Crates/Location | Test Types |
|-----------|----------------|------------|
| Signal processing | signal (+ ruvsense), ruvector | Unit, Property, Benchmark, Fuzz |
| Vital signs | vitals | Unit, Integration, Reference-data |
| Neural network | nn | Unit, Benchmark |
| WiFi-Mat disaster | mat | Unit, Integration, E2E |
| Sensing server | sensing-server | Integration, E2E, Load, Security |
| WASM edge | wasm-edge (65 modules) | Unit, Memory safety, Security |
| Hardware | hardware | Integration, Fuzz |
| ESP32 firmware | firmware/ | Integration, Stability, Security |
| REST API | api | Contract, Load, Security |
| Database | db | Integration |
| CLI | cli | Smoke |
| Docker | docker/ | Build, E2E |

### Out of Scope
- Python v1 (legacy, not maintained)
- Formal medical device certification
- Full external penetration test (recommend engaging a firm)
- Multi-building field trials

---

## 3. Test Phases

### Phase 1: Security Hardening (Weeks 1-2)

**Goal**: Fix and regression-test all 7 CRITICAL security vulnerabilities.

| ID | Task | Finding | Effort |
|----|------|---------|--------|
| P1.1 | Test: OTA endpoint requires authentication after fix | SEC-026 (CVSS 10.0) | 1d |
| P1.2 | Test: TDM HMAC uses real HMAC-SHA256 after fix | SEC-004 | 0.5d |
| P1.3 | Test: WebSocket sensing server requires auth token | SEC-002 (CVSS 9.1) | 1d |
| P1.4 | Test: WASM module loading requires valid signature | SEC-005 | 1d |
| P1.5 | Test: Hardcoded TDM key replaced with configurable secret | SEC-022 | 0.5d |
| P1.6 | Test: Auth cannot be disabled without explicit override flag | SEC-001 (CVSS 9.8) | 0.5d |
| P1.7 | Add cargo-audit + cargo-deny to CI | - | 0.5d |
| P1.8 | Fuzz: CSI frame parser (cargo-fuzz target) | - | 1d |
| P1.9 | Fuzz: UDP packet handler | - | 0.5d |
| P1.10 | Fuzz: WebSocket message parser | - | 0.5d |

**Exit criteria**: All 7 CRITICAL findings have regression tests; fuzz targets in nightly CI; cargo-audit clean.

### Phase 2: Testability & Measurement (Weeks 2-4)

**Goal**: Make sensing-server testable, establish performance baselines.

| ID | Task | Effort |
|----|------|--------|
| P2.1 | Criterion benchmark: CSI frame parsing throughput | 1d |
| P2.2 | Criterion benchmark: FFT + bandpass filter pipeline | 0.5d |
| P2.3 | Criterion benchmark: Correlation matrix computation | 0.5d |
| P2.4 | Criterion benchmark: Vital sign detection (breathing + heartbeat) | 1d |
| P2.5 | Criterion benchmark: Pose estimation inference | 1d |
| P2.6 | Criterion benchmark: Full CSI-to-pose pipeline | 0.5d |
| P2.7 | WebSocket load test: 10/50/100 concurrent clients (k6) | 1.5d |
| P2.8 | REST API throughput benchmark (k6) | 1d |
| P2.9 | Memory profiling: 1-hour continuous processing soak test | 1d |
| P2.10 | Add benchmark regression gate to CI (>10% = fail) | 0.5d |
| P2.11 | Tests for sensing-server after decomposition (integration per module) | 2d |

**Exit criteria**: Measured throughput numbers for all hot paths; baselines recorded; regression gate in CI; sensing-server modules individually testable.

### Phase 3: Functional Verification (Weeks 4-6)

**Goal**: Verify core claims with reference data and edge case testing.

| ID | Task | Effort |
|----|------|--------|
| P3.1 | Vital sign accuracy: reference signals at known BPM -> verify detection | 2d |
| P3.2 | Vital sign false-negative rate: signals at boundary BPM (6, 30, 40, 120) | 1d |
| P3.3 | WiFi-Mat START triage: synthetic scenarios -> verify classification | 1.5d |
| P3.4 | Multi-person tracking: 3-person simulation, verify no identity swaps over 5 min | 1.5d |
| P3.5 | Through-wall signal degradation: attenuation models -> verify detection | 1d |
| P3.6 | NaN/Inf propagation: inject NaN at each pipeline stage, verify handled | 1d |
| P3.7 | Property-based tests (proptest): signal processing invariants | 2d |
| P3.8 | WASM edge module: all 65 modules process valid frames without panic | 1d |
| P3.9 | WASM edge module: memory budget compliance under stress | 1d |
| P3.10 | Cross-crate integration: signal -> nn -> mat full pipeline | 1d |
| P3.11 | Fix O(n^2) autocorrelation, verify with benchmark improvement | 1d |

**Exit criteria**: Vital signs verified against reference data; triage classification tested; NaN propagation handled; property tests passing.

### Phase 4: Operational Readiness (Weeks 6-8)

**Goal**: E2E validation, stability, and exploratory testing.

| ID | Task | Effort |
|----|------|--------|
| P4.1 | Docker Compose E2E: full sensing-server, exercise API + WebSocket | 2d |
| P4.2 | ESP32 firmware 24-hour soak test (continuous CSI capture) | 1d |
| P4.3 | Configuration validation: all env vars, invalid combinations | 1d |
| P4.4 | Health check endpoint: all degraded state responses | 0.5d |
| P4.5 | Concurrency: race conditions in multi-client WebSocket | 1d |
| P4.6 | Disaster recovery: system restart after crash mid-session | 1d |
| P4.7 | Document all 324 unsafe blocks with `# Safety` comments | 2d |
| P4.8 | Mutation testing (cargo-mutants) on signal + vitals crates | 1d |
| P4.9 | Exploratory testing sessions (see 09-exploratory-charters.md) | 5d |
| P4.10 | Final quality report with go/no-go recommendation | 1d |

**Exit criteria**: E2E passing in Docker; soak test clean; unsafe documented; exploratory sessions complete; quality report delivered.

---

## 4. Estimation Summary

| Phase | Duration | Effort | Key Deliverable |
|-------|----------|--------|-----------------|
| Phase 1: Security | 2 weeks | 7.5 days | Security regression tests + fuzz targets |
| Phase 2: Measurement | 2 weeks | 10.5 days | Criterion benchmarks + measured baselines |
| Phase 3: Functional | 2 weeks | 14 days | Reference-data verified vital signs + triage |
| Phase 4: Operational | 2 weeks | 15.5 days | E2E + soak test + exploratory + go/no-go |
| **Total** | **~8 weeks** | **~47.5 days** | Production-ready quality assurance |

---

## 5. Entry & Exit Criteria

### Phase Entry
- Previous phase exit criteria met (or risk explicitly accepted)
- Required security fixes committed (Phase 1)
- Sensing-server decomposition complete (Phase 2)
- Test environment available and verified

### Final Exit (Phase 4 complete)
- [ ] All 7 CRITICAL security findings fixed and regression-tested
- [ ] cargo-audit + cargo-deny clean
- [ ] Criterion benchmarks for all hot paths with measured baselines
- [ ] 54K fps claim verified or replaced with measured number
- [ ] Vital sign detection accuracy verified against reference signals
- [ ] WiFi-Mat triage classification verified
- [ ] No NaN/Inf propagation through signal pipeline
- [ ] 95%+ module test coverage
- [ ] E2E passing in Docker
- [ ] 24-hour ESP32 soak test clean
- [ ] All 324 unsafe blocks documented
- [ ] Exploratory testing charters completed
- [ ] Go/no-go report delivered

---

## 6. Risks to the Plan

| Risk | Impact | Mitigation |
|------|--------|------------|
| No ESP32 hardware | Phase 4 soak test blocked | Use recorded CSI data; defer hardware test to future sprint |
| Security fixes take longer | Phase 1 delayed | Write tests against current broken code to document behavior |
| sensing-server decomposition complex | Phase 2 blocked | Test at HTTP level first; decompose incrementally |
| 54K fps is physically impossible | Must retract claim | Measure honestly, publish real number |
| Codebase changes during testing | Maintenance overhead | Tests in CI per-PR; coordinate branching |

---

## 7. Deliverables

| Deliverable | Phase | Format |
|-------------|-------|--------|
| Security regression test suite | Phase 1 | Rust tests + cargo-fuzz targets |
| Criterion benchmark suite | Phase 2 | Rust benchmarks |
| Measured performance baselines document | Phase 2 | Markdown report |
| Vital sign accuracy verification report | Phase 3 | Document (measured vs claimed) |
| WiFi-Mat triage test suite | Phase 3 | Rust tests |
| Docker E2E test harness | Phase 4 | Docker Compose + scripts |
| Exploratory testing session notes | Phase 4 | Per-charter documents |
| Final quality report (go/no-go) | Phase 4 | Document |
