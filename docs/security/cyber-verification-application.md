# Anthropic Cyber Verification Program — Application Draft

**Applicant organization:** Agentic QE (AQE)
**Product:** Agentic QE Fleet — an open-source multi-agent quality-engineering platform
**Repository:** https://github.com/proffesor-for-testing/agentic-qe
**Application date:** 2026-04-17
**Prepared by:** AQE Team
**Submit via:** https://claude.com/form/cyber-use-case

> **Why this application exists**
> Opus 4.7 (released 2026-04-16) ships with real-time cybersecurity safeguards that may refuse legitimate security-engineering work. AQE's fleet includes four security-oriented agents whose core job is exactly this kind of work: `qe-pentest-validator`, `qe-security-scanner`, `qe-security-auditor`, `qe-security-reviewer`. Without enrollment in the Cyber Verification Program, these agents risk being blocked by 4.7's cyber-use-policy enforcement. Anthropic's enrollment program provides a usage policy that accommodates verified defensive security workflows.

---

## 1. Organization profile

- **Organization name:** Agentic QE (open-source project)
- **Primary contact:** Dragan Spiridonov
- **Secondary contact (technical):** Dragan Spiridonov
- **Country / jurisdiction:** Serbia
- **Organization type:** Open-source community project, no commercial entity; distributed via npm as `agentic-qe`
- **Website / repo:** https://github.com/proffesor-for-testing/agentic-qe
- **Existing Anthropic commercial relationship:** multiple
- **Number of end users:** > 20k

## 2. Use-case classification

**Category:** Defensive security engineering — test generation, vulnerability scanning, pentest result validation, security code review, compliance auditing. **All activities are on assets the user owns, controls, or is explicitly authorized to test.**

**Explicitly NOT in scope:**
- Offensive operations against third-party systems
- Mass targeting or credential harvesting
- Supply-chain compromise or detection-evasion tooling
- Any unauthorized access activity

## 3. Agents in scope and what they do

| Agent | Path | Responsibilities | Why 4.7's cyber safeguards may refuse |
|---|---|---|---|
| **qe-pentest-validator** | `.claude/agents/v3/qe-pentest-validator.md` | Validates security findings from SAST/DAST scans by attempting graduated exploit proofs-of-concept against the user's own application to eliminate false positives. "No Exploit, No Report" quality gate. | Requests to demonstrate exploitability (even of the user's own code) can trip cyber-abuse classifiers; the agent needs to author browser-based exploit chains, payload permutations, and PoC scripts against OWASP-class vulnerabilities. |
| **qe-security-scanner** | `.claude/agents/v3/qe-security-scanner.md` | Comprehensive SAST + DAST + dependency scanning + secrets detection on user-owned code. | Authoring and interpreting scanner output for XSS, SQLi, SSRF, deserialization, and auth-bypass patterns can read as offensive tooling to naive classifiers. |
| **qe-security-auditor** | `.claude/agents/v3/qe-security-auditor.md` | OWASP Top 10 coverage, compliance validation (SOC2/PCI-DSS/HIPAA/GDPR), CVE database lookup, remediation workflow generation. | Must reason about attack surfaces and threat models in depth; refusals on "show me the attack path for this CVE" defeat the agent's remediation workflow. |
| **qe-security-reviewer** | `.claude/agents/v3/qe-security-reviewer.md` | Security-focused code review — vulnerability detection, authn/authz review, secure-coding-practice enforcement on pull requests. | Identifying exploitable patterns in diffs requires describing the exploit; safety refusals block the reviewer from producing actionable findings. |

**Supporting data:** ADR-013 (Core Security Module), ADR-012 (MCP Security Features), ADR-058 (@claude-flow/guidance governance with 657 tests), ADR-063 (Enterprise Integration Testing including security controls). Combined test coverage across security-relevant modules: 2000+ tests.

## 4. Authorization model

AQE agents operate under one of the following authorization contexts — enforced by the fleet, not by end-user self-attestation:

1. **Local user authorization:** The end user runs AQE against code in their own local working directory or in CI on a repo they own (GitHub Actions / GitLab CI with repo scope).
2. **Organizational authorization:** Enterprise users configure AQE against repos/services they own per `.agentic-qe/config.yaml`; the governance middleware (ADR-058, `@claude-flow/guidance`) enforces scope at runtime.
3. **Pentest engagement authorization:** For `qe-pentest-validator` specifically, the agent requires an explicit `scope.yaml` manifest naming target hosts + authorization reference (engagement ID, customer authorization) before any exploit-validation work runs. Without the manifest, the agent exits.
4. **CTF / research mode:** Documented separately; off by default; requires `AQE_CTF_MODE=true` and a named target in an allow-list.

Violations of scope are blocked pre-flight by the governance layer, logged to the witness chain (ADR-070 SHAKE-256 + Ed25519 signing), and surfaced in the audit trail. The witness chain is cryptographically signed — tamper-evident.

## 5. Technical controls already in place

