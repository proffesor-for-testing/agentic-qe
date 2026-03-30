# openDAQ C++ SDK -- Test Quality and Coverage Analysis

**Report ID**: QE-OPENDAQ-06
**Date**: 2026-03-30
**Scope**: Comprehensive test suite assessment across all modules
**Test Framework**: Google Test (gtest/gmock)
**Total Test Files**: 307 `.cpp` test source files
**Total Test Lines of Code**: ~92,700 lines
**Total Test Cases**: ~3,498 (TEST_F, TEST_P, TEST, TYPED_TEST macros)

---

## 1. Test Coverage Assessment

### 1.1 Core SDK Modules (`core/opendaq/`)

All 14 modules under `core/opendaq/` have test directories. Every module is tested.

| Module | Test Files | Source Files | Headers | Coverage Assessment |
|--------|-----------|-------------|---------|-------------------|
| signal | 30 | 26 | 97 | **Excellent** -- deepest test coverage in the project |
| reader | 10 | 13 | 37 | **Excellent** -- extensive parameterized tests across types |
| modulemanager | 12 | 9 | 28 | **Good** -- includes mock modules for plugin testing |
| device | 11 | 13 | 46 | **Good** -- covers device tree, info, capabilities |
| opendaq | 7 | 12 | 23 | **Good** -- instance, core events, access control |
| component | 8 | 8 | 41 | **Good** -- serialization, tags, folders, status |
| scheduler | 8 | 5 | 19 | **Good** -- single/multi-threaded, work scheduling |
| streaming | 7 | 2 | 19 | **Good** -- mock-heavy, state machine tests |
| logger | 4 | 6 | 21 | **Adequate** -- sink and component tests |
| functionblock | 5 | 1 | 9 | **Adequate** -- basic FB and channel tests |
| utility | 5 | 5 | 14 | **Adequate** -- packet buffer, IDs, allocator |
| server | 3 | 1 | 5 | **Thin** -- minimal server type tests |
| synchronization | 2 | 1 | 4 | **Thin** -- only sync component basics |
| context | 1 | 0 | 2 | **Minimal** -- test_app.cpp only (fixture entry) |

### 1.2 Core Foundation Libraries

| Library | Test Files | Assessment |
|---------|-----------|-----------|
| `core/coretypes` | 46 .cpp | **Excellent** -- comprehensive type system tests |
| `core/coreobjects` | 30 .cpp | **Excellent** -- property system thoroughly tested |

### 1.3 Shared Libraries (`shared/libraries/`)

| Library | Test Files | Source Files | Assessment |
|---------|-----------|-------------|-----------|
| config_protocol | 16 | 10 | **Excellent** -- client/server, serialization, access control, core events |
| native_streaming_protocol | 5 | 7 | **Good** -- protocol and packet tests |
| packet_streaming | 3 | 3 | **Good** -- packet assembly/disassembly |
| signal_generator | 2 | 1 | **Adequate** |
| utils | 5 | 4 | **Adequate** -- thread, timer, finally patterns |
| **discovery** | **0** | **1** | **UNTESTED** -- mDNS discovery client |
| **discovery_common** | **0** | **1** | **UNTESTED** -- shared discovery utilities |
| **discovery_server** | **0** | **1** | **UNTESTED** -- mDNS discovery server |
| **testutils** | **0** | **1** | N/A -- test infrastructure library |

**Critical gap**: The entire discovery subsystem (3 libraries) has zero test coverage. Network discovery is inherently error-prone and a prime candidate for flakiness in integration scenarios.

### 1.4 Modules (`modules/`)

| Module | Test Files | Source Files | Assessment |
|--------|-----------|-------------|-----------|
| native_streaming_client_module | 2 | 6 | **Thin** -- 15 tests for 6 source files |
| native_streaming_server_module | 2 | 4 | **Thin** -- 8 tests for 4 source files |

The modules rely heavily on integration tests in `tests/integration/` rather than having comprehensive unit tests of their own. This is an architectural decision but creates a gap in isolated module testing.

