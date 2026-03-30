# openDAQ SDK -- Code Quality and Complexity Analysis Report

**Analysis Date**: 2026-03-30
**Scope**: openDAQ C++ Data Acquisition SDK (core/, shared/, examples/, bindings/)
**Analyzer**: V3 QE Code Complexity Analyzer (Opus 4.6)

---

## Executive Summary

The openDAQ SDK contains approximately **216,987 lines** of production C/C++ code (92,845 .cpp + 124,142 .h, excluding external dependencies and test files). The codebase consists of 679 non-test .cpp files and 1,114 non-test .h files.

The analysis reveals several critical complexity hotspots centered on the property system (`property_object_impl.h` at 3,698 lines) and device management layer (`device_impl.h` at 2,457 lines). These represent God Object anti-patterns that drive up cognitive complexity and reduce testability. The module manager shows significant code duplication through 9 nearly-identical module iteration loops. Empty `catch(...)` blocks suppress errors in critical paths.

**Overall Quality Assessment: 62/100 (MODERATE)**

| Category | Score | Rating |
|----------|-------|--------|
| Cyclomatic Complexity | 55/100 | NEEDS ATTENTION |
| Cognitive Complexity | 50/100 | NEEDS ATTENTION |
| File Size / Modularity | 40/100 | POOR |
| Code Duplication | 55/100 | NEEDS ATTENTION |
| Naming Conventions | 85/100 | GOOD |
| Header Hygiene | 60/100 | MODERATE |

---

## 1. Cyclomatic Complexity Analysis

### 1.1 Most Complex Functions (Estimated Cyclomatic Complexity)

| Function | File | Est. CC | Lines | Risk |
|----------|------|---------|-------|------|
| `setPropertyValueInternal` | `property_object_impl.h:1075` | 28 | 125 | CRITICAL |
| `clearPropertyValueInternal` | `property_object_impl.h:1944` | 22 | 118 | CRITICAL |
| `getAvailableDevices` | `module_manager_impl.cpp:568` | 24 | 138 | CRITICAL |
| `getPropertyAndValueInternal` | `property_object_impl.h:1552` | 18 | 88 | HIGH |
| `setPropertySelectionValueInternal` | `property_object_impl.h:1686` | 20 | 101 | CRITICAL |
| `checkSelectionValues` | `property_object_impl.h:1022` | 14 | 52 | HIGH |
| `configureClonedMembers` | `property_object_impl.h:1808` | 12 | 80 | HIGH |
| `tryLoadAndAddModule` | `module_manager_impl.cpp:296` | 18 | 125 | HIGH |
| `createFunctionBlock` | `module_manager_impl.cpp:1040` | 16 | 94 | HIGH |
| `getPropertiesInternal` | `property_object_impl.h:2319` | 14 | 98 | HIGH |

### 1.2 Detail: `setPropertyValueInternal` (CC ~28)

This function at `core/coreobjects/include/coreobjects/property_object_impl.h:1075-1200` is the most complex function in the codebase. It handles:

- Null checks, frozen state checks
- Child property detection and recursive delegation
- Property lookup and reference property resolution
- Read-only and access control checks
- Type checking (5 separate check calls)
- Coercion, validation, and min/max clamping
- List/dict cloning, object configuration
- Event triggering with ignored-event short-circuit
- Core event notification

This single function spans approximately 125 lines with 28+ decision points. The function mixes validation, mutation, event dispatch, and error handling concerns. It is a prime candidate for decomposition.

