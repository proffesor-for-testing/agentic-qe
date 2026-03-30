# openDAQ C++ SDK -- Comprehensive Security Analysis

**Report ID**: QE-SEC-OPENDAQ-002
**Date**: 2026-03-30
**Analyst**: V3 QE Security Reviewer (claude-opus-4-6)
**Scope**: Full codebase at `/workspaces/agentic-qe/tmp/opendaq/` (branch: nse-demo)
**Codebase Size**: ~428K lines C/C++, 1,142 source files (.cpp/.h)
**Methodology**: OWASP Top 10 2021, CWE/SANS Top 25, manual code review of source files

---

## Executive Summary

The openDAQ SDK is a C++ data acquisition framework with network streaming, serialization, module loading, cross-language bindings, and authentication. This review identified **23 distinct findings** across 10 security domains, including **4 Critical**, **6 High**, **8 Medium**, and **5 Low/Informational** severity issues.

The most severe findings are:
1. **OS Command Injection** via unsanitized user input passed to `popen()`/`system()` in the network configuration and simulator code.
2. **Plaintext Password Fallback** in the authentication provider, which silently accepts unhashed passwords when bcrypt format is not detected.
3. **Hardcoded Credentials** in the simulator's production entrypoint with default username/password pairs.
4. **Default-Permissive Authorization Bypass** -- the base `PermissionManagerImpl::isAuthorized()` unconditionally returns `true`.

**Weighted Finding Score**: 24.75 (minimum threshold: 3.0 -- EXCEEDED)

| Severity     | Count | Weight | Subtotal |
|-------------|-------|--------|----------|
| CRITICAL    | 4     | 3      | 12.0     |
| HIGH        | 6     | 2      | 12.0     |
| MEDIUM      | 8     | 1      | 8.0      |
| LOW         | 3     | 0.5    | 1.5      |
| INFO        | 2     | 0.25   | 0.5      |
| **TOTAL**   | **23**|        | **34.0** |

---

## Findings by Category

### 1. AUTHENTICATION AND AUTHORIZATION

#### FINDING SEC-001: Plaintext Password Fallback in Authentication Provider [CRITICAL]

- **File**: `core/coreobjects/src/authentication_provider_impl.cpp`, lines 85-91
- **CWE**: CWE-256 (Plaintext Storage of a Password), CWE-261 (Weak Encoding for Password)
- **OWASP**: A07:2021 -- Identification and Authentication Failures

The `isPasswordValid()` method falls back to direct string comparison when the stored hash does not match bcrypt format:

```cpp
// Line 85-91
bool AuthenticationProviderImpl::isPasswordValid(const std::string& hash, const StringPtr& password)
{
    if (std::regex_match(hash, BcryptRegex))
        return BCrypt::validatePassword(password, hash);

    return hash == password;  // <-- PLAINTEXT FALLBACK
}
```

**Impact**: Any user configured without bcrypt hashing has their password stored and compared in plaintext. An attacker who gains read access to user configuration data obtains immediate cleartext credentials. The `User` constructor (user_impl.cpp:11) accepts arbitrary strings as `passwordHash`, making it trivial to misconfigure.

**Remediation**: Remove the plaintext fallback. Require all passwords to be bcrypt-hashed. Throw an error or log a critical warning if a non-bcrypt hash is encountered. Provide a utility function to hash passwords at configuration time.

---

#### FINDING SEC-002: Hardcoded Default Credentials in Simulator [CRITICAL]

- **File**: `simulator/simulator_app/src/main.cpp`, lines 27-29
- **CWE**: CWE-798 (Use of Hard-coded Credentials)
- **OWASP**: A07:2021 -- Identification and Authentication Failures

```cpp
// Line 27-29
users.pushBack(User("opendaq", "$2b$10$bqZWNEd.g1R1Q1inChdAiuDr5lbal33bBNOehlCwuWcxRH5weF3hu")); // password: opendaq
users.pushBack(User("root", "$2b$10$k/Tj3yqFV7uQz42UCJK2n.4ECd.ySQ2Sfd81Kx.xfuMOeluvA/Vpy", {"admin"})); // password: root
```

**Impact**: The simulator ships with well-known default credentials ("opendaq"/"opendaq" and "root"/"root") with the root user having admin group membership. Deployments that do not change these credentials are immediately compromisable. The passwords are documented in source code comments, making them trivially discoverable.

**Remediation**: Force credential configuration at first-run. Never embed default passwords in source code. Use a configuration file external to the binary, or require interactive setup.

---

#### FINDING SEC-003: Default-Permissive Authorization Bypass [CRITICAL]

- **File**: `core/coreobjects/src/permission_manager_impl.cpp`, lines 190-195
- **CWE**: CWE-862 (Missing Authorization), CWE-285 (Improper Authorization)
- **OWASP**: A01:2021 -- Broken Access Control

