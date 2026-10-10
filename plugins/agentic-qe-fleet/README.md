# agentic-qe-fleet

PACTS-based agentic quality engineering fleet for Claude Code. This is a slim starter bundle of the AQE platform. It has 11 specialized QE agents, 9 core skills, 9 slash commands, and the `agentic-qe` MCP server, pinned to the plugin version.

## Install

In one step (Claude Code 2.1.275 or later):

```
/plugin install agentic-qe-fleet --marketplace proffesor-for-testing/agentic-qe
```

Or add the marketplace first:

```
/plugin marketplace add proffesor-for-testing/agentic-qe
/plugin install agentic-qe-fleet@agentic-qe
```

The install registers the MCP server `plugin:agentic-qe-fleet:agentic-qe`, which runs `npx -y agentic-qe@<plugin version> mcp`. You don't need to run `claude mcp add`. Check it with `claude mcp list`.

### Options (`userConfig`)

Set these with `/plugin configure agentic-qe-fleet@agentic-qe`, or pass `--config KEY=VALUE` to `claude plugin install`. Every option has a default, so the server starts even if you leave them unset.

| Option | Sets | Default | Effect |
|---|---|---|---|
| `llm_provider` | `AQE_LLM_PROVIDER` | empty (auto) | Pins the LLM provider, e.g. `claude-code`, `claude`, `openrouter` or `ollama`. If it's empty, the provider comes from `llm-config.json` or env auto-detection. |
| `max_budget_usd` | `AQE_MAX_BUDGET_USD` | `0` (no cap) | Per-run spend cap for metered providers. |
| `memory_backend` | `AQE_MEMORY_BACKEND` | `hybrid` | `hybrid` saves learning to `.agentic-qe/memory.db`. `memory` is database-free mode: same features, but nothing is written under `.agentic-qe/`. |

## What's Included

### Agents (11)

Agents are routed by cognitive load: heavy reasoning runs on Opus, focused execution on Sonnet.

| Agent | Model | Purpose |
|---|---|---|
| `qe-test-architect` | opus | AI-powered test generation with sublinear optimization |
| `qe-fleet-commander` | opus | Fleet lifecycle and workload distribution |
| `qe-security-scanner` | opus | SAST/DAST/dependency/secrets scanning |
| `qe-chaos-engineer` | opus | Controlled fault injection and resilience testing |
| `qe-regression-analyzer` | opus | Intelligent test selection and change-impact scoring |
| `qe-requirements-validator` | opus | Testability analysis and BDD scenario generation |
| `qe-coverage-specialist` | sonnet | O(log n) sublinear coverage analysis with risk-weighted gap detection |
| `qe-flaky-hunter` | sonnet | Flaky test detection and auto-stabilization |
| `qe-performance-tester` | sonnet | Load, stress, endurance, regression detection |
| `qe-quality-gate` | sonnet | Quality gate enforcement with policy validation |
| `qe-tdd-specialist` | sonnet | Red-Green-Refactor (London + Chicago schools) |

### Skills (9)

Each skill has a trust tier and a scoped `allowed-tools` list with no wildcards.
- **Tier 3:** full eval infrastructure (eval YAML, JSON schema and validator).
- **Tier 2:** tested, but without an eval.

The bundle leaves out tier-1 (untested) skills, per AQE trust-tier policy.

| Skill | Trust tier | MCP tools |
|---|---|---|
| `qe-test-generation` | 3 | `test_generate_enhanced` |
| `qe-coverage-analysis` | 3 | `coverage_analyze_sublinear`, `qe_coverage_gaps` |
| `qe-test-execution` | 3 | `test_execute_parallel` |
| `qe-chaos-resilience` | 3 | `chaos_test` |
| `qe-quality-assessment` | 3 | `quality_assess` |
| `chaos-engineering-resilience` | 3 | — (methodology guide) |
| `mutation-testing` | 3 | — (Stryker integration) |
| `risk-based-testing` | 3 | — (read-only analysis) |
| `tdd-london-chicago` | 2 | — (TDD school comparison) |

