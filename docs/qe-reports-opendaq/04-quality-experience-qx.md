# Quality Experience (QX) Analysis: openDAQ C++ SDK

**Date:** 2026-03-30
**Scope:** openDAQ SDK repository at `/workspaces/agentic-qe/tmp/opendaq/`
**Analyst:** QX Partner (Agentic QE v3)
**SDK Version:** 3.40.x (based on changelog range)

---

## Executive Summary

openDAQ is a C++ data acquisition SDK whose primary "users" are developers integrating DAQ devices into their applications. This QX analysis examines the intersection of quality assurance and developer experience across 9 dimensions: API ergonomics, documentation quality, error diagnostics, getting-started experience, cross-module consistency, breaking change risk, binding quality, configuration complexity, and the overall developer journey.

**Overall QX Score: 3.2 / 5.0**

The SDK demonstrates strong architectural decisions -- a consistent builder pattern, a well-layered COM-style ABI, solid template ergonomics for readers, and a genuinely useful preset system for CMake. However, it suffers from thin error diagnostics, documentation that requires source-code spelunking, significant configuration complexity for newcomers, binding maturity gaps, and recurring typos in public API headers that erode trust.

### Top-Level Ratings

| # | Dimension | Score | Verdict |
|---|-----------|-------|---------|
| 1 | API Ergonomics | 3.5/5 | Good design, some friction |
| 2 | Documentation Quality | 2.5/5 | Structurally present but shallow |
| 3 | Error Messages & Diagnostics | 2.0/5 | Significant gap |
| 4 | Getting Started Experience | 3.0/5 | Workable but not welcoming |
| 5 | SDK Consistency | 4.0/5 | Strong cross-module patterns |
| 6 | Breaking Change Risk | 3.0/5 | Changelog exists but no deprecation discipline |
| 7 | Binding Quality | 2.5/5 | Functional but not idiomatic |
| 8 | Configuration Complexity | 2.5/5 | Too many knobs, too few defaults |
| 9 | Developer Journey Mapping | 3.0/5 | Reasonable but friction-heavy |

---

## 1. API Ergonomics (3.5 / 5)

### Strengths

**Builder pattern is consistent and well-executed.** The SDK applies the builder pattern systematically across readers, data descriptors, instance configuration, dimensions, scaling, and more. There are 20+ builder interfaces (`*_builder.h` files found under `core/`), all following the same `Builder() -> set*() -> build()` contract. Example from `reader_factory.h` lines 68-73:

```cpp
auto reader = StreamReaderBuilder()
                  .setSignal(signal)
                  .setValueReadType(SampleType::Float64)
                  .setDomainReadType(SampleType::Int64)
                  .setSkipEvents(true)
                  .build();
```

This is a textbook fluent API. It works well.

**Template-based factory overloads reduce boilerplate.** The reader factory provides both enum-based and template-based overloads (`reader_factory.h` lines 138-170). A developer can write `StreamReader<double, uint64_t>(signal)` instead of spelling out `SampleType::Float64`. This is good ergonomics.

**The `Instance()` factory with sensible defaults.** Creating an SDK instance is a one-liner: `Instance(MODULE_PATH)` (instance_factory.h, line 61). The default parameter for `modulePath` is empty string, and `localId` defaults to either an environment variable or a random UUID. This removes ceremony from the happy path.

### Friction Points

**Parameter ordering in factory functions is inconsistent.** Compare two reader factories in `reader_factory.h`:

- `StreamReader(signal, valueReadType, domainReadType, mode, timeoutType)` -- signal first (line 119)
- `TailReader(signal, historySize, valueReadType, domainReadType, mode)` -- signal first, then size (line 239)
- `BlockReaderFromExisting(invalidatedReader, blockSize, valueReadType, domainReadType)` -- the factory (line 370)
- But `BlockReaderFromExisting_Create` is called with `(invalidatedReader, valueReadType, domainReadType, blockSize)` -- different order (line 375)

At line 375, the wrapper function takes `(reader, blockSize, valueReadType, domainReadType)` but calls the underlying factory as `(reader, valueReadType, domainReadType, blockSize)`. This parameter reordering between the public API and the internal `_Create` function is a bug waiting to happen during maintenance and a violation of the principle of least surprise.

