# macOS clonefile Benchmark (Pending)

**Date**: 2025-12-12
**Status**: Pending - Requires macOS Environment

---

## Overview

This document is a placeholder for macOS APFS clonefile benchmark results.
The current development environment is Linux (DevPod), so macOS-specific
benchmarks cannot be run directly.

---

## Expected Results (Based on Research)

| Strategy | Expected Time (10MB) | Speedup |
|----------|---------------------|---------|
| clonefile (APFS) | ~0.05ms | 1000x |
| Regular copy | ~50ms | 1x |

---

## How to Run on macOS

```bash
# Clone the repository on a macOS system
git clone https://github.com/proffesor-for-testing/agentic-qe-cf.git
cd agentic-qe-cf
npm install

# Run the benchmark
npx tsx scripts/run-platform-benchmark.ts
```

---

## Expected Output Format

```
=== Platform Benchmark Results ===
Date: [timestamp]
Platform: darwin
Architecture: arm64 (or x64)
Node.js: v24.x.x

--- Platform Capabilities ---
Filesystem: apfs
Supports Reflink: true
Supports Hardlinks: true
Supports copy_file_range: false
Summary: macOS (apfs) - COW/reflink supported (100x+ faster copies)

--- Benchmark Results (1MB file) ---
Reflink: 0.05ms (expected)
Kernel copy: N/A
Userspace copy: 50ms (expected)
Improvement: 1000x (reflink)
```

---

## References

- [Apple APFS Documentation](https://developer.apple.com/documentation/foundation/filemanager)
- [Node.js fs.copyFile with COPYFILE_FICLONE](https://nodejs.org/api/fs.html#fspromisescopyfilesrc-dest-mode)
- [clonefile(2) man page](https://www.manpagez.com/man/2/clonefile/)

---

## Contribution Welcome

If you have access to macOS, please run the benchmark and submit a PR
updating this document with actual results.

**Required macOS version**: 10.13+ (High Sierra) with APFS filesystem

---

**Document Type**: Placeholder for Future Benchmarks
**Actual Measurements**: No - pending macOS environment access
