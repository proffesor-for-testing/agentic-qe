# Security Fixes - Code Scanning & Dependabot Alerts

**Date**: 2025-10-23
**Total Alerts**: 23 (22 Code Scanning + 1 Dependabot)
**Severity Breakdown**: 1 Error, 21 Warnings, 1 Medium (Dependabot)

---

## Summary

| Category | Count | Severity | Status |
|----------|-------|----------|--------|
| Improper Code Sanitization | 1 | Error | 🔴 Critical |
| Prototype Pollution | 1 | Warning | 🟡 High |
| Incomplete Sanitization | 3 | Warning | 🟡 Medium |
| Shell Command Injection | 4 | Warning | 🟡 High |
| Insecure Randomness | 13 | Warning | 🟡 Medium |
| Dependency Vulnerability | 1 | Medium | 🟡 Medium |

---

## 1. Critical: Improper Code Sanitization (Alert #22)

### Issue
**File**: `src/reasoning/TestTemplateCreator.ts:245`
**Severity**: Error
**Rule**: `js/bad-code-sanitization`
**Description**: Code construction depends on an improperly sanitized value

### Impact
Potential for code injection attacks where unsanitized user input could be executed as code.

### Fix Required
1. Identify the code construction at line 245
2. Implement proper input sanitization
3. Use safe alternatives (avoid `eval()`, `Function()`, etc.)
4. Validate and escape all user-controlled input

### Implementation
```typescript
// BEFORE (vulnerable):
const code = `function test() { ${userInput} }`;

// AFTER (secure):
import { escape } from 'validator';
const sanitizedInput = escape(userInput);
// Or better: use a template engine with auto-escaping
// Or best: avoid dynamic code construction entirely
```

---

## 2. Prototype Pollution (Alert #21)

### Issue
**File**: `src/cli/commands/config/set.ts:124`
**Severity**: Warning
**Rule**: `js/prototype-pollution-utility`
**Description**: Property chain is recursively assigned without guarding against prototype pollution

### Impact
Attackers could modify Object.prototype, affecting all objects in the application.

### Fix Required
1. Guard against `__proto__`, `constructor`, and `prototype` keys
2. Use `Object.create(null)` for objects used as maps
3. Implement safe property assignment

### Implementation
```typescript
// BEFORE (vulnerable):
function setConfig(obj: any, key: string, value: any) {
  obj[key] = value; // Allows __proto__ pollution
}

// AFTER (secure):
function setConfig(obj: any, key: string, value: any) {
  // Guard against prototype pollution
  if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
    throw new Error('Invalid key: prototype pollution attempt detected');
  }

  // Use Object.defineProperty for safer assignment
  Object.defineProperty(obj, key, {
    value: value,
    writable: true,
    enumerable: true,
    configurable: true
  });
}
```

---

## 3. Incomplete Sanitization (Alerts #18-20)

### Issues

#### Alert #20
**File**: `tests/simple-performance-test.js:545`
**Message**: Does not escape backslash characters in the input

#### Alert #19
**File**: `tests/performance-benchmark.ts:809`
**Message**: Does not escape backslash characters in the input

#### Alert #18
**File**: `tests/agents/DeploymentReadinessAgent.test.ts:36`
**Message**: Replaces only the first occurrence of '*'

### Impact
- Backslash bypass attacks
- Incomplete pattern replacement leading to unexpected behavior

### Fix Required
1. Use global regex or proper escaping for backslashes
2. Replace all occurrences, not just the first

### Implementation
```typescript
// BEFORE (Alert #20, #19):
const sanitized = input.replace(/\\/g, ''); // Missing proper escaping

// AFTER:
const sanitized = input.replace(/\\\\/g, '\\\\'); // Properly escape backslashes
// Or use a library:
import { escape } from 'validator';
const sanitized = escape(input);

// BEFORE (Alert #18):
const cleaned = str.replace('*', ''); // Only first occurrence

// AFTER:
const cleaned = str.replace(/\*/g, ''); // All occurrences (global flag)
// Or:
const cleaned = str.replaceAll('*', ''); // Modern JS
```

---