### 1.5 Bindings

| Binding | Test Files | Assessment |
|---------|-----------|-----------|
| C bindings | 16 .cpp | **Good** -- covers coretypes, coreobjects, all opendaq modules |
| Python bindings | 15 .py | **Good** -- property system, readers, devices, architecture |
| **.NET bindings** | **0** | **UNTESTED** -- only demo application code, no tests |

**Critical gap**: The .NET/C# bindings have no automated tests despite being generated and shipped. The `bindings/dotnet/` directory contains only a demo application (`openDAQDemo.Net`).

### 1.6 Integration & Regression Tests

| Category | Files | Test Count | Assessment |
|----------|-------|-----------|-----------|
| Integration (device modules) | 11 .cpp + 2 .h | ~78 tests | **Good** -- covers native, OPC UA, websocket protocols |
| Integration (ref modules) | 2 .cpp + 1 .h | ~1 test suite | **Minimal** |
| Regression tests | 9 .cpp + 1 .h | ~80 tests | **Good** -- protocol-parameterized regression suite |
| Documentation tests | 16 .cpp | ~103 tests | **Good** -- ensures code examples compile and run |

### 1.7 Example Module Tests

Example modules have their own tests (25 test files). This is notable and positive -- the examples are themselves tested, which ensures documentation accuracy.

---

## 2. Test Quality Analysis

### 2.1 Assertion Quality

Quantitative analysis of assertion patterns across all test files:

| Assertion Type | Count | Percentage |
|---------------|-------|-----------|
| `ASSERT_EQ` / `ASSERT_NE` / `ASSERT_GT` / `ASSERT_LT` / `ASSERT_GE` / `ASSERT_LE` | 7,094 | 54.5% |
| `ASSERT_TRUE` / `ASSERT_FALSE` | 1,823 | 14.0% |
| `ASSERT_THROW` / `ASSERT_NO_THROW` / `ASSERT_THROW_MSG` | 1,395 | 10.7% |
| `EXPECT_CALL` (mock verification) | 176 | 1.4% |
| Other (ASSERT_FLOAT_EQ, etc.) | ~2,500 | 19.4% |

**Verdict**: Assertion quality is **strong**. The 54.5% proportion of specific equality assertions (`ASSERT_EQ`) over boolean assertions (`ASSERT_TRUE`) is a healthy ratio. Boolean assertions are used primarily for truthiness checks (`.assigned()`, `.getActive()`) where they are appropriate, not as lazy stand-ins for specific comparisons.

**Good example** -- specific assertions with meaningful comparisons:

```cpp
// core/opendaq/component/tests/test_component.cpp, line 33
ASSERT_EQ(comp.getGlobalId(), "/parent/child");
ASSERT_EQ(comp.getLocalId(), "child");
```

```cpp
// core/opendaq/signal/tests/test_signal.cpp, line 269
ASSERT_EQ(connections.getCount(), 0u);
// ...
ASSERT_THROW(checkErrorInfo(signal.asPtr<ISignalEvents>()->listenerConnected(conn2)),
             DuplicateItemException);
```

**Custom assertion macros** enhance readability:

```cpp
// shared/libraries/testutils/include/testutils/testutils.h, lines 47-73
#define ASSERT_THROW_MSG(STATEMENT, EXCEPTION_TYPE, MESSAGE)
```

This is well-designed -- it checks both the exception type AND message content, producing clear failure output.

### 2.2 Test Naming Conventions

The project uses a **consistent, descriptive naming convention** across modules:

| Pattern | Example | Assessment |
|---------|---------|-----------|
| Action | `Create`, `AddModule`, `Connect` | Clear but minimal |
| Behavior | `SignalConnections`, `RelatedSignals` | Tests behavior groups |
| Error case | `CreateNullThrows`, `ConnectFail` | Error paths named explicitly |
| State | `InactiveByDefault`, `DefaultIsMultiThreaded` | Describes expected state |
| Multi-action | `ActivateTwice`, `StartCompleteReconnection` | Describes scenarios |

