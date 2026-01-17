# AI & Agentic Security Best Practices

*Version: 1.0*  
*Date: YYYY-MM-DD*

---

## 1. Purpose

This document captures best practices, research, and control frameworks for securing AI agents, especially multi-agent or autonomous agentic systems. It aims to serve as a reference for Agentic QE – Security: to guide policy, testing, threat modeling, audits, and release gates.

---

## 2. Key Frameworks & Taxonomies

| Framework / Taxonomy | Description | Key Components / Relevance to agentic systems |
|---|---|---|
| **OWASP Top 10 for LLM / GenAI / LLM Applications** | A list of the top security risks for LLM & GenAI applications, updated in 2024-25.  [oai_citation:0‡OWASP Gen AI Security Project](https://genai.owasp.org/llm-top-10/?utm_source=chatgpt.com) | Includes prompt injection, insecure output handling, training data poisoning, model DoS, supply chain vulnerabilities, sensitive info disclosure, insecure plugin design, excessive agency, etc. Very relevant for agent behavior, tool usage, memory, outputs.  [oai_citation:1‡Cloudflare](https://www.cloudflare.com/learning/ai/owasp-top-10-risks-for-llms/?utm_source=chatgpt.com) |
| **Google’s Secure AI Framework (SAIF)** | A practitioner-guide that maps risks to controls; includes data, infrastructure, model, application, assurance, governance domains.  [oai_citation:2‡SAIF: Secure AI Framework](https://saif.google/?utm_source=chatgpt.com) | Useful for designing control catalogs; helps align testing/evidence to risk domains; helps enforce “secure by default”. |
| **Recent Academic Research** | Benchmarks, threat modeling extensions, etc. for agent-based security. | *Agent Security Bench (ASB)*: formalizes attack & defense scenarios for LLM-based agents; shows vulnerabilities in system prompt, user prompt, memory, tools.  [oai_citation:3‡arXiv](https://arxiv.org/abs/2410.02644?utm_source=chatgpt.com) <br> *Extending OWASP Multi-Agentic System Threat Modeling Guide*: adds risk classes like reasoning collapse, unsafe delegation escalation, cross-agent hallucination propagation.  [oai_citation:4‡arXiv](https://arxiv.org/abs/2508.09815?utm_source=chatgpt.com) <br> *Using LLMs to improve SAST false positive detection* etc.  [oai_citation:5‡arXiv](https://arxiv.org/abs/2506.16899?utm_source=chatgpt.com) |

---

## 3. Threats / Attack Surface for Agentic Systems

Here are the primary risks you should explicitly consider in Agentic QE:

- **Prompt Injection** (direct & indirect) — including cases where external content (retrieval, browser, PDF, websites) injects instructions.  
- **Insecure Output Handling** — outputs that go into code interpreters, system commands, URLs, DBs without sanitization.  
- **Data / Model Poisoning** — in training, fine-tuning, or memory; risk of backdoors.  
- **Supply Chain Vulnerabilities** — third-party models, adapters, plugins, tools, hosting.  
- **Model Denial of Service (DoS) / Cost DoS** — adversarial or usage patterns that blow up cost or degrade performance.  
- **Sensitive Information Disclosure** — leaking PII, credentials, internal prompts.  
- **Excessive Agency / Over-Permissioning** — agents having too much power; lack of human in loop.  
- **Reasoning Collapse / Emergent Behavior** — failure when chained agents degrade or miscoordinate.  
- **System Prompt Leakage** — leaking system or internal configuration instructions.  
- **Vector / Embedding Weaknesses, RAG Vulns** — misuse or attacks over embeddings, retrieval, context injection.

---

## 4. Control & Best Practice Guidelines

Below are recommended controls and practices. These should be built into your development, test, deployment, and operations pipeline.

### Governance & Policy

- Maintain a threat model (e.g. based on MITRE ATLAS + OWASP MAS guide) per agent flow.  
- Define autonomy levels for agents; require human oversight / review for high-risk actions.  
- Supplier risk / model provenance: catalog all third-party models, plugins, datasets, with signatures, versioning, license checks.  
- Data governance: ensure training/fine-tuning data is curated, cleaned; private data is anonymized or abstracted.  

### Secure-by-Design Implementation

- Enforce least privilege / minimal permissions for tools or actions the agent can take.  
- Separate untrusted input content; guard external sources (RAG sources, web, files) with sanitization.  
- System prompt hygiene: avoid embedding secrets in system prompts; externalize guards.  
- Output filtering / sanitization before any dangerous downstream action.  

### Testing & Red-teaming

- Build test suites around prompt injection (direct/indirect), memory poisoning, tool misuse, chain / planning failures.  
- Use benchmarks like Agent Security Bench (ASB) to evaluate agent robustness.  [oai_citation:6‡arXiv](https://arxiv.org/abs/2410.02644?utm_source=chatgpt.com)  
- Include adversarial examples & automated fuzzing of tool inputs, prompt contents, embeddings.  
- Monitor emergent behaviors & safety over multi-agent or multi-step flows.

### Deployment & Operations

- Logging: full trace of prompts, system/user prompts, tool invocations, memory reads/writes, guardrail triggers.  
- Monitoring / alerts on anomalous patterns (unexpected tool usage, drift, high failure or cost).  
- Versioning and rollback plans for models, prompts, agent workflows.  
- Post-release evaluation & incident response: capture misuse/failure cases; feed back into threat model & test suite.

---

## 5. Mapping Controls → QE / Release Gates

Here’s a suggested mapping of control categories to tests, metrics, and gates in the QE process.

| Stage | What to Test / Verify | Gate Criteria / Metric |
|---|---|---|
| **Before promotion to production** | — Prompt injection resistance tests (direct & indirect) <br> — Output safety tests (for SQL/shell/HTTP etc.) <br> — Model & data provenance check <br> — Plugin / tool permissions review <br> — Autonomy level assessment | e.g. Attack success rate ≤ X% <br> No unresolved high severity prompt-based escape vulnerabilties <br> All third-party components signed & approved <br> Human oversight enabled where required |
| **In CI / Pre-merge** | Unit-style tests for guardrails; check output sanitization; verify minimal tool scopes; simulate cost/usage DoS; test memory poisoning / retrieval errors | Fail build if critical risk threshold exceeded; code review checklists for agentic flows includes security items |
| **Post-deployment / Monitoring** | Real-time logging; feedback loops; drift detection; emergent behavior detection in multi-agent settings; cost anomaly alerts | Defined SLIs/SLOs for abnormal pattern detection; incident reporting; periodic red-team evaluation reports |

---

## 6. Research & Benchmarks to Track

Here are relevant recent works to follow / incorporate:

- **Agent Security Bench (ASB)** — for formalizing & benchmarking attacks/defenses in agent-based systems.  [oai_citation:7‡arXiv](https://arxiv.org/abs/2410.02644?utm_source=chatgpt.com)  
- **Extending OWASP Multi-Agentic System Threat Modeling Guide** — for new threat classes in multi-agent deployments.  [oai_citation:8‡arXiv](https://arxiv.org/abs/2508.09815?utm_source=chatgpt.com)  
- **Using LLMs to improve SAST analyses** (false positives reduction) — shows LLMs can help QE itself.  [oai_citation:9‡arXiv](https://arxiv.org/abs/2506.16899?utm_source=chatgpt.com)  

---

## 7. Integration Suggestions for Agentic QE – Security

This section describes how to operationalize the above in your project.

- Maintain a **security spec document** per agentic system / flow, referencing OWASP Top 10 + SAIF risks, and listing which controls you’ve implemented & testing status.  
- Create **automated test harnesses** for prompt injection, tool misuse, memory retrieval attacks. Hook these into CI; define threshold for failures.  
- Require **Datasheet / Model Card** + supplier attestations for any model or plugin before roll-out.  
- Define autonomy levels (e.g. read/write/check/execute) and attach policy gating: if agent wants to execute something outside low-risk category → require human review.  
- Use benchmarking tools (e.g. ASB) to measure attack surface & validate mitigations.  

---

## 8. Glossary

| Term | Meaning |
|---|---|
| **Agentic / Multi-agent system** | A system composed of agents with planning, tools, memory, possibly interacting among themselves and with external sources. |
| **Prompt Injection** | Attack where inputs (directly or indirectly) alter the agent’s behavior or internal instructions. |
| **RAG (Retrieval-Augmented Generation)** | Using external documents / memory / embeddings to inform outputs; a frequent contributor to injection / leakage risks. |
| **Datasheet / Model Card** | Documentation for model/dataset covering source, training data, risks, limitations, versioning, licensing. |

---

## 9. References

- OWASP Top 10 for LLM Applications (2024-25).  [oai_citation:10‡OWASP Foundation](https://owasp.org/www-project-top-10-for-large-language-model-applications/?utm_source=chatgpt.com)  
- Google Secure AI Framework (SAIF).  [oai_citation:11‡SAIF: Secure AI Framework](https://saif.google/?utm_source=chatgpt.com)  
- Agent Security Bench (ASB) (2024).  [oai_citation:12‡arXiv](https://arxiv.org/abs/2410.02644?utm_source=chatgpt.com)  
- Extending OWASP Multi-Agentic System Threat Modeling Guide (2025).  [oai_citation:13‡arXiv](https://arxiv.org/abs/2508.09815?utm_source=chatgpt.com)  
- Using LLMs for SAST false positive detection.  [oai_citation:14‡arXiv](https://arxiv.org/abs/2506.16899?utm_source=chatgpt.com)  

---

## 10. Next Steps

1. Store this document in project repo; update at least quarterly.  
2. Build baseline threat models & test suites for current agent flows; identify where gaps are vs. this spec.  
3. Automate metrics & gates as part of CI/CD.  
4. Assign ownership of model / plugin supply chain, autonomy gating, incident logging.  
5. Review new research (e.g. ASB, MAS Threat Modeling, updated OWASP Top 10) continuously and feed into this spec.

---

*End of document*