**Overload explosion in reader factories.** `reader_factory.h` is 531 lines containing approximately 40 free functions and templates for creating readers. The file mixes `StreamReader`, `StreamReaderFromPort`, `StreamReaderFromExisting`, `StreamReaderFromBuilder`, then repeats for `TailReader`, `BlockReader`, and `MultiReader`, plus the "Ex" variants like `MultiReaderEx`. A newcomer seeing 6+ ways to create a `StreamReader` will struggle to know which one to use. There is no guidance comment directing to the recommended approach.

**The `MultiReaderEx` naming is opaque.** At line 447 of `reader_factory.h`, `MultiReaderEx` adds parameters for `requiredCommonSampleRate`, `startOnFullUnitOfDomain`, and `minReadCount`. The "Ex" suffix is a Windows API legacy pattern that provides no information about what the "extended" version adds. A name like `MultiReaderWithSyncOptions` would be self-documenting.

**COM-style ABI leaks into public ergonomics.** Every interface uses `virtual ErrCode INTERFACE_FUNC methodName(outParam** result) = 0` (e.g., `device.h` line 88, `stream_reader.h` line 62). While this is necessary for the ABI boundary, the smart pointer wrappers that hide this are not always obvious. The documentation does not clearly explain the relationship between `IDevice`, `DevicePtr`, and the factory functions to a newcomer.

### Specific Issues

| File | Line | Issue |
|------|------|-------|
| `reader_factory.h` | 370-376 | Parameter order mismatch between public API and `_Create` call |
| `reader_factory.h` | 447 | `MultiReaderEx` -- opaque name |
| `reader_factory.h` | all | 40+ free functions without an index or grouping comment |
| `instance_builder.h` | 75-76 | "congigured" typo in @brief documentation (appears 3 times) |

---

## 2. Documentation Quality (2.5 / 5)

### Strengths

**Antora documentation structure is solid.** The `docs/Antora/modules/` directory contains 5 well-organized modules: `explanations/`, `howto_guides/`, `reference/`, `ROOT/`, and `tutorials/`. There are 51 Asciidoc pages covering architecture, readers, signals, packets, device management, and more. The tutorials section includes language-specific setup guides for C++, Python, and C#.

**Doxygen is configured and uses modern styling.** The `Doxyfile.in` uses `doxygen-awesome-css` for modern appearance. The Doxygen group annotations in `opendaq.h` (lines 108-215) create a navigable hierarchy of groups (Devices, Signals, Readers, etc.).

**Header comments on interfaces are thorough when present.** The `IDevice` interface in `device.h` (lines 52-80) has a comprehensive block comment explaining the three device types (Physical, Client, Function Block), their relationships, and how to use the API. Similarly, `IDataDescriptor` in `data_descriptor.h` (lines 47-74) documents every field with examples.

### Gaps

**Inline documentation quality is uneven.** The `IInstanceBuilder` in `instance_builder.h` has a 50-line documentation block (lines 39-90) -- good. But it contains multiple typos: "schduler" (line 71), "congigured" (lines 76, 78, 81). These are in the primary entry-point interface that every developer sees first.

**Factory functions lack "when to use" guidance.** In `reader_factory.h`, each of the ~40 factory functions has a brief `@brief` comment, but none explain *when* a developer should choose one over another. There is no comment like "prefer the Builder API for new code" or "use this overload when working with ports instead of signals."

**Error codes have no human-readable descriptions in headers.** The error header files define codes as preprocessor macros (e.g., `OPENDAQ_ERR_READER_UNKNOWN` in `reader_errors.h` line 28) but provide no inline documentation about what causes them or how to resolve them. The corresponding exception definitions (e.g., `reader_exceptions.h` line 36: `"Samples can't be read or converted to the wanted type"`) are slightly better but still generic.

**Four error header files define zero error codes.** The following files contain an error type macro but no actual error codes:
- `function_block_errors.h` -- 0 errors (and has a typo: `OPENDAQ_ERRTYPE_FUCTION_BLOCK`)
- `logger_errors.h` -- 0 errors
- `device_errors.h` -- 0 errors
- `utility_errors.h` -- 0 errors

This means four major subsystems (function blocks, logger, device, utility) have no domain-specific error codes at all. All errors from these subsystems must fall through to generic codes like `OPENDAQ_ERR_GENERALERROR`, which provides no diagnostic value.

**Typos in public API headers.**