**Strength**: Names like `CreateNullThrows`, `ScheduleWorkOnMainLoopThrowsIfMainLoopNotSet`, and `PropertyChangedNested` clearly describe the scenario being tested.

**Weakness**: Some tests use single-word names (`Create`, `Parent`, `Active`) that describe WHAT is tested but not WHAT SHOULD HAPPEN. Compare `Active` (line 45 in test_component.cpp) versus `InactiveByDefault` (line 34 in test_streaming.cpp) -- the latter is unambiguously self-documenting.

### 2.3 Test Smells Identified

#### Smell 1: Oversized Test Files

19 test files exceed 1,000 lines. The worst offenders:

| File | Lines | Issue |
|------|-------|-------|
| `reader/tests/test_multi_reader.cpp` | 5,236 | **Critical** -- single file, 106 tests |
| `test_native_device_modules.cpp` | 4,495 | **High** -- large integration suite |
| `reader/tests/test_block_reader.cpp` | 2,922 | **High** -- 68 tests in one file |
| `coreobjects/tests/test_property_object.cpp` | 2,781 | **High** -- 160 tests in one file |

These monolithic test files are difficult to navigate, slow to compile, and make it hard to isolate failures. The `test_multi_reader.cpp` at 5,236 lines is a maintenance burden.

#### Smell 2: Sleep-Based Synchronization (Flaky Test Risk)

70 occurrences of `sleep_for` / `std::this_thread::sleep` across 27 test files.

**Problematic examples**:

```cpp
// core/opendaq/scheduler/tests/test_scheduler.cpp, lines 17-19
void TearDown() override
{
    using namespace std::chrono_literals;
    std::this_thread::sleep_for(70ms);
}
```

```cpp
// core/opendaq/modulemanager/tests/module_manager_test.cpp, lines 30-34
void TearDown() override
{
    using namespace std::chrono_literals;
    std::this_thread::sleep_for(100ms);  // Wait for Async logger to flush
}
```

Both the scheduler and module manager tests add mandatory sleep to their TearDown. This runs after EVERY test in those fixtures. With 15 scheduler tests and 17 module manager tests, this adds ~3-4 seconds of pure wait time to every CI run -- for these suites alone.

**Where sleeps are potentially justified**: The reader tests use sleeps when waiting for async packet delivery, where proper condition-variable synchronization would be ideal but complex.

**Where sleeps are clearly problematic**: The `test_scheduler.cpp` line 121 sleeps 100ms mid-test to create a race window, which is inherently timing-dependent.

#### Smell 3: Print Statements in Tests

10 test files contain `std::cout` or `printf` statements:

```cpp
// core/opendaq/modulemanager/tests/module_manager_test.cpp, line 163
std::cout << "Module driver count: " << count << std::endl;
```

Production test code should not use print statements for diagnostics. The logging framework should be used instead.

#### Smell 4: Disabled Tests and TODOs

- **14 DISABLED_ tests** across 7 files (tests prefixed with `DISABLED_` which gtest skips)
- **16 GTEST_SKIP** occurrences in integration tests
- **20+ TODO/FIXME** markers in test files

Example:
```cpp
// core/opendaq/modulemanager/tests/module_manager_test.cpp, line 49
// TODO: Fix memory leak
//
//TEST_F(ModuleManagerTest, DefaultToCurrentDirectory)
//{
//    ASSERT_NO_THROW(ModuleManager(""));
//}
```

A commented-out test with a TODO about a memory leak is technical debt that should be tracked in an issue tracker, not left as a comment.

#### Smell 5: Environment Variable Dependency in Regression Tests

```cpp
// tests/regression/tests/setup_regression.h, line 32
StringPtr protocol = getenv("protocol");
StringPtr connectionString = "daq." + protocol + "://127.0.0.1";
```