- **Scope manifest enforcement** (for `qe-pentest-validator`): Required `scope.yaml` with explicit authorization reference; agent exits without it.
- **Governance middleware** (ADR-058): 16 modules including ExecutionScopeEnforcer, CredentialRedactor, OutboundRequestFilter.
- **Secrets redaction pre-flight** (ADR-092): All transcripts passing through the advisor/multi-model pipeline are redacted before any third-party provider sees them. Security agents are pinned to direct Anthropic or self-hosted Ollama providers — OpenRouter explicitly excluded.
- **Cryptographic audit trail** (ADR-070): SHAKE-256 witness chain + Ed25519 signatures on all security-agent actions, persisted to `routing_outcomes` SQLite table and brain-exportable (ADR-073).
- **Hard circuit breakers** (ADR-092): 10-call-per-session cap on advisor consultations; separate caps on exploit-validation attempts in `qe-pentest-validator`.
- **Allow-list provider routing** for security agents: only `anthropic` (direct) and `ollama` (self-hosted) are permitted; enforced at `HybridRouter.chat()` provider-selection time.
- **Feature-flag gating:** All security-agent behaviors can be disabled per-agent via frontmatter or globally via env var.
- **Compliance test coverage:** 2000+ tests including 657 tests in the governance layer (ADR-058).

## 6. Data handling

- **No customer data leaves AQE's perimeter** beyond the LLM provider call itself. Transcripts are redacted pre-flight for secrets and PII before any non-self-hosted provider is invoked.
- **No vulnerability findings are shared externally** by AQE. Output is written to the user's local filesystem or CI artifact store.
- **No zero-day research is conducted** by the fleet. Agents work against known CVE classes and user-owned code.
- **Witness chain retention** is user-controlled; default retention is 90 days in `.agentic-qe/audit/`.

## 7. Abuse-prevention commitments

- AQE will publish the final list of in-scope agents and their authorization requirements in the public ADR index (`docs/implementation/adrs/v3-adrs.md`).
- AQE will route Anthropic-reported abuse signals to the primary and secondary contacts listed in §1 within one business day.
- AQE will cooperate with Anthropic's abuse-investigation process, including providing the signed witness-chain record of any disputed agent action.
- AQE will disable any agent feature that Anthropic identifies as creating material misuse risk, pending remediation.
- AQE will re-file this application or file an amendment if the scope of security agents materially expands beyond the four listed in §3.

## 8. Requested accommodations

1. **Usage-policy enrollment** for the four agents in §3 covering Opus 4.7 and any future Anthropic model with equivalent cyber safeguards.
2. **Coverage across all Anthropic surfaces** AQE users access: Claude API direct, Amazon Bedrock, Google Vertex AI, Microsoft Foundry, Claude Code, and Claude.ai subscriptions.
3. **Stable API contract** for Messages API + tool use with the cyber-verified usage policy — no beta header churn for AQE users.
4. **Direct Anthropic trust-and-safety contact** for escalation of false-positive refusals during the enrollment period.

## 9. Contacts

- Primary contact: Dragan Spiridonov
- Security / abuse contact: Dragan Spiridonov
- Technical lead: Dragan Spiridonov
- Legal contact (if applicable): Dragan Spiridonov

## 10. Attachments referenced

- ADR-013 Core Security Module for QE
- ADR-058 @claude-flow/guidance Governance Integration
- ADR-063 Enterprise Integration Testing Gap Closure
- ADR-070 Witness Chain Audit Compliance
- ADR-092 Provider-Agnostic Advisor Strategy
- ADR-093 Opus 4.7 Migration and Claude Code 2026-04 Feature Adoption (this ADR cycle)
- Agent frontmatter for `qe-pentest-validator`, `qe-security-scanner`, `qe-security-auditor`, `qe-security-reviewer`

---

## How to apply

1. **Fill in all `_[FILL IN]_` placeholders above** — organization contact info, country, existing Anthropic relationship, user count. Do not submit with placeholders.
2. **Review against the agent docs.** Open each of the four agent markdown files in `.claude/agents/v3/` and confirm the responsibility summaries in §3 still match what each agent does in the current codebase.
3. **Confirm technical-control claims.** For each item in §5, verify the referenced ADR is still marked "Implemented" in `docs/implementation/adrs/v3-adrs.md`. If any item is no longer accurate, strike it before submission — **do not submit claims that don't match the shipped code.**
4. **Convert to Anthropic's form format.** Open https://claude.com/form/cyber-use-case and paste the corresponding sections into the form fields. If the form asks for fields not covered here (e.g. SOC2 audit report, penetration-testing certifications, incident-response runbook), prepare those separately — Anthropic's form may request artifacts this draft does not include.
5. **Attach supporting evidence where the form allows.** Link to the public repo, the ADR index, and the witness-chain implementation (`src/security/witness-chain/` or equivalent).
6. **Record the submission reference number** in ADR-093's "Validation Criteria" checklist under item 5, so the application is tracked alongside the migration.
7. **Until approval is received**, Phase 4 of ADR-093 keeps security agents pinned to Sonnet 4.6 for any path that would otherwise escalate to Opus 4.7. Do not route security-agent work to 4.7 until Anthropic's acknowledgment is in hand.
8. **If a refusal occurs during the enrollment wait:** log the prompt, model ID, refusal text, and agent name; send the log to the Anthropic trust-and-safety contact requested in §8; do not retry the same prompt against a different model as a workaround — flag the refusal upstream instead.

## Review checklist before submission

- [ ] All `_[FILL IN]_` placeholders replaced
- [ ] Agent responsibility summaries (§3) verified against current `.claude/agents/v3/qe-*.md`
- [ ] All ADR references (§5) verified as "Implemented" in `v3-adrs.md`
- [ ] Abuse-prevention commitments (§7) signed off by organization decision-maker
- [ ] Submission reference number recorded in ADR-093
- [ ] Security agents confirmed pinned to Sonnet 4.6 until approval (ADR-093 Phase 4)
