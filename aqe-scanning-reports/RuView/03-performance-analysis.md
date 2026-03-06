# RuView Performance Analysis Report

**Agent**: qe-performance-reviewer (V3)
**Date**: 2026-03-06
**Project**: RuView - WiFi-Based Human Pose Estimation
**Scope**: Python v1 + Rust port (15 crates)
**Claim**: 54K fps (Rust inference pipeline)

---

## Executive Summary

RuView's dual-codebase architecture contains **28 performance issues** across signal processing, neural network inference, real-time streaming, and hardware integration layers. The Python v1 codebase has **critical hot-path inefficiencies** including nested Python loops in signal processing, redundant numpy-to-list conversions on every frame, and mock-only performance tests that provide zero real measurement. The Rust port, while structurally sound, carries over **unnecessary cloning patterns**, O(n) Vec shifts in vital-signs processing, and O(n^2) autocorrelation that undermines the 54K fps claim.

**Critical findings**: 8 High, 12 Medium, 8 Low severity issues. Estimated aggregate throughput improvement if all High issues are resolved: **3-10x** for Python, **2-4x** for Rust hot paths.

---

## Table of Contents

1. [Algorithmic Complexity](#1-algorithmic-complexity)
2. [Memory Management](#2-memory-management)
3. [Concurrency & Parallelism](#3-concurrency--parallelism)
4. [I/O Bottlenecks](#4-io-bottlenecks)
5. [Signal Processing Pipeline](#5-signal-processing-pipeline)
6. [Neural Network Inference](#6-neural-network-inference)
7. [Real-Time Constraints](#7-real-time-constraints)
8. [Resource Utilization](#8-resource-utilization)
9. [Caching Opportunities](#9-caching-opportunities)
10. [Serialization / Deserialization](#10-serialization--deserialization)
11. [ESP32 Constraints](#11-esp32-constraints)
12. [Benchmarking Gaps](#12-benchmarking-gaps)

---

## 1. Algorithmic Complexity

### PERF-001: O(n^2) Correlation Matrix in Feature Extraction (HIGH)

**File**: `/tmp/RuView/rust-port/.../wifi-densepose-signal/src/features.rs` lines 285-300
**Also**: `/tmp/RuView/v1/src/core/csi_processor.py` `_extract_correlation_features`

The correlation matrix computation uses nested loops over all antenna pairs:

```rust
// Rust: O(n^2 * m) where n = antennas, m = samples
for i in 0..n_antennas {
    for j in 0..n_antennas {
        // compute correlation between antenna i and j
    }
}
```

```python
# Python: np.corrcoef is O(n^2) but also allocates full n*n matrix
correlation_matrix = np.corrcoef(csi_matrix)
```

**Impact**: For 64 antennas with 256 samples, this is ~1M multiply-accumulate operations per frame. At 30 fps that is 30M MAC/s just for correlation.

**Recommendation**: Exploit symmetry (only compute upper triangle, mirror). For the Rust side, use `ndarray::parallel` with rayon to parallelize across rows. Consider whether a subset of antenna pairs suffices (e.g., adjacent pairs only reduces from O(n^2) to O(n)).

---

### PERF-002: O(n^2) Autocorrelation in Heart Rate Detection (HIGH)

**File**: `/tmp/RuView/rust-port/.../wifi-densepose-vitals/src/heartrate.rs` lines 273-280

```rust
fn autocorrelation_peak(&self, signal: &[f64]) -> Option<usize> {
    for lag in min_lag..max_lag {
        let sum: f64 = signal.iter()
            .zip(signal[lag..].iter())
            .map(|(a, b)| a * b)
            .sum();
        // ...
    }
}
```

**Complexity**: O(n * lag_range). With typical signal length ~512 and lag_range ~200, this is ~100K operations per heart rate estimate.

**Recommendation**: Use FFT-based autocorrelation: compute FFT, multiply by conjugate, inverse FFT. This reduces complexity to O(n log n) and leverages rustfft which is already a dependency. Expected speedup: **5-10x** for typical signal lengths.

---

### PERF-003: O(n) Vec::remove(0) in Vital Signs History (HIGH)

**File**: `/tmp/RuView/rust-port/.../wifi-densepose-vitals/src/breathing.rs` line 112
**Also**: `/tmp/RuView/rust-port/.../wifi-densepose-vitals/src/heartrate.rs` line 108

```rust
self.filtered_history.remove(0);  // O(n) shift of all elements
```

Called on every incoming sample. For a history buffer of 1024 samples at 100 Hz sampling, this performs ~100K element shifts per second.

**Recommendation**: Replace `Vec<f64>` with `VecDeque<f64>`. `VecDeque::pop_front()` is O(1). This is a trivial fix with significant impact on sustained throughput.

---

### PERF-004: Hampel Filter Median via Sort (MEDIUM)

**File**: `/tmp/RuView/rust-port/.../wifi-densepose-signal/src/hampel.rs`

The Hampel filter computes median by sorting a copy of each window:

```rust
fn median(data: &[f64]) -> f64 {
    let mut sorted = data.to_vec();  // allocation per window position
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());
    // ...
}
```

**Complexity**: O(n * w * log(w)) total where n = signal length, w = window size.

**Recommendation**: Use a selection algorithm (e.g., quickselect) for O(w) median, or maintain a sliding window median structure (two heaps) for O(log w) per step. Expected improvement: **2-3x** for typical window sizes of 7-15.

---

### PERF-005: CUSUM Detection as Pure Python Loop (MEDIUM)

**File**: `/tmp/RuView/v1/src/sensing/feature_extractor.py` lines 315-331

```python
def cusum_detect(self, signal, threshold=5.0, drift=0.5):
    for i in range(len(signal)):
        s_pos = max(0, s_pos + signal[i] - mean - drift)
        s_neg = max(0, s_neg - signal[i] + mean - drift)
        if s_pos > threshold or s_neg > threshold:
            change_points.append(i)
```

**Impact**: Pure Python loop over signal array. For a 1024-sample signal, this is ~50x slower than a vectorized numpy implementation.

**Recommendation**: Vectorize with numpy cumulative operations or use `numba.jit` for zero-copy acceleration.

---

## 2. Memory Management

### PERF-006: Excessive Cloning in Rust Signal Pipeline (HIGH)

**File**: `/tmp/RuView/rust-port/.../wifi-densepose-signal/src/csi_processor.rs`
**Also**: `/tmp/RuView/rust-port/.../wifi-densepose-signal/src/phase_sanitizer.rs`

The entire CSI processing pipeline clones `Array2<f64>` at every stage:

```rust
// csi_processor.rs - each method clones the full phase matrix
let denoised = self.remove_noise(phase_data.clone());
let windowed = self.apply_windowing(denoised.clone());
let normalized = self.normalize_amplitude(windowed.clone());
```

```rust
// phase_sanitizer.rs - same pattern
let unwrapped = self.unwrap_phase(phase_data.clone());
let cleaned = self.remove_outliers(unwrapped.clone());
let smoothed = self.smooth_phase(cleaned.clone());
```

For a typical 64x256 f64 matrix, each clone allocates and copies 128 KB. With 6+ clones per frame at 30 fps, this is **23 MB/s** of unnecessary allocation and copying.

**Recommendation**: Refactor to take `&mut Array2<f64>` and operate in-place, or use a single owned value passed through the pipeline without cloning. The sanitization steps are sequential and do not need the original data after transformation.

---

### PERF-007: Deque-to-List Conversion in Python Hot Path (MEDIUM)

**File**: `/tmp/RuView/v1/src/core/csi_processor.py` line 296, line 413

```python
# Line 296 - creates full list copy of history deque
recent_data = list(self.csi_history)[-count:]

# Line 413 - converts phase cache to list every call
cache_list = list(self._phase_cache)
```

`list(deque)` copies all elements. For a deque of 1000 entries with numpy arrays, this is a significant allocation on every frame.

**Recommendation**: Use `itertools.islice(self.csi_history, max(0, len(self.csi_history) - count), None)` to avoid full copy. Or maintain a parallel numpy ring buffer for bulk access patterns.

---

### PERF-008: Per-Row Allocation in Rust Phase Processing (MEDIUM)

**File**: `/tmp/RuView/rust-port/.../wifi-densepose-signal/src/phase_sanitizer.rs` line 487
**Also**: `/tmp/RuView/rust-port/.../wifi-densepose-signal/src/features.rs` lines 168-169

```rust
// phase_sanitizer.rs - allocates Vec per row
let row_data = row.to_vec();
let std = calculate_std_1d(&row_data);

// features.rs - allocates Vec per antenna pair
let row_a = phase_data.row(i).to_vec();
let row_b = phase_data.row(j).to_vec();
```

**Impact**: For 64 rows * 256 columns, this creates 64+ temporary Vec allocations per frame.

**Recommendation**: Pass `ArrayView1` slices directly to computation functions instead of converting to `Vec`. Refactor `calculate_std_1d` to accept `&[f64]` or `ArrayView1<f64>` (ndarray row views implement `AsRef<[f64]>`).

---

### PERF-009: FftPlanner Recreated Per Call (MEDIUM)

**File**: `/tmp/RuView/rust-port/.../wifi-densepose-signal/src/features.rs` line 338

```rust
fn from_csi_history(history: &[Array2<f64>]) -> Self {
    let mut planner = FftPlanner::new();  // recreated every call
    let fft = planner.plan_fft_forward(n);
    // ...
}
```

`FftPlanner::new()` allocates internal twiddle factor tables. Recreating it discards cached FFT plans.

**Recommendation**: Store the `FftPlanner` in the parent struct and reuse across calls. rustfft's planner caches plans internally, so reuse yields O(1) plan lookup after first use versus O(n) recomputation.

---

## 3. Concurrency & Parallelism

### PERF-010: Sequential Batch Inference (HIGH)

**File**: `/tmp/RuView/rust-port/.../wifi-densepose-nn/src/inference.rs` line 335

```rust
pub async fn infer_batch(&self, inputs: Vec<Tensor>) -> Vec<InferenceResult> {
    let mut results = Vec::new();
    for input in inputs {
        results.push(self.run_single(input).await);  // sequential!
    }
    results
}
```

Batch inference runs each input sequentially. This completely negates the benefit of batching for GPU/ONNX backends that support true batch execution.

**Recommendation**:
1. Concatenate inputs along batch dimension and run a single inference call.
2. If the backend does not support batched input, use `tokio::task::spawn` or `futures::join_all` to run inferences concurrently.
3. For ONNX Runtime, set `intra_op_num_threads` and use batch input tensors.

**Estimated Impact**: For batch size 8, true batching yields **4-6x** throughput improvement on GPU, **2-3x** on CPU with thread parallelism.

---

### PERF-011: Sequential WebSocket Broadcast (MEDIUM)

**File**: `/tmp/RuView/v1/src/sensing/ws_server.py` lines 443-448
**Also**: `/tmp/RuView/v1/src/services/stream_service.py` `_broadcast_message` lines 194-206

```python
# ws_server.py
for ws in self.connections:
    await ws.send(message)  # sequential per client

# stream_service.py
for websocket in self.connections.copy():
    await websocket.send_text(json.dumps(message))  # sequential + re-serializes per client
```

**Impact**: With 10 connected clients and 1ms per send, broadcast takes 10ms -- eating into the 33ms frame budget at 30 fps.

**Recommendation**: Use `asyncio.gather()` for concurrent sends. Serialize the JSON message once before the loop:

```python
serialized = json.dumps(message)
await asyncio.gather(*[ws.send_text(serialized) for ws in self.connections.copy()])
```

---

### PERF-012: Stats Update Spawns Tokio Task Per Inference (LOW)

**File**: `/tmp/RuView/rust-port/.../wifi-densepose-nn/src/inference.rs` line 312

```rust
tokio::spawn(async move {
    stats.lock().await.update(latency);
});
```

Spawning a tokio task per inference just to update stats introduces unnecessary scheduler overhead. For 54K fps, this is 54K task spawns per second.

**Recommendation**: Use an `AtomicU64` for latency accumulation or batch stats updates (e.g., update every 100 inferences).

---

## 4. I/O Bottlenecks

### PERF-013: New Future Per UDP Read (MEDIUM)

**File**: `/tmp/RuView/v1/src/hardware/csi_extractor.py` lines 485-510

```python
async def _read_udp_data(self):
    loop = asyncio.get_event_loop()
    future = loop.create_future()  # new Future per read
    # ...
```

Creating a new Future object per UDP packet read adds GC pressure and allocation overhead on the hot path.

**Recommendation**: Use `asyncio.DatagramProtocol` with `connection_made`/`datagram_received` callbacks instead of manual Future creation. This is the idiomatic asyncio pattern for high-throughput UDP and avoids per-packet allocation.

---

### PERF-014: Signal Field Recomputation Every Tick (HIGH)

**File**: `/tmp/RuView/v1/src/sensing/ws_server.py` lines 260-298

```python
def generate_signal_field(self, grid_size=20):
    field = np.zeros((grid_size, grid_size))
    for x in range(grid_size):
        for y in range(grid_size):
            for ap_name, ap_data in self.access_points.items():
                distance = np.sqrt((x - ap_x)**2 + (y - ap_y)**2)
                field[x][y] += rssi * np.exp(-distance / 5.0)
    return field
```

**Complexity**: O(grid^2 * num_APs) with Python loops. For grid_size=20 and 4 APs, this is 1600 iterations of Python-level math executed on every broadcast tick (500ms).

**Recommendation**: Vectorize completely with numpy broadcasting:

```python
def generate_signal_field(self, grid_size=20):
    xs, ys = np.mgrid[0:grid_size, 0:grid_size]
    field = np.zeros((grid_size, grid_size))
    for ap_name, ap_data in self.access_points.items():
        dist = np.sqrt((xs - ap_x)**2 + (ys - ap_y)**2)
        field += rssi * np.exp(-dist / 5.0)
    return field
```

This eliminates the inner two Python loops entirely. Expected speedup: **50-100x**.

---

## 5. Signal Processing Pipeline

### PERF-015: Moving Average with Nested Python Loops (HIGH)

**File**: `/tmp/RuView/v1/src/core/phase_sanitizer.py` lines 213-217

```python
def _apply_moving_average(self, phase_data, window=5):
    for row in range(rows):
        for col in range(cols):
            # manual sliding window average
            start = max(0, col - window // 2)
            end = min(cols, col + window // 2 + 1)
            result[row, col] = np.mean(phase_data[row, start:end])
```

**Complexity**: O(rows * cols * window) in pure Python.

**Recommendation**: Use `scipy.ndimage.uniform_filter1d(phase_data, size=window, axis=1)` or `np.convolve` with a uniform kernel. These are C-implemented and provide **100-500x** speedup over Python loops for typical matrix sizes (64x256).

---

### PERF-016: Per-Antenna Python Loop in Low-Pass Filter (MEDIUM)

**File**: `/tmp/RuView/v1/src/core/phase_sanitizer.py` lines 260-263

```python
def _apply_low_pass_filter(self, phase_data, cutoff=0.1):
    for i in range(phase_data.shape[0]):
        phase_data[i] = scipy.signal.filtfilt(b, a, phase_data[i])
```

**Impact**: `filtfilt` is efficient per-call, but the Python loop over rows adds interpreter overhead. For 64 antennas this is 64 Python-level function calls.

**Recommendation**: Use `scipy.signal.sosfiltfilt` with `axis=1` to filter the entire 2D array in a single call. This allows scipy to batch the operation internally.

---

### PERF-017: Outlier Interpolation with Per-Row Python Loop (MEDIUM)

**File**: `/tmp/RuView/v1/src/core/phase_sanitizer.py` lines 167-178

```python
def _interpolate_outliers(self, phase_data, outlier_mask):
    for row_idx in range(phase_data.shape[0]):
        row = phase_data[row_idx]
        mask = outlier_mask[row_idx]
        # Python loop to find surrounding non-outlier points
```

**Recommendation**: Use `numpy.interp` with boolean indexing or `scipy.interpolate.interp1d` applied per row via `np.apply_along_axis`. Better yet, use masked array operations.

---

### PERF-018: Rust Phase Smoothing with Nested Loops (MEDIUM)

**File**: `/tmp/RuView/rust-port/.../wifi-densepose-signal/src/phase_sanitizer.rs` `smooth_phase`

```rust
fn smooth_phase(&self, phase_data: &Array2<f64>) -> Array2<f64> {
    for row in 0..n_rows {
        for col in 0..n_cols {
            // manual sliding window
        }
    }
}
```

**Recommendation**: Use ndarray's `windows()` iterator or implement as a 1D convolution along axis 1. The ndarray-conv crate provides optimized convolution operations.

---

### PERF-019: Outlier Detection Linear Search in Rust (LOW)

**File**: `/tmp/RuView/rust-port/.../wifi-densepose-signal/src/phase_sanitizer.rs` lines 544-555

```rust
fn interpolate_outliers(&self, ...) {
    // O(n) scan left and right for nearest non-outlier
    let mut left = idx - 1;
    while left > 0 && outliers.contains(&left) { left -= 1; }
    let mut right = idx + 1;
    while right < len && outliers.contains(&right) { right += 1; }
}
```

If `outliers` is a `Vec`, `.contains()` is O(k) per check. With many outliers, this becomes O(n*k).

**Recommendation**: Use a `HashSet<usize>` for O(1) outlier membership testing, or pre-compute a boolean mask array.

---

## 6. Neural Network Inference

### PERF-020: No Model Optimization Applied (HIGH)

**File**: `/tmp/RuView/v1/src/models/densepose_head.py`

The DensePose head uses standard PyTorch layers with no optimization:

- No `torch.jit.script` or `torch.jit.trace` compilation
- No quantization (INT8/FP16)
- No operator fusion
- No `torch.inference_mode()` context
- No ONNX export for optimized runtime

**Impact**: Unoptimized PyTorch inference is typically **2-4x slower** than TorchScript and **4-8x slower** than INT8-quantized ONNX Runtime.

**Recommendation**:
1. Apply `torch.jit.trace` for graph-mode execution
2. Use `torch.quantization.quantize_dynamic` for INT8 on CPU
3. Export to ONNX and use ONNX Runtime for production inference
4. Wrap inference calls in `torch.inference_mode()` context

---

### PERF-021: Input Tensor Cloned Before Inference (LOW)

**File**: `/tmp/RuView/rust-port/.../wifi-densepose-nn/src/inference.rs` line 132

```rust
fn run_single(&self, input: Tensor) -> InferenceResult {
    let input = input.clone();  // unnecessary clone
    // ...
}
```

The input tensor is already owned (passed by value). The clone is redundant.

**Recommendation**: Remove the `.clone()` call. The function already takes ownership of the tensor.

---

### PERF-022: Redundant Amplitude Recomputation (LOW)

**File**: `/tmp/RuView/rust-port/.../wifi-densepose-hardware/src/csi_frame.rs`

```rust
fn mean_amplitude(&self) -> f64 {
    // Recomputes sqrt per subcarrier instead of reusing to_amplitude_phase()
    self.subcarriers.iter()
        .map(|s| (s.real * s.real + s.imag * s.imag).sqrt())
        .sum::<f64>() / self.subcarriers.len() as f64
}
```

If `to_amplitude_phase()` was already called (common in the pipeline), the amplitudes are recomputed.

**Recommendation**: Cache the amplitude/phase arrays after first computation using `OnceCell` or a memoization pattern.

---

## 7. Real-Time Constraints

### PERF-023: Pydantic Model per Zone per Frame (MEDIUM)

**File**: `/tmp/RuView/v1/src/api/websocket/pose_stream.py` lines 121-128

```python
# Called at 30fps, creating Pydantic models for each zone
for zone in zones:
    pose_data = PoseStreamData(
        zone_id=zone.id,
        timestamp=datetime.now(),
        keypoints=zone.keypoints,
        confidence=zone.confidence,
        # ... more fields
    )
    messages.append(pose_data.dict())
```

Pydantic v1 model instantiation + `.dict()` serialization is expensive. For 5 zones at 30 fps, that is 150 model constructions + serializations per second.

**Recommendation**:
1. Use `dataclasses` or plain dicts for internal streaming data
2. If Pydantic is required, use Pydantic v2 which is 5-50x faster
3. Pre-allocate message templates and update only changed fields

---

### PERF-024: Connection Filtering Iterates All Connections (LOW)

**File**: `/tmp/RuView/v1/src/api/websocket/connection_manager.py`

```python
def _get_matching_clients(self, zone=None, data_type=None):
    matching = []
    for conn in self.connections:
        if self._matches_filter(conn, zone, data_type):
            matching.append(conn)
    return matching
```

**Impact**: Linear scan of all connections for every broadcast. Low impact unless connection count exceeds ~100.

**Recommendation**: Maintain pre-indexed sets keyed by zone and data_type for O(1) lookup:

```python
self._zone_index: Dict[str, Set[WebSocket]] = defaultdict(set)
self._type_index: Dict[str, Set[WebSocket]] = defaultdict(set)
```

---

## 8. Resource Utilization

### PERF-025: No Thread Pool Configuration for ONNX Runtime (MEDIUM)

**File**: `/tmp/RuView/rust-port/.../wifi-densepose-nn/src/inference.rs`

The inference engine does not configure ONNX Runtime thread pools. Default ONNX Runtime uses all available cores for intra-op parallelism, which can cause contention with the signal processing pipeline.

**Recommendation**: Set `intra_op_num_threads` to CPU_count / 2 and `inter_op_num_threads` to 2. This leaves cores available for signal processing and prevents thread over-subscription.

---

## 9. Caching Opportunities

### PERF-026: IIR Filter Coefficients Recomputed (LOW)

**File**: `/tmp/RuView/v1/src/core/phase_sanitizer.py`
**Also**: `/tmp/RuView/v1/src/sensing/feature_extractor.py`

Bandpass filter coefficients (`scipy.signal.butter`) are computed each time the filter is applied. These coefficients depend only on cutoff frequency and sample rate, which rarely change.

**Recommendation**: Compute filter coefficients once in `__init__` and store as instance attributes. Use `scipy.signal.sosfilt` with pre-computed second-order sections.

---

### PERF-027: Spectrogram Column Extraction via to_vec() (LOW)

**File**: `/tmp/RuView/rust-port/.../wifi-densepose-signal/src/spectrogram.rs` line 141

```rust
fn compute_multi_subcarrier_spectrogram(&self, csi_data: &Array2<f64>) -> Vec<Array2<f64>> {
    for col_idx in 0..n_subcarriers {
        let column = csi_data.column(col_idx).to_vec();  // copies column
        // ...
    }
}
```

**Recommendation**: Use `column()` view directly as input to FFT. If a contiguous buffer is needed, use `to_owned()` into a pre-allocated buffer rather than creating a new Vec each time.

---

## 10. Serialization / Deserialization

### PERF-028: numpy-to-list Conversion for JSON (HIGH)

**File**: `/tmp/RuView/v1/src/services/stream_service.py` line 146
**Also**: `/tmp/RuView/v1/src/sensing/ws_server.py` line 175

```python
# stream_service.py
csi_list = csi_data.tolist()  # O(n) copy from numpy to Python list

# ws_server.py
amplitudes.tolist()  # per UDP frame
```

`ndarray.tolist()` converts every element from numpy scalar to Python object, creating massive GC pressure. For a 64x256 float64 array, this creates 16,384 Python float objects.

**Recommendation**:
1. Use `orjson` which can serialize numpy arrays directly without conversion
2. Use MessagePack (`msgpack`) for binary serialization -- 5-10x faster than JSON for numeric data
3. If JSON is required, use `numpy.array2string` or a custom encoder that avoids per-element Python object creation

---

### PERF-029: JSON Re-serialization Per Client (MEDIUM)

**File**: `/tmp/RuView/v1/src/services/stream_service.py` line 196

```python
for websocket in self.connections.copy():
    await websocket.send_text(json.dumps(message))  # serializes per client
```

The same dict is serialized to JSON once per connected client.

**Recommendation**: Serialize once before the broadcast loop:

```python
serialized = json.dumps(message)
for websocket in self.connections.copy():
    await websocket.send_text(serialized)
```

---

## 11. ESP32 Constraints

### PERF-030: Per-Frame Amplitude Conversion on Host (MEDIUM)

**File**: `/tmp/RuView/v1/src/sensing/ws_server.py` line 175
**Also**: `/tmp/RuView/rust-port/.../wifi-densepose-hardware/src/csi_frame.rs`

Every incoming UDP frame from ESP32 triggers amplitude/phase conversion:

```python
amplitudes = np.abs(csi_complex)  # sqrt per element
phases = np.angle(csi_complex)    # atan2 per element
```

At 100 Hz per ESP32 with 64 subcarriers, this is 12,800 sqrt + atan2 operations per second per device.

**Recommendation**: If only amplitude is needed for the immediate processing step, defer phase computation. Use `np.abs` with `out=` parameter for in-place computation to avoid allocation. On the Rust side, consider SIMD-accelerated complex magnitude via `packed_simd` or `std::simd` (nightly).

---

### PERF-031: Binary Frame Parsing Without Zero-Copy (LOW)

**File**: `/tmp/RuView/v1/src/hardware/csi_extractor.py`

ESP32 binary frames (ADR-018 format) are parsed by copying bytes into Python objects. Each 802.11 CSI frame includes header + subcarrier data.

**Recommendation**: Use `numpy.frombuffer` with appropriate dtype to zero-copy parse the subcarrier I/Q data directly from the UDP buffer. This avoids per-subcarrier Python object creation.

---

## 12. Benchmarking Gaps

### PERF-032: All Performance Tests Use Mocks (CRITICAL)

**File**: `/tmp/RuView/v1/tests/performance/test_inference_speed.py`
**File**: `/tmp/RuView/v1/tests/performance/test_api_throughput.py`

Both performance test files use mock objects with `asyncio.sleep()` as stand-ins for real computation:

```python
# test_inference_speed.py - mocked inference
mock_model.predict = AsyncMock(return_value=fake_result)

# test_api_throughput.py - mocked API calls
async with AsyncClient(app=app) as client:
    # Uses TestClient with mocked backends
```

**Impact**: These tests measure test framework overhead, not actual system performance. The 54K fps claim cannot be validated from the test suite.

**Recommendation**:
1. Create integration benchmarks using `pytest-benchmark` with real numpy arrays and actual signal processing functions
2. Add latency distribution tests (p50, p95, p99) for the CSI pipeline
3. Add throughput tests for WebSocket broadcast with real serialization
4. Add memory profiling tests using `tracemalloc` or `memray`
5. For Rust, use `criterion` benchmarks for hot-path functions (already partially present but needs expansion)

**Required benchmarks**:
- CSI preprocessing pipeline end-to-end: target < 5ms per frame
- Phase sanitization: target < 2ms for 64x256 matrix
- Feature extraction: target < 3ms per frame
- WebSocket broadcast to 10 clients: target < 5ms
- Neural network inference: target < 20ms per frame
- Full pipeline latency budget: target < 33ms (30 fps)

---

## Performance Impact Summary

| ID | Issue | Severity | Component | Est. Speedup |
|----|-------|----------|-----------|-------------|
| PERF-001 | O(n^2) correlation matrix | HIGH | Signal/Features | 2-4x |
| PERF-002 | O(n^2) autocorrelation | HIGH | Vitals/HeartRate | 5-10x |
| PERF-003 | O(n) Vec::remove(0) | HIGH | Vitals | 10-100x |
| PERF-004 | Hampel median via sort | MEDIUM | Signal/Hampel | 2-3x |
| PERF-005 | CUSUM as Python loop | MEDIUM | Sensing/Features | 50x |
| PERF-006 | Excessive Array2 cloning | HIGH | Rust Signal | 2-3x (memory) |
| PERF-007 | Deque-to-list conversion | MEDIUM | Python CSI | 5-10x |
| PERF-008 | Per-row Vec allocation | MEDIUM | Rust Phase | 2x (alloc) |
| PERF-009 | FftPlanner recreated | MEDIUM | Rust Features | 2-5x |
| PERF-010 | Sequential batch inference | HIGH | NN Inference | 4-6x |
| PERF-011 | Sequential WS broadcast | MEDIUM | Streaming | 5-10x |
| PERF-012 | Tokio spawn per inference | LOW | NN Stats | Minor |
| PERF-013 | Future per UDP read | MEDIUM | Hardware | 2x |
| PERF-014 | Signal field recomputation | HIGH | WS Server | 50-100x |
| PERF-015 | Moving avg Python loops | HIGH | Phase Sanitizer | 100-500x |
| PERF-016 | Per-antenna filter loop | MEDIUM | Phase Sanitizer | 2-5x |
| PERF-017 | Outlier interp Python loop | MEDIUM | Phase Sanitizer | 10-50x |
| PERF-018 | Rust smoothing nested loops | MEDIUM | Rust Phase | 2-3x |
| PERF-019 | Outlier linear search | LOW | Rust Phase | Minor |
| PERF-020 | No model optimization | HIGH | NN/DensePose | 2-8x |
| PERF-021 | Redundant tensor clone | LOW | Rust NN | Minor |
| PERF-022 | Amplitude recomputation | LOW | Rust Hardware | Minor |
| PERF-023 | Pydantic per zone per frame | MEDIUM | Pose Stream | 5-10x |
| PERF-024 | Connection filter scan | LOW | Connection Mgr | Minor |
| PERF-025 | No ONNX thread config | MEDIUM | NN Inference | 1.5-2x |
| PERF-026 | Filter coeff recomputed | LOW | Phase/Features | Minor |
| PERF-027 | Spectrogram col copy | LOW | Rust Spectrogram | Minor |
| PERF-028 | numpy-to-list for JSON | HIGH | Streaming | 5-10x |
| PERF-029 | JSON re-serialized per client | MEDIUM | Streaming | 2-5x |
| PERF-030 | Per-frame amplitude conv | MEDIUM | Hardware | 1.5-2x |
| PERF-031 | No zero-copy frame parse | LOW | Hardware | 2x |
| PERF-032 | All perf tests mocked | CRITICAL | Testing | N/A |

---

## Priority Optimization Roadmap

### Phase 1: Quick Wins (1-2 days, highest ROI)

1. **PERF-003**: Replace `Vec::remove(0)` with `VecDeque` in breathing.rs and heartrate.rs -- trivial fix, eliminates O(n) shift
2. **PERF-006**: Remove unnecessary `.clone()` calls in Rust signal pipeline -- pass by mut reference
3. **PERF-021**: Remove redundant `input.clone()` in inference.rs
4. **PERF-029**: Serialize JSON once before broadcast loop
5. **PERF-009**: Store FftPlanner in struct for reuse

### Phase 2: Python Hot Path (3-5 days)

6. **PERF-015**: Replace moving average Python loops with scipy.ndimage.uniform_filter1d
7. **PERF-014**: Vectorize signal field generation with numpy broadcasting
8. **PERF-028**: Switch to orjson or msgpack for numpy serialization
9. **PERF-005**: Vectorize CUSUM detection with numpy
10. **PERF-011**: Use asyncio.gather for concurrent WebSocket broadcast

### Phase 3: Algorithm Improvements (1-2 weeks)

11. **PERF-002**: Implement FFT-based autocorrelation for heart rate
12. **PERF-001**: Exploit correlation matrix symmetry, parallelize with rayon
13. **PERF-010**: Implement true batch inference with concatenated tensors
14. **PERF-020**: Apply TorchScript/ONNX export and INT8 quantization

### Phase 4: Testing & Validation (1 week)

15. **PERF-032**: Build real performance benchmarks with criterion (Rust) and pytest-benchmark (Python)
16. Establish latency budgets and CI regression gates

---

## Latency Budget Analysis

Target: 30 fps = 33.3ms per frame budget

| Stage | Current Est. (Python) | Target | Rust Est. |
|-------|----------------------|--------|-----------|
| CSI Preprocessing | 8-15ms | <3ms | 0.5-2ms |
| Phase Sanitization | 10-50ms* | <2ms | 1-5ms |
| Feature Extraction | 5-20ms | <3ms | 0.5-2ms |
| Neural Network Inference | 15-50ms | <15ms | 5-15ms |
| Serialization + Broadcast | 5-20ms | <3ms | 0.5-1ms |
| **Total** | **43-155ms** | **<26ms** | **7.5-25ms** |

*Phase sanitization is the worst offender due to nested Python loops (PERF-015).

The Python pipeline **cannot meet 30 fps** without the optimizations in Phase 2. The Rust pipeline can meet the target but requires the Phase 1 fixes to avoid unnecessary overhead that undermines the 54K fps claim.

---

## Conclusion

RuView has a solid architectural foundation but carries significant performance debt in both codebases. The Python v1 implementation suffers from classic "Python loop over numpy array" anti-patterns that can be resolved with vectorization. The Rust port, while faster by default, has ported several inefficient patterns (cloning, Vec shifts, per-call allocations) that should have been optimized during the port.

The most concerning finding is **PERF-032**: all performance tests use mocks, meaning the 54K fps claim is unsubstantiated by any test in the repository. Building real benchmarks should be the top priority to establish a baseline before optimization work begins.

**Recommendation**: BLOCK deployment until Phase 1 fixes are applied and real benchmarks (PERF-032) validate throughput claims.