The regression test suite uses a raw `getenv()` call with no validation or default. If the environment variable is unset, `protocol` will be null, and the connection string construction will produce undefined behavior. The comment on line 31 acknowledges this is a workaround for local development.

#### Smell 6: Inline Mocks in Test Files

`test_signal.cpp` contains ~170 lines of hand-written mock implementations (`ConnectionMockImpl`, `PacketMockImpl`, `DataDescriptorMockImpl`) before any test begins. These should be extracted to a shared mock file. The project already has `core/opendaq/opendaq/mocks/` for this purpose, but not all test files use it.

### 2.4 Positive Quality Patterns

**Pattern 1: Type-Parameterized Tests** -- Reader tests use `TYPED_TEST_SUITE` to run the same tests across all supported sample types (`Float32`, `Float64`, `Int16`, `Int32`, `Int64`, etc.):

```cpp
// core/opendaq/reader/tests/test_stream_reader.cpp, lines 24-26
using SampleTypes = Types<OPENDAQ_VALUE_SAMPLE_TYPES>;
TYPED_TEST_SUITE(StreamReaderTest, SampleTypes);
```

This eliminates code duplication and ensures type conversion correctness across all supported data types.

**Pattern 2: Value-Parameterized Integration Tests** -- The streaming integration tests use `TestWithParam` to test all protocol combinations:

```cpp
// tests/integration/test_streaming.cpp, line 12
class StreamingTest : public testing::TestWithParam<std::tuple<std::string, std::string>>
```

**Pattern 3: Builder Pattern in Test Setup** -- Tests use the same factory/builder patterns as production code, which validates the API ergonomics:

```cpp
// core/opendaq/reader/tests/test_block_reader.cpp, lines 33-38
ASSERT_NO_THROW(BlockReaderBuilder()
    .setSignal(this->signal)
    .setValueReadType(SampleTypeFromType<TypeParam>::SampleType)
    .setBlockSize(BLOCK_SIZE)
    .build());
```

**Pattern 4: Error Path Testing** -- Tests systematically verify exception types AND messages:

```cpp
// core/opendaq/reader/tests/test_stream_reader.cpp, line 34
ASSERT_THROW_MSG((StreamReader<TypeParam, ClockRange>) (nullptr),
                 ArgumentNullException, "Signal must not be null")
```

**Pattern 5: Serialization Round-Trip Tests** -- Multiple modules test serialize -> deserialize equality:

```cpp
// core/opendaq/component/tests/test_component.cpp, lines 102-129
const auto serializer = JsonSerializer(True);
component.serialize(serializer);
const auto str1 = serializer.getOutput();
// ...deserialize, re-serialize...
ASSERT_EQ(str1, str2);  // Round-trip equality
```

---

## 3. Test Architecture

### 3.1 Test Pyramid Analysis

| Level | Test Count (approx.) | Percentage | Healthy Target |
|-------|---------------------|-----------|---------------|
| Unit tests | ~2,900 | 83% | 70% |
| Integration tests | ~430 | 12% | 20% |
| System/E2E tests | ~170 | 5% | 10% |

**Assessment**: The pyramid is **slightly top-heavy** toward unit tests. Integration test coverage is lower than ideal (12% vs. 20% target), particularly for cross-module interactions. The regression suite partially compensates but is environment-dependent.

### 3.2 Test Fixture Patterns

The project uses **four fixture strategies** consistently:

1. **Simple fixtures** (`testing::Test`): Most unit tests. Setup via `SetUp()` override.
2. **Mock fixtures** (`MockDevice::Strict device`): Config protocol tests use strict gmock fixtures.
3. **Type-parameterized fixtures** (`TYPED_TEST_SUITE`): Reader tests for type genericity.
4. **Value-parameterized fixtures** (`TestWithParam`): Integration tests for protocol combinations.

**Fixture quality is generally good.** The `ReaderTest<T>` base class (reader_common.h) provides well-factored helpers:

```cpp
// core/opendaq/reader/tests/reader_common.h
template <typename T = void>
class ReaderTest : public testing::Test
{
protected:
    void SetUp() override { /* creates context, scheduler, signal */ }
    void sendPacket(const PacketPtr& packet, bool wait = true) const;
    DataPacketPtr createDataPacket(SizeT numSamples, Int offset, SignalPtr signal = nullptr) const;
};
```

### 3.3 Mock/Stub Usage

**Mock infrastructure** is well-organized:

- `core/opendaq/opendaq/mocks/include/opendaq/gmock/` -- 12 gmock header files for major interfaces (device, signal, input_port, streaming, component, etc.)
- `core/opendaq/opendaq/mocks/include/opendaq/mock/` -- Higher-level mock implementations (mock device module, mock FB module, mock physical device)
- `core/opendaq/functionblock/tests/mock/` -- Test-specific mock channel
- `core/opendaq/modulemanager/tests/mock/` -- 7 mock module variants (empty, crashes, null ID, etc.)

**Strength**: The mock modules for module manager testing (`crashes.cpp`, `empty.cpp`, `null_string_id_module.cpp`, `dependencies_failed.cpp`) test real failure scenarios that would be difficult to provoke with real modules.

**Weakness**: Some test files create inline mocks (e.g., `ConnectionMockImpl` in test_signal.cpp at ~170 lines) rather than using the shared mock infrastructure. This creates duplication and maintenance overhead.

### 3.4 Test Data Management

- **No external test data files**: Tests construct data programmatically. This is appropriate for a C++ SDK where data is typically numerical/packet-based.
- **Magic numbers are common**: Constants like `100` (sample count), `10` (offset), `123.4` (sample value) are used throughout without named constants. The block reader tests are an exception with `static constexpr const SizeT BLOCK_SIZE = 2u;`.
- **Builder pattern for descriptors**: Helper functions like `setupDescriptor(SampleType::Float64, LinearDataRule(10.5, 200), nullptr)` provide readable data construction.

---

## 4. Test Gaps

### 4.1 Completely Untested Components

| Component | Location | Risk |
|-----------|----------|------|
| Discovery subsystem | `shared/libraries/discovery/` | **HIGH** -- network discovery is error-prone |
| Discovery common | `shared/libraries/discovery_common/` | **HIGH** -- shared discovery logic |
| Discovery server | `shared/libraries/discovery_server/` | **HIGH** -- mDNS server implementation |
| .NET/C# bindings | `bindings/dotnet/` | **HIGH** -- shipped to users untested |
| Context module (real tests) | `core/opendaq/context/` | **MEDIUM** -- only has test_app.cpp entry point |

### 4.2 Error Path Testing Gaps

Error path coverage is **mixed across modules**:

**Well-covered error paths**:
- Signal: Tests duplicate connections, not-found disconnections
- Module manager: Tests null IDs, empty IDs, duplicate modules, invalid paths
- Block reader: Tests null signal, missing block size
- Config protocol: Tests component not found, unauthorized access

**Poorly-covered error paths**:
- Server module: Only 5 tests total, minimal error scenario coverage
- Synchronization: Only 8 tests, no concurrency error scenarios
- Scheduler TearDown: Sleep in teardown suggests async cleanup issues not properly handled

### 4.3 Edge Case and Boundary Coverage

**Strong boundary testing**:
- `test_data_packet.cpp` tests all numeric types (UInt8, Int8, UInt16, Int16, UInt32, Int32, UInt64, Int64, Float32, Float64) with linear data rules
- Reader tests verify zero-sample reads, single-sample reads, and multi-sample reads
- Permission tests check inherit/allow/deny combinations across component hierarchies

**Missing boundary tests**:
- No tests for maximum packet sizes or memory limits
- No tests for concurrent signal connections at scale
- No tests for module loading with corrupted shared libraries
- No IPv6 failure path tests (only skip when IPv6 disabled)
- No tests for Unicode/non-ASCII component names or property values

