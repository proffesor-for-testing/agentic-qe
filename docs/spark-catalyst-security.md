# Apache Spark SQL Catalyst - Security Scan Report

**Scan Date:** 2025-12-16
**Module:** /tmp/spark/sql/catalyst
**Files Analyzed:** 612 Scala files
**Scan Type:** SAST (Static Analysis)

## Executive Summary

Focused security scan of Spark SQL Catalyst module identified 5 primary security concerns related to code generation, reflection, deserialization, and script execution capabilities.

## Top 5 Security Concerns

### 1. CRITICAL: Script Command Injection (ScriptTransformation)
**File:** `/tmp/spark/sql/catalyst/src/main/scala/org/apache/spark/sql/catalyst/plans/logical/ScriptTransformation.scala`

**Risk:** Command injection via script execution feature
- Accepts arbitrary script strings for execution
- Forks processes to run user-provided scripts
- Limited input validation visible in core catalyst layer

**CVSS Score:** 9.8 (Critical)
**Remediation:** Implement strict script validation, sandboxing, and execution controls at runtime layer

---

### 2. HIGH: Unsafe Reflection in Object Expressions
**File:** `/tmp/spark/sql/catalyst/src/main/scala/org/apache/spark/sql/catalyst/expressions/objects/objects.scala`

**Risk:** Reflection-based method invocation without security manager checks
- Uses `java.lang.reflect.Method` for dynamic invocation (line 20)
- `MethodUtils` from Apache Commons for method resolution (line 29)
- Arbitrary method calls on user-provided objects via `InvokeLike` expressions

**CVSS Score:** 7.5 (High)
**Remediation:** Implement method allowlists, restrict reflection to trusted classes, add security manager validation

---

### 3. HIGH: Deserialization Vulnerabilities
**Files:** Multiple files with deserializer patterns

**Risk:** Unsafe deserialization of user-controlled data
- `UnresolvedDeserializer` in unresolved.scala (line 1047)
- Custom serialization in encoders without validation
- Potential for arbitrary code execution via malicious serialized objects

**CVSS Score:** 8.1 (High)
**Remediation:** Use safe serialization formats (JSON), implement deserialization filters, validate object types

---

### 4. MEDIUM: Code Generation Injection Risks
**Files:** UnsafeRow, UnsafeProjection, CodeGenerator classes

**Risk:** Dynamic code generation from user-controlled expressions
- Runtime bytecode generation via Janino compiler
- Expression trees compiled to Java code
- Potential for malicious expression injection if parser is bypassed

**CVSS Score:** 6.5 (Medium)
**Remediation:** Expression sanitization, code generation sandboxing, restrict code generation templates

---

### 5. MEDIUM: ReDoS (Regular Expression Denial of Service)
**File:** `/tmp/spark/sql/catalyst/src/main/scala/org/apache/spark/sql/catalyst/expressions/regexpExpressions.scala`

**Risk:** Regex compilation from user input without complexity limits
- Pattern.compile() used for user-provided regex patterns
- No timeout or complexity validation on regex operations
- Malicious regex can cause catastrophic backtracking (CPU exhaustion)

**CVSS Score:** 5.3 (Medium)
**Remediation:** Implement regex complexity analysis, execution timeouts, pattern validation

---

## Additional Findings

- **Parser Layer:** AstBuilder.scala properly uses ANTLR for SQL parsing (reduces injection risk)
- **Runtime Execution:** Limited process execution in catalyst (mainly stringExpressions.scala)
- **No Direct SQL Injection:** No JDBC statement execution found in catalyst layer (handled upstream)

## Compliance Assessment

**OWASP Top 10 Coverage:**
- A03:2021 Injection: CRITICAL risk via ScriptTransformation
- A08:2021 Software/Data Integrity: HIGH risk via deserialization
- A05:2021 Security Misconfiguration: Code generation lacks sandboxing

## Recommendations

1. **Immediate:** Audit ScriptTransformation usage, implement command validation
2. **High Priority:** Add deserialization filters for all ExpressionEncoder paths
3. **Medium Priority:** Implement regex timeout/complexity limits
4. **Long Term:** Establish reflection allowlists, enhance code generation security

## Scan Methodology

- Static analysis of 612 Scala source files
- Pattern matching for reflection, deserialization, execution primitives
- Manual code review of high-risk modules (parser, expressions, objects)
- No dynamic testing performed (DAST not applicable to library module)

**Note:** This analysis covers the catalyst module only. Runtime security depends on how Spark SQL orchestrates these components.