**MCP tool names.** A server that comes from this plugin exposes its tools as `mcp__plugin_agentic-qe-fleet_agentic-qe__<tool>`. A project set up with `aqe init` registers the server under the name `agentic-qe`, which gives `mcp__agentic-qe__<tool>`. Each skill lists both forms in `allowed-tools`, so it works with either setup. See [ADR-0001](docs/adrs/0001-agentic-qe-fleet-contract.md).

### Commands (9)

`/aqe-analyze`, `/aqe-benchmark`, `/aqe-chaos`, `/aqe-costs`, `/aqe-execute`, `/aqe-fleet-status`, `/aqe-generate`, `/aqe-optimize`, `/aqe-report`

## Requires

- Node.js >= 22.13.0, with `npx` on `PATH`. The MCP server runs through `npx`.
- Network access the first time the server starts, so `npx` can fetch the pinned `agentic-qe` package. After that it uses the npm cache.
- No other plugin. The plugin ships its own MCP server.

## Compatibility

- **Versioning:** the plugin version always equals the `agentic-qe` npm package version, and `.mcp.json` pins the server to that exact version (`agentic-qe@<version>`, never `@latest`). The release flow bumps all of these together: `npm version` runs `scripts/sync-plugin-versions.cjs`.
- **Coexisting with `aqe init`:** a project that has both the plugin and `aqe init` runs two `agentic-qe` server processes, one under each name. Both work. To keep only one, disable the plugin in that project or remove `agentic-qe` from the project `.mcp.json`.
- **Verification:** `bash plugins/agentic-qe-fleet/scripts/smoke.sh` is the contract.

## Namespace coordination

The fleet uses the AQE memory namespaces below. They are database identifiers, not filesystem paths, and other plugins MUST NOT shadow them.

- `aqe/v3/domains/<domain>/*`: per-domain data, for example:
  - `aqe/v3/domains/test-generation/patterns/`
  - `aqe/v3/domains/coverage-analysis/metrics/`
  - `aqe/v3/domains/test-execution/flaky/`
  - `aqe/v3/domains/security-compliance/scans/`
- `aqe/v3/queen/*`: fleet coordination (`aqe/v3/queen/fleet/`, `aqe/v3/queen/tasks/`).

With `memory_backend=hybrid`, they persist to `.agentic-qe/memory.db` in the project. With `memory_backend=memory`, they last only for the server process.

## Test locally

```bash
claude --plugin-dir ./plugins/agentic-qe-fleet
```

Then run, for example, `/aqe-fleet-status`.

## Verification

```bash
claude plugin validate plugins/agentic-qe-fleet
bash plugins/agentic-qe-fleet/scripts/smoke.sh     # or: npm run plugin:smoke
# Expected: "PASS: agentic-qe-fleet contract holds"
node scripts/sync-plugin-versions.cjs --check      # plugin versions == package.json
```

## Architecture Decisions

- [`ADR-0001` — agentic-qe-fleet plugin contract (bundled pinned MCP server, version tracking, tool naming, userConfig, smoke as contract)](./docs/adrs/0001-agentic-qe-fleet-contract.md)

## As a mod (Claude Code >= 2.1.287)

The plugin ships a hooks module, `aqe-mod` (`hooks/hooks.json` -> `hooks/register.ts`), which loads with the plugin by default.