### 4.4 Negative Testing Gaps

| Area | What Is Tested | What Is Missing |
|------|---------------|-----------------|
| Null inputs | Null pointers for most factory methods | Null strings in property paths |
| Resource exhaustion | None | Memory allocation failure, thread pool exhaustion |
| Concurrent access | Multi-reader, multi-thread scheduler | Lock contention, deadlock scenarios |
| Network failures | Connection refused | Timeout, partial response, DNS failure |
| Corrupt data | None | Malformed packets, truncated data, invalid descriptors |

### 4.5 Cross-Module Integration Gaps

The integration test suite (`tests/integration/`) focuses on the device-module interaction pattern (server-client) but misses:

1. **Scheduler + Reader interaction under load** -- what happens when the scheduler is overwhelmed?
2. **Signal + Component lifecycle** -- signal teardown while readers are active
3. **Module hot-reload** -- adding/removing modules while streaming is active
4. **Config protocol + authentication** -- more complex permission scenarios during active streaming

---

## 5. CI Integration

### 5.1 CI Workflow Structure

The CI is orchestrated by `.github/workflows/ci.yml` with a comprehensive matrix:

**Platforms and Compilers** (11 matrix entries):

| Platform | Compiler | Build Type | Tests Enabled |
|----------|----------|-----------|--------------|
| Windows | VS 2022 x64 | Release | Yes |
| Windows | VS 2022 x64 | Debug | Yes |
| Windows | VS 2022 Win32 | Release | Yes |
| Windows | Clang | Release | Yes |
| Windows | GCC | Release | **No** (memory corruption bug) |
| Windows | Intel-LLVM | Release | Yes |
| Linux | gcc-9 | Release | Yes |
| Linux | gcc-14 | Release | Yes |
| Linux | clang-14 | Release | Yes |
| Linux | clang-16 | Release | Yes |
| Linux | gcc x86_32 | Release | Yes |
| macOS | Clang (latest) | Release | Yes |
| macOS | Clang (Intel) | Release | Yes |

**Known limitations documented in CI**:
- Windows GCC tests are disabled due to `test_device_modules` memory corruption and Python module resolution issues (ci.yml, line 71-73)
- Linux Debug builds are disabled due to `test_py_opendaq` problems (ci.yml, lines 162-189, commented out)
- Android builds are entirely disabled (ci.yml, lines 268-334, commented out)

### 5.2 Flaky Test Handling

The project has a **sophisticated unstable test management system**:

1. **Compile-time labeling**: `OPENDAQ_ENABLE_UNSTABLE_TEST_LABELS` adds compile definitions to mark unstable tests
2. **CI skipping**: `OPENDAQ_SKIP_UNSTABLE_TESTS` (default ON in CI) skips marked tests in regular CI runs
3. **Nightly flaky test workflow**: `.github/workflows/unstable_tests.yml` runs nightly (midnight UTC) using:
   - Preset `unstable_tests_ci` (which sets `OPENDAQ_SKIP_UNSTABLE_TESTS=false`)
   - CTest preset `run_unstable_test_repeatedly` with `GTEST_REPEAT=30` and `GTEST_FILTER=*.UNSTABLE_SKIPPED_*`
4. **Platform-specific skips**: `SKIP_TEST_MAC_CI` macro skips known macOS CI failures

**Assessment**: This is a **mature flaky test strategy**. The separation of stable and unstable tests, with nightly repeated execution of unstable tests, is industry best practice. However, the mechanism depends on manual labeling -- there is no automatic flaky test detection.

### 5.3 Test Execution Configuration

- **CTest presets** used for test execution (not raw gtest invocation)
- `outputOnFailure: true` -- only shows output for failed tests
- `fail-fast: false` in the CI matrix -- all platform builds run regardless of individual failures
- **Timeout**: 270 minutes for Windows, 180 minutes for Linux, 240 minutes for macOS
- **Concurrency control**: `cancel-in-progress: true` per branch per matrix entry
- **Test result artifacts**: GTest XML results uploaded for every test-enabled build