| File | Line | Typo | Correct |
|------|------|------|---------|
| `function_block_errors.h` | 27 | `FUCTION_BLOCK` | `FUNCTION_BLOCK` |
| `instance_builder.h` | 71 | `schduler` | `scheduler` |
| `instance_builder.h` | 76, 78 | `congigured` | `configured` |
| `stream_reader.h` | 61, 79 | `getReadStatu` | `getReadStatus` |
| `mock_fb.h` | variable | `nesteadFbCount` | `nestedFbCount` |
| `changelog_3.20-3.30.md` | 37 | `proporties` | `properties` |
| `changelog_3.30-3.40.md` | 12 | `dyinamically` | `dynamically` |

These typos are in public headers that developers read daily. They erode confidence in code quality.

---

## 3. Error Messages & Diagnostics (2.0 / 5)

### Strengths

**Structured error code system with type categories.** The error system uses a bitfield layout: `0x80000000 | (TYPE_ID << 16) | ERROR_CODE` (defined in `coretypes/errors.h` line 25). There are 9 error type categories (Generic, OpenDAQ, FunctionBlock, ModuleManager, Scheduler, Logger, Device, Signal, Reader, Component, Utility). The `OPENDAQ_FAILED()` and `OPENDAQ_SUCCEEDED()` macros (lines 28-29) follow a familiar COM pattern.

**Exception messages exist for most error codes.** Each `*_exceptions.h` file defines human-readable exception messages. For example, `signal_exceptions.h` provides 11 specific messages like "Packet data buffer memory allocation failed" and "Input port does not accept the provided signal."

**Reader status provides structured error context.** The `IReaderStatus` interface returns a `ReadStatus` enum that distinguishes between `Ok`, `Event`, and failure states. The documentation in `stream_reader.h` (lines 57-61) explains the three cases.

### Critical Gaps

**50+ generic error codes but only 23 domain-specific ones.** The `coretypes/errors.h` file defines approximately 50 generic error codes (`OPENDAQ_ERR_NOMEMORY`, `OPENDAQ_ERR_INVALIDPARAMETER`, `OPENDAQ_ERR_NOTFOUND`, etc.). But across all 9 domain-specific error files, there are only 23 total domain-specific codes (signal: 11, module_manager: 5, scheduler: 4, reader: 2, component: 1, and device/logger/utility/function_block: 0 each).

This means the vast majority of errors a developer encounters will be generic codes like `OPENDAQ_ERR_INVALIDPARAMETER` or `OPENDAQ_ERR_CALLFAILED` with no indication of *which* parameter was invalid or *what* call failed. A developer debugging a connection issue gets `OPENDAQ_ERR_GENERALERROR` instead of something like `OPENDAQ_ERR_DEVICE_UNREACHABLE` or `OPENDAQ_ERR_PROTOCOL_MISMATCH`.

**No contextual error information.** The error system is based on numeric codes. There is no `IErrorInfo` pattern that carries the failed parameter name, the attempted value, or a stack context. When a developer gets `OPENDAQ_ERR_INVALIDPARAMETER`, they must binary-search through their code to find which of potentially many parameters was wrong.

**Missing error codes for common failure modes.** The `device_errors.h` file defines a type category (`0x08u`) but zero actual error codes. This means device-related failures like "device not found," "connection timeout," "authentication failed," or "incompatible firmware version" all map to generic errors. The same is true for function blocks, logger, and utility.

**Exception messages are generic.** Examples:
- `"Unknown reader exception"` (`reader_exceptions.h` line 35) -- provides zero diagnostic value
- `"Samples can't be read or converted to the wanted type"` (line 36) -- does not say what the actual type was or what was expected
- `"Lost connection to the server."` (`exceptions.h` line 23) -- does not include which server or why

**No structured logging of error context.** The SDK has a logger subsystem (`core/opendaq/logger/`), but errors at the interface boundary are communicated solely through error codes. A developer cannot correlate an `OPENDAQ_ERR_CALLFAILED` with any log output to understand what happened internally.

---

## 4. Getting Started Experience (3.0 / 5)

### Strengths

**README provides a complete build workflow.** The `README.md` covers prerequisites, clone, CMake configure, and build for both Windows and Linux. The preset system (`cmake --list-presets=all` then `cmake --preset "x64/gcc/full/debug"`) is a good UX pattern that eliminates guessing.

**The `empty_example.cpp` is genuinely minimal.** At 18 lines (including comments), it demonstrates the absolute minimum code to create an openDAQ instance:

```cpp
const InstancePtr instance = Instance(MODULE_PATH);
```

This is the correct approach for a "hello world" -- zero ceremony, one meaningful line.