- **Learning-data guard (on by default).** It refuses Bash, Monitor, PowerShell, Write, Edit and NotebookEdit calls that would destroy AQE's learning data:
  - `rm`, `mv`, `cp`/`install`/`ln` over, `truncate`, `shred`, `dd`, `tee`, `gzip`, `sed -i` or a `>` redirect on `.agentic-qe/*.db` (and `-wal`, `-shm`, `*.rvf`)
  - `rm -rf .agentic-qe` (also as `.agentic*`), `find ... -delete/-exec` that can reach it, `git clean -x`
  - `sqlite3` with `DROP`, `DELETE FROM`, `TRUNCATE`, `ALTER TABLE ... DROP` or `.restore` on a store, and `.backup`/`.save`/`.output`/`.once` onto one
  - `node -e`, `python3 -c`, `perl`, `ruby` and similar scripts that name the data and delete, move or overwrite it
  - PowerShell `Remove-Item`, `Move-Item`, `Set-Content`, `Out-File` and similar on those files
  - Write/Edit on those files

  The guard reads commands the way the shell does. It follows `bash -c`/`-lc`, `eval`, heredocs, pipes (`find ... | xargs rm`), `$(...)`, keywords (`then`, `do`, `!`, `coproc`), brace expansion (`memory.db{,-wal}`), ANSI-C quoting (`$'\x2eagentic-qe'`), variables, `cd .agentic-qe` and `git -C`. It also refuses `find` that deletes `.agentic-qe` by name or path (unless `-prune`d or negated), and a directory copy that lands in it (`cp -r backup/.agentic-qe ./`, `rsync -a backup/ .agentic-qe/`). SQL is checked only in a `sqlite3` command, and code only in an interpreter command, so `grep -rn "DROP TABLE" src` next to `ls .agentic-qe` passes.

  These pass: reads and backups (`cp .agentic-qe/memory.db .agentic-qe/memory.db.bak-$(date +%s)`, `cp ... .agentic-qe/memory-backup-20261009.db`, `SELECT`, `PRAGMA integrity_check`, `.backup /tmp/x.db`, `sqlite3 -readonly`, `file:...?mode=ro`), copies *from* the store in scripts (`shutil.copy('.agentic-qe/memory.db', '/tmp/x.db')`: the destination decides), and `rm -rf .agentic-qe/tmp` or `rm .agentic-qe/*.log`. The guard only refuses and never loosens anything. Set the plugin option `guardMode` to `enforce` (default), `notify` or `off`.

  **When it cannot tell, it refuses.** The guard does not run the shell, so anything it cannot resolve counts as possibly the store:
  - An unset or unknown `$NAME`, `${...}` or `$@` in a path reads as `*` (`rm -f .agentic-qe/$DB_FILE` is refused). `${X:-word}` reads as `word` or `*`.
  - A `$(...)` or backtick reads as what its command may print. Naming the store (`rm "$(printf .agentic-qe)/memory.db"`) yields those paths. Listing files that may include it (`$(find . -name '*.db')`, `$(ls -A)`, `$(git ls-files -o)`), or printing something the guard cannot know (`$(cat list)`, `$(... | base64 -d)`), yields the store itself. Only known-harmless output (`$(date +%s)`, `$(pwd)`, `$(find . -name '*.tmp')`) reads as plain `*`. The same holds for `DB=$(...)`, `for f in $(...)`, `... | xargs rm` and `while read f; ... done < <(...)`. `bash -c` or `eval` of a script that is wholly an unknown expansion (`bash -c "$(... | base64 -d)"`, `eval "$CMD"`) is refused; `eval "$(ssh-agent -s)"` and similar shell-setup generators pass.
  - A glob may match anything it could match: bracket expressions with POSIX classes (`[[:alpha:]]`) match any character, an extglob group (`@(qe)`) reads as `*`, and after `shopt`/`GLOBIGNORE` on the line, `*` also matches dot names.
  - `find` that deletes from `.`, `..`, `~`, `$HOME` or any unresolved root is refused when it can reach a data file. An exclusion counts only in two forms, never with `-depth`: a branch that is exactly `-name .agentic-qe -prune` or `-path ./.agentic-qe[/*] -prune`, followed by `-o` and an `-exec` (never `-delete`: BSD find reads `-delete` as `-d`, which turns `-prune` off), or `-not -path './.agentic-qe/*'` as a condition of the deleting branch itself. Every `-exec` is read past wrappers (`-exec sudo rm`, `-exec git rm`). A shell's `-c` text is judged as if it ran on the store, a SQLite client on its SQL, and a copy only when the found file is its destination, so `-exec grep -l rm {} \;` and `-exec cp {} /tmp/backup/ \;` pass.
  - Past its read limits, text that names `.agentic-qe` is refused: brace expansion beyond 256 results, words over 2 KiB, or braces nested over 32 deep (each brace group reads as `*`); 256 expansions of one word; `$(...)` or `bash -c` nested deeper than the guard follows; scripts with more string literals than it reads.

  Decisions and limits:
  - **Refused in enforce mode on purpose:** the CLAUDE.md restore flow (`cp memory.db.bak-X .agentic-qe/memory.db`, then removing `-wal`/`-shm`). To restore, ask the user to run it, or set `guardMode` to `notify` or `off` for that step.
  - **Every `.agentic-qe` is protected, fixtures included:** `rm -rf /tmp/fixture/.agentic-qe` is refused in enforce mode. A hook cannot resolve globs (`/tmp/*/.agentic-qe`), `$`-expansions or symlinks (`/tmp/link` pointing at the project), so it cannot tell a throwaway fixture from a project that lives under a temp directory. To clean fixtures, set `guardMode` to `notify` or `off` for that step, or ask the user.
  - **Size and nesting limits:** a shell command over 256 KiB is refused unread, and text nested more than 8 `$(...)` deep is refused when it names `.agentic-qe`. If the guard itself fails or runs out of time on a call, that call is refused (enforce mode).
  - **SQL:** `DROP`, `DELETE FROM`, `TRUNCATE`, `ALTER ... DROP` and `UPDATE` (which can overwrite every row: `UPDATE ... SET content = NULL`) are refused against a store. `INSERT` passes. SQL the guard cannot read is refused too: `.read file`, `sqlite3 db < file.sql`, or a heredoc whose end is not in the command. `VACUUM INTO` a store, `sqlite-utils` commands that change a store, `litecli` without `-e`, and destructive SQL handed to any other client are refused. `sqlite3 -readonly` and `file:...?mode=ro` pass.
  - **Backup names:** a file whose name contains `backup` or a `.bak`/`-bak` part (`memory-backup-1.db`, `memory.bak.db`) is a copy, not the store. Tools may write and remove it.
  - **`git clean -x -e`:** an exclude passes only if it keeps every data file (`-e .agentic-qe`, or `-e '*.db*' -e '*.rvf'`). `-e '*.db'` alone still lets git delete `-wal`/`-shm`/`*.rvf`, so it is refused.
  - **PowerShell:** a pipeline whose earlier stage names the store or lists recursively from where it may be (`gci .agentic-qe *.db | ri`, `Get-ChildItem -Recurse -Filter *.db | Remove-Item`) is refused at the destroying stage. `Invoke-Expression`/`iex`, `& { ... }` script blocks and `Start-Process ... -ArgumentList` are read like the command they run, and `New-Item -Force` over a store is refused.
  - **What the guard cannot see:** a script file it is not shown (`python3 cleanup.py`, `make clean`, `npm run clean`), paths assembled at run time (`'.agentic' + '-qe'`), and symlinks pointing into `.agentic-qe`. `tar -x -C .agentic-qe` and `unzip -d .agentic-qe` are refused, but an archive extracted elsewhere that happens to contain `.agentic-qe` is not. It is a guard against mistakes, not a sandbox.
- **`/aqe-mod`**: `status`, `check <command>` (a dry run of the guard's verdict), `fleet` (the learning-data files present and the AQE MCP tools connected), `gate`. Anything only the AQE MCP server knows is reported as unknown, never estimated.
- **Console status.** Writes `.claude-flow/aqe-mod/status.json` (version 1: mode, calls, blocked, lastDenied) for the ruflo console's Mods section. When ruflo-mods is loaded, it also adds an `aqe` segment to ruflo's status bar.

Tests: `claude plugin test plugins/agentic-qe-fleet` and `bash plugins/agentic-qe-fleet/scripts/smoke-mod.sh`.