**Specific code demonstrating the complexity (lines 1089-1196):**
```cpp
const ErrCode errCode = daqTry([&]()
{
    auto propName = StringPtr::Borrow(name);
    auto valuePtr = BaseObjectPtr::Borrow(value);
    StringPtr subName;
    const auto isChildProp = isChildProperty(propName);
    if (batch && !isChildProp) { /* batch path */ }
    if (isChildProp) { /* child delegation */ }
    PropertyPtr prop = getUnboundProperty(propName);
    prop = checkForRefPropAndGetBoundProp(prop, objPtr);
    if (!prop.assigned()) { /* error */ }
    if (isChildProp) { /* recursive child set */ }
    if (!protectedAccess) { if (readOnly || ctObject) { /* deny */ } }
    OPENDAQ_RETURN_IF_FAILED(checkPropertyTypeAndConvert(prop, valuePtr));
    OPENDAQ_RETURN_IF_FAILED(checkContainerType(prop, valuePtr));
    OPENDAQ_RETURN_IF_FAILED(checkSelectionValues(prop, valuePtr));
    OPENDAQ_RETURN_IF_FAILED(checkStructType(prop, valuePtr));
    OPENDAQ_RETURN_IF_FAILED(checkEnumerationType(prop, valuePtr));
    coercePropertyWrite(prop, valuePtr, objPtr);
    validatePropertyWrite(prop, valuePtr, objPtr);
    coerceMinMax(prop, valuePtr);
    // ... clone logic, event triggering, local write ...
});
```

### 1.3 Detail: `getAvailableDevices` (CC ~24)

At `core/opendaq/modulemanager/src/module_manager_impl.cpp:568-706`, this function demonstrates high cyclomatic complexity through:

- Parallel async device enumeration across all modules
- Future result collection with multi-exception handling
- Device grouping logic with manufacturer/serial key construction
- IP modification support device merging
- Server capability deduplication with nested iteration
- Network reachability checking
- Device visibility filtering

The nested `for` loops with conditionals inside device grouping (lines 626-669) reach 5 levels of nesting.

---

## 2. Cognitive Complexity Analysis

### 2.1 Hardest Files to Understand

| File | Lines | Cognitive Factors | Rating |
|------|-------|-------------------|--------|
| `property_object_impl.h` | 3,698 | Template metaprogramming, 60+ methods, recursive locking, event system | VERY HARD |
| `device_impl.h` | 2,457 | Deep inheritance (4+ levels), 55 interface methods, lock/unlock cascading | VERY HARD |
| `module_manager_impl.cpp` | 2,102 | Async parallelism, module loading, 9 library iteration loops | HARD |
| `multi_reader_impl.cpp` | 1,798 | Synchronization state machine, domain validation, sample rate math | HARD |
| `objectptr.h` | 2,503 | Type-erased smart pointer with 100+ operator overloads and conversion helpers | HARD |
| `component_impl.h` | 1,457 | Component hierarchy with serialization, searching, events, permissions | HARD |
| `property_impl.h` | 1,814 | Property metadata with 23 getter/setter pairs, builder pattern | HARD |
| `signal_impl.h` | 1,351 | Signal lifecycle, connection management, packet routing | MODERATE-HARD |

### 2.2 Specific Cognitive Complexity Issues

**Issue 1: Template-heavy header files used as implementation files**

The five largest files are all `.h` headers containing full template implementations:
- `property_object_impl.h` (3,698 lines)
- `objectptr.h` (2,503 lines)
- `device_impl.h` (2,457 lines)
- `property_impl.h` (1,814 lines)
- `component_impl.h` (1,457 lines)

This is a C++ constraint for templates, but these files carry enormous cognitive load because they mix interface declarations, implementation details, and complex template machinery in single files. Developers must mentally parse thousands of lines to understand a single method.

**Issue 2: Multi-concern methods in `clearPropertyValueInternal`**

At `property_object_impl.h:1944-2061`, this 117-line function mixes:
- Frozen-state checking
- Batch mode deferral
- Child property routing (with recursive delegation)
- Reference property resolution
- Read-only access control
- Object property special handling (iterating child properties to clear each)
- Value-type property clearing with event triggering
- Core event notification

The `else` branch at lines 2008-2056 handles object-type properties by clearing ALL child properties iteratively, which is a completely different code path embedded inside the same function, reaching 7 levels of nesting.

**Issue 3: Deep inheritance chain**