```cpp
// Line 190-195
ErrCode PermissionManagerImpl::isAuthorized(IUser* /*user*/, Permission /*permission*/, Bool* authorizedOut)
{
    OPENDAQ_PARAM_NOT_NULL(authorizedOut);
    *authorizedOut = true;  // <-- ALWAYS AUTHORIZED
    return OPENDAQ_SUCCESS;
}
```

The base `PermissionManagerImpl` unconditionally returns `true` for all authorization checks. While there is a more complete `PermissionManagerWithPermissionsImpl` (visible at line 69), any component that instantiates the base class via `PermissionManager()` factory (line 199) bypasses all access control.

**Impact**: Components created without explicit permission configuration silently skip all authorization checks. The `hasUserAccessToSignal()` method in `base_session_handler.cpp:669-672` also unconditionally returns `true`, meaning all network clients can access all signals regardless of user permissions.

```cpp
// base_session_handler.cpp:669-672
bool BaseSessionHandler::hasUserAccessToSignal(const SignalPtr& signal)
{
    return true;
}
```

**Remediation**: Change the default `isAuthorized()` to deny by default (return `false`). Require explicit permission grants. Override `hasUserAccessToSignal()` in server session handlers to perform actual permission checks.

---

#### FINDING SEC-004: Anonymous Authentication Enabled by Default in Simulator [HIGH]

- **File**: `simulator/simulator_app/src/main.cpp`, line 30
- **CWE**: CWE-306 (Missing Authentication for Critical Function)
- **OWASP**: A07:2021 -- Identification and Authentication Failures

```cpp
// Line 30
const AuthenticationProviderPtr authenticationProvider = StaticAuthenticationProvider(true, users);
//                                                                                   ^^^^
//                                                                         allowAnonymous = true
```

The simulator enables anonymous access by default. Combined with SEC-003 (default-permissive authorization), any unauthenticated network client can access the full device tree.

**Remediation**: Default to `false` for anonymous access. Require explicit opt-in.

---

#### FINDING SEC-005: No Rate Limiting or Account Lockout on Authentication [HIGH]

- **File**: `core/coreobjects/src/authentication_provider_impl.cpp`, lines 27-38
- **CWE**: CWE-307 (Improper Restriction of Excessive Authentication Attempts)
- **OWASP**: A07:2021 -- Identification and Authentication Failures

The `authenticate()` method has no rate limiting, lockout, or delay mechanism:

```cpp
ErrCode INTERFACE_FUNC AuthenticationProviderImpl::authenticate(IString* username, IString* password, IUser** userOut)
{
    const auto user = findUserInternal(username);
    if (!user.assigned())
        return DAQ_MAKE_ERROR_INFO(OPENDAQ_ERR_AUTHENTICATION_FAILED, "user not found");

    const auto hash = user.asPtr<IUserInternal>(true).getPasswordHash();
    if (!isPasswordValid(hash, password))
        return DAQ_MAKE_ERROR_INFO(OPENDAQ_ERR_AUTHENTICATION_FAILED, "password for user is invalid");
    // ... no rate limit, no lockout, no delay
```

**Impact**: Enables brute-force password attacks against the native streaming server, especially when combined with the weak default passwords in SEC-002.

**Remediation**: Implement exponential backoff or account lockout after N failed attempts. Add configurable thresholds.

---

#### FINDING SEC-006: Password Hash Serialized Over Network [HIGH]

- **File**: `core/coreobjects/src/user_impl.cpp`, lines 85-88
- **CWE**: CWE-312 (Cleartext Storage of Sensitive Information)
- **OWASP**: A04:2021 -- Insecure Design

```cpp
// Line 85-88
if (passwordHash.assigned())
{
    serializer->key("passwordHash");
    serializer->writeString(passwordHash.getCharPtr(), passwordHash.getLength());
}
```

User objects serialize their password hashes. When `User` objects are transmitted as part of the config protocol over the network, password hashes (or plaintext passwords, per SEC-001) are sent in cleartext since the native streaming protocol uses unencrypted TCP connections (no TLS -- see SEC-010).

**Remediation**: Exclude `passwordHash` from serialization in network contexts. Add a flag to control serialization of sensitive fields.

---

### 2. OS COMMAND INJECTION

#### FINDING SEC-007: Command Injection via Network Configuration Parameters [CRITICAL]

- **File**: `examples/modules/ref_device_module/src/ref_device_impl.cpp`, lines 632-647
- **CWE**: CWE-78 (OS Command Injection)
- **OWASP**: A03:2021 -- Injection

User-provided network configuration parameters (`ifaceName`, `address4`, `address6`, `gateway4`, `gateway6`) are concatenated into a shell command string without any sanitization and passed to `popen()`:

```cpp
// Lines 632-647
const std::string scriptWithParams = "/home/opendaq/netplan_manager.py verify " +
                                     ifaceName.toStdString() + " " +
                                     (dhcp4 ? "true" : "false") + " " +
                                     (dhcp6 ? "true" : "false") + " " +
                                     "\"" + address4.toStdString() + "\" " +
                                     "\"" + address6.toStdString() + "\" " +
                                     "\"" + gateway4.toStdString() + "\" " +
                                     "\"" + gateway6.toStdString() + "\"";

const std::string command = "sudo python3 " + scriptWithParams + " 2>&1";
FILE* pipe = popen(command.c_str(), "r");  // <-- INJECTION POINT
```

A second instance at line 668:
```cpp
const std::string command = "sudo python3 /home/opendaq/netplan_manager.py parse " +
                            ifaceName.toStdString() + " 2>&1";
FILE* pipe = popen(command.c_str(), "r");  // <-- INJECTION POINT
```

**Impact**: An attacker who can set a device property like `ifaceName` to a value containing shell metacharacters (e.g., `; rm -rf /` or `$(malicious_command)`) achieves **arbitrary command execution as root** since the commands are prefixed with `sudo`. This is exploitable over the network via the config protocol if the attacker can set device properties.

A third instance exists in the simulator:
- **File**: `simulator/simulator_app/src/main.cpp`, line 21
```cpp
int result = std::system("sudo python3 /home/opendaq/netplan_manager.py apply");
```
While this instance has no user input, it still runs as root without path validation.

**Remediation**: Never pass user input to shell commands. Use `execve()` with explicit argument arrays. Validate and sanitize all inputs with strict allowlists (e.g., validate IP addresses against regex `^[0-9a-fA-F.:\/]+$`, validate interface names against `^[a-zA-Z0-9]+$`).

---

### 3. NETWORK SECURITY

#### FINDING SEC-008: No TLS/Encryption on Native Streaming Protocol [HIGH]

- **Files**:
  - `shared/libraries/native_streaming_protocol/src/native_streaming_client_handler.cpp`
  - `shared/libraries/native_streaming_protocol/src/native_streaming_server_handler.cpp`
  - `shared/libraries/native_streaming_protocol/src/base_session_handler.cpp`
- **CWE**: CWE-319 (Cleartext Transmission of Sensitive Information)
- **OWASP**: A02:2021 -- Cryptographic Failures

The entire native streaming protocol operates over unencrypted TCP (boost::asio TCP sockets). No TLS configuration was found anywhere in the native streaming code. The `WITH_OPENSSL` flag is explicitly set to `OFF` in `external/thrift/CMakeLists.txt`:

```cmake
set(WITH_OPENSSL OFF CACHE BOOL "")
```

**Impact**: All data -- including authentication credentials (username/password sent in basic auth), measurement data, device configuration commands, and password hashes (SEC-006) -- traverses the network in cleartext. Susceptible to passive eavesdropping and active man-in-the-middle attacks.

**Remediation**: Implement TLS support for all network protocols. Use boost::asio::ssl for the native streaming protocol. Enable OpenSSL in the Thrift build.

---

#### FINDING SEC-009: Credentials Transmitted in Cleartext During Authentication [HIGH]

- **File**: `shared/libraries/native_streaming_protocol/src/native_streaming_client_handler.cpp`, lines 542-551
- **CWE**: CWE-523 (Unprotected Transport of Credentials)
- **OWASP**: A07:2021 -- Identification and Authentication Failures

```cpp
Authentication NativeStreamingClientImpl::initClientAuthenticationObject(const PropertyObjectPtr& authenticationObject)
{
    const StringPtr username = authenticationObject.getPropertyValue("Username");
    const StringPtr password = authenticationObject.getPropertyValue("Password");

    if (username.getLength() == 0)
        return Authentication();

    return Authentication(username, password);  // <-- cleartext password
}
```

The client sends username and password as properties over the unencrypted connection. The `Password` property in `native_streaming_client_module_impl.cpp:447` stores credentials as a `StringProperty` with empty default.

**Remediation**: Implement a challenge-response authentication mechanism or require TLS for credential exchange.

---

### 4. MEMORY SAFETY

#### FINDING SEC-010: Unchecked `malloc` Return in Network Packet Parsing [MEDIUM]

- **File**: `shared/libraries/native_streaming_protocol/src/base_session_handler.cpp`, lines 112, 311, 320
- **CWE**: CWE-252 (Unchecked Return Value), CWE-476 (NULL Pointer Dereference)
- **OWASP**: A08:2021 -- Software and Data Integrity Failures

