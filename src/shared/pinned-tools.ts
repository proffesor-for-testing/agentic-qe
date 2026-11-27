/**
 * Exact versions of the third-party CLIs that AQE's skills, commands, agents and
 * generated files tell an agent to run (#1404).
 *
 * A floating dist-tag (latest, alpha, v3alpha, ...) or no version at all runs
 * whatever was published last, with the agent's privileges.
 * Every shipped or generated reference uses these exact versions instead;
 * tests/unit/packaging/no-floating-cli-versions-1404.test.ts enforces that, so a
 * bump is one edit here plus the matching sweep of the shipped markdown.
 *
 * `claude-flow` and `@claude-flow/cli` publish the same CLI as `ruflo`, so all
 * three are pinned as `ruflo@RUFLO_PINNED_VERSION`.
 */

export const RUFLO_PINNED_VERSION = '3.76.0';
export const AGENTDB_PINNED_VERSION = '3.3.0';
export const FLOW_NEXUS_PINNED_VERSION = '0.1.128';

export const RUFLO_PINNED_SPEC = `ruflo@${RUFLO_PINNED_VERSION}`;