The device hierarchy creates a complex inheritance chain:
```
GenericPropertyObjectImpl<PropObjInterface, Interfaces...>
  -> ComponentImpl<TInterface, Interfaces...>
    -> FolderImpl<TInterface, Interfaces...>
      -> SignalContainerImpl<TInterface, Interfaces...>
        -> GenericDevice<TInterface, Interfaces...>
```

Each level adds virtual methods and state. `GenericDevice` inherits behaviors from at least 4 template base classes, making method resolution and state management extremely difficult to trace.

---

## 3. File Size Analysis

### 3.1 Files Exceeding 500 Lines (Non-Test, Core Only)

**43 files exceed 500 lines** in the core/ directory alone (excluding test files). Here are the top offenders:

| File | Lines | Component | Severity |
|------|-------|-----------|----------|
| `property_object_impl.h` | 3,698 | coreobjects | CRITICAL (7.4x limit) |
| `objectptr.h` | 2,503 | coretypes | CRITICAL (5x limit) |
| `device_impl.h` | 2,457 | opendaq/device | CRITICAL (4.9x limit) |
| `module_manager_impl.cpp` | 2,102 | opendaq/modulemanager | CRITICAL (4.2x limit) |
| `property_impl.h` | 1,814 | coreobjects | CRITICAL (3.6x limit) |
| `multi_reader_impl.cpp` | 1,798 | opendaq/reader | CRITICAL (3.6x limit) |
| `component_impl.h` | 1,457 | opendaq/component | HIGH (2.9x limit) |
| `signal_impl.h` | 1,351 | opendaq/signal | HIGH (2.7x limit) |
| `device_info_impl.h` | 1,225 | opendaq/device | HIGH (2.5x limit) |
| `streaming_impl.h` | 1,219 | opendaq/streaming | HIGH (2.4x limit) |
| `eval_value_impl.cpp` | 1,017 | coreobjects | HIGH (2x limit) |
| `input_port_impl.h` | 888 | opendaq/signal | MODERATE |
| `typed_reader.cpp` | 886 | opendaq/reader | MODERATE |
| `signal_container_impl.h` | 879 | opendaq/signal | MODERATE |
| `instance_impl.cpp` | 866 | opendaq | MODERATE |
| `data_packet_impl.h` | 860 | opendaq/signal | MODERATE |
| `errorinfo_impl.cpp` | 859 | coretypes | MODERATE |
| `coretype_traits.h` | 822 | coretypes | MODERATE |
| `stream_reader_impl.cpp` | 814 | opendaq/reader | MODERATE |
| `connection_impl.cpp` | 807 | opendaq/signal | MODERATE |

### 3.2 Shared Libraries File Size Issues

| File | Lines | Component |
|------|-------|-----------|
| `mdnsdiscovery_client.h` | 1,294 | discovery |
| `config_client_property_object_impl.h` | 1,085 | config_protocol |
| `config_protocol_client.cpp` | 1,073 | config_protocol |
| `mdnsdiscovery_server.cpp` | 1,087 | discovery_server |
| `native_streaming_server_handler.cpp` | 958 | native_streaming |
| `native_streaming_client_handler.cpp` | 807 | native_streaming |
| `base_session_handler.cpp` | 766 | native_streaming |
| `config_protocol_server.cpp` | 750 | config_protocol |
| `config_client_device_impl.h` | 721 | config_protocol |

### 3.3 Test File Size Issues (Informational)

Test files show even worse bloat, which harms test maintainability:

| File | Lines |
|------|-------|
| `test_multi_reader.cpp` | 5,236 |
| `test_native_device_modules.cpp` | 4,495 |
| `test_block_reader.cpp` | 2,922 |
| `test_property_object.cpp` | 2,781 |

---

## 4. Code Duplication Hotspots

### 4.1 Module Manager Library Iteration (CRITICAL)

`core/opendaq/modulemanager/src/module_manager_impl.cpp` contains **9 nearly identical** loop structures iterating over `libraries`:

```cpp
for (const auto& library : libraries)
{
    const auto module = library.module;
    DictPtr<IString, IFunctionBlockType> types;
    try
    {
        types = module.getAvailableFunctionBlockTypes();
    }
    catch (const NotImplementedException&)
    {
        LOG_I("{}: GetAvailableFunctionBlockTypes not implemented", ...);
    }
    catch ([[maybe_unused]] const std::exception& e)
    {
        LOG_W("{}: GetAvailableFunctionBlockTypes failed: {}", ...);
    }
    // ... process types ...
}
```

This pattern appears at lines: 582, 714, 795, 936, 1047, 1155, 1224, 1502, 1568.

Each occurrence follows the same structure: iterate libraries, get module, try-catch around a `getAvailable*` call, handle `NotImplementedException` and `std::exception`. This could be extracted into a generic `forEachModule` template or visitor pattern, eliminating ~300 lines of duplicated boilerplate.

**Recommended refactoring:**
```cpp
template<typename TypeDict, typename F>
DictPtr<IString, TypeDict> collectFromModules(F&& getter, const char* methodName) {
    auto result = Dict<IString, TypeDict>();
    for (const auto& library : libraries) {
        const auto module = library.module;
        try {
            auto types = getter(module);
            if (types.assigned())
                for (const auto& [id, type] : types)
                    result.set(id, type);
        }
        catch (const NotImplementedException&) { LOG_I("..."); }
        catch (const std::exception& e) { LOG_W("..."); }
    }
    return result;
}
```

### 4.2 Error Code Return Pattern (171 instances)

The pattern `OPENDAQ_RETURN_IF_FAILED(errCode); return errCode;` appears **171 times** across 44 files. This is redundant -- if `OPENDAQ_RETURN_IF_FAILED` does not return, then `errCode` is successful, and the next line returns it. While this is technically correct, it adds visual noise. In many cases, these could be simplified.

### 4.3 Property Access Boilerplate

The property set/get/clear pattern is duplicated across:
- `property_object_impl.h` (12 instances of the pattern)
- `config_client_property_object_impl.h` (26 property value method references)
- `property_impl.h` (25 instances)
- `device_info_impl.h` (26 instances)

Each property accessor follows the same template: acquire lock, validate parameter, call internal method, handle error, return. This is an inherent cost of the COM-like error handling approach but could benefit from macro or CRTP helpers.

### 4.4 ConvertIfOldId Pattern

At `module_manager_impl.cpp:965-1003`, there are two functions `ConvertIfOldIdFB` and `ConvertIfOldIdProtocol` that are chains of `if (id == "old") return "new";` statements. These should be static lookup tables:

```cpp
static const std::unordered_map<StringPtr, StringPtr> oldFbIds = {
    {"ref_fb_module_classifier", "RefFBModuleClassifier"},
    {"ref_fb_module_fft", "RefFBModuleFFT"},
    // ...
};
```

### 4.5 `catch(...)` with Empty Bodies

There are **13 instances** of `catch(...) {}` (empty catch blocks) across 6 files in core/, with 5 instances in `property_object_impl.h` alone. These silent exception swallowing locations include:

- `property_object_impl.h:877-881` -- Silently ignores comparison failure in `coerceMinMax`
- `property_object_impl.h:889-893` -- Same pattern for max coercion
- `property_object_impl.h:1253-1257` -- Ignores failure when comparing default values in `shouldWriteLocalValue`
- `property_object_impl.h:1281-1285` -- Same in `writeLocalValue`

Empty catch blocks are a testing anti-pattern. They hide failures and make debugging extremely difficult. Each should at minimum log a warning.

---

## 5. Naming Conventions Analysis

### 5.1 Overall Consistency: GOOD (85/100)

The openDAQ codebase follows a consistent naming convention:

| Element | Convention | Consistency |
|---------|-----------|-------------|
| Classes | PascalCase (`GenericPropertyObjectImpl`) | Consistent |
| Methods | camelCase (`setPropertyValue`) | Consistent |
| Interface Methods | PascalCase with `INTERFACE_FUNC` (`getClassName`) | Consistent |
| Member Variables | camelCase (`propValues`, `updateCount`) | Consistent |
| Macros | UPPER_SNAKE_CASE (`OPENDAQ_PARAM_NOT_NULL`) | Consistent |
| Namespaces | lowercase (`config_protocol`) | Consistent |
| Template Parameters | PascalCase (`PropObjInterface`, `TInterface`) | Consistent |
| Constants | camelCase or PascalCase (`createModuleFactory`) | Minor inconsistency |
| Interface Types | `I`-prefix PascalCase (`IPropertyObject`) | Consistent |
| Smart Pointer Types | `Ptr` suffix (`PropertyObjectPtr`) | Consistent |

### 5.2 Minor Issues Found

1. **Constant naming inconsistency**: `static constexpr` values use lowercase (`createModuleFactory`) at `module_manager_impl.cpp:46-47`, while others use PascalCase. These are minor.

2. **Typo in method name**: `rendererStopRequesteding()` at `renderer_fb_impl.cpp:52` -- "requesting" is misspelled as "requesteding".

3. **Member variable naming**: `AnyReadEventName` and `AnyWriteEventName` at `property_object_impl.h:322-323` use PascalCase for `const` members, while all other member variables use camelCase. These should be `anyReadEventName` / `anyWriteEventName` for consistency, or made `static constexpr` if they are truly constants.

---

## 6. Include/Header Analysis

### 6.1 Files with Most Includes

| File | Include Count | Assessment |
|------|--------------|------------|
| `opendaq.h` | 64 | Umbrella header -- acceptable |
| `coretypes.h` | 51 | Umbrella header -- acceptable |
| `property_object_impl.h` | 39 | EXCESSIVE for a single class |
| `module_manager_impl.cpp` | 36 | HIGH -- suggests too many responsibilities |
| `device_impl.h` | 36 | HIGH -- suggests too many responsibilities |
| `component_impl.h` | 33 | HIGH |
| `objectptr.h` | 26 | MODERATE |

### 6.2 Specific Include Issues

**`property_object_impl.h` (39 includes):**

This header pulls in 39 other headers, including:
- 16 coreobjects headers
- 6 coretypes headers
- 5 STL headers (`<cmath>`, `<limits>`, `<map>`, `<thread>`, `<utility>`)
- External library (`tsl/ordered_map.h`)

This is a compilation bottleneck. Every file that includes `property_object_impl.h` transitively pulls in all 39+ headers. Since this header is included by `component_impl.h`, `device_impl.h`, and many others, the transitive closure is enormous.

**`module_manager_impl.cpp` (36 includes):**

This source file has a duplicate include:
```cpp
#include <coretypes/validation.h>   // line 12
#include <coretypes/validation.h>   // line 18 (DUPLICATE)
```

Also includes both:
```cpp
#include <coreobjects/property_factory.h>     // line 1
#include <coreobjects/property_factory.h>     // line 22 (DUPLICATE via headers)
```

### 6.3 Circular Dependency Risks

The following dependency chain creates tight coupling:
```
property_object_impl.h -> property_factory.h -> property_object.h
device_impl.h -> property_object_impl.h -> ... -> device_private.h
component_impl.h -> property_object_impl.h
```

Forward declarations are used in places (e.g., `config_protocol::ConfigClientDeviceInfoImpl` at `property_object_impl.h:70`), which is good practice. However, the sheer number of transitive includes suggests the interfaces could benefit from further decoupling.

### 6.4 Header Guard Style

All headers consistently use `#pragma once` rather than traditional include guards. This is consistent and modern.

---

## 7. Quantitative Metrics Summary

### 7.1 Codebase Size

| Metric | Value |
|--------|-------|
| Total Production Lines (non-test, non-external) | 216,987 |
| Production .cpp Files | 679 |
| Production .h Files | 1,114 |
| Test .cpp Files | ~307 |
| Files Over 500 Lines (production, core/) | 43 |
| Files Over 1,000 Lines (production, entire repo) | 28 |
| Files Over 2,000 Lines (production) | 5 |

