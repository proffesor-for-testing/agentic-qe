# Linux Platform Benchmark Results

**Date**: 2025-12-12T19:48:56.349Z
**Status**: Actual Measurements (Not Estimates)

---

## Environment

| Property | Value |
|----------|-------|
| Platform | linux |
| Architecture | arm64 |
| Node.js | v24.11.1 |
| Filesystem | tmpfs |
| Test Environment | DevPod/Codespaces |

---

## Capability Detection

| Capability | Supported |
|------------|-----------|
| Reflink/Clone | No (tmpfs) |
| Hardlinks | Yes |
| copy_file_range | Yes |

**Note**: tmpfs is a RAM-based filesystem that does not support reflink/COW cloning.
For production benchmarks with reflink, use btrfs or xfs filesystems.

---

## Benchmark Results (1MB File)

| Strategy | Time (ms) | Notes |
|----------|-----------|-------|
| Reflink | N/A | Not supported on tmpfs |
| Kernel Copy | 0.265 | Using copy_file_range |
| Userspace Copy | 0.252 | Standard fs.copyFile |

**Improvement Factor**: 1x (no improvement - expected on tmpfs)

---

## Analysis

### Why No Improvement on tmpfs?

1. **tmpfs is RAM-based**: Both kernel and userspace copies operate on memory
2. **No disk I/O**: The typical advantage of kernel copy (avoiding user/kernel transitions) is minimal
3. **Small file size**: 1MB is too small to show significant differences

### Expected Results on Real Filesystems

| Filesystem | Expected Reflink | Expected Kernel | Notes |
|------------|------------------|-----------------|-------|
| btrfs | 0.05-0.1ms | 10-15ms | 100-200x improvement |
| xfs (reflink=1) | 0.05-0.1ms | 10-15ms | 100-200x improvement |
| ext4 | N/A | 10-15ms | 2-5x over userspace |
| tmpfs | N/A | Same as userspace | RAM-based |

---

## Recommendations

### For Development/Testing (tmpfs)

- Use standard userspace copy
- No performance benefit from kernel strategies
- Focus on correctness testing

### For Production (btrfs/xfs)

- Use `COPYFILE_FICLONE_FORCE` for instant clones
- Fallback chain: reflink → kernel → userspace
- Expected 100x+ improvement for large files

---

## Raw Output

```
=== Platform Benchmark Results ===
Date: 2025-12-12T19:48:56.349Z
Platform: linux
Architecture: arm64
Node.js: v24.11.1

--- Platform Capabilities ---
Filesystem: tmpfs
Supports Reflink: false
Supports Hardlinks: true
Supports copy_file_range: true
Summary: Linux (tmpfs) - Standard copy mode

--- Copy Capabilities ---
Optimal Strategy: kernel
Expected Speedup: 2-5x

--- Benchmark Results (1MB file) ---
Reflink: Not supported
Kernel copy: 0.265ms
Userspace copy: 0.252ms
Improvement: 1x
```

---

## Next Steps

1. Run benchmarks on btrfs/xfs to get reflink measurements
2. Test with larger file sizes (10MB, 100MB, 1GB)
3. Measure directory cloning performance
4. Test hardlink performance for read-only fixtures

---

**Document Type**: Actual Benchmark Results
**Verified**: Yes - run via `npx tsx scripts/run-platform-benchmark.ts`
