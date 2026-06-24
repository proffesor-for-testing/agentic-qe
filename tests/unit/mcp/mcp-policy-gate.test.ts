/**
 * MCP policy gate — drift guard (plan 05 / A1).
 *
 * Ensures `.harness/mcp-policy.json` (the declarative governance snapshot + CI
 * gate input) stays faithful to the ENFORCED scoping in src/mcp/tool-scoping.ts.
 * If a role's allowlist changes in code but not the policy (or vice-versa), this
 * fails — so the governance artifact can't silently drift from enforcement.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ALL_AGENT_ROLES, getAllowedTools, isToolAllowed } from '../../../src/mcp/tool-scoping';

const policy = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../../.harness/mcp-policy.json'), 'utf8'),
) as { defaultDeny: boolean; allowShell: boolean; roles: Record<string, string[] | 'allowAll'> };

describe('MCP policy gate — declarative posture', () => {
  it('should declare a default-deny, no-shell posture', () => {
    expect(policy.defaultDeny).toBe(true);
    expect(policy.allowShell).toBe(false);
  });
});

describe('MCP policy gate — policy ↔ tool-scoping sync', () => {
  it('should cover every agent role with no extras', () => {
    expect(Object.keys(policy.roles).sort()).toEqual([...ALL_AGENT_ROLES].sort());
  });

  for (const role of ALL_AGENT_ROLES) {
    it(`should mirror enforcement for role "${role}"`, () => {
      const enforced = getAllowedTools(role); // string[] | 'all'
      const declared = policy.roles[role];
      if (enforced === 'all') {
        expect(declared).toBe('allowAll');
      } else {
        expect(declared).toEqual(enforced);
      }
    });
  }
});

describe('MCP policy gate — enforcement is genuinely default-deny', () => {
  it('should deny an unknown tool for a scoped (non-admin) role', () => {
    expect(isToolAllowed('test-generator', 'some_unlisted_tool')).toBe(false);
  });

  it('should allow only listed tools for a scoped role', () => {
    expect(isToolAllowed('contract-validator', 'contract_validate')).toBe(true);
    expect(isToolAllowed('contract-validator', 'security_scan_comprehensive')).toBe(false);
  });
});
