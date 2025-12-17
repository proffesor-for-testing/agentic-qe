# Apache Spark Core Security Scan Report

**Scan Date**: 2025-12-16
**Scope**: /tmp/spark/core module only
**Severity Scale**: CRITICAL > HIGH > MEDIUM > LOW

---

## Executive Summary

Scanned Apache Spark core module for security vulnerabilities. Identified 5 key security concerns related to command execution, deserialization, and environment variable handling.

---

## Top 5 Security Concerns

### 1. Command Injection Risk - PipedRDD.scala (HIGH)
**File**: `/tmp/spark/core/src/main/scala/org/apache/spark/rdd/PipedRDD.scala:69`
**Issue**: Uses `ProcessBuilder` with user-supplied commands and environment variables without sanitization.
**Code**:
```scala
val pb = new ProcessBuilder(command.asJava)
val currentEnvVars = pb.environment()
envVars.foreach { case (variable, value) => currentEnvVars.put(variable, value) }
```
**Risk**: Arbitrary command execution if attacker controls command parameters or envVars.
**Remediation**: Validate/sanitize command inputs, use allowlist for allowed commands.

---

### 2. Unsafe Deserialization Patterns (MEDIUM-HIGH)
**Files**: 15+ files including `SerializableConfiguration.scala`, `SerializableBuffer.scala`
**Issue**: Custom `readObject()` implementations without validation.
**Example**: `/tmp/spark/core/src/main/scala/org/apache/spark/util/SerializableConfiguration.scala:39`
```scala
private def readObject(in: ObjectInputStream): Unit = {
  value = new Configuration(false)
  value.readFields(in)
}
```
**Risk**: Deserialization attacks if untrusted data reaches these paths.
**Remediation**: Add deserialization filters, validate object types before instantiation.

---

### 3. Multiple ProcessBuilder Usage (MEDIUM)
**Affected Files**:
- `PythonWorkerFactory.scala:224, 301`
- `BaseRRunner.scala:302`
- `PythonRunner.scala:85`
- `RRunner.scala:90`

**Issue**: 14+ ProcessBuilder instances launching external Python/R processes.
**Risk**: Command injection if user-controlled input reaches pythonExec or rCommand parameters.
**Remediation**: Validate executable paths against allowlist, restrict to known-safe binaries.

---

### 4. Environment Variable Exposure (LOW-MEDIUM)
**File**: `PipedRDD.scala:72-78`
**Issue**: Passes Hadoop environment variables directly to external processes.
```scala
case hadoopSplit: HadoopPartition =>
  currentEnvVars.putAll(hadoopSplit.getPipeEnvVars().asJava)
```
**Risk**: Sensitive information leakage to external processes.
**Remediation**: Filter sensitive environment variables before passing to external commands.

---

### 5. No Hardcoded Secrets Found (COMPLIANT)
**Status**: No critical hardcoded credentials detected in source code.
**Note**: Found configuration key constants (e.g., "password", "secret") but no actual secrets.
**Verification**: Grep patterns for `password|secret|key|token` returned only constant names, not values.

---

## Recommendations

1. **Immediate**: Add input validation for PipedRDD command parameters
2. **Short-term**: Implement deserialization filters for all custom readObject() methods
3. **Medium-term**: Audit all ProcessBuilder usage for command injection vectors
4. **Long-term**: Implement security policy layer for external process execution

---

## Scan Methodology

- Pattern matching for credentials, secrets, API keys
- Deserialization pattern analysis (ObjectInputStream usage)
- Command execution risk assessment (ProcessBuilder, Runtime.exec)
- Environment variable handling review

**Tools**: grep, pattern analysis, static code review
**Coverage**: /tmp/spark/core source files (Scala)