### 5.4 Code Coverage in CI

Coverage support exists in CMake (`OPENDAQ_ENABLE_COVERAGE` option) with:
- `cmake/CodeCoverageGcc.cmake` for gcc/gcov
- `cmake/CodeCoverageMsvc.cmake` for MSVC

**However, coverage is NOT enabled in the CI workflow.** The CI uses the `ci` preset which inherits from `full` but does not set `OPENDAQ_ENABLE_COVERAGE=true`. Coverage appears to be a local development tool only.

---

## 6. Test Infrastructure

### 6.1 Test Utilities Library (`shared/libraries/testutils/`)

The `testutils` library provides:

- **`testutils.h`**: Custom assertion macros
  - `ASSERT_THROW_MSG` -- asserts exception type AND message content
  - `ASSERT_SUCCEEDED` -- wraps error code checks
  - `ASSERT_GENERIC_FLOAT_EQ` / `ASSERT_GENERIC_VALUE_EQ` -- type-dispatching comparisons
  - `TEST_F_OPTIONAL` -- conditional test inclusion controlled by `OPENDAQ_ENABLE_OPTIONAL_TESTS`
- **`memcheck_listener.h`**: Memory leak detection listener
  - Uses `_CrtMemCheckpoint` / `_CrtMemDifference` on MSVC
  - Can mark tests as `expectMemoryLeak = true` to suppress expected leaks
  - Integrated into test runner via `BaseTestListener`

### 6.2 GMock Infrastructure

Well-organized under `core/opendaq/opendaq/mocks/include/opendaq/gmock/`:

| Mock | Purpose |
|------|---------|
| `device.h` | `MockDevice::Strict` for device interface |
| `signal.h` | Signal mock for connection tests |
| `streaming.h` | Streaming mock with state management |
| `component.h` | Component hierarchy mocking |
| `function_block.h` | Function block mock |
| `input_port.h` | Input port mock |
| `context.h` | Context mock (e.g., `MockContext::Strict`) |
| `scheduler.h` | Scheduler mock |
| `allocator.h` | Memory allocator mock |
| `packet.h` | Packet mock |
| `task_graph.h` | Task graph mock |
| `input_port_notifications.h` | Port notification mock |

### 6.3 Build Integration (CMake)

Each module's test CMakeLists.txt follows a consistent pattern:

```cmake
opendaq_set_cmake_folder_context(TARGET_FOLDER_NAME)
set(MODULE_NAME signal)
set(TEST_SOURCES test_signal.cpp test_connection.cpp ...)
opendaq_prepare_test_runner(TEST_APP FOR ${MODULE_NAME}
    SOURCES test_app.cpp ${TEST_SOURCES})
add_test(NAME ${TEST_APP} COMMAND $<TARGET_FILE_NAME:${TEST_APP}>
    WORKING_DIRECTORY $<TARGET_FILE_DIR:${TEST_APP}>)
target_link_libraries(${TEST_APP} PRIVATE daq::opendaq_gmocks daq::opendaq_mocks)
```

This is clean, maintainable, and consistent. The `opendaq_prepare_test_runner` macro standardizes test binary creation.

### 6.4 Integration Test Helpers

The integration test suite has a dedicated helper library (`test_helpers/test_helpers.h`):

- `setupSubscribeAckHandler` / `setupUnsubscribeAckHandler` -- async subscription acknowledgement via `std::promise`/`std::future`
- `waitForAcknowledgement` -- timeout-aware future wait
- `CreateConfigFile` -- temporary config file creation with RAII cleanup
- `isIpv6ConnectionString` / `Ipv6IsDisabled` -- IPv6 availability detection
- `SKIP_TEST_MAC_CI` macro -- platform-specific skipping

---

## 7. Summary of Findings

### 7.1 Strengths