### 7.2 Complexity Metrics

| Metric | Value | Threshold | Status |
|--------|-------|-----------|--------|
| Largest File | 3,698 lines | 500 | CRITICAL (7.4x) |
| Deepest Nesting | 7 levels | 4 | HIGH |
| Most Complex Function (est. CC) | 28 (`setPropertyValueInternal`) | 10 | CRITICAL (2.8x) |
| Longest Function | 138 lines (`getAvailableDevices`) | 60 | HIGH (2.3x) |
| Most Interface Methods (single class) | 58 (`GenericPropertyObjectImpl`) | 20 | CRITICAL |
| Most Includes (single file) | 39 (`property_object_impl.h`) | 15 | CRITICAL |
| `catch(...)` Empty Blocks | 13 | 0 | HIGH |
| Duplicate Module Iterations | 9 | 1 | HIGH |
| `RETURN_IF_FAILED; return errCode;` Pattern | 171 | - | MODERATE |

### 7.3 Complexity Distribution (Estimated)

Based on the analysis of functions found in the core:

| Level | Estimated CC | Functions (approx.) | Share |
|-------|-------------|---------------------|-------|
| Low | 1-5 | ~70% | Majority |
| Medium | 6-10 | ~18% | Acceptable |
| High | 11-20 | ~9% | Needs review |
| Critical | >20 | ~3% | Requires refactoring |

---

## 8. Testability Assessment

### 8.1 Testability Blockers

1. **Template-heavy implementations in headers**: Testing `GenericPropertyObjectImpl` requires instantiating it with specific template parameters. The 3,698-line header means any change triggers recompilation of all dependents.

2. **Deep inheritance**: The 4-level device hierarchy makes unit testing individual layers extremely difficult without mocking the entire chain.

3. **Silent error suppression**: 13 empty `catch(...)` blocks mean bugs can silently pass tests without detection.

4. **Tight coupling in ModuleManager**: The `ModuleManagerImpl` directly instantiates and manages modules, making it impossible to test without real module binaries.

5. **Locking complexity**: The dual-lock system (`getRecursiveConfigLock` vs `getAcquisitionLock`) with `InheritLock` strategy creates potential for deadlocks that are extremely difficult to test.

### 8.2 Testing Effort Estimate

| Area | Testability Score | Estimated Additional Tests Needed |
|------|-------------------|----------------------------------|
| Property System | 40/100 (Difficult) | ~200 edge-case tests |
| Device Management | 45/100 (Difficult) | ~150 integration tests |
| Module Manager | 35/100 (Very Difficult) | ~100 tests (needs DI) |
| Reader System | 55/100 (Moderate) | ~80 tests |
| Signal/Connection | 60/100 (Moderate) | ~60 tests |
| Core Types | 75/100 (Easy) | ~30 tests |

---

## 9. Refactoring Recommendations

### 9.1 Priority 1: Decompose `GenericPropertyObjectImpl` (CRITICAL)

**Current**: 3,698-line header with 58+ interface methods and 30+ private methods.

**Recommended Strategy**: Extract into focused mixins/policies:
1. **PropertyValueAccessor** -- get/set/clear property values (~800 lines)
2. **PropertyEventDispatcher** -- event triggering, read/write events (~400 lines)
3. **PropertySerializer** -- serialize/deserialize (~500 lines)
4. **PropertyValidator** -- type checking, coercion, validation (~300 lines)
5. **PropertyUpdateManager** -- begin/end update batching (~200 lines)

**Estimated Impact**: Reduces max file from 3,698 to ~1,400 lines. Improves testability 2-3x by allowing individual concern testing.

### 9.2 Priority 2: Extract Module Manager Iteration Pattern (HIGH)

**Current**: 9 copy-pasted `for (const auto& library : libraries)` loops.

**Recommended Strategy**: Create `forEachModuleType<T>()` template method that handles iteration, exception handling, and logging.

**Estimated Impact**: Eliminates ~300 lines of duplication. Single fix point for module iteration bugs.