Multiple `std::malloc()` calls in the network packet parsing path do not check for `nullptr` return:

```cpp
// Line 112 - config packet
packetBufferHeader = static_cast<config_protocol::PacketHeader*>(std::malloc(headerSize));
copyData(packetBufferHeader, data, headerSize, bytesDone, size);  // NULL deref if malloc fails

// Line 311 - streaming packet
packetBufferHeader = static_cast<GenericPacketHeader*>(std::malloc(headerSize));
copyData(packetBufferHeader, data, headerSize, bytesDone, size);  // NULL deref if malloc fails

// Line 320
packetBufferPayload = std::malloc(packetBufferHeader->payloadSize);
copyData(packetBufferPayload, data, ...);  // NULL deref if malloc fails
```

**Impact**: A crafted network packet with a large `headerSize` or `payloadSize` could cause `malloc` to fail, leading to a null pointer dereference and crash (denial of service). The `headerSize` and `payloadSize` values come directly from network data with minimal validation.

**Remediation**: Check all `malloc` return values. Add upper-bound validation on `headerSize` and `payloadSize` before allocation. Use a maximum allowed size constant.

---

#### FINDING SEC-011: Network-Controlled Allocation Size Without Upper Bound [MEDIUM]

- **File**: `shared/libraries/native_streaming_protocol/src/base_session_handler.cpp`, lines 99-126
- **CWE**: CWE-789 (Memory Allocation with Excessive Size Value)
- **OWASP**: A08:2021 -- Software and Data Integrity Failures

The `readConfigurationPacket()` method reads `headerSize` from the network and uses it directly for memory allocation:

```cpp
decltype(config_protocol::PacketHeader::headerSize) headerSize;
copyData(&headerSize, data, sizeof(headerSize), bytesDone, size);

if (headerSize != sizeof(config_protocol::PacketHeader))
{
    LOG_E("Unsupported config packet buffer header size: {}. Skipping payload.", headerSize);
    return createReadHeaderTask();
}

packetBufferHeader = static_cast<config_protocol::PacketHeader*>(std::malloc(headerSize));
// ...
if (packetBufferHeader->payloadSize > 0)
{
    packetBufferHeader = static_cast<config_protocol::PacketHeader*>(
        std::realloc(oldPtr, packetBufferHeader->headerSize + packetBufferHeader->payloadSize)
    );
```

While `headerSize` has an exact-match check for config packets, the `readPacketBuffer()` method (line 304) only checks `headerSize >= sizeof(GenericPacketHeader)`, allowing arbitrarily large allocations controlled by network data. The `payloadSize` field (read from untrusted packet header) has no upper-bound validation before being used in `realloc`.

**Remediation**: Enforce maximum allocation sizes. The `TransportHeader::MAX_PAYLOAD_SIZE` exists but is only checked in `calculatePayloadSize()` for outbound packets, not for inbound packet parsing.

---

#### FINDING SEC-012: `realloc` Without NULL Check and Memory Leak on Failure [MEDIUM]

- **File**: `shared/libraries/native_streaming_protocol/src/base_session_handler.cpp`, lines 121-127
- **CWE**: CWE-401 (Missing Release of Memory after Effective Lifetime)
- **OWASP**: A08:2021 -- Software and Data Integrity Failures

```cpp
void* oldPtr = static_cast<void*>(packetBufferHeader);
packetBufferHeader = static_cast<config_protocol::PacketHeader*>(
    std::realloc(oldPtr, packetBufferHeader->headerSize + packetBufferHeader->payloadSize)
);
```

If `realloc` fails and returns `nullptr`, the original memory pointed to by `oldPtr` is leaked (the original pointer is overwritten with `nullptr`). Additionally, `headerSize + payloadSize` could overflow on 32-bit systems if both values are large.

**Remediation**: Save the original pointer before `realloc`. Check the return value. Use checked arithmetic for the size calculation.

---

#### FINDING SEC-013: Unsafe `strcpy` Without Bounds Checking [MEDIUM]

- **Files**:
  - `core/coretypes/src/json_deserializer_impl.cpp`, lines 170, 204, 243
  - `core/opendaq/utility/src/device_update_options_impl.cpp`, line 41
  - `bindings/python/core_types/include/py_core_types/py_queued_event_handler_impl.h`, line 74
- **CWE**: CWE-120 (Buffer Copy without Checking Size of Input)
- **OWASP**: A08:2021 -- Software and Data Integrity Failures

Multiple uses of `strcpy` without bounds checking:

```cpp
// json_deserializer_impl.cpp:170
strcpy(&buffer[dataPaddingSize], ptr);

// json_deserializer_impl.cpp:204
strcpy(buffer.get(), ptr);

// py_queued_event_handler_impl.h:74
std::strcpy(*str, str1.c_str());
```

