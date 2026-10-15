# Dependency advisory scan (OSV)

AQE can check a project's npm dependencies against the
[OSV](https://osv.dev) advisory database. The scan is **opt-in** and reports
honestly when it could not check something: a failed or partial lookup is
never shown as "0 vulnerabilities" (issue #1049).

## Running it

| Surface | How |
|---|---|
| CLI | `aqe security --dependencies [-t <dir>] [-F json\|markdown\|sarif]` |
| MCP | `security_scan_comprehensive({ target: "<dir>", dependencies: true })` |

The scan reads `<dir>/package.json` (or the one in `AQE_PROJECT_ROOT`) and the
lockfile that governs it (next to it, or at the workspace root above it).

## Privacy

The dependency list (package **names and versions**) is sent to the OSV API
**only** when you pass `--dependencies` or `dependencies: true`. A default
`aqe security` run, a default `security_scan_comprehensive` call and the
background security-scan worker never contact OSV.

## Which versions are checked

Advisories can only be matched against a concrete version, so AQE never
guesses one from a range (checking `"<4.17.12"` as `4.17.12` would miss
advisories that affect the versions the range allows).

1. **Lockfile first, if it is in sync.** The version the lockfile resolved for
   each direct dependency is checked. Supported: `npm-shrinkwrap.json`,
   `package-lock.json` (v1–v3), `pnpm-lock.yaml`, `yarn.lock` (classic and
   berry). The lockfile is looked up from the package directory upwards —
   never above `AQE_PROJECT_ROOT` or the git root — so a workspace member uses
   the workspace root's lockfile. A lockfile that exists but cannot be read or
   parsed makes the scan **not complete** (it is never treated as "no lockfile").
   A lockfile **out of sync** with package.json is never trusted: when the
   spec it records differs from package.json, or its version does not satisfy
   the declared spec, the package is unchecked ("lockfile out of sync with
   package.json"). Re-run `npm install` / `pnpm install` and scan again.
2. **Exact specs.** Without a lockfile entry, only an exact version
   (`1.2.3`, `=1.2.3`, `v1.2.3`) is checked.
3. **Aliases** (`"x": "npm:lodash@4.17.11"`) are checked as the real package.
4. **Everything else is unchecked**, with a reason: ranges (`^`, `~`, `<`,
   `>`, `>=`, `||`, hyphen ranges, `x`/`*`), tags (`latest`), and remote
   sources (git, GitHub shorthand, URL and `file:` tarballs).

**Scope: direct dependencies only.** Transitive dependencies are not checked;
the CLI and MCP output say so (`dependencyScan.scope: 'direct'`).

### Workspaces and local packages

Local packages — `workspace:`, `link:`, `file:` directories, and workspace
members linked by the lockfile (npm `link: true`, pnpm `link:`) — are not OSV
subjects. They are listed in `localPackages` and do **not** make the scan
incomplete.

**Workspace member dependencies are not scanned yet**
([#1057](https://github.com/proffesor-for-testing/agentic-qe/issues/1057)).
A workspace root is a package.json whose `workspaces` is a non-empty array
(or an object with a non-empty `packages`), or a directory whose
`pnpm-workspace.yaml` declares `packages`. A `pnpm-workspace.yaml` that only
holds settings (pnpm 10+ writes `nodeLinker`, `onlyBuiltDependencies`, ... there
even for a single package), or has `packages: []`, does not make a workspace.
One that cannot be read or parsed, or is larger than 1 MB, counts as a
workspace root, so the scan is never wrongly complete. Scanning one checks only
the root's own dependencies and reports the scan as **incomplete**:
`resolutionErrors` says "workspace member dependencies are not scanned yet
(#1057); scan each member directory separately". The CLI exits 3, or 1 if the
root's own dependencies have high/critical findings. It is never reported as
clean.

To cover a monorepo, scan each member directory, for example
`aqe security --target packages/app --dependencies`. A member scanned directly
walks up to the workspace root's lockfile (never above `AQE_PROJECT_ROOT` or
the git root), and is complete when every dependency resolves; its findings
point at that member's `package.json`.

## Reading the result

`dependencyScan.status` (MCP) / the `Dependency advisories` check (CLI):

| Status | Meaning |
|---|---|
| `complete` | Every dependency was checked. The findings (or none) are a measurement. A `package.json` with no dependencies is `complete` with nothing to check. |
| `incomplete` | Some dependencies were checked — their findings are real — and the others are listed in `uncheckedPackages` with the reason. Not a clean result. |
| `failed` | No dependency could be checked (OSV unreachable, timeout, rate limit, server error, malformed reply, invalid endpoint setting). Dependency vulnerabilities are **unmeasured**, not zero. |

CLI exit codes: `0` everything complete with no medium+ findings, `1`
high/critical findings or another check failed, `2` medium findings only,
`3` **unmeasured** — dependency advisories could not be checked.

The stored scan record (`security:scan:<id>` in the `security-compliance`
namespace) carries `status`, `measured`, `uncheckedPackages`, `error` and
`lockfile`. The security-scan worker treats it as a measurement only when
`measured === true && status === 'complete'`; for a partial scan it relays
the checked packages' advisories and reports the dependency totals as
unmeasured.

## `AQE_OSV_API_URL`

Overrides the OSV endpoint (default `https://api.osv.dev`), e.g. for an
internal mirror or a test stub.

- Must be `https://…`. Plain `http://` is accepted **only** for loopback
  hosts — exactly `localhost`, an IPv4 literal in `127.0.0.0/8`, or `[::1]` —
  for local mirrors and tests. DNS names such as `127.evil.com` are not loopback.
- It is checked when a dependency scan runs, not at startup. An invalid value
  never affects other tools: only a requested dependency scan fails, with
  `status: failed` and an error naming `AQE_OSV_API_URL`.
- The mirror must implement OSV's `/v1/querybatch` and `/v1/vulns/{id}`.