1. **Comprehensive core coverage**: All 14 core/opendaq modules have tests. The signal and reader subsystems are deeply tested with type-parameterized suites across 10+ sample types.

2. **Strong assertion quality**: 54.5% of assertions use specific equality checks. Custom macros (`ASSERT_THROW_MSG`) enhance error path verification.

3. **Mature CI matrix**: 13 platform/compiler combinations with cross-platform testing on Windows, Linux, and macOS. Multiple compiler versions ensure broad compatibility.

4. **Sophisticated flaky test management**: Compile-time labeling, CI skipping, and nightly repeated execution of unstable tests is industry-standard best practice.

5. **Well-organized mock infrastructure**: Centralized gmock headers and mock module implementations enable consistent test patterns.

6. **Documentation tests**: 16 test files validate that code examples in documentation actually compile and execute correctly.

7. **Regression test suite**: Protocol-parameterized regression tests across OPC UA, native, and websocket protocols provide cross-protocol confidence.

### 7.2 Weaknesses

1. **Three completely untested subsystems**: Discovery (3 libraries), .NET bindings (entire binding), and context module have zero or near-zero test coverage.

2. **Monolithic test files**: 19 files exceed 1,000 lines. `test_multi_reader.cpp` at 5,236 lines is a significant maintenance burden.

3. **Sleep-based synchronization**: 70 sleep calls across 27 test files introduce timing dependencies and CI flakiness risk. Teardown sleeps add cumulative overhead to every test run.

4. **No coverage tracking in CI**: Despite CMake support for code coverage, it is not enabled in any CI workflow. There is no coverage reporting or regression detection.

5. **Missing negative tests**: No tests for memory exhaustion, corrupt data, concurrent access at scale, or network timeout scenarios.

6. **Inline mock duplication**: Some test files contain 100+ lines of hand-written mocks that duplicate functionality available in the shared mock library.

7. **Debug builds disabled in CI**: Linux debug configurations are commented out due to Python test issues, reducing debug-mode-specific defect detection.

### 7.3 Risk Assessment

| Risk | Severity | Impact |
|------|----------|--------|
| Untested discovery subsystem | **P1** | Network discovery bugs ship to users undetected |
| Untested .NET bindings | **P1** | C# users encounter binding bugs post-release |
| No CI coverage tracking | **P2** | Coverage regressions go undetected |
| Sleep-based test flakiness | **P2** | False CI failures waste developer time |
| Monolithic test files | **P3** | Slow compilation, hard to isolate failures |
| No negative/stress tests | **P3** | Edge-case defects discovered by users in production |

### 7.4 Recommendations

1. **Add unit tests for the discovery subsystem** -- priority P1. Even basic tests for mDNS client/server creation, start/stop lifecycle, and error handling would provide significant value.

2. **Add .NET binding tests** -- priority P1. At minimum, port the Python binding tests to C# to validate the generated bindings.

3. **Enable code coverage in CI** -- priority P2. Use the existing `OPENDAQ_ENABLE_COVERAGE` option in at least one Linux CI configuration. Publish results and set regression thresholds.

4. **Replace sleep-based waits** -- priority P2. Introduce condition variables or `std::promise`/`std::future` patterns (already used in integration test helpers) for async synchronization in unit tests. This is already done well in `test_helpers.h` -- apply the same pattern to the scheduler and module manager test teardowns.

5. **Split monolithic test files** -- priority P3. Break `test_multi_reader.cpp` (5,236 lines) into logical subgroups: creation tests, read tests, concurrent read tests, timeout tests, etc.

6. **Extract inline mocks** -- priority P3. Move `ConnectionMockImpl`, `PacketMockImpl`, `DataDescriptorMockImpl` from `test_signal.cpp` to the shared mock library.

7. **Re-enable debug CI builds** -- priority P3. Fix the `test_py_opendaq` issue and uncomment the debug configurations to catch debug-mode assertions and address sanitizer findings.

---

*Generated by QE Test Architect v3 -- Agentic Quality Engineering*