**Python quick-start is excellent.** The `quick_start_application.py` (65 lines in `examples/applications/python/Integration Examples/`) walks through: instance creation, device discovery, signal reading with `StreamReader`, domain value scaling, and function block wiring. It is self-contained and runnable. This is the best onboarding artifact in the SDK.

**Antora tutorials cover all three primary languages.** The `tutorials/` directory includes `quick_start_setting_up_cpp.adoc`, `quick_start_setting_up_python.adoc`, and `quick_start_setting_up_csharp.adoc` plus `quick_start_building_opendaq.adoc` for building from source.

### Friction Points

**MODULE_PATH is a build-time macro, not a runtime concept.** Every C++ example uses `Instance(MODULE_PATH)`, but `MODULE_PATH` is a CMake-defined preprocessor macro. A developer copy-pasting from the example without the example's CMakeLists.txt will get a compilation error with no explanation. The `Instance()` default constructor with empty string is documented (instance_factory.h line 61) but never shown in examples.

**BUILD.md is misleadingly empty.** The `BUILD.md` file is only 31 lines and immediately defers to `README.md` and `CMake-Options.md`. A file named "BUILD" should contain build instructions. Instead, it contains a niche note about custom Boost versions and ARM cross-compilation. This creates a dead-end in the documentation journey.

**No "hello world" output.** The `empty_example.cpp` prints "Press enter to exit" but produces no meaningful output. The `stream_reader_example.cpp` does print signal values, but it requires understanding of `device.getSignalsRecursive()[0]`, readers, domain descriptors, and tick resolution -- all in one file. There is no intermediate step between "create instance" and "fully read signal data."

**Example applications require multiple module flags.** To build examples, a developer must set `APP_ENABLE_EXAMPLE_APPS=ON` plus `DAQMODULES_REF_FB_MODULE=ON` and `DAQMODULES_REF_DEVICE_MODULE=ON`. If any flag is missing, the build silently skips examples with no warning. A newcomer following the README with the "full" preset will get examples; anyone using a minimal preset will not, and will not know why.

**No package manager support documented.** There is no mention of Conan, vcpkg, or any C++ package manager. The only installation paths are: download binaries from docs.opendaq.com, or build from source with a 358-line CMakeBasePresets.json file. For a modern C++ SDK, the absence of `vcpkg.json` or `conanfile.py` is a significant gap.

---

## 5. SDK Consistency (4.0 / 5)

### Strengths

**All modules follow the same header organization.** Every subsystem under `core/opendaq/` follows the identical pattern:

```
{module}/include/opendaq/{type}.h              -- interface
{module}/include/opendaq/{type}_impl.h         -- implementation
{module}/include/opendaq/{type}_factory.h      -- factory functions
{module}/include/opendaq/{type}_errors.h       -- error codes
{module}/include/opendaq/{type}_exceptions.h   -- exception classes
```

This is true for `reader/`, `signal/`, `device/`, `streaming/`, `component/`, `scheduler/`, `logger/`, `modulemanager/`, and `functionblock/`. A developer who learns the pattern in one module can navigate all others.

**Builder pattern is uniformly applied.** All complex objects use builders: `StreamReaderBuilder`, `BlockReaderBuilder`, `TailReaderBuilder`, `MultiReaderBuilder`, `DataDescriptorBuilder`, `InstanceBuilder`, `DimensionBuilder`, `ScalingBuilder`, etc. All follow the same `Builder() -> set*() -> build()` contract. 20+ builder types were found across the codebase.

**Smart pointer naming is consistent.** Every interface `IFoo` has a corresponding `FooPtr` smart pointer wrapper. The naming convention `{InterfaceName}Ptr` is applied without exception across the 702 public headers found under `core/`.

**Error/exception pairing is consistent.** Each `*_errors.h` defining `OPENDAQ_ERR_*` constants has a matching `*_exceptions.h` defining `DEFINE_EXCEPTION(Name, ErrorCode, "message")`. The pattern is identical in all 7 subsystems that have both files.

### Minor Inconsistencies

**Factory function naming diverges for "FromPort" variants.** Some factories use `FromPort` suffix (`StreamReaderFromPort`, `TailReaderFromPort`), but the multi-reader uses `MultiReaderFromPort` -- which internally calls `MultiReader_Create` (not `MultiReaderFromPort_Create`). At `reader_factory.h` lines 438-445, `MultiReaderFromPort` is a convenience alias that differs from the other `*FromPort` functions in its implementation approach.