### 9.3 Priority 3: Eliminate Empty Catch Blocks (HIGH)

**Current**: 13 instances of `catch(...) {}` silently suppressing exceptions.

**Recommended Strategy**: Replace each with `catch(...) { LOG_W("...context..."); }` at minimum, or better yet, handle the specific expected exceptions.

**Estimated Impact**: Prevents silent failure propagation, improves debuggability significantly.

### 9.4 Priority 4: Reduce `device_impl.h` Size (HIGH)

**Current**: 2,457-line header with 55 interface methods.

**Recommended Strategy**: Extract `DeviceSerializer`, `DeviceLockManager`, `DeviceNetworkConfig` as separate concerns. Move non-template portions to .cpp files where possible.

### 9.5 Priority 5: Break Up Large Test Files (MODERATE)

**Current**: `test_multi_reader.cpp` at 5,236 lines, `test_native_device_modules.cpp` at 4,495 lines.

**Recommended Strategy**: Split by test category (e.g., `test_multi_reader_sync.cpp`, `test_multi_reader_gap_detection.cpp`, `test_multi_reader_lifecycle.cpp`).

---

## 10. Positive Observations

Despite the complexity issues, the codebase demonstrates several quality practices:

1. **Consistent naming conventions** across 2,190+ files -- the I-prefix interface, Ptr-suffix smart pointer, and camelCase member naming is uniformly applied.

2. **Error handling framework** using `ErrCode`, `OPENDAQ_RETURN_IF_FAILED`, and `daqTry` is systematic and consistent.

3. **`#pragma once`** used consistently across all headers.

4. **Forward declarations** used in appropriate places to break circular dependencies.

5. **Smart pointer system** (`ObjectPtr<T>`) provides RAII-based resource management uniformly across the codebase.

6. **Documentation comments** are present on protected/private methods explaining design intent (e.g., `property_object_impl.h:222-267` documenting the locking strategy).

7. **License headers** present consistently across all source files.

---

## Appendix A: File Paths Referenced

All analysis paths are relative to `/workspaces/agentic-qe/tmp/opendaq/`:

- `core/coreobjects/include/coreobjects/property_object_impl.h` (3,698 lines)
- `core/coretypes/include/coretypes/objectptr.h` (2,503 lines)
- `core/opendaq/device/include/opendaq/device_impl.h` (2,457 lines)
- `core/opendaq/modulemanager/src/module_manager_impl.cpp` (2,102 lines)
- `core/coreobjects/include/coreobjects/property_impl.h` (1,814 lines)
- `core/opendaq/reader/src/multi_reader_impl.cpp` (1,798 lines)
- `core/opendaq/component/include/opendaq/component_impl.h` (1,457 lines)
- `core/opendaq/signal/include/opendaq/signal_impl.h` (1,351 lines)
- `core/opendaq/device/include/opendaq/device_info_impl.h` (1,225 lines)
- `core/opendaq/streaming/include/opendaq/streaming_impl.h` (1,219 lines)
- `core/coreobjects/src/eval_value_impl.cpp` (1,017 lines)
- `examples/modules/ref_fb_module/modules/ref_fb_module/src/renderer_fb_impl.cpp` (1,584 lines)
- `shared/libraries/config_protocol/include/config_protocol/config_client_property_object_impl.h` (1,085 lines)
- `shared/libraries/config_protocol/src/config_protocol_client.cpp` (1,073 lines)

## Appendix B: Methodology

This analysis was performed by reading actual source files and counting specific patterns using:
- Line count analysis (`wc -l`) for file size metrics
- Brace-depth tracking for nesting analysis
- Pattern matching for duplication detection (`catch(...)`, library iteration, error return patterns)
- Manual function-level review for cyclomatic complexity estimation
- Include counting for header dependency analysis

Cyclomatic complexity values are estimated from manual branch-point counting (if/else, switch cases, ternary operators, logical operators, loop constructs) within functions. Exact values would require a proper static analysis tool (e.g., cppcheck, SonarQube, or lizard).
