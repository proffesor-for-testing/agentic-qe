# MCP tool safety annotations

AQE includes the MCP `ToolAnnotations` hints in both the QE tool registry and
the protocol server's `tools/list` response. The supported hints are
`readOnlyHint`, `destructiveHint`, `idempotentHint`, and `openWorldHint`.

The built-in inventory only marks a tool read-only when that disposition is
clear. Unclassified tools receive conservative defaults: potentially
destructive, non-idempotent, and open-world. Explicit tool metadata can refine
those values for names in the reviewed inventory when the implementation has
stronger guarantees. Unknown, dynamic, and plugin-supplied names cannot
self-assert optimistic hints; they retain the conservative disposition until
added to the reviewed inventory.

These annotations are advisory metadata for client UX and confirmation
decisions. They never grant access or change execution behavior. Every call
continues to require the existing authorization, sandbox, input-validation, and
policy checks; clients must not use a hint to bypass any of those controls.
