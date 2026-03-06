# RuView Quality Engineering Analysis -- Executive Summary

**Date**: 2026-03-06
**Analyzed by**: AQE Queen Swarm (6 specialist agents)
**Project**: RuView -- WiFi-based Human Pose Estimation & Vital Sign Monitoring
**Repository**: https://github.com/ruvnet/RuView
**Scope**: Rust codebase only (15 workspace crates + 65 WASM edge modules + ESP32 firmware)

> **Note**: Python v1 (`v1/`) is a legacy codebase and excluded from this analysis. All findings, recommendations, and test plans target the Rust port only.

---

## Overall Assessment

| Dimension | Grade | Verdict |
|-----------|-------|---------|
| Code Quality & Architecture | **B+** | Excellent DDD, critical monolith in sensing-server |
| Security | **F** | 7 CRITICAL findings -- NOT production-ready |
| Performance | **C+** | 54K fps claim unsubstantiated; no real benchmarks |
| Test Quality | **B-** | ~2,195 Rust tests, 95% modules covered, but critical gaps |
| Product Maturity | **B-** | 48 ADRs, 8 DDD models, life-safety claims unverified |
| Developer Experience | **A-** | Comprehensive docs, Docker quickstart, clear crate graph |

**Overall Risk Rating: HIGH** -- Life-safety claims (disaster survivor detection, vital signs, fall alerts) require rigorous verification that is currently absent.

---

## Top 10 Critical Findings

| # | Finding | Source | Severity |
|---|---------|--------|----------|
| 1 | **Unauthenticated OTA firmware endpoint** -- anyone on the network can reflash ESP32 devices | Security | CRITICAL |
| 2 | **Fake HMAC in secure_tdm.rs** -- XOR fold with hardcoded key, zero crypto protection | Security | CRITICAL |
| 3 | **Sensing WebSocket server has zero authentication** -- any client can connect and receive real-time pose data | Security | CRITICAL |
| 4 | **WASM upload without mandatory signatures** -- unsigned modules can be loaded on ESP32 edge | Security | CRITICAL |
| 5 | **sensing-server/main.rs is 3,741 lines** with CC=65 in main() -- untestable monolith with 37-field god object | Complexity | CRITICAL |
| 6 | **54K fps claim has no supporting benchmark** -- no criterion benchmarks, no measured baselines | Performance | CRITICAL |
| 7 | **Zero security tests in Rust codebase** -- no auth bypass, injection, or protocol tampering tests | Test Quality | CRITICAL |
| 8 | **Vital sign false-negative risk** -- breathing/heartbeat detection accuracy unverified under real conditions; missed survivor = missed rescue | Product | HIGH |
| 9 | **324 unsafe usages across 65 files** with undocumented `# Safety` contracts (mostly WASM edge FFI) | Code Quality | HIGH |
| 10 | **O(n^2) autocorrelation in heart rate detection** -- brute-force lag calculation instead of FFT-based approach | Performance | HIGH |

---

## Findings by Report

### Report 01: Code Complexity & Smells
- **Maintainability Index: 48/100** (below 65 threshold)
- Worst hotspot: `sensing-server/main.rs` -- 3,741 lines, CC=65, 37-field `AppStateInner` god object
- 4 copy-pasted tick-processing pipelines (~400 lines of duplication)
- 22 Rust files exceed the 500-line project limit
- `adaptive_classifier.rs` CC=39, `lrn_dtw_gesture_learn.rs` CC=26
- WebSocket handlers reach nesting depth 10 through nested `select!`/`match`/`if let`
- Signal processing crate (ruvsense) is well-architected -- mathematically sound Kalman filter, Welford statistics, field model

### Report 02: Security Analysis
- **47 findings** (7 Critical, 12 High, 16 Medium, 8 Low)
- **Not production-ready** for any environment where safety, privacy, or network integrity matter
- Firmware layer is the most severe cluster: unauthenticated OTA (CVSS 10.0), fake HMAC, hardcoded TDM key
- Sensing WebSocket has zero auth (CVSS 9.1)
- 65 WASM edge modules use `static mut` patterns
- No data retention controls for human sensing data (breathing, heartbeat, pose)
- Docker runs as root, no resource limits