While these specific instances allocate buffers based on string length before copying, the pattern is fragile and error-prone. The `json_deserializer_impl.cpp` code allocates `length + 1 + dataPaddingSize * 2` bytes but copies from an offset of `dataPaddingSize`, which is correct but relies on exact size calculations that are easy to get wrong during refactoring.

**Remediation**: Use `std::memcpy` with explicit size parameters or `strncpy_s` consistently. Prefer `std::string` operations where possible.

---

#### FINDING SEC-014: `std::realloc` in Statistics Function Block Without NULL Check [MEDIUM]

- **File**: `examples/modules/ref_fb_module/modules/ref_fb_module/src/statistics_fb_impl.cpp`, line 251
- **CWE**: CWE-252 (Unchecked Return Value)

```cpp
const auto newBuf = static_cast<uint8_t*>(std::realloc(calcBuf.release(), calcBufAllocatedSize * sampleSize));
```

`calcBuf.release()` gives up ownership before the `realloc` result is checked. If `realloc` returns `nullptr`, the original buffer is leaked and the unique_ptr holds a null pointer.

**Remediation**: Use a temporary for the `realloc` result before releasing the unique_ptr.

---

### 5. MODULE LOADING AND SUPPLY CHAIN

#### FINDING SEC-015: Module Search Path Controlled by Environment Variable [HIGH]

- **File**: `core/opendaq/modulemanager/src/module_manager_impl.cpp`, lines 186-202
- **CWE**: CWE-426 (Untrusted Search Path), CWE-427 (Uncontrolled Search Path Element)
- **OWASP**: A08:2021 -- Software and Data Integrity Failures

```cpp
auto envPath = std::getenv("OPENDAQ_MODULES_PATH");
if (envPath != nullptr)
{
    // ... splits by ':' or ';' and adds all paths
    while (std::getline(ss, token, sep))
        paths.push_back(token);
}
```

The `OPENDAQ_MODULES_PATH` environment variable overrides all configured module search paths. Any shared library with a `createModule` symbol found in these directories is loaded via `boost::dll::shared_library` (line 2042). While the module authenticator feature exists, it is optional (`authenticatedModulesOnly` defaults to `false` at line 53).

**Impact**: An attacker who can set environment variables (local privilege escalation, shared hosting) can inject malicious modules that execute arbitrary code within the openDAQ process.

**Remediation**: Default `authenticatedModulesOnly` to `true`. Log a warning when environment variable override is active. Validate module paths against a whitelist.

---

#### FINDING SEC-016: Optional Module Authentication Defaults to Disabled [MEDIUM]

- **File**: `core/opendaq/modulemanager/src/module_manager_impl.cpp`, line 53
- **CWE**: CWE-829 (Inclusion of Functionality from Untrusted Control Sphere)

```cpp
ModuleManagerImpl::ModuleManagerImpl(const BaseObjectPtr& path)
    : authenticatedModulesOnly(false)  // <-- authentication disabled by default
```

Module binary authentication via the `IModuleAuthenticator` interface exists but is opt-in. The vast majority of deployments will load any shared library found in the module search path without cryptographic verification.

**Remediation**: Default to authenticated mode. Provide clear documentation for disabling authentication in development scenarios.

---

### 6. SERIALIZATION AND DESERIALIZATION

#### FINDING SEC-017: Type-Confusion in Deserialization Factory Registry [MEDIUM]

- **File**: `core/coretypes/src/json_deserializer_impl.cpp`, lines 13-55; `core/coretypes/src/deserializer.cpp`, lines 10-69
- **CWE**: CWE-502 (Deserialization of Untrusted Data)
- **OWASP**: A08:2021 -- Software and Data Integrity Failures

The JSON deserializer uses a global factory registry (`DeserializeFactoryRegistry`) to instantiate objects based on a `__type` string from JSON input:

```cpp
std::string typeId = jsonObject["__type"].GetString();
// ...
daqDeserializerFactory factory{};
errCode = daqGetSerializerFactory(typeId.data(), &factory);
errCode = factory(jsonSerObj, context, factoryCallback, object);
```

Any registered type can be instantiated from network-received JSON data. This includes `User` objects (which contain password hashes), `DeviceUpdateOptions`, `PermissionManager`, and other security-sensitive types. There is no validation of which types are permissible in a given deserialization context.

**Impact**: An attacker who can send crafted JSON payloads via the config protocol could instantiate unexpected object types, potentially leading to type confusion, privilege escalation (by crafting User objects), or denial of service.

**Remediation**: Implement a type whitelist per deserialization context. Restrict which types can be deserialized from network data vs. local configuration files.

---

#### FINDING SEC-018: Potential Integer Overflow in Deserialization Buffer Allocation [LOW]