**Example files lack consistent naming.** C++ examples mix naming conventions:
- `stream_reader_example.cpp` (underscored)
- `reader_basics_example.cpp` (underscored)
- `client_local.cpp` (underscored, no "_example" suffix)
- `reconnection.cpp` (no prefix or suffix)
- `function_block_example.cpp` (underscored)

This is cosmetic but signals inconsistent maintenance attention.

---

## 6. Breaking Change Risk (3.0 / 5)

### Strengths

**Changelog files document breaking changes explicitly.** The `changelog/` directory contains 6 files covering versions 1.0.0 through 3.40. Recent changelogs (3.10+) include dedicated "Required application changes" and "Required module changes" sections. For example, `changelog_3.30-3.40.md` lines 76-83 document the removal of `IFunctionBlockWrapper` and the requirement for devices to include DeviceType in DeviceInfo.

**Changelogs link to PRs.** Every entry in the changelog includes a GitHub PR link (e.g., `[#1051](https://github.com/openDAQ/openDAQ/pull/1051)`), enabling traceability from change to implementation.

**Version compatibility is enforced through CMake.** The `CMakeLists.txt` uses `ExactVersion` compatibility (line 424: `COMPATIBILITY ExactVersion`), which prevents silent ABI mismatches.

### Gaps

**No deprecation annotations in code.** Despite the changelog documenting removed features (e.g., `IFunctionBlockWrapper`), there are no `[[deprecated("use X instead")]]` attributes in the C++ headers. Features are simply removed between versions with no compile-time warning in the intermediate releases.

**No API stability policy.** There is no document stating which APIs are stable, which are experimental, and what the deprecation timeline is. The changelogs show breaking changes in every minor version (3.10, 3.20, 3.30, 3.40), but there is no semver commitment or stability guarantee.

**Breaking changes in minor versions.** The version numbering follows a `3.X0` pattern (3.10, 3.20, 3.30, 3.40), and every one of these contains "Required application changes" sections. This means any minor version upgrade can break user code, which is a high upgrade cost for an SDK.

**No migration guide.** The "Required changes" sections describe *what* changed but not *how* to migrate. For example, `changelog_3.30-3.40.md` says "The IFunctionBlockWrapper interface was removed" but does not provide a before/after code snippet showing what to change.

---

## 7. Binding Quality (2.5 / 5)

### Python Bindings

**Strengths:**
- The `__init__.py` (in `bindings/python/package/opendaq/`) wraps the `Instance()` factory to automatically set `module_path` to the package directory. This eliminates the `MODULE_PATH` problem that affects C++ users.
- Python property access uses snake_case (`signal.last_value`, `device.signals_recursive`, `descriptor.tick_resolution`) which is idiomatic Python.
- The test suite (`bindings/python/tests/`) includes 17 test files covering core types, readers, properties, architecture, and quick-start scenarios. The `test_doc_quick_start.py` validates that the documentation examples actually work.

**Gaps:**
- The `__init__.py` contains `from .opendaq import *` (line 1), which is a wildcard import. This pollutes the namespace and makes it impossible for IDEs to determine available symbols without runtime introspection.
- A BUG comment in `__init__.py` (line 8) acknowledges a macOS build issue with return type annotations. This is a shipped workaround, not a fix.
- The stubs generation (`OPENDAQ_GENERATE_PYTHON_BINDINGS_STUBS`) is OFF by default. Without stubs, Python developers get no IDE auto-completion for any openDAQ type.
- No `pip install` from PyPI is documented. The distribution mechanism is building from source or downloading wheels.

### C# / .NET Bindings

**Strengths:**
- The namespace `Daq.Core.OpenDAQ` is properly structured for .NET conventions.
- The `OpenDAQFactory` class (in `bindings/dotnet/...core/opendaq/OpenDAQFactory.cs`) provides a static factory pattern with `SdkVersion` property and P/Invoke declarations. This is an appropriate C#-to-native bridge pattern.
- The demo application (`openDAQDemo.Net`) is a full WinForms application demonstrating device browsing, function block configuration, and signal display.

**Gaps:**
- The factory file contains `#warning Building manually extended factory for SampleReaders` (line 29), indicating the code generation does not fully cover the reader APIs and manual extensions are required. This is fragile.
- The `#define _WIN32` at line 18 of `OpenDAQFactory.cs` hardcodes a Windows platform assumption in a source file, which will cause issues for any .NET Core cross-platform usage.
- The type mapping for `SampleType.RangeInt64` returns `null` (line 80 of the reader factory), meaning developers who encounter this type will get a NullReferenceException at runtime with no explanation.
- C# bindings are documented as "in development" in the README. There is no C# quick-start guide equivalent to the Python one.
- No NuGet package support is documented.

