# Bun Project - Quick Reference Guide

**Repository**: https://github.com/oven-sh/bun | **Version**: 1.3.5 | **Research Date**: 2025-12-12

---

## 🎯 Core Architecture

```
Technology Stack:
├── Zig (Runtime, Bundler, Package Manager)
├── JavaScriptCore (JavaScript Engine)
├── C++ (System Components)
└── TypeScript/JavaScript (Tooling)

Layered Design:
├── CLI & User Interface
├── Development Features (Test, Watch)
├── Module System & Bundling
├── Package Management
├── Core Runtime & VM
└── Infrastructure (I/O, Memory)
```

---

## ⚡ Performance Highlights

| Feature | Bun | Node.js | Speedup |
|---------|-----|---------|---------|
| **Startup** | 5.2ms | 25.1ms | **4x** |
| **npm Scripts** | ~6ms | ~170ms | **28x** |
| **Package Install** | - | - | **25x** |

**Key Techniques**:
- JavaScriptCore engine (faster startup than V8)
- Zig for low-level performance
- Binary metadata caching (not JSON)
- Platform syscalls (clonefile/hardlink)
- Lazy dependency resolution
- Parallel processing (CPU × 2)

---

## 🧪 Testing Framework

**Built-in Test Runner**: `bun:test` (Jest-compatible)

```bash
# Run tests
bun test

# Concurrent execution
bun test --concurrent --max-concurrency 4

# Watch mode
bun test --watch

# Coverage
bun test --coverage

# AI-friendly mode
CLAUDECODE=1 bun test

# JUnit reports
bun test --reporter=junit --reporter-outfile=./bun.xml
```

**Test Organization**:
```
test/
├── js/bun/          # Bun-specific APIs
├── js/node/         # Node.js compatibility
├── js/web/          # Web standards
├── cli/             # CLI tests
├── bundler/         # Bundler tests
├── regression/      # Bug reproducers
└── integration/     # Cross-module tests
```

**Features**:
- TypeScript/JSX native support
- Lifecycle hooks (beforeAll, beforeEach, etc.)
- Snapshot testing (`toMatchSnapshot()`)
- Mocking (`jest.fn()`, `jest.spyOn()`)
- Mock clock (`jest.useFakeTimers()`)
- GitHub Actions auto-detection
- Multiple reporters (junit, tap, json, html)

---

## 🏗️ Build System

**Primary**: CMake + Ninja

**Build Variants**:
```bash
bun run build              # Debug (with ASAN)
bun run build:release      # Optimized release
bun run build:release:asan # Release with sanitizer
bun run build:smol         # Size-optimized
```

**Caching**:
- **sccache** (primary) - Shared compiler cache
- **ccache** (fallback) - Local caching

**Code Generation** (Automated):
- `generate-jssink.ts` - ReadableStream C++ headers
- `generate-classes.ts` - JSC Zig/C++ bindings
- `cppbind.ts` - Zig bindings for `[[ZIG_EXPORT]]` C++
- `bundle-modules.ts` - Built-in modules
- `bundle-functions.ts` - Global functions

**Compile Time**: ~2.5 min (debug incremental)

---

## 👨‍💻 Developer Experience

### CLI Design

```bash
# Dual invocation
bun run index.tsx    # Explicit
bun index.tsx        # Shorthand (equivalent)

# Native transpilation (zero config)
bun index.ts         # TypeScript
bun index.tsx        # TSX
bun index.jsx        # JSX

# Watch mode
bun --watch run dev

# Memory management
bun --smol run index.tsx    # Low memory mode
bun --expose-gc run app.ts  # GC control

# Debugging
bun --inspect run server.ts
```

### Resolution Priority
1. package.json scripts
2. Source files
3. Package binaries
4. System commands (bun run only)

### Key Features
- **Zero configuration**: TypeScript/JSX work out of the box
- **Script listing**: `bun run` shows all available scripts
- **Lifecycle hooks**: pre/post script support
- **Workspace support**: `--filter` for monorepos
- **stdin piping**: `echo "..." | bun run -`

---

## 📦 Package Manager

### Installation Strategies

**Hoisted** (traditional):
```bash
bun install --linker hoisted
```

**Isolated** (pnpm-like):
```bash
bun install --linker isolated
```

### Performance Features

1. **Binary Metadata Caching**: `~/.bun/install/cache/`
2. **Platform Syscalls**:
   - macOS: `clonefile` (single syscall cloning)
   - Linux: `hardlink` (zero-copy linking)
3. **Smart Resolution**:
   - Lazy: Only missing deps (when lockfile exists)
   - Eager: Download while resolving (new installs)

### Security

```toml
# bunfig.toml
[install]
minimumReleaseAge = 259200  # 3 days in seconds
```

```json
// package.json
{
  "trustedDependencies": ["esbuild", "sharp"]
}
```

### Lockfile

**Format**: `bun.lock` (text, human-readable)

```bash
# Frozen lockfile (CI)
bun install --frozen-lockfile
# or
bun ci

# Migrate from binary
bun install --save-text-lockfile --frozen-lockfile --lockfile-only
```

---

## 📦 Bundler

### Basic Usage