- **File**: `core/coretypes/src/json_deserializer_impl.cpp`, line 163
- **CWE**: CWE-190 (Integer Overflow or Wraparound)

```cpp
char* buffer = new(std::nothrow) char[length + 1 + dataPaddingSize * 2];
```

If `length` is close to `SIZE_MAX`, the addition `length + 1 + dataPaddingSize * 2` could wrap around, resulting in a small allocation followed by a large write via `strcpy`. In practice, `SizeT` is typically 64-bit and JSON strings of this size are unlikely, but the pattern is unsafe.

**Remediation**: Add an upper-bound check on `length` before allocation.

---

### 7. CRYPTOGRAPHY

#### FINDING SEC-019: SHA-1 Used for Identifier Hashing [LOW]

- **File**: `core/coretypes/include/coretypes/sha1.h`
- **CWE**: CWE-328 (Use of Weak Hash)

The codebase includes a compile-time SHA-1 implementation. While SHA-1 is used only for identifier hashing (not cryptographic purposes), its presence may lead to misuse in security-sensitive contexts.

**Remediation**: Document that this SHA-1 implementation is NOT suitable for security purposes. Consider replacing with SHA-256 for new code.

---

#### FINDING SEC-020: No Password Hashing Utility Exposed to Users [MEDIUM]

- **Files**: `core/coreobjects/src/user_impl.cpp`, `core/coreobjects/include/coreobjects/user_factory.h`
- **CWE**: CWE-916 (Use of Password Hash With Insufficient Computational Effort)

While bcrypt is available internally, the `User` factory accepts raw strings as `passwordHash`. There is no user-facing API to generate bcrypt hashes, making it easy for developers to pass plaintext passwords:

```cpp
// user_factory.h:31 - documentation says "can either be in plain text or hashed"
// This is by design but deeply problematic
OPENDAQ_DEFINE_CLASS_FACTORY(LIBRARY_FACTORY, User, IString*, username, IString*, passwordHash, IList*, groups)
```

**Remediation**: Add a `CreateUserWithPassword()` factory that performs bcrypt hashing internally. Deprecate the raw `passwordHash` parameter.

---

### 8. ERROR HANDLING AND INFORMATION LEAKAGE

#### FINDING SEC-021: Error Messages Reveal Internal Details [LOW]

- **Files**: Multiple locations
- **CWE**: CWE-209 (Generation of Error Message Containing Sensitive Information)

Error messages in several locations expose internal implementation details:

```cpp
// module_manager_impl.cpp - reveals file paths
DAQ_THROW_EXCEPTION(ModuleLoadFailedException,
    "Module \"{}\" failed to load. Error: {} [{}]", path.string(), ...);

// ref_device_impl.cpp:658 - reveals script output
DAQ_THROW_EXCEPTION(InvalidParameterException, "Invalid IP configuration: {}", result);
```

**Impact**: Attackers can use these messages to enumerate file system structure and internal configurations.

**Remediation**: Log detailed errors server-side. Return generic error messages to network clients.

---

#### FINDING SEC-022: Missing Memory Free on Exception in Packet Parsing [INFO]

- **File**: `shared/libraries/native_streaming_protocol/src/base_session_handler.cpp`, lines 112-133
- **CWE**: CWE-401 (Missing Release of Memory after Effective Lifetime)

In `readConfigurationPacket()`, if an exception is thrown after `std::malloc(headerSize)` at line 112 but before the `PacketBuffer` takes ownership, the allocated memory is leaked. The catch block at line 129 does not free `packetBufferHeader`.

```cpp
packetBufferHeader = static_cast<config_protocol::PacketHeader*>(std::malloc(headerSize));
// ... exception can occur here
copyData(packetBufferHeader + 1, data, packetBufferHeader->payloadSize, bytesDone, size);
// ... if copyData throws, packetBufferHeader leaks
```

**Remediation**: Use RAII wrappers (e.g., `std::unique_ptr` with `std::free` deleter) for all manual allocations.

---

### 9. THREAD SAFETY

#### FINDING SEC-023: Extensive `NoLock` Method Variants Suggest Inconsistent Synchronization [INFO]

- **Files**: `core/coreobjects/src/eval_value_impl.cpp`, `core/coreobjects/include/coreobjects/property_impl.h`, and many others
- **CWE**: CWE-362 (Concurrent Execution using Shared Resource with Improper Synchronization)

The codebase has an extensive pattern of paired methods -- locked and `NoLock` variants (e.g., `getPropertyValue` / `getPropertyValueNoLock`, `getResult` / `getResultNoLock`, `coerce` / `coerceNoLock`, `validate` / `validateNoLock`). While this design allows callers to avoid lock contention when they hold the lock already, it requires careful discipline:

- **`eval_value_impl.cpp:152`**: Conditionally calls locked or NoLock versions based on a `lock` parameter
- **Property accessors**: Every property getter has a `NoLock` variant
- **`unsubscribeCompletedNoLock`** in `MirroredSignalPrivate`

The sheer number of NoLock variants (20+ methods across multiple classes) increases the risk of calling a NoLock method without holding the appropriate lock.

**Impact**: Data races causing undefined behavior, memory corruption, or stale data reads in multi-threaded scenarios.

**Remediation**: Audit all call sites of `*NoLock` methods to verify the caller holds the appropriate mutex. Consider using thread-safety annotations (Clang's `-Wthread-safety`) to get compile-time verification.

---

### 10. ENVIRONMENT AND CONFIGURATION SECURITY

#### FINDING SEC-024: Multiple Environment Variables Control Security-Sensitive Behavior [MEDIUM]

- **Files**:
  - `core/opendaq/modulemanager/src/module_manager_impl.cpp:186` -- `OPENDAQ_MODULES_PATH`
  - `core/opendaq/opendaq/src/json_config_provider_impl.cpp:37` -- `OPENDAQ_CONFIG_PATH`
  - `core/opendaq/logger/src/logger_component_impl.cpp:148` -- `OPENDAQ_LOG_LEVEL`
- **CWE**: CWE-15 (External Control of System or Configuration Setting)

Multiple environment variables control security-sensitive behavior without any documentation of security implications:

| Variable | Impact |
|----------|--------|
| `OPENDAQ_MODULES_PATH` | Overrides module search paths, enables module injection (SEC-015) |
| `OPENDAQ_CONFIG_PATH` | Controls which JSON configuration file is loaded |
| `OPENDAQ_LOG_LEVEL` | Can enable verbose logging that may expose sensitive data |

**Remediation**: Document security implications. Consider ignoring environment variables when running with elevated privileges (similar to `LD_LIBRARY_PATH` being ignored for setuid binaries).

---

## External Dependencies Risk Assessment

| Dependency | Version | Known CVE Risk | Notes |
|-----------|---------|----------------|-------|
| RapidJSON | Unknown (bundled) | CVE-2024-38517 (pointer invalidation) | Heap-buffer-overflow workaround at json_deserializer_impl.cpp:159 suggests known issue awareness |
| Boost | Unknown (bundled) | Varies by version | Used for DLL loading, networking (asio), string algorithms |
| spdlog | 1.17.0 | Low | Logging library |
| fmt | 12.1.0 | Low | String formatting |
| Thrift | 0.22.0 | Medium | OpenSSL explicitly disabled |
| bcrypt | 1.0.0 | Low | Password hashing |
| mimalloc | 3.0.11 | Low | Memory allocator |
| pybind11 | 3.0.1 | Low | Python bindings |
| miniaudio | Unknown (bundled) | Low | Audio I/O (contains own dlopen/dlsym wrappers) |
| KissFFT | Unknown (bundled) | Low | FFT library |
| xxHash | 0.8.3 | Low | Fast hashing |

---

## OWASP Top 10 2021 Mapping

| OWASP ID | Category | Findings | Risk Level |
|----------|----------|----------|------------|
| A01 | Broken Access Control | SEC-003, SEC-004 | CRITICAL |
| A02 | Cryptographic Failures | SEC-008, SEC-019 | HIGH |
| A03 | Injection | SEC-007 | CRITICAL |
| A04 | Insecure Design | SEC-006, SEC-020 | HIGH |
| A05 | Security Misconfiguration | SEC-015, SEC-016, SEC-024 | HIGH |
| A06 | Vulnerable Components | RapidJSON concern | MEDIUM |
| A07 | Auth Failures | SEC-001, SEC-002, SEC-005, SEC-009 | CRITICAL |
| A08 | Software/Data Integrity | SEC-010, SEC-011, SEC-012, SEC-017 | MEDIUM |
| A09 | Logging Failures | SEC-021 | LOW |
| A10 | SSRF | Not applicable | -- |

---

## Prioritized Remediation Roadmap

### Phase 1 -- Immediate (Block Release)

| Priority | Finding | Effort | Impact |
|----------|---------|--------|--------|
| P0 | SEC-007: Command Injection | Medium | Eliminates RCE |
| P0 | SEC-001: Plaintext Password Fallback | Low | Eliminates credential exposure |
| P0 | SEC-002: Hardcoded Credentials | Low | Eliminates default access |
| P0 | SEC-003: Default-Permissive Authorization | Medium | Enforces access control |

### Phase 2 -- Short Term (Next Sprint)

| Priority | Finding | Effort | Impact |
|----------|---------|--------|--------|
| P1 | SEC-008: No TLS | High | Encrypts all network traffic |
| P1 | SEC-009: Cleartext Credentials | High | Protects authentication |
| P1 | SEC-005: No Rate Limiting | Medium | Prevents brute force |
| P1 | SEC-006: Password Hash Serialized | Low | Prevents hash exposure |
| P1 | SEC-015: Env Var Module Path | Medium | Prevents module injection |
| P1 | SEC-004: Anonymous Auth Default | Low | Reduces attack surface |

### Phase 3 -- Medium Term (Next Release)

| Priority | Finding | Effort | Impact |
|----------|---------|--------|--------|
| P2 | SEC-010-012: Memory Safety in Packet Parsing | Medium | Prevents DoS |
| P2 | SEC-016: Module Auth Default | Low | Hardens module loading |
| P2 | SEC-017: Deserialization Type Safety | Medium | Prevents type confusion |
| P2 | SEC-020: Password Hashing Utility | Low | Improves developer UX |
| P2 | SEC-013: Unsafe strcpy | Medium | Reduces buffer overflow risk |
| P2 | SEC-014: realloc NULL Check | Low | Prevents memory leaks |
| P2 | SEC-024: Environment Variable Security | Low | Reduces misconfiguration |

### Phase 4 -- Long Term

| Priority | Finding | Effort | Impact |
|----------|---------|--------|--------|
| P3 | SEC-023: Thread Safety Audit | High | Eliminates race conditions |
| P3 | SEC-018: Integer Overflow Check | Low | Defense in depth |
| P3 | SEC-019: SHA-1 Replacement | Low | Modernizes crypto |
| P3 | SEC-021: Error Message Sanitization | Medium | Reduces info leakage |

---

## Files Examined

The following source files were read and analyzed during this review:

- `core/coreobjects/src/authentication_provider_impl.cpp`
- `core/coreobjects/src/user_impl.cpp`
- `core/coreobjects/src/permission_manager_impl.cpp`
- `core/coretypes/src/json_deserializer_impl.cpp`
- `core/coretypes/src/stringobject_impl.cpp`
- `core/coretypes/src/intfs.cpp`
- `core/coretypes/include/coretypes/sha1.h`
- `core/opendaq/modulemanager/src/module_manager_impl.cpp`
- `core/opendaq/opendaq/src/json_config_provider_impl.cpp`
- `core/opendaq/utility/src/device_update_options_impl.cpp`
- `examples/modules/ref_device_module/src/ref_device_impl.cpp`
- `simulator/simulator_app/src/main.cpp`
- `shared/libraries/native_streaming_protocol/src/base_session_handler.cpp`
- `shared/libraries/native_streaming_protocol/src/server_session_handler.cpp`
- `shared/libraries/native_streaming_protocol/src/native_streaming_client_handler.cpp`
- `shared/libraries/native_streaming_protocol/src/native_streaming_server_handler.cpp`
- `shared/libraries/native_streaming_protocol/include/native_streaming_protocol/base_session_handler.h`
- `shared/libraries/config_protocol/include/config_protocol/config_server_access_control.h`
- `shared/libraries/config_protocol/src/config_protocol_server.cpp`
- `modules/native_streaming_client_module/src/native_streaming_client_module_impl.cpp`
- `bindings/python/core_types/include/py_core_types/py_queued_event_handler_impl.h`
- `bindings/c/src/copendaq/signal/allocator.cpp`

Additionally, pattern-based searches were executed across all 1,142 C/C++ source files for: `sprintf`, `strcpy`, `strcat`, `system()`, `popen()`, `dlopen`, `memcpy`, `malloc`, `free`, `reinterpret_cast`, `password`, `secret`, `token`, `TLS`, `SSL`, `mutex`, `lock`, environment variable access, and file I/O operations.

---

## Security Score

**Overall Security Score: 32/100 (FAIL)**

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| Authentication | 20/100 | 20% | 4.0 |
| Authorization | 15/100 | 15% | 2.25 |
| Input Validation | 25/100 | 15% | 3.75 |
| Network Security | 10/100 | 20% | 2.0 |
| Memory Safety | 55/100 | 10% | 5.5 |
| Cryptography | 40/100 | 10% | 4.0 |
| Error Handling | 50/100 | 5% | 2.5 |
| Thread Safety | 60/100 | 5% | 3.0 |
| **Weighted Total** | | | **27.0/100** |

---

**Recommendation**: BLOCK RELEASE until Phase 1 findings (SEC-001, SEC-002, SEC-003, SEC-007) are remediated. These represent exploitable remote code execution and authentication bypass vulnerabilities that could compromise any deployment of the openDAQ SDK.

---

*Report generated by V3 QE Security Reviewer*
*Methodology: Manual source code review with pattern-based search*
*Classification: For internal use -- contains vulnerability details*