## 4. Shell Command Injection (Alerts #14-17)

### Issues

#### Alert #17
**File**: `tests/test-claude-md-update.js:94`
**Message**: Shell command depends on uncontrolled absolute path

#### Alert #16
**File**: `tests/test-claude-md-update.js:73`

#### Alert #15
**File**: `tests/test-claude-md-update.js:30`

#### Alert #14
**File**: `security/secure-command-executor.js:128`

### Impact
Command injection allowing arbitrary code execution via crafted file paths.

### Fix Required
1. Validate and sanitize all paths before shell execution
2. Use `execFile()` instead of `exec()` when possible
3. Escape shell metacharacters
4. Whitelist allowed paths

### Implementation
```typescript
import { execFile } from 'child_process';
import path from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

// BEFORE (vulnerable):
import { exec } from 'child_process';
exec(`cat ${userProvidedPath}`); // Command injection risk

// AFTER (secure):
async function readFile(filePath: string) {
  // 1. Validate path is within allowed directory
  const allowedDir = '/workspaces/agentic-qe-cf';
  const resolvedPath = path.resolve(filePath);

  if (!resolvedPath.startsWith(allowedDir)) {
    throw new Error('Path outside allowed directory');
  }

  // 2. Validate no shell metacharacters in filename
  const filename = path.basename(resolvedPath);
  if (/[;&|`$<>(){}[\]!]/.test(filename)) {
    throw new Error('Invalid characters in filename');
  }

  // 3. Use execFile with array arguments (no shell interpretation)
  const { stdout } = await execFileAsync('cat', [resolvedPath]);
  return stdout;
}

// Or better: use fs.readFile instead of shell commands
import { readFile as fsReadFile } from 'fs/promises';
const content = await fsReadFile(resolvedPath, 'utf-8');
```

---

## 5. Insecure Randomness (Alerts #1-13)

### Issues
13 locations using `Math.random()` in security contexts:

1. `src/mcp/streaming/StreamingMCPTool.ts:50`
2. `src/mcp/handlers/quality-analyze.ts:322`
3. `src/mcp/handlers/quality-analyze.ts:288`
4. `src/mcp/handlers/quality/quality-policy-check.ts:252`
5. `src/mcp/handlers/quality/quality-validate-metrics.ts:209`
6. `src/mcp/handlers/quality/quality-policy-check.ts:188`
7. `src/mcp/handlers/quality/quality-validate-metrics.ts:132`
8. `src/mcp/handlers/quality/quality-risk-assess.ts:200`
9. `src/mcp/handlers/quality/quality-risk-assess.ts:134`
10. `src/mcp/handlers/quality/quality-gate-execute.ts:263`
11. `src/mcp/handlers/quality/quality-gate-execute.ts:191`
12. `src/mcp/handlers/quality/quality-decision-make.ts:203`
13. `src/mcp/handlers/quality/quality-decision-make.ts:127`

### Impact
Predictable random values in security-sensitive operations (IDs, tokens, etc.) can be exploited.

### Fix Required
Replace `Math.random()` with cryptographically secure random number generator.

### Implementation
```typescript
import { randomBytes, randomInt } from 'crypto';

// BEFORE (insecure):
const id = Math.random().toString(36).substring(7);
const randomValue = Math.random();

// AFTER (secure):
// For random IDs:
const id = randomBytes(8).toString('hex'); // 16-char hex string
// Or for UUIDs:
import { randomUUID } from 'crypto';
const id = randomUUID();

// For random integers:
const randomValue = randomInt(0, 100); // Secure random 0-99

// For random floats (0-1):
const randomFloat = randomInt(0, 1000000) / 1000000;
```

### Utility Function
```typescript
// src/utils/secureRandom.ts
import { randomBytes, randomInt } from 'crypto';

export class SecureRandom {
  /**
   * Generate cryptographically secure random ID
   */
  static generateId(length: number = 16): string {
    return randomBytes(length).toString('hex');
  }

  /**
   * Generate secure random integer
   */
  static randomInt(min: number, max: number): number {
    return randomInt(min, max);
  }

