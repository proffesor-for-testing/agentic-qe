# AQE JIRA Integration Readiness Assessment

**Date**: 2026-02-11
**Branch**: feat/qcsd-cicd-swarm
**Readiness Score**: ~25% (Architecture Ready, Implementation Missing)

---

## What Exists Today

### 1. Skill-Level References (Design Intent, Not Implementation)

- **`qe-requirements-validation`** skill references `--source jira` as a CLI option and mentions `type: 'jira'` in example configs
- **`qe-defect-intelligence`** skill references `aqe defect learn --source jira` and `syncWithTracker({ source: 'jira' })`
- **CLI** (`v3/src/cli/commands/qe-tools.ts`) accepts `--format jira` as an input format option

### 2. Architectural Readiness (Anti-Corruption Layer Pattern)

The DDD architecture explicitly calls out anti-corruption layers for JIRA in both:

- **Requirements Validation domain** (`v3/implementation/ddd/requirements-validation.md`):
  > "uses adapters to import requirements from different systems (Jira, Linear, etc.) and normalize them to the `Requirement` interface"
- **Defect Intelligence domain** (`v3/implementation/ddd/defect-intelligence.md`):
  > "abstracts different bug tracking systems (Jira, GitHub Issues, Linear) through the `DefectInfo` interface"

The `DefectInfo` interface (`v3/src/domains/defect-intelligence/interfaces.ts`) is defined and generic enough:

```typescript
export interface DefectInfo {
  id: string;
  title: string;
  description: string;
  file?: string;
  tags?: string[];
}
```

### 3. n8n Integration Layer

n8n testing agents reference JIRA as a target integration node (n8n has a native JIRA node). Relevant files:
- `.claude/agents/n8n/n8n-workflow-executor.md`
- `.claude/agents/n8n/n8n-integration-test.md`
- `v2/src/agents/n8n/N8nIntegrationTestAgent.ts`

---

## What Does NOT Exist

| Gap | Impact |
|-----|--------|
| **No JIRA API client** | No `JiraClient`, no REST API calls, no auth handling |
| **No JIRA adapter implementations** | The anti-corruption layers are designed but not built |
| **No JIRA auth/config** | No OAuth, API token, or connection config |
| **No JIRA data mappers** | No code to map JIRA issue JSON to `DefectInfo` or `Requirement` |
| **No bidirectional sync** | No webhook handlers, no push-back of test results to JIRA |
| **No JIRA MCP tool** | No dedicated MCP tool for JIRA operations |

---

## Readiness by Layer

| Layer | Status |
|-------|--------|
| Domain interfaces | Ready — `DefectInfo`, `Requirement` are generic |
| DDD adapter pattern | Designed — anti-corruption layer documented |
| CLI surface | Partial — accepts `--format jira` but no backing code |
| Skill definitions | Partial — reference JIRA but skills are prompt-only |
| API client | Missing |
| Auth/config | Missing |
| Data mapping | Missing |
| Webhook/sync | Missing |
| Tests | Missing |

---

## What It Would Take

To achieve a working JIRA integration:

1. **JIRA adapter** in `v3/src/adapters/jira/` — API client using JIRA REST API v3, with OAuth 2.0 / API token auth
2. **Data mappers** — JIRA Issue to `DefectInfo`, JIRA Story/Epic to `Requirement`
3. **Config schema** — JIRA base URL, project key, auth credentials in `.agentic-qe/config.yaml`
4. **Bidirectional sync** (optional) — push test results / quality scores back as JIRA comments or custom fields
5. **n8n workflow templates** — leverage n8n's native JIRA node for event-driven automation

---

## Key Source Files Referenced

- `v3/src/domains/defect-intelligence/interfaces.ts` — DefectInfo interface
- `v3/src/cli/commands/qe-tools.ts` — CLI `--format jira` option
- `v3/implementation/ddd/requirements-validation.md` — Anti-corruption layer design
- `v3/implementation/ddd/defect-intelligence.md` — Anti-corruption layer design
- `.claude/skills/qe-requirements-validation/SKILL.md` — Skill references
- `.claude/skills/qe-defect-intelligence/SKILL.md` — Skill references
- `v3/src/domains/requirements-validation/qcsd-refinement-plugin.ts` — QCSD refinement plugin
