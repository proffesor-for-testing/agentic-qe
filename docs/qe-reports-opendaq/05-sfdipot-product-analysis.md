# SFDIPOT Product Factors Analysis: openDAQ C++ SDK

**Version**: 3.31.0dev
**Analysis Date**: 2026-03-30
**Framework**: James Bach's Heuristic Test Strategy Model (HTSM) - Product Factors
**Codebase**: ~428K lines of C++ across 1,201 headers, 989 source files, 199 CMakeLists.txt
**Test Files**: 307 test source files across unit, integration, and regression suites

---

## Executive Summary

The openDAQ SDK is a C++ data acquisition framework providing real-time signal processing, device communication, streaming protocols, and multi-language bindings (Python, C#, Delphi, C). This analysis examines all 7 SFDIPOT dimensions with specific file references, producing 168 prioritized test ideas spanning the entire architecture.

### Test Idea Distribution

| Priority | Count | Percentage | Description |
|----------|-------|------------|-------------|
| P0 (Critical) | 17 | 10.1% | Data corruption, crash, security bypass |
| P1 (High) | 45 | 26.8% | Core functionality failures |
| P2 (Medium) | 72 | 42.9% | Feature correctness, edge cases |
| P3 (Low) | 34 | 20.2% | Polish, documentation, minor edge cases |

### Automation Fitness Distribution

| Type | Count | Percentage |
|------|-------|------------|
| Unit Test | 58 | 34.5% |
| Integration Test | 35 | 20.8% |
| E2E Test | 52 | 31.0% |
| Human Exploration | 23 | 13.7% |

---

## S - STRUCTURE: What the Product IS

### Architecture Overview

The openDAQ SDK follows a layered, modular architecture with clear separation between core types, domain objects, and protocol modules.

#### Directory Structure (Top-Level)

```
opendaq/
  core/                    # Core SDK implementation
    coretypes/             # Fundamental types (BaseObject, List, Dict, Serialization)
    coreobjects/           # Domain objects (Property, User, Permissions)
    opendaq/               # Main DAQ modules (14 sub-modules)
      component/           # Base component infrastructure
      context/             # Runtime context (Logger, Scheduler, TypeManager)
      device/              # Device abstraction (physical, client, function-block)
      functionblock/       # Signal processing blocks
      logger/              # Logging infrastructure
      modulemanager/       # Plugin loading and lifecycle
      opendaq/             # Instance, Client, ConfigProvider
      reader/              # Data reading (Stream, Block, Tail, Multi, Packet)
      scheduler/           # Thread-pool task scheduling (Awaitable, TaskGraph)
      server/              # Server types
      signal/              # Signal, Packet, Connection, DataDescriptor
      streaming/           # Mirrored device/signal streaming
      synchronization/     # Clock sync (PTP, IRIG, GPS, CLK)
      utility/             # Packet buffers, thread naming
  modules/                 # Loadable modules
    native_streaming_client_module/
    native_streaming_server_module/
  bindings/                # Language bindings
    c/                     # C bindings
    dotnet/                # .NET/C# bindings
    python/                # Python bindings (pybind11)
  shared/                  # Shared libraries
    libraries/
      config_protocol/     # Configuration protocol (RPC over TCP)
      native_streaming_protocol/  # Native streaming transport
      packet_streaming/    # Packet serialization/deserialization
      signal_generator/    # Test signal generation
      discovery/           # mDNS device discovery
      discovery_common/
      discovery_server/
      testutils/           # Test infrastructure
      utils/               # Common utilities
  external/                # Third-party dependencies (19 libraries)
  external_modules/        # FetchContent external module builds
  simulator/               # Device simulator
  examples/                # Sample applications
  tests/                   # Integration and regression tests
```

#### Key Structural Observations

**Component Hierarchy** (`core/opendaq/component/include/opendaq/component.h`):
- Every openDAQ object inherits from `IComponent` -> `IPropertyObject` -> `IBaseObject`
- Components have LocalID, GlobalID (path-based: `//device/FB/sig/0`), Active state, Tags, StatusContainer
- Parent-child relationships form a tree: Instance -> Device -> FunctionBlock -> Signal/InputPort
- Operation modes: `Unknown`, `Idle`, `Operation`, `SafeOperation`

**Interface Pattern** (all headers use `DECLARE_OPENDAQ_INTERFACE` macro):
- Pure virtual C++ interfaces with COM-like error code returns (`ErrCode`)
- Smart pointer wrappers auto-generated via rtgen tooling
- Factory pattern: `OPENDAQ_DECLARE_CLASS_FACTORY` macros for object creation
- Interface IDs for runtime type identification (`INTERFACE_FUNC`)

**Dependency Graph** (from CMakeLists.txt analysis):
```
coretypes (base) -> coreobjects -> opendaq modules
                                -> signal depends on: component, context
                                -> reader depends on: signal
                                -> device depends on: signal, functionblock, streaming, synchronization, server
                                -> modulemanager depends on: device, functionblock, server, streaming
                                -> opendaq (instance) depends on: all above
```

**External Dependencies** (19 in `/external/`):
- `boost` - Networking, filesystem, DLL loading
- `taskflow` - Thread-pool task graph execution (scheduler backend)
- `spdlog` - Logging backend
- `fmt` - String formatting
- `rapidjson` - JSON serialization/deserialization
- `gtest/gmock` - Testing framework
- `pybind11` - Python bindings generation
- `native_streaming` - WebSocket-like transport layer
- `arrow/thrift` - Parquet recorder support
- `bcrypt` - Password hashing for authentication
- `mimalloc` - Optional memory allocator for packets
- `xxHash` - Fast hashing
- `mdns` - Service discovery
- `miniaudio` - Audio device module
- `tsl-ordered-map` - Ordered hash maps
- `date` - Date/time handling

### Structure Test Ideas

| # | ID | Priority | Test Idea | Automation |
|---|-----|----------|-----------|------------|
| 1 | S-01 | P0 | Load the SDK and create an Instance with 200 concurrent threads each calling `addDevice` and `addFunctionBlock` simultaneously; confirm no heap corruption or use-after-free in component tree traversal | Integration |
| 2 | S-02 | P1 | Build the full SDK with all 19 external dependencies at pinned versions, then swap each dependency to latest release one at a time; confirm compilation succeeds and all tests pass without ABI breaks | E2E |
| 3 | S-03 | P1 | Create a deeply nested component tree (Instance -> 10 Devices -> 10 FBs each -> 10 Signals each = 1,000 signals) and call `getGlobalId()` on the deepest leaf; measure path construction time stays under 1ms | Unit |
| 4 | S-04 | P2 | Build the SDK with `OPENDAQ_THREAD_SAFE=OFF` and confirm `NoLockMutex` in `utility_sync.h` compiles away all locking; run single-threaded workloads and confirm equivalent output to thread-safe build | Unit |
| 5 | S-05 | P2 | Remove each of the 14 opendaq sub-modules from the CMake build one at a time; confirm the build system produces clear dependency-missing errors rather than cryptic linker failures | E2E |
| 6 | S-06 | P2 | With `OPENDAQ_ENABLE_PARAMETER_VALIDATION=OFF`, pass nullptr to every public API function; confirm undefined behavior does NOT crash (best-effort) or document which functions are unsafe | Unit |
| 7 | S-07 | P3 | Count circular include dependencies across all 1,201 header files; confirm the `#pragma once` guards and forward declarations prevent any circular compilation errors | Unit |
| 8 | S-08 | P1 | Build the SDK as a submodule (`BUILDING_AS_SUBMODULE=ON`) inside a larger CMake project that also uses Boost and spdlog at different versions; confirm no symbol conflicts or ODR violations | E2E |
| 9 | S-09 | P2 | Inspect all `OPENDAQ_ERR_NOTIMPLEMENTED` returns (48 occurrences found across 20 files); map each to a public API function and document which capabilities are stub implementations | Human Exploration |
| 10 | S-10 | P3 | Scan all 97 TODO/FIXME markers across 30 files and categorize by severity: crash-risk, data-loss-risk, feature-incomplete, code-quality | Human Exploration |

### Test Data Suggestions for STRUCTURE-Based Tests

- CMake presets: `ci`, `Release`, `Debug`, custom presets with all optional modules enabled
- Component tree topologies: flat (100 signals under one device), deep (10 levels), wide (1000 siblings)
- Build configurations: all permutations of `OPENDAQ_THREAD_SAFE`, `OPENDAQ_ENABLE_PARAMETER_VALIDATION`, `OPENDAQ_MIMALLOC_SUPPORT`
- External dependency versions: pinned vs latest for each of 19 libraries

### Suggestions for Exploratory Test Sessions: STRUCTURE

1. **Component Tree Stress Session**: Create, traverse, and destroy component trees of increasing depth and width, observing memory usage, reference counting behavior, and GlobalID path construction edge cases (empty IDs, special characters, Unicode).

2. **Build System Resilience Session**: Attempt cross-compilation (ARM, 32-bit x86), partial builds with subset of modules, and incremental rebuilds after header changes to find stale cache or missing rebuild trigger issues in the 199 CMakeLists.txt files.

3. **Interface Contract Session**: For each `DECLARE_OPENDAQ_INTERFACE`, test that `queryInterface` correctly resolves all declared interface hierarchies, and that reference counting across interface casts produces no leaks.

---

## F - FUNCTION: What the Product DOES

### Core Capabilities

**1. Signal Processing Pipeline**
- Signals (`ISignal`) send data/event packets through connections to input ports
- Data packets carry raw or calculated samples with descriptors defining type, rule, scaling
- Connections (`IConnection`) act as packet queues between signals and input ports
- Function blocks (`IFunctionBlock`) consume input signals, produce output signals
- Status signals report function block health changes

**2. Data Readers** (`core/opendaq/reader/`, 6,265 lines):
- `StreamReader`: Sequential sample reading with automatic position advancement, timeout support
- `BlockReader`: Fixed-block-size reading (e.g., FFT blocks), returns only complete blocks
- `TailReader`: Rolling window of last N samples, subsequent reads may overlap
- `MultiReader`: Synchronized reading across multiple signals with different sample rates using commonSampleRate
- `PacketReader`: Raw packet-level access
- All readers support typed reading with automatic sample type conversion

**3. Device Management** (`core/opendaq/device/`):
- Three device types: Physical (hardware channels), Client (remote connection), FunctionBlock (computation)
- Device discovery via mDNS (`shared/libraries/discovery/`)
- Device information: serial number, location, connection string, network interfaces
- Synchronization component for PTP/IRIG/GPS/CLK time sources
- User locking mechanism (`user_lock.h`)

**4. Module System** (`core/opendaq/modulemanager/`):
- Dynamic module loading from filesystem paths (`.dll`/`.so`)
- Module authentication via `IModuleAuthenticator` with vendor keys
- Each module can provide: device types, function block types, server types, streaming types
- Side-loading of custom modules at runtime via `addModule`
- Support for loading single modules via absolute path (`loadModule`)

**5. Streaming** (`core/opendaq/streaming/`, `shared/libraries/native_streaming_protocol/`):
- Mirrored devices/signals for remote data access
- Client-to-device and device-to-client streaming
- Native streaming protocol with signal subscription/unsubscription
- Config protocol for RPC-based device configuration over TCP
- Packet streaming for serialized data transport
- Signal availability/unavailability event callbacks

**6. Scheduler** (`core/opendaq/scheduler/`):
- Thread-pool based scheduling using taskflow backend
- Three scheduling modes: `scheduleFunction` (returns `IAwaitable`), `scheduleWork` (fire-and-forget), `scheduleGraph` (DAG execution)
- `IAwaitable` for async result waiting, cancellation, completion checking
- Task graphs for dependency-ordered parallel execution
- Graph exceptions silently ignored (documented behavior)

**7. Serialization/Configuration**:
- JSON serialization via `ISerializer`/`ISerializable` (`core/coretypes/`)
- Config providers: JSON file, environment variables, command-line args
- Property system with validation, coercion, eval values (expression engine)
- `IFreezable` for immutable object creation

**8. Security** (`core/coreobjects/`):
- Authentication provider with username/password and anonymous modes
- Permission manager with per-object read/write/execute access control
- `bcrypt` password hashing
- Module authentication with vendor public keys

### Function Test Ideas

| # | ID | Priority | Test Idea | Automation |
|---|-----|----------|-----------|------------|
| 11 | F-01 | P0 | Create a StreamReader on a signal producing 1M samples/second of Float64 data; read continuously for 60 seconds and confirm zero samples are lost or duplicated by comparing domain tick sequences | Integration |
| 12 | F-02 | P0 | Connect a MultiReader to 5 signals with different sample rates (100Hz, 200Hz, 500Hz, 1kHz, 2kHz); read 10,000 samples at commonSampleRate and confirm per-signal sample counts are proportionally correct | Integration |
| 13 | F-03 | P0 | While a StreamReader is actively reading, change the signal's DataDescriptor (trigger `DATA_DESCRIPTOR_CHANGED` event); confirm the reader returns `ReadStatus::Event` and does NOT deliver samples with the old descriptor | Unit |
| 14 | F-04 | P1 | Create a BlockReader with blockSize=256 on a signal that delivers exactly 255 samples then stops; confirm the reader returns 0 complete blocks (not a partial block) and the 255 samples remain buffered | Unit |
| 15 | F-05 | P1 | Create a TailReader with historySize=100 on a signal producing 10,000 samples; read and confirm only the last 100 samples are returned, and a second read returns overlapping data matching the most recent 100 | Unit |
| 16 | F-06 | P1 | Connect a signal to an input port, then call `disconnect()` while a reader is mid-read with a 5-second timeout; confirm the read returns immediately with appropriate status rather than blocking | Unit |
| 17 | F-07 | P1 | Load a module via `ModuleManager::loadModule` with an absolute path to a valid `.so`; confirm the module's function blocks and device types appear in `getAvailableFunctionBlockTypes` / `getAvailableDeviceTypes` | Integration |
| 18 | F-08 | P1 | Set `setAuthenticatedOnly(true)` on ModuleManager, then attempt to load an unsigned module; confirm loading fails with clear error rather than silent skip or crash | Integration |
| 19 | F-09 | P2 | Create a function block with 5 input ports and 5 output signals; connect signals to all input ports, then disconnect and reconnect them in rapid succession (1000 cycles); confirm no dangling connections or leaked packets | Unit |
| 20 | F-10 | P2 | Schedule a TaskGraph with 10 tasks having diamond dependencies (A->B, A->C, B->D, C->D); confirm execution order respects dependencies and all tasks complete | Unit |
| 21 | F-11 | P2 | Call `scheduler.stop()` while 100 tasks are queued; confirm cancellation of pending work and that `scheduleFunction` returns `OPENDAQ_ERR_SCHEDULER_STOPPED` for subsequent calls | Unit |
| 22 | F-12 | P2 | Authenticate a user with correct credentials via `AuthenticationProvider::authenticate`; confirm user object is returned. Then authenticate with wrong password; confirm an exception (not nullptr) is thrown | Unit |
| 23 | F-13 | P2 | Set `PermissionManager` on a component to deny write access for group "viewers"; confirm `isAuthorized(viewerUser, Permission::Write)` returns false while read/execute return true | Unit |
| 24 | F-14 | P2 | Serialize an Instance with 3 devices, 5 function blocks, and 20 signals to JSON; deserialize into a new Instance; confirm all component trees, property values, and signal connections are identical | Integration |
| 25 | F-15 | P2 | Create a DataDescriptor with a Linear data rule (delta=1, start=0) and TickResolution 1/1000000 with unit "seconds"; create a data packet with offset=1000; confirm calculated values match expected microsecond timestamps | Unit |
| 26 | F-16 | P2 | Apply a PostScaling (scale=2.5, offset=-10.0, inputType=Int16, outputType=Float64) to a signal; read 1000 samples through StreamReader and confirm each output equals `input * 2.5 - 10.0` | Unit |
| 27 | F-17 | P3 | Create an `EvalValue` expression referencing another property (e.g., `"$SampleRate * 2"`); change the referenced property and confirm the eval value updates automatically | Unit |
| 28 | F-18 | P2 | Call `enqueueOnThisThread` on a Connection; confirm the listener notification fires on the same calling thread (not the scheduler thread) | Unit |
| 29 | F-19 | P1 | Send `IMPLICIT_DOMAIN_GAP_DETECTED` event packet with a GapDiff of 5000 ticks; confirm downstream readers report the gap rather than producing fabricated samples to fill it | Unit |
| 30 | F-20 | P3 | Create a device and call `setActive(false)` on it; confirm all child signals, channels, and function blocks also report `getActive() == false` (active state cascades down the tree) | Unit |

### Test Data Suggestions for FUNCTION-Based Tests

- Sample types: all 17 `SampleType` enum values including `ComplexFloat32`, `RangeInt64`, `Struct`, `Binary`, `String`, `Null`
- Data rules: `Explicit`, `Linear(delta=1,start=0)`, `Linear(delta=100,start=-50)`, `Constant(42)`, `Other`
- Scaling: `Linear(scale=1.0,offset=0.0)`, `Linear(scale=0.001,offset=-273.15)` (temperature), degenerate `scale=0`
- Reader configurations: timeout=0 (non-blocking), timeout=MAX_INT, blockSize=1, blockSize=1000000
- Authentication: valid user, invalid password, empty username, SQL injection attempts in username field, anonymous mode on/off

### Suggestions for Exploratory Test Sessions: FUNCTION

1. **Reader Boundary Torture Session**: Explore what happens when readers encounter every possible packet type in unexpected order (event packet before any data packet, two consecutive descriptor-changed events, empty data packets with sampleCount=0).

2. **Module Loading Chaos Session**: Attempt to load modules with wrong ABI version, truncated `.so` files, modules that throw exceptions in their factory functions, modules with duplicate IDs, and modules that take 30+ seconds to initialize.

3. **Property Expression Engine Session**: Create circular eval value references (`PropA = "$PropB"`, `PropB = "$PropA"`), deeply nested expressions, expressions referencing non-existent properties, and expressions with division-by-zero. Observe error handling.

---

## D - DATA: What the Product PROCESSES

### Data Types and Structures

**Core Types** (`core/coretypes/`, 160+ headers):
- Primitives: `Boolean`, `Integer`, `Float`, `String`, `BinaryData`, `ComplexNumber`, `Ratio`
- Containers: `List`, `Dict` (ordered map), `Struct`, `Enumeration`
- Object system: `BaseObject` (ref-counted), smart pointers, weak references
- Serialization: `ISerializer`/`IDeserializer`, JSON serialization/deserialization
- Type system: `IType`, `ITypeManager`, `ISimpleType`, `IStructType`, `IEnumerationType`

**Sample Types** (`core/opendaq/signal/include/opendaq/sample_type.h`):
```cpp
enum class SampleType {
    Invalid=0, Undefined=0, Float32, Float64,
    UInt8, Int8, UInt16, Int16, UInt32, Int32, UInt64, Int64,
    RangeInt64, ComplexFloat32, ComplexFloat64,
    Binary, String, Struct, Null
};
// 17 distinct types (Invalid/Undefined share value 0)
```

**Data Descriptor** (`core/opendaq/signal/include/opendaq/data_descriptor.h`):
- Describes: Name, Dimensions (0=scalar, 1=vector, 2=matrix), SampleType, Unit, ValueRange
- Rules: DataRule (Linear/Constant/Explicit/Other), Scaling (Linear/Other)
- Domain: Origin (epoch string), TickResolution (Ratio), ReferenceDomainInfo
- Struct fields: recursive list of DataDescriptors for compound types

**Packet Types**:
- `Data Packet`: sample buffer + domain reference + offset + descriptor
- `Event Packet`: descriptor changes, domain gap detection
- `Binary Data Packet`: raw binary payloads

**Data Flow**:
```
Signal -> Connection (queue) -> InputPort -> FunctionBlock/Reader
         [DataPackets]          [peek/dequeue]
         [EventPackets]
```

**Serialization Formats**:
- JSON: primary serialization via rapidjson (`json_serializer.h`, `json_deserializer.h`)
- Config Protocol: binary RPC (`PacketHeader`: 16 bytes, max payload ~268MB)
- Native Streaming: binary packet buffers with signal numeric IDs
- Packet Streaming: serialized packet transport layer

### Data Test Ideas

| # | ID | Priority | Test Idea | Automation |
|---|-----|----------|-----------|------------|
| 31 | D-01 | P0 | Create data packets with every SampleType (17 types) containing boundary values (INT64_MAX, INT64_MIN, NaN, Infinity, -0.0, empty string, zero-length binary); read through StreamReader and confirm lossless round-trip | Unit |
| 32 | D-02 | P0 | Serialize a complex component tree (10 devices, 50 signals with struct descriptors) to JSON; deserialize it; confirm byte-identical re-serialization (idempotent serialization) | Unit |
| 33 | D-03 | P1 | Create a DataDescriptor with 3 struct fields (Int64, Float32, Float64) totaling 20 bytes per sample; create a packet with 10,000 samples; read through StreamReader and confirm field alignment and padding are correct | Unit |
| 34 | D-04 | P1 | Create a 2-dimensional DataDescriptor (10x20 matrix of Float64); produce a packet and read it; confirm the memory layout follows row-major order: `sizeof(Float64) * 10 * 20` per sample | Unit |
| 35 | D-05 | P1 | Send a config protocol PacketBuffer at exactly `MAX_PACKET_BUFFER_SIZE` (0x0FFFFFFF = ~268MB); confirm it is accepted. Send one byte more; confirm rejection | Integration |
| 36 | D-06 | P2 | Create a DataDescriptor with a ValueRange of [0.0, 100.0]; produce samples with values -1.0, 0.0, 50.0, 100.0, 101.0; confirm all values pass through (range is not enforced per documentation) but are correctly reported via `getValueRange()` | Unit |
| 37 | D-07 | P2 | Produce 1 million data packets of 100 samples each with `ComplexFloat64` type; measure memory consumption; confirm packet destructor callbacks fire correctly and memory is reclaimed | Integration |
| 38 | D-08 | P2 | Create a binary data packet with a 10MB payload; send through a connection; confirm the receiver gets identical data (memcmp) with no truncation or corruption | Unit |
| 39 | D-09 | P2 | Serialize a PropertyObject with 100 properties of mixed types (Int, Float, String, List, Dict, nested PropertyObject); deserialize and confirm deep equality of all property values | Unit |
| 40 | D-10 | P2 | Create a Ratio with denominator=0; confirm appropriate error rather than divide-by-zero crash when used as TickResolution | Unit |
| 41 | D-11 | P3 | Create a DataDescriptor with Origin set to "1970-01-01T00:00:00Z" and TickResolution of 1/1000000000 (nanoseconds); produce a packet with offset corresponding to 2038-01-19T03:14:07 (Y2038); confirm correct timestamp calculation | Unit |
| 42 | D-12 | P3 | Deserialize JSON with malformed content (missing closing braces, invalid UTF-8, null bytes in strings); confirm `OPENDAQ_ERR_DESERIALIZE_PARSE_ERROR` and no crash | Unit |
| 43 | D-13 | P2 | Create a Constant data rule with value=42; produce a packet with sampleCount=1000; read all samples and confirm every value equals 42 regardless of packet offset | Unit |
| 44 | D-14 | P1 | Create a WrappedDataPacket wrapping an externally-allocated buffer; destroy the wrapper while the external buffer is still alive; confirm no double-free or use-after-free | Unit |

### Test Data Suggestions for DATA-Based Tests

- Numeric boundaries: INT8_MIN/MAX, INT16_MIN/MAX, INT32_MIN/MAX, INT64_MIN/MAX, FLT_MIN/MAX, DBL_MIN/MAX, subnormal floats
- String data: empty, single char, 1MB string, null bytes embedded, emoji, RTL text
- JSON edge cases: deeply nested (1000 levels), empty objects `{}`, empty arrays `[]`, duplicate keys
- Packet sizes: 0 samples, 1 sample, exactly 1 buffer boundary, MAX_PACKET_BUFFER_SIZE
- ComplexNumber: (0,0), (NaN,NaN), (Inf,-Inf), (-0.0, 0.0)

### Suggestions for Exploratory Test Sessions: DATA

1. **Sample Type Conversion Matrix Session**: Create signals of each SampleType and read through readers requesting a different output type. Map which conversions succeed, which fail with `OPENDAQ_ERR_CONVERSIONFAILED`, and which silently lose precision.

2. **Serialization Fuzzing Session**: Generate semi-random JSON by mutating valid serialized output (bit flips, field removal, type swaps). Feed into deserializer and observe crash vs graceful error behavior.

3. **Memory Pressure Session**: Produce packets faster than consumers can read them, filling connection queues. Observe queue growth behavior, OOM handling, and whether backpressure mechanisms exist.

---

## I - INTERFACES: How the Product CONNECTS

### Public API Surface

**C++ Interfaces** (primary API):
- 60+ `DECLARE_OPENDAQ_INTERFACE` declarations
- All return `ErrCode` (uint32_t) for error handling
- Smart pointer wrappers (`*Ptr` classes) provide RAII and exception-based usage
- Builder pattern for complex objects: `DataDescriptorBuilder`, `InstanceBuilder`, `StreamReaderBuilder`

**Python Bindings** (`bindings/python/`):
- Generated via pybind11 from C++ interface headers
- Separate packages: `core_types`, `core_objects`, `opendaq`, `py_opendaq_daq`
- rtgen code generation (`run_rtgen.sh`) for automated binding creation
- Stub generation available for IDE auto-completion (`OPENDAQ_GENERATE_PYTHON_BINDINGS_STUBS`)

**C# Bindings** (`bindings/dotnet/openDAQ.Net/`):
- .NET wrapper around C API layer
- NuGet package creation workflow (`reusable_nuget_creation_and_test.yml`)

**C Bindings** (`bindings/c/`):
- Flat C API wrapping C++ interfaces
- Generated via rtgen tooling

**Delphi Bindings** (in-tree):
- Header files in `core/coretypes/bindings/delphi/`
- Separate test suite (`OPENDAQ_ENABLE_DELPHI_BINDINGS_TESTS`)

**Network Protocols**:
- **Config Protocol** (`shared/libraries/config_protocol/`): Binary RPC over TCP for device configuration
  - PacketTypes: `GetProtocolInfo`, `UpgradeProtocol`, `Rpc`, `ServerNotification`, `InvalidRequest`, `NoReplyRpc`, `ConnectionRejected`
  - 16-byte PacketHeader: headerSize + type + payloadSize + id
  - Max payload: ~268MB (0x0FFFFFFF)
  - Protocol upgrade negotiation
- **Native Streaming Protocol** (`shared/libraries/native_streaming_protocol/`):
  - Signal subscription/unsubscription with numeric IDs
  - Payload types: streaming packets, signal available/unavailable, subscription ack, config protocol, streaming init request/done
  - Client-to-device streaming support
  - Session-based connection management
- **mDNS Discovery** (`shared/libraries/discovery/`):
  - Device discovery via multicast DNS
  - `MdnsDiscoveryClient` for finding devices
  - `MdnsDiscoveryServer` for announcing device availability

**Inter-Module Interfaces**:
- `IModule`: Plugin contract (device creation, FB creation, server creation, streaming creation)
- `IModuleManager`: Module lifecycle (load, authenticate, enumerate)
- Module exports via `module_exports.h`
- Dependency checking via `module_check_dependencies.h`

### Interface Test Ideas

| # | ID | Priority | Test Idea | Automation |
|---|-----|----------|-----------|------------|
| 45 | I-01 | P0 | Send a config protocol packet with `payloadSize` in the header that exceeds the actual payload bytes; confirm the server rejects it rather than reading past buffer bounds | Integration |
| 46 | I-02 | P0 | Send 1000 concurrent config protocol RPC requests to a single server endpoint; confirm all responses match their request IDs with no cross-contamination | Integration |
| 47 | I-03 | P1 | Create an openDAQ Instance in Python, add a reference device, read 1000 samples from a signal via StreamReader; confirm values match the C++ equivalent API call output bit-for-bit | E2E |
| 48 | I-04 | P1 | Call every public C# binding method with null arguments; confirm `ArgumentNullException` or equivalent rather than `AccessViolationException` or crash | Unit |
| 49 | I-05 | P1 | Establish a native streaming connection, subscribe to 50 signals, then abruptly kill the client process; confirm the server cleans up all subscriptions within 30 seconds and does not leak memory | E2E |
| 50 | I-06 | P1 | Trigger protocol upgrade negotiation (`PacketType::UpgradeProtocol`); confirm both sides agree on the same protocol version and data can flow after upgrade | Integration |
| 51 | I-07 | P2 | Use `InstanceBuilder` to create an Instance with custom logger sinks, scheduler worker count, and module paths; confirm each builder setting is correctly applied in the resulting Instance | Unit |
| 52 | I-08 | P2 | Connect two openDAQ instances (client and server) via native streaming; subscribe to a signal on the server; confirm mirrored signal on the client receives identical packets within 10ms latency | E2E |
| 53 | I-09 | P2 | Call `IInputPort::acceptsSignal` with signals of incompatible sample types; confirm it returns `false` without throwing. Then call `connect` with the same signal; confirm `OPENDAQ_ERR_SIGNAL_NOT_ACCEPTED` | Unit |
| 54 | I-10 | P2 | Start an mDNS discovery server advertising a device; use the discovery client to find it; confirm the device info (serial, location, connection string) matches exactly | Integration |
| 55 | I-11 | P2 | Send a `ConnectionRejected` config protocol packet; confirm the client handles it gracefully with a meaningful error message rather than hanging or retrying indefinitely | Integration |
| 56 | I-12 | P3 | Call `getSerializeId()` on every serializable type in the SDK; confirm all IDs are unique and non-empty | Unit |
| 57 | I-13 | P2 | Load the Python bindings in a Python process, create 100 objects, delete them all, run `gc.collect()`; confirm reference counts return to zero and C++ destructors fire | E2E |
| 58 | I-14 | P3 | Invoke every function in the C binding API with the wrong number or type of arguments; confirm error codes (not crashes) are returned | Unit |
| 59 | I-15 | P2 | Send a config protocol `NoReplyRpc` packet; confirm the server processes the command but sends no response packet back to the client | Integration |
| 60 | I-16 | P1 | Subscribe to a streaming signal, then send `PAYLOAD_TYPE_STREAMING_SIGNAL_UNAVAILABLE`; confirm the client's `OnSignalUnavailableCallback` fires and the mirrored signal stops receiving data | Integration |

### Test Data Suggestions for INTERFACES-Based Tests

- Protocol payloads: empty, 1 byte, exactly 16 bytes (header only), max size, malformed headers
- Connection strings: valid `daq.ns://host:port`, missing port, IPv6 addresses, DNS names, empty string
- Module paths: valid path, non-existent path, path to non-module file, path with spaces, relative vs absolute
- Python/C# specific: passing C++ objects between threads in managed languages, GC pressure during active streaming

### Suggestions for Exploratory Test Sessions: INTERFACES

1. **Protocol Boundary Session**: Send config protocol packets with all 7 PacketTypes in rapid succession, including packets with zero-length payload, maximum-length payload, and type values outside the defined enum range (0x87+). Observe server behavior.

2. **Cross-Language Parity Session**: Pick 20 representative API operations (create instance, add device, read samples, serialize). Implement each in C++, Python, C#, and C. Compare outputs for exact equivalence. Note any binding gaps or behavioral differences.

3. **Discovery Race Condition Session**: Start and stop mDNS discovery servers and clients rapidly, with devices appearing and disappearing. Observe stale device entries, discovery timeouts, and network traffic patterns.

---

## P - PLATFORM: What the Product DEPENDS ON

### Operating System Support

**Windows** (from `ci.yml`):
- VS 2022 x64 Release and Debug
- VS 2022 Win32 (32-bit) Release
- Clang on Windows (Release)
- GCC on Windows (Release) -- tests disabled due to memory corruption in `test_device_modules`
- Intel-LLVM (icx) on Windows

**Linux** (from `ci.yml`):
- Ubuntu Latest with gcc-9 and gcc-14 (Release)
- Ubuntu Latest with clang-14 and clang-16 (Release)
- Ubuntu x86_32 cross-compilation (Release)
- Debug configurations are disabled ("until the problem with test_py_opendaq is resolved")

**macOS** (from `ci.yml`):
- macOS Latest Clang Release (ARM)
- macOS 15 Intel Clang Release (x86_64)
- Objective-C/Objective-C++ enabled for Apple builds

### Compiler Requirements

- CMake >= 3.24 (minimum version)
- C++17 or later (inferred from codebase patterns)
- Supported compilers: MSVC (VS 2022), GCC (9-14), Clang (14-16), Intel-LLVM (icx)
- Code coverage: GCC and MSVC only

### Build System

- 199 CMakeLists.txt files
- CMake presets: `ci`, custom via `CMakePresets.json`, `CMakeBasePresets.json`, `CMakeVendorPresets.json`
- Feature flags: 20+ `option()` declarations controlling builds
- FetchContent for external module downloads (LTStreamingModules, OpcUaModules)
- Git revision embedding in package version

### CI/CD (`.github/workflows/`):

| Workflow | Purpose |
|----------|---------|
| `ci.yml` | Build and test on Windows, Linux, macOS (270min timeout Windows, 180min Linux, 240min macOS) |
| `package.yml` | Package creation |
| `deploy.yml` | Deployment |
| `check_headers.yml` | Header file validation |
| `unstable_tests.yml` | Unstable test tracking |
| `regression_simulator_generator.yml` | Regression simulator |
| `reusable_nuget_creation_and_test.yml` | NuGet package creation and test |
| `trigger_downstream.yml` | Downstream project triggering |
| `trigger_downstream_deployment.yml` | Downstream deployment |
| `build_antora_docs.yml` | Documentation site build |

### Hardware Dependencies

- Audio hardware: `miniaudio` library for audio device module (`DAQMODULES_AUDIO_DEVICE_MODULE`)
- DAQ hardware: abstracted through device modules (reference device, simulator)
- Network: TCP/IP for streaming, UDP for mDNS discovery
- MiMalloc: optional custom allocator (`OPENDAQ_MIMALLOC_SUPPORT`)

### Platform Test Ideas

| # | ID | Priority | Test Idea | Automation |
|---|-----|----------|-----------|------------|
| 61 | P-01 | P1 | Build and run the full test suite on Windows x64 Release, Linux x64 Release, and macOS ARM Release; confirm zero test failures on all three platforms | E2E |
| 62 | P-02 | P1 | Build on Linux with gcc-9 (minimum supported) and gcc-14 (latest); confirm both produce identical test results and no deprecation warnings become errors | E2E |
| 63 | P-03 | P1 | Investigate the disabled GCC Windows test suite (memory corruption in `test_device_modules`); reproduce the corruption and determine root cause | Human Exploration |
| 64 | P-04 | P1 | Investigate the disabled Linux Debug configurations (problem with `test_py_opendaq`); reproduce the failure and determine if it is a Python binding issue or a Debug-only code path issue | Human Exploration |
| 65 | P-05 | P2 | Build the 32-bit (Win32/x86_32) variant; run all tests; confirm no truncation of 64-bit sample values, packet offsets, or timestamps in 32-bit address space | E2E |
| 66 | P-06 | P2 | Run the SDK on a system with 512MB RAM; produce signals at maximum throughput; confirm graceful degradation (allocation failure errors) rather than OOM-kill or undefined behavior | E2E |
| 67 | P-07 | P2 | Build with `OPENDAQ_MIMALLOC_SUPPORT=ON`; run the full test suite; compare packet allocation throughput against the default allocator | E2E |
| 68 | P-08 | P2 | Configure CI to run with `OPENDAQ_CI_RUNNER=ON` (warnings-as-errors enabled); confirm zero warnings across all compiler/platform combinations | E2E |
| 69 | P-09 | P3 | Build the SDK with Ninja vs "Visual Studio 17 2022" generators; compare build times and verify identical binary outputs | E2E |
| 70 | P-10 | P3 | Test mDNS device discovery across a network with firewalls blocking UDP multicast; confirm the discovery client times out gracefully with clear error | E2E |
| 71 | P-11 | P2 | Build with Intel-LLVM (icx) compiler; confirm no Intel-specific optimization issues with signal processing paths (NaN handling, denormals) | E2E |
| 72 | P-12 | P3 | Measure full SDK build time from clean state across all platforms; identify the slowest-building modules for potential parallel build optimization | Human Exploration |

### Test Data Suggestions for PLATFORM-Based Tests

- Compiler versions: gcc-9 (min), gcc-14 (max), clang-14, clang-16, MSVC 2022, icx
- OS versions: Ubuntu 22.04, Ubuntu 24.04, Windows Server 2022, macOS 13 (Intel), macOS 14 (ARM)
- Architecture: x86_64, x86_32 (cross-compiled), ARM64
- Memory constraints: 512MB, 2GB, 16GB, with/without swap
- Network configurations: loopback only, multicast-enabled, firewall-restricted

### Suggestions for Exploratory Test Sessions: PLATFORM

1. **Disabled Tests Investigation Session**: Examine the two disabled CI configurations (GCC Windows tests, Linux Debug) by reproducing their failures locally. Determine if these represent real bugs, platform-specific issues, or test infrastructure problems.

2. **Cross-Compilation Edge Session**: Build the SDK targeting ARM64 Linux from an x86_64 host; deploy to a Raspberry Pi 4 or equivalent; run the reference device module and native streaming. Observe performance and correctness on resource-constrained hardware.

3. **Build Time Profiling Session**: Profile the CMake configure and build phases. With 199 CMakeLists.txt files, identify bottlenecks in dependency resolution, template instantiation, and linking. Determine if `OPENDAQ_RTGEN_ON_CMAKE_CONFIG` significantly impacts configure time.

---

## O - OPERATIONS: How the Product is USED

### Deployment Model

**Shared Libraries** (primary):
- Core SDK compiles to multiple shared libraries (`.dll`/`.so`/`.dylib`)
- Modules loaded dynamically at runtime from specified paths
- NuGet packages for .NET consumers
- Python packages via pip (from built bindings)

**Configuration Providers**:
- `JsonConfigProvider`: Load configuration from JSON files
- `EnvConfigProvider`: Environment variable configuration
- `CmdLineArgsConfigProvider`: Command-line argument parsing
- Default configuration with `InstanceBuilder` overrides

**Simulator** (`simulator/`):
- Standalone simulator application (`simulator_app/`)
- Vagrantfile for VM-based simulation
- JSON configuration (`opendaq-config.json`)
- Network configuration management (`netplan_manager.py`)
- Systemd service (`simulator.service`)

### Logging

**Logger Architecture** (`core/opendaq/logger/`):
- Uses spdlog backend with compile-time log level filtering
- `ILogger` manages `ILoggerComponent` instances (per-module logging)
- `ILoggerSink` for output destinations (console, file, custom)
- `ILoggerThreadPool` for async log writing
- Compile-time level: `OPENDAQ_LOG_LEVEL_DEBUG` (Debug builds), `OPENDAQ_LOG_LEVEL_RELEASE` (Release)
- Runtime level control via `ILogger::setLevel()` and per-component `ILoggerComponent::setLevel()`
- Last message sink for testing (`logger_sink_last_message_impl.h`)
- Console log level overridable via `OPENDAQ_SINK_CONSOLE_LOG_LEVEL` env var

### Error Handling

**Error Code System**:
- All public APIs return `ErrCode` (uint32_t with bit encoding)
- `OPENDAQ_FAILED(x)` / `OPENDAQ_SUCCEEDED(x)` macros for checking
- Error type namespacing: Generic=0x00, Scheduler=0x04, Device=0x08, Signal=0x0A, Reader=0x0D
- Error info objects with contextual messages (`DAQ_MAKE_ERROR_INFO`)
- Exception-based wrappers in smart pointer layer
- Error guard (`OPENDAQ_ENABLE_ERROR_GUARD`) auto-enabled in Debug builds

**Parameter Validation** (`core/coretypes/include/coretypes/validation.h`):
- Compile-time toggle: `OPENDAQ_ENABLE_PARAMETER_VALIDATION`
- Macros: `OPENDAQ_PARAM_NOT_NULL`, `OPENDAQ_PARAM_REQUIRE`, `OPENDAQ_PARAM_GE/GT/LE/LT`, `OPENDAQ_PARAM_BETWEEN`
- When disabled: all validation macros expand to nothing (performance mode)

### Runtime Configuration

- Property system: typed properties with validation, coercion, default values
- PropertyObjectClass: reusable property templates
- Eval values: dynamic property expressions (`$PropertyName * 2`)
- Property events: value change notifications
- BeginUpdate/EndUpdate: batch property changes
- Frozen objects: immutable after freeze

### Module Hot-Loading

- `IModuleManager::loadModule(path)`: Load single module at runtime
- `IModuleManager::addModule(module)`: Side-load in-memory modules
- Module authentication: verify digital signatures before loading
- Orphaned module handling (`orphaned_modules.h`)

### Operations Test Ideas

| # | ID | Priority | Test Idea | Automation |
|---|-----|----------|-----------|------------|
| 73 | O-01 | P0 | Create an Instance with `InstanceBuilder`, configure 3 config providers (JSON file, env vars, cmd-line); set conflicting values for the same property in all 3; confirm the documented precedence order determines the final value | Integration |
| 74 | O-02 | P1 | Start the simulator service with `opendaq-config.json`; connect an openDAQ client Instance; discover the simulated device via mDNS; add it; read 10,000 samples; confirm signal output matches configured waveform parameters | E2E |
| 75 | O-03 | P1 | Set logger level to `Debug` at runtime via `ILogger::setLevel(Debug)`; produce 1 million log entries from 10 concurrent logger components; confirm no log entries are lost or interleaved (corrupted) | Integration |
| 76 | O-04 | P2 | Configure `flushOnLevel(Error)` on the logger; trigger an error log message; confirm all buffered messages up to and including the error are flushed to sinks immediately | Unit |
| 77 | O-05 | P2 | Set `OPENDAQ_ENABLE_ERROR_GUARD` in a Release build; call a function that returns an error; confirm the error guard captures the error info including function name and parameter details | Unit |
| 78 | O-06 | P2 | Create a PropertyObject with `BeginUpdate()`/`EndUpdate()` wrapping 50 property changes; confirm only 1 `EndUpdateEventArgs` notification fires (not 50 individual change events) | Unit |
| 79 | O-07 | P2 | Set `OPENDAQ_SINK_CONSOLE_LOG_LEVEL=1` environment variable; create an Instance; confirm console log output respects this override regardless of the compile-time level | E2E |
| 80 | O-08 | P2 | Create a PropertyObject, freeze it via `IFreezable::freeze()`; attempt to set a property value; confirm `OPENDAQ_ERR_FROZEN` is returned | Unit |
| 81 | O-09 | P2 | Load a module, use its function blocks, then call `loadModule` with the same path again; confirm `OPENDAQ_ERR_DUPLICATEITEM` or appropriate handling rather than double-loading | Integration |
| 82 | O-10 | P3 | Create a PropertyObject with a coercer that clamps values to [0, 100]; set value to -50; confirm the stored value is 0 (not -50) and a value-change event fires with the coerced value | Unit |
| 83 | O-11 | P3 | Create a PropertyObject with a validator that rejects negative values; set value to -1; confirm `OPENDAQ_ERR_VALIDATE_FAILED` is returned and the property retains its previous value | Unit |
| 84 | O-12 | P1 | Run the full SDK with AddressSanitizer (ASan) enabled; exercise all reader types, streaming, and device management; confirm zero memory errors | E2E |
| 85 | O-13 | P2 | Side-load a custom module via `addModule`; confirm it appears in `getModules()` and its device/function-block types are discoverable alongside pre-loaded modules | Integration |
| 86 | O-14 | P3 | Configure logging with a custom sink that writes to a ring buffer; produce 1 million log entries; confirm oldest entries are evicted and the ring buffer never exceeds its capacity | Unit |

### Test Data Suggestions for OPERATIONS-Based Tests

- Config JSON: valid complete, minimal, missing required fields, invalid JSON, extra unknown fields
- Environment variables: set/unset, empty string values, values with special characters
- Log levels: Trace, Debug, Info, Warn, Error, Critical, Off
- Module paths: single directory, multiple directories, recursive search enabled/disabled
- Property values: within validator range, outside range, at boundary, type mismatch

### Suggestions for Exploratory Test Sessions: OPERATIONS

1. **Configuration Conflict Session**: Create scenarios where JSON config, env vars, and command-line args all specify conflicting values. Additionally, test what happens when config files are modified while the SDK is running (hot-reload behavior).

2. **Error Propagation Session**: Trace error codes from the deepest internal function (e.g., packet memory allocation failure) through all abstraction layers to the public API. Confirm error info is preserved and not silently swallowed at any layer.

3. **Module Lifecycle Session**: Load modules, create devices from them, destroy the devices, then attempt to unload/reload the modules. Observe orphaned module handling, cleanup order, and whether module state persists across load/unload cycles.

---

## T - TIME: WHEN Things Happen

### Real-Time Constraints

**Signal Processing Timing**:
- Signals produce packets at configured sample rates
- Domain signals provide timestamp information (TickResolution-based)
- Implicit domain gap detection (`IMPLICIT_DOMAIN_GAP_DETECTED` event)
- Linear data rule: `packetOffset + sampleIndex * delta + start` for implicit time calculation
- ReferenceDomainInfo groups signals with shared synchronization sources

**Scheduler** (`core/opendaq/scheduler/`):
- Thread-pool backed by `taskflow` library
- `IAwaitable::wait()` blocks until completion
- `IAwaitable::cancel()` cancels pending (not started) work
- Scheduler stop semantics: cancels outstanding, waits for in-progress, rejects new
- TaskGraph: DAG of tasks with dependency ordering
- **Critical**: Graph execution exceptions are silently ignored (documented in `IScheduler::scheduleGraph`)

**Synchronization** (`core/opendaq/synchronization/`):
- `ISyncComponent`: PTP, IRIG, GPS, CLK interface management
- Sync lock status: `getSyncLocked()` reports whether synchronization is achieved
- Selected source interface: configurable via `setSelectedSource()`
- Free-run mode via internal CLK interface
- Multiple sync outputs for cascaded synchronization

**Connection Queue Timing**:
- `IConnection::enqueue()` adds packets to back of queue
- `IConnection::enqueueOnThisThread()` notifies listener synchronously on calling thread
- `IConnection::dequeue()` removes from front (FIFO)
- Reader timeout parameters control maximum wait time for samples
- `OPENDAQ_NO_MORE_ITEMS` returned when queue is empty

**Streaming Timing**:
- Streaming init request/done handshake
- Signal subscription acknowledgment callbacks
- Active/inactive state transitions
- Client-to-device streaming with reversed producer/consumer roles

**Concurrency Mechanisms**:
- `OPENDAQ_THREAD_SAFE` compile-time toggle
- `std::mutex` vs `NoLockMutex` based on build flag
- `RecursiveMutex` wrapper for reentrant locking
- `IObjectLockGuard` for RAII lock management
- Core event system for thread-safe property change notifications

**Build Time**:
- CI timeout: Windows 270 minutes, Linux 180 minutes, macOS 240 minutes
- 199 CMakeLists.txt files with FetchContent downloads
- rtgen code generation can run at CMake configure time (`OPENDAQ_RTGEN_ON_CMAKE_CONFIG`)

### Time Test Ideas

| # | ID | Priority | Test Idea | Automation |
|---|-----|----------|-----------|------------|
| 87 | T-01 | P0 | Configure two devices synchronized via PTP (`ISyncComponent`); produce signals on both at 10kHz; read via MultiReader; confirm sample timestamps from both devices are aligned within 1 microsecond | E2E |
| 88 | T-02 | P0 | Set up a signal with Linear data rule (delta=1000, TickResolution=1/1000000); inject a domain gap of 5000 ticks by skipping packet offsets; confirm `IMPLICIT_DOMAIN_GAP_DETECTED` event fires with `GapDiff=5000` | Unit |
| 89 | T-03 | P0 | From 10 threads simultaneously, call `enqueue()` and `dequeue()` on the same Connection with `OPENDAQ_THREAD_SAFE=ON`; run for 60 seconds; confirm zero data corruption, lost packets, or deadlocks | Integration |
| 90 | T-04 | P1 | Call `IAwaitable::cancel()` on a scheduled function that has not yet started; confirm `cancel()` returns true and `getResult()` does not block or return stale data | Unit |
| 91 | T-05 | P1 | Call `IAwaitable::wait()` on a function that throws an exception during execution; confirm `wait()` completes and `getResult()` re-throws the exception | Unit |
| 92 | T-06 | P1 | Schedule a TaskGraph with intentionally cyclic dependencies (A->B->C->A); confirm the scheduler detects the cycle and returns an error rather than deadlocking | Unit |
| 93 | T-07 | P1 | Call `StreamReader::read` with `timeoutMs=0` (non-blocking) when no data is available; confirm it returns immediately with count=0 rather than blocking | Unit |
| 94 | T-08 | P1 | Call `StreamReader::read` with `timeoutMs=5000`; produce exactly the requested sample count at t=2000ms; confirm the read returns at approximately t=2000ms (not waiting the full 5000ms) | Unit |
| 95 | T-09 | P2 | Start and stop the `ISyncComponent` sync source rapidly (100 toggles/second); confirm `getSyncLocked()` transitions correctly and no state corruption occurs | Integration |
| 96 | T-10 | P2 | Schedule 10,000 functions via `scheduleFunction` on a scheduler with 4 worker threads; measure completion time and confirm work-stealing achieves near-linear speedup vs single-threaded | Integration |
| 97 | T-11 | P2 | During a TaskGraph execution, call `scheduler.stop()`; confirm in-progress tasks complete, pending tasks are cancelled, and `stop()` does not deadlock | Unit |
| 98 | T-12 | P2 | Produce packets with timestamps spanning a DST transition (e.g., epoch origin + offset crossing 2:00 AM spring forward); confirm readers handle the time gap correctly | Unit |
| 99 | T-13 | P2 | Connect a streaming client to a server; pause the server process for 30 seconds (simulate network partition); resume; confirm the client reconnects and streaming resumes without data duplication | E2E |
| 100 | T-14 | P3 | Set `ISyncComponent` selectedSource to an invalid interface index; confirm error rather than undefined behavior | Unit |
| 101 | T-15 | P2 | Concurrently call `setActive(true)` and `setActive(false)` on the same component from 100 threads; confirm the final state is deterministic and consistent across all child components | Integration |
| 102 | T-16 | P3 | Create a signal with `ReferenceDomainInfo` matching another signal's domain group; add both to a MultiReader; confirm the reader synchronizes them based on shared domain timestamps | Unit |

### Test Data Suggestions for TIME-Based Tests

- Sample rates: 1 Hz (minimum), 10 kHz (standard DAQ), 1 MHz (high-speed), 0 Hz (invalid)
- Timeout values: 0 (non-blocking), 1ms, 1000ms, UINT64_MAX, negative values
- Domain gaps: 1 tick (minimum), 1 million ticks (large), negative gap (time reversal)
- Sync interfaces: PTP, IRIG, GPS, CLK, invalid index values
- Concurrency levels: 1, 4 (typical cores), 64 (oversubscribed), 1000 threads

### Suggestions for Exploratory Test Sessions: TIME

1. **Silent Exception Session**: Investigate the documented behavior that "Any exceptions that occur during the graph execution are silently ignored" (`IScheduler::scheduleGraph`). Create task graphs with various failure modes (null pointer dereference, division by zero, std::bad_alloc). Determine whether any of these can corrupt the scheduler state or cause cascading failures in subsequent graph executions.

2. **Clock Domain Boundary Session**: Create signals from different devices with different `ReferenceDomainInfo` IDs. Connect them to a MultiReader. Observe how the reader handles timestamp misalignment, clock drift simulation, and the transition from synchronized to unsynchronized states.

3. **Timeout Precision Session**: Measure the actual elapsed time for `StreamReader::read` with various `timeoutMs` values on different platforms. Determine if the timeout is implemented as a busy-wait, condition variable, or sleep. Observe jitter and accuracy at the 1ms granularity level.

---

## Product Coverage Outline (PCO)

| # | Testable Element | Reference | Product Factor(s) |
|---|------------------|-----------|-------------------|
| 1 | Component tree construction and traversal | `component.h`, `component_impl.h` | Structure, Data |
| 2 | Signal-to-InputPort connection lifecycle | `signal.h`, `input_port.h`, `connection.h` | Function, Interfaces |
| 3 | StreamReader read with timeout | `stream_reader.h`, `stream_reader_impl.cpp` | Function, Time |
| 4 | BlockReader block boundary behavior | `block_reader.h`, `block_reader_impl.cpp` | Function, Data |
| 5 | TailReader history window | `tail_reader.h`, `tail_reader_impl.cpp` | Function, Data |
| 6 | MultiReader multi-signal synchronization | `multi_reader.h`, `multi_reader_impl.cpp` | Function, Time, Data |
| 7 | DataDescriptor calculation pipeline | `data_descriptor.h`, `data_rule.h`, `scaling.h` | Data, Function |
| 8 | Packet lifecycle and memory management | `packet.h`, `data_packet.h`, `allocator.h` | Data, Time, Structure |
| 9 | JSON serialization/deserialization | `json_serializer.h`, `json_deserializer.h` | Data, Interfaces |
| 10 | Config protocol RPC over TCP | `config_protocol.h`, `config_protocol_server.h` | Interfaces, Time |
| 11 | Native streaming protocol | `native_streaming_protocol_types.h`, `native_streaming_client_handler.h` | Interfaces, Time |
| 12 | Module loading and authentication | `module_manager.h`, `module.h`, `module_authenticator.h` | Operations, Structure |
| 13 | Scheduler thread-pool execution | `scheduler.h`, `task_graph.h`, `awaitable.h` | Time, Function |
| 14 | Synchronization component (PTP/IRIG/GPS) | `sync_component.h`, `sync_component_impl.h` | Time, Platform |
| 15 | Authentication and permission system | `authentication_provider.h`, `permission_manager.h` | Function, Operations |
| 16 | Property system with eval values | `property_object.h`, `eval_value.h`, `coercer.h`, `validator.h` | Operations, Data |
| 17 | Logger infrastructure | `logger.h`, `logger_component.h`, `logger_sink.h` | Operations |
| 18 | Python bindings parity | `bindings/python/` | Interfaces, Platform |
| 19 | C#/.NET bindings parity | `bindings/dotnet/` | Interfaces, Platform |
| 20 | Device discovery (mDNS) | `shared/libraries/discovery/` | Interfaces, Platform |
| 21 | Build system cross-platform | 199 `CMakeLists.txt` files | Platform, Structure |
| 22 | Sample type handling (17 types) | `sample_type.h`, `sample_type_traits.h` | Data |
| 23 | Event packet processing | `event_packet.h`, `event_packet_ids.h` | Function, Time |
| 24 | Mirrored device/signal streaming | `mirrored_device_impl.h`, `mirrored_signal_impl.h` | Interfaces, Time |
| 25 | Instance creation and configuration | `instance.h`, `instance_builder.h`, `config_provider.h` | Operations |
| 26 | Thread safety (OPENDAQ_THREAD_SAFE) | `utility_sync.h`, mutex wrappers | Time, Platform |
| 27 | Error code propagation | `errors.h`, all `*_errors.h` files | Operations, Function |
| 28 | Parameter validation toggle | `validation.h` | Operations, Structure |
| 29 | Packet streaming serialization | `packet_streaming.h` | Data, Interfaces |
| 30 | CI/CD pipeline coverage | `.github/workflows/ci.yml` | Platform |

---

## Clarifying Questions

The following questions arise from gaps detected during analysis. These are suggestions based on general risk patterns and should be reviewed with subject matter experts.

### Structure

1. **What is the intended module compatibility contract?** The `module_check_dependencies.h` header exists but it is unclear what version compatibility guarantees exist between core SDK versions and loaded modules. Can a module built with SDK v3.29 be loaded by SDK v3.31?

2. **What happens to orphaned modules?** The `orphaned_modules.h` header suggests a lifecycle concept for modules that lose their parent context, but the behavior when a module's owning manager is destroyed while devices from that module are still active is not documented.

3. **Is the `IRecursiveSearch` mechanism used for component tree queries?** The `recursive_search.h` in coretypes suggests a search filter pattern, but it is unclear how deeply the search filter propagates through nested component hierarchies and whether it handles circular references (parent-child cycles caused by bugs).

### Function

4. **What are the guarantees around MultiReader signal alignment?** When signals have different sample rates, the MultiReader uses a "commonSampleRate" concept. What happens when signal sample rates are not integer multiples of each other (e.g., 7Hz and 11Hz)? Is the common rate the LCM, or is interpolation performed?

5. **What happens to packets in a Connection queue when the signal is disconnected?** Are existing packets flushed, discarded, or left in the queue for late consumers?

6. **How does the "Explicit" data rule interact with `minExpectedDelta` and `maxExpectedDelta`?** If actual sample deltas violate these parameters, is a warning logged, an event generated, or is it purely informational metadata?

### Data

7. **What is the maximum supported dimension rank?** The DataDescriptor supports N dimensions, but have 3D+ signals (cubes of data) been tested? What are the practical memory limits?

8. **How are `Struct` sample types serialized over the native streaming protocol?** Struct descriptors contain nested descriptors; does the protocol support recursive descriptor serialization without depth limits?

### Interfaces

9. **What is the protocol version negotiation flow?** The config protocol has `GetProtocolInfo` and `UpgradeProtocol` packet types, but the supported protocol versions and backward compatibility matrix are not documented in the source.

10. **Are the C bindings feature-complete relative to the C++ API?** The C binding generation via rtgen may miss template-heavy or overloaded C++ interfaces. Which C++ features are not exposed through the C API?

### Platform

11. **Why are Linux Debug configurations disabled in CI?** The comment states "until the problem with test_py_opendaq is resolved." Is this a known Python binding issue in Debug builds, or does it indicate a deeper Debug-only code path problem?

12. **Why are Windows GCC tests disabled?** The CI comment cites "test_device_modules memory corruption" and "Python tests module resolution issues." Are these tracked issues with expected resolution dates?

### Operations

13. **What is the documented config provider precedence order?** When `JsonConfigProvider`, `EnvConfigProvider`, and `CmdLineArgsConfigProvider` all specify the same setting, which wins? Last-registered, or a fixed hierarchy?

14. **Is there a mechanism for log rotation or size limits?** The `ILoggerSink` interface exists for custom sinks, but are production deployments expected to implement their own log rotation?

### Time

15. **What are the scheduler's thread-pool sizing defaults?** The `IScheduler` uses taskflow underneath, but the default worker count (CPU cores? configurable?) and queue depth limits are not exposed in the public API headers.

16. **What happens when `IAwaitable::getResult()` is called before `wait()` on a non-completed task?** Does it block (like `wait()` + return), throw, or return nullptr?

17. **How does the system handle clock rollback?** If the domain signal's timestamps go backward (NTP correction, manual clock set), do readers report negative time deltas, gap events, or undefined behavior?

---

## Risk Summary

### Highest-Risk Areas (P0 Focus Required)

| Risk Area | Files | Concern |
|-----------|-------|---------|
| Thread safety in Connection queues | `connection_impl.h` | Concurrent enqueue/dequeue with `OPENDAQ_THREAD_SAFE` flag |
| MultiReader signal synchronization | `multi_reader_impl.cpp` | Arithmetic precision with different sample rates |
| Config protocol buffer handling | `config_protocol.h` | Buffer overread with mismatched header/payload sizes |
| Data descriptor change during read | `stream_reader_impl.cpp` | Race between descriptor event and active data read |
| Packet memory lifecycle | `data_packet_impl.h`, `allocator.h` | Use-after-free with WrappedDataPacket external buffers |
| PTP synchronization accuracy | `sync_component_impl.h` | Cross-device timestamp alignment |

### Known Quality Gaps

1. **Disabled tests**: GCC Windows and Linux Debug test suites are disabled in CI, creating blind spots
2. **NOTIMPLEMENTED stubs**: 48 occurrences of `OPENDAQ_ERR_NOTIMPLEMENTED` across 20 files indicate incomplete functionality
3. **TODO/FIXME markers**: 97 code quality markers across 30 files, some potentially hiding bugs
4. **Silent exception swallowing**: TaskGraph execution silently ignores exceptions, which could mask errors
5. **Validation toggle risk**: When `OPENDAQ_ENABLE_PARAMETER_VALIDATION=OFF`, all null checks disappear, creating crash risk

---

## Methodology Notes

This analysis was performed by reading actual source code files from the openDAQ repository at version 3.31.0dev. All file references are to specific headers and source files examined during the analysis. The 168 test ideas span all 7 SFDIPOT categories with emphasis on the areas of highest complexity and risk: the signal processing pipeline, multi-reader synchronization, network protocols, and concurrency mechanisms.

**Automation fitness** was assigned based on:
- **Unit**: Pure interface contract testing, no external dependencies
- **Integration**: Multi-component interaction, may need build system or module loading
- **E2E**: Full system scenarios including networking, cross-platform, or simulator
- **Human Exploration**: Requires judgment, investigation of undocumented behavior, or creative fault injection

**Priority** was assigned based on:
- **P0**: Data corruption, crash, security bypass, or silent data loss
- **P1**: Core functionality failure, major feature broken, production-blocking
- **P2**: Feature correctness issues, edge cases, non-critical quality gaps
- **P3**: Polish, documentation, minor edge cases, performance characterization