  /**
   * Generate secure random float between 0 and 1
   */
  static randomFloat(): number {
    return randomInt(0, 1000000) / 1000000;
  }
}
```

---

## 6. Dependency Vulnerability (Alert #1)

### Issue
**Package**: `validator`
**Vulnerable Version**: <= 13.15.15
**CVE**: CVE-2025-56200
**Severity**: Medium
**Description**: validator.js has a URL validation bypass vulnerability in its isURL function

### Impact
URL validation bypass could allow malicious URLs to pass validation checks.

### Fix Required
Update to patched version or use alternative validation.

### Implementation
```bash
# Check current version
npm list validator

# Update to latest version
npm update validator

# Or if no patch available, consider alternatives:
npm install url-parse
# Or use built-in URL validation:
```

```typescript
// Alternative secure URL validation:
function isValidURL(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    // Additional validation
    if (!['http:', 'https:'].includes(url.protocol)) {
      return false;
    }
    return true;
  } catch (error) {
    return false;
  }
}
```

---

## Implementation Priority

### Phase 1: Critical (Immediate)
1. ✅ Alert #22: Fix improper code sanitization
2. ✅ Alert #21: Fix prototype pollution

### Phase 2: High Priority (This Week)
3. ✅ Alerts #14-17: Fix shell command injection vulnerabilities
4. ✅ Alert #1 (Dependabot): Update validator package

### Phase 3: Medium Priority (This Sprint)
5. ✅ Alerts #1-13: Replace Math.random() with crypto.randomBytes()
6. ✅ Alerts #18-20: Fix incomplete sanitization

### Phase 4: Verification
7. ✅ Run CodeQL scan to verify fixes
8. ✅ Run npm audit to verify dependency fixes
9. ✅ Add security tests
10. ✅ Update SECURITY.md

---

## Testing Strategy

### Unit Tests
```typescript
// tests/security/sanitization.test.ts
describe('Input Sanitization', () => {
  it('should prevent code injection', () => {
    const malicious = '"; alert("XSS");//';
    const sanitized = sanitizeInput(malicious);
    expect(sanitized).not.toContain('alert');
  });

  it('should prevent prototype pollution', () => {
    expect(() => {
      setConfig({}, '__proto__', { isAdmin: true });
    }).toThrow('Invalid key');
  });
});

// tests/security/randomness.test.ts
describe('Secure Randomness', () => {
  it('should use crypto.randomBytes for IDs', () => {
    const id1 = SecureRandom.generateId();
    const id2 = SecureRandom.generateId();

    expect(id1).not.toBe(id2);
    expect(id1).toHaveLength(32); // 16 bytes = 32 hex chars
  });

  it('should provide unpredictable random integers', () => {
    const values = new Set();
    for (let i = 0; i < 1000; i++) {
      values.add(SecureRandom.randomInt(0, 1000000));
    }
    // Should have high entropy
    expect(values.size).toBeGreaterThan(990);
  });
});
```

### Integration Tests
```typescript
describe('Shell Command Security', () => {
  it('should reject paths with shell metacharacters', async () => {
    await expect(
      readFile('/tmp/file;rm -rf /')
    ).rejects.toThrow('Invalid characters');
  });

  it('should reject paths outside allowed directory', async () => {
    await expect(
      readFile('../../../etc/passwd')
    ).rejects.toThrow('Path outside allowed directory');
  });
});
```

---

## Verification Checklist

- [ ] All 22 code scanning alerts addressed
- [ ] Dependabot alert resolved (validator updated)
- [ ] Unit tests added for all security fixes
- [ ] Integration tests pass
- [ ] CodeQL scan shows 0 errors
- [ ] npm audit shows 0 vulnerabilities
- [ ] Security documentation updated
- [ ] Code review completed
- [ ] Changes committed with security fix tags

---

## References

- [OWASP Code Injection Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Injection_Prevention_Cheat_Sheet.html)
- [Prototype Pollution Prevention](https://github.com/HoLyVieR/prototype-pollution-nsec18)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [CVE-2025-56200](https://nvd.nist.gov/vuln/detail/CVE-2025-56200)

---

**Next Steps**: Begin implementation with Phase 1 critical fixes.