### C Bindings

- C bindings exist (`bindings/c/`) and can be generated via `OPENDAQ_GENERATE_C_BINDINGS=OFF` (default OFF). Since the primary C++ API already uses a COM-like ABI, the C bindings are inherently thin. No analysis of C binding quality was performed as they are disabled by default.

---

## 8. Configuration Complexity (2.5 / 5)

### Quantitative Assessment

| Category | Count |
|----------|-------|
| CMake options (`option()`) | 36 |
| CMake dependent options (`cmake_dependent_option()`) | 7 |
| CMake presets (base file) | 358 lines |
| Documented options in `CMake-Options.md` | 7 tables, ~40 options |
| Total knobs a developer may encounter | ~43 |

### Strengths

**Preset system reduces manual configuration.** The `cmake --list-presets=all` + `cmake --preset` workflow hides most complexity. The `CMakeBasePresets.json` defines composable presets for compiler, build type, and feature sets. A developer picking `x64/gcc/full/debug` gets a working configuration without understanding individual options.

**Options documentation is well-organized.** `CMake-Options.md` categorizes options into 7 clear tables (Feature, Bindings, Modules, Test, External Dependencies, Documentation, Other) with Type, Default Value, Description, and Conditions columns. This is better than most C++ projects.

### Friction Points

**Almost everything is OFF by default.** Key features that most developers need are disabled:
- `OPENDAQ_ENABLE_WEBSOCKET_STREAMING=OFF`
- `OPENDAQ_ENABLE_NATIVE_STREAMING=OFF`
- `OPENDAQ_ENABLE_OPCUA=OFF`
- `DAQMODULES_OPENDAQ_CLIENT_MODULE=OFF`
- `DAQMODULES_OPENDAQ_SERVER_MODULE=OFF`
- `DAQMODULES_REF_DEVICE_MODULE=OFF`
- `DAQMODULES_REF_FB_MODULE=OFF`
- `APP_ENABLE_EXAMPLE_APPS=OFF`

A developer who runs `cmake -Bbuild .` without a preset will get an SDK that cannot connect to any device, has no streaming, no OPC UA, no examples, no reference device, and no function blocks. It compiles, but does nothing useful. The "full" preset exists but is not the default.

**Dependent option chains are complex.** Running Python binding tests requires: `OPENDAQ_GENERATE_PYTHON_BINDINGS=ON` AND `OPENDAQ_ENABLE_TESTS=ON` AND `OPENDAQ_ENABLE_OPCUA=ON` AND `OPENDAQ_ENABLE_NATIVE_STREAMING=ON` AND `OPENDAQ_ENABLE_WEBSOCKET_STREAMING=ON` AND `DAQMODULES_OPENDAQ_CLIENT_MODULE=ON` AND `DAQMODULES_OPENDAQ_SERVER_MODULE=ON` AND `DAQMODULES_REF_FB_MODULE=ON` AND `DAQMODULES_REF_DEVICE_MODULE=ON`. That is 9 flags for one test target. Missing any one silently disables the tests.

**Silent skip behavior.** When prerequisites are not met, options are silently ignored rather than producing errors. The CMake-Options.md documents this behavior (e.g., "otherwise, the option is ignored"), but a developer who sets `APP_ENABLE_EXAMPLE_APPS=ON` without the required modules will see no error -- the examples simply do not build.

**Typo in option name.** `OPENDAQ_LINK_3RD_PARTY_LIBS_STATICALY` at `CMakeLists.txt` line 102 -- "STATICALY" should be "STATICALLY". This is a public-facing CMake option that appears in cached variables and documentation.

---

## 9. Developer Journey Mapping (3.0 / 5)

### Journey Stages

#### Stage 1: Discover (3.5/5)

The GitHub README clearly states what openDAQ is ("bridges the gap between data acquisition devices") with a feature list, platform support matrix, and links to documentation. The three "Getting started" links (Downloads, User docs, API docs) are prominent. **Friction:** The README lists "Wrappers for Python and Delphi (C# in development)" -- a developer evaluating C# support will be uncertain whether to proceed.

#### Stage 2: Install (2.5/5)

