# ADR: Save the full accepted test-generation result

## Status

Accepted for implementation, pending exact-revision checks and independent review.

## Context

The CLI text renderer limits its preview to ten generated artifacts. It also writes files inside that same loop, so a successful generation of twelve accepted artifacts saves only ten. A real built CLI invocation with an isolated localhost provider fixture exits successfully, requests twelve responses and saves ten files. The fixture supplies deterministic valid code through the real router and provider; it does not establish model-inference quality.

## Decision

Write every accepted generated artifact before rendering the limited text preview. Preserve the ten-item preview and its remaining-item count. Preserve --no-save, which prints every generated artifact without writing test files, and leave explicit report formats unchanged.

## Scope and cost

This changes only the CLI text output/save boundary. The generator and MCP contracts are unchanged. Large successful batches now perform the requested writes for all artifacts; failures during a filesystem write retain the existing failure handling. This does not promise transactional writes or roll back files already written.

## Verification

A public Commander invocation uses the real generator, router, Ollama provider and a private localhost HTTP fixture. All twelve artifacts pass the real quality gate. Original code fails the missing-file regression; fixed code writes all twelve byte-identical outputs while displaying ten. The same batch under --no-save writes none and prints all code. Existing single-file, explicit-report and invalid-input controls remain. Built CLI verification, build, typecheck, scoped lint and broader regression results are retained privately before publication. No external model or production learning database is used.

The real built CLI changes from exit 0/twelve provider responses/ten saved files to exit 0/twelve responses/twelve saved files. The focused CLI family passes six tests and the existing real MCP stdio family passes three. Build, typecheck and production-file ESLint pass; repository ESLint’s configured TypeScript project excludes tests. The full npm test invocation stops with the same four task-handler failure identities seen in the prior candidate invocation; the unbailed original/fixed task-handler comparison has thirteen identical failures and fifty passing tests. Full-suite success is not claimed.