```javascript
// JavaScript API
await Bun.build({
  entrypoints: ['./index.tsx'],
  outdir: './build',
  minify: true,
  splitting: true,
  sourcemap: 'linked',
});
```

```bash
# CLI
bun build ./index.tsx --outdir ./build --minify --splitting
```

### Optimizations

**Dead Code Elimination**:
- Tree-shaking with `@__PURE__` annotations
- Respects `package.json` "sideEffects"

**Code Splitting**:
- Automatic shared code extraction
- Content-hash filenames: `chunk-2fce6291bf86559d.js`

**Minification**:
```javascript
minify: {
  whitespace: true,
  identifiers: true,
  syntax: true,
}
```

**Bytecode Caching**:
```javascript
bytecode: true,  // Generates .jsc files
format: 'cjs',
target: 'bun',
```

**Feature Flags**:
```javascript
// app.ts
import { feature } from "bun:bundle";

if (feature("PREMIUM")) {
  initPremiumFeatures();  // Eliminated if not in features array
}

// build.ts
await Bun.build({
  features: ["PREMIUM"],
  minify: true,
});
```

---

## 🔧 Quality Engineering

### CI/CD Workflows

**Code Quality**:
- `lint.yml` - oxlint enforcement
- `format.yml` - clang-format, Prettier
- `packages-ci.yml` - Package testing

**Release**:
- `release.yml` - Multi-platform pipeline
- Build matrix: Debian, Alpine, Distroless × amd64/arm64
- Artifacts: npm, Docker, S3, Homebrew
- GPG signing required

**Automation**:
- 12+ dependency update workflows
- Auto-label issues/PRs
- Deduplicate issues
- Stale issue management

### Code Quality Tools

| Language | Tool |
|----------|------|
| JavaScript/TypeScript | oxlint |
| C++ | clang-format, clang-tidy |
| Zig | zig-format |
| General | Prettier |

**Standards**: C++23, TypeScript 5.9.2

### Memory Safety

- **ASAN** (AddressSanitizer) enabled by default in debug
- Heap snapshots for leak detection
- Custom allocators with safety checks

---

## 🚀 Technical Innovations

### 1. Zig Language
- Low-level control with safety
- Compile-time capabilities (`comptime`)
- Zero-cost abstractions
- Cross-compilation support

### 2. JavaScriptCore Engine
- 4x faster startup than V8
- Lower memory footprint
- Optimized for short-lived processes
- Mobile-tested (Safari)

### 3. All-in-One Design
- Runtime (execute JS/TS)
- Package Manager (25x faster)
- Bundler (outperforms esbuild)
- Test Runner (faster than Jest)
- Transpiler (built-in TS/JSX)

### 4. Universal Plugin System
- Works for runtime and bundler
- Custom file loaders
- Asset processing
- Code transformations

---

## 📊 Key Metrics

### Monorepo
- **Packages**: 17
- **npm Scripts**: 70+
- **CI Workflows**: 25+

### Performance
- **Startup**: 5.2ms (vs 25.1ms Node.js)
- **npm Scripts**: 6ms (vs 170ms npm)
- **Install**: 25x faster than npm
- **Compile Time**: ~2.5 min (debug incremental)

---

## 🎓 Lessons for Agentic QE

### 1. Performance
✅ Binary caching over JSON
✅ Platform-specific syscalls
✅ Lazy loading
✅ Parallel processing (CPU × 2)
✅ Bytecode caching

### 2. Developer Experience
✅ Zero configuration defaults
✅ Dual command patterns (verbose/shorthand)
✅ Clear error messages with stack traces
✅ Watch mode for iteration
✅ Comprehensive CLI help

### 3. Testing
✅ Built-in test runner (no external deps)
✅ Jest compatibility
✅ AI-friendly modes (CLAUDECODE=1)
✅ Multiple reporters (junit, json, html)
✅ Concurrent execution
✅ Regression tracking by issue number

### 4. Build System
✅ Code generation for boilerplate
✅ Multiple build variants
✅ Shared caching (sccache)
✅ Incremental compilation

### 5. CI/CD
✅ Auto-detect CI environments
✅ Standard report formats (JUnit XML)
✅ Multi-platform builds
✅ GPG signing
✅ Automated dependency updates

### 6. Quality Gates
✅ Linting/formatting as CI gates
✅ Memory safety (ASAN)
✅ Regression tracking
✅ Benchmarking suite
✅ Automated issue management

### 7. Architecture
✅ Modular monorepo (17 packages)
✅ Layered design
✅ Plugin system
✅ Platform-specific implementations

### 8. Security
✅ Script sandboxing (opt-in trust)
✅ Minimum dependency age
✅ GPG signing
✅ Memory safety checks

---

## 📚 Resources

- **Docs**: https://bun.sh/docs
- **Repo**: https://github.com/oven-sh/bun
- **Contributing**: https://github.com/oven-sh/bun/blob/main/CONTRIBUTING.md
- **Discord**: (linked in README)

---

## 🔍 Deep Dive Documents

- **Full Analysis**: `/workspaces/agentic-qe-cf/docs/research/bun-project-analysis.md`
- **Coordination Memory**: `coordination:research/bun/comprehensive-analysis`

---

*Quick Reference - Agentic QE Fleet v2.3.5 | Research Agent | 2025-12-12*