**Binary installation** is documented for Windows (.exe installer) and Ubuntu (.deb package) in the Antora tutorials. **Source build** requires CMake 3.24+, Git, a C++ compiler, and either Visual Studio or Ninja. **Friction:** There is no `pip install opendaq` documented (though wheels may exist). There is no Conan/vcpkg recipe. The only C++ installation path is build-from-source or platform-specific installers. For a developer on Fedora, Arch, macOS without Homebrew, or any non-Ubuntu Linux, there is no documented path.

#### Stage 3: Hello World (3.0/5)

The `empty_example.cpp` gets to a compiled instance in 18 lines. The Python `Instance()` call is genuinely one line. **Friction:** The C++ example requires `MODULE_PATH` (a CMake macro) and the "full" preset. A developer who installs from the .deb package and tries to write their own CMakeLists.txt must figure out `find_package(openDAQ)` usage with no example CMakeLists.txt in the README.

#### Stage 4: Integrate (3.0/5)

The `stream_reader_example.cpp` and `reader_basics_example.cpp` show practical integration patterns. The Python examples are organized by topic (Discovery, Components, Data Path, Properties, Function Blocks). **Friction:** The reader API has ~40 factory overloads. The jump from "create instance" to "read signal data" requires understanding signals, descriptors, readers, domains, and tick resolution. There is no progressive tutorial that introduces these concepts one at a time.

#### Stage 5: Debug (1.5/5)

This is the weakest stage. When something goes wrong:
- Error codes are numeric with no `strerror()` equivalent
- Four subsystems have zero domain-specific error codes
- Exception messages are generic ("Unknown reader exception")
- There is no troubleshooting guide in the documentation
- The logger exists but its output is not correlated with error codes
- The `OPENDAQ_ENABLE_ERROR_GUARD` option (auto-enabled in Debug builds, CMakeLists.txt line 116) exists but is undocumented for end users

A developer encountering `OPENDAQ_ERR_CALLFAILED` has no structured path to diagnose the issue beyond reading source code.

#### Stage 6: Upgrade (2.5/5)

The changelog documents what changed, but:
- No deprecation warnings before removal
- No migration guides with code examples
- Breaking changes in every minor version
- `ExactVersion` compatibility means even patch upgrades may fail
- No codemods or automated migration tools

---

## Prioritized Recommendations

### Priority 1 -- Critical (High impact, achievable effort)

| # | Recommendation | Effort | Expected Impact |
|---|----------------|--------|-----------------|
| 1.1 | Add domain-specific error codes for device, function_block, logger, and utility subsystems. At minimum: device connection failures, timeout, authentication errors, incompatible versions. | Medium | Reduces debug time by 50%+ |
| 1.2 | Fix the `FUCTION_BLOCK` typo in `function_block_errors.h` and all other typos in public headers (`schduler`, `congigured`, `getReadStatu`, `STATICALY`). | Low | Immediate trust improvement |
| 1.3 | Add `[[deprecated]]` attributes to APIs before removing them. Maintain one release with deprecation warnings before deletion. | Low | Eliminates upgrade surprise |

### Priority 2 -- High (Significant improvement, moderate effort)

| # | Recommendation | Effort | Expected Impact |
|---|----------------|--------|-----------------|
| 2.1 | Create an error-to-string utility function that maps `OPENDAQ_ERR_*` codes to human-readable descriptions including cause and resolution guidance. | Medium | Transforms debugging experience |
| 2.2 | Add a "Recommended Approach" comment at the top of `reader_factory.h` directing newcomers to the Builder API as the preferred creation method. | Low | Reduces overload confusion |
| 2.3 | Change Python bindings `__init__.py` from `from .opendaq import *` to explicit imports, and enable stub generation by default. | Medium | IDE experience improvement |
| 2.4 | Add a `find_package` + minimal `CMakeLists.txt` example to the README for developers who install from packages rather than building from source. | Low | Unblocks post-install integration |
| 2.5 | Create a "full-by-default" CMake preset or clearly document that the minimal build is intentionally non-functional. | Low | Reduces first-build frustration |

### Priority 3 -- Medium (Quality-of-life improvements)

| # | Recommendation | Effort | Expected Impact |
|---|----------------|--------|-----------------|
| 3.1 | Add a troubleshooting/debugging guide to Antora documentation covering common errors, their meanings, and resolution steps. | Medium | Fills the Stage 5 gap |
| 3.2 | Remove the `#define _WIN32` hardcode from the C# `OpenDAQFactory.cs` and implement proper platform detection. | Low | Enables cross-platform .NET |
| 3.3 | Handle `SampleType.RangeInt64` in the C# type mapping instead of returning `null`. | Low | Prevents NRE at runtime |
| 3.4 | Standardize C++ example naming: all should use `{feature}_example.cpp` pattern. | Low | Consistency signal |
| 3.5 | Add a progressive tutorial that introduces concepts incrementally: Instance -> Device -> Signal -> Descriptor -> Reader -> Domain. | High | Dramatically improves onboarding |
| 3.6 | Publish Python wheels to PyPI and C# packages to NuGet. | High | Removes installation friction |