### Report 03: Performance Analysis
- **32 findings** (1 Critical, 8 High, 12 Medium, 8 Low)
- O(n^2) autocorrelation in heart rate detection (vitals crate)
- Excessive `Array2` cloning in signal processing pipeline
- O(n) Vec shifts in vital signs sliding windows
- `FftPlanner` recreated per call instead of cached
- Sequential batch inference in neural network crate
- No criterion benchmarks exist -- 54K fps claim is unverified
- Estimated improvement: 2-4x if HIGH issues resolved

### Report 04: Test Coverage & Quality
- ~2,195 Rust `#[test]` functions across 223 `#[cfg(test)]` modules
- 95% of Rust source modules have inline tests (excellent baseline)
- WASM edge: 65/66 modules tested (best coverage in project)
- **12 untested Rust source files** including critical paths
- Missing test categories: security, concurrency, hardware failure, long-running stability
- Rust `wasm-edge` budget compliance tests are meaningful performance guards
- No fuzz testing on CSI frame parsers

### Report 05: SFDIPOT Product Factors
- Overall risk: **HIGH** due to life-safety claims across complex surface
- 5 CRITICAL risks, 13 HIGH risks across all 7 SFDIPOT factors
- Dual-codebase divergence risk (Python legacy still distributed)
- WASM edge modules excluded from `cargo test --workspace` (separate target)
- ESP32 firmware stability over long-running sessions unverified
- 114 test ideas identified (10.5% P0, 21.9% P1, 42.1% P2, 25.4% P3)

### Report 06: Code Quality & QX Assessment
- Overall grade: **B+**
- Architecture: **A-** (exemplary DDD, 48 ADRs, 8 domain models)
- Rust-specific: **B+** (`#![forbid(unsafe_code)]` in core, excellent error hierarchy with `#[non_exhaustive]`)
- 16-crate workspace with clear dependency graph and defined publishing order
- 60+ hot-loadable WASM edge sensing modules organized by domain
- DX: **A-** (Docker quick-start, comprehensive build guides, witness verification)
- Missing `# Safety` documentation on 324 unsafe blocks

---

## Recommendations Priority Matrix

### Sprint 1: Security (Immediate -- Blocks Deployment)
1. Fix unauthenticated OTA endpoint (SEC-026, CVSS 10.0)
2. Replace fake HMAC with real HMAC-SHA256 in `secure_tdm.rs` (SEC-004)
3. Add WebSocket authentication to sensing server (SEC-002)
4. Require WASM module signatures before loading (SEC-005)
5. Add hardcoded TDM test key rotation (SEC-022)

### Sprint 2: Testability & Measurement
6. Decompose `sensing-server/main.rs` into ~14 focused modules
7. Build criterion benchmarks for CSI processing pipeline
8. Add security test suite (auth, injection, protocol tampering)
9. Fuzz CSI frame parsers with cargo-fuzz
10. Add `# Safety` documentation to all 324 unsafe blocks

### Sprint 3: Functional Verification
11. Vital sign accuracy verification against reference signals
12. Fix O(n^2) autocorrelation with FFT-based approach
13. Multi-person tracking identity swap prevention tests
14. WiFi-Mat triage classification accuracy tests
15. ESP32 24-hour soak test
16. Add data retention and privacy controls for biometric data

---

## Detailed Reports

| # | Report | File |
|---|--------|------|
| 00 | Executive Summary (this file) | `00-executive-summary.md` |
| 01 | Code Complexity & Smells | `01-code-complexity-and-smells.md` |
| 02 | Security Analysis | `02-security-analysis.md` |
| 03 | Performance Analysis | `03-performance-analysis.md` |
| 04 | Test Coverage & Quality | `04-test-coverage-and-quality.md` |
| 05 | Product Factors (SFDIPOT) | `05-product-factors-sfdipot.md` |
| 06 | Code Quality & QX | `06-code-quality-and-qx.md` |
| 07 | Test Strategy | `07-test-strategy.md` |
| 08 | Test Plan | `08-test-plan.md` |
| 09 | Exploratory Testing Charters | `09-exploratory-charters.md` |

> Reports 01-06 were generated by specialist agents analyzing the full codebase (including Python v1). Rust-specific findings are the relevant sections. This summary, strategy, plan, and charters are Rust-focused.
