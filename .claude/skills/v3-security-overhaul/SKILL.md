---
name: "v3-security-overhaul"
description: "Remediate critical CVEs, implement input validation with Zod, add path sanitization and safe command execution. Use when performing security overhaul or implementing secure-by-default patterns."
---

# V3 Security Overhaul

## Workflow

1. **Audit dependencies** — Run `npm audit` to identify vulnerable packages
2. **Fix critical CVEs** — Update dependencies, replace weak crypto, remove hardcoded secrets
3. **Implement validation** — Add Zod schemas at all input boundaries
4. **Add path sanitization** — Prevent directory traversal in file operations
5. **Secure execution** — Use `execFile` with `shell: false` for all subprocess calls
6. **Verify** — Run security scans to confirm score meets 90/100 target

## Quick Start

```bash
# Initialize V3 security domain (parallel)
Task("Security architecture", "Design v3 threat model and security boundaries", "v3-security-architect")
Task("CVE remediation", "Fix CVE-1, CVE-2, CVE-3 critical vulnerabilities", "security-auditor")
Task("Security testing", "Implement TDD London School security framework", "test-architect")
```

## Critical Security Fixes

### CVE-1: Vulnerable Dependencies
```bash
npm update @anthropic-ai/claude-code@^2.0.31
npm audit --audit-level high
```

### CVE-2: Weak Password Hashing
```typescript
// ❌ Old: SHA-256 with hardcoded salt
const hash = crypto.createHash('sha256').update(password + salt).digest('hex');

// ✅ New: bcrypt with 12 rounds
import bcrypt from 'bcrypt';
const hash = await bcrypt.hash(password, 12);
```

### CVE-3: Hardcoded Credentials
```typescript
// ✅ Generate secure random credentials
const apiKey = crypto.randomBytes(32).toString('hex');
```

## Security Patterns

### Input Validation (Zod)
```typescript
import { z } from 'zod';

const TaskSchema = z.object({
  taskId: z.string().uuid(),
  content: z.string().max(10000),
  agentType: z.enum(['security', 'core', 'integration'])
});
```

### Path Sanitization
```typescript
function securePath(userPath: string, allowedPrefix: string): string {
  const resolved = path.resolve(allowedPrefix, userPath);
  if (!resolved.startsWith(path.resolve(allowedPrefix))) {
    throw new SecurityError('Path traversal detected');
  }
  return resolved;
}
```

### Safe Command Execution
```typescript
import { execFile } from 'child_process';

// ✅ Safe: No shell interpretation
const { stdout } = await execFile('git', [userInput], { shell: false });
```

## Success Metrics

- **Security Score**: 90/100 (npm audit + custom scans)
- **CVE Resolution**: 100% of critical vulnerabilities fixed
- **Test Coverage**: >95% security-critical code
- **Implementation**: All secure patterns documented and tested

## Gotchas

- Always run `npm audit --audit-level high` after dependency updates to confirm no new vulnerabilities introduced
- bcrypt rounds of 12 add ~250ms per hash — acceptable for auth, too slow for bulk operations
- `execFile` with `shell: false` breaks commands that rely on shell features (pipes, globbing) — refactor those to use Node.js APIs

## Skill Composition

- **Security testing** — Use `/security-testing` for ongoing SAST/DAST integration
- **Pipeline gates** — Use `/cicd-pipeline-qe-orchestrator` for security gates in CI/CD
- **Risk assessment** — Use `/risk-based-testing` to prioritize security-critical code paths