---

## Appendix A: Files Examined

### Public API Headers
- `core/opendaq/opendaq/include/opendaq/opendaq.h`
- `core/opendaq/opendaq/include/opendaq/instance_factory.h`
- `core/opendaq/opendaq/include/opendaq/instance.h`
- `core/opendaq/opendaq/include/opendaq/instance_builder.h`
- `core/opendaq/opendaq/include/opendaq/errors.h`
- `core/opendaq/opendaq/include/opendaq/exceptions.h`
- `core/opendaq/reader/include/opendaq/reader_factory.h` (531 lines)
- `core/opendaq/reader/include/opendaq/stream_reader.h`
- `core/opendaq/reader/include/opendaq/reader_errors.h`
- `core/opendaq/reader/include/opendaq/reader_exceptions.h`
- `core/opendaq/signal/include/opendaq/signal_errors.h`
- `core/opendaq/signal/include/opendaq/signal_exceptions.h`
- `core/opendaq/signal/include/opendaq/data_descriptor.h`
- `core/opendaq/device/include/opendaq/device.h`
- `core/opendaq/device/include/opendaq/device_errors.h`
- `core/opendaq/component/include/opendaq/component_errors.h`
- `core/opendaq/functionblock/include/opendaq/function_block_errors.h`
- `core/opendaq/modulemanager/include/opendaq/module_manager_errors.h`
- `core/opendaq/scheduler/include/opendaq/scheduler_errors.h`
- `core/opendaq/logger/include/opendaq/logger_errors.h`
- `core/opendaq/utility/include/opendaq/utility_errors.h`
- `core/coretypes/include/coretypes/errors.h`

### Build Configuration
- `CMakeLists.txt` (474 lines)
- `CMake-Options.md` (108 lines)
- `CMakeBasePresets.json` (358 lines)
- `BUILD.md` (31 lines)
- `README.md` (228 lines)

### Examples
- `examples/applications/cpp/empty_example/empty_example.cpp`
- `examples/applications/cpp/stream_reader_example/stream_reader_example.cpp`
- `examples/applications/cpp/reader_basics_example/reader_basics_example.cpp`
- `examples/applications/python/Integration Examples/quick_start_application.py`

### Bindings
- `bindings/python/package/opendaq/__init__.py`
- `bindings/python/tests/test_doc_quick_start.py`
- `bindings/dotnet/openDAQ.Net/openDAQ.Net/core/opendaq/OpenDAQFactory.cs`
- `bindings/dotnet/openDAQ.Net/openDAQ.Net/core/opendaq/reader/OpenDAQFactory.cs`
- `bindings/dotnet/openDAQ.Net/openDAQDemo.Net/frmMain.cs`

### Documentation
- `docs/Antora/modules/tutorials/pages/quick_start.adoc`
- `docs/Antora/modules/tutorials/pages/quick_start_setting_up_cpp.adoc`
- `docs/Doxygen/Doxyfile.in`

### Changelogs
- `changelog/changelog_3.30-3.40.md`
- `changelog/changelog_3.20-3.30.md`
- `changelog/changelog_3.10-3.20.md`

### Statistics
- Total public headers: 702
- C++ example files: 111
- Python example files: 65
- Antora documentation pages: 51
- CMake options: 43
- Builder pattern interfaces: 20+
- Error code count (domain-specific): 23
- Error code count (generic): ~50

---

## Appendix B: Methodology

This analysis was conducted by reading actual source files, not by running the build or executing tests. Findings are based on static analysis of:

1. Public API header files for ergonomics, naming, documentation, and consistency
2. Error/exception headers for diagnostic quality
3. Example files for getting-started experience
4. Build configuration for complexity assessment
5. Binding source files for language idiom adherence
6. Changelog files for breaking change patterns
7. Documentation structure for coverage and accuracy

Each dimension was scored on a 1-5 scale:
- 5: Exemplary, sets industry standard
- 4: Good, minor issues only
- 3: Adequate, notable gaps
- 2: Below expectations, significant issues
- 1: Critical gaps, blocks developer productivity
